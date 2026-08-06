import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className="min-h-screen bg-canvas">
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>
    </div>
  );
}

/**
 * The state of a verification, said in words.
 *
 * Every one of these used to be a filled pill in its own hue — green, orange,
 * yellow, blue — which put four different colours on four screens that are the
 * same screen. A tone on a mono eyebrow carries the same information and leaves
 * the page's one accent free for the thing the host can actually press.
 */
function StatusEyebrow({
  icon: Icon,
  label,
  tone,
}: {
  icon: typeof Clock;
  label: string;
  tone: string;
}) {
  return (
    <p className={`flex items-center gap-2 font-mono text-tiny uppercase ${tone}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </p>
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
        <div className="rounded-frame border border-hairline bg-surface p-5 sm:p-8">
          <h1 className="font-serif text-title font-semibold text-ink">
            Halaman khusus host
          </h1>
          <p className="mt-2 text-copy text-ink-muted">
            Akun ini terdaftar sebagai brand, bukan host. Kalau kamu ingin jadi host live
            streaming, daftar lewat halaman pendaftaran host.
          </p>
          <div className="mt-6">
            <Button asChild variant="brand" size="action">
              <Link href="/streamer-sign-up">Daftar sebagai host</Link>
            </Button>
          </div>
        </div>
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
        <header>
          <StatusEyebrow
            icon={CheckCircle2}
            label="Terverifikasi"
            tone="text-positive"
          />
          <h1 className="mt-3 font-serif text-section font-semibold text-ink sm:text-display">
            Akun kamu sudah terverifikasi
          </h1>
          <p className="mt-2 text-lede text-ink-soft">
            Profil kamu sudah tampil di Salda dan brand sudah bisa memesan jadwal live kamu.
          </p>
        </header>
        <div className="mt-8">
          <Button asChild variant="brand" size="action">
            <Link href="/streamer-dashboard">Buka dashboard</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  if (streamer.verification_status === "suspended") {
    return (
      <Shell>
        <header>
          <StatusEyebrow
            icon={AlertTriangle}
            label="Ditangguhkan"
            tone="text-caution"
          />
          <h1 className="mt-3 font-serif text-section font-semibold text-ink sm:text-display">
            Akun kamu sedang ditangguhkan
          </h1>
          <p className="mt-2 text-lede text-ink-soft">
            {submission?.notes
              ? submission.notes
              : "Hubungi dukungan Salda lewat WhatsApp untuk mengetahui langkah selanjutnya."}
          </p>
        </header>
      </Shell>
    );
  }

  // Pending with a submission already in the queue: nothing to do but wait.
  if (submission?.status === "pending") {
    return (
      <Shell>
        <header>
          <StatusEyebrow icon={Clock} label="Sedang ditinjau" tone="text-caution" />
          <h1 className="mt-3 font-serif text-section font-semibold text-ink sm:text-display">
            Pengajuan kamu sedang diperiksa
          </h1>
          <p className="mt-2 text-lede text-ink-soft">
            Tim kami sedang memeriksa dokumen untuk akun{" "}
            <span className="font-medium text-ink">{submission.platform_handle}</span>. Proses
            ini biasanya selesai dalam 1–2 hari kerja, dan kamu akan diberi tahu begitu
            selesai.
          </p>
        </header>

        <p className="mt-8 rounded-frame border border-hairline bg-surface px-4 py-4 text-copy text-ink-body sm:px-5">
          Selama menunggu, kamu sudah bisa melengkapi jadwal dan harga di dashboard. Profil
          kamu baru tampil untuk brand setelah verifikasi disetujui.
        </p>

        <div className="mt-6">
          <Button asChild variant="quiet" size="action">
            <Link href="/streamer-dashboard">Buka dashboard</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  const wasRejected = streamer.verification_status === "rejected" || submission?.status === "rejected";

  return (
    <Shell>
      <header>
        <StatusEyebrow icon={ShieldCheck} label="Verifikasi host" tone="text-ink-ghost" />
        <h1 className="mt-3 font-serif text-section font-semibold text-ink sm:text-display">
          {wasRejected ? "Kirim ulang dokumen verifikasi" : "Lengkapi verifikasi akun kamu"}
        </h1>
        <p className="mt-2 text-lede text-ink-soft">
          {wasRejected
            ? "Pengajuan sebelumnya belum bisa kami setujui. Perbaiki sesuai catatan di bawah, lalu kirim ulang."
            : "Satu langkah terakhir sebelum profil kamu bisa dipesan brand."}
        </p>
      </header>

      {wasRejected && submission?.notes && (
        <div className="mt-8 rounded-panel border border-caution-line bg-caution-tint px-4 py-3">
          <p className="text-mini text-caution">Catatan dari tim kami</p>
          <p className="mt-1 text-copy text-ink-body">{submission.notes}</p>
        </div>
      )}

      <div className="mt-8 rounded-frame border border-hairline bg-surface p-4 sm:p-6">
        <VerificationForm defaultHandle={submission?.platform_handle} />
      </div>
    </Shell>
  );
}
