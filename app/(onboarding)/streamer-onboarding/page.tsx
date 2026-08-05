"use client";

import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";

/**
 * Post-signup introduction for streamers. Reached from streamerSignUpAction's
 * redirect — before that this page had no inbound links at all, which meant the
 * safety screen ("Semua transaksi WAJIB melalui Salda") had never been shown to
 * a single host.
 *
 * It assumes an authenticated, just-created streamer account: it verifies the
 * session on mount and hands off to /streamer-dashboard at the end.
 */

/** Where a streamer lands once the introduction is done or skipped. */
const APP_HOME = "/streamer-dashboard";

type OnboardingStep = {
  kind: "feature" | "safety";
  title: string;
  description: string;
  points: string[];
  video: string;
};

const onboardingSteps: OnboardingStep[] = [
  {
    kind: "feature",
    title: "Selamat Bergabung di Salda! 👋",
    description: "Platform yang menghubungkan Anda dengan brand-brand terbaik untuk live shopping.",
    points: [
      "Dapatkan akses ke berbagai brand ternama",
      "Kelola jadwal live shopping dengan mudah",
      "Terima pembayaran secara aman dan tepat waktu"
    ],
    video: "/videos/s1.mp4"
  },
  {
    kind: "feature",
    title: "Komunikasi yang Aman 💬",
    description: "Berkomunikasi dengan client melalui platform Salda yang terpercaya.",
    points: [
      "Chat langsung dengan client melalui platform",
      "Diskusikan detail live shopping dengan aman",
      "Semua percakapan tercatat dalam sistem"
    ],
    video: "/videos/s2.mp4"
  },
  {
    kind: "feature",
    title: "Dukungan Admin 🤝",
    description: "Tim admin Salda siap membantu melancarkan setiap sesi live shopping Anda.",
    points: [
      "Mediasi komunikasi dengan client",
      "Bantuan teknis selama live shopping",
      "Penyelesaian masalah dengan cepat"
    ],
    video: "/videos/s3.mp4"
  },
  {
    kind: "feature",
    title: "Mulai Live dengan Mudah 🎥",
    description: "Sistem live shopping yang simpel dan mudah digunakan.",
    points: [
      "Mulai live streaming dengan satu klik",
      "Interface yang user-friendly",
      "Panduan langkah demi langkah"
    ],
    video: "/videos/s4.mp4"
  },
  {
    kind: "feature",
    title: "Sistem Audit Otomatis ⚡",
    description: "Pantau dan rekam setiap sesi live shopping dengan akurat.",
    points: [
      "Pencatatan waktu mulai dan selesai otomatis",
      "Monitoring status live secara real-time",
      "Laporan performa setiap sesi"
    ],
    video: "/videos/s5.mp4"
  },
  {
    kind: "feature",
    title: "Pembayaran Terjamin 💰",
    description: "Sistem pembayaran yang aman dan transparan.",
    points: [
      "Pembayaran terlindungi dari penipuan dan fraud",
      "Rincian fee yang jelas dengan struktur komisi yang jelas",
      "Histori transaksi lengkap dan tidak terlihat oleh pihak lain"
    ],
    video: "/videos/s6.mp4"
  },
  {
    kind: "feature",
    title: "Kelola Booking dengan Mudah 📅",
    description: "Terima atau tolak permintaan booking sesuai jadwal Anda.",
    points: [
      "Atur harga dan durasi ketersediaan kamu sesuai keinginan",
      "Dapatkan permintaan langsung dari brand-brand terpercaya",
      "Kelola sesi live kamu dengan fleksibel"
    ],
    video: "/videos/s7.mp4"
  },
  {
    kind: "feature",
    title: "Atur Jadwal Fleksibel ⏰",
    description: "Tentukan waktu ketersediaan sesuai kenyamanan Anda.",
    points: [
      "Set jadwal aktif kamu dengan detail jam ketersediaan kamu",
      "Blokir waktu untuk keperluan pribadi",
      "Semua jadwal kamu dapat dijadwalkan dengan mudah"
    ],
    video: "/videos/s8.mp4"
  },
  {
    kind: "safety",
    title: "⚠️ PENTING ⚠️",
    description: "Lindungi diri Anda dengan mengikuti protokol keamanan Salda.",
    points: [
      "Jangan bagikan data pribadi di luar platform",
      "Semua transaksi WAJIB melalui Salda",
      "Laporkan aktivitas mencurigakan ke admin"
    ],
    video: ""
  }
];

