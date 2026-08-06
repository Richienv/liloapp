import { SITE_URL } from '@/lib/site'
import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { notFound, permanentRedirect } from 'next/navigation'
import { MapPin, Tag, ChevronRight } from 'lucide-react'
import { defaultMetadata } from '../../metadata'
import { BreadcrumbStructuredData } from '@/components/structured-data/breadcrumb-data'
import { subtotalWithPlatformFee } from '@/lib/pricing'
import {
  CITIES,
  getCityBySlug,
  locationMatchValues,
  resolveCity,
  type City,
} from '@/lib/cities'

// Sourced from one place: the previous hardcoded host had expired, so every
// page advertising it was telling Google to de-index the live site.
const BASE_URL = SITE_URL

// Pre-render one page per registry city at build time and refresh hourly.
// Unknown params still hit this route (dynamicParams stays on by default) so the
// legacy-URL redirect below keeps working for anything Google already indexed.
export const revalidate = 3600

interface LocationPageProps {
  params: { city: string }
}

interface LocationStreamer {
  id: number
  first_name: string | null
  last_name: string | null
  username: string | null
  location: string | null
  city_slug: string | null
  category: string | null
  price: number
  profile_picture_url: string | null
}

// The avatar lives in `streamers.image_url`. `profile_picture_url` is a column
// on `users`, not on this table, so selecting it by that name made PostgREST
// reject the whole query — which surfaced as "this city has no hosts" rather
// than as an error. Aliased so the rows keep the shape the component expects.
const STREAMER_COLUMNS =
  'id, first_name, last_name, username, location, city_slug, category, price, profile_picture_url:image_url'

/**
 * Read-only Supabase client with no cookie access.
 *
 * `utils/supabase/server` calls `cookies()`, which forces dynamic rendering and
 * would make `generateStaticParams` below pointless. City pages are public, so
 * the anon key is enough.
 */
function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export function generateStaticParams() {
  return CITIES.map((city) => ({ city: city.slug }))
}

/**
 * Map a route param onto a canonical city.
 *
 * `canonical` is false whenever the incoming param isn't already the slug — e.g.
 * the capitalised `/location/Jakarta` and encoded `/location/DKI%20Jakarta`
 * URLs that are already indexed. The page permanently redirects those to
 * `/location/jakarta` so every city has exactly one indexable URL.
 */
function matchRouteCity(param: string): { city: City; canonical: boolean } | null {
  let raw = param
  try {
    raw = decodeURIComponent(param)
  } catch {
    // Malformed percent-encoding: fall through with the raw param, which will
    // simply fail to resolve and 404.
  }

  const bySlug = getCityBySlug(raw)
  if (bySlug) {
    return { city: bySlug, canonical: raw === bySlug.slug }
  }

  // Display name ("DKI Jakarta"), alias ("jogja"), or a legacy free-text value.
  const byAlias = resolveCity(raw)
  if (byAlias) {
    return { city: byAlias, canonical: false }
  }

  return null
}

/**
 * Streamers listable in this city.
 *
 * Two queries rather than one, because `city_slug` and the legacy free-text
 * `location` column coexist:
 *  1. rows the backfill reached, matched exactly on the canonical `city_slug`;
 *  2. rows it could not reach (`city_slug IS NULL`), matched against every
 *     spelling the registry knows for this city.
 * `city_slug` wins whenever it is set, so a row explicitly assigned to another
 * city can never be dragged back in by a stale `location` string.
 *
 * The bookability rule — `is_active = true AND verification_status = 'approved'`
 * — is applied to both.
 */
async function getLocationStreamers(city: City): Promise<LocationStreamer[]> {
  try {
    const supabase = createPublicClient()

    const [canonical, legacy] = await Promise.all([
      supabase
        .from('streamers')
        .select(STREAMER_COLUMNS)
        .eq('is_active', true)
        .eq('verification_status', 'approved')
        .eq('city_slug', city.slug),
      supabase
        .from('streamers')
        .select(STREAMER_COLUMNS)
        .eq('is_active', true)
        .eq('verification_status', 'approved')
        .is('city_slug', null)
        .in('location', locationMatchValues(city)),
    ])

    if (canonical.error) {
      console.error(`[location/${city.slug}] canonical query failed:`, canonical.error.message)
    }
    if (legacy.error) {
      console.error(`[location/${city.slug}] legacy query failed:`, legacy.error.message)
    }

    const rows = [
      ...((canonical.data ?? []) as LocationStreamer[]),
      ...((legacy.data ?? []) as LocationStreamer[]),
    ]

    // De-duplicate defensively, and drop rows without a username: their card
    // would link to `/undefined`.
    const seen = new Set<number>()
    return rows.filter((row) => {
      if (seen.has(row.id)) return false
      if (!row.username || row.username.trim().length === 0) return false
      seen.add(row.id)
      return true
    })
  } catch (error) {
    console.error(`[location/${city.slug}] unexpected error:`, error)
    return []
  }
}

