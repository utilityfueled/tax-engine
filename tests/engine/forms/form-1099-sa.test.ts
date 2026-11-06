/**
 * Tests for Form 1099-SA HSA distribution aggregation.
 * Spec: spec/federal/form-1099-sa.yaml
 */

import { describe, expect, it } from "vitest";
import { calculateForm1099SA, mergeForm1099SAIntoForm8889Input } from "@/engine/forms/form-1099-sa.js";
import { Form1099SASchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

describe("Form 1099-SA HSA distribution aggregation", () => {
  const result = calculateForm1099SA([
    {
      payer: "HSA Bank",
      grossDistribution: "1200",
      distributionCode: "1",
      accountType: "hsa",
    },
    {
      payer: "HSA Bank",
      grossDistribution: "400",
      earningsOnExcessContributions: "25",
      distributionCode: "2",
      accountType: "hsa",
    },
    {
      payer: "HSA Bank",
      grossDistribution: "900",
      distributionCode: "3",
      accountType: "hsa",
    },
    {
      payer: "MA MSA Custodian",
      grossDistribution: "700",
      distributionCode: "1",
      accountType: "ma_msa",
    },
  ]);

  it("Form 1099-SA Line 1 - HSA Box 1 amounts aggregate into Form 8889 Line 14a support", () => {
    const line1 = result.lines.find((line) => line.form === "Form 1099-SA" && line.line === "1");

    expect(result.hsaGrossDistributions.toNumber()).toBe(2500);
    expect(line1?.inputs["Account owner attribution status"]).toBe("all_records_unattributed");
  });

  it("Form 1099-SA Line 2 - code 2 returned excess contributions aggregate into the Form 8889 exclusion base", () => {
    expect(result.hsaReturnedExcessContributions.toNumber()).toBe(400);
  });

  it("Form 1099-SA Line 3 - code 2 Box 2 earnings become taxable other income", () => {
    expect(result.hsaReturnedExcessContributionEarnings.toNumber()).toBe(25);
  });

  it("Form 1099-SA Line 3 - mixed owner-tagged HSA records preserve Box 2 earnings by owner for auditability", () => {
    const mixedOwnerReturnedExcessResult = calculateForm1099SA([
      {
        payer: "HSA Bank",
        grossDistribution: "400",
        earningsOnExcessContributions: "25",
        distributionCode: "2",
        accountType: "hsa",
        accountHolder: "spouse",
      },
      {
        payer: "HSA Bank",
        grossDistribution: "300",
        earningsOnExcessContributions: "10",
        distributionCode: "2",
        accountType: "hsa",
        accountHolder: "primary",
      },
    ]);
    const line3 = mixedOwnerReturnedExcessResult.lines.find(
      (line) => line.form === "Form 1099-SA" && line.line === "3"
    );

    expect(mixedOwnerReturnedExcessResult.hsaReturnedExcessContributionEarnings.toNumber()).toBe(35);
    expect(mixedOwnerReturnedExcessResult.accountOwnerSupport.primary.hsaReturnedExcessContributionEarnings.toNumber()).toBe(10);
    expect(mixedOwnerReturnedExcessResult.accountOwnerSupport.spouse.hsaReturnedExcessContributionEarnings.toNumber()).toBe(25);
    expect(String(line3?.inputs["Primary-owner Box 2 returned-excess earnings"])).toBe("10");
    expect(String(line3?.inputs["Spouse-owner Box 2 returned-excess earnings"])).toBe("25");
    expect(String(line3?.inputs["Unattributed Box 2 returned-excess earnings"])).toBe("0");
  });

  it("Form 1099-SA Line 4 - code 3 disability distributions build an automatic Form 8889 exception base", () => {
    expect(result.hsaDisabilityExceptionDistributions.toNumber()).toBe(900);
  });

  const deathDistributionResult = calculateForm1099SA([
    {
      payer: "Inherited HSA Custodian",
      grossDistribution: "6600",
      fmvOnDateOfDeath: "6000",
      distributionCode: "4",
      accountType: "hsa",
    },
    {
      payer: "Inherited HSA Custodian",
      grossDistribution: "5300",
      fmvOnDateOfDeath: "5000",
      distributionCode: "6",
      accountType: "hsa",
    },
  ]);

  it("Form 1099-SA Line 5 - code 4 and code 6 death distributions use Box 4 fair market value for Form 8889 support", () => {
    expect(deathDistributionResult.hsaDeathDistributionDateOfDeathValue.toNumber()).toBe(11000);
    expect(deathDistributionResult.hsaGrossDistributions.toNumber()).toBe(11000);
  });

  it("Form 1099-SA Line 5 - estate death distributions preserve a separate subtotal for downstream Form 8889 Line 15 support", () => {
    const estateDeathDistributionResult = calculateForm1099SA([
      {
        payer: "Inherited HSA Custodian",
        grossDistribution: "6600",
        fmvOnDateOfDeath: "6000",
        distributionCode: "4",
        accountType: "hsa",
        beneficiaryRole: "estate",
      },
      {
        payer: "Inherited HSA Custodian",
        grossDistribution: "5300",
        fmvOnDateOfDeath: "5000",
        distributionCode: "6",
        accountType: "hsa",
        beneficiaryRole: "other_beneficiary",
      },
    ]);
    const merged = mergeForm1099SAIntoForm8889Input(undefined, estateDeathDistributionResult);
    const line5 = estateDeathDistributionResult.lines.find(
      (line) => line.form === "Form 1099-SA" && line.line === "5"
    );

    expect(estateDeathDistributionResult.hsaDeathDistributionDateOfDeathValue.toNumber()).toBe(11000);
    expect(estateDeathDistributionResult.hsaOtherBeneficiaryDeathDistributionDateOfDeathValue.toNumber()).toBe(5000);
    expect(estateDeathDistributionResult.hsaEstateDeathDistributionDateOfDeathValue.toNumber()).toBe(6000);
    expect(String(line5?.inputs["Other-beneficiary death-distribution amount"])).toBe("5000");
    expect(String(line5?.inputs["Estate death-distribution amount"])).toBe("6000");
    expect(merged?.supported1099SADeathDistributionDateOfDeathValue).toBe("11000");
    expect(merged?.supported1099SAOtherBeneficiaryDeathDistributionDateOfDeathValue).toBe("5000");
    expect(merged?.supported1099SAEstateDeathDistributionDateOfDeathValue).toBe("6000");
  });

  it("Form 1099-SA Line 5 - code 6 death distributions infer the non-estate beneficiary subtotal for downstream Form 8889 Line 15 support", () => {
    const inferredCode6BeneficiaryResult = calculateForm1099SA([
      {
        payer: "Inherited HSA Custodian",
        grossDistribution: "5300",
        fmvOnDateOfDeath: "5000",
        distributionCode: "6",
        accountType: "hsa",
      },
    ]);
    const merged = mergeForm1099SAIntoForm8889Input(undefined, inferredCode6BeneficiaryResult);
    const line5 = inferredCode6BeneficiaryResult.lines.find(
      (line) => line.form === "Form 1099-SA" && line.line === "5"
    );

    expect(inferredCode6BeneficiaryResult.hsaDeathDistributionDateOfDeathValue.toNumber()).toBe(5000);
    expect(inferredCode6BeneficiaryResult.hsaOtherBeneficiaryDeathDistributionDateOfDeathValue.toNumber()).toBe(5000);
    expect(inferredCode6BeneficiaryResult.hsaEstateDeathDistributionDateOfDeathValue.toNumber()).toBe(0);
    expect(String(line5?.inputs["Other-beneficiary death-distribution amount"])).toBe("5000");
    expect(String(line5?.inputs["Estate death-distribution amount"])).toBe("0");
    expect(merged?.supported1099SADeathDistributionDateOfDeathValue).toBe("5000");
    expect(merged?.supported1099SAOtherBeneficiaryDeathDistributionDateOfDeathValue).toBe("5000");
    expect(merged?.supported1099SAEstateDeathDistributionDateOfDeathValue).toBe("0");
  });

  it("Form 1099-SA Line 5 - death distributions without a validated non-estate beneficiary role stay out of the beneficiary-only Line 15 subtotal", () => {
    const unlabeledDeathDistributionResult = calculateForm1099SA([
      {
        payer: "Inherited HSA Custodian",
        grossDistribution: "6600",
        fmvOnDateOfDeath: "6000",
        distributionCode: "4",
        accountType: "hsa",
      },
    ]);
    const merged = mergeForm1099SAIntoForm8889Input(undefined, unlabeledDeathDistributionResult);

    expect(unlabeledDeathDistributionResult.hsaDeathDistributionDateOfDeathValue.toNumber()).toBe(6000);
    expect(unlabeledDeathDistributionResult.hsaOtherBeneficiaryDeathDistributionDateOfDeathValue.toNumber()).toBe(0);
    expect(merged?.supported1099SADeathDistributionDateOfDeathValue).toBe("6000");
    expect(merged?.supported1099SAOtherBeneficiaryDeathDistributionDateOfDeathValue).toBe("0");
  });

  it("Form 1099-SA Line 6 - code 4 and code 6 post-death earnings become taxable other income", () => {
    expect(deathDistributionResult.hsaPostDeathEarnings.toNumber()).toBe(900);
  });

  it("Form 1099-SA Line 6 - mixed owner-tagged death distributions preserve post-death earnings by owner for auditability", () => {
    const mixedOwnerDeathResult = calculateForm1099SA([
      {
        payer: "Inherited HSA Custodian",
        grossDistribution: "6600",
        fmvOnDateOfDeath: "6000",
        distributionCode: "4",
        accountType: "hsa",
        beneficiaryRole: "other_beneficiary",
        accountHolder: "primary",
      },
      {
        payer: "Inherited HSA Custodian",
        grossDistribution: "5300",
        fmvOnDateOfDeath: "5000",
        distributionCode: "6",
        accountType: "hsa",
        beneficiaryRole: "other_beneficiary",
        accountHolder: "spouse",
      },
    ]);
    const line6 = mixedOwnerDeathResult.lines.find(
      (line) => line.form === "Form 1099-SA" && line.line === "6"
    );

    expect(mixedOwnerDeathResult.hsaPostDeathEarnings.toNumber()).toBe(900);
    expect(mixedOwnerDeathResult.accountOwnerSupport.primary.hsaPostDeathEarnings.toNumber()).toBe(600);
    expect(mixedOwnerDeathResult.accountOwnerSupport.spouse.hsaPostDeathEarnings.toNumber()).toBe(300);
    expect(String(line6?.inputs["Primary-owner post-death earnings"])).toBe("600");
    expect(String(line6?.inputs["Spouse-owner post-death earnings"])).toBe("300");
    expect(String(line6?.inputs["Unattributed post-death earnings"])).toBe("0");
  });

  const survivingSpouseDeathDistributionResult = calculateForm1099SA([
    {
      payer: "Inherited HSA Custodian",
      grossDistribution: "6600",
      fmvOnDateOfDeath: "6000",
      distributionCode: "4",
      accountType: "hsa",
      beneficiaryRole: "surviving_spouse",
    },
  ]);

  it("Form 1099-SA surviving-spouse code 4 records stay on the ordinary Box 1 HSA path", () => {
    expect(survivingSpouseDeathDistributionResult.hsaGrossDistributions.toNumber()).toBe(6600);
    expect(survivingSpouseDeathDistributionResult.hsaDeathDistributionDateOfDeathValue.toNumber()).toBe(0);
    expect(survivingSpouseDeathDistributionResult.hsaPostDeathEarnings.toNumber()).toBe(0);
  });

  it("Form 1099-SA Line 1 - surviving-spouse records retain the actual spouse Form 8889 owner", () => {
    const parsed = Form1099SASchema.parse({
      payer: "Inherited HSA Custodian",
      grossDistribution: "6600",
      fmvOnDateOfDeath: "6000",
      distributionCode: "4",
      accountType: "hsa",
      beneficiaryRole: "surviving_spouse",
      accountHolder: "spouse",
    });
    const inferredOwnerResult = calculateForm1099SA([parsed]);
    const merged = mergeForm1099SAIntoForm8889Input(undefined, inferredOwnerResult);

    expect(parsed.accountHolder).toBe("spouse");
    expect(inferredOwnerResult.defaultAccountOwner).toBe("spouse");
    expect(merged?.accountOwner).toBe("spouse");
    expect(merged?.distributionsReceived).toBe("6600");
    expect(merged?.supported1099SADeathDistributionDateOfDeathValue).toBe("0");
  });

  it("Form 1099-SA Line 1 - after-year-of-death surviving-spouse code 1 records retain the actual spouse Form 8889 owner", () => {
    const parsed = Form1099SASchema.parse({
      payer: "Inherited HSA Custodian",
      grossDistribution: "4200",
      fmvOnDateOfDeath: "4000",
      distributionCode: "1",
      accountType: "hsa",
      beneficiaryRole: "surviving_spouse",
      accountHolder: "spouse",
      deathDistributionTiming: "after_year_of_death",
    });
    const inferredOwnerResult = calculateForm1099SA([parsed]);
    const merged = mergeForm1099SAIntoForm8889Input(undefined, inferredOwnerResult);

    expect(parsed.accountHolder).toBe("spouse");
    expect(inferredOwnerResult.hsaGrossDistributions.toNumber()).toBe(4200);
    expect(inferredOwnerResult.hsaDeathDistributionDateOfDeathValue.toNumber()).toBe(0);
    expect(inferredOwnerResult.defaultAccountOwner).toBe("spouse");
    expect(merged?.accountOwner).toBe("spouse");
    expect(merged?.distributionsReceived).toBe("4200");
    expect(merged?.supported1099SADeathDistributionDateOfDeathValue).toBe("0");
  });

  it("Form 1099-SA Line 1 - surviving-spouse code 5 records retain the actual spouse Form 8889 owner", () => {
    const parsed = Form1099SASchema.parse({
      payer: "Inherited HSA Custodian",
      grossDistribution: "2400",
      distributionCode: "5",
      accountType: "hsa",
      beneficiaryRole: "surviving_spouse",
      accountHolder: "spouse",
    });
    const inferredOwnerResult = calculateForm1099SA([parsed]);
    const merged = mergeForm1099SAIntoForm8889Input(undefined, inferredOwnerResult);

    expect(parsed.accountHolder).toBe("spouse");
    expect(inferredOwnerResult.defaultAccountOwner).toBe("spouse");
    expect(inferredOwnerResult.accountOwnerSupport.primary.hsaProhibitedTransactionDistributions.toNumber()).toBe(0);
    expect(inferredOwnerResult.accountOwnerSupport.spouse.hsaProhibitedTransactionDistributions.toNumber()).toBe(2400);
    expect(merged?.accountOwner).toBe("spouse");
    expect(merged?.distributionsReceived).toBe("2400");
    expect(merged?.supported1099SAProhibitedTransactionDistributions).toBe("2400");
  });

  it("Form 1099-SA Line 1 - actual primary surviving spouse ownership remains primary without spouse taxpayer context", () => {
    const parsed = Form1099SASchema.parse({
      payer: "Inherited HSA Custodian",
      grossDistribution: "2400",
      distributionCode: "5",
      accountType: "hsa",
      beneficiaryRole: "surviving_spouse",
      accountHolder: "primary",
    });
    const inferredOwnerResult = calculateForm1099SA([parsed]);
    const merged = mergeForm1099SAIntoForm8889Input(undefined, inferredOwnerResult, {
      ...simpleW2Fixture.taxpayer,
      filingStatus: "qualifying_surviving_spouse",
      primary: {
        ...simpleW2Fixture.taxpayer.primary,
        dateOfBirth: "1959-01-01",
      },
      spouse: undefined,
    });

    expect(inferredOwnerResult.defaultAccountOwner).toBe("primary");
    expect(merged?.accountOwner).toBe("primary");
    expect(merged?.distributionsReceived).toBe("2400");
    expect(merged?.supported1099SAGrossDistributions).toBe("2400");
    expect(merged?.supported1099SAProhibitedTransactionDistributions).toBe("2400");
    expect(merged?.distributionsNotSubjectToAdditionalTax).toBe("0");
  });

  it("Form 1099-SA Line 2 - surviving-spouse code 2 records retain the actual spouse Form 8889 owner", () => {
    const parsed = Form1099SASchema.parse({
      payer: "Inherited HSA Custodian",
      grossDistribution: "400",
      earningsOnExcessContributions: "25",
      distributionCode: "2",
      accountType: "hsa",
      beneficiaryRole: "surviving_spouse",
      accountHolder: "spouse",
    });
    const inferredOwnerResult = calculateForm1099SA([parsed]);
    const merged = mergeForm1099SAIntoForm8889Input(undefined, inferredOwnerResult);

    expect(parsed.accountHolder).toBe("spouse");
    expect(inferredOwnerResult.defaultAccountOwner).toBe("spouse");
    expect(inferredOwnerResult.accountOwnerSupport.primary.hsaReturnedExcessContributions.toNumber()).toBe(0);
    expect(inferredOwnerResult.accountOwnerSupport.spouse.hsaReturnedExcessContributions.toNumber()).toBe(400);
    expect(inferredOwnerResult.accountOwnerSupport.spouse.hsaReturnedExcessContributionEarnings.toNumber()).toBe(25);
    expect(merged?.accountOwner).toBe("spouse");
    expect(merged?.distributionsReceived).toBe("400");
    expect(merged?.supported1099SAReturnedExcessContributions).toBe("400");
  });

  it("Form 1099-SA Line 4 - surviving-spouse code 3 records retain the actual spouse Form 8889 owner", () => {
    const parsed = Form1099SASchema.parse({
      payer: "Inherited HSA Custodian",
      grossDistribution: "900",
      distributionCode: "3",
      accountType: "hsa",
      beneficiaryRole: "surviving_spouse",
      accountHolder: "spouse",
    });
    const inferredOwnerResult = calculateForm1099SA([parsed]);
    const merged = mergeForm1099SAIntoForm8889Input(undefined, inferredOwnerResult);

    expect(parsed.accountHolder).toBe("spouse");
    expect(inferredOwnerResult.defaultAccountOwner).toBe("spouse");
    expect(inferredOwnerResult.accountOwnerSupport.primary.hsaDisabilityExceptionDistributions.toNumber()).toBe(0);
    expect(inferredOwnerResult.accountOwnerSupport.spouse.hsaDisabilityExceptionDistributions.toNumber()).toBe(900);
    expect(merged?.accountOwner).toBe("spouse");
    expect(merged?.distributionsReceived).toBe("900");
    expect(merged?.supported1099SADisabilityExceptionDistributions).toBe("900");
    expect(merged?.supported1099SAAutomaticExceptionDistributions).toBe("900");
  });

  it("Form 1099-SA Line 1 - surviving spouse beneficiary can be the actual primary owner", () => {
    const parsed = Form1099SASchema.safeParse({
      payer: "Inherited HSA Custodian",
      grossDistribution: "2400",
      distributionCode: "1",
      accountType: "hsa",
      beneficiaryRole: "surviving_spouse",
      accountHolder: "primary",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.accountHolder).toBe("primary");
  });

  it("Form 1099-SA Line 1 - surviving-spouse metadata rejects unsupported code 6 records", () => {
    const parsed = Form1099SASchema.safeParse({
      payer: "Inherited HSA Custodian",
      grossDistribution: "2400",
      fmvOnDateOfDeath: "2200",
      distributionCode: "6",
      accountType: "hsa",
      beneficiaryRole: "surviving_spouse",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => (
      issue.path.join(".") === "beneficiaryRole"
      && /code 1 after the year of death/i.test(issue.message)
    ))).toBe(true);
  });

  it("Form 1099-SA Line 1 - trustee-to-trustee transfers are rejected because they are not reportable distributions", () => {
    const parsed = Form1099SASchema.safeParse({
      payer: "HSA Bank",
      grossDistribution: "2400",
      distributionCode: "1",
      accountType: "hsa",
      trusteeToTrusteeTransfer: true,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => (
      issue.path.join(".") === "trusteeToTrusteeTransfer"
      && /not reported on Form 1099-SA/i.test(issue.message)
      && /line 14a/i.test(issue.message)
    ))).toBe(true);
  });

  it("Form 1099-SA Line 5 - ordinary non-death HSA records reject Box 4 fair market value input", () => {
    const parsed = Form1099SASchema.safeParse({
      payer: "HSA Bank",
      grossDistribution: "2400",
      fmvOnDateOfDeath: "2200",
      distributionCode: "1",
      accountType: "hsa",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => (
      issue.path.join(".") === "fmvOnDateOfDeath"
      && /only allowed/i.test(issue.message)
      && /codes 4 and 6/i.test(issue.message)
    ))).toBe(true);
  });

  it("Form 1099-SA Line 5 - surviving-spouse code 1 records require after-year-of-death timing before Box 4 is allowed", () => {
    const parsed = Form1099SASchema.safeParse({
      payer: "Inherited HSA Custodian",
      grossDistribution: "4200",
      fmvOnDateOfDeath: "4000",
      distributionCode: "1",
      accountType: "hsa",
      beneficiaryRole: "surviving_spouse",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => (
      issue.path.join(".") === "fmvOnDateOfDeath"
      && /after-year-of-death surviving spouse code 1/i.test(issue.message)
    ))).toBe(true);
  });

  it("Form 1099-SA Line 1 - nonspouse beneficiary metadata rejects unsupported ordinary HSA codes", () => {
    const otherBeneficiary = Form1099SASchema.safeParse({
      payer: "Inherited HSA Custodian",
      grossDistribution: "2400",
      distributionCode: "1",
      accountType: "hsa",
      beneficiaryRole: "other_beneficiary",
    });
    const estate = Form1099SASchema.safeParse({
      payer: "Estate HSA Custodian",
      grossDistribution: "2400",
      distributionCode: "5",
      accountType: "hsa",
      beneficiaryRole: "estate",
    });

    expect(otherBeneficiary.success).toBe(false);
    expect(estate.success).toBe(false);
    expect(otherBeneficiary.error?.issues.some((issue) => (
      issue.path.join(".") === "beneficiaryRole"
      && /codes 4 or 6/i.test(issue.message)
    ))).toBe(true);
    expect(estate.error?.issues.some((issue) => (
      issue.path.join(".") === "beneficiaryRole"
      && /codes 4 or 6/i.test(issue.message)
    ))).toBe(true);
  });

  it("Form 1099-SA Line 1 - year-of-death nonspouse beneficiary metadata rejects code 6", () => {
    const parsed = Form1099SASchema.safeParse({
      payer: "Inherited HSA Custodian",
      grossDistribution: "2400",
      fmvOnDateOfDeath: "2200",
      distributionCode: "6",
      accountType: "hsa",
      beneficiaryRole: "other_beneficiary",
      deathDistributionTiming: "year_of_death",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => (
      issue.path.join(".") === "distributionCode"
      && /year[- ]of[- ]death/i.test(issue.message)
      && /code 4/i.test(issue.message)
    ))).toBe(true);
  });

  it("Form 1099-SA Line 1 - estate beneficiary metadata rejects code 6 even after the year of death", () => {
    const parsed = Form1099SASchema.safeParse({
      payer: "Estate HSA Custodian",
      grossDistribution: "2400",
      fmvOnDateOfDeath: "2200",
      distributionCode: "6",
      accountType: "hsa",
      beneficiaryRole: "estate",
      deathDistributionTiming: "after_year_of_death",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => (
      issue.path.join(".") === "distributionCode"
      && /estate/i.test(issue.message)
      && /code 4/i.test(issue.message)
    ))).toBe(true);
  });

  it("Form 1099-SA Line 1 - after-year-of-death nonspouse beneficiary metadata preserves code 6 timing metadata", () => {
    const parsed = Form1099SASchema.parse({
      payer: "Inherited HSA Custodian",
      grossDistribution: "8400",
      fmvOnDateOfDeath: "6000",
      distributionCode: "6",
      accountType: "hsa",
      beneficiaryRole: "other_beneficiary",
      deathDistributionTiming: "after_year_of_death",
    });

    expect(parsed.deathDistributionTiming).toBe("after_year_of_death");
    const result = calculateForm1099SA([parsed]);
    expect(result.hsaDeathDistributionDateOfDeathValue.toNumber()).toBe(6000);
    expect(result.hsaPostDeathEarnings.toNumber()).toBe(2400);
  });

  it("Form 1099-SA Line 2 - surviving-spouse code 2 records retain the actual spouse Form 8889 owner", () => {
    const parsed = Form1099SASchema.parse({
      payer: "Inherited HSA Custodian",
      grossDistribution: "400",
      earningsOnExcessContributions: "25",
      distributionCode: "2",
      accountType: "hsa",
      beneficiaryRole: "surviving_spouse",
      accountHolder: "spouse",
    });
    const inferredOwnerResult = calculateForm1099SA([parsed]);
    const merged = mergeForm1099SAIntoForm8889Input(undefined, inferredOwnerResult);

    expect(parsed.accountHolder).toBe("spouse");
    expect(inferredOwnerResult.defaultAccountOwner).toBe("spouse");
    expect(inferredOwnerResult.accountOwnerSupport.primary.hsaGrossDistributions.toNumber()).toBe(0);
    expect(inferredOwnerResult.accountOwnerSupport.spouse.hsaGrossDistributions.toNumber()).toBe(400);
    expect(inferredOwnerResult.accountOwnerSupport.spouse.hsaReturnedExcessContributions.toNumber()).toBe(400);
    expect(merged?.accountOwner).toBe("spouse");
    expect(merged?.distributionsReceived).toBe("400");
    expect(merged?.supported1099SAReturnedExcessContributions).toBe("400");
  });

  it("Form 1099-SA Line 4 - surviving-spouse code 3 records retain the actual spouse Form 8889 owner", () => {
    const parsed = Form1099SASchema.parse({
      payer: "Inherited HSA Custodian",
      grossDistribution: "900",
      distributionCode: "3",
      accountType: "hsa",
      beneficiaryRole: "surviving_spouse",
      accountHolder: "spouse",
    });
    const inferredOwnerResult = calculateForm1099SA([parsed]);
    const merged = mergeForm1099SAIntoForm8889Input(undefined, inferredOwnerResult);

    expect(parsed.accountHolder).toBe("spouse");
    expect(inferredOwnerResult.defaultAccountOwner).toBe("spouse");
    expect(inferredOwnerResult.accountOwnerSupport.primary.hsaGrossDistributions.toNumber()).toBe(0);
    expect(inferredOwnerResult.accountOwnerSupport.spouse.hsaGrossDistributions.toNumber()).toBe(900);
    expect(inferredOwnerResult.accountOwnerSupport.spouse.hsaDisabilityExceptionDistributions.toNumber()).toBe(900);
    expect(merged?.accountOwner).toBe("spouse");
    expect(merged?.distributionsReceived).toBe("900");
    expect(merged?.supported1099SADisabilityExceptionDistributions).toBe("900");
    expect(merged?.supported1099SAAutomaticExceptionDistributions).toBe("900");
  });

  const prohibitedTransactionResult = calculateForm1099SA([
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
  ]);

  it("Form 1099-SA Line 7 - code 5 prohibited transactions build a deemed-distribution amount that cannot be offset by medical expenses", () => {
    expect(prohibitedTransactionResult.hsaGrossDistributions.toNumber()).toBe(3000);
    expect(prohibitedTransactionResult.hsaProhibitedTransactionDistributions.toNumber()).toBe(2400);
  });

  it("Form 1099-SA Line 7 - mixed owner-tagged prohibited transactions preserve owner and unattributed subtotals in the audit trail", () => {
    const mixedOwnerProhibitedTransactionResult = calculateForm1099SA([
      {
        payer: "HSA Bank",
        grossDistribution: "300",
        distributionCode: "5",
        accountType: "hsa",
        accountHolder: "primary",
      },
      {
        payer: "HSA Bank",
        grossDistribution: "400",
        distributionCode: "5",
        accountType: "hsa",
        accountHolder: "spouse",
      },
      {
        payer: "HSA Bank",
        grossDistribution: "200",
        distributionCode: "5",
        accountType: "hsa",
      },
    ]);

    const line7 = mixedOwnerProhibitedTransactionResult.lines.find(
      (line) => line.form === "Form 1099-SA" && line.line === "7"
    );

    expect(mixedOwnerProhibitedTransactionResult.hsaProhibitedTransactionDistributions.toNumber()).toBe(900);
    expect(mixedOwnerProhibitedTransactionResult.accountOwnerSupport.primary.hsaProhibitedTransactionDistributions.toNumber())
      .toBe(300);
    expect(mixedOwnerProhibitedTransactionResult.accountOwnerSupport.spouse.hsaProhibitedTransactionDistributions.toNumber())
      .toBe(400);
    expect(mixedOwnerProhibitedTransactionResult.unattributedSupport.hsaProhibitedTransactionDistributions.toNumber())
      .toBe(200);
    expect(String(line7?.inputs["Primary-owner code 5 deemed distributions"])).toBe("300");
    expect(String(line7?.inputs["Spouse-owner code 5 deemed distributions"])).toBe("400");
    expect(String(line7?.inputs["Unattributed code 5 deemed distributions"])).toBe("200");
  });

  it("calculateForm1099SA defensively ignores trustee-to-trustee transfers if validation is bypassed", () => {
    const result = calculateForm1099SA([
      {
        payer: "HSA Bank",
        grossDistribution: "2400",
        distributionCode: "1",
        accountType: "hsa",
        trusteeToTrusteeTransfer: true,
      },
      {
        payer: "HSA Bank",
        grossDistribution: "600",
        distributionCode: "1",
        accountType: "hsa",
      },
    ]);

    expect(result.hsaGrossDistributions.toNumber()).toBe(600);
    expect(result.hsaReturnedExcessContributions.toNumber()).toBe(0);
    const line1 = result.lines.find((line) => line.form === "Form 1099-SA" && line.line === "1");
    expect(line1?.value.toString()).toBe("600");
  });

  it("mergeForm1099SAIntoForm8889Input preserves 1099-SA support subtotals for downstream Form 8889 audit trail", () => {
    const merged = mergeForm1099SAIntoForm8889Input(undefined, deathDistributionResult);

    expect(merged?.supported1099SAGrossDistributions).toBe("11000");
    expect(merged?.supported1099SAReturnedExcessContributions).toBe("0");
    expect(merged?.supported1099SADeathDistributionDateOfDeathValue).toBe("11000");
    expect(merged?.supported1099SAAutomaticExceptionDistributions).toBe("11000");
    expect(merged?.supported1099SAProhibitedTransactionDistributions).toBe("0");
  });

  it("mergeForm1099SAIntoForm8889Input defaults the generated Form 8889 account owner from consistent HSA holder metadata", () => {
    const spouseOwnedResult = calculateForm1099SA([
      {
        payer: "Inherited HSA Custodian",
        grossDistribution: "6600",
        fmvOnDateOfDeath: "6000",
        distributionCode: "4",
        accountType: "hsa",
        beneficiaryRole: "surviving_spouse",
        accountHolder: "spouse",
      },
    ]);

    const merged = mergeForm1099SAIntoForm8889Input(undefined, spouseOwnedResult);

    expect(merged?.accountOwner).toBe("spouse");
    expect(merged?.distributionsReceived).toBe("6600");
  });

  it("mergeForm1099SAIntoForm8889Input auto-builds a primary-owned Form 8889 from fully unattributed single-filer HSA records", () => {
    const untaggedResult = calculateForm1099SA([
      {
        payer: "HSA Bank",
        grossDistribution: "1200",
        distributionCode: "1",
        accountType: "hsa",
      },
    ]);

    const merged = mergeForm1099SAIntoForm8889Input(undefined, untaggedResult, simpleW2Fixture.taxpayer);

    expect(untaggedResult.defaultAccountOwner).toBeUndefined();
    expect(merged?.accountOwner).toBe("primary");
    expect(merged?.distributionsReceived).toBe("1200");
    expect(merged?.supported1099SAGrossDistributions).toBe("1200");
  });

  it("mergeForm1099SAIntoForm8889Input keeps an explicit primary-owner draft on the primary path when surviving-spouse sources explicitly identify spouse-owned HSA support", () => {
    const spouseOwnedResult = calculateForm1099SA([
      {
        payer: "Inherited HSA Custodian",
        grossDistribution: "6600",
        fmvOnDateOfDeath: "6000",
        distributionCode: "4",
        accountType: "hsa",
        beneficiaryRole: "surviving_spouse",
      accountHolder: "spouse",
      },
    ]);

    const merged = mergeForm1099SAIntoForm8889Input({
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "4300",
    }, spouseOwnedResult, {
      ...simpleW2Fixture.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "Pat",
        lastName: "Example",
        ssn: "987-65-4321",
        dateOfBirth: "1959-01-01",
      },
    });

    expect(spouseOwnedResult.defaultAccountOwner).toBe("spouse");
    expect(spouseOwnedResult.accountOwnerSupport.primary.hsaGrossDistributions.toNumber()).toBe(0);
    expect(spouseOwnedResult.accountOwnerSupport.spouse.hsaGrossDistributions.toNumber()).toBe(6600);
    expect(merged?.accountOwner).toBe("primary");
    expect(merged?.distributionsReceived).toBe("0");
    expect(merged?.supported1099SAGrossDistributions).toBe("0");
  });

  it("Form 1099-SA Line 1 - stale spouse-owned Form 8889 drafts require actual spouse context", () => {
    const spouseOwnedResult = calculateForm1099SA([
      {
        payer: "Inherited HSA Custodian",
        grossDistribution: "6600",
        fmvOnDateOfDeath: "6000",
        distributionCode: "4",
        accountType: "hsa",
        beneficiaryRole: "surviving_spouse",
        accountHolder: "spouse",
      },
      {
        payer: "Inherited HSA Custodian",
        grossDistribution: "900",
        distributionCode: "3",
        accountType: "hsa",
        beneficiaryRole: "surviving_spouse",
        accountHolder: "spouse",
      },
    ]);

    expect(() => mergeForm1099SAIntoForm8889Input({
      accountOwner: "spouse",
      coverageByMonth: Array(12).fill("none"),
      contributionsMade: "0",
    }, spouseOwnedResult, simpleW2Fixture.taxpayer)).toThrow(/actual spouse taxpayer context/);
    expect(spouseOwnedResult.accountOwnerSupport.spouse.hsaGrossDistributions.toFixed()).toBe("7500");
  });

  it("mergeForm1099SAIntoForm8889Input does not auto-build a single Form 8889 from mixed primary and spouse HSA records", () => {
    const mixedOwnerResult = calculateForm1099SA([
      {
        payer: "HSA Bank",
        grossDistribution: "1200",
        distributionCode: "1",
        accountType: "hsa",
        accountHolder: "primary",
      },
      {
        payer: "HSA Bank",
        grossDistribution: "900",
        distributionCode: "1",
        accountType: "hsa",
        accountHolder: "spouse",
      },
    ]);

    const merged = mergeForm1099SAIntoForm8889Input(undefined, mixedOwnerResult);

    expect(mixedOwnerResult.defaultAccountOwner).toBeUndefined();
    expect(merged).toBeUndefined();

    const line1 = mixedOwnerResult.lines.find((line) => line.form === "Form 1099-SA" && line.line === "1");
    expect(line1?.inputs["Account owner attribution status"]).toBe("mixed_tagged_owners_manual");
  });

  it("mergeForm1099SAIntoForm8889Input keeps fully untagged married-return HSA records manual when spouse context exists", () => {
    const untaggedJointReturnResult = calculateForm1099SA([
      {
        payer: "HSA Bank",
        grossDistribution: "1200",
        distributionCode: "1",
        accountType: "hsa",
      },
      {
        payer: "HSA Bank",
        grossDistribution: "900",
        distributionCode: "1",
        accountType: "hsa",
      },
    ]);

    const merged = mergeForm1099SAIntoForm8889Input(undefined, untaggedJointReturnResult, {
      ...simpleW2Fixture.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "Alex",
        lastName: "Doe",
        ssn: "234-56-7890",
        dateOfBirth: "1992-04-02",
      },
    });

    expect(untaggedJointReturnResult.hsaGrossDistributions.toNumber()).toBe(2100);
    expect(untaggedJointReturnResult.defaultAccountOwner).toBeUndefined();
    expect(merged).toBeUndefined();
  });

  it("mergeForm1099SAIntoForm8889Input leaves ordinary untagged HSA records manual once tagged owner metadata is present", () => {
    const mixedTaggedAndUntaggedResult = calculateForm1099SA([
      {
        payer: "HSA Bank",
        grossDistribution: "300",
        distributionCode: "1",
        accountType: "hsa",
      },
      {
        payer: "HSA Bank",
        grossDistribution: "900",
        distributionCode: "1",
        accountType: "hsa",
        accountHolder: "spouse",
      },
    ]);

    const primaryMerged = mergeForm1099SAIntoForm8889Input({
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("none"),
      contributionsMade: "0",
    }, mixedTaggedAndUntaggedResult, {
      ...simpleW2Fixture.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "Alex",
        lastName: "Doe",
        ssn: "234-56-7890",
        dateOfBirth: "1992-04-02",
      },
    });
    const spouseMerged = mergeForm1099SAIntoForm8889Input({
      accountOwner: "spouse",
      coverageByMonth: Array(12).fill("none"),
      contributionsMade: "0",
    }, mixedTaggedAndUntaggedResult, {
      ...simpleW2Fixture.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "Alex",
        lastName: "Doe",
        ssn: "234-56-7890",
        dateOfBirth: "1992-04-02",
      },
    });

    expect(mixedTaggedAndUntaggedResult.hsaGrossDistributions.toNumber()).toBe(1200);
    expect(mixedTaggedAndUntaggedResult.defaultAccountOwner).toBeUndefined();
    expect(mixedTaggedAndUntaggedResult.accountOwnerSupport.primary.hsaGrossDistributions.toNumber()).toBe(0);
    expect(mixedTaggedAndUntaggedResult.accountOwnerSupport.spouse.hsaGrossDistributions.toNumber()).toBe(900);
    expect(primaryMerged?.supported1099SAGrossDistributions).toBe("0");
    expect(primaryMerged?.distributionsReceived).toBe("0");
    expect(spouseMerged?.supported1099SAGrossDistributions).toBe("900");
    expect(spouseMerged?.distributionsReceived).toBe("900");

    const line1 = mixedTaggedAndUntaggedResult.lines.find((line) => line.form === "Form 1099-SA" && line.line === "1");
    expect(line1?.inputs["Account owner attribution status"]).toBe("mixed_tagged_and_untagged_manual");
  });

  it("mergeForm1099SAIntoForm8889Input scopes supported subtotals to the explicitly selected owner when HSA records are mixed", () => {
    const mixedOwnerResult = calculateForm1099SA([
      {
        payer: "HSA Bank",
        grossDistribution: "1200",
        distributionCode: "1",
        accountType: "hsa",
        accountHolder: "primary",
      },
      {
        payer: "HSA Bank",
        grossDistribution: "400",
        earningsOnExcessContributions: "25",
        distributionCode: "2",
        accountType: "hsa",
        accountHolder: "spouse",
      },
      {
        payer: "HSA Bank",
        grossDistribution: "900",
        distributionCode: "3",
        accountType: "hsa",
        accountHolder: "spouse",
      },
      {
        payer: "HSA Bank",
        grossDistribution: "300",
        distributionCode: "5",
        accountType: "hsa",
        accountHolder: "spouse",
      },
    ]);

    const merged = mergeForm1099SAIntoForm8889Input({
      accountOwner: "spouse",
      coverageByMonth: Array(12).fill("none"),
      contributionsMade: "0",
    }, mixedOwnerResult);

    expect(merged?.accountOwner).toBe("spouse");
    expect(merged?.distributionsReceived).toBe("1600");
    expect(mixedOwnerResult.accountOwnerSupport.primary.hsaReturnedExcessContributionEarnings.toNumber()).toBe(0);
    expect(mixedOwnerResult.accountOwnerSupport.spouse.hsaReturnedExcessContributionEarnings.toNumber()).toBe(25);
    expect(merged?.supported1099SAGrossDistributions).toBe("1600");
    expect(merged?.supported1099SAReturnedExcessContributions).toBe("400");
    expect(merged?.supported1099SADisabilityExceptionDistributions).toBe("900");
    expect(merged?.supported1099SAAutomaticExceptionDistributions).toBe("900");
    expect(merged?.supported1099SAProhibitedTransactionDistributions).toBe("300");
  });

  it("mergeForm1099SAIntoForm8889Input keeps an already-inclusive Form 8889 Line 17a amount instead of re-adding the same disability subtotal", () => {
    const disabilityResult = calculateForm1099SA([
      {
        payer: "HSA Bank",
        grossDistribution: "1200",
        distributionCode: "3",
        accountType: "hsa",
      },
    ]);

    const merged = mergeForm1099SAIntoForm8889Input({
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      distributionsNotSubjectToAdditionalTax: "1400",
    }, disabilityResult);

    expect(merged?.distributionsNotSubjectToAdditionalTax).toBe("1400");
    expect(merged?.supported1099SADisabilityExceptionDistributions).toBe("1200");
    expect(merged?.supported1099SAAutomaticExceptionDistributions).toBe("1200");
  });

  it("mergeForm1099SAIntoForm8889Input rejects stale spouse-owner drafts when spouse taxpayer context is absent", () => {
    const spouseOwnedResult = calculateForm1099SA([
      {
        payer: "Inherited HSA Custodian",
        grossDistribution: "6600",
        fmvOnDateOfDeath: "6000",
        distributionCode: "4",
        accountType: "hsa",
        beneficiaryRole: "surviving_spouse",
        accountHolder: "spouse",
      },
    ]);

    expect(() => mergeForm1099SAIntoForm8889Input({
      accountOwner: "spouse",
      coverageByMonth: Array(12).fill("none"),
      contributionsMade: "0",
    }, spouseOwnedResult, simpleW2Fixture.taxpayer)).toThrow(/actual spouse taxpayer context/);
    expect(spouseOwnedResult.accountOwnerSupport.spouse.hsaGrossDistributions.toFixed()).toBe("6600");
  });
});
