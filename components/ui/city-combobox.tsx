"use client";

import * as React from "react";
import { Check, ChevronsUpDown, MapPin, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getCityBySlug,
  resolveCity,
  searchCities,
  type City,
} from "@/lib/cities";

/**
 * Searchable city picker that always emits a canonical slug from lib/cities.
 *
 * Why a combobox and not a text input: city lookups in the app use exact
 * `.eq()` matching, so a free-text "Jaksel" / "DKI Jakarta" / "jakarta " never
 * matches the "Jakarta" rows a brand is browsing. Constraining the value to a
 * slug is the only way city discovery and the /location/<slug> pages work.
 *
 * Why not a plain <Select>: 30 cities in a fixed list is already too many to
 * scan, and Indonesians type aliases ("jogja", "sby", "bali") rather than the
 * official name — searchCities() matches those, a Select cannot.
 */

const RESULT_LIMIT = 8;

/* -------------------------------------------------------------------------- */
/* Geo default                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The geo headers Vercel puts on every request. Read them in a Server Component
 * (`headers()`) and hand the result down — this component never reads headers
 * or calls the network itself.
 */
export interface GeoCityHint {
  /** `x-vercel-ip-city`, e.g. "Jakarta" or "Bandar%20Lampung". */
  city?: string | null;
  /** `x-vercel-ip-country-region`, an ISO-3166-2 subdivision code, e.g. "JK". */
  region?: string | null;
  /** `x-vercel-ip-country`, e.g. "ID". Anything else disables the guess. */
  country?: string | null;
}

/**
 * The handful of Indonesian subdivision codes where the province maps to
 * exactly one city we serve. Everything wider than this ("Jawa Barat" could be
 * Bandung, Bekasi, Depok, Bogor, Cirebon or Sukabumi) is deliberately left
 * unguessed: a confident wrong default is worse than an empty field, because
 * people accept defaults without reading them.
 */
const UNAMBIGUOUS_REGIONS: { [code: string]: string } = {
  JK: "jakarta", // DKI Jakarta — the province is the city
  YO: "yogyakarta", // DI Yogyakarta
  BA: "denpasar", // Bali — the only Bali city in the registry
};

/** Header values arrive percent-encoded on some edges ("Bandar%20Lampung"). */
function decodeHeader(value: string | null | undefined): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

/**
 * The geo database names cities in English, so the ones Indonesians split by
 * direction come through as "South Jakarta" / "South Tangerang" rather than
 * "Jakarta Selatan" / "Tangerang Selatan" (which lib/cities already aliases).
 * Dropping the direction word lands them on the right registry entry.
 */
function resolveEnglishCityName(name: string): City | null {
  const stripped = name.replace(/^(north|south|east|west|central)\s+/i, "");
  return stripped === name ? null : resolveCity(stripped);
}

/**
 * Turn a Vercel geo hint into a city slug, or undefined when we cannot tell.
 *
 * City comes first because it is specific; the region code is only consulted
 * for the provinces above. Everything runs through `resolveCity()` so aliases
 * ("DKI", "Jogja", "Ujung Pandang") land on the same slug the picker emits.
 *
 * This module is `"use client"`, so a Server Component cannot call this across
 * the boundary — it reads the headers and passes the raw values in:
 *
 *   // page.tsx (server)
 *   const h = headers();
 *   <SignupForm geo={{
 *     city: h.get("x-vercel-ip-city"),
 *     region: h.get("x-vercel-ip-country-region"),
 *     country: h.get("x-vercel-ip-country"),
 *   }} />
 *
 *   // signup-form.tsx (client)
 *   <CityCombobox defaultSlug={cityDefaultFromGeo(geo)} ... />
 *
 * Locally and in preview the headers are simply absent, which returns undefined
 * and leaves the field empty — the behaviour before this existed.
 */
export function cityDefaultFromGeo(
  hint: GeoCityHint | null | undefined,
): string | undefined {
  if (!hint) return undefined;

  // A visitor outside Indonesia gets no guess at all.
  const country = decodeHeader(hint.country).toUpperCase();
  if (country && country !== "ID") return undefined;

  const cityName = decodeHeader(hint.city);
  const fromCity = resolveCity(cityName) ?? resolveEnglishCityName(cityName);
  if (fromCity) return fromCity.slug;

  const region = decodeHeader(hint.region);
  if (!region) return undefined;

  // Some edges send the province name instead of the code; resolveCity()
  // handles the ones that are also city aliases ("Bali", "Lampung").
  const fromRegionName = resolveCity(region);
  if (fromRegionName) return fromRegionName.slug;

  return UNAMBIGUOUS_REGIONS[region.toUpperCase()];
}

