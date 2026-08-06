import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Star } from 'lucide-react';
import Image from 'next/image';
import { format } from 'date-fns';
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/components/ui/use-toast";

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
      setError("Please select a rating before submitting.");
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
        title: "Rating Submitted",
        description: "Thank you for your feedback!"
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
        title: "Error",
        description: "Failed to submit rating. Please try again.",
        className: "bg-destructive"
      });
      setError("Failed to submit rating. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-left text-lg">Rate Your Experience</DialogTitle>
        </DialogHeader>
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4 text-xs text-blue-700">
          Your rating would help the streamer to enhance their services in the future.
        </div>
        <div className="flex flex-col items-start space-y-3 text-sm">
          <div className="flex items-center space-x-3">
            <Image
              src={streamerImage || '/default-avatar.png'}
              alt={streamerName}
              width={50}
              height={50}
              className="rounded-full"
            />
            <h3 className="font-semibold">{streamerName}</h3>
          </div>
          <div className="text-xs text-ink-soft">
            {format(new Date(startDate), "MMM d yyyy")} ({format(new Date(startDate), "HH:mm")}-{format(new Date(endDate), "HH:mm")})
          </div>
          <div className="flex space-x-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`cursor-pointer w-5 h-5 ${
                  star <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-ink-ghost'
                }`}
                onClick={() => setRating(star)}
              />
            ))}
          </div>
          <textarea
            className="w-full p-2 border rounded-md text-xs"
            rows={3}
            placeholder="Leave a comment (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <Button 
            onClick={handleSubmit} 
            className="w-full text-xs" 
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Rating'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}