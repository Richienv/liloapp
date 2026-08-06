"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export default function Preview() {
  return (
    <section className="py-12 sm:py-16 md:py-24 bg-white">
      <div className="container mx-auto px-3 sm:px-4">
        <div className="max-w-[1200px] mx-auto">
          {/* Section Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12 sm:mb-16 md:mb-24"
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-serif mb-4 sm:mb-6 md:mb-8 tracking-tight">
              Meet Salda
            </h2>
            <div className="max-w-2xl mx-auto px-3 sm:px-4">
              <p className="text-sm sm:text-base md:text-lg text-gray-600 leading-relaxed sm:leading-relaxed md:leading-relaxed font-light">
                Salda adalah platform yang menyediakan jasa host live streaming terpercaya untuk jualan di TikTok dan Shopee Live. Dibuat oleh <span className="font-medium">TROLIVE</span>, Salda memudahkan kamu mencari host berpengalaman dengan sistem booking per jam.
              </p>
              <p className="text-sm sm:text-base md:text-lg text-gray-600 leading-relaxed sm:leading-relaxed md:leading-relaxed font-light mt-3 sm:mt-4">
                Semua host sudah terlatih dan terbukti bisa meningkatkan penjualan online kamu. Tanpa ribet, tanpa kontrak panjang, langsung bisa mulai dari 1 jam saja!
              </p>
            </div>
          </motion.div>

          {/* Service Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
            {/* Card 1 - Pembayaran Digital */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="group bg-canvas rounded-xl sm:rounded-2xl border border-black/[0.08] overflow-hidden hover:shadow-lg transition-all duration-300"
            >
              <div className="aspect-[4/3] sm:aspect-square relative p-4 sm:p-6">
                <Image
                  src="/images/va.png"
                  alt="Pembayaran Digital"
                  fill
                  className="object-contain transform group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="px-4 sm:px-6 pb-6 sm:pb-8 pt-3 sm:pt-4 text-center">
                <h3 className="text-base sm:text-lg md:text-xl font-serif mb-2 sm:mb-3">Pembayaran Digital, Mudah & Aman</h3>
                <p className="text-[11px] sm:text-xs text-gray-600 leading-relaxed font-light">
                  Pembayaran dilakukan di dalam aplikasi dengan sistem yang memberikan history dan bukti untuk menjaga keamanan transaksi. Bekerja sama dengan bank untuk memudahkan pembayaran dan support jika ada kendala.
                </p>
              </div>
            </motion.div>

            {/* Card 2 - Host Profesional */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="group bg-canvas rounded-xl sm:rounded-2xl border border-black/[0.08] overflow-hidden hover:shadow-lg transition-all duration-300"
            >
              <div className="aspect-[4/3] sm:aspect-square relative p-4 sm:p-6">
                <Image
                  src="/images/hs.png"
                  alt="Host Profesional"
                  fill
                  className="object-contain transform group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="px-4 sm:px-6 pb-6 sm:pb-8 pt-3 sm:pt-4 text-center">
                <h3 className="text-base sm:text-lg md:text-xl font-serif mb-2 sm:mb-3">Host Professional & Terjangkau</h3>
                <p className="text-[11px] sm:text-xs text-gray-600 leading-relaxed font-light">
                  Host yang dipilih sudah terbukti membawa ROI positif bagi brand sebelumnya dan dilatih untuk mempresentasikan produk dengan tujuan meningkatkan penjualan. Tersedia berbagai varian harga dan kategori streamer.
                </p>
              </div>
            </motion.div>

            {/* Card 3 - Customer Support */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="group bg-canvas rounded-xl sm:rounded-2xl border border-black/[0.08] overflow-hidden hover:shadow-lg transition-all duration-300"
            >
              <div className="aspect-[4/3] sm:aspect-square relative p-4 sm:p-6">
                <Image
                  src="/images/cs.png"
                  alt="Customer Support"
                  fill
                  className="object-contain transform group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="px-4 sm:px-6 pb-6 sm:pb-8 pt-3 sm:pt-4 text-center">
                <h3 className="text-base sm:text-lg md:text-xl font-serif mb-2 sm:mb-3">Support 24/7 yang Responsif</h3>
                <p className="text-[11px] sm:text-xs text-gray-600 leading-relaxed font-light">
                  Customer support yang selalu siap untuk menjawab semua pertanyaan atau masalah yang terjadi selama menggunakan platform untuk menjaga kenyamanan saat menggunakan aplikasi.
                </p>
              </div>
            </motion.div>

            {/* Card 4 - Fleksibel Tanpa Kontrak */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="group bg-canvas rounded-xl sm:rounded-2xl border border-black/[0.08] overflow-hidden hover:shadow-lg transition-all duration-300"
            >
              <div className="aspect-[4/3] sm:aspect-square relative p-4 sm:p-6">
                <Image
                  src="/images/nc.png"
                  alt="Fleksibel Tanpa Kontrak"
                  fill
                  className="object-contain transform group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="px-4 sm:px-6 pb-6 sm:pb-8 pt-3 sm:pt-4 text-center">
                <h3 className="text-base sm:text-lg md:text-xl font-serif mb-2 sm:mb-3">Fleksibel Tanpa Kontrak</h3>
                <p className="text-[11px] sm:text-xs text-gray-600 leading-relaxed font-light">
                  Brand bisa langsung berkomunikasi dan mengatur booking untuk membantu menjual produk mereka melalui platform SALDA dengan tujuan meningkatkan dan mempermudah kolaborasi antara brand dan host!
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
} 