/** Spec: spec/federal/schedule-8812-2026-template.yaml. Physical source only. */
import { createHash } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFTextField, decodePDFRawStream } from "pdf-lib";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";
import { removeTrustedTemplateLegacyFormData } from "@/pdf/trusted-review-template-cleanup.js";

const blank = new URL("../../forms/blank/2026/f1040s8.pdf", import.meta.url);
type SourceContract = {
  filename: string;
  sha256: string;
  bytes: number;
  pages: number;
  leafWidgets: number;
  locations: Record<string, { fieldName: string; page: number; rect: string[]; type: string; onState?: string; readOnly?: boolean }>;
};
const original = JSON.parse(await readFile(
  new URL("../fixtures/pdf-2026/schedule-8812-source.json", import.meta.url), "utf8",
)) as SourceContract;

async function mapping() {
  const { SCHEDULE_8812_2026_CANDIDATE } = await import("@/pdf/mappings/2026/schedule-8812-candidate.js");
  return SCHEDULE_8812_2026_CANDIDATE;
}

async function projection(sources: unknown) {
  const { projectSchedule8812WageOnly2026 } = await import("@/pdf/mappings/2026/schedule-8812-candidate.js");
  return projectSchedule8812WageOnly2026(sources);
}

describe("Final 2026 Schedule 8812 wage-only specimen", () => {
  const sources = {
    taxYear: 2026, parentForm: "1040", annualSourcesConfirmed: true,
    wageOnlyNoExclusionsOrWorksheetBConfirmed: true, nonPuertoRicoResidentConfirmed: true,
    filingStatus: "single", qualifyingChildren: 2, qualifyingChildSourcesConfirmed: true,
    otherDependents: 0, adjustedGrossIncome: "35000", worksheetALine5: "2023", worksheetAConfirmed: true,
    w2s: [{ taxYear: 2026, owner: "primary", employerEin: "99-8887777", box1: "35000", codeQ: "0" }],
  };

  const payrollSource = {
    ...sources, filingStatus: "married_filing_separately", qualifyingChildren: 3, adjustedGrossIncome: "3000", worksheetALine5: "0",
    w2s: [
      { ...sources.w2s[0], box1: "500", ordinaryPayroll: { sourceReference: "Original W-2 A", box3: "500", box4: "31", box5: "500", box6: "7.25", box7: "0" } },
      { ...sources.w2s[0], employerEin: "99-8887778", box1: "2500", ordinaryPayroll: { sourceReference: "Original W-2 B", box3: "2500", box4: "155", box5: "2500", box6: "36.25", box7: "0" } },
    ],
    partIIB: {
      taxYear: 2026, sourceReference: "Confirmed Form 1040, Schedule 3 and Part II-B working copy",
      originalWorkpapersConfirmed: true, noAdditionalMedicareOrRrtaConfirmed: true,
      schedule1Line15: "0", schedule2Line16c: "0", schedule2Line17c: "0",
      form1040Line27a: "0", schedule3Line11: "0", reportedLine24: "0",
    },
  };

  it("places the published ATS scenario 14 credit amounts and branch marks on the saved final form", async () => {
    const fields = await mapping().then(candidate => candidate.fields);
    const projected = await projection(sources);
    const values = { line1: "35000", line3: "35000", line4: "2", line5: "4400", line12: "4400", line13: "2023", line14: "2023", line16a: "2377", line16bCount: "2", line16b: "3400", line17: "2377", line18a: "35000", line18b: "0", line19: "32500", line20: "4875", line27: "2377" } as const;
    for (const [key, value] of Object.entries(values)) expect(projected.text[fields[key as keyof typeof values]]).toBe(value);
    expect(projected.checked).toEqual([fields.line12Yes, fields.line19Yes, fields.nextNo]);
    const pdf = await PDFDocument.load(await readFile(blank));
    removeTrustedTemplateLegacyFormData(pdf);
    const form = pdf.getForm();
    for (const [name, value] of Object.entries(projected.text)) form.getTextField(name).setText(value);
    for (const name of projected.checked) form.getCheckBox(name).check();
    await markReviewPdf(pdf);
    const bytes = await pdf.save();
    if (process.env.TAX_ENGINE_SCHEDULE_8812_WAGE_PROBE_DIRECTORY) {
      await writeFile(join(process.env.TAX_ENGINE_SCHEDULE_8812_WAGE_PROBE_DIRECTORY, "schedule-8812-wage-review.pdf"), bytes, { flag: "wx" });
    }
    const saved = (await PDFDocument.load(bytes)).getForm();
    expect(saved.getFields()).toHaveLength(41);
    for (const [name, value] of Object.entries(projected.text)) expect(saved.getTextField(name).getText()).toBe(value);
    for (const name of projected.checked) expect(saved.getCheckBox(name).isChecked()).toBe(true);
    for (const key of ["name", "ssn", "line15Reserved", "line21", "line22", "line23", "line24", "line25", "line26"] as const) {
      expect(saved.getTextField(fields[key]).getText()).toBeUndefined();
    }
  });

  it("includes actual combat pay once and respects the exact $2,500 branch", async () => {
    const { fields } = await mapping();
    const lowIncome = { ...sources, qualifyingChildren: 1, adjustedGrossIncome: "2000", worksheetALine5: "0" };
    const w2 = { ...sources.w2s[0], box1: "2000" };
    const combat = await projection({ ...lowIncome, w2s: [{ ...w2, codeQ: "2250.50" }] });
    expect(combat.text).toMatchObject({ [fields.line18a]: "4251", [fields.line18b]: "2251", [fields.line19]: "1751", [fields.line27]: "263" });
    const atLimit = await projection({ ...lowIncome, w2s: [{ ...w2, codeQ: "500" }] });
    expect(atLimit.checked).toEqual([fields.line12Yes, fields.line19No, fields.nextNo]);
    expect(atLimit.text[fields.line19]).toBeUndefined();
    expect(atLimit.text[fields.line20]).toBe("0");
    await expect(projection({ ...lowIncome, w2s: [{ ...w2, codeQ: "500.01" }] })).rejects.toThrow(/printed|rounded/i);
  });

  it("stops after line 12 when phased out and after line 16a when the nonrefundable credit uses the balance", async () => {
    const { fields } = await mapping();
    const phasedOut = await projection({ ...sources, adjustedGrossIncome: "300000", w2s: [{ ...sources.w2s[0], box1: "300000" }] });
    expect(phasedOut.checked).toEqual([fields.line12No]);
    for (const name of [fields.line12, fields.line13, fields.line14, fields.line16a, fields.line27]) expect(phasedOut.text[name]).toBeUndefined();
    const exhausted = await projection({ ...sources, worksheetALine5: "4400" });
    expect(exhausted.checked).toEqual([fields.line12Yes]);
    expect(exhausted.text[fields.line16a]).toBe("0");
    expect(exhausted.text[fields.line16b]).toBeUndefined();
    expect(exhausted.text[fields.line27]).toBeUndefined();
    await expect(projection({ ...sources, adjustedGrossIncome: "200000.01", w2s: [{ ...sources.w2s[0], box1: "200000.01" }] })).rejects.toThrow(/printed|rounded/i);
  });

  it("uses confirmed other dependents without increasing the refundable child cap", async () => {
    const { fields } = await mapping();
    const otherDependent = { ...sources, qualifyingChildren: 0, otherDependents: 1, otherDependentSourcesConfirmed: true };
    const onlyOther = await projection({ ...otherDependent, worksheetALine5: "350" });
    expect(onlyOther.text).toMatchObject({
      [fields.line4]: "0", [fields.line5]: "0", [fields.line6]: "1", [fields.line7]: "500",
      [fields.line8]: "500", [fields.line12]: "500", [fields.line14]: "350", [fields.line16a]: "150",
      [fields.line16bCount]: "0", [fields.line16b]: "0",
    });
    expect(onlyOther.checked).toEqual([fields.line12Yes]);
    const pdf = await PDFDocument.load(await readFile(blank));
    removeTrustedTemplateLegacyFormData(pdf);
    const form = pdf.getForm();
    for (const [name, value] of Object.entries(onlyOther.text)) form.getTextField(name).setText(value);
    for (const name of onlyOther.checked) form.getCheckBox(name).check();
    await markReviewPdf(pdf);
    const bytes = await pdf.save();
    if (process.env.TAX_ENGINE_SCHEDULE_8812_WAGE_PROBE_DIRECTORY) {
      await writeFile(join(process.env.TAX_ENGINE_SCHEDULE_8812_WAGE_PROBE_DIRECTORY, "schedule-8812-other-dependent-review.pdf"), bytes, { flag: "wx" });
    }
    const saved = (await PDFDocument.load(bytes)).getForm();
    expect(saved.getTextField(fields.line16b).getText()).toBe("0");
    for (const name of [fields.line17, fields.line18a, fields.line19, fields.line20, fields.line27]) {
      expect(onlyOther.text[name]).toBeUndefined();
      expect(saved.getTextField(name).getText()).toBeUndefined();
    }

    const mixed = await projection({ ...otherDependent, qualifyingChildren: 1, worksheetALine5: "500" });
    expect(mixed.text).toMatchObject({
      [fields.line5]: "2200", [fields.line7]: "500", [fields.line8]: "2700", [fields.line14]: "500",
      [fields.line16a]: "2200", [fields.line16bCount]: "1", [fields.line16b]: "1700", [fields.line27]: "1700",
    });
    await expect(projection({ ...otherDependent, otherDependentSourcesConfirmed: false })).rejects.toThrow(/source/i);
    await expect(projection({ ...sources, qualifyingChildren: 0 })).rejects.toThrow(/source/i);
  });

  it("reopens the verified three-child Part II-B payroll alternative", async () => {
    const { fields } = await mapping();
    const projected = await projection(payrollSource);
    expect(projected.checked).toEqual([fields.line12Yes, fields.line19Yes, fields.nextYes]);
    const values = { line16b: "5100", line17: "5100", line20: "75", line21: "230", line22: "0", line23: "230",
      line24: "0", line25: "230", line26: "230", line27: "230" } as const;
    const pdf = await PDFDocument.load(await readFile(blank));
    removeTrustedTemplateLegacyFormData(pdf);
    const form = pdf.getForm();
    for (const [name, value] of Object.entries(projected.text)) form.getTextField(name).setText(value);
    for (const name of projected.checked) form.getCheckBox(name).check();
    await markReviewPdf(pdf);
    const saved = (await PDFDocument.load(await pdf.save())).getForm();
    for (const [key, value] of Object.entries(values)) expect(saved.getTextField(fields[key as keyof typeof values]).getText()).toBe(value);
    expect(saved.getCheckBox(fields.nextYes).isChecked()).toBe(true);
    expect(saved.getCheckBox(fields.nextNo).isChecked()).toBe(false);
    for (const key of ["name", "ssn", "line15Reserved"] as const) expect(saved.getTextField(fields[key]).getText()).toBeUndefined();
    const offset = await projection({ ...payrollSource, partIIB: {
      ...payrollSource.partIIB, form1040Line27a: "1350", reportedLine24: "1350",
      form1040SeparationCheckboxConfirmed: true, scheduleEicChildResidenceConfirmed: true,
    } });
    expect(offset.text).toMatchObject({ [fields.line24]: "1350", [fields.line25]: "0", [fields.line26]: "75", [fields.line27]: "75" });
    const [first, second] = payrollSource.w2s;
    const joint = await projection({ ...payrollSource, filingStatus: "married_filing_jointly",
      w2s: [first, { ...second, owner: "spouse", employerEin: first.employerEin }] });
    expect(joint.text).toMatchObject({ [fields.line21]: "230", [fields.line27]: "230" });
  });

  it("holds Part II-B earned income credit above the published 2026 maximum", async () => {
    const { fields } = await mapping();
    const household = {
      ...payrollSource, filingStatus: "head_of_household", adjustedGrossIncome: "18290",
      w2s: [{ ...payrollSource.w2s[0], box1: "18290", ordinaryPayroll: {
        sourceReference: "Original W-2", box3: "18290", box4: "1133.98", box5: "18290", box6: "265.21", box7: "0",
      } }],
    };
    for (const [form1040Line27a, reportedLine24] of [["999999", "999999"], ["8231.01", "8231"]]) {
      await expect(projection({ ...household, partIIB: { ...household.partIIB, form1040Line27a, reportedLine24 } }))
        .rejects.toThrow(/Part II-B.*earned income credit maximum/i);
    }
    const limit = await projection({ ...household, partIIB: { ...household.partIIB, form1040Line27a: "8231", reportedLine24: "8231" } });
    expect(limit.text).toMatchObject({ [fields.line24]: "8231", [fields.line25]: "0", [fields.line27]: "2369" });
  });

  it("holds positive separate-return earned income credit without both original attestations", async () => {
    const offset = { ...payrollSource.partIIB, form1040Line27a: "1350", reportedLine24: "1350" };
    for (const patch of [
      {},
      { scheduleEicChildResidenceConfirmed: true },
      { form1040SeparationCheckboxConfirmed: false, scheduleEicChildResidenceConfirmed: true },
      { form1040SeparationCheckboxConfirmed: true },
      { form1040SeparationCheckboxConfirmed: true, scheduleEicChildResidenceConfirmed: false },
    ]) {
      await expect(projection({ ...payrollSource, partIIB: { ...offset, ...patch } }))
        .rejects.toThrow(/Part II-B.*separation.*qualifying-child residence/i);
    }
  });

  it("bypasses Part II-B only when printed and exact line 20 cover line 17", async () => {
    const { fields } = await mapping();
    const bypass = { ...sources, qualifyingChildren: 3 };
    const result = await projection(bypass);
    expect(result.checked).toEqual([fields.line12Yes, fields.line19Yes, fields.nextYes]);
    expect(result.text).toMatchObject({ [fields.line17]: "4577", [fields.line20]: "4875", [fields.line27]: "4577" });
    for (const line of [fields.line21, fields.line22, fields.line23, fields.line24, fields.line25, fields.line26]) {
      expect(result.text[line]).toBeUndefined();
    }
    expect(await projection({ ...bypass, partIIB: { taxYear: 2025, schedule3Line11: "1" },
      w2s: [{ ...bypass.w2s[0], ordinaryPayroll: { box4: "unverified" } }] })).toEqual(result);
    const boundary = { ...bypass, adjustedGrossIncome: "36500", worksheetALine5: "0", w2s: [{ ...bypass.w2s[0], box1: "36500" }] };
    expect((await projection(boundary)).text).toMatchObject({ [fields.line17]: "5100", [fields.line20]: "5100", [fields.line27]: "5100" });
    await expect(projection({ ...boundary, adjustedGrossIncome: "36496.66", w2s: [{ ...boundary.w2s[0], box1: "36496.66" }] })).rejects.toThrow(/printed.*rounded/i);
  });

  it("holds missing and contradictory Part II-B originals", async () => {
    await expect(projection({ ...payrollSource, partIIB: undefined })).rejects.toThrow(/Part II-B.*source/i);
    for (const patch of [
      { taxYear: 2025 }, { sourceReference: " " }, { originalWorkpapersConfirmed: false }, { noAdditionalMedicareOrRrtaConfirmed: false },
      { schedule1Line15: undefined }, { schedule2Line16c: "1" }, { schedule2Line17c: "unknown" },
      { schedule3Line11: "1" }, { form1040Line27a: undefined }, { form1040Line27a: "1" }, { reportedLine24: "1" },
    ]) await expect(projection({ ...payrollSource, partIIB: { ...payrollSource.partIIB, ...patch } })).rejects.toThrow(/Part II-B.*source|line 24/i);
    const [first, second] = payrollSource.w2s;
    for (const ordinaryPayroll of [undefined, ...[
      { sourceReference: "" }, { box4: "30.99" }, { box5: "400" }, { box6: "7.26" }, { box7: "1" },
    ].map(patch => ({ ...first.ordinaryPayroll, ...patch }))]) {
      await expect(projection({ ...payrollSource, w2s: [{ ...first, ordinaryPayroll }, second] })).rejects.toThrow(/W-2.*payroll/i);
    }
    await expect(projection({ ...payrollSource, w2s: [first, { ...second, owner: "spouse" }] })).rejects.toThrow(/W-2.*owner/i);
    const highPayroll = (w2: typeof first, taxableWages: string, socialSecurity: string, medicare: string) => ({ ...w2, ordinaryPayroll: {
      ...w2.ordinaryPayroll, box3: taxableWages, box4: socialSecurity, box5: taxableWages, box6: medicare,
    } });
    await expect(projection({ ...payrollSource, w2s: [highPayroll(first, "60000", "3720", "870"), highPayroll(second, "70000", "4340", "1015")] }))
      .rejects.toThrow(/Additional Medicare Tax worksheet/i);
    await expect(projection({ ...payrollSource, filingStatus: "head_of_household",
      w2s: [highPayroll(first, "100000", "6200", "1450"), highPayroll(second, "100000", "6200", "1450")] }))
      .rejects.toThrow(/zero excess Social Security/i);
    await expect(projection({ ...payrollSource, filingStatus: "head_of_household",
      partIIB: { ...payrollSource.partIIB, form1040Line27a: "0.49" } })).rejects.toThrow(/printed.*rounded/i);
  });

  it("rejects incomplete and out-of-cohort sources", async () => {
    for (const patch of [
      { taxYear: 2025 }, { parentForm: "1040-NR" }, { otherDependents: 1 },
      { nonPuertoRicoResidentConfirmed: false }, { worksheetAConfirmed: false }, { adjustedGrossIncome: "34999.99" },
      { w2s: [{ ...sources.w2s[0], codeQ: undefined }] }, { w2s: [{ ...sources.w2s[0], owner: "spouse" }] },
      { w2s: [sources.w2s[0], sources.w2s[0]] }, { wageOnlyNoExclusionsOrWorksheetBConfirmed: false },
      { qualifyingChildSourcesConfirmed: false }, { annualSourcesConfirmed: false },
    ]) await expect(projection({ ...sources, ...patch })).rejects.toThrow(/source|W-2|Schedule 8812/i);
  });
});

