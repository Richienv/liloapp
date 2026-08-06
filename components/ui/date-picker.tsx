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
  placeholderText = "Select a date",
  className = "",
}: DatePickerProps) {
  return (
    <ReactDatePicker
      selected={selected}
      onChange={onChange}
      minDate={minDate}
      maxDate={maxDate}
      placeholderText={placeholderText}
      className={`w-full p-2 border border-hairline-strong rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
      dateFormat="MMMM d, yyyy"
    />
  );
}
