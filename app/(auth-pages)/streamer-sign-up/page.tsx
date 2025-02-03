"use client";

import { streamerSignUpAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Info, ArrowLeft, ArrowRight, Youtube, HelpCircle } from 'lucide-react';
import { StreamerCard, Streamer } from "@/components/streamer-card";
import { motion } from "framer-motion";
import { Checkbox } from "@/components/ui/checkbox";
import { SignUpResponse } from "@/app/types/auth";
import { createClient } from "@/utils/supabase/client";

const platforms = ["TikTok", "Shopee"];
const categories = ["Fashion", "Technology", "Beauty", "Gaming", "Cooking", "Fitness", "Music", "Others"];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface GalleryImage {
  file: File;
  preview: string;
}

interface FormData {
  basicInfo: {
    first_name: string;
    last_name: string;
    email: string;
    city: string;
    full_address: string;
  };
  security: {
    password: string;
    confirm_password: string;
  };
  profile: {
    image: File | null;
    platforms: string[];
    categories: string[];
    price: string;
    bio: string;
    video_url: string;
    gallery: GalleryImage[];
    gender: string;
    experience: string;
    age: string;
  };
}

export default function StreamerSignUp({ searchParams }: { searchParams: Message }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    basicInfo: {
      first_name: '',
      last_name: '',
      email: '',
      city: '',
      full_address: '',
    },
    security: {
      password: '',
      confirm_password: '',
    },
    profile: {
      image: null,
      platforms: [],
      categories: [],
      price: '',
      bio: '',
      video_url: '',
      gallery: [],
      gender: '',
      experience: '',
      age: '',
    }
  });

  // Keep existing state variables that are still needed
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

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
      case 1: // Basic Info
        const { first_name, last_name, email, city, full_address } = formData.basicInfo;
        if (!first_name || !last_name || !email || !city || !full_address) {
          setError('Please fill in all required fields');
          return false;
        }
        if (!email.includes('@')) {
          setError('Please enter a valid email address');
          return false;
        }
        break;
        
      case 2: // Security
        const { password, confirm_password } = formData.security;
        if (!password || !confirm_password) {
          setError('Please fill in all required fields');
          return false;
        }
        if (password !== confirm_password) {
          setError('Passwords do not match');
          return false;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters long');
          return false;
        }
        break;
        
      case 3: // Profile
        const { image, platforms, categories, price, gender, age, experience } = formData.profile;
        if (!image) {
          setError('Please upload a profile image');
          return false;
        }
        if (platforms.length === 0) {
          setError('Please select at least one platform');
          return false;
        }
        if (categories.length === 0) {
          setError('Please select at least one category');
          return false;
        }
        if (!price) {
          setError('Please enter your price per hour');
          return false;
        }
        if (!gender) {
          setError('Please select your gender');
          return false;
        }
        if (!age) {
          setError('Please enter your age');
          return false;
        }
        const ageNum = parseInt(age);
        if (isNaN(ageNum) || ageNum < 18 || ageNum > 100) {
          setError('Please enter a valid age between 18 and 100');
          return false;
        }
        if (!experience) {
          setError('Please select your experience level');
          return false;
        }
        break;

      case 4: // Video
        // Remove video validation - making it optional
        break;

      case 5: // Gallery
        // Remove gallery validation - making it optional
        break;
    }
    
    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 6));
    }
  };

  const handlePrevious = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const validateFile = (file: File, type: 'image' | 'gallery'): string | null => {
    if (!file || file.size === 0) {
      return type === 'image' ? 'Please select a profile image' : null;
    }
    
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return 'Only JPG, PNG and WebP images are allowed';
    }
    
    if (file.size > MAX_FILE_SIZE) {
      return 'File size should not exceed 5MB';
    }
    
    return null;
  };

  const handleSignUp = async () => {
    try {
      setError(null);
      setIsSigningUp(true);

      const supabase = createClient();
      const submitFormData = new FormData();

      // Add basic info
      submitFormData.append('first_name', formData.basicInfo.first_name);
      submitFormData.append('last_name', formData.basicInfo.last_name);
      submitFormData.append('email', formData.basicInfo.email);
      submitFormData.append('city', formData.basicInfo.city);
      submitFormData.append('full_address', formData.basicInfo.full_address);

      // Add security info
      submitFormData.append('password', formData.security.password);

      // Handle profile image upload to Supabase storage
      if (formData.profile.image) {
        const profileImageFile = formData.profile.image;
        submitFormData.append('image', profileImageFile);
      }

      // Handle gallery photos
      formData.profile.gallery.forEach(item => {
        submitFormData.append('gallery', item.file);
      });

      // Add platforms
      formData.profile.platforms.forEach(platform => {
        submitFormData.append('platforms', platform);
      });

      // Add categories
      formData.profile.categories.forEach(category => {
        submitFormData.append('categories', category);
      });

      // Add other profile fields
      submitFormData.append('price', formData.profile.price.replace(/\./g, ''));
      submitFormData.append('bio', formData.profile.bio);
      submitFormData.append('video_url', formData.profile.video_url);
      submitFormData.append('gender', formData.profile.gender);
      submitFormData.append('age', formData.profile.age);
      submitFormData.append('experience', formData.profile.experience);

      const result: SignUpResponse = await streamerSignUpAction(submitFormData);
      
      if (result.success && result.redirectTo) {
        window.location.href = result.redirectTo;
      } else {
        setError(result.error || 'An unexpected error occurred');
      }
    } catch (error: any) {
      console.error('Sign up error:', error);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSigningUp(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGalleryImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const remainingSlots = 5 - formData.profile.gallery.length;
    if (remainingSlots <= 0) {
      setError('Maximum 5 photos allowed');
      return;
    }

    const newFiles = Array.from(files).slice(0, remainingSlots);
    
    newFiles.forEach(file => {
      if (file.size > MAX_FILE_SIZE) {
        setError('Each file must be less than 5MB');
        return;
      }

      if (!['image/jpeg', 'image/png'].includes(file.type)) {
        setError('Only JPG and PNG files are allowed');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          profile: {
            ...prev.profile,
            gallery: [
              ...prev.profile.gallery,
              {
                file: file,
                preview: reader.result as string
              }
            ]
          }
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const formatPrice = (value: string) => {
    const numericValue = value.replace(/\D/g, '');
    return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\D/g, '');
    const formattedValue = formatPrice(rawValue);
    updateFormData('profile', 'price', formattedValue);
  };

  const getYouTubeVideoId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const renderStepIndicator = () => {
    return (
      <div className="flex items-center justify-between mb-10 px-2 max-w-full overflow-x-auto no-scrollbar">
        <div className="flex items-center min-w-full">
          {[1, 2, 3, 4, 5, 6].map((step) => (
            <div key={step} className="flex items-center flex-1">
              <div
                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200 ${
                  step === currentStep
                    ? 'bg-blue-600 text-white'
                    : step < currentStep
                    ? 'bg-blue-50 text-blue-600 border-2 border-blue-200'
                    : 'bg-gray-50 text-gray-400 border-2 border-gray-200'
                }`}
              >
                {step < currentStep ? '✓' : step}
              </div>
              {step < 6 && (
                <div
                  className={`h-0.5 flex-1 mx-1 sm:mx-2 transition-colors duration-200 ${
                    step < currentStep ? 'bg-blue-200' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const handleCityInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Capitalize each word
    const value = e.target.value.replace(/\b\w/g, (c) => c.toUpperCase());
    updateFormData('basicInfo', 'city', value);
  };

  const renderBasicInfo = () => {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="first_name" className="text-gray-700 font-medium">First Name</Label>
            <Input 
              name="first_name"
              value={formData.basicInfo.first_name}
              onChange={(e) => updateFormData('basicInfo', 'first_name', e.target.value)}
              placeholder="John" 
              required 
              className="h-12 bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500
                transition-all duration-200 text-base rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name" className="text-gray-700 font-medium">Last Name</Label>
            <Input 
              name="last_name"
              value={formData.basicInfo.last_name}
              onChange={(e) => updateFormData('basicInfo', 'last_name', e.target.value)}
              placeholder="Smith" 
              required 
              className="h-12 bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500
                transition-all duration-200 text-base rounded-xl"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-gray-700 font-medium">Email Address</Label>
          <Input 
            name="email"
            type="email"
            value={formData.basicInfo.email}
            onChange={(e) => updateFormData('basicInfo', 'email', e.target.value)}
            placeholder="you@example.com" 
            required 
            className="h-12 bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500
              transition-all duration-200 text-base rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="city" className="text-gray-700 font-medium">City</Label>
          <Input 
            name="city"
            type="text"
            value={formData.basicInfo.city}
            onChange={handleCityInput}
            placeholder="e.g. Jakarta" 
            required 
            className="h-12 bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500
              transition-all duration-200 text-base rounded-xl"
          />
          <p className="text-sm text-gray-500 mt-2">
            Examples: Jakarta, Bandung, Surabaya
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="full_address" className="text-gray-700 font-medium">Full Address</Label>
          <Textarea 
            name="full_address"
            value={formData.basicInfo.full_address}
            onChange={(e) => updateFormData('basicInfo', 'full_address', e.target.value)}
            placeholder="Enter your complete address" 
            required
            className="min-h-[100px] bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500
              transition-all duration-200 text-base rounded-xl resize-none"
          />
          <p className="text-sm text-gray-500 mt-2">
            Required for product delivery from brands
          </p>
        </div>
      </div>
    );
  };

  const renderSecurity = () => {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <Label htmlFor="password" className="text-gray-700 font-medium">Password</Label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              name="password"
              value={formData.security.password}
              onChange={(e) => updateFormData('security', 'password', e.target.value)}
              placeholder="Create a secure password"
              minLength={6}
              required
              className="h-12 bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500
                transition-all duration-200 text-base rounded-xl pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 
                hover:text-gray-700 transition-colors"
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
          <Label htmlFor="confirm_password" className="text-gray-700 font-medium">Confirm Password</Label>
          <div className="relative">
            <Input
              type={showConfirmPassword ? "text" : "password"}
              name="confirm_password"
              value={formData.security.confirm_password}
              onChange={(e) => updateFormData('security', 'confirm_password', e.target.value)}
              placeholder="Confirm your password"
              minLength={6}
              required
              className="h-12 bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500
                transition-all duration-200 text-base rounded-xl pr-12"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 
                hover:text-gray-700 transition-colors"
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

        <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
          <h4 className="font-medium text-blue-800 mb-2">Password Requirements:</h4>
          <ul className="space-y-1 text-sm text-blue-700">
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              Minimum 6 characters
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              Mix of letters and numbers recommended
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              Special characters add extra security
            </li>
          </ul>
        </div>
      </div>
    );
  };

  const renderProfile = () => {
    return (
      <div className="space-y-10">
        {/* Profile Image Upload */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-gray-700 font-medium">Profile Photo</Label>
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-500" />
              Upload your best professional photo (4:5 ratio recommended)
            </p>
          </div>

          <div 
            onClick={() => fileInputRef.current?.click()}
            className="relative cursor-pointer group"
          >
            <div className={`
              w-full max-w-[240px] mx-auto overflow-hidden border-2 rounded-2xl
              transition-all duration-300 relative
              ${imagePreview 
                ? 'border-transparent shadow-xl' 
                : 'border-dashed border-gray-300 hover:border-blue-500 hover:bg-blue-50/50'
              }
            `}>
              <div className="pb-[125%] relative"> {/* This creates the 4:5 ratio container */}
                {imagePreview ? (
                  <Image 
                    src={imagePreview} 
                    alt="Profile preview" 
                    fill
                    className="object-cover absolute inset-0" 
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="p-4 rounded-full bg-blue-50 mb-3 group-hover:bg-blue-100 transition-colors">
                      <svg 
                        className="w-8 h-8 text-blue-600" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={1.5} 
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
                        />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-600 group-hover:text-blue-600 transition-colors">
                      Upload Photo
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Click to choose a file
                    </p>
                  </div>
                )}
              </div>
            </div>

            {imagePreview && (
              <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center">
                <p className="text-white font-medium">Change Photo</p>
              </div>
            )}
          </div>

          <input
            id="image"
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              handleImageChange(e);
              if (e.target.files?.[0]) {
                updateFormData('profile', 'image', e.target.files[0]);
              }
            }}
            ref={fileInputRef}
            className="hidden"
            required
          />
        </div>

        {/* Personal Information */}
        <div className="space-y-6">
          {/* Gender */}
          <div className="space-y-2">
            <Label htmlFor="gender" className="text-gray-700 font-medium">Gender</Label>
            <Select
              value={formData.profile.gender}
              onValueChange={(value) => updateFormData('profile', 'gender', value)}
            >
              <SelectTrigger id="gender" className="h-12 bg-gray-50 border-gray-200 focus:ring-blue-500 focus:border-blue-500 rounded-xl">
                <SelectValue placeholder="Select your gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Prefer not to say</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Age */}
          <div className="space-y-2">
            <Label htmlFor="age" className="text-gray-700 font-medium">Age</Label>
            <Input
              type="number"
              name="age"
              value={formData.profile.age}
              onChange={(e) => updateFormData('profile', 'age', e.target.value)}
              min="18"
              max="100"
              placeholder="Enter your age"
              className="h-12 bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500
                transition-all duration-200 text-base rounded-xl"
            />
          </div>

          {/* Experience */}
          <div className="space-y-2">
            <Label htmlFor="experience" className="text-gray-700 font-medium">Live Streaming Experience</Label>
            <Select
              value={formData.profile.experience}
              onValueChange={(value) => updateFormData('profile', 'experience', value)}
            >
              <SelectTrigger id="experience" className="h-12 bg-gray-50 border-gray-200 focus:ring-blue-500 focus:border-blue-500 rounded-xl">
                <SelectValue placeholder="Select your experience level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="beginner">Beginner (less than 1 year)</SelectItem>
                <SelectItem value="intermediate">Intermediate (1-3 years)</SelectItem>
                <SelectItem value="advanced">Advanced (3+ years)</SelectItem>
                <SelectItem value="expert">Expert (5+ years)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Platform Selection */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-gray-700 font-medium">Platforms</Label>
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-500" />
              Select the platforms where you actively stream
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {platforms.map((platform) => (
              <div
                key={platform}
                onClick={() => {
                  const newPlatforms = formData.profile.platforms.includes(platform)
                    ? formData.profile.platforms.filter(p => p !== platform)
                    : [...formData.profile.platforms, platform];
                  updateFormData('profile', 'platforms', newPlatforms);
                }}
                className={`cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 
                  ${formData.profile.platforms.includes(platform)
                    ? 'border-blue-500 bg-blue-50/50 text-blue-700 shadow-sm'
                    : 'border-gray-200 hover:border-blue-500/50 hover:bg-blue-50/25'
                  }
                  group flex items-center justify-between`}
              >
                <span className="text-sm font-medium">{platform}</span>
                <div className={`
                  w-5 h-5 rounded-full border-2 transition-all duration-200 flex items-center justify-center
                  ${formData.profile.platforms.includes(platform)
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-gray-300 group-hover:border-blue-500/50'
                  }
                `}>
                  {formData.profile.platforms.includes(platform) && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Categories */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-gray-700 font-medium">Categories</Label>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-500" />
                Select up to 3 categories that match your content
              </p>
              <div className="px-3 py-1 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-700">
                  {formData.profile.categories.length}/3
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {categories.map((category) => {
              const isSelected = formData.profile.categories.includes(category);
              const isDisabled = !isSelected && formData.profile.categories.length >= 3;
              
              return (
                <div
                  key={category}
                  onClick={() => {
                    if (isDisabled) return;
                    const newCategories = isSelected
                      ? formData.profile.categories.filter(c => c !== category)
                      : [...formData.profile.categories, category];
                    updateFormData('profile', 'categories', newCategories);
                  }}
                  className={`cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 
                    ${isSelected
                      ? 'border-blue-500 bg-blue-50/50 text-blue-700 shadow-sm'
                      : isDisabled
                        ? 'border-gray-100 bg-gray-50/50 text-gray-400 cursor-not-allowed'
                        : 'border-gray-200 hover:border-blue-500/50 hover:bg-blue-50/25'
                    }
                    group flex items-center justify-between`}
                >
                  <span className="text-sm font-medium">{category}</span>
                  <div className={`
                    w-5 h-5 rounded-full border-2 transition-all duration-200 flex items-center justify-center
                    ${isSelected
                      ? 'border-blue-500 bg-blue-500'
                      : isDisabled
                        ? 'border-gray-200 bg-gray-50'
                        : 'border-gray-300 group-hover:border-blue-500/50'
                    }
                  `}>
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Tip: Choose your top 3 categories carefully as they will help brands find you for relevant collaborations
          </p>
        </div>

        {/* Price */}
        <div className="space-y-2">
          <Label htmlFor="price" className="text-gray-700 font-medium">Price (per hour)</Label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">Rp.</span>
            <Input
              name="price"
              type="text"
              inputMode="numeric"
              value={formData.profile.price}
              onChange={handlePriceChange}
              className="pl-14 h-12 bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500
                transition-all duration-200 text-base rounded-xl font-medium"
              placeholder="5.000"
              required
            />
          </div>
        </div>

        {/* Bio */}
        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor="bio" className="text-gray-700 font-medium">Bio</Label>
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-500" />
              Tell us about your streaming style and expertise
            </p>
          </div>
          <Textarea 
            name="bio"
            value={formData.profile.bio}
            onChange={(e) => updateFormData('profile', 'bio', e.target.value)}
            placeholder="Tell us about yourself and your streaming experience"
            className="min-h-[120px] bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500
              transition-all duration-200 text-base rounded-xl resize-none"
          />
          <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-sm text-gray-600 font-medium mb-2">For your safety, please DO NOT include:</p>
            <ul className="text-sm text-gray-500 space-y-1">
              <li className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-gray-400" />
                Personal contact information (phone, email, social media)
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-gray-400" />
                Full name or complete address
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-gray-400" />
                Links to external profiles or websites
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  };

  const renderVideoIntro = () => {
    return (
      <div className="space-y-8">
        {/* Video Input and Preview */}
        <div className="space-y-6 bg-white rounded-xl border border-gray-200 p-6">
          <div className="space-y-2">
            <Label className="text-gray-700 font-medium">Video Link (Optional)</Label>
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-4 h-4 text-blue-500" />
              <p className="text-sm text-gray-500">You can add or edit your introduction video later in settings</p>
            </div>
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Info className="w-4 h-4 text-gray-400" />
              Upload your video to YouTube as "Unlisted" and paste the link below
            </p>
            <div className="relative">
              <Input
                id="video_url"
                name="video_url"
                value={formData.profile.video_url}
                onChange={(e) => updateFormData('profile', 'video_url', e.target.value)}
                placeholder="e.g. https://youtube.com/watch?v=..."
                className="pl-12 h-12 border-gray-200 focus:border-gray-500 focus:ring-gray-500 rounded-xl
                  transition-all duration-200"
              />
              <Youtube className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            </div>
          </div>
          
          {formData.profile.video_url && (
            <div className="aspect-[9/16] max-w-[280px] mx-auto rounded-xl overflow-hidden border border-gray-200
              shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] bg-gray-50">
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${getYouTubeVideoId(formData.profile.video_url)}`}
                title="YouTube video preview"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
          )}
        </div>

        {/* Guidelines Section */}
        <div className="space-y-4 p-6 bg-gray-50 border border-gray-200 rounded-xl">
          <div className="flex items-center gap-3 pb-2 border-b border-gray-200">
            <div className="p-2 bg-white rounded-lg shadow-sm">
              <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Video Guidelines</h3>
              <p className="text-sm text-gray-500">Follow these specifications for best results</p>
            </div>
          </div>

          <div className="grid gap-4 text-sm">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-gray-600 text-xs font-medium">1</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Format</p>
                <p className="text-gray-600">Portrait/vertical video (9:16 ratio) like Instagram Reels</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-gray-600 text-xs font-medium">2</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Duration</p>
                <p className="text-gray-600">2-3 minutes to effectively showcase your style</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-gray-600 text-xs font-medium">3</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Content</p>
                <p className="text-gray-600">Include a brief introduction and demonstration of your streaming style</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-gray-600 text-xs font-medium">4</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Quality</p>
                <p className="text-gray-600">Good lighting and clear audio are essential</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderGallery = () => {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div>
            <h3 className="font-medium text-gray-900">Portfolio Gallery (Optional)</h3>
            <p className="text-sm text-gray-500 mt-1">
              Showcase your best content to attract more clients
            </p>
          </div>
          <div className="px-3 py-1 bg-gray-50 rounded-lg">
            <span className="text-sm font-medium text-gray-700">{formData.profile.gallery.length}/5</span>
          </div>
        </div>

        {/* Enhanced Guidelines */}
        <div className="p-4 bg-blue-50 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-blue-700">
            <Info className="w-4 h-4" />
            <span className="text-sm font-medium">Why Add a Portfolio?</span>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-blue-600">
              Increase your chances of getting hired by showcasing:
            </p>
            <ul className="grid gap-2 text-sm text-blue-600">
              <li className="flex items-start gap-2">
                <div className="w-1 h-1 rounded-full bg-blue-400 mt-2" />
                Screenshots from your previous successful livestreams
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1 h-1 rounded-full bg-blue-400 mt-2" />
                Results and achievements from past collaborations
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1 h-1 rounded-full bg-blue-400 mt-2" />
                Product presentation examples or campaign highlights
              </li>
            </ul>
            <p className="text-xs text-blue-600 mt-2">
              You can always add or update your portfolio later in settings
            </p>
          </div>
        </div>

        {/* Technical Requirements */}
        <div className="p-4 bg-gray-50 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-gray-700">
            <Info className="w-4 h-4" />
            <span className="text-sm font-medium">Photo Requirements</span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-gray-400" />
              Format: JPG, PNG
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-gray-400" />
              Max size: 5MB
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-gray-400" />
              High resolution
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-gray-400" />
              Clear, professional content
            </div>
          </div>
        </div>

        {/* Upload Area */}
        {formData.profile.gallery.length < 5 && (
          <div 
            onClick={() => galleryInputRef.current?.click()}
            className="cursor-pointer group mt-6"
          >
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-8
              hover:border-blue-300 hover:bg-blue-50/50 transition-all duration-200">
              <div className="flex flex-col items-center">
                <div className="p-4 rounded-full bg-white border border-gray-200 mb-4 
                  group-hover:border-blue-300 group-hover:bg-blue-50 transition-colors">
                  <svg 
                    className="w-6 h-6 text-gray-600 group-hover:text-blue-600" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={1.5} 
                      d="M12 4v16m8-8H4" 
                    />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-700 group-hover:text-blue-700 transition-colors">
                  Add Portfolio Photos
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Click to browse (optional)
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Gallery Preview */}
        {formData.profile.gallery.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
            {formData.profile.gallery.map((item, index) => (
              <div key={index} className="relative aspect-[4/5] group">
                <Image
                  src={item.preview}
                  alt={`Gallery photo ${index + 1}`}
                  fill
                  className="object-cover rounded-xl"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 
                  transition-opacity rounded-xl flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => removeGalleryPhoto(index)}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-lg 
                      transition-colors"
                  >
                    <svg 
                      className="w-5 h-5 text-white" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={1.5} 
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" 
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add the hidden file input for gallery */}
        <input
          type="file"
          ref={galleryInputRef}
          className="hidden"
          accept="image/jpeg,image/png"
          multiple
          onChange={handleGalleryImageChange}
        />
      </div>
    );
  };

  const renderPreview = () => {
    const previewStreamer: Streamer = {
      id: 0,
      user_id: '',
      first_name: formData.basicInfo.first_name,
      last_name: formData.basicInfo.last_name,
      platform: formData.profile.platforms[0],
      platforms: formData.profile.platforms,
      category: formData.profile.categories[0],
      categories: formData.profile.categories,
      rating: 0,
      price: parseInt(formData.profile.price.replace(/\./g, '')),
      image_url: imagePreview || '/images/default-avatar.png',
      bio: formData.profile.bio,
      location: formData.basicInfo.city,
      video_url: formData.profile.video_url,
      availableTimeSlots: [],
      gender: formData.profile.gender,
      age: parseInt(formData.profile.age),
      experience: formData.profile.experience,
    };

    return (
      <div className="space-y-8">
        {/* Preview Card Section */}
        <div className="bg-[#faf9f6] rounded-2xl p-6 border border-[#f0f0ef]">
          <div className="text-sm font-medium text-gray-600 mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Client View
          </div>
          
          <div className="max-w-sm mx-auto">
            <StreamerCard streamer={previewStreamer} />
          </div>
        </div>

        {/* Detailed Preview Section */}
        <div className="space-y-8">
          <div className="text-sm font-medium text-gray-600 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Complete Profile Details
          </div>

          <div className="grid gap-6">
            {/* Basic Information */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 space-y-4">
              <h3 className="text-sm font-medium text-gray-900 pb-2 border-b border-gray-100">
                Basic Information
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Full Name</span>
                  <p className="font-medium text-gray-900 mt-0.5">
                    {formData.basicInfo.first_name} {formData.basicInfo.last_name}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Location</span>
                  <p className="font-medium text-gray-900 mt-0.5">{formData.basicInfo.city}</p>
                </div>
                <div>
                  <span className="text-gray-500">Email</span>
                  <p className="font-medium text-gray-900 mt-0.5">{formData.basicInfo.email}</p>
                </div>
                <div>
                  <span className="text-gray-500">Gender</span>
                  <p className="font-medium text-gray-900 mt-0.5">{formData.profile.gender || 'Not specified'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Age</span>
                  <p className="font-medium text-gray-900 mt-0.5">{formData.profile.age || 'Not specified'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Experience</span>
                  <p className="font-medium text-gray-900 mt-0.5">{formData.profile.experience || 'Not specified'}</p>
                </div>
              </div>
            </div>

            {/* Streaming Details */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 space-y-4">
              <h3 className="text-sm font-medium text-gray-900 pb-2 border-b border-gray-100">
                Streaming Details
              </h3>
              <div className="space-y-4">
                <div>
                  <span className="text-sm text-gray-500">Platforms</span>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {formData.profile.platforms.map((platform) => (
                      <span key={platform} 
                        className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium">
                        {platform}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Categories</span>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {formData.profile.categories.map((category) => (
                      <span key={category} 
                        className="px-2.5 py-1 bg-gray-50 text-gray-700 rounded-lg text-sm font-medium">
                        {category}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Price per Hour</span>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    Rp. {formData.profile.price}
                  </p>
                </div>
              </div>
            </div>

            {/* Media Content */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 space-y-4">
              <h3 className="text-sm font-medium text-gray-900 pb-2 border-b border-gray-100">
                Media Content
              </h3>
              <div className="space-y-6">
                {/* Profile Photo */}
                <div>
                  <span className="text-sm text-gray-500">Profile Photo</span>
                  <div className="mt-2 relative w-24 overflow-hidden rounded-lg border border-gray-200">
                    <div className="pb-[125%] relative"> {/* This creates the 4:5 ratio container */}
                      <Image
                        src={imagePreview || '/images/default-avatar.png'}
                        alt="Profile preview"
                        fill
                        className="object-cover absolute inset-0"
                      />
                    </div>
                  </div>
                </div>

                {/* Video Preview */}
                {formData.profile.video_url && (
                  <div>
                    <span className="text-sm text-gray-500">Introduction Video</span>
                    <div className="mt-2 aspect-[9/16] max-w-[200px] rounded-lg overflow-hidden border border-gray-200">
                      <iframe
                        width="100%"
                        height="100%"
                        src={`https://www.youtube.com/embed/${getYouTubeVideoId(formData.profile.video_url)}`}
                        title="Introduction Video"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      ></iframe>
                    </div>
                  </div>
                )}

                {/* Gallery */}
                {formData.profile.gallery.length > 0 && (
                  <div>
                    <span className="text-sm text-gray-500">Gallery Photos</span>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {formData.profile.gallery.map((item, index) => (
                        <div key={index} className="relative aspect-[4/5] rounded-lg overflow-hidden border border-gray-200">
                          <Image
                            src={item.preview}
                            alt={`Gallery photo ${index + 1}`}
                            fill
                            className="object-cover"
                          />
                        </div>
                      ))}
                    </div>
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
                I agree to the{" "}
                <Link 
                  href="/terms" 
                  className="text-blue-600 hover:text-blue-700 font-medium underline"
                  target="_blank"
                >
                  Terms of Service
                </Link>
                {" "}and{" "}
                <Link 
                  href="/privacy-notice" 
                  className="text-blue-600 hover:text-blue-700 font-medium underline"
                  target="_blank"
                >
                  Privacy Policy
                </Link>
              </label>
              <p className="text-xs text-gray-500">
                By creating an account, you agree to our terms and conditions
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const removeGalleryPhoto = (index: number) => {
    setFormData(prev => ({
      ...prev,
      profile: {
        ...prev.profile,
        gallery: prev.profile.gallery.filter((_, i) => i !== index)
      }
    }));
  };

  // Add this CSS at the top of your file or in your global CSS
  const noScrollbarStyles = `
    /* Hide scrollbar for Chrome, Safari and Opera */
    .no-scrollbar::-webkit-scrollbar {
      display: none;
    }

    /* Hide scrollbar for IE, Edge and Firefox */
    .no-scrollbar {
      -ms-overflow-x: hidden;
      scrollbar-width: none;
    }
  `;

  return (
    <div className="w-full min-h-screen py-8 px-4 sm:py-12 sm:px-6">
      <style>{noScrollbarStyles}</style>
      <div className="w-full max-w-[580px] mx-auto">
        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_0_50px_0_rgba(0,0,0,0.1)] backdrop-blur-lg">
          <div className="px-5 py-8 sm:px-10 sm:py-12 overflow-y-auto">
            <div className="mb-8 sm:mb-12">
              <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
                Become a Host
              </h1>
              <p className="mt-2 sm:mt-3 text-gray-500">
                Already have an account?{" "}
                <Link href="/sign-in?type=streamer" className="text-blue-600 hover:text-blue-700 font-medium transition-colors">
                  Sign in here
                </Link>
              </p>
            </div>

            {renderStepIndicator()}

            <form className="space-y-8 sm:space-y-10">
              {currentStep === 1 && renderBasicInfo()}
              {currentStep === 2 && renderSecurity()}
              {currentStep === 3 && renderProfile()}
              {currentStep === 4 && renderVideoIntro()}
              {currentStep === 5 && renderGallery()}
              {currentStep === 6 && renderPreview()}

              {error && (
                <div className="p-3 sm:p-4 rounded-xl bg-red-50 border border-red-100">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="flex gap-3 sm:gap-4 pt-4">
                {currentStep > 1 && (
                  <Button
                    type="button"
                    onClick={handlePrevious}
                    className="flex-1 h-11 sm:h-12 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 
                      transition-all duration-200 hover:shadow-md text-sm sm:text-base"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Previous
                  </Button>
                )}
                
                <Button
                  type="button"
                  onClick={currentStep === 6 ? handleSignUp : handleNext}
                  disabled={currentStep === 6 && !acceptedTerms}
                  className={`flex-1 h-11 sm:h-12 bg-gradient-to-r from-blue-600 to-blue-700
                    hover:from-blue-700 hover:to-blue-800 transition-all duration-200
                    ${currentStep === 6 && !acceptedTerms 
                      ? 'opacity-50 cursor-not-allowed' 
                      : 'hover:shadow-lg hover:shadow-blue-100'
                    } text-white font-medium tracking-wide text-sm sm:text-base`}
                >
                  {currentStep === 6 ? (
                    isSigningUp ? "Creating Account..." : "Create Account"
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>

              <FormMessage message={searchParams} />
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}