import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
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

/**
 * One numbered clause — the same mono index + serif title pair the booking list
 * uses for its sections, and the same construction as `/terms`. The two legal
 * pages are read back to back by anyone signing up; if they were set
 * differently one of them would look like it belonged to another product.
 */
function Clause({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-hairline-soft pt-8 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-3">
        <span className="numeric font-mono text-mini text-ink-ghost">
          {String(index).padStart(2, "0")}
        </span>
        <h2 className="font-serif text-title font-semibold text-ink">{title}</h2>
      </div>
      <div className="mt-3.5 text-lede text-ink-body">{children}</div>
    </section>
  );
}

/**
 * A bullet is a 4px ink dot parked on the first line, not a `list-disc`.
 * `items-center` would float it to the middle of a wrapped two-line item.
 */
function Point({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-[10px] h-1 w-1 shrink-0 rounded-full bg-ink-ghost"
      />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

export default function PrivacyNoticePage() {
  return (
    <div className="min-h-screen bg-canvas">
      {/*
        `bg-canvas`, not white — a white bar over the warm canvas reads as a
        second header. The running head is a mono eyebrow, so the page keeps one
        heading at heading size.
      */}
      <header className="sticky top-0 z-[var(--z-navbar)] border-b border-hairline bg-canvas">
        <div className="mx-auto flex h-14 max-w-[68ch] items-center gap-3 px-5 sm:px-6">
          <Link
            href="/sign-up"
            className="-ml-1 inline-flex shrink-0 items-center gap-1 text-meta text-ink-soft transition-colors hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" />
            Kembali
          </Link>
          <span className="ml-auto truncate font-mono text-tiny uppercase text-ink-ghost">
            Kebijakan privasi
          </span>
        </div>
      </header>

      {/*
        68ch measure at 15px/1.6. The old `max-w-4xl` put ~120 characters on a
        line, which is roughly twice what a reader can track back to the start
        of the next one — the single worst thing you can do to a page that is
        entirely prose.
      */}
      <article className="mx-auto w-full max-w-[68ch] px-5 pb-24 pt-10 sm:px-6 sm:pt-14">
        <h1 className="font-serif text-section font-semibold text-ink sm:text-display">
          Kebijakan privasi Salda
        </h1>

        <div className="mt-10 space-y-8">
          <Clause index={1} title="Pendahuluan">
            <p>
              Salda berkomitmen untuk melindungi privasi kamu. Kebijakan Privasi
              ini menjelaskan bagaimana kami mengumpulkan, menggunakan,
              mengungkapkan, memproses dan melindungi informasi pribadi yang kamu
              berikan.
            </p>
          </Clause>

          <Clause index={2} title="Informasi yang kami kumpulkan">
            <ul className="space-y-2.5">
              <Point>
                Informasi yang kamu berikan (nama, email, nomor telepon)
              </Point>
              <Point>Informasi profil (foto profil, bio)</Point>
              <Point>Informasi transaksi</Point>
              <Point>Informasi perangkat dan penggunaan</Point>
              <Point>Konten yang kamu unggah (dokumen, gambar)</Point>
            </ul>
          </Clause>

          <Clause index={3} title="Bagaimana kami menggunakan informasi kamu">
            <ul className="space-y-2.5">
              <Point>Menyediakan layanan streaming dan booking</Point>
              <Point>Memproses transaksi dan pembayaran</Point>
              <Point>Mengirim pemberitahuan terkait layanan</Point>
              <Point>Meningkatkan layanan kami</Point>
              <Point>Menjaga keamanan platform</Point>
            </ul>
          </Clause>

          <Clause index={4} title="Berbagi informasi">
            <p>Kami dapat membagikan informasi kamu dengan:</p>
            <ul className="mt-3 space-y-2.5">
              <Point>Streamer (untuk keperluan booking)</Point>
              <Point>Penyedia layanan pembayaran</Point>
              <Point>Pihak berwenang (sesuai hukum yang berlaku)</Point>
            </ul>
          </Clause>

          <Clause index={5} title="Keamanan data">
            <p>
              Kami menerapkan langkah-langkah keamanan yang sesuai untuk
              melindungi informasi kamu dari akses, pengungkapan, perubahan, atau
              penghancuran yang tidak sah.
            </p>
          </Clause>

          <Clause index={6} title="Hak kamu">
            <ul className="space-y-2.5">
              <Point>Mengakses informasi pribadi kamu</Point>
              <Point>Memperbarui atau mengoreksi informasi</Point>
              <Point>Meminta penghapusan data</Point>
              <Point>Menolak pemrosesan data</Point>
              <Point>Menarik persetujuan</Point>
            </ul>
          </Clause>

          <Clause index={7} title="Perubahan kebijakan">
            <p>
              Kami dapat memperbarui Kebijakan Privasi ini dari waktu ke waktu.
              Perubahan akan diumumkan melalui platform kami dengan tanggal
              efektif yang diperbarui.
            </p>
          </Clause>

          <Clause index={8} title="Hubungi kami">
            <p>
              Jika kamu memiliki pertanyaan tentang Kebijakan Privasi ini,
              silakan hubungi kami di:{" "}
              {/*
                Underlined ink, not a blue link. This page spends no accent at
                all — a lone blue mailto in ten sections of grey would be the
                loudest thing on a document nobody is meant to be steered
                through.
              */}
              <a
                href="mailto:privacy@salda.com"
                className="break-all font-medium text-ink underline decoration-hairline-strong underline-offset-2 transition-colors hover:decoration-ink"
              >
                privacy@salda.com
              </a>
            </p>
          </Clause>
        </div>

        <p className="mt-12 border-t border-hairline pt-6 text-meta text-ink-faint">
          Terakhir diperbarui:{" "}
          <span className="numeric">
            {new Date().toLocaleDateString("id-ID", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
        </p>
      </article>
    </div>
  );
}
