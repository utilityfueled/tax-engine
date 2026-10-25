import { fillRequiredTaxpayerFacts, reachFilingStatus } from "./guided-fixtures";
import { expect, test } from "@playwright/test";
/** Set advanced mode in localStorage so the workspace skips guided interview. */
async function enableAdvancedMode(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    window.localStorage.setItem("tax-engine:guided-mode", "false");
  });
}

async function saveGuidedSetupProgress(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);

  const workspaceId = new URL(page.url()).pathname.split("/").at(-1);

  await reachFilingStatus(page);
  await page.getByRole("radio", { name: /single/i }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("checkbox", { name: /w-2 wages/i }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /start my return/i }).click();
  await fillRequiredTaxpayerFacts(page);
  await page.getByRole("textbox", { name: /first name/i }).fill("Jane");
  await page.getByRole("textbox", { name: /last name/i }).fill("Doe");
  await page.getByRole("button", { name: "Continue" }).click();

  return workspaceId;
}

test("landing page renders the hero and trust signals", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /build draft returns\. verify every step\./i })).toBeVisible();
  await expect(page.getByText(/experimental output/i).first()).toBeVisible();
  await expect(page.getByText(/auditable engine/i).first()).toBeVisible();
  const starLink = page.getByRole("link", { name: /star on github/i });
  await expect(starLink).toBeVisible();
  await expect(starLink).toHaveAttribute("href", /https:\/\/github\.com\/.+\/tax-engine/);
});

test("landing page can resume and delete saved local returns", async ({ page }) => {
  await page.goto("/");
  const workspaceId = await saveGuidedSetupProgress(page);
  expect(workspaceId).toBeTruthy();

  await page.getByRole("link", { name: /my returns/i }).click();
  await expect(page).toHaveURL("/");

  const workspaceCard = page.getByRole("listitem").filter({ hasText: `Tax Return ${workspaceId}` });
  await expect(workspaceCard).toBeVisible();
  await expect(workspaceCard.getByText(/0 docs/i)).toBeVisible();
  await expect(workspaceCard.getByText(/guided setup saved/i)).toBeVisible();
  await expect(workspaceCard.getByText(/1 guided section saved/i)).toBeVisible();
  await expect(workspaceCard.getByText(/ready to resume at w-2 wages/i)).toBeVisible();

  await workspaceCard.getByRole("link", { name: /continue tax return/i }).click();
  await expect(page).toHaveURL(new RegExp(`/returns/${workspaceId}(?:\\?local=1)?$`, "i"));
  await expect(page.getByText(/w-2 #1/i)).toBeVisible();

  await page.getByRole("link", { name: /my returns/i }).click();
  await expect(page).toHaveURL("/");

  await workspaceCard.getByRole("button", { name: /delete/i }).click();
  await expect(
    page.getByRole("status", { name: /saved returns status/i })
  ).toHaveText(new RegExp(`Deleted return ${workspaceId}\\.`, "i"));
  await expect(page.getByText(/No saved returns yet\./i)).toBeVisible();
});

test("landing page keeps saved-return status pills readable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const workspaceId = await saveGuidedSetupProgress(page);
  expect(workspaceId).toBeTruthy();

  await page.getByRole("link", { name: /my returns/i }).click();
  await expect(page).toHaveURL("/");

  const workspaceCard = page.getByRole("listitem").filter({ hasText: `Tax Return ${workspaceId}` });
  const statusPill = workspaceCard.locator(".workspace-card-status");

  await expect(statusPill).toContainText(/(guided setup saved|questions remaining)/i);

  const workspaceCardBox = await workspaceCard.boundingBox();
  const statusPillBox = await statusPill.boundingBox();

  expect(workspaceCardBox).not.toBeNull();
  expect(statusPillBox).not.toBeNull();
  expect(statusPillBox!.width).toBeGreaterThan(workspaceCardBox!.width * 0.7);
  expect(statusPillBox!.x).toBeGreaterThanOrEqual(workspaceCardBox!.x);
});

test("landing page hides untouched drafts until the filer actually starts the return", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);

  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);

  await page.getByRole("link", { name: /back to my returns/i }).click();
  await expect(page).toHaveURL("/");

  await expect(page.getByText(/No saved returns yet\./i)).toBeVisible();
  await expect(page.locator(".workspace-list > li")).toHaveCount(0);
});

test("arbitrary return urls do not create saved drafts until creation is explicit", async ({ page }) => {
  await page.goto("/");
  await enableAdvancedMode(page);
  await page.goto("/returns/manual-check");

  await expect(page.getByRole("heading", { name: /return manual-check is not saved locally/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /back to my returns/i })).toBeVisible();

  await page.getByRole("link", { name: /back to my returns/i }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText(/No saved returns yet\./i)).toBeVisible();

  await page.goto("/returns/manual-check");
  await page.getByRole("link", { name: /create this return/i }).click();

  await expect(page).toHaveURL(/\/returns\/manual-check(?:\?create=1)?$/i);
  await expect(page.getByRole("heading", { name: /tax return manual-check/i })).toBeVisible();

  await page.getByRole("link", { name: /back to my returns/i }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText(/No saved returns yet\./i)).toBeVisible();

  await page.goto("/returns/manual-check");
  await expect(page.getByRole("heading", { name: /tax return manual-check/i })).toBeVisible();
});

test("landing page collapses older saved returns until the filer asks to see them", async ({ page }) => {
  await page.goto("/");

  for (let index = 0; index < 6; index += 1) {
    await saveGuidedSetupProgress(page);
    await page.getByRole("link", { name: /my returns/i }).click();
    await expect(page).toHaveURL("/");
  }

  await expect(page.getByText(/showing 4 most recent of 6 saved returns\./i)).toBeVisible();
  await expect(page.locator(".workspace-list > li")).toHaveCount(4);

  await page.getByRole("button", { name: /show 2 older returns/i }).click();

  await expect(page.locator(".workspace-list > li")).toHaveCount(6);
  await expect(page.getByRole("button", { name: /show only the latest 4 returns/i })).toBeVisible();
});

test("switching one return to advanced mode does not skip guided onboarding for the next new return", async ({ page }) => {
  await page.goto("/");

  const workspaceId = await saveGuidedSetupProgress(page);

  await page.getByRole("button", { name: /switch to advanced mode/i }).click();
  await expect(page.getByRole("button", { name: /start guided interview/i })).toBeVisible();

  await page.getByRole("link", { name: /back to my returns/i }).click();
  await expect(page).toHaveURL("/");

  const existingWorkspaceCard = page.getByRole("listitem").filter({ hasText: `Tax Return ${workspaceId}` });
  await existingWorkspaceCard.getByRole("link", { name: /continue tax return/i }).click();
  await expect(page.getByRole("button", { name: /start guided interview/i })).toBeVisible();

  await page.getByRole("link", { name: /^my returns$/i }).click();
  await expect(page).toHaveURL("/");

  await page.getByRole("link", { name: /start new return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
  await expect(page.getByRole("heading", { name: /let's tailor your return\./i })).toBeVisible();
  await expect(page.getByRole("button", { name: /switch to advanced mode/i })).toBeVisible();
});
