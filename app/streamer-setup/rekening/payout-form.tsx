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
        <div className="rounded-panel border border-hairline bg-surface-tint p-4">
          {/* Bank, masked number and state on one line that never wraps: the
              state is a word, not a filled chip. */}
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-ui font-medium text-ink">
                {existingAccount.bankName}
              </p>
              <p className="numeric truncate font-mono text-copy text-ink-body">
                {existingAccount.maskedNumber}
              </p>
            </div>

            <span
              className={`flex shrink-0 items-center gap-1.5 text-mini ${
                existingAccount.verified ? "text-positive" : "text-caution"
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

          <p className="mt-1 truncate text-meta text-ink-soft">
            a.n. {existingAccount.holderName}
          </p>

          {!showForm && (
            <div className="mt-4">
              <Button
                variant="quiet"
                size="action-compact"
                onClick={() => {
                  setShowForm(true);
                  setError(null);
                }}
              >
                Ganti rekening
              </Button>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* Reassurance, in ink. A blue panel here would compete with the one
              blue this screen is allowed: the save button. */}
          <p className="flex items-start gap-2 rounded-panel border border-hairline bg-surface-tint px-4 py-3 text-copy text-ink-body">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-ghost" />
            <span>
              Rekening ini hanya dipakai untuk mengirim penghasilan kamu. Brand tidak pernah
              melihatnya, dan datanya tidak ditampilkan di profil publik.
            </span>
          </p>

          <div className="space-y-2">
            <Label htmlFor="bank_code" className="text-copy font-medium text-ink-body">
              Bank
            </Label>
            <select
              id="bank_code"
              name="bank_code"
              value={bankCode}
              onChange={(event) => setBankCode(event.target.value)}
              autoComplete="off"
              className="h-12 w-full rounded-field border border-hairline-input bg-surface px-3.5 text-ink
                transition-colors focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
            <Label htmlFor="account_number" className="text-copy font-medium text-ink-body">
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
              className="numeric h-12 rounded-field border-hairline-input bg-surface px-3.5 font-mono text-ink
                placeholder:text-ink-ghost focus-visible:ring-1 focus-visible:ring-brand focus-visible:ring-offset-0"
              style={{ fontSize: "16px" }}
            />
            <p id="account_number-help" className="text-meta text-ink-soft">
              Angka saja, tanpa spasi atau tanda hubung.
            </p>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="account_holder_name"
              className="text-copy font-medium text-ink-body"
            >
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
              className="h-12 rounded-field border-hairline-input bg-surface px-3.5 text-ink
                placeholder:text-ink-ghost focus-visible:ring-1 focus-visible:ring-brand focus-visible:ring-offset-0"
              style={{ fontSize: "16px" }}
            />
            <p id="account_holder_name-help" className="text-meta text-ink-soft">
              Tulis persis seperti di buku tabungan. Nama yang tidak cocok membuat transfer
              ditolak bank.
            </p>
          </div>

          {error && (
            <p
              role="alert"
              aria-live="assertive"
              className="rounded-panel border border-destructive-emphasis/25 bg-destructive-subtle px-4 py-3 text-copy text-destructive-emphasis"
            >
              {error}
            </p>
          )}

          {/* The pair shares one row. Stacking "Batal" under a full-width save
              button is exactly the two-line pair the design forbids. */}
          {existingAccount ? (
            <div className="flex gap-2">
              <Button type="submit" variant="brand" size="action" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Menyimpan…
                  </>
                ) : (
                  "Simpan rekening baru"
                )}
              </Button>
              <Button
                type="button"
                variant="quiet"
                size="action-secondary"
                onClick={() => {
                  setShowForm(false);
                  setError(null);
                }}
              >
                Batal
              </Button>
            </div>
          ) : (
            <Button type="submit" variant="brand" size="action-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Menyimpan…
                </>
              ) : (
                "Simpan rekening"
              )}
            </Button>
          )}

          <p className="flex items-center justify-center gap-1.5 text-center text-meta text-ink-soft">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-ink-ghost" />
            Rekening lama tetap tersimpan sebagai riwayat, tapi pencairan berikutnya memakai
            rekening ini.
          </p>
        </form>
      )}
    </div>
  );
}
