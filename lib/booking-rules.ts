/**
 * Booking rules — the pure, testable half of the booking flow.
 *
 * These lived as module-level functions inside components/streamer-card.tsx,
 * which meant the marketplace card had to be imported to reach the rules that
 * decide whether a booking is legal. Moving booking to its own route
 * (app/booking/[streamerId]) made that a circular dependency waiting to happen,
 * so the rules moved here first.
 *
 * Nothing in this file touches React, Supabase or the DOM. It is all input ->
 * verdict, which is the property that lets the route and the card agree without
 * either one owning the other.
 *
 * Behaviour is unchanged from the original: every function is the same code,
 * only relocated. The quirks are preserved deliberately, including the
 * inclusive/exclusive hour arithmetic that looks redundant (`+ 1 - 1`) but is
 * load-bearing — `getTotalHoursAndPrice` counts elapsed hours while
 * `calculateBlockDuration` counts touched slots, and the two are genuinely
 * different numbers.
 */
import { addDays, format, isBefore, startOfDay } from 'date-fns';

import { isSameCity } from '@/lib/cities';


// Add these utility functions at the top of the file
export const calculateDuration = (start: Date, end: Date): number => {
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60));
};

// Add this utility function for calculating platform fee
export const calculatePriceWithPlatformFee = (basePrice: number): number => {
  const platformFeePercentage = 30;
  return basePrice * (1 + platformFeePercentage / 100);
};

// Add this utility function at the top of the file
export const convertToUTC = (date: Date, hour: number): Date => {
  // Create a new date with the specified hour
  const adjustedDate = new Date(date);
  adjustedDate.setHours(hour, 0, 0, 0);
  
  // Format with timezone awareness using date-fns-tz
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  console.log(`Converting ${adjustedDate.toISOString()} to UTC from timezone ${userTimezone}`);
  
  // Store original date for debugging
  const originalTime = adjustedDate.toISOString();
  
  // The Date object automatically handles timezone conversion internally when 
  // using toISOString(), so we don't need additional adjustment
  
  // For debugging
  console.log(`Original time: ${originalTime}, UTC time: ${adjustedDate.toISOString()}`);
  
  return adjustedDate;
};

// Add TimeRange interface at the top with other interfaces
export interface TimeRange {
  start: string;
  end: string;
  duration: number;
}

/**
 * Whether the brand is shipping product to the host before the stream.
 *
 * Load-bearing for dates, not just copy: 'yes' pushes the earliest bookable day
 * out — one day for a host in the same city, three otherwise — because the
 * product physically has to arrive first. 'no' means tomorrow is fine.
 */
export type ShippingOption = 'yes' | 'no';

