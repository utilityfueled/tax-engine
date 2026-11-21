// Spec: spec/federal/form-5329.yaml, 2025 joint Part I review.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { PDFDocument, type PDFForm } from "pdf-lib";
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema, type Form1099R, type TaxYearInput } from "@/models/inputs.js";
import { fillForm5329, FORM_5329_FIELDS as F } from "@/pdf/fill-form-5329.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { hsaOwnerInput } from "../fixtures/hsa-excess-owner.js";

const template = "forms/blank/2025";

function pension(accountHolder: Form1099R["accountHolder"]): Partial<Form1099R> {
  return {
    taxYear: 2025,
    payer: "Fictional Pension Plan",
    accountHolder,
    distributionCode: "1",
    grossDistribution: "6000",
    taxableAmount: "6000",
    taxableAmountNotDetermined: false,
    iraSepSimple: false,
    terminalIllnessExceptionApplies: true,
  };
}

function jointInput(form1099R: Partial<Form1099R>[], includeHsa = false, form5329?: Partial<TaxYearInput["form5329"]>) {
  const base = hsaOwnerInput();
  return TaxYearInputSchema.parse({
    ...base,
    ...(includeHsa ? {} : { form8889ByOwner: undefined, form5329HsaByOwner: undefined }),
    form1099R,
    form5329,
  });
}

function expectFullyExceptedPartI(form: PDFForm) {
  expect(form.getTextField(F.line1).getText()).toBe("6000");
  expect(form.getTextField(F.line2ExceptionNumber).getText()).toBe("20");
  expect(form.getTextField(F.line2).getText()).toBe("6000");
  expect(form.getTextField(F.line3).getText()).toBeUndefined();
  expect(form.getTextField(F.line4).getText()).toBeUndefined();
}

