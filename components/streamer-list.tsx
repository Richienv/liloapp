'use client';

import { useState, useEffect, Suspense } from 'react';
import { StreamerCard, StreamerCardSkeleton, isStreamerBookable } from './streamer-card';
import { Search } from 'lucide-react';
import type { Streamer } from './streamer-card';

interface StreamerListProps {
  initialStreamers: Streamer[];
  filter: string;
  className?: string;
}

// The skeleton is imported from ./streamer-card, not redefined here.
//
// A local copy sat here — the comment above it literally read "Create a local
// skeleton component instead of importing it" — and it still described the
// pre-redesign card: a 176px-tall image, a five-star rating row, and two
// buttons at the bottom. The real card has none of those any more, so the
// placeholder and the thing it stands in for had different shapes and the grid
// visibly reflowed on load, which reads as the page breaking rather than
// finishing. One definition, in the file that owns the card.

export function StreamerList({ initialStreamers, filter, className }: StreamerListProps) {
  // Belt-and-braces: the listing queries already filter on
  // is_active + verification_status, but this is the one component every public
  // list funnels through, so an unverified streamer that slips past a caller's
  // query still never gets rendered as bookable inventory.
  const listedStreamers = initialStreamers.filter(isStreamerBookable);

  return (
    <div className={className}>
      {listedStreamers.map((streamer) => (
        <Suspense key={streamer.id} fallback={<StreamerCardSkeleton />}>
          <StreamerCard streamer={streamer} />
        </Suspense>
      ))}
    </div>
  );
}
