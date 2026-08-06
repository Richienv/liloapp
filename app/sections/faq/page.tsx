"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { Section } from "../section-heading";

interface FAQItem {
  question: string;
  answer: string;
}

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs: FAQItem[] = [
    {
      question: "Apa itu Salda dan bagaimana cara kerjanya?",
      answer: "Salda adalah platform live commerce yang menghubungkan brand dengan livestreamer profesional. Platform kami menyediakan fitur lengkap untuk mengelola sesi live streaming, mulai dari penjadwalan, pembayaran, hingga analitik performa penjualan."
    },
    {
      question: "Berapa biaya untuk menggunakan layanan Salda?",
      answer: "Biaya layanan Salda bervariasi tergantung paket yang dipilih. Kami menerapkan sistem komisi berdasarkan performa penjualan, sehingga kamu hanya membayar ketika berhasil melakukan penjualan. Hubungi tim kami untuk informasi pricing yang lebih detail."
    },
    {
      question: "Bagaimana proses verifikasi livestreamer di Salda?",
      answer: "Setiap livestreamer di Salda melalui proses verifikasi ketat yang mencakup: pengecekan pengalaman, portfolio penjualan, kemampuan komunikasi, dan pemahaman produk. Kami juga memberikan pelatihan khusus untuk memastikan kualitas layanan terbaik."
    },
    {
      question: "Platform e-commerce apa saja yang didukung oleh Salda?",
      answer: "Saat ini Salda mendukung integrasi dengan platform e-commerce major seperti Shopee dan TikTok Shop. Kami terus menambah dukungan untuk platform lainnya untuk memberikan fleksibilitas maksimal bagi pengguna kami."
    },
    {
      question: "Apakah ada jaminan keamanan transaksi di Salda?",
      answer: "Ya, Salda menggunakan sistem escrow dan enkripsi data untuk menjamin keamanan setiap transaksi. Dana akan ditahan dalam sistem escrow hingga sesi live streaming selesai dan kedua belah pihak menyetujui penyelesaian transaksi."
    },
    {
      question: "Bagaimana sistem pembayaran di Salda bekerja?",
      answer: "Salda menggunakan sistem pembayaran yang aman dan transparan. Pembayaran dapat dilakukan melalui berbagai metode seperti transfer bank, e-wallet, dan kartu kredit. Pencairan dana dilakukan secara otomatis sesuai jadwal yang telah ditentukan."
    },
    {
      question: "Apakah Salda menyediakan laporan analitik performa?",
      answer: "Ya, Salda menyediakan dashboard analitik komprehensif yang mencakup metrik penting seperti jumlah viewer, engagement rate, conversion rate, dan total penjualan. Laporan dapat diakses real-time dan dapat di-export untuk analisis lebih lanjut."
    },
    {
      question: "Bagaimana jika terjadi kendala teknis saat live streaming?",
      answer: "Tim support teknis Salda tersedia 24/7 untuk membantu mengatasi kendala teknis. Kami juga menyediakan backup system dan panduan troubleshooting untuk memastikan kelancaran setiap sesi live streaming."
    }
  ];

  return (
    /*
      The section sits on the canvas like every other one.

      It used to paint itself `bg-surface` — a full-bleed white band across a
      warm page, which is the one background the brief rules out. The white is
      the panel the questions live in; the page stays #faf9f6.
    */
    <Section id="faq">
      <div className="mx-auto max-w-[860px]">
        {/* Section Header */}
        <div className="mx-auto max-w-[46ch] text-center">
          <p className="font-mono text-mini tracking-[.08em] text-ink-ghost">04 / FAQ</p>
          {/* One accent per section, and on this one it is spent on the
              support link at the bottom — so the heading is plain ink rather
              than the half-blue it used to be. */}
          <h2 className="mt-4 font-serif text-heading font-medium text-balance text-ink">
            Pertanyaan yang sering ditanyakan.
          </h2>
          <p className="mx-auto mt-3.5 text-lede text-ink-muted">
            Temukan jawaban untuk pertanyaan umum seputar layanan Salda dan cara kerjanya.
          </p>
        </div>

        {/*
          One panel, hairline dividers — not eight floating cards.

          Eight separately-bordered boxes with a gap between them draw sixteen
          horizontal lines down the page and give every question the visual
          weight of a card. A single framed list draws one edge and one hairline
          per seam, so the eye reads a list of questions rather than a stack of
          objects.

          The per-item `whileInView` fade is gone with them: it started at
          `opacity: 0` and staggered to 0.7s on the last item, so a failed
          observer left the answers to a page of questions invisible.
        */}
        <div className="mt-12 overflow-hidden rounded-frame border border-hairline bg-surface">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={index} className="border-b border-hairline-soft last:border-b-0">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-surface-raised sm:px-5"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                >
                  <span className="text-ui font-medium text-ink">{faq.question}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-ink-ghost transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <p className="px-4 pb-4 text-copy leading-relaxed text-ink-muted sm:px-5">
                        {faq.answer}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Support Link — the section's one accent. */}
        <p className="mt-8 text-center text-meta text-ink-soft">
          Masih punya pertanyaan?{" "}
          <a
            href="https://wa.me/62895700120901"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand transition-colors hover:text-brand-hover"
          >
            Hubungi tim support kami
          </a>
        </p>
      </div>
    </Section>
  );
}
