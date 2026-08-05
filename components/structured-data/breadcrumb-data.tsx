interface BreadcrumbItem {
  name: string;
  url: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

/**
 * BreadcrumbList JSON-LD.
 *
 * Callers build these from database values (a city name, a streamer's username),
 * so an item can easily end up with an empty name or a URL containing the string
 * "undefined". Invalid items are dropped rather than serialised: a breadcrumb
 * pointing at a 404 is worse for Google than no breadcrumb at all.
 */
export function BreadcrumbStructuredData({ items }: BreadcrumbProps) {
  const valid = items.filter(
    (item) =>
      typeof item?.name === "string" &&
      item.name.trim().length > 0 &&
      typeof item?.url === "string" &&
      item.url.startsWith("http") &&
      !item.url.includes("undefined") &&
      !item.url.includes("null")
  );

  if (valid.length === 0) return null;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: valid.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.name,
            item: item.url
          }))
        })
      }}
    />
  )
}
