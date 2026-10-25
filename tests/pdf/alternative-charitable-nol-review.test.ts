// Spec: alternative-charitable-net-operating-loss.yaml review.
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { buildNetOperatingLossReview, fillNetOperatingLossReview } from "@/pdf/fill-net-operating-loss.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { alternativeCharitableNolInput } from "../fixtures/alternative-charitable-nol.js";

it("renders separately reconciled alternative charity carry without source identifiers", async () => {
  const input = alternativeCharitableNolInput(); const result = calculateFederalTax(input);
  const redacted = redactReviewIdentifiers(input);
  const text = buildNetOperatingLossReview(redacted, result).join(" ");
  expect(text).toContain("Current alternative charitable carry: tentative 1800; NOL-related reduction 1620; remaining 180");
  expect(text).toContain("actual 64000; without excess contributions 62380");
  expect(text).toContain("Counterfactual modified AMTI: 41800");
  expect(text).toContain("claimed 34920; absorbed 37620; expired 0; remaining 62380");
  expect(text).toContain("Current regular charitable carry: 1800");
  const directory = await mkdtemp(join(tmpdir(), "alternative-charity-review-"));
  try {
    const path = await fillNetOperatingLossReview(redacted, result, directory); const bytes = await readFile(path);
    const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c",
      "import sys,json,io;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
    { input: bytes, encoding: "utf8" })) as string[];
    for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
    const saved = pages.join(" ").replace(/\s+/g, " ");
    expect(saved).toContain("remaining 180"); expect(saved).toContain("62380");
    for (const privateText of ["6789", "independent-amt2021", "Actual separate regular and AMT charity histories", input.donations[0].organization]) expect(saved).not.toContain(privateText);
  } finally { await rm(directory, { recursive: true, force: true }); }
  redacted.donations[0].amount = "60001";
  expect(() => buildNetOperatingLossReview(redacted, result)).toThrow(/source|reconcile/);
  const comparison = result.netOperatingLoss?.alternativeCharitableCounterfactual;
  if (!comparison) throw new Error("Missing synthetic alternative comparison");
  comparison.calculation.absorbed = comparison.calculation.absorbed.plus(1);
  expect(() => buildNetOperatingLossReview(input, result)).toThrow(/reconcile/);
});

it("does not accept removed or duplicated alternative charitable audits", () => {
  for (const change of ["missing-result", "missing-audit", "duplicate-audit", "changed-output", "changed-history"] as const) {
    const input = alternativeCharitableNolInput(2025, true); const result = calculateFederalTax(input);
    if (!result.netOperatingLoss) throw new Error("Missing synthetic loss result");
    const line = result.allLines.find(row => row.form === "Section170 Alternative NOL Carry Worksheet" && row.line === "remaining");
    if (!line) throw new Error("Missing synthetic alternative carry audit");
    if (change === "missing-result") result.netOperatingLoss.alternativeCharitableCarryover = undefined;
    if (change === "missing-audit") result.allLines = result.allLines.filter(row => row !== line);
    if (change === "duplicate-audit") result.allLines.push({ ...line });
    if (change === "changed-output") result.carryforwards.amtCharitableContributions = line.value.plus(1);
    if (change === "changed-history" && input.netOperatingLoss?.alternativeTax) input.netOperatingLoss.alternativeTax.charitableCarryoverHistory = undefined;
    expect(() => buildNetOperatingLossReview(input, result)).toThrow(/alternative|charit|reconcile|unique/i);
  }
});
