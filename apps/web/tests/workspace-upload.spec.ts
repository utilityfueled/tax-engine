import { copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator } from "@playwright/test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const sampleDocsDir = path.resolve(testDir, "../../../sample-documents/downloads");

function summaryStat(panel: Locator, label: RegExp) {
  return panel.locator(".summary-stat").filter({ hasText: label });
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
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+(?:\?create=1)?$/i);
  await expect(page.getByRole("heading", { name: /tax return/i })).toBeVisible();

  const nativeIrsW2Path = testInfo.outputPath("fw2.pdf");
  await copyFile(path.join(sampleDocsDir, "irs-w2-2026.pdf"), nativeIrsW2Path);

  await page.locator('input[type="file"]').setInputFiles([
    nativeIrsW2Path,
    path.join(sampleDocsDir, "irs-1099-int-2024.pdf")
  ]);

  await expect(page.getByRole("listitem").filter({ hasText: /^2 documents stored locally$/ })).toBeVisible();
  await expect(page.getByText(/2 irs sample documents loaded/i)).toBeVisible();
  await expect(page.getByText("2026 Form W-2 (official info-copy PDF)", { exact: true })).toBeVisible();
  await expect(page.getByText("Form 1099-INT (Rev. January 2024)", { exact: true })).toBeVisible();
  await expect(page.getByText("fw2.pdf", { exact: true })).toBeVisible();
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
  await expect(summaryStat(returnSummary, /^documents$/i)).toContainText("Ready for questions");
  await expect(summaryStat(returnSummary, /return status/i)).toContainText("Needs review");
  await expect(wagesFactCard.getByText("2026 Form W-2 (official info-copy PDF) · fw2.pdf", { exact: true })).toBeVisible();
  await expect(
    auditTrail.getByText("2026 Form W-2 (official info-copy PDF) · fw2.pdf", { exact: true })
  ).toBeVisible();
  await expect(
    auditTrail.getByText("Form 1099-INT (Rev. January 2024) · irs-1099-int-2024.pdf", { exact: true })
  ).toBeVisible();

  await page.reload();

  await expect(page.getByRole("listitem").filter({ hasText: /^2 documents stored locally$/ })).toBeVisible();
  await expect(page.getByText(/matched irs sample document/i).first()).toBeVisible();
  await expect(uploadPanel.getByText(/2 uploaded documents stored locally/i)).toBeVisible();
  await expect(uploadPanel.getByText(/^no uploads yet\.$/i)).toHaveCount(0);
  await expect(summaryStat(returnSummary, /^documents$/i)).toContainText("Ready for questions");
  await expect(wagesFactCard.getByText("2026 Form W-2 (official info-copy PDF) · fw2.pdf", { exact: true })).toBeVisible();
  await expect(
    auditTrail.getByText("Form 1099-INT (Rev. January 2024) · irs-1099-int-2024.pdf", { exact: true })
  ).toBeVisible();
});

test("resumed returns keep the upload status aligned with persisted documents", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+(?:\?create=1)?$/i);

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
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+(?:\?create=1)?$/i);

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
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+$/i);

  await page.locator('input[type="file"]').setInputFiles(path.join(sampleDocsDir, "irs-w2-2025.pdf"));

  const filingPackPanel = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /draft return packet/i })
  });
  const returnSummary = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /return summary/i })
  });

  await expect(summaryStat(returnSummary, /return status/i)).toContainText("Questions remaining");
  await expect(filingPackPanel).toContainText(/not filing-ready yet/i);
  await expect(filingPackPanel.getByRole("button", { name: /download draft return packet/i })).toBeEnabled();
  await expect(page.getByRole("heading", { name: /^completed return$/i })).toHaveCount(0);
});

