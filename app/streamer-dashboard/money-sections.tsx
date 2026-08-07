"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, isThisMonth, subDays } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { toast } from "react-toastify";

import { baseFromTotal, subtotalWithPlatformFee } from "@/lib/pricing";
import { cn } from "@/lib/utils";

import {
  type PayoutRow,
  type StreamerBalance,
  getStreamerBalance,
  listPayouts,
  requestPayout,
} from "./payout-actions";

/**
 * The money half of the host dashboard: what a host has, where it came from,
 * and how to get it out — plus the two profile sections a host tunes to get
 * more of it.
 *
 * Every rupiah on this screen is the HOST's share. `bookings.price` is what the
 * brand paid, fee and tax included, and the two are 44% apart — the earnings
 * chart shipped once quoting the wrong one. The division happens in
 * `baseFromTotal` here and in `salda_host_earnings()` in the database, and the
 * two must agree.
 *
 * Layout follows the host reference: the numbered heading sits OUTSIDE the card,
 * the card is a 14px-radius hairline panel, and every card that asks for a
 * decision ends in a footer bar carrying the footnote on the left and at most
 * two buttons (168px secondary, 220px primary, both 46px tall) on the right.
 */

function rupiah(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}

interface Booking {
  id: number;
  client_first_name: string;
  client_last_name: string;
  start_time: string;
  end_time: string;
  platform: string;
  status: string;
  price: number;
}

/**
 * Numbered section heading, outside the card.
 *
 * `tone` is the reference's one distinction: a section that wants something from
 * the host gets the ink badge, an archive gets the quiet one.
 */
function SectionHead({
  number,
  title,
  note,
  tone = "active",
}: {
  number: number;
  title: string;
  note?: string;
  tone?: "active" | "quiet";
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      <span
        className={cn(
          "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-tiny font-semibold tracking-normal",
          tone === "active" ? "bg-ink text-white" : "bg-hairline-soft text-ink-faint",
        )}
      >
        {number}
      </span>
      <h2 className="text-lede font-semibold text-ink">{title}</h2>
      {note && <span className="text-[13px] text-ink-faint">{note}</span>}
    </div>
  );
}

/** The 46px button pair every decision card ends with. */
const SECONDARY_BUTTON =
  "inline-flex h-[46px] items-center justify-center rounded-lg border border-hairline-input " +
  "bg-surface px-4 text-copy font-medium text-ink-muted transition-colors " +
  "hover:border-ink hover:text-ink max-sm:w-full sm:w-[168px]";

const PRIMARY_BUTTON =
  "inline-flex h-[46px] items-center justify-center gap-2 rounded-lg px-4 text-ui font-semibold " +
  "text-white transition-colors max-sm:w-full sm:w-[220px]";

/** Footer bar: footnote left, actions right, never stacked on desktop. */
function FooterBar({
  note,
  tone = "quiet",
  children,
}: {
  note: string;
  tone?: "quiet" | "brand";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-4 border-t border-hairline-soft px-7 py-4",
        tone === "brand" ? "bg-brand-wash" : "bg-surface-raised",
      )}
    >
      <p className="min-w-0 flex-[1_1_200px] text-meta text-ink-muted">{note}</p>
      <div className="ml-auto flex shrink-0 gap-3 max-sm:w-full max-sm:flex-col">{children}</div>
    </div>
  );
}

/**
 * "Uang yang bisa kamu ambil sekarang", "Dari mana uangnya bulan ini",
 * "Riwayat pembayaran" — the PENDAPATAN tab.
 *
 * One component because the first and third read the same two queries and a
 * withdrawal has to refresh both — splitting them would mean either two round
 * trips or a shared parent that exists only to hold the state.
 */
