'use client';

import { useState, useEffect, Suspense } from 'react';
import { StreamerCard, isStreamerBookable } from './streamer-card';
import { Search } from 'lucide-react';
import type { Streamer } from './streamer-card';

interface StreamerListProps {
  initialStreamers: Streamer[];
  filter: string;
  className?: string;
}

// Create a local skeleton component instead of importing it
function StreamerCardSkeleton() {
  return (
    <div className="group relative bg-transparent w-full font-sans cursor-pointer">
      <div className="relative w-full h-44 sm:h-52 rounded-xl overflow-hidden bg-gray-200 animate-pulse"></div>
      <div className="p-3 sm:p-4 pt-2 sm:pt-3 bg-white/95 rounded-b-xl">
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-20 bg-gray-200 animate-pulse rounded"></div>
            <div className="h-4 w-12 bg-gray-200 animate-pulse rounded"></div>
          </div>
        </div>
        <div className="flex flex-col mb-1.5">
          <div className="h-4 w-24 bg-gray-200 animate-pulse rounded"></div>
          <div className="h-4 w-16 bg-gray-200 animate-pulse rounded mt-1"></div>
        </div>
        <div className="h-4 w-32 bg-gray-200 animate-pulse rounded mb-2"></div>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-4 w-16 bg-gray-200 animate-pulse rounded"></div>
          <div className="h-4 w-16 bg-gray-200 animate-pulse rounded"></div>
        </div>
        <div className="flex gap-1.5">
          <div className="h-8 w-full bg-gray-200 animate-pulse rounded"></div>
          <div className="h-8 w-8 bg-gray-200 animate-pulse rounded"></div>
        </div>
      </div>
    </div>
  );
}

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
