import { createClient } from "@/utils/supabase/client";
import { baseFromTotal } from "@/lib/pricing";

interface Booking {
  price: number;
  status: string;
  start_time: string;
  end_time: string;
}

interface Rating {
  rating: number;
}

// Add interface for the joined data
interface StreamerWithUser {
  id: number;
  user_id: string;
  users: {
    created_at: string;
  };
}

interface MonthlyStats {
  earnings: number;
  bookings: number;
  lives: number;
  cancellations: number;
}

export interface StreamerStats {
  totalEarnings: number;
  totalBookings: number;
  totalLive: number;
  cancelledBookings: number;
  rating: number;
  totalLiveHours: number;
  joinDate: string;
  trends: {
    earnings: number;
    bookings: number;
    lives: number;
    cancellations: number;
  };
}

export interface StreamerGalleryPhoto {
  id: string;
  photo_url: string;
  order_number: number;
  created_at: string;
}

export const streamerService = {
  async getStreamerStats(streamerId: number): Promise<StreamerStats> {
    const supabase = createClient();
    
    // Get current and last month dates
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // Get all bookings including last month
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        price,
        status,
        start_time,
        end_time
      `)
      .eq('streamer_id', streamerId)
      .gte('start_time', lastMonthStart.toISOString());

    if (bookingsError) throw bookingsError;

    // Get streamer rating
    const { data: ratings, error: ratingsError } = await supabase
      .from('streamer_ratings')
      .select('rating')
      .eq('streamer_id', streamerId);

    if (ratingsError) throw ratingsError;

    // Get join date
    const { data: streamer, error: streamerError } = await supabase
      .from('streamers')
      .select('user_id')
      .eq('id', streamerId)
      .single();

    if (streamerError) throw streamerError;

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('created_at')
      .eq('id', streamer.user_id)
      .single();

    if (userError) throw userError;

    // Calculate current month stats
    const currentMonthStats: MonthlyStats = {
      earnings: 0,
      bookings: 0,
      lives: 0,
      cancellations: 0
    };

    // Calculate last month stats
    const lastMonthStats: MonthlyStats = {
      earnings: 0,
      bookings: 0,
      lives: 0,
      cancellations: 0
    };

    // Process bookings - Calculate actual earnings by working backwards from final price
    bookings?.forEach(booking => {
      const bookingDate = new Date(booking.start_time);
      const stats = bookingDate >= currentMonthStart ? currentMonthStats : lastMonthStats;

      if (booking.status === 'completed') {
        // Recover the streamer's base price from the tax-inclusive total.
        const basePrice = baseFromTotal(booking.price);
        stats.earnings += basePrice;
        stats.lives += 1;
      } else if (booking.status === 'rejected' || booking.status === 'cancelled') {
        stats.cancellations += 1;
      }
      stats.bookings += 1;
    });

    // Calculate percentage changes
    const calculatePercentageChange = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    const trends = {
      earnings: calculatePercentageChange(currentMonthStats.earnings, lastMonthStats.earnings),
      bookings: calculatePercentageChange(currentMonthStats.bookings, lastMonthStats.bookings),
      lives: calculatePercentageChange(currentMonthStats.lives, lastMonthStats.lives),
      cancellations: calculatePercentageChange(currentMonthStats.cancellations, lastMonthStats.cancellations)
    };

    // Calculate total hours
    const totalLiveHours = bookings?.reduce((sum, b) => {
      if (b.status === 'completed') {
        const start = new Date(b.start_time);
        const end = new Date(b.end_time);
        return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      }
      return sum;
    }, 0) || 0;

    const averageRating = ratings?.length 
      ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length 
      : 0;

    return {
      totalEarnings: currentMonthStats.earnings,
      totalBookings: currentMonthStats.bookings,
      totalLive: currentMonthStats.lives,
      cancelledBookings: currentMonthStats.cancellations,
      rating: averageRating,
      totalLiveHours,
      joinDate: userData?.created_at || '',
      trends
    };
  },

  async getStreamerGallery(streamerId: number): Promise<StreamerGalleryPhoto[]> {
    const supabase = createClient();
    
    try {
      const { data, error } = await supabase
        .from('streamer_gallery_photos')
        .select('*')
        .eq('streamer_id', streamerId)
        .order('order_number', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching streamer gallery:', error);
      return [];
    }
  }
}; 