"use client";

import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { baseFromTotal } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { signOutAction, acceptBooking, rejectBooking, startStream, endStream, acceptItems, requestReschedule } from "@/app/actions";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { format, isToday, isThisWeek, isThisMonth, isSameDay, parseISO, differenceInHours, addDays, addHours, parse, startOfDay, startOfWeek, endOfWeek } from 'date-fns';
import { Calendar, Clock, Monitor, DollarSign, MessageSquare, Link as LinkIcon, AlertTriangle, MapPin, Users, XCircle, Video, Settings, Loader2, Info, ExternalLink, ChevronRight, CheckCircle, Radio, Package, CheckSquare, Circle, X, ArrowRight, BadgeCheck, Store, Wallet } from 'lucide-react';
import Link from 'next/link';
import { ListingSections, MoneySections, PerformanceSection } from './money-sections';
import {
  milestoneProgress,
  streamerMilestones,
  type Milestone,
  type MilestoneId,
  type PublishableProfile,
} from "@/lib/milestones";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Navbar } from "@/components/ui/navbar";
import { streamerService, type StreamerStats, type StreamerGalleryPhoto } from "@/services/streamer/streamer-service";
import { format as formatDate } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import Image from 'next/image';
import { BookingCalendar, type BookingCalendarProps } from "@/components/booking-calendar";
import { Textarea } from "@/components/ui/textarea";
import { createNotification, createStreamNotifications, createItemReceivedNotification, type NotificationType } from "@/services/notification-service";
import { cn } from "@/lib/utils";

interface UserData {
  user_type: string;
  first_name: string;
  user_id?: string;
  streamer_id?: number;
}

interface Booking {
  id: number;
  client_id: string;
  client_first_name: string;
  client_last_name: string;
  streamer_id: number;
  start_time: string;
  end_time: string;
  platform: string;
  status: string;
  price: number;
  special_request?: string | null;
  stream_link?: string | null;
  sub_acc_link?: string | null;
  sub_acc_pass?: string | null;
  items_received?: boolean;
  items_received_at?: string | null;
  timezone?: string;
  created_at: string;
  client?: {
    first_name: string;
    last_name: string;
    image_url: string;
  };
  payment_group_id?: string;
  voucher_usage?: Array<{
    id: string;
    voucher_id: string;
    discount_applied: number;
    original_price: number;
    final_price: number;
    used_at: string;
  }>;
}

// Add these utility functions at the top of the file
const roundToNearestHour = (date: Date): Date => {
  const rounded = new Date(date);
  rounded.setMinutes(date.getMinutes() >= 30 ? 60 : 0);
  rounded.setSeconds(0);
  rounded.setMilliseconds(0);
  return rounded;
};

const calculateDuration = (start: Date, end: Date): number => {
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60));
};

const calculateBasePrice = (finalPrice: number): number => {
  return Math.round(baseFromTotal(finalPrice)); // recover base from tax-inclusive total
};

// Add this function at the top level of the file
/**
 * Rupiah, in full, with Indonesian thousands separators.
 *
 * This used to abbreviate: `Math.floor(price / 1000)` followed by a literal
 * "K". For 2.000.000 that produced "Rp 2000K" — a unit nobody uses, on the one
 * screen where a host checks what they are owed. It had no callers at all
 * before the redesign, so nothing had ever surfaced it; the "now" card and the
 * earnings chart are its first three.
 */
function formatPrice(price: number): string {
  return `Rp ${Math.round(price).toLocaleString('id-ID')}`;
}

function SubAccountLink({ link }: { link: string }) {
  return (
    <div className="mt-2 p-2 bg-surface-tint rounded-md text-xs">
      <p className="font-medium text-ink-body flex items-center">
        <LinkIcon className="h-3 w-3 mr-1" />
        Sub Account Link:
      </p>
      <a 
        href={link} 
        target="_blank" 
        rel="noopener noreferrer" 
        className="text-blue-600 hover:underline break-all"
      >
        {link}
      </a>
    </div>
  );
}

