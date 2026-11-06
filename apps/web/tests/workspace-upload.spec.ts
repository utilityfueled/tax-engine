import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator } from "@playwright/test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const sampleDocsDir = path.resolve(testDir, "../../../sample-documents/downloads");

function summaryStat(panel: Locator, label: RegExp) {
  return panel.locator(".summary-stat").filter({ has: panel.page().locator(".summary-label").filter({ hasText: label }) });
}

/** Set advanced mode in localStorage so the workspace skips guided interview. */
async function enableAdvancedMode(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    window.localStorage.setItem("tax-engine:guided-mode", "false");
  });
}

test("local workspace stores uploaded official IRS fixtures across reloads", async ({ page }, testInfo) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
  await expect(page.getByRole("heading", { name: /tax return/i })).toBeVisible();

  const nativeIrsW2Path = testInfo.outputPath("fw2--2025.pdf");
  await copyFile(path.join(sampleDocsDir, "irs-w2-2025.pdf"), nativeIrsW2Path);

  await page.locator('input[type="file"]').setInputFiles([
    nativeIrsW2Path,
    path.join(sampleDocsDir, "irs-1099-int-2024.pdf")
  ]);

  await expect(page.getByRole("listitem").filter({ hasText: /^2 uploaded documents stored locally$/ })).toBeVisible();
  await expect(page.getByText(/2 irs sample documents loaded/i)).toBeVisible();
  await expect(page.getByText("2025 Form W-2", { exact: true })).toBeVisible();
  await expect(page.getByText("Form 1099-INT (Rev. January 2024)", { exact: true })).toBeVisible();
  await expect(page.getByText("fw2--2025.pdf", { exact: true })).toBeVisible();
  await expect(page.getByText(/data found: Wages, Federal withholding/i)).toBeVisible();
  const interviewLoop = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /questions/i })
  });
  await expect(interviewLoop.getByText(/Confirm whether every W-2 is final/i)).toBeVisible();
  const returnSummary = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /return summary/i })
  });
  const uploadPanel = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /upload documents/i })
  });
  const showYourWork = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /show your work/i })
  });
  const wagesFactCard = showYourWork.locator("li.interview-card").filter({ hasText: "Wages" }).first();
  const auditTrail = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /activity log/i })
  });
  await expect(summaryStat(returnSummary, /^documents$/i)).toContainText("Ready to continue");
  await expect(summaryStat(returnSummary, /return status/i)).toContainText("Questions remaining");
  await expect(wagesFactCard.getByText("2025 Form W-2 · fw2--2025.pdf", { exact: true })).toBeVisible();
  await expect(
    auditTrail.getByText("2025 Form W-2 · fw2--2025.pdf", { exact: true })
  ).toBeVisible();
  await expect(
    auditTrail.getByText("Form 1099-INT (Rev. January 2024) · irs-1099-int-2024.pdf", { exact: true })
  ).toBeVisible();

  await page.reload();

  await expect(page.getByRole("listitem").filter({ hasText: /^2 uploaded documents stored locally$/ })).toBeVisible();
  await expect(page.getByText(/matched irs sample document/i).first()).toBeVisible();
  await expect(uploadPanel.getByText(/2 uploaded documents stored locally/i)).toBeVisible();
  await expect(uploadPanel.getByText(/^no uploads yet\.$/i)).toHaveCount(0);
  await expect(summaryStat(returnSummary, /^documents$/i)).toContainText("Ready to continue");
  await expect(wagesFactCard.getByText("2025 Form W-2 · fw2--2025.pdf", { exact: true })).toBeVisible();
  await expect(
    auditTrail.getByText("Form 1099-INT (Rev. January 2024) · irs-1099-int-2024.pdf", { exact: true })
  ).toBeVisible();
});

test("resumed returns keep the upload status aligned with persisted documents", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);

  await page.locator('input[type="file"]').setInputFiles(path.join(sampleDocsDir, "irs-w2-2025.pdf"));

  const uploadPanel = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /upload documents/i })
  });

  await expect(page.getByText("2025 Form W-2", { exact: true })).toBeVisible();
  await expect(uploadPanel.getByText(/1 docs stored locally\./i)).toBeVisible();

  await page.reload();

  await expect(page.getByText("2025 Form W-2", { exact: true })).toBeVisible();
  await expect(uploadPanel.getByText(/1 uploaded document stored locally/i)).toBeVisible();
  await expect(uploadPanel.getByText(/^no uploads yet\.$/i)).toHaveCount(0);
});

