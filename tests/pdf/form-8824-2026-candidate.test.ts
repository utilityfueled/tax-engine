/** Spec: spec/federal/form-8824-2026-template.yaml. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFArray, PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFRef, PDFTextField } from "pdf-lib";
import { expect, it } from "vitest";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS } from "@/pdf/export-policy.js";
import { REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";

const blank = new URL("../../forms/blank/2026/f8824.pdf", import.meta.url);
const digest = "7f9da3429cffd9469b8268665c376051abe0ed09be93445b607cf74229df5542";
type Location = [page: number, name: string, kind: "/Tx" | "/Btn", rect: number[], states: string[]];

async function candidate() {
  const { FORM_8824_2026_CANDIDATE } = await import("@/pdf/mappings/2026/form-8824-candidate.js");
  return FORM_8824_2026_CANDIDATE;
}

async function readBlank() {
  const pdf = await PDFDocument.load(await readFile(blank));
  pdf.catalog.getAcroForm()?.dict.delete(PDFName.of("XFA"));
  return pdf;
}

it("pins the final blank and instructions revision", async () => {
  const bytes = await readFile(blank);
  expect(bytes).toHaveLength(101694);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(digest);
  expect(await candidate()).toMatchObject({
    taxYear: 2026, sha256: digest, sourceRevision: "Created 10/30/26", posted: "2026-11-03",
    instructions: {
      sourceUrl: "https://www.irs.gov/pub/irs-prior/i8824--2026.pdf",
      posted: "2026-11-10", bytes: 218840,
      sha256: "f4f7efe4cf14ce01282032c5f5b9866f7f3f11367dfa73024e4ff21469cf5685",
    },
  });
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getTitle()).toBe("2026 Form 8824");
  expect(pdf.getPageCount()).toBe(2);
});

it("matches all official field and widget locations", async () => {
  const [pdf, { fields }, census] = await Promise.all([
    readBlank(), candidate(), readFile(new URL("../fixtures/pdf-2026/form-8824-source.json", import.meta.url), "utf8")
      .then(text => JSON.parse(text) as Location[]),
  ]);
  const form = pdf.getForm();
  expect(census).toHaveLength(68);
  expect(census.filter(([page]) => page === 1)).toHaveLength(28);
  expect(census.filter(([page]) => page === 2)).toHaveLength(40);
  expect(census.filter(([, , kind]) => kind === "/Btn")).toHaveLength(9);
  const mapped = Object.values(fields).sort();
  expect(mapped).toEqual(census.map(([, name]) => name).sort());
  expect(mapped).toEqual(form.getFields().map(field => field.getName()).sort());
  for (const [page, name, kind, [left, bottom, right, top], states] of census) {
    const field = form.getField(name);
    expect(field).toBeInstanceOf(kind === "/Tx" ? PDFTextField : PDFCheckBox);
    const widgets = field.acroField.getWidgets();
    expect(widgets).toHaveLength(1);
    const [widget] = widgets;
    const { x, y, width, height } = widget.getRectangle();
    expect(x).toBeCloseTo(left, 3);
    expect(y).toBeCloseTo(bottom, 3);
    expect(width).toBeCloseTo(right - left, 3);
    expect(height).toBeCloseTo(top - bottom, 3);
    expect(widget.P()).toEqual(pdf.getPage(page - 1).ref);
    if (field instanceof PDFCheckBox) expect(field.acroField.getOnValue()?.toString()).toBe(states[0]);
  }
});

it("preserves the write-in, basis breakdown and split certificate cells", async () => {
  const { fields } = await candidate();
  expect([
    fields.line19WriteIn, fields.line19,
    fields.line25a, fields.line25b, fields.line25c,
    fields.line26CertificateLeft, fields.line26CertificateRight,
    fields.line27DescriptionFirst, fields.line27DescriptionSecond,
    fields.line28DescriptionFirst, fields.line28DescriptionSecond,
  ]).toEqual([14, 15, 22, 23, 24, 25, 26, 27, 28, 29, 30]
    .map(index => `topmostSubform[0].Page2[0].f2_${index}[0]`));
});

it("reopens a marked diagnostic with separate fields and blank identifiers", async () => {
  const [bytes, { fields }] = await Promise.all([readFile(blank), candidate()]);
  const pdf = await PDFDocument.load(bytes);
  const acro = pdf.catalog.getAcroForm()?.dict;
  const xfaKey = PDFName.of("XFA");
  const xfaPackets = acro?.lookupMaybe(xfaKey, PDFArray)?.asArray()
    .filter((packet): packet is PDFRef => packet instanceof PDFRef) ?? [];
  expect(xfaPackets).toHaveLength(10);
  // The pinned blank's packet streams are referenced only by this array.
  acro?.delete(xfaKey);
  acro?.delete(PDFName.of("SigFlags"));
  for (const packet of xfaPackets) pdf.context.delete(packet);
  // A rewritten diagnostic cannot retain the blank's byte-bound Reader rights signature.
  const permissionsKey = PDFName.of("Perms");
  const permissions = pdf.catalog.get(permissionsKey);
  const readerRights = pdf.context.lookupMaybe(permissions, PDFDict)?.get(PDFName.of("UR3"));
  pdf.catalog.delete(permissionsKey);
  if (permissions instanceof PDFRef) pdf.context.delete(permissions);
  if (readerRights instanceof PDFRef) pdf.context.delete(readerRights);
  const form = pdf.getForm();
  const text = new Map<string, string>([
    [fields.line1PropertyGivenUp, "Synthetic rental unit"], [fields.line2PropertyReceived, "Synthetic office unit"],
    [fields.line4TransferredDate, "03/14/2026"], [fields.line5IdentifiedDate, "04/01/2026"],
    [fields.line8Apartment, "4B"], [fields.line8ForeignPostalCode, "A1B 2C3"],
    [fields.line19WriteIn, "Section 121 exclusion 100"], [fields.line19, "4321"],
    [fields.line25a, "111"], [fields.line25b, "222"], [fields.line25c, "333"],
    [fields.line26CertificateLeft, "1234"], [fields.line26CertificateRight, "5678"],
    [fields.line27DescriptionFirst, "Synthetic divested item"], [fields.line27DescriptionSecond, "Second description row"],
    [fields.line28DescriptionFirst, "Synthetic replacement"], [fields.line28DescriptionSecond, "Distinct next row"],
  ]);
  const filledDateFields = new Set<string>([fields.line4TransferredDate, fields.line5IdentifiedDate]);
  for (const [name, value] of text) {
    const field = form.getTextField(name);
    // The IRS date prompt is static page text beneath the widget.
    if (filledDateFields.has(name)) {
      field.acroField.getWidgets()[0].getOrCreateAppearanceCharacteristics().setBackgroundColor([1, 1, 1]);
    }
    field.setText(value);
  }
  const checks = [fields.line7Yes, fields.line9Yes, fields.line10No, fields.line11b];
  for (const name of checks) form.getCheckBox(name).check();
  await markReviewPdf(pdf);
  const diagnostic = await pdf.save();
  const reopenedPdf = await PDFDocument.load(diagnostic);
  expect(reopenedPdf.catalog.getAcroForm()?.dict.get(xfaKey)).toBeUndefined();
  for (const packet of xfaPackets) expect(reopenedPdf.context.lookup(packet)).toBeUndefined();
  expect(reopenedPdf.catalog.getAcroForm()?.dict.get(PDFName.of("SigFlags"))).toBeUndefined();
  expect(permissions).toBeInstanceOf(PDFRef);
  expect(readerRights).toBeInstanceOf(PDFRef);
  expect(reopenedPdf.catalog.get(permissionsKey)).toBeUndefined();
  expect(reopenedPdf.context.lookup(permissions)).toBeUndefined();
  expect(reopenedPdf.context.lookup(readerRights)).toBeUndefined();
  const reopened = reopenedPdf.getForm();
  for (const [name, value] of text) {
    const field = reopened.getTextField(name);
    expect(field.getText()).toBe(value);
    expect(field.acroField.getWidgets()[0].getAppearances()?.normal).toBeDefined();
  }
  for (const name of checks) expect(reopened.getCheckBox(name).isChecked()).toBe(true);
  for (const name of [fields.line7No, fields.line9No, fields.line10Yes, fields.line11a, fields.line11c]) {
    expect(reopened.getCheckBox(name).isChecked()).toBe(false);
  }
  for (const name of [fields.name, fields.identifyingNumber, fields.page2Name, fields.page2IdentifyingNumber,
    fields.line8RelatedPartyName, fields.line8RelatedPartyIdentifyingNumber]) {
    expect(reopened.getTextField(name).getText()).toBeUndefined();
  }
  const evidence = process.env.TAX_ENGINE_FORM8824_CANDIDATE_EVIDENCE_DIR;
  if (evidence) await writeFile(join(evidence, "form-8824-diagnostic.pdf"), diagnostic, { mode: 0o600 });
});

it("keeps annual review and filing exports unavailable", async () => {
  expect(await candidate()).toMatchObject({
    filingQualified: false, exportsEnabled: false, reviewStatus: "independent-review-pending",
  });
  expect(PDF_MAPPING_PACKS[2026].reviewAvailable).toBe(false);
  expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
  expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified/u);
  expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/Filing exports are unavailable/u);
});
