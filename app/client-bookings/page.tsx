"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { format, isBefore, isSameDay } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Check, ChevronLeft, Copy, MapPin, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { CardActionBar } from '@/components/ui/card-action-bar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { BookingCalendar } from '@/components/booking-calendar';
import RatingModal from '@/components/rating-modal';

interface Booking {
  id: number;
  client_id?: string;
  streamer_id: number;
  start_time: string;
  end_time: string;
  platform: string;
  status: string;
  created_at: string;
  updated_at?: string;
  price: number;
  special_request: string | null;
  timezone?: string;
  payment_group_id?: string;
  streamer: {
    id: number;
    first_name: string;
    last_name: string;
    platform: string;
    rating?: number;
    image_url: string;
    location: string;
    full_address: string;
  };
  items_received?: boolean;
  items_received_at?: string | null;
  voucher_usage?: Array<{
    final_price: number;
    discount_applied: number;
  }>;
}

interface TimeSlot {
  start: string;
  end: string;
}

interface DaySchedule {
  slots: TimeSlot[];
}

interface Schedule {
  [key: number]: DaySchedule;
}

interface BookingRecord {
  id: number;
  start_time: string;
  end_time: string;
  status: string;
}

/* -------------------------------------------------------------------------
   Reading a booking.

   Everything below derives from `status` and the two timestamps the page
   already loads. No extra query, no extra column.
   ------------------------------------------------------------------------- */

/**
 * Status rendered as words, never as a filled pill.
 *
 * The tone is a text colour on the warm canvas — caution for "the clock is
 * running", positive for "confirmed", ghost for "this is over". None of them
 * is the brand blue: the blue on this screen belongs to the one action a row
 * can ask for, and a status that competes with it is a status pretending to be
 * a button.
 */
const STATUS_TEXT: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Menunggu host', tone: 'text-caution' },
  accepted: { label: 'Diterima host', tone: 'text-positive' },
  live: { label: 'Sedang live', tone: 'text-critical' },
  reschedule_requested: { label: 'Reschedule diajukan', tone: 'text-caution' },
  completed: { label: 'Selesai', tone: 'text-ink-soft' },
  rejected: { label: 'Ditolak host', tone: 'text-ink-ghost' },
  cancelled: { label: 'Dibatalkan', tone: 'text-ink-ghost' },
};

function statusText(status: string) {
  return (
    STATUS_TEXT[status.toLowerCase()] ?? {
      label: status,
      tone: 'text-ink-soft',
    }
  );
}

type Bucket = 'action' | 'waiting' | 'done';

/**
 * Which of the three stacks a booking belongs in.
 *
 * The page's subtitle is a promise — "yang butuh tindakan kamu ada di atas" —
 * so the top stack is defined as exactly the bookings that can offer the brand
 * a button, and nothing else:
 *
 *   - `reschedule_requested` — the brand's own request is open; it can modify
 *     or withdraw it.
 *   - `accepted` — the host is confirmed, which means the product has to be
 *     shipped and the sub-account prepared. That is the brand's move, not the
 *     host's.
 *   - `live` — happening right now; it outranks everything for the same reason
 *     it does on the host dashboard.
 *   - `completed` with no rating yet — the last thing the brand owes the host.
 *
 * `pending` deliberately is NOT action: the ball is with the host and there is
 * nothing to press. Sorting it above a session whose products still need
 * shipping would break the promise the subtitle makes.
 */
function bucketOf(booking: Booking): Bucket {
  switch (booking.status.toLowerCase()) {
    case 'live':
    case 'reschedule_requested':
    case 'accepted':
      return 'action';
    case 'completed':
      return booking.items_received ? 'done' : 'action';
    case 'pending':
      return 'waiting';
    default:
      return 'done';
  }
}

function startTimeOf(booking: Booking) {
  return new Date(booking.start_time).getTime();
}

function hostName(booking: Booking) {
  const first = booking.streamer?.first_name ?? 'Host';
  const last = booking.streamer?.last_name ?? '';
  return `${first} ${last}`.trim();
}

function formatDay(dateString: string) {
  return format(new Date(dateString), 'd MMM yyyy', { locale: idLocale });
}

function formatClock(dateString: string) {
  return format(new Date(dateString), 'HH:mm');
}

