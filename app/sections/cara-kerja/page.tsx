import { Section, SectionHeading } from '../section-heading';

/**
 * "Delapan langkah dari daftar sampai live."
 *
 * Copy is verbatim from design/REFERENCE.md — do not paraphrase. It is written
 * to answer the question a first-time brand actually has, which is not "what
 * are the features" but "what will be asked of me, and when".
 *
 * Eight is a lot of steps to put on a landing page, and that is the point: the
 * brief's finding was that the product felt unproven. Naming every step,
 * including the unglamorous ones like waiting for a host to accept, reads as
 * confidence rather than as friction.
 */
const STEPS = [
  {
    n: '01',
    title: 'Minta Akses',
    body: 'Pastikan kamu sudah membuat akun dan mendapatkan akses dari tim Trolive. Jika belum, silakan klik tombol ini untuk mengirim pesan permintaan akses.',
  },
  {
    n: '02',
    title: 'Masuk & Jelajahi',
    body: 'Masuk dengan akun kamu dan lihat-lihat platform untuk membiasakan diri dengan semua fitur yang tersedia.',
  },
  {
    n: '03',
    title: 'Pesan Host',
    body: 'Lihat host yang kamu suka dan klik "book livestreamer" untuk memilih jam yang tersedia.',
  },
  {
    n: '04',
    title: 'Cek Detail Booking',
    body: 'Periksa detail booking kamu dan pastikan informasi pengiriman barang dan sub akun sudah benar. Hubungi host atau support jika butuh bantuan.',
  },
  {
    n: '05',
    title: 'Selesaikan Pembayaran',
    body: 'Selesaikan pembayaran menggunakan QRIS/VA/Transfer Bank yang tersedia. Setelah itu kamu akan diarahkan untuk melihat booking yang baru saja dibuat.',
  },
  {
    n: '06',
    title: 'Tunggu Konfirmasi',
    body: 'Kamu bisa menunggu host untuk menerima/menolak booking dan akan mendapat notifikasi di dalam aplikasi, jadi pastikan untuk membuka web app untuk mengecek.',
  },
  {
    n: '07',
    title: 'Komunikasi dengan Host',
    body: 'Setelah host menerima, komunikasikan via pesan aplikasi dan kirim produk kamu untuk mereka tampilkan.',
  },
  {
    n: '08',
    title: 'Mulai Live',
    body: 'Mereka akan melakukan live sesuai waktu booking kamu dan kamu akan diinformasikan tentang semuanya. Selesai!',
  },
] as const;

export default function CaraKerja() {
  return (
    <Section id="cara-kerja">
      <SectionHeading
        index="01"
        eyebrow="Cara kerja"
        title="Delapan langkah dari daftar sampai live."
        sub="Kami dampingi di tiap tahap supaya sesi pertama kamu berjalan tanpa kejutan."
      />

      {/*
        `shadow-cell` rather than borders, and no gap between cells.

        A bordered cell inside a grid draws its edge against its neighbour's, so
        every internal seam comes out 2px while the outer edge stays 1px — it
        reads as a rendering fault. A half-pixel spread ring overlaps instead of
        stacking, so every seam is 1px whether one cell owns it or two do. This
        is the first of the two bugs the brief says not to repeat.
      */}
      <div className="mt-12 grid grid-cols-1 overflow-hidden rounded-panel sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step) => (
          <div key={step.n} className="bg-surface p-6 shadow-cell">
            <p className="font-mono text-mini tracking-[.08em] text-brand">{step.n}</p>
            <h3 className="mt-3 text-ui font-semibold text-ink">{step.title}</h3>
            <p className="mt-2 text-copy leading-relaxed text-ink-muted">{step.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
