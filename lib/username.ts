/**
 * Username rules for streamer public profiles.
 *
 * A streamer's username is the whole public SEO surface: it is the `/[username]`
 * profile route, the canonical URL in structured data, and the entry in
 * sitemap.xml. It has to be stable, URL-safe, and unique, so it is generated and
 * validated here rather than being accepted as free text.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

/**
 * Lowercase letters, digits, underscore and hyphen. Must start and end with a
 * letter or digit so usernames never produce a trailing-separator URL.
 */
export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/;

/**
 * Reserved because each already resolves to a real route (or a route we intend
 * to add). Without this, a streamer could claim `/sign-in` and shadow the app.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "auth",
  "booking-detail",
  "client-bookings",
  "client-onboarding",
  "forgot-password",
  "location",
  "locations",
  "messages",
  "notifications",
  "privacy-notice",
  "protected",
  "reset-password",
  "settings",
  "sign-in",
  "sign-up",
  "sitemap",
  "streamer-dashboard",
  "streamer-onboarding",
  "streamer-schedule",
  "streamer-sign-up",
  "streamer-verification",
  "streamers",
  "terms",
  "tutorial",
  "robots",
  "salda",
  "support",
  "help",
  "about",
  "contact",
  "me",
  "new",
  "null",
  "undefined",
]);

/**
 * Convert arbitrary text into a candidate username: strip accents, lowercase,
 * collapse anything that isn't a letter or digit into a single hyphen, and trim
 * separators from both ends. Does not guarantee validity — run
 * {@link validateUsername} on the result.
 */
export function slugifyUsername(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, USERNAME_MAX)
    .replace(/[_-]+$/g, "");
}

export type UsernameValidation =
  | { ok: true; username: string }
  | { ok: false; reason: string };

/**
 * Validate a username against length, character, and reserved-word rules.
 * `reason` is user-facing copy in Indonesian, matching the rest of the signup UI.
 */
export function validateUsername(raw: string): UsernameValidation {
  const username = (raw ?? "").trim().toLowerCase();

  if (!username) {
    return { ok: false, reason: "Username wajib diisi." };
  }
  if (username.length < USERNAME_MIN) {
    return {
      ok: false,
      reason: `Username minimal ${USERNAME_MIN} karakter.`,
    };
  }
  if (username.length > USERNAME_MAX) {
    return {
      ok: false,
      reason: `Username maksimal ${USERNAME_MAX} karakter.`,
    };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      reason:
        "Username hanya boleh berisi huruf kecil, angka, tanda hubung (-), dan garis bawah (_), serta harus diawali dan diakhiri huruf atau angka.",
    };
  }
  if (RESERVED_USERNAMES.has(username)) {
    return { ok: false, reason: "Username ini sudah digunakan sistem." };
  }

  return { ok: true, username };
}

/**
 * Build a username suggestion from a streamer's name. Falls back to a generic
 * stem when the name has no usable characters (e.g. it was entirely emoji), so
 * the caller always gets something valid to append a suffix to.
 */
export function suggestUsername(firstName: string, lastName: string): string {
  const base = slugifyUsername(`${firstName ?? ""} ${lastName ?? ""}`.trim());
  if (base.length >= USERNAME_MIN) return base;
  return `streamer-${base || "baru"}`.slice(0, USERNAME_MAX);
}

/**
 * Append a numeric suffix to a taken username while respecting USERNAME_MAX,
 * e.g. ("rizky-pratama", 2) -> "rizky-pratama-2".
 */
export function withSuffix(base: string, n: number): string {
  const suffix = `-${n}`;
  const trimmed = base.slice(0, USERNAME_MAX - suffix.length).replace(/[_-]+$/g, "");
  return `${trimmed}${suffix}`;
}
