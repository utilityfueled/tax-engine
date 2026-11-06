import { expect, test } from "@playwright/test";

test.describe("Help page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/help");
  });

  test("help page renders hero section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /help center/i })).toBeVisible();
    await expect(page.getByText(/using Viva La Tax as experimental tax software/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /back to home/i })).toBeVisible();
  });

  test("Back to Home link navigates to home page", async ({ page }) => {
    await page.getByRole("link", { name: /back to home/i }).click();
    await expect(page).toHaveURL("/");
  });

  test("getting started section renders three steps", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /getting started/i })).toBeVisible();
    await expect(page.getByText(/start your return/i)).toBeVisible();
    await expect(page.getByText(/enter your information/i)).toBeVisible();
    await expect(page.getByText(/review and download/i)).toBeVisible();
  });

  test("supported documents section lists all document types", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /supported documents/i })).toBeVisible();

    const expectedDocs = [
      "W-2", "1099-INT", "1099-DIV", "1099-B", "1099-NEC",
      "1099-R", "1099-G", "1099-SA", "1099-DA (crypto)",
      "1098-E", "1095-A", "SSA-1099", "Schedule K-1"
    ];

    for (const doc of expectedDocs) {
      await expect(page.getByText(doc, { exact: true })).toBeVisible();
    }
  });

  test("FAQ section renders all questions", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /frequently asked questions/i })).toBeVisible();

    // All FAQ questions should be visible as summary elements
    await expect(page.getByText("How does Viva La Tax work?")).toBeVisible();
    await expect(page.getByText("Is this really free?")).toBeVisible();
    await expect(page.getByText("Is my data safe?")).toBeVisible();
    await expect(page.getByText("What tax situations do you support?")).toBeVisible();
    await expect(page.getByText("How accurate is this?")).toBeVisible();
    await expect(page.getByText("Can I file my return electronically?")).toBeVisible();
    await expect(page.getByText("Do you support crypto and digital assets?")).toBeVisible();
    await expect(page.getByText("What if my tax situation isn't supported?")).toBeVisible();
    await expect(page.getByText("How do I self-host Viva La Tax?")).toBeVisible();
    await expect(page.getByText("I found a bug or want to contribute. Where do I go?")).toBeVisible();
  });

  test("FAQ items expand and collapse on click", async ({ page }) => {
    const faqItem = page.locator("details").filter({ hasText: "Is this really free?" });

    // Answer should be hidden initially (details element is closed)
    await expect(faqItem.locator("p.help-faq-answer")).not.toBeVisible();

    // Click to expand
    await faqItem.locator("summary").click();
    await expect(faqItem.locator("p.help-faq-answer")).toBeVisible();
    await expect(faqItem.getByText(/paid hosted plans/i)).toBeVisible();

    // Click again to collapse
    await faqItem.locator("summary").click();
    await expect(faqItem.locator("p.help-faq-answer")).not.toBeVisible();
  });

  test("multiple FAQ items can be expanded independently", async ({ page }) => {
    const faq1 = page.locator("details").filter({ hasText: "Is this really free?" });
    const faq2 = page.locator("details").filter({ hasText: "Is my data safe?" });

    // Expand first FAQ
    await faq1.locator("summary").click();
    await expect(faq1.locator("p.help-faq-answer")).toBeVisible();

    // Expand second FAQ — first should remain open
    await faq2.locator("summary").click();
    await expect(faq2.locator("p.help-faq-answer")).toBeVisible();
    await expect(faq1.locator("p.help-faq-answer")).toBeVisible();
  });

  test("Need More Help section has correct external links", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /need more help/i })).toBeVisible();
    await expect(page.getByText(/check the README for setup, contribution, and support guidance/i)).toBeVisible();
    await expect(page.getByText(/contact your own deployment operator/i).first()).toBeVisible();
  });
});


test("support page distinguishes saving 2026 facts from qualified filing output", async ({ page }) => {
  await page.goto("/support");
  await expect(page.getByRole("heading", { name: "Year and scenario support" })).toBeVisible();
  await expect(page.getByText(/no scenario is enabled for filing/i)).toBeVisible();
  const federal2026 = page.getByRole("row").filter({ hasText: /2026Federal/ });
  await expect(federal2026).toContainText("full return calculation and PDFs unavailable");
  await expect(federal2026).toContainText("Unavailable");
  await expect(page.getByText(/Review PDFs omit taxpayer Social Security numbers and are marked for review only\./)).toBeVisible();
});
