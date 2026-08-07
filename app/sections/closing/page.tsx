/*
 * design-lint-allow: white-surface
 *
 * White on the blue CTA panel is genuinely white, not a card surface. The
 * design specifies background:#fff for the button and rgba(255,255,255,...)
 * for the live tiles' badges and chat bars. bg-surface resolves to the same
 * #ffffff but reads as "a card", which none of these are.
 */
import Image from "next/image";
import Link from "next/link";

/* ==========================================================================
   CTA — ported from design/Salda_Landing.dc.html (markup lines 464-493, data
   in `liveTiles` at line 692).

   A blue panel, the last blue on the page, with three drifting phone-shaped
   tiles under it. Every animation is a keyframe that already exists in
   app/globals.css (`k-sway`, `k-livedot`, `k-count`, `k-heart`, `k-chat`);
   nothing here defines a new one and nothing is hidden behind an observer.
   ========================================================================== */

/*
 * NOTE ON EXPORTS — this file sits at app/sections/closing/page.tsx, so Next
 * treats it as a ROUTE and a route module may only carry the named exports
 * Next allows. `LIVE_TILES` is module-private; the section reaches the landing
 * page through the default export.
 */

/**
 * The design's `liveTiles`, verbatim.
 *
 * ILLUSTRATIVE. The viewer counts (1.284 / 932 / 2.107) are the designer's
 * stand-in numbers on a decorative tile — they are not read from any stream,
 * booking or analytics table, and nothing on the page claims they are. If
 * these should ever show real concurrent viewers, this const is the thing to
 * replace with a query, not something to quietly leave as-is.
 *
 * The photos are the stock shots in public/images/. Every delay below is the
 * design's own, kept to the millisecond so the three tiles stay out of phase.
 */
const LIVE_TILES = [
  {
    photo: "1people.png",
    viewers: "1.284",
    sway: "5.2s",
    swayDelay: "0s",
    heartDelay: "0s",
    heartDelay2: ".9s",
    heartDelay3: "1.7s",
    chatDelay: "0s",
    chatDelay2: "1.1s",
  },
  {
    photo: "17.png",
    viewers: "932",
    sway: "6s",
    swayDelay: ".5s",
    heartDelay: ".4s",
    heartDelay2: "1.3s",
    heartDelay3: "2.1s",
    chatDelay: ".6s",
    chatDelay2: "1.8s",
  },
  {
    photo: "18.png",
    viewers: "2.107",
    sway: "5.6s",
    swayDelay: "1s",
    heartDelay: ".8s",
    heartDelay2: "1.6s",
    heartDelay3: "2.4s",
    chatDelay: "1.2s",
    chatDelay2: "2.3s",
  },
] as const;

export default function Closing() {
  return (
    <section className="mx-auto mt-[clamp(72px,12vh,140px)] max-w-[1180px] px-[clamp(20px,5vw,48px)]">
      <div className="rounded-frame bg-brand px-[clamp(28px,5vw,56px)] py-[clamp(44px,7vw,76px)] text-center">
        <h2 className="mx-auto mb-4 max-w-[20ch] font-serif text-[clamp(28px,4.4vw,48px)] font-medium leading-[1.08] tracking-[-.025em] text-balance text-white">
          Sesi live pertama kamu bisa mulai minggu ini.
        </h2>
        <p className="mx-auto mb-[30px] max-w-[48ch] text-[15.5px] leading-[1.6] text-pretty text-white/75">
          Daftar gratis, lihat host yang tersedia, dan bayar hanya saat kamu booking.
        </p>

        <Link
          href="/streamers"
          className="inline-flex h-[52px] items-center justify-center rounded-lg bg-white px-[30px] text-lede font-semibold text-brand-hover transition-colors hover:bg-brand-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-brand"
        >
          Mulai cari host
        </Link>

        {/*
          Three decorative tiles. They illustrate what a live session looks
          like; they are not a control, a preview or a link, so the whole row
          is hidden from assistive tech rather than read out as three photos
          with a number next to them.
        */}
        <div
          aria-hidden
          className="mt-[clamp(38px,6vh,56px)] flex flex-wrap justify-center gap-[clamp(12px,2vw,22px)]"
        >
          {LIVE_TILES.map((t) => (
            <div
              key={t.photo + t.viewers}
              className="relative aspect-[9/14] w-[clamp(120px,15vw,168px)] overflow-hidden rounded-frame border border-white/[.28] bg-white/10"
              style={{ animation: `k-sway ${t.sway} ease-in-out infinite ${t.swayDelay}` }}
            >
              <Image
                src={`/images/${t.photo}`}
                alt=""
                fill
                sizes="168px"
                // `background-size:cover;background-position:center top;opacity:.9`
                className="object-cover object-top opacity-90"
              />

              {/*
                design-lint-allow: gradient
                A bottom-up scrim. It is load-bearing, not decoration: the
                chat bars and hearts are white and sit over an arbitrary
                photograph, and without this they land on whatever the top of
                someone's shirt happens to be.
              */}
              <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(23,23,23,.62),rgba(23,23,23,0)_58%)]" />

              <div className="absolute left-[9px] top-[9px] flex items-center gap-[5px] rounded-[4px] bg-ink/[.62] px-[7px] py-[3px] backdrop-blur-[6px]">
                <span
                  className="h-1 w-1 rounded-[2px] bg-white"
                  style={{ animation: `k-livedot 1.6s ease-in-out infinite ${t.swayDelay}` }}
                />
                <span className="font-mono text-[8px] tracking-[.1em] text-white">LIVE</span>
              </div>

              <div
                className="numeric absolute right-[9px] top-[9px] rounded-[4px] bg-ink/[.62] px-1.5 py-[3px] font-mono text-[8.5px] text-white backdrop-blur-[6px]"
                style={{ animation: `k-count 2.2s ease-in-out infinite ${t.swayDelay}` }}
              >
                {t.viewers}
              </div>

              <div className="absolute bottom-[34px] right-2.5 h-[70px] w-3.5">
                <span
                  className="absolute bottom-0 right-0 text-mini text-white"
                  style={{ animation: `k-heart 2.8s ease-out infinite ${t.heartDelay}` }}
                >
                  ♥
                </span>
                <span
                  className="absolute bottom-0 right-[5px] text-[9px] text-white/75"
                  style={{ animation: `k-heart 2.8s ease-out infinite ${t.heartDelay2}` }}
                >
                  ♥
                </span>
                <span
                  className="absolute bottom-0 right-px text-[10px] text-white"
                  style={{ animation: `k-heart 2.8s ease-out infinite ${t.heartDelay3}` }}
                >
                  ♥
                </span>
              </div>

              <div className="absolute bottom-[9px] left-[9px] right-8 flex flex-col gap-1">
                <span
                  className="h-[9px] w-[82%] rounded-[5px] bg-white/[.34]"
                  style={{ animation: `k-chat 3.4s ease-in-out infinite ${t.chatDelay}` }}
                />
                <span
                  className="h-[9px] w-[64%] rounded-[5px] bg-white/[.34]"
                  style={{ animation: `k-chat 3.4s ease-in-out infinite ${t.chatDelay2}` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
