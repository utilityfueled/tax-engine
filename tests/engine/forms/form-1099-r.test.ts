/**
 * Tests for Form 1099-R retirement distribution aggregation.
 * Spec: spec/federal/form-1099-r.yaml
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm1099R } from "@/engine/forms/form-1099-r.js";
import { Form1099RSchema } from "@/models/inputs.js";

describe("Form 1099-R retirement distribution aggregation", () => {
  it("Form 1099-R Box 7 - Roth code Q and code T entries reject extra distribution codes", () => {
    const codeQ = Form1099RSchema.safeParse({
      payer: "Roth IRA Custodian",
      grossDistribution: "18000",
      federalWithheld: "0",
      distributionCode: "Q8",
      iraSepSimple: true,
    });
    const codeT = Form1099RSchema.safeParse({
      payer: "Roth IRA Custodian",
      grossDistribution: "9000",
      federalWithheld: "0",
      distributionCode: "TJ",
      iraSepSimple: true,
    });

    expect(codeQ.success).toBe(false);
    expect(codeT.success).toBe(false);
    expect(codeQ.error?.issues[0]?.message).toContain("Code Q");
    expect(codeT.error?.issues[0]?.message).toContain("Code T");
  });

  it("Form 1099-R Box 7 - code J only combines with code 8, P, or S", () => {
    const allowedReturnedContribution = Form1099RSchema.safeParse({
      payer: "Roth IRA Custodian",
      grossDistribution: "6500",
      taxableAmount: "500",
      federalWithheld: "0",
      distributionCode: "J8",
      iraSepSimple: true,
      returnedContributionByDueDate: true,
    });
    const disallowedCombination = Form1099RSchema.safeParse({
      payer: "Roth IRA Custodian",
      grossDistribution: "9000",
      federalWithheld: "0",
      distributionCode: "JG",
      iraSepSimple: true,
    });

    expect(allowedReturnedContribution.success).toBe(true);
    expect(disallowedCombination.success).toBe(false);
    expect(disallowedCombination.error?.issues[0]?.message).toContain("Code J");
  });

  it("Form 1099-R Box 7 - validated qualified Roth distribution support applies to Roth IRA code J or code T records", () => {
    const allowedCodeJDistribution = Form1099RSchema.safeParse({
      payer: "Roth IRA Custodian",
      grossDistribution: "9000",
      federalWithheld: "0",
      distributionCode: "J",
      iraSepSimple: true,
      qualifiedRothDistribution: true,
    });
    const allowedCodeTDistribution = Form1099RSchema.safeParse({
      payer: "Roth IRA Custodian",
      grossDistribution: "9000",
      federalWithheld: "0",
      distributionCode: "T",
      iraSepSimple: true,
      qualifiedRothDistribution: true,
    });
    const disallowedCodeQDistribution = Form1099RSchema.safeParse({
      payer: "Roth IRA Custodian",
      grossDistribution: "9000",
      federalWithheld: "0",
      distributionCode: "Q",
      iraSepSimple: true,
      qualifiedRothDistribution: true,
    });

    expect(allowedCodeJDistribution.success).toBe(true);
    expect(allowedCodeTDistribution.success).toBe(true);
    expect(disallowedCodeQDistribution.success).toBe(false);
    expect(disallowedCodeQDistribution.error?.issues[0]?.message).toContain("code J or code T record, or a designated Roth account Box 7 code B record");
  });

  it("Form 1099-R Box 7 - validated qualified Roth distribution support rejects code J records paired with corrective or SIMPLE companions", () => {
    const disallowedCodeJ8Distribution = Form1099RSchema.safeParse({
      payer: "Roth IRA Custodian",
      grossDistribution: "6500",
      taxableAmount: "500",
      federalWithheld: "0",
      distributionCode: "J8",
      iraSepSimple: true,
      qualifiedRothDistribution: true,
    });
    const disallowedCodeJPDistribution = Form1099RSchema.safeParse({
      payer: "Roth IRA Custodian",
      grossDistribution: "6500",
      taxableAmount: "500",
      federalWithheld: "0",
      distributionCode: "JP",
      iraSepSimple: true,
      qualifiedRothDistribution: true,
    });
    const disallowedCodeJSDistribution = Form1099RSchema.safeParse({
      payer: "Roth IRA Custodian",
      grossDistribution: "6500",
      taxableAmount: "500",
      federalWithheld: "0",
      distributionCode: "JS",
      iraSepSimple: true,
      qualifiedRothDistribution: true,
    });

    expect(disallowedCodeJ8Distribution.success).toBe(false);
    expect(disallowedCodeJPDistribution.success).toBe(false);
    expect(disallowedCodeJSDistribution.success).toBe(false);
    expect(disallowedCodeJ8Distribution.error?.issues[0]?.message).toContain("standalone Box 7 code J");
    expect(disallowedCodeJPDistribution.error?.issues[0]?.message).toContain("standalone Box 7 code J");
    expect(disallowedCodeJSDistribution.error?.issues[0]?.message).toContain("standalone Box 7 code J");
  });

  it("Form 1099-R Box 7 - validated qualified Roth distribution support also applies to designated Roth account code B records", () => {
    const allowedCodeBDistribution = Form1099RSchema.safeParse({
      payer: "Employer 401(k) Plan",
      grossDistribution: "9000",
      federalWithheld: "0",
      distributionCode: "B",
      iraSepSimple: false,
      qualifiedRothDistribution: true,
    });

    expect(allowedCodeBDistribution.success).toBe(true);
  });

  it("Form 1099-R Box 7 - validated Roth IRA rollover support only applies to Roth IRA code J, Q, or T records and cannot exceed gross", () => {
    const allowedCodeJDistribution = Form1099RSchema.safeParse({
      payer: "Roth IRA Custodian",
      grossDistribution: "9000",
      federalWithheld: "0",
      distributionCode: "J",
      iraSepSimple: true,
      rothIraRolledOverAmount: "7500",
    });
    const disallowedCode7Distribution = Form1099RSchema.safeParse({
      payer: "Traditional IRA Custodian",
      grossDistribution: "9000",
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: true,
      rothIraRolledOverAmount: "7500",
    });
    const disallowedOverflow = Form1099RSchema.safeParse({
      payer: "Roth IRA Custodian",
      grossDistribution: "9000",
      federalWithheld: "0",
      distributionCode: "T",
      iraSepSimple: true,
      rothIraRolledOverAmount: "9500",
    });

    expect(allowedCodeJDistribution.success).toBe(true);
    expect(disallowedCode7Distribution.success).toBe(false);
    expect(disallowedOverflow.success).toBe(false);
    expect(disallowedCode7Distribution.error?.issues[0]?.message).toContain("code J, Q, or T");
    expect(disallowedOverflow.error?.issues[0]?.message).toContain("cannot exceed the gross distribution");
  });

  it("Form 1099-R Box 7 - code Y only combines with code 4, 7, or K", () => {
    const allowedQcd = Form1099RSchema.safeParse({
      payer: "Traditional IRA Custodian",
      grossDistribution: "12000",
      federalWithheld: "0",
      distributionCode: "Y7",
      iraSepSimple: false,
    });
    const disallowedCombination = Form1099RSchema.safeParse({
      payer: "Traditional IRA Custodian",
      grossDistribution: "12000",
      federalWithheld: "0",
      distributionCode: "YJ",
      iraSepSimple: false,
    });

    expect(allowedQcd.success).toBe(true);
    expect(disallowedCombination.success).toBe(false);
    expect(disallowedCombination.error?.issues.some((issue) => issue.message.includes("Code Y"))).toBe(true);
  });

  it("Form 1099-R local owner metadata accepts taxpayer-versus-spouse tags", () => {
    const spouseTaggedForm = Form1099RSchema.safeParse({
      payer: "IRA Custodian",
      grossDistribution: "12000",
      taxableAmount: "12000",
      federalWithheld: "0",
      distributionCode: "5",
      iraSepSimple: true,
      accountHolder: "spouse",
    });

    expect(spouseTaggedForm.success).toBe(true);
  });

  it("Form 1099-R Box 7 - public safety and firefighter exception metadata only applies to non-IRA code 1 qualified-plan distributions", () => {
    const allowedQualifiedPlanDistribution = Form1099RSchema.safeParse({
      payer: "Former Employer Pension",
      grossDistribution: "18000",
      taxableAmount: "18000",
      federalWithheld: "0",
      distributionCode: "1",
      iraSepSimple: false,
      qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies: true,
    });
    const disallowedGovernmental457bDistribution = Form1099RSchema.safeParse({
      payer: "Governmental 457(b) Plan",
      grossDistribution: "18000",
      taxableAmount: "18000",
      federalWithheld: "0",
      distributionCode: "1",
      iraSepSimple: false,
      eligibleGovernmental457bPlan: true,
      qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies: true,
    });
    const disallowedCode2Distribution = Form1099RSchema.safeParse({
      payer: "Former Employer Pension",
      grossDistribution: "18000",
      taxableAmount: "18000",
      federalWithheld: "0",
      distributionCode: "2",
      iraSepSimple: false,
      qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies: true,
    });

    expect(allowedQualifiedPlanDistribution.success).toBe(true);
    expect(disallowedGovernmental457bDistribution.success).toBe(false);
    expect(disallowedCode2Distribution.success).toBe(false);
    expect(disallowedGovernmental457bDistribution.error?.issues[0]?.message).toContain("457(b)");
    expect(disallowedCode2Distribution.error?.issues[0]?.message).toContain("Box 7 code 1");
  });

  it("Form 1099-R Box 7 - terminal-illness exception metadata only applies to non-IRA code 1 qualified-plan distributions", () => {
    const allowedQualifiedPlanDistribution = Form1099RSchema.safeParse({
      payer: "Former Employer Pension",
      grossDistribution: "18000",
      taxableAmount: "18000",
      federalWithheld: "0",
      distributionCode: "1",
      iraSepSimple: false,
      terminalIllnessExceptionApplies: true,
    });
    const disallowedIraDistribution = Form1099RSchema.safeParse({
      payer: "Traditional IRA Custodian",
      grossDistribution: "18000",
      taxableAmount: "18000",
      federalWithheld: "0",
      distributionCode: "1",
      iraSepSimple: true,
      terminalIllnessExceptionApplies: true,
    });
    const disallowedGovernmental457bDistribution = Form1099RSchema.safeParse({
      payer: "Governmental 457(b) Plan",
      grossDistribution: "18000",
      taxableAmount: "18000",
      federalWithheld: "0",
      distributionCode: "1",
      iraSepSimple: false,
      eligibleGovernmental457bPlan: true,
      terminalIllnessExceptionApplies: true,
    });
    const disallowedCode2Distribution = Form1099RSchema.safeParse({
      payer: "Former Employer Pension",
      grossDistribution: "18000",
      taxableAmount: "18000",
      federalWithheld: "0",
      distributionCode: "2",
      iraSepSimple: false,
      terminalIllnessExceptionApplies: true,
    });

    expect(allowedQualifiedPlanDistribution.success).toBe(true);
    expect(disallowedIraDistribution.success).toBe(false);
    expect(disallowedGovernmental457bDistribution.success).toBe(false);
    expect(disallowedCode2Distribution.success).toBe(false);
    expect(disallowedIraDistribution.error?.issues[0]?.message).toContain("non-IRA qualified-plan");
    expect(disallowedGovernmental457bDistribution.error?.issues[0]?.message).toContain("457(b)");
    expect(disallowedCode2Distribution.error?.issues[0]?.message).toContain("Box 7 code 1");
  });

  it("Form 1099-R Box 7 - retired public safety officer premiums stay allowed on disability pensions taxed as wages", () => {
    const disabilityPensionWithPremiums = Form1099RSchema.safeParse({
      payer: "State Disability Retirement",
      grossDistribution: "12000",
      taxableAmount: "9000",
      federalWithheld: "0",
      distributionCode: "3",
      iraSepSimple: false,
      disabilityPensionBeforeMinimumRetirementAge: true,
      retiredPublicSafetyOfficerInsurancePremiums: "2500",
    });

    expect(disabilityPensionWithPremiums.success).toBe(true);
  });

  it("Form 1099-R Line 1 - IRA gross total reported only when needed", () => {
    const fullyTaxableOnly = calculateForm1099R([
      {
        payer: "Traditional IRA Custodian",
        grossDistribution: "9000",
        taxableAmount: "9000",
        federalWithheld: "900",
        distributionCode: "7",
        iraSepSimple: true,
      },
    ]);
    expect(fullyTaxableOnly.iraGrossReported.toNumber()).toBe(0);

    const includesRollover = calculateForm1099R([
      {
        payer: "Traditional IRA Custodian",
        grossDistribution: "9000",
        taxableAmount: "9000",
        federalWithheld: "900",
        distributionCode: "7",
        iraSepSimple: true,
      },
      {
        payer: "401k Plan",
        grossDistribution: "15000",
        federalWithheld: "0",
        distributionCode: "G",
        iraSepSimple: true,
      },
    ]);
    expect(includesRollover.iraGrossReported.toNumber()).toBe(24000);
  });

  it("Form 1099-R Line 2 - IRA taxable total uses Box 2a", () => {
    const result = calculateForm1099R([
      {
        payer: "Traditional IRA Custodian",
        grossDistribution: "12000",
        taxableAmount: "7000",
        federalWithheld: "700",
        distributionCode: "7",
        iraSepSimple: true,
      },
    ]);

    expect(result.iraTaxable.toNumber()).toBe(7000);
  });

  it("Form 1099-R Line 2 - taxable IRA rollover follows Box 2a and still reports gross", () => {
    const result = calculateForm1099R([
      {
        payer: "Traditional IRA Custodian",
        grossDistribution: "10000",
        taxableAmount: "10000",
        federalWithheld: "0",
        distributionCode: "G",
        iraSepSimple: true,
      },
    ]);

    expect(result.iraGrossReported.toNumber()).toBe(10000);
    expect(result.iraTaxable.toNumber()).toBe(10000);
    expect(result.iraRolledOverDistributions.toNumber()).toBe(0);
  });

  it("Form 1099-R Line 2 - code S distributions stay on the IRA lines even when the IRA checkbox is blank", () => {
    const result = calculateForm1099R([
      {
        payer: "SIMPLE IRA Custodian",
        grossDistribution: "10000",
        taxableAmount: "10000",
        federalWithheld: "0",
        distributionCode: "S",
        iraSepSimple: false,
      },
    ]);

    expect(result.iraGrossReported.toNumber()).toBe(0);
    expect(result.iraTaxable.toNumber()).toBe(10000);
    expect(result.pensionGrossReported.toNumber()).toBe(0);
    expect(result.pensionTaxable.toNumber()).toBe(0);
  });

  it("Form 1099-R Line 2 - implicit IRA-reporting codes ignore the non-IRA Box 5 fallback when the checkbox is blank", () => {
    const result = calculateForm1099R([
      {
        payer: "SIMPLE IRA Custodian",
        grossDistribution: "10000",
        employeeContributions: "3000",
        federalWithheld: "0",
        distributionCode: "S",
        iraSepSimple: false,
      },
    ]);

    expect(result.iraTaxable.toNumber()).toBe(10000);
    expect(result.pensionGrossReported.toNumber()).toBe(0);
    expect(result.pensionTaxable.toNumber()).toBe(0);
  });

  it("Form 1099-R Line 2 - qualified charitable distributions reduce IRA taxable amount without hiding gross", () => {
    const result = calculateForm1099R([
      {
        payer: "Traditional IRA Custodian",
        grossDistribution: "15000",
        taxableAmount: "15000",
        qualifiedCharitableDistribution: "5000",
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: true,
      },
    ]);

    expect(result.iraGrossReported.toNumber()).toBe(15000);
    expect(result.iraTaxable.toNumber()).toBe(10000);
  });

  it("Form 1099-R Line 2 - Box 7 code Y defaults the full IRA distribution to a nontaxable QCD", () => {
    const result = calculateForm1099R([
      {
        payer: "Traditional IRA Custodian",
        grossDistribution: "15000",
        federalWithheld: "0",
        distributionCode: "Y7",
        iraSepSimple: false,
      },
    ]);

    expect(result.iraGrossReported.toNumber()).toBe(15000);
    expect(result.iraTaxable.toNumber()).toBe(0);
    expect(result.iraQualifiedCharitableDistributions.toNumber()).toBe(15000);
    expect(result.pensionGrossReported.toNumber()).toBe(0);
    expect(result.pensionTaxable.toNumber()).toBe(0);
  });

  it("Form 1099-R Line 2 - inherited IRA code Y4 distributions stay on the IRA lines and remain fully excludable", () => {
    const result = calculateForm1099R([
      {
        payer: "Inherited IRA Custodian",
        grossDistribution: "8000",
        federalWithheld: "0",
        distributionCode: "Y4",
        iraSepSimple: false,
      },
    ]);

    expect(result.iraGrossReported.toNumber()).toBe(8000);
    expect(result.iraTaxable.toNumber()).toBe(0);
    expect(result.iraQualifiedCharitableDistributions.toNumber()).toBe(8000);
    expect(result.pensionGrossReported.toNumber()).toBe(0);
    expect(result.pensionTaxable.toNumber()).toBe(0);
  });

  it("Form 1099-R Line 2 - qualified Roth IRA code Q distributions stay gross on 4a and zero on 4b", () => {
    const result = calculateForm1099R([
      {
        payer: "Roth IRA Custodian",
        grossDistribution: "18000",
        taxableAmountNotDetermined: true,
        federalWithheld: "0",
        distributionCode: "Q",
        iraSepSimple: true,
      },
    ]);

    expect(result.iraGrossReported.toNumber()).toBe(18000);
    expect(result.iraTaxable.toNumber()).toBe(0);
  });

  it("Form 1099-R Line 2 - code T Roth IRA distributions with validated pre-2021 history stay gross on 4a and zero on 4b", () => {
    const result = calculateForm1099R([
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
    ]);

    expect(result.iraGrossReported.toNumber()).toBe(16000);
    expect(result.iraTaxable.toNumber()).toBe(0);
  });

  it("Form 1099-R Line 2 - validated qualified Roth IRA code J distributions stay gross on 4a and zero on 4b", () => {
    const result = calculateForm1099R([
      {
        payer: "Roth IRA Custodian",
        grossDistribution: "14000",
        taxableAmount: "14000",
        taxableAmountNotDetermined: true,
        federalWithheld: "0",
        distributionCode: "J",
        iraSepSimple: true,
        qualifiedRothDistribution: true,
      },
    ]);

    expect(result.iraGrossReported.toNumber()).toBe(14000);
    expect(result.iraTaxable.toNumber()).toBe(0);
  });

  it("Form 1099-R Line 2 - validated qualified Roth IRA code T distributions stay gross on 4a and zero on 4b even without the pre-2021 safe harbor", () => {
    const result = calculateForm1099R([
      {
        payer: "Roth IRA Custodian",
        grossDistribution: "14000",
        taxableAmount: "14000",
        taxableAmountNotDetermined: true,
        federalWithheld: "0",
        distributionCode: "T",
        iraSepSimple: true,
        qualifiedRothDistribution: true,
      },
    ]);

    expect(result.iraGrossReported.toNumber()).toBe(14000);
    expect(result.iraTaxable.toNumber()).toBe(0);
  });

  it("Form 1099-R Lines 3 and 4 - validated qualified designated Roth account code B distributions stay gross on 5a and zero on 5b even when Box 2a is blank", () => {
    const result = calculateForm1099R([
      {
        payer: "Employer 401(k) Plan",
        grossDistribution: "14000",
        taxableAmountNotDetermined: true,
        federalWithheld: "0",
        distributionCode: "B",
        iraSepSimple: false,
        qualifiedRothDistribution: true,
      },
    ]);

    expect(result.iraGrossReported.toNumber()).toBe(0);
    expect(result.iraTaxable.toNumber()).toBe(0);
    expect(result.pensionGrossReported.toNumber()).toBe(14000);
    expect(result.pensionTaxable.toNumber()).toBe(0);
  });

  it("Form 1099-R Lines 3 and 4 - code H designated Roth direct rollovers stay gross on 5a and zero on 5b even when Box 2a is populated", () => {
    const result = calculateForm1099R([
      {
        payer: "Employer Roth 401(k)",
        grossDistribution: "12000",
        taxableAmount: "12000",
        federalWithheld: "0",
        distributionCode: "H",
        iraSepSimple: false,
      },
    ]);

    expect(result.iraGrossReported.toNumber()).toBe(0);
    expect(result.iraTaxable.toNumber()).toBe(0);
    expect(result.pensionGrossReported.toNumber()).toBe(12000);
    expect(result.pensionTaxable.toNumber()).toBe(0);
  });

  it("Form 1099-R Lines 3 and 4 - audit trail preserves code H designated Roth direct rollovers separately from qualified code B distributions", () => {
    const result = calculateForm1099R([
      {
        payer: "Employer 401(k) Plan",
        grossDistribution: "14000",
        taxableAmountNotDetermined: true,
        federalWithheld: "0",
        distributionCode: "B",
        iraSepSimple: false,
        qualifiedRothDistribution: true,
      },
      {
        payer: "Employer Roth 401(k)",
        grossDistribution: "12000",
        taxableAmount: "12000",
        federalWithheld: "0",
        distributionCode: "H",
        iraSepSimple: false,
      },
    ]);

    const line3 = result.lines.find((line) => line.form === "Form 1099-R" && line.line === "3");
    const line4 = result.lines.find((line) => line.form === "Form 1099-R" && line.line === "4");

    expect(String(line3?.inputs["Validated qualified designated Roth account distributions"])).toBe("14000");
    expect(String(line3?.inputs["Designated Roth direct rollovers to Roth IRAs"])).toBe("12000");
    expect(String(line4?.inputs["Validated qualified designated Roth account distributions"])).toBe("14000");
    expect(String(line4?.inputs["Designated Roth direct rollovers to Roth IRAs"])).toBe("12000");
  });

  it("Form 1099-R Lines 1 and 2 - code R recharacterizations stay gross on 4a and zero on 4b even when the IRA checkbox is blank", () => {
    const result = calculateForm1099R([
      {
        payer: "IRA Custodian",
        grossDistribution: "6500",
        federalWithheld: "0",
        distributionCode: "R",
        iraSepSimple: false,
      },
    ]);

    expect(result.iraGrossReported.toNumber()).toBe(6500);
    expect(result.iraTaxable.toNumber()).toBe(0);
    expect(result.pensionGrossReported.toNumber()).toBe(0);
    expect(result.pensionTaxable.toNumber()).toBe(0);
  });

  it("Form 1099-R Lines 1 and 2 - code N recharacterizations stay gross on 4a and zero on 4b even when the IRA checkbox is blank", () => {
    const result = calculateForm1099R([
      {
        payer: "IRA Custodian",
        grossDistribution: "7000",
        federalWithheld: "0",
        distributionCode: "N",
        iraSepSimple: false,
      },
    ]);
    const line1 = result.lines.find((line) => line.form === "Form 1099-R" && line.line === "1");
    const line2 = result.lines.find((line) => line.form === "Form 1099-R" && line.line === "2");

    expect(result.iraGrossReported.toNumber()).toBe(7000);
    expect(result.iraTaxable.toNumber()).toBe(0);
    expect(result.iraRecharacterizedContributions.toNumber()).toBe(7000);
    expect(result.pensionGrossReported.toNumber()).toBe(0);
    expect(result.pensionTaxable.toNumber()).toBe(0);
    expect(String(line1?.inputs["Recharacterized IRA contributions"])).toBe("7000");
    expect(String(line2?.inputs["Recharacterized IRA contributions"])).toBe("7000");
  });

  it("Form 1099-R Line 1 - code J Roth IRA distributions stay visible on 4a while taxable treatment remains unresolved", () => {
    const result = calculateForm1099R([
      {
        payer: "Roth IRA Custodian",
        grossDistribution: "12000",
        taxableAmountNotDetermined: true,
        federalWithheld: "0",
        distributionCode: "J",
        iraSepSimple: true,
      },
    ]);

    expect(result.iraGrossReported.toNumber()).toBe(12000);
  });

  it("Form 1099-R Line 1 - non-safe-harbor code T Roth IRA distributions still report gross on 4a", () => {
    const result = calculateForm1099R([
      {
        payer: "Roth IRA Custodian",
        grossDistribution: "9000",
        taxableAmountNotDetermined: true,
        federalWithheld: "0",
        distributionCode: "T",
        iraSepSimple: true,
      },
    ]);

    expect(result.iraGrossReported.toNumber()).toBe(9000);
    expect(result.iraTaxable.toNumber()).toBe(9000);
  });

  it("Form 1099-R Line 2 - excess contribution returns without earnings stay gross on 4a and zero on 4b", () => {
    const result = calculateForm1099R([
      {
        payer: "Traditional IRA Custodian",
        grossDistribution: "6500",
        taxableAmountNotDetermined: true,
        excessContributionReturnedWithoutEarnings: true,
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: true,
      },
    ]);

    expect(result.iraGrossReported.toNumber()).toBe(6500);
    expect(result.iraTaxable.toNumber()).toBe(0);
    expect(result.iraReturnedExcessContributions.toNumber()).toBe(6500);
  });

  it("Form 1099-R Line 2 - SIMPLE IRA code S excess contribution returns without earnings stay gross on 4a and zero on 4b", () => {
    const result = calculateForm1099R([
      {
        payer: "SIMPLE IRA Custodian",
        grossDistribution: "6500",
        taxableAmountNotDetermined: true,
        excessContributionReturnedWithoutEarnings: true,
        federalWithheld: "0",
        distributionCode: "S",
        iraSepSimple: false,
      },
    ]);

    expect(result.iraGrossReported.toNumber()).toBe(6500);
    expect(result.iraTaxable.toNumber()).toBe(0);
    expect(result.iraReturnedExcessContributions.toNumber()).toBe(6500);
  });

  it("Form 1099-R Line 2 - current-year IRA contributions returned by the due date keep only Box 2a earnings taxable", () => {
    const result = calculateForm1099R([
      {
        payer: "Traditional IRA Custodian",
        grossDistribution: "6500",
        taxableAmount: "500",
        federalWithheld: "0",
        distributionCode: "8",
        iraSepSimple: true,
      },
    ]);
    const line2 = result.lines.find((line) => line.form === "Form 1099-R" && line.line === "2");

    expect(result.iraGrossReported.toNumber()).toBe(6500);
    expect(result.iraTaxable.toNumber()).toBe(500);
    expect(result.iraReturnedContributionsByDueDate.toNumber()).toBe(6500);
    expect(result.iraReturnedContributionsByDueDateTaxableEarnings.toNumber()).toBe(500);
    expect(line2?.formula).toContain("returned by the due date");
    expect(String(line2?.inputs["Returned contributions by due date"])).toBe("6500");
    expect(String(line2?.inputs["Taxable earnings on returned contributions by due date"])).toBe("500");
  });

  it("Form 1099-R Line 2 - code J corrective distributions ignore an inconsistent qualified-distribution flag and keep Box 2a earnings taxable", () => {
    const result = calculateForm1099R([
      {
        payer: "Roth IRA Custodian",
        grossDistribution: "6500",
        taxableAmount: "500",
        federalWithheld: "0",
        distributionCode: "J8",
        iraSepSimple: true,
        qualifiedRothDistribution: true,
      },
    ]);

    expect(result.iraGrossReported.toNumber()).toBe(6500);
    expect(result.iraTaxable.toNumber()).toBe(500);
    expect(result.iraReturnedContributionsByDueDate.toNumber()).toBe(6500);
    expect(result.iraReturnedContributionsByDueDateTaxableEarnings.toNumber()).toBe(500);
  });

  it("Form 1099-R Lines 1 and 2 - code P returned contributions stay off the current-year IRA lines while withholding remains current-year", () => {
    const result = calculateForm1099R([
      {
        payer: "Traditional IRA Custodian",
        grossDistribution: "6500",
        taxableAmount: "500",
        federalWithheld: "125",
        distributionCode: "P",
        iraSepSimple: true,
      },
    ]);

    expect(result.iraGrossReported.toNumber()).toBe(0);
    expect(result.iraTaxable.toNumber()).toBe(0);
    expect(result.iraReturnedContributionsByDueDate.toNumber()).toBe(0);
    expect(result.iraReturnedContributionsByDueDateTaxableEarnings.toNumber()).toBe(0);
    expect(result.federalWithholding.toNumber()).toBe(125);
  });

  it("Form 1099-R Line 2 - nontaxable direct-rollover IRA amounts stay available for Form 8606 exclusions", () => {
    const result = calculateForm1099R([
      {
        payer: "Traditional IRA Custodian",
        grossDistribution: "15000",
        federalWithheld: "0",
        distributionCode: "G",
        iraSepSimple: true,
      },
      {
        payer: "Traditional IRA Custodian",
        grossDistribution: "10000",
        taxableAmount: "4000",
        federalWithheld: "0",
        distributionCode: "G",
        iraSepSimple: true,
      },
    ]);

    expect(result.iraTaxable.toNumber()).toBe(4000);
    expect(result.iraRolledOverDistributions.toNumber()).toBe(21000);
  });

  it("Form 1099-R Line 4 - derives Simplified Method expected payments from the IRS tables when the worksheet omits them", () => {
    const parsed = Form1099RSchema.parse({
      payer: "State Pension",
      grossDistribution: "18000",
      taxableAmountNotDetermined: true,
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "12000",
      simplifiedMethodAnnuityStartingDate: "2024-06-01",
      simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 63,
      simplifiedMethodPaymentsReceivedThisYear: 12,
      simplifiedMethodPriorYearRecovered: "11000",
    });
    const result = calculateForm1099R([parsed]);
    const line4 = result.lines.find((line) => line.form === "Form 1099-R" && line.line === "4");

    expect(result.pensionGrossReported.toNumber()).toBe(18000);
    expect(result.pensionTaxable.eq(
      new Decimal("18000").minus(new Decimal("12000").dividedBy(260).times(12))
    )).toBe(true);
    expect(line4?.formula).toContain("Simplified Method");
    expect(String(line4?.inputs["Simplified Method expected payments"])).toBe("260");
    expect(line4?.inputs["Simplified Method expected-payments source"]).toBe("IRS Table 1 (annuity starting date in 1998 or later)");
  });

  it("Form 1099-R Line 4 - Publication 575 Bill Smith example uses the 1998+ joint-life Simplified Method table", () => {
    const result = calculateForm1099R([
      Form1099RSchema.parse({
        payer: "Qualified Pension",
        grossDistribution: "14400",
        taxableAmountNotDetermined: true,
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: false,
        simplifiedMethodCostInPlan: "31000",
        simplifiedMethodAnnuityStartingDate: "2025-01-01",
        simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 65,
        simplifiedMethodSecondaryAnnuitantAgeAtStartingDate: 65,
        simplifiedMethodPaymentsReceivedThisYear: 12,
        simplifiedMethodPriorYearRecovered: "0",
      }),
    ]);
    const line4 = result.lines.find((line) => line.form === "Form 1099-R" && line.line === "4");

    expect(result.pensionGrossReported.toNumber()).toBe(14400);
    expect(result.pensionTaxable.toNumber()).toBe(13200);
    expect(line4?.formula).toContain("Simplified Method");
    expect(String(line4?.inputs["Simplified Method expected payments"])).toBe("310");
    expect(line4?.inputs["Simplified Method expected-payments source"]).toBe(
      "IRS Table 2 (annuity starting date in 1998 or later)"
    );
    expect(String(line4?.inputs["Simplified Method current-year excludable amount"])).toBe("1200");
  });

  it("Form 1099-R Line 4 - annuity starting dates before 1998 still derive expected payments from the primary annuitant age table", () => {
    const result = calculateForm1099R([
      Form1099RSchema.parse({
        payer: "State Pension",
        grossDistribution: "18000",
        taxableAmountNotDetermined: true,
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: false,
        simplifiedMethodCostInPlan: "31000",
        simplifiedMethodAnnuityStartingDate: "1997-06-01",
        simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 58,
        simplifiedMethodSecondaryAnnuitantAgeAtStartingDate: 58,
        simplifiedMethodPaymentsReceivedThisYear: 12,
        simplifiedMethodPriorYearRecovered: "0",
      }),
    ]);
    const line4 = result.lines.find((line) => line.form === "Form 1099-R" && line.line === "4");

    expect(result.pensionTaxable.toNumber()).toBe(16800);
    expect(String(line4?.inputs["Simplified Method expected payments"])).toBe("310");
    expect(line4?.inputs["Simplified Method expected-payments source"]).toBe(
      "IRS Table 1 (annuity starting date after November 18, 1996 and before 1998)"
    );
  });

  it("Form 1099-R Line 4 - annuity starting dates before November 19, 1996 use the earlier Simplified Method table", () => {
    const result = calculateForm1099R([
      Form1099RSchema.parse({
        payer: "State Pension",
        grossDistribution: "18000",
        taxableAmountNotDetermined: true,
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: false,
        simplifiedMethodCostInPlan: "26000",
        simplifiedMethodAnnuityStartingDate: "1996-10-01",
        simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 58,
        simplifiedMethodPaymentsReceivedThisYear: 12,
        simplifiedMethodPriorYearRecovered: "0",
      }),
    ]);
    const line4 = result.lines.find((line) => line.form === "Form 1099-R" && line.line === "4");

    expect(result.pensionTaxable.toNumber()).toBe(16800);
    expect(String(line4?.inputs["Simplified Method expected payments"])).toBe("260");
    expect(line4?.inputs["Simplified Method expected-payments source"]).toBe(
      "IRS Table 1 (annuity starting date after July 1, 1986 and before November 19, 1996)"
    );
  });

  it("Form 1099-R Line 4 - multiple Simplified Method forms preserve payer-level expected-payment audit detail", () => {
    const result = calculateForm1099R([
      Form1099RSchema.parse({
        payer: "State Pension A",
        grossDistribution: "18000",
        taxableAmountNotDetermined: true,
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: false,
        simplifiedMethodCostInPlan: "12000",
        simplifiedMethodAnnuityStartingDate: "2024-06-01",
        simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 63,
        simplifiedMethodPaymentsReceivedThisYear: 12,
        simplifiedMethodPriorYearRecovered: "11000",
      }),
      Form1099RSchema.parse({
        payer: "State Pension B",
        grossDistribution: "24000",
        taxableAmountNotDetermined: true,
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: false,
        simplifiedMethodCostInPlan: "12000",
        simplifiedMethodAnnuityStartingDate: "2024-06-01",
        simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 68,
        simplifiedMethodPaymentsReceivedThisYear: 12,
        simplifiedMethodPriorYearRecovered: "0",
      }),
    ]);
    const line4 = result.lines.find((line) => line.form === "Form 1099-R" && line.line === "4");

    expect(String(line4?.inputs["Simplified Method expected payments"])).toBe("260, 210");
    expect(line4?.inputs["Simplified Method expected-payments source"]).toBe(
      "IRS Table 1 (annuity starting date in 1998 or later)"
    );
    expect(line4?.inputs["Simplified Method payer-level expected-payments detail"]).toBe(
      "State Pension A: 260 (IRS Table 1 (annuity starting date in 1998 or later)); State Pension B: 210 (IRS Table 1 (annuity starting date in 1998 or later))"
    );
  });

  it("Form 1099-R Box 2b - Simplified Method inputs can omit manual expected payments when supported IRS-table derivation inputs are present", () => {
    const parsed = Form1099RSchema.safeParse({
      payer: "State Pension",
      grossDistribution: "18000",
      taxableAmountNotDetermined: true,
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "12000",
      simplifiedMethodAnnuityStartingDate: "2024-06-01",
      simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 63,
      simplifiedMethodPaymentsReceivedThisYear: 12,
    });

    expect(parsed.success).toBe(true);
  });

  it("Form 1099-R Line 4 - Box 2b Simplified Method overrides a payer-entered Box 2a amount", () => {
    const result = calculateForm1099R([
      {
        payer: "State Pension",
        grossDistribution: "12000",
        taxableAmount: "11500",
        taxableAmountNotDetermined: true,
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: false,
        simplifiedMethodCostInPlan: "24000",
        simplifiedMethodExpectedPayments: 240,
        simplifiedMethodPaymentsReceivedThisYear: 12,
        simplifiedMethodPriorYearRecovered: "6000",
      },
    ]);
    const line4 = result.lines.find((line) => line.form === "Form 1099-R" && line.line === "4");

    expect(result.pensionGrossReported.toNumber()).toBe(12000);
    expect(result.pensionTaxable.toNumber()).toBe(10800);
    expect(line4?.formula).toContain("Simplified Method");
    expect(String(line4?.inputs["Simplified Method current-year excludable amount"])).toBe("1200");
  });

  it("Form 1099-R Line 4 - validated Simplified Method inputs reduce taxable pension income and cap recovery at remaining basis", () => {
    const result = calculateForm1099R([
      {
        payer: "State Pension",
        grossDistribution: "18000",
        taxableAmountNotDetermined: true,
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: false,
        simplifiedMethodCostInPlan: "12000",
        simplifiedMethodExpectedPayments: 240,
        simplifiedMethodPaymentsReceivedThisYear: 12,
        simplifiedMethodPriorYearRecovered: "11500",
      },
    ]);
    const line4 = result.lines.find((line) => line.form === "Form 1099-R" && line.line === "4");

    expect(result.pensionGrossReported.toNumber()).toBe(18000);
    expect(result.pensionTaxable.toNumber()).toBe(17500);
    expect(line4?.formula).toContain("Simplified Method");
    expect(String(line4?.inputs["Simplified Method prior-year recovery"])).toBe("11500");
    expect(String(line4?.inputs["Simplified Method current-year excludable amount"])).toBe("500");
  });

  it("Form 1099-R Line 4 - code 3 disability annuities still use validated Simplified Method taxable income on the pension lines", () => {
    const result = calculateForm1099R([
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
    ]);
    const line4 = result.lines.find((line) => line.form === "Form 1099-R" && line.line === "4");

    expect(result.pensionGrossReported.toNumber()).toBe(12000);
    expect(result.pensionTaxable.toNumber()).toBe(10800);
    expect(line4?.formula).toContain("Simplified Method");
    expect(String(line4?.inputs["Simplified Method prior-year recovery"])).toBe("6000");
    expect(String(line4?.inputs["Simplified Method current-year excludable amount"])).toBe("1200");
  });

  it("Form 1099-R Line 2 - validated Roth conversion amounts stay available for Form 8606 Line 8 defaults", () => {
    const result = calculateForm1099R([
      {
        payer: "Traditional IRA Custodian",
        grossDistribution: "10000",
        taxableAmount: "8000",
        rothConversionAmount: "9000",
        federalWithheld: "1000",
        distributionCode: "2",
        iraSepSimple: true,
      },
      {
        payer: "Traditional IRA Custodian",
        grossDistribution: "5000",
        taxableAmount: "5000",
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: true,
      },
    ]);

    expect(result.iraRothConversions.toNumber()).toBe(9000);
  });

  it("Form 1099-R Line 1 - Roth conversions keep the gross IRA distribution visible on 4a even before Form 8606 is present", () => {
    const result = calculateForm1099R([
      {
        payer: "Traditional IRA Custodian",
        grossDistribution: "10000",
        taxableAmount: "10000",
        rothConversionAmount: "10000",
        federalWithheld: "0",
        distributionCode: "2",
        iraSepSimple: true,
      },
    ]);

    expect(result.iraGrossReported.toNumber()).toBe(10000);
    expect(result.iraTaxable.toNumber()).toBe(10000);
  });

  it("Form 1099-R Line 3 - pension gross total reported only when needed", () => {
    const fullyTaxableOnly = calculateForm1099R([
      {
        payer: "State Pension",
        grossDistribution: "18000",
        taxableAmount: "18000",
        federalWithheld: "1800",
        distributionCode: "7",
        iraSepSimple: false,
      },
    ]);
    expect(fullyTaxableOnly.pensionGrossReported.toNumber()).toBe(0);

    const partiallyTaxable = calculateForm1099R([
      {
        payer: "State Pension",
        grossDistribution: "18000",
        taxableAmount: "12000",
        federalWithheld: "1800",
        distributionCode: "7",
        iraSepSimple: false,
      },
      {
        payer: "Former Employer 401k",
        grossDistribution: "25000",
        federalWithheld: "0",
        distributionCode: "G",
        iraSepSimple: false,
      },
    ]);
    expect(partiallyTaxable.pensionGrossReported.toNumber()).toBe(43000);
  });

  it("Form 1099-R Line 3 - taxable-amount-not-determined pensions stay gross on 5a and disability pensions stay off the pension lines", () => {
    const taxableAmountUnknown = calculateForm1099R([
      {
        payer: "State Pension",
        grossDistribution: "18000",
        taxableAmountNotDetermined: true,
        federalWithheld: "1800",
        distributionCode: "7",
        iraSepSimple: false,
      },
    ]);
    const taxableAmountUnknownLine3 = taxableAmountUnknown.lines.find(
      (line) => line.form === "Form 1099-R" && line.line === "3"
    );
    const result = calculateForm1099R([
      {
        payer: "State Disability Retirement",
        grossDistribution: "12000",
        employeeContributions: "3000",
        federalWithheld: "900",
        distributionCode: "3",
        iraSepSimple: false,
        disabilityPensionBeforeMinimumRetirementAge: true,
      },
      {
        payer: "State Pension",
        grossDistribution: "18000",
        taxableAmount: "12000",
        federalWithheld: "1800",
        distributionCode: "7",
        iraSepSimple: false,
      },
    ]);

    expect(taxableAmountUnknown.pensionGrossReported.toNumber()).toBe(18000);
    expect(taxableAmountUnknown.pensionTaxable.toNumber()).toBe(18000);
    expect(taxableAmountUnknownLine3?.formula).toContain("taxable amount not determined");
    expect(result.pensionGrossReported.toNumber()).toBe(18000);
    expect(result.disabilityPensionWages.toNumber()).toBe(9000);
  });

  it("Form 1099-R Line 3 - retired public safety officer premiums keep pension gross visible on 5a", () => {
    const result = calculateForm1099R([
      {
        payer: "County Retirement System",
        grossDistribution: "8000",
        taxableAmount: "8000",
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: false,
        retiredPublicSafetyOfficerInsurancePremiums: "2500",
      },
    ]);

    expect(result.pensionGrossReported.toNumber()).toBe(8000);
    expect(result.pensionTaxable.toNumber()).toBe(5500);
  });

  it("Form 1099-R Line 4 - pension taxable total uses rollover logic and Box 5 fallback", () => {
    const result = calculateForm1099R([
      {
        payer: "State Pension",
        grossDistribution: "18000",
        taxableAmount: "12000",
        federalWithheld: "1800",
        distributionCode: "7",
        iraSepSimple: false,
      },
      {
        payer: "Former Employer 401k",
        grossDistribution: "25000",
        federalWithheld: "0",
        distributionCode: "G",
        iraSepSimple: false,
      },
    ]);

    expect(result.pensionTaxable.toNumber()).toBe(12000);
  });

  it("Form 1099-R Line 4 - disability pensions before minimum retirement age stay off the pension lines", () => {
    const result = calculateForm1099R([
      {
        payer: "State Disability Retirement",
        grossDistribution: "12000",
        employeeContributions: "3000",
        federalWithheld: "900",
        distributionCode: "3",
        iraSepSimple: false,
        disabilityPensionBeforeMinimumRetirementAge: true,
      },
      {
        payer: "State Pension",
        grossDistribution: "18000",
        taxableAmount: "12000",
        federalWithheld: "1800",
        distributionCode: "7",
        iraSepSimple: false,
      },
    ]);

    expect(result.pensionTaxable.toNumber()).toBe(12000);
    expect(result.disabilityPensionWages.toNumber()).toBe(9000);
  });

  it("Form 1099-R Line 4 - Box 5 reduces taxable pension amount when Box 2a is blank", () => {
    const result = calculateForm1099R([
      {
        payer: "State Pension",
        grossDistribution: "18000",
        employeeContributions: "6000",
        federalWithheld: "1800",
        distributionCode: "7",
        iraSepSimple: false,
      },
    ]);

    expect(result.pensionGrossReported.toNumber()).toBe(18000);
    expect(result.pensionTaxable.toNumber()).toBe(12000);
  });

  it("Form 1099-R Line 4 - taxable pension rollover follows Box 2a and still reports gross", () => {
    const result = calculateForm1099R([
      {
        payer: "Former Employer 401k",
        grossDistribution: "25000",
        taxableAmount: "25000",
        federalWithheld: "0",
        distributionCode: "G",
        iraSepSimple: false,
      },
    ]);

    expect(result.pensionGrossReported.toNumber()).toBe(25000);
    expect(result.pensionTaxable.toNumber()).toBe(25000);
  });

  it("Form 1099-R Lines 3 and 4 - box 7 code 6 section 1035 exchanges stay gross on 5a and zero on 5b even when Box 2a is blank", () => {
    const result = calculateForm1099R([
      {
        payer: "Insurance Carrier",
        grossDistribution: "18000",
        federalWithheld: "0",
        distributionCode: "6",
        iraSepSimple: false,
      },
    ]);
    const line3 = result.lines.find((line) => line.form === "Form 1099-R" && line.line === "3");
    const line4 = result.lines.find((line) => line.form === "Form 1099-R" && line.line === "4");

    expect(result.pensionGrossReported.toNumber()).toBe(18000);
    expect(result.pensionTaxable.toNumber()).toBe(0);
    expect(line3?.formula).toContain("not fully taxable");
    expect(line4?.formula).toContain("direct-rollover codes");
  });

  it("Form 1099-R Line 4 - retired public safety officer premiums reduce taxable pension income up to the annual cap", () => {
    const result = calculateForm1099R([
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
    ]);
    const line3 = result.lines.find((line) => line.form === "Form 1099-R" && line.line === "3");
    const line4 = result.lines.find((line) => line.form === "Form 1099-R" && line.line === "4");

    expect(result.pensionGrossReported.toNumber()).toBe(15000);
    expect(result.pensionTaxable.toNumber()).toBe(6000);
    expect(String(line4?.inputs["Validated retired public safety officer insurance premiums"])).toBe("4500");
    expect(String(line4?.inputs["Retired public safety officer premium exclusion"])).toBe("3000");
    expect(String(line3?.inputs["Retired public safety officer premium exclusion"])).toBe("3000");
  });

  it("Form 1099-R Line 4 - disability pensions share the public safety officer annual cap with pension-line distributions", () => {
    const result = calculateForm1099R([
      {
        payer: "State Disability Retirement",
        grossDistribution: "12000",
        taxableAmount: "9000",
        federalWithheld: "0",
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
    ]);
    const line4 = result.lines.find((line) => line.form === "Form 1099-R" && line.line === "4");

    expect(result.disabilityPensionWages.toNumber()).toBe(6500);
    expect(result.pensionGrossReported.toNumber()).toBe(8000);
    expect(result.pensionTaxable.toNumber()).toBe(4500);
    expect(String(line4?.inputs["Disability pensions taxed as wages"])).toBe("6500");
    expect(String(line4?.inputs["Validated retired public safety officer insurance premiums"])).toBe("2000");
    expect(String(line4?.inputs["Retired public safety officer premium exclusion"])).toBe("500");
  });

  it("Form 1099-R Lines 3 and 4 - non-IRA code P returns stay off current-year pension lines while withholding remains current-year", () => {
    const result = calculateForm1099R([
      {
        payer: "401k Plan Administrator",
        grossDistribution: "3500",
        taxableAmount: "3500",
        federalWithheld: "350",
        distributionCode: "P",
        iraSepSimple: false,
      },
    ]);

    expect(result.pensionGrossReported.toNumber()).toBe(0);
    expect(result.pensionTaxable.toNumber()).toBe(0);
    expect(result.federalWithholding.toNumber()).toBe(350);
  });

  it("Form 1099-R Line 4 - direct rollover with Box 5 basis stays fully nontaxable when Box 2a is blank", () => {
    const result = calculateForm1099R([
      {
        payer: "Former Employer 401k",
        grossDistribution: "25000",
        employeeContributions: "4000",
        federalWithheld: "0",
        distributionCode: "G",
        iraSepSimple: false,
      },
    ]);

    expect(result.pensionGrossReported.toNumber()).toBe(25000);
    expect(result.pensionTaxable.toNumber()).toBe(0);
  });

  it("Form 1099-R Line 5 - withholding aggregates across forms", () => {
    const result = calculateForm1099R([
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
    ]);

    expect(result.federalWithholding.toNumber()).toBe(2700);
  });

  // ── QCD annual limit enforcement (IRC §408(d)(8)(A)) ──────────────

  it("Form 1099-R QCD annual limit - QCDs under the $105,000 limit are fully excluded", () => {
    const result = calculateForm1099R(
      [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "80000",
          federalWithheld: "0",
          distributionCode: "Y7",
          iraSepSimple: false,
        },
      ],
      { qcdAnnualLimit: new Decimal(105000) }
    );

    expect(result.iraQualifiedCharitableDistributions.toNumber()).toBe(80000);
    expect(result.iraTaxable.toNumber()).toBe(0);
    expect(result.iraGrossReported.toNumber()).toBe(80000);
  });

  it("Form 1099-R QCD annual limit - QCDs exactly at the $105,000 limit are fully excluded", () => {
    const result = calculateForm1099R(
      [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "105000",
          federalWithheld: "0",
          distributionCode: "Y7",
          iraSepSimple: false,
        },
      ],
      { qcdAnnualLimit: new Decimal(105000) }
    );

    expect(result.iraQualifiedCharitableDistributions.toNumber()).toBe(105000);
    expect(result.iraTaxable.toNumber()).toBe(0);
    expect(result.iraGrossReported.toNumber()).toBe(105000);
  });

  it("Form 1099-R QCD annual limit - QCDs exceeding $105,000 are capped and excess is taxable", () => {
    const result = calculateForm1099R(
      [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "130000",
          federalWithheld: "0",
          distributionCode: "Y7",
          iraSepSimple: false,
        },
      ],
      { qcdAnnualLimit: new Decimal(105000) }
    );

    expect(result.iraQualifiedCharitableDistributions.toNumber()).toBe(105000);
    expect(result.iraTaxable.toNumber()).toBe(25000);
    expect(result.iraGrossReported.toNumber()).toBe(130000);
  });

  it("Form 1099-R QCD annual limit - multiple QCDs from separate custodians aggregate against the limit", () => {
    const result = calculateForm1099R(
      [
        {
          payer: "Traditional IRA Custodian A",
          grossDistribution: "60000",
          federalWithheld: "0",
          distributionCode: "Y7",
          iraSepSimple: false,
        },
        {
          payer: "Traditional IRA Custodian B",
          grossDistribution: "55000",
          federalWithheld: "0",
          distributionCode: "Y7",
          iraSepSimple: false,
        },
      ],
      { qcdAnnualLimit: new Decimal(105000) }
    );

    // Total QCDs: $115,000 → capped at $105,000 → $10,000 excess is taxable
    expect(result.iraQualifiedCharitableDistributions.toNumber()).toBe(105000);
    expect(result.iraTaxable.toNumber()).toBe(10000);
    expect(result.iraGrossReported.toNumber()).toBe(115000);
  });

  it("Form 1099-R QCD annual limit - owner-tagged joint-return QCDs apply the cap separately per spouse when all IRA forms are attributed", () => {
    const result = calculateForm1099R(
      [
        {
          payer: "Primary IRA Custodian",
          grossDistribution: "120000",
          federalWithheld: "0",
          distributionCode: "Y7",
          iraSepSimple: false,
          accountHolder: "primary",
        },
        {
          payer: "Spouse IRA Custodian",
          grossDistribution: "120000",
          federalWithheld: "0",
          distributionCode: "Y7",
          iraSepSimple: false,
          accountHolder: "spouse",
        },
      ],
      { qcdAnnualLimit: new Decimal(105000) }
    );

    expect(result.iraQualifiedCharitableDistributions.toNumber()).toBe(210000);
    expect(result.iraTaxable.toNumber()).toBe(30000);
    expect(result.iraGrossReported.toNumber()).toBe(240000);

    const line2 = result.lines.find(
      (l) => l.form === "Form 1099-R" && l.line === "2"
    );
    expect(String(line2?.inputs["Qualified charitable distributions (capped)"])).toBe("210000");
    expect(String(line2?.inputs["QCD owner-aware limit application"])).toContain("primary");
    expect(String(line2?.inputs["QCD owner-aware limit application"])).toContain("spouse");
  });

  it("Form 1099-R QCD annual limit - mixed QCD and non-QCD IRA distributions with limit enforcement", () => {
    const result = calculateForm1099R(
      [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "120000",
          federalWithheld: "0",
          distributionCode: "Y7",
          iraSepSimple: false,
        },
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "30000",
          taxableAmount: "30000",
          federalWithheld: "6000",
          distributionCode: "7",
          iraSepSimple: true,
        },
      ],
      { qcdAnnualLimit: new Decimal(105000) }
    );

    // QCD: $120,000 capped at $105,000 → $15,000 excess taxable
    // Non-QCD: $30,000 fully taxable
    // Total taxable: $15,000 + $30,000 = $45,000
    expect(result.iraQualifiedCharitableDistributions.toNumber()).toBe(105000);
    expect(result.iraTaxable.toNumber()).toBe(45000);
    expect(result.iraGrossReported.toNumber()).toBe(150000);
    expect(result.federalWithholding.toNumber()).toBe(6000);
  });

  it("Form 1099-R QCD annual limit - manual QCD amount and code Y QCDs both count toward the aggregate limit", () => {
    const result = calculateForm1099R(
      [
        {
          payer: "Traditional IRA Custodian A",
          grossDistribution: "70000",
          federalWithheld: "0",
          distributionCode: "Y7",
          iraSepSimple: false,
        },
        {
          payer: "Traditional IRA Custodian B",
          grossDistribution: "50000",
          taxableAmount: "50000",
          qualifiedCharitableDistribution: "50000",
          federalWithheld: "0",
          distributionCode: "7",
          iraSepSimple: true,
        },
      ],
      { qcdAnnualLimit: new Decimal(105000) }
    );

    // Code Y QCD: $70,000 + manual QCD: $50,000 = $120,000 total
    // Capped at $105,000 → $15,000 excess is taxable
    expect(result.iraQualifiedCharitableDistributions.toNumber()).toBe(105000);
    expect(result.iraTaxable.toNumber()).toBe(15000);
    expect(result.iraGrossReported.toNumber()).toBe(120000);
  });

  it("Form 1099-R QCD annual limit - no limit enforcement when qcdAnnualLimit is not provided (backward compatibility)", () => {
    const result = calculateForm1099R([
      {
        payer: "Traditional IRA Custodian",
        grossDistribution: "200000",
        federalWithheld: "0",
        distributionCode: "Y7",
        iraSepSimple: false,
      },
    ]);

    // Without the limit option, all QCDs are excluded (backward compatibility)
    expect(result.iraQualifiedCharitableDistributions.toNumber()).toBe(200000);
    expect(result.iraTaxable.toNumber()).toBe(0);
  });

  it("Form 1099-R QCD annual limit - audit trail records excess QCD details when limit is exceeded", () => {
    const result = calculateForm1099R(
      [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "115000",
          federalWithheld: "0",
          distributionCode: "Y7",
          iraSepSimple: false,
        },
      ],
      { qcdAnnualLimit: new Decimal(105000) }
    );

    const line2 = result.lines.find(
      (l) => l.form === "Form 1099-R" && l.line === "2"
    );
    expect(line2).toBeDefined();
    expect(line2!.formula).toContain("IRC §408(d)(8)(A)");
    expect(line2!.formula).toContain("$10000");
  });

  // ── Simplified Method per-payer carryforward ──

  it("Form 1099-R Simplified Method carryforward - outputs per-payer cumulative recovery and full-recovery detection", () => {
    const parsed = Form1099RSchema.parse({
      payer: "State Pension Fund",
      grossDistribution: "24000",
      taxableAmountNotDetermined: true,
      federalWithheld: "2400",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "31000",
      simplifiedMethodAnnuityStartingDate: "2024-01-01",
      simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 65,
      simplifiedMethodSecondaryAnnuitantAgeAtStartingDate: 65,
      simplifiedMethodPaymentsReceivedThisYear: 12,
      simplifiedMethodPriorYearRecovered: "1200",
    });
    const result = calculateForm1099R([parsed]);

    expect(result.simplifiedMethodCarryforward).toHaveLength(1);
    const cf = result.simplifiedMethodCarryforward[0];
    expect(cf.payer).toBe("State Pension Fund");
    expect(cf.costInPlan.toNumber()).toBe(31000);
    expect(cf.priorYearRecovery.toNumber()).toBe(1200);
    // Expected payments: combined age 130 → 310, exclusion per payment = 31000/310 = 100
    // Current year exclusion: 100 × 12 = 1200
    expect(cf.currentYearExclusion.toNumber()).toBe(1200);
    expect(cf.cumulativeRecovery.toNumber()).toBe(2400);
    expect(cf.remainingCost.toNumber()).toBe(28600);
    expect(cf.fullyRecovered).toBe(false);
  });

  it("Form 1099-R Simplified Method carryforward - detects full cost recovery in current year", () => {
    const parsed = Form1099RSchema.parse({
      payer: "Company Pension",
      grossDistribution: "18000",
      taxableAmountNotDetermined: true,
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "10000",
      simplifiedMethodAnnuityStartingDate: "2020-06-01",
      simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 68,
      simplifiedMethodPaymentsReceivedThisYear: 12,
      simplifiedMethodPriorYearRecovered: "9600",
    });
    const result = calculateForm1099R([parsed]);

    expect(result.simplifiedMethodCarryforward).toHaveLength(1);
    const cf = result.simplifiedMethodCarryforward[0];
    // Expected payments: age 68 → 210, exclusion per payment = 10000/210 ≈ 47.62
    // Current year tentative: 47.62 × 12 = 571.43, but remaining cost = 400
    // Current year exclusion = min(571.43, 400) = 400
    expect(cf.currentYearExclusion.toNumber()).toBe(400);
    expect(cf.cumulativeRecovery.toNumber()).toBe(10000);
    expect(cf.remainingCost.toNumber()).toBe(0);
    expect(cf.fullyRecovered).toBe(true);
  });

  it("Form 1099-R Simplified Method carryforward - multiple payers have independent tracking", () => {
    const parsed1 = Form1099RSchema.parse({
      payer: "Pension A",
      grossDistribution: "12000",
      taxableAmountNotDetermined: true,
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "20000",
      simplifiedMethodAnnuityStartingDate: "2022-01-01",
      simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 60,
      simplifiedMethodPaymentsReceivedThisYear: 12,
      simplifiedMethodPriorYearRecovered: "0",
    });
    const parsed2 = Form1099RSchema.parse({
      payer: "Pension B",
      grossDistribution: "6000",
      taxableAmountNotDetermined: true,
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "5000",
      simplifiedMethodAnnuityStartingDate: "2023-03-01",
      simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 72,
      simplifiedMethodPaymentsReceivedThisYear: 12,
      simplifiedMethodPriorYearRecovered: "4800",
    });
    const result = calculateForm1099R([parsed1, parsed2]);

    expect(result.simplifiedMethodCarryforward).toHaveLength(2);
    // Pension A: age 60 → 310, exclusion per payment = 20000/310 ≈ 64.52, × 12 = 774.19
    const cfA = result.simplifiedMethodCarryforward[0];
    expect(cfA.payer).toBe("Pension A");
    expect(cfA.fullyRecovered).toBe(false);
    // Pension B: age 72 → 160, exclusion per payment = 5000/160 = 31.25, × 12 = 375
    // Remaining cost = 5000 - 4800 = 200, exclusion = min(375, 200) = 200
    const cfB = result.simplifiedMethodCarryforward[1];
    expect(cfB.payer).toBe("Pension B");
    expect(cfB.currentYearExclusion.toNumber()).toBe(200);
    expect(cfB.cumulativeRecovery.toNumber()).toBe(5000);
    expect(cfB.fullyRecovered).toBe(true);
  });

  it("Form 1099-R Simplified Method carryforward - empty when no Simplified Method forms present", () => {
    const result = calculateForm1099R([
      {
        payer: "Regular Pension",
        grossDistribution: "20000",
        taxableAmount: "20000",
        federalWithheld: "3000",
        distributionCode: "7",
        iraSepSimple: false,
      },
    ]);
    expect(result.simplifiedMethodCarryforward).toHaveLength(0);
  });

  it("Form 1099-R Simplified Method carryforward - zero prior recovery shows first-year tracking", () => {
    const parsed = Form1099RSchema.parse({
      payer: "New Pension",
      grossDistribution: "14400",
      taxableAmountNotDetermined: true,
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "31000",
      simplifiedMethodExpectedPayments: 310,
      simplifiedMethodPaymentsReceivedThisYear: 12,
    });
    const result = calculateForm1099R([parsed]);

    expect(result.simplifiedMethodCarryforward).toHaveLength(1);
    const cf = result.simplifiedMethodCarryforward[0];
    expect(cf.priorYearRecovery.toNumber()).toBe(0);
    // exclusion per payment = 31000/310 = 100, × 12 = 1200
    expect(cf.currentYearExclusion.toNumber()).toBe(1200);
    expect(cf.cumulativeRecovery.toNumber()).toBe(1200);
    expect(cf.remainingCost.toNumber()).toBe(29800);
    expect(cf.fullyRecovered).toBe(false);
  });

  // ── Same-payer multi-form Simplified Method aggregation ──

  it("Form 1099-R Simplified Method same-payer aggregation - two forms from same payer aggregate payments and emit one carryforward entry", () => {
    // Same plan: State Pension Fund, $31,000 cost, combined age 130 → 310 expected payments
    // Per-payment exclusion: 31000/310 = 100
    // Form 1: 6 payments, Form 2: 6 payments → total 12 payments → payer exclusion = 1200
    const form1 = Form1099RSchema.parse({
      payer: "State Pension Fund",
      grossDistribution: "12000",
      taxableAmountNotDetermined: true,
      federalWithheld: "1200",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "31000",
      simplifiedMethodAnnuityStartingDate: "2024-01-01",
      simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 65,
      simplifiedMethodSecondaryAnnuitantAgeAtStartingDate: 65,
      simplifiedMethodPaymentsReceivedThisYear: 6,
      simplifiedMethodPriorYearRecovered: "1200",
    });
    const form2 = Form1099RSchema.parse({
      payer: "State Pension Fund",
      grossDistribution: "12000",
      taxableAmountNotDetermined: true,
      federalWithheld: "1200",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "31000",
      simplifiedMethodAnnuityStartingDate: "2024-01-01",
      simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 65,
      simplifiedMethodSecondaryAnnuitantAgeAtStartingDate: 65,
      simplifiedMethodPaymentsReceivedThisYear: 6,
      simplifiedMethodPriorYearRecovered: "1200",
    });
    const result = calculateForm1099R([form1, form2]);

    // Should emit exactly ONE carryforward entry for this payer
    expect(result.simplifiedMethodCarryforward).toHaveLength(1);
    const cf = result.simplifiedMethodCarryforward[0];
    expect(cf.payer).toBe("State Pension Fund");
    expect(cf.costInPlan.toNumber()).toBe(31000);
    expect(cf.priorYearRecovery.toNumber()).toBe(1200);
    // Payer-level: 12 total payments × $100/payment = $1,200 exclusion
    expect(cf.currentYearExclusion.toNumber()).toBe(1200);
    expect(cf.cumulativeRecovery.toNumber()).toBe(2400);
    expect(cf.remainingCost.toNumber()).toBe(28600);
    expect(cf.fullyRecovered).toBe(false);

    // Taxable pension = (12000 + 12000) - 1200 payer-level exclusion = 22800
    expect(result.pensionTaxable.toNumber()).toBe(22800);
    // Gross should be reported since distributions aren't fully taxable
    expect(result.pensionGrossReported.toNumber()).toBe(24000);
  });

  it("Form 1099-R Simplified Method same-payer aggregation - full recovery crosses threshold on combined payments", () => {
    // Plan with very little remaining basis: cost=10000, prior recovery=9700
    // Remaining = 300. Per-payment = 10000/310 = 32.258...
    // Form 1: 6 payments → tentative = 193.55, Form 2: 6 payments → tentative = 193.55
    // Per-form approach would recover 193.55 + 193.55 = 387.10, but remaining is only 300.
    // Correct payer-level: 12 total payments × 32.258 = 387.10, capped at remaining 300.
    const form1 = Form1099RSchema.parse({
      payer: "Company Pension",
      grossDistribution: "8000",
      taxableAmountNotDetermined: true,
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "10000",
      simplifiedMethodAnnuityStartingDate: "2024-01-01",
      simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 65,
      simplifiedMethodSecondaryAnnuitantAgeAtStartingDate: 65,
      simplifiedMethodPaymentsReceivedThisYear: 6,
      simplifiedMethodPriorYearRecovered: "9700",
    });
    const form2 = Form1099RSchema.parse({
      payer: "Company Pension",
      grossDistribution: "8000",
      taxableAmountNotDetermined: true,
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "10000",
      simplifiedMethodAnnuityStartingDate: "2024-01-01",
      simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 65,
      simplifiedMethodSecondaryAnnuitantAgeAtStartingDate: 65,
      simplifiedMethodPaymentsReceivedThisYear: 6,
      simplifiedMethodPriorYearRecovered: "9700",
    });
    const result = calculateForm1099R([form1, form2]);

    expect(result.simplifiedMethodCarryforward).toHaveLength(1);
    const cf = result.simplifiedMethodCarryforward[0];
    expect(cf.payer).toBe("Company Pension");
    // Payer-level exclusion capped at remaining 300
    expect(cf.currentYearExclusion.toNumber()).toBe(300);
    expect(cf.cumulativeRecovery.toNumber()).toBe(10000);
    expect(cf.remainingCost.toNumber()).toBe(0);
    expect(cf.fullyRecovered).toBe(true);

    // Taxable = (8000 + 8000) - 300 = 15700
    expect(result.pensionTaxable.toNumber()).toBe(15700);
  });

  it("Form 1099-R Simplified Method same-payer aggregation - unequal payments across forms from same payer", () => {
    // Same plan but different payment counts: mid-year start or supplemental payment
    // Plan: $20,000 cost, age 60 → 310 expected payments, per-payment = 20000/310 = 64.516...
    // Form 1: 10 payments (regular), Form 2: 2 payments (supplemental) → total 12
    // Payer exclusion: 64.516... × 12 = 774.19
    const form1 = Form1099RSchema.parse({
      payer: "Federal Pension",
      grossDistribution: "10000",
      taxableAmountNotDetermined: true,
      federalWithheld: "1000",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "20000",
      simplifiedMethodAnnuityStartingDate: "2022-01-01",
      simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 60,
      simplifiedMethodPaymentsReceivedThisYear: 10,
      simplifiedMethodPriorYearRecovered: "2000",
    });
    const form2 = Form1099RSchema.parse({
      payer: "Federal Pension",
      grossDistribution: "2000",
      taxableAmountNotDetermined: true,
      federalWithheld: "200",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "20000",
      simplifiedMethodAnnuityStartingDate: "2022-01-01",
      simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 60,
      simplifiedMethodPaymentsReceivedThisYear: 2,
      simplifiedMethodPriorYearRecovered: "2000",
    });
    const result = calculateForm1099R([form1, form2]);

    expect(result.simplifiedMethodCarryforward).toHaveLength(1);
    const cf = result.simplifiedMethodCarryforward[0];
    expect(cf.payer).toBe("Federal Pension");
    expect(cf.costInPlan.toNumber()).toBe(20000);
    expect(cf.priorYearRecovery.toNumber()).toBe(2000);
    // 20000/310 × 12 ≈ 774.19
    expect(cf.currentYearExclusion.toFixed(2)).toBe("774.19");
    expect(cf.fullyRecovered).toBe(false);

    // Taxable = (10000 + 2000) - 774.19 = 11225.81
    expect(result.pensionTaxable.toFixed(2)).toBe("11225.81");
  });

  it("Form 1099-R Simplified Method same-payer aggregation - different cost in plan treated as separate plans", () => {
    // Two forms from same payer name but different costInPlan → separate plans
    const form1 = Form1099RSchema.parse({
      payer: "ABC Corp",
      grossDistribution: "12000",
      taxableAmountNotDetermined: true,
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "20000",
      simplifiedMethodAnnuityStartingDate: "2022-01-01",
      simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 60,
      simplifiedMethodPaymentsReceivedThisYear: 12,
      simplifiedMethodPriorYearRecovered: "0",
    });
    const form2 = Form1099RSchema.parse({
      payer: "ABC Corp",
      grossDistribution: "6000",
      taxableAmountNotDetermined: true,
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "10000",
      simplifiedMethodAnnuityStartingDate: "2023-01-01",
      simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 62,
      simplifiedMethodPaymentsReceivedThisYear: 12,
      simplifiedMethodPriorYearRecovered: "500",
    });
    const result = calculateForm1099R([form1, form2]);

    // Different costInPlan → treated as separate plans, two carryforward entries
    expect(result.simplifiedMethodCarryforward).toHaveLength(2);
    expect(result.simplifiedMethodCarryforward[0].payer).toBe("ABC Corp");
    expect(result.simplifiedMethodCarryforward[0].costInPlan.toNumber()).toBe(20000);
    expect(result.simplifiedMethodCarryforward[1].payer).toBe("ABC Corp");
    expect(result.simplifiedMethodCarryforward[1].costInPlan.toNumber()).toBe(10000);
  });

  it("Form 1099-R Simplified Method same-payer aggregation - different expected payments stay as separate plans even when cost matches", () => {
    const singleLifePlan = Form1099RSchema.parse({
      payer: "County Retirement System",
      grossDistribution: "12000",
      taxableAmountNotDetermined: true,
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "31000",
      simplifiedMethodAnnuityStartingDate: "2022-01-01",
      simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 65,
      simplifiedMethodPaymentsReceivedThisYear: 12,
      simplifiedMethodPriorYearRecovered: "0",
    });
    const jointLifePlan = Form1099RSchema.parse({
      payer: "County Retirement System",
      grossDistribution: "12000",
      taxableAmountNotDetermined: true,
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "31000",
      simplifiedMethodAnnuityStartingDate: "2024-01-01",
      simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 65,
      simplifiedMethodSecondaryAnnuitantAgeAtStartingDate: 65,
      simplifiedMethodPaymentsReceivedThisYear: 12,
      simplifiedMethodPriorYearRecovered: "0",
    });

    const result = calculateForm1099R([singleLifePlan, jointLifePlan]);

    expect(result.simplifiedMethodCarryforward).toHaveLength(2);
    expect(result.simplifiedMethodCarryforward[0].costInPlan.toNumber()).toBe(31000);
    expect(result.simplifiedMethodCarryforward[0].currentYearExclusion.toFixed(2)).toBe("1430.77");
    expect(result.simplifiedMethodCarryforward[1].costInPlan.toNumber()).toBe(31000);
    expect(result.simplifiedMethodCarryforward[1].currentYearExclusion.toFixed(2)).toBe("1200.00");
    expect(result.pensionTaxable.toFixed(2)).toBe("21369.23");
  });

  it("Form 1099-R Simplified Method same-payer aggregation - different prior-year recovery stays as separate plans even when cost and expected payments match", () => {
    const nearlyRecoveredPlan = Form1099RSchema.parse({
      payer: "State Retirement System",
      grossDistribution: "12000",
      taxableAmountNotDetermined: true,
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "31000",
      simplifiedMethodExpectedPayments: 310,
      simplifiedMethodPaymentsReceivedThisYear: 12,
      simplifiedMethodPriorYearRecovered: "30800",
    });
    const freshPlan = Form1099RSchema.parse({
      payer: "State Retirement System",
      grossDistribution: "12000",
      taxableAmountNotDetermined: true,
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "31000",
      simplifiedMethodExpectedPayments: 310,
      simplifiedMethodPaymentsReceivedThisYear: 12,
      simplifiedMethodPriorYearRecovered: "0",
    });

    const result = calculateForm1099R([nearlyRecoveredPlan, freshPlan]);

    expect(result.simplifiedMethodCarryforward).toHaveLength(2);
    expect(result.simplifiedMethodCarryforward[0].priorYearRecovery.toNumber()).toBe(30800);
    expect(result.simplifiedMethodCarryforward[0].currentYearExclusion.toFixed(2)).toBe("200.00");
    expect(result.simplifiedMethodCarryforward[0].fullyRecovered).toBe(true);
    expect(result.simplifiedMethodCarryforward[1].priorYearRecovery.toNumber()).toBe(0);
    expect(result.simplifiedMethodCarryforward[1].currentYearExclusion.toFixed(2)).toBe("1200.00");
    expect(result.simplifiedMethodCarryforward[1].fullyRecovered).toBe(false);
    expect(result.pensionTaxable.toFixed(2)).toBe("22600.00");
  });

  it("Form 1099-R Simplified Method same-payer aggregation - explicit plan identifiers keep separate annuities from sharing one recovery cap", () => {
    const planA = Form1099RSchema.parse({
      payer: "Metro Pension Office",
      grossDistribution: "8000",
      taxableAmountNotDetermined: true,
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodPlanIdentifier: "annuity-a",
      simplifiedMethodCostInPlan: "10000",
      simplifiedMethodExpectedPayments: 310,
      simplifiedMethodPaymentsReceivedThisYear: 6,
      simplifiedMethodPriorYearRecovered: "9700",
    });
    const planB = Form1099RSchema.parse({
      payer: "Metro Pension Office",
      grossDistribution: "8000",
      taxableAmountNotDetermined: true,
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodPlanIdentifier: "annuity-b",
      simplifiedMethodCostInPlan: "10000",
      simplifiedMethodExpectedPayments: 310,
      simplifiedMethodPaymentsReceivedThisYear: 6,
      simplifiedMethodPriorYearRecovered: "9700",
    });

    const result = calculateForm1099R([planA, planB]);

    expect(result.simplifiedMethodCarryforward).toHaveLength(2);
    expect(result.simplifiedMethodCarryforward[0].planIdentifier).toBe("annuity-a");
    expect(result.simplifiedMethodCarryforward[0].currentYearExclusion.toFixed(2)).toBe("193.55");
    expect(result.simplifiedMethodCarryforward[0].remainingCost.toFixed(2)).toBe("106.45");
    expect(result.simplifiedMethodCarryforward[0].fullyRecovered).toBe(false);
    expect(result.simplifiedMethodCarryforward[1].planIdentifier).toBe("annuity-b");
    expect(result.simplifiedMethodCarryforward[1].currentYearExclusion.toFixed(2)).toBe("193.55");
    expect(result.simplifiedMethodCarryforward[1].remainingCost.toFixed(2)).toBe("106.45");
    expect(result.simplifiedMethodCarryforward[1].fullyRecovered).toBe(false);
    expect(result.pensionTaxable.toFixed(2)).toBe("15612.90");
  });

  it("Form 1099-R Simplified Method same-payer aggregation - same payer alongside different payer", () => {
    // Two forms from Pension A (same plan) + one form from Pension B
    const formA1 = Form1099RSchema.parse({
      payer: "Pension A",
      grossDistribution: "6000",
      taxableAmountNotDetermined: true,
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "31000",
      simplifiedMethodExpectedPayments: 310,
      simplifiedMethodPaymentsReceivedThisYear: 6,
      simplifiedMethodPriorYearRecovered: "0",
    });
    const formA2 = Form1099RSchema.parse({
      payer: "Pension A",
      grossDistribution: "6000",
      taxableAmountNotDetermined: true,
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "31000",
      simplifiedMethodExpectedPayments: 310,
      simplifiedMethodPaymentsReceivedThisYear: 6,
      simplifiedMethodPriorYearRecovered: "0",
    });
    const formB = Form1099RSchema.parse({
      payer: "Pension B",
      grossDistribution: "18000",
      taxableAmountNotDetermined: true,
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "50000",
      simplifiedMethodExpectedPayments: 260,
      simplifiedMethodPaymentsReceivedThisYear: 12,
      simplifiedMethodPriorYearRecovered: "4000",
    });
    const result = calculateForm1099R([formA1, formA2, formB]);

    // Two carryforward entries: one for Pension A (aggregated), one for Pension B
    expect(result.simplifiedMethodCarryforward).toHaveLength(2);

    const cfA = result.simplifiedMethodCarryforward[0];
    expect(cfA.payer).toBe("Pension A");
    expect(cfA.costInPlan.toNumber()).toBe(31000);
    // Pension A: 31000/310 = 100/payment × 12 total payments = 1200
    expect(cfA.currentYearExclusion.toNumber()).toBe(1200);
    expect(cfA.cumulativeRecovery.toNumber()).toBe(1200);

    const cfB = result.simplifiedMethodCarryforward[1];
    expect(cfB.payer).toBe("Pension B");
    expect(cfB.costInPlan.toNumber()).toBe(50000);
    // Pension B: 50000/260 ≈ 192.31/payment × 12 = 2307.69
    expect(cfB.currentYearExclusion.toFixed(2)).toBe("2307.69");

    // Total taxable:
    // Pension A: (6000+6000) - 1200 = 10800
    // Pension B: 18000 - 2307.69 = 15692.31
    // Total: 26492.31
    expect(result.pensionTaxable.toFixed(2)).toBe("26492.31");
  });

  it("Form 1099-R Simplified Method same-payer aggregation - three forms from same payer", () => {
    // Three quarterly 1099-Rs from the same plan
    // Plan: $20,000 cost, 310 expected payments, per-payment = 64.516...
    // 4 + 4 + 4 = 12 total payments
    const makeForm = (payments: number) => Form1099RSchema.parse({
      payer: "Quarterly Pension",
      grossDistribution: String(payments * 500),
      taxableAmountNotDetermined: true,
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: false,
      simplifiedMethodCostInPlan: "20000",
      simplifiedMethodExpectedPayments: 310,
      simplifiedMethodPaymentsReceivedThisYear: payments,
      simplifiedMethodPriorYearRecovered: "1000",
    });
    const result = calculateForm1099R([makeForm(4), makeForm(4), makeForm(4)]);

    expect(result.simplifiedMethodCarryforward).toHaveLength(1);
    const cf = result.simplifiedMethodCarryforward[0];
    expect(cf.payer).toBe("Quarterly Pension");
    // 20000/310 × 12 ≈ 774.19
    expect(cf.currentYearExclusion.toFixed(2)).toBe("774.19");
    expect(cf.priorYearRecovery.toNumber()).toBe(1000);
    expect(cf.cumulativeRecovery.toFixed(2)).toBe("1774.19");

    // Taxable = (2000 + 2000 + 2000) - 774.19 = 5225.81
    expect(result.pensionTaxable.toFixed(2)).toBe("5225.81");
  });
});
