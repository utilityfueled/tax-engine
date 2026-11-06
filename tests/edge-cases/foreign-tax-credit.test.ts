/**
 * Edge case tests for Form 1116 Foreign Tax Credit through federal pipeline.
 * Tests limitation calculation, simplified method, and carryforward.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm1116, isSimplifiedEligible } from "@/engine/forms/form-1116.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

/** Helper to create a 1099-DIV with foreign tax */
function makeForeignDiv(overrides: {
  payer?: string;
  ordinaryDividends?: string;
  qualifiedDividends?: string;
  totalCapitalGainDistributions?: string;
  foreignTaxPaid?: string;
  foreignCountry?: string;
}) {
  return {
    payer: overrides.payer ?? "Intl Fund",
    ordinaryDividends: overrides.ordinaryDividends ?? "5000",
    qualifiedDividends: overrides.qualifiedDividends ?? "0",
    totalCapitalGainDistributions: overrides.totalCapitalGainDistributions ?? "0",
    federalWithheld: "0",
    foreignTaxPaid: overrides.foreignTaxPaid ?? "0",
    foreignCountry: overrides.foreignCountry ?? "Various",
    section1250Gain: "0",
    section1202Gain: "0",
    collectiblesGain: "0",
    nondividendDistributions: "0",
    exemptInterestDividends: "0",
  };
}

// ═══════════════════════════════════════════════════════════
// Simplified Method Eligibility
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - simplified method eligibility", () => {
  it("single: eligible when foreign tax ≤ $300", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "Intl Fund",
        ordinaryDividends: "5000",
        qualifiedDividends: "3000",
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
    };
    expect(isSimplifiedEligible(fixture, "single")).toBe(true);
  });

  it("single: NOT eligible when foreign tax > $300", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "Intl Fund",
        ordinaryDividends: "50000",
        qualifiedDividends: "30000",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "500",
        foreignCountry: "Various",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
    };
    expect(isSimplifiedEligible(fixture, "single")).toBe(false);
  });

  it("MFJ: $600 threshold (double single)", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "Intl Fund",
        ordinaryDividends: "30000",
        qualifiedDividends: "20000",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "550",
        foreignCountry: "Various",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
    };
    expect(isSimplifiedEligible(fixture, "married_filing_jointly")).toBe(true);
    expect(isSimplifiedEligible(fixture, "single")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// Limitation Calculation
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - credit limitation", () => {
  it("credit limited when foreign tax exceeds limitation", () => {
    const result = calculateForm1116({
      foreignSourceIncome: d(10000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(5000),
      filingStatus: "single",
    });
    // Limitation = $15K × ($10K / $100K) = $1,500
    // Credit = min($5K, $1.5K) = $1,500
    expect(result.limitation.toNumber()).toBe(1500);
    expect(result.creditAllowed.toNumber()).toBe(1500);
    // Carryforward: $5K - $1.5K = $3,500
    expect(result.carryforward.toNumber()).toBe(3500);
  });

  it("credit equals tax paid when under limitation", () => {
    const result = calculateForm1116({
      foreignSourceIncome: d(50000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(20000),
      foreignTaxesPaid: d(2000),
      filingStatus: "single",
    });
    // Limitation = $20K × ($50K / $100K) = $10,000
    // Credit = min($2K, $10K) = $2,000
    expect(result.creditAllowed.toNumber()).toBe(2000);
    expect(result.carryforward.toNumber()).toBe(0);
  });

  it("zero taxable income: zero limitation", () => {
    const result = calculateForm1116({
      foreignSourceIncome: d(5000),
      totalTaxableIncome: d(0),
      taxBeforeCredits: d(0),
      foreignTaxesPaid: d(500),
      filingStatus: "single",
    });
    expect(result.limitation.toNumber()).toBe(0);
    expect(result.creditAllowed.toNumber()).toBe(0);
    expect(result.carryforward.toNumber()).toBe(500);
  });

  it("foreign source income exceeds taxable: ratio capped at 1", () => {
    const result = calculateForm1116({
      foreignSourceIncome: d(200000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(20000),
      filingStatus: "single",
    });
    // Ratio = min(200K/100K, 1) = 1 → limitation = $15K
    expect(result.limitation.toNumber()).toBe(15000);
    expect(result.creditAllowed.toNumber()).toBe(15000);
  });
});

// ═══════════════════════════════════════════════════════════
// Carryforward
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - carryforward", () => {
  it("prior year carryforward adds to available credit", () => {
    const result = calculateForm1116({
      foreignSourceIncome: d(20000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(1000),
      filingStatus: "single",
      priorYearCarryforward: d(500),
    });
    // Taxes paid: $1,000 + $500 carryforward = $1,500
    // Limitation = $15K × ($20K / $100K) = $3,000
    // Credit = min($1,500, $3,000) = $1,500
    expect(result.foreignTaxesPaidPlusCarryforward.toNumber()).toBe(1500);
    expect(result.creditAllowed.toNumber()).toBe(1500);
    expect(result.carryforward.toNumber()).toBe(0);
  });

  it("carryforward still limited", () => {
    const result = calculateForm1116({
      foreignSourceIncome: d(5000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(1000),
      filingStatus: "single",
      priorYearCarryforward: d(2000),
    });
    // Taxes: $1K + $2K = $3K
    // Limitation = $15K × ($5K / $100K) = $750
    // Credit = min($3K, $750) = $750
    expect(result.creditAllowed.toNumber()).toBe(750);
    expect(result.carryforward.toNumber()).toBe(2250);
  });
});

// ═══════════════════════════════════════════════════════════
// Federal Pipeline Integration
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - federal pipeline", () => {
  it("small foreign tax correctly limited in federal return", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "Intl Fund",
        ordinaryDividends: "8000",
        qualifiedDividends: "6000",
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
    };
    const federal = calculateFederalTax(fixture);
    // $200 foreign tax should be fully creditable (small amount relative to income)
    expect(federal.foreignTaxCredit.toNumber()).toBe(200);
  });

  it("no foreign tax: zero credit, no Form 1116 lines", () => {
    const federal = calculateFederalTax(simpleW2Fixture);
    expect(federal.foreignTaxCredit.toNumber()).toBe(0);
    const form1116Lines = federal.allLines.filter((l) => l.form === "Form 1116");
    expect(form1116Lines.length).toBe(0);
  });

  it("FTC carryforward surfaces in federal carryforwards output", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "Intl Fund",
        ordinaryDividends: "1000",
        qualifiedDividends: "0",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "500",
        foreignCountry: "Various",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
    };
    const federal = calculateFederalTax(fixture);
    // $500 foreign tax paid, but limitation = tax × ($1K / taxableIncome) is small
    // So most of the $500 carries forward
    expect(federal.carryforwards.foreignTaxCreditCarryforward.toNumber()).toBeGreaterThan(0);
    // Credit + carryforward should equal total foreign tax paid
    const totalFTC = federal.foreignTaxCredit.plus(federal.carryforwards.foreignTaxCreditCarryforward);
    expect(totalFTC.toNumber()).toBe(500);
  });

  it("no foreign tax: zero carryforward", () => {
    const federal = calculateFederalTax(simpleW2Fixture);
    expect(federal.carryforwards.foreignTaxCreditCarryforward.toNumber()).toBe(0);
  });

  it("multiple 1099-DIVs with foreign tax aggregate correctly", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [
        {
          payer: "Fund A",
          ordinaryDividends: "5000",
          qualifiedDividends: "3000",
          totalCapitalGainDistributions: "0",
          federalWithheld: "0",
          foreignTaxPaid: "100",
          foreignCountry: "Various",
          section1250Gain: "0",
          section1202Gain: "0",
          collectiblesGain: "0",
          nondividendDistributions: "0",
          exemptInterestDividends: "0",
        },
        {
          payer: "Fund B",
          ordinaryDividends: "3000",
          qualifiedDividends: "2000",
          totalCapitalGainDistributions: "0",
          federalWithheld: "0",
          foreignTaxPaid: "75",
          foreignCountry: "UK",
          section1250Gain: "0",
          section1202Gain: "0",
          collectiblesGain: "0",
          nondividendDistributions: "0",
          exemptInterestDividends: "0",
        },
      ],
    };
    const federal = calculateFederalTax(fixture);
    // Total foreign tax: $175, should be fully creditable
    expect(federal.foreignTaxCredit.toNumber()).toBe(175);
  });
});

