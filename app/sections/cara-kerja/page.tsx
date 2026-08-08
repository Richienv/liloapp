import type { ReactNode } from 'react';

/*
 * design-lint-allow: white-surface, raw-hex
 *
 * One bg-white: the 5px dot inside the brand-blue LIVE chip on step 08 —
 * white on blue, not a surface. One raw hex: the envelope flap on step 01 is a
 * CSS triangle, and border-top-color in an inline style cannot take a Tailwind
 * class. It is the hairline value.
 */

/**
 * "01 / Cara kerja" — Delapan langkah dari daftar sampai live.
 *
 * Ported 1:1 from the design file (Salda_Landing.dc.html, the CARA KERJA
 * section). Every geometry number, colour, duration, easing and delay below is
 * the design's own value, not an approximation.
 *
 * Two deliberate structural choices carried over from the design:
 *
 *  - Cells use `shadow-cell` (`0 0 0 .5px #e7e5e0`) instead of a border. A
 *    bordered cell inside a gapless grid draws its edge against its
 *    neighbour's, so every internal seam comes out 2px while the outer edge
 *    stays 1px. A half-pixel spread ring overlaps instead of stacking.
 *  - Nothing here is reveal-gated. The copy and the illustrations are in the
 *    SSR output at full opacity; the only things that animate are decorative
 *    parts inside the 112px illustration frames, and every one of those loops
 *    forever, so there is no state in which a step can fail to appear.
 *
 * The keyframes (k-env, k-flap, k-letter, k-stamp, k-cursor, k-hl, k-lift,
 * k-tick, k-tickmark, k-fill, k-scan, k-pulse, k-ring, k-drop, k-bub,
 * k-parcel, k-bar, k-livedot) all live in app/globals.css.
 */

/** The design's shared easing curves, spelled once. */
const OUT_EXPO = 'cubic-bezier(.16,1,.3,1)';
const STANDARD = 'cubic-bezier(.4,0,.2,1)';

/** The 112px illustration frame every step shares. */
const FRAME =
  'relative h-28 overflow-hidden rounded-field border border-hairline bg-canvas mb-[18px]';

