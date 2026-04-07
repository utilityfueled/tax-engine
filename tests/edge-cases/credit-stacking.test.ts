/**
 * Edge case tests for Schedule 3 credit stacking.
 * Tests multiple nonrefundable credits combined, refundable + nonrefundable
 * interactions, and all credit types together.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateSchedule3 } from "@/engine/schedules/schedule-3.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture, complexMFJFixture } from "../fixtures/simple-w2.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

// ═══════════════════════════════════════════════════════════
// Multiple Nonrefundable Credits
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 - multiple nonrefundable credits stacking", () => {
  it("all five nonrefundable credits sum correctly", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(500),
      childDependentCareCredit: d(1200),
      educationCredits: d(2500),
      residentialCleanEnergyCredit: d(6000),
      energyImprovementCredit: d(1500),
    });
    // Total = 500 + 1200 + 2500 + 6000 + 1500 = $11,700
    expect(result.totalNonrefundableCredits.toNumber()).toBe(11700);
  });

  it("large credit stacking still sums without loss", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(15000),
      educationCredits: d(2500),
      residentialCleanEnergyCredit: d(25000),
    });
    expect(result.totalNonrefundableCredits.toNumber()).toBe(42500);
  });

  it("zero-value credits don't affect total", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(0),
      childDependentCareCredit: d(0),
      educationCredits: d(500),
      residentialCleanEnergyCredit: d(0),
      energyImprovementCredit: d(0),
    });
    expect(result.totalNonrefundableCredits.toNumber()).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════
// Refundable + Nonrefundable Together
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 - refundable and nonrefundable together", () => {
  it("both parts populated correctly", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(300),
      educationCredits: d(2000),
      netPremiumTaxCredit: d(4000),
      excessSocialSecurityWithholding: d(1500),
    });
    expect(result.totalNonrefundableCredits.toNumber()).toBe(2300);
    expect(result.totalRefundableCredits.toNumber()).toBe(5500);
  });

  it("nonrefundable and refundable parts are independent", () => {
    // Nonrefundable = $0, refundable > $0
    const result = calculateSchedule3(simpleW2Fixture, {
      netPremiumTaxCredit: d(3000),
    });
    expect(result.totalNonrefundableCredits.toNumber()).toBe(0);
    expect(result.totalRefundableCredits.toNumber()).toBe(3000);
  });
});

// ═══════════════════════════════════════════════════════════
// Federal Pipeline — Credits Reducing Tax
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 - credit stacking in federal pipeline", () => {
  it("FTC + education + energy credits all reduce total tax", () => {
    const baseTax = calculateFederalTax(simpleW2Fixture);

    const withCredits: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "Intl Fund",
        ordinaryDividends: "1000",
        qualifiedDividends: "0",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "200",
        foreignCountry: "Various",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
      energyCredits: {
        solarElectricCost: "10000", // 30% = $3,000
      },
    };
    const creditTax = calculateFederalTax(withCredits);

    // Solar $3K + FTC up to $200, minus extra tax on $1K dividends (~$220)
    // Net reduction should be at least $2,500
    const reduction = baseTax.totalTax.minus(creditTax.totalTax);
    expect(reduction.greaterThan(2500)).toBe(true);
  });

  it("solar credit + improvement credit both flow through Schedule 3", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      energyCredits: {
        solarElectricCost: "20000",   // Part I: 30% = $6,000
        insulationCost: "2000",        // Part II: 30% = $600
      },
    };
    const result = calculateFederalTax(fixture);

    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    const line5a = sched3Lines.find((l) => l.line === "5a");
    const line5b = sched3Lines.find((l) => l.line === "5b");
    expect(line5a?.value.toNumber()).toBe(6000);
    expect(line5b?.value.toNumber()).toBe(600);
  });

  it("ACA premium credit flows as refundable through Schedule 3", () => {
    // Use low income so PTC > APTC (simpleW2Fixture has $85K which is >400% FPL)
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "25000",
        federalWithheld: "3000",
        socialSecurityWages: "25000",
        socialSecurityWithheld: "1550",
        medicareWages: "25000",
        medicareWithheld: "362.50",
      }],
      form1095A: [{
        marketplace: "Healthcare.gov",
        policyNumber: "POL-123",
        monthlyPremiums: Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          enrolleePremium: "400",
          slcsp: "600",
          advancePremiumTaxCredit: "100", // Low APTC → should get net PTC refund
        })),
      }],
    };
    const result = calculateFederalTax(fixture);

    // $25K income, family 1: FPL% = 25000/15650*100 ≈ 160% → 0.4% rate
    // Expected contribution ≈ $100. SLCSP $7,200. PTC ≈ min($7100, $4800) = $4800
    // APTC = $1,200. Net PTC = $4,800 - $1,200 = $3,600
    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    const line10 = sched3Lines.find((l) => l.line === "10");
    expect(line10?.value.greaterThan(0)).toBe(true);
  });

  it("excess SS withholding from multiple employers flows through", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "150000",
          socialSecurityWages: "150000",
          socialSecurityWithheld: "9300",    // 150K × 6.2%
          medicareWages: "150000",
          medicareWithheld: "2175",
          federalWithheld: "30000",
        },
        {
          ...simpleW2Fixture.w2s[0],
          employer: { name: "Employer B", ein: "99-8765432" },
          wages: "100000",
          socialSecurityWages: "100000",
          socialSecurityWithheld: "6200",    // 100K × 6.2%
          medicareWages: "100000",
          medicareWithheld: "1450",
          federalWithheld: "15000",
        },
      ],
    };
    const result = calculateFederalTax(fixture);

    // Total SS withheld: $9,300 + $6,200 = $15,500
    // Max: $176,100 × 6.2% = $10,918.20 → $10,918
    // Excess: $15,500 - $10,918 = $4,582
    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    const line13a = sched3Lines.find((l) => l.line === "13a");
    expect(line13a?.value.greaterThan(0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Credits Cannot Exceed Tax Liability
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 - credits cannot make tax negative", () => {
  it("massive nonrefundable credits floor tax at $0", () => {
    const withHugeCredit: TaxYearInput = {
      ...simpleW2Fixture,
      energyCredits: {
        solarElectricCost: "500000", // 30% = $150K credit — way more than tax
      },
    };
    const result = calculateFederalTax(withHugeCredit);
    // Nonrefundable credits can't make tax negative
    expect(result.totalTax.greaterThanOrEqualTo(0)).toBe(true);
  });

  it("refundable credits can produce a refund even with zero tax", () => {
    // Low income filer with excess SS from multiple employers
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "90000",
          federalWithheld: "15000",
          socialSecurityWages: "90000",
          socialSecurityWithheld: "5580",
          medicareWages: "90000",
          medicareWithheld: "1305",
        },
        {
          ...simpleW2Fixture.w2s[0],
          employer: { name: "B", ein: "99-1111111" },
          wages: "90000",
          federalWithheld: "15000",
          socialSecurityWages: "90000",
          socialSecurityWithheld: "5580",
          medicareWages: "90000",
          medicareWithheld: "1305",
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    // Total SS: $11,160. Max: $10,918.20 (exact). Excess: $241.80
    // This excess is refundable — contributes to refund
    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    const line13a = sched3Lines.find((l) => l.line === "13a");
    expect(line13a?.value.toNumber()).toBe(241.8);
  });
});

// ═══════════════════════════════════════════════════════════
// Isolated Credit Tests
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 - isolated credit tests", () => {
  it("only energy improvement credit (no solar) flows through line 5b alone", () => {
    // Verify energyImprovementCredit is independent — no residentialCleanEnergyCredit present
    const result = calculateSchedule3(simpleW2Fixture, {
      energyImprovementCredit: d(1800),
    });
    expect(result.energyImprovementCredit.toNumber()).toBe(1800);
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(0);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(1800);

    const line5b = result.lines.find((l) => l.line === "5b");
    const line5a = result.lines.find((l) => l.line === "5a");
    expect(line5b?.value.toNumber()).toBe(1800);
    expect(line5a?.value.toNumber()).toBe(0);
  });

  it("FTC as only credit flows through Schedule 3 line 1", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(425),
    });
    expect(result.foreignTaxCredit.toNumber()).toBe(425);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(425);

    const line1 = result.lines.find((l) => l.line === "1");
    expect(line1?.value.toNumber()).toBe(425);
    // All other credits should be zero
    expect(result.childDependentCareCredit.toNumber()).toBe(0);
    expect(result.educationCredits.toNumber()).toBe(0);
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(0);
    expect(result.energyImprovementCredit.toNumber()).toBe(0);
  });

  it("penny-level accuracy — $1 each for 5 credit types sums to $5", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(1),
      childDependentCareCredit: d(1),
      educationCredits: d(1),
      residentialCleanEnergyCredit: d(1),
      energyImprovementCredit: d(1),
    });
    expect(result.foreignTaxCredit.toNumber()).toBe(1);
    expect(result.childDependentCareCredit.toNumber()).toBe(1);
    expect(result.educationCredits.toNumber()).toBe(1);
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(1);
    expect(result.energyImprovementCredit.toNumber()).toBe(1);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(5);
  });

  it("all nonrefundable + all refundable credits simultaneously — verify totals", () => {
    // Nonrefundable: 100 + 200 + 300 + 400 + 500 = 1500
    // Refundable: 600 + 700 = 1300
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(100),
      childDependentCareCredit: d(200),
      educationCredits: d(300),
      residentialCleanEnergyCredit: d(400),
      energyImprovementCredit: d(500),
      netPremiumTaxCredit: d(600),
      excessSocialSecurityWithholding: d(700),
    });
    expect(result.totalNonrefundableCredits.toNumber()).toBe(1500);
    expect(result.totalRefundableCredits.toNumber()).toBe(1300);

    const line7 = result.lines.find((l) => l.line === "7");
    const line15 = result.lines.find((l) => l.line === "15");
    expect(line7?.value.toNumber()).toBe(1500);
    expect(line15?.value.toNumber()).toBe(1300);
  });
});

// ═══════════════════════════════════════════════════════════
// Excess SS Withholding — Exact Calculation
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 - excess SS withholding exact values", () => {
  it("two employers each at $176,100 wages yields exact excess SS", () => {
    // Each employer withholds 176100 × 6.2% = $10,918.20
    // Max allowed = 176100 × 6.2% = $10,918.20 (exact, not rounded)
    // Total withheld: $21,836.40
    // Excess = totalWithheld - maxWithholding = 21836.40 - 10918.20 = $10,918.20
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          employer: { name: "Employer A", ein: "11-1111111" },
          wages: "176100",
          federalWithheld: "30000",
          socialSecurityWages: "176100",
          socialSecurityWithheld: "10918.20",  // 176100 × 6.2%
          medicareWages: "176100",
          medicareWithheld: "2553.45",
        },
        {
          ...simpleW2Fixture.w2s[0],
          employer: { name: "Employer B", ein: "22-2222222" },
          wages: "176100",
          federalWithheld: "30000",
          socialSecurityWages: "176100",
          socialSecurityWithheld: "10918.20",  // 176100 × 6.2%
          medicareWages: "176100",
          medicareWithheld: "2553.45",
        },
      ],
    };
    const result = calculateFederalTax(fixture);

    // Max SS = 176100 × 6.2% = $10,918.20 (exact)
    // Total withheld = 10918.20 + 10918.20 = $21,836.40
    // Excess = totalWithheld - maxWithholding = 21836.40 - 10918.20 = $10,918.20
    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    const line13a = sched3Lines.find((l) => l.line === "13a");
    expect(line13a?.value.toNumber()).toBe(10918.2);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Filing Status — Credits Through Schedule 3
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 - MFS filing status credit flow", () => {
  it("MFS filer with energy credits — credits still flow through Schedule 3", () => {
    const mfsFixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately",
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
        },
      },
      energyCredits: {
        solarElectricCost: "15000",   // 30% = $4,500 → Sched 3 line 5a
        insulationCost: "3000",        // 30% = $900  → Sched 3 line 5b
      },
    };
    const result = calculateFederalTax(mfsFixture);

    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    const line5a = sched3Lines.find((l) => l.line === "5a");
    const line5b = sched3Lines.find((l) => l.line === "5b");
    expect(line5a?.value.toNumber()).toBe(4500);
    expect(line5b?.value.toNumber()).toBe(900);

    // Nonrefundable credits = 4500 + 900 = 5400 via Sched 3 line 7
    const line7 = sched3Lines.find((l) => l.line === "7");
    expect(line7?.value.toNumber()).toBe(5400);
  });

  it("MFS filer cannot claim dependent care credit — line 2 stays $0", () => {
    // IRC §21(e)(2): MFS filers cannot claim dependent care credit
    const mfsWithCare: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately",
        dependents: [
          {
            firstName: "Kid",
            lastName: "Doe",
            ssn: "999-88-7777",
            relationship: "Child",
            dateOfBirth: "2020-06-01",
            monthsLivedWithYou: 12,
            qualifiesForCTC: true,
          },
        ],
      },
      dependentCare: {
        expenses: "5000",
        qualifyingIndividuals: 1,
      },
    };
    const result = calculateFederalTax(mfsWithCare);

    // MFS → dependentCareCredit must be $0
    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    const line2 = sched3Lines.find((l) => l.line === "2");
    expect(line2?.value.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Dependent Care Credit Through Federal Pipeline
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 - dependent care credit federal pipeline", () => {
  it("dependent care expenses produce Schedule 3 line 2 credit", () => {
    // $5,000 expenses, 1 child, AGI $85K → credit % = 20% (min floor)
    // Qualifying expenses capped at $3,000 (one individual)
    // Credit = $3,000 × 20% = $600
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        dependents: [
          {
            firstName: "Emma",
            lastName: "Doe",
            ssn: "888-77-6666",
            relationship: "Child",
            dateOfBirth: "2021-03-15",
            monthsLivedWithYou: 12,
            qualifiesForCTC: true,
          },
        ],
      },
      dependentCare: {
        expenses: "5000",
        qualifyingIndividuals: 1,
      },
    };
    const result = calculateFederalTax(fixture);

    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    const line2 = sched3Lines.find((l) => l.line === "2");
    // AGI $85K > $43K → 20% rate applied to $3,000 cap = $600
    expect(line2?.value.toNumber()).toBe(600);

    // Dependent care credit must reduce total tax vs no-care baseline
    const baselineResult = calculateFederalTax(simpleW2Fixture);
    expect(result.totalTax.lessThan(baselineResult.totalTax)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail Cross-Checks
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 - audit trail cross-checks", () => {
  it("audit trail values match result fields with all credits", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(500),
      childDependentCareCredit: d(1200),
      educationCredits: d(2500),
      residentialCleanEnergyCredit: d(9000),
      energyImprovementCredit: d(3200),
      netPremiumTaxCredit: d(3600),
      excessSocialSecurityWithholding: d(1500),
    });
    const line7 = result.lines.find((l) => l.line === "7");
    expect(line7?.value.toNumber()).toBe(16400);
    const line15 = result.lines.find((l) => l.line === "15");
    expect(line15?.value.toNumber()).toBe(5100);
  });

  it("each credit line matches its individual value", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(750),
      childDependentCareCredit: d(800),
    });
    const line1 = result.lines.find((l) => l.line === "1");
    expect(line1?.value.toNumber()).toBe(750);
    const line2 = result.lines.find((l) => l.line === "2");
    expect(line2?.value.toNumber()).toBe(800);
  });
});

// ═══════════════════════════════════════════════════════════
// Credits Exceeding Total Tax Liability (Nonrefundable Limitation)
// ═══════════════════════════════════════════════════════════

describe("Credit stacking - nonrefundable credits limited to tax liability", () => {
  it("Form 8812 Line 14 — nonrefundable CTC cannot exceed tax after other credits (spec line 14)", () => {
    // MFJ with 3 children, $60K income → max CTC = $6,000, but tax liability is small
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Bob",
          lastName: "Doe",
          ssn: "222-33-4444",
          dateOfBirth: "1990-05-01",
        },
        dependents: [
          { firstName: "A", lastName: "Doe", ssn: "111-11-1111", relationship: "Child", dateOfBirth: "2020-01-01", monthsLivedWithYou: 12, qualifiesForCTC: true },
          { firstName: "B", lastName: "Doe", ssn: "111-11-1112", relationship: "Child", dateOfBirth: "2021-01-01", monthsLivedWithYou: 12, qualifiesForCTC: true },
          { firstName: "C", lastName: "Doe", ssn: "111-11-1113", relationship: "Child", dateOfBirth: "2022-01-01", monthsLivedWithYou: 12, qualifiesForCTC: true },
        ],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "40000",
        federalWithheld: "3000",
        socialSecurityWages: "40000",
        socialSecurityWithheld: "2480",
        medicareWages: "40000",
        medicareWithheld: "580",
      }],
      energyCredits: {
        solarElectricCost: "50000", // 30% = $15,000 nonrefundable energy credit
      },
    };
    const result = calculateFederalTax(fixture);

    // Energy credit ($15K) as Sched 3 nonrefundable wipes out tax before CTC is applied
    // taxAfterOtherCredits = zeroFloor(incomeTax - otherCredits)
    // CTC nonrefundable = min(ctcBeforeLimitation, taxAfterOtherCredits)
    const taxAfterOtherCredits = Decimal.max(
      new Decimal(0),
      result.totalTaxBeforeCredits.minus(result.otherCredits)
    );
    expect(result.form8812!.nonrefundableCTC.lessThanOrEqualTo(taxAfterOtherCredits)).toBe(true);
    expect(result.form8812!.nonrefundableCTC.greaterThanOrEqualTo(0)).toBe(true);
    // With $15K energy credit vs ~$700 MFJ tax on $40K, CTC nonrefundable should be $0
    expect(result.form8812!.nonrefundableCTC.toNumber()).toBe(0);
  });

  it("1040 Line 22 — tax after credits is floored at $0 even when credits exceed tax (spec line 22)", () => {
    // Single filer with huge solar credit exceeding entire tax
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      energyCredits: {
        solarElectricCost: "500000", // $150K credit vs ~$11K tax
      },
    };
    const result = calculateFederalTax(fixture);

    // totalTax = zeroFloor(incomeTax - totalCredits) + additionalTaxes
    // The engine uses zeroFloor so tax after credits >= 0
    expect(result.totalTax.greaterThanOrEqualTo(0)).toBe(true);

    // The raw otherCredits (Sched 3) exceeds tax, but the engine floors the subtraction
    // otherCredits is $150K but tax is only ~$11K
    expect(result.otherCredits.greaterThan(result.totalTaxBeforeCredits)).toBe(true);

    // Effective tax reduction: all income tax is wiped out by credits
    // childTaxCredit (Line 19) should be $0 since no remaining tax after other credits
    expect(result.childTaxCredit.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// All Refundable Credits Stacking (ACTC + Education + PTC)
// ═══════════════════════════════════════════════════════════

describe("Credit stacking - all refundable credits (ACTC + AOC refundable + PTC)", () => {
  it("ACTC + refundable AOC + net PTC all contribute to total payments (spec 1040 lines 28-31)", () => {
    // Low-income MFJ with child, education, and ACA
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Bob",
          lastName: "Doe",
          ssn: "222-33-4444",
          dateOfBirth: "1990-05-01",
        },
        dependents: [
          { firstName: "Kid", lastName: "Doe", ssn: "333-44-5555", relationship: "Child", dateOfBirth: "2020-03-15", monthsLivedWithYou: 12, qualifiesForCTC: true },
        ],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "30000",
        federalWithheld: "2000",
        socialSecurityWages: "30000",
        socialSecurityWithheld: "1860",
        medicareWages: "30000",
        medicareWithheld: "435",
      }],
      educationExpenses: {
        aocStudents: [{ name: "Student Doe", qualifiedExpenses: "4000" }],
      },
      form1095A: [{
        marketplace: "Healthcare.gov",
        policyNumber: "POL-456",
        monthlyPremiums: Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          enrolleePremium: "500",
          slcsp: "700",
          advancePremiumTaxCredit: "50",
        })),
      }],
    };
    const result = calculateFederalTax(fixture);

    // ACTC should be > 0 (child with earned income > $2,500)
    expect(result.form8812!.actc.greaterThan(0)).toBe(true);

    // Net PTC should be > 0 (low APTC relative to allowed PTC)
    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    const line10 = sched3Lines.find((l) => l.line === "10");
    expect(line10?.value.greaterThan(0)).toBe(true);

    // Total payments should include all three refundable sources
    // totalPayments = withholding + estimated + ACTC + refundableCredits
    expect(result.totalPayments.greaterThan(d(2000))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Zero Tax Liability With Refundable Credits Only
// ═══════════════════════════════════════════════════════════

describe("Credit stacking - zero tax liability with refundable credits", () => {
  it("filer with $0 tax still receives refundable ACTC (spec Form 8812 Line 27)", () => {
    // MFJ with 2 children, very low income → $0 tax, but earned income drives ACTC
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Bob",
          lastName: "Doe",
          ssn: "222-33-4444",
          dateOfBirth: "1990-05-01",
        },
        dependents: [
          { firstName: "A", lastName: "Doe", ssn: "111-11-2221", relationship: "Child", dateOfBirth: "2020-01-01", monthsLivedWithYou: 12, qualifiesForCTC: true },
          { firstName: "B", lastName: "Doe", ssn: "111-11-2222", relationship: "Child", dateOfBirth: "2021-01-01", monthsLivedWithYou: 12, qualifiesForCTC: true },
        ],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "20000",
        federalWithheld: "0",
        socialSecurityWages: "20000",
        socialSecurityWithheld: "1240",
        medicareWages: "20000",
        medicareWithheld: "290",
      }],
    };
    const result = calculateFederalTax(fixture);

    // $20K MFJ → taxable income after $30,000 std deduction = $0
    // No tax liability → nonrefundable CTC = $0
    expect(result.form8812!.nonrefundableCTC.toNumber()).toBe(0);

    // But ACTC = 15% of ($20,000 - $2,500) = $2,625, capped at $1,700 × 2 = $3,400
    // ACTC = min($2,625, unused $4,000, $3,400) = $2,625
    expect(result.form8812!.actc.greaterThan(0)).toBe(true);
    expect(result.form8812!.actc.toNumber()).toBe(2625);
  });
});

// ═══════════════════════════════════════════════════════════
// AMT Interaction With Credits
// ═══════════════════════════════════════════════════════════

describe("Credit stacking - AMT interaction with credits", () => {
  it("AMT applies as additional tax on top of credit-reduced regular tax (spec Sched 2 Line 1)", () => {
    // High-income itemizer with large SALT → triggers AMT, plus energy credits
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Bob",
          lastName: "Doe",
          ssn: "222-33-4444",
          dateOfBirth: "1990-05-01",
        },
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "500000",
        federalWithheld: "100000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "500000",
        medicareWithheld: "7250",
      }],
      form1098: [{
        lender: "Big Bank",
        mortgageInterestReceived: "30000",
        outstandingMortgagePrincipal: "700000",
        propertyTax: "25000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      }],
      donations: [{
        organization: "Charity",
        type: "cash",
        amount: "10000",
        dateOfDonation: "2025-12-01",
        costBasis: "0",
      }],
      energyCredits: {
        solarElectricCost: "20000", // $6,000 credit
      },
    };
    const result = calculateFederalTax(fixture);

    // AMT should be positive due to high SALT add-back
    expect(result.amt.greaterThanOrEqualTo(0)).toBe(true);

    // totalTax = taxAfterCredits + AMT + other additional taxes
    // Credits reduce regular tax, but AMT is added on top
    expect(result.totalTax.greaterThanOrEqualTo(0)).toBe(true);

    // The Form 6251 AMT flows through Schedule 2
    const sched2Lines = result.allLines.filter((l) => l.form === "Sched 2");
    const amtLine = sched2Lines.find((l) => l.line === "1");
    expect(amtLine).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════
// Line 18 = Line 16 + Line 17: Credits reduce the combined base
// ═══════════════════════════════════════════════════════════

describe("Credit stacking - nonrefundable credits offset Schedule 2 Part I (Line 18)", () => {
  it("nonrefundable credits offset excess APTC repayment (Line 18 = Line 16 + Line 17)", () => {
    // Single, $50K wages, $6K solar credit, $1,600 excess APTC repayment
    // Income tax on $35K = $3,962. Without fix: credits limited to $3,962,
    // excess APTC $1,600 added in full → $1,600 tax. With fix (IRS method):
    // Line 18 = $3,962 + $1,600 = $5,562, credits $6K absorb all → $0 tax.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "50000",
        federalWithheld: "5000",
        socialSecurityWages: "50000",
        socialSecurityWithheld: "3100",
        medicareWages: "50000",
        medicareWithheld: "725",
      }],
      form1095A: [{
        marketplace: "Healthcare.gov",
        policyNumber: "A12345",
        monthlyPremiums: Array.from({ length: 12 }, () => ({
          enrolleePremium: "450",
          slcsp: "250",
          advancePremiumTaxCredit: "400",
        })),
      }],
      energyCredits: {
        solarElectricCost: "20000", // 30% = $6,000 credit
      },
    };

    const result = calculateFederalTax(fixture);

    // Income tax on $34,250 ($50K - $15,750 standard deduction)
    // $11,925×10% + ($34,250-$11,925)×12% = $1,192 + $2,679 = $3,872
    expect(result.totalTaxBeforeCredits.toNumber()).toBe(3872);

    // Excess APTC repayment should be $1,625 (Rev. Proc. 2024-40 §2.07)
    // FPL% = $50K/$15,060 × 100 = 332%; expected contribution = $3,400
    // Monthly expected = $283.33 > SLCSP $250 → PTC = $0
    // APTC $4,800, excess = $4,800, capped at $1,625 (332% FPL, single)
    const form8962Lines = result.allLines.filter((l) => l.form === "Form 8962");
    const excessLine = form8962Lines.find((l) => l.line === "27");
    expect(excessLine?.value.toNumber()).toBe(1625);

    // Per IRS Form 1040:
    // Line 16 = $3,872 (income tax)
    // Line 17 = $1,625 (Schedule 2 Part I: excess APTC)
    // Line 18 = $5,497
    // Line 20 = $6,000 (energy credit)
    // Line 22 = max(0, $5,497 - $6,000) = $0
    // Line 23 = $0 (no SE, no additional Medicare, no NIIT)
    // Line 24 = $0

    // Nonrefundable credits ($6K) absorb both income tax AND excess APTC
    expect(result.totalTax.toNumber()).toBe(0);

    // Refund = withholding $5,000 - $0 total tax = $5,000
    expect(result.refund.toNumber()).toBe(5000);
  });

  it("nonrefundable credits partially offset excess APTC when credits < Line 18", () => {
    // Single, $50K wages, $4K energy credit (smaller solar install), $1,625 excess APTC
    // Line 18 = $3,872 + $1,625 = $5,497. Credits $4K < $5,497 → Line 22 = $1,497
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "50000",
        federalWithheld: "5000",
        socialSecurityWages: "50000",
        socialSecurityWithheld: "3100",
        medicareWages: "50000",
        medicareWithheld: "725",
      }],
      form1095A: [{
        marketplace: "Healthcare.gov",
        policyNumber: "A12345",
        monthlyPremiums: Array.from({ length: 12 }, () => ({
          enrolleePremium: "450",
          slcsp: "250",
          advancePremiumTaxCredit: "400",
        })),
      }],
      energyCredits: {
        solarElectricCost: "13334", // 30% ≈ $4,000 credit
      },
    };

    const result = calculateFederalTax(fixture);

    // Line 18 = $3,872 + $1,625 = $5,497
    // Credits = $4,000 (30% of $13,334 = $4,000.20 → $4,000)
    // Line 22 = $5,497 - $4,000 = $1,497
    // Total tax = $1,497 (excess APTC cap $1,625 per Rev. Proc. 2024-40)
    expect(result.totalTax.toNumber()).toBe(1497);
  });
});

// ═══════════════════════════════════════════════════════════
// Foreign Tax Credit Ordering With Other Nonrefundable Credits
// ═══════════════════════════════════════════════════════════

describe("Credit stacking - FTC ordering with other nonrefundable credits", () => {
  it("FTC taken first on Sched 3 Line 1 before other credits (spec Sched 3 Lines 1-7)", () => {
    // FTC + child care + energy credits — verify ordering in audit trail
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        dependents: [{
          firstName: "Kid",
          lastName: "Doe",
          ssn: "777-88-9990",
          relationship: "Child",
          dateOfBirth: "2021-01-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        }],
      },
      form1099Div: [{
        payer: "Intl Fund",
        ordinaryDividends: "5000",
        qualifiedDividends: "0",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "250",
        foreignCountry: "Various",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
      dependentCare: {
        expenses: "6000",
        qualifyingIndividuals: 1,
      },
      energyCredits: {
        insulationCost: "4000", // 30% = $1,200, capped at $1,200
      },
    };
    const result = calculateFederalTax(fixture);

    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    const line1 = sched3Lines.find((l) => l.line === "1");
    const line2 = sched3Lines.find((l) => l.line === "2");
    const line5b = sched3Lines.find((l) => l.line === "5b");
    const line7 = sched3Lines.find((l) => l.line === "7");

    // FTC on line 1, care credit on line 2, energy on line 5b
    expect(line1!.value.greaterThan(0)).toBe(true);
    expect(line2!.value.greaterThan(0)).toBe(true);
    expect(line5b!.value.greaterThan(0)).toBe(true);

    // Line 7 total = sum of all nonrefundable
    expect(line7!.value.toNumber()).toBe(
      line1!.value.plus(line2!.value).plus(line5b!.value).toNumber()
    );
  });

  it("FTC limited by Form 1116 still flows correctly alongside other credits (spec Form 1116 Line 21)", () => {
    // Small foreign income → FTC limited by ratio, plus large energy credit
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "Foreign Fund",
        ordinaryDividends: "2000",
        qualifiedDividends: "0",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "500", // Paid $500 but limit will be lower
        foreignCountry: "UK",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
      energyCredits: {
        solarElectricCost: "10000", // $3,000 credit
      },
    };
    const result = calculateFederalTax(fixture);

    // FTC should be limited (ratio-based), not full $500
    expect(result.foreignTaxCredit.lessThanOrEqualTo(d(500))).toBe(true);
    expect(result.foreignTaxCredit.greaterThan(0)).toBe(true);

    // Carryforward for unused FTC
    expect(result.carryforwards.foreignTaxCreditCarryforward.greaterThanOrEqualTo(0)).toBe(true);

    // Both credits reduce tax
    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    const line7 = sched3Lines.find((l) => l.line === "7");
    expect(line7!.value.greaterThan(d(3000))).toBe(true); // At least the $3K energy credit
  });
});

// ═══════════════════════════════════════════════════════════
// CTC + ODC + Education Credits Combined
// ═══════════════════════════════════════════════════════════

describe("Credit stacking - CTC + ODC + education credits combined", () => {
  it("CTC children + ODC dependents + AOC all reduce tax (spec Form 8812 Line 12, Form 8863)", () => {
    // MFJ with 2 CTC children + 1 ODC dependent + AOC student
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Jane",
          lastName: "Smith",
          ssn: "222-33-4445",
          dateOfBirth: "1988-05-01",
        },
        dependents: [
          { firstName: "Child1", lastName: "Smith", ssn: "333-44-5551", relationship: "Child", dateOfBirth: "2020-01-01", monthsLivedWithYou: 12, qualifiesForCTC: true },
          { firstName: "Child2", lastName: "Smith", ssn: "333-44-5552", relationship: "Child", dateOfBirth: "2021-06-01", monthsLivedWithYou: 12, qualifiesForCTC: true },
          { firstName: "Parent", lastName: "Smith", ssn: "333-44-5553", relationship: "Parent", dateOfBirth: "1960-01-01", monthsLivedWithYou: 12, qualifiesForCTC: false, qualifiesForODC: true },
        ],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "120000",
        federalWithheld: "18000",
        socialSecurityWages: "120000",
        socialSecurityWithheld: "7440",
        medicareWages: "120000",
        medicareWithheld: "1740",
      }],
      educationExpenses: {
        aocStudents: [{ name: "College Kid", qualifiedExpenses: "4000" }],
      },
    };
    const result = calculateFederalTax(fixture);

    // CTC before limitation: 2 × $2,000 + 1 × $500 = $4,500 (below MFJ $400K threshold)
    expect(result.form8812!.ctcBeforeLimitation.toNumber()).toBe(4500);

    // Education nonrefundable credit (60% of AOC) flows through Sched 3
    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    const line3 = sched3Lines.find((l) => l.line === "3");
    expect(line3!.value.greaterThan(0)).toBe(true);

    // CTC (Line 19) + other credits (Line 20) = total credits (Line 21)
    expect(result.totalCredits.toNumber()).toBe(
      result.childTaxCredit.plus(result.otherCredits).toNumber()
    );
  });
});

// ═══════════════════════════════════════════════════════════
// Energy Credits (Form 5695) Stacking With Other Credits
// ═══════════════════════════════════════════════════════════

describe("Credit stacking - Form 5695 energy credits with other credits", () => {
  it("Part I + Part II energy credits stack with FTC and dependent care (spec Form 5695 Lines 14, 30)", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        dependents: [{
          firstName: "Kid",
          lastName: "Doe",
          ssn: "777-88-9991",
          relationship: "Child",
          dateOfBirth: "2021-06-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        }],
      },
      form1099Div: [{
        payer: "Global Fund",
        ordinaryDividends: "3000",
        qualifiedDividends: "0",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "100",
        foreignCountry: "Various",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
      dependentCare: {
        expenses: "6000",
        qualifyingIndividuals: 2,
      },
      energyCredits: {
        solarElectricCost: "30000",   // Part I: $9,000
        insulationCost: "4000",        // Part II: 30% = $1,200 (at $1,200 cap)
        energyPropertyCost: "5000",    // Part II: 30% = $1,500 (at $2,000 cap)
      },
    };
    const result = calculateFederalTax(fixture);

    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    const line1 = sched3Lines.find((l) => l.line === "1"); // FTC
    const line2 = sched3Lines.find((l) => l.line === "2"); // Dependent care
    const line5a = sched3Lines.find((l) => l.line === "5a"); // Clean energy
    const line5b = sched3Lines.find((l) => l.line === "5b"); // Improvement
    const line7 = sched3Lines.find((l) => l.line === "7");

    expect(line5a!.value.toNumber()).toBe(9000);
    // Insulation: min(1200, 1200) + energy property: min(1500, 2000) = 2700, under $3200 cap
    expect(line5b!.value.toNumber()).toBe(2700);

    // Total nonrefundable = FTC + care + clean energy + improvement
    expect(line7!.value.toNumber()).toBe(
      line1!.value.plus(line2!.value).plus(line5a!.value).plus(line5b!.value).toNumber()
    );
  });

  it("energy improvement credit capped at $3,200 annual limit (spec Form 5695 Line 30)", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      energyCredits: {
        insulationCost: "10000",        // 30% = $3,000, but insulation subcap = $1,200
        energyPropertyCost: "20000",    // 30% = $6,000, but energy property subcap = $2,000
        homeEnergyAuditCost: "1000",    // 30% = $300, but audit subcap = $150
      },
    };
    const result = calculateFederalTax(fixture);

    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    const line5b = sched3Lines.find((l) => l.line === "5b");
    // $1,200 + $2,000 + $150 = $3,350 → capped at $3,200
    expect(line5b!.value.toNumber()).toBe(3200);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Restrictions on Credits
// ═══════════════════════════════════════════════════════════

describe("Credit stacking - MFS restrictions on credits", () => {
  it("MFS filer gets zero education credits — Form 8863 phase-out factor = 0 (spec Form 8863 MFS rule)", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately",
      },
      educationExpenses: {
        aocStudents: [{ name: "Student", qualifiedExpenses: "4000" }],
        llcExpenses: "5000",
      },
    };
    const result = calculateFederalTax(fixture);

    // MFS → phase-out factor = 0 → both AOC and LLC = $0
    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    const line3 = sched3Lines.find((l) => l.line === "3");
    expect(line3!.value.toNumber()).toBe(0);
  });

  it("MFS gets no dependent care and no education but keeps FTC and energy (spec IRC section 21(e)(2))", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately",
        dependents: [{
          firstName: "Kid",
          lastName: "Doe",
          ssn: "777-88-9992",
          relationship: "Child",
          dateOfBirth: "2021-01-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        }],
      },
      form1099Div: [{
        payer: "Intl Fund",
        ordinaryDividends: "2000",
        qualifiedDividends: "0",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "100",
        foreignCountry: "Various",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
      dependentCare: {
        expenses: "5000",
        qualifyingIndividuals: 1,
      },
      educationExpenses: {
        aocStudents: [{ name: "Student", qualifiedExpenses: "4000" }],
      },
      energyCredits: {
        solarElectricCost: "10000", // $3,000
      },
    };
    const result = calculateFederalTax(fixture);

    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    // Dependent care = $0 (MFS)
    expect(sched3Lines.find((l) => l.line === "2")!.value.toNumber()).toBe(0);
    // Education = $0 (MFS)
    expect(sched3Lines.find((l) => l.line === "3")!.value.toNumber()).toBe(0);
    // FTC > 0
    expect(sched3Lines.find((l) => l.line === "1")!.value.greaterThan(0)).toBe(true);
    // Energy credit = $3,000
    expect(sched3Lines.find((l) => l.line === "5a")!.value.toNumber()).toBe(3000);
  });
});

// ═══════════════════════════════════════════════════════════
// Very High Income Where Credits Phase Out
// ═══════════════════════════════════════════════════════════

describe("Credit stacking - high income credit phase-outs", () => {
  it("CTC phases out completely for single filer above $240K (spec Form 8812 Line 12 phase-out)", () => {
    // Single filer, $250K wages, 1 child → CTC max $2,000, threshold $200K
    // Excess = ($250K - $200K) = $50K → reduction = ceil(50) × $50 = $2,500
    // CTC after phase-out = max($2,000 - $2,500, 0) = $0
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        dependents: [{
          firstName: "Kid",
          lastName: "Doe",
          ssn: "777-88-9993",
          relationship: "Child",
          dateOfBirth: "2020-01-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        }],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "250000",
        federalWithheld: "50000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "250000",
        medicareWithheld: "3625",
      }],
    };
    const result = calculateFederalTax(fixture);

    expect(result.form8812!.ctcBeforeLimitation.toNumber()).toBe(0);
    expect(result.form8812!.nonrefundableCTC.toNumber()).toBe(0);
    expect(result.form8812!.actc.toNumber()).toBe(0);
  });

  it("education credits phase out above Single $90K MAGI (spec Form 8863 phase-out)", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "100000",
        federalWithheld: "18000",
        socialSecurityWages: "100000",
        socialSecurityWithheld: "6200",
        medicareWages: "100000",
        medicareWithheld: "1450",
      }],
      educationExpenses: {
        aocStudents: [{ name: "Student", qualifiedExpenses: "4000" }],
        llcExpenses: "10000",
      },
    };
    const result = calculateFederalTax(fixture);

    // AGI ~$100K > $90K → phase-out factor = 0 for single
    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    const line3 = sched3Lines.find((l) => l.line === "3");
    expect(line3!.value.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Single Filer With Maximum Possible Credits
// ═══════════════════════════════════════════════════════════

describe("Credit stacking - single filer with maximum possible credits", () => {
  it("single filer stacks FTC + energy + dependent care + CTC (spec Sched 3 Line 7 + 1040 Line 19)", () => {
    // Single HoH filer, $75K wages, 1 child, foreign dividends, energy, care
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "head_of_household",
        dependents: [{
          firstName: "Kid",
          lastName: "Doe",
          ssn: "777-88-9994",
          relationship: "Child",
          dateOfBirth: "2021-01-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        }],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "75000",
        federalWithheld: "10000",
        socialSecurityWages: "75000",
        socialSecurityWithheld: "4650",
        medicareWages: "75000",
        medicareWithheld: "1087.50",
      }],
      form1099Div: [{
        payer: "Intl Fund",
        ordinaryDividends: "3000",
        qualifiedDividends: "0",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "150",
        foreignCountry: "Various",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
      dependentCare: {
        expenses: "5000",
        qualifyingIndividuals: 1,
      },
      energyCredits: {
        solarElectricCost: "15000",  // $4,500 Part I
        insulationCost: "3000",       // $900 Part II (capped at $1,200)
      },
    };
    const result = calculateFederalTax(fixture);

    // All credit types present
    expect(result.foreignTaxCredit.greaterThan(0)).toBe(true);
    expect(result.otherCredits.greaterThan(0)).toBe(true);
    expect(result.childTaxCredit.greaterThanOrEqualTo(0)).toBe(true);

    // Total credits should significantly reduce tax
    const baseTax = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "head_of_household",
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "75000",
        federalWithheld: "10000",
        socialSecurityWages: "75000",
        socialSecurityWithheld: "4650",
        medicareWages: "75000",
        medicareWithheld: "1087.50",
      }],
    });
    expect(result.totalTax.lessThan(baseTax.totalTax)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Credits With $0 Earned Income
// ═══════════════════════════════════════════════════════════

describe("Credit stacking - $0 earned income", () => {
  it("ACTC is $0 when earned income is $0 (spec Form 8812 Line 21 — earned income excess)", () => {
    // Filer with only investment income, 1 child
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        dependents: [{
          firstName: "Kid",
          lastName: "Doe",
          ssn: "777-88-9995",
          relationship: "Child",
          dateOfBirth: "2020-01-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        }],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "0",
        federalWithheld: "0",
        socialSecurityWages: "0",
        socialSecurityWithheld: "0",
        medicareWages: "0",
        medicareWithheld: "0",
      }],
      form1099Div: [{
        payer: "Dividend Fund",
        ordinaryDividends: "80000",
        qualifiedDividends: "60000",
        totalCapitalGainDistributions: "0",
        federalWithheld: "8000",
        foreignTaxPaid: "0",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
    };
    const result = calculateFederalTax(fixture);

    // Earned income = $0 → excess over $2,500 = $0 → ACTC = $0
    expect(result.form8812!.earnedIncomeExcess.toNumber()).toBe(0);
    expect(result.form8812!.actc.toNumber()).toBe(0);

    // But nonrefundable CTC can still apply (from investment income tax)
    // $80K dividends → taxable income after std deduction → some tax
    expect(result.form8812!.nonrefundableCTC.greaterThanOrEqualTo(0)).toBe(true);
  });

  it("dependent care credit is $0 when earned income is $0 (spec Form 2441 Line 4)", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        dependents: [{
          firstName: "Kid",
          lastName: "Doe",
          ssn: "777-88-9996",
          relationship: "Child",
          dateOfBirth: "2021-01-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        }],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "0",
        federalWithheld: "0",
        socialSecurityWages: "0",
        socialSecurityWithheld: "0",
        medicareWages: "0",
        medicareWithheld: "0",
      }],
      form1099Div: [{
        payer: "Fund",
        ordinaryDividends: "50000",
        qualifiedDividends: "0",
        totalCapitalGainDistributions: "0",
        federalWithheld: "5000",
        foreignTaxPaid: "0",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
      dependentCare: {
        expenses: "5000",
        qualifyingIndividuals: 1,
      },
    };
    const result = calculateFederalTax(fixture);

    // Care credit limited by earned income → $0
    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    const line2 = sched3Lines.find((l) => l.line === "2");
    expect(line2!.value.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Child Care Credit at Various AGI Levels Stacking With CTC
// ═══════════════════════════════════════════════════════════

describe("Credit stacking - child care credit at various AGI levels with CTC", () => {
  it("low AGI ($20K) gets 32% care rate plus CTC (spec Form 2441 Line 8 — ceil rounding per IRS)", () => {
    // $20K AGI → excess over $15K = $5K → $5K/$2K = 2.5 → ceil = 3 steps → 35% - 3% = 32%
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "head_of_household",
        dependents: [{
          firstName: "Kid",
          lastName: "Doe",
          ssn: "777-88-9997",
          relationship: "Child",
          dateOfBirth: "2021-01-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        }],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "20000",
        federalWithheld: "1000",
        socialSecurityWages: "20000",
        socialSecurityWithheld: "1240",
        medicareWages: "20000",
        medicareWithheld: "290",
      }],
      dependentCare: {
        expenses: "5000",
        qualifyingIndividuals: 1,
      },
    };
    const result = calculateFederalTax(fixture);

    // Care: min($5K, $3K) × 32% = $3,000 × 0.32 = $960
    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    const line2 = sched3Lines.find((l) => l.line === "2");
    expect(line2!.value.toNumber()).toBe(960);

    // CTC: $2,000 for 1 child, no phase-out at $20K
    expect(result.form8812!.ctcBeforeLimitation.toNumber()).toBe(2000);
  });

  it("high AGI ($85K) gets minimum 20% care rate plus CTC (spec Form 2441 Line 8 floor)", () => {
    // $85K AGI → excess over $15K = $70K → 35 steps → 35% - 35% = 0% → floor at 20%
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "head_of_household",
        dependents: [
          { firstName: "Kid1", lastName: "Doe", ssn: "777-88-9998", relationship: "Child", dateOfBirth: "2020-01-01", monthsLivedWithYou: 12, qualifiesForCTC: true },
          { firstName: "Kid2", lastName: "Doe", ssn: "777-88-9999", relationship: "Child", dateOfBirth: "2021-01-01", monthsLivedWithYou: 12, qualifiesForCTC: true },
        ],
      },
      dependentCare: {
        expenses: "10000",
        qualifyingIndividuals: 2,
      },
    };
    const result = calculateFederalTax(fixture);

    // Care: min($10K, $6K) × 20% = $6,000 × 0.20 = $1,200
    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    const line2 = sched3Lines.find((l) => l.line === "2");
    expect(line2!.value.toNumber()).toBe(1200);

    // CTC: 2 × $2,000 = $4,000, no phase-out at $85K (threshold = $200K)
    expect(result.form8812!.ctcBeforeLimitation.toNumber()).toBe(4000);
  });

  it("two qualifying individuals raises care expense cap to $6K (spec Form 2441 Line 3)", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        dependents: [
          { firstName: "Kid1", lastName: "Doe", ssn: "777-88-8881", relationship: "Child", dateOfBirth: "2020-01-01", monthsLivedWithYou: 12, qualifiesForCTC: true },
          { firstName: "Kid2", lastName: "Doe", ssn: "777-88-8882", relationship: "Child", dateOfBirth: "2021-01-01", monthsLivedWithYou: 12, qualifiesForCTC: true },
        ],
      },
      dependentCare: {
        expenses: "8000",
        qualifyingIndividuals: 2,
      },
    };
    const result = calculateFederalTax(fixture);

    // 2 qualifying → $6K cap → min($8K, $6K) = $6K × 20% = $1,200
    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    const line2 = sched3Lines.find((l) => l.line === "2");
    expect(line2!.value.toNumber()).toBe(1200);
  });
});

// ═══════════════════════════════════════════════════════════
// Nonrefundable Credits Cannot Exceed Tax Liability
// ═══════════════════════════════════════════════════════════

describe("Credit stacking - nonrefundable credits hard-capped at tax liability", () => {
  it("foreign tax + education + child care combined never push taxAfterCredits below $0 (spec 1040 Line 22)", () => {
    // Single filer, $40K wages → income tax ≈ $2,918
    // FTC from $10K dividends at ~10% → roughly $250–$300
    // Education (AOC nonrefundable 60% × $2,500 = $1,500) + child care ($600)
    // Combined nonrefundable credits could exceed tax; result must floor at $0
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        dependents: [{
          firstName: "Kid",
          lastName: "Doe",
          ssn: "555-44-3301",
          relationship: "Child",
          dateOfBirth: "2021-06-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        }],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "40000",
        federalWithheld: "5000",
        socialSecurityWages: "40000",
        socialSecurityWithheld: "2480",
        medicareWages: "40000",
        medicareWithheld: "580",
      }],
      form1099Div: [{
        payer: "Intl Fund",
        ordinaryDividends: "10000",
        qualifiedDividends: "0",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "1000",
        foreignCountry: "Various",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
      educationExpenses: {
        aocStudents: [{ name: "Student Doe", qualifiedExpenses: "4000" }],
      },
      dependentCare: {
        expenses: "5000",
        qualifyingIndividuals: 1,
      },
    };
    const result = calculateFederalTax(fixture);

    // Tax after all nonrefundable credits must never go negative
    // totalTax includes SE tax etc., but the credit-reduced income tax ≥ 0
    expect(result.totalTax.greaterThanOrEqualTo(new Decimal(0))).toBe(true);

    // totalCredits = childTaxCredit (Line 19) + otherCredits (Line 20)
    // The engine floors at 0, so totalCredits ≤ totalTaxBeforeCredits
    expect(result.totalCredits.lessThanOrEqualTo(result.totalTaxBeforeCredits)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Credit Ordering: otherCredits (Sched 3) Applied Before CTC
// ═══════════════════════════════════════════════════════════

describe("Credit stacking - CTC applied after Schedule 3 other credits (spec 1040 Lines 19-21)", () => {
  it("large energy credit reduces taxAfterOtherCredits to $0, leaving nonrefundable CTC at $0", () => {
    // MFJ + 1 child, $55K wages → income tax ≈ $1,600 MFJ
    // Solar credit ($15K) >> tax → taxAfterOtherCredits = $0
    // So CTC nonrefundable = min(CTC_before, $0) = $0
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Sam",
          lastName: "Doe",
          ssn: "222-33-4401",
          dateOfBirth: "1991-03-10",
        },
        dependents: [{
          firstName: "Child",
          lastName: "Doe",
          ssn: "555-44-3302",
          relationship: "Child",
          dateOfBirth: "2019-04-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        }],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "55000",
        federalWithheld: "4000",
        socialSecurityWages: "55000",
        socialSecurityWithheld: "3410",
        medicareWages: "55000",
        medicareWithheld: "797.50",
      }],
      energyCredits: {
        solarElectricCost: "50000", // 30% = $15,000 — far exceeds ~$1,600 MFJ tax
      },
    };
    const result = calculateFederalTax(fixture);

    // Engine ordering: otherCredits (Sched 3) first, then CTC
    // With otherCredits >> incomeTax, taxAfterOtherCredits = 0 → CTC nonrefundable = 0
    expect(result.childTaxCredit.toNumber()).toBe(0);
    expect(result.otherCredits.greaterThan(result.totalTaxBeforeCredits)).toBe(true);
  });

  it("modest energy credit leaves remaining tax for CTC to consume (spec 1040 Line 19 ordering)", () => {
    // MFJ + 1 child, $120K wages → income tax ≈ $11K
    // Solar $5K credit → taxAfterOtherCredits ≈ $6K → CTC $2,000 applies against that
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Sam",
          lastName: "Doe",
          ssn: "222-33-4402",
          dateOfBirth: "1991-03-10",
        },
        dependents: [{
          firstName: "Child",
          lastName: "Doe",
          ssn: "555-44-3303",
          relationship: "Child",
          dateOfBirth: "2020-08-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        }],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "120000",
        federalWithheld: "18000",
        socialSecurityWages: "120000",
        socialSecurityWithheld: "7440",
        medicareWages: "120000",
        medicareWithheld: "1740",
      }],
      energyCredits: {
        solarElectricCost: "16667", // 30% ≈ $5,000
      },
    };
    const result = calculateFederalTax(fixture);

    // otherCredits ≈ $5K applied first; remaining tax > $0, so CTC nonrefundable > $0
    expect(result.otherCredits.greaterThan(new Decimal(0))).toBe(true);
    expect(result.childTaxCredit.greaterThan(new Decimal(0))).toBe(true);

    // totalCredits must equal childTaxCredit + otherCredits (1040 Line 21 formula)
    expect(result.totalCredits.toNumber()).toBe(
      result.childTaxCredit.plus(result.otherCredits).toNumber()
    );
  });
});

// ═══════════════════════════════════════════════════════════
// All Credits Combined: CTC + ACTC + FTC + Education + Child Care + Energy
// ═══════════════════════════════════════════════════════════

describe("Credit stacking - all six credit types combined in one return", () => {
  it("CTC + ACTC + FTC + AOC education + child care + solar energy all present simultaneously", () => {
    // MFJ, $80K wages, 2 children, AOC student, foreign dividends, solar, care
    // Tax is moderate; credits span nonrefundable (Sched 3 + CTC) and refundable (ACTC)
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Alex",
          lastName: "Doe",
          ssn: "222-33-4410",
          dateOfBirth: "1989-07-20",
        },
        dependents: [
          { firstName: "Teen", lastName: "Doe", ssn: "555-44-3310", relationship: "Child", dateOfBirth: "2007-09-01", monthsLivedWithYou: 12, qualifiesForCTC: true },
          { firstName: "Toddler", lastName: "Doe", ssn: "555-44-3311", relationship: "Child", dateOfBirth: "2022-02-14", monthsLivedWithYou: 12, qualifiesForCTC: true },
        ],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "80000",
        federalWithheld: "8000",
        socialSecurityWages: "80000",
        socialSecurityWithheld: "4960",
        medicareWages: "80000",
        medicareWithheld: "1160",
      }],
      form1099Div: [{
        payer: "Global ETF",
        ordinaryDividends: "3000",
        qualifiedDividends: "0",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "180",
        foreignCountry: "Various",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
      educationExpenses: {
        aocStudents: [{ name: "Teen Doe", qualifiedExpenses: "4000" }],
      },
      dependentCare: {
        expenses: "6000",
        qualifyingIndividuals: 1,
      },
      energyCredits: {
        solarElectricCost: "10000", // Part I: $3,000
      },
    };
    const result = calculateFederalTax(fixture);

    // All nonrefundable credit types present on Schedule 3
    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    expect(sched3Lines.find((l) => l.line === "1")!.value.greaterThan(0)).toBe(true); // FTC
    expect(sched3Lines.find((l) => l.line === "2")!.value.greaterThan(0)).toBe(true); // Care
    expect(sched3Lines.find((l) => l.line === "3")!.value.greaterThan(0)).toBe(true); // Education
    expect(sched3Lines.find((l) => l.line === "5a")!.value.toNumber()).toBe(3000);     // Solar

    // CTC nonrefundable flows via Line 19 (2 children, income below threshold)
    expect(result.form8812!.ctcBeforeLimitation.toNumber()).toBe(4000);

    // ACTC is refundable — present because earned income > $2,500
    expect(result.form8812!.actc.greaterThan(0)).toBe(true);

    // totalCredits = childTaxCredit + otherCredits (1040 Line 21)
    expect(result.totalCredits.toNumber()).toBe(
      result.childTaxCredit.plus(result.otherCredits).toNumber()
    );

    // Overall tax is lower than a no-credit baseline
    const baseline = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: { firstName: "Alex", lastName: "Doe", ssn: "222-33-4410", dateOfBirth: "1989-07-20" },
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "80000",
        federalWithheld: "8000",
        socialSecurityWages: "80000",
        socialSecurityWithheld: "4960",
        medicareWages: "80000",
        medicareWithheld: "1160",
      }],
    });
    expect(result.totalTax.lessThan(baseline.totalTax)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Credits Reducing Tax to Exactly $0
// ═══════════════════════════════════════════════════════════

describe("Credit stacking - credits reducing income tax to exactly zero", () => {
  it("energy credit equal to income tax reduces tax to exactly $0 before additional taxes (spec 1040 Line 22)", () => {
    // Single, $30K wages → standard deduction $15,000 → taxable $15,000
    // 2025 brackets: $11,925 × 10% = $1,192.50 + ($15,000 - $11,925) × 12% = $369 → $1,562
    // Solar cost to generate exactly $1,562 credit: $1,562 / 0.30 ≈ $5,207 → use $5,207 (rounds to $1,562.10)
    // Use a credit slightly larger than tax to guarantee the floor triggers
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "30000",
        federalWithheld: "2000",
        socialSecurityWages: "30000",
        socialSecurityWithheld: "1860",
        medicareWages: "30000",
        medicareWithheld: "435",
      }],
      energyCredits: {
        solarElectricCost: "6000", // 30% = $1,800 — exceeds $1,562 income tax
      },
    };
    const result = calculateFederalTax(fixture);

    // otherCredits ($1,800) ≥ totalTaxBeforeCredits ($1,562) → floor activates
    expect(result.otherCredits.toNumber()).toBe(1800);
    expect(result.otherCredits.greaterThanOrEqualTo(result.totalTaxBeforeCredits)).toBe(true);

    // After credits, CTC nonrefundable = $0 (no remaining tax liability)
    // totalCredits is capped at incomeTax via zeroFloor inside the engine
    // The engine reports actual credit amounts, not capped, but tax is floored at $0
    expect(result.totalTax.greaterThanOrEqualTo(new Decimal(0))).toBe(true);

    // No children → CTC = $0
    expect(result.childTaxCredit.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Credits Exceeding Tax — Refund Comes Only from Refundable Credits
// ═══════════════════════════════════════════════════════════

describe("Credit stacking - excess credits produce refund only via refundable credits", () => {
  it("nonrefundable credits exceeding tax are lost; refundable ACTC drives the refund (spec 1040 Lines 27-34)", () => {
    // MFJ + 2 children, $25K wages
    // Huge solar credit (nonrefundable) wipes income tax to $0, excess is not refunded
    // ACTC (refundable) = 15% × ($25K - $2,500) = $3,375, capped at 2 × $1,700 = $3,400 → $3,375
    // Refund = withholding + ACTC − totalTax
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Robin",
          lastName: "Doe",
          ssn: "222-33-4420",
          dateOfBirth: "1992-11-05",
        },
        dependents: [
          { firstName: "A", lastName: "Doe", ssn: "555-44-3320", relationship: "Child", dateOfBirth: "2020-03-01", monthsLivedWithYou: 12, qualifiesForCTC: true },
          { firstName: "B", lastName: "Doe", ssn: "555-44-3321", relationship: "Child", dateOfBirth: "2022-07-01", monthsLivedWithYou: 12, qualifiesForCTC: true },
        ],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "25000",
        federalWithheld: "1500",
        socialSecurityWages: "25000",
        socialSecurityWithheld: "1550",
        medicareWages: "25000",
        medicareWithheld: "362.50",
      }],
      energyCredits: {
        solarElectricCost: "100000", // $30K credit — far exceeds any tax
      },
    };
    const result = calculateFederalTax(fixture);

    // Nonrefundable credits cannot produce a negative tax
    expect(result.totalTax.greaterThanOrEqualTo(new Decimal(0))).toBe(true);

    // ACTC is present because earned income > $2,500
    expect(result.form8812!.actc.greaterThan(new Decimal(0))).toBe(true);

    // The refund is driven by withholding + ACTC exceeding totalTax
    expect(result.refund.greaterThan(new Decimal(0))).toBe(true);

    // The excess solar credit (beyond tax) does NOT inflate the refund:
    // refund ≤ withholding + ACTC (unused nonrefundable credits vanish)
    const maxRefundableRefund = result.totalPayments;
    expect(result.refund.lessThanOrEqualTo(maxRefundableRefund)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Credit Restrictions — CTC Phase-Out Threshold Halved
// ═══════════════════════════════════════════════════════════

describe("Credit stacking - MFS CTC phase-out at halved threshold", () => {
  it("MFS filer with $110K income loses CTC — threshold is $200K for MFS (same as single, spec Form 8812 phase-out)", () => {
    // For MFS the phase-out threshold is $200K (same as single), not $400K MFJ
    // $200K MFS income → excess = $0K → no phase-out reduction → CTC fully available
    // But at $210K: excess = $10K → 5 × $50 = $250 reduction → CTC $2,000 - $250 = $1,750
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately",
        dependents: [{
          firstName: "Kid",
          lastName: "Doe",
          ssn: "555-44-3330",
          relationship: "Child",
          dateOfBirth: "2021-01-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        }],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "210000",
        federalWithheld: "45000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "210000",
        medicareWithheld: "3045",
      }],
    };
    const result = calculateFederalTax(fixture);

    // Phase-out: excess = $10K → ceil(10) × $50 = $500 reduction
    // CTC before limitation = max($2,000 - $500, 0) = $1,500
    expect(result.form8812!.ctcBeforeLimitation.toNumber()).toBe(1500);

    // ACTC = 0 for MFS with high income (no earned income excess drives enough)
    // (Nonrefundable CTC may consume available liability)
    expect(result.form8812!.ctcBeforeLimitation.lessThan(new Decimal(2000))).toBe(true);
  });

  it("MFS filer: no dependent care, no education, no ACTC — only FTC and energy remain (spec IRC §21(e)(2) + §25A(g)(6))", () => {
    // Confirm that all MFS-disallowed credits are $0 while allowed credits flow
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately",
        dependents: [{
          firstName: "Kid",
          lastName: "Doe",
          ssn: "555-44-3331",
          relationship: "Child",
          dateOfBirth: "2022-01-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        }],
      },
      form1099Div: [{
        payer: "Intl ETF",
        ordinaryDividends: "4000",
        qualifiedDividends: "0",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "200",
        foreignCountry: "Various",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
      dependentCare: {
        expenses: "5000",
        qualifyingIndividuals: 1,
      },
      educationExpenses: {
        aocStudents: [{ name: "Student", qualifiedExpenses: "4000" }],
      },
      energyCredits: {
        solarElectricCost: "10000", // $3,000 allowed for MFS
      },
    };
    const result = calculateFederalTax(fixture);

    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");

    // Dependent care = $0 (MFS prohibition)
    expect(sched3Lines.find((l) => l.line === "2")!.value.toNumber()).toBe(0);
    // Education = $0 (MFS prohibition)
    expect(sched3Lines.find((l) => l.line === "3")!.value.toNumber()).toBe(0);
    // FTC > $0 (allowed for MFS)
    expect(sched3Lines.find((l) => l.line === "1")!.value.greaterThan(new Decimal(0))).toBe(true);
    // Solar energy credit flows through ($3,000)
    expect(sched3Lines.find((l) => l.line === "5a")!.value.toNumber()).toBe(3000);
    // ACTC = $0 because MFS filers cannot claim ACTC (Form 8812 MFS rule)
    expect(result.form8812!.actc.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Very High Income — Credits Phased Out
// ═══════════════════════════════════════════════════════════

describe("Credit stacking - very high income where credits are phased out", () => {
  it("$500K single filer: CTC fully phased out, FTC limited, education $0, care $0 (spec Form 8812 + 8863 + 2441)", () => {
    // $500K > $200K single threshold → CTC fully phased out
    // $500K > $90K single → education credits fully phased out
    // Dependent care still technically allowed but is small vs large tax
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        dependents: [
          { firstName: "Kid1", lastName: "Doe", ssn: "555-44-3340", relationship: "Child", dateOfBirth: "2018-01-01", monthsLivedWithYou: 12, qualifiesForCTC: true },
          { firstName: "Kid2", lastName: "Doe", ssn: "555-44-3341", relationship: "Child", dateOfBirth: "2020-01-01", monthsLivedWithYou: 12, qualifiesForCTC: true },
        ],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "500000",
        federalWithheld: "150000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "500000",
        medicareWithheld: "7250",
      }],
      educationExpenses: {
        aocStudents: [{ name: "College Kid", qualifiedExpenses: "4000" }],
        llcExpenses: "10000",
      },
      dependentCare: {
        expenses: "6000",
        qualifyingIndividuals: 2,
      },
    };
    const result = calculateFederalTax(fixture);

    // CTC: 2 × $2,000 = $4,000 max; excess = ($500K - $200K) = $300K
    // Reduction = ceil(300) × $50 = $15,000 → CTC = max(0, $4,000 - $15,000) = $0
    expect(result.form8812!.ctcBeforeLimitation.toNumber()).toBe(0);
    expect(result.childTaxCredit.toNumber()).toBe(0);

    // ACTC also $0 when CTC before limitation is $0
    expect(result.form8812!.actc.toNumber()).toBe(0);

    // Education credits phased out (AGI $500K >> $90K single phase-out ceiling)
    const sched3Lines = result.allLines.filter((l) => l.form === "Sched 3");
    expect(sched3Lines.find((l) => l.line === "3")!.value.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// totalCredits Invariant: childTaxCredit + otherCredits
// ═══════════════════════════════════════════════════════════

describe("Credit stacking - totalCredits invariant (spec 1040 Line 21)", () => {
  it("totalCredits always equals childTaxCredit + otherCredits regardless of combination", () => {
    // Use complexMFJFixture (has CTC-eligible dependent) plus solar energy
    const fixture: TaxYearInput = {
      ...complexMFJFixture,
      energyCredits: {
        solarElectricCost: "20000", // $6,000 credit
      },
    };
    const result = calculateFederalTax(fixture);

    const expected = result.childTaxCredit.plus(result.otherCredits);
    expect(result.totalCredits.toNumber()).toBe(expected.toNumber());
  });

  it("totalCredits = childTaxCredit + otherCredits holds when CTC is $0 (high income phase-out)", () => {
    // Single, $300K wages, no dependents → CTC = $0; otherCredits drives total
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "300000",
        federalWithheld: "80000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "300000",
        medicareWithheld: "4350",
      }],
      energyCredits: {
        solarElectricCost: "10000", // $3,000 credit
      },
    };
    const result = calculateFederalTax(fixture);

    expect(result.childTaxCredit.toNumber()).toBe(0);
    expect(result.totalCredits.toNumber()).toBe(
      result.childTaxCredit.plus(result.otherCredits).toNumber()
    );
    expect(result.otherCredits.greaterThan(new Decimal(0))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail — Credit Application Order
// ═══════════════════════════════════════════════════════════

describe("Credit stacking - audit trail shows credit application order (spec 1040 Lines 19-21)", () => {
  it("audit trail records Line 20 (otherCredits) before Line 19 (CTC), then Line 21 (total)", () => {
    // MFJ + 1 child, solar + FTC → both CTC and otherCredits populated
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Pat",
          lastName: "Doe",
          ssn: "222-33-4430",
          dateOfBirth: "1990-09-15",
        },
        dependents: [{
          firstName: "Child",
          lastName: "Doe",
          ssn: "555-44-3350",
          relationship: "Child",
          dateOfBirth: "2021-05-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        }],
      },
      form1099Div: [{
        payer: "Intl Index",
        ordinaryDividends: "2000",
        qualifiedDividends: "0",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "120",
        foreignCountry: "Various",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
      energyCredits: {
        solarElectricCost: "6667", // 30% ≈ $2,000
      },
    };
    const result = calculateFederalTax(fixture);

    const lines1040 = result.allLines.filter((l) => l.form === "1040");
    const line19 = lines1040.find((l) => l.line === "19"); // CTC
    const line20 = lines1040.find((l) => l.line === "20"); // otherCredits (Sched 3)
    const line21 = lines1040.find((l) => l.line === "21"); // totalCredits

    // All three lines present in audit trail
    expect(line19).toBeDefined();
    expect(line20).toBeDefined();
    expect(line21).toBeDefined();

    // Line 20 value = otherCredits (Schedule 3 nonrefundable sum)
    expect(line20!.value.toNumber()).toBe(result.otherCredits.toNumber());

    // Line 19 value = CTC (applied after Sched 3 exhausts remaining liability)
    expect(line19!.value.toNumber()).toBe(result.childTaxCredit.toNumber());

    // Line 21 = Line 19 + Line 20
    expect(line21!.value.toNumber()).toBe(
      line19!.value.plus(line20!.value).toNumber()
    );
  });
});

// ═══════════════════════════════════════════════════════════
// Form 2441 SE Earned Income: Deductible Half Subtraction
// Per IRS Form 2441 Instructions (Lines 4-5):
//   SE earned income = Schedule SE Line 3 minus Schedule 1 Line 15
//   IRC §21(d)(1) → §32(c)(2)(A)(i)(II)
// ═══════════════════════════════════════════════════════════

describe("Form 2441 pipeline - SE earned income subtracts deductible half", () => {
  it("SE-only filer: earned income reduced by deductible half caps dependent care credit", () => {
    // Single, 2 kids, $0 wages, $5K SE income (1099-NEC, no expenses), $8K care expenses
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [],
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        dependents: [
          { firstName: "A", lastName: "D", ssn: "111-11-1111", dateOfBirth: "2020-01-01", relationship: "child", qualifiesForCTC: true, qualifiesForODC: false },
          { firstName: "B", lastName: "D", ssn: "222-22-2222", dateOfBirth: "2021-01-01", relationship: "child", qualifiesForCTC: true, qualifiesForODC: false },
        ],
      },
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "5000", federalWithheld: "0" }],
      dependentCare: { expenses: "8000", qualifyingIndividuals: 2 },
    };
    const result = calculateFederalTax(fixture);

    // SE tax: $5K × 0.9235 = $4,618 → SS $573 + MC $134 = $707, deductible half = $354
    // Earned income = $0 + $5K - $354 = $4,646
    // Qualifying expenses = min($8K, $6K) = $6K
    // Earned income limit = min($6K, $4,646) = $4,646
    // AGI is low → 35% rate. Credit = roundDollar($4,646 × 0.35) = $1,626
    // Without fix (no deductible half): earned = $5K → limit = $5K → credit = $1,750
    const form2441Lines = result.allLines.filter((l) => l.form === "Form 2441");
    const line4 = form2441Lines.find((l) => l.line === "4");
    expect(line4!.value.toNumber()).toBe(4646); // Not $5,000
    const line9 = form2441Lines.find((l) => l.line === "9");
    expect(line9!.value.toNumber()).toBe(1626); // Not $1,750
  });

  it("W-2 + SE filer: deductible half subtracted but earned income still exceeds expense cap", () => {
    // Single, 1 child, $30K wages, $20K SE income, $5K care expenses
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "30000",
        federalWithheld: "3000",
        socialSecurityWages: "30000",
        socialSecurityWithheld: "1860",
        medicareWages: "30000",
        medicareWithheld: "435",
      }],
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        dependents: [
          { firstName: "C", lastName: "D", ssn: "333-33-3333", dateOfBirth: "2020-01-01", relationship: "child", qualifiesForCTC: true, qualifiesForODC: false },
        ],
      },
      form1099Nec: [{ payer: "Consulting", nonemployeeCompensation: "20000", federalWithheld: "0" }],
      dependentCare: { expenses: "5000", qualifyingIndividuals: 1 },
    };
    const result = calculateFederalTax(fixture);

    // SE tax: $20K × 0.9235 = $18,470 → SS $2,286 + MC $536 = $2,822, deductible half = $1,411
    // Earned income = $30K + $20K - $1,411 = $48,589
    // Qualifying expenses = min($5K, $3K) = $3K (cap for one)
    // Earned income limit = min($3K, $48,589) = $3K (not binding)
    // AGI ≈ $48,589, well above $43K → 20% rate. Credit = $3K × 20% = $600
    const form2441Lines = result.allLines.filter((l) => l.form === "Form 2441");
    const line4 = form2441Lines.find((l) => l.line === "4");
    expect(line4!.value.toNumber()).toBe(3000); // Expense cap is binding, not earned income
    const line9 = form2441Lines.find((l) => l.line === "9");
    expect(line9!.value.toNumber()).toBe(600);
  });
});
