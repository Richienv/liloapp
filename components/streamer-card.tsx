import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Star, StarHalf, MapPin, ChevronLeft, ChevronRight, User, Calendar, Clock, Monitor, DollarSign, X, Mail } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { createClient } from "@/utils/supabase/client";
import { format, addDays, startOfWeek, addWeeks, isSameDay, endOfWeek, isAfter, isBefore, startOfDay, subWeeks, addHours, parseISO, differenceInHours } from 'date-fns';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { createOrGetConversation } from '@/services/message-service';
import { BookingCalendar } from './booking-calendar';
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

// Add these utility functions at the top of the file
const calculateDuration = (start: Date, end: Date): number => {
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60));
};

// Add this utility function for calculating platform fee
const calculatePriceWithPlatformFee = (basePrice: number): number => {
  const platformFeePercentage = 30;
  return basePrice * (1 + platformFeePercentage / 100);
};

// Update the Streamer interface to include video_url
export interface Streamer {
  id: number;
  user_id: string;
  first_name: string;
  last_name: string;
  platform: string;
  platforms?: string[];
  category: string;
  categories?: string[];
  rating: number;
  price: number;
  previous_price?: number | null;
  last_price_update?: string;
  price_history?: {
    previous_price: number;
    new_price: number;
    effective_from: string;
  }[];
  image_url: string;
  bio: string;
  location: string;
  video_url: string | null;
  availableTimeSlots?: string[];
  discount_percentage?: number | null;
}

// Update the StreamerProfile interface
interface StreamerProfile extends Streamer {
  age: number;
  gender: string;
  experience: string;
  fullBio: string;
  gallery: {
    photos: { id: number; photo_url: string; order_number: number }[];
  };
  testimonials: {
    client_name: string; // Change this from clientName to client_name
    comment: string;
  }[];
}

type ShippingOption = 'yes' | 'no';

function RatingStars({ rating }: { rating: number }) {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;

  return (
    <div className="flex items-center font-sans">
      {[...Array(fullStars)].map((_, i) => (
        <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />
      ))}
      {hasHalfStar && <StarHalf className="w-3 h-3 fill-yellow-400 text-yellow-400" />}
      {[...Array(5 - fullStars - (hasHalfStar ? 1 : 0))].map((_, i) => (
        <Star key={i + fullStars + (hasHalfStar ? 1 : 0)} className="w-3 h-3 text-gray-300" />
      ))}
      <span className="ml-1 text-[10px] text-foreground/70">
        {rating > 0 ? rating.toFixed(1) : "Not rated yet"}
      </span>
    </div>
  );
}

function formatPrice(price: number): string {
  if (price < 1000) {
    return `Rp ${price}/hour`;
  }
  const firstTwoDigits = Math.floor(price / 1000);
  return `Rp ${firstTwoDigits}K/hour`;
}

