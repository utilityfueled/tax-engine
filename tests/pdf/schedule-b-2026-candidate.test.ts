/** Spec: spec/federal/schedule-b-2026-template.yaml. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { decodePDFRawStream, PDFBool, PDFCheckBox, PDFName, PDFRawStream, PDFStream, PDFTextField } from "pdf-lib";
import { expect, it } from "vitest";
import { calculateScheduleB } from "@/engine/schedules/schedule-b.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { assertPdfExportAllowed, PDF_MAPPING_PACKS, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { SCHEDULE_B_2026_CANDIDATE as candidate } from "@/pdf/mappings/2026/schedule-b-candidate.js";
import { loadPdfDocumentQuietly } from "@/pdf/pdf-utils.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const blank = new URL("../../forms/blank/2026/f1040sb.pdf", import.meta.url);
const page1 = "topmostSubform[0].Page1[0].";
const mapper = () => import("@/pdf/mappings/2026/schedule-b-candidate.js");

function ordinaryOriginals(interest = ["1125.25", "475.24"], dividends = ["820.80", "780.80"]) {
  const { firstName, lastName } = simpleW2Fixture.taxpayer.primary;
  const identity = (kind: string, index: number) => ({
    taxYear: 2026, accountHolder: "primary" as const, payer: `Fictional Private Payer ${index + 1}`,
    payerTin: `12${3456789 + index}`, accountReference: `Private Account ${index + 1}`, sourceReference: `Private Original ${kind} ${index + 1}`,
    actualOriginalConfirmed: true, corrected: false, completeAccountReferenceConfirmed: true, ordinaryOnlyConfirmed: true,
    recipient: { firstName, lastName, ssnLast4: "6789" },
  });
  const form1099Int = interest.map((interestIncome, index) => ({ ...identity("INT", index), interestIncome }));
  const form1099Div = dividends.map((ordinaryDividends, index) => ({ ...identity("DIV", index), ordinaryDividends }));
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 }, form1099Int, form1099Div,
    scheduleBPartThree: { hasForeignAccounts: false, hasForeignTrust: false },
  });
  const originals = [
    ...form1099Int.map(({ interestIncome, ...common }) => ({ form: "1099-int", ...common, box1: interestIncome })),
    ...form1099Div.map(({ ordinaryDividends, ...common }) => ({ form: "1099-div", ...common, box1a: ordinaryDividends })),
  ];
  const sources = { taxYear: 2026, calendarYearReturnConfirmed: true, completeIncomeInventoryConfirmed: true,
    ordinaryDomesticSourcesConfirmed: true, originals };
  return { input, sources };
}

it("pins the final bytes and checks the printed year and destinations", async () => {
  const bytes = await readFile(blank);
  const sha256 = "f4b1827b12113dcdc2b5e14181b3c658fa5553a277dea02e5106000b592815af";
  expect(bytes).toHaveLength(72863);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha256);
  expect(candidate).toMatchObject({
    taxYear: 2026, sourceRevision: "Created 6/9/26", postedDate: "2026-11-24", sha256,
    sourceUrl: "https://www.irs.gov/pub/irs-pdf/f1040sb.pdf",
    annualSourceUrl: "https://www.irs.gov/pub/irs-prior/f1040sb--2026.pdf",
  });
  const pdf = await loadPdfDocumentQuietly(bytes);
  expect(pdf.getTitle()).toBe("2026 Schedule B (Form 1040)");
  expect(pdf.getPages().map(page => page.getSize())).toEqual([{ width: 612, height: 792 }]);
  const printed = execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c",
    "from sys import argv; from pypdf import PdfReader; print(PdfReader(argv[1]).pages[0].extract_text())",
    fileURLToPath(blank)], { encoding: "utf8", timeout: 10000, maxBuffer: 65536 });
  expect(printed).toContain("Schedule B (Form 1040) 2026 Created 6/9/26");
  expect(printed).toContain("Enter the result here and on Form 1040 or 1040-SR, line 2b");
  expect(printed).toContain("Enter the total here and on Form 1040 or 1040-SR, line 3b");
  expect(printed).not.toMatch(/DRAFT|DO NOT FILE/iu);
});

it("inventories the exact blank text and checkbox widgets", async () => {
  const pdf = await loadPdfDocumentQuietly(await readFile(blank));
  const page = pdf.getPage(0);
  expect(page.node.Annots()?.size()).toBe(72);
  const fields = pdf.getForm().getFields();
  const textFields = fields.filter(field => field instanceof PDFTextField);
  const checkboxes = fields.filter(field => field instanceof PDFCheckBox);
  expect(fields).toHaveLength(72);
  expect(textFields).toHaveLength(66);
  expect(checkboxes).toHaveLength(6);
  expect(textFields.every(field => !field.getText())).toBe(true);
  expect(checkboxes.every(field => !field.isChecked())).toBe(true);
  expect(textFields.map(field => field.getName())).toEqual(candidate.nativeTextFields);
  expect(checkboxes.map(field => field.getName())).toEqual(candidate.nativeCheckboxFields);
  expect(new Set(fields.map(field => field.getName())).size).toBe(72);
  for (const field of fields) {
    const widgets = field.acroField.getWidgets();
    expect(widgets).toHaveLength(1);
    expect(widgets[0].P()).toBe(page.ref);
  }
  expect(candidate.nativeTextFields[2]).toBe(page1 + "Line1_ReadOrder[0].f1_03[0]");
  expect(candidate.nativeTextFields[33]).toBe(page1 + "ReadOrderControl[0].f1_34[0]");
  expect(candidate.nativeCheckboxFields.slice(0, 2)).toEqual([
    page1 + "TagcorrectingSubform[0].c1_1[0]", page1 + "TagcorrectingSubform[0].c1_1[1]",
  ]);
});

it("keeps the source pin outside public review and filing", async () => {
  const bytes = await readFile(blank);
  expect(Object.isFrozen(candidate)).toBe(true);
  expect(Object.isFrozen(candidate.nativeTextFields)).toBe(true);
  expect(Object.isFrozen(candidate.nativeCheckboxFields)).toBe(true);
  expect(candidate).toMatchObject({ reviewStatus: "independent-review-pending", exportsEnabled: false, filingQualified: false });
  expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
  expect(PDF_MAPPING_PACKS[2026]).toMatchObject({ reviewAvailable: false, filingQualified: false });
  expect(() => assertReviewTemplateBytes("f1040sb.pdf", bytes, 2025)).toThrow(/No registered review template|Unreviewed template revision/);
  expect(() => assertReviewTemplateBytes("f1040sb.pdf", bytes, 2026)).toThrow(/No qualified review/);
  expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
});

it("reopens exact ordinary originals as redacted whole-dollar review values", async () => {
  const { fillScheduleB2026OrdinaryCandidate } = await mapper();
  const bytes = await readFile(blank);
  const { input, sources } = ordinaryOriginals();
  const calculation = calculateScheduleB(input);
  expect(calculation.totalInterest.toFixed(2)).toBe("1600.49");
  expect(calculation.taxableInterest.toFixed(2)).toBe("1600.49");
  expect(calculation.totalOrdinaryDividends.toFixed(2)).toBe("1601.60");
  const pdf = await fillScheduleB2026OrdinaryCandidate(input, { ...sources, originals: [...sources.originals].reverse() }, bytes);
  const reopened = await loadPdfDocumentQuietly(await pdf.save());
  expect(reopened.getPageCount()).toBe(1);
  expect(reopened.getSubject()).toBe(REVIEW_PDF_NOTICE);
  const contents = reopened.getPage(0).node.normalizedEntries().Contents?.asArray() ?? [];
  expect(contents.some(reference => {
    const stream = reopened.context.lookup(reference);
    return stream instanceof PDFStream && stream.dict.get(PDFName.of("TaxEngineReviewNotice")) === PDFBool.True;
  })).toBe(true);
  const form = reopened.getForm();
  const expected = new Map([[3, "Interest payer 1"], [4, "1125"], [5, "Interest payer 2"], [6, "475"],
    [31, "1600"], [33, "1600"], [34, "Dividend payer 1"], [35, "821"], [36, "Dividend payer 2"], [37, "781"], [64, "1602"]]);
  for (const [index, fieldName] of candidate.nativeTextFields.entries()) {
    const field = form.getTextField(fieldName);
    const value = expected.get(index + 1);
    expect(field.getText() ?? "").toBe(value ?? "");
    if (!value) continue;
    expect(field.acroField.dict.has(PDFName.of("V"))).toBe(true);
    const stream = reopened.context.lookup(field.acroField.getWidgets()[0].getAppearances()?.normal);
    expect(stream).toBeInstanceOf(PDFRawStream);
    if (stream instanceof PDFRawStream) expect(Buffer.from(decodePDFRawStream(stream).decode()).toString("ascii"))
      .toContain(`<${Buffer.from(value, "ascii").toString("hex").toUpperCase()}> Tj`);
  }
  expect(candidate.nativeCheckboxFields.map(name => form.getCheckBox(name).isChecked())).toEqual([false, true, false, false, false, true]);
  for (const index of [1, 5]) {
    const field = form.getCheckBox(candidate.nativeCheckboxFields[index]);
    const [widget] = field.acroField.getWidgets();
    expect(field.acroField.dict.has(PDFName.of("V"))).toBe(true);
    expect(widget.getAppearanceState()).toBe(widget.getOnValue());
  }
  const privateText = Buffer.from(await reopened.save()).toString("latin1");
  for (const privateValue of ["Fictional Private Payer", "Private Account", "Private Original", input.taxpayer.primary.ssn]) {
    expect(privateText).not.toContain(privateValue);
  }

  const interestOnly = ordinaryOriginals(["800.00", "800.00"], []);
  const interestForm = (await fillScheduleB2026OrdinaryCandidate(interestOnly.input, interestOnly.sources, bytes)).getForm();
  expect(interestForm.getTextField(candidate.nativeTextFields[32]).getText()).toBe("1600");
  expect(interestForm.getTextField(candidate.nativeTextFields[63]).getText()).toBeUndefined();
  const dividendOnly = ordinaryOriginals([], ["1500.01"]);
  const dividendForm = (await fillScheduleB2026OrdinaryCandidate(dividendOnly.input, dividendOnly.sources, bytes)).getForm();
  expect(dividendForm.getTextField(candidate.nativeTextFields[32]).getText()).toBeUndefined();
  expect(dividendForm.getTextField(candidate.nativeTextFields[63]).getText()).toBe("1500");
});

it("holds missing extra duplicated stale and conflicting originals", async () => {
  const { fillScheduleB2026OrdinaryCandidate } = await mapper();
  const bytes = await readFile(blank);
  const { input, sources } = ordinaryOriginals();
  const [first, second, ...other] = sources.originals;
  const inventories = [
    [second, ...other], [...sources.originals, { ...first, accountReference: "Extra declared account" }],
    [first, { ...second, sourceReference: first.sourceReference }, ...other],
    [first, { ...first, sourceReference: second.sourceReference }, ...other],
    [{ ...first, taxYear: 2025 }, second, ...other], [{ ...first, accountHolder: "spouse" }, second, ...other],
    [{ ...first, payerTin: "***456789" }, second, ...other], [{ ...first, corrected: true }, second, ...other],
    [{ ...first, payerTin: "999999999" }, second, ...other], [{ ...first, accountReference: "Wrong actual account" }, second, ...other],
    [{ ...first, box1: "1125.26" }, second, ...other], [{ ...first, payer: "Different actual payer" }, second, ...other],
    [{ ...first, completeAccountReferenceConfirmed: false }, second, ...other],
  ];
  for (const originals of inventories) await expect(fillScheduleB2026OrdinaryCandidate(input, { ...sources, originals }, bytes))
    .rejects.toThrow(/original|inventory|source/i);
  await expect(fillScheduleB2026OrdinaryCandidate({ ...input, form1099Int: [input.form1099Int[0], input.form1099Int[0]] }, sources, bytes))
    .rejects.toThrow(/original|inventory|source/i);
  const wrongRecipient = [{ ...first, recipient: { ...first.recipient, ssnLast4: "6790" } }, second, ...other];
  await expect(fillScheduleB2026OrdinaryCandidate(input, { ...sources, originals: wrongRecipient }, bytes))
    .rejects.toThrow(/recipient/i);
});

it("holds different actual account references", async () => {
  const { fillScheduleB2026OrdinaryCandidate } = await mapper();
  const bytes = await readFile(blank);
  const { input, sources } = ordinaryOriginals();
  for (const [canonicalAccount, actualAccount] of [["Acct-a", "Acct-A"], ["12-34", "1234"], ["A  B", "A B"]]) {
    const candidateInput = { ...input, form1099Int: [{ ...input.form1099Int[0], accountReference: canonicalAccount }, input.form1099Int[1]] };
    const bindActual = (accountReference: string) => ({
      ...sources, originals: [{ ...sources.originals[0], accountReference }, ...sources.originals.slice(1)],
    });
    const outcome = (accountReference: string) => fillScheduleB2026OrdinaryCandidate(candidateInput, bindActual(accountReference), bytes)
      .then(() => true);
    await expect(outcome(actualAccount)).rejects.toThrow(/original/i);
    await expect(outcome(` ${canonicalAccount} `)).resolves.toBe(true);
  }
});

it("holds unsupported amounts methods and foreign account or trust facts", async () => {
  const { fillScheduleB2026OrdinaryCandidate } = await mapper();
  const bytes = await readFile(blank);
  const { input, sources } = ordinaryOriginals();
  for (const partThree of [undefined, { hasForeignAccounts: true, fbarRequired: false, hasForeignTrust: false },
    { hasForeignAccounts: false, hasForeignTrust: true }]) {
    await expect(fillScheduleB2026OrdinaryCandidate({ ...input, scheduleBPartThree: partThree }, sources, bytes)).rejects.toThrow(/foreign/i);
  }
  await expect(fillScheduleB2026OrdinaryCandidate({ ...input, form1099Int: [
    { ...input.form1099Int[0], usSavingsBondInterest: "5" }, input.form1099Int[1],
  ] }, sources, bytes)).rejects.toThrow(/unsupported|ordinary/i);
  await expect(fillScheduleB2026OrdinaryCandidate({ ...input, form1099Div: [
    { ...input.form1099Div[0], qualifiedDividends: "5" }, input.form1099Div[1],
  ] }, sources, bytes)).rejects.toThrow(/unsupported|ordinary/i);
  await expect(fillScheduleB2026OrdinaryCandidate(input, { ...sources, ordinaryDomesticSourcesConfirmed: false }, bytes))
    .rejects.toThrow(/source|original/i);
  await expect(fillScheduleB2026OrdinaryCandidate(input, sources, bytes.subarray(1))).rejects.toThrow(/template revision/i);
});

it("holds rounded display conflicts nonrequired schedules and overflow", async () => {
  const { fillScheduleB2026OrdinaryCandidate } = await mapper();
  const bytes = await readFile(blank);
  for (const scenario of [ordinaryOriginals(["1000.40", "600.10"], []), ordinaryOriginals([], ["800.60", "800.60"])]) {
    await expect(fillScheduleB2026OrdinaryCandidate(scenario.input, scenario.sources, bytes)).rejects.toThrow(/displayed.*reconcile/i);
  }
  const noSchedule = ordinaryOriginals(["1500"], []);
  await expect(fillScheduleB2026OrdinaryCandidate(noSchedule.input, noSchedule.sources, bytes)).rejects.toThrow(/required/i);
  const cap = ordinaryOriginals(Array(14).fill("110"), Array(15).fill("110"));
  const pdf = await fillScheduleB2026OrdinaryCandidate(cap.input, cap.sources, bytes);
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getForm().getTextField(candidate.nativeTextFields[29]).getText()).toBe("110");
  expect(pdf.getForm().getTextField(candidate.nativeTextFields[62]).getText()).toBe("110");
  const tooMany = [ordinaryOriginals(Array(15).fill("110"), []), ordinaryOriginals([], Array(16).fill("110"))];
  for (const scenario of tooMany) await expect(fillScheduleB2026OrdinaryCandidate(scenario.input, scenario.sources, bytes))
    .rejects.toThrow(/capacity|overflow/i);
});
