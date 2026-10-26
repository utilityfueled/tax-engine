// Spec: spec/federal/marketplace-health-negative-limit.yaml.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { d } from "@/utils/decimal.js";
import { fillForm7206, FORM_7206_FIELDS as F, assertForm7206ReviewSource } from "@/pdf/fill-form-7206.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { marketplaceHealthNegativeLimitInput } from "../fixtures/marketplace-health-negative-limit.js";

it("preserves original forms and the signed combined claim before review output", async () => {
  const input = marketplaceHealthNegativeLimitInput(), original = JSON.stringify(input), result = calculateFederalTax(input);
  const directory = mkdtempSync(join(tmpdir(), "negative-w15-review-"));
  try {
    for (const sourceId of ["scheduleC", "scheduleF"]) {
      const pdf = await fillForm7206(redactReviewIdentifiers(input), result, "forms/blank/2025/f7206.pdf", sourceId, "primary");
      const bytes = await pdf.save(), reopened = await PDFDocument.load(bytes);
      expect(reopened.getForm().getTextField(F.line14).getText()).toBe(sourceId === "scheduleC" ? "0" : "6000");
      expect(reopened.getForm().getTextField(F.ssn).getText() ?? "").toBe("");
      const path = join(directory, `${sourceId}.pdf`); writeFileSync(path, bytes);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c", "from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", path], { encoding: "utf8", timeout: 5000 }));
      const text = pages.join(" ").replace(/\s+/g, " ");
      for (const value of ["SIGNED COMBINED WORKSHEET LIMIT", "Pub974 Worksheet W line 15: $-1353.4", "Return-level Schedule 1 line 17 transfer: $4647", "not a separate negative deduction", "929.32", "3717.28"]) expect(text).toContain(value);
      for (const page of pages) {
        expect(page.split("FOR REVIEW ONLY - NOT FOR FILING")).toHaveLength(2);
        expect(page).not.toMatch(/123.?45.?6789|6789/);
      }
    }
    const altered = structuredClone(input);
    if (!altered.scheduleC) throw new Error("Missing source");
    altered.scheduleC.grossReceipts = "5000.01";
    await expect(fillForm7206(altered, result, "/does-not-exist.pdf", "scheduleC", "primary")).rejects.toThrow(/source|audit|reconcile/i);
    const copies = [result.form7206?.lines, result.allLines];
    for (const rows of copies) {
      const c = rows?.find(row => row.form === "Pub974 QBI Allocation" && row.line === "scheduleC");
      const f = rows?.find(row => row.form === "Pub974 QBI Allocation" && row.line === "scheduleF");
      if (!c || !f) throw new Error("Missing retained actual QBI source");
      c.value = d(1000); f.value = d("3646.6");
    }
    expect(() => assertForm7206ReviewSource(input, result)).toThrow(/source|audit|reconcile/i);
    expect(JSON.stringify(input)).toBe(original);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