it.each([
  { owner: "primary", name: "Jane Doe", ssn: "123456789" },
  { owner: "spouse", name: "Alex Doe", ssn: "987654321" },
] as const)("prints only the $owner Form 5329 for a joint Code 1 terminal-illness exception", async ({ owner, name, ssn }) => {
  const input = jointInput([pension(owner)]);
  const result = calculateFederalTax(input);
  expect(result.form5329?.totalAdditionalTax.toFixed()).toBe("0");
  const outputDir = await mkdtemp(join(tmpdir(), "form-5329-joint-owner-"));
  try {
    const packet = await fillReturn(input, result, { blankFormsDir: template, outputDir });
    const attachments = packet.filledForms.filter(path => basename(path).startsWith("f5329"));
    expect(attachments.map(path => basename(path))).toEqual([`f5329-${owner}-filled.pdf`]);
    const form = (await PDFDocument.load(await readFile(attachments[0]))).getForm();
    expect(form.getTextField(F.name).getText()).toBe(name);
    expect(form.getTextField(F.ssn).getText()).toBe(ssn);
    expectFullyExceptedPartI(form);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

it("combines the spouse exception with the spouse HSA part without duplicating either owner", async () => {
  const input = jointInput([pension("spouse")], true);
  const result = calculateFederalTax(input);
  const outputDir = await mkdtemp(join(tmpdir(), "form-5329-joint-hsa-"));
  try {
    const packet = await fillReturn(redactReviewIdentifiers(input), result, { blankFormsDir: template, outputDir });
    const attachments = packet.filledForms.filter(path => basename(path).startsWith("f5329"));
    expect(attachments.map(path => basename(path)).sort()).toEqual(["f5329-primary-filled.pdf", "f5329-spouse-filled.pdf"]);
    const [primary, spouse] = await Promise.all(["primary", "spouse"].map(async owner =>
      (await PDFDocument.load(await readFile(join(outputDir, `f5329-${owner}-filled.pdf`)))).getForm()));
    expect(primary.getTextField(F.ssn).getText() ?? "").toBe("");
    expect(spouse.getTextField(F.ssn).getText() ?? "").toBe("");
    expect(primary.getTextField(F.line1).getText()).toBeUndefined();
    expect(primary.getTextField(F.line49).getText()).toBe("6");
    expect(spouse.getTextField(F.line49).getText()).toBe("42");
    expectFullyExceptedPartI(spouse);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

it.each([
  { name: "multiple-owner", sources: [pension("primary"), pension("spouse")] },
  { name: "unowned", sources: [pension(undefined)] },
  { name: "manual", sources: [pension("spouse")], manual: { earlyDistributionsIncludedInIncome: "6000" } },
])("keeps a joint $name Part I unassigned", async ({ sources, manual }) => {
  const input = jointInput(sources, false, manual);
  const result = calculateFederalTax(input);
  expect(result.form5329?.line1.gt(0)).toBe(true);
  await expect(fillForm5329(input, result, join(template, "f5329.pdf"), "spouse")).rejects.toThrow(/unassigned legacy parts/);
});

it("keeps the joint Part I unassigned when owner sources do not reconcile to the supplied result", async () => {
  const source = pension("spouse");
  const input = jointInput([source]);
  const staleResult = calculateFederalTax(jointInput([{ ...source, grossDistribution: "6500", taxableAmount: "6500" }]));
  await expect(fillForm5329(input, staleResult, join(template, "f5329.pdf"), "spouse")).rejects.toThrow(/unassigned legacy parts/);
});

it("holds the owner attachment when joint HSA amounts are still unassigned", async () => {
  const input = TaxYearInputSchema.parse({
    ...jointInput([pension("spouse")], true),
    form5329HsaByOwner: undefined,
  });
  const result = calculateFederalTax(input);
  expect(result.form5329?.line47.gt(0)).toBe(true);
  await expect(fillForm5329(input, result, join(template, "f5329.pdf"), "spouse")).rejects.toThrow(/unassigned legacy parts/);
});

it.each([
  { name: "additional tax is zero", legacy: undefined, additionalTax: "0", attachments: [] },
  { name: "additional tax is positive", legacy: { hsaCurrentYearExcessContributions: "1400", hsaValueDec31: "10000" },
    additionalTax: "84", attachments: ["f5329-filled.pdf"] },
])("preserves the aggregate HSA review packet when $name", async ({ legacy, additionalTax, attachments }) => {
  const input = TaxYearInputSchema.parse({
    ...jointInput([pension("spouse")], true, legacy),
    form5329HsaByOwner: undefined,
  });
  const result = calculateFederalTax(input);
  expect(result.form5329?.line47.toFixed()).toBe("1400");
  expect(result.form5329?.totalAdditionalTax.toFixed()).toBe(additionalTax);
  const outputDir = await mkdtemp(join(tmpdir(), "form-5329-joint-legacy-hsa-"));
  try {
    const packet = await fillReturn(input, result, { blankFormsDir: template, outputDir });
    const names = packet.filledForms.map(path => basename(path));
    expect(names).toContain("f1040-filled.pdf");
    expect(names.filter(path => path.startsWith("f5329"))).toEqual(attachments);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

it.each([
  { name: "another tax year", dateOfBirth: "1990-01-01", distributionDate: "2024-12-31", attach: false },
  { name: "an invalid calendar date", dateOfBirth: "1990-01-01", distributionDate: "2025-02-30", attach: false },
  { name: "an unknown date during the year the spouse reaches age 59½", dateOfBirth: "1966-01-15", distributionDate: undefined, attach: false },
  { name: "the day before the spouse reaches age 59½", dateOfBirth: "1966-01-15", distributionDate: "2025-07-14", attach: true },
  { name: "the day the spouse reaches age 59½", dateOfBirth: "1966-01-15", distributionDate: "2025-07-15", attach: false },
])("checks the joint Part I distribution date for $name", async ({ dateOfBirth, distributionDate, attach }) => {
  const base = jointInput([{ ...pension("spouse"), distributionDate }]);
  const input = TaxYearInputSchema.parse({
    ...base,
    taxpayer: {
      ...base.taxpayer,
      spouse: { ...base.taxpayer.spouse, dateOfBirth },
    },
  });
  const result = calculateFederalTax(input);
  const outputDir = await mkdtemp(join(tmpdir(), "form-5329-joint-source-date-"));
  try {
    const packet = await fillReturn(input, result, { blankFormsDir: template, outputDir });
    const names = packet.filledForms.map(path => basename(path)).filter(path => path.startsWith("f5329"));
    expect(names).toEqual(attach ? ["f5329-spouse-filled.pdf"] : []);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
