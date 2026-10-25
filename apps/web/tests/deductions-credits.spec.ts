import { fillRequiredTaxpayerFacts, fillRequiredW2Facts, reachFilingStatus } from "./guided-fixtures";
import { expect, test, type Page } from "@playwright/test";

/**
 * Deductions and Credits section tests.
 *
 * Covers the deductions section (standard vs. itemized, Schedule A fields,
 * comparison display) and the credits section (dependent care, education,
 * energy credits) in the guided interview.
 */

/** Complete segmentation with Single / W-2 wages / no events / no state. */
async function completeSegmentation(page: import("@playwright/test").Page) {
  await expect(page.getByText(/let's tailor your return/i)).toBeVisible();

  await reachFilingStatus(page);
  await page.getByRole("radio", { name: /single/i }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/what types of income/i)).toBeVisible({ timeout: 5000 });

  await page.getByRole("checkbox", { name: /w-2 wages/i }).check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText(/did any of these happen/i)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText(/what state did you live in/i)).toBeVisible();
  await page.getByRole("button", { name: /start my return/i }).click();

  await expect(page.getByText(/let's start with the basics/i)).toBeVisible({ timeout: 5000 });
  await page.getByRole("combobox", { name: "Tax year for this interview", exact: true }).selectOption("2025");
}

/** Create a new return and complete segmentation. */
async function createReturn(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+/i);
  await completeSegmentation(page);
}

/** Skip a section by clicking Continue and then Skip if prompted. */
async function skipSection(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Continue" }).click();
  const skipBtn = page.getByRole("button", { name: /skip this section/i });
  if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await skipBtn.click();
  }
}

/** Navigate from personal info section to the deductions section. */
async function navigateToDeductions(page: import("@playwright/test").Page) {
  // Skip personal info
  await skipSection(page);
  // Skip W-2 income
  await skipSection(page);
  // Should now be on deductions section
  await expect(page.getByText(/standard or itemized deduction/i)).toBeVisible({ timeout: 5000 });
}

/** Navigate past deductions to the credits section. */
async function navigateToCredits(page: import("@playwright/test").Page) {
  await navigateToDeductions(page);
  // Advance past deductions (skip prompt will appear since no data entered)
  await skipSection(page);
  // Credits section should appear
  await expect(page.getByText(/credits reduce your tax dollar-for-dollar/i)).toBeVisible({ timeout: 5000 });
}

/** Actual fictional cash-gift record; these are test facts, never UI defaults. */
async function addCashDonation(page: Page) {
  await page.getByRole("button", { name: "Add donation", exact: true }).click();
  await page.getByLabel("Donation recipient", { exact: true }).fill("Synthetic Public Charity");
  await page.getByRole("combobox", { name: "Donation type", exact: true }).selectOption("cash");
  await page.getByLabel("Donation date", { exact: true }).fill("2025-06-01");
  for (const [name, value] of [
    ["Recipient is a private foundation / second-category organization", "false"],
    ["Recipient qualifies under section 170(b)(1)(A) for the 2026 nonitemizer deduction", "true"],
    ["Recipient is a supporting organization", "false"],
    ["Gift was to a donor-advised fund", "false"],
  ]) await page.getByRole("combobox", { name, exact: true }).selectOption(value);
  return page.getByRole("textbox", { name: /^Donation amount \/ fair market value/ });
}

async function addSolarProperty(page: Page) {
  await page.getByRole("button", { name: "Add clean-energy property", exact: false }).click();
  await page.getByRole("combobox", { name: "Clean-energy category", exact: true }).selectOption("solar_electric");
  return page.getByRole("textbox", { name: "Net qualified clean-energy cost", exact: true });
}

