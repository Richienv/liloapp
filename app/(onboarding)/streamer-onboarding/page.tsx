"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Play, CheckCircle2, ArrowLeft, ArrowRight, TrendingUp, Globe, Users, Sparkles, Star, Crown, Trophy, Wallet, Coins, PiggyBank, Banknote, Clock1, Clock4, Clock8, Clock12, Sunrise, Sun, Sunset, Moon } from 'lucide-react';
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";

interface Option {
  icon?: React.ReactNode;
  label: string;
  description?: string;
  color?: string;
}

interface TimeLabel {
  value: number;
  label: string;
  emoji: string;
}

interface OnboardingStep {
  title: string;
  description: string;
  question?: string;
  inputType?: 'multiSelect' | 'slider';
  options?: Option[];
  sliderConfig?: {
    min: number;
    max: number;
    step: number;
    defaultValue: number[];
  };
  timeLabels?: TimeLabel[];
  points?: string[];
  video?: string;
}

interface InputSelectorProps {
  type: 'multiSelect' | 'slider';
  options?: Option[];
  sliderConfig?: {
    min: number;
    max: number;
    step: number;
    defaultValue: number[];
  };
  timeLabels?: TimeLabel[];
  selectedOptions: string[];
  onSelectChange: (newSelection: string[]) => void;
}

