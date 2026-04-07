import { expect, test } from "@playwright/test";

/**
 * Return workspace lifecycle tests.
 *
 * Covers creating returns, data persistence through guided interview,
 * multi-return management, and localStorage behavior in self-host mode.
 */

/** Complete segmentation with the given filing status. */
async function completeSegmentation(
  page: import("@playwright/test").Page,
  filingStatus: "single" | "married filing jointly" | "head of household" = "single"
) {
  await expect(page.getByText(/let's figure out your tax situation/i)).toBeVisible();

  // Step 1: Filing status
  await page.getByRole("radio", { name: new RegExp(filingStatus, "i") }).click();
  await expect(page.getByText(/what types of income/i)).toBeVisible({ timeout: 5000 });

  // Step 2: W-2 wages
  await page.getByRole("checkbox", { name: /w-2 wages/i }).check();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3: Skip life events
  await expect(page.getByText(/did any of these happen/i)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 4: No state
  await expect(page.getByText(/what state did you live in/i)).toBeVisible();
  await page.getByRole("button", { name: /start my return/i }).click();

  await expect(page.getByText(/let's start with the basics/i)).toBeVisible({ timeout: 5000 });
}

/** Create a new return from the home page and return its workspace ID. */
async function createReturn(page: import("@playwright/test").Page): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+/i);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  return id;
}

test.describe("Return workspace lifecycle", () => {
  test("return created via CTA appears in home page recent list", async ({ page }) => {
    const id = await createReturn(page);

    // Complete segmentation so the return is saved
    await completeSegmentation(page);

    // Navigate back to home
    await page.goto("/");

    // The return should appear in the recent returns list
    const card = page.getByRole("listitem").filter({ hasText: new RegExp(`Tax Return ${id}`, "i") });
    await expect(card).toBeVisible();
  });

  test("guided interview state persists after page reload", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Fill in personal info
    await page.getByRole("textbox", { name: /first name/i }).fill("Alice");
    await page.getByRole("textbox", { name: /last name/i }).fill("Testington");

    // Reload the page
    await page.reload();

    // Wait for the guided interview to restore
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible({ timeout: 5000 });

    // Personal info should still be filled in
    await expect(page.getByRole("textbox", { name: /first name/i })).toHaveValue("Alice");
    await expect(page.getByRole("textbox", { name: /last name/i })).toHaveValue("Testington");
  });

  test("guided interview state persists after navigating away and back", async ({ page }) => {
    const id = await createReturn(page);
    await completeSegmentation(page);

    // Fill in personal info
    await page.getByRole("textbox", { name: /first name/i }).fill("Bob");
    await page.getByRole("textbox", { name: /last name/i }).fill("Builder");

    // Navigate to help page
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: /help center/i })).toBeVisible();

    // Navigate back to the return
    await page.goto(`/returns/${id}`);

    // Wait for the guided interview to restore
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible({ timeout: 5000 });

    // Personal info should still be filled in
    await expect(page.getByRole("textbox", { name: /first name/i })).toHaveValue("Bob");
    await expect(page.getByRole("textbox", { name: /last name/i })).toHaveValue("Builder");
  });

  test("multiple returns coexist on home page", async ({ page }) => {
    // Create first return via CTA
    const id1 = await createReturn(page);
    await completeSegmentation(page);

    // Create second return using direct URL with explicit creation
    await page.goto("/returns/multi-test-second");
    await page.getByRole("link", { name: /create this return/i }).click();
    await expect(page).toHaveURL(/\/returns\/multi-test-second$/i);

    // Wait for workspace page to fully render and persist to localStorage
    await page.waitForLoadState("networkidle");

    // Navigate to home
    await page.goto("/");

    // Both returns should appear
    await expect(
      page.getByRole("listitem").filter({ hasText: new RegExp(`Tax Return ${id1}`, "i") })
    ).toBeVisible();
    await expect(
      page.getByRole("listitem").filter({ hasText: /Tax Return multi-test-second/i })
    ).toBeVisible();
  });

  test("continue return from home page resumes guided interview", async ({ page }) => {
    const id = await createReturn(page);
    await completeSegmentation(page);

    // Fill some data
    await page.getByRole("textbox", { name: /first name/i }).fill("Charlie");

    // Go home
    await page.goto("/");

    // Click continue on the return card
    const card = page.getByRole("listitem").filter({ hasText: new RegExp(`Tax Return ${id}`, "i") });
    await card.getByRole("link", { name: /continue return/i }).click();

    // Should be on the return page in guided mode
    await expect(page).toHaveURL(new RegExp(`/returns/${id}$`, "i"));
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible({ timeout: 5000 });

    // Data should persist
    await expect(page.getByRole("textbox", { name: /first name/i })).toHaveValue("Charlie");
  });

  test("delete return removes it from home page list", async ({ page }) => {
    const id = await createReturn(page);
    await completeSegmentation(page);

    // Go home
    await page.goto("/");

    const card = page.getByRole("listitem").filter({ hasText: new RegExp(`Tax Return ${id}`, "i") });
    await expect(card).toBeVisible();

    // Delete it
    await card.getByRole("button", { name: /delete/i }).click();

    // Should show deletion confirmation
    await expect(
      page.getByRole("status", { name: /saved returns status/i })
    ).toHaveText(new RegExp(`Deleted return ${id}\\.`, "i"));

    // Card should be gone
    await expect(card).not.toBeVisible();
  });
});

