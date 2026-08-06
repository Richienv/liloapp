"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Flag,
  Info,
  MessageSquare,
  Radio,
  RefreshCw,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

  /**
   * Line icons, not emoji — the same set the full page at /notifications uses.
   *
   * The emoji rendered in the system colour font: twelve different hues in a
   * 384px-wide panel whose whole rule is one accent, and a different shape
   * budget on every platform. A stroked glyph inherits `text-ink-soft` like
   * every other mark in the row, which leaves the unread dot as the only
   * colour in the list — the one place colour is carrying meaning.
   */
  const getNotificationIcon = (type: NotificationType): LucideIcon => {
    switch (type) {
      case 'booking_request': return CalendarDays;
      case 'booking_payment': return Wallet;
      case 'booking_accepted': return Check;
      case 'booking_rejected': return X;
      case 'booking_cancelled': return Ban;
      case 'stream_started': return Radio;
      case 'stream_ended': return Flag;
      case 'reschedule_request': return RefreshCw;
      case 'info': return Info;
      case 'warning': return AlertTriangle;
      case 'confirmation': return BadgeCheck;
      case 'new_message': return MessageSquare;
      default: return Info;
    }
  };

  /**
   * Sentence case. "Permintaan Booking" was Title Case, which the design brief
   * rules out everywhere — English capitalisation habits applied to Indonesian,
   * where a mid-sentence capital reads as a proper noun.
   *
   * These strings are display-only; nothing groups or filters on them.
   */
  const getNotificationTitle = (type: NotificationType): string => {
    switch (type) {
      case 'booking_request':
        return 'Permintaan booking';
      case 'booking_payment':
        return 'Konfirmasi pembayaran';
      case 'booking_accepted':
        return 'Booking diterima';
      case 'booking_rejected':
        return 'Booking ditolak';
      case 'booking_cancelled':
        return 'Booking dibatalkan';
      case 'stream_started':
        return 'Live stream dimulai';
      case 'stream_ended':
        return 'Live stream selesai';
      case 'reschedule_request':
        return 'Permintaan reschedule';
      case 'reschedule_accepted':
        return 'Reschedule diterima';
      case 'reschedule_rejected':
        return 'Reschedule ditolak';
      case 'new_message':
        return 'Pesan baru';
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
        <button
          type="button"
          aria-label="Notifikasi"
          className="relative grid h-9 w-9 place-items-center rounded-field text-ink-soft transition-colors hover:bg-surface-tint hover:text-ink"
          onClick={() => {
            if (isMobile) {
              router.push('/notifications');
            } else {
              setIsOpen(true);
              fetchNotifications();
            }
          }}
        >
          <Bell className="h-5 w-5" />
          {/*
            Ink, not red. This bell sits in chrome that floats above every
            screen in the product; a coloured badge here would be a second
            accent on whatever page is underneath it.
          */}
          {unreadCount > 0 && (
            <span className="numeric absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ink px-1 text-mini font-medium leading-none text-canvas">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      {/*
        `notification-popup` is gone from the class list on purpose. That global
        rule paints a white fill and a two-layer drop shadow — the exact thing
        the redesign replaces with a hairline — and its only other job was the
        stacking context, which the z-index token below does directly. The panel
        is now a card: a border, a radius, no shadow.
      */}
      {!isMobile && (
        <PopoverContent
          className="z-[var(--z-notification)] w-96 overflow-hidden rounded-panel border-hairline bg-surface p-0"
          align="end"
          sideOffset={8}
        >
          <div className="flex h-full flex-col">
            <div className="flex flex-shrink-0 items-center gap-3 border-b border-hairline bg-canvas px-4 py-3">
              <h3 className="min-w-0 truncate font-serif text-title font-semibold text-ink">
                Notifikasi
              </h3>
              {/*
                A dot and a number, the same mark the unread rows carry — not a
                pill reading "3 Baru". The word was the only thing on the panel
                explaining the dot, and the dot explains itself.
              */}
              {unreadCount > 0 && (
                <span className="flex shrink-0 items-center gap-1.5 rounded-chip border border-hairline bg-surface px-2 py-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                  <span className="numeric text-mini font-medium text-ink-body">{unreadCount}</span>
                </span>
              )}
              {notifications.length > 0 && (
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={handleMarkAllAsRead}
                  className="ml-auto h-8 shrink-0 gap-1.5 px-3 text-mini"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Tandai dibaca
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
                <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
                  <Bell className="h-6 w-6 text-ink-ghost" />
                  <p className="mt-3 text-copy text-ink-soft">Tidak ada notifikasi baru</p>
                </div>
              ) : (
                <div className="pb-safe">
                  {groupNotifications(notifications).map((group, groupIndex) => (
                    <section key={group.title}>
                      {/*
                        Eyebrow, not a heading: mono, 11px, tracked, ghost ink.
                        It keeps the date context visible through a long scroll
                        without the rows gaining a second type size.
                      */}
                      <div
                        className={cn(
                          "sticky top-0 z-[var(--z-sticky)] border-b border-hairline-soft bg-surface-tint px-4 py-2",
                          "font-mono text-tiny uppercase text-ink-ghost",
                          groupIndex > 0 && "border-t border-hairline-soft",
                        )}
                      >
                        {group.title}
                      </div>

                      {group.notifications.map((notification, rowIndex) => {
                        const Icon = getNotificationIcon(notification.type);
                        const isExpanded = Boolean(expandedNotifications[notification.id]);
                        const streamLink = notification.bookings?.stream_link;

                        return (
                          <article
                            key={notification.id}
                            className={cn(
                              "px-4 py-3.5 transition-colors hover:bg-surface-raised",
                              rowIndex > 0 && "border-t border-hairline-soft",
                            )}
                          >
                            <div className="flex gap-3">
                              {/*
                                Unread is a dot in a reserved gutter, not a blue
                                wash across the row. A tinted row makes every
                                unread notification look like a warning, and the
                                gutter keeps read and unread rows on one left
                                edge instead of shifting by a marker's width.
                              */}
                              <span className="mt-2 flex h-1.5 w-1.5 shrink-0 items-center justify-center">
                                {!notification.is_read && (
                                  <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                                )}
                              </span>

                              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-chip border border-hairline-soft bg-surface-tint text-ink-soft">
                                <Icon className="h-3.5 w-3.5" />
                              </span>

                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-2">
                                  <h4
                                    className={cn(
                                      "min-w-0 flex-1 truncate text-ui text-ink",
                                      notification.is_read ? "font-medium" : "font-semibold",
                                    )}
                                  >
                                    {getNotificationTitle(notification.type)}
                                  </h4>
                                  <time className="numeric shrink-0 text-mini text-ink-faint">
                                    {format(new Date(notification.created_at), 'HH:mm', { locale: id })}
                                  </time>
                                  <button
                                    type="button"
                                    onClick={(e) => toggleNotificationExpansion(notification.id, e)}
                                    aria-expanded={isExpanded}
                                    aria-label={getNotificationTitle(notification.type)}
                                    className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-chip text-ink-ghost transition-colors hover:bg-surface-tint hover:text-ink-body"
                                  >
                                    {isExpanded ? (
                                      <ChevronUp className="h-3.5 w-3.5" />
                                    ) : (
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </div>

                                <p
                                  className={cn(
                                    "mt-1 text-copy text-ink-muted",
                                    !isExpanded && "line-clamp-2",
                                  )}
                                >
                                  {notification.type === 'stream_started' && streamLink ? (
                                    <>
                                      {notification.message.split(streamLink).map((part, index, array) => {
                                        if (index === array.length - 1) {
                                          return <span key={index}>{part}</span>;
                                        }
                                        return (
                                          <React.Fragment key={index}>
                                            {part}
                                            {/*
                                              Underlined ink, not a blue link.
                                              The unread dot already spends the
                                              accent on this panel, and two blue
                                              marks in one row mean two
                                              different things at the same
                                              volume.
                                            */}
                                            <a
                                              href={streamLink}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="break-all font-medium text-ink underline decoration-hairline-strong underline-offset-2 transition-colors hover:decoration-ink"
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

                                <div className="mt-2.5 flex items-center justify-between gap-3">
                                  <p className="numeric min-w-0 truncate text-mini text-ink-faint">
                                    {format(new Date(notification.created_at), 'dd MMM yyyy', { locale: id })}
                                  </p>
                                  {!notification.is_read && (
                                    <Button
                                      variant="quiet"
                                      size="sm"
                                      onClick={() => handleNotificationSeen(notification.id)}
                                      className="h-7 shrink-0 px-2.5 text-mini"
                                    >
                                      Tandai dibaca
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </section>
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