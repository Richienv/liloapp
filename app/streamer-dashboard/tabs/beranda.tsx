"use client";

/**
 * BERANDA — the host's first screen.
 *
 * Three blocks, in the order a host actually needs them:
 *
 *   1. Yang harus kamu lakukan sekarang — one card, four states, driven by the
 *      real booking status (`accepted` → `items_received` → `live` →
 *      `completed`). Not a local toggle: the card reads whatever the page's
 *      Supabase query returned, and every button hands back to the mutation the
 *      page already owns.
 *   2. Permintaan yang menunggu jawaban kamu — the pending requests, with the
 *      page's existing accept / reject handlers passed straight through. No
 *      mutation is reimplemented here.
 *   3. Sisanya — the quiet list of every other session. Nothing to act on.
 *
 * NUMBERS. Every figure on this screen comes from a booking row. There is no
 * viewer count anywhere in the schema, so the live rail shows elapsed time
 * (derived from `start_time`) instead of the mockup's invented "1284 nonton".
 * Money is always the HOST's share — `baseFromTotal(price)`, never
 * `bookings.price`, which is what the brand paid with fee and tax on top.
 */

import { useMemo, useState } from "react";
import {
  differenceInHours,
  differenceInMinutes,
  format,
  formatDistanceToNowStrict,
  isToday,
  parseISO,
} from "date-fns";
import { id as idLocale } from "date-fns/locale";

import { baseFromTotal } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ types */

/**
 * The subset of the page's `Booking` this tab reads. Structural, so the page
 * can pass its own richer rows without a cast.
 */
export interface BerandaBooking {
  id: number;
  client_first_name: string;
  client_last_name: string;
  start_time: string;
  end_time: string;
  platform: string;
  /** `pending` | `accepted` | `live` | `completed` | `rejected` */
  status: string;
  /** What the brand paid, tax and platform fee included. */
  price: number;
  items_received?: boolean;
  stream_link?: string | null;
  special_request?: string | null;
  created_at?: string;
}

export interface BerandaTabProps {
  /** Answered bookings — accepted, live, completed. Same array the page holds. */
  bookings: BerandaBooking[];
  /** Bookings still waiting for an answer (`pending`). */
  pendingBookings: BerandaBooking[];

  /** The page's `handleAcceptBooking`. */
  onAccept: (bookingId: number) => void | Promise<void>;
  /** The page's `handleRejectBooking`. Reason is the chosen label. */
  onReject: (bookingId: number, reason: string) => void | Promise<void>;

  /**
   * Optional session actions. Each maps to a mutation the page already owns
   * (`acceptItems`, `startStream`, `endStream`, `requestReschedule`). When one
   * is not supplied the button falls back to `onOpenSession`, so this tab never
   * invents a write path of its own.
   */
  onConfirmItems?: (bookingId: number) => void | Promise<void>;
  onStartLive?: (bookingId: number, streamLink: string) => void | Promise<void>;
  onEndLive?: (bookingId: number) => void | Promise<void>;
  onReschedule?: (bookingId: number) => void;
  /** Open the full session card elsewhere on the dashboard. */
  onOpenSession?: (bookingId: number) => void;
}

/* ---------------------------------------------------------------- helpers */

function rupiah(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}

/** The host's take-home for a booking. Never the brand-facing price. */
function hostFee(booking: BerandaBooking): number {
  return baseFromTotal(booking.price);
}

function brandName(booking: BerandaBooking): string {
  return `${booking.client_first_name ?? ""} ${booking.client_last_name ?? ""}`.trim() || "Brand";
}

function timeRange(booking: BerandaBooking): string {
  return `${format(parseISO(booking.start_time), "HH:mm")}–${format(parseISO(booking.end_time), "HH:mm")}`;
}

function dayAndTime(booking: BerandaBooking): string {
  const start = parseISO(booking.start_time);
  const day = isToday(start)
    ? "Hari ini"
    : format(start, "EEEE, d MMMM", { locale: idLocale });
  return `${day} · ${timeRange(booking)}`;
}

function durationHours(booking: BerandaBooking): number {
  return Math.max(1, differenceInHours(parseISO(booking.end_time), parseISO(booking.start_time)));
}

