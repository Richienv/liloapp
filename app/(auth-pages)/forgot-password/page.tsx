"use client";

import { forgotPasswordAction } from "@/app/actions";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useState, type FormEvent } from "react";

type ForgotPasswordSearchParams = {
  error?: string;
  success?: string;
  message?: string;
  email?: string;
};

export default function ForgotPassword({
  searchParams,
}: {
  searchParams: ForgotPasswordSearchParams;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Same reason as sign-in: the action redirects, so the page remounts and the
  // typed address only survives if it comes back through the query string.
  const [email, setEmail] = useState(searchParams.email ?? "");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return; // no double-submit, no duplicate reset emails

    const formData = new FormData(event.currentTarget);

    setIsSubmitting(true);
    try {
      await forgotPasswordAction(formData);
    } finally {
      // `finally` so an error path can't leave the button stuck on "Mengirim…".
      setIsSubmitting(false);
    }
  };

  return (
    // The auth layout already centres a card on a gradient backdrop. This page
    // used to render its own full-height split-screen inside that container,
    // which stacked two viewports and pushed the form off-screen on mobile.
    <div className="relative w-full max-w-[420px]">
      <div className="overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100">
        <div className="p-8">
          <div className="mb-8">
            <h1 className="font-serif text-section font-medium text-ink">
              Lupa kata sandi?
            </h1>
            <p className="mt-2 text-gray-600">
              Masukkan email akunmu, kami kirimkan link untuk membuat kata sandi
              baru.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
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

            {/* Above the action, so the result is the next thing you read. */}
            <FormMessage message={searchParams} />

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 bg-brand hover:bg-brand-hover text-white rounded-xl font-medium transition-all duration-200
                shadow-[0_4px_20px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.15)]
                disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Mengirim…</span>
                </div>
              ) : (
                "Kirim link reset"
              )}
            </Button>

            <p className="text-center text-sm text-gray-600">
              Sudah ingat kata sandimu?{" "}
              <Link
                href="/sign-in"
                className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
              >
                Masuk di sini
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
