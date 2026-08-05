"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getCityBySlug } from "@/lib/cities";
import { PRICE_BANDS } from "@/lib/pricing-suggestions";
import {
  isProfilePublishable,
  missingPublishFields,
  type PublishableProfile,
} from "@/lib/milestones";
import { USERNAME_MAX, validateUsername, withSuffix } from "@/lib/username";

/**
 * Write path for the three-milestone streamer setup.
 *
 * Everything here goes through the session-bound client so RLS applies on top
 * of our own checks — a bug in this file must not become a way to write another
 * streamer's row or bank account.
 *
 * Two things are deliberately never written here:
 *   - `verification_status`, which a database trigger pins to admin/service-role
 *     writes only. Milestone 2 lives in /streamer-verification and is reviewed
 *     by a human.
 *   - `streamer_payout_accounts.verified_at`, which means "we checked this name
 *     against the bank" and can only ever be set by the disbursement job.
 */

export interface StreamerSetupResult {
  success: boolean;
  error?: string;
}

/** Postgres unique-violation. Used to tell "username taken" from a real fault. */
const UNIQUE_VIOLATION = "23505";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** A phone photo is well under this; anything larger is a screenshot of a screenshot. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Anything below this is a typo (Rp 5.000/jam is not a real rate), not a choice. */
const MIN_PRICE = 10_000;
const MAX_PRICE = 50_000_000;

const BIO_MIN = 20;
const BIO_MAX = 1_000;

/** The only two places Salda brands actually stream. Stored comma-joined. */
const PLATFORMS = ["TikTok", "Shopee"];

const GENERIC_ERROR = "Terjadi kesalahan. Silakan coba lagi.";
const SESSION_EXPIRED = "Sesi kamu sudah berakhir. Silakan masuk lagi.";
const NOT_A_HOST =
  "Akun ini bukan akun host, jadi tidak ada profil host yang bisa disimpan.";

// ---------------------------------------------------------------------------
// Banks
// ---------------------------------------------------------------------------

export interface PayoutBank {
  /** Identifier handed to the disbursement provider. */
  code: string;
  name: string;
}

/**
 * The banks that cover the overwhelming majority of Indonesian hosts, plus an
 * explicit escape hatch. A short list is the point: a 140-entry dropdown is a
 * decision, eleven named buttons is recognition.
 */
const BANKS: PayoutBank[] = [
  { code: "bca", name: "BCA" },
  { code: "bni", name: "BNI" },
  { code: "bri", name: "BRI" },
  { code: "mandiri", name: "Mandiri" },
  { code: "cimb", name: "CIMB Niaga" },
  { code: "permata", name: "Permata" },
  { code: "danamon", name: "Danamon" },
  { code: "btn", name: "BTN" },
  { code: "bsi", name: "Bank Syariah Indonesia (BSI)" },
  { code: "jago", name: "Bank Jago" },
  { code: "seabank", name: "SeaBank" },
  { code: "other", name: "Bank lainnya" },
];

const BANK_BY_CODE = new Map(BANKS.map((bank) => [bank.code, bank]));

/**
 * Exposed as an async function rather than a const because a "use server"
 * module may only export async functions — the payout page needs the same list
 * the validator uses, and duplicating it in the page is how the two drift apart.
 */
export async function listPayoutBanks(): Promise<PayoutBank[]> {
  return BANKS;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

/** "150.000" / "Rp 150000" / "150000" all mean the same number. */
function parseRupiah(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

function fileExtension(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  return "jpg";
}

/**
 * The streamer row the milestones are computed from. Selected explicitly so the
 * shape lines up with `PublishableProfile` and a schema change surfaces here
 * rather than silently as a missing field.
 */
const PROFILE_COLUMNS =
  "id, username, image_url, city_slug, location, category, platform, price, bio, profile_published_at";

interface StreamerRow extends PublishableProfile {
  id: number;
  profile_published_at?: string | null;
}

async function requireStreamerContext() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, streamer: null, error: SESSION_EXPIRED };
  }

  const { data: streamer, error } = await supabase
    .from("streamers")
    .select(PROFILE_COLUMNS)
    .eq("user_id", user.id)
    .maybeSingle<StreamerRow>();

  if (error) {
    console.error("Streamer setup: could not read streamer row", error);
    return { supabase, user, streamer: null, error: GENERIC_ERROR };
  }

  return { supabase, user, streamer, error: null as string | null };
}

