import { fillRequiredTaxpayerFacts, reachFilingStatus } from "./guided-fixtures";
import { expect, test } from "@playwright/test";

/**
 * Progress bar navigation and keyboard shortcut tests.
 *
 * Covers clicking progress bar steps to jump between sections,
 * keyboard shortcuts (Enter to continue, Escape to go back),
 * and visual state tracking of progress steps.
 */

/** Complete segmentation with Single / W-2 wages / no events / no state. */
async function completeSegmentation(page: import("@playwright/test").Page) {
  await expect(page.getByText(/let's tailor your return/i)).toBeVisible();

  await reachFilingStatus(page);
  await page.getByRole("radio", { name: /single/i }).click();
  await page.getByRole("button", { name: "Continue" }).click();
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
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+/i);
}

/** Advance past personal info to W-2 section. */
async function advancePastPersonalInfo(page: import("@playwright/test").Page) {
  await fillRequiredTaxpayerFacts(page);
  await page.getByRole("textbox", { name: /first name/i }).fill("Test");
  await page.getByRole("textbox", { name: /last name/i }).fill("User");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/w-2 #1/i)).toBeVisible();
}

test.describe("Progress bar visual state", () => {
  test.beforeEach(async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
  });

  test("progress bar renders with current section highlighted", async ({ page }) => {
    const progressBar = page.getByRole("progressbar");
    await expect(progressBar).toBeVisible();

    // The "About You" step should be the active step
    const activeStep = page.locator("button.guided-progress-step-active");
    await expect(activeStep).toBeVisible();
    await expect(activeStep).toHaveText(/about you/i);

    // Active step should have aria-current="step"
    await expect(activeStep).toHaveAttribute("aria-current", "step");
  });

  test("progress bar updates active step after advancing", async ({ page }) => {
    // Start on personal info ("About You")
    const aboutYouStep = page.locator("button.guided-progress-step").filter({ hasText: /about you/i });
    await expect(aboutYouStep).toHaveAttribute("aria-current", "step");

    // Advance past personal info
    await advancePastPersonalInfo(page);

    // "About You" should now be marked as done (not active)
    await expect(aboutYouStep).toHaveClass(/guided-progress-step-done/);
    await expect(aboutYouStep).not.toHaveAttribute("aria-current", "step");

    // The W-2 step should now be active
    const w2Step = page.locator("button.guided-progress-step[aria-current='step']");
    await expect(w2Step).toBeVisible();
  });

  test("future sections are disabled in progress bar", async ({ page }) => {
    // On personal info — sections beyond the current one should be disabled
    const allSteps = page.locator("button.guided-progress-step");
    const stepCount = await allSteps.count();
    expect(stepCount).toBeGreaterThan(1);

    // The first step (current) should be enabled
    await expect(allSteps.first()).toBeEnabled();

    // Steps after the current one should be disabled
    for (let i = 1; i < stepCount; i++) {
      await expect(allSteps.nth(i)).toBeDisabled();
    }
  });

  test("completed section becomes enabled in progress bar", async ({ page }) => {
    const aboutYouStep = page.locator("button.guided-progress-step").filter({ hasText: /about you/i });

    // Advance past personal info to complete it
    await advancePastPersonalInfo(page);

    // "About You" should now be enabled (clickable) and marked done
    await expect(aboutYouStep).toBeEnabled();
    await expect(aboutYouStep).toHaveClass(/guided-progress-step-done/);
  });
});

