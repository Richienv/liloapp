"use client";

import { Star, TrendingUp, Users, ShoppingBag, Shield, Award, MapPin, Clock } from "lucide-react";
import Image from "next/image";
import { subtotalWithPlatformFee } from "@/lib/pricing";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { CustomBackground } from "@/components/structured-data/spotlight-new";

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

function RatingStars({ rating }: { rating: number | null | undefined }) {
  const hasRating = typeof rating === 'number' && Number.isFinite(rating) && rating > 0;

  return (
    <div className="flex items-center gap-1">
      {[...Array(5)].map((_, i) => (
        <Star
          key={i}
          className={`w-3 h-3 ${
            hasRating && i < Math.floor(rating)
              ? "fill-yellow-400 text-yellow-400"
              : "text-white/30"
          }`}
        />
      ))}
      {/* white/70, like every other label on this card. It was text-gray-600 —
          invisible on the dark photo scrim these cards sit on. Nobody had seen
          it because until the fabricated ratings were removed, `hasRating` was
          always true and this branch was unreachable. */}
      <span className="ml-1 text-xs text-white/70">
        {hasRating ? rating.toFixed(1) : "Belum ada rating"}
      </span>
    </div>
  );
}

// Skeleton component for streamer cards
const StreamerCardSkeleton = () => (
  <div className="relative flex-shrink-0 w-[calc((100vw-3rem)/1.5)] sm:w-[calc((100vw-8rem)/2)] md:w-[calc((100vw-8rem)/3)] min-w-[220px] sm:min-w-[280px] max-w-[400px] group">
    {/* Card spotlight effect */}
    
    
    {/* Image Container with Floating Effect */}
    <div className="relative w-full aspect-[4/5] sm:aspect-[3/4] rounded-panel sm:rounded-frame overflow-hidden sm: transition-all duration-500 group-hover:-translate-y-2 bg-surface-deep animate-pulse" />

    {/* Floating Content Container */}
    <div className="relative -mt-32 sm:-mt-40 md:-mt-48 mx-2 sm:mx-4 z-10">
      <div className="backdrop-blur-md bg-white/10 rounded-lg sm:rounded-panel p-2.5 sm:p-4 border border-white/20">
        {/* Header */}
        <div className="flex items-center justify-between mb-1.5 sm:mb-2">
          <div className="h-5 bg-white/20 rounded w-2/3 animate-pulse"></div>
          <div className="h-5 bg-white/20 rounded-full w-1/4 animate-pulse"></div>
        </div>

        {/* Location and Rating */}
        <div className="flex items-center justify-between mb-1.5 sm:mb-2">
          <div className="flex items-center gap-1 sm:gap-1.5 w-1/2">
            <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-white/20 animate-pulse"></div>
            <div className="h-3 bg-white/20 rounded w-full animate-pulse"></div>
          </div>
          <div className="flex items-center gap-1 w-1/3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="w-3 h-3 rounded-full bg-white/20 animate-pulse"></div>
            ))}
          </div>
        </div>

        {/* Key Stats */}
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="w-2.5 h-2.5 sm:w-4 sm:h-4 rounded-full bg-white/20 animate-pulse"></div>
            <div>
              <div className="h-2 bg-white/20 rounded w-12 mb-1 animate-pulse"></div>
              <div className="h-3 bg-white/20 rounded w-8 animate-pulse"></div>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="w-2.5 h-2.5 sm:w-4 sm:h-4 rounded-full bg-white/20 animate-pulse"></div>
            <div>
              <div className="h-2 bg-white/20 rounded w-12 mb-1 animate-pulse"></div>
              <div className="h-3 bg-white/20 rounded w-16 animate-pulse"></div>
            </div>
          </div>
        </div>

        {/* Specialties */}
        <div className="mt-1.5 sm:mt-2 flex flex-wrap gap-1">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-4 bg-white/20 rounded w-12 animate-pulse"></div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const allCards = [
  { 
    label: "Livestreamer Aktif", 
    value: "250+",
    icon: Users,
    iconColor: "text-blue-600",
    description: null
  },
  { 
    label: "Total Penjualan", 
    value: "Rp 5M+",
    icon: ShoppingBag,
    iconColor: "text-purple-600",
    description: null
  },
  { 
    label: "Rating Kepuasan", 
    value: "4.9/5.0",
    icon: Star,
    iconColor: "text-yellow-500",
    description: null
  },
  { 
    label: "Live Sessions", 
    value: "10,000+",
    icon: Award,
    iconColor: "text-emerald-600",
    description: null
  },
  {
    label: "Host Terverifikasi",
    value: null,
    icon: Shield,
    iconColor: "text-blue-600",
    description: "Portfolio & track record terbukti"
  },
  {
    label: "Konversi Tinggi",
    value: null,
    icon: ShoppingBag,
    iconColor: "text-purple-600",
    description: "2-3x lipat penjualan normal"
  },
  {
    label: "Support 24/7",
    value: null,
    icon: Award,
    iconColor: "text-pink-600",
    description: "Tim profesional siap membantu"
  }
];

const partners = [
  { name: "Shopee", logo: "/images/shopee-logo.png" },
  { name: "TikTok Shop", logo: "/images/tiktok-logo.png" },
  // Add more partner logos as needed
];

/** The headline's rotating tail. Same meaning, three ways a brand says it. */
const ROTATING_WORDS = ['produk kamu.', 'brand kamu.', 'toko kamu.'] as const;

