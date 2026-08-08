import { SITE_URL } from '@/lib/site'
import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { notFound, permanentRedirect } from 'next/navigation'
import { MapPin, Tag, ChevronRight } from 'lucide-react'
import { defaultMetadata } from '../../metadata'
import { BreadcrumbStructuredData } from '@/components/structured-data/breadcrumb-data'
import { subtotalWithPlatformFee } from '@/lib/pricing'
import { Button } from '@/components/ui/button'
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
      ? `Temukan ${streamers.length} host live streaming profesional di ${city.name}, ${city.province}. Book live streaming Shopee & TikTok untuk tingkatkan penjualan UMKM kamu.`
      : `Daftar host live streaming profesional di ${city.name}, ${city.province}. Book live streaming Shopee & TikTok untuk tingkatkan penjualan UMKM kamu.`

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

      <main className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 sm:py-12">
        {/* Visible breadcrumb, mirroring the JSON-LD above. This is also the only
            way a crawler can walk back up to the city index. The separators are
            list items rather than bare icons: an <ol> whose children are not
            <li> is a list a screen reader stops counting. */}
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1.5 text-meta text-ink-soft">
            <li>
              <Link href="/" className="transition-colors hover:text-ink">
                Beranda
              </Link>
            </li>
            <li aria-hidden="true" className="flex items-center">
              <ChevronRight className="h-3 w-3 text-ink-ghost" />
            </li>
            <li>
              <Link href="/locations" className="transition-colors hover:text-ink">
                Kota
              </Link>
            </li>
            <li aria-hidden="true" className="flex items-center">
              <ChevronRight className="h-3 w-3 text-ink-ghost" />
            </li>
            <li aria-current="page" className="text-ink">
              {city.name}
            </li>
          </ol>
        </nav>

        <header className="mt-6">
          {/* Mono eyebrow, ghost ink — the same mark every other section label
              in the product carries, so the province reads as context and not
              as a second headline. */}
          <p className="inline-flex items-center gap-1.5 font-mono text-tiny uppercase text-ink-ghost">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {city.name}, {city.province}
          </p>
          <h1 className="mt-2 font-serif text-section font-semibold text-ink sm:text-display">
            Live streamer profesional di {city.name}
          </h1>
          <p className="mt-3 max-w-[62ch] text-lede text-ink-soft">
            {streamers.length > 0 ? (
              <>
                <span className="numeric text-ink">{streamers.length}</span> host live
                streaming siap membantu meningkatkan penjualan kamu.
              </>
            ) : (
              `Belum ada host live streaming terverifikasi di ${city.name} saat ini.`
            )}
          </p>
        </header>

        {streamers.length > 0 ? (
          /*
            One framed grid, not a scatter of bordered cards. Each cell carries
            `shadow-cell` instead of a border: two bordered neighbours draw their
            shared seam twice and it renders 2px, which reads as a bug. The
            container's own border plus `overflow-hidden` clips the outermost
            rings, so every line on this grid is exactly 1px.
          */
          <ul className="mt-8 grid grid-cols-1 overflow-hidden rounded-frame border border-hairline bg-surface sm:grid-cols-2 lg:grid-cols-3">
            {streamers.map((s) => {
              const displayPrice = Math.round(subtotalWithPlatformFee(s.price))
              const fullName = [s.first_name, s.last_name].filter(Boolean).join(' ').trim()
              return (
                <li key={s.id} className="shadow-cell">
                  <Link
                    href={`/${s.username}`}
                    className="flex h-full flex-col p-4 transition-colors hover:bg-surface-raised"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.profile_picture_url || '/images/default-avatar.png'}
                      alt={fullName || 'Host live streaming'}
                      className="mb-3.5 h-40 w-full rounded-panel bg-surface-tint object-cover"
                    />
                    <h2 className="truncate text-ui font-medium text-ink">
                      {fullName || s.username}
                    </h2>
                    {s.category && (
                      <p className="mt-1 flex min-w-0 items-center gap-1.5 text-meta text-ink-soft">
                        <Tag className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
                        <span className="truncate">{s.category}</span>
                      </p>
                    )}
                    {/* The price is the fact that decides whether the card gets
                        read at all, so it is the largest thing in the cell. */}
                    <p className="mt-auto flex flex-wrap items-baseline gap-x-1.5 pt-3.5">
                      <span className="numeric text-price font-semibold text-ink">
                        Rp {displayPrice.toLocaleString('id-ID')}
                      </span>
                      <span className="text-mini text-ink-soft">/ jam</span>
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="mt-8 rounded-frame border border-hairline bg-surface px-5 py-16 text-center">
            <p className="font-serif text-title font-semibold text-ink">
              Belum ada host di {city.name}
            </p>
            <p className="mx-auto mt-2 max-w-md text-meta text-ink-soft">
              Live streaming berjalan sepenuhnya online, jadi host dari kota lain tetap bisa
              membantu penjualan kamu.
            </p>
            <div className="mt-6 flex justify-center">
              <Button asChild variant="brand" size="action-compact">
                <Link href="/locations">Lihat host di kota lain</Link>
              </Button>
            </div>
          </div>
        )}

        <p className="mt-10 text-meta text-ink-soft">
          Cari di kota lain?{' '}
          <Link
            href="/locations"
            className="font-medium text-ink underline decoration-hairline-strong underline-offset-2 transition-colors hover:decoration-ink"
          >
            Lihat semua kota
          </Link>
          .
        </p>
      </main>
    </>
  )
}
