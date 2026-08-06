"use client";

import Image from "next/image";

interface TutorialSlide {
  image: string;
  title: string;
  description: string;
}

const tutorialSlides: TutorialSlide[] = [
  {
    image: "/images/1b.png",
    title: "Minta akses",
    description: "Pastikan kamu sudah membuat akun dan mendapatkan akses dari tim Trolive. Jika belum, silakan klik tombol ini untuk mengirim pesan permintaan akses."
  },
  {
    image: "/images/2b.png",
    title: "Masuk dan jelajahi",
    description: "Masuk dengan akun kamu dan lihat-lihat platform untuk membiasakan diri dengan semua fitur yang tersedia."
  },
  {
    image: "/images/3b.png",
    title: "Pesan host",
    description: "Lihat host yang kamu suka dan klik \"book livestreamer\" untuk memilih jam yang tersedia."
  },
  {
    image: "/images/4b.png",
    title: "Cek detail booking",
    description: "Periksa detail booking kamu dan pastikan informasi pengiriman barang dan sub akun sudah benar. Hubungi host atau support jika butuh bantuan."
  },
  {
    image: "/images/5b.png",
    title: "Selesaikan pembayaran",
    description: "Selesaikan pembayaran menggunakan QRIS/VA/Transfer Bank yang tersedia. Setelah itu kamu akan diarahkan untuk melihat booking yang baru saja dibuat."
  },
  {
    image: "/images/6b.png",
    title: "Tunggu konfirmasi",
    description: "Kamu bisa menunggu host untuk menerima/menolak booking dan akan mendapat notifikasi di dalam aplikasi, jadi pastikan untuk membuka web app untuk mengecek."
  },
  {
    image: "/images/7b.png",
    title: "Komunikasi dengan host",
    description: "Setelah host menerima, komunikasikan via pesan aplikasi dan kirim produk kamu untuk mereka tampilkan."
  },
  {
    image: "/images/8b.png",
    title: "Mulai live",
    description: "Mereka akan melakukan live sesuai waktu booking kamu dan kamu akan diinformasikan tentang semuanya. Selesai!"
  }
];

/**
 * The illustrated walkthrough of the eight steps.
 *
 * Same eight steps as `01 / Cara kerja` on the landing page, at length and with
 * a screenshot each. The heading no longer sticks to the top of the viewport
 * behind a blur — a translucent bar that follows you down eight screens is a
 * navigation element, and this page already has one.
 *
 * Every step's fade-in used to start at `opacity: 0` and wait for an
 * IntersectionObserver. If the observer never fired, the page was eight
 * screens of nothing. `data-reveal` is the inverted contract from
 * app/globals.css: visible unless script has proven it is alive.
 */
export default function About() {
  return (
    <section className="bg-canvas">
      <div className="mx-auto w-full max-w-[1180px] px-5 pt-[clamp(72px,12vh,140px)] pb-[clamp(72px,12vh,140px)] sm:px-8 lg:px-12">
        {/* Header */}
        <div className="mx-auto max-w-[46ch] text-center">
          <p className="font-mono text-mini tracking-[.08em] text-ink-ghost">
            01 / Cara kerja
          </p>
          <h2 className="mt-4 font-serif text-heading font-medium text-balance text-ink">
            Cara menggunakan Salda.
          </h2>
          <p className="mt-3.5 text-lede text-ink-muted">
            Mulai perjalanan live commerce kamu dengan langkah-langkah sederhana. Kami
            dampingi di tiap tahap supaya sesi pertama kamu berjalan tanpa kejutan.
          </p>
        </div>

        {/* Steps */}
        <div className="mt-16 space-y-16 sm:mt-20 sm:space-y-20 md:space-y-24">
          {tutorialSlides.map((slide, index) => (
            <div key={index} data-reveal>
              <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-2 md:gap-12">
                {/* Screenshot */}
                <div className={`order-1 ${index % 2 === 0 ? 'md:order-1' : 'md:order-2'}`}>
                  <div className="relative aspect-[16/10] overflow-hidden rounded-frame border border-hairline bg-surface">
                    <Image
                      src={slide.image}
                      alt={slide.title}
                      fill
                      className="object-cover"
                      priority={index < 2}
                    />
                  </div>
                </div>

                {/* Copy */}
                <div className={`order-2 ${index % 2 === 0 ? 'md:order-2' : 'md:order-1'}`}>
                  {/*
                    A mono index, the way every numbered thing in this design is
                    marked. The grey circle it replaces was a `bg-black/[0.03]`
                    disc — a fill so faint it read as a rendering artefact around
                    a digit that had no typographic relationship to anything.
                  */}
                  <p className="font-mono text-mini tracking-[.08em] text-ink-ghost">
                    {String(index + 1).padStart(2, '0')}
                  </p>
                  <h3 className="mt-3 font-serif text-title font-semibold text-ink sm:text-section">
                    {slide.title}
                  </h3>
                  <p className="mt-3 max-w-[52ch] text-copy leading-relaxed text-ink-muted sm:text-lede">
                    {slide.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
