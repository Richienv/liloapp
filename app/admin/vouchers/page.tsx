"use client";

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { toast } from 'react-hot-toast';
import { Loader2, Search, X, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { createVoucher } from './actions'

interface BaseVoucher {
  id: string;
  code: string;
  description: string;
  discount_amount: number;
  total_quantity: number;
  remaining_quantity: number;
  is_active: boolean;
  expires_at: string;
  created_at: string;
}

interface Voucher extends BaseVoucher {}

interface VoucherUsage {
  id: string;
  voucher_id: string;
  booking_id: number;
  user_id: string;
  discount_applied: number;
  original_price: number;
  final_price: number;
  used_at: string;
  client?: {
    first_name: string;
    last_name: string;
  };
  streamer?: {
    id: number;
    first_name: string;
    last_name: string;
    image_url?: string;
  };
}

interface VoucherAnalytics {
  total_vouchers_created: number;
  total_vouchers_used: number;
  total_discount_amount: number;
  usage_ratio: number;
  top_streamers: StreamerVoucherUsage[];
  monthly_usage: MonthlyUsage[];
  usage_by_status: StatusUsage[];
}

interface StreamerVoucherUsage {
  streamer_id: number;
  first_name: string;
  last_name: string;
  image_url?: string;
  total_vouchers_used: number;
  total_discount_amount: number;
  usage_count: number;
}

interface MonthlyUsage {
  month: string;
  vouchers_used: number;
  total_discount: number;
}

interface StatusUsage {
  status: string;
  count: number;
  percentage: number;
}

interface VoucherWithAnalytics extends BaseVoucher {
  total_discount_amount: number;
  usage_count: number;
  usage_details: VoucherUsage[];
  analytics?: VoucherAnalytics;
}

/**
 * Form validation. The RULES are unchanged — they mirror the server's copy in
 * `./actions.ts`, which is the one that decides. Only the messages changed:
 * they are strings a person reads under a field, and every other message this
 * screen can show (including every error the server action returns) is in
 * Indonesian.
 */
const voucherFormSchema = z.object({
  code: z.string()
    .min(6, "Kode harus tepat 6 karakter")
    .max(6, "Kode harus tepat 6 karakter")
    .regex(/^[A-Z0-9]+$/, "Hanya huruf kapital dan angka"),
  description: z.string()
    .min(1, "Deskripsi wajib diisi")
    .max(100, "Deskripsi maksimal 100 karakter"),
  discount_amount: z.coerce.number()
    .min(1000, "Diskon minimal Rp 1.000")
    .max(10000000, "Diskon maksimal Rp 10.000.000"),
  total_quantity: z.coerce.number()
    .min(1, "Jumlah minimal 1")
    .max(1000, "Jumlah maksimal 1.000"),
  expires_at: z.string()
    .min(1, "Tanggal kadaluarsa wajib diisi")
    // The server rejects a non-future date, and today counts as past: a date-only
    // value is midnight UTC, which has already gone by everywhere in Indonesia.
    // Catching it here means the admin sees it under the field instead of as a
    // failed submit.
    .refine(
      (value) => !Number.isNaN(new Date(value).getTime()) && new Date(value).getTime() > Date.now(),
      "Tanggal kadaluarsa harus di masa depan"
    )
});

type FormData = z.infer<typeof voucherFormSchema>;

interface FieldRenderProps {
  field: {
    value: any;
    onChange: (value: any) => void;
    name: string;
    onBlur: () => void;
    ref: React.Ref<any>;
  };
}

/**
 * A percentage that is safe to render and safe to set a width from.
 *
 * `usage_ratio` is `used / total * 100`, and `total` is a sum of quantities
 * that is legitimately 0 before any voucher exists — which rendered the string
 * "NaN%" and a bar with `width: NaN%`. Values above 100 are possible too when a
 * voucher is redeemed more often than its stock; a 140%-wide bar overflows its
 * track and paints over the next row.
 */
function safePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/** Rupiah, Indonesian separators, tabular figures at the call site. */
const formatCurrency = (amount: number | undefined): string => {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return 'Rp 0';
  return `Rp ${Math.round(amount).toLocaleString('id-ID')}`;
};

/**
 * A labelled figure. Mono eyebrow, tabular value, one sentence of context —
 * the same three lines the funnel summary uses, so the two admin screens that
 * report numbers report them the same way.
 */
function StatCell({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="p-5 shadow-cell">
      <p className="font-mono text-tiny uppercase text-ink-ghost">{label}</p>
      <p className="numeric mt-2 text-price font-semibold text-ink">{value}</p>
      <p className="mt-1 text-mini text-ink-soft">{hint}</p>
    </div>
  );
}

/** One labelled bar. Ink on a quiet track — a bar is data, not an accent. */
function MeterRow({
  label,
  value,
  percent,
}: {
  label: string;
  value: string;
  percent: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-copy text-ink-body">{label}</span>
        <span className="numeric shrink-0 text-mini text-ink-soft">{value}</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-pill bg-surface-deep">
        <div
          className="h-full rounded-pill bg-ink"
          style={{ width: `${safePercent(percent)}%` }}
        />
      </div>
    </div>
  );
}

function PanelHeading({ index, title }: { index: string; title: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline-soft px-5 py-4">
      <span className="numeric font-mono text-mini font-semibold text-ink-ghost">
        {index}
      </span>
      <h2 className="font-serif text-title font-semibold text-ink">{title}</h2>
    </div>
  );
}

/**
 * The three headline figures used to be titled "Operations", "Types" and
 * "Fields" — labels from some other template entirely, sitting over values that
 * meant redeemed, issued and discounted. Each card also set its colour with
 * `text-${stat.color}-600`, a class Tailwind cannot see at build time, so the
 * numbers rendered in inherited black regardless. The labels now say what the
 * number below them actually counts.
 */
function AnalyticsDashboard({ analytics }: { analytics: VoucherAnalytics }) {
  const monthlyPeak = analytics.monthly_usage.length
    ? Math.max(...analytics.monthly_usage.map((m) => m.vouchers_used))
    : 0;

  return (
    <div className="mb-6 space-y-5">
      <div className="grid grid-cols-1 overflow-hidden rounded-frame border border-hairline bg-surface md:grid-cols-3">
        <StatCell
          label="Voucher terpakai"
          value={analytics.total_vouchers_used.toLocaleString('id-ID')}
          hint="Sudah ditukar di checkout"
        />
        <StatCell
          label="Voucher diterbitkan"
          value={analytics.total_vouchers_created.toLocaleString('id-ID')}
          hint="Total kuota semua kode"
        />
        <StatCell
          label="Total diskon"
          value={formatCurrency(analytics.total_discount_amount)}
          hint="Nilai yang sudah dipotong dari brand"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="overflow-hidden rounded-frame border border-hairline bg-surface">
          <PanelHeading index="01" title="Statistik pemakaian" />
          <div className="space-y-6 px-5 py-5">
            <MeterRow
              label="Rasio pemakaian"
              value={`${Math.round(safePercent(analytics.usage_ratio))}%`}
              percent={analytics.usage_ratio}
            />

            <div>
              <h3 className="font-mono text-tiny uppercase text-ink-ghost">
                Sebaran status booking
              </h3>
              <div className="mt-3 space-y-3">
                {analytics.usage_by_status.length === 0 ? (
                  <p className="text-copy text-ink-soft">Belum ada pemakaian.</p>
                ) : (
                  analytics.usage_by_status.map((status) => (
                    <MeterRow
                      key={status.status}
                      label={status.status}
                      value={`${Math.round(safePercent(status.percentage))}%`}
                      percent={status.percentage}
                    />
                  ))
                )}
              </div>
            </div>

            <div>
              <h3 className="font-mono text-tiny uppercase text-ink-ghost">
                Pemakaian per bulan
              </h3>
              <div className="mt-3 space-y-2.5">
                {analytics.monthly_usage.length === 0 ? (
                  <p className="text-copy text-ink-soft">Belum ada pemakaian.</p>
                ) : (
                  analytics.monthly_usage.slice(0, 6).map((month) => (
                    <div key={month.month} className="flex items-center gap-3">
                      <div className="w-24 shrink-0 truncate text-mini text-ink-soft">
                        {month.month}
                      </div>
                      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-pill bg-surface-deep">
                        <div
                          className="h-full rounded-pill bg-ink"
                          style={{
                            width: `${safePercent(
                              monthlyPeak ? (month.vouchers_used / monthlyPeak) * 100 : 0,
                            )}%`,
                          }}
                        />
                      </div>
                      <div className="numeric w-16 shrink-0 text-right text-mini text-ink-soft">
                        {month.vouchers_used.toLocaleString('id-ID')}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-frame border border-hairline bg-surface">
          <PanelHeading index="02" title="Streamer dengan pemakaian terbanyak" />
          <div>
            {analytics.top_streamers.length === 0 ? (
              <p className="px-5 py-5 text-copy text-ink-soft">
                Belum ada voucher yang dipakai di sesi mana pun.
              </p>
            ) : (
              <ul>
                {analytics.top_streamers.slice(0, 5).map((streamer, index) => (
                  <li
                    key={streamer.streamer_id}
                    className="flex min-w-0 items-center gap-3 border-b border-hairline-soft px-5 py-3.5 transition-colors last:border-b-0 hover:bg-surface-raised"
                  >
                    {/*
                      A rank, not a medal. The first three rows used to carry
                      gold, silver and bronze discs — three more colours on a
                      screen whose rule is one accent, for information a mono
                      index carries on its own.
                    */}
                    <span className="numeric w-5 shrink-0 font-mono text-mini text-ink-ghost">
                      {String(index + 1).padStart(2, '0')}
                    </span>

                    <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-surface-tint">
                      {streamer.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={streamer.image_url}
                          alt={`${streamer.first_name} ${streamer.last_name}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-copy font-medium text-ink-soft">
                          {streamer.first_name?.[0] ?? '?'}
                        </span>
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-ui font-medium text-ink">
                        {streamer.first_name} {streamer.last_name}
                      </p>
                      <p className="truncate text-meta text-ink-soft">
                        <span className="numeric">{streamer.usage_count}</span>{' '}
                        voucher
                        <span className="text-ink-ghost"> · </span>
                        <span className="numeric">
                          {formatCurrency(streamer.total_discount_amount)}
                        </span>
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="numeric text-copy font-medium text-ink">
                        {Math.round(
                          safePercent(
                            analytics.total_vouchers_used
                              ? (streamer.usage_count / analytics.total_vouchers_used) * 100
                              : 0,
                          ),
                        )}
                        %
                      </p>
                      <p className="text-mini text-ink-ghost">dari total</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// Add helper function to create default analytics
const createDefaultVoucherWithAnalytics = (voucher: Voucher): VoucherWithAnalytics => ({
  ...voucher,
  total_discount_amount: 0,
  usage_count: 0,
  usage_details: [],
  analytics: {
    total_vouchers_created: voucher.total_quantity,
    total_vouchers_used: 0,
    total_discount_amount: 0,
    usage_ratio: 0,
    top_streamers: [],
    monthly_usage: [],
    usage_by_status: []
  }
});

// Add type guard helper
const isVoucherWithAnalytics = (voucher: any): voucher is VoucherWithAnalytics => {
  return (
    voucher &&
    typeof voucher.total_discount_amount === 'number' &&
    Array.isArray(voucher.usage_details) &&
    typeof voucher.usage_count === 'number'
  );
};

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<(Voucher | VoucherWithAnalytics)[]>([]);
  const [filteredVouchers, setFilteredVouchers] = useState<(Voucher | VoucherWithAnalytics)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [selectedVoucher, setSelectedVoucher] = useState<VoucherWithAnalytics | null>(null);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [globalAnalytics, setGlobalAnalytics] = useState<VoucherAnalytics | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(voucherFormSchema),
    defaultValues: {
      code: '',
      description: '',
      discount_amount: 0,
      total_quantity: 0,
      expires_at: ''
    }
  });

  useEffect(() => {
    fetchVouchers();
  }, []);

  useEffect(() => {
    filterVouchers();
  }, [searchQuery, statusFilter, vouchers]);

  const fetchVouchers = async () => {
    setIsLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      // First get all vouchers
      const { data: vouchersData, error: vouchersError } = await supabase
        .from('vouchers')
        .select('*')
        .order('created_at', { ascending: false });

      if (vouchersError) throw vouchersError;

      if (!vouchersData) {
        throw new Error('No data returned from Supabase');
      }

      // Then get usage data for each voucher with streamer information
      const vouchersWithAnalytics = await Promise.all(
        vouchersData.map(async (voucher) => {
          const { data: usageData, error: usageError } = await supabase
            .from('voucher_usage')
            .select(`
              *,
              client:user_id (
                first_name,
                last_name
              ),
              booking:booking_id (
                streamer:streamer_id (
                  id,
                  first_name,
                  last_name,
                  image_url
                )
              )
            `)
            .eq('voucher_id', voucher.id);

          if (usageError) throw usageError;

          const usage = usageData || [];
          const totalDiscount = usage.reduce((sum, u) => sum + u.discount_applied, 0);

          // Process streamer usage statistics
          const streamerUsage = usage.reduce((acc: { [key: number]: StreamerVoucherUsage }, u) => {
            const streamerId = u.booking?.streamer?.id;
            if (streamerId) {
              if (!acc[streamerId]) {
                acc[streamerId] = {
                  streamer_id: streamerId,
                  first_name: u.booking.streamer.first_name,
                  last_name: u.booking.streamer.last_name,
                  image_url: u.booking.streamer.image_url,
                  total_vouchers_used: 0,
                  total_discount_amount: 0,
                  usage_count: 0
                };
              }
              acc[streamerId].total_vouchers_used++;
              acc[streamerId].total_discount_amount += u.discount_applied;
              acc[streamerId].usage_count++;
            }
            return acc;
          }, {});

          // Calculate monthly usage
          const monthlyUsage = usage.reduce((acc: { [key: string]: MonthlyUsage }, u) => {
            const month = new Date(u.used_at).toLocaleString('default', { month: 'long', year: 'numeric' });
            if (!acc[month]) {
              acc[month] = {
                month,
                vouchers_used: 0,
                total_discount: 0
              };
            }
            acc[month].vouchers_used++;
            acc[month].total_discount += u.discount_applied;
            return acc;
          }, {});

          // Calculate status distribution
          const statusCount = usage.reduce((acc: { [key: string]: number }, u) => {
            const status = u.booking?.status || 'unknown';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
          }, {});

          const totalUsage = usage.length;
          const statusUsage: StatusUsage[] = Object.entries(statusCount).map(([status, count]) => ({
            status,
            count,
            percentage: (count / totalUsage) * 100
          }));

          const analytics: VoucherAnalytics = {
            total_vouchers_created: voucher.total_quantity,
            total_vouchers_used: usage.length,
            total_discount_amount: totalDiscount,
            usage_ratio: (usage.length / voucher.total_quantity) * 100,
            top_streamers: Object.values(streamerUsage).sort((a, b) => b.total_discount_amount - a.total_discount_amount),
            monthly_usage: Object.values(monthlyUsage).sort((a, b) =>
              new Date(b.month).getTime() - new Date(a.month).getTime()
            ),
            usage_by_status: statusUsage
          };

          return {
            ...voucher,
            total_discount_amount: totalDiscount,
            usage_count: usage.length,
            usage_details: usage,
            analytics
          };
        })
      );

      // Calculate global analytics
      const globalAnalytics: VoucherAnalytics = {
        total_vouchers_created: vouchersWithAnalytics.reduce((sum, v) => sum + v.total_quantity, 0),
        total_vouchers_used: vouchersWithAnalytics.reduce((sum, v) => sum + v.usage_count, 0),
        total_discount_amount: vouchersWithAnalytics.reduce((sum, v) => sum + v.total_discount_amount, 0),
        usage_ratio: vouchersWithAnalytics.reduce((sum, v) => sum + v.usage_count, 0) /
                    vouchersWithAnalytics.reduce((sum, v) => sum + v.total_quantity, 0) * 100,
        top_streamers: calculateGlobalTopStreamers(vouchersWithAnalytics),
        monthly_usage: calculateGlobalMonthlyUsage(vouchersWithAnalytics),
        usage_by_status: calculateGlobalStatusUsage(vouchersWithAnalytics)
      };

      setVouchers(vouchersWithAnalytics);
      setFilteredVouchers(vouchersWithAnalytics);
      setGlobalAnalytics(globalAnalytics);
    } catch (error) {
      console.error('Error fetching vouchers:', error);
      setError(error instanceof Error ? error.message : 'Gagal memuat voucher');
      toast.error('Gagal memuat voucher');
    } finally {
      setIsLoading(false);
    }
  };

  const filterVouchers = () => {
    let filtered = [...vouchers];

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(voucher =>
        voucher.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        voucher.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(voucher =>
        statusFilter === 'active' ? voucher.is_active : !voucher.is_active
      );
    }

    setFilteredVouchers(filtered);
  };

  // Creation goes through the server action, never the browser client: `vouchers`
  // has RLS on with no insert policy, and an admin-gated service-role write is
  // the only path that both works and cannot be replayed by whoever holds the
  // anon key. See app/admin/vouchers/actions.ts.
  const handleCreateVoucher = async (data: FormData) => {
    if (isCreating) return;

    setIsCreating(true);
    setError(null);

    try {
      const result = await createVoucher({
        code: data.code.toUpperCase(),
        description: data.description,
        discount_amount: data.discount_amount,
        total_quantity: data.total_quantity,
        expires_at: data.expires_at
      });

      if (!result.success || !result.voucher) {
        const message = result.error || 'Gagal membuat voucher';
        setError(message);
        toast.error(message);
        return;
      }

      // Initialize the new voucher with analytics
      const newVoucherWithAnalytics = createDefaultVoucherWithAnalytics(result.voucher);
      setVouchers(prev => [newVoucherWithAnalytics, ...prev]);
      toast.success('Voucher berhasil dibuat');
      form.reset();
    } catch (error) {
      console.error('Error creating voucher:', error);
      setError(error instanceof Error ? error.message : 'Gagal membuat voucher');
      toast.error('Gagal membuat voucher');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRetry = () => {
    fetchVouchers();
  };

  function VoucherAnalyticsModal({
    voucher,
    isOpen,
    onClose
  }: {
    voucher: VoucherWithAnalytics;
    isOpen: boolean;
    onClose: () => void;
  }) {
    if (!isOpen) return null;

    // Safe access helpers
    const getUsageCount = () => voucher.usage_count || 0;
    const getTotalQuantity = () => voucher.total_quantity || 0;
    const getTotalDiscount = () => voucher.total_discount_amount || 0;
    const getUsageRatio = () => {
      const count = getUsageCount();
      const total = getTotalQuantity();
      return total > 0 ? Math.round((count / total) * 100) : 0;
    };

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
        onClick={onClose}
      >
        <div
          className="max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-frame border border-hairline bg-surface"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
            <div className="min-w-0">
              <p className="font-mono text-tiny uppercase text-ink-ghost">
                Detail voucher
              </p>
              <h2 className="mt-1 truncate font-serif text-title font-semibold text-ink">
                <span className="numeric font-mono">{voucher.code}</span>
              </h2>
              <p className="mt-1 truncate text-meta text-ink-soft">
                {voucher.description}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-field text-ink-ghost transition-colors hover:bg-surface-tint hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-5">
            {/* Summary */}
            <div className="grid grid-cols-1 overflow-hidden rounded-frame border border-hairline bg-surface sm:grid-cols-2 lg:grid-cols-4">
              <StatCell
                label="Terpakai"
                value={`${getUsageCount().toLocaleString('id-ID')}/${getTotalQuantity().toLocaleString('id-ID')}`}
                hint="Dari kuota yang diterbitkan"
              />
              <StatCell
                label="Total diskon"
                value={formatCurrency(getTotalDiscount())}
                hint="Sudah dipotong dari brand"
              />
              <StatCell
                label="Rata-rata diskon"
                value={formatCurrency(
                  getUsageCount() ? Math.round(getTotalDiscount() / getUsageCount()) : 0,
                )}
                hint="Per sekali pakai"
              />
              <StatCell
                label="Rasio pemakaian"
                value={`${getUsageRatio()}%`}
                hint="Terpakai dibagi kuota"
              />
            </div>

            {/* Usage History */}
            <div className="mt-5 overflow-hidden rounded-frame border border-hairline bg-surface">
              <PanelHeading index="01" title="Riwayat pemakaian" />
              <Table>
                <TableHeader>
                  <TableRow className="border-hairline hover:bg-transparent">
                    <TableHead className="h-10 font-mono text-tiny uppercase text-ink-ghost">
                      Pengguna
                    </TableHead>
                    <TableHead className="h-10 font-mono text-tiny uppercase text-ink-ghost">
                      Tanggal
                    </TableHead>
                    <TableHead className="h-10 text-right font-mono text-tiny uppercase text-ink-ghost">
                      Harga awal
                    </TableHead>
                    <TableHead className="h-10 text-right font-mono text-tiny uppercase text-ink-ghost">
                      Diskon
                    </TableHead>
                    <TableHead className="h-10 text-right font-mono text-tiny uppercase text-ink-ghost">
                      Harga akhir
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {voucher.usage_details && voucher.usage_details.length > 0 ? (
                    voucher.usage_details.map((usage) => (
                      <TableRow
                        key={usage.id}
                        className="border-hairline-soft transition-colors hover:bg-surface-raised"
                      >
                        <TableCell className="whitespace-nowrap px-4 py-3 text-copy text-ink">
                          {usage.client ? `${usage.client.first_name} ${usage.client.last_name}` : 'Pengguna tidak diketahui'}
                        </TableCell>
                        <TableCell className="numeric whitespace-nowrap px-4 py-3 text-copy text-ink-soft">
                          {format(new Date(usage.used_at), 'dd MMM yyyy HH:mm', { locale: idLocale })}
                        </TableCell>
                        <TableCell className="numeric whitespace-nowrap px-4 py-3 text-right text-copy text-ink-soft">
                          {formatCurrency(usage.original_price)}
                        </TableCell>
                        <TableCell className="numeric whitespace-nowrap px-4 py-3 text-right text-copy text-ink-body">
                          −{formatCurrency(usage.discount_applied)}
                        </TableCell>
                        <TableCell className="numeric whitespace-nowrap px-4 py-3 text-right text-copy font-medium text-ink">
                          {formatCurrency(usage.final_price)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow className="border-hairline-soft hover:bg-transparent">
                      <TableCell colSpan={5} className="px-4 py-10 text-center text-copy text-ink-soft">
                        Voucher ini belum pernah dipakai.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Helper functions for global analytics
  const calculateGlobalTopStreamers = (vouchers: VoucherWithAnalytics[]): StreamerVoucherUsage[] => {
    const streamerMap = new Map<number, StreamerVoucherUsage>();

    vouchers.forEach(voucher => {
      voucher.analytics?.top_streamers.forEach(streamer => {
        const existing = streamerMap.get(streamer.streamer_id);
        if (existing) {
          existing.total_vouchers_used += streamer.total_vouchers_used;
          existing.total_discount_amount += streamer.total_discount_amount;
          existing.usage_count += streamer.usage_count;
        } else {
          streamerMap.set(streamer.streamer_id, { ...streamer });
        }
      });
    });

    return Array.from(streamerMap.values())
      .sort((a, b) => b.total_discount_amount - a.total_discount_amount);
  };

  const calculateGlobalMonthlyUsage = (vouchers: VoucherWithAnalytics[]): MonthlyUsage[] => {
    const monthlyMap = new Map<string, MonthlyUsage>();

    vouchers.forEach(voucher => {
      voucher.analytics?.monthly_usage.forEach(monthly => {
        const existing = monthlyMap.get(monthly.month);
        if (existing) {
          existing.vouchers_used += monthly.vouchers_used;
          existing.total_discount += monthly.total_discount;
        } else {
          monthlyMap.set(monthly.month, { ...monthly });
        }
      });
    });

    return Array.from(monthlyMap.values())
      .sort((a, b) => new Date(b.month).getTime() - new Date(a.month).getTime());
  };

  const calculateGlobalStatusUsage = (vouchers: VoucherWithAnalytics[]): StatusUsage[] => {
    const statusMap = new Map<string, number>();
    let totalUsage = 0;

    vouchers.forEach(voucher => {
      voucher.analytics?.usage_by_status.forEach(status => {
        statusMap.set(status.status, (statusMap.get(status.status) || 0) + status.count);
        totalUsage += status.count;
      });
    });

    return Array.from(statusMap.entries()).map(([status, count]) => ({
      status,
      count,
      percentage: (count / totalUsage) * 100
    }));
  };

  return (
    <div className="px-8 py-8">
      {/* Header */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-[560px]">
          <h1 className="font-serif text-section font-semibold text-ink">
            Voucher
          </h1>
          <p className="mt-2 text-lede text-ink-soft">
            Kelola kode voucher dan lihat seberapa sering kode itu dipakai.
          </p>
        </div>

        <Dialog>
          <DialogTrigger asChild>
            {/* The single accent on this screen. Everything else is ink. */}
            <Button variant="brand" size="action-compact" className="shrink-0">
              Buat voucher
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[88vh] overflow-y-auto rounded-frame border border-hairline bg-surface p-0 sm:max-w-[520px] sm:rounded-frame">
            <div className="px-6 py-6">
              <DialogHeader className="mb-6 space-y-1.5 text-left">
                <DialogTitle className="font-serif text-title font-semibold text-ink">
                  Buat voucher baru
                </DialogTitle>
                <p className="text-meta text-ink-soft">
                  Kode berlaku sampai tanggal kadaluarsa atau sampai kuotanya habis.
                </p>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleCreateVoucher)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }: FieldRenderProps) => (
                      <FormItem>
                        <FormLabel className="text-copy font-medium text-ink-body">
                          Kode voucher
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              {...field}
                              maxLength={6}
                              className="h-11 rounded-field border-hairline-input bg-surface pl-3 pr-12 font-mono text-title uppercase tracking-wider text-ink"
                              placeholder="SUMMER"
                            />
                            <div className="numeric absolute right-3 top-1/2 -translate-y-1/2 text-mini text-ink-ghost">
                              {field.value.length}/6
                            </div>
                          </div>
                        </FormControl>
                        <FormDescription className="text-mini text-ink-soft">
                          6 karakter, hanya huruf kapital dan angka.
                        </FormDescription>
                        <FormMessage className="text-mini" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }: FieldRenderProps) => (
                      <FormItem>
                        <FormLabel className="text-copy font-medium text-ink-body">
                          Deskripsi
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Diskon promo Juni"
                            className="h-11 rounded-field border-hairline-input bg-surface text-copy text-ink placeholder:text-ink-ghost"
                          />
                        </FormControl>
                        <FormDescription className="text-mini text-ink-soft">
                          Keterangan singkat, untuk kamu sendiri.
                        </FormDescription>
                        <FormMessage className="text-mini" />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="discount_amount"
                      render={({ field }: FieldRenderProps) => (
                        <FormItem>
                          <FormLabel className="text-copy font-medium text-ink-body">
                            Nominal diskon
                          </FormLabel>
                          <FormControl>
                            <div className="relative">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-copy text-ink-soft">
                                Rp
                              </span>
                              <Input
                                type="number"
                                {...field}
                                onChange={e => {
                                  const value = e.target.value.replace(/^0+/, '');
                                  field.onChange(value ? parseInt(value) : '');
                                }}
                                className="numeric h-11 rounded-field border-hairline-input bg-surface pl-9 text-copy text-ink"
                                placeholder="50000"
                              />
                            </div>
                          </FormControl>
                          <FormMessage className="text-mini" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="total_quantity"
                      render={({ field }: FieldRenderProps) => (
                        <FormItem>
                          <FormLabel className="text-copy font-medium text-ink-body">
                            Jumlah
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={e => field.onChange(Number(e.target.value))}
                              className="numeric h-11 rounded-field border-hairline-input bg-surface text-copy text-ink"
                              placeholder="100"
                            />
                          </FormControl>
                          <FormMessage className="text-mini" />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="expires_at"
                    render={({ field }: FieldRenderProps) => (
                      <FormItem>
                        <FormLabel className="text-copy font-medium text-ink-body">
                          Tanggal kadaluarsa
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            min={new Date().toISOString().split('T')[0]}
                            className="numeric h-11 rounded-field border-hairline-input bg-surface text-copy text-ink"
                          />
                        </FormControl>
                        <FormDescription className="text-mini text-ink-soft">
                          Setelah tanggal ini kode berhenti berlaku.
                        </FormDescription>
                        <FormMessage className="text-mini" />
                      </FormItem>
                    )}
                  />

                  {/* Preview */}
                  <div className="rounded-panel border border-hairline bg-surface-tint p-4">
                    <div className="font-mono text-tiny uppercase text-ink-ghost">
                      Pratinjau
                    </div>
                    <div className="mt-3 flex min-w-0 items-start gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-field border border-hairline-input bg-surface font-mono text-lede text-ink-soft">
                        %
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-title font-semibold tracking-wider text-ink">
                          {form.watch("code") || "SUMMER"}
                        </div>
                        <div className="truncate text-meta text-ink-muted">
                          {form.watch("description") || "Diskon promo Juni"}
                        </div>
                        <div className="mt-1.5 flex items-baseline gap-3 whitespace-nowrap">
                          <span className="numeric text-copy font-medium text-ink">
                            Rp {form.watch("discount_amount")?.toLocaleString('id-ID') || "0"}
                          </span>
                          <span className="numeric text-mini text-ink-soft">
                            {form.watch("total_quantity") || "0"} kode
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="brand"
                    size="action-full"
                    disabled={isCreating}
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Memproses…
                      </>
                    ) : (
                      'Buat voucher'
                    )}
                  </Button>
                </form>
              </Form>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Analytics Dashboard */}
      {globalAnalytics && <AnalyticsDashboard analytics={globalAnalytics} />}

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-ghost" />
          <Input
            placeholder="Cari kode atau deskripsi…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 rounded-field border-hairline-input bg-surface pl-9 text-copy text-ink placeholder:text-ink-ghost"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-10 w-[190px] shrink-0 rounded-field border-hairline-input bg-surface text-copy text-ink-body">
            <SelectValue placeholder="Saring berdasarkan status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            <SelectItem value="active">Aktif</SelectItem>
            <SelectItem value="inactive">Nonaktif</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-frame border border-hairline bg-surface">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center px-5 py-16">
            <Loader2 className="h-5 w-5 animate-spin text-ink-ghost" />
            <p className="mt-3 text-copy text-ink-soft">Memuat voucher…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
            <AlertCircle className="h-5 w-5 text-ink-ghost" />
            <p className="mt-3 font-serif text-title font-semibold text-ink">
              Gagal memuat voucher
            </p>
            <p className="mx-auto mt-1.5 max-w-sm text-meta text-ink-soft">{error}</p>
            <div className="mt-5">
              <Button variant="quiet" size="action-compact" onClick={handleRetry}>
                Coba lagi
              </Button>
            </div>
          </div>
        ) : filteredVouchers.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
            <p className="font-serif text-title font-semibold text-ink">
              {searchQuery || statusFilter !== 'all'
                ? 'Tidak ada voucher yang cocok'
                : 'Belum ada voucher'}
            </p>
            <p className="mx-auto mt-1.5 max-w-sm text-meta text-ink-soft">
              {searchQuery || statusFilter !== 'all'
                ? 'Coba longgarkan kata kunci atau saringan statusnya.'
                : 'Buat kode pertama kamu lewat tombol di kanan atas.'}
            </p>
            {searchQuery || statusFilter !== 'all' ? (
              <div className="mt-5">
                <Button
                  variant="quiet"
                  size="action-compact"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                  }}
                >
                  <X className="mr-2 h-4 w-4" />
                  Bersihkan filter
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-hairline hover:bg-transparent">
                <TableHead className="h-10 font-mono text-tiny uppercase text-ink-ghost">
                  Kode
                </TableHead>
                <TableHead className="h-10 font-mono text-tiny uppercase text-ink-ghost">
                  Deskripsi
                </TableHead>
                <TableHead className="h-10 text-right font-mono text-tiny uppercase text-ink-ghost">
                  Diskon
                </TableHead>
                <TableHead className="h-10 text-right font-mono text-tiny uppercase text-ink-ghost">
                  Terpakai
                </TableHead>
                <TableHead className="h-10 text-right font-mono text-tiny uppercase text-ink-ghost">
                  Total diskon
                </TableHead>
                <TableHead className="h-10 font-mono text-tiny uppercase text-ink-ghost">
                  Status
                </TableHead>
                <TableHead className="h-10 font-mono text-tiny uppercase text-ink-ghost">
                  Berlaku sampai
                </TableHead>
                <TableHead className="h-10 w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVouchers.map((voucher: Voucher | VoucherWithAnalytics) => (
                <TableRow
                  key={voucher.id}
                  className="border-hairline-soft transition-colors hover:bg-surface-raised"
                >
                  <TableCell className="numeric whitespace-nowrap px-4 py-3 font-mono text-ui font-medium text-ink">
                    {voucher.code}
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate px-4 py-3 text-copy text-ink-muted">
                    {voucher.description}
                  </TableCell>
                  <TableCell className="numeric whitespace-nowrap px-4 py-3 text-right text-copy text-ink">
                    {formatCurrency(voucher.discount_amount)}
                  </TableCell>
                  <TableCell className="numeric whitespace-nowrap px-4 py-3 text-right text-copy text-ink-muted">
                    {isVoucherWithAnalytics(voucher)
                      ? `${voucher.usage_count}/${voucher.total_quantity}`
                      : `0/${voucher.total_quantity}`}
                  </TableCell>
                  <TableCell className="numeric whitespace-nowrap px-4 py-3 text-right text-copy text-ink">
                    {isVoucherWithAnalytics(voucher)
                      ? formatCurrency(voucher.total_discount_amount)
                      : 'Rp 0'}
                  </TableCell>
                  {/*
                    Status is a word, not a filled capsule. A green chip in every
                    row of a table makes the column the loudest thing on screen
                    for information that is binary and rarely surprising.
                  */}
                  <TableCell className="whitespace-nowrap px-4 py-3">
                    <span
                      className={
                        voucher.is_active
                          ? 'text-copy font-medium text-positive'
                          : 'text-copy text-ink-ghost'
                      }
                    >
                      {voucher.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </TableCell>
                  <TableCell className="numeric whitespace-nowrap px-4 py-3 text-copy text-ink-muted">
                    {format(new Date(voucher.expires_at), 'dd MMM yyyy', { locale: idLocale })}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <Button
                      variant="quiet"
                      size="sm"
                      className="h-8 px-3 text-mini"
                      onClick={() => {
                        if (isVoucherWithAnalytics(voucher)) {
                          setSelectedVoucher(voucher);
                          setIsAnalyticsModalOpen(true);
                        }
                      }}
                    >
                      Lihat detail
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Analytics Modal */}
      {selectedVoucher && (
        <VoucherAnalyticsModal
          voucher={selectedVoucher}
          isOpen={isAnalyticsModalOpen}
          onClose={() => {
            setIsAnalyticsModalOpen(false);
            setSelectedVoucher(null);
          }}
        />
      )}
    </div>
  );
}