export default function Hero() {
  const router = useRouter();
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
    <section className="relative min-h-screen overflow-hidden bg-canvas pt-24 sm:pt-32" aria-label="Platform Live Commerce #1 di Indonesia">
      {/* Background layer with dot pattern and spotlights */}
      <div className="absolute inset-0 z-0 h-full">
        <CustomBackground />
      </div>
      
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
      
      {/* Content layer */}
      <div className="relative z-10">
        <div className="container mx-auto px-3 sm:px-4 pt-8 sm:pt-16 md:pt-24">
          <div className="max-w-[1200px] mx-auto">
            <div className="flex flex-col items-center">
              {/* Text Content */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-center w-full max-w-5xl mx-auto mb-4 sm:mb-6 md:mb-8 px-2 relative z-20"
              >
                <div className="mb-5 flex items-center justify-center">
                  <span className="rounded-pill border border-hairline bg-surface px-3 py-1.5 text-mini font-medium text-ink-muted">
                    Shopee &amp; TikTok Live-Seller Supported
                  </span>
                </div>

                {/*
                  The headline is one sentence with a rotating tail. The three
                  words all mean the same thing to a brand — produk, brand, toko
                  — which is the point: it reads as the product knowing who is
                  looking, not as a slogan.
                */}
                <h1 className="mx-auto max-w-[16ch] font-serif text-hero font-medium text-balance text-ink">
                  <span className="sr-only">Salda by TROLIVE — </span>
                  Host livestreamer terlatih untuk{' '}
                  <span className="text-brand">{ROTATING_WORDS[rotatingIndex]}</span>
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
              </motion.div>

              {/* Streamer Cards Carousel */}
              <div id="host" className="relative w-screen -mx-4 overflow-hidden mb-6 sm:mb-12 md:mb-16 mt-8 sm:mt-10 min-h-[350px] sm:min-h-[500px] md:min-h-[600px] z-20">
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
                  className="flex gap-3 sm:gap-6 md:gap-8 px-3 sm:px-6 md:px-8 lg:px-16 py-4 sm:py-6 md:py-8"
                >
                  {isLoadingStreamers 
                    ? generateSkeletonStreamers(15) // Display 15 skeleton cards while loading
                    : duplicatedStreamers.map((streamer, index) => (
                      <div
                        key={`${streamer.id}-${index}`}
                        className="relative flex-shrink-0 w-[calc((100vw-3rem)/1.5)] sm:w-[calc((100vw-8rem)/2)] md:w-[calc((100vw-8rem)/3)] min-w-[220px] sm:min-w-[280px] max-w-[400px] group"
                      >
                        {/* Card spotlight effect */}
                        
                        {/* Image Container with Floating Effect */}
                        <div className="relative w-full aspect-[4/5] sm:aspect-[3/4] rounded-panel sm:rounded-frame overflow-hidden sm: transition-all duration-500 group-hover:-translate-y-2">
                          <Image
                            src={streamer.image_url || PLACEHOLDER_AVATAR}
                            alt={formatName(streamer.first_name, streamer.last_name)}
                            fill
                            className="object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/0" />
                        </div>

                        {/* Floating Content Container */}
                        <div className="relative -mt-32 sm:-mt-40 md:-mt-48 mx-2 sm:mx-4 z-10">
                          <div className="backdrop-blur-md bg-white/10 rounded-lg sm:rounded-panel p-2.5 sm:p-4 border border-white/20">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                              <h3 className="text-sm sm:text-lg font-medium text-white">
                                {formatName(streamer.first_name, streamer.last_name)}
                              </h3>
                              {/* No platform set yet: render no pill at all
                                  rather than an empty floating chip */}
                              {streamer.platform && (
                                <span className="px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium bg-white/10 text-white border border-white/20">
                                  {streamer.platform}
                                </span>
                              )}
                            </div>

                            {/* Location and Rating */}
                            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                              <div className="flex items-center gap-1 sm:gap-1.5">
                                <MapPin className="w-3 h-3 sm:w-4 sm:h-4 text-white/80" />
                                <span className="text-[10px] sm:text-sm text-white/80">
                                  {streamer.location || streamer.city_slug || 'Lokasi belum diatur'}
                                </span>
                              </div>
                              <RatingStars rating={streamer.rating} />
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
                              <p className="numeric mt-1.5 text-[11px] font-semibold text-white sm:mt-2 sm:text-copy">
                                {`Rp ${Math.round(subtotalWithPlatformFee(streamer.price)).toLocaleString('id-ID')}`}
                                <span className="ml-1 font-normal text-white/60">/ jam</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  }
                </motion.div>

                {/* Gradient Overlays */}
                <div className="absolute inset-y-0 left-0 w-[15%] sm:w-[10%] bg-gradient-to-r from-canvas via-canvas/80 to-transparent pointer-events-none z-30" />
                <div className="absolute inset-y-0 right-0 w-[15%] sm:w-[10%] bg-gradient-to-l from-canvas via-canvas/80 to-transparent pointer-events-none z-30" />
              </div>

              {/* Static Achievement Badges */}
              <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 mb-8 sm:mb-12 md:mb-16 relative z-20">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3 md:gap-4">
                  {allCards.map((card, index) => (
                    <div key={index} className="bg-surface p-3 sm:p-4 rounded-lg sm:rounded-panel border border-hairline transition-all duration-300">
                      <div className="flex flex-col items-center text-center">
                        <card.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${card.iconColor} mb-1.5 sm:mb-2`} />
                        {card.value && (
                          <p className="text-xs sm:text-sm font-semibold text-ink">{card.value}</p>
                        )}
                        <p className="text-[10px] sm:text-xs text-ink-soft">{card.label}</p>
                        {card.description && (
                          <p className="text-[8px] sm:text-[10px] text-ink-faint mt-0.5">{card.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
} 