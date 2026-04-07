import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { loadFromDirectory } from "@/ingest/loader.js";
import { complexMFJFixture, simpleW2Fixture } from "../fixtures/simple-w2.js";

const tempDirs: string[] = [];

function writeJsonDirectory(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "tax-engine-loader-"));
  tempDirs.push(dir);

  for (const [filename, value] of Object.entries(files)) {
    writeFileSync(join(dir, filename), JSON.stringify(value, null, 2));
  }

  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("loadFromDirectory", () => {
  it("loads retirement and HSA JSON files with advanced schema fields", () => {
    const dir = writeJsonDirectory({
      "taxpayer.json": simpleW2Fixture.taxpayer,
      "1099-r.json": [
        {
          payer: "Traditional IRA Custodian",
          grossDistribution: "24000",
          taxableAmount: "18000",
          federalIncomeTaxWithheld: "2400",
          distributionCode: "7",
          iraSepSimple: true,
          accountHolder: "primary",
          qualifiedCharitableDistribution: "1000",
          rothConversionAmount: "3000",
        },
        {
          payer: "City Pension Trust",
          grossDistribution: "12000",
          taxableAmount: "9000",
          federalIncomeTaxWithheld: "1200",
          distributionCode: "7",
          iraSepSimple: false,
          accountHolder: "primary",
          simplifiedMethodCostInPlan: "12000",
          simplifiedMethodAnnuityStartingDate: "2025-01-01",
          simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 65,
          simplifiedMethodPaymentsReceivedThisYear: 12,
        },
      ],
      "1099-sa.json": [
        {
          payer: "HSA Bank",
          grossDistribution: "5300",
          earningsOnExcessContributions: "250",
          distributionCode: "6",
          fmvOnDateOfDeath: "5000",
          accountType: "hsa",
          beneficiaryRole: "other_beneficiary",
          deathDistributionTiming: "after_year_of_death",
        },
      ],
      "ssa-1099.json": [
        {
          recipient: "Jane Doe",
          netBenefits: "18000",
          federalWithheld: "1200",
        },
      ],
      "rrb-1099.json": [
        {
          recipient: "Jane Doe",
          netSocialSecurityEquivalentBenefitPortion: "4000",
          federalWithheld: "300",
        },
      ],
      "8606.json": {
        nondeductibleContributions: "7000",
        priorYearBasis: "12000",
        yearEndValue: "15000",
        traditionalDistributions: "9000",
        rothConversions: "3000",
      },
      "8889.json": {
        accountOwner: "primary",
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "1500",
        qualifiedMedicalExpenses: "500",
        distributionsReceived: "5300",
      },
      "social-security-lump-sum-election.json": {
        earlierYears: [
          {
            taxYear: 2024,
            filingStatus: "single",
            benefitsReceivedInEarlierYear: "0",
            delayedBenefitsReceivedInCurrentYear: "3000",
            adjustedGrossIncome: "45000",
            taxableBenefitsPreviouslyReported: "0",
          },
        ],
      },
    });

    const input = loadFromDirectory(dir);

    expect(input.form1099R).toHaveLength(2);
    expect(input.form1099R?.[0].accountHolder).toBe("primary");
    expect(input.form1099R?.[0].qualifiedCharitableDistribution?.toString()).toBe("1000");
    expect(input.form1099R?.[0].rothConversionAmount?.toString()).toBe("3000");
    expect(input.form1099R?.[1].simplifiedMethodPaymentsReceivedThisYear).toBe(12);

    expect(input.form1099SA).toHaveLength(1);
    expect(input.form1099SA?.[0].beneficiaryRole).toBe("other_beneficiary");
    expect(input.form1099SA?.[0].deathDistributionTiming).toBe("after_year_of_death");
    expect(input.form1099SA?.[0].fmvOnDateOfDeath?.toString()).toBe("5000");
    expect(input.form1099SA?.[0].earningsOnExcessContributions?.toString()).toBe("250");

    expect(input.formSSA1099?.[0].netBenefits.toString()).toBe("18000");
    expect(input.formRRB1099?.[0].netSocialSecurityEquivalentBenefitPortion.toString()).toBe("4000");

    expect(input.form8606?.priorYearBasis?.toString()).toBe("12000");
    expect(input.form8889?.accountOwner).toBe("primary");
    expect(input.socialSecurityLumpSumElection?.earlierYears[0]?.taxYear).toBe(2024);
  });

  it("loads owner-specific retirement and HSA forms when by-owner files are present", () => {
    const dir = writeJsonDirectory({
      "taxpayer.json": complexMFJFixture.taxpayer,
      "8606-by-owner.json": {
        primary: {
          nondeductibleContributions: "7000",
          priorYearBasis: "12000",
          yearEndValue: "15000",
          traditionalDistributions: "9000",
          rothConversions: "0",
        },
        spouse: {
          nondeductibleContributions: "5000",
          priorYearBasis: "8000",
          yearEndValue: "9000",
          traditionalDistributions: "4000",
          rothConversions: "0",
        },
      },
      "8889-by-owner.json": {
        primary: {
          accountOwner: "primary",
          coverageByMonth: Array(12).fill("family"),
          bothSpousesHaveHsas: true,
          contributionsMade: "2000",
        },
        spouse: {
          accountOwner: "spouse",
          coverageByMonth: Array(12).fill("family"),
          bothSpousesHaveHsas: true,
          contributionsMade: "1000",
        },
      },
    });

    const input = loadFromDirectory(dir);

    expect(input.form8606ByOwner?.primary?.priorYearBasis?.toString()).toBe("12000");
    expect(input.form8606ByOwner?.spouse?.priorYearBasis?.toString()).toBe("8000");
    expect(input.form8606ByOwner?.spouse?.yearEndValue.toString()).toBe("9000");

    expect(input.form8889ByOwner?.primary?.accountOwner).toBe("primary");
    expect(input.form8889ByOwner?.spouse?.accountOwner).toBe("spouse");
    expect(input.form8889ByOwner?.spouse?.bothSpousesHaveHsas).toBe(true);
  });

  it("keeps missing retirement and HSA files optional instead of throwing", () => {
    const dir = writeJsonDirectory({
      "taxpayer.json": simpleW2Fixture.taxpayer,
    });

    const input = loadFromDirectory(dir);

    expect(input.form1099R).toBeUndefined();
    expect(input.form1099SA).toBeUndefined();
    expect(input.form8606).toBeUndefined();
    expect(input.form8606ByOwner).toBeUndefined();
    expect(input.form8889).toBeUndefined();
    expect(input.form8889ByOwner).toBeUndefined();
    expect(input.formSSA1099).toBeUndefined();
    expect(input.formRRB1099).toBeUndefined();
    expect(input.socialSecurityLumpSumElection).toBeUndefined();
  });
});
