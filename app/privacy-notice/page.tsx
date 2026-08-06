import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { absoluteUrl } from "@/lib/site";

// Server component so the route can declare its own canonical. As a client
// component it inherited the root layout's, which pointed every page at the
// homepage — see the note in `app/layout.tsx`.
export const metadata: Metadata = {
  title: "Kebijakan Privasi | Salda",
  description:
    "Bagaimana Salda mengumpulkan, menggunakan, dan melindungi data pribadi pengguna platform.",
  alternates: {
    canonical: absoluteUrl("/privacy-notice"),
  },
};

export default function PrivacyNoticePage() {
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
            <h1 className="text-xl font-semibold">Kebijakan Privasi</h1>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="bg-surface rounded-panel p-6 sm:p-8">
          <div className="prose max-w-none">
            <h2 className="text-2xl font-semibold mb-6">Kebijakan Privasi Salda</h2>
            
            <div className="space-y-8">
              <section>
                <h3 className="text-xl font-semibold mb-4">1. Pendahuluan</h3>
                <p className="text-ink-muted mb-4">
                  Salda berkomitmen untuk melindungi privasi Anda. Kebijakan Privasi ini menjelaskan bagaimana kami mengumpulkan, menggunakan, mengungkapkan, memproses dan melindungi informasi pribadi yang Anda berikan.
                </p>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">2. Informasi yang Kami Kumpulkan</h3>
                <ul className="list-disc pl-5 space-y-2 text-ink-muted">
                  <li>Informasi yang Anda berikan (nama, email, nomor telepon)</li>
                  <li>Informasi profil (foto profil, bio)</li>
                  <li>Informasi transaksi</li>
                  <li>Informasi perangkat dan penggunaan</li>
                  <li>Konten yang Anda unggah (dokumen, gambar)</li>
                </ul>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">3. Bagaimana Kami Menggunakan Informasi Anda</h3>
                <ul className="list-disc pl-5 space-y-2 text-ink-muted">
                  <li>Menyediakan layanan streaming dan booking</li>
                  <li>Memproses transaksi dan pembayaran</li>
                  <li>Mengirim pemberitahuan terkait layanan</li>
                  <li>Meningkatkan layanan kami</li>
                  <li>Menjaga keamanan platform</li>
                </ul>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">4. Berbagi Informasi</h3>
                <p className="text-ink-muted mb-4">
                  Kami dapat membagikan informasi Anda dengan:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-ink-muted">
                  <li>Streamer (untuk keperluan booking)</li>
                  <li>Penyedia layanan pembayaran</li>
                  <li>Pihak berwenang (sesuai hukum yang berlaku)</li>
                </ul>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">5. Keamanan Data</h3>
                <p className="text-ink-muted mb-4">
                  Kami menerapkan langkah-langkah keamanan yang sesuai untuk melindungi informasi Anda dari akses, pengungkapan, perubahan, atau penghancuran yang tidak sah.
                </p>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">6. Hak Anda</h3>
                <ul className="list-disc pl-5 space-y-2 text-ink-muted">
                  <li>Mengakses informasi pribadi Anda</li>
                  <li>Memperbarui atau mengoreksi informasi</li>
                  <li>Meminta penghapusan data</li>
                  <li>Menolak pemrosesan data</li>
                  <li>Menarik persetujuan</li>
                </ul>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">7. Perubahan Kebijakan</h3>
                <p className="text-ink-muted mb-4">
                  Kami dapat memperbarui Kebijakan Privasi ini dari waktu ke waktu. Perubahan akan diumumkan melalui platform kami dengan tanggal efektif yang diperbarui.
                </p>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-4">8. Hubungi Kami</h3>
                <p className="text-ink-muted mb-4">
                  Jika Anda memiliki pertanyaan tentang Kebijakan Privasi ini, silakan hubungi kami di:{" "}
                  <a href="mailto:privacy@salda.com" className="text-blue-600 hover:text-blue-700">
                    privacy@salda.com
                  </a>
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