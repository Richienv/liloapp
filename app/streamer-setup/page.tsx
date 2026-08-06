import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Check,
  Sparkles,
  Store,
  Wallet,
} from "lucide-react";

import { createClient } from "@/utils/supabase/server";
import {
  milestoneProgress,
  missingPublishFields,
  streamerMilestones,
  type Milestone,
  type MilestoneId,
  type PublishableProfile,
} from "@/lib/milestones";

export const metadata = {
  title: "Setup Host | Salda",
  // A page that only ever renders for one signed-in host has nothing to offer a
  // crawler, and the URL should not surface in search at all.
  robots: { index: false, follow: false },
};

// Progress here changes as a side effect of forms on other routes (and, for
// verification, of an admin acting out of band), so it must never be served
// from a build-time cache.
export const dynamic = "force-dynamic";

/**
 * `lib/milestones` points the `publish` milestone at this hub, because that is
 * the right destination for callers arriving from outside setup (sign-in
 * redirects, the dashboard). From inside the hub, sending someone back to the
 * hub is a loop — so resolve it to the form that actually collects the fields.
 */
const PUBLISH_FORM_PATH = "/streamer-setup/profil";

function actionHref(milestone: Milestone): string {
  return milestone.id === "publish" ? PUBLISH_FORM_PATH : milestone.href;
}

const ICONS: Record<MilestoneId, typeof Store> = {
  publish: Store,
  verify: BadgeCheck,
  payout: Wallet,
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">{children}</main>
  );
}

