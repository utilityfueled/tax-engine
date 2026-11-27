/** Spec: spec/federal/schedule-r-2026-template.yaml. Diagnostic only; no return enabled. */
import Decimal from "decimal.js";
import { calculateScheduleR } from "@/engine/forms/schedule-r.js";
import { getConstants } from "@/models/constants.js";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFTextField, decodePDFRawStream } from "pdf-lib";
import { renderPrivateScheduleR2026Review, SCHEDULE_R_2026_CANDIDATE as candidate } from "@/pdf/mappings/2026/schedule-r-candidate.js";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";

type SourceContract = { filename: string; sha256: string; leafWidgets: number;
  locations: Record<string, { fieldName: string; page: number; rect: string[]; type: string }> };
const original = JSON.parse(await readFile("tests/fixtures/pdf-2026/schedule-r-source.json", "utf8")) as SourceContract;
const sourcePath = `forms/blank/2026/${original.filename}`;

// The IRS publishes the worksheet amounts and age; the exact dates and source references are synthetic.
const jesseSources = {
  taxYear: 2026,
  filingStatus: "single",
  dateOfBirth: "1968-06-12",
  retirementDate: "2024-07-06",
  citizenshipOrResidentAlienStatusConfirmed: true,
  retiredPermanentlyAndTotallyDisabledConfirmed: true,
  notReachedMandatoryRetirementAgeOnJanuary1Confirmed: true,
  actualEmployerDisabilityPayInLieuOfWagesBeforeMandatoryRetirementAgeConfirmed: true,
  permanentlyAndTotallyDisabledDuring2026Confirmed: true,
  unableToEngageInSubstantialGainfulActivityDuring2026Confirmed: true,
  priorPhysicianStatement: {
    sourceYear: 2024,
    signedDate: "2024-07-08",
    signedLineBConfirmed: true,
    obtainedAndRetainedConfirmed: true,
    sameClaimantConfirmed: true,
    sourceReference: "PRIVATE-DR-REFERENCE",
  },
  incomeWorksheet: {
    sourceReference: "PRIVATE-DISABILITY-PAY-REFERENCE",
    taxableDisabilityIncome: "16170",
  },
  returnWorksheet: {
    sourceReference: "PRIVATE-RETURN-WORKSHEET-REFERENCE",
    sameReturnAndIncomeOwnerConfirmed: true,
    allApplicableNontaxableBenefitsConfirmed: true,
    actualCreditLimitWorksheetConfirmed: true,
    scheduleRLine13aBenefits: "500",
    scheduleRLine13bBenefits: "0",
    form1040Line11b: "16270",
    form1040Line18: "16",
    schedule3Line1: "0",
    schedule3Line2: "0",
    schedule3Line6l: "0",
  },
};

