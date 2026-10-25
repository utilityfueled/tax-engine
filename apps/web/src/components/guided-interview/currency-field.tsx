"use client";

import { useCallback, useState, type ReactNode } from "react";
import Decimal from "decimal.js";

function isDecimalInput(raw: string): boolean {
  return /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?$/.test(raw.trim().replace(/^\$/, ""));
}

/**
 * Parse a raw user string into a clean numeric string (no commas, no leading $).
 * Returns "" for empty/whitespace, the cleaned string otherwise.
 */
export function parseCurrencyInput(raw: string): string {
  const trimmed = raw.trim().replace(/^\$/, "").replace(/,/g, "");
  if (trimmed === "") return "";
  return trimmed;
}

/**
 * Format a numeric string with commas for display.
 * Returns the original value if it's empty or not a valid number.
 */
export function formatCurrencyDisplay(value: string): string {
  const cleaned = parseCurrencyInput(value);
  if (cleaned === "") return "";

  if (!isDecimalInput(value)) return value;

  // Preserve decimals if the user typed them
  if (cleaned.includes(".")) {
    const [intPart, decPart] = cleaned.split(".");
    const formattedInt = new Decimal(intPart).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${formattedInt}.${decPart}`;
  }

  return new Decimal(cleaned).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Check whether a raw user string represents a valid non-negative number.
 */
export function isValidCurrencyValue(value: string): boolean {
  const cleaned = parseCurrencyInput(value);
  if (cleaned === "") return true; // empty is valid (optional field)
  return isDecimalInput(value) && new Decimal(cleaned).isFinite() && new Decimal(cleaned).gte(0);
}

export function CurrencyField({
  label,
  hint,
  value,
  onChange,
  fieldClassName,
  footer,
  required,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  fieldClassName?: string;
  footer?: ReactNode;
  required?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [fieldId] = useState(() => `currency-field-${Math.random().toString(36).slice(2, 10)}`);
  const invalid = !focused && value.trim() !== "" && !isValidCurrencyValue(value);
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const describedBy = invalid ? errorId : hint ? hintId : undefined;

  const handleBlur = useCallback(() => {
    setFocused(false);
    // Auto-format on blur: add commas for readability
    const formatted = formatCurrencyDisplay(value);
    if (formatted !== value) {
      onChange(formatted);
    }
  }, [value, onChange]);

  return (
    <label className={`guided-field${fieldClassName ? ` ${fieldClassName}` : ""}`}>
      <span className="guided-field-label">{label}</span>
      <div className="guided-input-prefix-wrap">
        <span className="guided-input-prefix" aria-hidden="true">$</span>
        <input
          id={fieldId}
          type="text"
          className={`guided-input guided-input-currency${invalid ? " guided-input-invalid" : ""}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          inputMode="decimal"
          placeholder="0.00"
          aria-required={required || undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
      </div>
      {invalid && (
        <span id={errorId} className="guided-field-error" role="alert">Enter a valid dollar amount</span>
      )}
      {hint && !invalid && <span id={hintId} className="guided-field-hint">{hint}</span>}
      {footer}
    </label>
  );
}
