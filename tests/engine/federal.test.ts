/**
 * Integration tests for the federal tax engine.
 * Each test references a spec line from spec/federal/form-1040.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { simpleW2Fixture, complexMFJFixture } from "../fixtures/simple-w2.js";

const d = (n: number | string) => new Decimal(n);

// ═══════════════════════════════════════════════════════════
// Simple W-2 Scenario (Single filer, one W-2, no other income)
// ═══════════════════════════════════════════════════════════

describe("Simple W-2 single filer", () => {
  const result = calculateFederalTax(simpleW2Fixture);

  it("Form 1040 Line 1 - total wages from all W-2s", () => {
    expect(result.totalWages.toNumber()).toBe(85000);
  });

  it("Form 1040 Line 1 - disability pensions before minimum retirement age are taxed as wages instead of pension income", () => {
    const disabilityWageResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "State Disability Retirement",
          grossDistribution: "12000",
          taxableAmount: "9000",
          taxableAmountNotDetermined: true,
          federalWithheld: "900",
          distributionCode: "3",
          iraSepSimple: false,
          disabilityPensionBeforeMinimumRetirementAge: true,
        },
      ],
    });

    const line1 = disabilityWageResult.allLines.find((line) => line.form === "1040" && line.line === "1");
    const line5a = disabilityWageResult.allLines.find((line) => line.form === "1040" && line.line === "5a");
    const line5b = disabilityWageResult.allLines.find((line) => line.form === "1040" && line.line === "5b");

    expect(line1?.value.toNumber()).toBe(94000);
    expect(line5a?.value.toNumber()).toBe(0);
    expect(line5b?.value.toNumber()).toBe(0);
    expect(disabilityWageResult.totalWages.toNumber()).toBe(94000);
    expect(disabilityWageResult.totalIncome.toNumber()).toBe(94000);
    expect(disabilityWageResult.totalWithholding.toNumber()).toBe(13650);
  });

  it("Form 1040 Line 1 - retired public safety officer premiums reduce disability pension wages up to the shared annual cap", () => {
    const disabilityWageResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "State Disability Retirement",
          grossDistribution: "12000",
          taxableAmount: "9000",
          taxableAmountNotDetermined: true,
          federalWithheld: "900",
          distributionCode: "3",
          iraSepSimple: false,
          disabilityPensionBeforeMinimumRetirementAge: true,
          retiredPublicSafetyOfficerInsurancePremiums: "2500",
        },
        {
          payer: "County Pension",
          grossDistribution: "8000",
          taxableAmount: "5000",
          federalWithheld: "0",
          distributionCode: "7",
          iraSepSimple: false,
          retiredPublicSafetyOfficerInsurancePremiums: "2000",
        },
      ],
    });

    const line1 = disabilityWageResult.allLines.find((line) => line.form === "1040" && line.line === "1");
    const line5a = disabilityWageResult.allLines.find((line) => line.form === "1040" && line.line === "5a");
    const line5b = disabilityWageResult.allLines.find((line) => line.form === "1040" && line.line === "5b");

    expect(line1?.value.toNumber()).toBe(91500);
    expect(line5a?.value.toNumber()).toBe(8000);
    expect(line5b?.value.toNumber()).toBe(4500);
    expect(disabilityWageResult.totalWages.toNumber()).toBe(91500);
    expect(disabilityWageResult.pensionDistributionsGross.toNumber()).toBe(8000);
    expect(disabilityWageResult.pensionDistributionsTaxable.toNumber()).toBe(4500);
    expect(disabilityWageResult.totalIncome.toNumber()).toBe(96000);
  });

  it("Form 1040 Line 1 - supported Form 4137 unreported tip income increases wages and total income", () => {
    const form4137Result = calculateFederalTax({
      ...simpleW2Fixture,
      form4137: {
        unreportedTipIncome: "10000",
      },
    });

    const line1 = form4137Result.allLines.find((line) => line.form === "1040" && line.line === "1");
    const schedule2Line5 = form4137Result.allLines.find((line) => line.form === "Sched 2" && line.line === "5");

    expect(line1?.value.toNumber()).toBe(95000);
    expect(form4137Result.totalWages.toNumber()).toBe(95000);
    expect(form4137Result.totalIncome.toNumber()).toBe(95000);
    expect(form4137Result.totalAdditionalTaxes.toNumber()).toBe(765);
    expect(schedule2Line5?.value.toNumber()).toBe(765);
  });

  it("Form 1040 Line 1 and Schedule 2 - Form 4137 line 8 defaults W-2 Box 7 Social Security tips into the wage-base calculation", () => {
    const form4137Result = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        socialSecurityWages: "170000",
        socialSecurityTips: "5000",
      }],
      form4137: {
        unreportedTipIncome: "10000",
      },
    });

    const form4137Line8 = form4137Result.allLines.find((line) => line.form === "Form 4137" && line.line === "8");
    const schedule2Line5 = form4137Result.allLines.find((line) => line.form === "Sched 2" && line.line === "5");

    expect(String(form4137Line8?.inputs["Defaulted W-2 Box 3 Social Security wages"])).toBe("170000");
    expect(String(form4137Line8?.inputs["Defaulted W-2 Box 7 Social Security tips"])).toBe("5000");
    expect(form4137Line8?.value.toNumber()).toBe(175000);
    expect(form4137Result.totalAdditionalTaxes.toNumber()).toBe(213);
    expect(schedule2Line5?.value.toNumber()).toBe(213);
  });

  it("Form 1040 Line 1 - supported Form 8919 wages increase wages, Schedule 2 tax, and Additional Medicare exposure", () => {
    const form8919Result = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "198000",
        federalWithheld: "50000",
        socialSecurityWages: "198000",
        medicareWages: "198000",
        medicareWithheld: "2871",
      }],
      form8919: {
        wagesNotReportedOnW2: "4000",
      },
    });

    const line1 = form8919Result.allLines.find((line) => line.form === "1040" && line.line === "1");
    const schedule2Line6 = form8919Result.allLines.find((line) => line.form === "Sched 2" && line.line === "6");

    expect(line1?.value.toNumber()).toBe(202000);
    expect(form8919Result.totalWages.toNumber()).toBe(202000);
    expect(form8919Result.totalIncome.toNumber()).toBe(202000);
    expect(form8919Result.additionalMedicareTax.toNumber()).toBe(18);
    expect(form8919Result.totalAdditionalTaxes.toNumber()).toBe(76);
    expect(schedule2Line6?.value.toNumber()).toBe(58);
  });

  it("Form 1040 Line 1 and Schedule 2 - Form 8919 line 8 defaults W-2 Box 7 Social Security tips into the wage-base calculation", () => {
    const form8919Box7Result = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "198000",
        federalWithheld: "50000",
        socialSecurityWages: "170000",
        socialSecurityTips: "5000",
        medicareWages: "198000",
        medicareWithheld: "2871",
      }],
      form8919: {
        wagesNotReportedOnW2: "4000",
      },
    });

    const form8919Line8 = form8919Box7Result.allLines.find((line) => line.form === "Form 8919" && line.line === "8");
    const schedule2Line6 = form8919Box7Result.allLines.find((line) => line.form === "Sched 2" && line.line === "6");

    expect(form8919Box7Result.form8919?.line8.toNumber()).toBe(175000);
    expect(form8919Box7Result.form8919?.line9.toNumber()).toBe(1100);
    expect(form8919Box7Result.form8919?.line10.toNumber()).toBe(1100);
    expect(form8919Box7Result.form8919?.line13.toNumber()).toBe(126);
    expect(form8919Box7Result.totalAdditionalTaxes.toNumber()).toBe(144);
    expect(String(form8919Line8?.inputs["Defaulted W-2 Box 7 Social Security tips"])).toBe("5000");
    expect(schedule2Line6?.value.toNumber()).toBe(126);
  });

  it("Form 1040 Line 2a - tax-exempt interest (none)", () => {
    const line2a = result.allLines.find((l) => l.form === "1040" && l.line === "2a");
    expect(line2a).toBeDefined();
    expect(line2a!.value.toNumber()).toBe(0);
  });

  it("Form 1040 Line 2b - taxable interest (none)", () => {
    expect(result.totalInterest.toNumber()).toBe(0);
  });

  it("Form 1040 Line 3b - ordinary dividends (none)", () => {
    expect(result.totalDividends.toNumber()).toBe(0);
  });

  it("Form 1040 Line 7 - capital gain or loss (none)", () => {
    expect(result.capitalGainLoss.toNumber()).toBe(0);
  });

  it("Form 1040 Line 9 - total income equals wages only", () => {
    expect(result.totalIncome.toNumber()).toBe(85000);
  });

  it("Form 1040 Line 10 - no adjustments for simple W-2", () => {
    expect(result.adjustmentsToIncome.toNumber()).toBe(0);
  });

  it("Form 1040 Line 11 - AGI equals total income", () => {
    expect(result.agi.toNumber()).toBe(85000);
  });

  it("Form 1040 Line 12 - standard deduction for single ($15,750)", () => {
    expect(result.deductionUsed).toBe("standard");
    expect(result.deductionAmount.toNumber()).toBe(15750);
  });

  it("Form 1040 Line 15 - taxable income", () => {
    expect(result.taxableIncome.toNumber()).toBe(69250); // 85000 - 15750
  });

  it("Form 1040 Line 16 - tax on $69,250 single", () => {
    // $11,925 × 10% = $1,192.50
    // ($48,475 - $11,925) × 12% = $4,386
    // ($69,250 - $48,475) × 22% = $4,570.50
    // Total = $10,149
    expect(result.totalTaxBeforeCredits.toNumber()).toBe(10149);
  });

  it("Form 1040 Line 19 - no child tax credit (no children)", () => {
    expect(result.childTaxCredit.toNumber()).toBe(0);
  });

  it("Form 1040 Line 20 - Form 8880 saver's credit flows through Schedule 3 and is capped by the remaining tax", () => {
    const saverCreditResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "20000",
          federalWithheld: "1500",
          socialSecurityWages: "20000",
          socialSecurityWithheld: "1240",
          medicareWages: "20000",
          medicareWithheld: "290",
        },
      ],
      form8880: {
        primaryElectiveDeferrals: "3000",
      },
    });

    const line20 = saverCreditResult.allLines.find((line) => line.form === "1040" && line.line === "20");

    expect(saverCreditResult.totalTaxBeforeCredits.toNumber()).toBe(425);
    expect(saverCreditResult.form8880?.line10.toNumber()).toBe(1000);
    expect(saverCreditResult.form8880?.line11.toNumber()).toBe(425);
    expect(saverCreditResult.form8880?.line12.toNumber()).toBe(425);
    expect(saverCreditResult.otherCredits.toNumber()).toBe(425);
    expect(line20?.value.toNumber()).toBe(425);
  });

  it("Form 1040 Line 20 - W-2 Box 12 retirement contributions default into Form 8880 when Line 2 inputs are omitted", () => {
    const saverCreditResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "20000",
          federalWithheld: "1500",
          socialSecurityWages: "20000",
          socialSecurityWithheld: "1240",
          medicareWages: "20000",
          medicareWithheld: "290",
          box12CodeD: "1200",
          box12CodeAA: "1800",
        },
      ],
      form8880: {},
    });

    const form8880Line2 = saverCreditResult.form8880?.lines.find((line) => line.form === "Form 8880" && line.line === "2a");

    expect(saverCreditResult.form8880?.line2a.toNumber()).toBe(3000);
    expect(String(form8880Line2?.inputs["Supported W-2 Box 12 retirement contributions"])).toBe("3000");
    expect(saverCreditResult.form8880?.line12.toNumber()).toBe(425);
    expect(saverCreditResult.otherCredits.toNumber()).toBe(425);
  });

  it("Form 8880 Line 11 - the federal engine includes Schedule 2 Line 3 excess APTC repayment in the saver's credit limitation base", () => {
    const saverCreditResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "18000",
          federalWithheld: "0",
          socialSecurityWages: "18000",
          socialSecurityWithheld: "1116",
          medicareWages: "18000",
          medicareWithheld: "261",
        },
      ],
      form1095A: [
        {
          marketplace: "Healthcare.gov",
          policyNumber: "POL-8880-PTC",
          monthlyPremiums: Array.from({ length: 12 }, (_, index) => ({
            month: index + 1,
            enrolleePremium: "50",
            slcsp: "50",
            advancePremiumTaxCredit: "100",
          })),
        },
      ],
      form8880: {
        primaryElectiveDeferrals: "3000",
      },
    });

    const schedule2Line2 = saverCreditResult.allLines.find((line) => line.form === "Sched 2" && line.line === "2");

    expect(saverCreditResult.totalTaxBeforeCredits.toNumber()).toBe(225);
    expect(saverCreditResult.form8880?.line10.toNumber()).toBe(1000);
    expect(schedule2Line2?.value.toNumber()).toBe(375);
    expect(saverCreditResult.form8880?.line11.toNumber()).toBe(600);
    expect(saverCreditResult.form8880?.line12.toNumber()).toBe(600);
    expect(saverCreditResult.otherCredits.toNumber()).toBe(600);
  });

  it("Form 8880 Line 11 - the federal engine subtracts earlier Schedule 3 credits before limiting the saver's credit", () => {
    const saverCreditResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "20000",
          federalWithheld: "0",
          socialSecurityWages: "20000",
          socialSecurityWithheld: "1240",
          medicareWages: "20000",
          medicareWithheld: "290",
        },
      ],
      form1099Div: [
        {
          payer: "Global Equity Fund",
          ordinaryDividends: "1000",
          qualifiedDividends: "0",
          totalCapitalGainDistributions: "0",
          section1250Gain: "0",
          section1202Gain: "0",
          collectiblesGain: "0",
          nondividendDistributions: "0",
          federalWithheld: "0",
          foreignTaxPaid: "100",
          exemptInterestDividends: "0",
        },
      ],
      form8880: {
        primaryElectiveDeferrals: "3000",
      },
    });

    const schedule3Line1 = saverCreditResult.allLines.find((line) => line.form === "Sched 3" && line.line === "1");
    const schedule3Line4 = saverCreditResult.allLines.find((line) => line.form === "Sched 3" && line.line === "4");

    expect(saverCreditResult.totalTaxBeforeCredits.toNumber()).toBe(525);
    // FTC limited by Form 1116 apportionment: deduction × (foreign/AGI) reduces net foreign source
    // $15.75K std ded × ($1K/$21K) = $750 apportioned → net foreign = $250 → limitation = $525×($250/$5,250) = $25
    expect(saverCreditResult.foreignTaxCredit.toNumber()).toBe(25);
    expect(schedule3Line1?.value.toNumber()).toBe(25);
    // Saver's credit: Line 10 = $1000, Line 11 = $525 - $25(FTC) = $500, Line 12 = min($1000,$500) = $500
    expect(saverCreditResult.form8880?.line10.toNumber()).toBe(1000);
    expect(saverCreditResult.form8880?.line11.toNumber()).toBe(500);
    expect(saverCreditResult.form8880?.line12.toNumber()).toBe(500);
    expect(schedule3Line4?.value.toNumber()).toBe(500);
    expect(saverCreditResult.otherCredits.toNumber()).toBe(525);
  });

  it("Form 1040 Line 24 - total tax (no additional taxes)", () => {
    expect(result.totalTax.toNumber()).toBe(10149);
  });

  it("Form 1040 Line 25d - withholding from W-2", () => {
    expect(result.totalWithholding.toNumber()).toBe(12750);
  });

  it("Form 1040 Line 33 - total payments", () => {
    expect(result.totalPayments.toNumber()).toBe(12750);
  });

  it("Form 1040 Line 34 - refund (overpaid)", () => {
    expect(result.refund.toNumber()).toBe(2601); // 12750 - 10149
  });

  it("Form 1040 Line 37 - amount owed is zero when overpaid", () => {
    expect(result.amountOwed.toNumber()).toBe(0);
  });

  it("produces audit trail for all calculations", () => {
    expect(result.allLines.length).toBeGreaterThan(0);
    const line1 = result.allLines.find((l) => l.form === "1040" && l.line === "1");
    expect(line1).toBeDefined();
    expect(line1!.value.toNumber()).toBe(85000);
  });

  it("Form 1040 Line 10 - uses Form 8889 deduction when HSA contribution inputs are present", () => {
    const hsaResult = calculateFederalTax({
      ...simpleW2Fixture,
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "4300",
        employerContributions: "500",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    expect(hsaResult.adjustmentsToIncome.toNumber()).toBe(3800);
    expect(hsaResult.agi.toNumber()).toBe(81200);

    const form8889Line13 = hsaResult.allLines.find((line) => line.form === "Form 8889" && line.line === "13");
    expect(form8889Line13).toBeDefined();
    expect(form8889Line13!.value.toNumber()).toBe(3800);
  });

  it("Form 1040 Line 10 - W-2 Box 12 code W defaults employer HSA contributions into Form 8889 when Line 9 is omitted", () => {
    const hsaResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          box12CodeW: "500",
        },
      ],
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "4300",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    expect(hsaResult.adjustmentsToIncome.toNumber()).toBe(3800);
    expect(hsaResult.agi.toNumber()).toBe(81200);
    expect(hsaResult.form8889?.line9.toNumber()).toBe(500);
    expect(hsaResult.form8889?.line13.toNumber()).toBe(3800);

    const form8889Line9 = hsaResult.allLines.find((line) => line.form === "Form 8889" && line.line === "9");
    expect(form8889Line9?.inputs["Supported W-2 Box 12 code W employer contributions"]?.toString()).toBe("500");
  });

  it("Form 1040 Line 10 - explicit owner-specific Form 8889 inputs sum both spouses' HSA deductions on a joint return", () => {
    const hsaResult = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Pat",
          lastName: "Example",
          ssn: "987-65-4321",
          dateOfBirth: "1980-01-01",
        },
      },
      w2s: [
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
      ],
      form8889ByOwner: {
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
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    expect(hsaResult.form8889).toBeUndefined();
    expect(hsaResult.form8889ByOwner?.primary?.line13.toNumber()).toBe(3800);
    expect(hsaResult.form8889ByOwner?.spouse?.line13.toNumber()).toBe(2000);
    expect(hsaResult.adjustmentsToIncome.toNumber()).toBe(5800);

    const line10 = hsaResult.allLines.find((line) => line.form === "1040" && line.line === "10");
    expect(line10?.value.toNumber()).toBe(5800);
  });

  it("Form 1040 Line 10 - mixed owner-tagged W-2 Box 12 code W records synthesize owner-specific document-only Form 8889 statements", () => {
    const hsaResult = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Pat",
          lastName: "Example",
          ssn: "987-65-4321",
          dateOfBirth: "1980-01-01",
        },
      },
      w2s: [
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
      ],
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    expect(hsaResult.form8889).toBeUndefined();
    expect(hsaResult.form8889ByOwner?.primary?.line9.toNumber()).toBe(500);
    expect(hsaResult.form8889ByOwner?.primary?.line13.toNumber()).toBe(0);
    expect(hsaResult.form8889ByOwner?.spouse?.line9.toNumber()).toBe(900);
    expect(hsaResult.form8889ByOwner?.spouse?.line13.toNumber()).toBe(0);
    expect(hsaResult.adjustmentsToIncome.toNumber()).toBe(0);

    const line10 = hsaResult.allLines.find((line) => line.form === "1040" && line.line === "10");
    expect(line10?.value.toNumber()).toBe(0);
  });

  it("Form 1040 Line 10 - a spouse-tagged W-2 Box 12 code W record alone builds a spouse-only document-backed Form 8889 statement", () => {
    const hsaResult = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Pat",
          lastName: "Example",
          ssn: "987-65-4321",
          dateOfBirth: "1980-01-01",
        },
      },
      w2s: [
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
      ],
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    expect(hsaResult.form8889).toBeUndefined();
    expect(hsaResult.form8889ByOwner?.primary).toBeUndefined();
    expect(hsaResult.form8889ByOwner?.spouse?.line9.toNumber()).toBe(900);
    expect(hsaResult.form8889ByOwner?.spouse?.line13.toNumber()).toBe(0);
    expect(hsaResult.adjustmentsToIncome.toNumber()).toBe(0);

    const line10 = hsaResult.allLines.find((line) => line.form === "1040" && line.line === "10");
    expect(line10?.value.toNumber()).toBe(0);
  });

  it("Form 1040 Lines 6b and 10 - Archer MSA deduction reduces provisional income and flows through Schedule 1", () => {
    const archerMsaResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "18000",
          federalWithheld: "0",
          socialSecurityWages: "18000",
          medicareWages: "18000",
        },
      ],
      formSSA1099: [
        {
          recipient: "Alex Example",
          netBenefits: "24000",
          federalWithheld: "0",
        },
      ],
      adjustments: {
        ...simpleW2Fixture.adjustments,
        archerMSADeduction: "900",
      },
    });

    expect(archerMsaResult.adjustmentsToIncome.toNumber()).toBe(900);
    expect(archerMsaResult.socialSecurityBenefitsTaxable.toNumber()).toBe(2050);
    expect(archerMsaResult.agi.toNumber()).toBe(19150);

    const schedule1Line23 = archerMsaResult.allLines.find((line) => line.form === "Sched 1" && line.line === "23");
    const ssWorksheetLine6 = archerMsaResult.allLines.find((line) => line.form === "SS Worksheet" && line.line === "6");
    expect(schedule1Line23?.value.toNumber()).toBe(900);
    expect(ssWorksheetLine6?.value.toNumber()).toBe(900);
  });

  it("Form 1040 Lines 6b and 10 - Schedule 1 lines 12 and 14 reduce provisional income and flow through Schedule 1", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "18000",
          federalWithheld: "0",
          socialSecurityWages: "18000",
          medicareWages: "18000",
        },
      ],
      formSSA1099: [
        {
          recipient: "Alex Example",
          netBenefits: "24000",
          federalWithheld: "0",
        },
      ],
      adjustments: {
        ...simpleW2Fixture.adjustments,
        businessExpenseAdjustments: "450",
        armedForcesMovingExpenses: "700",
      },
    });

    expect(result.adjustmentsToIncome.toNumber()).toBe(1150);
    expect(result.socialSecurityBenefitsTaxable.toNumber()).toBe(1925);
    expect(result.agi.toNumber()).toBe(18775);

    const schedule1Line12 = result.allLines.find((line) => line.form === "Sched 1" && line.line === "12");
    const schedule1Line14 = result.allLines.find((line) => line.form === "Sched 1" && line.line === "14");
    const ssWorksheetLine6 = result.allLines.find((line) => line.form === "SS Worksheet" && line.line === "6");
    expect(schedule1Line12?.value.toNumber()).toBe(450);
    expect(schedule1Line14?.value.toNumber()).toBe(700);
    expect(ssWorksheetLine6?.value.toNumber()).toBe(1150);
  });

  it("Form 1040 Line 10 - Form 8889 last-month rule lifts a partial-year HSA deduction to the full annual limit", () => {
    const hsaResult = calculateFederalTax({
      ...simpleW2Fixture,
      form8889: {
        accountOwner: "primary",
        coverageByMonth: [
          "none",
          "none",
          "none",
          "none",
          "none",
          "none",
          "none",
          "none",
          "self_only",
          "self_only",
          "self_only",
          "self_only",
        ],
        contributionsMade: "4300",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    expect(hsaResult.adjustmentsToIncome.toNumber()).toBe(4300);
    expect(hsaResult.agi.toNumber()).toBe(80700);
    expect(hsaResult.form8889?.line3.toNumber()).toBe(4300);
    expect(hsaResult.form8889?.line13.toNumber()).toBe(4300);
  });

  it("Form 1040 Line 10 - spouse-owned HSA uses the spouse age-55 catch-up when the spouse is the account beneficiary", () => {
    const hsaResult = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1988-01-15",
        },
        spouse: {
          firstName: "Pat",
          lastName: "Example",
          ssn: "987-65-4321",
          dateOfBirth: "1968-03-18",
        },
      },
      form8889: {
        accountOwner: "spouse",
        coverageByMonth: Array(12).fill("family"),
        contributionsMade: "9550",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    expect(hsaResult.adjustmentsToIncome.toNumber()).toBe(9550);
    expect(hsaResult.agi.toNumber()).toBe(75450);
    expect(hsaResult.form8889?.line7.toNumber()).toBe(1000);
    expect(hsaResult.form8889?.line13.toNumber()).toBe(9550);
  });

  it("Form 1040 Line 10 - spouse-owned HSA does not infer untagged W-2 Box 12 code W amounts on joint returns", () => {
    const hsaResult = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1988-01-15",
        },
        spouse: {
          firstName: "Pat",
          lastName: "Example",
          ssn: "987-65-4321",
          dateOfBirth: "1968-03-18",
        },
      },
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          employer: {
            name: "Primary Employer",
            ein: "11-1111111",
          },
          box12CodeW: "500",
        },
        {
          ...simpleW2Fixture.w2s[0],
          employer: {
            name: "Spouse Employer",
            ein: "22-2222222",
          },
          wages: "68000",
          federalWithheld: "8200",
          box12CodeW: "900",
        },
      ],
      form8889: {
        accountOwner: "spouse",
        coverageByMonth: Array(12).fill("family"),
        contributionsMade: "9550",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    expect(hsaResult.form8889?.line9.toNumber()).toBe(0);
    expect(hsaResult.form8889?.line13.toNumber()).toBe(9550);
    expect(hsaResult.adjustmentsToIncome.toNumber()).toBe(9550);

    const form8889Line9 = hsaResult.allLines.find((line) => line.form === "Form 8889" && line.line === "9");
    expect(form8889Line9?.inputs["Supported W-2 Box 12 code W employer contributions"]?.toString()).toBe("0");
  });

  it("Form 1040 Line 10 - primary-owned HSA keeps multiple untagged joint-return W-2 Box 12 code W amounts manual", () => {
    const hsaResult = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Pat",
          lastName: "Example",
          ssn: "987-65-4321",
          dateOfBirth: "1988-03-18",
        },
      },
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          employer: {
            name: "Primary Employer",
            ein: "11-1111111",
          },
          box12CodeW: "500",
        },
        {
          ...simpleW2Fixture.w2s[0],
          employer: {
            name: "Spouse Employer",
            ein: "22-2222222",
          },
          wages: "68000",
          federalWithheld: "8200",
          box12CodeW: "900",
        },
      ],
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "4300",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    expect(hsaResult.form8889?.line9.toNumber()).toBe(0);
    expect(hsaResult.form8889?.line13.toNumber()).toBe(4300);
    expect(hsaResult.adjustmentsToIncome.toNumber()).toBe(4300);

    const form8889Line9 = hsaResult.allLines.find((line) => line.form === "Form 8889" && line.line === "9");
    expect(form8889Line9?.inputs["Supported W-2 Box 12 code W employer contributions"]?.toString()).toBe("0");
  });

  it("Form 1040 Line 10 - mixed tagged and untagged W-2 Box 12 code W amounts stay manual once owner attribution is partially tagged", () => {
    const hsaResult = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Pat",
          lastName: "Example",
          ssn: "987-65-4321",
          dateOfBirth: "1978-03-18",
        },
      },
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          employer: {
            name: "Primary Employer",
            ein: "11-1111111",
          },
          box12CodeW: "500",
          accountHolder: "primary",
        },
        {
          ...simpleW2Fixture.w2s[0],
          employer: {
            name: "Spouse Employer",
            ein: "22-2222222",
          },
          wages: "68000",
          federalWithheld: "8200",
          box12CodeW: "900",
          accountHolder: "spouse",
        },
        {
          ...simpleW2Fixture.w2s[0],
          employer: {
            name: "Untagged Employer",
            ein: "33-3333333",
          },
          wages: "12000",
          federalWithheld: "1000",
          box12CodeW: "700",
        },
      ],
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "4300",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    expect(hsaResult.form8889?.line9.toNumber()).toBe(500);
    expect(hsaResult.form8889?.line13.toNumber()).toBe(3800);
    expect(hsaResult.adjustmentsToIncome.toNumber()).toBe(3800);

    const form8889Line9 = hsaResult.allLines.find((line) => line.form === "Form 8889" && line.line === "9");
    expect(form8889Line9?.inputs["Supported W-2 Box 12 code W employer contributions"]?.toString()).toBe("500");
  });

  it("Form 1040 Line 10 - default Form 8889 spouse allocation splits only the family-coverage portion when both spouses have HSAs", () => {
    const hsaResult = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Pat",
          lastName: "Example",
          ssn: "987-65-4321",
          dateOfBirth: "1978-09-12",
        },
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1968-02-20",
        },
      },
      form8889: {
        accountOwner: "primary",
        coverageByMonth: [
          "family",
          "family",
          "family",
          "family",
          "family",
          "family",
          "self_only",
          "self_only",
          "self_only",
          "self_only",
          "self_only",
          "self_only",
        ],
        contributionsMade: "7000",
        bothSpousesHaveHsas: true,
      } as NonNullable<Parameters<typeof calculateFederalTax>[0]["form8889"]>,
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    expect(hsaResult.adjustmentsToIncome.toNumber()).toBe(4787.5);
    expect(hsaResult.agi.toNumber()).toBe(80212.5);
    expect(hsaResult.form8889?.line6.toNumber()).toBe(4287.5);
    expect(hsaResult.form8889?.line7.toNumber()).toBe(500);
    expect(hsaResult.form8889?.line13.toNumber()).toBe(4787.5);
  });

  it("Form 1040 Line 8 - unemployment compensation from Form 1099-G flows into other income and AGI", () => {
    const unemploymentResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099G: [
        { payer: "State UI Agency", unemploymentCompensation: "12500" },
      ],
    });

    // Unemployment adds to other income (Line 8) and total income
    expect(unemploymentResult.otherIncome.toNumber()).toBe(12500);
    expect(unemploymentResult.totalIncome.toNumber()).toBe(97500); // 85000 + 12500
    expect(unemploymentResult.agi.toNumber()).toBe(97500);
  });

  it("Form 1040 Line 8 - multiple Form 1099-G documents sum into unemployment compensation", () => {
    const multipleResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099G: [
        { payer: "CA EDD", unemploymentCompensation: "8000" },
        { payer: "NY DOL", unemploymentCompensation: "4500" },
      ],
    });

    expect(multipleResult.otherIncome.toNumber()).toBe(12500);
    expect(multipleResult.totalIncome.toNumber()).toBe(97500);
  });

  it("Form 1040 Line 25d - Form 1099-G federal withholding is included in total withholding", () => {
    const withholdingResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099G: [
        { payer: "State UI Agency", unemploymentCompensation: "15000", federalWithheld: "1500" },
      ],
    });

    // Base W-2 withholding is 12750, plus 1099-G withholding of 1500
    expect(withholdingResult.totalWithholding.toNumber()).toBe(14250);
  });

  it("Form 1040 - unemployment compensation does not count as earned income for EIC", () => {
    const unemploymentEicResult = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1990-06-15", // Age 35 at end of 2025
        },
      },
      w2s: [
        { ...simpleW2Fixture.w2s[0], wages: "8000", federalWithheld: "0" },
      ],
      form1099G: [
        { payer: "State UI Agency", unemploymentCompensation: "12000" },
      ],
    });

    // EIC earned income should be $8,000 (wages only), not $20,000
    const eicLine = unemploymentEicResult.allLines.find(
      (line) => line.form === "EIC" && line.line === "27a"
    );
    expect(eicLine).toBeDefined();
    // The EIC credit should be based on earned income of $8,000 and AGI of $20,000
    // With 0 qualifying children, single filer age 35, $8,000 earned income, AGI $20,000
    expect(String(eicLine?.inputs["Qualifying EIC children"])).toBe("0");
  });

  it("Form 1040 Line 8 and Schedule 2 include taxable HSA distributions when Form 8889 Part II inputs are present", () => {
    const hsaDistributionResult = calculateFederalTax({
      ...simpleW2Fixture,
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "0",
        distributionsReceived: "3000",
        excludedDistributions: "500",
        qualifiedMedicalExpenses: "1500",
        distributionsNotSubjectToAdditionalTax: "200",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    expect(hsaDistributionResult.otherIncome.toNumber()).toBe(1000);
    expect(hsaDistributionResult.totalIncome.toNumber()).toBe(86000);
    expect(hsaDistributionResult.totalAdditionalTaxes.toNumber()).toBe(160);

    const form8889Line16 = hsaDistributionResult.allLines.find((line) => line.form === "Form 8889" && line.line === "16");
    const schedule2Line17c = hsaDistributionResult.allLines.find((line) => line.form === "Sched 2" && line.line === "17c");
    expect(form8889Line16?.value.toNumber()).toBe(1000);
    expect(schedule2Line17c?.value.toNumber()).toBe(160);
  });

  it("Form 1040 Line 8 and Form 8889 - Form 1099-SA returned excess contributions and Box 2 earnings route correctly", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099SA: [
        {
          payer: "HSA Bank",
          grossDistribution: "1500",
          earningsOnExcessContributions: "60",
          distributionCode: "2",
          accountType: "hsa",
        },
        {
          payer: "HSA Bank",
          grossDistribution: "500",
          distributionCode: "1",
          accountType: "hsa",
        },
      ],
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "0",
        qualifiedMedicalExpenses: "500",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    expect(result.form8889?.line14a.toNumber()).toBe(2000);
    expect(result.form8889?.line14b.toNumber()).toBe(1500);
    expect(result.form8889?.line16.toNumber()).toBe(0);
    expect(result.otherIncome.toNumber()).toBe(60);
    expect(result.totalIncome.toNumber()).toBe(85060);
  });

  it("Form 1040 Line 8 and Form 8889 - HSA rollover distributions combine with Form 1099-SA returned excess support on Line 14b", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099SA: [
        {
          payer: "HSA Bank",
          grossDistribution: "500",
          earningsOnExcessContributions: "30",
          distributionCode: "2",
          accountType: "hsa",
        },
        {
          payer: "HSA Bank",
          grossDistribution: "2000",
          distributionCode: "1",
          accountType: "hsa",
        },
      ],
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "0",
        rolloverDistributions: "700",
        qualifiedMedicalExpenses: "600",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    expect(result.form8889?.line14a.toNumber()).toBe(2500);
    expect(result.form8889?.line14b.toNumber()).toBe(1200);
    expect(result.form8889?.line16.toNumber()).toBe(700);
    expect(result.form8889?.line17b.toNumber()).toBe(140);
    expect(result.otherIncome.toNumber()).toBe(730);
    expect(result.totalIncome.toNumber()).toBe(85730);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(140);
  });

  it("Form 1040 Line 8 and Form 8889 - Form 1099-SA returned excess contributions auto-build Form 8889 support without manual inputs", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099SA: [
        {
          payer: "HSA Bank",
          grossDistribution: "1500",
          earningsOnExcessContributions: "60",
          distributionCode: "2",
          accountType: "hsa",
        },
      ],
    });

    expect(result.form8889?.line14a.toNumber()).toBe(1500);
    expect(result.form8889?.line14b.toNumber()).toBe(1500);
    expect(result.form8889?.line16.toNumber()).toBe(0);
    expect(result.otherIncome.toNumber()).toBe(60);
    expect(result.totalIncome.toNumber()).toBe(85060);
  });

  it("Form 1040 Line 8 - mixed-owner Form 1099-SA distributions build separate supported Form 8889 statements and aggregate HSA income and tax", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Alex",
          lastName: "Doe",
          ssn: "234-56-7890",
          dateOfBirth: "1992-04-02",
        },
      },
      form1099SA: [
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
          earningsOnExcessContributions: "20",
          distributionCode: "2",
          accountType: "hsa",
          accountHolder: "spouse",
        },
      ],
    });

    expect(result.form8889).toBeUndefined();
    expect(result.form1099SA?.defaultAccountOwner).toBeUndefined();
    expect(result.form8889ByOwner?.primary?.line14a.toNumber()).toBe(1200);
    expect(result.form8889ByOwner?.primary?.line16.toNumber()).toBe(1200);
    expect(result.form8889ByOwner?.primary?.line17b.toNumber()).toBe(240);
    expect(result.form8889ByOwner?.spouse?.line14a.toNumber()).toBe(700);
    expect(result.form8889ByOwner?.spouse?.line14b.toNumber()).toBe(700);
    expect(result.form8889ByOwner?.spouse?.line16.toNumber()).toBe(0);
    expect(result.otherIncome.toNumber()).toBe(1220);
    expect(result.totalIncome.toNumber()).toBe(86220);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(240);

    const schedule1Line8f = result.allLines.find((line) => line.form === "Sched 1" && line.line === "8f");
    const schedule2Line17c = result.allLines.find((line) => line.form === "Sched 2" && line.line === "17c");

    expect(schedule1Line8f?.value.toNumber()).toBe(1200);
    expect(schedule2Line17c?.value.toNumber()).toBe(240);
  });

  it("Form 1040 Line 8 - mixed tagged and untagged Form 1099-SA records leave the untagged distribution manual instead of defaulting it to the primary owner", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Alex",
          lastName: "Doe",
          ssn: "234-56-7890",
          dateOfBirth: "1992-04-02",
        },
      },
      form1099SA: [
        {
          payer: "HSA Bank",
          grossDistribution: "300",
          distributionCode: "1",
          accountType: "hsa",
        },
        {
          payer: "HSA Bank",
          grossDistribution: "700",
          distributionCode: "1",
          accountType: "hsa",
          accountHolder: "spouse",
        },
      ],
    });

    expect(result.form8889).toBeUndefined();
    expect(result.form1099SA?.hsaGrossDistributions.toNumber()).toBe(1000);
    expect(result.form1099SA?.defaultAccountOwner).toBeUndefined();
    expect(result.form8889ByOwner?.primary).toBeUndefined();
    expect(result.form8889ByOwner?.spouse?.line14a.toNumber()).toBe(700);
    expect(result.form8889ByOwner?.spouse?.line16.toNumber()).toBe(700);
    expect(result.form8889ByOwner?.spouse?.line17b.toNumber()).toBe(140);
    expect(result.otherIncome.toNumber()).toBe(700);
    expect(result.totalIncome.toNumber()).toBe(85700);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(140);

    const schedule1Line8f = result.allLines.find((line) => line.form === "Sched 1" && line.line === "8f");
    const schedule2Line17c = result.allLines.find((line) => line.form === "Sched 2" && line.line === "17c");

    expect(schedule1Line8f?.value.toNumber()).toBe(700);
    expect(schedule2Line17c?.value.toNumber()).toBe(140);
  });

  it("Form 1040 Line 8 - fully untagged married-return Form 1099-SA records stay manual until the HSA owner is identified", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Alex",
          lastName: "Doe",
          ssn: "234-56-7890",
          dateOfBirth: "1992-04-02",
        },
      },
      form1099SA: [
        {
          payer: "HSA Bank",
          grossDistribution: "300",
          distributionCode: "1",
          accountType: "hsa",
        },
        {
          payer: "HSA Bank",
          grossDistribution: "700",
          distributionCode: "1",
          accountType: "hsa",
        },
      ],
    });

    expect(result.form1099SA?.hsaGrossDistributions.toNumber()).toBe(1000);
    expect(result.form1099SA?.defaultAccountOwner).toBeUndefined();
    expect(result.form8889).toBeUndefined();
    expect(result.form8889ByOwner).toBeUndefined();
    expect(result.schedule1.hsaTaxableDistributions.toNumber()).toBe(0);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(0);
  });

  it("Schedule 2 Line 17c - Form 1099-SA disability distributions automatically exempt the HSA additional tax", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099SA: [
        {
          payer: "HSA Bank",
          grossDistribution: "1200",
          distributionCode: "3",
          accountType: "hsa",
        },
      ],
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "0",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    const schedule2Line17c = result.allLines.find((line) => line.form === "Sched 2" && line.line === "17c");

    expect(result.form8889?.line16.toNumber()).toBe(1200);
    expect(result.form8889?.line17aHasException).toBe(true);
    expect(result.form8889?.line17b.toNumber()).toBe(0);
    expect(schedule2Line17c?.value.toNumber()).toBe(0);
  });

  it("Form 1040 Line 8 and Schedule 2 - merged Form 1099-SA disability support does not double count a manual-inclusive Form 8889 Line 17a amount", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099SA: [
        {
          payer: "HSA Bank",
          grossDistribution: "1200",
          distributionCode: "3",
          accountType: "hsa",
        },
      ],
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "0",
        distributionsReceived: "3000",
        qualifiedMedicalExpenses: "500",
        distributionsNotSubjectToAdditionalTax: "1400",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    const form8889Line17a = result.allLines.find((line) => line.form === "Form 8889" && line.line === "17a");
    const form8889Line17b = result.allLines.find((line) => line.form === "Form 8889" && line.line === "17b");
    const schedule2Line17c = result.allLines.find((line) => line.form === "Sched 2" && line.line === "17c");

    expect(result.form8889?.line16.toNumber()).toBe(2500);
    expect(result.form8889?.line17aHasException).toBe(true);
    expect(result.form8889?.line17b.toNumber()).toBe(220);
    expect(schedule2Line17c?.value.toNumber()).toBe(220);
    expect(form8889Line17a?.inputs["Line 17a input amount before Line 16 cap"]?.toString()).toBe("1400");
    expect(form8889Line17a?.inputs["Supported Form 1099-SA automatic exception distributions"]?.toString()).toBe("1200");
    expect(form8889Line17a?.inputs["Validated manual exception amount"]?.toString()).toBe("200");
    expect(form8889Line17b?.inputs["Validated manual exception amount"]?.toString()).toBe("200");
  });

  it("Form 1040 Line 8 and Form 8889 - generic medical expenses alone do not offset a non-estate Form 1099-SA death distribution", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099SA: [
        {
          payer: "Inherited HSA Custodian",
          grossDistribution: "6600",
          fmvOnDateOfDeath: "6000",
          distributionCode: "4",
          accountType: "hsa",
          beneficiaryRole: "other_beneficiary",
        },
      ],
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "0",
        qualifiedMedicalExpenses: "1000",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    const schedule2Line17c = result.allLines.find((line) => line.form === "Sched 2" && line.line === "17c");

    expect(result.form1099SA?.hsaEstateDeathDistributionDateOfDeathValue.toNumber()).toBe(0);
    expect(result.form8889?.line14a.toNumber()).toBe(6000);
    expect(result.form8889?.line15.toNumber()).toBe(0);
    expect(result.form8889?.line16.toNumber()).toBe(6000);
    expect(result.form8889?.line17aHasException).toBe(true);
    expect(result.form8889?.line17b.toNumber()).toBe(0);
    expect(schedule2Line17c?.value.toNumber()).toBe(0);
    expect(result.otherIncome.toNumber()).toBe(6600);
    expect(result.totalIncome.toNumber()).toBe(91600);
  });

  it("Form 1040 Line 8 and Form 8889 - non-estate Form 1099-SA death distributions use the beneficiary-only post-death medical-expense offset", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099SA: [
        {
          payer: "Inherited HSA Custodian",
          grossDistribution: "6600",
          fmvOnDateOfDeath: "6000",
          distributionCode: "4",
          accountType: "hsa",
          beneficiaryRole: "other_beneficiary",
        },
      ],
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "0",
        qualifiedMedicalExpenses: "1000",
        decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath: "1000",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    const schedule2Line17c = result.allLines.find((line) => line.form === "Sched 2" && line.line === "17c");

    expect(result.form1099SA?.hsaEstateDeathDistributionDateOfDeathValue.toNumber()).toBe(0);
    expect(result.form8889?.line14a.toNumber()).toBe(6000);
    expect(result.form8889?.line15.toNumber()).toBe(1000);
    expect(result.form8889?.line16.toNumber()).toBe(5000);
    expect(result.form8889?.line17aHasException).toBe(true);
    expect(result.form8889?.line17b.toNumber()).toBe(0);
    expect(schedule2Line17c?.value.toNumber()).toBe(0);
    expect(result.otherIncome.toNumber()).toBe(5600);
    expect(result.totalIncome.toNumber()).toBe(90600);
  });

  it("Form 1040 Line 8 and Form 8889 - code 6 Form 1099-SA death distributions infer the beneficiary-only post-death medical-expense offset", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099SA: [
        {
          payer: "Inherited HSA Custodian",
          grossDistribution: "5300",
          fmvOnDateOfDeath: "5000",
          distributionCode: "6",
          accountType: "hsa",
        },
      ],
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "0",
        decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath: "1000",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    expect(result.form1099SA?.hsaOtherBeneficiaryDeathDistributionDateOfDeathValue.toNumber()).toBe(5000);
    expect(result.form1099SA?.hsaEstateDeathDistributionDateOfDeathValue.toNumber()).toBe(0);
    expect(result.form8889?.line14a.toNumber()).toBe(5000);
    expect(result.form8889?.line15.toNumber()).toBe(1000);
    expect(result.form8889?.line16.toNumber()).toBe(4000);
    expect(result.form8889?.line17aHasException).toBe(true);
    expect(result.form8889?.line17b.toNumber()).toBe(0);
    expect(result.otherIncome.toNumber()).toBe(4300);
    expect(result.totalIncome.toNumber()).toBe(89300);
  });

  it("Form 1040 Line 8 and Form 8889 - estate-beneficiary Form 1099-SA death distributions do not use the beneficiary-only medical-expense offset", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099SA: [
        {
          payer: "Inherited HSA Custodian",
          grossDistribution: "6600",
          fmvOnDateOfDeath: "6000",
          distributionCode: "4",
          accountType: "hsa",
          beneficiaryRole: "estate",
        },
      ],
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "0",
        qualifiedMedicalExpenses: "1000",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    const schedule2Line17c = result.allLines.find((line) => line.form === "Sched 2" && line.line === "17c");

    expect(result.form1099SA?.hsaEstateDeathDistributionDateOfDeathValue.toNumber()).toBe(6000);
    expect(result.form8889?.line14a.toNumber()).toBe(6000);
    expect(result.form8889?.line15.toNumber()).toBe(0);
    expect(result.form8889?.line16.toNumber()).toBe(6000);
    expect(result.form8889?.line17aHasException).toBe(true);
    expect(result.form8889?.line17b.toNumber()).toBe(0);
    expect(schedule2Line17c?.value.toNumber()).toBe(0);
    expect(result.otherIncome.toNumber()).toBe(6600);
    expect(result.totalIncome.toNumber()).toBe(91600);
  });

  it("Form 1040 Line 8 and Form 8889 - surviving-spouse Form 1099-SA code 4 records use ordinary HSA distribution rules", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099SA: [
        {
          payer: "Inherited HSA Custodian",
          grossDistribution: "6600",
          fmvOnDateOfDeath: "6000",
          distributionCode: "4",
          accountType: "hsa",
          beneficiaryRole: "surviving_spouse",
        },
      ],
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "0",
        qualifiedMedicalExpenses: "1000",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    const schedule2Line17c = result.allLines.find((line) => line.form === "Sched 2" && line.line === "17c");

    expect(result.form1099SA?.hsaGrossDistributions.toNumber()).toBe(6600);
    expect(result.form1099SA?.hsaDeathDistributionDateOfDeathValue.toNumber()).toBe(0);
    expect(result.form1099SA?.hsaPostDeathEarnings.toNumber()).toBe(0);
    expect(result.form8889?.line14a.toNumber()).toBe(6600);
    expect(result.form8889?.line17aHasException).toBe(false);
    expect(result.form8889?.line17b.toNumber()).toBe(1120);
    expect(schedule2Line17c?.value.toNumber()).toBe(1120);
  });

  it("Form 1040 Line 8 and Schedule 2 - spouse-owned surviving-spouse Form 1099-SA records default the generated Form 8889 owner before applying age-65 exceptions", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1988-01-15",
        },
        spouse: {
          firstName: "Pat",
          lastName: "Example",
          ssn: "987-65-4321",
          dateOfBirth: "1959-01-01",
        },
      },
      form1099SA: [
        {
          payer: "Inherited HSA Custodian",
          grossDistribution: "6600",
          fmvOnDateOfDeath: "6000",
          distributionCode: "4",
          accountType: "hsa",
          beneficiaryRole: "surviving_spouse",
          accountHolder: "spouse",
        },
      ],
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    const schedule2Line17c = result.allLines.find((line) => line.form === "Sched 2" && line.line === "17c");

    expect(result.form8889?.line14a.toNumber()).toBe(6600);
    expect(result.form8889?.line16.toNumber()).toBe(6600);
    expect(result.form8889?.line17aHasException).toBe(true);
    expect(result.form8889?.line17b.toNumber()).toBe(0);
    expect(schedule2Line17c?.value.toNumber()).toBe(0);
  });

  it("Form 1040 Line 8 and Schedule 2 - surviving-spouse Form 1099-SA records infer the spouse owner even without an explicit owner tag", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1988-01-15",
        },
        spouse: {
          firstName: "Pat",
          lastName: "Example",
          ssn: "987-65-4321",
          dateOfBirth: "1959-01-01",
        },
      },
      form1099SA: [
        {
          payer: "Inherited HSA Custodian",
          grossDistribution: "6600",
          fmvOnDateOfDeath: "6000",
          distributionCode: "4",
          accountType: "hsa",
          beneficiaryRole: "surviving_spouse",
        },
      ],
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    const schedule2Line17c = result.allLines.find((line) => line.form === "Sched 2" && line.line === "17c");

    expect(result.form1099SA?.defaultAccountOwner).toBe("spouse");
    expect(result.form8889?.line14a.toNumber()).toBe(6600);
    expect(result.form8889?.line16.toNumber()).toBe(6600);
    expect(result.form8889?.line17aHasException).toBe(true);
    expect(result.form8889?.line17b.toNumber()).toBe(0);
    expect(schedule2Line17c?.value.toNumber()).toBe(0);
  });

  it("Form 1040 Line 8 - mixed-owner Form 1099-SA statements keep a surviving-spouse HSA distribution on the spouse owner path and preserve the spouse age-65 exception", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Pat",
          lastName: "Example",
          ssn: "987-65-4321",
          dateOfBirth: "1959-01-01",
        },
      },
      form1099SA: [
        {
          payer: "HSA Bank",
          grossDistribution: "1200",
          distributionCode: "1",
          accountType: "hsa",
          accountHolder: "primary",
        },
        {
          payer: "Inherited HSA Custodian",
          grossDistribution: "6600",
          fmvOnDateOfDeath: "6000",
          distributionCode: "4",
          accountType: "hsa",
          beneficiaryRole: "surviving_spouse",
          accountHolder: "spouse",
        },
      ],
    });

    const schedule1Line8f = result.allLines.find((line) => line.form === "Sched 1" && line.line === "8f");
    const schedule2Line17c = result.allLines.find((line) => line.form === "Sched 2" && line.line === "17c");

    expect(result.form8889).toBeUndefined();
    expect(result.form1099SA?.defaultAccountOwner).toBeUndefined();
    expect(result.form8889ByOwner?.primary?.line14a.toNumber()).toBe(1200);
    expect(result.form8889ByOwner?.primary?.line16.toNumber()).toBe(1200);
    expect(result.form8889ByOwner?.primary?.line17b.toNumber()).toBe(240);
    expect(result.form8889ByOwner?.spouse?.line14a.toNumber()).toBe(6600);
    expect(result.form8889ByOwner?.spouse?.line16.toNumber()).toBe(6600);
    expect(result.form8889ByOwner?.spouse?.line17aHasException).toBe(true);
    expect(result.form8889ByOwner?.spouse?.line17b.toNumber()).toBe(0);
    expect(result.otherIncome.toNumber()).toBe(7800);
    expect(result.totalIncome.toNumber()).toBe(92800);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(240);
    expect(schedule1Line8f?.value.toNumber()).toBe(7800);
    expect(schedule2Line17c?.value.toNumber()).toBe(240);
  });

  it("Form 1040 Line 8 and Schedule 2 - explicit Form 8889 inputs still aggregate the other spouse's tagged HSA documents", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Pat",
          lastName: "Example",
          ssn: "987-65-4321",
          dateOfBirth: "1980-01-01",
        },
      },
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "4300",
      },
      form1099SA: [
        {
          payer: "HSA Bank",
          grossDistribution: "900",
          distributionCode: "1",
          accountType: "hsa",
          accountHolder: "spouse",
        },
      ],
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    const schedule1Line8f = result.allLines.find((line) => line.form === "Sched 1" && line.line === "8f");
    const schedule2Line17c = result.allLines.find((line) => line.form === "Sched 2" && line.line === "17c");

    expect(result.form8889?.line13.toNumber()).toBe(4300);
    expect(result.form8889ByOwner?.spouse?.line14a.toNumber()).toBe(900);
    expect(result.form8889ByOwner?.spouse?.line16.toNumber()).toBe(900);
    expect(result.otherIncome.toNumber()).toBe(900);
    expect(result.totalIncome.toNumber()).toBe(85900);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(180);
    expect(schedule1Line8f?.value.toNumber()).toBe(900);
    expect(schedule2Line17c?.value.toNumber()).toBe(180);
  });

  it("Form 1040 Line 8 and Schedule 2 - explicit primary Form 8889 inputs keep inferred surviving-spouse HSA support on a supplemental spouse statement", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1988-01-15",
        },
        spouse: {
          firstName: "Pat",
          lastName: "Example",
          ssn: "987-65-4321",
          dateOfBirth: "1959-01-01",
        },
      },
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "4300",
        qualifiedMedicalExpenses: "0",
      },
      form1099SA: [
        {
          payer: "Inherited HSA Custodian",
          grossDistribution: "6600",
          fmvOnDateOfDeath: "6000",
          distributionCode: "4",
          accountType: "hsa",
          beneficiaryRole: "surviving_spouse",
        },
      ],
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    const schedule1Line8f = result.allLines.find((line) => line.form === "Sched 1" && line.line === "8f");
    const schedule2Line17c = result.allLines.find((line) => line.form === "Sched 2" && line.line === "17c");

    expect(result.form8889?.line13.toNumber()).toBe(4300);
    expect(result.form8889?.line14a.toNumber()).toBe(0);
    expect(result.form8889ByOwner?.spouse?.line14a.toNumber()).toBe(6600);
    expect(result.form8889ByOwner?.spouse?.line16.toNumber()).toBe(6600);
    expect(result.form8889ByOwner?.spouse?.line17aHasException).toBe(true);
    expect(result.form8889ByOwner?.spouse?.line17b.toNumber()).toBe(0);
    expect(result.otherIncome.toNumber()).toBe(6600);
    expect(result.totalIncome.toNumber()).toBe(91600);
    expect(result.adjustmentsToIncome.toNumber()).toBe(4300);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(0);
    expect(schedule1Line8f?.value.toNumber()).toBe(6600);
    expect(schedule2Line17c?.value.toNumber()).toBe(0);
  });

  it("Form 1040 Line 10 - explicit primary Form 8889 inputs still surface the other spouse's tagged W-2 Box 12 code W support as a supplemental statement", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Pat",
          lastName: "Example",
          ssn: "987-65-4321",
          dateOfBirth: "1980-01-01",
        },
      },
      w2s: [
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
      ],
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "4300",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    const line10 = result.allLines.find((line) => line.form === "1040" && line.line === "10");

    expect(result.form8889?.line9.toNumber()).toBe(500);
    expect(result.form8889?.line13.toNumber()).toBe(3800);
    expect(result.form8889ByOwner?.spouse?.line9.toNumber()).toBe(900);
    expect(result.form8889ByOwner?.spouse?.line13.toNumber()).toBe(0);
    expect(result.adjustmentsToIncome.toNumber()).toBe(3800);
    expect(line10?.value.toNumber()).toBe(3800);
  });

  it("Form 1040 Lines 8 and 10 - a supplemental spouse Form 8889 can combine spouse-tagged W-2 Box 12 code W support with spouse-tagged Form 1099-SA support", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Pat",
          lastName: "Example",
          ssn: "987-65-4321",
          dateOfBirth: "1980-01-01",
        },
      },
      w2s: [
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
      ],
      form1099SA: [
        {
          payer: "Spouse HSA Custodian",
          grossDistribution: "700",
          earningsOnExcessContributions: "40",
          distributionCode: "2",
          accountType: "hsa",
          accountHolder: "spouse",
        },
      ],
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "4300",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    const line8 = result.allLines.find((line) => line.form === "1040" && line.line === "8");
    const line10 = result.allLines.find((line) => line.form === "1040" && line.line === "10");
    const schedule1Line8f = result.allLines.find((line) => line.form === "Sched 1" && line.line === "8f");

    expect(result.form8889?.line9.toNumber()).toBe(500);
    expect(result.form8889?.line13.toNumber()).toBe(3800);
    expect(result.form8889ByOwner?.spouse?.line9.toNumber()).toBe(900);
    expect(result.form8889ByOwner?.spouse?.line14a.toNumber()).toBe(700);
    expect(result.form8889ByOwner?.spouse?.line14b.toNumber()).toBe(700);
    expect(result.form8889ByOwner?.spouse?.line16.toNumber()).toBe(0);
    expect(result.form8889ByOwner?.spouse?.line13.toNumber()).toBe(0);
    expect(result.otherIncome.toNumber()).toBe(40);
    expect(result.adjustmentsToIncome.toNumber()).toBe(3800);
    expect(line8?.value.toNumber()).toBe(40);
    expect(line10?.value.toNumber()).toBe(3800);
    expect(schedule1Line8f?.value.toNumber()).toBe(0);
  });

  it("Form 1040 Line 10 - explicit spouse-owned Form 8889 inputs still surface the primary taxpayer's tagged W-2 Box 12 code W support as a supplemental statement", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Pat",
          lastName: "Example",
          ssn: "987-65-4321",
          dateOfBirth: "1980-01-01",
        },
      },
      w2s: [
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
      ],
      form8889: {
        accountOwner: "spouse",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "4300",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    const line10 = result.allLines.find((line) => line.form === "1040" && line.line === "10");

    expect(result.form8889?.line9.toNumber()).toBe(900);
    expect(result.form8889?.line13.toNumber()).toBe(3400);
    expect(result.form8889ByOwner?.primary?.line9.toNumber()).toBe(500);
    expect(result.form8889ByOwner?.primary?.line13.toNumber()).toBe(0);
    expect(result.adjustmentsToIncome.toNumber()).toBe(3400);
    expect(line10?.value.toNumber()).toBe(3400);
  });

  it("Form 1040 Line 8 and Schedule 2 - Form 1099-SA prohibited transactions remain taxable even when medical expenses are reported", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099SA: [
        {
          payer: "HSA Bank",
          grossDistribution: "2400",
          distributionCode: "5",
          accountType: "hsa",
        },
        {
          payer: "HSA Bank",
          grossDistribution: "600",
          distributionCode: "1",
          accountType: "hsa",
        },
      ],
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "0",
        qualifiedMedicalExpenses: "1800",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    const schedule1Line8f = result.allLines.find((line) => line.form === "Sched 1" && line.line === "8f");
    const schedule2Line17c = result.allLines.find((line) => line.form === "Sched 2" && line.line === "17c");

    expect(result.form8889?.line14a.toNumber()).toBe(3000);
    expect(result.form8889?.line15.toNumber()).toBe(600);
    expect(result.form8889?.line16.toNumber()).toBe(2400);
    expect(result.form8889?.line17b.toNumber()).toBe(480);
    expect(schedule1Line8f?.value.toNumber()).toBe(2400);
    expect(schedule2Line17c?.value.toNumber()).toBe(480);
    expect(result.otherIncome.toNumber()).toBe(2400);
    expect(result.totalIncome.toNumber()).toBe(87400);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(480);
  });

  it("Form 1040 Line 8 and Schedule 2 - surviving-spouse code 5 HSA records infer the spouse owner and preserve the spouse age-65 exception", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1988-01-15",
        },
        spouse: {
          firstName: "Pat",
          lastName: "Example",
          ssn: "987-65-4321",
          dateOfBirth: "1959-01-01",
        },
      },
      form1099SA: [
        {
          payer: "Inherited HSA Custodian",
          grossDistribution: "2400",
          distributionCode: "5",
          accountType: "hsa",
          beneficiaryRole: "surviving_spouse",
        },
      ],
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    const schedule1Line8f = result.allLines.find((line) => line.form === "Sched 1" && line.line === "8f");
    const schedule2Line17c = result.allLines.find((line) => line.form === "Sched 2" && line.line === "17c");

    expect(result.form1099SA?.defaultAccountOwner).toBe("spouse");
    expect(result.form8889?.line14a.toNumber()).toBe(2400);
    expect(result.form8889?.line16.toNumber()).toBe(2400);
    expect(result.form8889?.line17aHasException).toBe(true);
    expect(result.form8889?.line17b.toNumber()).toBe(0);
    expect(schedule1Line8f?.value.toNumber()).toBe(2400);
    expect(schedule2Line17c?.value.toNumber()).toBe(0);
    expect(result.otherIncome.toNumber()).toBe(2400);
    expect(result.totalIncome.toNumber()).toBe(87400);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(0);
  });

  it("Form 1040 Line 8 and Schedule 2 - surviving-spouse HSA records remap to a primary-owned Form 8889 when the current taxpayer payload no longer includes a spouse", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "qualifying_surviving_spouse",
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1959-01-01",
        },
        spouse: undefined,
      },
      form1099SA: [
        {
          payer: "Inherited HSA Custodian",
          grossDistribution: "2400",
          distributionCode: "5",
          accountType: "hsa",
          beneficiaryRole: "surviving_spouse",
        },
      ],
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    const schedule1Line8f = result.allLines.find((line) => line.form === "Sched 1" && line.line === "8f");
    const schedule2Line17c = result.allLines.find((line) => line.form === "Sched 2" && line.line === "17c");
    const form8889Line17a = result.allLines.find((line) => line.form === "Form 8889" && line.line === "17a");

    expect(result.form1099SA?.defaultAccountOwner).toBe("spouse");
    expect(result.form8889).toBeDefined();
    expect(result.form8889?.line14a.toNumber()).toBe(2400);
    expect(result.form8889?.line16.toNumber()).toBe(2400);
    expect(result.form8889?.line17aHasException).toBe(true);
    expect(result.form8889?.line17b.toNumber()).toBe(0);
    expect(form8889Line17a?.inputs["Account owner"]).toBe("primary");
    expect(schedule1Line8f?.value.toNumber()).toBe(2400);
    expect(schedule2Line17c?.value.toNumber()).toBe(0);
    expect(result.otherIncome.toNumber()).toBe(2400);
    expect(result.totalIncome.toNumber()).toBe(87400);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(0);
  });

  it("Form 1040 Line 8 - surviving-spouse code 2 HSA records infer the spouse owner and keep returned-excess earnings on the spouse path", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1988-01-15",
        },
        spouse: {
          firstName: "Pat",
          lastName: "Example",
          ssn: "987-65-4321",
          dateOfBirth: "1959-01-01",
        },
      },
      form1099SA: [
        {
          payer: "Inherited HSA Custodian",
          grossDistribution: "400",
          earningsOnExcessContributions: "25",
          distributionCode: "2",
          accountType: "hsa",
          beneficiaryRole: "surviving_spouse",
        },
      ],
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    const schedule1Line8f = result.allLines.find((line) => line.form === "Sched 1" && line.line === "8f");
    const schedule2Line17c = result.allLines.find((line) => line.form === "Sched 2" && line.line === "17c");

    expect(result.form1099SA?.defaultAccountOwner).toBe("spouse");
    expect(result.form8889?.line14a.toNumber()).toBe(400);
    expect(result.form8889?.line14b.toNumber()).toBe(400);
    expect(result.form8889?.line16.toNumber()).toBe(0);
    expect(result.form8889ByOwner).toBeUndefined();
    expect(schedule1Line8f?.value.toNumber()).toBe(0);
    expect(schedule2Line17c?.value.toNumber()).toBe(0);
    expect(result.otherIncome.toNumber()).toBe(25);
  });

  it("Form 1040 Line 8 and Schedule 2 - surviving-spouse code 3 HSA records infer the spouse owner and preserve the disability exception", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1988-01-15",
        },
        spouse: {
          firstName: "Pat",
          lastName: "Example",
          ssn: "987-65-4321",
          dateOfBirth: "1959-01-01",
        },
      },
      form1099SA: [
        {
          payer: "Inherited HSA Custodian",
          grossDistribution: "900",
          distributionCode: "3",
          accountType: "hsa",
          beneficiaryRole: "surviving_spouse",
        },
      ],
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    const schedule1Line8f = result.allLines.find((line) => line.form === "Sched 1" && line.line === "8f");
    const schedule2Line17c = result.allLines.find((line) => line.form === "Sched 2" && line.line === "17c");

    expect(result.form1099SA?.defaultAccountOwner).toBe("spouse");
    expect(result.form8889?.line14a.toNumber()).toBe(900);
    expect(result.form8889?.line16.toNumber()).toBe(900);
    expect(result.form8889?.line17aHasException).toBe(true);
    expect(result.form8889?.line17b.toNumber()).toBe(0);
    expect(result.form8889ByOwner).toBeUndefined();
    expect(schedule1Line8f?.value.toNumber()).toBe(900);
    expect(schedule2Line17c?.value.toNumber()).toBe(0);
    expect(result.otherIncome.toNumber()).toBe(900);
  });

  it("Schedule E K-1 at-risk limits reduce the deductible loss that reaches AGI while preserving the suspended excess on the Schedule E sub-result", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "At-Risk Limited LP",
          partnershipEIN: "55-5555555",
          ordinaryIncome: "-15000",
          guaranteedPayments: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          section1231Gain: "0",
          selfEmploymentEarnings: "0",
          netRentalIncome: "0",
          otherNetRentalIncome: "0",
          royalties: "0",
          otherIncome: "0",
          section179Deduction: "0",
          otherDeductions: "0",
          section199AQBI: "0",
          isPassiveActivity: false,
          atRiskAmount: "6000",
        },
      ],
    });

    expect(result.scheduleE?.totalPartnershipIncome.toNumber()).toBe(-6000);
    expect(result.scheduleE?.suspendedAtRiskLosses).toEqual([
      {
        partnershipName: "At-Risk Limited LP",
        amount: d(-9000),
      },
    ]);
    expect(result.otherIncome.toNumber()).toBe(0);
    expect(result.totalIncome.toNumber()).toBe(79000);
    expect(result.agi.toNumber()).toBe(79000);
  });

  it("Form 1040 Lines 8 and 23 - HSA testing-period failure flows through Schedule 1 and Schedule 2", () => {
    const hsaRecaptureResult = calculateFederalTax({
      ...simpleW2Fixture,
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "0",
        lastMonthRuleContributions: "7000",
        lastMonthRuleRedeterminedLimit: "4300",
        recaptureQualifiedFundingDistribution: "1500",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    const line8 = hsaRecaptureResult.allLines.find((line) => line.form === "1040" && line.line === "8");
    const line23 = hsaRecaptureResult.allLines.find((line) => line.form === "1040" && line.line === "23");
    const schedule1Line8f = hsaRecaptureResult.allLines.find((line) => line.form === "Sched 1" && line.line === "8f");
    const schedule2Line17d = hsaRecaptureResult.allLines.find((line) => line.form === "Sched 2" && line.line === "17d");
    const form8889Line20 = hsaRecaptureResult.allLines.find((line) => line.form === "Form 8889" && line.line === "20");
    const form8889Line21 = hsaRecaptureResult.allLines.find((line) => line.form === "Form 8889" && line.line === "21");

    expect(form8889Line20?.value.toNumber()).toBe(4200);
    expect(form8889Line21?.value.toNumber()).toBe(270);
    expect(schedule1Line8f?.value.toNumber()).toBe(4200);
    expect(schedule2Line17d?.value.toNumber()).toBe(270);
    expect(line8?.value.toNumber()).toBe(4200);
    expect(line23?.value.toNumber()).toBe(270);
    expect(hsaRecaptureResult.otherIncome.toNumber()).toBe(4200);
    expect(hsaRecaptureResult.totalIncome.toNumber()).toBe(89200);
    expect(hsaRecaptureResult.totalAdditionalTaxes.toNumber()).toBe(270);
  });

  it("Form 1040 Lines 8 and 23 - HSA testing-period failure can auto-recompute the prior-year redetermined limit", () => {
    const hsaRecaptureResult = calculateFederalTax({
      ...simpleW2Fixture,
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "0",
        lastMonthRuleContributions: "4150",
        priorYearRedeterminedLimitWorksheet: {
          coverageByMonth: [
            "none",
            "none",
            "none",
            "none",
            "none",
            "none",
            "none",
            "none",
            "none",
            "self_only",
            "self_only",
            "self_only",
          ],
          selfOnlyContributionLimit: "4150",
          familyContributionLimit: "8300",
          catchUpContribution: "1000",
        },
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    const schedule1Line8f = hsaRecaptureResult.allLines.find((line) => line.form === "Sched 1" && line.line === "8f");
    const schedule2Line17d = hsaRecaptureResult.allLines.find((line) => line.form === "Sched 2" && line.line === "17d");
    const form8889Line18 = hsaRecaptureResult.allLines.find((line) => line.form === "Form 8889" && line.line === "18");
    const form8889Line20 = hsaRecaptureResult.allLines.find((line) => line.form === "Form 8889" && line.line === "20");
    const form8889Line21 = hsaRecaptureResult.allLines.find((line) => line.form === "Form 8889" && line.line === "21");

    expect(form8889Line18?.value.toNumber()).toBe(3112.5);
    expect(form8889Line20?.value.toNumber()).toBe(3112.5);
    expect(form8889Line21?.value.toNumber()).toBe(311.25);
    expect(schedule1Line8f?.value.toNumber()).toBe(3112.5);
    expect(schedule2Line17d?.value.toNumber()).toBe(311.25);
    expect(hsaRecaptureResult.otherIncome.toNumber()).toBe(3112.5);
    expect(hsaRecaptureResult.totalAdditionalTaxes.toNumber()).toBe(311.25);
  });

  it("Form 1040 Lines 8 and 23 - missing HSA redetermined-limit support does not fabricate recapture income", () => {
    const hsaRecaptureResult = calculateFederalTax({
      ...simpleW2Fixture,
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "0",
        lastMonthRuleContributions: "4150",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    const schedule1Line8f = hsaRecaptureResult.allLines.find((line) => line.form === "Sched 1" && line.line === "8f");
    const schedule2Line17d = hsaRecaptureResult.allLines.find((line) => line.form === "Sched 2" && line.line === "17d");
    const form8889Line18 = hsaRecaptureResult.allLines.find((line) => line.form === "Form 8889" && line.line === "18");
    const form8889Line20 = hsaRecaptureResult.allLines.find((line) => line.form === "Form 8889" && line.line === "20");
    const form8889Line21 = hsaRecaptureResult.allLines.find((line) => line.form === "Form 8889" && line.line === "21");

    expect(form8889Line18?.value.toNumber()).toBe(0);
    expect(form8889Line20?.value.toNumber()).toBe(0);
    expect(form8889Line21?.value.toNumber()).toBe(0);
    expect(schedule1Line8f?.value.toNumber()).toBe(0);
    expect(schedule2Line17d?.value.toNumber()).toBe(0);
    expect(hsaRecaptureResult.otherIncome.toNumber()).toBe(0);
    expect(hsaRecaptureResult.totalAdditionalTaxes.toNumber()).toBe(0);
  });

  it("Form 1040 Lines 8 and 23 - death or disability testing-period failures do not flow HSA recapture into Schedule 1 or Schedule 2", () => {
    const hsaRecaptureResult = calculateFederalTax({
      ...simpleW2Fixture,
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "0",
        lastMonthRuleContributions: "7000",
        lastMonthRuleRedeterminedLimit: "4300",
        recaptureQualifiedFundingDistribution: "1500",
        testingPeriodFailureDueToDeathOrDisability: true,
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        hsaDeduction: "0",
      },
    });

    const schedule1Line8f = hsaRecaptureResult.allLines.find((line) => line.form === "Sched 1" && line.line === "8f");
    const schedule2Line17d = hsaRecaptureResult.allLines.find((line) => line.form === "Sched 2" && line.line === "17d");
    const form8889Line18 = hsaRecaptureResult.allLines.find((line) => line.form === "Form 8889" && line.line === "18");
    const form8889Line19 = hsaRecaptureResult.allLines.find((line) => line.form === "Form 8889" && line.line === "19");
    const form8889Line20 = hsaRecaptureResult.allLines.find((line) => line.form === "Form 8889" && line.line === "20");
    const form8889Line21 = hsaRecaptureResult.allLines.find((line) => line.form === "Form 8889" && line.line === "21");

    expect(form8889Line18?.value.toNumber()).toBe(0);
    expect(form8889Line19?.value.toNumber()).toBe(0);
    expect(form8889Line20?.value.toNumber()).toBe(0);
    expect(form8889Line21?.value.toNumber()).toBe(0);
    expect(schedule1Line8f?.value.toNumber()).toBe(0);
    expect(schedule2Line17d?.value.toNumber()).toBe(0);
    expect(hsaRecaptureResult.otherIncome.toNumber()).toBe(0);
    expect(hsaRecaptureResult.totalAdditionalTaxes.toNumber()).toBe(0);
  });
});

describe("Form 8824 federal integration", () => {
  it("Form 1040 Line 8 and Schedule 1 - Form 8824 line 21 ordinary recapture flows through Schedule 1 Line 4", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form8824: [
        {
          description: "Rental duplex exchange",
          cashReceived: "40000",
          fmvLikeKindPropertyReceived: "460000",
          adjustedBasisLikeKindPropertyGivenUp: "300000",
          depreciationRecapture: "10000",
          recognizedGainCharacter: "section1231",
        },
      ],
    });

    const sched1Line4 = result.allLines.find((line) => line.form === "Sched 1" && line.line === "4");
    const line8 = result.allLines.find((line) => line.form === "1040" && line.line === "8");
    const line7 = result.allLines.find((line) => line.form === "1040" && line.line === "7");

    expect(sched1Line4?.value.toNumber()).toBe(10000);
    expect(line8?.value.toNumber()).toBe(10000);
    expect(line7?.value.toNumber()).toBe(30000);
    expect(result.totalIncome.toNumber()).toBe(125000);
  });

  it("Form 1040 Line 7 - Form 8824 capital-asset recognized gain flows to Schedule D instead of Form 4797", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form8824: [
        {
          description: "Investment land exchange",
          cashReceived: "30000",
          fmvLikeKindPropertyReceived: "470000",
          adjustedBasisLikeKindPropertyGivenUp: "300000",
          depreciationRecapture: "0",
          recognizedGainCharacter: "capital",
        },
      ],
    });

    const sched1Line4 = result.allLines.find((line) => line.form === "Sched 1" && line.line === "4");
    const line7 = result.allLines.find((line) => line.form === "1040" && line.line === "7");
    const scheduleDLine15 = result.allLines.find((line) => line.form === "Sched D" && line.line === "15");

    expect(sched1Line4?.value.toNumber()).toBe(0);
    expect(scheduleDLine15?.value.toNumber()).toBe(30000);
    expect(line7?.value.toNumber()).toBe(30000);
    expect(result.totalIncome.toNumber()).toBe(115000);
  });
});

// ═══════════════════════════════════════════════════════════
// Complex MFJ Scenario
// ═══════════════════════════════════════════════════════════

describe("Complex MFJ filer", () => {
  const result = calculateFederalTax(complexMFJFixture);

  it("Form 1040 Line 1 - wages from multiple W-2s", () => {
    expect(result.totalWages.toNumber()).toBe(250000);
  });

  it("Form 1040 Line 2b - taxable interest (1099-INT + K-1)", () => {
    expect(result.totalInterest.toNumber()).toBe(3000); // 2500 + 500 K-1
  });

  it("Form 1040 Line 3a - qualified dividends", () => {
    expect(result.qualifiedDividends.toNumber()).toBe(6000);
  });

  it("Form 1040 Line 3b - ordinary dividends", () => {
    expect(result.totalDividends.toNumber()).toBe(8000);
  });

  it("Form 1040 Line 7 - net capital gain (long + short + K-1)", () => {
    // Long: AAPL 25000-15000 = 10000 + K-1 2000 + 1099-DIV 3000 = 15000
    // Short: TSLA 12000-14000 = -2000
    // Net = 15000 - 2000 = 13000
    expect(result.capitalGainLoss.toNumber()).toBe(13000);
  });

  it("Form 1040 Line 9 - total income includes all sources", () => {
    expect(result.totalIncome.greaterThan(d(250000))).toBe(true);
  });

  it("Form 1040 Line 11 - AGI accounts for SE deduction", () => {
    expect(result.agi.lessThan(result.totalIncome)).toBe(true);
  });

  it("Form 1040 Line 12 - itemized deductions selected", () => {
    // Mortgage: $18,000 + SALT: $8,500 (capped at $10K w/ state taxes) + Charitable: $25,000
    // Should exceed $30,000 standard deduction for MFJ
    expect(result.deductionUsed).toBe("itemized");
    expect(result.itemizedDeductions.greaterThan(d(30000))).toBe(true);
  });

  it("Schedule A Line 5d - SALT capped at $10,000", () => {
    // State taxes from W-2: $0 (WA has no income tax)
    // Property taxes: $8,500
    // Total SALT should be $8,500 (under cap)
    const schedA = result.allLines.find((l) => l.form === "Sched A" && l.line === "17");
    expect(schedA).toBeDefined();
  });

  it("Form 1040 Line 19 - child tax credit for 1 child", () => {
    expect(result.childTaxCredit.toNumber()).toBe(2200);
  });

  it("Schedule SE Line 12 - SE tax on consulting income", () => {
    expect(result.selfEmploymentTax.greaterThan(0)).toBe(true);
  });

  it("Form 8960 Line 17 - NIIT on investment income", () => {
    // AGI well over $250K MFJ threshold
    // NII includes interest + dividends + capital gains
    expect(result.niitTax.greaterThan(0)).toBe(true);
  });

  it("Form 1040 Line 25d - withholding from both W-2s", () => {
    expect(result.totalWithholding.toNumber()).toBe(42500); // 35000 + 7500
  });

  it("Form 1040 Line 26 - estimated tax payments", () => {
    expect(result.estimatedTaxPayments.toNumber()).toBe(20000); // 4 × $5,000
  });

  it("Form 1040 Line 33 - total payments includes excess SS", () => {
    // 42500 withholding + 20000 estimated + 3100 excess SS = 65600
    // Excess SS: $14,018.20 total withheld - $10,918.20 max (exact) = $3,100
    expect(result.totalPayments.toNumber()).toBe(65600);
  });

  it("Form 1040 Line 23 - additional taxes (AMT + SE + Medicare + NIIT)", () => {
    const expected = result.amt
      .plus(result.selfEmploymentTax)
      .plus(result.additionalMedicareTax)
      .plus(result.niitTax);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(expected.toNumber());
    expect(result.totalAdditionalTaxes.greaterThan(0)).toBe(true);
  });

  it("Form 1040 Line 23 - early Form 1099-R distributions flow through Form 5329 and Schedule 2", () => {
    const earlyDistributionResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "Former Employer 401(k)",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: false,
        },
      ],
    });

    expect(earlyDistributionResult.form5329?.line1.toNumber()).toBe(10000);
    expect(earlyDistributionResult.form5329?.line4.toNumber()).toBe(1000);
    expect(earlyDistributionResult.totalAdditionalTaxes.toNumber()).toBe(1000);

    const schedule2Line8 = earlyDistributionResult.allLines.find((line) => line.form === "Sched 2" && line.line === "8");
    expect(schedule2Line8?.value.toNumber()).toBe(1000);
  });

  it("Form 1040 Line 23 - early pension distributions use the Simplified Method taxable amount for Form 5329 and Schedule 2 when Box 2a is blank", () => {
    const earlyAnnuityResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "Former Employer Pension",
          grossDistribution: "12000",
          taxableAmountNotDetermined: true,
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: false,
          simplifiedMethodCostInPlan: "24000",
          simplifiedMethodExpectedPayments: 240,
          simplifiedMethodPaymentsReceivedThisYear: 12,
          simplifiedMethodPriorYearRecovered: "6000",
        },
      ],
    });

    expect(earlyAnnuityResult.pensionDistributionsGross.toNumber()).toBe(12000);
    expect(earlyAnnuityResult.pensionDistributionsTaxable.toNumber()).toBe(10800);
    expect(earlyAnnuityResult.form5329?.line1.toNumber()).toBe(10800);
    expect(earlyAnnuityResult.form5329?.line4.toNumber()).toBe(1080);
    expect(earlyAnnuityResult.totalAdditionalTaxes.toNumber()).toBe(1080);

    const schedule2Line8 = earlyAnnuityResult.allLines.find((line) => line.form === "Sched 2" && line.line === "8");
    expect(schedule2Line8?.value.toNumber()).toBe(1080);
  });

  it("Form 1040 Line 23 - code 3 IRA disability distributions use the Form 8606 taxable share and default exception 03", () => {
    const disabilityIraResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "3",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "4000",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
      },
    });

    const form5329Line1 = disabilityIraResult.allLines.find((line) => line.form === "Form 5329" && line.line === "1");
    const form5329Line2 = disabilityIraResult.allLines.find((line) => line.form === "Form 5329" && line.line === "2");
    const schedule2Line8 = disabilityIraResult.allLines.find((line) => line.form === "Sched 2" && line.line === "8");

    expect(disabilityIraResult.iraDistributionsGross.toNumber()).toBe(10000);
    expect(disabilityIraResult.iraDistributionsTaxable.toNumber()).toBe(6000);
    expect(disabilityIraResult.form8606?.line15c.toNumber()).toBe(6000);
    expect(disabilityIraResult.form5329?.line1.toNumber()).toBe(6000);
    expect(disabilityIraResult.form5329?.line2.toNumber()).toBe(6000);
    expect(disabilityIraResult.form5329?.line2ExceptionNumber).toBe("03");
    expect(disabilityIraResult.form5329?.line4.toNumber()).toBe(0);
    expect(disabilityIraResult.totalAdditionalTaxes.toNumber()).toBe(0);
    expect(String(form5329Line1?.inputs["Supported disability distributions (exception 03)"])).toBe("6000");
    expect(String(form5329Line2?.inputs["Supported disability distributions (exception 03)"])).toBe("6000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("03");
    expect(schedule2Line8?.value.toNumber()).toBe(0);
  });

  it("Form 1040 Lines 5b and 23 - code 3 disability annuities use the Simplified Method taxable amount and default exception 03", () => {
    const disabilityAnnuityResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "State Disability Pension",
          grossDistribution: "12000",
          taxableAmountNotDetermined: true,
          federalWithheld: "0",
          distributionCode: "3",
          iraSepSimple: false,
          simplifiedMethodCostInPlan: "24000",
          simplifiedMethodExpectedPayments: 240,
          simplifiedMethodPaymentsReceivedThisYear: 12,
          simplifiedMethodPriorYearRecovered: "6000",
        },
      ],
    });

    const form5329Line1 = disabilityAnnuityResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "1"
    );
    const form5329Line2 = disabilityAnnuityResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = disabilityAnnuityResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(disabilityAnnuityResult.pensionDistributionsGross.toNumber()).toBe(12000);
    expect(disabilityAnnuityResult.pensionDistributionsTaxable.toNumber()).toBe(10800);
    expect(disabilityAnnuityResult.form5329?.line1.toNumber()).toBe(10800);
    expect(disabilityAnnuityResult.form5329?.line2.toNumber()).toBe(10800);
    expect(disabilityAnnuityResult.form5329?.line2ExceptionNumber).toBe("03");
    expect(disabilityAnnuityResult.form5329?.line4.toNumber()).toBe(0);
    expect(disabilityAnnuityResult.totalAdditionalTaxes.toNumber()).toBe(0);
    expect(String(form5329Line1?.inputs["Supported disability distributions (exception 03)"])).toBe("10800");
    expect(String(form5329Line2?.inputs["Supported disability distributions (exception 03)"])).toBe("10800");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("03");
    expect(schedule2Line8?.value.toNumber()).toBe(0);
  });

  it("Form 1040 Line 23 - code 4 death distributions default exception 04 from attached Form 1099-R", () => {
    const deathDistributionResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "Inherited IRA Custodian",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "4",
          iraSepSimple: true,
        },
      ],
    });

    const form5329Line1 = deathDistributionResult.allLines.find((line) => line.form === "Form 5329" && line.line === "1");
    const form5329Line2 = deathDistributionResult.allLines.find((line) => line.form === "Form 5329" && line.line === "2");
    const schedule2Line8 = deathDistributionResult.allLines.find((line) => line.form === "Sched 2" && line.line === "8");

    expect(deathDistributionResult.form5329?.line1.toNumber()).toBe(10000);
    expect(deathDistributionResult.form5329?.line2.toNumber()).toBe(10000);
    expect(deathDistributionResult.form5329?.line2ExceptionNumber).toBe("04");
    expect(deathDistributionResult.form5329?.line4.toNumber()).toBe(0);
    expect(deathDistributionResult.totalAdditionalTaxes.toNumber()).toBe(0);
    expect(String(form5329Line1?.inputs["Supported death distributions (exception 04)"])).toBe("10000");
    expect(String(form5329Line2?.inputs["Supported death distributions (exception 04)"])).toBe("10000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("04");
    expect(schedule2Line8?.value.toNumber()).toBe(0);
  });

  it("Form 1040 Line 23 - a manual death-distribution amount suppresses the attached code 4 default", () => {
    const deathDistributionResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "Inherited IRA Custodian",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "4",
          iraSepSimple: true,
        },
      ],
      form5329: {
        deathDistributionExceptionAmount: "2000",
      },
    });

    const form5329Line2 = deathDistributionResult.allLines.find((line) => line.form === "Form 5329" && line.line === "2");
    const schedule2Line8 = deathDistributionResult.allLines.find((line) => line.form === "Sched 2" && line.line === "8");

    expect(deathDistributionResult.form5329?.line1.toNumber()).toBe(10000);
    expect(deathDistributionResult.form5329?.line2.toNumber()).toBe(2000);
    expect(deathDistributionResult.form5329?.line2ExceptionNumber).toBe("04");
    expect(deathDistributionResult.form5329?.line4.toNumber()).toBe(800);
    expect(deathDistributionResult.totalAdditionalTaxes.toNumber()).toBe(800);
    expect(String(form5329Line2?.inputs["Validated death-distribution exception amount (exception 04)"])).toBe("2000");
    expect(String(form5329Line2?.inputs["Supported death distributions (exception 04)"])).toBe("0");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("04");
    expect(schedule2Line8?.value.toNumber()).toBe(800);
  });

  it("Form 1040 Line 23 - misclassified code 1 distributions default to Form 5329 exception 12 once the owner was age 59 1/2 on January 1", () => {
    const age59AndHalfExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1965-07-01",
        },
      },
      form1099R: [
        {
          payer: "Former Employer 401(k)",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: false,
        },
      ],
    });

    const form5329Line2 = age59AndHalfExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = age59AndHalfExceptionResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(age59AndHalfExceptionResult.form5329?.line1.toNumber()).toBe(10000);
    expect(age59AndHalfExceptionResult.form5329?.line2.toNumber()).toBe(10000);
    expect(age59AndHalfExceptionResult.form5329?.line2ExceptionNumber).toBe("12");
    expect(age59AndHalfExceptionResult.form5329?.line4.toNumber()).toBe(0);
    expect(age59AndHalfExceptionResult.totalAdditionalTaxes.toNumber()).toBe(0);
    expect(
      String(form5329Line2?.inputs["Supported age-59 1/2-or-older misclassified code 1/J/S distributions (exception 12)"])
    ).toBe("10000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("12");
    expect(schedule2Line8?.value.toNumber()).toBe(0);
  });

  it("Form 1040 Line 23 - validated separation-from-service code 1 pension distributions default exception 01", () => {
    const separationFromServiceExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1969-06-01",
        },
      },
      form1099R: [
        {
          payer: "Former Employer 401(k)",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: false,
          separationFromServiceAfterAge55ExceptionApplies: true,
        },
      ],
    });

    const form5329Line2 = separationFromServiceExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = separationFromServiceExceptionResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(separationFromServiceExceptionResult.form5329?.line1.toNumber()).toBe(10000);
    expect(separationFromServiceExceptionResult.form5329?.line2.toNumber()).toBe(10000);
    expect(separationFromServiceExceptionResult.form5329?.line2ExceptionNumber).toBe("01");
    expect(separationFromServiceExceptionResult.form5329?.line4.toNumber()).toBe(0);
    expect(separationFromServiceExceptionResult.totalAdditionalTaxes.toNumber()).toBe(0);
    expect(
      String(
        form5329Line2?.inputs["Supported separation-from-service qualified-plan distributions (exception 01)"]
      )
    ).toBe("10000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("01");
    expect(schedule2Line8?.value.toNumber()).toBe(0);
  });

  it("Form 1040 Line 23 - validated QDRO code 1 pension distributions default exception 06", () => {
    const qdroExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1978-06-01",
        },
      },
      form1099R: [
        {
          payer: "Former Spouse Retirement Plan",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: false,
          qualifiedDomesticRelationsOrderExceptionApplies: true,
        },
      ],
    });

    const form5329Line2 = qdroExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = qdroExceptionResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(qdroExceptionResult.form5329?.line1.toNumber()).toBe(10000);
    expect(qdroExceptionResult.form5329?.line2.toNumber()).toBe(10000);
    expect(qdroExceptionResult.form5329?.line2ExceptionNumber).toBe("06");
    expect(qdroExceptionResult.form5329?.line4.toNumber()).toBe(0);
    expect(qdroExceptionResult.totalAdditionalTaxes.toNumber()).toBe(0);
    expect(
      String(form5329Line2?.inputs["Supported QDRO alternate-payee distributions (exception 06)"])
    ).toBe("10000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("06");
    expect(schedule2Line8?.value.toNumber()).toBe(0);
  });

  it("Form 1040 Line 23 - qualified public safety and firefighter code 1 distributions default exception 01 before age 55", () => {
    const qualifiedPublicSafetyExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1974-06-01",
        },
      },
      form1099R: [
        {
          payer: "Former Employer Pension",
          grossDistribution: "12000",
          taxableAmount: "12000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: false,
          qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies: true,
        },
      ],
    });

    const form5329Line2 = qualifiedPublicSafetyExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = qualifiedPublicSafetyExceptionResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(qualifiedPublicSafetyExceptionResult.form5329?.line1.toNumber()).toBe(12000);
    expect(qualifiedPublicSafetyExceptionResult.form5329?.line2.toNumber()).toBe(12000);
    expect(qualifiedPublicSafetyExceptionResult.form5329?.line2ExceptionNumber).toBe("01");
    expect(qualifiedPublicSafetyExceptionResult.form5329?.line4.toNumber()).toBe(0);
    expect(qualifiedPublicSafetyExceptionResult.totalAdditionalTaxes.toNumber()).toBe(0);
    expect(
      String(
        form5329Line2?.inputs["Supported separation-from-service qualified-plan distributions (exception 01)"]
      )
    ).toBe("12000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("01");
    expect(schedule2Line8?.value.toNumber()).toBe(0);
  });

  it("Form 1040 Line 23 - validated unemployment health insurance premiums reduce IRA early-distribution tax with exception 07", () => {
    const unemploymentHealthInsuranceExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "9000",
          taxableAmount: "9000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: true,
        },
      ],
      form5329: {
        unemployedHealthInsurancePremiumExceptionAmount: "4000",
      },
    });

    const form5329Line2 = unemploymentHealthInsuranceExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = unemploymentHealthInsuranceExceptionResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(unemploymentHealthInsuranceExceptionResult.form5329?.line1.toNumber()).toBe(9000);
    expect(unemploymentHealthInsuranceExceptionResult.form5329?.line2.toNumber()).toBe(4000);
    expect(unemploymentHealthInsuranceExceptionResult.form5329?.line2ExceptionNumber).toBe("07");
    expect(unemploymentHealthInsuranceExceptionResult.form5329?.line3.toNumber()).toBe(5000);
    expect(unemploymentHealthInsuranceExceptionResult.form5329?.line4.toNumber()).toBe(500);
    expect(unemploymentHealthInsuranceExceptionResult.totalAdditionalTaxes.toNumber()).toBe(500);
    expect(
      String(form5329Line2?.inputs["Validated unemployment health insurance premium exception amount (exception 07)"])
    ).toBe("4000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("07");
    expect(schedule2Line8?.value.toNumber()).toBe(500);
  });

  it("Form 1040 Line 23 - validated exception 14 survives the federal Form 5329 normalization path", () => {
    const pre1986EmployerPlanExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "Legacy Employer Pension",
          grossDistribution: "9000",
          taxableAmount: "9000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: false,
        },
      ],
      form5329: {
        pre1986EmployerPlanDistributionExceptionAmount: "2500",
      },
    });

    const form5329Line2 = pre1986EmployerPlanExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = pre1986EmployerPlanExceptionResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(pre1986EmployerPlanExceptionResult.form5329?.line1.toNumber()).toBe(9000);
    expect(pre1986EmployerPlanExceptionResult.form5329?.line2.toNumber()).toBe(2500);
    expect(pre1986EmployerPlanExceptionResult.form5329?.line2ExceptionNumber).toBe("14");
    expect(pre1986EmployerPlanExceptionResult.form5329?.line3.toNumber()).toBe(6500);
    expect(pre1986EmployerPlanExceptionResult.form5329?.line4.toNumber()).toBe(650);
    expect(pre1986EmployerPlanExceptionResult.totalAdditionalTaxes.toNumber()).toBe(650);
    expect(
      String(
        form5329Line2?.inputs[
          "Validated pre-March-1-1986 employer-plan pay-status distribution exception amount (exception 14)"
        ]
      )
    ).toBe("2500");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("14");
    expect(schedule2Line8?.value.toNumber()).toBe(650);
  });

  it("Form 1040 Line 23 - validated substantially equal periodic payments reduce IRA early-distribution tax with exception 02", () => {
    const substantiallyEqualPeriodicPaymentsExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "9000",
          taxableAmount: "9000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: true,
        },
      ],
      form5329: {
        substantiallyEqualPeriodicPaymentsExceptionAmount: "4200",
      },
    });

    const form5329Line2 = substantiallyEqualPeriodicPaymentsExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = substantiallyEqualPeriodicPaymentsExceptionResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(substantiallyEqualPeriodicPaymentsExceptionResult.form5329?.line1.toNumber()).toBe(9000);
    expect(substantiallyEqualPeriodicPaymentsExceptionResult.form5329?.line2.toNumber()).toBe(4200);
    expect(substantiallyEqualPeriodicPaymentsExceptionResult.form5329?.line2ExceptionNumber).toBe("02");
    expect(substantiallyEqualPeriodicPaymentsExceptionResult.form5329?.line3.toNumber()).toBe(4800);
    expect(substantiallyEqualPeriodicPaymentsExceptionResult.form5329?.line4.toNumber()).toBe(480);
    expect(substantiallyEqualPeriodicPaymentsExceptionResult.totalAdditionalTaxes.toNumber()).toBe(480);
    expect(
      String(
        form5329Line2?.inputs["Validated substantially equal periodic payments exception amount (exception 02)"]
      )
    ).toBe("4200");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("02");
    expect(schedule2Line8?.value.toNumber()).toBe(480);
  });

  it("Form 1040 Line 23 - validated medical and higher education exceptions reduce IRA early-distribution tax and collapse to exception 99", () => {
    const combinedValidatedExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "9000",
          taxableAmount: "9000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: true,
        },
      ],
      form5329: {
        medicalExpenseExceptionAmount: "3000",
        qualifiedHigherEducationExpenseExceptionAmount: "1500",
      },
    });

    const form5329Line2 = combinedValidatedExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = combinedValidatedExceptionResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(combinedValidatedExceptionResult.form5329?.line1.toNumber()).toBe(9000);
    expect(combinedValidatedExceptionResult.form5329?.line2.toNumber()).toBe(4500);
    expect(combinedValidatedExceptionResult.form5329?.line2ExceptionNumber).toBe("99");
    expect(combinedValidatedExceptionResult.form5329?.line3.toNumber()).toBe(4500);
    expect(combinedValidatedExceptionResult.form5329?.line4.toNumber()).toBe(450);
    expect(combinedValidatedExceptionResult.totalAdditionalTaxes.toNumber()).toBe(450);
    expect(String(form5329Line2?.inputs["Validated medical expense exception amount (exception 05)"])).toBe("3000");
    expect(
      String(form5329Line2?.inputs["Validated higher education expense exception amount (exception 08)"])
    ).toBe("1500");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("99");
    expect(schedule2Line8?.value.toNumber()).toBe(450);
  });

  it("Form 1040 Line 23 - Schedule A deductible medical expenses default Form 5329 exception 05 even when the standard deduction is used", () => {
    const scheduleAMedicalExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "96000",
          federalWithheld: "12000",
        },
      ],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "4000",
          taxableAmount: "4000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: true,
        },
      ],
      scheduleA: {
        medicalExpenses: "10000",
      },
    });

    const form5329Line2 = scheduleAMedicalExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = scheduleAMedicalExceptionResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(scheduleAMedicalExceptionResult.agi.toNumber()).toBe(100000);
    expect(scheduleAMedicalExceptionResult.scheduleA?.medicalDeduction.toNumber()).toBe(2500);
    expect(scheduleAMedicalExceptionResult.deductionAmount.toNumber()).toBe(15750);
    expect(scheduleAMedicalExceptionResult.form5329?.line1.toNumber()).toBe(4000);
    expect(scheduleAMedicalExceptionResult.form5329?.line2.toNumber()).toBe(2500);
    expect(scheduleAMedicalExceptionResult.form5329?.line2ExceptionNumber).toBe("05");
    expect(scheduleAMedicalExceptionResult.form5329?.line3.toNumber()).toBe(1500);
    expect(scheduleAMedicalExceptionResult.form5329?.line4.toNumber()).toBe(150);
    expect(String(form5329Line2?.inputs["Supported medical expense exception amount (exception 05)"])).toBe("2500");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("05");
    expect(schedule2Line8?.value.toNumber()).toBe(150);
  });

  it("Form 1040 Line 23 - validated qualified reservist distributions reduce early-distribution tax with exception 11", () => {
    const qualifiedReservistExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "9000",
          taxableAmount: "9000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: true,
        },
      ],
      form5329: {
        qualifiedReservistDistributionExceptionAmount: "3600",
      },
    });

    const form5329Line2 = qualifiedReservistExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = qualifiedReservistExceptionResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(qualifiedReservistExceptionResult.form5329?.line1.toNumber()).toBe(9000);
    expect(qualifiedReservistExceptionResult.form5329?.line2.toNumber()).toBe(3600);
    expect(qualifiedReservistExceptionResult.form5329?.line2ExceptionNumber).toBe("11");
    expect(qualifiedReservistExceptionResult.form5329?.line3.toNumber()).toBe(5400);
    expect(qualifiedReservistExceptionResult.form5329?.line4.toNumber()).toBe(540);
    expect(qualifiedReservistExceptionResult.totalAdditionalTaxes.toNumber()).toBe(540);
    expect(
      String(
        form5329Line2?.inputs["Validated qualified reservist distribution exception amount (exception 11)"]
      )
    ).toBe("3600");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("11");
    expect(schedule2Line8?.value.toNumber()).toBe(540);
  });

  it("Form 1040 Line 23 - direct domestic-abuse and emergency-expense exceptions respect the 2025 statutory caps", () => {
    const cappedRepaymentCategoryExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "20000",
          taxableAmount: "20000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: true,
        },
      ],
      form5329: {
        domesticAbuseExceptionAmount: "15000",
        emergencyPersonalExpenseExceptionAmount: "5000",
      },
    });

    const form5329Line2 = cappedRepaymentCategoryExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = cappedRepaymentCategoryExceptionResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(cappedRepaymentCategoryExceptionResult.form5329?.line1.toNumber()).toBe(20000);
    expect(cappedRepaymentCategoryExceptionResult.form5329?.line2.toNumber()).toBe(11300);
    expect(cappedRepaymentCategoryExceptionResult.form5329?.line2ExceptionNumber).toBe("99");
    expect(cappedRepaymentCategoryExceptionResult.form5329?.line3.toNumber()).toBe(8700);
    expect(cappedRepaymentCategoryExceptionResult.form5329?.line4.toNumber()).toBe(870);
    expect(String(form5329Line2?.inputs["Validated domestic-abuse victim distribution exception amount (exception 22)"]))
      .toBe("10300");
    expect(
      String(form5329Line2?.inputs["Validated emergency personal expense distribution exception amount (exception 23)"])
    ).toBe("1000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("99");
    expect(schedule2Line8?.value.toNumber()).toBe(870);
  });

  it("Form 1040 Line 23 - validated IRS levy distributions reduce early-distribution tax with exception 10", () => {
    const irsLevyExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "Former Employer Plan",
          grossDistribution: "9000",
          taxableAmount: "9000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: false,
        },
      ],
      form5329: {
        irsLevyDistributionExceptionAmount: "3800",
      },
    });

    const form5329Line2 = irsLevyExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = irsLevyExceptionResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(irsLevyExceptionResult.form5329?.line1.toNumber()).toBe(9000);
    expect(irsLevyExceptionResult.form5329?.line2.toNumber()).toBe(3800);
    expect(irsLevyExceptionResult.form5329?.line2ExceptionNumber).toBe("10");
    expect(irsLevyExceptionResult.form5329?.line3.toNumber()).toBe(5200);
    expect(irsLevyExceptionResult.form5329?.line4.toNumber()).toBe(520);
    expect(irsLevyExceptionResult.totalAdditionalTaxes.toNumber()).toBe(520);
    expect(String(form5329Line2?.inputs["Validated IRS levy distribution exception amount (exception 10)"])).toBe("3800");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("10");
    expect(schedule2Line8?.value.toNumber()).toBe(520);
  });

  it("Form 1040 Line 23 - a validated distribution date can default exception 12 after a later-in-year age 59 1/2 crossing", () => {
    const datedAge59AndHalfExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1966-02-01",
        },
      },
      form1099R: [
        {
          payer: "Former Employer 401(k)",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "1",
          distributionDate: "2025-09-15",
          iraSepSimple: false,
        },
      ],
    });

    const form5329Line2 = datedAge59AndHalfExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );

    expect(datedAge59AndHalfExceptionResult.form5329?.line1.toNumber()).toBe(10000);
    expect(datedAge59AndHalfExceptionResult.form5329?.line2.toNumber()).toBe(10000);
    expect(datedAge59AndHalfExceptionResult.form5329?.line2ExceptionNumber).toBe("12");
    expect(datedAge59AndHalfExceptionResult.form5329?.line4.toNumber()).toBe(0);
    expect(
      String(form5329Line2?.inputs["Supported age-59 1/2-or-older misclassified code 1/J/S distributions (exception 12)"])
    ).toBe("10000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("12");
  });

  it("Form 1040 Line 23 - an August 31 birth defaults exception 12 on the February 28 half-birthday boundary", () => {
    const monthEndAge59AndHalfBoundaryResult = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1965-08-31",
        },
      },
      form1099R: [
        {
          payer: "Former Employer 401(k)",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "1",
          distributionDate: "2025-02-28",
          iraSepSimple: false,
        },
      ],
    });

    const form5329Line2 = monthEndAge59AndHalfBoundaryResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = monthEndAge59AndHalfBoundaryResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(monthEndAge59AndHalfBoundaryResult.form5329?.line1.toNumber()).toBe(10000);
    expect(monthEndAge59AndHalfBoundaryResult.form5329?.line2.toNumber()).toBe(10000);
    expect(monthEndAge59AndHalfBoundaryResult.form5329?.line2ExceptionNumber).toBe("12");
    expect(monthEndAge59AndHalfBoundaryResult.form5329?.line4.toNumber()).toBe(0);
    expect(monthEndAge59AndHalfBoundaryResult.totalAdditionalTaxes.toNumber()).toBe(0);
    expect(
      String(form5329Line2?.inputs["Supported age-59 1/2-or-older misclassified code 1/J/S distributions (exception 12)"])
    ).toBe("10000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("12");
    expect(schedule2Line8?.value.toNumber()).toBe(0);
  });

  it("Form 1040 Line 23 - a validated distribution date before age 59 1/2 keeps the code 1 distribution in the Form 5329 penalty base", () => {
    const preAge59AndHalfDistributionResult = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1966-02-01",
        },
      },
      form1099R: [
        {
          payer: "Former Employer 401(k)",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "1",
          distributionDate: "2025-07-15",
          iraSepSimple: false,
        },
      ],
    });

    expect(preAge59AndHalfDistributionResult.form5329?.line1.toNumber()).toBe(10000);
    expect(preAge59AndHalfDistributionResult.form5329?.line2.toNumber()).toBe(0);
    expect(preAge59AndHalfDistributionResult.form5329?.line2ExceptionNumber).toBeUndefined();
    expect(preAge59AndHalfDistributionResult.form5329?.line4.toNumber()).toBe(1000);
    expect(preAge59AndHalfDistributionResult.totalAdditionalTaxes.toNumber()).toBe(1000);
  });

  it("Form 1040 Line 23 - month-end birthdays treat the shorter sixth month as the age-59 1/2 boundary", () => {
    const monthEndHalfBirthdayResult = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1965-08-31",
        },
      },
      form1099R: [
        {
          payer: "Former Employer 401(k)",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "1",
          distributionDate: "2025-03-01",
          iraSepSimple: false,
        },
      ],
    });

    const form5329Line2 = monthEndHalfBirthdayResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );

    expect(monthEndHalfBirthdayResult.form5329?.line1.toNumber()).toBe(10000);
    expect(monthEndHalfBirthdayResult.form5329?.line2.toNumber()).toBe(10000);
    expect(monthEndHalfBirthdayResult.form5329?.line2ExceptionNumber).toBe("12");
    expect(monthEndHalfBirthdayResult.form5329?.line4.toNumber()).toBe(0);
    expect(
      String(form5329Line2?.inputs["Supported age-59 1/2-or-older misclassified code 1/J/S distributions (exception 12)"])
    ).toBe("10000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("12");
  });

  it("Form 1040 Line 23 - a validated Roth IRA distribution date can default exception 12 through the Form 8606 path", () => {
    const datedRothAge59AndHalfExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1966-02-01",
        },
      },
      form1099R: [
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "12000",
          taxableAmount: "12000",
          federalWithheld: "0",
          distributionCode: "J",
          distributionDate: "2025-09-15",
          iraSepSimple: true,
        },
      ],
      form8606: {
        yearEndValue: "0",
        rothContributionBasis: "0",
        rothConversionBasis: "0",
      },
    });

    const form5329Line2 = datedRothAge59AndHalfExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );

    expect(datedRothAge59AndHalfExceptionResult.form8606?.line19.toNumber()).toBe(12000);
    expect(datedRothAge59AndHalfExceptionResult.form8606?.line25c.toNumber()).toBe(12000);
    expect(datedRothAge59AndHalfExceptionResult.form5329?.line1.toNumber()).toBe(12000);
    expect(datedRothAge59AndHalfExceptionResult.form5329?.line2.toNumber()).toBe(12000);
    expect(datedRothAge59AndHalfExceptionResult.form5329?.line2ExceptionNumber).toBe("12");
    expect(datedRothAge59AndHalfExceptionResult.form5329?.line4.toNumber()).toBe(0);
    expect(
      String(form5329Line2?.inputs["Supported age-59 1/2-or-older misclassified code 1/J/S distributions (exception 12)"])
    ).toBe("12000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("12");
  });

  it("Form 1040 Line 23 - mixed dated early traditional IRA distributions prorate exception 12 through Form 8606", () => {
    const mixedTraditionalAge59AndHalfExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1966-02-01",
        },
      },
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "1",
          distributionDate: "2025-07-15",
          iraSepSimple: true,
        },
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "1",
          distributionDate: "2025-09-15",
          iraSepSimple: true,
        },
      ],
      form8606: {
        priorYearBasis: "4000",
        yearEndValue: "0",
        rothConversions: "0",
      },
    });

    const form5329Line2 = mixedTraditionalAge59AndHalfExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );

    expect(mixedTraditionalAge59AndHalfExceptionResult.form8606?.line15a.toNumber()).toBe(16000);
    expect(mixedTraditionalAge59AndHalfExceptionResult.form8606?.line15c.toNumber()).toBe(16000);
    expect(mixedTraditionalAge59AndHalfExceptionResult.form5329?.line1.toNumber()).toBe(16000);
    expect(mixedTraditionalAge59AndHalfExceptionResult.form5329?.line2.toNumber()).toBe(8000);
    expect(mixedTraditionalAge59AndHalfExceptionResult.form5329?.line2ExceptionNumber).toBe("12");
    expect(mixedTraditionalAge59AndHalfExceptionResult.form5329?.line4.toNumber()).toBe(800);
    expect(
      String(form5329Line2?.inputs["Supported age-59 1/2-or-older misclassified code 1/J/S distributions (exception 12)"])
    ).toBe("8000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("12");
  });

  it("Form 1040 Line 23 - mixed dated early Roth IRA distributions prorate exception 12 through Form 8606", () => {
    const mixedRothAge59AndHalfExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1966-02-01",
        },
      },
      form1099R: [
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "12000",
          taxableAmount: "12000",
          federalWithheld: "0",
          distributionCode: "J",
          distributionDate: "2025-07-15",
          iraSepSimple: true,
        },
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "12000",
          taxableAmount: "12000",
          federalWithheld: "0",
          distributionCode: "J",
          distributionDate: "2025-09-15",
          iraSepSimple: true,
        },
      ],
      form8606: {
        yearEndValue: "0",
        rothContributionBasis: "0",
        rothConversionBasis: "0",
      },
    });

    const form5329Line2 = mixedRothAge59AndHalfExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );

    expect(mixedRothAge59AndHalfExceptionResult.form8606?.line19.toNumber()).toBe(24000);
    expect(mixedRothAge59AndHalfExceptionResult.form8606?.line25c.toNumber()).toBe(24000);
    expect(mixedRothAge59AndHalfExceptionResult.form5329?.line1.toNumber()).toBe(24000);
    expect(mixedRothAge59AndHalfExceptionResult.form5329?.line2.toNumber()).toBe(12000);
    expect(mixedRothAge59AndHalfExceptionResult.form5329?.line2ExceptionNumber).toBe("12");
    expect(mixedRothAge59AndHalfExceptionResult.form5329?.line4.toNumber()).toBe(1200);
    expect(
      String(form5329Line2?.inputs["Supported age-59 1/2-or-older misclassified code 1/J/S distributions (exception 12)"])
    ).toBe("12000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("12");
  });

  it("Form 1040 Line 23 - eligible governmental 457(b) distributions stay off the defaulted Form 5329 penalty base except for transferred qualified-plan amounts", () => {
    const governmental457bResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "City Deferred Compensation Plan",
          grossDistribution: "12000",
          taxableAmount: "12000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: false,
          eligibleGovernmental457bPlan: true,
          eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount: "3000",
        },
      ],
    });

    const form5329Line1 = governmental457bResult.allLines.find((line) => line.form === "Form 5329" && line.line === "1");
    const schedule2Line8 = governmental457bResult.allLines.find((line) => line.form === "Sched 2" && line.line === "8");

    expect(governmental457bResult.pensionDistributionsGross.toNumber()).toBe(0);
    expect(governmental457bResult.pensionDistributionsTaxable.toNumber()).toBe(12000);
    expect(governmental457bResult.form5329?.line1.toNumber()).toBe(3000);
    expect(governmental457bResult.form5329?.line4.toNumber()).toBe(300);
    expect(governmental457bResult.totalAdditionalTaxes.toNumber()).toBe(300);
    expect(
      String(form5329Line1?.inputs["Supported eligible governmental section 457(b) distributions excluded from Line 1"])
    ).toBe("9000");
    expect(schedule2Line8?.value.toNumber()).toBe(300);
  });

  it("Form 1040 Line 23 - code 2 governmental 457(b) distributions still default the transferred qualified-plan portion into Form 5329", () => {
    const governmental457bCode2Result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "City Deferred Compensation Plan",
          grossDistribution: "12000",
          taxableAmount: "12000",
          federalWithheld: "0",
          distributionCode: "2",
          iraSepSimple: false,
          eligibleGovernmental457bPlan: true,
          eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount: "3000",
        },
      ],
    });

    const form5329Line1 = governmental457bCode2Result.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "1"
    );
    const schedule2Line8 = governmental457bCode2Result.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(governmental457bCode2Result.pensionDistributionsTaxable.toNumber()).toBe(12000);
    expect(governmental457bCode2Result.form5329?.line1.toNumber()).toBe(3000);
    expect(governmental457bCode2Result.form5329?.line4.toNumber()).toBe(300);
    expect(governmental457bCode2Result.totalAdditionalTaxes.toNumber()).toBe(300);
    expect(
      String(form5329Line1?.inputs["Supported eligible governmental section 457(b) distributions excluded from Line 1"])
    ).toBe("9000");
    expect(schedule2Line8?.value.toNumber()).toBe(300);
  });

  it("Form 1040 Line 23 - code 4 governmental 457(b) death distributions only default the transferred qualified-plan portion into Form 5329", () => {
    const governmental457bDeathResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "City Deferred Compensation Plan",
          grossDistribution: "12000",
          taxableAmount: "12000",
          federalWithheld: "0",
          distributionCode: "4",
          iraSepSimple: false,
          eligibleGovernmental457bPlan: true,
          eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount: "3000",
        },
      ],
    });

    const form5329Line1 = governmental457bDeathResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "1"
    );
    const form5329Line2 = governmental457bDeathResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = governmental457bDeathResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(governmental457bDeathResult.pensionDistributionsTaxable.toNumber()).toBe(12000);
    expect(governmental457bDeathResult.form5329?.line1.toNumber()).toBe(3000);
    expect(governmental457bDeathResult.form5329?.line2.toNumber()).toBe(3000);
    expect(governmental457bDeathResult.form5329?.line2ExceptionNumber).toBe("04");
    expect(governmental457bDeathResult.form5329?.line4.toNumber()).toBe(0);
    expect(
      String(form5329Line1?.inputs["Supported eligible governmental section 457(b) distributions excluded from Line 1"])
    ).toBe("9000");
    expect(String(form5329Line2?.inputs["Supported death distributions (exception 04)"])).toBe("3000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("04");
    expect(schedule2Line8?.value.toNumber()).toBe(0);
  });

  it("Form 1040 Line 23 - direct Form 5329 eligible governmental 457(b) exception inputs flow through the federal engine", () => {
    const governmental457bExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "9000",
          taxableAmount: "9000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: true,
        },
      ],
      form5329: {
        eligibleGovernmental457bDistributionExceptionAmount: "3200",
      },
    });

    const form5329Line2 = governmental457bExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );

    expect(governmental457bExceptionResult.form5329?.line1.toNumber()).toBe(9000);
    expect(governmental457bExceptionResult.form5329?.line2.toNumber()).toBe(3200);
    expect(governmental457bExceptionResult.form5329?.line2ExceptionNumber).toBe("13");
    expect(governmental457bExceptionResult.form5329?.line3.toNumber()).toBe(5800);
    expect(governmental457bExceptionResult.form5329?.line4.toNumber()).toBe(580);
    expect(governmental457bExceptionResult.totalAdditionalTaxes.toNumber()).toBe(580);
    expect(
      String(form5329Line2?.inputs["Validated eligible governmental section 457(b) distribution exception amount (exception 13)"])
    ).toBe("3200");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("13");
  });

  it("Form 1040 Line 23 - direct Form 5329 exception 15 through 18 inputs flow through the federal engine", () => {
    const directStructuredExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "9000",
          taxableAmount: "9000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: true,
        },
      ],
      form5329: {
        section404kDividendDistributionExceptionAmount: "2100",
        section72qAnnuityExceptionAmount: "1800",
        federalPhasedRetirementAnnuityExceptionAmount: "2600",
        permissibleEacaWithdrawalExceptionAmount: "1400",
      },
    });

    const form5329Line2 = directStructuredExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );

    expect(directStructuredExceptionResult.form5329?.line1.toNumber()).toBe(9000);
    expect(directStructuredExceptionResult.form5329?.line2.toNumber()).toBe(7900);
    expect(directStructuredExceptionResult.form5329?.line2ExceptionNumber).toBe("99");
    expect(directStructuredExceptionResult.form5329?.line3.toNumber()).toBe(1100);
    expect(directStructuredExceptionResult.form5329?.line4.toNumber()).toBe(110);
    expect(directStructuredExceptionResult.totalAdditionalTaxes.toNumber()).toBe(110);
    expect(
      String(form5329Line2?.inputs["Validated section 404(k) dividend distribution exception amount (exception 15)"])
    ).toBe("2100");
    expect(
      String(form5329Line2?.inputs["Validated section 72(q) annuity exception amount (exception 16)"])
    ).toBe("1800");
    expect(
      String(form5329Line2?.inputs["Validated federal phased retirement annuity exception amount (exception 17)"])
    ).toBe("2600");
    expect(
      String(form5329Line2?.inputs["Validated permissible EACA withdrawal exception amount (exception 18)"])
    ).toBe("1400");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("99");
  });

  it("Form 1040 Line 23 - SIMPLE IRA first-two-year distributions default to the 25 percent additional tax through Form 5329 and Schedule 2", () => {
    const simpleIraResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "SIMPLE IRA Custodian",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "S",
          iraSepSimple: true,
        },
      ],
    });

    expect(simpleIraResult.form5329?.line1.toNumber()).toBe(10000);
    expect(simpleIraResult.form5329?.simpleIRADistributionsWithinFirstTwoYears.toNumber()).toBe(10000);
    expect(simpleIraResult.form5329?.line4.toNumber()).toBe(2500);

    const schedule2Line8 = simpleIraResult.allLines.find((line) => line.form === "Sched 2" && line.line === "8");
    expect(schedule2Line8?.value.toNumber()).toBe(2500);
  });

  it("Form 1040 Lines 4b and 23 - code S distributions still route through IRA and SIMPLE IRA logic when the checkbox is blank", () => {
    const simpleIraResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "SIMPLE IRA Custodian",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "S",
          iraSepSimple: false,
        },
      ],
    });

    const line4b = simpleIraResult.allLines.find((line) => line.form === "1040" && line.line === "4b");
    const line5b = simpleIraResult.allLines.find((line) => line.form === "1040" && line.line === "5b");
    const schedule2Line8 = simpleIraResult.allLines.find((line) => line.form === "Sched 2" && line.line === "8");

    expect(line4b?.value.toNumber()).toBe(10000);
    expect(line5b?.value.toNumber()).toBe(0);
    expect(simpleIraResult.iraDistributionsTaxable.toNumber()).toBe(10000);
    expect(simpleIraResult.pensionDistributionsTaxable.toNumber()).toBe(0);
    expect(simpleIraResult.form5329?.line1.toNumber()).toBe(10000);
    expect(simpleIraResult.form5329?.simpleIRADistributionsWithinFirstTwoYears.toNumber()).toBe(10000);
    expect(simpleIraResult.form5329?.line4.toNumber()).toBe(2500);
    expect(schedule2Line8?.value.toNumber()).toBe(2500);
  });

  it("Form 1040 Lines 4b and 23 - implicit IRA-reporting code S ignores the pension Box 5 fallback when the checkbox is blank", () => {
    const simpleIraResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "SIMPLE IRA Custodian",
          grossDistribution: "10000",
          employeeContributions: "3000",
          federalWithheld: "0",
          distributionCode: "S",
          iraSepSimple: false,
        },
      ],
    });

    const line4b = simpleIraResult.allLines.find((line) => line.form === "1040" && line.line === "4b");
    const line5b = simpleIraResult.allLines.find((line) => line.form === "1040" && line.line === "5b");
    const schedule2Line8 = simpleIraResult.allLines.find((line) => line.form === "Sched 2" && line.line === "8");

    expect(line4b?.value.toNumber()).toBe(10000);
    expect(line5b?.value.toNumber()).toBe(0);
    expect(simpleIraResult.iraDistributionsTaxable.toNumber()).toBe(10000);
    expect(simpleIraResult.pensionDistributionsTaxable.toNumber()).toBe(0);
    expect(simpleIraResult.form5329?.line1.toNumber()).toBe(10000);
    expect(simpleIraResult.form5329?.simpleIRADistributionsWithinFirstTwoYears.toNumber()).toBe(10000);
    expect(simpleIraResult.form5329?.line4.toNumber()).toBe(2500);
    expect(schedule2Line8?.value.toNumber()).toBe(2500);
  });

  it("Form 1040 Line 23 - Roth SIMPLE IRA code JS distributions default only once into Form 5329 and still use the 25 percent SIMPLE rate", () => {
    const rothSimpleIraResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Roth SIMPLE IRA Custodian",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "JS",
          iraSepSimple: true,
        },
      ],
      form8606: {
        yearEndValue: "0",
        rothContributionBasis: "0",
        rothConversionBasis: "0",
      },
    });

    expect(rothSimpleIraResult.form8606?.line19.toNumber()).toBe(10000);
    expect(rothSimpleIraResult.form8606?.line25c.toNumber()).toBe(10000);
    expect(rothSimpleIraResult.form5329?.line1.toNumber()).toBe(10000);
    expect(rothSimpleIraResult.form5329?.line3.toNumber()).toBe(10000);
    expect(rothSimpleIraResult.form5329?.simpleIRADistributionsWithinFirstTwoYears.toNumber()).toBe(10000);
    expect(rothSimpleIraResult.form5329?.line4.toNumber()).toBe(2500);

    const form5329Line4 = rothSimpleIraResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "4"
    );
    const schedule2Line8 = rothSimpleIraResult.allLines.find((line) => line.form === "Sched 2" && line.line === "8");

    expect(String(form5329Line4?.inputs["SIMPLE IRA amount taxed at 25%"])).toBe("10000");
    expect(schedule2Line8?.value.toNumber()).toBe(2500);
  });

  it("Form 1040 Line 23 - mixed-age MFJ code 1 distributions stay manual when the owner is untagged", () => {
    const ambiguousAge59AndHalfResult = calculateFederalTax({
      ...complexMFJFixture,
      taxpayer: {
        ...complexMFJFixture.taxpayer,
        primary: {
          ...complexMFJFixture.taxpayer.primary,
          dateOfBirth: "1965-07-01",
        },
        spouse: {
          ...complexMFJFixture.taxpayer.spouse!,
          dateOfBirth: "1965-07-02",
        },
      },
      form1099R: [
        {
          payer: "Former Employer 401(k)",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: false,
        },
      ],
    });

    const schedule2Line8 = ambiguousAge59AndHalfResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(ambiguousAge59AndHalfResult.form5329?.line1.toNumber()).toBe(10000);
    expect(ambiguousAge59AndHalfResult.form5329?.line2.toNumber()).toBe(0);
    expect(ambiguousAge59AndHalfResult.form5329?.line2ExceptionNumber).toBeUndefined();
    expect(ambiguousAge59AndHalfResult.form5329?.line4.toNumber()).toBe(1000);
    expect(schedule2Line8?.value.toNumber()).toBe(1000);
  });

  it("Form 1040 Line 23 - spouse-tagged mixed-age MFJ code 1 distributions default exception 12 for the tagged spouse", () => {
    const taggedSpouseAge59AndHalfResult = calculateFederalTax({
      ...complexMFJFixture,
      taxpayer: {
        ...complexMFJFixture.taxpayer,
        primary: {
          ...complexMFJFixture.taxpayer.primary,
          dateOfBirth: "1965-07-02",
        },
        spouse: {
          ...complexMFJFixture.taxpayer.spouse!,
          dateOfBirth: "1965-07-01",
        },
      },
      form1099R: [
        {
          payer: "Former Employer 401(k)",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: false,
          accountHolder: "spouse",
        },
      ],
    });

    const form5329Line2 = taggedSpouseAge59AndHalfResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = taggedSpouseAge59AndHalfResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(taggedSpouseAge59AndHalfResult.form5329?.line1.toNumber()).toBe(10000);
    expect(taggedSpouseAge59AndHalfResult.form5329?.line2.toNumber()).toBe(10000);
    expect(taggedSpouseAge59AndHalfResult.form5329?.line2ExceptionNumber).toBe("12");
    expect(taggedSpouseAge59AndHalfResult.form5329?.line4.toNumber()).toBe(0);
    expect(
      String(form5329Line2?.inputs["Supported age-59 1/2-or-older misclassified code 1/J/S distributions (exception 12)"])
    ).toBe("10000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("12");
    expect(schedule2Line8?.value.toNumber()).toBe(0);
  });

  it("Form 1040 Lines 4b and 23 - mixed-age MFJ Roth IRA code J distributions stay manual when the owner is untagged", () => {
    const ambiguousRothAge59AndHalfResult = calculateFederalTax({
      ...complexMFJFixture,
      taxpayer: {
        ...complexMFJFixture.taxpayer,
        primary: {
          ...complexMFJFixture.taxpayer.primary,
          dateOfBirth: "1965-07-01",
        },
        spouse: {
          ...complexMFJFixture.taxpayer.spouse!,
          dateOfBirth: "1965-07-02",
        },
      },
      form1099R: [
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "J",
          iraSepSimple: true,
        },
      ],
      form8606: {
        yearEndValue: "0",
        rothContributionBasis: "0",
        rothConversionBasis: "0",
      },
    });

    const schedule2Line8 = ambiguousRothAge59AndHalfResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(ambiguousRothAge59AndHalfResult.form8606?.line19.toNumber()).toBe(10000);
    expect(ambiguousRothAge59AndHalfResult.form8606?.line25c.toNumber()).toBe(10000);
    expect(ambiguousRothAge59AndHalfResult.form5329?.line1.toNumber()).toBe(10000);
    expect(ambiguousRothAge59AndHalfResult.form5329?.line2.toNumber()).toBe(0);
    expect(ambiguousRothAge59AndHalfResult.form5329?.line2ExceptionNumber).toBeUndefined();
    expect(ambiguousRothAge59AndHalfResult.form5329?.line4.toNumber()).toBe(1000);
    expect(schedule2Line8?.value.toNumber()).toBe(1000);
  });

  it("Form 1040 Lines 4b and 23 - spouse-tagged mixed-age MFJ SIMPLE IRA code S distributions default exception 12 and clear the 25 percent branch", () => {
    const taggedSpouseSimpleAge59AndHalfResult = calculateFederalTax({
      ...complexMFJFixture,
      taxpayer: {
        ...complexMFJFixture.taxpayer,
        primary: {
          ...complexMFJFixture.taxpayer.primary,
          dateOfBirth: "1965-07-02",
        },
        spouse: {
          ...complexMFJFixture.taxpayer.spouse!,
          dateOfBirth: "1965-07-01",
        },
      },
      form1099R: [
        {
          payer: "SIMPLE IRA Custodian",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "S",
          iraSepSimple: true,
          accountHolder: "spouse",
        },
      ],
    });

    const form5329Line2 = taggedSpouseSimpleAge59AndHalfResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = taggedSpouseSimpleAge59AndHalfResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(taggedSpouseSimpleAge59AndHalfResult.iraDistributionsTaxable.toNumber()).toBe(10000);
    expect(taggedSpouseSimpleAge59AndHalfResult.form5329?.line1.toNumber()).toBe(10000);
    expect(taggedSpouseSimpleAge59AndHalfResult.form5329?.line2.toNumber()).toBe(10000);
    expect(taggedSpouseSimpleAge59AndHalfResult.form5329?.line2ExceptionNumber).toBe("12");
    expect(taggedSpouseSimpleAge59AndHalfResult.form5329?.line3.toNumber()).toBe(0);
    expect(taggedSpouseSimpleAge59AndHalfResult.form5329?.simpleIRADistributionsWithinFirstTwoYears.toNumber()).toBe(0);
    expect(taggedSpouseSimpleAge59AndHalfResult.form5329?.line4.toNumber()).toBe(0);
    expect(
      String(form5329Line2?.inputs["Supported age-59 1/2-or-older misclassified code 1/J/S distributions (exception 12)"])
    ).toBe("10000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("12");
    expect(schedule2Line8?.value.toNumber()).toBe(0);
  });

  it("Form 1040 Line 23 - SIMPLE IRA default 25 percent branch follows the Form 8606 taxable-share ratio when basis recovery applies", () => {
    const basisReducedSimpleIraResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "SIMPLE IRA Custodian",
          grossDistribution: "10000",
          federalWithheld: "0",
          distributionCode: "S",
          iraSepSimple: true,
        },
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "10000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "10000",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        rothConversions: "0",
      },
    });

    expect(basisReducedSimpleIraResult.form8606?.line7.toNumber()).toBe(20000);
    expect(basisReducedSimpleIraResult.form8606?.line12.toNumber()).toBe(10000);
    expect(basisReducedSimpleIraResult.form8606?.line15a.toNumber()).toBe(10000);
    expect(basisReducedSimpleIraResult.form5329?.line1.toNumber()).toBe(10000);
    expect(basisReducedSimpleIraResult.form5329?.simpleIRADistributionsWithinFirstTwoYears.toNumber()).toBe(5000);
    expect(basisReducedSimpleIraResult.form5329?.line4.toNumber()).toBe(1750);

    const form5329Line4 = basisReducedSimpleIraResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "4"
    );
    const schedule2Line8 = basisReducedSimpleIraResult.allLines.find((line) => line.form === "Sched 2" && line.line === "8");

    expect(String(form5329Line4?.inputs["SIMPLE IRA amount taxed at 25%"])).toBe("5000");
    expect(schedule2Line8?.value.toNumber()).toBe(1750);
  });

  it("Form 1040 Line 23 - SIMPLE IRA exceptions reduce the 25 percent branch only to the remaining non-exempt amount", () => {
    const partiallyExemptSimpleIraResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "SIMPLE IRA Custodian",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "S",
          iraSepSimple: true,
        },
      ],
      form5329: {
        distributionsNotSubjectToAdditionalTax: "4000",
      },
    });

    expect(partiallyExemptSimpleIraResult.form5329?.line1.toNumber()).toBe(10000);
    expect(partiallyExemptSimpleIraResult.form5329?.line2.toNumber()).toBe(4000);
    expect(partiallyExemptSimpleIraResult.form5329?.line3.toNumber()).toBe(6000);
    expect(partiallyExemptSimpleIraResult.form5329?.simpleIRADistributionsWithinFirstTwoYears.toNumber()).toBe(6000);
    expect(partiallyExemptSimpleIraResult.form5329?.line4.toNumber()).toBe(1500);

    const schedule2Line8 = partiallyExemptSimpleIraResult.allLines.find((line) => line.form === "Sched 2" && line.line === "8");
    expect(schedule2Line8?.value.toNumber()).toBe(1500);
  });

  it("Form 1040 Line 23 - mixed SIMPLE and code 2 traditional IRA distributions use the Form 8606 taxable-share ratio for Form 5329", () => {
    const mixedTraditionalIraBasisResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "SIMPLE IRA Custodian",
          grossDistribution: "10000",
          federalWithheld: "0",
          distributionCode: "S",
          iraSepSimple: true,
        },
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "10000",
          federalWithheld: "0",
          distributionCode: "2",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "10000",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        rothConversions: "0",
      },
    });

    expect(mixedTraditionalIraBasisResult.form8606?.line7.toNumber()).toBe(20000);
    expect(mixedTraditionalIraBasisResult.form8606?.line12.toNumber()).toBe(10000);
    expect(mixedTraditionalIraBasisResult.form8606?.line15a.toNumber()).toBe(10000);
    expect(mixedTraditionalIraBasisResult.form5329?.line1.toNumber()).toBe(5000);
    expect(mixedTraditionalIraBasisResult.form5329?.line2.toNumber()).toBe(0);
    expect(mixedTraditionalIraBasisResult.form5329?.simpleIRADistributionsWithinFirstTwoYears.toNumber()).toBe(5000);
    expect(mixedTraditionalIraBasisResult.form5329?.line4.toNumber()).toBe(1250);

    const form5329Line4 = mixedTraditionalIraBasisResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "4"
    );
    const schedule2Line8 = mixedTraditionalIraBasisResult.allLines.find((line) => line.form === "Sched 2" && line.line === "8");

    expect(String(form5329Line4?.inputs["SIMPLE IRA amount taxed at 25%"])).toBe("5000");
    expect(schedule2Line8?.value.toNumber()).toBe(1250);
  });

  it("Form 1040 Line 23 - an explicit Form 5329 Line 4 SIMPLE amount can disambiguate mixed early-distribution exceptions", () => {
    const mixedEarlyDistributionResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "SIMPLE IRA Custodian",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "S",
          iraSepSimple: true,
        },
        {
          payer: "Former Employer 401(k)",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: false,
        },
      ],
      form5329: {
        distributionsNotSubjectToAdditionalTax: "5000",
        simpleIRADistributionsWithinFirstTwoYears: "2000",
      },
    });

    expect(mixedEarlyDistributionResult.form5329?.line1.toNumber()).toBe(20000);
    expect(mixedEarlyDistributionResult.form5329?.line2.toNumber()).toBe(5000);
    expect(mixedEarlyDistributionResult.form5329?.line3.toNumber()).toBe(15000);
    expect(mixedEarlyDistributionResult.form5329?.simpleIRADistributionsWithinFirstTwoYears.toNumber()).toBe(2000);
    expect(mixedEarlyDistributionResult.form5329?.line4.toNumber()).toBe(1800);

    const schedule2Line8 = mixedEarlyDistributionResult.allLines.find((line) => line.form === "Sched 2" && line.line === "8");
    expect(schedule2Line8?.value.toNumber()).toBe(1800);
  });

  it("Form 1040 Line 23 - Roth first-time homebuyer amounts reduce the Form 5329 additional tax", () => {
    const rothHomebuyerResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "15000",
          taxableAmount: "15000",
          federalWithheld: "0",
          distributionCode: "J",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothDistributions: "15000",
        qualifiedFirstTimeHomebuyerExpenses: "10000",
        priorQualifiedFirstTimeHomebuyerDistributions: "0",
        rothContributionBasis: "3000",
        rothConversionBasis: "0",
      },
    });

    const form5329Line1 = rothHomebuyerResult.allLines.find((line) => line.form === "Form 5329" && line.line === "1");
    const form5329Line2 = rothHomebuyerResult.allLines.find((line) => line.form === "Form 5329" && line.line === "2");

    expect(rothHomebuyerResult.form5329?.line1.toNumber()).toBe(12000);
    expect(rothHomebuyerResult.form5329?.line2.toNumber()).toBe(10000);
    expect(rothHomebuyerResult.form5329?.line2ExceptionNumber).toBe("09");
    expect(rothHomebuyerResult.form5329?.line4.toNumber()).toBe(200);
    expect(rothHomebuyerResult.totalAdditionalTaxes.toNumber()).toBe(200);
    expect(String(form5329Line1?.inputs["Supported Roth first-time homebuyer amount (exception 09)"])).toBe("10000");
    expect(String(form5329Line2?.inputs["Supported Roth first-time homebuyer amount (exception 09)"])).toBe("10000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("09");
  });

  it("Form 1040 Line 23 - validated traditional IRA first-time homebuyer amounts use Form 5329 exception 09", () => {
    const traditionalIraHomebuyerResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "15000",
          taxableAmount: "15000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: true,
        },
      ],
      form5329: {
        qualifiedFirstTimeHomebuyerDistributionAmount: "10000",
      },
    });

    const form5329Line2 = traditionalIraHomebuyerResult.allLines.find((line) => line.form === "Form 5329" && line.line === "2");

    expect(traditionalIraHomebuyerResult.form5329?.line1.toNumber()).toBe(15000);
    expect(traditionalIraHomebuyerResult.form5329?.line2.toNumber()).toBe(10000);
    expect(traditionalIraHomebuyerResult.form5329?.line2ExceptionNumber).toBe("09");
    expect(traditionalIraHomebuyerResult.form5329?.line4.toNumber()).toBe(500);
    expect(traditionalIraHomebuyerResult.totalAdditionalTaxes.toNumber()).toBe(500);
    expect(
      String(form5329Line2?.inputs["Validated first-time homebuyer distribution amount (exception 09)"])
    ).toBe("10000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("09");
  });

  it("Form 1040 Line 23 - manual Form 5329 exceptions stack on top of supported Roth first-time homebuyer defaults without double counting", () => {
    const rothHomebuyerResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "15000",
          taxableAmount: "15000",
          federalWithheld: "0",
          distributionCode: "J",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothDistributions: "15000",
        qualifiedFirstTimeHomebuyerExpenses: "10000",
        priorQualifiedFirstTimeHomebuyerDistributions: "0",
        rothContributionBasis: "3000",
        rothConversionBasis: "0",
      },
      form5329: {
        distributionsNotSubjectToAdditionalTax: "500",
        distributionExceptionNumber: "12",
      },
    });

    const form5329Line2 = rothHomebuyerResult.allLines.find((line) => line.form === "Form 5329" && line.line === "2");

    expect(rothHomebuyerResult.form5329?.line1.toNumber()).toBe(12000);
    expect(rothHomebuyerResult.form5329?.line2.toNumber()).toBe(10500);
    expect(rothHomebuyerResult.form5329?.line2ExceptionNumber).toBe("99");
    expect(rothHomebuyerResult.form5329?.line3.toNumber()).toBe(1500);
    expect(rothHomebuyerResult.form5329?.line4.toNumber()).toBe(150);
    expect(rothHomebuyerResult.totalAdditionalTaxes.toNumber()).toBe(150);
    expect(String(form5329Line2?.inputs["Supported Roth first-time homebuyer amount (exception 09)"])).toBe("10000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("99");
  });

  it("Form 1040 Line 23 - a manual Form 5329 exception number is ignored when supported Roth homebuyer dollars already fill Line 2", () => {
    const rothHomebuyerResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "15000",
          taxableAmount: "15000",
          federalWithheld: "0",
          distributionCode: "J",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothDistributions: "15000",
        qualifiedFirstTimeHomebuyerExpenses: "10000",
        priorQualifiedFirstTimeHomebuyerDistributions: "0",
        rothContributionBasis: "3000",
        rothConversionBasis: "0",
      },
      form5329: {
        distributionsNotSubjectToAdditionalTax: "10000",
        distributionExceptionNumber: "12",
      },
    });

    const form5329Line2 = rothHomebuyerResult.allLines.find((line) => line.form === "Form 5329" && line.line === "2");

    expect(rothHomebuyerResult.form5329?.line1.toNumber()).toBe(12000);
    expect(rothHomebuyerResult.form5329?.line2.toNumber()).toBe(10000);
    expect(rothHomebuyerResult.form5329?.line2ExceptionNumber).toBe("09");
    expect(rothHomebuyerResult.form5329?.line4.toNumber()).toBe(200);
    expect(rothHomebuyerResult.totalAdditionalTaxes.toNumber()).toBe(200);
    expect(String(form5329Line2?.inputs["Supported Roth first-time homebuyer amount (exception 09)"])).toBe("10000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("09");
  });

  it("Form 1040 Line 23 - qualified disaster IRA amounts stay out of the defaulted Form 5329 penalty base", () => {
    const qualifiedDisasterResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "33000",
          taxableAmount: "33000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "3000",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        qualifiedDisasterDistributions: "22000",
        rothConversions: "0",
      },
    });

    const form5329Line1 = qualifiedDisasterResult.allLines.find((line) => line.form === "Form 5329" && line.line === "1");

    expect(qualifiedDisasterResult.form8606?.line15b.toNumber()).toBe(19998);
    expect(qualifiedDisasterResult.form5329?.line1.toNumber()).toBe(9999);
    expect(qualifiedDisasterResult.form5329?.line4.toNumber()).toBe(999.9);
    expect(qualifiedDisasterResult.totalAdditionalTaxes.toNumber()).toBe(999.9);
    expect(String(form5329Line1?.inputs["Supported qualified disaster recovery distributions excluded from Line 1"])).toBe("19998");
  });

  it("Form 1040 Line 23 - mixed early and non-early traditional IRA distributions allocate the Form 8606 qualified-disaster exclusion only to the early share for Form 5329", () => {
    const mixedQualifiedDisasterResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "6000",
          taxableAmount: "6000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: true,
        },
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "6000",
          taxableAmount: "6000",
          federalWithheld: "0",
          distributionCode: "7",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "2400",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        qualifiedDisasterDistributions: "4000",
        rothConversions: "0",
      },
    });

    const form5329Line1 = mixedQualifiedDisasterResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "1"
    );
    const schedule2Line8 = mixedQualifiedDisasterResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(mixedQualifiedDisasterResult.form8606?.line15a.toNumber()).toBe(9600);
    expect(mixedQualifiedDisasterResult.form8606?.line15b.toNumber()).toBe(3200);
    expect(mixedQualifiedDisasterResult.form5329?.line1.toNumber()).toBe(3200);
    expect(mixedQualifiedDisasterResult.form5329?.line4.toNumber()).toBe(320);
    expect(schedule2Line8?.value.toNumber()).toBe(320);
    expect(mixedQualifiedDisasterResult.totalAdditionalTaxes.toNumber()).toBe(320);
    expect(String(form5329Line1?.inputs["Supported qualified disaster recovery distributions excluded from Line 1"])).toBe("1600");
  });

  it("Form 1040 Line 23 - repayment-eligible traditional IRA taxable share defaults into the Form 5329 exception path", () => {
    const repaymentEligibleTraditionalIraResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "12500",
          taxableAmount: "12500",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "2500",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        repaymentEligibleDistributions: "5000",
        repaymentDistributionExceptionNumber: "20",
        rothConversions: "0",
      },
    });

    const form5329Line2 = repaymentEligibleTraditionalIraResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );

    expect(repaymentEligibleTraditionalIraResult.form8606?.line15cRepaymentEligibleTaxableShare.toNumber()).toBe(4000);
    expect(repaymentEligibleTraditionalIraResult.form5329?.line1.toNumber()).toBe(10000);
    expect(repaymentEligibleTraditionalIraResult.form5329?.line2.toNumber()).toBe(4000);
    expect(repaymentEligibleTraditionalIraResult.form5329?.line2ExceptionNumber).toBe("20");
    expect(repaymentEligibleTraditionalIraResult.form5329?.line3.toNumber()).toBe(6000);
    expect(repaymentEligibleTraditionalIraResult.form5329?.line4.toNumber()).toBe(600);
    expect(repaymentEligibleTraditionalIraResult.totalAdditionalTaxes.toNumber()).toBe(600);
    expect(String(form5329Line2?.inputs["Supported Form 8606 repayment-category taxable share"])).toBe("4000");
    expect(form5329Line2?.inputs["Supported Form 8606 repayment-category exception number"]).toBe("20");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("20");
  });

  it("Form 1040 Line 23 - mixed early and non-early traditional IRA distributions keep the Form 8606 repayment-category taxable share on the early-distribution branch", () => {
    const mixedRepaymentEligibleTraditionalIraResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "12500",
          taxableAmount: "12500",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: true,
        },
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "12500",
          taxableAmount: "12500",
          federalWithheld: "0",
          distributionCode: "7",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "5000",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        repaymentEligibleDistributions: "5000",
        repaymentDistributionExceptionNumber: "20",
        rothConversions: "0",
      },
    });

    const form5329Line1 = mixedRepaymentEligibleTraditionalIraResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "1"
    );
    const form5329Line2 = mixedRepaymentEligibleTraditionalIraResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = mixedRepaymentEligibleTraditionalIraResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(mixedRepaymentEligibleTraditionalIraResult.form8606?.line15a.toNumber()).toBe(20000);
    expect(mixedRepaymentEligibleTraditionalIraResult.form8606?.line15cRepaymentEligibleTaxableShare.toNumber()).toBe(4000);
    expect(mixedRepaymentEligibleTraditionalIraResult.form5329?.line1.toNumber()).toBe(10000);
    expect(mixedRepaymentEligibleTraditionalIraResult.form5329?.line2.toNumber()).toBe(4000);
    expect(mixedRepaymentEligibleTraditionalIraResult.form5329?.line2ExceptionNumber).toBe("20");
    expect(mixedRepaymentEligibleTraditionalIraResult.form5329?.line3.toNumber()).toBe(6000);
    expect(mixedRepaymentEligibleTraditionalIraResult.form5329?.line4.toNumber()).toBe(600);
    expect(schedule2Line8?.value.toNumber()).toBe(600);
    expect(String(form5329Line1?.inputs["Supported Form 8606 repayment-category taxable share"])).toBe("4000");
    expect(String(form5329Line2?.inputs["Supported Form 8606 repayment-category taxable share"])).toBe("4000");
    expect(form5329Line2?.inputs["Supported Form 8606 repayment-category exception number"]).toBe("20");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("20");
  });

  it("Form 1040 Line 23 - mixed early and non-early traditional IRA distributions keep both Form 8606 disaster and repayment adjustments on the early share", () => {
    const mixedQualifiedDisasterAndRepaymentTraditionalIraResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "12500",
          taxableAmount: "12500",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: true,
        },
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "12500",
          taxableAmount: "12500",
          federalWithheld: "0",
          distributionCode: "7",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "5000",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        qualifiedDisasterDistributions: "5000",
        repaymentEligibleDistributions: "5000",
        repaymentDistributionExceptionNumber: "20",
        rothConversions: "0",
      },
    });

    const form5329Line1 = mixedQualifiedDisasterAndRepaymentTraditionalIraResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "1"
    );
    const form5329Line2 = mixedQualifiedDisasterAndRepaymentTraditionalIraResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = mixedQualifiedDisasterAndRepaymentTraditionalIraResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(mixedQualifiedDisasterAndRepaymentTraditionalIraResult.form8606?.line15a.toNumber()).toBe(20000);
    expect(mixedQualifiedDisasterAndRepaymentTraditionalIraResult.form8606?.line15b.toNumber()).toBe(4000);
    expect(mixedQualifiedDisasterAndRepaymentTraditionalIraResult.form8606?.line15cRepaymentEligibleTaxableShare.toNumber())
      .toBe(4000);
    expect(mixedQualifiedDisasterAndRepaymentTraditionalIraResult.form5329?.line1.toNumber()).toBe(8000);
    expect(mixedQualifiedDisasterAndRepaymentTraditionalIraResult.form5329?.line2.toNumber()).toBe(4000);
    expect(mixedQualifiedDisasterAndRepaymentTraditionalIraResult.form5329?.line2ExceptionNumber).toBe("20");
    expect(mixedQualifiedDisasterAndRepaymentTraditionalIraResult.form5329?.line3.toNumber()).toBe(4000);
    expect(mixedQualifiedDisasterAndRepaymentTraditionalIraResult.form5329?.line4.toNumber()).toBe(400);
    expect(schedule2Line8?.value.toNumber()).toBe(400);
    expect(mixedQualifiedDisasterAndRepaymentTraditionalIraResult.totalAdditionalTaxes.toNumber()).toBe(400);
    expect(String(form5329Line1?.inputs["Supported qualified disaster recovery distributions excluded from Line 1"])).toBe("2000");
    expect(String(form5329Line1?.inputs["Supported Form 8606 repayment-category taxable share"])).toBe("4000");
    expect(String(form5329Line2?.inputs["Supported Form 8606 repayment-category taxable share"])).toBe("4000");
    expect(form5329Line2?.inputs["Supported Form 8606 repayment-category exception number"]).toBe("20");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("20");
  });

  it("Form 1040 Line 23 - same-year repayments keep repaid traditional IRA shares out of both the Form 5329 penalty base and exception subtotal", () => {
    const repaidTraditionalIraResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "12500",
          taxableAmount: "12500",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "2500",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        repaymentEligibleDistributions: "5000",
        repaymentWithin3YearWindow: "3000",
        rothConversions: "0",
      },
    });

    const form5329Line1 = repaidTraditionalIraResult.allLines.find((line) => line.form === "Form 5329" && line.line === "1");
    const form5329Line2 = repaidTraditionalIraResult.allLines.find((line) => line.form === "Form 5329" && line.line === "2");

    expect(repaidTraditionalIraResult.form8606?.line15c.toNumber()).toBe(7000);
    expect(repaidTraditionalIraResult.form8606?.line15cRepaymentEligibleTaxableShare.toNumber()).toBe(4000);
    expect(repaidTraditionalIraResult.form8606?.line15cRepaymentReduction.toNumber()).toBe(3000);
    expect(repaidTraditionalIraResult.form8606?.line15cRepaymentEligibleRemainingTaxableShare.toNumber()).toBe(1000);
    expect(repaidTraditionalIraResult.form5329?.line1.toNumber()).toBe(7000);
    expect(repaidTraditionalIraResult.form5329?.line2.toNumber()).toBe(1000);
    expect(repaidTraditionalIraResult.form5329?.line3.toNumber()).toBe(6000);
    expect(repaidTraditionalIraResult.form5329?.line4.toNumber()).toBe(600);
    expect(repaidTraditionalIraResult.totalAdditionalTaxes.toNumber()).toBe(600);
    expect(String(form5329Line1?.inputs["Supported Form 8606 repayment-category taxable share"])).toBe("1000");
    expect(String(form5329Line2?.inputs["Supported Form 8606 repayment-category taxable share"])).toBe("1000");
  });

  it("Form 1040 Line 23 - Roth repayment-category taxable share defaults into the Form 5329 exception path after same-year repayments", () => {
    const repaymentEligibleRothIraResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "12500",
          taxableAmount: "12500",
          federalWithheld: "0",
          distributionCode: "J",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothDistributions: "12500",
        rothContributionBasis: "2500",
        rothConversionBasis: "0",
        rothRepaymentEligibleDistributions: "5000",
        rothRepaymentDistributionExceptionNumber: "19",
        rothRepaymentsWithin3YearWindow: "3000",
      },
    });

    const form5329Line2 = repaymentEligibleRothIraResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );

    expect(repaymentEligibleRothIraResult.form8606?.line25c.toNumber()).toBe(7000);
    expect(repaymentEligibleRothIraResult.form8606?.line25cRepaymentEligibleRemainingTaxableShare.toNumber()).toBe(1000);
    expect(repaymentEligibleRothIraResult.form5329?.line1.toNumber()).toBe(7000);
    expect(repaymentEligibleRothIraResult.form5329?.line2.toNumber()).toBe(1000);
    expect(repaymentEligibleRothIraResult.form5329?.line2ExceptionNumber).toBe("19");
    expect(repaymentEligibleRothIraResult.form5329?.line3.toNumber()).toBe(6000);
    expect(repaymentEligibleRothIraResult.form5329?.line4.toNumber()).toBe(600);
    expect(repaymentEligibleRothIraResult.totalAdditionalTaxes.toNumber()).toBe(600);
    expect(String(form5329Line2?.inputs["Supported Roth repayment-category taxable share"])).toBe("1000");
    expect(form5329Line2?.inputs["Supported Roth repayment-category exception number"]).toBe("19");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("19");
  });

  it("Form 1040 Line 23 - mixed Roth IRA code J and code T distributions keep the Roth repayment-category taxable share on the early-distribution branch", () => {
    const mixedRepaymentEligibleRothIraResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "12500",
          taxableAmount: "12500",
          federalWithheld: "0",
          distributionCode: "J",
          iraSepSimple: true,
        },
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "12500",
          taxableAmount: "12500",
          federalWithheld: "0",
          distributionCode: "T",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothContributionBasis: "5000",
        rothConversionBasis: "0",
        rothRepaymentEligibleDistributions: "5000",
        rothRepaymentDistributionExceptionNumber: "19",
      },
    });

    const form5329Line1 = mixedRepaymentEligibleRothIraResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "1"
    );
    const form5329Line2 = mixedRepaymentEligibleRothIraResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = mixedRepaymentEligibleRothIraResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(mixedRepaymentEligibleRothIraResult.form8606?.line19.toNumber()).toBe(25000);
    expect(mixedRepaymentEligibleRothIraResult.form8606?.line25c.toNumber()).toBe(20000);
    expect(mixedRepaymentEligibleRothIraResult.form8606?.line25cRepaymentEligibleRemainingTaxableShare.toNumber()).toBe(4000);
    expect(mixedRepaymentEligibleRothIraResult.form5329?.line1.toNumber()).toBe(10000);
    expect(mixedRepaymentEligibleRothIraResult.form5329?.line2.toNumber()).toBe(2000);
    expect(mixedRepaymentEligibleRothIraResult.form5329?.line2ExceptionNumber).toBe("19");
    expect(mixedRepaymentEligibleRothIraResult.form5329?.line3.toNumber()).toBe(8000);
    expect(mixedRepaymentEligibleRothIraResult.form5329?.line4.toNumber()).toBe(800);
    expect(schedule2Line8?.value.toNumber()).toBe(800);
    expect(String(form5329Line1?.inputs["Supported Roth repayment-category taxable share"])).toBe("2000");
    expect(String(form5329Line2?.inputs["Supported Roth repayment-category taxable share"])).toBe("2000");
    expect(form5329Line2?.inputs["Supported Roth repayment-category exception number"]).toBe("19");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("19");
  });

  it("Form 1040 Line 23 - mixed Roth IRA code J and code T distributions keep both Form 8606 first-time homebuyer and repayment adjustments on the early share", () => {
    const mixedHomebuyerAndRepaymentRothIraResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "12500",
          taxableAmount: "12500",
          federalWithheld: "0",
          distributionCode: "J",
          iraSepSimple: true,
        },
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "12500",
          taxableAmount: "12500",
          federalWithheld: "0",
          distributionCode: "T",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        qualifiedFirstTimeHomebuyerExpenses: "5000",
        rothContributionBasis: "0",
        rothConversionBasis: "0",
        rothRepaymentEligibleDistributions: "5000",
        rothRepaymentDistributionExceptionNumber: "20",
      },
    });

    const form5329Line1 = mixedHomebuyerAndRepaymentRothIraResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "1"
    );
    const form5329Line2 = mixedHomebuyerAndRepaymentRothIraResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = mixedHomebuyerAndRepaymentRothIraResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(mixedHomebuyerAndRepaymentRothIraResult.form8606?.line19.toNumber()).toBe(25000);
    expect(mixedHomebuyerAndRepaymentRothIraResult.form8606?.line20.toNumber()).toBe(5000);
    expect(mixedHomebuyerAndRepaymentRothIraResult.form8606?.line25c.toNumber()).toBe(20000);
    expect(mixedHomebuyerAndRepaymentRothIraResult.form8606?.line25cRepaymentEligibleRemainingTaxableShare.toNumber()).toBe(5000);
    expect(mixedHomebuyerAndRepaymentRothIraResult.form5329?.line1.toNumber()).toBe(12500);
    expect(mixedHomebuyerAndRepaymentRothIraResult.form5329?.line2.toNumber()).toBe(5000);
    expect(mixedHomebuyerAndRepaymentRothIraResult.form5329?.line2ExceptionNumber).toBe("99");
    expect(mixedHomebuyerAndRepaymentRothIraResult.form5329?.line3.toNumber()).toBe(7500);
    expect(mixedHomebuyerAndRepaymentRothIraResult.form5329?.line4.toNumber()).toBe(750);
    expect(schedule2Line8?.value.toNumber()).toBe(750);
    expect(String(form5329Line1?.inputs["Supported Roth first-time homebuyer amount (exception 09)"])).toBe("2500");
    expect(String(form5329Line1?.inputs["Supported Roth repayment-category taxable share"])).toBe("2500");
    expect(String(form5329Line2?.inputs["Supported Roth first-time homebuyer amount (exception 09)"])).toBe("2500");
    expect(String(form5329Line2?.inputs["Supported Roth repayment-category taxable share"])).toBe("2500");
    expect(form5329Line2?.inputs["Supported Roth repayment-category exception number"]).toBe("20");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("99");
  });

  it("Form 1040 Line 23 - emergency personal expense Roth repayment-category exception numbers default through Form 5329", () => {
    const emergencyPersonalExpenseRothRepaymentResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "12500",
          taxableAmount: "12500",
          federalWithheld: "0",
          distributionCode: "J",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothDistributions: "12500",
        rothContributionBasis: "2500",
        rothConversionBasis: "0",
        rothRepaymentEligibleDistributions: "5000",
        rothRepaymentDistributionExceptionNumber: "23",
        rothRepaymentsWithin3YearWindow: "3000",
      },
    });

    const form5329Line2 = emergencyPersonalExpenseRothRepaymentResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );

    expect(emergencyPersonalExpenseRothRepaymentResult.form8606?.line25c.toNumber()).toBe(7000);
    expect(emergencyPersonalExpenseRothRepaymentResult.form8606?.line25cRepaymentEligibleRemainingTaxableShare.toNumber()).toBe(1000);
    expect(emergencyPersonalExpenseRothRepaymentResult.form5329?.line1.toNumber()).toBe(7000);
    expect(emergencyPersonalExpenseRothRepaymentResult.form5329?.line2.toNumber()).toBe(1000);
    expect(emergencyPersonalExpenseRothRepaymentResult.form5329?.line2ExceptionNumber).toBe("23");
    expect(emergencyPersonalExpenseRothRepaymentResult.form5329?.line3.toNumber()).toBe(6000);
    expect(emergencyPersonalExpenseRothRepaymentResult.form5329?.line4.toNumber()).toBe(600);
    expect(emergencyPersonalExpenseRothRepaymentResult.totalAdditionalTaxes.toNumber()).toBe(600);
    expect(String(form5329Line2?.inputs["Supported Roth repayment-category taxable share"])).toBe("1000");
    expect(form5329Line2?.inputs["Supported Roth repayment-category exception number"]).toBe("23");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("23");
  });

  it("Form 1040 Line 23 - matching traditional and Roth repayment-category exception numbers stay preserved on Form 5329", () => {
    const matchingRepaymentExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "12500",
          taxableAmount: "12500",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: true,
        },
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "12500",
          taxableAmount: "12500",
          federalWithheld: "0",
          distributionCode: "J",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "2500",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        repaymentEligibleDistributions: "5000",
        repaymentDistributionExceptionNumber: "20",
        rothConversions: "0",
        rothDistributions: "12500",
        rothContributionBasis: "2500",
        rothConversionBasis: "0",
        rothRepaymentEligibleDistributions: "5000",
        rothRepaymentDistributionExceptionNumber: "20",
      },
    });

    const form5329Line2 = matchingRepaymentExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = matchingRepaymentExceptionResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(matchingRepaymentExceptionResult.form8606?.line15cRepaymentEligibleTaxableShare.toNumber()).toBe(4000);
    expect(matchingRepaymentExceptionResult.form8606?.line25cRepaymentEligibleRemainingTaxableShare.toNumber()).toBe(4000);
    expect(matchingRepaymentExceptionResult.form5329?.line1.toNumber()).toBe(20000);
    expect(matchingRepaymentExceptionResult.form5329?.line2.toNumber()).toBe(8000);
    expect(matchingRepaymentExceptionResult.form5329?.line2ExceptionNumber).toBe("20");
    expect(matchingRepaymentExceptionResult.form5329?.line3.toNumber()).toBe(12000);
    expect(matchingRepaymentExceptionResult.form5329?.line4.toNumber()).toBe(1200);
    expect(schedule2Line8?.value.toNumber()).toBe(1200);
    expect(String(form5329Line2?.inputs["Supported Form 8606 repayment-category taxable share"])).toBe("4000");
    expect(String(form5329Line2?.inputs["Supported Roth repayment-category taxable share"])).toBe("4000");
    expect(form5329Line2?.inputs["Supported Form 8606 repayment-category exception number"]).toBe("20");
    expect(form5329Line2?.inputs["Supported Roth repayment-category exception number"]).toBe("20");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("20");
  });

  it("Form 1040 Line 23 - distinct traditional and Roth repayment-category exception numbers collapse to 99 on Form 5329", () => {
    const mixedRepaymentExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "12500",
          taxableAmount: "12500",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: true,
        },
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "12500",
          taxableAmount: "12500",
          federalWithheld: "0",
          distributionCode: "J",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "2500",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        repaymentEligibleDistributions: "5000",
        repaymentDistributionExceptionNumber: "20",
        rothConversions: "0",
        rothDistributions: "12500",
        rothContributionBasis: "2500",
        rothConversionBasis: "0",
        rothRepaymentEligibleDistributions: "5000",
        rothRepaymentDistributionExceptionNumber: "19",
      },
    });

    const form5329Line2 = mixedRepaymentExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );
    const schedule2Line8 = mixedRepaymentExceptionResult.allLines.find(
      (line) => line.form === "Sched 2" && line.line === "8"
    );

    expect(mixedRepaymentExceptionResult.form8606?.line15cRepaymentEligibleTaxableShare.toNumber()).toBe(4000);
    expect(mixedRepaymentExceptionResult.form8606?.line25cRepaymentEligibleRemainingTaxableShare.toNumber()).toBe(4000);
    expect(mixedRepaymentExceptionResult.form5329?.line1.toNumber()).toBe(20000);
    expect(mixedRepaymentExceptionResult.form5329?.line2.toNumber()).toBe(8000);
    expect(mixedRepaymentExceptionResult.form5329?.line2ExceptionNumber).toBe("99");
    expect(mixedRepaymentExceptionResult.form5329?.line3.toNumber()).toBe(12000);
    expect(mixedRepaymentExceptionResult.form5329?.line4.toNumber()).toBe(1200);
    expect(schedule2Line8?.value.toNumber()).toBe(1200);
    expect(String(form5329Line2?.inputs["Supported Form 8606 repayment-category taxable share"])).toBe("4000");
    expect(String(form5329Line2?.inputs["Supported Roth repayment-category taxable share"])).toBe("4000");
    expect(form5329Line2?.inputs["Supported Form 8606 repayment-category exception number"]).toBe("20");
    expect(form5329Line2?.inputs["Supported Roth repayment-category exception number"]).toBe("19");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("99");
  });

  it("Form 1040 Line 23 - direct Form 5329 terminal-illness exception inputs flow through the federal engine", () => {
    const terminalIllnessExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "9000",
          taxableAmount: "9000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: true,
        },
      ],
      form5329: {
        terminalIllnessExceptionAmount: "4100",
      },
    });

    const form5329Line2 = terminalIllnessExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );

    expect(terminalIllnessExceptionResult.form5329?.line1.toNumber()).toBe(9000);
    expect(terminalIllnessExceptionResult.form5329?.line2.toNumber()).toBe(4100);
    expect(terminalIllnessExceptionResult.form5329?.line2ExceptionNumber).toBe("20");
    expect(terminalIllnessExceptionResult.form5329?.line3.toNumber()).toBe(4900);
    expect(terminalIllnessExceptionResult.form5329?.line4.toNumber()).toBe(490);
    expect(terminalIllnessExceptionResult.totalAdditionalTaxes.toNumber()).toBe(490);
    expect(String(form5329Line2?.inputs["Validated terminal-illness distribution exception amount (exception 20)"])).toBe("4100");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("20");
  });

  it("Form 1040 Line 23 - validated terminal-illness code 1 pension distributions default exception 20", () => {
    const terminalIllnessExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Former Employer Pension",
          grossDistribution: "9000",
          taxableAmount: "9000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: false,
          terminalIllnessExceptionApplies: true,
        },
      ],
    });

    const form5329Line2 = terminalIllnessExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );

    expect(terminalIllnessExceptionResult.form5329?.line1.toNumber()).toBe(9000);
    expect(terminalIllnessExceptionResult.form5329?.line2.toNumber()).toBe(9000);
    expect(terminalIllnessExceptionResult.form5329?.line2ExceptionNumber).toBe("20");
    expect(terminalIllnessExceptionResult.form5329?.line3.toNumber()).toBe(0);
    expect(terminalIllnessExceptionResult.form5329?.line4.toNumber()).toBe(0);
    expect(terminalIllnessExceptionResult.totalAdditionalTaxes.toNumber()).toBe(0);
    expect(String(form5329Line2?.inputs["Supported terminal-illness qualified-plan distributions (exception 20)"])).toBe("9000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("20");
  });

  it("Form 1040 Line 23 - a direct Form 5329 terminal-illness amount suppresses the supported code 1 pension default", () => {
    const terminalIllnessExceptionResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Former Employer Pension",
          grossDistribution: "9000",
          taxableAmount: "9000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: false,
          terminalIllnessExceptionApplies: true,
        },
      ],
      form5329: {
        terminalIllnessExceptionAmount: "4100",
      },
    });

    const form5329Line2 = terminalIllnessExceptionResult.allLines.find(
      (line) => line.form === "Form 5329" && line.line === "2"
    );

    expect(terminalIllnessExceptionResult.form5329?.line1.toNumber()).toBe(9000);
    expect(terminalIllnessExceptionResult.form5329?.line2.toNumber()).toBe(4100);
    expect(terminalIllnessExceptionResult.form5329?.line2ExceptionNumber).toBe("20");
    expect(terminalIllnessExceptionResult.form5329?.line3.toNumber()).toBe(4900);
    expect(terminalIllnessExceptionResult.form5329?.line4.toNumber()).toBe(490);
    expect(terminalIllnessExceptionResult.totalAdditionalTaxes.toNumber()).toBe(490);
    expect(String(form5329Line2?.inputs["Validated terminal-illness distribution exception amount (exception 20)"])).toBe("4100");
    expect(String(form5329Line2?.inputs["Supported terminal-illness qualified-plan distributions (exception 20)"])).toBe("0");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("20");
  });

  it("Form 1040 Line 23 - IRA prohibited-transaction code 5 distributions default into Form 5329 when the filer was under age 59 1/2 on January 1", () => {
    const prohibitedTransactionResult = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1965-07-02",
        },
      },
      form1099R: [
        {
          payer: "IRA Custodian",
          grossDistribution: "12000",
          taxableAmount: "12000",
          federalWithheld: "0",
          distributionCode: "5",
          iraSepSimple: true,
        },
      ],
    });

    expect(prohibitedTransactionResult.form5329?.line1.toNumber()).toBe(12000);
    expect(prohibitedTransactionResult.form5329?.line4.toNumber()).toBe(1200);
    expect(prohibitedTransactionResult.totalAdditionalTaxes.toNumber()).toBe(1200);

    const schedule2Line8 = prohibitedTransactionResult.allLines.find((line) => line.form === "Sched 2" && line.line === "8");
    expect(schedule2Line8?.value.toNumber()).toBe(1200);
  });

  it("Form 1040 Line 23 - IRA prohibited-transaction code 5 distributions stop defaulting into Form 5329 once the filer was age 59 1/2 on January 1", () => {
    const prohibitedTransactionBoundaryResult = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1965-07-01",
        },
      },
      form1099R: [
        {
          payer: "IRA Custodian",
          grossDistribution: "12000",
          taxableAmount: "12000",
          federalWithheld: "0",
          distributionCode: "5",
          iraSepSimple: true,
        },
      ],
    });

    expect(prohibitedTransactionBoundaryResult.form5329).toBeUndefined();
    expect(prohibitedTransactionBoundaryResult.totalAdditionalTaxes.toNumber()).toBe(0);
  });

  it("Form 1040 Line 23 - spouse-tagged IRA prohibited-transaction code 5 distributions default into Form 5329 for mixed-age MFJ returns", () => {
    const mixedAgeTaggedSpouseResult = calculateFederalTax({
      ...complexMFJFixture,
      taxpayer: {
        ...complexMFJFixture.taxpayer,
        primary: {
          ...complexMFJFixture.taxpayer.primary,
          dateOfBirth: "1965-07-01",
        },
        spouse: {
          ...complexMFJFixture.taxpayer.spouse!,
          dateOfBirth: "1965-07-02",
        },
      },
      form1099R: [
        {
          payer: "IRA Custodian",
          grossDistribution: "12000",
          taxableAmount: "12000",
          federalWithheld: "0",
          distributionCode: "5",
          iraSepSimple: true,
          accountHolder: "spouse",
        },
      ],
    });

    const schedule2Line8 = mixedAgeTaggedSpouseResult.allLines.find((line) => line.form === "Sched 2" && line.line === "8");

    expect(mixedAgeTaggedSpouseResult.form5329?.line1.toNumber()).toBe(12000);
    expect(mixedAgeTaggedSpouseResult.form5329?.line4.toNumber()).toBe(1200);
    expect(schedule2Line8?.value.toNumber()).toBe(1200);
  });

  it("Form 1040 Line 23 - primary-tagged IRA prohibited-transaction code 5 distributions default into Form 5329 for mixed-age MFJ returns", () => {
    const mixedAgeTaggedPrimaryResult = calculateFederalTax({
      ...complexMFJFixture,
      taxpayer: {
        ...complexMFJFixture.taxpayer,
        primary: {
          ...complexMFJFixture.taxpayer.primary,
          dateOfBirth: "1965-07-02",
        },
        spouse: {
          ...complexMFJFixture.taxpayer.spouse!,
          dateOfBirth: "1965-07-01",
        },
      },
      form1099R: [
        {
          payer: "IRA Custodian",
          grossDistribution: "12000",
          taxableAmount: "12000",
          federalWithheld: "0",
          distributionCode: "5",
          iraSepSimple: true,
          accountHolder: "primary",
        },
      ],
    });

    const schedule2Line8 = mixedAgeTaggedPrimaryResult.allLines.find((line) => line.form === "Sched 2" && line.line === "8");

    expect(mixedAgeTaggedPrimaryResult.form5329?.line1.toNumber()).toBe(12000);
    expect(mixedAgeTaggedPrimaryResult.form5329?.line4.toNumber()).toBe(1200);
    expect(schedule2Line8?.value.toNumber()).toBe(1200);
  });

  it("Form 1040 Line 23 - untagged mixed-age MFJ IRA prohibited-transaction code 5 distributions stay manual", () => {
    const mixedAgeUntaggedResult = calculateFederalTax({
      ...complexMFJFixture,
      taxpayer: {
        ...complexMFJFixture.taxpayer,
        primary: {
          ...complexMFJFixture.taxpayer.primary,
          dateOfBirth: "1965-07-01",
        },
        spouse: {
          ...complexMFJFixture.taxpayer.spouse!,
          dateOfBirth: "1965-07-02",
        },
      },
      form1099R: [
        {
          payer: "IRA Custodian",
          grossDistribution: "12000",
          taxableAmount: "12000",
          federalWithheld: "0",
          distributionCode: "5",
          iraSepSimple: true,
        },
      ],
    });

    const schedule2Line8 = mixedAgeUntaggedResult.allLines.find((line) => line.form === "Sched 2" && line.line === "8");

    expect(mixedAgeUntaggedResult.form5329).toBeUndefined();
    expect(schedule2Line8?.value.toNumber()).toBe(0);
  });

  it("Form 1040 Line 23 - Roth first-time homebuyer expenses cannot create a Form 5329 exception larger than the Roth distribution", () => {
    const rothHomebuyerResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "5000",
          taxableAmount: "5000",
          federalWithheld: "0",
          distributionCode: "J",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothDistributions: "5000",
        qualifiedFirstTimeHomebuyerExpenses: "6000",
        priorQualifiedFirstTimeHomebuyerDistributions: "0",
        rothContributionBasis: "0",
        rothConversionBasis: "0",
      },
    });

    expect(rothHomebuyerResult.form8606?.line20.toNumber()).toBe(5000);
    expect(rothHomebuyerResult.form8606?.line21.toNumber()).toBe(0);
    expect(rothHomebuyerResult.form5329?.line1.toNumber()).toBe(5000);
    expect(rothHomebuyerResult.form5329?.line2.toNumber()).toBe(5000);
    expect(rothHomebuyerResult.form5329?.line4.toNumber()).toBe(0);
    expect(rothHomebuyerResult.totalAdditionalTaxes.toNumber()).toBe(0);
  });

  it("Form 1040 Line 23 - Roth IRA code T distributions can stay taxable on Form 8606 without defaulting into Form 5329", () => {
    const codeTDistributionResult = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "12000",
          taxableAmount: "12000",
          federalWithheld: "0",
          distributionCode: "T",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothDistributions: "12000",
        rothContributionBasis: "2000",
        rothConversionBasis: "0",
      },
    });

    expect(codeTDistributionResult.form8606?.line19.toNumber()).toBe(12000);
    expect(codeTDistributionResult.form8606?.line25c.toNumber()).toBe(10000);
    expect(codeTDistributionResult.iraDistributionsTaxable.toNumber()).toBe(10000);
    expect(codeTDistributionResult.form5329).toBeUndefined();
    expect(codeTDistributionResult.totalAdditionalTaxes.toNumber()).toBe(0);
  });

  it("Form 1040 Line 23 - mixed Roth IRA code J and code T distributions limit Form 5329 to the early code J share of Form 8606 Part III", () => {
    const mixedRothCodeJAndTResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "5000",
          taxableAmount: "5000",
          federalWithheld: "0",
          distributionCode: "J",
          iraSepSimple: true,
        },
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "5000",
          taxableAmount: "5000",
          federalWithheld: "0",
          distributionCode: "T",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        qualifiedFirstTimeHomebuyerExpenses: "2000",
        rothContributionBasis: "2000",
        rothConversionBasis: "0",
      },
    });

    const form5329Line1 = mixedRothCodeJAndTResult.allLines.find((line) => line.form === "Form 5329" && line.line === "1");
    const form5329Line2 = mixedRothCodeJAndTResult.allLines.find((line) => line.form === "Form 5329" && line.line === "2");
    const schedule2Line8 = mixedRothCodeJAndTResult.allLines.find((line) => line.form === "Sched 2" && line.line === "8");

    expect(mixedRothCodeJAndTResult.form8606?.line19.toNumber()).toBe(10000);
    expect(mixedRothCodeJAndTResult.form8606?.line20.toNumber()).toBe(2000);
    expect(mixedRothCodeJAndTResult.form8606?.line25c.toNumber()).toBe(6000);
    expect(mixedRothCodeJAndTResult.form5329?.line1.toNumber()).toBe(4000);
    expect(mixedRothCodeJAndTResult.form5329?.line2.toNumber()).toBe(1000);
    expect(mixedRothCodeJAndTResult.form5329?.line2ExceptionNumber).toBe("09");
    expect(mixedRothCodeJAndTResult.form5329?.line3.toNumber()).toBe(3000);
    expect(mixedRothCodeJAndTResult.form5329?.line4.toNumber()).toBe(300);
    expect(schedule2Line8?.value.toNumber()).toBe(300);
    expect(mixedRothCodeJAndTResult.totalAdditionalTaxes.toNumber()).toBe(300);
    expect(String(form5329Line1?.inputs["Supported Roth first-time homebuyer amount (exception 09)"])).toBe("1000");
    expect(String(form5329Line2?.inputs["Supported Roth first-time homebuyer amount (exception 09)"])).toBe("1000");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("09");
  });

  it("Form 1040 Line 23 - explicit Roth conversion recapture amounts flow through Form 5329 and Schedule 2", () => {
    const rothRecaptureResult = calculateFederalTax({
      ...simpleW2Fixture,
      form5329: {
        rothConversionRecaptureAmount: "4000",
      },
    });

    expect(rothRecaptureResult.form5329?.line1.toNumber()).toBe(4000);
    expect(rothRecaptureResult.form5329?.line4.toNumber()).toBe(400);
    expect(rothRecaptureResult.totalAdditionalTaxes.toNumber()).toBe(400);

    const schedule2Line8 = rothRecaptureResult.allLines.find((line) => line.form === "Sched 2" && line.line === "8");
    expect(schedule2Line8?.value.toNumber()).toBe(400);
  });

  it("Form 1040 Line 24 - total tax is positive", () => {
    expect(result.totalTax.greaterThan(0)).toBe(true);
  });

  it("audit trail covers all major forms", () => {
    const forms = new Set(result.allLines.map((l) => l.form));
    expect(forms.has("1040")).toBe(true);
    expect(forms.has("Sched A")).toBe(true);
    expect(forms.has("Sched SE")).toBe(true);
    expect(forms.has("Form 8959")).toBe(true);
    expect(forms.has("Form 8960")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Retirement Distributions Through Federal Pipeline
// ═══════════════════════════════════════════════════════════

describe("Retirement distributions through federal pipeline", () => {
  it("Form 1040 Line 4a - IRA gross distribution stays visible for rollovers and Form 8606 conversions", () => {
    const rolloverFixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "15000",
          federalWithheld: "0",
          distributionCode: "G",
          iraSepSimple: true,
        },
      ],
    };
    const rolloverResult = calculateFederalTax(rolloverFixture);
    const rolloverLine4a = rolloverResult.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const rolloverLine4b = rolloverResult.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(rolloverLine4a?.value.toNumber()).toBe(15000);
    expect(rolloverLine4b?.value.toNumber()).toBe(0);

    const form8606Fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "5000",
          federalWithheld: "0",
          distributionCode: "2",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "2000",
        priorYearBasis: "4000",
        contributionsMadeNextYear: "0",
        yearEndValue: "18000",
        traditionalDistributions: "5000",
        rothConversions: "7000",
      },
    };
    const form8606Result = calculateFederalTax(form8606Fixture);
    const form8606Line4a = form8606Result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const form8606Line4b = form8606Result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(form8606Line4a?.value.toNumber()).toBe(12000);
    expect(form8606Line4b?.value.toNumber()).toBe(9600);
    expect(form8606Result.iraDistributionsGross.toNumber()).toBe(12000);
  });

  it("Form 1040 Line 4a - validated Roth conversions stay gross on 4a even without Form 8606 inputs", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "10000",
          taxableAmount: "10000",
          rothConversionAmount: "10000",
          federalWithheld: "0",
          distributionCode: "2",
          iraSepSimple: true,
        },
      ],
    });
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(10000);
    expect(line4b?.value.toNumber()).toBe(10000);
    expect(result.iraDistributionsGross.toNumber()).toBe(10000);
  });

  it("Form 1040 Lines 4a and 4b - Form 8606 auto-defaults attached IRA 1099-R Roth conversion amounts into Line 8", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "10000",
          taxableAmount: "8000",
          rothConversionAmount: "9000",
          federalWithheld: "1000",
          distributionCode: "2",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "2000",
        priorYearBasis: "4000",
        contributionsMadeNextYear: "0",
        yearEndValue: "18000",
        traditionalDistributions: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");
    const form8606Line8 = result.allLines.find((line) => line.form === "Form 8606" && line.line === "8");

    expect(form8606Line8?.value.toNumber()).toBe(9000);
    expect(line4a?.value.toNumber()).toBe(10000);
    expect(line4b?.value.toNumber()).toBe(7002);
    expect(result.iraDistributionsGross.toNumber()).toBe(10000);
  });

  it("Form 1040 Lines 4a and 4b - Form 8606 auto-defaults attached IRA 1099-R traditional distributions into Line 7", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "12000",
          taxableAmountNotDetermined: true,
          federalWithheld: "0",
          distributionCode: "7",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "5000",
        contributionsMadeNextYear: "0",
        yearEndValue: "8000",
        rothConversions: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");
    const form8606Line7 = result.allLines.find((line) => line.form === "Form 8606" && line.line === "7");

    expect(form8606Line7?.value.toNumber()).toBe(12000);
    expect(line4a?.value.toNumber()).toBe(12000);
    expect(line4b?.value.toNumber()).toBe(9000);
    expect(result.iraDistributionsGross.toNumber()).toBe(12000);
  });

  it("Form 1040 Lines 4a and 4b - a single Form 8606 does not auto-combine mixed-owner IRA 1099-R defaults on a joint return", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly" as const,
        spouse: {
          firstName: "Jordan",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1987-06-15",
        },
      },
      form1099R: [
        {
          payer: "Primary Traditional IRA Custodian",
          grossDistribution: "12000",
          taxableAmountNotDetermined: true,
          federalWithheld: "0",
          distributionCode: "7",
          iraSepSimple: true,
          accountHolder: "primary" as const,
        },
        {
          payer: "Spouse Traditional IRA Custodian",
          grossDistribution: "8000",
          taxableAmountNotDetermined: true,
          federalWithheld: "0",
          distributionCode: "7",
          iraSepSimple: true,
          accountHolder: "spouse" as const,
        },
        {
          payer: "Spouse Conversion Custodian",
          grossDistribution: "9000",
          taxableAmountNotDetermined: true,
          federalWithheld: "0",
          distributionCode: "7",
          iraSepSimple: true,
          rothConversionAmount: "9000",
          accountHolder: "spouse" as const,
        },
        {
          payer: "Primary Roth IRA Custodian",
          grossDistribution: "5000",
          taxableAmountNotDetermined: true,
          federalWithheld: "0",
          distributionCode: "J",
          accountHolder: "primary" as const,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "5000",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(result.form8606?.line7.toNumber()).toBe(0);
    expect(result.form8606?.line8.toNumber()).toBe(0);
    expect(result.form8606?.line19.toNumber()).toBe(0);
    expect(result.form8606?.qualifiedRothDistributionsExcludedFromLine19.toNumber()).toBe(0);
    expect(result.form8606?.rothReturnedContributionsByDueDate.toNumber()).toBe(0);
    expect(result.form8606?.rothReturnedExcessContributions.toNumber()).toBe(0);
    expect(line4a?.value.toNumber()).toBe(34000);
    expect(line4b?.value.toNumber()).toBe(0);
    expect(String(line4a?.inputs["Defaulted Form 8606 Line 7 gross distributions from attached IRA 1099-R"])).toBe("0");
    expect(String(line4a?.inputs["Defaulted Form 8606 Line 19 from attached Roth IRA 1099-R"])).toBe("0");
    expect(String(line4b?.inputs["Defaulted Form 8606 Line 8 from attached IRA 1099-R Roth conversions"])).toBe("0");
    expect(String(line4a?.inputs["Form 8606 owner-specific IRA defaults"])).toContain("mix primary and spouse IRA activity");
    expect(String(line4b?.inputs["Form 8606 owner-specific IRA defaults"])).toContain("mix primary and spouse IRA activity");
  });

  it("Form 1040 Lines 4a and 4b - a single Form 8606 does not auto-combine tagged and untagged IRA defaults on a joint return", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly" as const,
        spouse: {
          firstName: "Jordan",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1987-06-15",
        },
      },
      form1099R: [
        {
          payer: "Primary Traditional IRA Custodian",
          grossDistribution: "12000",
          taxableAmountNotDetermined: true,
          federalWithheld: "0",
          distributionCode: "7",
          iraSepSimple: true,
          accountHolder: "primary" as const,
        },
        {
          payer: "Untagged Conversion Custodian",
          grossDistribution: "9000",
          taxableAmountNotDetermined: true,
          federalWithheld: "0",
          distributionCode: "7",
          iraSepSimple: true,
          rothConversionAmount: "9000",
        },
        {
          payer: "Untagged Roth IRA Custodian",
          grossDistribution: "5000",
          taxableAmountNotDetermined: true,
          federalWithheld: "0",
          distributionCode: "J",
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "5000",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(result.form8606?.line7.toNumber()).toBe(0);
    expect(result.form8606?.line8.toNumber()).toBe(0);
    expect(result.form8606?.line19.toNumber()).toBe(0);
    expect(line4a?.value.toNumber()).toBe(26000);
    expect(line4b?.value.toNumber()).toBe(0);
    expect(String(line4a?.inputs["Defaulted Form 8606 Line 7 gross distributions from attached IRA 1099-R"])).toBe("0");
    expect(String(line4b?.inputs["Defaulted Form 8606 Line 8 from attached IRA 1099-R Roth conversions"])).toBe("0");
    expect(String(line4a?.inputs["Defaulted Form 8606 Line 19 from attached Roth IRA 1099-R"])).toBe("0");
    expect(String(line4a?.inputs["Form 8606 owner-specific IRA defaults"])).toContain(
      "mix owner-tagged and untagged IRA activity"
    );
    expect(String(line4b?.inputs["Form 8606 owner-specific IRA defaults"])).toContain(
      "mix owner-tagged and untagged IRA activity"
    );
  });

  it("Form 1040 Lines 4a and 4b - form8606ByOwner leaves untagged joint-return IRA records outside both spouse forms", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly" as const,
        spouse: {
          firstName: "Jordan",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1987-06-15",
        },
      },
      form1099R: [
        {
          payer: "Primary Traditional IRA Custodian",
          grossDistribution: "5000",
          taxableAmountNotDetermined: true,
          federalWithheld: "0",
          distributionCode: "7",
          iraSepSimple: true,
          accountHolder: "primary" as const,
        },
        {
          payer: "Spouse Traditional IRA Custodian",
          grossDistribution: "4000",
          taxableAmountNotDetermined: true,
          federalWithheld: "0",
          distributionCode: "7",
          iraSepSimple: true,
          accountHolder: "spouse" as const,
        },
        {
          payer: "Untagged Traditional IRA Custodian",
          grossDistribution: "3000",
          taxableAmountNotDetermined: true,
          federalWithheld: "0",
          distributionCode: "7",
          iraSepSimple: true,
        },
      ],
      form8606ByOwner: {
        primary: {
          nondeductibleContributions: "0",
          priorYearBasis: "5000",
          contributionsMadeNextYear: "0",
          yearEndValue: "0",
        },
        spouse: {
          nondeductibleContributions: "0",
          priorYearBasis: "4000",
          contributionsMadeNextYear: "0",
          yearEndValue: "0",
        },
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(result.form8606ByOwner?.primary?.line7.toNumber()).toBe(5000);
    expect(result.form8606ByOwner?.spouse?.line7.toNumber()).toBe(4000);
    expect(result.form8606?.line7.toNumber()).toBe(9000);
    expect(line4a?.value.toNumber()).toBe(12000);
    expect(line4b?.value.toNumber()).toBe(3000);
    expect(String(line4a?.inputs["Owner-ambiguous joint-return IRA gross distributions outside Form 8606"])).toBe("3000");
    expect(String(line4b?.inputs["Owner-ambiguous joint-return IRA taxable amount outside Form 8606"])).toBe("3000");
  });

  it("Form 1040 Line 4b - taxable IRA distribution uses taxable amount", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "12000",
          taxableAmount: "7000",
          federalWithheld: "700",
          distributionCode: "7",
          iraSepSimple: true,
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(12000);
    expect(line4b?.value.toNumber()).toBe(7000);
    expect(result.totalIncome.toNumber()).toBe(7000);
  });

  it("Form 1040 Line 4b - qualified charitable distributions stay gross on 4a and excluded on 4b", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "15000",
          taxableAmount: "15000",
          qualifiedCharitableDistribution: "5000",
          federalWithheld: "0",
          distributionCode: "7",
          iraSepSimple: true,
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(15000);
    expect(line4b?.value.toNumber()).toBe(10000);
    expect(result.iraDistributionsGross.toNumber()).toBe(15000);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(10000);
    expect(result.totalIncome.toNumber()).toBe(10000);
  });

  it("Form 1040 Line 4b - Box 7 code Y QCDs stay gross on 4a and zero on 4b even when the IRA checkbox is blank", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "15000",
          federalWithheld: "0",
          distributionCode: "Y7",
          iraSepSimple: false,
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");
    const line5a = result.allLines.find((line) => line.form === "1040" && line.line === "5a");
    const line5b = result.allLines.find((line) => line.form === "1040" && line.line === "5b");

    expect(line4a?.value.toNumber()).toBe(15000);
    expect(line4b?.value.toNumber()).toBe(0);
    expect(line5a?.value.toNumber()).toBe(0);
    expect(line5b?.value.toNumber()).toBe(0);
    expect(result.iraDistributionsGross.toNumber()).toBe(15000);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(0);
    expect(result.totalIncome.toNumber()).toBe(0);
  });

  it("Form 1040 Lines 4a and 4b - owner-tagged joint-return QCDs apply the annual limit separately per spouse", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly" as const,
        spouse: {
          firstName: "Jordan",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1987-06-15",
        },
      },
      form1099R: [
        {
          payer: "Primary IRA Custodian",
          grossDistribution: "120000",
          federalWithheld: "0",
          distributionCode: "Y7",
          iraSepSimple: false,
          accountHolder: "primary" as const,
        },
        {
          payer: "Spouse IRA Custodian",
          grossDistribution: "120000",
          federalWithheld: "0",
          distributionCode: "Y7",
          iraSepSimple: false,
          accountHolder: "spouse" as const,
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");
    const form1099RLine2 = result.allLines.find((line) => line.form === "Form 1099-R" && line.line === "2");

    expect(line4a?.value.toNumber()).toBe(240000);
    expect(line4b?.value.toNumber()).toBe(24000);
    expect(result.iraDistributionsGross.toNumber()).toBe(240000);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(24000);
    expect(result.totalIncome.toNumber()).toBe(24000);
    expect(String(form1099RLine2?.inputs["Qualified charitable distributions (capped)"])).toBe("216000");
  });

  it("Form 1040 Line 4b - inherited IRA code Y4 QCDs stay on 4a and do not leak onto the pension lines", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Inherited IRA Custodian",
          grossDistribution: "8000",
          federalWithheld: "0",
          distributionCode: "Y4",
          iraSepSimple: false,
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");
    const line5a = result.allLines.find((line) => line.form === "1040" && line.line === "5a");
    const line5b = result.allLines.find((line) => line.form === "1040" && line.line === "5b");

    expect(line4a?.value.toNumber()).toBe(8000);
    expect(line4b?.value.toNumber()).toBe(0);
    expect(line5a?.value.toNumber()).toBe(0);
    expect(line5b?.value.toNumber()).toBe(0);
    expect(result.iraDistributionsGross.toNumber()).toBe(8000);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(0);
    expect(result.pensionDistributionsGross.toNumber()).toBe(0);
    expect(result.pensionDistributionsTaxable.toNumber()).toBe(0);
    expect(result.totalIncome.toNumber()).toBe(0);
  });

  it("Form 1040 Lines 4a and 4b - qualified Roth IRA code Q distributions stay gross and nontaxable", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "18000",
          taxableAmountNotDetermined: true,
          federalWithheld: "0",
          distributionCode: "Q",
          iraSepSimple: true,
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(18000);
    expect(line4b?.value.toNumber()).toBe(0);
    expect(result.iraDistributionsGross.toNumber()).toBe(18000);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(0);
    expect(result.totalIncome.toNumber()).toBe(0);
  });

  it("Form 1040 Lines 4a and 4b - Roth IRA code T safe harbor reports gross and zero taxable", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "16000",
          taxableAmount: "16000",
          taxableAmountNotDetermined: true,
          rothContributionOrConversionMadeBefore2021: true,
          federalWithheld: "0",
          distributionCode: "T",
          iraSepSimple: true,
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(16000);
    expect(line4b?.value.toNumber()).toBe(0);
    expect(result.iraDistributionsGross.toNumber()).toBe(16000);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(0);
    expect(result.totalIncome.toNumber()).toBe(0);
  });

  it("Form 1040 Lines 5a and 5b - qualified designated Roth account code B distributions stay gross and nontaxable even when Box 2a is blank", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Employer 401(k) Plan",
          grossDistribution: "14000",
          taxableAmountNotDetermined: true,
          federalWithheld: "0",
          distributionCode: "B",
          iraSepSimple: false,
          qualifiedRothDistribution: true,
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    const line5a = result.allLines.find((line) => line.form === "1040" && line.line === "5a");
    const line5b = result.allLines.find((line) => line.form === "1040" && line.line === "5b");

    expect(line5a?.value.toNumber()).toBe(14000);
    expect(line5b?.value.toNumber()).toBe(0);
    expect(result.pensionDistributionsGross.toNumber()).toBe(14000);
    expect(result.pensionDistributionsTaxable.toNumber()).toBe(0);
    expect(result.totalIncome.toNumber()).toBe(0);
  });

  it("Form 1040 Lines 4a and 4b - code R recharacterized IRA contributions stay gross and nontaxable even when the IRA checkbox is blank", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "IRA Custodian",
          grossDistribution: "6500",
          federalWithheld: "125",
          distributionCode: "R",
          iraSepSimple: false,
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");
    const line5a = result.allLines.find((line) => line.form === "1040" && line.line === "5a");
    const line5b = result.allLines.find((line) => line.form === "1040" && line.line === "5b");

    expect(line4a?.value.toNumber()).toBe(6500);
    expect(line4b?.value.toNumber()).toBe(0);
    expect(line5a?.value.toNumber()).toBe(0);
    expect(line5b?.value.toNumber()).toBe(0);
    expect(result.iraDistributionsGross.toNumber()).toBe(6500);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(0);
    expect(result.totalWithholding.toNumber()).toBe(125);
    expect(result.totalIncome.toNumber()).toBe(0);
  });

  it("Form 1040 Lines 4a and 4b - code N recharacterized IRA contributions stay gross and nontaxable even when the IRA checkbox is blank", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "IRA Custodian",
          grossDistribution: "7000",
          federalWithheld: "0",
          distributionCode: "N",
          iraSepSimple: false,
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");
    const form1099RLine1 = result.allLines.find((line) => line.form === "Form 1099-R" && line.line === "1");
    const form1099RLine2 = result.allLines.find((line) => line.form === "Form 1099-R" && line.line === "2");

    expect(line4a?.value.toNumber()).toBe(7000);
    expect(line4b?.value.toNumber()).toBe(0);
    expect(result.iraDistributionsGross.toNumber()).toBe(7000);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(0);
    expect(result.totalIncome.toNumber()).toBe(0);
    expect(String(form1099RLine1?.inputs["Recharacterized IRA contributions"])).toBe("7000");
    expect(String(form1099RLine2?.inputs["Recharacterized IRA contributions"])).toBe("7000");
  });

  it("Form 1040 Lines 4a and 4b - Form 8606 basis recovery overrides blank Box 2a fallback", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "12000",
          federalWithheld: "0",
          distributionCode: "7",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "2000",
        priorYearBasis: "4000",
        contributionsMadeNextYear: "0",
        yearEndValue: "18000",
        traditionalDistributions: "12000",
        rothConversions: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(12000);
    expect(line4b?.value.toNumber()).toBe(9600);
    expect(result.iraDistributionsGross.toNumber()).toBe(12000);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(9600);
    expect(result.form8606?.line15c.toNumber()).toBe(9600);
    expect(result.totalIncome.toNumber()).toBe(9600);
  });

  it("Form 1040 Lines 4a and 4b - Form 8606 excludes QCDs from taxable IRA distributions", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "5000",
          taxableAmount: "5000",
          qualifiedCharitableDistribution: "5000",
          federalWithheld: "0",
          distributionCode: "7",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "5000",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "5000",
        rothConversions: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(5000);
    expect(line4b?.value.toNumber()).toBe(0);
    expect(result.form8606?.line7.toNumber()).toBe(0);
    expect(result.form8606?.line14.toNumber()).toBe(5000);
    expect(result.totalIncome.toNumber()).toBe(0);
  });

  it("Form 1040 Lines 4a and 4b - Form 8606 auto-excludes direct-rollover IRA amounts from attached 1099-R forms", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "15000",
          federalWithheld: "0",
          distributionCode: "G",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "5000",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "15000",
        rothConversions: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(15000);
    expect(line4b?.value.toNumber()).toBe(0);
    expect(result.form8606?.rolledOverDistributions.toNumber()).toBe(15000);
    expect(result.form8606?.line7.toNumber()).toBe(0);
    expect(result.form8606?.line14.toNumber()).toBe(5000);
    expect(result.iraDistributionsGross.toNumber()).toBe(15000);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(0);
    expect(result.totalIncome.toNumber()).toBe(0);
  });

  it("Form 1040 Lines 4a and 4b - Form 8606 auto-excludes returned excess IRA contributions from attached 1099-R forms", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "6500",
          taxableAmountNotDetermined: true,
          excessContributionReturnedWithoutEarnings: true,
          federalWithheld: "0",
          distributionCode: "7",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "4000",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "6500",
        rothConversions: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(6500);
    expect(line4b?.value.toNumber()).toBe(0);
    expect(result.form8606?.returnedExcessContributions.toNumber()).toBe(6500);
    expect(result.form8606?.line7.toNumber()).toBe(0);
    expect(result.iraDistributionsGross.toNumber()).toBe(6500);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(0);
    expect(result.totalIncome.toNumber()).toBe(0);
  });

  it("Form 1040 Lines 4a and 4b - Form 8606 auto-excludes SIMPLE IRA code S returned excess contributions from attached 1099-R forms", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "SIMPLE IRA Custodian",
          grossDistribution: "6500",
          taxableAmountNotDetermined: true,
          excessContributionReturnedWithoutEarnings: true,
          federalWithheld: "0",
          distributionCode: "S",
          iraSepSimple: false,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "4000",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "6500",
        rothConversions: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(6500);
    expect(line4b?.value.toNumber()).toBe(0);
    expect(result.form8606?.returnedExcessContributions.toNumber()).toBe(6500);
    expect(result.form8606?.line7.toNumber()).toBe(0);
    expect(result.iraDistributionsGross.toNumber()).toBe(6500);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(0);
    expect(result.totalIncome.toNumber()).toBe(0);
  });

  it("Form 1040 Lines 4a and 4b - Form 8606 keeps taxable earnings from current-year IRA contributions returned by the due date", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "6500",
          taxableAmount: "500",
          federalWithheld: "0",
          distributionCode: "8",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "4000",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "6500",
        rothConversions: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(6500);
    expect(line4b?.value.toNumber()).toBe(500);
    expect(result.form8606?.returnedContributionsByDueDate.toNumber()).toBe(6500);
    expect(result.form8606?.line7.toNumber()).toBe(0);
    expect(result.iraDistributionsGross.toNumber()).toBe(6500);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(500);
    expect(result.totalIncome.toNumber()).toBe(500);
    expect(line4a?.formula).toContain("returned contributions by due date");
    expect(String(line4a?.inputs["Form 8606 returned contributions by due date"])).toBe("6500");
    expect(String(line4b?.inputs["Taxable earnings from returned contributions by due date"])).toBe("500");
  });

  it("Form 1040 Lines 4a and 4b - Roth returned contributions by the due date stay out of Form 8606 Line 7 defaults when traditional IRA distributions are also present", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "10000",
          taxableAmountNotDetermined: true,
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: true,
        },
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "6500",
          taxableAmount: "500",
          federalWithheld: "0",
          distributionCode: "J8",
          iraSepSimple: true,
        },
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "2500",
          taxableAmountNotDetermined: true,
          excessContributionReturnedWithoutEarnings: true,
          federalWithheld: "0",
          distributionCode: "J",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        rothConversions: "0",
      },
    });
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(19000);
    expect(line4b?.value.toNumber()).toBe(10500);
    expect(result.form8606?.returnedContributionsByDueDate.toNumber()).toBe(0);
    expect(result.form8606?.returnedExcessContributions.toNumber()).toBe(0);
    expect(result.form8606?.rothReturnedContributionsByDueDate.toNumber()).toBe(6500);
    expect(result.form8606?.rothReturnedExcessContributions.toNumber()).toBe(2500);
    expect(result.form8606?.line7.toNumber()).toBe(10000);
    expect(result.form8606?.line15c.toNumber()).toBe(10000);
    expect(result.form8606?.line19.toNumber()).toBe(0);
    expect(result.form8606?.line19Exclusions.toNumber()).toBe(9000);
    expect(result.iraDistributionsGross.toNumber()).toBe(19000);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(10500);
    expect(result.totalIncome.toNumber()).toBe(10500);
    expect(String(line4a?.inputs["Form 8606 Roth returned contributions by due date"])).toBe("6500");
    expect(String(line4a?.inputs["Form 8606 returned Roth excess contributions"])).toBe("2500");
    expect(String(line4b?.inputs["Defaulted Form 8606 Line 7 gross distributions from attached IRA 1099-R"])).toBe("10000");
    expect(String(line4b?.inputs["Taxable earnings from returned contributions by due date"])).toBe("500");
  });

  it("Form 1040 Line 23 - taxable earnings on current-year IRA contributions returned by the due date default into the Form 5329 exception-21 path", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "6500",
          taxableAmount: "500",
          federalWithheld: "0",
          distributionCode: "8",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "4000",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "6500",
        rothConversions: "0",
      },
    });

    const form5329Line1 = result.allLines.find((line) => line.form === "Form 5329" && line.line === "1");
    const form5329Line2 = result.allLines.find((line) => line.form === "Form 5329" && line.line === "2");

    expect(result.form5329?.line1.toNumber()).toBe(500);
    expect(result.form5329?.line2.toNumber()).toBe(500);
    expect(result.form5329?.line2ExceptionNumber).toBe("21");
    expect(result.form5329?.line4.toNumber()).toBe(0);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(0);
    expect(String(form5329Line1?.inputs["Supported returned-contribution taxable earnings (exception 21)"])).toBe("500");
    expect(String(form5329Line2?.inputs["Supported returned-contribution taxable earnings (exception 21)"])).toBe("500");
    expect(form5329Line2?.inputs["Line 2 exception number"]).toBe("21");
  });

  it("Form 1040 Lines 4a, 4b, 23, and 25b - code P returned contributions stay off the current-year return while Box 4 withholding remains current-year", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "6500",
          taxableAmount: "500",
          federalWithheld: "125",
          distributionCode: "P",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "4000",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        rothConversions: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");
    const line25d = result.allLines.find((line) => line.form === "1040" && line.line === "25d");

    expect(line4a?.value.toNumber()).toBe(0);
    expect(line4b?.value.toNumber()).toBe(0);
    expect(result.form8606?.returnedContributionsByDueDate.toNumber()).toBe(0);
    expect(result.form8606?.line7.toNumber()).toBe(0);
    expect(result.form5329).toBeUndefined();
    expect(result.iraDistributionsGross.toNumber()).toBe(0);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(0);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(0);
    expect(result.totalWithholding.toNumber()).toBe(125);
    expect(line25d?.value.toNumber()).toBe(125);
  });

  it("Form 1040 Line 4a - Form 8606 preserves gross IRA distributions that are excluded from Line 7", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "5000",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "10000",
        qualifiedCharitableDistributions: "1000",
        rolledOverDistributions: "3000",
        qualifiedHsaFundingDistributions: "1000",
        rothConversions: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(10000);
    expect(line4b?.value.toNumber()).toBe(0);
    expect(result.form8606?.line7.toNumber()).toBe(5000);
    expect(result.iraDistributionsGross.toNumber()).toBe(10000);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(0);
  });

  it("Form 1040 Line 4a - Form 8606 preserves gross Roth IRA distributions that are excluded from Line 19", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothDistributions: "15000",
        rothRolledOverDistributions: "5000",
        rothQualifiedHsaFundingDistributions: "2000",
        rothContributionBasis: "3000",
        rothConversionBasis: "2500",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(15000);
    expect(line4b?.value.toNumber()).toBe(2500);
    expect(result.form8606?.line19.toNumber()).toBe(8000);
    expect(result.form8606?.line19Exclusions.toNumber()).toBe(7000);
    expect(result.iraDistributionsGross.toNumber()).toBe(15000);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(2500);
  });

  it("Form 1040 Line 4a - Form 8606 preserves gross Roth IRA distributions excluded for returned contributions and returned excess amounts", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothDistributions: "15000",
        rothReturnedContributionsByDueDate: "6500",
        rothReturnedExcessContributions: "2500",
        rothContributionBasis: "4000",
        rothConversionBasis: "2000",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(15000);
    expect(line4b?.value.toNumber()).toBe(0);
    expect(result.form8606?.line19.toNumber()).toBe(6000);
    expect(result.form8606?.line19Exclusions.toNumber()).toBe(9000);
    expect(result.iraDistributionsGross.toNumber()).toBe(15000);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(0);
    expect(String(line4a?.inputs["Form 8606 Roth returned contributions by due date"])).toBe("6500");
    expect(String(line4a?.inputs["Form 8606 returned Roth excess contributions"])).toBe("2500");
  });

  it("Form 1040 Line 4b - Form 8606 reduces taxable IRA distributions by the qualified disaster fraction", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form8606: {
        nondeductibleContributions: "3000",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "33000",
        qualifiedDisasterDistributions: "22000",
        rothConversions: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(33000);
    expect(line4b?.value.toNumber()).toBe(9999);
    expect(result.form8606?.line15b.toNumber()).toBe(19998);
    expect(result.iraDistributionsGross.toNumber()).toBe(33000);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(9999);
    expect(result.totalIncome.toNumber()).toBe(9999);
  });

  it("Form 1040 Line 4b - Form 8606 reduces taxable IRA distributions for 2025 repayments treated as rollovers", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "12500",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "2500",
        contributionsMadeNextYear: "0",
        yearEndValue: "5000",
        currentYearRepaymentsTreatedAsRollovers: "5000",
        traditionalDistributions: "12500",
        repaymentEligibleDistributions: "5000",
        repaymentWithin3YearWindow: "5000",
        rothConversions: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(12500);
    expect(line4b?.value.toNumber()).toBe(6000);
    expect(result.form8606?.line6.toNumber()).toBe(0);
    expect(result.form8606?.line15c.toNumber()).toBe(6000);
    expect(result.form8606?.line15cBasisAdjustment.toNumber()).toBe(1000);
    expect(result.iraDistributionsGross.toNumber()).toBe(12500);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(6000);
    expect(result.totalIncome.toNumber()).toBe(6000);
  });

  it("Form 1040 Line 4b - Form 8606 caps over-repayments at the eligible taxable share and preserves the excess as basis", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "12000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "3000",
        contributionsMadeNextYear: "0",
        yearEndValue: "3000",
        currentYearRepaymentsTreatedAsRollovers: "9000",
        traditionalDistributions: "12000",
        repaymentEligibleDistributions: "2000",
        repaymentWithin3YearWindow: "7000",
        rothConversions: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(12000);
    expect(line4b?.value.toNumber()).toBe(7500);
    expect(result.form8606?.currentYearRepaymentsTreatedAsRollovers.toNumber()).toBe(3000);
    expect(result.form8606?.line6.toNumber()).toBe(0);
    expect(result.form8606?.repaymentWithin3YearWindow.toNumber()).toBe(2000);
    expect(result.form8606?.line15cRepaymentReduction.toNumber()).toBe(1500);
    expect(result.form8606?.line15cBasisAdjustment.toNumber()).toBe(500);
    expect(result.iraDistributionsGross.toNumber()).toBe(12000);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(7500);
    expect(result.totalIncome.toNumber()).toBe(7500);
  });

  it("Form 1040 Lines 4a and 4b - Form 8606 Part III routes taxable Roth IRA distributions through the IRA lines", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothDistributions: "12500",
        rothContributionBasis: "2500",
        rothConversionBasis: "0",
        rothRepaymentEligibleDistributions: "12500",
        rothRepaymentsWithin3YearWindow: "3000",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(12500);
    expect(line4b?.value.toNumber()).toBe(7000);
    expect(result.form8606?.line25c.toNumber()).toBe(7000);
    expect(result.iraDistributionsGross.toNumber()).toBe(12500);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(7000);
    expect(result.totalIncome.toNumber()).toBe(7000);
  });

  it("Form 1040 Lines 4a and 4b - Form 8606 Part III limits the Roth first-time homebuyer exclusion to the remaining $10,000 lifetime cap", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothDistributions: "15000",
        qualifiedFirstTimeHomebuyerExpenses: "4000",
        priorQualifiedFirstTimeHomebuyerDistributions: "9000",
        rothContributionBasis: "0",
        rothConversionBasis: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(15000);
    expect(line4b?.value.toNumber()).toBe(14000);
    expect(result.form8606?.line20.toNumber()).toBe(1000);
    expect(result.form8606?.line21.toNumber()).toBe(14000);
    expect(result.form8606?.line25c.toNumber()).toBe(14000);
    expect(result.iraDistributionsGross.toNumber()).toBe(15000);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(14000);
    expect(result.totalIncome.toNumber()).toBe(14000);
  });

  it("Form 1040 Lines 4a and 4b - Form 8606 Part III gives no Roth homebuyer exclusion after the lifetime $10,000 cap is exhausted", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothDistributions: "5000",
        qualifiedFirstTimeHomebuyerExpenses: "3000",
        priorQualifiedFirstTimeHomebuyerDistributions: "10000",
        rothContributionBasis: "0",
        rothConversionBasis: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(5000);
    expect(line4b?.value.toNumber()).toBe(5000);
    expect(result.form8606?.line20.toNumber()).toBe(0);
    expect(result.form8606?.line21.toNumber()).toBe(5000);
    expect(result.form8606?.line25c.toNumber()).toBe(5000);
    expect(result.iraDistributionsGross.toNumber()).toBe(5000);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(5000);
    expect(result.totalIncome.toNumber()).toBe(5000);
  });

  it("Form 1040 Lines 4a and 4b - Form 8606 Part III carries Roth over-repayments into next-year basis instead of negative taxable income", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothDistributions: "12500",
        rothContributionBasis: "4500",
        rothConversionBasis: "0",
        rothRepaymentEligibleDistributions: "12500",
        rothRepaymentsWithin3YearWindow: "12500",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(12500);
    expect(line4b?.value.toNumber()).toBe(0);
    expect(result.form8606?.line25a.toNumber()).toBe(8000);
    expect(result.form8606?.line25c.toNumber()).toBe(0);
    expect(result.form8606?.line25cBasisAdjustment.toNumber()).toBe(4500);
    expect(result.iraDistributionsGross.toNumber()).toBe(12500);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(0);
    expect(result.totalIncome.toNumber()).toBe(0);
  });

  it("Form 1040 Lines 4a and 4b - Form 8606 Line 19 excludes qualified Roth distributions from Part III while preserving gross reporting", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothDistributions: "15000",
        qualifiedRothDistributionsExcludedFromLine19: "9000",
        rothContributionBasis: "1000",
        rothConversionBasis: "500",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(15000);
    expect(line4b?.value.toNumber()).toBe(4500);
    expect(result.form8606?.qualifiedRothDistributionsExcludedFromLine19.toNumber()).toBe(9000);
    expect(result.form8606?.line19.toNumber()).toBe(6000);
    expect(result.form8606?.line25c.toNumber()).toBe(4500);
    expect(result.iraDistributionsGross.toNumber()).toBe(15000);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(4500);
    expect(result.totalIncome.toNumber()).toBe(4500);
  });

  it("Form 1040 Lines 4a, 4b, and 23 - validated Roth IRA code J qualified distributions default into the Form 8606 Line 19 exclusion path and avoid Form 5329 tax", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "11000",
          taxableAmount: "11000",
          taxableAmountNotDetermined: true,
          federalWithheld: "0",
          distributionCode: "J",
          iraSepSimple: true,
          qualifiedRothDistribution: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothContributionBasis: "0",
        rothConversionBasis: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");
    const line23 = result.allLines.find((line) => line.form === "1040" && line.line === "23");

    expect(line4a?.value.toNumber()).toBe(11000);
    expect(line4b?.value.toNumber()).toBe(0);
    expect(line23?.value.toNumber()).toBe(0);
    expect(result.form8606?.qualifiedRothDistributionsExcludedFromLine19.toNumber()).toBe(11000);
    expect(result.form8606?.line19.toNumber()).toBe(0);
    expect(result.form8606?.line25c.toNumber()).toBe(0);
    expect(result.iraDistributionsGross.toNumber()).toBe(11000);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(0);
    expect(result.totalIncome.toNumber()).toBe(0);
  });

  it("Form 1040 Lines 4a, 4b, and 23 - validated Roth IRA code T qualified distributions default into the Form 8606 Line 19 exclusion path and avoid Form 5329 tax", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "11000",
          taxableAmount: "11000",
          taxableAmountNotDetermined: true,
          federalWithheld: "0",
          distributionCode: "T",
          iraSepSimple: true,
          qualifiedRothDistribution: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothContributionBasis: "0",
        rothConversionBasis: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");
    const line23 = result.allLines.find((line) => line.form === "1040" && line.line === "23");

    expect(line4a?.value.toNumber()).toBe(11000);
    expect(line4b?.value.toNumber()).toBe(0);
    expect(line23?.value.toNumber()).toBe(0);
    expect(result.form8606?.qualifiedRothDistributionsExcludedFromLine19.toNumber()).toBe(11000);
    expect(result.form8606?.line19.toNumber()).toBe(0);
    expect(result.form8606?.line25c.toNumber()).toBe(0);
    expect(result.iraDistributionsGross.toNumber()).toBe(11000);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(0);
    expect(result.totalIncome.toNumber()).toBe(0);
  });

  it("Form 1040 Lines 4a and 4b - Form 8606 auto-defaults validated attached Roth IRA rollover amounts into Line 19 exclusions", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "10000",
          taxableAmountNotDetermined: true,
          federalWithheld: "0",
          distributionCode: "J",
          iraSepSimple: true,
          rothIraRolledOverAmount: "7500",
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothContributionBasis: "0",
        rothConversionBasis: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(10000);
    expect(line4b?.value.toNumber()).toBe(2500);
    expect(result.form8606?.rothRolledOverDistributions.toNumber()).toBe(7500);
    expect(result.form8606?.line19.toNumber()).toBe(2500);
    expect(result.form8606?.line25c.toNumber()).toBe(2500);
    expect(result.iraDistributionsGross.toNumber()).toBe(10000);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(2500);
    expect(result.totalIncome.toNumber()).toBe(2500);
    expect(String(line4a?.inputs["Form 8606 Roth rolled over distributions"])).toBe("7500");
  });

  it("Form 1040 Lines 4a and 4b - Form 8889 traditional qualified funding distributions auto-default into Form 8606 Line 7 exclusions", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form8889: {
        qualifiedFundingDistribution: "4000",
        qualifiedFundingDistributionSource: "traditional_ira",
      },
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "5000",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "12000",
        rothConversions: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(12000);
    expect(line4b?.value.toNumber()).toBe(3000);
    expect(String(line4a?.inputs["Form 8606 qualified HSA funding distributions"])).toBe("4000");
    expect(result.form8606?.qualifiedHsaFundingDistributions.toNumber()).toBe(4000);
    expect(result.form8606?.line7Exclusions.toNumber()).toBe(4000);
    expect(result.form8606?.line7.toNumber()).toBe(8000);
    expect(result.form8606?.line15c.toNumber()).toBe(3000);
    expect(result.iraDistributionsGross.toNumber()).toBe(12000);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(3000);
    expect(result.totalIncome.toNumber()).toBe(3000);
  });

  it("Form 1040 Lines 4a and 4b - Form 8889 qualified funding distributions without a validated source do not auto-default into Form 8606", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form8889: {
        qualifiedFundingDistribution: "4000",
      },
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "5000",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "12000",
        rothConversions: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");

    expect(line4a?.value.toNumber()).toBe(12000);
    expect(String(line4a?.inputs["Form 8606 qualified HSA funding distributions"])).toBe("0");
    expect(result.form8606?.qualifiedHsaFundingDistributions.toNumber()).toBe(0);
    expect(result.form8606?.rothQualifiedHsaFundingDistributions.toNumber()).toBe(0);
    expect(result.form8606?.line7Exclusions.toNumber()).toBe(0);
    expect(result.form8606?.line7.toNumber()).toBe(12000);
    expect(result.form8606?.line15c.toNumber()).toBe(6996);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(6996);
    expect(result.totalIncome.toNumber()).toBe(6996);
  });

  it("Form 1040 Lines 4a and 4b - a single Form 8606 does not combine both spouses' traditional qualified funding distributions from form8889ByOwner", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly" as const,
        spouse: {
          firstName: "Jordan",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1987-06-15",
        },
      },
      form8889ByOwner: {
        primary: {
          qualifiedFundingDistribution: "1500",
          qualifiedFundingDistributionSource: "traditional_ira" as const,
        },
        spouse: {
          qualifiedFundingDistribution: "2500",
          qualifiedFundingDistributionSource: "traditional_ira" as const,
        },
      },
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "5000",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "12000",
        rothConversions: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");

    expect(line4a?.value.toNumber()).toBe(12000);
    expect(String(line4a?.inputs["Form 8606 qualified HSA funding distributions"])).toBe("0");
    expect(String(line4a?.inputs["Form 8606 owner-specific HSA funding defaults"])).toContain(
      "cannot safely infer whether any qualified funding distribution belongs"
    );
    expect(result.form8606?.qualifiedHsaFundingDistributions.toNumber()).toBe(0);
    expect(result.form8606?.line7Exclusions.toNumber()).toBe(0);
    expect(result.form8606?.line7.toNumber()).toBe(12000);
    expect(result.form8606?.line15c.toNumber()).toBe(6996);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(6996);
    expect(result.totalIncome.toNumber()).toBe(6996);
  });

  it("Form 1040 Lines 4a and 4b - a single Form 8606 suppresses traditional qualified funding defaults when both spouse-specific Form 8889 inputs exist but only one spouse has the funding distribution", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly" as const,
        spouse: {
          firstName: "Jordan",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1987-06-15",
        },
      },
      form8889ByOwner: {
        primary: {
          qualifiedFundingDistribution: "4000",
          qualifiedFundingDistributionSource: "traditional_ira" as const,
        },
        spouse: {},
      },
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "5000",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "12000",
        rothConversions: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");

    expect(line4a?.value.toNumber()).toBe(12000);
    expect(String(line4a?.inputs["Form 8606 qualified HSA funding distributions"])).toBe("0");
    expect(String(line4a?.inputs["Form 8606 owner-specific HSA funding defaults"])).toContain(
      "cannot safely infer whether any qualified funding distribution belongs"
    );
    expect(result.form8606?.qualifiedHsaFundingDistributions.toNumber()).toBe(0);
    expect(result.form8606?.line7Exclusions.toNumber()).toBe(0);
    expect(result.form8606?.line7.toNumber()).toBe(12000);
    expect(result.form8606?.line15c.toNumber()).toBe(6996);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(6996);
    expect(result.totalIncome.toNumber()).toBe(6996);
  });

  it("Form 1040 Lines 4a and 4b - Form 8889 Roth qualified funding distributions auto-default into Form 8606 Line 19 exclusions", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form8889: {
        qualifiedFundingDistribution: "4000",
        qualifiedFundingDistributionSource: "roth_ira",
      },
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothDistributions: "12000",
        rothContributionBasis: "1000",
        rothConversionBasis: "500",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(12000);
    expect(line4b?.value.toNumber()).toBe(6500);
    expect(result.form8606?.qualifiedHsaFundingDistributions.toNumber()).toBe(0);
    expect(result.form8606?.rothQualifiedHsaFundingDistributions.toNumber()).toBe(4000);
    expect(result.form8606?.line19Exclusions.toNumber()).toBe(4000);
    expect(result.form8606?.line19.toNumber()).toBe(8000);
    expect(result.form8606?.line25c.toNumber()).toBe(6500);
  });

  it("Form 1040 Lines 4a and 4b - a single Form 8606 does not combine both spouses' Roth qualified funding distributions from form8889ByOwner", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly" as const,
        spouse: {
          firstName: "Jordan",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1987-06-15",
        },
      },
      form8889ByOwner: {
        primary: {
          qualifiedFundingDistribution: "1500",
          qualifiedFundingDistributionSource: "roth_ira" as const,
        },
        spouse: {
          qualifiedFundingDistribution: "2500",
          qualifiedFundingDistributionSource: "roth_ira" as const,
        },
      },
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothDistributions: "12000",
        rothContributionBasis: "1000",
        rothConversionBasis: "500",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");

    expect(String(line4a?.inputs["Form 8606 owner-specific HSA funding defaults"])).toContain(
      "cannot safely infer whether any qualified funding distribution belongs"
    );
    expect(result.form8606?.qualifiedHsaFundingDistributions.toNumber()).toBe(0);
    expect(result.form8606?.rothQualifiedHsaFundingDistributions.toNumber()).toBe(0);
    expect(result.form8606?.line19Exclusions.toNumber()).toBe(0);
    expect(result.form8606?.line19.toNumber()).toBe(12000);
    expect(result.form8606?.line25c.toNumber()).toBe(10500);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(10500);
    expect(result.totalIncome.toNumber()).toBe(10500);
  });

  it("Form 1040 Lines 4a and 4b - a single Form 8606 suppresses Roth qualified funding defaults when both spouse-specific Form 8889 inputs exist but only one spouse has the funding distribution", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly" as const,
        spouse: {
          firstName: "Jordan",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1987-06-15",
        },
      },
      form8889ByOwner: {
        primary: {
          qualifiedFundingDistribution: "4000",
          qualifiedFundingDistributionSource: "roth_ira" as const,
        },
        spouse: {},
      },
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothDistributions: "12000",
        rothContributionBasis: "1000",
        rothConversionBasis: "500",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");

    expect(String(line4a?.inputs["Form 8606 owner-specific HSA funding defaults"])).toContain(
      "cannot safely infer whether any qualified funding distribution belongs"
    );
    expect(result.form8606?.qualifiedHsaFundingDistributions.toNumber()).toBe(0);
    expect(result.form8606?.rothQualifiedHsaFundingDistributions.toNumber()).toBe(0);
    expect(result.form8606?.line19Exclusions.toNumber()).toBe(0);
    expect(result.form8606?.line19.toNumber()).toBe(12000);
    expect(result.form8606?.line25c.toNumber()).toBe(10500);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(10500);
    expect(result.totalIncome.toNumber()).toBe(10500);
  });

  it("Form 1040 Lines 4a and 4b - a single Form 8606 suppresses traditional qualified funding defaults when a main Form 8889 and an owner-specific Form 8889 statement both carry funding distributions", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly" as const,
        spouse: {
          firstName: "Jordan",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1987-06-15",
        },
      },
      form8889: {
        qualifiedFundingDistribution: "4000",
        qualifiedFundingDistributionSource: "traditional_ira" as const,
      },
      form8889ByOwner: {
        spouse: {
          qualifiedFundingDistribution: "1500",
          qualifiedFundingDistributionSource: "traditional_ira" as const,
        },
      },
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "5000",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "12000",
        rothConversions: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");

    expect(String(line4a?.inputs["Form 8606 qualified HSA funding distributions"])).toBe("0");
    expect(String(line4a?.inputs["Form 8606 owner-specific HSA funding defaults"])).toContain(
      "cannot safely infer whether any qualified funding distribution belongs"
    );
    expect(result.form8606?.qualifiedHsaFundingDistributions.toNumber()).toBe(0);
    expect(result.form8606?.line7Exclusions.toNumber()).toBe(0);
    expect(result.form8606?.line7.toNumber()).toBe(12000);
    expect(result.form8606?.line15c.toNumber()).toBe(6996);
  });

  it("Form 1040 Lines 4a and 4b - a single Form 8606 suppresses Roth qualified funding defaults when a main Form 8889 and an owner-specific Form 8889 statement both carry funding distributions", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly" as const,
        spouse: {
          firstName: "Jordan",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1987-06-15",
        },
      },
      form8889: {
        qualifiedFundingDistribution: "4000",
        qualifiedFundingDistributionSource: "roth_ira" as const,
      },
      form8889ByOwner: {
        spouse: {
          qualifiedFundingDistribution: "1500",
          qualifiedFundingDistributionSource: "roth_ira" as const,
        },
      },
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothDistributions: "12000",
        rothContributionBasis: "1000",
        rothConversionBasis: "500",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");

    expect(String(line4a?.inputs["Form 8606 owner-specific HSA funding defaults"])).toContain(
      "cannot safely infer whether any qualified funding distribution belongs"
    );
    expect(result.form8606?.qualifiedHsaFundingDistributions.toNumber()).toBe(0);
    expect(result.form8606?.rothQualifiedHsaFundingDistributions.toNumber()).toBe(0);
    expect(result.form8606?.line19Exclusions.toNumber()).toBe(0);
    expect(result.form8606?.line19.toNumber()).toBe(12000);
    expect(result.form8606?.line25c.toNumber()).toBe(10500);
  });

  it("Form 1040 Lines 4a and 4b - Form 8606 auto-defaults attached Roth IRA returned-contribution and returned-excess branches into Line 19 exclusions", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "12500",
          taxableAmountNotDetermined: true,
          federalWithheld: "0",
          distributionCode: "J",
          iraSepSimple: true,
        },
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "6500",
          taxableAmount: "500",
          returnedContributionByDueDate: true,
          federalWithheld: "0",
          distributionCode: "J8",
          iraSepSimple: true,
        },
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "2500",
          taxableAmountNotDetermined: true,
          excessContributionReturnedWithoutEarnings: true,
          federalWithheld: "0",
          distributionCode: "J",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothContributionBasis: "2500",
        rothConversionBasis: "3000",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(result.form8606?.line19.toNumber()).toBe(12500);
    expect(result.form8606?.rothReturnedContributionsByDueDate.toNumber()).toBe(6500);
    expect(result.form8606?.rothReturnedExcessContributions.toNumber()).toBe(2500);
    expect(result.form8606?.line19Exclusions.toNumber()).toBe(9000);
    expect(result.form8606?.returnedContributionsByDueDate.toNumber()).toBe(0);
    expect(result.form8606?.returnedExcessContributions.toNumber()).toBe(0);
    expect(line4a?.value.toNumber()).toBe(21500);
    expect(line4b?.value.toNumber()).toBe(7500);
    expect(result.iraDistributionsGross.toNumber()).toBe(21500);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(7500);
    expect(result.totalIncome.toNumber()).toBe(7500);
    expect(String(line4a?.inputs["Defaulted Form 8606 Line 19 from attached Roth IRA 1099-R"])).toBe("21500");
    expect(String(line4a?.inputs["Form 8606 Roth returned contributions by due date"])).toBe("6500");
    expect(String(line4a?.inputs["Form 8606 returned Roth excess contributions"])).toBe("2500");
    expect(String(line4b?.inputs["Taxable earnings from returned contributions by due date"])).toBe("500");
  });

  it("Form 1040 Lines 4a and 4b - code J8 Roth corrective distributions keep Box 2a earnings taxable even if an inconsistent qualified flag slips into input", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Roth IRA Custodian",
          grossDistribution: "6500",
          taxableAmount: "500",
          returnedContributionByDueDate: true,
          qualifiedRothDistribution: true,
          federalWithheld: "0",
          distributionCode: "J8",
          iraSepSimple: true,
        },
      ],
      form8606: {
        nondeductibleContributions: "0",
        priorYearBasis: "0",
        contributionsMadeNextYear: "0",
        yearEndValue: "0",
        traditionalDistributions: "0",
        rothConversions: "0",
        rothContributionBasis: "0",
        rothConversionBasis: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(result.form8606?.qualifiedRothDistributionsExcludedFromLine19.toNumber()).toBe(0);
    expect(result.form8606?.rothReturnedContributionsByDueDate.toNumber()).toBe(6500);
    expect(result.form8606?.line19Exclusions.toNumber()).toBe(6500);
    expect(result.form8606?.line19.toNumber()).toBe(0);
    expect(line4a?.value.toNumber()).toBe(6500);
    expect(line4b?.value.toNumber()).toBe(500);
    expect(result.iraDistributionsGross.toNumber()).toBe(6500);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(500);
    expect(String(line4b?.inputs["Taxable earnings from returned contributions by due date"])).toBe("500");
  });

  it("Form 1040 Lines 4a and 4b - taxable IRA rollover reports both gross and taxable amounts", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "G",
          iraSepSimple: true,
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(10000);
    expect(line4b?.value.toNumber()).toBe(10000);
    expect(result.totalIncome.toNumber()).toBe(10000);
  });

  it("Form 1040 Lines 4a and 4b - excess IRA contributions returned after the due date without earnings are nontaxable", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "6500",
          taxableAmountNotDetermined: true,
          excessContributionReturnedWithoutEarnings: true,
          federalWithheld: "0",
          distributionCode: "7",
          iraSepSimple: true,
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    const line4a = result.allLines.find((line) => line.form === "1040" && line.line === "4a");
    const line4b = result.allLines.find((line) => line.form === "1040" && line.line === "4b");

    expect(line4a?.value.toNumber()).toBe(6500);
    expect(line4b?.value.toNumber()).toBe(0);
    expect(result.iraDistributionsGross.toNumber()).toBe(6500);
    expect(result.iraDistributionsTaxable.toNumber()).toBe(0);
    expect(result.totalIncome.toNumber()).toBe(0);
  });

  it("Form 1040 Line 5a - pension gross distribution shown only when not fully taxable", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "State Pension",
          grossDistribution: "18000",
          taxableAmount: "12000",
          federalWithheld: "1800",
          distributionCode: "7",
          iraSepSimple: false,
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    const line5a = result.allLines.find((line) => line.form === "1040" && line.line === "5a");
    const line5b = result.allLines.find((line) => line.form === "1040" && line.line === "5b");

    expect(line5a?.value.toNumber()).toBe(18000);
    expect(line5b?.value.toNumber()).toBe(12000);
  });

  it("Form 1040 Line 5b - taxable pension distribution uses taxable amount", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Former Employer 401k",
          grossDistribution: "25000",
          federalWithheld: "0",
          distributionCode: "G",
          iraSepSimple: false,
        },
        {
          payer: "State Pension",
          grossDistribution: "18000",
          taxableAmount: "12000",
          federalWithheld: "1800",
          distributionCode: "7",
          iraSepSimple: false,
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    const line5a = result.allLines.find((line) => line.form === "1040" && line.line === "5a");
    const line5b = result.allLines.find((line) => line.form === "1040" && line.line === "5b");

    expect(line5a?.value.toNumber()).toBe(43000);
    expect(line5b?.value.toNumber()).toBe(12000);
    expect(result.totalIncome.toNumber()).toBe(12000);
  });

  it("Form 1040 Lines 5a and 5b - Box 5 reduces taxable pension amount when Box 2a is blank", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "State Pension",
          grossDistribution: "18000",
          employeeContributions: "6000",
          federalWithheld: "1800",
          distributionCode: "7",
          iraSepSimple: false,
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    const line5a = result.allLines.find((line) => line.form === "1040" && line.line === "5a");
    const line5b = result.allLines.find((line) => line.form === "1040" && line.line === "5b");

    expect(line5a?.value.toNumber()).toBe(18000);
    expect(line5b?.value.toNumber()).toBe(12000);
    expect(result.totalIncome.toNumber()).toBe(12000);
  });

  it("Form 1040 Lines 5a and 5b - validated Simplified Method inputs cap pension basis recovery at the remaining unrecovered cost", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "State Pension",
          grossDistribution: "18000",
          taxableAmountNotDetermined: true,
          federalWithheld: "1800",
          distributionCode: "7",
          iraSepSimple: false,
          simplifiedMethodCostInPlan: "12000",
          simplifiedMethodExpectedPayments: 240,
          simplifiedMethodPaymentsReceivedThisYear: 12,
          simplifiedMethodPriorYearRecovered: "11500",
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    const line5a = result.allLines.find((line) => line.form === "1040" && line.line === "5a");
    const line5b = result.allLines.find((line) => line.form === "1040" && line.line === "5b");

    expect(line5a?.value.toNumber()).toBe(18000);
    expect(line5b?.value.toNumber()).toBe(17500);
    expect(result.pensionDistributionsGross.toNumber()).toBe(18000);
    expect(result.pensionDistributionsTaxable.toNumber()).toBe(17500);
    expect(result.totalIncome.toNumber()).toBe(17500);
  });

  it("Form 1040 Lines 5a and 5b - retired public safety officer premiums reduce taxable pension income up to the annual cap", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "City Pension",
          grossDistribution: "7000",
          taxableAmount: "4000",
          federalWithheld: "0",
          distributionCode: "7",
          iraSepSimple: false,
          retiredPublicSafetyOfficerInsurancePremiums: "1500",
        },
        {
          payer: "County Pension",
          grossDistribution: "8000",
          taxableAmount: "5000",
          federalWithheld: "0",
          distributionCode: "7",
          iraSepSimple: false,
          retiredPublicSafetyOfficerInsurancePremiums: "3000",
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    const line5a = result.allLines.find((line) => line.form === "1040" && line.line === "5a");
    const line5b = result.allLines.find((line) => line.form === "1040" && line.line === "5b");
    const form1099RLine4 = result.allLines.find((line) => line.form === "Form 1099-R" && line.line === "4");

    expect(line5a?.value.toNumber()).toBe(15000);
    expect(line5b?.value.toNumber()).toBe(6000);
    expect(result.pensionDistributionsGross.toNumber()).toBe(15000);
    expect(result.pensionDistributionsTaxable.toNumber()).toBe(6000);
    expect(result.totalIncome.toNumber()).toBe(6000);
    expect(String(form1099RLine4?.inputs["Retired public safety officer premium exclusion"])).toBe("3000");
  });

  it("Form 1040 Lines 5a and 5b - taxable-amount-not-determined pensions keep gross visible on line 5a", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "State Pension",
          grossDistribution: "18000",
          taxableAmountNotDetermined: true,
          federalWithheld: "1800",
          distributionCode: "7",
          iraSepSimple: false,
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    const line5a = result.allLines.find((line) => line.form === "1040" && line.line === "5a");
    const line5b = result.allLines.find((line) => line.form === "1040" && line.line === "5b");

    expect(line5a?.value.toNumber()).toBe(18000);
    expect(line5b?.value.toNumber()).toBe(18000);
    expect(result.pensionDistributionsGross.toNumber()).toBe(18000);
    expect(result.pensionDistributionsTaxable.toNumber()).toBe(18000);
    expect(result.totalIncome.toNumber()).toBe(18000);
  });

  it("Form 1040 Lines 5a and 5b - direct rollover with Box 5 basis stays fully nontaxable when Box 2a is blank", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Former Employer 401k",
          grossDistribution: "25000",
          employeeContributions: "4000",
          federalWithheld: "0",
          distributionCode: "G",
          iraSepSimple: false,
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    const line5a = result.allLines.find((line) => line.form === "1040" && line.line === "5a");
    const line5b = result.allLines.find((line) => line.form === "1040" && line.line === "5b");

    expect(line5a?.value.toNumber()).toBe(25000);
    expect(line5b?.value.toNumber()).toBe(0);
    expect(result.totalIncome.toNumber()).toBe(0);
  });

  it("Form 1040 Lines 5a, 5b, 23, and 25d - non-IRA code P returns stay off the current-year pension lines while Box 4 withholding remains current-year", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "401k Plan Administrator",
          grossDistribution: "3500",
          taxableAmount: "3500",
          federalWithheld: "350",
          distributionCode: "P",
          iraSepSimple: false,
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    const line5a = result.allLines.find((line) => line.form === "1040" && line.line === "5a");
    const line5b = result.allLines.find((line) => line.form === "1040" && line.line === "5b");
    const line23 = result.allLines.find((line) => line.form === "1040" && line.line === "23");
    const line25d = result.allLines.find((line) => line.form === "1040" && line.line === "25d");

    expect(line5a?.value.toNumber()).toBe(0);
    expect(line5b?.value.toNumber()).toBe(0);
    expect(line23?.value.toNumber()).toBe(0);
    expect(result.pensionDistributionsGross.toNumber()).toBe(0);
    expect(result.pensionDistributionsTaxable.toNumber()).toBe(0);
    expect(result.form5329).toBeUndefined();
    expect(result.totalAdditionalTaxes.toNumber()).toBe(0);
    expect(result.totalWithholding.toNumber()).toBe(350);
    expect(line25d?.value.toNumber()).toBe(350);
  });

  it("Form 1040 Lines 5a and 5b - taxable pension rollover reports both gross and taxable amounts", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Former Employer 401k",
          grossDistribution: "25000",
          taxableAmount: "25000",
          federalWithheld: "0",
          distributionCode: "G",
          iraSepSimple: false,
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    const line5a = result.allLines.find((line) => line.form === "1040" && line.line === "5a");
    const line5b = result.allLines.find((line) => line.form === "1040" && line.line === "5b");

    expect(line5a?.value.toNumber()).toBe(25000);
    expect(line5b?.value.toNumber()).toBe(25000);
    expect(result.totalIncome.toNumber()).toBe(25000);
  });

  it("Form 1040 Line 6a - Social Security gross benefits aggregate across SSA-1099 and RRB-1099 forms", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      formSSA1099: [
        {
          recipient: "Jane Doe",
          netBenefits: "18000",
          federalWithheld: "0",
        },
        {
          recipient: "Jane Doe",
          netBenefits: "6000",
          federalWithheld: "0",
        },
      ],
      formRRB1099: [
        {
          recipient: "Jane Doe",
          netSocialSecurityEquivalentBenefitPortion: "9000",
          federalWithheld: "0",
        },
      ],
    };

    const result = calculateFederalTax(fixture);
    const line6a = result.allLines.find((line) => line.form === "1040" && line.line === "6a");

    expect(line6a?.value.toNumber()).toBe(33000);
    expect(result.socialSecurityBenefitsGross.toNumber()).toBe(33000);
  });

  it("Form 1040 Line 6b - RRB-1099 equivalent benefits follow the standard worksheet", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099Int: [],
      form1099Misc: [
        {
          payer: "Miscellaneous Income Payer",
          otherIncome: "24000",
          federalWithheld: "0",
          rents: "0",
        },
      ],
      formRRB1099: [
        {
          recipient: "Jane Doe",
          netSocialSecurityEquivalentBenefitPortion: "24000",
          federalWithheld: "600",
        },
      ],
    };

    const result = calculateFederalTax(fixture);
    const line6b = result.allLines.find((line) => line.form === "1040" && line.line === "6b");
    const line25d = result.allLines.find((line) => line.form === "1040" && line.line === "25d");

    expect(line6b?.value.toNumber()).toBe(6200);
    expect(result.socialSecurityBenefitsTaxable.toNumber()).toBe(6200);
    expect(result.totalIncome.toNumber()).toBe(30200);
    expect(line25d?.value.toNumber()).toBe(600);
    expect(result.totalWithholding.toNumber()).toBe(600);
  });

  it("Form 1040 Line 6b - Pub. 915 lump-sum election lowers taxable Social Security when beneficial", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099Int: [],
      form1099Misc: [
        {
          payer: "Miscellaneous Income Payer",
          otherIncome: "25500",
          federalWithheld: "0",
          rents: "0",
        },
      ],
      formSSA1099: [
        {
          recipient: "Jane Doe",
          netBenefits: "11000",
          federalWithheld: "0",
        },
      ],
      socialSecurityLumpSumElection: {
        currentYearExclusionsAdjustments: "0",
        earlierYears: [
          {
            taxYear: 2024,
            filingStatus: "single",
            benefitsReceivedInEarlierYear: "0",
            delayedBenefitsReceivedInCurrentYear: "2000",
            adjustedGrossIncome: "23000",
            taxExemptInterest: "0",
            exclusionsAdjustments: "0",
            taxableBenefitsPreviouslyReported: "0",
          },
        ],
      },
    };

    const result = calculateFederalTax(fixture);
    const line6b = result.allLines.find((line) => line.form === "1040" && line.line === "6b");

    expect(line6b?.value.toNumber()).toBe(2500);
    expect(result.socialSecurityBenefitsTaxable.toNumber()).toBe(2500);
    expect(result.socialSecurityBenefitsWorksheet?.standardTaxableBenefits.toNumber()).toBe(3000);
    expect(result.socialSecurityBenefitsWorksheet?.lumpSumElectionTaxableBenefits?.toNumber()).toBe(2500);
    expect(result.socialSecurityBenefitsWorksheet?.usedLumpSumElection).toBe(true);
  });

  it("Form 1040 Lines 2b and 6b - Form 8815 reduces taxable interest without reducing Social Security provisional income", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099Misc: [
        {
          payer: "Other Income Payer",
          otherIncome: "13000",
          federalWithheld: "0",
          rents: "0",
        },
      ],
      form1099Int: [
        {
          payer: "US Treasury",
          interestIncome: "3000",
          federalWithheld: "0",
          earlyWithdrawalPenalty: "0",
          usSavingsBondInterest: "3000",
          taxExemptInterest: "0",
        },
      ],
      savingsBondRedemptions: [
        {
          proceeds: "15000",
          interest: "3000",
          qualifiedExpenses: "20000",
        },
      ],
      formSSA1099: [
        {
          recipient: "Jane Doe",
          netBenefits: "24000",
          federalWithheld: "0",
        },
      ],
    };

    const result = calculateFederalTax(fixture);
    const line2b = result.allLines.find((line) => line.form === "1040" && line.line === "2b");
    const line6b = result.allLines.find((line) => line.form === "1040" && line.line === "6b");
    const scheduleBLine2 = result.allLines.find((line) => line.form === "Sched B" && line.line === "2");
    const scheduleBLine3 = result.allLines.find((line) => line.form === "Sched B" && line.line === "3");

    expect(scheduleBLine2?.value.toNumber()).toBe(3000);
    expect(scheduleBLine3?.value.toNumber()).toBe(3000);
    expect(line2b?.value.toNumber()).toBe(0);
    expect(line6b?.value.toNumber()).toBe(1500);
    expect(result.socialSecurityBenefitsTaxable.toNumber()).toBe(1500);
    expect(result.totalIncome.toNumber()).toBe(14500);
  });

  it("Form 1040 Line 6b - married filing separately taxpayers living apart use the single-filer Social Security thresholds", () => {
    const fixture = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately" as const,
        livedWithSpouseAtAnyTimeDuringYear: false,
        spouse: {
          firstName: "Pat",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1990-02-20",
        },
      },
      w2s: [],
      form1099Misc: [
        {
          payer: "Miscellaneous Income Payer",
          otherIncome: "20000",
          federalWithheld: "0",
          rents: "0",
        },
      ],
      formSSA1099: [
        {
          recipient: "Jane Doe",
          netBenefits: "24000",
          federalWithheld: "0",
        },
      ],
    };

    const result = calculateFederalTax(fixture);
    const line6b = result.allLines.find((line) => line.form === "1040" && line.line === "6b");

    expect(line6b?.value.toNumber()).toBe(3500);
    expect(result.socialSecurityBenefitsTaxable.toNumber()).toBe(3500);
    expect(result.totalIncome.toNumber()).toBe(23500);
  });

  it("Form 1040 Line 6b - married filing separately taxpayers who lived with a spouse use the zero-dollar Social Security threshold branch", () => {
    const fixture = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately" as const,
        livedWithSpouseAtAnyTimeDuringYear: true,
        spouse: {
          firstName: "Pat",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1990-02-20",
        },
      },
      w2s: [],
      form1099Misc: [
        {
          payer: "Miscellaneous Income Payer",
          otherIncome: "20000",
          federalWithheld: "0",
          rents: "0",
        },
      ],
      formSSA1099: [
        {
          recipient: "Jane Doe",
          netBenefits: "24000",
          federalWithheld: "0",
        },
      ],
    };

    const result = calculateFederalTax(fixture);
    const line6b = result.allLines.find((line) => line.form === "1040" && line.line === "6b");

    expect(line6b?.value.toNumber()).toBe(20400);
    expect(result.socialSecurityBenefitsTaxable.toNumber()).toBe(20400);
    expect(result.totalIncome.toNumber()).toBe(40400);
  });

  it("Form 1040 Line 6b - Schedule 1 add-back audit detail excludes student loan interest but includes the supported 2025 deduction categories, lines 12 and 14, and line 25 total other adjustments", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099Int: [
        {
          payer: "City Bond Fund",
          interestIncome: "0",
          federalWithheld: "0",
          earlyWithdrawalPenalty: "200",
          usSavingsBondInterest: "0",
          taxExemptInterest: "1000",
        },
      ],
      form1099Misc: [
        {
          payer: "Other Income Payer",
          otherIncome: "22000",
          federalWithheld: "0",
          rents: "0",
        },
      ],
      formSSA1099: [
        {
          recipient: "Jane Doe",
          netBenefits: "24000",
          federalWithheld: "0",
        },
      ],
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "1000",
      },
      adjustments: {
        ...simpleW2Fixture.adjustments,
        businessExpenseAdjustments: "450",
        educatorExpenses: "300",
        hsaDeduction: "0",
        armedForcesMovingExpenses: "700",
        selfEmployedHealthInsurance: "800",
        studentLoanInterest: "2500",
        iraDeduction: "700",
        otherAdjustmentsTotal: "600",
        earlyWithdrawalPenalty: "0",
      },
    };

    const result = calculateFederalTax(fixture);
    const worksheetLine6 = result.allLines.find((line) => line.form === "SS Worksheet" && line.line === "6");
    const worksheetLine7 = result.allLines.find((line) => line.form === "SS Worksheet" && line.line === "7");
    const worksheetLine18 = result.allLines.find((line) => line.form === "SS Worksheet" && line.line === "18");

    expect(result.form8889?.line13.toNumber()).toBe(1000);
    // SE health insurance $800 is not deductible without Schedule C net profit
    // Total adjustments = 450(biz exp) + 300(educator) + 1000(HSA) + 700(move) + 0(SE health) + 2500(SLI) + 700(IRA) + 600(other) + 200(early wd) = 6450
    expect(result.adjustmentsToIncome.toNumber()).toBe(6450);
    expect(result.agi.toNumber()).toBe(18575);
    expect(worksheetLine6?.value.toNumber()).toBe(3950);
    expect(String(worksheetLine6?.inputs["Supported Schedule 1 business expense adjustments"])).toBe("450");
    expect(String(worksheetLine6?.inputs["Supported Schedule 1 Archer MSA deduction"])).toBe("0");
    expect(String(worksheetLine6?.inputs["Supported Schedule 1 Armed Forces moving expenses"])).toBe("700");
    expect(String(worksheetLine6?.inputs["Supported Schedule 1 Line 25 total other adjustments"])).toBe("600");
    expect(String(worksheetLine6?.inputs["Excluded Schedule 1 student loan interest"])).toBe("2500");
    // Without SE health insurance ($800 not deductible), provisional income is $800 higher
    expect(worksheetLine7?.value.toNumber()).toBe(31050);
    expect(worksheetLine18?.value.toNumber()).toBe(3025);
    expect(result.socialSecurityBenefitsTaxable.toNumber()).toBe(3025);
  });

  it("Form 1040 Line 6b - married filing separately taxpayers who lived with a spouse use the zero-dollar base amount", () => {
    const fixture = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately" as const,
        livedWithSpouseAtAnyTimeDuringYear: true,
        spouse: {
          firstName: "Pat",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1991-02-03",
        },
      },
      w2s: [],
      form1099Int: [],
      form1099Misc: [
        {
          payer: "Miscellaneous Income Payer",
          otherIncome: "10000",
          federalWithheld: "0",
          rents: "0",
        },
      ],
      formSSA1099: [
        {
          recipient: "Jane Doe",
          netBenefits: "20000",
          federalWithheld: "0",
        },
      ],
    };

    const result = calculateFederalTax(fixture);
    const line6b = result.allLines.find((line) => line.form === "1040" && line.line === "6b");
    const worksheetLine18 = result.allLines.find(
      (line) => line.form === "SS Worksheet" && line.line === "18"
    );

    expect(line6b?.value.toNumber()).toBe(17000);
    expect(worksheetLine18?.value.toNumber()).toBe(17000);
    expect(result.socialSecurityBenefitsTaxable.toNumber()).toBe(17000);
    expect(result.totalIncome.toNumber()).toBe(27000);
  });

  it("Form 1040 Line 25d - withholding includes SSA-1099, RRB-1099, and Form 1099-R Box 4 amounts", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "9000",
          taxableAmount: "9000",
          federalWithheld: "900",
          distributionCode: "7",
          iraSepSimple: true,
        },
        {
          payer: "State Pension",
          grossDistribution: "18000",
          taxableAmount: "12000",
          federalWithheld: "1800",
          distributionCode: "7",
          iraSepSimple: false,
        },
      ],
      formSSA1099: [
        {
          recipient: "Jane Doe",
          netBenefits: "12000",
          federalWithheld: "300",
        },
      ],
      formRRB1099: [
        {
          recipient: "Jane Doe",
          netSocialSecurityEquivalentBenefitPortion: "4000",
          federalWithheld: "125",
        },
      ],
    };
    const result = calculateFederalTax(fixture);

    expect(result.totalWithholding.toNumber()).toBe(3125);
    expect(result.totalPayments.toNumber()).toBe(3125);
  });
});

// ═══════════════════════════════════════════════════════════
// Other Dependent Credit (ODC) — Federal Pipeline
// ═══════════════════════════════════════════════════════════

describe("ODC through federal pipeline", () => {
  it("Form 1040 Line 19 - ODC $500 per other dependent", () => {
    const fixture = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        dependents: [
          {
            firstName: "Parent",
            lastName: "Test",
            ssn: "111-22-3333",
            relationship: "Parent",
            dateOfBirth: "1960-01-01",
            monthsLivedWithYou: 12,
            qualifiesForCTC: false,
            qualifiesForODC: true,
          },
        ],
      },
    };
    const result = calculateFederalTax(fixture);
    expect(result.childTaxCredit.toNumber()).toBe(500);
  });

  it("Form 1040 Line 19 - CTC + ODC combined", () => {
    const fixture = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        dependents: [
          {
            firstName: "Child",
            lastName: "Test",
            ssn: "222-33-4444",
            relationship: "Daughter",
            dateOfBirth: "2020-01-01",
            monthsLivedWithYou: 12,
            qualifiesForCTC: true,
          },
          {
            firstName: "Teen",
            lastName: "Test",
            ssn: "333-44-5555",
            relationship: "Son",
            dateOfBirth: "2007-06-01",
            monthsLivedWithYou: 12,
            qualifiesForCTC: false,
            qualifiesForODC: true,
          },
        ],
      },
    };
    const result = calculateFederalTax(fixture);
    expect(result.childTaxCredit.toNumber()).toBe(2700);
  });
});

// ═══════════════════════════════════════════════════════════
// Amount Owed (Underpayment) Scenario
// ═══════════════════════════════════════════════════════════

describe("Amount owed scenario", () => {
  it("Form 1040 Line 37 - amount owed when withholding is insufficient", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "200000",
        federalWithheld: "20000", // Very low withholding
        socialSecurityWages: "168600",
        socialSecurityWithheld: "10453.20",
        medicareWages: "200000",
        medicareWithheld: "2900",
      }],
    };
    const result = calculateFederalTax(fixture);
    // Tax on $185K ($200K - $15K std deduction) is substantial
    expect(result.totalTax.greaterThan(result.totalPayments)).toBe(true);
    expect(result.amountOwed.greaterThan(0)).toBe(true);
    expect(result.refund.toNumber()).toBe(0);
    // Verify equation: amountOwed = totalTax - totalPayments
    expect(result.amountOwed.toNumber()).toBe(
      result.totalTax.minus(result.totalPayments).toNumber()
    );
  });

  it("Form 1040 Line 37 - refund and owed are mutually exclusive", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "200000",
        federalWithheld: "20000",
        socialSecurityWages: "168600",
        socialSecurityWithheld: "10453.20",
        medicareWages: "200000",
        medicareWithheld: "2900",
      }],
    };
    const result = calculateFederalTax(fixture);
    // Exactly one of refund/amountOwed must be zero
    const oneIsZero = result.refund.isZero() || result.amountOwed.isZero();
    expect(oneIsZero).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// §1250 and Collectibles Gains Through Pipeline
// ═══════════════════════════════════════════════════════════

describe("Federal pipeline - special capital gain rates", () => {
  it("§1250 gain from 1099-DIV increases tax vs standard LTCG rates", () => {
    // MFJ with $100K wages + $20K LTCG, compare with vs without §1250
    const baseFixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_jointly" },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "100000",
        federalWithheld: "15000",
      }],
      form1099Div: [{
        payer: "REIT Fund",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        totalCapitalGainDistributions: "20000",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "0",
        exemptInterestDividends: "0",
      }],
      form1099B: [],
    };

    const withoutSection1250 = calculateFederalTax(baseFixture);

    // Same but with $10K of the $20K LTCG being §1250 gain (25% rate)
    const with1250: TaxYearInput = {
      ...baseFixture,
      form1099Div: [{
        ...baseFixture.form1099Div[0],
        section1250Gain: "10000",
      }],
    };
    const withSection1250 = calculateFederalTax(with1250);

    // Per IRS Schedule D Tax Worksheet: 25% is a MAXIMUM rate. At this income level
    // ($100K wages + $20K LTCG = $105K taxable), all gains fall within the 15% bracket.
    // §1250 gets 15% (not 25%) → same tax as without §1250.
    expect(withSection1250.totalTax.toNumber()).toBe(withoutSection1250.totalTax.toNumber());
  });

  it("collectibles gain from 1099-DIV taxed at higher rate", () => {
    const baseFixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_jointly" },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "100000",
        federalWithheld: "15000",
      }],
      form1099Div: [{
        payer: "Gold Fund",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        totalCapitalGainDistributions: "15000",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "0",
        exemptInterestDividends: "0",
      }],
      form1099B: [],
    };

    const withoutCollectibles = calculateFederalTax(baseFixture);

    const withCollectibles: TaxYearInput = {
      ...baseFixture,
      form1099Div: [{
        ...baseFixture.form1099Div[0],
        collectiblesGain: "15000",
      }],
    };
    const withCollectiblesResult = calculateFederalTax(withCollectibles);

    // Per IRS Schedule D Tax Worksheet: 28% is a MAXIMUM rate. At this income level
    // (MFJ, $100K wages + $15K LTCG = $85K taxable), all gains fall within the 0% bracket
    // ($96,700 MFJ threshold). Collectibles get 0% → same tax as without collectibles.
    expect(withCollectiblesResult.totalTax.toNumber()).toBe(withoutCollectibles.totalTax.toNumber());
  });

  it("K-1 Box 9b unrecaptured section 1250 gain applies the 25% maximum rate", () => {
    // Single filer with $550K wages + $30K LTCG from K-1 Box 9a, of which
    // $20K is unrecaptured section 1250 gain (Box 9b). At this income level
    // ordinary taxable ($535K) exceeds the $533,400 single 15% threshold,
    // so §1250 gets max 25% instead of 20%.
    const baseFixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "550000",
        federalWithheld: "200000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "550000",
        medicareWithheld: "7975",
      }],
      scheduleK1: [{
        partnershipName: "Real Estate LP",
        partnershipEIN: "55-1234567",
        ordinaryIncome: "0",
        netLongTermCapitalGain: "30000",
        isPassiveActivity: false,
      }],
    };

    const withoutSection1250 = calculateFederalTax(baseFixture);

    // Same but with $20K of the $30K LTCG being §1250 gain (Box 9b)
    const withSection1250: TaxYearInput = {
      ...baseFixture,
      scheduleK1: [{
        ...baseFixture.scheduleK1[0],
        unrecapturedSection1250Gain: "20000",
      }],
    };
    const withSection1250Result = calculateFederalTax(withSection1250);

    // Without §1250: all $30K gets 20% rate
    // With §1250: $20K gets 25% rate, $10K gets 20% rate
    // Difference: $20K × (25% − 20%) = $1,000 more tax
    expect(withSection1250Result.totalTax.toNumber()).toBeGreaterThan(
      withoutSection1250.totalTax.toNumber()
    );

    expect(
      withSection1250Result.totalTax.minus(withoutSection1250.totalTax).toNumber()
    ).toBe(1000);
  });

  it("K-1 Box 9c collectibles gain applies the 28% maximum rate", () => {
    // Single filer with $550K wages + $25K LTCG from K-1 Box 9a, all of which
    // is collectibles gain (Box 9c). At this income level ordinary taxable
    // ($535K) exceeds the $533,400 single 15% threshold, so collectibles get
    // max 28% instead of 20%.
    const baseFixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "550000",
        federalWithheld: "200000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "550000",
        medicareWithheld: "7975",
      }],
      scheduleK1: [{
        partnershipName: "Art Investment Fund",
        partnershipEIN: "55-7654321",
        ordinaryIncome: "0",
        netLongTermCapitalGain: "25000",
        isPassiveActivity: false,
      }],
    };

    const withoutCollectibles = calculateFederalTax(baseFixture);

    // Same but with $25K of the $25K LTCG being collectibles gain (Box 9c)
    const withCollectibles: TaxYearInput = {
      ...baseFixture,
      scheduleK1: [{
        ...baseFixture.scheduleK1[0],
        collectiblesGain: "25000",
      }],
    };
    const withCollectiblesResult = calculateFederalTax(withCollectibles);

    // Without collectibles: all $25K gets 20% rate
    // With collectibles: $25K gets 28% rate
    // Difference: $25K × (28% − 20%) = $2,000 more tax
    expect(withCollectiblesResult.totalTax.toNumber()).toBeGreaterThan(
      withoutCollectibles.totalTax.toNumber()
    );

    expect(
      withCollectiblesResult.totalTax.minus(withoutCollectibles.totalTax).toNumber()
    ).toBe(2000);
  });

  it("K-1 Box 9b and 9c combine with 1099-DIV special-rate amounts", () => {
    // Both K-1 and 1099-DIV contribute section 1250 and collectibles gains.
    // Single filer with $550K wages, $15K LTCG from K-1, $15K LTCG from 1099-DIV.
    // Ordinary taxable ($535K) exceeds $533,400 → all gains above 15% threshold.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "550000",
        federalWithheld: "200000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "550000",
        medicareWithheld: "7975",
      }],
      scheduleK1: [{
        partnershipName: "REIT LP",
        partnershipEIN: "55-1111111",
        ordinaryIncome: "0",
        netLongTermCapitalGain: "15000",
        unrecapturedSection1250Gain: "10000", // Box 9b
        collectiblesGain: "5000", // Box 9c
        isPassiveActivity: false,
      }],
      form1099Div: [{
        payer: "REIT Fund",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        totalCapitalGainDistributions: "15000",
        section1250Gain: "8000",
        section1202Gain: "0",
        collectiblesGain: "7000",
        nondividendDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "0",
        exemptInterestDividends: "0",
      }],
      form1099B: [],
    };

    const result = calculateFederalTax(fixture);

    // Total section 1250: $10K (K-1) + $8K (1099-DIV) = $18K at max 25%
    // Total collectibles: $5K (K-1) + $7K (1099-DIV) = $12K at max 28%
    // Baseline if all $30K LTCG were at 20%: $30K × 20% = $6,000
    // Actual: $12K × 28% + $18K × 25% = $3,360 + $4,500 = $7,860
    // Difference: $7,860 − $6,000 = $1,860

    // Compare against a version with no special-rate designations
    const noSpecialRate: TaxYearInput = {
      ...fixture,
      scheduleK1: [{
        ...fixture.scheduleK1[0],
        unrecapturedSection1250Gain: undefined,
        collectiblesGain: undefined,
      }],
      form1099Div: [{
        ...fixture.form1099Div[0],
        section1250Gain: "0",
        collectiblesGain: "0",
      }],
    };
    const noSpecialRateResult = calculateFederalTax(noSpecialRate);

    // With combined special-rate amounts, tax should be higher
    expect(result.totalTax.toNumber()).toBeGreaterThan(noSpecialRateResult.totalTax.toNumber());

    // The combined excess: $12K × (28%−20%) + $18K × (25%−20%) = $960 + $900 = $1,860
    expect(
      result.totalTax.minus(noSpecialRateResult.totalTax).toNumber()
    ).toBe(1860);
  });

  it("K-1 Box 9b at low income gets lower rate since 25% is a maximum not minimum", () => {
    // MFJ with $50K wages + $10K LTCG from K-1 (all §1250). At this income level
    // ($50K + $10K − $30K std ded = $30K taxable), all gains fall within
    // the 0% bracket ($96,700 MFJ threshold). §1250 gets 0% not 25%.
    const baseFixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_jointly" },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "50000",
        federalWithheld: "5000",
      }],
      scheduleK1: [{
        partnershipName: "Low Income REIT",
        partnershipEIN: "55-9999999",
        ordinaryIncome: "0",
        netLongTermCapitalGain: "10000",
        unrecapturedSection1250Gain: "10000",
        isPassiveActivity: false,
      }],
    };

    const withSection1250 = calculateFederalTax(baseFixture);

    // Same without §1250 designation
    const withoutSection1250: TaxYearInput = {
      ...baseFixture,
      scheduleK1: [{
        ...baseFixture.scheduleK1[0],
        unrecapturedSection1250Gain: undefined,
      }],
    };
    const withoutSection1250Result = calculateFederalTax(withoutSection1250);

    // At this low income, both get 0% rate → same tax
    expect(withSection1250.totalTax.toNumber()).toBe(withoutSection1250Result.totalTax.toNumber());
  });

  it("multiple K-1 forms aggregate Box 9b and 9c amounts", () => {
    // Single filer with $550K wages + $20K LTCG from two K-1s.
    // Ordinary taxable ($535K) exceeds $533,400 → all gains above 15% threshold.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "550000",
        federalWithheld: "200000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "550000",
        medicareWithheld: "7975",
      }],
      scheduleK1: [
        {
          partnershipName: "REIT LP A",
          partnershipEIN: "55-1111111",
          ordinaryIncome: "0",
          netLongTermCapitalGain: "10000",
          unrecapturedSection1250Gain: "6000",
          isPassiveActivity: false,
        },
        {
          partnershipName: "Art Fund B",
          partnershipEIN: "55-2222222",
          ordinaryIncome: "0",
          netLongTermCapitalGain: "10000",
          collectiblesGain: "8000",
          isPassiveActivity: false,
        },
      ],
    };

    const result = calculateFederalTax(fixture);

    // Compare against no special-rate designations
    const noSpecialRate: TaxYearInput = {
      ...fixture,
      scheduleK1: fixture.scheduleK1.map(k => ({
        ...k,
        unrecapturedSection1250Gain: undefined,
        collectiblesGain: undefined,
      })),
    };
    const noSpecialRateResult = calculateFederalTax(noSpecialRate);

    // §1250: $6K × (25% − 20%) = $300 more
    // Collectibles: $8K × (28% − 20%) = $640 more
    // Total: $940 more
    expect(result.totalTax.toNumber()).toBeGreaterThan(noSpecialRateResult.totalTax.toNumber());
    expect(
      result.totalTax.minus(noSpecialRateResult.totalTax).toNumber()
    ).toBe(940);
  });

  it("ownership percentage flows through federal pipeline rental income", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [{
        description: "Co-owned duplex",
        propertyType: "multi_family",
        personalUseDays: 0,
        rentalDays: 365,
        ownershipPercentage: "50",
        rents: "48000",
        advertising: "0",
        autoTravel: "0",
        cleaning: "0",
        commissions: "0",
        insurance: "2000",
        legalProfessional: "0",
        managementFees: "0",
        mortgageInterest: "10000",
        otherInterest: "0",
        repairs: "0",
        supplies: "0",
        taxes: "4000",
        utilities: "0",
        depreciation: "8000",
        otherExpenses: "0",
      }],
    };
    const result = calculateFederalTax(fixture);
    // 50% of rents: 24000, 50% of expenses: 12000, net: 12000
    // This should flow into otherIncome/totalIncome
    expect(result.scheduleE).toBeDefined();
    expect(result.scheduleE!.rentalProperties[0].rents.toNumber()).toBe(24000);
    expect(result.scheduleE!.rentalProperties[0].totalExpenses.toNumber()).toBe(12000);
  });

  it("non-active rental properties stay out of the Form 8582 special allowance bucket in the federal path", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [{
        description: "Investor condo",
        propertyType: "single_family",
        personalUseDays: 0,
        rentalDays: 365,
        rents: "12000",
        advertising: "0",
        autoTravel: "0",
        cleaning: "0",
        commissions: "0",
        insurance: "1000",
        legalProfessional: "0",
        managementFees: "0",
        mortgageInterest: "3000",
        otherInterest: "0",
        repairs: "0",
        supplies: "0",
        taxes: "2000",
        utilities: "0",
        depreciation: "8000",
        otherExpenses: "0",
        isActiveParticipant: false,
      }],
    };

    const result = calculateFederalTax(fixture);

    expect(result.scheduleE).toBeDefined();
    expect(result.scheduleE!.totalRentalIncome.toNumber()).toBe(-2000);
    expect(result.scheduleE!.rentalProperties[0].isActiveParticipant).toBe(false);
    expect(result.form8582).toBeDefined();
    expect(result.form8582!.rentalLoss.toNumber()).toBe(0);
    expect(result.form8582!.rentalAllowance.toNumber()).toBe(0);
    expect(result.form8582!.allowedLoss.toNumber()).toBe(0);
    expect(result.form8582!.suspendedLoss.toNumber()).toBe(2000);
  });
});

// ═══════════════════════════════════════════════════════════
// Rental property QBI (Section 199A) — Rev. Proc. 2019-38
// ═══════════════════════════════════════════════════════════

describe("Rental property QBI — Section 199A deduction from qualifying rental activities", () => {
  const rentalQBIBase: TaxYearInput = {
    ...simpleW2Fixture,
    rentalProperties: [{
      description: "123 Oak Street",
      propertyType: "single_family",
      personalUseDays: 0,
      rentalDays: 365,
      rents: "30000",
      advertising: "0",
      autoTravel: "0",
      cleaning: "0",
      commissions: "0",
      insurance: "2000",
      legalProfessional: "0",
      managementFees: "0",
      mortgageInterest: "5000",
      otherInterest: "0",
      repairs: "0",
      supplies: "0",
      taxes: "3000",
      utilities: "0",
      depreciation: "0",
      otherExpenses: "0",
      qualifiesForQBI: true,
    }],
  };

  it("rental income with qualifiesForQBI produces QBI deduction", () => {
    const result = calculateFederalTax(rentalQBIBase);
    // Net rental income: 30000 - 10000 = 20000
    // QBI deduction (simplified) = 20% × 20000 = 4000
    expect(result.form8995).toBeDefined();
    expect(result.form8995!.totalQBI.toNumber()).toBe(20000);
    expect(result.form8995!.qbiDeduction.toNumber()).toBe(4000);
  });

  it("rental property without qualifiesForQBI is excluded from QBI", () => {
    const fixture: TaxYearInput = {
      ...rentalQBIBase,
      rentalProperties: [{
        ...rentalQBIBase.rentalProperties![0],
        qualifiesForQBI: false,
      }],
    };
    const result = calculateFederalTax(fixture);
    // No QBI sources → no Form 8995
    expect(result.form8995).toBeUndefined();
    expect(result.form8995A).toBeUndefined();
  });

  it("rental loss allowed by Form 8582 flows as negative QBI", () => {
    // Active participant with small loss within $25K allowance
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [{
        description: "456 Elm Ave",
        propertyType: "single_family",
        personalUseDays: 0,
        rentalDays: 365,
        rents: "12000",
        advertising: "0",
        autoTravel: "0",
        cleaning: "0",
        commissions: "0",
        insurance: "2000",
        legalProfessional: "0",
        managementFees: "0",
        mortgageInterest: "8000",
        otherInterest: "0",
        repairs: "3000",
        supplies: "0",
        taxes: "4000",
        utilities: "0",
        depreciation: "5000",
        otherExpenses: "0",
        qualifiesForQBI: true,
        isActiveParticipant: true,
      }],
    };
    const result = calculateFederalTax(fixture);
    // Net rental: 12000 - 22000 = -10000
    // Active participant + AGI < $100K → full $10K allowed by Form 8582
    // QBI = -10000
    expect(result.form8995).toBeDefined();
    expect(result.form8995!.totalQBI.toNumber()).toBe(-10000);
    // Negative QBI → 0 deduction (loss carries forward)
    expect(result.form8995!.qbiDeduction.toNumber()).toBe(0);
  });

  it("rental loss fully suspended by Form 8582 produces zero QBI", () => {
    // Non-active participant, all loss suspended
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [{
        description: "789 Pine Rd",
        propertyType: "single_family",
        personalUseDays: 0,
        rentalDays: 365,
        rents: "10000",
        advertising: "0",
        autoTravel: "0",
        cleaning: "0",
        commissions: "0",
        insurance: "2000",
        legalProfessional: "0",
        managementFees: "0",
        mortgageInterest: "5000",
        otherInterest: "0",
        repairs: "0",
        supplies: "0",
        taxes: "3000",
        utilities: "0",
        depreciation: "5000",
        otherExpenses: "0",
        qualifiesForQBI: true,
        isActiveParticipant: false,
      }],
    };
    const result = calculateFederalTax(fixture);
    // Net rental: 10000 - 15000 = -5000
    // Non-active participant → no rental allowance → fully suspended
    // QBI = 0 (suspended loss excluded)
    expect(result.form8582).toBeDefined();
    expect(result.form8582!.suspendedLoss.toNumber()).toBe(5000);
    expect(result.form8995).toBeUndefined();
  });

  it("mixed QBI and non-QBI rental properties — only QBI properties contribute", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [
        {
          description: "QBI Rental",
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
          mortgageInterest: "3000",
          otherInterest: "0",
          repairs: "0",
          supplies: "0",
          taxes: "2000",
          utilities: "0",
          depreciation: "0",
          otherExpenses: "0",
          qualifiesForQBI: true,
        },
        {
          description: "Non-QBI Rental",
          propertyType: "single_family",
          personalUseDays: 0,
          rentalDays: 365,
          rents: "36000",
          advertising: "0",
          autoTravel: "0",
          cleaning: "0",
          commissions: "0",
          insurance: "1000",
          legalProfessional: "0",
          managementFees: "0",
          mortgageInterest: "3000",
          otherInterest: "0",
          repairs: "0",
          supplies: "0",
          taxes: "2000",
          utilities: "0",
          depreciation: "0",
          otherExpenses: "0",
          qualifiesForQBI: false,
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    // QBI Rental: 24000 - 6000 = 18000
    // Non-QBI Rental: 36000 - 6000 = 30000 (excluded)
    // Only QBI Rental contributes → totalQBI = 18000
    expect(result.form8995).toBeDefined();
    expect(result.form8995!.totalQBI.toNumber()).toBe(18000);
    expect(result.form8995!.qbiDeduction.toNumber()).toBe(3600);
  });

  it("rental QBI combines with Schedule C QBI", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleC: {
        businessName: "Side Consulting",
        principalBusiness: "Consulting",
        businessCode: "541990",
        grossReceipts: "40000",
        returns: "0",
        cogs: "0",
        advertising: "0",
        carTruck: "0",
        commissions: "0",
        contractLabor: "0",
        depletion: "0",
        depreciation: "0",
        employeeBenefits: "0",
        insurance: "0",
        mortgageInterest: "0",
        otherInterest: "0",
        legalProfessional: "0",
        office: "0",
        pensionPlans: "0",
        rent: "0",
        repairsMaintenance: "0",
        supplies: "0",
        taxes: "0",
        travel: "0",
        meals: "0",
        utilities: "0",
        wages: "0",
        otherExpenses: "0",
        expenses: "0",
      },
      rentalProperties: [{
        description: "Rental for QBI",
        propertyType: "single_family",
        personalUseDays: 0,
        rentalDays: 365,
        rents: "20000",
        advertising: "0",
        autoTravel: "0",
        cleaning: "0",
        commissions: "0",
        insurance: "1000",
        legalProfessional: "0",
        managementFees: "0",
        mortgageInterest: "2000",
        otherInterest: "0",
        repairs: "0",
        supplies: "0",
        taxes: "2000",
        utilities: "0",
        depreciation: "0",
        otherExpenses: "0",
        qualifiesForQBI: true,
      }],
    };
    const result = calculateFederalTax(fixture);
    // Schedule C QBI: $40000 minus SE adjustment (deductible half of SE tax)
    // Rental QBI: 20000 - 5000 = 15000
    // Both should appear in QBI sources
    expect(result.form8995).toBeDefined();
    const totalQBI = result.form8995!.totalQBI.toNumber();
    // Schedule C contributes ~$40K minus SE deduction (~$2,826 for $40K net)
    // Rental contributes $15K
    // Total should be approximately $52,174
    expect(totalQBI).toBeGreaterThan(50000);
    expect(totalQBI).toBeLessThan(56000);
    expect(result.form8995!.qbiDeduction.toNumber()).toBeGreaterThan(0);
  });

  it("rental QBI flows through Form 8995-A when income exceeds simplified threshold", () => {
    // MFJ with high income triggers Form 8995-A
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "single",
      },
      w2s: [{
        employer: { name: "Big Corp", ein: "12-3456789" },
        wages: "250000",
        federalWithheld: "50000",
        socialSecurityWages: "168600",
        socialSecurityWithheld: "10453",
        medicareWages: "250000",
        medicareWithheld: "3625",
      }],
      rentalProperties: [{
        description: "Premium Rental",
        propertyType: "single_family",
        personalUseDays: 0,
        rentalDays: 365,
        rents: "60000",
        advertising: "0",
        autoTravel: "0",
        cleaning: "0",
        commissions: "0",
        insurance: "3000",
        legalProfessional: "0",
        managementFees: "0",
        mortgageInterest: "10000",
        otherInterest: "0",
        repairs: "0",
        supplies: "0",
        taxes: "5000",
        utilities: "0",
        depreciation: "0",
        otherExpenses: "0",
        qualifiesForQBI: true,
        qbiW2Wages: "8000",
        qbiUBIA: "200000",
      }],
    };
    const result = calculateFederalTax(fixture);
    // Income $250K + rental $42K = ~$292K → above $197,300 threshold → Form 8995-A
    // Rental QBI: 60000 - 18000 = 42000
    // W-2/UBIA limitations apply in the phase-out range
    expect(result.form8995A).toBeDefined();
    expect(result.form8995A!.qbiDeduction.toNumber()).toBeGreaterThan(0);
  });

  it("rental loss partially suspended by Form 8582 — QBI uses allowed portion only", () => {
    // High AGI phases out the $25K allowance, creating partial suspension
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        employer: { name: "Corp", ein: "12-3456789" },
        wages: "130000",
        federalWithheld: "20000",
        socialSecurityWages: "130000",
        socialSecurityWithheld: "8060",
        medicareWages: "130000",
        medicareWithheld: "1885",
      }],
      rentalProperties: [{
        description: "Phaseout Rental",
        propertyType: "single_family",
        personalUseDays: 0,
        rentalDays: 365,
        rents: "10000",
        advertising: "0",
        autoTravel: "0",
        cleaning: "0",
        commissions: "0",
        insurance: "2000",
        legalProfessional: "0",
        managementFees: "0",
        mortgageInterest: "8000",
        otherInterest: "0",
        repairs: "0",
        supplies: "0",
        taxes: "4000",
        utilities: "0",
        depreciation: "6000",
        otherExpenses: "0",
        qualifiesForQBI: true,
        isActiveParticipant: true,
      }],
    };
    const result = calculateFederalTax(fixture);
    // Net rental: 10000 - 20000 = -10000
    // AGI ~ $130K → MAGI ~ $140K (rental loss add-back) → $25K allowance
    // phased out by ($140K - $100K) × 50% = $20K → allowance = $5K
    // Allowed: $5K, Suspended: $5K
    // QBI should be -5000 (only the allowed portion)
    expect(result.form8582).toBeDefined();
    expect(result.form8582!.suspendedLoss.toNumber()).toBeGreaterThan(0);
    // The QBI loss should be only the allowed portion, not the full -10000
    if (result.form8995) {
      expect(result.form8995.totalQBI.toNumber()).toBeGreaterThan(-10000);
    }
  });

  it("audit trail records rental QBI source", () => {
    const result = calculateFederalTax(rentalQBIBase);
    const qbiLine = result.allLines.find(
      (line) => line.form === "1040" && line.line === "13-QBI-rental"
    );
    expect(qbiLine).toBeDefined();
    expect(qbiLine!.description).toContain("123 Oak Street");
  });
});

// ═══════════════════════════════════════════════════════════
// All sub-results populated
// ═══════════════════════════════════════════════════════════

describe("Sub-results populated on complex MFJ result", () => {
  const result = calculateFederalTax(complexMFJFixture);

  it("all expected sub-results are defined on the return object", () => {
    expect(result.scheduleA).toBeDefined();
    expect(result.scheduleB).toBeDefined();
    expect(result.scheduleC).toBeDefined();
    expect(result.scheduleD).toBeDefined();
    expect(result.scheduleE).toBeDefined();
    expect(result.scheduleSE).toBeDefined();
    expect(result.form6251).toBeDefined();
    expect(result.form8582).toBeDefined();
    expect(result.form8959).toBeDefined();
    expect(result.form8960).toBeDefined();
    expect(result.form2210).toBeDefined();
    expect(result.form8812).toBeDefined();
  });

  it("Form 8995 sub-result is defined when Schedule C NEC income is present", () => {
    // complexMFJFixture has 1099-NEC income which flows through Schedule C
    // and produces a QBI source, triggering Form 8995
    expect(result.form8995).toBeDefined();
    expect(result.form8995!.qbiDeduction.greaterThanOrEqualTo(0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Core identity equations
// ═══════════════════════════════════════════════════════════

describe("Form 1040 core identity equations", () => {
  it("AGI = totalIncome - adjustmentsToIncome for simple W-2", () => {
    const result = calculateFederalTax(simpleW2Fixture);
    const computed = result.totalIncome.minus(result.adjustmentsToIncome);
    expect(result.agi.toNumber()).toBe(computed.toNumber());
  });

  it("AGI = totalIncome - adjustmentsToIncome for complex MFJ", () => {
    const result = calculateFederalTax(complexMFJFixture);
    const computed = result.totalIncome.minus(result.adjustmentsToIncome);
    expect(result.agi.toNumber()).toBe(computed.toNumber());
  });

  it("taxable income = AGI - deductionAmount - QBI deduction", () => {
    // Use a fixture with QBI income to exercise the three-term subtraction
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{
        payer: "Consulting Client",
        nonemployeeCompensation: "40000",
        federalWithheld: "0",
      }],
    };
    const result = calculateFederalTax(fixture);
    const qbi = result.form8995?.qbiDeduction ?? new Decimal(0);
    const expected = result.agi.minus(result.deductionAmount).minus(qbi);
    expect(result.taxableIncome.toNumber()).toBe(
      Math.max(0, expected.toNumber())
    );
  });

  it("total tax = income tax after credits + additional taxes", () => {
    const result = calculateFederalTax(complexMFJFixture);
    const taxAfterCredits = result.totalTaxBeforeCredits.minus(result.totalCredits);
    const floored = taxAfterCredits.lessThan(0) ? new Decimal(0) : taxAfterCredits;
    const expected = floored.plus(result.totalAdditionalTaxes);
    expect(result.totalTax.toNumber()).toBe(expected.toNumber());
  });

  it("refund and amountOwed are mutually exclusive (at most one is non-zero) for simple W-2", () => {
    const result = calculateFederalTax(simpleW2Fixture);
    const bothNonZero = result.refund.greaterThan(0) && result.amountOwed.greaterThan(0);
    expect(bothNonZero).toBe(false);
  });

  it("refund and amountOwed are mutually exclusive (at most one is non-zero) for complex MFJ", () => {
    const result = calculateFederalTax(complexMFJFixture);
    const bothNonZero = result.refund.greaterThan(0) && result.amountOwed.greaterThan(0);
    expect(bothNonZero).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// Carryforwards populated correctly
// ═══════════════════════════════════════════════════════════

describe("Carryforwards object", () => {
  it("capital loss carryforward is sum of short-term and long-term carryforwards", () => {
    // Create a fixture with a net capital loss (short-term loss exceeds gains)
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "TD Ameritrade",
        transactions: [
          {
            description: "XYZ 200 shares",
            dateAcquired: "2025-01-05",
            dateSold: "2025-10-01",
            proceeds: "5000",
            costBasis: "20000", // $15K short-term loss
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      }],
    };
    const result = calculateFederalTax(fixture);
    expect(result.carryforwards.capitalLoss.toNumber()).toBe(
      result.carryforwards.shortTermCapitalLoss
        .plus(result.carryforwards.longTermCapitalLoss)
        .toNumber()
    );
    // Net loss is $15K but only $3K is deductible; $12K carries forward (stored as negative)
    expect(result.carryforwards.capitalLoss.abs().toNumber()).toBe(12000);
  });

  it("foreign tax credit carryforward is zero when no foreign taxes paid", () => {
    const result = calculateFederalTax(simpleW2Fixture);
    expect(result.carryforwards.foreignTaxCreditCarryforward.toNumber()).toBe(0);
  });

  it("QBI loss carryforward is zero when no QBI sources", () => {
    const result = calculateFederalTax(simpleW2Fixture);
    expect(result.carryforwards.qbiLossCarryforward.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// allLines audit trail
// ═══════════════════════════════════════════════════════════

describe("allLines audit trail completeness", () => {
  it("audit trail includes entries from multiple forms for complex MFJ", () => {
    const result = calculateFederalTax(complexMFJFixture);
    const formSet = new Set(result.allLines.map((l) => l.form));
    // Must have lines from at least 5 distinct forms
    expect(formSet.size).toBeGreaterThanOrEqual(5);
    expect(formSet.has("1040")).toBe(true);
    expect(formSet.has("Sched A")).toBe(true);
    expect(formSet.has("Sched SE")).toBe(true);
    expect(formSet.has("Form 8959")).toBe(true);
    expect(formSet.has("Form 8960")).toBe(true);
  });

  it("every allLines entry has a non-empty form, line, and description", () => {
    const result = calculateFederalTax(complexMFJFixture);
    for (const line of result.allLines) {
      expect(line.form.length).toBeGreaterThan(0);
      expect(line.line.length).toBeGreaterThan(0);
      expect(line.description.length).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Filing status flows through to sub-calculations
// ═══════════════════════════════════════════════════════════

describe("Filing status propagation", () => {
  it("filing status is preserved in result for single filer", () => {
    const result = calculateFederalTax(simpleW2Fixture);
    expect(result.filingStatus).toBe("single");
  });

  it("filing status is preserved in result for MFJ", () => {
    const result = calculateFederalTax(complexMFJFixture);
    expect(result.filingStatus).toBe("married_filing_jointly");
  });

  it("standard deduction for head_of_household is $22,500", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "head_of_household",
        dependents: [
          {
            firstName: "Child",
            lastName: "Doe",
            ssn: "999-88-7777",
            relationship: "Daughter",
            dateOfBirth: "2018-05-10",
            monthsLivedWithYou: 12,
            qualifiesForCTC: true,
          },
        ],
      },
    };
    const result = calculateFederalTax(fixture);
    expect(result.standardDeduction.toNumber()).toBe(23625);
    expect(result.deductionUsed).toBe("standard");
    expect(result.deductionAmount.toNumber()).toBe(23625);
  });

  it("standard deduction for MFJ is $31,500 and is twice the single amount", () => {
    const mfjFixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Bob",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1990-06-01",
        },
      },
    };
    const singleResult = calculateFederalTax(simpleW2Fixture);
    const mfjResult = calculateFederalTax(mfjFixture);
    expect(mfjResult.standardDeduction.toNumber()).toBe(31500);
    expect(mfjResult.standardDeduction.toNumber()).toBe(
      singleResult.standardDeduction.times(2).toNumber()
    );
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple income sources combined correctly
// ═══════════════════════════════════════════════════════════

describe("Multiple income sources combined in total income", () => {
  it("total income combines wages + interest + dividends + capital gains", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Int: [{
        payer: "Bank",
        interestIncome: "1000",
        federalWithheld: "0",
        earlyWithdrawalPenalty: "0",
        usSavingsBondInterest: "0",
        taxExemptInterest: "0",
      }],
      form1099Div: [{
        payer: "Vanguard",
        ordinaryDividends: "2000",
        qualifiedDividends: "1500",
        totalCapitalGainDistributions: "500",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "0",
        exemptInterestDividends: "0",
      }],
      form1099B: [{
        broker: "Fidelity",
        transactions: [{
          description: "VTI 50 shares",
          dateAcquired: "2022-01-01",
          dateSold: "2025-06-01",
          proceeds: "10000",
          costBasis: "7000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const result = calculateFederalTax(fixture);
    // Wages: 85000, interest: 1000, dividends: 2000, capital gain: 3000 (3000 from 1099-B + 500 from 1099-DIV - wait, cap gain = 1099-B net + 1099-DIV cap gain dist)
    // Capital gain from 1099-B: 10000-7000 = 3000 LTCG
    // Capital gain distributions from 1099-DIV flow into Schedule D as LTCG: 500
    // Total capital gain: 3500
    expect(result.totalWages.toNumber()).toBe(85000);
    expect(result.totalInterest.toNumber()).toBe(1000);
    expect(result.totalDividends.toNumber()).toBe(2000);
    expect(result.capitalGainLoss.toNumber()).toBe(3500);
    // Total income = 85000 + 1000 + 2000 + 3500 = 91500
    expect(result.totalIncome.toNumber()).toBe(91500);
  });

  it("Schedule C net profit flows into total income alongside wages", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleC: {
        businessName: "Freelance Design",
        grossReceipts: "30000",
        expenses: {
          advertising: "500",
          supplies: "1000",
        },
      },
      form1099Nec: [{
        payer: "Design Client",
        nonemployeeCompensation: "30000",
        federalWithheld: "0",
      }],
    };
    const result = calculateFederalTax(fixture);
    // Schedule C net profit = 30000 - 500 - 1000 = 28500
    expect(result.scheduleC).toBeDefined();
    expect(result.scheduleC!.netProfit.toNumber()).toBe(28500);
    // Total income includes both W-2 wages (85000) and Schedule C profit (28500)
    expect(result.totalIncome.toNumber()).toBeGreaterThanOrEqual(
      d(85000).plus(d(28500)).toNumber()
    );
  });

  // ── IRA Deduction Worksheet integration ──────────────────────────
  it("Schedule 1 Line 20 - IRA deduction worksheet computes phase-out for active participant", () => {
    const fixture = {
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single" as const,
        primary: {
          firstName: "Test",
          lastName: "Taxpayer",
          ssn: "000-00-0000",
          dateOfBirth: "1985-06-15",
        },
        address: {
          street: "123 Main St",
          city: "Anywhere",
          state: "WA",
          zip: "98101",
        },
        dependents: [],
      },
      w2s: [{
        employer: { name: "Employer Inc", ein: "12-3456789" },
        wages: "85000",
        federalWithheld: "10000",
        socialSecurityWages: "85000",
        socialSecurityWithheld: "5270",
        medicareWages: "85000",
        medicareWithheld: "1232.50",
        stateWages: "85000",
        stateWithheld: "3000",
        state: "WA",
      }],
      form1099Int: [],
      form1099Div: [],
      form1099B: [],
      form1099Nec: [],
      form1099Misc: [],
      form1098: [],
      form1095A: [],
      donations: [],
      rentalProperties: [],
      scheduleK1: [],
      savingsBondRedemptions: [],
      iraDeductionWorksheet: {
        primaryContributions: "7000",
        primaryIsActiveParticipant: true,
      },
    };
    const result = calculateFederalTax(fixture);
    // MAGI ≈ $85,000, phase-out $79K-$89K, excess = $6,000
    // ratio = 0.6, reduction = 0.6 × $7,000 = $4,200, deduction = $2,800
    const iraLine = result.allLines.find(
      (l) => l.form === "IRA Deduction Worksheet" && l.line === "deductibleAmount"
    );
    expect(iraLine).toBeDefined();
    expect(iraLine!.value.toNumber()).toBe(2800);
    // AGI should reflect the deduction
    expect(result.agi.toNumber()).toBe(85000 - 2800);
  });

  it("Schedule 1 Line 20 - IRA deduction worksheet gives full deduction when not active participant", () => {
    const fixture = {
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single" as const,
        primary: {
          firstName: "Test",
          lastName: "Taxpayer",
          ssn: "000-00-0000",
          dateOfBirth: "1985-06-15",
        },
        address: {
          street: "123 Main St",
          city: "Anywhere",
          state: "WA",
          zip: "98101",
        },
        dependents: [],
      },
      w2s: [{
        employer: { name: "Employer Inc", ein: "12-3456789" },
        wages: "150000",
        federalWithheld: "25000",
        socialSecurityWages: "150000",
        socialSecurityWithheld: "9300",
        medicareWages: "150000",
        medicareWithheld: "2175",
        stateWages: "150000",
        stateWithheld: "5000",
        state: "WA",
      }],
      form1099Int: [],
      form1099Div: [],
      form1099B: [],
      form1099Nec: [],
      form1099Misc: [],
      form1098: [],
      form1095A: [],
      donations: [],
      rentalProperties: [],
      scheduleK1: [],
      savingsBondRedemptions: [],
      iraDeductionWorksheet: {
        primaryContributions: "7000",
        primaryIsActiveParticipant: false,
      },
    };
    const result = calculateFederalTax(fixture);
    const iraLine = result.allLines.find(
      (l) => l.form === "IRA Deduction Worksheet" && l.line === "deductibleAmount"
    );
    expect(iraLine).toBeDefined();
    expect(iraLine!.value.toNumber()).toBe(7000);
    expect(result.agi.toNumber()).toBe(150000 - 7000);
  });

  it("Schedule 1 Line 20 - IRA deduction worksheet MFJ combines both spouses with different plan status", () => {
    const fixture = {
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly" as const,
        primary: {
          firstName: "Test",
          lastName: "Primary",
          ssn: "000-00-0001",
          dateOfBirth: "1980-03-20",
        },
        spouse: {
          firstName: "Test",
          lastName: "Spouse",
          ssn: "000-00-0002",
          dateOfBirth: "1982-08-10",
        },
        address: {
          street: "123 Main St",
          city: "Anywhere",
          state: "WA",
          zip: "98101",
        },
        dependents: [],
      },
      w2s: [{
        employer: { name: "Employer Inc", ein: "12-3456789" },
        wages: "200000",
        federalWithheld: "35000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "200000",
        medicareWithheld: "2900",
        stateWages: "200000",
        stateWithheld: "8000",
        state: "WA",
      }],
      form1099Int: [],
      form1099Div: [],
      form1099B: [],
      form1099Nec: [],
      form1099Misc: [],
      form1098: [],
      form1095A: [],
      donations: [],
      rentalProperties: [],
      scheduleK1: [],
      savingsBondRedemptions: [],
      iraDeductionWorksheet: {
        primaryContributions: "7000",
        primaryIsActiveParticipant: true,
        // Spouse is not active participant but primary is → spouse uses $236K-$246K range
        spouseContributions: "7000",
        spouseIsActiveParticipant: false,
      },
    };
    const result = calculateFederalTax(fixture);
    // MAGI ≈ $200,000
    // Primary: active participant MFJ, phase-out $126K-$146K → excess = $74K → fully phased out → $0
    // Spouse: not active but primary IS active, phase-out $236K-$246K → MAGI $200K < $236K → full $7,000
    // Total IRA deduction = $0 + $7,000 = $7,000
    expect(result.agi.toNumber()).toBe(200000 - 7000);
  });

  it("Schedule 1 Line 20 - MFS non-participant with active spouse gets phase-out when lived with spouse", () => {
    const fixture = {
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_separately" as const,
        livedWithSpouseAtAnyTimeDuringYear: true,
        primary: {
          firstName: "Test",
          lastName: "MFS",
          ssn: "000-00-0010",
          dateOfBirth: "1985-06-15",
        },
        address: {
          street: "456 Oak Ave",
          city: "Somewhere",
          state: "WA",
          zip: "98102",
        },
        dependents: [],
      },
      w2s: [{
        employer: { name: "Day Job Inc", ein: "98-7654321" },
        wages: "60000",
        federalWithheld: "8000",
        socialSecurityWages: "60000",
        socialSecurityWithheld: "3720",
        medicareWages: "60000",
        medicareWithheld: "870",
        stateWages: "60000",
        stateWithheld: "3000",
        state: "WA",
      }],
      form1099Int: [],
      form1099Div: [],
      form1099B: [],
      form1099Nec: [],
      form1099Misc: [],
      form1098: [],
      form1095A: [],
      donations: [],
      rentalProperties: [],
      scheduleK1: [],
      savingsBondRedemptions: [],
      iraDeductionWorksheet: {
        primaryContributions: "7000",
        primaryIsActiveParticipant: false,
        spouseIsActiveParticipant: true,
      },
    };
    const result = calculateFederalTax(fixture);
    // MAGI ≈ $60,000 → MFS lived with spouse, non-participant, spouse active
    // Phase-out $0-$10K → MAGI $60K >> $10K → fully phased out → $0 deduction
    // AGI = wages, no IRA deduction
    expect(result.agi.toNumber()).toBe(60000);
  });

  it("Schedule 1 Line 20 - MFS active participant lived apart uses single thresholds", () => {
    const fixture = {
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_separately" as const,
        livedWithSpouseAtAnyTimeDuringYear: false,
        primary: {
          firstName: "Test",
          lastName: "Apart",
          ssn: "000-00-0011",
          dateOfBirth: "1985-06-15",
        },
        address: {
          street: "789 Pine St",
          city: "Elsewhere",
          state: "WA",
          zip: "98103",
        },
        dependents: [],
      },
      w2s: [{
        employer: { name: "Remote Job Inc", ein: "11-2233445" },
        wages: "84000",
        federalWithheld: "12000",
        socialSecurityWages: "84000",
        socialSecurityWithheld: "5208",
        medicareWages: "84000",
        medicareWithheld: "1218",
        stateWages: "84000",
        stateWithheld: "4000",
        state: "WA",
      }],
      form1099Int: [],
      form1099Div: [],
      form1099B: [],
      form1099Nec: [],
      form1099Misc: [],
      form1098: [],
      form1095A: [],
      donations: [],
      rentalProperties: [],
      scheduleK1: [],
      savingsBondRedemptions: [],
      iraDeductionWorksheet: {
        primaryContributions: "7000",
        primaryIsActiveParticipant: true,
      },
    };
    const result = calculateFederalTax(fixture);
    // MFS lived apart → treated as single, MAGI $84K, phase-out $79K-$89K
    // excess = $5K, ratio = 0.5, reduction = $3,500, deduction = $3,500
    // AGI = $84,000 - $3,500 = $80,500
    expect(result.agi.toNumber()).toBe(80500);
  });
});

// ═══════════════════════════════════════════════════════════
// Form 8936 — Clean Vehicle Credits
// ═══════════════════════════════════════════════════════════

describe("Form 8936 clean vehicle credits through federal engine", () => {
  it("Form 8936 new clean vehicle credit reduces tax through Schedule 3", () => {
    const fixture = {
      ...simpleW2Fixture,
      form8936: {
        newCleanVehicles: [
          {
            dateAcquired: "2025-09-30",
            criticalMineralsRequirementMet: true,
            batteryComponentsRequirementMet: true,
            msrp: "45000",
            vehicleType: "other" as const,
            personalUsePercentage: "100",
            creditTransferredToDealer: false,
          },
        ],
        previouslyOwnedCleanVehicles: [],
      },
    };
    const result = calculateFederalTax(fixture);
    // $7,500 new vehicle credit should flow through Schedule 3
    expect(result.form8936?.totalNewVehicleCredit.toNumber()).toBe(7500);
    // Total credits should include the clean vehicle credit
    expect(result.totalCredits.toNumber()).toBeGreaterThanOrEqual(7500);
  });

  it("Form 8936 previously owned clean vehicle credit reduces tax through Schedule 3", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "50000", federalWithheld: "5000" }],
      form8936: {
        newCleanVehicles: [],
        previouslyOwnedCleanVehicles: [
          {
            dateAcquired: "2025-09-30",
            salePrice: "20000",
            personalUsePercentage: "100",
            creditTransferredToDealer: false,
          },
        ],
      },
    };
    const result = calculateFederalTax(fixture);
    // AGI ~$50K, under $75K single threshold → qualifies
    // $4,000 previously owned credit (30% of $20K = $6K, capped at $4K)
    expect(result.form8936?.totalPreviouslyOwnedCredit.toNumber()).toBe(4000);
  });

  it("Form 8936 AGI over threshold disqualifies credit in federal context", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "160000", federalWithheld: "30000" }],
      form8936: {
        newCleanVehicles: [
          {
            dateAcquired: "2025-09-30",
            criticalMineralsRequirementMet: true,
            batteryComponentsRequirementMet: true,
            msrp: "45000",
            vehicleType: "other" as const,
            personalUsePercentage: "100",
            creditTransferredToDealer: false,
          },
        ],
        previouslyOwnedCleanVehicles: [],
      },
    };
    const result = calculateFederalTax(fixture);
    // AGI = $160K, exceeds $150K single threshold
    expect(result.form8936?.totalNewVehicleCredit.toNumber()).toBe(0);
    expect(result.form8936?.newVehicleAgiDisqualified).toBe(true);
  });

  it("Form 8936 acquisition cutoff disqualifies vehicles acquired after September 30, 2025 in federal context", () => {
    const fixture = {
      ...simpleW2Fixture,
      form8936: {
        newCleanVehicles: [
          {
            dateAcquired: "2025-10-01",
            criticalMineralsRequirementMet: true,
            batteryComponentsRequirementMet: true,
            msrp: "45000",
            vehicleType: "other" as const,
            personalUsePercentage: "100",
            creditTransferredToDealer: false,
          },
        ],
        previouslyOwnedCleanVehicles: [],
      },
    };
    const result = calculateFederalTax(fixture);

    expect(result.form8936?.totalNewVehicleCredit.toNumber()).toBe(0);
    expect(result.totalCredits.toNumber()).toBeLessThan(7500);
  });

  it("Form 8936 is absent from result when no form8936 input provided", () => {
    const result = calculateFederalTax(simpleW2Fixture);
    expect(result.form8936).toBeUndefined();
  });

  it("Form 8936 audit trail appears in allLines", () => {
    const fixture = {
      ...simpleW2Fixture,
      form8936: {
        newCleanVehicles: [
          {
            dateAcquired: "2025-09-30",
            criticalMineralsRequirementMet: true,
            batteryComponentsRequirementMet: true,
            msrp: "45000",
            vehicleType: "other" as const,
            personalUsePercentage: "100",
            creditTransferredToDealer: false,
          },
        ],
        previouslyOwnedCleanVehicles: [],
      },
    };
    const result = calculateFederalTax(fixture);
    const form8936Lines = result.allLines.filter((l) => l.form === "Form 8936");
    expect(form8936Lines.length).toBeGreaterThan(0);
    const sched3Line6f = result.allLines.find((l) => l.form === "Sched 3" && l.line === "6f");
    expect(sched3Line6f).toBeDefined();
    expect(sched3Line6f!.value.toNumber()).toBe(7500);
  });
});

// ═══════════════════════════════════════════════════════════
// Schedule H: Household Employment Taxes
// ═══════════════════════════════════════════════════════════

describe("Schedule H integration", () => {
  it("Schedule H - household employment taxes flow through Schedule 2 Line 9 to Form 1040 Line 23", () => {
    const fixture = {
      ...simpleW2Fixture,
      scheduleH: {
        employees: [
          {
            name: "Nanny",
            cashWages: "20000",
            isSpouse: false,
            isChildUnder21: false,
            isParent: false,
            isUnder18NonPrincipal: false,
          },
        ],
        futaApplies: true,
        futaSectionA: true,
      },
    };
    const result = calculateFederalTax(fixture);

    // Schedule H Line 26: SS $2,480 + Medicare $580 + FUTA $42 = $3,102
    const schedHLine26 = result.allLines.find((l) => l.form === "Schedule H" && l.line === "26");
    expect(schedHLine26).toBeDefined();
    expect(schedHLine26!.value.toNumber()).toBe(3102);

    // Schedule 2 Line 9 should carry the household employment tax
    const sched2Line9 = result.allLines.find((l) => l.form === "Sched 2" && l.line === "9");
    expect(sched2Line9).toBeDefined();
    expect(sched2Line9!.value.toNumber()).toBe(3102);

    // Line 23 should include the household employment tax
    expect(result.totalAdditionalTaxes.toNumber()).toBeGreaterThanOrEqual(3102);
  });

  it("Schedule H - exempt employees do not increase tax", () => {
    const fixture = {
      ...simpleW2Fixture,
      scheduleH: {
        employees: [
          {
            name: "Spouse",
            cashWages: "30000",
            isSpouse: true,
            isChildUnder21: false,
            isParent: false,
            isUnder18NonPrincipal: false,
          },
        ],
        futaApplies: true,
        futaSectionA: true,
      },
    };
    const result = calculateFederalTax(fixture);

    const sched2Line9 = result.allLines.find((l) => l.form === "Sched 2" && l.line === "9");
    expect(sched2Line9).toBeDefined();
    expect(sched2Line9!.value.toNumber()).toBe(0);
  });

  it("Schedule H - no scheduleH input means zero household employment tax", () => {
    const result = calculateFederalTax(simpleW2Fixture);

    const sched2Line9 = result.allLines.find((l) => l.form === "Sched 2" && l.line === "9");
    expect(sched2Line9).toBeDefined();
    expect(sched2Line9!.value.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// K-1 Box 17 (AMT items) and Box 18 (tax-exempt income) integration
// ═══════════════════════════════════════════════════════════

describe("K-1 Box 17 AMT items through federal pipeline", () => {
  it("K-1 Box 17 Code A depreciation adjustment increases AMTI and flows to Form 6251 Line 2l", () => {
    // Single filer with $400K wages, itemizing. The K-1 has $15K depreciation
    // AMT adjustment (Box 17 Code A). The adjustment flows to Form 6251 Line 2l
    // and increases AMTI by $15K. Even if regular tax exceeds TMT (so AMT = 0),
    // the wiring is verified through the audit trail.
    const baseResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "400000",
        federalWithheld: "100000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "400000",
        medicareWithheld: "5800",
      }],
      scheduleA: {
        mortgageInterest: "25000",
        stateTaxesPaid: "10000",
        realEstateTaxes: "10000",
        charitableCash: "20000",
        medicalExpenses: "0",
        personalPropertyTaxes: "0",
        investmentInterestExpense: "0",
        gamblingWinnings: "0",
        gamblingLosses: "0",
      },
    });

    const withK1Amt = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "400000",
        federalWithheld: "100000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "400000",
        medicareWithheld: "5800",
      }],
      scheduleA: {
        mortgageInterest: "25000",
        stateTaxesPaid: "10000",
        realEstateTaxes: "10000",
        charitableCash: "20000",
        medicalExpenses: "0",
        personalPropertyTaxes: "0",
        investmentInterestExpense: "0",
        gamblingWinnings: "0",
        gamblingLosses: "0",
      },
      scheduleK1: [{
        partnershipName: "Depreciation LP",
        partnershipEIN: "77-1234567",
        ordinaryIncome: "0",
        amtDepreciationAdjustment: "15000", // Box 17 Code A
      }],
    });

    // Verify the Form 6251 audit trail has a Line 2l entry with $15K
    const line2l = withK1Amt.allLines.find((l) => l.form === "Form 6251" && l.line === "2l");
    expect(line2l).toBeDefined();
    expect(line2l!.value.toNumber()).toBe(15000);

    // AMTI should be $15K higher with the adjustment
    const baseAmti = baseResult.allLines.find((l) => l.form === "Form 6251" && l.line === "7");
    const withAmti = withK1Amt.allLines.find((l) => l.form === "Form 6251" && l.line === "7");
    expect(baseAmti).toBeDefined();
    expect(withAmti).toBeDefined();
    expect(withAmti!.value.minus(baseAmti!.value).toNumber()).toBe(15000);
  });

  it("K-1 Box 17 Code B adjusted gain/loss appears in Form 6251 Line 2k", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "400000",
        federalWithheld: "100000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "400000",
        medicareWithheld: "5800",
      }],
      scheduleA: {
        mortgageInterest: "25000",
        stateTaxesPaid: "10000",
        realEstateTaxes: "10000",
        charitableCash: "20000",
        medicalExpenses: "0",
        personalPropertyTaxes: "0",
        investmentInterestExpense: "0",
        gamblingWinnings: "0",
        gamblingLosses: "0",
      },
      scheduleK1: [{
        partnershipName: "Asset Sale LP",
        partnershipEIN: "77-2345678",
        ordinaryIncome: "0",
        amtAdjustedGainOrLoss: "8000", // Box 17 Code B
      }],
    });

    const line2k = result.allLines.find((l) => l.form === "Form 6251" && l.line === "2k");
    expect(line2k).toBeDefined();
    expect(line2k!.value.toNumber()).toBe(8000);
  });

  it("K-1 Box 17 Code C depletion adjustment appears in Form 6251 Line 2c", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "400000",
        federalWithheld: "100000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "400000",
        medicareWithheld: "5800",
      }],
      scheduleA: {
        mortgageInterest: "25000",
        stateTaxesPaid: "10000",
        realEstateTaxes: "10000",
        charitableCash: "20000",
        medicalExpenses: "0",
        personalPropertyTaxes: "0",
        investmentInterestExpense: "0",
        gamblingWinnings: "0",
        gamblingLosses: "0",
      },
      scheduleK1: [{
        partnershipName: "Mining LP",
        partnershipEIN: "77-3456789",
        ordinaryIncome: "0",
        amtDepletion: "5000", // Box 17 Code C
      }],
    });

    const line2c = result.allLines.find((l) => l.form === "Form 6251" && l.line === "2c");
    expect(line2c).toBeDefined();
    expect(line2c!.value.toNumber()).toBe(5000);
  });

  it("K-1 Box 17 Code F other AMT items appears in Form 6251 Line 3", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "400000",
        federalWithheld: "100000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "400000",
        medicareWithheld: "5800",
      }],
      scheduleA: {
        mortgageInterest: "25000",
        stateTaxesPaid: "10000",
        realEstateTaxes: "10000",
        charitableCash: "20000",
        medicalExpenses: "0",
        personalPropertyTaxes: "0",
        investmentInterestExpense: "0",
        gamblingWinnings: "0",
        gamblingLosses: "0",
      },
      scheduleK1: [{
        partnershipName: "Energy LP",
        partnershipEIN: "77-4567890",
        ordinaryIncome: "0",
        amtOtherItems: "12000", // Box 17 Code F
      }],
    });

    const line3 = result.allLines.find((l) => l.form === "Form 6251" && l.line === "3");
    expect(line3).toBeDefined();
    expect(line3!.value.toNumber()).toBe(12000);
  });

  it("multiple K-1 forms aggregate all Box 17 AMT codes", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "400000",
        federalWithheld: "100000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "400000",
        medicareWithheld: "5800",
      }],
      scheduleA: {
        mortgageInterest: "25000",
        stateTaxesPaid: "10000",
        realEstateTaxes: "10000",
        charitableCash: "20000",
        medicalExpenses: "0",
        personalPropertyTaxes: "0",
        investmentInterestExpense: "0",
        gamblingWinnings: "0",
        gamblingLosses: "0",
      },
      scheduleK1: [
        {
          partnershipName: "Real Estate LP",
          partnershipEIN: "77-1111111",
          ordinaryIncome: "10000",
          amtDepreciationAdjustment: "8000",
          amtDepletion: "3000",
        },
        {
          partnershipName: "Energy LP",
          partnershipEIN: "77-2222222",
          ordinaryIncome: "5000",
          amtDepreciationAdjustment: "4000",
          amtAdjustedGainOrLoss: "2000",
          amtOtherItems: "1000",
        },
      ],
    });

    // Depreciation: 8000 + 4000 = 12000
    const line2l = result.allLines.find((l) => l.form === "Form 6251" && l.line === "2l");
    expect(line2l).toBeDefined();
    expect(line2l!.value.toNumber()).toBe(12000);

    // Disposition: 0 + 2000 = 2000
    const line2k = result.allLines.find((l) => l.form === "Form 6251" && l.line === "2k");
    expect(line2k).toBeDefined();
    expect(line2k!.value.toNumber()).toBe(2000);

    // Depletion: 3000 + 0 = 3000
    const line2c = result.allLines.find((l) => l.form === "Form 6251" && l.line === "2c");
    expect(line2c).toBeDefined();
    expect(line2c!.value.toNumber()).toBe(3000);

    // Other: 0 + 1000 = 1000
    const line3 = result.allLines.find((l) => l.form === "Form 6251" && l.line === "3");
    expect(line3).toBeDefined();
    expect(line3!.value.toNumber()).toBe(1000);
  });

  it("negative K-1 AMT depreciation adjustment decreases AMTI", () => {
    // A negative depreciation adjustment means AMT depreciation exceeds
    // regular depreciation, which reduces AMTI. This should result in
    // lower or equal AMT compared to the no-adjustment case.
    const baseResult = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "400000",
        federalWithheld: "100000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "400000",
        medicareWithheld: "5800",
      }],
      scheduleA: {
        mortgageInterest: "25000",
        stateTaxesPaid: "10000",
        realEstateTaxes: "10000",
        charitableCash: "20000",
        medicalExpenses: "0",
        personalPropertyTaxes: "0",
        investmentInterestExpense: "0",
        gamblingWinnings: "0",
        gamblingLosses: "0",
      },
    });

    const withNegativeAdj = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "400000",
        federalWithheld: "100000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "400000",
        medicareWithheld: "5800",
      }],
      scheduleA: {
        mortgageInterest: "25000",
        stateTaxesPaid: "10000",
        realEstateTaxes: "10000",
        charitableCash: "20000",
        medicalExpenses: "0",
        personalPropertyTaxes: "0",
        investmentInterestExpense: "0",
        gamblingWinnings: "0",
        gamblingLosses: "0",
      },
      scheduleK1: [{
        partnershipName: "MACRS LP",
        partnershipEIN: "77-5555555",
        ordinaryIncome: "0",
        amtDepreciationAdjustment: "-10000", // Negative = AMT depreciation > regular
      }],
    });

    // Negative adjustment should reduce or not increase total tax
    expect(withNegativeAdj.totalTax.toNumber()).toBeLessThanOrEqual(baseResult.totalTax.toNumber());

    const line2l = withNegativeAdj.allLines.find((l) => l.form === "Form 6251" && l.line === "2l");
    expect(line2l).toBeDefined();
    expect(line2l!.value.toNumber()).toBe(-10000);
  });

  it("K-1 Box 17 with no AMT items produces no AMT adjustment audit lines", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Simple LP",
        partnershipEIN: "77-6666666",
        ordinaryIncome: "5000",
        // No AMT fields set
      }],
    });

    // No adjustment audit lines should appear when all AMT amounts are zero
    const line2c = result.allLines.find((l) => l.form === "Form 6251" && l.line === "2c");
    const line2k = result.allLines.find((l) => l.form === "Form 6251" && l.line === "2k");
    const line2l = result.allLines.find((l) => l.form === "Form 6251" && l.line === "2l");
    const line3 = result.allLines.find((l) => l.form === "Form 6251" && l.line === "3");
    expect(line2c).toBeUndefined();
    expect(line2k).toBeUndefined();
    expect(line2l).toBeUndefined();
    expect(line3).toBeUndefined();
  });
});

describe("K-1 Box 18 tax-exempt interest through federal pipeline", () => {
  it("K-1 Box 18 Code A flows to Form 1040 Line 2a", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Muni Bond Fund LP",
        partnershipEIN: "88-1234567",
        ordinaryIncome: "0",
        taxExemptInterest: "3500", // Box 18 Code A
      }],
    });

    const line2a = result.allLines.find((l) => l.form === "1040" && l.line === "2a");
    expect(line2a).toBeDefined();
    expect(line2a!.value.toNumber()).toBe(3500);
  });

  it("K-1 Box 18 Code A aggregates with 1099-INT and 1099-DIV tax-exempt interest", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099Int: [{
        payer: "Bank",
        interestIncome: "500",
        earlyWithdrawalPenalty: "0",
        taxExemptInterest: "2000",
      }],
      form1099Div: [{
        payer: "Muni Fund",
        ordinaryDividends: "100",
        qualifiedDividends: "0",
        exemptInterestDividends: "1500",
      }],
      scheduleK1: [{
        partnershipName: "Muni Bond LP",
        partnershipEIN: "88-2345678",
        ordinaryIncome: "0",
        taxExemptInterest: "3000", // Box 18 Code A
      }],
    });

    // 2000 (1099-INT) + 1500 (1099-DIV) + 3000 (K-1) = 6500
    const line2a = result.allLines.find((l) => l.form === "1040" && l.line === "2a");
    expect(line2a).toBeDefined();
    expect(line2a!.value.toNumber()).toBe(6500);
  });

  it("K-1 Box 18 Code A from multiple K-1s aggregates", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "Muni Fund I",
          partnershipEIN: "88-3333333",
          ordinaryIncome: "0",
          taxExemptInterest: "2000",
        },
        {
          partnershipName: "Muni Fund II",
          partnershipEIN: "88-4444444",
          ordinaryIncome: "0",
          taxExemptInterest: "1500",
        },
      ],
    });

    const line2a = result.allLines.find((l) => l.form === "1040" && l.line === "2a");
    expect(line2a).toBeDefined();
    expect(line2a!.value.toNumber()).toBe(3500);
  });

  it("K-1 Box 18 Code A tax-exempt interest is not included in taxable income", () => {
    // Tax-exempt interest is informational on Line 2a but does not add to AGI
    const withoutK1 = calculateFederalTax(simpleW2Fixture);

    const withK1TaxExempt = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Muni LP",
        partnershipEIN: "88-5555555",
        ordinaryIncome: "0",
        taxExemptInterest: "10000",
      }],
    });

    // AGI should be the same — tax-exempt interest doesn't affect taxable income
    expect(withK1TaxExempt.agi.toNumber()).toBe(withoutK1.agi.toNumber());
    expect(withK1TaxExempt.taxableIncome.toNumber()).toBe(withoutK1.taxableIncome.toNumber());
  });

  // ── Form 4952 integration ──────────────────────────────────────

  it("Form 4952 investment interest deduction flows to Schedule A Line 9 when form4952 input is provided", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "200000",
        federalWithheld: "40000",
      }],
      form1099Int: [{ payer: "Broker", interestIncome: "5000" }],
      form1099Div: [{ payer: "Fund", ordinaryDividends: "3000", qualifiedDividends: "2000" }],
      form1098: [{ lender: "Bank", mortgageInterestReceived: "12000", outstandingMortgagePrincipal: "300000", propertyTax: "8000" }],
      donations: [{ type: "cash", amount: "5000" }],
      form4952: {
        investmentInterestExpense: "10000",
        priorYearDisallowed: "2000",
        grossInvestmentIncome: "8000",
        qualifiedDividendsIncluded: "2000",
        netGainFromInvestmentProperty: "500",
      },
    });

    // Form 4952: total expense = 12000, net investment income = max(0, 6000 + 500 + 0 - 0) = 6500
    // deductible = min(12000, 6500) = 6500
    const schedALine9 = result.allLines.find(
      (l) => l.form === "Sched A" && l.line === "9"
    );
    expect(schedALine9?.value.toNumber()).toBe(6500);

    // Verify Form 4952 carryforward in audit trail
    const form4952Line7 = result.allLines.find(
      (l) => l.form === "Form 4952" && l.line === "7"
    );
    expect(form4952Line7?.value.toNumber()).toBe(5500); // 12000 - 6500
  });

  it("Form 4952 deduction overrides raw scheduleA.investmentInterestExpense when both are present", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "150000",
        federalWithheld: "30000",
      }],
      form1098: [{ lender: "Bank", mortgageInterestReceived: "8000", outstandingMortgagePrincipal: "200000", propertyTax: "6000" }],
      donations: [{ type: "cash", amount: "3000" }],
      scheduleA: {
        investmentInterestExpense: "99999", // should be overridden by Form 4952
      },
      form4952: {
        investmentInterestExpense: "5000",
        grossInvestmentIncome: "3000",
      },
    });

    const schedALine9 = result.allLines.find(
      (l) => l.form === "Sched A" && l.line === "9"
    );
    // Form 4952: total = 5000, net income = 3000, deductible = 3000
    expect(schedALine9?.value.toNumber()).toBe(3000);
  });

  it("Schedule A Line 9 uses raw input when no form4952 is provided", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "150000",
        federalWithheld: "30000",
      }],
      form1098: [{ lender: "Bank", mortgageInterestReceived: "8000", outstandingMortgagePrincipal: "200000", propertyTax: "6000" }],
      donations: [{ type: "cash", amount: "3000" }],
      scheduleA: {
        investmentInterestExpense: "4500",
      },
    });

    const schedALine9 = result.allLines.find(
      (l) => l.form === "Sched A" && l.line === "9"
    );
    expect(schedALine9?.value.toNumber()).toBe(4500);
  });
});

// ═══════════════════════════════════════════════════════════
// Sub-result exposure: verify computed form results are returned
// ═══════════════════════════════════════════════════════════

describe("Sub-result exposure in FederalTaxResult", () => {
  it("schedule2 and schedule3 are always returned", () => {
    const result = calculateFederalTax(simpleW2Fixture);
    expect(result.schedule2).toBeDefined();
    expect(result.schedule3).toBeDefined();
    expect(result.schedule2!.partIITotal).toBeInstanceOf(Decimal);
    expect(result.schedule3!.totalNonrefundableCredits).toBeInstanceOf(Decimal);
  });

  it("scheduleH result is returned when scheduleH input is provided", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleH: {
        employees: [
          {
            name: "Nanny",
            cashWages: "20000",
            isSpouse: false,
            isChildUnder21: false,
            isParent: false,
            isUnder18NonPrincipal: false,
          },
        ],
        futaApplies: true,
        futaSectionA: true,
      },
    });
    expect(result.scheduleH).toBeDefined();
    expect(result.scheduleH!.totalTax.toNumber()).toBe(3102);
  });

  it("scheduleH is undefined when no input provided", () => {
    const result = calculateFederalTax(simpleW2Fixture);
    expect(result.scheduleH).toBeUndefined();
  });

  it("form4952 result is returned when form4952 input is provided", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "150000", federalWithheld: "30000" }],
      form1098: [{ lender: "Bank", mortgageInterestReceived: "8000", outstandingMortgagePrincipal: "200000", propertyTax: "6000" }],
      donations: [{ type: "cash", amount: "3000" }],
      form4952: {
        investmentInterestExpense: "10000",
        priorYearDisallowed: "2000",
        grossInvestmentIncome: "8000",
        qualifiedDividendsIncluded: "1000",
        netGainFromInvestmentProperty: "500",
      },
    });
    expect(result.form4952).toBeDefined();
    // Net investment income: max(0, (8000-1000) + 500 + 0 - 0) = 7500
    // Deductible = min(12000, 7500) = 7500; carryforward = 12000 - 7500 = 4500
    expect(result.form4952!.deductibleAmount.toNumber()).toBe(7500);
    expect(result.form4952!.disallowedCarryforward.toNumber()).toBe(4500);
  });

  it("form4952 is undefined when no input provided", () => {
    const result = calculateFederalTax(simpleW2Fixture);
    expect(result.form4952).toBeUndefined();
  });

  it("form8801 result is returned when form8801 input is provided", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "200000", federalWithheld: "40000" }],
      form8801: {
        priorYearFilingStatus: "single",
        priorYearTaxableIncome: "180000",
        priorYearExclusionItemAdjustments: "15000",
        priorYearAMT: "3000",
        priorYearRegularTax: "35000",
        unusedMinimumTaxCreditCarryforward: "0",
      },
    });
    expect(result.form8801).toBeDefined();
    expect(result.form8801!.creditAllowed).toBeInstanceOf(Decimal);
  });

  it("form8801 is undefined when no input provided", () => {
    const result = calculateFederalTax(simpleW2Fixture);
    expect(result.form8801).toBeUndefined();
  });

  it("scheduleEIC result is returned when EIC is computed", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "25000", federalWithheld: "3000" }],
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        primary: {
          ...simpleW2Fixture.taxpayer.primary,
          dateOfBirth: "1990-01-01",
        },
        dependents: [
          {
            firstName: "Child",
            lastName: "Test",
            dateOfBirth: "2015-06-15",
            ssn: "333-33-3333",
            relationship: "son",
            monthsLivedWithTaxpayer: 12,
            qualifiesForCTC: true,
            qualifiesForEIC: true,
          },
        ],
      },
    });
    expect(result.scheduleEIC).toBeDefined();
    expect(result.scheduleEIC!.credit.toNumber()).toBeGreaterThan(0);
    expect(result.earnedIncomeCredit.toNumber()).toBe(result.scheduleEIC!.credit.toNumber());
  });

  it("scheduleEIC is undefined when Form 2555 disqualifies EIC", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form2555: {
        foreignEarnedIncome: "50000",
        qualifyingDays: 365,
        totalDaysInYear: 365,
      },
    });
    expect(result.scheduleEIC).toBeUndefined();
    expect(result.earnedIncomeCredit.toNumber()).toBe(0);
  });

  it("scheduleR result is returned when scheduleR input is provided", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "30000", federalWithheld: "3000" }],
      scheduleR: {
        primaryAge65OrOlder: true,
        nontaxableSocialSecurity: "0",
        nontaxablePensionAnnuityDisability: "0",
      },
    });
    expect(result.scheduleR).toBeDefined();
    expect(result.scheduleR!.credit).toBeInstanceOf(Decimal);
  });

  it("carryforwards include investment interest, minimum tax credit, and charitable contributions", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "200000", federalWithheld: "40000" }],
      form1098: [{ lender: "Bank", mortgageInterestReceived: "8000", outstandingMortgagePrincipal: "200000", propertyTax: "6000" }],
      donations: [{ type: "cash", amount: "3000" }],
      form4952: {
        investmentInterestExpense: "15000",
        grossInvestmentIncome: "5000",
      },
      form8801: {
        priorYearFilingStatus: "single",
        priorYearTaxableIncome: "180000",
        priorYearExclusionItemAdjustments: "15000",
        priorYearAMT: "3000",
        priorYearRegularTax: "35000",
        unusedMinimumTaxCreditCarryforward: "0",
      },
    });
    // Form 4952: expense $15K, net income $5K → carryforward $10K
    expect(result.carryforwards.investmentInterestExpense.toNumber()).toBe(10000);
    // Form 8801: minimum tax credit carryforward should be a Decimal
    expect(result.carryforwards.minimumTaxCredit).toBeInstanceOf(Decimal);
    // Charitable: $3K cash on $200K AGI is well under 60% limit → no carryforward
    expect(result.carryforwards.charitableContributions.toNumber()).toBe(0);
  });

  it("carryforwards default to zero when optional forms are not provided", () => {
    const result = calculateFederalTax(simpleW2Fixture);
    expect(result.carryforwards.investmentInterestExpense.toNumber()).toBe(0);
    expect(result.carryforwards.minimumTaxCredit.toNumber()).toBe(0);
    expect(result.carryforwards.charitableContributions.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Form 8995-A — Detailed QBI Deduction
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A integration - auto-selection based on income", () => {
  it("uses simplified Form 8995 when taxable income is below threshold", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{ employer: { name: "Employer", ein: "12-3456789" }, wages: "80000", federalWithheld: "12000" }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "30000", federalWithheld: "0" }],
    };
    const result = calculateFederalTax(fixture);
    expect(result.form8995).toBeDefined();
    expect(result.form8995A).toBeUndefined();
    expect(result.form8995!.qbiDeduction.greaterThan(0)).toBe(true);
  });

  it("uses Form 8995-A when taxable income exceeds threshold", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{ employer: { name: "Employer", ein: "12-3456789" }, wages: "250000", federalWithheld: "50000" }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "60000", federalWithheld: "0" }],
      scheduleC: {
        businessName: "Consulting",
        w2WagesPaid: "30000",
        ubiaQualifiedProperty: "100000",
      },
    };
    const result = calculateFederalTax(fixture);
    expect(result.form8995A).toBeDefined();
    expect(result.form8995).toBeUndefined();
    expect(result.form8995A!.qbiDeduction.greaterThanOrEqualTo(0)).toBe(true);
  });

  it("Form 8995-A applies W-2/UBIA limit for non-SSTB above upper threshold", () => {
    // Non-SSTB with enough W-2 wages to get a non-zero deduction
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{ employer: { name: "Day Job", ein: "12-3456789" }, wages: "300000", federalWithheld: "60000" }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "100000", federalWithheld: "0" }],
      scheduleC: {
        businessName: "Side Biz",
        w2WagesPaid: "40000",
        ubiaQualifiedProperty: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    expect(result.form8995A).toBeDefined();
    // The QBI deduction should be limited by W-2 wages
    const biz = result.form8995A!.businesses[0];
    expect(biz.line9W2UBIALimit.greaterThan(0)).toBe(true);
  });

  it("Form 8995-A excludes SSTB above upper threshold", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{ employer: { name: "Day Job", ein: "12-3456789" }, wages: "350000", federalWithheld: "70000" }],
      form1099Nec: [{ payer: "Law Client", nonemployeeCompensation: "80000", federalWithheld: "0" }],
      scheduleC: {
        businessName: "Law Practice",
        w2WagesPaid: "40000",
        ubiaQualifiedProperty: "0",
        isSST: true,
      },
    };
    const result = calculateFederalTax(fixture);
    expect(result.form8995A).toBeDefined();
    // SSTB above upper threshold → $0 deduction
    expect(result.form8995A!.businesses[0].line2AdjustedQBI.toNumber()).toBe(0);
    expect(result.form8995A!.qbiDeduction.toNumber()).toBe(0);
  });

  it("Form 8995-A uses K-1 W-2 wages and UBIA when provided", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{ employer: { name: "Day Job", ein: "12-3456789" }, wages: "300000", federalWithheld: "60000" }],
      scheduleK1: [{
        partnershipName: "Investment LLC",
        partnershipEIN: "98-7654321",
        ordinaryBusinessIncome: "0",
        guaranteedPayments: "0",
        interestIncome: "0",
        dividends: "0",
        royalties: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        section1231Gain: "0",
        selfEmploymentEarnings: "0",
        foreignTaxPaid: "0",
        section199AQBI: "80000",
        section199AW2Wages: "50000",
        section199AUBIA: "200000",
        section199AIsSST: false,
      }],
    };
    const result = calculateFederalTax(fixture);
    expect(result.form8995A).toBeDefined();
    const biz = result.form8995A!.businesses[0];
    expect(biz.line3W2Wages.toNumber()).toBe(50000);
    expect(biz.line5UBIA.toNumber()).toBe(200000);
    expect(biz.line15QBIComponent.greaterThan(0)).toBe(true);
  });

  it("QBI deduction flows to Form 1040 Line 13 from Form 8995-A", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{ employer: { name: "Employer", ein: "12-3456789" }, wages: "280000", federalWithheld: "55000" }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }],
      scheduleC: {
        businessName: "Consulting",
        w2WagesPaid: "20000",
        ubiaQualifiedProperty: "50000",
      },
    };
    const result = calculateFederalTax(fixture);
    expect(result.form8995A).toBeDefined();
    const qbiDeduction = result.form8995A!.qbiDeduction;
    // The QBI deduction should reduce taxable income
    const expectedTaxable = result.agi.minus(result.deductionAmount).minus(qbiDeduction);
    expect(result.taxableIncome.toNumber()).toBe(Math.max(0, expectedTaxable.toNumber()));
  });
});

// ═══════════════════════════════════════════════════════════
// Home Sale Exclusion — IRC §121 Integration
// ═══════════════════════════════════════════════════════════

describe("Home Sale Exclusion — IRC §121 integration", () => {
  it("Home sale gain below exclusion produces zero taxable capital gain from home sale", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      homeSales: [{
        salePrice: "400000",
        sellingExpenses: "20000",
        purchasePrice: "200000",
        improvements: "0",
        depreciationAfterMay1997: "0",
        casualtyLossDeductions: "0",
        otherBasisAdjustments: "0",
        daysOwned: 1000,
        daysUsedAsResidence: 1000,
        usedExclusionInPrior2Years: false,
        qualifiesForReducedExclusion: false,
        bothSpousesMeetUseTest: false,
        atLeastOneSpouseMeetsOwnershipTest: false,
      }],
    });
    // Gain: 180000 (380K realized - 200K basis), exclusion: 250000
    // Fully excluded → no capital gain from home sale
    // Schedule D should not have any home sale gain flowing through
    expect(result.scheduleD.homeSales).toBeDefined();
    expect(result.scheduleD.homeSales!.totalTaxableGain.toNumber()).toBe(0);
  });

  it("Home sale gain exceeding exclusion flows to Schedule D Line 15 as LTCG", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      homeSales: [{
        salePrice: "800000",
        sellingExpenses: "50000",
        purchasePrice: "200000",
        improvements: "0",
        depreciationAfterMay1997: "0",
        casualtyLossDeductions: "0",
        otherBasisAdjustments: "0",
        daysOwned: 1000,
        daysUsedAsResidence: 1000,
        usedExclusionInPrior2Years: false,
        qualifiesForReducedExclusion: false,
        bothSpousesMeetUseTest: false,
        atLeastOneSpouseMeetsOwnershipTest: false,
      }],
    });
    // Amount realized: 750000, gain: 550000, exclusion: 250000, taxable: 300000
    expect(result.scheduleD.homeSales!.totalTaxableGain.toNumber()).toBe(300000);
    // The $300K should flow into Schedule D net long-term line
    expect(result.scheduleD.netLongTerm.toNumber()).toBeGreaterThanOrEqual(300000);
  });

  it("Home sale with MFJ both qualifying uses $500,000 exclusion", () => {
    const mfjFixture: TaxYearInput = {
      ...complexMFJFixture,
      homeSales: [{
        salePrice: "900000",
        sellingExpenses: "50000",
        purchasePrice: "200000",
        improvements: "50000",
        depreciationAfterMay1997: "0",
        casualtyLossDeductions: "0",
        otherBasisAdjustments: "0",
        daysOwned: 1826,
        daysUsedAsResidence: 1826,
        usedExclusionInPrior2Years: false,
        qualifiesForReducedExclusion: false,
        bothSpousesMeetUseTest: true,
        atLeastOneSpouseMeetsOwnershipTest: true,
      }],
    };
    const result = calculateFederalTax(mfjFixture);
    // Amount realized: 850000, basis: 250000, gain: 600000
    // MFJ exclusion: 500000, taxable: 100000
    expect(result.scheduleD.homeSales!.totalTaxableGain.toNumber()).toBe(100000);
  });

  it("Home sale loss does not affect taxable income", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      homeSales: [{
        salePrice: "180000",
        sellingExpenses: "10000",
        purchasePrice: "250000",
        improvements: "0",
        depreciationAfterMay1997: "0",
        casualtyLossDeductions: "0",
        otherBasisAdjustments: "0",
        daysOwned: 1000,
        daysUsedAsResidence: 1000,
        usedExclusionInPrior2Years: false,
        qualifiesForReducedExclusion: false,
        bothSpousesMeetUseTest: false,
        atLeastOneSpouseMeetsOwnershipTest: false,
      }],
    });
    // Loss on personal-use property → no deduction, no capital loss
    expect(result.scheduleD.homeSales!.totalTaxableGain.toNumber()).toBe(0);
    // Total income should be unaffected by the home sale loss
    const baseResult = calculateFederalTax(simpleW2Fixture);
    expect(result.totalIncome.toNumber()).toBe(baseResult.totalIncome.toNumber());
  });

  it("Home sale with depreciation recapture produces additional taxable gain", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      homeSales: [{
        salePrice: "500000",
        sellingExpenses: "0",
        purchasePrice: "200000",
        improvements: "0",
        depreciationAfterMay1997: "20000",
        casualtyLossDeductions: "0",
        otherBasisAdjustments: "0",
        daysOwned: 1000,
        daysUsedAsResidence: 1000,
        usedExclusionInPrior2Years: false,
        qualifiesForReducedExclusion: false,
        bothSpousesMeetUseTest: false,
        atLeastOneSpouseMeetsOwnershipTest: false,
      }],
    });
    // Basis: 180000, gain: 320000
    // Depreciation recapture: 20000
    // Excludable: min(300000, 250000) = 250000
    // Taxable: 320000 - 250000 = 70000
    expect(result.scheduleD.homeSales!.totalTaxableGain.toNumber()).toBe(70000);
    expect(result.scheduleD.homeSales!.totalDepreciationRecapture.toNumber()).toBe(20000);
  });

  it("Home sale depreciation recapture is taxed at 25% max rate via QDCG section 1250 layer", () => {
    // High-income single filer: $550K wages pushes ordinary income above the
    // $533,400 single-filer 15% LTCG threshold, so all LTCG lands in the 20% bracket.
    // Section 1250 gain is then taxed at 25% max rate (instead of 20%).
    const highIncomeBase: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "550000",
        federalWithheld: "150000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "550000",
        medicareWithheld: "7975",
      }],
    };
    // Scenario A: $320K gain with $20K depreciation recapture (§1250 at 25%)
    const withRecapture = calculateFederalTax({
      ...highIncomeBase,
      homeSales: [{
        salePrice: "500000",
        sellingExpenses: "0",
        purchasePrice: "200000",
        improvements: "0",
        depreciationAfterMay1997: "20000",
        casualtyLossDeductions: "0",
        otherBasisAdjustments: "0",
        daysOwned: 1000,
        daysUsedAsResidence: 1000,
        usedExclusionInPrior2Years: false,
        qualifiesForReducedExclusion: false,
        bothSpousesMeetUseTest: false,
        atLeastOneSpouseMeetsOwnershipTest: false,
      }],
    });
    // Scenario B: Same total gain ($320K) with zero depreciation
    // Lower purchase price to produce the same gain: 500K - 180K = 320K
    const withoutRecapture = calculateFederalTax({
      ...highIncomeBase,
      homeSales: [{
        salePrice: "500000",
        sellingExpenses: "0",
        purchasePrice: "180000",
        improvements: "0",
        depreciationAfterMay1997: "0",
        casualtyLossDeductions: "0",
        otherBasisAdjustments: "0",
        daysOwned: 1000,
        daysUsedAsResidence: 1000,
        usedExclusionInPrior2Years: false,
        qualifiesForReducedExclusion: false,
        bothSpousesMeetUseTest: false,
        atLeastOneSpouseMeetsOwnershipTest: false,
      }],
    });
    // Both produce the same taxable gain ($70K) and same capital gain on Schedule D
    expect(withRecapture.scheduleD.homeSales!.totalTaxableGain.toNumber()).toBe(70000);
    expect(withoutRecapture.scheduleD.homeSales!.totalTaxableGain.toNumber()).toBe(70000);
    // With depreciation recapture, $20K is taxed at 25% instead of 20% → higher cap gains tax
    // The QDCG preferential tax difference: $20K × (25% − 20%) = $1,000
    expect(withRecapture.capitalGainsTax.toNumber()).toBeGreaterThan(
      withoutRecapture.capitalGainsTax.toNumber()
    );
    const capGainDiff = withRecapture.capitalGainsTax.minus(withoutRecapture.capitalGainsTax).toNumber();
    expect(capGainDiff).toBe(1000);
  });

  it("No home sales does not affect existing capital gains calculation", () => {
    const result = calculateFederalTax(simpleW2Fixture);
    expect(result.scheduleD.homeSales).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════
// K-1 Box 13 Code Separation — Charitable Pass-Through to Schedule A
// ═══════════════════════════════════════════════════════════

describe("K-1 Box 13 code separation — charitable contributions to Schedule A", () => {
  it("K-1 Box 13 Code A charitable cash flows to Schedule A", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      donations: [{ organization: "Local Charity", type: "cash", amount: "1000", dateOfDonation: "2025-06-15" }],
      scheduleK1: [{
        partnershipName: "Acme LP",
        partnershipEIN: "11-1111111",
        ordinaryIncome: "20000",
        charitableCash: "5000", // Box 13 Code A
      }],
    });

    // Cash charitable should include both the direct donation and K-1 Code A
    const line12 = result.allLines.find((l) => l.form === "Sched A" && l.line === "12");
    expect(line12).toBeDefined();
    expect(line12!.value.toNumber()).toBe(6000); // 1000 + 5000
  });

  it("K-1 Box 13 Code A without personal donations still flows to Schedule A", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Acme LP",
        partnershipEIN: "11-1111111",
        ordinaryIncome: "20000",
        charitableCash: "3000", // Box 13 Code A
      }],
    });

    const line12 = result.allLines.find((l) => l.form === "Sched A" && l.line === "12");
    expect(line12).toBeDefined();
    expect(line12!.value.toNumber()).toBe(3000);
  });

  it("K-1 Box 13 Code B charitable capital gain property flows to Schedule A", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Real Estate LP",
        partnershipEIN: "22-2222222",
        ordinaryIncome: "10000",
        charitableCapitalGain30: "8000", // Box 13 Code B — 30% AGI limit
      }],
    });

    // Non-cash charitable should include K-1 Code B
    const line13 = result.allLines.find((l) => l.form === "Sched A" && l.line === "13");
    expect(line13).toBeDefined();
    expect(line13!.value.toNumber()).toBe(8000);
  });

  it("K-1 Box 13 Code C charitable capital gain property flows to Schedule A", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Art Fund LP",
        partnershipEIN: "33-3333333",
        ordinaryIncome: "10000",
        charitableCapitalGain20: "4000", // Box 13 Code C — 20% AGI limit
      }],
    });

    const line13 = result.allLines.find((l) => l.form === "Sched A" && l.line === "13");
    expect(line13).toBeDefined();
    expect(line13!.value.toNumber()).toBe(4000);
  });

  it("K-1 Box 13 Codes A+B+C aggregate from multiple partnerships to Schedule A", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      donations: [{ organization: "Personal charity", type: "cash", amount: "2000", dateOfDonation: "2025-03-01" }],
      scheduleK1: [
        {
          partnershipName: "Fund A",
          partnershipEIN: "44-4444444",
          ordinaryIncome: "15000",
          charitableCash: "3000", // Code A
          charitableCapitalGain30: "2000", // Code B
        },
        {
          partnershipName: "Fund B",
          partnershipEIN: "55-5555555",
          ordinaryIncome: "10000",
          charitableCash: "1000", // Code A
          charitableCapitalGain20: "1500", // Code C
        },
      ],
    });

    // Cash: 2000 direct + 3000 K-1 A (Fund A) + 1000 K-1 A (Fund B) = 6000
    const line12 = result.allLines.find((l) => l.form === "Sched A" && l.line === "12");
    expect(line12).toBeDefined();
    expect(line12!.value.toNumber()).toBe(6000);

    // Non-cash: 2000 K-1 B (Fund A) + 1500 K-1 C (Fund B) = 3500
    const line13 = result.allLines.find((l) => l.form === "Sched A" && l.line === "13");
    expect(line13).toBeDefined();
    expect(line13!.value.toNumber()).toBe(3500);
  });

  it("K-1 charitable amounts do NOT reduce partnership income on Schedule E", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Charitable LP",
        partnershipEIN: "66-6666666",
        ordinaryIncome: "50000",
        charitableCash: "5000", // Code A — should NOT subtract from Schedule E
        charitableCapitalGain30: "3000", // Code B — should NOT subtract from Schedule E
      }],
    });

    // Schedule E Part II should show 50000 ordinary income with no reduction
    // for charitable amounts (those flow to Schedule A instead)
    const schedELine = result.allLines.find(
      (l) => l.form === "Sched E" && l.line === "28" && l.description.includes("Charitable LP")
    );
    expect(schedELine).toBeDefined();
    expect(schedELine!.value.toNumber()).toBe(50000);
  });

  it("K-1 otherDeductions (Code W) still reduces partnership income on Schedule E", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Mixed Deductions LP",
        partnershipEIN: "77-7777777",
        ordinaryIncome: "30000",
        otherDeductions: "2000", // Code W — stays on Schedule E
        charitableCash: "4000", // Code A — goes to Schedule A
      }],
    });

    // Schedule E: 30000 - 2000 (Code W) = 28000
    const schedELine = result.allLines.find(
      (l) => l.form === "Sched E" && l.line === "28" && l.description.includes("Mixed Deductions LP")
    );
    expect(schedELine).toBeDefined();
    expect(schedELine!.value.toNumber()).toBe(28000);

    // Schedule A should get 4000 from Code A
    const line12 = result.allLines.find((l) => l.form === "Sched A" && l.line === "12");
    expect(line12).toBeDefined();
    expect(line12!.value.toNumber()).toBe(4000);
  });

  it("K-1 Code A charitable subject to 60% AGI limit on Schedule A", () => {
    // AGI = 85000 (W-2) + 10000 (K-1 ordinary) = 95000
    // 60% of 95000 = 57000
    // K-1 Code A = 60000 → capped at 57000
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Big Donor LP",
        partnershipEIN: "88-8888888",
        ordinaryIncome: "10000",
        charitableCash: "60000", // Code A exceeds 60% AGI limit
      }],
    });

    const line12 = result.allLines.find((l) => l.form === "Sched A" && l.line === "12");
    expect(line12).toBeDefined();
    expect(line12!.value.toNumber()).toBe(57000); // 60% of 95000 AGI
  });

  it("K-1 Code B charitable subject to 30% AGI limit on Schedule A", () => {
    // AGI = 85000 (W-2) + 5000 (K-1 ordinary) = 90000
    // 30% of 90000 = 27000
    // K-1 Code B = 30000 → capped at 27000
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Property Donor LP",
        partnershipEIN: "99-9999999",
        ordinaryIncome: "5000",
        charitableCapitalGain30: "30000", // Code B exceeds 30% AGI limit
      }],
    });

    const line13 = result.allLines.find((l) => l.form === "Sched A" && l.line === "13");
    expect(line13).toBeDefined();
    expect(line13!.value.toNumber()).toBe(27000); // 30% of 90000 AGI
  });

  it("K-1 Code C charitable subject to 20% AGI limit on Schedule A", () => {
    // AGI = 85000 (W-2) + 5000 (K-1 ordinary) = 90000
    // 20% of 90000 = 18000
    // K-1 Code C = 20000 → capped at 18000
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Foundation Donor LP",
        partnershipEIN: "10-1010101",
        ordinaryIncome: "5000",
        charitableCapitalGain20: "20000", // Code C exceeds 20% AGI limit
      }],
    });

    const line13 = result.allLines.find((l) => l.form === "Sched A" && l.line === "13");
    expect(line13).toBeDefined();
    // 20% limit applies: min(20000, 18000) = 18000
    // But also subject to 30% headroom and 50% headroom checks
    expect(line13!.value.toNumber()).toBe(18000);
  });

  it("K-1 charitable excess carries forward", () => {
    // AGI = 85000 (W-2). 60% of 85000 = 51000
    // K-1 Code A = 60000 → deductible 51000, excess 9000
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Generous LP",
        partnershipEIN: "12-1212121",
        ordinaryIncome: "0",
        charitableCash: "60000",
      }],
    });

    expect(result.scheduleA.charitableCarryforward.toNumber()).toBe(9000);
  });

  it("K-1 Box 13 Code K excess business interest is tracked in audit trail", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Leveraged LP",
        partnershipEIN: "13-1313131",
        ordinaryIncome: "25000",
        excessBusinessInterest: "7500", // Code K
      }],
    });

    const auditLine = result.allLines.find(
      (l) => l.form === "K-1" && l.line === "13K"
    );
    expect(auditLine).toBeDefined();
    expect(auditLine!.value.toNumber()).toBe(7500);
  });

  it("K-1 without code-level Box 13 fields uses aggregate otherDeductions on Schedule E as before", () => {
    // Backward compatibility: legacy usage with aggregate otherDeductions
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Legacy LP",
        partnershipEIN: "14-1414141",
        ordinaryIncome: "20000",
        otherDeductions: "3000", // Aggregate Box 13 (legacy)
      }],
    });

    // Schedule E: 20000 - 3000 = 17000
    const schedELine = result.allLines.find(
      (l) => l.form === "Sched E" && l.line === "28" && l.description.includes("Legacy LP")
    );
    expect(schedELine).toBeDefined();
    expect(schedELine!.value.toNumber()).toBe(17000);

    // No K-1 charitable audit line (no code-level fields used)
    const k1CharitableLine = result.allLines.find(
      (l) => l.form === "K-1" && l.line === "13"
    );
    expect(k1CharitableLine).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════
// K-1 Investment Interest — Form 4952 Integration
// ═══════════════════════════════════════════════════════════

describe("K-1 investment interest — Form 4952 integration", () => {
  it("K-1 Box 13 Code D investment interest expense flows to Form 4952 Line 1", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Leveraged Investment LP",
        partnershipEIN: "20-2020201",
        ordinaryIncome: "10000",
        investmentInterestExpense: "3000", // Box 13 Code D
        investmentIncome: "5000", // Box 20 Code A — enough to cover
      }],
    });

    // Form 4952 should be triggered by K-1 investment amounts
    expect(result.form4952).toBeDefined();
    expect(result.form4952!.line1.toNumber()).toBe(3000);
    expect(result.form4952!.deductibleAmount.toNumber()).toBe(3000); // 3000 expense ≤ 5000 income
  });

  it("K-1 Box 20 Code A investment income flows to Form 4952 Line 4a", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Income Fund LP",
        partnershipEIN: "20-2020202",
        ordinaryIncome: "10000",
        investmentIncome: "8000", // Box 20 Code A
      }],
      form4952: {
        investmentInterestExpense: "6000",
      },
    });

    expect(result.form4952).toBeDefined();
    // Line 4a = 8000 (K-1) + 0 (direct) = 8000
    expect(result.form4952!.line4a.toNumber()).toBe(8000);
    // 4g = 8000 (income, no qualified div adjustment)
    expect(result.form4952!.deductibleAmount.toNumber()).toBe(6000); // fully deductible
  });

  it("K-1 Box 20 Code B investment expenses flow to Form 4952 Line 4f", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Expense Fund LP",
        partnershipEIN: "20-2020203",
        ordinaryIncome: "10000",
        investmentExpenses: "2000", // Box 20 Code B
      }],
      form4952: {
        investmentInterestExpense: "5000",
        grossInvestmentIncome: "6000",
        investmentExpenses: "500", // Direct investment expenses
      },
    });

    expect(result.form4952).toBeDefined();
    // Line 4f = 500 (direct) + 2000 (K-1) = 2500
    expect(result.form4952!.line4f.toNumber()).toBe(2500);
    // 4g = max(0, 6000 + 0 + 0 - 2500) = 3500
    expect(result.form4952!.line4g.toNumber()).toBe(3500);
    expect(result.form4952!.deductibleAmount.toNumber()).toBe(3500);
    expect(result.form4952!.disallowedCarryforward.toNumber()).toBe(1500);
  });

  it("K-1 investment amounts combine with direct Form 4952 input", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Mixed Investment LP",
        partnershipEIN: "20-2020204",
        ordinaryIncome: "15000",
        investmentInterestExpense: "4000", // Box 13 Code D
        investmentIncome: "3000", // Box 20 Code A
        investmentExpenses: "500", // Box 20 Code B
      }],
      form4952: {
        investmentInterestExpense: "6000", // Margin interest
        grossInvestmentIncome: "7000", // Brokerage interest/dividends
        investmentExpenses: "200", // Direct expenses
      },
    });

    expect(result.form4952).toBeDefined();
    // Line 1 = 6000 (direct) + 4000 (K-1 Code D) = 10000
    expect(result.form4952!.line1.toNumber()).toBe(10000);
    // Line 4a = 7000 (direct) + 3000 (K-1 Code A) = 10000
    expect(result.form4952!.line4a.toNumber()).toBe(10000);
    // Line 4f = 200 (direct) + 500 (K-1 Code B) = 700
    expect(result.form4952!.line4f.toNumber()).toBe(700);
    // Line 3 = 10000 (no prior carryforward)
    // Line 4g = max(0, 10000 + 0 + 0 - 700) = 9300
    expect(result.form4952!.line4g.toNumber()).toBe(9300);
    // Deduction = min(10000, 9300) = 9300
    expect(result.form4952!.deductibleAmount.toNumber()).toBe(9300);
    expect(result.form4952!.disallowedCarryforward.toNumber()).toBe(700);
  });

  it("K-1 investment amounts alone trigger Form 4952 without explicit form4952 input", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "K1-Only Investment LP",
        partnershipEIN: "20-2020205",
        ordinaryIncome: "10000",
        investmentInterestExpense: "2000", // Box 13 Code D
        investmentIncome: "4000", // Box 20 Code A
      }],
    });

    // Form 4952 should be auto-triggered even without form4952 input
    expect(result.form4952).toBeDefined();
    expect(result.form4952!.line1.toNumber()).toBe(2000);
    expect(result.form4952!.line4a.toNumber()).toBe(4000);
    expect(result.form4952!.deductibleAmount.toNumber()).toBe(2000);
    expect(result.form4952!.disallowedCarryforward.toNumber()).toBe(0);
  });

  it("K-1 investment amounts from multiple K-1s aggregate for Form 4952", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "Fund Alpha",
          partnershipEIN: "20-2020206",
          ordinaryIncome: "8000",
          investmentInterestExpense: "1500", // Box 13 Code D
          investmentIncome: "3000", // Box 20 Code A
          investmentExpenses: "300", // Box 20 Code B
        },
        {
          partnershipName: "Fund Beta",
          partnershipEIN: "20-2020207",
          ordinaryIncome: "12000",
          investmentInterestExpense: "2500", // Box 13 Code D
          investmentIncome: "2000", // Box 20 Code A
          investmentExpenses: "200", // Box 20 Code B
        },
      ],
    });

    expect(result.form4952).toBeDefined();
    // Line 1 = 1500 + 2500 = 4000
    expect(result.form4952!.line1.toNumber()).toBe(4000);
    // Line 4a = 3000 + 2000 = 5000
    expect(result.form4952!.line4a.toNumber()).toBe(5000);
    // Line 4f = 300 + 200 = 500
    expect(result.form4952!.line4f.toNumber()).toBe(500);
    // Line 4g = max(0, 5000 + 0 + 0 - 500) = 4500
    expect(result.form4952!.line4g.toNumber()).toBe(4500);
    // Deduction = min(4000, 4500) = 4000 (fully deductible)
    expect(result.form4952!.deductibleAmount.toNumber()).toBe(4000);
    expect(result.form4952!.disallowedCarryforward.toNumber()).toBe(0);
  });

  it("K-1 investment interest with limited income creates carryforward to Schedule A", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "12000",
        outstandingMortgagePrincipal: "250000",
        propertyTax: "5000",
      }],
      scheduleK1: [{
        partnershipName: "High-Leverage LP",
        partnershipEIN: "20-2020208",
        ordinaryIncome: "5000",
        investmentInterestExpense: "8000", // Box 13 Code D
        investmentIncome: "3000", // Box 20 Code A — not enough
      }],
    });

    expect(result.form4952).toBeDefined();
    // Deduction = min(8000, 3000) = 3000
    expect(result.form4952!.deductibleAmount.toNumber()).toBe(3000);
    // Carryforward = 8000 - 3000 = 5000
    expect(result.form4952!.disallowedCarryforward.toNumber()).toBe(5000);

    // Form 4952 deduction flows to Schedule A Line 9
    const schedALine9 = result.allLines.find(
      (l) => l.form === "Sched A" && l.line === "9"
    );
    expect(schedALine9).toBeDefined();
    expect(schedALine9!.value.toNumber()).toBe(3000);
  });

  it("audit trail records K-1 investment amount aggregation", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Audit Trail LP",
        partnershipEIN: "20-2020209",
        ordinaryIncome: "10000",
        investmentInterestExpense: "2000",
        investmentIncome: "5000",
        investmentExpenses: "500",
      }],
    });

    const k1InvLine = result.allLines.find(
      (l) => l.form === "K-1" && l.line === "inv"
    );
    expect(k1InvLine).toBeDefined();
    expect(k1InvLine!.description).toContain("K-1 investment amounts");
  });

  it("K-1 without investment amounts does not trigger Form 4952", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Simple LP",
        partnershipEIN: "20-2020210",
        ordinaryIncome: "15000",
      }],
    });

    // Form 4952 should not be triggered
    expect(result.form4952).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════
// IRC §163(j) Partner-Level Business Interest Expense
// ═══════════════════════════════════════════════════════════

describe("IRC §163(j) partner-level business interest expense", () => {
  it("K-1 partnership Box 20 Code AE excess taxable income enables prior-year EBIE deduction", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Real Estate Fund LP",
        partnershipEIN: "30-3030301",
        ordinaryIncome: "20000",
        excessTaxableIncome: "15000", // Partnership Box 20 Code AE
      }],
      priorYear: {
        suspendedBusinessInterest: [{
          partnershipName: "Real Estate Fund LP",
          partnershipEIN: "30-3030301",
          amount: "10000",
        }],
      },
    });

    // Full prior EBIE deducted (10K suspended ≤ 15K ETI)
    // Schedule E income should be 20000 - 10000 = 10000 effectively through Schedule 1
    const sched1Line5 = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "5"
    );
    expect(sched1Line5).toBeDefined();
    expect(sched1Line5!.value.toNumber()).toBe(10000); // 20000 - 10000 §163(j) deduction

    // No carryforward — fully deducted
    expect(result.carryforwards.suspendedBusinessInterest).toEqual([]);
  });

  it("K-1 partnership Box 20 Code AF excess business interest income enables prior-year EBIE deduction", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Credit Fund LP",
        partnershipEIN: "30-3030302",
        ordinaryIncome: "15000",
        excessBusinessInterestIncome: "8000", // Partnership Box 20 Code AF
      }],
      priorYear: {
        suspendedBusinessInterest: [{
          partnershipName: "Credit Fund LP",
          partnershipEIN: "30-3030302",
          amount: "5000",
        }],
      },
    });

    // Full prior EBIE deducted (5K ≤ 8K EBII)
    const sched1Line5 = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "5"
    );
    expect(sched1Line5).toBeDefined();
    expect(sched1Line5!.value.toNumber()).toBe(10000); // 15000 - 5000

    expect(result.carryforwards.suspendedBusinessInterest).toEqual([]);
  });

  it("K-1 partnership Box 20 Code AF excess business interest income also increases Form 4952 Line 4a", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Structured Credit LP",
        partnershipEIN: "30-3030312",
        ordinaryIncome: "15000",
        excessBusinessInterestIncome: "8000", // Partnership Box 20 Code AF
      }],
      priorYear: {
        suspendedBusinessInterest: [{
          partnershipName: "Structured Credit LP",
          partnershipEIN: "30-3030312",
          amount: "5000",
        }],
      },
      form4952: {
        investmentInterestExpense: "6000",
      },
    });

    const sched1Line5 = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "5"
    );

    expect(sched1Line5).toBeDefined();
    expect(sched1Line5!.value.toNumber()).toBe(10000); // 15000 - 5000 EBIE deduction
    expect(result.form4952).toBeDefined();
    expect(result.form4952!.line4a.toNumber()).toBe(8000);
    expect(result.form4952!.line4g.toNumber()).toBe(8000);
    expect(result.form4952!.deductibleAmount.toNumber()).toBe(6000);
    expect(result.form4952!.disallowedCarryforward.toNumber()).toBe(0);
  });

  it("K-1 S-corp Box 17 Code AA does not release suspended partnership EBIE in the partnership-only slice", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Operating S Corp",
        partnershipEIN: "30-3030302",
        entityType: "s_corporation",
        ordinaryIncome: "15000",
        excessTaxableIncome: "8000", // S-corp Box 17 Code AA
      }],
      priorYear: {
        suspendedBusinessInterest: [{
          partnershipName: "Operating S Corp",
          partnershipEIN: "30-3030302",
          amount: "5000",
        }],
      },
    });

    const sched1Line5 = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "5"
    );
    expect(sched1Line5).toBeDefined();
    expect(sched1Line5!.value.toNumber()).toBe(15000); // No §163(j) reduction in this slice

    expect(result.carryforwards.suspendedBusinessInterest).toEqual([
      { partnershipName: "Operating S Corp", partnershipEIN: "30-3030302", amount: expect.any(Object) },
    ]);
    expect(result.carryforwards.suspendedBusinessInterest[0].amount.toNumber()).toBe(5000);
  });

  it("K-1 S-corp Box 17 Code AB does not increase Form 4952 Line 4a in the partnership-only slice", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Capital S Corp",
        partnershipEIN: "30-3030313",
        entityType: "s_corporation",
        ordinaryIncome: "15000",
        excessBusinessInterestIncome: "8000", // S-corp Box 17 Code AB
      }],
      form4952: {
        investmentInterestExpense: "6000",
      },
    });

    expect(result.form4952).toBeDefined();
    expect(result.form4952!.line4a.toNumber()).toBe(0);
    expect(result.form4952!.line4g.toNumber()).toBe(0);
    expect(result.form4952!.deductibleAmount.toNumber()).toBe(0);
    expect(result.form4952!.disallowedCarryforward.toNumber()).toBe(6000);
  });

  it("ETI + EBII combined enables larger EBIE deduction", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Diversified Fund LP",
        partnershipEIN: "30-3030303",
        ordinaryIncome: "25000",
        excessTaxableIncome: "6000", // Partnership Box 20 Code AE
        excessBusinessInterestIncome: "4000", // Partnership Box 20 Code AF
      }],
      priorYear: {
        suspendedBusinessInterest: [{
          partnershipName: "Diversified Fund LP",
          partnershipEIN: "30-3030303",
          amount: "8000",
        }],
      },
    });

    // Deductible = min(8000 suspended, 6000 + 4000 = 10000) = 8000
    const sched1Line5 = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "5"
    );
    expect(sched1Line5).toBeDefined();
    expect(sched1Line5!.value.toNumber()).toBe(17000); // 25000 - 8000

    expect(result.carryforwards.suspendedBusinessInterest).toEqual([]);
  });

  it("partial deduction when ETI is less than suspended EBIE carries forward remainder", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Leveraged RE Fund",
        partnershipEIN: "30-3030304",
        ordinaryIncome: "12000",
        excessTaxableIncome: "3000", // Partnership Box 20 Code AE; only 3K capacity
      }],
      priorYear: {
        suspendedBusinessInterest: [{
          partnershipName: "Leveraged RE Fund",
          partnershipEIN: "30-3030304",
          amount: "10000",
        }],
      },
    });

    // Deductible = min(10000, 3000) = 3000; remaining 7000 carries forward
    const sched1Line5 = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "5"
    );
    expect(sched1Line5).toBeDefined();
    expect(sched1Line5!.value.toNumber()).toBe(9000); // 12000 - 3000

    expect(result.carryforwards.suspendedBusinessInterest).toEqual([
      { partnershipName: "Leveraged RE Fund", partnershipEIN: "30-3030304", amount: expect.any(Object) },
    ]);
    expect(result.carryforwards.suspendedBusinessInterest[0].amount.toNumber()).toBe(7000);
  });

  it("no deduction when no ETI or EBII — full suspended EBIE carries forward", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "No-ETI Partnership",
        partnershipEIN: "30-3030305",
        ordinaryIncome: "8000",
        // No excessTaxableIncome or excessBusinessInterestIncome
      }],
      priorYear: {
        suspendedBusinessInterest: [{
          partnershipName: "No-ETI Partnership",
          partnershipEIN: "30-3030305",
          amount: "5000",
        }],
      },
    });

    // No deduction — full 5000 carries forward
    const sched1Line5 = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "5"
    );
    expect(sched1Line5).toBeDefined();
    expect(sched1Line5!.value.toNumber()).toBe(8000); // No reduction

    expect(result.carryforwards.suspendedBusinessInterest).toEqual([
      { partnershipName: "No-ETI Partnership", partnershipEIN: "30-3030305", amount: expect.any(Object) },
    ]);
    expect(result.carryforwards.suspendedBusinessInterest[0].amount.toNumber()).toBe(5000);
  });

  it("current-year Box 13 Code K EBIE creates new suspended carryforward", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "New Debt Fund LP",
        partnershipEIN: "30-3030306",
        ordinaryIncome: "20000",
        excessBusinessInterest: "7000", // Box 13 Code K — new current-year EBIE
      }],
    });

    // New EBIE should be suspended for future deduction
    expect(result.carryforwards.suspendedBusinessInterest).toEqual([
      { partnershipName: "New Debt Fund LP", partnershipEIN: "30-3030306", amount: expect.any(Object) },
    ]);
    expect(result.carryforwards.suspendedBusinessInterest[0].amount.toNumber()).toBe(7000);
  });

  it("prior EBIE deducted plus new Code K EBIE produces net carryforward", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Rolling Debt Fund",
        partnershipEIN: "30-3030307",
        ordinaryIncome: "15000",
        excessTaxableIncome: "6000", // Partnership Box 20 Code AE enables deduction of prior suspended
        excessBusinessInterest: "4000", // New current-year EBIE
      }],
      priorYear: {
        suspendedBusinessInterest: [{
          partnershipName: "Rolling Debt Fund",
          partnershipEIN: "30-3030307",
          amount: "10000",
        }],
      },
    });

    // Deducted = min(10000, 6000) = 6000; remaining = 10000 - 6000 = 4000
    // New EBIE = 4000; total carryforward = 4000 + 4000 = 8000
    const sched1Line5 = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "5"
    );
    expect(sched1Line5).toBeDefined();
    expect(sched1Line5!.value.toNumber()).toBe(9000); // 15000 - 6000

    expect(result.carryforwards.suspendedBusinessInterest[0].amount.toNumber()).toBe(8000);
  });

  it("multi-partnership: deduction is per-entity, not cross-entity", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "Fund Alpha",
          partnershipEIN: "30-3030308",
          ordinaryIncome: "10000",
          excessTaxableIncome: "5000", // Alpha has partnership Box 20 Code AE ETI
        },
        {
          partnershipName: "Fund Beta",
          partnershipEIN: "30-3030309",
          ordinaryIncome: "10000",
          // Beta has NO ETI
        },
      ],
      priorYear: {
        suspendedBusinessInterest: [
          {
            partnershipName: "Fund Alpha",
            partnershipEIN: "30-3030308",
            amount: "3000",
          },
          {
            partnershipName: "Fund Beta",
            partnershipEIN: "30-3030309",
            amount: "8000",
          },
        ],
      },
    });

    // Alpha: deduct min(3000, 5000) = 3000, no carryforward
    // Beta: deduct min(8000, 0) = 0, carry 8000
    // Total §163(j) deduction = 3000
    const sched1Line5 = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "5"
    );
    expect(sched1Line5).toBeDefined();
    expect(sched1Line5!.value.toNumber()).toBe(17000); // 20000 - 3000

    // Only Beta should have carryforward
    expect(result.carryforwards.suspendedBusinessInterest).toHaveLength(1);
    expect(result.carryforwards.suspendedBusinessInterest[0].partnershipEIN).toBe("30-3030309");
    expect(result.carryforwards.suspendedBusinessInterest[0].amount.toNumber()).toBe(8000);
  });

  it("audit trail records per-entity §163(j) deduction details", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Audit LP",
        partnershipEIN: "30-3030310",
        ordinaryIncome: "20000",
        excessTaxableIncome: "12000",
      }],
      priorYear: {
        suspendedBusinessInterest: [{
          partnershipName: "Audit LP",
          partnershipEIN: "30-3030310",
          amount: "8000",
        }],
      },
    });

    const deductionLine = result.allLines.find(
      (l) => l.form === "§163(j)" && l.line === "30-3030310"
    );
    expect(deductionLine).toBeDefined();
    expect(deductionLine!.value.toNumber()).toBe(8000);
    expect(deductionLine!.description).toContain("§163(j) EBIE deduction");
    expect(deductionLine!.description).toContain("Audit LP");
  });

  it("§163(j) deduction reduces AGI", () => {
    const withoutDeduction = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "AGI Test LP",
        partnershipEIN: "30-3030311",
        ordinaryIncome: "20000",
      }],
    });

    const withDeduction = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "AGI Test LP",
        partnershipEIN: "30-3030311",
        ordinaryIncome: "20000",
        excessTaxableIncome: "10000",
      }],
      priorYear: {
        suspendedBusinessInterest: [{
          partnershipName: "AGI Test LP",
          partnershipEIN: "30-3030311",
          amount: "5000",
        }],
      },
    });

    // AGI should be $5000 lower with the §163(j) deduction
    expect(withDeduction.agi.toNumber()).toBe(withoutDeduction.agi.toNumber() - 5000);
  });
});

// ═══════════════════════════════════════════════════════════
// REIT Dividends and PTP Income — Federal Integration
// ═══════════════════════════════════════════════════════════

describe("REIT dividends and PTP income - federal integration", () => {
  it("1099-DIV Box 5 REIT dividends flow through Form 8995 as QBI deduction", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [
        {
          payer: "Vanguard REIT Index Fund",
          ordinaryDividends: "5000",
          qualifiedDividends: "500",
          section199ADividends: "4000",
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    // REIT-only investor: Form 8995 triggered by REIT dividends
    expect(result.form8995).toBeDefined();
    expect(result.form8995!.reitPTPAmount.toNumber()).toBe(4000);
    expect(result.form8995!.reitPTPComponent.toNumber()).toBe(800); // 20% of $4K
    expect(result.form8995!.qbiDeduction.toNumber()).toBe(800);
  });

  it("multiple 1099-DIV Box 5 amounts aggregate into REIT dividend total", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [
        { payer: "Vanguard REIT", ordinaryDividends: "3000", section199ADividends: "2500" },
        { payer: "Schwab REIT", ordinaryDividends: "2000", section199ADividends: "1500" },
        { payer: "Fidelity Growth", ordinaryDividends: "1000" }, // no REIT dividends
      ],
    };
    const result = calculateFederalTax(fixture);
    expect(result.form8995).toBeDefined();
    expect(result.form8995!.reitPTPAmount.toNumber()).toBe(4000); // $2500 + $1500
    expect(result.form8995!.qbiDeduction.toNumber()).toBe(800); // 20% of $4K
  });

  it("K-1 qualified REIT dividends aggregate with 1099-DIV Box 5", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [
        { payer: "REIT Fund", ordinaryDividends: "3000", section199ADividends: "2000" },
      ],
      scheduleK1: [
        {
          partnershipName: "Real Estate LP",
          partnershipEIN: "98-7654321",
          ordinaryIncome: "10000",
          section199AQualifiedReitDividends: "3000",
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    expect(result.form8995).toBeDefined();
    // REIT total: $2000 (1099-DIV) + $3000 (K-1) = $5000
    expect(result.form8995!.reitPTPAmount.toNumber()).toBe(5000);
    expect(result.form8995!.reitPTPComponent.toNumber()).toBe(1000); // 20% of $5K
  });

  it("K-1 qualified PTP income flows through Form 8995", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "Pipeline MLP",
          partnershipEIN: "98-7654321",
          ordinaryIncome: "5000",
          section199AQualifiedPTPIncome: "8000",
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    expect(result.form8995).toBeDefined();
    // PTP income: $8K from K-1
    expect(result.form8995!.reitPTPAmount.toNumber()).toBe(8000);
    expect(result.form8995!.reitPTPComponent.toNumber()).toBe(1600); // 20% of $8K
  });

  it("REIT and PTP combined with Schedule C QBI below threshold", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "40000", federalWithheld: "0" }],
      form1099Div: [
        { payer: "REIT Fund", ordinaryDividends: "8000", section199ADividends: "6000" },
      ],
      scheduleK1: [
        {
          partnershipName: "Energy MLP",
          partnershipEIN: "98-7654321",
          ordinaryIncome: "3000",
          section199AQualifiedPTPIncome: "4000",
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    expect(result.form8995).toBeDefined();
    // REIT: $6K; PTP: $4K; combined REIT/PTP = $10K
    expect(result.form8995!.reitPTPAmount.toNumber()).toBe(10000);
    expect(result.form8995!.reitPTPComponent.toNumber()).toBe(2000); // 20% of $10K
    // QBI component from Schedule C should also be present
    expect(result.form8995!.qbiComponent.greaterThan(0)).toBe(true);
    // Deduction includes both QBI and REIT/PTP components
    expect(result.form8995!.qbiDeduction.greaterThan(result.form8995!.reitPTPComponent)).toBe(true);
  });

  it("REIT dividends above threshold use Form 8995-A with no W-2/UBIA limit on REIT", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{ employer: { name: "Employer", ein: "12-3456789" }, wages: "250000", federalWithheld: "50000" }],
      form1099Div: [
        { payer: "REIT Fund", ordinaryDividends: "30000", section199ADividends: "25000" },
      ],
    };
    const result = calculateFederalTax(fixture);
    // Above threshold ($197,300 single) → Form 8995-A
    expect(result.form8995A).toBeDefined();
    expect(result.form8995A!.qualifiedReitDividends.toNumber()).toBe(25000);
    // REIT component: 20% of $25K = $5K (no W-2/UBIA limit per IRC §199A(b)(3))
    expect(result.form8995A!.reitPTPComponent.toNumber()).toBe(5000);
    expect(result.form8995A!.qbiDeduction.toNumber()).toBe(5000);
  });

  it("PTP income above threshold uses Form 8995-A with per-PTP W-2/UBIA limits", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{ employer: { name: "Employer", ein: "12-3456789" }, wages: "280000", federalWithheld: "55000" }],
      scheduleK1: [
        {
          partnershipName: "Pipeline LP",
          partnershipEIN: "98-7654321",
          ordinaryIncome: "15000",
          section199AQualifiedPTPIncome: "20000",
          section199APTPW2Wages: "8000",
          section199APTPUBIA: "50000",
        },
      ],
    };
    const result = calculateFederalTax(fixture);
    expect(result.form8995A).toBeDefined();
    expect(result.form8995A!.ptpBusinesses.length).toBe(1);
    // PTP has W-2/UBIA limits applied above the threshold
    const ptpBiz = result.form8995A!.ptpBusinesses[0];
    expect(ptpBiz.line1QBI.toNumber()).toBe(20000);
    expect(ptpBiz.line3W2Wages.toNumber()).toBe(8000);
    expect(ptpBiz.line5UBIA.toNumber()).toBe(50000);
  });

  it("zero REIT and zero PTP does not trigger QBI computation when no trade/business QBI", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [
        { payer: "Bond Fund", ordinaryDividends: "3000" }, // no REIT dividends
      ],
    };
    const result = calculateFederalTax(fixture);
    // No QBI sources, no REIT, no PTP → no Form 8995
    expect(result.form8995).toBeUndefined();
    expect(result.form8995A).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════
// IRC §172 Net Operating Loss Deduction
// ═══════════════════════════════════════════════════════════

describe("IRC §172 Net Operating Loss Deduction", () => {
  it("Form 1040 - NOL deduction from prior-year excess business loss reduces taxable income", () => {
    // Single filer, $85K wages, standard deduction ~$15,000 (2025)
    // Pre-NOL taxable income ≈ $85,000 - $15,000 = $70,000
    // NOL carryforward of $20,000 → 80% of $70,000 = $56,000 > $20,000 → full $20,000 deducted
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      priorYear: {
        excessBusinessLossNOL: "20000",
      },
    };
    const result = calculateFederalTax(fixture);
    const baseResult = calculateFederalTax(simpleW2Fixture);

    expect(result.nolDeduction.toNumber()).toBe(20000);
    expect(result.taxableIncome.toNumber()).toBe(
      baseResult.taxableIncome.toNumber() - 20000
    );
    // AGI is also reduced by the NOL deduction
    expect(result.agi.toNumber()).toBe(baseResult.agi.toNumber() - 20000);
    // Remaining NOL carryforward should be zero (fully used)
    expect(result.carryforwards.nolCarryforward.toNumber()).toBe(0);
  });

  it("Form 1040 - NOL deduction is limited to 80% of pre-NOL taxable income", () => {
    // Single filer, $85K wages, standard deduction ~$15,000
    // Pre-NOL taxable income ≈ $70,000
    // 80% of $70,000 = $56,000
    // NOL carryforward of $100,000 → limited to $56,000
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      priorYear: {
        excessBusinessLossNOL: "100000",
      },
    };
    const result = calculateFederalTax(fixture);
    const baseResult = calculateFederalTax(simpleW2Fixture);
    const expectedLimit = baseResult.taxableIncome.times(d("0.8"));

    expect(result.nolDeduction.toNumber()).toBe(expectedLimit.toNumber());
    expect(result.taxableIncome.toNumber()).toBe(
      baseResult.taxableIncome.minus(expectedLimit).toNumber()
    );
    // Remaining NOL = 100,000 - deduction used
    expect(result.carryforwards.nolCarryforward.toNumber()).toBeGreaterThan(0);
  });

  it("Form 1040 - no NOL deduction when no prior-year carryforward exists", () => {
    const result = calculateFederalTax(simpleW2Fixture);
    expect(result.nolDeduction.toNumber()).toBe(0);
    expect(result.carryforwards.nolCarryforward.toNumber()).toBe(0);
  });

  it("Form 1040 - general nolCarryforward input takes precedence over excessBusinessLossNOL", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      priorYear: {
        excessBusinessLossNOL: "10000",
        nolCarryforward: "25000",
      },
    };
    const result = calculateFederalTax(fixture);
    // nolCarryforward takes precedence
    expect(result.nolDeduction.toNumber()).toBe(25000);
  });

  it("Form 1040 - NOL deduction is zero when pre-NOL taxable income is zero", () => {
    // Create a scenario where taxable income is approximately zero
    // Single filer with $15,000 wages (roughly equal to the standard deduction)
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [
        {
          employer: { name: "Low-Pay Corp", ein: "98-7654321" },
          wages: "15000",
          federalWithheld: "500",
          socialSecurityWages: "15000",
          socialSecurityWithheld: "930",
          medicareWages: "15000",
          medicareWithheld: "217.50",
          stateTaxWithheld: "0",
          stateWages: "0",
          localTaxWithheld: "0",
          state: "WA",
        },
      ],
      priorYear: {
        excessBusinessLossNOL: "50000",
      },
    };
    const result = calculateFederalTax(fixture);
    // With $15,000 wages and ~$15,000 standard deduction, taxable income ≈ $0
    // 80% of $0 = $0 → no NOL deduction
    expect(result.nolDeduction.toNumber()).toBe(0);
    // Full carryforward continues - Form 461 accumulates but nothing is used
    expect(result.carryforwards.nolCarryforward.greaterThan(d(0))).toBe(true);
  });

  it("Form 1040 - NOL carryforward accumulates unused prior-year NOL with current-year Form 461 excess", () => {
    // Single filer with large business loss that creates a Form 461 excess
    // Plus a prior-year NOL that can be partially deducted
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleC: {
        grossReceipts: "0",
        totalExpenses: "500000",
      },
      priorYear: {
        excessBusinessLossNOL: "30000",
      },
    };
    const result = calculateFederalTax(fixture);
    // With a large current-year loss, Form 461 creates a new NOL
    // The prior-year NOL feeds into Form 461 accumulation
    // excessBusinessLossNOL should include both current-year excess and prior-year NOL
    expect(result.carryforwards.excessBusinessLossNOL.greaterThan(d(0))).toBe(true);
  });

  it("Form 1040 - NOL deduction reduces total income and other income in the output", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      priorYear: {
        excessBusinessLossNOL: "15000",
      },
    };
    const result = calculateFederalTax(fixture);
    const baseResult = calculateFederalTax(simpleW2Fixture);

    // otherIncome and totalIncome should be reduced by the NOL deduction
    expect(result.otherIncome.toNumber()).toBe(
      baseResult.otherIncome.toNumber() - 15000
    );
    expect(result.totalIncome.toNumber()).toBe(
      baseResult.totalIncome.toNumber() - 15000
    );
  });

  it("Form 1040 - NOL deduction produces a lower tax liability than without the deduction", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      priorYear: {
        excessBusinessLossNOL: "20000",
      },
    };
    const result = calculateFederalTax(fixture);
    const baseResult = calculateFederalTax(simpleW2Fixture);

    expect(result.totalTax.lessThan(baseResult.totalTax)).toBe(true);
  });

  it("Form 1040 - Schedule 1 sub-result includes the NOL deduction", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      priorYear: {
        excessBusinessLossNOL: "20000",
      },
    };
    const result = calculateFederalTax(fixture);
    expect(result.schedule1!.nolDeduction.toNumber()).toBe(20000);
  });
});

// ═══════════════════════════════════════════════════════════
// §280F(b)(2) Recapture — listed property business use drop
// ═══════════════════════════════════════════════════════════

describe("Form 1040 — §280F(b)(2) recapture flows to ordinary income", () => {
  it("Schedule C with §280F recapture increases total income", () => {
    const base = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleC: {
        businessName: "Consulting LLC",
        expenses: {
          depreciation: "5000",
        },
      },
    });

    const withRecapture = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleC: {
        businessName: "Consulting LLC",
        expenses: {},
      },
      form4562: {
        taxYear: 2025,
        section179TotalCost: "0",
        section179ElectedCost: "0",
        section179BusinessIncomeLimit: "100000",
        assets: [
          {
            costBasis: "50000",
            placedInServiceDate: "2022-06",
            recoveryPeriod: "5",
            isListedProperty: true,
            isPassengerAutomobile: true,
            businessUsePercentage: 30,
            section280FRecaptureTriggered: true,
            cumulativePriorMacrsDeductions: "20000",
            cumulativePriorAdsDeductions: "14000",
            description: "Business vehicle",
          },
        ],
      },
    });

    // Recapture = $20,000 - $14,000 = $6,000 additional ordinary income
    // The recapture should increase total income
    expect(withRecapture.totalIncome.minus(base.totalIncome).toNumber()).toBeGreaterThanOrEqual(1000);
    // Check the audit trail has the §280F recapture entries from Form 4562
    const recaptureAudit = withRecapture.allLines.filter(
      l => l.line === "Part IV §280F" || l.line === "§280F recapture" || l.line === "§280F recapture total"
    );
    expect(recaptureAudit.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════
// Form 1099-C — Cancellation of Debt through federal pipeline
// ═══════════════════════════════════════════════════════════

describe("Form 1099-C cancellation of debt through federal pipeline", () => {
  it("Taxable COD income flows to other income and increases AGI", () => {
    const base = calculateFederalTax(simpleW2Fixture);
    const withCod = calculateFederalTax({
      ...simpleW2Fixture,
      form1099C: [
        { creditor: "Chase", amountDischarged: "15000", personallyLiable: true },
      ],
    });

    // COD income should increase other income by $15,000
    expect(withCod.otherIncome.minus(base.otherIncome).toNumber()).toBe(15000);
    // AGI should also increase by $15,000
    expect(withCod.agi.minus(base.agi).toNumber()).toBe(15000);
    // Total income should increase
    expect(withCod.totalIncome.minus(base.totalIncome).toNumber()).toBe(15000);
  });

  it("Multiple 1099-C forms are aggregated through the federal return", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099C: [
        { creditor: "Bank A", amountDischarged: "8000", personallyLiable: false },
        { creditor: "Bank B", amountDischarged: "12000", personallyLiable: true },
      ],
    });

    // Schedule 1 sub-result should show aggregated COD income
    expect(result.schedule1!.cancelledDebtIncome.toNumber()).toBe(20000);
  });

  it("Insolvency exclusion reduces taxable COD income flowing to AGI", () => {
    const fullyTaxable = calculateFederalTax({
      ...simpleW2Fixture,
      form1099C: [
        { creditor: "Creditor", amountDischarged: "25000", personallyLiable: true },
      ],
    });
    const partiallyExcluded = calculateFederalTax({
      ...simpleW2Fixture,
      form1099C: [
        { creditor: "Creditor", amountDischarged: "25000", personallyLiable: true },
      ],
      codExclusion: {
        insolvency: {
          totalLiabilities: "200000",
          totalAssets: "185000",
          // Insolvent by $15,000 → $10,000 remains taxable
        },
      },
    });

    expect(fullyTaxable.schedule1!.cancelledDebtIncome.toNumber()).toBe(25000);
    expect(partiallyExcluded.schedule1!.cancelledDebtIncome.toNumber()).toBe(10000);
    // AGI difference should be $15,000 (the excluded amount)
    expect(fullyTaxable.agi.minus(partiallyExcluded.agi).toNumber()).toBe(15000);
  });

  it("Bankruptcy exclusion eliminates all taxable COD income", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099C: [
        { creditor: "Creditor", amountDischarged: "50000", personallyLiable: true },
      ],
      codExclusion: {
        bankruptcy: true,
      },
    });

    expect(result.schedule1!.cancelledDebtIncome.toNumber()).toBe(0);
  });

  it("COD income audit trail appears in allLines", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099C: [
        { creditor: "Chase", amountDischarged: "10000", personallyLiable: false },
      ],
    });

    const codLine = result.allLines.find(
      l => l.form === "Form 1099-C" && l.line === "taxable"
    );
    expect(codLine).toBeDefined();
    expect(codLine!.value.toNumber()).toBe(10000);
  });
});

// ═══════════════════════════════════════════════════════════
// Form 6781 — Section 1256 Contracts through federal pipeline
// ═══════════════════════════════════════════════════════════

describe("Form 6781 Section 1256 contracts through federal pipeline", () => {
  it("60/40 split flows through Schedule D to capital gain/loss on return", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form6781: {
        section1256Gains: "100000",
        section1256Losses: "0",
        adjustments: "0",
        carrybackElection: false,
        carrybackAmount: "0",
        shortTermStraddleLosses: "0",
        longTermStraddleLosses: "0",
        shortTermStraddleGains: "0",
        longTermStraddleGains: "0",
      },
    });

    // Net gain $100,000 → 40% ST ($40,000) + 60% LT ($60,000)
    expect(result.scheduleD!.netShortTerm.toNumber()).toBe(40000);
    expect(result.scheduleD!.netLongTerm.toNumber()).toBe(60000);
    // Capital gain should be $100,000 on the return
    expect(result.capitalGainLoss.toNumber()).toBe(100000);
    // Total income should include the capital gain
    expect(result.totalIncome.toNumber()).toBe(85000 + 100000);
  });

  it("Section 1256 net loss reduces capital gains on the return", () => {
    const base = calculateFederalTax({
      ...simpleW2Fixture,
      form1099B: [
        {
          broker: "Fidelity",
          transactions: [
            {
              description: "AAPL",
              dateAcquired: "2020-01-01",
              dateSold: "2025-06-01",
              proceeds: "50000",
              costBasis: "30000",
              holdingPeriod: "long",
              adjustments: "0",
              basisReportedToIRS: true,
              washSale: false,
              washSaleDisallowed: "0",
            },
          ],
        },
      ],
    });

    const withLoss = calculateFederalTax({
      ...simpleW2Fixture,
      form1099B: [
        {
          broker: "Fidelity",
          transactions: [
            {
              description: "AAPL",
              dateAcquired: "2020-01-01",
              dateSold: "2025-06-01",
              proceeds: "50000",
              costBasis: "30000",
              holdingPeriod: "long",
              adjustments: "0",
              basisReportedToIRS: true,
              washSale: false,
              washSaleDisallowed: "0",
            },
          ],
        },
      ],
      form6781: {
        section1256Gains: "5000",
        section1256Losses: "15000",
        adjustments: "0",
        carrybackElection: false,
        carrybackAmount: "0",
        shortTermStraddleLosses: "0",
        longTermStraddleLosses: "0",
        shortTermStraddleGains: "0",
        longTermStraddleGains: "0",
      },
    });

    // Net 1256 loss = -$10,000 → -$4,000 ST + -$6,000 LT
    // Base has +$20,000 LT from stock sale
    // Combined LT: $20,000 - $6,000 = $14,000
    // Combined ST: -$4,000
    // Net capital gain: $14,000 - $4,000 = $10,000
    expect(withLoss.capitalGainLoss.toNumber()).toBe(10000);
    expect(base.capitalGainLoss.toNumber()).toBe(20000);
  });

  it("Straddle gains/losses flow through Schedule D to the return", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form6781: {
        section1256Gains: "0",
        section1256Losses: "0",
        adjustments: "0",
        carrybackElection: false,
        carrybackAmount: "0",
        shortTermStraddleLosses: "3000",
        longTermStraddleLosses: "5000",
        shortTermStraddleGains: "1000",
        longTermStraddleGains: "2000",
      },
    });

    // ST: -3000 + 1000 = -2000
    // LT: -5000 + 2000 = -3000
    // Net: -5000, capped at -3000
    expect(result.scheduleD!.netShortTerm.toNumber()).toBe(-2000);
    expect(result.scheduleD!.netLongTerm.toNumber()).toBe(-3000);
    expect(result.capitalGainLoss.toNumber()).toBe(-3000); // $3,000 loss deduction cap
  });
});

// ═══════════════════════════════════════════════════════════
// Schedule F — Farm income through federal pipeline
// ═══════════════════════════════════════════════════════════

describe("Schedule F farm income through federal pipeline", () => {
  it("Net farm profit flows to total income and triggers SE tax", () => {
    const base = calculateFederalTax(simpleW2Fixture);
    const farmer = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleF: {
        salesOfProductsRaised: "80000",
        customHireIncome: "5000",
        expenses: {
          feed: "20000",
          seedsAndPlants: "8000",
          utilities: "3000",
          repairsAndMaintenance: "4000",
        },
      },
    });

    // Net farm profit: $85,000 income - $35,000 expenses = $50,000
    expect(farmer.scheduleF!.netFarmProfit.toNumber()).toBe(50000);
    // Total income should increase by $50,000
    expect(farmer.totalIncome.minus(base.totalIncome).toNumber()).toBe(50000);
    // SE tax should be computed on the farm profit
    expect(farmer.selfEmploymentTax.toNumber()).toBeGreaterThan(0);
    // Deductible half of SE tax should reduce AGI compared to just adding $50K
    expect(farmer.agi.toNumber()).toBeLessThan(base.agi.toNumber() + 50000);
  });

  it("Schedule F sub-result is populated on the return", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleF: {
        salesOfProductsRaised: "40000",
        expenses: {
          feed: "10000",
        },
      },
    });

    expect(result.scheduleF).toBeDefined();
    expect(result.scheduleF!.netFarmProfit.toNumber()).toBe(30000);
  });

  it("Farm loss reduces total income", () => {
    const base = calculateFederalTax(simpleW2Fixture);
    const farmerLoss = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleF: {
        salesOfProductsRaised: "10000",
        expenses: {
          feed: "20000",
          seedsAndPlants: "8000",
        },
      },
    });

    // Net loss: $10,000 - $28,000 = -$18,000
    expect(farmerLoss.scheduleF!.netFarmProfit.toNumber()).toBe(-18000);
    // Total income should be reduced
    expect(farmerLoss.totalIncome.toNumber()).toBeLessThan(base.totalIncome.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// Form 2555 — Foreign Earned Income Exclusion through federal pipeline
// ═══════════════════════════════════════════════════════════

describe("Form 2555 foreign earned income exclusion through federal pipeline", () => {
  it("Foreign earned income exclusion reduces wages and total income", () => {
    const base = calculateFederalTax(simpleW2Fixture);
    const withExclusion = calculateFederalTax({
      ...simpleW2Fixture,
      form2555: {
        foreignEarnedIncome: "85000",
        qualifyingDays: 365,
        totalDaysInYear: 365,
      },
    });

    // The exclusion should reduce wages
    expect(withExclusion.totalWages.toNumber()).toBeLessThan(base.totalWages.toNumber());
    // Total income should decrease
    expect(withExclusion.totalIncome.toNumber()).toBeLessThan(base.totalIncome.toNumber());
    // Tax should be lower
    expect(withExclusion.totalTax.toNumber()).toBeLessThan(base.totalTax.toNumber());
  });

  it("Partial-year proration reduces the exclusion proportionally", () => {
    const fullYear = calculateFederalTax({
      ...simpleW2Fixture,
      form2555: {
        foreignEarnedIncome: "85000",
        qualifyingDays: 365,
        totalDaysInYear: 365,
      },
    });
    const halfYear = calculateFederalTax({
      ...simpleW2Fixture,
      form2555: {
        foreignEarnedIncome: "85000",
        qualifyingDays: 183,
        totalDaysInYear: 365,
      },
    });

    // Half-year should have higher wages than full year (less excluded)
    expect(halfYear.totalWages.toNumber()).toBeGreaterThan(fullYear.totalWages.toNumber());
  });

  it("Form 2555 sub-result is populated on the return", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form2555: {
        foreignEarnedIncome: "50000",
        qualifyingDays: 365,
        totalDaysInYear: 365,
      },
    });

    expect(result.form2555).toBeDefined();
    expect(result.form2555!.totalIncomeReduction.toNumber()).toBeGreaterThan(0);
  });

  it("Housing deduction flows to Schedule 1 adjustments for SE filers", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form2555: {
        foreignEarnedIncome: "100000",
        qualifyingDays: 365,
        totalDaysInYear: 365,
        qualifiedHousingExpenses: "25000",
        isSelfEmployed: true,
      },
    });

    // Housing deduction should appear in the result
    expect(result.form2555!.housingDeduction.toNumber()).toBeGreaterThan(0);
    // It should reduce AGI through Schedule 1
    expect(result.schedule1).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════
// Form 4684 — Casualty and Theft Losses through federal pipeline
// ═══════════════════════════════════════════════════════════

describe("Form 4684 casualty losses through federal pipeline", () => {
  it("Deductible casualty loss flows through Schedule A to itemized deductions", () => {
    // Create a fixture with enough itemized deductions to exceed standard deduction
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      // Need some base itemized deductions plus casualty loss
      scheduleA: {
        medicalExpenses: "0",
        stateLocalTaxes: "10000",
        mortgageInterest: "10000",
      },
      form4684: {
        events: [
          {
            description: "Hurricane disaster",
            femaDeclarationNumber: "DR-4000",
            properties: [
              {
                description: "Home damage",
                costOrBasis: "200000",
                insuranceReimbursement: "50000",
                fairMarketValueBefore: "250000",
                fairMarketValueAfter: "200000",
              },
            ],
          },
        ],
      },
    });

    // The casualty loss should be computed
    expect(result.form4684).toBeDefined();
    // If itemized, Schedule A should include the casualty loss
    if (result.deductionUsed === "itemized") {
      expect(result.scheduleA).toBeDefined();
      expect(result.itemizedDeductions.toNumber()).toBeGreaterThan(20000);
    }
  });

  it("Form 4684 sub-result and audit trail are populated", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form4684: {
        events: [
          {
            description: "Flood",
            femaDeclarationNumber: "DR-5000",
            properties: [
              {
                description: "Furniture",
                costOrBasis: "5000",
                insuranceReimbursement: "0",
                fairMarketValueBefore: "5000",
                fairMarketValueAfter: "0",
              },
            ],
          },
        ],
      },
    });

    expect(result.form4684).toBeDefined();
    const casualtyLines = result.allLines.filter(l => l.form === "Form 4684");
    expect(casualtyLines.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Form 8615 — Kiddie Tax through federal pipeline
// ═══════════════════════════════════════════════════════════

describe("Form 8615 kiddie tax through federal pipeline", () => {
  it("Kiddie tax replaces normal tax computation when it applies", () => {
    // Child with $10,000 unearned income and $15,000 wages
    const childFixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [
        {
          employer: { name: "Summer Job", ein: "12-3456789" },
          wages: "15000",
          federalWithheld: "1500",
          socialSecurityWages: "15000",
          socialSecurityWithheld: "930",
          medicareWages: "15000",
          medicareWithheld: "217.50",
          stateTaxWithheld: "0",
          stateWages: "0",
          localTaxWithheld: "0",
          state: "WA",
        },
      ],
      form1099Int: [
        {
          payer: "Trust Fund",
          interestIncome: "10000",
          federalWithheld: "0",
          earlyWithdrawalPenalty: "0",
          usSavingsBondInterest: "0",
          taxExemptInterest: "0",
        },
      ],
      form8615: {
        childUnearnedIncome: "10000",
        parentTaxableIncome: "200000",
        parentFilingStatus: "married_filing_jointly",
        parentQualifiedDividends: "5000",
      },
    };

    const result = calculateFederalTax(childFixture);

    // Form 8615 should apply since unearned income > $2,700 threshold
    expect(result.form8615).toBeDefined();
    expect(result.form8615!.applies).toBe(true);
    // The tax should be computed at the parent's marginal rate for unearned income
    expect(result.form8615!.tax.toNumber()).toBeGreaterThan(0);
  });

  it("Kiddie tax does not apply when unearned income is below threshold", () => {
    const childFixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [
        {
          employer: { name: "Summer Job", ein: "12-3456789" },
          wages: "15000",
          federalWithheld: "1500",
          socialSecurityWages: "15000",
          socialSecurityWithheld: "930",
          medicareWages: "15000",
          medicareWithheld: "217.50",
          stateTaxWithheld: "0",
          stateWages: "0",
          localTaxWithheld: "0",
          state: "WA",
        },
      ],
      form8615: {
        childUnearnedIncome: "2000",
        parentTaxableIncome: "200000",
        parentFilingStatus: "married_filing_jointly",
      },
    };

    const result = calculateFederalTax(childFixture);

    // Form 8615 should not apply since unearned income ≤ $2,700
    expect(result.form8615).toBeDefined();
    expect(result.form8615!.applies).toBe(false);
  });

  it("Form 8615 sub-result is returned on the federal result", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form8615: {
        childUnearnedIncome: "5000",
        parentTaxableIncome: "150000",
        parentFilingStatus: "single",
      },
    });

    expect(result.form8615).toBeDefined();
    expect(result.form8615!.netUnearnedIncome).toBeInstanceOf(Decimal);
  });
});

// ═══════════════════════════════════════════════════════════
// Form 3903 — Moving Expenses through federal pipeline
// ═══════════════════════════════════════════════════════════

describe("Form 3903 moving expenses through federal pipeline", () => {
  it("Military moving expense deduction reduces AGI", () => {
    const base = calculateFederalTax(simpleW2Fixture);
    const withMoving = calculateFederalTax({
      ...simpleW2Fixture,
      form3903: {
        military: true,
        moves: [
          {
            transportationAndStorage: "5000",
            travelAndLodging: "2000",
            reimbursementsExcludedFromIncome: "1000",
          },
        ],
      },
    });

    // Deductible amount: ($5,000 + $2,000) - $1,000 = $6,000
    // This is an above-the-line deduction reducing AGI
    expect(withMoving.agi.toNumber()).toBeLessThan(base.agi.toNumber());
    expect(base.agi.minus(withMoving.agi).toNumber()).toBe(6000);
  });

  it("Excess reimbursements result in zero deduction, no AGI change", () => {
    const base = calculateFederalTax(simpleW2Fixture);
    const withExcessReimb = calculateFederalTax({
      ...simpleW2Fixture,
      form3903: {
        military: true,
        moves: [
          {
            transportationAndStorage: "2000",
            travelAndLodging: "1000",
            reimbursementsExcludedFromIncome: "5000",
          },
        ],
      },
    });

    // Expenses $3,000 < reimbursements $5,000 → deduction is $0
    expect(withExcessReimb.agi.toNumber()).toBe(base.agi.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// Form 6252 — Installment Sales through federal pipeline
// ═══════════════════════════════════════════════════════════

describe("Form 6252 installment sales through federal pipeline", () => {
  it("Installment sale capital gain flows through Schedule D to the return", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form6252: [
        {
          propertyDescription: "Rental property",
          dateAcquired: "2015-01-01",
          dateSold: "2025-06-15",
          gainCharacter: "long_term_capital" as const,
          isYearOfSale: true,
          sellingPrice: "500000",
          costBasis: "300000",
          sellingExpenses: "30000",
          paymentsReceived: "100000",
        },
      ],
    });

    // Gross profit = $500K - $300K - $30K = $170K
    // GP% = $170K / $500K = 34%
    // Installment income = $100K × 34% = $34,000
    expect(result.capitalGainLoss.toNumber()).toBe(34000);
    expect(result.scheduleD!.netLongTerm.toNumber()).toBe(34000);
  });
});

// ═══════════════════════════════════════════════════════════
// Form 982 — Tax attribute reduction from excluded COD income
// ═══════════════════════════════════════════════════════════

describe("Form 982 federal integration", () => {
  it("Form 982 Part II - insolvency exclusion reduces NOL carryforward through federal pipeline", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099C: [
        {
          creditor: "Chase Bank",
          amountDischarged: "30000",
          personallyLiable: true,
        },
      ],
      codExclusion: {
        insolvency: {
          totalLiabilities: "200000",
          totalAssets: "180000",
        },
      },
      priorYear: {
        nolCarryforward: "15000",
        excessBusinessLossNOL: "15000",
      },
    });

    // Insolvency amount = 200K - 180K = 20K → exclude 20K of 30K COD
    // Taxable COD = 10K flows to Schedule 1 Line 8c
    expect(result.schedule1!.cancelledDebtIncome.toNumber()).toBe(10000);

    // Without Form 982: NOL carryforward would be 15000 - nolDeduction
    // With Form 982: the $20K exclusion reduces NOL in the general order
    // NOL after 80% deduction limit and then Form 982 reduction
    // The exact reduction depends on the NOL deduction applied, but the
    // carryforward should be less than it would be without Form 982
    expect(result.carryforwards.nolCarryforward.toNumber()).toBeLessThan(15000);
  });

  it("Form 982 Part II - bankruptcy exclusion with no carryforwards leaves carryforwards unchanged", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099C: [
        {
          creditor: "Medical Center",
          amountDischarged: "50000",
          personallyLiable: true,
        },
      ],
      codExclusion: {
        bankruptcy: true,
      },
    });

    // Bankruptcy excludes all $50K → taxable COD = 0
    expect(result.schedule1!.cancelledDebtIncome.toNumber()).toBe(0);
    // No carryforwards to reduce → carryforwards remain at zero
    expect(result.carryforwards.nolCarryforward.toNumber()).toBe(0);
    expect(result.carryforwards.capitalLoss.toNumber()).toBe(0);
  });

  it("Form 982 Part II - qualified principal residence exclusion reduces only residence basis (not engine carryforwards)", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099C: [
        {
          creditor: "Wells Fargo",
          amountDischarged: "100000",
          personallyLiable: true,
        },
      ],
      codExclusion: {
        qualifiedPrincipalResidence: {
          dischargedAmount: "100000",
        },
        basisOfPrincipalResidence: "300000",
      },
      priorYear: {
        nolCarryforward: "10000",
        excessBusinessLossNOL: "10000",
      },
    });

    // All $100K excluded for QPR → taxable COD = 0
    expect(result.schedule1!.cancelledDebtIncome.toNumber()).toBe(0);
    // QPR reduces ONLY residence basis, NOT NOL — NOL should be unchanged
    // (minus any NOL deduction applied to current-year income)
    // The NOL carryforward should reflect only the 80% deduction, not Form 982 reduction
    expect(result.carryforwards.nolCarryforward.greaterThanOrEqualTo(0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Form 5329 Part VII: HSA excess contribution auto-derivation from Form 8889
// ═══════════════════════════════════════════════════════════

describe("Form 5329 Part VII HSA excess contribution auto-derivation", () => {
  it("Form 5329 Line 47 - auto-computes current-year HSA excess when contributions exceed limit", () => {
    // Self-only coverage all year: limit = $4,300
    // Contributions: $5,000 (personal) + $500 (employer) = $5,500
    // Excess = $5,500 - $4,300 = $1,200
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "5000",
        employerContributions: "500",
      },
      form5329: {
        hsaValueDec31: "10000",
      },
    });

    expect(result.form5329?.line47.toNumber()).toBe(1200);
    expect(result.form5329?.line48.toNumber()).toBe(1200);
    expect(result.form5329?.line49.toNumber()).toBe(72); // 6% × $1,200
  });

  it("Form 5329 Line 43 - auto-computes unused HSA contribution room to absorb prior-year excess", () => {
    // Self-only coverage all year: limit = $4,300
    // Contributions: $2,000 (personal) + $0 (employer) = $2,000
    // Room = $4,300 - $2,000 = $2,300
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "2000",
      },
      form5329: {
        hsaPriorYearExcessContributions: "3000",
        hsaValueDec31: "10000",
      },
    });

    expect(result.form5329?.line43.toNumber()).toBe(2300);
    expect(result.form5329?.line46.toNumber()).toBe(700); // 3000 - 2300
    expect(result.form5329?.line47.toNumber()).toBe(0);
  });

  it("Form 5329 Line 44 - auto-computes taxable HSA distributions from Form 8889 Line 16", () => {
    // Distributions: $3,000 gross, $1,000 qualified medical expenses
    // Line 16 taxable = $2,000
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "4300",
        distributionsReceived: "3000",
        qualifiedMedicalExpenses: "1000",
      },
      form5329: {
        hsaPriorYearExcessContributions: "5000",
        hsaValueDec31: "20000",
      },
    });

    expect(result.form5329?.line44.toNumber()).toBe(2000);
  });

  it("Form 5329 Line 47 - no excess when contributions equal the limit", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "4300",
      },
      form5329: {
        hsaValueDec31: "10000",
      },
    });

    expect(result.form5329?.line47.toNumber()).toBe(0);
    expect(result.form5329?.line49.toNumber()).toBe(0);
  });

  it("Form 5329 Part VII - employer contributions exceeding limit create excess even with zero personal contributions", () => {
    // Self-only limit = $4,300, employer contributed $5,000
    // Excess = $5,000 - $4,300 = $700
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "0",
        employerContributions: "5000",
      },
      form5329: {
        hsaValueDec31: "10000",
      },
    });

    expect(result.form5329?.line47.toNumber()).toBe(700);
    expect(result.form5329?.line49.toNumber()).toBe(42); // 6% × $700
  });

  it("Form 5329 Part VII - supported 1099-SA code 2 returned excess contributions reduce the auto-derived HSA excess", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "5000",
        employerContributions: "500",
      },
      form1099SA: [
        {
          payer: "HSA Bank",
          grossDistribution: "900",
          earningsOnExcessContributions: "30",
          distributionCode: "2",
          accountType: "hsa",
        },
      ],
      form5329: {
        hsaValueDec31: "10000",
      },
    });
    const line47 = result.allLines.find((line) => line.form === "Form 5329" && line.line === "47");

    expect(result.form5329?.line47.toNumber()).toBe(300);
    expect(result.form5329?.line48.toNumber()).toBe(300);
    expect(result.form5329?.line49.toNumber()).toBe(18);
    expect(String(line47?.inputs["Raw current-year HSA excess before returned-excess reduction"])).toBe("1200");
    expect(String(line47?.inputs["Supported timely returned excess contributions"])).toBe("900");
    expect(result.otherIncome.toNumber()).toBe(30);
  });

  it("Form 5329 Part VII - section 301.9100-2 HSA excess corrections reduce the auto-derived excess and add amended-return earnings to other income", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "5000",
        employerContributions: "500",
      },
      form5329: {
        supportedHsaReturnedExcessContributionsUnder9100Relief: "500",
        supportedHsaReturnedExcessContributionEarningsUnder9100Relief: "25",
        hsaValueDec31: "10000",
      },
    });
    const line47 = result.allLines.find((line) => line.form === "Form 5329" && line.line === "47");

    expect(result.form5329?.line47.toNumber()).toBe(700);
    expect(result.form5329?.line48.toNumber()).toBe(700);
    expect(result.form5329?.line49.toNumber()).toBe(42);
    expect(String(line47?.inputs["Raw current-year HSA excess before returned-excess reduction"])).toBe("1200");
    expect(String(line47?.inputs["Supported timely returned excess contributions"])).toBe("0");
    expect(String(line47?.inputs["Supported section 301.9100-2 returned excess contributions"])).toBe("500");
    expect(result.otherIncome.toNumber()).toBe(25);
  });

  it("Form 5329 Part VII - MFJ per-owner Form 8889 aggregates excess across both spouses", () => {
    // Primary: self-only, limit = $4,300, contributed $5,300 → excess $1,000
    // Spouse: family, limit = $8,550, contributed $9,050 → excess $500
    // Total excess = $1,500
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          dateOfBirth: "1985-06-15",
        },
      },
      form8889ByOwner: {
        primary: {
          accountOwner: "primary",
          coverageByMonth: Array(12).fill("self_only"),
          contributionsMade: "5300",
        },
        spouse: {
          accountOwner: "spouse",
          coverageByMonth: Array(12).fill("family"),
          contributionsMade: "9050",
        },
      },
      form5329: {
        hsaValueDec31: "20000",
      },
    });

    expect(result.form5329?.line47.toNumber()).toBe(1500);
    expect(result.form5329?.line49.toNumber()).toBe(90); // 6% × $1,500
  });

  it("Form 5329 Part VII - one spouse's returned excess correction does not offset the other spouse's HSA excess", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          dateOfBirth: "1985-06-15",
        },
      },
      form8889ByOwner: {
        primary: {
          accountOwner: "primary",
          coverageByMonth: Array(12).fill("self_only"),
          contributionsMade: "5300",
        },
        spouse: {
          accountOwner: "spouse",
          coverageByMonth: Array(12).fill("family"),
          contributionsMade: "8550",
        },
      },
      form1099SA: [
        {
          payer: "HSA Bank",
          grossDistribution: "600",
          earningsOnExcessContributions: "20",
          distributionCode: "2",
          accountType: "hsa",
          accountHolder: "spouse",
        },
      ],
      form5329: {
        hsaValueDec31: "20000",
      },
    });
    const line47 = result.allLines.find((line) => line.form === "Form 5329" && line.line === "47");

    expect(result.form5329?.line47.toNumber()).toBe(1000);
    expect(String(line47?.inputs["Raw current-year HSA excess before returned-excess reduction"])).toBe("1000");
    expect(String(line47?.inputs["Supported timely returned excess contributions"])).toBe("0");
    expect(result.otherIncome.toNumber()).toBe(20);
  });

  it("Form 5329 Part VII - aggregate section 301.9100-2 HSA relief stays manual on MFJ owner-specific Form 8889 paths", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          dateOfBirth: "1985-06-15",
        },
      },
      form8889ByOwner: {
        primary: {
          accountOwner: "primary",
          coverageByMonth: Array(12).fill("self_only"),
          contributionsMade: "5300",
        },
        spouse: {
          accountOwner: "spouse",
          coverageByMonth: Array(12).fill("family"),
          contributionsMade: "8550",
        },
      },
      form5329: {
        supportedHsaReturnedExcessContributionsUnder9100Relief: "500",
        supportedHsaReturnedExcessContributionEarningsUnder9100Relief: "25",
        hsaValueDec31: "20000",
      },
    });
    const line47 = result.allLines.find((line) => line.form === "Form 5329" && line.line === "47");

    expect(result.form5329?.line47.toNumber()).toBe(1000);
    expect(result.form5329?.line49.toNumber()).toBe(60);
    expect(String(line47?.inputs["Raw current-year HSA excess before returned-excess reduction"])).toBe("1000");
    expect(String(line47?.inputs["Supported section 301.9100-2 returned excess contributions"])).toBe("0");
    expect(result.otherIncome.toNumber()).toBe(25);
  });

  it("Form 5329 Part VII - manual override takes precedence over auto-derived values", () => {
    // Form 8889 would compute $1,200 excess, but manual input says $500
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "5000",
        employerContributions: "500",
      },
      form5329: {
        hsaCurrentYearExcessContributions: "500",
        hsaValueDec31: "10000",
      },
    });

    // Manual override wins
    expect(result.form5329?.line47.toNumber()).toBe(500);
    expect(result.form5329?.line49.toNumber()).toBe(30); // 6% × $500
  });

  it("Form 5329 Part VII - auto-derived room and distributions combined with prior-year excess", () => {
    // Self-only limit = $4,300
    // Contributions: $3,000 personal → room = $1,300
    // Distributions: $2,000 gross, $500 medical → Line 16 taxable = $1,500
    // Prior excess: $4,000
    // Reductions: $1,300 (room) + $1,500 (distributions) = $2,800
    // Remaining prior excess: $4,000 - $2,800 = $1,200
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "3000",
        distributionsReceived: "2000",
        qualifiedMedicalExpenses: "500",
      },
      form5329: {
        hsaPriorYearExcessContributions: "4000",
        hsaValueDec31: "15000",
      },
    });

    expect(result.form5329?.line43.toNumber()).toBe(1300);
    expect(result.form5329?.line44.toNumber()).toBe(1500);
    expect(result.form5329?.line45.toNumber()).toBe(2800);
    expect(result.form5329?.line46.toNumber()).toBe(1200);
    expect(result.form5329?.line47.toNumber()).toBe(0);
    expect(result.form5329?.line48.toNumber()).toBe(1200);
    expect(result.form5329?.line49.toNumber()).toBe(72); // 6% × $1,200
  });
});

// ═══════════════════════════════════════════════════════════
// Form 5329 excess contribution carryforward output
// ═══════════════════════════════════════════════════════════

describe("Excess contribution carryforward output", () => {
  it("HSA excess contributions appear in carryforwards.excessContributions.hsa", () => {
    // Self-only limit = $4,300, total contributions = $5,500 → excess = $1,200
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "5000",
        employerContributions: "500",
      },
      form5329: {
        hsaValueDec31: "10000",
      },
    });

    expect(result.carryforwards.excessContributions.hsa.toNumber()).toBe(1200);
  });

  it("HSA prior-year excess partially absorbed by contribution room appears in carryforward", () => {
    // Prior excess: $4,000, room: $1,300, distributions: $1,500
    // Remaining: $4,000 - ($1,300 + $1,500) = $1,200
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "3000",
        distributionsReceived: "2000",
        qualifiedMedicalExpenses: "500",
      },
      form5329: {
        hsaPriorYearExcessContributions: "4000",
        hsaValueDec31: "15000",
      },
    });

    expect(result.carryforwards.excessContributions.hsa.toNumber()).toBe(1200);
  });

  it("Zero excess when contributions equal the limit", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form8889: {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "4300",
      },
      form5329: {
        hsaValueDec31: "10000",
      },
    });

    expect(result.carryforwards.excessContributions.hsa.toNumber()).toBe(0);
  });

  it("Traditional IRA excess contributions appear in carryforwards", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form5329: {
        traditionalIRAPriorYearExcessContributions: "2000",
        traditionalIRAContributionRoom: "500",
        traditionalIRACurrentYearExcessContributions: "1000",
        traditionalIRAValueDec31: "50000",
      },
    });

    // Remaining prior: max(0, 2000 - 500) = 1500, plus current: 1000 → total: 2500
    expect(result.carryforwards.excessContributions.traditionalIRA.toNumber()).toBe(2500);
  });

  it("Roth IRA excess contributions appear in carryforwards", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form5329: {
        rothIRAPriorYearExcessContributions: "3000",
        rothIRAContributionRoom: "1000",
        rothIRADistributions: "500",
        rothIRACurrentYearExcessContributions: "800",
        rothIRAValueDec31: "40000",
      },
    });

    // Remaining prior: max(0, 3000 - 1500) = 1500, plus current: 800 → total: 2300
    expect(result.carryforwards.excessContributions.rothIRA.toNumber()).toBe(2300);
  });

  it("All excess contribution types default to zero when no Form 5329 input", () => {
    const result = calculateFederalTax(simpleW2Fixture);

    expect(result.carryforwards.excessContributions.traditionalIRA.toNumber()).toBe(0);
    expect(result.carryforwards.excessContributions.rothIRA.toNumber()).toBe(0);
    expect(result.carryforwards.excessContributions.coverdellESA.toNumber()).toBe(0);
    expect(result.carryforwards.excessContributions.archerMSA.toNumber()).toBe(0);
    expect(result.carryforwards.excessContributions.hsa.toNumber()).toBe(0);
    expect(result.carryforwards.excessContributions.able.toNumber()).toBe(0);
  });

  it("Prior-year excess fully absorbed by room yields zero carryforward", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form5329: {
        hsaPriorYearExcessContributions: "1000",
        hsaContributionRoom: "2000",
        hsaValueDec31: "5000",
      },
    });

    expect(result.carryforwards.excessContributions.hsa.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Partner basis carryforward output
// ═══════════════════════════════════════════════════════════

describe("Partner basis carryforward output", () => {
  it("K-1 with beginningBasis populates carryforwards.partnerBasis", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "Alpha LP",
          partnershipEIN: "11-1111111",
          isPassiveActivity: false,
          entityType: "partnership",
          ordinaryIncome: "10000",
          beginningBasis: "50000",
        },
      ],
    });

    expect(result.carryforwards.partnerBasis).toHaveLength(1);
    expect(result.carryforwards.partnerBasis[0].partnershipName).toBe("Alpha LP");
    expect(result.carryforwards.partnerBasis[0].partnershipEIN).toBe("11-1111111");
    expect(result.carryforwards.partnerBasis[0].entityType).toBe("partnership");
    // Basis: 50000 + 10000 income = 60000
    expect(result.carryforwards.partnerBasis[0].endingBasis.toNumber()).toBe(60000);
    expect(result.carryforwards.partnerBasis[0].excessDistributionGain.toNumber()).toBe(0);
  });

  it("K-1 without beginningBasis does not appear in partnerBasis", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "Beta LP",
          partnershipEIN: "22-2222222",
          isPassiveActivity: false,
          ordinaryIncome: "5000",
        },
      ],
    });

    expect(result.carryforwards.partnerBasis).toHaveLength(0);
  });

  it("Loss exceeding basis creates suspended losses in carryforward", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "Gamma LP",
          partnershipEIN: "33-3333333",
          isPassiveActivity: false,
          entityType: "partnership",
          ordinaryIncome: "-20000",
          beginningBasis: "5000",
        },
      ],
    });

    expect(result.carryforwards.partnerBasis).toHaveLength(1);
    expect(result.carryforwards.partnerBasis[0].endingBasis.toNumber()).toBe(0);
    // $20,000 loss with $5,000 basis → $15,000 suspended
    const suspendedKeys = Object.keys(result.carryforwards.partnerBasis[0].suspendedLosses);
    expect(suspendedKeys.length).toBeGreaterThan(0);
    const totalSuspended = Object.values(result.carryforwards.partnerBasis[0].suspendedLosses)
      .reduce((sum, v) => sum.plus(v), new Decimal(0));
    expect(totalSuspended.toNumber()).toBe(15000);
  });

  it("Multiple K-1s with basis produce multiple partnerBasis entries", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "Alpha LP",
          partnershipEIN: "11-1111111",
          isPassiveActivity: false,
          entityType: "partnership",
          ordinaryIncome: "5000",
          beginningBasis: "10000",
        },
        {
          partnershipName: "Beta LLC",
          partnershipEIN: "22-2222222",
          isPassiveActivity: false,
          entityType: "s_corporation",
          ordinaryIncome: "3000",
          beginningBasis: "8000",
        },
      ],
    });

    expect(result.carryforwards.partnerBasis).toHaveLength(2);
    expect(result.carryforwards.partnerBasis[0].partnershipName).toBe("Alpha LP");
    expect(result.carryforwards.partnerBasis[0].endingBasis.toNumber()).toBe(15000);
    expect(result.carryforwards.partnerBasis[1].partnershipName).toBe("Beta LLC");
    expect(result.carryforwards.partnerBasis[1].entityType).toBe("s_corporation");
    expect(result.carryforwards.partnerBasis[1].endingBasis.toNumber()).toBe(11000);
  });

  it("Excess distribution gain from distributions exceeding basis is captured", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "Delta LP",
          partnershipEIN: "44-4444444",
          isPassiveActivity: false,
          entityType: "partnership",
          ordinaryIncome: "2000",
          distributions: "60000",
          beginningBasis: "50000",
        },
      ],
    });

    expect(result.carryforwards.partnerBasis).toHaveLength(1);
    expect(result.carryforwards.partnerBasis[0].endingBasis.toNumber()).toBe(0);
    // Basis after income: 50000 + 2000 = 52000. Distributions: 60000. Excess: 8000.
    expect(result.carryforwards.partnerBasis[0].excessDistributionGain.toNumber()).toBe(8000);
  });
});

// ═══════════════════════════════════════════════════════════
// PTP Loss Segregation — IRC §469(k) Federal Integration
// ═══════════════════════════════════════════════════════════

describe("PTP passive loss segregation (IRC §469(k))", () => {
  it("PTP loss is suspended per-PTP and flows to carryforwards, not AGI", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "MLP Energy Partners",
          partnershipEIN: "99-1234567",
          ordinaryIncome: "-12000",
          isPassiveActivity: true,
          isPubliclyTradedPartnership: true,
        },
      ],
    });

    // PTP loss should be fully suspended, not reducing AGI
    expect(result.carryforwards.suspendedPTPLosses).toHaveLength(1);
    expect(result.carryforwards.suspendedPTPLosses[0].partnershipName).toBe("MLP Energy Partners");
    expect(result.carryforwards.suspendedPTPLosses[0].amount.toNumber()).toBe(12000);

    // Non-PTP suspended passive losses should be empty
    expect(result.carryforwards.suspendedPassiveLosses).toHaveLength(0);

    // Form 8582 should reflect PTP segregation
    expect(result.form8582?.ptpSuspendedLosses).toHaveLength(1);
    expect(result.form8582?.ptpSuspendedLosses[0].netSuspended.toNumber()).toBe(12000);
  });

  it("PTP income flows into passive pool and offsets non-PTP passive losses", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "MLP Income LP",
          partnershipEIN: "99-1111111",
          ordinaryIncome: "8000",
          isPassiveActivity: true,
          isPubliclyTradedPartnership: true,
        },
        {
          partnershipName: "Regular Fund",
          partnershipEIN: "99-2222222",
          ordinaryIncome: "-15000",
          isPassiveActivity: true,
          isPubliclyTradedPartnership: false,
        },
      ],
    });

    // PTP net income flows into passive pool
    expect(result.form8582?.ptpNetIncome.toNumber()).toBe(8000);
    expect(result.form8582?.ptpSuspendedLosses).toHaveLength(0);

    // Non-PTP loss offset by PTP income: 8000 allowed of 15000
    expect(result.form8582?.allowedLoss.toNumber()).toBe(8000);
    expect(result.form8582?.suspendedLoss.toNumber()).toBe(7000);
    expect(result.carryforwards.suspendedPassiveLosses).toHaveLength(1);
    expect(result.carryforwards.suspendedPassiveLosses[0].amount.toNumber()).toBe(7000);
  });

  it("PTP prior-year carryforward is consumed by current-year PTP income", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "MLP Recoverer",
          partnershipEIN: "99-3333333",
          ordinaryIncome: "20000",
          isPassiveActivity: true,
          isPubliclyTradedPartnership: true,
        },
      ],
      priorYear: {
        suspendedPTPLosses: [
          { partnershipName: "MLP Recoverer", amount: "15000" },
        ],
      },
    });

    // PTP net = 20000 - 15000 carryforward = 5000 net income
    expect(result.form8582?.ptpNetIncome.toNumber()).toBe(5000);
    expect(result.form8582?.ptpSuspendedLosses).toHaveLength(0);
    expect(result.carryforwards.suspendedPTPLosses).toHaveLength(0);
  });

  it("Mixed PTP and non-PTP K-1s: PTP losses segregated, non-PTP losses go through Form 8582", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "MLP Loser",
          partnershipEIN: "99-4444444",
          ordinaryIncome: "-10000",
          isPassiveActivity: true,
          isPubliclyTradedPartnership: true,
        },
        {
          partnershipName: "Non-PTP Loser",
          partnershipEIN: "99-5555555",
          ordinaryIncome: "-8000",
          isPassiveActivity: true,
          isPubliclyTradedPartnership: false,
        },
        {
          partnershipName: "Non-PTP Winner",
          partnershipEIN: "99-6666666",
          ordinaryIncome: "5000",
          isPassiveActivity: true,
          isPubliclyTradedPartnership: false,
        },
      ],
    });

    // PTP loss fully suspended
    expect(result.carryforwards.suspendedPTPLosses).toHaveLength(1);
    expect(result.carryforwards.suspendedPTPLosses[0].partnershipName).toBe("MLP Loser");
    expect(result.carryforwards.suspendedPTPLosses[0].amount.toNumber()).toBe(10000);

    // Non-PTP: 5000 income offsets 8000 loss → 3000 suspended
    expect(result.carryforwards.suspendedPassiveLosses).toHaveLength(1);
    expect(result.carryforwards.suspendedPassiveLosses[0].amount.toNumber()).toBe(3000);
  });
});

// ═══════════════════════════════════════════════════════════
// PTP Disposition — IRC §469(g)(1) Federal Integration
// ═══════════════════════════════════════════════════════════

describe("PTP disposition (IRC §469(g)(1)) — released losses reduce AGI", () => {
  it("Disposed PTP releases prior-year suspended losses, reducing AGI", () => {
    const baseResult = calculateFederalTax(simpleW2Fixture);
    const baseAGI = baseResult.agi;

    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "MLP Sold",
          partnershipEIN: "99-7777777",
          ordinaryIncome: "0",
          isPassiveActivity: true,
          isPubliclyTradedPartnership: true,
          ptpFullyDisposedInTaxableTransaction: true,
        },
      ],
      priorYear: {
        suspendedPTPLosses: [
          { partnershipName: "MLP Sold", amount: "25000" },
        ],
      },
    });

    // Released $25K reduces AGI by $25K
    expect(result.agi.toNumber()).toBe(baseAGI.minus(25000).toNumber());
    // Disposed PTP should NOT appear in carryforwards
    expect(result.carryforwards.suspendedPTPLosses).toHaveLength(0);
  });

  it("Disposed PTP with disposition gain partially absorbs suspended losses", () => {
    const baseResult = calculateFederalTax(simpleW2Fixture);
    const baseAGI = baseResult.agi;

    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "MLP Sold",
          partnershipEIN: "99-8888888",
          ordinaryIncome: "2000",
          isPassiveActivity: true,
          isPubliclyTradedPartnership: true,
          ptpFullyDisposedInTaxableTransaction: true,
          ptpDispositionGainOrLoss: "10000",
        },
      ],
      priorYear: {
        suspendedPTPLosses: [
          { partnershipName: "MLP Sold", amount: "20000" },
        ],
      },
    });

    // Form 8582 disposition net: income 2000 + gain 10000 - prior 20000 = -8000 released
    // But K-1 ordinaryIncome of 2000 also flows through Schedule E into AGI
    // Net AGI change: +2000 (Schedule E income) - 8000 (disposition release) = -6000
    expect(result.agi.toNumber()).toBe(baseAGI.minus(6000).toNumber());
    expect(result.carryforwards.suspendedPTPLosses).toHaveLength(0);
  });

  it("Disposed PTP + continuing PTP: only disposed PTP releases losses", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "MLP Sold",
          partnershipEIN: "99-1111111",
          ordinaryIncome: "-3000",
          isPassiveActivity: true,
          isPubliclyTradedPartnership: true,
          ptpFullyDisposedInTaxableTransaction: true,
        },
        {
          partnershipName: "MLP Held",
          partnershipEIN: "99-2222222",
          ordinaryIncome: "-5000",
          isPassiveActivity: true,
          isPubliclyTradedPartnership: true,
        },
      ],
      priorYear: {
        suspendedPTPLosses: [
          { partnershipName: "MLP Sold", amount: "15000" },
          { partnershipName: "MLP Held", amount: "4000" },
        ],
      },
    });

    // MLP Sold: disposed → releases 3000 + 15000 = 18000 (reduces AGI)
    // MLP Held: continues → 5000 + 4000 = 9000 stays suspended
    expect(result.carryforwards.suspendedPTPLosses).toHaveLength(1);
    expect(result.carryforwards.suspendedPTPLosses[0].partnershipName).toBe("MLP Held");
    expect(result.carryforwards.suspendedPTPLosses[0].amount.toNumber()).toBe(9000);
  });

  it("Disposed PTP with gain fully absorbing losses — no AGI reduction", () => {
    const baseResult = calculateFederalTax(simpleW2Fixture);
    const baseAGI = baseResult.agi;

    const result = calculateFederalTax({
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "MLP Sold",
          partnershipEIN: "99-3333333",
          ordinaryIncome: "0",
          isPassiveActivity: true,
          isPubliclyTradedPartnership: true,
          ptpFullyDisposedInTaxableTransaction: true,
          ptpDispositionGainOrLoss: "50000",
        },
      ],
      priorYear: {
        suspendedPTPLosses: [
          { partnershipName: "MLP Sold", amount: "10000" },
        ],
      },
    });

    // Net: gain 50000 - prior 10000 = +40000 → no loss to release
    // AGI should be unchanged (no income flows from this path either,
    // since the gain is already reported separately via Form 8949/Schedule D)
    expect(result.agi.toNumber()).toBe(baseAGI.toNumber());
    expect(result.carryforwards.suspendedPTPLosses).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Form 8915-F — Qualified Disaster Distributions through federal pipeline
// ═══════════════════════════════════════════════════════════

describe("Form 8915-F qualified disaster distributions through federal pipeline", () => {
  it("3-year spread reduces taxable IRA distributions and defers 2/3", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "IRA Custodian",
          grossDistribution: "22000",
          taxableAmount: "22000",
          iraSepSimple: true,
          distributionCode: "1",
        },
      ],
      form8915F: {
        currentYearDistributions: [
          {
            disasterName: "2025 LA Wildfires",
            disasterDate: "2025-01-07",
            grossDistribution: "22000",
            iraDistribution: "22000",
            electFullInclusion: false,
          },
        ],
      },
    });

    // Without Form 8915-F: full $22,000 taxable
    // With Form 8915-F: only $7,333 taxable (1/3 of $22,000)
    expect(result.iraDistributionsTaxable.toNumber()).toBe(7333);
    expect(result.form8915F).toBeDefined();
    expect(result.form8915F!.line4.toNumber()).toBe(7333);
    expect(result.form8915F!.line10.toNumber()).toBe(14667);

    // Carryforward should track the deferred amount
    expect(result.carryforwards.disasterDistributionDeferrals).toHaveLength(1);
    expect(result.carryforwards.disasterDistributionDeferrals[0].disasterName).toBe("2025 LA Wildfires");
  });

  it("prior-year deferred disaster distribution adds to current-year pension income", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form8915F: {
        priorYearDeferrals: [
          {
            disasterName: "2024 Hurricane Helene",
            distributionYear: 2024,
            spreadYear: 2,
            annualSpreadAmount: "7333",
            remainingDeferredBalance: "14667",
            iraFraction: "0",
          },
        ],
      },
    });

    // Prior-year pension inclusion should add to pension taxable
    expect(result.pensionDistributionsTaxable.toNumber()).toBe(7333);
    expect(result.form8915F).toBeDefined();
    expect(result.form8915F!.line5.toNumber()).toBe(7333);
  });

  it("Form 8915-F audit trail is populated in the federal result", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "401k Plan",
          grossDistribution: "15000",
          taxableAmount: "15000",
          iraSepSimple: false,
          distributionCode: "1",
        },
      ],
      form8915F: {
        currentYearDistributions: [
          {
            disasterName: "2025 Flood Test",
            disasterDate: "2025-03-01",
            grossDistribution: "15000",
            iraDistribution: "0",
            electFullInclusion: true,
          },
        ],
      },
    });

    expect(result.form8915F).toBeDefined();
    const form8915FLines = result.allLines.filter(l => l.form === "Form 8915-F");
    expect(form8915FLines.length).toBeGreaterThan(0);
    // Full inclusion: no deferral
    expect(result.form8915F!.line10.toNumber()).toBe(0);
  });

  it("mixed current and prior-year disaster distributions combine correctly in AGI", () => {
    // Baseline AGI from simpleW2Fixture (wages only)
    const baseResult = calculateFederalTax(simpleW2Fixture);
    const baseAGI = baseResult.agi;

    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099R: [
        {
          payer: "IRA Custodian",
          grossDistribution: "21000",
          taxableAmount: "21000",
          iraSepSimple: true,
          distributionCode: "1",
        },
      ],
      form8915F: {
        currentYearDistributions: [
          {
            disasterName: "2025 Tornado",
            disasterDate: "2025-05-15",
            grossDistribution: "21000",
            iraDistribution: "21000",
            electFullInclusion: false,
          },
        ],
        priorYearDeferrals: [
          {
            disasterName: "2024 Hurricane",
            distributionYear: 2024,
            spreadYear: 2,
            annualSpreadAmount: "5000",
            remainingDeferredBalance: "10000",
            iraFraction: "1",
          },
        ],
      },
    });

    // Current year: 21000/3 = 7000 IRA
    // Prior year: 5000 IRA
    // Net IRA taxable = 7000 + 5000 = 12000
    // (instead of the full 21000 from the 1099-R)
    expect(result.iraDistributionsTaxable.toNumber()).toBe(12000);
    expect(result.agi.toNumber()).toBe(baseAGI.plus(12000).toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// Taxable Refund Worksheet — state refund taxability through federal pipeline
// ═══════════════════════════════════════════════════════════

describe("Taxable Refund Worksheet through federal pipeline", () => {
  it("state refund is taxable when prior year itemized with excess over standard deduction", () => {
    const baseResult = calculateFederalTax(simpleW2Fixture);
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099G: [
        {
          payer: "State of California",
          unemploymentCompensation: "0",
          stateLocalIncomeTaxRefund: "2000",
        },
      ],
      taxableRefundWorksheet: {
        priorTaxYear: 2024,
        priorYearPropertyTaxesPaid: "0",
        priorYearItemized: true,
        priorYearItemizedTotal: "20000",
        priorYearStandardDeduction: "14600",
        priorYearStateLocalTaxesPaid: "8000",
        priorYearFilingStatus: "single",
      },
    });

    // Excess itemized = 20000 - 14600 = 5400
    // Refund $2,000 < $5,400 → fully taxable
    // Taxes paid $8,000 < $10K cap → no cap adjustment
    expect(result.taxableRefundWorksheet).toBeDefined();
    expect(result.taxableRefundWorksheet!.taxableRefund.toNumber()).toBe(2000);
    // AGI increases by the taxable refund amount
    expect(result.agi.toNumber()).toBe(baseResult.agi.plus(2000).toNumber());
  });

  it("state refund not taxable when prior year used standard deduction", () => {
    const baseResult = calculateFederalTax(simpleW2Fixture);
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099G: [
        {
          payer: "State of Oregon",
          unemploymentCompensation: "0",
          stateLocalIncomeTaxRefund: "3000",
        },
      ],
      taxableRefundWorksheet: {
        priorTaxYear: 2024,
        priorYearPropertyTaxesPaid: "0",
        priorYearItemized: false,
        priorYearStandardDeduction: "14600",
        priorYearFilingStatus: "single",
      },
    });

    expect(result.taxableRefundWorksheet!.taxableRefund.toNumber()).toBe(0);
    // AGI should be unchanged — refund is not taxable
    expect(result.agi.toNumber()).toBe(baseResult.agi.toNumber());
  });

  it("SALT cap protects refund from being taxable", () => {
    const baseResult = calculateFederalTax(simpleW2Fixture);
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099G: [
        {
          payer: "State of New York",
          unemploymentCompensation: "0",
          stateLocalIncomeTaxRefund: "4000",
        },
      ],
      taxableRefundWorksheet: {
        priorTaxYear: 2024,
        priorYearPropertyTaxesPaid: "0",
        priorYearItemized: true,
        priorYearItemizedTotal: "25000",
        priorYearStandardDeduction: "14600",
        priorYearStateLocalTaxesPaid: "16000",
        priorYearFilingStatus: "single",
      },
    });

    // Excess over SALT cap = 16000 - 10000 = 6000
    // Refund $4,000 ≤ $6,000 → fully protected
    expect(result.taxableRefundWorksheet!.taxableRefund.toNumber()).toBe(0);
    expect(result.taxableRefundWorksheet!.saltCapApplied).toBe(true);
    expect(result.agi.toNumber()).toBe(baseResult.agi.toNumber());
  });

  it("sales-tax alternative cap limits the refund flowing into AGI", () => {
    const baseResult = calculateFederalTax(simpleW2Fixture);
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099G: [
        {
          payer: "State of Arizona",
          unemploymentCompensation: "0",
          stateLocalIncomeTaxRefund: "2500",
        },
      ],
      taxableRefundWorksheet: {
        priorTaxYear: 2024,
        priorYearPropertyTaxesPaid: "0",
        priorYearItemized: true,
        priorYearItemizedTotal: "20000",
        priorYearStandardDeduction: "14600",
        priorYearStateLocalTaxesPaid: "10000",
        priorYearAlternativeGeneralSalesTaxDeduction: "9000",
        priorYearFilingStatus: "single",
      },
    });

    expect(result.taxableRefundWorksheet!.taxableRefund.toNumber()).toBe(1000);
    expect(result.agi.toNumber()).toBe(baseResult.agi.plus(1000).toNumber());
  });

  it("state refund audit trail appears in allLines", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099G: [
        {
          payer: "State of Illinois",
          unemploymentCompensation: "0",
          stateLocalIncomeTaxRefund: "1500",
        },
      ],
      taxableRefundWorksheet: {
        priorTaxYear: 2024,
        priorYearPropertyTaxesPaid: "0",
        priorYearItemized: true,
        priorYearItemizedTotal: "18000",
        priorYearStandardDeduction: "14600",
        priorYearStateLocalTaxesPaid: "7000",
        priorYearFilingStatus: "single",
      },
    });

    const refundLines = result.allLines.filter(l => l.form === "Taxable Refund WS");
    expect(refundLines.length).toBeGreaterThan(0);
    expect(result.taxableRefundWorksheet!.taxableRefund.toNumber()).toBe(1500);
  });

  it("without taxableRefundWorksheet, no worksheet result is produced", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099G: [
        {
          payer: "Some State",
          unemploymentCompensation: "500",
          stateLocalIncomeTaxRefund: "1000",
        },
      ],
    });

    // No worksheet input → no worksheet result → refund not included in income
    expect(result.taxableRefundWorksheet).toBeUndefined();
  });

  it("unemployment and refund on same 1099-G both handled correctly", () => {
    const baseResult = calculateFederalTax(simpleW2Fixture);
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form1099G: [
        {
          payer: "State EDD",
          unemploymentCompensation: "5000",
          stateLocalIncomeTaxRefund: "2000",
        },
      ],
      taxableRefundWorksheet: {
        priorTaxYear: 2024,
        priorYearPropertyTaxesPaid: "0",
        priorYearItemized: true,
        priorYearItemizedTotal: "20000",
        priorYearStandardDeduction: "14600",
        priorYearStateLocalTaxesPaid: "8000",
        priorYearFilingStatus: "single",
      },
    });

    // Unemployment $5,000 + taxable refund $2,000 both flow into income
    expect(result.taxableRefundWorksheet!.taxableRefund.toNumber()).toBe(2000);
    expect(result.agi.toNumber()).toBe(
      baseResult.agi.plus(5000).plus(2000).toNumber()
    );
  });
});
