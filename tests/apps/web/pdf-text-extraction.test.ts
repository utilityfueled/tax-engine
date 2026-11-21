import { describe, expect, it, vi } from "vitest";
import { AnnotationFlags, degrees, PDFDocument, PDFHexString, PDFName, StandardFonts } from "pdf-lib";
import { detectUploadedDocumentFromFile, extractPdfTextFromFile, prepareUploadableFiles } from "../../../apps/web/src/lib/uploaded-document-detection";
import { createWorkspaceRecord, getFutureYearSampleUploadMessage, ingestFilesIntoWorkspace } from "../../../apps/web/src/lib/workspace-storage";
import { reconcileWorkspaceGuidedState } from "../../../apps/web/src/lib/workspace-guided-state";
import { startCompleteInterview } from "../../guided-interview/complete-facts";

vi.mock("server-only", () => ({}));

async function w2CopyB({
  top = [null, null], bottom = [null, null], overlay, bottomEmployer, partlyFlattened = false, rotated = false, withSecondPage = false,
  withInfoCover = false,
}: {
  top?: readonly (string | null)[]; bottom?: readonly (string | null)[];
  overlay?: string; bottomEmployer?: string; partlyFlattened?: boolean; rotated?: boolean; withSecondPage?: boolean;
  withInfoCover?: boolean;
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([612, 792]);
  const form = pdf.getForm();
  for (const [panel, offset, firstField, values] of [
    ["Top", 396, 1, top],
    ["Bottom", 0, 45, bottom],
  ] as const) {
    for (const [str, x, y] of [
      ["Wages, tips, other compensation", 347.652, 328.001],
      ["Federal income tax withheld", 470.83, 328.001],
      ["W-2", 57.6, 36.864],
      ["Wage and Tax Statement", 106.501, 41.454],
      ["2026", 289.441, 36.828],
      ["Copy B—To Be Filed With Employee’s FEDERAL Tax Return.", 36, 24.887],
    ] as const) page.drawText(str, { x, y: y + offset, size: 7, font });

    if (partlyFlattened && panel === "Bottom") {
      page.drawText("88,222.43", { x: 338, y: 316, size: 7, font });
      continue;
    }
    const prefix = `topmostSubform[0].CopyB[0].CopyB_${panel}[0].Col_Right[0].`;
    for (let index = 0; index < 44; index++) {
      const name = `f2_${String(firstField + index).padStart(2, "0")}[0]`;
      const field = form.createTextField(prefix + (index === 8 ? "Box1_ReadOrder[0]." : "") + name);
      if (index === 8 || index === 9) {
        const value = values[index - 8];
        if (value !== null) field.setText(value);
        field.addToPage(page, { x: index === 8 ? 333.2 : 455.6, y: 312.001 + offset, width: 118.4, height: 11.999, borderWidth: 0 });
      } else {
        if (index === 2 && panel === "Bottom" && bottomEmployer) field.setText(bottomEmployer);
        field.addToPage(page, { x: 38 + index * 4, y: 230 + offset, width: 3, height: 5, borderWidth: 0 });
      }
    }
    for (let index = 0; index < 3; index++) {
      const number = (panel === "Top" ? 2 : 6) + index;
      const field = form.createCheckBox(prefix + `c2_${number}[0]`);
      field.addToPage(page, { x: 38 + index * 8, y: 214 + offset, width: 5, height: 5, borderWidth: 0 });
    }
  }
  if (overlay) page.drawText(overlay, { x: 339, y: 712, size: 7, font });
  if (rotated) page.setRotation(degrees(90));
  if (withSecondPage) pdf.addPage([612, 792]);
  if (withInfoCover) {
    const cover = pdf.insertPage(0, [612, 792]);
    for (const [index, text] of [
      "File Forms W-2 and W-3 Electronically for Free",
      "To electronically file, go to: www.ssa.gov/bso.",
      "CAUTION: DO NOT FILE",
      "Copy A of this form is provided for informational purposes only.",
    ].entries()) cover.drawText(text, { x: 38, y: 740 - index * 20, size: 12, font });
  }
  return new File([new Uint8Array(await pdf.save())], "unnamed.pdf", { type: "application/pdf" });
}

it("recognizes the official 2026 W-2 informational packet before original intake", async () => {
  const [upload] = await prepareUploadableFiles([await w2CopyB({ top: ["3,210.09", "0"], withInfoCover: true })]);
  expect(upload.detectedDocument).toMatchObject({
    kind: "w2", taxYear: 2026, label: "2026 Form W-2 (official info-copy PDF)", detectedFacts: [],
  });
  expect(getFutureYearSampleUploadMessage([upload])).toContain("is an official sample document for tax year 2026");
  expect(getFutureYearSampleUploadMessage([upload], true)).toContain("is an official sample document for tax year 2026");
});

it("keeps a mixed 1099-R and W-2 packet manual without wage seeds", async () => {
  const source = await w2CopyB({ top: ["3,210.09", "0"] });
  const pdf = await PDFDocument.load(await source.arrayBuffer());
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const retirement = pdf.addPage([612, 792]);
  for (const [str, x, y] of [
    ["Form", 406.093, 693.861], ["1099-R", 424.377, 693.861],
    ["20", 406, 716.721], ["26", 431.28, 716.721],
    ["Copy B", 541.36, 678.861], ["7a", 297.7, 580.001], ["7b", 348.1, 580.001],
    ["1099-R", 68.684, 421.861],
  ] as const) retirement.drawText(str, { x, y, size: str === "Form" ? 5 : 7, font });

  const file = new File([new Uint8Array(await pdf.save())], "f1099r.pdf", { type: "application/pdf" });
  const [upload] = await prepareUploadableFiles([file]);
  expect(upload.detectedDocument).toMatchObject({ kind: "1099-r", coverage: "needs-review", taxYear: null, seededFactIds: [], detectedFacts: [] });
  const workspace = ingestFilesIntoWorkspace(createWorkspaceRecord("mixed-public-statements"), [upload]);
  expect(workspace.documents).toMatchObject([{ matchedFixtureId: null, taxYear: null, seededFactIds: [] }]);
});

it.each([
  { name: "top wages and explicit zero withholding", top: ["3,210.09", "0"], year: 2026, wages: "3210.09", withheld: "0.00" },
  { name: "bottom withholding with unknown wages", bottom: [null, "18.10"], year: 2026, wages: "", withheld: "18.10" },
  { name: "blank official layout", year: null },
  { name: "two populated statements", top: ["3,210.09", null], bottom: [null, "18.10"], year: null },
  { name: "second statement has a separate employer only", top: ["3,210.09", null], bottomEmployer: "Synthetic Employer", year: null },
  { name: "second statement was flattened", top: ["3,210.09", null], partlyFlattened: true, year: null },
  { name: "overlaid amount conflicts with widget", top: ["3,210.09", "18.10"], overlay: "555.43", year: 2026, wages: "", withheld: "18.10" },
  { name: "overlaid amount in another statement", bottom: [null, "18.10"], overlay: "555.43", year: null },
  { name: "rotated page", top: ["3,210.09", "18.10"], rotated: true, year: null },
  { name: "multiple pages need manual separation", top: ["3,210.09", "18.10"], withSecondPage: true, year: null },
])("keeps 2026 W-2 Copy B statements separate ($name)", async ({ year, wages, withheld, ...source }) => {
  const document = await detectUploadedDocumentFromFile(await w2CopyB(source));
  expect(document).toMatchObject({ kind: "w2", taxYear: year, coverage: "partially-supported" });
  if (year === null) {
    expect(document?.detectedFacts).toEqual([]);
  } else {
    expect(document?.detectedFacts[0]?.machineValue).toEqual({
      entryKind: "w2-summary", sourceFactsVersion: 2, employerName: "", employerEin: "", wages, federalWithheld: withheld,
    });
  }
});

async function syntheticDocument() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const first = pdf.addPage();
  first.drawText("Wages 12345.67", { x: 40, y: 700, size: 12, font });
  first.drawText("Federal withholding 890.12", { x: 40, y: 680, size: 12, font });
  pdf.addPage().drawText("Second page 2025-12-31", { x: 40, y: 700, size: 12, font });
  return new Uint8Array(await pdf.save());
}

