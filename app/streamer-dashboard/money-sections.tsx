"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, isThisMonth, startOfWeek, subDays } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { ArrowRight, Loader2, Wallet } from "lucide-react";
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
 * and how to get it out.
 *
 * These four sections replace nothing — none of them existed. `streamer_payout_accounts`
 * has been collecting bank details since onboarding shipped, and there has never
 * been a balance, a ledger, or a way to ask for the money.
 *
 * Every rupiah on this screen is the HOST's share. `bookings.price` is what the
 * brand paid, fee and tax included, and the two are 44% apart — the earnings
 * chart shipped once quoting the wrong one. The division happens in
 * `baseFromTotal` here and in `salda_host_earnings()` in the database, and the
 * two must agree.
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

/** Section chrome, shared with the numbered sections above it on the page. */
function MoneySection({
  index,
  title,
  description,
  children,
  action,
}: {
  index: number;
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-panel border border-hairline bg-surface">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline-soft px-5 py-4">
        <span className="numeric text-mini font-semibold tracking-normal text-ink-ghost">
          {String(index).padStart(2, "0")}
        </span>
        <h2 className="font-serif text-title font-semibold text-ink">{title}</h2>
        {description && (
          <p className="w-full text-meta text-ink-soft sm:w-auto sm:flex-1">{description}</p>
        )}
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * "Uang yang bisa kamu ambil sekarang" + "Riwayat pembayaran".
 *
 * One component because they read the same two queries and a withdrawal has to
 * refresh both — splitting them would mean either two round trips or a shared
 * parent that exists only to hold the state.
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
   * biggest first. Computed from the bookings the page already loaded, so it
   * costs no query.
   */
  const topBrands = useMemo(() => {
    const totals = new Map<string, number>();
    for (const booking of bookings) {
      if (booking.status !== "completed") continue;
      if (!isThisMonth(new Date(booking.start_time))) continue;
      const brand = `${booking.client_first_name} ${booking.client_last_name}`.trim() || "Brand";
      totals.set(brand, (totals.get(brand) ?? 0) + baseFromTotal(booking.price));
    }
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [bookings]);

  const monthTotal = topBrands.reduce((sum, [, value]) => sum + value, 0);

  const STATUS_LABEL: Record<PayoutRow["status"], string> = {
    pending: "Menunggu diproses",
    processing: "Sedang diproses",
    paid: "Sudah cair",
    rejected: "Ditolak",
    cancelled: "Dibatalkan",
  };

  return (
    <>
      <MoneySection
        index={index}
        title="Uang yang bisa kamu ambil sekarang"
        description="Dana tertahan cair otomatis setelah sesi selesai."
      >
        <div className="grid grid-cols-1 gap-px bg-hairline-soft sm:grid-cols-3">
          {[
            { label: "Selesai, siap cair", value: balance?.available, tone: "positive" as const },
            { label: "Tertahan", value: balance?.held, tone: "muted" as const },
            { label: "Total di Salda", value: balance?.lifetime, tone: "muted" as const },
          ].map((tile) => (
            <div key={tile.label} className="bg-surface px-5 py-4">
              <p className="text-mini text-ink-soft">{tile.label}</p>
              <p
                className={cn(
                  "numeric mt-1 text-price font-semibold",
                  tile.tone === "positive" ? "text-positive" : "text-ink",
                )}
              >
                {balance === null ? "—" : rupiah(tile.value ?? 0)}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-copy text-ink-body">
              {balance && balance.available > 0
                ? "Dana masuk ke rekening kamu dalam 1×24 jam kerja. Tidak ada biaya penarikan."
                : "Belum ada dana yang bisa dicairkan. Saldo bertambah setiap sesi selesai."}
            </p>
            <p className="mt-1 text-meta text-ink-soft">
              Pencairan otomatis berjalan tiap Senin. Kamu juga bisa tarik kapan saja.
            </p>
          </div>

          <div className="ml-auto flex shrink-0 flex-nowrap gap-3 max-sm:w-full">
            <Link
              href="/streamer-setup/rekening"
              className="inline-flex h-[46px] w-full items-center justify-center rounded-lg border
                border-hairline-input bg-surface px-4 text-copy font-medium text-ink-muted
                transition-colors hover:bg-surface-raised hover:text-ink sm:w-[168px]"
            >
              Ubah rekening
            </Link>
            <button
              type="button"
              onClick={handleWithdraw}
              disabled={!balance || balance.available <= 0 || isWithdrawing}
              className="inline-flex h-[46px] w-full items-center justify-center gap-2 rounded-lg
                bg-brand px-4 text-ui font-semibold text-white transition-colors
                hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-[220px]"
            >
              {isWithdrawing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Mengirim…
                </>
              ) : (
                <>
                  <Wallet className="h-4 w-4" />
                  {balance && balance.available > 0
                    ? `Tarik ${rupiah(balance.available)}`
                    : "Tarik saldo"}
                </>
              )}
            </button>
          </div>
        </div>
      </MoneySection>

      <MoneySection
        index={index + 1}
        title="Dari mana uangnya bulan ini"
        description={format(new Date(), "MMMM yyyy", { locale: idLocale })}
      >
        {topBrands.length === 0 ? (
          <p className="px-5 py-10 text-center text-meta text-ink-soft">
            Belum ada sesi selesai bulan ini.
          </p>
        ) : (
          <div className="px-5 py-5">
            <p className="text-mini text-ink-soft">Lima brand teratas</p>
            <ul className="mt-3 flex flex-col gap-3">
              {topBrands.map(([brand, value]) => (
                <li key={brand}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-copy text-ink">{brand}</span>
                    <span className="numeric shrink-0 text-copy font-medium text-ink">
                      {rupiah(value)}
                    </span>
                  </div>
                  {/* Proportion of the month, not an absolute scale — the
                      question this answers is "who is my business", and a bar
                      scaled to the biggest brand answers it at a glance. */}
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-chip bg-surface-deep">
                    <div
                      className="h-full rounded-chip bg-brand"
                      style={{
                        width: `${monthTotal > 0 ? Math.max((value / monthTotal) * 100, 2) : 0}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </MoneySection>

      <MoneySection index={index + 2} title="Riwayat pembayaran">
        {payouts.length === 0 ? (
          <p className="px-5 py-10 text-center text-meta text-ink-soft">
            Belum ada penarikan.
          </p>
        ) : (
          <ul>
            {payouts.map((payout) => (
              <li
                key={payout.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline-soft px-5 py-4 first:border-t-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="numeric text-copy font-medium text-ink">
                    {rupiah(payout.amount)}
                  </p>
                  <p className="mt-0.5 truncate text-mini text-ink-soft">
                    {format(new Date(payout.requested_at), "d MMM yyyy", { locale: idLocale })}
                    {payout.bank_name && ` · ${payout.bank_name} ${payout.account_number_masked ?? ""}`}
                  </p>
                </div>
                {/* Status is text, not a filled pill. */}
                <span
                  className={cn(
                    "shrink-0 text-meta font-medium",
                    payout.status === "paid" && "text-positive",
                    payout.status === "rejected" && "text-critical",
                    (payout.status === "pending" || payout.status === "processing") &&
                      "text-caution",
                    payout.status === "cancelled" && "text-ink-soft",
                  )}
                >
                  {STATUS_LABEL[payout.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </MoneySection>
    </>
  );
}

/**
 * "Ini yang brand lihat" and "Atur harga dan hari kerja".
 *
 * The first is a mirror: the host's own card, rendered the way a brand sees it
 * in search. A host tuning a price with no idea what the result looks like is
 * guessing, and the reference's line is the reason — a brand decides in seconds
 * on three things, and two of them are on that card.
 *
 * The second does not duplicate the settings screens. It shows the two numbers
 * that matter and links to where they are edited, because a dashboard that
 * re-implements a form is a second form to keep in sync.
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
}: {
  index: number;
  price: number | null;
  rating: number | null;
  city: string;
  platforms: string[];
  imageUrl: string | null;
  name: string;
  isVerified: boolean;
}) {
  const brandPays = price ? subtotalWithPlatformFee(price) : null;

  return (
    <>
      <MoneySection
        index={index}
        title="Ini yang brand lihat"
        description="Kartu kamu di hasil pencarian"
      >
        <p className="border-b border-hairline-soft px-5 py-3.5 text-meta text-ink-soft">
          Brand memutuskan dalam hitungan detik. Tiga hal yang paling menentukan:
          harga, rating, dan seberapa cepat kamu membalas.
        </p>
        <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row">
          <div className="w-full max-w-[220px] overflow-hidden rounded-panel border border-hairline bg-surface">
            <div
              className="w-full bg-surface-tint bg-cover bg-center"
              style={{ aspectRatio: "4 / 5", backgroundImage: imageUrl ? `url(${imageUrl})` : undefined }}
            />
            <div className="flex flex-col gap-2.5 px-4 pb-4 pt-3.5">
              <div className="flex flex-wrap items-baseline gap-1.5">
                <span className="numeric text-price font-semibold text-ink">
                  {brandPays ? rupiah(brandPays) : "Harga belum diatur"}
                </span>
                {brandPays && <span className="text-mini text-ink-soft">/ jam</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-ui font-medium text-ink">{name}</span>
                {isVerified && (
                  <span className="shrink-0 rounded-chip border border-positive-line bg-positive-tint px-1.5 py-px text-micro font-semibold tracking-normal text-positive">
                    ✓ Terverifikasi
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1 text-meta text-ink-body">
                <span className="truncate">{city || "Lokasi belum diatur"}</span>
                <span className="numeric">
                  {rating && rating > 0 ? `★ ${rating.toFixed(1)}` : "Belum ada rating"}
                </span>
                {platforms.length > 0 && (
                  <span className="truncate">{platforms.join(" & ")}</span>
                )}
              </div>
            </div>
          </div>

          <p className="max-w-[42ch] text-copy leading-relaxed text-ink-muted">
            Brand memutuskan dalam hitungan detik. Tiga hal yang paling menentukan: harga,
            rating, dan seberapa cepat kamu membalas.
          </p>
        </div>
      </MoneySection>

      <MoneySection index={index + 1} title="Atur harga dan hari kerja">
        <div className="grid grid-cols-1 gap-px bg-hairline-soft sm:grid-cols-2">
          <div className="bg-surface px-5 py-5">
            <p className="text-copy font-medium text-ink">Tarif dasar per jam</p>
            <p className="numeric mt-2 text-price font-semibold text-ink">
              {price ? rupiah(price) : "Belum diatur"}
            </p>
            <p className="mt-1 text-meta text-ink-soft">
              Ini yang kamu terima. Salda menambah 30% di atasnya.
            </p>
            {brandPays && (
              <p className="numeric mt-2 text-copy text-ink-body">
                Brand membayar {rupiah(brandPays)}
              </p>
            )}
            <Link
              href="/settings?type=streamer"
              className="mt-4 inline-flex items-center gap-1.5 text-copy font-medium text-brand transition-colors hover:text-brand-hover"
            >
              Ubah tarif <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="bg-surface px-5 py-5">
            <p className="text-copy font-medium text-ink">Hari kamu siap live</p>
            <p className="mt-2 text-meta text-ink-soft">
              Brand hanya bisa memesan di hari yang kamu nyalakan.
            </p>
            <p className="mt-2 text-meta text-ink-soft">
              Perubahan berlaku untuk booking baru. Sesi yang sudah dipesan tidak berubah.
            </p>
            <Link
              href="/streamer-schedule"
              className="mt-4 inline-flex items-center gap-1.5 text-copy font-medium text-brand transition-colors hover:text-brand-hover"
            >
              Atur jadwal <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </MoneySection>
    </>
  );
}

/**
 * "Performa kamu" — the three numbers the listing section says a brand decides
 * on, measured rather than asserted.
 *
 * Response time is deliberately absent: nothing in this schema records when a
 * host answered a request, so any figure here would be invented. The reference
 * shows "Balas < 2 jam" on the card; that claim needs a real measurement behind
 * it before it goes on screen.
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
      completed,
      hours: Math.round(hours),
    };
  }, [bookings]);

  return (
    <MoneySection
      index={index}
      title="Performa kamu"
      description="Dihitung dari sesi kamu, bukan perkiraan."
    >
      <div className="grid grid-cols-1 gap-px bg-hairline-soft sm:grid-cols-4">
        {[
          {
            label: "Rating",
            value: rating && rating > 0 ? rating.toFixed(1) : "—",
            hint: rating && rating > 0 ? "dari brand" : "belum ada rating",
          },
          {
            label: "Diterima",
            value: stats.acceptRate === null ? "—" : `${stats.acceptRate}%`,
            hint: "30 hari terakhir",
          },
          { label: "Sesi selesai", value: String(stats.completed), hint: "sepanjang waktu" },
          { label: "Jam siaran", value: String(stats.hours), hint: "sepanjang waktu" },
        ].map((stat) => (
          <div key={stat.label} className="bg-surface px-5 py-4">
            <p className="text-mini text-ink-soft">{stat.label}</p>
            <p className="numeric mt-1 text-price font-semibold text-ink">{stat.value}</p>
            <p className="mt-0.5 text-micro tracking-normal text-ink-faint">{stat.hint}</p>
          </div>
        ))}
      </div>
    </MoneySection>
  );
}
