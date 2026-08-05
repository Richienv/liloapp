/**
 * Suggested hourly rates by category.
 *
 * Naming your own price cold is the hardest decision the signup asks a new host
 * to make, and a hard decision in the middle of a form is where people stop. A
 * suggestion turns it into a confirmation: the field arrives pre-filled and
 * editable, with the range it came from shown underneath.
 *
 * These are starting anchors, not policy. Once there is enough real data they
 * should be replaced by the live median per category — the shape of the export
 * is deliberately the same either way so the swap is a one-file change.
 */

export interface PriceBand {
  /** Category slug/label as stored on `streamers.category`. */
  category: string;
  /** What the field is pre-filled with, in rupiah per hour. */
  suggested: number;
  /** Shown as context: "biasanya Rp X – Rp Y per jam". */
  min: number;
  max: number;
}

/** Fallback for a category we have no anchor for. */
export const DEFAULT_PRICE_BAND: PriceBand = {
  category: "default",
  suggested: 150_000,
  min: 100_000,
  max: 300_000,
};

export const PRICE_BANDS: PriceBand[] = [
  { category: "Fashion", suggested: 150_000, min: 100_000, max: 300_000 },
  { category: "Beauty", suggested: 175_000, min: 120_000, max: 350_000 },
  { category: "Kecantikan", suggested: 175_000, min: 120_000, max: 350_000 },
  { category: "Elektronik", suggested: 200_000, min: 150_000, max: 400_000 },
  { category: "Gadget", suggested: 200_000, min: 150_000, max: 400_000 },
  { category: "Makanan", suggested: 125_000, min: 90_000, max: 250_000 },
  { category: "Minuman", suggested: 125_000, min: 90_000, max: 250_000 },
  { category: "Rumah Tangga", suggested: 130_000, min: 90_000, max: 260_000 },
  { category: "Olahraga", suggested: 140_000, min: 100_000, max: 280_000 },
  { category: "Kesehatan", suggested: 160_000, min: 110_000, max: 320_000 },
  { category: "Ibu & Anak", suggested: 150_000, min: 100_000, max: 300_000 },
  { category: "Otomotif", suggested: 180_000, min: 130_000, max: 360_000 },
  { category: "Buku", suggested: 110_000, min: 80_000, max: 220_000 },
  { category: "Mainan", suggested: 120_000, min: 90_000, max: 240_000 },
  { category: "Lainnya", suggested: 150_000, min: 100_000, max: 300_000 },
];

const BY_CATEGORY = new Map(
  PRICE_BANDS.map((band) => [band.category.toLowerCase(), band]),
);

/**
 * Look up the band for a category. Accepts the comma-joined string the signup
 * stores (`"Fashion,Beauty"`) and anchors on the first entry, since that is the
 * one the host led with.
 */
export function priceBandFor(category: string | null | undefined): PriceBand {
  if (!category) return DEFAULT_PRICE_BAND;

  const primary = category.split(",")[0]?.trim().toLowerCase();
  if (!primary) return DEFAULT_PRICE_BAND;

  return BY_CATEGORY.get(primary) ?? DEFAULT_PRICE_BAND;
}

/** "Rp 150.000" — matches how prices are written everywhere else in the app. */
export function formatRupiah(amount: number): string {
  return `Rp ${Math.round(amount).toLocaleString("id-ID")}`;
}

/** Ready-made helper copy: "Host Fashion biasanya Rp 100.000 – Rp 300.000 per jam." */
export function priceHint(category: string | null | undefined): string {
  const band = priceBandFor(category);
  const label = band.category === "default" ? "Host baru" : `Host ${band.category}`;
  return `${label} biasanya ${formatRupiah(band.min)} – ${formatRupiah(band.max)} per jam.`;
}
