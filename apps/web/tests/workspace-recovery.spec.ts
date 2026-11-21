import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { taxpayerFacts2025 } from "./guided-fixtures";

test("encrypted backup restores original bytes and private local answers after deletion and reload", async ({ page }, testInfo) => {
  const sent: string[] = [];
  page.on("request", (request) => sent.push(`${request.url()}\n${request.postData() ?? ""}`));
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText("Synthetic supporting record for recovery test only", { font, size: 12 });
  const bytes = Buffer.from(await pdf.save());
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("tax-engine:guided-mode", "false"));
  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new)[a-z0-9-]+/i);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.locator('input[type="file"]').setInputFiles({ name: "recovery-source.pdf", mimeType: "application/pdf", buffer: bytes });
  await expect(page.getByText("recovery-source.pdf", { exact: true }).first()).toBeVisible();
  // Explicit synthetic saved facts exercise opaque field preservation, including an unknown year.
  const originalFlow = JSON.stringify({ phase: "interview", taxYear: null,
    segmentation: { filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null },
    currentSectionIndex: 0, completedSections: [], sectionData: { "personal-info": { ...taxpayerFacts2025,
      firstName: "Synthetic", ssn: "900-70-0011", dateOfBirth: "1980-01-01" },
      extension: { zero: "0.00", cents: "9007199254740993.27" } } });
  await page.evaluate(id => {
    const key = "tax-engine.return-workspaces.v1";
    const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
    saved.workspaces[id].guidedCompletion = {
      completedSectionCount: 2, totalSectionCount: 2, skippedSectionCount: 0, needsReviewSectionCount: 0,
    };
    localStorage.setItem(key, JSON.stringify(saved));
  }, id);
  await page.goto("/");
  const card = page.getByRole("listitem").filter({ hasText: `Tax Return ${id}` });
  await card.getByText("Back up this return", { exact: true }).click();
  await card.getByLabel("Backup password (at least 12 characters)").fill("synthetic-recovery-password");
  let downloadCount = 0;
  page.on("download", () => { downloadCount += 1; });
  await card.getByRole("button", { name: "Download encrypted backup", exact: true }).click();
  await expect(card.getByRole("status").filter({ hasText: "guided answers are missing" })).toBeVisible();
  expect(downloadCount).toBe(0);
  await page.evaluate(({ id, originalFlow }) => {
    localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, originalFlow);
  }, { id, originalFlow });
  await card.getByLabel("Backup password (at least 12 characters)").fill("synthetic-recovery-password");
  const downloadPromise = page.waitForEvent("download");
  await card.getByRole("button", { name: "Download encrypted backup", exact: true }).click();
  const download = await downloadPromise;
  expect(downloadCount).toBe(1);
  const archivePath = testInfo.outputPath("encrypted-recovery.json");
  await download.saveAs(archivePath);
  expect(await readFile(archivePath, "utf8")).not.toContain("900-70-0011");
  await card.getByRole("button", { name: `Delete tax return ${id}`, exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  expect(await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("tax-engine-workspace-document-cache", 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    return new Promise<number>((resolve) => {
      const tx = db.transaction("workspace-document-files", "readonly");
      const request = tx.objectStore("workspace-document-files").count();
      request.onsuccess = () => { resolve(request.result); db.close(); };
    });
  })).toBe(0);
  const otherTab = await page.context().newPage();
  otherTab.on("request", (request) => sent.push(`${request.url()}\n${request.postData() ?? ""}`));
  await otherTab.goto("/");
  await otherTab.getByRole("button", { name: /start your tax return/i }).click();
  await expect(otherTab).toHaveURL(/\/returns\/(?!new)[a-z0-9-]+/i);
  await otherTab.getByRole("button", { name: "Switch to advanced mode", exact: true }).click();
  await expect(otherTab.getByRole("button", { name: "Reset Return", exact: true })).toBeVisible();
  const restore = page.locator("details").filter({ has: page.getByText("Restore an encrypted backup", { exact: true }) });
  await restore.getByText("Restore an encrypted backup", { exact: true }).click();
  await restore.getByLabel("Encrypted recovery file").setInputFiles(archivePath);
  await restore.getByLabel("Backup password (at least 12 characters)").fill("wrong-long-password");
  await restore.getByRole("button", { name: "Restore as new local return", exact: true }).click();
  await expect(restore.getByRole("status")).toContainText("incorrect");
  await restore.getByLabel("Backup password (at least 12 characters)").fill("synthetic-recovery-password");
  await restore.getByRole("button", { name: "Restore as new local return", exact: true }).click();
  const link = restore.getByRole("link", { name: "Open restored return", exact: true });
  await expect(link).toBeVisible();
  const recoveredId = (await link.getAttribute("href"))!.split("/").at(-1)!.split("?")[0];
  expect(recoveredId).not.toBe(id);
  // This tab loaded the workspace list before the other tab completed recovery.
  await otherTab.locator('input[type="file"]').setInputFiles({ name: "unrelated-source.pdf", mimeType: "application/pdf", buffer: bytes });
  await expect(otherTab.getByText("unrelated-source.pdf", { exact: true }).first()).toBeVisible();
  await otherTab.close();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/returns/${recoveredId}\\?local=1$`));
  await page.reload();
  expect(await page.evaluate((id) => localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`), recoveredId)).toBe(originalFlow);
  await page.getByRole("region", { name: "Your Documents", exact: true }).getByRole("button", { name: "Expand", exact: true }).click();
  await expect(page.getByText("recovery-source.pdf", { exact: true }).first()).toBeVisible();
  const recovered = await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("tax-engine-workspace-document-cache", 1);
      request.onsuccess = () => resolve(request.result);
    });
    const records = await new Promise<Array<{ workspaceId: string; file: Blob }>>((resolve) => {
      const request = db.transaction("workspace-document-files", "readonly").objectStore("workspace-document-files").getAll();
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    const record = records.find((record) => record.workspaceId === id)!;
    return [...new Uint8Array(await record.file.arrayBuffer())];
  }, recoveredId);
  expect(Buffer.from(recovered)).toEqual(bytes);
  await page.goto("/");
  const restoredCard = page.getByRole("listitem").filter({ hasText: `Tax Return ${recoveredId}` });
  await expect(restoredCard).toContainText("Restored local return — saved only on this device.");
  await page.reload();
  await expect(restoredCard).toBeVisible();
  await page.getByRole("button", { name: `Delete tax return ${recoveredId}`, exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: `Tax Return ${recoveredId}` })).toHaveCount(0);
  expect(sent.join("\n")).not.toContain("900-70-0011");
  expect(sent.join("\n")).not.toContain("recovery-source.pdf");
  expect(sent.join("\n")).not.toContain("%PDF-");
});

