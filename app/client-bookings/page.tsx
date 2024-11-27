"use client";

import { useEffect, useState, useCallback } from 'react';
import { createClient } from "@/utils/supabase/client";
import { format } from 'date-fns';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Clock, DollarSign, Star, Info, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import RatingModal from '@/components/rating-modal';
import { useRouter } from 'next/navigation';

interface Booking {
  id: number;
  start_time: string;
  end_time: string;
  platform: string;
  status: string;
  created_at: string;
  price: number;
  special_request: string;
  streamer_id: number;
  streamer: {
    id: number;
    first_name: string;
    last_name: string;
    platform: string;
    rating?: number;
    image_url: string;
  };
}

interface RatingData {
  streamer_id: number;
  rating: number;
}

const getStatusInfo = (status: string) => {
  switch (status.toLowerCase()) {
    case 'pending':
      return 'Menunggu streamer menerima pesanan Anda. Biasanya membutuhkan waktu 15-60 menit untuk konfirmasi.';
    case 'accepted':
      return 'Pesanan Anda telah diterima oleh streamer. Silakan tunggu link streaming yang akan diberikan saat waktu yang ditentukan.';
    case 'completed':
      return 'Sesi streaming telah selesai. Terima kasih telah menggunakan layanan kami.';
    case 'rejected':
      return 'Maaf, streamer tidak dapat menerima pesanan Anda. Silakan coba waktu lain atau streamer lainnya.';
    case 'live':
      return 'Sesi streaming sedang berlangsung.';
    default:
      return '';
  }
};

