"use client";

import { resetPasswordAction } from "@/app/actions";
import { FormMessage, type MessageLike } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/utils/supabase/client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import {
  AuthShell,
  PasswordStrength,
  authFieldClass,
  authLabelClass,
} from "../auth-shell";

const MIN_PASSWORD_LENGTH = 6; // matches the sign-up flows

type ResetPasswordSearchParams = {
  error?: string;
  success?: string;
  message?: string;
};

// This page lives OUTSIDE /protected on purpose: the recovery link lands here
// via /auth/callback, and gating it behind the /protected middleware guard
// would bounce users to /sign-in before they can set a new password. We check
// the recovery session here only to show a clear message for dead links — the
// authoritative check is in resetPasswordAction, which refuses to update a
// password without a valid session regardless of what this page renders.
export default function ResetPassword({
  searchParams,
}: {
  searchParams: ResetPasswordSearchParams;
}) {
  const [sessionState, setSessionState] = useState<
    "checking" | "valid" | "invalid"
  >("checking");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Held in state only so the strength meter has something to read. The field
  // still carries `name="password"`, so what submits is unchanged.
  const [password, setPassword] = useState("");
  // Client-side validation feedback. Kept separate from `searchParams` so a
  // stale server message can't linger over a fresh local complaint.
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!cancelled) setSessionState(data.user ? "valid" : "invalid");
      })
      .catch(() => {
        if (!cancelled) setSessionState("invalid");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return; // double-submit guard

    const formData = new FormData(event.currentTarget);
    // Read from the FormData, not from state: the submitted value is the one
    // being validated, and `password` state exists only to feed the meter.
    const nextPassword = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    // Catch the two obvious mistakes here rather than paying a round trip and
    // a full page redirect to say "passwords don't match".
    if (nextPassword.length < MIN_PASSWORD_LENGTH) {
      setLocalError(`Kata sandi minimal ${MIN_PASSWORD_LENGTH} karakter.`);
      return;
    }
    if (nextPassword !== confirmPassword) {
      setLocalError("Konfirmasi kata sandi tidak sama.");
      return;
    }

    setLocalError(null);
    setIsSubmitting(true);
    try {
      await resetPasswordAction(formData);
    } finally {
      // `finally` so a failed update doesn't strand the button on "Menyimpan…".
      setIsSubmitting(false);
    }
  };

  const message: MessageLike = localError ? { error: localError } : searchParams;

  if (sessionState === "checking") {
    return (
      <AuthShell>
        <div className="flex items-center justify-center gap-3 py-4 text-ink-soft" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-copy">Memeriksa link reset…</span>
        </div>
      </AuthShell>
    );
  }

  if (sessionState === "invalid") {
    return (
      <AuthShell>
        <h1 className="font-serif text-section font-medium text-ink">Link tidak valid</h1>
        <p className="mt-2 text-copy text-ink-muted">
          Link reset kata sandi ini tidak valid atau sudah kedaluwarsa. Silakan minta
          link baru.
        </p>
        {/* The only thing left to do on this screen, so it is a button, not a
            link buried in a paragraph. */}
        <Button asChild variant="brand" size="action-full" className="mt-6">
          <Link href="/forgot-password">Minta link reset baru</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="mb-7">
        <h1 className="font-serif text-section font-medium text-ink">
          Buat kata sandi baru
        </h1>
        <p className="mt-2 text-copy text-ink-muted">
          Masukkan kata sandi barumu, minimal {MIN_PASSWORD_LENGTH} karakter.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="password" className={authLabelClass}>
            Kata sandi baru
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="new-password"
              placeholder="Masukkan kata sandi baru"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${authFieldClass} pr-12`}
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={
                showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
              }
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft transition-colors hover:text-ink-body"
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>
          {/* Reports, never blocks: the minimum length is the only rule. */}
          <PasswordStrength value={password} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className={authLabelClass}>
            Konfirmasi kata sandi
          </Label>
          <Input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            name="confirmPassword"
            autoComplete="new-password"
            placeholder="Ulangi kata sandi baru"
            required
            minLength={MIN_PASSWORD_LENGTH}
            className={authFieldClass}
          />
        </div>

        {/* Above the action — an error under the button is an error nobody reads. */}
        <FormMessage message={message} className="max-w-none" />

        <Button
          type="submit"
          variant="brand"
          size="action-full"
          disabled={isSubmitting}
          className="disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Menyimpan…
            </span>
          ) : (
            "Simpan kata sandi baru"
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
