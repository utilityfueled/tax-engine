import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { taxpayerFacts2025 } from "./guided-fixtures";

test("encrypted backup restores original bytes and private local answers after deletion and reload", async ({ page }, testInfo) => {
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
  await page.evaluate(({ id, originalFlow }) => {
    localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, originalFlow);
  }, { id, originalFlow });
  await page.goto("/");
  const card = page.getByRole("listitem").filter({ hasText: `Tax Return ${id}` });
  await card.getByText("Back up this return", { exact: true }).click();
  await card.getByLabel("Backup password (at least 12 characters)").fill("synthetic-recovery-password");
  const downloadPromise = page.waitForEvent("download");
  await card.getByRole("button", { name: "Download encrypted backup", exact: true }).click();
  const download = await downloadPromise;
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
  await page.getByRole("button", { name: `Delete tax return ${recoveredId}`, exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: `Tax Return ${recoveredId}` })).toHaveCount(0);
});
