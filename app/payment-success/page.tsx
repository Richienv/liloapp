import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * "Pembayaran diterima" — the screen a brand lands on once Midtrans has taken
 * the money.
 *
 * `robots: index/follow false`. A payment confirmation must never be indexed:
 * it is a per-transaction page, it says money changed hands, and a crawled copy
 * in a search result is both meaningless to the searcher and a leak of the fact
 * that a booking happened. No canonical either — a noindex page does not make
 * claims about which URL represents it.
 */
export const metadata: Metadata = {
  title: "Pembayaran diterima | Salda",
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * Deliberately a server component. Nothing here has state: the payment already
 * settled before the redirect, so this screen only reports and offers two ways
 * out. Anything that made it a client component (a countdown, a confetti burst)
 * would be motion in the one moment the user wants stillness and a receipt.
 */
export default function PaymentSuccessPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-canvas px-5 py-16">
      <div className="w-full max-w-[520px] rounded-frame border border-hairline bg-surface px-6 py-12 text-center sm:px-10 sm:py-14">
        {/*
          The only colour on the screen, and it is positive — not brand. The
          accent budget for this section is spent on the primary button; a blue
          check plus a blue button would be two accents saying the same thing.
        */}
        <div
          className="mx-auto flex h-[52px] w-[52px] items-center justify-center rounded-full border border-positive-line bg-positive-tint text-positive"
          aria-hidden="true"
        >
          <Check className="h-6 w-6" strokeWidth={2.25} />
        </div>

        <h1 className="mt-6 font-serif text-section text-ink sm:text-display">
          Pembayaran diterima
        </h1>

        <p className="mx-auto mt-3.5 max-w-[38ch] text-lede text-ink-muted">
          Permintaan booking kamu sudah diteruskan ke host. Kamu akan dapat
          notifikasi di aplikasi begitu host menjawab.
        </p>

        {/*
          `flex-nowrap`: the pair shares the row and never stacks. Below `sm`
          the fixed 220/168 widths are dropped by the button sizes themselves,
          so the two narrow together instead of overflowing a 360px phone.
        */}
        <div className="mt-9 flex min-w-0 flex-nowrap justify-center gap-3">
          <Button asChild variant="brand" size="action">
            <Link href="/client-bookings">Lihat booking saya</Link>
          </Button>
          <Button asChild variant="quiet" size="action-secondary">
            <Link href="/streamers">Cari host lain</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
