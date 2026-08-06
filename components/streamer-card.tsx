import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { subtotalWithPlatformFee } from '@/lib/pricing';
import { Star, StarHalf, MapPin, ChevronLeft, ChevronRight, User, Calendar, Clock, Monitor, DollarSign, X, Mail, Sun, Sunset, Moon, Info, Package } from "lucide-react";
import { Button } from "./ui/button";
import { CardActionBar } from "./ui/card-action-bar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { createClient } from "@/utils/supabase/client";
import { isSameCity, resolveCity } from '@/lib/cities';
import { VerificationBadge } from './ui/verification-badge';
import { format, addDays, startOfWeek, addWeeks, isSameDay, endOfWeek, isAfter, isBefore, startOfDay, subWeeks, addHours, parseISO, differenceInHours, parse, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { createOrGetConversation } from '@/services/message-service';
import { BookingCalendar } from './booking-calendar';
import { cn } from '@/lib/utils';
import {
  type SelectedDateInfo,
  type ShippingOption,
  type TimeRange,
  calculateBlockDuration,
  calculateDuration,
  calculatePriceWithPlatformFee,
  convertToUTC,
  getBulkDateRange,
  getTimeSlots,
  getTotalHoursAndPrice,
  groupConsecutiveHours,
  isTimeOption,
  validateBulkSelection,
  validateDateRestrictions,
  validateMinimumBooking,
  validateRequirementsForDateSelection,
  validateTimeSlotSelection,
} from '@/lib/booking-rules';
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

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
const UNVERIFIED_BOOKING_MESSAGE =
  'Profil streamer ini masih dalam proses verifikasi, jadi belum bisa dibooking.';

/**
 * Copy for values a streamer has not filled in yet. Deliberately never a zero:
 * "0.0" or "Rp 0" reads as a *claim* about a real person — that they scored
 * nothing, or that they work for free — rather than as an absence.
 */
const NO_RATING_LABEL = 'Belum ada rating';
const NO_LOCATION_LABEL = 'Lokasi belum diatur';
const NO_PRICE_LABEL = 'Harga belum diatur';

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

function RatingStars({ rating }: { rating: number | null | undefined }) {
  // An unrated host is not a zero-rated host, and a non-numeric rating would
  // make Math.floor return NaN — which Array(NaN) rejects outright.
  if (rating == null || !Number.isFinite(rating) || rating <= 0) {
    return (
      <div className="flex items-center font-sans">
        {[...Array(5)].map((_, i) => (
          <Star key={i} className="w-3 h-3 text-gray-300" />
        ))}
        <span className="ml-1 text-[10px] text-foreground/70">{NO_RATING_LABEL}</span>
      </div>
    );
  }

  const safeRating = Math.min(rating, 5);
  const fullStars = Math.floor(safeRating);
  const hasHalfStar = safeRating % 1 >= 0.5;

  return (
    <div className="flex items-center font-sans">
      {[...Array(fullStars)].map((_, i) => (
        <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />
      ))}
      {hasHalfStar && <StarHalf className="w-3 h-3 fill-yellow-400 text-yellow-400" />}
      {[...Array(Math.max(0, 5 - fullStars - (hasHalfStar ? 1 : 0)))].map((_, i) => (
        <Star key={i + fullStars + (hasHalfStar ? 1 : 0)} className="w-3 h-3 text-gray-300" />
      ))}
      <span className="ml-1 text-[10px] text-foreground/70">
        {safeRating.toFixed(1)}
      </span>
    </div>
  );
}

// Update the formatPrice function to use adjusted price
function formatPrice(price: number): string {
  const adjustedPrice = subtotalWithPlatformFee(price); // base + 30% platform fee
  if (adjustedPrice < 1000) {
    return `Rp ${Math.round(adjustedPrice)}/hour`;
  }
  const firstTwoDigits = Math.floor(adjustedPrice / 1000);
  return `Rp ${firstTwoDigits}K/hour`;
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

  // Calculate prices with platform fee
  const currentPriceWithFee = calculatePriceWithPlatformFee(basePrice);
  const previousPriceWithFee = previousPrice ? calculatePriceWithPlatformFee(previousPrice) : null;

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

interface StreamerCardProps {
  streamer: Streamer;
  isSelected?: boolean;
  onSelect?: (streamer: Streamer) => void;
}

export function StreamerCard({ streamer, isSelected, onSelect }: StreamerCardProps) {
  const router = useRouter();
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [extendedProfile, setExtendedProfile] = useState<StreamerProfile | null>(null);
  const [activeSchedule, setActiveSchedule] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [isMessageLoading, setIsMessageLoading] = useState(false);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [averageRating, setAverageRating] = useState(streamer.rating);
  
  // Add loading states
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isLoadingGallery, setIsLoadingGallery] = useState(false);
  const [isLoadingTestimonials, setIsLoadingTestimonials] = useState(false);
  const profileCache = useRef<Partial<StreamerProfile> | null>(null);

  // Add new state for multi-day selection
  const [selectedDates, setSelectedDates] = useState<Map<string, SelectedDateInfo>>(new Map());
  
  // Keep existing states for backward compatibility during transition
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedHours, setSelectedHours] = useState<string[]>([]);
  const [platform, setPlatform] = useState<string | null>(null);
  const [daysOff, setDaysOff] = useState<string[]>([]);
  const [needsShipping, setNeedsShipping] = useState<ShippingOption | null>(null);
  const [clientLocation, setClientLocation] = useState<string>('');

  // Canonical city + bookability, derived once so every branch below agrees.
  const streamerCity = streamerCityValue(streamer);
  const locationLabel = streamerLocationLabel(streamer);
  const isBookable = isStreamerBookable(streamer);
  const isSameCityAsClient = isSameCity(clientLocation, streamerCity);
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

  // Add new state for active bulk selection mode
  const [activeBulkMode, setActiveBulkMode] = useState<'week' | 'twoWeeks' | 'month' | null>(null);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);

  // Inside the StreamerCard component, add this state near other state declarations:
  const [isRequirementsValid, setIsRequirementsValid] = useState(() => 
    validateRequirementsForDateSelection(needsShipping, platform)
  );

  // Add this effect to update the requirements validation when dependencies change
  useEffect(() => {
    setIsRequirementsValid(validateRequirementsForDateSelection(needsShipping, platform));
  }, [needsShipping, platform]);

  const isMinimumBookingMet = useCallback(() => {
    if (selectedDates.size === 0) return false;

    return Array.from(selectedDates.values()).some(dateInfo => {
      // Group consecutive hours into blocks
      const blocks: string[][] = [];
      let currentBlock: string[] = [dateInfo.hours[0]];

      for (let i = 1; i < dateInfo.hours.length; i++) {
        if (parseInt(dateInfo.hours[i]) === parseInt(dateInfo.hours[i - 1]) + 1) {
          currentBlock.push(dateInfo.hours[i]);
        } else {
          blocks.push([...currentBlock]);
          currentBlock = [dateInfo.hours[i]];
        }
      }
      blocks.push(currentBlock);

      // Check if any block meets the minimum requirement
      return blocks.some(block => block.length >= 2);
    });
  }, [selectedDates]);

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

  // Load schedule and bookings only when booking modal is opened
  useEffect(() => {
    if (isBookingModalOpen) {
      fetchActiveSchedule();
      fetchAcceptedBookings();
    }
  }, [isBookingModalOpen]);

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

  // Prefetch data for better UX
  const openBookingModal = () => {
    // Second line of defence behind the disabled button: an unapproved streamer
    // must never reach the booking flow, whichever surface rendered this card.
    if (!isBookable) {
      toast.error(UNVERIFIED_BOOKING_MESSAGE, {
        duration: 4000,
        position: 'top-center',
        className: 'bg-white text-red-600 border-2 border-red-100 shadow-lg px-4 py-3 rounded-xl',
      });
      return;
    }

    // Refresh all booking data before opening modal
    refreshBookingData();
    
    // Log today's date for reference when debugging
    const today = new Date();
    console.log('Opening booking modal on:', {
      date: today.toLocaleDateString(),
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate()
    });
    
    // Then open the modal
    setIsBookingModalOpen(true);
  };

  // Function to refresh all booking-related data
  const refreshBookingData = useCallback(() => {
    console.log('Manual refresh of booking data initiated for streamer:', streamer.id);
    
    // Create a timestamp to track when refresh completes
    const refreshStartTime = Date.now();
    
    // Trigger all three data fetches with promises
    Promise.all([
      fetchActiveSchedule(),
      fetchDaysOff(),
      fetchAcceptedBookings()
    ]).then(() => {
      console.log(`Refresh completed in ${Date.now() - refreshStartTime}ms`);
    }).catch(error => {
      console.error('Error during data refresh:', error);
    });
  }, [streamer.id]);

  // Use this in useEffect and also expose it as needed
  useEffect(() => {
    // Initial data load
    refreshBookingData();

    const supabase = createClient();
    
    // Subscribe to booking changes with improved logging
    const bookingSubscription = supabase
      .channel('public:bookings')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'bookings', filter: `streamer_id=eq.${streamer.id}` },
        (payload) => {
          console.log('Booking change detected:', payload);
          refreshBookingData();
          
          // If the booking calendar is open, refresh time options
          if (isBookingModalOpen) {
            const timeOptions = generateTimeOptions();
            console.log('Refreshed time options after booking change:', timeOptions);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(bookingSubscription);
    };
  }, [streamer.id, isBookingModalOpen, refreshBookingData]);

  useEffect(() => {
    if (isProfileModalOpen && extendedProfile?.gallery?.photos?.[0]?.photo_url) {
      setSelectedImage(extendedProfile.gallery.photos[0].photo_url);
    }
  }, [extendedProfile, isProfileModalOpen]);

  useEffect(() => {
    const fetchClientLocation = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // `users` is the profile table in this schema. This used to read a
        // `profiles` table that does not exist, so the query silently returned
        // nothing and every booking — same city or not — was charged the
        // out-of-town 3-day shipping lead time.
        const { data: profile } = await supabase
          .from('users')
          .select('location, city_slug')
          .eq('id', user.id)
          .single();

        // Prefer the canonical slug; fall back to the legacy free-text value.
        const location = profile?.city_slug || profile?.location;
        if (location) {
          setClientLocation(location);
        }
      }
    };

    fetchClientLocation();
  }, []);

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

  const fetchActiveSchedule = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('streamer_active_schedules')
      .select('schedule')
      .eq('streamer_id', streamer.id);

    if (error) {
      console.error('Error fetching active schedule:', error);
      setActiveSchedule(null); // Set to null instead of default schedule
    } else if (data && data.length > 0) {
      try {
        const schedule = typeof data[0].schedule === 'string' 
          ? JSON.parse(data[0].schedule)
          : data[0].schedule;
        setActiveSchedule(schedule);
      } catch (e) {
        console.error('Error parsing schedule:', e);
        setActiveSchedule(null); // Set to null on parse error
      }
    } else {
      setActiveSchedule(null); // Set to null when no schedule exists
    }
  };

  const fetchDaysOff = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('streamer_day_offs')
      .select('date')
      .eq('streamer_id', streamer.id);

    if (error) {
      console.error('Error fetching days off:', error);
    } else if (data) {
      setDaysOff(data.map(d => d.date));
    }
  };

  const fetchAcceptedBookings = async () => {
    const supabase = createClient();
    console.log('Fetching bookings for streamer ID:', streamer.id);
    
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('streamer_id', streamer.id)
      .in('status', ['accepted', 'pending', 'confirmed', 'payment_pending', 'payment_complete', 'waiting_acceptance', 'pending_approval']);

    if (error) {
      console.error('Error fetching bookings:', error);
      toast.error('Failed to fetch bookings');
    } else {
      // Group bookings by date for clearer logging
      const bookingsByDate = data?.reduce((acc, booking) => {
        const date = new Date(booking.start_time);
        const dateKey = `${date.getMonth()+1}/${date.getDate()}`;
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push({
          id: booking.id,
          status: booking.status,
          year: date.getFullYear(),
          startHour: date.getHours(),
          endHour: new Date(booking.end_time).getHours()
        });
        return acc;
      }, {} as Record<string, any[]>);
      
      console.log('Fetched bookings by date:', bookingsByDate);
      console.log('Raw fetched bookings:', data);
      setBookings(data || []);
    }
  };

  const isSlotAvailable = useCallback((date: Date, hour: number) => {
    if (!activeSchedule) {
      console.log('No active schedule');
      return false;
    }
    
    const dayOfWeek = date.getDay();
    const daySchedule = activeSchedule[dayOfWeek];
    
    if (!daySchedule || !daySchedule.slots) {
      console.log('No schedule for this day:', dayOfWeek);
      return false;
    }

    // Check if there's an accepted or pending booking for this slot
    const bookingExists = bookings.some(booking => {
      const bookingStartTime = new Date(booking.start_time);
      const bookingEndTime = new Date(booking.end_time);
      
      // Convert the target date and hour to a comparable time
      const targetTime = new Date(date);
      targetTime.setHours(hour, 0, 0, 0);
      
      // FIXED: Use year-agnostic comparison focusing on month and day
      const isSameMonthAndDay = 
        targetTime.getMonth() === bookingStartTime.getMonth() && 
        targetTime.getDate() === bookingStartTime.getDate();
      
      // Only check hour if month and day match
      const isHourOverlapping = 
        hour >= bookingStartTime.getHours() && 
        hour < bookingEndTime.getHours();
      
      // A slot is considered overlapping if same month/day and hour overlaps
      const isOverlapping = isSameMonthAndDay && isHourOverlapping;

      console.log('Booking overlap check:', {
        targetDate: `${targetTime.getMonth()+1}/${targetTime.getDate()}`,
        bookingDate: `${bookingStartTime.getMonth()+1}/${bookingStartTime.getDate()}`,
        targetYear: targetTime.getFullYear(),
        bookingYear: bookingStartTime.getFullYear(),
        targetHour: hour,
        bookingStartHour: bookingStartTime.getHours(),
        bookingEndHour: bookingEndTime.getHours(),
        isSameMonthAndDay,
        isHourOverlapping,
        isOverlapping,
        status: booking.status,
        bookingId: booking.id
      });

      // If there's any overlap with a booking (ignoring year), consider the slot unavailable
      return isOverlapping;
    });

    // Check if this is a day off for the streamer
    const currentDate = new Date(date);
    currentDate.setHours(0, 0, 0, 0);
    const isDayOff = daysOff.some(dayOffDate => {
      const dayOff = new Date(dayOffDate);
      dayOff.setHours(0, 0, 0, 0);
      return dayOff.getTime() === currentDate.getTime();
    });

    const isInSchedule = daySchedule.slots.some((slot: any) => {
      const start = parseInt(slot.start.split(':')[0]);
      const end = parseInt(slot.end.split(':')[0]);
      return hour >= start && hour <= end;  // Changed to <= to include end hour
    });

    const isAvailable = !bookingExists && !isDayOff && isInSchedule;
    
    console.log('Final availability:', {
      hour,
      isInSchedule,
      hasBooking: bookingExists,
      isAvailable
    });

    return isAvailable;
  }, [activeSchedule, bookings, daysOff]);

  // Update handleDateSelect to include required fields validation
  const handleDateSelect = (date: Date) => {
    // Validate required fields first
    const requiredFieldsValidation = validateRequirementsForDateSelection(needsShipping, platform);
    if (!requiredFieldsValidation.isValid) {
      toast.error(requiredFieldsValidation.error, {
        duration: 4000,
        position: 'top-center',
        className: 'bg-white text-red-600 border-2 border-red-100 shadow-lg px-4 py-3 rounded-xl',
        icon: '⚠️',
      });
      return;
    }

    // Rest of the validation...
    const dateValidation = validateDateRestrictions(
      date,
      needsShipping as ShippingOption,
      clientLocation,
      streamerCity
    );

    if (!dateValidation.isValid) {
      toast.error(dateValidation.error, {
        duration: 4000,
        position: 'top-center',
        className: 'bg-white text-red-600 border-2 border-red-100 shadow-lg px-4 py-3 rounded-xl',
      });
      return;
    }

    const dateKey = format(date, 'yyyy-MM-dd');
    
    setSelectedDates(prev => {
      const next = new Map(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        // Get available hours for this date
        const daySchedule = activeSchedule?.[date.getDay()];
        const availableHours: string[] = [];
        
        if (daySchedule?.slots) {
          daySchedule.slots.forEach((slot: any) => {
            const startHour = parseInt(slot.start);
            const endHour = parseInt(slot.end);
            
            for (let hour = startHour; hour <= endHour; hour++) {
              const hourString = `${hour.toString().padStart(2, '0')}:00`;
              if (isSlotAvailable(date, hour)) {
                availableHours.push(hourString);
              }
            }
          });

          // Sort hours but don't limit them
          const sortedHours = availableHours.sort((a, b) => parseInt(a) - parseInt(b));

          if (sortedHours.length > 0) {
            // Calculate actual hours based on time difference
            const startHour = parseInt(sortedHours[0]);
            const endHour = parseInt(sortedHours[sortedHours.length - 1]);
            const actualHours = endHour - startHour + 1 - 1; // +1 for inclusive, -1 for actual hours

            next.set(dateKey, {
              date,
              hours: sortedHours,
              totalHours: actualHours,
              isEditing: false
            });
          }
        }
      }
      return next;
    });
  };

  // Update handleBooking to handle multi-day bookings
  const handleBooking = () => {
    if (!selectedDates.size) return;
    // Last gate before the payment flow, in case the modal was already open
    // when the streamer's verification was revoked.
    if (!isBookable) {
      toast.error(UNVERIFIED_BOOKING_MESSAGE, {
        duration: 4000,
        position: 'top-center',
        className: 'bg-white text-red-600 border-2 border-red-100 shadow-lg px-4 py-3 rounded-xl',
      });
      return;
    }

    const bookingsData = Array.from(selectedDates.entries()).map(([dateKey, dateInfo]) => {
      // Group consecutive hours into time ranges
      const timeRanges = groupConsecutiveHours(dateInfo.hours.sort());
      
      return {
        date: dateKey,
        timeRanges,
        // Keep these for backward compatibility
        startTime: timeRanges[0].start,
        endTime: timeRanges[timeRanges.length - 1].end,
        hours: timeRanges.reduce((total, range) => total + range.duration, 0)
      };
    });

    // Calculate total hours across all bookings and time ranges
    const totalHours = bookingsData.reduce((total, booking) => 
      total + booking.timeRanges.reduce((rangeTotal, range) => rangeTotal + range.duration, 0), 0
    );

    // Every field here can be unset on a half-finished profile, and
    // URLSearchParams stringifies null as the literal "null".
    const basePrice = streamer.price ?? 0;
    const params = new URLSearchParams({
      streamerId: streamer.id.toString(),
      streamerName: formatName(streamer.first_name, streamer.last_name),
      platform: platform || streamer.platform || '',
      price: basePrice.toString(),
      totalHours: totalHours.toString(),
      totalPrice: (basePrice * totalHours).toString(),
      location: streamer.location || streamer.city_slug || '',
      rating: streamer.rating != null ? streamer.rating.toString() : '',
      image_url: streamer.image_url || '',
      bookings: JSON.stringify(bookingsData)
    });

    router.push(`/booking-detail?${params.toString()}`);
  };

  const generateTimeOptions = () => {
    if (!selectedDate || !activeSchedule) return [];
    const dayOfWeek = selectedDate.getDay();
    const daySchedule = activeSchedule[dayOfWeek];
    if (!daySchedule || !daySchedule.slots) return [];
  
    const options = daySchedule.slots.flatMap((slot: { start: string; end: string }) => {
      const start = parseInt(slot.start.split(':')[0]);
      const end = parseInt(slot.end.split(':')[0]);
      // Changed length calculation to include the end hour
      return Array.from({ length: end - start + 1 }, (_, i) => `${(start + i).toString().padStart(2, '0')}:00`);
    });

    // Filter out hours that are not available
    return options.filter((hour: string) => isSlotAvailable(selectedDate, parseInt(hour)));
  };

  const timeOptions = generateTimeOptions();

  const generateWeekDays = (startDate: Date) => {
    return Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
  };

  const weekDays = generateWeekDays(currentWeekStart);

  const isHourSelected = (hour: string) => selectedHours.includes(hour);

  const isHourDisabled = (hour: string, dateKey: string) => {
    if (!selectedDate) return true;
    
    const hourNum = parseInt(hour);
    const selectedDateTime = new Date(selectedDate);
    selectedDateTime.setHours(hourNum, 0, 0, 0);
    const now = new Date();

    // Check if the date is too soon for shipping
    if (isDateTooSoonForShipping(selectedDate)) return true;
    
    // Basic time validation
    if (isBefore(selectedDateTime, now)) return true;
    
    // Check if slot is available in schedule
    if (!isSlotAvailable(selectedDate, hourNum)) return true;
    
    // Get current date's selected hours
    const dateInfo = selectedDates.get(dateKey);
    if (!dateInfo || dateInfo.hours.length === 0) return false;
    
    // Get the first and last selected hours for this date
    const selectedHourNums = dateInfo.hours.map(h => parseInt(h));
    const minHour = Math.min(...selectedHourNums);
    const maxHour = Math.max(...selectedHourNums);

    // If the hour is adjacent to the current selection, allow it
    if (hourNum === maxHour + 1 || hourNum === minHour - 1) return false;

    // If the hour is between selected hours and there are selected hours on both sides, allow it
    if (hourNum > minHour && hourNum < maxHour) {
        const hasSelectedBefore = selectedHourNums.some(h => h < hourNum);
        const hasSelectedAfter = selectedHourNums.some(h => h > hourNum);
        if (hasSelectedBefore && hasSelectedAfter) return false;
    }
    
    return true;
  };

  const isDayOff = (date: Date) => {
    return date < startOfDay(new Date()) || 
           daysOff.includes(format(date, 'yyyy-MM-dd')) ||
           isDateTooSoonForShipping(date);
  };

  const getMinimumBookingDate = () => {
    const startOfTomorrow = startOfDay(addDays(new Date(), 1));
    
    if (needsShipping === 'no') return startOfTomorrow;

    // If shipping is needed, check locations. Must stay in step with
    // validateDateRestrictions: same city -> tomorrow, otherwise 3 days out.
    const daysToAdd = isSameCity(clientLocation, streamerCity) ? 0 : 2; // Subtract 1 from previous values since we're starting from tomorrow
    return addDays(startOfTomorrow, daysToAdd);
  };

  const isDateTooSoonForShipping = (date: Date) => {
    if (needsShipping === 'no') return false;
    return isBefore(date, getMinimumBookingDate());
  };

  const fullName = `${streamer.first_name} ${streamer.last_name}`;
  
  const handleNextWeek = () => {
    setCurrentWeekStart(addWeeks(currentWeekStart, 1));
  };

  const handlePreviousWeek = () => {
    setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  };

  const getSelectedTimeRange = () => {
    if (selectedHours.length === 0) return '';
    const startTime = selectedHours[0];
    const endTime = selectedHours[selectedHours.length - 1];
    const duration = selectedHours.length - 1;
    return `${startTime} - ${endTime} (${duration} hour${duration !== 1 ? 's' : ''})`;
  };

  const isAvailable = (hour: number) => {
    const timeSlot = hour >= 6 && hour < 12 ? 'morning' :
                     hour >= 12 && hour < 18 ? 'afternoon' :
                     hour >= 18 && hour < 24 ? 'evening' : 'night';
    const day = selectedDate?.getDay();
    const isWeekend = day === 0 || day === 6;
    
    return (
      streamer.availableTimeSlots?.includes(timeSlot) &&
      (isWeekend ? streamer.availableTimeSlots?.includes('weekends') : streamer.availableTimeSlots?.includes('weekdays'))
    );
  };

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

  // Update the bulk selection click handler
  const handleBulkSelection = async (mode: 'week' | 'twoWeeks' | 'month') => {
    if (!isRequirementsValid.isValid) {
      toast.error(isRequirementsValid.error, {
        duration: 4000,
        position: 'top-center',
        className: 'bg-white text-red-600 border-2 border-red-100 shadow-lg px-4 py-3 rounded-xl',
        icon: '⚠️',
      });
      return;
    }

    setActiveBulkMode(mode);
    const dates = getBulkDateRange(mode);
    
    // Validate all dates first
    const { validDates, invalidDates } = validateBulkSelection(
      dates,
      needsShipping as ShippingOption,
      clientLocation,
      streamerCity
    );

    if (validDates.length === 0) {
      toast.error("Tidak ada tanggal yang tersedia untuk pemilihan", {
        duration: 4000,
        position: 'top-center',
        className: 'bg-white text-red-600 border-2 border-red-100 shadow-lg px-4 py-3 rounded-xl',
        icon: '⚠️',
      });
      setActiveBulkMode(null);
      return;
    }

    // Show warning if some dates were invalid
    if (invalidDates.length > 0) {
      toast.error(`${invalidDates.length} tanggal dilewati karena pembatasan waktu`, {
        duration: 4000,
        position: 'top-center',
        className: 'bg-white text-yellow-600 border-2 border-yellow-100 shadow-lg px-4 py-3 rounded-xl',
        icon: '⚠️',
      });
    }

    const newSelectedDates = new Map<string, SelectedDateInfo>();
    
    // Process each valid date
    for (const date of validDates) {
      const dateKey = format(date, 'yyyy-MM-dd');
      const daySchedule = activeSchedule?.[date.getDay()];
      
      if (daySchedule?.slots) {
        // Collect all available hours from all slots
        const availableHours: string[] = [];
        daySchedule.slots.forEach((slot: any) => {
          const startHour = parseInt(slot.start);
          const endHour = parseInt(slot.end);
          
          for (let hour = startHour; hour <= endHour; hour++) {  // Changed to <= to include end hour
            const hourString = `${hour.toString().padStart(2, '0')}:00`;
            if (isSlotAvailable(date, hour)) {
              availableHours.push(hourString);
            }
          }
        });
        
        // Only add dates with available hours
        if (availableHours.length > 0) {
          newSelectedDates.set(dateKey, {
            date,
            hours: availableHours.sort(),
            totalHours: availableHours.length,
            isEditing: false
          });
        }
      }
    }

    // Update state only if we found available slots
    if (newSelectedDates.size > 0) {
      setSelectedDates(newSelectedDates);
      setIsSummaryExpanded(true);
      
      // Show success message with summary
      toast.success(
        `Berhasil memilih ${newSelectedDates.size} hari dengan total ${Array.from(newSelectedDates.values()).reduce((total, date) => total + date.totalHours, 0)} jam`, {
          duration: 4000,
          position: 'top-center',
          className: 'bg-white text-green-600 border-2 border-green-100 shadow-lg px-4 py-3 rounded-xl',
          icon: '✓',
        }
      );
    } else {
      toast.error("Tidak ada slot waktu yang tersedia untuk periode yang dipilih", {
        duration: 4000,
        position: 'top-center',
        className: 'bg-white text-red-600 border-2 border-red-100 shadow-lg px-4 py-3 rounded-xl',
        icon: '⚠️',
      });
      setActiveBulkMode(null);
    }
  };

  const handleTimeSlotSelect = (dateKey: string, hour: string) => {
    setSelectedDates(prev => {
      const next = new Map(prev);
      const dateInfo = next.get(dateKey);
      
      if (!dateInfo) return next;

      let newHours = [...(dateInfo.hours || [])];
      const hourNum = parseInt(hour);
      
      // If hour is already selected, handle removal
      if (newHours.includes(hour)) {
        // Validate removal with the new isRemoving parameter
        const validation = validateTimeSlotSelection(newHours, hour, dateKey, next, true, isSlotAvailable);
        if (!validation.isValid) {
          toast.error(validation.error, {
            duration: 3000,
            position: 'top-center',
            className: 'bg-white text-red-600 border-2 border-red-100 shadow-lg',
          });
          return prev;
        }
        newHours = newHours.filter(h => h !== hour);
      } else {
        // When adding a new hour
        if (newHours.length === 0) {
          // If this is the first hour, automatically add three consecutive hours (2-hour duration)
          const nextHours = [
            hour,
            `${(hourNum + 1).toString().padStart(2, '0')}:00`,
            `${(hourNum + 2).toString().padStart(2, '0')}:00`
          ];
          
          // Validate that all hours are available
          const allHoursAvailable = nextHours.every(h => {
            const hourNum = parseInt(h);
            return isSlotAvailable(new Date(dateInfo.date), hourNum);
          });

          if (!allHoursAvailable) {
            toast.error("Tidak dapat memilih jam ini karena durasi 2 jam berikutnya tidak tersedia (total 3 slot)", {
              duration: 3000,
              position: 'top-center',
              className: 'bg-white text-red-600 border-2 border-red-100 shadow-lg',
            });
            return prev;
          }

          newHours = nextHours;
        } else {
          // For existing blocks, validate and add the hour
          const validation = validateTimeSlotSelection(newHours, hour, dateKey, next, false, isSlotAvailable);
          if (!validation.isValid) {
            toast.error(validation.error, {
              duration: 3000,
              position: 'top-center',
              className: 'bg-white text-red-600 border-2 border-red-100 shadow-lg',
            });
            return prev;
          }
          
          newHours = [...newHours, hour].sort((a, b) => parseInt(a) - parseInt(b));
        }
      }

      if (newHours.length === 0) {
        next.delete(dateKey);
        return next;
      }

      // Group consecutive hours into blocks
      const blocks: string[][] = [];
      let currentBlock: string[] = [newHours[0]];
      
      for (let i = 1; i < newHours.length; i++) {
        if (parseInt(newHours[i]) === parseInt(newHours[i - 1]) + 1) {
          currentBlock.push(newHours[i]);
        } else {
          blocks.push([...currentBlock]);
          currentBlock = [newHours[i]];
        }
      }
      blocks.push(currentBlock);

      // Calculate total hours based on actual time differences
      const totalHours = blocks.reduce((total, block) => {
        if (block.length === 0) return total;
        const startHour = parseInt(block[0]);
        const endHour = parseInt(block[block.length - 1]);
        return total + (endHour - startHour); // Remove the +1 to get actual duration
      }, 0);

      // Update the date info with new hours and formatted time ranges
      next.set(dateKey, {
        ...dateInfo,
        hours: newHours,
        totalHours,
        timeRanges: blocks.map(block => {
          const startHour = parseInt(block[0]);
          const endHour = parseInt(block[block.length - 1]);
          return {
            start: block[0],
            end: `${(endHour).toString().padStart(2, '0')}:00`,
            duration: endHour - startHour // Remove the +1 to get actual duration
          };
        })
      });

      return next;
    });
  };

  // Add a new function to check schedule availability
  const hasAvailableSchedule = useCallback((date: Date) => {
    if (!activeSchedule) return false;
    
    const dayOfWeek = date.getDay();
    const daySchedule = activeSchedule[dayOfWeek];
    
    if (!daySchedule || !daySchedule.slots || daySchedule.slots.length === 0) {
      return false;
    }

    // Check if there are any available hours in the schedule
    for (const slot of daySchedule.slots) {
      const startHour = parseInt(slot.start);
      const endHour = parseInt(slot.end);
      
      for (let hour = startHour; hour < endHour; hour++) {
        if (isSlotAvailable(date, hour)) {
          return true;
        }
      }
    }

    return false;
  }, [activeSchedule, isSlotAvailable]);

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
        className="group flex w-full flex-col overflow-hidden rounded-panel border border-hairline
          bg-surface p-0 text-left transition-colors hover:bg-surface-raised
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => {
          setIsProfileModalOpen(true);
        }}
        onMouseEnter={handleCardHover}
      >
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: '4 / 5' }}>
          <img
            src={streamerImage(streamer.image_url)}
            alt={formatName(streamer.first_name, streamer.last_name)}
            className="h-full w-full object-cover"
          />
          {/*
            Platforms sit on the photo rather than in the text column: they are
            a property of the image the way a label on a product shot is, and
            moving them off the text column is what leaves room for the price to
            lead. Dark translucent, not brand-coloured — an orange Shopee pill
            and a blue primary button on the same card are two accents.
          */}
          <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
            {normalizePlatforms(streamer).map((platform) => (
              <span
                key={platform}
                className="rounded-chip bg-ink/[.82] px-2 py-1 text-micro font-semibold
                  uppercase tracking-[.03em] text-white backdrop-blur-[6px]"
              >
                {platform}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2.5 px-4 pb-4 pt-3.5">
          {/*
            Price first, at 22px. It is the single fact that decides whether a
            brand reads the rest of the card, and it used to be set at the same
            size and weight as the host's name — so the card asked you to
            compare on the one attribute you cannot see.
          */}
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span
              className={cn(
                'numeric text-price font-semibold',
                priceInfo.hasPrice ? 'text-ink' : 'text-ink-ghost',
              )}
            >
              {priceInfo.displayPrice}
            </span>
            {priceInfo.hasPrice && (
              <span className="text-mini text-ink-soft">/ jam</span>
            )}
            {priceInfo.originalPrice &&
              priceInfo.discountPercentage &&
              priceInfo.discountPercentage > 0 && (
                <>
                  <span className="numeric text-mini text-ink-ghost line-through">
                    {priceInfo.originalPrice}
                  </span>
                  <span className="rounded-chip bg-brand-tint px-1.5 py-0.5 text-micro font-semibold tracking-normal text-brand-deep">
                    Hemat {priceInfo.discountPercentage}%
                  </span>
                </>
              )}
          </div>

          {/*
            Name and trust on one line. `min-w-0` + `truncate` is what keeps the
            promise that rows never wrap: a long name shortens, it does not push
            the verification state onto a second line where it reads as
            unrelated.
          */}
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate text-ui font-medium text-ink">
              {formatName(streamer.first_name, streamer.last_name)}
            </h3>
            {isBookable ? (
              <span className="shrink-0 rounded-chip border border-positive-line bg-positive-tint px-1.5 py-px text-micro font-semibold tracking-normal text-positive">
                Terverifikasi
              </span>
            ) : (
              // Status as text, not a filled pill. A yellow block here competes
              // with the price for the eye and makes an ordinary queue state
              // look like an error.
              <span
                className="shrink-0 text-micro font-medium tracking-normal text-caution"
                title={UNVERIFIED_BOOKING_MESSAGE}
              >
                Menunggu verifikasi
              </span>
            )}
          </div>

          {/*
            Everything else is one quiet column of facts at one size. The old
            card gave the city an overlay on the photo, the rating a five-star
            widget, and each category its own bordered chip with an icon —
            three different visual treatments for three things of equal weight.
          */}
          <div className="flex flex-col gap-1 text-meta text-ink-body">
            <div className="flex items-center gap-1.5 truncate">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
              <span className="truncate">{locationLabel}</span>
            </div>

            <div className="flex items-center gap-1.5">
              {typeof averageRating === 'number' &&
              Number.isFinite(averageRating) &&
              averageRating > 0 ? (
                <>
                  <Star className="h-3.5 w-3.5 shrink-0 fill-caution-dot text-caution-dot" />
                  <span className="numeric">{Math.min(averageRating, 5).toFixed(1)}</span>
                </>
              ) : (
                <>
                  <Star className="h-3.5 w-3.5 shrink-0 text-ink-ghost" />
                  <span className="text-ink-soft">{NO_RATING_LABEL}</span>
                </>
              )}
            </div>

            {categoryLabels.length > 0 && (
              <div className="flex items-center gap-1.5 truncate">
                <Monitor className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                <span className="truncate">{categoryLabels.join(' · ')}</span>
              </div>
            )}
          </div>
        </div>
      </button>

      <Dialog open={isBookingModalOpen} onOpenChange={setIsBookingModalOpen}>
        <DialogContent className="max-w-[680px] p-0 overflow-hidden rounded-2xl bg-white max-h-[85vh] flex flex-col fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] z-[9999] booking-dialog-mobile">
          {/* Hero Section with Streamer Info - Fixed height */}
          <div className="relative h-48 flex-shrink-0">
            {/* Background Image with Gradient */}
            <div className="absolute inset-0">
              <Image
                src={streamerImage(streamer.image_url)}
                alt={formatName(streamer.first_name, streamer.last_name)}
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black/80" />
            </div>

            {/* Close Button */}
            <DialogClose className="absolute top-4 right-4 p-2 rounded-full bg-white/10 backdrop-blur-md hover:bg-white/20 transition-optimized">
              <X className="h-4 w-4 text-white" />
            </DialogClose>

            {/* Streamer Info */}
            <div className="absolute bottom-0 w-full p-6">
              <div className="flex items-end gap-4">
                <div className="relative w-16 h-16 rounded-xl overflow-hidden border-2 border-white/20 backdrop-blur-sm">
                  <Image
                    src={streamerImage(streamer.image_url)}
                    alt={formatName(streamer.first_name, streamer.last_name)}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="flex-1 mb-1">
                  <h2 className="text-xl font-semibold text-white mb-1">
                    {formatName(streamer.first_name, streamer.last_name)}
                  </h2>
                  <div className="flex items-center gap-3 text-white/80">
                    <div className="flex items-center gap-1">
                      <Star className={cn(
                        "h-4 w-4",
                        streamer.rating ? "fill-yellow-400 text-yellow-400" : "text-white/50"
                      )} />
                      <span className="text-sm">
                        {streamer.rating != null ? streamer.rating.toFixed(1) : NO_RATING_LABEL}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      <span className="text-sm">{locationLabel}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Booking Content - Make this section scrollable */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* Step 1: Basic Requirements */}
              <div className="space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
                    <span className="text-white font-medium text-xs">1</span>
                  </div>
                  <h3 className="text-[15px] font-semibold text-gray-800">Persyaratan Dasar</h3>
                </div>
                
                <div className="ml-8 space-y-5">
                  {/* Shipping Option */}
                  <div className="space-y-2.5">
                    <Label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                      Pengiriman Produk
                      <span className="text-red-500">*</span>
                      <div className="relative group">
                        <Info className="w-3.5 h-3.5 text-gray-400" />
                        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 w-48 p-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                          Wajib diisi sebelum memilih tanggal
                        </div>
                      </div>
                    </Label>
                    <Select
                      value={needsShipping || undefined}
                      onValueChange={(value) => setNeedsShipping(value as ShippingOption)}
                    >
                      <SelectTrigger 
                        id="shipping-needed" 
                        className={cn(
                          "w-full bg-white h-10 text-sm transition-all px-3",
                          needsShipping === 'yes' 
                            ? "bg-blue-50 border-blue-200 ring-1 ring-blue-100 text-blue-700 shadow-sm" 
                            : needsShipping === 'no'
                            ? "border-gray-200 text-gray-700 shadow-sm"
                            : "text-gray-500 border-gray-300 border-dashed"
                        )}
                      >
                        <SelectValue placeholder="Apakah Anda perlu mengirim produk ke streamer?" />
                      </SelectTrigger>
                      <SelectContent 
                        position="popper" 
                        side="bottom" 
                        align="start" 
                        sideOffset={8}
                        className="z-[9999]"
                      >
                        <SelectItem value="yes" className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-blue-100 rounded-md flex-shrink-0">
                              <Package className="w-3.5 h-3.5 text-blue-600" />
                            </div>
                            <span className="text-sm font-medium">Ya</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="no" className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-blue-100 rounded-md flex-shrink-0">
                              <Clock className="w-3.5 h-3.5 text-blue-600" />
                            </div>
                            <span className="text-sm font-medium">Tidak</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Shipping Notes */}
                    <div className={cn(
                      "text-sm text-gray-600 pl-1",
                      needsShipping === 'yes' && "text-blue-700"
                    )}>
                      {needsShipping === 'yes' ? (
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mt-2">
                          <div className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-blue-600 mt-0.5" />
                            <div className="space-y-1">
                              <p className="font-medium">Pengiriman Diperlukan</p>
                              <p className="text-sm text-blue-600">
                                {isSameCityAsClient
                                  ? "Pemesanan dapat dilakukan mulai besok untuk memastikan pengiriman produk"
                                  : "Pemesanan dapat dilakukan minimal 3 hari dari sekarang untuk memastikan pengiriman produk"
                                }
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : needsShipping === 'no' ? (
                        <div className="pl-1 mt-1.5">
                          <p className="text-sm text-gray-500">Pemesanan dapat dilakukan mulai besok</p>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Platform Selection */}
                  <div className="space-y-2.5">
                    <Label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                      Platform Streaming
                      <span className="text-red-500">*</span>
                      <div className="relative group">
                        <Info className="w-3.5 h-3.5 text-gray-400" />
                        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 w-48 p-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                          Wajib diisi sebelum memilih tanggal
                        </div>
                      </div>
                    </Label>
                    <Select 
                      value={platform || undefined}
                      onValueChange={setPlatform} 
                    >
                      <SelectTrigger 
                        id="booking-platform" 
                        className={cn(
                          "w-full bg-white h-10 text-sm transition-all px-3",
                          platform 
                            ? "bg-blue-50 border-blue-200 ring-1 ring-blue-100 text-blue-700 shadow-sm"
                            : "text-gray-500 border-gray-300 border-dashed"
                        )}
                      >
                        <SelectValue placeholder="Platform mana yang Anda pilih?" />
                      </SelectTrigger>
                      <SelectContent 
                        position="popper" 
                        side="bottom" 
                        align="start" 
                        sideOffset={8}
                        className="z-[9999]"
                      >
                        <SelectItem value="Shopee" className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-orange-100 rounded-md flex-shrink-0">
                              <Monitor className="w-3.5 h-3.5 text-orange-600" />
                            </div>
                            <span className="text-sm font-medium">Shopee Live</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="TikTok" className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-blue-100 rounded-md flex-shrink-0">
                              <Monitor className="w-3.5 h-3.5 text-blue-600" />
                            </div>
                            <span className="text-sm font-medium">TikTok Live</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Platform Notes */}
                    {platform && (
                      <div className="pl-1 mt-1.5">
                        <p className="text-sm text-gray-500">
                          {platform === 'Shopee' ? 'Pembelian langsung dengan tautan produk' : 'Jangkau audiens yang lebih luas'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Step 2: Select Date */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                    <span className="text-white font-medium text-xs">2</span>
                  </div>
                  <h3 className="text-sm font-medium text-gray-900">Pilih Tanggal</h3>
                </div>

                {/* Weekly Calendar View */}
                <div className="ml-7 mb-6">
                  <div className={cn(
                    "bg-white rounded-xl border transition-all duration-200",
                    isRequirementsValid.isValid 
                      ? "border-gray-200" 
                      : "border-red-200 bg-red-50/30"
                  )}>
                    <div className="p-4">
                      {!isRequirementsValid.isValid && (
                        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                          <p className="text-xs text-red-600">
                            {isRequirementsValid.error}
                          </p>
                        </div>
                      )}
                      <BookingCalendar
                        selectedDate={selectedDate}
                        onDateSelect={(dateStr) => handleDateSelect(new Date(dateStr))}
                        onTimeSelect={(time) => {
                          if (selectedDate) {
                            const [hours, minutes] = time.split(':').map(Number);
                            const newDate = new Date(selectedDate);
                            newDate.setHours(hours, minutes, 0, 0);
                            setSelectedDate(newDate);
                          }
                        }}
                        isRequirementsValid={isRequirementsValid.isValid}
                        selectedDates={selectedDates}
                        isDateSelectable={(date) => {
                          const dateValidation = validateDateRestrictions(
                            date,
                            needsShipping as ShippingOption,
                            clientLocation,
                            streamerCity
                          );
                          return dateValidation.isValid;
                        }}
                        hasAvailableSchedule={hasAvailableSchedule}
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Selection Section with enhanced styling */}
                <div className="ml-8 mb-6">
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium text-gray-800">Pemilihan Cepat</h4>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-6 w-6 p-0 hover:bg-blue-50"
                            >
                              <Info className="h-4 w-4 text-blue-600" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent 
                            className="w-80 p-3 text-xs text-gray-600 bg-white shadow-lg border border-gray-200 rounded-lg z-[99999]"
                            side="top"
                            align="start"
                          >
                            <div className="space-y-2">
                              <p>
                                Ini akan secara otomatis memilih semua jam yang tersedia untuk setiap hari berdasarkan jadwal streamer.
                              </p>
                              <div className="pt-2 border-t border-gray-100">
                                <p className="font-medium text-blue-600">Persyaratan:</p>
                                <ul className="mt-1 space-y-1">
                                  <li className="flex items-center gap-2">
                                    <div className={cn(
                                      "w-4 h-4 rounded-full flex items-center justify-center text-[10px]",
                                      needsShipping ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"
                                    )}>
                                      {needsShipping ? "✓" : "!"}
                                    </div>
                                    <span>Pilih opsi pengiriman</span>
                                  </li>
                                  <li className="flex items-center gap-2">
                                    <div className={cn(
                                      "w-4 h-4 rounded-full flex items-center justify-center text-[10px]",
                                      platform ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"
                                    )}>
                                      {platform ? "✓" : "!"}
                                    </div>
                                    <span>Pilih platform streaming</span>
                                  </li>
                                </ul>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      {[
                        { id: 'week', label: '1 Minggu', icon: Calendar },
                        { id: 'twoWeeks', label: '2 Minggu', icon: Calendar },
                        { id: 'month', label: '1 Bulan', icon: Calendar }
                      ].map((option) => (
                        <Button
                          key={option.id}
                          variant="outline"
                          size="sm"
                          onClick={() => handleBulkSelection(option.id as 'week' | 'twoWeeks' | 'month')}
                          className={cn(
                            "flex-1 relative px-3 py-2 transition-all duration-300",
                            "border rounded-lg shadow-sm group",
                            !isRequirementsValid.isValid && "cursor-not-allowed opacity-50",
                            activeBulkMode === option.id
                              ? "bg-blue-50 border-blue-500 text-blue-700 shadow-blue-100"
                              : isRequirementsValid.isValid
                                ? "border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600"
                                : "border-gray-200 text-gray-400"
                          )}
                          disabled={!isRequirementsValid.isValid}
                        >
                          <div className="flex items-center justify-center gap-2">
                            <option.icon className={cn(
                              "h-4 w-4 transition-transform duration-300",
                              activeBulkMode === option.id ? "scale-110" : "group-hover:scale-110"
                            )} />
                            <span>{option.label}</span>
                          </div>
                          {!isRequirementsValid.isValid && (
                            <div className="absolute -top-2 -right-2 w-4 h-4 bg-red-100 rounded-full flex items-center justify-center">
                              <span className="text-[10px] text-red-600">!</span>
                            </div>
                          )}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Step 3: Select Time */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                      <span className="text-white font-medium text-xs">3</span>
                    </div>
                    <h3 className="text-sm font-medium text-gray-900">Pilih Waktu</h3>
                  </div>

                  <div className="ml-7">
                    {selectedDates.size > 0 ? (
                      <div className="bg-white rounded-lg border border-blue-200 overflow-hidden shadow-sm">
                        <div 
                          className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 cursor-pointer"
                          onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                        >
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5 text-blue-600" />
                            <span className="text-xs font-medium text-blue-900">
                              {selectedDates.size} {selectedDates.size === 1 ? 'hari' : 'hari'} dipilih
                            </span>
                            <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-[11px] font-medium px-2 py-0.5">
                              {Array.from(selectedDates.values()).reduce((total, date) => total + date.totalHours, 0)} jam total
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDates(new Map());
                                setActiveBulkMode(null);
                              }}
                              className="h-7 hover:bg-red-50 hover:text-red-600 text-gray-500 text-xs"
                            >
                              Hapus Semua
                            </Button>
                            <ChevronRight 
                              className={cn(
                                "h-3.5 w-3.5 text-blue-600 transition-transform duration-300",
                                isSummaryExpanded ? "rotate-90" : ""
                              )}
                            />
                          </div>
                        </div>

                        {isSummaryExpanded && (
                          <div className="divide-y divide-gray-100">
                            {Array.from(selectedDates.entries()).map(([dateKey, dateInfo]) => (
                              <div key={dateKey}>
                                <div 
                                  className="flex items-center justify-between p-3 hover:bg-gray-50/80 transition-colors cursor-pointer"
                                  onClick={() => {
                                    setSelectedDates(prev => {
                                      const next = new Map(prev);
                                      const info = next.get(dateKey);
                                      if (info) {
                                        next.set(dateKey, {
                                          ...info,
                                          isEditing: !info.isEditing
                                        });
                                      }
                                      return next;
                                    });
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <div className="flex flex-col">
                                      <span className="text-xs font-medium text-gray-900">
                                        {format(dateInfo.date, 'EEEE, d MMMM')}
                                      </span>
                                      <span className="text-[11px] text-gray-500">
                                        {dateInfo.timeRanges?.map((range, index) => (
                                          <span key={index}>
                                            {index > 0 && ', '}
                                            {range.start}–{range.end}
                                          </span>
                                        ))}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="bg-blue-50 text-blue-700 text-[11px] px-2 py-0.5">
                                      {dateInfo.totalHours} jam
                                    </Badge>
                                    <ChevronRight 
                                      className={cn(
                                        "h-3.5 w-3.5 text-gray-400 transition-transform duration-200",
                                        dateInfo.isEditing && "rotate-90"
                                      )}
                                    />
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const newDates = new Map(selectedDates);
                                        newDates.delete(dateKey);
                                        setSelectedDates(newDates);
                                        if (newDates.size === 0) {
                                          setActiveBulkMode(null);
                                        }
                                      }}
                                      className="h-7 w-7 p-0 hover:bg-red-50 hover:text-red-600"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>

                                {/* Time Slot Editor */}
                                {dateInfo.isEditing && (
                                  <div className="px-3 pb-3 bg-gray-50/80">
                                    <div className="mb-2">
                                      <div className="flex items-start gap-2 p-2 bg-blue-50 rounded-lg border border-blue-100">
                                        <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                        <div className="space-y-1">
                                          <p className="text-[11px] font-medium text-blue-900">Aturan Pemesanan:</p>
                                          <ul className="text-[11px] text-blue-700 space-y-0.5">
                                            <li>• Minimal 2 jam berurutan untuk setiap sesi</li>
                                            <li>• Sesi terpisah harus berjarak minimal 2 jam</li>
                                            <li>• Tidak dapat menghapus jam yang akan membuat sesi kurang dari 2 jam</li>
                                          </ul>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                                      {(() => {
                                        const daySchedule = activeSchedule?.[dateInfo.date.getDay()];
                                        const availableHours: string[] = [];
                                        
                                        if (daySchedule?.slots) {
                                          daySchedule.slots.forEach((slot: any) => {
                                            const startHour = parseInt(slot.start);
                                            const endHour = parseInt(slot.end);
                                            
                                            for (let hour = startHour; hour <= endHour; hour++) {  // Changed back to <= to include end hour for buttons
                                              const hourString = `${hour.toString().padStart(2, '0')}:00`;
                                              if (isSlotAvailable(dateInfo.date, hour) || dateInfo.hours.includes(hourString)) {
                                                availableHours.push(hourString);
                                              }
                                            }
                                          });
                                        }

                                        // This code renders the time slot buttons for booking a streamer
                                        // It maps through the available hours and creates interactive buttons
                                        return availableHours.sort().map(hour => {
                                          // Check if this hour is already selected by the user
                                          const isSelected = dateInfo.hours.includes(hour);
                                          
                                          // Convert hour string to number for comparisons
                                          const hourNum = parseInt(hour);
                                          
                                          // Get all currently selected hours as numbers for checking continuity
                                          const selectedHourNums = dateInfo.hours.map(h => parseInt(h));
                                          
                                          // Find the earliest and latest selected hours
                                          const minHour = Math.min(...selectedHourNums);
                                          const maxHour = Math.max(...selectedHourNums);
                                          
                                          // Disable time slots that would break the continuous booking rule:
                                          // - Only enable if no hours are selected yet
                                          // - Or if this hour is already selected
                                          // - Or if this hour is immediately before/after existing selection
                                          // - Or if this hour is within the range of selected hours (to allow re-selection)
                                          const isDisabled = dateInfo.hours.length > 0 && 
                                            !isSelected && 
                                            hourNum !== maxHour + 1 && 
                                            hourNum !== minHour - 1 &&
                                            !(hourNum > minHour && hourNum < maxHour); // Allow re-selection of hours within the range

                                          return (
                                            <Button
                                              key={hour}
                                              variant={isSelected ? "default" : "outline"}
                                              size="sm"
                                              disabled={isDisabled}
                                              onClick={() => handleTimeSlotSelect(dateKey, hour)}
                                              className={cn(
                                                "h-8 px-2 text-[11px] font-medium",
                                                isSelected && "bg-blue-600 text-white hover:bg-blue-700",
                                                !isSelected && "hover:bg-blue-50 hover:text-blue-600",
                                                isDisabled && "opacity-50 cursor-not-allowed"
                                              )}
                                            >
                                              {format(parse(hour, 'HH:mm', new Date()), 'HH:mm')}
                                            </Button>
                                          );
                                        });
                                      })()}
                                    </div>
                                    {dateInfo.hours.length === 0 && (
                                      <p className="text-[11px] text-gray-500 mt-2">
                                        Pilih waktu mulai untuk memulai
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 px-4 bg-gray-50 rounded-xl border border-gray-200">
                        <Calendar className="h-8 w-8 text-gray-400 mx-auto mb-3" />
                        <h4 className="text-sm font-medium text-gray-900 mb-1">Belum Ada Waktu yang Dipilih</h4>
                        <p className="text-xs text-gray-500">
                          Gunakan kalender atau tombol pemilihan cepat di atas untuk memilih tanggal dan waktu yang Anda inginkan.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Summary Footer */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  {(() => {
                    const { totalHours, totalPrice } = getTotalHoursAndPrice(selectedDates, streamer.price ?? 0);
                    return (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">Total Durasi</p>
                          <p className="text-lg font-semibold text-gray-900">{totalHours} jam</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-600">Estimasi Total</p>
                          <div>
                            <p className="text-lg font-semibold text-gray-900">
                              Rp {subtotalWithPlatformFee(totalPrice).toLocaleString()}
                            </p>
                            <p className="text-xs text-gray-500">*harga belum termasuk pajak</p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Footer with Proceed Button - Fixed at bottom */}
          <div className="p-6 border-t border-gray-100 bg-white flex-shrink-0">
            <Button
              onClick={handleBooking}
              disabled={!isMinimumBookingMet() || !platform}
              className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-medium"
            >
              {!platform
                ? 'Silakan pilih platform'
                : !isMinimumBookingMet()
                ? 'Pilih minimal 2 jam'
                : 'Lanjut ke Detail Pemesanan'
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Profile Modal */}
      {isProfileModalOpen && (
        <Dialog
          open={isProfileModalOpen}
          onOpenChange={setIsProfileModalOpen}
        >
          <DialogContent 
            className="max-w-2xl w-full h-[85vh] overflow-y-auto z-[9999] fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] p-6 dialog-content-mobile"
          >
            <DialogHeader className="bg-white pb-4 flex flex-row items-start justify-between">
              <div>
                <DialogTitle className="text-xl font-semibold text-gray-900">Streamer Profile</DialogTitle>
                <DialogDescription className="text-sm text-gray-500 mt-1">
                  View detailed information about this streamer
                </DialogDescription>
              </div>
              <DialogClose className="p-2 rounded-full hover:bg-gray-100 transition-colors">
                <X className="h-5 w-5 text-gray-500" />
              </DialogClose>
            </DialogHeader>
            
            {isLoadingProfile ? (
              <div className="space-y-4">
                <div className="h-4 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
              </div>
            ) : extendedProfile ? (
              <>
                {/* Professional ID Card Layout */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 sm:p-6 border border-blue-100 shadow-sm mb-8">
                  <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                    {/* Left Column - Photo and Basic Info */}
                    <div className="flex flex-col items-center space-y-3">
                      <div className="relative w-28 h-28 sm:w-32 sm:h-32">
                        <Image
                          src={streamerImage(streamer.image_url)}
                          alt={formatName(streamer.first_name, streamer.last_name)}
                          fill
                          className="rounded-lg object-cover border-2 border-white shadow-md"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Star className={cn(
                          "w-4 h-4",
                          extendedProfile.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"
                        )} />
                        <span className="text-sm font-medium">
                          {extendedProfile.rating ? `${Number(extendedProfile.rating).toFixed(1)} / 5.0` : NO_RATING_LABEL}
                        </span>
                      </div>
                    </div>

                    {/* Right Column - Details */}
                    <div className="flex-1 space-y-4">
                      {/* Name and Title */}
                      <div className="border-b border-blue-200 pb-3">
                        <div className="flex items-center gap-2">
                          <h2 className="text-xl font-semibold text-blue-900">
                            {formatName(streamer.first_name, streamer.last_name)}
                          </h2>
                          <VerificationBadge status={streamer.verification_status} />
                        </div>
                        <p className="text-sm text-blue-600 font-medium">Professional Livestreamer</p>
                        {/* Only rendered when the streamer actually has a handle */}
                        {profileHref && (
                          <a
                            href={profileHref}
                            className="mt-1 inline-block text-xs font-medium text-blue-600 hover:underline"
                          >
                            Lihat halaman profil &rarr;
                          </a>
                        )}
                      </div>

                      {/* Info Grid - Redesigned for better desktop view */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                        {/* Age */}
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 bg-blue-100 rounded-md">
                            <User className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-xs text-blue-600 font-medium">Age</p>
                            <p className="text-sm">{extendedProfile.age ? `${extendedProfile.age} Years` : 'Not specified'}</p>
                          </div>
                        </div>

                        {/* Gender */}
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 bg-blue-100 rounded-md">
                            <User className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-xs text-blue-600 font-medium">Gender</p>
                            <p className="text-sm">{extendedProfile.gender || 'Not specified'}</p>
                          </div>
                        </div>

                        {/* Experience */}
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 bg-blue-100 rounded-md">
                            <Clock className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-xs text-blue-600 font-medium">Experience</p>
                            <p className="text-sm">{extendedProfile.experience || 'Not specified'}</p>
                          </div>
                        </div>

                        {/* Location */}
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 bg-blue-100 rounded-md">
                            <MapPin className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-xs text-blue-600 font-medium">Location</p>
                            <p className="text-sm">{extendedProfile.location || locationLabel}</p>
                          </div>
                        </div>
                      </div>

                      {/* Platform Tags — normalizePlatforms drops unset values,
                          so a host who has not picked a platform gets no chips */}
                      <div className="flex flex-wrap gap-2 pt-2">
                        {normalizePlatforms(streamer).map((platform) => (
                          <div
                            key={platform}
                            className={`px-3 py-1 rounded-full text-white text-xs font-medium
                              ${platform === 'shopee'
                                ? 'bg-gradient-to-r from-orange-500 to-orange-600'
                                : 'bg-gradient-to-r from-blue-600 to-indigo-600'}`}
                          >
                            {platform.charAt(0).toUpperCase() + platform.slice(1)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bio Section */}
                <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm mb-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">About Me</h3>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    {extendedProfile.fullBio || extendedProfile.bio || 'Belum ada deskripsi tersedia'}
                  </p>
                </div>

                {/* Featured Content */}
                {extendedProfile.video_url && (
                  <div className="space-y-4 mb-8">
                    <h3 className="text-lg font-semibold text-gray-900">Featured Content</h3>
                    <div className="relative w-full max-w-[360px] mx-auto">
                      <div className="relative pb-[177.78%]">  {/* 9:16 aspect ratio */}
                        <iframe
                          src={`https://www.youtube.com/embed/${getYouTubeVideoId(extendedProfile.video_url) || ''}`}
                          className="absolute inset-0 w-full h-full rounded-xl"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Gallery Section */}
                <div className="mb-8">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Gallery</h3>
                  {isLoadingGallery ? (
                    <div className="grid grid-cols-4 gap-2">
                      {[1, 2, 3, 4].map((n) => (
                        <div key={n} className="aspect-square bg-gray-200 rounded animate-pulse" />
                      ))}
                    </div>
                  ) : extendedProfile?.gallery?.photos && extendedProfile.gallery.photos.length > 0 ? (
                    <div className="grid grid-cols-4 gap-2">
                      {extendedProfile.gallery.photos.map((photo) => (
                        <div
                          key={photo.id}
                          className="aspect-square relative overflow-hidden rounded-lg shadow-sm"
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
                    <p className="text-sm text-gray-500 text-center">No gallery photos available</p>
                  )}
                </div>

                {/* Testimonials Section */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Client Testimonials</h3>
                  {isLoadingTestimonials ? (
                    <div className="space-y-4">
                      {[1, 2].map((n) => (
                        <div key={n} className="h-20 bg-gray-200 rounded animate-pulse" />
                      ))}
                    </div>
                  ) : extendedProfile.testimonials?.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {extendedProfile.testimonials.map((testimonial, index) => (
                        <div key={index} className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star 
                                  key={star}
                                  className={cn(
                                    "w-3 h-3",
                                    testimonial.rating >= star 
                                      ? "text-yellow-400 fill-yellow-400" 
                                      : "text-gray-300"
                                  )}
                                />
                              ))}
                            </div>
                            <span className="text-sm font-medium text-blue-600">
                              {testimonial.client_name}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 italic">"{testimonial.comment}"</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center">No testimonials yet</p>
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
            <div className="sticky bottom-0 -mx-6 -mb-6 mt-6 border-t border-hairline bg-canvas/95 px-6 py-4 backdrop-blur-md">
              <CardActionBar
                className="m-0 border-0 bg-transparent p-0"
                primaryLabel={isBookable ? 'Booking sekarang' : 'Menunggu verifikasi'}
                primaryDisabled={!isBookable}
                onPrimary={() => {
                  setIsProfileModalOpen(false);
                  openBookingModal();
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
 * Mirrors StreamerCard's geometry exactly — same 4/5 image, same panel radius,
 * same hairline, same padding, same four text rows in the same order. A
 * skeleton whose shape differs from the thing it stands in for produces a
 * visible jump on load, which reads as the page breaking rather than finishing.
 */
export function StreamerCardSkeleton() {
  return (
    <div className="flex w-full animate-pulse flex-col overflow-hidden rounded-panel border border-hairline bg-surface">
      <div className="w-full bg-surface-deep" style={{ aspectRatio: '4 / 5' }} />
      <div className="flex flex-1 flex-col gap-2.5 px-4 pb-4 pt-3.5">
        {/* price */}
        <div className="h-[22px] w-32 rounded-chip bg-surface-deep" />
        {/* name + trust */}
        <div className="flex items-center gap-2">
          <div className="h-[14px] flex-1 rounded-chip bg-surface-deep" />
          <div className="h-[14px] w-20 shrink-0 rounded-chip bg-surface-deep" />
        </div>
        {/* three meta rows */}
        <div className="flex flex-col gap-1">
          <div className="h-[13px] w-2/3 rounded-chip bg-surface-deep" />
          <div className="h-[13px] w-1/4 rounded-chip bg-surface-deep" />
          <div className="h-[13px] w-1/2 rounded-chip bg-surface-deep" />
        </div>
      </div>
    </div>
  );
}