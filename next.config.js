/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // NOTE: this previously hard-redirected liloapp.vercel.app -> https://salda.id
  // and set a canonical link to salda.id. salda.id has expired, so that redirect
  // bounced every visitor to a dead domain. Removed so the app serves directly
  // on the Vercel domain. When salda.id is renewed, reintroduce a canonical-host
  // redirect — ideally driven by an env var (e.g. NEXT_PUBLIC_SITE_URL) rather
  // than hardcoding the host.
  headers: async () => {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: process.env.NODE_ENV === 'production'
              ? 'index, follow'
              : 'noindex, nofollow'
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
