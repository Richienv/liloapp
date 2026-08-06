"use client";

import { useState, useEffect, useRef, Suspense } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateUserProfile, updateStreamerProfile, updateStreamerPrice } from "@/app/actions";
import { createClient } from "@/utils/supabase/client";
import Image from 'next/image';
import { Loader2, User, Mail, FileText, Camera, Youtube, AlertCircle, ChevronLeft, Upload, MapPin, AlertTriangle, DollarSign, XCircle, Monitor, ImageIcon, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { Toaster } from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB in bytes

// First, let's define the response types at the top of the file
interface BaseResponse {
  success: boolean;
  error?: string;
}

interface StreamerProfileResponse extends BaseResponse {
  imageUrl?: string;
}

interface UserProfileResponse extends BaseResponse {
  profilePictureUrl?: string;
}

// Update the type guard to handle error cases
function isStreamerResponse(
  response: StreamerProfileResponse | UserProfileResponse | { error: string }
): response is StreamerProfileResponse {
  return 'success' in response && !('profilePictureUrl' in response);
}

// Update the type for the updateUserProfile function response
type UpdateProfileResponse = {
  success: boolean;
  error?: string;
  imageUrl?: string;
  profilePictureUrl?: string;
};

// First, add proper interfaces for the data types
interface StreamerProfile {
  first_name: string;
  last_name: string;
  profile_picture_url: string | null;
  location: string;
  platform: string;
  category: string;
  price: number;
  video_url: string | null;
  bio: string | null;
  gallery_photos: string[];
  image_url: string | null;
}

interface UserProfile {
  first_name: string;
  last_name: string;
  profile_picture_url: string | null;
  location: string;
  brand_guidelines_url: string | null;
}

// Add these interfaces at the top of the file
interface StreamerData {
  first_name: string;
  last_name: string;
  profile_picture_url: string | null;
  location: string;
  platform: string;
  category: string;
  price: number;
  video_url: string | null;
  bio: string | null;
  gallery_photos: string[];
  image_url: string | null;
}

interface UserData {
  first_name: string;
  last_name: string;
  profile_picture_url: string | null;
  location: string;
  brand_guidelines_url: string | null;
}

// Add these interfaces to your existing interfaces
interface PriceUpdateResponse {
  success: boolean;
  message?: string;
  current_price: number;
  previous_price: number | null;
  discount_percentage: number | null;
}

// First, add this interface for the streamer data that includes the id
interface StreamerWithId extends StreamerData {
  id: number;
}

// Add this interface for the price limits
interface PriceLimits {
  minPrice: number;
  maxPrice: number;
}

// Add this interface at the top of the file
interface PriceUpdateResult {
  success: boolean;
  message?: string;
  error?: string;
  current_price: number;
  previous_price: number | null;
  discount_percentage: number | null;
}

// Add new interface for gallery photos
interface GalleryPhoto {
  id?: string;
  url: string;
  isNew: boolean;
  file?: File;
}

// Create a separate component for the settings content
function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = searchParams?.get('type') || 'client';
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [bio, setBio] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState('');
  const [userType, setUserType] = useState<'streamer' | 'client' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(false); // New state for loading
  const [location, setLocation] = useState("");
  const [newBrandGuideline, setNewBrandGuideline] = useState<File | null>(null);
  const [brandGuidelineUrl, setBrandGuidelineUrl] = useState("");
  const [brandGuidelineError, setBrandGuidelineError] = useState("");
  const [youtubeVideoUrl, setYoutubeVideoUrl] = useState('');
  const [galleryError, setGalleryError] = useState('');
  const maxGalleryPhotos = 5;
  const [platform, setPlatform] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<string | null>(null);
  const [nextAvailableUpdate, setNextAvailableUpdate] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string>('');
  const [newPrice, setNewPrice] = useState<string>('');
  const [streamerId, setStreamerId] = useState<number | null>(null);
  const [previousPrice, setPreviousPrice] = useState<number | null>(null);
  const [discountPercentage, setDiscountPercentage] = useState<number | null>(null);
  const [brandName, setBrandName] = useState('');
  // Add new state variables for gender, age, and experience
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [experience, setExperience] = useState('');
  const [category, setCategory] = useState('');
  const [fullAddress, setFullAddress] = useState('');

  // Move fetchUserData outside of useEffect
  const fetchUserData = async () => {
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        console.error('Authentication error:', authError);
        router.push('/sign-in');
        return;
      }

      // First, get the user type
      const { data: userTypeData, error: userTypeError } = await supabase
        .from('users')
        .select('user_type')
        .eq('id', user.id)
        .single();

      if (userTypeError) {
        console.error('Error fetching user type:', userTypeError);
        return;
      }

      setUserType(userTypeData.user_type);

      // If user is a streamer and type param is streamer, fetch streamer data
      if (userTypeData.user_type === 'streamer' && type === 'streamer') {
        const { data: streamerData, error: streamerError } = await supabase
          .from('streamers')
          .select(`
            id,
            *,
            streamer_price_history (
              previous_price,
              new_price,
              effective_from
            )
          `)
          .eq('user_id', user.id)
          .single();

        if (streamerError) {
          console.error('Error fetching streamer data:', streamerError);
          return;
        }

        if (streamerData) {
          setStreamerId(streamerData.id);
          setPrice(streamerData.price);
          
          // Get current discount info
          const { data: discountData } = await supabase
            .from('streamer_current_discounts')
            .select('*')
            .eq('streamer_id', streamerData.id)
            .single();

          if (discountData) {
            setPreviousPrice(discountData.previous_price);
            setDiscountPercentage(discountData.discount_percentage);
          }
          
          // Update streamer form fields
          setPlatform(streamerData.platform || '');
          setFirstName(streamerData.first_name || '');
          setLastName(streamerData.last_name || '');
          setLocation(streamerData.location || '');
          setYoutubeVideoUrl(streamerData.video_url || '');
          setImageUrl(streamerData.image_url || '');
          setBio(streamerData.bio || '');
          setLastPriceUpdate(streamerData.last_price_update);
          // Add new fields
          setGender(streamerData.gender || '');
          setAge(streamerData.age?.toString() || '');
          setExperience(streamerData.experience || '');
          setCategory(streamerData.category || '');
          setFullAddress(streamerData.full_address || '');

          // Calculate next available update time if last_price_update exists
          if (streamerData.last_price_update) {
            const nextUpdate = new Date(streamerData.last_price_update);
            nextUpdate.setHours(nextUpdate.getHours() + 24);
            setNextAvailableUpdate(nextUpdate.toISOString());
          }

          // Fetch gallery photos
          const { data: galleryData } = await supabase
            .from('streamer_gallery_photos')
            .select('id, photo_url')
            .eq('streamer_id', streamerData.id)
            .order('order_number');

          setGalleryPhotos(
            galleryData?.map(item => ({
              id: item.id,
              url: item.photo_url,
              isNew: false
            })) || []
          );
        }
      } else {
        // Regular user data fetch for clients
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select(`
            first_name,
            last_name,
            profile_picture_url,
            location,
            brand_name,
            brand_guidelines_url
          `)
          .eq('id', user.id)
          .single();

        if (userError) {
          console.error('Error fetching user data:', userError);
          toast.error('Failed to fetch user data');
          return;
        }

        if (userData) {
          setFirstName(userData.first_name || '');
          setLastName(userData.last_name || '');
          setLocation(userData.location || '');
          setBrandName(userData.brand_name || '');
          setBrandGuidelineUrl(userData.brand_guidelines_url || '');
          setImageUrl(userData.profile_picture_url || '');
        }
      }
    } catch (error) {
      console.error('Error in fetchUserData:', error);
      toast.error('Failed to fetch profile data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserData();
  }, [router, type]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('firstName', firstName);
      formData.append('lastName', lastName);
      formData.append('location', location);

      if (selectedImage) {
        formData.append('image', selectedImage);
      }

      if (type === 'streamer') {
        // Handle streamer-specific updates
        formData.append('platform', platform);
        formData.append('youtubeVideoUrl', youtubeVideoUrl);
        formData.append('bio', bio);
        formData.append('category', category);
        formData.append('fullAddress', fullAddress);
        
        galleryPhotos.forEach(photo => {
          if (photo.isNew && photo.file) {
            formData.append('gallery', photo.file);
          }
        });
        
        formData.append('existingGalleryPhotos', JSON.stringify(
          galleryPhotos
            .filter(photo => !photo.isNew)
            .map(photo => photo.url)
        ));

        // Add new fields
        formData.append('gender', gender);
        formData.append('age', age);
        formData.append('experience', experience);

        // Only update price if it has been changed
        if (newPrice) {
          const priceUpdateResult = await handlePriceUpdate(price);
          // If price update failed, return early and don't update other profile info
          if (!priceUpdateResult?.success) {
            setIsLoading(false);
            return;
          }
        }

        console.log('Submitting streamer profile update with data:', {
          firstName,
          lastName,
          location,
          platform,
          youtubeVideoUrl,
          bio,
          category,
          fullAddress,
          gender,
          age,
          experience
        });

        const result = await updateStreamerProfile(formData);
        if ('error' in result && result.error) {
          throw new Error(result.error);
        }

        // Update local state to reflect changes
        setBio(formData.get('bio') as string);
        setPlatform(formData.get('platform') as string);
        setCategory(formData.get('category') as string);
        setFullAddress(formData.get('fullAddress') as string);

        toast.success('Profile berhasil diupdate');
        await fetchUserData(); // Refresh the data
      } else {
        // Handle client-specific updates
        formData.append('brandName', brandName);
        if (newBrandGuideline) {
          formData.append('brandGuidelines', newBrandGuideline);
        }

        const result = await updateUserProfile(formData);
        if ('error' in result && result.error) {
          throw new Error(result.error);
        }
      }

    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Gagal mengupdate profile: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        setImageError('Image size exceeds 1MB. Please choose a smaller image.');
        return;
      }

      // Just set the File directly, no need for Blob conversion
      setSelectedImage(file);
      // Create preview URL
      const preview = URL.createObjectURL(file);
      setPreviewUrl(preview);
      setImageError('');
    }
  };

  const handleGalleryPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const remainingSlots = maxGalleryPhotos - galleryPhotos.length;
      if (remainingSlots <= 0) {
        setGalleryError(`Maximum ${maxGalleryPhotos} photos allowed`);
        return;
      }

      const newPhotos = Array.from(files).slice(0, remainingSlots);
      setGalleryPhotos(prev => [
        ...prev,
        ...newPhotos.map(file => ({
          url: URL.createObjectURL(file),
          isNew: true,
          file: file
        }))
      ]);
      setGalleryError('');
    }
  };

  const removeGalleryPhoto = (index: number) => {
    setGalleryPhotos(prev => {
      const photo = prev[index];
      if (photo.isNew && photo.url) {
        URL.revokeObjectURL(photo.url);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleBackNavigation = () => {
    if (userType === 'streamer') {
      router.push('/streamer-dashboard');
    } else {
      router.push('/protected');
    }
  };

  const handleBrandGuidelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setBrandGuidelineError('File size should not exceed 5MB');
        return;
      }
      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedTypes.includes(file.type)) {
        setBrandGuidelineError('Only PDF and DOC/DOCX files are allowed');
        return;
      }
      setNewBrandGuideline(file);
      setBrandGuidelineError('');
    }
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, ''); // Only allow numbers
    setNewPrice(value);
    setPriceError('');
  };

  const handlePriceUpdate = async (currentPrice?: number) => {
    if (!newPrice || !streamerId) {
      setPriceError('Silakan masukkan harga yang valid');
      return { success: false };
    }

    try {
      const result = await updateStreamerPrice(streamerId, Number(newPrice)) as PriceUpdateResult;
      
      if (result.success) {
        // Update state without showing toast
        setPrice(result.current_price);
        setPreviousPrice(result.previous_price);
        setDiscountPercentage(result.discount_percentage);
        setLastPriceUpdate(new Date().toISOString());
        setNewPrice('');
        await fetchUserData();
        toast.success('Harga berhasil diperbarui');
        return { success: true };
      } else {
        const errorMessage = result.error || 'Gagal mengubah harga';
        setPriceError(errorMessage);
        
        // Check for specific error types and show appropriate messages
        if (errorMessage.includes('24 hours')) {
          const nextUpdate = nextAvailableUpdate ? format(new Date(nextAvailableUpdate), 'HH:mm, dd MMMM yyyy') : 'besok';
          toast.error(`Kamu sudah mengubah harga hari ini. Silakan coba lagi pada ${nextUpdate} WIB`);
        } else if (errorMessage.includes('25%')) {
          const minPrice = calculatePriceLimits(price).minPrice;
          const maxPrice = calculatePriceLimits(price).maxPrice;
          toast.error(`Perubahan harga maksimal 25%: Rp ${minPrice.toLocaleString('id-ID')} - Rp ${maxPrice.toLocaleString('id-ID')}`);
        } else {
          toast.error('Gagal mengubah harga. Silakan coba lagi.');
        }
        return { success: false };
      }
    } catch (error) {
      console.error('Error updating price:', error);
      setPriceError('Gagal mengubah harga');
      toast.error('Gagal mengubah harga. Silakan coba lagi.');
      return { success: false };
    }
  };

  // Add this near your other utility functions
  const calculatePriceWithPlatformFee = (basePrice: number): number => {
    const platformFeePercentage = 30;
    return basePrice * (1 + platformFeePercentage / 100);
  };

  // Update the price error messages
  const getPriceErrorMessage = (errorMessage: string) => {
    switch (errorMessage) {
      case 'Price can only be updated once every 24 hours':
        const nextUpdateTime = nextAvailableUpdate ? format(new Date(nextAvailableUpdate), 'HH:mm') : '';
        const nextUpdateDate = nextAvailableUpdate ? format(new Date(nextAvailableUpdate), 'dd MMMM yyyy') : '';
        return `Kamu sudah mengubah harga hari ini. Perubahan harga berikutnya dapat dilakukan besok pada ${nextUpdateTime} WIB, ${nextUpdateDate}`;
      case 'Price change cannot exceed 25%':
        const minPrice = calculatePriceLimits(price).minPrice;
        const maxPrice = calculatePriceLimits(price).maxPrice;
        return `Perubahan harga tidak boleh lebih dari 25%. Untuk harga saat ini (Rp ${price.toLocaleString('id-ID')}), batas perubahan adalah: Rp ${minPrice.toLocaleString('id-ID')} - Rp ${maxPrice.toLocaleString('id-ID')}`;
      default:
        return 'Gagal mengubah harga. Silakan coba lagi.';
    }
  };

  // Add this function to help debug price updates
  const debugPriceHistory = async (streamerId: number): Promise<void> => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('streamer_price_history')
      .select('*')
      .eq('streamer_id', streamerId)
      .order('created_at', { ascending: false });

    console.log('Price History:', data, 'Error:', error);
  };

  // Update the calculatePriceLimits function
  const calculatePriceLimits = (currentPrice: number): PriceLimits => {
    const minPrice = Math.ceil(currentPrice * 0.75); // Maximum 25% reduction
    const maxPrice = Math.ceil(currentPrice * 1.25); // Maximum 25% increase
    return { minPrice, maxPrice };
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <Toaster position="top-center" />
      <div className="flex items-center mb-8">
        <Button 
          onClick={handleBackNavigation} 
          variant="outline" 
          size="sm" 
          className="mr-4 border-blue-600 text-blue-600 hover:bg-blue-50"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <h1 className="text-2xl sm:text-3xl font-semibold text-ink">
          {type === 'streamer' ? 'Pengaturan Streamer' : 'Pengaturan Client'}
        </h1>
      </div>

      <Card className="border-0 bg-[#faf9f6]">
        <CardHeader className="border-b border-hairline bg-surface-tint py-8">
          <CardTitle className="text-xl sm:text-2xl font-semibold text-ink">Pengaturan Profil</CardTitle>
        </CardHeader>
        <CardContent className="p-8">
          {loading ? (
            <div className="flex justify-center items-center h-[60vh]">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Profile Picture Section */}
              <div className="flex flex-col items-center mb-10">
                <div className="relative w-32 h-32 sm:w-40 sm:h-40 mb-4">
                  {(previewUrl || imageUrl) ? (
                    <Image
                      src={previewUrl || imageUrl || ''}
                      alt="Profile"
                      width={160}
                      height={160}
                      className="w-full h-full rounded-full object-cover border-4 border-blue-100"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full bg-blue-50 rounded-full flex items-center justify-center border-4 border-blue-100">
                      <User className="h-16 w-16 text-blue-400" />
                    </div>
                  )}
                </div>
                <Button 
                  type="button" 
                  onClick={handleImageClick} 
                  className="mt-3 bg-brand hover:bg-brand-hover text-white px-6"
                >
                  <Camera className="mr-2 h-4 w-4" />
                  {imageUrl ? 'Ganti Foto Profil' : 'Upload Foto Profil'}
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  className="hidden"
                  accept="image/*"
                />
                {imageError && (
                  <p className="text-red-500 text-sm mt-2 flex items-center">
                    <AlertCircle className="mr-1 h-4 w-4" />
                    {imageError}
                  </p>
                )}
              </div>

              {type === 'streamer' && (
                <>
                  {/* Pricing Card - Enhanced with rules and warnings */}
                  <Card className="border border-[#E23744]/20 mb-8 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-[#E23744]" />
                    <Collapsible defaultOpen>
                      <CollapsibleTrigger className="w-full">
                        <CardHeader className="bg-surface hover:bg-surface-tint transition-colors">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg font-semibold flex items-center gap-2">
                              <DollarSign className="h-5 w-5 text-[#E23744]" />
                              Pengaturan Harga
                            </CardTitle>
                            <ChevronDown className="h-5 w-5 text-ink-soft transition-transform duration-200 ui-expanded:rotate-180" />
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="p-6 space-y-6">
                          <div className="relative">
                            <Input
                              id="price"
                              type="text"
                              value={newPrice}
                              onChange={handlePriceChange}
                              placeholder={price ? price.toString() : "Masukkan harga baru"}
                              className="pl-12 h-11 text-base sm:text-lg"
                            />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft text-base sm:text-lg">
                              Rp.
                            </span>
                          </div>

                          {/* Price Rules and Guidelines */}
                          <div className="flex items-start gap-2 p-4 sm:p-5 bg-[#E23744]/5 rounded-panel border border-[#E23744]/10">
                            <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-[#E23744] flex-shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-ink">Peraturan Perubahan Harga:</p>
                              <ul className="text-xs sm:text-sm text-ink-muted list-disc pl-4 space-y-1">
                                <li>Perubahan harga dibatasi maksimal <strong>25%</strong> naik atau turun per hari</li>
                                <li>Harga yang dilihat client akan otomatis ditambah <strong>30%</strong> sebagai biaya layanan platform</li>
                                <li>Perubahan harga hanya dapat dilakukan <strong>1 kali dalam 24 jam</strong></li>
                              </ul>
                            </div>
                          </div>

                          {/* Price Limits Display */}
                          {price > 0 && (
                            <div className="grid grid-cols-2 gap-4">
                              <div className="bg-[#E23744]/5 rounded-panel p-4 border border-[#E23744]/10">
                                <p className="text-sm text-ink-muted mb-1">Minimum</p>
                                <p className="text-base font-semibold text-ink">
                                  Rp {calculatePriceLimits(price).minPrice.toLocaleString('id-ID')}
                                </p>
                              </div>
                              <div className="bg-[#E23744]/5 rounded-panel p-4 border border-[#E23744]/10">
                                <p className="text-sm text-ink-muted mb-1">Maximum</p>
                                <p className="text-base font-semibold text-ink">
                                  Rp {calculatePriceLimits(price).maxPrice.toLocaleString('id-ID')}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Final Price Display */}
                          <div className="bg-[#E23744]/10 rounded-panel p-4 border border-[#E23744]/20">
                            <p className="text-sm font-medium text-ink mb-1">
                              Harga Yang Dilihat Client:
                            </p>
                            <p className="text-xl font-bold text-[#E23744]">
                              Rp {Math.round(calculatePriceWithPlatformFee(price)).toLocaleString('id-ID')} / jam
                            </p>
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>

                  {/* Personal Information Card */}
                  <Card className="border border-hairline-input mb-8">
                    <Collapsible>
                      <CollapsibleTrigger className="w-full">
                        <CardHeader className="bg-surface hover:bg-surface-tint transition-colors">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg font-semibold flex items-center gap-2">
                              <User className="h-5 w-5 text-ink-muted" />
                              Informasi Pribadi
                            </CardTitle>
                            <ChevronDown className="h-5 w-5 text-ink-soft transition-transform duration-200 ui-expanded:rotate-180" />
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="p-6">
                          <div className="grid gap-6">
                            <div className="grid sm:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="firstName">Nama Depan</Label>
                                <Input
                                  id="firstName"
                                  value={firstName}
                                  onChange={(e) => setFirstName(e.target.value)}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="lastName">Nama Belakang</Label>
                                <Input
                                  id="lastName"
                                  value={lastName}
                                  onChange={(e) => setLastName(e.target.value)}
                                />
                              </div>
                            </div>
                            <div className="grid sm:grid-cols-3 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="gender">Gender</Label>
                                <Select value={gender} onValueChange={setGender}>
                                  <SelectTrigger id="gender">
                                    <SelectValue placeholder="Pilih gender" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="male">Laki-laki</SelectItem>
                                    <SelectItem value="female">Perempuan</SelectItem>
                                    <SelectItem value="other">Prefer not to say</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="age">Umur</Label>
                                <Input
                                  id="age"
                                  type="number"
                                  min="18"
                                  max="100"
                                  value={age}
                                  onChange={(e) => setAge(e.target.value)}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="experience">Pengalaman</Label>
                                <Select value={experience} onValueChange={setExperience}>
                                  <SelectTrigger id="experience">
                                    <SelectValue placeholder="Pilih pengalaman" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="beginner">Pemula ({`<`} 1 tahun)</SelectItem>
                                    <SelectItem value="intermediate">Menengah (1-3 tahun)</SelectItem>
                                    <SelectItem value="advanced">Berpengalaman ({`>`} 3 tahun)</SelectItem>
                                    <SelectItem value="expert">Expert ({`>`} 5 tahun)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>

                  {/* Streamer Profile Card */}
                  <Card className="border border-hairline-input mb-8">
                    <Collapsible>
                      <CollapsibleTrigger className="w-full">
                        <CardHeader className="bg-surface hover:bg-surface-tint transition-colors">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg font-semibold flex items-center gap-2">
                              <Monitor className="h-5 w-5 text-ink-muted" />
                              Profil Streamer
                            </CardTitle>
                            <ChevronDown className="h-5 w-5 text-ink-soft transition-transform duration-200 ui-expanded:rotate-180" />
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="p-6">
                          <div className="space-y-6">
                            <div className="space-y-2">
                              <Label htmlFor="bio">Bio</Label>
                              <Textarea
                                id="bio"
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                placeholder="Ceritakan tentang dirimu, pengalaman streaming, dan konten yang kamu buat..."
                                className="min-h-[120px]"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Platform</Label>
                              <div className="flex gap-2">
                                {['tiktok', 'shopee'].map((platformOption) => (
                                  <button
                                    key={platformOption}
                                    onClick={() => {
                                      const platforms = platform.split(',').filter(Boolean);
                                      if (platforms.includes(platformOption)) {
                                        setPlatform(platforms.filter(p => p !== platformOption).join(','));
                                      } else {
                                        setPlatform([...platforms, platformOption].join(','));
                                      }
                                    }}
                                    className={`
                                      h-10 px-6 rounded-lg border text-sm font-medium transition-all duration-200
                                      ${platform.split(',').includes(platformOption)
                                        ? 'border-blue-600 bg-blue-50 text-blue-600'
                                        : 'border-hairline-input hover:bg-blue-50 hover:border-blue-600 hover:text-blue-600'
                                      }
                                    `}
                                  >
                                    {platformOption.charAt(0).toUpperCase() + platformOption.slice(1)}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>Kategori Konten (Pilih maksimal 3)</Label>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {[
                                  "gaming", "lifestyle", "education",
                                  "entertainment", "music", "sports",
                                  "food", "travel", "technology",
                                  "beauty", "fashion", "other"
                                ].map((cat) => (
                                  <div
                                    key={cat}
                                    onClick={() => {
                                      const categories = category.split(',').filter(Boolean);
                                      if (categories.includes(cat)) {
                                        setCategory(categories.filter(c => c !== cat).join(','));
                                      } else if (categories.length < 3) {
                                        setCategory([...categories, cat].join(','));
                                      }
                                    }}
                                    className={`
                                      cursor-pointer p-2 rounded-lg border transition-all duration-200
                                      ${category.split(',').includes(cat)
                                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                                        : 'border-hairline-input hover:border-purple-500 hover:bg-purple-50/50'
                                      }
                                    `}
                                  >
                                    <span className="text-sm font-medium capitalize">{cat}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>

                  {/* Location & Contact Card */}
                  <Card className="border border-hairline-input mb-8">
                    <Collapsible>
                      <CollapsibleTrigger className="w-full">
                        <CardHeader className="bg-surface hover:bg-surface-tint transition-colors">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg font-semibold flex items-center gap-2">
                              <MapPin className="h-5 w-5 text-ink-muted" />
                              Lokasi & Kontak
                            </CardTitle>
                            <ChevronDown className="h-5 w-5 text-ink-soft transition-transform duration-200 ui-expanded:rotate-180" />
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="p-6">
                          <div className="space-y-6">
                            <div className="space-y-2">
                              <Label htmlFor="location">Kota</Label>
                              <Input
                                id="location"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="fullAddress">Alamat Lengkap</Label>
                              <Textarea
                                id="fullAddress"
                                value={fullAddress}
                                onChange={(e) => setFullAddress(e.target.value)}
                                placeholder="Masukkan alamat lengkap kamu..."
                                className="min-h-[80px]"
                              />
                            </div>
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>

                  {/* Media & Gallery Card */}
                  <Card className="border border-hairline-input mb-8">
                    <Collapsible>
                      <CollapsibleTrigger className="w-full">
                        <CardHeader className="bg-surface hover:bg-surface-tint transition-colors">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg font-semibold flex items-center gap-2">
                              <ImageIcon className="h-5 w-5 text-ink-muted" />
                              Media & Galeri
                            </CardTitle>
                            <ChevronDown className="h-5 w-5 text-ink-soft transition-transform duration-200 ui-expanded:rotate-180" />
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="p-6">
                          <div className="space-y-6">
                            <div className="space-y-2">
                              <Label htmlFor="youtubeVideoUrl">Video YouTube</Label>
                              <Input
                                id="youtubeVideoUrl"
                                value={youtubeVideoUrl}
                                onChange={(e) => setYoutubeVideoUrl(e.target.value)}
                                placeholder="https://youtube.com/watch?v=..."
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Foto Galeri (Maksimal 5)</Label>
                              <Input
                                type="file"
                                onChange={handleGalleryPhotoChange}
                                accept="image/*"
                                multiple
                                disabled={galleryPhotos.length >= maxGalleryPhotos}
                              />
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mt-4">
                                {galleryPhotos.map((photo, index) => (
                                  <div key={index} className="relative aspect-square">
                                    <Image
                                      src={photo.url}
                                      alt={`Gallery photo ${index + 1}`}
                                      width={200}
                                      height={200}
                                      className="w-full h-full object-cover rounded-lg"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeGalleryPhoto(index)}
                                      className="absolute -top-2 -right-2 bg-surface rounded-full p-1 hover:bg-surface-tint"
                                    >
                                      <XCircle className="h-5 w-5 text-red-500" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                </>
              )}

              {type !== 'streamer' && (
                <>
                  {/* Client Profile Card */}
                  <Card className="border border-hairline-input mb-8">
                    <Collapsible defaultOpen>
                      <CollapsibleTrigger className="w-full">
                        <CardHeader className="bg-surface hover:bg-surface-tint transition-colors">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg font-semibold flex items-center gap-2">
                              <User className="h-5 w-5 text-ink-muted" />
                              Informasi Pribadi
                            </CardTitle>
                            <ChevronDown className="h-5 w-5 text-ink-soft transition-transform duration-200 ui-expanded:rotate-180" />
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="p-6">
                          <div className="grid gap-6">
                            <div className="grid sm:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="firstName">Nama Depan</Label>
                                <Input
                                  id="firstName"
                                  value={firstName}
                                  onChange={(e) => setFirstName(e.target.value)}
                                  placeholder="Masukkan nama depan"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="lastName">Nama Belakang</Label>
                                <Input
                                  id="lastName"
                                  value={lastName}
                                  onChange={(e) => setLastName(e.target.value)}
                                  placeholder="Masukkan nama belakang"
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="location">Lokasi</Label>
                              <Input
                                id="location"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="Masukkan kota kamu"
                              />
                            </div>
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>

                  {/* Brand Information Card */}
                  <Card className="border border-hairline-input mb-8">
                    <Collapsible defaultOpen>
                      <CollapsibleTrigger className="w-full">
                        <CardHeader className="bg-surface hover:bg-surface-tint transition-colors">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg font-semibold flex items-center gap-2">
                              <FileText className="h-5 w-5 text-ink-muted" />
                              Informasi Brand
                            </CardTitle>
                            <ChevronDown className="h-5 w-5 text-ink-soft transition-transform duration-200 ui-expanded:rotate-180" />
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="p-6">
                          <div className="space-y-6">
                            <div className="space-y-2">
                              <Label htmlFor="brandName">Nama Brand</Label>
                              <Input
                                id="brandName"
                                value={brandName}
                                onChange={(e) => setBrandName(e.target.value)}
                                placeholder="Masukkan nama brand kamu"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="brandDescription">Deskripsi Brand</Label>
                              <Textarea
                                id="brandDescription"
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                placeholder="Ceritakan tentang brand kamu..."
                                className="min-h-[120px]"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="brandGuidelines">Brand Guidelines</Label>
                              <div className="space-y-3">
                                <Input
                                  type="file"
                                  id="brandGuidelines"
                                  onChange={handleBrandGuidelineChange}
                                  accept=".pdf,.doc,.docx"
                                />
                                {brandGuidelineUrl && (
                                  <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                                    <FileText className="h-4 w-4 text-blue-600" />
                                    <span className="text-sm text-blue-600">
                                      {brandGuidelineUrl.split('/').pop()}
                                    </span>
                                  </div>
                                )}
                                {brandGuidelineError && (
                                  <p className="text-sm text-red-500 flex items-center gap-1">
                                    <AlertCircle className="h-4 w-4" />
                                    {brandGuidelineError}
                                  </p>
                                )}
                                <p className="text-sm text-ink-soft">
                                  Upload file PDF atau DOC/DOCX (max. 5MB)
                                </p>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                </>
              )}

              <Button 
                type="submit" 
                className="w-full h-14 text-white text-lg font-medium transition-all duration-200 bg-brand hover:bg-brand-hover"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Menyimpan Perubahan...
                  </>
                ) : (
                  'Simpan Perubahan'
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Main component that wraps the content in Suspense
export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
