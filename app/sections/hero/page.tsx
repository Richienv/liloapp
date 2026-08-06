"use client";

import { MapPin, Star } from "lucide-react";
import Image from "next/image";
import { subtotalWithPlatformFee } from "@/lib/pricing";
import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

// Profiles are completed after the account exists, so an approved streamer can
// still be missing any of these columns.
interface Streamer {
  id: number;
  first_name: string;
  last_name: string;
  platform: string | null;
  location: string | null;
  city_slug?: string | null;
  price: number | null;
  image_url: string | null;
  rating?: number | null;
  total_hours?: number;
}

/** Same stand-in avatar the rest of the app falls back to. */
const PLACEHOLDER_AVATAR = '/default-avatar.png';

/**
 * The host's actual name.
 *
 * This function used to ignore both arguments and return
 * `Streamer ${String.fromCharCode(65 + index % 26)}` — "Streamer A", "Streamer
 * B" — so the carousel showed a real person's photo and real city under an
 * invented name. Removing the anonymising in the data layer was not enough
 * while this was still here; it is the second half of the same bug.
 *
 * Falls back to a generic label only when the row genuinely has no name yet,
 * which happens on a profile the host has not finished.
 */
function formatName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  return [firstName, lastName].filter(Boolean).join(' ').trim() || 'Host Salda';
}

function formatPrice(price: number): string {
  const priceWithPlatformFee = subtotalWithPlatformFee(price); // base + 30% platform fee
  return `Rp ${Math.round(priceWithPlatformFee).toLocaleString('id-ID')}`;
}

/**
 * Rating as a figure, not as five glyphs.
 *
 * The five-star row was drawn in `yellow-400`, a colour that exists nowhere in
 * this palette, and four of the five stars carried no information — the number
 * is the whole payload. One outline mark plus the value in tabular figures
 * says the same thing in a quarter of the width, which is what lets the meta
 * line stay on one row next to the city.
 *
 * An unrated host is not a zero-rated host, so it says so in words.
 */
function HostRating({ rating }: { rating: number | null | undefined }) {
  const hasRating = typeof rating === 'number' && Number.isFinite(rating) && rating > 0;

  if (!hasRating) {
    return <span className="shrink-0 text-mini text-white/50">Belum ada rating</span>;
  }

  return (
    <span className="flex shrink-0 items-center gap-1 text-mini text-white/80">
      <Star className="h-3 w-3 fill-white/90 text-white/90" />
      <span className="numeric">{rating.toFixed(1)}</span>
    </span>
  );
}

/**
 * Loading state for one carousel card.
 *
 * It is the card's own frame, pulsing — not a second layout. The version this
 * replaces built a glass panel out of `bg-white/10` and `bg-white/20` bars over
 * nothing, so the skeleton and the loaded card did not even share a silhouette
 * and the marquee jumped as the data arrived.
 */
const StreamerCardSkeleton = () => (
  <div className="relative w-[calc((100vw-3rem)/1.5)] min-w-[220px] max-w-[400px] flex-shrink-0 sm:w-[calc((100vw-8rem)/2)] sm:min-w-[280px] md:w-[calc((100vw-8rem)/3)]">
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-panel bg-surface-deep sm:aspect-[3/4] sm:rounded-frame">
      <div className="absolute inset-x-0 bottom-0 space-y-2 p-3 sm:p-4">
        <div className="h-4 w-2/3 animate-pulse rounded-chip bg-surface-tint" />
        <div className="h-3 w-1/2 animate-pulse rounded-chip bg-surface-tint" />
        <div className="h-4 w-1/3 animate-pulse rounded-chip bg-surface-tint" />
      </div>
    </div>
  </div>
);

/** The headline's rotating tail. Same meaning, three ways a brand says it. */
const ROTATING_WORDS = ['produk kamu.', 'brand kamu.', 'toko kamu.'] as const;

