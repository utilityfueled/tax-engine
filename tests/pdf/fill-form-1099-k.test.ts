/**
 * Spec: spec/federal/form-1099-k.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillReturn } from "@/pdf/fill-return.js";
import {
  buildForm1099KReferenceSummary,
  FORM_1099_K_REFERENCE_FILENAME,
} from "@/pdf/fill-form-1099-k.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-1099k-"));
}

describe("Form 1099-K packet reference summary", () => {
  it("buildForm1099KReferenceSummary keeps the packet artifact reference-only and limited to supported payment-platform outputs", () => {
    const paymentPlatformFixture = {
      ...simpleW2Fixture,
      form1099K: [
        {
          pse: "Stripe",
          grossAmount: "12450",
          cardNotPresent: "9300",
          federalWithheld: "120",
          stateWithheld: "45",
          state: "IL",
          incomeType: "business" as const,
        },
        {
          pse: "Airbnb",
          grossAmount: "4800",
          cardNotPresent: "0",
          federalWithheld: "0",
          stateWithheld: "60",
          state: "PA",
          incomeType: "rental" as const,
        },
      ],
    };

    const result = calculateFederalTax(paymentPlatformFixture);
    const summary = buildForm1099KReferenceSummary(
      paymentPlatformFixture.form1099K,
      result.form1099K!,
    );

    expect(summary.title).toBe("Form 1099-K Payment Platform Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.statementCount).toBe(2);
    expect(summary.forms).toEqual([
      {
        pse: "Stripe",
        box1aGrossAmount: "12450",
        routingLabel: "Schedule C business receipts",
        box1bCardNotPresentAmount: "9300",
        box4FederalWithholding: "120",
        box8StateWithholding: "45",
        state: "IL",
      },
      {
        pse: "Airbnb",
        box1aGrossAmount: "4800",
        routingLabel: "Schedule E rental receipts",
        box1bCardNotPresentAmount: "0",
        box4FederalWithholding: "0",
        box8StateWithholding: "60",
        state: "PA",
      },
    ]);
    expect(summary.totals).toEqual([
      {
        label: "Aggregated Form 1099-K gross amount",
        value: "17250",
      },
      {
        label: "Card-not-present subtotal",
        value: "9300",
      },
      {
        label: "Federal withholding to Form 1040 Line 25d",
        value: "120",
      },
      {
        label: "Business routing subtotal",
        value: "12450",
      },
      {
        label: "Farm routing subtotal",
        value: "0",
      },
      {
        label: "Rental routing subtotal",
        value: "4800",
      },
      {
        label: "Other-income routing subtotal",
        value: "0",
      },
      {
        label: "State withholding subtotal",
        value: "105",
      },
    ]);
  });

  it("fillReturn includes a Form 1099-K reference summary when payment platform statements are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const paymentPlatformFixture = {
        ...simpleW2Fixture,
        form1099K: [
          {
            pse: "Stripe",
            grossAmount: "12450",
            cardNotPresent: "9300",
            federalWithheld: "120",
            stateWithheld: "45",
            state: "IL",
            incomeType: "business" as const,
          },
        ],
      };

      const result = calculateFederalTax(paymentPlatformFixture);
      const { filledForms } = await fillReturn(paymentPlatformFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_1099_K_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 1099-K reference summary when no payment platform statements are present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const result = calculateFederalTax(simpleW2Fixture);
      const { filledForms } = await fillReturn(simpleW2Fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_1099_K_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
