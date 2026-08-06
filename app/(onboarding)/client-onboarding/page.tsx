"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, CheckCircle2, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { createClient } from "@/utils/supabase/client";

/**
 * Post-signup introduction for brands. Reached from signUpAction's redirect —
 * before that this page had no inbound links at all, so nobody had ever seen
 * the "keep every transaction on Salda" warning it ends on.
 *
 * It assumes an authenticated, just-created client account: it verifies the
 * session on mount and hands off to /protected (the brand's home) at the end.
 */

/** Where a brand lands once the introduction is done or skipped. */
const APP_HOME = "/protected";

type OnboardingStep = {
  kind: "feature" | "safety" | "brand-profile";
  title: string;
  description: string;
  points: string[];
  video: string;
};

const onboardingSteps: OnboardingStep[] = [
  {
    kind: "feature",
    title: "Selamat Datang di Salda! 👋",
    description: "Platform yang menghubungkan brand kamu dengan host live shopping terbaik.",
    points: [
      "Akses ke 250+ host profesional terlatih",
      "Tingkatkan penjualan dengan live shopping",
      "Sistem pembayaran yang aman dan transparan"
    ],
    video: "/videos/c1.mp4"
  },
  {
    kind: "feature",
    title: "Host Berkualitas 🌟",
    description: "Tim host profesional yang siap membantu penjualan kamu.",
    points: [
      "Host terlatih dengan pengalaman live shopping",
      "Spesialisasi di berbagai kategori produk",
      "Rating dan review terbuka dari client sebelumnya"
    ],
    video: "/videos/c2.mp4"
  },
  {
    kind: "feature",
    title: "Keamanan Terjamin 🔒",
    description: "Sistem yang melindungi transaksi dan kepentingan brand kamu.",
    points: [
      "Verifikasi ketat untuk setiap host",
      "Perlindungan dari penipuan dan fraud",
      "Kontrak digital yang mengikat secara hukum"
    ],
    video: "/videos/c3.mp4"
  },
  {
    kind: "feature",
    title: "Transaksi Transparan 💎",
    description: "Pembayaran yang aman dan terpantau dengan jelas.",
    points: [
      "Sistem escrow untuk keamanan pembayaran",
      "Rincian biaya yang jelas tanpa biaya tersembunyi",
      "Laporan keuangan yang detail dan akurat"
    ],
    video: "/videos/c4.mp4"
  },
  {
    kind: "feature",
    title: "Notifikasi Real-time 📱",
    description: "Pantau setiap perkembangan live shopping kamu.",
    points: [
      "Update status booking secara langsung",
      "Notifikasi performa selama live",
      "Laporan hasil penjualan otomatis"
    ],
    video: "/videos/c5.mp4"
  },
  {
    kind: "feature",
    title: "Pilihan Host Terlengkap 🎯",
    description: "Temukan host yang tepat untuk produk kamu.",
    points: [
      "250+ host aktif dari berbagai platform",
      "Filter berdasarkan kategori dan pengalaman",
      "Profil lengkap dengan portofolio host"
    ],
    video: "/videos/c6.mp4"
  },
  {
    kind: "feature",
    title: "Tingkatkan Revenue 📈",
    description: "Bukti nyata peningkatan penjualan dengan live shopping.",
    points: [
      "Rata-rata peningkatan penjualan 3-5x lipat",
      "Engagement rate 10x lebih tinggi",
      "Konversi penjualan hingga 30%"
    ],
    video: "/videos/c7.mp4"
  },
  {
    kind: "feature",
    title: "Harga Kompetitif 💰",
    description: "Investasi yang sepadan untuk pertumbuhan bisnis kamu.",
    points: [
      "Tarif yang bersaing di industri",
      "Paket booking yang fleksibel",
      "Program loyalitas untuk client regular"
    ],
    video: "/videos/c8.mp4"
  },
  {
    kind: "safety",
    title: "⚠️ PENTING ⚠️",
    description: "Pastikan keamanan transaksi kamu di Salda.",
    points: [
      "Selalu gunakan sistem pembayaran Salda",
      "Jangan melakukan transaksi di luar platform",
      "Hubungi admin jika ada aktivitas mencurigakan"
    ],
    video: ""
  }
];

/**
 * Appended only when the brand skipped the optional description at signup.
 * Signup no longer demands it, so this is where it gets a second chance.
 */
