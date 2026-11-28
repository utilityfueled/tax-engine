// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml, rental-source-records
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionRentalIncome } from "@/components/guided-interview/section-rental-income";
import { SectionReview } from "@/components/guided-interview/section-review";
import { rentalFactErrors } from "@/lib/guided-rental-facts";
import { buildRentalPropertyInputs, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyRentalPropertyEntry, type RentalPropertyEntryData } from "@/lib/guided-interview-flow";
import { calculateScheduleE } from "@/engine/schedules/schedule-e.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import * as civilDate from "@/utils/civil-date.js";
import { completeRentalSource, startCompleteInterview } from "../../guided-interview/complete-facts";

let container: HTMLDivElement, root: Root, latest: RentalPropertyEntryData[];
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
function control(label: string) { const element = [...container.querySelectorAll("label")].find(item => item.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select"); if (!element) throw new Error(`Missing ${label}`); return element; }
async function change(label: string, value: string) { const input = control(label); await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }); }
async function click(label: string) { const button = [...container.querySelectorAll("button")].find(item => item.textContent?.trim() === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
async function render(entries = [completeRentalSource], taxYear?: number) {
  latest = structuredClone(entries);
  function Harness() { const [data, setData] = useState(latest); return <SectionRentalIncome entries={data} taxYear={taxYear} onEntriesChange={next => { latest = next; setData(next); }} />; }
  await act(async () => root.render(<Harness />));
}
const confirmation = "Have you checked the actual property, ownership, use, income and expense facts after the latest edits?";
function flow() { const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["rental"], lifeEvents: [], stateCode: null }); state.sectionData["income-rental"] = { entries: latest }; return state; }

