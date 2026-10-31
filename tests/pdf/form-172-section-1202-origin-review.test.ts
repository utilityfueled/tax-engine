// Spec: spec/federal/form-172-section-1202-origin.yaml review.
import { expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "../helpers/file-stdin-exec";
import { calculateFederalTax } from "@/engine/federal.js";
import { buildNetOperatingLossReview } from "@/pdf/fill-net-operating-loss.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { prepareForm8949Review, form8949ReviewCalculation, form8949ReviewOriginalSourceInput, type PreparedForm8949Review } from "@/pdf/form-8949-review-context.js";
import { d } from "@/utils/decimal.js";
import { qsbsOriginInput } from "../fixtures/form-172-section-1202-origin.js";

function required<T>(value: T | undefined): T { if (value === undefined) throw new Error("Missing actual synthetic source"); return value; }

it("rechecks original QSBS exclusion and separate origin traces in the review statement", () => {
  const source = qsbsOriginInput(), result = calculateFederalTax(source), token = prepareForm8949Review(source), redacted = redactReviewIdentifiers(source);
  const rows = buildNetOperatingLossReview(redacted, result, token).join(" ");
  expect(rows).toContain("Current regular PartI loss 80000");
  expect(rows).toContain("Current alternative PartI loss 74000");
  expect(rows).toContain("Actual source section1202 exclusion: 500.125");
  expect(rows).not.toContain("ORIGINAL-QSBS-ACCOUNT");
  if (!result.form172 || !redacted.section1202Sources) throw new Error("Missing actual synthetic QSBS origin");
  result.form172.alternativeTax.sourcePartI[17] = d("500.12");
  expect(() => buildNetOperatingLossReview(redacted, result, token)).toThrow(/reconcile/);
  result.form172.alternativeTax.sourcePartI[17] = d("500.125");
  redacted.section1202Sources.lots[0].recognizedGain = "1000.26";
  expect(() => buildNetOperatingLossReview(redacted, result, token)).toThrow(/stale|source/);
  redacted.section1202Sources.lots[0].recognizedGain = "1000.25";
  expect(() => buildNetOperatingLossReview(redacted, result)).toThrow();
  expect(() => buildNetOperatingLossReview(redacted, result, {} as PreparedForm8949Review)).toThrow(/prepared.*context/);
  const original = form8949ReviewOriginalSourceInput(redacted, token);
  required(original.section1202Sources).lots[0].recognizedGain = "1000.26";
  expect(buildNetOperatingLossReview(redacted, result, token).join(" ")).toBe(rows);
  const computation = form8949ReviewCalculation(redacted, token);
  expect(() => { required(computation.section1202).exclusion = d("0"); }).toThrow();
  for (const change of [
    (input: typeof redacted) => { required(input.scheduleDSpecialGainSources).priorLongTermCapitalLoss = "-1"; },
    (input: typeof redacted) => { input.amtCapitalGains = { sourceTaxYear: 2025 }; },
    (input: typeof redacted) => { input.priorYear = { ...input.priorYear, longTermCapitalLoss: "-1" } as typeof input.priorYear; },
    (input: typeof redacted) => { required(required(required(input.form172).capitalSources).transactions)[0].accountReference = "changed"; },
    (input: typeof redacted) => { input.taxpayer.taxYear = 2024; },
    (input: typeof redacted) => { input.form1099B[0].accountHolder = "spouse"; },
  ]) {
    const changed = structuredClone(redacted); change(changed);
    expect(() => form8949ReviewOriginalSourceInput(changed, token)).toThrow(/stale|source/);
  }
});

it("saves source-validated QSBS origin statements through the redacted return packet", async () => {
  const source = qsbsOriginInput(), result = calculateFederalTax(source);
  const directory = await mkdtemp(join(tmpdir(), "qsbs-origin-review-"));
  try {
    const packet = await fillReturn(source, result, { blankFormsDir: "forms/blank/2025", outputDir: directory });
    const path = packet.filledForms.find(file => file.endsWith("nol-carry-review.pdf"));
    if (!path) throw new Error("Missing current QSBS origin review statement");
    const bytes = await readFile(path);
    const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c",
      "import sys,json,io; from pypdf import PdfReader; print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
    { input: bytes, encoding: "utf8" })) as string[];
    for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
    const text = pages.join(" ").replace(/\s+/g, " ");
    expect(text).toContain("Current regular PartI loss 80000");
    expect(text).toContain("Current alternative PartI loss 74000");
    expect(text).toContain("Actual source section1202 exclusion: 500.125");
    expect(text).not.toContain("ORIGINAL-QSBS-ACCOUNT");
    expect(text).not.toContain(source.taxpayer.primary.ssn);
    expect(text).not.toContain(source.form172?.sourceReference);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
