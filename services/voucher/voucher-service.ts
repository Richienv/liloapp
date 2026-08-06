import { createClient } from "@/utils/supabase/client";

/**
 * Read-only, and deliberately so.
 *
 * Checkout has to be able to check a code the moment someone types it, so this
 * runs in the browser with the anon key and `public.vouchers` grants `select` to
 * anon and authenticated (see
 * supabase/migrations/20260806100000_lock_down_vouchers.sql). What that table no
 * longer grants is any kind of write: creating a voucher is an admin server
 * action, and recording a redemption happens server-side in
 * services/payment/payment-service.ts with the service-role client.
 *
 * This module used to also export `trackVoucherUsage`, which inserted into
 * `voucher_usage` and decremented `vouchers.remaining_quantity` from the
 * browser. Nothing called it — the live redemption path has been the server-side
 * one for some time — and keeping a client-callable writer against the tables
 * that decide how much money changes hands is a liability with no upside, so it
 * is gone rather than ported.
 *
 * Note that the result below is advisory. It drives what the user sees; it does
 * not decide what they are charged. app/api/payments/create re-reads the voucher
 * server-side and recomputes the discount before any amount reaches Midtrans.
 */

export interface Voucher {
  id: string;
  code: string;
  discount_amount: number;
  remaining_quantity: number;
  is_active: boolean;
  expires_at: string;
}

export interface VoucherValidationResult {
  isValid: boolean;
  voucher?: Voucher;
  error?: string;
  discountAmount?: number;
}

export const voucherService = {
  async validateVoucher(code: string, bookingAmount: number): Promise<VoucherValidationResult> {
    const supabase = createClient();

    try {
      // Only the columns validation actually needs. The row is readable by
      // anyone with the anon key, so there is no reason to pull the rest of it
      // across the wire.
      //
      // maybeSingle, not single: a code that matches nothing — because it is
      // mistyped, or because it is switched off and therefore invisible under
      // the select policy — is an ordinary "not found", not a failure. With
      // `single()` it raised PGRST116 and fell into the catch below, so the user
      // got "terjadi kesalahan" for what is really a wrong code.
      const { data: voucher, error } = await supabase
        .from('vouchers')
        .select('id, code, discount_amount, remaining_quantity, is_active, expires_at')
        .eq('code', code.trim().toUpperCase())
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;
      if (!voucher) return { isValid: false, error: 'Voucher tidak ditemukan' };

      // Validate expiration
      if (new Date(voucher.expires_at) < new Date()) {
        return { isValid: false, error: 'Voucher sudah kadaluarsa' };
      }

      // Validate quantity
      if (voucher.remaining_quantity <= 0) {
        return { isValid: false, error: 'Voucher sudah habis' };
      }

      // Calculate discount
      const discountAmount = Math.min(voucher.discount_amount, bookingAmount);

      return {
        isValid: true,
        voucher,
        discountAmount
      };
    } catch (error) {
      console.error('Error validating voucher:', error);
      return { isValid: false, error: 'Terjadi kesalahan saat validasi voucher' };
    }
  }
};