test("empty returns keep AI summary disabled until the filer uploads a document", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);

  const aiSummaryPanel = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /ai summary/i })
  });
  const aiSummaryButton = aiSummaryPanel.getByRole("button", { name: /get ai summary/i });

  await expect(aiSummaryPanel.getByText(/upload at least one tax document before generating an ai summary\./i)).toBeVisible();
  await expect(aiSummaryButton).toBeDisabled();
  await expect(aiSummaryPanel.getByText(/request id:/i)).toHaveCount(0);
});

test("incomplete returns label the export as a draft packet until interview blockers are cleared", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+$/i);

  await page.locator('input[type="file"]').setInputFiles(path.join(sampleDocsDir, "irs-w2-2025.pdf"));

  const filingPackPanel = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /draft return bundle/i })
  });
  const returnSummary = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /return summary/i })
  });

  await expect(summaryStat(returnSummary, /return status/i)).toContainText("Questions remaining");
  await expect(filingPackPanel).toContainText(/not filing-ready yet/i);
  await expect(filingPackPanel.getByRole("button", { name: /download draft return bundle/i })).toBeEnabled();
  await expect(page.getByRole("heading", { name: /^completed return$/i })).toHaveCount(0);
});

test("unknown uploads stay flagged for manual review across reloads", async ({ page }, testInfo) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+$/i);

  const unsupportedPath = testInfo.outputPath("broker-export.pdf");
  await writeUnknownPdf(unsupportedPath);

  await page.locator('input[type="file"]').setInputFiles(unsupportedPath);

  await expect(page.getByRole("listitem").filter({ hasText: /^1 uploaded document stored locally$/ })).toBeVisible();
  await expect(page.getByText(/1 documents need review/i)).toBeVisible();
  const returnSummary = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /return summary/i })
  });
  const documentPanel = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /your documents/i })
  });

  await expect(summaryStat(returnSummary, /^documents$/i)).toContainText("Needs review");
  if (await documentPanel.getByRole("button", { name: "Expand", exact: true }).isVisible()) {
      await documentPanel.getByRole("button", { name: "Expand", exact: true }).click();
    }
  await expect(documentPanel.getByText("Unclassified upload", { exact: true })).toBeVisible();
  await expect(documentPanel.getByText(/^unsupported$/i)).toBeVisible();
  await expect(page.getByText(/unrecognized/i).first()).toBeVisible();
  await expect(page.getByText(/no data found yet/i)).toBeVisible();
  await expect(page.getByText(/Unknown uploads stay metadata-only until a parser or manual mapping is added./i)).toBeVisible();
  await expect(page.getByText(/\[blocked\] check document support/i)).toBeVisible();

  await page.reload();

  await expect(documentPanel).toBeVisible();
  if (await documentPanel.getByRole("button", { name: "Expand", exact: true }).isVisible()) {
      await documentPanel.getByRole("button", { name: "Expand", exact: true }).click();
    }
  await expect(documentPanel.getByText("Unclassified upload", { exact: true })).toBeVisible();
  await expect(documentPanel.getByText(/^unsupported$/i)).toBeVisible();
  await expect(page.getByText(/unrecognized/i).first()).toBeVisible();
  await expect(summaryStat(returnSummary, /^documents$/i)).toContainText("Needs review");
  await expect(page.getByText(/\[blocked\] check document support/i)).toBeVisible();
});

test("1099-B uploads seed capital gains interview prompts across reloads", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+$/i);

  await page.locator('input[type="file"]').setInputFiles(path.join(sampleDocsDir, "irs-1099-b-2025.pdf"));

  await expect(page.getByText(/1 irs sample document loaded/i)).toBeVisible();
  const returnSummary = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /return summary/i })
  });

  await expect(summaryStat(returnSummary, /^documents$/i)).toContainText("Ready to continue");
  await expect(page.getByText("2025 Form 1099-B", { exact: true })).toBeVisible();
  await expect(page.getByText(/matched irs sample document/i).first()).toBeVisible();
  await expect(page.getByText(/data found: Broker sale proceeds, Cost basis and adjustments review/i)).toBeVisible();
  await expect(page.getByRole("region", { name: "Questions", exact: true }).getByText(/Confirm whether every broker sale belongs on Form 8949/i)).toBeVisible();
  await expect(page.getByRole("region", { name: "Questions", exact: true }).getByText(/Confirm basis reporting, wash sale adjustments, and holding periods/i)).toBeVisible();

  await page.reload();

  await expect(page.getByText("2025 Form 1099-B", { exact: true })).toBeVisible();
  await expect(page.getByText(/matched irs sample document/i).first()).toBeVisible();
  await expect(summaryStat(returnSummary, /^documents$/i)).toContainText("Ready to continue");
});

