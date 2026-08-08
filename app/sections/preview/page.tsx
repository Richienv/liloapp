"use client";

import Image from "next/image";

/**
 * "Kenalan dulu sama Salda."
 *
 * Four things the platform does, one card each. Nothing here is a number, and
 * that is deliberate: the version this replaces was the same four cards under a
 * heading in English, set in `font-light` at 11px, on a full-bleed white band.
 *
 * The `whileInView` fades are gone — they started at `opacity: 0` and only a
 * live IntersectionObserver ever brought them back. `data-reveal` is the
 * inverted contract from app/globals.css: visible by default, hidden only once
 * script has proven it is running.
 */
const CARDS = [
  {
    n: '01',
    image: '/images/va.png',
    title: 'Pembayaran digital, mudah dan aman',
    body: 'Pembayaran dilakukan di dalam aplikasi dengan sistem yang memberikan history dan bukti untuk menjaga keamanan transaksi. Bekerja sama dengan bank untuk memudahkan pembayaran dan support jika ada kendala.',
  },
  {
    n: '02',
    image: '/images/hs.png',
    title: 'Host profesional dan terjangkau',
    body: 'Host yang dipilih sudah terbukti membawa ROI positif bagi brand sebelumnya dan dilatih untuk mempresentasikan produk dengan tujuan meningkatkan penjualan. Tersedia berbagai varian harga dan kategori streamer.',
  },
  {
    n: '03',
    image: '/images/cs.png',
    title: 'Support 24/7 yang responsif',
    body: 'Customer support yang selalu siap untuk menjawab semua pertanyaan atau masalah yang terjadi selama menggunakan platform untuk menjaga kenyamanan saat menggunakan aplikasi.',
  },
  {
    n: '04',
    image: '/images/nc.png',
    title: 'Fleksibel tanpa kontrak',
    body: 'Brand bisa langsung berkomunikasi dan mengatur booking untuk membantu menjual produk mereka melalui platform Salda dengan tujuan meningkatkan dan mempermudah kolaborasi antara brand dan host.',
  },
] as const;

export default function Preview() {
  return (
    <section className="bg-canvas">
      <div className="mx-auto w-full max-w-[1180px] px-5 pt-[clamp(72px,12vh,140px)] pb-[clamp(72px,12vh,140px)] sm:px-8 lg:px-12">
        {/* Section Header */}
        <div className="mx-auto max-w-[52ch] text-center" data-reveal>
          <p className="font-mono text-mini tracking-[.08em] text-ink-ghost">
            Tentang Salda
          </p>
          <h2 className="mt-4 font-serif text-heading font-medium text-balance text-ink">
            Kenalan dulu sama Salda.
          </h2>
          <p className="mx-auto mt-3.5 text-lede text-ink-muted">
            Salda adalah platform yang menyediakan jasa host live streaming terpercaya untuk
            jualan di TikTok dan Shopee Live. Dibuat oleh{' '}
            <span className="font-medium text-ink">TROLIVE</span>, Salda memudahkan kamu
            mencari host berpengalaman dengan sistem booking per jam.
          </p>
          <p className="mx-auto mt-3 text-lede text-ink-muted">
            Semua host sudah terlatih dan terbukti bisa meningkatkan penjualan online kamu.
            Tanpa ribet, tanpa kontrak panjang, langsung bisa mulai dari 1 jam saja.
          </p>
        </div>

        {/* Service Cards */}
        <div className="mt-12 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((card) => (
            <div
              key={card.n}
              className="flex flex-col overflow-hidden rounded-panel border border-hairline bg-surface"
              data-reveal
            >
              {/* The illustration sits in its own quiet well rather than
                  floating on the card fill, so four images of different
                  crops still read as one row. */}
              <div className="relative aspect-[4/3] w-full border-b border-hairline-soft bg-surface-tint sm:aspect-square">
                <Image
                  src={card.image}
                  alt={card.title}
                  fill
                  className="object-contain p-6"
                />
              </div>
              <div className="flex-1 p-5">
                <p className="font-mono text-mini tracking-[.08em] text-ink-ghost">{card.n}</p>
                <h3 className="mt-2 text-title font-semibold text-ink">{card.title}</h3>
                <p className="mt-2 text-copy leading-relaxed text-ink-muted">{card.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
