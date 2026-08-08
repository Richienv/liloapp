import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { MapPin, ChevronRight, Users } from 'lucide-react'
import { defaultMetadata } from '../metadata'
import { BreadcrumbStructuredData } from '@/components/structured-data/breadcrumb-data'
import { CityListStructuredData } from '@/components/structured-data/city-list-data'
import { getCityBySlug, resolveCity, type City } from '@/lib/cities'
import { SITE_URL, absoluteUrl } from '@/lib/site'
import { Button } from '@/components/ui/button'

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
      ? `${total} host live streaming profesional tersebar di ${entries.length} kota di Indonesia. Pilih kota kamu dan book host untuk Shopee Live & TikTok Live.`
      : 'Daftar kota dengan host live streaming profesional di Indonesia. Pilih kota kamu dan book host untuk Shopee Live & TikTok Live.'

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

      <main className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 sm:py-12">
        {/* Separators are list items rather than bare icons: an <ol> whose
            children are not <li> is a list a screen reader stops counting. */}
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
            <li aria-current="page" className="text-ink">
              Kota
            </li>
          </ol>
        </nav>

        <header className="mt-6">
          <p className="inline-flex items-center gap-1.5 font-mono text-tiny uppercase text-ink-ghost">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Seluruh Indonesia
          </p>
          <h1 className="mt-2 font-serif text-section font-semibold text-ink sm:text-display">
            Live streamer profesional per kota
          </h1>
          <p className="mt-3 max-w-[62ch] text-lede text-ink-soft">
            {entries.length > 0 ? (
              <>
                <span className="numeric text-ink">{total}</span> host live streaming
                terverifikasi tersebar di{' '}
                <span className="numeric text-ink">{entries.length}</span> kota. Pilih kota
                kamu untuk melihat host yang tersedia.
              </>
            ) : (
              'Belum ada host live streaming terverifikasi yang bisa ditampilkan saat ini.'
            )}
          </p>
          <p className="mt-3 max-w-[62ch] text-meta text-ink-soft">
            Live streaming berjalan sepenuhnya online. Kota hanya memengaruhi lama pengiriman
            produk kamu ke host, bukan kualitas siarannya — jadi kamu tetap bebas memilih host
            dari kota mana pun.
          </p>
        </header>

        {groups.length > 0 ? (
          <div className="mt-10 space-y-10">
            {groups.map((group, groupIndex) => (
              <section key={group.province}>
                {/* Mono index, serif province, count — the same three-part
                    section head the booking list uses, so a brand moving
                    between the two surfaces reads one hierarchy, not two. */}
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline-soft pb-2.5">
                  <span className="numeric font-mono text-tiny text-ink-ghost">
                    {String(groupIndex + 1).padStart(2, '0')}
                  </span>
                  <h2 className="font-serif text-title font-semibold text-ink">
                    {group.province}
                  </h2>
                  <span className="numeric text-mini text-ink-ghost">
                    {group.cities.length}
                  </span>
                </div>

                {/*
                  `shadow-cell` per cell, never a border: two bordered
                  neighbours draw their shared seam twice and it renders 2px.
                  The container's border plus `overflow-hidden` clips the
                  outermost rings so every line here is exactly 1px.
                */}
                <ul className="mt-4 grid grid-cols-1 overflow-hidden rounded-frame border border-hairline bg-surface sm:grid-cols-2 lg:grid-cols-3">
                  {group.cities.map(({ city, count }) => (
                    <li key={city.slug} className="shadow-cell">
                      <Link
                        href={`/location/${city.slug}`}
                        className="flex min-w-0 items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-raised"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-ui font-medium text-ink">
                            {city.name}
                          </span>
                          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-meta text-ink-soft">
                            <Users
                              className="h-3.5 w-3.5 shrink-0 text-ink-faint"
                              aria-hidden="true"
                            />
                            <span className="truncate">
                              <span className="numeric">{count}</span> host tersedia
                            </span>
                          </span>
                        </span>
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-ink-ghost"
                          aria-hidden="true"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-10 rounded-frame border border-hairline bg-surface px-5 py-16 text-center">
            <p className="font-serif text-title font-semibold text-ink">Belum ada kota</p>
            <p className="mx-auto mt-2 max-w-md text-meta text-ink-soft">
              Daftar kota akan muncul di sini begitu ada host yang terverifikasi.
            </p>
            <div className="mt-6 flex justify-center">
              <Button asChild variant="brand" size="action-compact">
                <Link href="/">Kembali ke beranda</Link>
              </Button>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
