"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Play, CheckCircle2, ArrowLeft, ArrowRight } from 'lucide-react';
import { createClient } from "@/utils/supabase/client";
import { Slider } from "@/components/ui/slider";

import { cn } from "@/lib/utils";
import { 
  ShoppingBag, 
  TrendingUp, 
  Globe, 
  Users, 
  BarChart,
  ShoppingCart,
  Sparkles,
  Coffee,
  Smartphone,
  Home,
  Heart,
  Baby,
  MoreHorizontal,
  Store,
  CreditCard,
  LineChart,
  Rocket
} from 'lucide-react';

interface TargetMarketOption {
  label: string;
  type: 'range' | 'buttons';
  min?: number;
  max?: number;
  defaultValue?: number[];
  choices?: string[];
}

interface OnboardingStep {
  title: string;
  description: string;
  question: string;
  inputType: 'cards' | 'grid' | 'slider' | 'buttons' | 'pricing' | 'multiSelect' | 'targetMarket';
  options?: Option[] | TargetMarketOption[];
  sliderConfig?: {
    min: number;
    max: number;
    step: number;
    defaultValue: number[];
  };
  video: string;
}

interface Option {
  icon?: React.ReactNode;
  label: string;
  description?: string;
  color?: string;
  price?: string;
  features?: string[];
  selected?: boolean;
}

const onboardingSteps: OnboardingStep[] = [
  {
    title: "Selamat Datang di Salda! 👋",
    description: "Platform revolusioner yang menghubungkan brand Anda dengan host live shopping profesional. Kami memahami tantangan dalam meningkatkan penjualan online, dan kami hadir dengan solusi yang telah terbukti efektif melalui live commerce.",
    question: "Apa harapan Anda dalam menggunakan platform Salda?",
    inputType: "cards",
    options: [
      {
        icon: <TrendingUp className="w-4 h-4" />,
        label: "Meningkatkan penjualan produk",
        description: "Target 3-5x lipat"
      },
      {
        icon: <Globe className="w-4 h-4" />,
        label: "Memperluas market",
        description: "Jangkau audiens baru"
      },
      {
        icon: <Users className="w-4 h-4" />,
        label: "Membangun presence",
        description: "Di platform e-commerce"
      },
      {
        icon: <Sparkles className="w-4 h-4" />,
        label: "Mencari host profesional",
        description: "Untuk live shopping"
      },
      {
        icon: <BarChart className="w-4 h-4" />,
        label: "Optimasi marketing",
        description: "Strategi digital"
      }
    ],
    video: "/videos/c1.mp4"
  },
  {
    title: "Pilih Kategori Host Anda 🌟",
    description: "Setiap produk membutuhkan host dengan keahlian khusus untuk hasil maksimal. Pilih satu atau lebih kategori yang sesuai dengan produk Anda.",
    question: "Kategori produk apa yang ingin Anda promosikan?",
    inputType: "multiSelect",
    options: [
      {
        icon: <ShoppingBag className="w-5 h-5" />,
        label: "Fashion & Accessories",
        selected: false
      },
      {
        icon: <Sparkles className="w-5 h-5" />,
        label: "Beauty & Skincare",
        selected: false
      },
      {
        icon: <Coffee className="w-5 h-5" />,
        label: "Food & Beverage",
        selected: false
      },
      {
        icon: <Smartphone className="w-5 h-5" />,
        label: "Electronics & Gadgets",
        selected: false
      },
      {
        icon: <Home className="w-5 h-5" />,
        label: "Home & Living",
        selected: false
      },
      {
        icon: <Heart className="w-5 h-5" />,
        label: "Health & Wellness",
        selected: false
      },
      {
        icon: <Baby className="w-5 h-5" />,
        label: "Mother & Baby",
        selected: false
      },
      {
        icon: <MoreHorizontal className="w-5 h-5" />,
        label: "Others",
        selected: false
      }
    ],
    video: "/videos/c2.mp4"
  },
  {
    title: "Tentukan Target Market 🎯",
    description: "Memahami target market Anda membantu kami merekomendasikan host yang tepat untuk produk Anda.",
    question: "Pilih karakteristik target market Anda:",
    inputType: "targetMarket",
    options: [
      {
        label: "Usia",
        type: "range",
        min: 18,
        max: 65,
        defaultValue: [25, 45]
      },
      {
        label: "Gender",
        type: "buttons",
        choices: ["Semua", "Wanita", "Pria"]
      },
      {
        label: "Lokasi",
        type: "buttons",
        choices: ["Semua Wilayah", "Jawa", "Luar Jawa"]
      }
    ],
    video: "/videos/c3.mp4"
  },
  {
    title: "Budget Marketing 💰",
    description: "Kami menyediakan berbagai paket yang dapat disesuaikan dengan budget Anda.",
    question: "Berapa budget per sesi live shopping?",
    inputType: "pricing",
    options: [
      {
        icon: <CreditCard className="w-5 h-5" />,
        label: "Starter",
        price: "500rb - 1jt",
        features: ["1 sesi", "1 host", "Basic analytics"]
      },
      {
        icon: <CreditCard className="w-5 h-5" />,
        label: "Growth",
        price: "1jt - 2jt",
        features: ["3 sesi", "2 host pilihan", "Full analytics"]
      },
      {
        icon: <CreditCard className="w-5 h-5" />,
        label: "Scale",
        price: "2jt - 5jt",
        features: ["5 sesi", "Premium host", "Priority support"]
      }
    ],
    video: "/videos/c8.mp4"
  },
  {
    title: "Tingkatkan Penjualan Anda Sekarang 🚀",
    description: "Kami menyediakan host profesional untuk berbagai platform e-commerce.",
    question: "Berapa target peningkatan penjualan yang Anda inginkan?",
    inputType: "multiSelect",
    options: [
      {
        icon: <TrendingUp className="w-4 h-4" />,
        label: "2x Lipat",
        description: "Dalam 1 bulan"
      },
      {
        icon: <BarChart className="w-4 h-4" />,
        label: "3x Lipat",
        description: "Dalam 2 bulan"
      },
      {
        icon: <LineChart className="w-4 h-4" />,
        label: "5x Lipat",
        description: "Dalam 3 bulan"
      },
      {
        icon: <Rocket className="w-4 h-4" />,
        label: "10x Lipat",
        description: "Dalam 6 bulan"
      }
    ],
    video: "/videos/c7.mp4"
  }
];

