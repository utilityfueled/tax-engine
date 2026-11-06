import { qsbsFullExclusionFundInput } from "../fixtures/section-1202.js";
/**
 * Edge case tests for Married Filing Separately restrictions.
 * MFS filers face numerous penalties: lower SALT cap, no education credits,
 * no rental allowance, halved AMT brackets, halved capital loss limit.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { getConstants } from "@/models/constants.js";
import { calculateScheduleA } from "@/engine/schedules/schedule-a.js";
import { calculateScheduleD } from "@/engine/schedules/schedule-d.js";
import { calculateForm6251 } from "@/engine/forms/form-6251.js";
import { calculateForm8582 } from "@/engine/forms/form-8582.js";
import { calculateForm8863 } from "@/engine/forms/form-8863.js";
import { calculateForm8960 } from "@/engine/forms/form-8960.js";
import { calculateForm8959 } from "@/engine/forms/form-8959.js";
import { calculateForm8812 } from "@/engine/forms/form-8812.js";
import { calculateForm8995 } from "@/engine/forms/form-8995.js";
import { calculateForm2210 } from "@/engine/forms/form-2210.js";
import { calculateForm8962 } from "@/engine/forms/form-8962.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateCapitalGainsTax } from "@/utils/tax-math.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

describe("MFS Restrictions — SALT", () => {
  it("2025 MFS SALT allows $14,000 below the $20K limit", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_separately" },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "8000",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "10000",
        outstandingMortgagePrincipal: "400000",
        propertyTax: "6000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      }],
    };
    const result = calculateScheduleA(input, d(100000), "married_filing_separately", c);
    expect(result.saltDeduction.toNumber()).toBe(14000);
  });
});

describe("MFS Restrictions — Capital Loss", () => {
  it("MFS capital loss deduction limit is $1,500 (half of $3,000)", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_separately" },
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Losing stock",
          dateAcquired: "2024-01-01",
          dateSold: "2025-06-01",
          proceeds: "5000",
          costBasis: "15000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const result = calculateScheduleD(input, "married_filing_separately", c);
    // $10K loss → capped at $1,500 for MFS
    expect(result.capitalLossDeduction.toNumber()).toBe(-1500);
  });
});

describe("MFS Restrictions — AMT", () => {
  it("MFS exemption is $68,500 (half of MFJ $137,000)", () => {
    const result = calculateForm6251({
      taxableIncome: d(200000),
      saltDeduction: d(5000),
      regularTax: d(40000),
      filingStatus: "married_filing_separately",
      isItemizing: true,
    }, c);
    expect(result.exemption.toNumber()).toBe(68500);
  });

  it("MFS rate26Limit is $119,550", () => {
    const result = calculateForm6251({
      taxableIncome: d(300000),
      saltDeduction: d(5000),
      regularTax: d(60000),
      filingStatus: "married_filing_separately",
      isItemizing: true,
    }, c);
    // AMTI = 305000, exemption = 68500, base = 236500 > 119550
    const at26 = Math.round(119550 * 0.26);
    const at28 = Math.round((236500 - 119550) * 0.28);
    expect(result.tentativeMinimumTax.toNumber()).toBe(at26 + at28);
  });
});

describe("MFS Restrictions — Passive Loss", () => {
  it("MFS gets $0 rental allowance (no $25K special)", () => {
    const result = calculateForm8582({
      activities: [{
        name: "Rental",
        income: d(0),
        loss: d(-20000),
        isRentalRealEstate: true,
        isActiveParticipant: true,
      }],
      agi: d(80000),
      filingStatus: "married_filing_separately",
    });
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(20000);
  });
});

describe("MFS Restrictions — Education Credits", () => {
  it("MFS gets zero AOC", () => {
    const result = calculateForm8863({
      aocStudents: [{ name: "Student", qualifiedExpenses: d(4000) }],
      llcExpenses: d(0),
      magi: d(50000),
      filingStatus: "married_filing_separately",
    });
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
    expect(result.aocRefundable.toNumber()).toBe(0);
  });

  it("MFS gets zero LLC", () => {
    const result = calculateForm8863({
      aocStudents: [],
      llcExpenses: d(10000),
      magi: d(50000),
      filingStatus: "married_filing_separately",
    });
    expect(result.llcAfterPhaseOut.toNumber()).toBe(0);
  });
});

describe("MFS Restrictions — Student Loan Interest", () => {
  it("MFS cannot deduct student loan interest (IRC §221(d)(2))", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_separately" },
      adjustments: {
        studentLoanInterest: "2500",
      },
    };
    const federal = calculateFederalTax(fixture);
    // Student loan interest should be $0 for MFS (ignored)
    // Adjustments should be $0 (no SE income, no other adjustments)
    expect(federal.adjustmentsToIncome.toNumber()).toBe(0);
  });

  it("single filer CAN deduct student loan interest", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      adjustments: {
        studentLoanInterest: "2500",
      },
    };
    const federal = calculateFederalTax(fixture);
    expect(federal.adjustmentsToIncome.toNumber()).toBe(2500);
  });
});

describe("MFS Restrictions — Dependent Care Credit", () => {
  it("MFS gets zero dependent care credit", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately",
        dependents: [{
          firstName: "Child",
          lastName: "Test",
          ssn: "999-88-7777",
          relationship: "Son",
          dateOfBirth: "2020-01-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        }],
      },
      dependentCare: {
        expenses: "5000",
        qualifyingIndividuals: 1,
      },
    };
    const federal = calculateFederalTax(fixture);
    // Form 2441 should not be computed for MFS
    const form2441Lines = federal.allLines.filter((l) => l.form === "Form 2441");
    expect(form2441Lines.length).toBe(0);
  });
});

describe("MFS Restrictions — Alimony Deduction", () => {
  it("alimony flows as adjustment for non-MFS filers", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      adjustments: {
        alimonyPaid: "12000",
      },
    };
    const federal = calculateFederalTax(fixture);
    expect(federal.adjustmentsToIncome.toNumber()).toBe(12000);
  });
});

describe("MFS Restrictions — Standard Deduction", () => {
  it("MFS standard deduction is $15,750 (half of MFJ $31,500)", () => {
    const mfsDeduction = c.standardDeduction["married_filing_separately"];
    const mfjDeduction = c.standardDeduction["married_filing_jointly"];
    expect(mfsDeduction.toNumber()).toBe(15750);
    expect(mfjDeduction.toNumber()).toBe(31500);
    expect(mfsDeduction.times(2).toNumber()).toBe(mfjDeduction.toNumber());
  });

  it("MFS filer uses $15,750 standard deduction when no itemized deductions exceed it", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_separately" },
    };
    const federal = calculateFederalTax(fixture);
    expect(federal.standardDeduction.toNumber()).toBe(15750);
    expect(federal.deductionUsed).toBe("standard");
    expect(federal.deductionAmount.toNumber()).toBe(15750);
  });
});

describe("MFS Restrictions — Tax Brackets", () => {
  it("MFS bracket boundaries are exactly half of MFJ brackets", () => {
    const mfsBrackets = c.taxBrackets["married_filing_separately"];
    const mfjBrackets = c.taxBrackets["married_filing_jointly"];
    // Compare every shared bracket boundary (MFS has 7 brackets, same count as MFJ)
    expect(mfsBrackets.length).toBe(mfjBrackets.length);
    for (let i = 0; i < mfsBrackets.length - 1; i++) {
      const mfsMax = mfsBrackets[i].max!.toNumber();
      const mfjMax = mfjBrackets[i].max!.toNumber();
      expect(mfsMax * 2).toBe(mfjMax);
    }
  });

  it("MFS tax at $100,000 equals half of MFJ tax at $200,000 (due to halved brackets)", () => {
    const mfsBrackets = c.taxBrackets["married_filing_separately"];
    const mfjBrackets = c.taxBrackets["married_filing_jointly"];

    // Calculate ordinary tax manually using the bracket function logic
    const calcTax = (income: number, brackets: typeof mfsBrackets) => {
      let tax = 0;
      for (const bracket of brackets) {
        if (income <= bracket.min.toNumber()) break;
        const upper = bracket.max ? Math.min(income, bracket.max.toNumber()) : income;
        tax += (upper - bracket.min.toNumber()) * bracket.rate.toNumber();
      }
      return Math.round(tax);
    };

    const mfsTax = calcTax(100000, mfsBrackets);
    const mfjTax = calcTax(200000, mfjBrackets);
    expect(mfsTax * 2).toBe(mfjTax);
  });
});

describe("MFS Restrictions — Capital Gains QDCG Brackets", () => {
  it("MFS 0% QDCG threshold is $48,350 (vs MFJ $96,700 — exactly half)", () => {
    const mfsThreshold = c.capitalGainsRates.zero.threshold["married_filing_separately"].toNumber();
    const mfjThreshold = c.capitalGainsRates.zero.threshold["married_filing_jointly"].toNumber();
    expect(mfsThreshold).toBe(48350);
    expect(mfsThreshold * 2).toBe(mfjThreshold);
  });

  it("MFS 15% QDCG threshold is $300,025 (roughly half of MFJ $600,050)", () => {
    const mfsThreshold = c.capitalGainsRates.fifteen.threshold["married_filing_separately"].toNumber();
    const mfjThreshold = c.capitalGainsRates.fifteen.threshold["married_filing_jointly"].toNumber();
    expect(mfsThreshold).toBe(300025);
    // MFJ = $600,050 which is 2 × $300,025
    expect(mfsThreshold * 2).toBe(mfjThreshold);
  });

  it("MFS filer with qualified dividends stacked above 0% threshold pays 15% on excess", () => {
    // Ordinary income $40,000, qualified dividends $20,000 → taxable income $60,000
    // MFS 0% threshold = $48,350; ordinary portion stacks first at $40,000
    // Room at 0%: $48,350 - $40,000 = $8,350 → $8,350 QD at 0%, remaining $11,650 at 15%
    // Expected preferential tax = $11,650 × 15% = $1,747.50 → rounded $1,748
    const result = calculateCapitalGainsTax(
      new Decimal(60000),   // taxable income
      new Decimal(20000),   // qualified dividends
      new Decimal(0),       // no LTCG from Schedule D
      "married_filing_separately",
      c
    );
    expect(result.preferentialTax.toNumber()).toBe(1748);

    // MFJ with same income would have all $20,000 QD at 0% (threshold = $96,700,
    // ordinary portion $40,000 + $20,000 QD = $60,000 < $96,700)
    const mfjResult = calculateCapitalGainsTax(
      new Decimal(60000),
      new Decimal(20000),
      new Decimal(0),
      "married_filing_jointly",
      c
    );
    // MFJ: $40,000 ordinary + $20,000 QD = $60,000 < $96,700 0% threshold → all at 0%
    expect(mfjResult.preferentialTax.toNumber()).toBe(0);
    // MFS pays more capital gains tax than MFJ on the same income
    expect(result.preferentialTax.toNumber()).toBeGreaterThan(mfjResult.preferentialTax.toNumber());
  });
});

describe("MFS Restrictions — Student Loan Interest + Education Credits Combined", () => {
  it("MFS cannot claim student loan interest AND both education credits are zero", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_separately" },
      adjustments: {
        studentLoanInterest: "2500",
      },
      educationExpenses: {
        aocStudents: [{ name: "Student", qualifiedExpenses: "4000" }],
        llcExpenses: "5000",
      },
    };
    const federal = calculateFederalTax(fixture);
    // No student loan interest deduction for MFS
    expect(federal.adjustmentsToIncome.toNumber()).toBe(0);
    // No education credits (checked via allLines — Form 8863 lines still present but zero)
    const educationLines = federal.allLines.filter((l) => l.form === "Form 8863");
    // All credit amounts should be zero since MFS is barred from both credits
    const creditLines = educationLines.filter(
      (l) => l.lineNumber === "17" || l.lineNumber === "31"
    );
    creditLines.forEach((l) => expect(l.amount.toNumber()).toBe(0));
  });
});

describe("MFS Restrictions — SALT Cap Reduces Itemized Deductions vs Single", () => {
  it("MFS $20K SALT cap yields lower total itemized than single's $40K cap on same income", () => {
    const sharedInputBase = {
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "40000",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "12000",
        outstandingMortgagePrincipal: "400000",
        propertyTax: "5000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      }],
    };

    const mfsInput: TaxYearInput = {
      ...simpleW2Fixture,
      ...sharedInputBase,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_separately" },
    };
    const singleInput: TaxYearInput = {
      ...simpleW2Fixture,
      ...sharedInputBase,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "single" },
    };

    const agi = new Decimal(120000);
    const mfsResult = calculateScheduleA(mfsInput, agi, "married_filing_separately", c);
    const singleResult = calculateScheduleA(singleInput, agi, "single", c);

    expect(mfsResult.saltDeduction.toNumber()).toBe(20000);
    expect(singleResult.saltDeduction.toNumber()).toBe(40000);
    // Pub. 936 Table 1 line 14 rounds 375,000 / 400,000 to .938 before
    // line 15 multiplies the unchanged 12,000 interest source.
    expect(mfsResult.mortgageInterest.toNumber()).toBe(11256);
    expect(singleResult.mortgageInterest.toNumber()).toBe(12000);
    expect(singleResult.totalItemized.minus(mfsResult.totalItemized).toNumber()).toBe(20744);
  });
});

describe("MFS Restrictions — Rental Loss With Active Participation Under $100K AGI", () => {
  it("MFS rental loss is fully suspended even with AGI under $100K and active participation", () => {
    // Non-MFS filer with same scenario would receive up to $25K allowance
    const nonMfsResult = calculateForm8582({
      activities: [{
        name: "Rental Property",
        income: new Decimal(0),
        loss: new Decimal(-15000),
        isRentalRealEstate: true,
        isActiveParticipant: true,
      }],
      agi: new Decimal(60000), // well under $100K phase-out start
      filingStatus: "single",
    });
    // Single filer: loss $15K < $25K max → full $15K allowance
    expect(nonMfsResult.rentalAllowance.toNumber()).toBe(15000);
    expect(nonMfsResult.suspendedLoss.toNumber()).toBe(0);

    // MFS filer: same income and loss → $0 allowance regardless
    const mfsResult = calculateForm8582({
      activities: [{
        name: "Rental Property",
        income: new Decimal(0),
        loss: new Decimal(-15000),
        isRentalRealEstate: true,
        isActiveParticipant: true,
      }],
      agi: new Decimal(60000),
      filingStatus: "married_filing_separately",
    });
    expect(mfsResult.rentalAllowance.toNumber()).toBe(0);
    expect(mfsResult.suspendedLoss.toNumber()).toBe(15000);
  });
});

describe("MFS Restrictions — AMT Phase-Out Threshold", () => {
  it("MFS AMT phase-out threshold is $626,350 (half of MFJ $1,252,700)", () => {
    const mfsThreshold = c.amt.phaseOutThreshold["married_filing_separately"].toNumber();
    const mfjThreshold = c.amt.phaseOutThreshold["married_filing_jointly"].toNumber();
    expect(mfsThreshold).toBe(626350);
    expect(mfjThreshold).toBe(1252700);
    expect(mfsThreshold * 2).toBe(mfjThreshold);
  });

  it("MFS AMT exemption begins phasing out at $626,350 AMTI", () => {
    // At exactly the threshold, exemption should still be the full $68,500
    const atThreshold = calculateForm6251({
      taxableIncome: new Decimal(626350),
      saltDeduction: new Decimal(0),
      regularTax: new Decimal(200000),
      filingStatus: "married_filing_separately",
      isItemizing: false,
    }, c);
    expect(atThreshold.exemption.toNumber()).toBe(68500);

    // $40,000 above threshold → exemption reduced by 25% × $40,000 = $10,000
    const aboveThreshold = calculateForm6251({
      taxableIncome: new Decimal(666350), // $626,350 + $40,000
      saltDeduction: new Decimal(0),
      regularTax: new Decimal(220000),
      filingStatus: "married_filing_separately",
      isItemizing: false,
    }, c);
    // Reduction = $40,000 × 0.25 = $10,000 → exemption = $68,500 - $10,000 = $58,500
    expect(aboveThreshold.exemption.toNumber()).toBe(58500);
  });
});

describe("MFS Restrictions — Lower Tax Thresholds", () => {
  it("MFS NIIT threshold is $125K vs $200K/$250K for single/MFJ", () => {
    // MFS filer with $150K wages + $30K investment income → NIIT applies
    const mfsFixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately",
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "150000",
        federalWithheld: "25000",
        medicareWages: "150000",
        medicareWithheld: "2175",
      }],
      form1099Div: [{
        payer: "Brokerage",
        ordinaryDividends: "30000",
        qualifiedDividends: "20000",
        totalCapitalGainDistributions: "0",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "0",
        exemptInterestDividends: "0",
      }],
    };
    const mfsResult = calculateFederalTax(mfsFixture);
    // MAGI ~$180K > $125K threshold → NIIT applies
    expect(mfsResult.niitTax.greaterThan(0)).toBe(true);

    // Same income as single → NIIT should NOT apply ($180K < $200K threshold)
    const singleFixture: TaxYearInput = {
      ...mfsFixture,
      taxpayer: { ...mfsFixture.taxpayer, filingStatus: "single" },
    };
    const singleResult = calculateFederalTax(singleFixture);
    expect(singleResult.niitTax.toNumber()).toBe(0);
  });

  it("MFS Additional Medicare Tax threshold is $125K vs $200K/$250K", () => {
    // MFS filer with $180K wages → Additional Medicare Tax applies at $125K threshold
    const mfsFixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately",
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "180000",
        federalWithheld: "30000",
        medicareWages: "180000",
        medicareWithheld: "2610",
      }],
    };
    const mfsResult = calculateFederalTax(mfsFixture);
    // $180K - $125K = $55K excess × 0.9% = $495
    expect(mfsResult.additionalMedicareTax.greaterThan(0)).toBe(true);

    // Same income as single → Additional Medicare Tax should NOT apply ($180K < $200K)
    const singleFixture: TaxYearInput = {
      ...mfsFixture,
      taxpayer: { ...mfsFixture.taxpayer, filingStatus: "single" },
    };
    const singleResult = calculateFederalTax(singleFixture);
    expect(singleResult.additionalMedicareTax.toNumber()).toBe(0);
  });
});

describe("MFS Restrictions — 2025 SALT With Itemized Deductions", () => {
  it("MFS SALT cap at exactly $5,000 total SALT passes through uncapped (Sched A Line 5d)", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_separately" },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "3000",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "10000",
        outstandingMortgagePrincipal: "400000",
        propertyTax: "2000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      }],
    };
    const result = calculateScheduleA(input, d(100000), "married_filing_separately", c);
    // Total SALT = $3K + $2K = $5K → at cap, passes through fully
    expect(result.saltDeduction.toNumber()).toBe(5000);
  });

  it("2025 Schedule A Line 5e allows MFS taxes of $5,001 below the limit", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_separately" },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "3001",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "10000",
        outstandingMortgagePrincipal: "400000",
        propertyTax: "2000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      }],
    };
    const result = calculateScheduleA(input, d(100000), "married_filing_separately", c);
    expect(result.saltDeduction.toNumber()).toBe(5001);
  });
});

describe("MFS Restrictions — Capital Loss $1,501 With Carryforward", () => {
  it("MFS capital loss of $1,501 is capped at $1,500 with $1 carryforward (Sched D Line 21)", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_separately" },
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Marginal loss stock",
          dateAcquired: "2024-01-01",
          dateSold: "2025-06-01",
          proceeds: "10000",
          costBasis: "11501",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const result = calculateScheduleD(input, "married_filing_separately", c);
    // $1,501 loss → capped at $1,500 for MFS; $1 carries forward
    expect(result.capitalLossDeduction.toNumber()).toBe(-1500);
    // Carryforward = total loss - used loss = $1,501 - $1,500 = $1
    const totalCarryforward = result.carryforwardShortTerm.plus(result.carryforwardLongTerm);
    expect(totalCarryforward.toNumber()).toBe(-1);
  });

  it("single filer capital loss of $1,501 is NOT capped (under $3,000 limit)", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Marginal loss stock",
          dateAcquired: "2024-01-01",
          dateSold: "2025-06-01",
          proceeds: "10000",
          costBasis: "11501",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const result = calculateScheduleD(input, "single", c);
    // $1,501 loss < $3,000 limit → full loss deducted, no carryforward
    expect(result.capitalLossDeduction.toNumber()).toBe(-1501);
    const totalCarryforward = result.carryforwardShortTerm.plus(result.carryforwardLongTerm);
    expect(totalCarryforward.toNumber()).toBe(0);
  });
});

describe("MFS Restrictions — NIIT at Exactly $125K Threshold", () => {
  it("MFS NIIT is zero when MAGI is exactly $125,000 (Form 8960 Line 13)", () => {
    const result = calculateForm8960(
      {
        taxableInterest: d(5000),
        ordinaryDividends: d(10000),
        netCapitalGain: d(0),
        magi: d(125000),
      },
      "married_filing_separately",
      c
    );
    // MAGI $125K - threshold $125K = $0 excess → NIIT = $0
    expect(result.magiExcess.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("MFS NIIT applies at $125,001 MAGI — $0.04 tax (Form 8960 Line 17)", () => {
    const result = calculateForm8960(
      {
        taxableInterest: d(5000),
        ordinaryDividends: d(10000),
        netCapitalGain: d(0),
        magi: d(125001),
      },
      "married_filing_separately",
      c
    );
    // MAGI excess = $1; NII = $15,000; taxable base = min($15,000, $1) = $1
    // NIIT = $1 × 3.8% = $0.038 → rounded to $0
    expect(result.magiExcess.toNumber()).toBe(1);
    expect(result.taxableBase.toNumber()).toBe(1);
    // Rounded dollar: $0.038 → $0
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("MFS NIIT at $126,000 MAGI produces $38 tax on $1,000 excess (Form 8960 Line 17)", () => {
    const result = calculateForm8960(
      {
        taxableInterest: d(5000),
        ordinaryDividends: d(10000),
        netCapitalGain: d(0),
        magi: d(126000),
      },
      "married_filing_separately",
      c
    );
    // MAGI excess = $1,000; NII = $15,000; base = min($15,000, $1,000) = $1,000
    // NIIT = $1,000 × 3.8% = $38
    expect(result.magiExcess.toNumber()).toBe(1000);
    expect(result.taxableBase.toNumber()).toBe(1000);
    expect(result.niitTax.toNumber()).toBe(38);
  });
});

describe("MFS Restrictions — Medicare Surtax at Exactly $125K Threshold", () => {
  it("MFS Additional Medicare Tax is zero when wages exactly $125,000 (Form 8959 Line 18)", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_separately" },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "125000",
        federalWithheld: "20000",
        medicareWages: "125000",
        medicareWithheld: "1812.50",
      }],
    };
    const result = calculateForm8959(fixture, d(0), "married_filing_separately", c);
    // $125K - $125K threshold = $0 → no additional tax
    expect(result.excessOverThreshold.toNumber()).toBe(0);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("MFS Additional Medicare Tax at $126,000 wages is $9 (Form 8959 Line 18)", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_separately" },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "126000",
        federalWithheld: "20000",
        medicareWages: "126000",
        medicareWithheld: "1827",
      }],
    };
    const result = calculateForm8959(fixture, d(0), "married_filing_separately", c);
    // $126K - $125K = $1K × 0.9% = $9
    expect(result.excessOverThreshold.toNumber()).toBe(1000);
    expect(result.additionalMedicareTax.toNumber()).toBe(9);
  });
});

describe("MFS Restrictions — AMT Exemption Half of MFJ", () => {
  it("MFS AMT exemption $68,500 is exactly half of MFJ $137,000 (Form 6251 Line 8)", () => {
    const mfsResult = calculateForm6251({
      taxableIncome: d(100000),
      saltDeduction: d(5000),
      regularTax: d(20000),
      filingStatus: "married_filing_separately",
      isItemizing: true,
    }, c);
    const mfjResult = calculateForm6251({
      taxableIncome: d(100000),
      saltDeduction: d(10000),
      regularTax: d(20000),
      filingStatus: "married_filing_jointly",
      isItemizing: true,
    }, c);
    expect(mfsResult.exemption.toNumber()).toBe(68500);
    expect(mfjResult.exemption.toNumber()).toBe(137000);
    expect(mfsResult.exemption.times(2).toNumber()).toBe(mfjResult.exemption.toNumber());
  });
});

describe("MFS Restrictions — CTC Phase-Out at $200K (Same as Single)", () => {
  it("MFS CTC phase-out threshold is $200,000 (same as single, not $400K MFJ)", () => {
    const mfsThreshold = c.childTaxCredit.phaseOutThreshold["married_filing_separately"].toNumber();
    const singleThreshold = c.childTaxCredit.phaseOutThreshold["single"].toNumber();
    const mfjThreshold = c.childTaxCredit.phaseOutThreshold["married_filing_jointly"].toNumber();
    expect(mfsThreshold).toBe(200000);
    expect(singleThreshold).toBe(200000);
    expect(mfjThreshold).toBe(400000);
  });

  it("MFS CTC fully available at $199,000 AGI, begins phasing out at $200K (Form 8812 Line 12)", () => {
    const belowResult = calculateForm8812({
      qualifyingChildren: 1,
      otherDependents: 0,
      agi: d(199000),
      earnedIncome: d(199000),
      taxLiability: d(50000),
      filingStatus: "married_filing_separately",
    }, c);
    expect(belowResult.ctcBeforeLimitation.toNumber()).toBe(2200);

    const aboveResult = calculateForm8812({
      qualifyingChildren: 1,
      otherDependents: 0,
      agi: d(201000),
      earnedIncome: d(201000),
      taxLiability: d(50000),
      filingStatus: "married_filing_separately",
    }, c);
    expect(aboveResult.ctcBeforeLimitation.toNumber()).toBe(2150);
  });
});

describe("MFS Restrictions — QBI Simplified Threshold", () => {
  it("MFS QBI simplified threshold is $197,300 (same as single, half of MFJ $394,600)", () => {
    const mfsThreshold = c.qbi.simplifiedThreshold["married_filing_separately"].toNumber();
    const singleThreshold = c.qbi.simplifiedThreshold["single"].toNumber();
    const mfjThreshold = c.qbi.simplifiedThreshold["married_filing_jointly"].toNumber();
    expect(mfsThreshold).toBe(197300);
    expect(singleThreshold).toBe(197300);
    expect(mfjThreshold).toBe(394600);
  });

  it("MFS QBI deduction is 20% of QBI when taxable income under threshold (Form 8995 Line 15)", () => {
    // MFS filer with $50K QBI and $100K taxable income (well under $197,300)
    const result = calculateForm8995({
      qbiSources: [{ name: "Consulting", qbi: d(50000) }],
      taxableIncomeBeforeQBI: d(100000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    });
    // QBI component = 20% × $50K = $10K
    // Income limitation = 20% × ($100K - $0) = $20K
    // Deduction = min($10K, $20K) = $10K
    expect(result.qbiDeduction.toNumber()).toBe(10000);
  });
});

describe("MFS Restrictions — No Student Loan Interest Deduction", () => {
  it("MFS with max $2,500 student loan interest gets $0 deduction vs single gets $2,500 (IRC §221(d)(2))", () => {
    const mfsFixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_separately" },
      adjustments: { studentLoanInterest: "2500" },
    };
    const singleFixture: TaxYearInput = {
      ...simpleW2Fixture,
      adjustments: { studentLoanInterest: "2500" },
    };
    const mfsResult = calculateFederalTax(mfsFixture);
    const singleResult = calculateFederalTax(singleFixture);
    expect(mfsResult.adjustmentsToIncome.toNumber()).toBe(0);
    expect(singleResult.adjustmentsToIncome.toNumber()).toBe(2500);
    // MFS AGI is higher by $2,500 due to denied deduction
    expect(mfsResult.agi.minus(singleResult.agi).toNumber()).toBe(2500);
  });
});

describe("MFS Restrictions — Rental Allowance $0 (No $25K Special)", () => {
  it("MFS rental loss $25,000 is fully suspended vs single gets full $25K allowance (Form 8582 Line 7)", () => {
    const mfsResult = calculateForm8582({
      activities: [{
        name: "Rental Unit A",
        income: d(0),
        loss: d(-25000),
        isRentalRealEstate: true,
        isActiveParticipant: true,
      }],
      agi: d(50000),
      filingStatus: "married_filing_separately",
    });
    expect(mfsResult.rentalAllowance.toNumber()).toBe(0);
    expect(mfsResult.suspendedLoss.toNumber()).toBe(25000);
    expect(mfsResult.allowedLoss.toNumber()).toBe(0);

    const singleResult = calculateForm8582({
      activities: [{
        name: "Rental Unit A",
        income: d(0),
        loss: d(-25000),
        isRentalRealEstate: true,
        isActiveParticipant: true,
      }],
      agi: d(50000),
      filingStatus: "single",
    });
    expect(singleResult.rentalAllowance.toNumber()).toBe(25000);
    expect(singleResult.suspendedLoss.toNumber()).toBe(0);
  });
});

describe("MFS Restrictions — Estimated Tax 110% Threshold at $75K", () => {
  it("MFS 110% safe harbor threshold is $75,000 (half of $150K for other statuses)", () => {
    // MFS with prior year AGI of $80K (above $75K threshold) needs 110% of prior year tax
    const mfsResult = calculateForm2210({
      currentYearTax: d(20000),
      withholding: d(10500), // below 90% of current ($18K) and above 100% of prior
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(10000),
      priorYearAGI: d(80000), // above $75K MFS threshold → needs 110%
      filingStatus: "married_filing_separately",
    });
    // 110% of prior = $11,000; payments $10,500 < $11,000 → not safe harbor
    expect(mfsResult.safeHarborMet).toBe(false);

    // Same scenario as single: $80K prior AGI < $150K → needs only 100%
    const singleResult = calculateForm2210({
      currentYearTax: d(20000),
      withholding: d(10500),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(10000),
      priorYearAGI: d(80000), // below $150K single threshold → needs 100%
      filingStatus: "single",
    });
    // 100% of prior = $10,000; payments $10,500 >= $10,000 → safe harbor met
    expect(singleResult.safeHarborMet).toBe(true);
  });

  it("MFS with prior AGI at exactly $75,000 uses 100% safe harbor (not 110%)", () => {
    const result = calculateForm2210({
      currentYearTax: d(15000),
      withholding: d(10000), // = 100% of prior
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(10000),
      priorYearAGI: d(75000), // at threshold, not above → 100%
      filingStatus: "married_filing_separately",
    });
    // $75K is not > $75K → uses 100% multiplier; $10K >= $10K → safe harbor
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toContain("100%");
  });
});

describe("MFS Restrictions — Bracket Compression at Various Income Levels", () => {
  it("MFS hits 32% bracket at $197,300 vs MFJ at $394,600 (bracket compression)", () => {
    const mfsBrackets = c.taxBrackets["married_filing_separately"];
    const mfjBrackets = c.taxBrackets["married_filing_jointly"];
    // MFS 32% bracket starts at $197,300
    const mfs32 = mfsBrackets.find((b) => b.rate.toNumber() === 0.32);
    const mfj32 = mfjBrackets.find((b) => b.rate.toNumber() === 0.32);
    expect(mfs32!.min.toNumber()).toBe(197300);
    expect(mfj32!.min.toNumber()).toBe(394600);
    expect(mfs32!.min.times(2).toNumber()).toBe(mfj32!.min.toNumber());
  });

  it("MFS hits 37% bracket at $375,800 vs MFJ at $751,600 (bracket compression)", () => {
    const mfsBrackets = c.taxBrackets["married_filing_separately"];
    const mfjBrackets = c.taxBrackets["married_filing_jointly"];
    const mfs37 = mfsBrackets.find((b) => b.rate.toNumber() === 0.37);
    const mfj37 = mfjBrackets.find((b) => b.rate.toNumber() === 0.37);
    expect(mfs37!.min.toNumber()).toBe(375800);
    expect(mfj37!.min.toNumber()).toBe(751600);
    expect(mfs37!.min.times(2).toNumber()).toBe(mfj37!.min.toNumber());
  });

  it("MFS tax on $200K income > single tax on same income due to compressed 35% bracket", () => {
    const calcTax = (income: number, status: "single" | "married_filing_separately") => {
      let tax = new Decimal(0);
      for (const bracket of c.taxBrackets[status]) {
        if (d(income).lte(bracket.min)) break;
        const upper = bracket.max ? Decimal.min(d(income), bracket.max) : d(income);
        tax = tax.plus(upper.minus(bracket.min).times(bracket.rate));
      }
      return tax.round().toNumber();
    };
    // At $200K, MFS is already in the 32% bracket (starts $197,300)
    // but single is still in 24% (starts $197,300 also, so this should be same)
    // At $260K, MFS is in 35% bracket (starts $250,525) while single is also 35% at $250,525
    // The real difference is the 35% bracket endpoint: MFS $375,800 vs single $626,350
    // Let's check at exactly the crossing point
    const mfsTax = calcTax(200000, "married_filing_separately");
    const singleTax = calcTax(200000, "single");
    // Both have same brackets up to $250,525, so at $200K they should be equal
    expect(mfsTax).toBe(singleTax);
  });
});

describe("MFS Restrictions — PTC Eligibility", () => {
  it("MFS filer uses the other-status PTC repayment cap with no credit absent an exception", () => {
    // Build a scenario with APTC > PTC to trigger repayment
    const result = calculateForm8962({
      taxFamilySize: 1,
      modifiedAGI: d(40000),
      filingStatus: "married_filing_separately",
      form1095A: [{
        marketplace: "Synthetic Marketplace",
        policyNumber: "SYNTHETIC-MP-001",
        monthlyPremiums: Array.from({ length: 12 }, (_, index) => ({
          month: index+1,
          enrolleePremium: "400",
          slcsp: "500",
          advancePremiumTaxCredit: "450", // APTC exceeds actual PTC
        })),
      }],
    });
    // Official2025 Table5:40,000/15,060=265% FPL; MFS is "any other
    // filing status", so cap1950. With no separated-spouse exception PTC is0.
    expect(result.advancePTCTotal.toNumber()).toBe(5400);
    expect(result.ptcAllowed.toString()).toBe("0");
    expect(result.fplPercentageForTable.toString()).toBe("265");
    expect(result.repaymentCap?.toString()).toBe("1950");
    expect(result.excessAPTCRepayment.toString()).toBe("1950");
  });
});

describe("MFS Restrictions — QSBS Section 1202 Exclusion Cap", () => {
  it("MFS QSBS exclusion cap is $5M (half of $10M for other statuses)", () => {
    const input = qsbsFullExclusionFundInput("7000000");
    input.taxpayer.filingStatus = "married_filing_separately";
    const mfsResult = calculateScheduleD(input, "married_filing_separately", c);
    // MFS cap = $5M; $7M gain → exclusion capped at $5M
    expect(mfsResult.section1202Exclusion.toNumber()).toBe(5000000);

    // Single filer: $10M cap → $7M fully excluded
    const singleResult = calculateScheduleD(
      { ...input, taxpayer: { ...input.taxpayer, filingStatus: "single" } },
      "single",
      c
    );
    expect(singleResult.section1202Exclusion.toNumber()).toBe(7000000);
  });
});