/* ------------------------------------------------------------------ */
/* 01 — envelope opens, letter rises, "Disetujui" stamps               */
/* ------------------------------------------------------------------ */
function ArtEnvelope() {
  return (
    <div className={FRAME}>
      <div
        className="absolute left-1/2 top-1/2 h-11 w-[68px]"
        style={{
          margin: '-20px 0 0 -46px',
          perspective: '220px',
          animation: `k-env 5s ${OUT_EXPO} infinite`,
        }}
      >
        {/* the letter, rising out of the envelope */}
        <div
          className="absolute left-2 top-[5px] flex h-[34px] w-[52px] flex-col rounded-[3px] border border-hairline bg-surface"
          style={{ padding: '7px 8px', gap: '5px', animation: `k-letter 5s ${OUT_EXPO} infinite` }}
        >
          <span className="h-1 w-[80%] rounded-[2px] bg-hairline" />
          <span className="h-1 w-[55%] rounded-[2px] bg-hairline" />
          <span className="h-1 w-[34%] rounded-[2px] bg-brand" />
        </div>
        {/* envelope body, in front of the letter */}
        <div className="absolute inset-0 z-[2] rounded-[4px] border border-hairline bg-surface-tint" />
        {/* the flap: a CSS triangle hinged on its top edge */}
        <div
          className="absolute left-0 top-0 z-[3] h-0 w-0"
          style={{
            borderLeft: '34px solid transparent',
            borderRight: '34px solid transparent',
            borderTop: '24px solid #e7e5e0', // hairline
            transformOrigin: 'top center',
            animation: `k-flap 5s ${OUT_EXPO} infinite`,
          }}
        />
      </div>
      <div
        className="absolute bottom-[14px] right-4 flex items-center gap-[7px] rounded-[5px] bg-brand px-[10px] py-[5px] text-[10.5px] font-semibold text-white"
        style={{ animation: `k-stamp 5s ${OUT_EXPO} infinite` }}
      >
        ✓ Disetujui
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 02 — cursor tours the nav, tabs highlight in sequence               */
/* ------------------------------------------------------------------ */
const NAV_PILLS: { w: string; delay: string }[] = [
  { w: '34px', delay: '0s' },
  { w: '26px', delay: '.9s' },
  { w: '30px', delay: '1.8s' },
  { w: '22px', delay: '2.7s' },
];

function ArtCursor() {
  return (
    <div className={FRAME}>
      <div className="absolute left-4 right-4 top-[14px] flex gap-[7px]">
        {NAV_PILLS.map((p) => (
          <span
            key={p.delay}
            className="h-2 rounded-[4px] bg-hairline"
            style={{ width: p.w, animation: `k-hl 4s ease-in-out infinite ${p.delay}` }}
          />
        ))}
      </div>
      <div className="absolute left-4 right-4 top-[38px] grid grid-cols-3 gap-[7px]">
        <span className="h-11 rounded-[5px] border border-surface-deep bg-surface" />
        <span className="h-11 rounded-[5px] border border-surface-deep bg-surface" />
        <span className="h-11 rounded-[5px] border border-surface-deep bg-surface" />
      </div>
      <div
        className="absolute h-[9px] w-[9px] rounded-[5px] bg-brand"
        style={{ animation: `k-cursor 4s ${STANDARD} infinite` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 03 — the middle host card lifts and takes the brand border          */
/* ------------------------------------------------------------------ */
function ArtLift() {
  return (
    <div className={`${FRAME} flex items-center justify-center gap-[9px]`}>
      <div className="h-[66px] w-11 rounded-[6px] border border-hairline bg-surface" />
      <div
        className="flex h-[74px] w-[52px] flex-col justify-end rounded-[6px] border border-hairline bg-surface"
        style={{ padding: '7px', gap: '5px', animation: `k-lift 3.4s ${OUT_EXPO} infinite` }}
      >
        <span className="h-[5px] w-[70%] rounded-[3px] bg-hairline" />
        <span className="h-[9px] rounded-[3px] bg-brand" />
      </div>
      <div className="h-[66px] w-11 rounded-[6px] border border-hairline bg-surface" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 04 — three checklist rows tick in sequence                          */
/* ------------------------------------------------------------------ */
const TICK_DELAYS = ['0s', '.5s', '1s'];

function ArtTicks() {
  return (
    <div className={`${FRAME} flex flex-col p-4`} style={{ gap: '11px' }}>
      {TICK_DELAYS.map((d) => (
        <div key={d} className="flex items-center gap-[10px]">
          <span
            className="flex h-[17px] w-[17px] items-center justify-center rounded-[4px] border border-hairline-input bg-surface text-[10px] text-white"
            style={{ animation: `k-tick 4.2s ease-out infinite ${d}` }}
          >
            <span style={{ animation: `k-tickmark 4.2s ease-out infinite ${d}` }}>✓</span>
          </span>
          <span className="h-[7px] flex-1 rounded-[4px] bg-hairline" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 05 — QR scans while the payment bar fills                           */
/* ------------------------------------------------------------------ */
/** The 3x3 QR pattern: true = ink, false = surface-deep. */
const QR_CELLS = [true, false, true, false, true, false, true, false, true];

function ArtQr() {
  return (
    <div className={`${FRAME} flex items-center gap-[14px] px-[18px]`}>
      <div
        className="relative grid h-[54px] w-[54px] grid-cols-3 grid-rows-3 overflow-hidden rounded-[6px] border border-hairline bg-surface"
        style={{ gap: '3px', padding: '7px' }}
      >
        {QR_CELLS.map((on, i) => (
          <span
            key={i}
            className={`rounded-[1px] ${on ? 'bg-ink' : 'bg-surface-deep'}`}
          />
        ))}
        <span
          className="absolute left-0 right-0 top-0 h-[2px] bg-brand"
          style={{ animation: 'k-scan 3s ease-in-out infinite' }}
        />
      </div>
      <div className="flex flex-1 flex-col gap-[9px]">
        <span className="h-[7px] w-[64%] rounded-[4px] bg-hairline" />
        <span className="block h-2 overflow-hidden rounded-[4px] bg-surface-deep">
          <span
            className="block h-full rounded-[4px] bg-brand"
            style={{ animation: `k-fill 3s ${OUT_EXPO} infinite` }}
          />
        </span>
        <span className="h-[7px] w-[40%] rounded-[4px] bg-hairline" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 06 — notification drops in over a pulsing target                    */
/* ------------------------------------------------------------------ */
function ArtNotify() {
  return (
    <div className={FRAME}>
      <div
        className="absolute left-4 right-4 top-[14px] flex h-[30px] items-center gap-[9px] rounded-[6px] border border-hairline bg-surface px-[11px]"
        style={{ animation: `k-drop 4.4s ${OUT_EXPO} infinite` }}
      >
        <span className="h-[7px] w-[7px] rounded-[4px] bg-brand" />
        <span className="h-[6px] flex-1 rounded-[3px] bg-hairline" />
      </div>
      <div className="absolute bottom-[22px] left-1/2 h-4 w-4 -translate-x-1/2">
        <span
          className="absolute inset-0 rounded-[9px] border border-brand"
          style={{ animation: 'k-ring 2.4s ease-out infinite' }}
        />
        <span
          className="absolute inset-1 rounded-[5px] bg-brand"
          style={{ animation: 'k-pulse 2.4s ease-in-out infinite' }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 07 — two chat bubbles, then the parcel travels                      */
/* ------------------------------------------------------------------ */
function ArtChat() {
  return (
    <div className={`${FRAME} flex flex-col gap-2 p-[14px]`}>
      <span
        className="h-[19px] w-[58%] self-start border border-hairline bg-surface"
        style={{ borderRadius: '9px 9px 9px 2px', animation: 'k-bub 4s ease-out infinite' }}
      />
      <span
        className="h-[19px] w-[44%] self-end bg-brand"
        style={{ borderRadius: '9px 9px 2px 9px', animation: 'k-bub 4s ease-out infinite .7s' }}
      />
      <div className="relative mt-[2px] h-5">
        <span
          className="absolute left-0 top-[2px] h-4 w-[22px] rounded-[3px] bg-ink"
          style={{ animation: `k-parcel 4s ${STANDARD} infinite 1.4s` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 08 — LIVE chip over a five-bar equaliser                            */
/* ------------------------------------------------------------------ */
const EQ_BARS: { delay: string; brand: boolean }[] = [
  { delay: '0s', brand: false },
  { delay: '.15s', brand: false },
  { delay: '.3s', brand: true },
  { delay: '.45s', brand: false },
  { delay: '.6s', brand: false },
];

function ArtLive() {
  return (
    <div className={`${FRAME} flex flex-col items-center justify-center gap-[14px]`}>
      <span className="flex items-center gap-[7px] rounded-[5px] bg-brand px-[11px] py-[5px] font-mono text-[10.5px] font-medium tracking-[.08em] text-white">
        <span
          className="h-[5px] w-[5px] rounded-[3px] bg-white"
          style={{ animation: 'k-livedot 1.6s ease-in-out infinite' }}
        />
        LIVE
      </span>
      <div className="flex h-[34px] items-end gap-[5px]">
        {EQ_BARS.map((b) => (
          <span
            key={b.delay}
            className={`w-[5px] rounded-[3px] ${b.brand ? 'bg-brand' : 'bg-ink'}`}
            style={{ animation: `k-bar 1.1s ease-in-out infinite ${b.delay}` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Copy is verbatim from the design file's step cards — do not paraphrase. It is
 * written to answer the question a first-time brand actually has, which is not
 * "what are the features" but "what will be asked of me, and when".
 */
const STEPS: { n: string; title: string; body: string; art: ReactNode }[] = [
  {
    n: '01',
    title: 'Minta Akses',
    body: 'Pastikan kamu sudah membuat akun dan mendapatkan akses dari tim Trolive. Jika belum, silakan klik tombol ini untuk mengirim pesan permintaan akses.',
    art: <ArtEnvelope />,
  },
  {
    n: '02',
    title: 'Masuk & Jelajahi',
    body: 'Masuk dengan akun kamu dan lihat-lihat platform untuk membiasakan diri dengan semua fitur yang tersedia.',
    art: <ArtCursor />,
  },
  {
    n: '03',
    title: 'Pesan Host',
    body: 'Lihat host yang kamu suka dan klik "book livestreamer" untuk memilih jam yang tersedia.',
    art: <ArtLift />,
  },
  {
    n: '04',
    title: 'Cek Detail Booking',
    body: 'Periksa detail booking kamu dan pastikan informasi pengiriman barang dan sub akun sudah benar. Hubungi host atau support jika butuh bantuan.',
    art: <ArtTicks />,
  },
  {
    n: '05',
    title: 'Selesaikan Pembayaran',
    body: 'Selesaikan pembayaran menggunakan QRIS/VA/Transfer Bank yang tersedia. Setelah itu kamu akan diarahkan untuk melihat booking yang baru saja dibuat.',
    art: <ArtQr />,
  },
  {
    n: '06',
    title: 'Tunggu Konfirmasi',
    body: 'Kamu bisa menunggu host untuk menerima/menolak booking dan akan mendapat notifikasi di dalam aplikasi, jadi pastikan untuk membuka web app untuk mengecek.',
    art: <ArtNotify />,
  },
  {
    n: '07',
    title: 'Komunikasi dengan Host',
    body: 'Setelah host menerima, komunikasikan via pesan aplikasi dan kirim produk kamu untuk mereka tampilkan.',
    art: <ArtChat />,
  },
  {
    n: '08',
    title: 'Mulai Live',
    body: 'Mereka akan melakukan live sesuai waktu booking kamu dan kamu akan diinformasikan tentang semuanya. Selesai!',
    art: <ArtLive />,
  },
];

export default function CaraKerja() {
  return (
    <section
      id="cara-kerja"
      className="mx-auto w-full max-w-[1180px] px-[clamp(20px,5vw,48px)] pt-[clamp(72px,12vh,140px)]"
    >
      <div className="mx-auto mb-[clamp(36px,6vh,60px)] max-w-[640px] text-center">
        <p className="mb-4 font-mono text-mini tracking-[.08em] text-ink-ghost">01 / Cara kerja</p>
        <h2 className="mb-[14px] font-serif text-heading font-medium text-balance text-ink">
          Delapan langkah dari daftar sampai live.
        </h2>
        <p className="text-[15.5px] leading-[1.6] text-pretty text-ink-muted">
          Kami dampingi di tiap tahap supaya sesi pertama kamu berjalan tanpa kejutan.
        </p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-0 overflow-hidden rounded-panel border border-hairline bg-surface">
        {STEPS.map((step) => (
          <div
            key={step.n}
            className="bg-surface px-[22px] pb-6 pt-5 shadow-cell [transition:background-color_.35s_ease] hover:bg-surface-raised"
          >
            {step.art}
            <p className="mb-[10px] font-mono text-[11.5px] text-brand">{step.n}</p>
            <p className="mb-2 text-[15px] font-semibold text-ink">{step.title}</p>
            <p className="text-copy leading-[1.6] text-ink-muted">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
