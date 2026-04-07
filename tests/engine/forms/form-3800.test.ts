/**
 * Form 3800 — General Business Credit
 * Spec: spec/federal/form-3800.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm3800 } from "@/engine/forms/form-3800.js";
import type { Form3800Input } from "@/engine/forms/form-3800.js";
import type { ScheduleK1 } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

/** Minimal K-1 with only the fields needed for Box 15 credits */
function makeK1(overrides: Partial<ScheduleK1> = {}): ScheduleK1 {
  return {
    partnershipName: "Test Partnership",
    partnershipEIN: "12-3456789",
    ordinaryIncome: "0",
    netRentalIncome: "0",
    otherNetRentalIncome: "0",
    guaranteedPayments: "0",
    interestIncome: "0",
    ordinaryDividends: "0",
    qualifiedDividends: "0",
    royalties: "0",
    netShortTermCapitalGain: "0",
    netLongTermCapitalGain: "0",
    unrecapturedSection1250Gain: "0",
    collectiblesGain: "0",
    section1231Gain: "0",
    otherIncome: "0",
    section179Deduction: "0",
    otherDeductions: "0",
    charitableCash: "0",
    charitableCapitalGain30: "0",
    charitableCapitalGain20: "0",
    excessBusinessInterest: "0",
    selfEmploymentEarnings: "0",
    foreignTaxPaid: "0",
    amtDepreciationAdjustment: "0",
    amtAdjustedGainOrLoss: "0",
    amtDepletion: "0",
    amtOtherItems: "0",
    taxExemptInterest: "0",
    otherTaxExemptIncome: "0",
    nondeductibleExpenses: "0",
    distributions: "0",
    section199AQBI: "0",
    section199AW2Wages: "0",
    section199AUBIA: "0",
    section199AIsSST: false,
    section199AQualifiedReitDividends: "0",
    section199AQualifiedPTPIncome: "0",
    section199APTPW2Wages: "0",
    section199APTPUBIA: "0",
    section199APTPIsSST: false,
    lowIncomeHousingCredit42j5: "0",
    lowIncomeHousingCreditOther: "0",
    qualifiedRehabilitationExpenditures: "0",
    otherRentalRealEstateCredits: "0",
    otherRentalCredits: "0",
    otherCredits: "0",
    isPassiveActivity: false,
    isForeignPartnership: false,
    ...overrides,
  } as ScheduleK1;
}

function makeInput(overrides: Partial<Form3800Input> = {}): Form3800Input {
  return {
    filingStatus: "single",
    scheduleK1s: [],
    regularTax: d(80000),
    amt: d(0),
    tentativeMinimumTax: d(0),
    childTaxCredit: d(0),
    otherNonrefundableCredits: d(0),
    ...overrides,
  };
}

