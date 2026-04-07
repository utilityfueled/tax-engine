/**
 * Tests for Form 5329 early-distribution additional tax.
 * Spec: spec/federal/form-5329.yaml
 */

import { describe, expect, it } from "vitest";
import { calculateForm5329 } from "@/engine/forms/form-5329.js";
import { Form5329Schema } from "@/models/inputs.js";

describe("Form 5329 early-distribution additional tax", () => {
  const standardEarlyDistribution = calculateForm5329({
    earlyDistributionsIncludedInIncome: "12000",
    distributionsNotSubjectToAdditionalTax: "0",
    simpleIRADistributionsWithinFirstTwoYears: "0",
  });

  const cappedExceptionAmount = calculateForm5329({
    earlyDistributionsIncludedInIncome: "5000",
    distributionsNotSubjectToAdditionalTax: "6500",
    simpleIRADistributionsWithinFirstTwoYears: "0",
  });

  const partialExceptionAmount = calculateForm5329({
    earlyDistributionsIncludedInIncome: "8000",
    distributionsNotSubjectToAdditionalTax: "2500",
    simpleIRADistributionsWithinFirstTwoYears: "0",
  });

  const rothConversionRecapture = calculateForm5329({
    earlyDistributionsIncludedInIncome: "2000",
    rothConversionRecaptureAmount: "4000",
    distributionsNotSubjectToAdditionalTax: "0",
    simpleIRADistributionsWithinFirstTwoYears: "0",
  });

  const simpleIraPenalty = calculateForm5329({
    earlyDistributionsIncludedInIncome: "10000",
    distributionsNotSubjectToAdditionalTax: "1500",
    simpleIRADistributionsWithinFirstTwoYears: "4000",
  });

  const simplifiedMethodEarlyAnnuity = calculateForm5329({
    earlyDistributionsIncludedInIncome: "10800",
    distributionsNotSubjectToAdditionalTax: "0",
    simpleIRADistributionsWithinFirstTwoYears: "0",
  });

  const supportedAutomaticExceptions = calculateForm5329({
    earlyDistributionsIncludedInIncome: "10500",
    distributionsNotSubjectToAdditionalTax: "10500",
    simpleIRADistributionsWithinFirstTwoYears: "0",
    supportedReturnedContributionByDueDateTaxableEarnings: "500",
    supportedQualifiedFirstTimeHomebuyerDistribution: "10000",
  });

  it("Form 5329 Line 1 - early distributions included in income populate the penalty base before exceptions", () => {
    expect(standardEarlyDistribution.line1.toNumber()).toBe(12000);
  });

  it("Form 5329 Line 1 - Roth conversion recapture amounts are added to early distributions included in income", () => {
    expect(rothConversionRecapture.line1.toNumber()).toBe(6000);
  });

  it("Form 5329 Line 1 - supported qualified disaster recovery amounts are excluded from the penalty base", () => {
    const disasterDistributionResult = calculateForm5329({
      earlyDistributionsIncludedInIncome: "12000",
      supportedQualifiedDisasterRecoveryDistributionsIncludedInIncome: "4000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
    });

    expect(disasterDistributionResult.line1.toNumber()).toBe(8000);
    expect(disasterDistributionResult.line4.toNumber()).toBe(800);

    const line1 = disasterDistributionResult.lines.find((line) => line.line === "1");
    expect(String(line1?.inputs["Supported qualified disaster recovery distributions excluded from Line 1"])).toBe("4000");
  });

  it("Form 5329 Line 1 - supported eligible governmental 457(b) amounts not attributable to a qualified-plan transfer stay off the penalty base", () => {
    const governmental457bResult = calculateForm5329({
      earlyDistributionsIncludedInIncome: "12000",
      supportedEligibleGovernmental457bDistributionsExcludedFromLine1: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
    });

    expect(governmental457bResult.line1.toNumber()).toBe(3000);
    expect(governmental457bResult.line4.toNumber()).toBe(300);

    const line1 = governmental457bResult.lines.find((line) => line.line === "1");
    expect(String(line1?.inputs["Supported eligible governmental section 457(b) distributions excluded from Line 1"])).toBe("9000");
  });

  it("Form 5329 Line 2 - exception amount is limited to the early distributions included in income", () => {
    expect(cappedExceptionAmount.line2.toNumber()).toBe(5000);
  });

  it("Form 5329 Line 3 - only the non-exempt portion remains subject to additional tax", () => {
    expect(partialExceptionAmount.line3.toNumber()).toBe(5500);
  });

  it("Form 5329 Line 4 - SIMPLE IRA first-two-year distributions use the 25 percent rate", () => {
    expect(simpleIraPenalty.line3.toNumber()).toBe(8500);
    expect(simpleIraPenalty.line4.toNumber()).toBe(1450);

    const line4 = simpleIraPenalty.lines.find((line) => line.line === "4");
    expect(line4?.value.toNumber()).toBe(1450);
    expect(String(line4?.inputs["SIMPLE IRA amount taxed at 25%"])).toBe("4000");
  });

  it("Form 5329 Lines 1 and 4 - taxable early annuity amounts can be reduced before the penalty is computed", () => {
    expect(simplifiedMethodEarlyAnnuity.line1.toNumber()).toBe(10800);
    expect(simplifiedMethodEarlyAnnuity.line4.toNumber()).toBe(1080);
  });

  it("Form 5329 Lines 1 and 2 - audit trail preserves supported automatic exception subtotals", () => {
    const line1 = supportedAutomaticExceptions.lines.find((line) => line.line === "1");
    const line2 = supportedAutomaticExceptions.lines.find((line) => line.line === "2");

    expect(supportedAutomaticExceptions.line1.toNumber()).toBe(10500);
    expect(supportedAutomaticExceptions.line2.toNumber()).toBe(10500);
    expect(supportedAutomaticExceptions.line4.toNumber()).toBe(0);
    expect(String(line1?.inputs["Supported returned-contribution taxable earnings (exception 21)"])).toBe("500");
    expect(String(line1?.inputs["Supported Roth first-time homebuyer amount (exception 09)"])).toBe("10000");
    expect(String(line2?.inputs["Supported returned-contribution taxable earnings (exception 21)"])).toBe("500");
    expect(String(line2?.inputs["Supported Roth first-time homebuyer amount (exception 09)"])).toBe("10000");
  });

  it("Form 5329 Line 2 - validated due-date return taxable earnings default to exception number 21 and suppress the supported attached subtotal", () => {
    const returnedContributionException = calculateForm5329(
      Form5329Schema.parse({
        earlyDistributionsIncludedInIncome: "9000",
        distributionsNotSubjectToAdditionalTax: "0",
        simpleIRADistributionsWithinFirstTwoYears: "0",
        returnedContributionByDueDateTaxableEarningsExceptionAmount: "1800",
        supportedReturnedContributionByDueDateTaxableEarnings: "500",
      })
    );

    expect(returnedContributionException.line1.toNumber()).toBe(9000);
    expect(returnedContributionException.line2.toNumber()).toBe(1800);
    expect(returnedContributionException.line2ExceptionNumber).toBe("21");
    expect(returnedContributionException.line3.toNumber()).toBe(7200);
    expect(returnedContributionException.line4.toNumber()).toBe(720);

    const line1 = returnedContributionException.lines.find((line) => line.line === "1");
    const line2 = returnedContributionException.lines.find((line) => line.line === "2");
    expect(
      String(line1?.inputs["Validated due-date return taxable earnings exception amount (exception 21)"])
    ).toBe("1800");
    expect(String(line1?.inputs["Supported returned-contribution taxable earnings (exception 21)"])).toBe("0");
    expect(
      String(line2?.inputs["Validated due-date return taxable earnings exception amount (exception 21)"])
    ).toBe("1800");
    expect(String(line2?.inputs["Supported returned-contribution taxable earnings (exception 21)"])).toBe("0");
    expect(line2?.inputs["Line 2 exception number"]).toBe("21");
  });

  it("Form 5329 Line 2 - supported disability distributions default to exception number 03", () => {
    const disabilityException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      supportedDisabilityDistributionAmount: "9000",
    });

    expect(disabilityException.line1.toNumber()).toBe(9000);
    expect(disabilityException.line2.toNumber()).toBe(9000);
    expect(disabilityException.line2ExceptionNumber).toBe("03");
    expect(disabilityException.line3.toNumber()).toBe(0);
    expect(disabilityException.line4.toNumber()).toBe(0);

    const line1 = disabilityException.lines.find((line) => line.line === "1");
    const line2 = disabilityException.lines.find((line) => line.line === "2");
    expect(String(line1?.inputs["Supported disability distributions (exception 03)"])).toBe("9000");
    expect(String(line2?.inputs["Supported disability distributions (exception 03)"])).toBe("9000");
    expect(line2?.inputs["Line 2 exception number"]).toBe("03");
  });

  it("Form 5329 Line 2 - validated death distributions default to exception number 04", () => {
    const deathException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      deathDistributionExceptionAmount: "5000",
    });

    expect(deathException.line1.toNumber()).toBe(9000);
    expect(deathException.line2.toNumber()).toBe(5000);
    expect(deathException.line2ExceptionNumber).toBe("04");
    expect(deathException.line3.toNumber()).toBe(4000);
    expect(deathException.line4.toNumber()).toBe(400);

    const line2 = deathException.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Validated death-distribution exception amount (exception 04)"])).toBe("5000");
    expect(line2?.inputs["Line 2 exception number"]).toBe("04");
  });

  it("Form 5329 Line 2 - supported death distributions default to exception number 04", () => {
    const deathException = calculateForm5329(
      Form5329Schema.parse({
        earlyDistributionsIncludedInIncome: "9000",
        distributionsNotSubjectToAdditionalTax: "0",
        simpleIRADistributionsWithinFirstTwoYears: "0",
        supportedDeathDistributionAmount: "5000",
      })
    );

    expect(deathException.line1.toNumber()).toBe(9000);
    expect(deathException.line2.toNumber()).toBe(5000);
    expect(deathException.line2ExceptionNumber).toBe("04");
    expect(deathException.line3.toNumber()).toBe(4000);
    expect(deathException.line4.toNumber()).toBe(400);

    const line1 = deathException.lines.find((line) => line.line === "1");
    const line2 = deathException.lines.find((line) => line.line === "2");
    expect(String(line1?.inputs["Supported death distributions (exception 04)"])).toBe("5000");
    expect(String(line2?.inputs["Supported death distributions (exception 04)"])).toBe("5000");
    expect(line2?.inputs["Line 2 exception number"]).toBe("04");
  });

  it("Form 5329 Line 2 - a direct death-distribution amount suppresses the supported death default in the same payload", () => {
    const deathException = calculateForm5329(
      Form5329Schema.parse({
        earlyDistributionsIncludedInIncome: "9000",
        distributionsNotSubjectToAdditionalTax: "0",
        simpleIRADistributionsWithinFirstTwoYears: "0",
        deathDistributionExceptionAmount: "2500",
        supportedDeathDistributionAmount: "5000",
      })
    );

    expect(deathException.line1.toNumber()).toBe(9000);
    expect(deathException.line2.toNumber()).toBe(2500);
    expect(deathException.line2ExceptionNumber).toBe("04");
    expect(deathException.line3.toNumber()).toBe(6500);
    expect(deathException.line4.toNumber()).toBe(650);

    const line2 = deathException.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Validated death-distribution exception amount (exception 04)"])).toBe("2500");
    expect(String(line2?.inputs["Supported death distributions (exception 04)"])).toBe("0");
    expect(line2?.inputs["Line 2 exception number"]).toBe("04");
  });

  it("Form 5329 Line 2 - validated substantially equal periodic payments default to exception number 02", () => {
    const substantiallyEqualPeriodicPaymentsException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      substantiallyEqualPeriodicPaymentsExceptionAmount: "4200",
    });

    expect(substantiallyEqualPeriodicPaymentsException.line1.toNumber()).toBe(9000);
    expect(substantiallyEqualPeriodicPaymentsException.line2.toNumber()).toBe(4200);
    expect(substantiallyEqualPeriodicPaymentsException.line2ExceptionNumber).toBe("02");
    expect(substantiallyEqualPeriodicPaymentsException.line3.toNumber()).toBe(4800);
    expect(substantiallyEqualPeriodicPaymentsException.line4.toNumber()).toBe(480);

    const line2 = substantiallyEqualPeriodicPaymentsException.lines.find((line) => line.line === "2");
    expect(
      String(line2?.inputs["Validated substantially equal periodic payments exception amount (exception 02)"])
    ).toBe("4200");
    expect(line2?.inputs["Line 2 exception number"]).toBe("02");
  });

  it("Form 5329 Line 2 - validated unemployment health insurance premiums default to exception number 07", () => {
    const unemploymentHealthInsuranceException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      unemployedHealthInsurancePremiumExceptionAmount: "4000",
    });

    expect(unemploymentHealthInsuranceException.line1.toNumber()).toBe(9000);
    expect(unemploymentHealthInsuranceException.line2.toNumber()).toBe(4000);
    expect(unemploymentHealthInsuranceException.line2ExceptionNumber).toBe("07");
    expect(unemploymentHealthInsuranceException.line3.toNumber()).toBe(5000);
    expect(unemploymentHealthInsuranceException.line4.toNumber()).toBe(500);

    const line2 = unemploymentHealthInsuranceException.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Validated unemployment health insurance premium exception amount (exception 07)"])).toBe("4000");
    expect(line2?.inputs["Line 2 exception number"]).toBe("07");
  });

  it("Form 5329 Line 2 - validated deductible medical expenses default to exception number 05", () => {
    const medicalExpenseException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      medicalExpenseExceptionAmount: "3500",
    });

    expect(medicalExpenseException.line1.toNumber()).toBe(9000);
    expect(medicalExpenseException.line2.toNumber()).toBe(3500);
    expect(medicalExpenseException.line2ExceptionNumber).toBe("05");
    expect(medicalExpenseException.line3.toNumber()).toBe(5500);
    expect(medicalExpenseException.line4.toNumber()).toBe(550);

    const line2 = medicalExpenseException.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Validated medical expense exception amount (exception 05)"])).toBe("3500");
    expect(line2?.inputs["Line 2 exception number"]).toBe("05");
  });

  it("Form 5329 Line 2 - supported deductible medical expenses default to exception number 05", () => {
    const supportedMedicalExpenseException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      supportedMedicalExpenseExceptionAmount: "2500",
    });

    expect(supportedMedicalExpenseException.line1.toNumber()).toBe(9000);
    expect(supportedMedicalExpenseException.line2.toNumber()).toBe(2500);
    expect(supportedMedicalExpenseException.line2ExceptionNumber).toBe("05");
    expect(supportedMedicalExpenseException.line3.toNumber()).toBe(6500);
    expect(supportedMedicalExpenseException.line4.toNumber()).toBe(650);

    const line2 = supportedMedicalExpenseException.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Supported medical expense exception amount (exception 05)"])).toBe("2500");
    expect(line2?.inputs["Line 2 exception number"]).toBe("05");
  });

  it("Form 5329 Line 2 - validated IRA higher education expenses default to exception number 08", () => {
    const higherEducationException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      qualifiedHigherEducationExpenseExceptionAmount: "2500",
    });

    expect(higherEducationException.line1.toNumber()).toBe(9000);
    expect(higherEducationException.line2.toNumber()).toBe(2500);
    expect(higherEducationException.line2ExceptionNumber).toBe("08");
    expect(higherEducationException.line3.toNumber()).toBe(6500);
    expect(higherEducationException.line4.toNumber()).toBe(650);

    const line2 = higherEducationException.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Validated higher education expense exception amount (exception 08)"])).toBe("2500");
    expect(line2?.inputs["Line 2 exception number"]).toBe("08");
  });

  it("Form 5329 Line 2 - validated qualified reservist distributions default to exception number 11", () => {
    const qualifiedReservistException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      qualifiedReservistDistributionExceptionAmount: "3600",
    });

    expect(qualifiedReservistException.line1.toNumber()).toBe(9000);
    expect(qualifiedReservistException.line2.toNumber()).toBe(3600);
    expect(qualifiedReservistException.line2ExceptionNumber).toBe("11");
    expect(qualifiedReservistException.line3.toNumber()).toBe(5400);
    expect(qualifiedReservistException.line4.toNumber()).toBe(540);

    const line2 = qualifiedReservistException.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Validated qualified reservist distribution exception amount (exception 11)"])).toBe("3600");
    expect(line2?.inputs["Line 2 exception number"]).toBe("11");
  });

  it("Form 5329 Line 2 - validated eligible governmental 457(b) distributions default to exception number 13", () => {
    const governmental457bException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      eligibleGovernmental457bDistributionExceptionAmount: "3200",
    });

    expect(governmental457bException.line1.toNumber()).toBe(9000);
    expect(governmental457bException.line2.toNumber()).toBe(3200);
    expect(governmental457bException.line2ExceptionNumber).toBe("13");
    expect(governmental457bException.line3.toNumber()).toBe(5800);
    expect(governmental457bException.line4.toNumber()).toBe(580);

    const line2 = governmental457bException.lines.find((line) => line.line === "2");
    expect(
      String(line2?.inputs["Validated eligible governmental section 457(b) distribution exception amount (exception 13)"])
    ).toBe("3200");
    expect(line2?.inputs["Line 2 exception number"]).toBe("13");
  });

  it("Form 5329 Line 2 - validated IRS levy distributions default to exception number 10", () => {
    const irsLevyException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      irsLevyDistributionExceptionAmount: "3800",
    });

    expect(irsLevyException.line1.toNumber()).toBe(9000);
    expect(irsLevyException.line2.toNumber()).toBe(3800);
    expect(irsLevyException.line2ExceptionNumber).toBe("10");
    expect(irsLevyException.line3.toNumber()).toBe(5200);
    expect(irsLevyException.line4.toNumber()).toBe(520);

    const line2 = irsLevyException.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Validated IRS levy distribution exception amount (exception 10)"])).toBe("3800");
    expect(line2?.inputs["Line 2 exception number"]).toBe("10");
  });

  it("Form 5329 Line 2 - validated certain employer-plan pre-March 1, 1986 pay-status distributions default to exception number 14", () => {
    const parsed = Form5329Schema.safeParse({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      pre1986EmployerPlanDistributionExceptionAmount: "1700",
    });

    expect(parsed.success).toBe(true);

    const pre1986EmployerPlanException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      pre1986EmployerPlanDistributionExceptionAmount: "1700",
    });

    expect(pre1986EmployerPlanException.line1.toNumber()).toBe(9000);
    expect(pre1986EmployerPlanException.line2.toNumber()).toBe(1700);
    expect(pre1986EmployerPlanException.line2ExceptionNumber).toBe("14");
    expect(pre1986EmployerPlanException.line3.toNumber()).toBe(7300);
    expect(pre1986EmployerPlanException.line4.toNumber()).toBe(730);

    const line2 = pre1986EmployerPlanException.lines.find((line) => line.line === "2");
    expect(
      String(
        line2?.inputs["Validated pre-March-1-1986 employer-plan pay-status distribution exception amount (exception 14)"]
      )
    ).toBe("1700");
    expect(line2?.inputs["Line 2 exception number"]).toBe("14");
  });

  it("Form 5329 Line 2 - validated section 404(k) dividend distributions default to exception number 15", () => {
    const parsed = Form5329Schema.safeParse({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      distributionExceptionNumber: "15",
      section404kDividendDistributionExceptionAmount: "2100",
    });

    expect(parsed.success).toBe(true);

    const section404kDividendException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      section404kDividendDistributionExceptionAmount: "2100",
    });

    expect(section404kDividendException.line1.toNumber()).toBe(9000);
    expect(section404kDividendException.line2.toNumber()).toBe(2100);
    expect(section404kDividendException.line2ExceptionNumber).toBe("15");
    expect(section404kDividendException.line3.toNumber()).toBe(6900);
    expect(section404kDividendException.line4.toNumber()).toBe(690);

    const line2 = section404kDividendException.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Validated section 404(k) dividend distribution exception amount (exception 15)"])).toBe("2100");
    expect(line2?.inputs["Line 2 exception number"]).toBe("15");
  });

  it("Form 5329 Line 2 - validated section 72(q) annuity distributions default to exception number 16", () => {
    const parsed = Form5329Schema.safeParse({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      distributionExceptionNumber: "16",
      section72qAnnuityExceptionAmount: "1800",
    });

    expect(parsed.success).toBe(true);

    const section72qAnnuityException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      section72qAnnuityExceptionAmount: "1800",
    });

    expect(section72qAnnuityException.line1.toNumber()).toBe(9000);
    expect(section72qAnnuityException.line2.toNumber()).toBe(1800);
    expect(section72qAnnuityException.line2ExceptionNumber).toBe("16");
    expect(section72qAnnuityException.line3.toNumber()).toBe(7200);
    expect(section72qAnnuityException.line4.toNumber()).toBe(720);

    const line2 = section72qAnnuityException.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Validated section 72(q) annuity exception amount (exception 16)"])).toBe("1800");
    expect(line2?.inputs["Line 2 exception number"]).toBe("16");
  });

  it("Form 5329 Line 2 - validated federal phased retirement annuity distributions default to exception number 17", () => {
    const parsed = Form5329Schema.safeParse({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      distributionExceptionNumber: "17",
      federalPhasedRetirementAnnuityExceptionAmount: "2600",
    });

    expect(parsed.success).toBe(true);

    const federalPhasedRetirementAnnuityException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      federalPhasedRetirementAnnuityExceptionAmount: "2600",
    });

    expect(federalPhasedRetirementAnnuityException.line1.toNumber()).toBe(9000);
    expect(federalPhasedRetirementAnnuityException.line2.toNumber()).toBe(2600);
    expect(federalPhasedRetirementAnnuityException.line2ExceptionNumber).toBe("17");
    expect(federalPhasedRetirementAnnuityException.line3.toNumber()).toBe(6400);
    expect(federalPhasedRetirementAnnuityException.line4.toNumber()).toBe(640);

    const line2 = federalPhasedRetirementAnnuityException.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Validated federal phased retirement annuity exception amount (exception 17)"])).toBe("2600");
    expect(line2?.inputs["Line 2 exception number"]).toBe("17");
  });

  it("Form 5329 Line 2 - validated permissible EACA withdrawals default to exception number 18", () => {
    const parsed = Form5329Schema.safeParse({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      distributionExceptionNumber: "18",
      permissibleEacaWithdrawalExceptionAmount: "1400",
    });

    expect(parsed.success).toBe(true);

    const permissibleEacaWithdrawalException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      permissibleEacaWithdrawalExceptionAmount: "1400",
    });

    expect(permissibleEacaWithdrawalException.line1.toNumber()).toBe(9000);
    expect(permissibleEacaWithdrawalException.line2.toNumber()).toBe(1400);
    expect(permissibleEacaWithdrawalException.line2ExceptionNumber).toBe("18");
    expect(permissibleEacaWithdrawalException.line3.toNumber()).toBe(7600);
    expect(permissibleEacaWithdrawalException.line4.toNumber()).toBe(760);

    const line2 = permissibleEacaWithdrawalException.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Validated permissible EACA withdrawal exception amount (exception 18)"])).toBe("1400");
    expect(line2?.inputs["Line 2 exception number"]).toBe("18");
  });

  it("Form 5329 Line 2 - validated terminal-illness distributions default to exception number 20", () => {
    const terminalIllnessException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      terminalIllnessExceptionAmount: "4100",
    });

    expect(terminalIllnessException.line1.toNumber()).toBe(9000);
    expect(terminalIllnessException.line2.toNumber()).toBe(4100);
    expect(terminalIllnessException.line2ExceptionNumber).toBe("20");
    expect(terminalIllnessException.line3.toNumber()).toBe(4900);
    expect(terminalIllnessException.line4.toNumber()).toBe(490);

    const line2 = terminalIllnessException.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Validated terminal-illness distribution exception amount (exception 20)"])).toBe("4100");
    expect(line2?.inputs["Line 2 exception number"]).toBe("20");
  });

  it("Form 5329 Line 2 - supported terminal-illness qualified-plan distributions default to exception number 20", () => {
    const terminalIllnessException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      supportedTerminalIllnessDistributionAmount: "4100",
    });

    expect(terminalIllnessException.line1.toNumber()).toBe(9000);
    expect(terminalIllnessException.line2.toNumber()).toBe(4100);
    expect(terminalIllnessException.line2ExceptionNumber).toBe("20");
    expect(terminalIllnessException.line3.toNumber()).toBe(4900);
    expect(terminalIllnessException.line4.toNumber()).toBe(490);

    const line2 = terminalIllnessException.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Supported terminal-illness qualified-plan distributions (exception 20)"])).toBe("4100");
    expect(line2?.inputs["Line 2 exception number"]).toBe("20");
  });

  it("Form 5329 Line 2 - a direct terminal-illness amount suppresses the supported terminal-illness default in the same payload", () => {
    const terminalIllnessException = calculateForm5329(
      Form5329Schema.parse({
        earlyDistributionsIncludedInIncome: "9000",
        distributionsNotSubjectToAdditionalTax: "0",
        simpleIRADistributionsWithinFirstTwoYears: "0",
        terminalIllnessExceptionAmount: "2500",
        supportedTerminalIllnessDistributionAmount: "5000",
      })
    );

    expect(terminalIllnessException.line1.toNumber()).toBe(9000);
    expect(terminalIllnessException.line2.toNumber()).toBe(2500);
    expect(terminalIllnessException.line2ExceptionNumber).toBe("20");
    expect(terminalIllnessException.line3.toNumber()).toBe(6500);
    expect(terminalIllnessException.line4.toNumber()).toBe(650);

    const line2 = terminalIllnessException.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Validated terminal-illness distribution exception amount (exception 20)"])).toBe("2500");
    expect(String(line2?.inputs["Supported terminal-illness qualified-plan distributions (exception 20)"])).toBe("0");
    expect(line2?.inputs["Line 2 exception number"]).toBe("20");
  });

  it("Form 5329 Line 2 - 2025 schema rejects unsupported exception number 24", () => {
    const parsed = Form5329Schema.safeParse({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      distributionExceptionNumber: "24",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => issue.path.join(".") === "distributionExceptionNumber")).toBe(true);
  });

  it("Form 5329 Line 2 - validated birth-or-adoption, domestic-abuse, and emergency-expense amounts combine into the supported exception subtotal", () => {
    const structuredRepaymentCategoryExceptions = calculateForm5329({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      qualifiedBirthOrAdoptionExceptionAmount: "1200",
      domesticAbuseExceptionAmount: "900",
      emergencyPersonalExpenseExceptionAmount: "700",
    });

    expect(structuredRepaymentCategoryExceptions.line1.toNumber()).toBe(9000);
    expect(structuredRepaymentCategoryExceptions.line2.toNumber()).toBe(2800);
    expect(structuredRepaymentCategoryExceptions.line2ExceptionNumber).toBe("99");
    expect(structuredRepaymentCategoryExceptions.line3.toNumber()).toBe(6200);
    expect(structuredRepaymentCategoryExceptions.line4.toNumber()).toBe(620);

    const line2 = structuredRepaymentCategoryExceptions.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Validated qualified birth or adoption distribution exception amount (exception 19)"])).toBe("1200");
    expect(String(line2?.inputs["Validated domestic-abuse victim distribution exception amount (exception 22)"])).toBe("900");
    expect(String(line2?.inputs["Validated emergency personal expense distribution exception amount (exception 23)"])).toBe("700");
    expect(line2?.inputs["Line 2 exception number"]).toBe("99");
  });

  it("Form 5329 Line 2 - 2025 domestic-abuse and emergency-expense amounts are capped at their statutory ceilings", () => {
    const cappedStructuredRepaymentCategoryExceptions = calculateForm5329({
      earlyDistributionsIncludedInIncome: "20000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      domesticAbuseExceptionAmount: "15000",
      emergencyPersonalExpenseExceptionAmount: "5000",
    });

    expect(cappedStructuredRepaymentCategoryExceptions.line1.toNumber()).toBe(20000);
    expect(cappedStructuredRepaymentCategoryExceptions.line2.toNumber()).toBe(11300);
    expect(cappedStructuredRepaymentCategoryExceptions.line2ExceptionNumber).toBe("99");
    expect(cappedStructuredRepaymentCategoryExceptions.line3.toNumber()).toBe(8700);
    expect(cappedStructuredRepaymentCategoryExceptions.line4.toNumber()).toBe(870);

    const line2 = cappedStructuredRepaymentCategoryExceptions.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Validated domestic-abuse victim distribution exception amount (exception 22)"])).toBe(
      "10300"
    );
    expect(
      String(line2?.inputs["Validated emergency personal expense distribution exception amount (exception 23)"])
    ).toBe("1000");
    expect(line2?.inputs["Line 2 exception number"]).toBe("99");
  });

  it("Form 5329 Line 2 - a direct manual exception 23 amount is capped at $1,000 for 2025", () => {
    const cappedManualEmergencyPersonalExpenseException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "5000",
      distributionExceptionNumber: "23",
      simpleIRADistributionsWithinFirstTwoYears: "0",
    });

    expect(cappedManualEmergencyPersonalExpenseException.line1.toNumber()).toBe(9000);
    expect(cappedManualEmergencyPersonalExpenseException.line2.toNumber()).toBe(1000);
    expect(cappedManualEmergencyPersonalExpenseException.line2ExceptionNumber).toBe("23");
    expect(cappedManualEmergencyPersonalExpenseException.line3.toNumber()).toBe(8000);
    expect(cappedManualEmergencyPersonalExpenseException.line4.toNumber()).toBe(800);

    const line2 = cappedManualEmergencyPersonalExpenseException.lines.find((line) => line.line === "2");
    expect(line2?.inputs["Line 2 exception number"]).toBe("23");
  });

  it("Form 5329 Line 2 - supported separation-from-service qualified-plan distributions default to exception number 01", () => {
    const separationFromServiceException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      supportedSeparationFromServiceAfterAge55Amount: "9000",
    });

    expect(separationFromServiceException.line1.toNumber()).toBe(9000);
    expect(separationFromServiceException.line2.toNumber()).toBe(9000);
    expect(separationFromServiceException.line2ExceptionNumber).toBe("01");
    expect(separationFromServiceException.line3.toNumber()).toBe(0);
    expect(separationFromServiceException.line4.toNumber()).toBe(0);

    const line1 = separationFromServiceException.lines.find((line) => line.line === "1");
    const line2 = separationFromServiceException.lines.find((line) => line.line === "2");
    expect(
      String(line1?.inputs["Supported separation-from-service qualified-plan distributions (exception 01)"])
    ).toBe("9000");
    expect(
      String(line2?.inputs["Supported separation-from-service qualified-plan distributions (exception 01)"])
    ).toBe("9000");
    expect(line2?.inputs["Line 2 exception number"]).toBe("01");
  });

  it("Form 5329 Line 2 - validated QDRO qualified-plan distributions default to exception number 06", () => {
    const qdroException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      qualifiedDomesticRelationsOrderDistributionAmount: "4200",
    });

    expect(qdroException.line1.toNumber()).toBe(9000);
    expect(qdroException.line2.toNumber()).toBe(4200);
    expect(qdroException.line2ExceptionNumber).toBe("06");
    expect(qdroException.line3.toNumber()).toBe(4800);
    expect(qdroException.line4.toNumber()).toBe(480);

    const line2 = qdroException.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Validated QDRO alternate-payee distributions (exception 06)"])).toBe("4200");
    expect(line2?.inputs["Line 2 exception number"]).toBe("06");
  });

  it("Form 5329 Line 2 - supported age-59 1/2 misclassification amounts default to exception number 12", () => {
    const age59AndHalfException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "9000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      supportedIncorrectEarlyDistributionAge59AndHalfAmount: "9000",
    });

    expect(age59AndHalfException.line1.toNumber()).toBe(9000);
    expect(age59AndHalfException.line2.toNumber()).toBe(9000);
    expect(age59AndHalfException.line2ExceptionNumber).toBe("12");
    expect(age59AndHalfException.line3.toNumber()).toBe(0);
    expect(age59AndHalfException.line4.toNumber()).toBe(0);

    const line2 = age59AndHalfException.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Supported age-59 1/2-or-older misclassified code 1/J/S distributions (exception 12)"])).toBe("9000");
    expect(line2?.inputs["Line 2 exception number"]).toBe("12");
  });

  it("Form 5329 Line 2 - supported exception subtotals combine with additional manual exception amounts without double counting", () => {
    const automaticPlusManualExceptions = calculateForm5329({
      earlyDistributionsIncludedInIncome: "12000",
      distributionsNotSubjectToAdditionalTax: "500",
      distributionExceptionNumber: "12",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      supportedReturnedContributionByDueDateTaxableEarnings: "500",
      supportedQualifiedFirstTimeHomebuyerDistribution: "10000",
    });

    expect(automaticPlusManualExceptions.line1.toNumber()).toBe(12000);
    expect(automaticPlusManualExceptions.line2.toNumber()).toBe(11000);
    expect(automaticPlusManualExceptions.line3.toNumber()).toBe(1000);
    expect(automaticPlusManualExceptions.line4.toNumber()).toBe(100);

    const line2 = automaticPlusManualExceptions.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Supported returned-contribution taxable earnings (exception 21)"])).toBe("500");
    expect(String(line2?.inputs["Supported Roth first-time homebuyer amount (exception 09)"])).toBe("10000");
  });

  it("Form 5329 Line 2 - supported and manual exception numbers collapse to the correct entered code", () => {
    const automaticPlusManualExceptions = calculateForm5329({
      earlyDistributionsIncludedInIncome: "12000",
      distributionsNotSubjectToAdditionalTax: "500",
      distributionExceptionNumber: "12",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      supportedReturnedContributionByDueDateTaxableEarnings: "500",
      supportedQualifiedFirstTimeHomebuyerDistribution: "10000",
    });

    const homebuyerOnlyExceptionNumber = calculateForm5329({
      earlyDistributionsIncludedInIncome: "10000",
      distributionsNotSubjectToAdditionalTax: "10000",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      supportedQualifiedFirstTimeHomebuyerDistribution: "10000",
    });
    expect(homebuyerOnlyExceptionNumber.line2ExceptionNumber).toBe("09");

    const directPlusSupportedHomebuyerExceptionNumber = calculateForm5329({
      earlyDistributionsIncludedInIncome: "10000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      qualifiedFirstTimeHomebuyerDistributionAmount: "2500",
      supportedQualifiedFirstTimeHomebuyerDistribution: "2500",
    });
    expect(directPlusSupportedHomebuyerExceptionNumber.line2.toNumber()).toBe(5000);
    expect(directPlusSupportedHomebuyerExceptionNumber.line2ExceptionNumber).toBe("09");

    const returnedContributionOnlyExceptionNumber = calculateForm5329({
      earlyDistributionsIncludedInIncome: "500",
      distributionsNotSubjectToAdditionalTax: "500",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      supportedReturnedContributionByDueDateTaxableEarnings: "500",
    });
    expect(returnedContributionOnlyExceptionNumber.line2ExceptionNumber).toBe("21");

    const medicalPlusEducationExceptionNumber = calculateForm5329({
      earlyDistributionsIncludedInIncome: "7000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      medicalExpenseExceptionAmount: "2500",
      qualifiedHigherEducationExpenseExceptionAmount: "1500",
    });
    expect(medicalPlusEducationExceptionNumber.line2ExceptionNumber).toBe("99");

    const periodicPaymentsPlusHomebuyerExceptionNumber = calculateForm5329({
      earlyDistributionsIncludedInIncome: "7000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      substantiallyEqualPeriodicPaymentsExceptionAmount: "2500",
      supportedQualifiedFirstTimeHomebuyerDistribution: "1500",
    });
    expect(periodicPaymentsPlusHomebuyerExceptionNumber.line2ExceptionNumber).toBe("99");

    expect(supportedAutomaticExceptions.line2ExceptionNumber).toBe("99");
    expect(automaticPlusManualExceptions.line2ExceptionNumber).toBe("99");

    const line2 = automaticPlusManualExceptions.lines.find((line) => line.line === "2");
    expect(line2?.inputs["Line 2 exception number"]).toBe("99");
  });

  it("Form 5329 Line 2 - a validated first-time homebuyer amount is traced separately from the Roth-supported subtotal", () => {
    const directPlusSupportedHomebuyerExceptionNumber = calculateForm5329({
      earlyDistributionsIncludedInIncome: "10000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      qualifiedFirstTimeHomebuyerDistributionAmount: "2500",
      supportedQualifiedFirstTimeHomebuyerDistribution: "2500",
    });

    const line2 = directPlusSupportedHomebuyerExceptionNumber.lines.find((line) => line.line === "2");
    expect(
      String(line2?.inputs["Validated first-time homebuyer distribution amount (exception 09)"])
    ).toBe("2500");
    expect(String(line2?.inputs["Supported Roth first-time homebuyer amount (exception 09)"])).toBe("2500");
    expect(line2?.inputs["Line 2 exception number"]).toBe("09");
  });

  it("Form 5329 Line 2 - first-time homebuyer amounts are limited to the remaining $10,000 lifetime cap", () => {
    const cappedHomebuyerException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "15000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      qualifiedFirstTimeHomebuyerDistributionAmount: "4000",
      supportedQualifiedFirstTimeHomebuyerDistribution: "4000",
      priorQualifiedFirstTimeHomebuyerDistributions: "3000",
    });

    expect(cappedHomebuyerException.line1.toNumber()).toBe(15000);
    expect(cappedHomebuyerException.line2.toNumber()).toBe(7000);
    expect(cappedHomebuyerException.line2ExceptionNumber).toBe("09");
    expect(cappedHomebuyerException.line3.toNumber()).toBe(8000);
    expect(cappedHomebuyerException.line4.toNumber()).toBe(800);

    const line2 = cappedHomebuyerException.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Prior qualified first-time homebuyer distributions"])).toBe("3000");
    expect(String(line2?.inputs["Remaining first-time homebuyer lifetime cap"])).toBe("7000");
    expect(String(line2?.inputs["Validated first-time homebuyer distribution amount (exception 09)"])).toBe("4000");
    expect(String(line2?.inputs["Supported Roth first-time homebuyer amount (exception 09)"])).toBe("3000");
    expect(line2?.inputs["Line 2 exception number"]).toBe("09");
  });

  it("Form 5329 Line 2 - a manual exception number is ignored when the manual amount adds nothing beyond the supported subtotal", () => {
    const supportedOnlyAmountWithManualCode = calculateForm5329({
      earlyDistributionsIncludedInIncome: "10000",
      distributionsNotSubjectToAdditionalTax: "10000",
      distributionExceptionNumber: "12",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      supportedQualifiedFirstTimeHomebuyerDistribution: "10000",
    });

    expect(supportedOnlyAmountWithManualCode.line2.toNumber()).toBe(10000);
    expect(supportedOnlyAmountWithManualCode.line2ExceptionNumber).toBe("09");

    const line2 = supportedOnlyAmountWithManualCode.lines.find((line) => line.line === "2");
    expect(line2?.inputs["Line 2 exception number"]).toBe("09");
  });

  it("Form 5329 Line 2 - a manual exception number is ignored when supported exceptions already fill the capped Line 2 amount", () => {
    const cappedSupportedOnlyAmountWithManualCode = calculateForm5329({
      earlyDistributionsIncludedInIncome: "10000",
      distributionsNotSubjectToAdditionalTax: "13000",
      distributionExceptionNumber: "12",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      supportedQualifiedFirstTimeHomebuyerDistribution: "10000",
    });

    expect(cappedSupportedOnlyAmountWithManualCode.line2.toNumber()).toBe(10000);
    expect(cappedSupportedOnlyAmountWithManualCode.line2ExceptionNumber).toBe("09");

    const line2 = cappedSupportedOnlyAmountWithManualCode.lines.find((line) => line.line === "2");
    expect(line2?.inputs["Line 2 exception number"]).toBe("09");
  });

  it("Form 5329 Line 2 - capped supported exceptions ignore later codes that contribute no remaining dollars", () => {
    const cappedSupportedExceptions = calculateForm5329({
      earlyDistributionsIncludedInIncome: "500",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      deathDistributionExceptionAmount: "600",
      terminalIllnessExceptionAmount: "200",
    });

    expect(cappedSupportedExceptions.line1.toNumber()).toBe(500);
    expect(cappedSupportedExceptions.line2.toNumber()).toBe(500);
    expect(cappedSupportedExceptions.line2ExceptionNumber).toBe("04");
    expect(cappedSupportedExceptions.line3.toNumber()).toBe(0);
    expect(cappedSupportedExceptions.line4.toNumber()).toBe(0);

    const line2 = cappedSupportedExceptions.lines.find((line) => line.line === "2");
    expect(line2?.inputs["Line 2 exception number"]).toBe("04");
    expect(String(line2?.inputs["Validated death-distribution exception amount (exception 04)"])).toBe("600");
    expect(String(line2?.inputs["Validated terminal-illness distribution exception amount (exception 20)"])).toBe("200");
  });

  it("Form 5329 Line 2 - supported Form 8606 repayment-category taxable share adds to the automatic exception subtotal without forcing an exception number", () => {
    const repaymentCategoryAutomaticException = calculateForm5329({
      earlyDistributionsIncludedInIncome: "12000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      supportedRepaymentEligibleTraditionalDistributionTaxableShare: "4000",
    });

    expect(repaymentCategoryAutomaticException.line1.toNumber()).toBe(12000);
    expect(repaymentCategoryAutomaticException.line2.toNumber()).toBe(4000);
    expect(repaymentCategoryAutomaticException.line2ExceptionNumber).toBeUndefined();
    expect(repaymentCategoryAutomaticException.line3.toNumber()).toBe(8000);
    expect(repaymentCategoryAutomaticException.line4.toNumber()).toBe(800);

    const line2 = repaymentCategoryAutomaticException.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Supported Form 8606 repayment-category taxable share"])).toBe("4000");
  });

  it("Form 5329 Line 2 - a supported Form 8606 repayment-category exception number is preserved when it is the only applicable code", () => {
    const repaymentCategoryExceptionNumber = calculateForm5329({
      earlyDistributionsIncludedInIncome: "12000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      supportedRepaymentEligibleTraditionalDistributionTaxableShare: "4000",
      supportedRepaymentEligibleTraditionalDistributionExceptionNumber: "20",
    });

    expect(repaymentCategoryExceptionNumber.line2.toNumber()).toBe(4000);
    expect(repaymentCategoryExceptionNumber.line2ExceptionNumber).toBe("20");

    const line2 = repaymentCategoryExceptionNumber.lines.find((line) => line.line === "2");
    expect(line2?.inputs["Line 2 exception number"]).toBe("20");
    expect(line2?.inputs["Supported Form 8606 repayment-category exception number"]).toBe("20");
  });

  it("Form 5329 Line 2 - supported Form 8606 domestic-abuse repayment-category taxable shares are capped at $10,300 for 2025", () => {
    const repaymentCategoryDomesticAbuseCap = calculateForm5329({
      earlyDistributionsIncludedInIncome: "20000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      supportedRepaymentEligibleTraditionalDistributionTaxableShare: "16000",
      supportedRepaymentEligibleTraditionalDistributionExceptionNumber: "22",
    });

    expect(repaymentCategoryDomesticAbuseCap.line1.toNumber()).toBe(20000);
    expect(repaymentCategoryDomesticAbuseCap.line2.toNumber()).toBe(10300);
    expect(repaymentCategoryDomesticAbuseCap.line2ExceptionNumber).toBe("22");
    expect(repaymentCategoryDomesticAbuseCap.line3.toNumber()).toBe(9700);
    expect(repaymentCategoryDomesticAbuseCap.line4.toNumber()).toBe(970);

    const line2 = repaymentCategoryDomesticAbuseCap.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Supported Form 8606 repayment-category taxable share"])).toBe("16000");
    expect(line2?.inputs["Supported Form 8606 repayment-category exception number"]).toBe("22");
    expect(line2?.inputs["Line 2 exception number"]).toBe("22");
  });

  it("Form 5329 Line 2 - direct domestic-abuse amounts and supported repayment-category shares share the same $10,300 annual cap", () => {
    const combinedDomesticAbuseCap = calculateForm5329({
      earlyDistributionsIncludedInIncome: "20000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      domesticAbuseExceptionAmount: "8000",
      supportedRepaymentEligibleTraditionalDistributionTaxableShare: "5000",
      supportedRepaymentEligibleTraditionalDistributionExceptionNumber: "22",
    });

    expect(combinedDomesticAbuseCap.line1.toNumber()).toBe(20000);
    expect(combinedDomesticAbuseCap.line2.toNumber()).toBe(10300);
    expect(combinedDomesticAbuseCap.line2ExceptionNumber).toBe("22");
    expect(combinedDomesticAbuseCap.line3.toNumber()).toBe(9700);
    expect(combinedDomesticAbuseCap.line4.toNumber()).toBe(970);

    const line2 = combinedDomesticAbuseCap.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Validated domestic-abuse victim distribution exception amount (exception 22)"])).toBe(
      "8000"
    );
    expect(String(line2?.inputs["Supported Form 8606 repayment-category taxable share"])).toBe("5000");
    expect(String(line2?.inputs["Capped supported Form 8606 repayment-category taxable share"])).toBe("2300");
    expect(line2?.inputs["Supported Form 8606 repayment-category exception number"]).toBe("22");
    expect(line2?.inputs["Line 2 exception number"]).toBe("22");
  });

  it("Form 5329 Line 2 - supported Roth emergency-personal-expense repayment-category taxable shares are capped at $1,000 for 2025", () => {
    const repaymentCategoryEmergencyCap = calculateForm5329({
      earlyDistributionsIncludedInIncome: "6000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      supportedRepaymentEligibleRothDistributionTaxableShare: "2200",
      supportedRepaymentEligibleRothDistributionExceptionNumber: "23",
    });

    expect(repaymentCategoryEmergencyCap.line1.toNumber()).toBe(6000);
    expect(repaymentCategoryEmergencyCap.line2.toNumber()).toBe(1000);
    expect(repaymentCategoryEmergencyCap.line2ExceptionNumber).toBe("23");
    expect(repaymentCategoryEmergencyCap.line3.toNumber()).toBe(5000);
    expect(repaymentCategoryEmergencyCap.line4.toNumber()).toBe(500);

    const line2 = repaymentCategoryEmergencyCap.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Supported Roth repayment-category taxable share"])).toBe("2200");
    expect(line2?.inputs["Supported Roth repayment-category exception number"]).toBe("23");
    expect(line2?.inputs["Line 2 exception number"]).toBe("23");
  });

  it("Form 5329 Line 2 - a generic manual exception 23 amount only uses the remaining annual room after supported repayment-category shares", () => {
    const combinedEmergencyCap = calculateForm5329({
      earlyDistributionsIncludedInIncome: "6000",
      distributionsNotSubjectToAdditionalTax: "1500",
      distributionExceptionNumber: "23",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      supportedRepaymentEligibleRothDistributionTaxableShare: "700",
      supportedRepaymentEligibleRothDistributionExceptionNumber: "23",
    });

    expect(combinedEmergencyCap.line1.toNumber()).toBe(6000);
    expect(combinedEmergencyCap.line2.toNumber()).toBe(1000);
    expect(combinedEmergencyCap.line2ExceptionNumber).toBe("23");
    expect(combinedEmergencyCap.line3.toNumber()).toBe(5000);
    expect(combinedEmergencyCap.line4.toNumber()).toBe(500);

    const line2 = combinedEmergencyCap.lines.find((line) => line.line === "2");
    expect(String(line2?.inputs["Supported Roth repayment-category taxable share"])).toBe("700");
    expect(String(line2?.inputs["Validated manual exception amount"])).toBe("300");
    expect(line2?.inputs["Supported Roth repayment-category exception number"]).toBe("23");
    expect(line2?.inputs["Line 2 exception number"]).toBe("23");
  });

  it("Form 5329 Line 2 - supported repayment-category exception numbers collapse to 99 when another exception code also applies", () => {
    const repaymentCategoryPlusHomebuyerExceptionNumber = calculateForm5329({
      earlyDistributionsIncludedInIncome: "12000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      supportedQualifiedFirstTimeHomebuyerDistribution: "2000",
      supportedRepaymentEligibleTraditionalDistributionTaxableShare: "4000",
      supportedRepaymentEligibleTraditionalDistributionExceptionNumber: "20",
    });

    expect(repaymentCategoryPlusHomebuyerExceptionNumber.line2.toNumber()).toBe(6000);
    expect(repaymentCategoryPlusHomebuyerExceptionNumber.line2ExceptionNumber).toBe("99");

    const line2 = repaymentCategoryPlusHomebuyerExceptionNumber.lines.find((line) => line.line === "2");
    expect(line2?.inputs["Line 2 exception number"]).toBe("99");
  });

  it("Form 5329 Line 2 - manual exception amounts that already include the supported subtotal are not added twice", () => {
    const inclusiveManualExceptionAmount = calculateForm5329({
      earlyDistributionsIncludedInIncome: "12000",
      distributionsNotSubjectToAdditionalTax: "10500",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      supportedReturnedContributionByDueDateTaxableEarnings: "500",
      supportedQualifiedFirstTimeHomebuyerDistribution: "10000",
    });

    expect(inclusiveManualExceptionAmount.line2.toNumber()).toBe(10500);
    expect(inclusiveManualExceptionAmount.line3.toNumber()).toBe(1500);
    expect(inclusiveManualExceptionAmount.line4.toNumber()).toBe(150);
  });

  it("Form 5329 Line 4 - mixed regular and SIMPLE IRA early distributions apply the extra 15 percent only to the remaining SIMPLE portion", () => {
    const mixedEarlyDistributionPenalty = calculateForm5329({
      earlyDistributionsIncludedInIncome: "12000",
      distributionsNotSubjectToAdditionalTax: "3000",
      simpleIRADistributionsWithinFirstTwoYears: "4000",
    });

    expect(mixedEarlyDistributionPenalty.line3.toNumber()).toBe(9000);
    expect(mixedEarlyDistributionPenalty.simpleIRADistributionsWithinFirstTwoYears.toNumber()).toBe(4000);
    expect(mixedEarlyDistributionPenalty.line4.toNumber()).toBe(1500);

    const line4 = mixedEarlyDistributionPenalty.lines.find((line) => line.line === "4");
    expect(String(line4?.inputs["SIMPLE IRA amount taxed at 25%"])).toBe("4000");
  });

  it("Form 5329 Lines 1-4 - negative inputs floor at zero instead of producing a negative additional tax", () => {
    const flooredNegativeInputs = calculateForm5329({
      earlyDistributionsIncludedInIncome: "-500",
      rothConversionRecaptureAmount: "-1",
      distributionsNotSubjectToAdditionalTax: "-100",
      simpleIRADistributionsWithinFirstTwoYears: "-50",
    });

    expect(flooredNegativeInputs.line1.toNumber()).toBe(0);
    expect(flooredNegativeInputs.line2.toNumber()).toBe(0);
    expect(flooredNegativeInputs.line3.toNumber()).toBe(0);
    expect(flooredNegativeInputs.simpleIRADistributionsWithinFirstTwoYears.toNumber()).toBe(0);
    expect(flooredNegativeInputs.line4.toNumber()).toBe(0);
  });
});

