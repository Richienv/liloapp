"use client";

import { useState, useEffect, useMemo } from 'react';
import { StreamerCard, StreamerCardSkeleton, Streamer } from "@/components/streamer-card";
import { createClient } from "@/utils/supabase/client";

import {
  MarketplaceEmptyState,
  MarketplaceFilterBar,
  MarketplaceHeading,
  EMPTY_MARKETPLACE_FILTERS,
  applyMarketplaceFilters,
  type MarketplaceFilters,
} from "../protected/_marketplace/filter-bar";

/** One grid geometry for the skeleton and the real list, so nothing reflows. */
const GRID_CLASS =
  "grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

export default function StreamersPage() {
  const [streamers, setStreamers] = useState<Streamer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<MarketplaceFilters>(EMPTY_MARKETPLACE_FILTERS);

  useEffect(() => {
    const fetchStreamers = async () => {
      const supabase = createClient();
      // Bookability rule: only an active, admin-approved streamer is listed
      // publicly. Without these filters this page renders StreamerCard directly
      // and would show accounts that have passed no verification at all.
      // Explicit columns, never `select('*')`: this runs in the browser with the
      // public anon key, and the table carries each host's `full_address` — the
      // home address brands ship to. A wildcard here hands it to anyone who
      // opens the network tab.
      const { data, error } = await supabase
        .from('streamers')
        .select('id, user_id, username, first_name, last_name, bio, location, city_slug, category, platform, price, image_url, rating, video_url, is_active, verification_status, profile_published_at')
        .eq('is_active', true)
        .eq('verification_status', 'approved');

      if (error) {
        setError('Gagal memuat daftar host. Coba muat ulang halaman ini.');
        setIsLoading(false);
      } else if (data) {
        setStreamers(data);
        setIsLoading(false);
      }
    };

    fetchStreamers();
  }, []);

  // Sorting and faceting run over the list already in memory — this page loads
  // its whole inventory in one query, so no filter interaction costs a request.
  const visibleStreamers = useMemo(
    () => applyMarketplaceFilters(streamers, filters),
    [streamers, filters],
  );

  return (
    <div className="w-full bg-canvas">
      <div className="mx-auto max-w-[1180px] px-5 pb-6 pt-10 sm:px-8 sm:pt-14">
        <MarketplaceHeading />
      </div>

      {/* The bar is rendered while the list loads too. Removing it and putting
          it back is a layout jump on a page whose first paint is the grid. */}
      <MarketplaceFilterBar
        streamers={streamers}
        filters={filters}
        onChange={setFilters}
      />

      <main className="mx-auto max-w-[1180px] px-5 pb-24 pt-8 sm:px-8">
        {error ? (
          <p className="rounded-panel border border-hairline bg-surface px-6 py-16 text-center text-copy text-ink-body">
            {error}
          </p>
        ) : isLoading ? (
          <div className={GRID_CLASS}>
            {[...Array(8)].map((_, i) => (
              <StreamerCardSkeleton key={i} />
            ))}
          </div>
        ) : visibleStreamers.length > 0 ? (
          <div className={GRID_CLASS}>
            {visibleStreamers.map((streamer) => (
              <StreamerCard key={streamer.id} streamer={streamer} />
            ))}
          </div>
        ) : (
          <MarketplaceEmptyState onClear={() => setFilters(EMPTY_MARKETPLACE_FILTERS)} />
        )}
      </main>
    </div>
  );
}
