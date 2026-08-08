import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { absoluteUrl } from "@/lib/site";

// Nothing here was ever interactive — the "use client" directive only meant the
// route could not export `metadata`, so it inherited the root layout's canonical
// and declared itself a duplicate of the homepage.
export const metadata: Metadata = {
  title: "Cara Membuat Video Perkenalan yang Menarik | Salda",
  description:
    "Panduan lengkap membuat video perkenalan yang profesional untuk calon host live streaming di Salda: persiapan, konten, teknis perekaman, dan cara upload.",
  alternates: {
    canonical: absoluteUrl("/tutorial/video-guide"),
  },
};

/**
 * One numbered step — the mono index + serif title pair used by every section
 * heading in the product, and by the two legal pages this guide sits next to in
 * the sign-up flow.
 *
 * The four steps used to be four bordered cards, each with its own coloured
 * icon tile: purple, blue, green, orange. That is four accents in one column on
 * a page whose budget is one, and the hues carried no meaning — nothing about
 * "Teknis perekaman" is green. The index carries the sequence instead, and it
 * carries it better, because a number is what the reader is actually looking
 * for when they come back to find where they left off.
 */
function Step({
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
        <h3 className="font-serif text-title font-semibold text-ink">{title}</h3>
      </div>
      <div className="mt-3.5 text-lede text-ink-body">{children}</div>
    </section>
  );
}

/** Unordered item: a 4px ink dot parked on the first line, never a coloured one. */
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

/**
 * Ordered item. The upload steps have to be done in order, so the marker is a
 * real number — set in the mono face, the same one the step indices use, so the
 * two levels of numbering read as one system rather than two lists that happen
 * to be numbered.
 */
function Instruction({ index, children }: { index: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="numeric mt-[3px] w-3 shrink-0 font-mono text-mini text-ink-ghost"
      >
        {index}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

export default function VideoGuide() {
  return (
    <div className="min-h-screen bg-canvas">
      {/*
        68ch measure at 15px/1.6. This is a document, not a dashboard: the old
        `max-w-3xl` of stacked cards set the instructions at 16px across 768px
        and broke them into four boxed islands, which is why it read as a form
        to fill in rather than something to read.
      */}
      <article className="mx-auto w-full max-w-[68ch] px-5 pb-24 pt-8 sm:px-6 sm:pt-12">
        <Link
          href="/streamer-sign-up"
          className="-ml-1 inline-flex items-center gap-1 text-meta text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" />
          Kembali ke pendaftaran
        </Link>

        <h1 className="mt-4 font-serif text-section font-semibold text-ink sm:text-display">
          Cara membuat video perkenalan yang menarik
        </h1>
        <p className="mt-2.5 text-lede text-ink-soft">
          Panduan lengkap membuat video yang profesional
        </p>

        {/*
          Was a blue card with blue text on a blue border. It says nothing
          urgent and asks for nothing, so it gets the quiet fill — the same one
          the closing tips block gets, which turns the two into a matched pair
          bracketing the steps instead of two unrelated coloured boxes.
        */}
        <section className="mt-9 rounded-panel border border-hairline bg-surface-tint px-5 py-5 sm:px-6 sm:py-6">
          <h2 className="font-serif text-title font-semibold text-ink">
            Mengapa video perkenalan penting?
          </h2>
          <p className="mt-2.5 text-lede text-ink-body">
            Video perkenalan adalah kesempatan pertama kamu untuk menunjukkan
            profesionalisme dan kemampuan kamu kepada brand. Video yang
            berkualitas akan meningkatkan peluang kamu untuk dipilih oleh brand.
          </p>
        </section>

        {/*
          An eyebrow rather than a heading. It labels the four steps below it;
          set at title size it would compete with the four titles it introduces.
        */}
        <h2 className="mt-12 font-mono text-tiny uppercase text-ink-ghost">
          Langkah-langkah membuat video
        </h2>

        <div className="mt-6 space-y-8">
          <Step index={1} title="Persiapan">
            <ul className="space-y-2.5">
              <Point>Siapkan naskah atau poin-poin yang ingin disampaikan</Point>
              <Point>Pilih lokasi dengan pencahayaan yang baik</Point>
              <Point>Gunakan smartphone/kamera dengan kualitas HD</Point>
              <Point>Pastikan audio jernih dan tidak berisik</Point>
            </ul>
          </Step>

          <Step index={2} title="Konten video">
            <ul className="space-y-2.5">
              <Point>Perkenalkan diri kamu dengan singkat</Point>
              <Point>Jelaskan pengalaman live streaming kamu</Point>
              <Point>Tunjukkan contoh cara kamu mempromosikan produk</Point>
              <Point>Sebutkan kategori produk yang kamu kuasai</Point>
            </ul>
          </Step>

          <Step index={3} title="Teknis perekaman">
            <ul className="space-y-2.5">
              <Point>Gunakan orientasi landscape (16:9)</Point>
              <Point>Rekam dalam resolusi minimal 1080p</Point>
              <Point>Durasi optimal: 2-3 menit</Point>
              <Point>Pastikan frame stabil (gunakan tripod jika perlu)</Point>
            </ul>
          </Step>

          <Step index={4} title="Unggah ke YouTube">
            <ol className="space-y-2.5">
              <Instruction index={1}>Masuk ke akun YouTube kamu</Instruction>
              <Instruction index={2}>
                Klik tombol Upload (ikon kamera dengan tanda +)
              </Instruction>
              <Instruction index={3}>
                Pilih "Unlisted" pada pengaturan privasi
              </Instruction>
              <Instruction index={4}>
                Isi judul: "Video Perkenalan [Nama kamu] - Lilo Host"
              </Instruction>
              <Instruction index={5}>
                Setelah proses unggah selesai, klik "SHARE" lalu salin tautannya
              </Instruction>
            </ol>
          </Step>
        </div>

        <section className="mt-12 rounded-panel border border-hairline bg-surface-tint px-5 py-5 sm:px-6 sm:py-6">
          <h2 className="font-serif text-title font-semibold text-ink">
            Tips tambahan
          </h2>
          <ul className="mt-3 space-y-2.5 text-lede text-ink-body">
            <Point>Gunakan pakaian yang rapi dan profesional</Point>
            <Point>Bicara dengan jelas dan penuh semangat</Point>
            <Point>Tunjukkan kepribadian kamu yang natural</Point>
            <Point>Edit video untuk menghilangkan bagian yang tidak perlu</Point>
          </ul>
        </section>
      </article>
    </div>
  );
}
