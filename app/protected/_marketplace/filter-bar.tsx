"use client";

/**
 * Marketplace chrome — the heading, the sticky filter bar and the empty state
 * that sit around the streamer grid on `/protected` and `/streamers`.
 *
 * Everything here is client-side. The two pages already load their whole
 * listing in one request; sorting and faceting happen over the array that is
 * in memory, so no filter interaction costs a round trip and no query changes
 * shape. The facet *options* are derived from that same array rather than
 * hardcoded — a city with no hosts in it is not offered as a filter, because
 * offering it only leads to the empty state.
 *
 * Copy is verbatim from design/REFERENCE.md ("Filter bar" under Client).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveCity } from "@/lib/cities";
import { subtotalWithPlatformFee } from "@/lib/pricing";

/* ------------------------------------------------------------------ copy - */

export const MARKETPLACE_HEADING = "Host siap live minggu ini";
export const CLEAR_FILTERS_LABEL = "Bersihkan semua filter";
export const EMPTY_TITLE = "Belum ada host yang cocok";
export const EMPTY_BODY = "Coba longgarkan filter kota atau harga.";

const FACET_CITY = "Kota";
const FACET_PLATFORM = "Platform";
const FACET_PRICE = "Harga per jam";
const FACET_RATING = "Rating";

export type SortKey = "rekomendasi" | "harga" | "rating" | "booking";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "rekomendasi", label: "Rekomendasi" },
  { key: "harga", label: "Harga terendah" },
  { key: "rating", label: "Rating tertinggi" },
  { key: "booking", label: "Paling sering dibooking" },
];

/**
 * Nothing in the listing payload counts completed bookings — the marketplace
 * query selects the `streamers` row and its current discount, and there is no
 * aggregate to sort on. The chip stays in the bar because the design specifies
 * it, but it is disabled rather than wired to a stand-in: ranking hosts by a
 * number we invented is exactly the data fabrication this redesign removed.
 */
const SORT_WITHOUT_DATA: SortKey = "booking";

/* ----------------------------------------------------------------- shape - */

/**
 * The only fields the filtering touches. Deliberately looser than
 * `Streamer` so both callers fit: `/protected` holds its list as `any[]`
 * coming out of `/api/streamers`, `/streamers` holds typed rows from Supabase.
 */
export interface MarketplaceStreamer {
  price?: number | null;
  rating?: number | null;
  location?: string | null;
  city_slug?: string | null;
  platform?: string | null;
  platforms?: (string | null)[] | null;
}

export interface MarketplaceFilters {
  sort: SortKey;
  /** Lowercased city label. Empty string means "every city". */
  city: string;
  /** Lowercased platform keys. Empty array means "every platform". */
  platforms: string[];
  /** Id of a bucket in PRICE_BUCKETS. Empty string means "any price". */
  price: string;
  /** Minimum rating. 0 means "any rating". */
  rating: number;
}

export const EMPTY_MARKETPLACE_FILTERS: MarketplaceFilters = {
  sort: "rekomendasi",
  city: "",
  platforms: [],
  price: "",
  rating: 0,
};

export function countActiveFacets(filters: MarketplaceFilters): number {
  return (
    (filters.city ? 1 : 0) +
    (filters.platforms.length > 0 ? 1 : 0) +
    (filters.price ? 1 : 0) +
    (filters.rating > 0 ? 1 : 0)
  );
}

/* ------------------------------------------------------------- normalise - */

/** Brand spellings for the two platforms the product actually supports. */
const PLATFORM_LABELS: Record<string, string> = {
  tiktok: "TikTok",
  shopee: "Shopee",
};

function platformLabel(key: string): string {
  return PLATFORM_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Same normalisation the card does: `platform` is a free-text column that
 * arrives as "TikTok", "shopee, tiktok", "both", or nothing at all.
 */
function platformKeys(streamer: MarketplaceStreamer): string[] {
  if (streamer.platforms && streamer.platforms.length > 0) {
    const normalised = streamer.platforms
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      .map((p) => p.trim().toLowerCase());
    if (normalised.length > 0) return normalised;
  }

  const platform = streamer.platform?.trim();
  if (!platform) return [];
  if (platform.toLowerCase() === "both") return ["tiktok", "shopee"];

  return platform
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
}

/** Display city, preferring the canonical slug the way the card does. */
function cityLabel(streamer: MarketplaceStreamer): string {
  const raw = streamer.city_slug || streamer.location || "";
  const city = resolveCity(raw);
  return city?.name || raw.trim();
}

/**
 * What the brand is quoted, not what the host receives. The card prints the
 * fee-inclusive price, so a bucket labelled "Rp 100rb – Rp 250rb" has to mean
 * the number on the card — filtering on the base price would drop cards whose
 * printed price sits inside the range the reader just picked.
 */
function displayPrice(streamer: MarketplaceStreamer): number | null {
  const price = streamer.price;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return null;
  }
  return subtotalWithPlatformFee(price);
}

