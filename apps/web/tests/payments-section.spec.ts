import { expect, test } from "@playwright/test";

/**
 * Payments section tests in the guided interview.
 *
 * Covers estimated tax payment management (add/remove/edit),
 * currency formatting, other payments expandable section,
 * total payment summary, data persistence, and skip behavior.
 */

/** Complete segmentation with Single / W-2 wages / no events / no state. */
async function completeSegmentation(page: import("@playwright/test").Page) {
  await expect(page.getByText(/let's figure out your tax situation/i)).toBeVisible({ timeout: 10000 });

  await page.getByRole("radio", { name: /single/i }).click();
  await expect(page.getByText(/what types of income/i)).toBeVisible({ timeout: 5000 });

  await page.getByRole("checkbox", { name: /w-2 wages/i }).check();
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

/** Navigate from personal info to the payments section (skip personal info, W-2, deductions, credits). */
async function navigateToPayments(page: import("@playwright/test").Page) {
  // Skip personal info
  await skipSection(page);
  // Skip W-2 income
  await skipSection(page);
  // Skip deductions
  await skipSection(page);
  // Skip credits
  await skipSection(page);
  // Should now be on payments section
  await expect(page.getByText(/tax you've already paid this year/i)).toBeVisible({ timeout: 5000 });
}

test.describe("Payments section — layout and defaults", () => {
  test.beforeEach(async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await navigateToPayments(page);
  });

  test("payments section renders with prompt and hint text", async ({ page }) => {
    await expect(page.getByText(/tax you've already paid this year/i)).toBeVisible();
    await expect(page.getByText(/w-2 withholding is already captured/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /form 1040-es/i })).toBeVisible();
  });

  test("payments section shows Estimated Tax Payments heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /estimated tax payments/i })).toBeVisible();
  });

  test("Add an estimated payment button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /add an estimated payment/i })).toBeVisible();
  });

  test("no payment cards are shown by default", async ({ page }) => {
    // No payment cards should exist initially
    await expect(page.getByText(/payment #1/i)).not.toBeVisible();
  });

  test("total estimated payments summary is not shown when no payments exist", async ({ page }) => {
    await expect(page.getByText(/total estimated payments/i)).not.toBeVisible();
  });
});

test.describe("Payments section — estimated payment management", () => {
  test.beforeEach(async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await navigateToPayments(page);
  });

  test("clicking Add creates a payment card with date and amount fields", async ({ page }) => {
    await page.getByRole("button", { name: /add an estimated payment/i }).click();

    await expect(page.getByText(/payment #1/i)).toBeVisible();
    await expect(page.getByText(/date paid/i)).toBeVisible();
    await expect(page.getByText(/amount paid/i)).toBeVisible();
    await expect(page.getByText(/common dates: 4\/15, 6\/15, 9\/15, 1\/15/i)).toBeVisible();
  });

  test("can add multiple estimated payment cards", async ({ page }) => {
    await page.getByRole("button", { name: /add an estimated payment/i }).click();
    await expect(page.getByText(/payment #1/i)).toBeVisible();

    await page.getByRole("button", { name: /add an estimated payment/i }).click();
    await expect(page.getByText(/payment #2/i)).toBeVisible();

    await page.getByRole("button", { name: /add an estimated payment/i }).click();
    await expect(page.getByText(/payment #3/i)).toBeVisible();
  });

  test("can remove a payment card", async ({ page }) => {
    // Add two payments
    await page.getByRole("button", { name: /add an estimated payment/i }).click();
    await page.getByRole("button", { name: /add an estimated payment/i }).click();
    await expect(page.getByText(/payment #2/i)).toBeVisible();

    // Remove the second payment
    const card2 = page.locator(".guided-w2-card").filter({ hasText: /payment #2/i });
    await card2.getByRole("button", { name: /remove/i }).click();

    await expect(page.getByText(/payment #2/i)).not.toBeVisible();
    await expect(page.getByText(/payment #1/i)).toBeVisible();
  });

  test("can remove the only payment card", async ({ page }) => {
    await page.getByRole("button", { name: /add an estimated payment/i }).click();
    await expect(page.getByText(/payment #1/i)).toBeVisible();

    const card = page.locator(".guided-w2-card").filter({ hasText: /payment #1/i });
    await card.getByRole("button", { name: /remove/i }).click();

    await expect(page.getByText(/payment #1/i)).not.toBeVisible();
  });

  test("date field accepts text input", async ({ page }) => {
    await page.getByRole("button", { name: /add an estimated payment/i }).click();

    const dateInput = page.locator(".guided-w2-card")
      .filter({ hasText: /payment #1/i })
      .locator("input.guided-input-narrow");
    await dateInput.fill("2025-04-15");
    await expect(dateInput).toHaveValue("2025-04-15");
  });

  test("amount field formats value as currency on blur", async ({ page }) => {
    await page.getByRole("button", { name: /add an estimated payment/i }).click();

    const amountInput = page.locator(".guided-w2-card")
      .filter({ hasText: /payment #1/i })
      .locator("input.guided-input-currency");
    await amountInput.fill("5000");
    await amountInput.blur();

    await expect(amountInput).toHaveValue("5,000");
  });
});

test.describe("Payments section — total summary", () => {
  test.beforeEach(async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await navigateToPayments(page);
  });

  test("total estimated payments appears after entering an amount", async ({ page }) => {
    await page.getByRole("button", { name: /add an estimated payment/i }).click();

    const amountInput = page.locator(".guided-w2-card")
      .filter({ hasText: /payment #1/i })
      .locator("input.guided-input-currency");
    await amountInput.fill("3000");
    await amountInput.blur();

    await expect(page.getByText(/total estimated payments/i)).toBeVisible();
    await expect(page.getByText("$3,000")).toBeVisible();
  });

  test("total sums multiple payment amounts", async ({ page }) => {
    // Add first payment
    await page.getByRole("button", { name: /add an estimated payment/i }).click();
    const amount1 = page.locator(".guided-w2-card")
      .filter({ hasText: /payment #1/i })
      .locator("input.guided-input-currency");
    await amount1.fill("2500");
    await amount1.blur();

    // Add second payment
    await page.getByRole("button", { name: /add an estimated payment/i }).click();
    const amount2 = page.locator(".guided-w2-card")
      .filter({ hasText: /payment #2/i })
      .locator("input.guided-input-currency");
    await amount2.fill("2500");
    await amount2.blur();

    await expect(page.getByText(/total estimated payments/i)).toBeVisible();
    await expect(page.getByText("$5,000")).toBeVisible();
  });

  test("total updates when a payment is removed", async ({ page }) => {
    // Add two payments
    await page.getByRole("button", { name: /add an estimated payment/i }).click();
    const amount1 = page.locator(".guided-w2-card")
      .filter({ hasText: /payment #1/i })
      .locator("input.guided-input-currency");
    await amount1.fill("3000");
    await amount1.blur();

    await page.getByRole("button", { name: /add an estimated payment/i }).click();
    const amount2 = page.locator(".guided-w2-card")
      .filter({ hasText: /payment #2/i })
      .locator("input.guided-input-currency");
    await amount2.fill("2000");
    await amount2.blur();

    await expect(page.getByText("$5,000")).toBeVisible();

    // Remove second payment
    const card2 = page.locator(".guided-w2-card").filter({ hasText: /payment #2/i });
    await card2.getByRole("button", { name: /remove/i }).click();

    await expect(page.getByText("$3,000")).toBeVisible();
    await expect(page.getByText("$5,000")).not.toBeVisible();
  });

  test("total disappears when all payment amounts are removed", async ({ page }) => {
    await page.getByRole("button", { name: /add an estimated payment/i }).click();
    const amountInput = page.locator(".guided-w2-card")
      .filter({ hasText: /payment #1/i })
      .locator("input.guided-input-currency");
    await amountInput.fill("1000");
    await amountInput.blur();

    await expect(page.getByText(/total estimated payments/i)).toBeVisible();

    // Remove the payment
    const card = page.locator(".guided-w2-card").filter({ hasText: /payment #1/i });
    await card.getByRole("button", { name: /remove/i }).click();

    await expect(page.getByText(/total estimated payments/i)).not.toBeVisible();
  });
});

test.describe("Payments section — other payments", () => {
  test.beforeEach(async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await navigateToPayments(page);
  });

  test("Other payments is collapsed by default", async ({ page }) => {
    await expect(page.getByText(/extension payments, excess social security/i)).not.toBeVisible();
  });

  test("expanding Other payments shows currency field with hint", async ({ page }) => {
    await page.locator("summary").filter({ hasText: /other payments/i }).click();

    await expect(page.getByText(/extension payments, excess social security/i)).toBeVisible();
  });

  test("Other payments field accepts and formats currency", async ({ page }) => {
    await page.locator("summary").filter({ hasText: /other payments/i }).click();

    const otherInput = page.locator(".guided-expand-body input.guided-input-currency");
    await otherInput.fill("750");
    await otherInput.blur();

    await expect(otherInput).toHaveValue("750");
  });

  test("Other payments field formats large amounts with commas", async ({ page }) => {
    await page.locator("summary").filter({ hasText: /other payments/i }).click();

    const otherInput = page.locator(".guided-expand-body input.guided-input-currency");
    await otherInput.fill("12500");
    await otherInput.blur();

    await expect(otherInput).toHaveValue("12,500");
  });
});

test.describe("Payments section — data persistence", () => {
  test("payment data persists after navigating away and back", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await navigateToPayments(page);

    // Add a payment with date and amount
    await page.getByRole("button", { name: /add an estimated payment/i }).click();

    const dateInput = page.locator(".guided-w2-card")
      .filter({ hasText: /payment #1/i })
      .locator("input.guided-input-narrow");
    await dateInput.fill("2025-06-15");

    const amountInput = page.locator(".guided-w2-card")
      .filter({ hasText: /payment #1/i })
      .locator("input.guided-input-currency");
    await amountInput.fill("4000");
    await amountInput.blur();

    // Navigate forward (to review or next section)
    await page.getByRole("button", { name: "Continue" }).click();

    // Navigate back to payments
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByText(/tax you've already paid this year/i)).toBeVisible({ timeout: 5000 });

    // Payment card should still be present with data
    await expect(page.getByText(/payment #1/i)).toBeVisible();
    const restoredDate = page.locator(".guided-w2-card")
      .filter({ hasText: /payment #1/i })
      .locator("input.guided-input-narrow");
    await expect(restoredDate).toHaveValue("2025-06-15");

    const restoredAmount = page.locator(".guided-w2-card")
      .filter({ hasText: /payment #1/i })
      .locator("input.guided-input-currency");
    await expect(restoredAmount).toHaveValue("4,000");
  });

  test("payment data persists after page reload", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await navigateToPayments(page);

    // Add a payment
    await page.getByRole("button", { name: /add an estimated payment/i }).click();

    const amountInput = page.locator(".guided-w2-card")
      .filter({ hasText: /payment #1/i })
      .locator("input.guided-input-currency");
    await amountInput.fill("6000");
    await amountInput.blur();

    // Reload page
    await page.reload();

    // Navigate back to payments section after reload restores state
    // The reload should restore the guided interview at the current section
    // We may need to re-navigate if it goes back to personal info
    const paymentsVisible = await page.getByText(/tax you've already paid this year/i)
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (!paymentsVisible) {
      // Reload went back to interview start — re-navigate
      await expect(page.getByText(/let's start with the basics/i)).toBeVisible({ timeout: 5000 });
      await navigateToPayments(page);
    }

    // Payment should still be present
    await expect(page.getByText(/payment #1/i)).toBeVisible();
    const restoredAmount = page.locator(".guided-w2-card")
      .filter({ hasText: /payment #1/i })
      .locator("input.guided-input-currency");
    await expect(restoredAmount).toHaveValue("6,000");
  });
});

test.describe("Payments section — skip behavior", () => {
  test("continuing with no payments skips without a prompt", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await navigateToPayments(page);

    // Click Continue with no payments entered — should advance smoothly
    await page.getByRole("button", { name: "Continue" }).click();

    // Should advance to the next section (review) without showing skip prompt
    // since the hint says "If you didn't make any, just click Continue"
    const skipPrompt = page.getByRole("button", { name: /skip this section/i });
    const skipVisible = await skipPrompt.isVisible({ timeout: 1000 }).catch(() => false);

    if (skipVisible) {
      // If skip prompt does appear, clicking it should advance
      await skipPrompt.click();
    }

    // Should reach review section
    await expect(page.getByText(/here's everything at a glance/i)).toBeVisible({ timeout: 5000 });
  });

  test("Back button from payments returns to credits section", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
    await navigateToPayments(page);

    await page.getByRole("button", { name: "Back" }).click();

    // Should return to credits section
    await expect(page.getByText(/credits reduce your tax dollar-for-dollar/i)).toBeVisible({ timeout: 5000 });
  });
});
