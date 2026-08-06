import { ArrowUpRight, InfoIcon } from "lucide-react";
import Link from "next/link";

/**
 * The Supabase starter's SMTP notice.
 *
 * Nothing renders it today — it is left in place, but brought onto the design
 * system's ink and hairlines and into the product's one language, so it cannot
 * reappear as the single English, shadcn-token panel in an otherwise Indonesian
 * flow.
 */
export function SmtpMessage() {
  return (
    <div className="flex gap-3 rounded-panel border border-hairline bg-surface-tint px-4 py-3">
      <InfoIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
      <div className="flex flex-col gap-1">
        <p className="text-copy text-ink-body">
          Pengiriman email dibatasi jumlahnya. Aktifkan SMTP kustom untuk menaikkan
          batasnya.
        </p>
        <Link
          href="https://supabase.com/docs/guides/auth/auth-smtp"
          target="_blank"
          className="inline-flex items-center gap-1 text-meta font-medium text-ink underline decoration-hairline-strong underline-offset-2 transition-colors hover:decoration-ink"
        >
          Pelajari selengkapnya
          <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