const brandProfileStep: OnboardingStep = {
  kind: "brand-profile",
  title: "Ceritakan tentang brand kamu ✍️",
  description:
    "Host membaca ini sebelum menerima booking. Boleh dilewati — kamu tetap bisa mulai mencari host sekarang.",
  points: [],
  video: ""
};

export default function ClientOnboarding() {
  const [currentStep, setCurrentStep] = useState(0);
  /** Gate the whole page until we know there is a signed-in client behind it. */
  const [authState, setAuthState] = useState<"checking" | "ready">("checking");
  const [needsBrandProfile, setNeedsBrandProfile] = useState(false);
  const [brandDescription, setBrandDescription] = useState("");
  const [savingBrand, setSavingBrand] = useState(false);
  const [brandError, setBrandError] = useState<string | null>(null);
  const router = useRouter();

  const steps = useMemo(
    () => (needsBrandProfile ? [...onboardingSteps, brandProfileStep] : onboardingSteps),
    [needsBrandProfile]
  );
  const step = steps[Math.min(currentStep, steps.length - 1)];
  const isLastStep = currentStep === steps.length - 1;

  useEffect(() => {
    let cancelled = false;

    const verify = async () => {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (cancelled) return;
      if (authError || !user) {
        // Nothing to onboard without an account.
        router.replace('/sign-in');
        return;
      }

      const { data: userData } = await supabase
        .from('users')
        .select('user_type, brand_description')
        .eq('id', user.id)
        .single();

      if (cancelled) return;

      // A streamer who lands here belongs in the streamer flow.
      if (userData?.user_type === 'streamer') {
        router.replace('/streamer-onboarding');
        return;
      }

      setNeedsBrandProfile(!userData?.brand_description);
      setAuthState("ready");
    };

    verify().catch(() => {
      // A failed profile read must not strand a signed-up brand on a blank
      // screen — let them into the app and carry on.
      if (!cancelled) setAuthState("ready");
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  /** Single exit: the brand's real home inside the app. */
  const goToApp = useCallback(() => {
    router.push(APP_HOME);
  }, [router]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
      return;
    }
    goToApp();
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const saveBrandProfile = async () => {
    if (savingBrand) return;

    const description = brandDescription.trim();
    if (!description) {
      goToApp();
      return;
    }

    try {
      setSavingBrand(true);
      setBrandError(null);

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/sign-in');
        return;
      }

      const { error } = await supabase
        .from('users')
        .update({
          brand_description: description,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        // Keep the text on screen rather than losing it to a failed write.
        setBrandError('Gagal menyimpan deskripsi. Coba lagi, atau lewati dan lengkapi nanti.');
        return;
      }

      goToApp();
    } catch {
      setBrandError('Gagal menyimpan deskripsi. Coba lagi, atau lewati dan lengkapi nanti.');
    } finally {
      // In `finally` so a failed save never leaves the button stuck.
      setSavingBrand(false);
    }
  };

  if (authState === "checking") {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <p className="text-sm">Menyiapkan akun kamu...</p>
        </div>
      </div>
    );
  }

  const renderStepBody = () => {
    if (step.kind === "brand-profile") {
      return (
        <div className="space-y-6 lg:space-y-8">
          <h1 className="text-2xl lg:text-4xl font-bold text-gray-900">{step.title}</h1>
          <p className="text-base lg:text-lg text-gray-600">{step.description}</p>

          <Textarea
            value={brandDescription}
            onChange={(e) => setBrandDescription(e.target.value)}
            placeholder="Cerita, misi, dan target audiens brand kamu"
            className="min-h-[140px] resize-none rounded-xl border-gray-200 bg-white text-base
              focus:border-blue-500 focus:ring-blue-500"
          />

          {brandError && (
            <p className="flex items-start gap-2 text-sm text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              {brandError}
            </p>
          )}

          <div className="flex gap-3 lg:gap-4">
            <Button
              onClick={handlePrevious}
              variant="outline"
              disabled={savingBrand}
              className="flex-1 flex items-center justify-center gap-2 h-12 lg:h-11 text-sm lg:text-base"
            >
              <ArrowLeft className="w-4 h-4" />
              Kembali
            </Button>
            <Button
              onClick={saveBrandProfile}
              disabled={savingBrand}
              className="flex-1 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 flex items-center justify-center gap-2 h-12 lg:h-11 text-sm lg:text-base"
            >
              {savingBrand ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  Simpan & Mulai
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      );
    }

    const isSafety = step.kind === "safety";

    return (
      <div className="space-y-6 lg:space-y-8">
        <div className={isSafety ? "flex items-center gap-3 text-blue-600" : undefined}>
          {isSafety && (
            <svg
              className="w-6 h-6 lg:w-8 lg:h-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          )}
          <h1 className="text-2xl lg:text-4xl font-bold text-gray-900">{step.title}</h1>
        </div>

        <p className="text-base lg:text-lg text-gray-600">{step.description}</p>

        <div className="space-y-3 lg:space-y-4 mt-6 lg:mt-8">
          {step.points.map((point, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { delay: index * 0.2 }
              }}
              className={
                isSafety
                  ? "flex items-center gap-3 text-gray-700 bg-blue-50 p-3 lg:p-4 rounded-lg border border-blue-200"
                  : "flex items-center gap-3 text-gray-700"
              }
            >
              <div className="w-5 h-5 lg:w-6 lg:h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-3 h-3 lg:w-4 lg:h-4 text-blue-500" />
              </div>
              <span className="text-sm lg:text-base">{point}</span>
            </motion.div>
          ))}
        </div>

        {isSafety && (
          <div className="mt-4 lg:mt-6 p-3 lg:p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs lg:text-sm text-blue-600 font-medium">
              Catatan: Salda tidak bertanggung jawab atas kerugian yang timbul akibat
              transaksi di luar platform atau pembagian informasi pribadi kepada pihak lain.
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="space-y-6 lg:space-y-8 mt-8">
          <div className="flex gap-3 lg:gap-4">
            <Button
              onClick={handlePrevious}
              variant="outline"
              className="flex-1 flex items-center justify-center gap-2 h-12 lg:h-11 text-sm lg:text-base"
              disabled={currentStep === 0}
            >
              <ArrowLeft className="w-4 h-4" />
              Kembali
            </Button>
            <Button
              onClick={handleNext}
              className="flex-1 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 flex items-center justify-center gap-2 h-12 lg:h-11 text-sm lg:text-base"
            >
              {isLastStep ? "Mulai" : "Lanjut"}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="text-center pt-4 lg:pt-0">
            <button
              onClick={goToApp}
              className="group inline-flex flex-col items-center gap-2"
            >
              <Image
                src="/images/salda-logoB.png"
                alt="Salda Logo"
                width={40}
                height={40}
                className="opacity-50 group-hover:opacity-100 transition-opacity lg:w-[60px] lg:h-[60px]"
              />
              <span className="text-xs lg:text-sm text-gray-500 underline group-hover:text-gray-700">
                Lewati semua pengenalan
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative flex flex-col lg:flex-row w-full min-h-screen">
      {/* Always-visible escape hatch — nobody should feel trapped in a tour. */}
      <button
        onClick={goToApp}
        className="absolute right-4 top-4 z-20 rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-gray-600
          shadow-sm backdrop-blur transition-colors hover:text-gray-900"
      >
        Lewati
      </button>

      {/* Left Content */}
      <div className="w-full lg:w-[45%] bg-gradient-to-br from-blue-50 via-white to-blue-50 p-6 lg:p-12 flex items-center justify-center order-2 lg:order-1">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6 lg:space-y-8"
            >
              {/* Progress Bar */}
              <div className="flex items-center gap-1 lg:gap-2 mb-8 lg:mb-12 px-4 lg:px-0">
                {steps.map((_, index) => (
                  <div key={index} className="flex-1 relative">
                    <div
                      className={`h-1.5 lg:h-2 rounded-full transition-all duration-500 ${
                        index <= currentStep ? "bg-blue-500" : "bg-gray-200"
                      }`}
                    />
                    {index <= currentStep && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -right-1 -top-1 hidden lg:block"
                      >
                        <CheckCircle2 className="w-4 h-4 text-blue-500" />
                      </motion.div>
                    )}
                  </div>
                ))}
              </div>

              {/* Content */}
              <div className="px-4 lg:px-0">
                {renderStepBody()}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Right Content - Video Section */}
      <div className="w-full lg:flex-1 h-[40vh] lg:h-auto relative bg-white order-1 lg:order-2">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            {step.video ? (
              <video
                key={step.video}
                src={step.video}
                autoPlay
                muted
                loop
                playsInline
                className="w-full h-full object-contain"
              />
            ) : (
              // The closing steps have no video; an empty <video src=""> renders
              // as a broken player, so show the brand mark instead.
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50">
                <Image
                  src="/images/salda-logoB.png"
                  alt="Salda"
                  width={120}
                  height={120}
                  className="opacity-40"
                />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
