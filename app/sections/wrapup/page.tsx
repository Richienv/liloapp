"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Chynta Claudia",
    occupation: "Jiniso",
    rating: 5,
    testimonial: "Selama Jiniso menggunakan jasa host service TRO, penjualan di Shopee Live Jiniso ada peningkatan, dari host dan managementnya pun juga bisa menyesuaikan dengan sistem dan rules yang jiniso berikan.",
  },
  {
    name: "Andjani",
    occupation: "Mondelez", 
    rating: 5,
    testimonial: "I want to give a huge shoutout to TRO for their exceptional work on our live streaming and short video for the past 2 years. The production quality was top-notch, and the technical support was always prompt and effective. They selected perfect host for our brand, and the content created was engaging and spot-on!",
  },
  {
    name: "Maggie",
    occupation: "Herbal Essences | Pantene | Rejoice",
    rating: 5,
    testimonial: "It's a very great experience working with TRO Team. A very speedy & proactive team - allowing brands to improve my brands' livestream performance while investing on their team. Thankyou TRO!",
  },
  {
    name: "Lala",
    occupation: "Shopee Team",
    rating: 5,
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
    <section id="testimoni" className="py-12 md:py-24 bg-surface relative overflow-hidden">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-[1200px] mx-auto">
          {/* Section Header */}
          <div className="text-center mb-8 md:mb-16">
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
        <div className="relative">
          {/* Gradient Container */}
          <div className="absolute inset-0 pointer-events-none max-w-[1400px] mx-auto left-0 right-0">
            {/* Left Gradient */}
            <div className="absolute left-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-r from-canvas to-transparent z-20" />
            {/* Right Gradient */}
            <div className="absolute right-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-l from-canvas to-transparent z-20" />
          </div>

          {/* Testimonials Slider Container */}
          <div 
            className="relative overflow-hidden touch-none"
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
            <div className="max-w-[1400px] mx-auto">
              <div className="flex gap-4 md:gap-8 px-4 md:px-8" ref={containerRef}>
                <motion.div 
                  className="flex gap-4 md:gap-8"
                  animate={controls}
                >
                  {doubledTestimonials.map((testimonial, index) => (
                    <div
                      key={index}
                      className="flex-shrink-0 w-[260px] sm:w-[320px] md:w-[400px] bg-canvas rounded-frame md:rounded-3xl p-4 md:p-6 relative z-10"
                    >
                      {/* Rating */}
                      <div className="flex gap-1 mb-3 md:mb-4">
                        {[...Array(testimonial.rating)].map((_, i) => (
                          <Star key={i} className="w-3 h-3 md:w-4 md:h-4 fill-red-500 text-red-500" />
                        ))}
                      </div>

                      {/* Testimonial Text */}
                      <p className="text-ink text-sm md:text-lg mb-4 md:mb-8">"{testimonial.testimonial}"</p>

                      {/* Profile */}
                      <div>
                        <h4 className="text-ink font-medium text-xs md:text-base mb-1">{testimonial.name}</h4>
                        <p className="text-ink-soft text-[10px] md:text-sm">{testimonial.occupation}</p>
                      </div>
                    </div>
                  ))}
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Background Decorations */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-8 md:-left-12 w-16 md:w-24 h-16 md:h-24 bg-surface-tint rounded-full blur-xl" />
        <div className="absolute bottom-1/4 -right-8 md:-right-12 w-16 md:w-24 h-16 md:h-24 bg-surface-tint rounded-full blur-xl" />
      </div>
    </section>
  );
}