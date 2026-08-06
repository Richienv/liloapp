'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDays, addWeeks, format, isBefore, isSameDay, startOfDay, startOfWeek, subWeeks } from 'date-fns';
import { AlertTriangle, ArrowLeft, Check, ChevronLeft, ChevronRight, MapPin, Package, Truck } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { CardActionBar } from '@/components/ui/card-action-bar';
import { Button } from '@/components/ui/button';
import {
  UNVERIFIED_BOOKING_MESSAGE,
  type Streamer,
  isStreamerBookable,
} from '@/components/streamer-card';
import { isSameCity } from '@/lib/cities';
import { TAX_RATE, subtotalWithPlatformFee } from '@/lib/pricing';
import { cn } from '@/lib/utils';
import { createClient } from '@/utils/supabase/client';
import {
  type SelectedDateInfo,
  type ShippingOption,
  calculateBlockDuration,
  getBulkDateRange,
  getTotalHoursAndPrice,
  groupConsecutiveHours,
  validateBulkSelection,
  validateDateRestrictions,
  validateMinimumBooking,
  validateRequirementsForDateSelection,
  validateTimeSlotSelection,
} from '@/lib/booking-rules';

function streamerCityValue(streamer: Pick<Streamer, 'location' | 'city_slug'>): string {
  return streamer.city_slug || streamer.location || '';
}

function formatName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  return [firstName, lastName].filter(Boolean).join(' ').trim() || 'Host Salda';
}

function rupiah(value: number): string {
  return `Rp ${Math.round(value).toLocaleString('id-ID')}`;
}

/**
 * The three questions a booking asks, in the order it asks them. Rendering the
 * stepper from this array rather than three hand-written blocks is what keeps
 * the labels, the numbers and the completion checks from drifting apart — the
 * old modal had the step names in one place and the validation in another.
 */
const STEPS = [
  { id: 'kebutuhan', label: 'Kebutuhan', hint: 'Pengiriman & platform' },
  { id: 'jadwal', label: 'Jadwal', hint: 'Tanggal & jam' },
  { id: 'ringkasan', label: 'Ringkasan', hint: 'Periksa & lanjutkan' },
] as const;

export interface BookingFlowProps {
  streamer: Streamer;
}

/**
 * Booking, as a page.
 *
 * It used to be a `<DialogContent className="max-h-[85vh]">` — a scrolling
 * modal containing a calendar, a slot grid, two required questions and a price
 * summary. On a phone that is the most expensive drop-off point in the product:
 * the total sits below the fold, the calendar competes with the page behind it
 * for scroll, and closing by accident throws away every selection.
 *
 * The logic below is the modal's, moved without edits. Availability, slot
 * validation, the shipping lead time, bulk selection and the `/booking-detail`
 * hand-off are byte-identical; the only changes are the two places that asked
 * "is the modal open", which a route answers with "always".
 */
