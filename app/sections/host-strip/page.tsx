"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { subtotalWithPlatformFee } from "@/lib/pricing";

/* ==========================================================================
   Host strip + stats — ported from design/Salda_Landing.dc.html (lines 106-154
   for the markup, 524-576 and 604-677 for the data and the behaviour).

   Two sections live in one file because they are one visual unit in the
   design: the strip runs to a hairline, the stats bar sits on that hairline,
   and the page picks up again underneath. Splitting them put the seam in two
   places that had to agree about a 1px border.

   Every animation is a keyframe that already exists in app/globals.css
   (`drift`, `k-driftr`, `k-livedot`, `k-heart`, `k-burst`). Nothing here
   defines a new one, and nothing here hides content that script has to give
   back — see the note on `t` in `Stats` below.
   ========================================================================== */

/*
 * NOTE ON EXPORTS — this file sits at app/sections/host-strip/page.tsx, so
 * Next treats it as a ROUTE, and a route module may only carry the named
 * exports Next allows (`metadata`, `revalidate`, `dynamic`, …). A named
 * `export function HostStrip()` compiles under tsc and then fails
 * `next build` with:
 *
 *   Type error: "HostStrip" is not a valid Page export field.
 *
 * Both sections are therefore module-private and reach the landing page
 * through the default export below. Same constraint the hero hit with its
 * PROOF_STRIP const.
 */

/**
 * `10000 -> "10.000"`.
 *
 * The design calls `Number.prototype.toLocaleString('id-ID')`. This does the
 * same grouping arithmetically so a server render and a client render cannot
 * disagree about it — `toLocaleString` depends on the ICU data the Node build
 * happens to ship, and a thousands separator that differs between the two is a
 * hydration mismatch on the first thing the strip shows. Inputs here are always
 * non-negative, which is the case this handles.
 */
