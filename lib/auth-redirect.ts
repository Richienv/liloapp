/**
 * The single answer to "where does this person go now?".
 *
 * Post-authentication routing used to be decided independently by the sign-in
 * action, the OAuth callback, the onboarding tours and the dashboards — which is
 * how a streamer ended up being told to use a login page they could not see. One
 * function, called from every entry point, means those places can never disagree.
 *
 * The rule is: send people to the earliest thing they have not finished. An
 * account with no role picked cannot do anything until it has one; a streamer
 * with no published profile has nothing for a brand to book; a published but
 * unapproved streamer is waiting on us, not on themselves.
 */

export type UserRole = "client" | "streamer";

export type VerificationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "suspended";

export interface AccountState {
  /** Null until the person has chosen what they came here to do. */
  userType: UserRole | null;
  /** Present only for streamers; null for a brand or an account without a role. */
  streamer?: {
    verificationStatus: VerificationStatus | null;
    /** True once the profile has everything a brand needs to see it listed. */
    profilePublished: boolean;
    /** True once there is somewhere to send their earnings. */
    hasPayoutAccount: boolean;
  } | null;
}

export const ROLE_PICKER_PATH = "/pilih-peran";
export const CLIENT_HOME = "/protected";
export const STREAMER_HOME = "/streamer-dashboard";
export const STREAMER_SETUP_PATH = "/streamer-setup";
export const STREAMER_VERIFICATION_PATH = "/streamer-verification";

/**
 * Where an authenticated user belongs right now.
 *
 * `requested` is an optional path the user was originally trying to reach (the
 * middleware's `redirect_to`). It is honoured only when the account is complete
 * enough to use it — sending someone to a deep link they cannot act on yet just
 * bounces them again.
 */
export function nextPathFor(
  state: AccountState,
  requested?: string | null,
): string {
  // No role yet: nothing else in the product is meaningful.
  if (!state.userType) return ROLE_PICKER_PATH;

  if (state.userType === "streamer") {
    const s = state.streamer;

    // A streamer row that does not exist yet, or a profile missing the fields a
    // listing needs, means setup was never finished.
    if (!s || !s.profilePublished) return STREAMER_SETUP_PATH;

    // Published but not approved: they are waiting on a reviewer, and the
    // verification page is the only place that explains where they stand.
    if (s.verificationStatus !== "approved") return STREAMER_VERIFICATION_PATH;

    return requested ?? STREAMER_HOME;
  }

  return requested ?? CLIENT_HOME;
}

/**
 * True when the account is complete enough that an arbitrary deep link makes
 * sense. Used by callers that want to decide for themselves whether to honour a
 * `redirect_to` rather than passing it in blind.
 */
export function canFollowDeepLink(state: AccountState): boolean {
  if (!state.userType) return false;
  if (state.userType === "client") return true;
  return Boolean(state.streamer?.profilePublished);
}
