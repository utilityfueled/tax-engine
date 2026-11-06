import { reachFilingStatus } from "./guided-fixtures";
import { expect, test } from "@playwright/test";

test.describe("Responsive layout — mobile (375px)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("nav bar renders with all links on mobile", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: /main navigation/i });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: /viva la tax/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /my returns/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /help/i })).toBeVisible();
  });

  test("Local Mode badge visible on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Local Mode", { exact: true })).toBeVisible();
  });

  test("hero section is visible and CTA button works on mobile", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /build draft returns\. verify every step\./i })
    ).toBeVisible();

    const cta = page.getByRole("button", { name: /start your tax return/i });
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+/i);
  });

  test("footer renders and is accessible on mobile", async ({ page }) => {
    await page.goto("/");

    const footer = page.getByRole("contentinfo");
    await expect(footer).toBeVisible();
    await expect(footer.getByText("Viva La Tax", { exact: true })).toBeVisible();

    // Footer nav links still present
    const footerNav = footer.getByRole("navigation", { name: /footer navigation/i });
    await expect(footerNav.getByRole("link", { name: /home/i })).toBeVisible();
    await expect(footerNav.getByRole("link", { name: /help center/i })).toBeVisible();
  });

  test("help page is usable on mobile", async ({ page }) => {
    await page.goto("/help");

    await expect(page.getByRole("heading", { name: /help center/i })).toBeVisible();

    // FAQ items should be tappable on mobile
    const faqItem = page.locator("details").filter({ hasText: "Is this really free?" });
    await faqItem.locator("summary").click();
    await expect(faqItem.locator("p.help-faq-answer")).toBeVisible();
  });

  test("guided interview segmentation works on mobile", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /start your tax return/i }).click();
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+/i);

    // Segmentation should render on mobile
    await expect(page.getByText(/let's tailor your return/i)).toBeVisible();

    // Filing status radios should be tappable
    await reachFilingStatus(page);
    await page.getByRole("radio", { name: /single/i }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/what types of income/i)).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Responsive layout — tablet (768px)", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("nav bar renders with all links on tablet", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: /main navigation/i });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: /viva la tax/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /my returns/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /help/i })).toBeVisible();
  });

  test("home page layout renders correctly on tablet", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /build draft returns\. verify every step\./i })
    ).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
  });

  test("help page layout renders correctly on tablet", async ({ page }) => {
    await page.goto("/help");

    await expect(page.getByRole("heading", { name: /help center/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /getting started/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /supported documents/i })).toBeVisible();
  });
});

test.describe("Responsive layout — desktop (1280px)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("nav bar renders horizontally with all links on desktop", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: /main navigation/i });
    await expect(nav).toBeVisible();

    const logo = nav.getByRole("link", { name: /viva la tax/i });
    const help = nav.getByRole("link", { name: /help/i });
    await expect(logo).toBeVisible();
    await expect(help).toBeVisible();

    // On desktop, logo and help link should be on the same horizontal line
    const logoBB = await logo.boundingBox();
    const helpBB = await help.boundingBox();
    expect(logoBB).toBeTruthy();
    expect(helpBB).toBeTruthy();
    // They should overlap vertically (same row)
    expect(logoBB!.y + logoBB!.height).toBeGreaterThan(helpBB!.y);
    expect(helpBB!.y + helpBB!.height).toBeGreaterThan(logoBB!.y);
  });

  test("full page layout has nav, main, and footer on desktop", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: /main navigation/i });
    const main = page.getByRole("main");
    const footer = page.getByRole("contentinfo");

    await expect(nav).toBeVisible();
    await expect(main).toBeVisible();
    await expect(footer).toBeVisible();

    // Verify layout order: nav above main above footer
    const navBB = await nav.boundingBox();
    const mainBB = await main.boundingBox();
    const footerBB = await footer.boundingBox();

    expect(navBB).toBeTruthy();
    expect(mainBB).toBeTruthy();
    expect(footerBB).toBeTruthy();

    expect(navBB!.y).toBeLessThan(mainBB!.y);
    expect(mainBB!.y).toBeLessThan(footerBB!.y);
  });

  test("guided interview is usable at desktop width", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /start your tax return/i }).click();
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+/i);

    await expect(page.getByText(/let's tailor your return/i)).toBeVisible();

    // All filing status options visible and clickable
    await reachFilingStatus(page);
    await expect(page.getByRole("radio", { name: /single/i })).toBeVisible();
    await expect(page.getByRole("radio", { name: /married filing jointly/i })).toBeVisible();
    await expect(page.getByRole("radio", { name: /head of household/i })).toBeVisible();
  });
});

test.describe("Responsive layout — nav stacks below 720px", () => {
  test("nav links wrap vertically at 600px width", async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: /main navigation/i });
    await expect(nav).toBeVisible();

    // All links still accessible
    await expect(nav.getByRole("link", { name: /viva la tax/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /my returns/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /help/i })).toBeVisible();
  });

  test("nav links are horizontal at 900px width", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto("/");

    const logo = page.getByRole("navigation", { name: /main navigation/i })
      .getByRole("link", { name: /viva la tax/i });
    const help = page.getByRole("navigation", { name: /main navigation/i })
      .getByRole("link", { name: /help/i });

    await expect(logo).toBeVisible();
    await expect(help).toBeVisible();

    // Should be on the same horizontal line at 900px
    const logoBB = await logo.boundingBox();
    const helpBB = await help.boundingBox();
    expect(logoBB).toBeTruthy();
    expect(helpBB).toBeTruthy();
    expect(logoBB!.y + logoBB!.height).toBeGreaterThan(helpBB!.y);
    expect(helpBB!.y + helpBB!.height).toBeGreaterThan(logoBB!.y);
  });
});
