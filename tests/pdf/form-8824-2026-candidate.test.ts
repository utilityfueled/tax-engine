/** Spec: spec/federal/form-8824-2026-template.yaml. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFArray, PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFRef, PDFTextField } from "pdf-lib";
import { expect, it } from "vitest";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS } from "@/pdf/export-policy.js";
import { REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";
import { projectForm88242026InvestmentLand } from "@/pdf/mappings/2026/form-8824-candidate.js";

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

const investmentLand = {
  relinquishedDescription: "100 Fictional Lane, PA - investment land",
  replacementDescription: "200 Fictional Lane, OH - investment land",
  acquiredDate: "2024-06-01",
  transferredDate: "2026-06-15",
  receivedDate: "2026-06-15",
  relinquishedBasis: "100000",
  replacementFmv: "260000",
  cashReceived: "40000",
  cashPaid: "0",
  exchangeExpenses: "5000",
  closingAndBasisRecordsConfirmed: true,
  domesticInvestmentLandAndUnrelatedPartiesConfirmed: true,
  noDebtOtherPropertyOrSpecialTreatmentConfirmed: true,
};

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

async function openDiagnosticTemplate() {
  const pdf = await PDFDocument.load(await readFile(blank));
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
  return { pdf, xfaKey, xfaPackets, permissionsKey, permissions, readerRights };
}

it("reopens a marked diagnostic with separate fields and blank identifiers", async () => {
  const [{ pdf, xfaKey, xfaPackets, permissionsKey, permissions, readerRights }, { fields }] = await Promise.all([
    openDiagnosticTemplate(), candidate(),
  ]);
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

it("projects confirmed simultaneous investment land exchanges on the final candidate", async () => {
  const { fields } = await candidate();
  const { text, checked } = projectForm88242026InvestmentLand(investmentLand);
  expect(text).toEqual({
    [fields.line1PropertyGivenUp]: investmentLand.relinquishedDescription,
    [fields.line2PropertyReceived]: investmentLand.replacementDescription,
    [fields.line3AcquiredDate]: "06/01/2024",
    [fields.line4TransferredDate]: "06/15/2026",
    [fields.line5IdentifiedDate]: "06/15/2026",
    [fields.line6ReceivedDate]: "06/15/2026",
    [fields.line15]: "35000", [fields.line15aDescriptionFirst]: "Cash",
    [fields.line16]: "260000", [fields.line17]: "295000", [fields.line18]: "100000",
    [fields.line19]: "195000", [fields.line20]: "35000", [fields.line21]: "0",
    [fields.line22]: "35000", [fields.line23]: "35000", [fields.line24]: "160000", [fields.line25]: "100000",
  });
  expect(checked).toEqual([fields.line7No]);
  const paid = projectForm88242026InvestmentLand({ ...investmentLand,
    relinquishedBasis: "170000", replacementFmv: "300000", cashReceived: "0", cashPaid: "20000", exchangeExpenses: "1000",
  });
  expect(paid.text).toMatchObject({ [fields.line15]: "0", [fields.line18]: "191000",
    [fields.line19]: "109000", [fields.line22]: "0", [fields.line24]: "109000", [fields.line25]: "191000" });
  expect(paid.text[fields.line15aDescriptionFirst]).toBeUndefined();
  const { pdf } = await openDiagnosticTemplate();
  const form = pdf.getForm();
  const dateFields = new Set<string>([fields.line3AcquiredDate, fields.line4TransferredDate, fields.line5IdentifiedDate, fields.line6ReceivedDate]);
  for (const [name, value] of Object.entries(text)) {
    const field = form.getTextField(name);
    if (dateFields.has(name)) field.acroField.getWidgets()[0].getOrCreateAppearanceCharacteristics().setBackgroundColor([1, 1, 1]);
    field.setText(value);
  }
  for (const name of checked) form.getCheckBox(name).check();
  await markReviewPdf(pdf);
  const bytes = await pdf.save();
  const saved = (await PDFDocument.load(bytes)).getForm();
  for (const field of saved.getFields()) {
    const name = field.getName();
    if (field instanceof PDFTextField) expect(field.getText()).toBe(text[name]);
    if (field instanceof PDFCheckBox) expect(field.isChecked()).toBe(checked.includes(name));
  }
  const evidence = process.env.TAX_ENGINE_FORM8824_CANDIDATE_EVIDENCE_DIR;
  if (evidence) await writeFile(join(evidence, "form-8824-investment-land.pdf"), bytes, { mode: 0o600 });
});

it("rejects unsupported investment land exchanges and unreconciled printed amounts", () => {
  for (const overrides of [
    { acquiredDate: "2025-06-15" }, { receivedDate: "2026-06-16" },
    { transferredDate: "2025-06-15", receivedDate: "2025-06-15" }, { relinquishedDescription: " " },
    { cashPaid: "1" }, { cashReceived: "-1" }, { replacementFmv: "0" }, { liabilitiesAssumed: "1" },
    { closingAndBasisRecordsConfirmed: undefined }, { domesticInvestmentLandAndUnrelatedPartiesConfirmed: false },
    { noDebtOtherPropertyOrSpecialTreatmentConfirmed: false },
    { cashReceived: "0", relinquishedBasis: "260000", exchangeExpenses: "0" },
    { cashReceived: "0.49", replacementFmv: "100000.49", exchangeExpenses: "0", relinquishedBasis: "20000" },
    { cashReceived: "0", replacementFmv: "100000.49", exchangeExpenses: "0", relinquishedBasis: "100000" },
  ]) expect(() => projectForm88242026InvestmentLand({ ...investmentLand, ...overrides })).toThrow(/Form 8824/u);
});

const deferredLand = {
  ...investmentLand,
  receivedDate: "2026-10-01",
  filingDeadline: "2027-04-15",
  filingDeadlineAndExtensionStatusConfirmed: true,
  qualifiedIntermediaryAgreementAndNoEarlyAccessConfirmed: true,
  writtenIdentification: { date: "2026-07-30", signedDeliveredAndMatchesReplacementConfirmed: true },
};

it("projects confirmed deferred investment land dates and amounts on the final candidate", async () => {
  const { projectForm88242026DeferredInvestmentLand, FORM_8824_2026_CANDIDATE: { fields } } =
    await import("@/pdf/mappings/2026/form-8824-candidate.js");
  const { text, checked } = projectForm88242026DeferredInvestmentLand(deferredLand);
  expect(text).toEqual({ ...projectForm88242026InvestmentLand(investmentLand).text,
    [fields.line4TransferredDate]: "06/15/2026",
    [fields.line5IdentifiedDate]: "07/30/2026",
    [fields.line6ReceivedDate]: "10/01/2026",
  });
  expect(checked).toEqual([fields.line7No]);
  const { pdf } = await openDiagnosticTemplate();
  const form = pdf.getForm();
  const dateFields = new Set<string>([fields.line3AcquiredDate, fields.line4TransferredDate, fields.line5IdentifiedDate, fields.line6ReceivedDate]);
  for (const [name, value] of Object.entries(text)) {
    const field = form.getTextField(name);
    if (dateFields.has(name)) field.acroField.getWidgets()[0].getOrCreateAppearanceCharacteristics().setBackgroundColor([1, 1, 1]);
    field.setText(value);
  }
  for (const name of checked) form.getCheckBox(name).check();
  await markReviewPdf(pdf);
  const bytes = await pdf.save();
  const saved = (await PDFDocument.load(bytes)).getForm();
  for (const field of saved.getFields()) {
    const name = field.getName();
    if (field instanceof PDFTextField) expect(field.getText()).toBe(text[name]);
    if (field instanceof PDFCheckBox) expect(field.isChecked()).toBe(checked.includes(name));
  }
  const evidence = process.env.TAX_ENGINE_FORM8824_CANDIDATE_EVIDENCE_DIR;
  if (evidence) await writeFile(join(evidence, "form-8824-deferred-investment-land.pdf"), bytes, { mode: 0o600 });
});

it("applies the separate 45-day, 180-day and filing-deadline boundaries", async () => {
  const { projectForm88242026DeferredInvestmentLand, FORM_8824_2026_CANDIDATE: { fields } } =
    await import("@/pdf/mappings/2026/form-8824-candidate.js");
  const project = (changes: object) => projectForm88242026DeferredInvestmentLand({ ...deferredLand, ...changes }).text;
  const promptWritten = (date: string) => ({ date, signedDeliveredAndMatchesReplacementConfirmed: true });
  expect(project({ receivedDate: "2026-07-30", writtenIdentification: undefined })[fields.line5IdentifiedDate]).toBe("07/30/2026");
  expect(project({ receivedDate: "2026-12-12" })[fields.line6ReceivedDate]).toBe("12/12/2026");
  const yearEnd = { transferredDate: "2026-12-31", writtenIdentification: promptWritten("2027-02-14") };
  expect(project({ ...yearEnd, receivedDate: "2027-04-15" })[fields.line6ReceivedDate]).toBe("04/15/2027");
  expect(project({ ...yearEnd, receivedDate: "2027-06-29", filingDeadline: "2027-10-15" })[fields.line6ReceivedDate]).toBe("06/29/2027");
  for (const changes of [
    { ...yearEnd, receivedDate: "2027-04-16" },
    { ...yearEnd, receivedDate: "2027-06-30", filingDeadline: "2027-10-15" },
    { filingDeadline: "2027-12-31" }, { filingDeadlineAndExtensionStatusConfirmed: false },
    { qualifiedIntermediaryAgreementAndNoEarlyAccessConfirmed: false },
    { receivedDate: "2026-06-15" }, { receivedDate: "2026-06-14" },
    { receivedDate: "2026-07-31", writtenIdentification: undefined },
    { writtenIdentification: promptWritten("2026-07-31") }, { writtenIdentification: promptWritten("2026-06-14") },
    { writtenIdentification: { ...promptWritten("2026-07-30"), signedDeliveredAndMatchesReplacementConfirmed: false } },
    { nonLikeKindProperty: "100" },
  ]) expect(() => project(changes)).toThrow(/Form 8824/u);
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

const buildingExchange = {
  relinquishedDescription: "100 Fictional Lane, PA - apartment building",
  replacementDescription: "200 Fictional Lane, OH - apartment building",
  acquiredDate: "2024-06-01",
  transferredDate: "2026-06-15",
  receivedDate: "2026-06-15",
  exchangeExpenses: "0",
  closingBasisAndLiabilitiesConfirmed: true,
  singleDomesticBusinessPropertyPerSideAndUnrelatedPartiesConfirmed: true,
  noOtherPropertyOrSpecialTreatmentConfirmed: true,
};
const taylorBuilding = {
  ...buildingExchange,
  relinquishedBasis: "100000",
  replacementFmv: "250000",
  cashReceived: "40000",
  cashPaid: "0",
  liabilitiesRelinquished: "80000",
  liabilitiesAssumed: "150000",
  recapture: { kind: "section1245", saleRecapture: "35000", sourceReference: "Taylor private recapture worksheet", factsConfirmed: true },
  replacementAppraisal: { section1250Fmv: "250000", section1245Fmv: "0", sourceReference: "Taylor private appraisal", factsConfirmed: true },
};
const finleyBuilding = {
  ...buildingExchange,
  relinquishedDescription: buildingExchange.replacementDescription,
  replacementDescription: buildingExchange.relinquishedDescription,
  relinquishedBasis: "175000",
  replacementFmv: "220000",
  cashReceived: "0",
  cashPaid: "40000",
  liabilitiesRelinquished: "150000",
  liabilitiesAssumed: "80000",
  recapture: { kind: "section1250", saleRecapture: "35000", sourceReference: "Finley private recapture worksheet", factsConfirmed: true },
  replacementAppraisal: { section1250Fmv: "165000", section1245Fmv: "55000", sourceReference: "Finley private appraisal", factsConfirmed: true },
};

it("projects both published simultaneous building exchanges on the final candidate", async () => {
  const { projectForm88242026SimultaneousBuilding, FORM_8824_2026_CANDIDATE: { fields } } =
    await import("@/pdf/mappings/2026/form-8824-candidate.js");
  const lines = ["line15", "line16", "line17", "line18", "line19", "line20", "line21", "line22", "line23", "line24", "line25", "line25a", "line25b"] as const;
  for (const [name, input, boot, expected] of [
    ["taylor", taylorBuilding, "Cash", ["40000", "250000", "290000", "170000", "120000", "40000", "35000", "5000", "40000", "80000", "170000", "170000", undefined]],
    ["finley", finleyBuilding, "Liabilities and cash", ["30000", "220000", "250000", "175000", "75000", "30000", "30000", "0", "30000", "45000", "175000", "131250", "43750"]],
  ] as const) {
    const { text, checked } = projectForm88242026SimultaneousBuilding(input);
    expect(lines.map(line => text[fields[line]])).toEqual(expected);
    expect(text[fields.line15aDescriptionFirst]).toBe(boot);
    expect(text[fields.line25c]).toBeUndefined();
    expect(text[fields.line5IdentifiedDate]).toBe("06/15/2026");
    expect(text[fields.line6ReceivedDate]).toBe("06/15/2026");
    expect(Object.values(text).join(" ")).not.toContain("private");
    expect(checked).toEqual([fields.line7No]);

    const { pdf } = await openDiagnosticTemplate();
    const form = pdf.getForm();
    for (const [fieldName, value] of Object.entries(text)) {
      const field = form.getTextField(fieldName);
      if ([fields.line3AcquiredDate, fields.line4TransferredDate, fields.line5IdentifiedDate, fields.line6ReceivedDate].includes(fieldName)) {
        field.acroField.getWidgets()[0].getOrCreateAppearanceCharacteristics().setBackgroundColor([1, 1, 1]);
      }
      field.setText(value);
    }
    for (const fieldName of checked) form.getCheckBox(fieldName).check();
    await markReviewPdf(pdf);
    const bytes = await pdf.save();
    const reopened = (await PDFDocument.load(bytes)).getForm();
    for (const field of reopened.getFields()) {
      if (field instanceof PDFTextField) expect(field.getText()).toBe(text[field.getName()]);
      if (field instanceof PDFCheckBox) expect(field.isChecked()).toBe(checked.includes(field.getName()));
    }
    const evidence = process.env.TAX_ENGINE_FORM8824_CANDIDATE_EVIDENCE_DIR;
    if (evidence) await writeFile(join(evidence, `form-8824-${name}-building.pdf`), bytes, { mode: 0o600 });
  }
  const aboveBoot = projectForm88242026SimultaneousBuilding({ ...taylorBuilding,
    recapture: { ...taylorBuilding.recapture, saleRecapture: "50000" },
  }).text;
  expect([aboveBoot[fields.line21], aboveBoot[fields.line22], aboveBoot[fields.line25a]]).toEqual(["50000", "0", "180000"]);
});

it("rejects incomplete simultaneous building exchange evidence and conflicting printed basis", async () => {
  const { projectForm88242026SimultaneousBuilding } = await import("@/pdf/mappings/2026/form-8824-candidate.js");
  for (const changes of [
    { closingBasisAndLiabilitiesConfirmed: false },
    { singleDomesticBusinessPropertyPerSideAndUnrelatedPartiesConfirmed: undefined },
    { noOtherPropertyOrSpecialTreatmentConfirmed: false },
    { receivedDate: "2026-06-16" }, { acquiredDate: "2025-06-15" },
    { cashReceived: "1" }, { liabilitiesAssumed: "-1" }, { unlikeProperty: "1" },
    { recapture: { ...finleyBuilding.recapture, factsConfirmed: false } },
    { recapture: { ...finleyBuilding.recapture, kind: "section1252" } },
    { replacementAppraisal: { ...finleyBuilding.replacementAppraisal, sourceReference: " " } },
    { replacementAppraisal: { ...finleyBuilding.replacementAppraisal, section1250Fmv: "164999.99" } },
    { liabilitiesRelinquished: "150000.49", replacementFmv: "220000.49",
      replacementAppraisal: { ...finleyBuilding.replacementAppraisal, section1250Fmv: "165000.49" } },
    { recapture: { ...finleyBuilding.recapture, saleRecapture: "75000.01" } },
  ]) expect(() => projectForm88242026SimultaneousBuilding({ ...finleyBuilding, ...changes })).toThrow(/Form 8824/u);
  // 175,002 at 75% and 25% gives two half dollars; both rounded up would overstate line 25.
  expect(() => projectForm88242026SimultaneousBuilding({ ...finleyBuilding, relinquishedBasis: "175002" }))
    .toThrow(/printed replacement basis/u);
});