export async function generateMetadata({ params }: LocationPageProps): Promise<Metadata> {
  const match = matchRouteCity(params.city)

  if (!match) {
    return { title: 'Kota tidak ditemukan' }
  }

  const { city } = match
  const streamers = await getLocationStreamers(city)
  const canonicalUrl = `${BASE_URL}/location/${city.slug}`

  const title = `Live Streamer Profesional di ${city.name} | Salda`
  const description =
    streamers.length > 0
      ? `Temukan ${streamers.length} host live streaming profesional di ${city.name}, ${city.province}. Book live streaming Shopee & TikTok untuk tingkatkan penjualan UMKM Anda.`
      : `Daftar host live streaming profesional di ${city.name}, ${city.province}. Book live streaming Shopee & TikTok untuk tingkatkan penjualan UMKM Anda.`

  return {
    title,
    description,
    openGraph: {
      ...defaultMetadata.openGraph,
      title: `Live Streamer Profesional di ${city.name}`,
      description,
      url: canonicalUrl,
    },
    alternates: {
      // Always the lowercase slug form. The old value was the URL-encoded
      // display name, so `/location/DKI%20Jakarta` self-canonicalised instead of
      // consolidating onto one URL.
      canonical: canonicalUrl,
    },
    // A city with no listable streamers is thin content: still reachable and
    // still passes link equity onward, but kept out of the index.
    robots:
      streamers.length > 0
        ? undefined
        : { index: false, follow: true },
  }
}

export default async function LocationPage({ params }: LocationPageProps) {
  const match = matchRouteCity(params.city)

  if (!match) {
    notFound()
  }

  const { city, canonical } = match

  // `next.config.js` isn't ours to edit, so the 308 (permanent) redirect for
  // already-indexed legacy URLs lives here instead of in a `redirects()` block.
  if (!canonical) {
    permanentRedirect(`/location/${city.slug}`)
  }

  const streamers = await getLocationStreamers(city)

  const breadcrumbItems = [
    { name: 'Beranda', url: BASE_URL },
    { name: 'Kota', url: `${BASE_URL}/locations` },
    { name: city.name, url: `${BASE_URL}/location/${city.slug}` },
  ]

  return (
    <>
      <BreadcrumbStructuredData items={breadcrumbItems} />

      <main className="mx-auto max-w-5xl px-4 py-10">
        {/* Visible breadcrumb, mirroring the JSON-LD above. This is also the only
            way a crawler can walk back up to the city index. */}
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-gray-500">
            <li>
              <Link href="/" className="hover:text-blue-600">
                Beranda
              </Link>
            </li>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <li>
              <Link href="/locations" className="hover:text-blue-600">
                Kota
              </Link>
            </li>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <li aria-current="page" className="text-gray-900">
              {city.name}
            </li>
          </ol>
        </nav>

        <header className="mb-8">
          <p className="inline-flex items-center gap-1 text-sm text-gray-500">
            <MapPin className="h-4 w-4" /> {city.name}, {city.province}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
            Live Streamer Profesional di {city.name}
          </h1>
          <p className="mt-2 text-gray-600">
            {streamers.length > 0
              ? `${streamers.length} host live streaming siap membantu meningkatkan penjualan Anda.`
              : `Belum ada host live streaming terverifikasi di ${city.name} saat ini.`}
          </p>
        </header>

        {streamers.length > 0 ? (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {streamers.map((s) => {
              const displayPrice = Math.round(subtotalWithPlatformFee(s.price))
              const fullName = [s.first_name, s.last_name].filter(Boolean).join(' ').trim()
              return (
                <li key={s.id}>
                  <Link
                    href={`/${s.username}`}
                    className="group flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.profile_picture_url || '/images/default-avatar.png'}
                      alt={fullName || 'Host live streaming'}
                      className="mb-3 h-40 w-full rounded-xl object-cover"
                    />
                    <h2 className="font-semibold text-gray-900 group-hover:text-blue-600">
                      {fullName || s.username}
                    </h2>
                    {s.category && (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500">
                        <Tag className="h-3 w-3" /> {s.category}
                      </p>
                    )}
                    <p className="mt-auto pt-3 text-sm font-medium text-gray-900">
                      Rp {displayPrice.toLocaleString('id-ID')}
                      <span className="font-normal text-gray-500">/jam</span>
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-600">
              Live streaming berjalan sepenuhnya online, jadi host dari kota lain tetap bisa
              membantu penjualan Anda.
            </p>
            <Link
              href="/locations"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Lihat host di kota lain <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        <p className="mt-10 text-sm text-gray-500">
          Cari di kota lain?{' '}
          <Link href="/locations" className="font-medium text-blue-600 hover:text-blue-700">
            Lihat semua kota
          </Link>
          .
        </p>
      </main>
    </>
  )
}
