// Spec: spec/federal/marketplace-health-separate-owners.yaml.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { buildWorkspaceFilledReturnDownload } from "@/lib/workspace-filled-return";
import { createWorkspaceRecord } from "@/lib/workspace-storage";
import { guidedMarketplaceHealthSeparateOwnersState } from "../../fixtures/guided-marketplace-health-separate-owners";

vi.mock("server-only", () => ({}));
it("exports the saved three-source guide and rejects an unknown credit-method confirmation", async () => {
  const state = guidedMarketplaceHealthSeparateOwnersState(), before = JSON.stringify(state);
  const workspace = createWorkspaceRecord("synthetic-health-separate-owner");
  workspace.returnSummary.targetTaxYear = 2025;
  const directory = mkdtempSync(join(tmpdir(), "workspace-health-separate-owner-"));
  try {
    const original = JSON.parse(JSON.stringify(state)) as typeof state;
    const output = await buildWorkspaceFilledReturnDownload(workspace, original);
    const path = join(directory, "saved-review.pdf"); writeFileSync(path, output.contents);
    const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c",
      'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', path],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 }));
    const text = pages.join(" ").replace(/\s+/g, " ");
    for (const literal of ["Schedule 1 line 17 transfer: $7050", "Pub974 Worksheet W line 13: $80000", "Pub974 Worksheet W line 14: $2400", "Pub974 Worksheet W line 15: $77600", "Final Form 8962 credit: $3980"]) expect(text).toContain(literal);
    for (const source of ["formW2:0; owner primary", "formW2:1; owner spouse", "formW2:2; owner primary"]) expect(text).toContain(source);
    for (const page of pages) expect(page.split("FOR REVIEW ONLY - NOT FOR FILING")).toHaveLength(2);
    expect(text).not.toMatch(/111.?22.?3333|222.?33.?4444/);
    expect(JSON.stringify(state)).toBe(before);
    const missing = structuredClone(state);
    const method = missing.sectionData.adjustments?.healthInsuranceFacts?.marketplaceCreditAllocation;
    if (!method) throw new Error("Missing original recorded method");
    method.sourceFactsConfirmed = null;
    await expect(buildWorkspaceFilledReturnDownload(workspace, missing)).rejects.toThrow("Complete the required taxpayer facts before exporting.");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
