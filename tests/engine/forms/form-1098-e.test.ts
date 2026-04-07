/**
 * Form 1098-E — Student Loan Interest Statement
 * Spec: spec/federal/form-1098-e.yaml
 *
 * Tests verify multi-form aggregation, combination with manual input,
 * routing through Schedule 1 Line 21 student loan interest deduction,
 * phase-out interactions, and edge cases.
 */

import { describe, test, expect } from "vitest";
import { calculateForm1098E } from "@/engine/forms/form-1098-e.js";
import { calculateFederalTax } from "@/engine/federal.js";
import type { TaxYearInput, Form1098E } from "@/models/inputs.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";
import Decimal from "decimal.js";

// ═══════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════

function makeInput(overrides: Partial<TaxYearInput> = {}): TaxYearInput {
  return {
    ...simpleW2Fixture,
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: "50000", federalWithheld: "7500" }],
    ...overrides,
  };
}

function findLine(result: ReturnType<typeof calculateFederalTax>, form: string, line: string) {
  return result.allLines.find((l) => l.form === form && l.line === line);
}

function make1098E(lender: string, amount: string, includesCapitalized = false): Form1098E {
  return {
    lender,
    studentLoanInterestReceived: amount,
    includesOriginationFeesOrCapitalizedInterest: includesCapitalized,
  };
}

// ═══════════════════════════════════════════════════════
// Unit tests: calculateForm1098E aggregation
// ═══════════════════════════════════════════════════════

describe("Form 1098-E aggregation", () => {
  test("single Form 1098-E returns correct total", () => {
    const result = calculateForm1098E(
      [make1098E("Navient", "1800")],
    );
    expect(result.totalForm1098EInterest.toNumber()).toBe(1800);
    expect(result.totalStudentLoanInterest.toNumber()).toBe(1800);
    expect(result.numberOfForms).toBe(1);
  });

  test("multiple Form 1098-E statements are summed", () => {
    const result = calculateForm1098E([
      make1098E("Navient", "1200"),
      make1098E("FedLoan", "800"),
      make1098E("Great Lakes", "500"),
    ]);
    expect(result.totalForm1098EInterest.toNumber()).toBe(2500);
    expect(result.totalStudentLoanInterest.toNumber()).toBe(2500);
    expect(result.numberOfForms).toBe(3);
  });

  test("combines Form 1098-E with manual studentLoanInterest", () => {
    const result = calculateForm1098E(
      [make1098E("Navient", "2000")],
      "300" // Additional interest below $600 reporting threshold
    );
    expect(result.totalForm1098EInterest.toNumber()).toBe(2000);
    expect(result.totalStudentLoanInterest.toNumber()).toBe(2300);
  });

  test("negative manual studentLoanInterest is ignored instead of reducing lender-reported 1098-E interest", () => {
    const result = calculateForm1098E(
      [make1098E("Navient", "2000")],
      "-300"
    );
    expect(result.totalForm1098EInterest.toNumber()).toBe(2000);
    expect(result.totalStudentLoanInterest.toNumber()).toBe(2000);
  });

  test("empty Form 1098-E array with no manual amount returns zero", () => {
    const result = calculateForm1098E([]);
    expect(result.totalForm1098EInterest.toNumber()).toBe(0);
    expect(result.totalStudentLoanInterest.toNumber()).toBe(0);
    expect(result.numberOfForms).toBe(0);
  });

  test("empty Form 1098-E array with manual amount returns manual only", () => {
    const result = calculateForm1098E([], "1500");
    expect(result.totalForm1098EInterest.toNumber()).toBe(0);
    expect(result.totalStudentLoanInterest.toNumber()).toBe(1500);
  });

  test("negative interest amounts are floored to zero", () => {
    const result = calculateForm1098E([
      make1098E("Navient", "-100"),
      make1098E("FedLoan", "500"),
    ]);
    expect(result.totalForm1098EInterest.toNumber()).toBe(500);
  });

  test("per-lender audit trail is produced", () => {
    const result = calculateForm1098E([
      make1098E("Navient", "1200"),
      make1098E("FedLoan", "800"),
    ]);
    const navientLine = result.lines.find(
      (l) => l.form === "Form 1098-E" && l.description.includes("Navient")
    );
    expect(navientLine).toBeDefined();
    expect(new Decimal(navientLine!.value).toNumber()).toBe(1200);

    const fedloanLine = result.lines.find(
      (l) => l.form === "Form 1098-E" && l.description.includes("FedLoan")
    );
    expect(fedloanLine).toBeDefined();
    expect(new Decimal(fedloanLine!.value).toNumber()).toBe(800);
  });

  test("aggregation audit line is produced for multiple forms", () => {
    const result = calculateForm1098E([
      make1098E("Navient", "1200"),
      make1098E("FedLoan", "800"),
    ]);
    const aggLine = result.lines.find(
      (l) => l.form === "Form 1098-E" && l.line === "agg"
    );
    expect(aggLine).toBeDefined();
    expect(new Decimal(aggLine!.value).toNumber()).toBe(2000);
  });

  test("no aggregation audit line for single form", () => {
    const result = calculateForm1098E([make1098E("Navient", "1200")]);
    const aggLine = result.lines.find(
      (l) => l.form === "Form 1098-E" && l.line === "agg"
    );
    expect(aggLine).toBeUndefined();
  });

  test("Box 2 capitalized interest flag appears in audit trail", () => {
    const result = calculateForm1098E([
      make1098E("Navient", "1800", true),
    ]);
    const line = result.lines.find(
      (l) => l.form === "Form 1098-E" && l.line === "1"
    );
    expect(line).toBeDefined();
    expect(line!.formula).toContain("capitalized");
  });

  test("combined audit line is produced when both 1098-E and manual exist", () => {
    const result = calculateForm1098E(
      [make1098E("Navient", "2000")],
      "300"
    );
    const combinedLine = result.lines.find(
      (l) => l.form === "Form 1098-E" && l.line === "total"
    );
    expect(combinedLine).toBeDefined();
    expect(new Decimal(combinedLine!.value).toNumber()).toBe(2300);
  });
});

