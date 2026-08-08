"use client";

import { signInAction } from "@/app/actions";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { GoogleButton, isGoogleAuthEnabled } from "@/components/ui/google-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

import {
  AuthShell,
  SIGN_IN_PANEL,
  authFieldClass,
  authLabelClass,
  authLinkClass,
} from "../auth-shell";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

type SignInSearchParams = {
  error?: string;
  success?: string;
  message?: string;
  /** Where the middleware wanted to send the user before it bounced them here. */
  redirect_to?: string;
  /** Re-encoded by signInAction so a failed attempt doesn't blank the field. */
  email?: string;
};

export default function Login({
  searchParams,
}: {
  searchParams: SignInSearchParams;
}) {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // A failed sign-in is a server-side redirect back to this URL, so the page
  // remounts and nothing in component state survives. The only way to keep the
  // typed address is to read it back off the query string; if the action didn't
  // send one we simply start empty rather than losing it mid-session.
  const [email, setEmail] = useState(searchParams.email ?? "");

  // Only forward a path-relative, same-origin target. signInAction validates
  // this again server-side — this just avoids reflecting an attacker-supplied
  // absolute URL back into the page.
  const rawRedirectTo = searchParams.redirect_to ?? "";
  const redirectTo =
    rawRedirectTo.startsWith("/") && !rawRedirectTo.startsWith("//")
      ? rawRedirectTo
      : "";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Double-submit guard: two clicks used to fire two signInWithPassword
    // calls and race two redirects against each other.
    if (isSigningIn) return;

    // Snapshot the FormData before awaiting — React nulls out `currentTarget`
    // once the event is recycled.
    const formData = new FormData(event.currentTarget);

    setIsSigningIn(true);
    try {
      await signInAction(formData);
    } finally {
      // Must be `finally`: every failure path in signInAction throws (a
      // redirect is a throw in Next), and without this the button stayed on
      // "Memproses…" permanently with no way to retry.
      setIsSigningIn(false);
    }
  };

  return (
    <AuthShell panel={SIGN_IN_PANEL}>
      <>
          <div className="mb-8">
            <h1 className="font-serif text-section font-medium text-ink">
              Masuk ke akun kamu
            </h1>
            {/* The reference's line, and it earns its place: the product used to
                have two login boxes that signed you out for picking the wrong
                one, so "satu akun" is the thing a returning user most needs to
                stop worrying about. */}
            <p className="mt-2 text-copy text-ink-muted">
              Satu akun untuk brand dan host. Kami arahkan otomatis sesuai peran kamu.
            </p>
            <p className="mt-3 text-copy text-ink-soft">
              Baru di Salda? <Link href="/sign-up" className={authLinkClass}>Buat akun</Link>
            </p>
          </div>

          {/*
            Google first: most people signing in here created the account with
            it, and one tap beats remembering which password they used. It
            renders its own failure message directly above itself, so the form's
            FormMessage below stays about credentials only.
          */}
          {/* Divider hidden with the button: a lone "atau" above a single form
              reads as a rendering fault. */}
          {isGoogleAuthEnabled && (
            <>
              <GoogleButton
                label="Masuk dengan Google"
                // The same deep link the form below carries, so choosing Google
                // does not cost the user the page they were headed to.
                redirectTo={redirectTo || undefined}
                disabled={isSigningIn}
              />

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-hairline" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-surface px-4 text-copy text-ink-soft">atau</span>
                </div>
              </div>
            </>
          )}

          {/*
            One form, one credential path. Brands and streamers used to have
            separate login boxes that signed you out for picking the "wrong"
            one; sign-in now reads the account's real user_type and routes to
            the right dashboard.
          */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Deep link the middleware saved when it gated a protected page. */}
            <input type="hidden" name="redirect_to" value={redirectTo} />

            <div className="space-y-2">
              <Label htmlFor="email" className={authLabelClass}>
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
                className={authFieldClass}
              />
            </div>

            <div className="space-y-2">
              {/* One line, never two: the label and the escape hatch share the
                  row and the row is not allowed to wrap. */}
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="password" className={authLabelClass}>
                  Kata sandi
                </Label>
                {/* /forgot-password existed but nothing on this page linked to it. */}
                <Link
                  href="/forgot-password"
                  className={`shrink-0 text-copy ${authLinkClass}`}
                >
                  Lupa kata sandi?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  placeholder="Masukkan kata sandi"
                  required
                  className={`${authFieldClass} pr-12`}
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink-body transition-colors"
                >
                  {/* Icon matches the aria-label: it names the action, not the state. */}
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/*
              Above the button, not below it. Rendered after the buttons the
              error sat under the fold on a phone, so a failed attempt looked
              like nothing had happened and people just clicked again.
            */}
            <FormMessage message={searchParams} />

            <div className="space-y-5 pt-1">
              {/* The screen's one accent. Everything else on it is ink. */}
              <Button
                type="submit"
                variant="brand"
                size="action-full"
                disabled={isSigningIn}
                className="disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSigningIn ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memproses…
                  </span>
                ) : (
                  "Masuk"
                )}
              </Button>

              {/*
                A plain rule, not a second "atau": the only real either/or on
                this page is Google vs. email, and labelling this separator the
                same way read as a third way to sign in. What follows is
                orientation, not a credential choice.
              */}
              <div className="border-t border-hairline-soft" />

              {/*
                Discreet orientation for streamers, who used to look for a
                separate portal. It points at sign-up, not at a second login —
                the form above already handles both account types.
              */}
              <p className="text-center text-copy text-ink-soft">
                Mau jadi host?{" "}
                <Link href="/streamer-sign-up" className={authLinkClass}>
                  Daftar sebagai host
                </Link>
              </p>
            </div>
          </form>
      </>
    </AuthShell>
  );
}
