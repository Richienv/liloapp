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

const STATUS_COPY: Record<
  VerificationStatus,
  { label: string; description: string; className: string; Icon: typeof BadgeCheck }
> = {
  approved: {
    label: "Terverifikasi",
    description: "Identitas dan akun streaming sudah diverifikasi tim Salda",
    className: "bg-green-50 text-green-700 border-green-200",
    Icon: BadgeCheck,
  },
  pending: {
    label: "Menunggu Verifikasi",
    description: "Dokumen sedang ditinjau tim Salda",
    className: "bg-yellow-50 text-yellow-700 border-yellow-200",
    Icon: Clock3,
  },
  rejected: {
    label: "Ditolak",
    description: "Pengajuan verifikasi ditolak",
    className: "bg-red-50 text-red-700 border-red-200",
    Icon: XCircle,
  },
  suspended: {
    label: "Ditangguhkan",
    description: "Akun ditangguhkan sementara",
    className: "bg-gray-100 text-gray-600 border-gray-200",
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
        "inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700",
        className
      )}
    >
      <BadgeCheck className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
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
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        statusClassName,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
