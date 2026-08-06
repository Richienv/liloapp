import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/server";
import { getCityBySlug, resolveCity } from "@/lib/cities";
import { suggestUsername } from "@/lib/username";
import { markProfileSetupStarted } from "../actions";
import { ProfileForm } from "./profile-form";

export const metadata = {
  title: "Lengkapi Profil Host | Salda",
  robots: { index: false, follow: false },
};

// The form is pre-filled from the row it is about to overwrite, so a cached
// render would hand the host stale defaults.
export const dynamic = "force-dynamic";

export default async function StreamerSetupProfilePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in?redirect_to=/streamer-setup/profil");
  }

  const { data: streamer } = await supabase
    .from("streamers")
    .select(
      "id, username, image_url, city_slug, location, full_address, category, platform, price, bio",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: profile } = await supabase
    .from("users")
    .select("first_name, last_name, user_type, city_slug, location")
    .eq("id", user.id)
    .maybeSingle();

  if (!streamer && profile?.user_type === "client") {
    return (
      <div className="min-h-screen bg-canvas">
        <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="rounded-frame border border-hairline bg-surface p-5 sm:p-8">
            <h1 className="font-serif text-title font-semibold text-ink">
              Halaman khusus host
            </h1>
            <p className="mt-2 text-copy text-ink-muted">
              Akun ini terdaftar sebagai brand, bukan host.
            </p>
            <div className="mt-6">
              <Button asChild variant="brand" size="action">
                <Link href="/protected">Kembali ke beranda</Link>
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Reaching this line is the definition of "started setup": authenticated, not
  // a brand, looking at the form. There is no write to hang the event off — the
  // host has not typed anything yet — so the page view is the signal. Awaited
  // rather than fired-and-forgotten because a serverless request can be torn
  // down the moment the response is flushed, which would drop the insert.
  await markProfileSetupStarted();

  // Smart default #1: a username the host never has to invent. Their own name
  // is almost always what they would have typed, and it arrives editable.
  const defaultUsername =
    streamer?.username ??
    suggestUsername(profile?.first_name ?? "", profile?.last_name ?? "");

  // Smart default #2: the city. `city_slug` is canonical; a legacy free-text
  // `location` is resolved so an existing host is not asked to re-pick, and the
  // users row is the last fallback since brand and host share an address.
  const defaultCitySlug =
    getCityBySlug(streamer?.city_slug)?.slug ??
    resolveCity(streamer?.location)?.slug ??
    getCityBySlug(profile?.city_slug)?.slug ??
    resolveCity(profile?.location)?.slug ??
    "";

  const defaultPlatforms = (streamer?.platform ?? "")
    .split(",")
    .map((value: string) => value.trim())
    .filter(Boolean);

  const rawPrice =
    typeof streamer?.price === "string" ? Number(streamer.price) : streamer?.price;

  return (
    <div className="min-h-screen bg-canvas">
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <header>
          <Link
            href="/streamer-setup"
            className="-ml-1 inline-flex items-center gap-1 text-meta text-ink-soft transition-colors hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" />
            Kembali ke setup
          </Link>

          {/* Step label as a mono eyebrow, not a blue pill: the accent on this
              page belongs to the button that saves the form. */}
          <p className="mt-4 font-mono text-tiny uppercase text-ink-ghost">
            Langkah 1 dari 3
          </p>
          <h1 className="mt-2 font-serif text-section font-semibold text-ink sm:text-display">
            Lengkapi profil kamu
          </h1>
          <p className="mt-2 text-lede text-ink-soft">
            Ini yang dilihat brand sebelum memesan, plus alamat untuk pengiriman produk.
            Delapan isian, sekitar 4 menit — foto galeri dan video perkenalan bisa
            ditambahkan nanti kapan saja.
          </p>
        </header>

        <div className="mt-8 rounded-frame border border-hairline bg-surface p-4 sm:p-6">
          <ProfileForm
            defaultUsername={defaultUsername}
            currentImageUrl={streamer?.image_url ?? null}
            defaultCitySlug={defaultCitySlug}
            defaultFullAddress={streamer?.full_address ?? ""}
            defaultCategory={streamer?.category ?? ""}
            defaultPlatforms={defaultPlatforms}
            defaultPrice={
              typeof rawPrice === "number" && Number.isFinite(rawPrice) && rawPrice > 0
                ? rawPrice
                : null
            }
            defaultBio={streamer?.bio ?? ""}
          />
        </div>
      </main>
    </div>
  );
}
