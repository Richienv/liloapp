import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { readAccountState } from "@/app/types/auth";
import { nextPathFor } from "@/lib/auth-redirect";

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
  // Handles identity documents (KTP, selfie), so it must never be reachable
  // without a session — client-side gating alone would still render the shell.
  "/streamer-verification",
  // The onboarding tours read and write the signed-in user's profile; they
  // gate client-side too, but the edge should turn anonymous visitors away
  // before any of that ships to the browser.
  "/client-onboarding",
  "/streamer-onboarding",
  // The account-first flow. Both read and write the signed-in user's own row —
  // the role picker decides what `users.user_type` becomes, and setup fills in
  // the public profile — so neither means anything without a session.
  "/pilih-peran",
  "/streamer-setup",
];

const isProtectedPath = (pathname: string) =>
  PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

// Auth pages an already-signed-in user should be moved off.
//
// /auth/callback is deliberately excluded: it must run the code exchange even
// for an already-authenticated user (e.g. a password-recovery link), and it
// sets its own cookies, so the middleware has nothing to add there.
const isAuthPath = (pathname: string) =>
  pathname.startsWith("/auth") && !pathname.startsWith("/auth/callback");

const passThrough = (request: NextRequest) =>
  NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

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
  const isAuthRoute = isAuthPath(pathname);

  // Nothing below this point branches on `user` for any other path. The
  // marketplace home, /locations, /location/<slug>, the public /[username]
  // profiles and sitemap.xml all render identically signed in or out — but they
  // were still waiting on getUser(), which is a network round trip to the auth
  // server, on every single request. Answering a question nobody reads is the
  // most expensive thing this middleware did.
  //
  // The cost of skipping it is that a session is no longer refreshed as a side
  // effect of browsing public pages only; the routes that actually gate on a
  // session still refresh it below, which is where an expiring token matters.
  if (!isProtectedRoute && !isAuthRoute) {
    return passThrough(request);
  }

  try {
    let response = passThrough(request);

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

    if (isProtectedRoute && !user) {
      return redirectToSignIn(request);
    }

    // Already authenticated and looking at an auth page. Where they belong is
    // not a guess the middleware gets to make on its own — nextPathFor decides
    // it here exactly as it does in the sign-in action and the OAuth callback,
    // so an account that has not picked a role lands on the picker rather than
    // on a brand dashboard it cannot use. This costs a couple of queries, but
    // only on /auth/*, which a signed-in user reaches essentially never.
    if (isAuthRoute && user) {
      const state = await readAccountState(supabase, user.id);
      const target = nextPathFor(state ?? { userType: null, streamer: null });
      return NextResponse.redirect(new URL(target, request.url));
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

    return passThrough(request);
  }
};