export interface CityComboboxProps {
  /**
   * Canonical city slug. A legacy free-text value (e.g. "DKI Jakarta") is
   * resolved for display so existing data still renders correctly.
   */
  value: string;
  /** Called with the canonical slug — never with free text. */
  onChange: (slug: string) => void;
  /**
   * City to pre-select when `value` is still empty, typically from
   * {@link cityDefaultFromGeo}. Applied once, on mount, via `onChange`, so the
   * field arrives filled in and editable instead of asking for something we can
   * already guess — and a small note tells the user where the guess came from.
   *
   * Only pass this for a fresh form. A restored draft sets `value` itself and
   * therefore always wins; a user's own pick clears the note.
   */
  defaultSlug?: string;
  id?: string;
  /**
   * When set, a hidden input carries the slug so a native form submission
   * includes it. Forms that build FormData by hand can ignore this.
   */
  name?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  /** Applied to the trigger so callers can match their own field styling. */
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export function CityCombobox({
  value,
  onChange,
  defaultSlug,
  id,
  name,
  placeholder = "Pilih kota",
  searchPlaceholder = "Cari kota, provinsi, atau singkatan...",
  emptyMessage = "Kota tidak ditemukan.",
  disabled = false,
  className,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: CityComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  /** True while the shown city is our guess and the user has not confirmed it. */
  const [usedGeoDefault, setUsedGeoDefault] = React.useState(false);

  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const reactId = React.useId();
  const listboxId = `${reactId}-city-listbox`;

  const selected: City | null = React.useMemo(
    () => getCityBySlug(value) ?? resolveCity(value),
    [value]
  );

  // Kept in a ref so applying the default does not depend on the caller passing
  // a stable onChange — inline arrows are the norm in these forms.
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const defaultAppliedRef = React.useRef(false);

  // Pre-fill from the geo hint exactly once, and only into an empty field.
  React.useEffect(() => {
    if (defaultAppliedRef.current || disabled) return;

    // Something is already selected (a restored draft, saved profile data, or
    // the user). Never argue with it.
    if (value) {
      defaultAppliedRef.current = true;
      return;
    }

    const guess = getCityBySlug(defaultSlug) ?? resolveCity(defaultSlug);
    if (!guess) return;

    defaultAppliedRef.current = true;
    setUsedGeoDefault(true);
    onChangeRef.current(guess.slug);
  }, [defaultSlug, value, disabled]);

  const results = React.useMemo(
    () => searchCities(query, RESULT_LIMIT),
    [query]
  );

  // Keep the highlighted row inside the list whenever the result set shrinks.
  React.useEffect(() => {
    setActiveIndex((current) =>
      results.length === 0 ? 0 : Math.min(current, results.length - 1)
    );
  }, [results.length]);

  // Scroll the highlighted row into view for keyboard-only users.
  React.useEffect(() => {
    if (!open) return;
    const node = listRef.current?.children[activeIndex] as
      | HTMLElement
      | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery("");
      setActiveIndex(0);
    }
  };

  const select = (city: City) => {
    // The user has now chosen for themselves; the "we guessed this" note goes.
    setUsedGeoDefault(false);
    onChange(city.slug);
    setOpen(false);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) =>
        results.length === 0 ? 0 : (i - 1 + results.length) % results.length
      );
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(results.length - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      // Never let Enter reach the surrounding multi-step form: there it would
      // submit or reset the whole thing. Here it only picks the highlighted city.
      event.preventDefault();
      event.stopPropagation();
      const city = results[activeIndex];
      if (city) select(city);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={open ? listboxId : undefined}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            disabled={disabled}
            className={cn(
              "flex h-12 w-full items-center justify-between gap-2 rounded-panel border border-hairline-input bg-surface-tint px-4 text-left text-base",
              "transition-all duration-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
              "disabled:cursor-not-allowed disabled:opacity-50",
              className
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <MapPin className="h-4 w-4 flex-shrink-0 text-ink-faint" />
              {selected ? (
                <span className="truncate text-ink">
                  {selected.name}
                  <span className="text-ink-soft"> — {selected.province}</span>
                </span>
              ) : (
                <span className="truncate text-ink-soft">{placeholder}</span>
              )}
            </span>
            <ChevronsUpDown className="h-4 w-4 flex-shrink-0 text-ink-faint" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-[--radix-popover-trigger-width] p-0"
          onOpenAutoFocus={(event) => {
            // Focus the search box, not the popover container, so typing works
            // immediately.
            event.preventDefault();
            searchRef.current?.focus();
          }}
        >
          <div className="flex items-center gap-2 border-b border-hairline px-3">
            <Search className="h-4 w-4 flex-shrink-0 text-ink-faint" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              aria-controls={listboxId}
              aria-activedescendant={
                results.length > 0 ? `${listboxId}-${activeIndex}` : undefined
              }
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-ink-faint"
            />
          </div>

          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-soft">
              {emptyMessage}
            </p>
          ) : (
            <ul
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-label="Daftar kota"
              className="max-h-64 overflow-y-auto py-1"
            >
              {results.map((city, index) => {
                const isSelected = selected?.slug === city.slug;
                const isActive = index === activeIndex;
                return (
                  <li
                    key={city.slug}
                    id={`${listboxId}-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => select(city)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-sm",
                      isActive ? "bg-blue-50 text-blue-700" : "text-ink-body"
                    )}
                  >
                    <span className="truncate">
                      <span className="font-medium">{city.name}</span>
                      <span
                        className={cn(
                          isActive ? "text-blue-500" : "text-ink-soft"
                        )}
                      >
                        {" "}
                        — {city.province}
                      </span>
                    </span>
                    {isSelected && (
                      <Check className="h-4 w-4 flex-shrink-0 text-blue-600" />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </PopoverContent>
      </Popover>

      {/* A guess we made for the user is stated out loud. Pre-filling silently
          would put a city they never chose on their public profile. */}
      {usedGeoDefault && selected && (
        <p className="mt-2 text-sm text-ink-soft">
          Kami isi otomatis dari lokasimu. Ganti kalau tidak sesuai.
        </p>
      )}

      {name && <input type="hidden" name={name} value={selected?.slug ?? ""} />}
    </>
  );
}

export default CityCombobox;
