"use client";

import { useState, useEffect, useRef } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateUserProfile, updateStreamerProfile } from "@/app/actions";
import { createClient } from "@/utils/supabase/client";
import Image from 'next/image';
import { Loader2, User, Mail, FileText, Camera, Youtube, AlertCircle, ChevronLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB in bytes

// First, let's define the response types at the top of the file
interface StreamerProfileResponse {
  success: boolean;
  message?: string;
  imageUrl?: string;
  redirect?: string;
  error?: string;
}

interface UserProfileResponse {
  success: boolean;
  profilePictureUrl?: string;
  error?: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [bio, setBio] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState('');
  const [userType, setUserType] = useState<'client' | 'streamer' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>([]);
  const [newGalleryPhotos, setNewGalleryPhotos] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false); // New state for loading

  const fetchUserData = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('first_name, last_name, bio, profile_picture_url, user_type')
        .eq('id', user.id)
        .single();

      if (userData && !userError) {
        setFirstName(userData.first_name || '');
        setLastName(userData.last_name || '');
        setBio(userData.bio || '');
        setUserType(userData.user_type);

        if (userData.user_type === 'streamer') {
          const { data: streamerData, error: streamerError } = await supabase
            .from('streamers')
            .select('id, image_url, video_url')
            .eq('user_id', user.id)
            .single();

          if (streamerData && !streamerError) {
            setImageUrl(streamerData.image_url || '');
            setYoutubeUrl(streamerData.video_url || '');

            // Fetch gallery photos
            const { data: galleryData, error: galleryError } = await supabase
              .from('streamer_gallery_photos')
              .select('photo_url')
              .eq('streamer_id', streamerData.id)
              .order('order_number');

            if (galleryData && !galleryError) {
              setGalleryPhotos(galleryData.map(item => item.photo_url));
            }
          }
        } else {
          setImageUrl(userData.profile_picture_url || '');
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUserData();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    
    try {
      if (selectedImage) {
        formData.append('image', selectedImage);
      }
      
      if (userType === 'streamer') {
        formData.append('youtubeUrl', youtubeUrl);
        newGalleryPhotos.forEach((photo) => {
          formData.append('galleryPhoto', photo);
        });
      }

      const result = userType === 'streamer' 
        ? await updateStreamerProfile(formData)
        : await updateUserProfile(formData);

      if ('error' in result) {
        toast.error(result.error);
        return;
      }

      // Show success message
      toast.success(
        'message' in result 
          ? result.message 
          : 'Profile updated successfully!'
      );

      // Clear temporary states
      setPreviewUrl(null);
      setSelectedImage(null);
      setNewGalleryPhotos([]);

      // Handle redirect if provided
      if ('redirect' in result && result.redirect) {
        router.push(result.redirect);
      } else {
        // Fetch updated data if not redirecting
        await fetchUserData();
      }

    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('An unexpected error occurred. Please try again.');
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
      setImageError('');
      setSelectedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleGalleryPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newPhotos = Array.from(files).slice(0, 5 - galleryPhotos.length);
      setNewGalleryPhotos(prevPhotos => [...prevPhotos, ...newPhotos]);
    }
  };

  const removeGalleryPhoto = (index: number) => {
    setGalleryPhotos(prevPhotos => prevPhotos.filter((_, i) => i !== index));
  };

  const removeNewGalleryPhoto = (index: number) => {
    setNewGalleryPhotos(prevPhotos => prevPhotos.filter((_, i) => i !== index));
  };

  const handleBackNavigation = () => {
    if (userType === 'streamer') {
      router.push('/streamer-dashboard');
    } else {
      router.push('/protected');
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-[#000080]" />
    </div>;
  }

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <div className="flex items-center mb-6">
        <Button 
          onClick={handleBackNavigation} 
          variant="outline" 
          size="sm" 
          className="mr-4 border-red-500 text-red-500 hover:bg-red-50"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Kembali
        </Button>
        <h1 className="text-xl sm:text-2xl font-semibold">
          Pengaturan {userType === 'streamer' ? 'Streamer' : 'Client'}
        </h1>
      </div>

      <Card className="border-0 shadow-lg">
        <CardHeader className="border-b border-gray-100 bg-gray-50/50">
          <CardTitle className="text-lg sm:text-xl font-semibold">Informasi Profil</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-col items-center mb-6">
              <div className="relative w-28 h-28 sm:w-32 sm:h-32 mb-2">
                {previewUrl || imageUrl ? (
                  <Image
                    src={previewUrl || imageUrl}
                    alt="Profile"
                    width={128}
                    height={128}
                    className="w-full h-full rounded-full object-cover border-4 border-red-100"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full bg-red-50 rounded-full flex items-center justify-center border-4 border-red-100">
                    <User className="h-12 w-12 text-red-300" />
                  </div>
                )}
              </div>
              <Button 
                type="button" 
                onClick={handleImageClick} 
                className="mt-2 bg-red-500 hover:bg-red-600 text-white"
              >
                <Camera className="mr-2 h-4 w-4" />
                {imageUrl ? 'Ganti Foto' : 'Unggah Foto'}
              </Button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageChange}
                className="hidden"
                accept="image/*"
              />
              {imageError && (
                <p className="text-red-500 text-xs mt-2 flex items-center">
                  <AlertCircle className="mr-1 h-4 w-4" />
                  {imageError}
                </p>
              )}
            </div>

            <div className="grid gap-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName" className="flex items-center text-sm text-gray-600">
                    <User className="mr-2 h-4 w-4 text-red-500" />
                    Nama Depan
                  </Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Masukkan nama depan"
                    className="mt-1 border-gray-200 focus:border-red-500 focus:ring-red-500 text-gray-500 placeholder:text-gray-400"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName" className="flex items-center text-sm text-gray-600">
                    <User className="mr-2 h-4 w-4 text-red-500" />
                    Nama Belakang
                  </Label>
                  <Input
                    id="lastName"
                    name="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Masukkan nama belakang"
                    className="mt-1 border-gray-200 focus:border-red-500 focus:ring-red-500 text-gray-500 placeholder:text-gray-400"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="bio" className="flex items-center text-sm text-gray-600">
                  <FileText className="mr-2 h-4 w-4 text-red-500" />
                  Bio
                </Label>
                <Textarea
                  id="bio"
                  name="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Ceritakan tentang diri Anda"
                  className="mt-1 border-gray-200 focus:border-red-500 focus:ring-red-500 min-h-[100px] text-gray-500 placeholder:text-gray-400"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Tip: Bio yang baik membantu orang lain memahami Anda lebih baik.
                </p>
              </div>

              {userType === 'streamer' && (
                <>
                  <div>
                    <Label htmlFor="youtubeUrl" className="flex items-center text-sm text-gray-600">
                      <Youtube className="mr-2 h-4 w-4 text-red-500" />
                      Link Video YouTube
                    </Label>
                    <Input
                      id="youtubeUrl"
                      name="youtubeUrl"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      placeholder="https://youtu.be/..."
                      className="mt-1 border-gray-200 focus:border-red-500 focus:ring-red-500 text-gray-500 placeholder:text-gray-400"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Tambahkan video untuk menunjukkan gaya streaming Anda.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="galleryPhotos" className="flex items-center text-sm text-gray-600">
                      <Camera className="mr-2 h-4 w-4 text-red-500" />
                      Foto Galeri (Maks 5)
                    </Label>
                    <Input
                      id="galleryPhotos"
                      name="galleryPhotos"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleGalleryPhotoChange}
                      className="mt-1 border-gray-200 focus:border-red-500 focus:ring-red-500"
                      disabled={galleryPhotos.length + newGalleryPhotos.length >= 5}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Tip: Pilih foto yang mewakili brand dan gaya Anda.
                    </p>
                    <div className="grid grid-cols-5 gap-2 mt-2">
                      {galleryPhotos.map((photo, index) => (
                        <div key={index} className="relative">
                          <Image
                            src={photo}
                            alt={`Gallery photo ${index + 1}`}
                            width={100}
                            height={100}
                            className="w-full h-24 object-cover rounded"
                          />
                          <button
                            type="button"
                            onClick={() => removeGalleryPhoto(index)}
                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {newGalleryPhotos.map((photo, index) => (
                        <div key={`new-${index}`} className="relative">
                          <Image
                            src={URL.createObjectURL(photo)}
                            alt={`New gallery photo ${index + 1}`}
                            width={100}
                            height={100}
                            className="w-full h-24 object-cover rounded"
                          />
                          <button
                            type="button"
                            onClick={() => removeNewGalleryPhoto(index)}
                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Button 
                type="submit" 
                className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white h-11"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Menyimpan Perubahan...
                  </>
                ) : (
                  'Simpan Perubahan'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
