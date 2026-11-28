/** Spec: spec/federal/form-8863-2026-template.yaml. */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFTextField, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyCreditsData, updateSectionData } from "@/lib/guided-interview-flow";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
import { assertPdfExportAllowed, markReviewPdf, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import { completeAocEligibility, completeEducationClaimant, completeW2Entry, startCompleteInterview } from "../guided-interview/complete-facts.js";
import { useTemporaryPdfOutput } from "./temporary-output.js";

const blank = new URL("../../forms/blank/2026/f8863.pdf", import.meta.url);
const sourceContract = new URL("./sources/form-8863-2026.json", import.meta.url);
const privatePdfOutput = useTemporaryPdfOutput();

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

function actualJointSpouseReturn(studentHasEligibleSsn = false) {
  const start = startCompleteInterview({ filingStatus: "mfj", incomeTypes: ["w2"], lifeEvents: [], stateCode: null });
  const personal = start.sectionData["personal-info"];
  if (!personal?.spouse) throw new Error("Missing synthetic joint household");
  const spouse = { ...personal.spouse, employmentValidSsnIssuedByDueDate: studentHasEligibleSsn, tinIssuedByDueDate: true };
  const withPersonal = updateSectionData({ ...start, taxYear: 2026 }, "personal-info", {
    ...personal, spouse, dateOfBirth: "2005-12-15", employmentValidSsnIssuedByDueDate: !studentHasEligibleSsn,
  });
  const withWages = updateSectionData(withPersonal, "income-w2", { entries: [{ ...completeW2Entry, sourceTaxYear: "2026",
    wages: "168000", socialSecurityWages: "168000", socialSecurityWithheld: "10416", medicareWages: "168000", medicareWithheld: "2436",
  }] });
  const withEducation = updateSectionData(withWages, "credits", {
    ...emptyCreditsData,
    education: { ...emptyCreditsData.education, ...completeEducationClaimant, aotcClaimantFactsTaxYear: 2026,
      primarySsnEligible: !studentHasEligibleSsn, spouseSsnEligible: studentHasEligibleSsn,
      aocStudents: [{ ...completeAocEligibility, name: "  TAYLOR   Example  ", studentTaxId: spouse.ssn.replaceAll("-", ""), studentRole: "spouse",
        studentSsnEligible: studentHasEligibleSsn, studentTinEligible: true, qualifiedExpenses: "4000", priorYearsClaimed: "3" }],
    },
  });
  return TaxYearInputSchema.parse(buildTaxInputFromGuidedData(withEducation));
}

function jointSpouseTransferWorkpapers(input: TaxYearInput) {
  return { ...actualTransferWorkpapers(input), form1040Line11a: "168000", creditLimitWorksheetRemainingTax: "700",
    form8863Line6: "0.600", form8863Line8: "600", form8863Line19: "700" };
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

  it("verifies the return name and leaves the line 20 identity blank in the review", async () => {
    const { renderPrivateForm88632026TransferReview } = await import("@/pdf/mappings/2026/form-8863-transfer-review.js");
    const [candidate, template] = await Promise.all([mapping(), readFile(blank)]);
    const source = actualAotcReturn();
    const education = source.educationExpenses;
    if (!education) throw new Error("Expected the synthetic AOTC return");
    const render = (studentName: string, firstName = "Jane") => {
      const input = { ...source,
        taxpayer: { ...source.taxpayer, primary: { ...source.taxpayer.primary, firstName } },
        educationExpenses: { ...education, aocStudents: [{ ...education.aocStudents[0], name: studentName }] },
      };
      return renderPrivateForm88632026TransferReview(input, actualTransferWorkpapers(input), template);
    };
    const reopened = (await PDFDocument.load(await render("  jane  DOE  "))).getForm();
    expect(reopened.getTextField(candidate.fields.line8).getText()).toBe("500");
    expect(reopened.getTextField(candidate.fields.line20StudentName).getText()).toBeUndefined();
    expect(reopened.getTextField(candidate.fields.line21StudentSsnFirst).getText()).toBeUndefined();
    await expect.soft(render("Unrelated Person")).rejects.toThrow(/student name.*on the return/i);
    await expect.soft(render("")).rejects.toThrow(/student name.*on the return/i);
    await expect.soft(render("Doe", "")).rejects.toThrow(/student name.*on the return/i);
  });

  it("reopens verified joint student-spouse AOTC transfers without identity fields", async () => {
    const { renderPrivateForm88632026TransferReview } = await import("@/pdf/mappings/2026/form-8863-transfer-review.js");
    const [candidate, template] = await Promise.all([mapping(), readFile(blank)]);
    for (const studentHasEligibleSsn of [false, true]) {
      const input = actualJointSpouseReturn(studentHasEligibleSsn);
      const workpapers = jointSpouseTransferWorkpapers(input);
      const reopened = await PDFDocument.load(await renderPrivateForm88632026TransferReview(input, workpapers, template));
      const values = reopened.getForm().getFields().flatMap(field => field instanceof PDFTextField && field.getText()
        ? [[field.getName(), field.getText()]] : []);
      expect(values).toEqual([[candidate.fields.line8, "600"], [candidate.fields.line19, "700"]]);
      expect(reopened.getForm().getCheckBox(candidate.fields.line7RefundableRestriction).isChecked()).toBe(false);
    }
  });

  it("holds contradictory or unverified joint student-spouse evidence", async () => {
    const { projectForm88632026Transfers } = await import("@/pdf/mappings/2026/form-8863-candidate.js");
    const input = actualJointSpouseReturn();
    const workpapers = jointSpouseTransferWorkpapers(input);
    const education = input.educationExpenses;
    const spouse = input.taxpayer.spouse;
    if (!education || !spouse) throw new Error("Missing synthetic joint student facts");
    const [student] = education.aocStudents;
    const withStudent = (patch: Partial<typeof student>) => ({ ...input,
      educationExpenses: { ...education, aocStudents: [{ ...student, ...patch }] },
    });
    const withSpouse = (patch: Partial<typeof spouse>) => ({ ...input, taxpayer: { ...input.taxpayer, spouse: { ...spouse, ...patch } } });
    for (const [changed, expected] of [
      [withStudent({ studentTaxId: input.taxpayer.primary.ssn }), /student.*identity/i],
      [withStudent({ studentRole: "primary" }), /student.*identity/i],
      [withStudent({ name: `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}` }), /student name.*on the return/i],
      [withStudent({ studentTinEligible: undefined }), /student.*timely TIN/i],
      [withStudent({ studentSsnEligible: true }), /student.*SSN.*conflict/i],
      [withSpouse({ tinIssuedByDueDate: false }), /student.*timely TIN/i],
      [withSpouse({ employmentValidSsnIssuedByDueDate: true }), /spouse.*SSN.*conflict/i],
      [{ ...input, educationExpenses: { ...education, primaryTinEligible: false } }, /primary.*timely TIN.*conflict/i],
      [{ ...input, taxpayer: { ...input.taxpayer, primary: { ...input.taxpayer.primary, employmentValidSsnIssuedByDueDate: false } },
        educationExpenses: { ...education, primarySsnEligible: false } }, /at least one.*employment-valid SSN/i],
    ] as const) {
      expect(() => projectForm88632026Transfers(changed, jointSpouseTransferWorkpapers(changed))).toThrow(expected);
    }
    expect(() => projectForm88632026Transfers(withSpouse({ lastName: "Changed" }), workpapers)).toThrow(/current canonical return/);
    expect(() => projectForm88632026Transfers(input, { ...workpapers, form8863Line6: "0.400" })).toThrow(/exact.*line 6/i);
    expect(() => projectForm88632026Transfers(input, { ...workpapers, form8863Line19: "701" })).toThrow(/line 8 or line 19/);
  });

  it("reopens only the verified private lines 8 and 19 on the pinned final PDF", async () => {
    const { renderPrivateForm88632026TransferReview } = await import("@/pdf/mappings/2026/form-8863-transfer-review.js");
    const [candidate, template] = await Promise.all([mapping(), readFile(blank)]);
    const input = actualAotcReturn();
    const workpapers = {
      ...actualTransferWorkpapers(input), creditLimitWorksheetRemainingTax: "3000", form8863Line19: "750",
    };
    const bytes = await renderPrivateForm88632026TransferReview(input, workpapers, template);
    const outputPath = join(privatePdfOutput, "form-8863-transfer.pdf");
    await writeFile(outputPath, bytes, { flag: "wx", mode: 0o600 });
    const { stdout: output } = await promisify(execFile)(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-I", "-B", "-c", [
      "from sys import argv", "from json import dumps", "from pypdf import PdfReader",
      "reader = PdfReader(argv[1], strict=True)",
      "fields = {name: str(field.get('/V', '')) for name, field in reader.get_fields().items()}",
      "print(dumps({'filled': {name: value for name, value in fields.items() if value not in ('', '/Off')},",
      "             'pages': [page.extract_text() for page in reader.pages]}))",
    ].join("\n"), outputPath], { timeout: 4_000, encoding: "utf8" });
    const reopened = JSON.parse(output) as { filled: Record<string, string>; pages: string[] };
    expect(reopened.filled).toEqual({ [candidate.fields.line8]: "500", [candidate.fields.line19]: "750" });
    expect(reopened.pages).toHaveLength(2);
    expect(reopened.pages.every(page => page.includes(REVIEW_PDF_NOTICE))).toBe(true);
    for (const privateValue of ["Jane Doe", "123-45-6789", "98-7654321", "Synthetic College", "1 College Street",
      workpapers.canonicalInputSha256]) {
      expect(output).not.toContain(privateValue);
    }
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/Filing exports are unavailable/);
  });

  it("preserves a confirmed zero and holds Form 8863 PDF template or source drift", async () => {
    const { renderPrivateForm88632026TransferReview } = await import("@/pdf/mappings/2026/form-8863-transfer-review.js");
    const [candidate, template] = await Promise.all([mapping(), readFile(blank)]);
    const input = actualAotcReturn();
    const workpapers = {
      ...actualTransferWorkpapers(input), creditLimitWorksheetRemainingTax: "0", form8863Line19: "0",
    };
    const reopened = (await PDFDocument.load(await renderPrivateForm88632026TransferReview(input, workpapers, template))).getForm();
    expect(reopened.getTextField(candidate.fields.line8).getText()).toBe("500");
    expect(reopened.getTextField(candidate.fields.line19).getText()).toBe("0");
    expectNonemptyStream(reopened.getTextField(candidate.fields.line19).acroField.getWidgets()[0].getAppearances()?.normal);
    await expect(renderPrivateForm88632026TransferReview(input, workpapers, template.subarray(0, -1)).then(() => "unexpected PDF"))
      .rejects.toThrow(/template revision/);
    await expect(renderPrivateForm88632026TransferReview(input, {
      ...workpapers, canonicalInputSha256: "0".repeat(64),
    }, template).then(() => "unexpected PDF")).rejects.toThrow(/canonical|stale|changed/i);
    await expect(renderPrivateForm88632026TransferReview(input, {
      ...workpapers, form8863Line8: "501",
    }, template).then(() => "unexpected PDF")).rejects.toThrow(/line 8/);
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
