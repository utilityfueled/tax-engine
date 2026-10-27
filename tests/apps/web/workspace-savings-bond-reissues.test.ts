/** Spec: spec/federal/guided-savings-bond-reissues.yaml saved-review. */
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { buildWorkspaceFilledReturnDownload } from "@/lib/workspace-filled-return";
import { createWorkspaceRecord } from "@/lib/workspace-storage";
import { guidedSavingsBondReissueState } from "../../fixtures/guided-savings-bond-reissues.js";

vi.mock("server-only", () => ({}));

it("downloads reloaded original reissue sources without duplicate income", async () => {
  const directory = await mkdtemp(join(tmpdir(), "workspace-bond-reissue-"));
  const workspace = createWorkspaceRecord("fictional-bond-reissue");
  workspace.returnSummary.targetTaxYear = 2025;
  workspace.returnSummary.taxYearState = "single";
  const state = JSON.parse(JSON.stringify(guidedSavingsBondReissueState())) as ReturnType<typeof guidedSavingsBondReissueState>;
  const before = JSON.stringify(state);
  try {
    const download = await buildWorkspaceFilledReturnDownload(workspace, state);
    expect(download.includedForms).toContain("f8815-reference-filled.pdf");
    const path = join(directory, "review.pdf");
    await writeFile(path, download.contents);
    const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c",
      'import json,sys;from pypdf import PdfReader;print(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', path],
      { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] }));
    const text = pages.join(" ").replace(/\s+/g, " ");
    const cover = (pages[0] ?? "").replace(/\s+/g, " ");
    expect(cover).toContain("Packet completeness status: partial.");
    expect(cover).toContain("Form 8815 is included as a reference summary, not an official filed Form 8815.");
    for (const literal of ["Statement 1 original Box 3: $500", "Group 1 primary transfer recognized: $100",
      "Current transfer interest separated from redemption interest"]) expect(text).toContain(literal);
    for (const page of pages) expect(page.split("FOR REVIEW ONLY - NOT FOR FILING")).toHaveLength(2);
    for (const secret of ["900-70-3101", "900703101", "EE-FICTIONAL", "FICTIONAL-BOND-ACCOUNT", "Fictional original Box3"])
      expect(text).not.toContain(secret);
    expect(JSON.stringify(state)).toBe(before);
    for (const kind of ["missing", "revoked", "statement", "year"]) {
      const changed = structuredClone(state), data = changed.sectionData.credits?.savingsBondEducation;
      if (!data?.reissueSources) throw new Error("Missing fictional source packet");
      if (kind === "missing") delete data.reissueSources;
      if (kind === "revoked") data.reissueSources.sourceFactsConfirmed = null;
      if (kind === "statement") {
        const statement = data.reissueSources.statements?.[0];
        if (!statement) throw new Error("Missing fictional statement");
        statement.box3 = "501";
      }
      if (kind === "year") changed.taxYear = 2026;
      await expect(buildWorkspaceFilledReturnDownload(workspace, changed)).rejects.toThrow(/complete|source|year|bond|2026/i);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
