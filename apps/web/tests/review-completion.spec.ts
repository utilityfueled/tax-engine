import { expect, test } from "@playwright/test";

/**
 * Review section and completion screen E2E tests.
 *
 * Covers:
 * - Review section layout and content after skipping all sections
 * - Review section with W-2 data showing financial breakdown
 * - Edit buttons jump back to the correct section
 * - Different filing statuses (MFJ, HoH) through segmentation
 * - Completion screen after finishing review
 * - Responsive layout at mobile, tablet, and desktop breakpoints
 */

/** Complete segmentation with configurable options. */
async function completeSegmentation(
  page: import("@playwright/test").Page,
  options: {
    filingStatus?: "single" | "married filing jointly" | "head of household";
    incomeTypes?: string[];
  } = {}
) {
  const { filingStatus = "single", incomeTypes = ["w-2 wages"] } = options;

  await expect(page.getByText(/let's figure out your tax situation/i)).toBeVisible();

  await page.getByRole("radio", { name: new RegExp(filingStatus, "i") }).click();
  await expect(page.getByText(/what types of income/i)).toBeVisible({ timeout: 5000 });

  for (const type of incomeTypes) {
    await page.getByRole("checkbox", { name: new RegExp(type, "i") }).check();
  }
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText(/did any of these happen/i)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText(/what state did you live in/i)).toBeVisible();
  await page.getByRole("button", { name: /start my return/i }).click();

  await expect(page.getByText(/let's start with the basics/i)).toBeVisible({ timeout: 5000 });
}

/** Create a new return from the home page. */
async function createReturn(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+/i);
}

/** Skip a section by clicking Continue and then Skip if prompted. */
async function skipSection(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Continue" }).click();
  const skipBtn = page.getByRole("button", { name: /skip this section/i });
  if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await skipBtn.click();
  }
}

/** Skip all sections to reach the review screen. */
async function skipToReview(page: import("@playwright/test").Page) {
  // Skip personal info, W-2, deductions, credits, payments
  for (let i = 0; i < 5; i++) {
    await skipSection(page);
  }
  await expect(page.getByText(/here's everything at a glance/i)).toBeVisible({ timeout: 5000 });
}

test.describe("Review section — layout and content", () => {
  test("review section renders with prompt, hint, and section blocks", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await skipToReview(page);

    // Main heading and prompt
    await expect(page.getByText(/here's everything at a glance/i)).toBeVisible();
    await expect(page.getByText(/review each section below/i)).toBeVisible();

    // Section review blocks should be present
    await expect(page.locator(".guided-review-section")).not.toHaveCount(0);
  });

  test("review section shows About You section block", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await skipToReview(page);

    const aboutYou = page.locator(".guided-review-section").filter({ hasText: /about you/i });
    await expect(aboutYou).toBeVisible();
    await expect(aboutYou.getByRole("button", { name: /edit/i })).toBeVisible();
  });

  test("review section shows Income section block", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await skipToReview(page);

    const income = page.locator(".guided-review-section").filter({ hasText: /income/i }).first();
    await expect(income).toBeVisible();
    await expect(income.getByRole("button", { name: /edit/i })).toBeVisible();
  });

  test("review section shows result banner with financial breakdown", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await skipToReview(page);

    // The result banner should be present with financial details
    const banner = page.locator(".guided-review-result-banner");
    await expect(banner).toBeVisible();

    // Should show financial breakdown rows
    await expect(banner.getByText("Total income")).toBeVisible();
    await expect(banner.getByText("AGI")).toBeVisible();
    await expect(banner.getByText("Taxable income")).toBeVisible();
    await expect(banner.getByText("Total tax")).toBeVisible();
    await expect(banner.getByText("Total payments")).toBeVisible();
  });

  test("review section shows Estimated Result label when no refund or balance due", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await skipToReview(page);

    // With no data entered, result should show "Estimated Result"
    const banner = page.locator(".guided-review-result-banner");
    await expect(banner.getByText("Estimated Result")).toBeVisible();
  });
});

