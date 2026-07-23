import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { defaultMetadata } from '../../metadata'
import { notFound } from 'next/navigation'
import { BreadcrumbStructuredData } from '@/components/structured-data/breadcrumb-data'
import { MapPin, Tag } from 'lucide-react'
import { subtotalWithPlatformFee } from '@/lib/pricing'

interface LocationPageProps {
  params: { city: string }
}

interface LocationStreamer {
  id: number;
  first_name: string;
  last_name: string;
  username: string;
  location: string;
  category: string;
  price: number;
  profile_picture_url: string | null;
}

async function getLocationStreamers(city: string): Promise<LocationStreamer[]> {
  const supabase = createClient()
  const { data: streamers } = await supabase
    .from('streamers')
    .select('*')
    .eq('location', city)
    .eq('is_active', true)

  return (streamers as LocationStreamer[] | null) || []
}

export async function generateMetadata({ params }: LocationPageProps): Promise<Metadata> {
  const city = decodeURIComponent(params.city)
  const streamers = await getLocationStreamers(city)

  if (streamers.length === 0) {
    notFound()
  }

  return {
    title: `Live Streamer Profesional di ${city} | Salda`,
    description: `Temukan ${streamers.length}+ host live streaming profesional di ${city}. Book live streaming untuk tingkatkan penjualan UMKM Anda.`,
    openGraph: {
      ...defaultMetadata.openGraph,
      title: `Live Streamer Profesional di ${city}`,
      description: `Temukan host live streaming profesional di ${city}`,
    },
    alternates: {
      canonical: `https://salda.id/location/${encodeURIComponent(city)}`,
    }
  }
}

export default async function LocationPage({ params }: LocationPageProps) {
  const city = decodeURIComponent(params.city)
  const streamers = await getLocationStreamers(city)

  if (streamers.length === 0) {
    notFound()
  }

  const breadcrumbItems = [
    { name: 'Home', url: 'https://salda.id' },
    { name: 'Locations', url: 'https://salda.id/locations' },
    { name: city, url: `https://salda.id/location/${encodeURIComponent(city)}` }
  ]

  return (
    <>
      <BreadcrumbStructuredData items={breadcrumbItems} />

      <main className="mx-auto max-w-5xl px-4 py-10">
        <header className="mb-8">
          <p className="inline-flex items-center gap-1 text-sm text-gray-500">
            <MapPin className="h-4 w-4" /> {city}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
            Live Streamer Profesional di {city}
          </h1>
          <p className="mt-2 text-gray-600">
            {streamers.length} host live streaming siap membantu meningkatkan penjualan Anda.
          </p>
        </header>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {streamers.map((s) => {
            const displayPrice = Math.round(subtotalWithPlatformFee(s.price))
            return (
              <li key={s.id}>
                <Link
                  href={`/${s.username}`}
                  className="group flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.profile_picture_url || '/images/default-avatar.png'}
                    alt={`${s.first_name} ${s.last_name}`}
                    className="mb-3 h-40 w-full rounded-xl object-cover"
                  />
                  <h2 className="font-semibold text-gray-900 group-hover:text-blue-600">
                    {s.first_name} {s.last_name}
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
      </main>
    </>
  )
}