test("1099-NEC uploads seed deterministic Schedule C follow-up prompts", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+$/i);

  await page.locator('input[type="file"]').setInputFiles(path.join(sampleDocsDir, "irs-1099-nec-2025.pdf"));

  await expect(page.getByText(/1 irs sample document loaded/i)).toBeVisible();
  const returnSummary = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /return summary/i })
  });

  await expect(summaryStat(returnSummary, /^documents$/i)).toContainText("Ready to continue");
  await expect(page.getByText("Form 1099-NEC (Rev. April 2025)", { exact: true })).toBeVisible();
  await expect(page.getByText(/matched irs sample document/i).first()).toBeVisible();
  await expect(page.getByText(/data found: 1099-nec income classification, schedule c expense review/i)).toBeVisible();
  await expect(page.getByRole("region", { name: "Questions", exact: true }).getByText(/Confirm whether each Form 1099-NEC amount belongs on Schedule C/i)).toBeVisible();
  await expect(page.getByRole("region", { name: "Questions", exact: true }).getByText(/Confirm the business expenses, mileage, and home office records/i)).toBeVisible();

  await page.reload();

  await expect(page.getByText("Form 1099-NEC (Rev. April 2025)", { exact: true })).toBeVisible();
  await expect(page.getByText(/matched irs sample document/i).first()).toBeVisible();
  await expect(summaryStat(returnSummary, /^documents$/i)).toContainText("Ready to continue");
});

test("answered interview prompts persist across reloads and can be reopened", async ({ page }) => {
  const wageAnswer = "Employer confirmed the taxpayer already has the final W-2 and no corrected form is expected.";

  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+$/i);

  await page.locator('input[type="file"]').setInputFiles(path.join(sampleDocsDir, "irs-w2-2025.pdf"));

  const returnSummary = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /return summary/i })
  });
  const wagePrompt = page.getByRole("listitem").filter({
    hasText: /Confirm whether every W-2 is final and whether any boxes require follow-up questions\./i
  });
  const wageAnswerInput = wagePrompt.getByLabel(/your answer/i);

  await expect(summaryStat(returnSummary, /^questions$/i)).toContainText("0/2 answered");
  await wageAnswerInput.fill(wageAnswer);
  await wagePrompt.getByRole("button", { name: /save answer/i }).click();

  await expect(page.getByText(/answer saved:/i)).toBeVisible();
  await expect(summaryStat(returnSummary, /^questions$/i)).toContainText("1/2 answered");
  await expect(summaryStat(returnSummary, /return status/i)).toContainText("Questions remaining");
  await expect(returnSummary.getByText(/Form 1040 Lines 1 and 25a/i)).toBeVisible();
  await expect(wagePrompt.getByText(/^answered$/i)).toBeVisible();
  await expect(wagePrompt.getByText(wageAnswer, { exact: true })).toBeVisible();
  const showYourWork = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /show your work/i })
  });
  const wageFactCard = showYourWork.locator("li.interview-card").filter({ hasText: "Wages" }).first();
  const auditTrail = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /activity log/i })
  });
  await expect(wageFactCard.getByText(/^answered$/i)).toBeVisible();
  await expect(wageFactCard.getByText(wageAnswer, { exact: true })).toBeVisible();
  await expect(auditTrail.getByText(/Saved answer for Wages\./i)).toBeVisible();
  await expect(auditTrail.getByText(wageAnswer, { exact: true })).toBeVisible();
  await expect(page.getByText(/next: federal withholding/i)).toBeVisible();

  await page.reload();

  await expect(summaryStat(returnSummary, /^questions$/i)).toContainText("1/2 answered");
  await expect(summaryStat(returnSummary, /return status/i)).toContainText("Questions remaining");
  await expect(wagePrompt.getByText(/^answered$/i)).toBeVisible();
  await expect(wagePrompt.getByText(wageAnswer, { exact: true })).toBeVisible();
  await expect(wageFactCard.getByText(/^answered$/i)).toBeVisible();
  await expect(wageFactCard.getByText(wageAnswer, { exact: true })).toBeVisible();
  await expect(auditTrail.getByText(/Saved answer for Wages\./i)).toBeVisible();
  await expect(auditTrail.getByText(wageAnswer, { exact: true })).toBeVisible();
  await wagePrompt.getByRole("button", { name: /reopen question/i }).click();

  await expect(page.getByText(/reopened question:/i)).toBeVisible();
  await expect(summaryStat(returnSummary, /^questions$/i)).toContainText("0/2 answered");
  await expect(wagePrompt.getByText(/^pending$/i)).toBeVisible();
  await expect(wagePrompt.getByText(wageAnswer, { exact: true })).toHaveCount(0);
  await expect(wageFactCard.getByText(/^pending$/i)).toBeVisible();
  await expect(wageFactCard.getByText(wageAnswer, { exact: true })).toHaveCount(0);
  await expect(auditTrail.getByText(/Reopened question for Wages\./i)).toBeVisible();
  await expect(auditTrail.getByText(wageAnswer, { exact: true })).toBeVisible();
});