export function MoneySections({
  streamerId,
  index,
  bookings,
}: {
  streamerId: number;
  index: number;
  bookings: Booking[];
}) {
  const [balance, setBalance] = useState<StreamerBalance | null>(null);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const load = useCallback(async () => {
    const [b, p] = await Promise.all([
      getStreamerBalance(streamerId),
      listPayouts(streamerId),
    ]);
    setBalance(b);
    setPayouts(p);
  }, [streamerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleWithdraw = async () => {
    if (!balance || balance.available <= 0 || isWithdrawing) return;
    setIsWithdrawing(true);
    try {
      const result = await requestPayout(streamerId, balance.available);
      if (result.success) {
        toast.success("Permintaan penarikan terkirim.");
        // Re-read rather than adjusting local state: the balance is derived
        // server-side, and guessing at it here is how a second source of truth
        // starts.
        await load();
      } else {
        toast.error(result.error ?? "Penarikan gagal.");
      }
    } finally {
      setIsWithdrawing(false);
    }
  };

  /**
   * "Dari mana uangnya bulan ini" — this month's completed sessions by brand,
   * biggest first, plus the four figures beside it. All computed from the
   * bookings the page already loaded, so they cost no query.
   */
  const month = useMemo(() => {
    const totals = new Map<string, number>();
    let total = 0;
    let count = 0;
    let hours = 0;
    let week = 0;
    let weekCount = 0;
    const weekSince = subDays(new Date(), 7);

    for (const booking of bookings) {
      if (booking.status !== "completed") continue;
      const start = new Date(booking.start_time);
      const share = baseFromTotal(booking.price);

      if (start >= weekSince) {
        week += share;
        weekCount += 1;
      }
      if (!isThisMonth(start)) continue;

      const brand = `${booking.client_first_name} ${booking.client_last_name}`.trim() || "Brand";
      totals.set(brand, (totals.get(brand) ?? 0) + share);
      total += share;
      count += 1;
      hours += Math.max(
        (new Date(booking.end_time).getTime() - start.getTime()) / 3_600_000,
        0,
      );
    }

    const brands = Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      brands,
      // Bars are scaled to the biggest brand, not to the month's total: the
      // question this answers is "who is my business", and that reads fastest
      // against the leader.
      max: brands.length > 0 ? brands[0][1] : 0,
      total,
      count,
      hours,
      week,
      weekCount,
    };
  }, [bookings]);

  const monthLabel = format(new Date(), "MMMM yyyy", { locale: idLocale });

  const stats = [
    {
      label: "Pendapatan 7 hari terakhir",
      value: rupiah(month.week),
      note: month.weekCount > 0 ? `${month.weekCount} sesi selesai` : "Belum ada sesi selesai",
    },
    {
      label: "Bulan ini",
      value: rupiah(month.total),
      note: month.count > 0 ? `${month.count} sesi selesai` : "Belum ada sesi selesai",
    },
    {
      label: "Rata-rata per sesi",
      value: month.count > 0 ? rupiah(month.total / month.count) : "—",
      note: month.count > 0 ? `Bulan ${monthLabel.split(" ")[0]}` : "Belum bisa dihitung",
    },
    {
      label: "Jam siaran",
      value: month.count > 0 ? `${Math.round(month.hours)} jam` : "—",
      note: `Bulan ${monthLabel.split(" ")[0]}`,
    },
  ];

  const STATUS_LABEL: Record<PayoutRow["status"], string> = {
    pending: "Menunggu",
    processing: "Diproses",
    paid: "Selesai",
    rejected: "Ditolak",
    cancelled: "Dibatalkan",
  };

  /** Status is a bordered tint, never a saturated fill. */
  const STATUS_CHIP: Record<PayoutRow["status"], string> = {
    pending: "border-caution-line bg-caution-tint text-caution-strong",
    processing: "border-caution-line bg-caution-tint text-caution-strong",
    paid: "border-positive-line bg-positive-tint text-positive",
    rejected: "border-hairline bg-surface-sunken text-critical",
    cancelled: "border-hairline bg-surface-sunken text-ink-muted",
  };

  const available = balance?.available ?? 0;
  const canWithdraw = Boolean(balance && balance.available > 0) && !isWithdrawing;

  return (
    <>
      {/* ── 1 · Uang yang bisa kamu ambil sekarang ─────────────────────────── */}
      <section>
        <SectionHead number={index} title="Uang yang bisa kamu ambil sekarang" />

        <div className="overflow-hidden rounded-frame border border-brand bg-surface">
          <div className="flex flex-wrap items-start gap-7 p-7">
            <div className="min-w-0 flex-[1_1_260px]">
              <p className="mb-3 font-mono text-tiny uppercase tracking-[0.1em] text-brand">
                Siap dicairkan
              </p>
              <p className="numeric mb-2.5 text-[44px] font-semibold leading-none tracking-[-0.03em] text-ink">
                {balance === null ? "—" : rupiah(available)}
              </p>
              <p className="max-w-[44ch] text-ui text-ink-muted">
                {/* Deliberately generic: the destination bank lives on the payout
                    rows below, where it is the one the payout was actually
                    snapshotted against. */}
                {available > 0
                  ? "Dana masuk ke rekening kamu dalam 1×24 jam kerja. Tidak ada biaya penarikan."
                  : "Belum ada dana yang bisa dicairkan. Saldo bertambah setiap sesi selesai."}
              </p>
            </div>

            <div className="flex w-full flex-col gap-[11px] border-hairline-soft sm:w-[230px] sm:shrink-0 sm:border-l sm:pl-6">
              <div className="flex items-baseline justify-between gap-3 text-meta">
                <span className="text-ink-soft">Selesai, siap cair</span>
                <span className="numeric font-semibold text-ink">
                  {balance === null ? "—" : rupiah(available)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3 text-meta">
                <span className="text-ink-soft">Tertahan</span>
                <span className="numeric font-semibold text-ink">
                  {balance === null ? "—" : rupiah(balance.held)}
                </span>
              </div>
              <div className="h-px bg-hairline-soft" />
              <div className="flex items-baseline justify-between gap-3 text-meta">
                <span className="text-ink-soft">Total di Salda</span>
                <span className="numeric font-semibold text-ink">
                  {balance === null ? "—" : rupiah(balance.lifetime)}
                </span>
              </div>
              <p className="mt-1 text-[11.5px] leading-[1.5] text-ink-ghost">
                Dana tertahan cair otomatis setelah sesi selesai.
              </p>
            </div>
          </div>

          <FooterBar
            tone="brand"
            note="Pencairan otomatis berjalan tiap Senin. Kamu juga bisa tarik kapan saja."
          >
            <Link href="/streamer-setup/rekening" className={SECONDARY_BUTTON}>
              Ubah rekening
            </Link>
            <button
              type="button"
              onClick={handleWithdraw}
              disabled={!canWithdraw}
              className={cn(
                PRIMARY_BUTTON,
                canWithdraw
                  ? "bg-brand hover:bg-brand-hover"
                  : "cursor-not-allowed bg-hairline-soft text-ink-ghost",
              )}
            >
              {isWithdrawing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Mengirim…
                </>
              ) : available > 0 ? (
                `Tarik ${rupiah(available)}`
              ) : (
                "Tarik saldo"
              )}
            </button>
          </FooterBar>
        </div>
      </section>

      {/* ── 2 · Dari mana uangnya bulan ini ────────────────────────────────── */}
      <section>
        <SectionHead number={index + 1} title="Dari mana uangnya bulan ini" note={monthLabel} />

        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-frame border border-hairline bg-surface px-6 py-[22px]">
            <p className="mb-[18px] text-[13px] text-ink-soft">Lima brand teratas</p>
            {month.brands.length === 0 ? (
              <p className="py-6 text-meta text-ink-soft">
                Belum ada sesi selesai bulan ini. Begitu satu sesi selesai, brand-nya muncul di
                sini.
              </p>
            ) : (
              <div className="flex flex-col gap-[15px]">
                {month.brands.map(([brand, value], i) => (
                  <div key={brand}>
                    <div className="mb-[7px] flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[13px] font-medium text-ink">
                        {brand}
                      </span>
                      <span className="numeric shrink-0 text-[13px] font-semibold text-ink">
                        {rupiah(value)}
                      </span>
                    </div>
                    {/* Decoration only — the figure above carries the meaning, so
                        an entrance animation that never runs costs nothing. */}
                    <span className="block h-1.5 overflow-hidden rounded-[3px] bg-hairline-soft">
                      <span
                        className={cn(
                          "block h-full rounded-[3px]",
                          i === 0 ? "bg-brand" : "bg-hairline-input",
                        )}
                        style={{
                          width: `${month.max > 0 ? Math.max((value / month.max) * 100, 2) : 0}%`,
                          transformOrigin: "bottom",
                          animation: "h-grow .6s cubic-bezier(.16,1,.3,1) both",
                        }}
                      />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-frame border border-hairline bg-surface px-5 py-[18px]"
              >
                <p className="mb-2 text-meta text-ink-soft">{stat.label}</p>
                <p className="numeric mb-1 text-price font-semibold text-ink">{stat.value}</p>
                <p className="text-mini text-ink-faint">{stat.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3 · Riwayat pembayaran ─────────────────────────────────────────── */}
      <section>
        <SectionHead
          number={index + 2}
          title="Riwayat pembayaran"
          note="Tidak perlu tindakan"
          tone="quiet"
        />

        <div className="overflow-hidden rounded-frame border border-hairline bg-surface">
          {payouts.length === 0 ? (
            <p className="px-6 py-10 text-center text-meta text-ink-soft">
              Belum ada penarikan. Riwayat muncul di sini setelah kamu menarik saldo pertama.
            </p>
          ) : (
            payouts.map((payout) => (
              <div
                key={payout.id}
                className="flex items-center gap-3.5 border-t border-hairline-soft px-[22px] py-[15px] first:border-t-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="mb-[3px] truncate text-copy font-medium text-ink">
                    {payout.bank_name
                      ? `Pencairan ke ${payout.bank_name} ${payout.account_number_masked ?? ""}`.trim()
                      : "Pencairan saldo"}
                  </p>
                  <p className="truncate text-meta text-ink-faint">
                    {format(new Date(payout.requested_at), "d MMMM yyyy", { locale: idLocale })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3.5">
                  <span
                    className={cn(
                      "w-24 rounded-[6px] border px-2 py-[5px] text-center text-mini font-semibold",
                      STATUS_CHIP[payout.status],
                    )}
                  >
                    {STATUS_LABEL[payout.status]}
                  </span>
                  <p className="numeric w-[110px] text-right text-ui font-semibold text-ink">
                    {rupiah(payout.amount)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}

const DAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

/**
 * "Ini yang brand lihat" and "Atur harga dan hari kerja" — the PROFIL tab.
 *
 * The first is a mirror: the host's own card, rendered the way a brand sees it
 * in search. A host tuning a price with no idea what the result looks like is
 * guessing, and the reference's line is the reason — a brand decides in seconds
 * on three things, and two of them are on that card.
 *
 * The second SHOWS the two settings and links to where they are edited. It does
 * not re-implement either form: the price field in /settings enforces a change
 * window and a min/max band and writes `streamer_price_history`, and the day
 * grid in /streamer-schedule carries start/end times, day-offs and a conflict
 * check against accepted bookings. A second save button here would write past
 * all of that.
 *
 * `activeDays` is 0=Senin … 6=Minggu. Omitted means "the caller has not loaded
 * the schedule" — which renders as a stated absence, never as seven off days.
 */
export function ListingSections({
  index,
  price,
  rating,
  city,
  platforms,
  imageUrl,
  name,
  isVerified,
  sessionCount,
  activeDays,
}: {
  index: number;
  price: number | null;
  rating: number | null;
  city: string;
  platforms: string[];
  imageUrl: string | null;
  name: string;
  isVerified: boolean;
  sessionCount?: number | null;
  activeDays?: number[] | null;
}) {
  // The brand-facing figure, always through the pricing module — a re-typed 1.3
  // here is how the card and the checkout drift apart.
  const brandPays = price ? subtotalWithPlatformFee(price) : null;

  const ratingLine = [
    rating && rating > 0 ? `★ ${rating.toFixed(1)}` : null,
    typeof sessionCount === "number" && sessionCount > 0 ? `${sessionCount} sesi` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {/* ── 1 · Ini yang brand lihat ───────────────────────────────────────── */}
      <section>
        <SectionHead
          number={index}
          title="Ini yang brand lihat"
          note="Kartu kamu di hasil pencarian"
        />

        <div className="flex flex-wrap items-center gap-[26px] rounded-frame border border-hairline bg-surface p-6">
          <div className="w-[150px] shrink-0 overflow-hidden rounded-[10px] border border-hairline">
            <div
              className="w-full bg-surface-tint bg-cover bg-[center_top]"
              style={{
                aspectRatio: "4 / 5",
                backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
              }}
            />
            <div className="px-[13px] py-3">
              <p className="numeric mb-0.5 text-title font-semibold text-ink">
                {brandPays ? rupiah(brandPays) : "Belum diatur"}
              </p>
              <p className="mb-2 text-tiny tracking-normal text-ink-faint">per jam</p>
              <p className="mb-0.5 truncate text-meta font-semibold text-ink">{name}</p>
              <p className="numeric truncate text-[11.5px] text-ink-soft">
                {ratingLine || "Belum ada rating"}
              </p>
            </div>
          </div>

          <div className="min-w-0 flex-[1_1_260px]">
            <p className="mb-[18px] max-w-[52ch] text-ui leading-[1.65] text-ink-muted">
              Brand memutuskan dalam hitungan detik. Tiga hal yang paling menentukan: harga,
              rating, dan seberapa cepat kamu membalas.
            </p>
            <div className="flex flex-wrap gap-2.5">
              {isVerified && (
                <span className="rounded-[7px] border border-positive-line bg-positive-tint px-[13px] py-2 text-meta font-medium text-positive">
                  ✓ Terverifikasi
                </span>
              )}
              {platforms.length > 0 && (
                <span className="rounded-[7px] border border-hairline bg-surface px-[13px] py-2 text-meta font-medium text-ink-body">
                  {platforms.join(" & ")}
                </span>
              )}
              {city && (
                <span className="rounded-[7px] border border-hairline bg-surface px-[13px] py-2 text-meta font-medium text-ink-body">
                  {city}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── 2 · Atur harga dan hari kerja ──────────────────────────────────── */}
      <section>
        <SectionHead
          number={index + 1}
          title="Atur harga dan hari kerja"
          note="Diubah di pengaturan"
        />

        <div className="overflow-hidden rounded-frame border border-hairline bg-surface">
          <div className="flex flex-wrap gap-8 px-7 py-[26px]">
            <div className="min-w-0 flex-[1_1_280px]">
              <p className="mb-1 text-copy font-semibold text-ink">Tarif dasar per jam</p>
              <p className="mb-3 text-meta text-ink-soft">
                Ini yang kamu terima. Salda menambah 30% di atasnya.
              </p>
              <div className="flex h-12 w-[200px] items-center rounded-lg border border-hairline-input bg-surface px-3.5 font-mono text-[16px] text-ink">
                {price ? rupiah(price) : "Belum diatur"}
              </div>
              <div className="mt-3.5 flex max-w-[340px] items-center gap-2.5 rounded-lg border border-brand-line bg-brand-wash px-3.5 py-3">
                <span className="text-meta text-brand-deep">Brand membayar</span>
                <span className="numeric ml-auto text-[15px] font-medium text-brand-deep">
                  {brandPays ? rupiah(brandPays) : "—"}
                </span>
              </div>
            </div>

            <div className="min-w-0 flex-[1_1_280px]">
              <p className="mb-1 text-copy font-semibold text-ink">Hari kamu siap live</p>
              <p className="mb-3 text-meta text-ink-soft">
                Brand hanya bisa memesan di hari yang kamu nyalakan.
              </p>

              {activeDays == null ? (
                <div className="rounded-lg border border-dashed border-hairline-input px-4 py-5">
                  <p className="text-meta text-ink-soft">
                    Hari aktif kamu tersimpan di halaman jadwal. Buka jadwal untuk melihat dan
                    mengubahnya.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {DAY_LABELS.map((label, day) => {
                      const on = activeDays.includes(day);
                      return (
                        <span
                          key={label}
                          className={cn(
                            "flex h-12 w-12 items-center justify-center rounded-lg border text-meta font-semibold",
                            on
                              ? "border-ink bg-ink text-white"
                              : "border-hairline-input bg-surface text-ink-body",
                          )}
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                  <p
                    className={cn(
                      "mt-3 text-meta",
                      activeDays.length > 0 ? "text-ink-soft" : "text-caution",
                    )}
                  >
                    {activeDays.length > 0
                      ? `${activeDays.length} hari aktif tiap minggu`
                      : "Belum ada hari aktif — brand tidak bisa memesan kamu."}
                  </p>
                </>
              )}
            </div>
          </div>

          <FooterBar note="Perubahan berlaku untuk booking baru. Sesi yang sudah dipesan tidak berubah.">
            <Link href="/streamer-schedule" className={SECONDARY_BUTTON}>
              Atur jadwal
            </Link>
            <Link
              href="/settings?type=streamer"
              className={cn(PRIMARY_BUTTON, "bg-ink hover:bg-brand")}
            >
              Ubah tarif
            </Link>
          </FooterBar>
        </div>
      </section>
    </>
  );
}

/**
 * "Performa kamu" — the three numbers the listing section says a brand decides
 * on, measured rather than asserted.
 *
 * Response time is deliberately absent: nothing in this schema records when a
 * host answered a request, so any figure here would be invented. The reference
 * shows "Balas < 2 jam" on the card and "Waktu balas rata-rata" here; that claim
 * needs a real measurement behind it before it goes on screen.
 *
 * A bar is drawn only where a real 0–100 proportion exists. Counts get the
 * figure and the note, and no bar pretending to be out of something.
 */
export function PerformanceSection({
  index,
  bookings,
  rating,
}: {
  index: number;
  bookings: Booking[];
  rating: number | null;
}) {
  const stats = useMemo(() => {
    const since = subDays(new Date(), 30);
    const recent = bookings.filter((b) => new Date(b.start_time) >= since);
    const answered = recent.filter((b) => b.status !== "pending").length;
    const accepted = recent.filter((b) =>
      ["accepted", "live", "completed"].includes(b.status),
    ).length;
    const completed = bookings.filter((b) => b.status === "completed").length;
    const hours = bookings
      .filter((b) => b.status === "completed")
      .reduce((sum, b) => {
        const ms = new Date(b.end_time).getTime() - new Date(b.start_time).getTime();
        return sum + Math.max(ms / 3_600_000, 0);
      }, 0);

    return {
      acceptRate: answered > 0 ? Math.round((accepted / answered) * 100) : null,
      accepted,
      answered,
      completed,
      hours: Math.round(hours),
    };
  }, [bookings]);

  const metrics: {
    label: string;
    value: string;
    note: string;
    width: number | null;
    accent: "brand" | "positive";
  }[] = [
    {
      label: "Tingkat terima",
      value: stats.acceptRate === null ? "—" : `${stats.acceptRate}%`,
      note:
        stats.answered > 0
          ? `${stats.accepted} dari ${stats.answered} permintaan 30 hari terakhir kamu terima.`
          : "Belum ada permintaan yang kamu jawab dalam 30 hari terakhir.",
      width: stats.acceptRate,
      accent: "brand",
    },
    {
      label: "Rating dari brand",
      value: rating && rating > 0 ? rating.toFixed(1) : "—",
      note:
        rating && rating > 0
          ? "Rata-rata penilaian brand setelah sesi selesai."
          : "Belum ada brand yang menilai kamu.",
      width: rating && rating > 0 ? Math.round((rating / 5) * 100) : null,
      accent: "positive",
    },
    {
      label: "Sesi selesai",
      value: String(stats.completed),
      note: `Sepanjang waktu · ${stats.hours} jam siaran.`,
      width: null,
      accent: "brand",
    },
  ];

  return (
    <section>
      <SectionHead
        number={index}
        title="Performa kamu"
        note="Dihitung dari sesi kamu"
        tone="quiet"
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-7 rounded-frame border border-hairline bg-surface p-6">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-ink-muted">{metric.label}</span>
              <span className="numeric text-lede font-semibold text-ink">{metric.value}</span>
            </div>
            {metric.width !== null && (
              <span className="block h-1.5 overflow-hidden rounded-[3px] bg-hairline-soft">
                <span
                  className={cn(
                    "block h-full rounded-[3px]",
                    metric.accent === "positive" ? "bg-positive" : "bg-brand",
                  )}
                  style={{
                    width: `${Math.max(metric.width, 2)}%`,
                    transformOrigin: "bottom",
                    animation: "h-grow .6s cubic-bezier(.16,1,.3,1) both",
                  }}
                />
              </span>
            )}
            <p className="mt-[9px] text-mini text-ink-faint">{metric.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
