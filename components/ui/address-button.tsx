"use client";

import { useState, useEffect } from 'react';
import { MapPin } from 'lucide-react';
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

  return (
    <button
      onClick={onShowAddress}
      className={`px-3 py-1.5 bg-brand rounded-lg transition-all 
                 duration-200 ease-in-out flex items-center gap-2 text-white 
                 text-sm font-medium ${className || ''}`}
    >
      <MapPin className="h-4 w-4" />
      Alamat Lengkap
    </button>
  );
} 