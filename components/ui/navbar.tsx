"use client";

import { createClient } from "@/utils/supabase/client";
import Link from "next/link";
import Image from "next/image";
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { Input } from "@/components/ui/input";
import { usePathname, useRouter } from 'next/navigation';
import { Search, MessageCircle } from "lucide-react";
import { RealtimeChannel } from '@supabase/supabase-js';

const NotificationsPopup = dynamic(
  () => import('@/components/notifications-popup').then(mod => mod.NotificationsPopup),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-9 w-9 place-items-center">
        <div className="h-5 w-5 animate-pulse rounded-full bg-surface-deep" />
      </div>
    )
  }
);

const ProfileButton = dynamic(
  () => import('@/components/profile-button').then(mod => mod.ProfileButton), 
  { 
    ssr: false,
    loading: () => (
      <div className="h-9 w-9 animate-pulse rounded-full bg-surface-deep" />
    )
  }
);

/**
 * Unread counters, in ink rather than in the accent.
 *
 * The navbar floats above every screen in the product, so its colour budget is
 * not its own — a blue mark up here would be a second accent on whatever page
 * happens to be underneath, and the rule is one per section. A dark badge on
 * the warm canvas is the highest-contrast mark available without spending the
 * accent, and the count itself is `.numeric` so 9 and 11 occupy the same width
 * instead of nudging the icon sideways.
 */
function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="numeric absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ink px-1 text-mini font-medium leading-none text-canvas">
      {count > 99 ? '99+' : count}
    </span>
  );
}

interface NavbarProps {
  onFilterChange?: (value: string) => void;
}

interface UserData {
  id: string;
  email: string;
  first_name: string;
  user_type: 'streamer' | 'client';
  profile_picture_url: string | null;
  streamer_id?: number;
  image_url?: string | null;
}

