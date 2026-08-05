import { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'
import { getCityBySlug, resolveCity, type City } from '@/lib/cities'

const BASE_URL = 'https://salda.id'

// The sitemap is regenerated hourly rather than on every crawl: it fans out over
// the whole streamer table, and Google refetches it far more often than the data
// actually changes.
export const revalidate = 3600

interface ListableStreamerRow {
  username: string | null
  updated_at: string | null
  city_slug: string | null
  location: string | null
}

/**
 * Read-only Supabase client with no cookie access.
 *
 * `utils/supabase/server` calls `cookies()`, which opts the caller into fully
 * dynamic rendering. The sitemap only ever reads publicly-visible rows, so it
 * uses the anon key directly and stays cacheable via `revalidate` above.
 */
function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

/**
 * Every streamer that is publicly listable.
 *
 * Bookability rule (app-wide): a streamer belongs in public listings only when
 * `is_active = true AND verification_status = 'approved'`. Anything else —
 * pending, rejected, suspended, deactivated — must never reach Google.
 */
async function fetchListableStreamers(): Promise<ListableStreamerRow[]> {
  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase
      .from('streamers')
      .select('username, updated_at, city_slug, location')
      .eq('is_active', true)
      .eq('verification_status', 'approved')

    if (error) {
      // Degrade to the static routes instead of throwing. A 500 on /sitemap.xml
      // makes Google drop the whole document; a short sitemap it simply
      // re-crawls. This previously used `.throwOnError()`.
      console.error('[sitemap] failed to load streamers:', error.message)
      return []
    }

    return (data ?? []) as ListableStreamerRow[]
  } catch (error) {
    console.error('[sitemap] unexpected error loading streamers:', error)
    return []
  }
}

/**
 * Canonical city for a row: the backfilled `city_slug` when present, otherwise a
 * best-effort resolve of the legacy free-text `location`. Returns null when the
 * row's location matches nothing in the registry — those streamers still get a
 * profile URL, they just don't contribute to a city page.
 */
function cityForRow(row: ListableStreamerRow): City | null {
  return getCityBySlug(row.city_slug) ?? resolveCity(row.location)
}

/** `updated_at` is nullable and free-form; never hand an Invalid Date to the XML serializer. */
function lastModified(value: string | null): Date {
  if (!value) return new Date()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const streamers = await fetchListableStreamers()

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${BASE_URL}/locations`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/sign-in`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/sign-up`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ]

  // Profile URLs are `/<username>`, so a row without a username used to emit
  // `https://salda.id/undefined` — one bad row poisoned the sitemap with a URL
  // that 404s. Drop those rows here regardless of what signup/backfill does.
  const streamerRoutes: MetadataRoute.Sitemap = streamers
    .filter((s) => typeof s.username === 'string' && s.username.trim().length > 0)
    .map((s) => ({
      url: `${BASE_URL}/${encodeURIComponent(s.username!.trim())}`,
      lastModified: lastModified(s.updated_at),
      changeFrequency: 'weekly',
      priority: 0.8,
    }))

  // Only emit a city page that has at least one listable streamer. The city
  // route renders an un-indexable empty state for the rest, and listing those
  // in the sitemap would just feed Google thin pages.
  const streamersPerCity = new Map<string, City>()
  for (const row of streamers) {
    const city = cityForRow(row)
    if (city) streamersPerCity.set(city.slug, city)
  }

  // Array.from rather than spread: tsconfig targets ES5, where Map iterators
  // aren't spreadable without downlevelIteration.
  const cityRoutes: MetadataRoute.Sitemap = Array.from(streamersPerCity.values())
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((city) => ({
      url: `${BASE_URL}/location/${city.slug}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    }))

  return [...staticRoutes, ...cityRoutes, ...streamerRoutes]
}
