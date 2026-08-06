import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { absoluteUrl } from "@/lib/site";

// This page used to be a client component purely so a "Back" button could call
// `router.push`. A client component cannot export `metadata`, which is why this
// route had no canonical of its own and silently inherited the root layout's —
// claiming to be a duplicate of the homepage. A <Link> does the same job.
export const metadata: Metadata = {
  title: "Syarat & Ketentuan | Salda",
  description:
    "Syarat dan ketentuan penggunaan platform Salda untuk brand dan host live streaming.",
  alternates: {
    canonical: absoluteUrl("/terms"),
  },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-surface-tint">
      <div className="sticky top-0 z-10 bg-surface border-b border-hairline-input">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            >
              <Link href="/sign-up">
                <ChevronLeft className="h-4 w-4 mr-1" />
                Kembali
              </Link>
            </Button>
            <h1 className="text-xl font-semibold">Syarat & Ketentuan</h1>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="bg-surface rounded-panel p-6 sm:p-8">
          <div className="prose max-w-none">
            <h2 className="text-2xl font-semibold mb-6">Syarat dan Ketentuan Penggunaan Salda</h2>
            
            <div className="space-y-8">
              <section>
                <h3 className="text-xl font-semibold mb-4">1. Ketentuan Umum</h3>
                <p className="text-ink-muted mb-4">
                  Dengan menggunakan platform Salda, Anda menyetujui untuk terikat dengan syarat dan ketentuan ini. Jika Anda tidak setuju dengan syarat dan ketentuan ini, mohon untuk tidak menggunakan layanan kami.
                </p>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">2. Definisi</h3>
                <ul className="list-disc pl-5 space-y-2 text-ink-muted">
                  <li>"Platform" merujuk pada aplikasi dan website Salda</li>
                  <li>"Pengguna" adalah individu atau entitas yang menggunakan Platform</li>
                  <li>"Streamer" adalah penyedia layanan live streaming di Platform</li>
                  <li>"Klien" adalah pengguna yang menggunakan layanan Streamer</li>
                </ul>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">3. Penggunaan Platform</h3>
                <ul className="list-disc pl-5 space-y-2 text-ink-muted">
                  <li>Pengguna wajib berusia minimal 18 tahun</li>
                  <li>Informasi yang diberikan harus akurat dan lengkap</li>
                  <li>Dilarang menggunakan Platform untuk kegiatan ilegal</li>
                  <li>Wajib menjaga kerahasiaan akun dan password</li>
                </ul>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">4. Layanan Streaming</h3>
                <ul className="list-disc pl-5 space-y-2 text-ink-muted">
                  <li>Streamer wajib memberikan layanan sesuai kesepakatan</li>
                  <li>Pembatalan harus dilakukan sesuai kebijakan yang berlaku</li>
                  <li>Dilarang melakukan transaksi di luar Platform</li>
                  <li>Konten streaming harus sesuai dengan hukum yang berlaku</li>
                </ul>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">5. Pembayaran dan Biaya</h3>
                <ul className="list-disc pl-5 space-y-2 text-ink-muted">
                  <li>Semua pembayaran wajib melalui Platform</li>
                  <li>Biaya layanan sesuai dengan yang tercantum</li>
                  <li>Platform berhak memotong komisi sesuai kesepakatan</li>
                  <li>Pengembalian dana sesuai kebijakan yang berlaku</li>
                </ul>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">6. Hak Kekayaan Intelektual</h3>
                <p className="text-ink-muted mb-4">
                  Seluruh konten dan materi di Platform adalah milik Salda atau pemberi lisensinya. Pengguna dilarang menyalin, memodifikasi, atau mendistribusikan konten tanpa izin tertulis.
                </p>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">7. Pembatasan Tanggung Jawab</h3>
                <p className="text-ink-muted mb-4">
                  Salda tidak bertanggung jawab atas kerugian yang timbul dari penggunaan Platform atau layanan yang disediakan oleh Streamer.
                </p>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">8. Sanksi dan Penghentian</h3>
                <ul className="list-disc pl-5 space-y-2 text-ink-muted">
                  <li>Platform berhak memberikan sanksi atas pelanggaran</li>
                  <li>Akun dapat dinonaktifkan jika melanggar ketentuan</li>
                  <li>Pengguna dapat mengajukan banding atas sanksi</li>
                </ul>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">9. Perubahan Ketentuan</h3>
                <p className="text-ink-muted mb-4">
                  Salda berhak mengubah syarat dan ketentuan ini sewaktu-waktu. Perubahan akan diumumkan melalui Platform dan berlaku sejak tanggal yang ditentukan.
                </p>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">10. Hukum yang Berlaku</h3>
                <p className="text-ink-muted mb-4">
                  Syarat dan ketentuan ini tunduk pada hukum Republik Indonesia. Setiap perselisihan akan diselesaikan melalui musyawarah atau pengadilan yang berwenang.
                </p>
              </section>
            </div>

            <div className="mt-8 pt-8 border-t border-hairline-input">
              <p className="text-sm text-ink-soft">
                Terakhir diperbarui: {new Date().toLocaleDateString('id-ID', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 