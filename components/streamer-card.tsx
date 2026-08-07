import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { subtotalWithPlatformFee } from '@/lib/pricing';
import {
  Star,
  MapPin,
  User,
  Clock,
  Music2,
  Radio,
  ShoppingBag,
  X,
} from "lucide-react";

import { CardActionBar } from "./ui/card-action-bar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "./ui/dialog";

import { createClient } from "@/utils/supabase/client";
import { resolveCity } from '@/lib/cities';
import { VerificationBadge, isVerificationApproved } from './ui/verification-badge';
import {
  format,
} from 'date-fns';

import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { createOrGetConversation } from '@/services/message-service';

import { cn } from '@/lib/utils';



// Add this function at the top of your file, outside of the StreamerCard component
function getYouTubeVideoId(url: string): string | null {
  if (!url) return null;

  // Handle youtu.be URLs
  const shortUrlRegex = /youtu\.be\/([a-zA-Z0-9_-]+)/;
  const shortMatch = url.match(shortUrlRegex);
  if (shortMatch) {
    console.log("Extracted Video ID (short URL):", shortMatch[1]);
    return shortMatch[1];
  }

  // Handle youtube.com URLs
  const standardRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtube-nocookie\.com)\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=)([^#\&\?]*)/;
  const match = url.match(standardRegex);
  if (match && match[1].length === 11) {
    console.log("Extracted Video ID (standard URL):", match[1]);
    return match[1];
  }

  console.log("No valid YouTube video ID found in URL:", url);
  return null;
}

/**
 * Since the account-first signup, a `streamers` row is created by the role
 * picker with almost nothing in it and filled in over the following days, so
 * every column below is genuinely nullable in the database. The types say so
 * on purpose: this component used to assume the old signup's guarantee that
 * they were always populated, and one half-finished profile reaching a public
 * listing white-screened the whole page.
 */
export interface Streamer {
  id: number;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  platform: string | null;
  platforms?: (string | null)[] | null;
  category: string | null;
  categories?: string[];
  rating: number | null;
  price: number | null;
  previous_price?: number | null;
  last_price_update?: string;
  price_history?: {
    previous_price: number;
    new_price: number;
    effective_from: string;
  }[];
  image_url: string | null;
  bio: string;
  location: string | null;
  video_url: string | null;
  availableTimeSlots?: string[];
  discount_percentage?: number | null;
  gender?: string;
  age?: number;
  experience?: string;
  /** Public profile handle. Null on rows created before usernames existed. */
  username?: string | null;
  /** Canonical city slug. Preferred over the legacy free-text `location`. */
  city_slug?: string | null;
  is_active?: boolean | null;
  verification_status?: string | null;
}

/**
 * Bookability gate, shared with every surface that renders a card.
 *
 * A brand ships physical product to this person's home address, so a streamer
 * only becomes bookable once an admin has approved their identity and platform
 * ownership, and only while the account is still active.
 *
 * `undefined`/`null` means the caller's query never selected these columns —
 * the landing-page marquee and the sign-up preview both build partial Streamer
 * objects — so it is read as "not evaluated here" rather than "rejected". The
 * authoritative gate is the `is_active`/`verification_status` filter on the
 * server-side listing queries; this keeps those partial previews from rendering
 * as blocked.
 */
export function isStreamerBookable(
  streamer: Pick<Streamer, 'is_active' | 'verification_status'>
): boolean {
  if (streamer.is_active === false) return false;
  if (streamer.verification_status == null) return true;
  return streamer.verification_status === 'approved';
}

/**
 * The city used for shipping maths. `city_slug` is canonical once the row has
 * been migrated; `location` is the legacy free-text value, which resolveCity()
 * still understands.
 */
function streamerCityValue(streamer: Pick<Streamer, 'location' | 'city_slug'>): string {
  return streamer.city_slug || streamer.location || '';
}

// Update the testimonial interface
interface Testimonial {
  client_name: string;
  comment: string;
  rating: number;
}

// Update the StreamerProfile interface
interface StreamerProfile extends Streamer {
  fullBio: string;
  gallery: {
    photos: { id: number; photo_url: string; order_number: number }[];
  };
  testimonials: Testimonial[];
}

// Update the rating data type
interface RatingData {
  id: number;
  rating: number;
  comment: string;
  client: {
    first_name: string;
    last_name: string;
  };
  created_at: string;
}

/** Shown wherever a brand tries to book a streamer we have not verified yet. */
export const UNVERIFIED_BOOKING_MESSAGE =
  'Profil streamer ini masih dalam proses verifikasi, jadi belum bisa dibooking.';

/**
 * Copy for values a streamer has not filled in yet. Deliberately never a zero:
 * "0.0" or "Rp 0" reads as a *claim* about a real person — that they scored
 * nothing, or that they work for free — rather than as an absence.
 */
const NO_RATING_LABEL = 'Belum ada rating';
const NO_LOCATION_LABEL = 'Lokasi belum diatur';
const NO_PRICE_LABEL = 'Harga belum diatur';

/**
 * The card's own wording for an unrated host. "Belum ada rating" describes a
 * missing *number*; on the card the slot is where a brand looks for what other
 * brands said, so it names the missing *thing* instead. Never a 0,0 — a zero
 * there reads as a verdict on a real person rather than an absence.
 */
const NO_REVIEWS_LABEL = 'Belum ada ulasan';

/**
 * The booking rule that decides what a brand actually pays, so it belongs next
 * to the hourly price rather than three screens later in the booking flow.
 * Same wording as the public profile (`app/[username]`) and the booking step.
 */
const MIN_DURATION_LABEL = 'minimal 2 jam';

/** Same stand-in avatar the bookings and messages surfaces use. */
const PLACEHOLDER_AVATAR = '/default-avatar.png';

/** next/image throws outright on a null src, so nothing may reach it unguarded. */
function streamerImage(imageUrl: string | null | undefined): string {
  return imageUrl?.trim() || PLACEHOLDER_AVATAR;
}

/** Human-readable city, preferring the canonical slug's resolved name. */
function streamerLocationLabel(streamer: Pick<Streamer, 'location' | 'city_slug'>): string {
  const city = resolveCity(streamerCityValue(streamer));
  return city?.name || streamer.location?.trim() || NO_LOCATION_LABEL;
}

/**
 * The rating a brand can actually read, or null.
 *
 * `rating` is nullable, and a half-finished row can carry a string or a NaN, so
 * everything that is not a usable number collapses to null here and the card
 * says {@link NO_REVIEWS_LABEL} instead of printing a figure nobody earned.
 */
function usableRating(rating: number | null | undefined): number | null {
  if (typeof rating !== 'number' || !Number.isFinite(rating) || rating <= 0) return null;
  return Math.min(rating, 5);
}

// First, add a helper function to format the name
// Names are copied from the `users` row when the role picker creates the
// streamer, and that row may not carry them yet — so neither half is a given.
function formatName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  const first = firstName?.trim() ?? '';
  const initial = lastName?.trim().charAt(0) ?? '';
  return [first, initial && `${initial}.`].filter(Boolean).join(' ') || 'Host Salda';
}

