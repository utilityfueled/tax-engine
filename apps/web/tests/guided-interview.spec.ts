import { fillRequiredW2Facts, fillRequiredTaxpayerFacts, reachFilingStatus, taxpayerFacts2025 } from "./guided-fixtures";
import { copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const sampleDocsDir = path.resolve(testDir, "../../../sample-documents/downloads");
const futureYearSampleMessage = /2026 form w-2 \(official info-copy pdf\) is an official sample document for tax year 2026, so it can't drive a 2025 return yet\. upload a 2025 tax document instead\./i;

/**
 * Guided interview e2e tests.
 *
 * The workspace starts in guided mode (guidedMode=true). The segmentation
 * screen is the first thing the user sees.
 */

function getWorkspaceIdFromUrl(url: string) {
  return new URL(url).pathname.split("/").at(-1) ?? "";
}

test.describe("Guided interview flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/returns/new");
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
  });

  test("segmentation screen renders with all five steps", async ({ page }) => {
    // The guided interview shell should show the segmentation screen
    await expect(page.getByText(/let's tailor your return/i)).toBeVisible();
    await expect(page.getByText(/filing status/i).first()).toBeVisible();
    await expect(page.getByText("STEP 1 OF 5", { exact: true })).toBeVisible();

    await expect(page.getByText("Upload your tax documents.", { exact: true })).toBeVisible();
    await reachFilingStatus(page);

    // Filing status options should be present
    await expect(page.getByText("Single")).toBeVisible();
    await expect(page.getByText("Married Filing Jointly")).toBeVisible();
    await expect(page.getByText("Head of Household")).toBeVisible();
  });

  test("segmentation requires filing status before continuing", async ({ page }) => {
    await expect(page.getByText(/let's tailor your return/i)).toBeVisible();

    // Continue button should be disabled when no filing status is selected
    await reachFilingStatus(page);
    const continueBtn = page.getByRole("button", { name: "Continue" });
    await expect(continueBtn).toBeDisabled();

    // Selecting a filing status should enable Continue without auto-advancing
    await reachFilingStatus(page);
    await page.getByRole("radio", { name: /single/i }).click();
    await expect(continueBtn).toBeEnabled();
    await expect(page.getByText(/what's your filing status/i)).toBeVisible();
    await expect(page.getByText(/what types of income/i)).toHaveCount(0);
  });

  test("mobile setup keeps the help launcher out of the filing-status choices", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: /let's tailor your return/i })).toBeVisible();

    await reachFilingStatus(page);

    const helpButton = page.getByRole("button", { name: /need help\?/i });
    const firstChoice = page.locator(".guided-option-card").first();

    await expect(helpButton).toBeVisible();
    await expect(firstChoice).toBeVisible();

    const helpBox = await helpButton.boundingBox();
    const firstChoiceBox = await firstChoice.boundingBox();

    expect(helpBox).not.toBeNull();
    expect(firstChoiceBox).not.toBeNull();

    const overlaps = !(
      (helpBox!.x + helpBox!.width) <= firstChoiceBox!.x
      || (firstChoiceBox!.x + firstChoiceBox!.width) <= helpBox!.x
      || (helpBox!.y + helpBox!.height) <= firstChoiceBox!.y
      || (firstChoiceBox!.y + firstChoiceBox!.height) <= helpBox!.y
    );

    expect(overlaps).toBe(false);
  });

  test("persisted W-2 fixture suggestions still render as sample data after reload", async ({ page }) => {
    const workspaceId = getWorkspaceIdFromUrl(page.url());

    await page.evaluate((savedState) => {
      window.localStorage.setItem(`tax-engine.guided-flow-state.v1:${savedState.workspaceId}`, JSON.stringify(savedState.state));
    }, {
      workspaceId,
      state: {
      phase: "interview",
      segmentation: {
        filingStatus: "single",
        incomeTypes: ["w2-wages"],
        lifeEvents: [],
        stateCode: null,
      },
      currentSectionIndex: 1,
      completedSections: ["personal-info"],
      sectionData: {
        "income-w2": {
          entries: [
            {
              employerName: "Official fixture employer",
              employerEin: "12-3456789",
              wages: "52000",
              federalWithheld: "5000",
              socialSecurityWages: "",
              socialSecurityWithheld: "",
              medicareWages: "",
              medicareWithheld: "",
              stateWages: "",
              stateWithheld: "",
              aiSuggestedFields: {
                employerName: {
                  sourceLabel: "2026 Form W-2 (official info-copy PDF)",
                  sourceType: "official-fixture",
                  status: "pending-confirmation",
                },
                employerEin: {
                  sourceLabel: "2026 Form W-2 (official info-copy PDF)",
                  sourceType: "official-fixture",
                  status: "pending-confirmation",
                },
                wages: {
                  sourceLabel: "2026 Form W-2 (official info-copy PDF)",
                  sourceType: "official-fixture",
                  status: "pending-confirmation",
                },
                federalWithheld: {
                  sourceLabel: "2026 Form W-2 (official info-copy PDF)",
                  sourceType: "official-fixture",
                  status: "pending-confirmation",
                },
              },
            },
          ],
        },
      },
      },
    });

    await page.reload();

    await expect(page.getByText(/sample values from 2026 form w-2 \(official info-copy pdf\)\./i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /no w-2 suggestions yet/i })).toBeDisabled();
    await expect(page.getByRole("button", { name: /confirm value/i })).toHaveCount(4);
  });

  test("confirmed sample W-2 values dismiss the blocking review prompt", async ({ page }) => {
    const workspaceId = getWorkspaceIdFromUrl(page.url());

    await seedPendingGuidedW2State(page, workspaceId);
    await page.reload();

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/confirm the highlighted sample values before continuing/i)).toBeVisible();

    await page.getByRole("button", { name: /confirm all \d+ highlighted sample values/i }).click();
    await fillRequiredW2Facts(page);

    await expect(page.getByText(/confirm the highlighted sample values before continuing/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /review highlighted values/i })).toHaveCount(0);

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: /deductions/i })).toBeVisible();
  });

  test("new returns do not inherit guided progress from a different return", async ({ page }) => {
    await reachFilingStatus(page);
    await page.getByRole("radio", { name: /single/i }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/what types of income/i)).toBeVisible();
    await page.getByRole("checkbox", { name: /w-2 wages/i }).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /start my return/i }).click();
    await expect(page.getByRole("heading", { name: /about you/i })).toBeVisible();

    const firstWorkspaceId = getWorkspaceIdFromUrl(page.url());
    await page.goto("/returns/new");

    const secondWorkspaceId = getWorkspaceIdFromUrl(page.url());
    expect(secondWorkspaceId).not.toBe(firstWorkspaceId);
    await expect(page.getByRole("heading", { name: /let's tailor your return/i })).toBeVisible();
    await expect(page.getByText("STEP 1 OF 5", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /about you/i })).toHaveCount(0);

    await page.goto(`/returns/${firstWorkspaceId}`);
    await expect(page.getByRole("heading", { name: /about you/i })).toBeVisible();
  });

  test("full segmentation flow advances through all five steps", async ({ page }) => {
    await expect(page.getByText(/let's tailor your return/i)).toBeVisible();

    // Step 1: Filing status — select Single
    await reachFilingStatus(page);
    await page.getByRole("radio", { name: /single/i }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/what types of income/i)).toBeVisible();

    // Step 2: Income types — check W-2 wages
    await page.getByRole("checkbox", { name: /w-2 wages/i }).check();
    // Click Continue to advance
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 3: Life events — skip (click Continue)
    await expect(page.getByText(/did any of these happen/i)).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 4: State of residence — skip for now remains the default value
    await expect(page.getByText(/what state did you live in/i)).toBeVisible();
    await expect(page.getByRole("combobox", { name: /state of residence/i })).toHaveValue("");
    await page.getByRole("button", { name: /start my return/i }).click();

    // Should advance to interview phase — personal info section
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible({ timeout: 5000 });
  });

  test("w-2 labels render punctuation instead of escaped unicode sequences", async ({ page }) => {
    await reachFilingStatus(page);
    await page.getByRole("radio", { name: /single/i }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("checkbox", { name: /w-2 wages/i }).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /start my return/i }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /skip this section/i }).click();

    await expect(page.getByText("Box 1 — Wages, tips, other comp", { exact: true })).toBeVisible();
    await expect(page.getByText("Box 2 — Federal income tax withheld", { exact: true })).toBeVisible();
    await expect(page.getByText(/\\u2014/i)).toHaveCount(0);
  });

  test("empty guided W-2 cards do not invite review before any values are detected", async ({ page }) => {
    await completeSegmentation(page);

    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /skip this section/i }).click();

    const reviewButton = page.getByRole("button", { name: /no w-2 suggestions yet/i });

    await expect(page.getByText(/w-2 #1/i)).toBeVisible();
    await expect(reviewButton).toBeDisabled();
    await expect(page.getByText(/no w-2 values are ready yet/i)).toHaveCount(0);
  });

  test("mobile onboarding uses a compact state picker and still routes to a state return", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await reachFilingStatus(page);
    await page.getByRole("radio", { name: /single/i }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("checkbox", { name: /w-2 wages/i }).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    const statePicker = page.getByRole("combobox", { name: /state of residence/i });
    await expect(statePicker).toBeVisible();
    await expect(page.getByRole("radio", { name: /california/i })).toHaveCount(0);

    await statePicker.selectOption("CA");
    await expect(page.getByText(/california will add a state return section/i)).toBeVisible();

    await page.getByRole("button", { name: /start my return/i }).click();
    await expect(page.getByRole("button", { name: /state return/i })).toBeVisible();
  });

  test("mobile interview keeps the current section above the live ticker chrome", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await completeSegmentation(page);

    const sectionHeading = page.getByRole("heading", { name: /about you/i });
    const ticker = page.locator(".guided-refund-ticker-sticky");

    await expect(sectionHeading).toBeVisible();
    await expect(ticker).toBeVisible();

    // Compare every position in one browser turn: scrolling or reflow between
    // separate protocol calls would mix different viewport coordinate systems.
    const { sectionBox, tickerBox, firstStepBox, secondStepBox } = await sectionHeading.evaluate((section) => {
      const box = (element: Element | null | undefined) => element?.getClientRects().length
        ? element.getBoundingClientRect().toJSON() : null;
      const steps = document.querySelectorAll(".guided-progress-step");
      return {
        sectionBox: box(section),
        tickerBox: box(document.querySelector(".guided-refund-ticker-sticky")),
        firstStepBox: box(steps[0]),
        secondStepBox: box(steps[1]),
      };
    });

    expect(sectionBox).not.toBeNull();
    expect(tickerBox).not.toBeNull();
    expect(firstStepBox).not.toBeNull();
    expect(secondStepBox).not.toBeNull();

    expect(sectionBox!.y).toBeLessThan(tickerBox!.y);
    expect(Math.abs(firstStepBox!.y - secondStepBox!.y)).toBeLessThan(12);
  });

  test("mobile interview keeps later sections visible in the scrollable progress rail", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const workspaceId = getWorkspaceIdFromUrl(page.url());
    await seedGuidedProgressRailState(page, workspaceId);
    await page.reload();

    await expect(page.getByText(/swipe to see every section\./i)).toBeVisible();

    const rail = page.locator(".guided-progress-steps");
    const activeStep = page.locator(".guided-progress-step-active", {
      hasText: /payments & withholding/i,
    });

    await expect
      .poll(async () => {
        const railBox = await rail.boundingBox();
        const activeStepBox = await activeStep.boundingBox();

        if (!railBox || !activeStepBox) {
          return false;
        }

        return (
          activeStepBox.x >= railBox.x
          && activeStepBox.x + activeStepBox.width <= railBox.x + railBox.width
        );
      })
      .toBe(true);
  });

  test("filers who select no income types skip income sections after onboarding", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /start your tax return/i }).click();
    await expect(page.getByText(/let's tailor your return/i)).toBeVisible();

    await reachFilingStatus(page);
    await page.getByRole("radio", { name: /single/i }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/what types of income/i)).toBeVisible();

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/did any of these happen/i)).toBeVisible();

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/what state did you live in/i)).toBeVisible();

    await page.getByRole("button", { name: /start my return/i }).click();
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /skip this section/i }).click();

    await expect(page.getByRole("heading", { name: /deductions/i })).toBeVisible();
    await expect(page.getByText(/w-2 #1/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /w-2 wages/i })).toHaveCount(0);
  });

  test("personal info section renders with name and address fields", async ({ page }) => {
    // Complete segmentation quickly
    await completeSegmentation(page);

    // Should be on personal info section
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible();
    await expect(page.getByText(/filing status/i).first()).toBeVisible();

    // Name fields
    await expect(page.getByRole("textbox", { name: /first name/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /last name/i })).toBeVisible();

    // SSN field
    await expect(page.getByRole("textbox", { name: /social security/i })).toBeVisible();
    await expect(page.getByText(/review downloads omit it/i)).toBeVisible();
  });

  test("W-2 section allows entering wages and shows refund ticker", async ({ page }) => {
    // Complete segmentation with W-2 wages selected
    await completeSegmentation(page);

    // Navigate past personal info
    await fillRequiredTaxpayerFacts(page);
    await page.getByRole("textbox", { name: /first name/i }).fill("Jane");
    await page.getByRole("textbox", { name: /last name/i }).fill("Doe");
    await page.getByRole("button", { name: "Continue" }).click();

    // Should be on W-2 section
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    // Enter W-2 data
    const wagesInput = page.locator('input[placeholder="0.00"]').first();
    await wagesInput.fill("75000");

    // The refund ticker should be visible and showing estimates
    await expect(page.getByText(/live ticker/i)).toBeVisible();
  });

  test("guided W-2 step lets filers upload a W-2 without leaving guided mode", async ({ page }, testInfo) => {
    await completeSegmentation(page);

    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /skip this section/i }).click();
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    const w2Path = testInfo.outputPath("fw2--2026.pdf");
    await copyFile(path.join(sampleDocsDir, "irs-w2-2026.pdf"), w2Path);

    const fileChooserPromise = page.waitForEvent("filechooser");
    await expect(page.getByRole("button", { name: /upload w-2 pdf/i })).toBeVisible();
    await page.getByRole("button", { name: /upload w-2 pdf/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(w2Path);

    await expect(page.getByText(futureYearSampleMessage)).toBeVisible();
    await expect(page.getByRole("button", { name: /insert sample values/i })).toHaveCount(0);
    await expect(page.getByText(/1 docs stored locally\./i)).toHaveCount(0);
  });

  test("guided W-2 skip prompt acknowledges detected document values before skipping", async ({ page }) => {
    await completeSegmentation(page);

    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /skip this section/i }).click();
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(path.join(sampleDocsDir, "irs-w2-2025.pdf"));

    await expect(page.getByRole("button", { name: /insert sample values/i })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(
      page.getByText(/detected w-2 values are ready to review before this section will count toward your return/i)
    ).toBeVisible();
    await expect(
      page.getByText(/2025 form w-2 already has detected values on this return\./i)
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /review detected w-2 values/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /skip this section/i })).toBeVisible();
  });

  test("guided W-2 step blocks progress until sample values are confirmed", async ({ page }) => {
    const workspaceId = getWorkspaceIdFromUrl(page.url());
    await seedPendingGuidedW2State(page, workspaceId);
    await page.reload();

    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    await expect(page.getByRole("button", { name: /confirm value/i })).toHaveCount(4);
    await expect(page.getByRole("button", { name: /confirm all \d+ highlighted sample values/i })).toBeVisible();

    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText(/confirm the highlighted sample values before continuing/i)).toBeVisible();
    await expect(page.getByText("W-2 #1: confirm Employer name")).toBeVisible();
    await expect(page.getByText("W-2 #1: confirm Employer EIN")).toBeVisible();
    await expect(page.getByText("W-2 #1: confirm Box 1 wages")).toBeVisible();
    await expect(page.getByText("W-2 #1: confirm Box 2 federal tax withheld")).toBeVisible();
    await expect(page.getByRole("button", { name: /skip this section/i })).toHaveCount(0);

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: /deductions/i })).toHaveCount(0);
    await expect(page.getByText(/confirm the highlighted sample values before continuing/i)).toBeVisible();

    await page.getByRole("button", { name: /confirm all \d+ highlighted sample values/i }).click();
    await fillRequiredW2Facts(page);
    await expect(page.getByRole("button", { name: /confirm value/i })).toHaveCount(0);

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: /deductions/i })).toBeVisible();
  });

  test("guided ticker ignores sample W-2 values until they are confirmed", async ({ page }) => {
    const workspaceId = getWorkspaceIdFromUrl(page.url());
    await seedPendingGuidedW2State(page, workspaceId);
    await page.reload();

    await expect(page.getByText(/w-2 #1/i)).toBeVisible();
    const ticker = page.locator(".guided-refund-ticker-sticky");
    const heroValue = ticker.locator(".guided-ticker-item-hero .guided-ticker-value-hero");

    await expect(ticker.getByText("Estimated Result", { exact: true })).toBeVisible();
    await expect(heroValue).toHaveText("Enter more info for an estimate");

    await expect(page.getByText(/confirm 4 highlighted sample values before you continue/i)).toBeVisible();
    await expect(ticker.getByText("Estimated Result", { exact: true })).toBeVisible();
    await expect(heroValue).toHaveText("Enter more info for an estimate");

    const confirmButtons = page.getByRole("button", { name: /confirm value/i });
    for (let index = 0; index < 4; index += 1) {
      await confirmButtons.first().click();
    }

    // Confirming the suggested values does not invent the remaining source boxes.
    await expect(heroValue).toHaveText("Enter more info for an estimate");
    await fillRequiredW2Facts(page);
    await expect(ticker.getByText("Estimated Refund", { exact: true })).toBeVisible();
    // IRS Publication1040(2025), p6: single $36,250–$36,300 gives tax $4,115.
    // Spec: spec/federal/tax-table.yaml; $5,000 withholding less $4,115 = $885.
    await expect(heroValue).toHaveText("$885");
  });

  test("dependent care credit waits for actual qualifying-person and provider facts", async ({ page }) => {
    await completeSegmentation(page);

    await fillRequiredTaxpayerFacts(page);
    await page.getByRole("textbox", { name: /first name/i }).fill("Jane");
    await page.getByRole("textbox", { name: /last name/i }).fill("Doe");
    await page.getByRole("textbox", { name: /social security/i }).fill("123-45-6789");
    await page.getByRole("textbox", { name: /address line 1/i }).fill("123 Main St");
    await page.getByRole("textbox", { name: /^city$/i }).fill("Springfield");
    await page.getByRole("textbox", { name: /^state$/i }).fill("IL");
    await page.getByRole("textbox", { name: /^zip$/i }).fill("62704");
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByRole("textbox", { name: /employer name/i }).fill("Acme Corp");
    await page.getByRole("textbox", { name: /box 1/i }).fill("50000");
    await page.getByRole("textbox", { name: /box 2/i }).fill("5000");
    await fillRequiredW2Facts(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    const ticker = page.locator(".guided-refund-ticker-sticky");
    const heroValue = ticker.locator(".guided-ticker-item-hero .guided-ticker-value-hero");
    const qualifyingIndividuals = page.getByRole("spinbutton", { name: /qualifying individuals/i });

    // 2025 single taxable wages: $50,000 - $15,750. Published Tax Table row $34,250–$34,300: tax $3,875; withholding $5,000.
    await expect(heroValue).toHaveText("$1,125");
    await expect(qualifyingIndividuals).toHaveValue("");

    await page.getByRole("textbox", { name: /total care expenses paid/i }).fill("3000");

    await expect(page.getByText(/choose how many qualifying people received care before we estimate this credit/i)).toBeVisible();
    await expect(heroValue).toHaveText("Enter more info for an estimate");
    await qualifyingIndividuals.fill("1");
    await expect(heroValue).toHaveText("Enter more info for an estimate");

    // Fictional care for an incapable-of-self-care parent who qualifies under
    // Form2441's dependency exceptions; no child credit is assumed.
    for (const [name, value] of [
      ["Do the qualifying-person, work-related care and eligible-provider requirements in Form 2441 apply?", "true"],
      ["Did you receive dependent-care benefits, including employer-provided care?", "false"],
      ["Does either earned-income amount include student or incapacity deemed income?", "false"],
    ]) await page.getByRole("combobox", { name, exact: true }).selectOption(value);
    await page.getByRole("textbox", { name: /^Your earned income for Form 2441 line 4/ }).fill("50000");
    await page.getByRole("textbox", { name: /^Excluded dependent-care benefits from Form 2441 Part III/ }).fill("0");
    await page.getByRole("textbox", { name: /^Prior-year care expense worksheet credit/ }).fill("0");
    await page.getByRole("button", { name: "Add care provider", exact: true }).click();
    await page.getByRole("textbox", { name: "Provider 1 name", exact: true }).fill("Synthetic Adult Care");
    await page.getByRole("textbox", { name: "Provider 1 address", exact: true }).fill("100 Example Ave, Austin, TX 78701");
    await page.getByRole("combobox", { name: "Provider 1 identification status", exact: true }).selectOption("tin");
    await page.getByRole("textbox", { name: "Provider 1 tax ID", exact: true }).fill("12-3456789");
    await page.getByRole("combobox", { name: "Was provider 1 your household employee?", exact: true }).selectOption("false");
    await page.getByRole("textbox", { name: "Amount paid to provider 1", exact: true }).fill("3000");
    await page.getByRole("button", { name: "Add qualifying person", exact: true }).click();
    await page.getByRole("textbox", { name: "Qualifying person 1 first name", exact: true }).fill("Pat");
    await page.getByRole("textbox", { name: "Qualifying person 1 last name", exact: true }).fill("Example");
    await page.getByRole("combobox", { name: "Qualifying person 1 identification status", exact: true }).selectOption("tax_id");
    await page.getByRole("textbox", { name: "Qualifying person 1 tax ID", exact: true }).fill("900-70-0003");
    await page.getByRole("combobox", { name: "Was person 1 over age 12 and incapable of self-care when care was provided?", exact: true }).selectOption("true");
    await page.getByRole("combobox", { name: "Does person 1 meet the Form 2441 qualifying-person, residence and dependency requirements?", exact: true }).selectOption("true");
    await page.getByRole("textbox", { name: "Qualified expenses for person 1", exact: true }).fill("3000");
    await expect(heroValue).toHaveText("Enter more info for an estimate");
    await page.getByRole("combobox", { name: "Have you checked these provider and qualifying-person details against your actual records?", exact: true }).selectOption("true");
    // Form2441(2025): $3,000 x20% at AGI$50,000 = $600; $1,125 + $600.
    await expect(heroValue).toHaveText("$1,725");
  });

  test("navigation: back button returns to previous section", async ({ page }) => {
    await completeSegmentation(page);

    // We're on personal info
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible();

    // Back button should be disabled on first section
    const backBtn = page.getByRole("button", { name: "Back" });
    await expect(backBtn).toBeDisabled();

    // Fill personal info and advance
    await fillRequiredTaxpayerFacts(page);
    await page.getByRole("textbox", { name: /first name/i }).fill("Jane");
    await page.getByRole("textbox", { name: /last name/i }).fill("Doe");
    await page.getByRole("button", { name: "Continue" }).click();

    // Now on W-2 section — back should be enabled
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();
    await expect(backBtn).toBeEnabled();

    // Click back — should return to personal info
    await backBtn.click();
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible();
  });

  test("progress bar shows section steps and highlights current", async ({ page }) => {
    await completeSegmentation(page);

    // Progress bar should exist
    const progressBar = page.getByRole("progressbar");
    await expect(progressBar).toBeVisible();

    // The "About You" step should be active (first section)
    await expect(
      page.locator(".guided-progress-step-active", { hasText: /about you/i })
    ).toBeVisible();
  });

  test("switch to advanced mode and back to guided", async ({ page }) => {
    await completeSegmentation(page);

    // Switch to advanced mode
    await page.getByRole("button", { name: /switch to advanced mode/i }).click();

    // Should show the workspace screen with a way back into guided mode
    await expect(page.getByRole("button", { name: /start guided interview/i })).toBeVisible();

    // Switch back to guided
    await page.getByRole("button", { name: /start guided interview/i }).click();

    // Should be back in the interview phase (since we already completed segmentation)
    // The flow state is persisted in localStorage, so it should resume
    await expect(page.getByText(/let's start with the basics/i)).toBeVisible();
  });

  test("advanced mode acknowledges saved guided setup before any document upload", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("tax-engine:guided-mode", "true");
    });
    await page.goto("/returns/new");
    await completeSegmentation(page);

    await fillRequiredTaxpayerFacts(page);
    await page.getByRole("textbox", { name: /first name/i }).fill("Jane");
    await page.getByRole("textbox", { name: /last name/i }).fill("Doe");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    await page.getByRole("button", { name: /switch to advanced mode/i }).click();

    const returnSummary = page.locator("section.panel").filter({
      has: page.getByRole("heading", { name: /return summary/i })
    });

    await expect(returnSummary.getByText(/guided setup saved/i).first()).toBeVisible();
    await expect(returnSummary.getByText(/1 guided section saved/i)).toBeVisible();
    await expect(page.getByText(/ready to resume at w-2 wages/i).first()).toBeVisible();
  });

  test("completed guided W-2 flow preserves its estimate and review-only output in the advanced workspace", async ({ page }) => {
    await page.evaluate(() => {
      window.localStorage.clear();
    });
    await page.goto("/returns/new");
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);

    await completeSegmentation(page);
    await page.getByRole("button", { name: /switch to advanced mode/i }).click();

    await page.locator('input[type="file"]').setInputFiles(path.join(sampleDocsDir, "irs-w2-2025.pdf"));
    await expect(page.getByText(/1 irs sample document loaded/i)).toBeVisible();

    await page.getByRole("button", { name: /get step-by-step help/i }).click();
    await fillRequiredTaxpayerFacts(page);
    await page.getByRole("textbox", { name: /first name/i }).fill("Jane");
    await page.getByRole("textbox", { name: /last name/i }).fill("Doe");
    await page.getByRole("textbox", { name: /social security/i }).fill("123-45-6789");
    await page.getByRole("textbox", { name: /address line 1/i }).fill("123 Main St");
    await page.getByRole("textbox", { name: /^city$/i }).fill("Austin");
    await page.getByRole("textbox", { name: /^state$/i }).fill("TX");
    await page.getByRole("textbox", { name: /^zip$/i }).fill("78701");
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByRole("button", { name: /review w-2 and sample suggestions/i }).click();
    await page.getByRole("button", { name: /insert sample values/i }).click();
    await page.getByRole("button", { name: /confirm all \d+ highlighted sample values/i }).click();
    await fillRequiredW2Facts(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /skip this section/i }).click();
    await page.getByRole("button", { name: /^continue$/i }).click();
    await page.getByRole("button", { name: /open full return/i }).click();

    const ticker = page.locator("section.panel").filter({
      has: page.getByRole("heading", { name: /live ticker/i })
    });

    await expect(page.getByText(/preparing your estimate/i)).toHaveCount(0);
    await expect(page.getByText(/waiting on data/i)).toHaveCount(0);
    await expect(page.getByText(/upload or answer/i)).toHaveCount(0);
    await expect(page.getByText(/status: ready to review/i)).toBeVisible();
    await expect(page.getByText(/1 upload \+ guided answers synced/i)).toBeVisible();
    await expect(page.getByText(/guided answers synced from the interview/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /download completed return/i })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /^return bundle$/i })).toBeVisible();
    await expect(page.getByText(/filing exports are not yet qualified/i)).toBeVisible();
    await expect(ticker.getByText("Estimated Refund", { exact: true })).toBeVisible();
    await expect(ticker.locator(".guided-ticker-item-hero .guided-ticker-value-hero")).toHaveText("$885");
    await expect(ticker.getByText("Single", { exact: true })).toBeVisible();
    await expect(ticker.getByText("2025", { exact: true })).toBeVisible();

    await page.getByRole("region", { name: "Your Documents", exact: true })
      .getByRole("button", { name: "Expand", exact: true }).click();
    const guidedDocument = page.getByRole("listitem").filter({
      has: page.getByText("W-2 (guided interview)", { exact: true })
    });

    await expect(guidedDocument.getByText(/added from guided interview/i)).toBeVisible();
    await expect(guidedDocument.getByText(/unrecognized — may need review/i)).toHaveCount(0);
  });

  test("segmentation back button navigates to previous step", async ({ page }) => {
    await expect(page.getByText(/let's tailor your return/i)).toBeVisible();

    // Select filing status
    await reachFilingStatus(page);
    await page.getByRole("radio", { name: /single/i }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/what types of income/i)).toBeVisible();

    // Click Back — should return to filing status
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByText(/what's your filing status/i)).toBeVisible();

    // Our previous selection should still be checked
    await expect(page.getByRole("radio", { name: /single/i })).toBeChecked();
  });

  test("skip prompt appears when advancing past empty section", async ({ page }) => {
    await completeSegmentation(page);

    // Personal info is empty — click Continue without filling anything
    await page.getByRole("button", { name: "Continue" }).click();

    // Should show skip prompt
    await expect(page.getByText(/you haven't entered any personal info/i)).toBeVisible();

    // "Skip this section" should advance
    await page.getByRole("button", { name: /skip this section/i }).click();

    // Should now be on W-2 section
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();
  });

  test("completion summary calls out skipped guided sections instead of counting them as complete", async ({ page }) => {
    const workspaceId = getWorkspaceIdFromUrl(page.url());
    await seedCompletedGuidedReviewState(page, workspaceId);

    await page.reload();

    await expect(page.getByRole("heading", { name: /some guided sections still need review/i })).toBeVisible();
    await expect(page.getByText(/your return is ready to review/i)).toHaveCount(0);
    await expect(page.locator(".guided-ticker-item").filter({ hasText: /sections complete/i })).toContainText("6");
    await expect(page.locator(".guided-ticker-item").filter({ hasText: /sections skipped/i })).toContainText("1");
  });

  test("full return copy separates guided review from unanswered document questions", async ({ page }) => {
    const workspaceId = getWorkspaceIdFromUrl(page.url());
    await seedCompletedGuidedReviewState(page, workspaceId);

    await page.reload();
    await page.getByRole("button", { name: /open full return/i }).click();

    const questionsPanel = page.locator("section.panel").filter({
      has: page.getByRole("heading", { name: /^questions$/i }),
    });
    const checklistPanel = page.locator("section.panel").filter({
      has: page.getByRole("heading", { name: /^checklist$/i }),
    });

    await expect(page.getByText(/1 guided section still needs review/i).first()).toBeVisible();
    await expect(page.getByText(/status: needs review/i)).toBeVisible();
    await expect(questionsPanel.getByText(/all current document questions answered/i)).toBeVisible();
    await expect(questionsPanel.getByText(/your guided interview answers are synced, but 1 section was skipped or still needs review before this return is ready\./i)).toBeVisible();
    await expect(checklistPanel.getByText(/review guided sections/i)).toBeVisible();
    await expect(checklistPanel.getByText(/answer missing questions/i)).toHaveCount(0);
  });

  test("defaulted deductions advance without a skip prompt", async ({ page }) => {
    await completeSegmentation(page);

    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /skip this section/i }).click();
    await expect(page.getByText(/w-2 #1/i)).toBeVisible();

    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /skip this section/i }).click();
    await expect(page.getByRole("heading", { name: /deductions/i })).toBeVisible();
    await expect(page.getByText(/standard deduction/i).first()).toBeVisible();

    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText(/you haven't entered any deductions info/i)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /tax credits/i })).toBeVisible();
  });

  test("completing all sections reaches review screen", async ({ page }) => {
    // Complete segmentation with minimal setup: single, W-2 only, no events, no state
    await completeSegmentation(page);

    // Skip through all sections to reach review
    const sections = ["personal-info", "income-w2", "deductions", "credits", "payments"];
    for (let i = 0; i < sections.length; i++) {
      await page.getByRole("button", { name: "Continue" }).click();
      // Handle skip prompt if it appears
      const skipBtn = page.getByRole("button", { name: /skip this section/i });
      if (await skipBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await skipBtn.click();
      }
    }

    // Should reach the review section
    await expect(page.getByText(/here's everything at a glance/i)).toBeVisible({ timeout: 5000 });
  });
});

/**
 * Helper: complete segmentation with Single / W-2 wages / no events / no state.
 */
async function completeSegmentation(page: import("@playwright/test").Page) {
  await expect(page.getByText(/let's tailor your return/i)).toBeVisible();

  // Step 1: Single
  await reachFilingStatus(page);
  await page.getByRole("radio", { name: /single/i }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/what types of income/i)).toBeVisible();

  // Step 2: W-2 wages
  await page.getByRole("checkbox", { name: /w-2 wages/i }).check();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3: Skip life events
  await expect(page.getByText(/did any of these happen/i)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 4: No state — skip for now is the default dropdown value
  await expect(page.getByText(/what state did you live in/i)).toBeVisible();
  await expect(page.getByRole("combobox", { name: /state of residence/i })).toHaveValue("");
  await page.getByRole("button", { name: /start my return/i }).click();

  // Wait for interview phase to start
  await expect(page.getByText(/let's start with the basics/i)).toBeVisible({ timeout: 5000 });
}

async function seedPendingGuidedW2State(
  page: import("@playwright/test").Page,
  workspaceId: string
) {
  await page.evaluate((savedState) => {
    window.localStorage.setItem(
      `tax-engine.guided-flow-state.v1:${savedState.workspaceId}`,
      JSON.stringify(savedState.state)
    );
  }, {
    workspaceId,
    state: {
      phase: "interview",
      taxYear: 2025,
      segmentation: {
        filingStatus: "single",
        incomeTypes: ["w2-wages"],
        lifeEvents: [],
        stateCode: null,
      },
      currentSectionIndex: 1,
      completedSections: ["personal-info"],
      sectionData: {
        "personal-info": taxpayerFacts2025,
        "income-w2": {
          entries: [
            {
              accountHolder: "primary", stateTaxReporting: "none",
              employerName: "Official fixture employer",
              employerEin: "12-3456789",
              wages: "52000",
              federalWithheld: "5000",
              socialSecurityWages: "0",
              socialSecurityWithheld: "0",
              medicareWages: "0",
              medicareWithheld: "0",
              stateWages: "",
              stateWithheld: "",
              aiSuggestedFields: {
                employerName: {
                  sourceLabel: "2025 Form W-2 (official info-copy PDF)",
                  sourceType: "official-fixture",
                  status: "pending-confirmation",
                },
                employerEin: {
                  sourceLabel: "2025 Form W-2 (official info-copy PDF)",
                  sourceType: "official-fixture",
                  status: "pending-confirmation",
                },
                wages: {
                  sourceLabel: "2025 Form W-2 (official info-copy PDF)",
                  sourceType: "official-fixture",
                  status: "pending-confirmation",
                },
                federalWithheld: {
                  sourceLabel: "2025 Form W-2 (official info-copy PDF)",
                  sourceType: "official-fixture",
                  status: "pending-confirmation",
                },
              },
            },
          ],
        },
      },
    },
  });
}

async function seedGuidedProgressRailState(
  page: import("@playwright/test").Page,
  workspaceId: string
) {
  await page.evaluate((savedState) => {
    window.localStorage.setItem(
      `tax-engine.guided-flow-state.v1:${savedState.workspaceId}`,
      JSON.stringify(savedState.state)
    );
  }, {
    workspaceId,
    state: {
      phase: "interview",
      segmentation: {
        filingStatus: "single",
        incomeTypes: ["w2-wages"],
        lifeEvents: [],
        stateCode: null,
      },
      currentSectionIndex: 4,
      completedSections: ["personal-info", "income-w2", "deductions", "credits"],
      sectionData: {
        deductions: {
          method: "standard",
          medicalExpenses: "",
          stateLocalTaxes: "",
          realEstateTaxes: "",
          mortgageInterest: "",
          charitableContributions: "",
          casualtyLosses: "",
          otherItemized: "",
        },
      },
    },
  });
}

async function seedCompletedGuidedReviewState(
  page: import("@playwright/test").Page,
  workspaceId: string
) {
  await page.evaluate((savedState) => {
    window.localStorage.setItem(
      `tax-engine.guided-flow-state.v1:${savedState.workspaceId}`,
      JSON.stringify(savedState.state)
    );
  }, {
    workspaceId,
    state: {
      phase: "complete",
      taxYear: 2025,
      segmentation: {
        filingStatus: "single",
        incomeTypes: ["w2-wages"],
        lifeEvents: [],
        stateCode: null,
      },
      currentSectionIndex: 6,
      completedSections: ["personal-info", "income-w2", "deductions", "credits", "payments", "review", "final-review"],
      sectionData: {
        deductions: {
          method: "standard",
          medicalExpenses: "",
          stateLocalTaxes: "",
          realEstateTaxes: "",
          mortgageInterest: "",
          charitableContributions: "",
          casualtyLosses: "",
          otherItemized: "",
        },
        "income-w2": {
          entries: [
            {
              accountHolder: "primary", stateTaxReporting: "none",
              employerName: "Official fixture employer",
              employerEin: "12-3456789",
              wages: "52000",
              federalWithheld: "5000",
              socialSecurityWages: "0",
              socialSecurityWithheld: "0",
              medicareWages: "0",
              medicareWithheld: "0",
              socialSecurityTips: "0", box10DependentCareBenefits: "0", box12CodeW: "0",
              stateWages: "",
              stateWithheld: "",
            },
          ],
        },
      },
    },
  });
}