interface InputSelectorProps {
  type: OnboardingStep['inputType'];
  options?: Option[] | TargetMarketOption[];
  sliderConfig?: {
    min: number;
    max: number;
    step: number;
    defaultValue: number[];
  };
  onSelect: () => void;
  selectedOptions: string[];
  onSelectChange: (newSelection: string[]) => void;
}

const InputSelector = ({ 
  type, 
  options, 
  sliderConfig, 
  onSelect,
  selectedOptions,
  onSelectChange
}: InputSelectorProps) => {
  const [sliderValue, setSliderValue] = useState<number[]>(sliderConfig?.defaultValue || [25, 45]);
  const [targetMarketData, setTargetMarketData] = useState({
    age: [25, 45] as number[],
    gender: "Semua" as string,
    location: "Semua Wilayah" as string
  });

  const isOption = (option: Option | TargetMarketOption): option is Option => {
    return 'icon' in option || 'description' in option || 'color' in option || 'price' in option;
  };

  const isTargetMarketOption = (option: Option | TargetMarketOption): option is TargetMarketOption => {
    return 'type' in option;
  };

  switch (type) {
    case 'cards':
      if (!options?.every(isOption)) return null;
      return (
        <div className="grid grid-cols-1 gap-2">
          {options?.map((option, index) => (
            <button
              key={index}
              onClick={() => {
                onSelectChange([option.label]);
                onSelect();
              }}
              className="group p-3 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all duration-200"
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-md bg-blue-100 text-blue-600 group-hover:bg-blue-200">
                  {option.icon}
                </div>
                <div className="text-left flex-1">
                  <div className="text-sm font-medium text-gray-900">{option.label}</div>
                  {option.description && (
                    <div className="text-xs text-gray-500">{option.description}</div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      );

    case 'targetMarket':
      if (!options?.every(isTargetMarketOption)) return null;
      return (
        <div className="space-y-8">
          {options.map((option, index) => {
            if (option.type === 'range') {
              return (
                <div key={index} className="space-y-3">
                  <label className="text-sm font-medium text-gray-700">{option.label}</label>
                  <Slider
                    defaultValue={option.defaultValue}
                    max={option.max || 65}
                    min={option.min || 18}
                    step={1}
                    onValueChange={(value: number[]) => 
                      setTargetMarketData(prev => ({ ...prev, age: value }))
                    }
                  />
                  <div className="text-sm text-center text-gray-600">
                    {targetMarketData.age[0]} - {targetMarketData.age[1]} tahun
                  </div>
                </div>
              );
            }

            if (option.type === 'buttons' && option.choices) {
              return (
                <div key={index} className="space-y-3">
                  <label className="text-sm font-medium text-gray-700">{option.label}</label>
                  <div className="flex gap-2">
                    {option.choices.map((choice) => (
                      <button
                        key={choice}
                        onClick={() => {
                          const field = option.label.toLowerCase() as keyof typeof targetMarketData;
                          setTargetMarketData(prev => ({ ...prev, [field]: choice }));
                        }}
                        className={cn(
                          "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200",
                          targetMarketData[option.label.toLowerCase() as keyof typeof targetMarketData] === choice
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        )}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }

            return null;
          })}
        </div>
      );

    case 'slider':
      if (!sliderConfig) return null;
      return (
        <div className="space-y-6">
          <Slider
            defaultValue={sliderValue}
            max={sliderConfig.max}
            min={sliderConfig.min}
            step={sliderConfig.step}
            onValueChange={setSliderValue}
          />
          <div className="text-sm text-center text-gray-600">
            {sliderValue[0]} - {sliderValue[1]} tahun
          </div>
        </div>
      );

    case 'multiSelect':
      if (!options?.every(isOption)) return null;
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
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-blue-500 hover:bg-blue-50"
              )}
            >
              <div className="flex flex-col items-center gap-2">
                <div className={cn(
                  "p-2 rounded-lg",
                  selectedOptions.includes(option.label)
                    ? "bg-blue-200 text-blue-700"
                    : "bg-blue-100 text-blue-600"
                )}>
                  {option.icon}
                </div>
                <div className="text-xs font-medium text-center text-gray-900">{option.label}</div>
              </div>
            </button>
          ))}
        </div>
      );

    case 'buttons':
      if (!options?.every(isOption)) return null;
      return (
        <div className="flex gap-4 justify-center">
          {options.map((option, index) => (
            <button
              key={index}
              onClick={() => {
                onSelectChange([option.label]);
              }}
              className={cn(
                "flex items-center gap-2 p-2 rounded-lg text-white transition-all duration-200",
                option.color || "bg-blue-600",
                "hover:opacity-90 w-[160px] h-[45px]",
                selectedOptions.includes(option.label) && "ring-2 ring-blue-400"
              )}
            >
              <div className="p-1">
                {option.icon}
              </div>
              <span className="text-sm font-medium">{option.label}</span>
            </button>
          ))}
        </div>
      );

    default:
      return null;
  }
};

export default function ClientOnboarding() {
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const router = useRouter();

  const handleRedirect = async () => {
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        console.error('Authentication error:', authError);
        router.push('/sign-in');
        return;
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('user_type')
        .eq('id', user.id)
        .single();

      if (userError) {
        console.error('Error fetching user data:', userError);
        router.push('/sign-in');
        return;
      }

      if (userData?.user_type === 'client') {
        router.push('/protected');
      } else {
        router.push('/sign-in');
      }
    } catch (error) {
      console.error('Redirect error:', error);
      router.push('/sign-in');
    }
  };

  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(prev => prev + 1);
      if (onboardingSteps[currentStep + 1].inputType === 'multiSelect' || 
          onboardingSteps[currentStep + 1].inputType === 'buttons') {
        setSelectedOptions([]);
      }
    } else {
      handleRedirect();
    }
  };

  const handleSkip = () => {
    handleRedirect();
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSelect = (newSelection: string[]) => {
    setSelectedOptions(newSelection);
  };

  const renderPoints = (points?: string[]) => {
    if (!points) return null;
    
    return (
      <div className="space-y-4">
        {points.map((point, index) => (
          <div key={index} className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-blue-500" />
            <span>{point}</span>
          </div>
        ))}
      </div>
    );
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
      <div className="flex-1 flex items-center justify-center py-6 md:py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          {/* Progress Indicator */}
          <div className="mb-8 md:mb-12">
            <div className="flex items-center justify-center gap-1.5 mb-4">
              {onboardingSteps.map((_, index) => (
                <div
                  key={index}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === currentStep ? 'w-6 bg-blue-600' : 'w-1.5 bg-gray-200'
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

              {onboardingSteps[currentStep].options && (
                <div className="space-y-4">
                  <h2 className="text-lg md:text-xl font-semibold text-gray-900">
                    {onboardingSteps[currentStep].question}
                  </h2>
                  <InputSelector
                    type={onboardingSteps[currentStep].inputType}
                    options={onboardingSteps[currentStep].options}
                    sliderConfig={onboardingSteps[currentStep].sliderConfig}
                    onSelect={handleNext}
                    selectedOptions={selectedOptions}
                    onSelectChange={handleSelect}
                  />
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
                    className="flex-1 h-10 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white"
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
              Client ID N1198653
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
} 