describe("Final 2026 Schedule 8812 physical candidate", () => {
  it("pins the exact final annual source", async () => {
    const bytes = await readFile(blank).catch(() => undefined);
    expect(bytes, "the final 2026 physical source must exist").toBeDefined();
    if (!bytes) return;
    expect(bytes.length).toBe(96696);
    expect(createHash("sha256").update(bytes).digest("hex"))
      .toBe("05b96bd809b37cfd0c223ac0909d2d82645eb8bfd6244701189f40ab8a4ab45c");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toBe("2026 Schedule 8812 (Form 1040)");
    expect(pdf.getPages().map(page => page.getSize())).toEqual([
      { width: 612, height: 792 }, { width: 612, height: 792 },
    ]);
    const candidate = await mapping();
    expect(candidate.sha256).toBe(original.sha256);
    expect(candidate.sourceRevision).toBe("Created 8/18/26");
  });

  it("maps every leaf to its exact 2026 physical location", async () => {
    const [candidate, pdf] = await Promise.all([mapping(), readFile(blank).then(bytes => PDFDocument.load(bytes))]);
    const form = pdf.getForm();
    expect(form.getFields()).toHaveLength(41);
    expect(Object.keys(candidate.fields).sort()).toEqual(Object.keys(original.locations).sort());
    expect(Object.values(candidate.fields).sort()).toEqual(form.getFields().map(field => field.getName()).sort());
    for (const [key, location] of Object.entries(original.locations)) {
      const name = candidate.fields[key as keyof typeof candidate.fields];
      expect(name).toBe(location.fieldName);
      const field = form.getField(name);
      expect(field).toBeInstanceOf(location.type === "/Tx" ? PDFTextField : PDFCheckBox);
      const widgets = field.acroField.getWidgets();
      expect(widgets).toHaveLength(1);
      const [widget] = widgets;
      const rect = widget.getRectangle();
      const [left, bottom, right, top] = location.rect.map(Number);
      expect(rect.x).toBeCloseTo(left, 3);
      expect(rect.y).toBeCloseTo(bottom, 3);
      expect(rect.width).toBeCloseTo(right - left, 3);
      expect(rect.height).toBeCloseTo(top - bottom, 3);
      expect(widget.P()).toEqual(pdf.getPages()[location.page - 1].ref);
      if (field instanceof PDFCheckBox) expect(field.acroField.getOnValue()?.toString()).toBe(location.onState);
      if (location.readOnly && field instanceof PDFTextField) {
        expect(field.isReadOnly()).toBe(true);
        expect(field.getText()).toBeUndefined();
      }
    }
  });

  it("records the annual printed transfer references and amounts", async () => {
    const candidate = await mapping();
    expect(candidate.printedReferences).toEqual({
      line1: ["Form 1040 / 1040-SR / 1040-NR line 11b"],
      line22: ["Schedule 1 line 15", "Schedule 2 line 16c", "Schedule 2 line 17c"],
    });
    expect(candidate.printedAmounts).toEqual({ line5: "$2,200", line7: "$500", line16b: "$1,700" });
  });

  it("retains diagnostic values and both states of every checkbox after save", async () => {
    const candidate = await mapping();
    const source = await readFile(blank);
    const noticeHex = Buffer.from(REVIEW_PDF_NOTICE).toString("hex").toUpperCase();
    for (const selectYes of [false, true]) {
      const pdf = await PDFDocument.load(source);
      const form = pdf.getForm();
      const textValues = new Map<string, string>();
      const checkboxValues = new Map<string, boolean>();
      for (const [key, name] of Object.entries(candidate.fields)) {
        const field = form.getField(name);
        if (field instanceof PDFTextField) {
          if (key === candidate.reservedField) continue;
          const probe = key === "ssn" ? "REDACTED" : key === "name" ? "FICTIONAL FIELD PROBE" : String(textValues.size + 1);
          field.setText(probe);
          textValues.set(name, probe);
        } else if (field instanceof PDFCheckBox) {
          const selected = selectYes === key.endsWith("Yes");
          if (selected) field.check(); else field.uncheck();
          checkboxValues.set(name, selected);
        } else throw new Error("Unexpected field type in the original");
      }
      await markReviewPdf(pdf);
      const bytes = await pdf.save();
      const reopened = await PDFDocument.load(bytes);
      const saved = reopened.getForm();
      expect(saved.getFields()).toHaveLength(original.leafWidgets);
      expect(textValues.size).toBe(34);
      expect(checkboxValues.size).toBe(6);
      const reserved = saved.getTextField(candidate.fields[candidate.reservedField]);
      expect(reserved.isReadOnly()).toBe(true);
      expect(reserved.getText()).toBeUndefined();
      for (const [name, value] of textValues) {
        const field = saved.getTextField(name);
        expect(field.getText()).toBe(value);
        expect(field.acroField.getValue()?.decodeText()).toBe(value);
        const appearance = field.acroField.getWidgets()[0].getAppearances()?.normal;
        expect(appearance).toBeInstanceOf(PDFRawStream);
        expect(decodePDFRawStream(appearance as PDFRawStream).decode().length).toBeGreaterThan(0);
      }
      for (const [name, selected] of checkboxValues) {
        const checkbox = saved.getCheckBox(name);
        const widget = checkbox.acroField.getWidgets()[0];
        const state = selected ? checkbox.acroField.getOnValue() : PDFName.of("Off");
        expect(checkbox.isChecked()).toBe(selected);
        expect(widget.getAppearanceState()).toEqual(state);
        const normal = widget.getAppearances()?.normal;
        expect(normal).toBeInstanceOf(PDFDict);
        const appearance = (normal as PDFDict).lookup(state as PDFName);
        expect(appearance).toBeInstanceOf(PDFRawStream);
        expect(decodePDFRawStream(appearance as PDFRawStream).decode().length).toBeGreaterThan(0);
      }
      for (const page of reopened.getPages()) {
        const contents = page.node.Contents();
        const streams = contents instanceof PDFArray
          ? contents.asArray().map(ref => reopened.context.lookup(ref)) : [contents];
        const text = streams.filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
          .map(stream => Buffer.from(decodePDFRawStream(stream).decode()).toString("ascii")).join("\n");
        expect(text.split(noticeHex).length - 1).toBe(1);
      }
      if (process.env.TAX_CANDIDATE_ARTIFACT_DIR) {
        const directory = process.env.TAX_CANDIDATE_ARTIFACT_DIR;
        const stat = await lstat(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Artifact directory must be a real directory");
        await writeFile(join(directory, `schedule-8812-${selectYes ? "yes" : "no"}.pdf`), bytes, { flag: "wx", mode: 0o600 });
      }
    }
  });

  it("keeps every export gate closed", async () => {
    const [candidate, source] = await Promise.all([mapping(), readFile(blank)]);
    expect(candidate).toMatchObject({
      taxYear: 2026, exportsEnabled: false, filingQualified: false, reviewStatus: "independent-review-pending",
    });
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.fields)).toBe(true);
    expect(PDF_MAPPING_PACKS[2026].reviewAvailable).toBe(false);
    expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
    expect(() => assertReviewTemplateBytes(original.filename, source, 2025)).toThrow(/Unreviewed template revision/);
    expect(() => assertReviewTemplateBytes(original.filename, source, 2026)).toThrow(/No qualified review/);
  });
});
