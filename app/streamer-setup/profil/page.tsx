import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Store } from "lucide-react";

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
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.08)] sm:p-8">
          <h1 className="text-xl font-semibold text-gray-900">Halaman khusus host</h1>
          <p className="mt-2 text-gray-600">
            Akun ini terdaftar sebagai brand, bukan host.
          </p>
          <Link
            href="/protected"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r
              from-blue-600 to-indigo-600 px-5 font-medium text-white transition-all
              hover:from-blue-700 hover:to-indigo-700"
          >
            Kembali ke beranda
          </Link>
        </div>
      </main>
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
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link
        href="/streamer-setup"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke setup
      </Link>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
        <div className="p-6 sm:p-8">
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
            <Store className="h-4 w-4" /> Langkah 1 dari 3
          </span>
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Lengkapi profil kamu</h1>
          <p className="mt-2 text-gray-600">
            Ini yang dilihat brand sebelum memesan, plus alamat untuk pengiriman produk.
            Delapan isian, sekitar 4 menit — foto galeri dan video perkenalan bisa
            ditambahkan nanti kapan saja.
          </p>

          <div className="mt-6">
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
        </div>
      </div>
    </main>
  );
}
