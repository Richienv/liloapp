/**
 * Streamer setup, expressed as three finishable milestones instead of one wall.
 *
 * The old signup asked for ~19 fields, a 4:5 photo, a video and five portfolio
 * images before an account existed — 30 to 60 minutes, in one sitting, with no
 * way to stop. Splitting it into three milestones changes the shape of the work:
 * each is a few minutes, each unlocks something concrete, and progress survives
 * leaving the page.
 *
 * The milestones are derived from data the streamer already has, not stored as a
 * separate flag, so they cannot drift out of sync with reality.
 */

export type MilestoneId = "publish" | "verify" | "payout";

export interface Milestone {
  id: MilestoneId;
  /** Indonesian, shown directly in the UI. */
  title: string;
  description: string;
  /** What finishing it gives the streamer — the reason to bother. */
  unlocks: string;
  href: string;
  done: boolean;
  /** True when this is the one thing they should do next. */
  current: boolean;
}

/** The fields a profile needs before a brand can meaningfully see it listed. */
export interface PublishableProfile {
  username?: string | null;
  image_url?: string | null;
  city_slug?: string | null;
  location?: string | null;
  category?: string | null;
  platform?: string | null;
  price?: number | string | null;
  bio?: string | null;
  /**
   * Street address the brand ships the product to. Not portfolio polish:
   * shipping a physical product to the host is the premise of the marketplace,
   * and without this the brand's shipping panel is empty *after* they have paid.
   *
   * Every caller selects this column. It was briefly tolerated as `undefined`
   * (meaning "not selected") while `readAccountState` still used a column list
   * that predated the field; treating a missing column as a missing value there
   * would have routed every streamer to setup on sign-in, including ones who
   * already had an address and so could never satisfy the check — a permanent
   * redirect loop. That gap is closed, so absent now honestly means absent.
   */
  full_address?: string | null;
}

export interface MilestoneInput {
  profile: PublishableProfile | null;
  verificationStatus?: string | null;
  hasPayoutAccount?: boolean;
}

function present(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  return true;
}

/**
 * A profile is publishable once it carries everything a listing renders and
 * everything a booking needs: who they are, where to reach them, where to ship
 * to, what they cost, and what they do. Gallery photos and the intro video are
 * portfolio polish and deliberately excluded — requiring them is what made the
 * original form unfinishable.
 *
 * MIRRORED IN SQL. `salda_stamp_streamer_published_at()` in
 * supabase/migrations/20260806000000_account_first_revamp.sql stamps
 * `streamers.profile_published_at` from a hand-ported copy of this predicate,
 * and that copy does NOT yet test `full_address`. The two now disagree: the
 * trigger will stamp a profile as published one save before this function calls
 * it publishable. `profile_published_at` is only an observation (nothing reads
 * it to decide visibility), so the disagreement costs an imprecise funnel metric
 * rather than a wrongly-listed host — but it needs a migration to add
 * `and coalesce(btrim(new.full_address), '') <> ''` to the trigger body and to
 * the backfill predicate.
 */
export function isProfilePublishable(profile: PublishableProfile | null): boolean {
  if (!profile) return false;

  const price = typeof profile.price === "string" ? Number(profile.price) : profile.price;

  return (
    present(profile.username) &&
    present(profile.image_url) &&
    (present(profile.city_slug) || present(profile.location)) &&
    present(profile.category) &&
    present(profile.platform) &&
    present(price) &&
    present(profile.bio) &&
    present(profile.full_address)
  );
}

/** Which required fields are still missing, for a precise "what's left" hint. */
export function missingPublishFields(profile: PublishableProfile | null): string[] {
  const labels: [keyof PublishableProfile | "city", string, boolean][] = [
    ["username", "Username", present(profile?.username)],
    ["image_url", "Foto profil", present(profile?.image_url)],
    ["city", "Kota", present(profile?.city_slug) || present(profile?.location)],
    // Right after the city, because the two are one thought: which city, then
    // where in it. Same tolerance for an unselected column as above.
    ["full_address", "Alamat lengkap", present(profile?.full_address)],
    ["category", "Kategori", present(profile?.category)],
    ["platform", "Platform", present(profile?.platform)],
    ["price", "Harga per jam", present(
      typeof profile?.price === "string" ? Number(profile.price) : profile?.price,
    )],
    ["bio", "Deskripsi singkat", present(profile?.bio)],
  ];

  return labels.filter(([, , ok]) => !ok).map(([, label]) => label);
}

