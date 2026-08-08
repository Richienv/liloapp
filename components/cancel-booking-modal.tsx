"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
        title: "Alasan belum diisi",
        description: "Tulis dulu alasan kamu sebelum melanjutkan.",
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
        title: isReschedule ? "Pengajuan reschedule terkirim" : "Booking dibatalkan",
        description: isReschedule
          ? "Permintaan reschedule kamu sudah dikirim ke host."
          : "Booking kamu sudah dibatalkan.",
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
        title: "Permintaan gagal diproses",
        description: "Coba lagi sebentar lagi.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="gap-0 overflow-hidden rounded-frame border border-hairline bg-surface p-0 sm:max-w-[460px]">
        <div className="space-y-5 p-5 sm:p-6">
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="font-serif text-title font-semibold text-ink">
              {isReschedule ? 'Pengajuan reschedule' : 'Pembatalan booking'}
            </DialogTitle>
            <DialogDescription className="text-meta text-ink-soft">
              {isReschedule
                ? 'Host akan melihat alasan ini sebelum menyetujui jadwal baru.'
                : 'Host akan melihat alasan ini. Baca dulu ketentuan di bawah.'}
            </DialogDescription>
          </DialogHeader>

          {/*
            The policy was a bare bulleted list in body ink, which made four
            rules that cost real money read like fine print. It is a bordered
            block now, each rule on its own hairline-separated row, with the
            money figure in the mono face so the three refund tiers line up
            and can be compared at a glance.
          */}
          <div className="overflow-hidden rounded-panel border border-hairline">
            <p className="border-b border-hairline-soft bg-surface-tint px-4 py-2 font-mono text-tiny uppercase text-ink-ghost">
              Kebijakan pembatalan &amp; pengembalian dana
            </p>
            <ul className="text-copy text-ink-body">
              <li className="border-b border-hairline-soft px-4 py-2.5">
                Pembatalan <span className="numeric">24</span> jam sebelum jadwal: dana kembali penuh (<span className="numeric">100%</span>)
              </li>
              <li className="border-b border-hairline-soft px-4 py-2.5">
                Kurang dari <span className="numeric">24</span> jam: dikenakan biaya pembatalan <span className="numeric">50%</span>
              </li>
              <li className="border-b border-hairline-soft px-4 py-2.5">
                Kurang dari <span className="numeric">3</span> jam sebelum jadwal: tidak ada pengembalian dana
              </li>
              <li className="px-4 py-2.5">
                Reschedule hanya bisa <span className="numeric">1×</span> dan minimal <span className="numeric">6</span> jam sebelum jadwal
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <label htmlFor="cancel-reason" className="block text-copy font-medium text-ink">
              {isReschedule
                ? 'Alasan pengajuan reschedule'
                : 'Alasan pembatalan'}
            </label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Tulis alasan kamu di sini…"
              className="h-24 resize-none rounded-field border-hairline-input bg-surface text-copy text-ink placeholder:text-ink-faint focus-visible:border-hairline-strong focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        </div>

        {/*
          The pair never stacks. `flex-nowrap` here rather than the default
          wrap, because "Kembali" landing under "Lanjutkan" would put the way
          out below the irreversible action.
        */}
        <div className="flex flex-nowrap items-center justify-end gap-3 border-t border-hairline-soft bg-surface-tint p-5 sm:p-6">
          <Button
            variant="quiet"
            size="action-secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Kembali
          </Button>
          {/*
            Text on a tint, not a solid red block. Cancelling is never the
            primary action of a screen, and a filled red button reads exactly
            like one.
          */}
          <Button
            variant={isReschedule ? 'brand' : 'danger'}
            size="action"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Memproses…' : 'Lanjutkan'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 