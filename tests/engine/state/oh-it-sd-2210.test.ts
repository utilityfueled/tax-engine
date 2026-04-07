import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateOhioITSD2210,
  OH_IT_SD_2210_CONSTANTS,
  type OhioITSD2210Input,
} from "@/engine/state/oh-it-sd-2210.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dec(v: string | number): Decimal {
  return new Decimal(v);
}

function baseInput(overrides: Partial<OhioITSD2210Input> = {}): OhioITSD2210Input {
  return {
    taxYear: 2025,
    currentYearTaxLiability: 2000,
    ohioWithholding: 0,
    estimatedPayments: 0,
    priorYearTaxLiability: 0,
    priorYearTimelyFiled: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("OH IT/SD 2210 Constants", () => {
  it("has 2024 and 2025 year constants", () => {
    expect(OH_IT_SD_2210_CONSTANTS[2024]).toBeDefined();
    expect(OH_IT_SD_2210_CONSTANTS[2025]).toBeDefined();
  });

  it("2024 annual rate is 8%", () => {
    expect(OH_IT_SD_2210_CONSTANTS[2024]!.annualRate.toString()).toBe("0.08");
  });

  it("2025 annual rate is 8%", () => {
    expect(OH_IT_SD_2210_CONSTANTS[2025]!.annualRate.toString()).toBe("0.08");
  });

  it("2025 has four quarterly factors", () => {
    expect(OH_IT_SD_2210_CONSTANTS[2025]!.quarterlyFactors).toHaveLength(4);
  });

  it("2025 quarterly factors match published values", () => {
    const factors = OH_IT_SD_2210_CONSTANTS[2025]!.quarterlyFactors;
    expect(factors[0]!.factor.toNumber()).toBe(0.013580);
    expect(factors[1]!.factor.toNumber()).toBe(0.019932);
    expect(factors[2]!.factor.toNumber()).toBe(0.026311);
    expect(factors[3]!.factor.toNumber()).toBe(0.017248);
  });

  it("2024 quarterly factors match published values", () => {
    const factors = OH_IT_SD_2210_CONSTANTS[2024]!.quarterlyFactors;
    expect(factors[0]!.factor.toNumber()).toBe(0.013799);
    expect(factors[1]!.factor.toNumber()).toBe(0.019932);
    expect(factors[2]!.factor.toNumber()).toBe(0.026502);
    expect(factors[3]!.factor.toNumber()).toBe(0.019713);
  });
});

// ---------------------------------------------------------------------------
// Line 1 — Total taxes paid
// ---------------------------------------------------------------------------

describe("OH IT/SD 2210 Line 1 - total taxes paid", () => {
  it("sums withholding and estimated payments", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 5000,
      ohioWithholding: 3000,
      estimatedPayments: 1000,
    }));
    expect(result.line1_totalTaxesPaid).toEqual(dec(4000));
  });

  it("withholding only", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 5000,
      ohioWithholding: 3000,
    }));
    expect(result.line1_totalTaxesPaid).toEqual(dec(3000));
  });

  it("estimated payments only", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 5000,
      estimatedPayments: 2000,
    }));
    expect(result.line1_totalTaxesPaid).toEqual(dec(2000));
  });

  it("excludes scheduled estimated payments made after the final due date from line 1", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 6000,
      estimatedPayments: 5400,
      estimatedPaymentSchedule: [
        { date: "2026-01-16", amount: 5400 },
      ],
    }));

    expect(result.line1_totalTaxesPaid).toEqual(dec(0));
    expect(result.safeHarborA).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Line 2 — Current year liability
// ---------------------------------------------------------------------------

describe("OH IT/SD 2210 Line 2 - current year liability", () => {
  it("passes through current year liability", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 3500,
    }));
    expect(result.line2_currentYearLiability).toEqual(dec(3500));
  });
});

// ---------------------------------------------------------------------------
// Line 3 — Prior year liability
// ---------------------------------------------------------------------------

