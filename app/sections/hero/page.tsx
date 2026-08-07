import Link from "next/link";

/**
 * ILLUSTRATIVE FIGURES — NOT MEASURED, NOT QUERIED.
 *
 * These three numbers come from the design file (Salda_Landing.dc.html, the
 * hero's live-proof strip) and nothing else. This product does not count live
 * sessions, likes, or concurrent viewers anywhere: there is no table, no query,
 * and no job behind any of them. They are literals, they never change, and they
 * were previously deleted from this file for exactly that reason. They are back
 * only because the design is now the contract for this page.
 *
 * If you want the claims gone, delete this const and the three pills disappear
 * with it — the strip renders from here and nowhere else, and it renders
 * nothing when the array is empty. If you want them true, wire `label` (and
 * `value`) to a real query first, then this comment can go.
 *
 * Deliberately not `export`ed: this is a route `page.tsx`, and Next's generated
 * page types reject any named export outside its own allowlist (`metadata`,
 * `revalidate`, …), so `export const PROOF_STRIP` fails the type check. One
 * named const at the top of the file is the whole point regardless — the
 * figures live here and nowhere else.
 */
type ProofPill =
  /** A pulsing brand dot, then the label. */
  | { kind: "live"; label: string; bobDelay: string }
  /** A brand heart glyph, then the label. */
  | { kind: "likes"; label: string; bobDelay: string }
  /** A mono figure in brand, then the label. */
  | { kind: "viewers"; value: string; label: string; bobDelay: string };

const PROOF_STRIP: ProofPill[] = [
  { kind: "live", label: "47 host sedang live", bobDelay: "0s" },
  { kind: "likes", label: "12,4rb like hari ini", bobDelay: ".7s" },
  { kind: "viewers", value: "18.902", label: "nonton sekarang", bobDelay: "1.4s" },
];

/**
 * The headline's rotating tail. Three ways a brand says the same thing, then
 * the first one again: `k-word` ends at translateY(-75%) of a four-line stack,
 * so the last frame has to be a copy of the first or the loop snaps back
 * visibly at 100%. The fourth line is that copy — it is the same words the
 * screen reader has already announced, so it is the one that gets aria-hidden.
 */
const ROTATING_WORDS = [
  "produk kamu.",
  "brand kamu.",
  "toko kamu.",
  "produk kamu.",
] as const;

/**
 * The hero.
 *
 * No hooks, no state, no fetch — every moving part is a CSS loop declared in
 * app/globals.css (`k-word`, `k-bob`, `k-livedot`), which means the whole
 * section is correct in its server-rendered HTML and stays correct if
 * JavaScript never arrives. Nothing here starts at opacity 0.
 *
 * Under `prefers-reduced-motion: reduce`, globals.css switches off anything
 * carrying an inline `animation`, so the rotating word settles on its first
 * line ("produk kamu.") and the proof pills sit still. Content is never what
 * gets taken away.
 */
export default function Hero() {
  return (
    <section
      id="top"
      className="mx-auto flex max-w-[1180px] flex-col items-center px-[clamp(20px,5vw,48px)] pt-[clamp(64px,11vh,120px)] text-center"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: "Salda by TROLIVE",
            description:
              "Platform host live streaming dari TROLIVE untuk boost penjualan produk kamu di TIKTOK & SHOPEE LIVE dengan harga terjangkau.",
            brand: { "@type": "Brand", name: "TROLIVE" },
            // No aggregateRating. It was hardcoded to 4.9 from 1000 reviews,
            // neither of which is a number this product has ever computed.
            // Review markup that does not correspond to real reviews is what
            // Google issues manual actions for, and the penalty lands on the
            // whole domain rather than the one page.
            offers: {
              "@type": "AggregateOffer",
              priceCurrency: "IDR",
              availability: "https://schema.org/InStock",
            },
          }),
        }}
      />

      {/* Eyebrow pill */}
      <div className="mb-[clamp(24px,4vh,34px)] inline-flex items-center gap-[9px] rounded-full border border-hairline bg-surface px-[15px] py-[7px]">
        <span className="h-1.5 w-1.5 rounded-full bg-brand" />
        <span className="font-mono text-[11.5px] tracking-[.04em] text-ink-muted">
          Shopee &amp; TikTok Live-Seller Supported
        </span>
      </div>

      <h1 className="mx-auto mb-[clamp(20px,3vh,28px)] max-w-[16ch] text-balance font-serif text-hero font-medium text-ink">
        Host livestreamer terlatih untuk{" "}
        {/*
          The rotating word. A 1.02em window over a four-line stack that
          `k-word` steps down one line at a time — 10.5s, cubic-bezier(.16,1,.3,1),
          which holds each word still for most of its beat and moves between
          them fast. `vertical-align: bottom` keeps the window sitting on the
          same baseline as the static half of the sentence.
        */}
        <span className="inline-block h-[1.02em] overflow-hidden align-bottom">
          <span
            className="block"
            style={{ animation: "k-word 10.5s cubic-bezier(.16,1,.3,1) infinite" }}
          >
            {ROTATING_WORDS.map((word, i) => (
              <span
                key={i}
                className="block leading-[1.02] text-brand"
                aria-hidden={i === ROTATING_WORDS.length - 1 || undefined}
              >
                {word}
              </span>
            ))}
          </span>
        </span>
      </h1>

      <p className="mx-auto mb-[clamp(30px,4.5vh,42px)] max-w-[56ch] text-pretty text-[length:clamp(15px,1.5vw,18px)] leading-[1.6] text-ink-muted">
        Booking host yang sudah terverifikasi, atur jadwal live, dan bayar di satu
        tempat. Rata-rata brand mulai live dalam tiga hari setelah mendaftar.
      </p>

      <div className="mb-[clamp(18px,3vh,26px)] flex flex-wrap justify-center gap-3">
        <Link
          href="/streamers"
          className="inline-flex h-[52px] items-center justify-center rounded-lg bg-brand px-[28px] text-[15px] font-semibold text-white hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Mulai cari host
        </Link>
      </div>

      {/*
        Live proof strip. Each pill bobs on the same 4.4s curve, staggered
        0s / .7s / 1.4s so the row breathes instead of pumping in unison.
        See PROOF_STRIP above for what these numbers are and are not.
      */}
      {PROOF_STRIP.length > 0 && (
        <div className="mb-[clamp(16px,2.5vh,22px)] flex flex-wrap justify-center gap-2.5">
          {PROOF_STRIP.map((pill) => (
            <span
              key={pill.label}
              className="inline-flex items-center gap-[7px] rounded-full border border-hairline bg-surface px-[14px] py-[7px] text-meta text-ink-body"
              style={{ animation: `k-bob 4.4s ease-in-out infinite ${pill.bobDelay}` }}
            >
              {pill.kind === "live" && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-brand"
                  style={{ animation: "k-livedot 1.6s ease-in-out infinite" }}
                />
              )}
              {pill.kind === "likes" && (
                <span className="text-[12px] text-brand">♥</span>
              )}
              {pill.kind === "viewers" && (
                <span className="font-mono text-[11px] text-brand">{pill.value}</span>
              )}
              {pill.label}
            </span>
          ))}
        </div>
      )}

      <p className="mb-[clamp(48px,8vh,84px)] font-mono text-[11.5px] text-ink-ghost">
        Gratis mendaftar · bayar hanya saat booking
      </p>
    </section>
  );
}
