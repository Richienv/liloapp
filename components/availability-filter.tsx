import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addDays, format, startOfWeek, endOfWeek, isSameMonth, isToday, isBefore, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

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
        <button className={`flex items-center justify-center w-[40px] h-[40px] rounded-lg 
          transition-all duration-200 ${className}`}
        >
          <Calendar size={16} className="text-white" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start" sideOffset={8}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button onClick={prevWeek} className="p-1 hover:bg-surface-tint rounded-md">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium">
              {format(weekStart, 'MMM d')} - {format(endOfWeek(currentDate), 'MMM d')}
            </span>
            <button onClick={nextWeek} className="p-1 hover:bg-surface-tint rounded-md">
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
                  onClick={() => setSelectedDate(day)}
                  disabled={isDisabled}
                  className={`
                    aspect-square p-1 text-center flex flex-col items-center justify-center
                    rounded-md text-sm
                    ${isDisabled ? 'text-ink-ghost cursor-not-allowed' : 'hover:bg-surface-tint'}
                    ${isSelected ? 'bg-red-500 text-white hover:bg-red-600' : ''}
                    ${isToday(day) ? 'font-bold' : ''}
                  `}
                >
                  <span className="text-[10px]">{format(day, 'EEE')}</span>
                  <span className="text-xs font-semibold">{format(day, 'd')}</span>
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
