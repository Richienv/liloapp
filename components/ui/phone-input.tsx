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

/** Strip country code, leading zeros and every separator style people use. */
export function toNationalDigits(raw: string): string {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("62")) digits = digits.slice(2);
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

  const valid = isValidPhone(value);
  const showError = (touched || forceShowError) && value.length > 0 && !valid;
  const showEmptyError = (touched || forceShowError) && value.length === 0 && required;

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "flex h-12 w-full items-center rounded-xl border bg-gray-50 transition-all duration-200",
          "focus-within:ring-1",
          showError || showEmptyError
            ? "border-red-300 focus-within:border-red-500 focus-within:ring-red-500"
            : "border-gray-200 focus-within:border-blue-500 focus-within:ring-blue-500",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
      >
        {/* Country affix: Salda only serves Indonesian numbers, so +62 is fixed
            rather than a country picker nobody would change. */}
        <span
          aria-hidden="true"
          className="flex h-full select-none items-center gap-2 border-r border-gray-200 px-4 text-base font-medium text-gray-600"
        >
          🇮🇩 +62
        </span>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={value}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          aria-invalid={showError || showEmptyError}
          aria-describedby={
            [describedBy, showError || showEmptyError ? errorId : hintId]
              .filter(Boolean)
              .join(" ") || undefined
          }
          onChange={(e) => onChange(toNationalDigits(e.target.value))}
          onBlur={() => setTouched(true)}
          className="h-full w-full min-w-0 flex-1 rounded-r-xl bg-transparent px-4 text-base outline-none placeholder:text-gray-400 disabled:cursor-not-allowed"
        />
      </div>

      {showError || showEmptyError ? (
        <p id={errorId} className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {PHONE_INVALID_MESSAGE}
        </p>
      ) : valid ? (
        <p id={hintId} className="flex items-center gap-2 text-sm text-green-600">
          <Check className="h-4 w-4 flex-shrink-0" />
          Nomor tersimpan sebagai {formatPhoneLocal(normalizePhone(value))}
        </p>
      ) : (
        <p id={hintId} className="text-sm text-gray-500">
          Nomor WhatsApp aktif — dipakai admin Salda dan pihak brand untuk
          menghubungi kamu soal booking.
        </p>
      )}
    </div>
  );
}

export default PhoneInput;
