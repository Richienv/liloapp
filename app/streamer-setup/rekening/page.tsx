import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Wallet } from "lucide-react";

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
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.08)] sm:p-8">
          <h1 className="text-xl font-semibold text-gray-900">Halaman khusus host</h1>
          <p className="mt-2 text-gray-600">
            Rekening payout hanya untuk akun host. Akun ini terdaftar sebagai brand.
          </p>
          <Link
            href="/protected"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r
              from-blue-600 to-indigo-600 px-5 font-medium text-white transition-all
              hover:from-blue-700 hover:to-indigo-700"
          >
            Kembali ke beranda
          </Link>
        </div>
      </main>
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
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link
        href="/streamer-setup"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke setup
      </Link>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
        <div className="p-6 sm:p-8">
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
            <Wallet className="h-4 w-4" /> Langkah 3 dari 3
          </span>
          <h1 className="mt-4 text-xl font-semibold text-gray-900">
            {account ? "Rekening payout kamu" : "Tambah rekening payout"}
          </h1>
          <p className="mt-2 text-gray-600">
            Ke sinilah penghasilan dari setiap sesi live dikirim. Tiga isian, kurang dari satu
            menit.
          </p>

          <div className="mt-6">
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
        </div>
      </div>
    </main>
  );
}
