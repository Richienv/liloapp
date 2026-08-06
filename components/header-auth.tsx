import { signOutAction } from "@/app/actions";
import { hasEnvVars } from "@/utils/supabase/check-env-vars";
import Link from "next/link";
import { Button } from "./ui/button";
import { createClient } from "@/utils/supabase/server";
import { ProfileButton } from "./profile-button";

interface UserData {
  id: string;
  email: string;
  first_name: string;
  user_type: 'streamer' | 'client';
  profile_picture_url: string | null;
  image_url?: string | null;
  streamer_id?: number;
}

export default async function AuthButton() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userData: UserData | null = null;

  if (user) {
    // Fetch user data from the database
    const { data: userBasicData } = await supabase
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

    if (userBasicData) {
      userData = {
        ...userBasicData,
        image_url: null,
        streamer_id: undefined
      };

      // If user is a streamer, fetch additional streamer data
      if (userBasicData.user_type === 'streamer') {
        const { data: streamerData } = await supabase
          .from('streamers')
          .select(`
            id,
            image_url
          `)
          .eq('user_id', user.id)
          .single();

        if (streamerData) {
          userData = {
            ...userData,
            profile_picture_url: streamerData.image_url || userData.profile_picture_url,
            streamer_id: streamerData.id
          };
        }
      }
    }
  }

  if (!hasEnvVars) {
    return (
      <>
        <div className="flex flex-nowrap items-center gap-4">
          <span className="min-w-0 truncate text-meta text-ink-soft">
            Lengkapi .env.local dengan anon key dan url Supabase
          </span>
          <div className="flex flex-nowrap gap-2">
            <Button
              asChild
              variant="quiet"
              size="action-compact"
              disabled
              className="pointer-events-none opacity-75"
            >
              <Link href="/sign-in">Masuk</Link>
            </Button>
            <Button
              asChild
              variant="brand"
              size="action-compact"
              disabled
              className="pointer-events-none opacity-75"
            >
              <Link href="/sign-up">Daftar</Link>
            </Button>
          </div>
        </div>
      </>
    );
  }

  return user ? (
    <div className="flex items-center gap-4">
      <ProfileButton user={userData} />
    </div>
  ) : (
    // `flex-nowrap`: the signed-out pair is the only thing in this slot and it
    // never breaks onto two lines.
    <div className="flex flex-nowrap gap-2">
      <Button asChild variant="quiet" size="action-compact">
        <Link href="/sign-in">Masuk</Link>
      </Button>
      <Button asChild variant="brand" size="action-compact">
        <Link href="/sign-up">Daftar</Link>
      </Button>
    </div>
  );
}
