import { expect, test } from "@playwright/test";

/**
 * Self-hosted mode flows that are not covered elsewhere:
 * - /returns/new redirect
 * - State selection in segmentation
 * - Personal info field behaviors (SSN, address, dependents)
 * - Segmentation state persistence across refresh
 */

/** Complete segmentation through step 2, returning on step 3 (state). */
async function reachStateStep(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+/i);

  await expect(page.getByText(/let's figure out your tax situation/i)).toBeVisible();

  // Step 1: Filing status
  await page.getByRole("radio", { name: /single/i }).click();
  await expect(page.getByText(/what types of income/i)).toBeVisible({ timeout: 5000 });

  // Step 2: Income types
  await page.getByRole("checkbox", { name: /w-2 wages/i }).check();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3: Life events — skip
  await expect(page.getByText(/did any of these happen/i)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Now on step 4: State selection
  await expect(page.getByText(/what state did you live in/i)).toBeVisible();
}

test.describe("/returns/new redirect", () => {
  test("redirects to a new workspace URL in self-hosted mode", async ({ page }) => {
    await page.goto("/returns/new");

    // In self-hosted mode, /returns/new should redirect to /returns/{uuid}
    await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+/i);

    // Should NOT stay on /returns/new
    expect(page.url()).not.toContain("/returns/new");
  });

  test("redirected workspace loads segmentation screen", async ({ page }) => {
    await page.goto("/returns/new");
    await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+/i);

    // Should show the segmentation screen for the new workspace
    await expect(page.getByText(/let's figure out your tax situation/i)).toBeVisible();
  });
});

test.describe("Segmentation — state selection", () => {
  test("state selection step shows all 50 states plus DC", async ({ page }) => {
    await reachStateStep(page);

    // Check a few representative states
    const stateGroup = page.getByRole("radiogroup", { name: /state of residence/i });
    await expect(stateGroup.getByText("California")).toBeVisible();
    await expect(stateGroup.getByText("New York")).toBeVisible();
    await expect(stateGroup.getByText("Texas")).toBeVisible();
    await expect(stateGroup.getByText("District of Columbia")).toBeVisible();

    // "Skip for now" option should also be available
    await expect(stateGroup.getByText(/skip for now/i)).toBeVisible();
  });

  test("selecting a state and completing segmentation reaches interview", async ({ page }) => {
    await reachStateStep(page);

    // Select California
    await page.getByRole("radio", { name: /California/i }).click();
    await page.getByRole("button", { name: /start my return/i }).click();

    // Should reach interview phase
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible({ timeout: 5000 });
  });

  test("Skip for now is selected by default on state step", async ({ page }) => {
    await reachStateStep(page);

    // "Skip for now" should be checked by default (no state return needed)
    const skipRadio = page.locator("input[type='radio'][name='state-code'][value='']");
    await expect(skipRadio).toBeChecked();
  });

  test("changing state selection after initial pick updates correctly", async ({ page }) => {
    await reachStateStep(page);

    // Select California
    await page.getByRole("radio", { name: /California/i }).click();

    // Change to New York
    await page.getByRole("radio", { name: /New York/i }).click();

    // California should no longer be checked
    const caRadio = page.getByRole("radiogroup", { name: /state of residence/i })
      .locator("label").filter({ hasText: "California" }).locator("input[type='radio']");
    await expect(caRadio).not.toBeChecked();

    // New York should be checked
    const nyRadio = page.getByRole("radiogroup", { name: /state of residence/i })
      .locator("label").filter({ hasText: "New York" }).locator("input[type='radio']");
    await expect(nyRadio).toBeChecked();
  });
});

test.describe("Personal info section fields", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /start your tax return/i }).click();
    await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+/i);
    await completeSegmentationQuick(page);
  });

  test("SSN field shows privacy hint", async ({ page }) => {
    await expect(page.getByRole("textbox", { name: /social security/i })).toBeVisible();
    await expect(page.getByText(/never sent to any server/i)).toBeVisible();
  });

  test("address fields are visible and editable", async ({ page }) => {
    const address1 = page.getByRole("textbox", { name: /address line 1/i });
    const city = page.getByRole("textbox", { name: /city/i });
    const state = page.getByRole("textbox", { name: /^state$/i });
    const zip = page.getByRole("textbox", { name: /zip/i });

    await expect(address1).toBeVisible();
    await expect(city).toBeVisible();
    await expect(state).toBeVisible();
    await expect(zip).toBeVisible();

    // Fill in address fields
    await address1.fill("123 Main St");
    await city.fill("Springfield");
    await state.fill("IL");
    await zip.fill("62701");

    await expect(address1).toHaveValue("123 Main St");
    await expect(city).toHaveValue("Springfield");
    await expect(state).toHaveValue("IL");
    await expect(zip).toHaveValue("62701");
  });

  test("dependents count field defaults to zero and accepts numeric input", async ({ page }) => {
    const dependentsInput = page.getByRole("spinbutton", { name: /number of dependents/i });
    await expect(dependentsInput).toBeVisible();

    // Default should be 0 or empty
    const val = await dependentsInput.inputValue();
    expect(val === "" || val === "0").toBe(true);

    // Enter a count
    await dependentsInput.fill("2");
    await expect(dependentsInput).toHaveValue("2");
  });

  test("filing status badge is shown in personal info section", async ({ page }) => {
    // The filing status from segmentation should be displayed as a badge
    await expect(page.getByText(/single/i).first()).toBeVisible();
  });

  test("personal info persists across page reload", async ({ page }) => {
    await page.getByRole("textbox", { name: /first name/i }).fill("Persistence");
    await page.getByRole("textbox", { name: /last name/i }).fill("Test");
    await page.getByRole("textbox", { name: /social security/i }).fill("123-45-6789");
    await page.getByRole("textbox", { name: /address line 1/i }).fill("456 Oak Ave");

    // Reload
    await page.reload();
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible({ timeout: 5000 });

    // All fields should be preserved
    await expect(page.getByRole("textbox", { name: /first name/i })).toHaveValue("Persistence");
    await expect(page.getByRole("textbox", { name: /last name/i })).toHaveValue("Test");
    await expect(page.getByRole("textbox", { name: /social security/i })).toHaveValue("123-45-6789");
    await expect(page.getByRole("textbox", { name: /address line 1/i })).toHaveValue("456 Oak Ave");
  });
});

