import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/server";
import { listPayoutBanks } from "../actions";
import { PayoutForm } from "./payout-form";

export const metadata = {
  title: "Rekening Payout | Salda",
  robots: { index: false, follow: false },
};

// Bank details are never cached: this page renders one host's account and is
// re-read after every save.
export const dynamic = "force-dynamic";

/**
 * Show enough of an account number to recognise it, never enough to use it.
 * "1234567890" -> "•••• 7890".
 */
function maskAccountNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  return `•••• ${digits.slice(-4)}`;
}

export default async function StreamerPayoutPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in?redirect_to=/streamer-setup/rekening");
  }

  const { data: streamer } = await supabase
    .from("streamers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!streamer) {
    return (
      <div className="min-h-screen bg-canvas">
        <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="rounded-frame border border-hairline bg-surface p-5 sm:p-8">
            <h1 className="font-serif text-title font-semibold text-ink">
              Halaman khusus host
            </h1>
            <p className="mt-2 text-copy text-ink-muted">
              Rekening payout hanya untuk akun host. Akun ini terdaftar sebagai brand.
            </p>
            <div className="mt-6">
              <Button asChild variant="brand" size="action">
                <Link href="/protected">Kembali ke beranda</Link>
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // The primary account is the one payouts go to; older rows are kept for
  // reconciliation but are not what the host needs to see here.
  const { data: account } = await supabase
    .from("streamer_payout_accounts")
    .select("id, bank_name, account_number, account_holder_name, verified_at")
    .eq("streamer_id", streamer.id)
    .eq("is_primary", true)
    .maybeSingle();

  const banks = await listPayoutBanks();

  return (
    <div className="min-h-screen bg-canvas">
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <header>
          <Link
            href="/streamer-setup"
            className="-ml-1 inline-flex items-center gap-1 text-meta text-ink-soft transition-colors hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" />
            Kembali ke setup
          </Link>

          <p className="mt-4 font-mono text-tiny uppercase text-ink-ghost">
            Langkah 3 dari 3
          </p>
          <h1 className="mt-2 font-serif text-section font-semibold text-ink sm:text-display">
            {account ? "Rekening payout kamu" : "Tambah rekening payout"}
          </h1>
          <p className="mt-2 text-lede text-ink-soft">
            Ke sinilah penghasilan dari setiap sesi live dikirim. Tiga isian, kurang dari satu
            menit.
          </p>
        </header>

        <div className="mt-8 rounded-frame border border-hairline bg-surface p-4 sm:p-6">
          <PayoutForm
            banks={banks}
            existingAccount={
              account
                ? {
                    bankName: account.bank_name,
                    maskedNumber: maskAccountNumber(account.account_number),
                    holderName: account.account_holder_name,
                    verified: Boolean(account.verified_at),
                  }
                : null
            }
          />
        </div>
      </main>
    </div>
  );
}
