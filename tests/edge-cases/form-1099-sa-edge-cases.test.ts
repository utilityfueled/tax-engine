/**
 * Edge case tests for Form 1099-SA HSA distribution aggregation boundaries.
 * Spec: spec/federal/form-1099-sa.yaml
 *
 * Tests cover distribution code routing, post-death earnings boundaries,
 * owner-attribution edge cases, beneficiary role interactions, and
 * prohibited-transaction isolation.
 */

import { describe, expect, it } from "vitest";
import { calculateForm1099SA, mergeForm1099SAIntoForm8889Input } from "@/engine/forms/form-1099-sa.js";
import { Form1099SASchema } from "@/models/inputs.js";
import type { Form1099SA, Taxpayer, Form8889Input } from "@/models/inputs.js";

function parseHsa(data: Record<string, unknown>): Form1099SA {
  return Form1099SASchema.parse({ accountType: "hsa", ...data });
}

describe("Form 1099-SA edge cases", () => {
  // ── Zero and boundary distribution amounts ──────────────────

  it("Form 1099-SA Line 1 - zero gross distribution aggregates to zero without errors", () => {
    const result = calculateForm1099SA([
      parseHsa({
        payer: "Zero HSA Custodian",
        grossDistribution: "0",
        distributionCode: "1",
      }),
    ]);

    expect(result.hsaGrossDistributions.toNumber()).toBe(0);
    expect(result.hsaReturnedExcessContributions.toNumber()).toBe(0);
    expect(result.hsaReturnedExcessContributionEarnings.toNumber()).toBe(0);
  });

  it("Form 1099-SA Line 3 - code 2 with zero earnings produces no taxable other income", () => {
    const result = calculateForm1099SA([
      parseHsa({
        payer: "Excess Return Custodian",
        grossDistribution: "500",
        earningsOnExcessContributions: "0",
        distributionCode: "2",
      }),
    ]);

    expect(result.hsaReturnedExcessContributions.toNumber()).toBe(500);
    expect(result.hsaReturnedExcessContributionEarnings.toNumber()).toBe(0);
    expect(result.hsaGrossDistributions.toNumber()).toBe(500);
  });

  it("Form 1099-SA Line 1 - very large distribution preserves Decimal precision", () => {
    const result = calculateForm1099SA([
      parseHsa({
        payer: "Large HSA Custodian",
        grossDistribution: "999999999.99",
        distributionCode: "1",
      }),
    ]);

    expect(result.hsaGrossDistributions.toString()).toBe("999999999.99");
  });

  // ── Post-death earnings boundary conditions ─────────────────

  it("Form 1099-SA Line 6 - post-death earnings are zero when Box 1 exactly equals Box 4 FMV", () => {
    const result = calculateForm1099SA([
      parseHsa({
        payer: "Death Dist Custodian",
        grossDistribution: "25000",
        distributionCode: "4",
        fmvOnDateOfDeath: "25000",
        beneficiaryRole: "other_beneficiary",
        deathDistributionTiming: "year_of_death",
      }),
    ]);

    expect(result.hsaDeathDistributionDateOfDeathValue.toNumber()).toBe(25000);
    expect(result.hsaPostDeathEarnings.toNumber()).toBe(0);
  });

  it("Form 1099-SA Line 6 - post-death earnings clamp to zero when Box 4 FMV exceeds Box 1", () => {
    const result = calculateForm1099SA([
      parseHsa({
        payer: "Death Dist Custodian",
        grossDistribution: "20000",
        distributionCode: "4",
        fmvOnDateOfDeath: "25000",
        beneficiaryRole: "other_beneficiary",
        deathDistributionTiming: "year_of_death",
      }),
    ]);

    expect(result.hsaDeathDistributionDateOfDeathValue.toNumber()).toBe(25000);
    expect(result.hsaPostDeathEarnings.toNumber()).toBe(0);
  });

  it("Form 1099-SA Line 6 - post-death earnings are $1 when Box 1 exceeds Box 4 by exactly $1", () => {
    const result = calculateForm1099SA([
      parseHsa({
        payer: "Death Dist Custodian",
        grossDistribution: "25001",
        distributionCode: "4",
        fmvOnDateOfDeath: "25000",
        beneficiaryRole: "other_beneficiary",
        deathDistributionTiming: "year_of_death",
      }),
    ]);

    expect(result.hsaPostDeathEarnings.toNumber()).toBe(1);
  });

  // ── All distribution codes in one aggregate ─────────────────

  it("Form 1099-SA Lines 1-7 - all distribution codes route correctly when aggregated together", () => {
    const result = calculateForm1099SA([
      parseHsa({
        payer: "HSA Custodian",
        grossDistribution: "1000",
        distributionCode: "1",
      }),
      parseHsa({
        payer: "HSA Custodian",
        grossDistribution: "500",
        earningsOnExcessContributions: "50",
        distributionCode: "2",
      }),
      parseHsa({
        payer: "HSA Custodian",
        grossDistribution: "2000",
        distributionCode: "3",
      }),
      parseHsa({
        payer: "HSA Custodian",
        grossDistribution: "30000",
        distributionCode: "4",
        fmvOnDateOfDeath: "28000",
        beneficiaryRole: "other_beneficiary",
        deathDistributionTiming: "year_of_death",
      }),
      parseHsa({
        payer: "HSA Custodian",
        grossDistribution: "800",
        distributionCode: "5",
      }),
      parseHsa({
        payer: "HSA Custodian",
        grossDistribution: "15000",
        distributionCode: "6",
        fmvOnDateOfDeath: "14000",
        beneficiaryRole: "other_beneficiary",
        deathDistributionTiming: "after_year_of_death",
      }),
    ]);

    // Line 1: code 1 ($1000) + code 2 ($500) + code 3 ($2000) + code 5 ($800) ordinary
    //   + death FMV: code 4 ($28000) + code 6 ($14000) = $46300
    expect(result.hsaGrossDistributions.toNumber()).toBe(46300);
    // Line 2: code 2 gross
    expect(result.hsaReturnedExcessContributions.toNumber()).toBe(500);
    // Line 3: code 2 Box 2 earnings
    expect(result.hsaReturnedExcessContributionEarnings.toNumber()).toBe(50);
    // Line 4: code 3 disability
    expect(result.hsaDisabilityExceptionDistributions.toNumber()).toBe(2000);
    // Line 5: death FMV (code 4 + code 6)
    expect(result.hsaDeathDistributionDateOfDeathValue.toNumber()).toBe(42000);
    // Line 6: post-death earnings: (30000-28000) + (15000-14000) = 3000
    expect(result.hsaPostDeathEarnings.toNumber()).toBe(3000);
    // Line 7: code 5 prohibited transactions
    expect(result.hsaProhibitedTransactionDistributions.toNumber()).toBe(800);
  });

  // ── Empty forms ─────────────────────────────────────────────

  it("Form 1099-SA - empty forms array returns all-zero result", () => {
    const result = calculateForm1099SA([]);

    expect(result.hsaGrossDistributions.toNumber()).toBe(0);
    expect(result.hsaReturnedExcessContributions.toNumber()).toBe(0);
    expect(result.hsaReturnedExcessContributionEarnings.toNumber()).toBe(0);
    expect(result.hsaDisabilityExceptionDistributions.toNumber()).toBe(0);
    expect(result.hsaDeathDistributionDateOfDeathValue.toNumber()).toBe(0);
    expect(result.hsaPostDeathEarnings.toNumber()).toBe(0);
    expect(result.hsaProhibitedTransactionDistributions.toNumber()).toBe(0);
    expect(result.defaultAccountOwner).toBeUndefined();
  });

  it("Form 1099-SA - undefined forms array returns all-zero result", () => {
    const result = calculateForm1099SA(undefined as unknown as Form1099SA[]);

    expect(result.hsaGrossDistributions.toNumber()).toBe(0);
    expect(result.hsaReturnedExcessContributions.toNumber()).toBe(0);
  });

  // ── Non-HSA account types are filtered out ──────────────────

  it("Form 1099-SA Line 1 - Archer MSA records are excluded from HSA aggregation", () => {
    const result = calculateForm1099SA([
      Form1099SASchema.parse({
        payer: "MSA Custodian",
        grossDistribution: "5000",
        distributionCode: "1",
        accountType: "archer_msa",
      }),
      parseHsa({
        payer: "HSA Custodian",
        grossDistribution: "3000",
        distributionCode: "1",
      }),
    ]);

    expect(result.hsaGrossDistributions.toNumber()).toBe(3000);
  });

  // ── Owner attribution edge cases ────────────────────────────

  it("Form 1099-SA - single primary-tagged owner defaults account owner to primary", () => {
    const result = calculateForm1099SA([
      parseHsa({
        payer: "HSA Custodian",
        grossDistribution: "1000",
        distributionCode: "1",
        accountHolder: "primary",
      }),
    ]);

    expect(result.defaultAccountOwner).toBe("primary");
    expect(result.accountOwnerSupport.primary.hsaGrossDistributions.toNumber()).toBe(1000);
    expect(result.accountOwnerSupport.spouse.hsaGrossDistributions.toNumber()).toBe(0);
  });

  it("Form 1099-SA - single spouse-tagged owner defaults account owner to spouse", () => {
    const result = calculateForm1099SA([
      parseHsa({
        payer: "HSA Custodian",
        grossDistribution: "2000",
        distributionCode: "1",
        accountHolder: "spouse",
      }),
    ]);

    expect(result.defaultAccountOwner).toBe("spouse");
    expect(result.accountOwnerSupport.spouse.hsaGrossDistributions.toNumber()).toBe(2000);
    expect(result.accountOwnerSupport.primary.hsaGrossDistributions.toNumber()).toBe(0);
  });

  it("Form 1099-SA - mixed primary and spouse tags leave defaultAccountOwner undefined", () => {
    const result = calculateForm1099SA([
      parseHsa({
        payer: "Primary HSA Custodian",
        grossDistribution: "1000",
        distributionCode: "1",
        accountHolder: "primary",
      }),
      parseHsa({
        payer: "Spouse HSA Custodian",
        grossDistribution: "2000",
        distributionCode: "1",
        accountHolder: "spouse",
      }),
    ]);

    expect(result.defaultAccountOwner).toBeUndefined();
    expect(result.accountOwnerSupport.primary.hsaGrossDistributions.toNumber()).toBe(1000);
    expect(result.accountOwnerSupport.spouse.hsaGrossDistributions.toNumber()).toBe(2000);
  });

  it("Form 1099-SA - untagged records leave defaultAccountOwner undefined when tagged records exist", () => {
    const result = calculateForm1099SA([
      parseHsa({
        payer: "Tagged HSA Custodian",
        grossDistribution: "1000",
        distributionCode: "1",
        accountHolder: "primary",
      }),
      parseHsa({
        payer: "Untagged HSA Custodian",
        grossDistribution: "500",
        distributionCode: "1",
      }),
    ]);

    expect(result.defaultAccountOwner).toBeUndefined();
    expect(result.unattributedSupport.hsaGrossDistributions.toNumber()).toBe(500);
  });

  // ── Surviving spouse beneficiary routing ────────────────────

  it("Form 1099-SA - surviving spouse code 4 year-of-death stays on ordinary HSA path, not death branch", () => {
    const result = calculateForm1099SA([
      parseHsa({
        payer: "Inherited HSA Custodian",
        grossDistribution: "10000",
        distributionCode: "4",
        fmvOnDateOfDeath: "10000",
        beneficiaryRole: "surviving_spouse",
        deathDistributionTiming: "year_of_death",
      }),
    ]);

    // Surviving spouse uses ordinary Box 1, not the death-distribution Box 4 path
    expect(result.hsaGrossDistributions.toNumber()).toBe(10000);
    expect(result.hsaDeathDistributionDateOfDeathValue.toNumber()).toBe(0);
    expect(result.hsaPostDeathEarnings.toNumber()).toBe(0);
    // Relationship to the decedent does not identify a return owner.
    expect(result.defaultAccountOwner).toBeUndefined();
    expect(result.unattributedSupport.hsaGrossDistributions.toString()).toBe("10000");
  });

  it("Form 1099-SA - non-spouse code 4 year-of-death uses death-distribution FMV path", () => {
    const result = calculateForm1099SA([
      parseHsa({
        payer: "Inherited HSA Custodian",
        grossDistribution: "12000",
        distributionCode: "4",
        fmvOnDateOfDeath: "10000",
        beneficiaryRole: "other_beneficiary",
        deathDistributionTiming: "year_of_death",
      }),
    ]);

    expect(result.hsaDeathDistributionDateOfDeathValue.toNumber()).toBe(10000);
    expect(result.hsaOtherBeneficiaryDeathDistributionDateOfDeathValue.toNumber()).toBe(10000);
    expect(result.hsaPostDeathEarnings.toNumber()).toBe(2000);
  });

  // ── Estate vs other-beneficiary separation ──────────────────

  it("Form 1099-SA Line 5 - estate and other-beneficiary death distributions preserve separate subtotals", () => {
    const result = calculateForm1099SA([
      parseHsa({
        payer: "Estate HSA Custodian",
        grossDistribution: "20000",
        distributionCode: "4",
        fmvOnDateOfDeath: "18000",
        beneficiaryRole: "estate",
        deathDistributionTiming: "year_of_death",
      }),
      parseHsa({
        payer: "Beneficiary HSA Custodian",
        grossDistribution: "15000",
        distributionCode: "6",
        fmvOnDateOfDeath: "14000",
        beneficiaryRole: "other_beneficiary",
        deathDistributionTiming: "after_year_of_death",
      }),
    ]);

    expect(result.hsaDeathDistributionDateOfDeathValue.toNumber()).toBe(32000);
    expect(result.hsaEstateDeathDistributionDateOfDeathValue.toNumber()).toBe(18000);
    expect(result.hsaOtherBeneficiaryDeathDistributionDateOfDeathValue.toNumber()).toBe(14000);
    // Post-death earnings: (20000-18000) + (15000-14000) = 3000
    expect(result.hsaPostDeathEarnings.toNumber()).toBe(3000);
  });

  // ── Prohibited transaction isolation ────────────────────────

  it("Form 1099-SA Line 7 - code 5 prohibited transactions aggregate separately from regular distributions", () => {
    const result = calculateForm1099SA([
      parseHsa({
        payer: "HSA Custodian",
        grossDistribution: "3000",
        distributionCode: "1",
      }),
      parseHsa({
        payer: "HSA Custodian",
        grossDistribution: "1500",
        distributionCode: "5",
      }),
    ]);

    // Both are counted in gross distributions for Form 8889 Line 14a
    expect(result.hsaGrossDistributions.toNumber()).toBe(4500);
    // Only code 5 is in the prohibited-transaction deemed-distribution bucket
    expect(result.hsaProhibitedTransactionDistributions.toNumber()).toBe(1500);
  });

  // ── mergeForm1099SAIntoForm8889Input edge cases ─────────────

  it("merge - returns undefined when no forms and no explicit input", () => {
    const emptyResult = calculateForm1099SA([]);
    const merged = mergeForm1099SAIntoForm8889Input(undefined, emptyResult);

    expect(merged).toBeUndefined();
  });

  it("merge - auto-builds Form 8889 when HSA distributions exist but no explicit input", () => {
    const result = calculateForm1099SA([
      parseHsa({
        payer: "HSA Custodian",
        grossDistribution: "5000",
        distributionCode: "1",
      }),
    ]);
    const merged = mergeForm1099SAIntoForm8889Input(undefined, result);

    expect(merged).toBeDefined();
    expect(merged!.distributionsReceived).toBe("5000");
    expect(merged!.accountOwner).toBe("primary");
  });

  it("merge - defaults unattributed HSA distributions to primary for single filers", () => {
    const result = calculateForm1099SA([
      parseHsa({
        payer: "HSA Custodian",
        grossDistribution: "3000",
        distributionCode: "1",
      }),
    ]);
    const singleFiler: Taxpayer = {
      filingStatus: "single" as const,
      primary: {
        firstName: "Test",
        lastName: "Person",
        ssn: "123-45-6789",
        dateOfBirth: "1980-01-15",
      },
    };
    const merged = mergeForm1099SAIntoForm8889Input(undefined, result, singleFiler);

    expect(merged).toBeDefined();
    expect(merged!.accountOwner).toBe("primary");
    expect(merged!.distributionsReceived).toBe("3000");
  });

  it("merge - keeps unattributed HSA records manual for married filers with spouse context", () => {
    const result = calculateForm1099SA([
      parseHsa({
        payer: "HSA Custodian",
        grossDistribution: "3000",
        distributionCode: "1",
      }),
    ]);
    const marriedFiler: Taxpayer = {
      filingStatus: "married_filing_jointly" as const,
      primary: {
        firstName: "Test",
        lastName: "Person",
        ssn: "123-45-6789",
        dateOfBirth: "1980-01-15",
      },
      spouse: {
        firstName: "Spouse",
        lastName: "Person",
        ssn: "987-65-4321",
        dateOfBirth: "1982-03-20",
      },
    };
    const merged = mergeForm1099SAIntoForm8889Input(undefined, result, marriedFiler);

    // Unattributed records stay manual on married returns - no auto-build
    expect(merged).toBeUndefined();
  });

  it("merge - disability and death exceptions combine into the automatic exception amount", () => {
    const result = calculateForm1099SA([
      parseHsa({
        payer: "HSA Custodian",
        grossDistribution: "5000",
        distributionCode: "3",
      }),
      parseHsa({
        payer: "HSA Custodian",
        grossDistribution: "20000",
        distributionCode: "4",
        fmvOnDateOfDeath: "18000",
        beneficiaryRole: "other_beneficiary",
        deathDistributionTiming: "year_of_death",
      }),
    ]);
    const merged = mergeForm1099SAIntoForm8889Input(undefined, result);

    expect(merged).toBeDefined();
    // Automatic exception = disability ($5000) + death FMV ($18000) = $23000
    expect(merged!.distributionsNotSubjectToAdditionalTax).toBe("23000");
    expect(merged!.supported1099SAAutomaticExceptionDistributions).toBe("23000");
  });

  it("merge - preserves an explicit Form 8889 exception amount that already exceeds the automatic amount", () => {
    const result = calculateForm1099SA([
      parseHsa({
        payer: "HSA Custodian",
        grossDistribution: "5000",
        distributionCode: "3",
      }),
    ]);
    const merged = mergeForm1099SAIntoForm8889Input(
      {
        accountOwner: "primary" as const,
        distributionsNotSubjectToAdditionalTax: "10000",
      } as Partial<Form8889Input> as Form8889Input,
      result
    );

    expect(merged).toBeDefined();
    // Explicit $10000 exceeds automatic $5000, so it stays
    expect(merged!.distributionsNotSubjectToAdditionalTax).toBe("10000");
  });

  it("merge - adds automatic exception to explicit amount when explicit is less than automatic", () => {
    const result = calculateForm1099SA([
      parseHsa({
        payer: "HSA Custodian",
        grossDistribution: "5000",
        distributionCode: "3",
      }),
    ]);
    const merged = mergeForm1099SAIntoForm8889Input(
      {
        accountOwner: "primary" as const,
        distributionsNotSubjectToAdditionalTax: "1000",
      } as Partial<Form8889Input> as Form8889Input,
      result
    );

    expect(merged).toBeDefined();
    // Automatic $5000 > explicit $1000, so combined = $5000 + $1000 = $6000
    expect(merged!.distributionsNotSubjectToAdditionalTax).toBe("6000");
  });

  // ── Schema validation edge cases ────────────────────────────

  it("Form 1099-SA schema - rejects Box 4 FMV on ordinary code 1 without surviving-spouse timing metadata", () => {
    const parsed = Form1099SASchema.safeParse({
      payer: "HSA Custodian",
      grossDistribution: "5000",
      distributionCode: "1",
      fmvOnDateOfDeath: "5000",
      accountType: "hsa",
    });

    expect(parsed.success).toBe(false);
  });

  it("Form 1099-SA schema - allows Box 4 FMV on code 1 with surviving-spouse after-year-of-death timing", () => {
    const parsed = Form1099SASchema.safeParse({
      payer: "HSA Custodian",
      grossDistribution: "5000",
      distributionCode: "1",
      fmvOnDateOfDeath: "5000",
      beneficiaryRole: "surviving_spouse",
      deathDistributionTiming: "after_year_of_death",
      accountType: "hsa",
    });

    expect(parsed.success).toBe(true);
  });

  it("Form 1099-SA schema - rejects surviving-spouse with code 6", () => {
    const parsed = Form1099SASchema.safeParse({
      payer: "HSA Custodian",
      grossDistribution: "5000",
      distributionCode: "6",
      fmvOnDateOfDeath: "5000",
      beneficiaryRole: "surviving_spouse",
      accountType: "hsa",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) =>
      issue.path.join(".") === "beneficiaryRole"
      && issue.message.includes("code 6")
    )).toBe(true);
  });

  it("Form 1099-SA schema - rejects estate beneficiary with code 6", () => {
    const parsed = Form1099SASchema.safeParse({
      payer: "HSA Custodian",
      grossDistribution: "5000",
      distributionCode: "6",
      fmvOnDateOfDeath: "5000",
      beneficiaryRole: "estate",
      accountType: "hsa",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) =>
      issue.path.join(".") === "distributionCode"
      && issue.message.includes("code 4")
    )).toBe(true);
  });

  it("Form 1099-SA schema - preserves the actual primary surviving-beneficiary owner", () => {
    const parsed = Form1099SASchema.safeParse({
      payer: "HSA Custodian",
      grossDistribution: "5000",
      distributionCode: "4",
      fmvOnDateOfDeath: "5000",
      beneficiaryRole: "surviving_spouse",
      deathDistributionTiming: "year_of_death",
      accountHolder: "primary",
      accountType: "hsa",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) throw parsed.error;
    expect(parsed.data.accountHolder).toBe("primary");
    expect(calculateForm1099SA([parsed.data]).accountOwnerSupport.primary.hsaGrossDistributions.toString()).toBe("5000");
  });

  it("Form 1099-SA schema - requires Box 4 FMV for death codes 4 and 6", () => {
    const code4Parsed = Form1099SASchema.safeParse({
      payer: "HSA Custodian",
      grossDistribution: "10000",
      distributionCode: "4",
      accountType: "hsa",
    });

    const code6Parsed = Form1099SASchema.safeParse({
      payer: "HSA Custodian",
      grossDistribution: "10000",
      distributionCode: "6",
      accountType: "hsa",
    });

    expect(code4Parsed.success).toBe(false);
    expect(code4Parsed.error?.issues.some((issue) =>
      issue.path.join(".") === "fmvOnDateOfDeath"
    )).toBe(true);
    expect(code6Parsed.success).toBe(false);
    expect(code6Parsed.error?.issues.some((issue) =>
      issue.path.join(".") === "fmvOnDateOfDeath"
    )).toBe(true);
  });

  it("Form 1099-SA schema - rejects trustee-to-trustee transfer marker", () => {
    const parsed = Form1099SASchema.safeParse({
      payer: "HSA Custodian",
      grossDistribution: "5000",
      distributionCode: "1",
      trusteeToTrusteeTransfer: true,
      accountType: "hsa",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) =>
      issue.path.join(".") === "trusteeToTrusteeTransfer"
    )).toBe(true);
  });
});
