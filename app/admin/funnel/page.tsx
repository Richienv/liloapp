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
    <div className="px-8 py-8">
      {/* Header */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-[560px]">
          <h1 className="font-serif text-section font-semibold text-ink">
            Funnel pendaftaran
          </h1>
          <p className="mt-2 text-lede text-ink-soft">
            Berapa banyak orang yang lolos di setiap tahap, dan di tahap mana
            mereka berhenti. Dihitung dari jumlah pengguna unik, bukan jumlah
            kejadian.
          </p>
        </div>
        {/*
          A segmented control, not an accent. Selecting a time window is
          navigation, not the one thing on the page worth pressing — a blue pill
          here would spend the section's single accent on a filter and leave the
          numbers competing with it.
        */}
        <div className="flex shrink-0 items-center gap-0.5 rounded-field border border-hairline-input bg-surface p-0.5">
          {WINDOWS.map((option) => (
            <Link
              key={option}
              href={`${FUNNEL_PATH}?days=${option}`}
              className={
                option === days
                  ? "numeric rounded-chip bg-surface-deep px-3 py-1.5 text-ui font-medium text-ink"
                  : "numeric rounded-chip px-3 py-1.5 text-ui text-ink-soft transition-colors hover:text-ink"
              }
            >
              {option} hari
            </Link>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2.5 rounded-panel border border-destructive-emphasis/20 bg-destructive-subtle px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive-emphasis" />
          <p className="text-copy text-destructive-emphasis">
            Gagal memuat data funnel: {error.message}
          </p>
        </div>
      )}

      {truncated && (
        <div className="mb-5 flex items-start gap-2.5 rounded-panel border border-caution-line bg-caution-tint px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-caution" />
          <p className="text-copy text-caution-strong">
            Data dipotong: {rows.length.toLocaleString("id-ID")} dari{" "}
            {totalEvents.toLocaleString("id-ID")} kejadian terbaru yang dihitung.
            Angka di bawah adalah batas bawah — persempit rentang waktunya untuk
            hasil yang utuh.
          </p>
        </div>
      )}

      {/*
        Ringkasan. A gapless grid with `shadow-cell` rather than three bordered
        cards: a border on every cell double-draws against its neighbour and the
        seam reads 2px, which is the exact bug the token exists to fix.
      */}
      <div className="mb-5 grid grid-cols-1 overflow-hidden rounded-frame border border-hairline bg-surface md:grid-cols-3">
        <div className="p-5 shadow-cell">
          <p className="font-mono text-tiny uppercase text-ink-ghost">
            Masuk funnel
          </p>
          <p className="numeric mt-2 text-price font-semibold text-ink">
            {stages[0].users.toLocaleString("id-ID")}
          </p>
          <p className="mt-1 text-mini text-ink-soft">
            Akun dibuat dalam {days} hari terakhir
          </p>
        </div>
        <div className="p-5 shadow-cell">
          <p className="font-mono text-tiny uppercase text-ink-ghost">
            Selesai sampai akhir
          </p>
          <p className="mt-2 flex items-baseline gap-2 whitespace-nowrap">
            <span className="numeric text-price font-semibold text-ink">
              {finalStage.users.toLocaleString("id-ID")}
            </span>
            <span className="numeric text-mini font-normal text-ink-soft">
              {finalStage.share === null
                ? "belum ada data"
                : formatPercent(finalStage.share)}
            </span>
          </p>
          <p className="mt-1 text-mini text-ink-soft">{finalStage.label}</p>
        </div>
        <div className="p-5 shadow-cell">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-tiny uppercase text-ink-ghost">
              Kebocoran terbesar
            </p>
            <TrendingDown className="h-3.5 w-3.5 shrink-0 text-ink-ghost" />
          </div>
          <p className="numeric mt-2 text-price font-semibold text-ink">
            {worstDropOff && worstDropOff.dropOff > 0
              ? worstDropOff.dropOff.toLocaleString("id-ID")
              : "—"}
          </p>
          <p className="mt-1 text-mini text-ink-soft">
            {worstDropOff && worstDropOff.dropOff > 0
              ? `Berhenti sebelum "${worstDropOff.label}"`
              : "Belum ada kebocoran yang terukur"}
          </p>
        </div>
      </div>

      {/* Tabel funnel */}
      <div className="overflow-hidden rounded-frame border border-hairline bg-surface">
        <Table>
          <TableHeader>
            <TableRow className="border-hairline hover:bg-transparent">
              <TableHead className="h-10 w-[300px] font-mono text-tiny uppercase text-ink-ghost">
                Tahap
              </TableHead>
              <TableHead className="h-10 font-mono text-tiny uppercase text-ink-ghost">
                Pengguna
              </TableHead>
              <TableHead className="h-10 font-mono text-tiny uppercase text-ink-ghost">
                Konversi dari tahap sebelumnya
              </TableHead>
              <TableHead className="h-10 font-mono text-tiny uppercase text-ink-ghost">
                Berhenti di sini
              </TableHead>
              <TableHead className="h-10 w-[220px] font-mono text-tiny uppercase text-ink-ghost">
                Porsi dari pendaftar
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!hasData && (
              <TableRow className="border-hairline-soft hover:bg-transparent">
                <TableCell
                  colSpan={5}
                  className="px-4 py-12 text-center text-copy text-ink-soft"
                >
                  Belum ada kejadian onboarding pada rentang ini. Data mulai
                  terkumpul setelah pengguna berikutnya mendaftar.
                </TableCell>
              </TableRow>
            )}
            {hasData &&
              stages.map((stage, index) => (
                <TableRow
                  key={stage.event}
                  className="border-hairline-soft transition-colors hover:bg-surface-raised"
                >
                  <TableCell className="px-4 py-3">
                    <div className="flex items-baseline gap-2">
                      <span className="numeric font-mono text-mini text-ink-ghost">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-ui font-medium text-ink">
                        {stage.label}
                      </span>
                    </div>
                    <div className="mt-0.5 text-mini text-ink-soft">
                      {stage.hint}
                    </div>
                  </TableCell>
                  <TableCell className="numeric px-4 py-3 text-ui font-semibold text-ink">
                    {stage.users.toLocaleString("id-ID")}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {stage.conversion === null ? (
                      <span className="text-copy text-ink-ghost">—</span>
                    ) : (
                      <span
                        className={
                          stage.conversion < 0.5
                            ? "numeric text-copy font-medium text-critical"
                            : "numeric text-copy font-medium text-ink-body"
                        }
                      >
                        {formatPercent(stage.conversion)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="numeric px-4 py-3 text-copy text-ink-muted">
                    {index === 0 ? (
                      <span className="text-ink-ghost">—</span>
                    ) : (
                      `−${stage.dropOff.toLocaleString("id-ID")}`
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {stage.share === null ? (
                      // No signups in this window to divide by. An empty bar
                      // labelled "0%" would read as a stage everybody skipped.
                      <span className="text-copy text-ink-ghost">
                        Belum ada data
                      </span>
                    ) : (
                      <>
                        {/* Deliberately a plain div, not a chart library: one
                            bar per row, width = share of the first stage. Ink,
                            not accent — seven blue bars would be seven accents
                            in one section. */}
                        <div className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-deep">
                          <div
                            className="h-full rounded-pill bg-ink"
                            style={{ width: `${Math.round(stage.share * 100)}%` }}
                          />
                        </div>
                        <div className="numeric mt-1.5 text-mini text-ink-soft">
                          {formatPercent(stage.share)}
                        </div>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 border-t border-hairline px-4 py-3.5 text-mini text-ink-soft">
          <span className="numeric">
            Rentang {days} hari terakhir · {totalEvents.toLocaleString("id-ID")}{" "}
            kejadian tercatat
          </span>
          <span className="numeric">
            {REJECTED_STAGE.label}: {rejected.toLocaleString("id-ID")} pengguna
          </span>
        </div>
      </div>

      <p className="mt-4 max-w-[720px] text-mini text-ink-soft">
        Satu pengguna dihitung sekali per tahap, walaupun ia mengulang langkah
        tersebut. Tahap yang lebih jauh bisa terlihat lebih besar dari tahap
        sebelumnya jika pengguna mendaftar sebelum rentang waktu ini dimulai.
      </p>
    </div>
  );
}