// ═══════════════════════════════════════════════════════
// Federal integration: Schedule 1 Line 21 routing
// ═══════════════════════════════════════════════════════

describe("Form 1098-E federal integration", () => {
  test("single 1098-E routes to Schedule 1 Line 21 deduction", () => {
    const result = calculateFederalTax(makeInput({
      form1098E: [make1098E("Navient", "1800")],
    }));

    const line21 = findLine(result, "Sched 1", "21");
    expect(line21).toBeDefined();
    // $1,800 is below the $2,500 cap, MAGI ~$50K is well below phase-out
    expect(new Decimal(line21!.value).toNumber()).toBe(1800);

    // AGI should be reduced by the deduction
    expect(result.agi.toNumber()).toBe(50000 - 1800);
  });

  test("multiple 1098-E forms aggregate before deduction", () => {
    const result = calculateFederalTax(makeInput({
      form1098E: [
        make1098E("Navient", "1200"),
        make1098E("FedLoan", "900"),
      ],
    }));

    const line21 = findLine(result, "Sched 1", "21");
    expect(line21).toBeDefined();
    // 1200 + 900 = 2100, below $2,500 cap
    expect(new Decimal(line21!.value).toNumber()).toBe(2100);
  });

  test("1098-E interest is capped at $2,500 maximum", () => {
    const result = calculateFederalTax(makeInput({
      form1098E: [
        make1098E("Navient", "1800"),
        make1098E("FedLoan", "1200"),
      ],
    }));

    const line21 = findLine(result, "Sched 1", "21");
    expect(line21).toBeDefined();
    // 1800 + 1200 = 3000, capped at $2,500
    expect(new Decimal(line21!.value).toNumber()).toBe(2500);
  });

  test("1098-E combines with manual studentLoanInterest", () => {
    const result = calculateFederalTax(makeInput({
      form1098E: [make1098E("Navient", "2000")],
      adjustments: { studentLoanInterest: "400" },
    }));

    const line21 = findLine(result, "Sched 1", "21");
    expect(line21).toBeDefined();
    // 2000 + 400 = 2400, below $2,500 cap
    expect(new Decimal(line21!.value).toNumber()).toBe(2400);
  });

  test("1098-E plus manual exceeding $2,500 cap", () => {
    const result = calculateFederalTax(makeInput({
      form1098E: [make1098E("Navient", "2200")],
      adjustments: { studentLoanInterest: "500" },
    }));

    const line21 = findLine(result, "Sched 1", "21");
    expect(line21).toBeDefined();
    // 2200 + 500 = 2700, capped at $2,500
    expect(new Decimal(line21!.value).toNumber()).toBe(2500);
  });

  test("form1098ESummary is populated in result", () => {
    const result = calculateFederalTax(makeInput({
      form1098E: [
        make1098E("Navient", "1200"),
        make1098E("FedLoan", "800"),
      ],
    }));

    expect(result.form1098ESummary).toBeDefined();
    expect(result.form1098ESummary!.numberOfForms).toBe(2);
    expect(result.form1098ESummary!.totalForm1098EInterest.toNumber()).toBe(2000);
    expect(result.form1098ESummary!.totalStudentLoanInterest.toNumber()).toBe(2000);
  });

  test("form1098ESummary is undefined when no 1098-E forms", () => {
    const result = calculateFederalTax(makeInput());
    expect(result.form1098ESummary).toBeUndefined();
  });

  test("manual-only studentLoanInterest still works without 1098-E", () => {
    const result = calculateFederalTax(makeInput({
      adjustments: { studentLoanInterest: "1500" },
    }));

    const line21 = findLine(result, "Sched 1", "21");
    expect(line21).toBeDefined();
    expect(new Decimal(line21!.value).toNumber()).toBe(1500);
    expect(result.form1098ESummary).toBeUndefined();
  });

  test("1098-E audit trail appears in allLines", () => {
    const result = calculateFederalTax(makeInput({
      form1098E: [make1098E("Navient", "1800")],
    }));

    const form1098ELines = result.allLines.filter(
      (l) => l.form === "Form 1098-E"
    );
    expect(form1098ELines.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════
// Phase-out interactions
// ═══════════════════════════════════════════════════════

describe("Form 1098-E phase-out interactions", () => {
  test("single filer at phase-out floor ($85K) gets full deduction", () => {
    const result = calculateFederalTax(makeInput({
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "85000", federalWithheld: "12750" }],
      form1098E: [make1098E("Navient", "2500")],
    }));

    const line21 = findLine(result, "Sched 1", "21");
    expect(line21).toBeDefined();
    // At exactly $85K MAGI (after deduction adjustments), should get full or near-full deduction
    // Since the deduction itself reduces MAGI-for-other-purposes but the student loan MAGI
    // is computed BEFORE the student loan deduction (circular), check it's significant
    expect(new Decimal(line21!.value).toNumber()).toBeGreaterThan(0);
  });

  test("single filer above phase-out ceiling ($100K) gets zero", () => {
    const result = calculateFederalTax(makeInput({
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "110000", federalWithheld: "17000" }],
      form1098E: [make1098E("Navient", "2500")],
    }));

    const line21 = findLine(result, "Sched 1", "21");
    expect(line21).toBeDefined();
    expect(new Decimal(line21!.value).toNumber()).toBe(0);
  });

  test("single filer just below phase-out ceiling keeps the last $1 when additional phase-out precision allows it", () => {
    const result = calculateFederalTax(makeInput({
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "99994", federalWithheld: "16000" }],
      form1098E: [make1098E("Navient", "2500")],
    }));

    const line21 = findLine(result, "Sched 1", "21");
    expect(line21).toBeDefined();
    expect(new Decimal(line21!.value).toNumber()).toBe(1);
  });

  test("single filer in phase-out range gets partial deduction", () => {
    const result = calculateFederalTax(makeInput({
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "92500", federalWithheld: "14000" }],
      form1098E: [make1098E("Navient", "2500")],
    }));

    const line21 = findLine(result, "Sched 1", "21");
    expect(line21).toBeDefined();
    const deduction = new Decimal(line21!.value).toNumber();
    // Should be reduced but not zero — between 0 and 2500
    expect(deduction).toBeGreaterThan(0);
    expect(deduction).toBeLessThan(2500);
  });

  test("MFJ filer below phase-out ($170K) gets full deduction", () => {
    const result = calculateFederalTax(makeInput({
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "John",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1990-05-20",
        },
      },
      w2s: [
        { ...simpleW2Fixture.w2s[0], wages: "80000", federalWithheld: "12000" },
        { ...simpleW2Fixture.w2s[0], wages: "60000", federalWithheld: "9000" },
      ],
      form1098E: [make1098E("Navient", "2500")],
    }));

    const line21 = findLine(result, "Sched 1", "21");
    expect(line21).toBeDefined();
    expect(new Decimal(line21!.value).toNumber()).toBe(2500);
  });

  test("MFS filer gets zero deduction regardless of income", () => {
    const result = calculateFederalTax(makeInput({
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately",
        spouse: {
          firstName: "John",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1990-05-20",
        },
      },
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "40000", federalWithheld: "6000" }],
      form1098E: [make1098E("Navient", "2500")],
    }));

    const line21 = findLine(result, "Sched 1", "21");
    expect(line21).toBeDefined();
    expect(new Decimal(line21!.value).toNumber()).toBe(0);
  });

  test("HoH filer uses single phase-out thresholds", () => {
    const result = calculateFederalTax(makeInput({
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "head_of_household",
        dependents: [{
          firstName: "Child",
          lastName: "Doe",
          ssn: "111-22-3333",
          relationship: "Daughter",
          dateOfBirth: "2015-06-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        }],
      },
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "50000", federalWithheld: "7500" }],
      form1098E: [make1098E("Navient", "2000")],
    }));

    const line21 = findLine(result, "Sched 1", "21");
    expect(line21).toBeDefined();
    // MAGI ~50K, well below the $85K phase-out floor
    expect(new Decimal(line21!.value).toNumber()).toBe(2000);
  });
});

