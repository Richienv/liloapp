import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, Info, TrendingDown } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createAdminClient } from "@/utils/supabase/admin";
import { getAdmin } from "@/lib/admin";
import { ONBOARDING_EVENTS, type OnboardingEvent } from "@/lib/analytics";

// Numbers an admin acts on must never be a cached snapshot.
export const dynamic = "force-dynamic";

const FUNNEL_PATH = "/admin/funnel";

/**
 * Hard ceiling on the rows pulled into memory for one view. The aggregation is
 * a distinct-user count per stage, which PostgREST cannot do server-side, so
 * the rows are counted here — but bounded, and the UI says so out loud when the
 * bound is hit rather than quietly showing wrong numbers.
 */
const ROW_CAP = 20000;

const WINDOWS = [7, 30, 90] as const;
const DEFAULT_WINDOW = 30;

/**
 * The funnel, in the order a streamer walks it. Each stage is one event from
 * `lib/analytics.ts`; the conversion rate on a row is that stage's users
 * divided by the previous stage's.
 */
const STAGES: { event: OnboardingEvent; label: string; hint: string }[] = [
  {
    event: ONBOARDING_EVENTS.ACCOUNT_CREATED,
    label: "Akun dibuat",
    hint: "Pendaftaran berhasil",
  },
  {
    event: ONBOARDING_EVENTS.ROLE_SELECTED,
    label: "Peran dipilih",
    hint: "Memilih sebagai brand atau streamer",
  },
  {
    event: ONBOARDING_EVENTS.PROFILE_SETUP_STARTED,
    label: "Mulai isi profil",
    hint: "Membuka langkah pertama pengisian profil",
  },
  {
    event: ONBOARDING_EVENTS.PROFILE_PUBLISHED,
    label: "Profil dipublikasikan",
    hint: "Profil lengkap dan tampil di pencarian",
  },
  {
    event: ONBOARDING_EVENTS.VERIFICATION_SUBMITTED,
    label: "Verifikasi diajukan",
    hint: "Dokumen KTP, selfie, dan bukti akun diunggah",
  },
  {
    event: ONBOARDING_EVENTS.VERIFICATION_APPROVED,
    label: "Verifikasi disetujui",
    hint: "Sudah bisa dibooking",
  },
  {
    event: ONBOARDING_EVENTS.PAYOUT_ACCOUNT_ADDED,
    label: "Rekening pencairan diisi",
    hint: "Siap menerima pembayaran",
  },
];

/** Not a stage — a branch out of the funnel, reported on its own. */
const REJECTED_STAGE = {
  event: ONBOARDING_EVENTS.VERIFICATION_REJECTED,
  label: "Verifikasi ditolak",
};

interface EventRow {
  id: string;
  user_id: string | null;
  event: string;
}

/**
 * Reads go through the service role when it is configured. `onboarding_events`
 * is readable only by `public.is_admin()`, which is a second allowlist
 * (`public.admin_users`) that can drift from the ADMIN_EMAILS one this page is
 * gated by; the service role makes the page work regardless. Without the key we
 * fall back to the caller's session, so the page degrades to "no data" instead
 * of crashing.
 */
function readClient(sessionClient: SupabaseClient): SupabaseClient {
  return createAdminClient() ?? sessionClient;
}

function formatPercent(value: number): string {
  return `${(value * 100).toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`;
}

