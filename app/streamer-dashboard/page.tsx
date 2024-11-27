"use client";

import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { signOutAction, acceptBooking, rejectBooking, startStream, endStream } from "@/app/actions";
import { useState, useEffect, useCallback } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { format, isToday, isThisWeek, isThisMonth, parseISO, differenceInHours } from 'date-fns';
import { Calendar, Clock, Monitor, DollarSign, MessageSquare, Link as LinkIcon, AlertTriangle, MapPin, Users, XCircle, Video } from 'lucide-react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Navbar } from "@/components/ui/navbar";

interface UserData {
  user_type: string;
  first_name: string;
}

interface Booking {
  id: number;
  client_id: string;
  client_first_name: string;
  client_last_name: string;
  streamer_id: number;
  start_time: string;
  end_time: string;
  platform: string;
  status: string;
  price: number;
  special_request?: string | null;
  stream_link?: string | null;
  sub_account_links?: Array<{
    link: string;
  }> | null;
}

// Add these utility functions at the top of the file
const roundToNearestHour = (date: Date): Date => {
  const rounded = new Date(date);
  rounded.setMinutes(date.getMinutes() >= 30 ? 60 : 0);
  rounded.setSeconds(0);
  rounded.setMilliseconds(0);
  return rounded;
};

const calculateDuration = (start: Date, end: Date): number => {
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60));
};

// Add this function at the top level of the file
function formatPrice(price: number): string {
  if (price < 1000) {
    return `Rp ${price}`;
  }
  const firstTwoDigits = Math.floor(price / 1000);
  return `Rp ${firstTwoDigits}K`;
}

function SubAccountLink({ link }: { link: string }) {
  return (
    <div className="mt-2 p-2 bg-gray-100 rounded-md text-xs">
      <p className="font-medium text-gray-700 flex items-center">
        <LinkIcon className="h-3 w-3 mr-1" />
        Sub Account Link:
      </p>
      <a 
        href={link} 
        target="_blank" 
        rel="noopener noreferrer" 
        className="text-blue-600 hover:underline break-all"
      >
        {link}
      </a>
    </div>
  );
}