const InputSelector = ({ 
  type, 
  options,
  sliderConfig,
  timeLabels,
  selectedOptions,
  onSelectChange
}: InputSelectorProps) => {
  if (type === 'multiSelect' && options) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {options.map((option, index) => (
          <button
            key={index}
            onClick={() => {
              const newSelected = selectedOptions.includes(option.label)
                ? selectedOptions.filter(item => item !== option.label)
                : [...selectedOptions, option.label];
              onSelectChange(newSelected);
            }}
            className={cn(
              "p-3 rounded-lg border-2 transition-all duration-200",
              selectedOptions.includes(option.label)
                ? "border-red-500 bg-red-50"
                : "border-gray-200 hover:border-red-500 hover:bg-red-50"
            )}
          >
            <div className="flex flex-col items-center gap-2">
              <div className={cn(
                "p-2 rounded-lg",
                selectedOptions.includes(option.label)
                  ? "bg-red-200 text-red-700"
                  : "bg-red-100 text-red-600"
              )}>
                {option.icon}
              </div>
              <div className="text-xs font-medium text-center text-gray-900">{option.label}</div>
              {option.description && (
                <div className="text-xs text-gray-500">{option.description}</div>
              )}
            </div>
          </button>
        ))}
      </div>
    );
  } else if (type === 'slider' && sliderConfig && timeLabels) {
    return (
      <div className="space-y-6">
        <Slider
          defaultValue={sliderConfig.defaultValue}
          max={sliderConfig.max}
          min={sliderConfig.min}
          step={sliderConfig.step}
          onValueChange={(value) => onSelectChange([value.toString()])}
        />
        <div className="flex justify-between text-sm text-gray-600">
          {timeLabels.map((label, index) => (
            <div 
              key={index}
              className={cn(
                "flex flex-col items-center gap-1",
                Number(selectedOptions[0]) >= label.value && "text-red-500 font-medium"
              )}
            >
              <span className="text-lg">{label.emoji}</span>
              <span>{label.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

const onboardingSteps: OnboardingStep[] = [
  {
    title: "Selamat Bergabung di Salda! 👋",
    description: "Platform yang menghubungkan Anda dengan brand-brand terbaik untuk live shopping.",
    question: "Apa yang membuat Anda tertarik menjadi host live shopping?",
    inputType: "multiSelect",
    options: [
      {
        icon: <TrendingUp className="w-4 h-4" />,
        label: "Penghasilan Tambahan",
        description: "Target 3-5x lipat"
      },
      {
        icon: <Globe className="w-4 h-4" />,
        label: "Fleksibilitas Waktu",
        description: "Atur jadwal sendiri"
      },
      {
        icon: <Users className="w-4 h-4" />,
        label: "Pengembangan Karir",
        description: "Jadi host profesional"
      },
      {
        icon: <Sparkles className="w-4 h-4" />,
        label: "Koneksi Brand",
        description: "Kerjasama brand ternama"
      }
    ],
    video: "/videos/s1.mp4"
  },
  {
    title: "Mulai Live dengan Mudah 🎥",
    description: "Kami akan membantu Anda memulai perjalanan sebagai host live shopping profesional dengan sistem yang mudah dan intuitif.",
    video: "/videos/s4.mp4"
  },
  {
    title: "Pembayaran Terjamin 💰",
    description: "Sistem pembayaran yang aman dan transparan.",
    question: "Keuntungan sistem pembayaran Salda:",
    points: [
      "Pembayaran terlindungi dari penipuan dan fraud",
      "Rincian fee yang jelas dengan struktur komisi yang jelas",
      "Histori transaksi lengkap dan tidak terlihat oleh pihak lain"
    ],
    video: "/videos/s6.mp4"
  },
  {
    title: "Kelola Booking dengan Mudah 📅",
    description: "Atur jadwal live shopping Anda dengan fleksibel. Terima permintaan yang sesuai, tolak yang bentrok, semua dalam genggaman Anda.",
    question: "Berapa jam yang bisa Anda luangkan untuk live shopping per hari? ⏰",
    inputType: "slider",
    sliderConfig: {
      min: 0,
      max: 12,
      step: 1,
      defaultValue: [4]
    },
    timeLabels: [
      { value: 0, label: "0 jam", emoji: "😴" },
      { value: 3, label: "3 jam", emoji: "🌱" },
      { value: 6, label: "6 jam", emoji: "⭐" },
      { value: 9, label: "9 jam", emoji: "🔥" },
      { value: 12, label: "12 jam", emoji: "🚀" }
    ],
    video: "/videos/s7.mp4"
  },
  {
    title: "Atur Jadwal Fleksibel ⏰",
    description: "Tentukan waktu ketersediaan sesuai kenyamanan Anda.",
    question: "Kapan waktu terbaik Anda untuk melakukan live shopping?",
    inputType: "multiSelect",
    options: [
      {
        icon: <Sunrise className="w-4 h-4" />,
        label: "Pagi",
        description: "08:00 - 12:00"
      },
      {
        icon: <Sun className="w-4 h-4" />,
        label: "Siang",
        description: "12:00 - 16:00"
      },
      {
        icon: <Sunset className="w-4 h-4" />,
        label: "Sore",
        description: "16:00 - 20:00"
      },
      {
        icon: <Moon className="w-4 h-4" />,
        label: "Malam",
        description: "20:00 - 24:00"
      }
    ],
    points: [
      "Set jadwal aktif kamu dengan detail jam ketersediaan kamu",
      "Blokir waktu untuk keperluan pribadi",
      "Semua jadwal kamu dapat dijadwalkan dengan mudah"
    ],
    video: "/videos/s8.mp4"
  }
];

export default function StreamerOnboarding() {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const router = useRouter();

  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      router.push('/streamer-dashboard');
    }
  };

  const handleSkip = () => {
    router.push('/streamer-dashboard');
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSelect = (newSelection: string[]) => {
    setSelectedOptions(newSelection);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header Navigation */}
      <nav className="bg-[#1A1A1A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <Image
                  src="/images/icon-salda.png"
                  alt="Salda Logo"
                  width={40}
                  height={40}
                  className="h-8 w-auto"
                />
              </div>
            </div>
            <div className="flex items-center">
              <span className="px-3 py-1 text-sm bg-[#2A2A2A] text-white rounded-full">
                EN
              </span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center py-6 md:py-12 min-h-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full overflow-y-auto">
          {/* Progress Indicator */}
          <div className="mb-8 md:mb-12">
            <div className="flex items-center justify-center gap-1.5 mb-4">
              {onboardingSteps.map((_, index) => (
                <div
                  key={index}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === currentStep ? 'w-6 bg-red-600' : 'w-1.5 bg-gray-200'
                  }`}
                />
              ))}
            </div>
            <p className="text-center text-sm text-gray-500">
              Step {currentStep + 1} of {onboardingSteps.length}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-16 items-center">
            {/* Left Column - Content */}
            <div className="space-y-6 md:space-y-8 order-2 lg:order-1">
              <div className="space-y-4">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  {onboardingSteps[currentStep].title}
                </h1>
                <p className="text-base md:text-lg text-gray-600 leading-relaxed">
                  {onboardingSteps[currentStep].description}
                </p>
              </div>

              {/* Question Section */}
              {(onboardingSteps[currentStep].options || onboardingSteps[currentStep].sliderConfig) && (
                <div className="space-y-4">
                  <h2 className="text-lg md:text-xl font-semibold text-gray-900">
                    {onboardingSteps[currentStep].question}
                  </h2>
                  <InputSelector
                    type={onboardingSteps[currentStep].inputType!}
                    options={onboardingSteps[currentStep].options}
                    sliderConfig={onboardingSteps[currentStep].sliderConfig}
                    timeLabels={onboardingSteps[currentStep].timeLabels}
                    selectedOptions={selectedOptions}
                    onSelectChange={handleSelect}
                  />
                </div>
              )}

              {/* Points Section */}
              {onboardingSteps[currentStep].points && Array.isArray(onboardingSteps[currentStep].points) && (
                <div className="space-y-3 lg:space-y-4">
                  {onboardingSteps[currentStep].points.map((point, index) => (
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
                      <div className="w-5 h-5 lg:w-6 lg:h-6 rounded-full bg-red-100 flex items-center justify-center">
                        <CheckCircle2 className="w-3 h-3 lg:w-4 lg:h-4 text-red-500" />
                      </div>
                      <span className="text-sm lg:text-base">{point}</span>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Navigation */}
              <div className="space-y-3 pt-4">
                <div className="flex space-x-3">
                  <Button
                    onClick={handlePrevious}
                    variant="outline"
                    className="flex-1 h-10 text-sm font-medium border hover:bg-gray-50"
                    disabled={currentStep === 0}
                  >
                    Previous
                  </Button>
                  <Button
                    onClick={handleNext}
                    className="flex-1 h-10 text-sm font-medium bg-red-600 hover:bg-red-700 text-white"
                  >
                    {currentStep === onboardingSteps.length - 1 ? 'Finish' : 'Next'}
                  </Button>
                </div>
                
                <button
                  onClick={handleSkip}
                  className="w-full text-center text-sm text-gray-500 hover:text-gray-900 py-2"
                >
                  Skip onboarding
                </button>
              </div>
            </div>

            {/* Right Column - Video */}
            <div className="order-1 lg:order-2">
              <div className="max-w-[280px] mx-auto">
                <div className="aspect-[9/16] relative overflow-hidden rounded-2xl bg-gray-100">
                  {onboardingSteps[currentStep].video && (
                    <video
                      key={onboardingSteps[currentStep].video}
                      src={onboardingSteps[currentStep].video}
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center text-sm text-gray-500">
            <div className="flex space-x-6">
              <a href="mailto:admin@trolive.id" className="hover:text-gray-900">admin@trolive.id</a>
              <a href="tel:+18558302662" className="hover:text-gray-900">+1 855 830 2662</a>
            </div>
            <div>
              Streamer ID N1198653
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}