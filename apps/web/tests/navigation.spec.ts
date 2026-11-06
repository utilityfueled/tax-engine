import { expect, test } from "@playwright/test";

test.describe("Navigation bar", () => {
  test("nav bar renders on home page with correct links", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: /main navigation/i });
    await expect(nav).toBeVisible();

    // Logo links to home
    const logo = nav.getByRole("link", { name: /viva la tax/i });
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute("href", "/");

    // My Returns link
    const myReturns = nav.getByRole("link", { name: /my returns/i });
    await expect(myReturns).toBeVisible();
    await expect(myReturns).toHaveAttribute("href", "/");

    // Help link
    const help = nav.getByRole("link", { name: /help/i });
    await expect(help).toBeVisible();
    await expect(help).toHaveAttribute("href", "/help");
  });

  test("nav bar renders on help page", async ({ page }) => {
    await page.goto("/help");

    const nav = page.getByRole("navigation", { name: /main navigation/i });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: /viva la tax/i })).toBeVisible();
  });

  test("nav bar renders on return workspace page", async ({ page }) => {
    await page.goto("/returns/test-nav-check");

    const nav = page.getByRole("navigation", { name: /main navigation/i });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: /viva la tax/i })).toBeVisible();
  });

  test("logo navigates to home page", async ({ page }) => {
    await page.goto("/help");

    await page.getByRole("navigation", { name: /main navigation/i })
      .getByRole("link", { name: /viva la tax/i })
      .click();

    await expect(page).toHaveURL("/");
  });

  test("Help link navigates to help page", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("navigation", { name: /main navigation/i })
      .getByRole("link", { name: /help/i })
      .click();

    await expect(page).toHaveURL("/help");
  });

  test("My Returns link navigates to home page", async ({ page }) => {
    await page.goto("/help");

    await page.getByRole("navigation", { name: /main navigation/i })
      .getByRole("link", { name: /my returns/i })
      .click();

    await expect(page).toHaveURL("/");
  });
});

test.describe("Footer", () => {
  test("footer renders on home page with all links", async ({ page }) => {
    await page.goto("/");

    const footer = page.getByRole("contentinfo");
    await expect(footer).toBeVisible();

    // Brand
    await expect(footer.getByText("Viva La Tax", { exact: true })).toBeVisible();
    await expect(footer.getByText(/your data can stay on your device/i)).toBeVisible();

    // Navigation links
    const footerNav = footer.getByRole("navigation", { name: /footer navigation/i });
    await expect(footerNav.getByRole("link", { name: /home/i })).toBeVisible();
    await expect(footerNav.getByRole("link", { name: /help center/i })).toBeVisible();
    await expect(footerNav.getByRole("link", { name: /terms of service/i })).toBeVisible();
    await expect(footerNav.getByRole("link", { name: /privacy policy/i })).toBeVisible();

    // Legal disclaimer
    await expect(footer.getByText(/not a substitute for professional tax advice or tax preparation/i)).toBeVisible();
  });

  test("footer renders on help page", async ({ page }) => {
    await page.goto("/help");

    const footer = page.getByRole("contentinfo");
    await expect(footer).toBeVisible();
    await expect(footer.getByText("Viva La Tax", { exact: true })).toBeVisible();
  });

  test("footer Home link navigates to home page", async ({ page }) => {
    await page.goto("/help");

    await page.getByRole("contentinfo")
      .getByRole("navigation", { name: /footer navigation/i })
      .getByRole("link", { name: /^home$/i })
      .click();

    await expect(page).toHaveURL("/");
  });

  test("footer Help Center link navigates to help page", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("contentinfo")
      .getByRole("navigation", { name: /footer navigation/i })
      .getByRole("link", { name: /help center/i })
      .click();

    await expect(page).toHaveURL("/help");
  });

  test("footer legal links have correct hrefs", async ({ page }) => {
    await page.goto("/");

    const footerNav = page.getByRole("contentinfo")
      .getByRole("navigation", { name: /footer navigation/i });

    const terms = footerNav.getByRole("link", { name: /terms of service/i });
    await expect(terms).toHaveAttribute("href", "/terms");

    const privacy = footerNav.getByRole("link", { name: /privacy policy/i });
    await expect(privacy).toHaveAttribute("href", "/privacy");
  });
});

test.describe("Self-hosted mode", () => {
  test("Local Mode badge appears in nav bar", async ({ page }) => {
    await page.goto("/");

    // In self-host mode (default), the "Local Mode" badge should be visible
    await expect(page.getByText("Local Mode", { exact: true })).toBeVisible();
  });

  test("no sign-in or auth UI is shown in self-host mode", async ({ page }) => {
    await page.goto("/");

    // No Sign In or Sign Out links should appear
    await expect(page.getByRole("link", { name: /sign in/i })).not.toBeVisible();
    await expect(page.getByRole("link", { name: /sign out/i })).not.toBeVisible();
  });
});
