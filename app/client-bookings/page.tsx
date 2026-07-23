"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from "@/utils/supabase/client";
import { format, differenceInHours, isBefore, startOfDay, isSameDay } from 'date-fns';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Clock, DollarSign, Star, Info, RefreshCw, X, XCircle, CheckCircle, Check, Radio, FileText, MapPin, Copy, Calendar, ChevronDown } from 'lucide-react';
import Image from 'next/image';
import RatingModal from '@/components/rating-modal';
import { useRouter } from 'next/navigation';
import CancelBookingModal from '@/components/cancel-booking-modal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "react-hot-toast";
import { BookingCalendar } from '@/components/booking-calendar';
import { AddressButton } from "@/components/ui/address-button";

interface Booking {
  id: number;
  client_id: string;
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
  payment_group_id: string;
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

interface RatingData {
  streamer_id: number;
  rating: number;
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

function formatBookingTime(dateString: string, timezone: string = 'UTC') {
  const date = new Date(dateString);
  return format(date, 'HH:mm');
}

function formatBookingDate(dateString: string, formatStr: string = 'EEEE, MMMM d, yyyy') {
  const date = new Date(dateString);
  return format(date, formatStr);
}

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

interface RescheduleTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newStartTime: Date, newEndTime: Date) => void;
  currentStartTime: string;
  currentEndTime: string;
  booking: Booking;
}

