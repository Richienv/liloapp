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

// Update the Streamer interface to include video_url
export interface Streamer {
  id: number;
  user_id: string;
  first_name: string;
  last_name: string;
  platform: string;
  category: string;
  rating: number;
  price: number;
  image_url: string;
  bio: string;
  location: string;
  video_url: string | null;
  availableTimeSlots?: string[];
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

  const isMinimumBookingMet = selectedHours.length >= 2;

  useEffect(() => {
    fetchExtendedProfile();

    const supabase = createClient();
    
    const ratingSubscription = supabase
      .channel('public:streamer_ratings')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'streamer_ratings', filter: `streamer_id=eq.${streamer.id}` },
        () => {
          fetchExtendedProfile();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ratingSubscription);
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

  const fetchExtendedProfile = async () => {
    const supabase = createClient();
    
    // Fetch streamer data including video_url
    const { data: streamerData, error: streamerError } = await supabase
      .from('streamers')
      .select('*')
      .eq('id', streamer.id)
      .single();

    if (streamerError) {
      console.error('Error fetching streamer data:', streamerError);
    }

    // Fetch average rating
    const { data: ratingData, error: ratingError } = await supabase
      .rpc('get_streamer_average_rating', { streamer_id_param: streamer.id });

    if (ratingError) {
      console.error('Error fetching average rating:', ratingError);
    } else if (ratingData !== null) {
      setAverageRating(parseFloat(ratingData));
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

    console.log("Fetched video_url:", streamerData?.video_url);

    setExtendedProfile({
      ...streamer,
      ...streamerData,
      rating: ratingData ? parseFloat(ratingData) : streamer.rating,
      age: 28, // You might want to fetch this from the database as well
      gender: "Female", // You might want to fetch this from the database as well
      experience: "5 years", // You might want to fetch this from the database as well
      fullBio: streamerData?.bio || streamer.bio,
      gallery: {
        photos: galleryPhotos || [],
      },
      testimonials: testimonials || [],
    });

    console.log("Extended Profile:", {
      ...streamer,
      ...streamerData,
      rating: ratingData ? parseFloat(ratingData) : streamer.rating,
      gallery: { photos: galleryPhotos || [] },
      testimonials: testimonials || [],
    });
  };

  const fetchActiveSchedule = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('streamer_active_schedules')
      .select('schedule')
      .eq('streamer_id', streamer.id);

    if (error) {
      console.error('Error fetching active schedule:', error);
    } else if (data && data.length > 0) {
      setActiveSchedule(JSON.parse(data[0].schedule));
    } else {
      // Set a default schedule if none is found
      setActiveSchedule({
        0: { slots: [{ start: '09:00', end: '17:00' }] },
        1: { slots: [{ start: '09:00', end: '17:00' }] },
        2: { slots: [{ start: '09:00', end: '17:00' }] },
        3: { slots: [{ start: '09:00', end: '17:00' }] },
        4: { slots: [{ start: '09:00', end: '17:00' }] },
        5: { slots: [{ start: '09:00', end: '17:00' }] },
        6: { slots: [{ start: '09:00', end: '17:00' }] },
      });
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
      if (prevSelected.includes(hour)) {
        return prevSelected.filter((h) => h !== hour);
      } else {
        const newSelected = [...prevSelected, hour].sort();
        if (newSelected.length > 1) {
          const start = newSelected[0];
          const end = newSelected[newSelected.length - 1];
          return Array.from({ length: parseInt(end) - parseInt(start) + 1 }, (_, i) => 
            `${(parseInt(start) + i).toString().padStart(2, '0')}:00`
          );
        }
        return newSelected;
      }
    });
  };

  const isHourSelected = (hour: string) => selectedHours.includes(hour);

  const isHourDisabled = (hour: string) => {
    if (!selectedDate) return true;
    const selectedDateTime = new Date(selectedDate);
    selectedDateTime.setHours(parseInt(hour), 0, 0, 0);
    const now = new Date();
    return isBefore(selectedDateTime, now) || !isSlotAvailable(selectedDate, parseInt(hour));
  };

  const isDayOff = (date: Date) => daysOff.includes(format(date, 'yyyy-MM-dd'));

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