// Update the formatDiscount function
function formatDiscount(basePrice: number | null | undefined, previousPrice?: number | null, discountPercentage?: number | null): {
  displayPrice: string;
  /** False when there is no price to show, so callers can drop the "/ jam" suffix. */
  hasPrice: boolean;
  originalPrice?: string;
  discountPercentage?: number;
} {
  // No price set yet. `null * 1.3` is 0, so without this the card would quote a
  // host at "Rp 0 / jam" — an offer they never made.
  if (basePrice == null || !Number.isFinite(basePrice) || basePrice <= 0) {
    return { displayPrice: NO_PRICE_LABEL, hasPrice: false };
  }

  // The brand-facing price: base + the 30% platform fee, straight from the
  // pricing module. This used to call `calculatePriceWithPlatformFee` from
  // `@/lib/booking-rules`, which computes `base * (1 + 30/100)` — bit-identical
  // to `base * 1.3`, so no quoted figure moves — but it left the card quoting
  // from a second copy of the fee. There is one fee model; it lives in
  // `@/lib/pricing`, and the booking flow it hands off to already reads it from
  // there. A card and a checkout that disagree about the price is the failure
  // this file is most exposed to.
  const currentPriceWithFee = subtotalWithPlatformFee(basePrice);
  const previousPriceWithFee = previousPrice ? subtotalWithPlatformFee(previousPrice) : null;

  console.log('Price values in formatDiscount:', {
    basePrice,
    previousPrice,
    discountPercentage,
    currentPriceWithFee,
    previousPriceWithFee,
    hasValidDiscount: Boolean(previousPrice && discountPercentage && discountPercentage > 0)
  });

  // Show discount if we have valid previous price and discount percentage
  if (previousPrice && previousPriceWithFee && discountPercentage && discountPercentage > 0) {
    console.log('Showing discount UI with:', {
      displayPrice: `Rp ${Math.round(currentPriceWithFee).toLocaleString('id-ID')}`,
      originalPrice: `Rp ${Math.round(previousPriceWithFee).toLocaleString('id-ID')}`,
      discountPercentage
    });

    return {
      displayPrice: `Rp ${Math.round(currentPriceWithFee).toLocaleString('id-ID')}`,
      hasPrice: true,
      originalPrice: `Rp ${Math.round(previousPriceWithFee).toLocaleString('id-ID')}`,
      discountPercentage
    };
  }

  // Default case: just return current price
  return {
    displayPrice: `Rp ${Math.round(currentPriceWithFee).toLocaleString('id-ID')}`,
    hasPrice: true
  };
}

// Add this function at the top level
const fetchExtendedProfileBasic = async (streamerId: number) => {
  const supabase = createClient();
  try {
    // Fetch all necessary data in parallel
    const [streamerResult, profileResult, ratingResult] = await Promise.all([
      // Basic streamer data
      supabase
        .from('streamers')
        .select(`
          id,
          first_name,
          last_name,
          platform,
          category,
          rating,
          price,
          image_url,
          bio,
          location,
          video_url
        `)
        .eq('id', streamerId)
        .single(),
      
      // Profile details
      supabase
        .from('streamer_profiles')
        .select(`
          age,
          gender,
          experience,
          fullBio,
          location,
          additional_info
        `)
        .eq('streamer_id', streamerId)
        .single(),
      
      // Average rating
      supabase
        .rpc('get_streamer_average_rating', { streamer_id_param: streamerId })
    ]);

    if (streamerResult.error) {
      console.error('Error fetching streamer data:', streamerResult.error);
      throw streamerResult.error;
    }

    // Log the fetched data for debugging
    console.log('Fetched profile data:', {
      streamer: streamerResult.data,
      profile: profileResult.data,
      rating: ratingResult.data
    });

    // Combine all the data with proper fallbacks
    const combinedData = {
      ...streamerResult.data,
      age: profileResult.data?.age || null,
      gender: profileResult.data?.gender || 'Not specified',
      experience: profileResult.data?.experience || 'Not specified',
      fullBio: profileResult.data?.fullBio || streamerResult.data.bio,
      rating: ratingResult.data || streamerResult.data.rating,
      video_url: streamerResult.data.video_url,
      location: profileResult.data?.location || streamerResult.data.location,
      additional_info: profileResult.data?.additional_info || {}
    };

    console.log('Combined profile data:', combinedData);
    return combinedData;
  } catch (error) {
    console.error('Error in fetchExtendedProfileBasic:', error);
    return null;
  }
};

