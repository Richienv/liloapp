import { CITIES } from '@/lib/cities';
import { SITE_URL, absoluteUrl } from '@/lib/site';

/**
 * Organization-level JSON-LD describing where Salda operates.
 *
 * This used to declare a `LocalBusiness` with placeholder NAP data — literally
 * `streetAddress: "Your Street Address"`, `postalCode: "xxxxx"`, a phone number
 * padded with "xxx" and wrapped in invisible bidi control characters, and
 * hardcoded Jakarta coordinates. Publishing a fabricated address as structured
 * data is a manual-action risk, and a LocalBusiness is the wrong shape anyway:
 * Salda is a nationwide marketplace, and a livestream is remote, so there is no
 * storefront to describe.
 *
 * What is true — and useful — is the set of cities served. That comes from the
 * city registry, so this can never drift from the `/location/<slug>` pages.
 */
export function LocalBusinessStructuredData() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          // The `@id` is the entity's stable identifier and other nodes join on
          // it, so it has to be on the origin the site is actually served from.
          "@id": `${SITE_URL}/#organization`,
          name: "Salda",
          url: SITE_URL,
          image: absoluteUrl("/icon-salda.png"),
          logo: absoluteUrl("/icon-salda.png"),
          description:
            "Platform yang menghubungkan UMKM dengan host live streaming profesional untuk Shopee Live dan TikTok Live.",
          address: {
            "@type": "PostalAddress",
            addressCountry: "ID"
          },
          areaServed: [
            { "@type": "Country", name: "Indonesia" },
            ...CITIES.map((city) => ({
              "@type": "City",
              name: city.name,
              url: absoluteUrl(`/location/${city.slug}`)
            }))
          ],
          makesOffer: {
            "@type": "Offer",
            priceRange: "Rp500.000 - Rp5.000.000",
            priceCurrency: "IDR",
            itemOffered: {
              "@type": "Service",
              name: "Jasa live streaming bersama host profesional"
            }
          }
        })
      }}
    />
  )
}
