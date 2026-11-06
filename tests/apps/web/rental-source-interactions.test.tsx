// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml, rental-source-records
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SectionRentalIncome } from "@/components/guided-interview/section-rental-income";
import { SectionReview } from "@/components/guided-interview/section-review";
import { rentalFactErrors } from "@/lib/guided-rental-facts";
import { buildRentalPropertyInputs, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyRentalPropertyEntry, type RentalPropertyEntryData } from "@/lib/guided-interview-flow";
import { completeRentalSource, startCompleteInterview } from "../../guided-interview/complete-facts";

let container: HTMLDivElement, root: Root, latest: RentalPropertyEntryData[];
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
function control(label: string) { const element = [...container.querySelectorAll("label")].find(item => item.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select"); if (!element) throw new Error(`Missing ${label}`); return element; }
async function change(label: string, value: string) { const input = control(label); await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }); }
async function click(label: string) { const button = [...container.querySelectorAll("button")].find(item => item.textContent?.trim() === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
async function render(entries = [completeRentalSource]) {
  latest = structuredClone(entries);
  function Harness() { const [data, setData] = useState(latest); return <SectionRentalIncome entries={data} onEntriesChange={next => { latest = next; setData(next); }} />; }
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
});