// Spec: spec/federal/guided-mortgage-worksheet.yaml, full-return/source-conservation.
test("actual mortgage worksheet survives entry correction and reopening", async ({ page }) => {
  const sourceInput = (name: string) => page.locator("label").filter({ has: page.getByText(name, { exact: true }) }).locator("input");
  await createReturn(page);
  await fillRequiredTaxpayerFacts(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("textbox", { name: /^Box 1 — Wages/ }).fill("100000");
  await fillRequiredW2Facts(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("radio", { name: /^itemize deductions/i }).click();
  await page.getByRole("button", { name: "Add mortgage", exact: true }).click();
  for (const [name, value] of [
    ["Mortgage lender", "Synthetic home lender"], ["Home mortgage interest", "40000.10"], ["Outstanding mortgage principal (Box 2)", "900000"],
    ["Mortgage origination date (Box 3)", "2020-06-15"], ["Mortgage statement tax year", "2025"],
    ["Loan account reference (last four digits or local statement label)", "synthetic-home-loan"], ["Address or description of the home securing the loan", "123 Example St, Austin TX"],
    ["Maximum actual loan balance at any time during the tax year", "1000000"], ["Annual balance history or lender-average source reference", "synthetic-annual-balance-record"],
    ["Actual Box 1 interest paid by taxpayers on this return", "30000.10"], ["Actual Box 1 interest paid by other returns", "10000"],
    ["Interest from this return's share deducted on another schedule", "0"], ["Refund of this year's interest paid by this return", "0"],
    ["Other ineligible interest in this return's paid share", "0"], ["Box 6 points allocable to this return, including qualifying seller-paid points", "0"],
    ["Box 6 points allocable to another return", "0"], ["Service fees or other noninterest amounts in this return's points share", "0"],
    ["Prior-year interest refund (Box 4)", "0"], ["Mortgage insurance premiums reported (Box 5)", "0"], ["Purchase points reported (Box 6)", "0"],
    ["Qualified real estate taxes actually disbursed by this mortgage account", "0"],
  ] as const) await sourceInput(name).fill(value);
  for (const [name, value] of [
    ["Borrowers whose payments this return claims", "primary"], ["Actual home use", "main-home"], ["Actual loan type", "original"], ["Actual use of all loan proceeds", "acquisition"],
    ["Balance method for the home-debt worksheet", "highest_balance"], ["Actual points deduction method", "none"], ["Is the debt legally secured by this qualified home?", "true"],
    ["Do the borrowers claiming the deduction have an ownership interest in this home?", "true"], ["Do borrower and lender intend and require repayment?", "true"],
    ["Was the claimed interest share actually paid by taxpayers on this return?", "true"], ["Does the interest exclude prepaid amounts allocable to a later year?", "true"],
    ["Was any part of this home or debt used for rental or business purposes?", "false"], ["Do you have a mortgage credit certificate for this loan?", "false"],
    ["Do cooperative, construction, ground-rent, changing-home or other special mortgage rules apply?", "false"],
  ] as const) await page.getByRole("combobox", { name, exact: true }).selectOption(value);
  const confirmLoan = page.getByRole("combobox", { name: "Have you checked all mortgage source and qualification facts after the last edit?", exact: true });
  const confirmWorksheet = page.getByRole("combobox", { name: "Have you confirmed the complete annual home-debt worksheet after the last change?", exact: true });
  await confirmLoan.selectOption("true");
  await page.getByLabel("Home-debt worksheet tax year", { exact: true }).fill("2025");
  await page.getByLabel("Annual home-debt record reference", { exact: true }).fill("synthetic-complete-debt-records");
  await page.getByRole("combobox", { name: "Are all debts on the main and selected second home included?", exact: true }).selectOption("true");
  await page.getByRole("combobox", { name: "Did you receive a refund or recovery of mortgage interest deducted in an earlier year?", exact: true }).selectOption("false");
  const hero = page.locator(".guided-ticker-value-hero").first();
  await expect(hero).toHaveText("Enter more info for an estimate");
  await confirmWorksheet.selectOption("true");
  await expect(hero).not.toHaveText("Enter more info for an estimate");
  await page.getByRole("button", { name: "Expand Ticker", exact: true }).click();
  await page.locator(".guided-ticker-clickable").first().focus();
  await page.keyboard.press("Enter");
  const taxable = page.locator(".guided-ticker-breakdown-row").filter({ hasText: "Taxable Income" });
  // Pub936 Table1: $750,000/$1,000,000=.750; $30,000.10*.750 rounds to $22,500.
  await expect(taxable).toContainText("$77,500");
  await page.getByRole("combobox", { name: "Balance method for the home-debt worksheet", exact: true }).selectOption("lender_average");
  await sourceInput("Actual lender-provided annual average loan balance").fill("600000");
  await expect(confirmLoan).toHaveValue(""); await expect(confirmWorksheet).toHaveValue("");
  await expect(hero).toHaveText("Enter more info for an estimate");
  await confirmLoan.selectOption("true"); await confirmWorksheet.selectOption("true");
  // Actual average below the debt cap allows this return's $30,000 rounded share.
  await expect(taxable).toContainText("$70,000");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Balance method for the home-debt worksheet", exact: true })).toHaveValue("lender_average");
  await expect(sourceInput("Actual lender-provided annual average loan balance")).toHaveValue("600000");
  await expect(confirmWorksheet).toHaveValue("true");
  await expect(hero).not.toHaveText("Enter more info for an estimate");
});

test.describe("Deductions section — layout and defaults", () => {
  test.beforeEach(async ({ page }) => {
    await createReturn(page);
    await navigateToDeductions(page);
  });

  test("deductions section renders with prompt and hint text", async ({ page }) => {
    await expect(page.getByText(/standard or itemized deduction/i)).toBeVisible();
    await expect(page.getByText(/most filers take the standard deduction/i)).toBeVisible();
  });

  test("standard deduction callout shows amount for Single filing status", async ({ page }) => {
    // Single filer should see the standard deduction amount callout
    await expect(page.getByText(/base standard deduction before/i)).toBeVisible();
    // The amount should be a formatted USD value (e.g. "$15,000" or similar)
    await expect(page.locator(".guided-deduction-standard-callout")).toBeVisible();
  });

  test("deduction method radiogroup has standard and itemized options", async ({ page }) => {
    const radiogroup = page.getByRole("radiogroup", { name: /deduction method/i });
    await expect(radiogroup).toBeVisible();

    await expect(page.getByRole("radio", { name: /^standard deduction/i })).toBeVisible();
    await expect(page.getByRole("radio", { name: /^itemize deductions/i })).toBeVisible();
  });

  test("standard deduction is selected by default", async ({ page }) => {
    await expect(page.getByRole("radio", { name: /^standard deduction/i })).toBeChecked();
    await expect(page.getByRole("radio", { name: /^itemize deductions/i })).not.toBeChecked();
  });

  test("standard deduction radio shows filing-status-based amount in label", async ({ page }) => {
    const standardRadioLabel = page.locator(".guided-option-card").filter({ hasText: /standard deduction/i });
    // Should include a dollar amount in the label (e.g. "$15,000")
    await expect(standardRadioLabel.getByText(/\$/)).toBeVisible();
    await expect(standardRadioLabel.getByText(/no receipts needed/i)).toBeVisible();
  });

  test("itemize deductions radio shows Schedule A description", async ({ page }) => {
    const itemizedLabel = page.locator(".guided-option-card").filter({ hasText: /itemize deductions/i });
    await expect(itemizedLabel.getByText(/schedule a/i)).toBeVisible();
  });

  test("Schedule A fields are NOT shown when standard deduction is selected", async ({ page }) => {
    // Standard is selected by default — Schedule A should not be visible
    await expect(page.getByText(/schedule a.*itemized deductions/i)).not.toBeVisible();
    await expect(page.getByRole("textbox", { name: /^Medical and dental expenses/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add mortgage", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add donation", exact: true })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: /^Gambling winnings not already reported/ })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /^Non-W-2 withholding already deducted/ })).toBeVisible();
  });
});

