"use client";

import { Suspense } from 'react';
import { Loader2, X, CheckCircle } from 'lucide-react';
import { subtotalWithPlatformFee } from '@/lib/pricing';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import { createBookingAfterPayment } from '@/services/payment/payment-service';
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { format, parseISO, differenceInHours, addHours, isSameDay, startOfDay } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import toast from 'react-hot-toast';
import { MapPin, Star, Shield, Clock, Calendar, Monitor, DollarSign, AlertTriangle, Phone, ChevronLeft, Info, Package, FileText } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { PaymentModal } from '@/components/payment-modal';
import { Navbar } from "@/components/ui/navbar";
import Image from 'next/image';
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";
import { voucherService } from "@/services/voucher/voucher-service";

interface TimeRange {
  start: string;
  end: string;
  duration: number;
}

interface BookingWithRanges {
  date: string;
  startTime: string;
  endTime: string;
  timeRanges?: TimeRange[];
}

interface BookingDetails {
  streamerId: string;
  streamerName: string;
  bookings: BookingWithRanges[];
  platform: string;
  price: number;
  totalHours?: number;
  totalPrice: number;
  location: string;
  rating: number;
  image_url?: string;
}

interface TimeSlot {
  start: string;
  end: string;
}

interface DaySchedule {
  slots: TimeSlot[];
}

interface ActiveSchedule {
  [key: number]: DaySchedule;
}

interface PaymentResult {
  status: string;
  transaction_id?: string;
  message?: string;
}

interface AppliedVoucher {
  id: string;
  code: string;
  discountAmount: number;
}

interface PaymentMetadata {
  streamerId: string;
  userId: string;
  bookings: Array<{
    date: string;
    startTime: string;
    endTime: string;
    hours: number;
  }>;
  timezone: string;
  platform: string;
  specialRequest: string;
  sub_acc_link: string;
  sub_acc_pass: string;
  firstName: string;
  lastName: string;
  price: number;
  totalHours: number;
  totalPrice: number;
  voucher: {
    id: string;
    code: string;
    discountAmount: number;
  } | null;
  finalPrice: number;
}

type ShippingOption = 'yes' | 'no' | null;

// Add a new type for processing steps
type ProcessingStep = 'creating' | 'completed' | 'redirecting';

const platformStyles = {
  shopee: 'bg-surface-tint text-ink-muted border border-hairline',
  tiktok: 'bg-surface-tint text-ink-muted border border-hairline',
};

export default function BookingDetailPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto p-4 flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    }>
      <BookingDetailContent />
    </Suspense>
  );
}

function getAdjustedPrice(basePrice: number): number {
  return subtotalWithPlatformFee(basePrice); // base + 30% platform fee
}

function formatPrice(price: number): string {
  return `Rp ${Math.round(price).toLocaleString('id-ID')}`;
}

function BookingDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bookingDetails, setBookingDetails] = useState<BookingDetails | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>('qris');
  const [specialRequest, setSpecialRequest] = useState<string>('');
  const [subAccountLink, setSubAccountLink] = useState('');
  const [subAccountPassword, setSubAccountPassword] = useState('');
  const [selectedHours, setSelectedHours] = useState<string[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [activeSchedule, setActiveSchedule] = useState<any>(null);
  const [paymentToken, setPaymentToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMetadata, setPaymentMetadata] = useState<PaymentMetadata | null>(null);
  const [voucherCode, setVoucherCode] = useState('');
  const [isValidatingVoucher, setIsValidatingVoucher] = useState(false);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [appliedVoucher, setAppliedVoucher] = useState<AppliedVoucher | null>(null);
  const [needsShipping, setNeedsShipping] = useState<ShippingOption>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const [isProcessingBooking, setIsProcessingBooking] = useState(false);
  const [processingStep, setProcessingStep] = useState<ProcessingStep>('creating');
  const [redirectCountdown, setRedirectCountdown] = useState(3);

  // Add helper function to calculate hours between times
  const calculateHoursBetween = (start: string, end: string): number => {
    const startHour = parseInt(start.split(':')[0]);
    const endHour = parseInt(end.split(':')[0]);
    return endHour - startHour;
  };

  // Update the calculateTotalHours function
  const calculateTotalHours = (bookings: BookingWithRanges[]): number => {
    return bookings.reduce((total, booking) => {
      return total + booking.timeRanges!.reduce((rangeTotal, range) => {
        return rangeTotal + calculateHoursBetween(range.start, range.end);
      }, 0);
    }, 0);
  };

  // Update the calculatePrices function
  const calculatePrices = () => {
    if (!bookingDetails) return { subtotal: 0, tax: 0, total: 0 };
    
    const adjustedPrice = getAdjustedPrice(bookingDetails.price);
    const subtotal = bookingDetails.bookings.reduce((total, booking) => {
      return total + booking.timeRanges!.reduce((rangeTotal, range) => {
        const hours = calculateHoursBetween(range.start, range.end);
        return rangeTotal + (adjustedPrice * hours);
      }, 0);
    }, 0);
    
    const tax = subtotal * 0.11;
    const total = Math.round(subtotal + tax);
    
    return { subtotal, tax, total };
  };

  useEffect(() => {
    if (searchParams) {
      try {
        // Parse the bookings data which now includes time ranges
        const bookingsData = JSON.parse(searchParams.get('bookings') || '[]').map((booking: any) => {
          // Convert the time ranges format from the URL
          const timeRanges = booking.timeRanges?.map((range: any) => ({
            start: range.start,
            end: range.end,
            duration: range.duration
          })) || [{
            start: booking.startTime,
            end: booking.endTime,
            duration: calculateHoursBetween(booking.startTime, booking.endTime)
          }];

          return {
            ...booking,
            timeRanges
          };
        });

        const details: BookingDetails = {
          streamerId: searchParams.get('streamerId') || '',
          streamerName: searchParams.get('streamerName') || '',
          bookings: bookingsData,
          platform: searchParams.get('platform') || '',
          price: Number(searchParams.get('price')) || 0,
          totalHours: calculateTotalHours(bookingsData),
          totalPrice: Number(searchParams.get('totalPrice')) || 0,
          location: decodeURIComponent(searchParams.get('location') || ''),
          rating: Number(searchParams.get('rating')) || 0,
          image_url: searchParams.get('image_url') || '/placeholder-avatar.png',
        };

        setBookingDetails(details);
      } catch (error) {
        console.error('Error parsing booking details:', error);
        toast.error('Invalid booking data');
      }
    }
  }, [searchParams]);

  const fetchBookings = async () => {
    const supabase = createClient();
    const streamerId = searchParams?.get('streamerId');
    if (!streamerId) return;

    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('streamer_id', streamerId)
      .in('status', ['accepted', 'pending']);

    if (error) {
      console.error('Error fetching bookings:', error);
      toast.error('Failed to fetch bookings');
    } else {
      setBookings(data || []);
    }

    // Set up real-time subscription
    const bookingSubscription = supabase
      .channel('public:bookings')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'bookings', filter: `streamer_id=eq.${streamerId}` },
        () => {
          fetchBookings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(bookingSubscription);
    };
  };

  const fetchActiveSchedule = async () => {
    const supabase = createClient();
    const streamerId = searchParams?.get('streamerId');
    if (!streamerId) return;

    const { data, error } = await supabase
      .from('streamer_active_schedules')
      .select('schedule')
      .eq('streamer_id', streamerId)
      .single();

    if (error) {
      console.error('Error fetching active schedule:', error);
    } else if (data) {
      setActiveSchedule(JSON.parse(data.schedule));
    }
  };

  const isSlotAvailable = useCallback((date: Date, hour: number) => {
    if (!bookingDetails || !activeSchedule) return false;
    const daySchedule = activeSchedule[date.getDay()];
    if (!daySchedule || !daySchedule.slots) return false;
  
    const isInSchedule = daySchedule.slots.some((slot: any) => {
      const start = parseInt(slot.start.split(':')[0]);
      const end = parseInt(slot.end.split(':')[0]);
      return hour >= start && hour < end;
    });

    const bookingExists = bookings.some(booking => {
      const bookingStart = new Date(booking.start_time);
      const bookingEnd = new Date(booking.end_time);
      return (
        isSameDay(date, bookingStart) &&
        (
          (hour >= bookingStart.getHours() && hour < bookingEnd.getHours()) ||
          (hour === bookingEnd.getHours() && bookingEnd.getHours() > bookingStart.getHours())
        )
      );
    });

    return isInSchedule && !bookingExists;
  }, [bookingDetails, activeSchedule, bookings]);

  const generateTimeOptions = () => {
    if (!bookingDetails) return [];
    const start = parseInt(bookingDetails.bookings[0].startTime.split(':')[0]);
    const end = parseInt(bookingDetails.bookings[bookingDetails.bookings.length - 1].endTime.split(':')[0]);
    const options = Array.from({ length: end - start }, (_, i) => `${(start + i).toString().padStart(2, '0')}:00`);
    
    // Filter out hours that are not available
    return options.filter(hour => isSlotAvailable(new Date(bookingDetails.bookings[0].date), parseInt(hour)));
  };

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
          ).filter(h => isSlotAvailable(new Date(bookingDetails!.bookings[0].date), parseInt(h)));
        }
        return newSelected;
      }
    });
  };

  const handleConfirmBooking = async () => {
    if (!bookingDetails || isLoading || isProcessing) return;

    try {
      setIsLoading(true);
      setIsProcessing(true);
      const supabase = createClient();
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('You must be logged in to confirm a booking.');
        return;
      }

      // Get user's timezone
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      console.log('=== Payment Metadata Creation ===');
      console.log('Original booking details:', JSON.stringify(bookingDetails, null, 2));
      
      // Create metadata for each booking
      const bookingsMetadata = bookingDetails.bookings.map(booking => {
        console.log('Processing booking:', JSON.stringify(booking, null, 2));
        console.log('Time ranges for booking:', JSON.stringify(booking.timeRanges, null, 2));
        
        const startDateTime = new Date(`${booking.date}T${booking.startTime}`);
        const endDateTime = new Date(`${booking.date}T${booking.endTime}`);
        const hours = calculateHoursBetween(booking.startTime, booking.endTime);

        return {
          date: booking.date,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          hours: hours,
          timeRanges: booking.timeRanges
        };
      });

      // Create payment metadata
      const metadata = {
        streamerId: bookingDetails.streamerId,
        userId: user.id,
        bookings: bookingsMetadata,
        timezone: userTimezone,
        platform: bookingDetails.platform,
        specialRequest: specialRequest,
        sub_acc_link: subAccountLink,
        sub_acc_pass: subAccountPassword,
        firstName: user.user_metadata.first_name,
        lastName: user.user_metadata.last_name,
        price: bookingDetails.price,
        totalHours: calculateTotalHours(bookingDetails.bookings),
        totalPrice: bookingDetails.totalPrice,
        voucher: appliedVoucher ? {
          id: appliedVoucher.id,
          code: appliedVoucher.code,
          discountAmount: appliedVoucher.discountAmount
        } : null,
        finalPrice: finalPrice
      };

      console.log('Generated payment metadata:', JSON.stringify(metadata, null, 2));

      // Create payment with updated description
      const paymentResponse = await fetch('/api/payments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: finalPrice,
          clientName: `${user.user_metadata.first_name} ${user.user_metadata.last_name}`,
          clientEmail: user.email,
          description: `Booking with ${bookingDetails.streamerName} for ${bookingDetails.totalHours} hours across ${bookingDetails.bookings.length} days`,
          metadata: metadata
        }),
      });

      if (!paymentResponse.ok) {
        throw new Error('Failed to create payment token');
      }

      const paymentData = await paymentResponse.json();
      if (!paymentData.token) {
        throw new Error('No payment token received');
      }

      setPaymentMetadata(metadata);
      setPaymentToken(paymentData.token);

    } catch (error) {
      console.error('Error initiating payment:', error);
      toast.error('Failed to initiate payment. Please try again.');
    } finally {
      setIsProcessing(false);
      setIsLoading(false);
    }
  };

  const handlePaymentSuccess = async (result: any) => {
    try {
      // Show immediate loading overlay
      setIsProcessingBooking(true);
      setProcessingStep('creating');
      
      console.log('=== Payment Success Start ===');
      console.log('Result from Midtrans:', JSON.stringify(result, null, 2));
      console.log('Payment metadata:', JSON.stringify(paymentMetadata, null, 2));

      if (!paymentMetadata || !bookingDetails) {
        console.error('Missing required data:', { paymentMetadata, bookingDetails });
        throw new Error('Missing payment metadata or booking details');
      }

      // Enhanced error handling for the payment callback
      console.log('Sending payment callback with timezone:', paymentMetadata.timezone);
      
      // Call the payment callback API
      const response = await fetch('/api/payments/callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          result: {
            ...result,
            transaction_status: 'settlement',
            status_code: '200',
            status_message: 'Success, transaction is found'
          },
          metadata: {
            ...paymentMetadata,
            streamerId: paymentMetadata.streamerId.toString(),
            price: Number(paymentMetadata.price),
            finalPrice: Number(paymentMetadata.finalPrice)
          }
        })
      });

      // Enhanced error handling for the response
      if (!response.ok) {
        let errorText = '';
        let errorData = null;
        
        try {
          // First try to read as JSON
          errorData = await response.json();
          errorText = JSON.stringify(errorData);
        } catch (e) {
          // If JSON parsing fails, read as text
          try {
            errorText = await response.text();
          } catch (textError) {
            errorText = 'Failed to parse error response';
          }
        }
        
        console.error('Payment callback failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData || errorText
        });
        
        throw new Error(
          errorData && errorData.details 
            ? errorData.details 
            : (errorData && errorData.error 
                ? errorData.error 
                : `Failed to process payment: ${response.status} ${response.statusText}`)
        );
      }

      const bookingData = await response.json();
      console.log('Booking created:', JSON.stringify(bookingData, null, 2));

      // Update to completed state with success message
      setProcessingStep('completed');
      
      // Start countdown for redirect
      setProcessingStep('redirecting');
      
      let countdown = 3;
      const countdownInterval = setInterval(() => {
        countdown--;
        setRedirectCountdown(countdown);
        
        if (countdown <= 0) {
          clearInterval(countdownInterval);
          window.location.href = '/client-bookings';
        }
      }, 1000);

    } catch (error) {
      console.error('=== Payment Success Error ===');
      console.error('Error details:', error);
      toast.error(error instanceof Error ? error.message : 'Error occurred. Please check console for details.');
      
      // Hide loading overlay on error
      setIsProcessingBooking(false);
      setIsProcessing(false);
      setPaymentToken(null);
    }
  };

  const handlePaymentPending = (result: any) => {
    toast.success('Payment pending. Please complete the payment.');
  };

  const handlePaymentError = (result: any) => {
    toast.error('Payment failed. Please try again.');
    setIsLoading(false);
    setIsProcessing(false);
  };

  const handlePaymentClose = () => {
    setPaymentToken(null);
    setIsLoading(false);
    setIsProcessing(false);
    // Use window.location.reload() instead of router.refresh()
    window.location.reload();
  };

  const isHourSelected = (hour: string) => selectedHours.includes(hour);

  const getStatusInfo = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return 'Menunggu streamer menerima pesanan kamu. Biasanya membutuhkan waktu 15-60 menit untuk konfirmasi.';
      case 'accepted':
        return 'Pesanan kamu telah diterima oleh streamer. Silakan tunggu link streaming yang akan diberikan saat waktu yang ditentukan.';
      case 'completed':
        return 'Sesi streaming telah selesai. Terima kasih telah menggunakan layanan kami.';
      case 'rejected':
        return 'Maaf, streamer tidak dapat menerima pesanan kamu. Silakan coba waktu lain atau streamer lainnya.';
      case 'live':
        return 'Sesi streaming sedang berlangsung.';
      default:
        return '';
    }
  };

  const handleValidateVoucher = async () => {
    if (!voucherCode.trim()) return;
    
    setIsValidatingVoucher(true);
    setVoucherError(null);

    try {
      const result = await voucherService.validateVoucher(voucherCode, total);
      
      if (result.isValid && result.voucher && result.discountAmount) {
        setAppliedVoucher({
          id: result.voucher.id,
          code: result.voucher.code,
          discountAmount: result.discountAmount
        });
        setVoucherCode('');
        toast.success('Voucher berhasil digunakan');
      } else {
        setVoucherError(result.error || 'Voucher tidak valid');
      }
    } catch (error) {
      console.error('Error validating voucher:', error);
      setVoucherError('Terjadi kesalahan saat validasi voucher');
    } finally {
      setIsValidatingVoucher(false);
    }
  };

  const handleRemoveVoucher = () => {
    setAppliedVoucher(null);
    setVoucherError(null);
  };

  // Update price calculations
  const { subtotal, tax, total } = calculatePrices();
  const finalPrice = appliedVoucher 
    ? Math.max(0, total - appliedVoucher.discountAmount)
    : total;

  // Add new function to format booking dates for display
  const formatBookingDates = (bookings: Array<any>) => {
    if (bookings.length === 1) {
      return format(new Date(bookings[0].date), 'dd MMMM yyyy');
    }
    return `${bookings.length} days (${format(new Date(bookings[0].date), 'dd MMM')} - ${format(new Date(bookings[bookings.length - 1].date), 'dd MMM yyyy')})`;
  };

  // Add function to format total hours
  const formatTotalHours = (totalHours: number) => {
    return `${totalHours} hour${totalHours > 1 ? 's' : ''}`;
  };

  // Add helper function for quick selection validation
  const isQuickSelectionEnabled = (needsShipping: ShippingOption | null, platform: string | null): boolean => {
    return needsShipping !== null && platform !== null && platform !== '';
  };

  // Add bulk selection handler
  const handleBulkSelection = (mode: 'week' | 'twoWeeks') => {
    if (!isQuickSelectionEnabled(needsShipping, platform)) {
      toast.error('Please select shipping option and platform first');
      return;
    }
    // Implementation of bulk selection logic
    // This can be expanded based on your requirements
  };

  // Add a helper function to format time range
  const formatTimeRange = (booking: { startTime: string; endTime: string }) => {
    const hours = calculateHoursBetween(booking.startTime, booking.endTime);
    return `${booking.startTime} - ${booking.endTime} (${hours} hours)`;
  };

  // Add function to get appropriate message for each processing step
  const getProcessingMessage = (): string => {
    switch (processingStep) {
      case 'creating':
        return "We're finalizing your booking...";
      case 'completed':
        return 'Your booking has been successfully created!';
      case 'redirecting':
        return `Redirecting to My Bookings in ${redirectCountdown}...`;
      default:
        return 'Processing your request...';
    }
  };

  if (!bookingDetails) {
    return <div className="container mx-auto p-4">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-6xl font-sans text-xs sm:text-sm mt-4 sm:mt-8">
      {/* Payment Processing Overlay */}
      {isProcessingBooking && (
        <div className="fixed inset-0 bg-white/95 z-50 flex flex-col items-center justify-center">
          <div className="text-center max-w-md mx-auto px-4">
            {processingStep === 'creating' && (
              <div className="relative h-16 w-16 mx-auto mb-6">
                <div className="absolute top-0 h-16 w-16 rounded-full border-4 border-hairline"></div>
                <div className="absolute top-0 h-16 w-16 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
              </div>
            )}
            
            {processingStep === 'completed' && (
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-6" />
            )}
            
            {processingStep === 'redirecting' && (
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-6" />
            )}
            
            <h2 className="text-xl font-medium text-ink mb-2">
              {processingStep === 'creating' ? 'Processing Payment' : 'Payment Successful'}
            </h2>
            
            <p className="text-ink-muted mb-6">{getProcessingMessage()}</p>
            
            {processingStep === 'redirecting' && (
              <div className="w-full bg-surface-tint rounded-full h-1.5 mb-1 overflow-hidden">
                <div 
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" 
                  style={{ width: `${((3 - redirectCountdown) / 3) * 100}%` }}
                ></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header Section */}
      <div className="flex items-center gap-3 sm:gap-6 mb-6 sm:mb-8">
        <button 
          onClick={() => router.push('/protected')}
          className="flex items-center gap-2 text-ink-muted hover:text-ink transition-colors"
        >
          <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
          <span className="text-sm sm:text-base">Kembali</span>
        </button>
        <h1 className="text-xl sm:text-2xl font-semibold text-ink">Detail Pemesanan</h1>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 sm:gap-8">
        {/* Left Container */}
        <div className="flex-1 space-y-6 sm:space-y-8">
          {/* Streamer Info Card with increased padding */}
          <div className="bg-surface rounded-panel border border-hairline-input p-6 sm:p-8">
            <div className="flex items-start gap-6">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-panel bg-surface-tint overflow-hidden flex-shrink-0">
                <Image
                  src={bookingDetails?.image_url || '/placeholder-avatar.png'}
                  alt={bookingDetails?.streamerName || ''}
                  width={96}
                  height={96}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg sm:text-xl font-semibold text-ink">
                      {bookingDetails?.streamerName}
                    </h2>
                    <div className="flex items-center gap-2 mt-2">
                      <MapPin className="h-4 w-4 text-ink-faint" />
                      <span className="text-sm text-ink-muted">{bookingDetails?.location}</span>
                    </div>
                  </div>
                  <div className="flex items-center bg-yellow-50 px-3 py-1.5 rounded-lg">
                    <Star className="w-4 h-4 text-yellow-400 fill-current" />
                    <span className="ml-1.5 font-medium">{bookingDetails?.rating.toFixed(1)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 pt-2">
                  <Badge className={`${
                    bookingDetails?.platform.toLowerCase() === 'shopee'
                      ? 'bg-surface-tint text-ink-muted border border-hairline'
                      : 'bg-surface-tint text-ink-muted border border-hairline'
                  } text-white border-0 px-3 py-1`}>
                    {bookingDetails?.platform}
                  </Badge>
                  <div className="flex items-center gap-2 text-ink-muted">
                    <Calendar className="h-4 w-4" />
                    <span>{bookingDetails && formatBookingDates(bookingDetails.bookings)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-ink-muted">
                    <Clock className="h-4 w-4" />
                    <span>
                      {bookingDetails && `${calculateTotalHours(bookingDetails.bookings)} hours`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Booking Summary Section */}
          <div className="bg-surface rounded-panel border border-hairline-input p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-ink">Booking Summary</h3>
              <span className="text-xs text-ink-soft">*harga belum termasuk pajak</span>
            </div>
            
            {bookingDetails?.bookings.map((booking, index) => (
              <div key={index} className="border-b border-hairline pb-4">
                <div className="space-y-3">
                  <div className="text-sm font-medium text-ink">
                    {format(new Date(booking.date), 'dd MMMM yyyy')}
                  </div>
                  
                  {booking.timeRanges?.map((range, rangeIndex) => (
                    <div key={rangeIndex} className="bg-blue-50/50 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-ink-muted">
                          {`${range.start} - ${range.end} (${calculateHoursBetween(range.start, range.end)} hours)`}
                        </div>
                        <div className="text-sm font-medium text-ink">
                          {formatPrice(getAdjustedPrice(bookingDetails.price) * calculateHoursBetween(range.start, range.end))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Total Section */}
            <div className="pt-4 space-y-2">
              {/* Subtotal breakdown */}
              <div className="flex items-center justify-between text-sm text-ink-muted">
                <span>Subtotal ({calculateTotalHours(bookingDetails?.bookings || [])} hours)</span>
                <span>{formatPrice(calculatePrices().subtotal)}</span>
              </div>

              {/* Tax */}
              <div className="flex items-center justify-between text-sm text-ink-muted">
                <span>Tax (11%)</span>
                <span>{formatPrice(calculatePrices().tax)}</span>
              </div>

              {/* Divider */}
              <div className="border-t border-hairline pt-2 mt-2">
                <div className="flex items-center justify-between font-medium">
                  <span className="text-ink">Total Amount:</span>
                  <span className="text-ink">
                    {formatPrice(calculatePrices().total)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Important Information Card */}
          <div className="bg-amber-50 rounded-panel border border-amber-200 p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-1" />
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-ink">Informasi Penting</h3>
                  <p className="mt-2 text-sm text-ink-muted">
                    Sebelum melanjutkan pemesanan, pastikan kamu telah mempersiapkan:
                  </p>
                </div>

                <div className="grid gap-3">
                  {[
                    {
                      icon: <Package className="h-4 w-4" />,
                      title: 'Pengiriman Produk',
                      description: 'Produk harus sudah dikirim ke alamat streamer sebelum jadwal live'
                    },
                    {
                      icon: <FileText className="h-4 w-4" />,
                      title: 'Guidelines Produk',
                      description: 'Product guidelines sudah diupdate dan dikomunikasikan'
                    },
                    {
                      icon: <Clock className="h-4 w-4" />,
                      title: 'Estimasi Waktu',
                      description: 'H+1 untuk kota yang sama, H+3 untuk beda kota'
                    }
                  ].map((item, index) => (
                    <div key={index} className="flex items-start gap-3 bg-surface rounded-lg p-3 border border-amber-100">
                      <div className="p-2 bg-amber-100 rounded-full">
                        {item.icon}
                      </div>
                      <div>
                        <h4 className="font-medium text-ink">{item.title}</h4>
                        <p className="mt-0.5 text-sm text-ink-muted">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Platform Account Details */}
          {bookingDetails?.platform.toLowerCase() === 'shopee' ? (
            <div className="bg-surface rounded-panel border border-hairline-input p-4 sm:p-6">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-ink">Sub Account Details</h3>
                  <p className="mt-1 text-sm text-ink-muted">
                    Informasi ini diperlukan untuk akses ke platform Shopee
                  </p>
                </div>
                <Badge className="bg-surface-tint text-ink-muted border border-hairline">
                  Shopee
                </Badge>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Sub Account ID</Label>
                  <Input 
                    placeholder="Masukkan link sub account Shopee" 
                    className="mt-1.5"
                    value={subAccountLink}
                    onChange={(e) => setSubAccountLink(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Sub Account Password</Label>
                  <Input 
                    type="password"
                    placeholder="Masukkan password sub account" 
                    className="mt-1.5"
                    value={subAccountPassword}
                    onChange={(e) => setSubAccountPassword(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 mt-2 text-sm text-ink-muted">
                  <Info className="h-4 w-4" />
                  <a 
                    href="https://seller.shopee.co.id/edu/article/6941"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Pelajari cara membuat sub account
                  </a>
                </div>
              </div>
            </div>
          ) : bookingDetails?.platform.toLowerCase() === 'tiktok' ? (
            <div className="bg-surface rounded-panel border border-hairline-input p-4 sm:p-6">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-ink">TikTok Shop Account</h3>
                  <p className="mt-1 text-sm text-ink-muted">
                    Informasi ini diperlukan untuk akses ke TikTok Shop
                  </p>
                </div>
                <Badge className="bg-surface-tint text-ink-muted border border-hairline">
                  TikTok
                </Badge>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Phone Number / Email</Label>
                  <Input 
                    placeholder="Masukkan nomor telepon atau email" 
                    className="mt-1.5"
                    value={subAccountLink}
                    onChange={(e) => setSubAccountLink(e.target.value)}
                  />
                </div>
                <div className="p-3 bg-blue-50 rounded-lg text-sm text-ink-muted">
                  <p>Mohon berkoordinasi dengan streamer untuk proses verifikasi OTP</p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Special Request Section */}
          <div className="bg-surface rounded-panel border border-hairline-input p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-ink mb-4">Permintaan Khusus</h3>
            <Textarea
              placeholder="Ada permintaan khusus untuk streamer? (Opsional)"
              value={specialRequest}
              onChange={(e) => setSpecialRequest(e.target.value)}
              className="min-h-[120px]"
            />
          </div>
        </div>

        {/* Right Container - Payment Summary */}
        <div className="w-full lg:w-[380px]">
          <div className="bg-surface rounded-panel border border-hairline-input p-4 sm:p-6 sticky top-4">
            <h3 className="text-lg font-semibold text-ink mb-6">Ringkasan Pembayaran</h3>
            
            {/* Price Breakdown */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-ink-muted">
                  {`${formatPrice(getAdjustedPrice(bookingDetails?.price || 0))} × ${
                    calculateTotalHours(bookingDetails?.bookings || [])
                  } jam`}
                </span>
                <span className="font-medium">{formatPrice(calculatePrices().subtotal)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-ink-muted">Pajak (11%)</span>
                <span className="font-medium">{formatPrice(calculatePrices().tax)}</span>
              </div>

              {/* Voucher Section */}
              <div className="pt-3 mt-3 border-t border-hairline">
                {!appliedVoucher ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Kode voucher"
                      value={voucherCode}
                      onChange={(e) => {
                        setVoucherCode(e.target.value.toUpperCase());
                        setVoucherError(null);
                      }}
                      maxLength={6}
                      className="flex-1"
                    />
                    <Button 
                      variant="outline"
                      onClick={handleValidateVoucher}
                      disabled={isValidatingVoucher || !voucherCode.trim()}
                      className="min-w-[100px]"
                    >
                      {isValidatingVoucher ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Gunakan'
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="flex justify-between items-center p-2 bg-green-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-green-700 font-medium">{appliedVoucher.code}</span>
                      <span className="text-green-600">
                        (-Rp {appliedVoucher.discountAmount.toLocaleString()})
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveVoucher}
                      className="h-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                {voucherError && (
                  <p className="text-sm text-red-500 mt-2">{voucherError}</p>
                )}
              </div>

              {/* Total */}
              <div className="pt-3 mt-3 border-t border-hairline">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-ink">Total Pembayaran</span>
                  <span className="text-xl font-bold text-ink">
                    {formatPrice(finalPrice)}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Button */}
            <Button 
              onClick={handleConfirmBooking} 
              disabled={isLoading}
              className="w-full mt-6 h-12 text-base font-medium bg-[#0066FF] hover:bg-blue-700 text-white"
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Memproses...</span>
                </div>
              ) : (
                <span>Lanjutkan Pembayaran</span>
              )}
            </Button>

            {/* Cancellation Policy */}
            <div className="mt-4 text-xs text-ink-soft">
              <p>
                Pembatalan gratis hingga 24 jam sebelum jadwal. Setelah itu, biaya 50% akan dikenakan.
              </p>
            </div>
          </div>
        </div>
      </div>

      {paymentToken && (
        <PaymentModal
          token={paymentToken}
          onSuccess={handlePaymentSuccess}
          onPending={handlePaymentPending}
          onError={handlePaymentError}
          onClose={handlePaymentClose}
        />
      )}
    </div>
  );
}

// Add CSS animation for progress
const progressAnimation = `
@keyframes progress {
  0% { width: 5%; }
  100% { width: 100%; }
}

.animate-progress {
  animation: progress 5s ease-in-out;
}
`;

// Add the animation to the document if it doesn't exist
if (typeof document !== 'undefined') {
  if (!document.getElementById('progress-animation')) {
    const style = document.createElement('style');
    style.id = 'progress-animation';
    style.innerHTML = progressAnimation;
    document.head.appendChild(style);
  }
}