function ratingOf(streamer: MarketplaceStreamer): number | null {
  const rating = streamer.rating;
  if (typeof rating !== "number" || !Number.isFinite(rating) || rating <= 0) {
    return null;
  }
  return rating;
}

/* --------------------------------------------------------------- buckets - */

interface PriceBucket {
  id: string;
  label: string;
  min: number;
  max: number;
}

/**
 * Four buckets rather than a two-handle slider: on a listing this size the
 * slider produced ranges nobody meant (Rp 143.000–Rp 861.000) and needed a
 * modal to hold it. Bounds are in fee-inclusive rupiah, i.e. the number
 * printed on the card.
 */
const PRICE_BUCKETS: PriceBucket[] = [
  { id: "lt100", label: "< Rp 100rb", min: 0, max: 100_000 },
  { id: "100-250", label: "Rp 100rb – Rp 250rb", min: 100_000, max: 250_000 },
  { id: "250-500", label: "Rp 250rb – Rp 500rb", min: 250_000, max: 500_000 },
  { id: "gt500", label: "> Rp 500rb", min: 500_000, max: Number.POSITIVE_INFINITY },
];

const RATING_OPTIONS: { value: number; label: string }[] = [
  { value: 4.5, label: "4,5+" },
  { value: 4, label: "4,0+" },
  { value: 3.5, label: "3,5+" },
];

/* --------------------------------------------------------------- filter - */

export function applyMarketplaceFilters<T extends MarketplaceStreamer>(
  streamers: T[],
  filters: MarketplaceFilters,
): T[] {
  const bucket = PRICE_BUCKETS.find((b) => b.id === filters.price) ?? null;

  const matched = streamers.filter((streamer) => {
    if (filters.city && cityLabel(streamer).toLowerCase() !== filters.city) {
      return false;
    }

    if (filters.platforms.length > 0) {
      const keys = platformKeys(streamer);
      // "Any of the chosen platforms", not "all of them": picking TikTok and
      // Shopee is how you ask to see both kinds of host, not how you ask for
      // the handful who stream on each.
      if (!filters.platforms.some((p) => keys.includes(p))) return false;
    }

    if (bucket) {
      const price = displayPrice(streamer);
      // A host who has not set a price has made no offer, so no price range
      // can describe them. They stay visible until a range is actually chosen.
      if (price === null) return false;
      if (price < bucket.min || price >= bucket.max) return false;
    }

    if (filters.rating > 0) {
      const rating = ratingOf(streamer);
      if (rating === null || rating < filters.rating) return false;
    }

    return true;
  });

  // `sort` mutates, and the array above is already a fresh one, so this never
  // reorders the caller's state. Array#sort is stable, which is what keeps
  // "Rekomendasi" order as the tiebreaker inside every other sort.
  if (filters.sort === "harga") {
    return matched.sort((a, b) => {
      const pa = displayPrice(a);
      const pb = displayPrice(b);
      // A price-less host cannot be the cheapest. Nulls go last in every sort
      // rather than sorting as zero, which would put unfinished profiles at
      // the top of "Harga terendah".
      if (pa === null && pb === null) return 0;
      if (pa === null) return 1;
      if (pb === null) return -1;
      return pa - pb;
    });
  }

  if (filters.sort === "rating") {
    return matched.sort((a, b) => {
      const ra = ratingOf(a);
      const rb = ratingOf(b);
      if (ra === null && rb === null) return 0;
      if (ra === null) return 1;
      if (rb === null) return -1;
      return rb - ra;
    });
  }

  // "Rekomendasi" is the order the listing arrived in — and so is the
  // booking-frequency sort, which has no column to order by.
  return matched;
}

/* ------------------------------------------------------------------ ui -- */

function Chip({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-pill border px-3.5 py-1.5 text-copy transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected
          ? "border-ink bg-ink font-medium text-white"
          : "border-hairline-input bg-surface text-ink-muted hover:border-hairline-strong hover:text-ink",
        disabled && "cursor-not-allowed border-hairline bg-surface text-ink-ghost hover:border-hairline hover:text-ink-ghost",
      )}
    >
      {label}
    </button>
  );
}

const FACET_PANEL_WIDTH = 236;
const VIEWPORT_MARGIN = 12;

