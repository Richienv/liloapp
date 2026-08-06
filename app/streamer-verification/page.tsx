import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { VerificationForm } from "./verification-form";

export const metadata = {
  title: "Verifikasi Host | Salda",
  // A page that only ever renders for one signed-in streamer has nothing to
  // offer a crawler, and the URL should not surface in search at all.
  robots: { index: false, follow: false },
};

// Verification state changes out of band when an admin reviews it, so this page
// must never be served from a build-time cache.
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="overflow-hidden rounded-frame border border-hairline bg-surface">
        <div className="p-6 sm:p-8">{children}</div>
      </div>
    </main>
  );
}

export default async function StreamerVerificationPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in?redirect_to=/streamer-verification");
  }

  const { data: streamer } = await supabase
    .from("streamers")
    .select("id, verification_status, platform")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!streamer) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-ink">Halaman khusus host</h1>
        <p className="mt-2 text-ink-muted">
          Akun ini terdaftar sebagai brand, bukan host. Kalau kamu ingin jadi host live
          streaming, daftar lewat halaman pendaftaran host.
        </p>
        <Link
          href="/streamer-sign-up"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-panel bg-blue-600 px-5
            font-medium text-white transition-colors hover:bg-blue-700"
        >
          Daftar sebagai host
        </Link>
      </Shell>
    );
  }

  const { data: submission } = await supabase
    .from("streamer_verification_submissions")
    .select("id, status, platform_handle, notes, created_at")
    .eq("streamer_id", streamer.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (streamer.verification_status === "approved") {
    return (
      <Shell>
        <span className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
          <CheckCircle2 className="h-4 w-4" /> Terverifikasi
        </span>
        <h1 className="mt-4 text-xl font-semibold text-ink">Akun kamu sudah terverifikasi</h1>
        <p className="mt-2 text-ink-muted">
          Profil kamu sudah tampil di Salda dan brand sudah bisa memesan jadwal live kamu.
        </p>
        <Link
          href="/streamer-dashboard"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-panel bg-blue-600 px-5
            font-medium text-white transition-colors hover:bg-blue-700"
        >
          Buka dashboard
        </Link>
      </Shell>
    );
  }

  if (streamer.verification_status === "suspended") {
    return (
      <Shell>
        <span className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-sm font-medium text-orange-700">
          <AlertTriangle className="h-4 w-4" /> Ditangguhkan
        </span>
        <h1 className="mt-4 text-xl font-semibold text-ink">Akun kamu sedang ditangguhkan</h1>
        <p className="mt-2 text-ink-muted">
          {submission?.notes
            ? submission.notes
            : "Hubungi dukungan Salda lewat WhatsApp untuk mengetahui langkah selanjutnya."}
        </p>
      </Shell>
    );
  }

  // Pending with a submission already in the queue: nothing to do but wait.
  if (submission?.status === "pending") {
    return (
      <Shell>
        <span className="inline-flex items-center gap-2 rounded-full bg-yellow-50 px-3 py-1 text-sm font-medium text-yellow-800">
          <Clock className="h-4 w-4" /> Sedang ditinjau
        </span>
        <h1 className="mt-4 text-xl font-semibold text-ink">Pengajuan kamu sedang diperiksa</h1>
        <p className="mt-2 text-ink-muted">
          Tim kami sedang memeriksa dokumen untuk akun{" "}
          <span className="font-medium text-ink">{submission.platform_handle}</span>. Proses ini
          biasanya selesai dalam 1–2 hari kerja, dan kamu akan diberi tahu begitu selesai.
        </p>
        <p className="mt-4 rounded-panel bg-surface-tint px-4 py-3 text-sm text-ink-muted">
          Selama menunggu, kamu sudah bisa melengkapi jadwal dan harga di dashboard. Profil kamu
          baru tampil untuk brand setelah verifikasi disetujui.
        </p>
        <Link
          href="/streamer-dashboard"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-panel border-2
            border-hairline-input px-5 font-medium text-ink-body transition-colors hover:bg-surface-tint"
        >
          Buka dashboard
        </Link>
      </Shell>
    );
  }

  const wasRejected = streamer.verification_status === "rejected" || submission?.status === "rejected";

  return (
    <Shell>
      <div className="mb-6">
        <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          <ShieldCheck className="h-4 w-4" /> Verifikasi host
        </span>
        <h1 className="mt-4 text-xl font-semibold text-ink">
          {wasRejected ? "Kirim ulang dokumen verifikasi" : "Lengkapi verifikasi akun kamu"}
        </h1>
        <p className="mt-2 text-ink-muted">
          {wasRejected
            ? "Pengajuan sebelumnya belum bisa kami setujui. Perbaiki sesuai catatan di bawah, lalu kirim ulang."
            : "Satu langkah terakhir sebelum profil kamu bisa dipesan brand."}
        </p>
      </div>

      {wasRejected && submission?.notes && (
        <div className="mb-6 rounded-panel border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-sm font-medium text-destructive-emphasis">Catatan dari tim kami</p>
          <p className="mt-1 text-sm text-ink-body">{submission.notes}</p>
        </div>
      )}

      <VerificationForm defaultHandle={submission?.platform_handle} />
    </Shell>
  );
}