describe("Final 2026 schedule-r physical candidate", () => {
  it("renders a redacted source-bound Box 2 and Part II proof from the published 2026 worksheet", async () => {
    const bytes = await renderPrivateScheduleR2026Review(jesseSources, await readFile(sourcePath));
    const saved = (await PDFDocument.load(bytes)).getForm();
    expect(saved.getCheckBox(candidate.fields.box2).isChecked()).toBe(true);
    expect(saved.getCheckBox(candidate.fields.priorPhysicianStatement).isChecked()).toBe(true);
    expect(saved.getCheckBox(candidate.fields.box1).isChecked()).toBe(false);
    const output = execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-I", "-B", "-c", [
      "from io import BytesIO", "from sys import stdin", "from pypdf import PdfReader", "from json import dumps",
      "reader = PdfReader(BytesIO(stdin.buffer.read()), strict=True)",
      "fields = {name: str(field.get('/V', '')) for name, field in reader.get_fields().items()}",
      "print(dumps({'fields': fields, 'pages': [page.extract_text() for page in reader.pages]}))",
    ].join("\n")], { input: bytes, encoding: "utf8" });
    const proof = JSON.parse(output) as { fields: Record<string, string>; pages: string[] };
    const expected = { line10: "5000", line11: "16170", line12: "5000", line13a: "500", line13b: "0",
      line13c: "500", line14Agi: "16270", line15: "7500", line16: "8770", line17: "4385", line18: "4885",
      line19: "115", line20: "17", line21: "16", line22: "16" } as const;
    for (const [key, value] of Object.entries(expected)) {
      expect(proof.fields[candidate.fields[key as keyof typeof expected]]).toBe(value);
    }
    expect(proof.fields[candidate.fields.name]).toBe("");
    expect(proof.fields[candidate.fields.ssn]).toBe("");
    expect(proof.pages).toHaveLength(2);
    expect(proof.pages.every(page => page.includes(REVIEW_PDF_NOTICE))).toBe(true);
    for (const privateValue of [jesseSources.dateOfBirth, jesseSources.retirementDate,
      jesseSources.priorPhysicianStatement.signedDate,
      jesseSources.priorPhysicianStatement.sourceReference, jesseSources.incomeWorksheet.sourceReference,
      jesseSources.returnWorksheet.sourceReference]) {
      expect(output).not.toContain(privateValue);
    }
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
    const adjustedSources = {
      ...jesseSources,
      priorPhysicianStatement: { ...jesseSources.priorPhysicianStatement, signedDate: jesseSources.retirementDate },
      returnWorksheet: {
        ...jesseSources.returnWorksheet,
        form1040Line18: "23", schedule3Line1: "1", schedule3Line2: "2", schedule3Line6l: "4",
      },
    };
    const adjusted = (await PDFDocument.load(
      await renderPrivateScheduleR2026Review(adjustedSources, await readFile(sourcePath)),
    )).getForm();
    expect(adjusted.getTextField(candidate.fields.line21).getText()).toBe("16");
    expect(adjusted.getTextField(candidate.fields.line22).getText()).toBe("16");
  });

  it("holds incompatible Schedule R dates, statement, amounts and final template evidence", async () => {
    const blank = await readFile(sourcePath);
    const undatedStatement: Partial<typeof jesseSources.priorPhysicianStatement> = { ...jesseSources.priorPhysicianStatement };
    delete undatedStatement.signedDate;
    for (const sources of [
      { ...jesseSources, priorPhysicianStatement: { ...undatedStatement, sourceYear: 2023 } },
      { ...jesseSources, taxYear: 2025 },
      { ...jesseSources, dateOfBirth: "1962-01-01" },
      { ...jesseSources, retirementDate: "2025-02-29" },
      { ...jesseSources, retirementDate: "2027-01-01" },
      { ...jesseSources, retirementDate: "2026-07-06" },
      { ...jesseSources, permanentlyAndTotallyDisabledDuring2026Confirmed: false },
      { ...jesseSources, unableToEngageInSubstantialGainfulActivityDuring2026Confirmed: false },
      { ...jesseSources, priorPhysicianStatement: { ...jesseSources.priorPhysicianStatement, sourceYear: 2026 } },
      { ...jesseSources, priorPhysicianStatement: { ...jesseSources.priorPhysicianStatement, sourceYear: 2023, signedDate: "2023-12-31" } },
      { ...jesseSources, priorPhysicianStatement: { ...jesseSources.priorPhysicianStatement, signedDate: "2024-07-05" } },
      { ...jesseSources, priorPhysicianStatement: { ...jesseSources.priorPhysicianStatement, signedDate: "2025-12-31" } },
      { ...jesseSources, priorPhysicianStatement: { ...jesseSources.priorPhysicianStatement, signedDate: "2026-01-01" } },
      { ...jesseSources, priorPhysicianStatement: { ...jesseSources.priorPhysicianStatement, signedDate: "2025-02-29" } },
      { ...jesseSources, priorPhysicianStatement: { ...jesseSources.priorPhysicianStatement, signedDate: undefined } },
      { ...jesseSources, priorPhysicianStatement: { ...jesseSources.priorPhysicianStatement, signedLineBConfirmed: false } },
      { ...jesseSources, priorPhysicianStatement: { ...jesseSources.priorPhysicianStatement, sameClaimantConfirmed: false } },
      { ...jesseSources, incomeWorksheet: { ...jesseSources.incomeWorksheet, taxableDisabilityIncome: "0" } },
      { ...jesseSources, returnWorksheet: { ...jesseSources.returnWorksheet, form1040Line11b: "16270.25" } },
      { ...jesseSources, returnWorksheet: { ...jesseSources.returnWorksheet, form1040Line18: "0" } },
      { ...jesseSources, returnWorksheet: { ...jesseSources.returnWorksheet, schedule3Line6l: undefined } },
    ]) {
      await expect(renderPrivateScheduleR2026Review(sources, blank)).rejects.toThrow(/Schedule R/);
    }
    await expect(renderPrivateScheduleR2026Review(jesseSources, blank.subarray(0, -1))).rejects.toThrow(/template/);
  });
  it("pins the exact source and keeps every export gate closed", async () => {
    const bytes = await readFile(sourcePath);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(original.sha256);
    expect(candidate.sha256).toBe(original.sha256);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getForm().getFields()).toHaveLength(original.leafWidgets);
    expect(candidate).toMatchObject({ taxYear: 2026, filingQualified: false,
      exportsEnabled: false, reviewStatus: "independent-review-pending" });
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.fields)).toBe(true);
    expect(PDF_MAPPING_PACKS[2026].reviewAvailable).toBe(false);
    expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
    expect(() => assertReviewTemplateBytes(original.filename, bytes, 2025)).toThrow(/Unreviewed template revision/);
    expect(() => assertReviewTemplateBytes(original.filename, bytes, 2026)).toThrow(/No qualified review/);
  });

  it("maps every leaf to its original physical location", async () => {
    const pdf = await PDFDocument.load(await readFile(sourcePath));
    const form = pdf.getForm();
    expect(Object.keys(candidate.fields).sort()).toEqual(Object.keys(original.locations).sort());
    expect(Object.values(candidate.fields).slice().sort()).toEqual(form.getFields().map(f => f.getName()).sort());
    for (const [key, location] of Object.entries(original.locations)) {
      const name = candidate.fields[key as keyof typeof candidate.fields];
      expect(name).toBe(location.fieldName);
      const field = form.getField(name);
      expect(field).toBeInstanceOf(location.type === "/Tx" ? PDFTextField : PDFCheckBox);
      const widgets = field.acroField.getWidgets();
      expect(widgets).toHaveLength(1);
      const rect = widgets[0].getRectangle();
      const [left, bottom, right, top] = location.rect.map(Number);
      expect(rect.x).toBeCloseTo(left, 3);
      expect(rect.y).toBeCloseTo(bottom, 3);
      expect(rect.width).toBeCloseTo(right - left, 3);
      expect(rect.height).toBeCloseTo(top - bottom, 3);
      const page = pdf.getPages()[location.page - 1];
      expect(widgets[0].P()).toEqual(page.ref);
    }
  });

  it("retains every diagnostic value and appearance after save", async () => {
    const pdf = await PDFDocument.load(await readFile(sourcePath));
    const values: Record<string, string | boolean> = {};
    let index = 0;
    for (const [key, name] of Object.entries(candidate.fields)) {
      const field = pdf.getForm().getField(name);
      // Each value is a field probe, not a computed or filing-ready return.
      if (field instanceof PDFTextField) {
        const value = key === "ssn" ? "REDACTED" : String(index % 9 + 1);
        field.setText(value); values[name] = value;
      } else if (field instanceof PDFCheckBox) {
        const checked = index % 2 === 0;
        if (checked) field.check(); else field.uncheck();
        values[name] = checked;
      } else throw new Error(`Unexpected source field ${name}`);
      index++;
    }
    await markReviewPdf(pdf);
    const bytes = await pdf.save();
    const reopened = await PDFDocument.load(bytes);
    expect(reopened.getForm().getFields()).toHaveLength(original.leafWidgets);
    for (const [name, value] of Object.entries(values)) {
      const field = reopened.getForm().getField(name);
      if (field instanceof PDFTextField) {
        expect(field.getText()).toBe(value);
        expect(field.acroField.getValue()?.decodeText()).toBe(value);
        const normal = field.acroField.getWidgets()[0].getAppearances()?.normal;
        expect(normal).toBeInstanceOf(PDFRawStream);
        expect(decodePDFRawStream(normal as PDFRawStream).decode().length).toBeGreaterThan(0);
      } else if (field instanceof PDFCheckBox) {
        expect(field.isChecked()).toBe(value);
        expect(field.acroField.getWidgets()[0].getAppearanceState()?.asString()).toBe(value ? field.acroField.getOnValue()?.asString() : "/Off");
        const normal = field.acroField.getWidgets()[0].getAppearances()?.normal;
        expect(normal).toBeInstanceOf(PDFDict);
        const state = value ? field.acroField.getOnValue() : PDFName.of("Off");
        expect(state).toBeDefined();
        const appearance = (normal as PDFDict).lookup(state as PDFName);
        expect(appearance).toBeInstanceOf(PDFRawStream);
        expect(decodePDFRawStream(appearance as PDFRawStream).decode().length).toBeGreaterThan(0);
      }
    }
    const noticeHex = Buffer.from(REVIEW_PDF_NOTICE).toString("hex").toUpperCase();
    for (const page of reopened.getPages()) {
      const contents = page.node.Contents();
      const streams = contents instanceof PDFArray ? contents.asArray().map(ref => reopened.context.lookup(ref)) : [contents];
      const text = streams.filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
        .map(stream => Buffer.from(decodePDFRawStream(stream).decode()).toString("ascii")).join("\n");
      expect(text.split(noticeHex).length - 1).toBe(1);
    }
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
    if (process.env.TAX_CANDIDATE_ARTIFACT_DIR) {
      await mkdir(process.env.TAX_CANDIDATE_ARTIFACT_DIR, { recursive: true });
      await writeFile(join(process.env.TAX_CANDIDATE_ARTIFACT_DIR, "schedule-r-diagnostic.pdf"), bytes);
      await writeFile(join(process.env.TAX_CANDIDATE_ARTIFACT_DIR, "schedule-r-diagnostic-values.json"), JSON.stringify(values, null, 2));
    }
  });
  it("retains the 2026 AGI reference contract", () => {
    expect(candidate.line14Source).toBe("Form 1040 line 11b");
    expect(candidate.fields.line14Agi).toBe("topmostSubform[0].Page2[0].f2_7[0]");
  });
  it.each(["mixed-age", "Jesse"] as const)("retains isolated published worksheet amounts in final2026 physical cells (%j)", async (example) => {
    // Explicit worksheet facts, not invented canonical return liability.
    const mixed = example === "mixed-age";
    const r = calculateScheduleR({taxYear:2026, filingStatus:mixed ? "married_filing_jointly" : "single",
      agi:new Decimal(mixed ? "4000" : "16270"),nontaxableSocialSecurity:new Decimal(mixed ? "0" : "500"),
      // The statutory R amounts are unchanged; do not bypass getConstants(2026).
      constants:getConstants(2025).elderlyOrDisabledCredit,
      scheduleRInput:{primaryQualifies:true,primaryAge65OrOlder:false,primaryDisabilityIncome:mixed ? "4000" : "16170",
        spouseQualifies:mixed,spouseAge65OrOlder:mixed,nontaxablePensionsAnnuities:"0"},
      creditLimitWorksheet:{taxBeforeCredits:new Decimal(mixed ? "100" : "16"),foreignTaxCredit:new Decimal(0),dependentCareCredit:new Decimal(0),schedule3Line6l:new Decimal(0)}});
    const expected:Record<string,string> = mixed
      ? {"10":"7500","11":"9000","12":"7500","13a":"0","13b":"0","13c":"0","14":"4000","15":"10000","16":"0","17":"0","18":"0","19":"7500","20":"1125","21":"100","22":"100"}
      : {"10":"5000","11":"16170","12":"5000","13a":"500","13b":"0","13c":"500","14":"16270","15":"7500","16":"8770","17":"4385","18":"4885","19":"115","20":"17","21":"16","22":"16"};
    const pdf=await PDFDocument.load(await readFile(sourcePath));
    const fields=pdf.getForm();fields.getTextField(candidate.fields.name).setText("FICTIONAL WORKSHEET ONLY");fields.getTextField(candidate.fields.ssn).setText("REDACTED");
    fields.getCheckBox(mixed ? candidate.fields.box6 : candidate.fields.box2).check();
    for(const [line,value] of Object.entries(expected)) {
      const actual=r.lines.find(row=>row.line===line);expect(actual?.value.toFixed()).toBe(value);
      const key=line==="14" ? "line14Agi" : `line${line}`;
      const fieldName=candidate.fields[key as keyof typeof candidate.fields];
      fields.getTextField(fieldName).setText(actual?.value.toFixed(0));
    }
    await markReviewPdf(pdf);const bytes=await pdf.save();const saved=await PDFDocument.load(bytes);
    for(const [line,value] of Object.entries(expected)) {
      const key=line==="14" ? "line14Agi" : `line${line}`;
      expect(saved.getForm().getTextField(candidate.fields[key as keyof typeof candidate.fields]).getText()).toBe(value);
    }
    expect(saved.getForm().getCheckBox(mixed ? candidate.fields.box6 : candidate.fields.box2).isChecked()).toBe(true);
    expect(saved.getForm().getCheckBox(candidate.fields.box7).isChecked()).toBe(false);
    expect(()=>assertPdfExportAllowed(2026,2026)).toThrow(/No qualified review/);
    if(process.env.TAX_CANDIDATE_ARTIFACT_DIR){await mkdir(process.env.TAX_CANDIDATE_ARTIFACT_DIR,{recursive:true});await writeFile(join(process.env.TAX_CANDIDATE_ARTIFACT_DIR,`schedule-r-${example}-worksheet.pdf`),bytes);}
  });

});
