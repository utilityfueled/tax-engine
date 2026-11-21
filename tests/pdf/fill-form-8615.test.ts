/**
 * Spec: spec/federal/form-8615.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm8615ReferenceSummary,
  FORM_8615_REFERENCE_FILENAME,
} from "@/pdf/fill-form-8615.js";
import { fillReturn } from "@/pdf/fill-return.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-8615-"));
}

function makeKiddieTaxFixture(overrides: Partial<TaxYearInput> = {}): TaxYearInput {
  return {
    ...simpleW2Fixture,
    w2s: [
      {
        employer: { name: "Summer Job", ein: "12-3456789" },
        wages: "15000",
        federalWithheld: "1500",
        socialSecurityWages: "15000",
        socialSecurityWithheld: "930",
        medicareWages: "15000",
        medicareWithheld: "217.50",
        stateTaxWithheld: "0",
        stateWages: "0",
        localTaxWithheld: "0",
        state: "WA",
      },
    ],
    form1099Int: [
      {
        payer: "Trust Fund",
        interestIncome: "10000",
        federalWithheld: "0",
        earlyWithdrawalPenalty: "0",
        usSavingsBondInterest: "0",
        taxExemptInterest: "0",
      },
    ],
    form8615: {
      childUnearnedIncome: "10000",
      parentTaxableIncome: "200000",
      parentFilingStatus: "married_filing_jointly",
      parentQualifiedDividends: "5000",
    },
    ...overrides,
  } as TaxYearInput;
}

describe("Form 8615 packet reference summary", () => {
  it("buildForm8615ReferenceSummary keeps the packet artifact reference-only and limited to supported kiddie-tax outputs", () => {
    const fixture = makeKiddieTaxFixture();
    const result = calculateFederalTax(fixture);
    const summary = buildForm8615ReferenceSummary(fixture.form8615!, result.form8615!);

    expect(summary.title).toBe("Form 8615 Kiddie Tax Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.lineCount).toBe(16);
    expect(summary.lines.map((line) => line.line)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "8",
      "9",
      "10",
      "11",
      "13",
      "14",
      "15",
      "16",
      "17",
      "18",
    ]);
    expect(summary.lines.find(line => line.line === "6")?.value).toBe("200000");
    expect(summary.lines.find(line => line.line === "14")?.description).toBe("Child's taxable income at child's own rate");
    expect(summary.totals).toEqual([
      {
        label: "Form 1040 Line 16 tax replacement",
        value: result.form8615!.tax.toString(),
      },
    ]);
  });

  it("shows optional sibling allocation rows in form order and preserves the unitless ratio", () => {
    const base = makeKiddieTaxFixture();
    const form8615 = { ...base.form8615!, otherChildrenNetUnearnedIncome: "7300" };
    const result = calculateFederalTax({ ...base, form8615 });
    const summary = buildForm8615ReferenceSummary(form8615, result.form8615!);

    expect(summary.lines.map(line => line.line)).toEqual([
      "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12a", "12b", "13", "14", "15", "16", "17", "18",
    ]);
    expect(summary.lines.find(line => line.line === "12a")?.value).toBe("14600");
    expect(summary.lines.find(line => line.line === "12b")?.value).toBe("0.500");
  });

  it("fillReturn includes a Form 8615 reference summary when kiddie tax applies", async () => {
    const outputDir = await makeOutputDir();

    try {
      const base = makeKiddieTaxFixture();
      const fixture = { ...base, form8615: { ...base.form8615!, otherChildrenNetUnearnedIncome: "7300" } };
      const result = calculateFederalTax(fixture);
      const { filledForms } = await fillReturn(fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_8615_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      const document = await PDFDocument.load(pdfBytes);
      const commands = document.getPages().flatMap(page => {
        const contents = page.node.Contents();
        return contents instanceof PDFArray
          ? contents.asArray().map(ref => document.context.lookup(ref)) : [contents];
      }).filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
        .map(stream => Buffer.from(decodePDFRawStream(stream).decode()).toString("ascii")).join("\n");
      const textHex = (value: string) => Buffer.from(value, "ascii").toString("hex").toUpperCase();
      expect(commands).toContain(textHex("REFERENCE SUMMARY ONLY"));
      expect(commands).toContain(textHex("Line 12a Total net unearned income of all children: $14600"));
      expect(commands).toContain(textHex("Line 12b Child's share of total net unearned income: 0.500"));
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 8615 reference summary when Form 8615 input is present but kiddie tax does not apply", async () => {
    const outputDir = await makeOutputDir();

    try {
      const fixture = makeKiddieTaxFixture({
        form1099Int: [
          {
            payer: "Trust Fund",
            interestIncome: "2000",
            federalWithheld: "0",
            earlyWithdrawalPenalty: "0",
            usSavingsBondInterest: "0",
            taxExemptInterest: "0",
          },
        ],
        form8615: {
          childUnearnedIncome: "2000",
          parentTaxableIncome: "200000",
          parentFilingStatus: "married_filing_jointly",
          parentQualifiedDividends: "5000",
        },
      });
      const result = calculateFederalTax(fixture);
      const { filledForms } = await fillReturn(fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_8615_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
