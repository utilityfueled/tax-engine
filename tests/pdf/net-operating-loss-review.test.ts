// Spec: spec/federal/net-operating-loss-return.yaml review-statement/source-conservation.
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { PDFDocument } from "pdf-lib";
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm6251, FORM_6251_FIELDS as F } from "@/pdf/fill-form-6251.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { buildNetOperatingLossReview, fillNetOperatingLossReview } from "@/pdf/fill-net-operating-loss.js";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { actualNolInput } from "../fixtures/net-operating-loss.js";

function fixture() {
  const source = actualNolInput("100000");
  const regular = source.netOperatingLoss?.vintages?.[0];
  if (!regular || !source.netOperatingLoss?.alternativeTax) throw new Error("Missing synthetic source");
  source.netOperatingLoss.alternativeTax.vintages = [{ ...regular, sourceId: "amt-2021", section1411OriginalLoss: undefined }];
  return source;
}
it("retains both actual carry ledgers and maps the parenthesized ATNOL once", async () => {
  const input = fixture(); const result = calculateFederalTax(input);
  const source = redactReviewIdentifiers(input);
  const summary = buildNetOperatingLossReview(source, result);
  expect(summary.join(" ")).toContain("Regular NOL: claimed 65000; absorbed 67400; expired 0; remaining 32600");
  expect(summary.join(" ")).toContain("Alternative NOL: claimed 87300; absorbed 90000; expired 0; remaining 10000");
  const doc = await fillForm6251(source, result, "forms/blank/2025/f6251.pdf");
  const reopened = await PDFDocument.load(await doc.save());
  expect(reopened.getForm().getTextField(F.line2e).getText()).toBe("65000");
  expect(reopened.getForm().getTextField(F.line2f).getText()).toBe("87300");
  const directory = await mkdtemp(join(tmpdir(), "nol-review-"));
  try {
    const path = await fillNetOperatingLossReview(source, result, directory);
    const bytes = await readFile(path);
    const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c",
      "import sys,json,io; from pypdf import PdfReader; print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
    { input: bytes, encoding: "utf8" })) as string[];
    for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
    const text = pages.join(" ").replace(/\s+/g, " ");
    expect(text).toContain("87300"); expect(text).toContain("10000");
    expect(text).not.toContain("6789"); expect(text).not.toContain("Actual filed carry packet");
    const packet = await fillReturn(source, result, { blankFormsDir: "forms/blank/2025", outputDir: join(directory, "packet") });
    expect(packet.filledForms.some(path => path.endsWith("nol-carry-review.pdf"))).toBe(true);
    expect(packet.filledForms.some(path => path.endsWith("f6251-filled.pdf"))).toBe(true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
it("rejects changed sources and inconsistent retained carry calculations", async () => {
  const input = fixture(); const result = calculateFederalTax(input);
  const row = input.netOperatingLoss?.vintages?.[0];
  if (!row || !result.netOperatingLoss) throw new Error("Missing synthetic source");
  row.openingCarryforward = "99999";
  expect(() => buildNetOperatingLossReview(input, result)).toThrow(/source|reconcile/);
  row.openingCarryforward = "100000";
  result.netOperatingLoss.alternativeTax.carryforward = result.netOperatingLoss.alternativeTax.carryforward.plus(1);
  expect(() => buildNetOperatingLossReview(input, result)).toThrow(/reconcile/);
  await expect(fillForm6251(input, result, "forms/blank/2025/f6251.pdf")).rejects.toThrow(/reconcile/);
  const cents = fixture(); cents.w2s[0].wages = "100000.49";
  const rounded = calculateFederalTax(cents);
  expect(rounded.form6251?.amti.toFixed()).toBe("9700.49");
  expect(() => buildNetOperatingLossReview(cents, rounded)).not.toThrow();
});