/**
 * A facet trigger and its panel.
 *
 * The panel is a menu, not a dialog: a filter is not a decision that deserves
 * to take over the screen, and the grid behind it updates as you tick options,
 * which is the whole feedback loop. Closing on outside-pointerdown and Escape
 * is what a menu owes you.
 *
 * It is rendered into `document.body` and positioned from the trigger's rect
 * rather than absolutely inside it. Two ancestors would otherwise eat it: the
 * facet row scrolls sideways, and `overflow-x` forces `overflow-y` to compute
 * to `auto`, so an absolute child would be clipped to a 30px-tall strip — and
 * the sticky bar's `backdrop-filter` makes it a containing block for `fixed`
 * descendants, so even `position: fixed` would not escape. A portal does.
 */
function Facet({
  label,
  value,
  numeric,
  children,
}: {
  label: string;
  /** Current selection, rendered next to the label. Null when unset. */
  value: string | null;
  /** Tabular figures — set on the facets whose options are numbers. */
  numeric?: boolean;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Clamp so the last facet's panel does not hang off the right edge and
      // give the page a horizontal scrollbar.
      const maxLeft = window.innerWidth - FACET_PANEL_WIDTH - VIEWPORT_MARGIN;
      setCoords({
        top: rect.bottom + 6,
        left: Math.max(VIEWPORT_MARGIN, Math.min(rect.left, maxLeft)),
      });
    };

    place();

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      // The trigger's own click handler does the toggling. Closing here too
      // would close it on press and reopen it on click, which reads as a menu
      // that cannot be dismissed.
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    // Capture phase: the row the trigger sits in scrolls, and that scroll does
    // not bubble to window.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        className={cn(
          "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border px-3.5 py-1.5",
          "text-copy transition-colors focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-ring focus-visible:ring-offset-2",
          value
            ? "border-hairline-strong bg-surface-deep font-medium text-ink"
            : "border-hairline-input bg-surface text-ink-muted hover:border-hairline-strong hover:text-ink",
        )}
      >
        <span>{label}</span>
        {value ? (
          <span
            className={cn("max-w-[120px] truncate text-ink-muted", numeric && "numeric")}
          >
            · {value}
          </span>
        ) : null}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && coords
        ? createPortal(
            <div
              ref={panelRef}
              style={{ top: coords.top, left: coords.left, width: FACET_PANEL_WIDTH }}
              // Above the fixed navbar, which sits at z-[100].
              className="fixed z-[110] max-h-[300px] overflow-y-auto rounded-panel
                border border-hairline-strong bg-surface p-1.5"
            >
              {children(() => setOpen(false))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function Option({
  label,
  selected,
  numeric,
  onClick,
}: {
  label: string;
  selected: boolean;
  numeric?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-field px-2.5 py-2 text-left text-copy transition-colors",
        selected ? "bg-surface-tint font-medium text-ink" : "text-ink-body hover:bg-surface-tint",
      )}
    >
      <span className={cn("min-w-0 flex-1 truncate", numeric && "numeric")}>{label}</span>
      {selected ? <Check className="h-3.5 w-3.5 shrink-0 text-ink" /> : null}
    </button>
  );
}

/* -------------------------------------------------------------- filter bar */

export interface MarketplaceFilterBarProps<T extends MarketplaceStreamer> {
  /** The full loaded listing — facet options are derived from it. */
  streamers: T[];
  filters: MarketplaceFilters;
  onChange: (filters: MarketplaceFilters) => void;
  /**
   * Sticky offset. `/protected` sits under a fixed navbar and passes its
   * height; `/streamers` has no chrome above it and sticks to the top.
   */
  stickyTopClassName?: string;
}

