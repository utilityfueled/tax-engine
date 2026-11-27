/** Spec: spec/federal/form-8919-2026-template.yaml. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PDFCheckBox, PDFDocument, PDFTextField } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { assertPdfExportAllowed, PDF_MAPPING_PACKS } from "@/pdf/export-policy.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const blank = new URL("../../forms/blank/2026/f8919.pdf", import.meta.url);

async function loadCandidate() {
  const { FORM_8919_2026_CANDIDATE } = await import("@/pdf/mappings/2026/form-8919-candidate.js");
  return FORM_8919_2026_CANDIDATE;
}

function annualCase() {
  const input = TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
    w2s: [{
      ...simpleW2Fixture.w2s[0], taxYear: 2026, accountHolder: "primary",
      employer: { name: "Synthetic Firm D", ein: "12-0000004" },
      wages: "198000", medicareWages: "198000", medicareWithheld: "2871",
      socialSecurityWages: "183000", socialSecurityTips: "500", socialSecurityWithheld: "11377",
    }],
    form8919: { accountHolder: "primary", wagesNotReportedOnW2: "4000" },
  });
  const firmA = {
    name: "Synthetic Firm A", identifier: "12-0000001", identifierType: "ein" as const,
    wages: "1000.25", receivedForm1099: false, reference: "Original A",
    reason: { code: "A" as const, correspondenceDate: "2026-02-28" },
  };
  const original1099 = {
    kind: "1099-nec" as const, taxYear: 2026, accountHolder: "primary" as const,
    firmIdentifier: "120000004", payerName: "Synthetic Firm D", reclassifiedWages: "500", reference: "NEC Original D",
  };
  const sources = {
    taxYear: 2026, accountHolder: "primary" as const, confirmed: true, reviewedOn: "2027-02-15",
    firms: [
      firmA,
      { ...firmA, name: "Synthetic Firm B", identifier: "123-45-6002", identifierType: "ssn" as const, wages: "800.75", receivedForm1099: false, reference: "Original B", reason: { code: "C" as const, correspondenceDate: "2026-06-30" } },
      { ...firmA, name: "Synthetic Firm C", identifier: "12-0000003", wages: "600", reference: "Original C", reason: { code: "G" as const, ss8FiledOn: "2027-01-20", irsReplyReceived: false } },
      { ...firmA, name: "Synthetic Firm D", identifier: "12-0000004", wages: "500", receivedForm1099: true,
        reference: "Original D", originals: [original1099], reason: { code: "H" as const, wagesBelongOnW2Confirmed: true } },
      { ...firmA, name: "Synthetic Firm E", identifier: "12-0000005", wages: "400", reference: "Original E" },
      { ...firmA, name: "Synthetic Firm F", identifier: "12-0000006", wages: "699", reference: "Original F" },
    ],
  };
  return { input, sources };
}

function linkedReasonACase() {
  const { input, sources } = annualCase();
  const original = {
    kind: "1099-nec" as const, taxYear: 2026, accountHolder: "primary" as const,
    firmIdentifier: "12-0000001", payerName: "Synthetic Firm A", reclassifiedWages: "3000.25",
    reference: "Verified NEC original, internal only",
  };
  const proof = {
    necSourceId: "form1099Nec:0", sourceTaxYear: 2026, statementReference: original.reference,
    employerEin: original.firmIdentifier, employerName: original.payerName,
    determinationReference: "Verified IRS letter, internal only",
    determinationDate: "2027-02-08", determinationReceivedDate: "2027-02-12",
    employeeDeterminationConfirmed: true, allCompensationEmployeeWagesConfirmed: true,
    noEmployeeFicaWithheldConfirmed: true, receivedInsteadOfW2Confirmed: true,
  };
  const firm = {
    name: original.payerName, identifier: original.firmIdentifier, identifierType: "ein" as const,
    wages: original.reclassifiedWages, receivedForm1099: true, reference: "Firm file, internal only",
    originals: [original], reason: { code: "A" as "A" | "C", correspondenceDate: proof.determinationDate },
  };
  return {
    input: TaxYearInputSchema.parse({
      ...input,
      form8919: { accountHolder: "primary", wagesNotReportedOnW2: firm.wages, reasonANecSource: proof },
      form1099Nec: [{
        payer: original.payerName, payerTin: original.firmIdentifier, nonemployeeCompensation: firm.wages,
        taxYear: original.taxYear, accountHolder: original.accountHolder, federalWithheld: "31.50",
        originalForForm8919: {
          statementReference: original.reference, recipientTin: input.taxpayer.primary.ssn,
          currentOriginalNoCorrectionsOrVoidsConfirmed: true, noDirectSalesOrParachutePaymentConfirmed: true,
        },
      }],
    }),
    sources: { ...sources, firms: [firm] },
    original,
    proof,
    firm,
  };
}

const field = (name: string) => `topmostSubform[0].Page1[0].${name}`;

describe("Final 2026 Form 8919 physical candidate", () => {
  it("pins the exact final annual source", async () => {
    const [candidate, bytes] = await Promise.all([loadCandidate(), readFile(blank)]);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    expect(sha256).toBe("b7bfa1eb7b4b1893acdcc6399103e8cc0388e4dd64c9522e586adccdba0b42dc");
    expect(bytes.length).toBe(85924);
    expect(candidate).toMatchObject({
      sha256,
      sourceUrl: "https://www.irs.gov/pub/irs-pdf/f8919.pdf",
      annualSourceUrl: "https://www.irs.gov/pub/irs-prior/f8919--2026.pdf",
      sourceRevision: "Created 5/14/26",
      postedDate: "2026-11-20",
      retrievedAt: "2026-11-20T22:45:29Z",
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()?.trim()).toBe("2026 Form 8919");
    expect(pdf.getPages().map(page => page.getSize())).toEqual([
      { width: 612, height: 792 },
      { width: 612, height: 792 },
    ]);
  });

  it("confirms the physical page and widget census", async () => {
    const pdf = await PDFDocument.load(await readFile(blank));
    const fields = pdf.getForm().getFields();
    expect(fields).toHaveLength(40);
    expect(fields.filter(field => field instanceof PDFTextField)).toHaveLength(35);
    expect(fields.filter(field => field instanceof PDFCheckBox)).toHaveLength(5);
    const pages = pdf.getPages();
    const widgets = fields.flatMap(field => field.acroField.getWidgets());
    expect(widgets).toHaveLength(40);
    expect(pages.map(page => page.node.Annots()?.size() ?? 0)).toEqual([40, 0]);
    expect(pages.map(page => widgets.filter(widget => widget.P() === page.ref).length)).toEqual([40, 0]);
  });

  it("keeps the physical candidate outside public exports", async () => {
    const [candidate, bytes] = await Promise.all([loadCandidate(), readFile(blank)]);
    expect(candidate).toMatchObject({
      taxYear: 2026,
      reviewStatus: "independent-review-pending",
      exportsEnabled: false,
      filingQualified: false,
    });
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
    expect(PDF_MAPPING_PACKS[2026]).toMatchObject({ reviewAvailable: false, filingQualified: false });
    expect(() => assertReviewTemplateBytes("f8919.pdf", bytes, 2025)).toThrow(/Unreviewed template revision/);
    expect(() => assertReviewTemplateBytes("f8919.pdf", bytes, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
  });

  it("projects six original firms and puts the summary on the first review form only", async () => {
    const { fillForm8919ReviewCandidate } = await import("@/pdf/mappings/2026/form-8919-candidate.js");
    const { input, sources } = annualCase();
    const docs = await fillForm8919ReviewCandidate(input, sources, await readFile(blank));
    expect(docs).toHaveLength(2);
    const [first, continuation] = await Promise.all(docs.map(async doc => PDFDocument.load(await doc.save())));
    const getText = (pdf: PDFDocument, name: string) => pdf.getForm().getTextField(field(name)).getText() ?? "";
    const detail = (pdf: PDFDocument, row: number) => Array.from({ length: 5 }, (_, cell) =>
      getText(pdf, `Pg1Table[0].Row${row}[0].f1_${3 + (row - 1) * 5 + cell}[0]`));
    expect(detail(first, 1)).toEqual(["Synthetic Firm A", "12-0000001", "A", "02/28/2026", "1000.25"]);
    expect(detail(first, 2)).toEqual(["Synthetic Firm B", "", "C", "06/30/2026", "800.75"]);
    expect(detail(first, 3)).toEqual(["Synthetic Firm C", "12-0000003", "G", "", "600"]);
    expect(detail(first, 4)).toEqual(["Synthetic Firm D", "12-0000004", "H", "", "500"]);
    expect(detail(first, 5)).toEqual(["Synthetic Firm E", "12-0000005", "A", "02/28/2026", "400"]);
    expect(detail(continuation, 1)).toEqual(["Synthetic Firm F", "12-0000006", "A", "02/28/2026", "699"]);
    expect(detail(continuation, 2)).toEqual(["", "", "", "", ""]);
    expect(first.getForm().getCheckBox(field("Pg1Table[0].Row4[0].c1_4[0]")).isChecked()).toBe(true);
    expect(first.getForm().getCheckBox(field("Pg1Table[0].Row2[0].c1_2[0]")).isChecked()).toBe(false);
    const summary = Array.from({ length: 8 }, (_, index) => `f1_${28 + index}[0]`);
    expect(summary.map(name => getText(first, name))).toEqual(["4000", "", "183500", "1000", "1000", "62", "58", "120"]);
    expect(summary.map(name => getText(continuation, name))).toEqual(Array(8).fill(""));
    for (const pdf of [first, continuation]) {
      expect(getText(pdf, "f1_1[0]")).toBe(`${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`);
      expect(getText(pdf, "f1_2[0]")).toBe("");
      expect(pdf.getSubject()).toMatch(/FOR REVIEW ONLY/);
    }
  });

  it("binds the verified Reason A NEC to the physical review row", async () => {
    const { fillForm8919ReviewCandidate } = await import("@/pdf/mappings/2026/form-8919-candidate.js");
    const { input, sources, firm, original, proof } = linkedReasonACase();
    const bytes = await readFile(blank);
    const documents = await fillForm8919ReviewCandidate(input, sources, bytes);
    expect(documents).toHaveLength(1);
    const pdf = (await PDFDocument.load(await documents[0].save())).getForm();
    const row = "Pg1Table[0].Row1[0].";
    expect([3, 4, 5, 6, 7].map(index => pdf.getTextField(field(`${row}f1_${index}[0]`)).getText()))
      .toEqual(["Synthetic Firm A", "12-0000001", "A", "02/08/2027", "3000.25"]);
    expect(pdf.getCheckBox(field(`${row}c1_1[0]`)).isChecked()).toBe(true);
    expect(pdf.getTextField(field("f1_2[0]")).getText()).toBeUndefined();
    expect(pdf.getFields().filter(entry => entry instanceof PDFTextField).map(entry => entry.getText()).join(" "))
      .not.toMatch(/internal only/);

    const matching = /verified Reason A|confirmed 2026 employee wage facts|requires a verified Reason A/i;
    const differentEin = { ...firm, identifier: "12-0000099", originals: [{ ...original, firmIdentifier: "12-0000099" }] };
    const contradictory = [
      { ...firm, reason: { ...firm.reason, code: "C" as const } },
      { ...firm, reason: { ...firm.reason, correspondenceDate: proof.determinationReceivedDate } },
      { ...firm, originals: [{ ...original, reference: "Unrelated current statement" }] },
      { ...firm, originals: [{ ...original, reclassifiedWages: "3000.24" }] },
      { ...firm, originals: [original, { ...original, reference: "Second statement" }] },
      { ...firm, name: "Different firm", originals: [{ ...original, payerName: "Different firm" }] },
      differentEin,
    ];
    for (const conflictingFirm of contradictory) {
      const outcome = fillForm8919ReviewCandidate(input, { ...sources, firms: [conflictingFirm] }, bytes).then(() => undefined);
      await expect(outcome).rejects.toThrow(matching);
    }
    const split = [{ ...firm, wages: "1000.25" }, { ...differentEin, wages: "2000" }];
    await expect(fillForm8919ReviewCandidate(input, { ...sources, firms: split }, bytes).then(() => undefined)).rejects.toThrow(matching);
    await expect(fillForm8919ReviewCandidate(input, { ...sources, reviewedOn: "2027-02-10" }, bytes).then(() => undefined)).rejects.toThrow(matching);
    if (!input.form8919) throw new Error("Expected the linked Form 8919 fixture");
    const orphan = { ...input, form8919: { ...input.form8919, reasonANecSource: undefined } };
    await expect(fillForm8919ReviewCandidate(orphan, sources, bytes).then(() => undefined)).rejects.toThrow(matching);
  });

  it("rejects unbound or conflicting annual originals", async () => {
    const { fillForm8919ReviewCandidate } = await import("@/pdf/mappings/2026/form-8919-candidate.js");
    const { input, sources } = annualCase();
    const bytes = await readFile(blank);
    await expect(fillForm8919ReviewCandidate(input, { ...sources, taxYear: 2025 }, bytes)).rejects.toThrow(/2026/);
    await expect(fillForm8919ReviewCandidate(input, { ...sources, accountHolder: "spouse" }, bytes)).rejects.toThrow(/owner/);
    await expect(fillForm8919ReviewCandidate(input, { ...sources, confirmed: false }, bytes)).rejects.toThrow(/confirmed/);
    await expect(fillForm8919ReviewCandidate(input, { ...sources, firms: sources.firms.slice(0, 5) }, bytes)).rejects.toThrow(/wages/);
    const [first, ...remaining] = sources.firms;
    for (const firm of [
      { ...first, reason: { code: "A" as const, correspondenceDate: "2026-02-30" } },
      { ...first, reason: { code: "G" as const, ss8FiledOn: "2027-02-16", irsReplyReceived: false } },
      { ...first, reason: { code: "H" as const, wagesBelongOnW2Confirmed: true } },
    ]) {
      await expect(fillForm8919ReviewCandidate(input, { ...sources, firms: [firm, ...remaining] }, bytes)).rejects.toThrow(/original/);
    }
    await expect(fillForm8919ReviewCandidate(input, { ...sources, firms: [first, { ...first, wages: "2999.75" }] }, bytes)).rejects.toThrow(/firm/);
    await expect(fillForm8919ReviewCandidate(input, sources, Buffer.from("other PDF"))).rejects.toThrow(/template/);
    const renamed = sources.firms.map(firm => firm.reason.code === "H" ? { ...firm, name: "Unrelated payer" } : firm);
    await expect(fillForm8919ReviewCandidate(input, { ...sources, firms: renamed }, bytes)).rejects.toThrow(/original Form 1099/);
    await expect(fillForm8919ReviewCandidate({ ...input, w2s: [{ ...input.w2s[0], employer: { name: "Unrelated firm", ein: "12-0000007" } }] }, sources, bytes)).rejects.toThrow(/original W-2/);
    await expect(fillForm8919ReviewCandidate({ ...input, w2s: [{ ...input.w2s[0], accountHolder: "spouse" }] }, sources, bytes)).rejects.toThrow(/payroll/);
    if (!input.form8919) throw new Error("Form 8919 fixture requires the wage summary");
    await expect(fillForm8919ReviewCandidate({ ...input, form8919: { ...input.form8919, socialSecurityWagesAndTipsAlreadyReported: "183499" } }, sources, bytes)).rejects.toThrow(/payroll/);
  });

  it("holds Reason H review when active NEC compensation could overlap wages", async () => {
    const { fillForm8919ReviewCandidate } = await import("@/pdf/mappings/2026/form-8919-candidate.js");
    const { input, sources } = annualCase();
    const bytes = await readFile(blank);
    const joint = TaxYearInputSchema.parse({
      ...input,
      taxpayer: {
        ...input.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: { ...input.taxpayer.primary, firstName: "Spouse", ssn: "123-45-6788" },
      },
    });
    const nec = {
      taxYear: 2026, accountHolder: "primary" as const, payer: "Synthetic Firm D",
      payerTin: "12-0000004", nonemployeeCompensation: "500",
    };
    for (const possibleOverlap of [
      nec,
      { ...nec, payer: "Firm D Payroll", payerTin: " 120000004 ", nonemployeeCompensation: "600" },
      { ...nec, taxYear: undefined },
      { ...nec, accountHolder: undefined },
      { ...nec, payerTin: undefined },
      { ...nec, payerTin: "**-***0004" },
      { ...nec, payerTin: "00-0000000" },
    ]) {
      const review = fillForm8919ReviewCandidate({ ...joint, form1099Nec: [possibleOverlap] }, sources, bytes);
      await expect(review.then(docs => docs.length)).rejects.toThrow(/Reason H.*overlap/);
    }
    const distinctNec = [
      { ...nec, payerTin: "12-0000007" },
      { ...nec, accountHolder: "spouse" as const },
      { ...nec, taxYear: 2025 },
      { ...nec, nonemployeeCompensation: "0", federalWithheld: "25" },
    ];
    const distinctInput = { ...joint, form1099Nec: distinctNec };
    const originalNec = structuredClone(distinctNec);
    const reviewed = await fillForm8919ReviewCandidate(distinctInput, sources, bytes);
    expect(reviewed[0].getForm().getTextField(field("f1_28[0]")).getText()).toBe("4000");
    expect(distinctInput.form1099Nec).toEqual(originalNec);
  });

  it("holds Reason H review when active MISC other income could overlap wages", async () => {
    const { fillForm8919ReviewCandidate } = await import("@/pdf/mappings/2026/form-8919-candidate.js");
    const { input, sources } = annualCase();
    const bytes = await readFile(blank);
    const miscSources = {
      ...sources,
      firms: sources.firms.map(firm => ({
        ...firm,
        originals: firm.originals?.map(original => ({ ...original, kind: "1099-misc" as const })),
      })),
    };
    const misc = {
      taxYear: 2026, accountHolder: "primary" as const, payer: "Synthetic Firm D",
      payerTin: "12-0000004", otherIncome: "500",
    };
    const review = fillForm8919ReviewCandidate({ ...input, form1099Misc: [misc] }, miscSources, bytes);
    await expect(review.then(docs => docs.length)).rejects.toThrow(/Reason H.*overlap/);

    const reviewed = await fillForm8919ReviewCandidate({
      ...input,
      form1099Misc: [
        { ...misc, otherIncome: "0", rents: "500", royalties: "500", federalWithheld: "25" },
        { ...misc, payerTin: "12-0000007" },
      ],
      form1099Nec: [{ ...misc, nonemployeeCompensation: "500" }],
    }, miscSources, bytes);
    expect(reviewed[0].getForm().getTextField(field("f1_28[0]")).getText()).toBe("4000");
  });
});
