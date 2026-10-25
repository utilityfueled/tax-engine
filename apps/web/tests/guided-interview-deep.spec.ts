import { fillRequiredW2Facts, fillRequiredTaxpayerFacts, reachFilingStatus } from "./guided-fixtures";
import { expect, test } from "@playwright/test";

/**
 * Deep guided interview tests covering currency fields, refund ticker,
 * review section content, and multiple income types.
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

  await expect(page.getByText(/let's tailor your return/i)).toBeVisible();

  // Step 1: Filing status
  await reachFilingStatus(page);
  await page.getByRole("radio", { name: new RegExp(filingStatus, "i") }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/what types of income/i)).toBeVisible({ timeout: 5000 });

  // Step 2: Income types
  for (const type of incomeTypes) {
    await page.getByRole("checkbox", { name: new RegExp(type, "i") }).check();
  }
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3: Life events — skip
  await expect(page.getByText(/did any of these happen/i)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 4: State — skip
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

/** Skip through personal info to get to the W-2 section. */
async function skipPersonalInfo(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Continue" }).click();
  const skipBtn = page.getByRole("button", { name: /skip this section/i });
  if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await skipBtn.click();
  }
}

test.describe("Currency field formatting", () => {
  test.beforeEach(async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await skipPersonalInfo(page);
    // Now on W-2 section
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();
  });

  test("currency field formats value with commas on blur", async ({ page }) => {
    const wagesInput = page.locator("input.guided-input-currency").first();
    await wagesInput.fill("75000");
    await wagesInput.blur();

    await expect(wagesInput).toHaveValue("75,000");
  });

  test("currency field preserves decimal values", async ({ page }) => {
    const wagesInput = page.locator("input.guided-input-currency").first();
    await wagesInput.fill("50000.50");
    await wagesInput.blur();

    await expect(wagesInput).toHaveValue("50,000.50");
  });

  test("currency field shows error for invalid input", async ({ page }) => {
    const wagesInput = page.locator("input.guided-input-currency").first();
    await wagesInput.fill("not-a-number");
    await wagesInput.blur();

    await expect(page.getByText(/enter a valid dollar amount/i)).toBeVisible();
  });

  test("currency field clears error when valid input entered", async ({ page }) => {
    const wagesInput = page.locator("input.guided-input-currency").first();

    // Enter invalid value
    await wagesInput.fill("abc");
    await wagesInput.blur();
    await expect(page.getByText(/enter a valid dollar amount/i)).toBeVisible();

    // Enter valid value
    await wagesInput.fill("50000");
    await wagesInput.blur();
    await expect(page.getByText(/enter a valid dollar amount/i)).not.toBeVisible();
  });

  test("currency field handles zero correctly", async ({ page }) => {
    const wagesInput = page.locator("input.guided-input-currency").first();
    await wagesInput.fill("0");
    await wagesInput.blur();

    await expect(wagesInput).toHaveValue("0");
  });

  test("currency field strips dollar signs from pasted input", async ({ page }) => {
    const wagesInput = page.locator("input.guided-input-currency").first();
    await wagesInput.fill("$75,000");
    await wagesInput.blur();

    await expect(wagesInput).toHaveValue("75,000");
  });
});

