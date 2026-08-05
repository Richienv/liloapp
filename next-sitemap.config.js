/**
 * next-sitemap is NO LONGER the source of truth for this site.
 *
 * `app/sitemap.ts` and `app/robots.ts` (App Router metadata routes) own
 * /sitemap.xml and /robots.txt. They are the only ones that can enumerate
 * streamer profile URLs and city pages, because those come from the database.
 *
 * next-sitemap runs as a `postbuild` script and used to write its output into
 * `public/`. Files in `public/` are served as static assets and take precedence
 * over App Router routes, so `public/sitemap.xml` and `public/robots.txt`
 * SHADOWED the dynamic routes entirely — Google has only ever seen a snapshot
 * next-sitemap generated from the build manifest. That is why zero /location/*
 * URLs and zero streamer profiles were ever indexed, and why /admin/* URLs were
 * being advertised despite app/robots.ts disallowing them.
 *
 * Fix: stop this config from writing anything into `public/`.
 *  - `outDir` points inside `.next/` (gitignored, never served statically), so a
 *    stray `npm run postbuild` cannot resurrect the shadowing files.
 *  - `generateRobotsTxt` is off, so `app/robots.ts` stays authoritative.
 *
 * FOLLOW-UP (files outside this one): delete the stale committed artifacts
 * `public/sitemap.xml` and `public/robots.txt` — until they are removed from the
 * repo they keep shadowing the dynamic routes in production — then drop the
 * `postbuild: "next-sitemap"` script and the `next-sitemap` dependency from
 * package.json and delete this file.
 *
 * @type {import('next-sitemap').IConfig}
 */
module.exports = {
  siteUrl: 'https://salda.id',
  // app/robots.ts owns /robots.txt.
  generateRobotsTxt: false,
  generateIndexSitemap: false,
  // Deliberately NOT 'public': anything written there shadows app/sitemap.ts.
  outDir: '.next/next-sitemap-unused',
}
