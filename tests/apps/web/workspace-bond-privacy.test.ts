// Spec: spec/federal/guided-savings-bond-sources.yaml.
import { expect, it, vi } from "vitest";
import { execFileSync } from "../../helpers/file-stdin-exec";
import { actualSavingsBondData } from "../../fixtures/guided-savings-bond";
import { completeInterestSource, startCompleteInterview } from "../../guided-interview/complete-facts";
import { emptyCreditsData, getGuidedFlowStorageKey } from "@/lib/guided-interview-flow";
import { ensureWorkspace } from "@/lib/workspace-storage";
import { buildWorkspaceFilledReturnDownload } from "@/lib/workspace-filled-return";
import { exportWorkspaceRecovery, importWorkspaceRecovery, type RecoveryDocumentStore } from "@/lib/workspace-recovery";
import * as returnPdf from "@/pdf/fill-return.js";

vi.mock("server-only", () => ({}));
function storage(): Storage {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); }, clear: () => values.clear(),
    key: index => [...values.keys()][index] ?? null, get length() { return values.size; } };
}

it("redacts bond beneficiary IDs only after calculation and preserves them in encrypted recovery", async () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["investments"], lifeEvents: [], stateCode: null });
  state.sectionData["income-investments"] = { interestEntries: [{ ...completeInterestSource, interestIncome: "100", usSavingsBondInterest: "2000" }], dividendEntries: [], brokerageEntries: [] };
  state.sectionData.credits = { ...emptyCreditsData, ...state.sectionData.credits, savingsBondEducation: actualSavingsBondData() };
  const original = JSON.stringify(state);
  const local = storage(), workspace = ensureWorkspace(local, "synthetic-bond-privacy");
  workspace.returnSummary = { ...workspace.returnSummary, targetTaxYear: 2025 };
  local.setItem(getGuidedFlowStorageKey(workspace.id), original);
  const render = vi.spyOn(returnPdf, "fillReturn");
  try {
    // The real calculation must validate the full beneficiary ID before copies are redacted.
    const download = await buildWorkspaceFilledReturnDownload(workspace, state);
    expect(download.contents.length).toBeGreaterThan(0);
    expect(download.includedForms.some(form => form.includes("8815"))).toBe(true);
    // Spec: spec/federal/form-8815.yaml reference-packet-cover.
    const cover = execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c",
      "import io,sys; from pypdf import PdfReader; print(PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages[0].extract_text())",
    ], { input: download.contents, encoding: "utf8", timeout: 5000 });
    expect(cover).toContain("Packet completeness status: partial.");
    expect(cover).toContain("Form 8815 is included as a reference summary, not an official filed Form 8815.");
    expect(cover).toContain("E-file and business-rule validation: not-validated.");
    expect(render).toHaveBeenCalledOnce();
    const [reviewInput, result] = render.mock.calls[0];
    expect(reviewInput.form8815?.educationExpenses?.[0].beneficiaryTaxId).toBe("");
    expect(reviewInput.taxpayer.primary.ssn).toBe("");
    expect(result.form8815?.excludableSavingsBondInterest.toFixed()).toBe("1500");
    expect(JSON.stringify(state)).toBe(original);
  } finally { render.mockRestore(); }
  const documents: RecoveryDocumentStore = { read: vi.fn(async () => null), write: vi.fn(async () => {}), remove: vi.fn(async () => {}) };
  const password = "Synthetic bond recovery password";
  const archive = await exportWorkspaceRecovery(local, workspace.id, password, { documents });
  expect(await archive.text()).not.toContain("111-22-3333");
  const restored = await importWorkspaceRecovery(local, archive, password, { documents });
  const restoredRaw = local.getItem(getGuidedFlowStorageKey(restored.workspaceId));
  expect(restoredRaw).toBe(original);
  expect(JSON.parse(restoredRaw ?? "{}").sectionData.credits.savingsBondEducation.educationExpenses[0].beneficiaryTaxId).toBe("111-22-3333");
  expect(local.getItem(getGuidedFlowStorageKey(workspace.id))).toBe(original);
});
