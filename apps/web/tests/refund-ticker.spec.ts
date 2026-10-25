import { fillRequiredTaxpayerFacts, fillRequiredW2Facts, reachFilingStatus } from "./guided-fixtures";
import { expect, test } from "@playwright/test";

/**
 * Refund ticker E2E tests.
 *
 * Covers the live ticker that appears alongside the guided interview:
 * - Initial empty state message
 * - Ticker updates when W-2 data is entered
 * - Ticker breakdown expand/collapse
 * - Ticker shows progress info
 * - Ticker values update when navigating between sections
 */

/** Complete segmentation with the given filing status and income types. */
async function completeSegmentation(
  page: import("@playwright/test").Page,
  options: {
    filingStatus?: "single" | "married filing jointly" | "head of household";
    incomeTypes?: string[];
  } = {}
) {
  const { filingStatus = "single", incomeTypes = ["w-2 wages"] } = options;

  await expect(page.getByText(/let's tailor your return/i)).toBeVisible({ timeout: 10000 });

  await reachFilingStatus(page);
  await page.getByRole("radio", { name: new RegExp(filingStatus, "i") }).click();
  await page.getByRole("button", { name: "Continue" }).click();
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
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+/i);
}

/** Skip a section by clicking Continue and then Skip if prompted. */
async function skipSection(page: import("@playwright/test").Page) {
  if (await page.getByRole("heading", { name: /^about you$/i }).isVisible()) {
    await fillRequiredTaxpayerFacts(page);
  }
  await page.getByRole("button", { name: "Continue" }).click();
  const skipBtn = page.getByRole("button", { name: /skip this section/i });
  if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await skipBtn.click();
  }
}

test.describe("Refund ticker — initial state", () => {
  test("an unavailable year clears a previously calculated estimate", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await fillRequiredTaxpayerFacts(page);
    const hero = page.locator(".guided-ticker-value-hero").first();
    await expect(hero).toHaveText("$0");
    await page.getByRole("combobox", { name: "Tax year for this interview", exact: true }).selectOption("2026");
    await expect(page.getByText(/2026 rules and filing forms are not yet qualified/i)).toBeVisible();
    await expect(hero).toHaveText("Enter more info for an estimate");
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Tax year for this interview", exact: true })).toHaveValue("2026");
    await expect(hero).toHaveText("Enter more info for an estimate");
  });

  test("removing a required birth date clears the estimate", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await fillRequiredTaxpayerFacts(page);
    const hero = page.locator(".guided-ticker-value-hero").first();
    await expect(hero).toHaveText("$0");
    await page.getByLabel("Your date of birth", { exact: true }).fill("");
    await expect(hero).toHaveText("Enter more info for an estimate");
  });

  test("ticker shows Live Ticker title after segmentation", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // The ticker should be visible with the "Live Ticker" title
    await expect(page.getByText("Live Ticker")).toBeVisible();

    // Missing taxpayer facts must not produce a calculation.
    const heroValue = page.locator(".guided-ticker-value-hero").first();
    await expect(heroValue).toBeVisible();
    await expect(heroValue).toHaveText("Enter more info for an estimate");
  });

  test("ticker shows section progress", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Ticker should show section progress (e.g., "1 / 6")
    await expect(page.locator(".guided-ticker-item").filter({ hasText: /section/i })).toBeVisible();
    await expect(page.locator(".guided-ticker-item").filter({ hasText: /progress/i })).toBeVisible();
  });

  test("ticker waits for complete taxpayer facts before showing income", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // No calculation is available until required facts and the year are confirmed.
    const totalIncomeItem = page.locator(".guided-ticker-item").filter({ hasText: /total income/i });
    await expect(totalIncomeItem).toHaveCount(0);
    await fillRequiredTaxpayerFacts(page);
    await expect(totalIncomeItem.locator(".guided-ticker-value")).toHaveText("$0");
  });
});

