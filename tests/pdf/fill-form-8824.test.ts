/**
 * Spec: spec/federal/form-8824.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm8824Aggregate } from "@/engine/forms/form-8824.js";
import {
  buildForm8824ReferenceSummary,
  FORM_8824_REFERENCE_FILENAME,
} from "@/pdf/fill-form-8824.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-8824-"));
}

describe("Form 8824 packet reference summary", () => {
  it("buildForm8824ReferenceSummary keeps the packet artifact reference-only and limited to supported Part III exchange outputs", () => {
    const result = calculateForm8824Aggregate([
      {
        description: "Warehouse exchange",
        recognizedGainCharacter: "section1231",
        fmvOtherPropertyGivenUp: "0",
        adjustedBasisOtherPropertyGivenUp: "0",
        cashReceived: "20000",
        fmvOtherPropertyReceived: "0",
        liabilitiesRelinquished: "0",
        liabilitiesAssumed: "0",
        exchangeExpenses: "0",
        fmvLikeKindPropertyReceived: "480000",
        adjustedBasisLikeKindPropertyGivenUp: "300000",
        depreciationRecapture: "5000",
        isRelatedParty: false,
      },
      {
        description: "Investment land exchange",
        recognizedGainCharacter: "capital",
        fmvOtherPropertyGivenUp: "10000",
        adjustedBasisOtherPropertyGivenUp: "6000",
        cashReceived: "10000",
        fmvOtherPropertyReceived: "0",
        liabilitiesRelinquished: "0",
        liabilitiesAssumed: "0",
        exchangeExpenses: "0",
        fmvLikeKindPropertyReceived: "190000",
        adjustedBasisLikeKindPropertyGivenUp: "150000",
        depreciationRecapture: "0",
        isRelatedParty: true,
      },
    ]);

    const summary = buildForm8824ReferenceSummary(result);

    expect(summary.title).toBe("Form 8824 Like-Kind Exchange Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.exchanges).toHaveLength(2);
    expect(summary.exchanges[0]).toMatchObject({
      description: "Warehouse exchange",
      recognizedGainCharacter: "section1231",
      relatedParty: false,
    });
    expect(summary.exchanges[0]?.lines.map((line) => line.line)).toEqual([
      "12",
      "13",
      "14",
      "15",
      "16",
      "17",
      "18",
      "19",
      "20",
      "21",
      "22",
      "23",
      "24",
      "25",
    ]);
    expect(summary.exchanges[1]).toMatchObject({
      description: "Investment land exchange",
      recognizedGainCharacter: "capital",
      relatedParty: true,
    });
    expect(summary.totals).toEqual([
      {
        label: "Form 4797 ordinary income carry amount",
        value: "5000",
      },
      {
        label: "Form 4797 Part I section 1231 carry amount",
        value: "15000",
      },
      {
        label: "Schedule D long-term capital carry amount",
        value: "14000",
      },
    ]);
  });

  it("fillReturn includes a Form 8824 reference summary when supported like-kind exchange inputs are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const fixture = {
        ...simpleW2Fixture,
        form8824: [
          {
            description: "Warehouse exchange",
            recognizedGainCharacter: "section1231" as const,
            fmvOtherPropertyGivenUp: "0",
            adjustedBasisOtherPropertyGivenUp: "0",
            cashReceived: "25000",
            fmvOtherPropertyReceived: "0",
            liabilitiesRelinquished: "0",
            liabilitiesAssumed: "0",
            exchangeExpenses: "0",
            fmvLikeKindPropertyReceived: "475000",
            adjustedBasisLikeKindPropertyGivenUp: "300000",
            depreciationRecapture: "7500",
            isRelatedParty: false,
          },
        ],
      };

      const result = calculateFederalTax(fixture);
      const { filledForms } = await fillReturn(fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_8824_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 8824 reference summary when no supported like-kind exchange inputs are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const result = calculateFederalTax(simpleW2Fixture);
      const { filledForms } = await fillReturn(simpleW2Fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_8824_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
