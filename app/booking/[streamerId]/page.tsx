import { notFound, redirect } from "next/navigation";

import { BookingFlow } from "@/components/booking/booking-flow";
import type { Streamer } from "@/components/streamer-card";
import { createClient } from "@/utils/supabase/server";

export const metadata = {
  title: "Booking Host | Salda",
  // A booking screen is per-user state built from a query the visitor has not
  // made yet. There is nothing here for a search engine to index, and indexing
  // it would put a half-filled form in results.
  robots: { index: false, follow: false },
};

// The calendar is drawn from live availability. A cached render would offer
// slots that were taken minutes ago and fail at payment.
export const dynamic = "force-dynamic";

/**
 * Booking used to be a modal inside the marketplace card. It is a route now, so
 * it needs the three things the modal got for free from its parent: a session,
 * the streamer row, and a decision about what to do when either is missing.
 */
export default async function BookingPage({
  params,
}: {
  params: { streamerId: string };
}) {
  // The segment is a string from the URL and the column is a bigint. A
  // non-numeric value must 404 rather than reach PostgREST, which would answer
  // a malformed filter with a 400 that surfaces as a blank screen.
  const streamerId = Number(params.streamerId);
  if (!Number.isInteger(streamerId) || streamerId <= 0) {
    notFound();
  }

  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Booking writes rows owned by a client account, and every query inside the
  // flow reads the signed-in user's city to work out the shipping lead time.
  // Sending an anonymous visitor into it would produce a form that silently
  // computes the wrong dates and then fails at checkout.
  if (!user) {
    redirect(`/sign-in?redirect_to=/booking/${streamerId}`);
  }

  // Explicit columns, matching /streamers and /api/streamers. `select('*')` on
  // this table leaks `full_address` — the address the KYC pipeline exists to
  // protect — into a client component's props.
  const { data: streamer, error } = await supabase
    .from("streamers")
    .select(
      "id, user_id, username, first_name, last_name, bio, location, city_slug, category, platform, price, image_url, rating, video_url, is_active, verification_status",
    )
    .eq("id", streamerId)
    .maybeSingle();

  if (error) {
    // Loudly, not as a 404. A broken query and a host who does not exist are
    // different problems, and conflating them is how the public profile pages
    // hid a missing column for weeks.
    console.error(`[booking/${streamerId}] could not load the streamer`, error);
    throw error;
  }

  if (!streamer) {
    notFound();
  }

  return (
    <main className="min-h-screen w-full bg-canvas">
      <BookingFlow streamer={streamer as Streamer} />
    </main>
  );
}
