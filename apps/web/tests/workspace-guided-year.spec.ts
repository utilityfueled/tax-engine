import { expect, test } from "@playwright/test";
import { taxpayerFacts2025 } from "./guided-fixtures";

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`restores a guided-only year and blocks unknown or unsupported years at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const requests: string[] = [];
    page.on("request", request => requests.push(request.postData() ?? ""));
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("tax-engine:guided-mode", "false"));
    await page.getByRole("button", { name: /start your tax return/i }).click();
    await expect(page).toHaveURL(/\/returns\/(?!new)[a-z0-9-]+/i);
    const id = new URL(page.url()).pathname.split("/").at(-1);
    if (!id) throw new Error("Synthetic workspace ID is missing.");
    await expect.poll(() => page.evaluate(id => {
      const stored = JSON.parse(localStorage.getItem("tax-engine.return-workspaces.v1") ?? "{}");
      return Boolean(stored.workspaces?.[id]);
    }, id)).toBe(true);
    await page.evaluate(({ id, facts }) => {
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({
        phase: "complete", taxYear: 2025,
        segmentation: { filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null },
        currentSectionIndex: 5, completedSections: ["personal-info", "deductions", "credits", "payments", "review", "final-review"],
        sectionData: { "personal-info": facts },
      }));
      localStorage.setItem(`tax-engine:guided-mode:${id}`, "false");
      // Do not edit the workspace year or insert document records. The saved
      // actual interview is the sole source for this guided-only return year.
    }, { id, facts: taxpayerFacts2025 });
    await page.reload();
    const summary = page.getByRole("region", { name: "Return Summary", exact: true });
    const year = summary.locator("article").filter({ has: page.getByText("target tax year", { exact: true }) });
    const checklist = page.getByRole("region", { name: "Checklist", exact: true });
    await expect(year.locator("strong")).toHaveText("2025");
    await expect(checklist).toContainText("Guided facts saved");
    await expect(checklist).toContainText("Complete guided questions");
    await expect(summary).not.toContainText("not yet determined");
    const saved = await page.evaluate(id => JSON.parse(localStorage.getItem("tax-engine.return-workspaces.v1") ?? "{}").workspaces[id], id);
    expect(saved.documents).toEqual([]);
    expect(saved.structuredFacts).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`guided-year-${viewport.width}.png`), fullPage: true });

    for (const taxYear of [null, 2026]) {
      await page.evaluate(({ id, taxYear }) => {
        const key = `tax-engine.guided-flow-state.v1:${id}`;
        const flow = JSON.parse(localStorage.getItem(key)!);
        flow.taxYear = taxYear;
        localStorage.setItem(key, JSON.stringify(flow));
      }, { id, taxYear });
      await page.reload();
      await expect(year.locator("strong")).toHaveText(taxYear === null ? "not set yet" : "2026 not supported yet");
      await expect(checklist.locator("li").filter({ hasText: "Check tax year and source facts" })).toContainText("blocked");
      await expect(checklist.locator("li").filter({ hasText: "Review summary and completed return" })).toContainText("blocked");
    }
    expect(requests.some(body => body.includes("900-70-0001"))).toBe(false);
  });
}
