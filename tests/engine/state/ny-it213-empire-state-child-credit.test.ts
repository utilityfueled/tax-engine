/**
 * Tests for New York IT-213 — Empire State Child Credit.
 * Spec: spec/state/ny-it213-empire-state-child-credit.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateNYIT213,
  type NYIT213Input,
} from "@/engine/state/ny-it213-empire-state-child-credit.js";

const d = (value: string | number) => new Decimal(value);

function it2132025(overrides: Partial<NYIT213Input> = {}) {
  return calculateNYIT213({
    qualifyingChildrenUnder4: 1,
    qualifyingChildrenAge4To16: 1,
    federalAgi: 74000,
    filingStatus: "single",
    taxYear: 2025,
    ...overrides,
  });
}

describe("NY IT-213 Empire State Child Credit", () => {
  describe("Line 1 - qualifying children under age 4", () => {
    it("IT-213 Line 1 - qualifying children under age 4 pass through", () => {
      const result = it2132025({ qualifyingChildrenUnder4: 2 });
      expect(result.qualifyingChildrenUnder4).toBe(2);
    });
  });

  describe("Line 2 - under age 4 credit", () => {
    it("IT-213 Line 2 - under age 4 credit uses $1,000 per child", () => {
      const result = it2132025({ qualifyingChildrenUnder4: 2, qualifyingChildrenAge4To16: 0 });
      expect(result.creditForChildrenUnder4.equals(d(2000))).toBe(true);
    });
  });

  describe("Line 3 - qualifying children age 4 through 16", () => {
    it("IT-213 Line 3 - qualifying children age 4 through 16 pass through", () => {
      const result = it2132025({ qualifyingChildrenUnder4: 0, qualifyingChildrenAge4To16: 3 });
      expect(result.qualifyingChildrenAge4To16).toBe(3);
    });
  });

  describe("Line 4 - age 4 through 16 credit", () => {
    it("IT-213 Line 4 - age 4 through 16 credit uses $330 per child", () => {
      const result = it2132025({ qualifyingChildrenUnder4: 0, qualifyingChildrenAge4To16: 3 });
      expect(result.creditForChildrenAge4To16.equals(d(990))).toBe(true);
    });
  });

  describe("Line 5 - base credit", () => {
    it("IT-213 Line 5 - base credit sums both age bands", () => {
      const result = it2132025({ qualifyingChildrenUnder4: 1, qualifyingChildrenAge4To16: 2 });
      expect(result.baseCredit.equals(d(1660))).toBe(true);
    });
  });

  describe("Line 6 - rounded federal AGI", () => {
    it("IT-213 Line 6 - federal AGI rounds down to the nearest $1,000", () => {
      const result = it2132025({ federalAgi: 75999 });
      expect(result.roundedFederalAgi.equals(d(75000))).toBe(true);
    });
  });

  describe("Line 7 - AGI excess", () => {
    it("IT-213 Line 7 - AGI excess uses the filing-status threshold", () => {
      const result = it2132025({ filingStatus: "married_filing_jointly", federalAgi: 111999 });
      expect(result.agiExcessOverThreshold.equals(d(1000))).toBe(true);
    });
  });

  describe("Line 8 - phaseout reduction", () => {
    it("IT-213 Line 8 - phaseout reduction uses 1.65% of excess AGI", () => {
      const result = it2132025({ federalAgi: 76499 });
      expect(result.phaseoutReduction.equals(d(17))).toBe(true);
    });
  });

  describe("Line 9 - final credit", () => {
    it("IT-213 Line 9 - final credit subtracts the phaseout reduction", () => {
      const result = it2132025({ federalAgi: 76499 });
      expect(result.empireStateChildCredit.equals(d(1313))).toBe(true);
    });

    it("No qualifying children yields zero credit", () => {
      const result = it2132025({
        qualifyingChildrenUnder4: 0,
        qualifyingChildrenAge4To16: 0,
      });
      expect(result.empireStateChildCredit.equals(d(0))).toBe(true);
    });

    it("High income can fully phase the credit out", () => {
      const result = it2132025({
        filingStatus: "married_filing_jointly",
        qualifyingChildrenUnder4: 0,
        qualifyingChildrenAge4To16: 2,
        federalAgi: 200000,
      });
      expect(result.empireStateChildCredit.equals(d(0))).toBe(true);
    });
  });

  describe("Tax year support", () => {
    it("throws for unsupported tax year", () => {
      expect(() =>
        it2132025({ taxYear: 2024 })
      ).toThrow("NY IT-213 Empire State child credit not available for tax year 2024");
    });
  });

  describe("Audit trail", () => {
    it("records lines 1 through 9 in audit trail", () => {
      const result = it2132025({ federalAgi: 76499 });
      expect(result.lines.map((line) => line.line)).toEqual([
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
      ]);
    });
  });
});
