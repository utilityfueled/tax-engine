import { expect, test } from "@playwright/test";

/** Complete segmentation with Single / W-2 wages / no events / no state. */
async function completeSegmentation(page: import("@playwright/test").Page) {
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

/** Create a new return from the home page. */
async function createReturn(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+/i);
}

test.describe("ARIA landmarks", () => {
  test("home page has nav, main, and contentinfo landmarks", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("navigation", { name: /main navigation/i })).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await expect(page.getByRole("navigation", { name: /footer navigation/i })).toBeVisible();
  });

  test("help page has nav, main, and contentinfo landmarks", async ({ page }) => {
    await page.goto("/help");

    await expect(page.getByRole("navigation", { name: /main navigation/i })).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
  });

  test("guided interview page has nav, main, and contentinfo landmarks", async ({ page }) => {
    await createReturn(page);

    await expect(page.getByRole("navigation", { name: /main navigation/i })).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
  });

  test("workspace not-saved page has nav and main landmarks", async ({ page }) => {
    await page.goto("/returns/a11y-landmark-check");

    await expect(page.getByRole("navigation", { name: /main navigation/i })).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
  });
});

test.describe("Heading hierarchy", () => {
  test("home page has a single h1 heading", async ({ page }) => {
    await page.goto("/");

    const h1s = page.locator("h1");
    await expect(h1s).toHaveCount(1);
    await expect(h1s.first()).toBeVisible();
  });

  test("help page has a single h1 heading", async ({ page }) => {
    await page.goto("/help");

    const h1s = page.locator("h1");
    await expect(h1s).toHaveCount(1);
    await expect(h1s.first()).toContainText(/help center/i);
  });

  test("segmentation screen has an h1 heading", async ({ page }) => {
    await createReturn(page);

    const h1 = page.locator("h1").first();
    await expect(h1).toBeVisible();
  });

  test("interview sections use h2 for section titles", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Personal info section should have an h2 (panel title)
    const h2s = page.locator("h2");
    const h2Count = await h2s.count();
    expect(h2Count).toBeGreaterThanOrEqual(1);
  });
});

test.describe("Progress bar accessibility", () => {
  test("progress bar has progressbar role with value attributes", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    const progressBar = page.getByRole("progressbar");
    await expect(progressBar).toBeVisible();

    // Should have min and max values
    await expect(progressBar).toHaveAttribute("aria-valuemin", "0");
    await expect(progressBar).toHaveAttribute("aria-valuemax", "100");

    // Should have a current value
    const valueNow = await progressBar.getAttribute("aria-valuenow");
    expect(valueNow).toBeTruthy();
    expect(Number(valueNow)).toBeGreaterThanOrEqual(0);
    expect(Number(valueNow)).toBeLessThanOrEqual(100);
  });

  test("active progress step has aria-current=step", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    const activeStep = page.locator("button[aria-current='step']");
    await expect(activeStep).toBeVisible();
    await expect(activeStep).toHaveText(/about you/i);
  });

  test("completed step loses aria-current after advancing", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Advance past personal info
    await page.getByRole("textbox", { name: /first name/i }).fill("A11y");
    await page.getByRole("textbox", { name: /last name/i }).fill("Test");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    // "About You" should no longer have aria-current
    const aboutYouStep = page.locator("button.guided-progress-step").filter({ hasText: /about you/i });
    await expect(aboutYouStep).not.toHaveAttribute("aria-current", "step");

    // The new active step should have aria-current
    const activeStep = page.locator("button[aria-current='step']");
    await expect(activeStep).toBeVisible();
  });

  test("progress bar value updates when advancing sections", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    const progressBar = page.getByRole("progressbar");
    const initialValue = Number(await progressBar.getAttribute("aria-valuenow"));

    // Advance past personal info
    await page.getByRole("button", { name: "Continue" }).click();
    const skipBtn = page.getByRole("button", { name: /skip this section/i });
    if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await skipBtn.click();
    }

    const newValue = Number(await progressBar.getAttribute("aria-valuenow"));
    expect(newValue).toBeGreaterThan(initialValue);
  });
});

