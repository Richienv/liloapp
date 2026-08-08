"use client";

import { useState, useEffect, useRef, Suspense } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateUserProfile, updateStreamerProfile, updateStreamerPrice } from "@/app/actions";
import { createClient } from "@/utils/supabase/client";
import Image from 'next/image';
import { Loader2, User, FileText, Camera, AlertCircle, ChevronLeft, XCircle, ChevronDown } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { Toaster } from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB in bytes

/* -------------------------------------------------------------------------
   Shared field dressing.

   The shadcn primitives are still written against Tailwind's own scale
   (`text-sm`, `rounded-md`, `border-input`). `cn` knows both scales, so a
   className here actually replaces those rather than racing them in the
   stylesheet — which is why these are constants and not a fork of the
   primitives.
   ------------------------------------------------------------------------- */

const LABEL = "text-meta font-medium text-ink-muted";
const FIELD =
  "h-11 rounded-field border-hairline-input bg-surface text-ui text-ink placeholder:text-ink-ghost";
const AREA =
  "rounded-field border-hairline-input bg-surface text-copy text-ink placeholder:text-ink-ghost";

/**
 * Chip state carries no colour.
 *
 * Selected used to be blue for platform and purple for category — two accents
 * in one form, neither of them the one the design allows. Weight and fill do
 * the same job: a selected chip sits on the pressed quiet fill with a strong
 * hairline, an unselected one is a plain field edge.
 */
const CHIP_ON =
  "border-hairline-strong bg-surface-deep text-ink font-medium";
const CHIP_OFF =
  "border-hairline-input bg-surface text-ink-muted hover:bg-surface-raised hover:text-ink";

/** Values are what gets persisted — only the labels are translated. */
const PLATFORM_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'shopee', label: 'Shopee' },
];

const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'gaming', label: 'Gaming' },
  { value: 'lifestyle', label: 'Gaya hidup' },
  { value: 'education', label: 'Edukasi' },
  { value: 'entertainment', label: 'Hiburan' },
  { value: 'music', label: 'Musik' },
  { value: 'sports', label: 'Olahraga' },
  { value: 'food', label: 'Makanan' },
  { value: 'travel', label: 'Jalan-jalan' },
  { value: 'technology', label: 'Teknologi' },
  { value: 'beauty', label: 'Kecantikan' },
  { value: 'fashion', label: 'Fashion' },
  { value: 'other', label: 'Lainnya' },
];

/**
 * A section header: mono index, serif title, and the description pushed to the
 * far end of the same baseline. Identical to the one on `/client-bookings` so
 * the two screens read as one product.
 */
function SectionHeading({
  index,
  title,
  description,
}: {
  index: number;
  title: string;
  description?: string;
}) {
  return (
    <>
      <span className="numeric text-mini font-semibold text-ink-ghost">
        {String(index).padStart(2, '0')}
      </span>
      <h2 className="font-serif text-title font-semibold text-ink">{title}</h2>
      {description && (
        <p className="w-full text-meta text-ink-soft sm:w-auto sm:flex-1 sm:text-right">
          {description}
        </p>
      )}
    </>
  );
}

