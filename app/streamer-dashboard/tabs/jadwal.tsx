"use client";

/**
 * The "Jadwal" tab of the host dashboard — sections 3 to 6 of REFERENCE.md.
 *
 *   3  Ringkasan minggu ini    money: what the last seven days actually earned
 *   4  Minggu ini sekilas      load: which days of THIS week are taken
 *   5  Sesi yang perlu kamu urus
 *   6  Sudah selesai
 *
 * Sections 3 and 4 are both "the week" and are deliberately not the same view.
 * 3 is a rolling seven days looking BACKWARD and it is denominated in rupiah —
 * it answers "what did I earn". 4 is the calendar week Monday to Sunday, it
 * carries no money at all, and it looks FORWARD as well as back — it answers
 * "which days are booked and which are still free", which is the question a
 * host opens a schedule with on a Monday. Neither one repeats a number the
 * other one shows.
 *
 * This component owns no query and no mutation. Every figure is derived from
 * the `bookings` array that `page.tsx` already loads from Supabase, and the one
 * action control per row is rendered by the caller (`renderSessionAction`), so
 * accepting a booking, starting a stream and ending one all still happen in the
 * code that already owned them.
 *
 * Money rule, the one this dashboard has got wrong before: `bookings.price` is
 * what the BRAND paid — base x 1.3 platform fee x 1.11 tax = x 1.443. What the
 * host receives is the base underneath it. Every rupiah here goes through
 * `baseFromTotal`, the same division `salda_host_earnings()` makes in the
 * database. Quoting `price` raw would over-report a host's earnings by ~44%.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  addDays,
  endOfWeek,
  isSameDay,
  isToday,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

import { baseFromTotal } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * The subset of `page.tsx`'s `Booking` this tab reads. Structural, so the
 * caller can pass its own richer row without a cast.
 */
export interface JadwalBooking {
  id: number;
  client_first_name: string;
  client_last_name: string;
  start_time: string;
  end_time: string;
  platform: string;
  status: string;
  price: number;
}

export interface JadwalTabProps {
  /**
   * Every booking the host has in the statuses the dashboard loads
   * (pending / accepted / live / completed). Sections 5 and 6 split it; 3 and 4
   * aggregate it.
   */
  bookings: JadwalBooking[];

  /**
   * The real action control for a session row — "Terima", "Mulai live",
   * "Akhiri sesi", "Lihat detail". Supplied by `page.tsx` because that is where
   * the mutations and their modals live. Omitted, the rows render without a
   * button rather than with a decorative one that does nothing.
   */
  renderSessionAction?: (booking: JadwalBooking) => ReactNode;

  /** Footer shortcut: "Atur hari kosong" -> Profil tab. */
  onGoToProfile?: () => void;
  /** Footer shortcut: "Buka sesi hari ini" -> Beranda, where the live card is. */
  onGoToHome?: () => void;
}

/** How many finished sessions section 6 lists before it stops. */
const COMPLETED_VISIBLE = 8;

function rupiah(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}

