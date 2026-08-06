"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";

/**
 * design-lint-allow: gradient
 *
 * Two marquee edge fades. Same exception as the hero: they signal that the
 * row scrolls, which nothing else in the layout communicates.
 */

/**
 * "Kita udah ngebantu mereka."
 *
 * Four quotes, attributed, as they were given. The five-star row that used to
 * sit above each one is gone: it was a hardcoded `rating: 5` on every card,
 * drawn in `fill-red-500`. Nothing in this product produced those stars, no
 * reviewer left them, and a rating nobody gave is exactly the fabricated social
 * proof this redesign has been removing everywhere else. The quote and who said
 * it are the claim; five red glyphs were decoration pretending to be data.
 *
 * The quotes themselves are left verbatim, including the two in English —
 * translating what someone said is not a copy fix, it is putting words in their
 * mouth.
 */
const testimonials = [
  {
    name: "Chynta Claudia",
    occupation: "Jiniso",
    testimonial: "Selama Jiniso menggunakan jasa host service TRO, penjualan di Shopee Live Jiniso ada peningkatan, dari host dan managementnya pun juga bisa menyesuaikan dengan sistem dan rules yang jiniso berikan.",
  },
  {
    name: "Andjani",
    occupation: "Mondelez",
    testimonial: "I want to give a huge shoutout to TRO for their exceptional work on our live streaming and short video for the past 2 years. The production quality was top-notch, and the technical support was always prompt and effective. They selected perfect host for our brand, and the content created was engaging and spot-on!",
  },
  {
    name: "Maggie",
    occupation: "Herbal Essences | Pantene | Rejoice",
    testimonial: "It's a very great experience working with TRO Team. A very speedy & proactive team - allowing brands to improve my brands' livestream performance while investing on their team. Thankyou TRO!",
  },
  {
    name: "Lala",
    occupation: "Shopee Team",
    testimonial: "Tro helpful bgt for the accounts i hold sampe ak rekomen-rekomen ke brandku yg lain dan juga brand-brand personal tmn tmn aku yg mau coba live streaming.",
  }
];

// Double the testimonials array for smooth infinite scroll
const doubledTestimonials = [...testimonials, ...testimonials];

export default function Wrapup() {
  const controls = useAnimationControls();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const startAnimation = async () => {
      if (isHovered) return;

      await controls.start({
        x: [0, -100 * testimonials.length],
        transition: {
          duration: 20,
          ease: "linear",
          repeat: Infinity,
        },
      });
    };

    startAnimation();
  }, [controls, isHovered]);

  return (
    /*
      Canvas, not a white band — the cards are the white. Two blurred grey
      circles used to float behind this section as "background decorations";
      they said nothing and are gone.
    */
    <section
      id="testimoni"
      className="relative overflow-hidden bg-canvas pt-[clamp(72px,12vh,140px)]"
    >
      <div className="mx-auto w-full max-w-[1180px] px-5 sm:px-8 lg:px-12">
        {/* Section Header */}
        <div className="mx-auto max-w-[46ch] text-center">
          {/* The numbered eyebrow ties this to the other sections; the
              heading and sub are the reference's, split across the two lines
              it splits them across. */}
          <p className="font-mono text-mini tracking-[.08em] text-ink-ghost">
            03 / Apa kata mereka
          </p>
          <h2 className="mt-4 font-serif text-heading font-medium text-balance text-ink">
            Kita udah ngebantu mereka.
          </h2>
          <p className="mt-3.5 text-lede text-ink-muted">
            Sekarang kita ingin ngebantu kamu.
          </p>
        </div>
      </div>

      {/* Full-width slider container */}
      <div className="relative mt-12">
        {/* Edge fades — the marquee runs off the page rather than stopping at
            a hard edge. One of the two gradients the brief still allows. */}
        <div className="pointer-events-none absolute inset-0 z-20 mx-auto max-w-[1400px]">
          <div className="absolute bottom-0 left-0 top-0 w-16 bg-gradient-to-r from-canvas to-transparent md:w-32" />
          <div className="absolute bottom-0 right-0 top-0 w-16 bg-gradient-to-l from-canvas to-transparent md:w-32" />
        </div>

        {/* Testimonials Slider Container */}
        <div
          className="relative touch-none overflow-hidden"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => {
            setIsHovered(false);
            controls.start({
              x: [0, -100 * testimonials.length],
              transition: {
                duration: 20,
                ease: "linear",
                repeat: Infinity,
              },
            });
          }}
        >
          {/* Cards Container with max-width and center alignment */}
          <div className="mx-auto max-w-[1400px]">
            <div className="flex gap-4 px-4 md:gap-8 md:px-8" ref={containerRef}>
              <motion.div
                className="flex gap-4 md:gap-8"
                animate={controls}
              >
                {doubledTestimonials.map((testimonial, index) => (
                  <div
                    key={index}
                    className="relative z-10 flex w-[260px] flex-shrink-0 flex-col rounded-frame border border-hairline bg-surface p-5 sm:w-[320px] md:w-[400px] md:p-6"
                  >
                    {/* Testimonial Text */}
                    <p className="flex-1 text-copy leading-relaxed text-ink-body md:text-lede">
                      &ldquo;{testimonial.testimonial}&rdquo;
                    </p>

                    {/* Profile */}
                    <div className="mt-5 border-t border-hairline-soft pt-4 md:mt-6">
                      <p className="truncate text-ui font-medium text-ink">{testimonial.name}</p>
                      <p className="truncate text-meta text-ink-soft">{testimonial.occupation}</p>
                    </div>
                  </div>
                ))}
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
