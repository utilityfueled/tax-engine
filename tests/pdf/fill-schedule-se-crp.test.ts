// Spec: spec/federal/schedule-se-crp-cash-farm.yaml.
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { fillSchedule2, SCHEDULE_2_FIELDS } from "@/pdf/mappings/2025/fill-schedule-2.js";
import { fillScheduleSE, SCHEDULE_SE_FIELDS } from "@/pdf/fill-schedule-se.js";
import { fillScheduleF, SCHEDULE_F_FIELDS } from "@/pdf/fill-schedule-f.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { complexMFJFixture, simpleW2Fixture } from "../fixtures/simple-w2.js";
import { annualFarmBenefit, cashFarmPayments, farmPayment } from "../fixtures/schedule-se-crp.js";

it("saves the required zero-tax owner schedule and explicit zero on Schedule 2", async () => {
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [], formSSA1099: [annualFarmBenefit()], scheduleF: cashFarmPayments("434") });
  const result = calculateFederalTax(input);
  const { schedule2: s2, scheduleF: sf } = result;
  const paymentLine = sf?.lines.find(line => line.line === "4b");
  if (!s2 || !sf || !paymentLine) throw new Error("Missing synthetic CRP schedule fixture");
  const mismatchedSchedule2 = { ...result, schedule2: { ...s2, selfEmploymentTax: new Decimal(42) } };
  await expect(fillSchedule2(input, mismatchedSchedule2, "forms/blank/2025/f1040s2.pdf")).rejects.toThrow(/CRP.*tax/i);
  const duplicatePayment = { ...result, scheduleF: { ...sf, lines: [...sf.lines, paymentLine] } };
  await expect(fillScheduleF(input, duplicatePayment, "forms/blank/2025/f1040sf.pdf")).rejects.toThrow(/payment totals/i);
  const outputDir = await mkdtemp(join(tmpdir(), "schedule-se-crp-"));
  try {
    const packet = await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), {
      blankFormsDir: "forms/blank/2025", outputDir,
    });
    const sePath = join(outputDir, "f1040sse-filled.pdf");
    expect(packet.filledForms).toContain(sePath);
    const form = (await PDFDocument.load(await readFile(sePath))).getForm();
    const value = (key: keyof typeof SCHEDULE_SE_FIELDS) => form.getTextField(SCHEDULE_SE_FIELDS[key]).getText();
    expect([value("line1a"), value("line1b"), value("line4a"), value("line4c")]).toEqual(["434", "434", "0", "0"]);
    expect([value("ssn"), value("line6"), value("line12"), value("line13")]).toEqual([undefined, undefined, undefined, undefined]);
    const schedule2 = (await PDFDocument.load(await readFile(join(outputDir, "f1040s2-filled.pdf")))).getForm();
    expect(schedule2.getTextField(SCHEDULE_2_FIELDS.line4).getText()).toBe("0");
    const farm = (await PDFDocument.load(await readFile(join(outputDir, "f1040sf-filled.pdf")))).getForm();
    expect(farm.getTextField(SCHEDULE_F_FIELDS.name).getText()).toBe("Jane Doe");
    expect(farm.getTextField(SCHEDULE_F_FIELDS.ssn).getText()).toBeUndefined();
    expect(farm.getTextField(SCHEDULE_F_FIELDS.line4a).getText()).toBe("434");
    expect(farm.getTextField(SCHEDULE_F_FIELDS.line4b).getText()).toBe("434");
  } finally { await rm(outputDir, { recursive: true, force: true }); }
});