describe("OH IT/SD 2210 Line 3 - prior year liability", () => {
  it("passes through prior year liability", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 3000,
      priorYearTaxLiability: 2500,
    }));
    expect(result.line3_priorYearLiability).toEqual(dec(2500));
  });

  it("defaults to zero when not provided", () => {
    const result = calculateOhioITSD2210(baseInput());
    expect(result.line3_priorYearLiability).toEqual(dec(0));
  });
});

describe("OH IT/SD 2210 SD 100 mode", () => {
  it("OH IT/SD 2210 SD 100 mode uses school district line references in the audit trail", () => {
    const result = calculateOhioITSD2210(baseInput({
      formType: "sd100",
      currentYearTaxLiability: 1018,
      ohioWithholding: 200,
      estimatedPayments: 100,
      priorYearTaxLiability: 900,
      priorYearTimelyFiled: true,
    }));

    expect(result.lines.find((line) => line.line === "1")?.formula).toBe(
      "SD 100 line 11 + line 12",
    );
    expect(result.lines.find((line) => line.line === "2")?.formula).toBe(
      "SD 100 line 8",
    );
    expect(result.lines.find((line) => line.line === "3")?.formula).toBe(
      "Prior year SD 100 line 8",
    );
    expect(result.lines.find((line) => line.line === "17")?.formula).toBe(
      "Flows to SD 100 line 9",
    );
  });
});

// ---------------------------------------------------------------------------
// Safe Harbor A — payments >= 90% current year
// ---------------------------------------------------------------------------

describe("OH IT/SD 2210 safe harbor A - payments >= 90% current year", () => {
  it("no penalty when payments cover 90% of current year", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 9000, // 90% exactly
    }));
    expect(result.safeHarborA).toBe(true);
    expect(result.penaltyExempt).toBe(true);
    expect(result.line17_totalPenalty).toEqual(dec(0));
  });

  it("no penalty when payments exceed 90% of current year", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 9500,
    }));
    expect(result.safeHarborA).toBe(true);
    expect(result.penaltyExempt).toBe(true);
  });

  it("penalty when payments below 90% of current year", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 8999,
      priorYearTimelyFiled: false,
    }));
    expect(result.safeHarborA).toBe(false);
  });

  it("combined withholding and estimated meet 90% threshold", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 5000,
      estimatedPayments: 4000, // total 9000 = 90%
    }));
    expect(result.safeHarborA).toBe(true);
    expect(result.penaltyExempt).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Safe Harbor B — payments >= 100% prior year
// ---------------------------------------------------------------------------

describe("OH IT/SD 2210 safe harbor B - payments >= 100% prior year", () => {
  it("no penalty when payments cover 100% of prior year (timely filed)", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 3000,
      priorYearTaxLiability: 3000,
      priorYearTimelyFiled: true,
    }));
    expect(result.safeHarborB).toBe(true);
    expect(result.penaltyExempt).toBe(true);
  });

  it("no penalty when payments exceed prior year liability", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 4000,
      priorYearTaxLiability: 3000,
      priorYearTimelyFiled: true,
    }));
    expect(result.safeHarborB).toBe(true);
    expect(result.penaltyExempt).toBe(true);
  });

  it("safe harbor B does not apply when prior year not timely filed", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 3000,
      priorYearTaxLiability: 3000,
      priorYearTimelyFiled: false,
    }));
    expect(result.safeHarborB).toBe(false);
  });

  it("safe harbor B does not apply when no prior year return", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 3000,
      priorYearTaxLiability: 0,
    }));
    // priorYearTimelyFiled defaults to false when liability is 0
    expect(result.safeHarborB).toBe(false);
  });

  it("safe harbor B not met when payments below prior year", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 2999,
      priorYearTaxLiability: 3000,
      priorYearTimelyFiled: true,
    }));
    expect(result.safeHarborB).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Safe Harbor C — liability minus withholding <= $500
// ---------------------------------------------------------------------------

