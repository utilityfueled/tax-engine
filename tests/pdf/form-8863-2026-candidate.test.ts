/** Spec: spec/federal/form-8863-2026-template.yaml. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFTextField, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
import { assertPdfExportAllowed, markReviewPdf } from "@/pdf/export-policy.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const blank = new URL("../../forms/blank/2026/f8863.pdf", import.meta.url);
const sourceContract = new URL("./sources/form-8863-2026.json", import.meta.url);

type Location = {
  name: string;
  page: number;
  rect: [number, number, number, number];
  type: "/Tx" | "/Btn";
  onState?: string;
};

async function mapping() {
  const { FORM_8863_2026_CANDIDATE } = await import("@/pdf/mappings/2026/form-8863-candidate.js");
  return FORM_8863_2026_CANDIDATE;
}

function expectNonemptyStream(appearance: unknown) {
  expect(appearance).toBeInstanceOf(PDFRawStream);
  expect(decodePDFRawStream(appearance as PDFRawStream).decode().length).toBeGreaterThan(0);
}

function actualAotcReturn() {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: {
      ...simpleW2Fixture.taxpayer, taxYear: 2026,
      primary: { ...simpleW2Fixture.taxpayer.primary, employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true },
    },
    w2s: [{ ...simpleW2Fixture.w2s[0], taxYear: 2026, accountHolder: "primary" }],
    educationExpenses: {
      primarySsnEligible: true, claimedAsDependent: false, nonresidentAlien: false,
      aocBanInEffect: false, form8862Required: false, possessionIncomeExclusion: "0",
      aocStudents: [{
        name: "Jane Doe", studentTaxId: "123-45-6789", studentRole: "primary", studentTinEligible: true,
        qualifiedExpenses: "4000", institutionEligible: true, expensesEligibilityConfirmed: true, form1098TRequirementMet: true,
        institutionEin: "98-7654321", institutions: [{
          name: "Synthetic College", address: "1 College Street", ein: "98-7654321",
          receivedCurrentYear1098T: true, receivedPriorYear1098TWithBox7: false,
        }],
        priorYearsClaimed: 3, completedFirstFourYearsBeforeYear: false, enrolledAtLeastHalfTime: true,
        pursuingDegreeOrCredential: true, felonyDrugConviction: false,
      }],
    },
  });
}

function actualTransferWorkpapers(input: TaxYearInput) {
  return {
    taxYear: 2026, currentWorkpapersConfirmed: true,
    canonicalInputSha256: createHash("sha256").update(JSON.stringify(TaxYearInputSchema.parse(input))).digest("hex"),
    form1040Line11a: "85000", creditLimitWorksheetRemainingTax: "500", form8863Line6: "0.500", form8863Line8: "500", form8863Line19: "500",
  };
}

describe("Final 2026 Form 8863 physical candidate", () => {
  it("pins the final annual PDF", async () => {
    const [bytes, candidate] = await Promise.all([readFile(blank), mapping()]);
    expect(bytes.length).toBe(107826);
    expect(createHash("sha256").update(bytes).digest("hex"))
      .toBe("290771de5dbbbede2de9e7cb2ba8a7d51a08aa10e89b4ed74cfdbdb631af167f");
    expect(candidate.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(candidate.sourceRevision).toBe("Created 4/28/26");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()?.trim()).toBe("2026 Form 8863");
    expect(pdf.getPages().map(page => page.getSize())).toEqual([
      { width: 612, height: 792 }, { width: 612, height: 792 },
    ]);
  });

  it("locates every annual field on its printed page", async () => {
    const [source, candidate, pdf] = await Promise.all([
      readFile(sourceContract, "utf8").then(text => JSON.parse(text) as Record<string, Location>),
      mapping(),
      readFile(blank).then(bytes => PDFDocument.load(bytes)),
    ]);
    const form = pdf.getForm();
    expect(form.getFields()).toHaveLength(77);
    expect(Object.keys(candidate.fields).sort()).toEqual(Object.keys(source).sort());
    expect(Object.values(candidate.fields).sort()).toEqual(form.getFields().map(field => field.getName()).sort());
    for (const [key, location] of Object.entries(source)) {
      const name = candidate.fields[key as keyof typeof candidate.fields];
      expect(name, key).toBe(location.name);
      const field = form.getField(name);
      expect(field).toBeInstanceOf(location.type === "/Tx" ? PDFTextField : PDFCheckBox);
      const widgets = field.acroField.getWidgets();
      expect(widgets).toHaveLength(1);
      const [widget] = widgets;
      const { x, y, width, height } = widget.getRectangle();
      const [left, bottom, right, top] = location.rect;
      expect(x).toBeCloseTo(left, 3);
      expect(y).toBeCloseTo(bottom, 3);
      expect(width).toBeCloseTo(right - left, 3);
      expect(height).toBeCloseTo(top - bottom, 3);
      expect(widget.P()).toEqual(pdf.getPage(location.page - 1).ref);
      if (field instanceof PDFCheckBox) expect(field.acroField.getOnValue()?.toString()).toBe(location.onState);
    }
  });

  it("records the printed transfers", async () => {
    const candidate = await mapping();
    expect(candidate.printedReferences).toEqual({
      line1From: "All Parts III, line 30",
      line3From: "Form 1040 or 1040-SR, line 11a",
      line8To: "Form 1040 or 1040-SR, line 29",
      line9To: "Credit Limit Worksheet, line 2",
      line10From: "All Parts III, line 31",
      line14From: "Form 1040 or 1040-SR, line 11a",
      line18To: "Credit Limit Worksheet, line 1",
      line19From: "Credit Limit Worksheet, line 7",
      line19To: "Schedule 3 (Form 1040), line 3",
    });
  });

  it("verifies exact private AOTC transfers from current original workpapers", async () => {
    const { FORM_8863_2026_CANDIDATE, projectForm88632026Transfers } = await import("@/pdf/mappings/2026/form-8863-candidate.js");
    const input = actualAotcReturn();
    const workpapers = actualTransferWorkpapers(input);
    const projection = projectForm88632026Transfers(input, workpapers);
    expect(projection).toEqual({
      taxYear: 2026, sha256: FORM_8863_2026_CANDIDATE.sha256,
      transfers: [
        { line: "8", to: "Form 1040 or 1040-SR, line 29", amount: "500" },
        { line: "19", to: "Schedule 3 (Form 1040), line 3", amount: "500" },
      ],
    });
    expect(projectForm88632026Transfers(input, {
      ...workpapers, creditLimitWorksheetRemainingTax: "0", form8863Line19: "0",
    }).transfers[1]?.amount).toBe("0");
    expect(projectForm88632026Transfers(input, {
      ...workpapers, creditLimitWorksheetRemainingTax: "3000", form8863Line19: "750",
    }).transfers[1]?.amount).toBe("750");
    const serialized = JSON.stringify(projection);
    for (const privateValue of ["Jane Doe", "123-45-6789", "98-7654321", "Synthetic College", "1 College Street", workpapers.canonicalInputSha256]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it("holds stale, incomplete, or mismatched AOTC transfer evidence", async () => {
    const { projectForm88632026Transfers } = await import("@/pdf/mappings/2026/form-8863-candidate.js");
    const input = actualAotcReturn();
    const workpapers = actualTransferWorkpapers(input);
    if (!input.educationExpenses) throw new Error("Missing synthetic education source");
    const { educationExpenses } = input;
    const [student] = educationExpenses.aocStudents;
    const changed = { ...input, educationExpenses: { ...educationExpenses, aocStudents: [{ ...student, qualifiedExpenses: "3000" }] } };
    expect(() => projectForm88632026Transfers(changed, workpapers)).toThrow(/current canonical return/);
    expect(() => projectForm88632026Transfers(changed, { ...workpapers, canonicalInputSha256: actualTransferWorkpapers(changed).canonicalInputSha256 }))
      .toThrow(/line 8 or line 19/);
    for (const alteration of [
      { taxYear: 2025 }, { currentWorkpapersConfirmed: false }, { form1040Line11a: undefined },
      { creditLimitWorksheetRemainingTax: "500.01" }, { form8863Line8: "500.01" }, { form8863Line19: "499.99" },
      { form8863Line8: "499" }, { form8863Line19: "501" },
    ]) expect(() => projectForm88632026Transfers(input, { ...workpapers, ...alteration })).toThrow(/Form 8863 review/);
    expect(() => projectForm88632026Transfers({ ...input, taxpayer: { ...input.taxpayer, taxYear: 2025 } }, workpapers))
      .toThrow(/2026/);
    for (const alteration of [
      { institutions: [] }, { institutionEin: "12-3456789" }, { studentTaxId: "123-45-6788" },
      { expensesEligibilityConfirmed: undefined }, { priorYearsClaimed: 4 },
    ]) {
      const unsupported = { ...input, educationExpenses: { ...educationExpenses, aocStudents: [{ ...student, ...alteration }] } };
      expect(() => projectForm88632026Transfers(unsupported, actualTransferWorkpapers(unsupported))).toThrow(/Form 8863 review/);
    }
  });

  it("binds transfers to the exact reported line 6 factor", async () => {
    const { projectForm88632026Transfers } = await import("@/pdf/mappings/2026/form-8863-candidate.js");
    const actual = actualAotcReturn();
    const [wage] = actual.w2s;
    const input = { ...actual, w2s: [{ ...wage, wages: "85006", socialSecurityWages: "85006", medicareWages: "85006" }] };
    const workpapers = {
      ...actualTransferWorkpapers(input), form1040Line11a: "85006", creditLimitWorksheetRemainingTax: "3000",
      form8863Line6: "0.4994", form8863Line8: "500", form8863Line19: "749",
    };
    const withoutFactor = Object.fromEntries(Object.entries(workpapers).filter(([field]) => field !== "form8863Line6"));
    expect(() => projectForm88632026Transfers(input, withoutFactor)).toThrow(/line 6/i);
    expect(projectForm88632026Transfers(input, workpapers).transfers.map(row => row.amount)).toEqual(["500", "749"]);
    expect(() => projectForm88632026Transfers(input, { ...workpapers, form8863Line6: "0.499", form8863Line8: "499" }))
      .toThrow(/exact.*line 6/i);
    expect(() => projectForm88632026Transfers(input, { ...workpapers, form8863Line6: "0.499" }))
      .toThrow(/exact.*line 6/i);
    for (const form8863Line6 of [undefined, "0.5", "0.50", "0.4994e0"]) {
      expect(() => projectForm88632026Transfers(input, { ...workpapers, form8863Line6 })).toThrow(/line 6/i);
    }
    const fullFactor = { ...actual, w2s: [{ ...wage, wages: "80000", socialSecurityWages: "80000", medicareWages: "80000" }] };
    expect(projectForm88632026Transfers(fullFactor, {
      ...actualTransferWorkpapers(fullFactor), form1040Line11a: "80000", creditLimitWorksheetRemainingTax: "3000",
      form8863Line6: "1.000", form8863Line8: "1000", form8863Line19: "1500",
    }).transfers.map(row => row.amount)).toEqual(["1000", "1500"]);
  });

  it("retains diagnostic values and appearances after save", async () => {
    const [candidate, bytes] = await Promise.all([mapping(), readFile(blank)]);
    for (const yes of [false, true]) {
      const pdf = await PDFDocument.load(bytes);
      const form = pdf.getForm();
      const textValues = new Map<string, string>();
      const selections = new Map<string, boolean>();
      for (const [key, name] of Object.entries(candidate.fields)) {
        const field = form.getField(name);
        if (field instanceof PDFCheckBox) {
          const selected = key.endsWith("No") ? !yes : yes;
          selections.set(name, selected);
          if (selected) field.check(); else field.uncheck();
        } else if (field instanceof PDFTextField) {
          const value = /Ssn|Ein/.test(key) ? "0" : key.endsWith("Fraction") ? "500" : key.endsWith("Integer") ? "0" : "1";
          textValues.set(name, value);
          field.setText(value);
        }
      }
      expect(textValues.size).toBe(60);
      expect(selections.size).toBe(17);
      await markReviewPdf(pdf);
      const reopened = await PDFDocument.load(await pdf.save());
      const saved = reopened.getForm();
      for (const [name, value] of textValues) {
        const field = saved.getTextField(name);
        expect(field.getText()).toBe(value);
        expect(field.acroField.getValue()?.decodeText()).toBe(value);
        expectNonemptyStream(field.acroField.getWidgets()[0].getAppearances()?.normal);
      }
      for (const [name, selected] of selections) {
        const field = saved.getCheckBox(name);
        const widget = field.acroField.getWidgets()[0];
        const state = selected ? field.acroField.getOnValue() : PDFName.of("Off");
        if (!state) throw new Error(`Missing checkbox on-state for ${name}`);
        expect(field.isChecked()).toBe(selected);
        expect(widget.getAppearanceState()).toEqual(state);
        const normal = widget.getAppearances()?.normal;
        expect(normal).toBeInstanceOf(PDFDict);
        expectNonemptyStream((normal as PDFDict).lookup(state));
      }
    }
  });

  it("keeps public exports closed", async () => {
    const [candidate, bytes] = await Promise.all([mapping(), readFile(blank)]);
    expect(candidate).toMatchObject({
      taxYear: 2026, exportsEnabled: false, filingQualified: false, reviewStatus: "independent-review-pending",
    });
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.fields)).toBe(true);
    expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
    expect(() => assertReviewTemplateBytes("f8863.pdf", bytes, 2025)).toThrow(/Unreviewed template revision/);
    expect(() => assertReviewTemplateBytes("f8863.pdf", bytes, 2026)).toThrow(/No qualified review/);
  });
});