/** Axis ticks: 800000 -> "800rb", 1200000 -> "1,2jt". */
function shortRupiah(value: number): string {
  if (value <= 0) return "0";
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("id-ID", {
      maximumFractionDigits: 1,
    })}jt`;
  }
  return `${Math.round(value / 1000)}rb`;
}

function formatHours(hours: number): string {
  return hours.toLocaleString("id-ID", { maximumFractionDigits: 1 });
}

function brandName(booking: JadwalBooking): string {
  const name = `${booking.client_first_name ?? ""} ${booking.client_last_name ?? ""}`.trim();
  return name || "Brand";
}

/** "Hari ini · 15:00–19:00" / "Sabtu, 8 Agustus · 19:00–23:00". */
function whenLabel(booking: JadwalBooking): string {
  const start = new Date(booking.start_time);
  const end = new Date(booking.end_time);
  const day = isToday(start)
    ? "Hari ini"
    : format(start, "EEEE, d MMMM", { locale: idLocale });
  return `${day} · ${format(start, "HH:mm")}–${format(end, "HH:mm")}`;
}

function durationHours(booking: JadwalBooking): number {
  const ms =
    new Date(booking.end_time).getTime() - new Date(booking.start_time).getTime();
  return ms > 0 ? ms / 3_600_000 : 0;
}

/* ── section chrome ─────────────────────────────────────────────────────── */

/**
 * The design's numbered heading: a 22px disc, a 15px title, a quiet note.
 * The disc is ink when the section wants something from the host and a grey
 * tint when it is only there to be read.
 */
function SectionHead({
  index,
  title,
  note,
  actionable = false,
}: {
  index: number;
  title: string;
  note?: string;
  actionable?: boolean;
}) {
  return (
    <div className="mb-3 flex items-baseline gap-[10px]">
      <span
        className={cn(
          "flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-none",
          actionable ? "bg-ink text-white" : "bg-hairline-soft text-ink-faint",
        )}
      >
        {index}
      </span>
      <h2 className="m-0 text-lede font-semibold text-ink">{title}</h2>
      {note && <span className="text-[13px] text-ink-faint">{note}</span>}
    </div>
  );
}

/* ── 3 · Ringkasan minggu ini ───────────────────────────────────────────── */

/**
 * Earnings for the rolling last seven days, host share only.
 *
 * On the chart columns: `h-grow` starts at `scaleY(0)`. The column carries its
 * real height as an inline `height` and the animation is declared with NO
 * fill-mode and NO delay, so the only state the browser can ever hold is the
 * natural full height — the animation replays it, it does not create it. A
 * staggered `... both` per column, which is what the mockup does, holds every
 * column at zero through its delay, and any environment that drops the
 * animation (reduced motion, a stylesheet that fails to load) leaves the whole
 * chart at zero height. A chart that needs an animation to have height is a
 * chart that renders as nothing.
 */
function WeekEarnings({ bookings }: { bookings: JadwalBooking[] }) {
  const [hoverDay, setHoverDay] = useState(-1);

  const { days, weekTotal, previousTotal, peak, best } = useMemo(() => {
    const today = startOfDay(new Date());

    // Same rule the dashboard has always used for "earned": a session counts
    // once it is live or completed. Nothing about what is counted changes here.
    const earnedOn = (day: Date) =>
      bookings
        .filter((booking) => {
          const status = booking.status.toLowerCase();
          if (status !== "completed" && status !== "live") return false;
          return isSameDay(new Date(booking.start_time), day);
        })
        .reduce((sum, booking) => sum + baseFromTotal(booking.price), 0);

    const days = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(today, i - 6);
      return { day, total: earnedOn(day) };
    });

    // The seven days before those seven, for an honest comparison figure.
    const previousTotal = Array.from({ length: 7 }, (_, i) =>
      earnedOn(addDays(today, i - 13)),
    ).reduce((sum, value) => sum + value, 0);

    const weekTotal = days.reduce((sum, d) => sum + d.total, 0);
    const peak = Math.max(...days.map((d) => d.total), 0);
    const best = days.reduce((top, d) => (d.total > top.total ? d : top), days[0]);

    return { days, weekTotal, previousTotal, peak, best };
  }, [bookings]);

  const deltaPercent =
    previousTotal > 0 ? Math.round(((weekTotal - previousTotal) / previousTotal) * 100) : null;

  return (
    <div className="rounded-frame border border-hairline bg-surface px-6 py-[22px]">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="m-0 mb-1.5 text-[13px] text-ink-soft">Pendapatan 7 hari terakhir</p>
          <p className="numeric m-0 text-[30px] font-semibold leading-none tracking-[-.02em] text-ink">
            {rupiah(weekTotal)}
          </p>
        </div>
        {deltaPercent !== null && (
          <span
            className={cn(
              "rounded-[6px] border px-[9px] py-[5px] text-meta font-semibold",
              deltaPercent >= 0
                ? "border-positive-line bg-positive-tint text-positive"
                : "border-caution-line bg-caution-tint text-caution",
            )}
          >
            {deltaPercent >= 0 ? "+" : ""}
            {deltaPercent.toLocaleString("id-ID")}% dari minggu lalu
          </span>
        )}
      </div>

      {peak === 0 ? (
        <p className="m-0 rounded-panel border border-dashed border-hairline-input px-5 py-9 text-center text-meta text-ink-soft">
          Belum ada sesi selesai dalam 7 hari terakhir. Grafik muncul setelah sesi pertama kamu
          ditutup.
        </p>
      ) : (
        <>
          <div className="flex gap-3">
            <div className="flex h-[132px] w-[52px] flex-shrink-0 flex-col items-end justify-between pb-px">
              {[peak, (peak * 2) / 3, peak / 3, 0].map((value, i) => (
                <span key={i} className="numeric text-[10px] leading-none text-ink-ghost">
                  {shortRupiah(value)}
                </span>
              ))}
            </div>

            <div className="min-w-0 flex-1">
              <div className="relative h-[132px]">
                <div className="absolute inset-0 flex flex-col justify-between">
                  <span className="h-px bg-hairline-soft" />
                  <span className="h-px bg-hairline-soft" />
                  <span className="h-px bg-hairline-soft" />
                  <span className="h-px bg-hairline" />
                </div>
                <div
                  className="absolute inset-0 flex items-end"
                  style={{ gap: "clamp(6px,1.4vw,14px)" }}
                >
                  {days.map(({ day, total }, i) => {
                    const hovered = hoverDay === i;
                    const isPeak = total > 0 && total === peak;
                    return (
                      <div
                        key={day.toISOString()}
                        onMouseEnter={() => setHoverDay(i)}
                        onMouseLeave={() => setHoverDay(-1)}
                        className="relative flex h-full flex-1 flex-col justify-end"
                      >
                        {hovered && total > 0 && (
                          <span className="numeric absolute bottom-full left-1/2 z-[2] mb-2 -translate-x-1/2 whitespace-nowrap rounded-[5px] bg-ink px-2 py-1 text-[10.5px] text-white">
                            {rupiah(total)}
                          </span>
                        )}
                        <div
                          title={`${format(day, "EEEE d MMMM", { locale: idLocale })}: ${rupiah(total)}`}
                          className={cn(
                            "w-full rounded-t-[4px] transition-colors duration-200",
                            hovered && total > 0
                              ? "bg-brand-hover"
                              : isPeak
                                ? "bg-brand"
                                : "bg-hairline",
                          )}
                          style={{
                            // Real height first. `h-grow` only replays it.
                            height: `${Math.max((total / peak) * 100, 3)}%`,
                            transformOrigin: "bottom",
                            animation: "h-grow .7s cubic-bezier(.16,1,.3,1)",
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-[9px] flex" style={{ gap: "clamp(6px,1.4vw,14px)" }}>
                {days.map(({ day, total }, i) => (
                  <span
                    key={day.toISOString()}
                    className={cn(
                      "flex-1 text-center text-[11px]",
                      total > 0 && (total === peak || hoverDay === i)
                        ? "font-semibold text-ink"
                        : "font-medium text-ink-ghost",
                    )}
                  >
                    {format(day, "EEE", { locale: idLocale })}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-[18px] border-t border-hairline-soft pt-3.5">
            <span className="flex items-center gap-[7px] text-mini text-ink-soft">
              <span className="h-[9px] w-[9px] rounded-chip bg-brand" />
              Hari terbaik · {format(best.day, "EEEE", { locale: idLocale })} {rupiah(best.total)}
            </span>
            <span className="flex items-center gap-[7px] text-mini text-ink-soft">
              <span className="h-[9px] w-[9px] rounded-chip bg-hairline" />
              Rata-rata {rupiah(weekTotal / 7)} / hari
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/* ── 4 · Minggu ini sekilas ─────────────────────────────────────────────── */

/**
 * The calendar week, Monday to Sunday, as booked hours per day.
 *
 * `weekStartsOn: 1`. date-fns defaults to Sunday, which would push a Sunday
 * session into "next week" for every host in Indonesia.
 *
 * No rupiah anywhere in this section on purpose — section 3 above is the money
 * view of the week, this is the load view.
 */
function WeekGlance({ bookings }: { bookings: JadwalBooking[] }) {
  const { days, sessionCount, totalHours } = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });

    const scheduled = bookings.filter((booking) =>
      ["pending", "accepted", "live", "completed"].includes(booking.status.toLowerCase()),
    );

    const days = Array.from({ length: 7 }, (_, offset) => {
      const day = addDays(start, offset);
      const sessions = scheduled.filter((booking) =>
        isSameDay(new Date(booking.start_time), day),
      );
      return {
        day,
        count: sessions.length,
        hours: sessions.reduce((sum, booking) => sum + durationHours(booking), 0),
      };
    });

    return {
      days,
      sessionCount: days.reduce((sum, d) => sum + d.count, 0),
      totalHours: days.reduce((sum, d) => sum + d.hours, 0),
    };
  }, [bookings]);

  const peakHours = Math.max(...days.map((d) => d.hours), 0);

  const summary =
    sessionCount === 0
      ? "Belum ada sesi terjadwal"
      : `${sessionCount} sesi · ${formatHours(totalHours)} jam siaran`;

  const rangeLabel = `${format(days[0].day, "d MMM", { locale: idLocale })} – ${format(
    endOfWeek(days[0].day, { weekStartsOn: 1 }),
    "d MMM",
    { locale: idLocale },
  )}`;

  return (
    <>
      <SectionHead index={4} title="Minggu ini sekilas" note={`${summary} · ${rangeLabel}`} actionable />
      <div className="overflow-hidden rounded-frame border border-hairline bg-surface">
        <div className="grid grid-cols-7">
          {days.map(({ day, hours }) => {
            const today = isToday(day);
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "border-r border-hairline-soft px-[10px] pb-[18px] pt-4 text-center last:border-r-0",
                  today ? "bg-brand-wash" : "bg-surface",
                )}
              >
                <p
                  className={cn(
                    "m-0 mb-0.5 text-[11.5px] font-semibold",
                    today ? "text-brand" : "text-ink",
                  )}
                >
                  {format(day, "EEE", { locale: idLocale })}
                </p>
                <p className="numeric m-0 mb-3.5 text-[10.5px] text-ink-ghost">
                  {format(day, "d")}
                </p>
                <div className="flex h-[46px] flex-col justify-end">
                  <span
                    className={cn(
                      "block rounded-[3px]",
                      hours > 0 ? "bg-brand" : "bg-hairline-soft",
                    )}
                    style={{
                      height:
                        hours > 0 && peakHours > 0
                          ? `${Math.max(Math.round((hours / peakHours) * 46), 8)}px`
                          : "4px",
                    }}
                  />
                </div>
                <p
                  className={cn(
                    "m-0 mt-3 text-[11px]",
                    hours > 0 ? "text-ink-body" : "text-ink-ghost",
                  )}
                >
                  {hours > 0 ? `${formatHours(hours)} jam` : "Kosong"}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* ── session status ─────────────────────────────────────────────────────── */

type StatusKey = "live" | "ready" | "waiting" | "done";

/**
 * The design's STATUS_MAP. Bordered tint plus coloured text — never a
 * saturated filled pill.
 */
const STATUS_MAP: Record<StatusKey, { label: string; className: string; pulse: boolean }> = {
  live: {
    label: "Sedang live",
    className: "border-positive-line bg-positive-tint text-positive",
    pulse: true,
  },
  ready: {
    label: "Siap mulai",
    className: "border-brand-line bg-brand-tint text-brand-deep",
    pulse: false,
  },
  waiting: {
    label: "Menunggu jawaban",
    className: "border-caution-line bg-caution-tint text-caution-strong",
    pulse: false,
  },
  done: {
    label: "Selesai",
    className: "border-hairline bg-surface-sunken text-ink-muted",
    pulse: false,
  },
};

function statusOf(booking: JadwalBooking, now: Date): StatusKey {
  const status = booking.status.toLowerCase();
  if (status === "completed") return "done";
  if (status === "pending" || status === "payment_pending") return "waiting";
  if (status === "live") return "live";
  // Accepted and inside its own window: it is happening right now.
  const start = new Date(booking.start_time).getTime();
  const end = new Date(booking.end_time).getTime();
  if (start <= now.getTime() && end >= now.getTime()) return "live";
  return "ready";
}

function StatusChip({ status }: { status: StatusKey }) {
  const tone = STATUS_MAP[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] border px-2 py-[5px] text-mini font-semibold",
        tone.className,
      )}
    >
      {tone.pulse && (
        <span
          className="h-[6px] w-[6px] flex-shrink-0 rounded-full bg-positive"
          style={{ animation: "h-live 1.6s ease-in-out infinite" }}
        />
      )}
      {tone.label}
    </span>
  );
}

/**
 * The brand tile. The design shows a product photo; nothing this page loads
 * carries one, so it is an initial on a quiet fill rather than a stock face.
 */
function BrandTile({ name, size }: { name: string; size: "lg" | "sm" }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex flex-shrink-0 items-center justify-center bg-surface-tint font-semibold text-ink-faint",
        size === "lg"
          ? "h-[52px] w-[44px] rounded-[8px] text-ui"
          : "h-[42px] w-[36px] rounded-[7px] text-copy",
      )}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

/* ── 5 · Sesi yang perlu kamu urus ──────────────────────────────────────── */

function OpenSessions({
  bookings,
  now,
  renderSessionAction,
  onGoToProfile,
  onGoToHome,
}: {
  bookings: JadwalBooking[];
  now: Date;
  renderSessionAction?: (booking: JadwalBooking) => ReactNode;
  onGoToProfile?: () => void;
  onGoToHome?: () => void;
}) {
  const open = useMemo(
    () =>
      bookings
        .filter((booking) => booking.status.toLowerCase() !== "completed")
        .sort(
          (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
        ),
    [bookings],
  );

  return (
    <>
      <SectionHead
        index={5}
        title="Sesi yang perlu kamu urus"
        note={open.length > 0 ? `${open.length} sesi` : "Kosong"}
        actionable={open.length > 0}
      />
      <div className="overflow-hidden rounded-frame border border-hairline bg-surface">
        {open.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="m-0 mb-1.5 text-[14.5px] font-semibold text-ink">
              Tidak ada sesi yang perlu kamu urus
            </p>
            <p className="m-0 text-[13px] text-ink-soft">
              Semua sesi kamu sudah beres. Kerja bagus.
            </p>
          </div>
        ) : (
          open.map((booking) => {
            const name = brandName(booking);
            return (
              <div
                key={booking.id}
                className="flex items-center gap-4 border-t border-hairline-soft px-[22px] py-[18px] first:border-t-0"
              >
                <BrandTile name={name} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="m-0 mb-[3px] truncate text-[14.5px] font-semibold text-ink">
                    {name}
                  </p>
                  <p className="m-0 truncate text-meta text-ink-soft">
                    {whenLabel(booking)}
                    {booking.platform ? ` · ${booking.platform}` : ""}
                  </p>
                </div>
                <div className="ml-auto flex flex-shrink-0 items-center gap-4">
                  <div className="flex w-[150px] justify-end">
                    <StatusChip status={statusOf(booking, now)} />
                  </div>
                  <p className="numeric m-0 w-[104px] whitespace-nowrap text-right text-ui font-semibold text-ink">
                    {rupiah(baseFromTotal(booking.price))}
                  </p>
                  {renderSessionAction && (
                    <div className="flex w-[132px] justify-end">
                      {renderSessionAction(booking)}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        <div className="flex flex-wrap items-center gap-4 border-t border-hairline-soft bg-surface-raised px-[22px] py-4">
          <p className="m-0 min-w-0 flex-1 basis-[200px] text-meta text-ink-soft">
            Sesi yang sudah dijawab tidak perlu kamu buka lagi.
          </p>
          {(onGoToProfile || onGoToHome) && (
            <div className="ml-auto flex flex-shrink-0 gap-3">
              {onGoToProfile && (
                <button
                  type="button"
                  onClick={onGoToProfile}
                  className="h-[46px] w-[168px] rounded-lg border border-hairline-input bg-surface text-copy font-medium text-ink-muted transition-colors hover:border-ink hover:text-ink"
                >
                  Atur hari kosong
                </button>
              )}
              {onGoToHome && (
                <button
                  type="button"
                  onClick={onGoToHome}
                  className="h-[46px] w-[220px] rounded-lg bg-ink text-ui font-semibold text-white transition-colors hover:bg-brand"
                >
                  Buka sesi hari ini
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ── 6 · Sudah selesai ──────────────────────────────────────────────────── */

function CompletedSessions({
  bookings,
  renderSessionAction,
}: {
  bookings: JadwalBooking[];
  renderSessionAction?: (booking: JadwalBooking) => ReactNode;
}) {
  const completed = useMemo(
    () =>
      bookings
        .filter((booking) => booking.status.toLowerCase() === "completed")
        .sort(
          (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime(),
        ),
    [bookings],
  );

  const visible = completed.slice(0, COMPLETED_VISIBLE);

  return (
    <>
      <SectionHead index={6} title="Sudah selesai" note="Arsip" />
      <div className="overflow-hidden rounded-frame border border-hairline bg-surface">
        {completed.length === 0 ? (
          <p className="m-0 px-6 py-10 text-center text-[13px] text-ink-soft">
            Belum ada sesi yang selesai.
          </p>
        ) : (
          <>
            {visible.map((booking) => {
              const name = brandName(booking);
              return (
                <div
                  key={booking.id}
                  className="flex items-center gap-4 border-t border-hairline-soft px-[22px] py-[15px] first:border-t-0"
                >
                  <BrandTile name={name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="m-0 mb-[3px] truncate text-copy font-semibold text-ink">
                      {name}
                    </p>
                    <p className="m-0 truncate text-meta text-ink-faint">
                      {whenLabel(booking)}
                      {booking.platform ? ` · ${booking.platform}` : ""}
                    </p>
                  </div>
                  <div className="ml-auto flex flex-shrink-0 items-center gap-4">
                    <p className="numeric m-0 w-[104px] whitespace-nowrap text-right text-copy font-semibold text-ink">
                      {rupiah(baseFromTotal(booking.price))}
                    </p>
                    {renderSessionAction && (
                      <div className="flex w-[132px] justify-end">
                        {renderSessionAction(booking)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {completed.length > visible.length && (
              <p className="m-0 border-t border-hairline-soft px-[22px] py-3 text-meta text-ink-soft">
                Menampilkan {visible.length} sesi terakhir dari {completed.length}.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ── the tab ────────────────────────────────────────────────────────────── */

export function JadwalTab({
  bookings,
  renderSessionAction,
  onGoToProfile,
  onGoToHome,
}: JadwalTabProps) {
  /**
   * A ticking clock, not a render-time snapshot: "Siap mulai" becomes "Sedang
   * live" at the session's start time, and nothing else on this tab causes a
   * render at 15:00. A minute is finer than any decision these rows drive.
   */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col gap-[30px]">
      <section>
        <SectionHead
          index={3}
          title="Ringkasan minggu ini"
          note="Yang kamu terima, sebelum Salda menambah 30% ke harga brand"
        />
        <WeekEarnings bookings={bookings} />
      </section>

      <section>
        <WeekGlance bookings={bookings} />
      </section>

      <section>
        <OpenSessions
          bookings={bookings}
          now={now}
          renderSessionAction={renderSessionAction}
          onGoToProfile={onGoToProfile}
          onGoToHome={onGoToHome}
        />
      </section>

      <section>
        <CompletedSessions bookings={bookings} renderSessionAction={renderSessionAction} />
      </section>
    </div>
  );
}

export default JadwalTab;
