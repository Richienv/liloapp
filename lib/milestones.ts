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
 * A profile is publishable once it carries everything a listing renders: who
 * they are, where to reach them, what they cost, and what they do. Gallery
 * photos and the intro video are portfolio polish and deliberately excluded —
 * requiring them is what made the original form unfinishable.
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
    present(profile.bio)
  );
}

/** Which required fields are still missing, for a precise "what's left" hint. */
export function missingPublishFields(profile: PublishableProfile | null): string[] {
  const labels: [keyof PublishableProfile | "city", string, boolean][] = [
    ["username", "Username", present(profile?.username)],
    ["image_url", "Foto profil", present(profile?.image_url)],
    ["city", "Kota", present(profile?.city_slug) || present(profile?.location)],
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
      description: "Foto, kota, kategori, dan harga — sekitar 3 menit.",
      unlocks: "Profil kamu tayang di Salda",
      href: "/streamer-setup",
    },
    verify: {
      id: "verify",
      title: "Verifikasi identitas",
      description: "KTP, selfie, dan bukti kepemilikan akun live kamu.",
      unlocks: "Brand bisa mulai memesan jadwalmu",
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

/** 0–100, for a progress meter. */
export function milestoneProgress(milestones: Milestone[]): number {
  if (milestones.length === 0) return 0;
  const finished = milestones.filter((m) => m.done).length;
  return Math.round((finished / milestones.length) * 100);
}
