import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addDays, format, startOfWeek, endOfWeek, isToday, isBefore, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { cn } from "@/lib/utils";

interface AvailabilityFilterProps {
  selectedDate: Date | null;
  setSelectedDate: (date: Date | null) => void;
  className?: string;
}

export function AvailabilityFilter({ selectedDate, setSelectedDate, className }: AvailabilityFilterProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const weekStart = startOfWeek(currentDate);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const nextWeek = () => setCurrentDate(addDays(currentDate, 7));
  const prevWeek = () => setCurrentDate(addDays(currentDate, -7));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Filter tanggal"
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-field border border-hairline-input bg-surface text-ink-soft transition-colors hover:border-hairline-strong hover:text-ink ${className ?? ''}`}
        >
          <Calendar className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto rounded-panel border-hairline bg-surface p-3"
        align="start"
        sideOffset={8}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={prevWeek}
              aria-label="Minggu sebelumnya"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-chip text-ink-soft transition-colors hover:bg-surface-tint hover:text-ink"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="numeric min-w-0 truncate text-copy font-medium text-ink">
              {format(weekStart, 'd MMM')} – {format(endOfWeek(currentDate), 'd MMM')}
            </span>
            <button
              type="button"
              onClick={nextWeek}
              aria-label="Minggu berikutnya"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-chip text-ink-soft transition-colors hover:bg-surface-tint hover:text-ink"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
              const isDisabled = isBefore(day, startOfWeek(new Date()));

              return (
                <button
                  key={day.toString()}
                  type="button"
                  onClick={() => setSelectedDate(day)}
                  disabled={isDisabled}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-field border transition-colors",
                    isSelected
                      ? "border-brand bg-brand text-white"
                      : "border-hairline bg-surface text-ink",
                    !isSelected && !isDisabled && "hover:bg-surface-tint",
                    isDisabled &&
                      "cursor-not-allowed border-hairline-soft bg-surface-tint text-ink-ghost",
                    isToday(day) && !isSelected && "border-ink-faint"
                  )}
                >
                  <span
                    className={cn(
                      "font-mono text-micro uppercase",
                      isSelected ? "text-white/70" : "text-ink-ghost"
                    )}
                  >
                    {format(day, 'EEE')}
                  </span>
                  <span className="numeric text-copy font-semibold leading-none">
                    {format(day, 'd')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
