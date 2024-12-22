"use client";

import { useEffect, useState, useCallback } from 'react';
import { createClient } from "@/utils/supabase/client";
import { format, differenceInHours, isBefore, startOfDay, isSameDay } from 'date-fns';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Clock, DollarSign, Star, Info, RefreshCw, X, XCircle } from 'lucide-react';
import Image from 'next/image';
import RatingModal from '@/components/rating-modal';
import { useRouter } from 'next/navigation';
import CancelBookingModal from '@/components/cancel-booking-modal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "react-hot-toast";
import { BookingCalendar } from '@/components/booking-calendar';

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
  streamer: {
    id: number;
    first_name: string;
    last_name: string;
    platform: string;
    rating?: number;
    image_url: string;
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

      // Create notification for streamer
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: booking.streamer_id,
          type: 'reschedule_request',
          message: `Client has requested to reschedule booking #${booking.id} to ${format(startTime, 'MMM d, yyyy HH:mm')} - ${format(endTime, 'HH:mm')}`,
          booking_id: booking.id,
          created_at: new Date().toISOString(),
          is_read: false
        });

      if (notificationError) {
        console.error('Error creating notification:', notificationError);
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

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'accepted': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      case 'live': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  console.log('Booking status:', booking.status); // Add this line for debugging

  // Parse the rating to ensure it's a number
  const rating = parseFloat(booking.streamer.rating as unknown as string);

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

      // Create notification for streamer
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: booking.streamer_id,
          type: 'new_booking',
          message: `Client has rescheduled booking #${booking.id} to ${format(startTime, 'MMM d, yyyy HH:mm')} - ${format(endTime, 'HH:mm')}. Please review and accept/reject.`,
          booking_id: booking.id,
          created_at: new Date().toISOString(),
          is_read: false,
          streamer_id: booking.streamer_id
        });

      if (notificationError) {
        console.error('Error creating notification:', notificationError);
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

      // Create notification for streamer
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: booking.streamer_id,
          message: `Client telah membatalkan permintaan reschedule dengan alasan: ${reason}`,
          type: 'reschedule_cancelled',
          booking_id: booking.id,
          created_at: new Date().toISOString(),
          is_read: false
        });

      if (notificationError) {
        console.error('Error creating notification:', notificationError);
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
  const discountAmount = booking.voucher_usage?.[0]?.discount_applied;
  const hasDiscount = discountAmount && discountAmount > 0;

  return (
    <div className="border rounded-lg shadow-sm p-4 pb-4 mb-4 text-sm hover:shadow-md transition-shadow relative">
      {/* Top layer - Status and date position switched */}
      <div className="flex justify-between items-center mb-3 pb-3 border-b">
        <div className="flex items-center gap-1">
          <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(booking.status)} flex items-center`}>
            {booking.status}
            <div className="group relative inline-block ml-1">
              <div className="rounded-full">
                <Info className="h-3 w-3 text-current opacity-70 stroke-[2.5]" />
              </div>
              <div className="invisible group-hover:visible absolute z-10 w-72 bg-black text-white text-sm rounded-md p-3 left-0 mt-1">
                {getStatusInfo(booking.status)}
              </div>
            </div>
          </span>
        </div>
        <span className="text-gray-500 text-sm">{format(new Date(booking.created_at), 'MMM d, yyyy HH:mm')}</span>
      </div>
      
      {/* Middle layer - Removed duplicate name */}
      <div className="flex items-start mb-3 pb-3 border-b">
        <Image 
          src={booking.streamer.image_url || '/default-avatar.png'}
          alt={`${booking.streamer.first_name} ${booking.streamer.last_name}`}
          width={80}
          height={80}
          className="rounded-full mr-4"
        />
        <div className="flex-grow">
          <h3 className="font-medium text-base mb-2">{`${booking.streamer.first_name} ${booking.streamer.last_name}`}</h3>
          <p className="text-gray-600 mb-2">Livestreaming services on {booking.platform}</p>
          <div className="flex items-center mb-2">
            <Clock className="w-4 h-4 mr-2 text-gray-400" />
            <span className="text-base">{`${format(new Date(booking.start_time), 'HH:mm')} - ${format(new Date(booking.end_time), 'HH:mm')}`}</span>
          </div>
          <div className="flex items-center">
            <Star className="w-4 h-4 mr-2 text-yellow-400" />
            <span className="text-base">Rating: {isNaN(rating) ? 'N/A' : rating.toFixed(1)}</span>
          </div>
        </div>
      </div>
      
      {/* Bottom layer - Updated with new buttons */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3 text-sm">
          <DollarSign className="h-4 w-4 text-gray-400" />
          <div className="flex flex-col">
            {hasDiscount ? (
              <>
                <span className="line-through text-gray-400">
                  Rp {booking.price.toLocaleString()}
                </span>
                <span className="font-medium text-green-600">
                  Rp {displayPrice.toLocaleString()}
                  <span className="text-xs ml-2">
                    (Saved Rp {discountAmount.toLocaleString()})
                  </span>
                </span>
              </>
            ) : (
              <span className="font-medium">
                Rp {displayPrice.toLocaleString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {booking.status.toLowerCase() === 'completed' && (
            <Button 
              variant="outline" 
              size="sm" 
              className="text-sm py-2 px-4 bg-gradient-to-r from-blue-600 to-blue-800 text-white hover:from-blue-700 hover:to-blue-900 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 hover:text-white"
              onClick={() => setIsRatingModalOpen(true)}
            >
              Give Rating
            </Button>
          )}
        </div>
      </div>

      {/* Add these buttons only for reschedule_requested status */}
      {booking.status === 'reschedule_requested' && (
        <div className="flex flex-row gap-2 mt-4 sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-initial text-xs sm:text-sm h-9 sm:h-10 px-4 border border-red-500 text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors font-medium"
            onClick={() => setIsCancelModalOpen(true)}
          >
            Batalkan
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-initial text-xs sm:text-sm h-9 sm:h-10 px-4 border border-[#E23744] text-[#E23744] hover:bg-[#E23744]/5 hover:text-[#E23744] transition-colors font-medium"
            onClick={() => setIsRescheduleModalOpen(true)}
          >
            Reschedule
          </Button>
        </div>
      )}

      {/* Modals */}
      {isRatingModalOpen && (
        <RatingModal 
          isOpen={isRatingModalOpen} 
          onClose={() => setIsRatingModalOpen(false)} 
          bookingId={booking.id}
          streamerId={booking.streamer.id}
          streamerName={`${booking.streamer.first_name} ${booking.streamer.last_name}`}
          streamerImage={booking.streamer.image_url}
          startDate={booking.start_time}
          endDate={booking.end_time}
          onSubmit={onRatingSubmit}
        />
      )}
      
      <CancelBookingModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        bookingId={booking.id}
        streamer_id={booking.streamer.id}
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
    </div>
  );
}

export default function ClientBookings() {
  const router = useRouter();
  const [clientName, setClientName] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const bookingsPerPage = 10;

  const fetchClientData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
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
        setError("Failed to fetch user data");
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
            image_url
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
        setError("Failed to fetch bookings");
      } else if (bookingsData) {
        // Get unique streamer IDs
        const streamerIds = Array.from(
          new Set(
            bookingsData.map((booking: any) => booking.streamer.id)
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
          // Calculate average ratings with proper typing
          const averageRatings = (ratingsData || []).reduce((acc: Record<number, { sum: number; count: number }>, curr) => {
            if (!acc[curr.streamer_id]) {
              acc[curr.streamer_id] = { sum: 0, count: 0 };
            }
            acc[curr.streamer_id].sum += curr.rating;
            acc[curr.streamer_id].count += 1;
            return acc;
          }, {});

          // Add ratings to bookings with proper typing
          const bookingsWithRatings: Booking[] = bookingsData.map((booking: any) => ({
            ...booking,
            streamer_id: booking.streamer.id,
            streamer: {
              ...booking.streamer,
              rating: averageRatings[booking.streamer.id]
                ? (averageRatings[booking.streamer.id].sum / averageRatings[booking.streamer.id].count)
                : 0
            }
          }));

          setBookings(bookingsWithRatings);
        }
      } else {
        setBookings([]);
      }
    } else {
      setError("User not authenticated");
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchClientData();
  }, [fetchClientData]);

  const refreshBookings = () => {
    fetchClientData();
  };

  const indexOfLastBooking = currentPage * bookingsPerPage;
  const indexOfFirstBooking = indexOfLastBooking - bookingsPerPage;
  const currentBookings = bookings.slice(indexOfFirstBooking, indexOfLastBooking);

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
    return <div className="container mx-auto p-4 text-sm">Loading...</div>;
  }

  if (error) {
    return <div className="container mx-auto p-4 text-red-500 text-sm">Error: {error}</div>;
  }

  return (
    <div className="container mx-auto px-4 max-w-3xl font-sans pt-12">
      <div className="mb-8 border-b pb-4">
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
            <h1 className="text-2xl">{clientName}'s Bookings</h1>
            <Button 
              onClick={refreshBookings} 
              size="sm" 
              variant="ghost"
              className="p-2"
            >
              <RefreshCw className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {currentBookings.map((booking) => (
          <BookingEntry 
            key={booking.id} 
            booking={booking} 
            onRatingSubmit={refreshBookings}
            onStatusUpdate={handleStatusUpdate}
          />
        ))}
        {bookings.length === 0 && (
          <p className="text-center mt-4 text-gray-500">No bookings found.</p>
        )}
      </div>

      <div className="mt-6 flex justify-between items-center">
        <Button
          onClick={() => paginate(currentPage - 1)}
          disabled={currentPage === 1}
          size="sm"
          variant="ghost"
          className="p-2"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="text-sm">Page {currentPage} of {Math.ceil(bookings.length / bookingsPerPage)}</span>
        <Button
          onClick={() => paginate(currentPage + 1)}
          disabled={indexOfLastBooking >= bookings.length}
          size="sm"
          variant="ghost"
          className="p-2"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