type CopyBEntry = { text: string; x: number; y: number; rotation?: number; size?: number };

type CopyBWidget = {
  kind: "year" | "amount";
  value: string;
  appearance?: string;
  name?: string;
  moveX?: number;
  rotation?: number;
  flags?: number;
  duplicate?: boolean;
  withoutAppearance?: boolean;
};

async function necCopyBFile(
  entries: CopyBEntry[], revision = "(Rev. December 2026)", extraPage = false,
  options: { widgets?: CopyBWidget[]; rotation?: number } = {},
) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const [text, x, y] of [
    ["Form 1099-NEC", 398.64, 729.78],
    [revision, 397.94, 712.44],
    ["For calendar year", 403, 700],
    ["1a Nonemployee compensation", 299.2, 676],
    ["Copy B", 541.36, 669.77],
    ["State or province", 54, 664],
    ["$", 301.12, 650.86],
    ["For Recipient", 518.52, 649.77],
    ["1b Cash tips", 299.2, 640],
    ["$", 300.62, 614.86],
    ["4 Federal income tax withheld", 299.2, 496],
  ] as const) {
    page.drawText(text, { x, y, size: 8, font });
  }
  for (const { text, x, y, rotation, size = 11 } of entries) {
    page.drawText(text, { x, y, size, font, rotate: degrees(rotation ?? 0) });
  }
  for (const input of options.widgets ?? []) {
    // Names and rectangles transcribed from the official December 2026 Copy B.
    const geometry = input.kind === "year"
      ? { name: "PgHeader[0].CalendarYear[0].f2_1[0]", x: 417.6, y: 687, width: 28.8, height: 8.999 }
      : { name: "RightCol[0].f2_20[0]", x: 309.6, y: 648, width: 185.2, height: 11.999 };
    const field = pdf.getForm().createTextField(input.name ?? `topmostSubform[0].CopyB[0].${geometry.name}`);
    field.setText(input.appearance ?? input.value);
    field.addToPage(page, { ...geometry, x: geometry.x + (input.moveX ?? 0), font, borderWidth: 0 });
    field.updateAppearances(font);
    const [widget] = field.acroField.getWidgets();
    if (input.flags !== undefined) widget.setFlags(input.flags);
    if (input.rotation) widget.getOrCreateAppearanceCharacteristics().setRotation(input.rotation);
    if (input.appearance !== undefined) field.acroField.dict.set(PDFName.of("V"), PDFHexString.fromText(input.value));
    if (input.withoutAppearance) widget.dict.delete(PDFName.of("AP"));
    if (input.duplicate) page.node.addAnnot(pdf.context.register(widget.dict.clone(pdf.context)));
  }
  if (options.rotation) page.setRotation(degrees(options.rotation));
  if (extraPage) pdf.addPage();
  return new File([new Uint8Array(await pdf.save({ updateFieldAppearances: false }))], "recipient-statement.pdf", { type: "application/pdf" });
}

