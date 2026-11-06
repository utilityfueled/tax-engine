// @vitest-environment jsdom
// Spec: spec/federal/guided-currency-input-grammar.yaml.
import { describe, it, expect } from "vitest";
import { createElement, act, useState } from "react";
import { mountGuidedPanel } from "../apps/web/guided-panel-dom";
import {
  CurrencyField,
  parseCurrencyInput,
  formatCurrencyDisplay,
  isValidCurrencyValue,
} from "@/components/guided-interview/currency-field";

// ── parseCurrencyInput ────────────────────────────────────────────────────

describe("parseCurrencyInput", () => {
  it("returns empty string for empty input", () => {
    expect(parseCurrencyInput("")).toBe("");
  });

  it("returns empty string for whitespace", () => {
    expect(parseCurrencyInput("   ")).toBe("");
  });

  it("strips commas", () => {
    expect(parseCurrencyInput("50,000")).toBe("50000");
  });

  it("strips leading dollar sign", () => {
    expect(parseCurrencyInput("$1000")).toBe("1000");
  });

  it("strips both commas and dollar sign", () => {
    expect(parseCurrencyInput("$1,234,567")).toBe("1234567");
  });

  it("trims whitespace", () => {
    expect(parseCurrencyInput("  5000  ")).toBe("5000");
  });

  it("preserves decimal values", () => {
    expect(parseCurrencyInput("1234.56")).toBe("1234.56");
  });

  it("passes through non-numeric strings unchanged (after stripping)", () => {
    expect(parseCurrencyInput("abc")).toBe("abc");
  });

  it("handles zero", () => {
    expect(parseCurrencyInput("0")).toBe("0");
  });

  it("handles negative values", () => {
    expect(parseCurrencyInput("-500")).toBe("-500");
  });
});

// ── formatCurrencyDisplay ─────────────────────────────────────────────────

describe("formatCurrencyDisplay", () => {
  it("preserves a signed fractional amount without changing its value", () => {
    expect(formatCurrencyDisplay("-0.01")).toBe("-0.01");
    expect(formatCurrencyDisplay("-1000.01")).toBe("-1,000.01");
    expect(isValidCurrencyValue("-0.01", true)).toBe(true);
    expect(isValidCurrencyValue("-0.01")).toBe(false);
  });
  it("preserves cents beyond the JavaScript safe integer range", () => {
    expect(formatCurrencyDisplay("9007199254740993.01")).toBe("9,007,199,254,740,993.01");
  });
  it("returns empty string for empty input", () => {
    expect(formatCurrencyDisplay("")).toBe("");
  });

  it("formats whole numbers with commas", () => {
    expect(formatCurrencyDisplay("50000")).toBe("50,000");
  });

  it("formats large numbers with commas", () => {
    expect(formatCurrencyDisplay("1234567")).toBe("1,234,567");
  });

  it("preserves decimal places", () => {
    expect(formatCurrencyDisplay("1234.56")).toBe("1,234.56");
  });

  it("formats already-comma-separated input (idempotent)", () => {
    expect(formatCurrencyDisplay("50,000")).toBe("50,000");
  });

  it("handles small numbers without commas", () => {
    expect(formatCurrencyDisplay("999")).toBe("999");
  });

  it("handles zero", () => {
    expect(formatCurrencyDisplay("0")).toBe("0");
  });

  it("returns original value for non-numeric input", () => {
    expect(formatCurrencyDisplay("abc")).toBe("abc");
  });

  it("strips leading dollar sign and formats", () => {
    expect(formatCurrencyDisplay("$75000")).toBe("75,000");
  });

  it("handles decimal with trailing zeros", () => {
    expect(formatCurrencyDisplay("1000.50")).toBe("1,000.50");
  });

  it("handles input with only a decimal point", () => {
    expect(formatCurrencyDisplay("1000.")).toBe("1,000.");
  });

  it("formats negative numbers", () => {
    // Negative isn't typical for tax amounts but shouldn't crash
    expect(formatCurrencyDisplay("-1500")).toBe("-1,500");
  });
});