describe("OH IT/SD 2210 safe harbor C - liability minus withholding <= $500", () => {
  it("no penalty when liability minus withholding is $500", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 2500,
      ohioWithholding: 2000, // 2500 - 2000 = 500
    }));
    expect(result.safeHarborC).toBe(true);
    expect(result.penaltyExempt).toBe(true);
  });

  it("no penalty when liability minus withholding is below $500", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 2000,
      ohioWithholding: 1600, // 2000 - 1600 = 400
    }));
    expect(result.safeHarborC).toBe(true);
    expect(result.penaltyExempt).toBe(true);
  });

  it("no penalty when liability is $500 or less with zero withholding", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 500,
      ohioWithholding: 0,
    }));
    expect(result.safeHarborC).toBe(true);
    expect(result.penaltyExempt).toBe(true);
  });

  it("penalty when liability minus withholding exceeds $500", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 2000,
      ohioWithholding: 1499, // 2000 - 1499 = 501
    }));
    expect(result.safeHarborC).toBe(false);
  });

  it("safe harbor C uses withholding only, not estimated payments", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 2000,
      ohioWithholding: 0,
      estimatedPayments: 2000, // fully covered but not via withholding
    }));
    // $2000 - $0 withholding = $2000 > $500
    expect(result.safeHarborC).toBe(false);
    // But safe harbor A should apply (100% covered)
    expect(result.safeHarborA).toBe(true);
    expect(result.penaltyExempt).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Combined safe harbor logic
// ---------------------------------------------------------------------------

describe("OH IT/SD 2210 combined safe harbor logic", () => {
  it("any single safe harbor exempts from penalty", () => {
    // Only safe harbor C met
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 400,
      ohioWithholding: 0,
      priorYearTimelyFiled: false,
    }));
    expect(result.safeHarborA).toBe(false);
    expect(result.safeHarborB).toBe(false);
    expect(result.safeHarborC).toBe(true);
    expect(result.penaltyExempt).toBe(true);
    expect(result.line17_totalPenalty).toEqual(dec(0));
  });

  it("no safe harbor met means penalty computed", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 5000,
      ohioWithholding: 1000,
      estimatedPayments: 0,
      priorYearTimelyFiled: false,
    }));
    expect(result.safeHarborA).toBe(false);
    expect(result.safeHarborB).toBe(false);
    expect(result.safeHarborC).toBe(false);
    expect(result.penaltyExempt).toBe(false);
    expect(result.line17_totalPenalty.greaterThan(0)).toBe(true);
  });

  it("exempt result has null quarters", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 400,
    }));
    expect(result.penaltyExempt).toBe(true);
    expect(result.quarters).toBeNull();
  });

  it("non-exempt result has four quarterly details", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 5000,
      ohioWithholding: 1000,
      priorYearTimelyFiled: false,
    }));
    expect(result.penaltyExempt).toBe(false);
    expect(result.quarters).not.toBeNull();
    expect(result.quarters).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Line 9 — Required annual payment
// ---------------------------------------------------------------------------

describe("OH IT/SD 2210 Line 9 - required annual payment", () => {
  it("90% of current year when no prior year return", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 0,
      priorYearTimelyFiled: false,
    }));
    expect(result.line9_requiredAnnualPayment).toEqual(dec(9000));
  });

  it("lesser of 90% current and 100% prior year (prior is less)", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 0,
      priorYearTaxLiability: 5000,
      priorYearTimelyFiled: true,
    }));
    // min(5000, 9000) = 5000
    expect(result.line9_requiredAnnualPayment).toEqual(dec(5000));
  });

  it("lesser of 90% current and 100% prior year (90% current is less)", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 4000,
      ohioWithholding: 0,
      priorYearTaxLiability: 5000,
      priorYearTimelyFiled: true,
    }));
    // min(5000, 3600) = 3600
    expect(result.line9_requiredAnnualPayment).toEqual(dec(3600));
  });
});

// ---------------------------------------------------------------------------
// Line 10 — Cumulative required payment
// ---------------------------------------------------------------------------

