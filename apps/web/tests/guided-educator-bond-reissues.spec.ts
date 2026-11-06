/** Spec: spec/federal/educator-bond-reissue-coordination.yaml production-saved-source. */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { actualEducatorBondReissueInterview } from "./guided-educator-bond-reissue-fixture";

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Actual educator bond records at ${viewport.width}px`, () => {
    test("preserves actual successor records through edits reload and review", async ({ page }, testInfo) => {
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
      }, { id, state: actualEducatorBondReissueInterview() });
      await page.reload();
      const steps = page.locator(".guided-progress-steps"), hero = page.locator(".guided-ticker-value-hero").first();
      await steps.getByRole("button", { name: "Adjustments", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Educator expense sources", exact: true })).toBeVisible();
      const cost = page.getByRole("textbox", { name: "Educator 1, expense 1: Actual paid cost", exact: true });
      const firstConfirmed = page.getByRole("combobox", { name: "Educator 1: Sources checked after the last edit", exact: true });
      const secondConfirmed = page.getByRole("combobox", { name: "Educator 2: Sources checked after the last edit", exact: true });
      const amount = page.getByRole("textbox", { name: "Educator 1: Excludable savings-bond interest from Form 8815", exact: true });
      await expect(cost).toHaveValue("400"); await expect(amount).toHaveValue("");
      await expect(page.getByRole("combobox", { name: "Educator 1: Savings-bond reduction method", exact: true })).toHaveValue("return_sources");
      await expect(hero).not.toHaveText("Enter more info for an estimate");
      const originalPreview = await hero.textContent();
      await cost.fill(""); await expect(firstConfirmed).toHaveValue("");
      await expect(hero).toHaveText("Enter more info for an estimate");
      await page.reload(); await expect(cost).toHaveValue(""); await expect(hero).toHaveText("Enter more info for an estimate");
      await cost.fill("400"); await firstConfirmed.selectOption("true"); await secondConfirmed.selectOption("true");
      await expect(amount).toHaveValue(""); await expect(hero).toHaveText("Enter more info for an estimate");
      await cost.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`educator-reissue-source-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await cost.boundingBox())?.width).toBeGreaterThanOrEqual(180);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.locator(".guided-progress-step-active")).toContainText("Deductions");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.locator(".guided-progress-step-active")).toContainText("Tax Credits");
      const bondConfirmed = page.getByRole("combobox", { name: "All bond and education sources checked after the last edit", exact: true });
      await expect(bondConfirmed).toHaveValue("");
      await page.getByRole("combobox", { name: "Original reissue history checked after the last edit", exact: true }).selectOption("true");
      await page.getByRole("combobox", { name: "Current Form 1099-INT interest reconciled with actual bond reporting history", exact: true }).selectOption("true");
      await bondConfirmed.selectOption("true");
      await expect(hero).toHaveText("Enter more info for an estimate");
      await steps.getByRole("button", { name: "Adjustments", exact: true }).click();
      await expect(firstConfirmed).toHaveValue(""); await expect(secondConfirmed).toHaveValue("");
      await firstConfirmed.selectOption("true"); await secondConfirmed.selectOption("true");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.locator(".guided-progress-step-active")).toContainText("Deductions");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.locator(".guided-progress-step-active")).toContainText("Tax Credits");
      await expect(hero).toHaveText("Enter more info for an estimate");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.locator(".guided-progress-step-active")).toContainText("Other Taxes");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.locator(".guided-progress-step-active")).toContainText("Payments");
      const paymentConfirmed = page.getByRole("combobox", { name: "Estimated-tax sources checked after the last edit", exact: true });
      await expect(paymentConfirmed).toHaveValue(""); await paymentConfirmed.selectOption("true");
      await expect(hero).toHaveText(originalPreview ?? "");
      await page.reload(); await expect(paymentConfirmed).toHaveValue("true"); await expect(hero).toHaveText(originalPreview ?? "");
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? "{}"), id);
      expect(saved.sectionData.adjustments.educatorExpenseSources.map((source: { excludedSavingsBondInterest: string }) => source.excludedSavingsBondInterest)).toEqual(["", ""]);
      expect(saved.sectionData.adjustments.educatorExpenseSources.map((source: { savingsBondReductionMethod: string }) => source.savingsBondReductionMethod)).toEqual(["return_sources", "return_sources"]);
      expect(saved.sectionData.credits.savingsBondEducation.reissueSources.groups[0].taxpayerPurchaseFunds).toBe("500");
      expect(saved.sectionData.credits.savingsBondEducation.reissueSources.groups[0].spousePurchaseFunds).toBe("0");
      expect(saved.sectionData.credits.savingsBondEducation.reissueSources.groups[0].reissueDate).toBe("2025-06-01");
      expect(saved.sectionData.payments.estimatedTaxFacts.sourceFactsConfirmed).toBe(true);
      writeFileSync(testInfo.outputPath(`educator-reissue-original-${viewport.width}.json`), JSON.stringify(saved, null, 2) + "\n");
      const secrets = ["900-70-3101", "Fictional actual purchase", "primary-receipt", "Fictional primary school"];
      for (const secret of secrets) expect(requests.some(request => request.body.includes(secret))).toBe(false);
      await steps.getByRole("button", { name: "Final Review", exact: true }).click();
      await page.getByRole("button", { name: "Open Full Return", exact: true }).click();
      const bundle = page.getByRole("region", { name: "Return Bundle", exact: true });
      await expect(bundle).toContainText("Filing exports are not yet qualified");
      const downloading = page.waitForEvent("download"), response = page.waitForResponse(response => response.url().endsWith("/api/workspace/filled-return"));
      await bundle.getByRole("button", { name: "Download Review PDF", exact: true }).click();
      expect((await response).status()).toBe(200);
      const path = testInfo.outputPath(`educator-reissue-review-${viewport.width}.pdf`);
      await (await downloading).saveAs(path);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c",
        'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', path],
        { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] }));
      const text = pages.join(" ").replace(/\s+/g, " ");
      for (const literal of ["Primary educator excluded bond interest: 250", "Spouse educator excluded bond interest: 150", "Educator deduction for Form 8815 MAGI: 600", "Final Schedule 1 educator deduction: 400"])
        expect(text).toContain(literal);
      expect(pages[0]).toContain("Packet completeness status: partial.");
      expect(pages[0]?.replace(/\s+/g, " ")).toContain("Form 8815 is included as a reference summary, not an official filed Form 8815.");
      expect(pages.find(page => page.includes("11a Subtract line 10"))?.replace(/\s+/g, " ")).toMatch(/\b80100 400 79700\b/);
      for (const pageText of pages) expect(pageText.split("FOR REVIEW ONLY - NOT FOR FILING")).toHaveLength(2);
      for (const secret of [...secrets, "900703101"]) expect(text).not.toContain(secret);
      for (const request of requests.filter(request => request.body.includes("primary-receipt"))) {
        expect(new URL(request.url).origin).toBe(new URL(page.url()).origin);
        expect(new URL(request.url).pathname).toBe("/api/workspace/filled-return");
      }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`educator-reissue-review-${viewport.width}.png`) });
    });
  });
}
