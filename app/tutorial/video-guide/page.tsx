"use client";

import { ArrowLeft, Video, Sun, Mic, Upload, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function VideoGuide() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container max-w-3xl mx-auto px-4 py-8">
        {/* Navigation */}
        <Link href="/streamer-sign-up">
          <Button 
            variant="outline" 
            size="sm" 
            className="mb-6 border-blue-600 text-blue-600 hover:bg-blue-50"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Kembali ke Pendaftaran
          </Button>
        </Link>

        {/* Main Content */}
        <div className="space-y-8 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          {/* Header */}
          <div className="text-center pb-6 border-b border-gray-100">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Cara Membuat Video Perkenalan yang Menarik
            </h1>
            <p className="text-gray-600">
              Panduan lengkap membuat video yang profesional
            </p>
          </div>

          {/* Why Important Section */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-blue-800 mb-3">
              Mengapa Video Perkenalan Penting?
            </h2>
            <p className="text-blue-700">
              Video perkenalan adalah kesempatan pertama Anda untuk menunjukkan profesionalisme dan 
              kemampuan Anda kepada brand. Video yang berkualitas akan meningkatkan peluang Anda 
              untuk dipilih oleh brand.
            </p>
          </div>

          {/* Steps Section */}
          <div className="grid gap-6">
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Langkah-langkah Membuat Video
              </h2>

              {/* Step Cards */}
              <div className="grid gap-4">
                {/* Preparation */}
                <div className="p-4 rounded-lg border border-gray-200 bg-white">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-purple-50 rounded-lg">
                      <Video className="h-5 w-5 text-purple-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">1. Persiapan</h3>
                  </div>
                  <ul className="space-y-2 text-gray-600">
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-purple-600 rounded-full"></span>
                      Siapkan script atau poin-poin yang ingin disampaikan
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-purple-600 rounded-full"></span>
                      Pilih lokasi dengan pencahayaan yang baik
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-purple-600 rounded-full"></span>
                      Gunakan smartphone/kamera dengan kualitas HD
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-purple-600 rounded-full"></span>
                      Pastikan audio jernih dan tidak berisik
                    </li>
                  </ul>
                </div>

                {/* Content */}
                <div className="p-4 rounded-lg border border-gray-200 bg-white">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <Sun className="h-5 w-5 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">2. Konten Video</h3>
                  </div>
                  <ul className="space-y-2 text-gray-600">
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
                      Perkenalkan diri Anda dengan singkat
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
                      Jelaskan pengalaman live streaming Anda
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
                      Tunjukkan contoh cara Anda mempromosikan produk
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
                      Sebutkan kategori produk yang Anda kuasai
                    </li>
                  </ul>
                </div>

                {/* Technical */}
                <div className="p-4 rounded-lg border border-gray-200 bg-white">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-green-50 rounded-lg">
                      <Mic className="h-5 w-5 text-green-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">3. Teknis Perekaman</h3>
                  </div>
                  <ul className="space-y-2 text-gray-600">
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-green-600 rounded-full"></span>
                      Gunakan orientasi landscape (16:9)
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-green-600 rounded-full"></span>
                      Rekam dalam resolusi minimal 1080p
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-green-600 rounded-full"></span>
                      Durasi optimal: 2-3 menit
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-green-600 rounded-full"></span>
                      Pastikan frame stabil (gunakan tripod jika perlu)
                    </li>
                  </ul>
                </div>

                {/* Upload */}
                <div className="p-4 rounded-lg border border-gray-200 bg-white">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-orange-50 rounded-lg">
                      <Upload className="h-5 w-5 text-orange-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">4. Upload ke YouTube</h3>
                  </div>
                  <ol className="space-y-2 text-gray-600 list-decimal list-inside">
                    <li>Login ke akun YouTube Anda</li>
                    <li>Klik tombol Upload (ikon kamera dengan tanda +)</li>
                    <li>Pilih "Unlisted" pada pengaturan privasi</li>
                    <li>Isi judul: "Video Perkenalan [Nama Anda] - Lilo Host"</li>
                    <li>Setelah selesai upload, klik "SHARE" dan copy link-nya</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          {/* Tips Section */}
          <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Star className="h-5 w-5 text-yellow-600" />
              </div>
              <h3 className="font-semibold text-yellow-800">Tips Tambahan</h3>
            </div>
            <ul className="space-y-2 text-yellow-800">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-yellow-600 rounded-full"></span>
                Gunakan pakaian yang rapi dan profesional
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-yellow-600 rounded-full"></span>
                Bicara dengan jelas dan penuh semangat
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-yellow-600 rounded-full"></span>
                Tunjukkan kepribadian Anda yang natural
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-yellow-600 rounded-full"></span>
                Edit video untuk menghilangkan bagian yang tidak perlu
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
} 