'use client';

import { useState } from 'react';

/**
 * "04 / FAQ".
 *
 * An 820px column, one accordion, hairline seams. The open row grows a 2px
 * blue left border and slides its content 18px right over .35s — the only
 * motion in the section, and the only accent.
 */

/*
  Questions and answers verbatim from the design file's FAQS const, with one
  edit: #2 said "Anda hanya membayar" and this app addresses the reader as
  "kamu", never "Anda".

  FLAG, deliberately not fixed here: #2 describes a commission model — "hanya
  membayar ketika berhasil melakukan penjualan" — which contradicts
  lib/pricing.ts, where PLATFORM_FEE_RATE is a 30% platform fee charged on the
  base price at booking time (plus 11% tax), regardless of whether the session
  sells anything. Someone who owns the commercial policy has to resolve this;
  rewriting the answer here would mean inventing a pricing policy.
*/
const FAQS: readonly (readonly [question: string, answer: string])[] = [
  [
    'Apa itu Salda dan bagaimana cara kerjanya?',
    'Salda adalah platform live commerce yang menghubungkan brand dengan livestreamer profesional. Platform kami menyediakan fitur lengkap untuk mengelola sesi live streaming, mulai dari penjadwalan, pembayaran, hingga analitik performa penjualan.',
  ],
  [
    'Berapa biaya untuk menggunakan layanan Salda?',
    'Biaya layanan Salda bervariasi tergantung paket yang dipilih. Kami menerapkan sistem komisi berdasarkan performa penjualan, sehingga kamu hanya membayar ketika berhasil melakukan penjualan. Hubungi tim kami untuk informasi pricing yang lebih detail.',
  ],
  [
    'Bagaimana proses verifikasi livestreamer di Salda?',
    'Setiap livestreamer di Salda melalui proses verifikasi ketat yang mencakup: pengecekan pengalaman, portfolio penjualan, kemampuan komunikasi, dan pemahaman produk. Kami juga memberikan pelatihan khusus untuk memastikan kualitas layanan terbaik.',
  ],
  [
    'Platform e-commerce apa saja yang didukung oleh Salda?',
    'Saat ini Salda mendukung integrasi dengan platform e-commerce major seperti Shopee dan TikTok Shop. Kami terus menambah dukungan untuk platform lainnya untuk memberikan fleksibilitas maksimal bagi pengguna kami.',
  ],
  [
    'Apakah ada jaminan keamanan transaksi di Salda?',
    'Ya, Salda menggunakan sistem escrow dan enkripsi data untuk menjamin keamanan setiap transaksi. Dana akan ditahan dalam sistem escrow hingga sesi live streaming selesai dan kedua belah pihak menyetujui penyelesaian transaksi.',
  ],
  [
    'Bagaimana sistem pembayaran di Salda bekerja?',
    'Salda menggunakan sistem pembayaran yang aman dan transparan. Pembayaran dapat dilakukan melalui berbagai metode seperti transfer bank, e-wallet, dan kartu kredit. Pencairan dana dilakukan secara otomatis sesuai jadwal yang telah ditentukan.',
  ],
  [
    'Apakah Salda menyediakan laporan analitik performa?',
    'Ya, Salda menyediakan dashboard analitik komprehensif yang mencakup metrik penting seperti jumlah viewer, engagement rate, conversion rate, dan total penjualan. Laporan dapat diakses real-time dan dapat di-export untuk analisis lebih lanjut.',
  ],
  [
    'Bagaimana jika terjadi kendala teknis saat live streaming?',
    'Tim support teknis Salda tersedia 24/7 untuk membantu mengatasi kendala teknis. Kami juga menyediakan backup system dan panduan troubleshooting untuk memastikan kelancaran setiap sesi live streaming.',
  ],
] as const;

export default function FAQ() {
  // The design opens the first question on load — the section reads as answers,
  // not as eight closed doors. Clicking the open row closes it.
  const [open, setOpen] = useState(0);

  return (
    <section
      id="faq"
      className="mx-auto w-full max-w-[820px] px-[clamp(20px,5vw,48px)] pt-[clamp(72px,12vh,140px)]"
    >
      <div className="mx-auto mb-[clamp(36px,6vh,56px)] text-center">
        <p className="font-mono text-mini tracking-[.08em] text-ink-ghost">04 / FAQ</p>
        <h2 className="mt-4 font-serif text-heading font-medium text-balance text-ink">
          Pertanyaan yang sering ditanyakan.
        </h2>
        <p className="mt-3.5 text-[15.5px] leading-[1.6] text-pretty text-ink-muted">
          Temukan jawaban untuk pertanyaan umum seputar layanan Salda dan cara kerjanya.
        </p>
      </div>

      <div className="border-t border-hairline">
        {FAQS.map(([question, answer], i) => {
          const isOpen = open === i;
          return (
            <div
              key={question}
              className="border-b border-hairline border-l-2"
              style={{
                borderLeftColor: isOpen ? '#2563eb' : 'transparent', // brand
                paddingLeft: isOpen ? '18px' : '0px',
                transition:
                  'border-color .35s ease,padding-left .35s cubic-bezier(.16,1,.3,1)',
              }}
            >
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? -1 : i)}
                className="flex w-full items-start justify-between gap-5 border-0 bg-transparent py-[19px] text-left"
              >
                <span
                  className={`text-[15.5px] leading-[1.45] text-ink ${
                    isOpen ? 'font-semibold' : 'font-medium'
                  }`}
                >
                  {question}
                </span>
                <span
                  aria-hidden
                  className={`shrink-0 text-[16px] leading-[1.4] ${
                    isOpen ? 'text-brand' : 'text-ink-ghost'
                  }`}
                >
                  {isOpen ? '−' : '+'}
                </span>
              </button>
              {isOpen && (
                <p className="mb-6 text-[14.5px] leading-[1.7] text-ink-muted">{answer}</p>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-copy text-ink-soft">
        Masih punya pertanyaan?{' '}
        <a
          href="https://wa.me/62895700120901"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-brand hover:text-brand-hover"
        >
          Hubungi tim support kami
        </a>
      </p>
    </section>
  );
}
