"use client";

import { createAccountAction } from "@/app/actions";
import { FormMessage, type MessageLike } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { GoogleButton } from "@/components/ui/google-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { ROLE_PICKER_PATH } from "@/lib/auth-redirect";
import { normalizePhone, PHONE_INVALID_MESSAGE } from "@/lib/phone";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

/**
 * Account first, decisions later.
 *
 * This page used to ask a brand for seven fields — including a city, a brand
 * name and a brand description — before an account existed, and a host for
 * nineteen. Anyone who gave up left us nothing: no email, no phone, no way to
 * follow up. Now it collects only what an account genuinely needs:
 *
 *   1. email + password   (or Google, one tap)
 *   2. nama + WhatsApp    -> the account exists from here on
 *
 * Everything else — brand profile, host profile, portfolio — moved into the
 * role-specific setup that runs *after* /pilih-peran, where an abandoned form
 * costs us a profile instead of a person.
 */

/**
 * Where /streamer-sign-up parks the "I came here to be a host" intent so the
 * role picker can pre-highlight that card. sessionStorage rather than the URL:
 * it has to survive the Google OAuth round trip, which returns to a callback
 * URL we do not control. The same key is read in app/(auth-pages)/pilih-peran.
 */
const ROLE_INTENT_STORAGE_KEY = "salda:role-intent";

/** Supabase's own floor is 6 characters; saying so up front beats a server error. */
const PASSWORD_MIN_LENGTH = 6;

const TOTAL_STEPS = 2;

type SignUpSearchParams = {
  error?: string;
  success?: string;
  message?: string;
  /** "host" when the visitor arrived via /streamer-sign-up. */
  intent?: string;
  /** Preserved by the server on a failed attempt so the field isn't blanked. */
  email?: string;
};

/** Contract with createAccountAction (app/actions.ts). */
type CreateAccountResult =
  | { success: true; redirectTo?: string }
  | { success: false; error?: string }
  | undefined;

/**
 * A `redirect()` inside a server action arrives on the client as a thrown error
 * carrying this digest; it must be re-thrown for Next's router to act on it.
 */