export default async function StreamerSetupHubPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in?redirect_to=/streamer-setup");
  }

  const { data: streamer } = await supabase
    .from("streamers")
    .select(
      "id, username, image_url, city_slug, location, full_address, category, platform, price, bio, verification_status",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  // Without a streamer row we cannot tell "brand account" from "host whose row
  // was never created", and the two need different answers.
  let userType: string | null = null;
  if (!streamer) {
    const { data: profile } = await supabase
      .from("users")
      .select("user_type")
      .eq("id", user.id)
      .maybeSingle();
    userType = profile?.user_type ?? null;
  }

  if (!streamer && userType === "client") {
    return (
      <Shell>
        <div className="rounded-frame border border-hairline bg-surface p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-ink">Halaman khusus host</h1>
          <p className="mt-2 text-ink-muted">
            Akun ini terdaftar sebagai brand, bukan host. Kamu bisa langsung mencari dan
            memesan host live streaming dari beranda.
          </p>
          <Link
            href="/protected"
            className="mt-6 inline-flex h-[46px] w-[220px] items-center justify-center rounded-lg
              bg-brand px-4 text-ui font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            Kembali ke beranda
          </Link>
        </div>
      </Shell>
    );
  }

  // Bank details must never be read with the public browser key, so this is a
  // head-only existence check — the hub needs a boolean, not the account.
  let hasPayoutAccount = false;
  // Publishing seeds a starting week (see saveStreamerProfile), but that write
  // is best-effort: if it ever failed, the host would be listed with a calendar
  // on which every date is greyed out and would have no way of knowing. Checking
  // here is what turns a silent dead end into something they can fix.
  let hasSchedule = true;
  if (streamer) {
    const { count } = await supabase
      .from("streamer_payout_accounts")
      .select("id", { count: "exact", head: true })
      .eq("streamer_id", streamer.id);
    hasPayoutAccount = (count ?? 0) > 0;

    const { count: scheduleCount, error: scheduleError } = await supabase
      .from("streamer_active_schedules")
      .select("id", { count: "exact", head: true })
      .eq("streamer_id", streamer.id);
    // A failed read is not evidence of a missing schedule; do not cry wolf.
    hasSchedule = scheduleError ? true : (scheduleCount ?? 0) > 0;
  }

  const profile: PublishableProfile | null = streamer ?? null;

  const milestones = streamerMilestones({
    profile,
    verificationStatus: streamer?.verification_status ?? null,
    hasPayoutAccount,
  });

  const progress = milestoneProgress(milestones);
  const finished = milestones.filter((m) => m.done).length;
  const allDone = finished === milestones.length;
  const missing = missingPublishFields(profile);

  // Only worth saying once the profile is publishable: before that the host has
  // a more pressing thing to do, and the seeding has not been attempted yet.
  const publishDone = milestones.some((m) => m.id === "publish" && m.done);
  const showScheduleWarning = publishDone && !hasSchedule;

  return (
    <Shell>
      <div className="mb-6">
        <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          <Sparkles className="h-4 w-4" /> Setup host
        </span>
        <h1 className="mt-4 text-2xl font-semibold text-ink">
          {allDone ? "Semua langkah selesai" : "Tiga langkah, bisa dicicil"}
        </h1>
        <p className="mt-2 text-ink-muted">
          {allDone
            ? "Profil kamu tayang, identitas terverifikasi, dan penghasilan siap dicairkan."
            : "Setiap langkah cuma butuh beberapa menit dan progresnya tersimpan. Kamu boleh berhenti kapan saja lalu lanjut lagi dari sini."}
        </p>
      </div>

      {/* Progress meter. The number is the point: "1 dari 3" is a finishable
          amount of work in a way that a list of empty checkboxes is not. */}
      <div className="mb-6 rounded-frame border border-hairline bg-surface p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium text-ink-body">
            {finished} dari {milestones.length} langkah selesai
          </p>
          <p className="text-sm font-semibold text-blue-700">{progress}%</p>
        </div>
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-tint"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progres setup host"
        >
          <div
            className="h-full rounded-full bg-brand transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <ol className="space-y-3">
        {milestones.map((milestone, index) => {
          const Icon = ICONS[milestone.id];
          const href = actionHref(milestone);

          return (
            <li key={milestone.id}>
              <div
                className={`rounded-frame border bg-surface p-5 transition-colors ${
                  milestone.current
                    ? "border-blue-200"
                    : "border-hairline"
                }`}
              >
                <div className="flex items-start gap-4">
                  <span
                    aria-hidden="true"
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-panel ${
                      milestone.done
                        ? "bg-green-50 text-green-600"
                        : milestone.current
                          ? "bg-blue-50 text-blue-600"
                          : "bg-surface-tint text-ink-faint"
                    }`}
                  >
                    {milestone.done ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-ink">
                        {index + 1}. {milestone.title}
                      </h2>
                      {milestone.done && (
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                          Selesai
                        </span>
                      )}
                      {milestone.current && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          Langkah berikutnya
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-sm text-ink-muted">{milestone.description}</p>

                    <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-soft">
                      <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-ink-faint" />
                      <span>
                        {milestone.done ? "Sudah terbuka: " : "Membuka: "}
                        <span className="font-medium text-ink-body">
                          {milestone.unlocks}
                        </span>
                      </span>
                    </p>

                    {/* Only the publish step can say precisely what is missing —
                        verification and payout are all-or-nothing. */}
                    {milestone.id === "publish" && !milestone.done && missing.length > 0 && (
                      <p className="mt-2 text-sm text-ink-soft">
                        Masih kosong:{" "}
                        <span className="font-medium text-ink-body">
                          {missing.join(", ")}
                        </span>
                      </p>
                    )}

                    <div className="mt-4">
                      {milestone.done ? (
                        <Link
                          href={href}
                          className="inline-flex h-10 items-center justify-center rounded-panel border-2
                            border-hairline-input px-4 text-sm font-medium text-ink-body transition-colors
                            hover:bg-surface-tint"
                        >
                          Ubah
                        </Link>
                      ) : (
                        <Link
                          href={href}
                          className={
                            milestone.current
                              ? `inline-flex h-10 items-center justify-center gap-2 rounded-panel
                                 bg-brand px-4 text-sm font-medium
                                 text-white transition-all`
                              : `inline-flex h-10 items-center justify-center gap-2 rounded-panel border-2
                                 border-hairline-input px-4 text-sm font-medium text-ink-body transition-colors
                                 hover:bg-surface-tint`
                          }
                        >
                          {milestone.current ? "Lanjutkan" : "Buka"}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {showScheduleWarning && (
        <div className="mt-4 rounded-frame border border-amber-200 bg-amber-50/70 p-5">
          <div className="flex items-start gap-4">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-panel bg-amber-100 text-amber-700"
            >
              <CalendarClock className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-amber-900">Jadwal live belum aktif</h2>
              <p className="mt-1 text-sm text-amber-800">
                Brand hanya bisa memilih tanggal yang kamu tandai siap. Selama jadwalmu
                kosong, kalender di profilmu tertutup semua dan kamu tidak bisa dipesan.
              </p>
              <Link
                href="/streamer-schedule"
                className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-panel
                  border-2 border-amber-300 bg-surface px-4 text-sm font-medium text-amber-900
                  transition-colors hover:bg-amber-50"
              >
                Atur jadwal
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-ink-soft">
        Sudah selesai untuk sekarang?{" "}
        <Link href="/streamer-dashboard" className="font-medium text-blue-700 hover:underline">
          Buka dashboard
        </Link>
      </p>
    </Shell>
  );
}
