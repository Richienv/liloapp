import { useState, useEffect } from 'react';
import { format, addDays, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface BookingCalendarProps {
  selectedDate: Date | null;
  onDateSelect: (date: string) => void;
  onTimeSelect: (time: string) => void;
  isDateSelectable?: (date: Date) => boolean;
  isRequirementsValid?: boolean;
  selectedDates?: Map<string, any>;
  hasAvailableSchedule?: (date: Date) => boolean;
}

export function BookingCalendar({ 
  selectedDate, 
  onDateSelect, 
  onTimeSelect,
  isDateSelectable = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date >= today;
  },
  isRequirementsValid = true,
  selectedDates = new Map(),
  hasAvailableSchedule = () => true
}: BookingCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [shakeEffect, setShakeEffect] = useState(false);
  const weekStart = startOfWeek(currentDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const nextWeek = () => setCurrentDate(addDays(currentDate, 7));
  const prevWeek = () => setCurrentDate(subWeeks(currentDate, 1));

  // Handle invalid selection attempt
  const handleInvalidSelection = (message: string) => {
    setShakeEffect(true);
    setTimeout(() => setShakeEffect(false), 820); // Match the CSS animation duration
  };

  const handleDateClick = (date: Date) => {
    if (!isRequirementsValid) {
      handleInvalidSelection("Please complete the requirements first");
      return;
    }

    if (!hasAvailableSchedule(date)) {
      handleInvalidSelection("No available schedules for this date");
      return;
    }

    onDateSelect(date.toISOString());
  };

  return (
    <div className="space-y-4">
      {/*
        The week header is a row that must never wrap: two 32px arrows pinned
        to the ends and the range in the middle, set in the mono face because
        it is a value you compare week to week, not a sentence.
      */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={prevWeek}
          aria-label="Minggu sebelumnya"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-field text-ink-soft transition-colors hover:bg-surface-tint hover:text-ink"
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
          className="grid h-8 w-8 shrink-0 place-items-center rounded-field text-ink-soft transition-colors hover:bg-surface-tint hover:text-ink"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div
        className={cn(
          "grid grid-cols-7 gap-1 sm:gap-1.5",
          shakeEffect && "animate-shake"
        )}
      >
        {weekDays.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const isSelected = selectedDates.has(dateKey);
          const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
          const isSelectable = isDateSelectable(day);
          const hasSchedule = hasAvailableSchedule(day);

          return (
            <TooltipProvider key={day.toString()}>
              <Tooltip>
                <TooltipTrigger asChild>
                  {/*
                    A day cell is a square with a hairline, not a lifted button.
                    The old cell carried four different colours at once — a blue
                    fill, a blue hover, a blue ring for today and a red wash for
                    "full" — which is four accents in a seven-cell row. Selected
                    is the one filled state; "no slots" is stated by muted ink
                    and a small clock rather than by tinting the cell red, and
                    today is a ring in ink.
                  */}
                  <button
                    type="button"
                    className={cn(
                      "relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-field border transition-colors",
                      isSelected
                        ? "border-brand bg-brand text-white hover:bg-brand-hover"
                        : "border-hairline bg-surface text-ink",
                      !isSelected && isSelectable && hasSchedule && "hover:bg-surface-tint",
                      !isSelected && (!isSelectable || !hasSchedule) &&
                        "cursor-not-allowed border-hairline-soft bg-surface-tint text-ink-ghost",
                      !isRequirementsValid && "cursor-not-allowed opacity-50",
                      isToday && !isSelected && "border-ink-faint"
                    )}
                    onClick={() => isSelectable ? handleDateClick(day) : undefined}
                    disabled={!isSelectable || !isRequirementsValid}
                  >
                    <span
                      className={cn(
                        "font-mono text-micro uppercase",
                        isSelected ? "text-white/70" : "text-ink-ghost"
                      )}
                    >
                      {format(day, 'EEE')}
                    </span>
                    <span className="numeric text-ui font-semibold leading-none">
                      {format(day, 'd')}
                    </span>
                    {!hasSchedule && isSelectable && (
                      <Clock className="absolute bottom-1 h-2.5 w-2.5 text-ink-ghost" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="rounded-field border-hairline bg-surface px-2.5 py-1.5 text-mini text-ink-body"
                >
                  {!isSelectable
                    ? "Tanggal ini sudah lewat"
                    : !hasSchedule
                    ? "Host libur atau penuh"
                    : isSelected
                    ? "Tanggal terpilih"
                    : "Ada slot kosong"
                  }
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>

      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
          20%, 40%, 60%, 80% { transform: translateX(2px); }
        }
        
        .animate-shake {
          animation: shake 0.82s cubic-bezier(.36,.07,.19,.97) both;
        }
      `}</style>
    </div>
  );
} 