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

export interface CityComboboxProps {
  /**
   * Canonical city slug. A legacy free-text value (e.g. "DKI Jakarta") is
   * resolved for display so existing data still renders correctly.
   */
  value: string;
  /** Called with the canonical slug — never with free text. */
  onChange: (slug: string) => void;
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

  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const reactId = React.useId();
  const listboxId = `${reactId}-city-listbox`;

  const selected: City | null = React.useMemo(
    () => getCityBySlug(value) ?? resolveCity(value),
    [value]
  );

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
              "flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 text-left text-base",
              "transition-all duration-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
              "disabled:cursor-not-allowed disabled:opacity-50",
              className
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <MapPin className="h-4 w-4 flex-shrink-0 text-gray-400" />
              {selected ? (
                <span className="truncate text-gray-900">
                  {selected.name}
                  <span className="text-gray-500"> — {selected.province}</span>
                </span>
              ) : (
                <span className="truncate text-gray-500">{placeholder}</span>
              )}
            </span>
            <ChevronsUpDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
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
          <div className="flex items-center gap-2 border-b border-gray-100 px-3">
            <Search className="h-4 w-4 flex-shrink-0 text-gray-400" />
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
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>

          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500">
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
                      isActive ? "bg-blue-50 text-blue-700" : "text-gray-700"
                    )}
                  >
                    <span className="truncate">
                      <span className="font-medium">{city.name}</span>
                      <span
                        className={cn(
                          isActive ? "text-blue-500" : "text-gray-500"
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

      {name && <input type="hidden" name={name} value={selected?.slug ?? ""} />}
    </>
  );
}

export default CityCombobox;
