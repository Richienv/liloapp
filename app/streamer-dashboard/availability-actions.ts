"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";

/**
 * The "Terima booking" switch in the host sidebar.
 *
 * WHY THIS IS A SERVER ACTION AND NOT LOCAL STATE
 *
 * The design file draws this toggle and drives it from `state.online`, which is
 * fine for a mockup and dangerous in a product: a host who switches it off,
 * believing they have stopped appearing in search, would keep receiving
 * bookings. A switch that looks like it works and does not is worse than no
 * switch, because it is acted on.
 *
 * It needs no new column. `streamers.is_active` already exists and already
 * means this — from its own comment in
 * supabase/migrations/20260805120000_signup_trust_and_seo.sql:
 *
 *   "Streamer-controlled availability switch. False hides the profile from
 *    search and booking without deleting it. Existing rows default to true so
 *    nobody disappears when this ships."
 *
 * and app/api/streamers/route.ts filters `.eq('is_active', true)` on every
 * marketplace read. Flipping it here genuinely removes the host from search.
 */

export interface AvailabilityResult {
  success: boolean;
  /** The value actually stored, so the caller can settle its optimistic state. */
  accepting?: boolean;
  error?: string;
}

/**
 * Turn the caller's own listing on or off.
 *
 * `streamerId` is NOT taken from the client. A server action is a POSTable
 * endpoint, so anyone can call this with any id; the update is scoped by
 * `user_id = auth.uid()` instead, which means the worst a forged id can do is
 * update zero rows.
 */
export async function setAcceptingBookings(accepting: boolean): Promise<AvailabilityResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Kamu perlu masuk dulu." };
  }

  const { data, error } = await supabase
    .from("streamers")
    .update({ is_active: accepting })
    .eq("user_id", user.id)
    .select("is_active")
    .maybeSingle();

  if (error) {
    console.error("[availability] toggle failed", error);
    return { success: false, error: "Gagal menyimpan. Coba lagi sebentar lagi." };
  }

  if (!data) {
    // No row matched — the caller is signed in but is not a host.
    return { success: false, error: "Akun kamu bukan akun host." };
  }

  // The marketplace reads this, so its caches have to go too.
  revalidatePath("/streamer-dashboard");
  revalidatePath("/streamers");
  revalidatePath("/protected");

  return { success: true, accepting: data.is_active };
}
