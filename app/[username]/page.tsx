import { absoluteUrl } from '@/lib/site'
import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { defaultMetadata } from '../metadata'
import { StreamerRichStructuredData } from '@/components/structured-data/streamer-rich-data'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { BadgeCheck, ChevronLeft, MapPin, Star } from 'lucide-react'
import { subtotalWithPlatformFee } from '@/lib/pricing'
import { Button } from '@/components/ui/button'

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

  // Get streamer basic info with testimonials.
  //
  // The page is only ever reachable for a streamer who is active AND approved:
  // this URL is the public, indexable, bookable profile, and an unverified
  // account must not exist as far as brands or Google are concerned. Filtering
  // in the query (rather than after the fetch) also keeps generateMetadata from
  // emitting a canonical URL for a profile that then 404s.
  // `error` is deliberately captured rather than discarded. Swallowing it is how
  // a schema mismatch turned into a silent 404 on every public profile: the
  // query failed, `data` came back null, and the page simply called notFound()
  // as if the host did not exist. A broken query and a missing host must not
  // look the same from here.
  const { data: streamer, error } = await supabase
    .from('streamers')
    .select(`
      id,
      first_name,
      last_name,
      bio,
      profile_picture_url:image_url,
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
    // Uniqueness is enforced on lower(username), so /Rizky and /rizky are one
    // profile by definition — an exact match would 404 the very links legacy
    // rows still emit, since the backfill preserved their original casing.
    .ilike('username', username)
    .eq('is_active', true)
    .eq('verification_status', 'approved')
    .maybeSingle()

  if (error) {
    // A query failure is an outage on our side, not a missing profile. Log it
    // loudly so it shows up as a broken deploy instead of quietly turning every
    // public profile into a 404 that nobody notices.
    console.error(`[username/${username}] profile query failed:`, error)
    return null
  }

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
      // Encoded to match the JSON-LD `url` in streamer-rich-data.tsx exactly.
      // A canonical and a structured-data URL that disagree for the same page is
      // a contradiction Google resolves by trusting neither.
      canonical: absoluteUrl(`/${encodeURIComponent(streamer.username)}`),
    }
  }
}

/**
 * Rating as one mark and one number, not five glyphs.
 *
 * A five-star row spends five icons saying what `4,8` says in three characters,
 * and at profile scale it reads as decoration rather than as a value. The
 * single amber star is the same mark the marketplace card uses, so a brand that
 * scanned the grid recognises it here without relearning anything. The number
 * carries `.numeric` because it is a figure you compare between hosts.
 */
function RatingMark({ rating }: { rating: number }) {
  const capped = Math.min(Math.max(rating, 0), 5)
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5"
      aria-label={`Rating ${capped.toFixed(1)} dari 5`}
    >
      <Star className="h-3.5 w-3.5 shrink-0 fill-caution-dot text-caution-dot" aria-hidden="true" />
      <span className="numeric text-meta text-ink-body">{capped.toFixed(1)}</span>
    </span>
  )
}

/** Section heading: mono index, serif title, hairline under both. */
function ProfileSection({
  index,
  title,
  children,
}: {
  index: number
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline-soft pb-2.5">
        <span className="numeric font-mono text-tiny text-ink-ghost">
          {String(index).padStart(2, '0')}
        </span>
        <h2 className="font-serif text-title font-semibold text-ink">{title}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** `created_at` is free-form text as far as this page is concerned; a bad value
 *  drops the date rather than throwing the whole profile away. */
function formatDay(value?: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return format(date, 'd MMM yyyy', { locale: idLocale })
}

export default async function StreamerPage({ params }: { params: { username: string } }) {
  const streamer = await getStreamer(params.username)

  if (!streamer) {
    notFound()
  }

  const fullName = `${streamer.first_name} ${streamer.last_name}`
  const displayPrice = Math.round(subtotalWithPlatformFee(streamer.price))
  const testimonials = streamer.testimonials ?? []

  /*
    Sections are collected rather than written inline so the mono index stays
    contiguous. A host with no bio would otherwise open at `02`, which reads as
    a section that failed to load.

    `Jadwal minggu ini` from the reference is deliberately absent: this page
    loads no availability, and a schedule strip is exactly the kind of thing
    that gets filled with plausible-looking invented slots.
  */
  const sections: Array<{ title: string; body: React.ReactNode }> = []

  if (streamer.bio) {
    sections.push({
      title: `Tentang ${streamer.first_name}`,
      body: (
        <p className="max-w-[62ch] whitespace-pre-line text-lede text-ink-body">
          {streamer.bio}
        </p>
      ),
    })
  }

  if (streamer.category) {
    sections.push({
      title: 'Kategori produk',
      body: (
        <span className="inline-flex items-center rounded-chip border border-hairline bg-surface-tint px-2.5 py-1 text-meta text-ink-body">
          {streamer.category}
        </span>
      ),
    })
  }

  if (testimonials.length > 0) {
    sections.push({
      title: 'Kata brand sebelumnya',
      body: (
        <ul className="overflow-hidden rounded-frame border border-hairline bg-surface">
          {testimonials.map((t, i) => {
            const day = formatDay(t.created_at)
            return (
              <li
                key={i}
                className="border-b border-hairline-soft px-4 py-4 last:border-b-0 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <p className="min-w-0 flex-1 truncate text-ui font-medium text-ink">
                    {t.client_name}
                  </p>
                  <RatingMark rating={t.rating} />
                </div>
                <p className="mt-1.5 text-copy text-ink-body">{t.comment}</p>
                {day && <p className="numeric mt-2 text-mini text-ink-faint">{day}</p>}
              </li>
            )
          })}
        </ul>
      ),
    })
  }

  return (
    <>
      <StreamerRichStructuredData streamer={streamer} />

      <main className="mx-auto w-full max-w-[880px] px-4 py-8 sm:px-6 sm:py-12">
        <nav>
          <Link
            href="/streamers"
            className="-ml-1 inline-flex items-center gap-1 text-meta text-ink-soft transition-colors hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Semua host
          </Link>
        </nav>

        {/*
          Identity above, price below a hairline. The price is the fact a brand
          is here to find, so it gets its own band at 22px in mono instead of
          being tucked into a right-aligned corner at the same weight as the
          host's name.
        */}
        <section className="mt-5 overflow-hidden rounded-frame border border-hairline bg-surface">
          <div className="flex items-start gap-4 p-5 sm:gap-5 sm:p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={streamer.profile_picture_url || '/images/default-avatar.png'}
              alt={fullName}
              className="h-20 w-20 shrink-0 rounded-full bg-surface-tint object-cover ring-1 ring-hairline sm:h-24 sm:w-24"
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h1 className="font-serif text-section font-semibold text-ink sm:text-display">
                  {fullName}
                </h1>
                {/*
                  getStreamer only returns approved streamers, so the mark always
                  renders here — it is the trust signal brands are looking for
                  before they ship a product to a stranger. Set as text on the
                  canvas rather than as a filled green chip: a status that
                  carries a fill competes with the one action on the page.
                */}
                <span className="inline-flex shrink-0 items-center gap-1 text-mini font-medium text-positive">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Terverifikasi
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-ink-soft">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
                  <span className="truncate">{streamer.location}</span>
                </span>
                {streamer.rating !== undefined && <RatingMark rating={streamer.rating} />}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-hairline-soft px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="numeric text-price font-semibold text-ink">
                Rp {displayPrice.toLocaleString('id-ID')}
              </span>
              <span className="text-meta text-ink-soft">per jam · minimal 2 jam</span>
            </div>
            <p className="text-mini text-ink-faint">Belum termasuk pajak</p>
          </div>
        </section>

        {sections.map((section, index) => (
          <ProfileSection key={section.title} index={index + 1} title={section.title}>
            {section.body}
          </ProfileSection>
        ))}

        {/*
          The closing panel is a hairline card, not a blue block. A full-bleed
          accent fill makes the whole section the accent; here the blue is spent
          once, on the button, which is the only thing on the page a brand is
          meant to press.
        */}
        <section className="mt-10 rounded-frame border border-hairline bg-surface px-5 py-8 text-center sm:px-8">
          <h2 className="font-serif text-title font-semibold text-ink">
            Siap booking {streamer.first_name}?
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-meta text-ink-soft">
            Tingkatkan penjualan live streaming kamu bersama host profesional.
          </p>
          <div className="mt-5 flex justify-center">
            <Button asChild variant="brand" size="action-compact">
              <Link href="/streamers">Atur sesi</Link>
            </Button>
          </div>
        </section>
      </main>
    </>
  )
}