describe("Form 3800", () => {
  // ── Part I: Current Year Credit ──────────────────────────

  describe("Part I — Credit Aggregation", () => {
    it("Part I Line 1 aggregates current year credits from K-1 Box 15", () => {
      const result = calculateForm3800(makeInput({
        scheduleK1s: [makeK1({ otherCredits: "5000" })],
      }));
      expect(result.currentYearCredit.toNumber()).toBe(5000);
    });

    it("Part I Line 1 sums K-1 and direct credit sources", () => {
      const result = calculateForm3800(makeInput({
        scheduleK1s: [makeK1({ otherCredits: "3000" })],
        currentYearCredits: d(2000),
      }));
      expect(result.currentYearCredit.toNumber()).toBe(5000);
    });

    it("Part I Line 2 adds passive activity credits", () => {
      const result = calculateForm3800(makeInput({
        passiveActivityCredits: d(1500),
      }));
      expect(result.passiveActivityCredits.toNumber()).toBe(1500);
    });

    it("Part I Line 3 includes prior year carryforward", () => {
      const result = calculateForm3800(makeInput({
        carryforward: d(4000),
      }));
      expect(result.carryforwardApplied.toNumber()).toBe(4000);
    });

    it("Part I Line 5 sums all credit sources", () => {
      const result = calculateForm3800(makeInput({
        scheduleK1s: [makeK1({ otherCredits: "3000" })],
        currentYearCredits: d(1000),
        passiveActivityCredits: d(500),
        carryforward: d(2000),
      }));
      // 3000 + 1000 (current) + 500 (passive) + 2000 (carryforward) = 6500
      expect(result.totalCredit.toNumber()).toBe(6500);
    });

    it("zero credits returns zero result", () => {
      const result = calculateForm3800(makeInput());
      expect(result.totalCredit.toNumber()).toBe(0);
      expect(result.allowableCredit.toNumber()).toBe(0);
      expect(result.carryforwardToNextYear.toNumber()).toBe(0);
    });
  });

  // ── K-1 Box 15 Credit Codes ──────────────────────────────

  describe("K-1 Box 15 Credits", () => {
    it("K-1 Box 15 Code A low-income housing credit §42(j)(5)", () => {
      const result = calculateForm3800(makeInput({
        scheduleK1s: [makeK1({ lowIncomeHousingCredit42j5: "8000" })],
      }));
      expect(result.k1LowIncomeHousing42j5.toNumber()).toBe(8000);
      expect(result.k1TotalCredits.toNumber()).toBe(8000);
    });

    it("K-1 Box 15 Code B low-income housing credit (other)", () => {
      const result = calculateForm3800(makeInput({
        scheduleK1s: [makeK1({ lowIncomeHousingCreditOther: "6000" })],
      }));
      expect(result.k1LowIncomeHousingOther.toNumber()).toBe(6000);
    });

    it("K-1 Box 15 Code C rehabilitation credit", () => {
      const result = calculateForm3800(makeInput({
        scheduleK1s: [makeK1({ qualifiedRehabilitationExpenditures: "10000" })],
      }));
      expect(result.k1RehabilitationCredit.toNumber()).toBe(10000);
    });

    it("K-1 Box 15 Code F other credits", () => {
      const result = calculateForm3800(makeInput({
        scheduleK1s: [makeK1({ otherCredits: "4500" })],
      }));
      expect(result.k1OtherCredits.toNumber()).toBe(4500);
    });

    it("multiple K-1 Box 15 credits are aggregated", () => {
      const result = calculateForm3800(makeInput({
        scheduleK1s: [
          makeK1({ partnershipName: "P1", otherCredits: "3000", lowIncomeHousingCredit42j5: "2000" }),
          makeK1({ partnershipName: "P2", otherCredits: "1500", qualifiedRehabilitationExpenditures: "500" }),
        ],
      }));
      expect(result.k1OtherCredits.toNumber()).toBe(4500); // 3000 + 1500
      expect(result.k1LowIncomeHousing42j5.toNumber()).toBe(2000);
      expect(result.k1RehabilitationCredit.toNumber()).toBe(500);
      expect(result.k1TotalCredits.toNumber()).toBe(7000); // 2000 + 3000 + 500 + 1500
    });

    it("all six Box 15 codes aggregate correctly", () => {
      const result = calculateForm3800(makeInput({
        scheduleK1s: [makeK1({
          lowIncomeHousingCredit42j5: "1000",
          lowIncomeHousingCreditOther: "2000",
          qualifiedRehabilitationExpenditures: "3000",
          otherRentalRealEstateCredits: "4000",
          otherRentalCredits: "5000",
          otherCredits: "6000",
        })],
      }));
      expect(result.k1TotalCredits.toNumber()).toBe(21000);
    });
  });

  // ── Part II: Allowable Credit ────────────────────────────

  describe("Part II — Credit Limitation", () => {
    it("Part II Line 14 totals personal credits", () => {
      const result = calculateForm3800(makeInput({
        childTaxCredit: d(4000),
        otherNonrefundableCredits: d(2000),
        scheduleK1s: [makeK1({ otherCredits: "1000" })],
      }));
      expect(result.personalCredits.toNumber()).toBe(6000);
    });

    it("Part II Line 15 net regular tax equals regular tax minus personal credits", () => {
      const result = calculateForm3800(makeInput({
        regularTax: d(50000),
        childTaxCredit: d(4000),
        otherNonrefundableCredits: d(1000),
        scheduleK1s: [makeK1({ otherCredits: "1000" })],
      }));
      // 50000 - (4000 + 1000) = 45000
      expect(result.netRegularTax.toNumber()).toBe(45000);
    });

    it("Part II Line 15 net regular tax floors at zero", () => {
      const result = calculateForm3800(makeInput({
        regularTax: d(3000),
        childTaxCredit: d(4000),
        scheduleK1s: [makeK1({ otherCredits: "1000" })],
      }));
      expect(result.netRegularTax.toNumber()).toBe(0);
    });

    it("Part II Line 16 applies 25% of net regular tax over $25,000 for single", () => {
      const result = calculateForm3800(makeInput({
        regularTax: d(80000),
        scheduleK1s: [makeK1({ otherCredits: "1000" })],
      }));
      // Net regular tax = 80000, 25% of (80000 - 25000) = 13750
      expect(result.twentyFivePercentExcess.toNumber()).toBe(13750);
    });

    it("Part II Line 16 is zero when net regular tax is below threshold", () => {
      const result = calculateForm3800(makeInput({
        regularTax: d(20000),
        scheduleK1s: [makeK1({ otherCredits: "1000" })],
      }));
      expect(result.twentyFivePercentExcess.toNumber()).toBe(0);
    });

    it("MFS uses $12,500 threshold instead of $25,000", () => {
      const result = calculateForm3800(makeInput({
        filingStatus: "married_filing_separately",
        regularTax: d(40000),
        scheduleK1s: [makeK1({ otherCredits: "1000" })],
      }));
      // Net regular tax = 40000, 25% of (40000 - 12500) = 6875
      expect(result.twentyFivePercentExcess.toNumber()).toBe(6875);
    });

    it("Part II Line 17 uses TMT from Form 6251", () => {
      const result = calculateForm3800(makeInput({
        tentativeMinimumTax: d(15000),
        scheduleK1s: [makeK1({ otherCredits: "1000" })],
      }));
      expect(result.tentativeMinimumTax.toNumber()).toBe(15000);
    });

    it("Part II Line 18 takes greater of 25% threshold or TMT", () => {
      // Scenario: TMT > 25% threshold
      const result1 = calculateForm3800(makeInput({
        regularTax: d(40000),
        tentativeMinimumTax: d(20000),
        scheduleK1s: [makeK1({ otherCredits: "1000" })],
      }));
      // 25% of (40000 - 25000) = 3750, TMT = 20000 → max = 20000
      expect(result1.greaterOfThresholdOrTMT.toNumber()).toBe(20000);

      // Scenario: 25% threshold > TMT
      const result2 = calculateForm3800(makeInput({
        regularTax: d(200000),
        tentativeMinimumTax: d(5000),
        scheduleK1s: [makeK1({ otherCredits: "1000" })],
      }));
      // 25% of (200000 - 25000) = 43750, TMT = 5000 → max = 43750
      expect(result2.greaterOfThresholdOrTMT.toNumber()).toBe(43750);
    });

    it("Part II Line 19 computes net income tax", () => {
      const result = calculateForm3800(makeInput({
        regularTax: d(80000),
        amt: d(5000),
        childTaxCredit: d(2000),
        otherNonrefundableCredits: d(1000),
        scheduleK1s: [makeK1({ otherCredits: "1000" })],
      }));
      // (80000 + 5000) - (2000 + 1000) = 82000
      expect(result.netIncomeTax.toNumber()).toBe(82000);
    });

    it("Part II Line 20 computes credit limit as net income tax minus greater of threshold/TMT", () => {
      const result = calculateForm3800(makeInput({
        regularTax: d(80000),
        amt: d(0),
        tentativeMinimumTax: d(0),
        scheduleK1s: [makeK1({ otherCredits: "10000" })],
      }));
      // Net income tax = 80000, 25% of (80000 - 25000) = 13750, TMT = 0
      // Greater = 13750, Limit = 80000 - 13750 = 66250
      expect(result.creditLimitation.toNumber()).toBe(66250);
    });

    it("Part II Line 21 takes lesser of total credit or limit", () => {
      // Credit < limit → full credit allowed
      const result1 = calculateForm3800(makeInput({
        regularTax: d(80000),
        scheduleK1s: [makeK1({ otherCredits: "5000" })],
      }));
      expect(result1.allowableCredit.toNumber()).toBe(5000);

      // Credit > limit → limited
      const result2 = calculateForm3800(makeInput({
        regularTax: d(30000),
        scheduleK1s: [makeK1({ otherCredits: "50000" })],
      }));
      // Net regular tax = 30000, 25% of (30000 - 25000) = 1250
      // Net income tax = 30000, limit = 30000 - 1250 = 28750
      expect(result2.allowableCredit.toNumber()).toBe(28750);
    });

    it("TMT floor reduces allowable credit", () => {
      const result = calculateForm3800(makeInput({
        regularTax: d(50000),
        amt: d(0),
        tentativeMinimumTax: d(45000),
        scheduleK1s: [makeK1({ otherCredits: "10000" })],
      }));
      // Net income tax = 50000, 25% threshold = 25% of (50000 - 25000) = 6250
      // TMT = 45000 > 6250, so greater = 45000
      // Limit = 50000 - 45000 = 5000
      expect(result.allowableCredit.toNumber()).toBe(5000);
      expect(result.carryforwardToNextYear.toNumber()).toBe(5000);
    });

    it("25% threshold reduces credit when net regular tax is low", () => {
      const result = calculateForm3800(makeInput({
        regularTax: d(27000),
        amt: d(0),
        tentativeMinimumTax: d(0),
        scheduleK1s: [makeK1({ otherCredits: "30000" })],
      }));
      // Net regular tax = 27000, 25% of (27000 - 25000) = 500
      // Net income tax = 27000, limit = 27000 - 500 = 26500
      expect(result.allowableCredit.toNumber()).toBe(26500);
    });
  });

  // ── Carryforward ─────────────────────────────────────────

  describe("Carryforward", () => {
    it("carryforward equals total credit minus allowed", () => {
      const result = calculateForm3800(makeInput({
        regularTax: d(30000),
        scheduleK1s: [makeK1({ otherCredits: "50000" })],
      }));
      // Allowed = 28750 (from limitation)
      const expected = result.totalCredit.minus(result.allowableCredit);
      expect(result.carryforwardToNextYear.toNumber()).toBe(expected.toNumber());
    });

    it("credit exceeds limitation generates carryforward", () => {
      const result = calculateForm3800(makeInput({
        regularTax: d(20000),
        scheduleK1s: [makeK1({ otherCredits: "25000" })],
      }));
      expect(result.carryforwardToNextYear.greaterThan(0)).toBe(true);
      expect(result.allowableCredit.plus(result.carryforwardToNextYear).toNumber()).toBe(25000);
    });

    it("no carryforward when credit is fully absorbed", () => {
      const result = calculateForm3800(makeInput({
        regularTax: d(80000),
        scheduleK1s: [makeK1({ otherCredits: "5000" })],
      }));
      expect(result.carryforwardToNextYear.toNumber()).toBe(0);
    });

    it("carryforward from prior year applied before current year", () => {
      const result = calculateForm3800(makeInput({
        carryforward: d(3000),
        scheduleK1s: [makeK1({ otherCredits: "2000" })],
        regularTax: d(80000),
      }));
      // Total = 2000 + 3000 = 5000, fully absorbed
      expect(result.totalCredit.toNumber()).toBe(5000);
      expect(result.allowableCredit.toNumber()).toBe(5000);
      expect(result.carryforwardToNextYear.toNumber()).toBe(0);
    });
  });

  // ── Filing Status Variations ─────────────────────────────

  describe("Filing Status Variations", () => {
    const filingStatuses = [
      { status: "single" as const, threshold: 25000 },
      { status: "married_filing_jointly" as const, threshold: 25000 },
      { status: "married_filing_separately" as const, threshold: 12500 },
      { status: "head_of_household" as const, threshold: 25000 },
      { status: "qualifying_surviving_spouse" as const, threshold: 25000 },
    ];

    for (const { status, threshold } of filingStatuses) {
      it(`${status} uses $${threshold.toLocaleString()} threshold`, () => {
        const result = calculateForm3800(makeInput({
          filingStatus: status,
          regularTax: d(50000),
          scheduleK1s: [makeK1({ otherCredits: "100000" })],
        }));
        // 25% of (50000 - threshold)
        const expectedExcess = Math.max(0, 50000 - threshold) * 0.25;
        expect(result.twentyFivePercentExcess.toNumber()).toBe(expectedExcess);
      });
    }
  });

  // ── Personal Credits Interaction ─────────────────────────

  describe("Personal Credits Interaction", () => {
    it("large personal credits reduce net regular tax and limit", () => {
      const result = calculateForm3800(makeInput({
        regularTax: d(50000),
        childTaxCredit: d(10000),
        otherNonrefundableCredits: d(15000),
        scheduleK1s: [makeK1({ otherCredits: "30000" })],
      }));
      // Personal credits = 25000
      // Net regular tax = max(0, 50000 - 25000) = 25000
      // 25% of (25000 - 25000) = 0
      // Net income tax = (50000 + 0) - 25000 = 25000
      // Limit = 25000 - 0 = 25000
      expect(result.netRegularTax.toNumber()).toBe(25000);
      expect(result.creditLimitation.toNumber()).toBe(25000);
      expect(result.allowableCredit.toNumber()).toBe(25000);
      expect(result.carryforwardToNextYear.toNumber()).toBe(5000);
    });

    it("personal credits exceeding regular tax produce zero net regular tax", () => {
      const result = calculateForm3800(makeInput({
        regularTax: d(5000),
        childTaxCredit: d(6000),
        scheduleK1s: [makeK1({ otherCredits: "1000" })],
      }));
      expect(result.netRegularTax.toNumber()).toBe(0);
      // Net income tax = max(0, 5000 + 0 - 6000) = 0
      expect(result.netIncomeTax.toNumber()).toBe(0);
      expect(result.creditLimitation.toNumber()).toBe(0);
      expect(result.allowableCredit.toNumber()).toBe(0);
      expect(result.carryforwardToNextYear.toNumber()).toBe(1000);
    });
  });

  // ── AMT Interaction ──────────────────────────────────────

  describe("AMT Interaction", () => {
    it("AMT increases net income tax and expands credit room", () => {
      const result = calculateForm3800(makeInput({
        regularTax: d(50000),
        amt: d(10000),
        tentativeMinimumTax: d(0),
        scheduleK1s: [makeK1({ otherCredits: "60000" })],
      }));
      // Net income tax = 50000 + 10000 = 60000
      // 25% of (50000 - 25000) = 6250
      // Limit = 60000 - 6250 = 53750
      expect(result.netIncomeTax.toNumber()).toBe(60000);
      expect(result.creditLimitation.toNumber()).toBe(53750);
    });

    it("high TMT with low AMT still limits credit via the floor", () => {
      const result = calculateForm3800(makeInput({
        regularTax: d(60000),
        amt: d(0),
        tentativeMinimumTax: d(55000),
        scheduleK1s: [makeK1({ otherCredits: "20000" })],
      }));
      // Net income tax = 60000
      // 25% of (60000 - 25000) = 8750
      // TMT = 55000 > 8750
      // Limit = 60000 - 55000 = 5000
      expect(result.creditLimitation.toNumber()).toBe(5000);
      expect(result.allowableCredit.toNumber()).toBe(5000);
    });
  });

  // ── Audit Trail ──────────────────────────────────────────

  describe("Audit Trail", () => {
    it("produces audit lines for all key computations", () => {
      const result = calculateForm3800(makeInput({
        scheduleK1s: [makeK1({ otherCredits: "5000" })],
        carryforward: d(1000),
      }));
      const lineIds = result.lines.map((l) => `${l.form}:${l.line}`);
      expect(lineIds).toContain("Form 3800:K-1 Box 15");
      expect(lineIds).toContain("Form 3800:Part I Line 1");
      expect(lineIds).toContain("Form 3800:Part I Line 3");
      expect(lineIds).toContain("Form 3800:Part I Line 5");
      expect(lineIds).toContain("Form 3800:Part II Line 15");
      expect(lineIds).toContain("Form 3800:Part II Line 21");
      expect(lineIds).toContain("Form 3800:Carryforward");
    });
  });

  // ── Realistic Scenarios ──────────────────────────────────

  describe("Realistic Scenarios", () => {
    it("single filer with K-1 low-income housing credit fully absorbed", () => {
      const result = calculateForm3800(makeInput({
        filingStatus: "single",
        regularTax: d(45000),
        amt: d(0),
        tentativeMinimumTax: d(0),
        childTaxCredit: d(0),
        otherNonrefundableCredits: d(0),
        scheduleK1s: [makeK1({
          lowIncomeHousingCredit42j5: "8000",
        })],
      }));
      // Net regular tax = 45000, 25% of (45000 - 25000) = 5000
      // Net income tax = 45000, limit = 45000 - 5000 = 40000
      // Credit (8000) < limit (40000) → fully absorbed
      expect(result.allowableCredit.toNumber()).toBe(8000);
      expect(result.carryforwardToNextYear.toNumber()).toBe(0);
    });

    it("MFJ with multiple K-1 credits and carryforward", () => {
      const result = calculateForm3800(makeInput({
        filingStatus: "married_filing_jointly",
        regularTax: d(100000),
        amt: d(2000),
        tentativeMinimumTax: d(95000),
        childTaxCredit: d(4000),
        otherNonrefundableCredits: d(3000),
        scheduleK1s: [
          makeK1({ partnershipName: "LP1", lowIncomeHousingCreditOther: "12000" }),
          makeK1({ partnershipName: "LP2", otherCredits: "5000" }),
        ],
        carryforward: d(3000),
      }));
      // Personal credits = 4000 + 3000 = 7000
      // Net regular tax = max(0, 100000 - 7000) = 93000
      // 25% of (93000 - 25000) = 17000
      // TMT = 95000 > 17000
      // Net income tax = (100000 + 2000) - 7000 = 95000
      // Limit = 95000 - 95000 = 0
      expect(result.totalCredit.toNumber()).toBe(20000); // 12000 + 5000 + 3000
      expect(result.creditLimitation.toNumber()).toBe(0);
      expect(result.allowableCredit.toNumber()).toBe(0);
      expect(result.carryforwardToNextYear.toNumber()).toBe(20000);
    });

    it("MFS filer with rehabilitation credit partially allowed", () => {
      const result = calculateForm3800(makeInput({
        filingStatus: "married_filing_separately",
        regularTax: d(35000),
        amt: d(0),
        tentativeMinimumTax: d(0),
        scheduleK1s: [makeK1({
          qualifiedRehabilitationExpenditures: "40000",
        })],
      }));
      // Net regular tax = 35000, 25% of (35000 - 12500) = 5625
      // Net income tax = 35000, limit = 35000 - 5625 = 29375
      expect(result.allowableCredit.toNumber()).toBe(29375);
      expect(result.carryforwardToNextYear.toNumber()).toBe(10625);
    });
  });
});