// ── isValidCurrencyValue ──────────────────────────────────────────────────

describe("isValidCurrencyValue", () => {
  it.each(["Infinity", "1e3", "0x10", "1,,000"])("rejects non-decimal input %s", (value) => {
    expect(isValidCurrencyValue(value)).toBe(false);
  });
  it("returns true for empty string (optional field)", () => {
    expect(isValidCurrencyValue("")).toBe(true);
  });

  it("returns true for whitespace (treated as empty)", () => {
    expect(isValidCurrencyValue("   ")).toBe(true);
  });

  it("returns true for valid whole number", () => {
    expect(isValidCurrencyValue("50000")).toBe(true);
  });

  it("returns true for valid decimal number", () => {
    expect(isValidCurrencyValue("1234.56")).toBe(true);
  });

  it("returns true for zero", () => {
    expect(isValidCurrencyValue("0")).toBe(true);
  });

  it("returns true for comma-separated number", () => {
    expect(isValidCurrencyValue("50,000")).toBe(true);
  });

  it("returns true for dollar-prefixed number", () => {
    expect(isValidCurrencyValue("$1000")).toBe(true);
  });

  it("returns false for non-numeric text", () => {
    expect(isValidCurrencyValue("abc")).toBe(false);
  });

  it("returns false for mixed text and numbers", () => {
    expect(isValidCurrencyValue("50k")).toBe(false);
  });

  it("returns false for negative numbers", () => {
    expect(isValidCurrencyValue("-500")).toBe(false);
  });

  it("returns true for very large numbers", () => {
    expect(isValidCurrencyValue("999999999")).toBe(true);
  });
});

const malformedSymbols = ["$", ",", "$,", "  $,  "];

describe("raw currency absence and malformed symbols", () => {
  it.each(malformedSymbols)("preserves malformed symbol input %s rather than erasing it", value => {
    expect(formatCurrencyDisplay(value)).toBe(value);
    // The cleaner intentionally remains separate from grammar validation.
    expect(parseCurrencyInput(value)).toBe("");
  });

  it.each(malformedSymbols)("rejects malformed symbols %s even when the cleaner returns empty", value => {
    expect(isValidCurrencyValue(value)).toBe(false);
    expect(isValidCurrencyValue(value, true)).toBe(false);
  });

  it.each(malformedSymbols)("native blur retains malformed symbols %s and reports invalidity", async value => {
    const writes: string[] = [];
    function Harness() {
      const [current, setCurrent] = useState("");
      return createElement(CurrencyField, {
        label: "Actual amount",
        value: current,
        onChange: (next: string) => { writes.push(next); setCurrent(next); },
      });
    }
    const panel = await mountGuidedPanel(createElement(Harness));
    try {
      const field = panel.control("Actual amount");
      await act(async () => field.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
      await panel.change("Actual amount", value);
      await act(async () => field.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
      expect(field.value).toBe(value);
      expect(writes).toEqual([value]);
      expect(field.getAttribute("aria-invalid")).toBe("true");
      expect(panel.container.querySelector('[role="alert"]')?.textContent).toBe("Enter a valid dollar amount");
    } finally {
      await panel.dispose();
    }
  });

  it("native whitespace blur remains optional empty input", async () => {
    const writes: string[] = [];
    function Harness() {
      const [current, setCurrent] = useState("");
      return createElement(CurrencyField, {
        label: "Actual amount",
        value: current,
        onChange: (next: string) => { writes.push(next); setCurrent(next); },
      });
    }
    const panel = await mountGuidedPanel(createElement(Harness));
    try {
      const field = panel.control("Actual amount");
      await act(async () => field.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
      await panel.change("Actual amount", "  ");
      await act(async () => field.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
      expect(field.value).toBe("");
      expect(writes).toEqual(["  ", ""]);
      expect(field.hasAttribute("aria-invalid")).toBe(false);
      expect(panel.container.querySelector('[role="alert"]')).toBeNull();
      expect(isValidCurrencyValue("  ")).toBe(true);
    } finally {
      await panel.dispose();
    }
  });
});
