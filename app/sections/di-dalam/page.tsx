'use client';

import { useEffect, useRef, useState } from 'react';

import { Section } from '../section-heading';

/**
 * "02 / Di dalam" — Semua yang kamu butuhkan ada di satu layar.
 *
 * Four cards, each a small looping mock-UI of one screen in the product. The
 * panels are drawn out of hairlines and blocks rather than screenshots, so the
 * page never waits on an image and the motion is the whole point: each panel
 * plays the single gesture that screen is for.
 *
 * Geometry, timing and easing are ported verbatim from the design file
 * (repeat(auto-fit,minmax(230px,1fr)), 20px gap, 22px number circle, 16/10
 * panels, 4.5s loops). Keyframes live in app/globals.css.
 */

/** Card titles and bodies, verbatim from the design file. */
const CARDS = [
  {
    n: '01',
    title: 'Pesan host',
    body: 'Pilih host, lalu tandai blok jam yang kamu mau.',
  },
  {
    n: '02',
    title: 'Cek detail booking',
    body: 'Rincian sesi di kiri, total harga selalu terlihat di kanan.',
  },
  {
    n: '03',
    title: 'Selesaikan pembayaran',
    body: 'QRIS, virtual account, atau transfer bank.',
  },
  {
    n: '04',
    title: 'Komunikasi dengan host',
    body: 'Kirim brief dan pantau balasan host di aplikasi.',
  },
] as const;

/** The reveal stagger, in ms, one per card — 0 / 130 / 260 / 390. */
const DELAYS = [0, 130, 260, 390] as const;

/* --------------------------------------------------------------------- */
/* The four mock panels. Each is 16/10, hairline-bordered, radius 10.     */
/* --------------------------------------------------------------------- */

/** 01 — a grid of host cards; the middle one selects, then two filter chips fill. */
function PanelBook() {
  return (
    <div className="flex aspect-[16/10] w-full flex-col overflow-hidden rounded-[10px] border border-hairline bg-canvas">
      <div className="flex h-[22px] shrink-0 items-center gap-[7px] border-b border-hairline bg-surface px-[9px]">
        <span className="h-2 flex-1 rounded-[4px] bg-hairline-soft" />
        <span className="h-2 w-5 rounded-[4px] bg-hairline" />
      </div>
      <div className="grid flex-1 grid-cols-3 content-start gap-[7px] p-[9px]">
        <div className="aspect-[3/4] rounded-[4px] border border-hairline bg-surface" />
        <div
          className="aspect-[3/4] rounded-[4px] border border-hairline bg-surface"
          style={{ animation: 'k-select 4.5s ease-out infinite' }}
        />
        <div className="aspect-[3/4] rounded-[4px] border border-hairline bg-surface" />
      </div>
      <div className="flex shrink-0 gap-[5px] px-[9px] pb-[9px]">
        <span
          className="h-[14px] flex-1 rounded-chip border border-hairline bg-surface"
          style={{ animation: 'k-chip 4.5s ease-out infinite' }}
        />
        <span
          className="h-[14px] flex-1 rounded-chip border border-hairline bg-surface"
          style={{ animation: 'k-chip 4.5s ease-out infinite .25s' }}
        />
        <span className="h-[14px] flex-1 rounded-chip border border-hairline bg-surface" />
      </div>
    </div>
  );
}

/** 02 — booking rows on the left highlighting in sequence, total on the right. */
function PanelDetail() {
  return (
    <div className="flex aspect-[16/10] w-full overflow-hidden rounded-[10px] border border-hairline bg-canvas">
      <div className="flex flex-1 flex-col gap-[7px] p-[10px]">
        <span className="h-[7px] w-[52%] rounded-[4px] bg-hairline" />
        {[
          { w: '70%', delay: '' },
          { w: '55%', delay: ' .5s' },
          { w: '62%', delay: ' 1s' },
        ].map((row) => (
          <span
            key={row.w}
            className="flex h-[13px] items-center rounded-chip px-1"
            style={{ animation: `k-rowhl 4.5s ease-in-out infinite${row.delay}` }}
          >
            <span
              className="h-[5px] rounded-chip bg-surface-deep"
              style={{ width: row.w }}
            />
          </span>
        ))}
      </div>
      <div className="flex w-[38%] flex-col gap-[6px] border-l border-hairline bg-surface p-[10px]">
        <span className="h-[5px] w-[70%] rounded-chip bg-surface-deep" />
        <span className="h-[5px] w-1/2 rounded-chip bg-surface-deep" />
        <span className="my-[2px] h-px bg-hairline-soft" />
        <span className="h-[11px] w-[80%] rounded-chip bg-ink" />
      </div>
    </div>
  );
}