export default function Hero() {
  const [rotatingIndex, setRotatingIndex] = useState(0);

  useEffect(() => {
    // Paused for anyone who has asked for reduced motion: a word swapping
    // itself every few seconds is exactly the kind of unrequested movement
    // that setting exists to stop.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(
      () => setRotatingIndex((i) => (i + 1) % ROTATING_WORDS.length),
      2600,
    );
    return () => clearInterval(timer);
  }, []);
  const [streamers, setStreamers] = useState<Streamer[]>([]);
  const [duplicatedStreamers, setDuplicatedStreamers] = useState<Streamer[]>([]);
  const [isLoadingStreamers, setIsLoadingStreamers] = useState(true);

  useEffect(() => {
    const fetchStreamers = async () => {
      setIsLoadingStreamers(true);
      try {
        const supabase = createClient();
        // Same bookability rule as every other public listing: the landing-page
        // marquee is the first thing a brand sees, so it must not showcase
        // accounts that have not been verified. `username` and `city_slug` come
        // along so the cards can link to a real profile and compare cities.
        const { data, error } = await supabase
          .from('streamers')
          .select('id, first_name, last_name, username, platform, location, city_slug, price, image_url, rating')
          .eq('is_active', true)
          .eq('verification_status', 'approved')
          .limit(10);

        if (error) {
          console.error('Error fetching streamers:', error);
          return;
        }

        // These are real, verified people, shown with their real photos and
        // real cities. Everything on the card is now theirs.
        //
        // It used to overwrite `first_name` with the literal "Streamer" and
        // `last_name` with a letter of the alphabet, assign a rating of
        // `4.5 + Math.random() * 0.5`, and splice in one of five hardcoded
        // sales/experience/specialty blocks by index. So a host with 4 sessions
        // was advertised as having 234, a brand-new host was rated 4.8, and the
        // number changed on every render — a claim about a named person that
        // was not true and could not be checked.
        //
        // An unrated host now shows "Belum ada rating", which is what the card
        // component was written to do.
        setStreamers(data || []);
      } catch (error) {
        console.error('Error in fetchStreamers:', error);
      } finally {
        setIsLoadingStreamers(false);
      }
    };

    fetchStreamers();
  }, []);

  useEffect(() => {
    setDuplicatedStreamers([...streamers, ...streamers, ...streamers]);
  }, [streamers]);

  // Generate skeleton streamer cards
  const generateSkeletonStreamers = (count: number) => {
    return Array(count).fill(0).map((_, index) => (
      <StreamerCardSkeleton key={`skeleton-${index}`} />
    ));
  };

  return (
    /*
      Warm canvas, nothing behind it.

      `<CustomBackground />` used to paint two blue radial glows across the top
      of the page on a #faf9f5 base — a decoration gradient, half a shade off
      the canvas token, and two more blue things in the one section that already
      spends its accent on the CTA. The page is the canvas now.
    */
    <section
      className="relative min-h-screen overflow-hidden bg-canvas pt-24 sm:pt-32"
      aria-label="Platform Live Commerce #1 di Indonesia"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "Salda by TROLIVE",
            "description": "Platform host live streaming dari TROLIVE untuk boost penjualan produk kamu di TIKTOK & SHOPEE LIVE dengan harga terjangkau .",
            "brand": {
              "@type": "Brand",
              "name": "TROLIVE"
            },
            // No aggregateRating. It was hardcoded to 4.9 from 1000 reviews,
            // neither of which is a number this product has ever computed.
            // Review markup that does not correspond to real reviews is what
            // Google issues manual actions for, and the penalty lands on the
            // whole domain rather than the one page.
            "offers": {
              "@type": "AggregateOffer",
              "priceCurrency": "IDR",
              "availability": "https://schema.org/InStock"
            }
          })
        }}
      />

      <div className="mx-auto flex w-full max-w-[1180px] flex-col items-center px-5 pt-8 sm:px-8 sm:pt-14 lg:px-12">
        {/*
          No mount animation on the first thing a visitor sees.

          This block used to be a `motion.div` starting at `opacity: 0`, which
          is the server-rendered state too — so a hydration failure left the
          headline, the sub and the CTA permanently invisible. Same contract as
          the scroll reveal in globals.css: content is visible by default, and
          motion is only ever allowed to take something away that script is
          already alive to give back.
        */}
        <div className="w-full text-center">
          <div className="mb-6 flex items-center justify-center">
            <span className="rounded-pill border border-hairline bg-surface px-3 py-1.5 text-mini font-medium text-ink-muted">
              Shopee &amp; TikTok Live-Seller Supported
            </span>
          </div>

          {/*
            The headline is one sentence with a rotating tail. The three
            words all mean the same thing to a brand — produk, brand, toko
            — which is the point: it reads as the product knowing who is
            looking, not as a slogan.

            The tail is ink, not accent. The section's one blue is the CTA
            below it; a blue rotating word made two, and the word is already
            the only thing on the line that moves.
          */}
          <h1 className="mx-auto max-w-[16ch] font-serif text-hero font-medium text-balance text-ink">
            <span className="sr-only">Salda by TROLIVE — </span>
            Host livestreamer terlatih untuk{' '}
            <span className="text-ink">{ROTATING_WORDS[rotatingIndex]}</span>
          </h1>

          <p className="mx-auto mt-6 max-w-[52ch] text-lede text-ink-muted">
            Booking host yang sudah terverifikasi, atur jadwal live, dan bayar di satu
            tempat. Rata-rata brand mulai live dalam tiga hari setelah mendaftar.
          </p>

          <Link
            href="/streamers"
            className="mt-8 inline-flex h-[46px] w-[220px] items-center justify-center rounded-lg
              bg-brand text-ui font-semibold text-white transition-colors hover:bg-brand-hover
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
              focus-visible:ring-offset-2"
          >
            Mulai cari host
          </Link>

          {/*
            Replaces three "trust badges" that asserted "Rating 4.9/5" and
            "250+ Host Aktif" as facts. Neither is a number this product
            computes. This one is checkable: signing up is free, and you
            are charged at booking.
          */}
          <p className="mt-5 text-mini text-ink-soft">
            Gratis mendaftar · bayar hanya saat booking
          </p>
        </div>

        {/* Streamer Cards Carousel */}
        <div
          id="host"
          className="relative -mx-4 mt-12 mb-6 min-h-[350px] w-screen overflow-hidden sm:mt-16 sm:mb-12 sm:min-h-[500px] md:mb-16 md:min-h-[600px]"
        >
          <motion.div
            animate={{
              x: [0, -100 * Math.ceil(streamers.length / 3)],
            }}
            transition={{
              x: {
                repeat: Infinity,
                repeatType: "loop",
                duration: 20,
                ease: "linear",
              },
            }}
            className="flex gap-3 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6 md:gap-8 md:px-8 md:py-8 lg:px-16"
          >
            {isLoadingStreamers
              ? generateSkeletonStreamers(15) // Display 15 skeleton cards while loading
              : duplicatedStreamers.map((streamer, index) => (
                <div
                  key={`${streamer.id}-${index}`}
                  className="group relative w-[calc((100vw-3rem)/1.5)] min-w-[220px] max-w-[400px] flex-shrink-0 sm:w-[calc((100vw-8rem)/2)] sm:min-w-[280px] md:w-[calc((100vw-8rem)/3)]"
                >
                  {/*
                    Photo, scrim, text — no frosted panel.

                    The card used to float a `bg-white/10` glass box with a
                    `border-white/20` edge over the bottom of the photo, hung
                    there on a -mt-48. A translucent white fill is not a surface
                    in this system, and the box was there only to buy contrast
                    the scrim already provides. The scrim is the one gradient the
                    brief allows: white text over a photograph.
                  */}
                  <div className="relative aspect-[4/5] w-full overflow-hidden rounded-panel bg-surface-deep transition-transform duration-500 group-hover:-translate-y-2 sm:aspect-[3/4] sm:rounded-frame">
                    <Image
                      src={streamer.image_url || PLACEHOLDER_AVATAR}
                      alt={formatName(streamer.first_name, streamer.last_name)}
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />

                    <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                      {/* One row, always. The name truncates; the platform
                          label never drops to a second line. */}
                      <div className="flex min-w-0 items-baseline gap-2">
                        <h3 className="min-w-0 flex-1 truncate text-copy font-medium text-white sm:text-title">
                          {formatName(streamer.first_name, streamer.last_name)}
                        </h3>
                        {/* No platform set yet: render no label at all rather
                            than an empty floating chip */}
                        {streamer.platform && (
                          <span className="shrink-0 font-mono text-micro uppercase text-white/70">
                            {streamer.platform}
                          </span>
                        )}
                      </div>

                      <div className="mt-1.5 flex min-w-0 items-center gap-2">
                        <MapPin className="h-3 w-3 shrink-0 text-white/50" />
                        <span className="min-w-0 flex-1 truncate text-mini text-white/70">
                          {streamer.location || streamer.city_slug || 'Lokasi belum diatur'}
                        </span>
                        <HostRating rating={streamer.rating} />
                      </div>

                      {/*
                        An "Orders" count, an "Experience" figure and three
                        specialty chips used to sit here, all read from a
                        five-row hardcoded table indexed by position in the
                        carousel. They described nobody. The price is the
                        one number on this card that is actually this
                        host's, so it is the one the card shows.
                      */}
                      {typeof streamer.price === 'number' && streamer.price > 0 && (
                        <p className="numeric mt-2.5 whitespace-nowrap text-copy font-semibold text-white sm:text-ui">
                          {formatPrice(streamer.price)}
                          <span className="ml-1 font-normal text-white/60">/ jam</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            }
          </motion.div>

          {/* Edge fades. The other gradient the brief allows: a marquee has to
              run off the page rather than stop at a hard edge. */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-30 w-[15%] bg-gradient-to-r from-canvas via-canvas/80 to-transparent sm:w-[10%]" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-30 w-[15%] bg-gradient-to-l from-canvas via-canvas/80 to-transparent sm:w-[10%]" />
        </div>

        {/*
          The "Static Achievement Badges" row is gone.

          Seven cards, seven icons in seven different colours, asserting
          "250+ Livestreamer Aktif", "Rp 5M+ Total Penjualan", "4.9/5.0 Rating
          Kepuasan", "10,000+ Live Sessions" and "2-3x lipat penjualan normal".
          Not one of those figures is computed anywhere in this product — they
          were literals in an array — and they were the same three claims the
          trust badges above were already deleted for. The checkable line under
          the CTA is what replaces them.
        */}
      </div>
    </section>
  );
}
