import { expect, test } from "@playwright/test";
import { PDFDocument, PDFTextField } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { taxpayerFacts2025 } from "./guided-fixtures";

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`restores a guided-only year and blocks unknown or unsupported years at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const requests: { url: string; body: string }[] = [];
    page.on("request", request => requests.push({ url: request.url(), body: request.postData() ?? "" }));
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
    const bundle = page.getByRole("region", { name: "Return Bundle", exact: true });
    await expect(bundle).not.toContainText("Upload at least one document");
    await expect(bundle).toContainText("Filing exports are not yet qualified");
    const jsonDownload = page.waitForEvent("download");
    await bundle.getByRole("button", { name: "Download Return Bundle (.json)", exact: true }).click();
    const json = await jsonDownload;
    const jsonPath = await json.path();
    if (!jsonPath) throw new Error("JSON review summary was not downloaded.");
    const downloaded = JSON.parse(await readFile(jsonPath, "utf8"));
    expect(downloaded.manifest).toMatchObject({ targetTaxYear: 2025, localOnly: true, returnStatus: "ready-to-recompute" });
    expect(JSON.stringify(downloaded)).not.toContain("900-70-0001");
    expect(requests.some(request => request.body.includes("900-70-0001"))).toBe(false);
    const pdfDownload = page.waitForEvent("download");
    const pdfResponse = page.waitForResponse(response => response.url().endsWith("/api/workspace/filled-return"));
    await bundle.getByRole("button", { name: "Download Review PDF", exact: true }).click();
    expect((await pdfResponse).status()).toBe(200);
    const pdf = await pdfDownload;
    const pdfPath = await pdf.path();
    if (!pdfPath) throw new Error("Actual guided review PDF was not downloaded.");
    expect(pdf.suggestedFilename()).toContain("review-return");
    const document = await PDFDocument.load(await readFile(pdfPath));
    expect(document.getPageCount()).toBeGreaterThan(1);
    const formValues = document.getForm().getFields().filter(field => field instanceof PDFTextField).map(field => field.getText());
    expect(JSON.stringify(formValues)).not.toContain("900-70-0001");
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
      await expect(page.getByRole("region", { name: "Draft Return Bundle", exact: true })).toBeVisible();
      await expect(page.getByText("Your return bundle is ready.", { exact: false })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Download Review PDF", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Download Draft Filled Return PDF", exact: true })).toHaveCount(0);
    }
    expect(requests.filter(request => !request.url.endsWith("/api/workspace/filled-return")).some(request => request.body.includes("900-70-0001"))).toBe(false);
  });
}
