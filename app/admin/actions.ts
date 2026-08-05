"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";
import { getAdmin } from "@/lib/admin";
import { ONBOARDING_EVENTS, trackEvent } from "@/lib/analytics";
import {
  isProfilePublishable,
  missingPublishFields,
  type PublishableProfile,
} from "@/lib/milestones";

const QUEUE_PATH = "/admin/verificationstreamer";

/**
 * Every action in this file re-checks admin identity with `getAdmin()` before
 * it writes, even though `app/admin/layout.tsx` already gates the page these
 * forms were rendered from. A server action is a POST endpoint that anyone who
 * knows its action id can invoke directly; the layout never runs on that
 * request, so the layout alone is not a security boundary.
 *
 * The check itself (and the ADMIN_EMAILS parse behind it) lives in
 * `lib/admin.ts` — it used to be copy-pasted here, in the layout and in the
 * verification queue, and the copies had already drifted. Failure is uniform
 * with those surfaces: redirect to `/`.
 */

/**
 * Client used for the privileged writes. Approving somebody else's streamer row
 * is not an operation any end-user RLS policy grants, so the service role does
 * it. When the key is absent we fall back to the caller's session client and
 * verify afterwards that a row was actually written, rather than reporting a
 * success that RLS silently swallowed.
 */
function writeClient(sessionClient: SupabaseClient): SupabaseClient {
  return createAdminClient() ?? sessionClient;
}

function backToQueue(params: Record<string, string>): never {
  const qs = new URLSearchParams(params).toString();
  redirect(`${QUEUE_PATH}?${qs}`);
}

/**
 * Re-read the submission server-side instead of trusting the streamer_id the
 * form posted — otherwise an admin (or a replayed request) could approve
 * submission A against streamer B.
 */
async function loadSubmission(db: SupabaseClient, submissionId: string) {
  const { data, error } = await db
    .from("streamer_verification_submissions")
    .select("id, streamer_id, user_id, status")
    .eq("id", submissionId)
    .maybeSingle();

  if (error || !data) return null;
  return data as {
    id: string;
    streamer_id: number;
    user_id: string | null;
    status: string;
  };
}

/**
 * Re-read the profile columns straight from the row we are about to approve.
 * The queue's rendered submission is a snapshot from page load, and the fields
 * that matter here live on `streamers`, not on the submission.
 *
 * A read failure is reported separately from an empty profile: telling a
 * reviewer the host has not finished their profile, when really our database
 * was unreachable, sends them to chase the wrong person.
 */
async function loadPublishableProfile(
  db: SupabaseClient,
  streamerId: number,
): Promise<{ profile: PublishableProfile | null; failed: boolean }> {
  const { data, error } = await db
    .from("streamers")
    .select("username, image_url, city_slug, location, full_address, category, platform, price, bio")
    .eq("id", streamerId)
    .maybeSingle();

  if (error) return { profile: null, failed: true };
  return { profile: (data as PublishableProfile | null) ?? null, failed: false };
}

