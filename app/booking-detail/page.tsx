"use client";

import { Suspense, useState, useEffect } from 'react';
import { Loader2, X } from 'lucide-react';
import { subtotalWithPlatformFee } from '@/lib/pricing';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { PaymentModal } from '@/components/payment-modal';
import Image from 'next/image';
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

// Add a new type for processing steps
type ProcessingStep = 'creating' | 'completed' | 'redirecting';

export default function BookingDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-canvas">
          <Loader2 className="h-5 w-5 animate-spin text-ink-ghost" />
        </div>
      }
    >
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

/**
 * The section shell used three times on this screen.
 *
 * A mono index, a Playfair title, and one optional line of sub-copy sitting on
 * the same baseline — the same heading the host dashboard uses, so a brand and
 * a host are reading one product rather than two. The card is a hairline and a
 * radius; there is no shadow anywhere on this page.
 */
function Panel({
  index,
  title,
  description,
  children,
}: {
  index?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-panel border border-hairline bg-surface">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline-soft px-5 py-4">
        {index && (
          <span className="numeric text-mini font-semibold tracking-normal text-ink-ghost">
            {index}
          </span>
        )}
        <h2 className="font-serif text-title font-semibold text-ink">{title}</h2>
        {description && (
          <p className="w-full text-meta text-ink-soft sm:w-auto sm:flex-1">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * One of the three things a host needs before they can go live.
 *
 * Numbered, because "tanpa tiga hal ini" is a promise the layout has to keep —
 * a brand should be able to count them without reading. The number is the only
 * ornament; the field below it does the work.
 */
function Requirement({
  index,
  label,
  children,
}: {
  index: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-5 py-5">
      <div className="flex items-baseline gap-2.5">
        <span className="numeric text-mini font-semibold tracking-normal text-ink-ghost">
          {index}
        </span>
        <p className="min-w-0 flex-1 text-copy font-medium text-ink">{label}</p>
      </div>
      <div className="mt-3 pl-[26px]">{children}</div>
    </div>
  );
}

/*
  Native <input>/<textarea> rather than the shadcn primitives.

  Those primitives are still on the pre-redesign scale (`border-input`,
  `rounded-md`, `text-sm`) and they compose their className through
  tailwind-merge, which classifies `text-copy` as a text COLOUR — so a field
  styled `text-copy text-ink` silently loses its size, and `rounded-field`
  double-declares against `rounded-md`. The design's field is a hairline and a
  focus edge; that is small enough to state outright and be sure of.
*/
const fieldClass =
  "h-11 w-full rounded-field border border-hairline-input bg-surface px-3.5 text-copy text-ink outline-none transition-colors placeholder:text-ink-ghost focus:border-hairline-strong";

function BookingDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bookingDetails, setBookingDetails] = useState<BookingDetails | null>(null);
  const [specialRequest, setSpecialRequest] = useState<string>('');
  const [subAccountLink, setSubAccountLink] = useState('');
  const [subAccountPassword, setSubAccountPassword] = useState('');
  const [paymentToken, setPaymentToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMetadata, setPaymentMetadata] = useState<PaymentMetadata | null>(null);
  const [voucherCode, setVoucherCode] = useState('');
  const [isValidatingVoucher, setIsValidatingVoucher] = useState(false);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [appliedVoucher, setAppliedVoucher] = useState<AppliedVoucher | null>(null);
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

  if (!bookingDetails) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 className="h-5 w-5 animate-spin text-ink-ghost" />
      </div>
    );
  }

  const platform = bookingDetails.platform || '';
  const platformKey = platform.toLowerCase();
  const totalHours = calculateTotalHours(bookingDetails.bookings);
  const hourlyPrice = getAdjustedPrice(bookingDetails.price);

  return (
    <div className="min-h-screen bg-canvas">
      {/* Payment Processing Overlay */}
      {isProcessingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/95 px-5">
          <div className="w-full max-w-[420px] rounded-panel border border-hairline bg-surface px-8 py-10 text-center">
            {processingStep === 'creating' && (
              <Loader2 className="mx-auto mb-5 h-6 w-6 animate-spin text-ink-ghost" />
            )}

            <h2 className="font-serif text-title font-semibold text-ink">
              {processingStep === 'creating' ? 'Memproses pembayaran' : 'Pembayaran diterima'}
            </h2>

            <p className="mt-2 text-meta text-ink-soft">
              {processingStep === 'creating' ? (
                'Jangan tutup halaman ini.'
              ) : (
                <>
                  Membuka Booking saya dalam{' '}
                  <span className="numeric">{Math.max(redirectCountdown, 0)}</span> detik.
                </>
              )}
            </p>

            {processingStep === 'redirecting' && (
              <div className="mt-6 h-px w-full overflow-hidden bg-hairline">
                <div
                  className="h-px bg-ink-ghost transition-all duration-300"
                  style={{ width: `${((3 - redirectCountdown) / 3) * 100}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-[1180px] px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
        {/* Header */}
        <header>
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-meta text-ink-soft transition-colors hover:text-ink"
          >
            <span aria-hidden="true">←</span>
            Ubah jadwal
          </button>
          <h1 className="mt-5 font-serif text-display font-semibold text-ink">
            Detail pemesanan
          </h1>
          <p className="mt-2 max-w-[46ch] text-lede text-ink-muted">
            Periksa sekali lagi, lalu selesaikan pembayaran.
          </p>
        </header>

        <div className="mt-9 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">
          {/* Left column */}
          <div className="min-w-0 space-y-6">
            {/*
              The host, stated once. This is context for the numbers below, not
              a profile card — no rating badge on a yellow chip, no icon per
              field. The brand already chose this host; the job here is to let
              them confirm they are looking at the right one.
            */}
            <section className="rounded-panel border border-hairline bg-surface px-5 py-5">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-panel bg-surface-tint">
                  <Image
                    src={bookingDetails.image_url || '/placeholder-avatar.png'}
                    alt={bookingDetails.streamerName}
                    width={112}
                    height={112}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-micro tracking-normal text-ink-faint">Host</p>
                  <p className="mt-0.5 truncate text-lede font-semibold text-ink">
                    {bookingDetails.streamerName}
                  </p>
                  {bookingDetails.location && (
                    <p className="mt-0.5 truncate text-meta text-ink-soft">
                      {bookingDetails.location}
                      {bookingDetails.rating > 0 && (
                        <span className="numeric"> · {bookingDetails.rating.toFixed(1)}</span>
                      )}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-x-10 gap-y-3 border-t border-hairline-soft pt-4">
                <div>
                  <p className="text-micro tracking-normal text-ink-faint">Platform</p>
                  <p className="mt-0.5 text-copy font-medium capitalize text-ink">
                    {platform || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-micro tracking-normal text-ink-faint">Durasi</p>
                  <p className="numeric mt-0.5 text-copy font-medium text-ink">{totalHours} jam</p>
                </div>
                <div>
                  <p className="text-micro tracking-normal text-ink-faint">Tarif</p>
                  <p className="numeric mt-0.5 text-copy font-medium text-ink">
                    {formatPrice(hourlyPrice)} / jam
                  </p>
                </div>
              </div>
            </section>

            {/* 01 — Sesi yang dipesan */}
            <Panel index="01" title="Sesi yang dipesan">
              <div className="divide-y divide-hairline-soft">
                {bookingDetails.bookings.map((booking, index) => (
                  <div key={index} className="px-5 py-4">
                    <p className="text-copy font-medium text-ink">
                      {format(new Date(booking.date), 'EEEE, d MMMM yyyy', { locale: idLocale })}
                    </p>

                    <div className="mt-2.5 space-y-1.5">
                      {booking.timeRanges?.map((range, rangeIndex) => {
                        const hours = calculateHoursBetween(range.start, range.end);
                        return (
                          /*
                            Three columns that never wrap: the time keeps the
                            slack, the duration and the price are shrink-0. A
                            reflowed row here reads as a second session.
                          */
                          <div key={rangeIndex} className="flex items-baseline gap-4">
                            <span className="numeric min-w-0 flex-1 truncate text-meta text-ink-muted">
                              {range.start}–{range.end}
                            </span>
                            <span className="numeric shrink-0 text-meta text-ink-soft">
                              {hours} jam
                            </span>
                            <span className="numeric shrink-0 text-meta font-medium text-ink">
                              {formatPrice(hourlyPrice * hours)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-baseline gap-4 border-t border-hairline-soft bg-surface-raised px-5 py-3.5">
                <span className="min-w-0 flex-1 truncate text-meta text-ink-soft">Durasi</span>
                <span className="numeric shrink-0 text-meta font-medium text-ink">
                  {totalHours} jam
                </span>
              </div>
            </Panel>

            {/* 02 — Yang perlu kamu siapkan */}
            <Panel
              index="02"
              title="Yang perlu kamu siapkan"
              description="Host tidak bisa mulai live tanpa tiga hal ini."
            >
              <div className="divide-y divide-hairline-soft">
                {platformKey === 'tiktok' ? (
                  <Requirement index="01" label="Nomor telepon atau email">
                    <input
                      placeholder="Masukkan nomor telepon atau email"
                      className={fieldClass}
                      value={subAccountLink}
                      onChange={(e) => setSubAccountLink(e.target.value)}
                    />
                    <p className="mt-2.5 text-meta text-ink-soft">
                      Mohon berkoordinasi dengan streamer untuk proses verifikasi OTP
                    </p>
                  </Requirement>
                ) : (
                  <Requirement index="01" label="Tautan sub akun">
                    <input
                      placeholder="Masukkan link sub account Shopee"
                      className={fieldClass}
                      value={subAccountLink}
                      onChange={(e) => setSubAccountLink(e.target.value)}
                    />
                    <a
                      href="https://seller.shopee.co.id/edu/article/6941"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2.5 inline-block text-meta text-ink-soft underline decoration-hairline-input underline-offset-4 transition-colors hover:text-ink"
                    >
                      Pelajari cara membuat sub account
                    </a>
                  </Requirement>
                )}

                {platformKey !== 'tiktok' && (
                  <Requirement index="02" label="Kata sandi">
                    <input
                      type="password"
                      placeholder="Masukkan password sub account"
                      className={fieldClass}
                      value={subAccountPassword}
                      onChange={(e) => setSubAccountPassword(e.target.value)}
                    />
                  </Requirement>
                )}

                <Requirement index={platformKey === 'tiktok' ? '02' : '03'} label="Permintaan khusus">
                  <textarea
                    placeholder="Ada permintaan khusus untuk streamer? (Opsional)"
                    value={specialRequest}
                    onChange={(e) => setSpecialRequest(e.target.value)}
                    rows={4}
                    className={`${fieldClass} h-auto min-h-[104px] resize-y py-2.5`}
                  />
                </Requirement>
              </div>
            </Panel>
          </div>

          {/*
            The rail. This is the only place on the screen allowed to be blue —
            "Bayar sekarang" is the one action here, and the voucher's "Pakai"
            deliberately stays quiet so the two never compete.
          */}
          <div className="min-w-0 lg:sticky lg:top-8">
            <Panel title="Ringkasan pembayaran">
              <div className="px-5 py-5">
                <div className="space-y-2.5">
                  <div className="flex items-baseline gap-4">
                    <span className="numeric min-w-0 flex-1 truncate text-meta text-ink-soft">
                      {formatPrice(hourlyPrice)} × {totalHours} jam
                    </span>
                    <span className="numeric shrink-0 text-meta font-medium text-ink">
                      {formatPrice(subtotal)}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-4">
                    <span className="min-w-0 flex-1 truncate text-meta text-ink-soft">
                      Pajak 11%
                    </span>
                    <span className="numeric shrink-0 text-meta font-medium text-ink">
                      {formatPrice(tax)}
                    </span>
                  </div>
                </div>

                {/* Voucher */}
                <div className="mt-5 border-t border-hairline-soft pt-5">
                  <p className="text-micro tracking-normal text-ink-faint">Voucher</p>

                  {!appliedVoucher ? (
                    <div className="mt-2 flex gap-2">
                      <input
                        placeholder="Kode voucher"
                        value={voucherCode}
                        onChange={(e) => {
                          setVoucherCode(e.target.value.toUpperCase());
                          setVoucherError(null);
                        }}
                        maxLength={6}
                        className={`${fieldClass} numeric min-w-0 flex-1 font-mono uppercase tracking-[.08em]`}
                      />
                      <Button
                        variant="quiet"
                        onClick={handleValidateVoucher}
                        disabled={isValidatingVoucher || !voucherCode.trim()}
                        className="h-11 w-[84px] shrink-0"
                      >
                        {isValidatingVoucher ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Pakai'
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center gap-3 rounded-field border border-positive-line bg-positive-tint px-3 py-2.5">
                      <span className="numeric min-w-0 flex-1 truncate font-mono text-meta font-medium tracking-[.06em] text-positive">
                        {appliedVoucher.code}
                      </span>
                      <span className="numeric shrink-0 text-meta font-medium text-positive">
                        −{formatPrice(appliedVoucher.discountAmount)}
                      </span>
                      <button
                        type="button"
                        onClick={handleRemoveVoucher}
                        aria-label="Hapus voucher"
                        className="shrink-0 text-positive/70 transition-colors hover:text-positive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {voucherError && (
                    <p className="mt-2 text-meta text-destructive-emphasis">{voucherError}</p>
                  )}
                </div>

                {/* Total */}
                <div className="mt-5 flex items-baseline gap-4 border-t border-hairline pt-5">
                  <span className="min-w-0 flex-1 truncate text-copy font-medium text-ink">
                    Total pembayaran
                  </span>
                  <span className="numeric shrink-0 text-price font-semibold text-ink">
                    {formatPrice(finalPrice)}
                  </span>
                </div>

                <Button
                  variant="brand"
                  size="action-full"
                  onClick={handleConfirmBooking}
                  disabled={isLoading}
                  className="mt-5"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Bayar sekarang'}
                </Button>

                <p className="mt-3.5 text-mini text-ink-soft">
                  Pembatalan gratis hingga 24 jam sebelum jadwal. Setelah itu dikenakan biaya 50%.
                </p>
              </div>
            </Panel>
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
