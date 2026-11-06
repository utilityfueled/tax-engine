import { expect, test } from "@playwright/test";

// Browser transport is synthetic; the separate PostgreSQL/SMTP integration
// suite proves token consumption, rollback and delivery. No real mail is sent.
for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 812 }]) {
  test(`account recovery protects the URL and supports keyboard use at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const hosted = process.env.TAX_ENGINE_DEPLOYMENT_MODE === "hosted";
    const token = "SyntheticBrowserRecoveryToken123456";
    const requests: string[] = [];
    page.on("request", request => requests.push(request.url()));
    await page.addInitScript(() => localStorage.setItem("synthetic-return-backup-marker", "preserve-local-tax-facts"));
    const response = await page.goto(`/account/recover${hosted ? `#token=${token}` : ""}`);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");

    if (!hosted) {
      await expect(page.getByRole("heading", { name: "No account required." })).toBeVisible();
      await expect(page.getByRole("textbox")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Back to returns" })).toHaveAttribute("href", "/");
      return;
    }

    await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/account\/recover$/);
    expect(await page.locator("body").innerText()).not.toContain(token);
    await page.route("**/api/auth/reset-password", async route => {
      const request = route.request();
      expect(request.method()).toBe("POST");
      expect(request.headers()["referer"]).toBeUndefined();
      expect(request.postDataJSON()).toEqual({ token, newPassword: "Synthetic browser password" });
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    const password = page.getByLabel("New password", { exact: true });
    await password.fill("Synthetic browser password");
    await password.press("Tab");
    await expect(page.getByLabel("Confirm new password")).toBeFocused();
    await page.keyboard.type("Synthetic browser password");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Change password" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Your password has been changed. Sign in with your new password.");
    expect(requests.every(url => !url.includes(token))).toBe(true);
    const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
    expect(storage.local["synthetic-return-backup-marker"]).toBe("preserve-local-tax-facts");
    expect(JSON.stringify(storage)).not.toContain(token);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);

    let recoveryStatus = 200;
    await page.route("**/api/auth/request-password-reset", async route => {
      expect(route.request().postDataJSON()).toEqual({ email: "synthetic@example.test" });
      await route.fulfill({ status: recoveryStatus, contentType: "application/json", body: "{}" });
    });
    await page.goto("/account/recover");
    const email = page.getByLabel("Account email");
    await email.fill("synthetic@example.test");
    await email.press("Enter");
    await expect(page.getByRole("status")).toHaveText("If an account matches that address, you’ll receive a reset link.");
    recoveryStatus = 429;
    await email.fill("synthetic@example.test");
    await email.press("Enter");
    await expect(page.locator("#account-recovery").getByRole("alert")).toHaveText("Too many requests. Try again later.");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`account-recovery-${viewport.width}.png`), fullPage: true });
  });
}
