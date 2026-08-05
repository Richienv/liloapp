/**
 * Result of a signup server action.
 *
 * `redirectTo` is where the client should navigate on success — always the
 * matching onboarding route, never a dashboard: an account created by
 * `signUpAction` / `streamerSignUpAction` is not yet usable (a brand has no
 * profile to book with, a streamer is still awaiting admin verification).
 * `error` is user-facing copy in Bahasa Indonesia and is safe to render as-is.
 */
export interface SignUpResponse {
  success: boolean;
  redirectTo?: string;
  error?: string;
}