function isRedirectError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/** Deliberately loose: the authoritative check is the confirmation email. */
function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function SignUp({
  searchParams,
}: {
  searchParams: SignUpSearchParams;
}) {
  const [step, setStep] = useState(1);

  // Step 1
  const [email, setEmail] = useState(searchParams.email ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Step 2
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  /** National digits ("81234567890") — PhoneInput's contract. */
  const [phone, setPhone] = useState("");
  const [showPhoneError, setShowPhoneError] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /**
   * Set once the account exists. The button re-enables in `finally` before the
   * redirect lands, so this stops a second submission slipping through and
   * creating a duplicate account.
   */
  const submittedRef = useRef(false);

  const wantsToHost = searchParams.intent === "host";

  // Carry the host intent across account creation (and across the Google round
  // trip) so /pilih-peran can pre-highlight "Jadi host" instead of asking a
  // question the visitor already answered by clicking "Daftar sebagai host".
  useEffect(() => {
    if (!wantsToHost) return;
    try {
      window.sessionStorage.setItem(ROLE_INTENT_STORAGE_KEY, "streamer");
    } catch {
      // Private mode / storage disabled: the picker simply won't pre-highlight.
    }
  }, [wantsToHost]);

  /**
   * One real submit handler for both steps. Step 1 advances instead of posting,
   * which is what makes Enter safe: previously Enter triggered a native submit
   * that navigated away and threw out everything already typed.
   */
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Guard the in-flight and already-done cases as well as disabling the
    // button: two Enter presses can both land before React re-renders.
    if (isSubmitting || submittedRef.current) return;

    setError(null);

    if (step === 1) {
      if (!isPlausibleEmail(email)) {
        setError("Masukkan alamat email yang valid, contoh: nama@contoh.com.");
        return;
      }
      if (password.length < PASSWORD_MIN_LENGTH) {
        setError(`Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`);
        return;
      }
      setStep(2);
      return;
    }

    if (!firstName.trim() || !lastName.trim()) {
      setError("Lengkapi nama depan dan nama belakang kamu.");
      return;
    }

    // Canonical E.164 ("+62812…") so WhatsApp links always work, whatever the
    // user typed.
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      setShowPhoneError(true);
      setError(PHONE_INVALID_MESSAGE);
      return;
    }

    const formData = new FormData();
    formData.append("email", email.trim());
    formData.append("password", password);
    formData.append("first_name", firstName.trim());
    formData.append("last_name", lastName.trim());
    formData.append("phone", normalizedPhone);

    setIsSubmitting(true);
    try {
      const result = (await createAccountAction(
        formData,
      )) as unknown as CreateAccountResult;

      if (result?.success) {
        submittedRef.current = true;
        // A full page load, not router.push: the session cookie was just set
        // server-side and every gate downstream reads it.
        window.location.href = result.redirectTo ?? ROLE_PICKER_PATH;
        return;
      }

      setError(
        (result && "error" in result ? result.error : null) ??
          "Terjadi kesalahan. Silakan coba lagi.",
      );
    } catch (err) {
      if (isRedirectError(err)) throw err;
      console.error("Create account error:", err);
      setError("Terjadi kesalahan tak terduga. Silakan coba lagi.");
    } finally {
      // In `finally` so a thrown action never leaves the button permanently dead.
      setIsSubmitting(false);
    }
  };

  // A local error takes precedence over anything the server left in the URL:
  // it is always the more recent of the two.
  const message: MessageLike | undefined = error ? { error } : searchParams;

  return (
    <div className="relative w-full max-w-[460px]">
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
        <div className="p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
              Buat akun Salda
            </h1>
            <p className="mt-2 text-gray-600">
              Sudah punya akun?{" "}
              <Link
                href="/sign-in"
                className="font-medium text-blue-600 transition-colors hover:text-blue-700"
              >
                Masuk di sini
              </Link>
            </p>
          </div>

          {/* Two bars, not a six-dot stepper: the honest signal here is "this is
              short", and a long indicator says the opposite. */}
          <div className="mb-6 space-y-2">
            <div className="flex gap-2" aria-hidden="true">
              {[1, 2].map((index) => (
                <div
                  key={index}
                  className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${
                    index <= step ? "bg-blue-600" : "bg-gray-200"
                  }`}
                />
              ))}
            </div>
            <p className="text-sm text-gray-500">
              Langkah {step} dari {TOTAL_STEPS} ·{" "}
              {step === 1 ? "Email & kata sandi" : "Nama & WhatsApp"}
            </p>
          </div>

          {step === 1 && (
            <>
              <GoogleButton disabled={isSubmitting} onError={setError} />

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-4 text-gray-500">atau</span>
                </div>
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {step === 1 ? (
              <>
                <div className="space-y-2">
                  <Label
                    htmlFor="email"
                    className="text-sm font-medium text-gray-700"
                  >
                    Alamat email
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="nama@contoh.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 rounded-xl border-gray-200 bg-gray-50/50 pl-4 text-base transition-all
                      duration-200 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100"
                    style={{ fontSize: "16px" }}
                  />
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="password"
                    className="text-sm font-medium text-gray-700"
                  >
                    Kata sandi
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder={`Minimal ${PASSWORD_MIN_LENGTH} karakter`}
                      minLength={PASSWORD_MIN_LENGTH}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 rounded-xl border-gray-200 bg-gray-50/50 pl-4 pr-11 text-base transition-all
                        duration-200 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100"
                      style={{ fontSize: "16px" }}
                    />
                    {/* A visible-password toggle instead of a confirmation
                        field: it catches the same typos and costs one field
                        less on the screen people abandon most. */}
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={
                        showPassword
                          ? "Sembunyikan kata sandi"
                          : "Tampilkan kata sandi"
                      }
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 transition-colors hover:text-gray-700"
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="first_name"
                      className="text-sm font-medium text-gray-700"
                    >
                      Nama depan
                    </Label>
                    <Input
                      id="first_name"
                      name="first_name"
                      type="text"
                      autoComplete="given-name"
                      placeholder="Budi"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="h-11 rounded-xl border-gray-200 bg-gray-50/50 pl-4 text-base transition-all
                        duration-200 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100"
                      style={{ fontSize: "16px" }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="last_name"
                      className="text-sm font-medium text-gray-700"
                    >
                      Nama belakang
                    </Label>
                    <Input
                      id="last_name"
                      name="last_name"
                      type="text"
                      autoComplete="family-name"
                      placeholder="Santoso"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="h-11 rounded-xl border-gray-200 bg-gray-50/50 pl-4 text-base transition-all
                        duration-200 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100"
                      style={{ fontSize: "16px" }}
                    />
                  </div>
                </div>

                {/* WhatsApp is how Salda actually reaches people — support, and
                    the brand/host coordination around a booking. It is asked
                    for here, before the account exists, precisely so that an
                    abandoned setup later is still recoverable. */}
                <div className="space-y-2">
                  <Label
                    htmlFor="phone"
                    className="text-sm font-medium text-gray-700"
                  >
                    Nomor WhatsApp
                  </Label>
                  <PhoneInput
                    id="phone"
                    required
                    value={phone}
                    onChange={(value) => {
                      setShowPhoneError(false);
                      setPhone(value);
                    }}
                    forceShowError={showPhoneError}
                  />
                </div>
              </>
            )}

            {/*
              Above the button, not below it. Rendered underneath, an error sat
              past the fold on a phone and a failed attempt looked like nothing
              had happened at all.
            */}
            <FormMessage message={message} className="max-w-none" />

            <div className="space-y-3">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-11 w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 font-medium
                  text-white shadow-[0_4px_20px_rgba(0,0,0,0.1)] transition-all duration-200
                  hover:from-blue-700 hover:to-indigo-700 hover:shadow-[0_4px_24px_rgba(0,0,0,0.15)]
                  disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Membuat akun…
                  </span>
                ) : step === 1 ? (
                  "Lanjut"
                ) : (
                  "Buat akun"
                )}
              </Button>

              {step === 2 && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStep(1);
                  }}
                  disabled={isSubmitting}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium
                    text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900
                    disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Kembali
                </button>
              )}
            </div>
          </form>

          {/* Sets the expectation for what comes right after the account: one
              question, not another form. */}
          <p className="mt-6 border-t border-gray-100 pt-5 text-sm text-gray-500">
            {wantsToHost
              ? "Setelah akun jadi, kamu tinggal konfirmasi bahwa kamu ingin jadi host — lalu lengkapi profil kapan pun kamu siap."
              : "Setelah akun jadi, kamu cukup pilih satu hal: cari host untuk brand kamu, atau jadi host live."}
          </p>

          <p className="mt-3 text-xs leading-relaxed text-gray-500">
            Dengan membuat akun, kamu menyetujui{" "}
            <Link
              href="/terms"
              target="_blank"
              className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700"
            >
              Syarat &amp; Ketentuan
            </Link>{" "}
            dan{" "}
            <Link
              href="/privacy-notice"
              target="_blank"
              className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700"
            >
              Kebijakan Privasi
            </Link>{" "}
            Salda.
          </p>
        </div>
      </div>
    </div>
  );
}
