/** Spec: spec/federal/educator-bond-rational-magi.yaml original-review. */
import Decimal from "decimal.js";
import { execFileSync } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { prepareSavingsBondReview } from "@/pdf/savings-bond-review-context.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { FORM_1040_FIELDS as F1040 } from "@/pdf/fill-form-1040.js";
import { educatorBondThirdsInput } from "../fixtures/educator-bond-rational-magi.js";

it("binds actual educator ownership and MAGI before saved review output", async () => {
  const input = educatorBondThirdsInput(), before = JSON.stringify(input), result = calculateFederalTax(input);
  const context = prepareSavingsBondReview(input), directory = await mkdtemp(join(tmpdir(), "educator-bond-review-"));
  try {
    for (const kind of ["income", "owner", "funds", "receipt", "method", "audit", "serialized"]) {
      const changed = structuredClone(input), source = changed.adjustments?.educatorExpenseSources?.[0], w2 = changed.w2s[0], bond = changed.savingsBondRedemptions?.[0];
      if (!source?.expenses?.[0] || !w2 || !bond?.incomeOwnership) throw new Error("Missing actual fictional sources");
      if (kind === "income") w2.wages = "200000";
      if (kind === "owner") changed.taxpayer.primary.lastName = "Changed";
      if (kind === "funds") bond.incomeOwnership.taxpayerPurchaseFunds = "1001";
      if (kind === "receipt") source.expenses[0].amount = "401";
      if (kind === "method") delete source.savingsBondReductionMethod;
      const forged = kind === "audit" ? { ...result, allLines: result.allLines.map(line => line.form === "Form 8815 MAGI Worksheet" ? { ...line, value: new Decimal(0) } : line) } : result;
      const outputDir = join(directory, kind);
      await expect(fillReturn(redactReviewIdentifiers(changed), redactReviewIdentifiers(forged), {
        blankFormsDir: "forms/blank/2025", outputDir, savingsBondReview: kind === "serialized" ? JSON.parse(JSON.stringify(context)) : context,
      })).rejects.toThrow(/bond|source|original|reconcile/i);
      await expect(access(outputDir)).rejects.toThrow();
    }
    const outputDir = join(directory, "actual");
    await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), { blankFormsDir: "forms/blank/2025", outputDir, savingsBondReview: context });
    const read = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c",
      'import json,sys;from pypdf import PdfReader;a=PdfReader(sys.argv[1]);b=PdfReader(sys.argv[2]);print(json.dumps({"fields":{k:str(v.get("/V","")) for k,v in a.get_fields().items()},"pages":[p.extract_text() or "" for p in b.pages]}))',
      join(outputDir, "f1040-filled.pdf"), join(outputDir, "f8815-reference-filled.pdf")], { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] })) as { fields: Record<string, string>; pages: string[] };
    expect([read.fields[F1040.line2b], read.fields[F1040.line10], read.fields[F1040.line11], read.fields[F1040.primarySSN]]).toEqual(["", "200", "79800", ""]);
    const text = read.pages.join(" ").replace(/\s+/g, " ");
    for (const literal of ["Primary educator excluded bond interest: 1000 / 3 (exact)", "Spouse educator excluded bond interest: 2000 / 3 (exact)", "Educator deduction for Form 8815 MAGI: 600", "Final Schedule 1 educator deduction: 200"]) expect(text).toContain(literal);
    for (const page of read.pages) expect(page.split("FOR REVIEW ONLY - NOT FOR FILING")).toHaveLength(2);
    for (const secret of ["900-70-3101", "900703101", "Fictional actual purchase", "primary-receipt", "Fictional primary school"]) expect(text).not.toContain(secret);
    expect(JSON.stringify(input)).toBe(before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
