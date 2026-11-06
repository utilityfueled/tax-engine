// Spec: spec/federal/marketplace-nonspecified-stop.yaml.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm7206, FORM_7206_FIELDS as F, assertForm7206ReviewSource } from "@/pdf/fill-form-7206.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { marketplaceNonspecifiedStopInput } from "../fixtures/marketplace-nonspecified-stop.js";

it("saves the completed nonspecified forms and rejects stale stopping sources before IO", async () => {
  const input = marketplaceNonspecifiedStopInput(true), before = JSON.stringify(input);
  const result = calculateFederalTax(input), render = redactReviewIdentifiers(input);
  const directory = mkdtempSync(join(tmpdir(), "health-nonspecified-stop-review-"));
  try {
    for (const [source, owner, claim] of [["scheduleC", "primary", "4646"], ["scheduleF", "spouse", "3000"]] as const) {
      const pdf = await fillForm7206(render, result, "forms/blank/2025/f7206.pdf", source, owner);
      const bytes = await pdf.save(), reopened = await PDFDocument.load(bytes), fields = reopened.getForm();
      expect(fields.getTextField(F.line14).getText()).toBe(claim);
      expect(fields.getTextField(F.ssn).getText() ?? "").toBe("");
      const path = join(directory, `${source}.pdf`); writeFileSync(path, bytes);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c",
        "from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", path], { encoding: "utf8", timeout: 5000 }));
      const text = pages.join(" ").replace(/\s+/g, " ");
      expect(text).toContain("Return-level Schedule 1 line 17 transfer: $7646");
      expect(text).toContain("NONSPECIFIED STOP");
      expect(text).toContain("No Worksheets W/X or retained special-order deductions apply.");
      expect(text).not.toContain("Pub974 Worksheet W line");
      expect(text).not.toMatch(/Step\s?2 credit/);
      expect(text).toContain("not a separate deduction for this business");
      for (const page of pages) {
        expect(page.split("FOR REVIEW ONLY - NOT FOR FILING")).toHaveLength(2);
        expect(page).not.toMatch(/123.?45.?6789|999.?88.?7777|6789|7777/);
      }
    }
    const changed = structuredClone(input), payment = changed.form7206?.plans?.find(row => row.planId === "proprietor-nonspecified")?.payments?.[0];
    if (!payment?.personAmounts) throw new Error("Missing actual source");
    payment.grossPremium = "499.99"; payment.ownerOrBusinessPaid = "499.99"; payment.personAmounts[0].amountPaid = "499.99";
    expect(() => assertForm7206ReviewSource(changed, result)).toThrow(/source|reconcile|paid/i);
    await expect(fillForm7206(changed, result, "missing-template.pdf", "scheduleC", "primary")).rejects.toThrow(/source|reconcile|paid/i);
    result.allLines = result.allLines.filter(row => !row.form.startsWith("Pub974 Nonspecified Stop"));
    expect(() => assertForm7206ReviewSource(input, result)).toThrow(/source|audit|reconcile/i);
    expect(JSON.stringify(input)).toBe(before);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
