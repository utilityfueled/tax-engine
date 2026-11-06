import { expect, test } from "@playwright/test";
import { taxpayerFacts2025 } from "./guided-fixtures";

for (const width of [1280, 390]) {
  test(`actual wagering expenses survive edits and reload at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const sent: string[] = [];
    page.on("request", request => sent.push(`${request.url()}\n${request.postData() ?? ""}`));
    await page.goto("/returns/new");
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split("/").at(-1);
    if (!id) throw new Error("Missing created workspace ID");
    await page.evaluate(({ id, facts }) => {
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: "interview", taxYear: 2025,
        segmentation: { filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null },
        currentSectionIndex: 1, completedSections: ["personal-info"],
        sectionData: { "personal-info": facts } }));
    }, { id, facts: taxpayerFacts2025 });
    await page.reload();
    await page.getByRole("radio", { name: /Itemize deductions/ }).check();
    await page.locator("summary").filter({ hasText: "Less common itemized deductions" }).click();
    const expenses = page.getByRole("textbox", { name: /^Otherwise deductible wagering expenses/ });
    await expect(expenses).toHaveValue("");
    await page.getByRole("textbox", { name: /^Gambling winnings not already reported/ }).fill("1000");
    await page.getByRole("textbox", { name: /^Wagering losses/ }).fill("900");
    await expenses.fill("100.10"); await expenses.blur();
    await expect(expenses).toHaveValue("100.10");
    await page.reload();
    await page.locator("summary").filter({ hasText: "Less common itemized deductions" }).click();
    await expect(expenses).toHaveValue("100.10");
    const stored = () => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? "null"), id);
    expect((await stored()).sectionData.deductions).toMatchObject({ gamblingWinnings: "1,000", gamblingLosses: "900", gamblingExpenses: "100.10" });
    await expenses.fill("0"); await expenses.blur(); await expect(expenses).toHaveValue("0");
    expect((await stored()).sectionData.deductions.gamblingExpenses).toBe("0");
    await page.getByRole("radio", { name: /^Standard deduction/ }).check();
    await page.reload();
    expect((await stored()).sectionData.deductions.gamblingExpenses).toBe("0");
    await page.getByRole("radio", { name: /Itemize deductions/ }).check();
    await page.locator("summary").filter({ hasText: "Less common itemized deductions" }).click();
    await expect(expenses).toHaveValue("0");
    await expenses.fill(""); await expenses.blur();
    expect((await stored()).sectionData.deductions.gamblingExpenses).toBe("");
    expect(sent.join("\n")).not.toContain("gamblingExpenses");
    expect(sent.join("\n")).not.toContain("900-70-0001");
    await expect(page.getByText(/amounts deducted elsewhere\. Leave blank if unknown/)).toBeVisible();
  });
}