/** "2 hari lagi" / "5 jam lagi" / "sudah lewat" — from the real start time. */
function untilStart(booking: BerandaBooking): string {
  const start = parseISO(booking.start_time);
  if (start.getTime() <= Date.now()) return "sudah lewat";
  return `${formatDistanceToNowStrict(start, { locale: idLocale })} lagi`;
}

/** Elapsed time since a live session began. The honest stand-in for a viewer count. */
function elapsedSince(booking: BerandaBooking): string {
  const mins = Math.max(0, differenceInMinutes(new Date(), parseISO(booking.start_time)));
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

const REJECT_REASONS = [
  "Jadwal bentrok",
  "Kategori tidak cocok",
  "Produk tidak keburu sampai",
  "Alasan lain",
] as const;

/* ------------------------------------------------------- section chrome */

function SectionHead({
  index,
  title,
  note,
  quiet,
}: {
  index: number;
  title: string;
  note?: string;
  quiet?: boolean;
}) {
  return (
    <div className="mb-3 flex items-baseline gap-2.5">
      <span
        className={cn(
          "flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full text-tiny font-semibold tracking-normal",
          quiet ? "bg-hairline-soft text-ink-faint" : "bg-ink text-white",
        )}
      >
        {index}
      </span>
      <h2 className="text-lede font-semibold tracking-normal text-ink">{title}</h2>
      {note && <span className="text-copy text-ink-faint">{note}</span>}
    </div>
  );
}

/* ================================================================ 1 · NOW */

type NowState = "waiting" | "ready" | "live" | "done";

function pickNowBooking(bookings: BerandaBooking[]): BerandaBooking | null {
  const byStart = (a: BerandaBooking, b: BerandaBooking) =>
    parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime();

  const live = bookings.find((b) => b.status.toLowerCase() === "live");
  if (live) return live;

  const accepted = bookings
    .filter((b) => b.status.toLowerCase() === "accepted")
    .sort(byStart);

  const today = accepted.find((b) => isToday(parseISO(b.start_time)));
  if (today) return today;

  const doneToday = bookings
    .filter((b) => b.status.toLowerCase() === "completed" && isToday(parseISO(b.start_time)))
    .sort((a, b) => parseISO(b.end_time).getTime() - parseISO(a.end_time).getTime())[0];
  if (doneToday) return doneToday;

  return accepted.find((b) => parseISO(b.end_time).getTime() >= Date.now()) ?? null;
}

function NowCard({
  booking,
  next,
  onConfirmItems,
  onStartLive,
  onEndLive,
  onReschedule,
  onOpenSession,
}: {
  booking: BerandaBooking;
  next: BerandaBooking | null;
  onConfirmItems?: BerandaTabProps["onConfirmItems"];
  onStartLive?: BerandaTabProps["onStartLive"];
  onEndLive?: BerandaTabProps["onEndLive"];
  onReschedule?: BerandaTabProps["onReschedule"];
  onOpenSession?: BerandaTabProps["onOpenSession"];
}) {
  const [link, setLink] = useState(booking.stream_link ?? "");
  const [busy, setBusy] = useState(false);

  const status = booking.status.toLowerCase();
  const live = status === "live";
  const done = status === "completed";
  const itemsOk = Boolean(booking.items_received);
  const ready = !live && !done && itemsOk;
  const state: NowState = live ? "live" : done ? "done" : ready ? "ready" : "waiting";

  const brand = brandName(booking);
  const fee = rupiah(hostFee(booking));

  /* --- copy ---------------------------------------------------------- */
  const copy: Record<NowState, { eyebrow: string; title: string; sub: string; foot: string }> = {
    waiting: {
      eyebrow: "Langkah 2 dari 4",
      title: `Cek paket dari ${brand} dulu.`,
      sub: "Buka paketnya dan pastikan isinya lengkap. Setelah kamu tandai, tombol mulai live akan terbuka.",
      foot: "Belum terima paket? Ajukan jadwal ulang sebelum sesi mulai.",
    },
    ready: {
      eyebrow: "Langkah 3 dari 4",
      title: "Tinggal satu langkah: mulai live.",
      sub: "Tempel tautan siaran kamu di bawah, lalu tekan tombol biru. Brand langsung dapat notifikasi.",
      foot: "Tautan dipakai brand dan tim Salda untuk memantau sesi.",
    },
    live: {
      eyebrow: "Langkah 3 dari 4 · sedang berjalan",
      title: "Kamu sedang live.",
      sub: `Tekan tombol di bawah hanya kalau sesi benar-benar sudah selesai. Jadwal sesi berakhir pukul ${format(parseISO(booking.end_time), "HH:mm")}.`,
      foot: "Brand memantau sesi lewat tautan siaran yang kamu kirim.",
    },
    done: {
      eyebrow: "Beres · tidak ada tugas",
      title: "Sesi hari ini sudah selesai.",
      sub: `${fee} masuk ke saldo kamu. Kamu tidak perlu melakukan apa pun sekarang.`,
      foot: next
        ? `Berikutnya: ${brandName(next)}, ${dayAndTime(next)}.`
        : "Belum ada sesi berikutnya yang terjadwal.",
    },
  };
  const text = copy[state];

  /* --- surfaces ------------------------------------------------------ */
  const cardCls = live
    ? "bg-ink"
    : done
      ? "bg-surface border-positive-line"
      : ready
        ? "bg-surface border-brand"
        : "bg-surface border-hairline";
  const barCls = live ? "" : ready ? "bg-brand-wash" : "bg-surface-raised";
  const fgCls = live ? "text-[#fafafa]" : "text-ink";
  const subCls = live ? "text-[rgba(255,255,255,.62)]" : "text-ink-muted";
  const eyebrowCls = live
    ? "text-brand-line-strong"
    : done
      ? "text-positive"
      : ready
        ? "text-brand"
        : "text-ink-ghost";
  const railBorder = live
    ? "border-[#2e2e2e]"
    : done
      ? "border-positive-line"
      : ready
        ? "border-brand"
        : "border-hairline";

  /* --- flow rail ------------------------------------------------------ */
  const steps = [
    { label: "Booking diterima", ok: true, hint: "Selesai" },
    { label: "Barang diterima", ok: itemsOk || live || done, hint: "Cek isi paket" },
    { label: "Live berjalan", ok: live || done, hint: timeRange(booking) },
    { label: "Bayaran cair", ok: done, hint: "Setelah sesi selesai" },
  ];
  const activeIdx = steps.findIndex((s) => !s.ok);

  /* --- primary action ------------------------------------------------- */
  const needsLink = ready && Boolean(onStartLive);
  const linkMissing = needsLink && !link.trim();

  const primaryLabel = done
    ? "Lihat ringkasan sesi"
    : live
      ? onEndLive
        ? "Akhiri live sekarang"
        : "Buka sesi"
      : ready
        ? onStartLive
          ? "Mulai live"
          : "Buka sesi"
        : onConfirmItems
          ? "Ya, barang sudah saya terima"
          : "Buka sesi";

  const primaryDisabled = busy || linkMissing;

  const runPrimary = async () => {
    if (primaryDisabled) return;
    setBusy(true);
    try {
      if (done) onOpenSession?.(booking.id);
      else if (live) (onEndLive ?? onOpenSession)?.(booking.id);
      else if (ready) {
        if (onStartLive) await onStartLive(booking.id, link.trim());
        else onOpenSession?.(booking.id);
      } else (onConfirmItems ?? onOpenSession)?.(booking.id);
    } finally {
      setBusy(false);
    }
  };

  const primaryCls = done
    ? "bg-ink text-white hover:bg-brand"
    : live
      ? "bg-white text-ink"
      : linkMissing
        ? "bg-hairline-soft text-ink-ghost"
        : "bg-brand text-white hover:bg-brand-hover";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-frame border transition-colors duration-[400ms] ease-out",
        cardCls,
        live && "border-[#2e2e2e]",
      )}
    >
      <div className="flex flex-wrap items-start gap-6 px-7 pb-[22px] pt-[26px]">
        <div className="min-w-[280px] flex-1">
          <p className={cn("mb-3 font-mono text-tiny uppercase tracking-[.1em]", eyebrowCls)}>
            {text.eyebrow}
          </p>
          <h3
            className={cn(
              "mb-2.5 max-w-[22ch] font-serif text-[29px] font-medium leading-[1.12] tracking-[-.02em]",
              fgCls,
            )}
          >
            {text.title}
          </h3>
          <p className={cn("max-w-[52ch] text-ui leading-[1.6]", subCls)}>{text.sub}</p>
        </div>

        {/* detail rail */}
        <div
          className={cn(
            "flex w-[206px] flex-shrink-0 flex-col gap-[9px] border-l pl-[22px] transition-colors duration-[400ms]",
            railBorder,
          )}
        >
          {[
            ["Brand", brand],
            ["Jam", timeRange(booking)],
            ["Platform", booking.platform],
            ["Bayaran", fee],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 text-meta">
              <span className={subCls}>{label}</span>
              <span className={cn("truncate font-semibold", fgCls)}>{value}</span>
            </div>
          ))}

          {live && (
            <div className="relative mt-1.5 flex items-end justify-between border-t border-[rgba(255,255,255,.16)] pt-3">
              <div>
                {/* No viewer count exists in the schema. This is real elapsed
                    time since the session started, not an invented audience. */}
                <p className="mb-0.5 font-mono text-price font-medium text-white">
                  {elapsedSince(booking)}
                </p>
                <p className="text-tiny tracking-normal text-[rgba(255,255,255,.6)]">berjalan</p>
              </div>
              <div className="flex h-[26px] items-end gap-1" aria-hidden>
                <span
                  className="w-1 origin-bottom rounded-hair bg-[rgba(255,255,255,.5)]"
                  style={{ height: "100%", animation: "h-bar 1.1s ease-in-out infinite" }}
                />
                <span
                  className="w-1 origin-bottom rounded-hair bg-white"
                  style={{ height: "100%", animation: "h-bar 1.1s ease-in-out infinite .2s" }}
                />
                <span
                  className="w-1 origin-bottom rounded-hair bg-[rgba(255,255,255,.5)]"
                  style={{ height: "100%", animation: "h-bar 1.1s ease-in-out infinite .4s" }}
                />
              </div>
              <span
                aria-hidden
                className="absolute bottom-3.5 right-0.5 text-mini text-white"
                style={{ animation: "h-heart 2.6s ease-out infinite" }}
              >
                ♥
              </span>
            </div>
          )}
        </div>
      </div>

      {/* four-step flow rail */}
      <div className="px-7 pb-[22px]">
        <div className="flex items-start">
          {steps.map((step, i) => {
            const active = i === activeIdx;
            return (
              <div key={step.label} className="flex flex-1 flex-col gap-2">
                <div className="flex items-center">
                  <span
                    className={cn(
                      "flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border text-[10.5px] font-semibold transition-colors duration-[400ms]",
                      step.ok
                        ? "border-brand bg-brand text-white"
                        : active
                          ? "border-brand bg-surface text-brand"
                          : live
                            ? "border-[#3a3a3a] bg-transparent text-[#6b6b66]"
                            : "border-hairline-input bg-transparent text-ink-ghost",
                    )}
                  >
                    {step.ok ? "✓" : i + 1}
                  </span>
                  <span
                    className={cn(
                      "h-0.5 flex-1 transition-colors duration-[400ms]",
                      step.ok ? "bg-brand" : live ? "bg-[#2e2e2e]" : "bg-hairline",
                    )}
                  />
                </div>
                <span
                  className={cn(
                    "text-[11.5px] leading-none transition-colors duration-[400ms]",
                    active ? "font-semibold" : "font-medium",
                    step.ok
                      ? live
                        ? "text-[#fafafa]"
                        : "text-ink"
                      : active
                        ? "text-ink"
                        : live
                          ? "text-[#6b6b66]"
                          : "text-ink-ghost",
                  )}
                >
                  {step.label}
                </span>
                <span
                  className={cn(
                    "h-[13px] text-[10.5px] leading-[13px]",
                    active ? "text-brand" : live ? "text-[#6b6b66]" : "text-ink-ghost",
                  )}
                >
                  {active ? "Kamu di sini" : step.ok ? step.hint : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* stream link */}
      {needsLink && (
        <div className="px-7 pb-5">
          <label
            htmlFor={`stream-link-${booking.id}`}
            className="mb-[7px] block text-meta font-semibold text-ink-body"
          >
            Tempel tautan siaran kamu
          </label>
          <input
            id={`stream-link-${booking.id}`}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://shopee.co.id/live/..."
            className={cn(
              "h-[46px] w-full rounded-field border px-3.5 text-copy text-ink outline-none transition-colors",
              link.trim() ? "border-brand" : "border-hairline-input",
            )}
          />
          <p
            className={cn("mt-2 text-mini", link.trim() ? "text-positive" : "text-ink-faint")}
          >
            {link.trim()
              ? "Tautan tersimpan. Tombol mulai live sudah aktif."
              : "Tombol mulai live terbuka setelah tautan diisi."}
          </p>
        </div>
      )}

      {/* footer bar */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-4 border-t px-7 py-4 transition-colors duration-[400ms]",
          railBorder,
          barCls,
        )}
        style={live ? { background: "#1f1f1f" } : undefined}
      >
        <p className={cn("min-w-0 flex-1 basis-[200px] text-meta", subCls)}>{text.foot}</p>
        <div className="ml-auto flex flex-shrink-0 gap-3">
          {!done && (
            <button
              type="button"
              onClick={() =>
                live ? onOpenSession?.(booking.id) : (onReschedule ?? onOpenSession)?.(booking.id)
              }
              className={cn(
                "h-[46px] w-[168px] rounded-field border bg-transparent text-copy font-medium transition-colors",
                live
                  ? "border-[rgba(255,255,255,.3)] text-[#fafafa]"
                  : "border-hairline-input text-ink-muted hover:border-ink hover:text-ink",
              )}
            >
              {live ? "Buka detail sesi" : "Ajukan jadwal ulang"}
            </button>
          )}
          <button
            type="button"
            onClick={runPrimary}
            disabled={primaryDisabled}
            className={cn(
              "h-[46px] w-[220px] rounded-field text-ui font-semibold transition-colors duration-300",
              primaryCls,
              primaryDisabled && "cursor-not-allowed",
            )}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function NowEmpty() {
  return (
    <div className="rounded-frame border border-dashed border-hairline-input bg-surface px-6 py-10 text-center">
      <p className="mb-1.5 text-[14.5px] font-semibold text-ink">Tidak ada yang perlu kamu lakukan</p>
      <p className="text-copy text-ink-soft">
        Begitu ada booking yang kamu terima, langkahnya muncul di sini.
      </p>
    </div>
  );
}

/* =========================================================== 2 · REQUESTS */

function RequestCard({
  request,
  onAccept,
  onReject,
}: {
  request: BerandaBooking;
  onAccept: BerandaTabProps["onAccept"];
  onReject: BerandaTabProps["onReject"];
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [otherReason, setOtherReason] = useState("");
  const [busy, setBusy] = useState(false);

  const start = parseISO(request.start_time);
  const urgent = start.getTime() - Date.now() <= 24 * 60 * 60 * 1000;
  const finalReason =
    reason === "Alasan lain" ? otherReason.trim() || "Alasan lain" : (reason ?? "");

  const submitReject = async () => {
    if (!reason || busy) return;
    setBusy(true);
    try {
      await onReject(request.id, finalReason);
      setRejecting(false);
      setReason(null);
      setOtherReason("");
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onAccept(request.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-frame border bg-surface",
        rejecting ? "border-brand" : urgent ? "border-caution-line" : "border-hairline",
      )}
      style={{ animation: "h-in .4s cubic-bezier(.16,1,.3,1)" }}
    >
      <div className="flex flex-wrap items-start gap-5 px-6 pb-[18px] pt-5">
        <div className="flex h-[62px] w-[52px] flex-shrink-0 items-center justify-center rounded-field bg-surface-tint font-serif text-title text-ink-faint">
          {brandName(request).charAt(0).toUpperCase()}
        </div>
        <div className="min-w-[220px] flex-1">
          <p className="mb-[5px] truncate text-[16px] font-semibold text-ink">{brandName(request)}</p>
          <p className="mb-1 truncate text-copy text-ink-body">{dayAndTime(request)}</p>
          <p className="truncate text-meta text-ink-faint">
            {request.platform} Live
            {request.special_request ? ` · ${request.special_request}` : ""}
          </p>
        </div>
        <div className="flex w-[206px] flex-shrink-0 flex-col gap-2 border-l border-hairline-soft pl-[22px]">
          <div className="flex justify-between text-meta">
            <span className="text-ink-soft">Bayaran kamu</span>
            <span className="font-semibold text-ink">{rupiah(hostFee(request))}</span>
          </div>
          <div className="flex justify-between text-meta">
            <span className="text-ink-soft">Durasi</span>
            <span className="font-semibold text-ink">{durationHours(request)} jam</span>
          </div>
          <div className="flex justify-between text-meta">
            {/* No answer-deadline column exists. The real deadline is the session
                itself, so this counts down to `start_time`. */}
            <span className="text-ink-soft">Batas jawab</span>
            <span className={cn("font-semibold", urgent ? "text-caution" : "text-ink")}>
              {untilStart(request)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-hairline-soft bg-surface-raised px-6 py-4">
        <p className="min-w-0 flex-1 basis-[200px] text-meta text-ink-soft">
          {urgent
            ? "Jawab sekarang — sesi mulai kurang dari 24 jam lagi."
            : "Brand menunggu jawaban kamu sebelum menyiapkan sesi."}
        </p>
        <div className="ml-auto flex flex-shrink-0 gap-3">
          <button
            type="button"
            onClick={() => {
              setRejecting((v) => !v);
              setReason(null);
            }}
            className="h-[46px] w-[168px] rounded-field border border-hairline-input bg-surface text-copy font-medium text-ink-muted transition-colors hover:border-ink hover:text-ink"
          >
            Tolak
          </button>
          <button
            type="button"
            onClick={accept}
            disabled={busy}
            className="h-[46px] w-[220px] rounded-field bg-brand text-ui font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed"
          >
            Terima booking
          </button>
        </div>
      </div>

      {rejecting && (
        <div
          className="border-t border-hairline-soft px-6 py-5"
          style={{ animation: "h-in .3s cubic-bezier(.16,1,.3,1)" }}
        >
          <p className="mb-[5px] text-ui font-semibold text-ink">Pilih satu alasan</p>
          <p className="mb-3.5 text-meta leading-[1.55] text-ink-soft">
            Brand akan melihat alasan ini. Menolak terlalu sering menurunkan urutan kamu di
            pencarian.
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            {REJECT_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={cn(
                  "rounded-field border px-3.5 py-2.5 text-[13px] font-medium transition-colors",
                  reason === r
                    ? "border-ink bg-ink text-white"
                    : "border-hairline-input bg-surface text-ink-body hover:border-ink",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          {reason === "Alasan lain" && (
            <input
              value={otherReason}
              onChange={(e) => setOtherReason(e.target.value)}
              placeholder="Tulis alasan kamu"
              className="mb-4 h-[46px] w-full rounded-field border border-hairline-input px-3.5 text-copy text-ink outline-none focus:border-brand"
            />
          )}
          <div className="flex flex-wrap items-center gap-4">
            <p className="min-w-0 flex-1 basis-[200px] text-meta text-ink-soft">
              {reason ? `Alasan terpilih: ${finalReason}` : "Pilih satu alasan dulu untuk melanjutkan."}
            </p>
            <div className="ml-auto flex flex-shrink-0 gap-3">
              <button
                type="button"
                onClick={() => {
                  setRejecting(false);
                  setReason(null);
                }}
                className="h-[46px] w-[168px] rounded-field border border-hairline-input bg-surface text-copy font-medium text-ink-muted transition-colors hover:border-ink hover:text-ink"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={submitReject}
                disabled={!reason || busy}
                className={cn(
                  "h-[46px] w-[220px] rounded-field text-ui font-semibold transition-colors",
                  reason && !busy
                    ? "bg-ink text-white"
                    : "cursor-not-allowed bg-hairline-soft text-ink-ghost",
                )}
              >
                Kirim penolakan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================= 3 · SISANYA */

const REST_STATUS: Record<string, { label: string; cls: string }> = {
  accepted: { label: "Siap dijalankan", cls: "text-brand-deep" },
  live: { label: "Sedang live", cls: "text-positive" },
  completed: { label: "Selesai", cls: "text-ink-muted" },
  rejected: { label: "Ditolak", cls: "text-ink-faint" },
  pending: { label: "Menunggu jawaban", cls: "text-caution" },
};

function RestList({
  sessions,
  onOpenSession,
}: {
  sessions: BerandaBooking[];
  onOpenSession?: BerandaTabProps["onOpenSession"];
}) {
  if (sessions.length === 0) {
    return (
      <div className="rounded-frame border border-dashed border-hairline-input bg-surface px-6 py-10 text-center">
        <p className="mb-1.5 text-[14.5px] font-semibold text-ink">Belum ada sesi lain</p>
        <p className="text-copy text-ink-soft">Sesi yang sudah dijawab akan muncul di sini.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-frame border border-hairline bg-surface">
      {sessions.map((s, i) => {
        const meta = REST_STATUS[s.status.toLowerCase()] ?? {
          label: s.status,
          cls: "text-ink-muted",
        };
        return (
          <div
            key={s.id}
            className={cn(
              "flex items-center gap-4 px-[22px] py-[15px]",
              i > 0 && "border-t border-hairline-soft",
            )}
          >
            <div className="flex h-[42px] w-9 flex-shrink-0 items-center justify-center rounded-md bg-surface-tint font-serif text-ui text-ink-faint">
              {brandName(s).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-[3px] truncate text-copy font-semibold text-ink">{brandName(s)}</p>
              <p className="truncate text-meta text-ink-faint">
                {dayAndTime(s)} · {s.platform}
              </p>
            </div>
            <div className="ml-auto flex flex-shrink-0 items-center gap-4">
              <span className={cn("w-[140px] whitespace-nowrap text-right text-copy font-semibold", meta.cls)}>
                {meta.label}
              </span>
              <p className="w-[104px] whitespace-nowrap text-right text-ui font-semibold text-ink">
                {rupiah(hostFee(s))}
              </p>
              <button
                type="button"
                onClick={() => onOpenSession?.(s.id)}
                className="h-11 w-[132px] rounded-field border border-hairline-input bg-surface text-[13px] font-medium text-ink-muted transition-colors hover:border-ink hover:text-ink"
              >
                Lihat detail
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ==================================================================== TAB */

export function BerandaTab({
  bookings,
  pendingBookings,
  onAccept,
  onReject,
  onConfirmItems,
  onStartLive,
  onEndLive,
  onReschedule,
  onOpenSession,
}: BerandaTabProps) {
  const nowBooking = useMemo(() => pickNowBooking(bookings), [bookings]);

  const nextBooking = useMemo(() => {
    if (!nowBooking) return null;
    return (
      bookings
        .filter(
          (b) =>
            b.id !== nowBooking.id &&
            b.status.toLowerCase() === "accepted" &&
            parseISO(b.start_time).getTime() >= Date.now(),
        )
        .sort((a, b) => parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime())[0] ??
      null
    );
  }, [bookings, nowBooking]);

  const rest = useMemo(
    () =>
      bookings
        .filter((b) => b.id !== nowBooking?.id)
        .sort((a, b) => parseISO(b.start_time).getTime() - parseISO(a.start_time).getTime()),
    [bookings, nowBooking],
  );

  return (
    <div className="flex flex-col gap-[30px]">
      <section>
        <SectionHead index={1} title="Yang harus kamu lakukan sekarang" />
        {nowBooking ? (
          <NowCard
            booking={nowBooking}
            next={nextBooking}
            onConfirmItems={onConfirmItems}
            onStartLive={onStartLive}
            onEndLive={onEndLive}
            onReschedule={onReschedule}
            onOpenSession={onOpenSession}
          />
        ) : (
          <NowEmpty />
        )}
      </section>

      <section>
        <SectionHead
          index={2}
          title="Permintaan yang menunggu jawaban kamu"
          note={pendingBookings.length ? `${pendingBookings.length} menunggu` : "Kosong"}
          quiet={pendingBookings.length === 0}
        />
        <div className="flex flex-col gap-3">
          {pendingBookings.length > 0 ? (
            pendingBookings.map((r) => (
              <RequestCard key={r.id} request={r} onAccept={onAccept} onReject={onReject} />
            ))
          ) : (
            <div className="rounded-frame border border-dashed border-hairline-input bg-surface px-6 py-10 text-center">
              <p className="mb-1.5 text-[14.5px] font-semibold text-ink">
                Tidak ada yang menunggu jawaban
              </p>
              <p className="text-copy text-ink-soft">
                Semua permintaan sudah kamu jawab. Kerja bagus.
              </p>
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionHead index={3} title="Sisanya" note="Tidak perlu tindakan" quiet />
        <RestList sessions={rest} onOpenSession={onOpenSession} />
      </section>
    </div>
  );
}

export default BerandaTab;