export const getTimeSlots = (timeOfDay: 'Morning' | 'Afternoon' | 'Evening' | 'Night'): string[] => {
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
export interface TimeOption {
  hour: string;
  available: boolean;
}

// Add this type guard function
export const isTimeOption = (value: unknown): value is string => {
  return typeof value === 'string' && /^\d{2}:00$/.test(value);
};

// Add new interface for selected date info
export interface SelectedDateInfo {
  date: Date;
  hours: string[];
  totalHours: number;
  isEditing: boolean;
  timeRanges?: { start: string; end: string; duration: number }[];
}

export const calculateBlockDuration = (block: string[]): number => {
  if (block.length === 0) return 0;
  const startHour = parseInt(block[0]);
  const endHour = parseInt(block[block.length - 1]);
  // Calculate duration based on the actual time difference
  return endHour - startHour + 1; // Add 1 because the end hour is inclusive
};

export const getBulkDateRange = (mode: 'week' | 'twoWeeks' | 'month', startDate: Date = new Date()) => {
  const start = startOfDay(startDate);
  switch (mode) {
    case 'week':
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    case 'twoWeeks':
      return Array.from({ length: 14 }, (_, i) => addDays(start, i));
    case 'month':
      return Array.from({ length: 30 }, (_, i) => addDays(start, i));
  }
};

export const getTotalHoursAndPrice = (selectedDates: Map<string, SelectedDateInfo>, basePrice: number) => {
  let totalHours = 0;
  let totalPrice = 0;

  selectedDates.forEach((dateInfo) => {
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

    // Calculate hours for each block based on actual time difference
    blocks.forEach(block => {
      if (block.length > 0) {
        const startHour = parseInt(block[0]);
        const endHour = parseInt(block[block.length - 1]);
        // Calculate duration by subtracting 1 from the difference to get actual hours
        const duration = endHour - startHour + 1 - 1; // +1 for inclusive, -1 for actual hours
        totalHours += duration;
        totalPrice += duration * basePrice;
      }
    });
  });

  return { totalHours, totalPrice };
};

export const validateTimeSlotSelection = (
  currentHours: string[],
  newHour: string,
  dateKey: string,
  selectedDates: Map<string, SelectedDateInfo>,
  isRemoving: boolean = false,
  isSlotAvailable: (date: Date, hour: number) => boolean
): { isValid: boolean; error: string } => {
  // Convert hours to numbers for easier comparison
  const hourNum = parseInt(newHour);
  const selectedHourNums = currentHours.map(h => parseInt(h));

  // If removing an hour
  if (isRemoving) {
    // First, remove the hour we want to remove
    const remainingHours = selectedHourNums.filter(h => h !== hourNum);
    if (remainingHours.length === 0) return { isValid: true, error: "" };

    // Group remaining hours into consecutive blocks
    const blocks: number[][] = [];
    let currentBlock: number[] = [remainingHours[0]];

    for (let i = 1; i < remainingHours.length; i++) {
      if (remainingHours[i] === remainingHours[i - 1] + 1) {
        currentBlock.push(remainingHours[i]);
      } else {
        blocks.push([...currentBlock]);
        currentBlock = [remainingHours[i]];
      }
    }
    blocks.push(currentBlock);

    // Check if all resulting blocks maintain the minimum 3-slot requirement
    const hasValidBlocks = blocks.every(block => {
      const duration = (Math.max(...block) - Math.min(...block)) + 1; // Add 1 for inclusive duration
      return duration >= 3;
    });

    if (!hasValidBlocks) {
      return {
        isValid: false,
        error: "Tidak dapat menghapus jam karena akan membuat durasi kurang dari 2 jam (3 slot)"
      };
    }

    return { isValid: true, error: "" };
  }

  // If adding a new hour
  // If no hours selected, always valid to start
  if (selectedHourNums.length === 0) {
    // When starting a new block, we need to ensure there are at least 2 more available hours after this one
    const nextTwoHours = [hourNum + 1, hourNum + 2];
    const dateInfo = selectedDates.get(dateKey);
    
    if (!dateInfo) return { isValid: false, error: "Invalid date" };
    
    const allHoursAvailable = nextTwoHours.every(h => 
      isSlotAvailable(new Date(dateInfo.date), h)
    );

    if (!allHoursAvailable) {
      return {
        isValid: false,
        error: "Harus tersedia minimal 2 jam berurutan setelah jam yang dipilih (total 3 slot)"
      };
    }

    return { isValid: true, error: "" };
  }

  // Group existing hours into blocks
  const blocks: number[][] = [];
  let currentBlock: number[] = [selectedHourNums[0]];

  for (let i = 1; i < selectedHourNums.length; i++) {
    if (selectedHourNums[i] === selectedHourNums[i - 1] + 1) {
      currentBlock.push(selectedHourNums[i]);
    } else {
      blocks.push([...currentBlock]);
      currentBlock = [selectedHourNums[i]];
    }
  }
  blocks.push(currentBlock);

  // Check if the new hour extends any existing block
  for (const block of blocks) {
    const minHour = Math.min(...block);
    const maxHour = Math.max(...block);

    if (hourNum === maxHour + 1 || hourNum === minHour - 1) {
      // When extending a block, ensure it doesn't exceed maximum allowed duration
      const newBlockSize = hourNum === maxHour + 1 ? block.length + 1 : block.length + 1;
      return { isValid: true, error: "" };
    }
  }

  // If starting a new block, ensure there's at least a 2-hour gap
  const minGap = Math.min(...blocks.map(block => {
    const blockMin = Math.min(...block);
    const blockMax = Math.max(...block);
    return Math.min(
      Math.abs(hourNum - blockMin),
      Math.abs(hourNum - blockMax)
    );
  }));

  if (minGap >= 2) {
    // When starting a new block, we need to ensure there are at least 2 more available hours after this one
    const nextTwoHours = [hourNum + 1, hourNum + 2];
    const dateInfo = selectedDates.get(dateKey);
    
    if (!dateInfo) return { isValid: false, error: "Invalid date" };
    
    const allHoursAvailable = nextTwoHours.every(h => 
      isSlotAvailable(new Date(dateInfo.date), h)
    );

    if (!allHoursAvailable) {
      return {
        isValid: false,
        error: "Harus tersedia minimal 2 jam berurutan setelah jam yang dipilih (total 3 slot)"
      };
    }

    return { isValid: true, error: "" };
  }

  return {
    isValid: false,
    error: "Mohon pilih jam yang berurutan atau berjarak minimal 2 jam dari jadwal lain"
  };
};

export const validateMinimumBooking = (hours: string[]): { isValid: boolean; error: string } => {
  // Group consecutive hours into blocks
  const blocks: string[][] = [];
  let currentBlock: string[] = [hours[0]];

  for (let i = 1; i < hours.length; i++) {
    if (parseInt(hours[i]) === parseInt(hours[i - 1]) + 1) {
      currentBlock.push(hours[i]);
    } else {
      blocks.push([...currentBlock]);
      currentBlock = [hours[i]];
    }
  }
  blocks.push(currentBlock);

  // Check if any block meets the minimum requirement (3 slots = 2 hours)
  const hasValidBlock = blocks.some(block => block.length >= 3);
  
  if (!hasValidBlock) {
    return {
      isValid: false,
      error: "Setiap sesi pemesanan harus minimal 2 jam berurutan (3 slot waktu)"
    };
  }

  return { isValid: true, error: "" };
};

// Add new validation function for shipping and date restrictions
export const validateDateRestrictions = (
  date: Date,
  needsShipping: ShippingOption,
  clientLocation: string,
  streamerLocation: string
): { isValid: boolean; error: string } => {
  const now = new Date();
  const startOfTomorrow = startOfDay(addDays(now, 1));

  // Basic validation - can't book today or in the past
  if (isBefore(date, startOfTomorrow)) {
    return {
      isValid: false,
      error: "Pemesanan hanya dapat dilakukan mulai besok"
    };
  }

  // Shipping validation
  if (needsShipping === 'yes') {
    // Compared through the city registry, not raw strings: "Jakarta",
    // "DKI Jakarta" and "Jaksel" are one city for a courier. An unknown or
    // missing city resolves to "not the same city", which keeps the safer
    // 3-day lead time.
    const sameCity = isSameCity(clientLocation, streamerLocation);
    const minDays = sameCity ? 1 : 3;
    const earliestDate = addDays(startOfTomorrow, minDays - 1);

    if (isBefore(date, earliestDate)) {
      return {
        isValid: false,
        error: sameCity
          ? "Untuk pengiriman produk, pemesanan dapat dilakukan mulai besok untuk memastikan pengiriman produk"
          : "Untuk pengiriman produk ke luar kota, pemesanan dapat dilakukan minimal 3 hari dari sekarang untuk memastikan pengiriman produk"
      };
    }
  }

  return { isValid: true, error: "" };
};

// Add this helper function for bulk selection validation
export const validateBulkSelection = (
  dates: Date[],
  needsShipping: ShippingOption | null,
  clientLocation: string,
  streamerLocation: string
): { 
  validDates: Date[],
  invalidDates: { date: Date; reason: string }[]
} => {
  // Return early if required fields are not set
  if (!needsShipping) {
    return {
      validDates: [],
      invalidDates: dates.map(date => ({
        date,
        reason: "Shipping requirement not selected"
      }))
    };
  }

  const result = {
    validDates: [] as Date[],
    invalidDates: [] as { date: Date; reason: string }[]
  };

  for (const date of dates) {
    const dateValidation = validateDateRestrictions(
      date,
      needsShipping,
      clientLocation,
      streamerLocation
    );

    if (dateValidation.isValid) {
      result.validDates.push(date);
    } else {
      result.invalidDates.push({
        date,
        reason: dateValidation.error
      });
    }
  }

  return result;
};

// Add this validation helper at the top level
export const validateRequirementsForDateSelection = (
  needsShipping: ShippingOption | null,
  platform: string | null
): { isValid: boolean; error: string } => {
  if (!needsShipping) {
    return {
      isValid: false,
      error: "Mohon pilih opsi pengiriman terlebih dahulu"
    };
  }
  if (!platform) {
    return {
      isValid: false,
      error: "Mohon pilih platform streaming terlebih dahulu"
    };
  }
  return { isValid: true, error: "" };
};

// Add helper function to group consecutive hours into time ranges
export const groupConsecutiveHours = (hours: string[]): TimeRange[] => {
  if (!hours.length) return [];
  
  const sortedHours = [...hours].sort();
  const ranges: TimeRange[] = [];
  let currentRange: { start: string; end: string } | null = null;

  for (let i = 0; i < sortedHours.length; i++) {
    const currentHour = parseInt(sortedHours[i]);
    const nextHour = i < sortedHours.length - 1 ? parseInt(sortedHours[i + 1]) : null;

    if (!currentRange) {
      currentRange = {
        start: `${currentHour.toString().padStart(2, '0')}:00`,
        end: `${(currentHour + 1).toString().padStart(2, '0')}:00`
      };
    } else if (nextHour === currentHour + 1) {
      currentRange.end = `${(currentHour + 1).toString().padStart(2, '0')}:00`;
    } else {
      ranges.push({
        start: currentRange.start,
        end: currentRange.end,
        duration: parseInt(currentRange.end) - parseInt(currentRange.start)
      });
      currentRange = null;
    }
  }

  if (currentRange) {
    ranges.push({
      start: currentRange.start,
      end: currentRange.end,
      duration: parseInt(currentRange.end) - parseInt(currentRange.start)
    });
  }

  return ranges;
};