test("unknown uploads stay flagged for manual review across reloads", async ({ page }, testInfo) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+$/i);

  const unsupportedPath = testInfo.outputPath("broker-export.pdf");
  await copyFile(path.join(sampleDocsDir, "irs-1099-div-2024.pdf"), unsupportedPath);

  await page.locator('input[type="file"]').setInputFiles(unsupportedPath);

  await expect(page.getByText(/1 docs stored locally\./i)).toBeVisible();
  await expect(page.getByText(/1 documents need review/i)).toBeVisible();
  const returnSummary = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /return summary/i })
  });
  const documentPanel = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /your documents/i })
  });

  await expect(summaryStat(returnSummary, /^documents$/i)).toContainText("Needs review");
  await expect(page.getByText("Unclassified upload", { exact: true })).toBeVisible();
  await expect(documentPanel.getByText(/^unsupported$/i)).toBeVisible();
  await expect(page.getByText(/unrecognized/i).first()).toBeVisible();
  await expect(page.getByText(/no data found yet/i)).toBeVisible();
  await expect(page.getByText(/Unknown uploads stay metadata-only until a parser or manual mapping is added./i)).toBeVisible();
  await expect(page.getByText(/\[blocked\] check document support/i)).toBeVisible();

  await page.reload();

  await expect(page.getByText("Unclassified upload", { exact: true })).toBeVisible();
  await expect(documentPanel.getByText(/^unsupported$/i)).toBeVisible();
  await expect(page.getByText(/unrecognized/i).first()).toBeVisible();
  await expect(summaryStat(returnSummary, /^documents$/i)).toContainText("Needs review");
  await expect(page.getByText(/\[blocked\] check document support/i)).toBeVisible();
});

test("1099-B uploads seed capital gains interview prompts across reloads", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+$/i);

  await page.locator('input[type="file"]').setInputFiles(path.join(sampleDocsDir, "irs-1099-b-2025.pdf"));

  await expect(page.getByText(/1 irs sample document loaded/i)).toBeVisible();
  const returnSummary = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /return summary/i })
  });

  await expect(summaryStat(returnSummary, /^documents$/i)).toContainText("Ready for questions");
  await expect(page.getByText("2025 Form 1099-B", { exact: true })).toBeVisible();
  await expect(page.getByText(/matched irs sample document/i).first()).toBeVisible();
  await expect(page.getByText(/data found: Broker sale proceeds, Cost basis and adjustments review/i)).toBeVisible();
  await expect(page.getByText(/Confirm whether every broker sale belongs on Form 8949/i)).toBeVisible();
  await expect(page.getByText(/Confirm basis reporting, wash sale adjustments, and holding periods/i)).toBeVisible();

  await page.reload();

  await expect(page.getByText("2025 Form 1099-B", { exact: true })).toBeVisible();
  await expect(page.getByText(/matched irs sample document/i).first()).toBeVisible();
  await expect(summaryStat(returnSummary, /^documents$/i)).toContainText("Ready for questions");
});

test("1099-NEC uploads seed deterministic Schedule C follow-up prompts", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+$/i);

  await page.locator('input[type="file"]').setInputFiles(path.join(sampleDocsDir, "irs-1099-nec-2025.pdf"));

  await expect(page.getByText(/1 irs sample document loaded/i)).toBeVisible();
  const returnSummary = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /return summary/i })
  });

  await expect(summaryStat(returnSummary, /^documents$/i)).toContainText("Ready for questions");
  await expect(page.getByText("Form 1099-NEC (Rev. April 2025)", { exact: true })).toBeVisible();
  await expect(page.getByText(/matched irs sample document/i).first()).toBeVisible();
  await expect(page.getByText(/data found: 1099-nec income classification, schedule c expense review/i)).toBeVisible();
  await expect(page.getByText(/Confirm whether each Form 1099-NEC amount belongs on Schedule C/i)).toBeVisible();
  await expect(page.getByText(/Confirm the business expenses, mileage, and home office records/i)).toBeVisible();

  await page.reload();

  await expect(page.getByText("Form 1099-NEC (Rev. April 2025)", { exact: true })).toBeVisible();
  await expect(page.getByText(/matched irs sample document/i).first()).toBeVisible();
  await expect(summaryStat(returnSummary, /^documents$/i)).toContainText("Ready for questions");
});