function ItemAcceptanceModal({ 
  isOpen, 
  onClose, 
  onConfirm 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onConfirm: (confirmed: boolean) => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleSubmit = async () => {
    setIsConfirming(true);
    try {
      await onConfirm(true);
    } catch (error) {
      console.error('Error confirming item acceptance:', error);
    } finally {
      setIsConfirming(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div 
        className="bg-surface rounded-panel w-full max-w-lg mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-hairline">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-title font-semibold text-ink">
              Konfirmasi penerimaan barang
            </h2>
            <button 
              onClick={onClose}
              className="text-ink-faint hover:text-ink-muted transition-colors"
              disabled={isConfirming}
            >
              <XCircle className="h-6 w-6" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Guidelines */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Info className="h-4 w-4 text-blue-600" />
              </div>
              <h4 className="text-ui font-medium text-ink">
                Panduan penerimaan barang
              </h4>
            </div>
            <ul className="space-y-3 pl-11">
              <li className="flex items-center gap-2 text-ink-muted">
                <div className="h-1.5 w-1.5 rounded-full bg-hairline-strong flex-shrink-0" />
                <span className="text-sm">Pastikan barang dalam kondisi baik dan sesuai dengan deskripsi</span>
              </li>
              <li className="flex items-center gap-2 text-ink-muted">
                <div className="h-1.5 w-1.5 rounded-full bg-hairline-strong flex-shrink-0" />
                <span className="text-sm">Periksa kelengkapan dan kualitas setiap item</span>
              </li>
              <li className="flex items-center gap-2 text-ink-muted">
                <div className="h-1.5 w-1.5 rounded-full bg-hairline-strong flex-shrink-0" />
                <span className="text-sm">Simpan foto kemasan dan isi paket sebagai dokumentasi</span>
              </li>
            </ul>
          </div>

          {/* Important Notice */}
          <div className="bg-surface-tint rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-surface-tint flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle className="h-3.5 w-3.5 text-ink-muted" />
              </div>
              <div>
                <p className="text-sm font-medium text-ink mb-1">Penting:</p>
                <p className="text-sm text-ink-muted leading-relaxed">
                  Pastikan kamu telah menyimpan foto bukti penerimaan barang sebelum melanjutkan. 
                  Foto ini diperlukan untuk dokumentasi dan perlindungan kamu sebagai streamer.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-surface-tint border-t border-hairline">
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              disabled={isConfirming}
              className="px-4 py-2 text-sm font-medium text-ink-body hover:text-ink transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleSubmit}
              disabled={isConfirming}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isConfirming ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Memproses...</span>
                </>
              ) : (
                'Konfirmasi Penerimaan'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RescheduleModal({ 
  isOpen, 
  onClose, 
  onConfirm,
  booking 
}: { 
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  booking: Booking;
}) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError('Alasan reschedule harus diisi');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm(reason);
    } catch (error) {
      console.error('Error submitting reschedule:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div 
        className="bg-surface rounded-panel w-full max-w-lg mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-hairline">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-title font-semibold text-ink">
              Pengajuan reschedule
            </h2>
            <button 
              onClick={onClose}
              className="text-ink-faint hover:text-ink-muted transition-colors"
              disabled={isSubmitting}
            >
              <XCircle className="h-6 w-6" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Guidelines */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Info className="h-4 w-4 text-blue-600" />
              </div>
              <h4 className="text-ui font-medium text-ink">
                Kebijakan reschedule
              </h4>
            </div>
            <ul className="space-y-3 pl-11">
              <li className="flex items-center gap-2 text-ink-muted">
                <div className="h-1.5 w-1.5 rounded-full bg-hairline-strong flex-shrink-0" />
                <span className="text-sm">Pengajuan reschedule akan mempengaruhi performa dan reputasi kamu sebagai streamer</span>
              </li>
              <li className="flex items-center gap-2 text-ink-muted">
                <div className="h-1.5 w-1.5 rounded-full bg-hairline-strong flex-shrink-0" />
                <span className="text-sm">Reschedule mendadak dapat mengurangi tingkat kepercayaan client</span>
              </li>
              <li className="flex items-center gap-2 text-ink-muted">
                <div className="h-1.5 w-1.5 rounded-full bg-hairline-strong flex-shrink-0" />
                <span className="text-sm">Pastikan kamu memiliki alasan yang kuat sebelum mengajukan reschedule</span>
              </li>
              <li className="flex items-center gap-2 text-ink-muted">
                <div className="h-1.5 w-1.5 rounded-full bg-hairline-strong flex-shrink-0" />
                <span className="text-sm">Pengajuan reschedule yang terlalu sering dapat mempengaruhi visibilitas profil kamu</span>
              </li>
            </ul>
          </div>

          {/* Reason Input */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-surface-tint flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle className="h-3.5 w-3.5 text-ink-muted" />
              </div>
              <div>
                <label htmlFor="reschedule-reason" className="block text-sm font-medium text-ink">
                  Alasan reschedule<span className="text-blue-600">*</span>
                </label>
                <textarea
                  id="reschedule-reason"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="Mohon jelaskan alasan kamu mengajukan reschedule..."
                  className={`mt-2 w-full min-h-[100px] p-3 text-sm text-ink rounded-lg border ${
                    error ? 'border-red-300 focus:ring-red-500' : 'border-hairline-input focus:ring-blue-500'
                  } focus:border-transparent focus:ring-2 bg-surface resize-none`}
                />
                {error && (
                  <p className="mt-1 text-xs text-red-600">{error}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-surface-tint border-t border-hairline">
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-ink-body hover:text-ink transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !reason.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Memproses...</span>
                </>
              ) : (
                'Konfirmasi'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// First, define the function type for stream handlers
type StreamHandler = () => void;

// Update the ScheduleCard component props interface
interface ScheduleCardProps {
  booking: Booking;
  onStreamStart: StreamHandler;
  onStreamEnd: StreamHandler;
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
}

// Add this before the ScheduleCard component
function StatusFlow({ status, itemsReceived }: { status: string; itemsReceived: boolean }) {
  const steps = [
    { 
      label: 'Barang Diterima', 
      completed: itemsReceived,
      current: !itemsReceived && status === 'accepted'
    },
    { 
      label: 'Start Live', 
      completed: status === 'live',
      current: itemsReceived && status === 'accepted'
    },
    { 
      label: 'End Live', 
      completed: status === 'completed',
      current: status === 'live'
    }
  ];

  return (
    <div className="flex items-center justify-center gap-2 mb-4">
      {steps.map((step, index) => (
        <div key={`step-${index}`} className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            step.completed ? 'bg-blue-600' : 
            step.current ? 'bg-blue-600 animate-pulse' : 
            'bg-surface-deep'
          }`} />
          <span className={`text-sm ${
            step.completed ? 'text-blue-600 font-medium' : 
            step.current ? 'text-blue-600' :
            'text-ink-faint'
          }`}>
            {step.label}
          </span>
          {index < steps.length - 1 && (
            <div className={`h-px w-12 ${
              steps[index].completed && steps[index + 1].completed 
                ? 'bg-blue-600' 
                : steps[index].completed 
                ? 'bg-brand'
                : 'bg-surface-deep'
            }`} />
          )}
        </div>
      ))}
    </div>
  );
}

interface RelatedBooking {
  id: number;
  start_time: string;
  end_time: string;
  timezone?: string;
}

interface PaymentGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking;
  relatedBookings: Booking[];
}

function PaymentGroupModal({ isOpen, onClose, booking, relatedBookings }: PaymentGroupModalProps) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div 
        className="bg-surface rounded-panel w-full max-w-lg mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-hairline">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-title font-semibold text-ink">
              Grup booking
            </h2>
            <button 
              onClick={onClose}
              className="text-ink-faint hover:text-ink-muted transition-colors"
            >
              <XCircle className="h-6 w-6" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Users className="h-4 w-4 text-blue-600" />
              </div>
              <h4 className="text-base font-medium text-ink">
                Booking dari {booking.client_first_name} {booking.client_last_name}
              </h4>
            </div>

            <div className="space-y-4">
              {[booking, ...relatedBookings]
                .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                .map((b, index) => (
                <div key={b.id} className="bg-surface-tint rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-ink">
                      Sesi {index + 1}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(b.status)}`}>
                      {b.status}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-ink-muted">
                      <Calendar className="h-4 w-4" />
                      <span>{formatBookingDate(b.start_time)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-ink-muted">
                      <Clock className="h-4 w-4" />
                      <span>
                        {formatBookingTime(b.start_time, b.timezone)} - {formatBookingTime(b.end_time, b.timezone)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScheduleCard({ booking, onStreamStart, onStreamEnd, setBookings }: ScheduleCardProps) {
  const [isStartLiveModalOpen, setIsStartLiveModalOpen] = useState(false);
  const [isLiveStreamModalOpen, setIsLiveStreamModalOpen] = useState(false);
  const [isItemAcceptanceModalOpen, setIsItemAcceptanceModalOpen] = useState(false);
  const [hasAcceptedItems, setHasAcceptedItems] = useState(booking.items_received || false);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [isPaymentGroupModalOpen, setIsPaymentGroupModalOpen] = useState(false);
  const [relatedBookings, setRelatedBookings] = useState<Booking[]>([]);
  const [streamLink, setStreamLink] = useState(booking.stream_link || '');
  const [isStarting, setIsStarting] = useState(false);

  // Fetch related bookings when component mounts
  useEffect(() => {
    if (booking.payment_group_id) {
      fetchRelatedBookings();
    }
  }, [booking]);

  // Fetch related bookings
  const fetchRelatedBookings = async () => {
    const supabase = createClient();
    
    try {
      const { data: relatedBookings, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('payment_group_id', booking.payment_group_id)
        .neq('id', booking.id)
        .order('start_time', { ascending: true });

      if (error) throw error;
      if (relatedBookings) {
        setRelatedBookings(relatedBookings);
      }
    } catch (error) {
      console.error('Error fetching related bookings:', error);
    }
  };

  const handleStartLive = async (newStreamLink: string) => {
    setIsStarting(true);
    try {
      if (!newStreamLink) {
        throw new Error('Link stream wajib diisi');
      }

      const result = await startStream(booking.id, newStreamLink);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      // Update local state
      setStreamLink(newStreamLink);
      setBookings(prev => prev.map(b => 
        b.id === booking.id 
          ? { ...b, status: 'live', stream_link: newStreamLink }
          : b
      ));

      // Close start modal and open live modal
      setIsStartLiveModalOpen(false);
      setIsLiveStreamModalOpen(true);
      onStreamStart();
      toast.success('Live stream berhasil dimulai');

    } catch (error) {
      console.error('Error starting stream:', error);
      toast.error('Gagal memulai live stream: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsStarting(false);
    }
  };

  // Remove duplicate handleStartLive function and keep other handlers
  const handleItemAcceptance = async (confirmed: boolean) => {
    if (!confirmed) {
      setIsItemAcceptanceModalOpen(false);
      return;
    }
    
    console.log("Starting item acceptance confirmation for booking:", booking.id);
    console.log("Initial booking state:", booking);
    
    try {
      // API call to confirm item acceptance
      const result = await acceptItems(booking.id);
      
      console.log("API call result:", result);
      
      if (!result.success) {
        throw new Error(result.error || 'Gagal mengkonfirmasi penerimaan barang');
      }

      // Update local state
      setHasAcceptedItems(true);
      setIsItemAcceptanceModalOpen(false);
      
      // Log state before update
      console.log("State before update:", setBookings);
      
      // Update bookings state
      setBookings(prev => {
        console.log("Previous bookings state:", prev);
        const updated = prev.map(b => 
          b.id === booking.id 
            ? { ...b, items_received: true, items_received_at: new Date().toISOString() }
            : b
        );
        console.log("Updated bookings state:", updated);
        return updated;
      });

      // Create notification for the client
      if (booking.client_id) {
        await createItemReceivedNotification({
          client_id: booking.client_id,
          streamer_id: booking.streamer_id,
          booking_id: booking.id,
          streamer_name: `${booking.client_first_name}`
        });
      }

      toast.success('Berhasil mengkonfirmasi penerimaan barang');
      
      console.log("Item acceptance confirmation completed successfully");
    } catch (error) {
      console.error('Error confirming item acceptance:', error);
      toast.error(error instanceof Error ? error.message : 'Gagal mengkonfirmasi penerimaan barang');
      
      // Reset loading state if needed
      setIsItemAcceptanceModalOpen(false);
      console.log("Item acceptance confirmation failed with error");
    }
  };

  const handleEndStream = async () => {
    try {
      const result = await endStream(booking.id);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      // Update local state
      setBookings(prev => prev.map(b => 
        b.id === booking.id 
          ? { ...b, status: 'completed' }
          : b
      ));

      setIsLiveStreamModalOpen(false);
      onStreamEnd();
      toast.success('Live stream berhasil diakhiri');
    } catch (error) {
      console.error('Error ending stream:', error);
      toast.error('Gagal mengakhiri live stream: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleReschedule = async (reason: string) => {
    try {
      const result = await requestReschedule(booking.id, reason);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      setIsRescheduleModalOpen(false);
      toast.success('Pengajuan reschedule berhasil dikirim');
    } catch (error) {
      console.error('Error requesting reschedule:', error);
      toast.error('Gagal mengajukan reschedule: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  return (
    <div className="bg-surface rounded-panel border border-hairline-input p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-surface-tint overflow-hidden">
            {booking.client?.image_url ? (
              <Image
                src={booking.client.image_url}
                alt={`${booking.client_first_name} ${booking.client_last_name}`}
                width={48}
                height={48}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-blue-100 text-blue-600">
                {booking.client_first_name?.[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <h3 className="font-medium text-ink">
              <span className="sm:hidden">{booking.client_first_name}</span>
              <span className="hidden sm:inline">{booking.client_first_name} {booking.client_last_name}</span>
            </h3>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <p className="text-sm text-ink-soft hidden sm:block">
                  {booking.platform} Livestreaming
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Monitor className="h-3 w-3 sm:h-4 sm:w-4 text-ink-faint" />
                  <span className="text-xs sm:text-sm text-ink-soft">{booking.platform}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1">
                {booking.payment_group_id && (
                  <span className="text-xs sm:text-sm text-blue-600 font-medium">
                    <span className="sm:hidden">G{relatedBookings.length + 1}</span>
                    <span className="hidden sm:inline">Group ({relatedBookings.length + 1} sessions)</span>
                  </span>
                )}
                {booking.voucher_usage && booking.voucher_usage.length > 0 && (
                  <div className="text-[10px] sm:text-xs bg-brand-tint text-brand-deep border border-brand-line px-2 py-0.5 rounded-chip font-semibold">
                    <span className="sm:hidden">V | {Math.round(booking.voucher_usage[0].discount_applied / 1000)}K</span>
                    <span className="hidden sm:inline">Voucher | Rp {booking.voucher_usage[0].discount_applied.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className={`px-3 py-1.5 rounded-lg text-sm font-medium ${getStatusColor(booking.status)}`}>
          <span className="sm:hidden">{booking.status === 'completed' ? 'Selesai' : booking.status}</span>
          <span className="hidden sm:inline">{booking.status}</span>
        </div>
      </div>

      {/* Single Time Block Display */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-ink-faint" />
            <span className="text-sm text-ink-soft">
              <span className="sm:hidden">{format(new Date(booking.start_time), 'HH:mm')}-{format(new Date(booking.end_time), 'HH:mm')}</span>
              <span className="hidden sm:inline">{format(new Date(booking.start_time), 'HH:mm')} - {format(new Date(booking.end_time), 'HH:mm')}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-ink-faint" />
            <span className="text-sm text-ink-soft">
              <span className="sm:hidden">{format(new Date(booking.start_time), 'd MMM yyyy')}</span>
              <span className="hidden sm:inline">{format(new Date(booking.start_time), 'EEEE, d MMMM yyyy')}</span>
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-base font-medium text-ink flex flex-col items-end">
            <span className="text-ink">
              <span className="sm:hidden">Rp {booking.price >= 1000 ? (booking.price / 1000).toFixed(0) + 'K' : booking.price}</span>
              <span className="hidden sm:inline">Rp {booking.price.toLocaleString()}</span>
            </span>
          </div>
          <span className="text-xs text-ink-soft">
            <span className="sm:hidden">{differenceInHours(new Date(booking.end_time), new Date(booking.start_time))}h</span>
            <span className="hidden sm:inline">{differenceInHours(new Date(booking.end_time), new Date(booking.start_time))} jam</span>
          </span>
        </div>
      </div>

      {/* Payment Group Indicator */}
      {booking.payment_group_id && relatedBookings.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setIsPaymentGroupModalOpen(true)}
            className="w-full flex items-center justify-between px-4 py-2 bg-blue-50 rounded-lg text-sm text-blue-600 hover:bg-blue-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="sm:hidden">Grup ({relatedBookings.length + 1})</span>
              <span className="hidden sm:inline">Bagian dari grup booking ({relatedBookings.length + 1} sesi)</span>
            </div>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Special Request Section */}
      {booking.special_request && (
        <div className="mb-6 p-4 bg-surface-tint rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium text-ink-body">
              <span className="sm:hidden">Request</span>
              <span className="hidden sm:inline">Special Request</span>
            </span>
          </div>
          <p className="text-sm text-ink-muted">
            <span className="sm:hidden">
              {booking.special_request.length > 30 
                ? booking.special_request.substring(0, 30) + '...' 
                : booking.special_request}
            </span>
            <span className="hidden sm:inline">{booking.special_request}</span>
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2 pt-4 border-t border-dashed border-hairline-input">
        {booking.status === 'live' ? (
          <button
            onClick={() => setIsLiveStreamModalOpen(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition-colors text-sm"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-surface animate-pulse" />
            Akhiri Live Stream
          </button>
        ) : booking.status === 'accepted' && (
          !hasAcceptedItems ? (
            <button
              onClick={() => setIsItemAcceptanceModalOpen(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              Konfirmasi Penerimaan Barang
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsRescheduleModalOpen(true)}
                className="px-3 py-1.5 border border-hairline-strong text-ink-body rounded-lg hover:bg-surface-tint transition-colors text-sm"
              >
                <Calendar className="h-3.5 w-3.5 mr-1.5 inline-block" />
                Reschedule
              </button>
              <button
                onClick={() => setIsStartLiveModalOpen(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
              >
                <Radio className="h-3.5 w-3.5" />
                Mulai Live Stream
              </button>
            </div>
          )
        )}
        {booking.status === 'pending' && (
          <div className="flex items-center gap-2">
            <div className="flex-1 text-sm text-amber-600">
              <Clock className="h-4 w-4 inline-block mr-1.5" />
              Waiting for approval
            </div>
            <button
              onClick={() => setIsPaymentGroupModalOpen(true)}
              className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors text-sm"
            >
              Lihat Detail
            </button>
          </div>
        )}
        {booking.status === 'completed' && (
          <div className="flex items-center gap-2">
            <div className="text-sm text-green-600">
              <CheckCircle className="h-4 w-4 inline-block mr-1.5" />
              <span className="sm:hidden">Selesai</span>
              <span className="hidden sm:inline">Session Completed</span>
            </div>
            <button
              onClick={() => setIsPaymentGroupModalOpen(true)}
              className="px-3 py-1.5 bg-surface-tint text-ink-body border border-hairline-input rounded-lg hover:bg-surface-tint transition-colors text-sm"
            >
              <span className="sm:hidden">Detail</span>
              <span className="hidden sm:inline">Lihat Detail</span>
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      <StartLiveModal
        isOpen={isStartLiveModalOpen}
        onClose={() => setIsStartLiveModalOpen(false)}
        onConfirm={handleStartLive}
        isStarting={isStarting}
      />

      <ItemAcceptanceModal
        isOpen={isItemAcceptanceModalOpen}
        onClose={() => setIsItemAcceptanceModalOpen(false)}
        onConfirm={handleItemAcceptance}
      />

      <RescheduleModal
        isOpen={isRescheduleModalOpen}
        onClose={() => setIsRescheduleModalOpen(false)}
        onConfirm={handleReschedule}
        booking={booking}
      />

      <PaymentGroupModal
        isOpen={isPaymentGroupModalOpen}
        onClose={() => setIsPaymentGroupModalOpen(false)}
        booking={booking}
        relatedBookings={relatedBookings}
      />

      {isLiveStreamModalOpen && (
        <LiveStreamModal
          isOpen={isLiveStreamModalOpen}
          onClose={() => setIsLiveStreamModalOpen(false)}
          booking={booking}
          streamLink={streamLink}
          onEndStream={handleEndStream}
        />
      )}
    </div>
  );
}

function UpcomingSchedule({ bookings, onStreamStart, onStreamEnd, setBookings }: { 
  bookings: Booking[];
  onStreamStart: StreamHandler;
  onStreamEnd: StreamHandler;
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
}) {
  const [statusFilter, setStatusFilter] = useState<string>('Diterima');

  // Helper function for status indicator colors
  const getStatusIndicatorColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'accepted':
      case 'diterima':
        return 'bg-green-500';
      case 'item received':
      case 'barang diterima':
      case 'item_received':
        return 'bg-blue-500';
      case 'live started':
      case 'live dimulai':
      case 'live':
        return 'bg-red-500';
      case 'completed':
      case 'selesai':
        return 'bg-purple-500';
      default:
        return 'bg-surface-tint0';
    }
  };

  // Filter bookings based on status
  const filteredBookings = useMemo(() => {
    console.log("Filtering bookings for status:", statusFilter);
    console.log("Total bookings before filtering:", bookings.length);
    
    // Log bookings with items_received=true to debug
    const itemsReceivedBookings = bookings.filter(b => 
      b.status.toLowerCase() === 'accepted' && b.items_received === true
    );
    console.log("Bookings with items_received=true:", itemsReceivedBookings.length);
    
    // If item_received filter is selected, show only accepted bookings with items_received=true
    if (statusFilter === 'Barang Diterima') {
      const filtered = bookings.filter(booking => 
        booking.status.toLowerCase() === 'accepted' && booking.items_received === true
      );
      console.log("Filtered for Barang Diterima:", filtered.length);
      return filtered;
    }
    
    // For other statuses, filter normally
    return bookings.filter(booking => {
      if (statusFilter === 'Live Dimulai') {
        return booking.status.toLowerCase() === 'live';
      }
      
      // Map Indonesian status to English database status
      const statusMapping: Record<string, string> = {
        'Diterima': 'accepted',
        'Selesai': 'completed'
      };
      
      const dbStatus = statusMapping[statusFilter] || statusFilter.toLowerCase();
      
      // For "Diterima" tab, explicitly exclude items_received=true bookings
      if (statusFilter === 'Diterima') {
        const result = booking.status.toLowerCase() === dbStatus && booking.items_received !== true;
        return result;
      }
      
      return booking.status.toLowerCase() === dbStatus;
    });
  }, [bookings, statusFilter]);

  // Update the ScheduleCard mapping to include type safety
  const renderScheduleCards = useCallback((bookings: Booking[]) => {
    // Filter out duplicate bookings based on booking ID
    const uniqueBookings = bookings.filter((booking, index, self) =>
      index === self.findIndex((b) => b.id === booking.id)
    );

    return uniqueBookings.map((booking) => (
      <ScheduleCard
        key={booking.id}
        booking={booking}
        onStreamStart={onStreamStart}
        onStreamEnd={onStreamEnd}
        setBookings={setBookings}
      />
    ));
  }, [onStreamStart, onStreamEnd, setBookings]);

  // Count bookings by status for UI display
  const statusCounts = useMemo(() => {
    console.log("Calculating status counts for bookings:", bookings.length);
    
    const counts: Record<string, number> = {};
    
    // Count accepted bookings
    const acceptedCount = bookings.filter(b => {
      const isAccepted = b.status.toLowerCase() === 'accepted';
      const hasNoItemsReceived = !b.items_received;
      return isAccepted && hasNoItemsReceived;
    }).length;
    counts['Diterima'] = acceptedCount;
    console.log("Diterima count (accepted without items_received):", acceptedCount);
    
    // Count accepted bookings with items received
    const itemReceivedCount = bookings.filter(b => 
      b.status.toLowerCase() === 'accepted' && b.items_received === true
    ).length;
    counts['Barang Diterima'] = itemReceivedCount;
    console.log("Barang Diterima count (accepted with items_received):", itemReceivedCount);
    
    // Count live bookings
    const liveCount = bookings.filter(b => b.status.toLowerCase() === 'live').length;
    counts['Live Dimulai'] = liveCount;
    console.log("Live Dimulai count:", liveCount);
    
    // Count completed bookings
    const completedCount = bookings.filter(b => b.status.toLowerCase() === 'completed').length;
    counts['Selesai'] = completedCount;
    console.log("Selesai count:", completedCount);
    
    console.log("Final counts:", counts);
    return counts;
  }, [bookings]);

  // List of statuses to display (ordered as requested). "Selesai" is not here:
  // finished sessions have their own section, and a tab that repeats it makes
  // this list longer without making it more useful.
  const displayStatuses = ['Diterima', 'Barang Diterima', 'Live Dimulai'];

  return (
    <div className="w-full">
      {/* Status-based filter tabs - Enhanced UI */}
      <div className="bg-surface border border-hairline-input rounded-lg overflow-hidden mb-6">
        <div className="grid grid-cols-3 gap-1">
          {displayStatuses.map((status) => {
            // Determine icon for each status
            let StatusIcon;
            switch(status) {
              case 'Diterima':
                StatusIcon = CheckCircle;
                break;
              case 'Barang Diterima':
                StatusIcon = Package;
                break;
              case 'Live Dimulai':
                StatusIcon = Video;
                break;
              case 'Selesai':
                StatusIcon = CheckSquare;
                break;
              default:
                StatusIcon = Circle;
            }
            
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`relative flex flex-col items-center justify-center py-3 sm:py-4 transition-all ${
                  statusFilter === status
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                    : 'text-ink-body hover:bg-surface-tint border-b-2 border-transparent'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 mb-1 relative group">
                  <StatusIcon className={`h-6 w-6 sm:h-5 sm:w-5 ${
                    statusFilter === status ? 'text-blue-600' : 'text-ink-soft'
                  }`} />
                  <span className="font-medium text-xs sm:text-sm hidden sm:inline whitespace-nowrap">{status}</span>
                  <div className="absolute bottom-full mb-2 hidden group-hover:block pointer-events-none z-10 sm:hidden">
                    <div className="bg-ink text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                      {status}
                    </div>
                    <div className="w-2 h-2 bg-ink transform rotate-45 mx-auto mt-[-4px]"></div>
                  </div>
                </div>
                <span className={`text-xs px-1.5 sm:px-2 py-0.5 rounded-full ${
                  statusFilter === status 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'bg-surface-tint text-ink-muted'
                }`}>
                  {statusCounts[status] || 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bookings list */}
      <div className="space-y-5">
        {filteredBookings.length > 0 ? (
          renderScheduleCards(filteredBookings)
        ) : (
          <div className="text-center py-10 px-6 bg-surface-tint rounded-lg border border-hairline-input">
            <div className="flex flex-col items-center justify-center">
              <Calendar className="h-10 w-10 text-ink-ghost mb-3" />
              <p className="text-ink-soft text-sm mb-1">
                Tidak ada jadwal dengan status <span className="font-medium">{statusFilter}</span>
              </p>
              <p className="text-ink-faint text-xs">
                Jadwal akan muncul di sini ketika ada perubahan status
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Add this new component for the rejection modal
function RejectionModal({ 
  isOpen, 
  onClose, 
  onConfirm 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setIsSubmitting(true);
    await onConfirm(reason);
    setIsSubmitting(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-surface rounded-panel w-full max-w-lg mx-4 overflow-hidden">
        <div className="p-6 border-b border-hairline">
          <h3 className="font-serif text-title font-semibold text-ink">Konfirmasi penolakan</h3>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="bg-yellow-50 rounded-lg p-4 text-sm text-yellow-800">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <span className="font-medium">Perhatian</span>
            </div>
            <p>Penolakan booking akan mempengaruhi performa dan reputasi kamu sebagai streamer.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason" className="text-sm font-medium text-ink-body">
              Alasan penolakan<span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
              placeholder="Mohon berikan alasan penolakan booking..."
              className="min-h-[100px] resize-none"
            />
          </div>
        </div>

        <div className="p-6 bg-surface-tint flex justify-end gap-3">
          <Button
            onClick={onClose}
            variant="outline"
            className="border-hairline-strong"
            disabled={isSubmitting}
          >
            Batal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!reason.trim() || isSubmitting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Memproses...
              </>
            ) : (
              'Konfirmasi Penolakan'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Update the BookingCard component props interface
interface BookingCardProps {
  booking: Booking;
  onAccept: (id: number) => void;
  onReject: (id: number, reason: string) => void;
}

// Update the BookingCard component
function BookingCard({ booking, onAccept, onReject }: BookingCardProps) {
  const [isRejectionModalOpen, setIsRejectionModalOpen] = useState(false);
  const [isPaymentGroupModalOpen, setIsPaymentGroupModalOpen] = useState(false);
  const [relatedBookings, setRelatedBookings] = useState<Booking[]>([]);

  useEffect(() => {
    if (booking.payment_group_id) {
      fetchRelatedBookings();
    }
  }, [booking]);

  const fetchRelatedBookings = async () => {
    const supabase = createClient();
    
    try {
      const { data: relatedBookings, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('payment_group_id', booking.payment_group_id)
        .neq('id', booking.id)
        .order('start_time', { ascending: true });

      if (error) throw error;
      if (relatedBookings) {
        setRelatedBookings(relatedBookings);
      }
    } catch (error) {
      console.error('Error fetching related bookings:', error);
    }
  };

  const handleReject = async (reason: string) => {
    await onReject(booking.id, reason);
    setIsRejectionModalOpen(false);
  };

  return (
    <div className="bg-surface rounded-panel border border-hairline transition-all duration-200 overflow-hidden">
      <div className="relative">
        {/* Top dotted border */}
        <div className="absolute top-0 left-4 right-4 h-px border-t-2 border-dashed border-hairline-input"></div>
        
        {/* Left circle cutout */}
        <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-[#faf9f6] rounded-full border border-hairline"></div>
        
        {/* Right circle cutout */}
        <div className="absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-[#faf9f6] rounded-full border border-hairline"></div>

        <div className="p-4 sm:p-6">
          {/* Header - Client Name, Route, and Group Indicator */}
          <div className="mb-4 sm:mb-6">
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-lg sm:text-xl font-bold text-ink">
                {booking.client_first_name} {booking.client_last_name}
              </h3>
              {booking.payment_group_id && (
                <button
                  onClick={() => setIsPaymentGroupModalOpen(true)}
                  className="flex items-center gap-1 px-2 py-1 text-xs sm:text-sm bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors"
                >
                  <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span>Group ({relatedBookings.length + 1} sessions)</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Monitor className="h-3 w-3 sm:h-4 sm:w-4 text-ink-faint" />
                <span className="text-xs sm:text-sm text-ink-soft">{booking.platform}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {booking.voucher_usage && booking.voucher_usage.length > 0 && (
                <div className="text-[10px] sm:text-xs bg-brand-tint text-brand-deep border border-brand-line px-2 py-0.5 rounded-chip font-semibold">
                  Voucher | Rp {booking.voucher_usage[0].discount_applied.toLocaleString()}
                </div>
              )}
            </div>
          </div>

          {/* Time Section */}
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-ink-faint" />
                <span className="text-xs sm:text-sm text-ink-soft">
                  {format(new Date(booking.start_time), 'HH:mm')} - {format(new Date(booking.end_time), 'HH:mm')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-ink-faint" />
                <span className="text-sm text-ink-soft">
                  <span className="sm:hidden">{format(new Date(booking.start_time), 'd MMM yyyy')}</span>
                  <span className="hidden sm:inline">{format(new Date(booking.start_time), 'EEEE, d MMMM yyyy')}</span>
                </span>
              </div>
            </div>
            <div className="text-right flex flex-col items-end">
              <div className="text-sm sm:text-base font-medium text-ink flex flex-col items-end">
                <span className="text-ink">
                  Rp {booking.price.toLocaleString()}
                </span>
              </div>
              <span className="text-xs text-ink-soft">
                {differenceInHours(new Date(booking.end_time), new Date(booking.start_time))} jam
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          {booking.status === 'pending' && (
            <div className="flex items-center justify-between pt-4 sm:pt-6 border-t border-dashed border-hairline-input">
              <button
                onClick={() => setIsRejectionModalOpen(true)}
                className="text-xs sm:text-sm text-red-600 hover:text-red-700 transition-colors font-medium"
              >
                Tolak
              </button>
              <button
                onClick={() => onAccept(booking.id)}
                className="px-4 sm:px-8 py-2 sm:py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium rounded-panel transition-colors"
              >
                Terima
              </button>
            </div>
          )}
        </div>
      </div>

      <RejectionModal
        isOpen={isRejectionModalOpen}
        onClose={() => setIsRejectionModalOpen(false)}
        onConfirm={handleReject}
      />

      <PaymentGroupBookingModal
        isOpen={isPaymentGroupModalOpen}
        onClose={() => setIsPaymentGroupModalOpen(false)}
        booking={booking}
        relatedBookings={relatedBookings}
        onAccept={onAccept}
        onReject={(id, reason) => {
          setIsPaymentGroupModalOpen(false);
          setIsRejectionModalOpen(true);
        }}
      />
    </div>
  );
}

// Update the AnalyticsCard component for better mobile display
const AnalyticsCard = ({ title, value, trend }: { 
  title: string; 
  value: string; 
  trend?: number;
}) => (
  <div className="bg-surface rounded-lg sm:rounded-panel p-3 sm:p-4 md:p-6 transition-all duration-300">
    <div className="space-y-1 sm:space-y-2">
      <p className="text-[10px] sm:text-xs md:text-sm text-ink-soft">{title}</p>
      <div className="space-y-1">
        <h3 className="text-base sm:text-lg md:text-[28px] font-bold text-ink">{value}</h3>
        {trend !== undefined && (
          <p className={`text-[10px] sm:text-xs md:text-sm ${trend >= 0 ? 'text-[#4CAF50]' : 'text-red-500'}`}>
            • {trend > 0 ? '+' : ''}{trend}% dari bulan lalu
          </p>
        )}
      </div>
    </div>
  </div>
);

// Add this helper function for date formatting
const formatJoinDate = (date: string) => {
  try {
    return format(new Date(date), 'd MMMM yyyy', { locale: idLocale });
  } catch (error) {
    return '-';
  }
};

function adjustToIndonesiaTime(dateString: string) {
  const date = new Date(dateString);
  // Subtract 8 hours to adjust for Indonesia timezone
  date.setHours(date.getHours() - 8);
  return date;
}

interface BookingEntryProps {
  booking: Booking;
  onStatusUpdate: (bookingId: number, newStatus: string) => void;
}

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'pending': return 'bg-yellow-100 text-yellow-800';
    case 'accepted': return 'bg-green-100 text-green-800';
    case 'completed': return 'bg-blue-100 text-blue-800';
    case 'live': return 'bg-green-100 text-green-800';
    case 'rejected': return 'bg-red-100 text-red-800';
    default: return 'bg-surface-tint text-ink';
  }
};

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

function BookingEntry({ booking, onStatusUpdate }: BookingEntryProps) {
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);

  return (
    <div className="border rounded-lg p-4 pb-4 mb-4 text-sm transition-shadow relative">
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
        <span className="text-ink-soft text-sm">
          {format(adjustToIndonesiaTime(booking.created_at), 'MMM d, yyyy HH:mm')}
        </span>
      </div>
      
      <div className="flex items-start mb-3 pb-3 border-b">
        <Image 
          src={booking.client?.image_url || '/default-avatar.png'}
          alt={`${booking.client?.first_name || 'Client'} ${booking.client?.last_name || ''}`}
          width={80}
          height={80}
          className="rounded-full mr-4"
        />
        <div className="flex-grow">
          <h3 className="font-medium text-base mb-2">
            {`${booking.client?.first_name || 'Client'} ${booking.client?.last_name || ''}`}
          </h3>
          <p className="text-ink-muted mb-2">Livestreaming services on {booking.platform}</p>
          <div className="flex items-center mb-2">
            <Clock className="w-4 h-4 mr-2 text-ink-faint" />
            <span className="text-base">
              {`${format(adjustToIndonesiaTime(booking.start_time), 'HH:mm')} - ${format(adjustToIndonesiaTime(booking.end_time), 'HH:mm')}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveStreamModal({ 
  isOpen, 
  onClose,
  booking,
  streamLink,
  onEndStream
}: { 
  isOpen: boolean;
  onClose: () => void;
  booking: Booking;
  streamLink: string;
  onEndStream: () => void;
}) {
  const [isConfirmed, setIsConfirmed] = useState(false);

  // Format the end time
  const formattedEndTime = booking?.end_time ? 
    new Date(booking.end_time).toLocaleTimeString('id-ID', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false
    }) : '00:00';

  // Format the date
  const formattedDate = booking?.end_time ? 
    new Date(booking.end_time).toLocaleDateString('id-ID', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    }) : '';

  // Format price with IDR currency
  const formattedPrice = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(booking?.price || 0);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div 
        className="bg-surface rounded-frame w-full max-w-md mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header - Simple and elegant */}
        <div className="px-6 py-5 flex items-center justify-between border-b border-hairline">
          <div className="flex items-center gap-2.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
            <h2 className="text-lg font-semibold text-ink">
              Live Session Active
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="text-ink-faint hover:text-ink-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content - Clean and focused */}
        <div className="px-6 py-6">
          {/* Stream Details Card */}
          <div className="bg-surface-tint rounded-panel p-5 space-y-4">
            {/* Client Info */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink-soft">Client</span>
              <span className="text-sm font-medium text-ink">
                {booking.client_first_name} {booking.client_last_name}
              </span>
            </div>
            
            {/* Platform */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink-soft">Platform</span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-ink">{booking.platform}</span>
              </div>
            </div>

            {/* End Time */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink-soft">End Time</span>
              <div className="flex flex-col items-end">
                <span className="text-sm font-medium text-ink">{formattedEndTime}</span>
                <span className="text-xs text-ink-soft">{formattedDate}</span>
              </div>
            </div>

            {/* Price */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink-soft">Price</span>
              <span className="text-sm font-medium text-green-600">{formattedPrice}</span>
            </div>
            
            {/* Stream Link */}
            <div className="pt-3 border-t border-hairline-input">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-ink-soft">Stream URL</span>
                <a 
                  href={streamLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-1"
                >
                  Open link
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="bg-surface border border-hairline-input rounded-lg py-2 px-3 break-all">
                <code className="text-xs text-ink font-mono">{streamLink}</code>
              </div>
            </div>
          </div>

          {/* Confirmation Checkbox */}
          <div className="mt-5">
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="flex-shrink-0 mt-0.5">
                <input 
                  type="checkbox" 
                  checked={isConfirmed} 
                  onChange={(e) => setIsConfirmed(e.target.checked)}
                  className="h-5 w-5 rounded border-hairline-strong text-red-600 focus:ring-red-500 transition-colors cursor-pointer"
                />
              </div>
              <span className="text-sm text-ink-muted group-hover:text-ink transition-colors">
                Saya konfirmasi bahwa saya telah menyelesaikan seluruh sesi live streaming sesuai dengan durasi dan layanan yang diminta oleh client
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-5">
          <button
            onClick={onEndStream}
            disabled={!isConfirmed}
            className={`w-full py-3 ${isConfirmed ? 'bg-red-600 hover:bg-red-700' : 'bg-surface-deep cursor-not-allowed'} text-white font-medium rounded-panel transition-all flex items-center justify-center gap-2 ${isConfirmed ? 'hover:shadow' : ''}`}
          >
            Akhiri Live
          </button>
        </div>
      </div>
    </div>
  );
}

// Update the IDCard component for better mobile responsiveness
function IDCard({ userId, streamerId, firstName, stats, joinDate, rating, galleryPhotos, router }: { 
  userId: string;
  streamerId: number;
  firstName: string;
  stats: StreamerStats;
  joinDate: string;
  rating: number;
  galleryPhotos: StreamerGalleryPhoto[];
  router: any;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isGalleryModalOpen, setIsGalleryModalOpen] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(type);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openGalleryModal = (index: number = 0) => {
    setSelectedPhotoIndex(index);
    setIsGalleryModalOpen(true);
  };

  const handleNextPhoto = () => {
    setSelectedPhotoIndex((prev) => 
      prev === galleryPhotos.length - 1 ? 0 : prev + 1
    );
  };

  const handlePrevPhoto = () => {
    setSelectedPhotoIndex((prev) => 
      prev === 0 ? galleryPhotos.length - 1 : prev - 1
    );
  };

  return (
    <>
      <div className="bg-surface rounded-panel border border-hairline-input transition-all duration-300">
        <div className="p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
            {/* Left Column - Info */}
            <div className="flex-1 space-y-4 lg:space-y-6 lg:border-r lg:border-hairline lg:pr-12">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-ink">{firstName}</h3>
                    <p className="text-xs sm:text-sm text-ink-soft mt-1">Joined {format(new Date(joinDate), 'MMMM d, yyyy')}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm text-ink-muted">User ID:</span>
                      <code className="bg-surface-tint px-2 py-1 rounded text-xs sm:text-sm font-mono truncate max-w-[150px] sm:max-w-none">{userId}</code>
                      <button
                        onClick={() => copyToClipboard(userId, 'user')}
                        className="text-ink-faint hover:text-ink-muted"
                      >
                        {copiedId === 'user' ? (
                          <span className="text-green-500 text-xs">Copied!</span>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm text-ink-muted">Streamer ID:</span>
                      <code className="bg-surface-tint px-2 py-1 rounded text-xs sm:text-sm font-mono">{streamerId}</code>
                      <button
                        onClick={() => copyToClipboard(streamerId.toString(), 'streamer')}
                        className="text-ink-faint hover:text-ink-muted"
                      >
                        {copiedId === 'streamer' ? (
                          <span className="text-green-500 text-xs">Copied!</span>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Basic Stats */}
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                <div className="bg-surface-tint rounded-panel p-3 sm:p-4">
                  <p className="text-xs sm:text-sm text-ink-soft">Rating</p>
                  <p className="text-base sm:text-lg font-semibold mt-1">{rating.toFixed(1)}/5.0</p>
                </div>
                <div className="bg-surface-tint rounded-panel p-3 sm:p-4">
                  <p className="text-xs sm:text-sm text-ink-soft">Total durasi</p>
                  <p className="text-base sm:text-lg font-semibold mt-1">{Math.round(stats.totalLiveHours)} jam</p>
                </div>
              </div>
            </div>

            {/* Right Column - Gallery and Buttons */}
            <div className="w-full lg:w-[400px] lg:pl-12">
              {/* Gallery Section */}
              <div className="space-y-4">
                <h3 className="text-ui font-semibold text-ink">Galeri foto kamu</h3>
                <div className="grid grid-cols-3 gap-2 sm:gap-3 relative">
                  {galleryPhotos.slice(0, 3).map((photo, index) => (
                    <div 
                      key={photo.id} 
                      className="relative aspect-square cursor-pointer group"
                      onClick={() => openGalleryModal(index)}
                    >
                      <img 
                        src={photo.photo_url}
                        alt={`Gallery image ${index + 1}`}
                        className="rounded-panel w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-panel" />
                    </div>
                  ))}
                  {galleryPhotos.length > 3 && (
                    <div 
                      className="absolute right-0 bottom-0 w-[calc(33.33%-4px)] aspect-square rounded-panel overflow-hidden cursor-pointer transform transition-transform duration-200 hover:scale-105"
                      onClick={() => openGalleryModal(3)}
                    >
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                        <span className="text-white font-medium text-lg">+{galleryPhotos.length - 3}</span>
                      </div>
                      <img 
                        src={galleryPhotos[3].photo_url}
                        alt="More photos preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  {(!galleryPhotos || galleryPhotos.length === 0) && (
                    <div className="col-span-full text-center py-6 sm:py-8 text-xs sm:text-sm text-ink-soft">
                      Belum ada foto
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons - Centered with visual separation */}
              <div className="my-4 sm:my-6 py-4 sm:py-6 border-y border-hairline">
                <div className="flex justify-center gap-2 sm:gap-3">
                  <Button
                    onClick={() => router.push('/streamer-schedule')}
                    className="w-10 h-10 sm:w-12 sm:h-12 p-0 rounded-panel bg-[#E23744] hover:bg-[#E23744]/90 text-white transition-all duration-200"
                    title="Atur jadwal"
                  >
                    <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
                  </Button>
                  <Button
                    onClick={() => router.push('/settings?type=streamer')}
                    className="w-10 h-10 sm:w-12 sm:h-12 p-0 rounded-panel bg-surface-tint hover:bg-surface-deep text-ink-body transition-all duration-200"
                    title="Pengaturan"
                  >
                    <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
                  </Button>
                  <Button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className={`w-10 h-10 sm:w-12 sm:h-12 p-0 rounded-panel bg-surface-tint hover:bg-surface-deep text-ink-body transition-all duration-200 ${
                      isExpanded ? 'bg-surface-deep' : ''
                    }`}
                    title="Lihat analytics"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 sm:h-5 sm:w-5 transform transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Expandable Analytics Section */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="p-4 sm:p-6 pt-0 border-t border-hairline">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
              <AnalyticsCard
                title="Total pendapatan"
                value={`Rp ${stats.totalEarnings.toLocaleString('id-ID')}`}
                trend={stats.trends.earnings}
              />
              <AnalyticsCard
                title="Total booking"
                value={stats.totalBookings.toString()}
                trend={stats.trends.bookings}
              />
              <AnalyticsCard
                title="Total live"
                value={stats.totalLive.toString()}
                trend={stats.trends.lives}
              />
              <AnalyticsCard
                title="Booking dibatalkan"
                value={stats.cancelledBookings.toString()}
                trend={stats.trends.cancellations}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Gallery Modal */}
      {isGalleryModalOpen && (
        <div 
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setIsGalleryModalOpen(false)}
        >
          <div 
            className="relative max-w-4xl w-full bg-surface rounded-frame overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-hairline-input flex justify-between items-center">
              <h3 className="text-lg font-semibold text-ink">Gallery Photos</h3>
              <button 
                onClick={() => setIsGalleryModalOpen(false)}
                className="text-ink-soft hover:text-ink-body"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="relative aspect-[3/2] bg-black">
              <img
                src={galleryPhotos[selectedPhotoIndex].photo_url}
                alt={`Gallery photo ${selectedPhotoIndex + 1}`}
                className="w-full h-full object-contain"
              />
              
              {/* Navigation Buttons */}
              <button
                onClick={handlePrevPhoto}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              <button
                onClick={handleNextPhoto}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Thumbnails */}
            <div className="p-4 border-t border-hairline-input">
              <div className="flex gap-2 overflow-x-auto pb-2">
                {galleryPhotos.map((photo, index) => (
                  <div
                    key={photo.id}
                    onClick={() => setSelectedPhotoIndex(index)}
                    className={`relative w-20 aspect-square flex-shrink-0 cursor-pointer rounded-lg overflow-hidden ${
                      selectedPhotoIndex === index ? 'ring-2 ring-blue-500' : ''
                    }`}
                  >
                    <img
                      src={photo.photo_url}
                      alt={`Thumbnail ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Time formatting utilities
function formatBookingTime(dateString: string, timezone: string = 'UTC') {
  try {
    // Parse the UTC date string
    const date = new Date(dateString);
    
    // Format the time in the specified timezone
    const options: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone
    };

    return new Intl.DateTimeFormat('en-US', options).format(date);
  } catch (error) {
    console.error('Error formatting booking time:', error);
    return dateString;
  }
}

function formatBookingDate(dateString: string, formatStr: string = 'EEEE, MMMM d, yyyy') {
  const date = new Date(dateString);
  return format(date, formatStr);
}

// Update the groupBookingsByTimeBlocks function to maintain the array structure
function groupBookingsByTimeBlocks(bookings: RelatedBooking[]) {
  // Sort bookings by start time
  const sortedBookings = [...bookings].sort((a, b) => 
    new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  // Group non-contiguous time blocks
  const timeBlocks: RelatedBooking[][] = [];
  let currentBlock: RelatedBooking[] = [];

  sortedBookings.forEach((booking, index) => {
    const adjustedBooking = {
      ...booking,
      start_time: new Date(new Date(booking.start_time).setHours(new Date(booking.start_time).getHours() + 8)).toISOString(),
      end_time: new Date(new Date(booking.end_time).setHours(new Date(booking.end_time).getHours() + 8)).toISOString()
    };

    if (index === 0) {
      currentBlock.push(adjustedBooking);
    } else {
      const prevBooking = sortedBookings[index - 1];
      const prevEndTime = new Date(prevBooking.end_time);
      const currentStartTime = new Date(booking.start_time);

      // Check if current booking starts right after previous booking ends
      if (prevEndTime.getTime() === currentStartTime.getTime()) {
        currentBlock.push(adjustedBooking);
      } else {
        // Start a new block
        if (currentBlock.length > 0) {
          timeBlocks.push([...currentBlock]);
        }
        currentBlock = [adjustedBooking];
      }
    }
  });

  // Add the last block
  if (currentBlock.length > 0) {
    timeBlocks.push(currentBlock);
  }

  return timeBlocks;
}

function StartLiveModal({ 
  isOpen, 
  onClose,
  onConfirm,
  isStarting
}: { 
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (streamLink: string) => void;
  isStarting: boolean;
}) {
  const [streamLink, setStreamLink] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!streamLink.trim()) {
      setError('Link stream wajib diisi');
      return;
    }

    // Basic URL validation
    try {
      new URL(streamLink);
      onConfirm(streamLink);
    } catch {
      setError('Masukkan URL yang valid');
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div 
        className="bg-surface rounded-panel w-full max-w-lg mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-hairline">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-title font-semibold text-ink">
              Mulai live stream
            </h2>
            <button 
              onClick={onClose}
              className="text-ink-faint hover:text-ink-muted transition-colors"
              disabled={isStarting}
            >
              <XCircle className="h-6 w-6" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Guidelines */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Info className="h-4 w-4 text-blue-600" />
              </div>
              <h4 className="text-base font-medium text-ink">
                Stream Setup Guide
              </h4>
            </div>
            <ul className="space-y-3 pl-11">
              <li className="flex items-center gap-2 text-ink-muted">
                <div className="h-1.5 w-1.5 rounded-full bg-hairline-strong flex-shrink-0" />
                <span className="text-sm">Pastikan sudah menyiapkan platform streaming</span>
              </li>
              <li className="flex items-center gap-2 text-ink-muted">
                <div className="h-1.5 w-1.5 rounded-full bg-hairline-strong flex-shrink-0" />
                <span className="text-sm">Salin dan tempel link stream dari platform kamu</span>
              </li>
              <li className="flex items-center gap-2 text-ink-muted">
                <div className="h-1.5 w-1.5 rounded-full bg-hairline-strong flex-shrink-0" />
                <span className="text-sm">Periksa kembali link sebelum memulai stream</span>
              </li>
            </ul>
          </div>

          {/* Stream Link Input */}
          <div className="space-y-3">
            <Label htmlFor="stream-link" className="text-sm font-medium text-ink-body">
              Stream Link<span className="text-red-500">*</span>
            </Label>
            <Input
              id="stream-link"
              type="url"
              placeholder="https://your-streaming-platform.com/your-stream"
              value={streamLink}
              onChange={(e) => {
                setStreamLink(e.target.value);
                setError('');
              }}
              className={cn(
                "w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-offset-0",
                error ? "border-red-300 focus:ring-red-500" : "border-hairline-strong focus:ring-blue-500"
              )}
              disabled={isStarting}
            />
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-surface-tint border-t border-hairline">
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              disabled={isStarting}
              className="px-4 py-2 text-sm font-medium text-ink-body hover:text-ink transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleSubmit}
              disabled={isStarting || !streamLink.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isStarting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Memulai Stream...</span>
                </>
              ) : (
                'Mulai Stream'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PaymentGroupBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking;
  relatedBookings: Booking[];
  onAccept: (id: number) => void;
  onReject: (id: number, reason: string) => void;
}

function PaymentGroupBookingModal({ isOpen, onClose, booking, relatedBookings, onAccept, onReject }: PaymentGroupBookingModalProps) {
  if (!isOpen) return null;

  const allBookings = [booking, ...relatedBookings].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  const totalPrice = allBookings.reduce((sum, b) => sum + calculateBasePrice(b.price), 0);

  return (
    <div 
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-surface rounded-panel w-full max-w-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-hairline">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-title font-semibold text-ink">
                Grup booking
              </h2>
              <p className="text-xs sm:text-sm text-ink-soft mt-1">
                {booking.client_first_name} {booking.client_last_name}
              </p>
            </div>
            <button 
              onClick={onClose}
              className="text-ink-faint hover:text-ink-muted transition-colors"
            >
              <XCircle className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="px-4 sm:px-6 py-4 sm:py-6">
          <div className="space-y-4 sm:space-y-6">
            {/* Total Price Info */}
            <div className="bg-blue-50 rounded-lg p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                  <span className="text-xs sm:text-sm font-medium text-ink">Total pembayaran</span>
                </div>
                <span className="text-base sm:text-lg font-bold text-blue-600">
                  Rp {totalPrice.toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            {/* Bookings List */}
            <div className="space-y-3 sm:space-y-4 max-h-[60vh] overflow-y-auto">
              {allBookings.map((b, index) => (
                <div key={b.id} className="border rounded-lg overflow-hidden">
                  <div className="p-3 sm:p-4 bg-surface-tint border-b">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs font-medium">
                          {index + 1}
                        </span>
                        <span className="text-xs sm:text-sm font-medium text-ink">
                          {formatBookingDate(b.start_time)}
                        </span>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-[10px] sm:text-xs font-medium ${getStatusColor(b.status)}`}>
                        {b.status}
                      </span>
                    </div>
                  </div>
                  <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-ink-faint" />
                        <span className="text-xs sm:text-sm text-ink-muted">
                          {formatBookingTime(b.start_time, b.timezone)} - {formatBookingTime(b.end_time, b.timezone)}
                        </span>
                      </div>
                      <span className="text-xs sm:text-sm font-medium text-ink">
                        Rp {calculateBasePrice(b.price).toLocaleString('id-ID')}
                      </span>
                    </div>
                    {b.status === 'pending' && (
                      <div className="flex items-center justify-end gap-2 pt-2 sm:pt-3 border-t">
                        <button
                          onClick={() => onReject(b.id, '')}
                          className="text-xs sm:text-sm text-red-600 hover:text-red-700 transition-colors font-medium"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => onAccept(b.id)}
                          className="px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors"
                        >
                          Accept
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Add this new LoadingScreen component before the StreamerDashboard component
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-canvas">
      {/* Navbar Skeleton */}
      <div className="w-full h-16 bg-surface border-b border-hairline px-4 flex items-center justify-between">
        <div className="w-32 h-8 bg-surface-deep animate-pulse rounded"></div>
        <div className="flex space-x-4">
          <div className="w-8 h-8 bg-surface-deep animate-pulse rounded-full"></div>
          <div className="w-8 h-8 bg-surface-deep animate-pulse rounded-full"></div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-6 md:py-8">
        {/* ID Card Skeleton */}
        <div className="w-full bg-surface rounded-panel border border-hairline p-6 animate-pulse">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="w-32 h-32 md:w-40 md:h-40 bg-surface-deep rounded-panel"></div>
            <div className="flex-1 space-y-4">
              <div className="h-8 bg-surface-deep rounded w-1/3"></div>
              <div className="h-4 bg-surface-deep rounded w-1/4"></div>
              <div className="flex flex-wrap gap-4 pt-2">
                <div className="h-16 w-32 bg-surface-deep rounded-lg"></div>
                <div className="h-16 w-32 bg-surface-deep rounded-lg"></div>
                <div className="h-16 w-32 bg-surface-deep rounded-lg"></div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Schedule Section Skeleton */}
        <div className="mt-8 space-y-8">
          <div className="bg-surface rounded-lg sm:rounded-panel border border-hairline overflow-hidden">
            <div className="p-3 sm:p-4 md:p-6 border-b border-hairline">
              <div className="h-7 bg-surface-deep animate-pulse rounded w-1/3"></div>
              <div className="h-4 bg-surface-deep animate-pulse rounded w-1/2 mt-3"></div>
            </div>
            <div className="p-3 sm:p-4 md:p-6">
              {/* Tab Buttons Skeleton */}
              <div className="flex space-x-3 mb-5">
                <div className="h-10 bg-surface-deep animate-pulse rounded-lg w-24"></div>
                <div className="h-10 bg-surface-deep animate-pulse rounded-lg w-24"></div>
                <div className="h-10 bg-surface-deep animate-pulse rounded-lg w-24"></div>
              </div>
              
              {/* Schedule Cards Skeleton */}
              <div className="space-y-4 mt-6">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="border border-hairline rounded-panel p-4 bg-surface animate-pulse">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="h-5 bg-surface-deep rounded w-1/4 mb-3"></div>
                        <div className="flex items-center gap-3 mb-2">
                          <div className="h-10 w-10 bg-surface-deep rounded-full"></div>
                          <div className="h-4 bg-surface-deep rounded w-1/3"></div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-4">
                          <div className="h-4 bg-surface-deep rounded"></div>
                          <div className="h-4 bg-surface-deep rounded"></div>
                          <div className="h-4 bg-surface-deep rounded"></div>
                          <div className="h-4 bg-surface-deep rounded"></div>
                        </div>
                      </div>
                      <div className="flex flex-col md:flex-row gap-3 md:items-center">
                        <div className="h-10 bg-surface-deep rounded-lg w-32"></div>
                        <div className="h-10 bg-surface-deep rounded-lg w-32"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          {/* Booking Management Section Skeleton */}
          <div className="bg-surface rounded-panel border border-hairline">
            <div className="p-6 border-b border-hairline">
              <div className="h-7 bg-surface-deep animate-pulse rounded w-1/3"></div>
            </div>
            <div className="p-6">
              {/* Tab Buttons Skeleton */}
              <div className="flex p-1 bg-surface-tint rounded-panel mb-6">
                <div className="flex-1 h-10 bg-surface-deep animate-pulse rounded-lg mr-2"></div>
                <div className="flex-1 h-10 bg-surface-deep animate-pulse rounded-lg"></div>
              </div>
              
              {/* Booking Cards Skeleton */}
              <div className="space-y-4">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="border border-hairline rounded-lg p-4 animate-pulse">
                    <div className="flex flex-col md:flex-row justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="h-10 w-10 bg-surface-deep rounded-full"></div>
                          <div>
                            <div className="h-4 bg-surface-deep rounded w-32 mb-1"></div>
                            <div className="h-3 bg-surface-deep rounded w-24"></div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <div className="h-4 bg-surface-deep rounded"></div>
                          <div className="h-4 bg-surface-deep rounded"></div>
                          <div className="h-4 bg-surface-deep rounded"></div>
                          <div className="h-4 bg-surface-deep rounded"></div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div className="h-10 bg-surface-deep rounded-lg w-24"></div>
                        <div className="h-10 bg-surface-deep rounded-lg w-24"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * `lib/milestones` points the `publish` milestone at the setup hub, which is the
 * right destination for a caller with no other context. From here we already
 * know the host is mid-setup, so deep-link straight to the form and save them a
 * hop.
 */
function milestoneActionHref(milestone: Milestone): string {
  return milestone.id === 'publish' ? '/streamer-setup/profil' : milestone.href;
}

const MILESTONE_ICONS: Record<MilestoneId, typeof Store> = {
  publish: Store,
  verify: BadgeCheck,
  payout: Wallet,
};

/**
 * Compact milestone tracker. Replaces the old single verification banner, which
 * could only ever say one thing ("you are not verified") and had no way to tell
 * a host whose profile was still missing a price that verification was not
 * actually their next problem.
 *
 * Shows progress plus exactly one action — the `current` milestone — because
 * this sits on top of a dashboard that has its own job to do.
 */
function SetupTracker({
  profile,
  verificationStatus,
  hasPayoutAccount,
}: {
  profile: PublishableProfile | null;
  verificationStatus: string | null;
  hasPayoutAccount: boolean;
}) {
  // A suspended account is not a checklist item — nothing the host does in
  // setup lifts it, so keep the old warning rather than telling them to
  // "continue".
  if (verificationStatus === 'suspended') {
    return (
      <div className="mb-6 rounded-panel border border-orange-200 bg-orange-50 p-4">
        <p className="flex items-center gap-2 font-semibold text-ink">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          Akun kamu sedang ditangguhkan
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          Hubungi dukungan Salda untuk mengetahui langkah selanjutnya.
        </p>
      </div>
    );
  }

  const milestones = streamerMilestones({
    profile,
    verificationStatus,
    hasPayoutAccount,
  });

  const current = milestones.find((milestone) => milestone.current);

  // Everything done: the tracker has nothing left to say and gets out of the way.
  if (!current) return null;

  const progress = milestoneProgress(milestones);
  const finished = milestones.filter((milestone) => milestone.done).length;
  const Icon = MILESTONE_ICONS[current.id];

  return (
    <div className="mb-6 rounded-panel border border-blue-100 bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink-body">
          Setup host: {finished} dari {milestones.length} langkah selesai
        </p>
        <Link
          href="/streamer-setup"
          className="hidden shrink-0 items-center gap-1 text-sm font-medium text-blue-700 hover:underline sm:inline-flex"
        >
          Lihat semua
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div
        className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-surface-tint"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progres setup host"
      >
        <div
          className="h-full rounded-full bg-brand transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Milestone dots, so the two finished steps stay visible as evidence that
          the remaining one is genuinely the last stretch. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {milestones.map((milestone) => (
          <span
            key={milestone.id}
            className={`inline-flex items-center gap-1.5 text-xs ${
              milestone.done
                ? 'text-green-700'
                : milestone.current
                  ? 'font-medium text-blue-700'
                  : 'text-ink-faint'
            }`}
          >
            {milestone.done ? (
              <CheckCircle className="h-3.5 w-3.5" />
            ) : (
              <Circle className="h-3.5 w-3.5" />
            )}
            {milestone.title}
          </span>
        ))}
      </div>

      <div className="mt-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-panel bg-blue-50 text-blue-600"
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-ink">{current.title}</p>
            <p className="mt-0.5 text-sm text-ink-muted">{current.description}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft">
              <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-ink-faint" />
              Membuka: <span className="font-medium text-ink-body">{current.unlocks}</span>
            </p>
          </div>
        </div>

        <Link
          href={milestoneActionHref(current)}
          className="mt-3 inline-flex h-10 shrink-0 items-center justify-center rounded-lg
            bg-brand px-4 text-copy font-semibold text-white
            transition-colors hover:bg-brand-hover sm:mt-0"
        >
          Lanjutkan
        </Link>
      </div>
    </div>
  );
}

const NOTICE_PRIMARY_ACTION =
  `inline-flex h-[46px] w-[220px] items-center justify-center rounded-lg bg-brand
   px-4 text-ui font-semibold text-white transition-colors hover:bg-brand-hover`;

// Deliberately the same 168/46 geometry as the `quiet` button variant, and a
// 1px border rather than the old 2px: these notices sit where CardActionBar
// would if they were inside a card, so they have to match it.
const NOTICE_SECONDARY_ACTION =
  `inline-flex h-[46px] w-[168px] items-center justify-center rounded-lg border
   border-hairline-input bg-surface px-4 text-copy font-medium text-ink-muted
   transition-colors hover:bg-surface-raised hover:text-ink`;

/**
 * Full-page notice for the states where the dashboard has nothing to render.
 *
 * All of them used to end at one red box reading "Error: Failed to load data" —
 * English, on an Indonesian product, with no navigation and no way forward. The
 * Navbar matters as much as the copy here: without it the page is a dead end,
 * and every one of these states has somewhere useful to go next.
 */
function DashboardNotice({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <Navbar />
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <div className="rounded-frame border border-hairline bg-surface p-6 sm:p-8">
          <h1 className="font-serif text-title font-semibold text-ink">{title}</h1>
          <p className="mt-2 text-ink-muted">{description}</p>
          {children && <div className="mt-6 flex flex-wrap gap-3">{children}</div>}
        </div>
      </main>
    </div>
  );
}

/**
 * The section heading used across the dashboard.
 *
 * Numbered, because the dashboard is a sequence and not a pile: answer
 * requests, run today's session, get paid, keep your listing accurate. The old
 * page gave every section the same 24px bold heading with no ordering, so a
 * host arriving with one thing to do had to read all of them to find it.
 */
function SectionHeading({
  index,
  title,
  description,
  action,
}: {
  index: number;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline-soft px-5 py-4">
      <span className="numeric text-mini font-semibold tracking-normal text-ink-ghost">
        {String(index).padStart(2, '0')}
      </span>
      <h2 className="font-serif text-title font-semibold text-ink">{title}</h2>
      {description && (
        <p className="w-full text-meta text-ink-soft sm:w-auto sm:flex-1">{description}</p>
      )}
      {action}
    </div>
  );
}

/**
 * "Yang harus kamu lakukan sekarang" — one card, one job.
 *
 * The stage is derived from the data in a fixed order of urgency, so the card
 * can only ever show one thing and it is always the most pressing one. That is
 * the whole point: a host opening this page on their phone between sessions
 * should not have to work out which of four sections applies to them.
 *
 * `live` outranks `pending` deliberately. A session happening right now is
 * losing the host money every minute it is not started; a booking request has
 * hours left on its clock.
 */
function NowCard({
  bookings,
  pendingCount,
}: {
  bookings: Booking[];
  pendingCount: number;
}) {
  /**
   * A ticking clock, not a render-time snapshot.
   *
   * `const now = new Date()` is only re-evaluated when something else causes a
   * render. A host who opens this page ten minutes before their session and
   * leaves it open — which is exactly what a host does — would watch it go on
   * saying "sesi berikutnya" straight through the start time, because nothing
   * on the page changes at 15:00. A minute is finer than any decision this card
   * drives.
   */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const live = bookings.find((booking) => {
    if (booking.status !== 'accepted' && booking.status !== 'live') return false;
    const start = new Date(booking.start_time);
    const end = new Date(booking.end_time);
    return start <= now && end >= now;
  });

  /**
   * A session whose end time has passed but which nobody has ended.
   *
   * Without this it fell out of every bucket — past its window so not `live`,
   * not in the future so not `next` — and the card cheerfully announced "tidak
   * ada yang menunggu jawaban" to a host whose stream was still open and
   * unbilled. Bounded to the last twelve hours so a session forgotten last week
   * does not sit at the top of the dashboard forever.
   */
  const overdue = live
    ? undefined
    : bookings.find((booking) => {
        if (booking.status !== 'accepted' && booking.status !== 'live') return false;
        const end = new Date(booking.end_time).getTime();
        return end < now.getTime() && now.getTime() - end < 12 * 60 * 60 * 1000;
      });

  const next = bookings
    .filter((booking) => booking.status === 'accepted' && new Date(booking.start_time) > now)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0];

  const stage = live
    ? 'live'
    : overdue
      ? 'overdue'
      : pendingCount > 0
        ? 'pending'
        : next
          ? 'next'
          : 'clear';
  const subject = live ?? overdue ?? next;

  return (
    <section className="mt-6 overflow-hidden rounded-panel border border-hairline bg-surface">
      <div className="flex items-center gap-2 border-b border-hairline-soft px-5 py-3.5">
        {/* The first step of the sequence the numbered sections below continue. */}
        <span className="numeric text-mini font-semibold tracking-normal text-ink-ghost">01</span>
        {(stage === 'live' || stage === 'overdue') && (
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-critical" />
        )}
        <h2 className="font-serif text-title font-semibold text-ink">
          Yang harus kamu lakukan sekarang
        </h2>
      </div>

      {stage === 'clear' ? (
        <div className="px-5 py-10 text-center">
          <p className="text-copy font-medium text-ink">Tidak ada yang menunggu jawaban</p>
          <p className="mt-1 text-meta text-ink-soft">
            Semua permintaan sudah kamu jawab. Kerja bagus.
          </p>
        </div>
      ) : stage === 'pending' ? (
        <div className="flex flex-wrap items-center gap-4 px-5 py-5">
          <div className="min-w-0 flex-1">
            <p className="text-copy font-medium text-ink">
              {pendingCount} permintaan menunggu jawaban kamu
            </p>
            <p className="mt-1 text-meta text-ink-soft">
              Brand tidak bisa membayar sampai kamu menerima. Jawab hari ini.
            </p>
          </div>
          <a
            href="#permintaan"
            className="inline-flex h-[46px] w-[220px] shrink-0 items-center justify-center rounded-lg bg-brand text-ui font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            Lihat permintaan
          </a>
        </div>
      ) : subject ? (
        <div className="px-5 py-5">
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {[
              { label: 'Brand', value: `${subject.client_first_name} ${subject.client_last_name}`.trim() },
              {
                label: 'Jam',
                value: `${format(new Date(subject.start_time), 'HH:mm')}–${format(new Date(subject.end_time), 'HH:mm')}`,
              },
              { label: 'Platform', value: subject.platform },
              { label: 'Bayaran', value: formatPrice(baseFromTotal(subject.price)) },
            ].map((field) => (
              <div key={field.label}>
                <p className="text-micro tracking-normal text-ink-faint">{field.label}</p>
                <p className="numeric mt-0.5 text-copy font-medium text-ink">{field.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-meta text-ink-soft">
            {stage === 'overdue'
              ? 'Jam sesi ini sudah lewat tapi belum ditutup. Akhiri sesi supaya bayaran kamu bisa diproses.'
              : stage === 'live'
              ? 'Sesi ini sedang berlangsung. Tempel tautan siaran kamu supaya brand bisa menonton.'
              : `Sesi berikutnya ${format(new Date(subject.start_time), 'EEEE, d MMMM', { locale: idLocale })}.`}
          </p>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Earnings over the last seven days.
 *
 * A bar chart rather than a single "+18%" figure: a host wants to know which
 * days actually earn, and a percentage against last week hides a good Saturday
 * behind a bad Tuesday. Rendered from divs — a charting library for seven
 * numbers is weight the page does not need to carry.
 *
 * Bars are drawn from `Math.max(...)`, so an all-zero week produces a flat row
 * at the floor height rather than dividing by zero and rendering NaN% tall
 * bars, which is what an empty state has to survive.
 */
function EarningsBar({ bookings }: { bookings: Booking[] }) {
  const days = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(today, i - 6);
      const total = bookings
        .filter((booking) => {
          if (booking.status !== 'completed' && booking.status !== 'live') return false;
          return isSameDay(new Date(booking.start_time), day);
        })
        // The stored price is what the brand paid, tax and platform fee
        // included. What the host earns is the base underneath it, which is the
        // number this chart has to show — anything else quotes them money that
        // was never theirs.
        .reduce((sum, booking) => sum + baseFromTotal(booking.price), 0);
      return { day, total };
    });
  }, [bookings]);

  const peak = Math.max(...days.map((d) => d.total), 0);
  const weekTotal = days.reduce((sum, d) => sum + d.total, 0);

  return (
    <div className="px-5 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="numeric text-price font-semibold text-ink">{formatPrice(weekTotal)}</p>
        <p className="text-mini text-ink-soft">Pendapatan 7 hari terakhir</p>
      </div>

      {/*
        The bars are percentage-height, so every ancestor between them and the
        fixed h-24 needs a definite height of its own. The first version nested
        each bar in an auto-height column, and a percentage against an auto
        height resolves to auto — which for an empty div is zero. The whole
        chart rendered as a blank strip.

        So: the h-24 row holds only full-height columns, each pushing its bar to
        the bottom with justify-end, and the day labels sit in a separate row
        underneath rather than inside the measured area.
      */}
      <div className="mt-4 flex h-24 items-stretch gap-1.5">
        {days.map(({ day, total }) => (
          <div key={day.toISOString()} className="flex h-full flex-1 flex-col justify-end">
            <div
              className={cn(
                'w-full rounded-chip transition-colors',
                total > 0 ? 'bg-brand' : 'bg-surface-deep',
              )}
              style={{ height: `${peak > 0 ? Math.max((total / peak) * 100, 3) : 3}%` }}
              title={`${format(day, 'EEEE d MMMM', { locale: idLocale })}: ${formatPrice(total)}`}
            />
          </div>
        ))}
      </div>

      <div className="mt-1.5 flex gap-1.5">
        {days.map(({ day }) => (
          <span
            key={day.toISOString()}
            className="flex-1 text-center text-micro tracking-normal text-ink-faint"
          >
            {format(day, 'EEEEE', { locale: idLocale })}
          </span>
        ))}
      </div>

      {weekTotal === 0 && (
        <p className="mt-3 text-meta text-ink-soft">
          Belum ada sesi selesai minggu ini.
        </p>
      )}
    </div>
  );
}

/**
 * One word per booking status, as text.
 *
 * The rest of this file still renders `booking.status` raw — English, lowercase,
 * straight out of the column — inside a filled colour pill. Both of those are
 * things the design says not to do, so the two sections written here carry their
 * own mapping rather than borrowing `getStatusColor`.
 */
const WEEK_STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Menunggu', tone: 'text-caution' },
  accepted: { label: 'Diterima', tone: 'text-ink-soft' },
  live: { label: 'Live', tone: 'text-critical' },
  completed: { label: 'Selesai', tone: 'text-positive' },
};

/**
 * "Minggu ini sekilas" — the seven days of the current week, Senin to Minggu,
 * with what each one holds.
 *
 * Deliberately not a second total. The summary above it answers "what did the
 * week earn"; this answers the other question a host actually opens the
 * dashboard with — which days are taken, which are still free, and who is on
 * them. So it is a list of days, it carries no money, and it looks forward as
 * well as back: a Wednesday booking is on this screen on Monday, which is the
 * only time knowing about it is any use.
 *
 * The week starts on Monday. `isThisWeek` elsewhere in this file uses date-fns'
 * default of Sunday, which would put a Sunday session in "next week" for every
 * host in Indonesia.
 */
function WeekGlance({ index, bookings }: { index: number; bookings: Booking[] }) {
  const { days, rangeLabel, sessionCount } = useMemo(() => {
    const today = new Date();
    const start = startOfWeek(today, { weekStartsOn: 1 });
    const end = endOfWeek(today, { weekStartsOn: 1 });

    const relevant = bookings.filter((booking) =>
      ['pending', 'accepted', 'live', 'completed'].includes(booking.status.toLowerCase()),
    );

    const days = Array.from({ length: 7 }, (_, offset) => {
      const day = addDays(start, offset);
      const sessions = relevant
        .filter((booking) => isSameDay(new Date(booking.start_time), day))
        .sort(
          (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
        );
      return { day, sessions };
    });

    return {
      days,
      rangeLabel: `${format(start, 'd MMMM', { locale: idLocale })} – ${format(end, 'd MMMM', { locale: idLocale })}`,
      sessionCount: days.reduce((total, entry) => total + entry.sessions.length, 0),
    };
  }, [bookings]);

  return (
    <section className="overflow-hidden rounded-panel border border-hairline bg-surface">
      <SectionHeading index={index} title="Minggu ini sekilas" description={rangeLabel} />

      {sessionCount === 0 ? (
        <p className="px-5 py-10 text-center text-meta text-ink-soft">
          Belum ada sesi terjadwal minggu ini.
        </p>
      ) : (
        <ul>
          {days.map(({ day, sessions }) => (
            <li
              key={day.toISOString()}
              className="flex items-start gap-4 border-t border-hairline-soft px-5 py-3.5 first:border-t-0"
            >
              <div className="w-[86px] shrink-0">
                {/* The single accent in this section, and it can only ever
                    appear on one of the seven rows. */}
                <p
                  className={cn(
                    'truncate text-copy font-medium',
                    isToday(day) ? 'text-brand' : 'text-ink',
                  )}
                >
                  {format(day, 'EEEE', { locale: idLocale })}
                </p>
                <p className="numeric mt-0.5 text-micro tracking-normal text-ink-faint">
                  {format(day, 'd MMM', { locale: idLocale })}
                </p>
              </div>

              <div className="min-w-0 flex-1">
                {sessions.length === 0 ? (
                  <p className="text-copy text-ink-ghost">—</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {sessions.map((booking) => {
                      const status =
                        WEEK_STATUS[booking.status.toLowerCase()] ?? WEEK_STATUS.accepted;
                      return (
                        <li key={booking.id} className="flex items-baseline gap-3">
                          <span className="numeric shrink-0 text-copy text-ink">
                            {format(new Date(booking.start_time), 'HH:mm')}–
                            {format(new Date(booking.end_time), 'HH:mm')}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-copy text-ink-body">
                            {`${booking.client_first_name} ${booking.client_last_name}`.trim()}
                            {booking.platform ? ` · ${booking.platform}` : ''}
                          </span>
                          {/* Status is text. */}
                          <span className={cn('shrink-0 text-meta', status.tone)}>
                            {status.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** How many finished sessions the list shows before it stops. */
const COMPLETED_VISIBLE = 8;

/**
 * "Sudah selesai" — sessions that are closed and need nothing further.
 *
 * They used to sit in a tab alongside the sessions that still need work, which
 * meant the one list a host has to act on was padded with months of finished
 * jobs. Newest first, and the figure on the right is the host's share
 * (`baseFromTotal`), not the tax-inclusive price the brand paid — the same
 * division the earnings chart and the balance make.
 */
function CompletedSessions({ index, bookings }: { index: number; bookings: Booking[] }) {
  const completed = useMemo(
    () =>
      bookings
        .filter((booking) => booking.status.toLowerCase() === 'completed')
        .sort(
          (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime(),
        ),
    [bookings],
  );

  const visible = completed.slice(0, COMPLETED_VISIBLE);

  return (
    <section className="overflow-hidden rounded-panel border border-hairline bg-surface">
      <SectionHeading index={index} title="Sudah selesai" />

      {completed.length === 0 ? (
        <p className="px-5 py-10 text-center text-meta text-ink-soft">
          Belum ada sesi yang selesai.
        </p>
      ) : (
        <>
          <ul>
            {visible.map((booking) => (
              <li
                key={booking.id}
                className="flex items-center gap-4 border-t border-hairline-soft px-5 py-3.5 first:border-t-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-copy font-medium text-ink">
                    {`${booking.client_first_name} ${booking.client_last_name}`.trim()}
                  </p>
                  <p className="numeric mt-0.5 truncate text-mini text-ink-soft">
                    {format(new Date(booking.start_time), 'd MMM yyyy', { locale: idLocale })}
                    {' · '}
                    {format(new Date(booking.start_time), 'HH:mm')}–
                    {format(new Date(booking.end_time), 'HH:mm')}
                    {booking.platform ? ` · ${booking.platform}` : ''}
                  </p>
                </div>
                <p className="numeric shrink-0 text-copy font-medium text-ink">
                  {formatPrice(baseFromTotal(booking.price))}
                </p>
              </li>
            ))}
          </ul>

          {completed.length > visible.length && (
            <p className="border-t border-hairline-soft px-5 py-3 text-meta text-ink-soft">
              Menampilkan {visible.length} sesi terakhir dari {completed.length}.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export default function StreamerDashboard() {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pendingBookings, setPendingBookings] = useState<Booking[]>([]);
  const [rejectedBookings, setRejectedBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const [streamerStats, setStreamerStats] = useState<StreamerStats | null>(null);
  const [galleryPhotos, setGalleryPhotos] = useState<StreamerGalleryPhoto[]>([]);
  // Add state for status filter
  const [scheduleFilter, setScheduleFilter] = useState<string>('Semua');
  // Drives the setup tracker. A host who skipped the onboarding tour has no
  // other route back into setup, and while any milestone is unfinished they are
  // invisible to brands or unable to be paid — so the dashboard has to keep
  // saying which one is next.
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  // The profile row itself, so milestone 1 is recomputed from the same fields
  // lib/milestones checks rather than from a flag that could drift.
  const [streamerProfile, setStreamerProfile] = useState<PublishableProfile | null>(null);
  const [hasPayoutAccount, setHasPayoutAccount] = useState(false);
  // A signed-in account with no `streamers` row is not a failure. It is either a
  // brand — which has no host dashboard at all — or a host whose row was never
  // created. `.single()` raised PGRST116 for both and the catch below turned it
  // into a dead end, so the two cases are now told apart and answered separately.
  const [isBrandAccount, setIsBrandAccount] = useState(false);
  // Set before every router.push: `finally` clears isLoading immediately, and
  // without this the page would flash a fallback while the navigation is still
  // in flight.
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Define fetchData first
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        // There is no `/login` route in this app — the sign-in page is
        // `/sign-in`, and it carries the caller back afterwards via
        // `redirect_to`. Pushing `/login` was a guaranteed 404 on any
        // client-side session loss.
        setIsRedirecting(true);
        router.push('/sign-in?redirect_to=/streamer-dashboard');
        return;
      }

      // Get streamer data. `.maybeSingle()`, not `.single()`: "no row" is an
      // expected state for a brand or an unfinished host, and `.single()`
      // reported it as a PGRST116 error that landed in the catch below.
      const { data: streamerData, error: streamerError } = await supabase
        .from('streamers')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (streamerError) throw streamerError;

      if (!streamerData) {
        // Without a streamers row we cannot tell a brand from a host whose row
        // is missing, and the two need different answers — the same distinction
        // `/streamer-setup` makes.
        const { data: profile } = await supabase
          .from('users')
          .select('user_type')
          .eq('id', user.id)
          .maybeSingle();

        if (profile?.user_type === 'client') {
          setIsBrandAccount(true);
          return;
        }

        // A host who never finished setup: send them to the place that can
        // actually move them forward rather than showing an error.
        setIsRedirecting(true);
        router.push('/streamer-setup');
        return;
      }

      setVerificationStatus(streamerData.verification_status ?? null);
      setStreamerProfile(streamerData);

      try {
        // Fetch additional streamer data
        const stats = await streamerService.getStreamerStats(streamerData.id);
        const gallery = await streamerService.getStreamerGallery(streamerData.id);

        // The one milestone fact the streamers row does not carry. Head-only:
        // bank details must never be pulled into the browser, and the tracker
        // only needs to know whether a row exists. A failure here is not fatal
        // — the tracker just shows the step as unfinished.
        const { count: payoutAccountCount } = await supabase
          .from('streamer_payout_accounts')
          .select('id', { count: 'exact', head: true })
          .eq('streamer_id', streamerData.id);
        setHasPayoutAccount((payoutAccountCount ?? 0) > 0);

        setStreamerStats(stats);
        setGalleryPhotos(gallery);
        setUserData({
          user_type: 'streamer',
          first_name: streamerData.first_name,
          user_id: user.id,
          streamer_id: streamerData.id
        });

        // Fetch all bookings with different statuses and include voucher usage
        const { data: allBookings, error: bookingsError } = await supabase
          .from('bookings')
          .select(`
            *,
            client_first_name,
            client_last_name,
            sub_acc_link,
            sub_acc_pass,
            voucher_usage (
              id,
              voucher_id,
              discount_applied,
              original_price,
              final_price,
              used_at
            )
          `)
          .eq('streamer_id', streamerData.id)
          .order('start_time', { ascending: true });

        if (bookingsError) throw bookingsError;

        // Filter bookings based on status
        const upcomingBookings = (allBookings || []).filter(booking =>
          // Include all statuses that are relevant for the schedule view
          ['accepted', 'live', 'pending', 'completed'].includes(booking.status.toLowerCase())
        );

        // Set pending bookings (including those that just completed payment)
        const pendingBookings = (allBookings || []).filter(booking =>
          booking.status === 'pending' || booking.status === 'payment_pending'
        );

        // Set rejected bookings
        const rejectedBookings = (allBookings || []).filter(booking =>
          booking.status === 'rejected'
        );

        // Update all states
        setBookings(upcomingBookings);
        setPendingBookings(pendingBookings);
        setRejectedBookings(rejectedBookings);

      } catch (err) {
        console.error("Error fetching streamer data:", err);
        throw err;
      }
    } catch (error) {
      console.error('Error:', error);
      setError('Gagal memuat data dashboard. Periksa koneksi internet kamu, lalu coba lagi.');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  // Then define the handlers that depend on fetchData
  const handleStreamStart: StreamHandler = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const handleStreamEnd: StreamHandler = useCallback(() => {
    fetchData();
  }, [fetchData]);

  // Section 05 is the work list, so it gets only the sessions that still have
  // work in them. Finished sessions are section 06's job — showing them in both
  // is how the one list a host has to act on ended up padded with months of
  // closed jobs. Same array, filtered at the call site: nothing else on the page
  // sees a different set of bookings.
  const openBookings = useMemo(
    () => bookings.filter((booking) => booking.status.toLowerCase() !== 'completed'),
    [bookings],
  );

  const todayBookings = bookings.filter(booking => isToday(parseISO(booking.start_time)));
  const thisWeekBookings = bookings.filter(booking => 
    isThisWeek(parseISO(booking.start_time)) && !isToday(parseISO(booking.start_time))
  );
  const thisMonthBookings = bookings.filter(booking => 
    isThisMonth(parseISO(booking.start_time)) && !isThisWeek(parseISO(booking.start_time))
  );

  const renderScheduleCards = useCallback((bookings: Booking[]) => {
    // Filter out duplicate bookings based on booking ID
    const uniqueBookings = bookings.filter((booking, index, self) =>
      index === self.findIndex((b) => b.id === booking.id)
    );

    return uniqueBookings.map((booking) => (
      <ScheduleCard
        key={booking.id}
        booking={booking}
        onStreamStart={handleStreamStart}
        onStreamEnd={handleStreamEnd}
        setBookings={setBookings}
      />
    ));
  }, [handleStreamStart, handleStreamEnd, setBookings]);

  const calculateDuration = (startTime: string, endTime: string) => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    const roundedDuration = Math.round(durationHours * 10) / 10; // Round to 1 decimal place
    return `${roundedDuration} ${roundedDuration === 1 ? 'Hour' : 'Hours'}`;
  };

  useEffect(() => {
    fetchData();

    // Set up real-time subscription
    const supabase = createClient();
    const subscription = supabase
      .channel('bookings_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, async (payload: any) => {
        console.log("Received real-time update:", payload);
        
        // Check if the new booking is for this streamer
        const { data: { user } } = await supabase.auth.getUser();
        // `.maybeSingle()` for the same reason as the initial load: an account
        // with no streamers row is a normal case, and `.single()` logged a
        // PGRST116 for it on every booking event in the whole table.
        const { data: streamerData } = await supabase
          .from('streamers')
          .select('id')
          .eq('user_id', user?.id)
          .maybeSingle();

        if (streamerData && payload.new && payload.new.streamer_id === streamerData.id) {
          // Handle different booking status changes
          if (payload.new.status === 'pending') {
            // New booking received - update pending bookings
            setPendingBookings(prev => [...prev, payload.new]);
            
            // Show notification
            const { data: clientData } = await supabase
              .from('users')
              .select('first_name, last_name')
              .eq('id', payload.new.client_id)
              .single();

            const clientName = clientData ? `${clientData.first_name} ${clientData.last_name}` : 'A client';
            const bookingDate = payload.new.start_time ? 
              format(new Date(payload.new.start_time), 'MMMM d, yyyy') : 
              'Unknown date';
            const duration = payload.new.start_time && payload.new.end_time ? 
              calculateDuration(payload.new.start_time, payload.new.end_time) : 
              'Unknown duration';

            toast.info(`${clientName} has made a booking request for ${bookingDate} (${duration}).`, {
              position: "top-right",
              autoClose: 5000,
              hideProgressBar: false,
              closeOnClick: true,
              pauseOnHover: true,
              draggable: true,
            });
          } else if (payload.new.status === 'accepted') {
            // Booking accepted - move to upcoming schedule.
            // Replace any existing row with the same id (an UPDATE should not
            // append a duplicate alongside the optimistic accept push).
            setPendingBookings(prev => prev.filter(b => b.id !== payload.new.id));
            setBookings(prev => [...prev.filter(b => b.id !== payload.new.id), payload.new]);
          } else if (payload.new.status === 'rejected') {
            // Booking rejected - move to rejected list
            setPendingBookings(prev => prev.filter(b => b.id !== payload.new.id));
            setRejectedBookings(prev => [...prev, payload.new]);
          }
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchData]);

  // Helper function for status indicator colors in the tab interface
  const getStatusIndicatorColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return 'bg-yellow-500';
      case 'accepted':
        return 'bg-green-500';
      case 'live':
        return 'bg-red-500';
      case 'completed':
        return 'bg-blue-500';
      default:
        return 'bg-surface-tint0';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'accepted': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      case 'live': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-surface-tint text-ink';
    }
  };

  const formatDateString = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB');
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  const handleAcceptBooking = async (bookingId: number) => {
    const result = await acceptBooking(bookingId);
    if (result.success) {
      // Find the booking to be accepted
      const acceptedBooking = pendingBookings.find(b => b.id === bookingId);
      if (acceptedBooking) {
        // Update states immediately (de-dup by id so the realtime UPDATE
        // handler doesn't leave the same booking in `bookings` twice)
        setPendingBookings(prev => prev.filter(b => b.id !== bookingId));
        setBookings(prev => [...prev.filter(b => b.id !== bookingId), { ...acceptedBooking, status: 'accepted' }]);
        toast.success("Booking berhasil diterima");
      }
    } else {
      toast.error(result.error || "Gagal menerima booking");
    }
  };

  const handleRejectBooking = async (bookingId: number, reason: string) => {
    try {
      // Use the server action, which authenticates the caller and verifies the
      // streamer owns this booking before rejecting (the previous client-side
      // update had no ownership check and wrote a non-existent column).
      const result = await rejectBooking(bookingId, reason);
      if (result?.error) {
        throw new Error(result.error);
      }

      // Optimistic UI update
      const rejectedBooking = pendingBookings.find(b => b.id === bookingId);
      if (rejectedBooking) {
        setPendingBookings(prev => prev.filter(b => b.id !== bookingId));
        setRejectedBookings(prev => [...prev, { ...rejectedBooking, status: 'rejected', reason }]);
      }
      toast.success("Booking berhasil ditolak");
    } catch (error) {
      console.error('Error rejecting booking:', error);
      toast.error("Gagal menolak booking");
    }
  };

  // Replace the simple loading div with our new LoadingScreen component
  // `isRedirecting` keeps the skeleton up while a router.push is in flight, so
  // none of the notices below flash on the way to another route.
  if (isLoading || isRedirecting) {
    return <LoadingScreen />;
  }

  // A brand landed on the host dashboard. Same wording `/streamer-setup` uses,
  // so both entry points into the host area say the same thing.
  if (isBrandAccount) {
    return (
      <DashboardNotice
        title="Halaman khusus host"
        description="Akun ini terdaftar sebagai brand, bukan host. Kamu bisa langsung mencari dan memesan host live streaming dari beranda."
      >
        <Link href="/protected" className={NOTICE_PRIMARY_ACTION}>
          Kembali ke beranda
        </Link>
      </DashboardNotice>
    );
  }

  if (error) {
    return (
      <DashboardNotice title="Dashboard belum bisa dimuat" description={error}>
        <button type="button" onClick={() => fetchData()} className={NOTICE_PRIMARY_ACTION}>
          Coba lagi
        </button>
        <Link href="/protected" className={NOTICE_SECONDARY_ACTION}>
          Kembali ke beranda
        </Link>
      </DashboardNotice>
    );
  }

  if (!userData) {
    return (
      <DashboardNotice
        title="Data host belum lengkap"
        description="Kami belum menemukan data host untuk akun ini. Selesaikan setup host dulu, lalu buka dashboard lagi."
      >
        <Link href="/streamer-setup" className={NOTICE_PRIMARY_ACTION}>
          Lanjutkan setup host
        </Link>
      </DashboardNotice>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <Navbar />
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-6 md:py-8">
        <ToastContainer />

        {/* Setup tracker: the only persistent entry point back into setup for a
            host who skipped onboarding. Renders nothing once all three
            milestones are done. */}
        <SetupTracker
          profile={streamerProfile}
          verificationStatus={verificationStatus}
          hasPayoutAccount={hasPayoutAccount}
        />

        {/* ID Card */}
        {userData && streamerStats && (
          <IDCard
            userId={userData.user_id!}
            streamerId={userData.streamer_id!}
            firstName={userData.first_name}
            stats={streamerStats}
            joinDate={streamerStats.joinDate}
            rating={streamerStats.rating}
            galleryPhotos={galleryPhotos}
            router={router}
          />
        )}

        {/* One card, one job, always the most urgent one. Above every section
            because a host between sessions should not have to work out which
            of four headings applies to them. */}
        <NowCard bookings={bookings} pendingCount={pendingBookings.length} />

        {/* The sections are numbered because they are a sequence, not a pile:
            answer requests, run the sessions, see what you earned. */}
        <div className="mt-6 space-y-3.5">
          <section
            id="permintaan"
            className="overflow-hidden rounded-panel border border-hairline bg-surface"
          >
            <SectionHeading
              index={2}
              title="Permintaan yang menunggu jawaban kamu"
              description="Brand tidak bisa membayar sampai kamu menerima."
            />
            <div className="p-5">
              <Tabs defaultValue="pending" className="w-full">
                {/* A count in a tab label is the fastest possible answer to
                    "is there anything for me here", so both carry one. */}
                <TabsList className="mb-5 flex gap-1 rounded-field bg-surface-tint p-1">
                  <TabsTrigger
                    value="pending"
                    className="flex-1 rounded-[6px] py-2 text-copy font-medium data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-none"
                  >
                    Menunggu ({pendingBookings.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="rejected"
                    className="flex-1 rounded-[6px] py-2 text-copy font-medium data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-none"
                  >
                    Ditolak ({rejectedBookings.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="pending" className="space-y-3.5">
                  {pendingBookings.length > 0 ? (
                    [...pendingBookings]
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .map((booking) => (
                        <BookingCard
                          key={booking.id}
                          booking={booking}
                          onAccept={handleAcceptBooking}
                          onReject={handleRejectBooking}
                        />
                      ))
                  ) : (
                    <div className="rounded-panel border border-dashed border-hairline-input px-5 py-10 text-center">
                      <p className="text-copy font-medium text-ink">
                        Tidak ada yang menunggu jawaban
                      </p>
                      <p className="mt-1 text-meta text-ink-soft">
                        Semua permintaan sudah kamu jawab.
                      </p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="rejected" className="space-y-3.5">
                  {rejectedBookings.length > 0 ? (
                    [...rejectedBookings]
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .map((booking) => (
                        <BookingCard
                          key={booking.id}
                          booking={booking}
                          onAccept={handleAcceptBooking}
                          onReject={handleRejectBooking}
                        />
                      ))
                  ) : (
                    <div className="rounded-panel border border-dashed border-hairline-input px-5 py-10 text-center">
                      <p className="text-meta text-ink-soft">Belum ada booking yang ditolak.</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </section>

          {/* The week, twice over, and deliberately not the same way twice:
              first what it earned, then what it holds. */}
          <section className="overflow-hidden rounded-panel border border-hairline bg-surface">
            <SectionHeading
              index={3}
              title="Ringkasan minggu ini"
              description="Yang kamu terima, sebelum Salda menambah 30% ke harga brand."
            />
            <EarningsBar bookings={bookings} />
          </section>

          <WeekGlance index={4} bookings={bookings} />

          {/* Only the sessions that still need something from the host. The
              finished ones have their own section below rather than a fourth
              tab here, so this list is short enough to act on. */}
          <section className="overflow-hidden rounded-panel border border-hairline bg-surface">
            <SectionHeading
              index={5}
              title="Sesi yang perlu kamu urus"
              description="Konfirmasi barang, mulai live, lalu akhiri sesinya."
            />
            <div className="p-5">
              <UpcomingSchedule
                bookings={openBookings}
                onStreamStart={handleStreamStart}
                onStreamEnd={handleStreamEnd}
                setBookings={setBookings}
              />
            </div>
          </section>

          <CompletedSessions index={6} bookings={bookings} />

          {/*
            The money sections. They read `payouts` and `salda_streamer_balance`,
            which did not exist until 20260806140000_payouts.sql — the bank
            details collected at onboarding had nowhere to pay into.
          */}
          {userData?.streamer_id ? (
            <>
              <MoneySections
                streamerId={userData.streamer_id}
                index={7}
                bookings={bookings}
              />
              <ListingSections
                index={10}
                price={
                  typeof streamerProfile?.price === 'string'
                    ? Number(streamerProfile.price)
                    : streamerProfile?.price ?? null
                }
                rating={streamerStats?.rating ?? null}
                city={streamerProfile?.city_slug || streamerProfile?.location || ''}
                platforms={(streamerProfile?.platform ?? '')
                  .split(',')
                  .map((value: string) => value.trim())
                  .filter(Boolean)}
                imageUrl={streamerProfile?.image_url ?? null}
                name={userData.first_name}
                isVerified={verificationStatus === 'approved'}
              />
              <PerformanceSection
                index={12}
                bookings={bookings}
                rating={streamerStats?.rating ?? null}
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

