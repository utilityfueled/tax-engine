/**
 * Schema tests for Social Security lump-sum election inputs.
 */

import { describe, expect, it } from "vitest";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

describe("Social Security lump-sum election schema", () => {
  it("accepts an earlier-year delayed-benefit total that exactly matches the current-year SSA/RRB benefits", () => {
    const parsed = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      formSSA1099: [
        {
          recipient: "Jane Doe",
          netBenefits: "5000",
          federalWithheld: "0",
        },
      ],
      socialSecurityLumpSumElection: {
        currentYearExclusionsAdjustments: "0",
        earlierYears: [
          {
            taxYear: 2024,
            filingStatus: "single",
            benefitsReceivedInEarlierYear: "12000",
            delayedBenefitsReceivedInCurrentYear: "5000",
            adjustedGrossIncome: "25000",
            taxExemptInterest: "0",
            exclusionsAdjustments: "0",
            taxableBenefitsPreviouslyReported: "1500",
          },
        ],
      },
    });

    expect(parsed.socialSecurityLumpSumElection?.earlierYears[0]?.taxYear).toBe(2024);
    expect(parsed.socialSecurityLumpSumElection?.earlierYears[0]?.delayedBenefitsReceivedInCurrentYear).toBe("5000");
  });

  it("rejects lump-sum election years that are the current tax year or later", () => {
    const parsed = TaxYearInputSchema.safeParse({
      ...simpleW2Fixture,
      formSSA1099: [
        {
          recipient: "Jane Doe",
          netBenefits: "5000",
          federalWithheld: "0",
        },
      ],
      socialSecurityLumpSumElection: {
        currentYearExclusionsAdjustments: "0",
        earlierYears: [
          {
            taxYear: 2025,
            filingStatus: "single",
            benefitsReceivedInEarlierYear: "12000",
            delayedBenefitsReceivedInCurrentYear: "2000",
            adjustedGrossIncome: "25000",
            taxExemptInterest: "0",
            exclusionsAdjustments: "0",
            taxableBenefitsPreviouslyReported: "1500",
          },
        ],
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Each lump-sum election earlier year must be before the current tax year",
          path: ["socialSecurityLumpSumElection", "earlierYears", 0, "taxYear"],
        }),
      ])
    );
  });

  it("rejects delayed earlier-year benefit totals that exceed the current-year SSA/RRB benefits", () => {
    const parsed = TaxYearInputSchema.safeParse({
      ...simpleW2Fixture,
      formSSA1099: [
        {
          recipient: "Jane Doe",
          netBenefits: "5000",
          federalWithheld: "0",
        },
      ],
      socialSecurityLumpSumElection: {
        currentYearExclusionsAdjustments: "0",
        earlierYears: [
          {
            taxYear: 2023,
            filingStatus: "single",
            benefitsReceivedInEarlierYear: "12000",
            delayedBenefitsReceivedInCurrentYear: "3000",
            adjustedGrossIncome: "25000",
            taxExemptInterest: "0",
            exclusionsAdjustments: "0",
            taxableBenefitsPreviouslyReported: "1500",
          },
          {
            taxYear: 2024,
            filingStatus: "single",
            benefitsReceivedInEarlierYear: "13000",
            delayedBenefitsReceivedInCurrentYear: "2501",
            adjustedGrossIncome: "26000",
            taxExemptInterest: "0",
            exclusionsAdjustments: "0",
            taxableBenefitsPreviouslyReported: "1800",
          },
        ],
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            "Combined delayed earlier-year benefits cannot exceed the current-year SSA-1099 and RRB-1099 benefits",
          path: ["socialSecurityLumpSumElection", "earlierYears"],
        }),
      ])
    );
  });
});
