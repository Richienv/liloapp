"use client";

/**
 * The host dashboard shell: sidebar + sticky header + content column.
 *
 * Purely presentational. It owns no Supabase query and no mutation — every
 * figure it renders (name, rating, session count, pending-request badge, the
 * live clock) arrives as a prop from `page.tsx`, which is where the real
 * queries live. The one piece of local state is the "Terima booking" toggle,
 * which has no column behind it yet; see the note on `HostShellProps.accepting`.
 */

import Link from "next/link";
import { useState, type ReactNode } from "react";

export type HostTab = "home" | "schedule" | "earnings" | "profile";

type NavItem = { key: HostTab; label: string; icon: string };

/** The four destinations, in the order the design lists them. */
export const HOST_TABS: readonly NavItem[] = [
  { key: "home", label: "Beranda", icon: "◉" },
  { key: "schedule", label: "Jadwal", icon: "▤" },
  { key: "earnings", label: "Pendapatan", icon: "◱" },
  { key: "profile", label: "Profil", icon: "◍" },
] as const;

export const HOST_TAB_TITLES: Record<HostTab, string> = {
  home: "Beranda",
  schedule: "Jadwal",
  earnings: "Pendapatan",
  profile: "Profil",
};

export interface HostShellProps {
  activeTab: HostTab;
  onTabChange: (tab: HostTab) => void;

  /** Host's display name, from the `streamers` row. */
  hostName: string;
  /** `streamers.image_url`. Null renders an initial, never a stock face. */
  hostPhotoUrl?: string | null;
  /** `StreamerStats.rating`. Null renders "Belum ada ulasan". */
  rating?: number | null;
  /** Completed sessions, from the same stats query. Null hides the count. */
  sessionCount?: number | null;

  /** Length of `pendingBookings` — drives the badge on Beranda. */
  pendingCount?: number;

  /**
   * Elapsed time of the session that is live right now, already formatted as
   * mm:ss by the caller from the real booking's start time. Null/undefined =
   * nothing is live, and the pill is not rendered. The shell never invents a
   * clock of its own.
   */
  liveClock?: string | null;

  /**
   * Optional controlled state for the "Terima booking" switch. If the caller
   * passes neither, the switch falls back to local state and persists nothing
   * — no column in `streamers` backs an online/offline flag today.
   */
  accepting?: boolean;
  onAcceptingChange?: (next: boolean) => void;

  children: ReactNode;
}