describe("OH IT/SD 2210 Line 10 - cumulative required payment", () => {
  it("splits required payment into 25/50/75/100%", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 0,
      priorYearTimelyFiled: false,
    }));
    // Required annual = 9000
    expect(result.quarters![0]!.cumulativeRequired).toEqual(dec(2250)); // 25%
    expect(result.quarters![1]!.cumulativeRequired).toEqual(dec(4500)); // 50%
    expect(result.quarters![2]!.cumulativeRequired).toEqual(dec(6750)); // 75%
    expect(result.quarters![3]!.cumulativeRequired).toEqual(dec(9000)); // 100%
  });
});

// ---------------------------------------------------------------------------
// Line 11 — Withholding spread evenly
// ---------------------------------------------------------------------------

describe("OH IT/SD 2210 Line 11 - withholding spread evenly", () => {
  it("distributes withholding evenly across quarters", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 4000,
      priorYearTimelyFiled: false,
    }));
    expect(result.quarters![0]!.cumulativeWithholding).toEqual(dec(1000)); // 25%
    expect(result.quarters![1]!.cumulativeWithholding).toEqual(dec(2000)); // 50%
    expect(result.quarters![2]!.cumulativeWithholding).toEqual(dec(3000)); // 75%
    expect(result.quarters![3]!.cumulativeWithholding).toEqual(dec(4000)); // 100%
  });
});

// ---------------------------------------------------------------------------
// Line 12 — Cumulative estimated payments
// ---------------------------------------------------------------------------

describe("OH IT/SD 2210 Line 12 - cumulative estimated payments", () => {
  it("allocates estimated payments to Q4 when no schedule provided", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 0,
      estimatedPayments: 5000,
      priorYearTimelyFiled: false,
    }));
    expect(result.quarters![0]!.cumulativeEstimated).toEqual(dec(0));
    expect(result.quarters![1]!.cumulativeEstimated).toEqual(dec(0));
    expect(result.quarters![2]!.cumulativeEstimated).toEqual(dec(0));
    expect(result.quarters![3]!.cumulativeEstimated).toEqual(dec(5000));
  });

  it("allocates scheduled payments to correct quarters", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 0,
      estimatedPayments: 4000,
      priorYearTimelyFiled: false,
      estimatedPaymentSchedule: [
        { date: "2025-04-15", amount: 1000 },
        { date: "2025-06-16", amount: 1000 },
        { date: "2025-09-15", amount: 1000 },
        { date: "2026-01-15", amount: 1000 },
      ],
    }));
    expect(result.quarters![0]!.cumulativeEstimated).toEqual(dec(1000));
    expect(result.quarters![1]!.cumulativeEstimated).toEqual(dec(2000));
    expect(result.quarters![2]!.cumulativeEstimated).toEqual(dec(3000));
    expect(result.quarters![3]!.cumulativeEstimated).toEqual(dec(4000));
  });

  it("early payments are credited to earliest applicable quarter", () => {
    // Use $8000 estimated (< 90% of $10000) so safe harbor A does NOT trigger
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 0,
      estimatedPayments: 8000,
      priorYearTimelyFiled: false,
      estimatedPaymentSchedule: [
        { date: "2025-01-15", amount: 8000 }, // before Q1 due date
      ],
    }));
    // All credited to Q1 and cumulative through all quarters
    expect(result.quarters![0]!.cumulativeEstimated).toEqual(dec(8000));
    expect(result.quarters![1]!.cumulativeEstimated).toEqual(dec(8000));
    expect(result.quarters![2]!.cumulativeEstimated).toEqual(dec(8000));
    expect(result.quarters![3]!.cumulativeEstimated).toEqual(dec(8000));
  });

  it("late payment after all due dates is excluded from Q4", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 0,
      estimatedPayments: 5000,
      priorYearTimelyFiled: false,
      estimatedPaymentSchedule: [
        { date: "2026-03-01", amount: 5000 }, // after all due dates
      ],
    }));
    expect(result.quarters![0]!.cumulativeEstimated).toEqual(dec(0));
    expect(result.quarters![1]!.cumulativeEstimated).toEqual(dec(0));
    expect(result.quarters![2]!.cumulativeEstimated).toEqual(dec(0));
    expect(result.quarters![3]!.cumulativeEstimated).toEqual(dec(0));
  });

  it("payments after the final due date do not count in any quarter", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 0,
      estimatedPayments: 5000,
      priorYearTimelyFiled: false,
      estimatedPaymentSchedule: [
        { date: "2026-01-16", amount: 5000 },
      ],
    }));

    expect(result.quarters![0]!.cumulativeEstimated).toEqual(dec(0));
    expect(result.quarters![1]!.cumulativeEstimated).toEqual(dec(0));
    expect(result.quarters![2]!.cumulativeEstimated).toEqual(dec(0));
    expect(result.quarters![3]!.cumulativeEstimated).toEqual(dec(0));
  });
});