// ═══════════════════════════════════════════════════════════
// Boundary / Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - boundary: simplified threshold", () => {
  it("single: eligible when foreign tax is exactly $300 (at limit)", () => {
    // Boundary: $300 exactly should still qualify (≤ not <)
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "Intl Fund",
        ordinaryDividends: "10000",
        qualifiedDividends: "8000",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "300",
        foreignCountry: "Various",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
    };
    expect(isSimplifiedEligible(fixture, "single")).toBe(true);
    // calculateForm1116 also marks simplified eligible at exactly $300
    const result = calculateForm1116({
      foreignSourceIncome: d(10000),
      totalTaxableIncome: d(85000),
      taxBeforeCredits: d(14000),
      foreignTaxesPaid: d(300),
      filingStatus: "single",
    });
    expect(result.simplifiedEligible).toBe(true);
  });

  it("single: NOT eligible when foreign tax is $301 (just over limit)", () => {
    // One dollar over the $300 threshold disqualifies simplified method
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "Intl Fund",
        ordinaryDividends: "10000",
        qualifiedDividends: "8000",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "301",
        foreignCountry: "Various",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
    };
    expect(isSimplifiedEligible(fixture, "single")).toBe(false);
    const result = calculateForm1116({
      foreignSourceIncome: d(10000),
      totalTaxableIncome: d(85000),
      taxBeforeCredits: d(14000),
      foreignTaxesPaid: d(301),
      filingStatus: "single",
    });
    expect(result.simplifiedEligible).toBe(false);
  });

  it("MFS: threshold is $300 (same as single, not $150)", () => {
    // IRC and IRS instructions: MFS uses $300 threshold (same as single),
    // NOT half of the MFJ $600 amount.
    const atThreshold: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_separately" },
      form1099Div: [{
        payer: "Intl Fund",
        ordinaryDividends: "10000",
        qualifiedDividends: "8000",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "300",
        foreignCountry: "Various",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
    };
    // $300 is at the MFS limit — eligible
    expect(isSimplifiedEligible(atThreshold, "married_filing_separately")).toBe(true);
    // $301 exceeds the MFS limit — not eligible
    const overThreshold: TaxYearInput = {
      ...atThreshold,
      form1099Div: [{
        ...atThreshold.form1099Div[0],
        foreignTaxPaid: "301",
      }],
    };
    expect(isSimplifiedEligible(overThreshold, "married_filing_separately")).toBe(false);
  });
});

