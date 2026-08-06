"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Save, Loader2, Clock } from "lucide-react";
import toast from 'react-hot-toast'; // Update this import
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface ScheduleSlot {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

interface DayOff {
  id: string;
  date: string;
}

interface TimeSlot {
  label: string;
  hours: number[];
}

interface AcceptedBooking {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
}

interface ScheduleChange {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

const timeSlots: TimeSlot[] = [
  { label: "Night", hours: [0, 1, 2, 3, 4, 5] },
  { label: "Morning", hours: [6, 7, 8, 9, 10, 11] },
  { label: "Afternoon", hours: [12, 13, 14, 15, 16, 17] },
  { label: "Evening", hours: [18, 19, 20, 21, 22, 23] },
];

// Add new time options array
const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const hour = i.toString().padStart(2, '0');
  return {
    value: `${hour}:00`,
    label: `${hour}:00 ${i < 12 ? 'AM' : 'PM'}`
  };
});

// Add new DayScheduleCard component
function DayScheduleCard({ 
  day,
  date,
  isAvailable,
  startTime,
  endTime,
  onAvailableChange,
  onTimeChange,
  isBooked
}: {
  day: string;
  date: Date;
  isAvailable: boolean;
  startTime: string;
  endTime: string;
  onAvailableChange: (available: boolean) => void;
  onTimeChange: (type: 'start' | 'end', time: string) => void;
  isBooked?: boolean;
}) {
  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center space-x-2">
          <Clock className="h-4 w-4 text-ink-soft" />
          <span className="text-sm text-ink-soft">Date and Time</span>
        </div>
        <Switch
          checked={isAvailable}
          onCheckedChange={onAvailableChange}
          disabled={isBooked}
          className="data-[state=checked]:bg-blue-600"
        />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-ink-soft">Day</Label>
            <div className="flex flex-col space-y-1">
              <div className="h-10 px-3 py-2 rounded-md border border-hairline-input bg-surface">
                {day}
              </div>
              <span className="text-sm text-ink-soft">
                {format(date, 'MMMM d, yyyy')}
              </span>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label className="text-ink-soft">From</Label>
            <Select
              value={startTime}
              onValueChange={(value) => onTimeChange('start', value)}
              disabled={!isAvailable || isBooked}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select time" />
              </SelectTrigger>
              <SelectContent>
                {TIME_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-ink-soft">To</Label>
            <Select
              value={endTime}
              onValueChange={(value) => onTimeChange('end', value)}
              disabled={!isAvailable || isBooked}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select time" />
              </SelectTrigger>
              <SelectContent>
                {TIME_OPTIONS.map((option) => (
                  <SelectItem 
                    key={option.value} 
                    value={option.value}
                    disabled={option.value <= startTime}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StreamerSchedulePage() {
  const [streamerName, setStreamerName] = useState('');
  const [currentWeek, setCurrentWeek] = useState(() => startOfWeek(new Date()));
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([]);
  const [daysOff, setDaysOff] = useState<DayOff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [acceptedBookings, setAcceptedBookings] = useState<AcceptedBooking[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const fetchStreamerData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      const { data, error } = await supabase
        .from('streamers')
        .select('id, first_name, last_name')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setStreamerName(`${data.first_name} ${data.last_name}`);
        return data.id;
      }
    }
    return null;
  }, []);

  const fetchScheduleAndDaysOff = useCallback(async () => {
    setIsLoading(true);
    const supabase = createClient();
    const streamerId = await fetchStreamerData();
    
    if (streamerId) {
      // Get week range for filtering other data
      const weekStart = format(currentWeek, 'yyyy-MM-dd');
      const weekEnd = format(addDays(currentWeek, 6), 'yyyy-MM-dd');

      // Fetch schedule patterns
      const { data: scheduleData, error: scheduleError } = await supabase
        .from('streamer_schedule')
        .select('*')
        .eq('streamer_id', streamerId);

      if (scheduleError) {
        toast.error("Error fetching schedule: " + scheduleError.message);
      } else if (scheduleData) {
        setSchedule(scheduleData.map(slot => ({
          ...slot,
          startTime: slot.start_time,
          endTime: slot.end_time,
          dayOfWeek: slot.day_of_week,
          isAvailable: slot.is_available
        })));
      }

      // Fetch days off for specific week
      const { data: daysOffData, error: daysOffError } = await supabase
        .from('streamer_day_offs')
        .select('*')
        .eq('streamer_id', streamerId)
        .gte('date', weekStart)
        .lte('date', weekEnd);

      if (daysOffError) {
        toast.error("Error fetching days off: " + daysOffError.message);
      } else if (daysOffData) {
        setDaysOff(daysOffData);
      }

      // Fetch accepted bookings
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('accepted_bookings')
        .select('*')
        .eq('streamer_id', streamerId)
        .gte('booking_date', weekStart)
        .lte('booking_date', weekEnd);

      if (bookingsError) {
        toast.error("Error fetching accepted bookings: " + bookingsError.message);
      } else if (bookingsData) {
        setAcceptedBookings(bookingsData);
      }
    }
    setIsLoading(false);
  }, [fetchStreamerData, currentWeek]);

  useEffect(() => {
    setSchedule([]); // Reset schedule when week changes
    fetchScheduleAndDaysOff();
  }, [fetchScheduleAndDaysOff, currentWeek]);

  const handleTimeChange = useCallback((dayOfWeek: number, type: 'start' | 'end', time: string) => {
    const updatedSchedule = [...schedule];
    let daySchedule = updatedSchedule.find(s => s.dayOfWeek === dayOfWeek);
    
    // If no schedule exists for this day, create one
    if (!daySchedule) {
      daySchedule = {
        id: `temp-${Date.now()}`,
        dayOfWeek,
        startTime: '09:00:00',
        endTime: '17:00:00',
        isAvailable: true
      };
      updatedSchedule.push(daySchedule);
    }

    // Update the time
    if (type === 'start') {
      daySchedule.startTime = `${time}:00`;
      // If end time is earlier than start time, adjust it
      if (daySchedule.endTime <= daySchedule.startTime) {
        const [hour] = time.split(':').map(Number);
        daySchedule.endTime = `${(hour + 1).toString().padStart(2, '0')}:00:00`;
      }
    } else {
      daySchedule.endTime = `${time}:00`;
    }

    setSchedule(updatedSchedule);
    setHasChanges(true);
  }, [schedule]);

  const handleAvailabilityChange = useCallback(async (dayOfWeek: number, isAvailable: boolean) => {
    const currentDate = addDays(currentWeek, dayOfWeek);
    const formattedDate = format(currentDate, 'yyyy-MM-dd');
    
    // Check if the day has any bookings
    const dayBookings = acceptedBookings.filter(b => b.booking_date === formattedDate);
    if (dayBookings.length > 0 && !isAvailable) {
      toast.error("Cannot mark day as unavailable when there are active bookings");
      return;
    }

    const updatedSchedule = [...schedule];
    const existingSlot = updatedSchedule.find(s => s.dayOfWeek === dayOfWeek);
    
    if (existingSlot) {
      existingSlot.isAvailable = isAvailable;
    } else {
      updatedSchedule.push({
        id: `temp-${Date.now()}`,
        dayOfWeek,
        startTime: '09:00:00',
        endTime: '17:00:00',
        isAvailable
      });
    }
    
    setSchedule(updatedSchedule);
    setHasChanges(true);
  }, [currentWeek, schedule, acceptedBookings]);

  const saveSchedule = async () => {
    setIsSaving(true);
    const supabase = createClient();
    const streamerId = await fetchStreamerData();
    
    if (streamerId) {
      try {
        // Apply all changes to database
        const promises = schedule.map(slot => {
          if (slot.id.startsWith('temp-')) {
            return supabase
              .from('streamer_schedule')
              .insert({
                streamer_id: streamerId,
                day_of_week: slot.dayOfWeek,
                start_time: slot.startTime,
                end_time: slot.endTime,
                is_available: slot.isAvailable
              });
          } else {
            // Update all fields, not just is_available
            return supabase
              .from('streamer_schedule')
              .update({
                start_time: slot.startTime,
                end_time: slot.endTime,
                is_available: slot.isAvailable
              })
              .eq('id', slot.id);
          }
        });

        // Wait for all updates to complete
        const results = await Promise.all(promises);
        
        // Check for any errors
        const errors = results.filter(result => result.error);
        if (errors.length > 0) {
          console.error('Errors saving schedule:', errors);
          throw new Error('Failed to save some schedule changes');
        }

        // Update active schedule
        const scheduleData = Array.from({ length: 7 }, (_, day) => ({
          day,
          slots: schedule
            .filter(slot => slot.dayOfWeek === day && slot.isAvailable)
            .map(slot => ({ 
              start: slot.startTime, 
              end: slot.endTime 
            }))
        }));

        const { error: activeScheduleError } = await supabase
          .from('streamer_active_schedules')
          .upsert({ 
            streamer_id: streamerId, 
            schedule: scheduleData 
          }, { onConflict: 'streamer_id' });

        if (activeScheduleError) {
          throw activeScheduleError;
        }

        toast.success('Schedule saved successfully');
        setHasChanges(false);
        
        // Refresh data to ensure we have the latest state
        await fetchScheduleAndDaysOff();
      } catch (error) {
        console.error('Error saving schedule:', error);
        toast.error('Failed to save schedule');
      } finally {
        setIsSaving(false);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-tint flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-6 w-6 animate-spin text-ink-soft" />
          <span className="text-ink-soft">Loading schedule...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-tint">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header with back button */}
        <div className="mb-8 flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/streamer-dashboard')}
            className="hover:bg-transparent -ml-3"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-ink">Settings</h1>
        </div>

        <div className="space-y-6">
          {/* Week Navigation */}
          <div className="flex justify-between items-center">
            <span className="text-lg font-medium text-ink">
              {format(currentWeek, 'MMMM d')} - {format(addDays(currentWeek, 6), 'MMMM d, yyyy')}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous Week
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
              >
                Next Week
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>

          {/* Schedule Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 7 }, (_, dayIndex) => {
              const currentDate = addDays(currentWeek, dayIndex);
              const formattedDate = format(currentDate, 'yyyy-MM-dd');
              const daySchedule = schedule.find(s => s.dayOfWeek === dayIndex);
              const isBooked = acceptedBookings.some(b => b.booking_date === formattedDate);
              
              return (
                <DayScheduleCard
                  key={dayIndex}
                  day={format(currentDate, 'EEEE')}
                  date={currentDate}
                  isAvailable={daySchedule?.isAvailable ?? false}
                  startTime={daySchedule?.startTime?.slice(0, 5) ?? '09:00'}
                  endTime={daySchedule?.endTime?.slice(0, 5) ?? '17:00'}
                  onAvailableChange={(available) => handleAvailabilityChange(dayIndex, available)}
                  onTimeChange={(type, time) => handleTimeChange(dayIndex, type, time)}
                  isBooked={isBooked}
                />
              );
            })}
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-6 border-t border-hairline-input">
            <Button
              onClick={saveSchedule}
              disabled={isSaving || !hasChanges}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}