describe("Form 5329 Part II - additional tax on education account and ABLE distributions", () => {
  it("Form 5329 Part II Line 5 - taxable education account distributions included in income", () => {
    const result = calculateForm5329({
      educationAccountDistributionsIncludedInIncome: "3500",
    });

    expect(result.line5.toNumber()).toBe(3500);
  });

  it("Form 5329 Part II Line 6 - excepted distributions reduce taxable amount", () => {
    const result = calculateForm5329({
      educationAccountDistributionsIncludedInIncome: "5000",
      educationAccountDistributionsExcepted: "2000",
    });

    expect(result.line6.toNumber()).toBe(2000);
  });

  it("Form 5329 Part II Line 6 - excepted amount is capped at Line 5", () => {
    const result = calculateForm5329({
      educationAccountDistributionsIncludedInIncome: "3000",
      educationAccountDistributionsExcepted: "5000",
    });

    expect(result.line6.toNumber()).toBe(3000);
  });

  it("Form 5329 Part II Line 7 - amount subject to additional tax is distributions minus exceptions", () => {
    const result = calculateForm5329({
      educationAccountDistributionsIncludedInIncome: "8000",
      educationAccountDistributionsExcepted: "3000",
    });

    expect(result.line7.toNumber()).toBe(5000);
  });

  it("Form 5329 Part II Line 7 - amount subject to additional tax floors at zero", () => {
    const result = calculateForm5329({
      educationAccountDistributionsIncludedInIncome: "2000",
      educationAccountDistributionsExcepted: "2000",
    });

    expect(result.line7.toNumber()).toBe(0);
  });

  it("Form 5329 Part II Line 8 - 10% additional tax on non-excepted distributions", () => {
    const result = calculateForm5329({
      educationAccountDistributionsIncludedInIncome: "10000",
      educationAccountDistributionsExcepted: "4000",
    });

    // 10% × $6,000 = $600
    expect(result.line8.toNumber()).toBe(600);
  });

  it("Form 5329 Part II Line 8 - zero tax when all distributions are excepted", () => {
    const result = calculateForm5329({
      educationAccountDistributionsIncludedInIncome: "7500",
      educationAccountDistributionsExcepted: "7500",
    });

    expect(result.line7.toNumber()).toBe(0);
    expect(result.line8.toNumber()).toBe(0);
  });

  it("Form 5329 Part II Line 8 - full tax when no distributions are excepted", () => {
    const result = calculateForm5329({
      educationAccountDistributionsIncludedInIncome: "12000",
    });

    // 10% × $12,000 = $1,200
    expect(result.line8.toNumber()).toBe(1200);
  });

  it("Form 5329 Part II - omitted inputs default to zero with no tax", () => {
    const result = calculateForm5329({});

    expect(result.line5.toNumber()).toBe(0);
    expect(result.line6.toNumber()).toBe(0);
    expect(result.line7.toNumber()).toBe(0);
    expect(result.line8.toNumber()).toBe(0);
  });

  it("Form 5329 Part II - negative inputs floor at zero", () => {
    const result = calculateForm5329({
      educationAccountDistributionsIncludedInIncome: "-1000",
      educationAccountDistributionsExcepted: "-500",
    });

    expect(result.line5.toNumber()).toBe(0);
    expect(result.line6.toNumber()).toBe(0);
    expect(result.line7.toNumber()).toBe(0);
    expect(result.line8.toNumber()).toBe(0);
  });

  it("Form 5329 Part II - penny-accurate on small distributions", () => {
    const result = calculateForm5329({
      educationAccountDistributionsIncludedInIncome: "15",
      educationAccountDistributionsExcepted: "5",
    });

    // 10% × $10 = $1.00
    expect(result.line7.toNumber()).toBe(10);
    expect(result.line8.toNumber()).toBe(1);
  });

  it("Form 5329 Part II - large 529 distribution with partial scholarship exception", () => {
    const result = calculateForm5329({
      educationAccountDistributionsIncludedInIncome: "25000",
      educationAccountDistributionsExcepted: "8000",
    });

    // 10% × $17,000 = $1,700
    expect(result.line7.toNumber()).toBe(17000);
    expect(result.line8.toNumber()).toBe(1700);
  });

  it("Form 5329 Part II - totalAdditionalTax includes Part II Line 8", () => {
    const result = calculateForm5329({
      educationAccountDistributionsIncludedInIncome: "6000",
      educationAccountDistributionsExcepted: "1000",
    });

    // Part I: $0 (no early distributions)
    // Part II: 10% × $5,000 = $500
    expect(result.line4.toNumber()).toBe(0);
    expect(result.line8.toNumber()).toBe(500);
    expect(result.totalAdditionalTax.toNumber()).toBe(500);
  });
});

