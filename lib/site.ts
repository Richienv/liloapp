/**
 * The site's public origin — one value, resolved once.
 *
 * Why this module exists: the domain moved. `salda.id` expired and the app now
 * serves from its Vercel host (see the note at the top of `next.config.js`), but
 * the old origin had been copy-pasted into nine places — the root layout,
 * `app/metadata.ts`, `app/sitemap.ts`, `app/robots.ts`, `/locations`, the two
 * dynamic public routes, and every structured-data component. Each copy is a
 * separate chance to publish an absolute URL on a host that no longer resolves,
 * and the ones that matter most are exactly the ones crawlers trust: a canonical
 * tag, a sitemap entry, a JSON-LD `@id`. A canonical pointing at a dead domain
 * does not merely fail to help — it tells Google the live page is a duplicate of
 * something unreachable, which is a request to de-index.
 *
 * Resolution order:
 *   1. `NEXT_PUBLIC_SITE_URL` — the deliberate answer. Set this in production;
 *      it is the only value that survives a domain change without a code edit.
 *   2. `NEXT_PUBLIC_VERCEL_URL` / `VERCEL_URL` — Vercel's per-deployment host.
 *      Supplied WITHOUT a scheme ("liloapp.vercel.app"), hence `withScheme`.
 *      Good enough for previews; it is deployment-specific, so production really
 *      should set (1) rather than lean on this.
 *   3. `FALLBACK_SITE_URL` — the host the app actually serves from today, so a
 *      misconfigured environment degrades to a URL that at least resolves.
 */

/**
 * Last resort: the live Vercel host. Deliberately NOT `salda.id` — that domain
 * expired, and defaulting to it is what made every page advertise a dead origin.
 */
const FALLBACK_SITE_URL = "https://liloapp.vercel.app";

/** Vercel hands out bare hosts; `NEXT_PUBLIC_SITE_URL` is normally written with a scheme. Accept both. */
function withScheme(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/** No trailing slash, ever: callers concatenate `${SITE_URL}/path` and `//path` is a different URL. */
function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveSiteUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_VERCEL_URL,
    process.env.VERCEL_URL,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;

    const trimmed = candidate.trim();
    if (trimmed.length === 0) continue;

    const normalised = stripTrailingSlash(withScheme(trimmed));

    // A typo'd env var must not crash every page: `new URL()` throws, and this
    // value feeds `metadataBase`, which is constructed at module scope.
    try {
      new URL(normalised);
      return normalised;
    } catch {
      continue;
    }
  }

  return FALLBACK_SITE_URL;
}

/** Absolute origin, normalised, no trailing slash. */
export const SITE_URL = resolveSiteUrl();

/**
 * Absolute URL for an app-relative path.
 *
 * `absoluteUrl('/')` returns the bare origin rather than `origin/`, because a
 * canonical tag and the sitemap must agree on the homepage's single spelling.
 */
export function absoluteUrl(path: string = "/"): string {
  if (!path || path === "/") return SITE_URL;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
