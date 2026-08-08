import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
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

/**
 * One numbered clause.
 *
 * Mono index + serif title is the section pair the rest of the product uses —
 * see `SectionHeading` in the booking list. The number is a mark you scroll
 * past rather than a word you read, so it stays in the mono face at label size
 * and lets the serif carry the title.
 *
 * The seam above each clause is a hairline, not a card. Ten bordered boxes
 * stacked down a legal page draw twenty horizontal edges; one rule per clause
 * draws nine, and the page reads as a single document instead of a list of
 * unrelated panels.
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
 * A bullet is a 4px ink dot on its own baseline offset, not a `list-disc`.
 * `items-center` would centre the dot against a wrapped two-line item; the
 * fixed top margin parks it on the first line where a bullet belongs.
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

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-canvas">
      {/*
        The bar is `bg-canvas`, not white: a white bar over the warm canvas
        draws a second horizontal edge under the hairline and reads as two
        headers. The running head is a mono eyebrow rather than a second <h1> —
        the document's real title is set in the page itself, and repeating it at
        title size in the bar would put two headings on screen at once.
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
            Syarat &amp; ketentuan
          </span>
        </div>
      </header>

      {/*
        A measure, not a container. `max-w-4xl` (896px) at 14px put roughly 120
        characters on a line — about double what anyone reads without losing
        their place on the return sweep. 68ch lands in the 60–75 range, and the
        copy sits at 15px/1.6 so the leading is generous enough for a page that
        is nothing but paragraphs.
      */}
      <article className="mx-auto w-full max-w-[68ch] px-5 pb-24 pt-10 sm:px-6 sm:pt-14">
        <h1 className="font-serif text-section font-semibold text-ink sm:text-display">
          Syarat dan ketentuan penggunaan Salda
        </h1>

        <div className="mt-10 space-y-8">
          <Clause index={1} title="Ketentuan umum">
            <p>
              Dengan menggunakan platform Salda, kamu menyetujui untuk terikat
              dengan syarat dan ketentuan ini. Jika kamu tidak setuju dengan
              syarat dan ketentuan ini, mohon untuk tidak menggunakan layanan
              kami.
            </p>
          </Clause>

          <Clause index={2} title="Definisi">
            <ul className="space-y-2.5">
              <Point>"Platform" merujuk pada aplikasi dan website Salda</Point>
              <Point>
                "Pengguna" adalah individu atau entitas yang menggunakan Platform
              </Point>
              <Point>
                "Streamer" adalah penyedia layanan live streaming di Platform
              </Point>
              <Point>
                "Klien" adalah pengguna yang menggunakan layanan Streamer
              </Point>
            </ul>
          </Clause>

          <Clause index={3} title="Penggunaan Platform">
            <ul className="space-y-2.5">
              <Point>Pengguna wajib berusia minimal 18 tahun</Point>
              <Point>Informasi yang diberikan harus akurat dan lengkap</Point>
              <Point>Dilarang menggunakan Platform untuk kegiatan ilegal</Point>
              <Point>Wajib menjaga kerahasiaan akun dan password</Point>
            </ul>
          </Clause>

          <Clause index={4} title="Layanan streaming">
            <ul className="space-y-2.5">
              <Point>Streamer wajib memberikan layanan sesuai kesepakatan</Point>
              <Point>
                Pembatalan harus dilakukan sesuai kebijakan yang berlaku
              </Point>
              <Point>Dilarang melakukan transaksi di luar Platform</Point>
              <Point>
                Konten streaming harus sesuai dengan hukum yang berlaku
              </Point>
            </ul>
          </Clause>

          <Clause index={5} title="Pembayaran dan biaya">
            <ul className="space-y-2.5">
              <Point>Semua pembayaran wajib melalui Platform</Point>
              <Point>Biaya layanan sesuai dengan yang tercantum</Point>
              <Point>Platform berhak memotong komisi sesuai kesepakatan</Point>
              <Point>Pengembalian dana sesuai kebijakan yang berlaku</Point>
            </ul>
          </Clause>

          <Clause index={6} title="Hak kekayaan intelektual">
            <p>
              Seluruh konten dan materi di Platform adalah milik Salda atau
              pemberi lisensinya. Pengguna dilarang menyalin, memodifikasi, atau
              mendistribusikan konten tanpa izin tertulis.
            </p>
          </Clause>

          <Clause index={7} title="Pembatasan tanggung jawab">
            <p>
              Salda tidak bertanggung jawab atas kerugian yang timbul dari
              penggunaan Platform atau layanan yang disediakan oleh Streamer.
            </p>
          </Clause>

          <Clause index={8} title="Sanksi dan penghentian">
            <ul className="space-y-2.5">
              <Point>Platform berhak memberikan sanksi atas pelanggaran</Point>
              <Point>Akun dapat dinonaktifkan jika melanggar ketentuan</Point>
              <Point>Pengguna dapat mengajukan banding atas sanksi</Point>
            </ul>
          </Clause>

          <Clause index={9} title="Perubahan ketentuan">
            <p>
              Salda berhak mengubah syarat dan ketentuan ini sewaktu-waktu.
              Perubahan akan diumumkan melalui Platform dan berlaku sejak tanggal
              yang ditentukan.
            </p>
          </Clause>

          <Clause index={10} title="Hukum yang berlaku">
            <p>
              Syarat dan ketentuan ini tunduk pada hukum Republik Indonesia.
              Setiap perselisihan akan diselesaikan melalui musyawarah atau
              pengadilan yang berwenang.
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
