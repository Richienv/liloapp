import type { City } from '@/lib/cities'
import { absoluteUrl } from '@/lib/site'

interface CityListEntry {
  city: City
  /** How many listable streamers the city currently has. */
  count: number
}

interface CityListStructuredDataProps {
  entries: CityListEntry[]
  /** Absolute URL of the page carrying this list. */
  url: string
}

/**
 * ItemList for the `/locations` hub.
 *
 * Every item points at the canonical `/location/<slug>` URL — never the display
 * name, never a URL-encoded variant — so the structured data agrees with the
 * page's own links, the sitemap, and each city page's canonical tag.
 *
 * Cities with zero listable streamers are dropped: linking them from structured
 * data advertises pages that are deliberately kept out of the index.
 */
export function CityListStructuredData({ entries, url }: CityListStructuredDataProps) {
  const listed = entries.filter((entry) => entry.count > 0)

  if (listed.length === 0) return null

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'Kota dengan live streamer profesional di Salda',
          url,
          numberOfItems: listed.length,
          itemListElement: listed.map((entry, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: entry.city.name,
            url: absoluteUrl(`/location/${entry.city.slug}`),
          })),
        }),
      }}
    />
  )
}
