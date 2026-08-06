"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
    <section className="relative py-16 sm:py-20 md:py-24 bg-surface overflow-hidden">
      <div className="container mx-auto px-3 sm:px-4">
        <div className="max-w-[1000px] mx-auto">
          {/* Section Header */}
          <div className="text-center mb-8 sm:mb-12 md:mb-16">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif mb-4 sm:mb-6 tracking-[-0.02em]">
              Pertanyaan yang Sering{" "}
              <span className="text-brand">
                Ditanyakan
              </span>
            </h2>
            <p className="text-xs sm:text-sm md:text-base text-ink-muted leading-relaxed font-light max-w-2xl mx-auto">
              Temukan jawaban untuk pertanyaan umum seputar layanan Salda dan cara kerjanya
            </p>
          </div>

          {/* FAQ List */}
          <div className="space-y-3 sm:space-y-4">
            {faqs.map((faq, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10%" }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="border border-hairline-input rounded-lg sm:rounded-panel overflow-hidden bg-surface hover:border-hairline-strong transition-all duration-300"
              >
                <button
                  className="w-full px-4 sm:px-6 py-3 sm:py-4 text-left flex items-center justify-between gap-4"
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                >
                  <span className="text-sm sm:text-base font-medium text-ink pr-4">{faq.question}</span>
                  <ChevronDown
                    className={`w-4 h-4 sm:w-5 sm:h-5 text-ink-soft transition-transform flex-shrink-0 ${
                      openIndex === index ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <AnimatePresence>
                  {openIndex === index && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 sm:px-6 pb-4 text-xs sm:text-sm text-ink-muted font-light">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>

          {/* Support Link */}
          <div className="text-center mt-8 sm:mt-10 md:mt-12">
            <p className="text-xs sm:text-sm text-ink-muted">
              Masih punya pertanyaan?{" "}
              <a
                href="https://wa.me/62895700120901"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Hubungi tim support kami
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Background Decorations */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        
        
      </div>
    </section>
  );
} 