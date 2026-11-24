/**
 * Spec: spec/federal/form-6781.yaml
 */

import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { PDFCheckBox, PDFTextField } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm6781 } from "@/engine/forms/form-6781.js";
import {
  buildForm6781ReferenceSummary,
  FORM_6781_REFERENCE_FILENAME,
} from "@/pdf/fill-form-6781.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { loadPdfDocumentQuietly } from "@/pdf/pdf-utils.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-6781-"));
}

describe("Final 2026 Form 6781 source", () => {
  it("pins the 2026 IRS blank and its four-page layout", async () => {
    const bytes = await readFile(new URL("../../forms/blank/2026/f6781.pdf", import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "40cf032ef46535e8695ffe22d6c76e0524f5be0eb9bc97ddd5a72207010c73c4",
    );

    const pdf = await loadPdfDocumentQuietly(bytes);
    const pages = pdf.getPages();
    const fields = pdf.getForm().getFields();
    expect(pdf.getTitle()?.trim()).toBe("2026 Form 6781");
    expect(pages.map((page) => page.getSize())).toEqual(
      Array.from({ length: 4 }, () => ({ width: 612, height: 792 })),
    );
    expect(pages.map((page) => page.node.Annots()?.size() ?? 0)).toEqual([71, 0, 0, 0]);
    expect(fields).toHaveLength(71);
    expect(fields.filter((field) => field instanceof PDFTextField && !field.getText())).toHaveLength(67);
    expect(fields.filter((field) => field instanceof PDFCheckBox && !field.isChecked())).toHaveLength(4);
  });
});

describe("Form 6781 packet reference summary", () => {
  it("buildForm6781ReferenceSummary keeps the packet artifact reference-only and limited to supported section 1256 and straddle outputs", () => {
    const form6781 = {
      section1256Gains: "15000",
      section1256Losses: "4000",
      adjustments: "-500",
      carrybackElection: true,
      carrybackAmount: "2000",
      shortTermStraddleLosses: "1200",
      longTermStraddleLosses: "800",
      shortTermStraddleGains: "300",
      longTermStraddleGains: "900",
    } as const;

    const summary = buildForm6781ReferenceSummary(form6781, calculateForm6781(form6781));

    expect(summary.title).toBe("Form 6781 Section 1256 and Straddles Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.lines.map((line) => line.line)).toEqual([
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "11a",
      "11b",
      "13a",
      "13b",
    ]);
    expect(summary.totals).toEqual([
      {
        label: "Schedule D Line 4 carry amount",
        value: "3300",
      },
      {
        label: "Schedule D Line 11 carry amount",
        value: "6400",
      },
    ]);
  });

  it("fillReturn includes a Form 6781 reference summary when supported section 1256 or straddle activity is present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const fixture = {
        ...simpleW2Fixture,
        form6781: {
          section1256Gains: "18000",
          adjustments: "-3000",
          shortTermStraddleLosses: "500",
          longTermStraddleGains: "250",
        },
      };

      const result = calculateFederalTax(fixture);
      const { filledForms } = await fillReturn(fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_6781_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 6781 reference summary when no supported Form 6781 activity is present", async () => {
    const outputDir = await makeOutputDir();

    try {
      const fixture = {
        ...simpleW2Fixture,
        form6781: {
          section1256Gains: "0",
          section1256Losses: "0",
          adjustments: "0",
          carrybackElection: false,
          carrybackAmount: "0",
          shortTermStraddleLosses: "0",
          longTermStraddleLosses: "0",
          shortTermStraddleGains: "0",
          longTermStraddleGains: "0",
        },
      };

      const result = calculateFederalTax(fixture);
      const { filledForms } = await fillReturn(fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_6781_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
