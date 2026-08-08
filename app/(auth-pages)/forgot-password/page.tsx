"use client";

import { forgotPasswordAction } from "@/app/actions";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { AuthShell, authFieldClass, authLabelClass, authLinkClass } from "../auth-shell";

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
    // No proof panel. Someone who is locked out is not deciding whether to sign
    // up, and the shell's one-column shape is the same card, width and type as
    // the split — the flow does not visibly change product between screens.
    <AuthShell>
      <div className="mb-7">
        <h1 className="font-serif text-section font-medium text-ink">Lupa kata sandi?</h1>
        <p className="mt-2 text-copy text-ink-muted">
          Masukkan email akunmu, kami kirimkan link untuk membuat kata sandi baru.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
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

        {/* Above the action, so the result is the next thing you read. */}
        <FormMessage message={searchParams} className="max-w-none" />

        {/* The screen's one accent. */}
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
              Mengirim…
            </span>
          ) : (
            "Kirim link reset"
          )}
        </Button>

        <p className="border-t border-hairline-soft pt-5 text-center text-copy text-ink-soft">
          Sudah ingat kata sandimu?{" "}
          <Link href="/sign-in" className={authLinkClass}>
            Masuk di sini
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
