// Spec: spec/federal/charitable-carryover-sources.yaml review.
import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateScheduleA } from "@/engine/schedules/schedule-a.js";
import { getConstants } from "@/models/constants.js";
import { d } from "@/utils/decimal.js";
import { fillScheduleA, SCHEDULE_A_FIELDS as F } from "@/pdf/fill-schedule-a.js";
import { charitableCarryoverFixture } from "../fixtures/charitable-carryover.js";
import { prepareCharitableReview, type PreparedCharitableReview } from "@/pdf/charitable-review-context.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
it("maps prior noncash to line13 and rejects stale source grouping", async () => {
  const input = charitableCarryoverFixture();
  const result = calculateFederalTax(input);
  const scheduleA = calculateScheduleA(input, d("24000"), "single", getConstants(2025));
  const doc = await fillScheduleA(input, { ...result, scheduleA }, "forms/blank/2025/f1040sa.pdf");
  const reopened = await PDFDocument.load(await doc.save());
  for (const [field, value] of [[F.line11,"7000"], [F.line12,undefined], [F.line13,"5000"], [F.line14,"12000"]] as const) {
    expect(reopened.getForm().getTextField(field).getText()).toBe(value);
  }
  for (const medium of [undefined, "cash"] as const) {
    await expect(fillScheduleA(input, { ...result, scheduleA: { ...scheduleA,
      charitableCarryforwardDetail: scheduleA.charitableCarryforwardDetail.map(row => ({ ...row, medium })) } }, "missing.pdf")).rejects.toThrow(/charitable.*(source|audit|reconcile)/i);
  }
  const changed = structuredClone(input);
  const changedVintage = changed.charitableCarryoverSources?.vintages?.[0];
  if (!changedVintage) throw new Error("Missing synthetic charitable source vintage");
  changedVintage.category = "noncash_50";
  await expect(fillScheduleA(changed, { ...result, scheduleA }, "missing.pdf")).rejects.toThrow(/charitable.*source/i);
});
it("requires original prepared charity identity for redacted rendering", async () => {
  const input = charitableCarryoverFixture();
  const result = calculateFederalTax(input);
  const original = JSON.stringify(input);
  const token = prepareCharitableReview(input);
  const changed = structuredClone(input);
  if (!changed.charitableCarryoverSources) throw new Error("Missing actual synthetic source history");
  changed.charitableCarryoverSources.primaryTaxpayerIdLast4 = "0000";
  await expect(fillScheduleA(changed, result, "missing.pdf")).rejects.toThrow(/charitable.*(identity|source)|original.*source/i);
  await expect(fillScheduleA(changed, result, "missing.pdf", token)).rejects.toThrow(/charitable.*(identity|source)/i);
  const redacted = redactReviewIdentifiers(input);
  await expect(fillScheduleA(redacted, result, "missing.pdf")).rejects.toThrow(/identity/i);
  await expect(fillScheduleA(redacted, result, "missing.pdf", {} as PreparedCharitableReview)).rejects.toThrow(/original.*source/i);
  const partial = structuredClone(input);
  partial.taxpayer.primary.ssn = "";
  await expect(fillScheduleA(partial, result, "missing.pdf", token)).rejects.toThrow(/source.*identity/i);
  const doc = await fillScheduleA(redacted, result, "forms/blank/2025/f1040sa.pdf", token);
  const reopened = await PDFDocument.load(await doc.save());
  expect(reopened.getForm().getTextField(F.ssn).getText()).toBeUndefined();
  expect(reopened.getForm().getTextField(F.line13).getText()).toBe("5000");
  expect(JSON.stringify(input)).toBe(original);
});
it("forwards prepared charity history through the redacted review packet", async () => {
  const input = charitableCarryoverFixture();
  input.deductionElection = "itemized";
  const result = calculateFederalTax(input), token = prepareCharitableReview(input);
  const original = JSON.stringify(input), directory = await mkdtemp(join(tmpdir(), "charitable-review-"));
  try {
    const packet = await fillReturn(redactReviewIdentifiers(input), result, {
      charitableReview: token, outputDir: directory, blankFormsDir: "forms/blank/2025", flatten: false,
    });
    const path = packet.filledForms.find(file => file.endsWith("f1040sa-filled.pdf"));
    expect(path).toBeDefined();
    if (!path) throw new Error("Missing actual ScheduleA review packet");
    const reopened = await PDFDocument.load(await readFile(path));
    expect(reopened.getForm().getTextField(F.ssn).getText()).toBeUndefined();
    expect(reopened.getForm().getTextField(F.line13).getText()).toBe("5000");
    expect(JSON.stringify(input)).toBe(original);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
