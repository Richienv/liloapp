"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

/**
 * Write path for streamer KYC.
 *
 * A new streamer signs up as `verification_status = 'pending'` and is not
 * bookable until an admin approves them. This is how they get into that
 * queue: brands ship physical products to a streamer's home address, so
 * "who is this person, and do they really own the account they claim?" has
 * to be answered by a human looking at documents before any booking exists.
 *
 * Everything here runs against the session-bound client so RLS applies as
 * well as our own checks. The policies are deliberately strict — a streamer
 * may only write their own row, only as `pending`, and only while it is
 * still `pending` — so a bug here cannot become a self-approval.
 */

export interface VerificationSubmissionResult {
  success: boolean;
  error?: string;
}

/** Documents are images; a PDF is also accepted for the ID card itself. */
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ID_CARD_TYPES = [...IMAGE_TYPES, "application/pdf"];

/** Supabase's default object size cap is 50 MB; 5 MB is plenty for a phone photo. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

interface DocumentSpec {
  field: string;
  column: "id_card_url" | "selfie_url" | "platform_proof_url";
  label: string;
  accept: string[];
}

const DOCUMENTS: DocumentSpec[] = [
  { field: "id_card", column: "id_card_url", label: "Foto KTP", accept: ID_CARD_TYPES },
  { field: "selfie", column: "selfie_url", label: "Foto selfie dengan KTP", accept: IMAGE_TYPES },
  {
    field: "platform_proof",
    column: "platform_proof_url",
    label: "Bukti kepemilikan akun",
    accept: IMAGE_TYPES,
  },
];

function fileExtension(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  return file.type === "application/pdf" ? "pdf" : "jpg";
}

export async function submitStreamerVerification(
  formData: FormData,
): Promise<VerificationSubmissionResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Sesi kamu sudah berakhir. Silakan masuk lagi." };
  }

  // RLS ties a submission to a streamer row, so a user without one cannot
  // submit at all — surface that as a clear message rather than a failed insert.
  const { data: streamer, error: streamerError } = await supabase
    .from("streamers")
    .select("id, verification_status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (streamerError) {
    console.error("Verification: could not read streamer profile", streamerError);
    return { success: false, error: "Gagal memuat profil kamu. Coba lagi sebentar lagi." };
  }

  if (!streamer) {
    return {
      success: false,
      error: "Akun ini bukan akun host. Daftar sebagai host dulu sebelum verifikasi.",
    };
  }

  if (streamer.verification_status === "approved") {
    return { success: false, error: "Akun kamu sudah terverifikasi." };
  }

  const platformHandle = (formData.get("platform_handle") as string | null)?.trim();
  if (!platformHandle) {
    return {
      success: false,
      error: "Isi username akun TikTok atau Shopee Live yang kamu klaim.",
    };
  }

  // Validate every file before uploading any of them, so a bad third document
  // doesn't leave the first two sitting in storage.
  const pending: { spec: DocumentSpec; file: File }[] = [];
  for (const spec of DOCUMENTS) {
    const file = formData.get(spec.field) as File | null;

    if (!file || file.size === 0) {
      return { success: false, error: `${spec.label} wajib diunggah.` };
    }
    if (!spec.accept.includes(file.type)) {
      return {
        success: false,
        error: `${spec.label} harus berupa file ${spec.accept.includes("application/pdf") ? "JPG, PNG, WEBP, atau PDF" : "JPG, PNG, atau WEBP"}.`,
      };
    }
    if (file.size > MAX_FILE_BYTES) {
      return { success: false, error: `${spec.label} maksimal 5 MB.` };
    }

    pending.push({ spec, file });
  }

  // Storage RLS requires the first path segment to be the uploader's auth uid;
  // anything else is rejected outright. The timestamp keeps a re-submission from
  // overwriting the documents an admin may still be reviewing.
  const stamp = Date.now();
  const uploadedPaths: string[] = [];
  const columns: Partial<Record<DocumentSpec["column"], string>> = {};

  try {
    for (const { spec, file } of pending) {
      const path = `${user.id}/${stamp}-${spec.field}.${fileExtension(file)}`;

      const { error: uploadError } = await supabase.storage
        .from("verification_documents")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        throw new Error(`Gagal mengunggah ${spec.label}. Coba lagi.`);
      }

      uploadedPaths.push(path);
      // The bucket is private: store the path, not a URL. The admin queue mints
      // a short-lived signed URL when a reviewer actually opens the document.
      columns[spec.column] = path;
    }

    // A streamer fixing a blurry photo is the expected case, and RLS allows an
    // update while the row is still pending — so replace rather than stacking a
    // second row the reviewer would have to disambiguate.
    const { data: existing } = await supabase
      .from("streamer_verification_submissions")
      .select("id")
      .eq("streamer_id", streamer.id)
      .eq("status", "pending")
      .maybeSingle();

    const payload = {
      streamer_id: streamer.id,
      user_id: user.id,
      platform_handle: platformHandle,
      ...columns,
      updated_at: new Date().toISOString(),
    };

    const { error: writeError } = existing
      ? await supabase
          .from("streamer_verification_submissions")
          .update(payload)
          .eq("id", existing.id)
          .select("id")
          .single()
      : await supabase
          .from("streamer_verification_submissions")
          .insert(payload)
          .select("id")
          .single();

    if (writeError) {
      console.error("Verification: submission write failed", writeError);
      throw new Error("Gagal menyimpan pengajuan. Coba lagi sebentar lagi.");
    }
  } catch (error) {
    // Roll the uploads back. Without this a retry orphans identity documents in
    // a private bucket that nobody — not even the streamer — can clean up.
    if (uploadedPaths.length > 0) {
      const { error: cleanupError } = await supabase.storage
        .from("verification_documents")
        .remove(uploadedPaths);
      if (cleanupError) {
        console.error("Verification: rollback failed", cleanupError, uploadedPaths);
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Terjadi kesalahan. Silakan coba lagi.",
    };
  }

  revalidatePath("/streamer-verification");
  return { success: true };
}
