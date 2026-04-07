/**
 * Tests for Pennsylvania Schedule G-L — Credit for Taxes Paid to Other States
 * Spec: spec/state/pa-schedule-g-l.yaml
 *
 * PA residents who paid income tax to another state on income also taxable
 * by PA may claim a credit equal to the lesser of the tax paid to the other
 * state or the PA tax on that income. Total credit capped at PA tax liability.
 * Source: PA Department of Revenue, Schedule G-L Instructions
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateScheduleGL,
  type ScheduleGLInput,
  type OtherStateCredit,
} from "@/engine/state/pa-schedule-g-l.js";

const d = (n: number | string) => new Decimal(n);
const ZERO = new Decimal(0);

/** Helper to build a single OtherStateCredit entry */
function makeStateCredit(overrides: Partial<OtherStateCredit> = {}): OtherStateCredit {
  return {
    stateCode: "NJ",
    incomeTaxableByBothStates: ZERO,
    taxPaidToOtherState: ZERO,
    ...overrides,
  };
}

/** Helper to build a ScheduleGLInput with defaults */
function makeInput(overrides: Partial<ScheduleGLInput> = {}): ScheduleGLInput {
  return {
    taxYear: 2025,
    paTaxLiability: ZERO,
    otherStateCredits: [],
    ...overrides,
  };
}

