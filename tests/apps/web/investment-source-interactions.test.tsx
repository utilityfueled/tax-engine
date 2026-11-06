// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml, investment-source-records
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SectionInvestmentIncome } from "@/components/guided-interview/section-investment-income";
import { SectionReview } from "@/components/guided-interview/section-review";
import { investmentFactErrors, type InvestmentData } from "@/lib/guided-investment-facts";
import { buildBrokerageInputs, buildInterestInputs } from "@/lib/guided-interview-bridge";
import { completeBrokerageSource, completeDividendSource, completeInterestSource, startCompleteInterview } from "../../guided-interview/complete-facts";

let container: HTMLDivElement, root: Root, latest: InvestmentData;
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
function card(prefix: string): HTMLElement { const title = [...container.querySelectorAll("strong")].find(element => element.textContent?.trim().startsWith(prefix)); const element = title?.closest<HTMLElement>(".guided-w2-card"); if (!element) throw new Error(`Missing ${prefix}`); return element; }
function control(scope: HTMLElement, label: string) { const result = [...scope.querySelectorAll("label")].find(element => element.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select"); if (!result) throw new Error(`Missing ${label}`); return result; }
async function change(scope: HTMLElement, label: string, value: string) { const input = control(scope, label); await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }); }
async function click(label: string, scope: HTMLElement = container) { const button = [...scope.querySelectorAll("button")].find(element => element.textContent?.trim() === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
async function render(initial: InvestmentData) {
  latest = structuredClone(initial);
  function Harness() { const [data, setData] = useState(latest); const update = (next: InvestmentData) => { latest = next; setData(next); }; return <SectionInvestmentIncome {...data} onInterestEntriesChange={interestEntries => update({ ...data, interestEntries })} onDividendEntriesChange={dividendEntries => update({ ...data, dividendEntries })} onBrokerageEntriesChange={brokerageEntries => update({ ...data, brokerageEntries })} />; }
  await act(async () => root.render(<Harness />));
}

describe("actual investment input interactions", () => {
  it("collects bond preferences and invalidates their confirmation after source edits", async () => {
    await render({ interestEntries: [completeInterestSource], dividendEntries: [], brokerageEntries: [] });
    const source = card("1099-INT #1");
    await change(source, "Box 8 tax-exempt interest", "500.25");
    await change(source, "Box 9 private-activity bond interest", "125.10");
    await change(source, "Bond preference source tax year", "2025");
    await change(source, "Bond preference source record ID", "actual-bank-record");
    await change(source, "Otherwise allowable bond preference deduction", "5.05");
    await change(source, "Bond deduction worksheet reference", "Actual completed allowance worksheet");
    await change(source, "Bond deduction is allowable and has not been deducted twice", "true");
    await change(source, "Bond recipient amounts checked after the last edit", "true");
    expect(investmentFactErrors(latest, "single", 2025)).toEqual({});
    expect(buildInterestInputs(latest.interestEntries, 2025)[0]?.privateActivityBondFacts?.otherwiseAllowableDeduction).toBe("5.05");
    await change(source, "Box 9 private-activity bond interest", "126.10");
    expect(latest.interestEntries[0]?.pabRecipientAmountsConfirmed).toBe("");
    expect(investmentFactErrors(latest, "single", 2025)).toHaveProperty("interest-0-pab");
    await change(source, "Bond recipient amounts checked after the last edit", "true");
    await change(source, "Otherwise allowable bond preference deduction", "6.05");
    expect(latest.interestEntries[0]?.pabDeductionAllowanceAndNoDuplicationConfirmed).toBe("");
    expect(investmentFactErrors(latest, "single", 2025)).toHaveProperty("interest-0-pab");
  });
  it("shows exact source totals, explicit zero and unknown amounts in the review screen", async () => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["investments"], lifeEvents: [], stateCode: null });
    state.sectionData["income-investments"] = { interestEntries: [{ ...completeInterestSource, interestIncome: "0.10", usSavingsBondInterest: "0.20", taxExemptInterest: "" }], dividendEntries: [completeDividendSource], brokerageEntries: [{ ...completeBrokerageSource, transactions: [{ ...completeBrokerageSource.transactions[0], proceeds: "600", costBasis: "1000", washSale: true, washSaleDisallowed: "300" }] }] };
    await act(async () => root.render(<SectionReview state={state} preview={null} onJumpToSection={() => {}} />));
    const valueFor = (label: string) => [...container.querySelectorAll(".guided-review-row")].find(row => row.querySelector(".guided-review-label")?.textContent === label)?.querySelector(".guided-review-value")?.textContent;
    expect(valueFor("Taxable interest (Boxes 1 and 3)")).toBe("$0.30");
    expect(valueFor("Ordinary dividends")).toBe("$0");
    expect(valueFor("Tax-exempt interest")).toBe("Unknown — review source amounts");
    expect(valueFor("Source cost basis")).toBe("$1,000");
    expect(valueFor("Wash-sale loss disallowed")).toBe("$300");
  });
  it("keeps exact interest amounts and unknown owner state and foreign-tax facts distinct", async () => {
    await render({ interestEntries: [completeInterestSource], dividendEntries: [], brokerageEntries: [] });
    const source = card("1099-INT #1");
    await change(source, "Box 1 — Interest income", "9007199254740993.01");
    expect(buildInterestInputs(latest.interestEntries)[0].interestIncome).toBe("9007199254740993.01");
    await change(source, "Investment income owner", "joint"); expect(investmentFactErrors(latest, "mfj", 2025)).toHaveProperty("interest-0-owner");
    await change(source, "Investment income owner", "primary");
    await change(source, "Box 4 — Federal tax withheld", ""); expect(investmentFactErrors(latest, "single", 2025)).toHaveProperty("interest-0-federalWithheld");
    await change(source, "Box 4 — Federal tax withheld", "0");
    await change(source, "Box 6 foreign tax paid", "0.01"); expect(investmentFactErrors(latest, "single", 2025)).toHaveProperty("interest-0-foreignCountry");
    await change(source, "Box 7 foreign country or territory", "Canada");
    await change(source, "State reporting on this investment form", "single");
    await change(source, "Actual source state", "ny"); await change(source, "State income tax withheld on this form", "0");
    expect(investmentFactErrors(latest, "single", 2025)).toEqual({}); expect(buildInterestInputs(latest.interestEntries)[0]).toMatchObject({ state: "NY", stateWithheld: "0", foreignTaxPaid: "0.01", foreignCountry: "Canada" });
    await change(source, "Box 11 bond premium", "1"); expect(investmentFactErrors(latest, "single", 2025)).toHaveProperty("interest-0-bondPremium");
    await change(source, "Box 11 bond premium", "0"); await click("+ Add another 1099-INT"); expect(latest.interestEntries).toHaveLength(2); await click("Remove", card("1099-INT #2")); expect(latest.interestEntries).toHaveLength(1);
  });
  it("checks actual included dividend categories and retains unsupported return of capital", async () => {
    await render({ interestEntries: [], dividendEntries: [completeDividendSource], brokerageEntries: [] });
    const source = card("1099-DIV #1");
    await change(source, "Box 2a — Capital gain distributions", "100");
    await change(source, "Box 2b unrecaptured section 1250 gain", "101"); expect(investmentFactErrors(latest, "single", 2025)).toHaveProperty("dividend-0-section1250Gain");
    await change(source, "Box 2b unrecaptured section 1250 gain", "25");
    await change(source, "Box 3 nondividend distributions", "0.01"); expect(investmentFactErrors(latest, "single", 2025)).toHaveProperty("dividend-0-nondividendDistributions"); expect(latest.dividendEntries[0].nondividendDistributions).toBe("0.01");
    await change(source, "Box 3 nondividend distributions", "0"); expect(investmentFactErrors(latest, "single", 2025)).toHaveProperty("scheduleDSources");
    expect(latest.dividendEntries[0].section1250Gain).toBe("25");
    await change(source, "Box 2b unrecaptured section 1250 gain", "0"); expect(investmentFactErrors(latest, "single", 2025)).toEqual({});
    await click("+ Add another 1099-DIV"); await click("Remove", card("1099-DIV #2")); expect(latest.dividendEntries).toHaveLength(1);
  });
  it("requires renewed sale classification after edits and preserves false and zero", async () => {
    await render({ interestEntries: [], dividendEntries: [], brokerageEntries: [completeBrokerageSource] });
    const source = card("1099-B #1");
    await change(source, "Was this a digital-asset or crypto sale?", "true"); expect(latest.brokerageEntries[0].transactions[0].sourceClassificationConfirmed).toBeNull();
    await change(source, "Was the actual cost basis reported to the IRS?", ""); expect(investmentFactErrors(latest, "single", 2025)).toHaveProperty("brokerage-0-0-basisReportedToIRS");
    await change(source, "Was the actual cost basis reported to the IRS?", "false");
    await change(source, "Proceeds (sale price)", "0"); await change(source, "Cost basis (purchase price)", "0.01");
    await change(source, "Have you checked these sale classifications against the actual source records?", "true");
    expect(investmentFactErrors(latest, "single", 2025)).toEqual({});
    expect(buildBrokerageInputs(latest.brokerageEntries)[0].transactions[0]).toMatchObject({ proceeds: "0", costBasis: "0.01", digitalAsset: true, basisReportedToIRS: false });
    await change(source, "Other Form 8949 adjustment amount", "-0.01"); expect(latest.brokerageEntries[0].transactions[0].adjustments).toBe("-0.01"); expect(investmentFactErrors(latest, "single", 2025)).toHaveProperty("brokerage-0-0-adjustments");
    await click("+ Add another transaction", source); expect(latest.brokerageEntries[0].transactions[1]).toMatchObject({ holdingPeriod: "", digitalAsset: null, basisReportedToIRS: null });
    const remove = source.querySelector<HTMLButtonElement>('button[aria-label^="Remove transaction #2"]'); if (!remove) throw new Error("Missing removal"); await act(async () => remove.click()); expect(latest.brokerageEntries[0].transactions).toHaveLength(1);
    await click("+ Add another 1099-B"); await click("Remove", card("1099-B #2")); expect(latest.brokerageEntries).toHaveLength(1);
  });
});