function ScheduleCard({ booking, onStreamStart, onStreamEnd }: { booking: Booking, onStreamStart: () => void, onStreamEnd: () => void }) {
  const [isStartLiveModalOpen, setIsStartLiveModalOpen] = useState(false);
  const [streamLink, setStreamLink] = useState(booking.stream_link || '');
  const [isStarting, setIsStarting] = useState(false);

  const handleStartLive = async () => {
    setIsStarting(true);
    const result = await startStream(booking.id, streamLink);
    setIsStarting(false);
    
    if (result.success) {
      toast.success("Stream started successfully");
      setIsStartLiveModalOpen(false);
      onStreamStart();
    } else {
      toast.error(result.error || "Failed to start stream");
    }
  };

  const handleEndStream = async () => {
    try {
      const supabase = createClient();
      
      // Get streamer data first
      const { data: streamerData, error: streamerError } = await supabase
        .from('streamers')
        .select('first_name, last_name')
        .eq('id', booking.streamer_id)
        .single();

      if (streamerError) throw streamerError;

      // Update booking status
      const { error: bookingError } = await supabase
        .from('bookings')
        .update({ 
          status: 'completed',
          stream_link: null
        })
        .eq('id', booking.id);

      if (bookingError) throw bookingError;

      // Create notification for client using streamerData
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert([{
          user_id: booking.client_id,
          message: `Stream session with ${streamerData.first_name} ${streamerData.last_name} has ended.`,
          type: 'confirmation',
          booking_id: booking.id,
          created_at: new Date().toISOString(),
          is_read: false
        }]);

      if (notificationError) throw notificationError;

      toast.success("Stream ended successfully");
      onStreamEnd();

    } catch (error) {
      console.error('Error ending stream:', error);
      toast.error("Failed to end stream. Please try again.");
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 hover:border-[#E23744]/20 transition-all duration-200 p-3 sm:p-4">
      {/* Header */}
      <div className="flex justify-between items-start mb-2">
        <div className="space-y-1">
          <h3 className="font-bold text-sm sm:text-base">
            {booking.client_first_name} {booking.client_last_name}
          </h3>
          <div className="flex items-center gap-2">
            <MapPin className="h-3 w-3 sm:h-4 sm:w-4 text-[#E23744]" />
            <span className="text-xs sm:text-sm text-gray-600">Jakarta, Indonesia</span>
          </div>
        </div>
        <span className="text-[10px] sm:text-xs px-2 py-1 rounded-full font-medium bg-gradient-to-r from-yellow-500 to-yellow-600 text-white">
          {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
        </span>
      </div>

      {/* Booking Details */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 text-[#E23744]" />
          <span className="text-xs sm:text-sm text-gray-600">
            Rp {booking.price.toLocaleString('id-ID')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-3 w-3 sm:h-4 sm:w-4 text-[#E23744]" />
          <span className="text-xs sm:text-sm text-gray-600">
            {format(new Date(booking.start_time), 'MMMM d, yyyy')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-[#E23744]" />
          <span className="text-xs sm:text-sm text-gray-600">
            {format(new Date(booking.start_time), 'HH:mm')} - {format(new Date(booking.end_time), 'HH:mm')}
            <span className="text-gray-400 ml-1">
              ({differenceInHours(new Date(booking.end_time), new Date(booking.start_time))} hours)
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Monitor className="h-3 w-3 sm:h-4 sm:w-4 text-[#E23744]" />
          <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${
            booking.platform.toLowerCase() === 'shopee' 
              ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white' 
              : 'bg-gradient-to-r from-[#00f2ea] to-[#ff0050] text-white'
          }`}>
            {booking.platform}
          </span>
        </div>
      </div>

      {/* Stream Actions */}
      {booking.status === 'live' ? (
        <Button 
          onClick={handleEndStream}
          className="mt-3 w-full py-1.5 sm:py-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-xs sm:text-sm font-medium"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse mr-2" />
          End Stream
        </Button>
      ) : (
        <Button
          onClick={() => setIsStartLiveModalOpen(true)}
          className="mt-3 w-full py-1.5 sm:py-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-xs sm:text-sm font-medium"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse mr-2" />
          Start Live
        </Button>
      )}
    </div>
  );
}

function UpcomingSchedule({ bookings, onStreamStart, onStreamEnd }: { 
  bookings: Booking[], 
  onStreamStart: () => void, 
  onStreamEnd: () => void 
}) {
  const todayBookings = bookings.filter(booking => isToday(parseISO(booking.start_time)));
  const thisWeekBookings = bookings.filter(booking => isThisWeek(parseISO(booking.start_time)) && !isToday(parseISO(booking.start_time)));
  const thisMonthBookings = bookings.filter(booking => isThisMonth(parseISO(booking.start_time)) && !isThisWeek(parseISO(booking.start_time)));

  return (
    <Tabs defaultValue="today" className="w-full">
      <TabsList className="grid w-full grid-cols-3 bg-gray-50 p-1 rounded-lg mb-6">
        <TabsTrigger 
          value="today" 
          className="text-sm data-[state=active]:text-[#E23744] data-[state=active]:border-b-2 data-[state=active]:border-[#E23744]"
        >
          Today
        </TabsTrigger>
        <TabsTrigger 
          value="week"
          className="text-sm data-[state=active]:text-[#E23744] data-[state=active]:border-b-2 data-[state=active]:border-[#E23744]"
        >
          This Week
        </TabsTrigger>
        <TabsTrigger 
          value="month"
          className="text-sm data-[state=active]:text-[#E23744] data-[state=active]:border-b-2 data-[state=active]:border-[#E23744]"
        >
          This Month
        </TabsTrigger>
      </TabsList>
      <TabsContent value="today" className="space-y-4">
        {todayBookings.length > 0 ? todayBookings.map(booking => (
          <ScheduleCard key={booking.id} booking={booking} onStreamStart={onStreamStart} onStreamEnd={onStreamEnd} />
        )) : (
          <p className="text-center text-gray-500 py-6 bg-gray-50 rounded-lg text-sm">
            No bookings for today.
          </p>
        )}
      </TabsContent>
      <TabsContent value="week" className="space-y-4">
        {thisWeekBookings.length > 0 ? thisWeekBookings.map(booking => (
          <ScheduleCard key={booking.id} booking={booking} onStreamStart={onStreamStart} onStreamEnd={onStreamEnd} />
        )) : (
          <p className="text-center text-gray-500 py-6 bg-gray-50 rounded-lg text-sm">
            No bookings for this week.
          </p>
        )}
      </TabsContent>
      <TabsContent value="month" className="space-y-4">
        {thisMonthBookings.length > 0 ? thisMonthBookings.map(booking => (
          <ScheduleCard key={booking.id} booking={booking} onStreamStart={onStreamStart} onStreamEnd={onStreamEnd} />
        )) : (
          <p className="text-center text-gray-500 py-6 bg-gray-50 rounded-lg text-sm">
            No bookings for this month.
          </p>
        )}
      </TabsContent>
    </Tabs>
  );
}

function BookingCard({ booking, onAccept, onReject }: { 
  booking: Booking; 
  onAccept: (id: number) => void;
  onReject: (id: number) => void;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 hover:border-gray-200 transition-all duration-200">
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">
              {booking.client_first_name} {booking.client_last_name}
            </h3>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium
              ${booking.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                booking.status === 'accepted' ? 'bg-green-100 text-green-800' :
                'bg-red-100 text-red-800'}`}>
              {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
            </span>
          </div>
          <div className="text-xl font-bold text-gray-900">
            Rp {booking.price.toLocaleString('id-ID')}
          </div>
        </div>

        {/* Booking Details */}
        <div className="space-y-3 text-base text-gray-600">
          <div className="flex items-center gap-3">
            <div className="w-6 flex justify-center">
              <Calendar className="h-5 w-5 text-gray-400" />
            </div>
            <span>{format(new Date(booking.start_time), 'MMMM d, yyyy')}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 flex justify-center">
              <Clock className="h-5 w-5 text-gray-400" />
            </div>
            <span>
              {format(new Date(booking.start_time), 'HH:mm')} - {format(new Date(booking.end_time), 'HH:mm')}
              <span className="text-gray-400 ml-2">
                ({differenceInHours(new Date(booking.end_time), new Date(booking.start_time))} hours)
              </span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 flex justify-center">
              <Monitor className="h-5 w-5 text-gray-400" />
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              booking.platform.toLowerCase() === 'shopee' 
                ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white' 
                : 'bg-gradient-to-r from-[#00f2ea] to-[#ff0050] text-white'
            }`}>
              {booking.platform}
            </span>
          </div>
        </div>

        {/* Sub Account Link */}
        {booking.sub_account_links?.[0] && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-2">
            <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              Sub Account Link
            </p>
            <a 
              href={booking.sub_account_links[0].link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-800 break-all"
            >
              {booking.sub_account_links[0].link}
            </a>
          </div>
        )}

        {/* Special Request */}
        {booking.special_request && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-2">
            <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Special Request
            </p>
            <p className="text-sm text-gray-600">{booking.special_request}</p>
          </div>
        )}

        {/* Actions */}
        {booking.status === 'pending' && (
          <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
            <Button
              onClick={() => onAccept(booking.id)}
              className="flex-1 text-base bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
            >
              Accept
            </Button>
            <Button
              onClick={() => onReject(booking.id)}
              variant="outline"
              className="flex-1 text-base border-2 border-transparent bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white"
            >
              Reject
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// Update the AnalyticsCard component
const AnalyticsCard = ({ title, value, icon: Icon, trend }: { 
  title: string; 
  value: string; 
  icon: any;
  trend?: string;
}) => (
  <div className="bg-gradient-to-br from-white/60 to-white/30 backdrop-blur-sm border border-white/20 rounded-xl p-4 sm:p-5 shadow-sm hover:shadow transition-all duration-300">
    <div className="flex items-start gap-3">
      <div className="bg-gradient-to-r from-[#E23744] to-[#E23744]/80 p-2 rounded-lg flex-shrink-0">
        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
      </div>
      <div className="flex-1">
        <p className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1">{title}</p>
        <h3 className="text-sm sm:text-base font-bold text-[#E23744]">{value}</h3>
        {trend && (
          <p className="text-[10px] sm:text-xs text-green-500 mt-0.5 font-medium">
            +{trend}% from last month
          </p>
        )}
      </div>
    </div>
  </div>
);

export default function StreamerDashboard() {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        console.log("No authenticated user found");
        router.push("/sign-in");
        return;
      }

      console.log("User ID from auth:", user.id);

      // First, try to get the streamer data
      const { data: streamerData, error: streamerError } = await supabase
        .from('streamers')
        .select('id, user_id, first_name')
        .eq('user_id', user.id)
        .single();

      if (streamerError && streamerError.code !== 'PGRST116') {
        console.error("Error fetching streamer data:", streamerError);
        setError(`Error fetching data: ${streamerError.message}`);
        return;
      }

      let bookingsQuery;
      if (streamerData) {
        // User is a streamer
        setUserData({ user_type: 'streamer', first_name: streamerData.first_name });
        bookingsQuery = supabase
          .from('bookings')
          .select(`
            *,
            sub_account_links (
              link
            )
          `)
          .eq('streamer_id', streamerData.id)
          .not('status', 'eq', 'payment_pending')
          .order('start_time', { ascending: true });
      } else {
        // User is a client
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('first_name')
          .eq('id', user.id)
          .single();

        if (userError) {
          console.error("Error fetching user data:", userError);
          setError(`Error fetching user data: ${userError.message}`);
          return;
        }

        setUserData({ user_type: 'client', first_name: userData.first_name });
        bookingsQuery = supabase
          .from('bookings')
          .select('*')
          .eq('client_id', user.id)
          .order('start_time', { ascending: true });
      }

      const { data: bookingsData, error: bookingsError } = await bookingsQuery;

      if (bookingsError) {
        console.error("Error fetching bookings:", bookingsError);
        setError(`Error fetching bookings: ${bookingsError.message}`);
        return;
      }

      console.log("Fetched bookings data:", bookingsData); // Add this line for debugging

      if (!bookingsData || bookingsData.length === 0) {
        console.log("No bookings found");
        setBookings([]);
      } else {
        setBookings(bookingsData);
      }
    } catch (err) {
      console.error("Caught error:", err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  const calculateDuration = (startTime: string, endTime: string) => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    const roundedDuration = Math.round(durationHours * 10) / 10; // Round to 1 decimal place
    return `${roundedDuration} ${roundedDuration === 1 ? 'Hour' : 'Hours'}`;
  };

  useEffect(() => {
    fetchData();

    // Set up real-time subscription
    const supabase = createClient();
    const subscription = supabase
      .channel('bookings_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, async (payload: any) => {
        console.log("Received real-time update:", payload); // Add this line for debugging
        // Check if the new booking is for this streamer
        const { data: { user } } = await supabase.auth.getUser();
        const { data: streamerData } = await supabase
          .from('streamers')
          .select('id')
          .eq('user_id', user?.id)
          .single();

        if (streamerData && payload.new && payload.new.streamer_id === streamerData.id) {
          // Fetch client name
          const { data: clientData } = await supabase
            .from('users')
            .select('first_name, last_name')
            .eq('id', payload.new.client_id)
            .single();

          const clientName = clientData ? `${clientData.first_name} ${clientData.last_name}` : 'A client';
          const bookingDate = payload.new.start_time ? new Date(payload.new.start_time).toLocaleDateString() : 'Unknown date';
          const duration = payload.new.start_time && payload.new.end_time ? 
            calculateDuration(payload.new.start_time, payload.new.end_time) : 'Unknown duration';

          toast.info(`${clientName} has made a booking for you on ${bookingDate} for ${duration}.`, {
            position: "top-right",
            autoClose: 5000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
          });
        }
        fetchData();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchData]);

  const pendingBookings = bookings.filter(booking => booking.status === 'pending');
  const rejectedBookings = bookings.filter(booking => booking.status === 'rejected');
  const acceptedBookings = bookings.filter(booking => booking.status === 'accepted' || booking.status === 'live');

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'accepted':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'completed':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB');
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  const handleAcceptBooking = async (bookingId: number) => {
    const result = await acceptBooking(bookingId);
    if (result.success) {
      toast.success("Booking accepted successfully");
      fetchData(); // Refresh the bookings
    } else {
      toast.error(result.error || "Failed to accept booking");
    }
  };

  const handleRejectBooking = async (bookingId: number) => {
    const result = await rejectBooking(bookingId);
    if (result.success) {
      toast.success("Booking rejected successfully");
      fetchData(); // Refresh the bookings
    } else {
      toast.error(result.error || "Failed to reject booking");
    }
  };

  const handleStreamStart = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const handleStreamEnd = useCallback(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      </div>
    );
  }

  if (!userData) {
    return <div>No user data available</div>;
  }

  return (
    <div className="flex flex-col min-h-screen w-full">
      <Navbar />
      <div className="flex-grow w-full px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <ToastContainer />
        
        {/* Analytics Section - More compact on mobile */}
        <div className="mb-4 sm:mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
            <AnalyticsCard
              title="Total Earnings"
              value={`Rp ${(8500000).toLocaleString('id-ID')}`}
              icon={DollarSign}
              trend="8"
            />
            <AnalyticsCard
              title="Total Bookings"
              value="124"
              icon={Users}
              trend="12"
            />
            <AnalyticsCard
              title="Total Livestreams"
              value="89"
              icon={Video}
              trend="15"
            />
            <AnalyticsCard
              title="Total Rejected"
              value="23"
              icon={XCircle}
            />
          </div>
        </div>

        {/* Upcoming Schedule Card - Reduced padding and font sizes */}
        <Card className="mb-4 sm:mb-6 border-none shadow-xs hover:shadow-sm transition-all duration-200">
          <CardHeader className="text-[#E23744] border-b-2 border-gradient-to-r from-[#E23744] to-[#E23744]/80 p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-2xl font-bold">Upcoming Schedule</CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6">
            <UpcomingSchedule 
              bookings={acceptedBookings} 
              onStreamStart={handleStreamStart} 
              onStreamEnd={handleStreamEnd} 
            />
          </CardContent>
        </Card>

        {/* Booking Management Card - Reduced padding and font sizes */}
        <Card className="border-none shadow-xs hover:shadow-sm transition-all duration-200">
          <CardHeader className="text-[#E23744] border-b-2 border-gradient-to-r from-[#E23744] to-[#E23744]/80 p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-2xl font-bold">Booking Management</CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6">
            <Tabs defaultValue="pending" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-gray-50 p-1 rounded-lg mb-4 sm:mb-6">
                <TabsTrigger 
                  value="pending" 
                  className="text-xs sm:text-base py-1.5 sm:py-2 data-[state=active]:text-[#E23744] data-[state=active]:border-b-2 data-[state=active]:border-[#E23744]"
                >
                  Pending Bookings
                </TabsTrigger>
                <TabsTrigger 
                  value="rejected"
                  className="text-xs sm:text-base py-1.5 sm:py-2 data-[state=active]:text-[#E23744] data-[state=active]:border-b-2 data-[state=active]:border-[#E23744]"
                >
                  Rejected Bookings
                </TabsTrigger>
              </TabsList>

              {/* Update the booking cards to be more compact */}
              <TabsContent value="pending">
                <div className="space-y-3 sm:space-y-4">
                  {pendingBookings.map((booking) => (
                    <div key={booking.id} className="bg-white rounded-lg shadow-sm border border-gray-100 hover:border-[#E23744]/20 transition-all duration-200 p-3 sm:p-4">
                      {/* Header */}
                      <div className="flex justify-between items-start mb-3">
                        <div className="space-y-1">
                          <h3 className="font-bold text-sm sm:text-base">
                            {booking.client_first_name} {booking.client_last_name}
                          </h3>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3 w-3 sm:h-4 sm:w-4 text-[#E23744]" />
                            <span className="text-xs sm:text-sm text-gray-600">Jakarta, Indonesia</span>
                          </div>
                        </div>
                        <span className="text-[10px] sm:text-xs px-2 py-1 rounded-full font-medium bg-gradient-to-r from-yellow-500 to-yellow-600 text-white">
                          {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                        </span>
                      </div>

                      {/* Booking Details */}
                      <div className="space-y-2 text-xs sm:text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 text-[#E23744]" />
                          <span>Rp {booking.price.toLocaleString('id-ID')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 sm:h-4 sm:w-4 text-[#E23744]" />
                          <span>{format(new Date(booking.start_time), 'MMMM d, yyyy')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-[#E23744]" />
                          <span>
                            {format(new Date(booking.start_time), 'HH:mm')} - {format(new Date(booking.end_time), 'HH:mm')}
                            <span className="text-gray-400 ml-1">
                              ({differenceInHours(new Date(booking.end_time), new Date(booking.start_time))} hours)
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Monitor className="h-3 w-3 sm:h-4 sm:w-4 text-[#E23744]" />
                          <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${
                            booking.platform.toLowerCase() === 'shopee' 
                              ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white' 
                              : 'bg-gradient-to-r from-[#00f2ea] to-[#ff0050] text-white'
                          }`}>
                            {booking.platform}
                          </span>
                        </div>
                      </div>

                      {/* Special Request */}
                      {booking.special_request && (
                        <div className="mt-3 p-2 sm:p-3 bg-gray-50 rounded-lg space-y-1">
                          <p className="text-xs sm:text-sm font-medium text-gray-700 flex items-center gap-2">
                            <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4 text-[#E23744]" />
                            Special Request
                          </p>
                          <p className="text-xs sm:text-sm text-gray-600">{booking.special_request}</p>
                        </div>
                      )}

                      {/* Sub Account Link */}
                      {booking.sub_account_links?.[0] && (
                        <div className="mt-3 p-2 sm:p-3 bg-gray-50 rounded-lg space-y-1">
                          <p className="text-xs sm:text-sm font-medium text-gray-700 flex items-center gap-2">
                            <LinkIcon className="h-3 w-3 sm:h-4 sm:w-4 text-[#E23744]" />
                            Sub Account Link
                          </p>
                          <a 
                            href={booking.sub_account_links[0].link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs sm:text-sm text-[#E23744] hover:text-[#E23744]/80 break-all"
                          >
                            {booking.sub_account_links[0].link}
                          </a>
                        </div>
                      )}

                      {/* Action Buttons */}
                      {booking.status === 'pending' && (
                        <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
                          <Button
                            onClick={() => handleAcceptBooking(booking.id)}
                            className="flex-1 text-xs sm:text-sm py-2 bg-gradient-to-r from-[#E23744] to-[#E23744]/90 hover:from-[#E23744]/90 hover:to-[#E23744] text-white"
                          >
                            Accept
                          </Button>
                          <Button
                            onClick={() => handleRejectBooking(booking.id)}
                            variant="outline"
                            className="flex-1 text-xs sm:text-sm py-2 border-2 border-[#E23744] text-[#E23744] hover:bg-[#E23744]/10"
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}