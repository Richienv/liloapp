import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Check,
  Store,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
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
    <div className="min-h-screen bg-canvas">
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>
    </div>
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
        <div className="rounded-frame border border-hairline bg-surface p-5 sm:p-8">
          <h1 className="font-serif text-title font-semibold text-ink">
            Halaman khusus host
          </h1>
          <p className="mt-2 text-copy text-ink-muted">
            Akun ini terdaftar sebagai brand, bukan host. Kamu bisa langsung mencari dan
            memesan host live streaming dari beranda.
          </p>
          <div className="mt-6">
            <Button asChild variant="brand" size="action">
              <Link href="/protected">Kembali ke beranda</Link>
            </Button>
          </div>
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
      <header>
        <p className="font-mono text-tiny uppercase text-ink-ghost">Setup host</p>
        <h1 className="mt-3 font-serif text-section font-semibold text-ink sm:text-display">
          {allDone ? "Semua langkah selesai" : "Tiga langkah, bisa dicicil"}
        </h1>
        <p className="mt-2 text-lede text-ink-soft">
          {allDone
            ? "Profil kamu tayang, identitas terverifikasi, dan penghasilan siap dicairkan."
            : "Setiap langkah cuma butuh beberapa menit dan progresnya tersimpan. Kamu boleh berhenti kapan saja lalu lanjut lagi dari sini."}
        </p>
      </header>

      {/* Progress meter. The number is the point: "1 dari 3" is a finishable
          amount of work in a way that a list of empty checkboxes is not. The
          fill is ink, not brand — the one accent on this page belongs to the
          single button that says what to do next. */}
      <div className="mt-8 rounded-frame border border-hairline bg-surface p-4 sm:p-5">
        <div className="flex min-w-0 items-baseline gap-4">
          <p className="min-w-0 flex-1 truncate text-copy text-ink-body">
            <span className="numeric font-medium text-ink">
              {finished} dari {milestones.length}
            </span>{" "}
            langkah selesai
          </p>
          <p className="numeric shrink-0 text-copy font-medium text-ink">{progress}%</p>
        </div>
        <div
          className="mt-3 h-1 w-full overflow-hidden rounded-chip bg-surface-deep"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progres setup host"
        >
          <div
            className="h-full rounded-chip bg-ink transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* One card, hairline-divided rows. Three separate bordered cards drew
          three frames inside a page that already has one. */}
      <ol className="mt-6 overflow-hidden rounded-frame border border-hairline bg-surface">
        {milestones.map((milestone, index) => {
          const Icon = ICONS[milestone.id];
          const href = actionHref(milestone);

          return (
            <li
              key={milestone.id}
              className="border-b border-hairline-soft px-4 py-5 last:border-b-0 sm:px-5"
            >
              {/* Index, title and state on one line that cannot wrap: the
                  status is a word in the margin, not a filled chip. */}
              <div className="flex min-w-0 items-center gap-3">
                <span className="numeric shrink-0 text-mini font-semibold text-ink-ghost">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                  aria-hidden="true"
                  className="shrink-0 text-ink-faint"
                >
                  {milestone.done ? (
                    <Check className="h-4 w-4 text-positive" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </span>
                <h2 className="min-w-0 flex-1 truncate font-serif text-title font-semibold text-ink">
                  {milestone.title}
                </h2>
                {milestone.done ? (
                  <span className="shrink-0 text-mini text-positive">Selesai</span>
                ) : milestone.current ? (
                  <span className="shrink-0 text-mini text-caution">
                    Langkah berikutnya
                  </span>
                ) : null}
              </div>

              <div className="mt-2 sm:pl-9">
                <p className="text-copy text-ink-muted">{milestone.description}</p>

                <p className="mt-1.5 flex items-start gap-1.5 text-meta text-ink-soft">
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-ink-ghost" />
                  <span>
                    {milestone.done ? "Sudah terbuka: " : "Membuka: "}
                    <span className="text-ink-body">{milestone.unlocks}</span>
                  </span>
                </p>

                {/* Only the publish step can say precisely what is missing —
                    verification and payout are all-or-nothing. */}
                {milestone.id === "publish" && !milestone.done && missing.length > 0 && (
                  <p className="mt-1.5 text-meta text-ink-soft">
                    Masih kosong:{" "}
                    <span className="text-ink-body">{missing.join(", ")}</span>
                  </p>
                )}

                <div className="mt-4">
                  <Button
                    asChild
                    variant={milestone.current ? "brand" : "quiet"}
                    size="action-compact"
                  >
                    <Link href={href}>
                      {milestone.done
                        ? "Ubah"
                        : milestone.current
                          ? "Lanjutkan"
                          : "Buka"}
                      {!milestone.done && <ArrowRight className="ml-2 h-4 w-4" />}
                    </Link>
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {showScheduleWarning && (
        <div className="mt-6 rounded-frame border border-caution-line bg-caution-tint p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <CalendarClock
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-caution"
            />
            <h2 className="min-w-0 flex-1 truncate font-serif text-title font-semibold text-ink">
              Jadwal live belum aktif
            </h2>
          </div>
          <p className="mt-2 text-copy text-ink-body sm:pl-7">
            Brand hanya bisa memilih tanggal yang kamu tandai siap. Selama jadwalmu
            kosong, kalender di profilmu tertutup semua dan kamu tidak bisa dipesan.
          </p>
          <div className="mt-4 sm:pl-7">
            <Button asChild variant="quiet" size="action-compact">
              <Link href="/streamer-schedule">
                Atur jadwal
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      )}

      <p className="mt-8 text-center text-meta text-ink-soft">
        Sudah selesai untuk sekarang?{" "}
        <Link
          href="/streamer-dashboard"
          className="font-medium text-ink underline decoration-hairline-strong underline-offset-2 transition-colors hover:decoration-ink"
        >
          Buka dashboard
        </Link>
      </p>
    </Shell>
  );
}
