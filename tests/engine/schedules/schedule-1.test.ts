/**
 * Tests for Schedule 1 — Additional Income and Adjustments to Income
 * Spec: spec/federal/schedule-1.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateSchedule1, type Schedule1Input } from "@/engine/schedules/schedule-1.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

const d = (n: number | string) => new Decimal(n);

function makeFixture(
  adjustments?: TaxYearInput["adjustments"],
  extra?: Schedule1Input
): { input: TaxYearInput; extra?: Schedule1Input } {
  return {
    input: { ...simpleW2Fixture, adjustments },
    extra,
  };
}

// ═══════════════════════════════════════════════════════════
// Part I: Additional Income
// ═══════════════════════════════════════════════════════════

describe("Schedule 1 Part I - Additional Income", () => {
  it("Schedule 1 Line 1 - taxable refunds", () => {
    const { input, extra } = makeFixture(undefined, { taxableStateRefund: d(500) });
    const result = calculateSchedule1(input, extra);
    expect(result.taxableRefunds.toNumber()).toBe(500);
  });

  it("Schedule 1 Line 3 - business income", () => {
    const { input, extra } = makeFixture(undefined, { schedCNetProfit: d(45000) });
    const result = calculateSchedule1(input, extra);
    expect(result.businessIncome.toNumber()).toBe(45000);
  });

  it("Schedule 1 Line 3 - business loss (negative)", () => {
    const { input, extra } = makeFixture(undefined, { schedCNetProfit: d(-3000) });
    const result = calculateSchedule1(input, extra);
    expect(result.businessIncome.toNumber()).toBe(-3000);
  });

  it("Schedule 1 Line 4 - Form 4797 ordinary section 1231 amounts flow through other gains or losses", () => {
    const { input } = makeFixture();
    input.form4797 = {
      netSection1231GainOrLoss: "9000",
      nonrecapturedNetSection1231Losses: "2500",
    };

    const result = calculateSchedule1(input);

    expect(result.otherGainsOrLosses.toNumber()).toBe(2500);
  });

  it("Schedule 1 Line 5 - supplemental income", () => {
    const { input, extra } = makeFixture(undefined, { schedETotal: d(12000) });
    const result = calculateSchedule1(input, extra);
    expect(result.supplementalIncome.toNumber()).toBe(12000);
  });

  it("Schedule 1 Line 6 - farm income flows from Schedule F", () => {
    const { input, extra } = makeFixture(undefined, { schedFNetProfit: d(58000) });
    const result = calculateSchedule1(input, extra);
    expect(result.farmIncome.toNumber()).toBe(58000);
  });

  it("Schedule 1 Line 6 - farm loss flows through", () => {
    const { input, extra } = makeFixture(undefined, { schedFNetProfit: d(-15000) });
    const result = calculateSchedule1(input, extra);
    expect(result.farmIncome.toNumber()).toBe(-15000);
  });

  it("Schedule 1 Line 6 - farm income included in total additional income", () => {
    const { input, extra } = makeFixture(undefined, {
      schedFNetProfit: d(40000),
      schedETotal: d(5000),
    });
    const result = calculateSchedule1(input, extra);
    expect(result.farmIncome.toNumber()).toBe(40000);
    expect(result.totalAdditionalIncome.toNumber()).toBe(45000);
  });

  it("Schedule 1 Line 7 - unemployment compensation from Form 1099-G", () => {
    const { input } = makeFixture();
    input.form1099G = [
      { payer: "State UI Agency", unemploymentCompensation: "12500" },
    ];
    const result = calculateSchedule1(input);
    expect(result.unemploymentCompensation.toNumber()).toBe(12500);
  });

  it("Schedule 1 Line 7 - multiple 1099-G forms are summed", () => {
    const { input } = makeFixture();
    input.form1099G = [
      { payer: "CA EDD", unemploymentCompensation: "8000" },
      { payer: "NY DOL", unemploymentCompensation: "4500" },
    ];
    const result = calculateSchedule1(input);
    expect(result.unemploymentCompensation.toNumber()).toBe(12500);
  });

  it("Schedule 1 Line 7 - no 1099-G yields zero unemployment", () => {
    const { input } = makeFixture();
    const result = calculateSchedule1(input);
    expect(result.unemploymentCompensation.toNumber()).toBe(0);
  });

  // ── Line 8c: Cancellation of debt income ─────────────────

  it("Schedule 1 Line 8c - single 1099-C flows to cancelled debt income", () => {
    const { input } = makeFixture();
    input.form1099C = [
      { creditor: "Chase", amountDischarged: "12000", personallyLiable: true },
    ];
    const result = calculateSchedule1(input);
    expect(result.cancelledDebtIncome.toNumber()).toBe(12000);
  });

  it("Schedule 1 Line 8c - multiple 1099-C forms are summed", () => {
    const { input } = makeFixture();
    input.form1099C = [
      { creditor: "Bank A", amountDischarged: "5000", personallyLiable: false },
      { creditor: "Bank B", amountDischarged: "8000", personallyLiable: false },
    ];
    const result = calculateSchedule1(input);
    expect(result.cancelledDebtIncome.toNumber()).toBe(13000);
  });

  it("Schedule 1 Line 8c - insolvency exclusion reduces COD income", () => {
    const { input } = makeFixture();
    input.form1099C = [
      { creditor: "Creditor", amountDischarged: "20000", personallyLiable: true },
    ];
    input.codExclusion = {
      insolvency: {
        totalLiabilities: "100000",
        totalAssets: "85000",
      },
    };
    const result = calculateSchedule1(input);
    // Insolvent by 15000, so 5000 is taxable
    expect(result.cancelledDebtIncome.toNumber()).toBe(5000);
  });

  it("Schedule 1 Line 8c - no 1099-C yields zero", () => {
    const { input } = makeFixture();
    const result = calculateSchedule1(input);
    expect(result.cancelledDebtIncome.toNumber()).toBe(0);
  });

  it("Schedule 1 Line 8c - COD income included in total additional income", () => {
    const { input } = makeFixture();
    input.form1099C = [
      { creditor: "Bank", amountDischarged: "7000", personallyLiable: false },
    ];
    const result = calculateSchedule1(input);
    expect(result.cancelledDebtIncome.toNumber()).toBe(7000);
    expect(result.totalAdditionalIncome.toNumber()).toBe(7000);
  });

  it("Schedule 1 Line 7 - capital gain or loss passthrough", () => {
    const { input, extra } = makeFixture(undefined, { capitalGainLoss: d(15000) });
    const result = calculateSchedule1(input, extra);
    expect(result.capitalGainLoss.toNumber()).toBe(15000);
  });

  it("Schedule 1 Line 7 - capital loss flows through", () => {
    const { input, extra } = makeFixture(undefined, { capitalGainLoss: d(-3000) });
    const result = calculateSchedule1(input, extra);
    expect(result.capitalGainLoss.toNumber()).toBe(-3000);
  });

  it("Schedule 1 Line 2a - alimony", () => {
    const { input, extra } = makeFixture(undefined, { alimonyReceived: d(24000) });
    const result = calculateSchedule1(input, extra);
    expect(result.alimonyReceived.toNumber()).toBe(24000);
  });

  it("Schedule 1 Line 8a - NOL deduction reduces total additional income", () => {
    const { input, extra } = makeFixture(undefined, {
      alimonyReceived: d(24000),
      nolDeduction: d(10000),
    });
    const result = calculateSchedule1(input, extra);
    expect(result.nolDeduction.toNumber()).toBe(10000);
    // total = 24000 alimony - 10000 NOL = 14000
    expect(result.totalAdditionalIncome.toNumber()).toBe(14000);
  });

  it("Schedule 1 Line 8a - zero NOL deduction when no carryforward", () => {
    const { input, extra } = makeFixture(undefined, { alimonyReceived: d(5000) });
    const result = calculateSchedule1(input, extra);
    expect(result.nolDeduction.toNumber()).toBe(0);
    expect(result.totalAdditionalIncome.toNumber()).toBe(5000);
  });

  it("Schedule 1 Line 8f - HSA income includes taxable distributions and recapture income from Form 8889", () => {
    const { input } = makeFixture();
    input.form8889 = {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      distributionsReceived: "2000",
      qualifiedMedicalExpenses: "1200",
      lastMonthRuleContributions: "7000",
      lastMonthRuleRedeterminedLimit: "4300",
      recaptureQualifiedFundingDistribution: "1500",
    };
    const result = calculateSchedule1(input);
    expect(result.hsaTaxableDistributions.toNumber()).toBe(5000);
  });

  it("Schedule 1 Line 8f - Form 1099-SA disability distributions auto-build the Form 8889 income path without manual inputs", () => {
    const { input } = makeFixture();
    input.form1099SA = [
      {
        payer: "HSA Bank",
        grossDistribution: "1200",
        distributionCode: "3",
        accountType: "hsa",
      },
    ];

    const result = calculateSchedule1(input);

    expect(result.form8889?.line14a.toNumber()).toBe(1200);
    expect(result.form8889?.line16.toNumber()).toBe(1200);
    expect(result.form8889?.line17aHasException).toBe(true);
    expect(result.form8889?.line17b.toNumber()).toBe(0);
    expect(result.hsaTaxableDistributions.toNumber()).toBe(1200);
  });

  it("Schedule 1 Line 10 - total additional income includes unemployment compensation", () => {
    const { input, extra } = makeFixture(undefined, {
      taxableStateRefund: d(200),
      schedCNetProfit: d(30000),
      schedETotal: d(5000),
      capitalGainLoss: d(8000),
      alimonyReceived: d(0),
    });
    input.form4797 = {
      netSection1231GainOrLoss: "9000",
      nonrecapturedNetSection1231Losses: "2500",
    };
    input.form1099G = [
      { payer: "State UI", unemploymentCompensation: "6000" },
    ];
    input.form8889 = {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      distributionsReceived: "2000",
      qualifiedMedicalExpenses: "1200",
      lastMonthRuleContributions: "7000",
      lastMonthRuleRedeterminedLimit: "4300",
      recaptureQualifiedFundingDistribution: "1500",
    };
    const result = calculateSchedule1(input, extra);
    // 200 + 30000 + 2500 + 5000 + 6000 + 8000 + (800 + 2700 + 1500) = 56700
    expect(result.totalAdditionalIncome.toNumber()).toBe(56700);
  });

  it("Schedule 1 - zero additional income when no extras", () => {
    const { input } = makeFixture();
    const result = calculateSchedule1(input);
    expect(result.totalAdditionalIncome.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Part II: Adjustments to Income
// ═══════════════════════════════════════════════════════════

describe("Schedule 1 Part II - Adjustments", () => {
  it("Schedule 1 Line 13 - HSA deduction", () => {
    const { input } = makeFixture();
    input.form8889 = {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "4300",
      employerContributions: "500",
    };
    const result = calculateSchedule1(input);
    expect(result.hsaDeduction.toNumber()).toBe(3800);
  });

  it("Schedule 1 Line 13 - manual HSA fallback still works without Form 8889 inputs", () => {
    const { input } = makeFixture({
      hsaDeduction: "4000",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
      iraDeduction: "0", alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);
    expect(result.hsaDeduction.toNumber()).toBe(4000);
  });

  it("Schedule 1 Line 13 - mixed-owner Form 8889 statements are not synthesized when no HSA documents exist", () => {
    const { input } = makeFixture({
      hsaDeduction: "0",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
      iraDeduction: "0", alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    input.taxpayer = {
      ...input.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "Pat",
        lastName: "Example",
        ssn: "987-65-4321",
        dateOfBirth: "1980-01-01",
      },
    };

    const result = calculateSchedule1(input);

    expect(result.form8889).toBeUndefined();
    expect(result.form8889ByOwner).toBeUndefined();

    const line13 = result.lines.find((line) => line.form === "Sched 1" && line.line === "13");
    expect(line13?.formula).toBe("Form 8889");
  });

  it("Schedule 1 Line 13 - mixed-owner HSA documents use the owner-specific Form 8889 Line 13 sum", () => {
    const { input } = makeFixture({
      hsaDeduction: "0",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
      iraDeduction: "0", alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    input.taxpayer = {
      ...input.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "Pat",
        lastName: "Example",
        ssn: "987-65-4321",
        dateOfBirth: "1980-01-01",
      },
    };
    input.form1099SA = [
      {
        payer: "HSA Bank",
        grossDistribution: "1200",
        distributionCode: "1",
        accountType: "hsa",
        accountHolder: "primary",
      },
      {
        payer: "HSA Bank",
        grossDistribution: "700",
        distributionCode: "2",
        earningsOnExcessContributions: "20",
        accountType: "hsa",
        accountHolder: "spouse",
      },
    ];

    const result = calculateSchedule1(input);

    expect(result.form8889).toBeUndefined();
    expect(result.form8889ByOwner?.primary?.line13.toNumber()).toBe(0);
    expect(result.form8889ByOwner?.spouse?.line13.toNumber()).toBe(0);
    expect(result.hsaDeduction.toNumber()).toBe(0);

    const line13 = result.lines.find((line) => line.form === "Sched 1" && line.line === "13");
    expect(line13?.formula).toBe("Sum each owner-specific supported Form 8889 statement's Line 13 amount");
  });

  it("Schedule 1 Line 13 - mixed owner-tagged W-2 Box 12 code W records synthesize owner-specific document-only Form 8889 statements", () => {
    const { input } = makeFixture({
      hsaDeduction: "0",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
      iraDeduction: "0", alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    input.taxpayer = {
      ...input.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "Pat",
        lastName: "Example",
        ssn: "987-65-4321",
        dateOfBirth: "1980-01-01",
      },
    };
    input.w2s = [
      {
        ...simpleW2Fixture.w2s[0],
        accountHolder: "primary",
        box12CodeW: "500",
      },
      {
        ...simpleW2Fixture.w2s[0],
        employer: {
          name: "Spouse Employer",
          ein: "98-7654321",
        },
        wages: "42000",
        federalWithheld: "4200",
        accountHolder: "spouse",
        box12CodeW: "900",
      },
    ];

    const result = calculateSchedule1(input);

    expect(result.form8889).toBeUndefined();
    expect(result.form8889ByOwner?.primary?.line9.toNumber()).toBe(500);
    expect(result.form8889ByOwner?.primary?.line13.toNumber()).toBe(0);
    expect(result.form8889ByOwner?.spouse?.line9.toNumber()).toBe(900);
    expect(result.form8889ByOwner?.spouse?.line13.toNumber()).toBe(0);
    expect(result.hsaDeduction.toNumber()).toBe(0);

    const line13 = result.lines.find((line) => line.form === "Sched 1" && line.line === "13");
    expect(line13?.formula).toBe("Sum each owner-specific supported Form 8889 statement's Line 13 amount");
  });

  it("Schedule 1 Line 13 - explicit owner-specific Form 8889 inputs sum both spouses' HSA deductions", () => {
    const { input } = makeFixture({
      hsaDeduction: "0",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
      iraDeduction: "0", alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    input.taxpayer = {
      ...input.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "Pat",
        lastName: "Example",
        ssn: "987-65-4321",
        dateOfBirth: "1980-01-01",
      },
    };
    input.w2s = [
      {
        ...simpleW2Fixture.w2s[0],
        accountHolder: "primary",
        box12CodeW: "500",
      },
      {
        ...simpleW2Fixture.w2s[0],
        employer: {
          name: "Spouse Employer",
          ein: "98-7654321",
        },
        wages: "42000",
        federalWithheld: "4200",
        accountHolder: "spouse",
        box12CodeW: "900",
      },
    ];
    input.form8889ByOwner = {
      primary: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "4300",
      },
      spouse: {
        accountOwner: "spouse",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "2000",
      },
    };

    const result = calculateSchedule1(input);

    expect(result.form8889).toBeUndefined();
    expect(result.form8889ByOwner?.primary?.line9.toNumber()).toBe(500);
    expect(result.form8889ByOwner?.primary?.line13.toNumber()).toBe(3800);
    expect(result.form8889ByOwner?.spouse?.line9.toNumber()).toBe(900);
    expect(result.form8889ByOwner?.spouse?.line13.toNumber()).toBe(2000);
    expect(result.hsaDeduction.toNumber()).toBe(5800);

    const line13 = result.lines.find((line) => line.form === "Sched 1" && line.line === "13");
    expect(line13?.formula).toBe("Sum each owner-specific supported Form 8889 statement's Line 13 amount");
  });

  it("Schedule 1 mixed-owner HSA audit trail keeps each supplemental Form 8889 statement owner-tagged", () => {
    const { input } = makeFixture({
      hsaDeduction: "0",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
      iraDeduction: "0", alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    input.taxpayer = {
      ...input.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "Pat",
        lastName: "Example",
        ssn: "987-65-4321",
        dateOfBirth: "1980-01-01",
      },
    };
    input.form1099SA = [
      {
        payer: "HSA Bank",
        grossDistribution: "1200",
        distributionCode: "1",
        accountType: "hsa",
        accountHolder: "primary",
      },
      {
        payer: "HSA Bank",
        grossDistribution: "700",
        distributionCode: "2",
        earningsOnExcessContributions: "20",
        accountType: "hsa",
        accountHolder: "spouse",
      },
    ];

    const result = calculateSchedule1(input);
    const ownerTaggedLine14aEntries = result.lines.filter(
      (line) => line.form === "Form 8889" && line.line === "14a"
    );

    expect(ownerTaggedLine14aEntries).toHaveLength(2);
    expect(ownerTaggedLine14aEntries.map((line) => line.inputs["Account owner"]).sort()).toEqual([
      "primary",
      "spouse",
    ]);
  });

  it("Schedule 1 Line 8f - explicit Form 8889 inputs still aggregate the other spouse's tagged HSA documents", () => {
    const { input } = makeFixture({
      hsaDeduction: "0",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
      iraDeduction: "0", alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    input.taxpayer = {
      ...input.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "Pat",
        lastName: "Example",
        ssn: "987-65-4321",
        dateOfBirth: "1980-01-01",
      },
    };
    input.form8889 = {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "4300",
    };
    input.form1099SA = [
      {
        payer: "HSA Bank",
        grossDistribution: "900",
        distributionCode: "1",
        accountType: "hsa",
        accountHolder: "spouse",
      },
    ];

    const result = calculateSchedule1(input);

    expect(result.form8889?.line13.toNumber()).toBe(4300);
    expect(result.form8889ByOwner?.spouse?.line14a.toNumber()).toBe(900);
    expect(result.form8889ByOwner?.spouse?.line16.toNumber()).toBe(900);
    expect(result.hsaTaxableDistributions.toNumber()).toBe(900);
    expect(result.hsaAdditionalTax.toNumber()).toBe(180);
    expect(result.hsaDeduction.toNumber()).toBe(4300);

    const line8f = result.lines.find((line) => line.form === "Sched 1" && line.line === "8f");
    expect(line8f?.formula).toBe(
      "Sum the main supported Form 8889 Line 16 and Line 20 amounts plus any supplemental owner-specific supported Form 8889 statement amounts"
    );
  });

  it("Schedule 1 Line 8f - explicit spouse-owned Form 8889 inputs still aggregate the primary taxpayer's tagged HSA documents", () => {
    const { input } = makeFixture({
      hsaDeduction: "0",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
      iraDeduction: "0", alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    input.taxpayer = {
      ...input.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "Pat",
        lastName: "Example",
        ssn: "987-65-4321",
        dateOfBirth: "1980-01-01",
      },
    };
    input.form8889 = {
      accountOwner: "spouse",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "4300",
    };
    input.form1099SA = [
      {
        payer: "HSA Bank",
        grossDistribution: "900",
        distributionCode: "1",
        accountType: "hsa",
        accountHolder: "primary",
      },
    ];

    const result = calculateSchedule1(input);

    expect(result.form8889?.line13.toNumber()).toBe(4300);
    expect(result.form8889?.line14a.toNumber()).toBe(0);
    expect(result.form8889ByOwner?.primary?.line14a.toNumber()).toBe(900);
    expect(result.form8889ByOwner?.primary?.line16.toNumber()).toBe(900);
    expect(result.hsaTaxableDistributions.toNumber()).toBe(900);
    expect(result.hsaAdditionalTax.toNumber()).toBe(180);
    expect(result.hsaDeduction.toNumber()).toBe(4300);

    const line8f = result.lines.find((line) => line.form === "Sched 1" && line.line === "8f");
    expect(line8f?.formula).toBe(
      "Sum the main supported Form 8889 Line 16 and Line 20 amounts plus any supplemental owner-specific supported Form 8889 statement amounts"
    );
  });

  it("Schedule 1 Line 15 - SE tax deduction", () => {
    const { input, extra } = makeFixture(undefined, { seDeductibleHalf: d(7065) });
    const result = calculateSchedule1(input, extra);
    expect(result.seDeduction.toNumber()).toBe(7065);
  });

  it("Schedule 1 Line 16 - SE retirement contributions", () => {
    const { input, extra } = makeFixture(undefined, { seRetirementContributions: d(20000) });
    const result = calculateSchedule1(input, extra);
    expect(result.seRetirementContributions.toNumber()).toBe(20000);
  });

  it("Schedule 1 Line 16 - zero when not self-employed", () => {
    const { input } = makeFixture();
    const result = calculateSchedule1(input);
    expect(result.seRetirementContributions.toNumber()).toBe(0);
  });

  it("Schedule 1 Line 17 - SE health insurance", () => {
    const { input } = makeFixture({
      selfEmployedHealthInsurance: "8000",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0", educatorExpenses: "0",
      studentLoanInterest: "0", iraDeduction: "0",
      alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);
    expect(result.seHealthInsurance.toNumber()).toBe(8000);
  });

  it("Schedule 1 Line 20 - IRA deduction", () => {
    const { input } = makeFixture({
      iraDeduction: "6500",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
      alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);
    expect(result.iraDeduction.toNumber()).toBe(6500);
  });

  it("Schedule 1 Line 21 - student loan interest capped at $2,500", () => {
    const { input } = makeFixture({
      studentLoanInterest: "4000",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", iraDeduction: "0",
      alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);
    expect(result.studentLoanInterest.toNumber()).toBe(2500);
  });

  it("Schedule 1 Line 21 - student loan interest under cap", () => {
    const { input } = makeFixture({
      studentLoanInterest: "1800",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", iraDeduction: "0",
      alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);
    expect(result.studentLoanInterest.toNumber()).toBe(1800);
  });

  it("Schedule 1 Line 23 - Archer MSA deduction flows through Schedule 1 and the Social Security add-back path", () => {
    const { input } = makeFixture({
      archerMSADeduction: "900",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
      iraDeduction: "0", alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);
    expect(result.archerMSADeduction.toNumber()).toBe(900);
    expect(result.totalAdjustments.toNumber()).toBe(900);
  });

  it("Schedule 1 Line 11 - educator expenses capped at $300", () => {
    const { input } = makeFixture({
      educatorExpenses: "500",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0",
      selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
      iraDeduction: "0", alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);
    expect(result.educatorExpenses.toNumber()).toBe(300);
  });

  it("Schedule 1 Line 11 - educator expenses under cap", () => {
    const { input } = makeFixture({
      educatorExpenses: "200",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0",
      selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
      iraDeduction: "0", alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);
    expect(result.educatorExpenses.toNumber()).toBe(200);
  });

  it("Schedule 1 Line 12 - business expense adjustments flow through Schedule 1 and the Social Security add-back path", () => {
    const { input } = makeFixture({
      businessExpenseAdjustments: "450",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0",
      hsaDeduction: "0",
      educatorExpenses: "0",
      selfEmployedHealthInsurance: "0",
      studentLoanInterest: "0",
      iraDeduction: "0",
      alimonyPaid: "0",
      earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);

    expect(result.businessExpenseAdjustments.toNumber()).toBe(450);
    expect(result.totalAdjustments.toNumber()).toBe(450);
  });

  it("Schedule 1 Line 14 - Armed Forces moving expenses flow through Schedule 1 and the Social Security add-back path", () => {
    const { input } = makeFixture({
      armedForcesMovingExpenses: "700",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0",
      hsaDeduction: "0",
      educatorExpenses: "0",
      selfEmployedHealthInsurance: "0",
      studentLoanInterest: "0",
      iraDeduction: "0",
      alimonyPaid: "0",
      earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);

    expect(result.armedForcesMovingExpenses.toNumber()).toBe(700);
    expect(result.totalAdjustments.toNumber()).toBe(700);
  });

  it("Schedule 1 Line 25 - manual total other adjustments flow through Schedule 1 and the Social Security add-back path", () => {
    const { input } = makeFixture({
      otherAdjustmentsTotal: "725",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0",
      hsaDeduction: "0",
      educatorExpenses: "0",
      selfEmployedHealthInsurance: "0",
      studentLoanInterest: "0",
      iraDeduction: "0",
      alimonyPaid: "0",
      earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);

    expect(result.otherAdjustmentsTotal.toNumber()).toBe(725);
    expect(result.totalAdjustments.toNumber()).toBe(725);

    const line25 = result.lines.find((line) => line.form === "Sched 1" && line.line === "25");
    expect(line25?.value.toNumber()).toBe(725);
  });

  it("Schedule 1 Line 26 - total adjustments", () => {
    const { input, extra } = makeFixture(
      {
        businessExpenseAdjustments: "350",
        hsaDeduction: "4000",
        armedForcesMovingExpenses: "650",
        studentLoanInterest: "2000",
        archerMSADeduction: "900",
        educatorExpenses: "250",
        otherAdjustmentsTotal: "725",
        selfEmployedHealthInsurance: "0",
        iraDeduction: "0",
        estimatedTaxPayments: [],
        otherTaxesPaid: "0",
        alimonyPaid: "1000",
        earlyWithdrawalPenalty: "500",
      },
      { seDeductibleHalf: d(3000), seRetirementContributions: d(5000) }
    );
    const result = calculateSchedule1(input, extra);
    // 250 + 350 + 4000 + 650 + 3000 + 5000 + 2000 + 900 + 725 + 500 + 1000 = 18375
    expect(result.totalAdjustments.toNumber()).toBe(18375);
  });

  it("Schedule 1 Line 18 - early withdrawal penalty", () => {
    const { input, extra } = makeFixture(undefined, { earlyWithdrawalPenalty: d(750) });
    const result = calculateSchedule1(input, extra);
    expect(result.earlyWithdrawalPenalty.toNumber()).toBe(750);
    expect(result.totalAdjustments.toNumber()).toBe(750);
  });

  it("Schedule 1 Line 18 - early withdrawal penalty from adjustments fallback", () => {
    const { input } = makeFixture({ earlyWithdrawalPenalty: "500" });
    const result = calculateSchedule1(input);
    expect(result.earlyWithdrawalPenalty.toNumber()).toBe(500);
  });

  it("Schedule 1 Line 19a - alimony paid", () => {
    const { input, extra } = makeFixture(undefined, { alimonyPaid: d(12000) });
    const result = calculateSchedule1(input, extra);
    expect(result.alimonyPaid.toNumber()).toBe(12000);
    expect(result.totalAdjustments.toNumber()).toBe(12000);
  });

  it("Schedule 1 Line 19a - alimony paid from adjustments fallback", () => {
    const { input } = makeFixture({ alimonyPaid: "8000" });
    const result = calculateSchedule1(input);
    expect(result.alimonyPaid.toNumber()).toBe(8000);
  });

  it("Schedule 1 - zero adjustments when nothing provided", () => {
    const { input } = makeFixture();
    const result = calculateSchedule1(input);
    expect(result.totalAdjustments.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Schedule 1 - edge cases", () => {
  it("Schedule 1 Line 10 - all income types combined", () => {
    const { input, extra } = makeFixture(undefined, {
      taxableStateRefund: d(1200),
      schedCNetProfit: d(50000),
      schedETotal: d(8000),
      capitalGainLoss: d(15000),
      alimonyReceived: d(6000),
    });
    const result = calculateSchedule1(input, extra);
    expect(result.totalAdditionalIncome.toNumber()).toBe(80200);
  });

  it("Schedule 1 Line 10 - negative components reduce total", () => {
    const { input, extra } = makeFixture(undefined, {
      schedCNetProfit: d(-10000),
      capitalGainLoss: d(-3000),
      schedETotal: d(5000),
    });
    const result = calculateSchedule1(input, extra);
    // -10000 + -3000 + 5000 = -8000
    expect(result.totalAdditionalIncome.toNumber()).toBe(-8000);
  });

  it("Schedule 1 Line 26 - all adjustments combined", () => {
    const { input, extra } = makeFixture(
      {
        businessExpenseAdjustments: "450",
        hsaDeduction: "3600",
        armedForcesMovingExpenses: "700",
        selfEmployedHealthInsurance: "12000",
        iraDeduction: "6500",
        studentLoanInterest: "2500",
        archerMSADeduction: "800",
        educatorExpenses: "300",
        otherAdjustmentsTotal: "725",
        estimatedTaxPayments: [],
        otherTaxesPaid: "0",
        alimonyPaid: "0",
        earlyWithdrawalPenalty: "0",
      },
      {
        seDeductibleHalf: d(7065),
        seRetirementContributions: d(15000),
        earlyWithdrawalPenalty: d(250),
        alimonyPaid: d(24000),
      }
    );
    const result = calculateSchedule1(input, extra);
    // 300+450+3600+700+7065+15000+12000+6500+2500+800+725+250+24000 = 73890
    expect(result.totalAdjustments.toNumber()).toBe(73890);
  });

  it("Schedule 1 Line 21 - student loan interest exactly at $2,500 cap", () => {
    const { input } = makeFixture({
      studentLoanInterest: "2500",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", iraDeduction: "0",
      alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);
    expect(result.studentLoanInterest.toNumber()).toBe(2500);
  });

  it("Schedule 1 Line 21 - single filer at the 2025 $85,000 MAGI threshold keeps the full deduction", () => {
    const { input } = makeFixture({
      studentLoanInterest: "2500",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", iraDeduction: "0",
      alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    input.w2s = [
      {
        ...input.w2s[0],
        wages: "85000",
        socialSecurityWages: "85000",
        medicareWages: "85000",
        stateWages: "85000",
      },
    ];

    const result = calculateSchedule1(input);
    expect(result.studentLoanInterest.toNumber()).toBe(2500);
  });

  it("Schedule 1 Line 21 - single filer halfway through the 2025 MAGI phase-out keeps half the deduction", () => {
    const { input } = makeFixture({
      studentLoanInterest: "2500",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", iraDeduction: "0",
      alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    input.w2s = [
      {
        ...input.w2s[0],
        wages: "92500",
        socialSecurityWages: "92500",
        medicareWages: "92500",
        stateWages: "92500",
      },
    ];

    const result = calculateSchedule1(input);
    expect(result.studentLoanInterest.toNumber()).toBe(1250);
  });

  it("Schedule 1 Line 21 - worksheet rounds the final deduction to the nearest whole dollar after a 3-decimal phase-out ratio", () => {
    const { input } = makeFixture({
      studentLoanInterest: "2500",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", iraDeduction: "0",
      alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    input.w2s = [
      {
        ...input.w2s[0],
        wages: "92515",
        socialSecurityWages: "92515",
        medicareWages: "92515",
        stateWages: "92515",
      },
    ];

    const result = calculateSchedule1(input);
    expect(result.studentLoanInterest.toNumber()).toBe(1248);
  });

  it("Schedule 1 Line 21 - single filer at the 2025 $100,000 MAGI phase-out ceiling gets no deduction", () => {
    const { input } = makeFixture({
      studentLoanInterest: "2500",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", iraDeduction: "0",
      alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    input.w2s = [
      {
        ...input.w2s[0],
        wages: "100000",
        socialSecurityWages: "100000",
        medicareWages: "100000",
        stateWages: "100000",
      },
    ];

    const result = calculateSchedule1(input);
    expect(result.studentLoanInterest.toNumber()).toBe(0);
  });

  it("Schedule 1 Line 21 - MFJ filers halfway through the 2025 MAGI phase-out keep half the deduction", () => {
    const { input } = makeFixture({
      studentLoanInterest: "2500",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", iraDeduction: "0",
      alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    input.taxpayer = {
      ...input.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "Pat",
        lastName: "Doe",
        ssn: "987-65-4321",
        dateOfBirth: "1991-02-02",
      },
    };
    input.w2s = [
      {
        ...input.w2s[0],
        wages: "185000",
        socialSecurityWages: "176100",
        medicareWages: "185000",
        stateWages: "185000",
      },
    ];

    const result = calculateSchedule1(input);
    expect(result.studentLoanInterest.toNumber()).toBe(1250);
  });

  it("Schedule 1 Line 11 - educator expenses exactly at $300 cap", () => {
    const { input } = makeFixture({
      educatorExpenses: "300",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0",
      selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
      iraDeduction: "0", alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);
    expect(result.educatorExpenses.toNumber()).toBe(300);
  });

  it("Schedule 1 Line 11 - educator expenses $301 capped to $300", () => {
    const { input } = makeFixture({
      educatorExpenses: "301",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0",
      selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
      iraDeduction: "0", alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);
    expect(result.educatorExpenses.toNumber()).toBe(300);
  });

  it("Schedule 1 Line 11 - MFJ caps each eligible educator at $300 for up to $600 total", () => {
    const { input } = makeFixture({
      educatorExpenses: "999",
      primaryEducatorExpenses: "500",
      spouseEducatorExpenses: "250",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0",
      selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
      iraDeduction: "0", alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    input.taxpayer = {
      ...input.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "Pat",
        lastName: "Doe",
        ssn: "987-65-4321",
        dateOfBirth: "1991-02-02",
      },
    };

    const result = calculateSchedule1(input);
    const line11 = result.lines.find((line) => line.form === "Sched 1" && line.line === "11");

    expect(result.educatorExpenses.toNumber()).toBe(550);
    expect(line11?.formula).toBe("min(primary educator expenses, $300) + min(spouse educator expenses, $300)");
    expect(String(line11?.inputs["Primary educator expenses entered"])).toBe("500");
    expect(String(line11?.inputs["Primary educator expenses allowed"])).toBe("300");
    expect(String(line11?.inputs["Spouse educator expenses entered"])).toBe("250");
    expect(String(line11?.inputs["Spouse educator expenses allowed"])).toBe("250");
    expect(String(line11?.inputs["Ignored aggregate educator expenses fallback"])).toBe("999");
  });

  it("Schedule 1 Line 11 - MFJ aggregate fallback stays capped at $300 without split educator inputs", () => {
    const { input } = makeFixture({
      educatorExpenses: "500",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0",
      selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
      iraDeduction: "0", alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    input.taxpayer = {
      ...input.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "Pat",
        lastName: "Doe",
        ssn: "987-65-4321",
        dateOfBirth: "1991-02-02",
      },
    };

    const result = calculateSchedule1(input);
    expect(result.educatorExpenses.toNumber()).toBe(300);
  });

  it("Schedule 1 - adjustments without additional income", () => {
    const { input, extra } = makeFixture(
      {
        hsaDeduction: "4000",
        estimatedTaxPayments: [],
        otherTaxesPaid: "0", educatorExpenses: "0",
        selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
        iraDeduction: "0", alimonyPaid: "0", earlyWithdrawalPenalty: "0",
      }
    );
    const result = calculateSchedule1(input, extra);
    expect(result.totalAdditionalIncome.toNumber()).toBe(0);
    expect(result.totalAdjustments.toNumber()).toBe(4000);
  });

  it("Schedule 1 - additional income without adjustments", () => {
    const { input, extra } = makeFixture(undefined, {
      schedCNetProfit: d(75000),
      capitalGainLoss: d(5000),
    });
    const result = calculateSchedule1(input, extra);
    expect(result.totalAdditionalIncome.toNumber()).toBe(80000);
    expect(result.totalAdjustments.toNumber()).toBe(0);
  });

  it("Schedule 1 - alimony pair (received and paid)", () => {
    const { input, extra } = makeFixture(undefined, {
      alimonyReceived: d(18000),
      alimonyPaid: d(24000),
    });
    const result = calculateSchedule1(input, extra);
    expect(result.alimonyReceived.toNumber()).toBe(18000);
    expect(result.alimonyPaid.toNumber()).toBe(24000);
    expect(result.totalAdditionalIncome.toNumber()).toBe(18000);
    expect(result.totalAdjustments.toNumber()).toBe(24000);
  });

  it("Schedule 1 - fractional dollar amounts preserve precision", () => {
    const { input, extra } = makeFixture(undefined, {
      schedCNetProfit: d("12345.67"),
      capitalGainLoss: d("890.12"),
      seDeductibleHalf: d("1234.56"),
    });
    const result = calculateSchedule1(input, extra);
    expect(result.totalAdditionalIncome.equals(d("13235.79"))).toBe(true);
    expect(result.totalAdjustments.equals(d("1234.56"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail
// ═══════════════════════════════════════════════════════════

describe("Schedule 1 - audit trail", () => {
  it("produces audit trail for all lines", () => {
    const { input, extra } = makeFixture(
      {
        hsaDeduction: "1000", studentLoanInterest: "500", educatorExpenses: "100",
        selfEmployedHealthInsurance: "0", iraDeduction: "0",
        estimatedTaxPayments: [], otherTaxesPaid: "0",
        alimonyPaid: "0", earlyWithdrawalPenalty: "0",
      },
      { schedCNetProfit: d(10000), seDeductibleHalf: d(500) }
    );
    const result = calculateSchedule1(input, extra);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("1");
    expect(lineIds).toContain("3");
    expect(lineIds).toContain("5");
    expect(lineIds).toContain("7");
    expect(lineIds).toContain("10");
    expect(lineIds).toContain("11");
    expect(lineIds).toContain("13");
    expect(lineIds).toContain("15");
    expect(lineIds).toContain("16");
    expect(lineIds).toContain("18");
    expect(lineIds).toContain("19a");
    expect(lineIds).toContain("21");
    expect(lineIds).toContain("25");
    expect(lineIds).toContain("26");
  });

  it("audit trail includes Line 17 (SE health insurance) entry", () => {
    const { input } = makeFixture({
      selfEmployedHealthInsurance: "9000",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0", educatorExpenses: "0",
      studentLoanInterest: "0", iraDeduction: "0",
      alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("17");
  });

  it("audit trail includes Line 20 (IRA deduction) entry", () => {
    const { input } = makeFixture({
      iraDeduction: "6500",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
      alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("20");
  });

  it("audit trail includes Line 2a (alimony received) entry", () => {
    const { input, extra } = makeFixture(undefined, { alimonyReceived: d(18000) });
    const result = calculateSchedule1(input, extra);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("2a");
  });
});

// ═══════════════════════════════════════════════════════════
// New Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Schedule 1 - additional edge cases", () => {
  it("Schedule 1 Line 26 - student loan + HSA + SE health insurance + educator expenses combined", () => {
    const { input, extra } = makeFixture(
      {
        studentLoanInterest: "2500",
        hsaDeduction: "3850",
        selfEmployedHealthInsurance: "6000",
        educatorExpenses: "300",
        otherAdjustmentsTotal: "725",
        iraDeduction: "0",
        estimatedTaxPayments: [],
        otherTaxesPaid: "0",
        alimonyPaid: "0",
        earlyWithdrawalPenalty: "0",
      },
      { seDeductibleHalf: d(4000) }
    );
    const result = calculateSchedule1(input, extra);
    // 2500 + 3850 + 6000 + 300 + 725 + 4000 = 17375
    expect(result.studentLoanInterest.toNumber()).toBe(2500);
    expect(result.hsaDeduction.toNumber()).toBe(3850);
    expect(result.seHealthInsurance.toNumber()).toBe(6000);
    expect(result.educatorExpenses.toNumber()).toBe(300);
    expect(result.otherAdjustmentsTotal.toNumber()).toBe(725);
    expect(result.seDeduction.toNumber()).toBe(4000);
    expect(result.totalAdjustments.toNumber()).toBe(17375);
  });

  it("Schedule 1 Line 11 - educator expenses $1 below cap flows through unchanged", () => {
    const { input } = makeFixture({
      educatorExpenses: "299",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0",
      selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
      iraDeduction: "0", alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);
    expect(result.educatorExpenses.toNumber()).toBe(299);
  });

  it("Schedule 1 Line 11 - MFJ educator expenses capped at $600 with split inputs", () => {
    const mfjInput: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: { firstName: "John", lastName: "Doe", ssn: "987-65-4321", dateOfBirth: "1990-02-20" },
      },
      adjustments: {
        primaryEducatorExpenses: "400",
        spouseEducatorExpenses: "400",
        estimatedTaxPayments: [],
        otherTaxesPaid: "0", hsaDeduction: "0",
        selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
        iraDeduction: "0", alimonyPaid: "0", earlyWithdrawalPenalty: "0",
      },
    };
    const result = calculateSchedule1(mfjInput);
    // Each spouse capped at $300, so total = $300 + $300 = $600
    expect(result.educatorExpenses.toNumber()).toBe(600);
  });

  it("Schedule 1 Line 11 - MFJ educator expenses $550 under $600 cap with split inputs", () => {
    const mfjInput: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: { firstName: "John", lastName: "Doe", ssn: "987-65-4321", dateOfBirth: "1990-02-20" },
      },
      adjustments: {
        primaryEducatorExpenses: "275",
        spouseEducatorExpenses: "275",
        estimatedTaxPayments: [],
        otherTaxesPaid: "0", hsaDeduction: "0",
        selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
        iraDeduction: "0", alimonyPaid: "0", earlyWithdrawalPenalty: "0",
      },
    };
    const result = calculateSchedule1(mfjInput);
    // Both under $300 per-spouse cap, total = $275 + $275 = $550
    expect(result.educatorExpenses.toNumber()).toBe(550);
  });

  it("Schedule 1 Line 21 - student loan interest $1 below cap flows through unchanged", () => {
    const { input } = makeFixture({
      studentLoanInterest: "2499",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", iraDeduction: "0",
      alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);
    expect(result.studentLoanInterest.toNumber()).toBe(2499);
  });

  it("Schedule 1 Line 21 - student loan interest $1 above cap is capped at $2,500", () => {
    const { input } = makeFixture({
      studentLoanInterest: "2501",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", iraDeduction: "0",
      alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);
    expect(result.studentLoanInterest.toNumber()).toBe(2500);
  });

  it("Schedule 1 Line 13 - HSA self-only contribution limit ($4,300 for 2025)", () => {
    const { input } = makeFixture({
      hsaDeduction: "4300",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
      iraDeduction: "0", alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);
    expect(result.hsaDeduction.toNumber()).toBe(4300);
    expect(result.totalAdjustments.toNumber()).toBe(4300);
  });

  it("Schedule 1 Line 13 - HSA family contribution limit ($8,550 for 2025)", () => {
    const { input } = makeFixture({
      hsaDeduction: "8550",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
      iraDeduction: "0", alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);
    expect(result.hsaDeduction.toNumber()).toBe(8550);
    expect(result.totalAdjustments.toNumber()).toBe(8550);
  });

  it("Schedule 1 Line 20 - IRA deduction at annual contribution limit ($7,000 for 2025)", () => {
    const { input } = makeFixture({
      iraDeduction: "7000",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
      alimonyPaid: "0", earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);
    expect(result.iraDeduction.toNumber()).toBe(7000);
    expect(result.totalAdjustments.toNumber()).toBe(7000);
  });

  it("Schedule 1 Line 17 - SE health insurance deduction for self-employed taxpayer", () => {
    const { input, extra } = makeFixture(
      {
        selfEmployedHealthInsurance: "14000",
        estimatedTaxPayments: [],
        otherTaxesPaid: "0", hsaDeduction: "0", educatorExpenses: "0",
        studentLoanInterest: "0", iraDeduction: "0",
        alimonyPaid: "0", earlyWithdrawalPenalty: "0",
      },
      { schedCNetProfit: d(80000), seDeductibleHalf: d(5650) }
    );
    const result = calculateSchedule1(input, extra);
    expect(result.seHealthInsurance.toNumber()).toBe(14000);
    // 5650 (SE deduction) + 80000 (business) flows to additional income
    expect(result.businessIncome.toNumber()).toBe(80000);
    expect(result.totalAdjustments.toNumber()).toBe(19650); // 14000 + 5650
  });

  it("Schedule 1 Line 7 - capital gain flows into total additional income", () => {
    const { input, extra } = makeFixture(undefined, {
      capitalGainLoss: d(25000),
      taxableStateRefund: d(300),
    });
    const result = calculateSchedule1(input, extra);
    expect(result.capitalGainLoss.toNumber()).toBe(25000);
    expect(result.totalAdditionalIncome.toNumber()).toBe(25300);
  });

  it("Schedule 1 Line 7 - capital loss reduces total additional income", () => {
    const { input, extra } = makeFixture(undefined, {
      capitalGainLoss: d(-3000),
      schedETotal: d(8000),
    });
    const result = calculateSchedule1(input, extra);
    expect(result.capitalGainLoss.toNumber()).toBe(-3000);
    expect(result.totalAdditionalIncome.toNumber()).toBe(5000); // -3000 + 8000
  });

  it("Schedule 1 Line 19a - alimony paid from pre-2019 divorce reduces total adjustments", () => {
    const { input } = makeFixture({
      alimonyPaid: "18000",
      estimatedTaxPayments: [],
      otherTaxesPaid: "0", hsaDeduction: "0", educatorExpenses: "0",
      selfEmployedHealthInsurance: "0", studentLoanInterest: "0",
      iraDeduction: "0", earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);
    expect(result.alimonyPaid.toNumber()).toBe(18000);
    expect(result.totalAdjustments.toNumber()).toBe(18000);
  });

  // ── SE health insurance cap per IRS Schedule 1 Instructions, Line 17 ──
  // "You can't deduct more than the net profit you earned from the trade or business
  // under which the insurance plan was established (reduced by any deductions you
  // claim on Schedule 1, lines 15 and 16)."
  // Cap = max(0, net_profit - deductible_half_SE_tax - SE_retirement_contributions)

  it("Schedule 1 Line 17 - premiums capped at net profit minus deductible SE tax", () => {
    // $15K net profit, $1,060 deductible SE, $20K premiums
    // Cap = max(0, 15000 - 1060) = 13940
    // Deduction = min(20000, 13940) = 13940
    const { input, extra } = makeFixture(
      {
        selfEmployedHealthInsurance: "20000",
        estimatedTaxPayments: [],
        otherTaxesPaid: "0", hsaDeduction: "0", educatorExpenses: "0",
        studentLoanInterest: "0", iraDeduction: "0",
        alimonyPaid: "0", earlyWithdrawalPenalty: "0",
      },
      { schedCNetProfit: d(15000), seDeductibleHalf: d(1060) }
    );
    const result = calculateSchedule1(input, extra);
    expect(result.seHealthInsurance.toNumber()).toBe(13940);
  });

  it("Schedule 1 Line 17 - business loss means zero deduction", () => {
    // Business loss: net profit = -$5,000
    // Cap = max(0, -5000 - 0) = 0
    const { input, extra } = makeFixture(
      {
        selfEmployedHealthInsurance: "12000",
        estimatedTaxPayments: [],
        otherTaxesPaid: "0", hsaDeduction: "0", educatorExpenses: "0",
        studentLoanInterest: "0", iraDeduction: "0",
        alimonyPaid: "0", earlyWithdrawalPenalty: "0",
      },
      { schedCNetProfit: d(-5000), seDeductibleHalf: d(0) }
    );
    const result = calculateSchedule1(input, extra);
    expect(result.seHealthInsurance.toNumber()).toBe(0);
  });

  it("Schedule 1 Line 17 - zero net profit means zero deduction", () => {
    const { input, extra } = makeFixture(
      {
        selfEmployedHealthInsurance: "8000",
        estimatedTaxPayments: [],
        otherTaxesPaid: "0", hsaDeduction: "0", educatorExpenses: "0",
        studentLoanInterest: "0", iraDeduction: "0",
        alimonyPaid: "0", earlyWithdrawalPenalty: "0",
      },
      { schedCNetProfit: d(0), seDeductibleHalf: d(0) }
    );
    const result = calculateSchedule1(input, extra);
    expect(result.seHealthInsurance.toNumber()).toBe(0);
  });

  it("Schedule 1 Line 17 - cap includes SE retirement contributions (Line 16)", () => {
    // $50K net profit, $3,533 deductible SE, $5,000 SE retirement, $45K premiums
    // Cap = max(0, 50000 - 3533 - 5000) = 41467
    // Deduction = min(45000, 41467) = 41467
    const { input, extra } = makeFixture(
      {
        selfEmployedHealthInsurance: "45000",
        estimatedTaxPayments: [],
        otherTaxesPaid: "0", hsaDeduction: "0", educatorExpenses: "0",
        studentLoanInterest: "0", iraDeduction: "0",
        alimonyPaid: "0", earlyWithdrawalPenalty: "0",
      },
      { schedCNetProfit: d(50000), seDeductibleHalf: d(3533), seRetirementContributions: d(5000) }
    );
    const result = calculateSchedule1(input, extra);
    expect(result.seHealthInsurance.toNumber()).toBe(41467);
  });

  it("Schedule 1 - zero adjustments scenario produces all-zero Part II values", () => {
    const { input } = makeFixture({
      estimatedTaxPayments: [],
      otherTaxesPaid: "0",
      educatorExpenses: "0",
      hsaDeduction: "0",
      selfEmployedHealthInsurance: "0",
      studentLoanInterest: "0",
      iraDeduction: "0",
      alimonyPaid: "0",
      earlyWithdrawalPenalty: "0",
    });
    const result = calculateSchedule1(input);
    expect(result.hsaDeduction.toNumber()).toBe(0);
    expect(result.seDeduction.toNumber()).toBe(0);
    expect(result.seRetirementContributions.toNumber()).toBe(0);
    expect(result.seHealthInsurance.toNumber()).toBe(0);
    expect(result.iraDeduction.toNumber()).toBe(0);
    expect(result.studentLoanInterest.toNumber()).toBe(0);
    expect(result.educatorExpenses.toNumber()).toBe(0);
    expect(result.earlyWithdrawalPenalty.toNumber()).toBe(0);
    expect(result.alimonyPaid.toNumber()).toBe(0);
    expect(result.totalAdjustments.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// IRA Deduction Worksheet integration through Schedule 1
// ═══════════════════════════════════════════════════════════

describe("Schedule 1 Line 20 - IRA Deduction Worksheet integration", () => {
  it("Schedule 1 Line 20 - single active participant mid-phase-out computes partial IRA deduction from worksheet", () => {
    // Single filer, $85,000 wages, active participant
    // IRA MAGI ≈ $85,000 (wages only, no other adjustments)
    // Phase-out: $79K-$89K, excess = $6,000, ratio = 0.6
    // Reduction = 0.6 × $7,000 = $4,200 → ceil $10 = $4,200
    // Deduction = $7,000 - $4,200 = $2,800
    const { input } = makeFixture();
    input.iraDeductionWorksheet = {
      primaryContributions: "7000",
      primaryIsActiveParticipant: true,
      primaryAge50OrOlder: false,
    };
    const result = calculateSchedule1(input);
    expect(result.iraDeduction.toNumber()).toBe(2800);
    expect(result.totalAdjustments.toNumber()).toBe(2800);
  });

  it("Schedule 1 Line 20 - single non-active participant gets full IRA deduction regardless of income", () => {
    const { input } = makeFixture();
    input.iraDeductionWorksheet = {
      primaryContributions: "7000",
      primaryIsActiveParticipant: false,
    };
    const result = calculateSchedule1(input);
    expect(result.iraDeduction.toNumber()).toBe(7000);
  });

  it("Schedule 1 Line 20 - single active participant fully phased out above $89K", () => {
    const { input } = makeFixture();
    // Fixture has $85K wages; add interest to push MAGI above $89K
    input.form1099Int = [
      { payer: "Bank", interestIncome: "5000", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
    ];
    input.iraDeductionWorksheet = {
      primaryContributions: "7000",
      primaryIsActiveParticipant: true,
      primaryAge50OrOlder: false,
    };
    const result = calculateSchedule1(input);
    // MAGI = $85K wages + $5K interest = $90K, above $89K ceiling
    expect(result.iraDeduction.toNumber()).toBe(0);
  });

  it("Schedule 1 Line 20 - age 50+ uses $8,000 contribution limit in phase-out", () => {
    // Single, $84K MAGI, active participant, age 50+
    // Need MAGI = $84K; fixture has $85K wages, so add a $1K SE deduction
    const { input } = makeFixture();
    input.w2s = [{
      ...input.w2s[0],
      wages: "84000",
    }];
    input.iraDeductionWorksheet = {
      primaryContributions: "8000",
      primaryIsActiveParticipant: true,
      primaryAge50OrOlder: true,
    };
    const result = calculateSchedule1(input);
    // MAGI = $84K, excess = $5K, ratio = 0.5
    // Reduction = 0.5 × $8,000 = $4,000 → $4,000
    // Deduction = $8,000 - $4,000 = $4,000
    expect(result.iraDeduction.toNumber()).toBe(4000);
  });

  it("Schedule 1 Line 20 - MFJ both spouses contributing with active primary mid-phase-out", () => {
    const { input } = makeFixture();
    input.taxpayer = {
      ...input.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "John",
        lastName: "Doe",
        ssn: "987-65-4321",
        dateOfBirth: "1990-06-15",
      },
    };
    // MFJ active participant phase-out: $126K-$146K
    // Set wages to $136K so primary is mid-phase-out
    input.w2s = [{
      ...input.w2s[0],
      wages: "136000",
    }];
    input.iraDeductionWorksheet = {
      primaryContributions: "7000",
      primaryIsActiveParticipant: true,
      primaryAge50OrOlder: false,
      spouseContributions: "5000",
      spouseIsActiveParticipant: false,
      spouseAge50OrOlder: false,
    };
    const result = calculateSchedule1(input);
    // Primary: MAGI $136K, excess = $10K, ratio = 0.5, reduction = $3,500, deduction = $3,500
    // Spouse: not active and primary IS active → spouse uses $236K-$246K thresholds
    // MAGI $136K is below $236K → spouse gets full $5,000
    // Total = $3,500 + $5,000 = $8,500
    expect(result.iraDeduction.toNumber()).toBe(8500);
  });

  it("Schedule 1 Line 20 - MFJ non-participant with active spouse uses $236K-$246K phase-out", () => {
    const { input } = makeFixture();
    input.taxpayer = {
      ...input.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "John",
        lastName: "Doe",
        ssn: "987-65-4321",
        dateOfBirth: "1990-06-15",
      },
    };
    input.w2s = [{
      ...input.w2s[0],
      wages: "241000",
    }];
    input.iraDeductionWorksheet = {
      primaryContributions: "7000",
      primaryIsActiveParticipant: false,
      spouseIsActiveParticipant: true,
    };
    const result = calculateSchedule1(input);
    // Primary: not active but spouse is → $236K-$246K phase-out
    // MAGI $241K, excess = $5K, ratio = 0.5, reduction = $3,500, deduction = $3,500
    expect(result.iraDeduction.toNumber()).toBe(3500);
  });

  it("Schedule 1 Line 20 - IRA worksheet takes priority over manual iraDeduction adjustment", () => {
    const { input } = makeFixture({
      iraDeduction: "9999", // manual value should be ignored
    });
    input.iraDeductionWorksheet = {
      primaryContributions: "7000",
      primaryIsActiveParticipant: false,
    };
    const result = calculateSchedule1(input);
    // Worksheet says full $7,000, manual $9,999 should be ignored
    expect(result.iraDeduction.toNumber()).toBe(7000);
  });

  it("Schedule 1 Line 20 - manual iraDeduction fallback works when no worksheet provided", () => {
    const { input } = makeFixture({
      iraDeduction: "3000",
    });
    const result = calculateSchedule1(input);
    expect(result.iraDeduction.toNumber()).toBe(3000);
  });

  it("Schedule 1 Line 20 - IRA deduction from worksheet feeds into totalAdjustments and is included in student loan MAGI", () => {
    const { input } = makeFixture({
      studentLoanInterest: "2500",
    });
    // Set wages low enough that student loan is not phased out
    // but IRA is partially phased out
    input.w2s = [{
      ...input.w2s[0],
      wages: "84000",
    }];
    input.iraDeductionWorksheet = {
      primaryContributions: "7000",
      primaryIsActiveParticipant: true,
      primaryAge50OrOlder: false,
    };
    const result = calculateSchedule1(input);
    // IRA: MAGI $84K, excess $5K, ratio 0.5, deduction $3,500
    expect(result.iraDeduction.toNumber()).toBe(3500);
    // Student loan: MAGI = $84K - $3,500 (IRA deduction is in adjustments)
    // = $80,500, below $85K floor → full $2,500
    expect(result.studentLoanInterest.toNumber()).toBe(2500);
    // Total adjustments = IRA + student loan
    expect(result.totalAdjustments.toNumber()).toBe(6000);
  });

  it("Schedule 1 Line 20 - IRA worksheet audit trail includes Pub 590-A worksheet lines", () => {
    const { input } = makeFixture();
    input.iraDeductionWorksheet = {
      primaryContributions: "7000",
      primaryIsActiveParticipant: true,
    };
    const result = calculateSchedule1(input);
    const iraWorksheetLines = result.lines.filter(
      (l) => l.form === "IRA Deduction Worksheet"
    );
    expect(iraWorksheetLines.length).toBeGreaterThan(0);
    const line20 = result.lines.find(
      (l) => l.form === "Sched 1" && l.line === "20"
    );
    expect(line20).toBeDefined();
    expect(line20!.description).toContain("IRA deduction");
  });

  it("Schedule 1 Line 20 - MFS active participant uses $0-$10K phase-out through Schedule 1", () => {
    const { input } = makeFixture();
    input.taxpayer = {
      ...input.taxpayer,
      filingStatus: "married_filing_separately",
    };
    input.w2s = [{
      ...input.w2s[0],
      wages: "5000",
    }];
    input.iraDeductionWorksheet = {
      primaryContributions: "7000",
      primaryIsActiveParticipant: true,
    };
    const result = calculateSchedule1(input);
    // MFS $0-$10K phase-out, MAGI $5K, excess $5K, ratio 0.5
    // reduction = 0.5 × $7,000 = $3,500, deduction = $3,500
    expect(result.iraDeduction.toNumber()).toBe(3500);
  });

  it("Schedule 1 Line 20 - zero contributions in worksheet produce zero deduction", () => {
    const { input } = makeFixture();
    input.iraDeductionWorksheet = {
      primaryContributions: "0",
      primaryIsActiveParticipant: false,
    };
    const result = calculateSchedule1(input);
    expect(result.iraDeduction.toNumber()).toBe(0);
  });

  it("Schedule 1 Line 20 - other adjustments reduce IRA MAGI and can increase IRA deduction", () => {
    // Wages $85K + HSA deduction $4K → IRA MAGI = $81K
    // Active participant, phase-out $79K-$89K, excess = $2K, ratio = 0.2
    // Reduction = 0.2 × $7,000 = $1,400, deduction = $5,600
    const { input } = makeFixture({
      hsaDeduction: "4000",
    });
    input.iraDeductionWorksheet = {
      primaryContributions: "7000",
      primaryIsActiveParticipant: true,
    };
    const result = calculateSchedule1(input);
    expect(result.iraDeduction.toNumber()).toBe(5600);
  });
});
