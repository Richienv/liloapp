import { Metadata } from 'next'
import { SITE_URL } from '@/lib/site'

// Shared defaults for public pages. Note there is no `alternates.canonical`
// here either: pages spread `defaultMetadata.openGraph` into their own metadata
// and declare their own canonical, which is the only URL they can state truthfully.
export const defaultMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Salda - Platform Live Streaming Bersama Host Profesional',
    template: '%s | Salda'
  },
  description: 'Platform yang membantu UMKM meningkatkan penjualan melalui live streaming bersama host profesional.',
  keywords: ['live streaming', 'host profesional', 'UMKM', 'penjualan online', 'live commerce'],
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    url: SITE_URL,
    siteName: 'Salda',
    images: [
      {
        url: '/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: 'Salda - Platform Live Streaming',
      }
    ],
  },
  icons: {
    icon: '/icon-salda.png',
    shortcut: '/icon-salda.png',
    apple: '/apple-icon.png',
    other: {
      rel: 'apple-touch-icon-precomposed',
      url: '/apple-icon-precomposed.png',
    },
  }
} 