function idn(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * The design's `rp(base)` — `'Rp ' + Math.round(base * 1.3).toLocaleString(...)`.
 *
 * The 1.3 is the platform-fee subtotal, so it comes from the pricing module
 * rather than being written out again here; a second copy of that multiplier is
 * how the displayed price and the charged price drift apart.
 */
function hourlyPrice(basePrice: number): string {
  return `Rp ${idn(subtotalWithPlatformFee(basePrice))}/jam`;
}

/**
 * ILLUSTRATIVE sample hosts, copied verbatim from the design file's `HOSTS`
 * const. These are not rows from the `streamers` table — the names, cities,
 * categories and base prices are the designer's stand-ins, and the photos are
 * the four stock shots in public/images/.
 *
 * The marquee is decorative: it shows what the marketplace looks like, not who
 * is currently on it. If this strip should ever advertise real, bookable hosts,
 * this const is the thing to replace with a Supabase query (`is_active` +
 * `verification_status = 'approved'`, the same filter the hero carousel uses) —
 * not something to quietly leave as-is while adding a "book now" link.
 */
const SAMPLE_HOSTS = [
  { name: "Ayu P.", base: 120000, meta: "Jakarta Selatan · Fashion", photo: "1people.png" },
  { name: "Nadia K.", base: 95000, meta: "Bandung · Fashion muslim", photo: "17.png" },
  { name: "Sri W.", base: 150000, meta: "Surabaya · Rumah tangga", photo: "18.png" },
  { name: "Rina A.", base: 185000, meta: "Jakarta Barat · Beauty", photo: "16.png" },
  { name: "Lia K.", base: 110000, meta: "Bekasi · Lifestyle", photo: "17.png" },
  { name: "Maya S.", base: 78000, meta: "Yogyakarta · Food", photo: "16.png" },
  { name: "Fitri H.", base: 135000, meta: "Tangerang · Fashion", photo: "18.png" },
  { name: "Dita M.", base: 88000, meta: "Semarang · Gadget", photo: "1people.png" },
] as const;

/** The design's `CHIPS`. Category labels, no data behind them. */
const CHIPS = [
  "Fashion",
  "Beauty & skincare",
  "Makanan & minuman",
  "Rumah tangga",
  "Gadget",
  "Fashion muslim",
  "Ibu & anak",
  "Olahraga",
  "Kecantikan pria",
  "Aksesori",
  "Kesehatan",
  "Perlengkapan hewan",
] as const;

/*
  Both marquees are the list twice over. `drift` ends at translateX(-50%) and
  `k-driftr` starts there, so the halfway point of a doubled track is pixel-for-
  pixel its start — that is what makes the loop seamless, and it is why the
  duplication cannot be dropped.
*/
const STRIP_HOSTS = [...SAMPLE_HOSTS, ...SAMPLE_HOSTS];
const STRIP_CHIPS = [...CHIPS, ...CHIPS];

/**
 * The host strip: a row of cards drifting left over a row of category chips
 * drifting right. Both pause while the pointer is over them.
 */
function HostStrip() {
  return (
    <section
      id="host"
      className="flex flex-col gap-[18px] overflow-hidden pb-[clamp(56px,9vh,96px)]"
    >
      {/*
        The animation is set with the longhand properties rather than the
        `animation` shorthand on purpose: the shorthand also resets
        `animation-play-state` to `running`, and an inline declaration beats the
        `hover:` class, so the shorthand would make the marquee unpausable.
        globals.css still stops all of it under prefers-reduced-motion — its
        rule matches on `[style*="animation"]`, which the longhands satisfy.
      */}
      <div
        className="flex w-max gap-[18px] px-[clamp(20px,5vw,48px)] hover:[animation-play-state:paused]"
        style={{
          animationName: "drift",
          animationDuration: "52s",
          animationTimingFunction: "linear",
          animationIterationCount: "infinite",
        }}
      >
        {STRIP_HOSTS.map((host, i) => {
          // Every third card is live. `heartDelay` is the design's
          // `(i % 3) * 0.6s` formula kept as written — note it can only ever
          // evaluate to 0s, because the heart is rendered inside the same
          // `i % 3 === 0` branch. The hearts beat in unison; that is the
          // design's behaviour, not a port error.
          const isLive = i % 3 === 0;
          const heartDelay = `${(i % 3) * 0.6}s`;

          return (
            <div
              key={`${host.name}-${i}`}
              // The second pass is the same eight people again. Sighted users
              // read it as one continuous band; a screen reader would read the
              // list twice, so the duplicate half is hidden from it.
              aria-hidden={i >= SAMPLE_HOSTS.length}
              // The transition is one arbitrary declaration rather than a
              // duration utility plus an easing utility. tailwindcss-animate
              // claims those two prefixes as well, so an arbitrary value on
              // either is ambiguous and Tailwind resolves it by emitting
              // nothing — the card would have snapped instead of easing. Same
              // reason for the two colour transitions and the bar below.
              className="w-[clamp(160px,17vw,220px)] flex-shrink-0 [transition:transform_.4s_cubic-bezier(.16,1,.3,1)] hover:-translate-y-1.5"
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[10px] border border-hairline bg-surface-tint">
                <Image
                  src={`/images/${host.photo}`}
                  alt={host.name}
                  fill
                  sizes="220px"
                  // `background-size:cover;background-position:center top`.
                  className="object-cover object-top"
                />

                {isLive && (
                  <>
                    <span className="absolute left-[9px] top-[9px] flex items-center gap-[5px] rounded-[4px] bg-ink/[.68] px-2 py-1 backdrop-blur-[6px]">
                      <span
                        className="h-1 w-1 rounded-[2px] bg-white"
                        style={{ animation: "k-livedot 1.6s ease-in-out infinite" }}
                      />
                      <span className="font-mono text-[8.5px] tracking-[.1em] text-white">
                        LIVE
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className="absolute bottom-3 right-2.5 text-mini text-white"
                      style={{ animation: `k-heart 3s ease-out infinite ${heartDelay}` }}
                    >
                      ♥
                    </span>
                  </>
                )}
              </div>

              <div className="mt-[11px] flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold text-ink">{host.name}</span>
                <span className="numeric font-mono text-[11.5px] text-ink-muted">
                  {hourlyPrice(host.base)}
                </span>
              </div>
              <p className="mt-[3px] text-mini text-ink-faint">{host.meta}</p>
            </div>
          );
        })}
      </div>

      <div
        className="flex w-max gap-3 px-[clamp(20px,5vw,48px)] hover:[animation-play-state:paused]"
        style={{
          animationName: "k-driftr",
          animationDuration: "44s",
          animationTimingFunction: "linear",
          animationIterationCount: "infinite",
        }}
      >
        {STRIP_CHIPS.map((label, i) => (
          <span
            key={`${label}-${i}`}
            aria-hidden={i >= CHIPS.length}
            className="inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-hairline bg-surface px-[15px] py-2 text-meta text-ink-body"
          >
            <span
              className={`h-[5px] w-[5px] rounded-[3px] ${
                i % 3 === 0 ? "bg-brand" : "bg-hairline-input"
              }`}
            />
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------------
   Stats
   -------------------------------------------------------------------------- */

interface Stat {
  /** The figure the count-up lands on. */
  to: number;
  label: string;
  /** The second line the easter egg swaps in. */
  egg: string;
  /** How the running value is rendered at time `t`. */
  fmt: (n: number) => string;
}

/**
 * ⚠️ ILLUSTRATIVE FIGURES — NOT COMPUTED.
 *
 * All four of these are marketing claims copied from the design file's `STATS`
 * const. Nothing in this product measures them: there is no query behind "250+
 * livestreamer aktif", no session count behind "10.000+", no review table
 * behind "4,9", and no GMV behind "Rp 5M+". An earlier pass deleted the same
 * four claims from the hero for exactly that reason (see the closing comment in
 * app/sections/hero/page.tsx); they are back only because the landing page is
 * being rebuilt to match the design one-for-one.
 *
 * They are all in this one const so the decision stays reversible and obvious:
 * deleting `ILLUSTRATIVE_STATS` deletes the whole stats bar, and there is no
 * second place asserting these numbers. If any of them should ever be shown as
 * fact, it needs a real query first.
 */
const ILLUSTRATIVE_STATS: Stat[] = [
  {
    to: 250,
    label: "Livestreamer aktif",
    egg: "…dan nambah tiap minggu",
    fmt: (n) => `${idn(n)}+`,
  },
  {
    to: 10000,
    label: "Sesi live selesai",
    egg: "≈ 21.000 jam siaran",
    fmt: (n) => `${idn(n)}+`,
  },
  {
    to: 4.9,
    label: "Rating kepuasan",
    egg: "dari 1.000+ ulasan brand",
    fmt: (n) => n.toFixed(1).replace(".", ","),
  },
  {
    to: 5,
    label: "Total penjualan",
    egg: "GMV lewat sesi Salda",
    fmt: (n) => `Rp ${n.toFixed(0)}M+`,
  },
];

/** React does not type CSS custom properties, and `k-burst` reads two of them. */
type BurstStyle = React.CSSProperties & { "--bx": string; "--by": string };

/** The five particles the easter egg throws, verbatim from the design. */
const EGG_PARTICLES = [
  { size: 6, radius: 3, marginLeft: -3, tone: "bg-brand", bx: "-42px", by: "-26px", delay: "0s" },
  { size: 5, radius: 3, marginLeft: -3, tone: "bg-brand", bx: "38px", by: "-30px", delay: ".04s" },
  { size: 6, radius: 3, marginLeft: -3, tone: "bg-ink", bx: "-24px", by: "24px", delay: ".08s" },
  { size: 5, radius: 3, marginLeft: -3, tone: "bg-ink", bx: "30px", by: "22px", delay: ".12s" },
  { size: 4, radius: 2, marginLeft: -2, tone: "bg-brand", bx: "0px", by: "-40px", delay: ".16s" },
] as const;

/** How long the egg's alternate label and blue figure stay up. */
const EGG_DURATION_MS = 2600;

function Stats() {
  /**
   * `t` runs 0 -> 1 and every figure is `stat.to * t`.
   *
   * It starts at 1, which is the whole safety contract: the server renders the
   * final numbers, and a browser with no IntersectionObserver, no JS, or
   * `prefers-reduced-motion: reduce` keeps them. Only once the observer is
   * actually attached below does `t` drop to 0 so it has something to count up
   * from — the same order the design file uses.
   */
  const [t, setT] = useState(1);
  const [egg, setEgg] = useState(-1);

  const gridRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const eggTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // Asked not to animate: the numbers stay at their final values and no
    // observer is created at all. Same early return as the design's watchStats.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    setT(0);

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        // Fires once, then stops watching.
        observer.disconnect();

        const start = performance.now();
        const duration = 1400;
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / duration);
          setT(1 - Math.pow(1 - p, 3)); // ease-out cubic
          if (p < 1) rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(
    () => () => {
      if (eggTimerRef.current) clearTimeout(eggTimerRef.current);
    },
    [],
  );

  const popEgg = useCallback((i: number) => {
    setEgg(i);
    if (eggTimerRef.current) clearTimeout(eggTimerRef.current);
    eggTimerRef.current = setTimeout(() => setEgg(-1), EGG_DURATION_MS);
  }, []);

  const barWidth = `${(t * 100).toFixed(0)}%`;

  return (
    <section className="border-y border-hairline">
      <div
        ref={gridRef}
        className="mx-auto grid max-w-[1180px] grid-cols-[repeat(auto-fit,minmax(160px,1fr))] px-[clamp(20px,5vw,48px)]"
      >
        {ILLUSTRATIVE_STATS.map((stat, i) => {
          const isEgg = egg === i;

          return (
            <button
              key={stat.label}
              type="button"
              onClick={() => popEgg(i)}
              className="relative border-r border-hairline-soft px-2 py-[30px] text-center font-sans hover:bg-surface-raised"
            >
              <p
                className={`numeric mb-1.5 font-mono text-[clamp(24px,3vw,34px)] font-medium tracking-[-.02em] [transition:color_.3s_ease] ${
                  isEgg ? "text-brand" : "text-ink"
                }`}
              >
                {stat.fmt(stat.to * t)}
              </p>
              <p
                className={`mb-3 text-meta [transition:color_.3s_ease] ${
                  isEgg ? "text-brand" : "text-ink-soft"
                }`}
              >
                {isEgg ? stat.egg : stat.label}
              </p>

              {/* 56 x 2, filling in step with the same `t` as the figure. */}
              <span className="mx-auto block h-0.5 w-14 overflow-hidden rounded-[1px] bg-hairline-soft">
                <span
                  className="block h-full bg-brand [transition:width_.3s_linear]"
                  style={{ width: barWidth }}
                />
              </span>

              {isEgg &&
                EGG_PARTICLES.map((particle) => (
                  <span
                    key={particle.delay}
                    aria-hidden
                    className={`absolute left-1/2 top-[38px] ${particle.tone}`}
                    style={
                      {
                        width: particle.size,
                        height: particle.size,
                        marginLeft: particle.marginLeft,
                        borderRadius: particle.radius,
                        "--bx": particle.bx,
                        "--by": particle.by,
                        animation: `k-burst .9s cubic-bezier(.16,1,.3,1) forwards ${particle.delay}`,
                      } as BurstStyle
                    }
                  />
                ))}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Both halves in page order, so app/page.tsx can mount the pair with one
 * import. `HostStrip` and `Stats` are exported separately for the case where
 * something needs to sit between them.
 */
export default function HostStripAndStats() {
  return (
    <>
      <HostStrip />
      <Stats />
    </>
  );
}
