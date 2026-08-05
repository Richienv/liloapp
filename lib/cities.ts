/**
 * Canonical registry of the Indonesian cities Salda operates in.
 *
 * Why this exists: a livestream is remote, so a streamer's city has nothing to
 * do with whether they can do the job. It matters for exactly two things —
 * shipping logistics (how long the brand's product takes to reach the streamer)
 * and SEO (a stable `/location/<slug>` URL per city). Both need a *canonical*
 * city, which free-text input cannot give us: "Jakarta", "DKI Jakarta", "jakarta"
 * and "Jaksel" are one city for shipping and one page for Google.
 *
 * The registry is the single source of truth. Forms write `slug` (never free
 * text), lookups resolve a slug or any alias back to one City, and page routes
 * are generated from `slug`.
 */

export type Timezone = "Asia/Jakarta" | "Asia/Makassar" | "Asia/Jayapura";

export interface City {
  /** URL-safe identifier. This is what gets stored and routed on. */
  slug: string;
  /** Display name, in Indonesian. */
  name: string;
  province: string;
  timezone: Timezone;
  /**
   * Alternate spellings users actually type, plus legacy free-text values
   * already sitting in the database. All lowercase. `slug` and a lowercased
   * `name` are matched implicitly and don't need to be repeated here.
   */
  aliases: string[];
}

/** WIB — Western Indonesia (Sumatra, Java, West/Central Kalimantan). */
const WIB: Timezone = "Asia/Jakarta";
/** WITA — Central Indonesia (South/East Kalimantan, Sulawesi, Bali, Nusa Tenggara). */
const WITA: Timezone = "Asia/Makassar";
/** WIT — Eastern Indonesia (Maluku, Papua). */
const WIT: Timezone = "Asia/Jayapura";

export const CITIES: City[] = [
  {
    slug: "jakarta",
    name: "Jakarta",
    province: "DKI Jakarta",
    timezone: WIB,
    aliases: [
      "dki jakarta",
      "dki",
      "jkt",
      "jakarta pusat",
      "jakarta selatan",
      "jakarta barat",
      "jakarta timur",
      "jakarta utara",
      "jakpus",
      "jaksel",
      "jakbar",
      "jaktim",
      "jakut",
    ],
  },
  {
    slug: "surabaya",
    name: "Surabaya",
    province: "Jawa Timur",
    timezone: WIB,
    aliases: ["sby", "kota surabaya"],
  },
  {
    slug: "bandung",
    name: "Bandung",
    province: "Jawa Barat",
    timezone: WIB,
    aliases: ["bdg", "kota bandung"],
  },
  {
    slug: "medan",
    name: "Medan",
    province: "Sumatera Utara",
    timezone: WIB,
    aliases: ["mdn", "kota medan"],
  },
  {
    slug: "semarang",
    name: "Semarang",
    province: "Jawa Tengah",
    timezone: WIB,
    aliases: ["smg", "kota semarang"],
  },
  {
    slug: "yogyakarta",
    name: "Yogyakarta",
    province: "DI Yogyakarta",
    timezone: WIB,
    aliases: ["jogja", "yogya", "jogjakarta", "diy", "yk"],
  },
  {
    slug: "makassar",
    name: "Makassar",
    province: "Sulawesi Selatan",
    timezone: WITA,
    aliases: ["ujung pandang", "mks"],
  },
  {
    slug: "denpasar",
    name: "Denpasar",
    province: "Bali",
    timezone: WITA,
    aliases: ["bali", "dps"],
  },
  {
    slug: "palembang",
    name: "Palembang",
    province: "Sumatera Selatan",
    timezone: WIB,
    aliases: ["plg"],
  },
  {
    slug: "tangerang",
    name: "Tangerang",
    province: "Banten",
    timezone: WIB,
    aliases: ["tangerang selatan", "tangsel", "kota tangerang"],
  },
  {
    slug: "bekasi",
    name: "Bekasi",
    province: "Jawa Barat",
    timezone: WIB,
    aliases: ["kota bekasi"],
  },
  {
    slug: "depok",
    name: "Depok",
    province: "Jawa Barat",
    timezone: WIB,
    aliases: ["kota depok"],
  },
  {
    slug: "malang",
    name: "Malang",
    province: "Jawa Timur",
    timezone: WIB,
    aliases: ["kota malang", "mlg"],
  },
  {
    slug: "bogor",
    name: "Bogor",
    province: "Jawa Barat",
    timezone: WIB,
    aliases: ["kota bogor"],
  },
  {
    slug: "batam",
    name: "Batam",
    province: "Kepulauan Riau",
    timezone: WIB,
    aliases: ["kota batam"],
  },
  {
    slug: "pekanbaru",
    name: "Pekanbaru",
    province: "Riau",
    timezone: WIB,
    aliases: ["pku"],
  },
  {
    slug: "bandar-lampung",
    name: "Bandar Lampung",
    province: "Lampung",
    timezone: WIB,
    aliases: ["bandarlampung", "lampung", "tanjungkarang"],
  },
  {
    slug: "padang",
    name: "Padang",
    province: "Sumatera Barat",
    timezone: WIB,
    aliases: ["kota padang"],
  },
  {
    slug: "manado",
    name: "Manado",
    province: "Sulawesi Utara",
    timezone: WITA,
    aliases: ["mdo"],
  },
  {
    slug: "samarinda",
    name: "Samarinda",
    province: "Kalimantan Timur",
    timezone: WITA,
    aliases: ["smd"],
  },
  {
    slug: "banjarmasin",
    name: "Banjarmasin",
    province: "Kalimantan Selatan",
    timezone: WITA,
    aliases: ["bjm"],
  },
  {
    slug: "balikpapan",
    name: "Balikpapan",
    province: "Kalimantan Timur",
    timezone: WITA,
    aliases: ["bpp"],
  },
  {
    slug: "pontianak",
    name: "Pontianak",
    province: "Kalimantan Barat",
    timezone: WIB,
    aliases: ["ptk"],
  },
  {
    slug: "serang",
    name: "Serang",
    province: "Banten",
    timezone: WIB,
    aliases: ["kota serang"],
  },
  {
    slug: "cirebon",
    name: "Cirebon",
    province: "Jawa Barat",
    timezone: WIB,
    aliases: ["kota cirebon"],
  },
  {
    slug: "sukabumi",
    name: "Sukabumi",
    province: "Jawa Barat",
    timezone: WIB,
    aliases: ["kota sukabumi"],
  },
  {
    slug: "jambi",
    name: "Jambi",
    province: "Jambi",
    timezone: WIB,
    aliases: ["kota jambi"],
  },
  {
    slug: "ambon",
    name: "Ambon",
    province: "Maluku",
    timezone: WIT,
    aliases: ["kota ambon"],
  },
  {
    slug: "jayapura",
    name: "Jayapura",
    province: "Papua",
    timezone: WIT,
    aliases: ["kota jayapura"],
  },
  {
    slug: "mataram",
    name: "Mataram",
    province: "Nusa Tenggara Barat",
    timezone: WITA,
    aliases: ["lombok", "ntb"],
  },
];

