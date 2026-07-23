/**
 * Central pricing model for salda.id — the single source of truth for how a
 * streamer's base price becomes the amount shown/charged.
 *
 * The platform applies a *stacked* fee on top of the streamer's base price B:
 *   1. a 30% platform fee            -> subtotal = B * 1.30
 *   2. an 11% tax on that subtotal   -> total    = B * 1.30 * 1.11 = B * 1.443
 *
 * The multipliers are kept as exact literals (1.3 and 1.443) to preserve the
 * historical rounding behaviour of the call sites this replaced.
 *
 * ⚠️ Known reconciliation gap (AUDIT-AND-FIX-PLAN.md B3 / A4):
 * The UI already tells clients the displayed price is pre-tax
 * ("*harga belum termasuk pajak"), and streamer earnings are derived from the
 * tax-inclusive TOTAL (`baseFromTotal`, ÷1.443). But checkout currently charges
 * only the SUBTOTAL (×1.3), so the 11% tax is never actually collected. Both
 * helpers live here so that, once the owner confirms the direction, reconciling
 * is a single change at the checkout call site (subtotal -> total) rather than
 * hunting scattered magic numbers.
 */

export const PLATFORM_FEE_RATE = 0.3; // 30% platform fee on the base price
export const TAX_RATE = 0.11; // 11% tax applied on the platform-fee subtotal

// Exact literals: 1.3 and (1.3 * 1.11) = 1.443. Kept literal to match the
// rounding of the original hardcoded call sites.
export const SUBTOTAL_MULTIPLIER = 1.3;
export const TOTAL_MULTIPLIER = 1.443;

/** Base price + 30% platform fee (pre-tax subtotal). */
export function subtotalWithPlatformFee(basePrice: number): number {
  return basePrice * SUBTOTAL_MULTIPLIER;
}

/** Base price + 30% platform fee + 11% tax (final, tax-inclusive total). */
export function totalWithTax(basePrice: number): number {
  return basePrice * TOTAL_MULTIPLIER;
}

/** Recover the base price from a tax-inclusive total (inverse of totalWithTax). */
export function baseFromTotal(total: number): number {
  return total / TOTAL_MULTIPLIER;
}

/** Recover the base price from a pre-tax subtotal (inverse of subtotalWithPlatformFee). */
export function baseFromSubtotal(subtotal: number): number {
  return subtotal / SUBTOTAL_MULTIPLIER;
}