export default async function FunnelPage({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  // Re-checked here rather than trusting the layout: this page reads a table
  // covering every user's onboarding history.
  const admin = await getAdmin();
  if (!admin) {
    redirect("/");
  }

  const db = readClient(admin.supabase);

  const requestedDays = Number(searchParams.days);
  const days = (WINDOWS as readonly number[]).includes(requestedDays)
    ? requestedDays
    : DEFAULT_WINDOW;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error, count } = await db
    .from("onboarding_events")
    .select("id, user_id, event", { count: "exact" })
    .gte("created_at", since)
    // Newest first, so a truncated window still describes the recent past
    // rather than a random slice of it.
    .order("created_at", { ascending: false })
    .limit(ROW_CAP);

  const rows = (data ?? []) as EventRow[];
  const totalEvents = count ?? rows.length;
  const truncated = totalEvents > rows.length;

  /**
   * Distinct people per stage, not raw event counts. Somebody who resubmits
   * verification twice is one person who reached that stage — counting events
   * would show a conversion rate above 100% and hide the drop-off underneath.
   *
   * Events whose user was deleted keep a null `user_id` (the FK is ON DELETE
   * SET NULL), so they are counted one-per-row instead of collapsing into a
   * single phantom user.
   */
  const actorsByEvent = new Map<string, Set<string>>();
  for (const row of rows) {
    let actors = actorsByEvent.get(row.event);
    if (!actors) {
      actors = new Set<string>();
      actorsByEvent.set(row.event, actors);
    }
    actors.add(row.user_id ?? `deleted:${row.id}`);
  }

  const countFor = (event: OnboardingEvent) =>
    actorsByEvent.get(event)?.size ?? 0;

  const stages = STAGES.map((stage, index) => {
    const users = countFor(stage.event);
    const previous = index === 0 ? users : countFor(STAGES[index - 1].event);
    const first = countFor(STAGES[0].event);

    return {
      ...stage,
      users,
      dropOff: index === 0 ? 0 : Math.max(0, previous - users),
      // Null on the first row and whenever the previous stage is empty: a
      // conversion rate with no denominator is not 0%, it is unknown.
      conversion: index === 0 || previous === 0 ? null : users / previous,
      // Same rule for the share of signups. Nobody entering the funnel in this
      // window is not "0% got here" — it is a stage with nothing to divide by,
      // and rendering it as 0% invites an admin to go and fix a step that has
      // no data behind it at all. It happens routinely: pick a 7-day window and
      // every host in it signed up last month.
      share: first === 0 ? null : Math.min(1, users / first),
    };
  });

  // The step that loses the most people is the one worth fixing first.
  const worstDropOff = stages
    .slice(1)
    .reduce(
      (worst, stage) => (stage.dropOff > (worst?.dropOff ?? 0) ? stage : worst),
      null as (typeof stages)[number] | null,
    );

  const rejected = countFor(REJECTED_STAGE.event);
  const hasData = rows.length > 0;
  /** The stage the summary card reports on: how many walked the whole thing. */
  const finalStage = stages[stages.length - 1];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Funnel Pendaftaran
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Berapa banyak orang yang lolos di setiap tahap, dan di tahap mana
            mereka berhenti. Dihitung dari jumlah pengguna unik, bukan jumlah
            kejadian.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {WINDOWS.map((option) => (
            <Link
              key={option}
              href={`${FUNNEL_PATH}?days=${option}`}
              className={
                option === days
                  ? "rounded-md bg-[#0066FF] px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              }
            >
              {option} hari
            </Link>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
          <p className="text-sm text-red-800">
            Gagal memuat data funnel: {error.message}
          </p>
        </div>
      )}

      {truncated && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">
            Data dipotong: {rows.length.toLocaleString("id-ID")} dari{" "}
            {totalEvents.toLocaleString("id-ID")} kejadian terbaru yang dihitung.
            Angka di bawah adalah batas bawah — persempit rentang waktunya untuk
            hasil yang utuh.
          </p>
        </div>
      )}

      {/* Ringkasan */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-gray-600">Masuk funnel</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {stages[0].users.toLocaleString("id-ID")}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Akun dibuat dalam {days} hari terakhir
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-gray-600">Selesai sampai akhir</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {finalStage.users.toLocaleString("id-ID")}
            <span className="ml-2 text-sm font-normal text-gray-500">
              {finalStage.share === null
                ? "(belum ada data)"
                : `(${formatPercent(finalStage.share)})`}
            </span>
          </p>
          <p className="mt-1 text-xs text-gray-500">{finalStage.label}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600">Kebocoran terbesar</p>
            <TrendingDown className="h-4 w-4 text-gray-400" />
          </div>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {worstDropOff && worstDropOff.dropOff > 0
              ? worstDropOff.dropOff.toLocaleString("id-ID")
              : "-"}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {worstDropOff && worstDropOff.dropOff > 0
              ? `Berhenti sebelum "${worstDropOff.label}"`
              : "Belum ada kebocoran yang terukur"}
          </p>
        </div>
      </div>

      {/* Tabel funnel */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50">
              <TableHead className="font-medium w-[280px]">Tahap</TableHead>
              <TableHead className="font-medium">Pengguna</TableHead>
              <TableHead className="font-medium">Konversi dari tahap sebelumnya</TableHead>
              <TableHead className="font-medium">Berhenti di sini</TableHead>
              <TableHead className="font-medium w-[220px]">
                Porsi dari pendaftar
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!hasData && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-sm text-gray-500"
                >
                  Belum ada kejadian onboarding pada rentang ini. Data mulai
                  terkumpul setelah pengguna berikutnya mendaftar.
                </TableCell>
              </TableRow>
            )}
            {hasData &&
              stages.map((stage, index) => (
                <TableRow key={stage.event} className="hover:bg-gray-50/50">
                  <TableCell>
                    <div className="font-medium text-gray-900">
                      {index + 1}. {stage.label}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {stage.hint}
                    </div>
                  </TableCell>
                  <TableCell className="font-semibold text-gray-900">
                    {stage.users.toLocaleString("id-ID")}
                  </TableCell>
                  <TableCell className="text-sm">
                    {stage.conversion === null ? (
                      <span className="text-gray-400">-</span>
                    ) : (
                      <span
                        className={
                          stage.conversion < 0.5
                            ? "font-medium text-red-600"
                            : "font-medium text-gray-700"
                        }
                      >
                        {formatPercent(stage.conversion)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {index === 0 ? (
                      <span className="text-gray-400">-</span>
                    ) : (
                      `-${stage.dropOff.toLocaleString("id-ID")}`
                    )}
                  </TableCell>
                  <TableCell>
                    {stage.share === null ? (
                      // No signups in this window to divide by. An empty bar
                      // labelled "0%" would read as a stage everybody skipped.
                      <span className="text-sm text-gray-400">
                        Belum ada data
                      </span>
                    ) : (
                      <>
                        {/* Deliberately a plain div, not a chart library: one
                            bar per row, width = share of the first stage. */}
                        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-[#0066FF]"
                            style={{ width: `${Math.round(stage.share * 100)}%` }}
                          />
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {formatPercent(stage.share)}
                        </div>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-4 py-4 text-sm text-gray-500">
          <span>
            Rentang {days} hari terakhir · {totalEvents.toLocaleString("id-ID")}{" "}
            kejadian tercatat
          </span>
          <span>
            {REJECTED_STAGE.label}: {rejected.toLocaleString("id-ID")} pengguna
          </span>
        </div>
      </div>

      <p className="mt-4 text-xs text-gray-500">
        Satu pengguna dihitung sekali per tahap, walaupun ia mengulang langkah
        tersebut. Tahap yang lebih jauh bisa terlihat lebih besar dari tahap
        sebelumnya jika pengguna mendaftar sebelum rentang waktu ini dimulai.
      </p>
    </div>
  );
}