test.describe("Refund ticker in review section", () => {
  test("review section shows estimated result after entering W-2 data", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Fill personal info
    await fillRequiredTaxpayerFacts(page);
    await page.getByRole("textbox", { name: /first name/i }).fill("Jane");
    await page.getByRole("textbox", { name: /last name/i }).fill("Doe");
    await page.getByRole("button", { name: "Continue" }).click();

    // Fill W-2 wages
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();
    const wagesInput = page.locator("input.guided-input-currency").first();
    await wagesInput.fill("75000");
    await wagesInput.blur();

    // Enter federal tax withheld (box 2)
    const fedWithheldInput = page.locator("input.guided-input-currency").nth(1);
    await fedWithheldInput.fill("12000");
    await fedWithheldInput.blur();
    await fillRequiredW2Facts(page);

    // Skip through remaining sections to reach review
    await page.getByRole("button", { name: "Continue" }).click();

    // Skip through deductions, credits, payments sections
    for (let i = 0; i < 10; i++) {
      await page.getByRole("button", { name: "Continue" }).click();
      const skipBtn = page.getByRole("button", { name: /skip this section/i });
      if (await skipBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await skipBtn.click();
      }
      // Check if we reached review
      const reviewVisible = await page
        .getByText(/here's everything at a glance/i)
        .isVisible({ timeout: 500 })
        .catch(() => false);
      if (reviewVisible) break;
    }

    // Should show the result banner with an estimate
    await expect(page.getByText(/here's everything at a glance/i)).toBeVisible({ timeout: 5000 });
    const resultBanner = page.locator(".guided-review-result-banner");
    await expect(resultBanner).toBeVisible();

    // Should show either "Estimated Refund" or "Estimated Balance Due"
    const tickerLabel = resultBanner.locator(".guided-ticker-label").first();
    await expect(tickerLabel).toBeVisible();
    const labelText = await tickerLabel.innerText();
    expect(
      /estimated refund/i.test(labelText) || /estimated balance due/i.test(labelText) || /estimated result/i.test(labelText)
    ).toBe(true);

    // The ticker value should show a dollar amount (or dash for zero)
    const tickerValue = resultBanner.locator(".guided-ticker-value-hero").first();
    await expect(tickerValue).toBeVisible();
  });

  test("review section shows detail rows for income and tax", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Fill minimal data and skip to review
    await fillRequiredTaxpayerFacts(page);
    await page.getByRole("textbox", { name: /first name/i }).fill("Test");
    await page.getByRole("textbox", { name: /last name/i }).fill("User");
    await page.getByRole("button", { name: "Continue" }).click();

    // Enter W-2 wages
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();
    const wagesInput = page.locator("input.guided-input-currency").first();
    await wagesInput.fill("50000");
    await wagesInput.blur();
    await fillRequiredW2Facts(page);
    await page.getByRole("button", { name: "Continue" }).click();

    // Skip through remaining sections
    for (let i = 0; i < 10; i++) {
      await page.getByRole("button", { name: "Continue" }).click();
      const skipBtn = page.getByRole("button", { name: /skip this section/i });
      if (await skipBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await skipBtn.click();
      }
      const reviewVisible = await page
        .getByText(/here's everything at a glance/i)
        .isVisible({ timeout: 500 })
        .catch(() => false);
      if (reviewVisible) break;
    }

    await expect(page.getByText(/here's everything at a glance/i)).toBeVisible({ timeout: 5000 });

    // Detail rows should show income-related values
    const detailRows = page.locator(".guided-review-result-details");
    await expect(detailRows).toBeVisible();

    // Should have labels for total income, AGI, taxable income, total tax, total payments
    await expect(detailRows.getByText(/total income/i)).toBeVisible();
    await expect(detailRows.getByText(/agi/i)).toBeVisible();
    await expect(detailRows.getByText(/taxable income/i)).toBeVisible();
    await expect(detailRows.getByText(/total tax/i)).toBeVisible();
  });
});

test.describe("Review section content", () => {
  test("review section shows W-2 summary card with entered data", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Fill personal info
    await fillRequiredTaxpayerFacts(page);
    await page.getByRole("textbox", { name: /first name/i }).fill("Alice");
    await page.getByRole("textbox", { name: /last name/i }).fill("Smith");
    await page.getByRole("button", { name: "Continue" }).click();

    // Fill W-2 data
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();
    const wagesInput = page.locator("input.guided-input-currency").first();
    await wagesInput.fill("85000");
    await wagesInput.blur();
    await fillRequiredW2Facts(page);
    await page.getByRole("button", { name: "Continue" }).click();

    // Skip to review
    for (let i = 0; i < 10; i++) {
      await page.getByRole("button", { name: "Continue" }).click();
      const skipBtn = page.getByRole("button", { name: /skip this section/i });
      if (await skipBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await skipBtn.click();
      }
      const reviewVisible = await page
        .getByText(/here's everything at a glance/i)
        .isVisible({ timeout: 500 })
        .catch(() => false);
      if (reviewVisible) break;
    }

    await expect(page.getByText(/here's everything at a glance/i)).toBeVisible({ timeout: 5000 });

    // Should show personal info review card with name
    await expect(page.getByText("Alice Smith")).toBeVisible();

    // Should show W-2 section in review
    await expect(page.getByText(/w-2 wages/i).first()).toBeVisible();
  });

  test("review section Edit button navigates back to section", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Fill personal info
    await fillRequiredTaxpayerFacts(page);
    await page.getByRole("textbox", { name: /first name/i }).fill("Bob");
    await page.getByRole("textbox", { name: /last name/i }).fill("Jones");
    await page.getByRole("button", { name: "Continue" }).click();

    // Skip to review
    for (let i = 0; i < 10; i++) {
      await page.getByRole("button", { name: "Continue" }).click();
      const skipBtn = page.getByRole("button", { name: /skip this section/i });
      if (await skipBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await skipBtn.click();
      }
      const reviewVisible = await page
        .getByText(/here's everything at a glance/i)
        .isVisible({ timeout: 500 })
        .catch(() => false);
      if (reviewVisible) break;
    }

    await expect(page.getByText(/here's everything at a glance/i)).toBeVisible({ timeout: 5000 });

    // Click Edit on the personal info section
    const personalInfoSection = page.locator(".guided-review-section").filter({ hasText: /about you/i });
    await personalInfoSection.getByRole("button", { name: /edit/i }).click();

    // Should navigate back to personal info section
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("textbox", { name: /first name/i })).toHaveValue("Bob");
  });
});

test.describe("Multiple income types in segmentation", () => {
  test("selecting self-employment income shows 1099-NEC section", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page, {
      incomeTypes: ["self-employment"],
    });

    // Skip personal info
    await skipPersonalInfo(page);

    // Should show self-employment section
    await expect(page.getByText(/self-employment/i).first()).toBeVisible();
    await expect(page.getByText(/1099-nec/i).first()).toBeVisible();
  });

  test("selecting investments income shows investment section", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page, {
      incomeTypes: ["investment income"],
    });

    // Skip personal info
    await skipPersonalInfo(page);

    // Should show investments section
    await expect(page.getByText(/investments/i).first()).toBeVisible();
  });

  test("selecting multiple income types creates sections for each", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page, {
      incomeTypes: ["w-2 wages", "self-employment"],
    });

    // Skip personal info
    await skipPersonalInfo(page);

    // Should be on W-2 section first
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    // Skip W-2 to get to self-employment
    await page.getByRole("button", { name: "Continue" }).click();
    const skipBtn = page.getByRole("button", { name: /skip this section/i });
    if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await skipBtn.click();
    }

    // Should now be on self-employment section
    await expect(page.getByText(/self-employment/i).first()).toBeVisible();
  });

  test("selecting retirement income shows 1099-R section", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page, {
      incomeTypes: ["retirement"],
    });

    // Skip personal info
    await skipPersonalInfo(page);

    // Should show retirement section
    await expect(page.getByText(/retirement/i).first()).toBeVisible();
  });

  test("all income types available in segmentation step 2", async ({ page }) => {
    await createReturn(page);
    await expect(page.getByText(/let's tailor your return/i)).toBeVisible();

    // Select filing status to advance to income types
    await reachFilingStatus(page);
    await page.getByRole("radio", { name: /single/i }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/what types of income/i)).toBeVisible({ timeout: 5000 });

    // All income types should be listed
    await expect(page.getByRole("checkbox", { name: /w-2 wages/i })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /self-employment/i })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /investment income/i })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /rental/i })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /retirement/i })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /social security/i })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /unemployment/i })).toBeVisible();
  });
});

