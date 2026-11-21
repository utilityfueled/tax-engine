// Spec: spec/federal/form-5329-first-home-source.yaml, 09-review.
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import Decimal from "decimal.js";
import { PDFDocument, PDFTextField } from "pdf-lib";
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import { FORM_5329_FIELDS as F } from "@/pdf/fill-form-5329.js";
import { fillReturn, prepareForm5329FirstHomeReview, type FillReturnOptions } from "@/pdf/fill-return.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { complexMFJFixture, simpleW2Fixture } from "../fixtures/simple-w2.js";

function inputFor(priorQualifiedFirstTimeHomebuyerDistributions = "4000") {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    form1099R: [{
      taxYear: 2025,
      payer: "Fictional first-home IRA custodian",
      accountHolder: "primary",
      accountReference: "first-home-ira-original",
      distributionCode: "1",
      distributionDate: "2025-09-15",
      grossDistribution: "6000",
      taxableAmount: "6000",
      taxableAmountNotDetermined: false,
      iraSepSimple: true,
      iraBasisConfirmedZero: true,
    }],
    form5329FirstHomeSource: {
      sourceTaxYear: 2025,
      owner: "primary",
      accountReference: "first-home-ira-original",
      sourceFactsConfirmed: true,
      distributionReceivedDate: "2025-09-15",
      singleDistributionReceiptConfirmed: true,
      distributionRolledOver: false,
      boughtOwnPrincipalResidence: true,
      purchaseCompleted: true,
      bindingContractDate: "2025-10-20",
      maritalStatusAtAcquisition: "unmarried",
      buyerHadNoPrincipalResidenceInterest: true,
      noFormerSection1034Suspension: true,
      qualifiedPayment: { date: "2026-01-13", amount: "6000", kind: "purchase_price", paidFromMatchedDistribution: true },
      priorQualifiedFirstTimeHomebuyerDistributions,
    },
  });
}