describe("actual rental source interactions", () => {
  it("keeps newly entered owner use and classification facts unknown until answered", async () => {
    await render([emptyRentalPropertyEntry]);
    expect(control("Actual property type").value).toBe("");
    expect(control("Actual rental owner").value).toBe("");
    expect(control("Days rented at fair rental value").value).toBe("");
    expect(buildRentalPropertyInputs(latest)).toEqual([]);
    await change("Gross rents for the whole property", "0");
    expect(buildRentalPropertyInputs(latest)[0]).toMatchObject({ rents: "0", accountHolder: undefined, rentalDays: undefined });
    expect(buildTaxInputFromGuidedData(flow())).toBeNull();
    await change("Actual property address or legal land description", "100 Actual Rd");
    await change("Actual property type", "land");
    await change("Actual rental owner", "spouse");
    await change("Actual ownership percentage", "50");
    await change("Days rented at fair rental value", "0");
    await change("Days of personal use", "0");
    expect(buildRentalPropertyInputs(latest)[0]).toMatchObject({ description: "100 Actual Rd", propertyType: "land", accountHolder: "spouse", ownershipPercentage: "50", rentalDays: 0, personalUseDays: 0 });
    expect(rentalFactErrors(latest, "single")).toHaveProperty("rental-0-owner");
    await click("+ Add another property");
    expect(latest).toHaveLength(2);
    expect(latest[1].propertyType).toBe("");
    await click("Remove");
    expect(latest).toEqual([emptyRentalPropertyEntry]);
  });

  it("invalidates source confirmation and preserves exact unknown zero and large rents", async () => {
    await render();
    await change("Gross rents for the whole property", "9007199254740993.01");
    expect(buildRentalPropertyInputs(latest)[0].rents).toBe("9007199254740993.01");
    expect(latest[0].sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(flow())).toBeNull();
    await change(confirmation, "true");
    expect(buildTaxInputFromGuidedData(flow())?.rentalProperties[0].rents).toBe("9007199254740993.01");
    await change("Gross rents for the whole property", "");
    expect(buildRentalPropertyInputs(latest)[0].rents).toBeUndefined();
    await change("Gross rents for the whole property", "0");
    await change(confirmation, "true");
    expect(buildTaxInputFromGuidedData(flow())?.rentalProperties).toHaveLength(1);
  });

  it("keeps every source expense editable and reviews their total before ownership or tax limits", async () => {
    await render();
    for (const label of ["Advertising", "Auto and travel", "Cleaning and maintenance", "Commissions", "Insurance", "Legal and professional fees", "Management fees", "Mortgage interest", "Other interest", "Repairs", "Supplies", "Property taxes", "Utilities", "Depreciation from the actual worksheet", "Other deductible expenses"]) await change(label, "0.10");
    await change("Description of other deductible rental expenses", "Actual deductible costs");
    await change("Is the depreciation amount from the actual deductible depreciation worksheet?", "");
    expect(rentalFactErrors(latest, "single")).toHaveProperty("rental-0-depreciationWorksheetConfirmed");
    await change("Is the depreciation amount from the actual deductible depreciation worksheet?", "true");
    await change("Is the auto and travel amount from the actual deductible vehicle and travel records?", "false");
    expect(rentalFactErrors(latest, "single")).toHaveProperty("rental-0-autoTravelWorksheetConfirmed");
    await change("Is the auto and travel amount from the actual deductible vehicle and travel records?", "true");
    await change("Actual ownership percentage", "50");
    await change(confirmation, "true");
    expect(rentalFactErrors(latest, "single")).toEqual({});
    expect(buildTaxInputFromGuidedData(flow())?.rentalProperties[0]).toMatchObject({ ownershipPercentage: "50", autoTravel: "0.10", managementFees: "0.10", otherExpenseDescription: "Actual deductible costs" });
    await act(async () => root.render(<SectionReview state={flow()} preview={null} onJumpToSection={() => {}} />));
    expect(container.textContent).toContain("$1.50");
    expect(container.textContent).toContain("before ownership allocation and tax limits");
    expect(container.textContent).toContain("$0 rents");
  });

  it("preserves qualification answers and blocks unsupported uses instead of treating them as ordinary rentals", async () => {
    await render();
    const specialCases = [
      "Do you claim real estate professional treatment for this activity?",
      "Did you provide substantial services to occupants beyond ordinary rental services?",
      "Was the property rented to a business in which you materially participated?",
      "Does this property require other special classification, interest-limit or loss worksheets?",
    ];
    for (const label of specialCases) {
      await change(label, "true"); await change(confirmation, "true");
      expect(buildTaxInputFromGuidedData(flow()), label).toBeNull();
      await change(label, "false");
    }
    await change("Was the property held for rental income or profit?", "false");
    expect(rentalFactErrors(latest, "single")).toHaveProperty("rental-0-heldForRental");
    await change("Was the property held for rental income or profit?", "true");
    await change("Are all entered rents and expenses full-property amounts before ownership allocation?", "false");
    expect(rentalFactErrors(latest, "single")).toHaveProperty("rental-0-amount-basis");
    await change("Are all entered rents and expenses full-property amounts before ownership allocation?", "true");
    await change("Did you actively participate through actual management decisions under the rental loss rules?", "false");
    expect(container.textContent).not.toContain("Lowest combined taxpayer");
    await change("Did you actively participate through actual management decisions under the rental loss rules?", "true");
    await change("Lowest combined taxpayer and spouse ownership percentage during the year", "9.99");
    expect(rentalFactErrors(latest, "single")).toHaveProperty("rental-0-active-interest");
    await change("Lowest combined taxpayer and spouse ownership percentage during the year", "10");
    await change("Was all your investment in this rental activity at risk?", "false");
    await change("Prior-year unallowed rental losses", "0"); await change("Prior-year unallowed rental credits", "0");
    await change("Does this rental qualify as a trade or business for the QBI deduction?", "true");
    await change("Did you materially participate in this qualified rental under section 469?", "false");
    await change("Is the rental a specified service business for section 199A?", "false");
    await change("Owner's qualified W-2 wages for this rental", "0");
    await change("Owner's qualified-property UBIA for this rental", "0");
    await change(confirmation, "true");
    expect(buildTaxInputFromGuidedData(flow())?.rentalProperties[0]).toMatchObject({ allInvestmentAtRisk: false, qbiMateriallyParticipated: false, qbiW2Wages: "0", qbiUBIA: "0" });
    await change("Did you materially participate in this qualified rental under section 469?", "");
    expect(latest[0].qbiMateriallyParticipated).toBeNull();
    expect(buildTaxInputFromGuidedData(flow())).toBeNull();
  });

  it("reconciles edited 2026 dwelling originals through guided input", async () => {
    const propertyAddress = completeRentalSource.description;
    const periodConfirmation = "Do these complete ordinary cash-rental records include all occupied days, rents and expenses, with no other rental classifications or special-use periods?";
    const entry: RentalPropertyEntryData = { ...completeRentalSource, rentalDays: "90", personalUseDays: "10", rents: "2000", insurance: "1000",
      rentalUseAllocationSources: { taxYear: 2026, propertyAddress, occupancySourceReference: "Calendar", rentSourceReference: "Rent ledger",
        expenseSourceReference: "Bill ledger", confirmedCompleteOrdinaryUse: true, confirmedOrdinaryTenantRelationship: true,
        periods: [{ sourceReference: "Lease", use: "fair_rental", start: "2026-06-01", end: "2026-08-29" },
          { sourceReference: "Owner calendar", use: "personal", start: "2026-09-01", end: "2026-09-10" }],
        rentReceipts: [{ sourceReference: "Paid rent", propertyAddress, leaseReference: "Lease", datePaid: "2026-06-01", amount: "2000" }],
        expenseReceipts: [{ sourceReference: "Paid policy", propertyAddress, datePaid: "2026-08-20", amount: "999", category: "insurance", use: "shared" }],
        depreciation: { propertyAddress, sourceReference: "Prior asset register", confirmedCompleteWithoutCurrentAssets: true,
          assets: [{ sourceReference: "Building record", kind: "building", placedInServiceDate: "1990-01-01", basisFullyRecoveredDate: "2018-01-01",
            depreciableBasis: "66000", priorAllowableDepreciation: "66000" }] } } };
    const current = () => {
      const state = flow();
      state.taxYear = 2026;
      return buildTaxInputFromGuidedData(state);
    };
    await render([entry], 2026);
    expect(current()).toBeNull();
    expect(rentalFactErrors(latest, "single", 2026)["rental-0-personal-allocation"]).toMatch(/insurance receipts must match/i);
    await change("Expense receipt 1 amount", "1,000.00");
    expect(latest[0].rentalUseAllocationSources?.confirmedCompleteOrdinaryUse).toBeNull();
    expect(latest[0].sourceFactsConfirmed).toBeNull();
    expect(current()).toBeNull();
    await change(periodConfirmation, "true");
    await change(confirmation, "true");
    const complete = current();
    expect(complete?.rentalProperties[0].rentalUseAllocationSources?.expenseReceipts?.[0]?.amount).toBe("1000.00");
    expect(calculateScheduleE(TaxYearInputSchema.parse(complete), undefined, { asOfDate: "2026-10-01" }).rentalProperties[0].netRentalIncome.toFixed(2)).toBe("1100.00");
    expect(buildTaxInputFromGuidedData(flow())).toBeNull();
    await render(JSON.parse(JSON.stringify(latest)), 2026);
    expect(current()?.rentalProperties[0].rentalUseAllocationSources).toEqual(complete?.rentalProperties[0].rentalUseAllocationSources);

    const today = vi.spyOn(civilDate, "currentLocalCivilDate").mockReturnValue("2026-10-01");
    try {
      const confirmEditedExpenseDate = async (date: string) => {
        await change("Expense receipt 1 paid date", date);
        await change(periodConfirmation, "true");
        await change(confirmation, "true");
      };
      await confirmEditedExpenseDate("2026-10-02");
      expect(rentalFactErrors(latest, "single", 2026)["rental-0-personal-allocation"]).toMatch(/as-of date/i);
      expect(current()).toBeNull();
      await confirmEditedExpenseDate("2026-10-01");
      expect(current()?.rentalProperties[0].rentalUseAllocationSources?.expenseReceipts?.[0]?.datePaid).toBe("2026-10-01");
    } finally { today.mockRestore(); }
  });

  it("clears saved 2026 allocation only on explicit removal after a correction", async () => {
    await render([{ ...completeRentalSource, personalUseDays: "1" }], 2026);
    await click("Add use period");
    await change("Use period 1 reference", "Saved original");
    await change("Days of personal use", "0");
    await change(confirmation, "true");
    const saved = JSON.parse(JSON.stringify(latest)) as RentalPropertyEntryData[];
    expect(saved[0].rentalUseAllocationSources?.periods?.[0].sourceReference).toBe("Saved original");
    for (const taxYear of [2026, 2025]) {
      await render(saved, taxYear);
      const state = () => ({ ...flow(), taxYear });
      expect(buildTaxInputFromGuidedData(state())).toBeNull();
      await click("Remove 2026 rental allocation records");
      expect(latest[0].rentalUseAllocationSources).toBeUndefined();
      expect(latest[0].sourceFactsConfirmed).toBeNull();
      await change(confirmation, "true");
      expect(buildTaxInputFromGuidedData(state())?.rentalProperties[0]?.personalUseDays).toBe(0);
    }
  });
});