// ---------------------------------------------------------------------------
// Line 13 — Total cumulative payments
// ---------------------------------------------------------------------------

describe("OH IT/SD 2210 Line 13 - total cumulative payments", () => {
  it("sums withholding and estimated per quarter", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 4000,
      estimatedPayments: 2000,
      priorYearTimelyFiled: false,
      estimatedPaymentSchedule: [
        { date: "2025-04-15", amount: 500 },
        { date: "2025-06-16", amount: 500 },
        { date: "2025-09-15", amount: 500 },
        { date: "2026-01-15", amount: 500 },
      ],
    }));
    // Q1: 1000 withholding + 500 estimated = 1500
    expect(result.quarters![0]!.cumulativePayments).toEqual(dec(1500));
    // Q2: 2000 + 1000 = 3000
    expect(result.quarters![1]!.cumulativePayments).toEqual(dec(3000));
    // Q3: 3000 + 1500 = 4500
    expect(result.quarters![2]!.cumulativePayments).toEqual(dec(4500));
    // Q4: 4000 + 2000 = 6000
    expect(result.quarters![3]!.cumulativePayments).toEqual(dec(6000));
  });
});

// ---------------------------------------------------------------------------
// Line 14 — Quarterly underpayment
// ---------------------------------------------------------------------------

describe("OH IT/SD 2210 Line 14 - quarterly underpayment", () => {
  it("computes underpayment as required minus payments, floored at zero", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 0,
      estimatedPayments: 0,
      priorYearTimelyFiled: false,
    }));
    // Required annual = 9000, split 25% per quarter
    // No payments → full underpayment each quarter
    expect(result.quarters![0]!.underpayment).toEqual(dec(2250));
    expect(result.quarters![1]!.underpayment).toEqual(dec(4500));
    expect(result.quarters![2]!.underpayment).toEqual(dec(6750));
    expect(result.quarters![3]!.underpayment).toEqual(dec(9000));
  });

  it("covering required annual payment triggers safe harbor A — no penalty", () => {
    // Covering 90% of current year via scheduled payments meets safe harbor A
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 0,
      estimatedPayments: 9000,
      priorYearTimelyFiled: false,
      estimatedPaymentSchedule: [
        { date: "2025-04-15", amount: 2250 },
        { date: "2025-06-16", amount: 2250 },
        { date: "2025-09-15", amount: 2250 },
        { date: "2026-01-15", amount: 2250 },
      ],
    }));
    expect(result.safeHarborA).toBe(true);
    expect(result.penaltyExempt).toBe(true);
    expect(result.line17_totalPenalty).toEqual(dec(0));
  });

  it("partial withholding reduces underpayment", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 4000,
      estimatedPayments: 0,
      priorYearTimelyFiled: false,
    }));
    // Required: 9000, withholding: 4000 (1000/quarter)
    // Q1: max(0, 2250 - 1000) = 1250
    expect(result.quarters![0]!.underpayment).toEqual(dec(1250));
    // Q2: max(0, 4500 - 2000) = 2500
    expect(result.quarters![1]!.underpayment).toEqual(dec(2500));
    // Q3: max(0, 6750 - 3000) = 3750
    expect(result.quarters![2]!.underpayment).toEqual(dec(3750));
    // Q4: max(0, 9000 - 4000) = 5000
    expect(result.quarters![3]!.underpayment).toEqual(dec(5000));
  });
});

