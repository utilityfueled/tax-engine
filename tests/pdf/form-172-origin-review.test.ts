// Spec: spec/federal/form-172-return.yaml current-origin-review.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { buildNetOperatingLossReview, fillNetOperatingLossReview } from "@/pdf/fill-net-operating-loss.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { currentOriginInput } from "../fixtures/form-172-origin.js";
import { d } from "@/utils/decimal.js";
import { PDFDocument } from "pdf-lib";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

it("preserves current origins and separate closing carries in the redacted review statement", async () => {
  const input = currentOriginInput("500000"), result = calculateFederalTax(input);
  const source = redactReviewIdentifiers(input);
  const rows = buildNetOperatingLossReview(source, result), text = rows.join(" ");
  expect(text).toContain("Current regular PartI loss 293000; current EBL carry 187000; total regular closing carry 480000");
  expect(text).toContain("Current alternative PartI loss 288000; current EBL carry 187000; total alternative closing carry 475000");
  expect(text).toContain("Current section1411 original loss 0");
  expect(text).toContain("Regular current Form172 line24: -293000");
  expect(text).not.toContain("Actual complete current income and expense sources");
  expect(text).not.toContain(input.taxpayer.primary.ssn);
  const directory = await mkdtemp(join(tmpdir(), "current-origin-review-"));
  try {
    const output = await fillNetOperatingLossReview(source, result, directory);
    expect((await PDFDocument.load(await readFile(output))).getPageCount()).toBeGreaterThan(1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it("rejects stale current origin sources and changed retained amounts", () => {
  const input = currentOriginInput(), result = calculateFederalTax(input);
  if (!result.form172 || !input.scheduleC?.expenses) throw new Error("Missing synthetic current origin");
  input.scheduleC.expenses.otherExpenses = "99999";
  expect(() => buildNetOperatingLossReview(input, result)).toThrow(/current|source|reconcile/);
  input.scheduleC.expenses.otherExpenses = "100000";
  result.form172.regular.partI[24] = d("-79999");
  expect(() => buildNetOperatingLossReview(input, result)).toThrow(/current|origin|reconcile/);
  const fresh = calculateFederalTax(input);
  fresh.carryforwards.alternativeTaxNolCarryforward = d("75001");
  expect(() => buildNetOperatingLossReview(input, fresh)).toThrow(/reconcile/);
  const duplicate = calculateFederalTax(input);
  const line = duplicate.allLines.find(row => row.form === "172 Part I" && row.line === "24");
  if (!line) throw new Error("Missing synthetic origin audit");
  duplicate.allLines.push(line);
  expect(() => buildNetOperatingLossReview(input, duplicate)).toThrow(/unique/);
  const missing = calculateFederalTax(input);
  input.form172 = undefined;
  expect(() => buildNetOperatingLossReview(input, missing)).toThrow(/current origin sources/);
});
