// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml, child-credit-identity and required-source-facts
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SectionPersonalInfo } from "@/components/guided-interview/section-personal-info";
import { HouseholdSourceDetails } from "@/components/guided-interview/household-source-details";
import { DeductionSourceDetails } from "@/components/guided-interview/deduction-source-details";
import { VehicleSourceDetails } from "@/components/guided-interview/vehicle-source-details";
import { AdoptionSourceDetails } from "@/components/guided-interview/adoption-source-details";
import { EducationSourceDetails } from "@/components/guided-interview/education-source-details";
import { buildEducationInput } from "@/lib/guided-interview-bridge";
import { buildAdoptionInput, type AdoptionCreditData } from "@/lib/guided-adoption-facts";
import { buildVehicleCreditInput, type VehicleCreditData } from "@/lib/guided-vehicle-facts";
import { buildDonationsInput, buildForm1098Inputs, buildScheduleHInput } from "@/lib/guided-interview-bridge";
import { personalFactErrors } from "@/lib/guided-taxpayer-facts";
import { emptyCreditsData, emptyEducationCreditData, emptyDeductionData, emptyOtherTaxesData, type EducationCreditData, type DeductionData, type OtherTaxesData, type PersonalInfoData } from "@/lib/guided-interview-flow";
import { completeAocEligibility, completeEducationClaimant, completeDependent, completePersonalInfo } from "../../guided-interview/complete-facts";

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
  it("records AOTC history and support facts and permits clearing an obsolete refundable answer", async () => {
    let latest: EducationCreditData = { ...emptyEducationCreditData, ...completeEducationClaimant, refundableAocEligible: false, aocStudents: [{ ...completeAocEligibility, name: "Jordan Example", qualifiedExpenses: "4000", priorYearsClaimed: "0", requiresPriorYearsConfirmation: true }] };
    function Harness() { const [data, setData] = useState(latest); return <EducationSourceDetails data={data} taxYear={2026} filingStatus="mfj" onChange={next => { latest = next; setData(next); }} />; }
    await act(async () => root.render(<Harness />));
    expect(control("Prior years AOTC was claimed").value).toBe("");
    await change("Prior years AOTC was claimed", "1");
    await change("Completed the first four years of postsecondary education before this tax year", "true");
    await change("Enrolled at least half-time for at least one academic period", "false");
    await change("Pursuing a degree or recognized education credential", "false");
    await change("Had a felony drug conviction by the end of the tax year", "true");
    await change("AOTC institution EIN from the actual institution record", "12-3456789");
    await change("Is an AOTC ban from a prior claim in effect?", "false");
    await change("Is Form 8862 required because of a prior AOTC disallowance?", "true");
    await change("Has the required Form 8862 been completed?", "false");
    await change("Were you a full-time student for the refundable AOTC test?", "false");
    await change("Was at least one of your parents alive at year end?", "false");
    await change("Your earned income for the refundable AOTC support test", "0");
    await change("Your total support for the refundable AOTC test", "9007199254740993.01");
    await change("Saved refundable AOTC answer (clear to use actual age and support facts)", "");
    await change("Were you a nonresident alien during the tax year?", "true");
    await change("Did you make the qualifying resident joint-return election?", "false");
    await change("Was your spouse's employment-valid SSN issued by the return due date for education credits?", "true");
    const result = buildEducationInput({ ...emptyCreditsData, education: latest }, 2026, "mfj", completePersonalInfo);
    expect(result).toMatchObject({ residentJointElection: false, form8862Completed: false, refundableAocFacts: { fullTimeStudent: false, parentAlive: false, earnedIncome: "0", totalSupport: "9007199254740993.01" }, aocStudents: [{ priorYearsClaimed: 1, felonyDrugConviction: true, enrolledAtLeastHalfTime: false }] });
    expect(result?.refundableAocEligible).toBeUndefined();
    await click("Remove AOTC student 1");
    await click("Add AOTC student");
    expect(control("Prior years AOTC was claimed").value).toBe("");
    expect(() => buildEducationInput({ ...emptyCreditsData, education: latest }, 2026, "mfj", completePersonalInfo)).toThrow();
  });
  it("collects an individual LLC student and actual institution without inventing aggregate eligibility", async () => {
    let latest: EducationCreditData = { ...emptyEducationCreditData, llcExpenses: "0.10" };
    function Harness() { const [data, setData] = useState(latest); return <EducationSourceDetails data={data} taxYear={2026} filingStatus="single" onChange={next => { latest = next; setData(next); }} />; }
    await act(async () => root.render(<Harness />)); await click("Add LLC student");
    expect(() => buildEducationInput({ ...emptyCreditsData, education: latest }, 2026, "single", completePersonalInfo)).toThrow();
    for (const [label, value] of [
      ["Student name", "Jordan Example"], ["Student's actual SSN, ITIN or ATIN", "111-22-3333"], ["Student's household role", "primary"], ["Qualified tuition & expenses", "0.10"],
      ["Is the institution eligible for the education credit?", "true"], ["Are actual payment timing, eligible costs and coordination with other education benefits confirmed?", "true"], ["Is the Form 1098-T requirement or a documented IRS exception satisfied?", "true"], ["Was the student's employment-valid SSN issued by the return due date?", "true"], ["Was the student's SSN, ITIN or ATIN issued by the return due date?", "true"], ["Are these postsecondary courses or courses to acquire or improve job skills?", "false"],
      ["Can another taxpayer claim you as a dependent?", "true"], ["Does another taxpayer actually claim you as a dependent on their return?", "false"], ["Were you a nonresident alien during the tax year?", "false"], ["Was your employment-valid SSN issued by the return due date for education credits?", "true"], ["Education MAGI Puerto Rico / American Samoa exclusion", "0"],
    ]) await change(label, value);
    await click("Add institution");
    await change("Institution name", "Actual College"); await change("Institution mailing address", "100 College Rd, Columbus OH 43215");
    await change("Institution EIN (required for AOTC or a received Form 1098-T)", "12-3456789");
    await change("Did this student receive a current-year Form 1098-T from this institution?", "false");
    await change("Did this student receive a prior-year Form 1098-T with box 7 checked?", "true");
    const result = buildEducationInput({ ...emptyCreditsData, education: latest }, 2026, "single", completePersonalInfo);
    expect(result).toMatchObject({ canBeClaimedAsDependent: true, claimedAsDependent: false, llcExpenses: "0.10", llcStudents: [{ courseEligibilityConfirmed: false, institutions: [{ receivedCurrentYear1098T: false, receivedPriorYear1098TWithBox7: true }] }] });
    await change("Qualified tuition & expenses", "0.20");
    expect(() => buildEducationInput({ ...emptyCreditsData, education: latest }, 2026, "single", completePersonalInfo)).toThrow(/reconcile/i);
    await change("Saved Lifetime Learning total to reconcile", "");
    expect(buildEducationInput({ ...emptyCreditsData, education: latest }, 2026, "single", completePersonalInfo)?.llcExpenses).toBe("0.2");
    await click("Remove institution 1");
    expect(() => buildEducationInput({ ...emptyCreditsData, education: latest }, 2026, "single", completePersonalInfo)).toThrow(/institution/i);
    await click("Remove LLC student 1"); expect(buildEducationInput({ ...emptyCreditsData, education: latest }, 2026, "single", completePersonalInfo)).toBeUndefined();
  });
  it("requires reconfirmation after editing annual adoption expenses and carries actual child identity", async () => {
    let latest: AdoptionCreditData = { children: [] };
    function Harness() { const [data, setData] = useState(latest); return <AdoptionSourceDetails data={data} onChange={(next) => { latest = next; setData(next); }} />; }
    await act(async () => root.render(<Harness />));
    await click("Add adopted child");
    expect(() => buildAdoptionInput(latest, 2026, "single")).toThrow();
    for (const [label, value] of [
      ["Child's actual first name", "Sam"], ["Child's actual last name", "Example"], ["Child's actual birth year", "2020"], ["Child's SSN, ATIN or ITIN", "123-45-6789"],
      ["Was the child physically or mentally incapable of self-care?", "false"], ["Is this a foreign adoption under the IRS rules?", "false"], ["Does the child have the required special-needs determination?", "false"], ["Was this adoption finalized by the end of this tax year?", "true"], ["Actual year the adoption became final", "2026"],
      ["Current-year employer adoption benefits for this child", "0"], ["Prior adoption credit limit already used for this child", "0"], ["Prior employer-benefit exclusion limit already used for this child", "0"], ["Does the employer adoption assistance plan meet the IRS qualification requirements?", "false"],
      ["Do actual records establish taxpayer, child and expense eligibility under Form 8839?", "true"], ["Adoption MAGI foreign earned income exclusion", "0"], ["Adoption MAGI foreign housing exclusion", "0"], ["Adoption MAGI Puerto Rico / American Samoa exclusion", "0"], ["Have all prior adoption-credit carryforwards been reviewed, including none if applicable?", "true"],
    ]) await change(label, value);
    await click("Add expense year for child 1");
    await change("Expense year 1", "2025");
    await change("Qualified unreimbursed expenses 1", "9007199254740993.01");
    await change("Is the complete unreimbursed expense history confirmed, including no expenses if applicable?", "true");
    expect(buildAdoptionInput(latest, 2026, "single")?.children[0]).toMatchObject({ childFirstName: "Sam", childBirthYear: 2020, childPermanentlyDisabled: false, employerBenefits: "0", expensesByYear: [{ year: 2025, amount: "9007199254740993.01" }] });
    await change("Qualified unreimbursed expenses 1", "0.20");
    expect(control("Is the complete unreimbursed expense history confirmed, including no expenses if applicable?").value).toBe("");
    expect(() => buildAdoptionInput(latest, 2026, "single")).toThrow();
    await click("Remove expense year 1");
    await change("Is the complete unreimbursed expense history confirmed, including no expenses if applicable?", "true");
    await click("Add adoption carryforward");
    await change("Carryforward origin year 1", "2025");
    await change("Unused adoption credit 1", "100.01");
    await change("Have all prior adoption-credit carryforwards been reviewed, including none if applicable?", "true");
    expect(() => buildAdoptionInput(latest, 2026, "single")).toThrow();
    await change("Do carryforwards reconcile to the corrected 2025 refundable-credit worksheet?", "true");
    expect(buildAdoptionInput(latest, 2026, "single")?.carryforwards).toEqual([{ originTaxYear: 2025, amount: "100.01" }]);
    await click("Remove adoption carryforward 1");
    expect(latest.carryforwardHistoryConfirmed).toBeNull();
    await change("Is this a foreign adoption under the IRS rules?", "true");
    expect(control("Prior-year foreign-adoption employer benefits").value).toBe("");
    await change("Prior-year foreign-adoption employer benefits", "0");
    await click("Remove adopted child 1");
    expect(buildAdoptionInput(latest, 2026, "single")).toBeUndefined();
  });
  it("collects an actual transferred vehicle with zero prior AGI and never fills unknown price facts", async () => {
    let latest: VehicleCreditData = { entries: [] };
    function Harness() { const [data, setData] = useState(latest); return <VehicleSourceDetails data={data} filingStatus="mfj" onChange={(next) => { latest = next; setData(next); }} />; }
    await act(async () => root.render(<Harness />));
    await click("Add vehicle");
    expect(() => buildVehicleCreditInput(latest, 2026, "mfj")).toThrow();
    await change("Vehicle purchase category", "used");
    await change("Vehicle owner claiming the credit", "spouse");
    await change("Vehicle identification number (VIN)", "1HGCM82633A004352");
    await change("Actual vehicle acquisition date", "2025-09-30");
    await change("Date you took possession (placed in service)", "2026-01-02");
    await change("Written binding contract date", "2025-09-29");
    await change("Date a payment was made under the contract", "2025-09-30");
    await change("Do actual records establish a binding written contract and qualifying payment?", "true");
    await change("Did you receive the seller report accepted by IRS Energy Credits Online?", "true");
    await change("Credit amount on the accepted seller report", "4000");
    await change("Do actual records establish all applicable vehicle and buyer eligibility requirements?", "false");
    await change("Actual personal-use percentage (0–100)", "100");
    await change("Actual previously owned vehicle sale price", "20000.01");
    await change("Did you elect to transfer this credit to the dealer?", "true");
    await change("Actual amount transferred to the dealer", "4000");
    await change("Was the vehicle resold within 30 days?", "false");
    await change("Was the vehicle returned to the seller within 30 days?", "true");
    await change("Was the seller report updated and the transferred credit reconciled with the dealer?", "true");
    await change("Current-year foreign earned income exclusion", "0");
    await change("Current-year foreign housing deduction", "0");
    await change("Current-year Puerto Rico / American Samoa exclusion", "0");
    await change("Are all current-year vehicle MAGI adjustments confirmed from actual records?", "true");
    await change("Prior-year adjusted gross income (optional if unknown)", "0");
    expect(() => buildVehicleCreditInput(latest, 2026, "mfj")).toThrow();
    await change("Actual prior-year filing status", "mfj");
    await change("Prior-year foreign earned income exclusion", "0");
    await change("Prior-year foreign housing deduction", "0");
    await change("Prior-year Puerto Rico / American Samoa exclusion", "0");
    await change("Are all prior-year vehicle MAGI adjustments confirmed from actual records?", "true");
    expect(buildVehicleCreditInput(latest, 2026, "mfj")).toMatchObject({ priorYearAgi: "0", previouslyOwnedCleanVehicles: [{ owner: "spouse", salePrice: "20000.01", eligibilityConfirmed: false, sellerReportUpdatedForReturn: true }] });
    await change("Vehicle purchase category", "new");
    expect(control("Actual manufacturer suggested retail price").value).toBe("");
    expect(() => buildVehicleCreditInput(latest, 2026, "mfj")).toThrow();
    await click("Remove vehicle 1");
    expect(buildVehicleCreditInput(latest, 2026, "mfj")).toBeUndefined();
  });
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
