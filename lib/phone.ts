/**
 * Indonesian mobile number handling.
 *
 * The phone number is how Salda actually reaches a user — WhatsApp is the
 * support channel and the coordination channel between a brand and a streamer
 * around a booking — so it is stored in one canonical shape (E.164, e.g.
 * "+6281234567890") no matter which of the many local forms was typed.
 */

/** Canonical E.164 form for an Indonesian mobile number. */
export type E164Phone = string;

/**
 * Indonesian mobile numbers are 08xx / +628xx / 628xx, with a subscriber part
 * of 9–13 digits after the leading "8". Landlines are deliberately not accepted:
 * every use of this field is a WhatsApp or SMS reach.
 */
const MOBILE_NATIONAL = /^8\d{8,12}$/;

/**
 * Normalize any locally-written Indonesian mobile number to E.164.
 * Accepts "08123456789", "8123456789", "+62 812-3456-789", "62 812 3456 789",
 * and "(0812) 3456-789". Returns null when the input is not a plausible
 * Indonesian mobile number.
 */
export function normalizePhone(raw: string | null | undefined): E164Phone | null {
  if (!raw) return null;

  // Keep digits only; a leading "+" carries no information once we know the
  // country, and every separator style people use is punctuation.
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("62")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = digits.replace(/^0+/, "");
  }

  if (!MOBILE_NATIONAL.test(digits)) return null;

  return `+62${digits}`;
}

export function isValidPhone(raw: string | null | undefined): boolean {
  return normalizePhone(raw) !== null;
}

/**
 * Render a stored E.164 number in the local form Indonesians read most easily:
 * "+6281234567890" -> "0812-3456-7890".
 */
export function formatPhoneLocal(phone: string | null | undefined): string {
  const normalized = normalizePhone(phone);
  if (!normalized) return phone ?? "";

  const national = `0${normalized.slice(3)}`;
  // Group as 4-4-rest, the conventional Indonesian mobile grouping.
  return national.replace(/^(\d{4})(\d{4})(\d+)$/, "$1-$2-$3");
}

/** Build a wa.me link for a stored number. Returns null if the number is unusable. */
export function whatsappLink(
  phone: string | null | undefined,
  message?: string
): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const base = `https://wa.me/${normalized.replace("+", "")}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** User-facing validation copy, in Indonesian, matching the rest of the signup UI. */
export const PHONE_INVALID_MESSAGE =
  "Masukkan nomor WhatsApp Indonesia yang valid, contoh: 0812-3456-7890.";
