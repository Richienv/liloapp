"use client";

import { useState, useEffect, Suspense, useMemo } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Navbar } from "@/components/ui/navbar";
import dynamic from 'next/dynamic';

import { StreamerCardSkeleton } from "@/components/streamer-card";

import {
  MarketplaceEmptyState,
  MarketplaceFilterBar,
  MarketplaceHeading,
  EMPTY_MARKETPLACE_FILTERS,
  applyMarketplaceFilters,
  type MarketplaceFilters,
} from './_marketplace/filter-bar';

// Dynamically import components
const StreamerList = dynamic(() => import("@/components/streamer-list").then(mod => mod.StreamerList), {
  loading: () => (
    <div className="grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {[...Array(8)].map((_, i) => (
        <StreamerCardSkeleton key={i} />
      ))}
    </div>
  )
});

/**
 * The one grid geometry, shared by the skeleton and the real list so nothing
 * reflows when the data lands.
 */
const GRID_CLASS =
  "grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

/**
 * The fixed navbar is `py-2 + h-12` on phones and `py-4 + h-16` from `sm` up.
 * The page used to clear it with a flat `mt-[80px]`, which left a 16px gap on
 * mobile and hid 16px of content under the bar on desktop. The filter bar
 * sticks to the same numbers, so it parks exactly against the navbar rather
 * than sliding under it.
 */
const NAV_OFFSET = "mt-[64px] sm:mt-[96px]";
const NAV_STICKY = "top-[64px] sm:top-[96px]";

export default function ProtectedPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [streamers, setStreamers] = useState<any[]>([]);
  const [isLoadingStreamers, setIsLoadingStreamers] = useState(true);
  const [filter, setFilter] = useState('');
  const [marketplaceFilters, setMarketplaceFilters] =
    useState<MarketplaceFilters>(EMPTY_MARKETPLACE_FILTERS);

  useEffect(() => {
    const validateUserAccess = async () => {
      try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
          console.error('Authentication error:', authError);
          router.push('/sign-in');
          return;
        }

        // Fetch user type from users table
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('user_type')
          .eq('id', user.id)
          .single();

        if (userError) {
          console.error('Error fetching user data:', userError);
          toast.error('Error validating user access');
          router.push('/sign-in');
          return;
        }

        // Redirect streamers to their dashboard
        if (userData?.user_type === 'streamer') {
          toast.error('Access denied. Redirecting to streamer dashboard...');
          router.push('/streamer-dashboard');
          return;
        }

        // If user type is not set or invalid, redirect to sign in
        if (!userData?.user_type || userData.user_type !== 'client') {
          toast.error('Invalid user type. Please sign in again.');
          router.push('/sign-in');
          return;
        }

        // Valid client user - proceed with data fetching
        setUser(user);
        await fetchStreamers();

      } catch (error) {
        console.error('Error in validateUserAccess:', error);
        toast.error('An unexpected error occurred');
        router.push('/sign-in');
      }
    };

    validateUserAccess();
  }, [router]);

  // Updated function for fetching streamers
  const fetchStreamers = async () => {
    setIsLoadingStreamers(true);
    try {
      const response = await fetch('/api/streamers');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch streamers');
      }

      setStreamers(data.streamers || []);
    } catch (error) {
      console.error('Error fetching streamers:', error);
      toast.error('Error loading streamers');
    } finally {
      setIsLoadingStreamers(false);
    }
  };

  const handleFilterChange = (value: string) => {
    setFilter(value);
  };

  // The navbar's search box. Kept separate from the facet bar because it is a
  // different question — "find this host" rather than "narrow this list" — and
  // it is the only thing that still searches the free-text `category` column,
  // which the reference's facet set has no field for.
  //
  // Profiles are filled in after the account exists, so platform, category,
  // price, location and rating are all nullable. Every predicate treats a
  // missing value as "does not match" rather than reading through it — one null
  // used to take the whole page down with a TypeError.
  const searched = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return streamers;

    return streamers.filter((streamer) =>
      [streamer.first_name, streamer.last_name, streamer.platform, streamer.category]
        .some((field) => String(field ?? '').toLowerCase().includes(needle)),
    );
  }, [streamers, filter]);

  const visibleStreamers = useMemo(
    () => applyMarketplaceFilters(searched, marketplaceFilters),
    [searched, marketplaceFilters],
  );

  return (
    <div className="w-full bg-canvas">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-[100] bg-surface border-b border-hairline">
        <Navbar onFilterChange={handleFilterChange} />
      </header>

      <div className={NAV_OFFSET}>
        <div className="mx-auto max-w-[1180px] px-5 pb-6 pt-10 sm:px-8 sm:pt-14">
          <MarketplaceHeading />
        </div>

        <MarketplaceFilterBar
          streamers={streamers}
          filters={marketplaceFilters}
          onChange={setMarketplaceFilters}
          stickyTopClassName={NAV_STICKY}
        />

        <main className="mx-auto max-w-[1180px] px-5 pb-24 pt-8 sm:px-8">
          <Suspense
            fallback={
              <div className={GRID_CLASS}>
                {[...Array(8)].map((_, i) => (
                  <StreamerCardSkeleton key={i} />
                ))}
              </div>
            }
          >
            {isLoadingStreamers ? (
              <div className={GRID_CLASS}>
                {[...Array(8)].map((_, i) => (
                  <StreamerCardSkeleton key={i} />
                ))}
              </div>
            ) : visibleStreamers.length > 0 ? (
              <StreamerList
                initialStreamers={visibleStreamers}
                filter={filter}
                className={GRID_CLASS}
              />
            ) : (
              <MarketplaceEmptyState
                onClear={() => {
                  setMarketplaceFilters(EMPTY_MARKETPLACE_FILTERS);
                  setFilter('');
                }}
              />
            )}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
