"use client";

import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { ArrowRight, Star, Users, Shield, ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Iphone15Pro from "@/components/ui/iphone-15-pro";

interface UserData {
  first_name: string;
  profile_picture_url: string;
}

interface TutorialSlide {
  image: string;
  title: string;
  description: string;
  bullets: string[];
}

const tutorialSlides: TutorialSlide[] = [
  {
    image: "/images/tutor1.png",
    title: "Pilih & Verifikasi",
    description: "Pilih streamer yang sesuai dengan kebutuhan Anda. Lakukan verifikasi akun melalui Trollife untuk mendapatkan akses penuh ke platform kami.",
    bullets: [
      "Verifikasi cepat dan aman",
      "Pilihan streamer terverifikasi", 
      "Profil lengkap dan portofolio"
    ]
  },
  {
    image: "/images/tutorial2.png",
    title: "Pilih Paket & Jadwal",
    description: "Tentukan durasi streaming sesuai kebutuhan Anda. Tersedia pilihan paket per jam atau paket khusus dengan harga kompetitif.",
    bullets: [
      "Fleksibel sesuai kebutuhan",
      "Harga terjangkau",
      "Jadwal yang fleksibel"
    ]
  },
  {
    image: "/images/tutorial3.png", 
    title: "Mulai Streaming",
    description: "Setelah booking dikonfirmasi, streamer akan melakukan sesi live streaming sesuai jadwal. Nikmati layanan profesional dengan jaminan kualitas.",
    bullets: [
      "Platform terpercaya",
      "Streamer berkualitas",
      "Dukungan 24/7"
    ]
  },
  {
    image: "/images/tutorial4.png",
    title: "Analisis Performa",
    description: "Pantau performa streaming Anda melalui dashboard analitik yang komprehensif. Dapatkan insight mendalam tentang engagement penonton.",
    bullets: [
      "Analitik real-time",
      "Laporan detail",
      "Rekomendasi peningkatan"  
    ]
  },
  {
    image: "/images/tutorial5.png",
    title: "Kelola Pembayaran",
    description: "Kelola semua transaksi dengan mudah melalui sistem pembayaran yang terintegrasi. Lacak pendapatan dan pengeluaran dengan detail.",
    bullets: [
      "Pembayaran aman",
      "Sistem terintegrasi", 
      "Laporan keuangan"
    ]
  },
  {
    image: "/images/tutorial6.png",
    title: "Kembangkan Komunitas",
    description: "Bangun dan kembangkan komunitas Anda. Fitur interaktif memungkinkan Anda terhubung lebih dekat dengan penggemar.",
    bullets: [
      "Fitur komunitas",
      "Interaksi real-time",
      "Engagement tinggi"
    ]
  },
  {
    image: "/images/tutorial7.png",
    title: "Dukungan 24/7",
    description: "Tim dukungan kami siap membantu Anda 24/7. Dapatkan bantuan teknis dan konsultasi kapan pun Anda butuhkan.",
    bullets: [
      "Dukungan teknis",
      "Konsultasi pribadi",
      "Respons cepat"
    ]
  }
];

const IPhoneMockup = ({ imageSrc, altText, padding = "p-0" }: { imageSrc: string; altText: string; padding?: string }) => (
  <div className="relative mx-auto w-[300px] h-[600px]">
    <div className="absolute inset-0 bg-black rounded-[3rem] shadow-xl">
      <div className="absolute inset-[8px] bg-white rounded-[2.5rem] overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-7 bg-black z-10 rounded-b-3xl" />
        <div className={`relative w-full h-full ${padding}`}>
          <Image
            src={imageSrc}
            alt={altText}
            fill
            className="object-contain"
            priority
          />
        </div>
      </div>
    </div>
  </div>
);

const faqData = [
  {
    id: 1,
    question: "Apakah Salda cocok untuk saya?",
    answer: "Salda cocok untuk semua brand yang ingin meningkatkan penjualan melalui live streaming. Baik Anda baru memulai atau sudah berpengalaman, tim kami akan membantu Anda menemukan streamer yang sesuai dengan kebutuhan Anda."
  },
  {
    id: 2,
    question: "Apakah saya harus streaming setiap hari?", 
    answer: "Tidak, Anda bisa mengatur jadwal streaming sesuai kebutuhan. Kami menyediakan paket fleksibel yang bisa disesuaikan dengan target dan kemampuan Anda. Minimal streaming yang kami sarankan adalah 2 kali seminggu untuk hasil optimal."
  },
  {
    id: 3,
    question: "Berapa banyak interaksi yang diperlukan?",
    answer: "Tingkat interaksi bisa disesuaikan dengan gaya streaming Anda. Streamer kami terlatih untuk membangun engagement yang natural dengan audience, sehingga Anda bisa fokus pada penjualan produk."
  },
  {
    id: 4,
    question: "Tips menjadi streamer Salda yang baik?",
    answer: "Kunci menjadi streamer yang baik adalah konsistensi, interaktif dengan audience, dan memahami produk dengan baik. Kami menyediakan pelatihan dan panduan lengkap untuk membantu Anda berkembang sebagai streamer profesional."
  },
  {
    id: 5,
    question: "Berapa biaya layanan Salda?",
    answer: "Biaya layanan Salda bervariasi tergantung paket yang Anda pilih. Kami menawarkan paket mulai dari Rp500.000 per sesi. Setiap paket mencakup pendampingan, pelatihan, dan dukungan teknis penuh dari tim kami."
  }
];

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [openQuestion, setOpenQuestion] = useState<number | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const fetchUserData = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const { data } = await supabase
          .from("users")
          .select("first_name, profile_picture_url")
          .eq("id", user.id)
          .single();
        setUserData(data);
      }
    };

    fetchUserData();
  }, []);

  const content = (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-transparent">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Image
            src="/images/salda.png"
            alt="Salda Logo"
            width={90}
            height={90}
            className="brightness-0 invert"
          />
        </div>
      </nav>

      <main className="flex flex-col min-h-screen bg-white">
        {/* Hero Section */}
        <section className="min-h-screen flex items-end justify-center bg-gradient-to-bl from-red-800 via-red-500 to-white rounded-3xl mx-4 my-4 pt-16 md:pt-32">
          <div className="container mx-auto px-4 pb-0">
            <div className="flex flex-col items-center text-center max-w-5xl mx-auto">
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 text-white px-4 leading-tight">
                Temukan Streamer
                <br />
                Favoritmu di{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-200 to-white">
                  Salda
                </span>
              </h1>
              <p className="text-lg md:text-xl text-white mb-8 max-w-2xl px-4">
                Platform yang menghubungkan kamu dengan streamer terbaik untuk pengalaman live streaming yang lebih interaktif.
              </p>
              <div className="mb-8 w-full max-w-xl px-4">
                <button 
                  onClick={() => router.push('/sign-in')}
                  className="px-8 py-3 bg-red-600 text-white rounded-full hover:bg-red-700 transition-all hover:scale-105 shadow-[0_4px_8px_-2px_rgba(0,0,0,0.2)]"
                >
                  Mulai Sekarang
                </button>
              </div>
              <div className="relative w-full max-w-3xl">
                <Image
                  src="/images/18.png"
                  alt="Hero Image"
                  width={600}
                  height={400}
                  className="rounded-2xl w-full"
                  priority
                />
                <div className="absolute top-[55%] -translate-y-[55%] -left-4 bg-white/95 p-4 rounded-xl max-w-xs backdrop-blur-sm shadow-[0_4px_12px_-2px_rgba(0,0,0,0.12)] hidden md:block">
                  <p className="text-sm text-red-950">250+ Host Profesional Terverifikasi siap membantu</p>
                  <div className="flex items-center mt-2">
                    <div className="w-6 h-6 rounded-full bg-gray-200 mr-2"></div>
                    <span className="text-xs text-gray-700">Tim Salda Professional</span>
                  </div>
                </div>
                <div className="absolute top-[40%] -translate-y-[40%] right-4 bg-white/95 p-4 rounded-xl max-w-xs backdrop-blur-sm shadow-[0_4px_12px_-2px_rgba(0,0,0,0.12)] hidden md:block">
                  <p className="text-sm text-red-950">Tingkatkan penjualan hingga 10x lipat</p>
                  <div className="flex items-center mt-2">
                    <div className="w-6 h-6 rounded-full bg-gray-200 mr-2"></div>
                    <span className="text-xs text-gray-700">Salda Analytics</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section className="py-24 bg-white">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-[32px] font-semibold mb-4">
                Temukan Kemudahan Streaming dengan Salda
              </h2>
            </div>

            {/* Updated Image container */}
            <div className="max-w-6xl mx-auto mb-16">
              <Image
                src="/images/aboutSalda.png"
                alt="Salda Host Experience"
                width={1200}
                height={675}
                className="w-full"
                priority
              />
            </div>

            <div className="grid md:grid-cols-3 gap-12 max-w-6xl mx-auto">
              {/* Column 1 */}
              <div className="text-center md:text-left">
                <h3 className="text-xl font-semibold mb-4">
                  Bimbingan One-on-One dari Host Professional
                </h3>
                <p className="text-gray-600">
                  Kami akan mencocokkan Anda dengan host profesional di area Anda, yang akan membimbing Anda dari pertanyaan pertama hingga sesi streaming pertama Anda.
                </p>
              </div>

              {/* Column 2 */}
              <div className="text-center md:text-left">
                <h3 className="text-xl font-semibold mb-4">
                  Host Berpengalaman untuk Streaming Pertama Anda
                </h3>
                <p className="text-gray-600">
                  Untuk streaming pertama Anda, kami menyediakan host berpengalaman yang telah memiliki minimal tiga tahun pengalaman dan track record yang baik.
                </p>
              </div>

              {/* Column 3 */}
              <div className="text-center md:text-left">
                <h3 className="text-xl font-semibold mb-4">
                  Dukungan Khusus dari Salda
                </h3>
                <p className="text-gray-600">
                  Brand baru mendapatkan akses one-tap ke agen Dukungan Komunitas khusus yang dapat membantu dengan segala hal mulai dari masalah akun hingga dukungan teknis.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-24 bg-white">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl lg:text-4xl font-bold mb-4">
                Temukan Host Terbaik untuk
                <br />
                Live Streaming Anda
              </h2>
            </div>

            {/* Profile Images Grid */}
            <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-16">
              {/* Profile 1 */}
              <div className="text-center">
                <div className="aspect-square overflow-hidden rounded-xl mb-4">
                  <Image
                    src="/images/3.png"
                    alt="Angela"
                    width={400}
                    height={400}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="text-lg font-semibold">Angela</h3>
                <p className="text-gray-600">Host Professional, Jakarta</p>
              </div>

              {/* Profile 2 */}
              <div className="text-center">
                <div className="aspect-square overflow-hidden rounded-xl mb-4">
                  <Image
                    src="/images/1a.png"
                    alt="David"
                    width={400}
                    height={400}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="text-lg font-semibold">David</h3>
                <p className="text-gray-600">Senior Host, Surabaya</p>
              </div>

              {/* Profile 3 */}
              <div className="text-center">
                <div className="aspect-square overflow-hidden rounded-xl mb-4">
                  <Image
                    src="/images/2.png"
                    alt="Sarah"
                    width={400}
                    height={400}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="text-lg font-semibold">Sarah</h3>
                <p className="text-gray-600">Host Professional, Bandung</p>
              </div>
            </div>

            {/* Subtitle Text */}
            <div className="text-center max-w-3xl mx-auto">
              <p className="text-lg text-gray-600">
                Kami telah bermitra dengan ratusan host profesional di seluruh Indonesia. Host kami rata-rata menghasilkan
                <span className="font-semibold"> Rp50.000.000/bulan</span> dengan minimal
                <span className="font-semibold"> 20 sesi live streaming</span>.
              </p>
              <p className="text-sm text-gray-500 mt-4">
                *Pendapatan rata-rata berdasarkan data internal Salda periode Jan-Des 2023
              </p>
            </div>
          </div>
        </section>

        {/* Tutorial Salda Section */}
        <section className="py-24 bg-white overflow-hidden">
          <div className="container mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl lg:text-4xl font-bold mb-4">
                Butuh bantuan untuk mulai streaming?
                <br />
                Ikuti panduan Salda
              </h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                Kami telah bermitra dengan ratusan streamer profesional di seluruh Indonesia untuk membantu Anda memulai
              </p>
            </div>

            <div className="relative max-w-full mx-auto">
              {/* Left Mask */}
              <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-white to-transparent z-20" />
              
              {/* Right Mask */}
              <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-white to-transparent z-20" />

              {/* Carousel Container */}
              <div className="relative h-[600px] flex items-center justify-center px-0 mx-0">
                {tutorialSlides.map((_, index) => {
                  const slides = tutorialSlides.length;
                  let position = ((index - currentSlide) % slides + slides) % slides;
                  
                  if (position > slides / 2) position -= slides;
                  if (position < -slides / 2) position += slides;
                  
                  const isVisible = Math.abs(position) <= 2;
                  
                  // Adjust spacing for better distribution
                  const spacing = position > 0 ? 350 : 350; // Increased spacing further
                  
                  return isVisible && (
                    <div
                      key={index}
                      className={`absolute transition-all duration-500 ease-in-out transform-gpu`}
                      style={{
                        transform: `
                          translateX(${position * spacing}px)
                          scale(${position === 0 ? 0.9 : Math.max(0.5, 0.9 - Math.abs(position) * 0.2)}) 
                          perspective(1500px) 
                          rotateY(${position * 20}deg)
                        `,
                        zIndex: 20 - Math.abs(position),
                        opacity: position === 0 ? 1 : Math.max(0.5, 1 - Math.abs(position) * 0.3),
                        left: '50%',
                        marginLeft: '-100px',
                      }}
                    >
                      <div className="w-[200px]">
                        <Iphone15Pro
                          src={tutorialSlides[index].image} // Use the correct image from the slides array
                          width={346}
                          height={705}
                          className="transform scale-[0.55]"
                          style={{
                            objectFit: 'cover', // Changed from contain to cover
                            width: '100%',
                            height: '100%'
                          }}
                          mockupColor="black"
                          priority={true} // Add priority loading for images
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Update navigation buttons position to account for masks */}
              <button
                onClick={() => {
                  setCurrentSlide(prev => (prev - 1 + tutorialSlides.length) % tutorialSlides.length);
                }}
                className="absolute left-8 top-1/2 -translate-y-1/2 bg-white/80 p-2 rounded-full shadow-lg hover:bg-white transition-all z-30"
              >
                <ChevronLeft className="w-6 h-6 text-gray-800" />
              </button>
              <button
                onClick={() => {
                  setCurrentSlide(prev => (prev + 1) % tutorialSlides.length);
                }}
                className="absolute right-8 top-1/2 -translate-y-1/2 bg-white/80 p-2 rounded-full shadow-lg hover:bg-white transition-all z-30"
              >
                <ChevronRight className="w-6 h-6 text-gray-800" />
              </button>

              {/* Content below carousel remains the same */}
              <div className="text-center mt-12 max-w-xl mx-auto transition-all duration-500">
                {/* Title with Number */}
                <h3 className="text-2xl font-bold mb-4 flex items-center justify-center gap-3">
                  <span className="flex items-center justify-center w-8 h-8 bg-red-100 text-red-600 rounded-full text-lg">
                    {currentSlide + 1}
                  </span>
                  {tutorialSlides[currentSlide].title}
                </h3>
                
                {/* Description */}
                <p className="text-gray-600 text-sm leading-relaxed mb-6 text-center max-w-md mx-auto">
                  {tutorialSlides[currentSlide].description}
                </p>
                
                {/* Features - Horizontal Layout */}
                <div className="flex justify-center items-stretch">
                  {tutorialSlides[currentSlide].bullets.map((bullet, index) => (
                    <div key={index} className="flex items-center">
                      {/* Feature Item */}
                      <div className="px-4 max-w-[200px]">
                        <span className="text-sm text-gray-600 text-center">
                          {bullet}
                        </span>
                      </div>
                      
                      {/* Vertical Divider - Don't show after last item */}
                      {index < tutorialSlides[currentSlide].bullets.length - 1 && (
                        <div className="h-12 w-[1px] bg-gray-200" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Above CTA Section */}
        <section className="py-24 bg-white">
          <div className="container mx-auto px-4">
            {/* Top Content */}
            <div className="grid md:grid-cols-2 gap-12 max-w-6xl mx-auto mb-16">
              {/* Left Side - Title */}
              <div>
                <h2 className="text-3xl lg:text-4xl font-bold">
                  Pertanyaan Anda,
                  <br />
                  terjawab
                </h2>
              </div>

              {/* Right Side - Questions */}
              <div className="space-y-4">
                {faqData.map((faq) => (
                  <div key={faq.id} className="border-b border-gray-200 pb-4 transition-all duration-300 hover:bg-gray-50/50 rounded-lg">
                    <button 
                      onClick={() => setOpenQuestion(openQuestion === faq.id ? null : faq.id)}
                      className="flex items-center justify-between w-full text-left p-4 transition-colors duration-200"
                    >
                      <span className="text-lg font-medium transition-colors duration-200 hover:text-red-600">
                        {faq.question}
                      </span>
                      <svg 
                        className={`w-5 h-5 text-gray-500 transition-all duration-300 ${
                          openQuestion === faq.id ? 'transform rotate-180 text-red-600' : ''
                        }`} 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d="M19 9l-7 7-7-7" 
                        />
                      </svg>
                    </button>
                    <div 
                      className={`overflow-hidden transition-all duration-300 ${
                        openQuestion === faq.id ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                      }`}
                    >
                      <div className="p-4 text-gray-600 text-base">
                        {faq.answer}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Content - Image and Text */}
            <div className="max-w-6xl mx-auto">
              <div className="grid md:grid-cols-2 gap-12 items-center">
                {/* Left Side - Image */}
                <div>
                  <Image
                    src="/images/abovecta.png"
                    alt="Support Team"
                    width={600}
                    height={400}
                    className="w-full rounded-2xl"
                  />
                </div>

                {/* Right Side - Centered Text */}
                <div className="text-center">
                  <h3 className="text-2xl font-bold mb-2">Masih ada pertanyaan?</h3>
                  <p className="text-gray-600 mb-6">
                    Dapatkan jawaban dari streamer berpengalaman di dekat Anda.
                  </p>
                  <button className="px-6 py-2 border border-gray-300 rounded-full 
                    transition-all duration-300 
                    hover:bg-gray-50 hover:scale-105 hover:shadow-md 
                    active:scale-95">
                    Hubungi Streamer
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 bg-gradient-to-br from-blue-900 to-blue-800 relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('/images/pattern.png')] opacity-10" />
          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-3xl mx-auto text-center text-white">
              <h2 className="text-4xl font-bold mb-6">
                Siap Untuk Memulai Pengalaman Streaming Terbaik?
              </h2>
              <p className="text-xl text-gray-200 mb-10">
                Bergabung dengan Salda sekarang dan nikmati pengalaman live streaming yang lebih interaktif
              </p>
              <Button 
                size="lg"
                className="bg-red-500 hover:bg-red-600 text-white px-12 h-12 rounded-full"
                onClick={() => router.push('/sign-in')}
              >
                Mulai Sekarang
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        </section>
      </main>
    </>
  );

  return content;
}
