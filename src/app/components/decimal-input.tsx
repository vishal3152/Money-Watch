"use client";

import type { ChangeEvent, InputHTMLAttributes } from "react";

import {
  sanitizeDecimalInput,
  type SanitizeDecimalInputOptions
} from "@/app/decimal-field";

type DecimalInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode"> &
  SanitizeDecimalInputOptions & {
    onValueChange?: (value: string) => void;
  };

/**
 * Text input that only accepts decimal digits (optional leading `-` when
 * `allowNegative`), with `inputMode="decimal"` for the mobile keyboard.
 */
export function DecimalInput({
  allowNegative,
  onChange,
  onValueChange,
  ...props
}: DecimalInputProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = sanitizeDecimalInput(event.target.value, { allowNegative });
    event.target.value = next;
    onValueChange?.(next);
    onChange?.(event);
  }

  return <input type="text" inputMode="decimal" {...props} onChange={handleChange} />;
}
