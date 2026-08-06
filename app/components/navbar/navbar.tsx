"use client";

import Image from "next/image";
import Link from "next/link";

/**
 * The landing nav.
 *
 * It used to be a logo and a green WhatsApp button — no way to reach any
 * section, and the single most prominent control on the page sent people off
 * the product entirely, into a chat, before they had seen a host or a price.
 *
 * Now it is the reference's: four section anchors, a quiet sign-in, and one
 * accent-coloured primary. WhatsApp is still reachable, from the support line
 * at the end of the FAQ, which is where someone with an unanswered question
 * actually is.
 */
const SECTIONS = [
  { href: "#cara-kerja", label: "Cara kerja" },
  { href: "#host", label: "Host" },
  { href: "#testimoni", label: "Testimoni" },
  { href: "#faq", label: "FAQ" },
] as const;

export function Navbar() {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-hairline bg-canvas/94 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-7 px-5 sm:px-8 md:h-[72px] lg:px-12">
        <Link href="/" className="relative shrink-0" aria-label="Salda by TROLIVE">
          <Image
            src="/images/salda-logoB.png"
            alt="Salda"
            width={160}
            height={53}
            className="h-8 w-auto md:h-9"
            priority
          />
          <span className="absolute -bottom-1 right-0 text-micro font-light tracking-normal text-ink-soft">
            by TROLIVE
          </span>
        </Link>

        {/* Hidden below `md`: four anchors plus two actions do not fit on a
            phone, and the two actions are what matter. */}
        <div className="ml-2 hidden items-center gap-1 md:flex">
          {SECTIONS.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="rounded-field px-3 py-2 text-copy text-ink-muted transition-colors hover:bg-surface-tint hover:text-ink"
            >
              {section.label}
            </a>
          ))}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Link
            href="/sign-in"
            className="rounded-field px-3 py-2 text-copy font-medium text-ink-muted transition-colors hover:text-ink"
          >
            Masuk
          </Link>
          {/* The page's one nav-level accent. */}
          <Link
            href="/streamers"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4
              text-copy font-semibold text-white transition-colors hover:bg-brand-hover
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
              focus-visible:ring-offset-2"
          >
            Cari host
          </Link>
        </div>
      </div>
    </nav>
  );
}
