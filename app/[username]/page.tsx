import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { defaultMetadata } from '../metadata'
import { StreamerRichStructuredData } from '@/components/structured-data/streamer-rich-data'
import { notFound } from 'next/navigation'
import { MapPin, Star, Tag } from 'lucide-react'
import { subtotalWithPlatformFee } from '@/lib/pricing'

// Define the interface for testimonials
interface Testimonial {
  client_name: string;
  comment: string;
  rating: number;
  created_at: string;
}

// Define the complete StreamerRichData interface
interface StreamerRichData {
  id: number;
  first_name: string;
  last_name: string;
  bio: string | null;
  profile_picture_url: string | null;
  location: string;
  username: string;
  category: string;
  price: number;
  rating?: number;
  testimonials?: Testimonial[];
}

async function getStreamer(username: string): Promise<StreamerRichData | null> {
  const supabase = createClient()

  // Get streamer basic info with testimonials
  const { data: streamer } = await supabase
    .from('streamers')
    .select(`
      id,
      first_name,
      last_name,
      bio,
      profile_picture_url,
      location,
      username,
      category,
      price,
      testimonials (
        client_name,
        comment,
        rating,
        created_at
      )
    `)
    .eq('username', username)
    .single()

  if (!streamer) return null

  // Get average rating
  const { data: ratingData } = await supabase
    .from('streamer_ratings')
    .select('rating')
    .eq('streamer_id', streamer.id)

  const averageRating = ratingData?.length
    ? ratingData.reduce((acc, curr) => acc + curr.rating, 0) / ratingData.length
    : undefined

  return {
    ...streamer,
    rating: averageRating,
    testimonials: streamer.testimonials || []
  }
}

export async function generateMetadata({ params }: { params: { username: string } }): Promise<Metadata> {
  const streamer = await getStreamer(params.username)

  if (!streamer) {
    return defaultMetadata
  }

  const name = `${streamer.first_name} ${streamer.last_name}`

  return {
    title: `${name} - Professional Live Streamer di ${streamer.location}`,
    description: `Book live streaming bersama ${name}, host profesional dari ${streamer.location}. ${streamer.category ? `Spesialisasi: ${streamer.category}` : ''}`,
    openGraph: {
      ...defaultMetadata.openGraph,
      title: `${name} - Professional Live Streamer`,
      description: streamer.bio || `Live streamer profesional dari ${streamer.location}`,
      images: streamer.profile_picture_url ? [{ url: streamer.profile_picture_url }] : defaultMetadata.openGraph?.images,
    },
    alternates: {
      canonical: `https://salda.id/${streamer.username}`,
    }
  }
}

function Stars({ rating }: { rating: number }) {
  const rounded = Math.round(rating)
  return (
    <span className="inline-flex items-center" aria-label={`Rating ${rating.toFixed(1)} dari 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i <= rounded ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
        />
      ))}
    </span>
  )
}

export default async function StreamerPage({ params }: { params: { username: string } }) {
  const streamer = await getStreamer(params.username)

  if (!streamer) {
    notFound()
  }

  const fullName = `${streamer.first_name} ${streamer.last_name}`
  const displayPrice = Math.round(subtotalWithPlatformFee(streamer.price))
  const testimonials = streamer.testimonials ?? []

  return (
    <>
      <StreamerRichStructuredData streamer={streamer} />

      <main className="mx-auto max-w-4xl px-4 py-10">
        <nav className="mb-6 text-sm text-gray-500">
          <Link href="/streamers" className="hover:text-gray-900">
            &larr; Semua Streamer
          </Link>
        </nav>

        {/* Profile header */}
        <section className="flex flex-col gap-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={streamer.profile_picture_url || '/images/default-avatar.png'}
            alt={fullName}
            className="h-28 w-28 flex-shrink-0 rounded-full object-cover ring-2 ring-gray-100"
          />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{fullName}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" /> {streamer.location}
              </span>
              {streamer.category && (
                <span className="inline-flex items-center gap-1">
                  <Tag className="h-4 w-4" /> {streamer.category}
                </span>
              )}
              {streamer.rating !== undefined && (
                <span className="inline-flex items-center gap-1">
                  <Stars rating={streamer.rating} />
                  <span className="text-gray-500">{streamer.rating.toFixed(1)}</span>
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Mulai dari</p>
            <p className="text-2xl font-bold text-gray-900">
              Rp {displayPrice.toLocaleString('id-ID')}
              <span className="text-sm font-normal text-gray-500">/jam</span>
            </p>
            <p className="text-[11px] text-gray-400">*belum termasuk pajak</p>
          </div>
        </section>

        {/* Bio */}
        {streamer.bio && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900">Tentang {streamer.first_name}</h2>
            <p className="mt-2 whitespace-pre-line leading-relaxed text-gray-700">{streamer.bio}</p>
          </section>
        )}

        {/* Testimonials */}
        {testimonials.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900">
              Ulasan Klien ({testimonials.length})
            </h2>
            <ul className="mt-4 space-y-4">
              {testimonials.map((t, i) => (
                <li key={i} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{t.client_name}</span>
                    <Stars rating={t.rating} />
                  </div>
                  <p className="mt-2 text-sm text-gray-700">{t.comment}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* CTA */}
        <section className="mt-10 rounded-2xl bg-blue-600 p-6 text-center text-white">
          <h2 className="text-xl font-semibold">Siap booking {streamer.first_name}?</h2>
          <p className="mt-1 text-sm text-blue-100">
            Tingkatkan penjualan live streaming Anda bersama host profesional.
          </p>
          <Link
            href="/streamers"
            className="mt-4 inline-block rounded-lg bg-white px-6 py-2.5 font-medium text-blue-600 transition-colors hover:bg-blue-50"
          >
            Mulai Booking
          </Link>
        </section>
      </main>
    </>
  )
}