test.describe("Refund ticker — value updates", () => {
  test("ticker hero value changes after entering wages", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Required facts are still unknown immediately after segmentation.
    const heroValue = page.locator(".guided-ticker-value-hero").first();
    await expect(heroValue).toHaveText("Enter more info for an estimate");
    const heroBefore = await heroValue.innerText();

    // Skip personal info
    await skipSection(page);
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    // Enter W-2 wages
    const wagesInput = page.locator("input.guided-input-currency").first();
    await wagesInput.fill("75000");
    await wagesInput.blur();
    await fillRequiredW2Facts(page);

    // Wait for the ticker to update with new values
    await expect(async () => {
      const heroAfter = await heroValue.innerText();
      expect(heroAfter).not.toBe(heroBefore);
    }).toPass({ timeout: 10000 });

    // IRS 2025 Tax Table: $75,000 wages - $15,750 standard deduction gives
    // $59,250 taxable income; the single $59,250–$59,300 row is $7,955.
    // This unverified historical preview also shows the regular Form 2210
    // estimate: four $1,790 installments × 7% × 971 combined days / 365 = $333.
    // No prior-year safe harbor or waiver has been supplied by this fixture.
    await expect(heroValue).toHaveText("$8,288");
    await expect(page.getByText("Estimated Balance Due", { exact: true })).toBeVisible();
  });

  test("ticker shows total income after entering W-2 wages", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Skip personal info
    await skipSection(page);
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    // Enter W-2 wages
    const wagesInput = page.locator("input.guided-input-currency").first();
    await wagesInput.fill("80000");
    await wagesInput.blur();
    await fillRequiredW2Facts(page);

    // Ticker should show total income after computation
    const totalIncomeItem = page.locator(".guided-ticker-item").filter({ hasText: /total income/i });
    await expect(totalIncomeItem).toBeVisible({ timeout: 10000 });
    await expect(totalIncomeItem.locator(".guided-ticker-value")).toHaveText("$80,000");
  });

  test("ticker hero value updates when withholding is entered", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Skip personal info
    await skipSection(page);
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    // Enter W-2 wages
    const wagesInput = page.locator("input.guided-input-currency").first();
    await wagesInput.fill("75000");
    await wagesInput.blur();
    await fillRequiredW2Facts(page);

    // Wait for ticker to compute
    const totalIncomeItem = page.locator(".guided-ticker-item").filter({ hasText: /total income/i });
    await expect(totalIncomeItem).toBeVisible({ timeout: 10000 });

    // Record the current ticker hero value
    const heroValueBefore = await page.locator(".guided-ticker-value-hero").first().innerText();

    // Enter federal tax withheld (typically the second currency field)
    const fedWithheldInput = page.locator("input.guided-input-currency").nth(1);
    await fedWithheldInput.fill("15000");
    await fedWithheldInput.blur();

    // The ticker hero value should change
    await expect(async () => {
      const heroValueAfter = await page.locator(".guided-ticker-value-hero").first().innerText();
      expect(heroValueAfter).not.toBe(heroValueBefore);
    }).toPass({ timeout: 10000 });
  });
});

