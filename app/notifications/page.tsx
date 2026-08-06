"use client";

import { useEffect, useState } from 'react';
import {
  Bell,
  ArrowLeft,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  CalendarDays,
  Wallet,
  Check,
  X,
  Ban,
  Radio,
  Flag,
  RefreshCw,
  Info,
  AlertTriangle,
  BadgeCheck,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import { format, isToday, isYesterday, isThisWeek, isThisMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { type NotificationType } from '@/services/notification-service';
import { getNotificationMessage } from '@/services/notification-templates';
import React from 'react';

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

interface ExpandedState {
  [key: string]: boolean;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const router = useRouter();
  const supabase = createClient();
  const [expandedNotifications, setExpandedNotifications] = useState<ExpandedState>({});

  /**
   * Line icons, not emoji.
   *
   * The emoji set that used to live here rendered in the system colour font —
   * twelve different hues on a page whose whole rule is one accent. A stroked
   * glyph inherits `text-ink-soft` like every other mark on the row, so the
   * only colour left in the list is the unread dot, which is the one thing
   * colour is actually carrying meaning for.
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

  const getNotificationTitle = (type: NotificationType): string => {
    switch (type) {
      case 'booking_request': return 'Permintaan Booking';
      case 'booking_payment': return 'Konfirmasi Pembayaran';
      case 'booking_accepted': return 'Booking Diterima';
      case 'booking_rejected': return 'Booking Ditolak';
      case 'booking_cancelled': return 'Booking Dibatalkan';
      case 'stream_started': return 'Live Stream Dimulai';
      case 'stream_ended': return 'Live Stream Selesai';
      case 'reschedule_request': return 'Permintaan Reschedule';
      case 'new_message': return 'Pesan Baru';
      case 'info': return 'Informasi';
      case 'warning': return 'Peringatan';
      case 'confirmation': return 'Konfirmasi';
      default: return 'Pemberitahuan';
    }
  };

  const groupNotifications = (notifications: Notification[]): NotificationGroup[] => {
    const groups: NotificationGroup[] = [];
    const now = new Date();

    notifications.forEach(notification => {
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

  const handleNotificationSeen = async (id: string) => {
    try {
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

  const calculateDuration = (start: Date, end: Date): number => {
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60));
  };

  const formatNotificationMessage = (notification: any, userType: 'client' | 'streamer'): string => {
    if (!notification) return '';

    if (notification.bookings) {
      const booking = notification.bookings;
      const startTime = new Date(booking.start_time);
      const endTime = new Date(booking.end_time);
      const duration = calculateDuration(startTime, endTime);

      const templateData = {
        streamer_name: `${booking.streamer?.first_name} ${booking.streamer?.last_name}`,
        client_name: `${booking.client_first_name} ${booking.client_last_name}`,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        platform: booking.platform,
        duration,
        message: notification.message,
        reason: booking.reason,
        stream_link: booking.stream_link
      };

      return getNotificationMessage(notification.type, userType, templateData);
    }

    return getNotificationMessage(notification.type, userType, { message: notification.message });
  };

  const fetchNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('user_type')
        .eq('id', user.id)
        .single();

      if (!userData) return;

      let query = supabase
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
          bookings (
            id,
            client_id,
            streamer_id,
            start_time,
            end_time,
            platform,
            stream_link,
            client_first_name,
            client_last_name,
            streamer:streamers (
              first_name,
              last_name
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (userData.user_type === 'streamer') {
        const { data: streamerData } = await supabase
          .from('streamers')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (streamerData) {
          query = query
            .or(`streamer_id.eq.${streamerData.id},user_id.eq.${user.id}`);
        }
      } else {
        query = query
          .eq('user_id', user.id);
      }

      const { data: notifications, error } = await query;

      if (error) {
        console.error('Error fetching notifications:', error);
        return;
      }

      const processedNotifications = (notifications as any[])?.map(notification => {
        const message = formatNotificationMessage(notification, userData.user_type as 'client' | 'streamer');
        return {
          ...notification,
          message
        } as Notification;
      }) || [];

      setNotifications(processedNotifications);
      setUnreadCount(processedNotifications.filter(n => !n.is_read).length);
    } catch (error) {
      console.error('Error in fetchNotifications:', error);
    }
  };

  useEffect(() => {
    fetchNotifications();

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const toggleNotificationExpansion = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setExpandedNotifications(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const groups = groupNotifications(notifications);

  return (
    <div className="min-h-screen bg-canvas">
      {/*
        The bar is `bg-canvas`, not white. A white bar over a warm canvas draws
        a second horizontal edge under the hairline and reads as two headers.
      */}
      <header className="sticky top-0 z-[var(--z-navbar)] border-b border-hairline bg-canvas">
        <div className="mx-auto flex h-14 max-w-[760px] items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Kembali"
            className="-ml-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-field text-ink-soft transition-colors hover:bg-surface-tint hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <h1 className="min-w-0 truncate font-serif text-title font-semibold text-ink">
            Notifikasi
          </h1>

          {/*
            The count is a number and a dot, no label. The dot is the same mark
            the unread rows carry, which is what makes the number legible
            without a word next to it — and a word here would be copy the
            reference does not have.
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
      </header>

      {/*
        `pb-16` rather than `pb-safe`: the safe-area utility sets padding-bottom
        outright, so pairing the two would leave the last row 20px from the
        bottom of the panel on a phone. 64px clears the home indicator on its
        own.
      */}
      <div className="mx-auto max-w-[760px] px-4 pb-16 pt-6 sm:px-6">
        <div className="overflow-hidden rounded-panel border border-hairline bg-surface">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-5 py-20 text-center">
              <Bell className="h-6 w-6 text-ink-ghost" />
              <p className="mt-3 text-copy text-ink-soft">Tidak ada notifikasi baru</p>
            </div>
          ) : (
            groups.map((group, groupIndex) => (
              <section key={group.title}>
                {/*
                  Eyebrow, not a heading: mono, 11px, tracked, ghost ink. It
                  sticks under the 56px bar so the date context survives a long
                  scroll without the row rhythm gaining a second type size.
                */}
                <div
                  className={cn(
                    "sticky top-14 z-[var(--z-sticky)] border-b border-hairline-soft bg-surface-tint px-5 py-2",
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
                        "px-5 py-4 transition-colors hover:bg-surface-raised",
                        rowIndex > 0 && "border-t border-hairline-soft",
                      )}
                    >
                      <div className="flex gap-3">
                        {/*
                          Unread is a dot in a reserved 6px gutter, not a fill on
                          the row. A tinted row makes every unread notification
                          look like a warning; a dot says "new" and nothing else,
                          and the gutter keeps read and unread rows on the same
                          left edge instead of shifting by the width of a marker.
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
                          <div className="flex min-w-0 items-center gap-3">
                            <h2
                              className={cn(
                                "min-w-0 flex-1 truncate text-ui text-ink",
                                notification.is_read ? "font-medium" : "font-semibold",
                              )}
                            >
                              {getNotificationTitle(notification.type)}
                            </h2>
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
                                        Underlined ink, not a blue link. The dot
                                        is already the one accent on this screen;
                                        a second blue on the same row would make
                                        the reader choose between two "look here"
                                        marks that mean different things.
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
            ))
          )}
        </div>
      </div>
    </div>
  );
}
