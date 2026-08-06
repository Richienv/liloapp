"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { getAdmin } from "@/lib/admin";

const VOUCHERS_PATH = "/admin/vouchers";

/**
 * Voucher writes live here, not in the browser.
 *
 * `app/admin/vouchers/page.tsx` used to insert into `vouchers` with the anon
 * key, which is why RLS on that table had to stay off — and with RLS off plus
 * Supabase's default grants, anyone who read the key out of the bundle could
 * mint themselves a 100%-off code. Moving the write here is the half of the fix
 * that lets `supabase/migrations/20260806100000_lock_down_vouchers.sql` turn RLS
 * on without breaking the admin page.
 *
 * Two rules hold for every action in this file:
 *
 *  1. It re-derives admin identity with `getAdmin()`. A server action is a
 *     directly-POSTable endpoint; the fact that `app/admin/layout.tsx` guards
 *     the page these forms were rendered from protects nothing on that request.
 *
 *  2. It re-validates everything. The form's zod schema is a UX affordance —
 *     the request does not have to come from the form.
 *
 * The write itself uses the service-role client, matching `app/admin/actions.ts`.
 * Service role bypasses RLS, so the admin page keeps working whether or not the
 * migration has been applied yet.
 */

export interface CreateVoucherInput {
  code: string;
  description: string;
  discount_amount: number;
  total_quantity: number;
  expires_at: string;
}

export interface CreatedVoucher {
  id: string;
  code: string;
  description: string;
  discount_amount: number;
  total_quantity: number;
  remaining_quantity: number;
  is_active: boolean;
  expires_at: string;
  created_at: string;
}

export interface VoucherActionResult {
  success: boolean;
  error?: string;
  voucher?: CreatedVoucher;
}

/** Mirrors the form's rules, but this copy is the one that decides. */
const CODE_PATTERN = /^[A-Z0-9]{6}$/;
const MIN_DISCOUNT = 1_000;
const MAX_DISCOUNT = 10_000_000;
const MAX_QUANTITY = 1_000;
const MAX_DESCRIPTION = 100;

interface ValidVoucher {
  code: string;
  description: string;
  discount_amount: number;
  total_quantity: number;
  expires_at: string;
}

/**
 * Returns either the cleaned row to insert or the Indonesian message to show.
 * Everything arrives as `unknown` on purpose: a server action's arguments are
 * whatever the caller serialised, not whatever the TypeScript signature claims.
 */
function validate(input: CreateVoucherInput): { voucher: ValidVoucher } | { error: string } {
  const raw = input as Partial<Record<keyof CreateVoucherInput, unknown>> | null;
  if (!raw || typeof raw !== "object") {
    return { error: "Data voucher tidak lengkap." };
  }

  const code = String(raw.code ?? "").trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) {
    return { error: "Kode voucher harus 6 karakter, hanya huruf kapital dan angka." };
  }

  const description = String(raw.description ?? "").trim();
  if (!description) {
    return { error: "Deskripsi voucher wajib diisi." };
  }
  if (description.length > MAX_DESCRIPTION) {
    return { error: `Deskripsi voucher maksimal ${MAX_DESCRIPTION} karakter.` };
  }

  const discountAmount = Number(raw.discount_amount);
  if (!Number.isInteger(discountAmount)) {
    return { error: "Nominal diskon harus berupa angka bulat." };
  }
  // The lower bound is what actually matters: a negative discount would *raise*
  // the price a customer is charged at checkout, since the payment route
  // subtracts this number from the gross total.
  if (discountAmount < MIN_DISCOUNT || discountAmount > MAX_DISCOUNT) {
    return {
      error: `Nominal diskon harus antara Rp ${MIN_DISCOUNT.toLocaleString("id-ID")} dan Rp ${MAX_DISCOUNT.toLocaleString("id-ID")}.`,
    };
  }

  const totalQuantity = Number(raw.total_quantity);
  if (!Number.isInteger(totalQuantity)) {
    return { error: "Jumlah voucher harus berupa angka bulat." };
  }
  if (totalQuantity < 1 || totalQuantity > MAX_QUANTITY) {
    return { error: `Jumlah voucher harus antara 1 dan ${MAX_QUANTITY.toLocaleString("id-ID")}.` };
  }

  const expiresAtRaw = String(raw.expires_at ?? "").trim();
  const expiresAt = new Date(expiresAtRaw);
  if (!expiresAtRaw || Number.isNaN(expiresAt.getTime())) {
    return { error: "Tanggal kadaluarsa tidak valid." };
  }
  // Strictly in the future. A date-only value lands on midnight UTC, so today's
  // date is already in the past everywhere in Indonesia — a voucher created with
  // it would be born expired, because validateVoucher compares expires_at
  // against now(). Rejecting it is clearer than silently minting a dead code.
  if (expiresAt.getTime() <= Date.now()) {
    return { error: "Tanggal kadaluarsa harus di masa depan." };
  }

  return {
    voucher: {
      code,
      description,
      discount_amount: discountAmount,
      total_quantity: totalQuantity,
      expires_at: expiresAtRaw,
    },
  };
}

export async function createVoucher(input: CreateVoucherInput): Promise<VoucherActionResult> {
  const admin = await getAdmin();
  if (!admin) {
    return { success: false, error: "Kamu tidak punya akses untuk membuat voucher." };
  }

  const validated = validate(input);
  if ("error" in validated) {
    return { success: false, error: validated.error };
  }

  // No fallback to the caller's session client here, unlike app/admin/actions.ts.
  // Once RLS is on, `vouchers` has no insert policy at all, so a session-client
  // insert cannot succeed — it would fail, or worse report a success that RLS
  // swallowed. Saying so plainly is the only useful behaviour.
  const db = createAdminClient();
  if (!db) {
    return {
      success: false,
      error:
        "Server belum dikonfigurasi untuk membuat voucher (SUPABASE_SERVICE_ROLE_KEY belum diset). Hubungi tim teknis.",
    };
  }

  const { data, error } = await db
    .from("vouchers")
    .insert({
      ...validated.voucher,
      // Not taken from the form: a new voucher always starts with its full
      // stock and switched on.
      remaining_quantity: validated.voucher.total_quantity,
      is_active: true,
    })
    .select(
      "id, code, description, discount_amount, total_quantity, remaining_quantity, is_active, expires_at, created_at",
    )
    .single();

  if (error) {
    console.error("createVoucher: insert failed", error);
    // 23505 is the unique violation on `code`. Naming the collision is more
    // useful than a generic failure, and it leaks nothing the admin submitted.
    if (error.code === "23505") {
      return { success: false, error: `Kode voucher ${validated.voucher.code} sudah dipakai.` };
    }
    return {
      success: false,
      error: "Gagal membuat voucher. Periksa koneksi database atau izin service role.",
    };
  }

  if (!data) {
    return { success: false, error: "Voucher tidak tersimpan. Coba lagi." };
  }

  revalidatePath(VOUCHERS_PATH);

  return { success: true, voucher: data as CreatedVoucher };
}