async function review(input: TaxYearInput, result: TaxReturnResult, form5329FirstHomeReview?: FillReturnOptions["form5329FirstHomeReview"]) {
  const outputDir = await mkdtemp(join(tmpdir(), "form-5329-first-home-review-"));
  try {
    const packet = await fillReturn(input, result, { purpose: "review", blankFormsDir: "forms/blank/2025", outputDir, form5329FirstHomeReview });
    const forms = packet.filledForms.filter(path => basename(path).startsWith("f5329"));
    const fields = forms.length === 1 ? (await PDFDocument.load(await readFile(forms[0]))).getForm() : undefined;
    return { files: forms.map(path => basename(path)), fields };
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}

it("attaches Form 5329 for a fully excepted documented Code 1 first-home IRA", async () => {
  const input = inputFor();
  const result = calculateFederalTax(input);
  const partI = result.form5329!;
  expect(result.iraDistributionsTaxable.toFixed()).toBe("6000");
  expect([partI.line1, partI.line2, partI.line3, partI.line4].map(amount => amount.toFixed())).toEqual(["6000", "6000", "0", "0"]);
  expect(partI.line2ExceptionNumber).toBe("09");
  const { files, fields } = await review(input, result);
  expect(files).toEqual(["f5329-filled.pdf"]);
  expect(fields?.getTextField(F.name).getText()).toBe("Jane Doe");
  expect(fields?.getTextField(F.ssn).getText()).toBe(input.taxpayer.primary.ssn.replaceAll("-", ""));
  expect(fields?.getTextField(F.line1).getText()).toBe("6000");
  expect(fields?.getTextField(F.line2ExceptionNumber).getText()).toBe("09");
  expect(fields?.getTextField(F.line2).getText()).toBe("6000");
  expect(fields?.getTextField(F.line3).getText()).toBeUndefined();
  expect(fields?.getTextField(F.line4).getText()).toBeUndefined();
});


it("uses private prepared first-home proof for a physical redacted packet", async () => {
  const input = inputFor();
  const result = calculateFederalTax(input);
  const prepared = prepareForm5329FirstHomeReview(input);
  const redacted = redactReviewIdentifiers(input);
  expect(redacted.form1099R?.[0].accountReference).toBe("");
  expect(redacted.form5329FirstHomeSource?.accountReference).toBe("");
  const { files, fields } = await review(redacted, redactReviewIdentifiers(result), prepared);
  expect(files).toEqual(["f5329-filled.pdf"]);
  expect(fields?.getTextField(F.name).getText()).toBe("Jane Doe");
  expect(fields?.getTextField(F.ssn).getText()).toBeUndefined();
  expect(fields?.getTextField(F.line1).getText()).toBe("6000");
  expect(fields?.getTextField(F.line2).getText()).toBe("6000");
  expect(fields?.getTextField(F.line2ExceptionNumber).getText()).toBe("09");
  const values = fields?.getFields().flatMap(field => field instanceof PDFTextField ? [field.getText()] : []);
  expect(values?.join(" ")).not.toContain("first-home-ira-original");
});

it("keeps the positive-tax and legacy manual first-home routes", async () => {
  const input = inputFor("4500");
  const result = calculateFederalTax(input);
  expect(result.form5329?.line3.toFixed()).toBe("500");
  expect(result.form5329?.line4.toFixed()).toBe("50");
  const { files, fields } = await review(input, result);
  expect(files).toEqual(["f5329-filled.pdf"]);
  expect(fields?.getTextField(F.line2ExceptionNumber).getText()).toBe("09");
  expect(fields?.getTextField(F.line2).getText()).toBe("5500");
  expect(fields?.getTextField(F.line4).getText()).toBe("50");

  const manual = {
    ...input,
    form5329FirstHomeSource: undefined,
    form5329: { earlyDistributionsIncludedInIncome: "6000", qualifiedFirstTimeHomebuyerDistributionAmount: "6000" },
  };
  const legacy = calculateFederalTax(manual);
  expect(legacy.form5329?.line2ExceptionNumber).toBe("09");
  expect(legacy.form5329?.line4.isZero()).toBe(true);
  expect((await review(manual, legacy)).files).toEqual([]);
});

it("rejects stale first-home sources and exact Part I or audit mismatches before template I/O", async () => {
  const input = inputFor();
  const result = calculateFederalTax(input);
  const prepared = prepareForm5329FirstHomeReview(input);
  const redacted = redactReviewIdentifiers(input);
  const outputDir = await mkdtemp(join(tmpdir(), "form-5329-first-home-rejected-"));
  const options = { purpose: "review" as const, blankFormsDir: join(outputDir, "must-not-open"), outputDir };
  try {
    await expect(fillReturn(inputFor("4500"), result, options)).rejects.toThrow(/calculation and audit do not reconcile/i);
    await expect(fillReturn({
      ...input,
      form5329FirstHomeSource: { ...input.form5329FirstHomeSource!, accountReference: "mismatched-original" },
    }, result, options)).rejects.toThrow(/match the actual IRA payer statement/i);
    await expect(fillReturn({ ...input, scheduleA: { medicalExpenses: "20000" } }, result, options))
      .rejects.toThrow(/competing Part I exception/i);
    await expect(fillReturn({ ...input, form5329FirstHomeSource: undefined }, result, options))
      .rejects.toThrow(/requires the original source/i);
    await expect(fillReturn({
      ...input, taxpayer: { ...input.taxpayer, filingStatus: "married_filing_jointly", spouse: complexMFJFixture.taxpayer.spouse },
    }, result, options)).rejects.toThrow(/nonjoint return/i);
    await expect(fillReturn(redacted, result, options)).rejects.toThrow();
    await expect(fillReturn(redacted, result, {
      ...options,
      form5329FirstHomeReview: { ...prepared },
    })).rejects.toThrow(/requires an original prepared context/i);
    await expect(fillReturn({ ...redacted, scheduleA: { medicalExpenses: "20000" } }, result, {
      ...options,
      form5329FirstHomeReview: prepared,
    })).rejects.toThrow(/sources are stale or conflicting/i);
    for (const changed of [
      { ...result, form5329: undefined },
      { ...result, iraDistributionsTaxable: new Decimal(5999) },
      { ...result, form5329: { ...result.form5329!, line2: new Decimal("5999.99") } },
      { ...result, form5329: { ...result.form5329!, line4: new Decimal("0.01"), totalAdditionalTax: new Decimal("0.01") } },
      { ...result, allLines: result.allLines.filter(line => line.form !== "Form 5329 first home") },
    ]) {
      await expect(fillReturn(redacted, changed, { ...options, form5329FirstHomeReview: prepared }))
        .rejects.toThrow(/calculation and audit do not reconcile/i);
    }
    expect(await readdir(outputDir)).toEqual([]);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

it("preserves the 2026 review and filing PDF gates for first-home records", async () => {
  const input = inputFor();
  const result = calculateFederalTax(input);
  const options = { blankFormsDir: "must-not-open", outputDir: "must-not-create" };
  await expect(fillReturn(input, result, { ...options, purpose: "filing" })).rejects.toThrow(/filing exports are unavailable/i);
  const future = {
    ...input,
    taxpayer: { ...input.taxpayer, taxYear: 2026 as const },
    form5329FirstHomeSource: { ...input.form5329FirstHomeSource!, sourceTaxYear: 2026 as const },
  };
  await expect(fillReturn(future, { ...result, taxYear: 2026 }, options)).rejects.toThrow(/no qualified review PDF mapping/i);
});