// ---------------------------------------------------------------------------
// Line 15 — Interest rate factors
// ---------------------------------------------------------------------------

describe("OH IT/SD 2210 Line 15 - interest rate factors", () => {
  it("2025 factors applied correctly to quarters", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 0,
      priorYearTimelyFiled: false,
    }));
    expect(result.quarters![0]!.rateFactor.toNumber()).toBe(0.013580);
    expect(result.quarters![1]!.rateFactor.toNumber()).toBe(0.019932);
    expect(result.quarters![2]!.rateFactor.toNumber()).toBe(0.026311);
    expect(result.quarters![3]!.rateFactor.toNumber()).toBe(0.017248);
  });

  it("2024 factors applied correctly", () => {
    const result = calculateOhioITSD2210(baseInput({
      taxYear: 2024,
      currentYearTaxLiability: 10000,
      ohioWithholding: 0,
      priorYearTimelyFiled: false,
    }));
    expect(result.quarters![0]!.rateFactor.toNumber()).toBe(0.013799);
    expect(result.quarters![1]!.rateFactor.toNumber()).toBe(0.019932);
    expect(result.quarters![2]!.rateFactor.toNumber()).toBe(0.026502);
    expect(result.quarters![3]!.rateFactor.toNumber()).toBe(0.019713);
  });
});

// ---------------------------------------------------------------------------
// Line 16 — Quarterly interest penalty
// ---------------------------------------------------------------------------

describe("OH IT/SD 2210 Line 16 - quarterly interest penalty", () => {
  it("penalty = underpayment * factor (rounded to cents)", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 0,
      estimatedPayments: 0,
      priorYearTimelyFiled: false,
    }));
    // Q1 underpayment = 2250, factor = 0.013580
    // 2250 * 0.013580 = 30.555 → 30.56
    expect(result.quarters![0]!.interestPenalty).toEqual(dec("30.56"));
    // Q2 underpayment = 4500, factor = 0.019932
    // 4500 * 0.019932 = 89.694 → 89.69
    expect(result.quarters![1]!.interestPenalty).toEqual(dec("89.69"));
    // Q3 underpayment = 6750, factor = 0.026311
    // 6750 * 0.026311 = 177.59925 → 177.60
    expect(result.quarters![2]!.interestPenalty).toEqual(dec("177.60"));
    // Q4 underpayment = 9000, factor = 0.017248
    // 9000 * 0.017248 = 155.232 → 155.23
    expect(result.quarters![3]!.interestPenalty).toEqual(dec("155.23"));
  });
});

// ---------------------------------------------------------------------------
// Line 17 — Total penalty
// ---------------------------------------------------------------------------