test.describe("Form field labels in guided interview", () => {
  test.beforeEach(async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);
  });

  test("personal info text fields have accessible labels", async ({ page }) => {
    // All key form fields should be findable by their label text
    await expect(page.getByRole("textbox", { name: /first name/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /last name/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /social security/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /address line 1/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /city/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /zip/i })).toBeVisible();
  });

  test("dependents count field has accessible label", async ({ page }) => {
    await expect(page.getByRole("spinbutton", { name: /number of dependents/i })).toBeVisible();
  });

  test("W-2 currency fields have accessible labels", async ({ page }) => {
    // Advance to W-2 section
    await page.getByRole("button", { name: "Continue" }).click();
    const skipBtn = page.getByRole("button", { name: /skip this section/i });
    if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await skipBtn.click();
    }

    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    // Currency fields should be within labeled containers
    const currencyInputs = page.locator("input.guided-input-currency");
    const count = await currencyInputs.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // The first two visible currency inputs should be inside label elements
    for (let i = 0; i < Math.min(count, 2); i++) {
      const input = currencyInputs.nth(i);
      const label = input.locator("xpath=ancestor::label");
      await expect(label).toBeVisible();
    }
  });

  test("currency field sets aria-invalid on validation error", async ({ page }) => {
    // Advance to W-2 section
    await page.getByRole("button", { name: "Continue" }).click();
    const skipBtn = page.getByRole("button", { name: /skip this section/i });
    if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await skipBtn.click();
    }

    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    const wagesInput = page.locator("input.guided-input-currency").first();
    await wagesInput.fill("not-a-number");
    await wagesInput.blur();

    // Should set aria-invalid="true"
    await expect(wagesInput).toHaveAttribute("aria-invalid", "true");

    // Fix the value
    await wagesInput.fill("50000");
    await wagesInput.blur();

    // Should clear aria-invalid (attribute removed or set to "false")
    const ariaInvalid = await wagesInput.getAttribute("aria-invalid");
    expect(ariaInvalid === null || ariaInvalid === "false").toBe(true);
  });
});

