/** Spec: spec/federal/educator-bond-reissue-coordination.yaml original-review. */
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
import { educatorSoleSuccessorInput } from "../fixtures/educator-bond-reissues.js";

it("binds actual successor income and educator originals before saved review output", async () => {
  const input = educatorSoleSuccessorInput(), before = JSON.stringify(input), result = calculateFederalTax(input);
  const context = prepareSavingsBondReview(input), directory = await mkdtemp(join(tmpdir(), "educator-reissue-review-"));
  try {
    for (const kind of ["income", "owner", "history", "receipt", "audit", "serialized"]) {
      const changed = structuredClone(input), source = changed.adjustments?.educatorExpenseSources?.[1], w2 = changed.w2s[0], group = changed.form8815?.reissueSources?.groups?.[0];
      if (!source?.expenses?.[0] || !w2 || !group || !changed.taxpayer.spouse) throw new Error("Missing actual fictional sources");
      if (kind === "income") w2.wages = "200000";
      if (kind === "owner") changed.taxpayer.spouse.lastName = "Changed";
      if (kind === "history") group.valueAtReissue = "4001";
      if (kind === "receipt") source.expenses[0].amount = "1801";
      const forged = kind === "audit" ? { ...result, allLines: result.allLines.map(line => line.form === "Educator education exclusions" ? { ...line, value: new Decimal(0) } : line) } : result;
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
    expect([read.fields[F1040.line2b], read.fields[F1040.line10], read.fields[F1040.line11], read.fields[F1040.primarySSN]]).toEqual(["333", "233", "80100", ""]);
    const text = read.pages.join(" ").replace(/\s+/g, " ");
    for (const literal of ["Primary educator excluded bond interest: 0", "Spouse educator excluded bond interest: 5000 / 3 (exact)", "Educator deduction for Form 8815 MAGI: 400", "Final Schedule 1 educator deduction: 233"]) expect(text).toContain(literal);
    for (const page of read.pages) expect(page.split("FOR REVIEW ONLY - NOT FOR FILING")).toHaveLength(2);
    for (const secret of ["900-70-3101", "900703101", "Fictional actual purchase", "primary-receipt", "Fictional primary school", "FICTIONAL-BOND-ACCOUNT"]) expect(text).not.toContain(secret);
    expect(JSON.stringify(input)).toBe(before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
