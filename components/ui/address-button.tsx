"use client";

import { useState, useEffect } from 'react';
import { MapPin } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";

interface AddressButtonProps {
  streamerId: number;
  clientId: string;
  onShowAddress: () => void;
  className?: string;
}

async function checkBookingStatus(streamerId: number, clientId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from('bookings')
    .select('id')
    .eq('streamer_id', streamerId)
    .eq('client_id', clientId)
    .eq('status', 'accepted')
    .single();

  return {
    hasAcceptedBooking: !!data,
    bookingId: data?.id
  };
}

export function AddressButton({ streamerId, clientId, onShowAddress, className }: AddressButtonProps) {
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    checkBookingStatus(streamerId, clientId).then(
      ({ hasAcceptedBooking }) => setShowButton(hasAcceptedBooking)
    );
  }, [streamerId, clientId]);

  if (!showButton) return null;

  /*
    The quiet variant, not a hand-rolled blue block.

    This button lives inside a message thread, where the accent belongs to
    "send". A filled blue chip alongside the host's own messages read as the
    primary action of the conversation, which looking up an address is not.
    Going through the shared component also means it inherits the pair's height
    and radius instead of `px-3 py-1.5` guessing at them.
  */
  return (
    <Button
      variant="quiet"
      size="action-compact"
      onClick={onShowAddress}
      // 36px, because this one sits in a conversation header beside a 40px
      // avatar rather than at the foot of a card.
      className={cn("h-9 px-3.5", className)}
    >
      <MapPin className="mr-2 h-4 w-4" />
      Alamat lengkap
    </Button>
  );
} 