test("reset removes saved guided facts before a return is reopened", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("tax-engine:guided-mode", "false"));
  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new)[a-z0-9-]+/i);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.evaluate((id) => {
    localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ phase: "interview", taxYear: 2025,
      segmentation: { filingStatus: "single", incomeTypes: ["w2"], lifeEvents: [], stateCode: null },
      currentSectionIndex: 0, completedSections: [], sectionData: { "personal-info": { firstName: "ResetPrivateName", ssn: "900-70-0022" } } }));
    localStorage.setItem(`tax-engine:guided-mode:${id}`, "false");
  }, id);
  await page.reload();
  await page.getByRole("button", { name: "Reset Return", exact: true }).click();
  await expect(page.getByRole("status", { name: "Return status", exact: true })).toContainText("Return reset.");
  expect(await page.evaluate((id) => localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`), id)).toBeNull();
  await page.getByRole("button", { name: "Start guided interview", exact: true }).click();
  await expect(page.getByRole("heading", { name: /let's tailor your return/i })).toBeVisible();
  expect(await page.content()).not.toContain("ResetPrivateName");
  await page.reload();
  await expect(page.getByRole("heading", { name: /let's tailor your return/i })).toBeVisible();
  expect(await page.content()).not.toContain("ResetPrivateName");
});

async function checkReturnRemovalFailure(page: import("@playwright/test").Page, fault: "reset-quota" | "delete-guided" | "delete-transaction") {
  const reset = fault === "reset-quota";
  const bytes = await readFile(new URL("../../../sample-documents/downloads/irs-w2-2025.pdf", import.meta.url));
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("tax-engine:guided-mode", "false"));
  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new)[a-z0-9-]+/i);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.locator('input[type="file"]').setInputFiles({ name: "irs-w2-2025.pdf", mimeType: "application/pdf", buffer: bytes });
  await expect(page.getByRole("status", { name: "Return status" })).toHaveText("1 docs stored locally.");
  const workspaceKey = "tax-engine.return-workspaces.v1";
  const guidedKey = `tax-engine.guided-flow-state.v1:${id}`;
  const legacyGuidedKey = "tax-engine.guided-flow-state.v1";
  const modeKey = `tax-engine:guided-mode:${id}`;
  const recoveryKey = `tax-engine:local-recovery:v1:${id}`;
  await page.evaluate(({ guidedKey, legacyGuidedKey, modeKey, recoveryKey }) => {
    localStorage.setItem(guidedKey, '{"syntheticSource":"saved answers","amount":"12.34"}');
    localStorage.setItem(legacyGuidedKey, '{"syntheticSource":"legacy unscoped answers"}');
    localStorage.setItem(modeKey, "false");
    localStorage.setItem(recoveryKey, "local-only");
  }, { guidedKey, legacyGuidedKey, modeKey, recoveryKey });
  if (!reset) await page.goto("/");
  const readState = () => page.evaluate(async ({ id, workspaceKey, guidedKey, legacyGuidedKey, modeKey, recoveryKey }) => {
    const workspaces = JSON.parse(localStorage.getItem(workspaceKey) ?? "{}").workspaces ?? {};
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("tax-engine-workspace-document-cache", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const rows = await new Promise<Array<{ workspaceId: string; file: Blob }>>((resolve, reject) => {
        const request = db.transaction("workspace-document-files").objectStore("workspace-document-files").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return {
        workspace: workspaces[id],
        unrelated: workspaces["unrelated-synthetic"],
        guided: localStorage.getItem(guidedKey),
        legacyGuided: localStorage.getItem(legacyGuidedKey),
        mode: localStorage.getItem(modeKey),
        marker: localStorage.getItem(recoveryKey),
        originals: await Promise.all(rows.filter(row => row.workspaceId === id).map(async row => {
          const hash = await crypto.subtle.digest("SHA-256", await row.file.arrayBuffer());
          return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
        })),
      };
    } finally { db.close(); }
  }, { id, workspaceKey, guidedKey, legacyGuidedKey, modeKey, recoveryKey });
  const before = await readState();
  expect(before.originals).toEqual([createHash("sha256").update(bytes).digest("hex")]);
  await page.evaluate(({ id, workspaceKey, guidedKey, fault }) => {
    const setItem = Storage.prototype.setItem;
    const removeItem = Storage.prototype.removeItem;
    const removeOriginal = IDBObjectStore.prototype.delete;
    let deletion: IDBTransaction | undefined;
    let injected = false;
    IDBObjectStore.prototype.delete = function (key) {
      if (this.name === "workspace-document-files") deletion = this.transaction;
      return removeOriginal.call(this, key);
    };
    Storage.prototype.removeItem = function (key) {
      if (!injected && fault === "delete-guided" && key === guidedKey) {
        injected = true;
        throw new DOMException("Cannot remove saved answers for this test", "SecurityError");
      }
      removeItem.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      const data = key === workspaceKey ? JSON.parse(value) : null;
      if (!injected && fault === "reset-quota" && data?.workspaces?.[id]?.documents?.length === 0) {
        injected = true;
        throw new DOMException("Full for this reset", "QuotaExceededError");
      }
      if (!injected && fault === "delete-transaction" && data?.workspaces && !(id in data.workspaces)) {
        injected = true;
        data.workspaces["unrelated-synthetic"] = { retainedExtension: "new unrelated saved value" };
        setItem.call(this, key, JSON.stringify(data));
        queueMicrotask(() => {
          try { deletion?.abort(); } catch (error) {
            if (!(error instanceof DOMException && error.name === "InvalidStateError")) throw error;
          }
        });
        return;
      }
      setItem.call(this, key, value);
    };
  }, { id, workspaceKey, guidedKey, fault });
  const action = page.getByRole("button", { name: reset ? "Reset Return" : `Delete tax return ${id}`, exact: true });
  await action.click();
  await expect(page.getByText(reset ? "Could not reset the return. Please try again." : "Could not delete the return. Please try again.", { exact: true })).toBeVisible();
  const afterFailure = await readState();
  expect(afterFailure).toEqual({ ...before, unrelated: fault === "delete-transaction" ? { retainedExtension: "new unrelated saved value" } : undefined });
  await page.reload();
  await action.click();
  await expect(page.getByText(reset ? "Return reset." : `Deleted return ${id}.`, { exact: true })).toBeVisible();
  const afterRetry = await readState();
  expect(afterRetry).toMatchObject({ guided: null, legacyGuided: null, mode: null, marker: reset ? "local-only" : null, originals: [], unrelated: afterFailure.unrelated });
  if (reset) expect(afterRetry.workspace.documents).toEqual([]);
  else expect(afterRetry.workspace).toBeUndefined();
}

test("keeps saved facts and originals when local reset cannot publish", async ({ page }) => {
  await checkReturnRemovalFailure(page, "reset-quota");
});

test("keeps saved facts and originals when local deletion cannot clear guided answers", async ({ page }) => {
  await checkReturnRemovalFailure(page, "delete-guided");
});

test("restores scoped saved data when local return deletion aborts", async ({ page }) => {
  await checkReturnRemovalFailure(page, "delete-transaction");
});

test("cannot reopen an original after another tab deletes the return", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("tax-engine:guided-mode", "false"));
  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new)[a-z0-9-]+/i);
  const id = new URL(page.url()).pathname.split("/").at(-1);
  if (!id) throw new Error("Expected a local return");
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText("Synthetic supporting document");
  await page.locator('input[type="file"]').setInputFiles({
    name: "synthetic-attached-source.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });
  await expect(page.getByRole("status", { name: "Return status" })).toHaveText("1 docs stored locally.");
  await page.evaluate(({ id, personal }) => {
    localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({
      factsVersion: 2, phase: "interview", taxYear: 2025, currentSectionIndex: 1,
      completedSections: ["personal-info"],
      segmentation: { filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null },
      sectionData: { "personal-info": personal },
    }));
  }, { id, personal: taxpayerFacts2025 });
  // Enter the saved interview in the uploading tab without reloading its
  // JavaScript state.
  await page.getByRole("button", { name: "Start guided interview", exact: true }).click();
  const review = page.getByRole("button", { name: "Try selected attached PDFs", exact: true });
  await expect(review).toBeEnabled();

  const otherTab = await page.context().newPage();
  await otherTab.goto("/");
  const deleteButton = otherTab.getByRole("button", { name: `Delete tax return ${id}`, exact: true });
  await deleteButton.click();
  await expect(deleteButton).toHaveCount(0);
  await review.click();
  await expect(page.getByText(/could not be reopened because their raw bytes are no longer cached locally/i)).toBeVisible();
  await otherTab.close();
});
