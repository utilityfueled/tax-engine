import { expect, test } from "@playwright/test";
import { taxpayerFacts2025 } from "./guided-fixtures";

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`calculation explanation needs explicit consent and preserves disabled provider gates at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const sent: Array<{ url: string; body: string }> = [];
    page.on("request", request => sent.push({ url: request.url(), body: request.postData() ?? "" }));
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("tax-engine:guided-mode", "false"));
    await page.getByRole("button", { name: /start your tax return/i }).click();
    await expect(page).toHaveURL(/\/returns\/(?!new)[a-z0-9-]+/i);
    const id = new URL(page.url()).pathname.split("/").at(-1);
    if (!id) throw new Error("Synthetic workspace ID is missing.");
    // Actual explicit fixture facts, no uploaded documents or claimed calculation totals.
    await page.evaluate(({ id, facts }) => {
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({
        phase: "complete", taxYear: 2025,
        segmentation: { filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null },
        currentSectionIndex: 5, completedSections: ["personal-info", "deductions", "credits", "payments", "review", "final-review"],
        sectionData: { "personal-info": facts },
      }));
      localStorage.setItem(`tax-engine:guided-mode:${id}`, "false");
      const stored = JSON.parse(localStorage.getItem("tax-engine.return-workspaces.v1") ?? "{}");
      stored.workspaces[id].returnSummary.targetTaxYear = 2025;
      localStorage.setItem("tax-engine.return-workspaces.v1", JSON.stringify(stored));
    }, { id, facts: taxpayerFacts2025 });
    await page.reload();
    await page.getByRole("button", { name: "Need help?", exact: true }).click();
    const localOnly = page.getByRole("checkbox", { name: "Use local help only", exact: true });
    const consent = page.getByRole("checkbox", { name: "Explain my confirmed calculation", exact: true });
    await expect(localOnly).toBeChecked(); await expect(consent).not.toBeChecked(); await expect(consent).toBeDisabled();
    await page.getByRole("textbox", { name: "Ask for help with your return", exact: true }).fill("Explain adjusted gross income.");
    await page.getByRole("button", { name: "Ask the AI helper", exact: true }).click();
    await expect(page.locator(".return-help-thread")).toContainText("Explain adjusted gross income.");
    expect(sent.some(request => request.body.includes("900-70-0001"))).toBe(false);
    await localOnly.uncheck(); await expect(consent).toBeEnabled(); await expect(consent).not.toBeChecked();
    await consent.focus(); await page.keyboard.press("Space"); await expect(consent).toBeChecked();
    await page.getByRole("textbox", { name: "Ask for help with your return", exact: true }).fill("Explain my confirmed calculation.");
    const returned = page.waitForResponse(response => response.url().endsWith("/api/workspace/tax-explanation"));
    await page.getByRole("button", { name: "Ask the AI helper", exact: true }).click();
    const response = await returned;
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.json()).toMatchObject({ provider: "mock-local" });
    const privateRequests = sent.filter(request => request.body.includes("900-70-0001"));
    expect(privateRequests).toHaveLength(1);
    expect(new URL(privateRequests[0].url).pathname).toBe("/api/workspace/tax-explanation");
    const body = JSON.parse(privateRequests[0].body);
    expect(body).toMatchObject({ confirmed: true, taxYear: 2025, taxInput: { taxpayer: { primary: { ssn: "900-70-0001" } } } });
    expect(body.providerRequest).not.toHaveProperty("taxInput");
    expect(JSON.stringify(body.providerRequest)).not.toContain("900-70-0001");
    await page.screenshot({ path: testInfo.outputPath(`calculation-consent-${viewport.width}.png`), fullPage: true });
    await localOnly.check(); await expect(consent).not.toBeChecked();
    await page.reload(); await page.getByRole("button", { name: "Need help?", exact: true }).click();
    await expect(localOnly).toBeChecked(); await expect(consent).not.toBeChecked();
  });
}