test.describe("Guided interview — filing status variations", () => {
  test("Married Filing Jointly segmentation flow completes", async ({ page }) => {
    await createReturn(page);

    await expect(page.getByText(/let's figure out your tax situation/i)).toBeVisible();

    // Select MFJ
    await page.getByRole("radio", { name: /married filing jointly/i }).click();
    await expect(page.getByText(/what types of income/i)).toBeVisible({ timeout: 5000 });

    // Complete remaining segmentation steps
    await page.getByRole("checkbox", { name: /w-2 wages/i }).check();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText(/did any of these happen/i)).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText(/what state did you live in/i)).toBeVisible();
    await page.getByRole("button", { name: /start my return/i }).click();

    // Should reach interview phase
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible({ timeout: 5000 });

    // MFJ should show spouse fields or indicate joint filing
    // The filing status should be reflected in the personal info section
    await expect(page.getByText(/married filing jointly/i).first()).toBeVisible();
  });

  test("Head of Household segmentation flow completes", async ({ page }) => {
    await createReturn(page);

    await expect(page.getByText(/let's figure out your tax situation/i)).toBeVisible();

    // Select HoH
    await page.getByRole("radio", { name: /head of household/i }).click();
    await expect(page.getByText(/what types of income/i)).toBeVisible({ timeout: 5000 });

    // Complete remaining segmentation steps
    await page.getByRole("checkbox", { name: /w-2 wages/i }).check();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText(/did any of these happen/i)).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText(/what state did you live in/i)).toBeVisible();
    await page.getByRole("button", { name: /start my return/i }).click();

    // Should reach interview phase
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible({ timeout: 5000 });

    // HoH should be reflected
    await expect(page.getByText(/head of household/i).first()).toBeVisible();
  });

  test("changing filing status during segmentation updates selection", async ({ page }) => {
    await createReturn(page);

    await expect(page.getByText(/let's figure out your tax situation/i)).toBeVisible();

    // Select Single first
    await page.getByRole("radio", { name: /single/i }).click();
    await expect(page.getByText(/what types of income/i)).toBeVisible({ timeout: 5000 });

    // Go back and change to MFJ
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByText(/what's your filing status/i)).toBeVisible();

    // Single should still be checked
    await expect(page.getByRole("radio", { name: /single/i })).toBeChecked();

    // Change to MFJ
    await page.getByRole("radio", { name: /married filing jointly/i }).click();
    await expect(page.getByText(/what types of income/i)).toBeVisible({ timeout: 5000 });

    // Go back again — MFJ should be checked
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("radio", { name: /married filing jointly/i })).toBeChecked();
    await expect(page.getByRole("radio", { name: /single/i })).not.toBeChecked();
  });
});

test.describe("Self-hosted data persistence", () => {
  test("workspace data survives browser-level storage round-trip", async ({ page }) => {
    await createReturn(page);
    await completeSegmentation(page);

    // Fill personal info
    await page.getByRole("textbox", { name: /first name/i }).fill("DataTest");
    await page.getByRole("textbox", { name: /last name/i }).fill("Persister");

    // Verify localStorage has some entries (self-host mode stores data locally)
    const storageCount = await page.evaluate(() => localStorage.length);
    expect(storageCount).toBeGreaterThan(0);

    // Close and re-open the page (simulates closing the browser tab)
    const url = page.url();
    await page.close();

    // Create a new page in the same context (preserves localStorage)
    const newPage = await page.context().newPage();
    await newPage.goto(url);

    // Data should still be available
    await expect(newPage.getByText(/let's start with the basics/i)).toBeVisible({ timeout: 5000 });
    await expect(newPage.getByRole("textbox", { name: /first name/i })).toHaveValue("DataTest");
    await expect(newPage.getByRole("textbox", { name: /last name/i })).toHaveValue("Persister");
  });

  test("deleting return clears localStorage data", async ({ page }) => {
    const id = await createReturn(page);
    await completeSegmentation(page);

    // Fill some data to ensure localStorage has entries
    await page.getByRole("textbox", { name: /first name/i }).fill("DeleteMe");

    // Navigate home and delete
    await page.goto("/");
    const card = page.getByRole("listitem").filter({ hasText: new RegExp(`Tax Return ${id}`, "i") });
    await card.getByRole("button", { name: /delete/i }).click();

    // Wait for deletion to complete
    await expect(
      page.getByRole("status", { name: /saved returns status/i })
    ).toHaveText(new RegExp(`Deleted return ${id}\\.`, "i"));

    // localStorage should no longer have data for this workspace
    const hasData = await page.evaluate((wsId) => {
      const keys = Object.keys(localStorage);
      return keys.some((k) => k.includes(wsId));
    }, id);

    expect(hasData).toBe(false);
  });
});
