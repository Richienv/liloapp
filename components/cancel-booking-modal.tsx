"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface CancelBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: number;
  isReschedule?: boolean;
  streamer_id?: number;
  start_time?: string;
}

export default function CancelBookingModal({ 
  isOpen, 
  onClose, 
  bookingId,
  streamer_id,
  start_time,
  isReschedule = false
}: CancelBookingModalProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Mohon berikan alasan",
      });
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    try {
      // First try to refresh the schema cache
      await supabase.rpc('reload_schema_cache');

      // Then update the booking status
      const { data, error: bookingError } = await supabase
        .from('bookings')
        .update({ 
          status: isReschedule ? 'reschedule_requested' : 'cancelled',
          reason: reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId)
        .select();

      if (bookingError) {
        // If error still persists, try alternative update
        const { error: altError } = await supabase.rpc('update_booking_status', {
          p_booking_id: bookingId,
          p_status: isReschedule ? 'reschedule_requested' : 'cancelled',
          p_reason: reason
        });

        if (altError) {
          console.error('Booking update error:', altError);
          throw altError;
        }
      }

      // Create notification for streamer
      if (streamer_id) {
        const { error: notificationError } = await supabase
          .from('notifications')
          .insert({
            user_id: streamer_id,
            message: isReschedule 
              ? `Klien mengajukan permintaan reschedule untuk booking pada ${start_time ? format(new Date(start_time), 'dd MMM yyyy HH:mm') : '-'}. Alasan: ${reason}`
              : `Klien membatalkan booking pada ${start_time ? format(new Date(start_time), 'dd MMM yyyy HH:mm') : '-'}. Alasan: ${reason}`,
            type: isReschedule ? 'reschedule_request' : 'booking_cancelled',
            booking_id: bookingId,
            created_at: new Date().toISOString()
          });

        if (notificationError) {
          console.error('Notification error:', notificationError);
          // Continue even if notification fails
        }
      }

      toast({
        title: isReschedule ? "Pengajuan Reschedule Berhasil" : "Pembatalan Berhasil",
        description: isReschedule 
          ? "Permintaan reschedule kamu telah dikirim ke streamer" 
          : "Booking kamu telah dibatalkan",
      });

      // Add a small delay before redirecting
      setTimeout(() => {
        router.push('/protected');
        router.refresh();
      }, 1500);

    } catch (error) {
      console.error('Error processing request:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal memproses permintaan kamu. Silakan coba lagi.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isReschedule ? 'Pengajuan Reschedule' : 'Pembatalan Booking'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="mt-4">
          <div className="mb-6 text-sm">
            <h4 className="font-semibold mb-2">Kebijakan Pembatalan & Pengembalian Dana:</h4>
            <ul className="list-disc pl-5 space-y-1 text-gray-600">
              <li>Pembatalan 24 jam sebelum jadwal akan mendapatkan pengembalian dana penuh (100%)</li>
              <li>Pembatalan kurang dari 24 jam akan dikenakan biaya pembatalan sebesar 50%</li>
              <li>Pembatalan kurang dari 3 jam sebelum jadwal tidak mendapatkan pengembalian dana</li>
              <li>Pengajuan reschedule hanya dapat dilakukan 1x dan minimal 6 jam sebelum jadwal</li>
            </ul>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {isReschedule 
                ? 'Mohon berikan alasan pengajuan reschedule:' 
                : 'Mohon berikan alasan pembatalan:'}
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Tuliskan alasan kamu di sini..."
              className="h-24"
            />
          </div>

          <div className="mt-6 flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Kembali
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className={isReschedule 
                ? "bg-orange-500 hover:bg-orange-600" 
                : "bg-red-500 hover:bg-red-600"}
            >
              {isSubmitting ? 'Memproses...' : 'Lanjutkan'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 