test.describe("Deductions section — itemized deductions", () => {
  test.beforeEach(async ({ page }) => {
    await createReturn(page);
    await navigateToDeductions(page);
  });

  test("selecting Itemize shows Schedule A card with expense fields", async ({ page }) => {
    await page.getByRole("radio", { name: /^itemize deductions/i }).click();

    await expect(page.getByText(/schedule a.*itemized deductions/i)).toBeVisible();

    // Common deduction fields should be visible
    await expect(page.getByText(/medical and dental expenses/i)).toBeVisible();
    await expect(page.getByText(/state and local income taxes/i)).toBeVisible();
    await expect(page.getByRole("textbox", { name: /^Real estate taxes/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mortgage interest — Form 1098", exact: true })).toBeVisible();
    await expect(page.getByText(/charitable contributions/i)).toBeVisible();
  });

  test("itemized deduction fields have helpful hints", async ({ page }) => {
    await page.getByRole("radio", { name: /^itemize deductions/i }).click();

    await expect(page.getByText(/7\.5% of your agi/i)).toBeVisible();
    await expect(page.getByText(/excluding withholding and estimates already entered elsewhere/i)).toBeVisible();
    await expect(page.getByText(/copy each lender's actual amounts and origination date/i)).toBeVisible();
    await page.getByRole("button", { name: "Add donation", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Donation type", exact: true })).toHaveValue("");
    await expect(page.getByLabel("Donation date", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Donation recipient", { exact: true })).toHaveValue("");
  });

  test("Less common deductions expand to show additional fields", async ({ page }) => {
    await page.getByRole("radio", { name: /^itemize deductions/i }).click();

    // Less common deductions should be collapsed initially
    await expect(page.getByText(/casualty and theft losses/i)).not.toBeVisible();

    // Expand the section
    await page.locator("summary").filter({ hasText: /less common itemized deductions/i }).click();

    // Additional fields should now be visible
    await expect(page.getByText(/casualty and theft losses/i)).toBeVisible();
    await expect(page.getByRole("textbox", { name: /^Investment interest expense/ })).toBeVisible();
    await expect(page.getByText(/specific Form 4684 event, property and reimbursement facts/i)).toBeVisible();
    await expect(page.getByRole("textbox", { name: /^Wagering losses/ })).toBeVisible();
  });

  test("entering itemized amounts shows comparison display", async ({ page }) => {
    await page.getByRole("radio", { name: /^itemize deductions/i }).click();

    // Enter a charitable contribution
    const charityInput = await addCashDonation(page);
    await charityInput.fill("5000");
    await charityInput.blur();

    // Comparison display should appear with the itemized total
    await expect(page.locator(".guided-deduction-comparison")).toBeVisible();
    await expect(page.getByText(/expenses entered/i)).toBeVisible();
    await expect(page.getByText(/standard deduction/i).last()).toBeVisible();
  });

  test("raw expenses do not claim a tax-saving recommendation", async ({ page }) => {
    await page.getByRole("radio", { name: /^itemize deductions/i }).click();

    // Enter a small amount (well below standard deduction)
    const charityInput = await addCashDonation(page);
    await charityInput.fill("500");
    await charityInput.blur();

    await expect(page.getByText(/expenses entered/i)).toBeVisible();
    await expect(page.getByText(/you may want to switch back to standard/i)).toHaveCount(0);
  });

  test("switching back to standard hides Schedule A fields", async ({ page }) => {
    // Switch to itemized
    await page.getByRole("radio", { name: /^itemize deductions/i }).click();
    await expect(page.getByText(/schedule a.*itemized deductions/i)).toBeVisible();

    // Switch back to standard
    await page.getByRole("radio", { name: /^standard deduction/i }).click();

    // Schedule A should be hidden again
    await expect(page.getByText(/schedule a.*itemized deductions/i)).not.toBeVisible();
  });

  test("currency fields in Schedule A format values correctly", async ({ page }) => {
    await page.getByRole("radio", { name: /^itemize deductions/i }).click();
    await page.getByRole("button", { name: "Add mortgage", exact: true }).click();

    const mortgageInput = page.locator("label").filter({ hasText: /home mortgage interest/i }).locator("input.guided-input-currency");
    await mortgageInput.fill("12500");
    await mortgageInput.blur();

    await expect(mortgageInput).toHaveValue("12,500");
  });

  test("multiple itemized deduction fields contribute to total", async ({ page }) => {
    await page.getByRole("radio", { name: /^itemize deductions/i }).click();

    // Enter state taxes
    const stateTaxInput = page.locator("label").filter({ hasText: /state and local income taxes/i }).locator("input.guided-input-currency");
    await stateTaxInput.fill("10000");
    await stateTaxInput.blur();

    // Enter mortgage interest
    await page.getByRole("button", { name: "Add mortgage", exact: true }).click();
    const mortgageInput = page.locator("label").filter({ hasText: /home mortgage interest/i }).locator("input.guided-input-currency");
    await mortgageInput.fill("8000");
    await mortgageInput.blur();

    // Enter charity
    const charityInput = await addCashDonation(page);
    await charityInput.fill("3000");
    await charityInput.blur();

    // Comparison should show the itemized total (should be $21,000)
    await expect(page.locator(".guided-deduction-comparison")).toBeVisible();
    await expect(page.getByText(/\$21,000/)).toBeVisible();
  });
});

test.describe("Deductions section — MFJ filing status", () => {
  test("MFJ filer sees higher standard deduction amount", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /start your tax return/i }).click();
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+/i);

    // Complete segmentation with MFJ
    await expect(page.getByText(/let's tailor your return/i)).toBeVisible();
    await reachFilingStatus(page);
    await page.getByRole("radio", { name: /married filing jointly/i }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/what types of income/i)).toBeVisible({ timeout: 5000 });

    await page.getByRole("checkbox", { name: /w-2 wages/i }).check();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText(/did any of these happen/i)).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText(/what state did you live in/i)).toBeVisible();
    await page.getByRole("button", { name: /start my return/i }).click();

    await expect(page.getByText(/let's start with the basics/i)).toBeVisible({ timeout: 5000 });
  await page.getByRole("combobox", { name: "Tax year for this interview", exact: true }).selectOption("2025");

    // Navigate to deductions
    await skipSection(page);
    await skipSection(page);

    await expect(page.getByText(/standard or itemized deduction/i)).toBeVisible({ timeout: 5000 });

    // MFJ standard deduction should be displayed (higher than Single)
    await expect(page.getByText(/base standard deduction before/i)).toBeVisible();

    // The standard deduction radio label should show the MFJ amount
    const standardRadioLabel = page.locator(".guided-option-card").filter({ hasText: /standard deduction/i });
    await expect(standardRadioLabel.getByText(/\$/)).toBeVisible();
  });
});

test.describe("Deductions — data persistence", () => {
  test("itemized deduction data persists after navigating away and back", async ({ page }) => {
    await createReturn(page);
    await navigateToDeductions(page);

    // Switch to itemized and enter data
    await page.getByRole("radio", { name: /^itemize deductions/i }).click();

    const charityInput = await addCashDonation(page);
    await charityInput.fill("7500");
    await charityInput.blur();

    // Navigate forward (to credits)
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/credits reduce your tax dollar-for-dollar/i)).toBeVisible({ timeout: 5000 });

    // Navigate back to deductions
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByText(/standard or itemized deduction/i)).toBeVisible({ timeout: 5000 });

    // Itemized should still be selected
    await expect(page.getByRole("radio", { name: /^itemize deductions/i })).toBeChecked();

    // Charity data should persist
    const restoredCharityInput = page.getByRole("textbox", { name: /^Donation amount \/ fair market value/ });
    await expect(restoredCharityInput).toHaveValue("7,500");
    await expect(page.getByLabel("Donation date", { exact: true })).toHaveValue("2025-06-01");
    await expect(page.getByLabel("Donation recipient", { exact: true })).toHaveValue("Synthetic Public Charity");
  });
});

test.describe("Credits section — layout and subsections", () => {
  test.beforeEach(async ({ page }) => {
    await createReturn(page);
    await navigateToCredits(page);
  });

  test("credits section renders with prompt and explanation", async ({ page }) => {
    await expect(page.getByText(/credits reduce your tax dollar-for-dollar/i)).toBeVisible();
    await expect(page.getByText(/unlike deductions.*credits directly reduce/i)).toBeVisible();
    await expect(page.getByText(/child tax credit and earned income credit are computed automatically/i)).toBeVisible();
  });

  test("dependent care credit subsection renders with fields", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Child and Dependent Care Credit (Form 2441)", exact: true })).toBeVisible();
    await expect(page.getByText(/total care expenses paid/i)).toBeVisible();
    await expect(page.getByText(/qualifying individuals/i)).toBeVisible();
  });

  test("dependent care expenses field accepts currency input", async ({ page }) => {
    const expensesInput = page.locator("label").filter({ hasText: /total care expenses paid/i }).locator("input.guided-input-currency");
    await expensesInput.fill("6000");
    await expensesInput.blur();

    await expect(expensesInput).toHaveValue("6,000");
  });

  test("qualifying individuals remain unknown until an actual count is entered", async ({ page }) => {
    const count = page.getByRole("spinbutton", { name: /qualifying individuals/i });
    await expect(count).toHaveValue("");
    await expect(count).toHaveAttribute("min", "1");
    await expect(count).toHaveAttribute("step", "1");
    await count.fill("1");
    await expect(count).toHaveValue("1");
    await count.fill("2");
    await expect(count).toHaveValue("2");
    await count.fill("");
    await expect(count).toHaveValue("");
  });

  test("education credits subsection renders with add student button", async ({ page }) => {
    await expect(page.getByText(/education credits/i).first()).toBeVisible();
    await expect(page.getByText(/form 8863/i)).toBeVisible();
    await expect(page.getByText(/american opportunity credit/i).first()).toBeVisible();

    // No students by default — "Add a student" button should be visible
    await expect(page.getByRole("button", { name: /^add AOTC student$/i })).toBeVisible();

    // Add a student to see the card
    await page.getByRole("button", { name: /^add AOTC student$/i }).click();
    await expect(page.getByText(/^AOTC student 1$/i)).toBeVisible();
    await expect(page.getByText(/student name/i)).toBeVisible();
    await expect(page.getByText(/qualified tuition & expenses/i)).toBeVisible();
    await expect(page.getByText(/prior years aotc was claimed/i)).toBeVisible();
  });

  test("can add and remove education student cards", async ({ page }) => {
    // Add first student
    await page.getByRole("button", { name: /^add AOTC student$/i }).click();
    await expect(page.getByText(/^AOTC student 1$/i)).toBeVisible();

    // Add a second student
    await page.getByRole("button", { name: /^add AOTC student$/i }).click();
    await expect(page.getByText(/^AOTC student 2$/i)).toBeVisible();

    await page.getByRole("button", { name: /^remove AOTC student 2$/i }).click();
    await expect(page.getByText(/^AOTC student 2$/i)).not.toBeVisible();

    // Student #1 should still be present
    await expect(page.getByText(/^AOTC student 1$/i)).toBeVisible();
  });

  test("energy credits subsection renders with solar fields", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Residential Energy Credits (Form 5695)", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /add clean-energy property/i }).click();
    const category = page.getByRole("combobox", { name: "Clean-energy category", exact: true });
    await expect(category).toHaveValue("");
    await expect(category.getByRole("option", { name: "Solar electric property", exact: true })).toBeAttached();
    await expect(category.getByRole("option", { name: "Solar water heating", exact: true })).toBeAttached();
    await expect(page.getByLabel("Clean-energy installation completion date", { exact: true })).toHaveValue("");
  });

  test("energy improvements require individual qualified property categories", async ({ page }) => {
    await expect(page.getByRole("combobox", { name: "Improvement category", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: /add improvement/i }).click();
    const category = page.getByRole("combobox", { name: "Improvement category", exact: true });
    await expect(category).toHaveValue("");
    for (const name of ["Insulation and air sealing", "One exterior door", "Windows and skylights", "Central air conditioner", "Heat-pump water heater"])
      await expect(category.getByRole("option", { name, exact: true })).toBeAttached();
    await expect(category.getByRole("option", { name: /roof/i })).toHaveCount(0);
    await expect(page.getByLabel("Improvement installation completion date", { exact: true })).toHaveValue("");
  });

  test("Lifetime Learning Credit collects each student's expenses and course eligibility", async ({ page }) => {
    await expect(page.getByRole("group", { name: "LLC student 1", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Add LLC student", exact: true }).click();
    const student = page.getByRole("group", { name: "LLC student 1", exact: true });
    await expect(student.getByRole("textbox", { name: /^Qualified tuition & expenses/ })).toHaveValue("");
    await expect(student.getByRole("textbox", { name: "Student name", exact: true })).toHaveValue("");
    await expect(student.getByRole("combobox", { name: "Are these postsecondary courses or courses to acquire or improve job skills?", exact: true })).toHaveValue("");
  });
});

test.describe("Credits — student card interactions", () => {
  test.beforeEach(async ({ page }) => {
    await createReturn(page);
    await navigateToCredits(page);
    // Add the first student (starts with empty array)
    await page.getByRole("button", { name: /^add AOTC student$/i }).click();
    await expect(page.getByText(/^AOTC student 1$/i)).toBeVisible();
  });

  test("student name and expenses can be filled in", async ({ page }) => {
    // Fill student name (first "Student name" textbox)
    const nameInput = page.getByRole("textbox", { name: "Student name" }).first();
    await nameInput.fill("Jane Smith");
    await expect(nameInput).toHaveValue("Jane Smith");

    // Fill qualified expenses
    const expensesInput = page.getByRole("textbox", { name: /qualified tuition/i }).first();
    await expensesInput.fill("4000");
    await expensesInput.blur();
    await expect(expensesInput).toHaveValue("4,000");
  });

  test("prior years AOTC dropdown has correct options", async ({ page }) => {
    const studentCard = page.getByRole("group", { name: "AOTC student 1", exact: true });
    const select = studentCard.getByRole("combobox", { name: "Prior years AOTC was claimed", exact: true });

    await expect(select).toHaveValue("");
    await expect(select.locator("option")).toHaveCount(6);
    await expect(select.getByRole("option", { name: "Confirm actual claim history", exact: true })).toBeAttached();
    for (const name of ["0", "1", "2", "3", "4 or more"])
      await expect(select.getByRole("option", { name, exact: true })).toBeAttached();
    await select.selectOption("0");
    await expect(select).toHaveValue("0");
  });

  test("the only student can be removed without inventing replacement facts", async ({ page }) => {
    const studentCard = page.getByRole("group", { name: "AOTC student 1", exact: true });
    await studentCard.getByRole("button", { name: "Remove AOTC student 1", exact: true }).click();
    await expect(studentCard).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Student name", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add AOTC student", exact: true })).toBeVisible();
  });

  test("adding multiple students shows correct numbering", async ({ page }) => {
    // Student #1 already added in beforeEach
    await page.getByRole("button", { name: /^add AOTC student$/i }).click();
    await expect(page.getByText(/^AOTC student 2$/i)).toBeVisible();

    await page.getByRole("button", { name: /^add AOTC student$/i }).click();
    await expect(page.getByText(/^AOTC student 3$/i)).toBeVisible();

    // All three should be visible
    await expect(page.getByText(/^AOTC student 1$/i)).toBeVisible();
    await expect(page.getByText(/^AOTC student 2$/i)).toBeVisible();
    await expect(page.getByText(/^AOTC student 3$/i)).toBeVisible();
  });
});

test.describe("Credits — energy credit fields", () => {
  test("the first credit edit survives repeated section transitions", async ({ page }) => {
    await createReturn(page);
    await navigateToCredits(page);
    await addSolarProperty(page);
    for (const amount of ["25000", "26000", "27000"]) {
      await page.getByRole("button", { name: "Deductions", exact: true }).click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      const input = page.getByRole("textbox", { name: "Net qualified clean-energy cost", exact: true });
      await input.fill(amount);
      await expect(input).toHaveValue(amount);
      await input.blur();
      await expect(input).toHaveValue(`${amount.slice(0, 2)},000`);
    }
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Net qualified clean-energy cost", exact: true })).toHaveValue("27,000");
    await expect(page.getByRole("combobox", { name: "Clean-energy category", exact: true })).toHaveValue("solar_electric");
  });

  test("solar electric system field accepts and formats currency", async ({ page }) => {
    await createReturn(page);
    await navigateToCredits(page);

    const solarInput = await addSolarProperty(page);
    await solarInput.fill("25000");
    await solarInput.blur();

    await expect(solarInput).toHaveValue("25,000");
  });
});