test("answered interview prompts persist across reloads and can be reopened", async ({ page }) => {
  const wageAnswer = "Employer confirmed the taxpayer already has the final W-2 and no corrected form is expected.";

  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+$/i);

  await page.locator('input[type="file"]').setInputFiles(path.join(sampleDocsDir, "irs-w2-2026.pdf"));

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
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+$/i);

  const piiNamedW2Path = testInfo.outputPath("irs-w2-2026-jane-doe-123-45-6789.pdf");
  await copyFile(path.join(sampleDocsDir, "irs-w2-2026.pdf"), piiNamedW2Path);

  await page.locator('input[type="file"]').setInputFiles(piiNamedW2Path);

  const aiSummary = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /ai summary/i })
  });

  await aiSummary.getByRole("button", { name: /get ai summary/i }).click();

  await expect(summaryStat(aiSummary, /powered by/i)).toContainText("mock-local");
  await expect(summaryStat(aiSummary, /info protected/i)).toContainText("2");
  await expect(summaryStat(aiSummary, /open questions/i)).toContainText("2");
  await expect(summaryStat(aiSummary, /ready to calculate/i)).toContainText("no");
  await expect(
    aiSummary.getByText(
      /Workspace still needs 2 interview confirmation\(s\) before deterministic recompute can run\./i
    )
  ).toBeVisible();
  await expect(aiSummary.getByText("[person-name-1]", { exact: true })).toBeVisible();
  await expect(aiSummary.getByText("[ssn-1]", { exact: true })).toBeVisible();
});

test("fully answered supported facts flip the recompute summary to ready", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+$/i);

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

  await expect(summaryStat(returnSummary, /return status/i)).toContainText("Ready to calculate");
  await expect(summaryStat(returnSummary, /target tax year/i)).toContainText("2025");
  await expect(returnSummary.getByText(/facts confirmed: 2\/2/i)).toBeVisible();
  await expect(returnSummary.getByText(/Form 8949/i)).toBeVisible();
  await expect(returnSummary.getByText(/Schedule D/i)).toBeVisible();
  await expect(returnSummary.getByText(/Form 1040 Line 7/i)).toBeVisible();
  await expect(page.getByText(/status: ready to calculate/i)).toBeVisible();
  await expect(showYourWork.getByText(/filing method/i)).toBeVisible();
  await expect(showYourWork.getByText(/engine-recompute/i)).toBeVisible();
  await expect(summaryStat(showYourWork, /based on/i)).toContainText("1 document");
  await expect(showYourWork.getByText(/uploaded PDFs are not parsed yet/i)).toBeVisible();
  await expect(showYourWork.getByText("total tax", { exact: true })).toBeVisible();
  await expect(showYourWork.getByText("$1,660", { exact: true }).first()).toBeVisible();
  await expect(showYourWork.getByText(/1040 Line 24/i)).toBeVisible();
  await expect(showYourWork.getByText(/Tax after credits \+ additional taxes/i)).toBeVisible();

  await page.reload();

  await expect(summaryStat(returnSummary, /return status/i)).toContainText("Ready to calculate");
  await expect(summaryStat(returnSummary, /target tax year/i)).toContainText("2025");
  await expect(showYourWork.getByText(/engine-recompute/i)).toBeVisible();
  await expect(showYourWork.getByText("$1,660", { exact: true }).first()).toBeVisible();
});

test("supported 2025 W-2 uploads can reach deterministic recompute after interview confirmation", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+$/i);

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
  await expect(summaryStat(returnSummary, /return status/i)).toContainText("Ready to calculate");
  await expect(summaryStat(returnSummary, /target tax year/i)).toContainText("2025");
  await expect(returnSummary.getByText(/facts confirmed: 2\/2/i)).toBeVisible();
  await expect(showYourWork.getByText(/filing method/i)).toBeVisible();
  await expect(showYourWork.getByText(/engine-recompute/i)).toBeVisible();
  await expect(summaryStat(showYourWork, /based on/i)).toContainText("1 document");
  await expect(showYourWork.getByText("total tax", { exact: true })).toBeVisible();
  await expect(showYourWork.getByText("$4,202", { exact: true }).first()).toBeVisible();
  await expect(showYourWork.getByText("$798", { exact: true }).first()).toBeVisible();

  await page.reload();

  await expect(summaryStat(returnSummary, /return status/i)).toContainText("Ready to calculate");
  await expect(summaryStat(returnSummary, /target tax year/i)).toContainText("2025");
  await expect(showYourWork.getByText(/engine-recompute/i)).toBeVisible();
  await expect(showYourWork.getByText("$4,202", { exact: true }).first()).toBeVisible();
  await expect(showYourWork.getByText("$798", { exact: true }).first()).toBeVisible();
});

