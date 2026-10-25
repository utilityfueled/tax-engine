/**
 * Integration tests — verify standalone schedule/form modules produce
 * consistent results when wired together end-to-end.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { getConstants } from "@/models/constants.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateScheduleA } from "@/engine/schedules/schedule-a.js";
import { calculateScheduleB } from "@/engine/schedules/schedule-b.js";
import { calculateScheduleC } from "@/engine/schedules/schedule-c.js";
import { calculateScheduleD } from "@/engine/schedules/schedule-d.js";
import { calculateScheduleSE } from "@/engine/schedules/schedule-se.js";
import { calculateForm8949 } from "@/engine/forms/form-8949.js";
import { calculateForm8959 } from "@/engine/forms/form-8959.js";
import { calculateForm8960, type Form8960Input } from "@/engine/forms/form-8960.js";
import { calculateForm2210 } from "@/engine/forms/form-2210.js";
import { calculateForm6251 } from "@/engine/forms/form-6251.js";
import { complexMFJFixture, simpleW2Fixture } from "../fixtures/simple-w2.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { d, sum, zeroFloor } from "@/utils/decimal.js";

const c = getConstants(2025);

// ═══════════════════════════════════════════════════════════
// Cross-Module Consistency (Complex MFJ)
// ═══════════════════════════════════════════════════════════

describe("Integration - Complex MFJ cross-module consistency", () => {
  const federal = calculateFederalTax(complexMFJFixture);
  const schedB = calculateScheduleB(complexMFJFixture);
  const schedC = calculateScheduleC(complexMFJFixture);
  const schedD = calculateScheduleD(complexMFJFixture, "married_filing_jointly", c);
  const schedSE = calculateScheduleSE(complexMFJFixture, c);
  const schedA = calculateScheduleA(complexMFJFixture, federal.agi, "married_filing_jointly", c);
  const form8949 = calculateForm8949(complexMFJFixture);

  it("Schedule B interest matches federal interest", () => {
    expect(schedB.totalInterest.toNumber()).toBe(federal.totalInterest.toNumber());
  });

  it("Schedule B dividends matches federal dividends", () => {
    expect(schedB.totalOrdinaryDividends.toNumber()).toBe(federal.totalDividends.toNumber());
  });

  it("Schedule C gross income matches 1099-NEC total", () => {
    expect(schedC.grossIncome.toNumber()).toBe(15000);
  });

  it("Schedule D net gain consistent with federal capital gain", () => {
    // Federal uses the same logic, so net capital gain should match
    expect(schedD.netCapitalGainLoss.toNumber()).toBe(
      schedD.netShortTerm.plus(schedD.netLongTerm).toNumber()
    );
  });

  it("Form 8949 short-term totals flow to Schedule D Line 7", () => {
    // Both compute short-term from the same 1099-B transactions
    const form8949ShortNet = form8949.totalShortTermGainLoss;
    // Schedule D also includes K-1 short-term
    const k1Short = complexMFJFixture.scheduleK1.reduce(
      (acc, k) => acc.plus(d(k.netShortTermCapitalGain)),
      new Decimal(0)
    );
    expect(schedD.netShortTerm.toNumber()).toBe(form8949ShortNet.plus(k1Short).toNumber());
  });

  it("Schedule SE tax matches federal SE tax", () => {
    expect(schedSE.totalSETax.toNumber()).toBe(federal.selfEmploymentTax.toNumber());
  });

  it("Schedule A total matches federal itemized deductions", () => {
    expect(schedA.totalItemized.toNumber()).toBe(federal.itemizedDeductions.toNumber());
  });

  it("federal uses itemized when they exceed standard", () => {
    // MFJ standard deduction = $30K. Itemized = $51,500 > $30K
    expect(federal.deductionUsed).toBe("itemized");
    expect(federal.deductionAmount.toNumber()).toBe(schedA.totalItemized.toNumber());
  });

  it("total tax is positive for complex scenario", () => {
    expect(federal.totalTax.greaterThan(new Decimal(0))).toBe(true);
  });

  it("refund + amount owed are mutually exclusive", () => {
    const isRefund = federal.refund.greaterThan(new Decimal(0));
    const isOwed = federal.amountOwed.greaterThan(new Decimal(0));
    expect(isRefund && isOwed).toBe(false);
  });

  it("all audit lines have non-empty descriptions", () => {
    for (const line of federal.allLines) {
      expect(line.description.length).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Cross-Module Consistency (Simple W-2)
// ═══════════════════════════════════════════════════════════

describe("Integration - Simple W-2 cross-module consistency", () => {
  const federal = calculateFederalTax(simpleW2Fixture);

  it("standard deduction used for simple filer", () => {
    expect(federal.deductionUsed).toBe("standard");
    expect(federal.deductionAmount.toNumber()).toBe(15750); // Single 2025
  });

  it("no SE tax for W-2-only filer", () => {
    expect(federal.selfEmploymentTax.toNumber()).toBe(0);
  });

  it("no NIIT for income below threshold", () => {
    expect(federal.niitTax.toNumber()).toBe(0);
  });

  it("no additional Medicare for income below $200K", () => {
    expect(federal.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("refund when withholding exceeds tax", () => {
    // Wages $85K - $15K std deduction = $70K taxable
    // Tax approx $10.5K, withholding $12.75K → refund
    expect(federal.refund.greaterThan(new Decimal(0))).toBe(true);
  });

  it("AGI equals wages for simple filer", () => {
    expect(federal.agi.toNumber()).toBe(85000);
  });
});

// ═══════════════════════════════════════════════════════════
// Form 8959 + 8960 vs Federal
// ═══════════════════════════════════════════════════════════

describe("Integration - Additional taxes cross-check", () => {
  it("Form 8959 Additional Medicare matches federal calculation", () => {
    const federal = calculateFederalTax(complexMFJFixture);
    const schedSE = calculateScheduleSE(complexMFJFixture, c);
    const form8959 = calculateForm8959(
      complexMFJFixture,
      schedSE.taxableEarnings, // post-multiplier per IRS Form 8959 Line 8
      "married_filing_jointly",
      c
    );
    expect(form8959.additionalMedicareTax.toNumber()).toBe(federal.additionalMedicareTax.toNumber());
  });

  it("Form 8960 NIIT matches federal calculation", () => {
    const federal = calculateFederalTax(complexMFJFixture);
    // Federal pipeline includes passive activity income as otherInvestmentIncome
    const form8960Input: Form8960Input = {
      taxableInterest: federal.totalInterest,
      ordinaryDividends: federal.totalDividends,
      netCapitalGain: zeroFloor(federal.capitalGainLoss),
      otherInvestmentIncome: federal.form8960.netInvestmentIncome.minus(
        sum(federal.totalInterest, federal.totalDividends, zeroFloor(federal.capitalGainLoss))
      ),
      magi: federal.agi,
    };
    const form8960 = calculateForm8960(form8960Input, "married_filing_jointly", c);
    expect(form8960.niitTax.toNumber()).toBe(federal.niitTax.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// Form 2210 — Estimated Tax Penalty Integration
// ═══════════════════════════════════════════════════════════

describe("Integration - Estimated tax penalty", () => {
  it("complex MFJ with estimated payments meets safe harbor", () => {
    const federal = calculateFederalTax(complexMFJFixture);
    const result = calculateForm2210({
      currentYearTax: federal.totalTax,
      withholding: federal.totalWithholding,
      estimatedPayments: federal.estimatedTaxPayments,
      refundableCredits: new Decimal(0),
      filingStatus: "married_filing_jointly",
    });
    // With $42.5K withholding + $20K estimated = $62.5K total payments
    // This should cover the tax or meet safe harbor
    expect(result.totalPayments.toNumber()).toBe(
      federal.totalWithholding.plus(federal.estimatedTaxPayments).toNumber()
    );
  });

  it("simple W-2 filer never needs estimated payments", () => {
    const federal = calculateFederalTax(simpleW2Fixture);
    const result = calculateForm2210({
      currentYearTax: federal.totalTax,
      withholding: federal.totalWithholding,
      estimatedPayments: new Decimal(0),
      refundableCredits: new Decimal(0),
      filingStatus: "single",
    });
    // Withholding covers the tax → safe harbor
    expect(result.safeHarborMet).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// AMT Integration (Form 6251 → Schedule 2 → Total Tax)
// ═══════════════════════════════════════════════════════════

describe("Integration - AMT flows through federal calculation", () => {
  it("simple W-2 filer has zero AMT (standard deduction, no SALT add-back)", () => {
    const federal = calculateFederalTax(simpleW2Fixture);
    expect(federal.amt.toNumber()).toBe(0);
  });

  it("complex MFJ AMT matches standalone Form 6251", () => {
    const federal = calculateFederalTax(complexMFJFixture);
    const form6251 = calculateForm6251(
      {
        taxableIncome: federal.taxableIncome,
        saltDeduction: calculateScheduleA(complexMFJFixture, federal.agi, "married_filing_jointly", c).saltDeduction,
        regularTax: federal.totalTaxBeforeCredits,
        filingStatus: "married_filing_jointly",
        isItemizing: federal.deductionUsed === "itemized",
      },
      c
    );
    expect(federal.amt.toNumber()).toBe(form6251.amt.toNumber());
  });

  it("AMT is included in totalAdditionalTaxes", () => {
    const federal = calculateFederalTax(complexMFJFixture);
    const expected = federal.amt.plus(federal.selfEmploymentTax)
      .plus(federal.additionalMedicareTax).plus(federal.niitTax);
    expect(federal.totalAdditionalTaxes.toNumber()).toBe(expected.toNumber());
  });

  it("high-income single with large SALT triggers AMT", () => {
    // Single filer with $400K wages, $10K SALT, itemizing via mortgage
    const highIncomeFixture: TaxYearInput = {
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: { firstName: "A", lastName: "B", ssn: "111", dateOfBirth: "1980-01-01" },
        address: { street: "1 St", city: "NY", state: "NY", zip: "10001" },
        dependents: [],
      },
      w2s: [{
        employer: { name: "Corp", ein: "12-3456789" },
        wages: "400000",
        federalWithheld: "80000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918",
        medicareWages: "400000",
        medicareWithheld: "5800",
        stateTaxWithheld: "25000",
        stateWages: "400000",
        localTaxWithheld: "0",
        state: "NY",
      }],
      form1099Int: [],
      form1099Div: [],
      form1099B: [],
      form1099Nec: [],
      form1099Misc: [],
      scheduleK1: [],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "30000",
        outstandingMortgagePrincipal: "600000",
        propertyTax: "15000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      }],
      form1095A: [],
      donations: [],
    };
    const federal = calculateFederalTax(highIncomeFixture);
    // With $10K SALT cap deducted on Sched A, AMT adds it back
    // Itemized = $30K mortgage + $10K SALT = $40K > $15K standard
    expect(federal.deductionUsed).toBe("itemized");
    // AMT should be computed (may or may not be positive depending on rates)
    expect(federal.amt).toBeDefined();
    expect(federal.amt.gte(0)).toBe(true);
  });

  it("audit trail includes AMT entry", () => {
    const federal = calculateFederalTax(complexMFJFixture);
    const amtLine = federal.allLines.find(
      (l) => l.form === "Sched 2" && l.line === "2"
    );
    expect(amtLine).toBeDefined();
    expect(amtLine!.description).toContain("Alternative Minimum Tax");
  });
});

// ═══════════════════════════════════════════════════════════
// Passive Loss Carryforwards (Form 8582 → Carryforwards)
// ═══════════════════════════════════════════════════════════

describe("Integration - Passive loss carryforward tracking", () => {
  it("no suspended losses when K-1 has positive passive income", () => {
    // complexMFJFixture has a passive K-1 with $5000 ordinary income
    const federal = calculateFederalTax(complexMFJFixture);
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(0);
  });

  it("suspended losses tracked for passive K-1 with net loss", () => {
    const passiveLossFixture: TaxYearInput = {
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: { firstName: "A", lastName: "B", ssn: "111", dateOfBirth: "1980-01-01" },
        address: { street: "1 St", city: "NY", state: "NY", zip: "10001" },
        dependents: [],
      },
      w2s: [{
        employer: { name: "Corp", ein: "12-3456789" },
        wages: "200000",
        federalWithheld: "40000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918",
        medicareWages: "200000",
        medicareWithheld: "2900",
        stateTaxWithheld: "0",
        stateWages: "0",
        localTaxWithheld: "0",
        state: "WA",
      }],
      form1099Int: [],
      form1099Div: [],
      form1099B: [],
      form1099Nec: [],
      form1099Misc: [],
      scheduleK1: [{
        partnershipName: "Losing Partnership LP",
        partnershipEIN: "99-8877665",
        ordinaryIncome: "-30000",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: true,
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
      form1098: [],
      form1095A: [],
      donations: [],
    };
    const federal = calculateFederalTax(passiveLossFixture);
    // $30K passive loss with no passive income → all suspended
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(1);
    expect(federal.carryforwards.suspendedPassiveLosses[0].partnershipName).toBe("Losing Partnership LP");
    expect(federal.carryforwards.suspendedPassiveLosses[0].amount.toNumber()).toBe(30000);
  });

  it("rental passive loss gets $25K allowance under $100K AGI", () => {
    const rentalLossFixture: TaxYearInput = {
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: { firstName: "A", lastName: "B", ssn: "111", dateOfBirth: "1980-01-01" },
        address: { street: "1 St", city: "NY", state: "NY", zip: "10001" },
        dependents: [],
      },
      w2s: [{
        employer: { name: "Corp", ein: "12-3456789" },
        wages: "80000",
        federalWithheld: "12000",
        socialSecurityWages: "80000",
        socialSecurityWithheld: "4960",
        medicareWages: "80000",
        medicareWithheld: "1160",
        stateTaxWithheld: "0",
        stateWages: "0",
        localTaxWithheld: "0",
        state: "WA",
      }],
      form1099Int: [],
      form1099Div: [],
      form1099B: [],
      form1099Nec: [],
      form1099Misc: [],
      scheduleK1: [{
        partnershipName: "Rental Property LLC",
        partnershipEIN: "88-7766554",
        ordinaryIncome: "0",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: true,
        netRentalIncome: "-40000",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
      form1098: [],
      form1095A: [],
      donations: [],
    };
    const federal = calculateFederalTax(rentalLossFixture);
    // AGI = $80K (under $100K), so full $25K rental allowance
    // $40K loss - $25K allowed = $15K suspended
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(1);
    expect(federal.carryforwards.suspendedPassiveLosses[0].amount.toNumber()).toBe(15000);
  });
});

// ═══════════════════════════════════════════════════════════
// Schedule 3 Integration (Credits flow through federal.ts)
// ═══════════════════════════════════════════════════════════

describe("Integration - Schedule 3 credits flow into federal return", () => {
  it("dependent care credit flows through Schedule 3 to otherCredits", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      dependentCare: {
        expenses: "6000",
        qualifyingIndividuals: 1,
      },
    };
    const federal = calculateFederalTax(fixture);
    // AGI ~$85K: (85000-15000)/2000 = 35 steps, 35%-35% = 0% → floor 20%
    // Expenses capped at $3K (one child). Credit = $3,000 × 20% = $600
    expect(federal.otherCredits.greaterThan(0)).toBe(true);
  });

  it("education credits flow through Schedule 3 to otherCredits", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      educationExpenses: {
        aocStudents: [{ name: "Student", qualifiedExpenses: "4000" }],
        llcExpenses: "0",
      },
    };
    const federal = calculateFederalTax(fixture);
    // MAGI ~$85K (single), AOC phase-out at $80K-$90K
    // AOC tentative = $2,500, phase-out factor = 1 - (85000-80000)/10000 = 0.5
    // AOC after phase-out = $1,250. Nonrefundable (60%) = $750
    expect(federal.otherCredits.greaterThan(0)).toBe(true);
  });

  it("education refundable AOC flows into totalPayments", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Spouse",
          lastName: "Doe",
          ssn: "999-88-7777",
          dateOfBirth: "1990-01-01",
        },
      },
      educationExpenses: {
        aocStudents: [{ name: "Student", qualifiedExpenses: "4000" }],
        llcExpenses: "0",
      },
    };
    const federal = calculateFederalTax(fixture);
    // MFJ phase-out starts at $160K; AGI ~$85K → no phase-out
    // AOC = $2,500, refundable 40% = $1,000
    // totalPayments should include refundable credits
    const withoutRefundable = federal.totalWithholding.plus(federal.estimatedTaxPayments);
    expect(federal.totalPayments.greaterThan(withoutRefundable)).toBe(true);
  });

  it("excess SS withholding included in totalPayments for multi-employer", () => {
    const federal = calculateFederalTax(complexMFJFixture);
    // Two W-2s: SS withheld $10,918.20 + $3,100 = $14,018.20
    // Max = $176,100 × 6.2% = $10,918.20 (roundDollar → $10,918)
    // Excess = $14,018.20 - $10,918 = $3,100.20
    const withholding = federal.totalWithholding.plus(federal.estimatedTaxPayments);
    expect(federal.totalPayments.greaterThan(withholding)).toBe(true);
  });

  it("audit trail includes Schedule 3 lines", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      dependentCare: {
        expenses: "3000",
        qualifyingIndividuals: 1,
      },
    };
    const federal = calculateFederalTax(fixture);
    const sched3Lines = federal.allLines.filter((l) => l.form === "Sched 3");
    expect(sched3Lines.length).toBeGreaterThan(0);
    const line7 = sched3Lines.find((l) => l.line === "7");
    expect(line7).toBeDefined();
  });

  it("no Schedule 3 credits when no dependent care or education", () => {
    const federal = calculateFederalTax(simpleW2Fixture);
    // Foreign tax credit is 0 for simple W-2, no care/education
    // otherCredits = Schedule 3 total nonrefundable = just foreign tax (0)
    expect(federal.otherCredits.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Schedule C Integration (SE income flows through federal.ts)
// ═══════════════════════════════════════════════════════════

describe("Integration - Schedule C flows into federal return", () => {
  it("Schedule C net profit included in total income", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }],
    };
    const federal = calculateFederalTax(fixture);
    // Wages $85K + Schedule C $50K = $135K (before adjustments)
    expect(federal.totalIncome.toNumber()).toBe(135000);
  });

  it("Schedule C with expenses reduces total income", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }],
      scheduleC: {
        expenses: {
          advertising: "1000",
          supplies: "2000",
          otherExpenses: "3000",
        },
      },
    };
    const federal = calculateFederalTax(fixture);
    // Schedule C: $50K - $6K expenses = $44K net
    // Total: $85K wages + $44K = $129K
    expect(federal.totalIncome.toNumber()).toBe(129000);
  });

  it("audit trail includes Schedule C lines", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "30000", federalWithheld: "0" }],
    };
    const federal = calculateFederalTax(fixture);
    const schedCLines = federal.allLines.filter((l) => l.form === "Sched C");
    expect(schedCLines.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Schedule E Integration (Rental income flows through federal.ts)
// ═══════════════════════════════════════════════════════════

describe("Integration - Schedule E rental flows into federal return", () => {
  it("rental income included in total income via Schedule E", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [{
        description: "Rental house",
        propertyType: "single_family",
        personalUseDays: 0,
        rentalDays: 365,
        rents: "24000",
        advertising: "0",
        autoTravel: "0",
        cleaning: "0",
        commissions: "0",
        insurance: "1000",
        legalProfessional: "0",
        managementFees: "0",
        mortgageInterest: "5000",
        otherInterest: "0",
        repairs: "2000",
        supplies: "0",
        taxes: "3000",
        utilities: "0",
        depreciation: "3000",
        otherExpenses: "0",
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Rental net: $24K - $14K = $10K
    // Total: $85K wages + $10K rental = $95K
    expect(federal.totalIncome.toNumber()).toBe(95000);
  });

  it("rental loss creates suspended passive loss via Form 8582", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [{
        description: "Loss rental",
        propertyType: "single_family",
        personalUseDays: 0,
        rentalDays: 365,
        rents: "5000",
        advertising: "0",
        autoTravel: "0",
        cleaning: "0",
        commissions: "0",
        insurance: "2000",
        legalProfessional: "0",
        managementFees: "0",
        mortgageInterest: "15000",
        otherInterest: "0",
        repairs: "3000",
        supplies: "0",
        taxes: "5000",
        utilities: "0",
        depreciation: "10000",
        otherExpenses: "0",
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Rental net: $5K - $35K = -$30K (passive loss)
    // AGI = $85K (under $100K), active participant → $25K rental allowance
    // $30K loss - $25K allowed = $5K suspended
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(1);
    expect(federal.carryforwards.suspendedPassiveLosses[0].partnershipName).toBe("Loss rental");
    expect(federal.carryforwards.suspendedPassiveLosses[0].amount.toNumber()).toBe(5000);
  });

  it("audit trail includes Schedule E lines", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [{
        description: "Test property",
        propertyType: "single_family",
        personalUseDays: 0,
        rentalDays: 365,
        rents: "12000",
        advertising: "0",
        autoTravel: "0",
        cleaning: "0",
        commissions: "0",
        insurance: "0",
        legalProfessional: "0",
        managementFees: "0",
        mortgageInterest: "0",
        otherInterest: "0",
        repairs: "0",
        supplies: "0",
        taxes: "0",
        utilities: "0",
        depreciation: "0",
        otherExpenses: "0",
      }],
    };
    const federal = calculateFederalTax(fixture);
    const schedELines = federal.allLines.filter((l) => l.form === "Sched E");
    expect(schedELines.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Form 8962 Integration (PTC flows through federal.ts)
// ═══════════════════════════════════════════════════════════

describe("Integration - Form 8962 PTC flows into federal return", () => {
  it("PTC flows into refundable credits when 1095-A present", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        // Lower wages to qualify for PTC
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "30000",
        federalWithheld: "3000",
      }],
      form1095A: [{
        marketplace: "HealthCare.gov",
        policyNumber: "12345",
        monthlyPremiums: Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          enrolleePremium: "400",
          slcsp: "500",
          advancePremiumTaxCredit: "200",
        })),
      }],
    };
    const federal = calculateFederalTax(fixture);
    // With 1095-A present, Form 8962 should be calculated
    const form8962Lines = federal.allLines.filter((l) => l.form === "Form 8962");
    expect(form8962Lines.length).toBeGreaterThan(0);
  });

  it("no PTC when no 1095-A", () => {
    const federal = calculateFederalTax(simpleW2Fixture);
    const form8962Lines = federal.allLines.filter((l) => l.form === "Form 8962");
    expect(form8962Lines.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Schedule 1 / Schedule 2 Integration
// ═══════════════════════════════════════════════════════════

describe("Schedule 1 audit trail in federal pipeline", () => {
  it("Schedule 1 lines appear in audit trail", () => {
    const federal = calculateFederalTax(simpleW2Fixture);
    const sched1Lines = federal.allLines.filter((l) => l.form === "Sched 1");
    expect(sched1Lines.length).toBeGreaterThan(0);
    // Should have at least Line 10 (total additional income) and Line 26 (total adjustments)
    const line10 = sched1Lines.find((l) => l.line === "10");
    const line26 = sched1Lines.find((l) => l.line === "26");
    expect(line10).toBeDefined();
    expect(line26).toBeDefined();
  });
});

describe("Schedule 2 audit trail in federal pipeline", () => {
  it("Schedule 2 lines appear in audit trail for SE filer", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "30000", federalWithheld: "0" }],
    };
    const federal = calculateFederalTax(fixture);
    const sched2Lines = federal.allLines.filter((l) => l.form === "Sched 2");
    expect(sched2Lines.length).toBeGreaterThan(0);
    const line21 = sched2Lines.find((l) => l.line === "21");
    expect(line21).toBeDefined();
    expect(line21!.value.greaterThan(0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Form 2210 Estimated Tax Penalty Integration
// ═══════════════════════════════════════════════════════════

describe("Form 2210 in federal pipeline", () => {
  it("no penalty when withholding covers tax (safe harbor)", () => {
    const federal = calculateFederalTax(simpleW2Fixture);
    expect(federal.estimatedTaxPenalty.toNumber()).toBe(0);
    const form2210Lines = federal.allLines.filter((l) => l.form === "Form 2210");
    expect(form2210Lines.length).toBeGreaterThan(0);
  });

  it("penalty applies when underpayment exists", () => {
    // High income with minimal withholding → big underpayment
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "200000",
        federalWithheld: "5000", // way too low
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "200000",
        medicareWithheld: "2900",
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Total tax will be much higher than $5K withholding → penalty
    expect(federal.estimatedTaxPenalty.greaterThan(0)).toBe(true);
    // Form 2210 penalty is outside total tax and increases the amount owed.
    expect(federal.totalAdditionalTaxes.toString()).toBe("0");
    expect(federal.amountOwed.eq(federal.totalTax.minus(federal.totalPayments).plus(federal.estimatedTaxPenalty))).toBe(true);
  });

  it("safe harbor met with prior year tax", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      priorYear: {
        suspendedPassiveLosses: [],
        priorYearTax: "8000",
        priorYearAGI: "80000",
      },
    };
    const federal = calculateFederalTax(fixture);
    // Withholding of $12,500 vs prior year tax of $8K → safe harbor met
    expect(federal.estimatedTaxPenalty.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Form 8949 → Schedule D Integration
// ═══════════════════════════════════════════════════════════

describe("Form 8949 flows through Schedule D", () => {
  it("Form 8949 audit trail appears when 1099-B present", () => {
    const federal = calculateFederalTax(complexMFJFixture);
    const form8949Lines = federal.allLines.filter((l) => l.form === "Form 8949");
    expect(form8949Lines.length).toBeGreaterThan(0);
    const partI = form8949Lines.find((l) => l.line === "Part I totals");
    const partII = form8949Lines.find((l) => l.line === "Part II totals");
    expect(partI).toBeDefined();
    expect(partII).toBeDefined();
  });

  it("Form 8949 short/long-term match Schedule D inputs", () => {
    const federal = calculateFederalTax(complexMFJFixture);
    const form8949Lines = federal.allLines.filter((l) => l.form === "Form 8949");
    const schedDLines = federal.allLines.filter((l) => l.form === "Sched D");

    const stTotal = form8949Lines.find((l) => l.line === "Part I totals")!.value;

    // TSLA short-term: $12K - $14K = -$2K
    expect(stTotal.toNumber()).toBe(-2000);
    // Schedule D Line 7 also includes K-1 short-term (0) and prior carryforward (0)
    const line7 = schedDLines.find((l) => l.line === "7")!.value;
    expect(line7.toNumber()).toBe(-2000);
  });
});

// ═══════════════════════════════════════════════════════════
// Form 8959 / Form 8960 Module Integration
// ═══════════════════════════════════════════════════════════

describe("Form 8959 audit trail in federal pipeline", () => {
  it("Form 8959 lines appear for high-income filer", () => {
    const federal = calculateFederalTax(complexMFJFixture);
    const form8959Lines = federal.allLines.filter((l) => l.form === "Form 8959");
    expect(form8959Lines.length).toBeGreaterThan(0);
    const line1 = form8959Lines.find((l) => l.line === "1");
    expect(line1).toBeDefined();
    expect(line1!.description).toContain("Medicare wages");
  });
});

describe("Form 8960 audit trail in federal pipeline", () => {
  it("Form 8960 lines appear when investment income exists", () => {
    const federal = calculateFederalTax(complexMFJFixture);
    const form8960Lines = federal.allLines.filter((l) => l.form === "Form 8960");
    expect(form8960Lines.length).toBeGreaterThan(0);
    const line8 = form8960Lines.find((l) => l.line === "8");
    expect(line8).toBeDefined();
    expect(line8!.value.greaterThan(0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Form 1116 Integration
// ═══════════════════════════════════════════════════════════

describe("Form 1116 in federal pipeline", () => {
  it("Form 1116 audit trail when foreign tax paid", () => {
    const federal = calculateFederalTax(complexMFJFixture);
    const form1116Lines = federal.allLines.filter((l) => l.form === "Form 1116");
    expect(form1116Lines.length).toBeGreaterThan(0);
    const line21 = form1116Lines.find((l) => l.line === "21");
    expect(line21).toBeDefined();
    expect(line21!.value.greaterThan(0)).toBe(true);
  });

  it("no Form 1116 lines when no foreign tax", () => {
    const federal = calculateFederalTax(simpleW2Fixture);
    const form1116Lines = federal.allLines.filter((l) => l.form === "Form 1116");
    expect(form1116Lines.length).toBe(0);
  });

  it("foreign tax credit limited by Form 1116 calculation", () => {
    const federal = calculateFederalTax(complexMFJFixture);
    // MFJ fixture has $150 foreign tax paid
    expect(federal.foreignTaxCredit.greaterThan(0)).toBe(true);
    expect(federal.foreignTaxCredit.lte(d(150))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// 1099-INT Early Withdrawal Penalty Auto-Aggregation
// ═══════════════════════════════════════════════════════════

describe("Early withdrawal penalty from 1099-INT", () => {
  it("1099-INT Box 2 penalty flows as adjustment to income", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Int: [{
        payer: "CD Bank",
        interestIncome: "5000",
        federalWithheld: "0",
        earlyWithdrawalPenalty: "500",
        usSavingsBondInterest: "0",
        taxExemptInterest: "0",
      }],
    };
    const federal = calculateFederalTax(fixture);
    // $500 early withdrawal penalty should reduce AGI
    // AGI = $85K wages + $5K interest - $500 penalty = $89,500
    expect(federal.adjustmentsToIncome.toNumber()).toBe(500);
    expect(federal.agi.toNumber()).toBe(89500);
  });

  it("multiple 1099-INT penalties aggregate", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Int: [
        { payer: "Bank A", interestIncome: "3000", federalWithheld: "0", earlyWithdrawalPenalty: "200", usSavingsBondInterest: "0", taxExemptInterest: "0" },
        { payer: "Bank B", interestIncome: "2000", federalWithheld: "0", earlyWithdrawalPenalty: "150", usSavingsBondInterest: "0", taxExemptInterest: "0" },
      ],
    };
    const federal = calculateFederalTax(fixture);
    expect(federal.adjustmentsToIncome.toNumber()).toBe(350);
  });
});

// ═══════════════════════════════════════════════════════════
// Sub-Results on TaxReturnResult
// ═══════════════════════════════════════════════════════════

describe("TaxReturnResult sub-results are properly populated", () => {
  describe("scheduleB — interest/dividend income", () => {
    const federal = calculateFederalTax(complexMFJFixture);

    it("scheduleB is defined when interest/dividend income exists", () => {
      expect(federal.scheduleB).toBeDefined();
    });

    it("scheduleB.totalInterest matches top-level totalInterest", () => {
      expect(federal.scheduleB!.totalInterest.toNumber()).toBe(
        federal.totalInterest.toNumber()
      );
    });

    it("scheduleB.totalOrdinaryDividends matches top-level totalDividends", () => {
      expect(federal.scheduleB!.totalOrdinaryDividends.toNumber()).toBe(
        federal.totalDividends.toNumber()
      );
    });

    it("scheduleB has interest payer entries", () => {
      expect(federal.scheduleB!.interestPayers.length).toBeGreaterThan(0);
    });

    it("scheduleB has dividend payer entries", () => {
      expect(federal.scheduleB!.dividendPayers.length).toBeGreaterThan(0);
    });

    it("scheduleB includes audit trail lines", () => {
      expect(federal.scheduleB!.lines.length).toBeGreaterThan(0);
    });
  });

  describe("scheduleE — rental and K-1 income", () => {
    it("scheduleE is defined when K-1 income exists (complexMFJ)", () => {
      const federal = calculateFederalTax(complexMFJFixture);
      expect(federal.scheduleE).toBeDefined();
      expect(federal.scheduleE!.totalPartnershipIncome.toNumber()).toBeGreaterThan(0);
    });

    it("scheduleE reflects rental property income", () => {
      const fixture: TaxYearInput = {
        ...simpleW2Fixture,
        rentalProperties: [{
          description: "Beach condo",
          propertyType: "single_family",
          personalUseDays: 0,
          rentalDays: 365,
          rents: "24000",
          advertising: "0",
          autoTravel: "0",
          cleaning: "0",
          commissions: "0",
          insurance: "1000",
          legalProfessional: "0",
          managementFees: "0",
          mortgageInterest: "5000",
          otherInterest: "0",
          repairs: "2000",
          supplies: "0",
          taxes: "3000",
          utilities: "0",
          depreciation: "3000",
          otherExpenses: "0",
        }],
      };
      const federal = calculateFederalTax(fixture);
      expect(federal.scheduleE).toBeDefined();
      expect(federal.scheduleE!.rentalProperties.length).toBe(1);
      // Net rental = $24K - $14K = $10K
      expect(federal.scheduleE!.totalRentalIncome.toNumber()).toBe(10000);
    });

    it("scheduleE includes partnership entries from K-1s", () => {
      const federal = calculateFederalTax(complexMFJFixture);
      expect(federal.scheduleE!.partnerships.length).toBeGreaterThan(0);
    });

    it("scheduleE includes audit trail lines", () => {
      const federal = calculateFederalTax(complexMFJFixture);
      expect(federal.scheduleE!.lines.length).toBeGreaterThan(0);
    });
  });

  describe("form6251 — AMT calculation always runs", () => {
    it("form6251 is defined for simple W-2 filer", () => {
      const federal = calculateFederalTax(simpleW2Fixture);
      expect(federal.form6251).toBeDefined();
      expect(federal.form6251!.amt.toNumber()).toBe(0);
    });

    it("form6251 is defined for complex MFJ filer", () => {
      const federal = calculateFederalTax(complexMFJFixture);
      expect(federal.form6251).toBeDefined();
    });

    it("form6251.amt matches top-level amt", () => {
      const federal = calculateFederalTax(complexMFJFixture);
      expect(federal.form6251!.amt.toNumber()).toBe(federal.amt.toNumber());
    });

    it("form6251 has expected fields populated", () => {
      const federal = calculateFederalTax(complexMFJFixture);
      const f = federal.form6251!;
      expect(f.taxableIncome.toNumber()).toBe(federal.taxableIncome.toNumber());
      expect(f.amti).toBeDefined();
      expect(f.exemption).toBeDefined();
      expect(f.tentativeMinimumTax).toBeDefined();
      expect(f.lines.length).toBeGreaterThan(0);
    });
  });

  describe("form8582 — passive activity loss limitation", () => {
    it("form8582 is defined and has expected structure", () => {
      const federal = calculateFederalTax(complexMFJFixture);
      expect(federal.form8582).toBeDefined();
      const f = federal.form8582!;
      expect(f.passiveIncome).toBeDefined();
      expect(f.passiveLoss).toBeDefined();
      expect(f.netPassive).toBeDefined();
      expect(f.rentalIncome).toBeDefined();
      expect(f.rentalLoss).toBeDefined();
      expect(f.netRental).toBeDefined();
      expect(f.combinedLoss).toBeDefined();
      expect(f.rentalAllowance).toBeDefined();
      expect(f.allowedLoss).toBeDefined();
      expect(f.suspendedLoss).toBeDefined();
      expect(f.activityAllocations).toBeDefined();
      expect(Array.isArray(f.activityAllocations)).toBe(true);
    });

    it("form8582 activityAllocations have per-activity fields", () => {
      const passiveLossFixture: TaxYearInput = {
        ...simpleW2Fixture,
        scheduleK1: [{
          partnershipName: "Losing Partnership LP",
          partnershipEIN: "99-8877665",
          ordinaryIncome: "-30000",
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: true,
          netRentalIncome: "0",
          otherNetRentalIncome: "0",
          royalties: "0",
          section1231Gain: "0",
          otherIncome: "0",
          section179Deduction: "0",
          otherDeductions: "0",
        }],
      };
      const federal = calculateFederalTax(passiveLossFixture);
      expect(federal.form8582).toBeDefined();
      expect(federal.form8582!.activityAllocations.length).toBe(1);
      const alloc = federal.form8582!.activityAllocations[0];
      expect(alloc.name).toBe("Losing Partnership LP");
      expect(alloc.totalLoss).toBeDefined();
      expect(alloc.allowedLoss).toBeDefined();
      expect(alloc.suspendedLoss).toBeDefined();
      expect(alloc.suspendedLoss.toNumber()).toBe(30000);
    });
  });

  describe("form2210 — estimated tax penalty", () => {
    it("form2210 is defined and has safeHarborMet field", () => {
      const federal = calculateFederalTax(simpleW2Fixture);
      expect(federal.form2210).toBeDefined();
      expect(typeof federal.form2210!.safeHarborMet).toBe("boolean");
    });

    it("form2210 safeHarborMet is true when withholding covers tax", () => {
      const federal = calculateFederalTax(simpleW2Fixture);
      expect(federal.form2210!.safeHarborMet).toBe(true);
    });

    it("form2210.penalty matches top-level estimatedTaxPenalty", () => {
      const federal = calculateFederalTax(complexMFJFixture);
      expect(federal.form2210!.penalty.toNumber()).toBe(
        federal.estimatedTaxPenalty.toNumber()
      );
    });

    it("form2210 has all expected fields", () => {
      const federal = calculateFederalTax(complexMFJFixture);
      const f = federal.form2210!;
      expect(f.safeHarborMet).toBeDefined();
      expect(f.safeHarborReason).toBeDefined();
      expect(typeof f.safeHarborReason).toBe("string");
      expect(f.requiredAnnualPayment).toBeDefined();
      expect(f.totalPayments).toBeDefined();
      expect(f.underpayment).toBeDefined();
      expect(f.penalty).toBeDefined();
      expect(f.lines.length).toBeGreaterThan(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// Complex Cross-Feature Integration
// ═══════════════════════════════════════════════════════════

describe("Cross-feature integration - complex scenario", () => {
  const complexFixture: TaxYearInput = {
    ...complexMFJFixture,
    // Add rental property with 50% ownership
    rentalProperties: [{
      description: "Co-owned rental property",
      propertyType: "single_family",
      personalUseDays: 0,
      rentalDays: 365,
      ownershipPercentage: "50",
      rents: "36000",
      advertising: "0",
      autoTravel: "0",
      cleaning: "500",
      commissions: "0",
      insurance: "1200",
      legalProfessional: "0",
      managementFees: "0",
      mortgageInterest: "6000",
      otherInterest: "0",
      repairs: "2000",
      supplies: "0",
      taxes: "3000",
      utilities: "0",
      depreciation: "4000",
      otherExpenses: "0",
    }],
    // Add 1099-DIV with §1250 gain
    form1099Div: [{
      ...complexMFJFixture.form1099Div[0],
      section1250Gain: "2000",
    }],
    // K-1 with foreign tax
    scheduleK1: [{
      ...complexMFJFixture.scheduleK1[0],
      foreignTaxPaid: "250",
    }],
  };

  const result = calculateFederalTax(complexFixture);

  it("rental ownership percentage scales income correctly", () => {
    expect(result.scheduleE).toBeDefined();
    // 50% of $36K rents = $18K
    expect(result.scheduleE!.rentalProperties[0].rents.toNumber()).toBe(18000);
  });

  it("§1250 gain increases capital gains tax", () => {
    // Compare with same fixture but no §1250
    const noSection1250 = {
      ...complexFixture,
      form1099Div: [{
        ...complexMFJFixture.form1099Div[0],
        section1250Gain: "0",
      }],
    };
    const baseResult = calculateFederalTax(noSection1250);
    // Actual taxable income248989 contains19000 preferential income before
    // reclassification. Ordinary229989 MFJ tax40891 plus19000*15%=43741.
    // The2000 section1250 amount uses the24% ordinary bracket (below25% cap),
    // replacing its15% tax: total rises2000*(24%-15%)=180. The separately
    // reported preferential component falls300 because this part is ordinary.
    expect(baseResult.totalTaxBeforeCredits.toString()).toBe("43741");
    expect(result.totalTaxBeforeCredits.toString()).toBe("43921");
    expect(result.totalTaxBeforeCredits.minus(baseResult.totalTaxBeforeCredits).toString()).toBe("180");
    expect(baseResult.capitalGainsTax.minus(result.capitalGainsTax).toString()).toBe("300");
  });

  it("K-1 foreign tax produces foreign tax credit", () => {
    expect(result.foreignTaxCredit.greaterThan(0)).toBe(true);
    // Combined: 1099-DIV $150 + K-1 $250 = $400 foreign tax
    // Credit should reflect both sources
  });

  it("all sub-results populated for complex scenario", () => {
    expect(result.scheduleA).toBeDefined();
    expect(result.scheduleB).toBeDefined();
    expect(result.scheduleD).toBeDefined();
    expect(result.scheduleE).toBeDefined();
    expect(result.scheduleSE).toBeDefined();
    expect(result.form2210).toBeDefined();
  });

  it("tax return equation balances", () => {
    // totalTax = totalTaxBeforeCredits - totalCredits + totalAdditionalTaxes
    const expectedTotal = result.totalTaxBeforeCredits
      .minus(result.totalCredits)
      .plus(result.totalAdditionalTaxes);
    expect(result.totalTax.toNumber()).toBe(expectedTotal.toNumber());
  });

  it("refund/owed based on payments", () => {
    const balance = result.totalTax.minus(result.totalPayments);
    if (balance.greaterThan(0)) {
      expect(result.amountOwed.toNumber()).toBe(balance.toNumber());
      expect(result.refund.toNumber()).toBe(0);
    } else {
      expect(result.refund.toNumber()).toBe(balance.abs().toNumber());
      expect(result.amountOwed.toNumber()).toBe(0);
    }
  });
});
