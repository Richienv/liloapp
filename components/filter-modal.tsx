import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyFilters: (filters: FilterState) => void;
  initialFilters?: FilterState;
}

interface FilterState {
  priceRange: [number, number];
  location: string;
  platforms: string[];
  minRating: number;
}

const PLATFORMS = [
  { id: 'shopee', label: 'Shopee' },
  { id: 'tiktok', label: 'TikTok' }
];
const MAX_PRICE = 1000000;

export function FilterModal({ isOpen, onClose, onApplyFilters, initialFilters }: FilterModalProps) {
  const [filters, setFilters] = useState<FilterState>({
    priceRange: [0, MAX_PRICE],
    location: '',
    platforms: [],
    minRating: 0,
    ...initialFilters,
  });

  const handlePriceChange = (type: 'min' | 'max', value: string) => {
    const numValue = value === '' ? 0 : parseInt(value);
    setFilters(prev => ({
      ...prev,
      priceRange: type === 'min' 
        ? [numValue, prev.priceRange[1]]
        : [prev.priceRange[0], numValue]
    }));
  };

  const togglePlatform = (platformId: string) => {
    console.log('Platform toggle requested:', {
      platformId,
      currentPlatforms: filters.platforms
    });

    setFilters(prev => {
      const newPlatforms = prev.platforms.includes(platformId)
        ? prev.platforms.filter(p => p !== platformId)
        : [...prev.platforms, platformId];

      console.log('New platforms after toggle:', newPlatforms);
      return {
        ...prev,
        platforms: newPlatforms
      };
    });
  };

  const isPlatformSelected = (platformId: string) => {
    return filters.platforms.includes(platformId);
  };

  const handleRatingChange = (rating: number) => {
    setFilters(prev => ({ ...prev, minRating: rating }));
  };

  const handleLocationChange = (value: string) => {
    setFilters(prev => ({ ...prev, location: value }));
  };

  const handleApply = () => {
    // Validate price range
    const validatedFilters: FilterState = {
      ...filters,
      priceRange: [
        Math.min(filters.priceRange[0], filters.priceRange[1]),
        Math.max(filters.priceRange[0], filters.priceRange[1])
      ] as [number, number]
    };
    onApplyFilters(validatedFilters);
    onClose();
  };

  const handleClear = () => {
    setFilters({
      priceRange: [0, MAX_PRICE],
      location: '',
      platforms: [],
      minRating: 0,
    });
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.location) count++;
    if (filters.platforms.length > 0) count++;
    if (filters.minRating > 0) count++;
    if (filters.priceRange[0] > 0 || filters.priceRange[1] < MAX_PRICE) count++;
    return count;
  };

  /*
    Every facet used to be blue: a blue close icon, a blue tint on each selected
    chip, a blue hover on each unselected one, blue stars, a blue "clear" link
    and a blue apply button. That is seven accents on one panel, and the only
    one that means "press this to continue" is the last.

    Selection is now stated the way the rest of the redesign states it — a
    darker edge and a quiet fill on the chip you chose — so the single blue
    thing on the screen is the button that closes the modal.

    Section headings pair a mono index with a serif title, matching every other
    section in the product.
  */
  const sections = [
    { index: '01', title: 'Harga per jam' },
    { index: '02', title: 'Kota' },
    { index: '03', title: 'Platform' },
    { index: '04', title: 'Rating' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="gap-0 overflow-hidden rounded-frame border border-hairline bg-surface p-0 sm:max-w-[600px]">
        <div className="flex items-center gap-3 border-b border-hairline px-5 py-4">
          <DialogTitle className="min-w-0 flex-1 font-serif text-title font-semibold text-ink">
            Filter
          </DialogTitle>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="-mr-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-field text-ink-soft transition-colors hover:bg-surface-tint hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(100vh-220px)] overflow-y-auto px-5 py-5 sm:px-6">
          <div className="mb-7">
            <h3 className="mb-3 flex items-baseline gap-2.5">
              <span className="numeric text-mini font-semibold text-ink-ghost">{sections[0].index}</span>
              <span className="font-serif text-lede font-semibold text-ink">{sections[0].title}</span>
            </h3>
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <label className="mb-1.5 block text-meta text-ink-soft">Terendah</label>
                <div className="flex h-11 items-center rounded-field border border-hairline-input bg-surface px-3 focus-within:border-brand">
                  <span className="shrink-0 text-copy text-ink-faint">Rp</span>
                  <input
                    type="number"
                    value={filters.priceRange[0] || ''}
                    onChange={(e) => handlePriceChange('min', e.target.value)}
                    className="numeric ml-1.5 w-full min-w-0 bg-transparent text-ui text-ink outline-none placeholder:text-ink-faint"
                    placeholder="50.000"
                  />
                </div>
              </div>
              <div className="mb-5 h-px w-3 shrink-0 bg-hairline-strong" />
              <div className="min-w-0 flex-1">
                <label className="mb-1.5 block text-meta text-ink-soft">Tertinggi</label>
                <div className="flex h-11 items-center rounded-field border border-hairline-input bg-surface px-3 focus-within:border-brand">
                  <span className="shrink-0 text-copy text-ink-faint">Rp</span>
                  <input
                    type="number"
                    value={filters.priceRange[1] || ''}
                    onChange={(e) => handlePriceChange('max', e.target.value)}
                    className="numeric ml-1.5 w-full min-w-0 bg-transparent text-ui text-ink outline-none placeholder:text-ink-faint"
                    placeholder="1.000.000"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mb-7">
            <h3 className="mb-3 flex items-baseline gap-2.5">
              <span className="numeric text-mini font-semibold text-ink-ghost">{sections[1].index}</span>
              <span className="font-serif text-lede font-semibold text-ink">{sections[1].title}</span>
            </h3>
            <Input
              value={filters.location}
              onChange={(e) => handleLocationChange(e.target.value)}
              placeholder="Tulis nama kota"
              className="h-11 rounded-field border-hairline-input bg-surface text-ui text-ink placeholder:text-ink-faint focus-visible:border-brand focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>

          <div className="mb-7">
            <h3 className="mb-3 flex items-baseline gap-2.5">
              <span className="numeric text-mini font-semibold text-ink-ghost">{sections[2].index}</span>
              <span className="font-serif text-lede font-semibold text-ink">{sections[2].title}</span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((platform) => (
                <button
                  key={platform.id}
                  type="button"
                  aria-pressed={isPlatformSelected(platform.id)}
                  onClick={() => togglePlatform(platform.id)}
                  className={cn(
                    "h-10 rounded-pill border px-5 text-copy font-medium transition-colors",
                    isPlatformSelected(platform.id)
                      ? "border-ink bg-surface-deep text-ink"
                      : "border-hairline-input bg-surface text-ink-muted hover:border-hairline-strong hover:text-ink"
                  )}
                >
                  {platform.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-3 flex items-baseline gap-2.5">
              <span className="numeric text-mini font-semibold text-ink-ghost">{sections[3].index}</span>
              <span className="font-serif text-lede font-semibold text-ink">{sections[3].title}</span>
              <span className="text-meta text-ink-soft">minimal</span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((rating) => {
                const active = filters.minRating === rating;
                return (
                  <button
                    key={rating}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleRatingChange(rating)}
                    className={cn(
                      "flex h-10 items-center gap-1.5 rounded-pill border px-4 text-copy font-medium transition-colors",
                      active
                        ? "border-ink bg-surface-deep text-ink"
                        : "border-hairline-input bg-surface text-ink-muted hover:border-hairline-strong hover:text-ink"
                    )}
                  >
                    <span className="numeric">{rating}</span>
                    <Star
                      className={cn(
                        "h-3.5 w-3.5",
                        active ? "fill-ink text-ink" : "fill-none text-ink-ghost"
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-nowrap items-center gap-3 border-t border-hairline bg-surface-tint px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={handleClear}
            className="min-w-0 shrink text-copy font-medium text-ink-muted underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
          >
            Bersihkan semua filter
          </button>
          <Button
            variant="brand"
            size="action"
            onClick={handleApply}
            className="ml-auto shrink-0"
          >
            Lihat hasil
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 