test("workspace screen can send a provider-safe summary through the redaction boundary", async ({ page }, testInfo) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+$/i);

  const piiNamedW2Path = testInfo.outputPath("irs-w2-2025-jane-doe-123-45-6789.pdf");
  await copyFile(path.join(sampleDocsDir, "irs-w2-2025.pdf"), piiNamedW2Path);

  await page.locator('input[type="file"]').setInputFiles(piiNamedW2Path);

  const aiSummary = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /ai summary/i })
  });

  await aiSummary.getByRole("button", { name: /get ai summary/i }).click();

  await expect(summaryStat(aiSummary, /powered by/i)).toContainText("mock-local");
  await expect(summaryStat(aiSummary, /details protected/i)).toContainText("5");
  await expect(summaryStat(aiSummary, /questions left/i)).toContainText("2");
  await expect(summaryStat(aiSummary, /return bundle ready/i)).toContainText("no");
  await expect(
    aiSummary.getByText(
      /workspace has 3 active unsupported route/i
    )
  ).toBeVisible();
  await expect(aiSummary.getByText("Name (1)", { exact: true })).toBeVisible();
  await expect(aiSummary.getByText("SSN (1)", { exact: true })).toBeVisible();
});

test("confirmed document answers still require explicit taxpayer facts", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+$/i);

  await page.locator('input[type="file"]').setInputFiles(path.join(sampleDocsDir, "irs-1099-b-2025.pdf"));

  const basisPrompt = page.getByRole("listitem").filter({
    hasText: /Confirm basis reporting, wash sale adjustments, and holding periods from each Form 1099-B\./i
  });

  await page.getByRole("listitem").filter({
    hasText: /Confirm whether every broker sale belongs on Form 8949 and whether any statements are missing\./i
  }).getByLabel(/your answer/i).fill("All broker proceeds belong on Form 8949.");
  await page.getByRole("listitem").filter({
    hasText: /Confirm whether every broker sale belongs on Form 8949 and whether any statements are missing\./i
  }).getByRole("button", { name: /save answer/i }).click();

  await basisPrompt.getByLabel(/your answer/i).fill("Basis reporting and holding periods are confirmed.");
  await basisPrompt.getByRole("button", { name: /save answer/i }).click();

  const returnSummary = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /return summary/i })
  });
  const showYourWork = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /show your work/i })
  });

  await expect(summaryStat(returnSummary, /return status/i)).toContainText("Ready to review");
  await expect(summaryStat(returnSummary, /target tax year/i)).toContainText("2025");
  await expect(returnSummary.getByText(/facts confirmed: 2\/2/i)).toBeVisible();
  await expect(returnSummary.getByText(/Form 8949/i)).toBeVisible();
  await expect(returnSummary.getByText(/Schedule D/i)).toBeVisible();
  await expect(returnSummary.getByText(/Form 1040 Line 7/i)).toBeVisible();
  await expect(page.getByText(/status: ready to review/i)).toBeVisible();
  await expect(returnSummary.getByText(/a calculation requires complete taxpayer facts for the selected year/i)).toBeVisible();
  await expect(showYourWork.getByText(/engine-recompute/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /download.*pdf/i })).toHaveCount(0);

  await page.reload();

  await expect(summaryStat(returnSummary, /return status/i)).toContainText("Ready to review");
  await expect(summaryStat(returnSummary, /target tax year/i)).toContainText("2025");
  await expect(showYourWork.getByText(/engine-recompute/i)).toHaveCount(0);
  await expect(returnSummary.getByText(/a calculation requires complete taxpayer facts for the selected year/i)).toBeVisible();
});