test.describe("Progress bar click navigation", () => {
  test.beforeEach(async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
  });

  test("clicking a completed section jumps back to it", async ({ page }) => {
    // Fill personal info and advance to W-2
    await advancePastPersonalInfo(page);
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    // Click the "About You" step in the progress bar to jump back
    const aboutYouStep = page.locator("button.guided-progress-step-done").filter({ hasText: /about you/i });
    await aboutYouStep.click();

    // Should be back on personal info section
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible();

    // Previously entered data should still be there
    await expect(page.getByRole("textbox", { name: /first name/i })).toHaveValue("Test");
    await expect(page.getByRole("textbox", { name: /last name/i })).toHaveValue("User");
  });

  test("clicking a disabled future section does nothing", async ({ page }) => {
    // On personal info — try clicking a future disabled step
    const disabledStep = page.locator("button.guided-progress-step:disabled").first();
    if (await disabledStep.isVisible().catch(() => false)) {
      // Force click a disabled button
      await disabledStep.click({ force: true });

      // Should still be on personal info
      await expect(page.getByText(/let's start with the basics/i)).toBeVisible();
    }
  });

  test("clicking current active step stays on same section", async ({ page }) => {
    const activeStep = page.locator("button.guided-progress-step-active");
    await activeStep.click();

    // Should still be on personal info
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible();
  });

  test("jump back then forward preserves data in both sections", async ({ page }) => {
    // Fill personal info and advance
    await fillRequiredTaxpayerFacts(page);
    await page.getByRole("textbox", { name: /first name/i }).fill("JumpTest");
    await page.getByRole("textbox", { name: /last name/i }).fill("Navigator");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    // Enter some W-2 data
    const wagesInput = page.locator("input.guided-input-currency").first();
    await wagesInput.fill("60000");
    await wagesInput.blur();

    // Jump back to personal info via progress bar
    const aboutYouStep = page.locator("button.guided-progress-step-done").filter({ hasText: /about you/i });
    await aboutYouStep.click();
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible();

    // Verify personal info is preserved
    await expect(page.getByRole("textbox", { name: /first name/i })).toHaveValue("JumpTest");

    // Advance back to W-2
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    // W-2 data should still be there
    await expect(page.locator("input.guided-input-currency").first()).toHaveValue("60,000");
  });
});

test.describe("Keyboard shortcuts in guided interview", () => {
  test.beforeEach(async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
  });

  test("Enter key advances to next section when not in an input", async ({ page }) => {
    // Should be on personal info
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible();

    // Click on the section body (not an input) to ensure focus is outside inputs
    await page.getByRole("heading", { level: 2 }).last().click();

    // Press Enter — should trigger advance (shows skip prompt since fields empty)
    await page.keyboard.press("Enter");

    // Should show skip prompt since personal info is empty (generous timeout for keyboard-triggered advance)
    await expect(page.getByText(/you haven't entered any personal info/i)).toBeVisible({ timeout: 10_000 });
  });

  test("Escape key dismisses skip prompt", async ({ page }) => {
    // Use the Continue button to reliably trigger the skip prompt
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText(/you haven't entered any personal info/i)).toBeVisible();

    // Press Escape to dismiss the skip prompt
    await page.keyboard.press("Escape");

    // Skip prompt should be dismissed
    await expect(page.getByText(/you haven't entered any personal info/i)).not.toBeVisible();

    // Should still be on personal info
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible();
  });

  test("Escape key navigates back when no skip prompt is showing", async ({ page }) => {
    // Advance past personal info first
    await advancePastPersonalInfo(page);
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    // Click on section body to ensure focus is outside inputs
    await page.getByRole("heading", { level: 2 }).last().click();

    // Press Escape — should go back to personal info
    await page.keyboard.press("Escape");
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible();
  });

  test("Enter key does not advance when typing in an input field", async ({ page }) => {
    // Focus on the first name input
    const firstNameInput = page.getByRole("textbox", { name: /first name/i });
    await firstNameInput.focus();
    await firstNameInput.fill("TestName");

    // Press Enter while in the input — should NOT advance to next section
    await page.keyboard.press("Enter");

    // Should still be on personal info (Enter was absorbed by the input)
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible();
    await expect(firstNameInput).toHaveValue("TestName");
  });

  test("Escape key does not go back on first section", async ({ page }) => {
    // On personal info (first section) — Back should be disabled
    await expect(page.getByRole("button", { name: "Back" })).toBeDisabled();

    // Click section body and press Escape
    await page.getByRole("heading", { level: 2 }).last().click();
    await page.keyboard.press("Escape");

    // Should still be on personal info (can't go back from first section)
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible();
  });

  test("keyboard hint text is visible in nav area", async ({ page }) => {
    // The "Enter to continue · Esc to go back" hint should be visible
    await expect(page.getByText(/enter to continue/i)).toBeVisible();
    await expect(page.getByText(/esc to go back/i)).toBeVisible();
  });
});

test.describe("Skip prompt interactions", () => {
  test.beforeEach(async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
  });

  test("Go back and fill it in button dismisses skip prompt", async ({ page }) => {
    // Try to advance without filling in personal info
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/you haven't entered any personal info/i)).toBeVisible();

    // Click "Go back and fill it in"
    await page.getByRole("button", { name: /go back and fill it in/i }).click();

    // Skip prompt should be dismissed
    await expect(page.getByText(/you haven't entered any personal info/i)).not.toBeVisible();

    // Should still be on personal info
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible();
  });

  test("Skip this section button advances past the section", async ({ page }) => {
    // Try to advance without filling in personal info
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/you haven't entered any personal info/i)).toBeVisible();

    // Click "Skip this section"
    await page.getByRole("button", { name: /skip this section/i }).click();

    // Should now be on W-2 section
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();
  });

  test("skip prompt has alert role for accessibility", async ({ page }) => {
    await page.getByRole("button", { name: "Continue" }).click();

    // The skip prompt should have role="alert" for screen readers
    const alert = page.getByRole("alert").filter({ hasText: /you haven't entered/i });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/you haven't entered/i);
  });
});
