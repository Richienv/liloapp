"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/app/actions";
import Image from "next/image";
import { useRouter, usePathname } from 'next/navigation';
import { LayoutDashboard, Settings, LogOut, Clock, MessageSquare, Bell } from 'lucide-react';
import { cn } from "@/lib/utils";
import dynamic from 'next/dynamic';

const NotificationsPopup = dynamic(() => import('@/components/notifications-popup').then(mod => mod.NotificationsPopup), { ssr: false });

interface UserData {
  id: string;
  email: string;
  first_name: string;
  user_type: 'streamer' | 'client';
  profile_picture_url: string | null;
  image_url?: string | null;
  streamer_id?: number;
}

interface ProfileButtonProps {
  user: UserData | null;
  showNameOnMobile?: boolean;
  className?: string;
}

export function ProfileButton({ user, showNameOnMobile = true, className }: ProfileButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isStreamerDashboard = pathname === '/streamer-dashboard';

  const handleSignOut = async () => {
    await signOutAction();
    router.push('/sign-in');
  };

  const getDashboardLink = () => {
    return user?.user_type === 'streamer' ? '/streamer-dashboard' : '/client-bookings';
  };

  const getSettingsLink = () => {
    return user?.user_type === 'streamer' ? '/settings?type=streamer' : '/settings';
  };

  const getProfilePictureUrl = () => {
    if (!user) return null;
    
    // Add debugging
    console.log('Profile Button User Data:', {
      user,
      profilePictureUrl: user.profile_picture_url,
      userType: user.user_type
    });
    
    // For streamers, check both profile_picture_url and image_url
    if (user.user_type === 'streamer') {
      return user.profile_picture_url || user.image_url || null;
    }
    
    return user.profile_picture_url;
  };

  const profilePictureUrl = getProfilePictureUrl();

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label="Menu akun"
          className={cn(
            // `transition-shadow` with no shadow to transition to was left over
            // from the lifted-card era; the ring the redesign uses is a
            // hairline that darkens on hover.
            "relative h-9 w-9 overflow-hidden rounded-full border border-hairline-input p-0 transition-colors hover:border-hairline-strong",
            className
          )}
        >
          {profilePictureUrl ? (
            <>
              <Image
                src={profilePictureUrl}
                alt={`${user.first_name}'s profile picture`}
                className="h-9 w-9 rounded-full object-cover"
                width={32}
                height={32}
                priority
                style={{ transform: 'none' }}
                onError={(e) => {
                  console.error('Error loading profile image:', e);
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement?.querySelector('.fallback')?.classList.remove('hidden');
                }}
              />
              {/*
                `hidden` still wins over `grid` in Tailwind's display ordering,
                so the fallback stays invisible until the image's error handler
                strips the class — same mechanism as before, one utility fewer.
              */}
              <span className="fallback hidden grid h-9 w-9 place-items-center rounded-full bg-surface-tint text-ui font-medium text-ink-muted">
                {user.first_name.charAt(0) || 'U'}
              </span>
            </>
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-tint text-ui font-medium text-ink-muted">
              {user.first_name.charAt(0) || 'U'}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        className="w-56 z-[100]" 
        align="end" 
        sideOffset={8}
        alignOffset={0}
        forceMount
        style={{ '--radix-dropdown-menu-content-transform-origin': 'var(--radix-popper-transform-origin)' } as React.CSSProperties}
      >
        {/*
          One language. This menu was the last English surface a signed-in
          brand met — "Messages / Dashboard / My Bookings / Settings / Log out"
          sitting directly under a bar that says "Cari host di Salda". Labels
          are Bahasa Indonesia in sentence case, and "Booking saya" is the same
          words the /client-bookings screen it opens uses for itself.
        */}
        <div className="block sm:hidden">
          <DropdownMenuItem onClick={() => router.push('/messages')} className="cursor-pointer text-copy">
            <MessageSquare className="mr-2 h-4 w-4 text-ink-soft" />
            <span>Pesan</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </div>

        <DropdownMenuItem onClick={() => router.push(getDashboardLink())} className="cursor-pointer text-copy">
          {user.user_type === 'streamer' ? (
            <>
              <LayoutDashboard className="mr-2 h-4 w-4 text-ink-soft" />
              <span>Dasbor host</span>
            </>
          ) : (
            <>
              <Clock className="mr-2 h-4 w-4 text-ink-soft" />
              <span>Booking saya</span>
            </>
          )}
        </DropdownMenuItem>
        {!isStreamerDashboard && (
          <DropdownMenuItem onClick={() => router.push(getSettingsLink())} className="cursor-pointer text-copy">
            <Settings className="mr-2 h-4 w-4 text-ink-soft" />
            <span>Pengaturan</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-copy">
          <LogOut className="mr-2 h-4 w-4 text-ink-soft" />
          <span>Keluar</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}