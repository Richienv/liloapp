"use client";

import { signInAction } from "@/app/actions";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";

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
    <div className="relative w-full max-w-[420px]">
      <div className="overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100">
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
              Selamat datang kembali
            </h1>
            <p className="mt-2 text-gray-600">
              Baru di Salda?{" "}
              <Link
                href="/sign-up"
                className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
              >
                Buat akun
              </Link>
            </p>
          </div>

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
                className="h-11 pl-4 bg-gray-50/50 border-gray-200 focus:bg-white text-base rounded-xl
                  focus:ring-2 focus:ring-blue-100 focus:border-blue-600 transition-all duration-200"
                style={{ fontSize: "16px" }}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <Label
                  htmlFor="password"
                  className="text-sm font-medium text-gray-700"
                >
                  Kata sandi
                </Label>
                {/* /forgot-password existed but nothing on this page linked to it. */}
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
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
              <Button
                type="submit"
                disabled={isSigningIn}
                className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700
                  hover:to-indigo-700 text-white rounded-xl font-medium transition-all duration-200
                  shadow-[0_4px_20px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.15)]
                  disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSigningIn ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>Memproses…</span>
                  </div>
                ) : (
                  "Masuk"
                )}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-gray-500">atau</span>
                </div>
              </div>

              {/*
                Discreet orientation for streamers, who used to look for a
                separate portal. It points at sign-up, not at a second login —
                the form above already handles both account types.
              */}
              <div className="space-y-2 text-center">
                <p className="text-sm text-gray-600">
                  Mau jadi streamer?{" "}
                  <Link
                    href="/streamer-sign-up"
                    className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
                  >
                    Daftar sebagai streamer
                  </Link>
                </p>
                <p className="text-xs text-gray-500">
                  Brand dan streamer masuk lewat form yang sama. Kami arahkan
                  otomatis ke dashboard-mu.
                </p>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