export default function StreamerOnboarding() {
  const [currentStep, setCurrentStep] = useState(0);
  /** Gate the whole page until we know there is a signed-in streamer behind it. */
  const [authState, setAuthState] = useState<"checking" | "ready">("checking");
  /** Where the tour hands off; narrowed to verification for unapproved hosts. */
  const [exitPath, setExitPath] = useState(APP_HOME);
  const router = useRouter();

  const step = onboardingSteps[currentStep];
  const isLastStep = currentStep === onboardingSteps.length - 1;

  useEffect(() => {
    let cancelled = false;

    const verify = async () => {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (cancelled) return;
      if (authError || !user) {
        // /streamer-dashboard is behind auth anyway; fail early and clearly.
        router.replace('/sign-in?type=streamer');
        return;
      }

      const { data: userData } = await supabase
        .from('users')
        .select('user_type')
        .eq('id', user.id)
        .single();

      if (cancelled) return;

      // A brand who lands here belongs in the client flow.
      if (userData?.user_type === 'client') {
        router.replace('/client-onboarding');
        return;
      }

      // A new host signs up as `pending` and stays unbookable until an admin
      // approves them, so the tour hands off to verification rather than to a
      // dashboard that cannot yet take a single booking. Already-approved
      // hosts (and anyone we can't read a status for) go straight to the app.
      const { data: streamerRow } = await supabase
        .from('streamers')
        .select('verification_status')
        .eq('user_id', user.id)
        .maybeSingle();

      if (cancelled) return;

      if (streamerRow && streamerRow.verification_status !== 'approved') {
        setExitPath('/streamer-verification');
      }

      setAuthState("ready");
    };

    verify().catch(() => {
      // A failed profile read must not strand a signed-up host on a blank
      // screen — let them through to the tour and the dashboard.
      if (!cancelled) setAuthState("ready");
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  /** Single exit: verification if it's still outstanding, otherwise the app. */
  const goToApp = useCallback(() => {
    router.push(exitPath);
  }, [router, exitPath]);

  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
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

  if (authState === "checking") {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-red-50 via-white to-red-50">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <Loader2 className="h-6 w-6 animate-spin text-red-500" />
          <p className="text-sm">Menyiapkan akun kamu...</p>
        </div>
      </div>
    );
  }

  const renderStepBody = () => {
    if (step.kind === "safety") {
      return (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative"
        >
          <motion.div
            animate={{
              scale: [1, 1.02, 1],
              opacity: [0.5, 0.8, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute inset-0 bg-red-100 rounded-lg lg:rounded-xl"
          />

          <div className="relative bg-white/95 backdrop-blur-sm rounded-lg lg:rounded-xl border-2 border-red-500 p-4 lg:p-8 space-y-4 lg:space-y-6">
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex items-center gap-3 text-red-600"
            >
              <svg
                className="w-6 h-6 lg:w-8 lg:h-8 animate-pulse"
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
              <h1 className="text-2xl lg:text-4xl font-bold">{step.title}</h1>
            </motion.div>

            <motion.p
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-base lg:text-lg text-gray-700"
            >
              {step.description}
            </motion.p>

            <div className="space-y-3 lg:space-y-4">
              {step.points.map((point, index) => (
                <motion.div
                  key={index}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.4 + index * 0.1 }}
                  className="flex items-center gap-3 text-gray-800 bg-red-50 p-3 lg:p-4 rounded-lg border border-red-200"
                >
                  <div className="w-5 h-5 lg:w-6 lg:h-6 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-3 h-3 lg:w-4 lg:h-4 text-red-500" />
                  </div>
                  <span className="text-sm lg:text-base font-medium">{point}</span>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="mt-4 lg:mt-6 p-3 lg:p-4 bg-red-50 rounded-lg border border-red-200"
            >
              <p className="text-xs lg:text-sm text-red-600 font-medium">
                Catatan: Salda tidak bertanggung jawab atas kerugian yang timbul akibat
                transaksi di luar platform atau pembagian informasi pribadi kepada pihak lain.
              </p>
            </motion.div>
          </div>
        </motion.div>
      );
    }

    return (
      <div className="space-y-6 lg:space-y-8">
        <h1 className="text-2xl lg:text-4xl font-bold text-gray-900">{step.title}</h1>
        <p className="text-base lg:text-lg text-gray-600">{step.description}</p>
        <div className="space-y-3 lg:space-y-4">
          {step.points.map((point, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { delay: index * 0.2 }
              }}
              className="flex items-center gap-3 text-gray-700"
            >
              <div className="w-5 h-5 lg:w-6 lg:h-6 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-3 h-3 lg:w-4 lg:h-4 text-red-500" />
              </div>
              <span className="text-sm lg:text-base">{point}</span>
            </motion.div>
          ))}
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

      {/* Video Section */}
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
              // The safety step has no video; an empty <video src=""> renders as
              // a broken player, so show the brand mark instead.
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-red-50 via-white to-red-50">
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

      {/* Content Section */}
      <div className="w-full lg:w-[45%] bg-gradient-to-br from-red-50 via-white to-red-50 p-6 lg:p-12 flex items-center justify-center order-2 lg:order-1">
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
                {onboardingSteps.map((_, index) => (
                  <div key={index} className="flex-1 relative">
                    <div
                      className={`h-1.5 lg:h-2 rounded-full transition-all duration-500 ${
                        index <= currentStep ? "bg-red-500" : "bg-gray-200"
                      }`}
                    />
                    {index <= currentStep && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -right-1 -top-1 hidden lg:block"
                      >
                        <CheckCircle2 className="w-4 h-4 text-red-500" />
                      </motion.div>
                    )}
                  </div>
                ))}
              </div>

              {/* Content */}
              <div className="px-4 lg:px-0">
                {renderStepBody()}
              </div>

              {/* Navigation */}
              <div className="space-y-6 lg:space-y-8 px-4 lg:px-0">
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
                    className="flex-1 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 flex items-center justify-center gap-2 h-12 lg:h-11 text-sm lg:text-base"
                  >
                    {isLastStep ? "Mulai" : "Lanjut"}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>

                {/* Skip button */}
                <div className="text-center">
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
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
