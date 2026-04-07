/**
 * Edge case tests for Form 1099-R retirement distribution boundaries.
 * Spec: spec/federal/form-1099-r.yaml
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm1099R } from "@/engine/forms/form-1099-r.js";
import { Form1099RSchema } from "@/models/inputs.js";
import type { Form1099R } from "@/models/inputs.js";

describe("Form 1099-R Simplified Method boundaries", () => {
  it("rejects Simplified Method inputs for the July 1, 1986 annuity-starting-date cutoff", () => {
    const parsed = Form1099RSchema.safeParse({
      payer: "Legacy Pension",
      grossDistribution: "14400",
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: false,
      taxableAmountNotDetermined: true,
      simplifiedMethodCostInPlan: "26000",
      simplifiedMethodAnnuityStartingDate: "1986-07-01",
      simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 60,
      simplifiedMethodPaymentsReceivedThisYear: 12,
      simplifiedMethodPriorYearRecovered: "0",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => (
      issue.path.join(".") === "simplifiedMethodAnnuityStartingDate"
      && issue.message.includes("only supported for annuity starting dates on or after July 2, 1986")
    ))).toBe(true);
  });

  it("derives expected payments from the earlier IRS Table 1 starting on July 2, 1986", () => {
    const result = calculateForm1099R([
      Form1099RSchema.parse({
        payer: "Legacy Pension",
        grossDistribution: "14400",
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: false,
        taxableAmountNotDetermined: true,
        simplifiedMethodCostInPlan: "26000",
        simplifiedMethodAnnuityStartingDate: "1986-07-02",
        simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 60,
        simplifiedMethodPaymentsReceivedThisYear: 12,
        simplifiedMethodPriorYearRecovered: "0",
      }),
    ]);

    const line4 = result.lines.find((line) => line.line === "4");

    expect(result.pensionTaxable.toNumber()).toBe(13200);
    expect(String(line4?.inputs["Simplified Method expected payments"])).toBe("260");
    expect(line4?.inputs["Simplified Method expected-payments source"]).toBe(
      "IRS Table 1 (annuity starting date after July 1, 1986 and before November 19, 1996)"
    );
    expect(String(line4?.inputs["Simplified Method current-year excludable amount"])).toBe("1200");
  });

  it("still rejects manual expected payments on the unsupported July 1, 1986 cutoff date", () => {
    const parsed = Form1099RSchema.safeParse({
      payer: "Legacy Pension",
      grossDistribution: "14400",
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: false,
      taxableAmountNotDetermined: true,
      simplifiedMethodCostInPlan: "26000",
      simplifiedMethodExpectedPayments: 260,
      simplifiedMethodAnnuityStartingDate: "1986-07-01",
      simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 60,
      simplifiedMethodPaymentsReceivedThisYear: 12,
      simplifiedMethodPriorYearRecovered: "0",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => (
      issue.path.join(".") === "simplifiedMethodAnnuityStartingDate"
      && issue.message.includes("only supported for annuity starting dates on or after July 2, 1986")
    ))).toBe(true);
  });

  it("switches to the later pre-1998 IRS Table 1 on the November 19, 1996 cutoff", () => {
    const result = calculateForm1099R([
      Form1099RSchema.parse({
        payer: "Legacy Pension",
        grossDistribution: "14400",
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: false,
        taxableAmountNotDetermined: true,
        simplifiedMethodCostInPlan: "31000",
        simplifiedMethodAnnuityStartingDate: "1996-11-19",
        simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 58,
        simplifiedMethodSecondaryAnnuitantAgeAtStartingDate: 70,
        simplifiedMethodPaymentsReceivedThisYear: 12,
        simplifiedMethodPriorYearRecovered: "0",
      }),
    ]);

    const line4 = result.lines.find((line) => line.line === "4");

    expect(result.pensionTaxable.toNumber()).toBe(13200);
    expect(String(line4?.inputs["Simplified Method expected payments"])).toBe("310");
    expect(line4?.inputs["Simplified Method expected-payments source"]).toBe(
      "IRS Table 1 (annuity starting date after November 18, 1996 and before 1998)"
    );
    expect(String(line4?.inputs["Simplified Method current-year excludable amount"])).toBe("1200");
  });

  it("keeps the earlier pre-November-19 table on the November 18, 1996 boundary", () => {
    const result = calculateForm1099R([
      Form1099RSchema.parse({
        payer: "Legacy Pension",
        grossDistribution: "14400",
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: false,
        taxableAmountNotDetermined: true,
        simplifiedMethodCostInPlan: "26000",
        simplifiedMethodAnnuityStartingDate: "1996-11-18",
        simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 60,
        simplifiedMethodSecondaryAnnuitantAgeAtStartingDate: 70,
        simplifiedMethodPaymentsReceivedThisYear: 12,
        simplifiedMethodPriorYearRecovered: "0",
      }),
    ]);

    const line4 = result.lines.find((line) => line.line === "4");

    expect(result.pensionTaxable.toNumber()).toBe(13200);
    expect(String(line4?.inputs["Simplified Method expected payments"])).toBe("260");
    expect(line4?.inputs["Simplified Method expected-payments source"]).toBe(
      "IRS Table 1 (annuity starting date after July 1, 1986 and before November 19, 1996)"
    );
    expect(String(line4?.inputs["Simplified Method current-year excludable amount"])).toBe("1200");
  });

  it("ignores a secondary annuitant age before 1998 and stays on the single-life table", () => {
    const withSecondaryAge = calculateForm1099R([
      Form1099RSchema.parse({
        payer: "Legacy Pension",
        grossDistribution: "14400",
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: false,
        taxableAmountNotDetermined: true,
        simplifiedMethodCostInPlan: "26000",
        simplifiedMethodAnnuityStartingDate: "1996-11-18",
        simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 60,
        simplifiedMethodSecondaryAnnuitantAgeAtStartingDate: 70,
        simplifiedMethodPaymentsReceivedThisYear: 12,
        simplifiedMethodPriorYearRecovered: "0",
      }),
    ]);
    const withoutSecondaryAge = calculateForm1099R([
      Form1099RSchema.parse({
        payer: "Legacy Pension",
        grossDistribution: "14400",
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: false,
        taxableAmountNotDetermined: true,
        simplifiedMethodCostInPlan: "26000",
        simplifiedMethodAnnuityStartingDate: "1996-11-18",
        simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 60,
        simplifiedMethodPaymentsReceivedThisYear: 12,
        simplifiedMethodPriorYearRecovered: "0",
      }),
    ]);

    const withSecondaryLine4 = withSecondaryAge.lines.find((line) => line.line === "4");
    const withoutSecondaryLine4 = withoutSecondaryAge.lines.find((line) => line.line === "4");

    expect(withSecondaryAge.pensionTaxable.toNumber()).toBe(13200);
    expect(withoutSecondaryAge.pensionTaxable.toNumber()).toBe(13200);
    expect(String(withSecondaryLine4?.inputs["Simplified Method expected payments"])).toBe("260");
    expect(String(withoutSecondaryLine4?.inputs["Simplified Method expected payments"])).toBe("260");
    expect(withSecondaryLine4?.inputs["Simplified Method expected-payments source"]).toBe(
      "IRS Table 1 (annuity starting date after July 1, 1986 and before November 19, 1996)"
    );
    expect(withoutSecondaryLine4?.inputs["Simplified Method expected-payments source"]).toBe(
      "IRS Table 1 (annuity starting date after July 1, 1986 and before November 19, 1996)"
    );
  });

  it("switches the earlier post-July-1-1986 single-life table at the age-60/61 boundary", () => {
    const age60Result = calculateForm1099R([
      Form1099RSchema.parse({
        payer: "Legacy Pension",
        grossDistribution: "14400",
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: false,
        taxableAmountNotDetermined: true,
        simplifiedMethodCostInPlan: "26000",
        simplifiedMethodAnnuityStartingDate: "1990-06-01",
        simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 60,
        simplifiedMethodPaymentsReceivedThisYear: 12,
        simplifiedMethodPriorYearRecovered: "0",
      }),
    ]);
    const age61Result = calculateForm1099R([
      Form1099RSchema.parse({
        payer: "Legacy Pension",
        grossDistribution: "14400",
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: false,
        taxableAmountNotDetermined: true,
        simplifiedMethodCostInPlan: "24000",
        simplifiedMethodAnnuityStartingDate: "1990-06-01",
        simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 61,
        simplifiedMethodPaymentsReceivedThisYear: 12,
        simplifiedMethodPriorYearRecovered: "0",
      }),
    ]);

    const age60Line4 = age60Result.lines.find((line) => line.line === "4");
    const age61Line4 = age61Result.lines.find((line) => line.line === "4");

    expect(String(age60Line4?.inputs["Simplified Method expected payments"])).toBe("260");
    expect(age60Line4?.inputs["Simplified Method expected-payments source"]).toBe(
      "IRS Table 1 (annuity starting date after July 1, 1986 and before November 19, 1996)"
    );
    expect(String(age60Line4?.inputs["Simplified Method current-year excludable amount"])).toBe("1200");
    expect(age60Result.pensionTaxable.toNumber()).toBe(13200);

    expect(String(age61Line4?.inputs["Simplified Method expected payments"])).toBe("240");
    expect(age61Line4?.inputs["Simplified Method expected-payments source"]).toBe(
      "IRS Table 1 (annuity starting date after July 1, 1986 and before November 19, 1996)"
    );
    expect(String(age61Line4?.inputs["Simplified Method current-year excludable amount"])).toBe("1200");
    expect(age61Result.pensionTaxable.toNumber()).toBe(13200);
  });

  it("switches joint-life annuities to IRS Table 2 on the January 1, 1998 cutoff", () => {
    const result = calculateForm1099R([
      Form1099RSchema.parse({
        payer: "Legacy Pension",
        grossDistribution: "14400",
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: false,
        taxableAmountNotDetermined: true,
        simplifiedMethodCostInPlan: "31000",
        simplifiedMethodAnnuityStartingDate: "1998-01-01",
        simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 60,
        simplifiedMethodSecondaryAnnuitantAgeAtStartingDate: 70,
        simplifiedMethodPaymentsReceivedThisYear: 12,
        simplifiedMethodPriorYearRecovered: "0",
      }),
    ]);

    const line4 = result.lines.find((line) => line.line === "4");

    expect(result.pensionTaxable.toNumber()).toBe(13200);
    expect(String(line4?.inputs["Simplified Method expected payments"])).toBe("310");
    expect(line4?.inputs["Simplified Method expected-payments source"]).toBe(
      "IRS Table 2 (annuity starting date in 1998 or later)"
    );
    expect(String(line4?.inputs["Simplified Method current-year excludable amount"])).toBe("1200");
  });

  it("keeps a December 31, 1997 joint annuity on Table 1 and only switches that same fact pattern to Table 2 on January 1, 1998", () => {
    const december31Result = calculateForm1099R([
      Form1099RSchema.parse({
        payer: "Legacy Pension",
        grossDistribution: "14400",
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: false,
        taxableAmountNotDetermined: true,
        simplifiedMethodCostInPlan: "36000",
        simplifiedMethodAnnuityStartingDate: "1997-12-31",
        simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 71,
        simplifiedMethodSecondaryAnnuitantAgeAtStartingDate: 49,
        simplifiedMethodPaymentsReceivedThisYear: 12,
        simplifiedMethodPriorYearRecovered: "0",
      }),
    ]);
    const january1Result = calculateForm1099R([
      Form1099RSchema.parse({
        payer: "Legacy Pension",
        grossDistribution: "14400",
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: false,
        taxableAmountNotDetermined: true,
        simplifiedMethodCostInPlan: "36000",
        simplifiedMethodAnnuityStartingDate: "1998-01-01",
        simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 71,
        simplifiedMethodSecondaryAnnuitantAgeAtStartingDate: 49,
        simplifiedMethodPaymentsReceivedThisYear: 12,
        simplifiedMethodPriorYearRecovered: "0",
      }),
    ]);

    const december31Line4 = december31Result.lines.find((line) => line.line === "4");
    const january1Line4 = january1Result.lines.find((line) => line.line === "4");

    expect(String(december31Line4?.inputs["Simplified Method expected payments"])).toBe("160");
    expect(december31Line4?.inputs["Simplified Method expected-payments source"]).toBe(
      "IRS Table 1 (annuity starting date after November 18, 1996 and before 1998)"
    );
    expect(String(december31Line4?.inputs["Simplified Method current-year excludable amount"])).toBe("2700");
    expect(december31Result.pensionTaxable.toNumber()).toBe(11700);

    expect(String(january1Line4?.inputs["Simplified Method expected payments"])).toBe("360");
    expect(january1Line4?.inputs["Simplified Method expected-payments source"]).toBe(
      "IRS Table 2 (annuity starting date in 1998 or later)"
    );
    expect(String(january1Line4?.inputs["Simplified Method current-year excludable amount"])).toBe("1200");
    expect(january1Result.pensionTaxable.toNumber()).toBe(13200);
  });

  it("switches the 1998-or-later joint-life table at the combined-age-140/141 boundary", () => {
    const combined140Result = calculateForm1099R([
      Form1099RSchema.parse({
        payer: "Joint Survivor Pension",
        grossDistribution: "14400",
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: false,
        taxableAmountNotDetermined: true,
        simplifiedMethodCostInPlan: "26000",
        simplifiedMethodAnnuityStartingDate: "1998-01-01",
        simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 70,
        simplifiedMethodSecondaryAnnuitantAgeAtStartingDate: 70,
        simplifiedMethodPaymentsReceivedThisYear: 12,
        simplifiedMethodPriorYearRecovered: "0",
      }),
    ]);
    const combined141Result = calculateForm1099R([
      Form1099RSchema.parse({
        payer: "Joint Survivor Pension",
        grossDistribution: "14400",
        federalWithheld: "0",
        distributionCode: "7",
        iraSepSimple: false,
        taxableAmountNotDetermined: true,
        simplifiedMethodCostInPlan: "21000",
        simplifiedMethodAnnuityStartingDate: "1998-01-01",
        simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 71,
        simplifiedMethodSecondaryAnnuitantAgeAtStartingDate: 70,
        simplifiedMethodPaymentsReceivedThisYear: 12,
        simplifiedMethodPriorYearRecovered: "0",
      }),
    ]);

    const combined140Line4 = combined140Result.lines.find((line) => line.line === "4");
    const combined141Line4 = combined141Result.lines.find((line) => line.line === "4");

    expect(String(combined140Line4?.inputs["Simplified Method expected payments"])).toBe("260");
    expect(combined140Line4?.inputs["Simplified Method expected-payments source"]).toBe(
      "IRS Table 2 (annuity starting date in 1998 or later)"
    );
    expect(String(combined140Line4?.inputs["Simplified Method current-year excludable amount"])).toBe("1200");
    expect(combined140Result.pensionTaxable.toNumber()).toBe(13200);

    expect(String(combined141Line4?.inputs["Simplified Method expected payments"])).toBe("210");
    expect(combined141Line4?.inputs["Simplified Method expected-payments source"]).toBe(
      "IRS Table 2 (annuity starting date in 1998 or later)"
    );
    expect(String(combined141Line4?.inputs["Simplified Method current-year excludable amount"])).toBe("1200");
    expect(combined141Result.pensionTaxable.toNumber()).toBe(13200);
  });
});

// ── Helper for new tests ──────────────────────────────────────

function parse1099R(overrides: Record<string, unknown>): Form1099R {
  return Form1099RSchema.parse({
    payer: "Test Payer",
    grossDistribution: "10000",
    federalWithheld: "0",
    iraSepSimple: false,
    ...overrides,
  });
}

// ── Direct Rollover (code G/H) edge cases ─────────────────────

describe("Form 1099-R Direct Rollover boundaries", () => {
  it("Form 1099-R - IRA direct rollover code G produces $0 taxable and reports gross", () => {
    const result = calculateForm1099R([
      parse1099R({
        payer: "Fidelity IRA",
        grossDistribution: "50000",
        distributionCode: "G",
        iraSepSimple: true,
      }),
    ]);
    expect(result.iraTaxable).toEqual(new Decimal(0));
    expect(result.iraGrossReported).toEqual(new Decimal(50000));
    expect(result.iraRolledOverDistributions).toEqual(new Decimal(50000));
  });

  it("Form 1099-R - pension direct rollover code G produces $0 taxable and reports gross", () => {
    const result = calculateForm1099R([
      parse1099R({
        payer: "Employer 401k",
        grossDistribution: "100000",
        distributionCode: "G",
        iraSepSimple: false,
      }),
    ]);
    expect(result.pensionTaxable).toEqual(new Decimal(0));
    expect(result.pensionGrossReported).toEqual(new Decimal(100000));
  });

  it("Form 1099-R - code H (direct rollover of designated Roth) produces $0 taxable", () => {
    const result = calculateForm1099R([
      parse1099R({
        payer: "Employer Roth 401k",
        grossDistribution: "75000",
        distributionCode: "H",
        iraSepSimple: false,
      }),
    ]);
    expect(result.pensionTaxable).toEqual(new Decimal(0));
    expect(result.pensionGrossReported).toEqual(new Decimal(75000));
  });
});

// ── QCD (code Y) with annual limit enforcement ───────────────

describe("Form 1099-R QCD annual limit boundaries", () => {
  it("Form 1099-R - code Y QCD at exactly the annual limit is fully excludable", () => {
    const annualLimit = new Decimal(105000);
    const result = calculateForm1099R(
      [
        parse1099R({
          payer: "IRA Custodian",
          grossDistribution: "105000",
          distributionCode: "7Y",
          iraSepSimple: true,
        }),
      ],
      { qcdAnnualLimit: annualLimit }
    );
    expect(result.iraQualifiedCharitableDistributions).toEqual(annualLimit);
    expect(result.iraTaxable).toEqual(new Decimal(0));
  });

  it("Form 1099-R - code Y QCD $1 above annual limit has $1 excess taxable", () => {
    const annualLimit = new Decimal(105000);
    const result = calculateForm1099R(
      [
        parse1099R({
          payer: "IRA Custodian",
          grossDistribution: "105001",
          distributionCode: "7Y",
          iraSepSimple: true,
        }),
      ],
      { qcdAnnualLimit: annualLimit }
    );
    expect(result.iraQualifiedCharitableDistributions).toEqual(annualLimit);
    expect(result.iraTaxable).toEqual(new Decimal(1));
  });

  it("Form 1099-R - code Y QCD $1 below annual limit is fully excludable", () => {
    const annualLimit = new Decimal(105000);
    const result = calculateForm1099R(
      [
        parse1099R({
          payer: "IRA Custodian",
          grossDistribution: "104999",
          distributionCode: "7Y",
          iraSepSimple: true,
        }),
      ],
      { qcdAnnualLimit: annualLimit }
    );
    expect(result.iraQualifiedCharitableDistributions).toEqual(new Decimal(104999));
    expect(result.iraTaxable).toEqual(new Decimal(0));
  });

  it("Form 1099-R - QCD without annual limit enforced is fully excludable regardless of amount", () => {
    const result = calculateForm1099R([
      parse1099R({
        payer: "IRA Custodian",
        grossDistribution: "200000",
        distributionCode: "7Y",
        iraSepSimple: true,
      }),
    ]);
    expect(result.iraQualifiedCharitableDistributions).toEqual(new Decimal(200000));
    expect(result.iraTaxable).toEqual(new Decimal(0));
  });

  it("Form 1099-R - per-owner QCD limits apply separately for MFJ when accountHolder is set", () => {
    const annualLimit = new Decimal(105000);
    const result = calculateForm1099R(
      [
        parse1099R({
          payer: "Primary IRA",
          grossDistribution: "105000",
          distributionCode: "7Y",
          iraSepSimple: true,
          accountHolder: "primary",
        }),
        parse1099R({
          payer: "Spouse IRA",
          grossDistribution: "105000",
          distributionCode: "7Y",
          iraSepSimple: true,
          accountHolder: "spouse",
        }),
      ],
      { qcdAnnualLimit: annualLimit }
    );
    // Each owner's $105,000 is within their own $105,000 limit
    expect(result.iraQualifiedCharitableDistributions).toEqual(new Decimal(210000));
    expect(result.iraTaxable).toEqual(new Decimal(0));
  });

  it("Form 1099-R - per-owner QCD limit exceeded by one spouse produces excess only for that spouse", () => {
    const annualLimit = new Decimal(105000);
    const result = calculateForm1099R(
      [
        parse1099R({
          payer: "Primary IRA",
          grossDistribution: "110000",
          distributionCode: "7Y",
          iraSepSimple: true,
          accountHolder: "primary",
        }),
        parse1099R({
          payer: "Spouse IRA",
          grossDistribution: "50000",
          distributionCode: "7Y",
          iraSepSimple: true,
          accountHolder: "spouse",
        }),
      ],
      { qcdAnnualLimit: annualLimit }
    );
    // Primary: $110k capped to $105k. Spouse: $50k fully excludable.
    expect(result.iraQualifiedCharitableDistributions).toEqual(new Decimal(155000));
    expect(result.iraTaxable).toEqual(new Decimal(5000));
  });
});

// ── Public Safety Officer Premium Exclusion ──────────────────

describe("Form 1099-R Public Safety Officer Premium Exclusion boundaries", () => {
  it("Form 1099-R - pension public safety officer premiums at exactly $3,000 cap", () => {
    const result = calculateForm1099R([
      parse1099R({
        payer: "Police Pension Fund",
        grossDistribution: "60000",
        taxableAmount: "60000",
        distributionCode: "7",
        iraSepSimple: false,
        retiredPublicSafetyOfficerInsurancePremiums: "3000",
      }),
    ]);
    expect(result.pensionPublicSafetyOfficerPremiumExclusion).toEqual(new Decimal(3000));
    expect(result.pensionTaxable).toEqual(new Decimal(57000));
  });

  it("Form 1099-R - pension public safety officer premiums above $3,000 cap are limited", () => {
    const result = calculateForm1099R([
      parse1099R({
        payer: "Police Pension Fund",
        grossDistribution: "60000",
        taxableAmount: "60000",
        distributionCode: "7",
        iraSepSimple: false,
        retiredPublicSafetyOfficerInsurancePremiums: "5000",
      }),
    ]);
    expect(result.pensionPublicSafetyOfficerPremiumExclusion).toEqual(new Decimal(3000));
    expect(result.pensionTaxable).toEqual(new Decimal(57000));
  });

  it("Form 1099-R - pension public safety officer premiums $1 below cap", () => {
    const result = calculateForm1099R([
      parse1099R({
        payer: "Police Pension Fund",
        grossDistribution: "60000",
        taxableAmount: "60000",
        distributionCode: "7",
        iraSepSimple: false,
        retiredPublicSafetyOfficerInsurancePremiums: "2999",
      }),
    ]);
    expect(result.pensionPublicSafetyOfficerPremiumExclusion).toEqual(new Decimal(2999));
    expect(result.pensionTaxable).toEqual(new Decimal(57001));
  });

  it("Form 1099-R - disability pension uses the $3,000 cap before pension gets remaining cap", () => {
    const result = calculateForm1099R([
      parse1099R({
        payer: "Fire Dept Disability",
        grossDistribution: "40000",
        taxableAmount: "40000",
        distributionCode: "3",
        iraSepSimple: false,
        disabilityPensionBeforeMinimumRetirementAge: true,
        retiredPublicSafetyOfficerInsurancePremiums: "2000",
      }),
      parse1099R({
        payer: "Fire Dept Regular",
        grossDistribution: "30000",
        taxableAmount: "30000",
        distributionCode: "7",
        iraSepSimple: false,
        retiredPublicSafetyOfficerInsurancePremiums: "2000",
      }),
    ]);
    // Disability gets $2,000 of the $3,000 cap; pension gets remaining $1,000
    expect(result.disabilityPensionPublicSafetyOfficerPremiumExclusion).toEqual(new Decimal(2000));
    expect(result.pensionPublicSafetyOfficerPremiumExclusion).toEqual(new Decimal(1000));
    expect(result.disabilityPensionWages).toEqual(new Decimal(38000));
    expect(result.pensionTaxable).toEqual(new Decimal(29000));
  });
});

// ── Disability Pension (code 3) ──────────────────────────────

describe("Form 1099-R Disability Pension boundaries", () => {
  it("Form 1099-R - disability pension code 3 before retirement age routes taxable to wages", () => {
    const result = calculateForm1099R([
      parse1099R({
        payer: "Disability Plan",
        grossDistribution: "45000",
        taxableAmount: "45000",
        distributionCode: "3",
        iraSepSimple: false,
        disabilityPensionBeforeMinimumRetirementAge: true,
      }),
    ]);
    expect(result.disabilityPensionWages).toEqual(new Decimal(45000));
    expect(result.pensionTaxable).toEqual(new Decimal(0));
    expect(result.pensionGrossReported).toEqual(new Decimal(0));
  });
});

// ── Roth Conversion ──────────────────────────────────────────

describe("Form 1099-R Roth Conversion boundaries", () => {
  it("Form 1099-R - Roth conversion amount equals gross distribution", () => {
    const result = calculateForm1099R([
      parse1099R({
        payer: "Traditional IRA",
        grossDistribution: "50000",
        distributionCode: "7",
        iraSepSimple: true,
        rothConversionAmount: "50000",
      }),
    ]);
    expect(result.iraRothConversions).toEqual(new Decimal(50000));
    expect(result.iraGrossReported).toEqual(new Decimal(50000));
  });

  it("Form 1099-R - schema rejects Roth conversion amount exceeding gross distribution", () => {
    const parsed = Form1099RSchema.safeParse({
      payer: "Traditional IRA",
      grossDistribution: "30000",
      federalWithheld: "0",
      distributionCode: "7",
      iraSepSimple: true,
      rothConversionAmount: "50000",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) =>
      issue.path.join(".") === "rothConversionAmount"
    )).toBe(true);
  });
});

// ── Recharacterized IRA Contributions (code N/R) ─────────────

describe("Form 1099-R Recharacterized Contribution boundaries", () => {
  it("Form 1099-R - code N recharacterization produces $0 taxable", () => {
    const result = calculateForm1099R([
      parse1099R({
        payer: "IRA Custodian",
        grossDistribution: "6500",
        distributionCode: "N",
        iraSepSimple: true,
      }),
    ]);
    expect(result.iraTaxable).toEqual(new Decimal(0));
    expect(result.iraRecharacterizedContributions).toEqual(new Decimal(6500));
  });

  it("Form 1099-R - code R recharacterization also produces $0 taxable", () => {
    const result = calculateForm1099R([
      parse1099R({
        payer: "IRA Custodian",
        grossDistribution: "7000",
        distributionCode: "R",
        iraSepSimple: true,
      }),
    ]);
    expect(result.iraTaxable).toEqual(new Decimal(0));
    expect(result.iraRecharacterizedContributions).toEqual(new Decimal(7000));
  });
});

// ── Returned Contributions and Excess Contributions ──────────

describe("Form 1099-R Returned Contribution boundaries", () => {
  it("Form 1099-R - returned contribution by due date: only Box 2a earnings are taxable", () => {
    const result = calculateForm1099R([
      parse1099R({
        payer: "IRA Custodian",
        grossDistribution: "6500",
        taxableAmount: "200",
        distributionCode: "8J",
        iraSepSimple: true,
        returnedContributionByDueDate: true,
      }),
    ]);
    expect(result.iraReturnedContributionsByDueDate).toEqual(new Decimal(6500));
    expect(result.iraReturnedContributionsByDueDateTaxableEarnings).toEqual(new Decimal(200));
  });

  it("Form 1099-R - excess contribution returned without earnings: $0 taxable", () => {
    const result = calculateForm1099R([
      parse1099R({
        payer: "IRA Custodian",
        grossDistribution: "6000",
        distributionCode: "7",
        iraSepSimple: true,
        excessContributionReturnedWithoutEarnings: true,
      }),
    ]);
    expect(result.iraTaxable).toEqual(new Decimal(0));
    expect(result.iraReturnedExcessContributions).toEqual(new Decimal(6000));
  });
});

// ── Qualified Roth Distributions (code J/T standalone) ───────

describe("Form 1099-R Qualified Roth Distribution boundaries", () => {
  it("Form 1099-R - qualified Roth distribution code J standalone: $0 taxable", () => {
    const result = calculateForm1099R([
      parse1099R({
        payer: "Roth IRA Custodian",
        grossDistribution: "25000",
        distributionCode: "J",
        iraSepSimple: true,
        qualifiedRothDistribution: true,
      }),
    ]);
    expect(result.iraTaxable).toEqual(new Decimal(0));
    expect(result.iraGrossReported).toEqual(new Decimal(25000));
  });

  it("Form 1099-R - qualified Roth distribution code T standalone: $0 taxable", () => {
    const result = calculateForm1099R([
      parse1099R({
        payer: "Roth IRA Custodian",
        grossDistribution: "35000",
        distributionCode: "T",
        iraSepSimple: true,
        qualifiedRothDistribution: true,
      }),
    ]);
    expect(result.iraTaxable).toEqual(new Decimal(0));
    expect(result.iraGrossReported).toEqual(new Decimal(35000));
  });
});

// ── Section 1035 Exchange ────────────────────────────────────

describe("Form 1099-R Section 1035 Exchange boundaries", () => {
  it("Form 1099-R - code 6 section 1035 exchange with blank Box 2a: $0 taxable", () => {
    const result = calculateForm1099R([
      parse1099R({
        payer: "Insurance Company",
        grossDistribution: "150000",
        distributionCode: "6",
        iraSepSimple: false,
      }),
    ]);
    expect(result.pensionTaxable).toEqual(new Decimal(0));
    expect(result.pensionGrossReported).toEqual(new Decimal(150000));
  });
});

// ── Mixed IRA and Pension aggregation ────────────────────────

describe("Form 1099-R Mixed IRA and Pension aggregation", () => {
  it("Form 1099-R - IRA and pension forms route to separate lines", () => {
    const result = calculateForm1099R([
      parse1099R({
        payer: "Fidelity IRA",
        grossDistribution: "20000",
        taxableAmount: "20000",
        distributionCode: "7",
        iraSepSimple: true,
      }),
      parse1099R({
        payer: "Employer 401k",
        grossDistribution: "30000",
        taxableAmount: "30000",
        distributionCode: "7",
        iraSepSimple: false,
      }),
    ]);
    expect(result.iraTaxable).toEqual(new Decimal(20000));
    expect(result.pensionTaxable).toEqual(new Decimal(30000));
  });

  it("Form 1099-R - withholding aggregates across IRA and pension forms", () => {
    const result = calculateForm1099R([
      parse1099R({
        payer: "Fidelity IRA",
        grossDistribution: "20000",
        federalWithheld: "4000",
        distributionCode: "7",
        iraSepSimple: true,
      }),
      parse1099R({
        payer: "Employer 401k",
        grossDistribution: "30000",
        federalWithheld: "6000",
        distributionCode: "7",
        iraSepSimple: false,
      }),
    ]);
    expect(result.federalWithholding).toEqual(new Decimal(10000));
  });

  it("Form 1099-R - zero forms produces all-zero result", () => {
    const result = calculateForm1099R([]);
    expect(result.iraTaxable).toEqual(new Decimal(0));
    expect(result.pensionTaxable).toEqual(new Decimal(0));
    expect(result.federalWithholding).toEqual(new Decimal(0));
    expect(result.iraGrossReported).toEqual(new Decimal(0));
    expect(result.pensionGrossReported).toEqual(new Decimal(0));
  });
});

// ── Employee Contributions (Box 5) ──────────────────────────

describe("Form 1099-R Employee Contributions boundaries", () => {
  it("Form 1099-R - non-IRA with employee contributions: taxable = gross minus contributions", () => {
    const result = calculateForm1099R([
      parse1099R({
        payer: "Employer Pension",
        grossDistribution: "50000",
        employeeContributions: "15000",
        distributionCode: "7",
        iraSepSimple: false,
      }),
    ]);
    expect(result.pensionTaxable).toEqual(new Decimal(35000));
  });

  it("Form 1099-R - employee contributions equal to gross: $0 taxable", () => {
    const result = calculateForm1099R([
      parse1099R({
        payer: "Employer Pension",
        grossDistribution: "50000",
        employeeContributions: "50000",
        distributionCode: "7",
        iraSepSimple: false,
      }),
    ]);
    expect(result.pensionTaxable).toEqual(new Decimal(0));
    expect(result.pensionGrossReported).toEqual(new Decimal(50000));
  });

  it("Form 1099-R - employee contributions exceed gross: taxable floors at $0", () => {
    const result = calculateForm1099R([
      parse1099R({
        payer: "Employer Pension",
        grossDistribution: "50000",
        employeeContributions: "60000",
        distributionCode: "7",
        iraSepSimple: false,
      }),
    ]);
    expect(result.pensionTaxable).toEqual(new Decimal(0));
  });
});
