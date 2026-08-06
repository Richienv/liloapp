"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { signInWithGoogleAction } from "@/app/actions";
import type { OAuthStartResponse } from "@/app/types/auth";
import { FormMessage } from "@/components/form-message";
import { cn } from "@/lib/utils";

/**
 * "Lanjutkan dengan Google" — the one-tap way into Salda.
 *
 * Deliberately a plain <button type="button"> rather than its own <form>: this
 * button is rendered *next to* the email/password form on sign-in and *inside*
 * the card on sign-up. A nested <form> is invalid HTML and a bare submit button
 * would hijack the surrounding form, so the click handler owns the whole
 * interaction instead.
 */

const GENERIC_ERROR =
  "Gagal menghubungkan ke Google. Coba lagi, atau daftar dengan email dan kata sandi.";

/**
 * A `redirect()` inside a server action reaches the client as a thrown error
 * carrying this digest. It must be re-thrown so Next's router can perform the
 * navigation — swallowing it would strand the user on the page with a
 * misleading "something went wrong".
 */
function isRedirectError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/** Google's own mark, inlined: a strict CSP blocks remote images, and there is
 *  no network at build time to fetch one. */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      className={cn("h-5 w-5 shrink-0", className)}
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.28-3.14.76-4.59l-7.97-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export interface GoogleButtonProps {
  /** Overridable so a sign-in page can say "Masuk dengan Google" if it wants. */
  label?: string;
  /**
   * When provided, failures are handed to the page so it can render them in the
   * same place as its other errors (above the submit button). Without it the
   * button renders its own message, still above itself.
   */
  onError?: (message: string) => void;
  /**
   * Same-origin path the user was originally trying to reach. Carried through
   * the OAuth round trip so a deep link the middleware saved survives signing
   * in with Google; the action validates it again server-side.
   */
  redirectTo?: string;
  /** Set while the page has its own submission in flight. */
  disabled?: boolean;
  className?: string;
}

/**
 * Whether to offer Google sign-in at all.
 *
 * This has to be a build-time flag rather than a runtime check, because there
 * is no runtime check available: `supabase.auth.signInWithOAuth()` performs no
 * network call — it builds the consent URL locally and always returns
 * `error: null`. The "provider is not enabled" response only exists after the
 * browser has already left our site, so a misconfigured provider strands the
 * user on a bare JSON error page on supabase.co with no way back.
 *
 * Since the failure cannot be caught, it has to be prevented: the button is
 * only rendered where the provider is known to be configured. Set
 * NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true once Google is enabled in the Supabase
 * dashboard AND the callback URL is allowlisted there.
 */
export const isGoogleAuthEnabled =
  process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

export function GoogleButton({
  label = "Lanjutkan dengan Google",
  onError,
  redirectTo,
  disabled = false,
  className,
}: GoogleButtonProps) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Set once we have handed the browser to Google. `isRedirecting` is cleared in
   * `finally`, which runs *before* the navigation lands — without this the
   * button would flicker back to life and accept a second click mid-redirect.
   */
  const leavingRef = useRef(false);
  const [leaving, setLeaving] = useState(false);

  const report = (message: string) => {
    if (onError) onError(message);
    else setError(message);
  };

  const handleClick = async () => {
    // Guard the in-flight flag as well as the disabled attribute: two fast
    // clicks can both land before React re-renders the disabled state.
    if (isRedirecting || leavingRef.current || disabled) return;

    setError(null);
    setIsRedirecting(true);

    try {
      // Only build FormData when there is something to say — the action's
      // parameter is optional and an empty payload would just be noise.
      let formData: FormData | undefined;
      if (redirectTo) {
        formData = new FormData();
        formData.append("redirect_to", redirectTo);
      }

      const result: OAuthStartResponse = await signInWithGoogleAction(formData);

      if (result?.url) {
        // Google's consent screen is another origin, so the action hands the
        // URL back rather than redirecting: this is the navigation.
        leavingRef.current = true;
        setLeaving(true);
        window.location.href = result.url;
        return;
      }

      report(result?.error ?? GENERIC_ERROR);
    } catch (err) {
      if (isRedirectError(err)) throw err;
      console.error("Google sign-in error:", err);
      report(GENERIC_ERROR);
    } finally {
      // In `finally` so a thrown action can never leave the button dead.
      setIsRedirecting(false);
    }
  };

  const busy = isRedirecting || leaving;

  // Belt and braces alongside the callers' own checks: if the provider is not
  // configured, rendering nothing is strictly better than rendering a button
  // that navigates the user off the site into a raw error page.
  if (!isGoogleAuthEnabled) return null;

  return (
    <div className="space-y-3">
      {/* Above the button, like every other error on these pages. */}
      {error && <FormMessage message={{ error }} className="max-w-none" />}

      <button
        type="button"
        onClick={handleClick}
        disabled={busy || disabled}
        aria-busy={busy}
        className={cn(
          "flex h-11 w-full items-center justify-center gap-3 rounded-panel border border-hairline-input bg-surface",
          "text-base font-medium text-ink-body transition-all duration-200",
          "hover:border-hairline-strong hover:bg-surface-tint hover:shadow",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 focus-visible:border-blue-600",
          "disabled:cursor-not-allowed disabled:opacity-70",
          className,
        )}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin text-ink-soft" />
        ) : (
          <GoogleMark />
        )}
        <span>{busy ? "Menghubungkan…" : label}</span>
      </button>
    </div>
  );
}

export default GoogleButton;
