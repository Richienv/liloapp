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
import toast from 'react-hot-toast';
import { MapPin, Star, Shield, Clock, Calendar, Monitor, DollarSign, AlertTriangle, Phone, ChevronLeft, Info, Package, FileText } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { PaymentModal } from '@/components/payment-modal';
import { Navbar } from "@/components/ui/navbar";
import Image from 'next/image';
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";
import { voucherService } from "@/services/voucher/voucher-service";

interface BookingDetails {
  streamerId: string;
  streamerName: string;
  date: string;
  startTime: string;
  endTime: string;
  platform: string;
  price: number;
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
  startTime: string;
  endTime: string;
  platform: string;
  specialRequest: string;
  sub_acc_link: string;
  sub_acc_pass: string;
  firstName: string;
  lastName: string;
  price: number;
  voucher: {
    id: string;
    code: string;
    discountAmount: number;
  } | null;
  finalPrice: number;
}

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

  useEffect(() => {
    if (searchParams) {
      const details: BookingDetails = {
        streamerId: searchParams.get('streamerId') || '',
        streamerName: searchParams.get('streamerName') || '',
        date: searchParams.get('date') || '',
        startTime: searchParams.get('startTime') || '',
        endTime: searchParams.get('endTime') || '',
        platform: searchParams.get('platform') || '',
        price: Number(searchParams.get('price')) || 0,
        location: decodeURIComponent(searchParams.get('location') || ''),
        rating: Number(searchParams.get('rating')) || 0,
        image_url: searchParams.get('image_url') || '/placeholder-avatar.png',
      };
      setBookingDetails(details);
      
      // Initialize selectedHours based on startTime and endTime
      if (details.startTime && details.endTime) {
        const start = parseInt(details.startTime.split(':')[0]);
        const end = parseInt(details.endTime.split(':')[0]);
        setSelectedHours(
          Array.from({ length: end - start }, (_, i) => 
            `${(start + i).toString().padStart(2, '0')}:00`
          )
        );
      }

      fetchBookings();
      fetchActiveSchedule();
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
    const start = parseInt(bookingDetails.startTime.split(':')[0]);
    const end = parseInt(bookingDetails.endTime.split(':')[0]);
    const options = Array.from({ length: end - start }, (_, i) => `${(start + i).toString().padStart(2, '0')}:00`);
    
    // Filter out hours that are not available
    return options.filter(hour => isSlotAvailable(new Date(bookingDetails.date), parseInt(hour)));
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
          ).filter(h => isSlotAvailable(new Date(bookingDetails!.date), parseInt(h)));
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

      // Create payment metadata including voucher info
      const metadata = {
        streamerId: bookingDetails.streamerId,
        userId: user.id,
        startTime: `${bookingDetails.date}T${selectedHours[0]}`,
        endTime: addHours(parseISO(`${bookingDetails.date}T${selectedHours[selectedHours.length - 1]}`), 1).toISOString(),
        platform: bookingDetails.platform,
        specialRequest: specialRequest,
        sub_acc_link: subAccountLink,
        sub_acc_pass: subAccountPassword,
        firstName: user.user_metadata.first_name,
        lastName: user.user_metadata.last_name,
        price: total,
        // Add voucher information
        voucher: appliedVoucher ? {
          id: appliedVoucher.id,
          code: appliedVoucher.code,
          discountAmount: appliedVoucher.discountAmount
        } : null,
        finalPrice: finalPrice
      };

      // Generate Midtrans token
      const paymentResponse = await fetch('/api/payments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: finalPrice, // Use finalPrice instead of total
          clientName: `${user.user_metadata.first_name} ${user.user_metadata.last_name}`,
          clientEmail: user.email,
          description: `Booking with ${bookingDetails.streamerName} for ${format(parseISO(`${bookingDetails.date}T${selectedHours[0]}`), 'PPP')} at ${selectedHours[0]} - ${format(addHours(parseISO(`${bookingDetails.date}T${selectedHours[selectedHours.length - 1]}`), 1), 'HH:mm')}`,
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
      console.log('Result from Midtrans:', result);
      console.log('Payment metadata:', paymentMetadata);

      if (!paymentMetadata || !bookingDetails) {
        console.error('Missing required data:', { paymentMetadata, bookingDetails });
        throw new Error('Missing payment metadata or booking details');
      }

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

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Payment callback failed:', errorData);
        throw new Error(errorData.error || 'Failed to process payment');
      }

      const bookingData = await response.json();
      console.log('Booking created:', bookingData);

      toast.success('Payment successful! Booking created.');
      
      // Add delay before redirect
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Use window.location.href for more reliable redirect
      window.location.href = '/client-bookings';

    } catch (error) {
      console.error('=== Payment Success Error ===');
      console.error('Error details:', error);
      toast.error('Error occurred. Check console for details.');
      
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

  // Calculate prices with null checks
  const priceWithPlatformFee = (bookingDetails?.price || 0) * 1.3;
  const subtotal = priceWithPlatformFee * (selectedHours.length || 0);
  const tax = subtotal * 0.11;
  const total = Math.round(subtotal + tax);
  const finalPrice = appliedVoucher 
    ? Math.max(0, total - appliedVoucher.discountAmount)
    : total;

  if (!bookingDetails) {
    return <div className="container mx-auto p-4">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-3 sm:p-4 max-w-6xl font-sans text-xs sm:text-sm mt-4 sm:mt-8">
      <div className="flex items-center gap-3 sm:gap-6 mb-4 sm:mb-8">
        <ChevronLeft 
          className="h-5 w-5 sm:h-6 sm:w-6 text-red-500 cursor-pointer hover:text-red-600 transition-colors"
          onClick={() => router.push('/protected')}
        />
        <h1 className="text-lg sm:text-2xl">Detail Pemesanan</h1>
      </div>

      <div className="flex flex-col md:flex-row gap-4 sm:gap-6">
        {/* Left Container */}
        <div className="flex-1 space-y-4 sm:space-y-6">
          {/* Warning Section - At top */}
          <div className="border border-gray-200 rounded-lg p-3 sm:p-6 bg-gray-50">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-1" />
              <div className="space-y-4 flex-1">
                <div>
                  <h2 className="text-base font-medium text-gray-900">Kebijakan Pembatalan</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Pembatalan gratis hingga 24 jam sebelum pemesanan. Setelah itu, biaya 50% akan dikenakan.
                    <span className="block mt-1 text-amber-600">
                      *Pengembalian dana butuh 7-14 hari kerja, jadi pastikan semua data sudah benar
                    </span>
                  </p>
                </div>

                <div className="space-y-3">
                  <h3 className="text-base font-medium text-gray-900">Checklist Sebelum Booking</h3>
                  <div className="space-y-2.5">
                    {[
                      {
                        title: 'Pengiriman Produk',
                        description: 'Pastikan produk sudah dikirim ke alamat streamer sebelum jadwal live',
                        icon: <Package className="h-4 w-4" />
                      },
                      {
                        title: 'Guidelines Produk',
                        description: 'Product guidelines sudah diupdate dan dikomunikasikan',
                        icon: <FileText className="h-4 w-4" />
                      },
                      {
                        title: 'Estimasi Waktu',
                        description: 'Perhitungkan waktu pengiriman: H+1 untuk kota yang sama, H+3 untuk beda kota',
                        icon: <Clock className="h-4 w-4" />
                      }
                    ].map((item, index) => (
                      <div key={index} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-100">
                        <div className="p-2 bg-blue-50 rounded-full">
                          {item.icon}
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-900">{item.title}</h4>
                          <p className="text-xs text-gray-600 mt-0.5">{item.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Booking Information - Second */}
          <div className="border border-gray-200 rounded-lg p-3 sm:p-6">
            <h2 className="text-base sm:text-xl mb-4 sm:mb-6">Informasi Pemesanan</h2>
            <div className="space-y-3 sm:space-y-5">
              <div className="flex items-center gap-2 sm:gap-3">
                <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                <span className="text-sm sm:text-base">
                  {format(new Date(bookingDetails?.date || ''), 'MMMM d, yyyy')}
                </span>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                <span className="text-sm sm:text-base">
                  {selectedHours.length > 0 && (
                    `${selectedHours[0]} - ${format(addHours(parseISO(`${bookingDetails?.date}T${selectedHours[selectedHours.length - 1]}`), 1), 'HH:mm')} (${differenceInHours(
                      addHours(parseISO(`${bookingDetails?.date}T${selectedHours[selectedHours.length - 1]}`), 1),
                      parseISO(`${bookingDetails?.date}T${selectedHours[0]}`)
                    )} jam)`
                  )}
                </span>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <Monitor className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                <span className="text-sm sm:text-base">{bookingDetails?.platform}</span>
              </div>
            </div>
          </div>

          {/* Platform Specific Forms - Third */}
          {bookingDetails?.platform.toLowerCase() === 'shopee' ? (
            <div className="border border-gray-200 rounded-lg p-3 sm:p-6">
              <div className="mb-4">
                <h2 className="text-base sm:text-xl flex items-center gap-2 mb-2">
                  Sub Account Details
                  <Badge className={`bg-gradient-to-r from-orange-500 to-orange-600 text-white border-0 text-[10px] sm:text-xs`}>
                    Shopee
                  </Badge>
                </h2>
                <a 
                  href="https://seller.shopee.co.id/edu/article/6941/Tentang-dan-Akses-Yang-dimiliki-Sub-Akun"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors bg-gray-50 px-2 py-1 rounded-full"
                >
                  <Info className="h-3 w-3" />
                  apa itu sub-account?
                </a>
              </div>
              <div className="space-y-3">
                <div>
                  <Label>Sub Account ID</Label>
                  <Input 
                    placeholder="Masukkan link sub account Shopee" 
                    className="mt-1 text-xs sm:text-sm"
                    value={subAccountLink}
                    onChange={(e) => setSubAccountLink(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Sub Account Password</Label>
                  <Input 
                    type="password"
                    placeholder="Masukkan password sub account" 
                    className="mt-1 text-xs sm:text-sm"
                    value={subAccountPassword}
                    onChange={(e) => setSubAccountPassword(e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : bookingDetails?.platform.toLowerCase() === 'tiktok' ? (
            <div className="border border-gray-200 rounded-lg p-3 sm:p-6">
              <h2 className="text-base sm:text-xl mb-2 flex items-center gap-2">
                Login Account (Email/Username/Phone Number)
                <Badge className={`bg-gradient-to-r from-[#1e40af] to-[#6b21a8] text-white border-0 text-[10px] sm:text-xs`}>
                  TikTok
                </Badge>
              </h2>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                <Input 
                  type="tel"
                  placeholder="Masukkan nomor telepon Anda" 
                  className="mt-1 text-xs sm:text-sm"
                  value={subAccountLink}
                  onChange={(e) => setSubAccountLink(e.target.value)}
                />
              </div>
              <p className="mt-2 sm:mt-3 text-xs sm:text-sm text-gray-600 border border-blue-100 p-2 sm:p-3 rounded-lg">
                Mohon berkoordinasi dengan streamer dan siap menerima OTP yang akan dibagikan ke streamer dalam waktu 1-5 menit
              </p>
            </div>
          ) : null}

          {/* Special Request - Moved to last */}
          <div className="border border-gray-200 rounded-lg p-3 sm:p-6">
            <h2 className="text-base sm:text-xl mb-3 sm:mb-4">Permintaan Khusus</h2>
            <Textarea
              id="special-request"
              placeholder="Ada permintaan khusus untuk streamer?"
              value={specialRequest}
              onChange={(e) => setSpecialRequest(e.target.value)}
              className="mt-1 text-xs sm:text-sm"
            />
          </div>
        </div>

        {/* Right Container */}
        <div className="w-full md:w-1/3">
          <div className="rounded-xl border border-gray-200 p-4 sm:p-6 sticky top-4 bg-white">
            {/* Streamer Info Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-gray-100 overflow-hidden">
                    <Image
                      src={bookingDetails?.image_url || '/placeholder-avatar.png'}
                      alt={bookingDetails?.streamerName || ''}
                      width={40}
                      height={40}
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <h2 className="text-base font-medium">{bookingDetails?.streamerName}</h2>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <MapPin className="h-3 w-3" />
                      <span>{bookingDetails?.location}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center bg-yellow-50 px-2 py-1 rounded-lg">
                  <Star className="w-4 h-4 text-yellow-400 fill-current" />
                  <span className="ml-1 text-sm font-medium">{bookingDetails?.rating.toFixed(1)}</span>
                </div>
              </div>

              {/* Booking Details */}
              <div className="space-y-3 py-4 border-y border-gray-100">
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span>{format(new Date(bookingDetails?.date || ''), 'MMMM d, yyyy')}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span>
                    {selectedHours.length > 0 && (
                      `${selectedHours[0]} - ${format(addHours(parseISO(`${bookingDetails?.date}T${selectedHours[selectedHours.length - 1]}`), 1), 'HH:mm')} (${differenceInHours(
                        addHours(parseISO(`${bookingDetails?.date}T${selectedHours[selectedHours.length - 1]}`), 1),
                        parseISO(`${bookingDetails?.date}T${selectedHours[0]}`)
                      )} jam)`
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Monitor className="h-4 w-4 text-gray-400" />
                  <span>{bookingDetails?.platform}</span>
                </div>
              </div>

              {/* Price Breakdown */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    {`Rp ${priceWithPlatformFee.toLocaleString()} × ${selectedHours.length} jam`}
                  </span>
                  <span className="font-medium">{`Rp ${subtotal.toLocaleString()}`}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Pajak (11%)</span>
                  <span className="font-medium">{`Rp ${tax.toLocaleString()}`}</span>
                </div>
                {appliedVoucher && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Voucher {appliedVoucher.code}</span>
                    <span>-Rp {appliedVoucher.discountAmount.toLocaleString()}</span>
                  </div>
                )}
                <div className="pt-2 mt-2 border-t border-gray-100">
                  <div className="flex justify-between">
                    <span className="font-medium">Total</span>
                    <span className="font-medium text-lg">{`Rp ${finalPrice.toLocaleString()}`}</span>
                  </div>
                </div>
              </div>

              {/* Voucher Section */}
              <div className="space-y-3 border-t border-gray-100 pt-4 mt-4">
                {!appliedVoucher ? (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Input
                          placeholder="Masukkan kode voucher"
                          value={voucherCode}
                          onChange={(e) => {
                            setVoucherCode(e.target.value.toUpperCase());
                            setVoucherError(null);
                          }}
                          maxLength={6}
                          className="text-sm uppercase"
                        />
                      </div>
                      <Button 
                        variant="outline"
                        onClick={handleValidateVoucher}
                        disabled={isValidatingVoucher || !voucherCode.trim()}
                        className="whitespace-nowrap text-sm min-w-[100px]"
                      >
                        {isValidatingVoucher ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Pakai Voucher'
                        )}
                      </Button>
                    </div>
                    {voucherError && (
                      <p className="text-xs text-red-500">{voucherError}</p>
                    )}
                  </>
                ) : (
                  <div className="flex justify-between items-center p-2 bg-green-50 rounded-lg text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-green-700">{appliedVoucher.code}</span>
                      <span className="text-green-600">
                        (-Rp {appliedVoucher.discountAmount.toLocaleString('id-ID')})
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
              </div>

              {/* Confirm Button */}
              <Button 
                onClick={handleConfirmBooking} 
                disabled={isLoading}
                className={`w-full py-6 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isLoading 
                    ? 'bg-gray-100 text-gray-400'
                    : 'bg-gradient-to-r from-[#1e40af] to-[#6b21a8] hover:from-[#1e3a8a] hover:to-[#581c87] text-white'
                }`}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Memproses...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <Shield className="h-4 w-4" />
                    <span>Konfirmasi Booking</span>
                  </div>
                )}
              </Button>
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