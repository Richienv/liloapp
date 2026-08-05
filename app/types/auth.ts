import type { SupabaseClient } from "@supabase/supabase-js";

import type { AccountState, UserRole, VerificationStatus } from "@/lib/auth-redirect";
import { isProfilePublishable } from "@/lib/milestones";

/**
 * Shared shapes for the auth server actions in `app/actions.ts`, plus the one
 * query that turns a signed-in user into the {@link AccountState} that
 * `nextPathFor` routes on.
 *
 * The query lives here rather than in `app/actions.ts` because three different
 * runtimes need it — the server actions, the OAuth callback route handler, and
 * the edge middleware — and none of them can import a private helper out of a
 * `"use server"` module. Everything in this file is pure: no `next/headers`, no
 * `server-only`, so a client component importing the response types stays
 * bundleable.
 */

/**
 * Result of an auth server action.
 *
 * `redirectTo` is where the client should navigate on success and is always
 * produced by `nextPathFor` (or, for account creation, the role picker it
 * hard-codes) so no caller has to decide for itself. `error` is user-facing
 * copy in Bahasa Indonesia and is safe to render as-is.
 */
export interface AuthActionResponse {
  success: boolean;
  redirectTo?: string;
  error?: string;
}

/**
 * Historical name for {@link AuthActionResponse}. The legacy signup forms still
 * import it; the shape has never differed.
 */
export type SignUpResponse = AuthActionResponse;

/**
 * Result of starting an OAuth handoff.
 *
 * `url` is the provider's consent screen — another origin, which is why it is
 * handed back for the caller to navigate to rather than redirected to
 * server-side. `error` is user-facing copy in Bahasa Indonesia.
 */
export interface OAuthStartResponse {
  url?: string;
  error?: string;
}

/** The two things someone can come to Salda to do. */
export type RoleChoice = UserRole;

export const ROLE_CHOICES: readonly RoleChoice[] = ["client", "streamer"];

/**
 * Narrow a raw FormData value to a role. Anything else — a missing field, a
 * typo, or a hand-crafted POST — is rejected by the caller rather than written
 * to `users.user_type`, which is read as a permission everywhere in the app.
 */
export function isRoleChoice(value: unknown): value is RoleChoice {
  return value === "client" || value === "streamer";
}

/**
 * The streamer columns {@link AccountState} is derived from. Listed once so the
 * three callers cannot drift into asking for different fields and reaching
 * different conclusions about the same account.
 */
const STREAMER_STATE_COLUMNS =
  "id, username, image_url, city_slug, location, full_address, category, platform, price, bio, verification_status";

/**
 * Read everything `nextPathFor` needs about an account.
 *
 * Returns `null` when there is no `public.users` row at all — a state the
 * caller has to handle deliberately (create the row, or tell the user to
 * contact support), not paper over with a default role.
 *
 * Publishability is derived with `isProfilePublishable` rather than read from a
 * flag, so it can never claim a profile is live when the fields a listing
 * renders are missing.
 */
export async function readAccountState(
  supabase: SupabaseClient,
  userId: string,
): Promise<AccountState | null> {
  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("user_type")
    .eq("id", userId)
    .maybeSingle();

  if (userError) {
    console.error("readAccountState: could not read users row", userError);
    return null;
  }
  if (!userRow) return null;

  // NULL user_type is the normal state of a brand-new account-first signup, not
  // an error: it means "role not chosen yet".
  const userType = (userRow.user_type as UserRole | null) ?? null;

  if (userType !== "streamer") {
    return { userType, streamer: null };
  }

  const { data: streamer, error: streamerError } = await supabase
    .from("streamers")
    .select(STREAMER_STATE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (streamerError) {
    console.error("readAccountState: could not read streamers row", streamerError);
  }

  if (!streamer) {
    // A streamer with no row has not started setup; `nextPathFor` sends them there.
    return { userType, streamer: null };
  }

  const row = streamer as Record<string, unknown>;

  // A payout account is a yes/no question, so ask for the count and no rows.
  const { count, error: payoutError } = await supabase
    .from("streamer_payout_accounts")
    .select("id", { count: "exact", head: true })
    .eq("streamer_id", row.id as number);

  if (payoutError) {
    console.error("readAccountState: could not count payout accounts", payoutError);
  }

  return {
    userType,
    streamer: {
      verificationStatus: (row.verification_status as VerificationStatus | null) ?? null,
      profilePublished: isProfilePublishable({
        username: row.username as string | null,
        image_url: row.image_url as string | null,
        city_slug: row.city_slug as string | null,
        location: row.location as string | null,
        full_address: row.full_address as string | null,
        category: row.category as string | null,
        platform: row.platform as string | null,
        price: row.price as number | string | null,
        bio: row.bio as string | null,
      }),
      hasPayoutAccount: (count ?? 0) > 0,
    },
  };
}
