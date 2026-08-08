"use client";

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { format, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import toast from 'react-hot-toast'; // Update this import
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

interface AcceptedBooking {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
}

/**
 * 24-hour labels, because that is how Indonesians read a live schedule.
 *
 * The label is display only — `value` is what the comparison in the "Selesai"
 * select and every write to `streamer_schedule` uses, and it is untouched. The
 * old label appended AM/PM, which rendered midnight as "00:00 AM".
 */
const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const hour = i.toString().padStart(2, '0');
  return {
    value: `${hour}:00`,
    label: `${hour}:00`,
  };
});

/**
 * One day, one grid cell.
 *
 * `shadow-cell` rather than a border: seven bordered cards in a three-column
 * grid double-draw every internal seam into a 2px line. A half-pixel spread
 * ring overlaps instead of stacking, so the whole week reads as one ruled
 * sheet inside a single frame.
 */
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
    <div className="p-4 shadow-cell sm:p-5">
      {/* Day, date and the on/off switch on one line that never wraps. */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-ui font-medium text-ink">{day}</p>
          <p className="numeric truncate text-meta text-ink-soft">
            {format(date, 'd MMM yyyy', { locale: idLocale })}
          </p>
        </div>
        <Switch
          checked={isAvailable}
          onCheckedChange={onAvailableChange}
          disabled={isBooked}
          aria-label={`Siap live pada ${day}`}
          className="shrink-0 data-[state=checked]:bg-ink data-[state=unchecked]:bg-surface-deep"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="min-w-0 space-y-1.5">
          <span className="block font-mono text-tiny uppercase text-ink-ghost">Mulai</span>
          <Select
            value={startTime}
            onValueChange={(value) => onTimeChange('start', value)}
            disabled={!isAvailable || isBooked}
          >
            <SelectTrigger
              aria-label={`Jam mulai ${day}`}
              className="numeric h-10 rounded-field border-hairline-input bg-surface px-3 text-copy text-ink"
            >
              <SelectValue placeholder="Pilih jam" />
            </SelectTrigger>
            <SelectContent>
              {TIME_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} className="numeric">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0 space-y-1.5">
          <span className="block font-mono text-tiny uppercase text-ink-ghost">Selesai</span>
          <Select
            value={endTime}
            onValueChange={(value) => onTimeChange('end', value)}
            disabled={!isAvailable || isBooked}
          >
            <SelectTrigger
              aria-label={`Jam selesai ${day}`}
              className="numeric h-10 rounded-field border-hairline-input bg-surface px-3 text-copy text-ink"
            >
              <SelectValue placeholder="Pilih jam" />
            </SelectTrigger>
            <SelectContent>
              {TIME_OPTIONS.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  disabled={option.value <= startTime}
                  className="numeric"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Says out loud why the controls above are frozen. Derived from the
          accepted bookings the page already loads — nothing new is fetched. */}
      {isBooked && (
        <p className="mt-3 text-mini text-caution">
          Sudah ada booking di hari ini, jadi jamnya terkunci.
        </p>
      )}
    </div>
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
        toast.error("Gagal memuat jadwal: " + scheduleError.message);
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
        toast.error("Gagal memuat hari libur: " + daysOffError.message);
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
        toast.error("Gagal memuat booking yang sudah diterima: " + bookingsError.message);
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
      toast.error("Hari ini tidak bisa dimatikan karena sudah ada booking aktif");
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

        toast.success('Jadwal berhasil disimpan');
        setHasChanges(false);

        // Refresh data to ensure we have the latest state
        await fetchScheduleAndDaysOff();
      } catch (error) {
        console.error('Error saving schedule:', error);
        toast.error('Gagal menyimpan jadwal');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const weekRange = `${format(currentWeek, 'd MMM', { locale: idLocale })} – ${format(
    addDays(currentWeek, 6),
    'd MMM yyyy',
    { locale: idLocale },
  )}`;

  return (
    <div className="min-h-screen bg-canvas">
      <main className="mx-auto w-full max-w-[1000px] px-4 py-8 sm:px-6 sm:py-12">
        <header>
          <button
            type="button"
            onClick={() => router.push('/streamer-dashboard')}
            className="-ml-1 inline-flex items-center gap-1 text-meta text-ink-soft transition-colors hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" />
            Dashboard
          </button>
          <h1 className="mt-3 font-serif text-section font-semibold text-ink sm:text-display">
            Atur jadwal live
          </h1>
          <p className="mt-2 text-lede text-ink-soft">
            Brand hanya bisa memesan di hari yang kamu nyalakan.
          </p>
        </header>

        <section className="mt-8 overflow-hidden rounded-frame border border-hairline bg-surface">
          {/* Mono index, serif title, then the week the grid below is showing —
              the nav lives on the same line so the range and the way to change
              it are never separated. */}
          <div className="flex min-w-0 items-center gap-3 border-b border-hairline-soft px-4 py-4 sm:px-5">
            <span className="numeric shrink-0 text-mini font-semibold text-ink-ghost">01</span>
            <h2 className="shrink-0 font-serif text-title font-semibold text-ink">
              Hari kamu siap live
            </h2>
            <p className="numeric min-w-0 flex-1 truncate text-meta text-ink-soft">
              {weekRange}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="quiet"
                size="sm"
                aria-label="Minggu sebelumnya"
                onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
                className="h-8 w-8 px-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="quiet"
                size="sm"
                aria-label="Minggu berikutnya"
                onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
                className="h-8 w-8 px-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="space-y-4 p-4 shadow-cell sm:p-5">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-3.5 w-20 animate-pulse rounded-chip bg-surface-deep" />
                      <div className="h-3 w-24 animate-pulse rounded-chip bg-surface-tint" />
                    </div>
                    <div className="h-6 w-11 shrink-0 animate-pulse rounded-full bg-surface-tint" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="h-10 animate-pulse rounded-field bg-surface-tint" />
                    <div className="h-10 animate-pulse rounded-field bg-surface-tint" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 7 }, (_, dayIndex) => {
                const currentDate = addDays(currentWeek, dayIndex);
                const formattedDate = format(currentDate, 'yyyy-MM-dd');
                const daySchedule = schedule.find(s => s.dayOfWeek === dayIndex);
                const isBooked = acceptedBookings.some(b => b.booking_date === formattedDate);

                return (
                  <DayScheduleCard
                    key={dayIndex}
                    day={format(currentDate, 'EEEE', { locale: idLocale })}
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
          )}

          <div className="flex min-w-0 items-center gap-4 border-t border-hairline-soft px-4 py-4 sm:px-5">
            <p className="min-w-0 flex-1 text-meta text-ink-soft">
              Perubahan berlaku untuk booking baru. Sesi yang sudah dipesan tidak berubah.
            </p>
            <div className="shrink-0">
              <Button
                variant="brand"
                size="action-compact"
                onClick={saveSchedule}
                disabled={isSaving || !hasChanges}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Menyimpan…
                  </>
                ) : (
                  "Simpan perubahan"
                )}
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
