// Spec: spec/federal/marketplace-health-owners.yaml.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm7206 } from "@/pdf/fill-form-7206.js";
import { assertForm7206ReviewSource } from "@/pdf/mappings/2025/fill-form-7206.js";
import { d } from "@/utils/decimal.js";
import { twoOwnerMarketplaceHealthInput } from "../fixtures/marketplace-health-owners.js";

function text(bytes: Uint8Array): string {
  const directory = mkdtempSync(join(tmpdir(), "tax-health-owners-pdf-"));
  try {
    const path = join(directory, "review.pdf"); writeFileSync(path, bytes);
    return execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c", "from pypdf import PdfReader\nimport sys\nprint(' '.join(p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages))", path], { encoding: "utf8", timeout: 5000 });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
it("reconciles actual owner deductions and prints them without duplicate joint claims", async () => {
  const input = twoOwnerMarketplaceHealthInput(), result = calculateFederalTax(input);
  input.taxpayer.primary.ssn = ""; if (input.taxpayer.spouse) input.taxpayer.spouse.ssn = "";
  for (const [business, owner, amount] of [["scheduleC", "primary", "730"], ["scheduleF", "spouse", "365"]] as const) {
    const document = await fillForm7206(input, result, "forms/blank/2025/f7206.pdf", business, owner);
    const contents = text(await document.save());
    expect(contents).toContain(`Pub974 Owner Allocation ${owner}:deduction: $${amount}`);
    expect(contents).toContain("Return-level Schedule 1 line 17 transfer: $1095");
    expect(contents).toContain("not a separate deduction for this business");
    expect(contents).not.toMatch(/123.?45.?6789|555.?55.?5555/);
    expect(contents).toContain("FOR REVIEW ONLY - NOT FOR FILING");
  }
  for (const mutate of [
    (saved: typeof result) => { const row = saved.form7206?.lines.find(line => line.form === "Pub974 Owner Allocation"); if (!row) throw new Error("Missing owner audit"); row.value = row.value.plus(".01"); },
    (saved: typeof result) => { saved.allLines = saved.allLines.filter(line => line.form !== "Pub974 Owner Allocation"); },
    (saved: typeof result) => { const row = saved.form7206?.lines.find(line => line.form === "Pub974 Owner Allocation"); if (!row || !saved.form7206) throw new Error("Missing owner audit"); saved.form7206.lines.push({ ...row, value: d(row.value) }); },
  ]) {
    const saved = calculateFederalTax(input); mutate(saved);
    expect(() => assertForm7206ReviewSource(input, saved)).toThrow(/owner|audit|reconcile/i);
  }
});
