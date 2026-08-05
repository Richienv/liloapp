import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

import { readAccountState } from "@/app/types/auth";
import { nextPathFor } from "@/lib/auth-redirect";

export const dynamic = 'force-dynamic';

/**
 * Throwaway origin used only to validate the `redirect_to` parameter. The host
 * is deliberately unreachable (.invalid is reserved by RFC 2606), so a value
 * that escapes this origin during parsing is self-evidently not our path.
 */
const SAFE_REDIRECT_BASE = "https://redirect-base.invalid";

/**
 * `redirect_to` arrives in the query string of a URL anyone can send, and it is
 * followed immediately after a successful sign-in — the most credible possible
 * moment to hand someone to an attacker's page. Accept it only as a
 * same-origin *path*: "//evil.example" and "/\evil.example" are both read by
 * browsers as protocol-relative URLs.
 *
 * Resolving against a throwaway origin rather than prefix-matching applies the
 * same WHATWG rules the browser will, including the tab/CR/LF stripping that
 * turns "/\t/evil.example" into "//evil.example" after every string test passed.
 */
function safeRedirectPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const candidate = raw.trim();
  if (!candidate.startsWith("/")) return null;

  let url: URL;
  try {
    url = new URL(candidate, SAFE_REDIRECT_BASE);
  } catch {
    return null;
  }
  if (url.origin !== SAFE_REDIRECT_BASE) return null;

  return `${url.pathname}${url.search}${url.hash}`;
}

/** Where a password-recovery link must land, whatever state the account is in. */
const RESET_PASSWORD_PATH = "/reset-password";

/**
 * Split whatever a provider gave us into the two name columns.
 *
 * Google sends `given_name`/`family_name` for most accounts but only a single
 * `name` for some, so fall back to splitting on the first space rather than
 * storing an empty first name — it is what every greeting in the product uses.
 */
function namesFromMetadata(metadata: Record<string, unknown>): {
  firstName: string;
  lastName: string;
} {
  const given = typeof metadata.given_name === "string" ? metadata.given_name.trim() : "";
  const family = typeof metadata.family_name === "string" ? metadata.family_name.trim() : "";
  if (given) return { firstName: given, lastName: family };

  const full =
    (typeof metadata.full_name === "string" && metadata.full_name) ||
    (typeof metadata.name === "string" && metadata.name) ||
    "";
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };

  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/**
 * Every code exchange lands here: Google sign-in, email confirmation, and the
 * password-recovery link.
 *
 * Two things have to happen before anyone is routed. First, a `public.users`
 * row must exist — Google hands us an auth user and nothing else, and an auth
 * user with no profile row is a broken half-state: every page in the app reads
 * `user_type` off that row, so without it the user bounces between screens that
 * cannot describe them. Second, the destination is decided by `nextPathFor`,
 * the same function the sign-in action and the middleware use, so an OAuth user
 * who has never picked a role goes to the role picker instead of a dashboard
 * built for someone else.
 */
export async function GET(request: Request) {
  // request.url is already absolute — parse it directly instead of
  // reconstructing it from the host header (which mis-parsed when the host
  // appeared more than once and hardcoded the protocol from NODE_ENV). Parsed
  // outside the try so the catch below still has somewhere to send people.
  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
  } catch {
    const fallback = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    return NextResponse.redirect(`${fallback}/auth/error`);
  }

  // Prefer the configured site URL so redirects use the public origin even
  // behind a proxy; fall back to the request's own origin.
  const origin = process.env.NEXT_PUBLIC_SITE_URL || requestUrl.origin;

  try {
    const code = requestUrl.searchParams.get("code");
    const requestedPath = safeRedirectPath(requestUrl.searchParams.get("redirect_to"));

    if (!code) {
      console.error("No code provided in auth callback");
      return NextResponse.redirect(`${origin}/auth/error`);
    }

    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Auth exchange error:", error);
      return NextResponse.redirect(`${origin}/auth/error`);
    }

    const user = data?.user;
    if (!user) {
      console.error("Auth callback: code exchanged but no user returned");
      return NextResponse.redirect(`${origin}/auth/error`);
    }

    // A recovery session exists only to change a password. Routing it through
    // nextPathFor would send an account that has not picked a role to the role
    // picker, stranding it with a session it cannot use and no way back to the
    // reset form.
    if (requestedPath === RESET_PASSWORD_PATH) {
      return NextResponse.redirect(`${origin}${RESET_PASSWORD_PATH}`);
    }

    const { data: existingProfile, error: profileReadError } = await supabase
      .from("users")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileReadError) {
      console.error("Auth callback: could not read the users row", profileReadError);
      return NextResponse.redirect(`${origin}/auth/error`);
    }

    if (!existingProfile) {
      const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
      const { firstName, lastName } = namesFromMetadata(metadata);
      const avatar =
        (typeof metadata.avatar_url === "string" && metadata.avatar_url) ||
        (typeof metadata.picture === "string" && metadata.picture) ||
        null;
      const now = new Date().toISOString();

      const { error: insertError } = await supabase.from("users").insert({
        id: user.id,
        email: user.email,
        first_name: firstName,
        last_name: lastName,
        // No role yet — the picker is where that is decided, for an OAuth user
        // exactly as for an email one.
        user_type: null,
        // Google never gives us a phone number. Leaving it NULL is honest; the
        // role and setup flows are where it gets collected.
        phone: null,
        profile_picture_url: avatar,
        created_at: now,
        updated_at: now,
      });

      if (insertError) {
        console.error("Auth callback: could not create the users row", insertError);
        return NextResponse.redirect(`${origin}/auth/error`);
      }
    }

    const state = await readAccountState(supabase, user.id);
    const target = nextPathFor(state ?? { userType: null, streamer: null }, requestedPath);

    return NextResponse.redirect(`${origin}${target}`);
  } catch (error) {
    console.error("Auth callback error:", error);
    return NextResponse.redirect(`${origin}/auth/error`);
  }
}
