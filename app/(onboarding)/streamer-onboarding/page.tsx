"use client";

import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

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

/**
 * Sentence case, `kamu`, no emoji, and `brand` rather than `client` — that is
 * the word the host dashboard and the reject modal already use for the other
 * side of a booking, and a host should not have to learn two names for it.
 */
const onboardingSteps: OnboardingStep[] = [
  {
    kind: "feature",
    title: "Selamat bergabung di Salda",
    description: "Platform yang menghubungkan kamu dengan brand-brand terbaik untuk live shopping.",
    points: [
      "Dapatkan akses ke berbagai brand ternama",
      "Kelola jadwal live shopping dengan mudah",
      "Terima pembayaran secara aman dan tepat waktu"
    ],
    video: "/videos/s1.mp4"
  },
  {
    kind: "feature",
    title: "Komunikasi yang aman",
    description: "Berkomunikasi dengan brand melalui platform Salda yang terpercaya.",
    points: [
      "Kirim pesan langsung ke brand lewat aplikasi",
      "Diskusikan detail live shopping dengan aman",
      "Semua percakapan tercatat dalam sistem"
    ],
    video: "/videos/s2.mp4"
  },
  {
    kind: "feature",
    title: "Dukungan admin",
    description: "Tim admin Salda siap membantu melancarkan setiap sesi live shopping kamu.",
    points: [
      "Mediasi komunikasi dengan brand",
      "Bantuan teknis selama live shopping",
      "Penyelesaian masalah dengan cepat"
    ],
    video: "/videos/s3.mp4"
  },
  {
    kind: "feature",
    title: "Mulai live dengan mudah",
    description: "Sistem live shopping yang simpel dan mudah digunakan.",
    points: [
      "Mulai live streaming dengan satu klik",
      "Tampilan yang mudah dipakai",
      "Panduan langkah demi langkah"
    ],
    video: "/videos/s4.mp4"
  },
  {
    kind: "feature",
    title: "Sistem audit otomatis",
    description: "Pantau dan rekam setiap sesi live shopping dengan akurat.",
    points: [
      "Pencatatan waktu mulai dan selesai otomatis",
      "Pantau status live secara langsung",
      "Laporan performa setiap sesi"
    ],
    video: "/videos/s5.mp4"
  },
  {
    kind: "feature",
    title: "Pembayaran terjamin",
    description: "Sistem pembayaran yang aman dan transparan.",
    points: [
      "Pembayaran terlindungi dari penipuan",
      "Rincian biaya dan struktur komisi yang jelas",
      "Riwayat transaksi lengkap dan tidak terlihat oleh pihak lain"
    ],
    video: "/videos/s6.mp4"
  },
  {
    kind: "feature",
    title: "Kelola booking dengan mudah",
    description: "Terima atau tolak permintaan booking sesuai jadwal kamu.",
    points: [
      "Atur harga dan durasi ketersediaan kamu sesuai keinginan",
      "Dapatkan permintaan langsung dari brand terpercaya",
      "Kelola sesi live kamu dengan fleksibel"
    ],
    video: "/videos/s7.mp4"
  },
  {
    kind: "feature",
    title: "Atur jadwal fleksibel",
    description: "Tentukan waktu ketersediaan sesuai kenyamanan kamu.",
    points: [
      "Atur jadwal aktif kamu sampai ke jam ketersediaan",
      "Blokir waktu untuk keperluan pribadi",
      "Semua jadwal kamu bisa diatur dengan mudah"
    ],
    video: "/videos/s8.mp4"
  },
  {
    kind: "safety",
    // Rendered as the caution eyebrow above the heading, not as the heading.
    title: "Penting",
    description: "Lindungi diri kamu dengan mengikuti protokol keamanan Salda.",
    points: [
      "Jangan bagikan data pribadi di luar platform",
      "Semua transaksi wajib melalui Salda",
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
      <div className="flex min-h-screen w-full items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-ink-ghost" />
          <p className="text-meta text-ink-soft">Menyiapkan akun kamu…</p>
        </div>
      </div>
    );
  }

  const isSafety = step.kind === "safety";

  /**
   * The body of one step. The navigation pair lives outside it so the two
   * buttons sit in the same place on every step rather than moving with the
   * content above them.
   */
  const renderStepBody = () => (
    <>
      {isSafety && (
        <p className="flex items-center gap-2 font-mono text-tiny uppercase text-caution">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {step.title}
        </p>
      )}

      {/*
        On the safety step the sentence IS the headline. What used to be here —
        a pulsing red glow behind a white card with a 2px red border, red-tinted
        rows and a red note — spent five different reds on the one screen that
        needed to be read calmly and did not look like the rest of the product.
      */}
      <h1
        className={cn(
          "font-serif font-semibold text-ink",
          isSafety ? "mt-4 text-section" : "text-section sm:text-display",
        )}
      >
        {isSafety ? step.description : step.title}
      </h1>

      {!isSafety && <p className="mt-3 text-lede text-ink-soft">{step.description}</p>}

      {/*
        A numbered list on hairline rules. The tick in a coloured circle
        confirmed nothing — the host has not done any of these yet.
      */}
      <ul className="mt-8 border-t border-hairline-soft">
        {step.points.map((point, index) => (
          <motion.li
            key={index}
            initial={{ opacity: 0, y: 6 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { delay: index * 0.06 }
            }}
            className="flex items-baseline gap-3 border-b border-hairline-soft py-3"
          >
            <span className="numeric shrink-0 font-mono text-mini text-ink-ghost">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span
              className={cn(
                "text-copy",
                isSafety ? "font-medium text-ink" : "text-ink-body",
              )}
            >
              {point}
            </span>
          </motion.li>
        ))}
      </ul>

      {isSafety && (
        <div className="mt-6 rounded-panel border border-caution-line bg-caution-tint px-4 py-3">
          <p className="text-meta text-caution">
            Catatan: Salda tidak bertanggung jawab atas kerugian yang timbul akibat
            transaksi di luar platform atau pembagian informasi pribadi kepada pihak lain.
          </p>
        </div>
      )}
    </>
  );

  return (
    <div className="flex min-h-screen w-full flex-col bg-canvas lg:flex-row">
      {/*
        Ink, the way the role picker's host panel is ink. It is what tells a
        host at a glance that this is their side of the product — the job the
        red used to do, done with a surface instead of a second accent colour.
      */}
      <div className="relative order-1 h-[38vh] w-full shrink-0 bg-ink lg:order-2 lg:h-auto lg:flex-1">
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
                className="h-full w-full object-contain"
              />
            ) : (
              // The safety step has no video; an empty <video src=""> renders as
              // a broken player, so show the brand mark instead. The white mark,
              // because the panel it sits on is #171717.
              <div className="flex h-full w-full items-center justify-center">
                <Image
                  src="/images/salda-iconW.png"
                  alt="Salda"
                  width={120}
                  height={120}
                  className="opacity-30"
                />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Content column. 452px is the reading measure the auth screens use. */}
      <div className="order-2 flex w-full items-center justify-center px-5 py-10 sm:px-8 lg:order-1 lg:w-[46%] lg:px-12 lg:py-16">
        <div className="w-full max-w-[452px]">
          {/*
            Step count and the escape hatch on one line, above the rail. The
            skip used to be a floating white pill over the video and a logo with
            an underlined caption at the very bottom — two controls doing the
            same navigation, neither of them part of the system.
          */}
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-mono text-tiny uppercase text-ink-ghost">
              Langkah {currentStep + 1} dari {onboardingSteps.length}
            </span>
            <button
              type="button"
              onClick={goToApp}
              className="shrink-0 text-meta text-ink-soft underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
            >
              Lewati pengenalan
            </button>
          </div>

          {/*
            Flat 2px segments in ink. The one accent on this screen is the
            button that moves you forward.
          */}
          <div className="mt-3 flex items-center gap-1" aria-hidden="true">
            {onboardingSteps.map((_, index) => (
              <span
                key={index}
                className={cn(
                  "h-[2px] flex-1 transition-colors duration-500",
                  index <= currentStep ? "bg-ink" : "bg-surface-deep",
                )}
              />
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="mt-10"
            >
              {renderStepBody()}
            </motion.div>
          </AnimatePresence>

          {/*
            The pair never stacks: `action-secondary` and `action` share the row
            below 640px and take their fixed 168/220 widths above it.
          */}
          <div className="mt-10 flex items-center gap-3">
            <Button
              variant="quiet"
              size="action-secondary"
              onClick={handlePrevious}
              disabled={currentStep === 0}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali
            </Button>
            <Button variant="brand" size="action" onClick={handleNext}>
              {isLastStep ? "Mulai" : "Lanjut"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
