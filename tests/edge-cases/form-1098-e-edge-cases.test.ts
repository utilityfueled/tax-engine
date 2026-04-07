/**
 * Edge case tests for Form 1098-E — Student Loan Interest Deduction boundaries.
 * Spec: spec/federal/form-1098-e.yaml
 *
 * Key constants (2025):
 *   Maximum deduction: $2,500 (IRC section 221(b)(1))
 *   Single/HoH/QSS phase-out: $85,000-$100,000 MAGI
 *   MFJ phase-out: $170,000-$200,000 MAGI
 *   MFS: disqualified entirely (IRC section 221(e)(2))
 *
 * Phase-out formula:
 *   ratio = (MAGI - phaseOutStart) / (phaseOutEnd - phaseOutStart)
 *   deduction = roundDollar(cappedInterest - cappedInterest * ratio)
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm1098E } from "@/engine/forms/form-1098-e.js";
import type { TaxYearInput, Form1098E } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const d = (v: string | number) => new Decimal(v);

function make1098E(lender: string, amount: string): Form1098E {
  return { lender, studentLoanInterestReceived: amount, includesOriginationFeesOrCapitalizedInterest: false };
}

function makeSingleInput(wages: string, interest: string): TaxYearInput {
  return {
    ...simpleW2Fixture,
    w2s: [{
      ...simpleW2Fixture.w2s[0],
      wages,
      socialSecurityWages: wages,
      medicareWages: wages,
      federalWithheld: String(Math.round(Number(wages) * 0.15)),
      socialSecurityWithheld: String(Math.round(Number(wages) * 0.062)),
      medicareWithheld: String(new Decimal(wages).times("0.0145").toFixed(2)),
    }],
    form1098E: [make1098E("Lender", interest)],
  };
}

function makeMFJInput(totalWages: string, interest: string): TaxYearInput {
  return {
    ...simpleW2Fixture,
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
    w2s: [{
      ...simpleW2Fixture.w2s[0],
      wages: totalWages,
      socialSecurityWages: totalWages,
      medicareWages: totalWages,
      federalWithheld: String(Math.round(Number(totalWages) * 0.15)),
      socialSecurityWithheld: String(Math.round(Number(totalWages) * 0.062)),
      medicareWithheld: String(new Decimal(totalWages).times("0.0145").toFixed(2)),
    }],
    form1098E: [make1098E("Lender", interest)],
  };
}

function findLine(result: ReturnType<typeof calculateFederalTax>, form: string, line: string) {
  return result.allLines.find((l) => l.form === form && l.line === line);
}

function getDeduction(result: ReturnType<typeof calculateFederalTax>): number {
  const line21 = findLine(result, "Sched 1", "21");
  return new Decimal(line21!.value).toNumber();
}

// ═══════════════════════════════════════════════════════
// Single filer phase-out boundary tests
// ═══════════════════════════════════════════════════════

describe("Form 1098-E single filer phase-out boundaries", () => {
  it("Schedule 1 Line 21 - full $2,500 deduction at MAGI exactly $85,000 (phase-out start)", () => {
    const result = calculateFederalTax(makeSingleInput("85000", "2500"));
    expect(getDeduction(result)).toBe(2500);
  });

  it("Schedule 1 Line 21 - phase-out begins at MAGI $85,001 (one dollar above start)", () => {
    const result = calculateFederalTax(makeSingleInput("85001", "2500"));
    const deduction = getDeduction(result);
    // ratio = 1/15000, reduction = 2500 * (1/15000) ≈ 0.17 → deduction ≈ 2500
    // roundDollar(2500 - 2500 * 1/15000) = roundDollar(2499.833...) = 2500
    expect(deduction).toBe(2500);
  });

  it("Schedule 1 Line 21 - partial deduction at MAGI $92,500 (midpoint of phase-out)", () => {
    const result = calculateFederalTax(makeSingleInput("92500", "2500"));
    const deduction = getDeduction(result);
    // ratio = 7500/15000 = 0.5, deduction = round(2500 - 2500 * 0.5) = 1250
    expect(deduction).toBe(1250);
  });

  it("Schedule 1 Line 21 - small deduction near phase-out ceiling at MAGI $99,000", () => {
    const result = calculateFederalTax(makeSingleInput("99000", "2500"));
    const deduction = getDeduction(result);
    // ratio = 14000/15000 = 0.9333..., reduction = 2333.33 → deduction ≈ 167
    expect(deduction).toBe(167);
  });

  it("Schedule 1 Line 21 - zero deduction at MAGI exactly $100,000 (phase-out ceiling)", () => {
    const result = calculateFederalTax(makeSingleInput("100000", "2500"));
    expect(getDeduction(result)).toBe(0);
  });

  it("Schedule 1 Line 21 - zero deduction at MAGI $100,001 (one dollar above ceiling)", () => {
    const result = calculateFederalTax(makeSingleInput("100001", "2500"));
    expect(getDeduction(result)).toBe(0);
  });

  it("Schedule 1 Line 21 - zero deduction at MAGI well above ceiling ($150,000)", () => {
    const result = calculateFederalTax(makeSingleInput("150000", "2500"));
    expect(getDeduction(result)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════
// MFJ phase-out boundary tests
// ═══════════════════════════════════════════════════════

describe("Form 1098-E MFJ phase-out boundaries", () => {
  it("Schedule 1 Line 21 - full $2,500 deduction at MFJ MAGI exactly $170,000 (phase-out start)", () => {
    const result = calculateFederalTax(makeMFJInput("170000", "2500"));
    expect(getDeduction(result)).toBe(2500);
  });

  it("Schedule 1 Line 21 - partial deduction at MFJ MAGI $185,000 (midpoint)", () => {
    const result = calculateFederalTax(makeMFJInput("185000", "2500"));
    const deduction = getDeduction(result);
    // ratio = 15000/30000 = 0.5, deduction = round(2500 - 1250) = 1250
    expect(deduction).toBe(1250);
  });

  it("Schedule 1 Line 21 - zero deduction at MFJ MAGI exactly $200,000 (phase-out ceiling)", () => {
    const result = calculateFederalTax(makeMFJInput("200000", "2500"));
    expect(getDeduction(result)).toBe(0);
  });

  it("Schedule 1 Line 21 - zero deduction at MFJ MAGI $200,001 (one dollar above ceiling)", () => {
    const result = calculateFederalTax(makeMFJInput("200001", "2500"));
    expect(getDeduction(result)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════
// QSS uses single thresholds, not MFJ
// ═══════════════════════════════════════════════════════

describe("Form 1098-E qualifying surviving spouse phase-out", () => {
  it("Schedule 1 Line 21 - QSS uses $85,000-$100,000 range, not MFJ range", () => {
    // A QSS filer at $92,500 MAGI should get 50% reduction (like single),
    // not full deduction (which would happen under MFJ thresholds)
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "qualifying_surviving_spouse",
        spouse: {
          firstName: "Deceased",
          lastName: "Spouse",
          ssn: "987-65-4321",
          dateOfBirth: "1985-03-10",
          dateOfDeath: "2024-06-15",
        },
        dependents: [{
          firstName: "Child",
          lastName: "Doe",
          ssn: "111-22-3333",
          relationship: "Son",
          dateOfBirth: "2015-06-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        }],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "92500",
        socialSecurityWages: "92500",
        medicareWages: "92500",
        federalWithheld: "13875",
        socialSecurityWithheld: "5735",
        medicareWithheld: "1341.25",
      }],
      form1098E: [make1098E("Lender", "2500")],
    };

    const result = calculateFederalTax(input);
    const deduction = getDeduction(result);
    // QSS at $92,500: ratio = 7500/15000 = 0.5 → deduction = 1250
    expect(deduction).toBe(1250);
  });

  it("Schedule 1 Line 21 - QSS gets zero deduction at $100,000 (same ceiling as single)", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "qualifying_surviving_spouse",
        spouse: {
          firstName: "Deceased",
          lastName: "Spouse",
          ssn: "987-65-4321",
          dateOfBirth: "1985-03-10",
          dateOfDeath: "2024-06-15",
        },
        dependents: [{
          firstName: "Child",
          lastName: "Doe",
          ssn: "111-22-3333",
          relationship: "Son",
          dateOfBirth: "2015-06-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        }],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "100000",
        socialSecurityWages: "100000",
        medicareWages: "100000",
        federalWithheld: "15000",
        socialSecurityWithheld: "6200",
        medicareWithheld: "1450",
      }],
      form1098E: [make1098E("Lender", "2500")],
    };

    const result = calculateFederalTax(input);
    expect(getDeduction(result)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════
// $2,500 cap boundary tests
// ═══════════════════════════════════════════════════════

describe("Form 1098-E $2,500 annual cap boundaries", () => {
  it("Schedule 1 Line 21 - interest at $2,499 is not capped", () => {
    const result = calculateFederalTax(makeSingleInput("50000", "2499"));
    expect(getDeduction(result)).toBe(2499);
  });

  it("Schedule 1 Line 21 - interest at exactly $2,500 equals cap", () => {
    const result = calculateFederalTax(makeSingleInput("50000", "2500"));
    expect(getDeduction(result)).toBe(2500);
  });

  it("Schedule 1 Line 21 - interest at $2,501 is capped at $2,500", () => {
    const result = calculateFederalTax(makeSingleInput("50000", "2501"));
    expect(getDeduction(result)).toBe(2500);
  });

  it("Schedule 1 Line 21 - cap applies before phase-out reduction", () => {
    // With $5,000 interest at midpoint of phase-out: cap first to $2,500, then 50% = $1,250
    const result = calculateFederalTax(makeSingleInput("92500", "5000"));
    expect(getDeduction(result)).toBe(1250);
  });

  it("Schedule 1 Line 21 - combined 1098-E + manual exactly at cap", () => {
    const input: TaxYearInput = {
      ...makeSingleInput("50000", "0"),
      form1098E: [make1098E("Lender A", "1500"), make1098E("Lender B", "700")],
      adjustments: { studentLoanInterest: "300" },
    };
    const result = calculateFederalTax(input);
    // 1500 + 700 + 300 = 2500, exactly at cap
    expect(getDeduction(result)).toBe(2500);
  });
});

// ═══════════════════════════════════════════════════════
// MFS disqualification
// ═══════════════════════════════════════════════════════

describe("Form 1098-E MFS disqualification", () => {
  it("Schedule 1 Line 21 - MFS gets zero deduction even at very low income", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
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
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "20000",
        socialSecurityWages: "20000",
        medicareWages: "20000",
        federalWithheld: "3000",
        socialSecurityWithheld: "1240",
        medicareWithheld: "290",
      }],
      form1098E: [make1098E("Lender", "2500")],
    };

    const result = calculateFederalTax(input);
    expect(getDeduction(result)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════
// Aggregation edge cases
// ═══════════════════════════════════════════════════════

describe("Form 1098-E aggregation edge cases", () => {
  it("Form 1098-E agg - single penny of interest produces correct total", () => {
    const result = calculateForm1098E([make1098E("Lender", "0.01")]);
    expect(result.totalStudentLoanInterest.toNumber()).toBe(0.01);
  });

  it("Form 1098-E agg - ten servicers aggregate correctly", () => {
    const forms = Array.from({ length: 10 }, (_, i) =>
      make1098E(`Servicer ${i}`, "250")
    );
    const result = calculateForm1098E(forms);
    expect(result.totalForm1098EInterest.toNumber()).toBe(2500);
    expect(result.numberOfForms).toBe(10);
  });

  it("Form 1098-E agg - all-zero forms produce zero total", () => {
    const result = calculateForm1098E([
      make1098E("A", "0"),
      make1098E("B", "0"),
    ]);
    expect(result.totalStudentLoanInterest.toNumber()).toBe(0);
  });
});
