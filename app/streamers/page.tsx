"use client";

import { useState, useEffect } from 'react';
import { StreamerCard, Streamer } from "@/components/streamer-card";
import { createClient } from "@/utils/supabase/client";

export default function StreamersPage() {
  const [streamers, setStreamers] = useState<Streamer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setError('Failed to fetch streamers');
        setIsLoading(false);
      } else if (data) {
        setStreamers(data);
        setIsLoading(false);
      }
    };

    fetchStreamers();
  }, []);

  if (isLoading) {
    return <div className="container mx-auto px-4 py-8">Loading...</div>;
  }

  if (error) {
    return <div className="container mx-auto px-4 py-8">Error: {error}</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Available Streamers</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"> {/* Adjusted grid and gap */}
        {streamers.map((streamer) => (
          <div key={streamer.id} className="flex justify-center">
            <StreamerCard streamer={streamer} />
          </div>
        ))}
      </div>
    </div>
  );
}