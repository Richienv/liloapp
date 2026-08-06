import { Inter, JetBrains_Mono, Playfair_Display } from 'next/font/google'
import "./globals.css";
import { Navbar } from "@/components/ui/navbar";
import { Toaster } from "@/components/ui/toaster";
import "react-datepicker/dist/react-datepicker.css";
import { SITE_URL } from "@/lib/site";

/**
 * Three faces, one job each.
 *
 * Inter carries every piece of interface text. Playfair is reserved for
 * headings — it is what stops the product reading like an admin panel. JetBrains
 * Mono is for values that are meant to be compared or copied: prices, booking
 * codes, timestamps.
 *
 * All three are exposed as CSS variables and consumed through
 * `fontFamily` in tailwind.config.ts, so a component asks for `font-sans` /
 * `font-serif` / `font-mono` and never names a typeface. `Inter` also gets
 * `className` on <html> so text rendered outside a styled subtree still lands
 * on the right face.
 *
 * Geist used to be loaded here and applied to <body>, which meant <html> asked
 * for Inter and <body> immediately overrode it — the app has never actually
 * rendered in Inter. One sans, and it is the one the design specifies.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})
const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
})
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Salda by TROLIVE - Platform Live Selling Shopee & TikTok Terbaik di Indonesia",
  description: "Platform live selling terbaik dari TROLIVE yang menghubungkan UMKM dengan live streamer profesional untuk Shopee dan TikTok Live. Tingkatkan penjualan online kamu dengan host live streaming berpengalaman.",
  keywords: "salda, trolive, live selling, live streaming, shopee live, tiktok live, host live streaming, jasa live streaming, live commerce indonesia, live seller, live shopping, penyedia jasa live streaming, livestreaming marketplace, umkm digital, platform live selling terbaik, jasa live selling terpercaya, host tiktok shop, host shopee live",
  // NOTE: no `alternates.canonical` here, deliberately. Next merges metadata
  // layout -> page, so a canonical declared on the ROOT layout is inherited
  // verbatim by every page that does not override it — /terms, /privacy-notice,
  // /streamers, /tutorial/video-guide and the /sections/* routes were all
  // telling Google "I am a duplicate of the homepage". A canonical is a
  // per-page statement about that page's own URL; it belongs on the page.
  icons: {
    icon: [
      {
        url: '/favicon-16x16.png',
        sizes: '16x16',
        type: 'image/png',
      },
      {
        url: '/favicon-32x32.png',
        sizes: '32x32',
        type: 'image/png',
      },
    ],
    shortcut: '/favicon.ico',
    apple: {
      url: '/apple-touch-icon.png',
      sizes: '180x180',
      type: 'image/png',
    },
    other: [
      {
        rel: 'android-chrome-192x192',
        url: '/android-chrome-192x192.png',
      },
      {
        rel: 'android-chrome-512x512',
        url: '/android-chrome-512x512.png',
      },
    ],
  },
  openGraph: {
    type: 'website',
    title: 'Salda by TROLIVE - Platform Live Selling Shopee & TikTok Terbaik di Indonesia',
    description: 'Platform live selling terbaik dari TROLIVE yang menghubungkan UMKM dengan live streamer profesional untuk Shopee dan TikTok Live. Tingkatkan penjualan online kamu dengan host live streaming berpengalaman.',
    url: SITE_URL,
    siteName: 'Salda by TROLIVE',
    locale: 'id_ID',
    images: [
      {
        url: '/android-chrome-512x512.png',
        width: 512,
        height: 512,
        alt: 'Salda by TROLIVE - Platform Live Selling Terbaik',
      }
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Salda by TROLIVE - Platform Live Selling Shopee & TikTok Terbaik di Indonesia',
    description: 'Platform live selling terbaik dari TROLIVE yang menghubungkan UMKM dengan live streamer profesional untuk Shopee dan TikTok Live. Tingkatkan penjualan online kamu dengan host live streaming berpengalaman.',
    images: ['/android-chrome-512x512.png'],
    site: '@salda_id',
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: {
      'google-site-verification': [process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION],
    },
  },
  robots: {
    index: true,
    follow: true,
    nocache: true,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `lang="id"` — every string in the product is Bahasa Indonesia and the
    // metadata below already declares `locale: 'id_ID'`. Claiming English told
    // screen readers to pronounce Indonesian with English phonemes, and told
    // Chrome to offer a translation of a page that is already in the reader's
    // language.
    <html
      lang="id"
      className={`${inter.className} ${inter.variable} ${playfair.variable} ${jetbrainsMono.variable}`}
    >
      {/*
        The `--primary-gradient` / `--primary-gradient-hover` custom properties
        that used to be set here are gone. They defined a blue-to-purple ramp
        that is exactly the effect the redesign removes: a gradient reads as
        decoration, and decoration is what a marketplace handling other
        people's money can least afford. Nothing consumed them — the gradients
        on screen are hardcoded Tailwind classes, which come off screen by
        screen in the steps that follow.
      */}
      <body className="mobile-layout bg-canvas">
        <Toaster />
        <main className="min-h-screen w-full bg-canvas">
          {children}
        </main>
      </body>
    </html>
  );
}