describe("Form 5329 Part III - excess contributions to traditional IRAs", () => {
  it("Form 5329 Part III Line 9 - prior-year carryforward enters the excess contribution pipeline", () => {
    const result = calculateForm5329({
      traditionalIRAPriorYearExcessContributions: "3000",
      traditionalIRAValueDec31: "50000",
    });

    expect(result.line9.toNumber()).toBe(3000);
  });

  it("Form 5329 Part III Line 10 - unused contribution room absorbs prior-year excess", () => {
    const result = calculateForm5329({
      traditionalIRAPriorYearExcessContributions: "5000",
      traditionalIRAContributionRoom: "2000",
      traditionalIRAValueDec31: "50000",
    });

    expect(result.line10.toNumber()).toBe(2000);
    expect(result.line13.toNumber()).toBe(2000);
    expect(result.line14.toNumber()).toBe(3000);
  });

  it("Form 5329 Part III Line 11 - distributions included in income reduce prior-year excess", () => {
    const result = calculateForm5329({
      traditionalIRAPriorYearExcessContributions: "5000",
      traditionalIRADistributionsIncludedInIncome: "1500",
      traditionalIRAValueDec31: "50000",
    });

    expect(result.line11.toNumber()).toBe(1500);
    expect(result.line13.toNumber()).toBe(1500);
    expect(result.line14.toNumber()).toBe(3500);
  });

  it("Form 5329 Part III Line 12 - returned prior-year excess reduces carryforward", () => {
    const result = calculateForm5329({
      traditionalIRAPriorYearExcessContributions: "5000",
      traditionalIRAPriorYearExcessReturned: "2000",
      traditionalIRAValueDec31: "50000",
    });

    expect(result.line12.toNumber()).toBe(2000);
    expect(result.line13.toNumber()).toBe(2000);
    expect(result.line14.toNumber()).toBe(3000);
  });

  it("Form 5329 Part III Line 13 - sum of reductions to prior-year excess", () => {
    const result = calculateForm5329({
      traditionalIRAPriorYearExcessContributions: "8000",
      traditionalIRAContributionRoom: "1000",
      traditionalIRADistributionsIncludedInIncome: "2000",
      traditionalIRAPriorYearExcessReturned: "500",
      traditionalIRAValueDec31: "50000",
    });

    expect(result.line13.toNumber()).toBe(3500);
  });

  it("Form 5329 Part III Line 14 - remaining prior-year excess after reductions floors at zero", () => {
    const result = calculateForm5329({
      traditionalIRAPriorYearExcessContributions: "2000",
      traditionalIRAContributionRoom: "3000",
      traditionalIRAValueDec31: "50000",
    });

    expect(result.line14.toNumber()).toBe(0);
  });

  it("Form 5329 Part III Line 15 - current-year excess contributions", () => {
    const result = calculateForm5329({
      traditionalIRACurrentYearExcessContributions: "1500",
      traditionalIRAValueDec31: "50000",
    });

    expect(result.line15.toNumber()).toBe(1500);
  });

  it("Form 5329 Part III Line 16 - total excess is sum of remaining prior-year and current-year excess", () => {
    const result = calculateForm5329({
      traditionalIRAPriorYearExcessContributions: "3000",
      traditionalIRAContributionRoom: "500",
      traditionalIRACurrentYearExcessContributions: "2000",
      traditionalIRAValueDec31: "50000",
    });

    expect(result.line14.toNumber()).toBe(2500);
    expect(result.line15.toNumber()).toBe(2000);
    expect(result.line16.toNumber()).toBe(4500);
  });

  it("Form 5329 Part III Line 17 - 6% tax on the smaller of total excess or year-end IRA value", () => {
    const result = calculateForm5329({
      traditionalIRAPriorYearExcessContributions: "3000",
      traditionalIRACurrentYearExcessContributions: "2000",
      traditionalIRAValueDec31: "50000",
    });

    // Total excess = 3000 + 2000 = 5000; min(5000, 50000) = 5000; 6% × 5000 = 300
    expect(result.line16.toNumber()).toBe(5000);
    expect(result.line17.toNumber()).toBe(300);
  });

  it("Form 5329 Part III Line 17 - tax is capped when year-end IRA value is less than total excess", () => {
    const result = calculateForm5329({
      traditionalIRACurrentYearExcessContributions: "10000",
      traditionalIRAValueDec31: "4000",
    });

    // Total excess = 10000; min(10000, 4000) = 4000; 6% × 4000 = 240
    expect(result.line16.toNumber()).toBe(10000);
    expect(result.line17.toNumber()).toBe(240);
  });

  it("Form 5329 Part III Line 17 - zero year-end value produces no tax even with positive excess", () => {
    const result = calculateForm5329({
      traditionalIRACurrentYearExcessContributions: "5000",
      traditionalIRAValueDec31: "0",
    });

    expect(result.line16.toNumber()).toBe(5000);
    expect(result.line17.toNumber()).toBe(0);
  });

  it("Form 5329 Part III - prior-year excess fully absorbed by contributions room, distributions, and returns", () => {
    const result = calculateForm5329({
      traditionalIRAPriorYearExcessContributions: "5000",
      traditionalIRAContributionRoom: "2000",
      traditionalIRADistributionsIncludedInIncome: "2000",
      traditionalIRAPriorYearExcessReturned: "1000",
      traditionalIRAValueDec31: "50000",
    });

    expect(result.line13.toNumber()).toBe(5000);
    expect(result.line14.toNumber()).toBe(0);
    expect(result.line16.toNumber()).toBe(0);
    expect(result.line17.toNumber()).toBe(0);
  });

  it("Form 5329 Part III - negative inputs floor at zero", () => {
    const result = calculateForm5329({
      traditionalIRAPriorYearExcessContributions: "-500",
      traditionalIRAContributionRoom: "-100",
      traditionalIRADistributionsIncludedInIncome: "-50",
      traditionalIRAPriorYearExcessReturned: "-25",
      traditionalIRACurrentYearExcessContributions: "-200",
      traditionalIRAValueDec31: "-1000",
    });

    expect(result.line9.toNumber()).toBe(0);
    expect(result.line10.toNumber()).toBe(0);
    expect(result.line11.toNumber()).toBe(0);
    expect(result.line12.toNumber()).toBe(0);
    expect(result.line15.toNumber()).toBe(0);
    expect(result.line16.toNumber()).toBe(0);
    expect(result.line17.toNumber()).toBe(0);
  });

  it("Form 5329 Part III - omitted inputs default to zero with no tax", () => {
    const result = calculateForm5329({});

    expect(result.line9.toNumber()).toBe(0);
    expect(result.line16.toNumber()).toBe(0);
    expect(result.line17.toNumber()).toBe(0);
  });
});

