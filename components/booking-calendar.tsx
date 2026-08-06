import { useState, useEffect } from 'react';
import { format, addDays, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { Button } from "@/components/ui/button";
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
    <div className="space-y-4 sm:space-y-6 text-sm sm:text-base">
      <div className="flex justify-between items-center">
        <button onClick={prevWeek} className="p-1 hover:bg-surface-tint rounded-md">
          <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>
        <span className="text-sm sm:text-base font-medium">
          {format(weekStart, 'MMM d')} - {format(endOfWeek(currentDate), 'MMM d')}
        </span>
        <button onClick={nextWeek} className="p-1 hover:bg-surface-tint rounded-md">
          <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>
      </div>

      <div 
        className={cn(
          "grid grid-cols-7 gap-1 sm:gap-2",
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
                  <Button
                    variant={isSelected ? "default" : "ghost"}
                    className={cn(
                      "relative p-1 sm:p-2 h-auto flex flex-col transition-all duration-200",
                      isSelected && "bg-brand text-white hover:bg-brand-hover",
                      !isSelected && isSelectable && hasSchedule && "hover:bg-blue-50 hover:text-blue-600",
                      (!isSelectable || !hasSchedule) && "bg-surface-tint text-ink-faint cursor-not-allowed",
                      !isRequirementsValid && "cursor-not-allowed opacity-50",
                      isToday && !isSelected && "ring-1 ring-blue-200",
                      !hasSchedule && "bg-red-50/50 hover:bg-red-50/70"
                    )}
                    onClick={() => isSelectable ? handleDateClick(day) : null}
                    disabled={!isSelectable || !isRequirementsValid}
                  >
                    <span className="text-[10px] sm:text-xs font-medium">
                      {format(day, 'EEE')}
                    </span>
                    <span className="text-xs sm:text-base font-bold">
                      {format(day, 'd')}
                    </span>
                    {isSelected && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-white" />
                    )}
                    {!hasSchedule && isSelectable && (
                      <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2">
                        <Clock className="w-3 h-3 text-red-400" />
                      </div>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent 
                  side="bottom" 
                  className="bg-surface p-2 text-xs border rounded-lg"
                >
                  {!isSelectable 
                    ? "This date is not available for booking"
                    : !hasSchedule
                    ? "No available schedules for this date"
                    : isSelected
                    ? "Selected for booking"
                    : "Available for booking"
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