// ---------------------------------------------------------------------------
// Milestone 1 — publish the profile
// ---------------------------------------------------------------------------

/** Category labels we have a price band for; used to reject junk input. */
const KNOWN_CATEGORIES = new Set(
  PRICE_BANDS.map((band) => band.category.toLowerCase()),
);

/**
 * Save the seven fields `isProfilePublishable` requires, and nothing else.
 *
 * Gallery photos and the intro video are portfolio polish and are deliberately
 * not collected here — requiring them is exactly what made the old signup
 * unfinishable.
 *
 * Expected FormData fields:
 *   username, city_slug, category, platform (comma-joined), price, bio,
 *   image (File, optional once a photo is already on file)
 */
export async function saveStreamerProfile(
  formData: FormData,
): Promise<StreamerSetupResult> {
  const { supabase, user, streamer, error: contextError } =
    await requireStreamerContext();

  if (contextError) return { success: false, error: contextError };
  if (!user) return { success: false, error: SESSION_EXPIRED };

  // ---- Validate everything that costs nothing before touching storage. ----

  const usernameCheck = validateUsername(text(formData, "username"));
  if (!usernameCheck.ok) {
    return { success: false, error: usernameCheck.reason };
  }
  const username = usernameCheck.username;

  const city = getCityBySlug(text(formData, "city_slug"));
  if (!city) {
    return { success: false, error: "Pilih kota kamu dari daftar." };
  }

  const category = text(formData, "category");
  if (!category) {
    return { success: false, error: "Pilih kategori produk yang kamu bawakan." };
  }
  // A legacy value already sitting on the row stays acceptable, so editing an
  // old profile never fails on a category we simply stopped offering.
  const categoryIsKnown =
    KNOWN_CATEGORIES.has(category.toLowerCase()) ||
    category.toLowerCase() === (streamer?.category ?? "").toLowerCase();
  if (!categoryIsKnown) {
    return { success: false, error: "Kategori itu tidak tersedia. Pilih dari daftar." };
  }

  const platforms = text(formData, "platform")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (platforms.length === 0) {
    return { success: false, error: "Pilih minimal satu platform live." };
  }
  if (!platforms.every((value) => PLATFORMS.includes(value))) {
    return { success: false, error: "Platform yang dipilih tidak dikenali." };
  }

  const price = parseRupiah(text(formData, "price"));
  if (price === null || price < MIN_PRICE) {
    return {
      success: false,
      error: `Harga per jam minimal Rp ${MIN_PRICE.toLocaleString("id-ID")}.`,
    };
  }
  if (price > MAX_PRICE) {
    return {
      success: false,
      error: `Harga per jam maksimal Rp ${MAX_PRICE.toLocaleString("id-ID")}.`,
    };
  }

  const bio = text(formData, "bio");
  if (bio.length < BIO_MIN) {
    return {
      success: false,
      error: `Deskripsi singkat minimal ${BIO_MIN} karakter — cukup satu sampai dua kalimat.`,
    };
  }
  if (bio.length > BIO_MAX) {
    return {
      success: false,
      error: `Deskripsi singkat maksimal ${BIO_MAX} karakter.`,
    };
  }

  const image = formData.get("image");
  const hasNewImage = image instanceof File && image.size > 0;

  if (hasNewImage) {
    if (!IMAGE_TYPES.includes(image.type)) {
      return { success: false, error: "Foto profil harus berupa file JPG, PNG, atau WEBP." };
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return { success: false, error: "Foto profil maksimal 5 MB." };
    }
  } else if (!streamer?.image_url) {
    return { success: false, error: "Foto profil wajib diunggah." };
  }

  // ---- Upload. Failure here is reported separately, never fatal. ----
  //
  // The text fields are saved either way. A flaky connection on a 3 MB photo
  // must not throw away a bio the host just wrote — they come back to a form
  // that still holds everything and only needs the picture re-attached.
  let imageUrl: string | null = null;
  let uploadFailed = false;

  if (hasNewImage) {
    const path = `${user.id}/${Date.now()}_profile.${fileExtension(image)}`;

    const { error: uploadError } = await supabase.storage
      .from("profile_picture")
      .upload(path, image, {
        cacheControl: "3600",
        upsert: true,
        contentType: image.type,
      });

    if (uploadError) {
      console.error("Streamer setup: profile photo upload failed", uploadError);
      uploadFailed = true;
    } else {
      imageUrl = supabase.storage.from("profile_picture").getPublicUrl(path)
        .data.publicUrl;
    }
  }

  // ---- Decide publishability from the row as it will be *after* this write. ----
  //
  // `profile_published_at` is a first-crossing timestamp, not a flag: it is
  // stamped the moment the profile first has everything a listing renders and
  // is never moved afterwards, so "published since" stays truthful even if the
  // host later edits a field.
  const payload: Record<string, unknown> = {
    username,
    // Both columns are written together on every save: `location` is what the
    // profile shows, `city_slug` is what city filters and /location/<slug> use.
    // Letting them drift is what made city search miss real hosts.
    location: city.name,
    city_slug: city.slug,
    category,
    platform: platforms.join(","),
    price,
    bio,
    ...(imageUrl ? { image_url: imageUrl } : {}),
  };

  const nextProfile: PublishableProfile = {
    ...(streamer ?? {}),
    ...payload,
  } as PublishableProfile;

  if (isProfilePublishable(nextProfile) && !streamer?.profile_published_at) {
    payload.profile_published_at = new Date().toISOString();
  }

  // ---- Write. ----
  let writeError: { code?: string; message?: string; details?: string } | null =
    null;

  if (streamer) {
    const { error } = await supabase
      .from("streamers")
      .update(payload)
      .eq("id", streamer.id)
      .eq("user_id", user.id);
    writeError = error;
  } else {
    // The role picker creates a minimal row the moment someone chooses "host",
    // so this branch is for accounts that predate it. Names come from the users
    // row rather than being asked for again.
    const { data: profile } = await supabase
      .from("users")
      .select("first_name, last_name")
      .eq("id", user.id)
      .maybeSingle();

    const { error } = await supabase.from("streamers").insert({
      ...payload,
      user_id: user.id,
      first_name: profile?.first_name ?? null,
      last_name: profile?.last_name ?? null,
    });
    writeError = error;
  }

  if (writeError) {
    // A username collision is the one failure the host can actually fix, so it
    // gets its own message and a concrete alternative to try.
    const isUsernameCollision =
      writeError.code === UNIQUE_VIOLATION &&
      /username/i.test(`${writeError.message ?? ""} ${writeError.details ?? ""}`);

    if (isUsernameCollision) {
      return {
        success: false,
        error: `Username "${username}" sudah dipakai host lain. Coba yang lain, misalnya ${withSuffix(
          username,
          2,
        ).slice(0, USERNAME_MAX)}.`,
      };
    }

    console.error("Streamer setup: profile write failed", writeError);
    return { success: false, error: "Gagal menyimpan profil. Coba lagi sebentar lagi." };
  }

  revalidatePath("/streamer-setup");
  revalidatePath("/streamer-setup/profil");
  revalidatePath("/streamer-dashboard");

  if (uploadFailed) {
    return {
      success: false,
      error:
        "Data profil sudah tersimpan, tapi foto profil gagal diunggah. Pilih fotonya lagi lalu simpan sekali lagi.",
    };
  }

  // Belt and braces: if something we did not anticipate is still missing, say
  // which field rather than letting the host think they are done.
  const stillMissing = missingPublishFields(nextProfile);
  if (stillMissing.length > 0) {
    return {
      success: false,
      error: `Masih ada yang kurang: ${stillMissing.join(", ")}.`,
    };
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Milestone 3 — payout account
// ---------------------------------------------------------------------------

/** 6–20 digits covers every Indonesian retail bank account number. */
const ACCOUNT_NUMBER_PATTERN = /^\d{6,20}$/;
/** Names as printed on a bank statement: letters, spaces, dots, apostrophes, hyphens. */
const HOLDER_NAME_PATTERN = /^[A-Za-z .'-]{3,100}$/;

/**
 * Add a bank account and make it the one payouts go to.
 *
 * `is_primary` defaults to false so that inserting a second account can never
 * collide with the one-primary-per-streamer unique index. Promotion is
 * therefore an explicit two-step act — demote whatever is primary now, then
 * promote the new row — and the order matters: promoting first would violate
 * the index.
 *
 * Old accounts are demoted, never deleted: which account a past payout went to
 * is part of the reconciliation trail.
 *
 * Expected FormData fields: bank_code, account_number, account_holder_name
 */
export async function saveStreamerPayoutAccount(
  formData: FormData,
): Promise<StreamerSetupResult> {
  const { supabase, user, streamer, error: contextError } =
    await requireStreamerContext();

  if (contextError) return { success: false, error: contextError };
  if (!user) return { success: false, error: SESSION_EXPIRED };
  if (!streamer) return { success: false, error: NOT_A_HOST };

  const bank = BANK_BY_CODE.get(text(formData, "bank_code"));
  if (!bank) {
    return { success: false, error: "Pilih bank kamu dari daftar." };
  }

  // Spaces and dashes are how people read an account number out loud; strip
  // them rather than rejecting a number that is actually correct.
  const accountNumber = text(formData, "account_number").replace(/[\s-]/g, "");
  if (!ACCOUNT_NUMBER_PATTERN.test(accountNumber)) {
    return {
      success: false,
      error: "Nomor rekening harus berupa 6–20 angka, tanpa spasi atau tanda baca.",
    };
  }

  const holderName = text(formData, "account_holder_name").replace(/\s+/g, " ");
  if (!HOLDER_NAME_PATTERN.test(holderName)) {
    return {
      success: false,
      error:
        "Nama pemilik rekening harus 3–100 huruf dan ditulis persis seperti di buku tabungan.",
    };
  }

  // 1) Insert non-primary. `verified_at` is left null on purpose: it means the
  //    name has been checked against the bank, which only the payout job can do.
  const { data: created, error: insertError } = await supabase
    .from("streamer_payout_accounts")
    .insert({
      streamer_id: streamer.id,
      bank_code: bank.code,
      bank_name: bank.name,
      account_number: accountNumber,
      account_holder_name: holderName,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    console.error("Streamer setup: payout account insert failed", insertError);
    return { success: false, error: "Gagal menyimpan rekening. Coba lagi sebentar lagi." };
  }

  // 2) Demote the current primary, if any, so the unique index has room.
  const { error: demoteError } = await supabase
    .from("streamer_payout_accounts")
    .update({ is_primary: false })
    .eq("streamer_id", streamer.id)
    .eq("is_primary", true)
    .neq("id", created.id);

  // 3) Promote the new row — only once the demotion actually landed, otherwise
  //    this write is the one that trips the unique index.
  const promoteError = demoteError
    ? null
    : (
        await supabase
          .from("streamer_payout_accounts")
          .update({ is_primary: true })
          .eq("id", created.id)
          .eq("streamer_id", streamer.id)
      ).error;

  if (demoteError || promoteError) {
    console.error(
      "Streamer setup: could not make the new payout account primary",
      demoteError ?? promoteError,
    );

    // Roll the insert back. Leaving an unpromoted row behind would show the
    // host a bank account that no payout will ever reach.
    const { error: cleanupError } = await supabase
      .from("streamer_payout_accounts")
      .delete()
      .eq("id", created.id)
      .eq("streamer_id", streamer.id);

    if (cleanupError) {
      console.error("Streamer setup: payout rollback failed", cleanupError, created.id);
    }

    return { success: false, error: "Gagal menyimpan rekening. Coba lagi sebentar lagi." };
  }

  revalidatePath("/streamer-setup");
  revalidatePath("/streamer-setup/rekening");
  revalidatePath("/streamer-dashboard");

  return { success: true };
}