describe("Form 5329 Part IV - excess contributions to Roth IRAs", () => {
  it("Form 5329 Part IV Line 18 - prior-year Roth carryforward enters the excess contribution pipeline", () => {
    const result = calculateForm5329({
      rothIRAPriorYearExcessContributions: "4000",
      rothIRAValueDec31: "60000",
    });

    expect(result.line18.toNumber()).toBe(4000);
  });

  it("Form 5329 Part IV Line 19 - unused Roth contribution room absorbs prior-year excess", () => {
    const result = calculateForm5329({
      rothIRAPriorYearExcessContributions: "5000",
      rothIRAContributionRoom: "3000",
      rothIRAValueDec31: "60000",
    });

    expect(result.line19.toNumber()).toBe(3000);
    expect(result.line21.toNumber()).toBe(3000);
    expect(result.line22.toNumber()).toBe(2000);
  });

  it("Form 5329 Part IV Line 20 - Roth distributions reduce prior-year excess", () => {
    const result = calculateForm5329({
      rothIRAPriorYearExcessContributions: "5000",
      rothIRADistributions: "2000",
      rothIRAValueDec31: "60000",
    });

    expect(result.line20.toNumber()).toBe(2000);
    expect(result.line21.toNumber()).toBe(2000);
    expect(result.line22.toNumber()).toBe(3000);
  });

  it("Form 5329 Part IV Line 21 - sum of reductions to prior-year Roth excess", () => {
    const result = calculateForm5329({
      rothIRAPriorYearExcessContributions: "8000",
      rothIRAContributionRoom: "1500",
      rothIRADistributions: "2500",
      rothIRAValueDec31: "60000",
    });

    expect(result.line21.toNumber()).toBe(4000);
  });

  it("Form 5329 Part IV Line 22 - remaining prior-year Roth excess after reductions floors at zero", () => {
    const result = calculateForm5329({
      rothIRAPriorYearExcessContributions: "2000",
      rothIRAContributionRoom: "3000",
      rothIRAValueDec31: "60000",
    });

    expect(result.line22.toNumber()).toBe(0);
  });

  it("Form 5329 Part IV Line 23 - current-year Roth excess contributions", () => {
    const result = calculateForm5329({
      rothIRACurrentYearExcessContributions: "2500",
      rothIRAValueDec31: "60000",
    });

    expect(result.line23.toNumber()).toBe(2500);
  });

  it("Form 5329 Part IV Line 24 - total Roth excess is sum of remaining prior-year and current-year excess", () => {
    const result = calculateForm5329({
      rothIRAPriorYearExcessContributions: "4000",
      rothIRAContributionRoom: "1000",
      rothIRACurrentYearExcessContributions: "3000",
      rothIRAValueDec31: "60000",
    });

    expect(result.line22.toNumber()).toBe(3000);
    expect(result.line23.toNumber()).toBe(3000);
    expect(result.line24.toNumber()).toBe(6000);
  });

  it("Form 5329 Part IV Line 25 - 6% tax on the smaller of total Roth excess or year-end Roth IRA value", () => {
    const result = calculateForm5329({
      rothIRAPriorYearExcessContributions: "2000",
      rothIRACurrentYearExcessContributions: "1000",
      rothIRAValueDec31: "60000",
    });

    // Total excess = 2000 + 1000 = 3000; min(3000, 60000) = 3000; 6% × 3000 = 180
    expect(result.line24.toNumber()).toBe(3000);
    expect(result.line25.toNumber()).toBe(180);
  });

  it("Form 5329 Part IV Line 25 - tax is capped when year-end Roth IRA value is less than total excess", () => {
    const result = calculateForm5329({
      rothIRACurrentYearExcessContributions: "8000",
      rothIRAValueDec31: "3000",
    });

    // Total excess = 8000; min(8000, 3000) = 3000; 6% × 3000 = 180
    expect(result.line24.toNumber()).toBe(8000);
    expect(result.line25.toNumber()).toBe(180);
  });

  it("Form 5329 Part IV Line 25 - zero year-end Roth value produces no tax even with positive excess", () => {
    const result = calculateForm5329({
      rothIRACurrentYearExcessContributions: "5000",
      rothIRAValueDec31: "0",
    });

    expect(result.line24.toNumber()).toBe(5000);
    expect(result.line25.toNumber()).toBe(0);
  });

  it("Form 5329 Part IV - prior-year Roth excess fully absorbed by contribution room and distributions", () => {
    const result = calculateForm5329({
      rothIRAPriorYearExcessContributions: "4000",
      rothIRAContributionRoom: "2000",
      rothIRADistributions: "2000",
      rothIRAValueDec31: "60000",
    });

    expect(result.line21.toNumber()).toBe(4000);
    expect(result.line22.toNumber()).toBe(0);
    expect(result.line24.toNumber()).toBe(0);
    expect(result.line25.toNumber()).toBe(0);
  });

  it("Form 5329 Part IV - negative inputs floor at zero", () => {
    const result = calculateForm5329({
      rothIRAPriorYearExcessContributions: "-500",
      rothIRAContributionRoom: "-100",
      rothIRADistributions: "-50",
      rothIRACurrentYearExcessContributions: "-200",
      rothIRAValueDec31: "-1000",
    });

    expect(result.line18.toNumber()).toBe(0);
    expect(result.line19.toNumber()).toBe(0);
    expect(result.line20.toNumber()).toBe(0);
    expect(result.line23.toNumber()).toBe(0);
    expect(result.line24.toNumber()).toBe(0);
    expect(result.line25.toNumber()).toBe(0);
  });

  it("Form 5329 Part IV - omitted inputs default to zero with no tax", () => {
    const result = calculateForm5329({});

    expect(result.line18.toNumber()).toBe(0);
    expect(result.line24.toNumber()).toBe(0);
    expect(result.line25.toNumber()).toBe(0);
  });
});