test("unsupported tax years stay reviewable with traced next actions after answers are complete", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+$/i);

  await page.locator('input[type="file"]').setInputFiles(path.join(sampleDocsDir, "irs-w2-2026.pdf"));

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
  const actionRouter = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /action needed/i })
  });
  const filingPackPanel = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /completed return/i })
  });

  await expect(summaryStat(returnSummary, /return status/i)).toContainText("Needs review");
  await expect(summaryStat(returnSummary, /target tax year/i)).toContainText("2026");
  await expect(returnSummary.getByText(/Tax year 2026 is not available for deterministic recompute yet\./i)).toBeVisible();
  await expect(actionRouter.getByText(/download your completed return/i)).toBeVisible();
  await expect(actionRouter.getByText(/consider outside review/i)).toBeVisible();
  await expect(actionRouter.getByText(/^Wages$/i)).toHaveCount(2);
  await expect(actionRouter.getByText(/^Federal withholding$/i)).toHaveCount(2);
  await expect(
    actionRouter.getByText("2026 Form W-2 (official info-copy PDF) · irs-w2-2026.pdf", { exact: true })
  ).toHaveCount(2);
  await expect(actionRouter.getByRole("button", { name: /go to completed return/i })).toBeVisible();
  await expect(filingPackPanel.getByText(/situations to review outside this product/i)).toBeVisible();
  await expect(page.getByText(/engine-recompute/i)).toHaveCount(0);

  await page.reload();

  await expect(summaryStat(returnSummary, /return status/i)).toContainText("Needs review");
  await expect(actionRouter.getByText(/^Wages$/i)).toHaveCount(2);
  await expect(actionRouter.getByText(/^Federal withholding$/i)).toHaveCount(2);
  await expect(
    actionRouter.getByText("2026 Form W-2 (official info-copy PDF) · irs-w2-2026.pdf", { exact: true })
  ).toHaveCount(2);
  await expect(page.getByText(/engine-recompute/i)).toHaveCount(0);
});

test("workspace can download a deterministic filing pack after recompute is ready", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+$/i);

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
    has: page.getByRole("heading", { name: /completed return/i })
  });

  await expect(filingPackPanel.getByText(/ready to calculate/i)).toBeVisible();
  await expect(filingPackPanel.getByText(/included in your download/i)).toBeVisible();
  await expect(filingPackPanel.getByText(/filing instructions/i)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await filingPackPanel.getByRole("button", { name: /download completed return/i }).click();
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
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+$/i);

  const unsupportedPath = testInfo.outputPath("broker-export.pdf");
  await copyFile(path.join(sampleDocsDir, "irs-1099-div-2024.pdf"), unsupportedPath);

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
  await expect(actionRouter.getByText(/download your completed return/i)).toBeVisible();
  await expect(actionRouter.getByText(/consider outside review/i)).toBeVisible();
  await expect(actionRouter.getByText(/Confirm basis reporting, wash sale adjustments, and holding periods from each Form 1099-B\./i)).toBeVisible();
  await expect(actionRouter.getByRole("button", { name: /go to questions/i })).toBeVisible();
  await expect(actionRouter.getByRole("button", { name: /go to completed return/i })).toBeVisible();
  await expect(page.getByText(/engine-recompute/i)).toHaveCount(0);

  await page.reload();

  await expect(summaryStat(returnSummary, /return status/i)).toContainText("Needs review");
  await expect(returnSummary.getByText(/1 uploaded document still needs manual coverage review before deterministic recompute can run\./i)).toBeVisible();
  await expect(actionRouter.getByText(/answer remaining questions/i)).toBeVisible();
  await expect(actionRouter.getByText(/consider outside review/i)).toBeVisible();
  await expect(page.getByText(/engine-recompute/i)).toHaveCount(0);
});