export function streamerMilestones(input: MilestoneInput): Milestone[] {
  const published = isProfilePublishable(input.profile);
  const verified = input.verificationStatus === "approved";
  const paid = Boolean(input.hasPayoutAccount);

  const done: Record<MilestoneId, boolean> = {
    publish: published,
    verify: verified,
    payout: paid,
  };

  // The next unfinished milestone in order is the one to nudge; verification
  // deliberately comes before payout because it is what blocks earning at all.
  const order: MilestoneId[] = ["publish", "verify", "payout"];
  const current = order.find((id) => !done[id]) ?? null;

  const specs: Record<MilestoneId, Omit<Milestone, "done" | "current">> = {
    publish: {
      id: "publish",
      title: "Lengkapi profil",
      description:
        "Foto, kota, alamat pengiriman, kategori, dan harga — sekitar 4 menit.",
      // Honest about what this step actually buys. Finishing it does NOT put the
      // profile on Salda: listing needs `is_active = true AND
      // verification_status = 'approved'`, and only an admin sets the second one
      // (see supabase/SCHEMA_REFERENCE.md). Promising "tayang" here made step 2
      // look optional, which it never was.
      unlocks: "Profil siap diajukan untuk ditinjau tim Salda",
      href: "/streamer-setup",
    },
    verify: {
      id: "verify",
      title: "Verifikasi identitas",
      description: "KTP, selfie, dan bukti kepemilikan akun live kamu.",
      unlocks: "Profil tayang di Salda dan brand bisa memesan jadwalmu",
      href: "/streamer-verification",
    },
    payout: {
      id: "payout",
      title: "Tambah rekening",
      description: "Nomor rekening untuk menerima pembayaran.",
      unlocks: "Penghasilan bisa dicairkan",
      href: "/streamer-setup/rekening",
    },
  };

  return order.map((id) => ({
    ...specs[id],
    done: done[id],
    current: current === id,
  }));
}

// ---------------------------------------------------------------------------
// The starting schedule
// ---------------------------------------------------------------------------

/**
 * Publishing a profile also has to produce a bookable calendar.
 *
 * `BookingCalendar` greys out every date for which `streamer_active_schedules`
 * has no row, so a host who finished all three milestones and was approved by an
 * admin still could not be booked: the calendar was entirely red. Nothing in the
 * milestones ever wrote that row — /streamer-schedule did, and nothing sent a
 * new host there.
 *
 * So the profile write seeds a starting week (see `saveStreamerProfile`). The
 * window below is the default, and it is deliberately wide-ish:
 *
 *   - It must be at least three hourly slots on any day it covers, because the
 *     booking form refuses a session shorter than 2 consecutive hours.
 *   - It spans both the daytime and the evening live-commerce peaks, so a brand
 *     browsing at any hour finds something rather than nothing.
 *   - It is an opening offer, not a commitment: every booking still arrives as
 *     `pending` and the host accepts or rejects it by hand.
 *
 * Seeded once and only when the host has no schedule at all, so it can never
 * overwrite hours somebody actually chose.
 */
export const DEFAULT_SCHEDULE_START_TIME = "09:00:00";
export const DEFAULT_SCHEDULE_END_TIME = "21:00:00";

/** Indonesian, for the copy that tells the host what we set for them. */
export const DEFAULT_SCHEDULE_LABEL = "09.00–21.00 setiap hari";

export interface ScheduleDay {
  /** 0 = Sunday … 6 = Saturday, matching `Date.getDay()`. */
  day: number;
  slots: { start: string; end: string }[];
}

/**
 * The JSON shape `streamer_active_schedules.schedule` holds and
 * `components/streamer-card.tsx` indexes by `date.getDay()` — so the array must
 * stay in day order, with an entry for every day, even an empty one.
 */
export function buildDefaultWeeklySchedule(): ScheduleDay[] {
  return Array.from({ length: 7 }, (_, day) => ({
    day,
    slots: [{ start: DEFAULT_SCHEDULE_START_TIME, end: DEFAULT_SCHEDULE_END_TIME }],
  }));
}

/** 0–100, for a progress meter. */
export function milestoneProgress(milestones: Milestone[]): number {
  if (milestones.length === 0) return 0;
  const finished = milestones.filter((m) => m.done).length;
  return Math.round((finished / milestones.length) * 100);
}
