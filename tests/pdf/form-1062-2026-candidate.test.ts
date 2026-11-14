/** Spec: spec/federal/form-1062-2026-template.yaml. */
import { lstat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFTextField, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { Form1062Input } from "@/engine/forms/form-1062.js";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { FORM_1062_2026_CANDIDATE, projectForm1062CandidateFields } from "@/pdf/mappings/2026/form-1062-candidate.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";
import { qualifiedFarmlandSale } from "../fixtures/form-1062-direct-sale.js";
import census from "../fixtures/pdf-2026/form-1062-source.json";

const source = FORM_1062_2026_CANDIDATE.sources;
const { form1062, scheduleA } = FORM_1062_2026_CANDIDATE.fields;
const readBlank = (file: string) => readFile(new URL(`../../forms/blank/2026/${file}`, import.meta.url));
async function blanks() {
  const [form1062, scheduleA] = await Promise.all([readBlank(source.form1062.file), readBlank(source.scheduleA.file)]);
  return { form1062, scheduleA };
}

const credits = { foreignTax: "0", nonrefundablePersonal: "0", generalBusiness: "0", otherApplicable: "0" };
const direct = { ...qualifiedFarmlandSale, grossProceeds: "500000.52", sellingExpenses: "0.50", independentlyReportedGain: "56516.02" };
const facts = {
  taxYear: 2026, electionConfirmed: true, taxableIncome: "86516.02",
  withGain: { regularIncomeTax: "9886.01", additions: "268", credits },
  withoutGain: { taxableIncome: "30000", regularIncomeTax: "3104", additions: "0", credits },
} as const;
const individual = { ...facts, sale: direct } satisfies Form1062Input;
const { grossProceeds: _gross, sellingExpenses: _expenses, unadjustedBasis: _unadjusted, adjustedBasis: _adjusted, ...common } = direct;
const allocation = {
  sourceCode: "ZZ", sourceTaxYear: 2026, section1062StatementConfirmed: true,
  entityScheduleAMatched: true, taxpayerAndEntityMatched: true,
} as const;
const multiple = {
  ...facts, taxableIncome: "116516.09", independentlyReportedElectedGain: "86516.09",
  sales: [
    { sourceId: "synthetic-original-direct", scheduleA: direct },
    { sourceId: "synthetic-original-partner", scheduleA: {
      ...common, transactionType: "partnership_sale", saleDate: "2026-01-09", independentlyReportedGain: "20000.02",
      partnerAllocation: { ...allocation, sourceForm: "1065", sourceBox: "20", allocatedGain: "20000.02" },
    } },
    { sourceId: "synthetic-original-shareholder", scheduleA: {
      ...common, transactionType: "s_corporation_sale", saleDate: "2026-02-28", independentlyReportedGain: "10000.05",
      shareholderAllocation: { ...allocation, sourceForm: "1120-S", sourceBox: "17", allocatedGain: "10000.05" },
    } },
  ],
} as const satisfies Form1062Input;

describe("December 2025 Form 1062 and Schedule A physical candidates", () => {
  it("pins the final files and rejects changed or swapped source bytes", async () => {
    const bytes = await blanks();
    expect(bytes.form1062).toHaveLength(66887);
    expect(bytes.scheduleA).toHaveLength(88431);
    expect(source.form1062.sha256).toBe("4ff34ba9f4f25a995557c49c0ed001f41e0efd75c3e79ec1a9513e7e8a912ade");
    expect(source.scheduleA.sha256).toBe("dc50ba9b52db27a01492962b7349b71070812956c56feff376928dcd17a4953d");
    expect(source.form1062.posted).toBe("2026-04-15");
    expect(source.scheduleA.posted).toBe("2026-04-15");
    expect(projectForm1062CandidateFields(individual, bytes).schedulesA).toHaveLength(1);
    expect(() => projectForm1062CandidateFields(individual, { form1062: bytes.scheduleA, scheduleA: bytes.form1062 })).toThrow(/revision/);
    for (const kind of ["form1062", "scheduleA"] as const) {
      const changed = Uint8Array.from(bytes[kind]);
      changed[changed.length - 1] ^= 1;
      expect(() => projectForm1062CandidateFields(individual, { ...bytes, [kind]: changed })).toThrow(/revision/);
    }
    const parent = await PDFDocument.load(bytes.form1062);
    const schedule = await PDFDocument.load(bytes.scheduleA);
    expect(parent.getTitle()).toBe("Form 1062 (December 2025)");
    expect(schedule.getTitle()).toBe("Schedule A (Form 1062) (December 2025)");
  });

  it("matches both pages and every physical field including checkbox appearances", async () => {
    const bytes = await blanks();
    for (const [key, fields, locations, fieldCount, boxCount] of [
      ["form1062", form1062, census.f1062, 26, 0],
      ["scheduleA", scheduleA, census.f1062sa, 27, 16],
    ] as const) {
      const pdf = await PDFDocument.load(bytes[key]);
      expect(pdf.getPages().map(page => page.getSize())).toEqual([{ width: 611.976, height: 791.968 }]);
      const page = pdf.getPage(0);
      expect(page.node.Annots()?.size()).toBe(fieldCount);
      const acro = pdf.catalog.getAcroForm();
      expect(acro?.dict.has(PDFName.of("XFA"))).toBe(true);
      acro?.dict.delete(PDFName.of("XFA"));
      const form = pdf.getForm();
      expect(form.getFields()).toHaveLength(fieldCount);
      expect(locations.filter(row => row[1] === "/Btn")).toHaveLength(boxCount);
      expect(Object.values(fields).sort()).toEqual(form.getFields().map(field => field.getName()).sort());
      for (const row of locations) {
        const [name, kind, pageNumber, [left, bottom, right, top], states] = row as [string, string, number, number[], string[]];
        const field = form.getField(name);
        expect(field).toBeInstanceOf(kind === "/Tx" ? PDFTextField : PDFCheckBox);
        const widgets = field.acroField.getWidgets();
        expect(widgets).toHaveLength(1);
        const { x, y, width, height } = widgets[0].getRectangle();
        expect(widgets[0].P()).toEqual(pdf.getPage(pageNumber - 1).ref);
        expect(x).toBeCloseTo(left, 3);
        expect(y).toBeCloseTo(bottom, 3);
        expect(width).toBeCloseTo(right - left, 3);
        expect(height).toBeCloseTo(top - bottom, 3);
        if (field instanceof PDFCheckBox) expect(field.acroField.getOnValue()?.toString()).toBe(states[0]);
      }
    }
  });

  it("projects canonical amounts and distinct Schedule A pages for one confirmed election", async () => {
    const bytes = await blanks();
    const projected = projectForm1062CandidateFields(multiple, bytes);
    expect(projected.form1062).toEqual(Object.fromEntries([
      "scheduleACount", "line1", "line2", "line3", "line4a", "line4b", "line4c", "line4d", "line4z", "line5",
      "line6", "line7", "line8", "line9", "line10", "line11", "line12a", "line12b", "line12c", "line12d", "line12z",
      "line13", "line14", "line15",
    ].map((key, index) => [form1062[key as keyof typeof form1062], [
      "3", "9886.01", "268.00", "10154.01", "0.00", "0.00", "0.00", "0.00", "0.00", "10154.01",
      "116516.09", "86516.09", "30000.00", "3104.00", "0.00", "3104.00", "0.00", "0.00", "0.00", "0.00", "0.00",
      "3104.00", "7050.01", "1762.5025",
    ][index]])));
    expect(JSON.stringify(projected)).not.toContain("synthetic-original-");
    for (const [index, page] of projected.schedulesA.entries()) {
      expect(page[scheduleA.line3]).toBe(["10/01/2026", "01/09/2026", "02/28/2026"][index]);
      expect(page[scheduleA.line13]).toBe(["56516.02", "20000.02", "10000.05"][index]);
      expect([scheduleA.form1120S, scheduleA.form1065, scheduleA.form8865].map(name => page[name]))
        .toEqual([index === 2, index === 1, false]);
      expect([scheduleA.exchange, scheduleA.installmentSale, scheduleA.sale].map(name => page[name])).toEqual([false, false, true]);
      for (const key of ["line4Yes", "line5Yes", "line6Yes", "line7Yes", "line8Yes"] as const) expect(page[scheduleA[key]]).toBe(true);
      for (const key of ["line4No", "line5No", "line6No", "line7No", "line8No"] as const) expect(page[scheduleA[key]]).toBe(false);
      expect([scheduleA.line9, scheduleA.line10, scheduleA.line11, scheduleA.line12].map(name => page[name]))
        .toEqual(index === 0 ? ["500000.52", "500000.02", "443484.00", "443484.00"] : Array(4).fill(undefined));
    }
  });

  it("holds invalid eligibility dates and elections", async () => {
    const bytes = await blanks();
    for (const input of [
      { ...individual, electionConfirmed: false }, { ...individual, taxYear: 2027 },
      { ...individual, sale: { ...direct, saleDate: "2026-02-29" } },
      { ...individual, sale: { ...direct, saleDate: "2025-10-01" } },
      { ...individual, sale: { ...direct, covenantIncluded: false } },
      { ...individual, sale: { ...direct, transactionType: "installment_sale" } },
      { ...individual, sale: { ...direct, transactionType: "exchange" } },
      { ...individual, sale: { ...direct, transactionType: "foreign_partnership_sale" } },
      { ...multiple, independentlyReportedElectedGain: "86516.08" },
      { ...multiple, sales: [multiple.sales[0], { ...multiple.sales[1], sourceId: multiple.sales[0].sourceId }] },
    ]) expect(() => projectForm1062CandidateFields(input as Form1062Input, bytes)).toThrow(/Form 1062/);
  });

  it("retains projected values and widget states after save while export gates stay closed", async () => {
    const blank = await blanks();
    const fields = projectForm1062CandidateFields(multiple, blank);
    const probes = [
      ["form-1062", blank.form1062, fields.form1062, [form1062.name, form1062.identifyingNumber]],
      ...fields.schedulesA.map((page, index) => [
        `schedule-a-${index + 1}`, blank.scheduleA, page,
        [scheduleA.name, scheduleA.identifyingNumber, scheduleA.entityEin, scheduleA.entityName, scheduleA.line1],
      ] as const),
    ] as const;
    for (const [name, bytes, fields, redacted] of probes) {
      const pdf = await PDFDocument.load(bytes);
      pdf.catalog.getAcroForm()?.dict.delete(PDFName.of("XFA"));
      const form = pdf.getForm();
      for (const [name, value] of Object.entries(fields)) {
        if (typeof value === "string") {
          const field = form.getTextField(name);
          if (name === scheduleA.line3 && bytes === blank.scheduleA) {
            // The blank IRS page prints a light date hint beneath this widget.
            field.acroField.getWidgets()[0].getOrCreateAppearanceCharacteristics().setBackgroundColor([1, 1, 1]);
          }
          field.setText(value);
        } else if (value) form.getCheckBox(name).check();
        else form.getCheckBox(name).uncheck();
      }
      await markReviewPdf(pdf);
      const savedBytes = await pdf.save();
      const reopened = await PDFDocument.load(savedBytes);
      expect(reopened.getSubject()).toBe(REVIEW_PDF_NOTICE);
      expect(reopened.catalog.getAcroForm()?.dict.has(PDFName.of("XFA"))).toBe(false);
      const saved = reopened.getForm();
      for (const field of redacted) expect(saved.getTextField(field).getText()).toBeUndefined();
      for (const [name, value] of Object.entries(fields)) {
        const field = saved.getField(name);
        const [widget] = field.acroField.getWidgets();
        let appearance = widget.getAppearances()?.normal;
        if (field instanceof PDFTextField) {
          expect(field.getText()).toBe(value);
          expect(field.acroField.getValue()?.decodeText()).toBe(value);
        } else if (field instanceof PDFCheckBox) {
          expect(field.isChecked()).toBe(value);
          const state = value ? field.acroField.getOnValue() : PDFName.of("Off");
          expect(widget.getAppearanceState()).toBe(state);
          expect(appearance).toBeInstanceOf(PDFDict);
          appearance = (appearance as PDFDict).lookup(state as PDFName) as PDFRawStream;
        }
        expect(appearance).toBeInstanceOf(PDFRawStream);
        expect(decodePDFRawStream(appearance as PDFRawStream).decode().length).toBeGreaterThan(0);
      }
      const outputDirectory = process.env.TAX_CANDIDATE_ARTIFACT_DIR;
      if (outputDirectory) {
        const directory = await lstat(outputDirectory);
        if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error("Artifact directory must be a real directory");
        await writeFile(join(outputDirectory, `${name}.pdf`), savedBytes, { mode: 0o600, flag: "wx" });
      }
    }
    expect(FORM_1062_2026_CANDIDATE).toMatchObject({ exportsEnabled: false, filingQualified: false, reviewStatus: "independent-review-pending" });
    expect(PDF_MAPPING_PACKS[2026].reviewAvailable).toBe(false);
    expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
    expect(() => assertReviewTemplateBytes(source.form1062.file, blank.form1062, 2025)).toThrow(/No registered review template/);
    expect(() => assertReviewTemplateBytes(source.scheduleA.file, blank.scheduleA, 2025)).toThrow(/No registered review template/);
  });
});