test("unsupported workspaces can capture consent and download a local partner-review bundle", async ({ page }, testInfo) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+$/i);

  const unsupportedPath = testInfo.outputPath("broker-export.pdf");
  await copyFile(path.join(sampleDocsDir, "irs-1099-div-2024.pdf"), unsupportedPath);

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

  await expect(actionRouter.getByText(/consider outside review/i)).toBeVisible();
  await actionRouter.getByRole("button", { name: /go to outside review bundle/i }).click();
  await expect(partnerReviewPanel).toContainText(/this app does not contact, assign, or engage a reviewer/i);

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
  await expect(partnerReviewPanel).toContainText(/this app does not contact, assign, or engage a reviewer on your behalf\./i);
  await expect(partnerReviewPanel).toContainText(/downloaded .*partner-review-request\.json/i);
});

test("removing one uploaded document recomputes the local workspace across reloads", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+$/i);

  await page.locator('input[type="file"]').setInputFiles([
    path.join(sampleDocsDir, "irs-w2-2026.pdf"),
    path.join(sampleDocsDir, "irs-1099-int-2024.pdf")
  ]);
  const documentPanel = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /your documents/i })
  });

  await expect(page.getByRole("listitem").filter({ hasText: /^2 documents stored locally$/ })).toBeVisible();
  await page.getByRole("button", { name: /remove form 1099-int/i }).click();

  await expect(
    page.getByRole("status", { name: /return status/i })
  ).toHaveText(/removed form 1099-int \(rev\. january 2024\)\./i);
  await expect(page.getByRole("listitem").filter({ hasText: /^1 documents stored locally$/ })).toBeVisible();
  await expect(page.getByText(/1 irs sample document loaded/i)).toBeVisible();
  await expect(page.getByText(/taxable interest/i)).toHaveCount(0);
  await expect(page.getByText(/confirm whether any tax-exempt interest or early withdrawal penalties also apply\./i)).toHaveCount(0);
  await expect(page.getByText("2026 Form W-2 (official info-copy PDF)", { exact: true })).toBeVisible();

  await page.reload();

  await expect(page.getByRole("listitem").filter({ hasText: /^1 documents stored locally$/ })).toBeVisible();
  await expect(page.getByText(/matched irs sample document/i).first()).toBeVisible();
  await expect(documentPanel.getByText(/form 1099-int \(rev\. january 2024\)/i)).toHaveCount(0);
});

test("duplicate uploads keep separate document cards and remove one copy at a time", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+$/i);

  await page.locator('input[type="file"]').setInputFiles([
    path.join(sampleDocsDir, "irs-w2-2026.pdf"),
    path.join(sampleDocsDir, "irs-w2-2026.pdf")
  ]);

  await expect(page.getByRole("listitem").filter({ hasText: /^2 documents stored locally$/ })).toBeVisible();
  await expect(page.getByText(/^irs-w2-2026\.pdf$/i)).toHaveCount(2);
  await expect(page.getByText(/data found: wages, federal withholding/i)).toHaveCount(2);

  await page.getByRole("button", { name: /remove 2026 form w-2/i }).first().click();

  await expect(page.getByRole("listitem").filter({ hasText: /^1 documents stored locally$/ })).toBeVisible();
  await expect(page.getByText(/^irs-w2-2026\.pdf$/i)).toHaveCount(1);
  await expect(page.getByText(/data found: wages, federal withholding/i)).toHaveCount(1);

  await page.reload();

  await expect(page.getByRole("listitem").filter({ hasText: /^1 documents stored locally$/ })).toBeVisible();
  await expect(page.getByText(/^irs-w2-2026\.pdf$/i)).toHaveCount(1);
});