describe("Form 1116 - limitation: extreme income ratios", () => {
  it("90% foreign source income: limitation is ~90% of US tax", () => {
    // When nearly all income is foreign, the limitation approaches 100% of US tax
    const result = calculateForm1116({
      foreignSourceIncome: d(90000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(20000),
      foreignTaxesPaid: d(25000),
      filingStatus: "single",
    });
    // Limitation = $20K × ($90K / $100K) = $18,000
    expect(result.limitation.toNumber()).toBe(18000);
    expect(result.creditAllowed.toNumber()).toBe(18000);
    expect(result.carryforward.toNumber()).toBe(7000);
  });

  it("zero foreign source income: limitation is zero regardless of taxes paid", () => {
    // If there is no foreign-source income, there is nothing to base the limitation on
    const result = calculateForm1116({
      foreignSourceIncome: d(0),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(20000),
      foreignTaxesPaid: d(1000),
      filingStatus: "single",
    });
    expect(result.limitation.toNumber()).toBe(0);
    expect(result.creditAllowed.toNumber()).toBe(0);
    // All paid taxes carry forward since none could be credited
    expect(result.carryforward.toNumber()).toBe(1000);
  });
});

describe("Form 1116 - carryforward: large prior year + small current tax", () => {
  it("large carryforward with small current limitation: excess re-carries", () => {
    // Scenario: $5,000 carryforward from prior year, but current year limitation is only $300
    // Credit = min($5K + $200 current, $300 limitation) = $300
    // New carryforward = $5,200 - $300 = $4,900
    const result = calculateForm1116({
      foreignSourceIncome: d(2000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(200),
      filingStatus: "single",
      priorYearCarryforward: d(5000),
    });
    // Limitation = $15K × ($2K / $100K) = $300
    expect(result.limitation.toNumber()).toBe(300);
    // Total available = $200 + $5,000 = $5,200
    expect(result.foreignTaxesPaidPlusCarryforward.toNumber()).toBe(5200);
    // Credit = min($5,200, $300) = $300
    expect(result.creditAllowed.toNumber()).toBe(300);
    // Remaining carryforward = $5,200 - $300 = $4,900
    expect(result.carryforward.toNumber()).toBe(4900);
  });
});

describe("Form 1116 - audit trail completeness", () => {
  it("all required Form 1116 lines are present in audit output", () => {
    const result = calculateForm1116({
      foreignSourceIncome: d(15000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(18000),
      foreignTaxesPaid: d(2000),
      filingStatus: "single",
    });
    const lineIds = result.lines.map((l) => l.line);
    // Every substantive line in Form 1116 must appear
    expect(lineIds).toContain("simplified_eligible");
    expect(lineIds).toContain("1a");
    expect(lineIds).toContain("3e");
    expect(lineIds).toContain("3f");
    expect(lineIds).toContain("7");
    expect(lineIds).toContain("20");
    expect(lineIds).toContain("21");
    expect(lineIds).toContain("carryforward");
    // All lines must be attributed to Form 1116
    const nonForm1116Lines = result.lines.filter((l) => l.form !== "Form 1116");
    expect(nonForm1116Lines).toHaveLength(0);
  });
});

describe("Form 1116 - federal pipeline: FTC reduces total tax", () => {
  it("FTC reduces totalTaxBeforeCredits in federal return by the credited amount", () => {
    // Build a fixture with a meaningful foreign tax credit that is fully creditable
    const withFTC: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "Global Fund",
        ordinaryDividends: "20000",
        qualifiedDividends: "15000",
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
    };
    const withoutFTC: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "Global Fund",
        ordinaryDividends: "20000",
        qualifiedDividends: "15000",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "0",
        foreignCountry: "Various",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
    };
    const resultWith = calculateFederalTax(withFTC);
    const resultWithout = calculateFederalTax(withoutFTC);
    // The FTC should equal exactly $250 (within limitation)
    expect(resultWith.foreignTaxCredit.toNumber()).toBe(250);
    // Tax after credits must be lower by the credit amount
    const taxDiff = resultWithout.totalTax.minus(resultWith.totalTax);
    expect(taxDiff.toNumber()).toBe(250);
    // Also verify Form 1116 lines appear in allLines when FTC is present
    const form1116Lines = resultWith.allLines.filter((l) => l.form === "Form 1116");
    expect(form1116Lines.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Credit Exactly Equal to Limitation (spec Line 21)
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - credit exactly equals limitation", () => {
  it("Line 21: credit equals limitation when foreign tax paid == limitation exactly", () => {
    // Construct so limitation = foreignTaxesPaid exactly
    // Limitation = $20K × ($25K / $100K) = $5,000
    // Foreign taxes paid = $5,000 → credit = $5,000, carryforward = $0
    const result = calculateForm1116({
      foreignSourceIncome: d(25000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(20000),
      foreignTaxesPaid: d(5000),
      filingStatus: "single",
    });
    expect(result.limitation.toNumber()).toBe(5000);
    expect(result.creditAllowed.toNumber()).toBe(5000);
    expect(result.carryforward.toNumber()).toBe(0);
    // Verify credit == limitation == taxes paid (all three equal)
    expect(result.creditAllowed.equals(result.limitation)).toBe(true);
    expect(result.creditAllowed.equals(result.foreignTaxesPaidPlusCarryforward)).toBe(true);
  });

  it("Line 21: exact match with carryforward included", () => {
    // Limitation = $15K × ($30K / $100K) = $4,500
    // Current taxes = $3,000, carryforward = $1,500 → total = $4,500 = limitation
    const result = calculateForm1116({
      foreignSourceIncome: d(30000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(3000),
      filingStatus: "single",
      priorYearCarryforward: d(1500),
    });
    expect(result.limitation.toNumber()).toBe(4500);
    expect(result.foreignTaxesPaidPlusCarryforward.toNumber()).toBe(4500);
    expect(result.creditAllowed.toNumber()).toBe(4500);
    expect(result.carryforward.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Credit Capped at Limitation (spec Line 21)
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - credit capped at limitation", () => {
  it("Line 21: high foreign tax rate (40%) capped by US limitation", () => {
    // Foreign income $50K taxed at 40% abroad = $20K foreign tax
    // Limitation = $18K × ($50K / $100K) = $9,000
    // Credit = min($20K, $9K) = $9,000; carryforward = $11,000
    const result = calculateForm1116({
      foreignSourceIncome: d(50000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(18000),
      foreignTaxesPaid: d(20000),
      filingStatus: "single",
    });
    expect(result.limitation.toNumber()).toBe(9000);
    expect(result.creditAllowed.toNumber()).toBe(9000);
    expect(result.carryforward.toNumber()).toBe(11000);
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple Countries with Different Tax Rates
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - multiple countries with different tax rates", () => {
  it("pipeline aggregates foreign tax from multiple 1099-DIVs with different countries", () => {
    // UK fund: high tax, Germany fund: medium tax, Japan fund: low tax
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [
        makeForeignDiv({ payer: "UK Fund", ordinaryDividends: "10000", foreignTaxPaid: "150", foreignCountry: "UK" }),
        makeForeignDiv({ payer: "Germany Fund", ordinaryDividends: "8000", foreignTaxPaid: "100", foreignCountry: "DE" }),
        makeForeignDiv({ payer: "Japan Fund", ordinaryDividends: "5000", foreignTaxPaid: "35", foreignCountry: "JP" }),
      ],
    };
    const federal = calculateFederalTax(fixture);
    // Total foreign tax: $150 + $100 + $35 = $285
    expect(federal.foreignTaxCredit.toNumber()).toBe(285);
    expect(federal.carryforwards.foreignTaxCreditCarryforward.toNumber()).toBe(0);
  });

  it("pipeline: multiple countries aggregate but exceed limitation", () => {
    // Small base income, large foreign dividends with high taxes
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "20000",
        federalWithheld: "1500",
        socialSecurityWages: "20000",
        socialSecurityWithheld: "1240",
        medicareWages: "20000",
        medicareWithheld: "290",
      }],
      form1099Div: [
        makeForeignDiv({ payer: "UK Fund", ordinaryDividends: "2000", foreignTaxPaid: "400", foreignCountry: "UK" }),
        makeForeignDiv({ payer: "DE Fund", ordinaryDividends: "1500", foreignTaxPaid: "350", foreignCountry: "DE" }),
      ],
    };
    const federal = calculateFederalTax(fixture);
    // Total foreign tax: $750, but limitation will be much less on low income
    // Credit + carryforward must equal $750
    const totalFTC = federal.foreignTaxCredit.plus(federal.carryforwards.foreignTaxCreditCarryforward);
    expect(totalFTC.toNumber()).toBe(750);
    expect(federal.foreignTaxCredit.toNumber()).toBeLessThan(750);
    expect(federal.carryforwards.foreignTaxCreditCarryforward.toNumber()).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Very High Foreign Income Ratio (90%+ of Total)
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - very high foreign income ratio", () => {
  it("Line 20: 95% foreign source income yields limitation ~95% of US tax", () => {
    const result = calculateForm1116({
      foreignSourceIncome: d(95000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(20000),
      foreignTaxesPaid: d(30000),
      filingStatus: "single",
    });
    // Limitation = $20K × ($95K / $100K) = $19,000
    expect(result.limitation.toNumber()).toBe(19000);
    expect(result.creditAllowed.toNumber()).toBe(19000);
    expect(result.carryforward.toNumber()).toBe(11000);
  });

  it("Line 20: 99% foreign source income", () => {
    const result = calculateForm1116({
      foreignSourceIncome: d(99000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(20000),
      foreignTaxesPaid: d(25000),
      filingStatus: "single",
    });
    // Limitation = $20K × ($99K / $100K) = $19,800
    expect(result.limitation.toNumber()).toBe(19800);
    expect(result.creditAllowed.toNumber()).toBe(19800);
    expect(result.carryforward.toNumber()).toBe(5200);
  });

  it("Line 20: 100% foreign source income — ratio capped at 1", () => {
    const result = calculateForm1116({
      foreignSourceIncome: d(100000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(20000),
      foreignTaxesPaid: d(20000),
      filingStatus: "single",
    });
    // Ratio capped at 1; limitation = $20K; credit = min($20K, $20K) = $20K
    expect(result.limitation.toNumber()).toBe(20000);
    expect(result.creditAllowed.toNumber()).toBe(20000);
    expect(result.carryforward.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Very Low Foreign Income Ratio (<1% of Total)
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - very low foreign income ratio", () => {
  it("Line 20: <1% foreign income yields very small limitation", () => {
    // Foreign income is $500 out of $100K = 0.5%
    const result = calculateForm1116({
      foreignSourceIncome: d(500),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(200),
      filingStatus: "single",
    });
    // Limitation = $15K × ($500 / $100K) = $75
    expect(result.limitation.toNumber()).toBe(75);
    expect(result.creditAllowed.toNumber()).toBe(75);
    expect(result.carryforward.toNumber()).toBe(125);
  });

  it("Line 20: tiny foreign income ($100 of $500K) produces near-zero limitation", () => {
    const result = calculateForm1116({
      foreignSourceIncome: d(100),
      totalTaxableIncome: d(500000),
      taxBeforeCredits: d(120000),
      foreignTaxesPaid: d(50),
      filingStatus: "single",
    });
    // Limitation = $120K × ($100 / $500K) = $24
    expect(result.limitation.toNumber()).toBe(24);
    expect(result.creditAllowed.toNumber()).toBe(24);
    expect(result.carryforward.toNumber()).toBe(26);
  });
});

// ═══════════════════════════════════════════════════════════
// Zero US Tax Liability (spec Line 20 edge case)
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - zero US tax liability", () => {
  it("Line 20: zero US tax before credits means zero limitation regardless of foreign income", () => {
    const result = calculateForm1116({
      foreignSourceIncome: d(50000),
      totalTaxableIncome: d(50000),
      taxBeforeCredits: d(0),
      foreignTaxesPaid: d(3000),
      filingStatus: "single",
    });
    // If there is no US tax, limitation formula = $0 × ratio = $0
    expect(result.limitation.toNumber()).toBe(0);
    expect(result.creditAllowed.toNumber()).toBe(0);
    expect(result.carryforward.toNumber()).toBe(3000);
  });

  it("Line 20: very small US tax ($1) still produces a nonzero limitation", () => {
    const result = calculateForm1116({
      foreignSourceIncome: d(50000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(1),
      foreignTaxesPaid: d(500),
      filingStatus: "single",
    });
    // Limitation = $1 × ($50K / $100K) = $0.50 → rounds to $1
    expect(result.limitation.toNumber()).toBe(1);
    expect(result.creditAllowed.toNumber()).toBe(1);
    expect(result.carryforward.toNumber()).toBe(499);
  });
});

// ═══════════════════════════════════════════════════════════
// AMT Interaction (spec Form 6251 + Form 1116)
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - AMT interaction in federal pipeline", () => {
  it("FTC does not reduce AMT — AMT is computed independently", () => {
    // FTC reduces regular tax but AMT is computed separately
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [makeForeignDiv({
        ordinaryDividends: "15000",
        qualifiedDividends: "10000",
        foreignTaxPaid: "200",
      })],
    };
    const federal = calculateFederalTax(fixture);
    // AMT should be independent (usually zero for standard income levels)
    // but confirm FTC and AMT are separately tracked
    expect(federal.foreignTaxCredit.toNumber()).toBe(200);
    expect(federal.amt).toBeInstanceOf(Decimal);
    // totalTax = taxAfterCredits + AMT + other additional taxes
    // FTC is reflected in totalCredits, AMT is additive
    expect(federal.totalCredits.gte(federal.foreignTaxCredit)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Filing Status Impact on FTC
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - MFS filing status", () => {
  it("MFS: FTC limitation uses MFS taxable income (not joint)", () => {
    // MFS filer with foreign income
    const result = calculateForm1116({
      foreignSourceIncome: d(10000),
      totalTaxableIncome: d(60000),
      taxBeforeCredits: d(8000),
      foreignTaxesPaid: d(2000),
      filingStatus: "married_filing_separately",
    });
    // Limitation = $8K × ($10K / $60K) = $1,333
    expect(result.limitation.toNumber()).toBe(1333);
    expect(result.creditAllowed.toNumber()).toBe(1333);
    expect(result.carryforward.toNumber()).toBe(667);
  });

  it("MFS: simplified threshold is $300 (not $150 or $600)", () => {
    // Verify MFS uses $300 threshold at the calculateForm1116 level
    const atThreshold = calculateForm1116({
      foreignSourceIncome: d(10000),
      totalTaxableIncome: d(60000),
      taxBeforeCredits: d(8000),
      foreignTaxesPaid: d(300),
      filingStatus: "married_filing_separately",
    });
    expect(atThreshold.simplifiedEligible).toBe(true);

    const overThreshold = calculateForm1116({
      foreignSourceIncome: d(10000),
      totalTaxableIncome: d(60000),
      taxBeforeCredits: d(8000),
      foreignTaxesPaid: d(301),
      filingStatus: "married_filing_separately",
    });
    expect(overThreshold.simplifiedEligible).toBe(false);
  });

  it("MFS pipeline: FTC correctly computed for MFS filer", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately",
        spouse: {
          firstName: "John",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1988-05-20",
        },
      },
      form1099Div: [makeForeignDiv({
        ordinaryDividends: "8000",
        foreignTaxPaid: "150",
      })],
    };
    const federal = calculateFederalTax(fixture);
    // $150 foreign tax should be fully creditable (small relative to income)
    expect(federal.foreignTaxCredit.toNumber()).toBe(150);
  });
});

// ═══════════════════════════════════════════════════════════
// Carryforward / Carryback Scenarios (spec Line carryforward)
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - carryforward scenarios", () => {
  it("carryforward: prior year carryforward fully absorbed by large limitation", () => {
    // Large limitation absorbs both current + prior year
    const result = calculateForm1116({
      foreignSourceIncome: d(80000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(20000),
      foreignTaxesPaid: d(5000),
      filingStatus: "single",
      priorYearCarryforward: d(3000),
    });
    // Limitation = $20K × ($80K / $100K) = $16,000
    // Total taxes = $5K + $3K = $8K
    // Credit = min($8K, $16K) = $8K
    expect(result.limitation.toNumber()).toBe(16000);
    expect(result.foreignTaxesPaidPlusCarryforward.toNumber()).toBe(8000);
    expect(result.creditAllowed.toNumber()).toBe(8000);
    expect(result.carryforward.toNumber()).toBe(0);
  });

  it("carryforward: zero current year foreign tax with prior year carryforward", () => {
    // No current year foreign tax, but carryforward from prior year
    const result = calculateForm1116({
      foreignSourceIncome: d(20000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(0),
      filingStatus: "single",
      priorYearCarryforward: d(2000),
    });
    // Limitation = $15K × ($20K / $100K) = $3,000
    // Total taxes = $0 + $2K = $2K
    // Credit = min($2K, $3K) = $2K
    expect(result.foreignTaxesPaidPlusCarryforward.toNumber()).toBe(2000);
    expect(result.creditAllowed.toNumber()).toBe(2000);
    expect(result.carryforward.toNumber()).toBe(0);
  });

  it("pipeline: prior year FTC carryforward flows through federal return", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [makeForeignDiv({
        ordinaryDividends: "10000",
        foreignTaxPaid: "100",
      })],
      priorYear: {
        foreignTaxCreditCarryforward: "500",
      },
    };
    const federal = calculateFederalTax(fixture);
    // Total available = $100 current + $500 carryforward = $600
    // Limitation is based on $10K foreign income / taxable income
    // Credit + new carryforward = $600
    const totalFTC = federal.foreignTaxCredit.plus(federal.carryforwards.foreignTaxCreditCarryforward);
    expect(totalFTC.toNumber()).toBe(600);
  });
});

// ═══════════════════════════════════════════════════════════
// Foreign Source Capital Gains
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - foreign source capital gains", () => {
  it("pipeline: 1099-DIV capital gain distributions with foreign tax", () => {
    // Fund has both ordinary dividends and capital gain distributions with foreign tax
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [makeForeignDiv({
        payer: "Intl Growth Fund",
        ordinaryDividends: "5000",
        totalCapitalGainDistributions: "3000",
        foreignTaxPaid: "120",
      })],
    };
    const federal = calculateFederalTax(fixture);
    // $120 in foreign tax should be creditable
    expect(federal.foreignTaxCredit.toNumber()).toBe(120);
    // Capital gains are included in taxable income
    expect(federal.capitalGainLoss.toNumber()).toBeGreaterThanOrEqual(3000);
  });
});

// ═══════════════════════════════════════════════════════════
// Foreign Source Qualified Dividends
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - foreign source qualified dividends", () => {
  it("pipeline: qualified dividends from foreign source taxed at preferential rate", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [makeForeignDiv({
        payer: "Intl Dividend Fund",
        ordinaryDividends: "12000",
        qualifiedDividends: "10000",
        foreignTaxPaid: "180",
      })],
    };
    const federal = calculateFederalTax(fixture);
    // $180 should be fully creditable
    expect(federal.foreignTaxCredit.toNumber()).toBe(180);
    // Qualified dividends should flow through
    expect(federal.qualifiedDividends.gte(d(10000))).toBe(true);
  });

  it("pipeline: large qualified foreign dividends — FTC limited by lower effective rate", () => {
    // High qualified dividends taxed at lower rate means lower US tax on that income
    // This can cause the FTC limitation to be tighter
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [makeForeignDiv({
        payer: "Intl High Div Fund",
        ordinaryDividends: "40000",
        qualifiedDividends: "35000",
        foreignTaxPaid: "4000",
      })],
    };
    const federal = calculateFederalTax(fixture);
    // Total FTC (credit + carryforward) should equal taxes paid
    const totalFTC = federal.foreignTaxCredit.plus(federal.carryforwards.foreignTaxCreditCarryforward);
    expect(totalFTC.toNumber()).toBe(4000);
  });
});

// ═══════════════════════════════════════════════════════════
// $300/$600 Simplified Election Threshold (spec simplified_eligible)
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - simplified election threshold boundary", () => {
  it("MFJ: eligible at exactly $600", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [makeForeignDiv({
        ordinaryDividends: "20000",
        foreignTaxPaid: "600",
      })],
    };
    expect(isSimplifiedEligible(fixture, "married_filing_jointly")).toBe(true);
  });

  it("MFJ: NOT eligible at $601", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [makeForeignDiv({
        ordinaryDividends: "20000",
        foreignTaxPaid: "601",
      })],
    };
    expect(isSimplifiedEligible(fixture, "married_filing_jointly")).toBe(false);
  });

  it("QSS uses the exact $300 threshold and only MFJ uses $600", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [makeForeignDiv({
        ordinaryDividends: "20000",
        foreignTaxPaid: "300",
      })],
    };
    expect(isSimplifiedEligible(fixture, "qualifying_surviving_spouse")).toBe(true);
    const over: TaxYearInput = {
      ...fixture,
      form1099Div: [makeForeignDiv({
        ordinaryDividends: "20000",
        foreignTaxPaid: "300.01",
      })],
    };
    expect(isSimplifiedEligible(over, "qualifying_surviving_spouse")).toBe(false);
    expect(isSimplifiedEligible({ ...fixture, form1099Div: [makeForeignDiv({ foreignTaxPaid: "600" })] }, "married_filing_jointly")).toBe(true);
    expect(isSimplifiedEligible({ ...fixture, form1099Div: [makeForeignDiv({ foreignTaxPaid: "600.01" })] }, "married_filing_jointly")).toBe(false);
  });

  it("HoH: $300 threshold (same as single)", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [makeForeignDiv({
        ordinaryDividends: "10000",
        foreignTaxPaid: "300",
      })],
    };
    expect(isSimplifiedEligible(fixture, "head_of_household")).toBe(true);
    const over: TaxYearInput = {
      ...fixture,
      form1099Div: [makeForeignDiv({
        ordinaryDividends: "10000",
        foreignTaxPaid: "301",
      })],
    };
    expect(isSimplifiedEligible(over, "head_of_household")).toBe(false);
  });

  it("K-1 foreign tax disqualifies simplified method even if under threshold", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [makeForeignDiv({
        ordinaryDividends: "5000",
        foreignTaxPaid: "50",
      })],
      scheduleK1: [{
        partnershipName: "Foreign LP",
        partnershipEIN: "99-1234567",
        ordinaryIncome: "3000",
        foreignTaxPaid: "25",
        isPassiveActivity: true,
        atRiskAmount: "10000",
      }],
    };
    // Total foreign tax = $75, well under $300 threshold
    // But K-1 foreign tax disqualifies from simplified
    expect(isSimplifiedEligible(fixture, "single")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// General vs Passive Category Income
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - general and passive category", () => {
  it("calculateForm1116 processes passive-only income (dividends)", () => {
    // Passive category: dividends and interest from foreign sources
    const result = calculateForm1116({
      foreignSourceIncome: d(15000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(18000),
      foreignTaxesPaid: d(1500),
      filingStatus: "single",
    });
    // Limitation = $18K × ($15K / $100K) = $2,700
    expect(result.limitation.toNumber()).toBe(2700);
    expect(result.creditAllowed.toNumber()).toBe(1500);
    expect(result.carryforward.toNumber()).toBe(0);
  });

  it("pipeline: K-1 foreign income (general category) aggregates with 1099-DIV (passive)", () => {
    // Mix of general (K-1) and passive (1099-DIV) category income
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [makeForeignDiv({
        ordinaryDividends: "8000",
        foreignTaxPaid: "120",
      })],
      scheduleK1: [{
        partnershipName: "Foreign Biz LP",
        partnershipEIN: "55-9876543",
        ordinaryIncome: "10000",
        foreignTaxPaid: "200",
        isPassiveActivity: false,
        atRiskAmount: "50000",
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Total foreign tax: $120 + $200 = $320
    const totalFTC = federal.foreignTaxCredit.plus(federal.carryforwards.foreignTaxCreditCarryforward);
    expect(totalFTC.toNumber()).toBe(320);
  });
});

// ═══════════════════════════════════════════════════════════
// Prior-Year FTC Carryforward Preservation
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - prior year carryforward when no current-year foreign tax", () => {
  it("pipeline: prior year FTC carryforward preserved when no current-year foreign tax", () => {
    // Taxpayer has $500 prior-year carryforward but no foreign income/tax this year.
    // Per IRS Form 1116 instructions, unused FTC carries forward up to 10 years.
    // The carryforward must not be silently dropped.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      priorYear: {
        foreignTaxCreditCarryforward: "500",
      },
    };
    const federal = calculateFederalTax(fixture);
    // No foreign source income → limitation = $0 → credit = $0
    expect(federal.foreignTaxCredit.toNumber()).toBe(0);
    // Carryforward must be preserved for future years
    expect(federal.carryforwards.foreignTaxCreditCarryforward.toNumber()).toBe(500);
  });

  it("pipeline: prior year FTC carryforward used when current-year has foreign income but no new foreign tax", () => {
    // Taxpayer has $800 carryforward, current year: foreign dividends but $0 tax (treaty-exempt)
    // We approximate: use ordinaryDividends from 1099-DIV with foreignCountry set
    // Even without current tax paid, the carryforward should be preserved
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [makeForeignDiv({
        ordinaryDividends: "5000",
        foreignTaxPaid: "0",
        foreignCountry: "UK",
      })],
      priorYear: {
        foreignTaxCreditCarryforward: "800",
      },
    };
    const federal = calculateFederalTax(fixture);
    // No current-year foreign tax; carryforward should be preserved
    expect(federal.carryforwards.foreignTaxCreditCarryforward.toNumber()).toBe(800);
  });
});

