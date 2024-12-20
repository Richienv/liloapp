interface BreadcrumbProps {
  items: {
    name: string;
    url: string;
  }[];
}

export function BreadcrumbStructuredData({ items }: BreadcrumbProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: items.map((item, index) => ({
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