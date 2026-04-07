import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const sampleDocsDir = path.resolve(testDir, "../../../sample-documents/downloads");
const futureYearSampleMessage = /2026 form w-2 \(official info-copy pdf\) is an official sample document for tax year 2026, so it can't drive a 2025 return yet\. upload a 2025 tax document instead\./i;

async function enableAdvancedMode(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    window.localStorage.setItem("tax-engine:guided-mode", "false");
  });
}

async function reachGuidedW2Step(page: import("@playwright/test").Page) {
  await page.goto("/returns/new");
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+(?:\?create=1)?$/i);

  await page.getByRole("radio", { name: /single/i }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("checkbox", { name: /w-2 wages/i }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /start my return/i }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /skip this section/i }).click();
  await expect(page.getByText(/w-2 #1/i)).toBeVisible();
}

test("advanced upload rejects future-year official sample PDFs before they change the return", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+$/i);

  await page.locator('input[type="file"]').setInputFiles(path.join(sampleDocsDir, "irs-w2-2026.pdf"));

  await expect(page.getByRole("status", { name: /return status/i })).toHaveText(futureYearSampleMessage);
  await expect(page.getByText("2026 Form W-2 (official info-copy PDF)", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/1 docs stored locally\./i)).toHaveCount(0);
});

test("guided W-2 upload surfaces the same future-year sample warning inline", async ({ page }) => {
  await reachGuidedW2Step(page);

  await page.locator(".guided-doc-upload-input").first().setInputFiles(path.join(sampleDocsDir, "irs-w2-2026.pdf"));

  await expect(page.getByText(futureYearSampleMessage)).toBeVisible();
  await expect(page.getByRole("button", { name: /insert sample values/i })).toHaveCount(0);
  await expect(page.getByText(/1 docs stored locally\./i)).toHaveCount(0);
});
