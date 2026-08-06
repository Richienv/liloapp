import Link from 'next/link';

/**
 * Admin overview.
 *
 * WHAT WAS REMOVED, AND WHY
 *
 * This page used to open with four stat cards: "Total Streamers 1,234",
 * "Active Bookings 56", "Monthly Revenue Rp 123.4M", "Avg. Rating 4.8", each
 * with a green "+12%" next to it. Every one of those figures was a string
 * literal in this file. There was no query, no prop, no fetch — the numbers had
 * never been true and could not become true by being restyled.
 *
 * Restyling them would have been the worst outcome available: the same
 * fabrication, now in the design system's typography, which is exactly what
 * makes an invented number look like a measured one. They are gone. Wiring real
 * aggregates to them is a data change, not a presentation change, so it is not
 * done here.
 *
 * The page keeps its shape — heading, one panel, footer — and points at the two
 * admin screens whose numbers ARE computed from the database.
 */
export default function AdminDashboard() {
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 px-8 py-8">
        <header className="max-w-[620px]">
          <h1 className="font-serif text-section font-semibold text-ink">
            Ringkasan
          </h1>
          <p className="mt-2 text-lede text-ink-soft">
            Panel internal Salda. Pilih bagian di kiri untuk mulai bekerja.
          </p>
        </header>

        <section className="mt-8 max-w-[720px] overflow-hidden rounded-frame border border-hairline bg-surface">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline-soft px-5 py-4">
            <span className="numeric font-mono text-mini font-semibold text-ink-ghost">
              01
            </span>
            <h2 className="font-serif text-title font-semibold text-ink">
              Angka ringkasan belum ada di sini
            </h2>
          </div>

          <div className="px-5 py-4">
            <p className="text-copy text-ink-muted">
              Halaman ini dulu membuka dengan empat kartu statistik — jumlah
              streamer, booking aktif, pendapatan bulanan, rating rata-rata.
              Semua angkanya ditulis langsung di kode dan tidak terhubung ke satu
              pun query, jadi kartunya dihapus, bukan didandani.
            </p>
            <p className="mt-3 text-copy text-ink-muted">
              Angka yang benar-benar dihitung dari database ada di{' '}
              <Link
                href="/admin/funnel"
                className="font-medium text-ink underline decoration-hairline-strong underline-offset-2 transition-colors hover:decoration-ink"
              >
                Funnel
              </Link>{' '}
              dan{' '}
              <Link
                href="/admin/vouchers"
                className="font-medium text-ink underline decoration-hairline-strong underline-offset-2 transition-colors hover:decoration-ink"
              >
                Voucher
              </Link>
              .
            </p>
          </div>
        </section>
      </div>

      <footer className="border-t border-hairline px-8 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-mini text-ink-soft">
          <div className="flex items-center gap-4">
            <span>Salda · panel internal</span>
            <Link
              href="/terms"
              className="transition-colors hover:text-ink"
            >
              Ketentuan
            </Link>
            <Link
              href="/privacy-notice"
              className="transition-colors hover:text-ink"
            >
              Privasi
            </Link>
          </div>
          <span className="numeric font-mono text-ink-faint">v1.0.0</span>
        </div>
      </footer>
    </div>
  );
}
