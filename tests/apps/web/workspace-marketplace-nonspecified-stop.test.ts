// Spec: spec/federal/marketplace-nonspecified-stop.yaml.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { buildWorkspaceFilledReturnDownload } from "@/lib/workspace-filled-return";
import { createWorkspaceRecord } from "@/lib/workspace-storage";
import { guidedMarketplaceNonspecifiedStopState } from "../../fixtures/guided-marketplace-nonspecified-stop";

vi.mock("server-only", () => ({}));

it("exports the completed stop through the actual guided workspace", async () => {
  const state = guidedMarketplaceNonspecifiedStopState(), before = JSON.stringify(state);
  const workspace = createWorkspaceRecord("actual-nonspecified-stop"); workspace.returnSummary.targetTaxYear = 2025;
  const download = await buildWorkspaceFilledReturnDownload(workspace, state);
  expect(download.includedForms.filter(name => /form-7206-/.test(name))).toHaveLength(2);
  expect(download.includedForms).toContain("f8962-reference-filled.pdf");
  const directory = mkdtempSync(join(tmpdir(), "workspace-nonspecified-stop-"));
  try {
    const path = join(directory, "workspace.pdf"); writeFileSync(path, download.contents);
    const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c",
      "from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", path], { encoding: "utf8", timeout: 5000 }));
    const text = pages.join(" ").replace(/\s+/g, " ");
    for (const value of ["NONSPECIFIED STOP", "Return-level Schedule 1 line 17 transfer: $7646", "Final Form 8962 credit: $4515", "No Worksheets W/X or retained special-order deductions apply."]) expect(text).toContain(value);
    expect(text).not.toContain("Pub974 Worksheet W line");
    for (const page of pages) {
      expect(page.split("FOR REVIEW ONLY - NOT FOR FILING")).toHaveLength(2);
      expect(page.replaceAll("-", "")).not.toMatch(/111223333|222334444/);
    }
    expect(JSON.stringify(state)).toBe(before);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
