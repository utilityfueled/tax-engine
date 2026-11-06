// Spec: spec/federal/marketplace-health-owner-income.yaml.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm7206 } from "@/pdf/fill-form-7206.js";
import { assertForm7206ReviewSource } from "@/pdf/mappings/2025/fill-form-7206.js";
import { twoOwnerMarketplaceHealthInput } from "../fixtures/marketplace-health-owners.js";

function savedText(bytes: Uint8Array): string {
  const directory = mkdtempSync(join(tmpdir(), "tax-health-owner-income-pdf-"));
  try {
    const path = join(directory, "review.pdf"); writeFileSync(path, bytes);
    return execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c", "from pypdf import PdfReader\nimport sys\nprint(' '.join(p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages))", path], { encoding: "utf8", timeout: 5000 });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

it("binds the review owner deduction to its actual earned-income limit", async () => {
  const input = twoOwnerMarketplaceHealthInput();
  if (!input.scheduleC || !input.scheduleF) throw new Error("Missing actual synthetic businesses");
  input.scheduleC.grossReceipts = "1000"; input.scheduleF.salesOfProductsRaised = "50000";
  const result = calculateFederalTax(input);
  input.taxpayer.primary.ssn = ""; if (input.taxpayer.spouse) input.taxpayer.spouse.ssn = "";
  expect(() => assertForm7206ReviewSource(input, result)).not.toThrow();
  const pdf = await fillForm7206(input, result, "forms/blank/2025/f7206.pdf", "scheduleC", "primary");
  const contents = savedText(await pdf.save());
  expect(contents).toContain("Pub974 Owner Allocation primary:deduction: $929");
  expect(contents).toContain("Return-level Schedule 1 line 17 transfer: $1488");
  expect(contents).toContain("not a separate deduction for this business");
  expect(contents).not.toMatch(/123.?45.?6789|555.?55.?5555/);
  expect(contents).toContain("FOR REVIEW ONLY - NOT FOR FILING");
  const owner = result.form7206?.lines.find(row => row.form === "Pub974 Owner Allocation" && row.line === "primary:deduction");
  if (!owner) throw new Error("Missing actual owner trace");
  expect(owner.value.toFixed()).toBe("929");
  owner.value = owner.value.plus(".01");
  expect(() => assertForm7206ReviewSource(input, result)).toThrow(/owner|audit|reconcile/i);
  const fresh = calculateFederalTax(input);
  input.scheduleC.grossReceipts = "1001";
  expect(() => assertForm7206ReviewSource(input, fresh)).toThrow(/source|reconcile|audit/i);
});
