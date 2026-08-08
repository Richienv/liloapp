"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";

/**
 * Money the host has, and the request to take it out.
 *
 * Everything here is a thin wrapper over two database functions
 * (supabase/migrations/20260806140000_payouts.sql). That is deliberate: the
 * balance arithmetic and the ownership check live in `security definer`
 * functions so they cannot be re-derived — differently — by a caller. This file
 * exists to shape errors for a human, not to make decisions about money.
 */

export interface StreamerBalance {
  /** Accepted or live sessions. The brand has paid; the work is not finished. */
  held: number;
  /** Completed, minus anything already withdrawn or requested. The withdraw button's number. */
  available: number;
  /** Payouts that actually landed. */
  withdrawn: number;
  /** Every completed session ever, before withdrawals. */
  lifetime: number;
}

const ZERO: StreamerBalance = { held: 0, available: 0, withdrawn: 0, lifetime: 0 };

/**
 * Read a host's balance.
 *
 * Returns zeros rather than throwing when the read fails. A dashboard that
 * cannot show a balance should show "Rp 0" with the rest of the page intact,
 * not a 500 — and every figure it feeds is decoration next to the sections that
 * tell a host which sessions need answering.
 */
export async function getStreamerBalance(streamerId: number): Promise<StreamerBalance> {
  if (!Number.isInteger(streamerId) || streamerId <= 0) return ZERO;

  const supabase = createClient();
  const { data, error } = await supabase.rpc("salda_streamer_balance", {
    target_streamer: streamerId,
  });

  if (error) {
    console.error(`[payouts] balance read failed for streamer ${streamerId}`, error);
    return ZERO;
  }

  // The function `returns table`, so PostgREST hands back an array of one row.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return ZERO;

  return {
    held: Number(row.held ?? 0),
    available: Number(row.available ?? 0),
    withdrawn: Number(row.withdrawn ?? 0),
    lifetime: Number(row.lifetime ?? 0),
  };
}

export interface PayoutRow {
  id: string;
  amount: number;
  status: "pending" | "processing" | "paid" | "rejected" | "cancelled";
  bank_name: string | null;
  account_number_masked: string | null;
  note: string | null;
  requested_at: string;
  processed_at: string | null;
}

/** "Riwayat pembayaran" — newest first. RLS scopes this to the caller's own rows. */
export async function listPayouts(streamerId: number, limit = 20): Promise<PayoutRow[]> {
  if (!Number.isInteger(streamerId) || streamerId <= 0) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("payouts")
    .select("id, amount, status, bank_name, account_number_masked, note, requested_at, processed_at")
    .eq("streamer_id", streamerId)
    .order("requested_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`[payouts] history read failed for streamer ${streamerId}`, error);
    return [];
  }
  return (data ?? []) as PayoutRow[];
}

/**
 * SQLSTATEs `salda_request_payout` raises, mapped to something a host can act
 * on. The function raises in Indonesian already; these cover the cases where
 * the raw message would leak a database detail or read as a system fault.
 */
const PAYOUT_ERRORS: Record<string, string> = {
  "42501": "Kamu tidak bisa menarik saldo host lain.",
  "22023": "Jumlah penarikan harus lebih dari nol.",
  "23502": "Belum ada rekening tujuan. Tambahkan rekening dulu di pengaturan.",
};

export interface PayoutRequestResult {
  success: boolean;
  error?: string;
  payoutId?: string;
}

/**
 * Ask for a withdrawal.
 *
 * `streamerId` arrives from the client and is NOT trusted — a server action is a
 * POSTable endpoint, so anyone can call this with any id. The database function
 * re-checks ownership against `auth.uid()` before it writes anything, which is
 * why that check lives there and not here: a guard in this file could be
 * bypassed by a second caller, one inside the function cannot.
 *
 * The amount is checked against the balance inside the same transaction that
 * inserts, under a lock on the host's row — so two taps four seconds apart
 * cannot both claim the same money.
 */
export async function requestPayout(
  streamerId: number,
  amount: number,
): Promise<PayoutRequestResult> {
  if (!Number.isInteger(streamerId) || streamerId <= 0) {
    return { success: false, error: "Host tidak dikenali." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "Jumlah penarikan harus lebih dari nol." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Kamu perlu masuk dulu." };
  }

  const { data, error } = await supabase.rpc("salda_request_payout", {
    target_streamer: streamerId,
    // Whole rupiah. The database column is bigint and would reject a fraction
    // anyway, but rounding here means the host sees the number they asked for.
    requested: Math.floor(amount),
  });

  if (error) {
    console.error(`[payouts] request failed for streamer ${streamerId}`, error);
    // 23514 is the balance check. Its message names the actual figure, which is
    // the single most useful thing to show, so it passes through as written.
    const mapped =
      PAYOUT_ERRORS[error.code ?? ""] ??
      (error.code === "23514"
        ? error.message
        : "Penarikan gagal. Coba lagi sebentar lagi.");
    return { success: false, error: mapped };
  }

  revalidatePath("/streamer-dashboard");
  return { success: true, payoutId: typeof data === "string" ? data : undefined };
}
