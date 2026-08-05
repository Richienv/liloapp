import { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/settings/',
          '/messages/',
        ],
      },
    ],
    // A robots.txt that advertises a sitemap on a different host is ignored, so
    // this has to track the origin the file is actually served from.
    sitemap: absoluteUrl('/sitemap.xml'),
  }
} 