export function MarketplaceFilterBar<T extends MarketplaceStreamer>({
  streamers,
  filters,
  onChange,
  stickyTopClassName = "top-0",
}: MarketplaceFilterBarProps<T>) {
  // Options come from the loaded rows, so the bar can never offer a filter
  // that returns nothing.
  const cityOptions = useMemo(() => {
    const seen = new Map<string, string>();
    streamers.forEach((streamer) => {
      const label = cityLabel(streamer);
      if (label) seen.set(label.toLowerCase(), label);
    });
    // Array.from rather than a spread: tsconfig targets es5, where spreading an
    // iterator needs --downlevelIteration. Array.from is typed for iterables and
    // needs no flag.
    return Array.from(seen.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "id"));
  }, [streamers]);

  const platformOptions = useMemo(() => {
    const seen = new Set<string>();
    streamers.forEach((streamer) => platformKeys(streamer).forEach((p) => seen.add(p)));
    return Array.from(seen).sort().map((key) => ({ key, label: platformLabel(key) }));
  }, [streamers]);

  const set = (patch: Partial<MarketplaceFilters>) => onChange({ ...filters, ...patch });

  const activeCity = cityOptions.find((c) => c.key === filters.city)?.label ?? null;
  const activePrice = PRICE_BUCKETS.find((b) => b.id === filters.price)?.label ?? null;
  const activeRating = RATING_OPTIONS.find((r) => r.value === filters.rating)?.label ?? null;
  const activePlatforms =
    filters.platforms.length > 0
      ? filters.platforms.map(platformLabel).join(" · ")
      : null;

  const hasFacets = countActiveFacets(filters) > 0;

  // Rows scroll sideways rather than reflowing. A filter bar that wraps to
  // three lines on a phone pushes the first card below the fold, which is the
  // one thing the bar exists to help you reach.
  const rowClass =
    "flex flex-nowrap items-center gap-2 overflow-x-auto [-ms-overflow-style:none] " +
    "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  return (
    <div
      className={cn(
        "sticky z-40 border-b border-hairline bg-canvas/95 backdrop-blur-[10px]",
        stickyTopClassName,
      )}
    >
      <div className="mx-auto flex max-w-[1180px] flex-col gap-2 px-5 py-3 sm:px-8">
        <div className={rowClass}>
          {SORTS.map((sort) => (
            <Chip
              key={sort.key}
              label={sort.label}
              selected={filters.sort === sort.key}
              disabled={sort.key === SORT_WITHOUT_DATA}
              onClick={() => set({ sort: sort.key })}
            />
          ))}
        </div>

        <div className={rowClass}>
          <Facet label={FACET_CITY} value={activeCity}>
            {(close) =>
              cityOptions.map((city) => (
                <Option
                  key={city.key}
                  label={city.label}
                  selected={filters.city === city.key}
                  onClick={() => {
                    set({ city: filters.city === city.key ? "" : city.key });
                    close();
                  }}
                />
              ))
            }
          </Facet>

          <Facet label={FACET_PLATFORM} value={activePlatforms}>
            {() =>
              platformOptions.map((platform) => (
                <Option
                  key={platform.key}
                  label={platform.label}
                  selected={filters.platforms.includes(platform.key)}
                  onClick={() =>
                    set({
                      platforms: filters.platforms.includes(platform.key)
                        ? filters.platforms.filter((p) => p !== platform.key)
                        : [...filters.platforms, platform.key],
                    })
                  }
                />
              ))
            }
          </Facet>

          <Facet label={FACET_PRICE} value={activePrice} numeric>
            {(close) =>
              PRICE_BUCKETS.map((bucket) => (
                <Option
                  key={bucket.id}
                  label={bucket.label}
                  numeric
                  selected={filters.price === bucket.id}
                  onClick={() => {
                    set({ price: filters.price === bucket.id ? "" : bucket.id });
                    close();
                  }}
                />
              ))
            }
          </Facet>

          <Facet label={FACET_RATING} value={activeRating} numeric>
            {(close) =>
              RATING_OPTIONS.map((option) => (
                <Option
                  key={option.value}
                  label={option.label}
                  numeric
                  selected={filters.rating === option.value}
                  onClick={() => {
                    set({ rating: filters.rating === option.value ? 0 : option.value });
                    close();
                  }}
                />
              ))
            }
          </Facet>

          {/* Only there once there is something to clear. A permanently
              visible "clear" on an untouched bar is a control that does
              nothing, sitting next to three that do. */}
          {hasFacets ? (
            <button
              type="button"
              onClick={() => onChange({ ...EMPTY_MARKETPLACE_FILTERS, sort: filters.sort })}
              className="ml-auto shrink-0 whitespace-nowrap rounded-pill px-2 py-1.5 text-copy
                text-ink-soft underline-offset-4 transition-colors hover:text-ink hover:underline
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                focus-visible:ring-offset-2"
            >
              {CLEAR_FILTERS_LABEL}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- heading - */

export function MarketplaceHeading({ className }: { className?: string }) {
  return (
    <h1 className={cn("font-serif text-display font-normal text-ink", className)}>
      {MARKETPLACE_HEADING}
    </h1>
  );
}

/* ----------------------------------------------------------- empty state - */

export function MarketplaceEmptyState({ onClear }: { onClear?: () => void }) {
  return (
    <div className="rounded-panel border border-hairline bg-surface px-6 py-20 text-center">
      <h2 className="font-serif text-title text-ink">{EMPTY_TITLE}</h2>
      <p className="mx-auto mt-2 max-w-sm text-copy text-ink-soft">{EMPTY_BODY}</p>
      {onClear ? (
        <Button variant="quiet" size="action-compact" className="mt-6" onClick={onClear}>
          {CLEAR_FILTERS_LABEL}
        </Button>
      ) : null}
    </div>
  );
}