it("retains a spouse's separate farm and zero-tax attachment alongside the primary owner's regular tax", async () => {
  const input = TaxYearInputSchema.parse({ ...complexMFJFixture, w2s: [], scheduleK1: [], form1099Nec: [],
    formSSA1099: [annualFarmBenefit("spouse")],
    scheduleC: { accountHolder: "primary", grossReceipts: "1000" },
    scheduleF: cashFarmPayments("434", [farmPayment("spouse-crp", "434", "2025-04-02", "spouse")], "spouse"),
  });
  const result = calculateFederalTax(input);
  const outputDir = await mkdtemp(join(tmpdir(), "schedule-se-crp-joint-"));
  try {
    await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), { blankFormsDir: "forms/blank/2025", outputDir });
    const saved = async (name: string) => PDFDocument.load(await readFile(join(outputDir, name)));
    const scheduleSE = await saved("f1040sse-filled.pdf");
    const se = scheduleSE.getForm();
    const spousePrefix = "spouse_ScheduleSE.Page1[0].";
    expect(scheduleSE.getPageCount()).toBe(4);
    expect(se.getTextField(SCHEDULE_SE_FIELDS.name).getText()).toBe("John Smith");
    expect(se.getTextField(SCHEDULE_SE_FIELDS.line12).getText()).toBe("142");
    expect(se.getTextField(`${spousePrefix}f1_1[0]`).getText()).toBe("Jane Smith");
    expect(se.getTextField(`${spousePrefix}f1_4[0]`).getText()).toBe("434");
    expect(se.getTextField(`${spousePrefix}f1_21[0]`).getText()).toBeUndefined();
    const farm = (await saved("f1040sf-filled.pdf")).getForm();
    expect(farm.getTextField(SCHEDULE_F_FIELDS.name).getText()).toBe("Jane Smith");
    expect(farm.getTextField(SCHEDULE_F_FIELDS.ssn).getText()).toBeUndefined();
    const schedule2 = (await saved("f1040s2-filled.pdf")).getForm();
    expect(schedule2.getTextField(SCHEDULE_2_FIELDS.line4).getText()).toBe("142");
  } finally { await rm(outputDir, { recursive: true, force: true }); }
});

it("holds the official review copy when exact and printed attachment thresholds differ", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "schedule-se-crp-rejected-"));
  try {
    for (const [payment, sales, attachment] of [["0.87", "433.13", "crp-zero"], ["10", "423.99", "none"]]) {
      const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [], formSSA1099: [annualFarmBenefit()],
        scheduleF: { ...cashFarmPayments(payment), salesOfProductsRaised: sales } });
      const result = calculateFederalTax(input);
      expect(result.scheduleSE?.perTaxpayer[0]?.reviewAttachment).toBe(attachment);
      expect(result.selfEmploymentTax.toFixed()).toBe("0");
      await expect(fillScheduleSE(input, result, "forms/blank/2025/f1040sse.pdf")).rejects.toThrow(/presentation/i);
      await expect(fillReturn(input, result, { blankFormsDir: "forms/blank/2025", outputDir })).rejects.toThrow(/presentation/i);
      expect(await readdir(outputDir)).toEqual([]);
    }
  } finally { await rm(outputDir, { recursive: true, force: true }); }
});

it("rejects changed ordinary receipts before saving any stale review pages", async () => {
  const farm = cashFarmPayments("434");
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [], formSSA1099: [annualFarmBenefit()], scheduleF: farm });
  const result = calculateFederalTax(input);
  const additionalReceipt = { sourceId: "ordinary", sourceReference: "Synthetic ordinary receipt", receivedDate: "2025-04-03",
    taxableAmount: "10", accountHolder: "primary", program: "other" };
  const current = TaxYearInputSchema.parse({ ...input, scheduleF: { ...farm, agriculturalProgramPayments: "444",
    agriculturalPaymentSources: { ...farm.agriculturalPaymentSources, payments: [...farm.agriculturalPaymentSources.payments, additionalReceipt] } } });
  const outputDir = await mkdtemp(join(tmpdir(), "schedule-se-crp-stale-"));
  try {
    await expect(fillReturn(current, result, { blankFormsDir: "forms/blank/2025", outputDir })).rejects.toThrow(/payment totals/i);
    expect(await readdir(outputDir)).toEqual([]);
  } finally { await rm(outputDir, { recursive: true, force: true }); }
});