test.describe("Review section — with W-2 data", () => {
  test("review section shows refund after entering W-2 wages and withholding", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Skip personal info
    await skipSection(page);
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    // Enter W-2 wages and withholding
    const wagesInput = page.locator("input.guided-input-currency").first();
    await wagesInput.fill("75000");
    await wagesInput.blur();

    const fedWithheldInput = page.locator("input.guided-input-currency").nth(1);
    await fedWithheldInput.fill("15000");
    await fedWithheldInput.blur();

    // Skip remaining sections to reach review
    await skipSection(page); // past W-2
    await skipSection(page); // past deductions
    await skipSection(page); // past credits
    await skipSection(page); // past payments

    await expect(page.getByText(/here's everything at a glance/i)).toBeVisible({ timeout: 5000 });

    // Should show income values in the breakdown
    const banner = page.locator(".guided-review-result-banner");
    await expect(banner).toBeVisible();

    // Total income should reflect the wages entered
    const totalIncomeRow = banner.locator(".guided-review-row").filter({ hasText: "Total income" });
    await expect(totalIncomeRow.locator(".guided-review-value")).toContainText("$75,000");

    // Should show either "Estimated Refund" or "Estimated Balance Due"
    const label = banner.locator(".guided-ticker-label");
    const labelText = await label.innerText();
    expect(["Estimated Refund", "Estimated Balance Due"]).toContain(labelText);
  });

  test("review section total payments reflects withholding", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Skip personal info
    await skipSection(page);
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    // Enter W-2 data
    const wagesInput = page.locator("input.guided-input-currency").first();
    await wagesInput.fill("60000");
    await wagesInput.blur();

    const fedWithheldInput = page.locator("input.guided-input-currency").nth(1);
    await fedWithheldInput.fill("10000");
    await fedWithheldInput.blur();

    // Skip to review
    await skipSection(page);
    await skipSection(page);
    await skipSection(page);
    await skipSection(page);

    await expect(page.getByText(/here's everything at a glance/i)).toBeVisible({ timeout: 5000 });

    // Total payments should reflect the withholding
    const banner = page.locator(".guided-review-result-banner");
    const paymentsRow = banner.locator(".guided-review-row").filter({ hasText: "Total payments" });
    await expect(paymentsRow.locator(".guided-review-value")).toContainText("$10,000");
  });
});

test.describe("Review section — Edit button navigation", () => {
  test("clicking Edit on About You jumps back to personal info", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await skipToReview(page);

    const aboutYou = page.locator(".guided-review-section").filter({ hasText: /about you/i });
    await aboutYou.getByRole("button", { name: /edit/i }).click();

    // Should jump back to personal info section
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible({ timeout: 5000 });
  });

  test("clicking Edit on Income jumps back to W-2 section", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await skipToReview(page);

    const income = page.locator(".guided-review-section").filter({ hasText: /w-2/i });
    await income.getByRole("button", { name: /edit/i }).click();

    // Should jump back to W-2 section
    await expect(page.getByText(/w-2 #1/i)).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Completion screen", () => {
  test("completing review reaches the completion screen", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await skipToReview(page);

    // Click Continue on the review section to reach completion
    await page.getByRole("button", { name: "Continue" }).click();

    // Completion screen should show
    await expect(
      page.getByRole("heading", { name: /your return is ready for review/i })
    ).toBeVisible({ timeout: 5000 });
  });

  test("completion screen shows summary metrics", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Enter some W-2 data for meaningful metrics
    await skipSection(page);
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    const wagesInput = page.locator("input.guided-input-currency").first();
    await wagesInput.fill("50000");
    await wagesInput.blur();

    // Skip to review and then continue to completion
    await skipSection(page);
    await skipSection(page);
    await skipSection(page);
    await skipSection(page);
    await expect(page.getByText(/here's everything at a glance/i)).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(
      page.getByRole("heading", { name: /your return is ready for review/i })
    ).toBeVisible({ timeout: 5000 });

    // Summary should show Total Income and Total Tax
    await expect(page.getByText("Total Income")).toBeVisible();
    await expect(page.getByText("Total Tax")).toBeVisible();
    await expect(page.getByText("Sections Completed")).toBeVisible();
  });

  test("completion screen has Start Over and Review Full Return buttons", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await skipToReview(page);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(
      page.getByRole("heading", { name: /your return is ready for review/i })
    ).toBeVisible({ timeout: 5000 });

    await expect(page.getByRole("button", { name: /start over/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /review full return/i })).toBeVisible();
  });

  test("Start Over button returns to segmentation", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await skipToReview(page);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(
      page.getByRole("heading", { name: /your return is ready for review/i })
    ).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: /start over/i }).click();

    // Should return to segmentation
    await expect(page.getByText(/let's figure out your tax situation/i)).toBeVisible({ timeout: 5000 });
  });

  test("Review Full Return button switches to advanced workspace", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await skipToReview(page);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(
      page.getByRole("heading", { name: /your return is ready for review/i })
    ).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: /review full return/i }).click();

    // Should switch to the advanced workspace view
    await expect(page.getByRole("button", { name: /switch to guided interview/i })).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Filing status — Married Filing Jointly", () => {
  test("MFJ segmentation flow completes successfully", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page, { filingStatus: "married filing jointly" });

    // Should reach personal info
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible();

    // Filing status should show as MFJ
    await expect(page.getByText(/married filing jointly/i)).toBeVisible();
  });

  test("MFJ shows spouse name fields in personal info", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page, { filingStatus: "married filing jointly" });

    // Should show spouse fields
    await expect(page.getByText(/spouse/i).first()).toBeVisible();
  });
});

test.describe("Filing status — Head of Household", () => {
  test("HoH segmentation flow completes successfully", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page, { filingStatus: "head of household" });

    // Should reach personal info
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible();

    // Filing status should show as HoH
    await expect(page.getByText(/head of household/i)).toBeVisible();
  });
});

test.describe("Responsive layout", () => {
  test("home page renders correctly at mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    // Core content should still be visible
    await expect(page.getByRole("heading", { name: /file your taxes with confidence/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /start your tax return/i })).toBeVisible();
    await expect(page.getByRole("navigation", { name: /main navigation/i })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
  });

  test("home page renders correctly at tablet viewport", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /file your taxes with confidence/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /start your tax return/i })).toBeVisible();
    await expect(page.getByRole("navigation", { name: /main navigation/i })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
  });

  test("guided interview renders at mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await createReturn(page);

    // Segmentation should be usable on mobile
    await expect(page.getByText(/let's figure out your tax situation/i)).toBeVisible();
    await expect(page.getByText("Single")).toBeVisible();
    await expect(page.getByText("Married Filing Jointly")).toBeVisible();
  });

  test("help page renders at mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/help");

    await expect(page.getByRole("heading", { name: /help center/i })).toBeVisible();
    await expect(page.getByText(/getting started/i).first()).toBeVisible();
  });
});
