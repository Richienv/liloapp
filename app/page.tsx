"use client";

import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { User } from "@supabase/supabase-js";
import { useEffect, useState, useRef } from "react";
import { ArrowRight, Star, Users, Shield, ChevronLeft, ChevronRight, ChevronDown, Check, X, TrendingUp, LucideIcon } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { HeroBackground } from "@/components/hero-background";
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

interface UserData {
  first_name: string;
  profile_picture_url: string;
}

interface TutorialSlide {
  image?: string;
  video?: string;
  title: string;
  description: string;
  bullets: string[];
}

interface ComparisonItem {
  id: string;
  feature: string;
  description?: string;
  salda: boolean;
  competitors: boolean;
}

interface TiltCardStats {
  viewers: string | number;
  rating: string | number;
  sales: string | number;
}

interface TiltCardProps {
  image: string;
  name: string;
  title: string;
  stats: TiltCardStats;
}

const tutorialSlides: TutorialSlide[] = [
  {
    image: "/images/saldatutor1.png",
    title: "Pilih & Verifikasi",
    description: "Pilih streamer yang sesuai dengan kebutuhan Anda. Lakukan verifikasi akun melalui Trollife untuk mendapatkan akses penuh ke platform kami.",
    bullets: [
      "Verifikasi cepat dan aman",
      "Pilihan streamer terverifikasi", 
      "Profil lengkap dan portofolio"
    ]
  },
  {
    image: "/images/saldatutor2.png",
    title: "Pilih Paket & Jadwal",
    description: "Tentukan durasi streaming sesuai kebutuhan Anda. Tersedia pilihan paket per jam atau paket khusus dengan harga kompetitif.",
    bullets: [
      "Fleksibel sesuai kebutuhan",
      "Harga terjangkau",
      "Jadwal yang fleksibel"
    ]
  },
  {
    image: "/images/saldatutor3.png",
    title: "Lakukan Pembayaran ",
    description: "Pembayaran dapat dilakukan melalui QRIS, Gopay, dan BCA Virtual Account.",
    bullets: [
      "Pembayaran aman",
      "Pilihan pembayaran",
    ]
  },
  {
    image: "/images/saldatutor4.png",
    title: "Tunggu Streamer Acc Boookingan Kamu",
    description: "Streamer akan melakukan konfirmasi booking terlebih dahulu sebelum melakukan streaming.",
    bullets: [
      "Konfirmasi booking",  
    ]
  },
  {
    image: "/images/saldatutor5.png",
    title: "Setelah Booking Dikonfirmasi, Jadwal Akan Masuk di Jadwal Streaming",
    description: "Lihat jadwal streaming kamu di dashboard.",
    bullets: [
      "Konfirmasi booking",
    ]
  },
  {
    image: "/images/saldatutor6.png",
    title: "Saat Waktunya Tiba, Streaming Akan Dimulai",
    description: "Streamer akan melakukan streaming sesuai jadwal yang sudah diset di dashboard.",
    bullets: [
      "Streaming dimulai",
    ]
  },
  {
    video: "/images/docn.mp4",
    title: "Produk Kamu akan dijual melalui live streaming",
    description: "Streamer akan membagikan link produk kamu melalui live streaming.",
    bullets: [
      "Produk dijual",
    ]
  }
];

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

const comparisonData: ComparisonItem[] = [
  {
    id: 'verification',
    feature: 'Verifikasi Identitas Streamer',
    description: 'Sistem verifikasi komprehensif kami memeriksa detail seperti nama, alamat, ID, dan dokumen lainnya untuk memastikan identitas streamer.',
    salda: true,
    competitors: true
  },
  {
    id: 'screening',
    feature: 'Penyaringan Streamer',
    description: 'Teknologi kami menganalisis ratusan faktor untuk setiap streamer dan memblokir akun yang berisiko tinggi.',
    salda: true,
    competitors: false
  },
  {
    id: 'protection',
    feature: 'Perlindungan Rp50 Juta',
    description: 'Salda memberikan perlindungan hingga Rp50 juta untuk setiap transaksi yang dilakukan melalui platform kami.',
    salda: true,
    competitors: false
  },
  {
    id: 'quality',
    feature: 'Jaminan Kualitas',
    salda: true,
    competitors: false
  },
  {
    id: 'support',
    feature: 'Dukungan 24/7',
    salda: true,
    competitors: false
  },
  {
    id: 'analytics',
    feature: 'Analitik Real-time',
    salda: true,
    competitors: false
  },
  {
    id: 'insurance',
    feature: 'Asuransi Platform',
    description: 'Anda dilindungi dalam kasus yang jarang terjadi di mana streamer atau penonton mengalami masalah selama sesi streaming.',
    salda: true,
    competitors: true
  }
];

