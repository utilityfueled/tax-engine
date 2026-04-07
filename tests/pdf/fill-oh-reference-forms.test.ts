/**
 * Specs:
 * - spec/state/oh-it-1040.yaml
 * - spec/state/oh-schedule-adjustments.yaml
 * - spec/state/oh-it-bus.yaml
 * - spec/state/oh-schedule-of-withholding.yaml
 * - spec/state/oh-schedule-credits.yaml
 * - spec/state/oh-resident-credit.yaml
 * - spec/state/oh-it-sd-2210.yaml
 * - spec/state/oh-sd-100.yaml
 */

import { mkdtemp, rm } from "fs/promises";
import { execFileSync } from "node:child_process";
import { basename, join } from "path";
import { tmpdir } from "os";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillOhioReferenceForms } from "@/pdf/fill-oh-reference-forms.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-oh-packet-"));
}

function extractPdfText(pdfPath: string) {
  return execFileSync(
    "python",
    [
      "-c",
      `
from pypdf import PdfReader
reader = PdfReader(r"${pdfPath}")
print("\\n".join((page.extract_text() or "") for page in reader.pages))
`,
    ],
    { encoding: "utf8" },
  );
}

function makeOhioFixture() {
  return {
    ...simpleW2Fixture,
    taxpayer: {
      ...simpleW2Fixture.taxpayer,
      address: {
        ...simpleW2Fixture.taxpayer.address,
        city: "Columbus",
        state: "OH",
        zip: "43215",
      },
    },
    w2s: [
      {
        ...simpleW2Fixture.w2s[0],
        state: "OH",
        stateWages: "85000",
        stateTaxWithheld: "3200",
      },
    ],
  };
}

function makeOhioUnderpaymentFixture() {
  const fixture = makeOhioFixture();

  return {
    ...fixture,
    w2s: [
      {
        ...fixture.w2s[0],
        wages: "180000",
        federalWithheld: "8000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "180000",
        medicareWithheld: "2610",
        stateWages: "180000",
        stateTaxWithheld: "0",
      },
    ],
  };
}