// ═══════════════════════════════════════════════════════════
// Line 3e: Apportioned Deductions (IRS Form 1116 Instructions)
// Per IRS Line 3e Worksheet: apportioned = deduction × (foreign income / AGI)
// This reduces the FTC limitation to prevent overstating foreign source income
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - Line 3e apportioned deductions", () => {
  it("apportioned deductions reduce net foreign source income when deduction/agi provided", () => {
    // AGI $100K, deduction $15K, taxable $85K, foreign $10K, tax $12K
    // apportioned = $15K × ($10K / $100K) = $1,500
    // net foreign = $10K - $1,500 = $8,500
    // limitation = $12K × ($8,500 / $85K) = $1,200
    const result = calculateForm1116({
      foreignSourceIncome: d(10000),
      totalTaxableIncome: d(85000),
      taxBeforeCredits: d(12000),
      foreignTaxesPaid: d(5000),
      filingStatus: "single",
      deductionAmount: d(15000),
      agi: d(100000),
    });
    expect(result.apportionedDeductions.toNumber()).toBe(1500);
    expect(result.netForeignSourceIncome.toNumber()).toBe(8500);
    expect(result.limitation.toNumber()).toBe(1200);
    expect(result.creditAllowed.toNumber()).toBe(1200);
    expect(result.carryforward.toNumber()).toBe(3800);
  });

  it("without deduction/agi: apportioned = 0, limitation overstated", () => {
    // Same scenario but without deduction/agi: old behavior
    const result = calculateForm1116({
      foreignSourceIncome: d(10000),
      totalTaxableIncome: d(85000),
      taxBeforeCredits: d(12000),
      foreignTaxesPaid: d(5000),
      filingStatus: "single",
      // no deductionAmount/agi → apportioned stays 0
    });
    expect(result.apportionedDeductions.toNumber()).toBe(0);
    expect(result.netForeignSourceIncome.toNumber()).toBe(10000);
    // Old (overstated): $12K × ($10K / $85K) = $1,412
    expect(result.limitation.toNumber()).toBe(1412);
    expect(result.creditAllowed.toNumber()).toBe(1412);
  });

  it("apportionment with itemized deduction ($25K) — larger reduction", () => {
    // AGI $200K, itemized deduction $25K, taxable $175K
    // foreign income $50K, foreign taxes $20K, tax before credits $40K
    // apportioned = $25K × ($50K / $200K) = $6,250
    // net foreign = $50K - $6,250 = $43,750
    // limitation = $40K × ($43,750 / $175K) = $10,000
    const result = calculateForm1116({
      foreignSourceIncome: d(50000),
      totalTaxableIncome: d(175000),
      taxBeforeCredits: d(40000),
      foreignTaxesPaid: d(20000),
      filingStatus: "single",
      deductionAmount: d(25000),
      agi: d(200000),
    });
    expect(result.apportionedDeductions.toNumber()).toBe(6250);
    expect(result.netForeignSourceIncome.toNumber()).toBe(43750);
    expect(result.limitation.toNumber()).toBe(10000);
    expect(result.creditAllowed.toNumber()).toBe(10000);
    expect(result.carryforward.toNumber()).toBe(10000);
  });

  it("apportioned deductions do not affect result when limitation does not bind", () => {
    // AGI $100K, deduction $15K, taxable $85K, foreign $10K, tax $12K
    // foreign taxes only $200 — well under any limitation
    const result = calculateForm1116({
      foreignSourceIncome: d(10000),
      totalTaxableIncome: d(85000),
      taxBeforeCredits: d(12000),
      foreignTaxesPaid: d(200),
      filingStatus: "single",
      deductionAmount: d(15000),
      agi: d(100000),
    });
    // limitation = $1,200, but taxes paid = $200 → credit = $200
    expect(result.creditAllowed.toNumber()).toBe(200);
    expect(result.carryforward.toNumber()).toBe(0);
  });

  it("apportionment ratio capped at 1.0 (foreign income > AGI)", () => {
    // Unusual: foreign income $120K but AGI only $100K (losses elsewhere)
    // Ratio = min(120K/100K, 1) = 1.0 → apportioned = $15K × 1.0 = $15K
    const result = calculateForm1116({
      foreignSourceIncome: d(120000),
      totalTaxableIncome: d(85000),
      taxBeforeCredits: d(12000),
      foreignTaxesPaid: d(15000),
      filingStatus: "single",
      deductionAmount: d(15000),
      agi: d(100000),
    });
    expect(result.apportionedDeductions.toNumber()).toBe(15000);
    // net foreign = 120K - 15K = 105K; ratio = min(105K/85K, 1) = 1.0
    expect(result.netForeignSourceIncome.toNumber()).toBe(105000);
    expect(result.limitation.toNumber()).toBe(12000);
  });

  it("zero AGI: apportioned deductions = 0 (no division by zero)", () => {
    const result = calculateForm1116({
      foreignSourceIncome: d(5000),
      totalTaxableIncome: d(0),
      taxBeforeCredits: d(0),
      foreignTaxesPaid: d(500),
      filingStatus: "single",
      deductionAmount: d(15000),
      agi: d(0),
    });
    expect(result.apportionedDeductions.toNumber()).toBe(0);
    expect(result.limitation.toNumber()).toBe(0);
  });

  it("pipeline: apportioned deductions correctly computed through calculateFederalTax", () => {
    // Single filer, $75K wages, $25K foreign dividends with high foreign tax
    // AGI = $75K + $25K = $100K, standard deduction $15K, taxable = $85K
    // Foreign income = $25K (dividends from foreign-paying funds)
    // Apportioned = $15K × ($25K / $100K) = $3,750
    // Net foreign = $25K - $3,750 = $21,250
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "75000",
        federalWithheld: "10000",
        socialSecurityWages: "75000",
        socialSecurityWithheld: "4650",
        medicareWages: "75000",
        medicareWithheld: "1088",
      }],
      form1099Div: [{
        payer: "Intl High Tax Fund",
        ordinaryDividends: "25000",
        qualifiedDividends: "20000",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "8000",
        foreignCountry: "Various",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Credit + carryforward = total foreign tax paid
    const totalFTC = federal.foreignTaxCredit.plus(federal.carryforwards.foreignTaxCreditCarryforward);
    expect(totalFTC.toNumber()).toBe(8000);
    // The FTC should be limited (not full $8K) because limitation < taxes paid
    expect(federal.foreignTaxCredit.toNumber()).toBeLessThan(8000);
    expect(federal.carryforwards.foreignTaxCreditCarryforward.toNumber()).toBeGreaterThan(0);
  });
});