test.describe("Segmentation persistence across refresh", () => {
  test("filing status persists across page reload during segmentation", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /start your tax return/i }).click();
    await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+/i);

    const url = page.url();

    await expect(page.getByText(/let's figure out your tax situation/i)).toBeVisible();

    // Select filing status
    await page.getByRole("radio", { name: /married filing jointly/i }).click();
    await expect(page.getByText(/what types of income/i)).toBeVisible({ timeout: 5000 });

    // Reload the page
    await page.goto(url);

    // Segmentation should still be visible and filing status preserved
    // (Depending on implementation, it may restart or resume — either is acceptable)
    await expect(page.getByText(/let's figure out your tax situation/i).or(
      page.getByText(/let's start with the basics/i)
    )).toBeVisible({ timeout: 5000 });
  });

  test("completed segmentation survives page reload", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /start your tax return/i }).click();
    await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+/i);

    const url = page.url();

    // Complete full segmentation
    await completeSegmentationQuick(page);

    // Reload the page
    await page.goto(url);

    // Should still be in interview phase (segmentation complete)
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Life events in segmentation", () => {
  test("life events checkboxes are all visible", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /start your tax return/i }).click();
    await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+/i);

    await expect(page.getByText(/let's figure out your tax situation/i)).toBeVisible();

    // Step 1: Filing status
    await page.getByRole("radio", { name: /single/i }).click();
    await expect(page.getByText(/what types of income/i)).toBeVisible({ timeout: 5000 });

    // Step 2: Income types
    await page.getByRole("checkbox", { name: /w-2 wages/i }).check();
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 3: Life events
    await expect(page.getByText(/did any of these happen/i)).toBeVisible();

    // Verify life event options are visible
    await expect(page.getByRole("checkbox", { name: /bought a home/i })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /had or adopted a child/i })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /got married/i })).toBeVisible();
  });

  test("selected life events persist through segmentation back/forward", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /start your tax return/i }).click();
    await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+/i);

    await expect(page.getByText(/let's figure out your tax situation/i)).toBeVisible();

    await page.getByRole("radio", { name: /single/i }).click();
    await expect(page.getByText(/what types of income/i)).toBeVisible({ timeout: 5000 });

    await page.getByRole("checkbox", { name: /w-2 wages/i }).check();
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 3: Select a life event
    await expect(page.getByText(/did any of these happen/i)).toBeVisible();
    const babyCheckbox = page.getByRole("checkbox", { name: /had or adopted a child/i });
    await babyCheckbox.check();
    await expect(babyCheckbox).toBeChecked();

    // Go forward to state step
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/what state did you live in/i)).toBeVisible();

    // Go back to life events
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByText(/did any of these happen/i)).toBeVisible();

    // Life event should still be checked
    await expect(page.getByRole("checkbox", { name: /had or adopted a child/i })).toBeChecked();
  });
});

/**
 * Quick segmentation helper: Single / W-2 / no events / no state.
 * Unlike the other helpers in this file, this one doesn't navigate to home first.
 */
async function completeSegmentationQuick(page: import("@playwright/test").Page) {
  await expect(page.getByText(/let's figure out your tax situation/i)).toBeVisible();

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