describe("PDF.js 6 text extraction with synthetic documents", () => {
  // Spec: spec/federal/workspace-guided-year.yaml#marketplace-upload-year.
  it("keeps Marketplace PDF source years and statement designations manual through normal upload", async () => {
    // Mirror the official2026 text layout; checkbox appearances are not source text.
    for (const status of ["original", "corrected", "voided"] as const) {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const page = pdf.addPage();
      ["VOID OMB No. 1545-2232", "Health Insurance Marketplace Statement", "Form 1095-A", "CORRECTED", "Department of the Treasury 20 26"].forEach((text, index) => page.drawText(text, {x: 40, y: 780 - index * 20, size: 10, font}));
      page.drawText("Cat. No. 60703Q Form 1095-A (2026) Created 5/12/26", {x: 40, y: 40, size: 9, font});
      const form = pdf.getForm();
      for (const [name, y] of [["voided", 780], ["corrected", 720]] as const) {
        const box = form.createCheckBox(name); box.addToPage(page, {x: 20, y, width: 10, height: 10});
        if (status === name) box.check();
      }
      pdf.addPage().drawText("Form 1095-A (2026) Page 2", {x: 40, y: 780, size: 10, font});
      const file = new File([new Uint8Array(await pdf.save())], "f1095a--2025.pdf", {type: "application/pdf"});
      const prepared = await prepareUploadableFiles([file]);
      expect(prepared[0]?.detectedDocument).toMatchObject({kind: "1095-a", taxYear: 2026, coverage: "needs-review", seededFactIds: [], detectedFacts: []});
      const workspace = ingestFilesIntoWorkspace(createWorkspaceRecord(`marketplace-${status}`), prepared);
      expect(workspace.documents[0]).toMatchObject({kind: "1095-a", taxYear: 2026, coverage: "needs-review", matchedFixtureId: null, seededFactIds: [], detectedFacts: []});
      expect(workspace.structuredFacts).toEqual([]);
      expect(workspace.enginePreview).toBeNull();
      const flow = startCompleteInterview({filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null});
      const mismatched = reconcileWorkspaceGuidedState(workspace, flow);
      expect(mismatched.returnSummary.blockers.some(row => row.id === "guided:conflicting-source-years")).toBe(true);
      flow.taxYear = 2026;
      const sameYear = reconcileWorkspaceGuidedState(workspace, flow);
      expect(sameYear.returnSummary.status).not.toBe("ready-to-recompute");
      expect(sameYear.enginePreview).toBeNull();
      expect(sameYear.documents[0]?.detectedFacts).toEqual([]);
    }
    const legacy = ingestFilesIntoWorkspace(createWorkspaceRecord("filename-only"), [{name: "f1095a--2025.pdf", size: 23}]);
    expect(legacy.documents[0]).toMatchObject({taxYear: 2025, matchedFixtureId: "irs-1095-a-2025"});
    const ambiguous = ingestFilesIntoWorkspace(createWorkspaceRecord("unknown-filename"), [{name: "f1095a.pdf", size: 23}]);
    expect(ambiguous.documents[0]).toMatchObject({taxYear: null, kind: "unknown", matchedFixtureId: null, seededFactIds: [], detectedFacts: []});
  });
  // Spec: spec/federal/workspace-guided-year.yaml#wage-nec-pdf-upload.
  it("retains actual W-2 and NEC PDF text amounts without filename demo substitution", async () => {
    for (const kind of ["w2", "1099-nec"] as const) {
      for (const state of ["blank", "filled", "conflicting"] as const) {
        const pdf = await PDFDocument.create();
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        const page = pdf.addPage();
        const lines = kind === "w2" ? ["2026 Form W-2", "1 Wages, tips, other comp.", ...(state === "blank" ? [] : ["12345.67"]), "2 Federal income tax withheld", ...(state === "blank" ? [] : ["890.12"])] : ["2026 Form 1099-NEC", "1 Nonemployee compensation", ...(state === "blank" ? [] : ["3210.00"]), "4 Federal income tax withheld", ...(state === "blank" ? [] : ["12.00"])];
        if (state === "conflicting") lines.push("Tax year 2025");
        lines.forEach((text, index) => page.drawText(text, {x: 40, y: 780-index*20, size: 10, font}));
        const name = kind === "w2" ? "fw2--2025.pdf" : "f1099nec.pdf";
        const prepared = await prepareUploadableFiles([new File([new Uint8Array(await pdf.save())], name, {type:"application/pdf"})]);
        const workspace = ingestFilesIntoWorkspace(createWorkspaceRecord(`pdf-${kind}-${state}`), prepared);
        const money = workspace.structuredFacts.filter(fact => fact.machineValue).map(fact => fact.machineValue);
        expect(workspace.enginePreview).toBeNull();
        if (state === "blank") {
          expect(money).toEqual([]);
          expect(workspace.seededReturn.interviewQuestions.length).toBeGreaterThan(0);
        } else {
          expect(workspace.documents[0]).toMatchObject({kind, matchedFixtureId:null, taxYear:state === "conflicting" ? null : 2026});
          expect(money).toEqual([expect.objectContaining(kind === "w2" ? {entryKind:"w2-summary",wages:"12345.67",federalWithheld:"890.12"} : {entryKind:"1099-nec-summary",nonemployeeCompensation:"3210.00",federalWithheld:"12.00"})]);
        }
      }
    }
    const unreadable = await prepareUploadableFiles([new File(["not a PDF"], "f1099nec.pdf", {type:"application/pdf"})]);
    const fallback = ingestFilesIntoWorkspace(createWorkspaceRecord("unreadable"), unreadable);
    expect(fallback.seededReturn.interviewQuestions.length).toBeGreaterThan(0);
    expect(fallback.structuredFacts.filter(fact => fact.machineValue)).toEqual([]);
  });
  // Spec: spec/federal/workspace-guided-year.yaml#nec-copy-b-box-1a-pdf.
  it("binds the separated printed NEC Copy B amount to Box 1a", async () => {
    const receipt: CopyBEntry = { text: "3,210.09", x: 323, y: 650.86 };
    const cases = [
      { name: "filled", entries: [receipt], expected: "3210.09" },
      { name: "explicit zero", entries: [{ ...receipt, text: "0.00" }], expected: "0.00" },
      { name: "blank", entries: [] },
      { name: "neighboring box", entries: [{ ...receipt, y: 614.86 }] },
      { name: "wrong column", entries: [{ ...receipt, x: 100 }] },
      { name: "crosses box edge", entries: [{ ...receipt, x: 482 }] },
      { name: "two values", entries: [receipt, { ...receipt, text: "17.00", x: 400 }] },
      { name: "rotated second value", entries: [receipt, { ...receipt, text: "17.00", x: 400, rotation: 2 }] },
      { name: "split value", entries: [{ ...receipt, text: "31" }, { ...receipt, text: "20.09", x: 370 }] },
      { name: "conflicting inline value", entries: [receipt, { ...receipt, text: "99.01", x: 475, y: 676 }] },
      { name: "two conflicting inline amounts", entries: [
        receipt, { ...receipt, text: "99.01", x: 475, y: 676 },
        { ...receipt, text: "1 Nonemployee compensation $ 88.02", x: 54, y: 400 },
      ] },
      { name: "ignore other box from the flattened row", entries: [receipt, { ...receipt, text: "77.77", x: 520, y: 496 }], expected: "3210.09" },
      { name: "unrecognized revision", entries: [receipt], revision: "(Rev. December 2025)" },
      { name: "multi-page", entries: [receipt], extraPage: true },
    ];
    for (const { name, entries, expected, revision, extraPage } of cases) {
      const files = await prepareUploadableFiles([await necCopyBFile(entries, revision, extraPage)]);
      const workspace = ingestFilesIntoWorkspace(createWorkspaceRecord(name), files);
      expect(workspace.documents[0], name).toMatchObject({ kind: "1099-nec", taxYear: null });
      expect(workspace.structuredFacts.flatMap(fact => fact.machineValue ? [fact.machineValue] : []), name)
        .toEqual(expected ? [{
          entryKind: "1099-nec-summary", sourceFactsVersion: 2, payer: "", nonemployeeCompensation: expected,
        }] : []);
      expect(workspace.enginePreview, name).toBeNull();
    }
  });

  // Spec: spec/federal/workspace-guided-year.yaml#nec-copy-b-calendar-year-pdf.
  const copyBYear: CopyBEntry = { text: "2026", x: 423, y: 690, size: 9 };
  it.each([
    { name: "year with same-row payer text", entries: [copyBYear, { ...copyBYear, text: "Fictional Street", x: 54 }], expected: 2026 },
    { name: "bare number in a different column", entries: [{ ...copyBYear, x: 106 }], expected: null },
    { name: "bare number in a different column on the heading row", entries: [{ ...copyBYear, x: 513, y: 700 }], expected: null },
    { name: "year crossing the box edge", entries: [{ ...copyBYear, x: 436 }], expected: null },
    { name: "rotated year", entries: [{ ...copyBYear, rotation: 4 }], expected: null },
    { name: "second in-box value", entries: [copyBYear, { ...copyBYear, text: "1", size: 5, x: 419, y: 693 }], expected: null },
    { name: "same explicit year elsewhere", entries: [copyBYear, { ...copyBYear, text: "Tax year 2026", x: 54, y: 400 }], expected: 2026 },
    { name: "contradictory explicit year elsewhere", entries: [copyBYear, { ...copyBYear, text: "Tax year 2025", x: 54, y: 400 }], expected: null },
    { name: "a second form", entries: [copyBYear, { ...copyBYear, text: "Form 1099-NEC", x: 54, y: 400 }], expected: null },
    { name: "earlier year printed in the box", entries: [{ ...copyBYear, text: "2025" }], expected: 2025 },
    { name: "blank calendar year field", entries: [], expected: null },
  ])("binds the printed NEC Copy B calendar year to its box ($name)", async ({ name, entries, expected }) => {
    const receipt = { text: "3,210.09", x: 323, y: 650.86 };
    const files = await prepareUploadableFiles([await necCopyBFile([receipt, ...entries])]);
    const workspace = ingestFilesIntoWorkspace(createWorkspaceRecord(name), files);
    expect(workspace.documents[0]).toMatchObject({ kind: "1099-nec", taxYear: expected });
    const amounts = workspace.structuredFacts.flatMap(fact => fact.machineValue ? [fact.machineValue] : []);
    expect(amounts).toEqual(name === "a second form" ? [] : [expect.objectContaining({ nonemployeeCompensation: "3210.09" })]);
    expect(workspace.enginePreview).toBeNull();
  });

  // Spec: spec/federal/workspace-guided-year.yaml#nec-copy-b-acroform-pdf.
  const yearWidget: CopyBWidget = { kind: "year", value: "2026" };
  const amountWidget: CopyBWidget = { kind: "amount", value: "3,210.09" };
  const copyBAmount = { text: "3210.09", x: 325, y: 650.86 };
  it.each([
    { name: "filled widgets", widgets: [yearWidget, amountWidget], year: 2026, amount: "3210.09" },
    { name: "explicit zero", widgets: [yearWidget, { ...amountWidget, value: "0.00" }], year: 2026, amount: "0.00" },
    { name: "whole-dollar zero", widgets: [yearWidget, { ...amountWidget, value: "0" }], year: 2026, amount: "0.00" },
    { name: "grouped whole dollars with matching cents", widgets: [yearWidget, { ...amountWidget, value: "3,210" }], entries: [{ ...copyBAmount, text: "3210.00" }], year: 2026, amount: "3210.00" },
    { name: "blank widgets", widgets: [{ ...yearWidget, value: "" }, { ...amountWidget, value: "" }], year: null, amount: null },
    { name: "blank widgets with valid printed values", widgets: [{ ...yearWidget, value: "" }, { ...amountWidget, value: "" }], entries: [copyBYear, copyBAmount], year: 2026, amount: "3210.09" },
    { name: "matching printed evidence", widgets: [yearWidget, amountWidget], entries: [copyBYear, copyBAmount], year: 2026, amount: "3210.09" },
    { name: "different printed year", widgets: [yearWidget, amountWidget], entries: [{ ...copyBYear, text: "2025" }], year: null, amount: "3210.09" },
    { name: "different printed amount", widgets: [yearWidget, amountWidget], entries: [{ ...copyBAmount, text: "1234.56", y: 657 }], year: 2026, amount: null },
    { name: "elsewhere explicit year", widgets: [yearWidget, amountWidget], entries: [{ text: "Tax year 2025", x: 54, y: 400 }], year: null, amount: "3210.09" },
    { name: "stale year appearance", widgets: [{ ...yearWidget, appearance: "2025" }, amountWidget], year: null, amount: "3210.09" },
    { name: "stale amount appearance on blank value", widgets: [yearWidget, { ...amountWidget, value: "", appearance: "0.00" }], year: 2026, amount: null },
    { name: "missing year appearance", widgets: [{ ...yearWidget, withoutAppearance: true }, amountWidget], entries: [copyBYear], year: null, amount: "3210.09" },
    { name: "duplicate year widget", widgets: [{ ...yearWidget, duplicate: true }, amountWidget], year: null, amount: "3210.09" },
    { name: "overlapping unrelated widget", widgets: [yearWidget, { ...yearWidget, name: "Unrelated.Year" }, amountWidget], year: null, amount: "3210.09" },
    { name: "wrong year widget name", widgets: [{ ...yearWidget, name: "topmostSubform[0].Copy1[0].PgHeader[0].CalendarYear[0].f2_1[0]" }, amountWidget], year: null, amount: "3210.09" },
    { name: "moved Box 1a widget", widgets: [yearWidget, { ...amountWidget, moveX: 1 }], year: 2026, amount: null },
    { name: "rotated year widget", widgets: [{ ...yearWidget, rotation: 90 }, amountWidget], year: null, amount: "3210.09" },
    { name: "hidden amount widget", widgets: [yearWidget, { ...amountWidget, flags: AnnotationFlags.NoView }], entries: [copyBAmount], year: 2026, amount: null },
    { name: "rotated page", widgets: [yearWidget, amountWidget], rotation: 90, year: null, amount: null },
    { name: "different revision", widgets: [yearWidget, amountWidget], revision: "(Rev. December 2025)", year: null, amount: null },
  ])("binds NEC Copy B AcroForm widget values to visible original fields ($name)", async ({
    name, widgets, entries, revision, rotation, year, amount,
  }) => {
    const file = await necCopyBFile(entries ?? [], revision, false, { widgets, rotation });
    const files = await prepareUploadableFiles([file]);
    const workspace = ingestFilesIntoWorkspace(createWorkspaceRecord(name), files);
    expect(workspace.documents[0]).toMatchObject({ kind: "1099-nec", taxYear: year });
    expect(workspace.structuredFacts.flatMap(fact => fact.machineValue ? [fact.machineValue] : []))
      .toEqual(amount === null ? [] : [{
        entryKind: "1099-nec-summary", sourceFactsVersion: 2, payer: "", nonemployeeCompensation: amount,
      }]);
    expect(workspace.enginePreview).toBeNull();
  });

  it("keeps the year unknown on a PDF containing two NEC statements", async () => {
    const first = await necCopyBFile([]);
    const second = await necCopyBFile([{ text: "Tax year 2025", x: 54, y: 400 }]);
    const combined = await PDFDocument.load(await first.arrayBuffer());
    const [secondPage] = await combined.copyPages(await PDFDocument.load(await second.arrayBuffer()), [0]);
    combined.addPage(secondPage);
    const file = new File([new Uint8Array(await combined.save())], "two-statements.pdf", { type: "application/pdf" });
    const [prepared] = await prepareUploadableFiles([file]);
    expect(prepared.detectedDocument).toMatchObject({ kind: "1099-nec", taxYear: null, detectedFacts: [] });
  });

  it("preserves monetary/date text and page order without a provider", async () => {
    const file = new File([await syntheticDocument()], "synthetic.pdf", { type: "application/pdf" });
    const text = await extractPdfTextFromFile(file);
    expect(text).toContain("Wages 12345.67\nFederal withholding 890.12");
    expect(text).toContain("\n\nSecond page 2025-12-31");
  });

  it("rejects malformed bytes and can read the next document", async () => {
    await expect(extractPdfTextFromFile(new File(["not a PDF"], "bad.pdf"))).rejects.toThrow();
    const text = await extractPdfTextFromFile(new File([await syntheticDocument()], "next.pdf"));
    expect(text).toContain("Wages 12345.67");
  });
});