test.describe("Refund ticker — breakdown", () => {
  test.beforeEach(async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Skip personal info and enter W-2 data
    await skipSection(page);
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    const wagesInput = page.locator("input.guided-input-currency").first();
    await wagesInput.fill("75000");
    await wagesInput.blur();
    await fillRequiredW2Facts(page);

    const fedWithheldInput = page.locator("input.guided-input-currency").nth(1);
    await fedWithheldInput.fill("12000");
    await fedWithheldInput.blur();

    // Wait for ticker to compute
    const totalIncomeItem = page.locator(".guided-ticker-item").filter({ hasText: /total income/i });
    await expect(totalIncomeItem).toBeVisible({ timeout: 10000 });
  });

  test("clicking ticker hero expands breakdown with Show details hint", async ({ page }) => {
    await page.getByRole("button", { name: "Expand Ticker", exact: true }).click();
    // Breakdown should be collapsed initially
    await expect(page.getByText("Show details")).toBeVisible();
    await expect(page.locator(".guided-ticker-breakdown")).not.toBeVisible();

    // Click the hero area to expand
    const heroItem = page.locator(".guided-ticker-clickable").first();
    await heroItem.click();

    // Breakdown should now be visible
    await expect(page.locator(".guided-ticker-breakdown")).toBeVisible();
    await expect(page.getByText("Hide details")).toBeVisible();
  });

  test("breakdown shows all detail rows", async ({ page }) => {
    await page.getByRole("button", { name: "Expand Ticker", exact: true }).click();
    // Expand breakdown
    const heroItem = page.locator(".guided-ticker-clickable").first();
    await heroItem.click();

    await expect(page.locator(".guided-ticker-breakdown")).toBeVisible();

    // All standard breakdown rows should be present
    const breakdown = page.locator(".guided-ticker-breakdown");
    await expect(breakdown.getByText("Total Income")).toBeVisible();
    await expect(breakdown.getByText("Adjusted Gross Income")).toBeVisible();
    await expect(breakdown.getByText("Taxable Income")).toBeVisible();
    await expect(breakdown.getByText("Total Tax")).toBeVisible();
    await expect(breakdown.getByText(/Total Payments.*Withholding/i)).toBeVisible();

    // Should show either Refund or Balance Due result row
    const resultRow = breakdown.locator(".guided-ticker-breakdown-result");
    await expect(resultRow).toBeVisible();
  });

  test("clicking ticker hero again collapses breakdown", async ({ page }) => {
    await page.getByRole("button", { name: "Expand Ticker", exact: true }).click();
    // Expand
    const heroItem = page.locator(".guided-ticker-clickable").first();
    await heroItem.click();
    await expect(page.locator(".guided-ticker-breakdown")).toBeVisible();

    // Collapse
    await heroItem.click();
    await expect(page.locator(".guided-ticker-breakdown")).not.toBeVisible();
    await expect(page.getByText("Show details")).toBeVisible();
  });

  test("breakdown is keyboard accessible via Enter key", async ({ page }) => {
    await page.getByRole("button", { name: "Expand Ticker", exact: true }).click();
    const heroItem = page.locator(".guided-ticker-clickable").first();

    // Focus and press Enter
    await heroItem.focus();
    await page.keyboard.press("Enter");

    await expect(page.locator(".guided-ticker-breakdown")).toBeVisible();

    // Press Enter again to collapse
    await page.keyboard.press("Enter");
    await expect(page.locator(".guided-ticker-breakdown")).not.toBeVisible();
  });

  test("breakdown is keyboard accessible via Space key", async ({ page }) => {
    await page.getByRole("button", { name: "Expand Ticker", exact: true }).click();
    const heroItem = page.locator(".guided-ticker-clickable").first();

    await heroItem.focus();
    await page.keyboard.press("Space");

    await expect(page.locator(".guided-ticker-breakdown")).toBeVisible();
  });

  test("Escape key collapses expanded breakdown", async ({ page }) => {
    await page.getByRole("button", { name: "Expand Ticker", exact: true }).click();
    const heroItem = page.locator(".guided-ticker-clickable").first();

    // Expand via click
    await heroItem.click();
    await expect(page.locator(".guided-ticker-breakdown")).toBeVisible();

    // Press Escape to collapse
    await heroItem.focus();
    await page.keyboard.press("Escape");
    await expect(page.locator(".guided-ticker-breakdown")).not.toBeVisible();
  });

  test("hero item has correct aria-expanded attribute", async ({ page }) => {
    await page.getByRole("button", { name: "Expand Ticker", exact: true }).click();
    const heroItem = page.locator(".guided-ticker-clickable").first();

    // Initially collapsed
    await expect(heroItem).toHaveAttribute("aria-expanded", "false");

    // After expanding
    await heroItem.click();
    await expect(heroItem).toHaveAttribute("aria-expanded", "true");

    // After collapsing
    await heroItem.click();
    await expect(heroItem).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("Refund ticker — interactive after segmentation", () => {
  test("hero item has button role after segmentation", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    await fillRequiredTaxpayerFacts(page);
    await page.getByRole("button", { name: "Expand Ticker", exact: true }).click();
    // Complete facts make the expanded hero interactive.
    const heroItem = page.locator(".guided-ticker-item-hero").first();
    await expect(heroItem).toBeVisible();

    const role = await heroItem.getAttribute("role");
    expect(role).toBe("button");
  });

  test("Show details hint is visible after segmentation", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    await fillRequiredTaxpayerFacts(page);
    await page.getByRole("button", { name: "Expand Ticker", exact: true }).click();
    // Complete facts make the detail controls available.
    await expect(page.getByText("Show details")).toBeVisible();
  });
});

test.describe("Refund ticker — persists across sections", () => {
  test("ticker remains visible when navigating between sections", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Skip personal info and enter W-2 data
    await skipSection(page);
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    const wagesInput = page.locator("input.guided-input-currency").first();
    await wagesInput.fill("65000");
    await wagesInput.blur();
    await fillRequiredW2Facts(page);

    // Wait for ticker to show values
    const totalIncomeItem = page.locator(".guided-ticker-item").filter({ hasText: /total income/i });
    await expect(totalIncomeItem).toBeVisible({ timeout: 10000 });
    await expect(totalIncomeItem.locator(".guided-ticker-value")).toHaveText("$65,000");

    // Navigate to next section (deductions)
    await skipSection(page);

    // Ticker should still be visible with the same total income
    await expect(page.getByText("Live Ticker")).toBeVisible();
    await expect(totalIncomeItem.locator(".guided-ticker-value")).toHaveText("$65,000");
  });

  test("ticker section counter updates when advancing", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Record the section counter value on personal info
    const sectionItem = page.locator(".guided-ticker-item").filter({ hasText: /section/i });
    const sectionBefore = await sectionItem.locator(".guided-ticker-value").innerText();

    // Advance past personal info
    await skipSection(page);

    // Section counter should update
    const sectionAfter = await sectionItem.locator(".guided-ticker-value").innerText();
    expect(sectionAfter).not.toBe(sectionBefore);
  });

  test("ticker progress updates when advancing sections", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Record progress on personal info
    const progressItem = page.locator(".guided-ticker-item").filter({ hasText: /progress/i });
    const progressBefore = await progressItem.locator(".guided-ticker-value").innerText();

    // Advance past personal info
    await skipSection(page);

    // Progress should increase
    const progressAfter = await progressItem.locator(".guided-ticker-value").innerText();
    const numBefore = parseInt(progressBefore);
    const numAfter = parseInt(progressAfter);
    expect(numAfter).toBeGreaterThan(numBefore);
  });

  test("ticker updates when going back and changing W-2 data", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Skip personal info and enter W-2 data
    await skipSection(page);
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    const wagesInput = page.locator("input.guided-input-currency").first();
    await wagesInput.fill("50000");
    await wagesInput.blur();
    await fillRequiredW2Facts(page);

    // Wait for ticker to show total income
    const totalIncomeItem = page.locator(".guided-ticker-item").filter({ hasText: /total income/i });
    await expect(totalIncomeItem.locator(".guided-ticker-value")).toHaveText("$50,000", { timeout: 10000 });

    // Advance past W-2
    await skipSection(page);

    // Go back to W-2
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    // Change the wages
    const wagesInputAgain = page.locator("input.guided-input-currency").first();
    await wagesInputAgain.fill("90000");
    await wagesInputAgain.blur();

    // Ticker should update to reflect the new amount
    await expect(totalIncomeItem.locator(".guided-ticker-value")).toHaveText("$90,000", { timeout: 10000 });
  });
});