// Add this custom hook for the tilt effect
function useTilt(initial = 0) {
  const ref = useRef<HTMLDivElement>(null);
  
  const x = useMotionValue(initial);
  const y = useMotionValue(initial);
  
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], ["17.5deg", "-17.5deg"]));
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], ["-17.5deg", "17.5deg"]));

  const handleMouse = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    
    const width = rect.width;
    const height = rect.height;
    
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    
    x.set(xPct);
    y.set(yPct);
  };

  return { ref, rotateX, rotateY, handleMouse };
}

// Update the Navbar component to accept router as a prop
const Navbar = ({ router }: { router: any }) => (
  <nav className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md z-50 border-b border-gray-100">
    <div className="container mx-auto px-4">
      <div className="flex items-center justify-between h-16 md:h-20">
        {/* Logo */}
        <div className="flex items-center">
          <Image
            src="/images/salda-logoB.png"
            alt="Salda"
            width={120}
            height={40}
            className="h-8 w-auto"
          />
        </div>

        {/* Navigation Links - Hidden on mobile */}
        <div className="hidden md:flex items-center space-x-8">
          <a href="#about-section" className="text-gray-600 hover:text-gray-900 text-sm font-medium">
            About
          </a>
          <a href="#features" className="text-gray-600 hover:text-gray-900 text-sm font-medium">
            Features
          </a>
          <a href="#pricing" className="text-gray-600 hover:text-gray-900 text-sm font-medium">
            Pricing
          </a>
          <a href="#contact" className="text-gray-600 hover:text-gray-900 text-sm font-medium">
            Contact
          </a>
        </div>

        {/* Auth Buttons */}
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/sign-in')}
            className="hidden md:block text-gray-600 hover:text-gray-900 text-sm font-medium"
          >
            Sign In
          </button>
          <button 
            onClick={() => router.push('/sign-up')}
            className="bg-gray-900 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  </nav>
);

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

  return (
    <>
      <main className="flex flex-col min-h-screen bg-white w-full">
        {/* Pass router to Navbar */}
        <Navbar router={router} />

        {/* Hero Section - Updated */}
        <section className="relative min-h-screen bg-white pt-20"> {/* Added pt-20 for navbar spacing */}
          {/* Top announcement banner - Adjusted positioning */}
          <div className="absolute top-24 md:top-28 left-1/2 -translate-x-1/2 z-20 w-[90%] md:w-auto">
            <div className="bg-gray-100 rounded-full py-1.5 px-4 flex items-center gap-2 justify-center">
              <div className="w-2 h-2 bg-gray-900 rounded-full animate-pulse" />
              <span className="text-xs md:text-sm text-gray-600">Rata-rata penjualan meningkat 300%</span>
            </div>
          </div>

          {/* Main hero content - Updated colors */}
          <div className="container mx-auto px-4 pt-24 md:pt-32">
            <div className="max-w-[1200px] mx-auto">
              {/* Text content */}
              <div className="text-center mb-12 md:mb-20">
                <h1 className="text-4xl md:text-[64px] leading-[1.1] tracking-[-0.02em] font-medium mb-4 md:mb-6">
                  <span className="text-gray-900">Tingkatkan Penjualan Anda</span>
                  <br />
                  <span className="text-gray-900 font-serif text-[40px] md:text-[48px]">Dengan Host Shopee/Tiktok Live Professional</span>
                </h1>
                <p className="text-gray-600 text-base md:text-lg max-w-2xl mx-auto mb-6 md:mb-8 px-4">
                  Platform yang membantu UMKM meningkatkan penjualan melalui live streaming bersama host profesional.
                </p>
                <div className="flex flex-col md:flex-row items-center justify-center gap-3 md:gap-4">
                  <button 
                    onClick={() => router.push('/sign-in')}
                    className="w-full md:w-auto bg-gray-900 text-white px-6 py-3 rounded-full hover:bg-gray-800 transition-all"
                  >
                    Mulai Tingkatkan Penjualan
                  </button>
                  <button 
                    className="w-full md:w-auto bg-gray-100 text-gray-900 px-6 py-3 rounded-full hover:bg-gray-200 transition-all"
                  >
                    Lihat Kisah Sukses
                  </button>
                </div>
              </div>

              {/* Bento Grid Layout - Full Width */}
              <div className="relative mt-8 md:mt-16 w-full max-w-[2000px] mx-auto">
                <div className="grid grid-cols-12 gap-4 md:gap-8 px-4 md:px-12">
                  {/* Left Column */}
                  <div className="col-span-12 md:col-span-4 space-y-6">
                    {/* Image Card */}
                    <motion.div 
                      className="relative z-30"
                      initial={{ rotateX: 10, rotateY: -15 }}
                      animate={{ rotateX: 10, rotateY: -15 }}
                      style={{ 
                        transformStyle: "preserve-3d",
                        backfaceVisibility: "hidden",
                        WebkitBackfaceVisibility: "hidden",
                        perspective: "1000px",
                        willChange: "transform",
                      }}
                    >
                      <div 
                        className="relative h-[400px] rounded-2xl overflow-hidden"
                        style={{
                          transform: "translate3d(0, 0, 0)",
                          WebkitTransform: "translate3d(0, 0, 0)",
                        }}
                      >
                        <Image
                          src="/images/16.png"
                          alt="Success Story"
                          fill
                          className="object-cover select-none"
                          priority
                          quality={100}
                          style={{ 
                            backfaceVisibility: "hidden",
                            WebkitBackfaceVisibility: "hidden",
                            transform: "translate3d(0, 0, 0)",
                            WebkitTransform: "translate3d(0, 0, 0)",
                          }}
                          sizes="(max-width: 768px) 100vw, 33vw"
                        />
                      </div>
                    </motion.div>

                    {/* Testimonial Card */}
                    <motion.div
                      className="relative z-20"
                      initial={{ rotateX: 10, rotateY: -10 }}
                      animate={{ rotateX: 10, rotateY: -10 }}
                      style={{ 
                        transformStyle: "preserve-3d",
                        backfaceVisibility: "hidden",
                        WebkitBackfaceVisibility: "hidden",
                        perspective: "1000px",
                        willChange: "transform",
                      }}
                    >
                      <div 
                        className="bg-white rounded-2xl p-8 border border-sky-100/50"
                        style={{
                          transform: "translate3d(0, 0, 0)",
                          WebkitTransform: "translate3d(0, 0, 0)",
                        }}
                      >
                        <div style={{ transform: "translateZ(40px)" }}>
                          <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center">
                              <Users className="w-6 h-6 text-sky-600" />
                            </div>
                            <div>
                              <h4 className="font-medium text-gray-900">Toko Bunga Mawar</h4>
                              <p className="text-sm text-gray-500">Jakarta Selatan</p>
                            </div>
                          </div>
                          <p className="text-gray-600 mb-4">
                            "Penjualan kami meningkat 350% dalam 2 minggu pertama menggunakan platform ini. 
                            Sangat membantu UMKM seperti kami."
                          </p>
                          <div className="flex justify-between items-center">
                            <div className="flex gap-1">
                              {[...Array(5)].map((_, i) => (
                                <Star key={i} className="w-4 h-4 fill-sky-500 text-sky-500" />
                              ))}
                            </div>
                            <p className="text-sm text-gray-500">2 minggu yang lalu</p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </div>

                  {/* Center Column */}
                  <div className="col-span-12 md:col-span-4 space-y-6">
                    {/* Testimonial Card */}
                    <motion.div
                      className="relative z-20"
                      initial={{ rotateX: 10, rotateY: -10 }}
                      animate={{ rotateX: 10, rotateY: -10 }}
                      style={{ 
                        transformStyle: "preserve-3d",
                        backfaceVisibility: "hidden",
                        WebkitBackfaceVisibility: "hidden",
                        perspective: "1000px",
                        willChange: "transform",
                      }}
                    >
                      <div 
                        className="bg-white rounded-2xl p-8 border border-sky-100/50"
                        style={{
                          transform: "translate3d(0, 0, 0)",
                          WebkitTransform: "translate3d(0, 0, 0)",
                        }}
                      >
                        <div style={{ transform: "translateZ(40px)" }}>
                          <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center">
                              <Users className="w-6 h-6 text-sky-600" />
                            </div>
                            <div>
                              <h4 className="font-medium text-gray-900">Warung Kopi Kenangan</h4>
                              <p className="text-sm text-gray-500">Bandung</p>
                            </div>
                          </div>
                          <p className="text-gray-600 mb-4">
                            "Platform yang sangat profesional. Tim support sangat membantu dalam 
                            proses onboarding sampai eksekusi live streaming."
                          </p>
                          <div className="flex justify-between items-center">
                            <div className="flex gap-1">
                              {[...Array(5)].map((_, i) => (
                                <Star key={i} className="w-4 h-4 fill-sky-500 text-sky-500" />
                              ))}
                            </div>
                            <p className="text-sm text-gray-500">1 minggu yang lalu</p>
                          </div>
                        </div>
                      </div>
                    </motion.div>

                    {/* Image Card */}
                    <motion.div 
                      className="relative z-30"
                      initial={{ rotateX: 10, rotateY: -15 }}
                      animate={{ rotateX: 10, rotateY: -15 }}
                      style={{ 
                        transformStyle: "preserve-3d",
                        backfaceVisibility: "hidden",
                        WebkitBackfaceVisibility: "hidden",
                        perspective: "1000px",
                        willChange: "transform",
                      }}
                    >
                      <div 
                        className="relative h-[400px] rounded-2xl overflow-hidden"
                        style={{
                          transform: "translate3d(0, 0, 0)",
                          WebkitTransform: "translate3d(0, 0, 0)",
                        }}
                      >
                        <Image
                          src="/images/17.png"
                          alt="Success Story"
                          fill
                          className="object-cover select-none"
                          priority
                          quality={100}
                          style={{ 
                            backfaceVisibility: "hidden",
                            WebkitBackfaceVisibility: "hidden",
                            transform: "translate3d(0, 0, 0)",
                            WebkitTransform: "translate3d(0, 0, 0)",
                          }}
                          sizes="(max-width: 768px) 100vw, 33vw"
                        />
                      </div>
                    </motion.div>
                  </div>

                  {/* Right Column */}
                  <div className="col-span-12 md:col-span-4 space-y-6">
                    {/* Image Card */}
                    <motion.div 
                      className="relative z-30"
                      initial={{ rotateX: 10, rotateY: -15 }}
                      animate={{ rotateX: 10, rotateY: -15 }}
                      style={{ 
                        transformStyle: "preserve-3d",
                        backfaceVisibility: "hidden",
                        WebkitBackfaceVisibility: "hidden",
                        perspective: "1000px",
                        willChange: "transform",
                      }}
                    >
                      <div 
                        className="relative h-[400px] rounded-2xl overflow-hidden"
                        style={{
                          transform: "translate3d(0, 0, 0)",
                          WebkitTransform: "translate3d(0, 0, 0)",
                        }}
                      >
                        <Image
                          src="/images/18.png"
                          alt="Success Story"
                          fill
                          className="object-cover select-none"
                          priority
                          quality={100}
                          style={{ 
                            backfaceVisibility: "hidden",
                            WebkitBackfaceVisibility: "hidden",
                            transform: "translate3d(0, 0, 0)",
                            WebkitTransform: "translate3d(0, 0, 0)",
                          }}
                          sizes="(max-width: 768px) 100vw, 33vw"
                        />
                      </div>
                    </motion.div>

                    {/* Testimonial Card */}
                    <motion.div
                      className="relative z-20"
                      initial={{ rotateX: 10, rotateY: -10 }}
                      animate={{ rotateX: 10, rotateY: -10 }}
                      style={{ 
                        transformStyle: "preserve-3d",
                        backfaceVisibility: "hidden",
                        WebkitBackfaceVisibility: "hidden",
                        perspective: "1000px",
                        willChange: "transform",
                      }}
                    >
                      <div 
                        className="bg-white rounded-2xl p-8 border border-sky-100/50"
                        style={{
                          transform: "translate3d(0, 0, 0)",
                          WebkitTransform: "translate3d(0, 0, 0)",
                        }}
                      >
                        <div style={{ transform: "translateZ(40px)" }}>
                          <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center">
                              <Users className="w-6 h-6 text-sky-600" />
                            </div>
                            <div>
                              <h4 className="font-medium text-gray-900">Toko Elektronik Jaya</h4>
                              <p className="text-sm text-gray-500">Surabaya</p>
                            </div>
                          </div>
                          <p className="text-gray-600 mb-4">
                            "ROI yang kami dapatkan sangat luar biasa. Dalam sebulan, 
                            omset meningkat hingga 300%."
                          </p>
                          <div className="flex justify-between items-center">
                            <div className="flex gap-1">
                              {[...Array(5)].map((_, i) => (
                                <Star key={i} className="w-4 h-4 fill-sky-500 text-sky-500" />
                              ))}
                            </div>
                            <p className="text-sm text-gray-500">3 hari yang lalu</p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section id="about-section" className="py-24 bg-white relative overflow-hidden">
          {/* Background Image */}
          <div className="absolute inset-0">
            <Image
              src="/images/bg-about.png"
              alt="Background"
              fill
              className="object-cover opacity-5"
              priority
            />
          </div>
          
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-white via-transparent to-white opacity-80" />
          
          <div className="container mx-auto px-4 relative">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif font-medium mb-4 sm:mb-6 leading-tight">
                Temukan Kemudahan
                <br />
                <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-transparent bg-clip-text italic">
                  Streaming dengan Salda
                </span>
              </h2>
              <p className="text-sm sm:text-base md:text-lg text-gray-600 leading-relaxed">
                Platform streaming yang dirancang untuk memberikan pengalaman terbaik bagi host dan penonton
              </p>
            </div>

            {/* Updated Image container - more subtle */}
            <div className="max-w-6xl mx-auto mb-16">
              <div className="relative rounded-2xl overflow-hidden bg-white">
                <Image
                  src="/images/aboutSalda.png"
                  alt="Salda Host Experience"
                  width={1200}
                  height={675}
                  className="w-full"
                  priority
                />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6 sm:gap-12 max-w-6xl mx-auto">
              {/* Feature 1 */}
              <div className="relative p-4 sm:p-6 rounded-2xl bg-white/80 backdrop-blur-sm">
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">
                    Bimbingan One-on-One dari Host Professional
                  </h3>
                  <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                    Kami akan mencocokkan Anda dengan host profesional di area Anda, yang akan membimbing Anda dari pertanyaan pertama hingga sesi streaming pertama Anda.
                  </p>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="relative p-4 sm:p-6 rounded-2xl bg-white/80 backdrop-blur-sm">
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
                    <Star className="w-6 h-6 text-indigo-600" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">
                    Host Berpengalaman untuk Streaming Pertama
                  </h3>
                  <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                    Untuk streaming pertama Anda, kami menyediakan host berpengalaman yang telah memiliki minimal tiga tahun pengalaman dan track record yang baik.
                  </p>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="relative p-4 sm:p-6 rounded-2xl bg-white/80 backdrop-blur-sm">
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center mb-4">
                    <Shield className="w-6 h-6 text-purple-600" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">
                    Dukungan Khusus dari Salda
                  </h3>
                  <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                    Brand baru mendapatkan akses one-tap ke agen Dukungan Komunitas khusus yang dapat membantu dengan segala hal mulai dari masalah akun hingga dukungan teknis.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Content Section - Updated with new colors and styling */}
        <section className="py-24 bg-white relative overflow-hidden">
          {/* Background decoration - Updated gradient */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-blue-50/50 via-white to-white opacity-70" />
          
          <div className="container mx-auto px-4 relative">
            <div className="text-center max-w-3xl mx-auto mb-20">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif font-medium mb-4 sm:mb-6 leading-tight">
                Temukan Host Terbaik untuk
                <br />
                <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-transparent bg-clip-text italic">
                  Live Streaming Anda
                </span>
              </h2>
              <p className="text-sm sm:text-base md:text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
                Ikuti panduan
                <span className="text-blue-600 font-serif italic"> Salda </span>
                dan mulai perjalanan streaming Anda dengan percaya diri
              </p>
            </div>

            {/* Profile Images Grid - Updated styling */}
            <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-16">
              {/* Profile 1 */}
              <div className="group relative">
                <div className="aspect-square overflow-hidden rounded-2xl mb-4 bg-gradient-to-br from-blue-100 to-indigo-50 p-1">
                  <div className="relative h-full w-full overflow-hidden rounded-xl">
                    <Image
                      src="/images/people2.png"
                      alt="Angela"
                      width={400}
                      height={400}
                      className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-indigo-900/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                </div>
                <div className="text-center transform group-hover:translate-y-[-8px] transition-transform duration-300">
                  <h3 className="text-xl font-semibold mb-1 group-hover:text-indigo-600 transition-colors">Angela</h3>
                  <p className="text-gray-600">Host Professional, Jakarta</p>
                </div>
              </div>

              {/* Profile 2 - Copy same structure for other profiles */}
              <div className="group relative">
                <div className="aspect-square overflow-hidden rounded-2xl mb-4 bg-gradient-to-br from-red-100 to-red-50 p-1">
                  <div className="relative h-full w-full overflow-hidden rounded-xl">
                    <Image
                      src="/images/people1.png"
                      alt="David"
                      width={400}
                      height={400}
                      className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                </div>
                <div className="text-center transform group-hover:translate-y-[-8px] transition-transform duration-300">
                  <h3 className="text-xl font-semibold mb-1">David</h3>
                  <p className="text-gray-600">Senior Host, Surabaya</p>
                </div>
              </div>

              {/* Profile 3 */}
              <div className="group relative">
                <div className="aspect-square overflow-hidden rounded-2xl mb-4 bg-gradient-to-br from-red-100 to-red-50 p-1">
                  <div className="relative h-full w-full overflow-hidden rounded-xl">
                    <Image
                      src="/images/1people.png"
                      alt="Sarah"
                      width={400}
                      height={400}
                      className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                </div>
                <div className="text-center transform group-hover:translate-y-[-8px] transition-transform duration-300">
                  <h3 className="text-xl font-semibold mb-1">Sarah</h3>
                  <p className="text-gray-600">Host Professional, Bandung</p>
                </div>
              </div>
            </div>

            {/* Subtitle Text */}
            <div className="text-center max-w-3xl mx-auto">
              <p className="text-sm sm:text-base md:text-lg text-gray-600">
                Kami telah bermitra dengan ratusan host profesional di seluruh Indonesia. Host kami rata-rata menghasilkan
                <span className="font-semibold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-transparent bg-clip-text"> Rp50.000.000/bulan</span> dengan minimal
                <span className="font-semibold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-transparent bg-clip-text"> 20 sesi live streaming</span>.
              </p>
              <p className="text-xs sm:text-sm text-gray-500 mt-4 italic">
                *Pendapatan rata-rata berdasarkan data internal Salda periode Jan-Des 2023
              </p>
            </div>
          </div>
        </section>

        {/* Tutorial Salda Section */}
        <section className="py-24 bg-white overflow-hidden relative">
          {/* Background decoration - changed from red to blue */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_var(--tw-gradient-stops))] from-blue-50 via-white to-white opacity-40" />
          
          <div className="container mx-auto">
            <div className="text-center mb-16 relative">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif font-medium mb-4 sm:mb-6 leading-tight">
                Butuh bantuan untuk
                <br />
                <span className="relative inline-block">
                  mulai streaming?
                  {/* Changed underline from red to blue */}
                  <div className="absolute -bottom-2 left-0 right-0 h-1 bg-blue-200 transform -rotate-1"></div>
                </span>
              </h2>
              <p className="text-sm sm:text-base md:text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
                Ikuti panduan
                <span className="text-blue-600 font-serif italic"> Salda </span>
                dan mulai perjalanan streaming Anda dengan percaya diri
              </p>
            </div>

            <div className="relative max-w-[1200px] mx-auto overflow-hidden">
              {/* Left Mask - Adjusted opacity and width */}
              <div className="absolute left-0 top-0 bottom-0 w-80 bg-gradient-to-r from-white via-white to-transparent z-30" />
              
              {/* Right Mask - Adjusted opacity and width */}
              <div className="absolute right-0 top-0 bottom-0 w-80 bg-gradient-to-l from-white via-white to-transparent z-30" />

              {/* Carousel Container - Increased height */}
              <div className="relative h-[600px] flex items-center justify-center mb-12">
                {tutorialSlides.map((_, index) => {
                  const slides = tutorialSlides.length;
                  let position = ((index - currentSlide) % slides + slides) % slides;
                  
                  // Ensure position is within reasonable range for smooth animation
                  if (position > slides / 2) position -= slides;
                  if (position < -slides / 2) position += slides;
                  
                  // Show more slides for smoother animation
                  const isVisible = Math.abs(position) <= 2;
                  
                  const spacing = 380;
                  
                  return isVisible && (
                    <div
                      key={index}
                      className="absolute transition-all duration-700 ease-in-out transform-gpu"
                      style={{
                        transform: `
                          translateX(${position * spacing}px)
                          scale(${position === 0 ? 1 : Math.max(0.65, 0.8 - Math.abs(position) * 0.15)})
                          perspective(1000px) 
                          rotateY(${position * 12}deg)
                        `,
                        zIndex: 20 - Math.abs(position),
                        opacity: position === 0 ? 1 : Math.max(0.2, 0.5 - Math.abs(position) * 0.3),
                        left: '50%',
                        marginLeft: '-160px',
                        // Use CSS transform for smoother animation
                        transition: 'all 0.7s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
                        willChange: 'transform, opacity', // Optimize performance
                        pointerEvents: position === 0 ? 'auto' : 'none',
                      }}
                    >
                      {tutorialSlides[index].video ? (
                        <div className="w-[320px] rounded-xl overflow-hidden shadow-lg">
                          <div className="relative h-full w-full overflow-hidden rounded-xl">
                            <video
                              autoPlay
                              loop
                              muted
                              playsInline
                              className="w-full h-[480px] object-cover"
                            >
                              <source src={tutorialSlides[index].video} type="video/mp4" />
                            </video>
                          </div>
                        </div>
                      ) : tutorialSlides[index].image ? (
                        <Image
                          src={tutorialSlides[index].image!}
                          alt={tutorialSlides[index].title}
                          width={320}
                          height={180}
                          className="w-full h-full object-cover"
                          priority={true}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {/* Navigation buttons - Adjusted positioning */}
              <button
                onClick={() => {
                  setCurrentSlide(prev => (prev - 1 + tutorialSlides.length) % tutorialSlides.length);
                }}
                className="absolute left-20 top-1/2 -translate-y-1/2 bg-white/80 p-2 rounded-full shadow-lg hover:bg-white transition-all z-40"
              >
                <ChevronLeft className="w-6 h-6 text-gray-800" />
              </button>
              <button
                onClick={() => {
                  setCurrentSlide(prev => (prev + 1) % tutorialSlides.length);
                }}
                className="absolute right-20 top-1/2 -translate-y-1/2 bg-white/80 p-2 rounded-full shadow-lg hover:bg-white transition-all z-40"
              >
                <ChevronRight className="w-6 h-6 text-gray-800" />
              </button>

              {/* Content below carousel - Changed number background from red to blue */}
              <div className="text-center mt-20 max-w-xl mx-auto transition-all duration-500">
                {/* Title with Number - Changed colors */}
                <h3 className="text-2xl font-bold mb-4 flex items-center justify-center gap-3">
                  <span className="flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-600 rounded-full text-lg">
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

        {/* Comparison Table Section */}
        <section className="py-24 bg-white w-full">
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              {/* Header with enhanced styling */}
              <div className="flex flex-col items-center justify-center gap-6 mb-16">
                <div className="flex items-center justify-center gap-3 px-6 py-3 bg-blue-50/50 rounded-full">
                  <Image
                    src="/images/salda-logoB.png"
                    alt="Salda"
                    width={150}
                    height={40}
                    className="h-8 w-auto"
                  />
                  <span className="text-xl text-gray-600">untuk Streamer</span>
                </div>

                <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif text-center">
                  Streaming dengan perlindungan
                  <br />
                  <span className="relative">
                    <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-transparent bg-clip-text">
                      menyeluruh
                    </span>
                    <div className="absolute -bottom-2 left-0 right-0 h-1 bg-gradient-to-r from-blue-600/20 via-indigo-600/20 to-purple-600/20"></div>
                  </span>
                </h2>
              </div>

              {/* Enhanced Comparison Table */}
              <div className="bg-white rounded-3xl shadow-2xl shadow-blue-100/50 border border-gray-100">
                {/* Table Header */}
                <div className="grid grid-cols-3 bg-gradient-to-r from-gray-50 via-white to-gray-50 p-4 sm:p-8 border-b rounded-t-3xl">
                  <div className="col-span-1 font-medium text-gray-900 text-sm sm:text-lg">Fitur</div>
                  <div className="text-center">
                    <div className="font-medium text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 text-sm sm:text-lg">
                      Salda
                    </div>
                  </div>
                  <div className="text-center font-medium text-gray-500 text-sm sm:text-lg">Kompetitor</div>
                </div>

                {/* Table Body */}
                <div className="divide-y divide-gray-100">
                  {comparisonData.map((item) => (
                    <div 
                      key={item.id} 
                      className="grid grid-cols-3 p-4 sm:p-8 hover:bg-blue-50/5 transition-all duration-300 group"
                    >
                      <div className="col-span-1 pr-4 sm:pr-8">
                        <h3 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors text-xs sm:text-base">
                          {item.feature}
                        </h3>
                        {item.description && (
                          <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-gray-500 leading-relaxed hidden sm:block">
                            {item.description}
                          </p>
                        )}
                      </div>
                      <div className="flex justify-center items-center">
                        {item.salda ? (
                          <div className="h-8 w-8 rounded-full bg-gradient-to-r from-blue-100 to-indigo-100 flex items-center justify-center transform group-hover:scale-110 transition-all duration-300 shadow-lg shadow-blue-100/50">
                            <Check className="h-5 w-5 text-blue-600" />
                          </div>
                        ) : (
                          <X className="h-8 w-8 text-gray-300 transform group-hover:scale-110 transition-all duration-300" />
                        )}
                      </div>
                      <div className="flex justify-center items-center">
                        {item.competitors ? (
                          <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center transform group-hover:scale-110 transition-all duration-300">
                            <Check className="h-5 w-5 text-gray-600" />
                          </div>
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-gray-50 flex items-center justify-center transform group-hover:scale-110 transition-all duration-300">
                            <X className="h-5 w-5 text-gray-300" />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Enhanced Bottom Text */}
              <div className="mt-8 text-center">
                <p className="text-sm text-gray-500 bg-gray-50 inline-block px-4 py-2 rounded-full">
                  *Berdasarkan perbandingan fitur dengan platform streaming lainnya per Januari 2024
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-24 bg-white relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-red-50 via-white to-white opacity-40" />
          
          <div className="container mx-auto px-4 relative">
            {/* Top Content */}
            <div className="grid md:grid-cols-2 gap-12 max-w-6xl mx-auto mb-16">
              {/* Left Side - Title */}
              <div>
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif font-medium leading-tight">
                  Pertanyaan Anda,
                  <br />
                  <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-transparent bg-clip-text italic">terjawab</span>
                </h2>
              </div>

              {/* Right Side - Questions */}
              <div className="space-y-6">
                {faqData.map((faq) => (
                  <div 
                    key={faq.id} 
                    className="group relative bg-white rounded-2xl transition-all duration-300 hover:shadow-lg"
                  >
                    <button 
                      onClick={() => setOpenQuestion(openQuestion === faq.id ? null : faq.id)}
                      className="w-full text-left p-4 sm:p-6 flex items-start justify-between gap-3 sm:gap-4"
                    >
                      <span className="text-base sm:text-lg font-medium text-gray-900 group-hover:text-red-500">
                        {faq.question}
                      </span>
                      <span className={`transform transition-transform duration-300 ${
                        openQuestion === faq.id ? 'rotate-180' : ''
                      }`}>
                        <ChevronDown className="w-5 h-5 text-gray-500 group-hover:text-red-500" />
                      </span>
                    </button>
                    <div className={`overflow-hidden transition-all duration-300 ${
                      openQuestion === faq.id ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                    }`}>
                      <p className="px-4 sm:px-6 pb-4 sm:pb-6 text-sm sm:text-base text-gray-600 leading-relaxed">
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div> 
          </div>
        </section>

        {/* Final Section - Masih Ada Pertanyaan */}
        <section className="relative py-32 overflow-hidden">
          {/* Background Image - Adjusted fit */}
          <div className="absolute inset-0 scale-110"> {/* Added scale for slight zoom */}
            <Image
              src="/images/abovecta.png"
              alt="Background"
              fill
              className="object-cover blur-[2px]" // Added slight blur for depth
              priority
            />
            {/* Enhanced Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/95 via-white/85 to-white/95 backdrop-blur-[2px]" />
          </div>

          {/* Linear Line Decoration */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[800px]">
            <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
          </div>

          {/* Content */}
          <div className="container mx-auto px-4 relative">
            <div className="max-w-2xl mx-auto text-center">
              <div className="bg-white/40 backdrop-blur-md rounded-3xl p-6 sm:p-12 shadow-lg border border-white/50">
                <h3 className="text-3xl sm:text-4xl md:text-5xl font-serif font-medium mb-4 sm:mb-6">
                  Masih ada pertanyaan?
                </h3>
                <p className="text-sm sm:text-base md:text-lg text-gray-800 mb-6 sm:mb-8 leading-relaxed">
                  Dapatkan jawaban dari streamer berpengalaman di dekat Anda.
                </p>
                <button className="px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base">
                  Hubungi Streamer
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Linear Line Decoration */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[800px]">
            <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
          </div>
        </section>
      </main>
    </>
  );
}

const scrollToNextSection = () => {
  const nextSection = document.getElementById('about-section');
  if (nextSection) {
    nextSection.scrollIntoView({ behavior: 'smooth' });
  }
};

// Create a new TiltCard component
function TiltCard({ image, name, title, stats }: TiltCardProps) {
  const { ref, rotateX, rotateY, handleMouse } = useTilt();

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={() => {
        rotateX.set(0);
        rotateY.set(0);
      }}
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
      }}
      className="relative h-[500px] rounded-2xl overflow-hidden bg-white shadow-2xl cursor-pointer"
    >
      {/* Background Image */}
      <motion.div
        style={{
          backgroundImage: `url(${image})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
        className="absolute inset-0"
      />
      
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-6 text-white" style={{ transform: "translateZ(50px)" }}>
        <h3 className="text-2xl font-bold mb-2">{name}</h3>
        <p className="text-gray-300 mb-4">{title}</p>
        
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-400">Avg. Viewers</p>
            <p className="text-lg font-semibold">{stats.viewers}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Rating</p>
            <p className="text-lg font-semibold">{stats.rating}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Monthly Sales</p>
            <p className="text-lg font-semibold">{stats.sales}</p>
          </div>
        </div>

        {/* Live Indicator */}
        <div className="absolute top-6 right-6 flex items-center gap-2 bg-red-500/80 px-3 py-1 rounded-full">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          <span className="text-sm font-medium">LIVE</span>
        </div>
      </div>
    </motion.div>
  );
}

// Helper Components
interface StatsItemProps {
  label: string;
  value: string | number;
}

const StatsItem = ({ label, value }: StatsItemProps) => (
  <div>
    <p className="text-sm text-gray-400">{label}</p>
    <p className="text-lg font-semibold">{value}</p>
  </div>
);

interface StatsBlockProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;  // Assuming you're using lucide-react icons
  iconColor?: string;
  bgColor?: string;
}

const StatsBlock = ({ 
  title, 
  subtitle, 
  icon: Icon, 
  iconColor = "text-sky-700", 
  bgColor = "bg-sky-100" 
}: StatsBlockProps) => (
  <div className="text-center">
    <div className={`w-12 h-12 rounded-full ${bgColor} flex items-center justify-center mx-auto mb-3`}>
      <Icon className={`w-6 h-6 ${iconColor}`} />
    </div>
    <p className="text-xl font-semibold text-gray-900 mb-1">{title}</p>
    <p className="text-sm text-gray-500">{subtitle}</p>
  </div>
);

const LiveBadge = () => (
  <div className="absolute top-6 right-6 flex items-center gap-2 bg-red-500/80 backdrop-blur-sm px-3 py-1 rounded-full">
    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
    <span className="text-sm font-medium text-white">LIVE</span>
  </div>
);

interface StatsCardProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;  // Assuming you're using lucide-react icons
}

const StatsCard = ({ title, subtitle, icon: Icon }: StatsCardProps) => (
  <motion.div
    className="relative"
    initial={{ rotateX: 15, rotateY: -10, z: 30 }}
    animate={{ rotateX: 15, rotateY: -10, z: 30 }}
    style={{ 
      transformStyle: "preserve-3d",
      transformOrigin: "center center",
      filter: "drop-shadow(0 15px 15px rgb(0 0 0 / 0.1))"
    }}
  >
    <div className="h-[120px] md:h-[150px] bg-white rounded-2xl shadow-xl p-4 md:p-6 border border-sky-100/50">
      <div style={{ transform: "translateZ(40px)" }} className="h-full flex flex-col justify-between">
        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-sky-100 flex items-center justify-center">
          <Icon className="w-4 h-4 md:w-5 md:h-5 text-sky-700" />
        </div>
        <div>
          <p className="text-lg md:text-xl font-bold text-gray-900">{title}</p>
          <p className="text-xs md:text-sm text-gray-500">{subtitle}</p>
        </div>
      </div>
    </div>
  </motion.div>
);