/** 03 — three payment methods; the middle radio pops, then BAYAR fills. */
function PanelPay() {
  return (
    <div className="flex aspect-[16/10] w-full flex-col gap-[6px] overflow-hidden rounded-[10px] border border-hairline bg-surface p-[10px]">
      <div className="flex items-center gap-[7px] rounded-[4px] border border-hairline px-[7px] py-[5px]">
        <span className="h-[10px] w-[10px] shrink-0 rounded-[6px] border border-hairline-input" />
        <span className="h-[5px] w-[44%] rounded-chip bg-surface-deep" />
      </div>
      <div className="flex items-center gap-[7px] rounded-[4px] border border-brand bg-brand-wash px-[7px] py-[5px]">
        <span className="flex h-[10px] w-[10px] shrink-0 items-center justify-center rounded-[6px] border border-brand">
          <span
            className="h-[5px] w-[5px] rounded-chip bg-brand"
            style={{ animation: 'k-radio 4.5s ease-out infinite' }}
          />
        </span>
        {/* #c9dcff is outside the palette — taken verbatim from the design file. */}
        <span className="h-[5px] w-[56%] rounded-chip bg-[#c9dcff]" />
      </div>
      <div className="flex items-center gap-[7px] rounded-[4px] border border-hairline px-[7px] py-[5px]">
        <span className="h-[10px] w-[10px] shrink-0 rounded-[6px] border border-hairline-input" />
        <span className="h-[5px] w-[38%] rounded-chip bg-surface-deep" />
      </div>
      <div
        className="mt-auto flex h-[18px] items-center justify-center rounded-[4px] text-[8px] font-semibold tracking-[.04em]"
        style={{ animation: 'k-btnfill 4.5s ease-out infinite' }}
      >
        BAYAR
      </div>
    </div>
  );
}

/** 04 — a chat thread: host bubble, brand bubble, then a typing indicator. */
function PanelChat() {
  return (
    <div className="flex aspect-[16/10] w-full flex-col overflow-hidden rounded-[10px] border border-hairline bg-canvas">
      <div className="flex h-[22px] shrink-0 items-center gap-[7px] border-b border-hairline bg-surface px-[9px]">
        <span className="h-3 w-3 rounded-[7px] bg-hairline" />
        <span className="h-[6px] w-[44px] rounded-chip bg-hairline-soft" />
      </div>
      <div className="flex flex-1 flex-col justify-end gap-[6px] p-[9px]">
        <span
          className="h-[15px] w-[62%] self-start rounded-[8px_8px_8px_2px] border border-hairline bg-surface"
          style={{ animation: 'k-appear 4.5s ease-out infinite' }}
        />
        <span
          className="h-[15px] w-[48%] self-end rounded-[8px_8px_2px_8px] bg-brand"
          style={{ animation: 'k-appear 4.5s ease-out infinite .8s' }}
        />
        <span className="flex h-[15px] items-center gap-[3px] self-start rounded-[8px_8px_8px_2px] border border-hairline bg-surface px-2">
          {['', ' .2s', ' .4s'].map((delay, i) => (
            <span
              key={i}
              className="h-[3px] w-[3px] rounded-hair bg-ink-ghost"
              style={{ animation: `k-dots 1.2s ease-in-out infinite${delay}` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

const PANELS = [PanelBook, PanelDetail, PanelPay, PanelChat] as const;

export default function DiDalam() {
  /*
    Visible by default. This is the design file's own contract: state starts
    `shotsSeen: true`, and the observer is only ever allowed to turn it off for
    a section that is genuinely still below the fold. Every early return below
    leaves the cards on screen — a reveal that can strand the section at
    opacity 0 ships a blank page.
  */
  const [seen, setSeen] = useState(true);
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    // No observer, or the visitor asked for less motion: stay as-is, visible.
    if (typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    // Already on screen at mount — never animate, never hide.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;

    setSeen(false);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    // Belt and braces: whatever the observer does or fails to do, the cards
    // are back after 4s.
    const fallback = window.setTimeout(() => setSeen(true), 4000);

    return () => {
      io.disconnect();
      window.clearTimeout(fallback);
    };
  }, []);

  return (
    <Section>
      <div className="mx-auto mb-[clamp(36px,6vh,60px)] max-w-[640px] text-center">
        <p className="font-mono text-mini tracking-[.08em] text-ink-ghost">02 / Di dalam</p>
        <h2 className="mt-4 font-serif text-heading font-medium text-balance text-ink">
          Semua yang kamu butuhkan ada di satu layar.
        </h2>
        <p className="mt-3.5 text-[15.5px] leading-[1.6] text-pretty text-ink-muted">
          Jadwal, pembayaran, pesan ke host, dan status sesi. Tidak perlu pindah ke WhatsApp atau
          spreadsheet.
        </p>
      </div>

      <div
        ref={gridRef}
        className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-5"
      >
        {CARDS.map((card, i) => {
          const Panel = PANELS[i];
          return (
            <div
              key={card.n}
              style={{
                opacity: seen ? 1 : 0,
                transform: seen ? 'translateY(0)' : 'translateY(18px)',
                transition: `opacity .6s cubic-bezier(.16,1,.3,1) ${DELAYS[i]}ms,transform .6s cubic-bezier(.16,1,.3,1) ${DELAYS[i]}ms`,
              }}
            >
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[11px] bg-brand font-mono text-[10.5px] font-medium text-white">
                  {card.n}
                </span>
                <span className="h-px flex-1 bg-hairline" />
              </div>
              <Panel />
              <p className="mb-1 mt-[13px] text-copy font-semibold text-ink">{card.title}</p>
              <p className="text-meta leading-[1.55] text-ink-soft">{card.body}</p>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
