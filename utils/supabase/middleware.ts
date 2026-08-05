import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// Routes that require an authenticated user at the edge. The admin *role* is
// additionally enforced in app/admin/layout.tsx — this list only answers
// "is anyone signed in at all?".
const PROTECTED_PREFIXES = [
  "/protected",
  "/booking-detail",
  "/admin",
  "/streamer-dashboard",
  "/client-bookings",
  "/settings",
  "/messages",
  "/notifications",
];

const isProtectedPath = (pathname: string) =>
  PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

// Bounce to /sign-in, remembering where the user was headed so they land back
// there after authenticating. Includes the query string so deep links (e.g.
// /messages?conversation=123) survive the round trip; the sign-in page forwards
// it as the `redirect_to` form field and the server action validates it.
const redirectToSignIn = (request: NextRequest) => {
  const redirectUrl = new URL("/sign-in", request.url);
  redirectUrl.searchParams.set(
    "redirect_to",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(redirectUrl);
};

export const updateSession = async (request: NextRequest) => {
  const pathname = request.nextUrl.pathname;
  const isProtectedRoute = isProtectedPath(pathname);

  try {
    let response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            response.cookies.set(name, value, options);
          },
          remove(name: string, options: any) {
            response.cookies.set(name, '', { ...options, maxAge: 0 });
          },
        },
      }
    );

    // getUser() — not getSession() — is what the gating decision must be based
    // on. getSession() only decodes whatever JWT is sitting in the cookie and
    // reports it as-is, so a tampered or revoked cookie would still read as
    // "signed in" here. getUser() round-trips to the auth server to validate
    // the token, and refreshes an expired session as a side effect, writing the
    // rotated cookies onto `response` via the setter above — so session refresh
    // behaviour is preserved.
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    // "No session at all" is the ordinary signed-out path, not a fault, so it
    // is handled by the `!user` check below rather than logged as an error.
    const isMissingSession = userError?.name === "AuthSessionMissingError";

    if (userError && !isMissingSession) {
      console.error("Middleware auth error:", userError);

      // FAIL CLOSED. Previously any failure here (Supabase outage, DNS blip,
      // expired anon key) fell through to NextResponse.next(), which silently
      // ungated /admin, /settings, /messages and every other protected route.
      // If we cannot prove who the caller is, a protected route must not
      // render. Public routes are unaffected and still pass through.
      if (isProtectedRoute) {
        return redirectToSignIn(request);
      }
    }

    // NOTE: exclude /auth/callback — it must run the code exchange even for an
    // already-authenticated user (e.g. a password-recovery link). Without this,
    // the "already signed in -> /protected" redirect below would skip it.
    const isAuthRoute =
      pathname.startsWith('/auth') && !pathname.startsWith('/auth/callback');

    if (isProtectedRoute && !user) {
      return redirectToSignIn(request);
    }

    // Redirect from auth pages if already authenticated
    if (isAuthRoute && user) {
      return NextResponse.redirect(new URL('/protected', request.url));
    }

    return response;
  } catch (e) {
    console.error('Middleware error:', e);

    // Same fail-closed rule for anything thrown outside the auth call itself
    // (misconfigured env vars, cookie parsing, a breaking @supabase/ssr major).
    // Letting the request through here is what turned a transient error into a
    // wide-open app.
    if (isProtectedRoute) {
      return redirectToSignIn(request);
    }

    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }
};
