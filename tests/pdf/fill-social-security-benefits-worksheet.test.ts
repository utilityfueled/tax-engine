/**
 * Spec: spec/federal/social-security-benefits-worksheet.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildSocialSecurityBenefitsWorksheetReferenceSummary,
  SOCIAL_SECURITY_BENEFITS_WORKSHEET_REFERENCE_FILENAME,
} from "@/pdf/fill-social-security-benefits-worksheet.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-ss-worksheet-"));
}

describe("Social Security Benefits Worksheet packet reference summary", () => {
  it("buildSocialSecurityBenefitsWorksheetReferenceSummary keeps the packet artifact reference-only and limited to supported worksheet outputs", () => {
    const socialSecurityFixture = {
      ...simpleW2Fixture,
      w2s: [],
      form1099Int: [
        {
          payer: "Bank",
          interestIncome: "25500",
          federalWithheld: "0",
          earlyWithdrawalPenalty: "0",
          usSavingsBondInterest: "0",
          taxExemptInterest: "0",
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

    const result = calculateFederalTax(socialSecurityFixture);
    const summary = buildSocialSecurityBenefitsWorksheetReferenceSummary(socialSecurityFixture, result);

    expect(summary.title).toBe("Social Security Benefits Worksheet Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.sections).toEqual([
      {
        heading: "Benefit inputs",
        lines: [
          {
            line: "SSA-1099",
            description: "SSA-1099 Box 5 net benefits",
            value: "11000",
            formula: "Sum of supported SSA-1099 Box 5 net benefits",
          },
          {
            line: "RRB-1099",
            description: "RRB-1099 Box 5 tier 1 equivalent benefits",
            value: "0",
            formula: "Sum of supported RRB-1099 Box 5 tier 1 equivalent benefits",
          },
          {
            line: "1040-6a",
            description: "Form 1040 Line 6a gross benefits",
            value: "11000",
            formula: "SSA-1099 total + RRB-1099 total",
          },
        ],
      },
      {
        heading: "Social Security Benefits Worksheet",
        lines: [
          {
            line: "1",
            description: "Total Social Security benefits",
            value: "11000",
            formula: "Sum SSA-1099 Box 5 and RRB-1099 tier 1 equivalent Box 5 benefits",
          },
          {
            line: "2",
            description: "One-half of benefits",
            value: "5500",
            formula: "Line 1 / 2",
          },
          {
            line: "3",
            description: "Other income included in provisional income",
            value: "25500",
            formula: "Form 1040 income other than Social Security benefits",
          },
          {
            line: "4",
            description: "Tax-exempt interest",
            value: "0",
            formula: "Form 1040 Line 2a",
          },
          {
            line: "5",
            description: "Subtotal before adjustments",
            value: "31000",
            formula: "Line 2 + Line 3 + Line 4",
          },
          {
            line: "6",
            description: "Adjustments added back for provisional income",
            value: "0",
            formula: "Supported Schedule 1 add-back categories",
          },
          {
            line: "7",
            description: "Provisional income",
            value: "31000",
            formula: "Line 5 - Line 6",
          },
          {
            line: "8",
            description: "Base amount",
            value: "25000",
            formula: "Single/HOH/QSS or MFS living apart threshold",
          },
          {
            line: "9",
            description: "Excess over base amount",
            value: "6000",
            formula: "max(0, Line 7 - Line 8)",
          },
          {
            line: "10",
            description: "Second-tier width",
            value: "9000",
            formula: "Single/HOH/QSS width",
          },
          {
            line: "11",
            description: "Excess over second-tier width",
            value: "0",
            formula: "max(0, Line 9 - Line 10)",
          },
          {
            line: "12",
            description: "Lower-tier amount subject to 50% inclusion",
            value: "6000",
            formula: "min(Line 9, Line 10)",
          },
          {
            line: "13",
            description: "Half of the lower-tier amount",
            value: "3000",
            formula: "Line 12 / 2",
          },
          {
            line: "14",
            description: "50% inclusion amount",
            value: "3000",
            formula: "min(Line 2, Line 13)",
          },
          {
            line: "15",
            description: "85% of the upper-tier excess",
            value: "0",
            formula: "Line 11 x 85%",
          },
          {
            line: "16",
            description: "Tentative taxable benefits",
            value: "3000",
            formula: "Line 14 + Line 15",
          },
          {
            line: "17",
            description: "Maximum taxable benefits",
            value: "9350",
            formula: "Line 1 x 85%",
          },
          {
            line: "18",
            description: "Taxable Social Security benefits",
            value: "3000",
            formula: "min(Line 16, Line 17)",
          },
        ],
      },
      {
        heading: "Pub. 915 lump-sum election",
        lines: [
          {
            line: "standard",
            description: "Standard worksheet taxable benefits",
            value: "3000",
            formula: "Social Security Benefits Worksheet Line 18 before the election comparison",
          },
          {
            line: "W4-21",
            description: "Pub. 915 Worksheet 4 taxable benefits",
            value: "2500",
            formula: "Current-year Worksheet 4 taxable benefits plus earlier-year Worksheet 2 additions",
          },
          {
            line: "used",
            description: "Election used on Form 1040 Line 6b",
            value: "Yes",
            formula: "Election used only when it is lower than the standard worksheet amount",
          },
          {
            line: "W2-21 (2024) refigured",
            description: "Earlier-year refigured taxable benefits",
            value: "0",
            formula: "Pub. 915 Worksheet 2 refigured earlier-year taxable benefits",
          },
          {
            line: "W2-21 (2024) additional",
            description: "Earlier-year additional taxable benefits",
            value: "0",
            formula: "max(0, refigured taxable benefits - previously reported taxable benefits)",
          },
          {
            line: "1040-6b",
            description: "Form 1040 Line 6b taxable benefits",
            value: "2500",
            formula: "Final taxable Social Security benefits used on Form 1040 Line 6b",
          },
        ],
      },
    ]);
  });

  it("fillReturn includes a Social Security Benefits Worksheet reference summary when benefits are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const socialSecurityFixture = {
        ...simpleW2Fixture,
        formSSA1099: [
          {
            recipient: "Jane Doe",
            netBenefits: "18000",
            federalWithheld: "1200",
          },
        ],
        formRRB1099: [
          {
            recipient: "Jane Doe",
            netSocialSecurityEquivalentBenefitPortion: "2000",
            federalWithheld: "150",
          },
        ],
      };

      const result = calculateFederalTax(socialSecurityFixture);
      const { filledForms } = await fillReturn(socialSecurityFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(SOCIAL_SECURITY_BENEFITS_WORKSHEET_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Social Security Benefits Worksheet reference summary when no benefits are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const result = calculateFederalTax(simpleW2Fixture);
      const { filledForms } = await fillReturn(simpleW2Fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(
        filledForms.some((path) => path.endsWith(SOCIAL_SECURITY_BENEFITS_WORKSHEET_REFERENCE_FILENAME))
      ).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
