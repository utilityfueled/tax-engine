// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml, child-credit-identity and required-source-facts
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SectionPersonalInfo } from "@/components/guided-interview/section-personal-info";
import { HouseholdSourceDetails } from "@/components/guided-interview/household-source-details";
import { DeductionSourceDetails } from "@/components/guided-interview/deduction-source-details";
import { buildDonationsInput, buildForm1098Inputs, buildScheduleHInput } from "@/lib/guided-interview-bridge";
import { personalFactErrors } from "@/lib/guided-taxpayer-facts";
import { emptyDeductionData, emptyOtherTaxesData, type DeductionData, type OtherTaxesData, type PersonalInfoData } from "@/lib/guided-interview-flow";
import { completeDependent, completePersonalInfo } from "../../guided-interview/complete-facts";

let container: HTMLDivElement;
let root: Root;
function control(label: string): HTMLInputElement | HTMLSelectElement {
  const element = [...container.querySelectorAll("label")].find((entry) => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
  if (!element) throw new Error(`Missing control: ${label}`);
  return element;
}
async function change(label: string, value: string) {
  const element = control(label);
  await act(async () => {
    Object.getOwnPropertyDescriptor(element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
async function click(label: string) {
  const element = [...container.querySelectorAll("button")].find((entry) => entry.textContent?.trim() === label || entry.getAttribute("aria-label") === label);
  if (!element) throw new Error(`Missing button: ${label}`);
  await act(async () => element.click());
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe("required fact interaction boundaries", () => {
  it("records child credit identity as unknown false and true without guessing from an SSN", async () => {
    let latest: PersonalInfoData = { ...completePersonalInfo, employmentValidSsnIssuedByDueDate: null, tinIssuedByDueDate: null, childTaxCredit: undefined, dependentCount: "1", dependents: [{ ...completeDependent, ctcSsnEligible: null }] };
    function Harness() { const [data, setData] = useState(latest); return <SectionPersonalInfo data={data} filingStatus="mfj" onDataChange={(next) => { latest = next; setData(next); }} />; }
    await act(async () => root.render(<Harness />));
    expect(Object.keys(personalFactErrors(latest, "mfj", 2026))).toContain("dependent-0-ctcSsn");
    await change("Was your employment-valid SSN issued by the return due date, including extensions?", "false");
    await change("Was your SSN or ITIN issued by the return due date, including extensions?", "true");
    await change("Does this child meet the timely employment-valid SSN requirement (or documented born-and-died exception)?", "false");
    await change("Were you a bona fide resident of Puerto Rico during the tax year?", "false");
    await change("Puerto Rico income excluded from federal income", "0");
    await change("American Samoa income excluded on Form 4563", "0");
    await change("Nontaxable combat pay elected for the additional child credit", "0.10");
    expect(latest).toMatchObject({ employmentValidSsnIssuedByDueDate: false, tinIssuedByDueDate: true, childTaxCredit: { bonaFidePuertoRicoResident: false, puertoRicoExcludedIncome: "0", form4563ExcludedIncome: "0", nonTaxableCombatPayElection: "0.10" } });
    expect(personalFactErrors(latest, "mfj", 2026)).toEqual({});
    await change("Does this child meet the timely employment-valid SSN requirement (or documented born-and-died exception)?", "");
    expect(latest.dependents?.[0]?.ctcSsnEligible).toBeNull();
    expect(personalFactErrors(latest, "mfj", 2026)).toHaveProperty("dependent-0-ctcSsn");
    await click("Remove dependent 1");
    expect(latest.dependentCount).toBe("0");
    expect(latest.dependents).toEqual([]);
  });

  it("requires the actual household employee and rate period before building Schedule H", async () => {
    let latest: OtherTaxesData = { ...emptyOtherTaxesData };
    function Harness() { const [data, setData] = useState(latest); return <HouseholdSourceDetails data={data} onChange={(next) => { latest = next; setData(next); }} />; }
    await act(async () => root.render(<Harness />));
    await click("Add household employee");
    expect(() => buildScheduleHInput(latest)).toThrow();
    await change("Actual employee name", "Actual Caregiver");
    await change("Employee cash wages", "5000.10");
    await change("Employee federal income tax withheld", "0");
    await change("Employee is your spouse", "false");
    await change("Employee is your child under age 21", "false");
    await change("Employee is your parent", "true");
    await change("Parent cares for your child under 18 or needing adult care for 4 continuous weeks, and you are widowed, divorced and unmarried, or living with a spouse unable to provide that care for 4 continuous weeks", "false");
    await change("Employee is under 18 and household work is not their principal occupation", "false");
    await change("Qualifying household wages reached $1,000 in a calendar quarter of this or the preceding year (FUTA applies)", "true");
    await change("All wages were subject to unemployment tax in one state, paid timely, with no FUTA credit reduction", "false");
    await click("Add state unemployment rate period");
    await change("State abbreviation", "oh");
    await change("Rate period starts", "2025-01-01");
    await change("Rate period ends", "2025-12-31");
    await change("Wages taxable by this state's unemployment fund", "5000.10");
    await change("The state assigned an experience rate for this period", "true");
    await change("State experience rate (%)", "2.7");
    await change("Eligible state contributions paid by the original return due date", "135.00");
    await change("Eligible state contributions paid after the original return due date", "0");
    await change("FUTA credit reduction from the applicable worksheet", "0");
    const payroll = buildScheduleHInput(latest);
    expect(payroll?.employees[0]).toMatchObject({ name: "Actual Caregiver", cashWages: "5000.10", federalIncomeTaxWithheld: "0", isParent: true, parentCareExceptionApplies: false });
    expect(payroll?.futaStatePeriods?.[0]).toMatchObject({ state: "OH", experienceRate: "0.027", contributionsPaidTimely: "135.00" });
    await change("The state assigned an experience rate for this period", "false");
    expect(buildScheduleHInput(latest)?.futaStatePeriods?.[0]?.experienceRate).toBeNull();
    await click("Remove rate period #1");
    expect(() => buildScheduleHInput(latest)).toThrow();
    await click("Remove employee #1");
    expect(latest.householdEmployees).toEqual([]);
  });

  it("reconciles actual mortgage and noncash donation details without inventing a lender or property category", async () => {
    let latest: DeductionData = { ...emptyDeductionData, method: "itemized", mortgageInterest: "0.10", charitableContributions: "0.20" };
    function Harness() { const [data, setData] = useState(latest); return <DeductionSourceDetails data={data} onChange={(next) => { latest = next; setData(next); }} />; }
    await act(async () => root.render(<Harness />));
    expect(latest.mortgageEntries).toBeUndefined();
    expect(control("Mortgage lender").value).toBe("");
    await change("Mortgage lender", "Actual Lender");
    await change("Outstanding mortgage principal (Box 2)", "9007199254740993.01");
    await change("Mortgage origination date (Box 3)", "2020-02-03");
    await change("Donation recipient", "Actual Foundation");
    await change("Donation type", "appreciated_stock");
    await change("Donation date", "2025-05-06");
    await change("Recipient is a private foundation / second-category organization", "true");
    await change("Recipient qualifies under section 170(b)(1)(A) for the 2026 nonitemizer deduction", "false");
    await change("Recipient is a supporting organization", "false");
    await change("Gift was to a donor-advised fund", "false");
    await change("Donated property's cost basis", "0");
    await change("Long-term capital gain property", "true");
    await change("Gift is qualified appreciated stock", "true");
    expect(buildForm1098Inputs(latest)[0]).toMatchObject({ lender: "Actual Lender", outstandingMortgagePrincipal: "9007199254740993.01", mortgageOriginationDate: "2020-02-03" });
    expect(buildDonationsInput(latest)[0]).toMatchObject({ organization: "Actual Foundation", type: "appreciated_stock", amount: "0.20", costBasis: "0", qualifiedAppreciatedStock: true });
    await click("Add donation");
    await click("Remove donation #2");
    expect(latest.charitableContributions).toBe("0.2");
    await click("Remove mortgage #1");
    expect(latest.mortgageInterest).toBe("0");
  });
});