test("confirmed W-2 amounts cannot create a synthetic taxpayer estimate", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+$/i);

  await page.locator('input[type="file"]').setInputFiles(path.join(sampleDocsDir, "irs-w2-2025.pdf"));

  await page.getByRole("listitem").filter({
    hasText: /Confirm whether every W-2 is final and whether any boxes require follow-up questions\./i
  }).getByLabel(/your answer/i).fill("Employer confirmed the final W-2 is complete.");
  await page.getByRole("listitem").filter({
    hasText: /Confirm whether every W-2 is final and whether any boxes require follow-up questions\./i
  }).getByRole("button", { name: /save answer/i }).click();

  const withholdingPrompt = page.getByRole("listitem").filter({
    hasText: /Confirm federal and state withholding amounts from each wage statement\./i
  });
  await withholdingPrompt.getByLabel(/your answer/i).fill(
    "Federal withholding matches the taxpayer copy."
  );
  await withholdingPrompt.getByRole("button", { name: /save answer/i }).click();

  const returnSummary = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /return summary/i })
  });
  const showYourWork = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /show your work/i })
  });

  await expect(page.getByText("2025 Form W-2", { exact: true })).toBeVisible();
  await expect(page.getByText(/matched irs sample document/i).first()).toBeVisible();
  await expect(summaryStat(returnSummary, /return status/i)).toContainText("Ready to review");
  await expect(summaryStat(returnSummary, /target tax year/i)).toContainText("2025");
  await expect(returnSummary.getByText(/facts confirmed: 2\/2/i)).toBeVisible();
  await expect(returnSummary.getByText(/a calculation requires complete taxpayer facts for the selected year/i)).toBeVisible();
  await expect(showYourWork.getByText(/engine-recompute/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /download.*pdf/i })).toHaveCount(0);

  await page.reload();

  await expect(summaryStat(returnSummary, /return status/i)).toContainText("Ready to review");
  await expect(summaryStat(returnSummary, /target tax year/i)).toContainText("2025");
  await expect(showYourWork.getByText(/engine-recompute/i)).toHaveCount(0);
  await expect(returnSummary.getByText(/a calculation requires complete taxpayer facts for the selected year/i)).toBeVisible();
});

test("a future-year sample cannot populate or calculate a 2025 workspace", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);
  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+$/i);
  await page.locator('input[type="file"]').setInputFiles(path.join(sampleDocsDir, "irs-w2-2026.pdf"));
  await expect(page.getByRole("status", { name: /return status/i })).toContainText(/can't drive a 2025 return yet/i);
  await expect(page.getByRole("listitem").filter({ hasText: /^0 uploaded documents stored locally$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /download.*pdf/i })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: /^0 uploaded documents stored locally$/ })).toBeVisible();
});

test("workspace can download a local JSON review bundle after recompute", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+$/i);

  await page.locator('input[type="file"]').setInputFiles(path.join(sampleDocsDir, "irs-w2-2025.pdf"));

  await page.getByRole("listitem").filter({
    hasText: /Confirm whether every W-2 is final and whether any boxes require follow-up questions\./i
  }).getByLabel(/your answer/i).fill("Employer confirmed the final W-2 is complete.");
  await page.getByRole("listitem").filter({
    hasText: /Confirm whether every W-2 is final and whether any boxes require follow-up questions\./i
  }).getByRole("button", { name: /save answer/i }).click();

  const withholdingPrompt = page.getByRole("listitem").filter({
    hasText: /Confirm federal and state withholding amounts from each wage statement\./i
  });
  await withholdingPrompt.getByLabel(/your answer/i).fill(
    "Federal withholding matches the taxpayer copy."
  );
  await withholdingPrompt.getByRole("button", { name: /save answer/i }).click();

  const filingPackPanel = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /^(?:draft )?return bundle$/i })
  });

  await expect(filingPackPanel).toContainText(/filing exports are not yet qualified|not filing-ready yet/i);
  await expect(filingPackPanel.getByText(/included in your download/i)).toBeVisible();
  await expect(filingPackPanel.getByText(/filing instructions/i)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await filingPackPanel.getByRole("button", { name: /download (?:draft )?return bundle/i }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const downloadContents = downloadPath ? await readFile(downloadPath, "utf8") : "";

  expect(download.suggestedFilename()).toMatch(/^[a-z0-9-]+-2025-tax-return\.json$/i);
  expect(downloadContents).toContain("\"returnStatus\": \"ready-to-recompute\"");
  expect(downloadContents).toContain("\"fileCount\": 6");
  expect(downloadContents).toContain("\"path\": \"00-manifest.json\"");
  expect(downloadContents).toContain("\"path\": \"04-filing-instructions.txt\"");
  expect(downloadContents).toContain("\"path\": \"07-audit-trail.json\"");
});

