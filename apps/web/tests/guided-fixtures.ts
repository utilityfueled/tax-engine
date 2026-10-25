import { expect, type Page } from "@playwright/test";

/** Navigate the optional document step through the same controls as a user. */
export async function reachFilingStatus(page: Page) {
  await expect(page.getByRole("heading", { name: /let's tailor your return/i })).toBeVisible();
  if (await page.getByRole("heading", { name: /^upload documents$/i }).isVisible()) {
    await page.locator(".guided-segmentation .guided-nav").getByRole("button", { name: "Continue", exact: true }).click();
  }
  await expect(page.getByText(/what's your filing status/i)).toBeVisible();
}

/** Explicit fictional facts for browser calculation fixtures, never app defaults. */
export async function fillRequiredTaxpayerFacts(page: Page) {
  await page.getByRole("combobox", { name: "Tax year for this interview", exact: true }).selectOption("2025");
  await page.getByLabel("First name", { exact: true }).fill("Jane");
  await page.getByLabel("Last name", { exact: true }).fill("Example");
  await page.getByRole("textbox", { name: /^Social Security number/ }).fill("900-70-0001");
  await page.getByLabel("Your date of birth", { exact: true }).fill("1990-06-15");
  await page.getByLabel("Months of U.S. residency", { exact: true }).fill("12");
  await page.getByRole("combobox", { name: "State residency", exact: true }).selectOption("full-year");
  await page.getByLabel("Address line 1", { exact: true }).fill("123 Example St");
  await page.getByLabel("City", { exact: true }).fill("Austin");
  await page.getByLabel("State", { exact: true }).fill("TX");
  await page.getByLabel("ZIP", { exact: true }).fill("78701");
  for (const label of [
    "Were you blind under the IRS standard-deduction definition?", "Could another taxpayer claim you as a dependent for the standard deduction?", "Did the primary taxpayer die during this tax year?", "Were you a dual-status alien during this tax year?", "Were you a nonresident alien for the standard-deduction rules?", "Is this a short tax year because of an accounting-period change?",
    "Was your spouse blind under the IRS standard-deduction definition?", "Could another taxpayer claim your spouse as a dependent?", "Did your spouse die during this tax year?", "Does your spouse itemize deductions on their separate return?", "Do you elect the additional age/blindness deduction for an eligible spouse on your separate return?",
  ]) { const field = page.getByRole("combobox", { name: label, exact: true }); if (await field.isVisible()) await field.selectOption("false"); }
  if (await page.getByLabel("Spouse first name", { exact: true }).isVisible()) {
    await page.getByLabel("Spouse first name", { exact: true }).fill("Alex");
    await page.getByLabel("Spouse last name", { exact: true }).fill("Example");
    await page.getByLabel("Spouse taxpayer ID", { exact: true }).fill("900-70-0002");
    await page.getByLabel("Spouse date of birth", { exact: true }).fill("1989-03-20");
    await page.getByLabel("Spouse months of U.S. residency", { exact: true }).fill("12");
    await page.getByRole("combobox", { name: "Did you live with your spouse at any time during the year?", exact: true }).selectOption("true");
  }
}

export const taxpayerFacts2025 = {
  standardDeductionFacts: { primaryBlind: false, primaryCanBeClaimedAsDependent: false, primaryDeceased: false, dualStatusAlien: false, nonresidentAlien: false, shortTaxYear: false },
  firstName: "Jane", lastName: "Example", ssn: "900-70-0001", dateOfBirth: "1990-06-15",
  usResidencyMonths: "12", stateResidency: "full-year", addressLine1: "123 Example St",
  addressLine2: "", city: "Austin", state: "TX", zip: "78701", dependentCount: "0", dependents: [],
} as const;

/** Complete the deliberately synthetic payroll-exempt job used by UI scenarios. */
export async function fillRequiredW2Facts(page: Page) {
  const employer = page.getByRole("textbox", { name: /^Employer name\b/ });
  if (!(await employer.inputValue())) await employer.fill("Synthetic Employer");
  const ein = page.getByRole("textbox", { name: /^Employer EIN \(Box b\)/ });
  if (!(await ein.inputValue())) await ein.fill("12-3456789");
  await page.getByRole("combobox", { name: "W-2 recipient", exact: true }).selectOption("primary");
  const details = page.locator("details").filter({ has: page.getByText("More W-2 boxes", { exact: true }) });
  if ((await details.getAttribute("open")) === null) await page.getByText("More W-2 boxes", { exact: true }).click();
  for (const label of ["Box 2 — Federal income tax withheld", "Box 3 — Social Security wages", "Box 4 — SS tax withheld", "Box 5 — Medicare wages", "Box 6 — Medicare tax withheld"]) {
    const field = page.getByRole("textbox", { name: new RegExp(`^${label}`) });
    if (!(await field.inputValue())) await field.fill("0");
  }
  await page.getByRole("combobox", { name: /^State reporting on this W-2/ }).selectOption("none");
}