/** Cities sorted for display in pickers: alphabetical by name. */
export const CITIES_BY_NAME: City[] = [...CITIES].sort((a, b) =>
  a.name.localeCompare(b.name, "id")
);

const BY_SLUG: Map<string, City> = new Map(CITIES.map((c) => [c.slug, c]));

/**
 * Every string that should resolve to a city: its slug, its lowercased name,
 * and each declared alias. Built once at module load.
 */
const BY_LOOKUP_KEY: Map<string, City> = (() => {
  const map = new Map<string, City>();
  for (const city of CITIES) {
    map.set(city.slug, city);
    map.set(normalizeKey(city.name), city);
    for (const alias of city.aliases) {
      map.set(normalizeKey(alias), city);
    }
  }
  return map;
})();

/**
 * Collapse a user- or database-supplied city string into a comparable key:
 * lowercase, accent-free, punctuation-free, single-spaced. "DKI  Jakarta." and
 * "dki jakarta" both become "dki jakarta".
 */
function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Resolve any city string — a slug, a display name, an alias, or a legacy
 * free-text value from the database — to its canonical City. Returns null when
 * the string matches nothing in the registry.
 */
export function resolveCity(value: string | null | undefined): City | null {
  if (!value) return null;
  const key = normalizeKey(value);
  if (!key) return null;

  const direct = BY_LOOKUP_KEY.get(key);
  if (direct) return direct;

  // Slug form ("bandar-lampung") normalizes to "bandar lampung"; try the
  // hyphenated variant too so slugs round-trip.
  return BY_LOOKUP_KEY.get(key.replace(/ /g, "-")) ?? null;
}

/** Look up strictly by slug. Use for route params, where only slugs are valid. */
export function getCityBySlug(slug: string | null | undefined): City | null {
  if (!slug) return null;
  return BY_SLUG.get(slug.toLowerCase()) ?? null;
}

/** True when both strings resolve to the same canonical city. */
export function isSameCity(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const cityA = resolveCity(a);
  const cityB = resolveCity(b);
  return cityA !== null && cityB !== null && cityA.slug === cityB.slug;
}

/**
 * Every string a database `location` column might hold for this city, for use
 * with a Supabase `.in()` filter. Covers the canonical name, the slug, and all
 * aliases so rows written before the registry existed still match.
 */
export function locationMatchValues(city: City): string[] {
  const values = new Set<string>([city.name, city.slug, ...city.aliases]);
  // Legacy rows were free text and could carry any casing; include the common
  // Title Case rendering of each alias alongside the raw lowercase form.
  for (const alias of city.aliases) {
    values.add(alias.replace(/\b\w/g, (ch) => ch.toUpperCase()));
  }
  return [...values];
}

/**
 * Substring search over name, province, and aliases, for a city combobox.
 * Returns the full list when the query is empty.
 */
export function searchCities(query: string, limit = 8): City[] {
  const key = normalizeKey(query);
  if (!key) return CITIES_BY_NAME.slice(0, limit);

  const startsWith: City[] = [];
  const contains: City[] = [];

  for (const city of CITIES_BY_NAME) {
    const haystacks = [
      normalizeKey(city.name),
      normalizeKey(city.province),
      ...city.aliases.map(normalizeKey),
    ];
    if (haystacks.some((h) => h.startsWith(key))) {
      startsWith.push(city);
    } else if (haystacks.some((h) => h.includes(key))) {
      contains.push(city);
    }
  }

  return [...startsWith, ...contains].slice(0, limit);
}
