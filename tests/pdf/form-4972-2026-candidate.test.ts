/** Spec: spec/federal/form-4972-2026-template.yaml. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFArray, PDFBool, PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream, PDFTextField, decodePDFRawStream } from "pdf-lib";
import { expect, it } from "vitest";
import type { Form4972Input } from "@/engine/forms/form-4972.js";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS } from "@/pdf/export-policy.js";
import * as form4972Candidate from "@/pdf/mappings/2026/form-4972-candidate.js";
import { REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";

const blank = new URL("../../forms/blank/2026/f4972.pdf", import.meta.url);
const digest = "2968f25a528882666de3dab99ed9cf48ea8841e0fdbf6f409a71a4b419d4aa99";
const { FORM_4972_2026_CANDIDATE, projectForm49722026OwnPlan } = form4972Candidate;
const { fields, instructionFields } = FORM_4972_2026_CANDIDATE;

type Location = [page: number, name: string, kind: "/Tx" | "/Btn", rect: number[], states: string[]];

const election: Form4972Input = {
  taxYear: 2026, distributionCode: "7A", participantBirthDate: "1936-01-01", election: "both",
  ownQualifiedPlan: true, fiveParticipationYearsConfirmed: true, entireBalanceConfirmed: true,
  rolloverOccurred: false, priorDisqualifyingElection: false, otherDisqualifications: false,
  onlyDistributionAndRecipientConfirmed: true, taxableAmountNotDetermined: false,
  grossDistribution: "30000", taxableAmount: "25000", capitalGain: "5000",
  netUnrealizedAppreciation: "0", actuarialValue: "0",
};

const beneficiaryElection = {
  ...election, distributionCode: "4A", sourceKind: "death_beneficiary",
  participantDeathDate: "1996-08-21", distributionDate: "2026-12-31", qualifiedPlanConfirmed: true,
  receivedBecauseOfDeath: true, priorBeneficiaryElectionForParticipant: false, federalEstateTax: "0",
} satisfies Form4972Input;
const beneficiaryAnswers = { recipientIsParticipantForThisDistribution: false, recipientUsedForm4972ForOwnPlanAfter1986: false };
const annuityElection = {
  ...election, sourceKind: "own_plan", taxableAmount: "11000", actuarialValue: "2000", lumpSumAnnuityValueConfirmed: true,
} satisfies Form4972Input;
const appreciationElection = {
  ...annuityElection, taxableAmount: "8000", capitalGain: "2000", actuarialValue: "0",
  netUnrealizedAppreciation: "8000", nuaTreatment: "include",
} satisfies Form4972Input;

it("holds the beneficiary method outside the own-plan physical map", () => {
  expect(() => projectForm49722026OwnPlan(beneficiaryElection)).toThrow(/physical.*participant's own plan/u);
});

it("projects the confirmed own-plan actuarial adjustment", () => {
  const { text } = projectForm49722026OwnPlan(annuityElection);
  expect(text).toMatchObject({
    [fields.line11]: "2000", [fields.line12]: "8000", [fields.line16]: "4000",
    [fields.line20Whole]: "0", [fields.line20Fraction]: "250", [fields.line21]: "1000", [fields.line22]: "1000",
    [fields.line25]: "440", [fields.line26]: "100", [fields.line27]: "11", [fields.line28]: "110",
    [fields.line29]: "330", [fields.line30]: "1330",
  });
  const capitalOnly = projectForm49722026OwnPlan({ ...annuityElection, election: "capital_gain" });
  expect(capitalOnly.text).toEqual({ [fields.line6]: "5000", [fields.line7]: "1000" });
  expect(() => projectForm49722026OwnPlan({ ...annuityElection, lumpSumAnnuityValueConfirmed: false })).toThrow(/Box 8a/u);
});

it("uses additional decimal places when the printed ratio would change the allowance", () => {
  const { text } = projectForm49722026OwnPlan({ ...annuityElection, taxableAmount: "15000", actuarialValue: "2000" });
  expect(text).toMatchObject({
    [fields.line20Whole]: "0", [fields.line20Fraction]: "1667", [fields.line21]: "1000", [fields.line22]: "1000",
    [fields.line25]: "660", [fields.line26]: "100", [fields.line27]: "11", [fields.line28]: "110",
    [fields.line29]: "550", [fields.line30]: "1550",
  });
  const aboveThreshold = projectForm49722026OwnPlan({ ...annuityElection, grossDistribution: "100000", taxableAmount: "92050", actuarialValue: "5000" });
  expect(aboveThreshold.text).toMatchObject({
    [fields.line12]: "92050", [fields.line20Whole]: "0", [fields.line20Fraction]: "054", [fields.line21]: "0",
    [fields.line22]: "5000", [fields.line25]: "13040", [fields.line28]: "550", [fields.line30]: "13490",
  });
  expect(aboveThreshold.text[fields.line16]).toBeUndefined();
  expect(() => projectForm49722026OwnPlan({ ...annuityElection, taxableAmount: "20000", actuarialValue: "3000" })).toThrow(/reconcile/u);
  expect(() => projectForm49722026OwnPlan({ ...annuityElection, actuarialValue: "0.49" })).toThrow(/reconcile/u);
});

it("pins the final form and every original widget", async () => {
  const [bytes, fixture] = await Promise.all([
    readFile(blank), readFile(new URL("../fixtures/pdf-2026/form-4972-source.json", import.meta.url), "utf8"),
  ]);
  expect(bytes).toHaveLength(130957);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(digest);
  expect(FORM_4972_2026_CANDIDATE).toMatchObject({ sha256: digest, taxYear: 2026, sourceRevision: "Created 11/6/26" });
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getTitle()).toBe("2026 Form 4972");
  expect(pdf.getPageCount()).toBe(4);
  const form = pdf.getForm();
  const census = JSON.parse(fixture) as Location[];
  expect(pdf.getPages().map(page => page.node.Annots()?.size() ?? 0)).toEqual([40, 0, 18, 0]);
  const names = census.map(([, name]) => name).sort();
  expect([...Object.values(fields), ...instructionFields].sort()).toEqual(names);
  expect(form.getFields().map(field => field.getName()).sort()).toEqual(names);
  for (const [page, name, kind, [left, bottom, right, top], states] of census) {
    const field = form.getField(name);
    expect(field).toBeInstanceOf(kind === "/Tx" ? PDFTextField : PDFCheckBox);
    const widgets = field.acroField.getWidgets();
    expect(widgets).toHaveLength(1);
    const { x, y, width, height } = widgets[0].getRectangle();
    expect([x, y, x + width, y + height].map(value => Number(value.toFixed(4)))).toEqual([left, bottom, right, top]);
    expect(widgets[0].P()).toEqual(pdf.getPage(page - 1).ref);
    if (field instanceof PDFCheckBox) expect(field.acroField.getOnValue()?.toString()).toBe(states[0]);
  }
});

it("projects only the applicable cells of each election", () => {
  const combined = projectForm49722026OwnPlan(election);
  expect(combined.checked).toEqual([fields.line1Yes, fields.line2No, fields.line3No, fields.line4Yes, fields.line5aNo]);
  expect(combined.text).toEqual({
    [fields.line6]: "5000", [fields.line7]: "1000", [fields.line8]: "20000", [fields.line10]: "20000",
    [fields.line11]: "0", [fields.line12]: "20000", [fields.line13]: "10000", [fields.line14]: "0",
    [fields.line15]: "0", [fields.line16]: "10000", [fields.line17]: "10000", [fields.line19]: "10000",
    [fields.line23]: "1000", [fields.line24]: "110", [fields.line25]: "1100", [fields.line29]: "1100",
    [fields.line30]: "2100",
  });
  const gain = projectForm49722026OwnPlan({ ...election, election: "capital_gain" });
  expect(gain.text).toEqual({ [fields.line6]: "5000", [fields.line7]: "1000" });
  const tenYear = projectForm49722026OwnPlan({ ...election, election: "ten_year", taxableAmount: "20000" });
  expect(tenYear.text).toEqual(Object.fromEntries(Object.entries(combined.text)
    .filter(([field]) => field !== fields.line6 && field !== fields.line7)
    .map(([field, amount]) => [field, field === fields.line30 ? "1100" : amount])));
  const highAmount = projectForm49722026OwnPlan({ ...election, grossDistribution: "100000", taxableAmount: "80030" });
  expect(highAmount.text[fields.line12]).toBe("75030");
  for (const field of [fields.line13, fields.line14, fields.line15, fields.line16]) expect(highAmount.text[field]).toBeUndefined();
});

it("holds amounts that cannot reconcile in whole dollars", () => {
  expect(() => projectForm49722026OwnPlan({ ...election, taxableAmount: "25010" })).toThrow(/reconcile/u);
  expect(() => projectForm49722026OwnPlan({ ...election, grossDistribution: "80000", taxableAmount: "74999.99" })).toThrow(/reconcile/u);
  expect(() => projectForm49722026OwnPlan({ ...election, election: "capital_gain", capitalGain: "0.49" })).toThrow(/reconcile/u);
  expect(() => projectForm49722026OwnPlan({ ...election, entireBalanceConfirmed: false })).toThrow(/confirmed eligibility/u);
});

it("projects the elected own-plan appreciation and printed annotations", () => {
  const combined = projectForm49722026OwnPlan(appreciationElection);
  expect(combined.annotations).toEqual([{ line: "6", text: "NUA 2000" }, { line: "8", text: "NUA 6000" }]);
  expect(combined.text).toMatchObject({ [fields.line6]: "4000", [fields.line8]: "12000", [fields.line30]: "1460" });
  expect(instructionFields.slice(3, 11).map(name => combined.text[name])).toEqual([
    "2000", "8000", "0", "250", "8000", "2000", "6000", "4000",
  ]);
  const partII = projectForm49722026OwnPlan({ ...appreciationElection, election: "capital_gain" });
  expect(partII.annotations).toEqual([{ line: "6", text: "NUA 2000" }]);
  expect(partII.text[fields.line8]).toBeUndefined();
  const partIII = projectForm49722026OwnPlan({ ...appreciationElection, election: "ten_year" });
  expect(partIII.annotations).toEqual([{ line: "8", text: "NUA 8000" }]);
  expect(partIII.text[fields.line8]).toBe("16000");
  expect(instructionFields.every(name => !Object.hasOwn(partIII.text, name))).toBe(true);
  const deferred = projectForm49722026OwnPlan({ ...appreciationElection, nuaTreatment: "defer" });
  expect(deferred.annotations).toEqual([]);
  expect(deferred.text).toMatchObject({ [fields.line6]: "2000", [fields.line8]: "6000", [fields.line30]: "730" });
  expect(instructionFields.every(name => !Object.hasOwn(deferred.text, name))).toBe(true);
});

it("holds a rounded appreciation election that changes the shown amounts", () => {
  expect(() => projectForm49722026OwnPlan({ ...appreciationElection, netUnrealizedAppreciation: "7999.49" }))
    .toThrow(/reconcile/u);
});

it("projects the confirmed beneficiary and separate own-plan answers", () => {
  const project = form4972Candidate.projectForm49722026DeathBeneficiary;
  expect(project).toBeTypeOf("function");
  const combined = project(beneficiaryElection, { ...beneficiaryAnswers, recipientUsedForm4972ForOwnPlanAfter1986: true });
  expect(combined.checked).toEqual([fields.line1Yes, fields.line2No, fields.line3Yes, fields.line4No, fields.line5aYes, fields.line5bNo]);
  expect(combined.text).toEqual({ ...projectForm49722026OwnPlan(election).text, [fields.line18]: "0" });
  const gain = project({ ...beneficiaryElection, election: "capital_gain" }, beneficiaryAnswers);
  expect(gain.checked).toEqual([fields.line1Yes, fields.line2No, fields.line3Yes, fields.line4No, fields.line5aNo, fields.line5bNo]);
  expect(gain.text).toEqual({ [fields.line6]: "5000", [fields.line7]: "1000" });
});

it("holds beneficiary projection with incomplete physical answers", () => {
  const project = form4972Candidate.projectForm49722026DeathBeneficiary;
  expect(project).toBeTypeOf("function");
  expect(() => project(election, beneficiaryAnswers)).toThrow(/death-beneficiary/u);
  expect(() => project(beneficiaryElection, { ...beneficiaryAnswers, recipientIsParticipantForThisDistribution: true }))
    .toThrow(/recipient/u);
  expect(() => project(beneficiaryElection, { ...beneficiaryAnswers, recipientUsedForm4972ForOwnPlanAfter1986: undefined }))
    .toThrow(/own-plan history/u);
  expect(() => project({ ...beneficiaryElection, priorBeneficiaryElectionForParticipant: true }, beneficiaryAnswers))
    .toThrow(/eligibility/u);
  expect(() => project({ ...beneficiaryElection, federalEstateTax: "0.01" }, beneficiaryAnswers)).toThrow(/estate tax/u);
  expect(() => project({ ...beneficiaryElection, taxableAmount: "25010" }, beneficiaryAnswers)).toThrow(/reconcile/u);
});

it("projects the confirmed beneficiary estate tax on a Part III only election", () => {
  const project = form4972Candidate.projectForm49722026DeathBeneficiary;
  const input = { ...beneficiaryElection, election: "ten_year" as const, taxableAmount: "20000", federalEstateTax: "2000" };
  const { text, annotations } = project(input, beneficiaryAnswers);
  expect(text).toMatchObject({
    [fields.line8]: "20000", [fields.line17]: "10000", [fields.line18]: "2000", [fields.line19]: "8000",
    [fields.line23]: "800", [fields.line24]: "88", [fields.line30]: "880",
  });
  expect(text[fields.line6]).toBeUndefined();
  expect(text[fields.line9]).toBeUndefined();
  expect(annotations).toEqual([]);
  expect(project({ ...input, federalEstateTax: "2000.49" }, beneficiaryAnswers).text).toEqual(text);
  expect(() => project({ ...input, federalEstateTax: "2000.50" }, beneficiaryAnswers)).toThrow(/reconcile/u);
});

async function verifySavedSpecimen(projection: ReturnType<typeof projectForm49722026OwnPlan>, filename: string) {
  const pdf = await PDFDocument.load(await readFile(blank));
  const acro = pdf.catalog.getAcroForm()?.dict;
  const packets = acro?.lookupMaybe(PDFName.of("XFA"), PDFArray)?.asArray()
    .filter((packet): packet is PDFRef => packet instanceof PDFRef) ?? [];
  expect(packets.length).toBeGreaterThan(0);
  acro?.delete(PDFName.of("XFA"));
  acro?.delete(PDFName.of("SigFlags"));
  for (const packet of packets) pdf.context.delete(packet);
  const permissions = pdf.catalog.get(PDFName.of("Perms"));
  const readerRights = pdf.context.lookupMaybe(permissions, PDFDict)?.get(PDFName.of("UR3"));
  pdf.catalog.delete(PDFName.of("Perms"));
  if (permissions instanceof PDFRef) pdf.context.delete(permissions);
  if (readerRights instanceof PDFRef) pdf.context.delete(readerRights);

  const form = pdf.getForm();
  for (const [name, value] of Object.entries(projection.text)) form.getTextField(name).setText(value);
  for (const name of projection.checked) form.getCheckBox(name).check();
  if (projection.annotations?.length) await form4972Candidate.drawForm49722026Annotations(pdf, projection.annotations);
  await markReviewPdf(pdf);
  const bytes = await pdf.save();
  const reopened = await PDFDocument.load(bytes);
  const result = reopened.getForm();
  expect(reopened.catalog.getAcroForm()?.dict.get(PDFName.of("XFA"))).toBeUndefined();
  expect(reopened.catalog.get(PDFName.of("Perms"))).toBeUndefined();
  const names = reopened.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  expect(names?.get(PDFName.of("JavaScript"))).toBeUndefined();
  for (const page of reopened.getPages()) {
    const streams = page.node.normalizedEntries().Contents?.asArray() ?? [];
    expect(streams.some(ref => {
      const stream = reopened.context.lookup(ref);
      return stream instanceof PDFStream && stream.dict.get(PDFName.of("TaxEngineReviewNotice")) === PDFBool.True;
    })).toBe(true);
  }
  const firstPageContents = reopened.getPage(0).node.normalizedEntries().Contents?.asArray() ?? [];
  const pageTextOperators = firstPageContents.map(ref => reopened.context.lookup(ref))
    .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
    .map(stream => Buffer.from(decodePDFRawStream(stream).decode()).toString("ascii")).join("\n");
  for (const { text } of projection.annotations ?? []) {
    const hex = Buffer.from(text, "ascii").toString("hex").toUpperCase();
    expect(pageTextOperators).toContain(`<${hex}> Tj`);
  }
  for (const field of result.getFields()) {
    const name = field.getName();
    const widget = field.acroField.getWidgets()[0];
    if (field instanceof PDFCheckBox) {
      const checked = projection.checked.includes(name);
      expect(field.isChecked()).toBe(checked);
      expect(widget.getAppearanceState()?.toString()).toBe(checked ? field.acroField.getOnValue()?.toString() : "/Off");
    } else if (field instanceof PDFTextField) {
      expect(field.getText() ?? "").toBe(projection.text[name] ?? "");
      if (name in projection.text) expect(widget.getAppearances()?.normal).toBeInstanceOf(PDFStream);
    }
  }
  const diagnostics = process.env.TAX_ENGINE_FORM4972_DIAGNOSTIC_DIR;
  if (diagnostics) await writeFile(join(diagnostics, filename), bytes);
}

it("reopens a marked specimen with blank identity and instruction fields", async () => {
  await verifySavedSpecimen(projectForm49722026OwnPlan(election), "form-4972-review-diagnostic.pdf");
});

it("reopens the marked beneficiary specimen", async () => {
  const project = form4972Candidate.projectForm49722026DeathBeneficiary;
  expect(project).toBeTypeOf("function");
  await verifySavedSpecimen(project(beneficiaryElection, beneficiaryAnswers), "form-4972-beneficiary-review.pdf");
  await verifySavedSpecimen(project({ ...beneficiaryElection, election: "ten_year", taxableAmount: "20000", federalEstateTax: "2000" },
    beneficiaryAnswers), "form-4972-beneficiary-estate-tax-review.pdf");
});

it("reopens the marked own-plan annuity specimen", async () => {
  await verifySavedSpecimen(projectForm49722026OwnPlan({ ...annuityElection, taxableAmount: "15000", actuarialValue: "2000" }),
    "form-4972-own-plan-annuity-review.pdf");
});

it("reopens the marked own-plan appreciation specimen", async () => {
  await verifySavedSpecimen(projectForm49722026OwnPlan(appreciationElection), "form-4972-own-plan-appreciation-review.pdf");
});

it("keeps annual review and filing exports unavailable", () => {
  expect(FORM_4972_2026_CANDIDATE).toMatchObject({
    filingQualified: false, exportsEnabled: false, reviewStatus: "independent-review-pending",
  });
  expect(PDF_MAPPING_PACKS[2026].reviewAvailable).toBe(false);
  expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
  expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified/u);
  expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/Filing exports are unavailable/u);
});
