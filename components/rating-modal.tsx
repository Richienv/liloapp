import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Star } from 'lucide-react';
import Image from 'next/image';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/components/ui/use-toast";

/** What each star means, said out loud. The number alone is not a scale. */
const RATING_LABEL: Record<number, string> = {
  1: 'Sangat kurang',
  2: 'Kurang',
  3: 'Cukup',
  4: 'Bagus',
  5: 'Sangat bagus',
};

interface RatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: number;
  streamerId: number;
  streamerName: string;
  streamerImage: string;
  startDate: string;
  endDate: string;
  onSubmit: () => void;
}

export default function RatingModal({
  isOpen,
  onClose,
  bookingId,
  streamerId,
  streamerName,
  streamerImage,
  startDate,
  endDate,
  onSubmit
}: RatingModalProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { toast } = useToast();

  const handleSubmit = async () => {
    if (rating === 0) {
      setError("Pilih bintang dulu sebelum mengirim.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const supabase = createClient();

    try {
      // 1. Get the client's name
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const { data: clientData, error: clientError } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', userData.user.id)
        .single();
      if (clientError) throw clientError;

      const clientName = `${clientData.first_name} ${clientData.last_name}`;

      // 2. Insert the testimonial
      const { data: testimonialData, error: testimonialError } = await supabase
        .from('testimonials')
        .insert({
          streamer_id: streamerId,
          client_name: clientName,
          comment: comment,
          rating: rating
        })
        .single();

      if (testimonialError) throw testimonialError;

      console.log('Testimonial added successfully:', testimonialData);

      // 3. Insert the rating into the new streamer_ratings table
      const { data: ratingData, error: ratingError } = await supabase
        .from('streamer_ratings')
        .insert({
          streamer_id: streamerId,
          rating: rating
        })
        .single();

      if (ratingError) throw ratingError;

      console.log('Rating added successfully:', ratingData);

      // 4. Update the booking status to 'completed'
      const { error: bookingError } = await supabase
        .from('bookings')
        .update({ status: 'completed' })
        .eq('id', bookingId);

      if (bookingError) throw bookingError;

      console.log('Booking status updated to completed');
      toast({
        title: "Penilaian terkirim",
        description: "Terima kasih, masukan kamu membantu host lain juga."
      });
      onSubmit();
      onClose();
    } catch (error) {
      console.error('Error submitting rating:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
      }
      if (typeof error === 'object' && error !== null && 'details' in error) {
        console.error('Error details:', (error as any).details);
      }
      toast({
        // This hook's props carry no `variant`, so the failure tone is the
        // destructive text-on-tint pair rather than a solid red block.
        className: "border-destructive-emphasis/20 bg-destructive-subtle text-destructive-emphasis",
        title: "Penilaian gagal dikirim",
        description: "Coba lagi sebentar lagi."
      });
      setError("Penilaian gagal dikirim. Coba lagi sebentar lagi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="gap-0 overflow-hidden rounded-frame border border-hairline bg-surface p-0 sm:max-w-[440px]">
        <div className="space-y-5 p-5 sm:p-6">
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="font-serif text-title font-semibold text-ink">
              Beri penilaian
            </DialogTitle>
            {/*
              The blue notice box is gone. It was a filled tint carrying a
              sentence, which put a second accent above a form whose only
              accent should be the button that ends it — and the sentence is
              the subtitle anyway.
            */}
            <DialogDescription className="text-meta text-ink-soft">
              Penilaian kamu membantu host memperbaiki sesi berikutnya.
            </DialogDescription>
          </DialogHeader>

          {/* The session being rated, as one row that cannot wrap. */}
          <div className="flex min-w-0 items-center gap-3 rounded-panel border border-hairline px-4 py-3">
            <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface-tint">
              <Image
                src={streamerImage || '/default-avatar.png'}
                alt={streamerName}
                fill
                sizes="40px"
                className="object-cover"
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-ui font-medium text-ink">{streamerName}</p>
              <p className="numeric truncate text-meta text-ink-soft">
                {format(new Date(startDate), "d MMM yyyy", { locale: idLocale })}
                <span className="text-ink-ghost"> · </span>
                {format(new Date(startDate), "HH:mm")}–{format(new Date(endDate), "HH:mm")}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {/*
              Ink stars, not gold ones. Gold is a fifth hue on a screen with a
              two-colour budget, and a filled dark star against an empty ghost
              one is a stronger read at 20px than amber against grey.
            */}
            <div className="flex items-center gap-3">
              <div className="flex gap-1" role="radiogroup" aria-label="Nilai sesi ini">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    role="radio"
                    aria-checked={rating === star}
                    aria-label={`${star} — ${RATING_LABEL[star]}`}
                    onClick={() => setRating(star)}
                    className="grid h-8 w-8 place-items-center rounded-chip transition-colors hover:bg-surface-tint"
                  >
                    <Star
                      className={cn(
                        "h-5 w-5 transition-colors",
                        star <= rating ? "fill-ink text-ink" : "fill-none text-ink-ghost"
                      )}
                    />
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <span className="text-copy text-ink-body">{RATING_LABEL[rating]}</span>
              )}
            </div>

            <textarea
              className="w-full resize-none rounded-field border border-hairline-input bg-surface px-3 py-2.5 text-copy text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-hairline-strong"
              rows={3}
              placeholder="Tulis komentar (opsional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />

            {error && (
              <p role="alert" className="text-meta text-destructive-emphasis">
                {error}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-nowrap items-center justify-end gap-3 border-t border-hairline-soft bg-surface-tint p-5 sm:p-6">
          <Button
            variant="quiet"
            size="action-secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Nanti saja
          </Button>
          <Button
            variant="brand"
            size="action"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Mengirim…' : 'Kirim penilaian'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}