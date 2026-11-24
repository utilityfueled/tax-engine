/** Spec: spec/federal/form-4137-2026-template.yaml. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PDFName, PDFTextField } from "pdf-lib";
import { expect, it } from "vitest";
import { assertPdfExportAllowed, PDF_MAPPING_PACKS, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { loadPdfDocumentQuietly } from "@/pdf/pdf-utils.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";
import { tipFacts } from "../fixtures/form4137.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const blank = new URL("../../forms/blank/2026/f4137.pdf", import.meta.url);
const mapper = () => import("@/pdf/mappings/2026/form-4137-candidate.js");
const page1 = "topmostSubform[0].Page1[0].";

function payrollCase(received = ["2018", "1200"], firstWage = "183000") {
  const employers = [
    { name: "First Private Restaurant", ein: "12-3456789" },
    { name: "Second Private Restaurant", ein: "98-7654321" },
  ];
  const form4137 = tipFacts("primary", "0");
  return {
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
    w2s: employers.map((employer, index) => ({
      ...simpleW2Fixture.w2s[0], employer, taxYear: 2026, accountHolder: "primary" as const,
      socialSecurityWages: index === 0 ? firstWage : "0", socialSecurityTips: index === 0 ? "1000" : "200", allocatedTips: "0",
    })),
    form4137: {
      ...form4137,
      sourceFacts: {
        ...form4137.sourceFacts, sourceTaxYear: 2026,
        employers: employers.map((employer, index) => ({
          ...form4137.sourceFacts.employers[0], sourceId: `Private diary ${index + 1}`, employerName: employer.name, employerEin: employer.ein,
          w2SourceIds: [`formW2:${index}`], cashAndChargeTipsReceived: received[index], tipsReportedToEmployer: index === 0 ? "1000" : "200",
          smallTipMonths: index === 0 ? [{ month: 6, totalCashAndChargeTips: "18", tipsReportedToEmployer: "0" }] : [],
        })),
      },
    },
  };
}

function readPrintedPages(bytes: Uint8Array): string[] {
  const output = execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-I", "-B", "-c", [
    "from io import BytesIO",
    "from sys import stdin",
    "from json import dumps",
    "from pypdf import PdfReader",
    "print(dumps([p.extract_text() for p in PdfReader(BytesIO(stdin.buffer.read()), strict=True).pages]))",
  ].join("\n")], { input: bytes, encoding: "utf8", timeout: 10000, maxBuffer: 65536 });
  return JSON.parse(output);
}

it("pins the final IRS bytes and printed destinations", async () => {
  const bytes = await readFile(blank);
  const { FORM_4137_2026_CANDIDATE: candidate } = await mapper();
  const sha256 = "9bd93a180bb4e438fc7fa6c0f912f696e14f40d3e8fb62e5749b8c925900980a";
  expect(bytes).toHaveLength(84583);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha256);
  expect(candidate).toMatchObject({ taxYear: 2026, sourceRevision: "Created 4/30/26", postedDate: "2026-11-24", wageBase: "184500", sha256 });
  const [face, instructions] = readPrintedPages(bytes);
  expect(face).toContain("Form 4137 (2026) Created 4/30/26");
  expect(face).toMatch(/Form 1040, 1040-SR, or 1040-NR, line 1c/);
  expect(face).toMatch(/Schedule 2 \(Form 1040\), line 16a/);
  expect(face).toContain("$184,500");
  expect(instructions).toContain("Schedule 2 (Form 1040), line 17c");
  expect(instructions).toContain("January");
  expect([face, instructions].join("\n")).not.toMatch(/DRAFT|DO NOT FILE/iu);
});

it("inventories every blank field on the two-page form", async () => {
  const { FORM_4137_2026_CANDIDATE: candidate } = await mapper();
  const pdf = await loadPdfDocumentQuietly(await readFile(blank));
  const [face, instructions] = pdf.getPages();
  expect([face.getSize(), instructions.getSize()]).toEqual([{ width: 612, height: 792 }, { width: 612, height: 792 }]);
  expect(face.node.Annots()?.size()).toBe(34);
  expect(instructions.node.Annots()?.size() ?? 0).toBe(0);
  const fields = pdf.getForm().getFields().filter(field => field instanceof PDFTextField);
  expect(fields).toHaveLength(34);
  expect(fields.map(field => field.getName())).toEqual(candidate.nativeTextFields);
  expect(new Set(candidate.nativeTextFields).size).toBe(34);
  for (const [index, field] of fields.entries()) {
    expect(field.getText()).toBeUndefined();
    expect(field.acroField.getWidgets().map(widget => widget.P())).toEqual([face.ref]);
    expect(field.isReadOnly()).toBe(index === 27);
  }
  expect(candidate.nativeTextFields[2]).toBe(page1 + "Table_Line1[0].BodyRow1[0].f1_3[0]");
  expect(candidate.nativeTextFields[21]).toBe(page1 + "Table_Line1[0].BodyRow5[0].f1_22[0]");
});

it("renders source amounts and the ordinary wage-cap case without private identifiers", async () => {
  const { fillForm4137_2026OrdinaryCandidate: fill, FORM_4137_2026_CANDIDATE: candidate } = await mapper();
  const pdf = await fill(payrollCase(), true, await readFile(blank));
  const saved = await pdf.save();
  const reopened = await loadPdfDocumentQuietly(saved);
  const form = reopened.getForm();
  const field = (n: number) => form.getTextField(candidate.nativeTextFields[n - 1]).getText();
  expect([3, 4, 5, 6, 7, 8, 9, 10].map(field)).toEqual(["Employer 1", undefined, "2018", "1000", "Employer 2", undefined, "1200", "200"]);
  expect([23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34].map(field))
    .toEqual(["3218", "1200", "2018", "18", "2000", undefined, "184200", "300", "300", "19", "29", "48"]);
  expect([1, 2, 11, 12, 22].map(field)).toEqual(Array(5).fill(undefined));
  expect(reopened.catalog.getAcroForm()?.dict.get(PDFName.of("XFA"))).toBeUndefined();
  expect(reopened.getSubject()).toBe(REVIEW_PDF_NOTICE);
  for (const page of readPrintedPages(saved)) {
    expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
    expect(page).not.toMatch(/Jane Doe|123-45-6789|Private Restaurant|Private diary|12-3456789|98-7654321/);
  }
});

it("holds unknown and incompatible source or payroll facts", async () => {
  const { fillForm4137_2026OrdinaryCandidate: fill } = await mapper();
  const template = await readFile(blank);
  const input = payrollCase();
  const { sourceFacts } = input.form4137;
  const employer = sourceFacts.employers[0];
  await expect(fill(input, false, template)).rejects.toThrow(/inventory/);
  for (const w2Patch of [{ taxYear: 2025 }, { taxYear: undefined }, { accountHolder: undefined }, { allocatedTips: undefined }, { socialSecurityTips: undefined }]) {
    await expect(fill({ ...input, w2s: [{ ...input.w2s[0], ...w2Patch }, input.w2s[1]] }, true, template)).rejects.toThrow(/current.*W-2/);
  }
  const unlinked = { ...input.w2s[0], employer: { name: "Different Private Employer", ein: "22-3456789" }, allocatedTips: "50" };
  await expect(fill({ ...input, w2s: [...input.w2s, unlinked] }, true, template)).rejects.toThrow(/allocated tips/);
  for (const factPatch of [{ sourceTaxYear: 2025 }, { sourceFactsConfirmed: false }, { allEmployersIncluded: false },
    { railroadRetirementCompensation: "1" }, { noncashTipsNotIncludedInWages: "1" }, { employers: Array(6).fill(employer) },
    { employers: [{ ...employer, w2SourceIds: [] }] },
    { employers: [{ ...employer, medicareOnlyGovernmentUnreportedTips: "1" }] },
  ]) {
    await expect(fill({ ...input, form4137: { ...input.form4137, sourceFacts: { ...sourceFacts, ...factPatch } } }, true, template)).rejects.toThrow();
  }
  const badMonth = { month: 6, totalCashAndChargeTips: "20", tipsReportedToEmployer: "0" };
  await expect(fill({ ...input, form4137: { ...input.form4137, sourceFacts: { ...sourceFacts,
    employers: [{ ...employer, smallTipMonths: [badMonth] }, sourceFacts.employers[1]],
  } } }, true, template)).rejects.toThrow(/less than 20/);
  const allSmall = payrollCase(["1018", "200"]);
  await expect(fill(allSmall, true, template)).rejects.toThrow(/positive Medicare-taxable/);
});

it("keeps Medicare tax after the Social Security cap and holds conflicting displayed totals", async () => {
  const { fillForm4137_2026OrdinaryCandidate: fill, FORM_4137_2026_CANDIDATE: candidate } = await mapper();
  const bytes = await readFile(blank);
  const pdf = await fill(payrollCase(undefined, "183300"), true, bytes);
  expect([29, 30, 31, 32, 33, 34].map(index => pdf.getForm().getTextField(candidate.nativeTextFields[index - 1]).getText()))
    .toEqual(["184500", "0", "0", "0", "29", "29"]);
  await expect(fill(payrollCase(["2018.49", "1200.49"]), true, bytes)).rejects.toThrow(/displayed amounts/);
});

it("holds federal payroll copies before they consume the wage base twice", async () => {
  const { fillForm4137_2026OrdinaryCandidate: fill, FORM_4137_2026_CANDIDATE: candidate } = await mapper();
  const bytes = await readFile(blank);
  const input = payrollCase();
  const wageOnly = {
    ...input.w2s[0], employer: { name: "Private Wage Payroll", ein: "33-4567890" },
    socialSecurityWages: "200", socialSecurityTips: "0", allocatedTips: "0",
  };
  const copy = {
    ...wageOnly, employer: { name: "PRIVATE WAGE PAYROLL", ein: "334567890" },
    socialSecurityWages: "200.00", state: "OR",
  };
  const one = await fill({ ...input, w2s: [...input.w2s, wageOnly] }, true, bytes);
  expect(one.getForm().getTextField(candidate.nativeTextFields[33]).getText()).toBe("35");
  await expect(fill({ ...input, w2s: [...input.w2s, wageOnly, copy] }, true, bytes)).rejects.toThrow(/duplicate federal payroll/);
});

it("reconciles code TP and applies the wage base per W-2 rather than to line 8", async () => {
  const { fillForm4137_2026OrdinaryCandidate: fill, FORM_4137_2026_CANDIDATE: candidate } = await mapper();
  const bytes = await readFile(blank);
  const input = payrollCase(undefined, "183500");
  const [first, second] = input.w2s;
  const control = await fill({ ...input, w2s: [{ ...first, box12CodeTP: "1000" }, second] }, true, bytes);
  expect([29, 34].map(n => control.getForm().getTextField(candidate.nativeTextFields[n - 1]).getText())).toEqual(["184700", "29"]);
  await expect(fill({ ...input, w2s: [{ ...first, socialSecurityWages: "183500.01" }, second] }, true, bytes)).rejects.toThrow(/Boxes 3 and 7.*wage base/);
  for (const box12CodeTP of ["0", "999.99", "1000.01"]) {
    await expect(fill({ ...input, w2s: [{ ...first, box12CodeTP }, second] }, true, bytes)).rejects.toThrow(/code TP/);
  }
  const third = { ...first, socialSecurityWages: "0", socialSecurityTips: "0", box12CodeTP: "1001" };
  const [firstDiary, secondDiary] = input.form4137.sourceFacts.employers;
  const tips = { ...input.form4137, sourceFacts: { ...input.form4137.sourceFacts,
    employers: [{ ...firstDiary, w2SourceIds: ["formW2:0", "formW2:2"] }, secondDiary],
  } };
  await expect(fill({ ...input, w2s: [first, second, third], form4137: tips }, true, bytes)).rejects.toThrow(/code TP/);
});

it("keeps the worksheet outside public review and filing", async () => {
  const { fillForm4137_2026OrdinaryCandidate: fill, FORM_4137_2026_CANDIDATE: candidate } = await mapper();
  const bytes = await readFile(blank);
  expect(candidate).toMatchObject({ reviewStatus: "independent-review-pending", exportsEnabled: false, filingQualified: false });
  expect(Object.isFrozen(candidate.nativeTextFields)).toBe(true);
  expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
  expect(PDF_MAPPING_PACKS[2026]).toMatchObject({ reviewAvailable: false, filingQualified: false });
  expect(() => assertReviewTemplateBytes("f4137.pdf", bytes, 2025)).toThrow(/Unreviewed template revision/);
  expect(() => assertReviewTemplateBytes("f4137.pdf", bytes, 2026)).toThrow(/No qualified review/);
  expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
  await expect(fill(payrollCase(), true, await readFile(new URL("../../forms/blank/2025/f4137.pdf", import.meta.url)))).rejects.toThrow(/template revision/);
});
