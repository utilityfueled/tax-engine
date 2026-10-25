import { expect, test } from "@playwright/test";
import { taxpayerFacts2025 } from "./guided-fixtures";

test("actual energy and business answers preserve unknown, false, zero and exact cents after reload", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (request) => sent.push(`${request.url()}\n${request.postData() ?? ""}`));
  await page.goto("/returns/new");
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.evaluate(({ id, facts }) => {
    localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: "interview", taxYear: 2025,
      segmentation: { filingStatus: "single", incomeTypes: ["self-employment"], lifeEvents: [], stateCode: null },
      currentSectionIndex: 1, completedSections: ["personal-info", "income-self-employment", "adjustments", "deductions", "credits"],
      sectionData: { "personal-info": facts } }));
  }, { id, facts: taxpayerFacts2025 });
  await page.reload();
  await page.getByText("Schedule C — Business Expenses", { exact: true }).click();
  const participation = page.getByRole("combobox", { name: "Did you materially participate in this business under the section 469 rules?", exact: true });
  await expect(participation).toHaveValue("");
  await participation.selectOption("false");
  await page.reload();
  await page.getByText("Schedule C — Business Expenses", { exact: true }).click();
  await expect(participation).toHaveValue("false");
  await participation.selectOption("");
  const receipts = page.getByRole("textbox", { name: /^Income not reported on a 1099-NEC/ });
  await receipts.fill("9007199254740993.01");
  await receipts.blur();
  await expect(receipts).toHaveValue("9,007,199,254,740,993.01");
  await page.reload();
  await page.getByText("Schedule C — Business Expenses", { exact: true }).click();
  await expect(participation).toHaveValue("");
  await expect(receipts).toHaveValue("9,007,199,254,740,993.01");
  await page.locator(".guided-progress-steps").getByRole("button", { name: "Tax Credits", exact: true }).click();
  await page.getByRole("button", { name: "+ Add improvement", exact: true }).click();
  await page.getByRole("combobox", { name: "Improvement category", exact: true }).selectOption("exterior_door");
  await page.getByRole("textbox", { name: "Net qualified improvement cost", exact: true }).fill("1000.10");
  await page.getByLabel("Improvement installation completion date", { exact: true }).fill("2025-04-01");
  await page.getByLabel("Qualified manufacturer ID (four characters for 2025)", { exact: true }).fill("A1B2");
  const qualification = page.getByRole("combobox", { name: "Do actual records establish this item's qualification?", exact: true });
  await expect(qualification).toHaveValue("");
  await qualification.selectOption("false");
  await page.getByRole("combobox", { name: "Does the residence and personal-use eligibility documented in Form 5695 apply?", exact: true }).selectOption("true");
  await page.getByRole("textbox", { name: /^Prior-year Form 5695 carryforward/ }).fill("0");
  await page.getByLabel("Carryforward source tax year", { exact: true }).fill("2024");
  await page.getByRole("combobox", { name: "Is this carryforward confirmed from the prior-year Form 5695?", exact: true }).selectOption("true");
  await page.reload();
  await expect(qualification).toHaveValue("false");
  await expect(page.getByRole("textbox", { name: /^Prior-year Form 5695 carryforward/ })).toHaveValue("0");
  const stored = await page.evaluate((id) => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)!), id);
  expect(stored.sectionData["income-self-employment"].qbiMateriallyParticipated).toBeNull();
  expect(stored.sectionData.credits.energy.qualifiedImprovements[0]).toMatchObject({ category: "exterior_door", qualifiedCost: "1000.10", installationCompletedDate: "2025-04-01", qualificationConfirmed: false, manufacturerQualifiedId: "A1B2" });
  expect(stored.sectionData.credits.energy.priorYearCarryforward).toBe("0");
  expect(sent.join("\n")).not.toContain("900-70-0001");
  expect(sent.join("\n")).not.toContain("9007199254740993.01");
});
