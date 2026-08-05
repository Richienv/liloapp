"use client";

import { signUpAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CityCombobox } from "@/components/ui/city-combobox";
import { PhoneInput } from "@/components/ui/phone-input";
import Link from "next/link";
import { useState, useRef } from "react";
import Image from "next/image";
import { Info, ArrowLeft, ArrowRight, Upload, Check, AlertCircle, Loader2 } from 'lucide-react';
import { motion } from "framer-motion";
import { Checkbox } from "@/components/ui/checkbox";
import { SignUpResponse } from "@/app/types/auth";
import { getCityBySlug } from "@/lib/cities";
import { formatPhoneLocal, isValidPhone, normalizePhone, PHONE_INVALID_MESSAGE } from "@/lib/phone";

const TOTAL_STEPS = 4;
/**
 * Step 3 collects nothing an account needs. It is presented after the
 * account-critical steps and can be skipped outright — a brand can only judge
 * whether Salda is worth describing their brand to *after* they're inside.
 */
const OPTIONAL_STEP = 3;

interface FormData {
  basicInfo: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    location: string;
  };
  security: {
    password: string;
    confirm_password: string;
  };
  brandInfo: {
    brand_name: string;
    brand_description: string;
    brand_doc: File | null;
  };
}

export default function Signup({ searchParams }: { searchParams: Message }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    basicInfo: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      location: '',
    },
    security: {
      password: '',
      confirm_password: '',
    },
    brandInfo: {
      brand_name: '',
      brand_description: '',
      brand_doc: null,
    }
  });

  const [isSigningUp, setIsSigningUp] = useState(false);
  const [docError, setDocError] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showPhoneError, setShowPhoneError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /**
   * Set once the account exists. The button re-enables in `finally` before the
   * redirect lands, so this stops a second submission slipping through.
   */
  const submittedRef = useRef(false);

  // Add state for password
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const updateFormData = (step: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [step]: {
        ...prev[step as keyof FormData],
        [field]: value
      }
    }));
  };

  const validateStep = (step: number): boolean => {
    setError(null);

    switch (step) {
      case 1: // Basic info + brand name — everything an account actually needs
        const { first_name, last_name, email, phone, location } = formData.basicInfo;
        if (!first_name || !last_name || !email) {
          setError('Mohon lengkapi nama dan email Anda');
          return false;
        }
        if (!email.includes('@')) {
          setError('Mohon masukkan alamat email yang valid');
          return false;
        }
        if (!isValidPhone(phone)) {
          setShowPhoneError(true);
          setError(PHONE_INVALID_MESSAGE);
          return false;
        }
        if (!getCityBySlug(location)) {
          setError('Pilih kota Anda dari daftar yang tersedia');
          return false;
        }
        if (!formData.brandInfo.brand_name) {
          setError('Mohon isi nama brand Anda');
          return false;
        }
        break;

      case 2: // Security
        const { password, confirm_password } = formData.security;
        if (!password || !confirm_password) {
          setError('Mohon lengkapi semua field yang diperlukan');
          return false;
        }
        if (password !== confirm_password) {
          setError('Kata sandi tidak cocok');
          return false;
        }
        if (password.length < 6) {
          setError('Kata sandi minimal 6 karakter');
          return false;
        }
        break;

      case OPTIONAL_STEP:
        // Brand description and guidelines are optional by design — nothing to
        // validate, and skipping is a supported outcome.
        break;
    }

    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, TOTAL_STEPS));
    }
  };

  const handlePrevious = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  /**
   * Enter previously triggered a native submit, which navigated away and threw
   * out everything typed so far. It now advances the step; on the last step it
   * runs the real signup.
   */
  const handleFormKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;

    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target instanceof HTMLTextAreaElement) return;
    const tag = target.tagName.toLowerCase();
    if (tag === 'button' || tag === 'a' || tag === 'select') return;

    event.preventDefault();

    if (currentStep < TOTAL_STEPS) {
      handleNext();
      return;
    }
    if (acceptedTerms && !isSigningUp) {
      handleSignUp();
    }
  };

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setDocError('Ukuran file maksimal 5MB');
        return;
      }
      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedTypes.includes(file.type)) {
        setDocError('Hanya file PDF dan DOC/DOCX yang diperbolehkan');
        return;
      }
      updateFormData('brandInfo', 'brand_doc', file);
      setDocError('');
    }
  };

  const renderStepIndicator = () => {
    return (
      <div className="flex items-center justify-center mb-8">
        {[1, 2, 3, 4].map((step) => (
          <div key={step} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === currentStep
                  ? 'bg-blue-600 text-white'
                  : step < currentStep
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              {step < currentStep ? '✓' : step}
            </div>
            {step < 4 && (
              <div
                className={`w-12 h-1 ${
                  step < currentStep ? 'bg-green-500' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderBasicInfo = () => {
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="first_name" className="text-gray-700 font-medium">Nama Depan</Label>
            <Input 
              id="first_name"
              name="first_name"
              value={formData.basicInfo.first_name}
              onChange={(e) => updateFormData('basicInfo', 'first_name', e.target.value)}
              placeholder="Budi" 
              required 
              className="h-12 bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500
                transition-all duration-200 text-base rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name" className="text-gray-700 font-medium">Nama Belakang</Label>
            <Input 
              id="last_name"
              name="last_name"
              value={formData.basicInfo.last_name}
              onChange={(e) => updateFormData('basicInfo', 'last_name', e.target.value)}
              placeholder="Santoso" 
              required 
              className="h-12 bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500
                transition-all duration-200 text-base rounded-xl"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-gray-700 font-medium">Alamat Email</Label>
          <div className="relative">
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.basicInfo.email}
              onChange={(e) => updateFormData('basicInfo', 'email', e.target.value)}
              placeholder="anda@contoh.com"
              required
              className="h-12 bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500
                transition-all duration-200 text-base rounded-xl pl-12"
            />
            <svg
              className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 transform -translate-y-1/2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500 mt-2 flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-500" />
            Kami mengirim informasi penting ke email ini
          </p>
        </div>

        {/* WhatsApp is Salda's support channel and how a host reaches a brand
            about a booking — the privacy notice already says we collect it. */}
        <div className="space-y-2">
          <Label htmlFor="phone" className="text-gray-700 font-medium">Nomor WhatsApp</Label>
          <PhoneInput
            id="phone"
            name="phone"
            required
            value={formData.basicInfo.phone}
            onChange={(value) => {
              setShowPhoneError(false);
              updateFormData('basicInfo', 'phone', value);
            }}
            forceShowError={showPhoneError}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="location" className="text-gray-700 font-medium">Kota</Label>
          <CityCombobox
            id="location"
            name="location"
            value={formData.basicInfo.location}
            onChange={(slug) => updateFormData('basicInfo', 'location', slug)}
            placeholder="Pilih kota Anda"
          />
          <p className="mt-2 text-sm text-gray-500">
            Dipakai untuk estimasi pengiriman produk ke host dan untuk menampilkan host di kota Anda.
          </p>
        </div>

        {/* Brand name lives here rather than on its own screen: it is the only
            brand field the account genuinely needs. */}
        <div className="space-y-2">
          <Label htmlFor="brand_name" className="text-gray-700 font-medium">Nama Brand</Label>
          <Input
            id="brand_name"
            name="brand_name"
            value={formData.brandInfo.brand_name}
            onChange={(e) => updateFormData('brandInfo', 'brand_name', e.target.value)}
            placeholder="Nama brand Anda"
            required
            className="h-12 bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500
              transition-all duration-200 text-base rounded-xl"
          />
        </div>
      </div>
    );
  };

  const renderSecurity = () => {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <Label htmlFor="password" className="text-gray-700 font-medium">Kata Sandi</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              name="password"
              value={formData.security.password}
              onChange={(e) => updateFormData('security', 'password', e.target.value)}
              placeholder="Buat kata sandi yang aman"
              minLength={6}
              required
              className="h-12 bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500
                transition-all duration-200 text-base rounded-xl pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 
                hover:text-gray-600 transition-colors"
            >
              {showPassword ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm_password" className="text-gray-700 font-medium">Konfirmasi Kata Sandi</Label>
          <div className="relative">
            <Input
              id="confirm_password"
              type={showConfirmPassword ? "text" : "password"}
              name="confirm_password"
              value={formData.security.confirm_password}
              onChange={(e) => updateFormData('security', 'confirm_password', e.target.value)}
              placeholder="Ulangi kata sandi Anda"
              minLength={6}
              required
              className="h-12 bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500
                transition-all duration-200 text-base rounded-xl pr-12"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 
                hover:text-gray-600 transition-colors"
            >
              {showConfirmPassword ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
          <h4 className="font-medium text-gray-900 mb-3">Syarat Kata Sandi:</h4>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-gray-400" />
              Minimal 6 karakter
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-gray-400" />
              Disarankan kombinasi huruf dan angka
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-gray-400" />
              Karakter spesial menambah keamanan
            </li>
          </ul>
        </div>
      </div>
    );
  };

  const renderBrandInfo = () => {
    return (
      <div className="space-y-8">
        {/* Say plainly that nothing here blocks the account. */}
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-900">
                Langkah ini opsional
              </p>
              <p className="text-sm text-blue-700">
                Semua di halaman ini bisa dilengkapi nanti — akun Anda tetap bisa dibuat
                sekarang. Host membaca bagian ini sebelum menerima booking, jadi mengisinya
                membantu, tapi tidak wajib.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="brand_description" className="text-gray-700 font-medium">
            Deskripsi Brand{" "}
            <span className="font-normal text-gray-400">(opsional)</span>
          </Label>
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-500" />
            Ceritakan tentang brand Anda dan nilai yang dibawa
          </p>
          <Textarea
            id="brand_description"
            name="brand_description"
            value={formData.brandInfo.brand_description}
            onChange={(e) => updateFormData('brandInfo', 'brand_description', e.target.value)}
            placeholder="Cerita, misi, dan target audiens brand Anda"
            className="min-h-[120px] bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500
              transition-all duration-200 text-base rounded-xl resize-none"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="brand_doc" className="text-gray-700 font-medium">
            Brand Guidelines{" "}
            <span className="font-normal text-gray-400">(opsional)</span>
          </Label>
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-500" />
            Unggah dokumen panduan brand untuk dibagikan ke host
          </p>
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer group"
          >
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8
              transition-all duration-200 hover:border-blue-500 hover:bg-blue-50/50">
              <div className="flex flex-col items-center">
                <div className="p-4 rounded-full bg-gray-50 mb-4 
                  group-hover:bg-blue-100/50 transition-colors">
                  <svg 
                    className="w-8 h-8 text-gray-400 group-hover:text-blue-500" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-600 group-hover:text-blue-600">
                  {formData.brandInfo.brand_doc ? formData.brandInfo.brand_doc.name : 'Unggah Brand Guidelines'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  PDF atau DOC maksimal 5MB
                </p>
              </div>
            </div>
          </div>
          {formData.brandInfo.brand_doc && (
            <p className="text-sm text-green-600 mt-2 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              File terpilih: {formData.brandInfo.brand_doc.name}
            </p>
          )}
          {docError && (
            <p className="text-sm text-red-600 mt-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {docError}
            </p>
          )}
          <input
            type="file"
            name="brand_doc"
            accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleDocumentChange}
            ref={fileInputRef}
            className="hidden"
          />
        </div>

        <div className="p-4 bg-gray-50 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-gray-700">
            <Info className="w-4 h-4" />
            <span className="text-sm font-medium">Tips Brand Guidelines</span>
          </div>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-gray-400" />
              Sertakan palet warna dan tipografi brand Anda
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-gray-400" />
              Jelaskan hal yang boleh dan tidak boleh disampaikan host
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-gray-400" />
              Tambahkan contoh konten brand yang berhasil
            </li>
          </ul>
        </div>
      </div>
    );
  };

  const renderPreview = () => {
    return (
      <div className="space-y-8">
        <div className="bg-[#faf9f6] rounded-2xl p-6 border border-[#f0f0ef]">
          <div className="text-sm font-medium text-gray-600 mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Pratinjau Akun
          </div>

          <div className="grid gap-6">
            {/* Basic Information */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 space-y-4">
              <h3 className="text-sm font-medium text-gray-900 pb-2 border-b border-gray-100">
                Informasi Dasar
              </h3>
              <div className="grid grid-cols-1 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Nama Brand</span>
                  <p className="font-medium text-gray-900 mt-0.5">{formData.brandInfo.brand_name}</p>
                </div>
                <div>
                  <span className="text-gray-500">Narahubung</span>
                  <p className="font-medium text-gray-900 mt-0.5">
                    {formData.basicInfo.first_name} {formData.basicInfo.last_name}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Email</span>
                  <p className="font-medium text-gray-900 mt-0.5">{formData.basicInfo.email}</p>
                </div>
                <div>
                  <span className="text-gray-500">WhatsApp</span>
                  <p className="font-medium text-gray-900 mt-0.5">
                    {formatPhoneLocal(normalizePhone(formData.basicInfo.phone))}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Kota</span>
                  <p className="font-medium text-gray-900 mt-0.5">
                    {getCityBySlug(formData.basicInfo.location)?.name ?? formData.basicInfo.location}
                  </p>
                </div>
              </div>
            </div>

            {/* Brand Information */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 space-y-4">
              <h3 className="text-sm font-medium text-gray-900 pb-2 border-b border-gray-100">
                Profil Brand
              </h3>
              <div className="space-y-4">
                <div>
                  <span className="text-sm text-gray-500">Deskripsi</span>
                  {formData.brandInfo.brand_description ? (
                    <p className="text-gray-900 mt-1.5">{formData.brandInfo.brand_description}</p>
                  ) : (
                    <p className="text-gray-500 mt-1.5 italic">
                      Belum diisi — bisa dilengkapi setelah akun dibuat.
                    </p>
                  )}
                </div>
                {formData.brandInfo.brand_doc && (
                  <div>
                    <span className="text-sm text-gray-500">Brand Guidelines</span>
                    <p className="font-medium text-gray-900 mt-1.5 flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {formData.brandInfo.brand_doc.name}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Terms and Conditions */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="terms"
              checked={acceptedTerms}
              onCheckedChange={(checked: boolean) => setAcceptedTerms(checked)}
              className="mt-1"
            />
            <div className="space-y-1">
              <label
                htmlFor="terms"
                className="text-sm text-gray-600 leading-relaxed"
              >
                Saya menyetujui{" "}
                <Link 
                  href="/terms" 
                  className="text-blue-600 hover:text-blue-700 font-medium underline"
                  target="_blank"
                >
                  Syarat & Ketentuan
                </Link>
                {" "}dan{" "}
                <Link 
                  href="/privacy-notice" 
                  className="text-blue-600 hover:text-blue-700 font-medium underline"
                  target="_blank"
                >
                  Kebijakan Privasi
                </Link>
              </label>
              <p className="text-xs text-gray-500">
                Dengan membuat akun, Anda menyetujui syarat dan ketentuan kami
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleSignUp = async () => {
    // Guard the in-flight and already-done cases as well as disabling the
    // button: a double Enter press can fire twice before React re-renders the
    // disabled state, and the redirect after success is not instant.
    if (isSigningUp || submittedRef.current) return;

    try {
      setError(null);
      setIsSigningUp(true);

      const submitFormData = new FormData();

      // Add basic info
      submitFormData.append('first_name', formData.basicInfo.first_name);
      submitFormData.append('last_name', formData.basicInfo.last_name);
      submitFormData.append('email', formData.basicInfo.email);
      // Stored in canonical E.164 ("+62812...") so WhatsApp links always work.
      submitFormData.append('phone', normalizePhone(formData.basicInfo.phone) ?? '');
      // Canonical city slug from lib/cities, never free text.
      submitFormData.append('location', formData.basicInfo.location);

      // Add password
      submitFormData.append('password', formData.security.password);

      // Add brand info
      submitFormData.append('brand_name', formData.brandInfo.brand_name);
      submitFormData.append('brand_description', formData.brandInfo.brand_description);
      
      // Add brand doc if exists
      if (formData.brandInfo.brand_doc) {
        submitFormData.append('brand_doc', formData.brandInfo.brand_doc);
      }

      const result: SignUpResponse = await signUpAction(submitFormData);
      
      if (result.success && result.redirectTo) {
        submittedRef.current = true;
        window.location.href = result.redirectTo;
      } else {
        setError(result.error || 'Terjadi kesalahan. Silakan coba lagi.');
      }
    } catch (error: any) {
      console.error('Sign up error:', error);
      setError('Terjadi kesalahan tak terduga. Silakan coba lagi.');
    } finally {
      // In `finally` so a thrown action never leaves the button permanently dead.
      setIsSigningUp(false);
    }
  };

  return (
    <div className="w-full min-h-screen py-8 px-4 sm:py-12 sm:px-6">
      <div className="w-full max-w-[580px] mx-auto">
        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_0_50px_0_rgba(0,0,0,0.1)] backdrop-blur-lg">
          <div className="px-5 py-8 sm:px-10 sm:py-12">
            <div className="mb-8 sm:mb-12">
              <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
                Buat Akun Brand
              </h1>
              <p className="mt-2 sm:mt-3 text-gray-500">
                Sudah punya akun?{" "}
                <Link href="/sign-in" className="text-blue-600 hover:text-blue-700 font-medium transition-colors">
                  Masuk di sini
                </Link>
              </p>
            </div>

            {renderStepIndicator()}

            <form
              className="space-y-6"
              // Nothing here is a native submit — every path goes through
              // handleSignUp. A native submit would navigate and wipe the form.
              onSubmit={(e) => e.preventDefault()}
              onKeyDown={handleFormKeyDown}
            >
              {currentStep === 1 && renderBasicInfo()}
              {currentStep === 2 && renderSecurity()}
              {currentStep === OPTIONAL_STEP && renderBrandInfo()}
              {currentStep === TOTAL_STEPS && renderPreview()}

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                {currentStep > 1 && (
                  <Button
                    type="button"
                    onClick={handlePrevious}
                    disabled={isSigningUp}
                    className="flex-1 h-11 bg-gray-100 hover:bg-gray-200 text-gray-700"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Sebelumnya
                  </Button>
                )}

                <Button
                  type="button"
                  onClick={currentStep === TOTAL_STEPS ? handleSignUp : handleNext}
                  // Disabled while a submission is in flight so a second click
                  // cannot create a second account.
                  disabled={isSigningUp || (currentStep === TOTAL_STEPS && !acceptedTerms)}
                  className={`flex-1 h-11 bg-gradient-to-r from-blue-600 to-blue-500
                    ${isSigningUp || (currentStep === TOTAL_STEPS && !acceptedTerms)
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:from-blue-700 hover:to-blue-600'
                    } text-white`}
                >
                  {currentStep === TOTAL_STEPS ? (
                    isSigningUp ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Membuat Akun...
                      </>
                    ) : (
                      "Buat Akun"
                    )
                  ) : (
                    <>
                      Lanjut
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>

              {/* Explicit escape hatch out of the optional step. */}
              {currentStep === OPTIONAL_STEP && (
                <button
                  type="button"
                  onClick={() => setCurrentStep(TOTAL_STEPS)}
                  className="w-full text-center text-sm text-gray-500 underline underline-offset-2 hover:text-gray-700"
                >
                  Lewati — lengkapi nanti
                </button>
              )}

              <FormMessage message={searchParams} />
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
