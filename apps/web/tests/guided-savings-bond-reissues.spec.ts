/** Spec: spec/federal/guided-savings-bond-reissues.yaml browser. */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { actualSavingsBondReissueInterview } from "./guided-savings-bond-reissue-fixture";

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Actual bond reissue at ${viewport.width}px`, () => {
    test("preserves actual bond reissue sources through edit reload and review", async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: { url: string; body: string }[] = [];
      page.on("request", request => requests.push({ url: request.url(), body: request.postData() ?? "" }));
      await page.goto("/returns/new");
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split("/").at(-1);
      if (!id) throw new Error("Missing fictional return");
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem("tax-engine.return-workspaces.v1") ?? "{}").workspaces?.[id]), id)).toBe(true);
      await page.evaluate(({ id, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, "true");
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ ...state, phase: "interview", currentSectionIndex: 0,
          completedSections: ["personal-info", "income-w2", "income-investments", "adjustments", "deductions", "credits", "payments", "review", "final-review"] }));
      }, { id, state: actualSavingsBondReissueInterview() });
      await page.reload();
      const steps = page.locator(".guided-progress-steps"), hero = page.locator(".guided-ticker-value-hero").first();
      await steps.getByRole("button", { name: "Tax Credits", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Savings-bond education exclusion (Form 8815)", exact: true })).toBeVisible();
      const prior = page.getByRole("textbox", { name: "Interest you reported before reissue", exact: true });
      const historyConfirmed = page.getByRole("combobox", { name: "Original reissue history checked after the last edit", exact: true });
      const statementConfirmed = page.getByRole("combobox", { name: "Current Form 1099-INT interest reconciled with actual bond reporting history", exact: true });
      const rootConfirmed = page.getByRole("combobox", { name: "All bond and education sources checked after the last edit", exact: true });
      await expect(prior).toHaveValue("0"); await expect(hero).not.toHaveText("Enter more info for an estimate");
      const originalPreview = await hero.textContent();
      await prior.fill("");
      for (const field of [historyConfirmed, statementConfirmed, rootConfirmed]) await expect(field).toHaveValue("");
      await expect(hero).toHaveText("Enter more info for an estimate");
      await page.reload(); await expect(prior).toHaveValue(""); await expect(hero).toHaveText("Enter more info for an estimate");
      await prior.fill("0"); await historyConfirmed.selectOption("true");
      await expect(statementConfirmed).toHaveValue(""); await expect(rootConfirmed).toHaveValue("");
      await statementConfirmed.selectOption("true"); await expect(rootConfirmed).toHaveValue("");
      await rootConfirmed.selectOption("true"); await expect(hero).toHaveText(originalPreview ?? "");
      await page.reload(); await expect(prior).toHaveValue("0"); await expect(hero).toHaveText(originalPreview ?? "");
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? "{}"), id);
      expect(saved.sectionData.credits.savingsBondEducation.reissueSources.groups[0].communityProperty).toBe(false);
      expect(saved.sectionData.credits.savingsBondEducation.redemptions.map((row: { priorYearInterestReported?: string }) => row.priorYearInterestReported)).toEqual([undefined, undefined]);
      expect(saved.sectionData["income-investments"].interestEntries).toHaveLength(1);
      const label = String(viewport.width);
      writeFileSync(testInfo.outputPath(`bond-reissue-original-${label}.json`), JSON.stringify(saved, null, 2) + "\n");
      const secrets = ["900-70-3101", "EE-FICTIONAL", "FICTIONAL-BOND-ACCOUNT", "Fictional original Box3"];
      for (const secret of secrets) expect(requests.some(request => request.body.includes(secret))).toBe(false);
      await prior.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`bond-reissue-source-${label}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.locator(".guided-progress-step-active")).toContainText("Other Taxes");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.locator(".guided-progress-step-active")).toContainText("Payments");
      await steps.getByRole("button", { name: "Final Review", exact: true }).click();
      await page.getByRole("button", { name: "Open Full Return", exact: true }).click();
      const bundle = page.getByRole("region", { name: "Return Bundle", exact: true });
      await expect(bundle).toContainText("Filing exports are not yet qualified");
      const downloading = page.waitForEvent("download"), response = page.waitForResponse(response => response.url().endsWith("/api/workspace/filled-return"));
      await bundle.getByRole("button", { name: "Download Review PDF", exact: true }).click();
      expect((await response).status()).toBe(200);
      const path = testInfo.outputPath(`bond-reissue-review-${label}.pdf`);
      await (await downloading).saveAs(path);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c",
        'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', path],
        { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] }));
      const text = pages.join(" ").replace(/\s+/g, " ");
      const cover = (pages[0] ?? "").replace(/\s+/g, " ");
      expect(cover).toContain("Packet completeness status: partial.");
      expect(cover).toContain("Form 8815 is included as a reference summary, not an official filed Form 8815.");
      for (const literal of ["Statement 1 original Box 3: $500", "Group 1 primary transfer recognized: $100", "Current transfer interest separated from redemption interest"])
        expect(text).toContain(literal);
      for (const pageText of pages) expect(pageText.split("FOR REVIEW ONLY - NOT FOR FILING")).toHaveLength(2);
      for (const secret of [...secrets, "900703101"]) expect(text).not.toContain(secret);
      for (const request of requests.filter(request => request.body.includes("EE-FICTIONAL"))) {
        expect(new URL(request.url).origin).toBe(new URL(page.url()).origin);
        expect(new URL(request.url).pathname).toBe("/api/workspace/filled-return");
      }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`bond-reissue-review-${label}.png`) });
    });
  });
}
