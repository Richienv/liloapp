"use client";

import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { ArrowRight, Star, Users, Shield } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Iphone15Pro from "@/components/ui/iphone-15-pro";

interface UserData {
  first_name: string;
  profile_picture_url: string;
}

// iPhone Mockup Component - You can reuse this for all sections
const IPhoneMockup = ({ imageSrc, altText, padding = "p-0" }: { imageSrc: string; altText: string; padding?: string }) => (
  <div className="relative mx-auto w-[300px] h-[600px]">
    <div className="absolute inset-0 bg-black rounded-[3rem] shadow-xl">
      <div className="absolute inset-[8px] bg-white rounded-[2.5rem] overflow-hidden">
        {/* Notch */}
        <div className="absolute top-0 inset-x-0 h-7 bg-black z-10 rounded-b-3xl" />
        {/* Screen Content */}
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

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);

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
                    src="/images/host1.png"
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
                    src="/images/host2.png"
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
                    src="/images/host3.png"
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
        <section className="py-24 bg-white">
          <div className="container mx-auto px-4">
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

            <div className="grid md:grid-cols-3 gap-12 max-w-6xl mx-auto mb-16">
              {/* Streamer 1 */}
              <div>
                {/* Number */}
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 text-xl font-bold mb-6">
                  1
                </div>
                {/* iPhone Mockup */}
                <div className="mb-8 flex justify-center">
                  <Iphone15Pro
                    src="/images/step1.png"
                    width={180}
                    height={367}
                  />
                </div>
                {/* Text Content */}
                <div className="space-y-4">
                  <h3 className="text-2xl font-bold">Pilih & Verifikasi</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Pilih streamer yang sesuai dengan kebutuhan Anda. Lakukan verifikasi akun melalui Trollife untuk mendapatkan akses penuh ke platform kami.
                  </p>
                  <ul className="space-y-2">
                    <li className="flex items-center text-sm text-gray-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 mr-2 flex-shrink-0" />
                      <span>Verifikasi cepat dan aman</span>
                    </li>
                    <li className="flex items-center text-sm text-gray-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 mr-2 flex-shrink-0" />
                      <span>Pilihan streamer terverifikasi</span>
                    </li>
                    <li className="flex items-center text-sm text-gray-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 mr-2 flex-shrink-0" />
                      <span>Profil lengkap dan portofolio</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Streamer 2 */}
              <div>
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 text-xl font-bold mb-6">
                  2
                </div>
                <div className="mb-8 flex justify-center">
                  <Iphone15Pro
                    src="/images/step2.png"
                    width={180}
                    height={367}
                  />
                </div>
                <div className="space-y-4">
                  <h3 className="text-2xl font-bold">Pilih Paket & Jadwal</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Tentukan durasi streaming sesuai kebutuhan Anda. Tersedia pilihan paket per jam atau paket khusus dengan harga kompetitif.
                  </p>
                  <ul className="space-y-2">
                    <li className="flex items-center text-sm text-gray-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 mr-2 flex-shrink-0" />
                      <span>Fleksibel sesuai kebutuhan</span>
                    </li>
                    <li className="flex items-center text-sm text-gray-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 mr-2 flex-shrink-0" />
                      <span>Harga terjangkau</span>
                    </li>
                    <li className="flex items-center text-sm text-gray-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 mr-2 flex-shrink-0" />
                      <span>Jadwal yang fleksibel</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Streamer 3 */}
              <div>
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 text-xl font-bold mb-6">
                  3
                </div>
                <div className="mb-8 flex justify-center">
                  <Iphone15Pro
                    src="/images/step3.png"
                    width={180}
                    height={367}
                  />
                </div>
                <div className="space-y-4">
                  <h3 className="text-2xl font-bold">Mulai Streaming</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Setelah booking dikonfirmasi, streamer akan melakukan sesi live streaming sesuai jadwal. Nikmati layanan profesional dengan jaminan kualitas.
                  </p>
                  <ul className="space-y-2">
                    <li className="flex items-center text-sm text-gray-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 mr-2 flex-shrink-0" />
                      <span>Platform terpercaya</span>
                    </li>
                    <li className="flex items-center text-sm text-gray-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 mr-2 flex-shrink-0" />
                      <span>Streamer berkualitas</span>
                    </li>
                    <li className="flex items-center text-sm text-gray-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 mr-2 flex-shrink-0" />
                      <span>Dukungan 24/7</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="text-center max-w-3xl mx-auto">
              <p className="text-lg text-gray-600">
                Kami telah bermitra dengan streamer profesional di seluruh Indonesia. Streamer kami rata-rata menghasilkan
                <span className="font-semibold"> Rp30.000.000/bulan</span> dengan minimal
                <span className="font-semibold"> 15 sesi live streaming</span>.
              </p>
              <p className="text-sm text-gray-500 mt-4">
                *Pendapatan rata-rata berdasarkan data internal Salda periode Jan-Des 2023
              </p>
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
}
