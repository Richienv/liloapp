"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Loader2, Lock, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveStreamerPayoutAccount, type PayoutBank } from "../actions";

/**
 * Milestone 3: somewhere to send the money.
 *
 * A host who already has an account sees it masked and does nothing — the form
 * stays folded away behind an explicit "replace" action, because re-typing a
 * bank account you already gave us is both pointless and a chance to get it
 * wrong.
 */

export interface ExistingPayoutAccount {
  bankName: string;
  /** Already masked server-side; the full number never reaches the browser. */
  maskedNumber: string;
  holderName: string;
  verified: boolean;
}

export interface PayoutFormProps {
  banks: PayoutBank[];
  existingAccount: ExistingPayoutAccount | null;
}

export function PayoutForm({ banks, existingAccount }: PayoutFormProps) {
  const router = useRouter();

  const [showForm, setShowForm] = useState(!existingAccount);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [holderName, setHolderName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("bank_code", bankCode);
      formData.append("account_number", accountNumber);
      formData.append("account_holder_name", holderName);

      const result = await saveStreamerPayoutAccount(formData);

      if (result.success) {
        router.push("/streamer-setup");
        router.refresh();
        return;
      }

      setError(result.error ?? "Terjadi kesalahan. Silakan coba lagi.");
    } catch (submitError) {
      console.error("Payout account save failed", submitError);
      setError("Terjadi kesalahan jaringan. Coba lagi sebentar lagi.");
    } finally {
      // Always re-enable, so a rejected account number never strands the form.
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {existingAccount && (
        <div className="rounded-panel border border-hairline bg-surface-tint/70 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">
                {existingAccount.bankName}
              </p>
              <p className="mt-0.5 font-mono text-sm text-ink-body">
                {existingAccount.maskedNumber}
              </p>
              <p className="mt-0.5 truncate text-sm text-ink-muted">
                a.n. {existingAccount.holderName}
              </p>
            </div>

            <span
              className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                existingAccount.verified
                  ? "bg-green-50 text-green-700"
                  : "bg-yellow-50 text-yellow-800"
              }`}
            >
              {existingAccount.verified ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <Clock className="h-3.5 w-3.5" />
              )}
              {existingAccount.verified ? "Terverifikasi" : "Menunggu pengecekan"}
            </span>
          </div>

          {!showForm && (
            <button
              type="button"
              onClick={() => {
                setShowForm(true);
                setError(null);
              }}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-panel border-2
                border-hairline-input bg-surface px-4 text-sm font-medium text-ink-body transition-colors
                hover:bg-surface-tint"
            >
              Ganti rekening
            </button>
          )}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="rounded-panel border border-blue-100 bg-blue-50/60 p-4">
            <p className="flex items-start gap-2 text-sm text-blue-900">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Rekening ini hanya dipakai untuk mengirim penghasilan kamu. Brand tidak pernah
                melihatnya, dan datanya tidak ditampilkan di profil publik.
              </span>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bank_code" className="text-sm font-medium text-ink-body">
              Bank
            </Label>
            <select
              id="bank_code"
              name="bank_code"
              value={bankCode}
              onChange={(event) => setBankCode(event.target.value)}
              autoComplete="off"
              className="h-12 w-full rounded-panel border border-hairline-input bg-surface-tint px-4 text-base
                transition-all duration-200 focus:border-blue-500 focus:outline-none focus:ring-1
                focus:ring-blue-500"
              style={{ fontSize: "16px" }}
            >
              <option value="">Pilih bank</option>
              {banks.map((bank) => (
                <option key={bank.code} value={bank.code}>
                  {bank.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="account_number" className="text-sm font-medium text-ink-body">
              Nomor rekening
            </Label>
            <Input
              id="account_number"
              name="account_number"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={accountNumber}
              // Strip as they type: a pasted "1234 5678 90" is the right number
              // written the way people read it out loud, not an error.
              onChange={(event) => setAccountNumber(event.target.value.replace(/[^\d]/g, ""))}
              maxLength={20}
              placeholder="1234567890"
              aria-describedby="account_number-help"
              className="h-12 rounded-panel border-hairline-input bg-surface-tint/50 font-mono text-base focus:bg-surface"
              style={{ fontSize: "16px" }}
            />
            <p id="account_number-help" className="text-xs text-ink-soft">
              Angka saja, tanpa spasi atau tanda hubung.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="account_holder_name" className="text-sm font-medium text-ink-body">
              Nama pemilik rekening
            </Label>
            <Input
              id="account_holder_name"
              name="account_holder_name"
              type="text"
              autoComplete="name"
              value={holderName}
              onChange={(event) => setHolderName(event.target.value)}
              maxLength={100}
              placeholder="RIZKY PRATAMA"
              aria-describedby="account_holder_name-help"
              className="h-12 rounded-panel border-hairline-input bg-surface-tint/50 text-base focus:bg-surface"
              style={{ fontSize: "16px" }}
            />
            <p id="account_holder_name-help" className="text-xs text-ink-soft">
              Tulis persis seperti di buku tabungan. Nama yang tidak cocok membuat transfer
              ditolak bank.
            </p>
          </div>

          {error && (
            <p
              role="alert"
              aria-live="assertive"
              className="rounded-panel border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive-emphasis"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-11 w-full rounded-panel bg-brand font-medium
              text-white transition-all"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Menyimpan…
              </span>
            ) : existingAccount ? (
              "Simpan rekening baru"
            ) : (
              "Simpan rekening"
            )}
          </Button>

          {existingAccount && (
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
              className="w-full text-center text-sm font-medium text-ink-soft transition-colors hover:text-ink-body"
            >
              Batal
            </button>
          )}

          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-soft">
            <ShieldCheck className="h-3.5 w-3.5" />
            Rekening lama tetap tersimpan sebagai riwayat, tapi pencairan berikutnya memakai
            rekening ini.
          </p>
        </form>
      )}
    </div>
  );
}