export function BookingFlow({ streamer }: BookingFlowProps) {
  const router = useRouter();

  const streamerCity = streamerCityValue(streamer);
  const isBookable = isStreamerBookable(streamer);

  const [activeSchedule, setActiveSchedule] = useState<any>(null);

  const [bookings, setBookings] = useState<any[]>([]);

  /**
   * The visible week.
   *
   * Seeded from the server's clock, because this is a client component and Next
   * still server-renders it. If the server and the viewer are on different
   * sides of a week boundary — which for an Indonesian audience on US-hosted
   * infrastructure is most of Sunday — the markup React hydrates disagrees with
   * the markup it would have produced, and the calendar visibly jumps a week
   * after paint. Re-seeding on mount makes the browser's clock authoritative,
   * and the guard means it is a no-op whenever the two already agree.
   */
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date()));

  useEffect(() => {
    const local = startOfWeek(new Date());
    setCurrentWeekStart((current) =>
      current.getTime() === local.getTime() ? current : local,
    );
  }, []);

  const [selectedDates, setSelectedDates] = useState<Map<string, SelectedDateInfo>>(new Map());

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [selectedHours, setSelectedHours] = useState<string[]>([]);

  const [platform, setPlatform] = useState<string | null>(null);

  const [daysOff, setDaysOff] = useState<string[]>([]);

  const [needsShipping, setNeedsShipping] = useState<ShippingOption | null>(null);

  const [clientLocation, setClientLocation] = useState<string>('');

  const [activeBulkMode, setActiveBulkMode] = useState<'week' | 'twoWeeks' | 'month' | null>(null);

  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);

  const [isRequirementsValid, setIsRequirementsValid] = useState(() => 
    validateRequirementsForDateSelection(needsShipping, platform)
  );

  useEffect(() => {
    setIsRequirementsValid(validateRequirementsForDateSelection(needsShipping, platform));
  }, [needsShipping, platform]);

  /**
   * Does any selected day clear the minimum booking?
   *
   * This is the gate on "Lanjut ke pembayaran", and it used to carry its own
   * copy of the block-grouping logic ending in `block.length >= 2`. The shared
   * rule in lib/booking-rules — the one whose error message the product shows —
   * requires `>= 3`, and `validateMinimumBooking` was imported into this file
   * and then never called.
   *
   * Two slots is one billable hour, because a slot is a boundary and not an
   * hour of work. So the button was letting a brand pay for a one-hour session
   * on a screen that says "Minimal 2 jam berurutan per hari", and the rule that
   * would have stopped it was sitting unused three imports away.
   *
   * One rule, in one place, called from here.
   */
  const isMinimumBookingMet = useCallback(() => {
    if (selectedDates.size === 0) return false;

    return Array.from(selectedDates.values()).some(
      (dateInfo) => validateMinimumBooking(dateInfo.hours).isValid,
    );
  }, [selectedDates]);

  useEffect(() => {
    // Was gated on the modal being open. A route is always open, so this is
    // simply the mount load.
    fetchActiveSchedule();
    fetchAcceptedBookings();
  }, []);

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
          
          // The calendar is always on screen here, so there is no open-check
          // left to make.
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(bookingSubscription);
    };
  }, [streamer.id, refreshBookingData]);

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

  const handleDateSelect = (date: Date) => {
    // Validate required fields first
    const requiredFieldsValidation = validateRequirementsForDateSelection(needsShipping, platform);
    if (!requiredFieldsValidation.isValid) {
      toast.error(requiredFieldsValidation.error, {
        duration: 4000,
        position: 'top-center',
        className: 'bg-surface text-red-600 border-2 border-red-100 px-4 py-3 rounded-panel',
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
        className: 'bg-surface text-red-600 border-2 border-red-100 px-4 py-3 rounded-panel',
      });
      return;
    }

    const dateKey = format(date, 'yyyy-MM-dd');

    /**
     * Focus this date so the hour grid below the calendar renders for it.
     *
     * In the modal this was the `<BookingCalendar>` component's job — it was the
     * only caller of `setSelectedDate` in the entire file, via its `onTimeSelect`
     * prop. The page does not use that component, so nothing set it and
     * `selectedDate` stayed null forever.
     *
     * That was not a cosmetic loss. The block below pre-fills `hours` with EVERY
     * available hour of the day, and the hour grid is the only way to narrow it.
     * With the grid unreachable, picking a date silently committed the brand to
     * the host's whole working day — and because a full day easily clears the
     * two-consecutive-hour minimum, the "Lanjut ke pembayaran" button was
     * enabled the entire time. It would have taken payment for it.
     *
     * Toggling a date off moves focus to whatever is still selected, so the grid
     * never points at a date the brand has just removed.
     */
    const wasSelected = selectedDates.has(dateKey);
    if (wasSelected) {
      const remaining = Array.from(selectedDates.keys()).filter((key) => key !== dateKey);
      setSelectedDate(remaining.length > 0 ? new Date(`${remaining[0]}T00:00:00`) : null);
    } else {
      setSelectedDate(date);
    }

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

  const handleBooking = () => {
    if (!selectedDates.size) return;
    // Last gate before the payment flow, in case the modal was already open
    // when the streamer's verification was revoked.
    if (!isBookable) {
      toast.error(UNVERIFIED_BOOKING_MESSAGE, {
        duration: 4000,
        position: 'top-center',
        className: 'bg-surface text-red-600 border-2 border-red-100 px-4 py-3 rounded-panel',
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

  const handleBulkSelection = async (mode: 'week' | 'twoWeeks' | 'month') => {
    if (!isRequirementsValid.isValid) {
      toast.error(isRequirementsValid.error, {
        duration: 4000,
        position: 'top-center',
        className: 'bg-surface text-red-600 border-2 border-red-100 px-4 py-3 rounded-panel',
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
        className: 'bg-surface text-red-600 border-2 border-red-100 px-4 py-3 rounded-panel',
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
        className: 'bg-surface text-yellow-600 border-2 border-yellow-100 px-4 py-3 rounded-panel',
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
          className: 'bg-surface text-green-600 border-2 border-green-100 px-4 py-3 rounded-panel',
          icon: '✓',
        }
      );
    } else {
      toast.error("Tidak ada slot waktu yang tersedia untuk periode yang dipilih", {
        duration: 4000,
        position: 'top-center',
        className: 'bg-surface text-red-600 border-2 border-red-100 px-4 py-3 rounded-panel',
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
            className: 'bg-surface text-red-600 border-2 border-red-100',
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
              className: 'bg-surface text-red-600 border-2 border-red-100',
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
              className: 'bg-surface text-red-600 border-2 border-red-100',
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

  const isSameCityAsClient = isSameCity(clientLocation, streamerCity);
  const basePrice = streamer.price ?? 0;
  const { totalHours, totalPrice } = getTotalHoursAndPrice(selectedDates, basePrice);
  const subtotal = subtotalWithPlatformFee(totalPrice);
  /**
   * The rail's two new lines, derived — not invented.
   *
   * `TAX_RATE` and the 30% platform fee both come from lib/pricing, and the
   * arithmetic is the same order /booking-detail already uses (`subtotal * .11`,
   * then `subtotal + tax`), which is the number the payment call actually
   * charges. Nothing new is computed, fetched or sent; the screen simply stops
   * hiding the last line of the sum until the step after this one.
   */
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;
  const minimumMet = isMinimumBookingMet();

  /**
   * Which step the brand is actually on, derived rather than stored.
   *
   * A stored `currentStep` and a set of answers can disagree — go back, change
   * the platform, and the stepper still claims you are on step three. Deriving
   * it means the indicator cannot lie about the state of the form.
   */
  // `isRequirementsValid` is the {isValid, error} object the validator returns,
  // not a boolean. `!isRequirementsValid` is therefore always false — the
  // stepper could never show step 1 as active, and the hint below could never
  // render. Read the field, not the object.
  const requirementsMet = isRequirementsValid.isValid;
  const activeStep = !requirementsMet ? 0 : selectedDates.size === 0 || !minimumMet ? 1 : 2;

  /**
   * The empty-day guard.
   *
   * A host with no schedule for the chosen weekday, or whose every slot is
   * already booked, used to render an empty grid — indistinguishable from the
   * page still loading. The brand sits waiting for slots that are never coming.
   */
  const slotsForSelectedDate = selectedDate ? timeOptions : [];
  const selectedDateHasNoSlots = Boolean(selectedDate) && slotsForSelectedDate.length === 0;

  const selectedDateKey = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;

  return (
    <div className="mx-auto w-full max-w-[1180px] px-5 pb-28 pt-7">
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-5 inline-flex items-center gap-2 text-copy text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali
      </button>

      {/* The host's name moves off the H1 and into the eyebrow above it. The
          screen is "Atur sesi live" — the name is which host, not what this
          page is — and on a phone the rail that carries the name sits below
          the whole form, so dropping it from the top entirely would leave the
          brand with no idea who they are booking until they scroll past it. */}
      <p className="font-mono text-tiny text-ink-ghost">
        {formatName(streamer.first_name, streamer.last_name)}
      </p>
      <h1 className="mt-1 font-serif text-section font-medium text-ink">
        Atur sesi live
      </h1>
      <p className="mt-1 text-copy text-ink-soft">
        Tiga langkah. Kamu bisa kembali kapan saja tanpa kehilangan pilihan.
      </p>

      {/* Stepper. Numbers, not a progress bar — a brand needs to know how many
          questions are left, not what fraction of a bar is filled. */}
      <div className="mt-6 flex overflow-hidden rounded-[10px] border border-hairline bg-surface">
        {STEPS.map((step, index) => {
          const done = index < activeStep;
          const current = index === activeStep;
          return (
            <div
              key={step.id}
              className={cn(
                'flex flex-1 items-center gap-2.5 px-3.5 py-3 text-left',
                index < STEPS.length - 1 && 'border-r border-hairline',
                current && 'bg-brand-wash',
              )}
            >
              <span
                className={cn(
                  'flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-pill text-tiny font-semibold tracking-normal',
                  done && 'bg-positive-tint text-positive',
                  current && 'bg-brand text-white',
                  !done && !current && 'bg-surface-tint text-ink-faint',
                )}
              >
                {done ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    'block truncate text-copy font-medium',
                    current ? 'text-ink' : 'text-ink-muted',
                  )}
                >
                  {step.label}
                </span>
                <span className="block truncate text-tiny tracking-normal text-ink-faint">
                  {step.hint}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {!isBookable && (
        <div className="mt-5 flex items-start gap-2.5 rounded-panel border border-caution-line bg-caution-tint px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-caution" />
          <p className="text-copy text-caution-strong">{UNVERIFIED_BOOKING_MESSAGE}</p>
        </div>
      )}

      <div className="mt-6 flex flex-col items-start gap-6 lg:flex-row">
        {/* ------------------------------------------------- left: the form */}
        <div className="flex w-full min-w-0 flex-1 flex-col gap-3.5">
          {/* Step 1 — the two questions that decide which dates are even legal.
              They come first for that reason: asking them after the calendar
              means re-drawing the calendar underneath the brand's answer. */}
          <section className="rounded-panel border border-hairline bg-surface p-5">
            <h2 className="text-title font-semibold text-ink">Dua hal yang menentukan jadwal</h2>
            <p className="mt-1 text-meta text-ink-soft">
              Pengiriman produk menentukan tanggal paling awal yang bisa kamu pilih. Platform
              menentukan akun apa yang perlu kamu siapkan nanti.
            </p>

            <p className="mt-4 text-copy font-medium text-ink">Perlu kirim produk ke host?</p>
            <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {([
                { value: 'yes' as ShippingOption, icon: Package, title: 'Ya, kirim produk', body: isSameCityAsClient ? 'Kota sama — bisa mulai besok.' : 'Beda kota — butuh 3 hari untuk pengiriman.' },
                { value: 'no' as ShippingOption, icon: Truck, title: 'Tidak perlu', body: 'Host pakai produk digital atau milik sendiri.' },
              ]).map((option) => {
                const selected = needsShipping === option.value;
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setNeedsShipping(option.value)}
                    className={cn(
                      'rounded-[10px] border px-4 py-3.5 text-left transition-colors',
                      selected
                        ? 'border-brand bg-brand-tint'
                        : 'border-hairline-input bg-surface hover:bg-surface-raised',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className={cn('h-4 w-4', selected ? 'text-brand' : 'text-ink-faint')} />
                      <span className="text-copy font-medium text-ink">{option.title}</span>
                    </span>
                    <span className="mt-1 block text-mini text-ink-soft">{option.body}</span>
                  </button>
                );
              })}
            </div>

            <p className="mt-5 text-copy font-medium text-ink">Live di platform mana?</p>
            <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {['Shopee', 'TikTok'].map((option) => {
                const selected = platform === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPlatform(option)}
                    className={cn(
                      'rounded-[10px] border px-4 py-3.5 text-left text-copy font-medium transition-colors',
                      selected
                        ? 'border-brand bg-brand-tint text-ink'
                        : 'border-hairline-input bg-surface text-ink-muted hover:bg-surface-raised',
                    )}
                  >
                    {option} Live
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 2 — dates and hours. */}
          <section className="rounded-panel border border-hairline bg-surface p-5">
            {/* Heading, month and the week arrows on one row. The pair of
                arrows and the month they move never break apart, so the row is
                nowrap and only the heading is allowed to truncate. */}
            <div className="flex items-center justify-between gap-3">
              <h2 className="min-w-0 truncate text-title font-semibold text-ink">Pilih tanggal</h2>
              <div className="flex shrink-0 items-center gap-2">
                <span className="whitespace-nowrap text-mini text-ink-soft">
                  {format(currentWeekStart, 'MMMM yyyy')}
                </span>
                <button
                  type="button"
                  onClick={handlePreviousWeek}
                  aria-label="Minggu sebelumnya"
                  className="flex h-8 w-8 items-center justify-center rounded-field border border-hairline text-ink-muted hover:bg-surface-raised"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNextWeek}
                  aria-label="Minggu berikutnya"
                  className="flex h-8 w-8 items-center justify-center rounded-field border border-hairline text-ink-muted hover:bg-surface-raised"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-7 gap-1.5">
              {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((day) => (
                <span key={day} className="text-center text-micro tracking-normal text-ink-faint">
                  {day}
                </span>
              ))}
            </div>

            <div className="mt-1.5 grid grid-cols-7 gap-1.5">
              {weekDays.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const picked = selectedDates.has(key);
                // An already-picked day stays clickable even once it stops being
                // legal — answering "yes, I need shipping" after choosing
                // tomorrow pushes the earliest bookable date forward and
                // disables it. Left disabled it could not be removed, and
                // `handleBooking` reads `selectedDates`, not the grid, so the
                // brand would be charged for a date the rules had already
                // rejected. Clicking it now toggles it off; only unpicked
                // illegal days are inert.
                const disabled = !picked && (isDayOff(day) || !hasAvailableSchedule(day));
                const focused = selectedDate ? isSameDay(day, selectedDate) : false;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleDateSelect(day)}
                    className={cn(
                      'flex aspect-square flex-col items-center justify-center gap-1 rounded-field border text-copy transition-colors',
                      disabled && 'cursor-not-allowed border-hairline-soft bg-surface-sunken text-ink-ghost',
                      !disabled && picked && 'border-brand bg-brand-tint font-semibold text-brand-deep',
                      !disabled && !picked && focused && 'border-ink bg-surface font-medium text-ink',
                      !disabled && !picked && !focused && 'border-hairline-input bg-surface text-ink-body hover:bg-surface-raised',
                    )}
                  >
                    {format(day, 'd')}
                    {/* Every cell carries a marker, not just the chosen ones.
                        Rendering it only when picked made the date jump a pixel
                        as you selected it, and left the legend below describing
                        two states the grid never actually drew. */}
                    <span
                      className={cn(
                        'h-1 w-1 rounded-pill',
                        picked && 'bg-brand',
                        !picked && disabled && 'bg-hairline-strong',
                        !picked && !disabled && 'bg-ink-faint',
                      )}
                    />
                  </button>
                );
              })}
            </div>

            {/* The legend. It is the key to the grid above, so it names the
                three states in the order a brand meets them. */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="flex items-center gap-1.5 whitespace-nowrap text-mini text-ink-soft">
                <span className="h-2 w-2 shrink-0 rounded-hair bg-brand" />
                Terpilih
              </span>
              <span className="flex items-center gap-1.5 whitespace-nowrap text-mini text-ink-soft">
                <span className="h-1.5 w-1.5 shrink-0 rounded-pill bg-ink-faint" />
                Ada slot kosong
              </span>
              <span className="flex items-center gap-1.5 whitespace-nowrap text-mini text-ink-soft">
                <span className="h-1.5 w-1.5 shrink-0 rounded-pill bg-hairline-strong" />
                Host libur atau penuh
              </span>
            </div>

            {selectedDate && (
              <div className="mt-5 border-t border-hairline-soft pt-4">
                <p className="text-copy font-medium text-ink">
                  Jam pada {format(selectedDate, 'd MMMM')}
                </p>

                {selectedDateHasNoSlots ? (
                  /* The empty-day guard. Says which state this is and offers the
                     way out, instead of an empty grid that looks like loading. */
                  <div className="mt-3 rounded-panel border border-dashed border-hairline-input bg-surface px-5 py-11 text-center">
                    <p className="text-copy font-medium text-ink">
                      Tidak ada jam tersedia di tanggal ini
                    </p>
                    <p className="mx-auto mt-1 max-w-[36ch] text-meta text-ink-soft">
                      Host belum membuka jadwal untuk hari ini, atau semua jamnya sudah dibooking.
                    </p>
                    <Button
                      type="button"
                      variant="quiet"
                      size="action-compact"
                      className="mt-4 w-auto"
                      onClick={handleNextWeek}
                    >
                      Lihat minggu berikutnya
                    </Button>
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                    {slotsForSelectedDate.map((hour: string) => {
                      const disabled = selectedDateKey ? isHourDisabled(hour, selectedDateKey) : true;
                      const picked = selectedDateKey
                        ? (selectedDates.get(selectedDateKey)?.hours ?? []).includes(hour)
                        : false;
                      return (
                        <button
                          key={hour}
                          type="button"
                          disabled={disabled}
                          onClick={() => selectedDateKey && handleTimeSlotSelect(selectedDateKey, hour)}
                          className={cn(
                            'numeric rounded-field border px-2 py-2.5 text-meta transition-colors',
                            disabled && 'cursor-not-allowed border-hairline-soft bg-surface-sunken text-ink-ghost',
                            !disabled && picked && 'border-brand bg-brand-tint font-semibold text-brand-deep',
                            !disabled && !picked && 'border-hairline-input bg-surface text-ink-body hover:bg-surface-raised',
                          )}
                        >
                          {hour}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/*
              Why the first click marks three slots.

              The design reference words this as "Kenapa slotnya 2 jam" and
              explains it with two rules — a 2-hour minimum, and a 2-hour gap
              between sessions on the same day. Only the first is a rule a brand
              can meet or break here. The slots are one hour each, not two, and
              the gap rule in lib/booking-rules is unreachable from this grid:
              `isHourDisabled` only ever enables hours adjacent to or inside the
              current block, so a second session on one day cannot be started at
              all. Printing the reference's wording would have described a
              product that does not exist, so this says what the grid does.
            */}
            <div className="mt-5 rounded-field bg-surface-tint px-4 py-3.5">
              <p className="text-copy font-medium text-ink">Kenapa minimal 2 jam</p>
              <p className="mt-1 text-meta text-ink-soft">
                Satu sesi live minimal 2 jam. Jam pertama yang kamu pilih langsung menandai tiga
                slot berurutan — awal, tengah, dan akhir dari 2 jam itu. Pilih slot di sebelahnya
                kalau kamu mau sesi yang lebih panjang.
              </p>
            </div>
          </section>

          <CardActionBar
            primaryLabel="Lanjut ke pembayaran"
            primaryDisabled={!isBookable || !minimumMet || !platform}
            onPrimary={handleBooking}
            secondaryLabel="Batal"
            onSecondary={() => router.back()}
          >
            {!requirementsMet ? (
              'Pilih pengiriman dan platform dulu.'
            ) : !minimumMet ? (
              'Pilih minimal 2 jam berurutan.'
            ) : (
              <span className="numeric">
                {/* The rail's Total, not its Subtotal. An unlabelled figure in
                    the action bar reads as "what this costs", and the figure
                    the next screen asks the brand to pay is the tax-inclusive
                    one — showing the smaller number here is how a price
                    appears to go up at checkout. */}
                {selectedDates.size} hari · {totalHours} jam · {rupiah(total)}
              </span>
            )}
          </CardActionBar>
        </div>

        {/* ------------------------------------------- right: the price rail */}
        {/* Persistent, not a total that appears at the end. The one number a
            brand is tracking while they pick hours is the one the old modal
            kept below the fold. */}
        <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-[320px]">
          <div className="overflow-hidden rounded-panel border border-hairline bg-surface">
            <div className="flex gap-3 border-b border-hairline-soft p-4">
              <div
                className="h-16 w-[52px] shrink-0 rounded-field bg-surface-tint bg-cover bg-center"
                style={{
                  backgroundImage: streamer.image_url ? `url(${streamer.image_url})` : undefined,
                }}
              />
              <div className="min-w-0">
                <p className="truncate text-copy font-medium text-ink">
                  {formatName(streamer.first_name, streamer.last_name)}
                </p>
                <p className="mt-0.5 flex items-center gap-1 truncate text-mini text-ink-soft">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {streamerCity || 'Lokasi belum diatur'}
                </p>
                <p className="numeric mt-1 text-mini text-ink-body">
                  {rupiah(subtotalWithPlatformFee(basePrice))} / jam
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 p-4">
              <div className="flex justify-between text-copy">
                <span className="text-ink-soft">Hari dipilih</span>
                <span className="numeric text-ink">{selectedDates.size}</span>
              </div>
              <div className="flex justify-between text-copy">
                <span className="text-ink-soft">Total jam</span>
                <span className="numeric text-ink">{totalHours}</span>
              </div>
              <div className="flex justify-between text-copy">
                <span className="text-ink-soft">Subtotal</span>
                <span className="numeric text-ink">{rupiah(subtotal)}</span>
              </div>
              <div className="flex justify-between text-copy">
                <span className="text-ink-soft">Pajak 11%</span>
                <span className="numeric text-ink">{rupiah(tax)}</span>
              </div>
              <div className="flex items-baseline justify-between border-t border-hairline-soft pt-2.5">
                <span className="text-copy font-medium text-ink">Total</span>
                <span className="numeric text-price font-semibold text-ink">{rupiah(total)}</span>
              </div>
              <p className="text-tiny tracking-normal text-ink-faint">
                Pembatalan gratis hingga 24 jam sebelum jadwal. Setelah itu dikenakan biaya 50%.
              </p>
            </div>

            {selectedDates.size === 0 ? (
              /* The rail is the only part of the screen that is always in view
                 on desktop, so it is where "nothing chosen yet" belongs — an
                 empty summary that says which step is waiting, rather than a
                 block that silently is not there. */
              <div className="border-t border-hairline-soft p-4">
                <p className="text-copy font-medium text-ink">Belum ada tanggal</p>
                <p className="mt-1 text-meta text-ink-soft">
                  Kembali ke langkah 2 dan pilih tanggal dulu.
                </p>
              </div>
            ) : (
              <div className="border-t border-hairline-soft p-4">
                <button
                  type="button"
                  onClick={() => setIsSummaryExpanded((open) => !open)}
                  className="flex w-full items-center justify-between text-copy font-medium text-ink"
                >
                  Jadwal dipilih
                  <ChevronRight
                    className={cn(
                      'h-4 w-4 text-ink-faint transition-transform',
                      isSummaryExpanded && 'rotate-90',
                    )}
                  />
                </button>
                {isSummaryExpanded && (
                  <ul className="mt-2.5 flex flex-col gap-1.5">
                    {Array.from(selectedDates.entries()).map(([key, info]) => (
                      <li key={key} className="flex justify-between gap-2 text-mini">
                        <span className="text-ink-body">
                          {/* `new Date('2026-08-10')` is parsed as UTC; adding
                              the time component makes it local, so the label
                              cannot name the previous day. */}
                          {format(new Date(`${key}T00:00:00`), 'EEE, d MMM')}
                        </span>
                        <span className="numeric shrink-0 text-ink-soft">
                          {groupConsecutiveHours(info.hours)
                            .map((range) => `${range.start}–${range.end}`)
                            .join(', ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
