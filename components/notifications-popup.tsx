"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Bell, Check, CheckCheck, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { format, isToday, isYesterday, isThisWeek, isThisMonth } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { id } from 'date-fns/locale';
import { type NotificationType, markAllNotificationsAsRead, markNotificationAsRead } from '@/services/notification-service';
import { useRouter } from 'next/navigation';
import { getNotificationMessage } from '@/services/notification-templates';

// Add these utility functions
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

interface Notification {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
  type: NotificationType;
  is_read: boolean;
  metadata?: Record<string, any>;
  booking_id?: number;
  streamer_id?: number;
  bookings?: {
    id: number;
    client_id: string;
    streamer_id: number;
    start_time: string;
    end_time: string;
    platform: string;
    stream_link?: string;
    client_first_name: string;
    client_last_name: string;
    streamer?: {
      first_name: string;
      last_name: string;
    };
  };
}

interface NotificationGroup {
  title: string;
  notifications: Notification[];
}

interface UserData {
  id: string;
  user_type: 'streamer' | 'client';
  streamer_id?: number;
}

interface ExpandedState {
  [key: string]: boolean;
}

export function NotificationsPopup() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [userType, setUserType] = useState<'streamer' | 'client' | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const [expandedNotifications, setExpandedNotifications] = useState<ExpandedState>({});

  const groupNotifications = (notifications: Notification[]): NotificationGroup[] => {
    const groups: NotificationGroup[] = [];
    const now = new Date();

    // Limit notifications on mobile
    const notificationsToProcess = isMobile 
      ? notifications.slice(0, 5) 
      : notifications;

    notificationsToProcess.forEach(notification => {
      const date = new Date(notification.created_at);
      let group: NotificationGroup;

      if (isToday(date)) {
        group = groups.find(g => g.title === 'Hari Ini') || { title: 'Hari Ini', notifications: [] };
      } else if (isYesterday(date)) {
        group = groups.find(g => g.title === 'Kemarin') || { title: 'Kemarin', notifications: [] };
      } else if (isThisWeek(date)) {
        group = groups.find(g => g.title === 'Minggu Ini') || { title: 'Minggu Ini', notifications: [] };
      } else if (isThisMonth(date)) {
        group = groups.find(g => g.title === 'Bulan Ini') || { title: 'Bulan Ini', notifications: [] };
      } else {
        group = groups.find(g => g.title === 'Sebelumnya') || { title: 'Sebelumnya', notifications: [] };
      }

      if (!groups.includes(group)) {
        groups.push(group);
      }
      group.notifications.push(notification);
    });

    return groups;
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'booking_request':
        return '📅';
      case 'booking_payment':
        return '💰';
      case 'booking_accepted':
        return '✅';
      case 'booking_rejected':
        return '❌';
      case 'booking_cancelled':
        return '🚫';
      case 'stream_started':
        return '🎥';
      case 'stream_ended':
        return '🏁';
      case 'reschedule_request':
        return '🔄';
      case 'info':
        return 'ℹ️';
      case 'warning':
        return '⚠️';
      case 'confirmation':
        return '✓';
      case 'new_message':
        return '💬';
      default:
        return 'ℹ️';
    }
  };

  const getNotificationTitle = (type: NotificationType): string => {
    switch (type) {
      case 'booking_request':
        return 'Permintaan Booking';
      case 'booking_payment':
        return 'Konfirmasi Pembayaran';
      case 'booking_accepted':
        return 'Booking Diterima';
      case 'booking_rejected':
        return 'Booking Ditolak';
      case 'booking_cancelled':
        return 'Booking Dibatalkan';
      case 'stream_started':
        return 'Live Stream Dimulai';
      case 'stream_ended':
        return 'Live Stream Selesai';
      case 'reschedule_request':
        return 'Permintaan Reschedule';
      case 'reschedule_accepted':
        return 'Reschedule Diterima';
      case 'reschedule_rejected':
        return 'Reschedule Ditolak';
      case 'new_message':
        return 'Pesan Baru';
      case 'info':
        return 'Informasi';
      case 'warning':
        return 'Peringatan';
      case 'confirmation':
        return 'Konfirmasi';
      default:
        return 'Pemberitahuan';
    }
  };

  const handleNotificationSeen = async (id: string) => {
    try {
      // First verify the notification exists and belongs to the user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: notification, error: fetchError } = await supabase
        .from('notifications')
        .select('id, user_id')
        .eq('id', id)
        .single();

      if (fetchError || !notification) {
        console.error('Error fetching notification:', fetchError);
        return;
      }

      // Use RPC call instead of direct update
      const { error } = await supabase.rpc('mark_notification_as_read', {
        notification_id: id,
        user_identifier: user.id
      });

      if (error) {
        console.error('Error marking notification as read:', error);
      } else {
        await fetchNotifications();
      }
    } catch (error) {
      console.error('Error in handleNotificationSeen:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Use RPC call instead of direct update
      const { error } = await supabase.rpc('mark_all_notifications_as_read', {
        user_identifier: user.id
      });

      if (error) {
        console.error('Error marking all notifications as read:', error);
      } else {
        await fetchNotifications();
      }
    } catch (error) {
      console.error('Error in handleMarkAllAsRead:', error);
    }
  };

  const fetchNotifications = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.log('No authenticated user found');
        return;
      }

      // First get user type and data
      const { data: userData } = await supabase
        .from('users')
        .select('user_type')
        .eq('id', user.id)
        .single();

      if (!userData) {
        console.error('User data not found');
        return;
      }

      setUserType(userData.user_type);

      let notificationsQuery = supabase
        .from('notifications')
        .select(`
          id,
          user_id,
          streamer_id,
          message,
          type,
          created_at,
          is_read,
          booking_id,
          bookings (*)
        `)
        .neq('type', 'new_message') // Filter out new_message notifications
        .order('created_at', { ascending: false });

      if (userData.user_type === 'streamer') {
        // Get streamer_id first
        const { data: streamerData } = await supabase
          .from('streamers')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (streamerData) {
          // Get conversations where streamer is participant
          notificationsQuery = notificationsQuery
            .or(`streamer_id.eq.${streamerData.id},user_id.eq.${user.id}`);
        }
      } else {
        // For clients, get their conversations
        notificationsQuery = notificationsQuery
          .eq('user_id', user.id);
      }

      const { data: notifications, error } = await notificationsQuery;

      if (error) {
        console.error('Error fetching notifications:', error);
        return;
      }

      console.log('Raw notifications data:', notifications);
      
      const processedNotifications = (notifications as any[])?.map(notification => {
        const message = formatNotificationMessage(notification, userData.user_type as 'client' | 'streamer');
        console.log('Processing notification:', {
          id: notification.id,
          type: notification.type,
          bookingData: notification.bookings,
          streamLink: notification.bookings?.stream_link,
          formattedMessage: message
        });
        return {
          ...notification,
          message
        } as Notification;
      }) || [];

      setNotifications(processedNotifications);
      // Only count non-message notifications for the bell icon
      setUnreadCount(processedNotifications.filter(n => !n.is_read).length);

    } catch (error) {
      console.error('Error in fetchNotifications:', error);
    }
  }, [supabase]);

  // Update the formatNotificationMessage function
  const formatNotificationMessage = (notification: any, userType: 'client' | 'streamer'): string => {
    if (!notification) return '';

    if (notification.bookings) {
      const booking = notification.bookings;
      const startTime = new Date(booking.start_time);
      const endTime = new Date(booking.end_time);
      const duration = calculateDuration(startTime, endTime);
      
      // Get the stored timezone or default to browser timezone
      const userTimezone = booking.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      // Format the dates in the user's timezone
      const formattedStartTime = formatInTimeZone(startTime, userTimezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
      const formattedEndTime = formatInTimeZone(endTime, userTimezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
      
      const templateData = {
        streamer_name: `${booking.streamer?.first_name} ${booking.streamer?.last_name}`,
        client_name: `${booking.client_first_name} ${booking.client_last_name}`,
        start_time: formattedStartTime,
        end_time: formattedEndTime,
        platform: booking.platform,
        duration,
        message: notification.message,
        reason: booking.reason,
        stream_link: booking.stream_link
      };

      return getNotificationMessage(notification.type, userType, templateData);
    }

    // For non-booking notifications, pass through the message
    return getNotificationMessage(notification.type, userType, { message: notification.message });
  };

  useEffect(() => {
    fetchNotifications();

    const channel = supabase
      .channel('notifications-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        },
        async (payload) => {
          console.log('New notification received:', payload);
          
          // Skip updating notifications UI if it's a new message notification
          if (payload.new?.type === 'new_message') {
            console.log('Skipping new message notification in notifications popup');
            return;
          }
          
          // Immediately update notifications UI for other notification types
          await fetchNotifications();
        }
      )
      .subscribe((status) => {
        console.log('Notifications subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // 640px is the sm breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const toggleNotificationExpansion = (id: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent triggering the read state
    setExpandedNotifications(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative w-12 sm:w-14 h-12 sm:h-14 hover:bg-surface-tint transition-colors" 
          onClick={() => {
            if (isMobile) {
              router.push('/notifications');
            } else {
              setIsOpen(true);
              fetchNotifications();
            }
          }}
        >
          <Bell className="h-6 sm:h-7 w-6 sm:w-7" />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 sm:right-3 min-w-[20px] h-5 px-1 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      {!isMobile && (
        <PopoverContent 
          className="notification-popup w-96 p-0 rounded-lg"
          align="end"
          sideOffset={4}
        >
          <div className="flex flex-col h-full">
            <div className="bg-surface-tint px-4 py-3 flex justify-between items-center border-b border-hairline-input flex-shrink-0">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">Notifikasi</h3>
                {unreadCount > 0 && (
                  <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded-full text-sm font-medium">
                    {unreadCount} Baru
                  </span>
                )}
              </div>
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMarkAllAsRead}
                  className="text-sm text-ink-muted"
                >
                  <CheckCheck className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">Tandai Semua</span>
                  <span className="sm:hidden">Tandai</span>
                </Button>
              )}
            </div>

            <div 
              className="overflow-y-auto overscroll-contain touch-auto flex-1"
              style={{ 
                maxHeight: isMobile ? 'calc(100vh - 180px)' : '500px',
                WebkitOverflowScrolling: 'touch'
              }}
            >
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 px-4">
                  <Bell className="w-12 h-12 text-ink-ghost mb-3" />
                  <p className="text-ink-soft text-center">Tidak ada notifikasi baru</p>
                </div>
              ) : (
                <div className="pb-safe">
                  {groupNotifications(notifications).map((group) => (
                    <div key={group.title} className="mb-2">
                      <div className="bg-surface-tint/80 px-4 py-2 text-sm font-medium text-ink-muted sticky top-0">
                        {group.title}
                      </div>
                      {group.notifications.map((notification) => (
                        <div 
                          key={notification.id} 
                          className={`notification-item px-4 py-3 border-b border-hairline ${
                            !notification.is_read ? 'bg-blue-50/60' : ''
                          } ${
                            expandedNotifications[notification.id] ? 'expanded' : ''
                          }`}
                        >
                          <div className="flex gap-3">
                            <span className="text-xl flex-shrink-0 w-8 h-8 flex items-center justify-center">
                              {getNotificationIcon(notification.type)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <h4 className="font-medium text-sm text-ink truncate">
                                  {getNotificationTitle(notification.type)}
                                </h4>
                                <div className="flex items-center gap-2">
                                  <time className="text-xs text-ink-soft whitespace-nowrap">
                                    {format(new Date(notification.created_at), 'HH:mm', { locale: id })}
                                  </time>
                                  <button
                                    onClick={(e) => toggleNotificationExpansion(notification.id, e)}
                                    className="p-1 hover:bg-surface-tint rounded-full transition-colors"
                                  >
                                    {expandedNotifications[notification.id] ? (
                                      <ChevronUp className="h-4 w-4 text-ink-soft" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4 text-ink-soft" />
                                    )}
                                  </button>
                                </div>
                              </div>
                              <div 
                                className={`notification-content ${
                                  expandedNotifications[notification.id] ? 'max-h-96' : 'max-h-12'
                                }`}
                              >
                                <p className={`text-sm text-ink-muted mt-0.5 ${
                                  expandedNotifications[notification.id] ? '' : 'notification-preview'
                                }`}>
                                  {notification.type === 'stream_started' && notification.bookings?.stream_link ? (
                                    <>
                                      {notification.message.split(notification.bookings?.stream_link || '').map((part, index, array) => {
                                        if (index === array.length - 1) {
                                          return <span key={index}>{part}</span>;
                                        }
                                        const streamLink = notification.bookings?.stream_link;
                                        if (!streamLink) return null;
                                        return (
                                          <React.Fragment key={index}>
                                            {part}
                                            <a 
                                              href={streamLink} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                window.open(streamLink, '_blank');
                                              }}
                                            >
                                              {streamLink}
                                            </a>
                                          </React.Fragment>
                                        );
                                      })}
                                    </>
                                  ) : (
                                    notification.message
                                  )}
                                </p>
                              </div>
                              <div className="flex items-center justify-between mt-2">
                                <p className="text-xs text-ink-faint">
                                  {format(new Date(notification.created_at), 'dd MMM yyyy', { locale: id })}
                                </p>
                                {!notification.is_read && (
                                  <button
                                    onClick={() => handleNotificationSeen(notification.id)}
                                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                                  >
                                    Tandai Dibaca
                                  </button>
                                )}
                              </div>
                            </div>
                            {!notification.is_read && (
                              <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}