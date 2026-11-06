/**
 * Tests for Form 1116 — Foreign Tax Credit
 * Spec: spec/federal/form-1116.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateForm1116,
  isSimplifiedEligible,
  estimateForeignSourceIncomeFromScheduleK1,
  type Form1116Input,
} from "@/engine/forms/form-1116.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture, complexMFJFixture } from "../../fixtures/simple-w2.js";

const d = (n: number | string) => new Decimal(n);

function makeInput(overrides?: Partial<Form1116Input>): Form1116Input {
  return {
    foreignSourceIncome: d(0),
    totalTaxableIncome: d(70000),
    taxBeforeCredits: d(8000),
    foreignTaxesPaid: d(0),
    filingStatus: "single",
    currentTaxYear: 2025,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// Simplified Method Eligibility
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - Simplified Method", () => {
  it("simplified threshold uses $300 for surviving spouse and $600 only for a joint return", () => {
    // Spec: form-1116.yaml simplified-joint-threshold. The IRS condition
    // is an actual joint return, not use of the joint tax rate schedule.
    for (const [filingStatus, tax, expected] of [
      ["qualifying_surviving_spouse", "300", true],
      ["qualifying_surviving_spouse", "300.01", false],
      ["qualifying_surviving_spouse", "600", false],
      ["married_filing_jointly", "600", true],
      ["married_filing_jointly", "600.01", false],
    ] as const) {
      const source = { ...simpleW2Fixture, form1099Int: [{
        payer: "Synthetic foreign bank", interestIncome: "1000",
        federalWithheld: "0", foreignTaxPaid: tax, foreignCountry: "Canada",
      }] };
      expect(isSimplifiedEligible(source, filingStatus)).toBe(expected);
      const result = calculateForm1116(makeInput({ filingStatus, foreignTaxesPaid: d(tax) }));
      expect(result.simplifiedEligible).toBe(expected);
      expect(result.lines.find((line) => line.line === "simplified_eligible")?.value.toString())
        .toBe(expected ? "1" : "0");
    }
  });

  it("simplified method - eligible when under threshold", () => {
    // Single filer with $150 foreign tax from 1099-DIV → eligible
    const eligible = isSimplifiedEligible(
      {
        ...simpleW2Fixture,
        form1099Div: [
          {
            payer: "Vanguard",
            ordinaryDividends: "5000",
            qualifiedDividends: "4000",
            foreignTaxPaid: "150",
            foreignCountry: "Various",
            totalCapitalGainDistributions: "0",
            section1250Gain: "0",
            section1202Gain: "0",
            collectiblesGain: "0",
            nondividendDistributions: "0",
            federalWithheld: "0",
            exemptInterestDividends: "0",
          },
        ],
      },
      "single"
    );
    expect(eligible).toBe(true);
  });

  it("simplified method - eligible when 1099-INT foreign tax alone is under threshold", () => {
    const eligible = isSimplifiedEligible(
      {
        ...simpleW2Fixture,
        form1099Int: [
          {
            payer: "Foreign Bank",
            interestIncome: "2000",
            federalWithheld: "0",
            foreignTaxPaid: "150",
            foreignCountry: "Canada",
          },
        ],
      },
      "single"
    );
    expect(eligible).toBe(true);
  });

  it("simplified method - combined 1099-DIV and 1099-INT foreign tax uses the same threshold", () => {
    const eligible = isSimplifiedEligible(
      {
        ...simpleW2Fixture,
        form1099Div: [
          {
            payer: "Vanguard",
            ordinaryDividends: "5000",
            qualifiedDividends: "4000",
            foreignTaxPaid: "200",
            foreignCountry: "Various",
            totalCapitalGainDistributions: "0",
            section1250Gain: "0",
            section1202Gain: "0",
            collectiblesGain: "0",
            nondividendDistributions: "0",
            federalWithheld: "0",
            exemptInterestDividends: "0",
          },
        ],
        form1099Int: [
          {
            payer: "Foreign Bank",
            interestIncome: "2000",
            federalWithheld: "0",
            foreignTaxPaid: "125",
            foreignCountry: "Canada",
          },
        ],
      },
      "single"
    );
    expect(eligible).toBe(false);
  });

  it("simplified method - not eligible when over threshold", () => {
    const eligible = isSimplifiedEligible(
      {
        ...simpleW2Fixture,
        form1099Div: [
          {
            payer: "Vanguard",
            ordinaryDividends: "20000",
            qualifiedDividends: "15000",
            foreignTaxPaid: "500",
            foreignCountry: "Various",
            totalCapitalGainDistributions: "0",
            section1250Gain: "0",
            section1202Gain: "0",
            collectiblesGain: "0",
            nondividendDistributions: "0",
            federalWithheld: "0",
            exemptInterestDividends: "0",
          },
        ],
      },
      "single"
    );
    expect(eligible).toBe(false);
  });

  it("simplified method - MFJ has $600 threshold", () => {
    const eligible = isSimplifiedEligible(
      {
        ...complexMFJFixture,
        form1099Div: [
          {
            payer: "Vanguard",
            ordinaryDividends: "10000",
            qualifiedDividends: "8000",
            foreignTaxPaid: "500",
            foreignCountry: "Various",
            totalCapitalGainDistributions: "0",
            section1250Gain: "0",
            section1202Gain: "0",
            collectiblesGain: "0",
            nondividendDistributions: "0",
            federalWithheld: "0",
            exemptInterestDividends: "0",
          },
        ],
      },
      "married_filing_jointly"
    );
    expect(eligible).toBe(true);
  });
  it("simplified method - not eligible with K-1 foreign tax", () => {
    const eligible = isSimplifiedEligible(
      {
        ...simpleW2Fixture,
        form1099Div: [{
          payer: "Vanguard",
          ordinaryDividends: "5000",
          qualifiedDividends: "4000",
          foreignTaxPaid: "100",
          foreignCountry: "Various",
          totalCapitalGainDistributions: "0",
          section1250Gain: "0",
          section1202Gain: "0",
          collectiblesGain: "0",
          nondividendDistributions: "0",
          federalWithheld: "0",
          exemptInterestDividends: "0",
        }],
        scheduleK1: [{
          partnershipName: "Foreign Fund LP",
          partnershipEIN: "99-1234567",
          ordinaryIncome: "10000",
          foreignTaxPaid: "200",
          isPassiveActivity: true,
        }],
      },
      "single"
    );
    // K-1 foreign tax disqualifies from simplified method
    expect(eligible).toBe(false);
  });

  it("simplified method - eligible with K-1 but no K-1 foreign tax", () => {
    const eligible = isSimplifiedEligible(
      {
        ...simpleW2Fixture,
        form1099Div: [{
          payer: "Vanguard",
          ordinaryDividends: "5000",
          qualifiedDividends: "4000",
          foreignTaxPaid: "100",
          foreignCountry: "Various",
          totalCapitalGainDistributions: "0",
          section1250Gain: "0",
          section1202Gain: "0",
          collectiblesGain: "0",
          nondividendDistributions: "0",
          federalWithheld: "0",
          exemptInterestDividends: "0",
        }],
        scheduleK1: [{
          partnershipName: "Domestic Fund LP",
          partnershipEIN: "99-1234567",
          ordinaryIncome: "10000",
          foreignTaxPaid: "0",
          isPassiveActivity: true,
        }],
      },
      "single"
    );
    // No K-1 foreign tax → still eligible if 1099-DIV is under threshold
    expect(eligible).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Full Form 1116 Calculation
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - Credit Calculation", () => {
  it("Form 1116 Line 1a - foreign source income", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(5000),
    }));
    expect(result.foreignSourceIncome.toNumber()).toBe(5000);
  });

  it("Form 1116 Line 3e - apportioned deductions without agi/deduction inputs", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(5000),
    }));
    // Without deductionAmount/agi: apportioned = 0
    expect(result.apportionedDeductions.toNumber()).toBe(0);
  });

  it("Form 1116 Line 3e - apportioned deductions with agi/deduction inputs", () => {
    // IRS Line 3e Worksheet: apportioned = deduction × (foreign / AGI)
    // deduction $15K, foreign $5K, AGI $85K → $15K × ($5K / $85K) = $882
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(5000),
      deductionAmount: d(15000),
      agi: d(85000),
    }));
    expect(result.apportionedDeductions.toNumber()).toBe(882);
    expect(result.netForeignSourceIncome.toNumber()).toBe(4118);
  });

  it("Form 1116 Line 3f - net foreign source income", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(5000),
    }));
    expect(result.netForeignSourceIncome.toNumber()).toBe(5000);
  });

  it("Form 1116 Line 7 - total foreign taxes", () => {
    const result = calculateForm1116(makeInput({
      foreignTaxesPaid: d(300),
    }));
    expect(result.foreignTaxesPaid.toNumber()).toBe(300);
  });

  it("Form 1116 Line 7 - includes carryforward in total", () => {
    const result = calculateForm1116(makeInput({
      foreignTaxesPaid: d(300),
      priorYearCarryforward: d(100),
    }));
    expect(result.foreignTaxesPaid.toNumber()).toBe(300);
    expect(result.foreignTaxesPaidPlusCarryforward.toNumber()).toBe(400);
  });

  it("Form 1116 Line 20 - limitation ratio", () => {
    // $5K foreign income / $70K taxable = 7.14%
    // $8K tax × 7.14% = $571
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(5000),
      totalTaxableIncome: d(70000),
      taxBeforeCredits: d(8000),
      foreignTaxesPaid: d(300),
    }));
    expect(result.limitation.toNumber()).toBe(571);
  });

  it("Form 1116 Line 20 - limitation is 0 when no foreign income", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(0),
      foreignTaxesPaid: d(300),
    }));
    expect(result.limitation.toNumber()).toBe(0);
  });

  it("Form 1116 Line 20 - limitation is 0 when no taxable income", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(5000),
      totalTaxableIncome: d(0),
      taxBeforeCredits: d(0),
      foreignTaxesPaid: d(300),
    }));
    expect(result.limitation.toNumber()).toBe(0);
  });

  it("Form 1116 Line 21 - credit allowed limited by taxes paid", () => {
    // Limitation is $571, taxes paid only $300 → credit = $300
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(5000),
      totalTaxableIncome: d(70000),
      taxBeforeCredits: d(8000),
      foreignTaxesPaid: d(300),
    }));
    expect(result.creditAllowed.toNumber()).toBe(300);
  });

  it("Form 1116 Line 21 - credit allowed limited by limitation", () => {
    // Limitation is $571, taxes paid $1000 → credit = $571
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(5000),
      totalTaxableIncome: d(70000),
      taxBeforeCredits: d(8000),
      foreignTaxesPaid: d(1000),
    }));
    expect(result.creditAllowed.toNumber()).toBe(571);
  });

  it("Form 1116 - carryforward when limited", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(5000),
      totalTaxableIncome: d(70000),
      taxBeforeCredits: d(8000),
      foreignTaxesPaid: d(1000),
    }));
    // $1000 paid - $571 allowed = $429 carryforward
    expect(result.carryforward.toNumber()).toBe(429);
  });

  it("Form 1116 - no carryforward when fully used", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(5000),
      totalTaxableIncome: d(70000),
      taxBeforeCredits: d(8000),
      foreignTaxesPaid: d(300),
    }));
    expect(result.carryforward.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// K-1 Foreign Tax Pipeline
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - K-1 foreign tax pipeline", () => {
  it("1099-INT foreign tax flows through federal pipeline", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099Div: [],
      form1099Int: [
        {
          payer: "Foreign Bank",
          interestIncome: "4000",
          earlyWithdrawalPenalty: "0",
          federalWithheld: "0",
          taxExemptInterest: "0",
          foreignTaxPaid: "200",
          foreignCountry: "Canada",
        },
      ],
    });

    expect(result.foreignTaxCredit.toNumber()).toBe(200);

    const simplifiedEligibleLine = result.allLines.find(
      (line) => line.form === "Form 1116" && line.line === "simplified_eligible"
    );
    const line1a = result.allLines.find(
      (line) => line.form === "Form 1116" && line.line === "1a"
    );
    const line7 = result.allLines.find(
      (line) => line.form === "Form 1116" && line.line === "7"
    );

    expect(String(line1a?.value)).toBe("4000");
    expect(String(line7?.value)).toBe("200");
    expect(String(simplifiedEligibleLine?.value)).toBe("1");
  });

  it("Form 1116 Line 1a - federal pipeline estimates supported gross foreign income from foreign-tax-bearing 1099-DIV and K-1 components", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "International Allocation Fund",
        ordinaryDividends: "5000",
        qualifiedDividends: "3000",
        totalCapitalGainDistributions: "3000",
        foreignTaxPaid: "150",
        foreignCountry: "Various",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        federalWithheld: "0",
        exemptInterestDividends: "0",
      }],
      scheduleK1: [{
        partnershipName: "Foreign Opportunity LP",
        partnershipEIN: "99-1234567",
        ordinaryIncome: "-2000",
        netRentalIncome: "1000",
        otherNetRentalIncome: "-500",
        guaranteedPayments: "4000",
        interestIncome: "700",
        ordinaryDividends: "800",
        royalties: "600",
        netShortTermCapitalGain: "900",
        netLongTermCapitalGain: "1000",
        section1231Gain: "1100",
        otherIncome: "1200",
        foreignTaxPaid: "300",
        isPassiveActivity: true,
      }],
      form4797: { nonrecapturedNetSection1231Losses: "0" },
      // Synthetic actual worksheet: $3,000 distributions + $900 ST +
      // $1,000 LT + $1,100 passive section 1231 gain. All are included in
      // NIIT; no partnership interest was sold. Spec: form-8960.yaml.
      form8960Sources: {
        sourceTaxYear: 2025,
        sourceReference: "Foreign income fixture disposition worksheet",
        sourceFactsConfirmed: true,
        dispositions: {
          regularCapitalGainOrLoss: "6000",
          regularOrdinaryGainOrLoss: "0",
          excludedGainOrLossAdjustment: "0",
          passthroughAdjustment: "0",
        },
      },
    });

    // Multi-category: 1099-DIV → passive, K-1 → general
    const passiveLine1a = result.allLines.find(
      (line) => line.form === "Form 1116 (passive)" && line.line === "1a"
    );
    const generalLine1a = result.allLines.find(
      (line) => line.form === "Form 1116 (general)" && line.line === "1a"
    );
    const passiveLine7 = result.allLines.find(
      (line) => line.form === "Form 1116 (passive)" && line.line === "7"
    );
    const generalLine7 = result.allLines.find(
      (line) => line.form === "Form 1116 (general)" && line.line === "7"
    );

    // Passive: 1099-DIV ordinary dividends $5000 + cap gain distributions $3000 = $8000
    expect(passiveLine1a).toBeDefined();
    expect(String(passiveLine1a?.value)).toBe("8000");
    // General: K-1 positive income boxes: 1000+4000+700+800+600+900+1000+1100+1200 = $11300
    expect(generalLine1a).toBeDefined();
    expect(String(generalLine1a?.value)).toBe("11300");
    // Passive taxes: $150 from 1099-DIV
    expect(String(passiveLine7?.value)).toBe("150");
    // General taxes: $300 from K-1
    expect(String(generalLine7?.value)).toBe("300");
  });

  it("K-1 foreign tax flows through federal pipeline", () => {

    const fixture = {
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "International Fund LP",
        partnershipEIN: "99-1234567",
        ordinaryIncome: "20000",
        foreignTaxPaid: "500",
        isPassiveActivity: true,
      }],
    };
    const result = calculateFederalTax(fixture);
    // Foreign tax credit should reflect K-1 foreign tax
    expect(result.foreignTaxCredit.greaterThan(0)).toBe(true);
  });

  it("K-1 + 1099-DIV foreign taxes combine", () => {

    const fixture = {
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "Vanguard",
        ordinaryDividends: "5000",
        qualifiedDividends: "4000",
        foreignTaxPaid: "150",
        foreignCountry: "Various",
        totalCapitalGainDistributions: "0",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        federalWithheld: "0",
        exemptInterestDividends: "0",
      }],
      scheduleK1: [{
        partnershipName: "International Fund LP",
        partnershipEIN: "99-1234567",
        ordinaryIncome: "20000",
        foreignTaxPaid: "300",
        isPassiveActivity: true,
      }],
    };
    const result = calculateFederalTax(fixture);
    // Combined foreign tax: $150 + $300 = $450
    expect(result.foreignTaxCredit.greaterThan(0)).toBe(true);
    // FTC should be > what just $150 alone would give
    const divOnlyFixture = {
      ...fixture,
      scheduleK1: [{
        ...fixture.scheduleK1[0],
        foreignTaxPaid: "0",
      }],
    };
    const divOnlyResult = calculateFederalTax(divOnlyFixture);
    expect(result.foreignTaxCredit.greaterThan(divOnlyResult.foreignTaxCredit)).toBe(true);
  });

  it("K-1 foreign tax under threshold still marks simplified_eligible false in audit trail", () => {
    const fixture = {
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "Vanguard",
        ordinaryDividends: "5000",
        qualifiedDividends: "4000",
        foreignTaxPaid: "50",
        foreignCountry: "Various",
        totalCapitalGainDistributions: "0",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        federalWithheld: "0",
        exemptInterestDividends: "0",
      }],
      scheduleK1: [{
        partnershipName: "Foreign LP",
        partnershipEIN: "99-1234567",
        ordinaryIncome: "3000",
        foreignTaxPaid: "25",
        isPassiveActivity: true,
      }],
    };

    const result = calculateFederalTax(fixture);
    // Multi-category: simplified_eligible appears on per-category audit lines
    const simplifiedLine = result.allLines.find(
      (line) => line.form.startsWith("Form 1116") && line.line === "simplified_eligible"
    );

    expect(simplifiedLine).toBeDefined();
    expect(simplifiedLine!.value.toNumber()).toBe(0);
    expect(result.foreignTaxCredit.toNumber()).toBe(75);
  });
});

// ═══════════════════════════════════════════════════════════
// Multi-Category (IRC §904(d))
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - multi-category (IRC §904(d))", () => {
  it("Form 1116 multi-category - passive and general categories get separate limitations", () => {
    // Passive: $5000 foreign income from 1099-DIV, $3000 foreign tax (high rate)
    // General: $50000 K-1 income, $2000 foreign tax (low rate)
    // Multi-category limits passive credit because passive income is small fraction of taxable income
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "High-Rate Foreign Fund",
        ordinaryDividends: "5000",
        qualifiedDividends: "0",
        foreignTaxPaid: "3000",
        foreignCountry: "Various",
        totalCapitalGainDistributions: "0",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        federalWithheld: "0",
        exemptInterestDividends: "0",
      }],
      scheduleK1: [{
        partnershipName: "International Business LP",
        partnershipEIN: "99-7654321",
        ordinaryIncome: "50000",
        foreignTaxPaid: "2000",
        isPassiveActivity: false,
      }],
    });

    // Both categories should produce audit lines
    const passiveLines = result.allLines.filter((l) => l.form === "Form 1116 (passive)");
    const generalLines = result.allLines.filter((l) => l.form === "Form 1116 (general)");
    expect(passiveLines.length).toBeGreaterThan(0);
    expect(generalLines.length).toBeGreaterThan(0);

    // Passive credit should be limited (high tax rate on small income fraction)
    const passiveCredit = passiveLines.find((l) => l.line === "21");
    expect(passiveCredit).toBeDefined();
    expect(passiveCredit!.value.lessThan(d(3000))).toBe(true);

    // General credit: $2000 foreign tax on $50000 income — should not be limited
    const generalCredit = generalLines.find((l) => l.line === "21");
    expect(generalCredit).toBeDefined();
    expect(generalCredit!.value.toNumber()).toBe(2000);

    // Total credit is sum of per-category credits
    expect(result.foreignTaxCredit.toNumber()).toBe(
      passiveCredit!.value.plus(generalCredit!.value).toNumber()
    );

    // Passive has carryforward (excess tax over limitation)
    expect(result.carryforwards.foreignTaxCreditCarryforward.greaterThan(0)).toBe(true);

    // Per-category carryforward should have passive entry
    expect(result.carryforwards.foreignTaxCreditCarryforwardByCategory).toHaveProperty("passive");
  });

  it("multi-category - single category only uses single-category path", () => {
    // Only 1099-DIV foreign tax (passive only) — no K-1 foreign tax
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "Vanguard",
        ordinaryDividends: "5000",
        qualifiedDividends: "4000",
        foreignTaxPaid: "200",
        foreignCountry: "Various",
        totalCapitalGainDistributions: "0",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        federalWithheld: "0",
        exemptInterestDividends: "0",
      }],
    });

    // Should use "Form 1116" label (not per-category)
    const line21 = result.allLines.find(
      (l) => l.form === "Form 1116" && l.line === "21"
    );
    expect(line21).toBeDefined();
    expect(result.foreignTaxCredit.toNumber()).toBe(200);
  });

  it("multi-category - K-1 with foreignTaxCategory passive routes to passive", () => {
    // K-1 with foreignTaxCategory="passive" should route to passive along with 1099-DIV
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "Vanguard",
        ordinaryDividends: "5000",
        qualifiedDividends: "4000",
        foreignTaxPaid: "100",
        foreignCountry: "Various",
        totalCapitalGainDistributions: "0",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        federalWithheld: "0",
        exemptInterestDividends: "0",
      }],
      scheduleK1: [{
        partnershipName: "Passive Foreign Fund LP",
        partnershipEIN: "99-1111111",
        ordinaryIncome: "8000",
        foreignTaxPaid: "50",
        foreignTaxCategory: "passive",
        isPassiveActivity: true,
      }],
    });

    // With K-1 also passive, only one category has activity → single-category path
    const singleLine = result.allLines.find(
      (l) => l.form === "Form 1116" && l.line === "21"
    );
    expect(singleLine).toBeDefined();
    // Total credit: $150
    expect(result.foreignTaxCredit.toNumber()).toBe(150);
  });

  it("multi-category - per-category carryforward tracking", () => {
    // Passive: high tax, limited → generates carryforward
    // General: low tax, not limited → no carryforward
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "High-Rate Fund",
        ordinaryDividends: "2000",
        qualifiedDividends: "0",
        foreignTaxPaid: "1500",
        foreignCountry: "Various",
        totalCapitalGainDistributions: "0",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        federalWithheld: "0",
        exemptInterestDividends: "0",
      }],
      scheduleK1: [{
        partnershipName: "Active Business LP",
        partnershipEIN: "99-2222222",
        ordinaryIncome: "30000",
        foreignTaxPaid: "500",
        isPassiveActivity: false,
      }],
    });

    const byCategory = result.carryforwards.foreignTaxCreditCarryforwardByCategory;

    // Passive should have carryforward (excess tax)
    expect(byCategory.passive).toBeDefined();
    expect(byCategory.passive!.length).toBeGreaterThan(0);
    const passiveCfAmount = byCategory.passive!.reduce(
      (acc, e) => acc.plus(e.amount), d(0)
    );
    expect(passiveCfAmount.greaterThan(0)).toBe(true);

    // General should not have carryforward (tax within limitation)
    expect(byCategory.general).toBeUndefined();
  });

  it("multi-category - per-category carryforward input from prior year", () => {
    // Prior-year per-category carryforward feeds into current-year calculation
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "Foreign Fund",
        ordinaryDividends: "10000",
        qualifiedDividends: "5000",
        foreignTaxPaid: "100",
        foreignCountry: "Various",
        totalCapitalGainDistributions: "0",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        federalWithheld: "0",
        exemptInterestDividends: "0",
      }],
      scheduleK1: [{
        partnershipName: "Business LP",
        partnershipEIN: "99-3333333",
        ordinaryIncome: "20000",
        foreignTaxPaid: "100",
        isPassiveActivity: false,
      }],
      priorYear: {
        foreignTaxCreditCarryforwardByCategory: {
          passive: [{ taxYear: 2024, amount: "500" }],
          general: [{ taxYear: 2024, amount: "200" }],
        },
      },
    });

    // Credit should include both current-year taxes and prior carryforward
    // Total current-year tax: $200, total prior carryforward: $700
    // Credit should be higher than just $200
    expect(result.foreignTaxCredit.greaterThan(d(200))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - audit trail", () => {
  it("produces complete audit trail", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(5000),
      foreignTaxesPaid: d(300),
    }));
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("simplified_eligible");
    expect(lineIds).toContain("1a");
    expect(lineIds).toContain("3e");
    expect(lineIds).toContain("3f");
    expect(lineIds).toContain("7");
    expect(lineIds).toContain("20");
    expect(lineIds).toContain("21");
    expect(lineIds).toContain("carryforward");
  });

  it("Form 1116 audit trail - core line IDs present plus Schedule B entries when carryforward is used", () => {
    // Confirms no lines are accidentally dropped from the audit trail
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(10000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(20000),
      foreignTaxesPaid: d(800),
      priorYearCarryforward: d(200),
    }));
    const lineIds = result.lines.map((l) => l.line);
    const coreLines = ["simplified_eligible", "1a", "3e", "3f", "7", "20", "21", "carryforward"];
    for (const id of coreLines) {
      expect(lineIds, `Expected line "${id}" in audit trail`).toContain(id);
    }
    // Schedule B used entry present when carryforward was consumed
    expect(lineIds).toContain("schedule-b-used");
  });
});

// ═══════════════════════════════════════════════════════════
// Additional Credit Calculation Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - limitation ratio and credit edge cases", () => {
  it("Form 1116 Line 20 - limitation ratio exactly 50%", () => {
    // foreign $35K / worldwide $70K = 50%; $8K × 50% = $4,000
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(35000),
      totalTaxableIncome: d(70000),
      taxBeforeCredits: d(8000),
      foreignTaxesPaid: d(5000),
    }));
    expect(result.limitation.toNumber()).toBe(4000);
  });

  it("Form 1116 Line 20 - tiny limitation for small foreign income vs large total", () => {
    // foreign $100 / worldwide $500K = 0.02%; $50K × 0.02% = $10
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(100),
      totalTaxableIncome: d(500000),
      taxBeforeCredits: d(50000),
      foreignTaxesPaid: d(30),
    }));
    expect(result.limitation.toNumber()).toBe(10);
  });

  it("Form 1116 - all foreign tax credited when paid is less than limitation", () => {
    // Limitation $4,000; taxes paid $1,200 → full $1,200 credited, zero carryforward
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(35000),
      totalTaxableIncome: d(70000),
      taxBeforeCredits: d(8000),
      foreignTaxesPaid: d(1200),
    }));
    expect(result.creditAllowed.toNumber()).toBe(1200);
    expect(result.carryforward.toNumber()).toBe(0);
  });

  it("Form 1116 - large prior-year carryforward fully consumed by current-year limitation", () => {
    // No current taxes paid; $2,000 carryforward; limitation $4,000 → all $2,000 credited
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(35000),
      totalTaxableIncome: d(70000),
      taxBeforeCredits: d(8000),
      foreignTaxesPaid: d(0),
      priorYearCarryforward: d(2000),
    }));
    // Line 7 = 0 + 2000 = 2000; limitation = 4000; credit = 2000; carryforward = 0
    expect(result.foreignTaxesPaidPlusCarryforward.toNumber()).toBe(2000);
    expect(result.creditAllowed.toNumber()).toBe(2000);
    expect(result.carryforward.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Simplified Method — Filing Status Thresholds
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - simplified method filing status thresholds", () => {
  it("simplified method - MFJ eligible at exactly $600 threshold", () => {
    // $600 is exactly the MFJ threshold → eligible (≤ threshold)
    const eligible = isSimplifiedEligible(
      {
        ...complexMFJFixture,
        form1099Div: [
          {
            payer: "Vanguard",
            ordinaryDividends: "20000",
            qualifiedDividends: "15000",
            foreignTaxPaid: "600",
            foreignCountry: "Various",
            totalCapitalGainDistributions: "0",
            section1250Gain: "0",
            section1202Gain: "0",
            collectiblesGain: "0",
            nondividendDistributions: "0",
            federalWithheld: "0",
            exemptInterestDividends: "0",
          },
        ],
      },
      "married_filing_jointly"
    );
    expect(eligible).toBe(true);
  });

  it("simplified method - MFJ not eligible at $601 (one dollar over threshold)", () => {
    const eligible = isSimplifiedEligible(
      {
        ...complexMFJFixture,
        form1099Div: [
          {
            payer: "Vanguard",
            ordinaryDividends: "20000",
            qualifiedDividends: "15000",
            foreignTaxPaid: "601",
            foreignCountry: "Various",
            totalCapitalGainDistributions: "0",
            section1250Gain: "0",
            section1202Gain: "0",
            collectiblesGain: "0",
            nondividendDistributions: "0",
            federalWithheld: "0",
            exemptInterestDividends: "0",
          },
        ],
      },
      "married_filing_jointly"
    );
    expect(eligible).toBe(false);
  });

  it("simplified method - HoH uses $300 threshold (same as single)", () => {
    // Head of Household: $300 → eligible; $301 → not eligible
    const eligibleAtThreshold = isSimplifiedEligible(
      {
        ...simpleW2Fixture,
        form1099Div: [
          {
            payer: "Fidelity",
            ordinaryDividends: "8000",
            qualifiedDividends: "6000",
            foreignTaxPaid: "300",
            foreignCountry: "Various",
            totalCapitalGainDistributions: "0",
            section1250Gain: "0",
            section1202Gain: "0",
            collectiblesGain: "0",
            nondividendDistributions: "0",
            federalWithheld: "0",
            exemptInterestDividends: "0",
          },
        ],
      },
      "head_of_household"
    );
    expect(eligibleAtThreshold).toBe(true);

    const notEligibleOverThreshold = isSimplifiedEligible(
      {
        ...simpleW2Fixture,
        form1099Div: [
          {
            payer: "Fidelity",
            ordinaryDividends: "8000",
            qualifiedDividends: "6000",
            foreignTaxPaid: "301",
            foreignCountry: "Various",
            totalCapitalGainDistributions: "0",
            section1250Gain: "0",
            section1202Gain: "0",
            collectiblesGain: "0",
            nondividendDistributions: "0",
            federalWithheld: "0",
            exemptInterestDividends: "0",
          },
        ],
      },
      "head_of_household"
    );
    expect(notEligibleOverThreshold).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Filing Status
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - married filing separately", () => {
  it("simplified method - MFS uses $300 threshold (same as single, not MFJ $600)", () => {
    // MFS at $350 should be ineligible ($350 > $300 MFS threshold)
    const eligible = isSimplifiedEligible(
      {
        ...simpleW2Fixture,
        form1099Div: [
          {
            payer: "Vanguard",
            ordinaryDividends: "10000",
            qualifiedDividends: "8000",
            foreignTaxPaid: "350",
            foreignCountry: "Various",
            totalCapitalGainDistributions: "0",
            section1250Gain: "0",
            section1202Gain: "0",
            collectiblesGain: "0",
            nondividendDistributions: "0",
            federalWithheld: "0",
            exemptInterestDividends: "0",
          },
        ],
      },
      "married_filing_separately"
    );
    expect(eligible).toBe(false);
  });

  it("simplified method - MFS eligible at exactly $300 threshold", () => {
    const eligible = isSimplifiedEligible(
      {
        ...simpleW2Fixture,
        form1099Div: [
          {
            payer: "Fidelity",
            ordinaryDividends: "8000",
            qualifiedDividends: "6000",
            foreignTaxPaid: "300",
            foreignCountry: "Various",
            totalCapitalGainDistributions: "0",
            section1250Gain: "0",
            section1202Gain: "0",
            collectiblesGain: "0",
            nondividendDistributions: "0",
            federalWithheld: "0",
            exemptInterestDividends: "0",
          },
        ],
      },
      "married_filing_separately"
    );
    expect(eligible).toBe(true);
  });

  it("Form 1116 - MFS limitation formula is identical to single (no special MFS cap)", () => {
    // MFS filer: foreign $20K / worldwide $80K = 25%; $12K tax × 25% = $3,000
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(20000),
      totalTaxableIncome: d(80000),
      taxBeforeCredits: d(12000),
      foreignTaxesPaid: d(1000),
      filingStatus: "married_filing_separately",
    }));
    expect(result.limitation.toNumber()).toBe(3000);
    expect(result.creditAllowed.toNumber()).toBe(1000);
    expect(result.carryforward.toNumber()).toBe(0);
  });

  it("Form 1116 - MFS simplifiedEligible flag false when taxes paid exceed $300", () => {
    // calculateForm1116 checks foreignTaxesPaid vs threshold directly
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(15000),
      foreignTaxesPaid: d(400),
      totalTaxableIncome: d(80000),
      taxBeforeCredits: d(12000),
      filingStatus: "married_filing_separately",
    }));
    expect(result.simplifiedEligible).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// Very Large Foreign Taxes
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - very large foreign taxes relative to US income", () => {
  it("foreign taxes vastly exceed limitation — only limitation credited, large carryforward", () => {
    // Taxpayer paid $50K to a foreign government but US limitation is only $3K
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(20000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(50000),
    }));
    // Limitation = (20000/100000) × 15000 = 3000
    expect(result.limitation.toNumber()).toBe(3000);
    expect(result.creditAllowed.toNumber()).toBe(3000);
    // $50K paid - $3K allowed = $47K carryforward
    expect(result.carryforward.toNumber()).toBe(47000);
  });

  it("prior year carryforward partially consumed — remainder carries forward again", () => {
    // Current year taxes $500, carryforward $8000; limitation is only $2000
    // Total available = 8500; only $2000 credited; $6500 carries forward
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(10000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(20000),
      foreignTaxesPaid: d(500),
      priorYearCarryforward: d(8000),
    }));
    // Limitation = (10000/100000) × 20000 = 2000
    expect(result.limitation.toNumber()).toBe(2000);
    // Line 7 = 500 + 8000 = 8500
    expect(result.foreignTaxesPaidPlusCarryforward.toNumber()).toBe(8500);
    expect(result.creditAllowed.toNumber()).toBe(2000);
    expect(result.carryforward.toNumber()).toBe(6500);
  });
});

// ═══════════════════════════════════════════════════════════
// calculateForm1116 simplifiedEligible flag
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - simplifiedEligible flag in calculateForm1116", () => {
  it("simplifiedEligible true when foreignTaxesPaid exactly equals $300 threshold for single", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(5000),
      foreignTaxesPaid: d(300),
      filingStatus: "single",
    }));
    expect(result.simplifiedEligible).toBe(true);
  });

  it("simplifiedEligible false when foreignTaxesPaid exceeds $300 threshold for single", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(5000),
      foreignTaxesPaid: d(301),
      filingStatus: "single",
    }));
    expect(result.simplifiedEligible).toBe(false);
  });

  it("simplifiedEligible true for MFJ when foreignTaxesPaid exactly $600", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(10000),
      foreignTaxesPaid: d(600),
      filingStatus: "married_filing_jointly",
    }));
    expect(result.simplifiedEligible).toBe(true);
  });

  it("simplifiedEligible false when K-1 foreign tax disqualifies an under-threshold amount", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(8000),
      foreignTaxesPaid: d(75),
      filingStatus: "single",
      hasDisqualifyingForeignTaxSources: true,
    }));
    expect(result.simplifiedEligible).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail Value Verification
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - audit trail value verification", () => {
  it("audit trail line 20 records the correct limitation amount", () => {
    // foreign $15K / total $60K = 25%; $10K × 25% = $2,500
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(15000),
      totalTaxableIncome: d(60000),
      taxBeforeCredits: d(10000),
      foreignTaxesPaid: d(500),
    }));
    const line20 = result.lines.find((l) => l.line === "20");
    expect(line20).toBeDefined();
    expect(line20!.value.toNumber()).toBe(2500);
  });

  it("audit trail line 21 records the correct credit allowed amount", () => {
    // Limitation $2,500; taxes paid $500 → credit = $500
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(15000),
      totalTaxableIncome: d(60000),
      taxBeforeCredits: d(10000),
      foreignTaxesPaid: d(500),
    }));
    const line21 = result.lines.find((l) => l.line === "21");
    expect(line21).toBeDefined();
    expect(line21!.value.toNumber()).toBe(500);
  });

  it("audit trail carryforward line records correct excess amount", () => {
    // Limitation $2,500; taxes paid $4,000 → carryforward $1,500
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(15000),
      totalTaxableIncome: d(60000),
      taxBeforeCredits: d(10000),
      foreignTaxesPaid: d(4000),
    }));
    const carryLine = result.lines.find((l) => l.line === "carryforward");
    expect(carryLine).toBeDefined();
    expect(carryLine!.value.toNumber()).toBe(1500);
  });
});

describe("Form 1116 - additional edge cases", () => {
  it("zero foreign income — zero credit", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(0),
      foreignTaxesPaid: d(500),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
    }));
    expect(result.creditAllowed.toNumber()).toBe(0);
  });

  it("zero US tax — zero limitation and credit", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(10000),
      foreignTaxesPaid: d(500),
      totalTaxableIncome: d(10000),
      taxBeforeCredits: d(0),
    }));
    expect(result.limitation.toNumber()).toBe(0);
    expect(result.creditAllowed.toNumber()).toBe(0);
  });

  it("foreign tax paid exceeds limitation — credit capped, carryforward generated", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(10000),
      foreignTaxesPaid: d(5000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
    }));
    // Limitation = (10000/100000) × 15000 = 1500
    expect(result.limitation.toNumber()).toBe(1500);
    expect(result.creditAllowed.toNumber()).toBe(1500);
    expect(result.carryforward.toNumber()).toBe(3500);
  });

  it("foreign tax paid below limitation — full credit, no carryforward", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(50000),
      foreignTaxesPaid: d(2000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
    }));
    // Limitation = (50000/100000) × 15000 = 7500. Paid $2000 < $7500
    expect(result.creditAllowed.toNumber()).toBe(2000);
    expect(result.carryforward.toNumber()).toBe(0);
  });

  it("100% foreign income — limitation equals full tax", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(100000),
      foreignTaxesPaid: d(20000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
    }));
    // Ratio = 1.0 (capped). Limitation = 15000
    expect(result.limitation.toNumber()).toBe(15000);
    expect(result.creditAllowed.toNumber()).toBe(15000);
    expect(result.carryforward.toNumber()).toBe(5000);
  });

  it("very small foreign income ratio (<1%)", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(500),
      foreignTaxesPaid: d(25),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
    }));
    // Limitation = (500/100000) × 15000 = 75
    expect(result.limitation.toNumber()).toBe(75);
    expect(result.creditAllowed.toNumber()).toBe(25);
  });

  it("prior year carryforward absorbed within limitation", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(30000),
      foreignTaxesPaid: d(1000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      priorYearCarryforward: d(2000),
    }));
    // Limitation = 4500. Total available = 1000 + 2000 = 3000 < 4500
    expect(result.creditAllowed.toNumber()).toBe(3000);
    expect(result.carryforward.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Schedule B: Per-Year FIFO Carryforward Reconciliation
// ═══════════════════════════════════════════════════════════

describe("Form 1116 Schedule B", () => {
  it("Form 1116 Schedule B - FIFO carryforward uses oldest credits first", () => {
    // 2022: $300, 2023: $500 carryforward. Limitation $8000, current taxes $7600.
    // Excess limitation = $400. FIFO: use $300 from 2022, then $100 from 2023.
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(50000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(16000),
      foreignTaxesPaid: d(7600),
      currentTaxYear: 2025,
      priorYearCarryforwardByYear: [
        { taxYear: 2022, amount: d(300) },
        { taxYear: 2023, amount: d(500) },
      ],
    }));
    // Limitation = 16000 × (50000/100000) = 8000
    expect(result.limitation.toNumber()).toBe(8000);
    expect(result.creditAllowed.toNumber()).toBe(8000);
    // 2022: all $300 used; 2023: $100 used, $400 remaining
    expect(result.scheduleBDetail).toHaveLength(2);
    expect(result.scheduleBDetail[0].taxYear).toBe(2022);
    expect(result.scheduleBDetail[0].amountUsed.toNumber()).toBe(300);
    expect(result.scheduleBDetail[0].amountRemaining.toNumber()).toBe(0);
    expect(result.scheduleBDetail[1].taxYear).toBe(2023);
    expect(result.scheduleBDetail[1].amountUsed.toNumber()).toBe(100);
    expect(result.scheduleBDetail[1].amountRemaining.toNumber()).toBe(400);
    // Remaining carryforward: only 2023 with $400
    expect(result.carryforwardByYear).toHaveLength(1);
    expect(result.carryforwardByYear[0].taxYear).toBe(2023);
    expect(result.carryforwardByYear[0].amount.toNumber()).toBe(400);
    expect(result.carryforward.toNumber()).toBe(400);
  });

  it("Form 1116 Schedule B - credits older than 10 years expire", () => {
    // 2014 credit is 11 years old in 2025 → expired
    // 2015 credit is exactly 10 years old → still usable
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(50000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(16000),
      foreignTaxesPaid: d(7000),
      currentTaxYear: 2025,
      priorYearCarryforwardByYear: [
        { taxYear: 2014, amount: d(200) },
        { taxYear: 2015, amount: d(300) },
      ],
    }));
    // 2014: expired (11 years old); 2015: usable (10 years)
    expect(result.carryforwardExpired.toNumber()).toBe(200);
    // Limitation = 8000. Current used = 7000. Excess = 1000. 2015 $300 fully used.
    expect(result.scheduleBDetail[0].taxYear).toBe(2014);
    expect(result.scheduleBDetail[0].amountExpired.toNumber()).toBe(200);
    expect(result.scheduleBDetail[0].amountUsed.toNumber()).toBe(0);
    expect(result.scheduleBDetail[1].taxYear).toBe(2015);
    expect(result.scheduleBDetail[1].amountUsed.toNumber()).toBe(300);
    expect(result.scheduleBDetail[1].amountRemaining.toNumber()).toBe(0);
    expect(result.creditAllowed.toNumber()).toBe(7300);
  });

  it("Form 1116 Schedule B - credits from exactly 10 years ago are still usable", () => {
    // 2015 is exactly 10 years before 2025 → age = 10, NOT expired
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(50000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(10000),
      foreignTaxesPaid: d(4000),
      currentTaxYear: 2025,
      priorYearCarryforwardByYear: [
        { taxYear: 2015, amount: d(500) },
      ],
    }));
    expect(result.carryforwardExpired.toNumber()).toBe(0);
    expect(result.scheduleBDetail[0].amountUsed.toNumber()).toBe(500);
  });

  it("Form 1116 Schedule B - current-year excess credit becomes new carryforward entry", () => {
    // Current year $2000 taxes, limitation $500 → $1500 excess becomes 2025 carryforward
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(5000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(10000),
      foreignTaxesPaid: d(2000),
      currentTaxYear: 2025,
    }));
    // Limitation = 10000 × (5000/100000) = 500
    expect(result.limitation.toNumber()).toBe(500);
    expect(result.creditAllowed.toNumber()).toBe(500);
    expect(result.carryforwardByYear).toHaveLength(1);
    expect(result.carryforwardByYear[0].taxYear).toBe(2025);
    expect(result.carryforwardByYear[0].amount.toNumber()).toBe(1500);
  });

  it("Form 1116 Schedule B - all carryforward fully used leaves empty remaining", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(50000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(16000),
      foreignTaxesPaid: d(7000),
      currentTaxYear: 2025,
      priorYearCarryforwardByYear: [
        { taxYear: 2020, amount: d(100) },
        { taxYear: 2021, amount: d(200) },
      ],
    }));
    // Limitation = 8000. Current = 7000. Excess = 1000.
    // 2020: 100 used, 2021: 200 used → all consumed
    expect(result.carryforwardByYear).toHaveLength(0);
    expect(result.carryforward.toNumber()).toBe(0);
  });

  it("Form 1116 Schedule B - no excess limitation preserves all carryforward", () => {
    // Current taxes exceed limitation → no room for carryforward usage
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(5000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(10000),
      foreignTaxesPaid: d(1000),
      currentTaxYear: 2025,
      priorYearCarryforwardByYear: [
        { taxYear: 2022, amount: d(300) },
        { taxYear: 2023, amount: d(400) },
      ],
    }));
    // Limitation = 500. Current taxes = 1000 > 500. No excess limitation.
    // Current year excess = 500 → new carryforward entry.
    // Prior carryforward untouched.
    expect(result.scheduleBDetail[0].amountUsed.toNumber()).toBe(0);
    expect(result.scheduleBDetail[0].amountRemaining.toNumber()).toBe(300);
    expect(result.scheduleBDetail[1].amountUsed.toNumber()).toBe(0);
    expect(result.scheduleBDetail[1].amountRemaining.toNumber()).toBe(400);
    // Carryforward: 2022=$300, 2023=$400, 2025=$500
    expect(result.carryforwardByYear).toHaveLength(3);
    expect(result.carryforward.toNumber()).toBe(1200);
  });

  it("Form 1116 Schedule B - per-year input takes precedence over legacy single amount", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(50000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(16000),
      foreignTaxesPaid: d(7500),
      currentTaxYear: 2025,
      priorYearCarryforward: d(9999), // should be ignored
      priorYearCarryforwardByYear: [
        { taxYear: 2023, amount: d(200) },
      ],
    }));
    // Per-year takes precedence: only $200 carryforward, not $9999
    expect(result.foreignTaxesPaidPlusCarryforward.toNumber()).toBe(7700);
    expect(result.creditAllowed.toNumber()).toBe(7700);
  });

  it("Form 1116 Schedule B - legacy carryforward converts to single prior-year entry", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(50000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(16000),
      foreignTaxesPaid: d(7800),
      currentTaxYear: 2025,
      priorYearCarryforward: d(500),
    }));
    // Legacy $500 treated as from 2024
    expect(result.scheduleBDetail).toHaveLength(1);
    expect(result.scheduleBDetail[0].taxYear).toBe(2024);
    expect(result.scheduleBDetail[0].amountAvailable.toNumber()).toBe(500);
    // Excess limitation = 8000 - 7800 = 200 → use 200 from legacy entry
    expect(result.scheduleBDetail[0].amountUsed.toNumber()).toBe(200);
    expect(result.scheduleBDetail[0].amountRemaining.toNumber()).toBe(300);
    expect(result.carryforwardByYear[0].taxYear).toBe(2024);
    expect(result.carryforwardByYear[0].amount.toNumber()).toBe(300);
  });

  it("Form 1116 Schedule B - mixed expired and partial usage", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(50000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(16000),
      foreignTaxesPaid: d(7500),
      currentTaxYear: 2025,
      priorYearCarryforwardByYear: [
        { taxYear: 2013, amount: d(100) }, // 12 years → expired
        { taxYear: 2014, amount: d(200) }, // 11 years → expired
        { taxYear: 2020, amount: d(300) }, // 5 years → usable
        { taxYear: 2024, amount: d(400) }, // 1 year → usable
      ],
    }));
    // Expired: 2013=$100, 2014=$200 = $300 total expired
    expect(result.carryforwardExpired.toNumber()).toBe(300);
    // Limitation = 8000. Current = 7500. Excess = 500.
    // FIFO: 2020=$300 used, 2024=$200 used (only 200 left of excess)
    expect(result.scheduleBDetail[2].taxYear).toBe(2020);
    expect(result.scheduleBDetail[2].amountUsed.toNumber()).toBe(300);
    expect(result.scheduleBDetail[3].taxYear).toBe(2024);
    expect(result.scheduleBDetail[3].amountUsed.toNumber()).toBe(200);
    expect(result.scheduleBDetail[3].amountRemaining.toNumber()).toBe(200);
    expect(result.carryforwardByYear).toHaveLength(1);
    expect(result.carryforwardByYear[0].taxYear).toBe(2024);
    expect(result.carryforwardByYear[0].amount.toNumber()).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════
// K-1 Box 16 explicit foreignSourceIncome
// ═══════════════════════════════════════════════════════════

describe("Form 1116 - K-1 explicit foreignSourceIncome (Box 16 Codes D/E/F)", () => {
  it("K-1 explicit foreignSourceIncome used for Form 1116 limitation", () => {
    // K-1 has $100,000 ordinary income but only $20,000 is foreign source.
    // Without explicit foreignSourceIncome, the heuristic uses all $100,000.
    // With it, the limitation is computed on $20,000.
    const withExplicit = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Partial Foreign LP",
        partnershipEIN: "99-1234567",
        ordinaryIncome: "100000",
        foreignTaxPaid: "5000",
        foreignSourceIncome: "20000",
        isPassiveActivity: false,
      }],
    });

    const withoutExplicit = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Partial Foreign LP",
        partnershipEIN: "99-1234567",
        ordinaryIncome: "100000",
        foreignTaxPaid: "5000",
        isPassiveActivity: false,
      }],
    });

    // With explicit $20,000 foreign source income, the limitation is tighter
    // (smaller fraction of taxable income) so the credit should be smaller
    expect(withExplicit.foreignTaxCredit.lessThan(withoutExplicit.foreignTaxCredit)).toBe(true);
    // Both should still give some credit
    expect(withExplicit.foreignTaxCredit.greaterThan(0)).toBe(true);
    expect(withoutExplicit.foreignTaxCredit.greaterThan(0)).toBe(true);
  });

  it("K-1 explicit foreignSourceIncome of zero produces zero foreign source income", () => {
    // Edge case: K-1 has foreign tax paid but reports zero foreign source income
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Domestic LP with Foreign Tax",
        partnershipEIN: "99-1234567",
        ordinaryIncome: "50000",
        foreignTaxPaid: "200",
        foreignSourceIncome: "0",
        isPassiveActivity: false,
      }],
    });

    // With zero foreign source income, the limitation should be zero,
    // so no credit is allowed (entire tax becomes carryforward)
    expect(result.foreignTaxCredit.toNumber()).toBe(0);
    expect(result.carryforwards.foreignTaxCreditCarryforward.toNumber()).toBe(200);
  });

  it("K-1 explicit foreignSourceIncome matching total income gives same result as heuristic", () => {
    // When explicit amount equals the sum of all income fields,
    // the result should match the heuristic path
    const withExplicit = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "All Foreign LP",
        partnershipEIN: "99-1234567",
        ordinaryIncome: "30000",
        interestIncome: "5000",
        foreignTaxPaid: "1000",
        foreignSourceIncome: "35000",
        isPassiveActivity: false,
      }],
    });

    const withoutExplicit = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "All Foreign LP",
        partnershipEIN: "99-1234567",
        ordinaryIncome: "30000",
        interestIncome: "5000",
        foreignTaxPaid: "1000",
        isPassiveActivity: false,
      }],
    });

    expect(withExplicit.foreignTaxCredit.toNumber()).toBe(withoutExplicit.foreignTaxCredit.toNumber());
  });

  it("K-1 explicit foreignSourceIncome works with multi-category routing", () => {
    // Passive K-1 with explicit foreignSourceIncome should route to passive category
    // General K-1 with explicit foreignSourceIncome should route to general category
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "Vanguard",
        ordinaryDividends: "5000",
        qualifiedDividends: "4000",
        foreignTaxPaid: "100",
        foreignCountry: "Various",
        totalCapitalGainDistributions: "0",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        federalWithheld: "0",
        exemptInterestDividends: "0",
      }],
      scheduleK1: [{
        partnershipName: "International Business LP",
        partnershipEIN: "99-7654321",
        ordinaryIncome: "80000",
        foreignTaxPaid: "2000",
        foreignSourceIncome: "25000",
        foreignTaxCategory: "general",
        isPassiveActivity: false,
      }],
    });

    // Should use multi-category path
    const passiveLines = result.allLines.filter((l) => l.form === "Form 1116 (passive)");
    const generalLines = result.allLines.filter((l) => l.form === "Form 1116 (general)");
    expect(passiveLines.length).toBeGreaterThan(0);
    expect(generalLines.length).toBeGreaterThan(0);

    // General Form 1116 Line 1a should be $25,000 (explicit), not $80,000 (heuristic)
    const generalLine1a = generalLines.find((l) => l.line === "1a");
    expect(generalLine1a).toBeDefined();
    expect(generalLine1a!.value.toNumber()).toBe(25000);
  });

  it("estimateForeignSourceIncomeFromScheduleK1 uses explicit field when provided", () => {
    const income = estimateForeignSourceIncomeFromScheduleK1({
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "Explicit LP",
          partnershipEIN: "99-1111111",
          ordinaryIncome: "100000",
          foreignTaxPaid: "3000",
          foreignSourceIncome: "15000",
        },
        {
          partnershipName: "Heuristic LP",
          partnershipEIN: "99-2222222",
          ordinaryIncome: "50000",
          foreignTaxPaid: "1000",
          // No foreignSourceIncome — falls back to heuristic
        },
      ],
    });
    // Explicit: $15,000 + Heuristic: $50,000 = $65,000
    expect(income.toNumber()).toBe(65000);
  });

  it("estimateForeignSourceIncomeFromScheduleK1 ignores explicit field when foreignTaxPaid is zero", () => {
    const income = estimateForeignSourceIncomeFromScheduleK1({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "No Foreign Tax LP",
        partnershipEIN: "99-3333333",
        ordinaryIncome: "50000",
        foreignTaxPaid: "0",
        foreignSourceIncome: "10000",
      }],
    });
    // No foreignTaxPaid → K-1 is filtered out
    expect(income.toNumber()).toBe(0);
  });

  it("negative foreignSourceIncome floors at zero", () => {
    const income = estimateForeignSourceIncomeFromScheduleK1({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Negative Source LP",
        partnershipEIN: "99-4444444",
        ordinaryIncome: "50000",
        foreignTaxPaid: "500",
        foreignSourceIncome: "-5000",
      }],
    });
    expect(income.toNumber()).toBe(0);
  });
});