  const handleMessageClick = async () => {
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
          {/* Name and Platform */}
          <div className="flex items-center justify-between gap-1 mb-1">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm sm:text-base text-foreground">
                {formatName(streamer.first_name, streamer.last_name)}
              </h3>
              <div className={`px-1.5 py-0.5 rounded-full text-white text-[9px] sm:text-[10px] font-medium
                ${streamer.platform.toLowerCase() === 'shopee' 
                  ? 'bg-gradient-to-r from-orange-500 to-orange-600' 
                  : 'bg-gradient-to-r from-purple-800 to-purple-900'
                }`}>
                {streamer.platform}
              </div>
            </div>
          </div>

          {/* Price Display - smaller text */}
          <div className="flex flex-col mb-1.5">
            <div className="flex items-center gap-1">
              <span className="text-sm sm:text-base font-bold text-foreground">
                Rp {streamer.price.toLocaleString('id-ID')}
              </span>
              <span className="text-[10px] sm:text-xs font-normal text-foreground/70">/ jam</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs sm:text-sm text-gray-400 line-through">
                Rp {Math.round(streamer.price * 1.25).toLocaleString('id-ID')}
              </span>
              <span className="text-[10px] sm:text-xs font-medium text-red-500">25%</span>
            </div>
          </div>

          {/* Rating - smaller size */}
          <div className="scale-90 origin-left">
            <RatingStars rating={averageRating} />
          </div>

          {/* Bio Preview - reduced margins */}
          <div className="mt-2 mb-2 min-h-[2.5rem]">
            <p className="text-xs sm:text-sm text-gray-600 line-clamp-2 relative">
              {streamer.bio}
              {streamer.bio.length > 100 && (
                <span className="font-bold text-red-500 hover:text-red-600 cursor-pointer ml-1 inline-block">
                  Read more
                </span>
              )}
            </p>
          </div>

          {/* Location and Category - smaller icons and text */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1.5">
              <div className="p-1 bg-red-50 rounded-full">
                <MapPin className="w-3 h-3 text-red-500" />
              </div>
              <span className="text-xs text-gray-600">{streamer.location}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="p-1 bg-red-50 rounded-full">
                <Monitor className="w-3 h-3 text-red-500" />
              </div>
              <span className="text-xs text-gray-600">{streamer.category}</span>
            </div>
          </div>

          {/* Buttons - reduced size */}
          <div className="flex gap-1.5">
            <Button 
              className={`flex-1 text-[10px] sm:text-xs py-0.5 text-white max-w-[85%]
                ${streamer.platform.toLowerCase() === 'shopee' 
                  ? 'bg-gradient-to-r from-orange-500 to-orange-600' 
                  : 'bg-gradient-to-r from-purple-800 to-purple-900'
                }`}
              onClick={(e) => {
                e.stopPropagation();
                openBookingModal();
              }}
            >
              Book Livestreamer
            </Button>
            <Button
              variant="outline"
              className="px-2 text-red-500 border-red-500 hover:bg-red-50"
              onClick={handleMessageClick}
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
                  {streamer.first_name} {streamer.last_name}
                </DialogTitle>
                <DialogDescription className="text-sm sm:text-base">
                  Select your preferred date and time
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <BookingCalendar 
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            isDayOff={(date) => date < startOfDay(new Date()) || isDayOff(date)}
          />

          <div className="h-px bg-gray-200" />

          {timeOptions.length > 0 ? (
            <div className="space-y-3 sm:space-y-4">
              {['Morning', 'Afternoon', 'Evening', 'Night'].map((timeOfDay) => (
                <div key={timeOfDay}>
                  <h4 className="text-xs sm:text-sm font-semibold mb-2">{timeOfDay}</h4>
                  <div className="grid grid-cols-4 gap-1 sm:gap-2">
                    {timeOptions
                      .filter((hour: string) => {
                        const hourNum = parseInt(hour.split(':')[0]);
                        return (
                          (timeOfDay === 'Night' && (hourNum >= 0 && hourNum < 6)) ||
                          (timeOfDay === 'Morning' && (hourNum >= 6 && hourNum < 12)) ||
                          (timeOfDay === 'Afternoon' && (hourNum >= 12 && hourNum < 18)) ||
                          (timeOfDay === 'Evening' && (hourNum >= 18 && hourNum < 24))
                        );
                      })
                      .map((hour: string) => (
                        <Button
                          key={hour}
                          variant={isHourSelected(hour) ? "default" : "outline"}
                          className={`text-[10px] sm:text-sm p-1 sm:p-2 h-auto ${
                            isHourSelected(hour) 
                              ? 'bg-red-500 text-white hover:bg-red-600' 
                              : 'hover:bg-red-50'
                          }`}
                          onClick={() => handleHourSelection(hour)}
                          disabled={isHourDisabled(hour)}
                        >
                          {hour}
                        </Button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-xs sm:text-sm text-gray-500">
              No available slots for this day
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

          <div className="grid grid-cols-4 items-center gap-2 sm:gap-4">
            <Label htmlFor="booking-platform" className="text-right text-xs sm:text-sm">Platform</Label>
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

          <DialogFooter className="mt-4">
            <Button 
              onClick={handleBooking} 
              className="w-full h-10 sm:h-12 text-xs sm:text-sm bg-red-500 hover:bg-red-600 text-white"
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
          <DialogClose className="absolute right-4 top-4 rounded-full bg-red-500 p-1 text-white hover:bg-red-600 transition-colors z-50">
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
                          ${selectedImage === photo.photo_url ? 'ring-2 ring-red-500' : ''}`}
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

              {/* Profile Info - reduced spacing */}
              <div className="flex gap-3">
                <Image
                  src={extendedProfile.image_url}
                  alt={fullName}
                  width={60} // Reduced from 80
                  height={60}
                  className="object-cover border-2 border-red-500 rounded-lg"
                />
                
                <div className="flex-1">
                  <div className="mb-2">
                    <h2 className="text-base font-bold">{fullName}</h2>
                    <p className="text-xs text-foreground/70">{extendedProfile.category}</p>
                    <div className="mt-1 scale-90 origin-left">
                      <RatingStars rating={averageRating} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                    <div className="flex items-center gap-1.5 text-red-500">
                      <User className="w-3.5 h-3.5" />
                      <span className="text-xs">{extendedProfile.age} Years</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-red-500">
                      <User className="w-3.5 h-3.5" />
                      <span className="text-xs">{extendedProfile.gender}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-red-500">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-xs">{extendedProfile.experience}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-red-500">
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

              {/* Testimonials */}
              <div>
                <h3 className="text-xs font-semibold text-gray-900 mb-2">Client Testimonials</h3>
                <div className="space-y-2">
                  {extendedProfile.testimonials.map((testimonial, index) => (
                    <div key={index} className="border border-red-500 p-2 rounded-lg">
                      <p className="italic text-xs text-gray-600">"{testimonial.comment}"</p>
                      <p className="font-medium mt-1 text-xs text-red-500">- {testimonial.client_name}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 mt-6">
                <Button 
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm"
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