describe("Form 5329 Part VII - excess contributions to HSAs", () => {
  it("Form 5329 Part VII Line 42 - prior-year HSA excess carryforward enters the excess contribution pipeline", () => {
    const result = calculateForm5329({
      hsaPriorYearExcessContributions: "3000",
      hsaValueDec31: "50000",
    });

    expect(result.line42.toNumber()).toBe(3000);
  });

  it("Form 5329 Part VII Line 43 - unused HSA contribution room absorbs prior-year excess", () => {
    const result = calculateForm5329({
      hsaPriorYearExcessContributions: "4000",
      hsaContributionRoom: "2500",
      hsaValueDec31: "50000",
    });

    expect(result.line43.toNumber()).toBe(2500);
    expect(result.line45.toNumber()).toBe(2500);
    expect(result.line46.toNumber()).toBe(1500);
  });

  it("Form 5329 Part VII Line 44 - HSA distributions reduce prior-year excess", () => {
    const result = calculateForm5329({
      hsaPriorYearExcessContributions: "5000",
      hsaDistributions: "1800",
      hsaValueDec31: "50000",
    });

    expect(result.line44.toNumber()).toBe(1800);
    expect(result.line45.toNumber()).toBe(1800);
    expect(result.line46.toNumber()).toBe(3200);
  });

  it("Form 5329 Part VII Line 45 - sum of reductions to prior-year HSA excess", () => {
    const result = calculateForm5329({
      hsaPriorYearExcessContributions: "6000",
      hsaContributionRoom: "1500",
      hsaDistributions: "2000",
      hsaValueDec31: "50000",
    });

    expect(result.line45.toNumber()).toBe(3500);
  });

  it("Form 5329 Part VII Line 46 - remaining prior-year HSA excess after reductions floors at zero", () => {
    const result = calculateForm5329({
      hsaPriorYearExcessContributions: "2000",
      hsaContributionRoom: "3000",
      hsaValueDec31: "50000",
    });

    expect(result.line46.toNumber()).toBe(0);
  });

  it("Form 5329 Part VII Line 47 - current-year HSA excess contributions", () => {
    const result = calculateForm5329({
      hsaCurrentYearExcessContributions: "1500",
      hsaValueDec31: "50000",
    });

    expect(result.line47.toNumber()).toBe(1500);
  });

  it("Form 5329 Part VII Line 47 - supported timely returned excess contributions reduce the auto-derived excess", () => {
    const result = calculateForm5329({
      hsaCurrentYearExcessContributions: "1500",
      supportedHsaReturnedExcessContributionsByDueDate: "900",
      hsaValueDec31: "50000",
    });
    const line47 = result.lines.find((line) => line.form === "Form 5329" && line.line === "47");

    expect(result.line47.toNumber()).toBe(600);
    expect(String(line47?.inputs["Raw current-year HSA excess before returned-excess reduction"])).toBe("1500");
    expect(String(line47?.inputs["Supported timely returned excess contributions"])).toBe("900");
  });

  it("Form 5329 Part VII Line 47 - section 301.9100-2 returned excess contributions also reduce the current-year HSA excess", () => {
    const result = calculateForm5329({
      hsaCurrentYearExcessContributions: "1500",
      supportedHsaReturnedExcessContributionsByDueDate: "400",
      supportedHsaReturnedExcessContributionsUnder9100Relief: "300",
      hsaValueDec31: "50000",
    });
    const line47 = result.lines.find((line) => line.form === "Form 5329" && line.line === "47");

    expect(result.line47.toNumber()).toBe(800);
    expect(String(line47?.inputs["Raw current-year HSA excess before returned-excess reduction"])).toBe("1500");
    expect(String(line47?.inputs["Supported timely returned excess contributions"])).toBe("400");
    expect(String(line47?.inputs["Supported section 301.9100-2 returned excess contributions"])).toBe("300");
  });

  it("Form 5329 Part VII Line 48 - total HSA excess is sum of remaining prior-year and current-year excess", () => {
    const result = calculateForm5329({
      hsaPriorYearExcessContributions: "4000",
      hsaContributionRoom: "1000",
      hsaCurrentYearExcessContributions: "2000",
      hsaValueDec31: "50000",
    });

    expect(result.line46.toNumber()).toBe(3000);
    expect(result.line47.toNumber()).toBe(2000);
    expect(result.line48.toNumber()).toBe(5000);
  });

  it("Form 5329 Part VII Line 49 - 6% tax on the smaller of total HSA excess or year-end HSA value", () => {
    const result = calculateForm5329({
      hsaPriorYearExcessContributions: "2000",
      hsaCurrentYearExcessContributions: "1000",
      hsaValueDec31: "50000",
    });

    // Total excess = 2000 + 1000 = 3000; min(3000, 50000) = 3000; 6% × 3000 = 180
    expect(result.line48.toNumber()).toBe(3000);
    expect(result.line49.toNumber()).toBe(180);
  });

  it("Form 5329 Part VII Line 49 - tax is capped when year-end HSA value is less than total excess", () => {
    const result = calculateForm5329({
      hsaCurrentYearExcessContributions: "7000",
      hsaValueDec31: "2000",
    });

    // Total excess = 7000; min(7000, 2000) = 2000; 6% × 2000 = 120
    expect(result.line48.toNumber()).toBe(7000);
    expect(result.line49.toNumber()).toBe(120);
  });

  it("Form 5329 Part VII Line 49 - zero year-end HSA value produces no tax even with positive excess", () => {
    const result = calculateForm5329({
      hsaCurrentYearExcessContributions: "5000",
      hsaValueDec31: "0",
    });

    expect(result.line48.toNumber()).toBe(5000);
    expect(result.line49.toNumber()).toBe(0);
  });

  it("Form 5329 Part VII - prior-year HSA excess fully absorbed by contribution room and distributions", () => {
    const result = calculateForm5329({
      hsaPriorYearExcessContributions: "3000",
      hsaContributionRoom: "1500",
      hsaDistributions: "1500",
      hsaValueDec31: "50000",
    });

    expect(result.line45.toNumber()).toBe(3000);
    expect(result.line46.toNumber()).toBe(0);
    expect(result.line48.toNumber()).toBe(0);
    expect(result.line49.toNumber()).toBe(0);
  });

  it("Form 5329 Part VII - negative inputs floor at zero", () => {
    const result = calculateForm5329({
      hsaPriorYearExcessContributions: "-500",
      hsaContributionRoom: "-100",
      hsaDistributions: "-50",
      hsaCurrentYearExcessContributions: "-200",
      hsaValueDec31: "-1000",
    });

    expect(result.line42.toNumber()).toBe(0);
    expect(result.line43.toNumber()).toBe(0);
    expect(result.line44.toNumber()).toBe(0);
    expect(result.line47.toNumber()).toBe(0);
    expect(result.line48.toNumber()).toBe(0);
    expect(result.line49.toNumber()).toBe(0);
  });

  it("Form 5329 Part VII - omitted inputs default to zero with no tax", () => {
    const result = calculateForm5329({});

    expect(result.line42.toNumber()).toBe(0);
    expect(result.line48.toNumber()).toBe(0);
    expect(result.line49.toNumber()).toBe(0);
  });
});

