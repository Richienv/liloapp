"use client";

import { motion } from "framer-motion";
import Image from "next/image";

interface TutorialSlide {
  image: string;
  title: string;
  description: string;
}

const tutorialSlides: TutorialSlide[] = [
  {
    image: "/images/1b.png",
    title: "Minta Akses",
    description: "Pastikan kamu sudah membuat akun dan mendapatkan akses dari tim Trolive. Jika belum, silakan klik tombol ini untuk mengirim pesan permintaan akses."
  },
  {
    image: "/images/2b.png", 
    title: "Masuk & Jelajahi",
    description: "Masuk dengan akun kamu dan lihat-lihat platform untuk membiasakan diri dengan semua fitur yang tersedia."
  },
  {
    image: "/images/3b.png",
    title: "Pesan Host",
    description: "Lihat host yang kamu suka dan klik \"book livestreamer\" untuk memilih jam yang tersedia."
  },
  {
    image: "/images/4b.png",
    title: "Cek Detail Booking",
    description: "Periksa detail booking kamu dan pastikan informasi pengiriman barang dan sub akun sudah benar. Hubungi host atau support jika butuh bantuan."
  },
  {
    image: "/images/5b.png",
    title: "Selesaikan Pembayaran", 
    description: "Selesaikan pembayaran menggunakan QRIS/VA/Transfer Bank yang tersedia. Setelah itu kamu akan diarahkan untuk melihat booking yang baru saja dibuat."
  },
  {
    image: "/images/6b.png",
    title: "Tunggu Konfirmasi",
    description: "Kamu bisa menunggu host untuk menerima/menolak booking dan akan mendapat notifikasi di dalam aplikasi, jadi pastikan untuk membuka web app untuk mengecek."
  },
  {
    image: "/images/7b.png",
    title: "Komunikasi dengan Host",
    description: "Setelah host menerima, komunikasikan via pesan aplikasi dan kirim produk kamu untuk mereka tampilkan."
  },
  {
    image: "/images/8b.png",
    title: "Mulai Live!",
    description: "Mereka akan melakukan live sesuai waktu booking kamu dan kamu akan diinformasikan tentang semuanya. Selesai!"
  }
];

export default function About() {
  return (
    <section className="relative bg-canvas overflow-hidden">
      {/* Header Section */}
      <div className="sticky top-0 z-30 bg-canvas/80 backdrop-blur-sm pt-16 sm:pt-24 pb-8 sm:pb-12">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="text-center">
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-serif mb-4 sm:mb-6 tracking-[-0.02em] text-gray-900">
              Cara Menggunakan Salda
            </h2>
            <p className="text-xs sm:text-sm md:text-base text-gray-600 leading-relaxed md:leading-relaxed font-light max-w-2xl mx-auto px-2">
              Mulai perjalanan live commerce kamu dengan langkah-langkah sederhana. 
              Kami akan membantu kamu di setiap tahap untuk memastikan kesuksesan penjualan.
            </p>
          </div>
        </div>
      </div>

      {/* Steps Section */}
      <div className="container mx-auto px-3 sm:px-4 pb-16 sm:pb-24">
        <div className="max-w-[1200px] mx-auto">
          <div className="space-y-24 sm:space-y-32 md:space-y-40">
            {tutorialSlides.map((slide, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10%" }}
                transition={{ 
                  duration: 0.8,
                  ease: [0.21, 0.47, 0.32, 0.98]
                }}
                className="relative"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 md:gap-12 items-center">
                  {/* Image Section */}
                  <div className={`order-1 ${index % 2 === 0 ? 'md:order-1' : 'md:order-2'}`}>
                    <div className="relative aspect-[16/10] rounded-xl sm:rounded-2xl overflow-hidden bg-white shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
                      <Image
                        src={slide.image}
                        alt={slide.title}
                        fill
                        className="object-cover"
                        priority={index < 2}
                      />
                    </div>
                  </div>

                  {/* Content Section */}
                  <div className={`order-2 ${index % 2 === 0 ? 'md:order-2' : 'md:order-1'}`}>
                    <div className="relative">
                      <div className="space-y-3 sm:space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-black/[0.03] flex items-center justify-center">
                            <span className="text-xs sm:text-sm font-medium text-gray-600">
                              {index + 1}
                            </span>
                          </div>
                          <h3 className="text-lg sm:text-xl md:text-2xl font-medium text-gray-900">
                            {slide.title}
                          </h3>
                        </div>
                        <p className="text-sm sm:text-base text-gray-600 leading-relaxed font-light">
                          {slide.description}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Background Decorations */}
      <div className="absolute inset-0 pointer-events-none">
        
        
      </div>
    </section>
  );
} 