function RescheduleTimeModal({ 
  isOpen, 
  onClose, 
  onConfirm,
  currentStartTime,
  currentEndTime,
  booking
}: RescheduleTimeModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(currentStartTime));
  const [selectedHours, setSelectedHours] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSchedule, setActiveSchedule] = useState<Schedule | null>(null);
  const [daysOff, setDaysOff] = useState<string[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetchActiveSchedule();
      fetchDaysOff();
      fetchAcceptedBookings();
    }
  }, [booking.streamer_id, isOpen]);

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
        const schedule = typeof data[0].schedule === 'string' 
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

  const fetchDaysOff = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('streamer_day_offs')
      .select('date')
      .eq('streamer_id', booking.streamer_id);

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
      .eq('streamer_id', booking.streamer_id)
      .in('status', ['accepted', 'pending'])
      .neq('id', booking.id);

    if (error) {
      console.error('Error fetching bookings:', error);
      toast.error('Failed to fetch bookings');
    } else {
      setBookings(data || []);
    }
  };

  const isSlotAvailable = useCallback((date: Date, hour: number): boolean => {
    if (!activeSchedule) return false;
    const dayOfWeek = date.getDay();
    const daySchedule = activeSchedule[dayOfWeek];
    if (!daySchedule || !daySchedule.slots) return false;
  
    const isInSchedule = daySchedule.slots.some((slot: TimeSlot) => {
      const start = parseInt(slot.start.split(':')[0]);
      const end = parseInt(slot.end.split(':')[0]);
      return hour >= start && hour < end;
    });

    const bookingExists = bookings.some((booking: BookingRecord) => {
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
  }, [activeSchedule, bookings] as const);

  const generateTimeOptions = (): string[] => {
    if (!selectedDate || !activeSchedule) return [];
    const dayOfWeek = selectedDate.getDay();
    const daySchedule = activeSchedule[dayOfWeek];
    if (!daySchedule || !daySchedule.slots) return [];
  
    const options = daySchedule.slots.flatMap((slot: TimeSlot) => {
      const start = parseInt(slot.start.split(':')[0]);
      const end = parseInt(slot.end.split(':')[0]);
      return Array.from({ length: end - start }, (_, i) => `${(start + i).toString().padStart(2, '0')}:00`);
    });

    return options.filter((hour: string) => isSlotAvailable(selectedDate, parseInt(hour)));
  };

  const timeOptions = generateTimeOptions();

  const handleHourSelection = (hour: string) => {
    setSelectedHours((prevSelected) => {
      const hourNum = parseInt(hour);
      
      if (prevSelected.includes(hour)) {
        const newSelected = prevSelected.filter(h => h !== hour);
        
        if (newSelected.length > 0) {
          const selectedHourNums = newSelected.map(h => parseInt(h));
          const minHour = Math.min(...selectedHourNums);
          const maxHour = Math.max(...selectedHourNums);
          
          return Array.from(
            { length: maxHour - minHour + 1 }, 
            (_, i) => `${(minHour + i).toString().padStart(2, '0')}:00`
          );
        }
        return newSelected;
      } else {
        if (prevSelected.length === 0) {
          return [hour];
        }
        
        const selectedHourNums = prevSelected.map(h => parseInt(h));
        const minHour = Math.min(...selectedHourNums);
        const maxHour = Math.max(...selectedHourNums);
        
        if (hourNum === maxHour + 1 || hourNum === minHour - 1) {
          const newSelected = [...prevSelected, hour];
          return newSelected.sort((a, b) => parseInt(a) - parseInt(b));
        }
        
        return [hour];
      }
    });
  };

  const isHourSelected = (hour: string): boolean => {
    return selectedHours.includes(hour);
  };

  const isHourDisabled = (hour: string): boolean => {
    const hourNum = parseInt(hour);
    const selectedDateTime = new Date(selectedDate);
    selectedDateTime.setHours(hourNum, 0, 0, 0);
    const now = new Date();
    
    if (isBefore(selectedDateTime, now)) return true;
    
    if (!isSlotAvailable(selectedDate, hourNum)) return true;
    
    if (selectedHours.length === 0) return false;
    
    const selectedHourNums = selectedHours.map(h => parseInt(h));
    const minHour = Math.min(...selectedHourNums);
    const maxHour = Math.max(...selectedHourNums);
    
    return hourNum !== maxHour + 1 && hourNum !== minHour - 1;
  };

  const getSelectedTimeRange = (): string => {
    if (selectedHours.length === 0) return '';
    
    // Get start and end times
    const startTime = selectedHours[0];
    const endTime = selectedHours[selectedHours.length - 1];
    
    // Calculate duration based on the difference between start and end time
    const startHour = parseInt(startTime);
    const endHour = parseInt(endTime);
    const duration = endHour - startHour;
    
    return `${startTime} - ${endTime} (${duration} hour${duration !== 1 ? 's' : ''})`;
  };

  const handleSubmit = async () => {
    if (selectedHours.length < 1) {
      toast.error("Please select at least one hour");
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
          updated_at: new Date().toISOString()
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
        // Create notification for streamer
        const { error: notificationError } = await supabase
          .from('notifications')
          .insert({
            user_id: streamerUser.user_id,
            type: 'reschedule_request',
            message: `Client has requested to reschedule booking #${booking.id} to ${format(startTime, 'MMM d, yyyy HH:mm')} - ${format(endTime, 'HH:mm')}`,
            booking_id: booking.id,
            created_at: new Date().toISOString(),
            is_read: false
          });

        if (notificationError) {
          console.error('Error creating notification:', notificationError);
        }
      }

      onClose();
      onConfirm(startTime, endTime);
      
    } catch (error) {
      console.error('Error processing reschedule:', error);
      toast.error("Failed to reschedule");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="p-0 gap-0">
        <div className="p-4 sm:p-6 space-y-4 max-h-[85vh] overflow-y-auto">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-base sm:text-lg font-semibold">
              Pengajuan Reschedule
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Pilih waktu baru untuk sesi live streaming
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2">
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
          </div>

          <div className="h-px bg-gray-200" />

          <div className="space-y-3">
            {['Morning', 'Afternoon', 'Evening', 'Night'].map((timeOfDay) => (
              <div key={timeOfDay}>
                <h4 className="text-xs sm:text-sm font-semibold mb-2">{timeOfDay}</h4>
                <div className="grid grid-cols-4 gap-1.5">
                  {timeOptions
                    .filter((hour) => {
                      const hourNum = parseInt(hour);
                      return (
                        (timeOfDay === 'Night' && (hourNum >= 0 && hourNum < 6)) ||
                        (timeOfDay === 'Morning' && (hourNum >= 6 && hourNum < 12)) ||
                        (timeOfDay === 'Afternoon' && (hourNum >= 12 && hourNum < 18)) ||
                        (timeOfDay === 'Evening' && (hourNum >= 18 && hourNum < 24))
                      );
                    })
                    .map((hour) => (
                      <Button
                        key={hour}
                        variant={isHourSelected(hour) ? "default" : "outline"}
                        className={`text-[10px] sm:text-xs p-1 h-8 ${
                          isHourSelected(hour) 
                            ? 'bg-gradient-to-r from-[#1e40af] to-[#6b21a8] text-white hover:from-[#1e3a8a] hover:to-[#581c87]' 
                            : isHourDisabled(hour)
                              ? 'opacity-50 cursor-not-allowed'
                              : 'hover:bg-blue-50'
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

          {selectedHours.length > 0 && (
            <div className="text-xs sm:text-sm font-medium">
              Selected time: {getSelectedTimeRange()}
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 p-4 sm:p-6 border-t bg-gray-50">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto text-xs sm:text-sm h-9 sm:h-10 border-gray-300"
          >
            Kembali
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || selectedHours.length < 1}
            className="w-full sm:w-auto text-xs sm:text-sm h-9 sm:h-10 bg-gradient-to-r from-[#1e40af] to-[#6b21a8] hover:from-[#1e3a8a] hover:to-[#581c87] text-white"
          >
            {isSubmitting ? 'Memproses...' : 'Konfirmasi'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
  isSubmitting
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
      <DialogContent className="p-0 gap-0">
        <div className="p-4 sm:p-6 space-y-4 max-h-[85vh] overflow-y-auto">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-lg sm:text-xl font-semibold text-red-600">
              Konfirmasi Pembatalan
            </DialogTitle>
            <DialogDescription className="space-y-3">
              <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                <p className="text-sm font-medium text-red-800 mb-2">
                  Peringatan:
                </p>
                <ul className="list-disc pl-4 space-y-1.5 text-xs sm:text-sm text-red-700">
                  <li>Pembatalan akan mempengaruhi reputasi Anda sebagai client</li>
                  <li>Pembatalan mendadak dapat menyebabkan kerugian bagi streamer</li>
                  <li>Mohon pertimbangkan kembali sebelum membatalkan pesanan</li>
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="cancel-reason" className="text-sm font-medium flex items-center">
                Alasan Pembatalan
                <span className="text-red-500 ml-0.5">*</span>
              </Label>
              <textarea
                id="cancel-reason"
                className={`w-full min-h-[120px] p-3 rounded-lg border text-sm ${
                  error ? 'border-red-500' : 'border-gray-300'
                } focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white`}
                placeholder="Mohon jelaskan alasan pembatalan Anda..."
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (error) setError('');
                }}
              />
              {error && (
                <p className="text-xs text-red-500 mt-1">{error}</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 p-4 sm:p-6 border-t bg-gray-50">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto text-sm h-10 border-gray-300"
          >
            Kembali
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !reason.trim()}
            className="w-full sm:w-auto text-sm h-10 bg-red-600 hover:bg-red-700 text-white"
          >
            {isSubmitting ? 'Memproses...' : 'Lanjutkan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface BookingEntryProps {
  booking: Booking;
  onRatingSubmit: () => void;
  onStatusUpdate: (bookingId: number, newStatus: string) => void;
}

function BookingEntry({ booking, onRatingSubmit, onStatusUpdate }: BookingEntryProps) {
  const router = useRouter();
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [showDeliveryInfo, setShowDeliveryInfo] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [relatedBookings, setRelatedBookings] = useState<Booking[]>([]);
  const [showRelatedBookings, setShowRelatedBookings] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Fetch related bookings on mount
  useEffect(() => {
    const fetchRelatedBookings = async () => {
      if (!booking.payment_group_id) return;

      const supabase = createClient();
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('payment_group_id', booking.payment_group_id)
        .neq('id', booking.id)
        .order('start_time', { ascending: true });

      if (!error && data) {
        setRelatedBookings(data);
      }
    };

    fetchRelatedBookings();
  }, [booking.payment_group_id, booking.id]);

  // Add debug logging
  useEffect(() => {
    console.log('Booking times:', {
      start: booking.start_time,
      end: booking.end_time,
      convertedStart: formatBookingTime(booking.start_time, booking.timezone),
      convertedEnd: formatBookingTime(booking.end_time, booking.timezone),
      timezone: booking.timezone
    });
  }, [booking]);

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending': return <Clock className="w-3 h-3" />;
      case 'accepted': return <CheckCircle className="w-3 h-3" />;
      case 'completed': return <Check className="w-3 h-3" />;
      case 'live': return <Radio className="w-3 h-3" />;
      case 'rejected': return <XCircle className="w-3 h-3" />;
      case 'cancelled': return <X className="w-3 h-3" />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending': return 'bg-blue-50 text-blue-700 border border-blue-200';
      case 'accepted': return 'bg-green-50 text-green-700 border border-green-200';
      case 'completed': return 'bg-indigo-50 text-indigo-700 border border-indigo-200';
      case 'live': return 'bg-red-50 text-red-700 border border-red-200';
      case 'rejected': return 'bg-gray-50 text-gray-700 border border-gray-200';
      case 'cancelled': return 'bg-gray-50 text-gray-700 border border-gray-200';
      default: return 'bg-gray-50 text-gray-700 border border-gray-200';
    }
  };

  console.log('Booking status:', booking.status); // Add this line for debugging

  // Parse the rating to ensure it's a number
  const rating = parseFloat(booking.streamer?.rating as unknown as string);

  // Group bookings by date
  const bookingsByDate = useMemo(() => {
    const allBookings = [booking, ...relatedBookings];
    return allBookings.reduce((acc, b) => {
      const date = format(new Date(b.start_time), 'yyyy-MM-dd');
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(b);
      return acc;
    }, {} as Record<string, Booking[]>);
  }, [booking, relatedBookings]);

  const handleReschedule = async (startTime: Date, endTime: Date) => {
    try {
      const supabase = createClient();
      
      // Update the booking status to pending
      const { error: updateError } = await supabase
        .from('bookings')
        .update({ 
          status: 'pending',
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          updated_at: new Date().toISOString()
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
        // Create notification for streamer
        const { error: notificationError } = await supabase
          .from('notifications')
          .insert({
            user_id: streamerUser.user_id,
            type: 'booking_request',
            message: `Client has rescheduled booking #${booking.id} to ${format(startTime, 'MMM d, yyyy HH:mm')} - ${format(endTime, 'HH:mm')}. Please review and accept/reject.`,
            booking_id: booking.id,
            created_at: new Date().toISOString(),
            is_read: false,
            streamer_id: booking.streamer_id
          });

        if (notificationError) {
          console.error('Error creating notification:', notificationError);
        }
      }

      setIsRescheduleModalOpen(false);
      toast.success("Reschedule request sent successfully");
      
      // Update local state
      if (typeof onStatusUpdate === 'function') {
        onStatusUpdate(booking.id, 'pending');
      }

      // Refresh the bookings list
      window.location.reload();
    } catch (error) {
      console.error('Error rescheduling booking:', error);
      toast.error("Failed to reschedule booking");
    }
  };

  const handleCancel = async (reason: string) => {
    setIsSubmittingCancel(true);
    try {
      const supabase = createClient();
      
      const { error: updateError } = await supabase
        .from('bookings')
        .update({ 
          status: 'cancelled',
          reason: reason,
          updated_at: new Date().toISOString()
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
        // Create notification for streamer
        const { error: notificationError } = await supabase
          .from('notifications')
          .insert({
            user_id: streamerUser.user_id,
            message: `Client telah membatalkan permintaan reschedule dengan alasan: ${reason}`,
            type: 'booking_cancelled',
            booking_id: booking.id,
            created_at: new Date().toISOString(),
            is_read: false
          });

        if (notificationError) {
          console.error('Error creating notification:', notificationError);
        }
      }

      setIsCancelModalOpen(false);
      toast.success("Booking berhasil dibatalkan");
      
      // Update the booking status locally
      if (typeof onStatusUpdate === 'function') {
        onStatusUpdate(booking.id, 'cancelled');
      }
    } catch (error) {
      console.error('Error cancelling booking:', error);
      toast.error("Gagal membatalkan booking");
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  // Update price display logic
  const displayPrice = booking.voucher_usage?.[0]?.final_price ?? booking.price;
  const discountAmount = booking.voucher_usage?.[0]?.discount_applied ?? 0;
  const hasDiscount = discountAmount > 0;

  const DeliveryInfoCard = () => {
    const handleCopyAddress = async () => {
      if (selectedBooking?.streamer?.full_address) {
        try {
          await navigator.clipboard.writeText(selectedBooking.streamer.full_address);
          setIsCopied(true);
          toast.success("Alamat berhasil disalin!");
          
          // Reset the copied state after 2 seconds
          setTimeout(() => {
            setIsCopied(false);
          }, 2000);
        } catch (err) {
          toast.error("Gagal menyalin alamat");
        }
      }
    };

    return (
      <>
        {/* Dark overlay backdrop */}
        <div 
          className="fixed inset-0 bg-black/50 transition-opacity z-40"
          onClick={() => setShowDeliveryInfo(false)}
        />
        
        {/* Centered card */}
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-200">
            <div className="p-4">
              {/* Header with close button */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden">
                    <Image
                      src={selectedBooking?.streamer?.image_url || '/default-avatar.png'}
                      alt="Streamer"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {selectedBooking?.streamer?.first_name} {selectedBooking?.streamer?.last_name?.charAt(0)}.
                    </h3>
                    <p className="text-sm text-gray-500">
                      Rp {selectedBooking?.price?.toLocaleString('id-ID')}/jam
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowDeliveryInfo(false)}
                  className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <XCircle className="h-5 w-5 text-gray-400" />
                </button>
              </div>

              {/* Booking ID */}
              <div className="flex items-center gap-2 mb-4 bg-blue-50 p-2 rounded-lg">
                <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <FileText className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Booking ID:</span>
                  <span className="text-sm font-medium text-gray-900">#{selectedBooking?.id}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                    {selectedBooking?.status}
                  </span>
                </div>
              </div>

              {/* Address section with improved styling */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-blue-600">
                  <MapPin className="h-4 w-4" />
                  <h4 className="font-medium">Alamat Pengiriman</h4>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg space-y-2">
                  {selectedBooking?.streamer?.full_address ? (
                    <div className="text-gray-600 text-sm whitespace-pre-line">
                      {selectedBooking.streamer.full_address}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm italic">Alamat tidak tersedia</p>
                  )}
                </div>
                <button
                  onClick={handleCopyAddress}
                  disabled={!selectedBooking?.streamer?.full_address || isCopied}
                  className={`w-full mt-4 py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 font-medium transition-all duration-300 ${
                    isCopied 
                      ? 'bg-green-500 hover:bg-green-600 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isCopied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Alamat sudah disalin
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Salin Alamat
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="border rounded-lg shadow-sm p-4 pb-4 mb-4 text-sm hover:shadow-md transition-shadow relative">
      <div className="flex justify-between items-center mb-3 pb-3 border-b">
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(booking.status)} flex items-center`}>
            {getStatusIcon(booking.status)}
            {booking.status}
          </span>
          {relatedBookings.length > 0 && (
            <button
              onClick={() => setShowRelatedBookings(!showRelatedBookings)}
              className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1"
            >
              <Calendar className="h-4 w-4" />
              {showRelatedBookings ? 'Hide' : 'Show'} {relatedBookings.length} related {relatedBookings.length === 1 ? 'booking' : 'bookings'}
            </button>
          )}
        </div>
        <span className="text-gray-500 text-sm">
          {formatBookingDate(booking.created_at)}
        </span>
      </div>
      
      <div className="flex items-start mb-3 pb-3 border-b">
        <Image
          src={booking.streamer?.image_url || '/default-avatar.png'}
          alt={`${booking.streamer?.first_name ?? ''} ${booking.streamer?.last_name ?? ''}`}
          width={80}
          height={80}
          className="rounded-full mr-4"
        />
        <div className="flex-grow">
          <h3 className="font-medium text-base mb-2">{`${booking.streamer?.first_name ?? 'Streamer'} ${booking.streamer?.last_name ?? ''}`}</h3>
          <p className="text-gray-600 mb-2">Livestreaming services on {booking.platform}</p>
          
          {/* Display time blocks grouped by date */}
          {Object.entries(bookingsByDate).map(([date, bookings]) => (
            <div key={date} className="mb-2">
              <div className="text-sm text-gray-500 mb-1">
                {formatBookingDate(date)}
              </div>
              {bookings.map((b: Booking) => (
                <div key={b.id} className="flex items-center mb-1">
                  <Clock className="w-4 h-4 mr-2 text-gray-400" />
                  <span className="text-base">
                    {formatBookingTime(b.start_time, b.timezone)} - {formatBookingTime(b.end_time, b.timezone)}
                  </span>
                </div>
              ))}
            </div>
          ))}
          
          <div className="flex items-center">
            <Star className="w-4 h-4 mr-2 text-yellow-400" />
            <span className="text-base">Rating: {isNaN(rating) ? 'N/A' : rating.toFixed(1)}</span>
          </div>
        </div>
      </div>
      
      {/* Related bookings section */}
      {showRelatedBookings && relatedBookings.length > 0 && (
        <div className="mt-4 space-y-3">
          <h4 className="font-medium text-gray-900">Related Bookings</h4>
          {relatedBookings.map((relatedBooking) => (
            <div key={relatedBooking.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden">
                  <Image
                    src={booking.streamer?.image_url || '/default-avatar.png'}
                    alt={`${booking.streamer?.first_name ?? ''} ${booking.streamer?.last_name ?? ''}`}
                    width={40}
                    height={40}
                    className="object-cover"
                  />
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {formatBookingDate(relatedBooking.start_time)}
                  </p>
                  <p className="text-sm text-gray-600">
                    {formatBookingTime(relatedBooking.start_time, relatedBooking.timezone)} - {formatBookingTime(relatedBooking.end_time, relatedBooking.timezone)}
                  </p>
                </div>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(relatedBooking.status)}`}>
                {getStatusIcon(relatedBooking.status)}
                {relatedBooking.status}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3 text-sm">
          <DollarSign className="h-4 w-4 text-gray-400" />
          <div className="flex flex-col">
            <span className="font-medium text-gray-900">
              Rp {booking.price.toLocaleString()}
            </span>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          {booking.status.toLowerCase() === 'completed' && !booking.items_received && (
            <Button 
              variant="default"
              size="sm" 
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => setIsRatingModalOpen(true)}
            >
              Rate Session
            </Button>
          )}
          {booking.status.toLowerCase() === 'accepted' && (
            <Button
              variant="default"
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => {
                setSelectedBooking(booking);
                setShowDeliveryInfo(true);
              }}
            >
              <MapPin className="h-4 w-4 mr-2" />
              Lihat Alamat
            </Button>
          )}
          {booking.status === 'reschedule_requested' && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="text-red-500 border-red-500 hover:bg-red-50"
                onClick={() => setIsCancelModalOpen(true)}
              >
                Cancel Request
              </Button>
              <Button
                variant="default"
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => setIsRescheduleModalOpen(true)}
              >
                Modify Schedule
              </Button>
            </>
          )}
        </div>
      </div>

      {isRatingModalOpen && (
        <RatingModal 
          isOpen={isRatingModalOpen} 
          onClose={() => setIsRatingModalOpen(false)} 
          bookingId={booking.id}
          streamerId={booking.streamer?.id ?? 0}
          streamerName={`${booking.streamer?.first_name ?? 'Streamer'} ${booking.streamer?.last_name ?? ''}`}
          streamerImage={booking.streamer?.image_url ?? ''}
          startDate={booking.start_time}
          endDate={booking.end_time}
          onSubmit={onRatingSubmit}
        />
      )}
      
      <CancelBookingModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        bookingId={booking.id}
        streamer_id={booking.streamer?.id}
        start_time={booking.start_time}
      />

      <RescheduleTimeModal
        isOpen={isRescheduleModalOpen}
        onClose={() => setIsRescheduleModalOpen(false)}
        onConfirm={handleReschedule}
        currentStartTime={booking.start_time}
        currentEndTime={booking.end_time}
        booking={booking}
      />

      <CancelConfirmationModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onConfirm={handleCancel}
        isSubmitting={isSubmittingCancel}
      />

      {showDeliveryInfo && selectedBooking && <DeliveryInfoCard />}
    </div>
  );
}

export default function ClientBookings(): JSX.Element {
  const router = useRouter();
  const [clientName, setClientName] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState('Upcoming');
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [showDeliveryInfo, setShowDeliveryInfo] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const bookingsPerPage = 10;

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending': return <Clock className="w-3 h-3" />;
      case 'accepted': return <CheckCircle className="w-3 h-3" />;
      case 'completed': return <Check className="w-3 h-3" />;
      case 'live': return <Radio className="w-3 h-3" />;
      case 'rejected': return <XCircle className="w-3 h-3" />;
      case 'cancelled': return <X className="w-3 h-3" />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending': return 'bg-blue-50 text-blue-700 border border-blue-200';
      case 'accepted': return 'bg-green-50 text-green-700 border border-green-200';
      case 'completed': return 'bg-indigo-50 text-indigo-700 border border-indigo-200';
      case 'live': return 'bg-red-50 text-red-700 border border-red-200';
      case 'rejected': return 'bg-gray-50 text-gray-700 border border-gray-200';
      case 'cancelled': return 'bg-gray-50 text-gray-700 border border-gray-200';
      default: return 'bg-gray-50 text-gray-700 border border-gray-200';
    }
  };

  const fetchClientData = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // Fetch client name
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('first_name')
          .eq('id', user.id)
          .single();
        
        if (userData) {
          setClientName(userData.first_name);
        } else if (userError) {
          console.error("Error fetching user data:", userError);
          toast.error("Failed to fetch user data");
        }

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
          toast.error("Failed to fetch bookings");
        } else if (bookingsData) {
          // Get unique streamer IDs. Guard against a null streamer join (a
          // deleted/unlinked streamer) so one orphaned booking can't throw and
          // blank out the client's entire bookings list.
          const streamerIds = Array.from(
            new Set(
              bookingsData
                .map((booking: any) => booking.streamer?.id)
                .filter((id: any) => id != null)
            )
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
            const averageRatings = (ratingsData || []).reduce((acc: Record<number, { sum: number; count: number }>, curr) => {
              if (!acc[curr.streamer_id]) {
                acc[curr.streamer_id] = { sum: 0, count: 0 };
              }
              acc[curr.streamer_id].sum += curr.rating;
              acc[curr.streamer_id].count += 1;
              return acc;
            }, {});

            // Add ratings to bookings
            const bookingsWithRatings: Booking[] = bookingsData.map((booking: any) => ({
              ...booking,
              streamer_id: booking.streamer?.id,
              streamer: {
                ...booking.streamer,
                rating: averageRatings[booking.streamer?.id]
                  ? (averageRatings[booking.streamer?.id].sum / averageRatings[booking.streamer?.id].count)
                  : 0
              }
            }));

            setBookings(bookingsWithRatings);
          }
        } else {
          setBookings([]);
        }
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error("Something went wrong while fetching data");
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

  // Filter bookings based on active tab
  const filteredBookings = useMemo(() => {
    return bookings.filter(booking => {
      const status = booking.status.toLowerCase();
      const bookingDate = new Date(booking.start_time);
      const now = new Date();
      
      switch (activeTab.toLowerCase()) {
        case 'upcoming':
          return ['accepted', 'pending'].includes(status) && bookingDate > now;
        case 'pending':
          return status === 'pending';
        case 'recurring':
          // Add logic for recurring bookings if needed
          return false;
        case 'past':
          return ['completed', 'rejected'].includes(status);
        case 'cancelled':
          return status === 'cancelled';
        default:
          return true;
      }
    });
  }, [bookings, activeTab]);

  // Update the pagination to use filtered bookings
  const indexOfLastBooking = currentPage * bookingsPerPage;
  const indexOfFirstBooking = indexOfLastBooking - bookingsPerPage;
  const currentBookings = filteredBookings.slice(indexOfFirstBooking, indexOfLastBooking);

  // Add grouping by date functionality
  const groupedBookings = useMemo(() => {
    const groups = filteredBookings.reduce((acc, booking) => {
      const dateKey = format(new Date(booking.start_time), 'yyyy-MM-dd');
      if (!acc[dateKey]) {
        acc[dateKey] = {
          date: new Date(booking.start_time),
          bookings: []
        };
      }
      acc[dateKey].bookings.push(booking);
      return acc;
    }, {} as Record<string, { date: Date; bookings: Booking[] }>);
    
    // Sort bookings by start time within each day group
    Object.values(groups).forEach(group => {
      group.bookings.sort((a, b) => {
        const aTime = new Date(a.start_time).getTime();
        const bTime = new Date(b.start_time).getTime();
        return aTime - bTime; // Sort from earliest to latest
      });
    });
    
    // Convert to array and sort by date
    return Object.values(groups).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [filteredBookings]);

  // Only paginate the grouped bookings
  const currentGroupedBookings = useMemo(() => {
    const allGroups = [...groupedBookings];
    const startIndex = (currentPage - 1) * 3; // Show 3 days per page
    const endIndex = startIndex + 3;
    return allGroups.slice(startIndex, endIndex);
  }, [groupedBookings, currentPage]);

  // Add state for collapsed day sections
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});

  // Toggle collapse for a specific day
  const toggleDayCollapse = (dateKey: string) => {
    setCollapsedDays(prev => ({
      ...prev,
      [dateKey]: !prev[dateKey]
    }));
  };

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  const handleStatusUpdate = (bookingId: number, newStatus: string) => {
    setBookings(prevBookings => 
      prevBookings.map(booking => 
        booking.id === bookingId 
          ? { ...booking, status: newStatus }
          : booking
      )
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return <div className="min-h-screen bg-[#faf96f]/10 p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-lg p-6">
        <p className="text-red-500 text-sm">Error: {error}</p>
      </div>
    </div>;
  }

  const tabs = ['Upcoming', 'Pending', 'Recurring', 'Past', 'Cancelled'];

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto bg-white rounded-xl shadow-lg relative">
        {isRefreshing && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm rounded-xl flex items-center justify-center z-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        )}

        {showDeliveryInfo && selectedBooking && (
          <>
            {/* Dark overlay backdrop */}
            <div 
              className="fixed inset-0 bg-black/50 transition-opacity z-40"
              onClick={() => setShowDeliveryInfo(false)}
            />
            
            {/* Centered card */}
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-200">
                <div className="p-4">
                  {/* Header with close button */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="relative w-10 h-10 rounded-lg overflow-hidden">
                        <Image
                          src={selectedBooking.streamer.image_url || '/default-avatar.png'}
                          alt="Streamer"
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {selectedBooking.streamer.first_name} {selectedBooking.streamer.last_name?.charAt(0)}.
                        </h3>
                        <p className="text-sm text-gray-500">
                          Rp {selectedBooking.price?.toLocaleString('id-ID')}/jam
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setShowDeliveryInfo(false)}
                      className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                    >
                      <XCircle className="h-5 w-5 text-gray-400" />
                    </button>
                  </div>

                  {/* Booking ID */}
                  <div className="flex items-center gap-2 mb-4 bg-blue-50 p-2 rounded-lg">
                    <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-3.5 w-3.5 text-blue-600" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Booking ID:</span>
                      <span className="text-sm font-medium text-gray-900">#{selectedBooking.id}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                        Accepted
                      </span>
                    </div>
                  </div>

                  {/* Address section with improved styling */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-blue-600">
                      <MapPin className="h-4 w-4" />
                      <h4 className="font-medium">Alamat Pengiriman</h4>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg space-y-2">
                      <p className="font-medium text-gray-900">{selectedBooking.streamer.full_address}</p>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedBooking.streamer.full_address);
                        toast.success("Alamat berhasil disalin!");
                      }}
                      className="w-full mt-4 py-2.5 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 font-medium"
                    >
                      <Copy className="h-4 w-4" />
                      Salin Alamat
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="p-6 border-b">
          <div className="flex items-center gap-4">
            <Button 
              onClick={() => router.push('/protected')} 
              variant="ghost" 
              size="lg"
              className="text-gray-600 hover:text-gray-800 p-0"
            >
              <ChevronLeft className="w-6 h-6" />
            </Button>
            <div className="flex items-center justify-between flex-grow">
              <h1 className="text-2xl font-semibold">Salda Booking Management</h1>
              <Button 
                onClick={refreshBookings} 
                size="sm" 
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="mb-6">
            <p className="text-gray-600">Manage and track all your Salda streaming sessions in one place.</p>
          </div>

          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {tabs.map((tab) => (
              <Button
                key={tab}
                onClick={() => setActiveTab(tab)}
                variant={activeTab === tab ? "default" : "outline"}
                className={`${
                  activeTab === tab 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                    : 'hover:bg-blue-50 border-blue-200'
                } rounded-full px-6`}
              >
                {tab}
              </Button>
            ))}
          </div>

          <div className="space-y-8">
            {currentGroupedBookings.length > 0 ? (
              currentGroupedBookings.map((group) => {
                const dateKey = format(group.date, 'yyyy-MM-dd');
                const isCollapsed = collapsedDays[dateKey];
                
                return (
                  <div key={dateKey} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                    {/* Day Header with expand/collapse */}
                    <button 
                      onClick={() => toggleDayCollapse(dateKey)}
                      className="w-full text-left bg-gradient-to-r from-blue-50 to-indigo-50 p-4 flex items-center justify-between cursor-pointer border-b hover:from-blue-100 hover:to-indigo-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-white rounded-full p-1.5 w-10 h-10 flex items-center justify-center shadow-sm">
                          <Calendar className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            {format(group.date, 'EEEE, MMMM d, yyyy')}
                          </h3>
                          <p className="text-sm text-gray-600">
                            {group.bookings.length} booking{group.bookings.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <div className={`transform transition-transform ${isCollapsed ? 'rotate-180' : ''}`}>
                        <ChevronDown className="w-5 h-5 text-gray-500" />
                      </div>
                    </button>
                    
                    {/* Bookings for this day */}
                    {!isCollapsed && (
                      <div className="divide-y">
                        {group.bookings.map((booking) => (
                          <div key={booking.id} className="p-4 hover:bg-gray-50 transition-colors">
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex items-center gap-4">
                                <Image
                                  src={booking.streamer?.image_url || '/default-avatar.png'}
                                  alt={`${booking.streamer?.first_name ?? ''} ${booking.streamer?.last_name ?? ''}`}
                                  width={60}
                                  height={60}
                                  className="rounded-full"
                                />
                                <div>
                                  <h3 className="font-medium text-lg">{`${booking.streamer?.first_name ?? 'Streamer'} ${booking.streamer?.last_name ?? ''}`}</h3>
                                  <p className="text-gray-600 text-sm">{booking.platform}</p>
                                </div>
                              </div>
                              <span className={`px-3 py-1 rounded-full text-sm flex items-center gap-1.5 ${getStatusColor(booking.status)}`}>
                                {getStatusIcon(booking.status)}
                                {booking.status}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                              <div className="flex items-center gap-2">
                                <Clock className="w-5 h-5 text-blue-600" />
                                <div>
                                  <p className="text-sm text-gray-600">Schedule</p>
                                  <p className="font-medium">
                                    {formatBookingTime(booking.start_time, booking.timezone)} - {formatBookingTime(booking.end_time, booking.timezone)}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Star className="w-5 h-5 text-yellow-400" />
                                <div>
                                  <p className="text-sm text-gray-600">Streamer Rating</p>
                                  <p className="font-medium">{isNaN(parseFloat(booking.streamer?.rating as unknown as string)) ? 'N/A' : parseFloat(booking.streamer?.rating as unknown as string).toFixed(1)}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <DollarSign className="w-5 h-5 text-blue-600" />
                                <div>
                                  <p className="text-sm text-gray-600">Session Price</p>
                                  <div className="flex flex-col">
                                    {booking.voucher_usage?.[0]?.discount_applied ? (
                                      <>
                                        <span className="line-through text-gray-400 text-sm">
                                          Rp {booking.price.toLocaleString()}
                                        </span>
                                        <span className="font-medium text-green-600">
                                          Rp {(booking.voucher_usage[0].final_price).toLocaleString()}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="font-medium text-gray-900">
                                        Rp {booking.price.toLocaleString()}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="flex gap-2 justify-end">
                              {booking.status.toLowerCase() === 'completed' && !booking.items_received && (
                                <Button 
                                  variant="default"
                                  size="sm" 
                                  className="bg-blue-600 hover:bg-blue-700 text-white"
                                  onClick={() => setIsRatingModalOpen(true)}
                                >
                                  Rate Session
                                </Button>
                              )}
                              {booking.status.toLowerCase() === 'accepted' && (
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="bg-blue-600 hover:bg-blue-700 text-white"
                                  onClick={() => {
                                    setSelectedBooking(booking);
                                    setShowDeliveryInfo(true);
                                  }}
                                >
                                  <MapPin className="h-4 w-4 mr-2" />
                                  Lihat Alamat
                                </Button>
                              )}
                              {booking.status === 'reschedule_requested' && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-red-500 border-red-500 hover:bg-red-50"
                                    onClick={() => setIsCancelModalOpen(true)}
                                  >
                                    Cancel Request
                                  </Button>
                                  <Button
                                    variant="default"
                                    size="sm"
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                    onClick={() => setIsRescheduleModalOpen(true)}
                                  >
                                    Modify Schedule
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500">No streaming sessions found for this category.</p>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-between items-center">
            <Button
              onClick={() => paginate(currentPage - 1)}
              disabled={currentPage === 1}
              variant="outline"
              className="border-blue-200 hover:bg-blue-50"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="text-sm font-medium">
              Page {currentPage} of {Math.max(1, Math.ceil(groupedBookings.length / 3))}
            </span>
            <Button
              onClick={() => paginate(currentPage + 1)}
              disabled={currentPage >= Math.ceil(groupedBookings.length / 3)}
              variant="outline"
              className="border-blue-200 hover:bg-blue-50"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