export async function approveStreamerVerification(formData: FormData) {
  const admin = await getAdmin();
  if (!admin) redirect("/");

  const submissionId = String(formData.get("submissionId") || "").trim();
  if (!submissionId) {
    backToQueue({ error: "Pengajuan tidak ditemukan." });
  }

  const db = writeClient(admin.supabase);
  const submission = await loadSubmission(db, submissionId);
  if (!submission) {
    backToQueue({ error: "Pengajuan tidak ditemukan." });
  }

  // Approval is what puts a row in front of brands, and since the account-first
  // signup a `streamers` row starts out nearly empty — the role picker creates
  // it, the host fills it in later. Approving one of those publishes a card with
  // no photo, no price and no platform. `isProfilePublishable` is the same
  // predicate the database trigger uses, so the queue and the DB agree on what
  // "ready" means.
  const { profile, failed } = await loadPublishableProfile(db, submission.streamer_id);
  if (failed) {
    backToQueue({
      error:
        "Gagal membaca profil streamer. Periksa koneksi database atau izin service role.",
    });
  }
  if (!profile) {
    backToQueue({ error: "Data streamer untuk pengajuan ini tidak ditemukan." });
  }
  if (!isProfilePublishable(profile)) {
    const missing = missingPublishFields(profile);
    backToQueue({
      error: missing.length
        ? `Host ini belum selesai melengkapi profilnya, jadi belum bisa disetujui. Masih kosong: ${missing.join(", ")}.`
        : "Host ini belum selesai melengkapi profilnya, jadi belum bisa disetujui.",
    });
  }

  // The streamer row is what actually gates listing and booking; the submission
  // row is the audit trail. Both have to move together.
  //
  // Nothing clears a rejection reason here: `streamers.rejection_reason` was
  // dropped. The explanation for a rejection lives in the submission row's
  // `notes`, and a fresh submission supersedes the one that carried it.
  const { data: updatedStreamer, error: streamerError } = await db
    .from("streamers")
    .update({
      verification_status: "approved",
      verified_at: new Date().toISOString(),
      verified_by: admin.userId,
    })
    .eq("id", submission.streamer_id)
    .select("id");

  if (streamerError || !updatedStreamer?.length) {
    backToQueue({
      error:
        "Gagal menyetujui streamer. Periksa koneksi database atau izin service role.",
    });
  }

  const { error: submissionError } = await db
    .from("streamer_verification_submissions")
    .update({
      status: "approved",
      reviewed_by: admin.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", submission.id);

  if (submissionError) {
    backToQueue({
      error: "Streamer disetujui, tetapi status pengajuan gagal diperbarui.",
    });
  }

  // Attributed to the streamer, not to the reviewing admin: the funnel counts
  // how far each *streamer* got, and an approval is the last stage they reach.
  // Awaited on purpose — `backToQueue` throws NEXT_REDIRECT on the next line
  // and a serverless request can be torn down before an unawaited insert
  // lands. `trackEvent` never rejects, so this cannot fail the approval.
  await trackEvent(
    ONBOARDING_EVENTS.VERIFICATION_APPROVED,
    { submission_id: submission.id, streamer_id: submission.streamer_id },
    submission.user_id ?? undefined,
  );

  revalidatePath(QUEUE_PATH);
  // The streamer has just become public inventory — drop the cached listings.
  revalidatePath("/streamers");
  revalidatePath("/");

  backToQueue({ success: "Streamer berhasil disetujui dan sudah bisa dibooking." });
}

export async function rejectStreamerVerification(formData: FormData) {
  const admin = await getAdmin();
  if (!admin) redirect("/");

  const submissionId = String(formData.get("submissionId") || "").trim();
  const rejectionReason = String(formData.get("rejectionReason") || "").trim();

  if (!submissionId) {
    backToQueue({ error: "Pengajuan tidak ditemukan." });
  }
  // Required, not optional: the streamer has to be told what to fix, and the
  // reason is the only record of why we turned somebody away.
  if (!rejectionReason) {
    backToQueue({ error: "Alasan penolakan wajib diisi." });
  }

  const db = writeClient(admin.supabase);
  const submission = await loadSubmission(db, submissionId);
  if (!submission) {
    backToQueue({ error: "Pengajuan tidak ditemukan." });
  }

  const { data: updatedStreamer, error: streamerError } = await db
    .from("streamers")
    .update({
      verification_status: "rejected",
      // verified_at/verified_by stay untouched: they mean "when and by whom
      // this account was verified". The reviewer of a rejection is recorded on
      // the submission row instead.
    })
    .eq("id", submission.streamer_id)
    .select("id");

  if (streamerError || !updatedStreamer?.length) {
    backToQueue({
      error:
        "Gagal menolak streamer. Periksa koneksi database atau izin service role.",
    });
  }

  const { error: submissionError } = await db
    .from("streamer_verification_submissions")
    .update({
      status: "rejected",
      notes: rejectionReason,
      reviewed_by: admin.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", submission.id);

  if (submissionError) {
    backToQueue({
      error: "Streamer ditolak, tetapi status pengajuan gagal diperbarui.",
    });
  }

  // The rejection reason is deliberately NOT logged: it is free text about a
  // named person. Only the ids go into analytics.
  await trackEvent(
    ONBOARDING_EVENTS.VERIFICATION_REJECTED,
    { submission_id: submission.id, streamer_id: submission.streamer_id },
    submission.user_id ?? undefined,
  );

  revalidatePath(QUEUE_PATH);
  revalidatePath("/streamers");
  revalidatePath("/");

  backToQueue({ success: "Pengajuan verifikasi ditolak." });
}
