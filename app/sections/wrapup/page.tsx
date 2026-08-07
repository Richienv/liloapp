/*
 * design-lint-allow: raw-hex
 *
 * Two design values with no token: #c9dcff, the card's hover border, and
 * #262626 for the quote, which sits between text-ink (#171717) and
 * text-ink-body (#404040). Both are the design file's own.
 */
/* ==========================================================================
   03 / Apa kata mereka — ported from design/Salda_Landing.dc.html
   (markup lines 414-438, data in the `TESTI` const at line 553).

   A centred header over a full-bleed marquee. The only animation is `drift`,
   already defined in app/globals.css; nothing here is hidden behind an
   observer, so the section's SSR output is its final output.
   ========================================================================== */

/*
 * NOTE ON EXPORTS — this file sits at app/sections/wrapup/page.tsx, so Next
 * treats it as a ROUTE and a route module may only carry the named exports
 * Next allows. Everything below is module-private and reaches the landing page
 * through the default export.
 */

/**
 * The design's `TESTI`, verbatim.
 *
 * These are attributed quotes from named people at named companies — Jiniso,
 * Mondelez, the Herbal Essences/Pantene/Rejoice group, Shopee. Two of them are
 * in English. They are left exactly as given: translating or tidying what
 * someone said is not a copy fix, it is putting words in their mouth.
 */
const TESTIMONIALS = [
  {
    name: "Chynta Claudia",
    occupation: "Jiniso",
    text: "Selama Jiniso menggunakan jasa host service TRO, penjualan di Shopee Live Jiniso ada peningkatan, dari host dan managementnya pun juga bisa menyesuaikan dengan sistem dan rules yang jiniso berikan.",
  },
  {
    name: "Andjani",
    occupation: "Mondelez",
    text: "I want to give a huge shoutout to TRO for their exceptional work on our live streaming and short video for the past 2 years. The production quality was top-notch, and the technical support was always prompt and effective. They selected perfect host for our brand, and the content created was engaging and spot-on!",
  },
  {
    name: "Maggie",
    occupation: "Herbal Essences | Pantene | Rejoice",
    text: "It's a very great experience working with TRO Team. A very speedy & proactive team - allowing brands to improve my brands' livestream performance while investing on their team. Thankyou TRO!",
  },
  {
    name: "Lala",
    occupation: "Shopee Team",
    text: "Tro helpful bgt for the accounts i hold sampe ak rekomen-rekomen ke brandku yg lain dan juga brand-brand personal tmn tmn aku yg mau coba live streaming.",
  },
] as const;

/** The design's `t.initials` — first letter of each word, first two, upper. */
function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/*
  The list twice over. `drift` ends at translateX(-50%), so the halfway point
  of a doubled track is pixel-for-pixel its start — that is what makes the loop
  seamless, and it is why the duplication cannot be dropped.
*/
const MARQUEE = [...TESTIMONIALS, ...TESTIMONIALS];

export default function Wrapup() {
  return (
    <section
      id="testimoni"
      className="mx-auto max-w-[1180px] px-[clamp(20px,5vw,48px)] pt-[clamp(72px,12vh,140px)]"
    >
      <div className="mx-auto mb-[clamp(36px,6vh,60px)] max-w-[640px] text-center">
        <p className="mb-4 font-mono text-mini tracking-[.08em] text-ink-ghost">
          03 / Apa kata mereka
        </p>
        <h2 className="mb-3.5 font-serif text-heading font-medium text-balance text-ink">
          Kita udah ngebantu mereka.
        </h2>
        <p className="text-[15.5px] leading-[1.6] text-ink-muted">
          Sekarang kita ingin ngebantu kamu.
        </p>
      </div>

      {/*
        Full bleed out of the 1180px column: `margin: 0 calc(50% - 50vw)` is the
        design's own escape hatch, and it is exact rather than a `100vw` trick
        that would drift by the scrollbar width.
      */}
      <div className="overflow-hidden py-1 [margin:0_calc(50%-50vw)]">
        {/*
          Longhand animation properties rather than the `animation` shorthand:
          the shorthand also resets `animation-play-state` to `running`, and an
          inline declaration beats the `hover:` class, so the shorthand would
          make the marquee unpausable. globals.css still stops all of it under
          prefers-reduced-motion — its rule matches on `[style*="animation"]`,
          which the longhands satisfy.
        */}
        <div
          className="flex w-max gap-5 px-2.5 hover:[animation-play-state:paused]"
          style={{
            animationName: "drift",
            animationDuration: "64s",
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
          }}
        >
          {MARQUEE.map((t, i) => (
            <figure
              key={`${t.name}-${i}`}
              // The second pass is the same four people again. Sighted readers
              // see one continuous band; a screen reader would read the list
              // twice, so the duplicate half is hidden from it.
              aria-hidden={i >= TESTIMONIALS.length}
              // One arbitrary `transition` declaration rather than a duration
              // utility plus an easing utility: tailwindcss-animate claims
              // those prefixes too, so an arbitrary value on either is
              // ambiguous and Tailwind emits nothing — the card would snap
              // instead of easing.
              // hover:border-[#c9dcff] — that pale blue is the design file's
              // own hover border (line 423) and has no token in the palette.
              className="m-0 flex w-[clamp(280px,32vw,400px)] flex-shrink-0 flex-col rounded-panel border border-hairline bg-surface p-[26px] [transition:transform_.4s_cubic-bezier(.16,1,.3,1),border-color_.3s_ease] hover:-translate-y-1.5 hover:border-[#c9dcff]"
            >
              <div
                aria-hidden
                className="mb-4 flex gap-[3px] text-mini tracking-[.12em] text-brand"
              >
                ★★★★★
              </div>
              <blockquote className="m-0 mb-[22px] flex-1 text-[14.5px] leading-[1.65] text-pretty text-[#262626]">
                {/* #262626 is the design's quote colour; it sits between
                    text-ink (#171717) and text-ink-body (#404040). */}
                {t.text}
              </blockquote>
              <figcaption className="flex items-center gap-[11px] border-t border-hairline-soft pt-[18px]">
                <span
                  aria-hidden
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl bg-hairline-soft text-mini font-semibold text-ink-muted"
                >
                  {initialsOf(t.name)}
                </span>
                <div>
                  <p className="mb-0.5 text-copy font-semibold text-ink">{t.name}</p>
                  <p className="text-meta text-ink-faint">{t.occupation}</p>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