test("unsupported uploads keep the workspace out of deterministic recompute even after supported answers are complete", async ({ page }, testInfo) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+$/i);

  const unsupportedPath = testInfo.outputPath("broker-export.pdf");
  await writeUnknownPdf(unsupportedPath);

  await page.locator('input[type="file"]').setInputFiles([
    path.join(sampleDocsDir, "irs-1099-b-2025.pdf"),
    unsupportedPath
  ]);

  await page.getByRole("listitem").filter({
    hasText: /Confirm whether every broker sale belongs on Form 8949 and whether any statements are missing\./i
  }).getByLabel(/your answer/i).fill("All broker proceeds belong on Form 8949.");
  await page.getByRole("listitem").filter({
    hasText: /Confirm whether every broker sale belongs on Form 8949 and whether any statements are missing\./i
  }).getByRole("button", { name: /save answer/i }).click();

  const returnSummary = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /return summary/i })
  });
  const actionRouter = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /action needed/i })
  });

  await expect(summaryStat(returnSummary, /return status/i)).toContainText("Needs review");
  await expect(page.getByText(/1 documents need review/i)).toBeVisible();
  await expect(returnSummary.getByText(/1 uploaded document still needs manual coverage review before deterministic recompute can run\./i)).toBeVisible();
  await expect(actionRouter.getByText(/answer remaining questions/i)).toBeVisible();
  await expect(actionRouter.getByText(/download your draft return packet/i)).toBeVisible();
  await expect(actionRouter.getByText(/consider a professional review/i)).toBeVisible();
  await expect(actionRouter.getByText(/Confirm basis reporting, wash sale adjustments, and holding periods from each Form 1099-B\./i)).toBeVisible();
  await expect(actionRouter.getByRole("button", { name: /go to questions/i })).toBeVisible();
  await expect(actionRouter.getByRole("button", { name: /go to draft return bundle/i })).toBeVisible();
  await expect(page.getByText(/engine-recompute/i)).toHaveCount(0);

  await page.reload();

  await expect(summaryStat(returnSummary, /return status/i)).toContainText("Needs review");
  await expect(returnSummary.getByText(/1 uploaded document still needs manual coverage review before deterministic recompute can run\./i)).toBeVisible();
  await expect(actionRouter.getByText(/answer remaining questions/i)).toBeVisible();
  await expect(actionRouter.getByText(/consider a professional review/i)).toBeVisible();
  await expect(page.getByText(/engine-recompute/i)).toHaveCount(0);
});

