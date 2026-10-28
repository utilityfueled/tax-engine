// Spec: spec/federal/marketplace-health-separate-owners.yaml.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm7206, FORM_7206_FIELDS as F } from "@/pdf/fill-form-7206.js";
import { preparePremiumTaxCreditReview } from "@/pdf/premium-tax-credit-review-context.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { assertMarketplaceHealthReviewSources } from "@/pdf/mappings/2025/form-7206-marketplace-source.js";
import { calculateForm7206ReviewSources } from "@/pdf/mappings/2025/form-7206-business-source.js";
import { separateOwnerMarketplaceHealthInput } from "../fixtures/marketplace-health-separate-owners.js";

it("saves each original business and the single combined health deduction", async () => {
  const input = separateOwnerMarketplaceHealthInput(), before = JSON.stringify(input), result = calculateFederalTax(input);
  const context = preparePremiumTaxCreditReview(input), render = redactReviewIdentifiers(input);
  const directory = mkdtempSync(join(tmpdir(), "health-separate-owner-pdf-"));
  try {
    for (const [index, owner, earned, deduction] of [[0, "primary", "40000", "0"], [1, "spouse", "40000", "0"], [2, "primary", "10000", "2400"]] as const) {
      const doc = await fillForm7206(render, redactReviewIdentifiers(result), "forms/blank/2025/f7206.pdf", `formW2:${index}`, owner, undefined, context);
      const bytes = await doc.save(), reopened = await PDFDocument.load(bytes), form = reopened.getForm();
      expect(form.getTextField(F.line11).getText()).toBe(earned);
      expect(form.getTextField(F.line14).getText()).toBe(deduction);
      expect(form.getTextField(F.ssn).getText() ?? "").toBe("");
      const path = join(directory, `original-${index}.pdf`); writeFileSync(path, bytes);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c",
        'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', path],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 }));
      const text = pages.join(" ").replace(/\s+/g, " ");
      for (const literal of ["Return-level Schedule 1 line 17 transfer: $7050", "Pub974 Worksheet W line 13: $80000", "Pub974 Worksheet W line 14: $2400", "Pub974 Worksheet W line 15: $77600", "The other business deduction reduces the published historical limit; its earnings are not borrowed."]) expect(text).toContain(literal);
      expect(text).toContain(`business source formW2:${index}; owner ${owner}`);
      for (const page of pages) {
        expect(page.split("FOR REVIEW ONLY - NOT FOR FILING")).toHaveLength(2);
        expect(page).not.toMatch(/123.?45.?6789|555.?55.?5555/);
      }
    }
    expect(JSON.stringify(input)).toBe(before);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it("rejects equal-total owner and original source rewrites before PDF I/O", async () => {
  const input = separateOwnerMarketplaceHealthInput(), result = calculateFederalTax(input), context = preparePremiumTaxCreditReview(input);
  const changed = structuredClone(input);
  changed.w2s[0].medicareWages = "39999.99";
  changed.w2s[1].medicareWages = "40000.01";
  await expect(fillForm7206(redactReviewIdentifiers(changed), redactReviewIdentifiers(result), "/missing-original-template", "formW2:0", "primary", undefined, context)).rejects.toThrow(/source|stale|conflict|reconcile/i);
  const forged = calculateFederalTax(input);
  const rows = forged.marketplaceHealthInsurance?.businesses;
  if (!rows?.[0] || !rows[1]) throw new Error("Missing actual Marketplace businesses");
  rows[0].allocatedCredit = rows[0].allocatedCredit.plus(".01");
  rows[1].allocatedCredit = rows[1].allocatedCredit.minus(".01");
  await expect(fillForm7206(redactReviewIdentifiers(input), redactReviewIdentifiers(forged), "/missing-original-template", "formW2:0", "primary", undefined, context)).rejects.toThrow(/source|allocation|calculation|reconcile/i);
});

it("rejects missing duplicate and altered owner residual proofs", () => {
  const input = separateOwnerMarketplaceHealthInput(), result = calculateFederalTax(input);
  const original = calculateForm7206ReviewSources(input, result);
  const check = (candidate: typeof result) => assertMarketplaceHealthReviewSources(input, candidate, original.physical, original.nonspecified);
  expect(() => check(result)).not.toThrow();
  const rows = result.allLines.filter(row => row.form === "Pub974 Separate Owner Sources");
  expect(rows.map(row => [row.inputs?.Owner, row.value.toFixed()])).toEqual([["primary", "37600"], ["spouse", "40000"]]);
  const missing = { ...result, allLines: result.allLines.filter(row => row !== rows[0]) };
  expect(() => check(missing)).toThrow(/audit.*incomplete|duplicated/i);
  const duplicate = { ...result, allLines: [...result.allLines, rows[0]] };
  expect(() => check(duplicate)).toThrow(/audit.*incomplete|duplicated/i);
  const changed = { ...result, allLines: result.allLines.map(row => row === rows[0] ? { ...row, value: row.value.plus(".01") } : row) };
  expect(() => check(changed)).toThrow(/calculation.*reconcile/i);
  const wrongOwner = { ...result, allLines: result.allLines.map(row => row === rows[0] ? { ...row, inputs: { ...row.inputs, Owner: "spouse" } } : row) };
  expect(() => check(wrongOwner)).toThrow(/unique.*source audit/i);
});
