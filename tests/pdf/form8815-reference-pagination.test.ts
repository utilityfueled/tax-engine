// Spec: spec/federal/pdf-review-policy.yaml form8815-reference-pagination.
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm8815Reference } from "@/pdf/fill-form-8815.js";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import { actualSavingsBondData } from "../fixtures/guided-savings-bond.js";

it("keeps every wrapped Form8815 audit line above the review footer", async () => {
  const facts = actualSavingsBondData();
  const input = TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, primary: {
      ...simpleW2Fixture.taxpayer.primary, firstName: "Jordan", lastName: "Example", ssn: "111-22-3333", dateOfBirth: "1990-02-15",
    } },
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: "50000" }],
    form1099Int: [{ payer: "Synthetic Treasury", interestIncome: "0", usSavingsBondInterest: "2000" }],
    savingsBondRedemptions: facts.redemptions,
    form8815: { ...facts, educationExpenses: facts.educationExpenses.map(row => ({ ...row, paidTaxYear: 2025 })) },
  });
  const result = calculateFederalTax(input).form8815;
  if (!result) throw new Error("Expected original bond calculation");
  expect(result.excludableSavingsBondInterest.toFixed()).toBe("1500");
  // A renderer must preserve an audited explanation even when it spans a page.
  // The extra narrative changes no input, amount, calculation or audit identity.
  const explanation = Array.from({ length: 900 }, (_, index) => `source-detail-${String(index).padStart(4, "0")}`).join(" ");
  const detailed = { ...result, lines: result.lines.map(line => line.line === "2" ? { ...line, formula: explanation } : line) };
  const output = await mkdtemp(join(tmpdir(), "tax-8815-pagination-"));
  try {
    const path = await fillForm8815Reference(input.savingsBondRedemptions, detailed, output);
    const pages: Array<{ text: string; body: Array<{ text: string; x: number; y: number }> }> = JSON.parse(execFileSync(
      process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c", `
import json,sys
from pypdf import PdfReader
pages=[]
for page in PdfReader(sys.argv[1]).pages:
    body=[]
    def visit(text,cm,tm,font,size):
        if text.strip() and text.strip()!=sys.argv[2]:
            body.append({"text":text.strip(),"x":tm[4],"y":tm[5]})
    text=page.extract_text(visitor_text=visit)
    pages.append({"text":text,"body":body})
print(json.dumps(pages))
`, path, REVIEW_PDF_NOTICE], { encoding: "utf8", timeout: 5000 },
    ));
    for (const page of pages) {
      expect(page.text.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
      expect(page.body.length).toBeGreaterThan(0);
      for (const line of page.body) {
        expect(line.y, line.text).toBeGreaterThanOrEqual(40);
        expect(line.y, line.text).toBeLessThanOrEqual(752);
      }
    }
    expect(pages.length).toBeGreaterThan(3);
    const text = pages.map(page => page.text.replace(REVIEW_PDF_NOTICE, "")).join(" ").replace(/\s+/g, " ");
    expect(text).toContain(explanation);
    expect(text).toContain("Schedule B Line 3 exclusion: 1500");
    expect(result.lines.find(line => line.line === "2")?.formula).not.toBe(explanation);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
