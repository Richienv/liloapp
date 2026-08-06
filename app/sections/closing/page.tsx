import Link from 'next/link';

/**
 * The door.
 *
 * Dark, full-bleed, and the only place on the page where the accent appears as
 * a filled button. Everything above it is warm canvas and hairlines; inverting
 * here is what makes it read as the end of the argument rather than as one more
 * card.
 *
 * Copy verbatim from design/REFERENCE.md.
 */
export default function Closing() {
  return (
    <div className="mt-[clamp(72px,12vh,140px)] bg-ink">
      <div className="mx-auto max-w-[1180px] px-5 py-[clamp(64px,10vh,120px)] text-center sm:px-8 lg:px-12">
        <h2 className="mx-auto max-w-[20ch] font-serif text-heading font-medium text-balance text-white">
          Sesi live pertama kamu bisa mulai minggu ini.
        </h2>
        <p className="mx-auto mt-4 max-w-[44ch] text-lede text-white/70">
          Daftar gratis, lihat host yang tersedia, dan bayar hanya saat kamu booking.
        </p>

        <Link
          href="/streamers"
          className="mt-8 inline-flex h-[46px] w-[220px] items-center justify-center rounded-lg
            bg-brand text-ui font-semibold text-white transition-colors hover:bg-brand-hover
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40
            focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
        >
          Mulai cari host
        </Link>
      </div>
    </div>
  );
}
