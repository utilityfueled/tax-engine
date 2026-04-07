/**
 * Tests for Illinois Schedule ICR — Nonrefundable Credits
 * Spec: spec/state/il-schedule-icr.yaml
 *
 * 2025: Property tax credit 5%, education credit 25% (over $250, max $750),
 * volunteer emergency worker $500/$1,000.
 * Property tax and education denied if AGI > $250K (single) / $500K (MFJ).
 * Source: Illinois Department of Revenue, 2025 Schedule ICR Instructions
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleICR, type ScheduleICRComputedInput } from "@/engine/state/il-schedule-icr.js";

const d = (n: number | string) => new Decimal(n);
const ZERO = d(0);

function makeInput(overrides: Partial<ScheduleICRComputedInput> = {}): ScheduleICRComputedInput {
  const input: ScheduleICRComputedInput = {
    taxYear: 2025,
    incomeTax: d(5000),
    otherStateCredit: ZERO,
    federalAGI: d(75000),
    filingStatus: "single",
    propertyTaxPaid: ZERO,
    propertyTaxBusinessDeduction: ZERO,
    k12EducationExpenses: ZERO,
    volunteerEmergencyWorkerCount: 0,
    volunteerEmergencyWorkerCertificateNumbers: [],
    ...overrides,
  };

  if (input.propertyTaxPaid.greaterThan(0) && input.propertyTaxProperties === undefined) {
    return {
      ...input,
      propertyTaxProperties: [
        {
          county: "Sangamon",
          propertyNumber: "14-22-100-001",
        },
      ],
    };
  }

  return input;
}

describe("Illinois Schedule ICR", () => {
  // ==================== Lines 1-3: Setup ====================

  it("Schedule ICR Line 1 - tax from IL-1040", () => {
    const result = calculateScheduleICR(makeInput({ incomeTax: d(3000) }));
    expect(result.remainingTax.toNumber()).toBe(3000);
  });

  it("Schedule ICR Line 2 - other state credit reduces remaining", () => {
    const result = calculateScheduleICR(makeInput({
      incomeTax: d(5000),
      otherStateCredit: d(1000),
    }));
    expect(result.remainingTax.toNumber()).toBe(4000);
  });

  it("Schedule ICR Line 3 - remaining tax floors at zero", () => {
    const result = calculateScheduleICR(makeInput({
      incomeTax: d(500),
      otherStateCredit: d(1000),
    }));
    expect(result.remainingTax.toNumber()).toBe(0);
  });

  it("Schedule ICR Lines 1 through 3 - rounds IL-1040 sourced amounts to whole dollars before computing remaining tax", () => {
    const result = calculateScheduleICR(makeInput({
      incomeTax: d("100.49"),
      otherStateCredit: d("99.50"),
    }));

    expect(result.remainingTax.toNumber()).toBe(0);
    expect(result.lines.find((line) => line.line === "1")?.value.toNumber()).toBe(100);
    expect(result.lines.find((line) => line.line === "2")?.value.toNumber()).toBe(100);
  });

  // ==================== Section A: Property Tax Credit ====================

  it("Schedule ICR property tax credit - 5% of qualifying taxes", () => {
    const result = calculateScheduleICR(makeInput({
      propertyTaxPaid: d(6000),
    }));
    // 6000 × 5% = 300
    expect(result.propertyTaxCredit.toNumber()).toBe(300);
  });

  it("Schedule ICR property tax credit - subtracts business deduction", () => {
    const result = calculateScheduleICR(makeInput({
      propertyTaxPaid: d(8000),
      propertyTaxBusinessDeduction: d(2000),
    }));
    // (8000 - 2000) × 5% = 300
    expect(result.propertyTaxCredit.toNumber()).toBe(300);
  });

  it("Schedule ICR Line 4e - business deduction reduces qualifying property tax", () => {
    const result = calculateScheduleICR(makeInput({
      propertyTaxPaid: d(10000),
      propertyTaxBusinessDeduction: d(4000),
    }));
    // (10000 - 4000) × 5% = 300
    expect(result.propertyTaxCredit.toNumber()).toBe(300);
  });

  it("Schedule ICR Lines 4a through 4g - rounds property tax line amounts before computing the credit", () => {
    const result = calculateScheduleICR(makeInput({
      propertyTaxPaid: d("1000.49"),
      propertyTaxBusinessDeduction: d("0.50"),
    }));

    expect(result.lines.find((line) => line.line === "4a")?.value.toNumber()).toBe(1000);
    expect(result.lines.find((line) => line.line === "4e")?.value.toNumber()).toBe(1);
    expect(result.lines.find((line) => line.line === "4f")?.value.toNumber()).toBe(999);
    expect(result.lines.find((line) => line.line === "4g")?.value.toNumber()).toBe(50);
    expect(result.propertyTaxCredit.toNumber()).toBe(50);
  });

  it("Schedule ICR Line 4e - rejects a business deduction larger than property tax paid", () => {
    expect(() => calculateScheduleICR(makeInput({
      propertyTaxPaid: d(1000),
      propertyTaxBusinessDeduction: d(1001),
    }))).toThrow("Schedule ICR Line 4e business deduction cannot exceed Line 4a property tax paid");
  });

  it("Schedule ICR property tax credit capped at remaining tax", () => {
    const result = calculateScheduleICR(makeInput({
      incomeTax: d(200),
      propertyTaxPaid: d(10000),
    }));
    // Credit would be 500, but remaining tax is only 200
    expect(result.propertyTaxCredit.toNumber()).toBe(200);
  });

  it("Schedule ICR property tax credit respects shared cap used on another separate Illinois return", () => {
    const result = calculateScheduleICR(makeInput({
      propertyTaxPaid: d(10000),
      propertyTaxCreditClaimedOnOtherReturns: d(300),
    }));
    // Raw credit = 500, other return already used 300, remaining shared cap = 200
    expect(result.propertyTaxCredit.toNumber()).toBe(200);
  });

  it("Schedule ICR property tax credit floors at zero when another return already used the full shared cap", () => {
    const result = calculateScheduleICR(makeInput({
      propertyTaxPaid: d(10000),
      propertyTaxCreditClaimedOnOtherReturns: d(600),
    }));
    expect(result.propertyTaxCredit.toNumber()).toBe(0);
  });

  it("Schedule ICR Line 5 - rejects a negative property tax credit claimed on another return", () => {
    expect(() => calculateScheduleICR(makeInput({
      propertyTaxPaid: d(10000),
      propertyTaxCreditClaimedOnOtherReturns: d(-1),
    }))).toThrow("Schedule ICR property tax credit claimed on another return must be non-negative");
  });

  it("Schedule ICR Line 4b through 4d - property tax claims require at least one county and property number", () => {
    expect(() => calculateScheduleICR(makeInput({
      propertyTaxPaid: d(6000),
      propertyTaxProperties: [],
    }))).toThrow(
      "Schedule ICR property tax credit claims require at least one county and property number",
    );
  });

  it("Schedule ICR Line 4b through 4d - preserves up to three property identifiers on the result", () => {
    const result = calculateScheduleICR(makeInput({
      propertyTaxPaid: d(6000),
      propertyTaxProperties: [
        { county: "Sangamon", propertyNumber: "14-22-100-001" },
        { county: "Sangamon", propertyNumber: "14-22-100-002" },
        { county: "Sangamon", propertyNumber: "14-22-100-003" },
      ],
    }));

    expect(result.propertyTaxProperties).toEqual([
      { county: "Sangamon", propertyNumber: "14-22-100-001" },
      { county: "Sangamon", propertyNumber: "14-22-100-002" },
      { county: "Sangamon", propertyNumber: "14-22-100-003" },
    ]);
  });

  it("Schedule ICR property tax credit - denied when AGI > $250K single", () => {
    const result = calculateScheduleICR(makeInput({
      federalAGI: d(260000),
      propertyTaxPaid: d(8000),
    }));
    expect(result.propertyTaxCredit.toNumber()).toBe(0);
  });

  it("Schedule ICR property tax credit - allowed when AGI exactly $250K single", () => {
    const result = calculateScheduleICR(makeInput({
      federalAGI: d(250000),
      propertyTaxPaid: d(8000),
    }));
    expect(result.propertyTaxCredit.toNumber()).toBe(400); // 8000 × 5%
  });

  it("Schedule ICR property tax credit - denied when AGI > $500K MFJ", () => {
    const result = calculateScheduleICR(makeInput({
      filingStatus: "married_filing_jointly",
      federalAGI: d(510000),
      propertyTaxPaid: d(8000),
    }));
    expect(result.propertyTaxCredit.toNumber()).toBe(0);
  });

  it("Schedule ICR property tax credit - allowed when AGI exactly $500K MFJ", () => {
    const result = calculateScheduleICR(makeInput({
      filingStatus: "married_filing_jointly",
      federalAGI: d(500000),
      propertyTaxPaid: d(8000),
    }));
    expect(result.propertyTaxCredit.toNumber()).toBe(400);
  });

  it("Schedule ICR Line 6 - remaining after property tax", () => {
    const result = calculateScheduleICR(makeInput({
      incomeTax: d(5000),
      propertyTaxPaid: d(6000),
    }));
    // Remaining: 5000, credit: 300, after: 4700
    expect(result.remainingTax.toNumber()).toBe(5000);
    expect(result.propertyTaxCredit.toNumber()).toBe(300);
  });

  // ==================== Section B: K-12 Education Expense Credit ====================

  it("Schedule ICR education expense credit - 25% over $250", () => {
    const result = calculateScheduleICR(makeInput({
      k12EducationExpenses: d(1250),
    }));
    // (1250 - 250) × 25% = 250
    expect(result.educationCredit.toNumber()).toBe(250);
  });

  it("Schedule ICR Line 7a - rounds the direct K-12 expense input to a whole-dollar line amount before computing the credit", () => {
    const result = calculateScheduleICR(makeInput({
      k12EducationExpenses: d("251.75"),
    }));

    expect(result.lines.find((line) => line.line === "7a")?.value.toNumber()).toBe(252);
    expect(result.educationCredit.toNumber()).toBe(1);
  });

  it("Schedule ICR Line 7a - worksheet Line 15 overrides the direct K-12 expense input", () => {
    const result = calculateScheduleICR(makeInput({
      k12EducationExpenses: d(9999),
      k12EducationExpenseWorksheet: {
        taxYear: 2025,
        students: [
          {
            studentName: "A Student",
            studentSSN: "111-22-3333",
            grade: "3",
            schoolName: "Lincoln Elementary",
            schoolCity: "Springfield",
            schoolType: "public",
            tuitionBookLabFees: d(600),
          },
          {
            studentName: "B Student",
            studentSSN: "444-55-6666",
            grade: "K",
            schoolName: "home school",
            schoolCity: "Naperville",
            schoolType: "home_school",
            tuitionBookLabFees: d(650),
          },
        ],
      },
    }));

    // Worksheet Line 15 = 1250, so credit is based on that amount instead of 9999.
    expect(result.educationCredit.toNumber()).toBe(250);
    expect(result.lines.find((line) => line.line === "15")?.description).toBe("Total qualified education expenses");
  });

  it("Schedule ICR Line 7a - worksheet override ignores an otherwise invalid direct K-12 expense placeholder", () => {
    const result = calculateScheduleICR(makeInput({
      k12EducationExpenses: d(-1),
      k12EducationExpenseWorksheet: {
        taxYear: 2025,
        students: [
          {
            studentName: "A Student",
            studentSSN: "111-22-3333",
            grade: "3",
            schoolName: "Lincoln Elementary",
            schoolCity: "Springfield",
            schoolType: "public",
            tuitionBookLabFees: d(600),
          },
        ],
      },
    }));

    expect(result.k12EducationExpenseWorksheet?.totalQualifiedEducationExpenses.toNumber()).toBe(600);
    expect(result.educationCredit.toNumber()).toBe(88);
  });

  it("Schedule ICR education expense credit - max $750", () => {
    const result = calculateScheduleICR(makeInput({
      k12EducationExpenses: d(5000),
    }));
    // (5000 - 250) × 25% = 1187.50 → rounds to 1188, capped at 750
    expect(result.educationCredit.toNumber()).toBe(750);
  });

  it("Schedule ICR education expense credit - no credit on first $250", () => {
    const result = calculateScheduleICR(makeInput({
      k12EducationExpenses: d(250),
    }));
    expect(result.educationCredit.toNumber()).toBe(0);
  });

  it("Schedule ICR education expense credit - expenses below $250", () => {
    const result = calculateScheduleICR(makeInput({
      k12EducationExpenses: d(100),
    }));
    expect(result.educationCredit.toNumber()).toBe(0);
  });

  it("Schedule ICR Line 7a - rejects negative K-12 education expenses", () => {
    expect(() => calculateScheduleICR(makeInput({
      k12EducationExpenses: d(-1),
    }))).toThrow("Schedule ICR Line 7a K-12 education expenses must be non-negative");
  });

  it("Schedule ICR education credit capped at remaining tax", () => {
    const result = calculateScheduleICR(makeInput({
      incomeTax: d(100),
      k12EducationExpenses: d(3000),
    }));
    // Would be 688, but only 100 remaining
    expect(result.educationCredit.toNumber()).toBe(100);
  });

  it("Schedule ICR education credit respects shared cap used on another separate Illinois return", () => {
    const result = calculateScheduleICR(makeInput({
      k12EducationExpenses: d(3250),
      educationCreditClaimedOnOtherReturns: d(250),
    }));
    // Raw credit = 750, other return already used 250, remaining shared cap = 500
    expect(result.educationCredit.toNumber()).toBe(500);
  });

  it("Schedule ICR Line 8 - rejects a negative education credit claimed on another return", () => {
    expect(() => calculateScheduleICR(makeInput({
      k12EducationExpenses: d(3250),
      educationCreditClaimedOnOtherReturns: d(-1),
    }))).toThrow("Schedule ICR education credit claimed on another return must be non-negative");
  });

  it("Schedule ICR education credit - denied when AGI > $250K single", () => {
    const result = calculateScheduleICR(makeInput({
      federalAGI: d(260000),
      k12EducationExpenses: d(3000),
    }));
    expect(result.educationCredit.toNumber()).toBe(0);
  });

  it("Schedule ICR property and education credits - explicit nonresident returns only keep the volunteer credit", () => {
    const result = calculateScheduleICR(makeInput({
      residencyType: "nonresident",
      propertyTaxPaid: d(8000),
      k12EducationExpenses: d(2000),
      volunteerEmergencyWorkerCount: 1,
      volunteerEmergencyWorkerCertificateNumbers: ["VEW-1001"],
    }));

    expect(result.propertyTaxCredit.toNumber()).toBe(0);
    expect(result.educationCredit.toNumber()).toBe(0);
    expect(result.volunteerCredit.toNumber()).toBe(500);
    expect(result.totalCredit.toNumber()).toBe(500);
  });

  it("Schedule ICR education credit - boundary expense of $251", () => {
    const result = calculateScheduleICR(makeInput({
      k12EducationExpenses: d(251),
    }));
    // (251 - 250) × 25% = 0.25 → rounds to 0
    expect(result.educationCredit.toNumber()).toBe(0);
  });

  it("Schedule ICR education credit - exact $750 boundary", () => {
    // Need expenses such that (exp - 250) × 0.25 = 750 → exp = 3250
    const result = calculateScheduleICR(makeInput({
      k12EducationExpenses: d(3250),
    }));
    expect(result.educationCredit.toNumber()).toBe(750);
  });

  // ==================== Section C: Volunteer Emergency Worker Credit ====================

  it("Schedule ICR volunteer emergency worker credit - $500 for one person", () => {
    const result = calculateScheduleICR(makeInput({
      volunteerEmergencyWorkerCount: 1,
      volunteerEmergencyWorkerCertificateNumbers: ["VEW-1001"],
    }));
    expect(result.volunteerCredit.toNumber()).toBe(500);
  });

  it("Schedule ICR volunteer emergency worker credit - $1,000 for two persons (MFJ)", () => {
    const result = calculateScheduleICR(makeInput({
      filingStatus: "married_filing_jointly",
      volunteerEmergencyWorkerCount: 2,
      volunteerEmergencyWorkerCertificateNumbers: ["VEW-2001", "VEW-2002"],
    }));
    expect(result.volunteerCredit.toNumber()).toBe(1000);
  });

  it("Schedule ICR volunteer credit capped at remaining tax", () => {
    const result = calculateScheduleICR(makeInput({
      incomeTax: d(300),
      volunteerEmergencyWorkerCount: 1,
      volunteerEmergencyWorkerCertificateNumbers: ["VEW-1001"],
    }));
    // Remaining 300, volunteer $500 → capped at 300
    expect(result.volunteerCredit.toNumber()).toBe(300);
  });

  it("Schedule ICR volunteer credit - no AGI limitation", () => {
    const result = calculateScheduleICR(makeInput({
      federalAGI: d(1000000),
      volunteerEmergencyWorkerCount: 1,
      volunteerEmergencyWorkerCertificateNumbers: ["VEW-1001"],
    }));
    // High AGI doesn't deny volunteer credit (unlike property/education)
    expect(result.volunteerCredit.toNumber()).toBe(500);
  });

  it("Schedule ICR Line 10 - volunteer credit requires certificate numbers for each claimed person", () => {
    expect(() => calculateScheduleICR(makeInput({
      volunteerEmergencyWorkerCount: 1,
    }))).toThrow("Schedule ICR volunteer emergency worker certificate count must match the claimed volunteer emergency worker count");
  });

  it("Schedule ICR Line 10 - single filers cannot claim two volunteer emergency workers", () => {
    expect(() => calculateScheduleICR(makeInput({
      volunteerEmergencyWorkerCount: 2,
      volunteerEmergencyWorkerCertificateNumbers: ["VEW-1001", "VEW-1002"],
    }))).toThrow("Schedule ICR volunteer emergency worker count cannot exceed 1 unless filing jointly");
  });

  // ==================== Line 13: Total ====================

  it("Schedule ICR Line 13 - total credits", () => {
    const result = calculateScheduleICR(makeInput({
      incomeTax: d(5000),
      propertyTaxPaid: d(6000),
      k12EducationExpenses: d(2000),
      volunteerEmergencyWorkerCount: 1,
      volunteerEmergencyWorkerCertificateNumbers: ["VEW-1001"],
    }));
    // Property: 6000 × 5% = 300
    // Education: (2000 - 250) × 25% = 437.50 → 438
    // Volunteer: 500
    // Total: 300 + 438 + 500 = 1238
    expect(result.propertyTaxCredit.toNumber()).toBe(300);
    expect(result.educationCredit.toNumber()).toBe(438);
    expect(result.volunteerCredit.toNumber()).toBe(500);
    expect(result.totalCredit.toNumber()).toBe(1238);
  });

  it("Schedule ICR - credits applied in order, each limited to remaining tax", () => {
    // Tax = 600, property = 300, education = 250, volunteer = 500
    // Property: min(300, 600) = 300, remaining = 300
    // Education: min(250, 300) = 250, remaining = 50
    // Volunteer: min(500, 50) = 50
    // Total = 300 + 250 + 50 = 600
    const result = calculateScheduleICR(makeInput({
      incomeTax: d(600),
      propertyTaxPaid: d(6000),        // → 300 credit
      k12EducationExpenses: d(1250),    // → 250 credit
      volunteerEmergencyWorkerCount: 1, // → 500, but capped
      volunteerEmergencyWorkerCertificateNumbers: ["VEW-1001"],
    }));
    expect(result.propertyTaxCredit.toNumber()).toBe(300);
    expect(result.educationCredit.toNumber()).toBe(250);
    expect(result.volunteerCredit.toNumber()).toBe(50);
    expect(result.totalCredit.toNumber()).toBe(600);
  });

  it("Schedule ICR - all credits zero when no inputs", () => {
    const result = calculateScheduleICR(makeInput());
    expect(result.propertyTaxCredit.toNumber()).toBe(0);
    expect(result.educationCredit.toNumber()).toBe(0);
    expect(result.volunteerCredit.toNumber()).toBe(0);
    expect(result.totalCredit.toNumber()).toBe(0);
  });

  it("Schedule ICR - audit trail contains all lines", () => {
    const result = calculateScheduleICR(makeInput({
      propertyTaxPaid: d(5000),
      k12EducationExpenses: d(1000),
      volunteerEmergencyWorkerCount: 1,
      volunteerEmergencyWorkerCertificateNumbers: ["VEW-1001"],
    }));
    const lineNumbers = result.lines.map(l => l.line);
    expect(lineNumbers).toContain("1");
    expect(lineNumbers).toContain("3");
    expect(lineNumbers).toContain("5");
    expect(lineNumbers).toContain("8");
    expect(lineNumbers).toContain("11");
    expect(lineNumbers).toContain("13");
  });
});