describe("OH IT/SD 2210 Line 17 - total penalty", () => {
  it("sums quarterly penalties and rounds to nearest dollar", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 0,
      estimatedPayments: 0,
      priorYearTimelyFiled: false,
    }));
    // 30.56 + 89.69 + 177.60 + 155.23 = 453.08 → $453
    expect(result.line17_totalPenalty).toEqual(dec(453));
  });

  it("zero penalty when all quarters covered by payments", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 9000,
    }));
    expect(result.line17_totalPenalty).toEqual(dec(0));
  });

  it("penalty with partial withholding", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 4000,
      estimatedPayments: 0,
      priorYearTimelyFiled: false,
    }));
    // Q1: max(0, 2250-1000)=1250, 1250*0.013580=16.975→16.98
    // Q2: max(0, 4500-2000)=2500, 2500*0.019932=49.83→49.83
    // Q3: max(0, 6750-3000)=3750, 3750*0.026311=98.66625→98.67
    // Q4: max(0, 9000-4000)=5000, 5000*0.017248=86.24→86.24
    // Sum: 16.98 + 49.83 + 98.67 + 86.24 = 251.72 → $252
    expect(result.line17_totalPenalty).toEqual(dec(252));
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("OH IT/SD 2210 edge cases", () => {
  it("zero liability produces zero penalty", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 0,
    }));
    expect(result.penaltyExempt).toBe(true);
    expect(result.line17_totalPenalty).toEqual(dec(0));
  });

  it("negative liability treated as zero (safe harbor C)", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: -100,
      ohioWithholding: 0,
    }));
    // -100 - 0 = -100 <= 500
    expect(result.safeHarborC).toBe(true);
    expect(result.penaltyExempt).toBe(true);
  });

  it("throws for unsupported tax year", () => {
    expect(() =>
      calculateOhioITSD2210(baseInput({ taxYear: 2020 }))
    ).toThrow("constants not available");
  });

  it("prior year lower than 90% current reduces required payment", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 20000,
      ohioWithholding: 2000,
      priorYearTaxLiability: 3000,
      priorYearTimelyFiled: true,
    }));
    // Required = min(3000, 18000) = 3000
    expect(result.line9_requiredAnnualPayment).toEqual(dec(3000));
    // Q4 cumulative required = 3000, cumulative withholding = 2000
    // Underpayment Q4 = max(0, 3000 - 2000) = 1000
    expect(result.quarters![3]!.underpayment).toEqual(dec(1000));
  });

  it("withholding covers required but not full tax → no penalty (safe harbor)", () => {
    // Current: $5000, prior: $3000 (timely filed)
    // Required = min(3000, 4500) = 3000
    // Withholding: $3500 → safe harbor A? 90% of 5000 = 4500, 3500 < 4500 → no
    // Safe harbor B? 3500 >= 3000 → yes!
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 5000,
      ohioWithholding: 3500,
      priorYearTaxLiability: 3000,
      priorYearTimelyFiled: true,
    }));
    expect(result.safeHarborB).toBe(true);
    expect(result.penaltyExempt).toBe(true);
  });

  it("front-loaded estimated payments reduce later-quarter underpayments", () => {
    // Required = 90% of 10000 = 9000 (no prior year)
    // Pay 5000 up front in Q1 — covers Q1 and Q2 required, partially Q3
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 10000,
      ohioWithholding: 0,
      estimatedPayments: 5000,
      priorYearTimelyFiled: false,
      estimatedPaymentSchedule: [
        { date: "2025-04-15", amount: 5000 },
      ],
    }));
    // Q1: required 2250, paid 5000 → underpay 0
    expect(result.quarters![0]!.underpayment).toEqual(dec(0));
    // Q2: required 4500, paid 5000 → underpay 0
    expect(result.quarters![1]!.underpayment).toEqual(dec(0));
    // Q3: required 6750, paid 5000 → underpay 1750
    expect(result.quarters![2]!.underpayment).toEqual(dec(1750));
    // Q4: required 9000, paid 5000 → underpay 4000
    expect(result.quarters![3]!.underpayment).toEqual(dec(4000));
    expect(result.line17_totalPenalty.greaterThan(0)).toBe(true);
  });

  it("2024 tax year computes correctly", () => {
    const result = calculateOhioITSD2210(baseInput({
      taxYear: 2024,
      currentYearTaxLiability: 8000,
      ohioWithholding: 0,
      estimatedPayments: 0,
      priorYearTimelyFiled: false,
    }));
    // Required: 90% of 8000 = 7200
    expect(result.line9_requiredAnnualPayment).toEqual(dec(7200));
    expect(result.penaltyExempt).toBe(false);
    expect(result.line17_totalPenalty.greaterThan(0)).toBe(true);
  });

  it("penalty is zero when exact required payments made each quarter", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 4000,
      ohioWithholding: 0,
      estimatedPayments: 3600,
      priorYearTimelyFiled: false,
      estimatedPaymentSchedule: [
        { date: "2025-04-15", amount: 900 },
        { date: "2025-06-16", amount: 900 },
        { date: "2025-09-15", amount: 900 },
        { date: "2026-01-15", amount: 900 },
      ],
    }));
    // Required = 3600, each quarter exactly covered
    expect(result.line17_totalPenalty).toEqual(dec(0));
  });

  it("generates audit trail lines", () => {
    const result = calculateOhioITSD2210(baseInput({
      currentYearTaxLiability: 5000,
      ohioWithholding: 1000,
      priorYearTimelyFiled: false,
    }));
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.lines.some((l) => l.form === "OH-IT/SD-2210")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Realistic scenarios
// ---------------------------------------------------------------------------

describe("OH IT/SD 2210 realistic scenarios", () => {
  it("W-2 worker with adequate withholding — no penalty", () => {
    const result = calculateOhioITSD2210({
      taxYear: 2025,
      currentYearTaxLiability: 2376, // ~$100K income
      ohioWithholding: 2400,
    });
    expect(result.penaltyExempt).toBe(true);
    expect(result.line17_totalPenalty).toEqual(dec(0));
  });

  it("freelancer who forgot estimated payments — penalty computed", () => {
    const result = calculateOhioITSD2210({
      taxYear: 2025,
      currentYearTaxLiability: 3000,
      ohioWithholding: 0,
      estimatedPayments: 0,
      priorYearTaxLiability: 0,
      priorYearTimelyFiled: false,
    });
    expect(result.penaltyExempt).toBe(false);
    // Required: 90% of 3000 = 2700
    expect(result.line9_requiredAnnualPayment).toEqual(dec(2700));
    // All quarters underpaid → penalty > 0
    expect(result.line17_totalPenalty.greaterThan(0)).toBe(true);
  });

  it("taxpayer with big income jump — prior year safe harbor", () => {
    // Made $50K last year (tax ~$660), makes $200K this year (tax ~$5,519)
    const result = calculateOhioITSD2210({
      taxYear: 2025,
      currentYearTaxLiability: 5519,
      ohioWithholding: 700,
      estimatedPayments: 0,
      priorYearTaxLiability: 660,
      priorYearTimelyFiled: true,
    });
    // Safe harbor B: 700 >= 660 → yes!
    expect(result.safeHarborB).toBe(true);
    expect(result.penaltyExempt).toBe(true);
  });

  it("self-employed with quarterly payments — partial coverage", () => {
    const result = calculateOhioITSD2210({
      taxYear: 2025,
      currentYearTaxLiability: 8000,
      ohioWithholding: 0,
      estimatedPayments: 4000,
      priorYearTaxLiability: 0,
      priorYearTimelyFiled: false,
      estimatedPaymentSchedule: [
        { date: "2025-04-15", amount: 1000 },
        { date: "2025-06-16", amount: 1000 },
        { date: "2025-09-15", amount: 1000 },
        { date: "2026-01-15", amount: 1000 },
      ],
    });
    // Required = 7200
    // Q1: required 1800, paid 1000 → underpay 800
    // Q2: required 3600, paid 2000 → underpay 1600
    // Q3: required 5400, paid 3000 → underpay 2400
    // Q4: required 7200, paid 4000 → underpay 3200
    expect(result.quarters![0]!.underpayment).toEqual(dec(800));
    expect(result.quarters![1]!.underpayment).toEqual(dec(1600));
    expect(result.quarters![2]!.underpayment).toEqual(dec(2400));
    expect(result.quarters![3]!.underpayment).toEqual(dec(3200));
    expect(result.line17_totalPenalty.greaterThan(0)).toBe(true);
  });

  it("MFJ couple with combined withholding barely under $500 threshold", () => {
    const result = calculateOhioITSD2210({
      taxYear: 2025,
      currentYearTaxLiability: 3000,
      ohioWithholding: 2501, // 3000 - 2501 = 499 <= 500
    });
    expect(result.safeHarborC).toBe(true);
    expect(result.penaltyExempt).toBe(true);
  });
});
