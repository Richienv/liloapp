"use client";

import { Suspense } from 'react';
import { Loader2, X } from 'lucide-react';
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

const platformStyles = {
  shopee: 'bg-gradient-to-r from-orange-500 to-orange-600',
  tiktok: 'bg-gradient-to-r from-[#00f2ea] to-[#ff0050]',
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
  return basePrice * 1.3; // Add 30% to base price
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

      toast.success('Payment successful! Booking created.');
      
      // Add delay before redirect
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Use window.location.href for more reliable redirect
      window.location.href = '/client-bookings';

    } catch (error) {
      console.error('=== Payment Success Error ===');
      console.error('Error details:', error);
      toast.error(error instanceof Error ? error.message : 'Error occurred. Please check console for details.');
      
      // Stay on page to see error
      setIsLoading(false);
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
        return 'Menunggu streamer menerima pesanan Anda. Biasanya membutuhkan waktu 15-60 menit untuk konfirmasi.';
      case 'accepted':
        return 'Pesanan Anda telah diterima oleh streamer. Silakan tunggu link streaming yang akan diberikan saat waktu yang ditentukan.';
      case 'completed':
        return 'Sesi streaming telah selesai. Terima kasih telah menggunakan layanan kami.';
      case 'rejected':
        return 'Maaf, streamer tidak dapat menerima pesanan Anda. Silakan coba waktu lain atau streamer lainnya.';
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

  if (!bookingDetails) {
    return <div className="container mx-auto p-4">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-6xl font-sans text-xs sm:text-sm mt-4 sm:mt-8">
      {/* Header Section */}
      <div className="flex items-center gap-3 sm:gap-6 mb-6 sm:mb-8">
        <button 
          onClick={() => router.push('/protected')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
        >
          <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
          <span className="text-sm sm:text-base">Kembali</span>
        </button>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Detail Pemesanan</h1>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 sm:gap-8">
        {/* Left Container */}
        <div className="flex-1 space-y-6 sm:space-y-8">
          {/* Streamer Info Card with increased padding */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 shadow-sm">
            <div className="flex items-start gap-6">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0">
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
                    <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                      {bookingDetails?.streamerName}
                    </h2>
                    <div className="flex items-center gap-2 mt-2">
                      <MapPin className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-600">{bookingDetails?.location}</span>
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
                      ? 'bg-gradient-to-r from-orange-500 to-orange-600'
                      : 'bg-gradient-to-r from-[#00f2ea] to-[#ff0050]'
                  } text-white border-0 px-3 py-1`}>
                    {bookingDetails?.platform}
                  </Badge>
                  <div className="flex items-center gap-2 text-gray-600">
                    <Calendar className="h-4 w-4" />
                    <span>{bookingDetails && formatBookingDates(bookingDetails.bookings)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
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
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Booking Summary</h3>
              <span className="text-xs text-gray-500">*harga belum termasuk pajak</span>
            </div>
            
            {bookingDetails?.bookings.map((booking, index) => (
              <div key={index} className="border-b border-gray-100 pb-4">
                <div className="space-y-3">
                  <div className="text-sm font-medium text-gray-900">
                    {format(new Date(booking.date), 'dd MMMM yyyy')}
                  </div>
                  
                  {booking.timeRanges?.map((range, rangeIndex) => (
                    <div key={rangeIndex} className="bg-blue-50/50 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-600">
                          {`${range.start} - ${range.end} (${calculateHoursBetween(range.start, range.end)} hours)`}
                        </div>
                        <div className="text-sm font-medium text-gray-900">
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
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Subtotal ({calculateTotalHours(bookingDetails?.bookings || [])} hours)</span>
                <span>{formatPrice(calculatePrices().subtotal)}</span>
              </div>

              {/* Tax */}
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Tax (11%)</span>
                <span>{formatPrice(calculatePrices().tax)}</span>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-100 pt-2 mt-2">
                <div className="flex items-center justify-between font-medium">
                  <span className="text-gray-900">Total Amount:</span>
                  <span className="text-gray-900">
                    {formatPrice(calculatePrices().total)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Important Information Card */}
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-1" />
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Informasi Penting</h3>
                  <p className="mt-2 text-sm text-gray-600">
                    Sebelum melanjutkan pemesanan, pastikan Anda telah mempersiapkan:
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
                    <div key={index} className="flex items-start gap-3 bg-white rounded-lg p-3 border border-amber-100">
                      <div className="p-2 bg-amber-100 rounded-full">
                        {item.icon}
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">{item.title}</h4>
                        <p className="mt-0.5 text-sm text-gray-600">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Platform Account Details */}
          {bookingDetails?.platform.toLowerCase() === 'shopee' ? (
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Sub Account Details</h3>
                  <p className="mt-1 text-sm text-gray-600">
                    Informasi ini diperlukan untuk akses ke platform Shopee
                  </p>
                </div>
                <Badge className="bg-gradient-to-r from-orange-500 to-orange-600 text-white border-0">
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
                <div className="flex items-center gap-2 mt-2 text-sm text-gray-600">
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
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">TikTok Shop Account</h3>
                  <p className="mt-1 text-sm text-gray-600">
                    Informasi ini diperlukan untuk akses ke TikTok Shop
                  </p>
                </div>
                <Badge className="bg-gradient-to-r from-[#00f2ea] to-[#ff0050] text-white border-0">
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
                <div className="p-3 bg-blue-50 rounded-lg text-sm text-gray-600">
                  <p>Mohon berkoordinasi dengan streamer untuk proses verifikasi OTP</p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Special Request Section */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Permintaan Khusus</h3>
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
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 sticky top-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Ringkasan Pembayaran</h3>
            
            {/* Price Breakdown */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">
                  {`${formatPrice(getAdjustedPrice(bookingDetails?.price || 0))} × ${
                    calculateTotalHours(bookingDetails?.bookings || [])
                  } jam`}
                </span>
                <span className="font-medium">{formatPrice(calculatePrices().subtotal)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Pajak (11%)</span>
                <span className="font-medium">{formatPrice(calculatePrices().tax)}</span>
              </div>

              {/* Voucher Section */}
              <div className="pt-3 mt-3 border-t border-gray-100">
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
              <div className="pt-3 mt-3 border-t border-gray-100">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-gray-900">Total Pembayaran</span>
                  <span className="text-xl font-bold text-gray-900">
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
            <div className="mt-4 text-xs text-gray-500">
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