describe("Pennsylvania Schedule G-L — Credit for Taxes Paid to Other States", () => {
  // =================================================================
  // Per-State Credit Computation
  // =================================================================

  describe("Per-State Credit Computation", () => {
    it("PA Schedule G-L Line 1 - income taxable by both states", () => {
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(3070),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "NJ",
            incomeTaxableByBothStates: d(50000),
            taxPaidToOtherState: d(2000),
          }),
        ],
      }));
      expect(result.perStateResults[0].incomeTaxableByBothStates.toNumber()).toBe(50000);
    });

    it("PA Schedule G-L Line 2 - tax paid to other state", () => {
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(3070),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "NJ",
            incomeTaxableByBothStates: d(50000),
            taxPaidToOtherState: d(2000),
          }),
        ],
      }));
      expect(result.perStateResults[0].taxPaidToOtherState.toNumber()).toBe(2000);
    });

    it("PA Schedule G-L Line 3 - PA tax on shared income", () => {
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(3070),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "NJ",
            incomeTaxableByBothStates: d(50000),
            taxPaidToOtherState: d(2000),
          }),
        ],
      }));
      // $50,000 × 3.07% = $1,535
      expect(result.perStateResults[0].paTaxOnSharedIncome.toNumber()).toBe(1535);
    });

    it("PA Schedule G-L Line 4 - credit is lesser of tax paid and PA tax (PA tax lower)", () => {
      // Other state tax ($2,000) > PA tax on shared income ($1,535)
      // Credit = $1,535 (PA tax)
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(3070),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "NJ",
            incomeTaxableByBothStates: d(50000),
            taxPaidToOtherState: d(2000),
          }),
        ],
      }));
      expect(result.perStateResults[0].credit.toNumber()).toBe(1535);
    });

    it("PA Schedule G-L Line 4 - credit is lesser of tax paid and PA tax (other state tax lower)", () => {
      // Other state tax ($800) < PA tax on shared income ($1,535)
      // Credit = $800 (other state tax)
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(3070),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "DE",
            incomeTaxableByBothStates: d(50000),
            taxPaidToOtherState: d(800),
          }),
        ],
      }));
      expect(result.perStateResults[0].credit.toNumber()).toBe(800);
    });

    it("PA Schedule G-L Line 4 - credit when tax paid equals PA tax", () => {
      // Both are $1,535 — credit = $1,535
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(3070),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "MD",
            incomeTaxableByBothStates: d(50000),
            taxPaidToOtherState: d(1535),
          }),
        ],
      }));
      expect(result.perStateResults[0].credit.toNumber()).toBe(1535);
    });

    it("PA Schedule G-L - zero income produces zero credit", () => {
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(3070),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "NY",
            incomeTaxableByBothStates: ZERO,
            taxPaidToOtherState: d(500),
          }),
        ],
      }));
      expect(result.perStateResults[0].paTaxOnSharedIncome.toNumber()).toBe(0);
      expect(result.perStateResults[0].credit.toNumber()).toBe(0);
    });

    it("PA Schedule G-L - zero tax paid produces zero credit", () => {
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(3070),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "OH",
            incomeTaxableByBothStates: d(50000),
            taxPaidToOtherState: ZERO,
          }),
        ],
      }));
      expect(result.perStateResults[0].credit.toNumber()).toBe(0);
    });
  });

  // =================================================================
  // Multiple States
  // =================================================================

  describe("Multiple States", () => {
    it("PA Schedule G-L - credits from two states summed", () => {
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(5000),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "NJ",
            incomeTaxableByBothStates: d(40000),
            taxPaidToOtherState: d(1500),
          }),
          makeStateCredit({
            stateCode: "NY",
            incomeTaxableByBothStates: d(30000),
            taxPaidToOtherState: d(1200),
          }),
        ],
      }));
      // NJ: PA tax = $40,000 × 3.07% = $1,228; credit = min($1,500, $1,228) = $1,228
      expect(result.perStateResults[0].credit.toNumber()).toBe(1228);
      // NY: PA tax = $30,000 × 3.07% = $921; credit = min($1,200, $921) = $921
      expect(result.perStateResults[1].credit.toNumber()).toBe(921);
      // Total: $1,228 + $921 = $2,149
      expect(result.totalCredit.toNumber()).toBe(2149);
    });

    it("PA Schedule G-L - credits from three states", () => {
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(10000),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "NJ",
            incomeTaxableByBothStates: d(30000),
            taxPaidToOtherState: d(800),
          }),
          makeStateCredit({
            stateCode: "NY",
            incomeTaxableByBothStates: d(20000),
            taxPaidToOtherState: d(900),
          }),
          makeStateCredit({
            stateCode: "DE",
            incomeTaxableByBothStates: d(10000),
            taxPaidToOtherState: d(500),
          }),
        ],
      }));
      // NJ: PA tax = $921; credit = min($800, $921) = $800
      expect(result.perStateResults[0].credit.toNumber()).toBe(800);
      // NY: PA tax = $614; credit = min($900, $614) = $614
      expect(result.perStateResults[1].credit.toNumber()).toBe(614);
      // DE: PA tax = $307; credit = min($500, $307) = $307
      expect(result.perStateResults[2].credit.toNumber()).toBe(307);
      // Total: $800 + $614 + $307 = $1,721
      expect(result.totalCredit.toNumber()).toBe(1721);
    });
  });

  // =================================================================
  // Total Credit Cap
  // =================================================================

  describe("Total Credit Cap", () => {
    it("PA Schedule G-L total credit capped at PA tax liability", () => {
      // PA tax liability is $1,535 but uncapped credits would be $2,000+
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(1535),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "NJ",
            incomeTaxableByBothStates: d(40000),
            taxPaidToOtherState: d(1500),
          }),
          makeStateCredit({
            stateCode: "NY",
            incomeTaxableByBothStates: d(30000),
            taxPaidToOtherState: d(1200),
          }),
        ],
      }));
      // NJ: PA tax = $1,228; credit = min($1,500, $1,228) = $1,228
      // NY: PA tax = $921; credit = min($1,200, $921) = $921
      // Raw sum: $1,228 + $921 = $2,149
      // But capped at PA tax liability of $1,535
      expect(result.totalCreditBeforeCap.toNumber()).toBe(2149);
      expect(result.totalCredit.toNumber()).toBe(1535);
    });

    it("PA Schedule G-L - total credit not capped when below PA tax liability", () => {
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(5000),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "NJ",
            incomeTaxableByBothStates: d(30000),
            taxPaidToOtherState: d(800),
          }),
        ],
      }));
      // NJ: PA tax = $921; credit = min($800, $921) = $800
      expect(result.totalCreditBeforeCap.toNumber()).toBe(800);
      expect(result.totalCredit.toNumber()).toBe(800);
    });

    it("PA Schedule G-L - zero PA tax liability means zero credit", () => {
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: ZERO,
        otherStateCredits: [
          makeStateCredit({
            stateCode: "NJ",
            incomeTaxableByBothStates: d(50000),
            taxPaidToOtherState: d(2000),
          }),
        ],
      }));
      expect(result.totalCredit.toNumber()).toBe(0);
    });
  });

  // =================================================================
  // No Other State Credits
  // =================================================================

  describe("No Other State Credits", () => {
    it("PA Schedule G-L - empty other state credits array", () => {
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(3070),
        otherStateCredits: [],
      }));
      expect(result.perStateResults.length).toBe(0);
      expect(result.totalCredit.toNumber()).toBe(0);
      expect(result.totalCreditBeforeCap.toNumber()).toBe(0);
    });
  });

  // =================================================================
  // Rounding
  // =================================================================

  describe("Rounding", () => {
    it("PA Schedule G-L - PA tax on shared income rounded to nearest dollar", () => {
      // $33,333 × 3.07% = $1,023.3231 → $1,023
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(5000),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "NJ",
            incomeTaxableByBothStates: d(33333),
            taxPaidToOtherState: d(2000),
          }),
        ],
      }));
      expect(result.perStateResults[0].paTaxOnSharedIncome.toNumber()).toBe(1023);
      expect(result.perStateResults[0].credit.toNumber()).toBe(1023);
    });

    it("PA Schedule G-L - rounding up at $0.50", () => {
      // $17 × 3.07% = $0.5219 → $1
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(5000),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "NJ",
            incomeTaxableByBothStates: d(17),
            taxPaidToOtherState: d(100),
          }),
        ],
      }));
      expect(result.perStateResults[0].paTaxOnSharedIncome.toNumber()).toBe(1);
      expect(result.perStateResults[0].credit.toNumber()).toBe(1);
    });
  });

  // =================================================================
  // Realistic Scenarios
  // =================================================================

  describe("Realistic Scenarios", () => {
    it("PA Schedule G-L - PA resident working in NJ (higher tax state)", () => {
      // PA resident commutes to NJ. $80,000 compensation.
      // NJ tax on that income: ~$3,200 (hypothetical)
      // PA tax: $80,000 × 3.07% = $2,456
      // Credit = min($3,200, $2,456) = $2,456
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(2456),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "NJ",
            incomeTaxableByBothStates: d(80000),
            taxPaidToOtherState: d(3200),
          }),
        ],
      }));
      expect(result.perStateResults[0].paTaxOnSharedIncome.toNumber()).toBe(2456);
      expect(result.perStateResults[0].credit.toNumber()).toBe(2456);
      // Full PA tax offset by NJ credit
      expect(result.totalCredit.toNumber()).toBe(2456);
    });

    it("PA Schedule G-L - PA resident with investment income in another state", () => {
      // PA resident has rental income in Maryland: $24,000
      // MD tax paid: $600
      // PA tax on $24,000: $24,000 × 3.07% = $736.80 → $737
      // Credit = min($600, $737) = $600
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(3070),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "MD",
            incomeTaxableByBothStates: d(24000),
            taxPaidToOtherState: d(600),
          }),
        ],
      }));
      expect(result.perStateResults[0].paTaxOnSharedIncome.toNumber()).toBe(737);
      expect(result.perStateResults[0].credit.toNumber()).toBe(600);
      expect(result.totalCredit.toNumber()).toBe(600);
    });

    it("PA Schedule G-L - PA resident working in two states", () => {
      // Works in NJ ($60,000) and NY ($20,000)
      // Total PA tax liability on $100K total income (with other income too): $3,377
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(3377),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "NJ",
            incomeTaxableByBothStates: d(60000),
            taxPaidToOtherState: d(2100),
          }),
          makeStateCredit({
            stateCode: "NY",
            incomeTaxableByBothStates: d(20000),
            taxPaidToOtherState: d(1100),
          }),
        ],
      }));
      // NJ: PA tax = $1,842; credit = min($2,100, $1,842) = $1,842
      expect(result.perStateResults[0].credit.toNumber()).toBe(1842);
      // NY: PA tax = $614; credit = min($1,100, $614) = $614
      expect(result.perStateResults[1].credit.toNumber()).toBe(614);
      // Total: $1,842 + $614 = $2,456
      expect(result.totalCredit.toNumber()).toBe(2456);
    });

    it("PA Schedule G-L - low-income PA resident: credit eliminates all PA tax", () => {
      // $25,000 income earned in DE
      // DE tax: $800
      // PA tax liability: $25,000 × 3.07% = $767.50 → $768
      // Credit = min($800, $768) = $768 (capped at PA tax)
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(768),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "DE",
            incomeTaxableByBothStates: d(25000),
            taxPaidToOtherState: d(800),
          }),
        ],
      }));
      // PA tax on shared income = $768
      expect(result.perStateResults[0].paTaxOnSharedIncome.toNumber()).toBe(768);
      // Per-state credit = min($800, $768) = $768
      expect(result.perStateResults[0].credit.toNumber()).toBe(768);
      // Total capped at PA tax liability ($768)
      expect(result.totalCredit.toNumber()).toBe(768);
    });
  });

  // =================================================================
  // Edge Cases
  // =================================================================

  describe("Edge Cases", () => {
    it("PA Schedule G-L - very small income: $1 shared income", () => {
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(100),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "NJ",
            incomeTaxableByBothStates: d(1),
            taxPaidToOtherState: d(1),
          }),
        ],
      }));
      // $1 × 3.07% = $0.0307 → $0
      expect(result.perStateResults[0].paTaxOnSharedIncome.toNumber()).toBe(0);
      expect(result.perStateResults[0].credit.toNumber()).toBe(0);
    });

    it("PA Schedule G-L - very large income: $1M shared income", () => {
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(50000),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "NY",
            incomeTaxableByBothStates: d(1000000),
            taxPaidToOtherState: d(80000),
          }),
        ],
      }));
      // PA tax on $1M = $30,700
      expect(result.perStateResults[0].paTaxOnSharedIncome.toNumber()).toBe(30700);
      // Credit = min($80,000, $30,700) = $30,700
      expect(result.perStateResults[0].credit.toNumber()).toBe(30700);
      expect(result.totalCredit.toNumber()).toBe(30700);
    });

    it("PA Schedule G-L - other state tax is exactly $1", () => {
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(3070),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "WV",
            incomeTaxableByBothStates: d(10000),
            taxPaidToOtherState: d(1),
          }),
        ],
      }));
      // PA tax = $307; credit = min($1, $307) = $1
      expect(result.perStateResults[0].credit.toNumber()).toBe(1);
    });

    it("PA Schedule G-L - shared income exceeds total PA taxable income (credit still per-formula)", () => {
      // This can happen if PA taxable income from other classes is zero
      // but the filer has shared income with another state
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(1535), // from $50K total income
        otherStateCredits: [
          makeStateCredit({
            stateCode: "NY",
            incomeTaxableByBothStates: d(50000),
            taxPaidToOtherState: d(3000),
          }),
        ],
      }));
      // PA tax on shared = $1,535
      // Credit = min($3,000, $1,535) = $1,535
      // Capped at PA tax liability ($1,535) = $1,535
      expect(result.totalCredit.toNumber()).toBe(1535);
    });
  });

  // =================================================================
  // Tax Year
  // =================================================================

  describe("Tax Year", () => {
    it("PA Schedule G-L - 2024 tax year uses same 3.07% rate", () => {
      const result = calculateScheduleGL(makeInput({
        taxYear: 2024,
        paTaxLiability: d(3070),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "NJ",
            incomeTaxableByBothStates: d(100000),
            taxPaidToOtherState: d(5000),
          }),
        ],
      }));
      // PA tax on $100K = $3,070
      expect(result.perStateResults[0].paTaxOnSharedIncome.toNumber()).toBe(3070);
      expect(result.perStateResults[0].credit.toNumber()).toBe(3070);
    });

    it("PA Schedule G-L - throws for unsupported tax year", () => {
      expect(() =>
        calculateScheduleGL(makeInput({ taxYear: 2020 }))
      ).toThrow("PA constants not available for tax year 2020");
    });
  });

  // =================================================================
  // Audit Trail
  // =================================================================

  describe("Audit Trail", () => {
    it("PA Schedule G-L - audit trail records per-state and total lines", () => {
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(5000),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "NJ",
            incomeTaxableByBothStates: d(40000),
            taxPaidToOtherState: d(1500),
          }),
          makeStateCredit({
            stateCode: "NY",
            incomeTaxableByBothStates: d(20000),
            taxPaidToOtherState: d(800),
          }),
        ],
      }));

      const lineNumbers = result.lines.map((l) => l.line);
      // Per-state lines for NJ
      expect(lineNumbers).toContain("1-NJ");
      expect(lineNumbers).toContain("2-NJ");
      expect(lineNumbers).toContain("3-NJ");
      expect(lineNumbers).toContain("4-NJ");
      // Per-state lines for NY
      expect(lineNumbers).toContain("1-NY");
      expect(lineNumbers).toContain("2-NY");
      expect(lineNumbers).toContain("3-NY");
      expect(lineNumbers).toContain("4-NY");
      // Total
      expect(lineNumbers).toContain("total");
    });

    it("PA Schedule G-L - all audit trail entries have form 'PA-Schedule-G-L'", () => {
      const result = calculateScheduleGL(makeInput({
        paTaxLiability: d(3070),
        otherStateCredits: [
          makeStateCredit({
            stateCode: "NJ",
            incomeTaxableByBothStates: d(50000),
            taxPaidToOtherState: d(2000),
          }),
        ],
      }));
      for (const line of result.lines) {
        expect(line.form).toBe("PA-Schedule-G-L");
      }
    });
  });
});
