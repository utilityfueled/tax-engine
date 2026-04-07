/**
 * Tests for New York IT-227 voluntary contributions.
 * Spec: spec/state/ny-it227-voluntary-contributions.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateNYIT227,
  type NYIT227ContributionEntry,
} from "@/engine/state/ny-it227-voluntary-contributions.js";

function d(value: number | string): Decimal {
  return new Decimal(value);
}

function calculate(
  contributions: NYIT227ContributionEntry[],
  filingStatus: "single" | "married_filing_jointly" = "single"
) {
  return calculateNYIT227({
    taxYear: 2025,
    filingStatus,
    contributions,
  });
}

describe("NY IT-227 voluntary contributions", () => {
  it("Part 1 - sums supported contribution lines after applying special caps", () => {
    const result = calculate([
      { lineNumber: 1, amount: 25 },
      { lineNumber: 5, amount: 2 },
      { lineNumber: 27, amount: 40 },
      { lineNumber: 36, amount: 15 },
    ]);

    expect(result.totalVoluntaryContributions.equals(d(82))).toBe(true);
    expect(result.contributions).toHaveLength(4);
  });

  it("Part 1 - married filing jointly may contribute the doubled special amounts", () => {
    const result = calculate([
      { lineNumber: 5, amount: 4 },
      { lineNumber: 27, amount: 80 },
    ], "married_filing_jointly");

    expect(result.totalVoluntaryContributions.equals(d(84))).toBe(true);
  });

  it("Part 1 - Olympic Fund rejects unsupported single-filer amounts", () => {
    expect(() =>
      calculate([{ lineNumber: 5, amount: 1 }])
    ).toThrow("NY IT-227 line 5 Olympic Fund contribution must be $0 or $2 ($4 maximum on MFJ returns)");
  });

  it("Part 1 - Campaign Finance Fund rejects unsupported married filing jointly amounts", () => {
    expect(() =>
      calculate([{ lineNumber: 27, amount: 60 }], "married_filing_jointly")
    ).toThrow("NY IT-227 line 27 Campaign Finance Fund contribution must be $0, $40, or $80 on married filing jointly returns");
  });

  it("Part 1 - duplicate line numbers are invalid", () => {
    expect(() =>
      calculate([
        { lineNumber: 1, amount: 10 },
        { lineNumber: 1, amount: 5 },
      ])
    ).toThrow("NY IT-227 line 1 may only be entered once");
  });

  it("Part 2 Line 1 - no contribution entries produces a zero total", () => {
    const result = calculate([]);

    expect(result.totalVoluntaryContributions.equals(d(0))).toBe(true);
  });
});
