"use client";

import { resetPasswordAction } from "@/app/actions";
import { FormMessage, type MessageLike } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/utils/supabase/client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";

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
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    // Catch the two obvious mistakes here rather than paying a round trip and
    // a full page redirect to say "passwords don't match".
    if (password.length < MIN_PASSWORD_LENGTH) {
      setLocalError(`Kata sandi minimal ${MIN_PASSWORD_LENGTH} karakter.`);
      return;
    }
    if (password !== confirmPassword) {
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

  const cardClass =
    "overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100";

  if (sessionState === "checking") {
    return (
      <div className="relative w-full max-w-[420px]">
        <div className={cardClass}>
          <div
            className="flex items-center justify-center gap-3 p-8 text-gray-600"
            role="status"
          >
            <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
            <span className="text-sm">Memeriksa link reset…</span>
          </div>
        </div>
      </div>
    );
  }

  if (sessionState === "invalid") {
    return (
      <div className="relative w-full max-w-[420px]">
        <div className={cardClass}>
          <div className="p-8 space-y-4">
            <h1 className="text-2xl font-semibold text-gray-900">
              Link tidak valid
            </h1>
            <p className="text-sm text-gray-600">
              Link reset kata sandi ini tidak valid atau sudah kedaluwarsa.
              Silakan minta link baru.
            </p>
            <Link
              href="/forgot-password"
              className="inline-block text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              Minta link reset baru
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-[420px]">
      <div className={cardClass}>
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
              Buat kata sandi baru
            </h1>
            <p className="mt-2 text-gray-600">
              Masukkan kata sandi barumu, minimal {MIN_PASSWORD_LENGTH}{" "}
              karakter.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="text-sm font-medium text-gray-700"
              >
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
                  className="h-11 pl-4 pr-11 bg-gray-50/50 border-gray-200 focus:bg-white text-base rounded-xl
                    focus:ring-2 focus:ring-blue-100 focus:border-blue-600 transition-all duration-200"
                  style={{ fontSize: "16px" }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={
                    showPassword
                      ? "Sembunyikan kata sandi"
                      : "Tampilkan kata sandi"
                  }
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="confirmPassword"
                className="text-sm font-medium text-gray-700"
              >
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
                className="h-11 pl-4 bg-gray-50/50 border-gray-200 focus:bg-white text-base rounded-xl
                  focus:ring-2 focus:ring-blue-100 focus:border-blue-600 transition-all duration-200"
                style={{ fontSize: "16px" }}
              />
            </div>

            {/* Above the action — an error under the button is an error nobody reads. */}
            <FormMessage message={message} />

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700
                hover:to-indigo-700 text-white rounded-xl font-medium transition-all duration-200
                shadow-[0_4px_20px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.15)]
                disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Menyimpan…</span>
                </div>
              ) : (
                "Simpan kata sandi baru"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
