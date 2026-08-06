"use client";

import * as React from "react";
import { AlertCircle, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  formatPhoneLocal,
  isValidPhone,
  normalizePhone,
  PHONE_INVALID_MESSAGE,
} from "@/lib/phone";

/**
 * Indonesian WhatsApp number field.
 *
 * The value handed back is the *national* digit string ("81234567890") — no
 * leading zero, no country code — which normalizePhone() accepts directly, so
 * the caller can do `normalizePhone(value)` at submit time to get E.164.
 *
 * Everything users actually type is absorbed here rather than rejected:
 * "0812…", "+62 812…", "62812…" and "(0812) 3456-789" all collapse to the same
 * national digits, because the number is how Salda reaches them on WhatsApp and
 * a rejected-looking field is a field people abandon.
 */

/** Longest national part we accept: "8" + 12 digits (see lib/phone). */
const MAX_NATIONAL_DIGITS = 13;

/**
 * Strip country code, leading zeros and every separator style people use.
 *
 * Order matters. Zeros are stripped, then "62", then zeros again, because all
 * three of these are things Indonesians actually write:
 *   "0812…"        -> "812…"
 *   "+62 812…"     -> "812…"
 *   "+62 0812…"    -> "812…"  (country code *and* the trunk zero — very common)
 *   "0062 812…"    -> "812…"  (the 00 international prefix)
 * A national number always starts with 8, so removing a leading "62" can never
 * eat a real subscriber digit.
 */
export function toNationalDigits(raw: string): string {
  let digits = (raw ?? "").replace(/\D/g, "");
  digits = digits.replace(/^0+/, "");
  if (digits.indexOf("62") === 0) digits = digits.slice(2);
  digits = digits.replace(/^0+/, "");
  return digits.slice(0, MAX_NATIONAL_DIGITS);
}

export interface PhoneInputProps {
  /** National digits, e.g. "81234567890". */
  value: string;
  onChange: (nationalDigits: string) => void;
  id?: string;
  /**
   * When set, a hidden input carries the normalized E.164 value so a native
   * form submission includes it. Forms building FormData by hand can ignore it.
   */
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  /**
   * Show the validation error even before the field has been blurred — used
   * when the step's "Lanjut" button was pressed with an invalid number.
   */
  forceShowError?: boolean;
  "aria-describedby"?: string;
}

export function PhoneInput({
  value,
  onChange,
  id,
  name,
  placeholder = "812 3456 7890",
  disabled = false,
  required = false,
  className,
  forceShowError = false,
  "aria-describedby": describedBy,
}: PhoneInputProps) {
  const [touched, setTouched] = React.useState(false);
  const reactId = React.useId();
  const errorId = `${reactId}-phone-error`;
  const hintId = `${reactId}-phone-hint`;
  const inputRef = React.useRef<HTMLInputElement>(null);

  /**
   * The contract is "value is national digits", but callers seed this field
   * from places that hold E.164 — a restored draft, a settings form reading
   * `users.phone` — so "+6281234567890" would otherwise render raw and read as
   * a different number than the one that gets submitted. Display the canonical
   * form always, and tell the parent about it once so the two agree.
   */
  const national = toNationalDigits(value);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  React.useEffect(() => {
    if (national !== value) onChangeRef.current(national);
  }, [national, value]);

  const valid = isValidPhone(national);
  const showError = (touched || forceShowError) && national.length > 0 && !valid;
  const showEmptyError =
    (touched || forceShowError) && national.length === 0 && required;

  /**
   * Only forms that submit natively (they pass `name`, so the hidden field
   * below is what actually travels) get native blocking. Without it an invalid
   * number submits as an empty string and the user never learns why. Forms that
   * build FormData by hand keep doing their own validation, untouched.
   */
  React.useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    if (!name) {
      input.setCustomValidity("");
      return;
    }
    const problem = national.length > 0 && !valid ? PHONE_INVALID_MESSAGE : "";
    input.setCustomValidity(problem);
  }, [name, national, valid]);

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "flex h-12 w-full items-center rounded-panel border bg-surface-tint transition-all duration-200",
          "focus-within:ring-1",
          showError || showEmptyError
            ? "border-red-300 focus-within:border-red-500 focus-within:ring-red-500"
            : "border-hairline-input focus-within:border-blue-500 focus-within:ring-blue-500",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
      >
        {/* Country affix: Salda only serves Indonesian numbers, so +62 is fixed
            rather than a country picker nobody would change. */}
        <span
          aria-hidden="true"
          className="flex h-full select-none items-center gap-2 border-r border-hairline-input px-4 text-base font-medium text-ink-muted"
        >
          🇮🇩 +62
        </span>
        <input
          ref={inputRef}
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={national}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          aria-invalid={showError || showEmptyError}
          aria-describedby={
            [describedBy, showError || showEmptyError ? errorId : hintId]
              .filter(Boolean)
              .join(" ") || undefined
          }
          // Deliberately no maxLength: it applies to pasted text too, so
          // pasting "+62 812-3456-7890" (18 characters) would be truncated
          // before toNationalDigits() ever saw the country code. The cap lives
          // in toNationalDigits() instead, after the noise is removed.
          onChange={(e) => onChange(toNationalDigits(e.target.value))}
          onBlur={() => setTouched(true)}
          className="h-full w-full min-w-0 flex-1 rounded-r-xl bg-transparent px-4 text-base outline-none placeholder:text-ink-faint disabled:cursor-not-allowed"
        />
      </div>

      {/* Carries the canonical E.164 value for native form submissions. */}
      {name && (
        <input
          type="hidden"
          name={name}
          value={normalizePhone(national) ?? ""}
        />
      )}

      {showError || showEmptyError ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-center gap-2 text-sm text-red-600"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {PHONE_INVALID_MESSAGE}
        </p>
      ) : valid ? (
        // aria-live so the confirmation is announced: the "+62" affix is
        // decorative markup a screen reader skips, and this line is the only
        // place the full stored number is read back.
        <p
          id={hintId}
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-green-600"
        >
          <Check className="h-4 w-4 flex-shrink-0" />
          Nomor tersimpan sebagai {formatPhoneLocal(normalizePhone(national))}
        </p>
      ) : (
        <p id={hintId} className="text-sm text-ink-soft">
          Nomor WhatsApp aktif, tulis tanpa awalan +62 atau 0 — dipakai admin
          Salda dan pihak brand untuk menghubungi kamu soal booking.
        </p>
      )}
    </div>
  );
}

export default PhoneInput;
