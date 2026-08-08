"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

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

/**
 * Copy is sentence case, `kamu`, and carries no emoji — the headings render in
 * Playfair, and a colour-font glyph in the middle of a serif line is the one
 * thing that makes a display size look like a chat message.
 *
 * The figures on steps 1, 6 and 7 ("250+ host", "3-5x lipat", "10x", "30%")
 * are inherited marketing claims with nothing behind them in the data this
 * page loads. They are left exactly as they were rather than being restyled
 * into something that looks more authoritative than it is; see the report.
 */
const onboardingSteps: OnboardingStep[] = [
  {
    kind: "feature",
    title: "Selamat datang di Salda",
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
    title: "Host berkualitas",
    description: "Tim host profesional yang siap membantu penjualan kamu.",
    points: [
      "Host terlatih dengan pengalaman live shopping",
      "Spesialisasi di berbagai kategori produk",
      "Rating dan ulasan terbuka dari brand sebelumnya"
    ],
    video: "/videos/c2.mp4"
  },
  {
    kind: "feature",
    title: "Keamanan terjamin",
    description: "Sistem yang melindungi transaksi dan kepentingan brand kamu.",
    points: [
      "Verifikasi ketat untuk setiap host",
      "Perlindungan dari penipuan",
      "Kontrak digital yang mengikat secara hukum"
    ],
    video: "/videos/c3.mp4"
  },
  {
    kind: "feature",
    title: "Transaksi transparan",
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
    title: "Notifikasi langsung",
    description: "Pantau setiap perkembangan live shopping kamu.",
    points: [
      "Pembaruan status booking secara langsung",
      "Notifikasi performa selama live",
      "Laporan hasil penjualan otomatis"
    ],
    video: "/videos/c5.mp4"
  },
  {
    kind: "feature",
    title: "Pilihan host terlengkap",
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
    title: "Tingkatkan pendapatan",
    description: "Bukti nyata peningkatan penjualan dengan live shopping.",
    points: [
      "Rata-rata peningkatan penjualan 3-5x lipat",
      "Tingkat interaksi 10x lebih tinggi",
      "Konversi penjualan hingga 30%"
    ],
    video: "/videos/c7.mp4"
  },
  {
    kind: "feature",
    title: "Harga kompetitif",
    description: "Investasi yang sepadan untuk pertumbuhan bisnis kamu.",
    points: [
      "Tarif yang bersaing di industri",
      "Paket booking yang fleksibel",
      "Program loyalitas untuk brand langganan"
    ],
    video: "/videos/c8.mp4"
  },
  {
    kind: "safety",
    // Rendered as the caution eyebrow above the heading, not as the heading —
    // "Penting" in 34px serif says less than the sentence it introduces.
    title: "Penting",
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
  title: "Ceritakan tentang brand kamu",
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
      <div className="flex min-h-screen w-full items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-ink-ghost" />
          <p className="text-meta text-ink-soft">Menyiapkan akun kamu…</p>
        </div>
      </div>
    );
  }

  const isSafety = step.kind === "safety";
  const isBrandProfile = step.kind === "brand-profile";

  /**
   * The body of one step: eyebrow, heading, and whatever the step is actually
   * for. The navigation pair lives outside it so the two buttons sit in the
   * same place on every step instead of moving with the content above them.
   */
  const renderStepBody = () => {
    if (isBrandProfile) {
      return (
        <>
          <h1 className="font-serif text-section font-semibold text-ink sm:text-display">
            {step.title}
          </h1>
          <p className="mt-3 text-lede text-ink-soft">{step.description}</p>

          <Textarea
            value={brandDescription}
            onChange={(e) => setBrandDescription(e.target.value)}
            placeholder="Cerita, misi, dan target audiens brand kamu"
            className="mt-6 min-h-[150px] resize-none rounded-field border-hairline-input bg-surface px-4 py-3 text-copy text-ink placeholder:text-ink-ghost focus-visible:border-hairline-strong focus-visible:ring-1 focus-visible:ring-ink focus-visible:ring-offset-0"
          />

          {brandError && (
            <p className="mt-3 flex items-start gap-2 text-meta text-destructive-emphasis">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {brandError}
            </p>
          )}
        </>
      );
    }

    return (
      <>
        {isSafety && (
          <p className="flex items-center gap-2 font-mono text-tiny uppercase text-caution">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {step.title}
          </p>
        )}

        {/*
          On the safety step the sentence IS the headline — a serif "Penting"
          over a smaller sentence buries the only instruction in the tour that
          costs money to ignore.
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
          A numbered list on hairline rules, not a stack of tinted cards with a
          coloured tick in each one. Three blue circles is three accents in a
          section that is allowed one, and the ticks confirmed nothing — the
          reader has not done these things yet.
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
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-canvas lg:flex-row">
      {/*
        The brand side of the product, so the media panel is the warm quiet
        fill the role picker uses for brands — not white. A white panel beside
        a warm canvas draws a seam down the middle of the screen that reads as
        two pages stitched together.
      */}
      <div className="relative order-1 h-[38vh] w-full shrink-0 border-b border-hairline bg-surface-tint lg:order-2 lg:h-auto lg:flex-1 lg:border-b-0 lg:border-l">
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
              // The closing steps have no video; an empty <video src=""> renders
              // as a broken player, so show the brand mark instead.
              <div className="flex h-full w-full items-center justify-center">
                <Image
                  src="/images/salda-logoB.png"
                  alt="Salda"
                  width={120}
                  height={120}
                  className="opacity-25"
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
            skip used to be a floating white pill over the video and a logo
            with an underlined caption at the very bottom — two controls doing
            the same navigation, neither of them part of the system.
          */}
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-mono text-tiny uppercase text-ink-ghost">
              Langkah {currentStep + 1} dari {steps.length}
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
            Flat 2px segments in ink, not blue: the one accent on this screen is
            the button that moves you forward. A progress bar that competes with
            it for attention is the second blue the brief forbids.
          */}
          <div className="mt-3 flex items-center gap-1" aria-hidden="true">
            {steps.map((_, index) => (
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
              disabled={currentStep === 0 || savingBrand}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali
            </Button>

            {isBrandProfile ? (
              <Button
                variant="brand"
                size="action"
                onClick={saveBrandProfile}
                disabled={savingBrand}
              >
                {savingBrand ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Menyimpan…
                  </>
                ) : (
                  <>
                    Simpan & mulai
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            ) : (
              <Button variant="brand" size="action" onClick={handleNext}>
                {isLastStep ? "Mulai" : "Lanjut"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