interface RatingWithProfile {
  id: number;
  rating: number;
  comment: string;
  profiles: {
    first_name: string;
    last_name: string;
  } | null;
  created_at: string;
}

// Add this utility function to normalize platform data
function normalizePlatforms(streamer: Streamer): string[] {
  // `platforms` is built elsewhere from the nullable `platform` column, so it
  // can itself be `[null]`; filter before touching any entry.
  if (streamer.platforms && streamer.platforms.length > 0) {
    const normalized = streamer.platforms
      .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      .map(p => p.trim().toLowerCase());
    if (normalized.length > 0) return normalized;
  }

  // Not chosen yet — the caller renders no platform chips rather than crashing.
  const platform = streamer.platform?.trim();
  if (!platform) return [];

  // Handle the "both" case explicitly
  if (platform.toLowerCase() === 'both') {
    return ['tiktok', 'shopee'];
  }

  // Otherwise split the platform string
  return platform
    .split(',')
    .map(p => p.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * How each platform writes its own name. Keyed on the lowercased values
 * {@link normalizePlatforms} produces, so the free-text column stays the only
 * place the raw strings live.
 *
 * `full` leads the card's identity row, where a brand is deciding whether this
 * host streams where their store is. `short` is for the two-platform case,
 * where "Shopee Live & TikTok Live" would push the row past its own width.
 */
const PLATFORM_NAMES: Record<string, { full: string; short: string }> = {
  shopee: { full: 'Shopee Live', short: 'Shopee' },
  tiktok: { full: 'TikTok Live', short: 'TikTok' },
};

/**
 * The glyph for each platform in the dense meta row. Neither product ships a
 * mark in lucide, so these are the nearest honest stand-ins — a bag for the
 * storefront, a note for TikTok — and each one carries the platform's real name
 * as its label, so nothing depends on reading the shape.
 */
const PLATFORM_GLYPHS: Record<string, typeof Star> = {
  shopee: ShoppingBag,
  tiktok: Music2,
};

function platformName(platform: string, form: 'full' | 'short'): string {
  const known = PLATFORM_NAMES[platform];
  if (known) return known[form];
  // `platform` is free text, so a value we have no name for still gets shown —
  // just capitalised. Dropping it would tell a brand this host streams nowhere.
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

/** One label for however many platforms a host actually streams on, or null. */
function platformLabel(platforms: string[]): string | null {
  if (platforms.length === 0) return null;
  if (platforms.length === 1) return platformName(platforms[0], 'full');
  return platforms.map((platform) => platformName(platform, 'short')).join(' & ');
}

interface StreamerCardProps {
  streamer: Streamer;
  isSelected?: boolean;
  onSelect?: (streamer: Streamer) => void;
}

export function StreamerCard({ streamer, isSelected, onSelect }: StreamerCardProps) {
  const router = useRouter();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [extendedProfile, setExtendedProfile] = useState<StreamerProfile | null>(null);
  const [isMessageLoading, setIsMessageLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [averageRating, setAverageRating] = useState(streamer.rating);
  
  // Add loading states
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isLoadingGallery, setIsLoadingGallery] = useState(false);
  const [isLoadingTestimonials, setIsLoadingTestimonials] = useState(false);
  const profileCache = useRef<Partial<StreamerProfile> | null>(null);

  

  // Canonical city + bookability, derived once so every branch below agrees.
  // The same-city comparison that used to sit here went to the booking route
  // with the shipping lead time it feeds — the card never showed it, and
  // computing it here meant the card fetched the signed-in user's city on
  // every render of every tile in the marketplace grid.
  const locationLabel = streamerLocationLabel(streamer);
  const isBookable = isStreamerBookable(streamer);
  // Rows created before usernames existed have none; linking to `/undefined`
  // renders a dead 404, so the link must simply not be there.
  const profileHref = streamer.username ? `/${streamer.username}` : null;

  // `category` is a comma-joined free-text column, so it arrives with blanks,
  // stray spaces and sometimes a trailing comma. Capped at three because the
  // card renders them as one truncating row — a fourth would never be visible
  // and would only push the row's ellipsis earlier.
  const categoryLabels = (streamer.category || '')
    .split(',')
    .map((category) => category.trim())
    .filter(Boolean)
    .slice(0, 3);

  // Everything the card draws, derived once, in the order it is read.
  const displayName = formatName(streamer.first_name, streamer.last_name);
  const platforms = normalizePlatforms(streamer);
  const platformPill = platformLabel(platforms);
  const cardRating = usableRating(averageRating);
  // Trust comes from the badge component, not from a second copy of the rule
  // here: `isVerificationApproved` is the same predicate the badge itself
  // renders on, so the mark and the scrim behind it can never disagree.
  const isVerified = isVerificationApproved(streamer.verification_status);
  // The host's own line about what they do. `bio` is typed non-null but the
  // column is filled in days after signup, so half-finished rows really do
  // carry '' — and an empty bold line is worse than no line.
  const headline = typeof streamer.bio === 'string' ? streamer.bio.trim() : '';
  // The identity mark. The card has exactly one photo and it is already the
  // subject of the frame above; repeating it at 24px directly underneath reads
  // as a duplicate rather than as an avatar, so the mark is the initial the
  // name itself gives us.
  const monogram = displayName.charAt(0).toUpperCase();

  // Load extended profile only when profile modal is opened
  useEffect(() => {
    if (isProfileModalOpen && !extendedProfile) {
      fetchExtendedProfile().catch(error => {
        console.error('Error in profile modal effect:', error);
        setIsLoadingProfile(false);
        setIsLoadingGallery(false);
        setIsLoadingTestimonials(false);
      });
    }
  }, [isProfileModalOpen]);

  // Optimize subscription setup
  useEffect(() => {
    const supabase = createClient();
    
    // Only subscribe to real-time updates if the profile modal is open
    if (!isProfileModalOpen) return;

    const ratingSubscription = supabase
      .channel('public:streamer_ratings')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'streamer_ratings', filter: `streamer_id=eq.${streamer.id}` },
        () => {
          fetchExtendedProfile();
        }
      )
      .subscribe();

    const profileSubscription = supabase
      .channel('public:streamers')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'streamers', filter: `id=eq.${streamer.id}` },
        () => {
          fetchExtendedProfile();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ratingSubscription);
      supabase.removeChannel(profileSubscription);
    };
  }, [streamer.id, isProfileModalOpen]);

  useEffect(() => {
    if (isProfileModalOpen && extendedProfile?.gallery?.photos?.[0]?.photo_url) {
      setSelectedImage(extendedProfile.gallery.photos[0].photo_url);
    }
  }, [extendedProfile, isProfileModalOpen]);

  // Prefetch basic profile data on hover
  const prefetchProfile = useCallback(async () => {
    if (profileCache.current) return;
    
    try {
      const basicProfile = await fetchExtendedProfileBasic(streamer.id);
      profileCache.current = {
        ...streamer,
        ...basicProfile
      };
    } catch (error) {
      console.error('Error prefetching profile:', error);
    }
  }, [streamer.id]);

  // Progressive profile loading
  const fetchExtendedProfile = async () => {
    // Clear the cache to ensure fresh data
    profileCache.current = null;

    setIsLoadingProfile(true);
    const supabase = createClient();

    try {
      // Fetch basic profile data
      const { data: profileData, error: profileError } = await supabase
        .from('streamers')
        .select(`
          id,
          user_id,
          first_name,
          last_name,
          bio,
          location,
          video_url,
          gender,
          age,
          experience,
          rating,
          platform,
          category,
          price,
          image_url
        `)
        .eq('id', streamer.id)
        .single();

      if (profileError) throw profileError;

      // Fetch gallery photos
      const { photos } = await fetchGallery();
      
      // Fetch testimonials
      const testimonials = await fetchTestimonials();

      const extendedProfileData: StreamerProfile = {
        ...profileData,
        gallery: { photos },
        testimonials,
        fullBio: profileData.bio,
        // Ensure all required properties are included
        platforms: profileData.platform ? [profileData.platform] : [],
        categories: profileData.category ? [profileData.category] : [],
        availableTimeSlots: [],
        discount_percentage: null,
        previous_price: null,
        last_price_update: undefined,
        price_history: []
      };

      setExtendedProfile(extendedProfileData);
      profileCache.current = extendedProfileData;

    } catch (error) {
      console.error('Error fetching extended profile:', error);
      setExtendedProfile(null);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const fetchGallery = async () => {
    setIsLoadingGallery(true);
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('streamer_gallery_photos') // Fix: correct table name
        .select('*')
        .eq('streamer_id', streamer.id)
        .order('order_number');
      
      if (error) throw error;
      return { photos: data || [] };
    } catch (error) {
      console.error('Error fetching gallery:', error);
      return { photos: [] };
    } finally {
      setIsLoadingGallery(false);
    }
  };

  const fetchTestimonials = async () => {
    setIsLoadingTestimonials(true);
    const supabase = createClient();
    try {
      const { data: rawData, error } = await supabase
        .from('streamer_ratings')
        .select(`
          id,
          rating,
          comment,
          profiles:client_id (
            first_name,
            last_name
          ),
          created_at
        `)
        .eq('streamer_id', streamer.id)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (error) throw error;

      const data = rawData as unknown as RatingWithProfile[];
      
      return data.map(rating => ({
        client_name: rating.profiles ? `${rating.profiles.first_name} ${rating.profiles.last_name.charAt(0)}.` : 'Anonymous',
        comment: rating.comment || '',
        rating: rating.rating || 0
      }));
    } catch (error) {
      console.error('Error fetching testimonials:', error);
      return [];
    } finally {
      setIsLoadingTestimonials(false);
    }
  };

  // Add hover event handlers to the card
  const handleCardHover = () => {
    prefetchProfile();
  };

  const fullName = `${streamer.first_name} ${streamer.last_name}`;
  

  const handleMessageClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (isMessageLoading) return;
    setIsMessageLoading(true);
    
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/sign-in');
        return;
      }

      // Start navigation early
      router.prefetch('/messages');

      // Create conversation in parallel with navigation
      const clientId = user.id;
      const streamerId = streamer.id;
      
      createOrGetConversation(clientId, streamerId)
        .catch(error => {
          console.error('Error creating conversation:', error);
          toast.error('Failed to create conversation');
        });

      // Navigate immediately without waiting for conversation creation
      router.push('/messages');
      
    } catch (error) {
      console.error('Error in message flow:', error);
      toast.error('Failed to start conversation');
    } finally {
      setIsMessageLoading(false);
    }
  };

  // Debug the incoming data
  console.log('StreamerCard received data:', {
    streamerId: streamer.id,
    currentPrice: streamer.price,
    previousPrice: streamer.previous_price,
    discountPercentage: streamer.discount_percentage,
    hasDiscount: Boolean(streamer.previous_price && streamer.discount_percentage)
  });

  const priceInfo = formatDiscount(
    streamer.price,
    streamer.previous_price,
    streamer.discount_percentage
  );

  // Debug the price info result
  console.log('Price info result:', priceInfo);

  return (
    <>
      {/*
        The whole card is one button.

        It used to be a clickable div with two more buttons nested inside it,
        which meant three overlapping hit targets and a `stopPropagation` on
        each to stop them firing the card's own handler. A card is one thing you
        can pick; the actions belong on the screen you land on, not stacked on
        the summary. That also removes the last gradient from this file.
      */}
      <button
        type="button"
        /*
          Everything inside a button is flattened into that button's accessible
          name, so without this a screen reader announces the whole card as one
          run-on control — name, price, "/ jam", "Terverifikasi", city, rating,
          every category — and the <h3> below stops being a heading anyone can
          navigate to. An explicit label gives the control a short, useful name
          instead; the detail is still on the profile it opens.
        */
        aria-label={[
          displayName,
          priceInfo.hasPrice ? `${priceInfo.displayPrice} per jam` : NO_PRICE_LABEL,
          locationLabel,
          isBookable ? 'terverifikasi' : 'menunggu verifikasi',
        ].join(', ')}
        className="group flex w-full flex-col overflow-hidden rounded-panel border border-hairline
          bg-surface p-0 text-left transition-colors hover:bg-surface-raised
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => {
          setIsProfileModalOpen(true);
        }}
        onMouseEnter={handleCardHover}
      >
        {/*
          The photo, edge to edge and 4:3.

          It was 4:5 with a row of platform chips laid over it. Portrait is the
          right crop for one face and the wrong one for a grid: at four columns
          it made every tile taller than the viewport's share of it, so the row
          of prices a brand is actually comparing fell below the fold. 4:3 is
          the same photo, one scroll higher.
        */}
        <div
          className="relative w-full overflow-hidden bg-surface-tint"
          style={{ aspectRatio: '4 / 3' }}
        >
          <img
            src={streamerImage(streamer.image_url)}
            alt={displayName}
            className="h-full w-full object-cover"
          />

          {/*
            One mark on the photo, and only when it means something.
            `VerificationBadge` renders nothing for a host who is not approved —
            an unverified profile reads as "no badge", never as a badge in a
            softer colour — so the scrim is gated on the same predicate the
            badge itself uses rather than on a copy of the rule.
          */}
          {isVerified && (
            <>
              {/*
                design-lint-allow: gradient

                The one exception the brief allows. The badge sits on a photo
                nobody has approved: a light chip on a bright kitchen wall
                disappears, and there is no flat scrim that survives both a dark
                studio and an overexposed window. This one fades from the top
                edge only, so it reads as the light in the photograph rather
                than as a panel laid over it.
              */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-ink/30 to-transparent"
              />
              <div className="absolute right-2.5 top-2.5 flex max-w-[calc(100%-1.25rem)] justify-end">
                <VerificationBadge status={streamer.verification_status} />
              </div>
            </>
          )}
        </div>

        <div className="flex w-full flex-1 flex-col gap-2 px-4 pb-3 pt-3">
          {/*
            Who this is, on one line.

            The mark, the name and the platform are one row because they answer
            one question — is this the right kind of host — and `min-w-0` +
            `truncate` is what keeps that promise: a long name shortens, it does
            not push the platform onto a second line where it reads as unrelated.
          */}
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full
                border border-hairline bg-surface-tint text-micro font-semibold
                tracking-normal text-ink-muted"
            >
              {monogram}
            </span>
            <h3 className="min-w-0 flex-1 truncate text-mini font-medium text-ink">
              {displayName}
            </h3>
            {platformPill && (
              <span
                className="shrink-0 rounded-pill border border-hairline-input px-2 py-0.5
                  text-tiny text-ink-muted"
              >
                {platformPill}
              </span>
            )}
          </div>

          {/*
            The host's own line, one line only. It is prose a person wrote about
            what they sell, which is the closest thing the listing has to a
            title — and the fastest way for a brand to rule a card in or out
            before they look at the price. Dropped entirely when the bio is
            still empty; a bold blank line is worse than one fewer row.
          */}
          {headline && (
            <span className="block truncate text-ui font-semibold text-ink">{headline}</span>
          )}

          {/*
            The price, at 22px, and the loudest thing on the card. It is what a
            brand is here to compare, and it is the brand-facing figure — base
            plus the 30% platform fee — because comparing a host's take-home
            against another host's invoice is not a comparison.

            `whitespace-nowrap` on the row and `shrink-0` on the figure itself:
            the price never wraps and never truncates. When a discount is
            running it is the strike-through that gives up width first.
          */}
          <div className="flex items-baseline gap-x-2 whitespace-nowrap">
            <span
              className={cn(
                'numeric shrink-0 text-price font-semibold',
                priceInfo.hasPrice ? 'text-ink' : 'text-ink-ghost',
              )}
            >
              {priceInfo.displayPrice}
            </span>
            {priceInfo.hasPrice && (
              <span className="shrink-0 text-mini text-ink-soft">/ jam</span>
            )}
            {priceInfo.originalPrice &&
              priceInfo.discountPercentage &&
              priceInfo.discountPercentage > 0 && (
                <span className="flex min-w-0 items-baseline gap-x-1.5 overflow-hidden">
                  <span className="numeric truncate text-mini text-ink-ghost line-through">
                    {priceInfo.originalPrice}
                  </span>
                  {/* Text on the canvas, not a filled chip. The saving is a
                      fact about the price beside it, not a second thing to
                      look at — and the card's only fill is already spent on
                      the verification mark. */}
                  <span className="shrink-0 text-mini font-medium text-positive">
                    Hemat {priceInfo.discountPercentage}%
                  </span>
                </span>
              )}
          </div>

          {/*
            The dense row: where they stream, what they sell, how they scored.

            The reference card carries a count here — sessions, or reviews. The
            marketplace query selects no count of anything (see
            `app/api/streamers/route.ts`), so there is nothing to put in that
            slot and it holds the rating instead: the one number on this card
            that came from a brand rather than from the host.

            It degrades by truncating the category, never by becoming two lines,
            and a profile with none of the three loses the row rather than
            drawing an empty one.
          */}
          {(platforms.length > 0 || categoryLabels.length > 0 || cardRating !== null) && (
            <div className="flex items-center gap-1.5 overflow-hidden">
              {platforms.length > 0 && (
                <>
                  {/* Glyphs, not a second set of pills — the platform is
                      already named in full a row above; here it only has to be
                      recognisable while a brand scans a column of cards. */}
                  <span
                    className="flex shrink-0 items-center gap-1"
                    title={platformPill ?? undefined}
                  >
                    {platforms.map((platform) => {
                      const Glyph = PLATFORM_GLYPHS[platform] ?? Radio;
                      return (
                        <Glyph
                          key={platform}
                          aria-hidden="true"
                          className="h-3.5 w-3.5 shrink-0 text-ink-faint"
                        />
                      );
                    })}
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-mini text-ink-ghost">
                    ·
                  </span>
                </>
              )}

              {categoryLabels.length > 0 && (
                <span
                  className="min-w-0 truncate rounded-pill border border-hairline-input
                    px-2 py-0.5 text-tiny text-ink-muted"
                  title={categoryLabels.join(', ')}
                >
                  {categoryLabels[0]}
                </span>
              )}

              {cardRating !== null ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-pill
                    border border-hairline-input px-2 py-0.5 text-tiny text-ink-muted"
                >
                  <Star
                    className="h-3 w-3 shrink-0 fill-caution-dot text-caution-dot"
                    aria-hidden="true"
                  />
                  <span className="numeric">{cardRating.toFixed(1)}</span>
                </span>
              ) : (
                // No pill and no empty stars. A bordered slot around "no
                // reviews" makes an absence look like a score; plain text reads
                // as what it is — nobody has rated this host yet.
                <span className="shrink-0 text-tiny text-ink-soft">{NO_REVIEWS_LABEL}</span>
              )}
            </div>
          )}
        </div>

        {/*
          The footer, under a hairline.

          The reference puts a budget bar here. Salda has no budget: nothing in
          the schema, nothing in the query, nothing a percentage could honestly
          be computed from — so the bar is gone rather than drawn empty or
          drawn full. What sits here instead are the two facts that decide when
          a brand can actually go live: the host's city, which sets how long the
          product spends in transit, and the two-hour minimum, which is what
          the hourly price above is really sold in.
        */}
        <div className="flex w-full items-center justify-between gap-3 border-t border-hairline-soft px-4 py-2.5">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-mini text-ink-soft">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
            <span className="truncate">{locationLabel}</span>
          </span>
          <span className="shrink-0 text-mini text-ink-faint">{MIN_DURATION_LABEL}</span>
        </div>
      </button>

      {/* Profile Modal */}
      {isProfileModalOpen && (
        <Dialog
          open={isProfileModalOpen}
          onOpenChange={setIsProfileModalOpen}
        >
          <DialogContent 
            /*
              flex column, not a single scrolling box. With `h-[85vh]
              overflow-y-auto` and nothing else, the action bar's `sticky
              bottom-0` only pins while the content is tall enough to overflow —
              on a short profile it landed immediately after the last section,
              floating mid-dialog, and then jumped downward as the gallery and
              testimonials finished loading. The scroll now belongs to the
              content region and the bar is a sibling that always sits last.
            */
            className="max-w-2xl w-full h-[85vh] z-[9999] fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] p-0 dialog-content-mobile flex flex-col overflow-hidden"
          >
            <DialogHeader className="shrink-0 bg-surface px-6 pb-4 pt-6 flex flex-row items-start justify-between">
              <div>
                <DialogTitle className="text-xl font-semibold text-ink">Streamer Profile</DialogTitle>
                <DialogDescription className="text-sm text-ink-soft mt-1">
                  View detailed information about this streamer
                </DialogDescription>
              </div>
              <DialogClose className="p-2 rounded-full hover:bg-surface-tint transition-colors">
                <X className="h-5 w-5 text-ink-soft" />
              </DialogClose>
            </DialogHeader>

            {/* The one scrolling region. Carries the horizontal padding the
                DialogContent gave up when it became a flex column. */}
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            {isLoadingProfile ? (
              <div className="space-y-4">
                <div className="h-4 bg-surface-deep rounded animate-pulse" />
                <div className="h-4 bg-surface-deep rounded animate-pulse w-3/4" />
                <div className="h-4 bg-surface-deep rounded animate-pulse w-1/2" />
              </div>
            ) : extendedProfile ? (
              <>
                {/* Professional ID Card Layout */}
                <div className="rounded-panel border border-hairline bg-surface-tint p-4 sm:p-6 mb-8">
                  <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                    {/* Left Column - Photo and Basic Info */}
                    <div className="flex flex-col items-center space-y-3">
                      <div className="relative w-28 h-28 sm:w-32 sm:h-32">
                        <Image
                          src={streamerImage(streamer.image_url)}
                          alt={formatName(streamer.first_name, streamer.last_name)}
                          fill
                          className="rounded-lg object-cover border-2 border-white"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Star className={cn(
                          "w-4 h-4",
                          extendedProfile.rating ? "text-caution fill-caution" : "text-ink-ghost"
                        )} />
                        <span className="text-sm font-medium">
                          {extendedProfile.rating ? `${Number(extendedProfile.rating).toFixed(1)} / 5.0` : NO_RATING_LABEL}
                        </span>
                      </div>
                    </div>

                    {/* Right Column - Details */}
                    <div className="flex-1 space-y-4">
                      {/* Name and Title */}
                      <div className="border-b border-hairline pb-3">
                        <div className="flex items-center gap-2">
                          <h2 className="font-serif text-title font-semibold text-ink">
                            {formatName(streamer.first_name, streamer.last_name)}
                          </h2>
                          <VerificationBadge status={streamer.verification_status} />
                        </div>
                        <p className="text-copy text-ink-soft">Professional Livestreamer</p>
                        {/* Only rendered when the streamer actually has a handle */}
                        {profileHref && (
                          <a
                            href={profileHref}
                            className="mt-1 inline-block text-mini font-medium text-brand hover:text-brand-hover hover:underline"
                          >
                            Lihat halaman profil &rarr;
                          </a>
                        )}
                      </div>

                      {/* Info Grid - Redesigned for better desktop view */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                        {/* Age */}
                        <div className="flex items-center gap-3">
                          <div className="rounded-field bg-surface-tint p-1.5">
                            <User className="h-4 w-4 text-ink-soft" />
                          </div>
                          <div>
                            <p className="text-mini font-medium text-ink-soft">Age</p>
                            <p className="text-sm">{extendedProfile.age ? `${extendedProfile.age} Years` : 'Not specified'}</p>
                          </div>
                        </div>

                        {/* Gender */}
                        <div className="flex items-center gap-3">
                          <div className="rounded-field bg-surface-tint p-1.5">
                            <User className="h-4 w-4 text-ink-soft" />
                          </div>
                          <div>
                            <p className="text-mini font-medium text-ink-soft">Gender</p>
                            <p className="text-sm">{extendedProfile.gender || 'Not specified'}</p>
                          </div>
                        </div>

                        {/* Experience */}
                        <div className="flex items-center gap-3">
                          <div className="rounded-field bg-surface-tint p-1.5">
                            <Clock className="h-4 w-4 text-ink-soft" />
                          </div>
                          <div>
                            <p className="text-mini font-medium text-ink-soft">Experience</p>
                            <p className="text-sm">{extendedProfile.experience || 'Not specified'}</p>
                          </div>
                        </div>

                        {/* Location */}
                        <div className="flex items-center gap-3">
                          <div className="rounded-field bg-surface-tint p-1.5">
                            <MapPin className="h-4 w-4 text-ink-soft" />
                          </div>
                          <div>
                            <p className="text-mini font-medium text-ink-soft">Location</p>
                            <p className="text-sm">{extendedProfile.location || locationLabel}</p>
                          </div>
                        </div>
                      </div>

                      {/* Platform Tags — normalizePlatforms drops unset values,
                          so a host who has not picked a platform gets no chips */}
                      <div className="flex flex-wrap gap-2 pt-2">
                        {normalizePlatforms(streamer).map((platform) => (
                          // Same treatment as the marketplace card: a label,
                          // not a brand-coloured pill. Two saturated chips next
                          // to a blue primary action is three accents on one
                          // screen.
                          <span
                            key={platform}
                            className="rounded-chip border border-hairline bg-surface-tint px-2 py-1
                              text-micro font-semibold uppercase tracking-[.03em] text-ink-muted"
                          >
                            {platform}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bio Section */}
                <div className="bg-surface rounded-panel p-6 border border-hairline mb-6">
                  <h3 className="text-sm font-semibold text-ink mb-3">About Me</h3>
                  <p className="text-sm text-ink-muted whitespace-pre-wrap">
                    {extendedProfile.fullBio || extendedProfile.bio || 'Belum ada deskripsi tersedia'}
                  </p>
                </div>

                {/* Featured Content */}
                {extendedProfile.video_url && (
                  <div className="space-y-4 mb-8">
                    <h3 className="text-lg font-semibold text-ink">Featured Content</h3>
                    <div className="relative w-full max-w-[360px] mx-auto">
                      <div className="relative pb-[177.78%]">  {/* 9:16 aspect ratio */}
                        <iframe
                          src={`https://www.youtube.com/embed/${getYouTubeVideoId(extendedProfile.video_url) || ''}`}
                          className="absolute inset-0 w-full h-full rounded-panel"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Gallery Section */}
                <div className="mb-8">
                  <h3 className="text-sm font-semibold text-ink mb-3">Gallery</h3>
                  {isLoadingGallery ? (
                    <div className="grid grid-cols-4 gap-2">
                      {[1, 2, 3, 4].map((n) => (
                        <div key={n} className="aspect-square bg-surface-deep rounded animate-pulse" />
                      ))}
                    </div>
                  ) : extendedProfile?.gallery?.photos && extendedProfile.gallery.photos.length > 0 ? (
                    <div className="grid grid-cols-4 gap-2">
                      {extendedProfile.gallery.photos.map((photo) => (
                        <div
                          key={photo.id}
                          className="aspect-square relative overflow-hidden rounded-lg"
                        >
                          <Image
                            src={photo.photo_url}
                            alt={`Gallery photo ${photo.order_number}`}
                            fill
                            className="object-cover hover:scale-105 transition-transform duration-300"
                            sizes="(max-width: 600px) 25vw, 150px"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-ink-soft text-center">No gallery photos available</p>
                  )}
                </div>

                {/* Testimonials Section */}
                <div>
                  <h3 className="text-sm font-semibold text-ink mb-3">Client Testimonials</h3>
                  {isLoadingTestimonials ? (
                    <div className="space-y-4">
                      {[1, 2].map((n) => (
                        <div key={n} className="h-20 bg-surface-deep rounded animate-pulse" />
                      ))}
                    </div>
                  ) : extendedProfile.testimonials?.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {extendedProfile.testimonials.map((testimonial, index) => (
                        <div key={index} className="bg-surface p-3 rounded-lg border border-hairline">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star 
                                  key={star}
                                  className={cn(
                                    "w-3 h-3",
                                    testimonial.rating >= star 
                                      ? "text-caution fill-caution" 
                                      : "text-ink-ghost"
                                  )}
                                />
                              ))}
                            </div>
                            <span className="text-copy font-medium text-ink-body">
                              {testimonial.client_name}
                            </span>
                          </div>
                          <p className="text-sm text-ink-muted italic">"{testimonial.comment}"</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-ink-soft text-center">No testimonials yet</p>
                  )}
                </div>
              </>
            ) : null}

            {/*
              The card no longer carries its own buttons, so this is the one
              place booking and messaging are reachable from the marketplace.
              It sits at the end of the profile because that is the point at
              which the brand has seen what they are paying for.

              Sticky: the profile scrolls, and an action that scrolls out of
              reach is one the reader has to go hunting for. `-mx-6 -mb-6` bleeds
              it to the dialog's edges past the content padding.
            */}
            </div>

            {/* A sibling of the scroll region, not a sticky child of it, so it
                sits at the bottom whether the profile is two sections or ten. */}
            <div className="shrink-0 border-t border-hairline bg-canvas px-6 py-4">
              <CardActionBar
                className="m-0 border-0 bg-transparent p-0"
                primaryLabel={isBookable ? 'Booking sekarang' : 'Menunggu verifikasi'}
                primaryDisabled={!isBookable}
                onPrimary={() => {
                  // Second line of defence behind the disabled button: an
                  // unapproved streamer must never reach the booking flow,
                  // whichever surface rendered this card. The route re-checks
                  // too, but bouncing here costs no navigation.
                  if (!isBookable) {
                    toast.error(UNVERIFIED_BOOKING_MESSAGE, {
                      duration: 4000,
                      position: 'top-center',
                      className: 'bg-destructive-subtle text-destructive-emphasis border border-destructive-emphasis/20 px-4 py-3 rounded-panel',
                    });
                    return;
                  }
                  setIsProfileModalOpen(false);
                  router.push(`/booking/${streamer.id}`);
                }}
                secondaryLabel={isMessageLoading ? 'Membuka…' : 'Kirim pesan'}
                secondaryDisabled={isMessageLoading}
                onSecondary={(e) => {
                  setIsProfileModalOpen(false);
                  handleMessageClick(e);
                }}
              >
                {isBookable ? (
                  <span className="numeric">
                    <span className="text-title font-semibold text-ink">
                      {priceInfo.displayPrice}
                    </span>
                    {priceInfo.hasPrice && (
                      <span className="ml-1 text-mini text-ink-soft">/ jam</span>
                    )}
                  </span>
                ) : (
                  <span className="text-meta text-caution">{UNVERIFIED_BOOKING_MESSAGE}</span>
                )}
              </CardActionBar>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/**
 * Mirrors StreamerCard's geometry exactly — same 4/3 image, same panel radius,
 * same hairline, same padding, same rows in the same order, and the same
 * hairline-separated footer. A skeleton whose shape differs from the thing it
 * stands in for produces a visible jump on load, which reads as the page
 * breaking rather than finishing.
 */
export function StreamerCardSkeleton() {
  return (
    <div className="flex w-full animate-pulse flex-col overflow-hidden rounded-panel border border-hairline bg-surface">
      <div className="w-full bg-surface-deep" style={{ aspectRatio: '4 / 3' }} />
      <div className="flex w-full flex-1 flex-col gap-2 px-4 pb-3 pt-3">
        {/* mark + name + platform */}
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 shrink-0 rounded-full bg-surface-deep" />
          <div className="h-[12px] flex-1 rounded-chip bg-surface-deep" />
          <div className="h-[18px] w-20 shrink-0 rounded-pill bg-surface-deep" />
        </div>
        {/* headline */}
        <div className="h-[14px] w-5/6 rounded-chip bg-surface-deep" />
        {/* price */}
        <div className="h-[22px] w-32 rounded-chip bg-surface-deep" />
        {/* meta row */}
        <div className="flex items-center gap-1.5">
          <div className="h-[14px] w-9 shrink-0 rounded-chip bg-surface-deep" />
          <div className="h-[18px] w-24 rounded-pill bg-surface-deep" />
          <div className="h-[18px] w-12 shrink-0 rounded-pill bg-surface-deep" />
        </div>
      </div>
      {/* footer */}
      <div className="flex w-full items-center justify-between gap-3 border-t border-hairline-soft px-4 py-2.5">
        <div className="h-[12px] w-24 rounded-chip bg-surface-deep" />
        <div className="h-[12px] w-16 shrink-0 rounded-chip bg-surface-deep" />
      </div>
    </div>
  );
}