function formatRupiah(value: number) {
  return `Rp ${Math.round(value).toLocaleString('id-ID')}`;
}

/* -------------------------------------------------------------------------
   Reschedule — unchanged behaviour, redressed.
   ------------------------------------------------------------------------- */

interface RescheduleTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newStartTime: Date, newEndTime: Date) => void;
  booking: Booking;
}

/** The four bands the hour grid is split into, and the hours each one owns. */
const TIME_BANDS: Array<{ label: string; from: number; to: number }> = [
  { label: 'Pagi', from: 6, to: 12 },
  { label: 'Siang', from: 12, to: 18 },
  { label: 'Malam', from: 18, to: 24 },
  { label: 'Dini hari', from: 0, to: 6 },
];

function RescheduleTimeModal({
  isOpen,
  onClose,
  onConfirm,
  booking,
}: RescheduleTimeModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(booking.start_time));
  const [selectedHours, setSelectedHours] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSchedule, setActiveSchedule] = useState<Schedule | null>(null);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchActiveSchedule = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('streamer_active_schedules')
        .select('schedule')
        .eq('streamer_id', booking.streamer_id);

      if (error) {
        console.error('Error fetching active schedule:', error);
        setActiveSchedule(null);
      } else if (data && data.length > 0) {
        try {
          const schedule =
            typeof data[0].schedule === 'string'
              ? JSON.parse(data[0].schedule)
              : data[0].schedule;
          setActiveSchedule(schedule);
        } catch (e) {
          console.error('Error parsing schedule:', e);
          setActiveSchedule(null);
        }
      } else {
        setActiveSchedule(null);
      }
    };

    const fetchAcceptedBookings = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('streamer_id', booking.streamer_id)
        .in('status', ['accepted', 'pending'])
        .neq('id', booking.id);

      if (error) {
        console.error('Error fetching bookings:', error);
        toast.error('Gagal memuat jadwal host');
      } else {
        setBookings(data || []);
      }
    };

    fetchActiveSchedule();
    fetchAcceptedBookings();
  }, [booking.streamer_id, booking.id, isOpen]);

  const isSlotAvailable = useCallback(
    (date: Date, hour: number): boolean => {
      if (!activeSchedule) return false;
      const dayOfWeek = date.getDay();
      const daySchedule = activeSchedule[dayOfWeek];
      if (!daySchedule || !daySchedule.slots) return false;

      const isInSchedule = daySchedule.slots.some((slot: TimeSlot) => {
        const start = parseInt(slot.start.split(':')[0]);
        const end = parseInt(slot.end.split(':')[0]);
        return hour >= start && hour < end;
      });

      const bookingExists = bookings.some((existing: BookingRecord) => {
        const bookingStart = new Date(existing.start_time);
        const bookingEnd = new Date(existing.end_time);
        return (
          isSameDay(date, bookingStart) &&
          ((hour >= bookingStart.getHours() && hour < bookingEnd.getHours()) ||
            (hour === bookingEnd.getHours() && bookingEnd.getMinutes() > 0))
        );
      });

      return isInSchedule && !bookingExists;
    },
    [activeSchedule, bookings],
  );

  const timeOptions = useMemo((): string[] => {
    if (!selectedDate || !activeSchedule) return [];
    const dayOfWeek = selectedDate.getDay();
    const daySchedule = activeSchedule[dayOfWeek];
    if (!daySchedule || !daySchedule.slots) return [];

    const options = daySchedule.slots.flatMap((slot: TimeSlot) => {
      const start = parseInt(slot.start.split(':')[0]);
      const end = parseInt(slot.end.split(':')[0]);
      return Array.from(
        { length: end - start },
        (_, i) => `${(start + i).toString().padStart(2, '0')}:00`,
      );
    });

    return options.filter((hour: string) => isSlotAvailable(selectedDate, parseInt(hour)));
  }, [selectedDate, activeSchedule, isSlotAvailable]);

  const handleHourSelection = (hour: string) => {
    setSelectedHours((prevSelected) => {
      const hourNum = parseInt(hour);

      if (prevSelected.includes(hour)) {
        const newSelected = prevSelected.filter((h) => h !== hour);

        if (newSelected.length > 0) {
          const selectedHourNums = newSelected.map((h) => parseInt(h));
          const minHour = Math.min(...selectedHourNums);
          const maxHour = Math.max(...selectedHourNums);

          return Array.from(
            { length: maxHour - minHour + 1 },
            (_, i) => `${(minHour + i).toString().padStart(2, '0')}:00`,
          );
        }
        return newSelected;
      }

      if (prevSelected.length === 0) return [hour];

      const selectedHourNums = prevSelected.map((h) => parseInt(h));
      const minHour = Math.min(...selectedHourNums);
      const maxHour = Math.max(...selectedHourNums);

      if (hourNum === maxHour + 1 || hourNum === minHour - 1) {
        return [...prevSelected, hour].sort((a, b) => parseInt(a) - parseInt(b));
      }

      return [hour];
    });
  };

  const isHourSelected = (hour: string): boolean => selectedHours.includes(hour);

  const isHourDisabled = (hour: string): boolean => {
    const hourNum = parseInt(hour);
    const selectedDateTime = new Date(selectedDate);
    selectedDateTime.setHours(hourNum, 0, 0, 0);

    if (isBefore(selectedDateTime, new Date())) return true;
    if (!isSlotAvailable(selectedDate, hourNum)) return true;
    if (selectedHours.length === 0) return false;

    const selectedHourNums = selectedHours.map((h) => parseInt(h));
    const minHour = Math.min(...selectedHourNums);
    const maxHour = Math.max(...selectedHourNums);

    return hourNum !== maxHour + 1 && hourNum !== minHour - 1;
  };

  const selectedRange = (): string => {
    if (selectedHours.length === 0) return '';
    const startTime = selectedHours[0];
    const endTime = selectedHours[selectedHours.length - 1];
    const duration = parseInt(endTime) - parseInt(startTime);
    return `${startTime}–${endTime} · ${duration} jam`;
  };

  const handleSubmit = async () => {
    if (selectedHours.length < 1) {
      toast.error('Pilih minimal satu jam');
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();

      const startTime = new Date(selectedDate);
      startTime.setHours(parseInt(selectedHours[0]), 0, 0, 0);

      const endTime = new Date(selectedDate);
      const lastHour = parseInt(selectedHours[selectedHours.length - 1]);
      endTime.setHours(lastHour + 1, 0, 0, 0);

      // Update the existing booking with new schedule and status
      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          status: 'reschedule_requested',
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', booking.id);

      if (updateError) throw updateError;

      // Look up the streamer's user (auth) uuid — notifications.user_id is a
      // uuid, not the numeric streamers.id. Skip gracefully if not found.
      const { data: streamerUser } = await supabase
        .from('streamers')
        .select('user_id')
        .eq('id', booking.streamer_id)
        .single();

      if (streamerUser?.user_id) {
        const { error: notificationError } = await supabase.from('notifications').insert({
          user_id: streamerUser.user_id,
          type: 'reschedule_request',
          message: `Client has requested to reschedule booking #${booking.id} to ${format(startTime, 'MMM d, yyyy HH:mm')} - ${format(endTime, 'HH:mm')}`,
          booking_id: booking.id,
          created_at: new Date().toISOString(),
          is_read: false,
        });

        if (notificationError) {
          console.error('Error creating notification:', notificationError);
        }
      }

      onClose();
      onConfirm(startTime, endTime);
    } catch (error) {
      console.error('Error processing reschedule:', error);
      toast.error('Gagal mengajukan reschedule');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="gap-0 rounded-frame border-hairline bg-surface p-0">
        <div className="max-h-[80vh] space-y-5 overflow-y-auto p-5 sm:p-6">
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="font-serif text-title font-semibold text-ink">
              Ajukan jadwal baru
            </DialogTitle>
            <DialogDescription className="text-meta text-ink-soft">
              Pilih tanggal dan jam pengganti. Host masih harus menyetujuinya.
            </DialogDescription>
          </DialogHeader>

          <BookingCalendar
            selectedDate={selectedDate}
            onDateSelect={(dateStr) => setSelectedDate(new Date(dateStr))}
            onTimeSelect={(time) => {
              if (!selectedDate) return;
              const [hours, minutes] = time.split(':').map(Number);
              const newDate = new Date(selectedDate);
              newDate.setHours(hours, minutes, 0, 0);
              setSelectedDate(newDate);
            }}
          />

          <div className="h-px bg-hairline-soft" />

          <div className="space-y-4">
            {TIME_BANDS.map((band) => {
              const hours = timeOptions.filter((hour) => {
                const hourNum = parseInt(hour);
                return hourNum >= band.from && hourNum < band.to;
              });
              if (hours.length === 0) return null;

              return (
                <div key={band.label}>
                  <h4 className="text-tiny uppercase text-ink-ghost">{band.label}</h4>
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    {hours.map((hour) => {
                      const selected = isHourSelected(hour);
                      const disabled = isHourDisabled(hour);
                      return (
                        <button
                          key={hour}
                          type="button"
                          onClick={() => handleHourSelection(hour)}
                          disabled={disabled}
                          className={`numeric h-9 rounded-field border text-copy transition-colors ${
                            selected
                              ? 'border-brand bg-brand text-white'
                              : 'border-hairline-input bg-surface text-ink-body hover:bg-surface-tint'
                          } disabled:cursor-not-allowed disabled:border-hairline-soft disabled:bg-surface disabled:text-ink-ghost`}
                        >
                          {hour}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {selectedHours.length > 0 && (
            <p className="text-meta text-ink-body">
              Waktu terpilih <span className="numeric text-ink">{selectedRange()}</span>
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-hairline-soft bg-surface-tint p-5 sm:p-6">
          <Button
            variant="quiet"
            size="action-secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Kembali
          </Button>
          <Button
            variant="brand"
            size="action"
            onClick={handleSubmit}
            disabled={isSubmitting || selectedHours.length < 1}
          >
            {isSubmitting ? 'Memproses…' : 'Ajukan jadwal baru'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------
   Cancel — unchanged behaviour, redressed.
   ------------------------------------------------------------------------- */

interface CancelConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isSubmitting: boolean;
}

function CancelConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
}: CancelConfirmationModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!reason.trim()) {
      setError('Alasan pembatalan harus diisi');
      return;
    }
    onConfirm(reason);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="gap-0 rounded-frame border-hairline bg-surface p-0">
        <div className="space-y-5 p-5 sm:p-6">
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="font-serif text-title font-semibold text-ink">
              Batalkan pengajuan reschedule
            </DialogTitle>
            <DialogDescription className="text-meta text-ink-soft">
              Host akan melihat alasan ini. Membatalkan mendadak merugikan host yang
              sudah menyiapkan jamnya.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="cancel-reason" className="text-copy font-medium text-ink-body">
              Alasan pembatalan
            </Label>
            <textarea
              id="cancel-reason"
              className={`min-h-[112px] w-full rounded-field border bg-surface p-3 text-copy text-ink placeholder:text-ink-ghost focus:outline-none focus:ring-1 focus:ring-brand ${
                error ? 'border-critical' : 'border-hairline-input'
              }`}
              placeholder="Tulis alasan kamu di sini…"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError('');
              }}
            />
            {error && <p className="text-mini text-critical">{error}</p>}
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-hairline-soft bg-surface-tint p-5 sm:p-6">
          <Button
            variant="quiet"
            size="action-secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Kembali
          </Button>
          <Button
            variant="danger"
            size="action"
            onClick={handleSubmit}
            disabled={isSubmitting || !reason.trim()}
          >
            {isSubmitting ? 'Memproses…' : 'Batalkan pengajuan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------
   Address — unchanged behaviour, redressed.
   ------------------------------------------------------------------------- */

function AddressDialog({
  booking,
  onClose,
}: {
  booking: Booking | null;
  onClose: () => void;
}) {
  const [isCopied, setIsCopied] = useState(false);
  const address = booking?.streamer?.full_address;

  useEffect(() => {
    setIsCopied(false);
  }, [booking?.id]);

  const handleCopy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setIsCopied(true);
      toast.success('Alamat berhasil disalin!');
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error('Gagal menyalin alamat');
    }
  };

  return (
    <Dialog open={!!booking} onOpenChange={onClose}>
      <DialogContent className="gap-0 rounded-frame border-hairline bg-surface p-0">
        <div className="space-y-5 p-5 sm:p-6">
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="font-serif text-title font-semibold text-ink">
              Alamat Pengiriman
            </DialogTitle>
            <DialogDescription className="text-meta text-ink-soft">
              Kirim produk kamu ke alamat ini sebelum jadwal live dimulai.
            </DialogDescription>
          </DialogHeader>

          {booking && (
            <dl className="overflow-hidden rounded-panel border border-hairline">
              <div className="flex min-w-0 items-baseline gap-4 border-b border-hairline-soft px-4 py-3">
                <dt className="shrink-0 text-meta text-ink-soft">Host</dt>
                <dd className="min-w-0 flex-1 truncate text-right text-copy text-ink">
                  {hostName(booking)}
                </dd>
              </div>
              <div className="flex min-w-0 items-baseline gap-4 border-b border-hairline-soft px-4 py-3">
                <dt className="shrink-0 text-meta text-ink-soft">Sesi</dt>
                <dd className="numeric min-w-0 flex-1 truncate text-right text-copy text-ink">
                  {formatDay(booking.start_time)} · {formatClock(booking.start_time)}–
                  {formatClock(booking.end_time)}
                </dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-meta text-ink-soft">Alamat</dt>
                <dd className="mt-1 whitespace-pre-line text-copy text-ink-body">
                  {address || 'Alamat tidak tersedia'}
                </dd>
              </div>
            </dl>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-hairline-soft bg-surface-tint p-5 sm:p-6">
          <Button variant="quiet" size="action-secondary" onClick={onClose}>
            Tutup
          </Button>
          <Button
            variant="brand"
            size="action"
            onClick={handleCopy}
            disabled={!address || isCopied}
          >
            {isCopied ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Alamat sudah disalin
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Salin Alamat
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------
   The list.
   ------------------------------------------------------------------------- */

function SectionHeading({
  index,
  title,
  description,
  count,
}: {
  index: number;
  title: string;
  description: string;
  count: number;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline-soft px-4 py-4 sm:px-5">
      <span className="numeric text-mini font-semibold text-ink-ghost">
        {String(index).padStart(2, '0')}
      </span>
      <h2 className="font-serif text-title font-semibold text-ink">{title}</h2>
      <span className="numeric text-mini text-ink-ghost">{count}</span>
      <p className="w-full text-meta text-ink-soft sm:w-auto sm:flex-1 sm:text-right">
        {description}
      </p>
    </div>
  );
}

interface BookingRowProps {
  booking: Booking;
  onShowAddress: (booking: Booking) => void;
  onRate: (booking: Booking) => void;
  onReschedule: (booking: Booking) => void;
  onCancel: (booking: Booking) => void;
}

/**
 * One booking, one line.
 *
 * The identity block is `min-w-0` + `truncate` and the value block is
 * `shrink-0`: a long host name or a five-word platform string shortens itself
 * rather than pushing the price onto a second line. A booking list where some
 * rows are one line tall and some are two is a list you cannot scan down.
 *
 * Any action sits BELOW the line rather than inside it. There is no width at
 * which host + schedule + status + price + a button all fit on a phone, and
 * the alternative — letting the row reflow — is the thing this design forbids.
 */
function BookingRow({
  booking,
  onShowAddress,
  onRate,
  onReschedule,
  onCancel,
}: BookingRowProps) {
  const status = statusText(booking.status);
  const discount = booking.voucher_usage?.[0]?.discount_applied ?? 0;
  const finalPrice = booking.voucher_usage?.[0]?.final_price ?? booking.price;
  const normalized = booking.status.toLowerCase();

  return (
    <li className="border-b border-hairline-soft last:border-b-0">
      <div className="flex min-w-0 items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-raised sm:gap-4 sm:px-5">
        <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface-tint">
          <Image
            src={booking.streamer?.image_url || '/default-avatar.png'}
            alt={hostName(booking)}
            fill
            sizes="40px"
            className="object-cover"
          />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-ui font-medium text-ink">{hostName(booking)}</p>
          <p className="truncate text-meta text-ink-soft">
            <span className="numeric">{formatDay(booking.start_time)}</span>
            <span className="text-ink-ghost"> · </span>
            <span className="numeric">
              {formatClock(booking.start_time)}–{formatClock(booking.end_time)}
            </span>
            <span className="text-ink-ghost"> · </span>
            {booking.platform}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className={`text-mini ${status.tone}`}>{status.label}</p>
          <p className="whitespace-nowrap text-copy font-medium text-ink">
            {discount > 0 && (
              <span className="numeric mr-1.5 text-mini font-normal text-ink-ghost line-through">
                {formatRupiah(booking.price)}
              </span>
            )}
            <span className="numeric">{formatRupiah(finalPrice)}</span>
          </p>
        </div>
      </div>

      {normalized === 'reschedule_requested' ? (
        <div className="px-4 pb-4 sm:px-5">
          <CardActionBar
            className="mt-0"
            primaryLabel="Ubah jadwal"
            onPrimary={() => onReschedule(booking)}
            secondaryLabel="Batalkan"
            onSecondary={() => onCancel(booking)}
          >
            Host belum menjawab pengajuan reschedule kamu.
          </CardActionBar>
        </div>
      ) : normalized === 'accepted' ? (
        <div className="flex justify-end px-4 pb-3.5 sm:px-5">
          <Button
            variant="quiet"
            size="action-compact"
            onClick={() => onShowAddress(booking)}
          >
            <MapPin className="mr-2 h-4 w-4" />
            Lihat alamat host
          </Button>
        </div>
      ) : normalized === 'completed' && !booking.items_received ? (
        <div className="flex justify-end px-4 pb-3.5 sm:px-5">
          <Button variant="quiet" size="action-compact" onClick={() => onRate(booking)}>
            Beri penilaian
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/* -------------------------------------------------------------------------
   Page.
   ------------------------------------------------------------------------- */

const SECTIONS: Array<{ bucket: Bucket; title: string; description: string }> = [
  {
    bucket: 'action',
    title: 'Butuh tindakan kamu',
    description: 'Kirim produk, buka alamat host, atau beri penilaian.',
  },
  {
    bucket: 'waiting',
    title: 'Menunggu jawaban host',
    description: 'Host biasanya menjawab dalam 15–60 menit.',
  },
  {
    bucket: 'done',
    title: 'Sudah selesai',
    description: 'Sesi yang sudah lewat, ditolak, atau dibatalkan.',
  },
];

export default function ClientBookings(): JSX.Element {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [addressBooking, setAddressBooking] = useState<Booking | null>(null);
  const [ratingBooking, setRatingBooking] = useState<Booking | null>(null);
  const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(null);
  const [cancelBooking, setCancelBooking] = useState<Booking | null>(null);
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);

  const fetchClientData = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Fetch bookings
        const { data: bookingsData, error: bookingsError } = await supabase
          .from('bookings')
          .select(`
            id,
            start_time,
            end_time,
            platform,
            status,
            created_at,
            price,
            special_request,
            streamer:streamer_id (
              id,
              first_name,
              last_name,
              platform,
              rating,
              image_url,
              location,
              full_address
            ),
            voucher_usage (
              final_price,
              discount_applied
            )
          `)
          .eq('client_id', user.id)
          .not('status', 'eq', 'payment_pending')
          .order('created_at', { ascending: false });

        if (bookingsError) {
          console.error('Error fetching bookings:', bookingsError);
          setError('Gagal memuat booking kamu');
        } else if (bookingsData) {
          // Get unique streamer IDs. Guard against a null streamer join (a
          // deleted/unlinked streamer) so one orphaned booking can't throw and
          // blank out the client's entire bookings list.
          const streamerIds = Array.from(
            new Set(
              bookingsData
                .map((booking: any) => booking.streamer?.id)
                .filter((id: any) => id != null),
            ),
          );

          // Fetch ratings
          const { data: ratingsData, error: ratingsError } = await supabase
            .from('streamer_ratings')
            .select('streamer_id, rating')
            .in('streamer_id', streamerIds);

          if (ratingsError) {
            console.error('Error fetching ratings:', ratingsError);
          } else {
            // Calculate average ratings
            const averageRatings = (ratingsData || []).reduce(
              (acc: Record<number, { sum: number; count: number }>, curr) => {
                if (!acc[curr.streamer_id]) {
                  acc[curr.streamer_id] = { sum: 0, count: 0 };
                }
                acc[curr.streamer_id].sum += curr.rating;
                acc[curr.streamer_id].count += 1;
                return acc;
              },
              {},
            );

            // Add ratings to bookings
            const bookingsWithRatings: Booking[] = bookingsData.map((booking: any) => ({
              ...booking,
              streamer_id: booking.streamer?.id,
              streamer: {
                ...booking.streamer,
                rating: averageRatings[booking.streamer?.id]
                  ? averageRatings[booking.streamer?.id].sum /
                    averageRatings[booking.streamer?.id].count
                  : 0,
              },
            }));

            setError(null);
            setBookings(bookingsWithRatings);
          }
        } else {
          setBookings([]);
        }
      }
    } catch (err) {
      console.error('Error:', err);
      setError('Gagal memuat booking kamu');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchClientData();
  }, [fetchClientData]);

  const refreshBookings = () => {
    setIsRefreshing(true);
    fetchClientData();
  };

  /**
   * The whole screen's ordering, in one place.
   *
   * Within "butuh tindakan" and "menunggu", soonest first — the thing that runs
   * out of time first is the thing to do first. Within "sudah selesai", most
   * recent first, because history is read backwards.
   */
  const sections = useMemo(() => {
    const grouped: Record<Bucket, Booking[]> = { action: [], waiting: [], done: [] };
    bookings.forEach((booking) => grouped[bucketOf(booking)].push(booking));

    grouped.action.sort((a, b) => startTimeOf(a) - startTimeOf(b));
    grouped.waiting.sort((a, b) => startTimeOf(a) - startTimeOf(b));
    grouped.done.sort((a, b) => startTimeOf(b) - startTimeOf(a));

    return SECTIONS.map((section) => ({ ...section, rows: grouped[section.bucket] }));
  }, [bookings]);

  const isEmpty = bookings.length === 0;

  const handleReschedule = async (startTime: Date, endTime: Date) => {
    const booking = rescheduleBooking;
    if (!booking) return;

    try {
      const supabase = createClient();

      // Update the booking status to pending
      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          status: 'pending',
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', booking.id);

      if (updateError) throw updateError;

      // Look up the streamer's user (auth) uuid — notifications.user_id is a
      // uuid, not the numeric streamers.id. Skip gracefully if not found.
      const { data: streamerUser } = await supabase
        .from('streamers')
        .select('user_id')
        .eq('id', booking.streamer_id)
        .single();

      if (streamerUser?.user_id) {
        const { error: notificationError } = await supabase.from('notifications').insert({
          user_id: streamerUser.user_id,
          type: 'booking_request',
          message: `Client has rescheduled booking #${booking.id} to ${format(startTime, 'MMM d, yyyy HH:mm')} - ${format(endTime, 'HH:mm')}. Please review and accept/reject.`,
          booking_id: booking.id,
          created_at: new Date().toISOString(),
          is_read: false,
          streamer_id: booking.streamer_id,
        });

        if (notificationError) {
          console.error('Error creating notification:', notificationError);
        }
      }

      setRescheduleBooking(null);
      toast.success('Pengajuan reschedule terkirim');

      setBookings((prev) =>
        prev.map((item) =>
          item.id === booking.id ? { ...item, status: 'pending' } : item,
        ),
      );

      window.location.reload();
    } catch (err) {
      console.error('Error rescheduling booking:', err);
      toast.error('Gagal mengajukan reschedule');
    }
  };

  const handleCancel = async (reason: string) => {
    const booking = cancelBooking;
    if (!booking) return;

    setIsSubmittingCancel(true);
    try {
      const supabase = createClient();

      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', booking.id);

      if (updateError) throw updateError;

      // Look up the streamer's user (auth) uuid — notifications.user_id is a
      // uuid, not the numeric streamers.id. Skip gracefully if not found.
      const { data: streamerUser } = await supabase
        .from('streamers')
        .select('user_id')
        .eq('id', booking.streamer_id)
        .single();

      if (streamerUser?.user_id) {
        const { error: notificationError } = await supabase.from('notifications').insert({
          user_id: streamerUser.user_id,
          message: `Client telah membatalkan permintaan reschedule dengan alasan: ${reason}`,
          type: 'booking_cancelled',
          booking_id: booking.id,
          created_at: new Date().toISOString(),
          is_read: false,
        });

        if (notificationError) {
          console.error('Error creating notification:', notificationError);
        }
      }

      setCancelBooking(null);
      toast.success('Booking berhasil dibatalkan');

      setBookings((prev) =>
        prev.map((item) =>
          item.id === booking.id ? { ...item, status: 'cancelled' } : item,
        ),
      );
    } catch (err) {
      console.error('Error cancelling booking:', err);
      toast.error('Gagal membatalkan booking');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      <main className="mx-auto w-full max-w-[880px] px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => router.push('/protected')}
              className="-ml-1 inline-flex items-center gap-1 text-meta text-ink-soft transition-colors hover:text-ink"
            >
              <ChevronLeft className="h-4 w-4" />
              Cari host
            </button>
            <h1 className="mt-3 font-serif text-section font-semibold text-ink sm:text-display">
              Booking saya
            </h1>
            <p className="mt-2 text-lede text-ink-soft">
              Yang butuh tindakan kamu ada di atas.
            </p>
          </div>

          <Button
            variant="quiet"
            size="action-compact"
            onClick={refreshBookings}
            disabled={isRefreshing || isLoading}
            className="shrink-0 max-sm:w-full"
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
            />
            Muat ulang
          </Button>
        </header>

        {isLoading ? (
          <div className="mt-8 overflow-hidden rounded-frame border border-hairline bg-surface">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-4 border-b border-hairline-soft px-5 py-4 last:border-b-0"
              >
                <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-surface-deep" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3.5 w-1/3 animate-pulse rounded-chip bg-surface-deep" />
                  <div className="h-3 w-2/3 animate-pulse rounded-chip bg-surface-tint" />
                </div>
                <div className="h-3.5 w-20 shrink-0 animate-pulse rounded-chip bg-surface-deep" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="mt-8 rounded-frame border border-hairline bg-surface px-5 py-12 text-center">
            <p className="text-copy font-medium text-ink">{error}</p>
            <p className="mx-auto mt-1 max-w-sm text-meta text-ink-soft">
              Coba muat ulang sebentar lagi. Booking kamu tidak hilang.
            </p>
            <div className="mt-5 flex justify-center">
              <Button variant="brand" size="action-compact" onClick={refreshBookings}>
                Muat ulang
              </Button>
            </div>
          </div>
        ) : isEmpty ? (
          <div className="mt-8 rounded-frame border border-hairline bg-surface px-5 py-16 text-center">
            <p className="font-serif text-title font-semibold text-ink">
              Belum ada booking
            </p>
            <p className="mx-auto mt-2 max-w-sm text-meta text-ink-soft">
              Pilih host, tandai jamnya, dan sesi pertama kamu muncul di sini.
            </p>
            <div className="mt-6 flex justify-center">
              <Button
                variant="brand"
                size="action-compact"
                onClick={() => router.push('/protected')}
              >
                Cari host
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            {sections.map((section, index) =>
              section.rows.length === 0 ? null : (
                <section
                  key={section.bucket}
                  className="overflow-hidden rounded-frame border border-hairline bg-surface"
                >
                  <SectionHeading
                    index={index + 1}
                    title={section.title}
                    description={section.description}
                    count={section.rows.length}
                  />
                  <ul>
                    {section.rows.map((booking) => (
                      <BookingRow
                        key={booking.id}
                        booking={booking}
                        onShowAddress={setAddressBooking}
                        onRate={setRatingBooking}
                        onReschedule={setRescheduleBooking}
                        onCancel={setCancelBooking}
                      />
                    ))}
                  </ul>
                </section>
              ),
            )}
          </div>
        )}
      </main>

      <AddressDialog booking={addressBooking} onClose={() => setAddressBooking(null)} />

      {ratingBooking && (
        <RatingModal
          isOpen
          onClose={() => setRatingBooking(null)}
          bookingId={ratingBooking.id}
          streamerId={ratingBooking.streamer?.id ?? 0}
          streamerName={hostName(ratingBooking)}
          streamerImage={ratingBooking.streamer?.image_url ?? ''}
          startDate={ratingBooking.start_time}
          endDate={ratingBooking.end_time}
          onSubmit={() => {
            setRatingBooking(null);
            fetchClientData();
          }}
        />
      )}

      {rescheduleBooking && (
        <RescheduleTimeModal
          isOpen
          onClose={() => setRescheduleBooking(null)}
          onConfirm={handleReschedule}
          booking={rescheduleBooking}
        />
      )}

      <CancelConfirmationModal
        isOpen={!!cancelBooking}
        onClose={() => setCancelBooking(null)}
        onConfirm={handleCancel}
        isSubmitting={isSubmittingCancel}
      />
    </div>
  );
}