describe("Ohio reference packet summaries", () => {
  it("fillOhioReferenceForms keeps the Ohio IT 1040 packet artifact reference-only and limited to supported computed lines", async () => {
    const outputDir = await makeOutputDir();

    try {
      const ohioFixture = makeOhioFixture();
      const result = calculateFederalTax(ohioFixture);
      const { filledForms } = await fillOhioReferenceForms(ohioFixture, result, outputDir);
      const packetPath = filledForms.find((path) => path.endsWith("oh-it-1040-reference.pdf"));

      expect(packetPath).toBeDefined();
      expect(filledForms.map((path) => basename(path))).toContain("oh-it-1040-reference.pdf");

      const pdfText = extractPdfText(packetPath!);

      expect(pdfText).toContain("Ohio IT 1040");
      expect(pdfText).toContain("REFERENCE SUMMARY ONLY");
      expect(pdfText).toContain("deterministic summary of computed Ohio lines for review");
      expect(pdfText).toContain("Line 1: Federal adjusted gross income");
      expect(pdfText).toContain("Line 14: Ohio income tax withheld");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillOhioReferenceForms includes the Ohio IT BUS reference summary only when qualifying business income is present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const ohioFixture = makeOhioFixture();
      const result = calculateFederalTax(ohioFixture);
      const withoutBusinessIncome = await fillOhioReferenceForms(ohioFixture, result, outputDir);

      expect(
        withoutBusinessIncome.filledForms.some((path) => path.endsWith("oh-it-bus-reference.pdf")),
      ).toBe(false);

      const withBusinessIncome = await fillOhioReferenceForms(ohioFixture, result, outputDir, {
        otherBusinessIncome: "15000",
      });
      const packetPath = withBusinessIncome.filledForms.find((path) =>
        path.endsWith("oh-it-bus-reference.pdf"));

      expect(packetPath).toBeDefined();
      expect(extractPdfText(packetPath!)).toContain("Ohio Schedule of Business Income");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillOhioReferenceForms includes the Ohio Schedule of Adjustments reference summary only when additions or deductions are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const ohioFixture = makeOhioFixture();
      const result = calculateFederalTax(ohioFixture);
      const withoutAdjustments = await fillOhioReferenceForms(ohioFixture, result, outputDir);

      expect(
        withoutAdjustments.filledForms.some((path) =>
          path.endsWith("oh-schedule-adjustments-reference.pdf")),
      ).toBe(false);

      const withAdjustments = await fillOhioReferenceForms(ohioFixture, result, outputDir, {
        nonOhioStateLocalInterest: "125",
      });
      const packetPath = withAdjustments.filledForms.find((path) =>
        path.endsWith("oh-schedule-adjustments-reference.pdf"));

      expect(packetPath).toBeDefined();
      expect(extractPdfText(packetPath!)).toContain("Ohio Schedule of Adjustments");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillOhioReferenceForms includes the Ohio Schedule of Withholding reference summary only when Ohio withholding exists", async () => {
    const outputDir = await makeOutputDir();

    try {
      const fixtureWithoutOhioWithholding = {
        ...makeOhioFixture(),
        w2s: [
          {
            ...makeOhioFixture().w2s[0],
            stateTaxWithheld: "0",
          },
        ],
      };
      const withoutWithholdingResult = calculateFederalTax(fixtureWithoutOhioWithholding);
      const withoutWithholding = await fillOhioReferenceForms(
        fixtureWithoutOhioWithholding,
        withoutWithholdingResult,
        outputDir,
      );

      expect(
        withoutWithholding.filledForms.some((path) =>
          path.endsWith("oh-schedule-of-withholding-reference.pdf")),
      ).toBe(false);

      const ohioFixture = makeOhioFixture();
      const result = calculateFederalTax(ohioFixture);
      const withWithholding = await fillOhioReferenceForms(ohioFixture, result, outputDir);
      const packetPath = withWithholding.filledForms.find((path) =>
        path.endsWith("oh-schedule-of-withholding-reference.pdf"));

      expect(packetPath).toBeDefined();
      expect(extractPdfText(packetPath!)).toContain("Ohio Schedule of Withholding");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillOhioReferenceForms includes the Ohio Schedule of Credits reference summary only when Ohio credits are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const ohioFixture = makeOhioFixture();
      const result = calculateFederalTax(ohioFixture);
      const withoutCredits = await fillOhioReferenceForms(ohioFixture, result, outputDir);

      expect(
        withoutCredits.filledForms.some((path) => path.endsWith("oh-schedule-credits-reference.pdf")),
      ).toBe(false);

      const withCredits = await fillOhioReferenceForms(ohioFixture, result, outputDir, {
        campaignContributions: "25",
      });
      const packetPath = withCredits.filledForms.find((path) =>
        path.endsWith("oh-schedule-credits-reference.pdf"));

      expect(packetPath).toBeDefined();
      expect(extractPdfText(packetPath!)).toContain("Ohio Schedule of Credits");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillOhioReferenceForms includes the Ohio lump sum retirement credit worksheet reference summary only when the supported worksheet drives line 3", async () => {
    const outputDir = await makeOutputDir();

    try {
      const ohioFixture = makeOhioFixture();
      const result = calculateFederalTax(ohioFixture);
      const withoutWorksheet = await fillOhioReferenceForms(ohioFixture, result, outputDir);

      expect(
        withoutWorksheet.filledForms.some((path) =>
          path.endsWith("oh-lump-sum-retirement-credit-reference.pdf")),
      ).toBe(false);

      const withDirectOverride = await fillOhioReferenceForms(ohioFixture, result, outputDir, {
        lumpSumRetirementCredit: "1000",
      });

      expect(
        withDirectOverride.filledForms.some((path) =>
          path.endsWith("oh-lump-sum-retirement-credit-reference.pdf")),
      ).toBe(false);

      const withWorksheet = await fillOhioReferenceForms(ohioFixture, result, outputDir, {
        lumpSumRetirementRecipients: [{ age: 65, retirementIncome: "40000" }],
      });
      const packetPath = withWorksheet.filledForms.find((path) =>
        path.endsWith("oh-lump-sum-retirement-credit-reference.pdf"));

      expect(packetPath).toBeDefined();
      expect(extractPdfText(packetPath!)).toContain("Ohio Lump Sum Retirement Credit Worksheet");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillOhioReferenceForms includes the Ohio lump sum distribution credit worksheet reference summary only when the supported worksheet drives line 5", async () => {
    const outputDir = await makeOutputDir();

    try {
      const ohioFixture = makeOhioFixture();
      const result = calculateFederalTax(ohioFixture);
      const withoutWorksheet = await fillOhioReferenceForms(ohioFixture, result, outputDir);

      expect(
        withoutWorksheet.filledForms.some((path) =>
          path.endsWith("oh-lump-sum-distribution-credit-reference.pdf")),
      ).toBe(false);

      const withDirectOverride = await fillOhioReferenceForms(ohioFixture, result, outputDir, {
        lumpSumDistributionCredit: "800",
      });

      expect(
        withDirectOverride.filledForms.some((path) =>
          path.endsWith("oh-lump-sum-distribution-credit-reference.pdf")),
      ).toBe(false);

      const withWorksheet = await fillOhioReferenceForms(ohioFixture, result, outputDir, {
        lumpSumDistributionRecipientAges: [70],
      });
      const packetPath = withWorksheet.filledForms.find((path) =>
        path.endsWith("oh-lump-sum-distribution-credit-reference.pdf"));

      expect(packetPath).toBeDefined();
      expect(extractPdfText(packetPath!)).toContain("Ohio Lump Sum Distribution Credit Worksheet");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillOhioReferenceForms includes the Ohio resident credit reference summary only when another-state credit worksheet is needed", async () => {
    const outputDir = await makeOutputDir();

    try {
      const ohioFixture = makeOhioFixture();
      const result = calculateFederalTax(ohioFixture);
      const withoutWorksheet = await fillOhioReferenceForms(ohioFixture, result, outputDir);

      expect(
        withoutWorksheet.filledForms.some((path) => path.endsWith("oh-resident-credit-reference.pdf")),
      ).toBe(false);

      const withWorksheet = await fillOhioReferenceForms(ohioFixture, result, outputDir, {
        otherStateTaxes: [
          {
            stateCode: "CA",
            incomeType: "compensation",
            doubleTaxedIncome: "25000",
            taxPaid: "900",
          },
        ],
      });
      const packetPath = withWorksheet.filledForms.find((path) =>
        path.endsWith("oh-resident-credit-reference.pdf"));

      expect(packetPath).toBeDefined();
      expect(extractPdfText(packetPath!)).toContain("Ohio Resident Credit");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillOhioReferenceForms includes the Ohio IT/SD 2210 reference summary only when the underpayment worksheet is computed", async () => {
    const outputDir = await makeOutputDir();

    try {
      const ohioFixture = makeOhioUnderpaymentFixture();
      const result = calculateFederalTax(ohioFixture);
      const withoutWorksheet = await fillOhioReferenceForms(ohioFixture, result, outputDir);

      expect(
        withoutWorksheet.filledForms.some((path) => path.endsWith("oh-it-sd-2210-reference.pdf")),
      ).toBe(false);

      const withWorksheet = await fillOhioReferenceForms(ohioFixture, result, outputDir, {
        computeUnderpaymentPenalty: true,
        priorYearTaxLiability: "0",
      });
      const packetPath = withWorksheet.filledForms.find((path) =>
        path.endsWith("oh-it-sd-2210-reference.pdf"));

      expect(packetPath).toBeDefined();
      expect(extractPdfText(packetPath!)).toContain("Ohio IT/SD 2210");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillOhioReferenceForms auto-includes and suppresses the Ohio SD 100 reference summary based on official SD-prefixed district names", async () => {
    const outputDir = await makeOutputDir();

    try {
      const withOfficialDistrictName = {
        ...makeOhioFixture(),
        w2s: [
          {
            ...makeOhioFixture().w2s[0],
            localTaxWithheld: "250",
            localityName: "SD Bexley",
          },
        ],
      };
      const withOfficialDistrictResult = calculateFederalTax(withOfficialDistrictName);
      const withOfficialDistrictPacket = await fillOhioReferenceForms(
        withOfficialDistrictName,
        withOfficialDistrictResult,
        outputDir,
      );
      const sd100PacketPath = withOfficialDistrictPacket.filledForms.find((path) =>
        path.endsWith("oh-sd-100-reference.pdf"));

      expect(sd100PacketPath).toBeDefined();
      expect(extractPdfText(sd100PacketPath!)).toContain("Ohio SD 100");

      const withAmbiguousDistrictName = {
        ...makeOhioFixture(),
        w2s: [
          {
            ...makeOhioFixture().w2s[0],
            localTaxWithheld: "250",
            localityName: "SD Northeastern",
          },
        ],
      };
      const withAmbiguousDistrictResult = calculateFederalTax(withAmbiguousDistrictName);
      const withAmbiguousDistrictPacket = await fillOhioReferenceForms(
        withAmbiguousDistrictName,
        withAmbiguousDistrictResult,
        outputDir,
      );

      expect(
        withAmbiguousDistrictPacket.filledForms.some((path) =>
          path.endsWith("oh-sd-100-reference.pdf")),
      ).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillOhioReferenceForms includes the Ohio SD 100 reference summary only when a school district return is computed", async () => {
    const outputDir = await makeOutputDir();

    try {
      const ohioFixture = makeOhioFixture();
      const result = calculateFederalTax(ohioFixture);
      const withoutSd100 = await fillOhioReferenceForms(ohioFixture, result, outputDir);

      expect(
        withoutSd100.filledForms.some((path) => path.endsWith("oh-sd-100-reference.pdf")),
      ).toBe(false);

      const withSd100 = await fillOhioReferenceForms(ohioFixture, result, outputDir, {
        schoolDistricts: [
          {
            districtNumber: "5509",
          },
        ],
      });
      const packetPath = withSd100.filledForms.find((path) =>
        path.endsWith("oh-sd-100-reference.pdf"));

      expect(packetPath).toBeDefined();
      expect(extractPdfText(packetPath!)).toContain("Ohio SD 100");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