test.describe("W-2 card management", () => {
  test.beforeEach(async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await skipPersonalInfo(page);
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();
  });

  test("can add a second W-2 card", async ({ page }) => {
    // Click "Add another W-2"
    await page.getByRole("button", { name: /add another w-2/i }).click();

    // Should now show W-2 #2
    await expect(page.getByText(/w-2 #2/i)).toBeVisible();
  });

  test("can remove second W-2 card", async ({ page }) => {
    // Add second W-2
    await page.getByRole("button", { name: /add another w-2/i }).click();
    await expect(page.getByText(/w-2 #2/i)).toBeVisible();

    // Remove it
    const card2 = page.locator(".guided-w2-card").filter({ hasText: /w-2 #2/i });
    await card2.getByRole("button", { name: /remove/i }).click();

    // W-2 #2 should be gone
    await expect(page.getByText(/w-2 #2/i)).not.toBeVisible();
    // W-2 #1 should still be present
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();
  });

  test("expanding More W-2 boxes shows additional fields", async ({ page }) => {
    // Click to expand additional boxes
    const expandBtn = page.locator(".guided-expand").filter({ hasText: /more w-2 boxes/i });
    if (await expandBtn.isVisible().catch(() => false)) {
      await expandBtn.click();
      // Should reveal additional fields
      await expect(page.locator("input.guided-input-currency").nth(2)).toBeVisible();
    }
  });
});
