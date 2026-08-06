import { resolveCity } from '@/lib/cities';
import { absoluteUrl } from '@/lib/site';

interface StreamerRichData {
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  profile_picture_url: string | null;
  /** Legacy free-text city. May be any spelling, or missing entirely. */
  location: string | null;
  /** Canonical city slug, when the row has been backfilled. */
  city_slug?: string | null;
  /** Profile URL segment. Historically absent on rows created before capture existed. */
  username: string | null;
  rating?: number;
  testimonials?: {
    comment: string;
    client_name: string;
    rating: number;
    created_at: string;
  }[];
  price: number;
  category: string | null;
}

/**
 * Person JSON-LD for a streamer profile.
 *
 * Every field here is optional in the database, so each one is emitted only when
 * it actually has a value. Two failure modes this guards against specifically:
 *
 *  - `username` was never captured at signup on older rows, so building the
 *    profile URL unconditionally produced `https://salda.id/undefined` — a
 *    self-referencing link to a 404.
 *  - `location` is free text ("Jkt", "DKI Jakarta", "jakarta selatan"), so it is
 *    resolved through the city registry before being published as an address.
 *    An unresolvable value is omitted rather than echoed verbatim.
 */
export function StreamerRichStructuredData({ streamer }: { streamer: StreamerRichData }) {
  const fullName = [streamer.first_name, streamer.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  const username = streamer.username?.trim();
  const city = resolveCity(streamer.city_slug) ?? resolveCity(streamer.location);

  // Google rejects an aggregateRating whose ratingCount is 0, and a rating with
  // no reviews behind it is meaningless anyway.
  const ratingCount = streamer.testimonials?.length ?? 0;
  const hasRating = typeof streamer.rating === 'number' && ratingCount > 0;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: fullName || username || 'Host Live Streaming',
          ...(streamer.bio ? { description: streamer.bio } : {}),
          ...(streamer.profile_picture_url ? { image: streamer.profile_picture_url } : {}),
          jobTitle: 'Professional Live Streamer',
          ...(username ? { url: absoluteUrl(`/${encodeURIComponent(username)}`) } : {}),
          ...(city
            ? {
                // `homeLocation` is the Person-valid property; plain `location`
                // belongs to Event/Action and was being ignored.
                homeLocation: {
                  '@type': 'Place',
                  name: city.name,
                  address: {
                    '@type': 'PostalAddress',
                    addressLocality: city.name,
                    addressRegion: city.province,
                    addressCountry: 'ID',
                  },
                },
              }
            : {}),
          makesOffer: {
            '@type': 'Offer',
            priceSpecification: {
              '@type': 'PriceSpecification',
              price: streamer.price,
              priceCurrency: 'IDR',
              unitText: 'per hour',
            },
            itemOffered: {
              '@type': 'Service',
              name: 'Live Streaming Service',
              ...(streamer.category ? { category: streamer.category } : {}),
            },
          },
          ...(hasRating
            ? {
                aggregateRating: {
                  '@type': 'AggregateRating',
                  ratingValue: streamer.rating,
                  bestRating: '5',
                  worstRating: '1',
                  ratingCount,
                },
              }
            : {}),
          ...(ratingCount > 0
            ? {
                review: streamer.testimonials!.map((testimonial) => ({
                  '@type': 'Review',
                  reviewRating: {
                    '@type': 'Rating',
                    ratingValue: testimonial.rating,
                    bestRating: '5',
                    worstRating: '1',
                  },
                  author: {
                    '@type': 'Person',
                    name: testimonial.client_name,
                  },
                  reviewBody: testimonial.comment,
                  datePublished: testimonial.created_at,
                })),
              }
            : {}),
        }),
      }}
    />
  )
}
