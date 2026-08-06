import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

export type Message =
  | { success: string }
  | { error: string }
  | { message: string };

// Pages hand us their raw `searchParams`, which is `{}` on a first visit and
// may carry unrelated keys (redirect_to, email). Accepting the partial shape
// keeps every call site cast-free.
export type MessageLike =
  | Message
  | { success?: string; error?: string; message?: string };

type Variant = "error" | "success" | "info";

// Colour alone must not be the signal: ~8% of men cannot reliably separate the
// red from the green, so each variant also carries a distinct icon *silhouette*
// (triangle / circle-tick / circle-i) and an announced label for screen readers.
// The icon inherits `currentColor` from the wrapper, so it can never drift
// below the contrast ratio the text already satisfies.
const VARIANTS: Record<
  Variant,
  {
    Icon: typeof Info;
    className: string;
    role: "alert" | "status";
    srLabel: string;
  }
> = {
  error: {
    Icon: AlertTriangle,
    className:
      "border-destructive/30 bg-destructive-subtle text-destructive-emphasis",
    role: "alert",
    srLabel: "Gagal:",
  },
  success: {
    Icon: CheckCircle2,
    className: "border-success/30 bg-success-subtle text-success-emphasis",
    role: "status",
    srLabel: "Berhasil:",
  },
  info: {
    Icon: Info,
    className: "border-border bg-muted text-muted-foreground",
    role: "status",
    srLabel: "Info:",
  },
};

function resolve(
  message: MessageLike | undefined,
): { variant: Variant; text: string } | null {
  if (!message) return null;

  // Guard on a non-empty string: `searchParams` is `{}` on a first visit, and
  // the previous implementation happily rendered an empty bordered box for it.
  if ("error" in message && message.error) {
    return { variant: "error", text: message.error };
  }
  if ("success" in message && message.success) {
    return { variant: "success", text: message.success };
  }
  if ("message" in message && message.message) {
    return { variant: "info", text: message.message };
  }
  return null;
}

export function FormMessage({
  message,
  className = "",
}: {
  message?: MessageLike;
  className?: string;
}) {
  const resolved = resolve(message);
  if (!resolved) return null;

  const { Icon, className: variantClass, role, srLabel } =
    VARIANTS[resolved.variant];

  return (
    <div
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      className={`flex w-full max-w-md items-start gap-2.5 rounded-panel border px-3.5 py-3 text-sm leading-snug ${variantClass} ${className}`}
    >
      <Icon aria-hidden="true" className="mt-px h-[18px] w-[18px] shrink-0" />
      <span className="min-w-0 break-words font-medium">
        <span className="sr-only">{srLabel} </span>
        {resolved.text}
      </span>
    </div>
  );
}
