import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { MapPin, ChevronRight, Users } from 'lucide-react'
import { defaultMetadata } from '../metadata'
import { BreadcrumbStructuredData } from '@/components/structured-data/breadcrumb-data'
import { CityListStructuredData } from '@/components/structured-data/city-list-data'
import { getCityBySlug, resolveCity, type City } from '@/lib/cities'
import { SITE_URL, absoluteUrl } from '@/lib/site'

const BASE_URL = SITE_URL
const CANONICAL_URL = absoluteUrl('/locations')

export const revalidate = 3600

interface CityRow {
  city_slug: string | null
  location: string | null
}

interface CityEntry {
  city: City
  count: number
}

/**
 * Read-only Supabase client with no cookie access, so this hub can be statically
 * rendered and revalidated rather than re-queried on every crawl.
 */
function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

/**
 * Count listable streamers per canonical city.
 *
 * A row's city is its backfilled `city_slug` when present, falling back to
 * resolving the legacy free-text `location`. Rows that resolve to nothing in the
 * registry are simply not counted anywhere — they have no city page to link to.
 *
 * Bookability rule: `is_active = true AND verification_status = 'approved'`.
 */
async function getCitiesWithStreamers(): Promise<CityEntry[]> {
  let rows: CityRow[] = []

  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase
      .from('streamers')
      .select('city_slug, location')
      .eq('is_active', true)
      .eq('verification_status', 'approved')

    if (error) {
      console.error('[locations] failed to load streamers:', error.message)
    } else {
      rows = (data ?? []) as CityRow[]
    }
  } catch (error) {
    console.error('[locations] unexpected error:', error)
  }

  const counts = new Map<string, CityEntry>()
  for (const row of rows) {
    const city = getCityBySlug(row.city_slug) ?? resolveCity(row.location)
    if (!city) continue

    const existing = counts.get(city.slug)
    if (existing) {
      existing.count += 1
    } else {
      counts.set(city.slug, { city, count: 1 })
    }
  }

  // Array.from rather than spread: tsconfig targets ES5, where Map iterators
  // aren't spreadable without downlevelIteration.
  return Array.from(counts.values()).sort((a, b) =>
    a.city.name.localeCompare(b.city.name, 'id')
  )
}

/** Group cities under their province, both sorted for a stable render. */
function groupByProvince(entries: CityEntry[]): { province: string; cities: CityEntry[] }[] {
  const groups = new Map<string, CityEntry[]>()
  for (const entry of entries) {
    const bucket = groups.get(entry.city.province)
    if (bucket) {
      bucket.push(entry)
    } else {
      groups.set(entry.city.province, [entry])
    }
  }

  return Array.from(groups.entries())
    .map(([province, cities]) => ({
      province,
      cities: cities.sort((a, b) => a.city.name.localeCompare(b.city.name, 'id')),
    }))
    .sort((a, b) => a.province.localeCompare(b.province, 'id'))
}

export async function generateMetadata(): Promise<Metadata> {
  const entries = await getCitiesWithStreamers()
  const total = entries.reduce((sum, entry) => sum + entry.count, 0)

  const description =
    entries.length > 0
      ? `${total} host live streaming profesional tersebar di ${entries.length} kota di Indonesia. Pilih kota Anda dan book host untuk Shopee Live & TikTok Live.`
      : 'Daftar kota dengan host live streaming profesional di Indonesia. Pilih kota Anda dan book host untuk Shopee Live & TikTok Live.'

  return {
    title: 'Live Streamer Profesional per Kota di Indonesia | Salda',
    description,
    openGraph: {
      ...defaultMetadata.openGraph,
      title: 'Live Streamer Profesional per Kota di Indonesia',
      description,
      url: CANONICAL_URL,
    },
    alternates: {
      canonical: CANONICAL_URL,
    },
  }
}

export default async function LocationsPage() {
  const entries = await getCitiesWithStreamers()
  const groups = groupByProvince(entries)
  const total = entries.reduce((sum, entry) => sum + entry.count, 0)

  const breadcrumbItems = [
    { name: 'Beranda', url: BASE_URL },
    { name: 'Kota', url: CANONICAL_URL },
  ]

  return (
    <>
      <BreadcrumbStructuredData items={breadcrumbItems} />
      <CityListStructuredData entries={entries} url={CANONICAL_URL} />

      <main className="mx-auto max-w-5xl px-4 py-10">
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-gray-500">
            <li>
              <Link href="/" className="hover:text-blue-600">
                Beranda
              </Link>
            </li>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <li aria-current="page" className="text-gray-900">
              Kota
            </li>
          </ol>
        </nav>

        <header className="mb-10">
          <p className="inline-flex items-center gap-1 text-sm text-gray-500">
            <MapPin className="h-4 w-4" /> Seluruh Indonesia
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
            Live Streamer Profesional per Kota
          </h1>
          <p className="mt-2 max-w-2xl text-gray-600">
            {entries.length > 0
              ? `${total} host live streaming terverifikasi tersebar di ${entries.length} kota. Pilih kota Anda untuk melihat host yang tersedia.`
              : 'Belum ada host live streaming terverifikasi yang bisa ditampilkan saat ini.'}
          </p>
          <p className="mt-2 max-w-2xl text-sm text-gray-500">
            Live streaming berjalan sepenuhnya online. Kota hanya memengaruhi lama pengiriman
            produk Anda ke host, bukan kualitas siarannya — jadi Anda tetap bebas memilih host
            dari kota mana pun.
          </p>
        </header>

        {groups.length > 0 ? (
          <div className="space-y-10">
            {groups.map((group) => (
              <section key={group.province}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  {group.province}
                </h2>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.cities.map(({ city, count }) => (
                    <li key={city.slug}>
                      <Link
                        href={`/location/${city.slug}`}
                        className="group flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                      >
                        <span>
                          <span className="block font-semibold text-gray-900 group-hover:text-blue-600">
                            {city.name}
                          </span>
                          <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-gray-500">
                            <Users className="h-3 w-3" /> {count} host tersedia
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 group-hover:text-blue-600" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-600">
              Daftar kota akan muncul di sini begitu ada host yang terverifikasi.
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Kembali ke beranda <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </main>
    </>
  )
}