// First, add a helper function to format the name
function formatName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName.charAt(0)}.`;
}

// Update the formatDiscount function
function formatDiscount(basePrice: number, previousPrice?: number | null, discountPercentage?: number | null): {
  displayPrice: string;
  originalPrice?: string;
  discountPercentage?: number;
} {
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
      originalPrice: `Rp ${Math.round(previousPriceWithFee).toLocaleString('id-ID')}`,
      discountPercentage
    };
  }

  // Default case: just return current price
  return { 
    displayPrice: `Rp ${Math.round(currentPriceWithFee).toLocaleString('id-ID')}` 
  };
}

// First, add this helper function at the top of the file
const getTimeSlots = (timeOfDay: 'Morning' | 'Afternoon' | 'Evening' | 'Night'): string[] => {
  switch (timeOfDay) {
    case 'Morning':
      return Array.from({ length: 6 }, (_, i) => `${(6 + i).toString().padStart(2, '0')}:00`);
    case 'Afternoon':
      return Array.from({ length: 6 }, (_, i) => `${(12 + i).toString().padStart(2, '0')}:00`);
    case 'Evening':
      return Array.from({ length: 6 }, (_, i) => `${(18 + i).toString().padStart(2, '0')}:00`);
    case 'Night':
      return Array.from({ length: 6 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);
  }
};

// First, update the timeOptions type and add necessary interfaces
interface TimeOption {
  hour: string;
  available: boolean;
}

// Add this type guard function
const isTimeOption = (value: unknown): value is string => {
  return typeof value === 'string' && /^\d{2}:00$/.test(value);
};

export function StreamerCard({ streamer }: { streamer: Streamer }) {
  const router = useRouter();
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [extendedProfile, setExtendedProfile] = useState<StreamerProfile | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedHours, setSelectedHours] = useState<string[]>([]);
  const [platform, setPlatform] = useState(streamer.platform);
  const [activeSchedule, setActiveSchedule] = useState<any>(null);
  const [daysOff, setDaysOff] = useState<string[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date()));
  const [bookings, setBookings] = useState<any[]>([]);
  const [averageRating, setAverageRating] = useState(streamer.rating);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [needsShipping, setNeedsShipping] = useState<ShippingOption>('no');
  const [clientLocation, setClientLocation] = useState<string>('');

  const isMinimumBookingMet = selectedHours.length >= 2;

  useEffect(() => {
    fetchExtendedProfile();

    const supabase = createClient();
    
    // Subscribe to both ratings and profile changes
    const ratingSubscription = supabase
      .channel('public:streamer_ratings')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'streamer_ratings', filter: `streamer_id=eq.${streamer.id}` },
        () => {
          fetchExtendedProfile();
        }
      )
      .subscribe();

    // Add subscription for streamer profile changes
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
  }, [streamer.id]);

  useEffect(() => {
    fetchActiveSchedule();
    fetchDaysOff();
    fetchAcceptedBookings();

    const supabase = createClient();
    
    // Subscribe to booking changes
    const bookingSubscription = supabase
      .channel('public:bookings')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'bookings', filter: `streamer_id=eq.${streamer.id}` },
        () => {
          fetchActiveSchedule();
          fetchDaysOff();
          fetchAcceptedBookings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(bookingSubscription);
    };
  }, [streamer.id]);

  useEffect(() => {
    if (extendedProfile && extendedProfile.gallery.photos.length > 0) {
      setSelectedImage(extendedProfile.gallery.photos[0].photo_url);
    }
  }, [extendedProfile]);

  useEffect(() => {
    const fetchClientLocation = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('location')
          .eq('id', user.id)
          .single();
        
        if (profile?.location) {
          setClientLocation(profile.location);
        }
      }
    };

    fetchClientLocation();
  }, []);

  const fetchExtendedProfile = async () => {
    const supabase = createClient();
    
    try {
      // Fetch streamer data including video_url
      const { data: streamerData, error: streamerError } = await supabase
        .from('streamers')
        .select('*')
        .eq('id', streamer.id)
        .single();

      if (streamerError) {
        console.error('Error fetching streamer data:', streamerError);
        return;
      }

      // Fetch average rating
      const { data: ratingData, error: ratingError } = await supabase
        .rpc('get_streamer_average_rating', { streamer_id_param: streamer.id });

      if (ratingError) {
        console.error('Error fetching average rating:', ratingError);
      }

      // Fetch gallery photos
      const { data: galleryPhotos, error: galleryError } = await supabase
        .from('streamer_gallery_photos')
        .select('*')
        .eq('streamer_id', streamer.id)
        .order('order_number');

      if (galleryError) {
        console.error('Error fetching gallery photos:', galleryError);
      }

      // Fetch testimonials
      const { data: testimonials, error: testimonialsError } = await supabase
        .from('testimonials')
        .select('*')
        .eq('streamer_id', streamer.id);

      if (testimonialsError) {
        console.error('Error fetching testimonials:', testimonialsError);
      }

      setExtendedProfile({
        ...streamer,
        ...streamerData,
        video_url: streamerData?.video_url, // Explicitly set video_url
        rating: ratingData ? parseFloat(ratingData) : streamer.rating,
        age: 28,
        gender: "Female",
        experience: "5 years",
        fullBio: streamerData?.bio || streamer.bio,
        gallery: {
          photos: galleryPhotos || [],
        },
        testimonials: testimonials || [],
      });

    } catch (error) {
      console.error('Error fetching extended profile:', error);
    }
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
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('streamer_id', streamer.id)
      .in('status', ['accepted', 'pending']);

    if (error) {
      console.error('Error fetching bookings:', error);
      toast.error('Failed to fetch bookings');
    } else {
      console.log('Fetched bookings:', data); // Add this line for debugging
      setBookings(data || []);
    }
  };

  const isSlotAvailable = useCallback((date: Date, hour: number) => {
    if (!activeSchedule) return false;
    const dayOfWeek = date.getDay();
    const daySchedule = activeSchedule[dayOfWeek];
    if (!daySchedule || !daySchedule.slots) return false;
  
    const isInSchedule = daySchedule.slots.some((slot: any) => {
      const start = parseInt(slot.start.split(':')[0]);
      const end = parseInt(slot.end.split(':')[0]);
      return hour >= start && hour < end;
    });

    // Check if there's an accepted or pending booking for this slot
    const bookingExists = bookings.some(booking => {
      const bookingStart = new Date(booking.start_time);
      const bookingEnd = new Date(booking.end_time);
      return (
        isSameDay(date, bookingStart) &&
        (
          (hour >= bookingStart.getHours() && hour < bookingEnd.getHours()) ||
          (hour === bookingEnd.getHours() && bookingEnd.getMinutes() > 0)
        )
      );
    });

    return isInSchedule && !bookingExists;
  }, [activeSchedule, bookings]);

  const handleBooking = () => {
    if (!selectedDate || selectedHours.length === 0) {
      alert('Please select a date and time for your booking');
      return;
    }

    const startDateTime = new Date(selectedDate);
    startDateTime.setHours(parseInt(selectedHours[0]), 0, 0, 0);
    const endDateTime = new Date(selectedDate);
    endDateTime.setHours(parseInt(selectedHours[selectedHours.length - 1]), 0, 0, 0);

    const queryParams = new URLSearchParams({
      streamerId: streamer.id.toString(),
      streamerName: `${streamer.first_name} ${streamer.last_name}`,
      date: format(startDateTime, 'yyyy-MM-dd'),
      startTime: format(startDateTime, 'HH:mm:ss'),
      endTime: format(endDateTime, 'HH:mm:ss'),
      platform: platform,
      price: streamer.price.toString(),
      location: streamer.location,
      rating: streamer.rating.toString(),
      image_url: streamer.image_url,
    });

    setIsBookingModalOpen(false);
    router.push(`/booking-detail?${queryParams.toString()}`);
  };

  const generateTimeOptions = () => {
    if (!selectedDate || !activeSchedule) return [];
    const dayOfWeek = selectedDate.getDay();
    const daySchedule = activeSchedule[dayOfWeek];
    if (!daySchedule || !daySchedule.slots) return [];
  
    const options = daySchedule.slots.flatMap((slot: { start: string; end: string }) => {
      const start = parseInt(slot.start.split(':')[0]);
      const end = parseInt(slot.end.split(':')[0]);
      return Array.from({ length: end - start }, (_, i) => `${(start + i).toString().padStart(2, '0')}:00`);
    });

    // Filter out hours that are not available
    return options.filter((hour: string) => isSlotAvailable(selectedDate, parseInt(hour)));
  };

  const timeOptions = generateTimeOptions();

  const generateWeekDays = (startDate: Date) => {
    return Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
  };

  const weekDays = generateWeekDays(currentWeekStart);

  const handleHourSelection = (hour: string) => {
    setSelectedHours((prevSelected) => {
      const hourNum = parseInt(hour);
      
      // If clicking on an already selected hour
      if (prevSelected.includes(hour)) {
        const newSelected = prevSelected.filter(h => h !== hour);
        
        // After deselection, ensure remaining hours are continuous
        if (newSelected.length > 0) {
          const selectedHourNums = newSelected.map(h => parseInt(h));
          const minHour = Math.min(...selectedHourNums);
          const maxHour = Math.max(...selectedHourNums);
          
          // Create an array of all hours between min and max
          return Array.from(
            { length: maxHour - minHour + 1 }, 
            (_, i) => `${(minHour + i).toString().padStart(2, '0')}:00`
          );
        }
        return newSelected;
      } else {
        // If no hours are selected yet, just select this hour
        if (prevSelected.length === 0) {
          return [hour];
        }
        
        // Get the first and last selected hours
        const selectedHourNums = prevSelected.map(h => parseInt(h));
        const minHour = Math.min(...selectedHourNums);
        const maxHour = Math.max(...selectedHourNums);
        
        // Only allow selection if it's consecutive (either one hour before first or one hour after last)
        if (hourNum === maxHour + 1 || hourNum === minHour - 1) {
          const newSelected = [...prevSelected, hour];
          // Sort numerically to ensure correct order
          return newSelected.sort((a, b) => parseInt(a) - parseInt(b));
        }
        
        // If clicking a new starting hour, reset selection to just this hour
        return [hour];
      }
    });
  };

  const isHourSelected = (hour: string) => selectedHours.includes(hour);

  const isHourDisabled = (hour: string) => {
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
    
    // If no hours selected, all available hours are enabled
    if (selectedHours.length === 0) return false;
    
    // Get the first and last selected hours
    const selectedHourNums = selectedHours.map(h => parseInt(h));
    const minHour = Math.min(...selectedHourNums);
    const maxHour = Math.max(...selectedHourNums);
    
    // Only enable hours that would maintain continuity
    // Either one hour before the first selected hour or one hour after the last selected hour
    return hourNum !== maxHour + 1 && hourNum !== minHour - 1;
  };

  const isDayOff = (date: Date) => {
    return date < startOfDay(new Date()) || 
           daysOff.includes(format(date, 'yyyy-MM-dd')) ||
           isDateTooSoonForShipping(date);
  };

  const getMinimumBookingDate = () => {
    if (needsShipping === 'no') return startOfDay(new Date());
    
    // If shipping is needed, check locations
    const isSameCity = clientLocation.toLowerCase() === streamer.location.toLowerCase();
    const daysToAdd = isSameCity ? 1 : 3;
    return addDays(startOfDay(new Date()), daysToAdd);
  };

  const isDateTooSoonForShipping = (date: Date) => {
    if (needsShipping === 'no') return false;
    return isBefore(date, getMinimumBookingDate());
  };

  const fullName = `${streamer.first_name} ${streamer.last_name}`;
  
  const openBookingModal = () => {
    if (!selectedDate) {
      setSelectedDate(startOfDay(new Date()));
    }
    setIsBookingModalOpen(true);
  };

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
    e.stopPropagation(); // Stop propagation at the earliest point
    e.preventDefault(); // Prevent any default behavior
    
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        toast.error('Please sign in to send messages');
        router.push('/sign-in');
        return;
      }

      // user.id is already string (UUID) from auth
      const clientId = user.id;
      // streamer.id is number (BigInt) from database
      const streamerId = streamer.id;

      await createOrGetConversation(clientId, streamerId);
      router.push('/messages');
      
    } catch (error) {
      console.error('Error creating conversation:', error);
      toast.error('Failed to create conversation');
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
      <div 
        className="group relative bg-transparent w-full font-sans cursor-pointer"
        onClick={() => setIsProfileModalOpen(true)}
      >
        {/* Image Container - reduced height */}
        <div className="relative w-full h-44 sm:h-52 rounded-xl overflow-hidden">
          <img
            src={streamer.image_url}
            alt={formatName(streamer.first_name, streamer.last_name)}
            className="w-full h-full object-cover transform transition-transform duration-300 scale-100 group-hover:scale-105"
          />
        </div>

        {/* Content Container - reduced padding and font sizes */}
        <div className="p-3 sm:p-4 pt-2 sm:pt-3 bg-white/95 rounded-b-xl transition-all duration-300 group-hover:bg-white">
          {/* Name and Platforms */}
          <div className="flex items-center justify-between gap-1 mb-1">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm sm:text-base text-foreground">
                {formatName(streamer.first_name, streamer.last_name)}
              </h3>
              <div className="flex gap-1">
                {(streamer.platforms || [streamer.platform]).map((platform, index) => (
                  <div
                    key={platform}
                    className={`px-1.5 py-0.5 rounded-full text-white text-[9px] sm:text-[10px] font-medium
                      ${platform.toLowerCase() === 'shopee' 
                        ? 'bg-gradient-to-r from-orange-500 to-orange-600' 
                        : 'bg-gradient-to-r from-blue-900 to-black text-white'
                      }`}
                  >
                    {platform}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Price Display */}
          <div className="flex flex-col mb-1.5">
            <div className="flex items-center gap-1">
              <span className="text-sm sm:text-base font-bold text-foreground">
                {priceInfo.displayPrice}
              </span>
              <span className="text-[10px] sm:text-xs font-normal text-foreground/70">/ jam</span>
            </div>
            {priceInfo.originalPrice && priceInfo.discountPercentage && priceInfo.discountPercentage > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-xs sm:text-sm text-gray-400 line-through">
                  {priceInfo.originalPrice}
                </span>
                <span className="text-[10px] sm:text-xs font-medium text-blue-600">
                  Hemat {priceInfo.discountPercentage}%
                </span>
              </div>
            )}
          </div>

          {/* Rating - smaller size */}
          <div className="scale-90 origin-left">
            <RatingStars rating={averageRating} />
          </div>

          {/* Bio Preview - reduced margins */}
          <div className="mt-2 mb-2 min-h-[2.5rem]">
            <p className="text-xs sm:text-sm text-gray-600 line-clamp-2 relative">
              {streamer.bio || 'No bio available'}
              {streamer.bio && streamer.bio.length > 100 && (
                <span className="font-bold text-blue-600 hover:text-blue-700 cursor-pointer ml-1 inline-block">
                  Read more
                </span>
              )}
            </p>
          </div>

          {/* Location and Categories */}
          <div className="flex flex-col gap-2 mb-3">
            {/* Location */}
            <div className="flex items-center gap-1.5">
              <div className="p-1 bg-[#2563eb]/10 rounded-full">
                <MapPin className="w-3 h-3 text-[#2563eb]" />
              </div>
              <span className="text-xs text-gray-600">{streamer.location}</span>
            </div>
            
            {/* Categories */}
            <div className="flex flex-wrap gap-1.5 min-h-[64px] content-start">
              {(streamer.category || '')
                .split(',')
                .filter(Boolean)
                .slice(0, 6) // Limit to 6 categories (2 rows of 3)
                .map((category) => (
                <div 
                  key={category} 
                  className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-md h-[28px]"
                >
                  <div className="p-1 bg-[#2563eb]/10 rounded-full shrink-0">
                    <Monitor className="w-3 h-3 text-[#2563eb]" />
                  </div>
                  <span className="text-xs text-gray-600 truncate">
                    {category.trim()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Buttons - reduced size */}
          <div 
            className="flex gap-1.5" 
            onClick={(e) => e.stopPropagation()}
          >
            <Button 
              className="flex-1 text-[10px] sm:text-xs py-0.5 text-white max-w-[85%] 
                bg-gradient-to-r from-[#1e40af] to-[#6b21a8] hover:from-[#1e3a8a] hover:to-[#581c87]"
              onClick={(e) => {
                e.stopPropagation();
                openBookingModal();
              }}
            >
              Book Livestreamer
            </Button>
            <Button
              variant="outline"
              className="px-2 text-[#2563eb] border-[#2563eb] hover:bg-[#2563eb]/5"
              onClick={(e) => {
                e.stopPropagation();
                setIsProfileModalOpen(false);
                handleMessageClick(e);
              }}
            >
              <Mail className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={isBookingModalOpen} onOpenChange={setIsBookingModalOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto p-3 sm:p-6">
          <DialogHeader>
            <div className="flex items-center space-x-3 mb-4">
              <Image
                src={streamer.image_url}
                alt={`${streamer.first_name} ${streamer.last_name}`}
                width={48}
                height={48}
                className="rounded-full object-cover"
              />
              <div>
                <DialogTitle className="text-lg sm:text-2xl font-semibold mb-0.5">
                  {formatName(streamer.first_name, streamer.last_name)}
                </DialogTitle>
                <DialogDescription className="text-sm sm:text-base">
                  Select your preferred date and time
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <BookingCalendar 
            selectedDate={selectedDate}
            onDateSelect={(dateStr) => setSelectedDate(new Date(dateStr))}
            onTimeSelect={(time) => {
              if (selectedDate) {
                const [hours, minutes] = time.split(':').map(Number);
                const newDate = new Date(selectedDate);
                newDate.setHours(hours, minutes, 0, 0);
                setSelectedDate(newDate);
              }
            }}
          />

          <div className="h-px bg-gray-200" />

          {activeSchedule ? (
            <div className="space-y-3 sm:space-y-4">
              {(['Morning', 'Afternoon', 'Evening', 'Night'] as const).map((timeOfDay) => {
                const slots = getTimeSlots(timeOfDay);
                const availableSlots = slots.filter(hour => 
                  Array.isArray(timeOptions) && 
                  timeOptions.some(option => isTimeOption(option) && option === hour)
                );
                
                // Only show the section if there are available slots
                if (availableSlots.length === 0) return null;

                return (
                  <div key={timeOfDay}>
                    <h4 className="text-xs sm:text-sm font-semibold mb-2">{timeOfDay}</h4>
                    <div className="grid grid-cols-6 gap-1 sm:gap-2">
                      {slots.map((hour) => {
                        const isAvailable = Array.isArray(timeOptions) && 
                          timeOptions.some(option => isTimeOption(option) && option === hour);

                        return (
                          <Button
                            key={hour}
                            variant={isHourSelected(hour) ? "default" : "outline"}
                            className={cn(
                              "text-[10px] sm:text-sm p-1 sm:p-2 h-auto",
                              isHourSelected(hour) 
                                ? 'bg-gradient-to-r from-[#1e40af] to-[#6b21a8] text-white hover:from-[#1e3a8a] hover:to-[#581c87]' 
                                : 'hover:bg-blue-50',
                              !isAvailable && 'opacity-50 cursor-not-allowed'
                            )}
                            onClick={() => handleHourSelection(hour)}
                            disabled={isHourDisabled(hour) || !isAvailable}
                          >
                            {hour}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6">
              <div className="text-sm text-gray-500 mb-2">
                This streamer hasn't set their availability yet.
              </div>
              <div className="text-xs text-gray-400">
                Please check back later or contact the streamer directly.
              </div>
            </div>
          )}

          {selectedHours.length > 0 && (
            <div className="text-xs sm:text-sm font-medium">
              Selected time: {getSelectedTimeRange()}
            </div>
          )}
          {selectedHours.length === 1 && (
            <p className="text-xs text-red-500">Minimum booking is 1 hour.</p>
          )}

          <div className="h-px bg-gray-200 my-4" />

          {/* Grid container for both selects */}
          <div className="space-y-4">
            {/* Shipping Select */}
            <div className="grid grid-cols-4 items-center gap-2 sm:gap-4">
              <Label htmlFor="shipping-needed" className="text-right text-xs sm:text-sm">
                Perlu Pengiriman
              </Label>
              <Select
                value={needsShipping}
                onValueChange={(value) => setNeedsShipping(value as ShippingOption)}
              >
                <SelectTrigger id="shipping-needed" className="col-span-3 h-8 sm:h-10 text-xs sm:text-sm">
                  <SelectValue placeholder="Pilih opsi pengiriman" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Ya</SelectItem>
                  <SelectItem value="no">Tidak</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Shipping information message */}
            {needsShipping === 'yes' && (
              <div className="col-span-4 text-sm bg-blue-50 border border-blue-200 rounded-md p-3">
                <p className="text-blue-800">
                  {clientLocation.toLowerCase() === streamer.location.toLowerCase()
                    ? "Karena lokasi Anda sama dengan streamer, Anda hanya dapat memilih jadwal minimal H+1 untuk memberikan waktu pengiriman produk."
                    : "Karena lokasi Anda berbeda dengan streamer, Anda hanya dapat memilih jadwal minimal H+3 untuk memberikan waktu pengiriman produk."
                  }
                </p>
                <p className="text-blue-600 mt-2 text-xs">
                  Lokasi Anda: {clientLocation || 'Belum diatur'}
                  <br />
                  Lokasi Streamer: {streamer.location}
                </p>
              </div>
            )}

            {/* Platform Select */}
            <div className="grid grid-cols-4 items-center gap-2 sm:gap-4">
              <Label htmlFor="booking-platform" className="text-right text-xs sm:text-sm">
                Platform
              </Label>
              <Select onValueChange={setPlatform} value={platform}>
                <SelectTrigger id="booking-platform" className="col-span-3 h-8 sm:h-10 text-xs sm:text-sm">
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Shopee">Shopee</SelectItem>
                  <SelectItem value="TikTok">TikTok</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Add the customer support text */}
          <div className="mt-4 text-center">
            <p className="text-xs sm:text-sm">
              <span className="text-gray-600">Ada pertanyaan? Hubungi CS kami: </span>
              <a 
                href="https://wa.me/6282154902561" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-blue-600 underline hover:text-blue-800"
                onClick={(e) => e.stopPropagation()}
              >
                klik disini
              </a>
            </p>
          </div>

          <DialogFooter className="mt-4">
            <Button 
              onClick={handleBooking} 
              className="w-full h-10 sm:h-12 text-xs sm:text-sm bg-gradient-to-r from-[#1e40af] to-[#6b21a8] hover:from-[#1e3a8a] hover:to-[#581c87] text-white"
              disabled={selectedHours.length < 2}
            >
              Proceed to Booking Details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Profile Modal */}
      <Dialog open={isProfileModalOpen} onOpenChange={setIsProfileModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogClose className="absolute right-4 top-4 rounded-full bg-gradient-to-r from-[#1e40af] to-[#6b21a8] p-1 text-white hover:from-[#1e3a8a] hover:to-[#581c87] transition-colors z-50">
            <X className="h-4 w-4" />
          </DialogClose>
          
          {extendedProfile && (
            <>
              {/* Video Section */}
              {extendedProfile.video_url && (
                <div className="mb-4 sm:mb-6 w-full aspect-video">
                  <iframe
                    width="100%"
                    height="100%"
                    src={`https://www.youtube.com/embed/${getYouTubeVideoId(extendedProfile.video_url) || ''}`}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="rounded-lg"
                  />
                </div>
              )}

              {/* Gallery Section */}
              <div>
                <h3 className="text-xs font-semibold text-gray-900 mb-3">Gallery</h3>
                <div className="flex flex-col space-y-3">
                  {/* Main Image - Fixed aspect ratio container */}
                  <div className="w-full aspect-[4/3] relative rounded-lg overflow-hidden bg-gray-100">
                    <Image
                      src={selectedImage || extendedProfile.image_url}
                      alt="Selected gallery image"
                      fill
                      className="object-contain"
                      sizes="(max-width: 600px) 100vw, 600px"
                    />
                  </div>

                  {/* Thumbnails Grid */}
                  <div className="grid grid-cols-4 gap-2 w-full">
                    {extendedProfile.gallery.photos.map((photo) => (
                      <div
                        key={photo.id}
                        className={`aspect-square relative cursor-pointer overflow-hidden rounded-md bg-gray-100
                          ${selectedImage === photo.photo_url ? 'ring-2 ring-blue-600' : ''}`}
                        onClick={() => setSelectedImage(photo.photo_url)}
                      >
                        <Image
                          src={photo.photo_url}
                          alt={`Gallery photo ${photo.order_number}`}
                          fill
                          className="object-cover"
                          sizes="(max-width: 600px) 25vw, 150px"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Thick grey divider */}
              <div className="h-3 bg-gray-200 -mx-6 my-6" />

              {/* Profile Info - changed border color from red-500 to blue-600 */}
              <div className="flex gap-3">
                <Image
                  src={extendedProfile.image_url}
                  alt={fullName}
                  width={60}
                  height={60}
                  className="object-cover border-2 border-blue-600 rounded-lg"
                />
                
                <div className="flex-1">
                  <div className="mb-2">
                    <h2 className="text-base font-bold">
                      {formatName(streamer.first_name, streamer.last_name)}
                    </h2>
                    <p className="text-xs text-foreground/70">{extendedProfile.category}</p>
                    <div className="mt-1 scale-90 origin-left">
                      <RatingStars rating={averageRating} />
                    </div>
                  </div>

                  {/* Changed text colors from red-500 to blue-600 */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                    <div className="flex items-center gap-1.5 text-blue-600">
                      <User className="w-3.5 h-3.5" />
                      <span className="text-xs">{extendedProfile.age} Years</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-blue-600">
                      <User className="w-3.5 h-3.5" />
                      <span className="text-xs">{extendedProfile.gender}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-blue-600">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-xs">{extendedProfile.experience}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-blue-600">
                      <MapPin className="w-3.5 h-3.5" />
                      <span className="text-xs">{extendedProfile.location}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* About Me Section */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-semibold text-gray-900">About Me</h3>
                <p className="text-xs text-gray-600 leading-relaxed">{extendedProfile.fullBio}</p>
              </div>

              {/* Thick grey divider */}
              <div className="h-3 bg-gray-200 -mx-6 my-6" />

              {/* Testimonials - changed border color */}
              <div>
                <h3 className="text-xs font-semibold text-gray-900 mb-2">Client Testimonials</h3>
                <div className="space-y-2">
                  {extendedProfile.testimonials.map((testimonial, index) => (
                    <div key={index} className="border border-blue-600 p-2 rounded-lg">
                      <p className="italic text-xs text-gray-600">"{testimonial.comment}"</p>
                      <p className="font-medium mt-1 text-xs text-blue-600">- {testimonial.client_name}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Book Livestreamer button - changed to blue/purple gradient */}
              <div className="flex gap-4 mt-6">
                <Button 
                  className="flex-1 bg-gradient-to-r from-[#1e40af] to-[#6b21a8] hover:from-[#1e3a8a] hover:to-[#581c87] text-white text-sm"
                  onClick={() => {
                    setIsProfileModalOpen(false);
                    openBookingModal();
                  }}
                >
                  Book Livestreamer
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function StreamerCardSkeleton() {
  return (
    <div className="group relative bg-transparent w-full font-sans cursor-pointer">
      <div className="relative w-full h-44 sm:h-52 rounded-xl overflow-hidden bg-gray-200 animate-pulse"></div>
      <div className="p-3 sm:p-4 pt-2 sm:pt-3 bg-white/95 rounded-b-xl">
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-20 bg-gray-200 animate-pulse rounded"></div>
            <div className="h-4 w-12 bg-gray-200 animate-pulse rounded"></div>
          </div>
        </div>
        <div className="flex flex-col mb-1.5">
          <div className="h-4 w-24 bg-gray-200 animate-pulse rounded"></div>
          <div className="h-4 w-16 bg-gray-200 animate-pulse rounded mt-1"></div>
        </div>
        <div className="h-4 w-32 bg-gray-200 animate-pulse rounded mb-2"></div>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-4 w-16 bg-gray-200 animate-pulse rounded"></div>
          <div className="h-4 w-16 bg-gray-200 animate-pulse rounded"></div>
        </div>
        <div className="flex gap-1.5">
          <div className="h-8 w-full bg-gray-200 animate-pulse rounded"></div>
          <div className="h-8 w-8 bg-gray-200 animate-pulse rounded"></div>
        </div>
      </div>
    </div>
  );
}