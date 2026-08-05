"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

const QUEUE_PATH = "/admin/verificationstreamer";

/**
 * Admin allowlist, identical to the gate in app/admin/layout.tsx: there is no
 * admin role in the data model, so access is an ADMIN_EMAILS env allowlist.
 *
 * This is duplicated here on purpose. A server action is a POST endpoint that
 * anyone who knows its action id can invoke directly — the layout never runs on
 * that request, so the layout alone is not a security boundary. Every action in
 * this file re-checks before it writes.
 */
function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const adminEmails = getAdminEmails();
  const email = user.email?.toLowerCase();

  // Fail closed: an unset or empty ADMIN_EMAILS grants nobody anything.
  if (!email || adminEmails.length === 0 || !adminEmails.includes(email)) {
    return null;
  }

  return { supabase, user };
}

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

export async function approveStreamerVerification(formData: FormData) {
  const admin = await requireAdmin();
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

  // The streamer row is what actually gates listing and booking; the submission
  // row is the audit trail. Both have to move together.
  const { data: updatedStreamer, error: streamerError } = await db
    .from("streamers")
    .update({
      verification_status: "approved",
      verified_at: new Date().toISOString(),
      verified_by: admin.user.id,
      // Clear any reason left over from an earlier rejection so the profile
      // does not keep showing a stale explanation.
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
      reviewed_by: admin.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", submission.id);

  if (submissionError) {
    backToQueue({
      error: "Streamer disetujui, tetapi status pengajuan gagal diperbarui.",
    });
  }

  revalidatePath(QUEUE_PATH);
  // The streamer has just become public inventory — drop the cached listings.
  revalidatePath("/streamers");
  revalidatePath("/");

  backToQueue({ success: "Streamer berhasil disetujui dan sudah bisa dibooking." });
}

export async function rejectStreamerVerification(formData: FormData) {
  const admin = await requireAdmin();
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
      reviewed_by: admin.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", submission.id);

  if (submissionError) {
    backToQueue({
      error: "Streamer ditolak, tetapi status pengajuan gagal diperbarui.",
    });
  }

  revalidatePath(QUEUE_PATH);
  revalidatePath("/streamers");
  revalidatePath("/");

  backToQueue({ success: "Pengajuan verifikasi ditolak." });
}