/** A plain section: hairline frame, no disclosure. */
function Section({
  index,
  title,
  description,
  children,
}: {
  index: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-frame border border-hairline bg-surface">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline-soft px-4 py-4 sm:px-5">
        <SectionHeading index={index} title={title} description={description} />
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

/**
 * The same frame with a disclosure.
 *
 * The divider lives on the CONTENT, not the header: a closed card that still
 * draws a line under its own title reads as a section whose body failed to
 * render.
 */
function FoldSection({
  index,
  title,
  description,
  defaultOpen,
  children,
}: {
  index: number;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="overflow-hidden rounded-frame border border-hairline bg-surface"
    >
      <CollapsibleTrigger className="group flex w-full items-baseline gap-3 px-4 py-4 text-left transition-colors hover:bg-surface-raised sm:px-5">
        <span className="numeric text-mini font-semibold text-ink-ghost">
          {String(index).padStart(2, '0')}
        </span>
        <h2 className="min-w-0 flex-1 truncate font-serif text-title font-semibold text-ink">
          {title}
        </h2>
        {description && (
          <p className="hidden min-w-0 truncate text-meta text-ink-soft sm:block">
            {description}
          </p>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 self-center text-ink-ghost transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-hairline-soft p-4 sm:p-5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

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
          toast.error('Gagal memuat data kamu');
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
      toast.error('Gagal memuat data profil');
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

        toast.success('Profil berhasil disimpan');
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
      toast.error('Gagal menyimpan profil: ' + (error instanceof Error ? error.message : 'kesalahan tidak diketahui'));
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
        setImageError('Ukuran foto lebih dari 1MB. Pilih foto yang lebih kecil.');
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
        setGalleryError(`Maksimal ${maxGalleryPhotos} foto.`);
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
        setBrandGuidelineError('Ukuran file maksimal 5MB.');
        return;
      }
      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedTypes.includes(file.type)) {
        setBrandGuidelineError('Hanya file PDF atau DOC/DOCX.');
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
    <div className="min-h-screen bg-canvas">
      <Toaster position="top-center" />

      <main className="mx-auto w-full max-w-[880px] px-4 py-8 sm:px-6 sm:py-12">
        <header className="min-w-0">
          <button
            type="button"
            onClick={handleBackNavigation}
            className="-ml-1 inline-flex items-center gap-1 text-meta text-ink-soft transition-colors hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" />
            {userType === 'streamer' ? 'Dashboard' : 'Cari host'}
          </button>
          <h1 className="mt-3 font-serif text-section font-semibold text-ink sm:text-display">
            {type === 'streamer' ? 'Pengaturan host' : 'Pengaturan brand'}
          </h1>
          <p className="mt-2 text-lede text-ink-soft">
            {type === 'streamer'
              ? 'Perbarui profil, harga, dan hal yang brand lihat sebelum booking.'
              : 'Perbarui profil dan detail brand kamu.'}
          </p>
        </header>

        {loading ? (
          <div className="mt-8 flex items-center justify-center rounded-frame border border-hairline bg-surface py-24">
            <Loader2 className="h-6 w-6 animate-spin text-ink-ghost" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {/* -------------------------------------------------------------
                Foto profil.

                The avatar used to be a 160px circle in a four-pixel blue ring,
                centred above a blue upload button — two accents and a lot of
                height for one field. It is a row now: the picture, the control
                that changes it, and the one constraint that matters.
                ------------------------------------------------------------- */}
            <Section index={1} title="Foto profil">
              <div className="flex min-w-0 items-center gap-4 sm:gap-5">
                <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-hairline bg-surface-tint sm:h-24 sm:w-24">
                  {(previewUrl || imageUrl) ? (
                    <Image
                      src={previewUrl || imageUrl || ''}
                      alt="Foto profil"
                      fill
                      sizes="96px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-ink-ghost">
                      <User className="h-7 w-7" />
                    </span>
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <Button
                    type="button"
                    variant="quiet"
                    size="action-compact"
                    onClick={handleImageClick}
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    {imageUrl ? 'Ganti foto' : 'Unggah foto'}
                  </Button>
                  <p className="mt-2 text-meta text-ink-soft">
                    Format gambar, maksimal 1MB.
                  </p>
                </div>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageChange}
                className="hidden"
                accept="image/*"
              />

              {imageError && (
                <p className="mt-3 flex items-start gap-1.5 text-meta text-destructive-emphasis">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {imageError}
                </p>
              )}
            </Section>

            {type === 'streamer' && (
              <>
                {/* ---------------------------------------------------------
                    Harga.

                    Every surface in here was a wash of #E23744 — a left rail,
                    three tinted wells and a red price — which made the pricing
                    card shout louder than the button that saves the form. The
                    rules are quiet copy on the tint fill, the limits are a
                    two-cell grid drawn with `shadow-cell`, and the only figure
                    with any size to it is the one the brand actually pays.
                    --------------------------------------------------------- */}
                <FoldSection
                  index={2}
                  title="Atur harga"
                  description="Berlaku untuk booking baru."
                  defaultOpen
                >
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="price" className={LABEL}>
                        Tarif dasar per jam
                      </Label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ui text-ink-soft">
                          Rp
                        </span>
                        <Input
                          id="price"
                          type="text"
                          inputMode="numeric"
                          value={newPrice}
                          onChange={handlePriceChange}
                          placeholder={price ? price.toLocaleString('id-ID') : "Masukkan harga baru"}
                          className={`${FIELD} numeric pl-11`}
                        />
                      </div>
                      <p className="text-meta text-ink-soft">
                        Ini yang kamu terima. Salda menambah 30% di atasnya.
                      </p>
                      {priceError && (
                        <p className="flex items-start gap-1.5 text-meta text-destructive-emphasis">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {priceError}
                        </p>
                      )}
                    </div>

                    <div className="rounded-panel border border-hairline-soft bg-surface-tint p-4">
                      <p className="font-mono text-tiny uppercase text-ink-ghost">
                        Aturan perubahan harga
                      </p>
                      <ul className="mt-2.5 space-y-1.5 text-meta text-ink-muted">
                        <li>
                          Perubahan dibatasi{' '}
                          <span className="font-medium text-ink">25%</span> naik atau turun per hari.
                        </li>
                        <li>
                          Harga yang brand lihat otomatis ditambah{' '}
                          <span className="font-medium text-ink">30%</span> sebagai biaya layanan platform.
                        </li>
                        <li>
                          Harga hanya bisa diubah{' '}
                          <span className="font-medium text-ink">1 kali dalam 24 jam</span>.
                        </li>
                      </ul>
                    </div>

                    {price > 0 && (
                      <div className="grid grid-cols-2 overflow-hidden rounded-panel">
                        <div className="shadow-cell px-4 py-3">
                          <p className="font-mono text-tiny uppercase text-ink-ghost">Minimum</p>
                          <p className="numeric mt-1 truncate text-copy font-medium text-ink">
                            Rp {calculatePriceLimits(price).minPrice.toLocaleString('id-ID')}
                          </p>
                        </div>
                        <div className="shadow-cell px-4 py-3">
                          <p className="font-mono text-tiny uppercase text-ink-ghost">Maksimum</p>
                          <p className="numeric mt-1 truncate text-copy font-medium text-ink">
                            Rp {calculatePriceLimits(price).maxPrice.toLocaleString('id-ID')}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex min-w-0 items-baseline justify-between gap-4 border-t border-hairline-soft pt-4">
                      <p className="min-w-0 text-ui font-medium text-ink">Brand membayar</p>
                      <p className="shrink-0 whitespace-nowrap">
                        <span className="numeric text-price font-semibold text-ink">
                          Rp {Math.round(calculatePriceWithPlatformFee(price)).toLocaleString('id-ID')}
                        </span>
                        <span className="text-meta text-ink-soft"> / jam</span>
                      </p>
                    </div>

                    <p className="text-meta text-ink-faint">
                      Perubahan berlaku untuk booking baru. Sesi yang sudah dipesan tidak berubah.
                    </p>
                  </div>
                </FoldSection>

                <FoldSection index={3} title="Informasi pribadi">
                  <div className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="firstName" className={LABEL}>Nama depan</Label>
                        <Input
                          id="firstName"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className={FIELD}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName" className={LABEL}>Nama belakang</Label>
                        <Input
                          id="lastName"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className={FIELD}
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="gender" className={LABEL}>Jenis kelamin</Label>
                        <Select value={gender} onValueChange={setGender}>
                          <SelectTrigger id="gender" className={FIELD}>
                            <SelectValue placeholder="Pilih jenis kelamin" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">Laki-laki</SelectItem>
                            <SelectItem value="female">Perempuan</SelectItem>
                            <SelectItem value="other">Tidak ingin menyebutkan</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="age" className={LABEL}>Umur</Label>
                        <Input
                          id="age"
                          type="number"
                          min="18"
                          max="100"
                          value={age}
                          onChange={(e) => setAge(e.target.value)}
                          className={`${FIELD} numeric`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="experience" className={LABEL}>Pengalaman</Label>
                        <Select value={experience} onValueChange={setExperience}>
                          <SelectTrigger id="experience" className={FIELD}>
                            <SelectValue placeholder="Pilih pengalaman" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="beginner">Pemula ({`<`} 1 tahun)</SelectItem>
                            <SelectItem value="intermediate">Menengah (1-3 tahun)</SelectItem>
                            <SelectItem value="advanced">Berpengalaman ({`>`} 3 tahun)</SelectItem>
                            <SelectItem value="expert">Ahli ({`>`} 5 tahun)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </FoldSection>

                <FoldSection index={4} title="Profil host" description="Ini yang brand lihat.">
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="bio" className={LABEL}>Bio</Label>
                      <Textarea
                        id="bio"
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Ceritakan tentang dirimu, pengalaman streaming, dan konten yang kamu buat..."
                        className={`${AREA} min-h-[120px]`}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className={LABEL}>Platform</Label>
                      <div className="flex flex-wrap gap-2">
                        {PLATFORM_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            // Without this the toggle submits the form. A <button>
                            // inside a <form> defaults to type="submit", so picking
                            // a platform also saved the whole profile. Every other
                            // button in this form is already typed; this one was
                            // missed.
                            type="button"
                            onClick={() => {
                              const platforms = platform.split(',').filter(Boolean);
                              if (platforms.includes(option.value)) {
                                setPlatform(platforms.filter(p => p !== option.value).join(','));
                              } else {
                                setPlatform([...platforms, option.value].join(','));
                              }
                            }}
                            className={`h-10 rounded-field border px-5 text-ui transition-colors ${
                              platform.split(',').includes(option.value) ? CHIP_ON : CHIP_OFF
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <Label className={LABEL}>Kategori konten</Label>
                        <span className="text-meta text-ink-faint">Pilih maksimal 3</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {CATEGORY_OPTIONS.map((option) => (
                          <div
                            key={option.value}
                            onClick={() => {
                              const categories = category.split(',').filter(Boolean);
                              if (categories.includes(option.value)) {
                                setCategory(categories.filter(c => c !== option.value).join(','));
                              } else if (categories.length < 3) {
                                setCategory([...categories, option.value].join(','));
                              }
                            }}
                            className={`cursor-pointer truncate rounded-field border px-3 py-2 text-copy transition-colors ${
                              category.split(',').includes(option.value) ? CHIP_ON : CHIP_OFF
                            }`}
                          >
                            {option.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </FoldSection>

                <FoldSection index={5} title="Lokasi & kontak">
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="location" className={LABEL}>Kota</Label>
                      <Input
                        id="location"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        className={FIELD}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fullAddress" className={LABEL}>Alamat lengkap</Label>
                      <Textarea
                        id="fullAddress"
                        value={fullAddress}
                        onChange={(e) => setFullAddress(e.target.value)}
                        placeholder="Masukkan alamat lengkap kamu..."
                        className={`${AREA} min-h-[80px]`}
                      />
                    </div>
                  </div>
                </FoldSection>

                <FoldSection index={6} title="Media & galeri">
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="youtubeVideoUrl" className={LABEL}>Video YouTube</Label>
                      <Input
                        id="youtubeVideoUrl"
                        value={youtubeVideoUrl}
                        onChange={(e) => setYoutubeVideoUrl(e.target.value)}
                        placeholder="https://youtube.com/watch?v=..."
                        className={FIELD}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <Label className={LABEL}>Foto galeri</Label>
                        <span className="numeric text-meta text-ink-faint">
                          {galleryPhotos.length} / {maxGalleryPhotos}
                        </span>
                      </div>
                      <Input
                        type="file"
                        onChange={handleGalleryPhotoChange}
                        accept="image/*"
                        multiple
                        disabled={galleryPhotos.length >= maxGalleryPhotos}
                        className={`${FIELD} cursor-pointer py-2.5 text-copy file:mr-3 file:text-copy file:text-ink-muted`}
                      />
                      {galleryError && (
                        <p className="flex items-start gap-1.5 text-meta text-destructive-emphasis">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {galleryError}
                        </p>
                      )}

                      {galleryPhotos.length > 0 && (
                        <div className="grid grid-cols-3 gap-3 pt-2 sm:grid-cols-5">
                          {galleryPhotos.map((photo, index) => (
                            <div
                              key={index}
                              className="relative aspect-square overflow-hidden rounded-panel border border-hairline bg-surface-tint"
                            >
                              <Image
                                src={photo.url}
                                alt={`Foto galeri ${index + 1}`}
                                fill
                                sizes="160px"
                                className="object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => removeGalleryPhoto(index)}
                                aria-label={`Hapus foto ${index + 1}`}
                                className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full border border-hairline bg-surface text-ink-soft transition-colors hover:text-destructive-emphasis"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </FoldSection>
              </>
            )}

            {type !== 'streamer' && (
              <>
                <FoldSection index={2} title="Informasi pribadi" defaultOpen>
                  <div className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="firstName" className={LABEL}>Nama depan</Label>
                        <Input
                          id="firstName"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="Masukkan nama depan"
                          className={FIELD}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName" className={LABEL}>Nama belakang</Label>
                        <Input
                          id="lastName"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Masukkan nama belakang"
                          className={FIELD}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="location" className={LABEL}>Lokasi</Label>
                      <Input
                        id="location"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="Masukkan kota kamu"
                        className={FIELD}
                      />
                    </div>
                  </div>
                </FoldSection>

                <FoldSection index={3} title="Informasi brand" defaultOpen>
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="brandName" className={LABEL}>Nama brand</Label>
                      <Input
                        id="brandName"
                        value={brandName}
                        onChange={(e) => setBrandName(e.target.value)}
                        placeholder="Masukkan nama brand kamu"
                        className={FIELD}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="brandDescription" className={LABEL}>Deskripsi brand</Label>
                      <Textarea
                        id="brandDescription"
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Ceritakan tentang brand kamu..."
                        className={`${AREA} min-h-[120px]`}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="brandGuidelines" className={LABEL}>Panduan brand</Label>
                      <Input
                        type="file"
                        id="brandGuidelines"
                        onChange={handleBrandGuidelineChange}
                        accept=".pdf,.doc,.docx"
                        className={`${FIELD} cursor-pointer py-2.5 text-copy file:mr-3 file:text-copy file:text-ink-muted`}
                      />
                      {brandGuidelineUrl && (
                        <div className="flex min-w-0 items-center gap-2 rounded-field border border-hairline-soft bg-surface-tint px-3 py-2">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
                          <span className="min-w-0 flex-1 truncate text-copy text-ink-body">
                            {brandGuidelineUrl.split('/').pop()}
                          </span>
                        </div>
                      )}
                      {brandGuidelineError && (
                        <p className="flex items-start gap-1.5 text-meta text-destructive-emphasis">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {brandGuidelineError}
                        </p>
                      )}
                      <p className="text-meta text-ink-soft">
                        Unggah file PDF atau DOC/DOCX, maksimal 5MB.
                      </p>
                    </div>
                  </div>
                </FoldSection>
              </>
            )}

            <div className="pt-2">
              <Button
                type="submit"
                variant="brand"
                size="action-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Menyimpan perubahan…
                  </>
                ) : (
                  'Simpan perubahan'
                )}
              </Button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

// Main component that wraps the content in Suspense
export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-canvas">
          <Loader2 className="h-6 w-6 animate-spin text-ink-ghost" />
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
