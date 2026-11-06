/** Spec: spec/federal/savings-bond-reissue-return.yaml private-review. */
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
import { savingsBondReissueReturnInput, savingsBondReissueHalfDollarInput } from "../fixtures/savings-bond-reissue-return.js";

it("binds original bond history and income before saved review output", async () => {
  const input = savingsBondReissueReturnInput(true), before = JSON.stringify(input), result = calculateFederalTax(input);
  const context = prepareSavingsBondReview(input), directory = await mkdtemp(join(tmpdir(), "bond-history-pdf-"));
  try {
    for (const kind of ["income", "prior", "owner", "statement", "removed", "amount", "audit", "serialized"]) {
      const changed = structuredClone(input), group = changed.form8815?.reissueSources?.groups?.[0];
      const statement = changed.form8815?.reissueSources?.statements?.[0], w2 = changed.w2s[0];
      if (!group || !statement || !w2 || !result.form8815) throw new Error("Missing fictional originals");
      if (kind === "income") w2.wages = "200000";
      if (kind === "prior") group.taxpayerPreviouslyReportedInterest = "1";
      if (kind === "owner") changed.taxpayer.primary.lastName = "Changed";
      if (kind === "statement") statement.box3 = "501";
      if (kind === "removed" && changed.form8815) delete changed.form8815.reissueSources;
      const forged = kind === "amount" ? { ...result, form8815: { ...result.form8815, totalInterest: new Decimal(401) } }
        : kind === "audit" ? { ...result, form8815: { ...result.form8815, lines: result.form8815.lines.map(row => row.line === "current-reissue-interest" ? { ...row, value: new Decimal(0) } : row) } } : result;
      const outputDir = join(directory, kind);
      await expect(fillReturn(redactReviewIdentifiers(changed), redactReviewIdentifiers(forged), {
        blankFormsDir: "forms/blank/2025", outputDir, savingsBondReview: kind === "serialized" ? JSON.parse(JSON.stringify(context)) : context,
      })).rejects.toThrow(/bond|source|history|original|reconcile/i);
      await expect(access(outputDir)).rejects.toThrow();
    }
    const outputDir = join(directory, "actual");
    await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), { blankFormsDir: "forms/blank/2025", outputDir, savingsBondReview: context });
    const read = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c",
      'import json,sys;from pypdf import PdfReader;a=PdfReader(sys.argv[1]);b=PdfReader(sys.argv[2]);print(json.dumps({"fields":{k:str(v.get("/V","")) for k,v in a.get_fields().items()},"pages":[p.extract_text() or "" for p in b.pages]}))',
      join(outputDir, "f1040-filled.pdf"), join(outputDir, "f8815-reference-filled.pdf")], { encoding: "utf8", timeout: 30000 })) as { fields: Record<string,string>; pages: string[] };
    expect([read.fields[F1040.line2b], read.fields[F1040.line11], read.fields[F1040.primarySSN]]).toEqual(["100", "80100", ""]);
    const text = read.pages.join(" ").replace(/\s+/g, " ");
    expect(text).toContain("Current transfer interest separated from redemption interest");
    expect(text).toContain("Statement 1 original Box 3: $500");
    expect(text).toContain("Group 1 primary transfer recognized: $100");
    for (const page of read.pages) expect(page).toContain("FOR REVIEW ONLY - NOT FOR FILING");
    for (const secret of ["900-70-3101", "3101", "EE-FICTIONAL", "FICTIONAL-BOND-ACCOUNT", "Fictional original Box3"]) expect(text).not.toContain(secret);
    expect(JSON.stringify(input)).toBe(before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it("saves half-dollar source amounts before reported exclusion rounding", async () => {
  const input = savingsBondReissueHalfDollarInput(), before = JSON.stringify(input), result = calculateFederalTax(input);
  const directory = await mkdtemp(join(tmpdir(), "bond-half-dollar-pdf-"));
  try {
    await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), {
      blankFormsDir: "forms/blank/2025", outputDir: directory, savingsBondReview: prepareSavingsBondReview(input),
    });
    const read = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c",
      'import json,sys;from pypdf import PdfReader;a=PdfReader(sys.argv[1]);b=PdfReader(sys.argv[2]);print(json.dumps({"fields":{k:str(v.get("/V","")) for k,v in a.get_fields().items()},"text":" ".join(p.extract_text() or "" for p in b.pages)}))',
      join(directory, "f1040-filled.pdf"), join(directory, "f8815-reference-filled.pdf")], { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] })) as { fields: Record<string,string>; text: string };
    expect([read.fields[F1040.line2b], read.fields[F1040.line11]]).toEqual(["", "80000"]);
    const text = read.text.replace(/\s+/g, " ");
    expect(text).toContain("Current-year interest: 1 / 2 (exact)");
    expect(text).toContain("Group 1 primary transfer recognized: $1 / 2 (exact)");
    expect(text).toContain("Schedule B Line 3 exclusion: 1");
    expect(text).toContain("Statement 1 original Box 3: $1");
    expect(JSON.stringify(input)).toBe(before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
