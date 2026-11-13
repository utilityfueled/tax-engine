/** Spec: spec/federal/form-6252-2026-template.yaml. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFArray, PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFRef, PDFTextField } from "pdf-lib";
import { expect, it } from "vitest";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS } from "@/pdf/export-policy.js";
import { REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";

const blank = new URL("../../forms/blank/2026/f6252.pdf", import.meta.url);
const digest = "efecc62a9ed84ba8328eaceecc71305b7176ffa072ad24a30bb9cb4d5ded9310";
const fieldPrefix = "topmostSubform[0].Page1[0].";
type Location = [name: string, kind: "/Tx" | "/Btn", rect: number[], states: string[]];

async function candidate() {
  const { FORM_6252_2026_CANDIDATE } = await import("../../src/pdf/mappings/2026/form-6252-candidate.js");
  return FORM_6252_2026_CANDIDATE;
}

const investmentLand = {
  acquiredDate: "2023-02-28", soldDate: "2026-05-12",
  firstFuturePayment: { date: "2027-05-12", principal: "40000" },
  sellingPrice: "120000", costBasis: "42000", sellingExpenses: "3000", currentPrincipal: "30000",
  closingBasisAndPaymentRecordsConfirmed: true,
  investmentLandAndUnrelatedFixedPriceSaleConfirmed: true,
  ordinaryInstallmentMethodWithoutAssumedDebtOrSpecialPaymentsConfirmed: true,
};

it("pins the final blank and its integral instructions", async () => {
  const bytes = await readFile(blank);
  expect(bytes).toHaveLength(119676);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(digest);
  expect(await candidate()).toMatchObject({
    taxYear: 2026,
    sha256: digest,
    sourceRevision: "Created 6/16/26",
    posted: "2026-10-16",
    instructionsPages: [2, 3, 4],
  });
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getTitle()).toBe("2026 Form 6252");
  expect(pdf.getPageCount()).toBe(4);
  expect(pdf.getPages().slice(1).map(page => page.node.Annots()?.size() ?? 0)).toEqual([0, 0, 0]);
});

it("matches every official page-one field and widget location", async () => {
  const [bytes, { fields }, census] = await Promise.all([
    readFile(blank),
    candidate(),
    readFile(new URL("../fixtures/pdf-2026/form-6252-source.json", import.meta.url), "utf8")
      .then(text => JSON.parse(text) as Location[]),
  ]);
  const pdf = await PDFDocument.load(bytes);
  pdf.catalog.getAcroForm()?.dict.delete(PDFName.of("XFA"));
  const form = pdf.getForm();
  expect(census).toHaveLength(49);
  expect(census.filter(([, kind]) => kind === "/Btn")).toHaveLength(11);
  const mapped = Object.values(fields).sort();
  expect(mapped).toEqual(census.map(([name]) => name).sort());
  expect(mapped).toEqual(form.getFields().map(field => field.getName()).sort());
  for (const [name, kind, [left, bottom, right, top], states] of census) {
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
    expect(widget.P()).toEqual(pdf.getPage(0).ref);
    if (field instanceof PDFCheckBox) expect(field.acroField.getOnValue()?.toString()).toBe(states[0]);
  }
});

it("binds the decimal, related-party rows and exception date separately", async () => {
  const { fields } = await candidate();
  expect([
    fields.line19GrossProfitPercentage,
    fields.line27RelatedPartyFirst,
    fields.line27RelatedPartySecond,
    fields.line28Yes,
    fields.line28No,
    fields.line29a,
    fields.line29aDispositionDate,
    fields.line29b,
    fields.line29c,
    fields.line29d,
    fields.line29e,
  ]).toEqual([
    "f1_20[0]", "f1_28[0]", "f1_29[0]", "c1_3[0]", "c1_3[1]", "c1_4[0]",
    "f1_30[0]", "c1_4[1]", "c1_4[2]", "c1_4[3]", "c1_4[4]",
  ].map(name => fieldPrefix + name));
});

async function editableAnnualBlank() {
  const pdf = await PDFDocument.load(await readFile(blank));
  const acro = pdf.catalog.getAcroForm()?.dict;
  const xfaKey = PDFName.of("XFA");
  const xfaPackets = acro?.lookupMaybe(xfaKey, PDFArray)?.asArray()
    .filter((packet): packet is PDFRef => packet instanceof PDFRef) ?? [];
  expect(xfaPackets).toHaveLength(8);
  // The pinned blank's packet streams are referenced only by this array.
  acro?.delete(xfaKey);
  for (const packet of xfaPackets) pdf.context.delete(packet);
  acro?.delete(PDFName.of("SigFlags"));

  // The official blank's Reader rights signature cannot survive rewriting.
  const permissionsKey = PDFName.of("Perms");
  const permissions = pdf.catalog.get(permissionsKey);
  const readerRights = pdf.context.lookupMaybe(permissions, PDFDict)?.get(PDFName.of("UR3"));
  expect(permissions).toBeInstanceOf(PDFRef);
  expect(readerRights).toBeInstanceOf(PDFRef);
  pdf.catalog.delete(permissionsKey);
  if (permissions instanceof PDFRef) pdf.context.delete(permissions);
  if (readerRights instanceof PDFRef) pdf.context.delete(readerRights);
  return { pdf, xfaKey, xfaPackets, permissionsKey, permissions, readerRights };
}

it("reopens the marked diagnostic without identity data or inherited active content", async () => {
  const [{ fields }, { pdf, xfaKey, xfaPackets, permissionsKey, permissions, readerRights }] =
    await Promise.all([candidate(), editableAnnualBlank()]);
  const form = pdf.getForm();
  const texts = new Map<string, string>([
    [fields.line1PropertyDescription, "Synthetic equipment"],
    [fields.line2aAcquiredDate, "01/15/2020"],
    [fields.line2bSoldDate, "03/10/2023"],
    [fields.line5, "89000"],
    [fields.line18, "76543"],
    [fields.line19GrossProfitPercentage, "0.375123"],
    [fields.line20, "0"],
    [fields.line24, "1234"],
    [fields.line29aDispositionDate, "11/05/2026"],
  ]);
  for (const [name, value] of texts) form.getTextField(name).setText(value);
  const checked = new Set<string>([fields.line3Yes, fields.line4No, fields.line28Yes, fields.line29a]);
  for (const name of checked) form.getCheckBox(name).check();

  await markReviewPdf(pdf);
  const bytes = await pdf.save();
  const reopened = await PDFDocument.load(bytes);
  expect(reopened.getPageCount()).toBe(4);
  expect(reopened.catalog.get(permissionsKey)).toBeUndefined();
  expect(reopened.context.lookup(permissions)).toBeUndefined();
  expect(reopened.context.lookup(readerRights)).toBeUndefined();
  expect(reopened.catalog.getAcroForm()?.dict.get(xfaKey)).toBeUndefined();
  for (const packet of xfaPackets) expect(reopened.context.lookup(packet)).toBeUndefined();
  expect(reopened.catalog.getAcroForm()?.dict.get(PDFName.of("SigFlags"))).toBeUndefined();
  const names = reopened.context.lookupMaybe(reopened.catalog.get(PDFName.of("Names")), PDFDict);
  expect(names?.get(PDFName.of("JavaScript"))).toBeUndefined();
  const reopenedForm = reopened.getForm();
  for (const [name, value] of texts) {
    const field = reopenedForm.getTextField(name);
    expect(field.getText()).toBe(value);
    expect(field.acroField.getWidgets()[0].getAppearances()?.normal).toBeDefined();
  }
  for (const field of reopenedForm.getFields()) {
    if (field instanceof PDFCheckBox) expect(field.isChecked()).toBe(checked.has(field.getName()));
  }
  for (const name of [
    fields.name,
    fields.identifyingNumber,
    fields.line27RelatedPartyFirst,
    fields.line27RelatedPartySecond,
  ]) {
    expect(reopenedForm.getTextField(name).getText()).toBeUndefined();
  }
  const evidence = process.env.TAX_ENGINE_FORM6252_CANDIDATE_EVIDENCE_DIR;
  if (evidence) await writeFile(join(evidence, "form-6252-diagnostic.pdf"), bytes, { mode: 0o600 });
});

it("keeps annual review and filing exports unavailable", async () => {
  expect(await candidate()).toMatchObject({
    filingQualified: false,
    exportsEnabled: false,
    reviewStatus: "independent-review-pending",
  });
  expect(PDF_MAPPING_PACKS[2026].reviewAvailable).toBe(false);
  expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
  expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified/u);
  expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/Filing exports are unavailable/u);
});

it("projects a confirmed current investment-land installment sale", async () => {
  const { projectForm62522026InvestmentLand, FORM_6252_2026_CANDIDATE: { fields } } =
    await import("@/pdf/mappings/2026/form-6252-candidate.js");
  const result = projectForm62522026InvestmentLand(investmentLand);
  expect(result).toEqual({
    text: {
      [fields.line1PropertyDescription]: "4 - Investment land", [fields.line2aAcquiredDate]: "02/28/2023", [fields.line2bSoldDate]: "05/12/2026",
      [fields.line5]: "120000", [fields.line6]: "0", [fields.line7]: "120000", [fields.line8]: "42000", [fields.line9]: "0",
      [fields.line10]: "42000", [fields.line11]: "3000", [fields.line12]: "0", [fields.line13]: "45000", [fields.line14]: "75000",
      [fields.line15]: "0", [fields.line16]: "75000", [fields.line17]: "0", [fields.line18]: "120000",
      [fields.line19GrossProfitPercentage]: "0.6250", [fields.line20]: "0", [fields.line21]: "30000", [fields.line22]: "30000",
      [fields.line23]: "0", [fields.line24]: "18750", [fields.line25]: "0", [fields.line26]: "18750",
    },
    checked: [fields.line3No, fields.line4Yes],
  });
  const zeroCurrent = projectForm62522026InvestmentLand({ ...investmentLand, currentPrincipal: "0" });
  expect([fields.line21, fields.line22, fields.line24, fields.line26].map(name => zeroCurrent.text[name])).toEqual(["0", "0", "0", "0"]);
  const precision = projectForm62522026InvestmentLand({ ...investmentLand, sellingPrice: "120003" });
  expect(precision.text[fields.line19GrossProfitPercentage]).toBe("0.625009");
  expect(precision.text[fields.line24]).toBe("18750");
  expect(projectForm62522026InvestmentLand({ ...investmentLand, acquiredDate: "2025-05-11" }).text[fields.line2aAcquiredDate]).toBe("05/11/2025");
  for (const change of [
    { acquiredDate: "2025-05-12" }, { acquiredDate: "2025-05-13" }, { acquiredDate: "2024-02-30" }, { soldDate: "2025-05-12" },
    { closingBasisAndPaymentRecordsConfirmed: false }, { investmentLandAndUnrelatedFixedPriceSaleConfirmed: false },
    { ordinaryInstallmentMethodWithoutAssumedDebtOrSpecialPaymentsConfirmed: false }, { currentPrincipal: undefined },
    { firstFuturePayment: { date: "2026-12-31", principal: "40000" } }, { firstFuturePayment: { date: "2027-01-01", principal: "0" } },
    { firstFuturePayment: { date: "2027-01-01", principal: "90000.01" } }, { currentPrincipal: "120000" }, { assumedLiabilities: "1" },
    { sellingExpenses: "78000" }, { sellingExpenses: "3000.49", costBasis: "42000.49" },
    { sellingPrice: "120000.49" }, { currentPrincipal: "119999.99", firstFuturePayment: { date: "2027-05-12", principal: "0.01" } },
    { currentPrincipal: "2e4" }, { sellingExpenses: "0.001" },
  ]) expect(() => projectForm62522026InvestmentLand({ ...investmentLand, ...change })).toThrow(/installment sale/i);

  const { pdf } = await editableAnnualBlank();
  const form = pdf.getForm();
  for (const [name, value] of Object.entries(result.text)) form.getTextField(name).setText(value);
  for (const name of result.checked) form.getCheckBox(name).check();
  await markReviewPdf(pdf);
  const bytes = await pdf.save();
  const reopened = await PDFDocument.load(bytes);
  expect(reopened.getPageCount()).toBe(4);
  for (const field of reopened.getForm().getFields()) {
    if (field instanceof PDFTextField) expect(field.getText()).toBe(result.text[field.getName()]);
    if (field instanceof PDFCheckBox) expect(field.isChecked()).toBe(result.checked.includes(field.getName()));
  }
  const evidence = process.env.TAX_ENGINE_FORM6252_CANDIDATE_EVIDENCE_DIR;
  if (evidence) await writeFile(join(evidence, "form-6252-investment-land.pdf"), bytes, { mode: 0o600 });
});
