import Link from 'next/link';

/**
 * Reports & analytics.
 *
 * WHAT WAS REMOVED, AND WHY
 *
 * Everything on this page came out of four arrays declared at the top of the
 * file under the comment `// Mock data for reports`:
 *
 *   - four headline stats — "Rp 1.2B revenue", "2,543 bookings", "892 active
 *     clients", "Rp 450K average booking value" — each with a green or red
 *     percentage next to it;
 *   - a "Top Clients" list (Tech Corp, Fashion Hub, Beauty Co, Game Studio)
 *     with spend and growth figures;
 *   - a "Top Teams" list with earnings and satisfaction ratings, for a concept
 *     — teams — that does not exist anywhere in this product's schema;
 *   - a "Peak Hours" bar chart whose tallest bar was hardcoded to 478.
 *
 * Not one of those numbers came from a query. A report is the one screen where
 * a made-up figure does the most damage, because its entire purpose is to be
 * believed and acted on — and putting the design system's typography around
 * them would only have made them more convincing.
 *
 * So the page states what it is instead. Wiring real aggregates is a data
 * change, not a presentation change, and is not done here. The time-range
 * selector went with the numbers: a range control over nothing is a control
 * that promises data exists.
 */
export default function ReportsPage() {
  return (
    <div className="px-8 py-8">
      <header className="mb-7 max-w-[620px]">
        <h1 className="font-serif text-section font-semibold text-ink">
          Laporan
        </h1>
        <p className="mt-2 text-lede text-ink-soft">
          Pantau performa platform dan tren booking.
        </p>
      </header>

      <section className="max-w-[720px] overflow-hidden rounded-frame border border-hairline bg-surface">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline-soft px-5 py-4">
          <span className="numeric font-mono text-mini font-semibold text-ink-ghost">
            01
          </span>
          <h2 className="font-serif text-title font-semibold text-ink">
            Laporan belum punya sumber data
          </h2>
        </div>

        <div className="px-5 py-4">
          <p className="text-copy text-ink-muted">
            Halaman ini sebelumnya menampilkan pendapatan, jumlah booking, klien
            teratas, dan grafik jam tersibuk. Semua angkanya ditulis langsung di
            kode dan tidak pernah dihitung dari database, jadi seluruhnya
            dihapus. Angka laporan yang salah lebih berbahaya daripada tidak ada
            angka sama sekali.
          </p>
          <p className="mt-3 text-copy text-ink-muted">
            Yang sudah dihitung dari data asli:{' '}
            <Link
              href="/admin/funnel"
              className="font-medium text-ink underline decoration-hairline-strong underline-offset-2 transition-colors hover:decoration-ink"
            >
              Funnel pendaftaran
            </Link>{' '}
            untuk konversi onboarding, dan{' '}
            <Link
              href="/admin/vouchers"
              className="font-medium text-ink underline decoration-hairline-strong underline-offset-2 transition-colors hover:decoration-ink"
            >
              Voucher
            </Link>{' '}
            untuk pemakaian dan total diskon.
          </p>
        </div>
      </section>
    </div>
  );
}
