// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ export: vi.fn(), import: vi.fn(), storage: vi.fn() }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
vi.mock("../../../apps/web/src/lib/browser-storage", () => ({ requireBrowserStorage: mocks.storage }));
vi.mock("../../../apps/web/src/lib/workspace-recovery", () => ({ exportWorkspaceRecovery: mocks.export, importWorkspaceRecovery: mocks.import }));
import { WorkspaceRecoveryControls } from "../../../apps/web/src/components/workspace-recovery-controls";

let container: HTMLDivElement;
let root: Root;
let mounted: boolean;
let downloads: Array<{ href: string; download: string }>;
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function button(label: string) { const found = [...container.querySelectorAll("button")].find(element => element.textContent === label); if (!found) throw new Error(`Missing button ${label}`); return found; }
async function click(label: string) { await act(async () => button(label).click()); }
async function password(value = "synthetic-password") { const element = container.querySelector<HTMLInputElement>('input[type="password"]')!; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function file(selected: File | null = new File(["encrypted"], "return.recovery.json", { type: "application/json" })) { const element = container.querySelector<HTMLInputElement>('input[type="file"]')!; Object.defineProperty(element, "files", { configurable: true, value: selected ? [selected] : [] }); await act(async () => element.dispatchEvent(new Event("change", { bubbles: true }))); return selected; }
async function render(workspaceId?: string) { await act(async () => root.render(<WorkspaceRecoveryControls workspaceId={workspaceId} />)); }

beforeEach(() => {
  vi.resetAllMocks(); (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); mounted = true; downloads = [];
  mocks.storage.mockReturnValue(localStorage);
  mocks.export.mockResolvedValue(new Blob(["encrypted"])); mocks.import.mockResolvedValue({ workspaceId: "restored-synthetic", documentCount: 2 });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloads.push({ href: this.href, download: this.download }); });
  vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:synthetic"); static revokeObjectURL = vi.fn(); });
});
afterEach(async () => { if (mounted) await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("encrypted recovery controls", () => {
  it("requires a long password, downloads only an encrypted archive and clears the password", async () => {
    await render("return-1"); expect(button("Download encrypted backup").disabled).toBe(true);
    await password("short"); expect(button("Download encrypted backup").disabled).toBe(true);
    await password(); await click("Download encrypted backup");
    expect(mocks.export).toHaveBeenCalledWith(localStorage, "return-1", "synthetic-password", { signal: expect.any(AbortSignal) });
    expect(downloads).toEqual([{ href: "blob:synthetic", download: "tax-return-return-1.recovery.json" }]);
    expect(container.querySelector<HTMLInputElement>('input[type="password"]')!.value).toBe("");
    expect(container.textContent).toContain("Encrypted backup downloaded");
  });
  it("requires a selected archive and restores it as a new local return", async () => {
    await render(); await password(); expect(button("Restore as new local return").disabled).toBe(true);
    const archive = await file(); await click("Restore as new local return");
    expect(mocks.import).toHaveBeenCalledWith(localStorage, archive, "synthetic-password", { signal: expect.any(AbortSignal) });
    expect(container.textContent).toContain("Restored 2 original document(s)");
    expect(container.querySelector('a')?.getAttribute("href")).toBe("/returns/restored-synthetic?local=1");
    expect(container.querySelector<HTMLInputElement>('input[type="password"]')!.value).toBe("");
    expect(button("Restore as new local return").disabled).toBe(true);
    expect(mocks.export).not.toHaveBeenCalled();
  });
  it("returns to an unselected state when the file chooser is cleared", async () => {
    await render(); await password(); await file(); expect(button("Restore as new local return").disabled).toBe(false);
    await file(null); expect(button("Restore as new local return").disabled).toBe(true);
  });
  it.each([new Error("Incorrect recovery password."), "unexpected"])("contains a failed restore and preserves existing returns: %s", async error => {
    mocks.import.mockRejectedValue(error); await render(); await password(); await file(); await click("Restore as new local return");
    expect(container.textContent).toContain(error instanceof Error ? error.message : "Your existing returns were not replaced");
    expect(container.querySelector("a")).toBeNull(); expect(downloads).toEqual([]);
    expect(container.querySelector<HTMLInputElement>('input[type="password"]')!.value).toBe("");
  });
  it("reports unavailable browser storage before reading or writing an archive", async () => {
    mocks.storage.mockImplementation(() => { throw new Error("Browser storage is unavailable."); });
    await render("return-1"); await password(); await click("Download encrypted backup");
    expect(container.textContent).toContain("Browser storage is unavailable"); expect(mocks.export).not.toHaveBeenCalled();
  });
  it.each(["export", "import"] as const)("does not publish a late %s success after cancellation", async kind => {
    const pending = deferred<unknown>(); mocks[kind].mockReturnValue(pending.promise);
    await render(kind === "export" ? "return-1" : undefined); await password(); if (kind === "import") await file();
    await click(kind === "export" ? "Download encrypted backup" : "Restore as new local return");
    expect(button("Working…").disabled).toBe(true); const signal = mocks[kind].mock.lastCall?.[3].signal as AbortSignal;
    await click("Cancel"); expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(kind === "export" ? new Blob(["late"]) : { workspaceId: "late-return", documentCount: 3 }));
    expect(downloads).toEqual([]); expect(container.querySelector("a")).toBeNull(); expect(container.textContent).toContain("cancelled");
  });
  it("aborts an old return operation when the displayed return changes", async () => {
    const pending = deferred<Blob>(); mocks.export.mockReturnValue(pending.promise);
    await render("old-return"); await password(); await click("Download encrypted backup");
    const signal = mocks.export.mock.lastCall?.[3].signal as AbortSignal;
    await render("new-return"); expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(new Blob(["old private data"])));
    expect(downloads).toEqual([]); expect(container.textContent).not.toContain("downloaded");
    expect(container.querySelector<HTMLInputElement>('input[type="password"]')!.value).toBe("");
  });
  it("aborts on unmount and does not download an archive after the UI is gone", async () => {
    const pending = deferred<Blob>(); mocks.export.mockReturnValue(pending.promise);
    await render("return-1"); await password(); await click("Download encrypted backup");
    const signal = mocks.export.mock.lastCall?.[3].signal as AbortSignal;
    await act(async () => root.unmount()); mounted = false; expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(new Blob(["late private data"]))); expect(downloads).toEqual([]);
  });
});
