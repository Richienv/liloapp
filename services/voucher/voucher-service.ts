import { createClient } from "@/utils/supabase/client";
import { PostgrestError } from "@supabase/supabase-js";

export interface Voucher {
  id: string;
  code: string;
  description: string;
  discount_amount: number;
  total_quantity: number;
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
      // Get voucher details
      const { data: voucher, error } = await supabase
        .from('vouchers')
        .select('*')
        .eq('code', code.toUpperCase())
        .eq('is_active', true)
        .single();

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
  },

  async trackVoucherUsage(
    voucherId: string, 
    bookingId: number, 
    userId: string, 
    discountApplied: number, 
    originalPrice: number, 
    finalPrice: number
  ): Promise<boolean> {
    const supabase = createClient();

    try {
      // Begin transaction-like operations
      // 1. First create the usage record
      const { error: usageError } = await supabase
        .from('voucher_usage')
        .insert({
          voucher_id: voucherId,
          booking_id: bookingId,
          user_id: userId,
          discount_applied: discountApplied,
          original_price: originalPrice,
          final_price: finalPrice
        });

      if (usageError) throw usageError;

      // 2. Then update the voucher quantity directly
      const { error: updateError } = await supabase
        .rpc('decrement_voucher_quantity_safe', {
          p_voucher_id: voucherId
        });

      if (updateError) throw updateError;

      // 3. Verify the update
      const { data: updatedVoucher, error: verifyError } = await supabase
        .from('vouchers')
        .select('remaining_quantity, total_quantity')
        .eq('id', voucherId)
        .single();

      if (verifyError) throw verifyError;

      // If quantity wasn't decremented, rollback by deleting the usage record
      if (!updatedVoucher || updatedVoucher.remaining_quantity >= updatedVoucher.total_quantity) {
        await supabase
          .from('voucher_usage')
          .delete()
          .eq('voucher_id', voucherId)
          .eq('booking_id', bookingId);
        
        throw new Error('Failed to decrement voucher quantity');
      }

      return true;
    } catch (error) {
      console.error('Error tracking voucher usage:', error);
      // Attempt to rollback if there's an error
      try {
        await supabase
          .from('voucher_usage')
          .delete()
          .eq('voucher_id', voucherId)
          .eq('booking_id', bookingId);
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }
      return false;
    }
  }
}; 