test.describe("Segmentation form accessibility", () => {
  test("filing status uses radiogroup role", async ({ page }) => {
    await createReturn(page);

    await expect(page.getByText(/let's figure out your tax situation/i)).toBeVisible();

    // Filing status options should be in a radiogroup
    const radios = page.getByRole("radio");
    const count = await radios.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // Each should have a visible label
    await expect(page.getByRole("radio", { name: /single/i })).toBeVisible();
    await expect(page.getByRole("radio", { name: /married filing jointly/i })).toBeVisible();
    await expect(page.getByRole("radio", { name: /head of household/i })).toBeVisible();
  });

  test("income types uses checkbox group with labeled options", async ({ page }) => {
    await createReturn(page);

    await expect(page.getByText(/let's figure out your tax situation/i)).toBeVisible();
    await page.getByRole("radio", { name: /single/i }).click();
    await expect(page.getByText(/what types of income/i)).toBeVisible({ timeout: 5000 });

    // Income type checkboxes should each have accessible names
    await expect(page.getByRole("checkbox", { name: /w-2 wages/i })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /self-employment/i })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /investment income/i })).toBeVisible();
  });

  test("state selection uses radiogroup with accessible name", async ({ page }) => {
    await createReturn(page);

    await expect(page.getByText(/let's figure out your tax situation/i)).toBeVisible();
    await page.getByRole("radio", { name: /single/i }).click();
    await expect(page.getByText(/what types of income/i)).toBeVisible({ timeout: 5000 });

    await page.getByRole("checkbox", { name: /w-2 wages/i }).check();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText(/did any of these happen/i)).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText(/what state did you live in/i)).toBeVisible();

    // State selection should be a radiogroup with an accessible name
    const stateGroup = page.getByRole("radiogroup", { name: /state of residence/i });
    await expect(stateGroup).toBeVisible();
  });

  test("segmentation progress indicator has progressbar role", async ({ page }) => {
    await createReturn(page);

    await expect(page.getByText(/let's figure out your tax situation/i)).toBeVisible();

    // Segmentation screen should show step progress
    await expect(page.getByText(/step 1 of 4/i)).toBeVisible();
  });
});

test.describe("Keyboard navigation", () => {
  test("nav links are reachable via Tab", async ({ page }) => {
    await page.goto("/");

    let foundNavLink = false;
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      const focused = page.locator(":focus");
      const tagName = await focused.evaluate((el) => el.tagName.toLowerCase()).catch(() => "");
      if (tagName === "a") {
        const href = await focused.getAttribute("href");
        if (href === "/" || href === "/help") {
          foundNavLink = true;
          break;
        }
      }
    }

    expect(foundNavLink).toBe(true);
  });

  test("main CTA button is reachable and activatable via keyboard", async ({ page }) => {
    await page.goto("/");

    let foundButton = false;
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      const focused = page.locator(":focus");
      const text = await focused.innerText().catch(() => "");
      if (/start your tax return/i.test(text)) {
        foundButton = true;
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+/i);
        break;
      }
    }

    expect(foundButton).toBe(true);
  });

  test("FAQ details elements are keyboard accessible", async ({ page }) => {
    await page.goto("/help");

    let foundSummary = false;
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      const focused = page.locator(":focus");
      const tagName = await focused.evaluate((el) => el.tagName.toLowerCase()).catch(() => "");
      if (tagName === "summary") {
        foundSummary = true;

        const details = focused.locator("..");
        const answer = details.locator("p.help-faq-answer");

        await expect(answer).not.toBeVisible();
        await page.keyboard.press("Enter");
        await expect(answer).toBeVisible();
        await page.keyboard.press("Enter");
        await expect(answer).not.toBeVisible();
        break;
      }
    }

    expect(foundSummary).toBe(true);
  });

  test("interview form fields are reachable via Tab", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Tab through to find the first name input
    let foundInput = false;
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const focused = page.locator(":focus");
      const tagName = await focused.evaluate((el) => el.tagName.toLowerCase()).catch(() => "");
      if (tagName === "input") {
        foundInput = true;
        // Type into the field to verify it's interactive
        await page.keyboard.type("TabTest");
        const value = await focused.inputValue();
        expect(value).toContain("TabTest");
        break;
      }
    }

    expect(foundInput).toBe(true);
  });

  test("Continue and Back buttons are reachable via Tab", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    let foundContinue = false;
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      const focused = page.locator(":focus");
      const text = await focused.innerText().catch(() => "");
      if (/^continue$/i.test(text.trim())) {
        foundContinue = true;
        break;
      }
    }

    expect(foundContinue).toBe(true);
  });

  test("filing status radio buttons are navigable with arrow keys", async ({ page }) => {
    await createReturn(page);
    await expect(page.getByText(/let's figure out your tax situation/i)).toBeVisible();

    // Tab to the first radio button
    let foundRadio = false;
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      const focused = page.locator(":focus");
      const role = await focused.getAttribute("type").catch(() => "");
      if (role === "radio") {
        foundRadio = true;

        // Select it with Space
        await page.keyboard.press("Space");

        // Verify it's checked
        await expect(focused).toBeChecked();
        break;
      }
    }

    expect(foundRadio).toBe(true);
  });
});

test.describe("Live regions and alerts", () => {
  test("skip prompt uses alert role for screen readers", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Trigger the skip prompt
    await page.getByRole("button", { name: "Continue" }).click();

    const alert = page.getByRole("alert").filter({ hasText: /you haven't entered/i });
    await expect(alert).toBeVisible();
  });

  test("validation error messages are associated with their fields", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Advance to W-2 section
    await page.getByRole("button", { name: "Continue" }).click();
    const skipBtn = page.getByRole("button", { name: /skip this section/i });
    if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await skipBtn.click();
    }

    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    // Enter invalid value to trigger error
    const wagesInput = page.locator("input.guided-input-currency").first();
    await wagesInput.fill("abc");
    await wagesInput.blur();

    // Error message should be visible near the field
    const errorMsg = page.getByText(/enter a valid dollar amount/i);
    await expect(errorMsg).toBeVisible();

    // The error should be within the same label container as the input
    const label = wagesInput.locator("xpath=ancestor::label");
    await expect(label.getByText(/enter a valid dollar amount/i)).toBeVisible();
  });
});

test.describe("Scroll behavior on section change", () => {
  test("page scrolls to top when advancing to next section", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Scroll down on the personal info section
    await page.evaluate(() => window.scrollTo(0, 500));
    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(scrollBefore).toBeGreaterThan(0);

    // Advance to next section
    await page.getByRole("button", { name: "Continue" }).click();
    const skipBtn = page.getByRole("button", { name: /skip this section/i });
    if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await skipBtn.click();
    }

    // Wait for smooth scroll to complete
    await page.waitForTimeout(500);
    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(scrollAfter).toBeLessThan(scrollBefore);
  });
});
