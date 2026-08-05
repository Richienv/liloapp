/**
 * WebSite JSON-LD.
 *
 * The `SearchAction` that used to live here pointed at `https://salda.id/search`,
 * a route that does not exist — declaring a sitelinks searchbox that 404s only
 * gets the markup ignored (or flagged) rather than rendered. It is omitted until
 * a real search endpoint exists; the city hub at `/locations` is the browse
 * entry point in the meantime.
 */
export function WebsiteStructuredData() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Salda",
          url: "https://salda.id",
          inLanguage: "id-ID",
          publisher: {
            "@type": "Organization",
            name: "Salda",
            url: "https://salda.id"
          }
        })
      }}
    />
  )
}
