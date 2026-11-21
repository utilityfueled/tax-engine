// Spec: spec/federal/form-5329.yaml, Line 2, 2025 nonjoint review attachment.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema, type Form1099R, type TaxYearInput } from "@/models/inputs.js";
import { FORM_5329_FIELDS as F } from "@/pdf/fill-form-5329.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const ira = {
  taxYear: 2025,
  payer: "Fictional Traditional IRA Custodian",
  accountHolder: "primary",
  distributionCode: "1",
  distributionDate: "2025-08-01",
  grossDistribution: "6000",
  taxableAmount: "6000",
  taxableAmountNotDetermined: false,
  iraSepSimple: true,
  iraBasisConfirmedZero: true,
} satisfies Partial<Form1099R>;

function inputFor(form: Partial<Form1099R> = {}, dateOfBirth = "1966-02-01", form5329?: Partial<NonNullable<TaxYearInput["form5329"]>>) {
  const taxpayer = simpleW2Fixture.taxpayer;
  return TaxYearInputSchema.parse({
    taxpayer: { ...taxpayer, primary: { ...taxpayer.primary, dateOfBirth } },
    form1099R: [{ ...ira, ...form }],
    form5329,
  });
}

async function review(input: ReturnType<typeof inputFor>, readFields = false) {
  const result = calculateFederalTax(input);
  const outputDir = await mkdtemp(join(tmpdir(), "form-5329-ira-review-"));
  try {
    const packet = await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), {
      purpose: "review",
      blankFormsDir: "forms/blank/2025",
      outputDir,
    });
    const forms = packet.filledForms.filter(path => basename(path).startsWith("f5329"));
    const fields = readFields && forms.length === 1
      ? (await PDFDocument.load(await readFile(forms[0]))).getForm()
      : undefined;
    return { result, files: forms.map(path => basename(path)), fields };
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}

it("attaches Form 5329 for a fully taxable traditional IRA Code 1 on the exact half-birthday", async () => {
  const { result, files, fields } = await review(inputFor(), true);
  expect(result.iraDistributionsTaxable.toFixed()).toBe("6000");
  expect(result.form5329?.line2ExceptionNumber).toBe("12");
  expect(result.form5329?.totalAdditionalTax.toFixed()).toBe("0");
  expect(files).toEqual(["f5329-filled.pdf"]);
  expect(fields?.getTextField(F.name).getText()).toBe("Jane Doe");
  expect(fields?.getTextField(F.ssn).getText()).toBeUndefined();
  expect(fields?.getTextField(F.line1).getText()).toBe("6000");
  expect(fields?.getTextField(F.line2ExceptionNumber).getText()).toBe("12");
  expect(fields?.getTextField(F.line2).getText()).toBe("6000");
  expect(fields?.getTextField(F.line3).getText()).toBeUndefined();
  expect(fields?.getTextField(F.line4).getText()).toBeUndefined();
});

it("attaches Form 5329 when the traditional IRA reports zero in Box 5", async () => {
  const { files, fields } = await review(inputFor({ employeeContributions: "0.00" }), true);
  expect(files).toEqual(["f5329-filled.pdf"]);
  expect(fields?.getTextField(F.line2ExceptionNumber).getText()).toBe("12");
});

it("leaves the Form 5329 attachment off when Box 5 shows tax-free recovery", async () => {
  const { result, files } = await review(inputFor({ employeeContributions: "300" }));
  expect(result.iraDistributionsTaxable.toFixed()).toBe("6000");
  expect(result.form5329?.line2ExceptionNumber).toBe("12");
  expect(result.form5329?.line4.toFixed()).toBe("0");
  expect(files).toEqual([]);
});

it("keeps the positive-tax attachment one day before age 59 1/2", async () => {
  const { result, files } = await review(inputFor({ distributionDate: "2025-07-31" }));
  expect(result.form5329?.line2ExceptionNumber).toBeUndefined();
  expect(result.form5329?.line4.toFixed()).toBe("600");
  expect(files).toEqual(["f5329-filled.pdf"]);
});

it.each([
  ["unknown owner", inputFor({ accountHolder: undefined })],
  ["missing distribution date", inputFor({ distributionDate: undefined }, "1965-02-01")],
  ["impossible distribution date", inputFor({ distributionDate: "2025-02-30" }, "1965-02-01")],
  ["distribution outside 2025", inputFor({ distributionDate: "2026-08-01" })],
  ["unknown taxable checkbox", inputFor({ taxableAmountNotDetermined: undefined })],
  ["unconfirmed zero basis", inputFor({ iraBasisConfirmedZero: undefined })],
  ["partly taxable statement", inputFor({ taxableAmount: "5000", iraBasisConfirmedZero: undefined })],
  ["manual Part I", inputFor({}, "1966-02-01", {
    earlyDistributionsIncludedInIncome: "6000",
    distributionsNotSubjectToAdditionalTax: "6000",
    distributionExceptionNumber: "12",
  })],
])("does not use the zero-tax attachment rule with %s", async (_name, input) => {
  const { result, files } = await review(input);
  expect(result.form5329?.line2ExceptionNumber).toBe("12");
  expect(result.form5329?.line4.toFixed()).toBe("0");
  expect(files).toEqual([]);
});

it("leaves correctly coded ordinary traditional IRA distributions on the existing path", async () => {
  const { result, files } = await review(inputFor({ distributionCode: "7" }));
  expect(result.iraDistributionsTaxable.toFixed()).toBe("6000");
  expect(files).toEqual([]);
});

it("leaves a traditional IRA first-home exception on the existing path", async () => {
  const { result, files } = await review(inputFor({}, "1990-01-15", {
    earlyDistributionsIncludedInIncome: "6000",
    qualifiedFirstTimeHomebuyerDistributionAmount: "6000",
    priorQualifiedFirstTimeHomebuyerDistributions: "0",
  }));
  expect(result.form5329?.line2ExceptionNumber).toBe("09");
  expect(result.form5329?.line4.toFixed()).toBe("0");
  expect(files).toEqual([]);
});
