import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from "@/components/ui/dialog";
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

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-[600px] p-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-blue-50 transition-colors"
          >
            <X className="h-4 w-4 text-blue-600" />
          </button>
          <h2 className="text-base font-semibold">Filter</h2>
          <div className="w-8" />
        </div>

        {/* Content */}
        <div className="px-6 py-6 max-h-[calc(100vh-180px)] overflow-y-auto">
          {/* Price Range */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4">Price Range</h3>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm text-ink-muted mb-2">minimum price</label>
                <div className="flex items-center h-10 px-3 border rounded-lg">
                  <span className="text-ink-soft">Rp</span>
                  <input
                    type="number"
                    value={filters.priceRange[0] || ''}
                    onChange={(e) => handlePriceChange('min', e.target.value)}
                    className="w-full ml-1 focus:outline-none"
                    placeholder="50,000"
                  />
                </div>
              </div>
              <div className="flex items-center pt-8">
                <div className="w-4 h-[1px] bg-surface-deep" />
              </div>
              <div className="flex-1">
                <label className="block text-sm text-ink-muted mb-2">maximum price</label>
                <div className="flex items-center h-10 px-3 border rounded-lg">
                  <span className="text-ink-soft">Rp</span>
                  <input
                    type="number"
                    value={filters.priceRange[1] || ''}
                    onChange={(e) => handlePriceChange('max', e.target.value)}
                    className="w-full ml-1 focus:outline-none"
                    placeholder="1,000,000"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4">Location</h3>
            <Input
              value={filters.location}
              onChange={(e) => handleLocationChange(e.target.value)}
              placeholder="Enter city name"
              className="h-10"
            />
          </div>

          {/* Platforms */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4">Platform</h3>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((platform) => (
                <button
                  key={platform.id}
                  onClick={() => togglePlatform(platform.id)}
                  className={cn(
                    "h-10 px-6 rounded-lg border text-sm font-medium transition-all duration-200",
                    isPlatformSelected(platform.id)
                      ? "border-blue-600 bg-blue-50 text-blue-600"
                      : "border-hairline-input hover:bg-blue-50 hover:border-blue-600 hover:text-blue-600"
                  )}
                >
                  {platform.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rating */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Minimum Rating</h3>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  onClick={() => handleRatingChange(rating)}
                  className={cn(
                    "flex items-center gap-1.5 h-10 px-4 rounded-lg border text-sm font-medium transition-all duration-200",
                    filters.minRating === rating
                      ? "border-blue-600 bg-blue-50 text-blue-600"
                      : "border-hairline-input hover:bg-blue-50 hover:border-blue-600 hover:text-blue-600"
                  )}
                >
                  {rating} <Star className={cn("w-4 h-4", filters.minRating === rating ? "fill-blue-600" : "fill-none stroke-blue-600")} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t bg-surface">
          <Button
            variant="link"
            onClick={handleClear}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 underline decoration-1 underline-offset-4 hover:decoration-2"
          >
            Clear all
          </Button>
          <Button
            onClick={handleApply}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium h-10 px-6 rounded-lg"
          >
            Show results
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 