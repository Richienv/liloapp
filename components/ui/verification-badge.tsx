import { BadgeCheck, Clock3, ShieldOff, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Verification states a streamer account can be in. Mirrors the
 * `streamers.verification_status` check constraint.
 */
export type VerificationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "suspended";

/**
 * The only status that lets a streamer be listed and booked. Brands ship real
 * products to a streamer's home address, so anything short of an explicit admin
 * approval must not be presented as trustworthy.
 */
export function isVerificationApproved(status?: string | null): boolean {
  return status === "approved";
}

/**
 * Four states, four token pairs — no raw Tailwind hues.
 *
 * `green-50 / yellow-50 / red-50` are the cool palette the rest of the app has
 * already left behind; on the warm canvas they read as three different
 * temperatures in the same row. The redesign has exactly one positive pair and
 * one caution pair, both defined as *text on a tint with a line* rather than a
 * saturated block, so a verified marker never outweighs the host's own name
 * next to it.
 */
const STATUS_COPY: Record<
  VerificationStatus,
  { label: string; description: string; className: string; Icon: typeof BadgeCheck }
> = {
  approved: {
    label: "Terverifikasi",
    description: "Identitas dan akun streaming sudah diverifikasi tim Salda",
    className: "border-positive-line bg-positive-tint text-positive",
    Icon: BadgeCheck,
  },
  pending: {
    label: "Menunggu verifikasi",
    description: "Dokumen sedang ditinjau tim Salda",
    className: "border-caution-line bg-caution-tint text-caution",
    Icon: Clock3,
  },
  rejected: {
    label: "Ditolak",
    description: "Pengajuan verifikasi ditolak",
    className:
      "border-destructive-emphasis/20 bg-destructive-subtle text-destructive-emphasis",
    Icon: XCircle,
  },
  suspended: {
    label: "Ditangguhkan",
    description: "Akun ditangguhkan sementara",
    className: "border-hairline-input bg-surface-tint text-ink-muted",
    Icon: ShieldOff,
  },
};

function resolveStatus(status?: string | null): VerificationStatus {
  return status && status in STATUS_COPY
    ? (status as VerificationStatus)
    : "pending";
}

/**
 * Trust signal shown to brands on public surfaces. Renders nothing unless the
 * streamer is approved — an unverified profile should read as "no badge", never
 * as a badge with a softer colour, so the marker keeps its meaning.
 */
export function VerificationBadge({
  status,
  className,
  showLabel = true,
}: {
  status?: string | null;
  className?: string;
  showLabel?: boolean;
}) {
  if (!isVerificationApproved(status)) return null;

  const { label, description } = STATUS_COPY.approved;

  return (
    <span
      title={description}
      aria-label={description}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-chip border border-positive-line bg-positive-tint px-1.5 py-0.5 text-micro font-medium uppercase text-positive",
        className
      )}
    >
      <BadgeCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
      {showLabel && label}
    </span>
  );
}

/**
 * Full-spectrum status pill for internal surfaces (the admin verification
 * queue), where every state has to be legible — not just the approved one.
 */
export function VerificationStatusBadge({
  status,
  className,
}: {
  status?: string | null;
  className?: string;
}) {
  const { label, className: statusClassName, Icon } = STATUS_COPY[resolveStatus(status)];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-chip border px-2 py-0.5 text-mini font-medium",
        statusClassName,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