test("unsupported workspaces can capture consent and download a local partner-review bundle", async ({ page }, testInfo) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+$/i);

  const unsupportedPath = testInfo.outputPath("broker-export.pdf");
  await writeUnknownPdf(unsupportedPath);

  await page.locator('input[type="file"]').setInputFiles([
    path.join(sampleDocsDir, "irs-1099-b-2025.pdf"),
    unsupportedPath
  ]);

  await page.getByRole("listitem").filter({
    hasText: /Confirm whether every broker sale belongs on Form 8949 and whether any statements are missing\./i
  }).getByLabel(/your answer/i).fill("All broker proceeds belong on Form 8949.");
  await page.getByRole("listitem").filter({
    hasText: /Confirm whether every broker sale belongs on Form 8949 and whether any statements are missing\./i
  }).getByRole("button", { name: /save answer/i }).click();

  const actionRouter = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /action needed/i })
  });
  const partnerReviewPanel = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /outside review bundle/i })
  });

  await expect(actionRouter.getByText(/consider a professional review/i)).toBeVisible();
  await actionRouter.getByRole("button", { name: /go to outside review bundle/i }).click();
  await expect(partnerReviewPanel).toContainText(/Viva La Tax does not contact, assign, or supervise any reviewer/i);

  const downloadButton = partnerReviewPanel.getByRole("button", { name: /download review bundle/i });
  await expect(downloadButton).toBeDisabled();

  await partnerReviewPanel.getByLabel(/i consent to share a redacted summary of my return/i).check();
  await partnerReviewPanel.getByLabel(/i understand this is a software tool and not a professional tax preparation service/i).check();
  await partnerReviewPanel.getByLabel(/i understand any professional review happens separately/i).check();
  await expect(downloadButton).toBeEnabled();

  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const downloadContents = downloadPath ? await readFile(downloadPath, "utf8") : "";

  expect(download.suggestedFilename()).toMatch(/partner-review-request\.json$/i);
  expect(downloadContents).toContain("\"task\": \"partner-review\"");
  expect(downloadContents).toContain("\"requestKind\": \"partner-review\"");
  expect(downloadContents).toContain("\"shareRedactedDataWithPartner\": true");
  expect(downloadContents).toContain("\"acknowledgeSoftwareOnlyService\": true");
  expect(downloadContents).toContain("\"acknowledgeSeparateProfessionalEngagement\": true");
  await expect(partnerReviewPanel).toContainText(/Viva La Tax does not contact, assign, or supervise any reviewer for you\./i);
  await expect(partnerReviewPanel).toContainText(/downloaded .*partner-review-request\.json/i);
});

test("removing one uploaded document recomputes the local workspace across reloads", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+$/i);

  await page.locator('input[type="file"]').setInputFiles([
    path.join(sampleDocsDir, "irs-w2-2025.pdf"),
    path.join(sampleDocsDir, "irs-1099-int-2024.pdf")
  ]);
  const documentPanel = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /your documents/i })
  });

  await expect(page.getByRole("listitem").filter({ hasText: /^2 uploaded documents stored locally$/ })).toBeVisible();
  await page.getByRole("button", { name: /remove form 1099-int/i }).click();

  await expect(
    page.getByRole("status", { name: /return status/i })
  ).toHaveText(/removed form 1099-int \(rev\. january 2024\)\./i);
  await expect(page.getByRole("listitem").filter({ hasText: /^1 uploaded document stored locally$/ })).toBeVisible();
  await expect(page.getByText(/1 irs sample document loaded/i)).toBeVisible();
  await expect(page.getByText(/taxable interest/i)).toHaveCount(0);
  await expect(page.getByText(/confirm whether any tax-exempt interest or early withdrawal penalties also apply\./i)).toHaveCount(0);
  await expect(page.getByText("2025 Form W-2", { exact: true })).toBeVisible();

  await page.reload();

  await expect(page.getByRole("listitem").filter({ hasText: /^1 uploaded document stored locally$/ })).toBeVisible();
  await expect(page.getByText(/matched irs sample document/i).first()).toBeVisible();
  await expect(documentPanel.getByText(/form 1099-int \(rev\. january 2024\)/i)).toHaveCount(0);
});

test("duplicate uploads keep separate document cards and remove one copy at a time", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+$/i);

  await page.locator('input[type="file"]').setInputFiles([
    path.join(sampleDocsDir, "irs-w2-2025.pdf"),
    path.join(sampleDocsDir, "irs-w2-2025.pdf")
  ]);

  await expect(page.getByRole("listitem").filter({ hasText: /^2 uploaded documents stored locally$/ })).toBeVisible();
  await expect(page.getByText(/^irs-w2-2025\.pdf$/i)).toHaveCount(2);
  await expect(page.getByText(/data found: wages, federal withholding/i)).toHaveCount(2);

  await page.getByRole("button", { name: /remove 2025 form w-2/i }).first().click();

  await expect(page.getByRole("listitem").filter({ hasText: /^1 uploaded document stored locally$/ })).toBeVisible();
  await expect(page.getByText(/^irs-w2-2025\.pdf$/i)).toHaveCount(1);
  await expect(page.getByText(/data found: wages, federal withholding/i)).toHaveCount(1);

  await page.reload();

  await expect(page.getByRole("listitem").filter({ hasText: /^1 uploaded document stored locally$/ })).toBeVisible();
  await expect(page.getByText(/^irs-w2-2025\.pdf$/i)).toHaveCount(1);
});

async function writeUnknownPdf(filePath: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText("Synthetic document: a fictional equipment instruction manual.", { x: 40, y: 700, size: 12, font });
  await writeFile(filePath, await pdf.save());
}
