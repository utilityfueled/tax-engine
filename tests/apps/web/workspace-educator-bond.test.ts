/** Spec: spec/federal/educator-bond-rational-magi.yaml saved-review. */
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { buildWorkspaceFilledReturnDownload } from "@/lib/workspace-filled-return";
import { createWorkspaceRecord } from "@/lib/workspace-storage";
import { guidedEducatorBondState } from "../../fixtures/guided-educator-bond.js";
vi.mock("server-only", () => ({}));

it("downloads original educator and bond sources after save and reload", async () => {
  const directory = await mkdtemp(join(tmpdir(), "workspace-educator-bond-"));
  const workspace = createWorkspaceRecord("fictional-educator-bond");
  workspace.returnSummary.targetTaxYear = 2025; workspace.returnSummary.taxYearState = "single";
  const state = JSON.parse(JSON.stringify(guidedEducatorBondState())) as ReturnType<typeof guidedEducatorBondState>;
  const before = JSON.stringify(state);
  try {
    const download = await buildWorkspaceFilledReturnDownload(workspace, state), path = join(directory, "review.pdf");
    expect(download.includedForms).toContain("f8815-reference-filled.pdf"); await writeFile(path, download.contents);
    const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c",
      'import json,sys;from pypdf import PdfReader;print(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', path],
      { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] }));
    const text = pages.join(" ").replace(/\s+/g, " ");
    for (const literal of ["Primary educator excluded bond interest: 1000 / 3 (exact)", "Final Schedule 1 educator deduction: 200"]) expect(text).toContain(literal);
    const original1040 = pages.find(page => page.includes("11a Subtract line 10"));
    expect(original1040?.replace(/\s+/g, " ")).toMatch(/\b80000 80000 80000 200 79800\b/);
    for (const page of pages) expect(page.split("FOR REVIEW ONLY - NOT FOR FILING")).toHaveLength(2);
    for (const secret of ["900-70-3101", "900703101", "Fictional actual purchase", "primary-receipt"]) expect(text).not.toContain(secret);
    expect(JSON.stringify(state)).toBe(before);
    const revoked = structuredClone(state), source = revoked.sectionData.adjustments?.educatorExpenseSources?.[0];
    if (!source) throw new Error("Missing fictional educator"); source.sourceFactsConfirmed = null;
    await expect(buildWorkspaceFilledReturnDownload(workspace, revoked)).rejects.toThrow(/complete|source/i);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