export function Navbar({ onFilterChange }: NavbarProps) {
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [dashboardLink, setDashboardLink] = useState("/");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [userType, setUserType] = useState<'streamer' | 'client' | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchUserData = async () => {
      setIsLoadingUser(true);
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        try {
          const { data: userBasicData, error: userError } = await supabase
            .from('users')
            .select(`
              id, 
              email, 
              first_name, 
              user_type, 
              profile_picture_url
            `)
            .eq('id', user.id)
            .single();

          if (userError) throw userError;

          if (userBasicData) {
            let finalUserData: UserData = {
              ...userBasicData
            };
            
            setUserType(userBasicData.user_type as 'streamer' | 'client');

            if (userBasicData.user_type === 'streamer') {
              setDashboardLink("/streamer-dashboard");
              
              const { data: streamerData, error: streamerError } = await supabase
                .from('streamers')
                .select(`
                  id,
                  image_url
                `)
                .eq('user_id', user.id)
                .single();
              
              if (streamerError) throw streamerError;

              if (streamerData) {
                finalUserData = {
                  ...finalUserData,
                  profile_picture_url: streamerData.image_url || userBasicData.profile_picture_url,
                  image_url: streamerData.image_url,
                  streamer_id: streamerData.id
                };
              }
            } else {
              setDashboardLink("/protected");
            }

            setUserData(finalUserData);
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
        } finally {
          setIsLoadingUser(false);
        }
      } else {
        setIsLoadingUser(false);
      }
    };

    fetchUserData();
  }, []);

  useEffect(() => {
    const fetchUnreadMessages = async () => {
      if (!user) return;
      
      setIsLoadingMessages(true);
      try {
        // Get user type first
        const { data: userData } = await supabase
          .from('users')
          .select('user_type')
          .eq('id', user.id)
          .single();

        if (!userData) return;

        let query = supabase
          .from('messages')
          .select('id, conversation_id', { count: 'exact' })
          .eq('is_read', false)
          .neq('sender_id', user.id);

        if (userData.user_type === 'streamer') {
          // Get streamer_id first
          const { data: streamerData } = await supabase
            .from('streamers')
            .select('id')
            .eq('user_id', user.id)
            .single();

          if (streamerData) {
            // Get conversations where streamer is participant
            const { data: conversations } = await supabase
              .from('conversations')
              .select('id')
              .eq('streamer_id', streamerData.id);

            if (conversations?.length) {
              query = query.in('conversation_id', conversations.map(c => c.id));
            }
          }
        } else {
          // For clients, get their conversations
          const { data: conversations } = await supabase
            .from('conversations')
            .select('id')
            .eq('client_id', user.id);

          if (conversations?.length) {
            query = query.in('conversation_id', conversations.map(c => c.id));
          }
        }

        const { count } = await query;
        setUnreadMessages(count || 0);
      } catch (error) {
        console.error('Error fetching unread messages:', error);
      } finally {
        setIsLoadingMessages(false);
      }
    };

    // Initial fetch
    fetchUnreadMessages();

    let channel: RealtimeChannel;

    const setupSubscription = async () => {
      // Clean up any existing subscription
      if (channel) {
        await supabase.removeChannel(channel);
      }

      // Create new subscription
      channel = supabase
        .channel('notifications-channel') // Use same channel name as notifications component
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications'
          },
          (payload: any) => {
            console.log('Notification received in navbar:', {
              payload,
              type: payload.new?.type,
              isNewMessage: payload.new?.type === 'new_message',
              currentCount: unreadMessages
            });

            if (payload.new?.type === 'new_message') {
              console.log('New message notification received, updating count from', unreadMessages, 'to', unreadMessages + 1);
              setUnreadMessages(prev => {
                console.log('Previous unread count:', prev);
                return prev + 1;
              });
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
            filter: `is_read=eq.true`
          },
          () => {
            console.log('Messages marked as read, refreshing count');
            fetchUnreadMessages();
          }
        );

      // Subscribe and log status
      const status = await channel.subscribe();
      console.log('Navbar subscription status:', status);
    };

    // Setup subscription if we have a user
    if (user) {
      setupSubscription();
    }

    return () => {
      // Cleanup subscription
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [user, supabase, unreadMessages]); // Add proper dependencies

  const isStreamerDashboard = pathname === '/streamer-dashboard';

  // Message button skeleton component
  const MessageButtonSkeleton = () => (
    <div className="grid h-9 w-9 place-items-center">
      <div className="h-5 w-5 animate-pulse rounded-full bg-surface-deep" />
    </div>
  );

  return (
    /*
      One horizontal edge, and it is a hairline.

      The bar was `bg-[#faf9f6]` over `border-black/5` — the canvas value typed
      out by hand, and a translucent black rule that darkens differently over
      every surface it crosses. Both are tokens now, and the bar keeps a single
      fixed height at each breakpoint so the row can never grow a second line.

      `z-40` is left exactly as it was. The `--z-navbar` token (1030) would sit
      above the profile dropdown's portal, which renders at z-100 on <body>, so
      raising the bar would hide the menu behind it.
    */
    <div className="relative z-40 w-full border-b border-hairline bg-canvas">
      <nav className="mx-auto w-full max-w-[2000px] px-3 sm:px-6 lg:px-20">
        <div className="flex h-14 items-center gap-3 sm:h-16 sm:gap-5">
          <Link href={dashboardLink} className="flex shrink-0 items-center">
            {/*
              The logo was rendered 64px tall, which made the chrome taller than
              a booking row and left the bar reading as a page header rather
              than navigation. 36px sits it on the same optical line as the
              icons beside it.
            */}
            <Image
              src="/images/salda-logoB.png"
              alt="Salda"
              width={200}
              height={200}
              className="h-8 w-auto object-contain sm:h-9"
              priority
            />
          </Link>

          {!isStreamerDashboard && onFilterChange && (
            /*
              A field, not a field plus a blue disc. The disc was a `<div>` with
              a cursor and no handler — filtering happens on every keystroke —
              so it was a decorative accent standing in front of the one thing
              on this bar that is actually interactive. The magnifier moves
              inside, in ink, where it labels the field instead of pretending to
              submit it.
            */
            <div className="min-w-0 flex-1 sm:max-w-[520px]">
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className={`pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors ${
                    isSearchFocused ? 'text-ink-body' : 'text-ink-faint'
                  }`}
                />
                <Input
                  type="text"
                  placeholder="Cari host di Salda"
                  aria-label="Cari host di Salda"
                  className="h-10 w-full rounded-pill border-hairline-input bg-surface pl-10 pr-4 text-ui text-ink placeholder:text-ink-faint focus-visible:border-ink-faint focus-visible:ring-0 focus-visible:ring-offset-0"
                  onChange={(e) => onFilterChange(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                />
              </div>
            </div>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            {isLoadingUser ? (
              <>
                <MessageButtonSkeleton />
                <MessageButtonSkeleton />
                <div className="mx-1 hidden h-6 w-px bg-hairline sm:block" />
                <div className="h-9 w-9 animate-pulse rounded-full bg-surface-deep" />
              </>
            ) : userData ? (
              <>
                <Link
                  href="/messages"
                  aria-label="Pesan"
                  className="relative grid h-9 w-9 place-items-center rounded-field text-ink-soft transition-colors hover:bg-surface-tint hover:text-ink"
                >
                  {isLoadingMessages ? (
                    <div className="h-5 w-5 animate-pulse rounded-full bg-surface-deep" />
                  ) : (
                    <>
                      <MessageCircle className="h-5 w-5" />
                      <UnreadBadge count={unreadMessages} />
                    </>
                  )}
                </Link>
                <NotificationsPopup />
                <div className="mx-1 hidden h-6 w-px bg-hairline sm:block" />
                <ProfileButton user={userData} />
              </>
            ) : (
              <ProfileButton user={userData} />
            )}
          </div>
        </div>
      </nav>
    </div>
  );
}
