// Spec: spec/federal/guided-government-payment-worksheets.yaml, cash-farm-box7-review.
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { taxpayerFacts2025 } from "./guided-fixtures";

const statementReference = "private-fictional-USDA-statement";
const receiptReference = "private-fictional-USDA-receipt";
const farmReference = "private-fictional-farm-books";
const source = {
  sourceTaxYear: "2025", sourceFormRevision: "2024-03", payer: "Fictional USDA office", payerTin: "12-3456789",
  accountReference: statementReference, accountHolder: "primary", recipientTaxIdLast4: "0001", programType: "other-government",
  compensation: "0", federalWithheld: "31.27", stateOrLocalTaxRefund: "0", rtaaPayments: "0", taxableGrants: "0",
  agriculturePayments: "1000.41", marketGain: "0", tradeOrBusinessRefund: false, currentYearRepaid: "0", priorYearRepaid: "0",
  unrecoveredAfterTaxContributions: "0", actualReceiptConfirmed: true, additionalWorksheetRequired: false,
  sourceFactsConfirmed: true, stateTaxReporting: "none",
};

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Cash-farm originals at ${viewport.width}px`, () => {
    test("reconfirms and reopens exact USDA cash-farm sources and downloads the historical review", async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const privateRequests: URL[] = [];
      const privateValues = [statementReference, receiptReference, farmReference, taxpayerFacts2025.ssn];
      page.on("request", request => {
        if (privateValues.some(value => request.postData()?.includes(value))) privateRequests.push(new URL(request.url()));
      });
      await page.goto("/returns/new");
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split("/").at(-1);
      if (!id) throw new Error("Missing synthetic return ID");
      const key = `tax-engine.guided-flow-state.v1:${id}`;
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem("tax-engine.return-workspaces.v1") ?? "{}").workspaces?.[id]), id)).toBe(true);
      await page.evaluate(({ id, key, source, taxpayer }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, "true");
        localStorage.setItem(key, JSON.stringify({ factsVersion: 2, phase: "interview", taxYear: 2025, currentSectionIndex: 1,
          segmentation: { filingStatus: "single", incomeTypes: ["unemployment"], lifeEvents: [], stateCode: null },
          completedSections: ["personal-info", "deductions", "credits", "payments", "review", "final-review"],
          sectionData: {
            "personal-info": taxpayer,
            "income-unemployment": { compensation: "0", federalWithheld: "31.27", entries: [source] },
          },
        }));
      }, { id, key, source, taxpayer: taxpayerFacts2025 });
      await page.reload();

      const farm = page.getByRole("group", { name: "Cash-farm records for USDA Box 7", exact: true });
      const confirmation = farm.getByRole("combobox", { name: /I checked the farm books and every USDA receipt/ });
      const estimate = page.locator(".guided-ticker-value-hero").first();
      await expect(farm).toBeVisible();
      await expect(estimate).toHaveText("Enter more info for an estimate");
      await farm.getByRole("combobox", { name: "Actual farm owner", exact: true }).selectOption("primary");
      await farm.getByRole("textbox", { name: "Year of these farm books", exact: true }).fill("2025");
      await farm.getByRole("textbox", { name: "Local reference for the complete year-end farm books", exact: true }).fill(farmReference);
      await farm.getByRole("textbox", { name: "Principal crop or farm activity", exact: true }).fill("Market vegetables");
      const farmAmounts = [
        [/^Sales of livestock, produce or crops raised/, "2500.65"], [/^Seeds and plants/, "100.52"], [/^Farm supplies/, "0"],
        [/^Farm utilities/, "0"], [/^Farm gasoline/, "0"], [/^Farm repairs/, "0"], [/^Unadjusted basis/, "0"],
      ] as const;
      for (const [name, value] of farmAmounts) {
        const input = farm.getByRole("textbox", { name });
        await input.fill(value);
        await input.press("Tab");
      }
      await farm.getByRole("button", { name: "Add USDA receipt", exact: true }).click();
      const receipt = farm.getByRole("group", { name: "Original USDA receipt 1", exact: true });
      await receipt.getByRole("textbox", { name: "Payer TIN on the matching Form 1099-G", exact: true }).fill(source.payerTin);
      await receipt.getByRole("textbox", { name: "Matching Form 1099-G statement reference", exact: true }).fill(statementReference);
      await receipt.getByRole("textbox", { name: "Local reference for this payment record", exact: true }).fill(receiptReference);
      const date = receipt.getByLabel("Actual payment receipt date", { exact: true });
      await date.fill("2025-09-14");
      const payment = receipt.getByRole("textbox", { name: /^Actual taxable amount received/ });
      await payment.fill("1000.41");
      await payment.press("Tab");
      await receipt.getByRole("combobox", { name: "Program on the original receipt", exact: true }).selectOption("ordinary-taxable-usda");
      await farm.getByRole("combobox", { name: /The books confirm this is the complete income/ }).selectOption("true");
      await confirmation.selectOption("true");
      // 2025: $480 self-employment tax less $243 EIC and $31.27 withholding.
      await expect(estimate).toHaveText("$206");

      await payment.fill("1000.42");
      await payment.press("Tab");
      await expect(confirmation).toHaveValue("");
      await expect(estimate).toHaveText("Enter more info for an estimate");
      await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "{}").sectionData?.["income-unemployment"]?.cashFarm?.receipts[0].amount, key)).toBe("1,000.42");
      await page.reload();
      await expect(date).toHaveValue("2025-09-14");
      await expect(payment).toHaveValue("1,000.42");
      await expect(confirmation).toHaveValue("");
      await confirmation.selectOption("true");
      await expect(estimate).toHaveText("Enter more info for an estimate");

      await payment.fill("1000.41");
      await payment.press("Tab");
      await confirmation.selectOption("true");
      await expect(estimate).toHaveText("$206");
      await expect(privateRequests).toEqual([]);
      await page.locator(".guided-nav").getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.locator(".guided-progress-step-active")).toContainText("Deductions");
      const steps = page.locator(".guided-progress-steps");
      await steps.getByRole("button", { name: "Review & Summary", exact: true }).click();
      await expect(page.getByText("Original USDA agriculture payments (Box 7)", { exact: true }).locator("..")).toContainText("$1,000.41");
      await expect(page.getByText("Cash-farm originals checked", { exact: true })).toBeVisible();
      await expect(page.getByText("Government federal withholding", { exact: true }).locator("..")).toContainText("$31.27");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await steps.getByRole("button", { name: "Final Review", exact: true }).click();
      await page.getByRole("button", { name: "Open Full Return", exact: true }).click();
      const bundle = page.getByRole("region", { name: "Return Bundle", exact: true });
      await expect(bundle).toContainText("Filing exports are not yet qualified");
      const response = page.waitForResponse(response => response.url().endsWith("/api/workspace/filled-return"));
      const download = page.waitForEvent("download");
      await bundle.getByRole("button", { name: "Download Review PDF", exact: true }).click();
      expect((await response).status()).toBe(200);
      const output = testInfo.outputPath("cash-farm-review.pdf");
      await (await download).saveAs(output);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c",
        "from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", output], { encoding: "utf8", timeout: 30_000 }));
      const scheduleF = pages.find(text => /Profit or Loss From Farming/i.test(text));
      expect(scheduleF).toContain("Market vegetables");
      // Schedule F appearance order: 2, 4a, 4b, 9, 26, 33 and 34.
      expect(scheduleF?.split(/\s+/).filter(value => /^\d+$/.test(value)).slice(-7)).toEqual([
        "2501", "1000", "1000", "3501", "101", "101", "3401",
      ]);
      for (const text of pages) expect(text).toContain("FOR REVIEW ONLY - NOT FOR FILING");
      for (const value of [...privateValues, taxpayerFacts2025.ssn.replaceAll("-", "")]) expect(pages.join("\n")).not.toContain(value);
      for (const url of privateRequests) {
        expect(url.origin).toBe(new URL(page.url()).origin);
        expect(url.pathname).toBe("/api/workspace/filled-return");
      }
      await page.getByRole("link", { name: "Back to My Returns", exact: true }).click();
      const saved = page.getByRole("listitem").filter({ hasText: new RegExp(`Tax Return ${id}`, "i") });
      await expect(saved).toBeVisible();
      await saved.getByRole("button", { name: /delete/i }).click();
      await expect(page.getByRole("status", { name: /saved returns status/i })).toContainText(`Deleted return ${id}.`);
      await expect(saved).toHaveCount(0);
      await expect.poll(() => page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
    });
  });
}