function BookingEntry({ booking, onRatingSubmit }: { booking: Booking; onRatingSubmit: () => void }) {
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);

  const rating = booking.streamer?.rating || 0;

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'accepted': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      case 'live': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="border rounded-lg shadow-sm p-3 sm:p-4 text-xs sm:text-sm hover:shadow-md transition-shadow">
      {/* Top layer */}
      <div className="flex justify-between items-center mb-2 pb-2 border-b">
        <div className="flex items-center gap-1">
          <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs ${getStatusColor(booking.status)} flex items-center`}>
            {booking.status.toLowerCase() === 'pending' ? 'Menunggu' :
             booking.status.toLowerCase() === 'accepted' ? 'Diterima' :
             booking.status.toLowerCase() === 'completed' ? 'Selesai' :
             booking.status.toLowerCase() === 'rejected' ? 'Ditolak' :
             booking.status.toLowerCase() === 'live' ? 'Sedang Live' : booking.status}
            <div className="group relative inline-block ml-1">
              <div className="rounded-full">
                <Info className="h-3 w-3 text-current opacity-70 stroke-[2.5]" />
              </div>
              <div className="invisible group-hover:visible absolute z-10 w-72 bg-black text-white text-[10px] sm:text-xs rounded-md p-2 left-0 mt-1">
                {getStatusInfo(booking.status)}
              </div>
            </div>
          </span>
        </div>
        <span className="text-[10px] sm:text-xs text-gray-500">
          {format(new Date(booking.created_at), 'MMM d, yyyy HH:mm')}
        </span>
      </div>
      
      {/* Middle layer */}
      <div className="flex items-start mb-2 pb-2 border-b">
        <div className="w-14 h-14 sm:w-16 sm:h-16 flex-shrink-0 mr-3">
          <Image 
            src={booking.streamer.image_url || '/default-avatar.png'}
            alt={`${booking.streamer.first_name} ${booking.streamer.last_name}`}
            width={64}
            height={64}
            className="w-full h-full object-cover rounded-lg"
          />
        </div>
        <div className="flex-grow">
          <h3 className="font-medium text-sm sm:text-base mb-1">
            {`${booking.streamer.first_name} ${booking.streamer.last_name}`}
          </h3>
          <p className="text-[10px] sm:text-xs text-gray-600 mb-1">
            Layanan livestreaming di {booking.platform}
          </p>
          <div className="flex items-center mb-1">
            <Clock className="w-3 h-3 sm:w-4 sm:h-4 mr-1.5 text-red-500" />
            <span className="text-[10px] sm:text-xs">
              {`${format(new Date(booking.start_time), 'HH:mm')} - ${format(new Date(booking.end_time), 'HH:mm')}`}
            </span>
          </div>
          <div className="flex items-center">
            <Star className="w-3 h-3 sm:w-4 sm:h-4 mr-1.5 text-yellow-400" />
            <span className="text-[10px] sm:text-xs">
              Penilaian: {rating === 0 ? 'Belum ada' : rating.toFixed(1)}
            </span>
          </div>
        </div>
      </div>
      
      {/* Bottom layer */}
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <span className="text-[10px] sm:text-xs text-gray-500 mr-1">Total:</span>
          <span className="text-xs sm:text-sm text-black">
            Rp {booking.price.toLocaleString()}
          </span>
        </div>
        {booking.status.toLowerCase() === 'completed' && (
          <Button 
            variant="outline" 
            size="sm" 
            className="text-[10px] sm:text-xs py-1.5 px-3 bg-gradient-to-r from-red-500 to-red-600 
              text-white hover:from-red-600 hover:to-red-700 transition-all duration-200 
              shadow-sm hover:shadow transform hover:-translate-y-0.5"
            onClick={() => setIsRatingModalOpen(true)}
          >
            Beri Penilaian
          </Button>
        )}
      </div>

      {/* Rating Modal */}
      {isRatingModalOpen && (
        <RatingModal 
          isOpen={isRatingModalOpen} 
          onClose={() => setIsRatingModalOpen(false)} 
          bookingId={booking.id}
          streamerId={booking.streamer.id}
          streamerName={`${booking.streamer.first_name} ${booking.streamer.last_name}`}
          streamerImage={booking.streamer.image_url}
          startDate={booking.start_time}
          endDate={booking.end_time}
          onSubmit={onRatingSubmit}
        />
      )}
    </div>
  );
}

export default function ClientBookings() {
  const router = useRouter();
  const [clientName, setClientName] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const bookingsPerPage = 10;

  const fetchClientData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      // Fetch client name
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('first_name')
        .eq('id', user.id)
        .single();
      
      if (userData) {
        setClientName(userData.first_name);
      } else if (userError) {
        console.error("Error fetching user data:", userError);
        setError("Failed to fetch user data");
      }

      // Fetch bookings
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id,
          start_time,
          end_time,
          platform,
          status,
          created_at,
          price,
          special_request,
          streamer:streamer_id (
            id,
            first_name,
            last_name,
            platform,
            image_url
          )
        `)
        .eq('client_id', user.id)
        .not('status', 'eq', 'payment_pending')
        .order('created_at', { ascending: false });

      if (bookingsError) {
        console.error('Error fetching bookings:', bookingsError);
        setError("Failed to fetch bookings");
      } else if (bookingsData) {
        // Get unique streamer IDs
        const streamerIds = Array.from(
          new Set(
            bookingsData.map((booking: any) => booking.streamer.id)
          )
        );

        // Fetch ratings
        const { data: ratingsData, error: ratingsError } = await supabase
          .from('streamer_ratings')
          .select('streamer_id, rating')
          .in('streamer_id', streamerIds);

        if (ratingsError) {
          console.error('Error fetching ratings:', ratingsError);
        } else {
          // Calculate average ratings with proper typing
          const averageRatings = (ratingsData || []).reduce((acc: Record<number, { sum: number; count: number }>, curr) => {
            if (!acc[curr.streamer_id]) {
              acc[curr.streamer_id] = { sum: 0, count: 0 };
            }
            acc[curr.streamer_id].sum += curr.rating;
            acc[curr.streamer_id].count += 1;
            return acc;
          }, {});

          // Add ratings to bookings with proper typing
          const bookingsWithRatings: Booking[] = bookingsData.map((booking: any) => ({
            ...booking,
            streamer_id: booking.streamer.id,
            streamer: {
              ...booking.streamer,
              rating: averageRatings[booking.streamer.id]
                ? (averageRatings[booking.streamer.id].sum / averageRatings[booking.streamer.id].count)
                : 0
            }
          }));

          setBookings(bookingsWithRatings);
        }
      } else {
        setBookings([]);
      }
    } else {
      setError("User not authenticated");
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchClientData();
  }, [fetchClientData]);

  const refreshBookings = () => {
    fetchClientData();
  };

  const indexOfLastBooking = currentPage * bookingsPerPage;
  const indexOfFirstBooking = indexOfLastBooking - bookingsPerPage;
  const currentBookings = bookings.slice(indexOfFirstBooking, indexOfLastBooking);

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  if (isLoading) {
    return <div className="container mx-auto p-4 text-sm">Loading...</div>;
  }

  if (error) {
    return <div className="container mx-auto p-4 text-red-500 text-sm">Error: {error}</div>;
  }

  return (
    <div className="container mx-auto px-3 sm:px-4 max-w-3xl font-sans pt-8 sm:pt-12">
      <div className="mb-6 border-b pb-3">
        <div className="flex items-center gap-3">
          <Button 
            onClick={() => router.push('/protected')} 
            variant="ghost" 
            className="p-0 hover:bg-transparent"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600 hover:text-gray-800" />
          </Button>
          <div className="flex items-center justify-between flex-grow">
            <h1 className="text-lg sm:text-xl font-semibold">Pesanan {clientName}</h1>
            <Button 
              onClick={refreshBookings} 
              size="sm" 
              variant="ghost"
              className="p-1.5"
            >
              <RefreshCw className="w-4 h-4 text-gray-600" />
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {currentBookings.map((booking) => (
          <BookingEntry key={booking.id} booking={booking} onRatingSubmit={refreshBookings} />
        ))}
        {bookings.length === 0 && (
          <p className="text-center mt-4 text-gray-500 text-xs sm:text-sm">
            Belum ada pesanan.
          </p>
        )}
      </div>

      {/* Pagination */}
      <div className="mt-4 sm:mt-6 flex justify-between items-center">
        <Button
          onClick={() => paginate(currentPage - 1)}
          disabled={currentPage === 1}
          size="sm"
          variant="ghost"
          className="p-1.5"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs sm:text-sm text-gray-600">
          Halaman {currentPage} dari {Math.ceil(bookings.length / bookingsPerPage)}
        </span>
        <Button
          onClick={() => paginate(currentPage + 1)}
          disabled={indexOfLastBooking >= bookings.length}
          size="sm"
          variant="ghost"
          className="p-1.5"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