describe("Form 5329 Parts I + II + III + IV + VII combined", () => {
  it("Form 5329 - combined additional tax sums Part I Line 4, Part II Line 8, Part III Line 17, Part IV Line 25, and Part VII Line 49", () => {
    const result = calculateForm5329({
      // Part I
      earlyDistributionsIncludedInIncome: "10000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      // Part II
      educationAccountDistributionsIncludedInIncome: "4000",
      educationAccountDistributionsExcepted: "1000",
      // Part III
      traditionalIRACurrentYearExcessContributions: "2000",
      traditionalIRAValueDec31: "50000",
      // Part IV
      rothIRACurrentYearExcessContributions: "1500",
      rothIRAValueDec31: "40000",
      // Part VII
      hsaCurrentYearExcessContributions: "1000",
      hsaValueDec31: "30000",
    });

    expect(result.line4.toNumber()).toBe(1000);   // 10% × 10000
    expect(result.line8.toNumber()).toBe(300);     // 10% × 3000
    expect(result.line17.toNumber()).toBe(120);    // 6% × 2000
    expect(result.line25.toNumber()).toBe(90);     // 6% × 1500
    expect(result.line49.toNumber()).toBe(60);     // 6% × 1000
    expect(result.totalAdditionalTax.toNumber()).toBe(1570);
  });

  it("Form 5329 - totalAdditionalTax is just Part I when no other parts exist", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "5000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
    });

    expect(result.line4.toNumber()).toBe(500);
    expect(result.line8.toNumber()).toBe(0);
    expect(result.line17.toNumber()).toBe(0);
    expect(result.line25.toNumber()).toBe(0);
    expect(result.totalAdditionalTax.toNumber()).toBe(500);
  });

  it("Form 5329 - totalAdditionalTax is just Part III + Part IV when no early or education distributions exist", () => {
    const result = calculateForm5329({
      traditionalIRACurrentYearExcessContributions: "3000",
      traditionalIRAValueDec31: "100000",
      rothIRACurrentYearExcessContributions: "2000",
      rothIRAValueDec31: "80000",
    });

    expect(result.line4.toNumber()).toBe(0);
    expect(result.line8.toNumber()).toBe(0);
    expect(result.line17.toNumber()).toBe(180);    // 6% × 3000
    expect(result.line25.toNumber()).toBe(120);    // 6% × 2000
    expect(result.totalAdditionalTax.toNumber()).toBe(300);
  });

  // ── Part V: Additional Tax on Excess Contributions to Coverdell ESAs ──

  it("Form 5329 Part V Line 26 - prior-year Coverdell ESA excess carryforward enters the excess contribution pipeline", () => {
    const result = calculateForm5329({
      coverdellESAPriorYearExcessContributions: "3000",
      coverdellESAValueDec31: "10000",
    });

    expect(result.line26.toNumber()).toBe(3000);
    expect(result.line32.toNumber()).toBe(3000);
    expect(result.line33.toNumber()).toBe(180); // 6% × 3000
  });

  it("Form 5329 Part V Line 27 - unused Coverdell contribution room absorbs prior-year excess", () => {
    const result = calculateForm5329({
      coverdellESAPriorYearExcessContributions: "2000",
      coverdellESAContributionRoom: "1500",
      coverdellESAValueDec31: "10000",
    });

    expect(result.line27.toNumber()).toBe(1500);
    expect(result.line30.toNumber()).toBe(500); // 2000 - 1500
    expect(result.line33.toNumber()).toBe(30); // 6% × 500
  });

  it("Form 5329 Part V Line 28 - Coverdell distributions reduce prior-year excess", () => {
    const result = calculateForm5329({
      coverdellESAPriorYearExcessContributions: "2000",
      coverdellESADistributions: "800",
      coverdellESAValueDec31: "10000",
    });

    expect(result.line28.toNumber()).toBe(800);
    expect(result.line30.toNumber()).toBe(1200); // 2000 - 800
  });

  it("Form 5329 Part V Line 29 - sum of reductions to prior-year Coverdell excess", () => {
    const result = calculateForm5329({
      coverdellESAPriorYearExcessContributions: "3000",
      coverdellESAContributionRoom: "1000",
      coverdellESADistributions: "500",
      coverdellESAValueDec31: "10000",
    });

    expect(result.line29.toNumber()).toBe(1500); // 1000 + 500
  });

  it("Form 5329 Part V Line 30 - remaining prior-year Coverdell excess after reductions floors at zero", () => {
    const result = calculateForm5329({
      coverdellESAPriorYearExcessContributions: "1000",
      coverdellESAContributionRoom: "800",
      coverdellESADistributions: "500",
      coverdellESAValueDec31: "10000",
    });

    expect(result.line30.toNumber()).toBe(0); // max(0, 1000 - 1300)
  });

  it("Form 5329 Part V Line 31 - current-year Coverdell excess contributions", () => {
    const result = calculateForm5329({
      coverdellESACurrentYearExcessContributions: "500",
      coverdellESAValueDec31: "10000",
    });

    expect(result.line31.toNumber()).toBe(500);
    expect(result.line32.toNumber()).toBe(500);
    expect(result.line33.toNumber()).toBe(30); // 6% × 500
  });

  it("Form 5329 Part V Line 32 - total Coverdell excess is sum of remaining prior-year and current-year excess", () => {
    const result = calculateForm5329({
      coverdellESAPriorYearExcessContributions: "2000",
      coverdellESAContributionRoom: "500",
      coverdellESACurrentYearExcessContributions: "300",
      coverdellESAValueDec31: "10000",
    });

    // Remaining: max(0, 2000 - 500) = 1500; total = 1500 + 300 = 1800
    expect(result.line32.toNumber()).toBe(1800);
  });

  it("Form 5329 Part V Line 33 - 6% tax on the smaller of total Coverdell excess or year-end value", () => {
    // Case 1: excess less than value
    const normalCase = calculateForm5329({
      coverdellESACurrentYearExcessContributions: "1000",
      coverdellESAValueDec31: "5000",
    });
    expect(normalCase.line33.toNumber()).toBe(60); // 6% × 1000

    // Case 2: year-end value less than excess (caps the tax)
    const cappedCase = calculateForm5329({
      coverdellESACurrentYearExcessContributions: "5000",
      coverdellESAValueDec31: "2000",
    });
    expect(cappedCase.line33.toNumber()).toBe(120); // 6% × 2000

    // Case 3: zero value means no tax
    const zeroValue = calculateForm5329({
      coverdellESACurrentYearExcessContributions: "5000",
      coverdellESAValueDec31: "0",
    });
    expect(zeroValue.line33.toNumber()).toBe(0);
  });

  it("Form 5329 Part V - negative inputs are floored at zero", () => {
    const result = calculateForm5329({
      coverdellESAPriorYearExcessContributions: "-1000",
      coverdellESAContributionRoom: "-500",
      coverdellESADistributions: "-200",
      coverdellESACurrentYearExcessContributions: "-300",
      coverdellESAValueDec31: "-5000",
    });

    expect(result.line26.toNumber()).toBe(0);
    expect(result.line27.toNumber()).toBe(0);
    expect(result.line28.toNumber()).toBe(0);
    expect(result.line33.toNumber()).toBe(0);
  });

  // ── Part VI: Additional Tax on Excess Contributions to Archer MSAs ──

  it("Form 5329 Part VI Line 34 - prior-year Archer MSA excess carryforward enters the excess contribution pipeline", () => {
    const result = calculateForm5329({
      archerMSAPriorYearExcessContributions: "2500",
      archerMSAValueDec31: "15000",
    });

    expect(result.line34.toNumber()).toBe(2500);
    expect(result.line40.toNumber()).toBe(2500);
    expect(result.line41.toNumber()).toBe(150); // 6% × 2500
  });

  it("Form 5329 Part VI Line 35 - unused Archer MSA contribution room absorbs prior-year excess", () => {
    const result = calculateForm5329({
      archerMSAPriorYearExcessContributions: "3000",
      archerMSAContributionRoom: "1200",
      archerMSAValueDec31: "15000",
    });

    expect(result.line35.toNumber()).toBe(1200);
    expect(result.line38.toNumber()).toBe(1800); // 3000 - 1200
  });

  it("Form 5329 Part VI Line 36 - Archer MSA distributions reduce prior-year excess", () => {
    const result = calculateForm5329({
      archerMSAPriorYearExcessContributions: "2000",
      archerMSADistributions: "600",
      archerMSAValueDec31: "15000",
    });

    expect(result.line36.toNumber()).toBe(600);
    expect(result.line38.toNumber()).toBe(1400); // 2000 - 600
  });

  it("Form 5329 Part VI Line 37 - sum of reductions to prior-year Archer MSA excess", () => {
    const result = calculateForm5329({
      archerMSAPriorYearExcessContributions: "4000",
      archerMSAContributionRoom: "1500",
      archerMSADistributions: "1000",
      archerMSAValueDec31: "15000",
    });

    expect(result.line37.toNumber()).toBe(2500); // 1500 + 1000
  });

  it("Form 5329 Part VI Line 38 - remaining prior-year Archer MSA excess after reductions floors at zero", () => {
    const result = calculateForm5329({
      archerMSAPriorYearExcessContributions: "1000",
      archerMSAContributionRoom: "700",
      archerMSADistributions: "500",
      archerMSAValueDec31: "15000",
    });

    expect(result.line38.toNumber()).toBe(0); // max(0, 1000 - 1200)
  });

  it("Form 5329 Part VI Line 39 - current-year Archer MSA excess contributions", () => {
    const result = calculateForm5329({
      archerMSACurrentYearExcessContributions: "800",
      archerMSAValueDec31: "15000",
    });

    expect(result.line39.toNumber()).toBe(800);
    expect(result.line40.toNumber()).toBe(800);
    expect(result.line41.toNumber()).toBe(48); // 6% × 800
  });

  it("Form 5329 Part VI Line 40 - total Archer MSA excess is sum of remaining prior-year and current-year excess", () => {
    const result = calculateForm5329({
      archerMSAPriorYearExcessContributions: "3000",
      archerMSAContributionRoom: "1000",
      archerMSACurrentYearExcessContributions: "400",
      archerMSAValueDec31: "15000",
    });

    // Remaining: max(0, 3000 - 1000) = 2000; total = 2000 + 400 = 2400
    expect(result.line40.toNumber()).toBe(2400);
  });

  it("Form 5329 Part VI Line 41 - 6% tax on the smaller of total Archer MSA excess or year-end value", () => {
    // Case 1: excess less than value
    const normalCase = calculateForm5329({
      archerMSACurrentYearExcessContributions: "1500",
      archerMSAValueDec31: "10000",
    });
    expect(normalCase.line41.toNumber()).toBe(90); // 6% × 1500

    // Case 2: year-end value less than excess
    const cappedCase = calculateForm5329({
      archerMSACurrentYearExcessContributions: "8000",
      archerMSAValueDec31: "3000",
    });
    expect(cappedCase.line41.toNumber()).toBe(180); // 6% × 3000

    // Case 3: zero value means no tax
    const zeroValue = calculateForm5329({
      archerMSACurrentYearExcessContributions: "5000",
      archerMSAValueDec31: "0",
    });
    expect(zeroValue.line41.toNumber()).toBe(0);
  });

  it("Form 5329 Part VI - negative inputs are floored at zero", () => {
    const result = calculateForm5329({
      archerMSAPriorYearExcessContributions: "-2000",
      archerMSAContributionRoom: "-1000",
      archerMSADistributions: "-500",
      archerMSACurrentYearExcessContributions: "-300",
      archerMSAValueDec31: "-10000",
    });

    expect(result.line34.toNumber()).toBe(0);
    expect(result.line35.toNumber()).toBe(0);
    expect(result.line36.toNumber()).toBe(0);
    expect(result.line41.toNumber()).toBe(0);
  });

  // ── Part VIII: Additional Tax on Excess Contributions to ABLE Accounts ──

  it("Form 5329 Part VIII Line 50 - prior-year ABLE excess carryforward", () => {
    const result = calculateForm5329({
      ablePriorYearExcessContributions: "5000",
      ableValueDec31: "20000",
    });

    expect(result.line50.toNumber()).toBe(5000);
    expect(result.line53.toNumber()).toBe(300); // 6% × 5000
  });

  it("Form 5329 Part VIII Line 51 - contribution room and distributions reduce ABLE excess", () => {
    const result = calculateForm5329({
      ablePriorYearExcessContributions: "4000",
      ableReductions: "2500",
      ableValueDec31: "20000",
    });

    expect(result.line51.toNumber()).toBe(2500);
    // Remaining: max(0, 4000 - 2500) = 1500; tax = 6% × 1500 = 90
    expect(result.line53.toNumber()).toBe(90);
  });

  it("Form 5329 Part VIII Line 51 - reductions exceeding prior excess floor at zero remaining", () => {
    const result = calculateForm5329({
      ablePriorYearExcessContributions: "2000",
      ableReductions: "5000",
      ableValueDec31: "20000",
    });

    // Remaining prior: max(0, 2000 - 5000) = 0; no current excess = total 0
    expect(result.line53.toNumber()).toBe(0);
  });

  it("Form 5329 Part VIII Line 52 - current-year ABLE excess contributions", () => {
    const result = calculateForm5329({
      ableCurrentYearExcessContributions: "3000",
      ableValueDec31: "20000",
    });

    expect(result.line52.toNumber()).toBe(3000);
    expect(result.line53.toNumber()).toBe(180); // 6% × 3000
  });

  it("Form 5329 Part VIII Line 53 - 6% tax on ABLE excess contributions", () => {
    // Combined prior + current
    const result = calculateForm5329({
      ablePriorYearExcessContributions: "2000",
      ableReductions: "500",
      ableCurrentYearExcessContributions: "1000",
      ableValueDec31: "20000",
    });

    // Remaining prior: max(0, 2000 - 500) = 1500; total = 1500 + 1000 = 2500
    expect(result.line53.toNumber()).toBe(150); // 6% × 2500
  });

  it("Form 5329 Part VIII Line 53 - year-end value caps the tax", () => {
    const result = calculateForm5329({
      ableCurrentYearExcessContributions: "10000",
      ableValueDec31: "3000",
    });

    expect(result.line53.toNumber()).toBe(180); // 6% × min(10000, 3000) = 6% × 3000
  });

  it("Form 5329 Part VIII Line 53 - zero value means no tax", () => {
    const result = calculateForm5329({
      ableCurrentYearExcessContributions: "5000",
      ableValueDec31: "0",
    });

    expect(result.line53.toNumber()).toBe(0);
  });

  it("Form 5329 Part VIII - negative inputs are floored at zero", () => {
    const result = calculateForm5329({
      ablePriorYearExcessContributions: "-3000",
      ableReductions: "-1000",
      ableCurrentYearExcessContributions: "-2000",
      ableValueDec31: "-10000",
    });

    expect(result.line50.toNumber()).toBe(0);
    expect(result.line51.toNumber()).toBe(0);
    expect(result.line52.toNumber()).toBe(0);
    expect(result.line53.toNumber()).toBe(0);
  });

  // ── Part IX: Additional Tax on Excess Accumulations (RMD Penalty) ──

  it("Form 5329 Part IX Line 54 - required minimum distribution", () => {
    const result = calculateForm5329({
      requiredMinimumDistribution: "20000",
      actualDistributionsForRMD: "15000",
    });

    expect(result.line54.toNumber()).toBe(20000);
  });

  it("Form 5329 Part IX Line 55 - actual distributions taken", () => {
    const result = calculateForm5329({
      requiredMinimumDistribution: "20000",
      actualDistributionsForRMD: "15000",
    });

    expect(result.line55.toNumber()).toBe(15000);
  });

  it("Form 5329 Part IX Line 56 - shortfall is zero when actual distributions meet or exceed RMD", () => {
    const noShortfall = calculateForm5329({
      requiredMinimumDistribution: "20000",
      actualDistributionsForRMD: "25000",
    });
    expect(noShortfall.line56.toNumber()).toBe(0);

    const exactlyMet = calculateForm5329({
      requiredMinimumDistribution: "20000",
      actualDistributionsForRMD: "20000",
    });
    expect(exactlyMet.line56.toNumber()).toBe(0);
  });

  it("Form 5329 Part IX Line 56 - shortfall equals RMD minus actual when underdistributed", () => {
    const result = calculateForm5329({
      requiredMinimumDistribution: "20000",
      actualDistributionsForRMD: "15000",
    });

    expect(result.line56.toNumber()).toBe(5000);
  });

  it("Form 5329 Part IX Line 56 - full RMD is the shortfall when nothing was distributed", () => {
    const result = calculateForm5329({
      requiredMinimumDistribution: "20000",
      actualDistributionsForRMD: "0",
    });

    expect(result.line56.toNumber()).toBe(20000);
  });

  it("Form 5329 Part IX Line 57 - 25% default penalty on excess accumulations", () => {
    const result = calculateForm5329({
      requiredMinimumDistribution: "20000",
      actualDistributionsForRMD: "15000",
    });

    // 25% × $5,000 shortfall = $1,250
    expect(result.line57.toNumber()).toBe(1250);
  });

  it("Form 5329 Part IX Line 57 - 10% reduced rate when shortfall corrected within correction window", () => {
    const result = calculateForm5329({
      requiredMinimumDistribution: "20000",
      actualDistributionsForRMD: "15000",
      rmdShortfallCorrectedWithinWindow: true,
    });

    // 10% × $5,000 shortfall = $500
    expect(result.line57.toNumber()).toBe(500);
  });

  it("Form 5329 Part IX Line 57 - zero penalty when no shortfall regardless of correction flag", () => {
    const corrected = calculateForm5329({
      requiredMinimumDistribution: "20000",
      actualDistributionsForRMD: "20000",
      rmdShortfallCorrectedWithinWindow: true,
    });
    expect(corrected.line57.toNumber()).toBe(0);

    const uncorrected = calculateForm5329({
      requiredMinimumDistribution: "20000",
      actualDistributionsForRMD: "25000",
    });
    expect(uncorrected.line57.toNumber()).toBe(0);
  });

  it("Form 5329 Part IX Line 57 - full missed RMD penalty at 25%", () => {
    const result = calculateForm5329({
      requiredMinimumDistribution: "30000",
      actualDistributionsForRMD: "0",
    });

    // 25% × $30,000 = $7,500
    expect(result.line57.toNumber()).toBe(7500);
  });

  it("Form 5329 Part IX Line 57 - full missed RMD penalty at reduced 10%", () => {
    const result = calculateForm5329({
      requiredMinimumDistribution: "30000",
      actualDistributionsForRMD: "0",
      rmdShortfallCorrectedWithinWindow: true,
    });

    // 10% × $30,000 = $3,000
    expect(result.line57.toNumber()).toBe(3000);
  });

  it("Form 5329 - totalAdditionalTax includes Part IX RMD penalty", () => {
    const result = calculateForm5329({
      requiredMinimumDistribution: "20000",
      actualDistributionsForRMD: "12000",
    });

    // Part I: no early distributions → $0
    // Part II: no education distributions → $0
    // Part III: no traditional IRA excess → $0
    // Part IV: no Roth excess → $0
    // Part VII: no HSA excess → $0
    // Part IX: 25% × $8,000 shortfall = $2,000
    expect(result.line4.toNumber()).toBe(0);
    expect(result.line8.toNumber()).toBe(0);
    expect(result.line17.toNumber()).toBe(0);
    expect(result.line25.toNumber()).toBe(0);
    expect(result.line49.toNumber()).toBe(0);
    expect(result.line57.toNumber()).toBe(2000);
    expect(result.totalAdditionalTax.toNumber()).toBe(2000);
  });

  it("Form 5329 - totalAdditionalTax combines all nine Parts", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "5000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      educationAccountDistributionsIncludedInIncome: "2000",
      educationAccountDistributionsExcepted: "500",
      traditionalIRACurrentYearExcessContributions: "1000",
      traditionalIRAValueDec31: "50000",
      rothIRACurrentYearExcessContributions: "500",
      rothIRAValueDec31: "40000",
      coverdellESACurrentYearExcessContributions: "400",
      coverdellESAValueDec31: "10000",
      archerMSACurrentYearExcessContributions: "300",
      archerMSAValueDec31: "8000",
      hsaCurrentYearExcessContributions: "800",
      hsaValueDec31: "20000",
      ableCurrentYearExcessContributions: "200",
      ableValueDec31: "5000",
      requiredMinimumDistribution: "10000",
      actualDistributionsForRMD: "6000",
    });

    // Part I: 10% × $5,000 = $500
    // Part II: 10% × $1,500 = $150
    // Part III: 6% × $1,000 = $60
    // Part IV: 6% × $500 = $30
    // Part V: 6% × $400 = $24
    // Part VI: 6% × $300 = $18
    // Part VII: 6% × $800 = $48
    // Part VIII: 6% × $200 = $12
    // Part IX: 25% × $4,000 = $1,000
    expect(result.line4.toNumber()).toBe(500);
    expect(result.line8.toNumber()).toBe(150);
    expect(result.line17.toNumber()).toBe(60);
    expect(result.line25.toNumber()).toBe(30);
    expect(result.line33.toNumber()).toBe(24);
    expect(result.line41.toNumber()).toBe(18);
    expect(result.line49.toNumber()).toBe(48);
    expect(result.line53.toNumber()).toBe(12);
    expect(result.line57.toNumber()).toBe(1000);
    expect(result.totalAdditionalTax.toNumber()).toBe(1842);
  });

  it("Form 5329 Part IX - no Part IX lines when RMD inputs are absent", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "5000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
    });

    expect(result.line54.toNumber()).toBe(0);
    expect(result.line55.toNumber()).toBe(0);
    expect(result.line56.toNumber()).toBe(0);
    expect(result.line57.toNumber()).toBe(0);
  });

  it("Form 5329 Part IX - negative inputs are floored at zero", () => {
    const result = calculateForm5329({
      requiredMinimumDistribution: "-5000",
      actualDistributionsForRMD: "-1000",
    });

    expect(result.line54.toNumber()).toBe(0);
    expect(result.line55.toNumber()).toBe(0);
    expect(result.line56.toNumber()).toBe(0);
    expect(result.line57.toNumber()).toBe(0);
  });

  it("Form 5329 Part IX - small shortfall penny-accurate at 25%", () => {
    const result = calculateForm5329({
      requiredMinimumDistribution: "100",
      actualDistributionsForRMD: "99",
    });

    // 25% × $1 = $0.25
    expect(result.line56.toNumber()).toBe(1);
    expect(result.line57.toNumber()).toBe(0.25);
  });

  it("Form 5329 Part IX - small shortfall penny-accurate at 10%", () => {
    const result = calculateForm5329({
      requiredMinimumDistribution: "100",
      actualDistributionsForRMD: "99",
      rmdShortfallCorrectedWithinWindow: true,
    });

    // 10% × $1 = $0.10
    expect(result.line56.toNumber()).toBe(1);
    expect(result.line57.toNumber()).toBe(0.1);
  });
});
