"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";

/**
 * A small standalone welcome block.
 *
 * It used to be three gradients stacked on one another: a navy radial wash over
 * the whole panel, a `linear-gradient(135deg, #000080 …)` clipped to the
 * headline text and animated forever, and a white-on-white sheen painted over
 * each card via `backgroundImage`. Under all of that the copy was shouted in
 * caps and half of it was in English.
 *
 * What is left is the system's own vocabulary: warm canvas, a serif heading in
 * ink, cards that are a hairline and a radius, and one accent — the button.
 */
export function Hero() {
  const cards = [
    {
      n: "01",
      title: "Selamat datang di Salda",
      description: "Semua kebutuhan live streaming kamu di satu tempat.",
    },
    {
      n: "02",
      title: "Lihat-lihat dulu",
      description: "Kenali platformnya sebelum kamu booking host pertama.",
    },
    {
      n: "03",
      title: "Mulai kapan saja",
      description: "Daftar gratis, bayar hanya saat kamu booking.",
    },
  ];

  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-canvas px-5 py-16 sm:px-8 lg:px-12">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col items-center gap-10 text-center">
        <div>
          <h1 className="mx-auto max-w-[18ch] font-serif text-heading font-medium text-balance text-ink">
            Selamat datang di Salda.
          </h1>
          <p className="mx-auto mt-3.5 max-w-[46ch] text-lede text-ink-muted">
            Kita senang kamu di sini. Lihat-lihat dulu aja.
          </p>
        </div>

        <div className="grid w-full grid-cols-1 gap-3.5 text-left md:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.n}
              className="rounded-panel border border-hairline bg-surface p-6"
            >
              <p className="font-mono text-mini tracking-[.08em] text-ink-ghost">{card.n}</p>
              <h3 className="mt-3 text-title font-semibold text-ink">{card.title}</h3>
              <p className="mt-1.5 text-copy leading-relaxed text-ink-muted">
                {card.description}
              </p>
            </div>
          ))}
        </div>

        <Button asChild variant="brand" size="action">
          <Link href="/sign-in">Masuk</Link>
        </Button>
      </div>
    </div>
  );
}
