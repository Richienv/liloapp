import { SITE_URL, absoluteUrl } from '@/lib/site';

export function OrganizationStructuredData() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Salda",
          url: SITE_URL,
          logo: absoluteUrl("/icon-salda.png"),
          description: "Platform yang membantu UMKM meningkatkan penjualan melalui live streaming bersama host profesional.",
          sameAs: [
            "https://instagram.com/salda.id",
            "https://tiktok.com/@salda.id"
          ],
          address: {
            "@type": "PostalAddress",
            addressCountry: "ID",
            // `addressRegion` is a province, not a city. "Jakarta" is the city;
            // the province is "DKI Jakarta" — the exact spelling the city
            // registry uses, so the two never disagree.
            addressRegion: "DKI Jakarta"
          },
          potentialAction: {
            "@type": "JoinAction",
            target: {
              "@type": "EntryPoint",
              urlTemplate: absoluteUrl("/sign-up"),
              actionPlatform: [
                "http://schema.org/DesktopWebPlatform",
                "http://schema.org/MobileWebPlatform"
              ]
            },
            result: {
              "@type": "Organization",
              name: "Salda Membership"
            }
          }
        })
      }}
    />
  )
} 