function formatRating(rating: number): string {
  return rating.toLocaleString("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** Avatar as a background-image div, exactly as the design draws it. */
function HostAvatar({
  name,
  photoUrl,
  size,
}: {
  name: string;
  photoUrl?: string | null;
  size: number;
}) {
  if (photoUrl) {
    return (
      <div
        aria-hidden
        className="flex-shrink-0 rounded-full bg-surface-tint bg-cover"
        style={{
          width: size,
          height: size,
          backgroundImage: `url(${photoUrl})`,
          backgroundPosition: "center top",
        }}
      />
    );
  }
  return (
    <div
      aria-hidden
      className="flex flex-shrink-0 items-center justify-center rounded-full bg-surface-tint font-semibold text-ink-faint"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}

function NavBadge({ count }: { count: number }) {
  return (
    <span className="ml-auto flex h-[19px] min-w-[19px] items-center justify-center rounded-[10px] bg-brand px-[5px] text-[10.5px] font-semibold leading-none text-white">
      {count}
    </span>
  );
}

/**
 * "Terima booking". The knob slides 2px -> 17px; the track goes brand when on
 * and hairline-input when off.
 */
function AcceptingToggle({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-[10px] border border-hairline p-[14px]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-meta font-semibold text-ink">Terima booking</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Terima booking"
          onClick={onToggle}
          className={`relative h-[19px] w-[34px] flex-shrink-0 rounded-[10px] border-0 transition-colors duration-300 ${
            on ? "bg-brand" : "bg-hairline-input"
          }`}
        >
          <span
            className="absolute top-[2px] h-[15px] w-[15px] rounded-[8px] bg-surface"
            style={{
              left: on ? "17px" : "2px",
              transition: "left .3s cubic-bezier(.16,1,.3,1)",
            }}
          />
        </button>
      </div>
      <p className="m-0 text-mini text-ink-soft">
        {on
          ? "Aktif — brand bisa menemukan dan memesan kamu."
          : "Nonaktif — kamu tidak muncul di pencarian."}
      </p>
    </div>
  );
}

function ProfileRow({
  hostName,
  hostPhotoUrl,
  rating,
  sessionCount,
}: Pick<HostShellProps, "hostName" | "hostPhotoUrl" | "rating" | "sessionCount">) {
  const parts: string[] = [];
  if (typeof rating === "number" && rating > 0) parts.push(`★ ${formatRating(rating)}`);
  if (typeof sessionCount === "number") parts.push(`${sessionCount} sesi`);
  const meta = parts.length > 0 ? parts.join(" · ") : "Belum ada ulasan";

  return (
    <div className="flex items-center gap-[10px] px-[6px]">
      <HostAvatar name={hostName} photoUrl={hostPhotoUrl} size={32} />
      <div className="min-w-0">
        <p className="m-0 mb-[2px] truncate text-[13px] font-semibold text-ink">
          {hostName}
        </p>
        <p className="m-0 truncate text-[11.5px] text-ink-faint">{meta}</p>
      </div>
    </div>
  );
}

export function HostShell({
  activeTab,
  onTabChange,
  hostName,
  hostPhotoUrl,
  rating,
  sessionCount,
  pendingCount = 0,
  liveClock,
  accepting,
  onAcceptingChange,
  children,
}: HostShellProps) {
  // Uncontrolled fallback. Nothing in the schema backs this yet, so it lives
  // and dies with the page — see not_done in the handover notes.
  const [localAccepting, setLocalAccepting] = useState(true);
  const isAccepting = accepting ?? localAccepting;
  const toggleAccepting = () => {
    const next = !isAccepting;
    if (onAcceptingChange) onAcceptingChange(next);
    else setLocalAccepting(next);
  };

  const navButton = (item: NavItem, variant: "sidebar" | "bar") => {
    const active = item.key === activeTab;
    if (variant === "bar") {
      return (
        <button
          key={item.key}
          type="button"
          onClick={() => onTabChange(item.key)}
          aria-current={active ? "page" : undefined}
          className={`relative flex flex-1 flex-col items-center justify-center gap-[3px] rounded-[8px] px-1 py-[6px] text-[11px] transition-colors duration-200 ${
            active ? "font-semibold text-ink" : "font-medium text-ink-muted"
          }`}
        >
          <span
            aria-hidden
            className={`text-[14px] leading-none ${active ? "text-brand" : "text-ink-ghost"}`}
          >
            {item.icon}
          </span>
          <span className="whitespace-nowrap">{item.label}</span>
          {item.key === "home" && pendingCount > 0 ? (
            <span className="absolute right-[14px] top-[2px] flex h-[19px] min-w-[19px] items-center justify-center rounded-[10px] bg-brand px-[5px] text-[10.5px] font-semibold leading-none text-white">
              {pendingCount}
            </span>
          ) : null}
        </button>
      );
    }
    return (
      <button
        key={item.key}
        type="button"
        onClick={() => onTabChange(item.key)}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-[11px] rounded-[8px] border-0 px-3 py-[11px] text-left text-copy transition-colors duration-[250ms] ${
          active
            ? "bg-surface-tint font-semibold text-ink"
            : "bg-transparent font-medium text-ink-muted hover:bg-surface-raised"
        }`}
      >
        <span
          aria-hidden
          className={`w-4 text-[13px] leading-none ${active ? "text-brand" : "text-ink-ghost"}`}
        >
          {item.icon}
        </span>
        {item.label}
        {item.key === "home" && pendingCount > 0 ? <NavBadge count={pendingCount} /> : null}
      </button>
    );
  };

  return (
    <div className="flex min-h-screen items-stretch bg-canvas">
      {/* SIDEBAR — desktop only. Below lg it becomes the bottom tab bar. */}
      <aside className="sticky top-0 hidden h-screen w-[230px] flex-shrink-0 flex-col border-r border-hairline bg-surface px-[14px] py-[22px] lg:flex">
        <div className="mb-6 flex items-baseline gap-[7px] px-[10px]">
          <span className="font-serif text-price font-semibold tracking-[-.01em] text-ink">
            Salda
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-[.13em] text-ink-ghost">
            host
          </span>
        </div>

        <nav className="flex flex-col gap-[2px]">
          {HOST_TABS.map((item) => navButton(item, "sidebar"))}
        </nav>

        <div className="mt-auto">
          <AcceptingToggle on={isAccepting} onToggle={toggleAccepting} />
        </div>
        <div className="mt-[14px]">
          <ProfileRow
            hostName={hostName}
            hostPhotoUrl={hostPhotoUrl}
            rating={rating}
            sessionCount={sessionCount}
          />
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div
          className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-hairline bg-canvas/[.85] backdrop-blur-[20px] backdrop-saturate-[180%]"
          style={{ padding: "0 clamp(20px,3.5vw,40px)" }}
        >
          <h1 className="m-0 truncate font-serif text-price font-medium text-ink">
            {HOST_TAB_TITLES[activeTab]}
          </h1>
          <div className="flex-1" />

          {liveClock ? (
            <div className="flex flex-shrink-0 items-center gap-[9px] rounded-[8px] bg-brand px-[13px] py-2">
              <span
                aria-hidden
                className="h-[6px] w-[6px] flex-shrink-0 rounded-[3px] bg-surface"
                style={{ animation: "h-live 1.6s ease-in-out infinite" }}
              />
              <span className="font-mono text-mini tracking-[.06em] text-white">
                {liveClock}
              </span>
            </div>
          ) : null}

          <Link
            href="/messages"
            className="flex h-[38px] min-w-[96px] flex-shrink-0 items-center justify-center rounded-[8px] border border-hairline bg-surface text-copy font-medium text-ink-body transition-colors hover:border-ink"
          >
            Pesan
          </Link>
        </div>

        <div
          className="w-full max-w-[1080px] flex-1"
          style={{ padding: "clamp(22px,3vw,32px) clamp(20px,3.5vw,40px) 90px" }}
        >
          {/* Below lg the sidebar is gone, so the two things it carried that are
              not navigation move to the top of the column rather than vanish. */}
          <div className="mb-6 flex flex-col gap-3 lg:hidden">
            <ProfileRow
              hostName={hostName}
              hostPhotoUrl={hostPhotoUrl}
              rating={rating}
              sessionCount={sessionCount}
            />
            <AcceptingToggle on={isAccepting} onToggle={toggleAccepting} />
          </div>

          {children}
        </div>
      </main>

      {/* BOTTOM TAB BAR — the sidebar's four items, below lg. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch gap-1 border-t border-hairline bg-surface/[.95] px-2 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur-[20px] backdrop-saturate-[180%] lg:hidden">
        {HOST_TABS.map((item) => navButton(item, "bar"))}
      </nav>
    </div>
  );
}

export default HostShell;