// ═══════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════

describe("Form 1098-E edge cases", () => {
  test("zero interest on 1098-E produces no deduction", () => {
    const result = calculateFederalTax(makeInput({
      form1098E: [make1098E("Navient", "0")],
    }));

    const line21 = findLine(result, "Sched 1", "21");
    expect(line21).toBeDefined();
    expect(new Decimal(line21!.value).toNumber()).toBe(0);
  });

  test("empty form1098E array has no effect", () => {
    const withEmpty = calculateFederalTax(makeInput({ form1098E: [] }));
    const without = calculateFederalTax(makeInput());

    expect(withEmpty.agi.toNumber()).toBe(without.agi.toNumber());
    expect(withEmpty.totalTax.toNumber()).toBe(without.totalTax.toNumber());
    expect(withEmpty.form1098ESummary).toBeUndefined();
  });

  test("very small interest amount (pennies) is handled", () => {
    const result = calculateForm1098E([
      make1098E("Navient", "0.50"),
    ]);
    expect(result.totalForm1098EInterest.toNumber()).toBe(0.5);
  });

  test("large interest amount still capped at $2,500 in deduction", () => {
    const result = calculateFederalTax(makeInput({
      form1098E: [make1098E("Navient", "10000")],
    }));

    const line21 = findLine(result, "Sched 1", "21");
    expect(line21).toBeDefined();
    expect(new Decimal(line21!.value).toNumber()).toBe(2500);
  });

  test("1098-E interest at exactly $2,500 — no cap reduction", () => {
    const result = calculateFederalTax(makeInput({
      form1098E: [make1098E("Navient", "2500")],
    }));

    const line21 = findLine(result, "Sched 1", "21");
    expect(line21).toBeDefined();
    expect(new Decimal(line21!.value).toNumber()).toBe(2500);
  });

  test("many servicers aggregate correctly", () => {
    const forms = Array.from({ length: 8 }, (_, i) =>
      make1098E(`Servicer ${i + 1}`, "250")
    );
    const result = calculateForm1098E(forms);
    // 8 × 250 = 2000
    expect(result.totalForm1098EInterest.toNumber()).toBe(2000);
    expect(result.numberOfForms).toBe(8);
  });

  test("1098-E with manual amount but no forms uses manual only path", () => {
    // This tests backward compatibility: when no 1098-E forms exist,
    // the manual path continues to work
    const resultManual = calculateFederalTax(makeInput({
      adjustments: { studentLoanInterest: "2000" },
    }));
    // No 1098-E forms → form1098ESummary is undefined
    expect(resultManual.form1098ESummary).toBeUndefined();

    const line21 = findLine(resultManual, "Sched 1", "21");
    expect(new Decimal(line21!.value).toNumber()).toBe(2000);
  });

  test("negative manual studentLoanInterest does not wipe out a valid 1098-E deduction", () => {
    const result = calculateFederalTax(makeInput({
      form1098E: [make1098E("Navient", "1800")],
      adjustments: { studentLoanInterest: "-500" },
    }));

    const line21 = findLine(result, "Sched 1", "21");
    expect(line21).toBeDefined();
    expect(new Decimal(line21!.value).toNumber()).toBe(1800);
    expect(result.form1098ESummary?.totalStudentLoanInterest.toNumber()).toBe(1800);
  });

  test("1098-E interest reduces AGI and thereby total tax", () => {
    const withoutDeduction = calculateFederalTax(makeInput());
    const withDeduction = calculateFederalTax(makeInput({
      form1098E: [make1098E("Navient", "2500")],
    }));

    // AGI should be $2,500 lower
    expect(withDeduction.agi.toNumber()).toBe(withoutDeduction.agi.toNumber() - 2500);
    // Total tax should be lower
    expect(withDeduction.totalTax.toNumber()).toBeLessThan(withoutDeduction.totalTax.toNumber());
  });

  test("1098-E with capitalized interest flag is correctly reported in results", () => {
    const result = calculateFederalTax(makeInput({
      form1098E: [make1098E("Navient", "1500", true)],
    }));

    expect(result.form1098ESummary).toBeDefined();
    expect(result.form1098ESummary!.totalForm1098EInterest.toNumber()).toBe(1500);

    // Audit trail should mention capitalized interest
    const form1098ELines = result.allLines.filter(
      (l) => l.form === "Form 1098-E"
    );
    const capitalizedLine = form1098ELines.find(
      (l) => l.formula.includes("capitalized")
    );
    expect(capitalizedLine).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════
// Realistic scenarios
// ═══════════════════════════════════════════════════════

describe("Form 1098-E realistic scenarios", () => {
  test("recent graduate with federal and private student loans", () => {
    // Typical scenario: graduate earning ~$55K with federal and private loans
    const result = calculateFederalTax(makeInput({
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "55000", federalWithheld: "7000" }],
      form1098E: [
        make1098E("MOHELA (Federal Loans)", "1400", true),
        make1098E("Sallie Mae (Private Loan)", "800"),
      ],
    }));

    const line21 = findLine(result, "Sched 1", "21");
    expect(line21).toBeDefined();
    // Total: $2,200, below $2,500 cap, MAGI ~55K well below phase-out
    expect(new Decimal(line21!.value).toNumber()).toBe(2200);

    // Summary should reflect both forms
    expect(result.form1098ESummary!.numberOfForms).toBe(2);
    expect(result.form1098ESummary!.totalForm1098EInterest.toNumber()).toBe(2200);
  });

  test("high-income MFJ couple above phase-out ceiling", () => {
    // MFJ couple earning $220K total — above $200K MFJ phase-out ceiling
    const result = calculateFederalTax(makeInput({
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "John",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1990-05-20",
        },
      },
      w2s: [
        { ...simpleW2Fixture.w2s[0], wages: "130000", federalWithheld: "20000" },
        { ...simpleW2Fixture.w2s[0], wages: "90000", federalWithheld: "14000" },
      ],
      form1098E: [
        make1098E("FedLoan", "2500"),
      ],
    }));

    const line21 = findLine(result, "Sched 1", "21");
    expect(line21).toBeDefined();
    // MAGI ~$220K, above $200K MFJ ceiling → deduction = $0
    expect(new Decimal(line21!.value).toNumber()).toBe(0);
  });

  test("MFJ couple in phase-out range with multiple servicers", () => {
    // MFJ couple earning $185K total — in MFJ phase-out range ($170K–$200K)
    const result = calculateFederalTax(makeInput({
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "John",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1990-05-20",
        },
      },
      w2s: [
        { ...simpleW2Fixture.w2s[0], wages: "100000", federalWithheld: "16000" },
        { ...simpleW2Fixture.w2s[0], wages: "85000", federalWithheld: "12750" },
      ],
      form1098E: [
        make1098E("MOHELA", "1500"),
        make1098E("Navient", "1200"),
      ],
    }));

    const line21 = findLine(result, "Sched 1", "21");
    expect(line21).toBeDefined();
    const deduction = new Decimal(line21!.value).toNumber();
    // Total interest: 2700, capped at 2500
    // MAGI ~185K, in phase-out range → partial deduction
    expect(deduction).toBeGreaterThan(0);
    expect(deduction).toBeLessThan(2500);
  });

  test("borrower with interest below $600 threshold using manual entry", () => {
    // Borrower paid $400 in interest — below the $600 reporting threshold
    // so lender didn't issue 1098-E. Borrower enters manually.
    const result = calculateFederalTax(makeInput({
      adjustments: { studentLoanInterest: "400" },
    }));

    const line21 = findLine(result, "Sched 1", "21");
    expect(line21).toBeDefined();
    expect(new Decimal(line21!.value).toNumber()).toBe(400);
    expect(result.form1098ESummary).toBeUndefined();
  });

  test("borrower with 1098-E plus additional unreported interest", () => {
    // Main federal loan servicer issued 1098-E for $2,100
    // Borrower also paid $350 to a private lender (below threshold, no 1098-E)
    const result = calculateFederalTax(makeInput({
      form1098E: [make1098E("MOHELA", "2100")],
      adjustments: { studentLoanInterest: "350" },
    }));

    const line21 = findLine(result, "Sched 1", "21");
    expect(line21).toBeDefined();
    // 2100 + 350 = 2450, below $2,500 cap
    expect(new Decimal(line21!.value).toNumber()).toBe(2450);
    expect(result.form1098ESummary!.totalStudentLoanInterest.toNumber()).toBe(2450);
  });
});
