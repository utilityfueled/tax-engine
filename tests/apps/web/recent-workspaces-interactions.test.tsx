// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReturnWorkspaceRecord, WorkspaceDeploymentMode } from "@tax-engine/contracts";

const mocks = vi.hoisted(() => ({ list: vi.fn(), delete: vi.fn(), storage: vi.fn() }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
vi.mock("../../../apps/web/src/lib/workspace-persistence", () => ({ listPersistedWorkspaces: mocks.list, deletePersistedWorkspace: mocks.delete }));
vi.mock("../../../apps/web/src/lib/browser-storage", () => ({ requireBrowserStorage: mocks.storage }));
vi.mock("../../../apps/web/src/components/workspace-recovery-controls", () => ({ WorkspaceRecoveryControls: () => <span>Encrypted recovery</span> }));
import { RecentWorkspacesPanel } from "../../../apps/web/src/components/recent-workspaces-panel";
import { createWorkspaceRecord } from "../../../apps/web/src/lib/workspace-storage";
import { initialFlowState, saveGuidedFlowState } from "../../../apps/web/src/lib/guided-interview-flow";
import { getLocalRecoveryStorageKey } from "../../../apps/web/src/lib/workspace-local-recovery";

let root: Root, container: HTMLDivElement;
function required<T>(value: T | null | undefined): T { if (value == null) throw new Error("Missing rendered control"); return value; }
function button(label: string) { return required([...container.querySelectorAll("button")].find(element => element.getAttribute("aria-label") === label || element.textContent === label)); }
async function click(label: string) { await act(async () => button(label).click()); }
async function render(deploymentMode: WorkspaceDeploymentMode = "hosted") { await act(async () => root.render(<RecentWorkspacesPanel deploymentMode={deploymentMode} newWorkspaceHref="/returns/new?local=1" />)); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
function saved(id: string, local = false): ReturnWorkspaceRecord {
  const record = createWorkspaceRecord(id);
  record.storageMode = local ? "local-browser" : "hosted-postgres";
  record.documents = [{ id: `upload-${id}`, name: "source.pdf", label: "Source", size: 10, uploadedAt: "2025-01-01T00:00:00Z", kind: "unknown", coverage: "needs-review", notes: "", matchedFixtureId: null, seededFactIds: [] }];
  record.summary.totalDocuments = 1;
  record.returnSummary = { ...record.returnSummary, targetTaxYear: 2025, taxYearState: "single", status: "needs-review", blockers: [] };
  return record;
}
function listing(workspaces: ReturnWorkspaceRecord[], availability = "available", notice: string | null = null) { return { workspaces, adapter: { availability }, notice }; }

beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; mocks.storage.mockReturnValue(localStorage); mocks.list.mockResolvedValue(listing([])); mocks.delete.mockResolvedValue({ workspaces: [] }); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe("saved-return lifecycle", () => {
  it.each(["hosted", "self-host"] as const)("shows the correct empty storage mode for %s", async mode => {
    await render(mode); expect(container.textContent).toContain(mode === "hosted" ? "after you sign in" : "No saved returns yet"); expect(container.textContent).toContain("0 saved returns.");
  });
  it("hides untouched shells while preserving guided setup and local recovery", async () => {
    const untouched = createWorkspaceRecord("untouched"), guided = createWorkspaceRecord("guided"), restored = saved("restored", true);
    const flow = structuredClone(initialFlowState); flow.phase = "complete"; saveGuidedFlowState(localStorage, guided.id, flow);
    localStorage.setItem(getLocalRecoveryStorageKey(restored.id), "local-only"); mocks.list.mockResolvedValue(listing([untouched, guided, restored]));
    await render(); expect(container.textContent).not.toContain("Tax Return untouched"); expect(container.textContent).toContain("Guided setup saved"); expect(container.textContent).toContain("Restored local return");
    expect(container.querySelector('a[aria-label="Continue tax return restored"]')?.getAttribute("href")).toBe("/returns/restored?local=1");
  });
  it.each([5, 6])("expands and collapses %i saved returns without dropping records", async count => {
    mocks.list.mockResolvedValue(listing(Array.from({ length: count }, (_, index) => saved(`return-${index}`)))); await render();
    expect(container.querySelectorAll("li.workspace-card")).toHaveLength(4);
    await click(`Show ${count - 4} older return${count === 5 ? "" : "s"}`); expect(container.querySelectorAll("li.workspace-card")).toHaveLength(count);
    await click("Show only the latest 4 returns"); expect(container.querySelectorAll("li.workspace-card")).toHaveLength(4);
    expect(container.querySelector('a[href="/returns/new?local=1"]')).not.toBeNull();
  });
  it("shows unsupported years, incomplete guided answers, source counts and unavailable timestamps", async () => {
    const unsupported = saved("unsupported"); unsupported.updatedAt = "invalid"; unsupported.returnSummary.targetTaxYear = 2026; unsupported.returnSummary.blockers = [{ id: "unsupported-tax-year", message: "2026 is not qualified.", sourceDocumentIds: [], relatedFactIds: [] }];
    const guided = saved("answers"); guided.documents[0].id = "guided:answers"; guided.guidedCompletion = { completedSectionCount: 1, totalSectionCount: 2, skippedSectionCount: 1, needsReviewSectionCount: 0 };
    mocks.list.mockResolvedValue(listing([unsupported, guided])); await render();
    for (const text of ["Unsupported year", "timestamp unavailable", "2026 is not qualified", "guided answers saved", "1 guided section still needs review", "1 doc"]) expect(container.textContent).toContain(text);
    expect(container.querySelector('a[aria-label="Continue tax return unsupported"]')?.getAttribute("href")).toBe("/returns/unsupported");
  });
  it("shows an explicit storage notice ahead of the sign-in fallback", async () => {
    mocks.list.mockResolvedValue(listing([], "owner-required")); await render(); expect(container.textContent).toContain("Sign in to see your saved returns");
    mocks.list.mockResolvedValue(listing([], "owner-required", "Local recovery is available.")); await render("self-host"); expect(container.textContent).toContain("Local recovery is available");
  });
  it.each([["hosted", new Error("Service temporarily unavailable"), "Service temporarily unavailable"], ["hosted", new Error(" "), "Could not connect to the server"], ["self-host", "blocked", "Browser storage is unavailable"]] as const)("contains a %s list failure", async (mode, error, message) => {
    mocks.list.mockRejectedValue(error); await render(mode); expect(container.textContent).toContain(message);
  });
  it("deletes only the selected return and keeps the remaining local links", async () => {
    const keep = saved("keep", true); mocks.list.mockResolvedValue(listing([saved("remove"), keep])); mocks.delete.mockResolvedValue({ workspaces: [keep] });
    await render("self-host"); await click("Delete tax return remove");
    expect(mocks.delete).toHaveBeenCalledWith({ deploymentMode: "self-host", browserStorage: localStorage, workspaceId: "remove" });
    expect(container.textContent).not.toContain("Tax Return remove"); expect(container.textContent).toContain("Tax Return keep"); expect(container.textContent).toContain("Deleted return remove");
  });
  it.each([["hosted", new Error("Deletion failed"), "Deletion failed"], ["hosted", "failure", "Could not delete the return"], ["self-host", new Error("Local failure"), "Could not delete the return"]] as const)("keeps a return after a %s deletion fails", async (mode, error, message) => {
    mocks.list.mockResolvedValue(listing([saved("retain")])); mocks.delete.mockRejectedValue(error); await render(mode); await click("Delete tax return retain"); expect(container.textContent).toContain(message); expect(container.textContent).toContain("Tax Return retain");
  });
  it("does not replace a new storage-mode list with a late old response", async () => {
    const stale = deferred<ReturnType<typeof listing>>(); mocks.list.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(listing([saved("current", true)]));
    await render("hosted"); await render("self-host"); await act(async () => stale.resolve(listing([saved("stale-hosted")])));
    expect(container.textContent).toContain("Tax Return current"); expect(container.textContent).not.toContain("stale-hosted");
  });
  it("blocks overlapping delete clicks until the current deletion settles", async () => {
    const pending = deferred<{ workspaces: ReturnWorkspaceRecord[] }>(); mocks.list.mockResolvedValue(listing([saved("first"), saved("second")])); mocks.delete.mockReturnValue(pending.promise);
    await render(); await click("Delete tax return first"); expect(button("Delete tax return second").disabled).toBe(true);
    await click("Delete tax return second"); expect(mocks.delete).toHaveBeenCalledOnce();
    await act(async () => pending.resolve({ workspaces: [saved("second")] })); expect(button("Delete tax return second").disabled).toBe(false);
  });
});
