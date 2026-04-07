import { expect, test } from "@playwright/test";

/**
 * Deductions and Credits section tests.
 *
 * Covers the deductions section (standard vs. itemized, Schedule A fields,
 * comparison display) and the credits section (dependent care, education,
 * energy credits) in the guided interview.
 */

/** Complete segmentation with Single / W-2 wages / no events / no state. */
async function completeSegmentation(page: import("@playwright/test").Page) {
  await expect(page.getByText(/let's figure out your tax situation/i)).toBeVisible();

  await page.getByRole("radio", { name: /single/i }).click();
  await expect(page.getByText(/what types of income/i)).toBeVisible({ timeout: 5000 });

  await page.getByRole("checkbox", { name: /w-2 wages/i }).check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText(/did any of these happen/i)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText(/what state did you live in/i)).toBeVisible();
  await page.getByRole("button", { name: /start my return/i }).click();

  await expect(page.getByText(/let's start with the basics/i)).toBeVisible({ timeout: 5000 });
}

/** Create a new return and complete segmentation. */
async function createReturn(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+/i);
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
    await expect(page.getByText(/your standard deduction is/i)).toBeVisible();
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
    await expect(page.locator("input.guided-input-currency")).toHaveCount(0);
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
    await expect(page.getByText(/real estate taxes/i)).toBeVisible();
    await expect(page.getByText(/home mortgage interest/i)).toBeVisible();
    await expect(page.getByText(/charitable contributions/i)).toBeVisible();
  });

  test("itemized deduction fields have helpful hints", async ({ page }) => {
    await page.getByRole("radio", { name: /^itemize deductions/i }).click();

    await expect(page.getByText(/7\.5% of your agi/i)).toBeVisible();
    await expect(page.getByText(/w-2 box 17/i)).toBeVisible();
    await expect(page.getByText(/form 1098 box 1/i)).toBeVisible();
    await expect(page.getByText(/cash and non-cash donations/i)).toBeVisible();
  });

  test("Less common deductions expand to show additional fields", async ({ page }) => {
    await page.getByRole("radio", { name: /^itemize deductions/i }).click();

    // Less common deductions should be collapsed initially
    await expect(page.getByText(/casualty and theft losses/i)).not.toBeVisible();

    // Expand the section
    await page.locator("summary").filter({ hasText: /less common itemized deductions/i }).click();

    // Additional fields should now be visible
    await expect(page.getByText(/casualty and theft losses/i)).toBeVisible();
    await expect(page.getByText(/other itemized deductions/i)).toBeVisible();
    await expect(page.getByText(/federally declared disaster/i)).toBeVisible();
    await expect(page.getByText(/gambling losses/i)).toBeVisible();
  });

  test("entering itemized amounts shows comparison display", async ({ page }) => {
    await page.getByRole("radio", { name: /^itemize deductions/i }).click();

    // Enter a charitable contribution
    const charityInput = page.locator("label").filter({ hasText: /charitable contributions/i }).locator("input.guided-input-currency");
    await charityInput.fill("5000");
    await charityInput.blur();

    // Comparison display should appear with the itemized total
    await expect(page.locator(".guided-deduction-comparison")).toBeVisible();
    await expect(page.getByText(/itemized total/i)).toBeVisible();
    await expect(page.getByText(/standard deduction/i).last()).toBeVisible();
  });

  test("comparison recommends standard when itemized total is lower", async ({ page }) => {
    await page.getByRole("radio", { name: /^itemize deductions/i }).click();

    // Enter a small amount (well below standard deduction)
    const charityInput = page.locator("label").filter({ hasText: /charitable contributions/i }).locator("input.guided-input-currency");
    await charityInput.fill("500");
    await charityInput.blur();

    // Should recommend standard deduction
    await expect(page.getByText(/the standard deduction is .* higher/i)).toBeVisible();
    await expect(page.getByText(/you may want to switch back to standard/i)).toBeVisible();
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
    const mortgageInput = page.locator("label").filter({ hasText: /home mortgage interest/i }).locator("input.guided-input-currency");
    await mortgageInput.fill("8000");
    await mortgageInput.blur();

    // Enter charity
    const charityInput = page.locator("label").filter({ hasText: /charitable contributions/i }).locator("input.guided-input-currency");
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
    await expect(page).toHaveURL(/\/returns\/[a-z0-9-]+/i);

    // Complete segmentation with MFJ
    await expect(page.getByText(/let's figure out your tax situation/i)).toBeVisible();
    await page.getByRole("radio", { name: /married filing jointly/i }).click();
    await expect(page.getByText(/what types of income/i)).toBeVisible({ timeout: 5000 });

    await page.getByRole("checkbox", { name: /w-2 wages/i }).check();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText(/did any of these happen/i)).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText(/what state did you live in/i)).toBeVisible();
    await page.getByRole("button", { name: /start my return/i }).click();

    await expect(page.getByText(/let's start with the basics/i)).toBeVisible({ timeout: 5000 });

    // Navigate to deductions
    await skipSection(page);
    await skipSection(page);

    await expect(page.getByText(/standard or itemized deduction/i)).toBeVisible({ timeout: 5000 });

    // MFJ standard deduction should be displayed (higher than Single)
    await expect(page.getByText(/your standard deduction is/i)).toBeVisible();

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

    const charityInput = page.locator("label").filter({ hasText: /charitable contributions/i }).locator("input.guided-input-currency");
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
    const restoredCharityInput = page.locator("label").filter({ hasText: /charitable contributions/i }).locator("input.guided-input-currency");
    await expect(restoredCharityInput).toHaveValue("7,500");
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
    await expect(page.getByText(/child and dependent care credit/i)).toBeVisible();
    await expect(page.getByText(/form 2441/i)).toBeVisible();
    await expect(page.getByText(/total care expenses paid/i)).toBeVisible();
    await expect(page.getByText(/qualifying individuals/i)).toBeVisible();
  });

  test("dependent care expenses field accepts currency input", async ({ page }) => {
    const expensesInput = page.locator("label").filter({ hasText: /total care expenses paid/i }).locator("input.guided-input-currency");
    await expensesInput.fill("6000");
    await expensesInput.blur();

    await expect(expensesInput).toHaveValue("6,000");
  });

  test("qualifying individuals dropdown has correct options", async ({ page }) => {
    const select = page.getByRole("combobox", { name: /qualifying individuals/i });
    await expect(select).toBeVisible();

    // Should have "1" and "2 or more" options
    await expect(select.locator("option", { hasText: "1" })).toBeAttached();
    await expect(select.locator("option", { hasText: "2 or more" })).toBeAttached();
  });

  test("education credits subsection renders with add student button", async ({ page }) => {
    await expect(page.getByText(/education credits/i).first()).toBeVisible();
    await expect(page.getByText(/form 8863/i)).toBeVisible();
    await expect(page.getByText(/american opportunity credit/i).first()).toBeVisible();

    // No students by default — "Add a student" button should be visible
    await expect(page.getByRole("button", { name: /add a student/i })).toBeVisible();

    // Add a student to see the card
    await page.getByRole("button", { name: /add a student/i }).click();
    await expect(page.getByText(/student #1/i)).toBeVisible();
    await expect(page.getByText(/student name/i)).toBeVisible();
    await expect(page.getByText(/qualified tuition & expenses/i)).toBeVisible();
    await expect(page.getByText(/prior years aotc was claimed/i)).toBeVisible();
  });

  test("can add and remove education student cards", async ({ page }) => {
    // Add first student
    await page.getByRole("button", { name: /add a student/i }).click();
    await expect(page.getByText(/student #1/i)).toBeVisible();

    // Add a second student
    await page.getByRole("button", { name: /add a student/i }).click();
    await expect(page.getByText(/student #2/i)).toBeVisible();

    // Each student card header has the Remove button next to the title
    // Get all Remove buttons in the education section
    const removeButtons = page.getByRole("button", { name: /^remove$/i });
    // The second Remove button corresponds to Student #2
    await removeButtons.nth(1).click();
    await expect(page.getByText(/student #2/i)).not.toBeVisible();

    // Student #1 should still be present
    await expect(page.getByText(/student #1/i)).toBeVisible();
  });

  test("energy credits subsection renders with solar fields", async ({ page }) => {
    await expect(page.getByText(/residential energy credits/i)).toBeVisible();
    await expect(page.getByText(/form 5695/i)).toBeVisible();
    await expect(page.getByText(/solar electric system/i)).toBeVisible();
    await expect(page.getByText(/solar water heating/i)).toBeVisible();
  });

  test("energy home efficiency section expands to show additional fields", async ({ page }) => {
    // Home efficiency details should be collapsed
    await expect(page.getByText(/insulation & air sealing/i)).not.toBeVisible();

    // Expand
    await page.locator("summary").filter({ hasText: /home efficiency improvements/i }).click();

    // Additional fields should be visible
    await expect(page.getByText(/insulation & air sealing/i)).toBeVisible();
    await expect(page.getByText(/exterior doors & windows/i)).toBeVisible();
    await expect(page.getByText(/roofing/i)).toBeVisible();
    await expect(page.getByText(/energy-efficient hvac/i)).toBeVisible();
    await expect(page.getByText("Water heater / heat pump")).toBeVisible();
  });

  test("Lifetime Learning Credit expands to show expense field", async ({ page }) => {
    // LLC section should be collapsed
    await expect(page.getByText(/lifetime learning credit expenses/i)).not.toBeVisible();

    // Expand
    await page.locator("summary").filter({ hasText: /lifetime learning credit/i }).click();

    // LLC expense field should be visible
    await expect(page.getByText(/lifetime learning credit expenses/i)).toBeVisible();
    await expect(page.getByText(/graduate school, professional courses/i)).toBeVisible();
  });
});

test.describe("Credits — student card interactions", () => {
  test.beforeEach(async ({ page }) => {
    await createReturn(page);
    await navigateToCredits(page);
    // Add the first student (starts with empty array)
    await page.getByRole("button", { name: /add a student/i }).click();
    await expect(page.getByText(/student #1/i)).toBeVisible();
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
    const studentCard = page.locator(".guided-w2-card").filter({ hasText: /student #1/i });
    const select = studentCard.locator("select");

    // Check all options exist
    await expect(select.locator("option")).toHaveCount(5);
    await expect(select.locator("option", { hasText: /0.*first year/i })).toBeAttached();
    await expect(select.locator("option", { hasText: /4\+.*no longer eligible/i })).toBeAttached();
  });

  test("single student card has no remove button", async ({ page }) => {
    const studentCard = page.locator(".guided-w2-card").filter({ hasText: /student #1/i });

    // With only one student, remove button should not be visible
    await expect(studentCard.getByRole("button", { name: /remove/i })).not.toBeVisible();
  });

  test("adding multiple students shows correct numbering", async ({ page }) => {
    // Student #1 already added in beforeEach
    await page.getByRole("button", { name: /add a student/i }).click();
    await expect(page.getByText(/student #2/i)).toBeVisible();

    await page.getByRole("button", { name: /add a student/i }).click();
    await expect(page.getByText(/student #3/i)).toBeVisible();

    // All three should be visible
    await expect(page.getByText(/student #1/i)).toBeVisible();
    await expect(page.getByText(/student #2/i)).toBeVisible();
    await expect(page.getByText(/student #3/i)).toBeVisible();
  });
});

test.describe("Credits — energy credit fields", () => {
  test("solar electric system field accepts and formats currency", async ({ page }) => {
    await createReturn(page);
    await navigateToCredits(page);

    const solarInput = page.locator("label").filter({ hasText: /solar electric system/i }).locator("input.guided-input-currency");
    await solarInput.fill("25000");
    await solarInput.blur();

    await expect(solarInput).toHaveValue("25,000");
  });
});
