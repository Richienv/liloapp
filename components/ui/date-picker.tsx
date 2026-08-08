import React from 'react';
import ReactDatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";

interface DatePickerProps {
  selected: Date | null;
  onChange: (date: Date | null) => void;
  minDate?: Date;
  maxDate?: Date;
  placeholderText?: string;
  className?: string;
}

export function DatePicker({
  selected,
  onChange,
  minDate,
  maxDate,
  placeholderText = "Pilih tanggal",
  className = "",
}: DatePickerProps) {
  return (
    <ReactDatePicker
      selected={selected}
      onChange={onChange}
      minDate={minDate}
      maxDate={maxDate}
      placeholderText={placeholderText}
      className={`numeric h-12 w-full rounded-field border border-hairline-input bg-surface px-3.5 text-ui text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand ${className}`}
      dateFormat="d MMMM yyyy"
    />
  );
}
