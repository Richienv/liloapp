import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

// Landing page for failed auth callbacks (expired/invalid/already-used links,
// or a missing PKCE code verifier when the link is opened on another device).
// Previously the callback redirected here but no page existed -> hard 404.
//
// Presentation follows `app/payment-success/page.tsx`: the same centred frame on
// the warm canvas, because both screens are the end of a redirect the user did
// not choose and both offer exactly two ways out. Only the badge tone differs —
// caution here, positive there — and neither is the brand blue, which is spent
// on the single primary action.
export default function AuthErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5 py-16">
      <div className="w-full max-w-[520px] rounded-frame border border-hairline bg-surface px-6 py-12 text-center sm:px-10 sm:py-14">
        <div
          className="mx-auto flex h-[52px] w-[52px] items-center justify-center rounded-full border border-caution-line bg-caution-tint text-caution"
          aria-hidden="true"
        >
          <AlertTriangle className="h-5 w-5" strokeWidth={2} />
        </div>

        <h1 className="mt-6 font-serif text-section font-semibold text-ink sm:text-display">
          Link tidak valid atau kedaluwarsa
        </h1>

        <p className="mx-auto mt-3.5 max-w-[40ch] text-lede text-ink-muted">
          Link autentikasi ini tidak dapat diproses. Mungkin sudah kedaluwarsa,
          sudah pernah digunakan, atau dibuka di perangkat atau browser yang
          berbeda.
        </p>

        {/*
          `flex-nowrap`: the pair shares the row and never stacks. Both labels
          are short enough to survive the 220/168 widths — the button variants
          set `whitespace-nowrap`, so a long label overflows rather than wraps,
          which is why "Minta link reset password baru" could not stay.
        */}
        <div className="mt-9 flex min-w-0 flex-nowrap justify-center gap-3">
          <Button asChild variant="brand" size="action">
            <Link href="/forgot-password">Minta link baru</Link>
          </Button>
          <Button asChild variant="quiet" size="action-secondary">
            <Link href="/sign-in">Halaman masuk</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
