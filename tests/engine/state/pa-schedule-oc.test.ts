/**
 * Tests for Pennsylvania Schedule OC — Other Credits
 * Spec: spec/state/pa-schedule-oc.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateScheduleOC,
  type ScheduleOCInput,
  type PTECreditEntry,
} from "@/engine/state/pa-schedule-oc.js";

const d = (n: number | string) => new Decimal(n);

function makeInput(overrides: Partial<ScheduleOCInput> = {}): ScheduleOCInput {
  return {
    taxYear: 2025,
    ...overrides,
  };
}

function makePTE(overrides: Partial<PTECreditEntry> = {}): PTECreditEntry {
  return {
    entityName: "Test Partnership",
    entityEIN: "12-3456789",
    allocablePAIncome: d(100000),
    pteTaxPaid: d(3070),
    ...overrides,
  };
}

describe("Pennsylvania Schedule OC — Other Credits", () => {
  // =================================================================
  // PTE Tax Credit (Line 1)
  // =================================================================

  describe("PTE Tax Credit", () => {
    it("PA Schedule OC - PTE credit equals lesser of tax paid and PA tax on allocable income", () => {
      // PTE paid exactly 3.07% on $100K allocable income = $3,070
      // Credit = lesser of $3,070 (paid) and $3,070 (PA tax) = $3,070
      const result = calculateScheduleOC(makeInput({
        pteCredits: [makePTE({
          allocablePAIncome: d(100000),
          pteTaxPaid: d(3070),
        })],
      }));
      expect(result.totalPTECredit.toNumber()).toBe(3070);
      expect(result.pteResults).toHaveLength(1);
      expect(result.pteResults[0].credit.toNumber()).toBe(3070);
    });

    it("PA Schedule OC - PTE credit capped at PA tax when tax paid exceeds PA tax on allocable income", () => {
      // Entity overpaid: PTE tax $5,000 but PA tax on $100K = $3,070
      // Credit capped at $3,070
      const result = calculateScheduleOC(makeInput({
        pteCredits: [makePTE({
          allocablePAIncome: d(100000),
          pteTaxPaid: d(5000),
        })],
      }));
      expect(result.totalPTECredit.toNumber()).toBe(3070);
      expect(result.pteResults[0].paTaxOnAllocableIncome.toNumber()).toBe(3070);
      expect(result.pteResults[0].credit.toNumber()).toBe(3070);
    });

    it("PA Schedule OC - PTE credit equals tax paid when less than PA tax on allocable income", () => {
      // Entity paid $2,000 but PA tax on $100K = $3,070
      // Credit = $2,000 (the lesser amount)
      const result = calculateScheduleOC(makeInput({
        pteCredits: [makePTE({
          allocablePAIncome: d(100000),
          pteTaxPaid: d(2000),
        })],
      }));
      expect(result.totalPTECredit.toNumber()).toBe(2000);
      expect(result.pteResults[0].credit.toNumber()).toBe(2000);
    });

    it("PA Schedule OC - PTE credit is $0 when allocable income is zero", () => {
      const result = calculateScheduleOC(makeInput({
        pteCredits: [makePTE({
          allocablePAIncome: d(0),
          pteTaxPaid: d(1000),
        })],
      }));
      expect(result.totalPTECredit.toNumber()).toBe(0);
      expect(result.pteResults[0].paTaxOnAllocableIncome.toNumber()).toBe(0);
    });

    it("PA Schedule OC - PTE credit is $0 when allocable income is negative", () => {
      // Entity had a loss — no credit even if PTE tax was paid
      const result = calculateScheduleOC(makeInput({
        pteCredits: [makePTE({
          allocablePAIncome: d(-5000),
          pteTaxPaid: d(500),
        })],
      }));
      expect(result.totalPTECredit.toNumber()).toBe(0);
    });

    it("PA Schedule OC - multiple PTE entities summed independently", () => {
      const result = calculateScheduleOC(makeInput({
        pteCredits: [
          makePTE({
            entityName: "Alpha Partners",
            entityEIN: "11-1111111",
            allocablePAIncome: d(80000),
            pteTaxPaid: d(2456), // PA tax = $80K × 3.07% = $2,456 → credit = $2,456
          }),
          makePTE({
            entityName: "Beta LLC",
            entityEIN: "22-2222222",
            allocablePAIncome: d(50000),
            pteTaxPaid: d(2000), // PA tax = $50K × 3.07% = $1,535 → credit = $1,535 (capped)
          }),
        ],
      }));
      expect(result.pteResults).toHaveLength(2);
      expect(result.pteResults[0].credit.toNumber()).toBe(2456);
      expect(result.pteResults[1].credit.toNumber()).toBe(1535); // capped at PA tax
      expect(result.totalPTECredit.toNumber()).toBe(2456 + 1535);
    });

    it("PA Schedule OC - PTE credit from single entity with exact PA tax match", () => {
      // $200K allocable income → PA tax = $6,140
      // PTE paid exactly $6,140
      const result = calculateScheduleOC(makeInput({
        pteCredits: [makePTE({
          allocablePAIncome: d(200000),
          pteTaxPaid: d(6140),
        })],
      }));
      expect(result.totalPTECredit.toNumber()).toBe(6140);
    });

    it("PA Schedule OC - PTE credit rounds to dollar", () => {
      // $33,333 × 3.07% = $1,023.3231 → rounds to $1,023
      const result = calculateScheduleOC(makeInput({
        pteCredits: [makePTE({
          allocablePAIncome: d(33333),
          pteTaxPaid: d(2000),
        })],
      }));
      expect(result.pteResults[0].paTaxOnAllocableIncome.toNumber()).toBe(1023);
      expect(result.pteResults[0].credit.toNumber()).toBe(1023);
    });

    it("PA Schedule OC - PTE credit with zero tax paid", () => {
      const result = calculateScheduleOC(makeInput({
        pteCredits: [makePTE({
          allocablePAIncome: d(100000),
          pteTaxPaid: d(0),
        })],
      }));
      expect(result.totalPTECredit.toNumber()).toBe(0);
    });

    it("PA Schedule OC - no PTE entries produces $0 PTE credit", () => {
      const result = calculateScheduleOC(makeInput());
      expect(result.totalPTECredit.toNumber()).toBe(0);
      expect(result.pteResults).toHaveLength(0);
    });
  });

  // =================================================================
  // Employment Incentive Payment Credit (Line 2)
  // =================================================================

  describe("Employment Incentive Credit", () => {
    it("PA Schedule OC - employment incentive credit passes through", () => {
      const result = calculateScheduleOC(makeInput({
        otherCredits: [{
          creditType: "employment_incentive",
          amount: d(500),
          description: "Job training hire credit",
        }],
      }));
      expect(result.employmentIncentiveCredit.toNumber()).toBe(500);
    });

    it("PA Schedule OC - multiple employment incentive credits sum", () => {
      const result = calculateScheduleOC(makeInput({
        otherCredits: [
          { creditType: "employment_incentive", amount: d(500) },
          { creditType: "employment_incentive", amount: d(300) },
        ],
      }));
      expect(result.employmentIncentiveCredit.toNumber()).toBe(800);
    });
  });

  // =================================================================
  // Neighborhood Assistance Program Credit (Line 3)
  // =================================================================

  describe("NAP Credit", () => {
    it("PA Schedule OC - NAP credit passes through", () => {
      const result = calculateScheduleOC(makeInput({
        otherCredits: [{
          creditType: "neighborhood_assistance",
          amount: d(2000),
          description: "NAP contribution to approved project",
        }],
      }));
      expect(result.napCredit.toNumber()).toBe(2000);
    });
  });

  // =================================================================
  // Other Credits (Line 4)
  // =================================================================

  describe("Other Credits", () => {
    it("PA Schedule OC - other credits sum correctly", () => {
      const result = calculateScheduleOC(makeInput({
        otherCredits: [
          { creditType: "reap", amount: d(1000), description: "REAP conservation" },
          { creditType: "jobs_creation", amount: d(750), description: "Jobs creation" },
          { creditType: "eitc", amount: d(500), description: "Educational improvement" },
        ],
      }));
      expect(result.otherCreditsTotal.toNumber()).toBe(2250);
    });

    it("PA Schedule OC - REAP credit passes through", () => {
      const result = calculateScheduleOC(makeInput({
        otherCredits: [{ creditType: "reap", amount: d(1500) }],
      }));
      expect(result.otherCreditsTotal.toNumber()).toBe(1500);
    });

    it("PA Schedule OC - keystone zone credit passes through", () => {
      const result = calculateScheduleOC(makeInput({
        otherCredits: [{ creditType: "keystone_zone", amount: d(800) }],
      }));
      expect(result.otherCreditsTotal.toNumber()).toBe(800);
    });

    it("PA Schedule OC - OSTC credit passes through", () => {
      const result = calculateScheduleOC(makeInput({
        otherCredits: [{ creditType: "ostc", amount: d(400) }],
      }));
      expect(result.otherCreditsTotal.toNumber()).toBe(400);
    });

    it("PA Schedule OC - generic other credit type passes through", () => {
      const result = calculateScheduleOC(makeInput({
        otherCredits: [{
          creditType: "other",
          amount: d(250),
          description: "Coal refuse energy tax credit",
        }],
      }));
      expect(result.otherCreditsTotal.toNumber()).toBe(250);
    });

    it("PA Schedule OC - negative credit amounts floored to zero", () => {
      const result = calculateScheduleOC(makeInput({
        otherCredits: [{ creditType: "other", amount: d(-100) }],
      }));
      expect(result.otherCreditsTotal.toNumber()).toBe(0);
    });
  });

  // =================================================================
  // Total Credits (Line total)
  // =================================================================

  describe("Total Credits", () => {
    it("PA Schedule OC - total credits sum all types", () => {
      const result = calculateScheduleOC(makeInput({
        pteCredits: [makePTE({
          allocablePAIncome: d(100000),
          pteTaxPaid: d(3070),
        })],
        otherCredits: [
          { creditType: "employment_incentive", amount: d(500) },
          { creditType: "neighborhood_assistance", amount: d(1000) },
          { creditType: "reap", amount: d(750) },
        ],
      }));
      // PTE: $3,070 + Employment: $500 + NAP: $1,000 + Other: $750 = $5,320
      expect(result.totalPTECredit.toNumber()).toBe(3070);
      expect(result.employmentIncentiveCredit.toNumber()).toBe(500);
      expect(result.napCredit.toNumber()).toBe(1000);
      expect(result.otherCreditsTotal.toNumber()).toBe(750);
      expect(result.totalOtherCredits.toNumber()).toBe(5320);
    });

    it("PA Schedule OC - empty input produces all zeros", () => {
      const result = calculateScheduleOC(makeInput());
      expect(result.totalPTECredit.toNumber()).toBe(0);
      expect(result.employmentIncentiveCredit.toNumber()).toBe(0);
      expect(result.napCredit.toNumber()).toBe(0);
      expect(result.otherCreditsTotal.toNumber()).toBe(0);
      expect(result.totalOtherCredits.toNumber()).toBe(0);
    });

    it("PA Schedule OC - only PTE credits present", () => {
      const result = calculateScheduleOC(makeInput({
        pteCredits: [makePTE({
          allocablePAIncome: d(50000),
          pteTaxPaid: d(1535),
        })],
      }));
      expect(result.totalOtherCredits.toNumber()).toBe(1535);
      expect(result.employmentIncentiveCredit.toNumber()).toBe(0);
      expect(result.napCredit.toNumber()).toBe(0);
    });

    it("PA Schedule OC - only non-PTE credits present", () => {
      const result = calculateScheduleOC(makeInput({
        otherCredits: [
          { creditType: "employment_incentive", amount: d(200) },
          { creditType: "neighborhood_assistance", amount: d(300) },
        ],
      }));
      expect(result.totalPTECredit.toNumber()).toBe(0);
      expect(result.totalOtherCredits.toNumber()).toBe(500);
    });

    it("PA Schedule OC - audit trail is populated", () => {
      const result = calculateScheduleOC(makeInput({
        pteCredits: [makePTE()],
        otherCredits: [{ creditType: "employment_incentive", amount: d(100) }],
      }));
      expect(result.lines.length).toBeGreaterThan(0);
      expect(result.lines.some((l) => l.form === "PA-Schedule-OC")).toBe(true);
    });
  });

  // =================================================================
  // Edge Cases
  // =================================================================

  describe("Edge Cases", () => {
    it("PA Schedule OC - large PTE credit from high-income entity", () => {
      // $1M allocable income → PA tax = $30,700
      const result = calculateScheduleOC(makeInput({
        pteCredits: [makePTE({
          allocablePAIncome: d(1000000),
          pteTaxPaid: d(30700),
        })],
      }));
      expect(result.totalPTECredit.toNumber()).toBe(30700);
    });

    it("PA Schedule OC - very small PTE amounts", () => {
      // $100 income → PA tax = $3 (rounded from $3.07)
      const result = calculateScheduleOC(makeInput({
        pteCredits: [makePTE({
          allocablePAIncome: d(100),
          pteTaxPaid: d(5),
        })],
      }));
      expect(result.pteResults[0].paTaxOnAllocableIncome.toNumber()).toBe(3);
      expect(result.pteResults[0].credit.toNumber()).toBe(3); // capped at PA tax
    });

    it("PA Schedule OC - mixed credit types with PTE", () => {
      const result = calculateScheduleOC(makeInput({
        pteCredits: [
          makePTE({
            entityName: "Entity A",
            entityEIN: "11-1111111",
            allocablePAIncome: d(75000),
            pteTaxPaid: d(2303), // PA tax = $2,303 → credit = $2,303
          }),
        ],
        otherCredits: [
          { creditType: "employment_incentive", amount: d(100) },
          { creditType: "reap", amount: d(200) },
          { creditType: "other", amount: d(50) },
        ],
      }));
      expect(result.totalPTECredit.toNumber()).toBe(2303);
      expect(result.employmentIncentiveCredit.toNumber()).toBe(100);
      expect(result.otherCreditsTotal.toNumber()).toBe(250);
      expect(result.totalOtherCredits.toNumber()).toBe(2303 + 100 + 250);
    });

    it("PA Schedule OC - 2024 tax year uses 2024 constants", () => {
      const result = calculateScheduleOC({
        taxYear: 2024,
        pteCredits: [makePTE({
          allocablePAIncome: d(100000),
          pteTaxPaid: d(3070),
        })],
      });
      // 2024 rate is also 3.07%, so same result
      expect(result.totalPTECredit.toNumber()).toBe(3070);
    });

    it("PA Schedule OC - unsupported tax year throws", () => {
      expect(() => calculateScheduleOC({ taxYear: 2020 })).toThrow(
        "PA constants not available for tax year 2020",
      );
    });
  });
});
