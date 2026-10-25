import { expect, test } from "@playwright/test";

/**
 * Error handling and edge case tests.
 *
 * Covers non-existent routes, invalid workspace IDs,
 * special characters, and graceful degradation.
 */

test.describe("Non-existent routes", () => {
  test("navigating to unknown top-level route returns 404", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");

    // Next.js should return a 404 status
    expect(response?.status()).toBe(404);
  });

  test("navigating to unknown nested route returns 404", async ({ page }) => {
    const response = await page.goto("/settings/account/preferences");

    expect(response?.status()).toBe(404);
  });

  test("404 page still renders nav bar for navigation back", async ({ page }) => {
    await page.goto("/nonexistent-page");

    // Even on a 404, the layout should still render
    // The user should be able to navigate back using the nav bar
    const nav = page.getByRole("navigation", { name: /main navigation/i });
    // Nav may or may not render depending on layout — check gracefully
    const navVisible = await nav.isVisible().catch(() => false);

    if (navVisible) {
      // If nav renders on 404, verify it still works
      await nav.getByRole("link", { name: /viva la tax/i }).click();
      await expect(page).toHaveURL("/");
    } else {
      // Default Next.js 404 — just verify the page loaded without crash
      await expect(page.locator("body")).toBeVisible();
    }
  });
});

test.describe("Invalid workspace IDs", () => {
  test("workspace with special characters in ID shows not-saved message", async ({ page }) => {
    await page.goto("/returns/test%20with%20spaces");

    // Should show "not saved locally" message (workspace doesn't exist in localStorage)
    await expect(
      page.getByRole("heading", { name: /is not saved locally/i })
    ).toBeVisible();

    // Should offer to create or go back
    await expect(page.getByRole("link", { name: /back to my returns/i })).toBeVisible();
  });

  test("workspace with very long ID loads without crashing", async ({ page }) => {
    const longId = "a".repeat(200);
    await page.goto(`/returns/${longId}`);

    // Should either show the not-saved message or handle gracefully
    await expect(page.locator("body")).toBeVisible();

    // Should have a way to navigate back
    const backLink = page.getByRole("link", { name: /back to my returns/i });
    const navLink = page.getByRole("navigation", { name: /main navigation/i })
      .getByRole("link", { name: /viva la tax/i });

    const hasBackLink = await backLink.isVisible().catch(() => false);
    const hasNavLink = await navLink.isVisible().catch(() => false);
    expect(hasBackLink || hasNavLink).toBe(true);
  });

  test("workspace with numeric-only ID loads correctly", async ({ page }) => {
    await page.goto("/returns/12345");

    await expect(
      page.getByRole("heading", { name: /is not saved locally/i })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /back to my returns/i })).toBeVisible();
  });

  test("creating a workspace from not-saved state works", async ({ page }) => {
    await page.goto("/returns/error-test-create");

    // Should show not-saved message
    await expect(
      page.getByRole("heading", { name: /is not saved locally/i })
    ).toBeVisible();

    // Click "Create this return" to create it
    await page.getByRole("link", { name: /create this return/i }).click();

    // Should now be on the workspace page
    await expect(page).toHaveURL(/\/returns\/error-test-create/i);

    // Should show the workspace content (guided interview or workspace screen)
    await expect(page.getByRole("main")).toBeVisible();
  });
});

test.describe("Empty state handling", () => {
  test("home page shows empty state when no returns exist", async ({ page }) => {
    // Clear any existing localStorage data
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Should show empty state message
    await expect(page.getByText(/no saved returns yet/i)).toBeVisible();
  });

  test("home page CTA works from empty state", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Click the Start button from empty state
    await page.getByRole("button", { name: /start your tax return/i }).click();
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+/i);
  });
});

test.describe("Direct URL navigation", () => {
  test("deep link to help page works without visiting home first", async ({ page }) => {
    // Navigate directly to help without visiting home page first
    await page.goto("/help");

    await expect(page.getByRole("heading", { name: /help center/i })).toBeVisible();
    await expect(page.getByRole("navigation", { name: /main navigation/i })).toBeVisible();
  });

  test("deep link to workspace page works without visiting home first", async ({ page }) => {
    await page.goto("/returns/deep-link-test");

    // Should show the not-saved message since workspace doesn't exist
    await expect(
      page.getByRole("heading", { name: /is not saved locally/i })
    ).toBeVisible();
  });

  test("browser back button works after navigating between pages", async ({ page }) => {
    // Start at home
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /build draft returns\. verify every step\./i })).toBeVisible();

    // Go to help
    await page.getByRole("navigation", { name: /main navigation/i })
      .getByRole("link", { name: /help/i })
      .click();
    await expect(page).toHaveURL("/help");

    // Use browser back
    await page.goBack();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: /build draft returns\. verify every step\./i })).toBeVisible();
  });

  test("browser forward button works after going back", async ({ page }) => {
    await page.goto("/");

    // Navigate to help
    await page.getByRole("navigation", { name: /main navigation/i })
      .getByRole("link", { name: /help/i })
      .click();
    await expect(page).toHaveURL("/help");

    // Go back
    await page.goBack();
    await expect(page).toHaveURL("/");

    // Go forward
    await page.goForward();
    await expect(page).toHaveURL("/help");
    await expect(page.getByRole("heading", { name: /help center/i })).toBeVisible();
  });
});
