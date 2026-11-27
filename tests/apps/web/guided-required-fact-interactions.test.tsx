// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml, child-credit-identity and required-source-facts
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SectionPersonalInfo } from "@/components/guided-interview/section-personal-info";
import { HouseholdSourceDetails } from "@/components/guided-interview/household-source-details";
import { DeductionSourceDetails } from "@/components/guided-interview/deduction-source-details";
import { SectionDeductions } from "@/components/guided-interview/section-deductions";
import { VehicleSourceDetails } from "@/components/guided-interview/vehicle-source-details";
import { AdoptionSourceDetails } from "@/components/guided-interview/adoption-source-details";
import { EducationSourceDetails } from "@/components/guided-interview/education-source-details";
import { StandardDeductionSourceDetails } from "@/components/guided-interview/standard-deduction-source-details";
import { buildStandardDeductionFacts, type StandardDeductionData } from "@/lib/guided-standard-deduction-facts";
import { buildEducationInput, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { buildAdoptionInput, type AdoptionCreditData } from "@/lib/guided-adoption-facts";
import { buildVehicleCreditInput, type VehicleCreditData } from "@/lib/guided-vehicle-facts";
import { guidedCommercialScheduleCContext } from "@/lib/guided-commercial-vehicle-schedule-c";
import { buildDonationsInput, buildForm1098Inputs, buildScheduleHInput } from "@/lib/guided-interview-bridge";
import { personalFactErrors } from "@/lib/guided-taxpayer-facts";
import { emptyCreditsData, emptyEducationCreditData, emptyDeductionData, emptyDonationEntry, emptyOtherTaxesData, loadGuidedFlowState, saveGuidedFlowState, updateSectionData, validateSection, type EducationCreditData, type DeductionData, type DonationEntryData, type OtherTaxesData, type PersonalInfoData } from "@/lib/guided-interview-flow";
import { completeAocEligibility, completeBusinessSection, completeEducationClaimant, completeDependent, completePersonalInfo, completeW2Entry, startCompleteInterview } from "../../guided-interview/complete-facts";

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
  it("collects actual deduction death and separate-spouse facts with signed worksheet amounts", async () => {
    let latest: StandardDeductionData = {};
    function Harness() { const [data, setData] = useState(latest); return <StandardDeductionSourceDetails data={data} filingStatus="mfs" onChange={next => { latest = next; setData(next); }} />; }
    await act(async () => root.render(<Harness />));
    for (const [label, value] of [
      ["Were you blind under the IRS standard-deduction definition?", "true"], ["Could another taxpayer claim you as a dependent for the standard deduction?", "true"], ["Did the primary taxpayer die during this tax year?", "true"], ["Actual primary taxpayer death date", "2026-02-01"], ["Were you a dual-status alien during this tax year?", "false"], ["Were you a nonresident alien for the standard-deduction rules?", "false"], ["Is this a short tax year because of an accounting-period change?", "false"], ["Does your spouse itemize deductions on their separate return?", "false"], ["Do you elect the additional age/blindness deduction for an eligible spouse on your separate return?", "true"], ["Was your spouse blind under the IRS standard-deduction definition?", "true"], ["Could another taxpayer claim your spouse as a dependent?", "false"], ["Did your spouse die during this tax year?", "false"], ["Did your spouse have gross income?", "false"], ["Does your spouse file their own return?", "false"], ["Actual dependent earned-income worksheet amount", "-9007199254740993.01"],
    ]) await change(label, value);
    expect(control("Actual dependent earned-income worksheet amount").getAttribute("aria-invalid")).toBeNull();
    expect(buildStandardDeductionFacts(latest, "mfs", 2026, completePersonalInfo)).toMatchObject({ primaryBlind: true, primaryDeathDate: "2026-02-01", spouseDeathDate: null, spouseBlind: true, dependentEarnedIncome: "-9007199254740993.01" });
    await change("Did your spouse die during this tax year?", "true"); await change("Actual spouse death date", "2026-03-01");
    expect(buildStandardDeductionFacts(latest, "mfs", 2026, completePersonalInfo)?.spouseDeathDate).toBe("2026-03-01");
    await change("Did the primary taxpayer die during this tax year?", "false");
    expect(() => buildStandardDeductionFacts(latest, "mfs", 2026, completePersonalInfo)).toThrow(/death|alive/i);
    await change("Actual primary taxpayer death date", "");
    await change("Were you blind under the IRS standard-deduction definition?", "");
    expect(() => buildStandardDeductionFacts(latest, "mfs", 2026, completePersonalInfo)).toThrow();
  });
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
    await click("Confirm 2026 AOTC claimant answers");
    const actualPersonal = { ...completePersonalInfo, standardDeductionFacts: { ...completePersonalInfo.standardDeductionFacts, nonresidentAlien: true, residentJointElection: false } };
    const result = buildEducationInput({ ...emptyCreditsData, education: latest }, 2026, "mfj", actualPersonal);
    expect(result).toMatchObject({ residentJointElection: false, form8862Completed: false, refundableAocFacts: { fullTimeStudent: false, parentAlive: false, earnedIncome: "0", totalSupport: "9007199254740993.01" }, aocStudents: [{ priorYearsClaimed: 1, felonyDrugConviction: true, enrolledAtLeastHalfTime: false }] });
    expect(result?.refundableAocEligible).toBeUndefined();
    await click("Remove AOTC student 1");
    await click("Add AOTC student");
    expect(control("Prior years AOTC was claimed").value).toBe("");
    expect(() => buildEducationInput({ ...emptyCreditsData, education: latest }, 2026, "mfj", completePersonalInfo)).toThrow();
  });
  it("collects an individual LLC student and actual institution without inventing aggregate eligibility", async () => {
    const actualPersonal = { ...completePersonalInfo, standardDeductionFacts: { ...completePersonalInfo.standardDeductionFacts, primaryCanBeClaimedAsDependent: true } };
    let latest: EducationCreditData = { ...emptyEducationCreditData, llcExpenses: "0.10" };
    function Harness() { const [data, setData] = useState(latest); return <EducationSourceDetails data={data} taxYear={2026} filingStatus="single" onChange={next => { latest = next; setData(next); }} />; }
    await act(async () => root.render(<Harness />)); await click("Add LLC student");
    expect(() => buildEducationInput({ ...emptyCreditsData, education: latest }, 2026, "single", actualPersonal)).toThrow();
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
    const result = buildEducationInput({ ...emptyCreditsData, education: latest }, 2026, "single", actualPersonal);
    expect(result).toMatchObject({ canBeClaimedAsDependent: true, claimedAsDependent: false, llcExpenses: "0.10", llcStudents: [{ courseEligibilityConfirmed: false, institutions: [{ receivedCurrentYear1098T: false, receivedPriorYear1098TWithBox7: true }] }] });
    await change("Qualified tuition & expenses", "0.20");
    expect(() => buildEducationInput({ ...emptyCreditsData, education: latest }, 2026, "single", actualPersonal)).toThrow(/reconcile/i);
    await change("Saved Lifetime Learning total to reconcile", "");
    expect(buildEducationInput({ ...emptyCreditsData, education: latest }, 2026, "single", actualPersonal)?.llcExpenses).toBe("0.2");
    await click("Remove institution 1");
    expect(() => buildEducationInput({ ...emptyCreditsData, education: latest }, 2026, "single", actualPersonal)).toThrow(/institution/i);
    await click("Remove LLC student 1"); expect(buildEducationInput({ ...emptyCreditsData, education: latest }, 2026, "single", actualPersonal)).toBeUndefined();
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
  it("keeps the 2026 commercial vehicle originals separate from personal credit fields", async () => {
    let latest: VehicleCreditData = { entries: [] };
    function Harness({ taxYear }: { taxYear: number }) {
      const [data, setData] = useState(latest);
      return <VehicleSourceDetails data={data} taxYear={taxYear} filingStatus="single" onChange={(next) => { latest = next; setData(next); }} />;
    }
    await act(async () => root.render(<Harness taxYear={2026} />));
    await click("Add business-only commercial vehicle");
    expect(control("Commercial vehicle identification number (VIN)").value).toBe("");
    await change("Commercial vehicle identification number (VIN)", "1M8GDM9AXKP042788");
    await change("Commercial vehicle written contract date", "2025-09-29");
    await change("Commercial vehicle written contract record", "Signed order A");
    await change("Commercial vehicle payment date", "2025-09-30");
    await change("Commercial vehicle payment record", "Deposit receipt B");
    await change("Commercial vehicle possession date", "2026-01-02");
    await change("Commercial vehicle possession record", "Delivery receipt C");
    expect(latest).toEqual({ entries: [], commercialOriginal: {
      vin: "1M8GDM9AXKP042788", bindingContractDate: "2025-09-29", bindingContractReference: "Signed order A",
      paymentDate: "2025-09-30", paymentReference: "Deposit receipt B", datePlacedInService: "2026-01-02", placedInServiceReference: "Delivery receipt C",
    } });
    expect(container.textContent).toMatch(/Schedule C.*depreciation.*credit/i);
    expect(container.textContent).toMatch(/For personal clean vehicle credits, use the actual accepted seller report and purchase records and reconcile any transfer election/i);
    expect(container.textContent).not.toMatch(/Vehicle credit MAGI worksheet/i);
    await act(async () => root.render(<Harness taxYear={2025} />));
    expect(container.textContent).toMatch(/belong to 2026/i);
    expect(container.textContent).not.toMatch(/Commercial vehicle possession record/i);
    await click("Remove business-only commercial vehicle");
    expect(latest.commercialOriginal).toBeUndefined();
    expect(container.textContent).not.toMatch(/Add business-only commercial vehicle/i);
  });
  it("confirms the original commercial VIN owner and exact cash ledger in the guided panel", async () => {
    const initial = { ...startCompleteInterview({ filingStatus: "single", incomeTypes: ["self-employment"], lifeEvents: [], stateCode: "OH" }), taxYear: 2026 };
    initial.sectionData["personal-info"] = { ...completePersonalInfo, spouse: undefined };
    initial.sectionData["income-self-employment"] = { ...completeBusinessSection, manualGrossReceipts: "44500.25",
      expenses: { ...completeBusinessSection.expenses, advertising: "125.26", officeExpense: "40.25", supplies: "19.50" },
      businessFacts: { ...completeBusinessSection.businessFacts, scheduleCSourceFacts: { sourceTaxYear: 2026, sourceFactsConfirmed: true, accountHolder: "primary",
        ownerName: "Jordan Example", sourceReference: "Original primary Schedule C", businessNameStatus: "blank_original", businessEINStatus: "not_issued" } },
    };
    let latest = updateSectionData(initial, "credits", { ...emptyCreditsData, vehicles: { entries: [], commercialOriginal: {
      vin: "1M8GDM9AXKP042788", bindingContractDate: "2025-09-29", bindingContractReference: "Signed commercial order A",
      paymentDate: "2025-09-30", paymentReference: "Deposit receipt B", datePlacedInService: "2026-01-02", placedInServiceReference: "Actual delivery record C",
    } } });
    function Harness() {
      const [state, setState] = useState(latest);
      const credits = state.sectionData.credits ?? emptyCreditsData;
      return <VehicleSourceDetails taxYear={2026} filingStatus="single" data={credits.vehicles} scheduleCContext={guidedCommercialScheduleCContext(state)}
        onChange={(vehicles) => { latest = updateSectionData(state, "credits", { ...credits, vehicles }); setState(latest); }} />;
    }
    await act(async () => root.render(<Harness />));
    expect(container.textContent).toContain("$44500.25");
    expect(container.textContent).toContain("$125.26");
    await click("Confirm Schedule C owner and cash ledger");
    expect(latest.sectionData.credits?.vehicles?.commercialOriginal?.scheduleCLink?.reviewedFingerprint).toBeUndefined();
    await change("Original primary taxpayer record", "Filer identity record");
    await change("Original commercial vehicle owner record", "Title owner's VIN record");
    await change("Original Schedule C business activity record", "Business record");
    await change("Original annual cash ledger record", "Complete cash ledger");
    await change("Do the original records show this primary taxpayer and business own the vehicle with this VIN?", "true");
    await change("Do these exact amounts cover the full cash ledger for this business, excluding vehicle costs and other activities?", "true");
    await click("Confirm Schedule C owner and cash ledger");
    expect(container.textContent).toMatch(/Schedule C owner and cash ledger linked.*calculation remains on hold/i);
    expect(latest.sectionData.credits?.vehicles?.commercialOriginal?.scheduleCLink?.reviewedFingerprint).toMatch(/^[0-9a-f]{64}$/u);
    await change("Original annual cash ledger record", "Replacement cash ledger");
    expect(control("Do these exact amounts cover the full cash ledger for this business, excluding vehicle costs and other activities?").value).toBe("");
    expect(latest.sectionData.credits?.vehicles?.commercialOriginal?.scheduleCLink?.reviewedFingerprint).toBeUndefined();
    expect(buildTaxInputFromGuidedData(latest)).toBeNull();
  });
  it("records child credit identity as unknown false and true without guessing from an SSN", async () => {
    let latest: PersonalInfoData = { ...completePersonalInfo, employmentValidSsnIssuedByDueDate: null, tinIssuedByDueDate: null, childTaxCredit: { nonTaxableCombatPayElection: "0.20" }, dependentCount: "1", dependents: [{ ...completeDependent, ctcSsnEligible: null }] };
    function Harness() { const [data, setData] = useState(latest); return <SectionPersonalInfo data={data} filingStatus="mfj" onDataChange={(next) => { latest = next; setData(next); }} />; }
    await act(async () => root.render(<Harness />));
    expect(Object.keys(personalFactErrors(latest, "mfj", 2026))).toContain("dependent-0-ctcSsn");
    await change("Was your employment-valid SSN issued by the return due date, including extensions?", "false");
    await change("Was your SSN or ITIN issued by the return due date, including extensions?", "true");
    await change("Does this child meet the timely employment-valid SSN requirement (or documented born-and-died exception)?", "false");
    await change("Were you a bona fide resident of Puerto Rico during the tax year?", "false");
    await change("Puerto Rico income excluded from federal income", "0");
    await change("American Samoa income excluded on Form 4563", "0");
    await change("Saved nontaxable combat pay to reconcile", "0.10");
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
    await change("Recipient tax category", "private-nonoperating");
    await change("Recipient qualifies for a charitable contribution deduction", "true");
    await change("Recipient is a supporting organization", "false");
    await change("Gift was to a donor-advised fund", "false");
    await change("Donated property's cost basis", "0");
    await change("Long-term capital gain property", "true");
    await change("Gift is qualified appreciated stock", "true");
    expect(latest.mortgageEntries?.[0]).toMatchObject({ lender: "Actual Lender", outstandingPrincipal: "9007199254740993.01", originationDate: "2020-02-03" });
    expect(() => buildForm1098Inputs(latest)).toThrow(); // Actual debt eligibility remains unknown.
    expect(buildDonationsInput(latest)[0]).toMatchObject({ organization: "Actual Foundation", type: "appreciated_stock", amount: "0.20", costBasis: "0", recipientCategory: "private-nonoperating", qualifiedOrganization: true, qualifiedAppreciatedStock: true });
    expect(latest.donationEntries?.[0].isPrivateFoundation).toBeNull();
    await click("Add donation");
    await click("Remove donation #2");
    expect(latest.charitableContributions).toBe("0.2");
    await click("Remove mortgage #1");
    expect(latest.mortgageInterest).toBe("");
  });

  it("retains the restored cash amount and reconfirms consideration after source edits", async () => {
    const gift: DonationEntryData = { ...emptyDonationEntry, type: "cash", organization: "Fictional Dinner Charity",
      amount: "70", date: "2025-02-28", qualifiedOrganization: true, recipientCategory: "fifty-percent" };
    const original = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
    original.sectionData.deductions = { ...emptyDeductionData, method: "itemized", charitableContributions: "70.00", donationEntries: [gift],
      charitableCarryoverSources: { sourceFactsConfirmed: true } };
    const storageKey = { storageKey: "guided-cash-acknowledgment" };
    expect(saveGuidedFlowState(window.localStorage, storageKey, original)).toBe(true);
    const restored = loadGuidedFlowState(window.localStorage, storageKey);
    window.localStorage.removeItem(storageKey.storageKey);
    let latest = restored?.sectionData.deductions ?? emptyDeductionData;
    function Harness() { const [data, setData] = useState(latest); return <DeductionSourceDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
    await act(async () => root.render(<Harness />));
    expect(control("Cash amount").value).toBe("70");
    expect(control("Cash amount basis").value).toBe("");
    expect(latest.charitableCarryoverSources?.sourceFactsConfirmed).toBe(true);
    expect(() => buildDonationsInput(latest, 2025)).toThrow(/gross|net/);
    await change("Cash amount basis", "gross-payment");
    await change("Fair market value of goods or services", "40");
    await change("Did you intend to contribute the excess as a gift?", "true");
    expect(buildDonationsInput(latest, 2025)[0].amount).toBe("30");
    expect(latest.charitableContributions).toBe("70.00");
    expect(latest.charitableCarryoverSources?.sourceFactsConfirmed).toBeNull();
    await change("Fair market value of goods or services", "41");
    expect(control("Did you intend to contribute the excess as a gift?").value).toBe("");
    expect(() => buildDonationsInput(latest, 2025)).toThrow(/intend/);
    await change("Donation date", "2025-03-01");
    expect(control("Fair market value of goods or services").value).toBe("");
    await change("Donation type", "property");
    await change("Donation type", "cash");
    expect(control("Cash amount basis").value).toBe("");
    expect(latest.donationEntries?.[0]).toMatchObject({ amount: "70", cashAmountBasis: null });
  });

  it.each(["cash", "appreciated_stock"] as const)("reconfirms 2026 donation eligibility after a saved recipient changes (%s)", async type => {
    let state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    state.taxYear = 2026;
    state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "100000", federalWithheld: "10000" }] };
    const stock = type === "appreciated_stock";
    const recipientCategory = stock ? "private-nonoperating" : "fifty-percent";
    const original: DonationEntryData = {
      ...emptyDonationEntry, organization: "Fictional Original Recipient", type, amount: "750.01", date: "2026-06-04",
      costBasis: stock ? "0" : "", isLongTermCapitalGain: stock ? true : null,
      recipientCategory, isPrivateFoundation: stock,
      qualifiedOrganization: true, supportingOrganization: false, donorAdvisedFund: false,
      ...(stock ? { qualifiedAppreciatedStock: true } : { cashAmountBasis: "net-contribution" }),
    };
    state.sectionData.deductions = { ...emptyDeductionData, method: "standard", charitableContributions: original.amount, donationEntries: [original] };

    const render = () => root.render(<SectionDeductions data={state.sectionData.deductions} filingStatus={state.segmentation.filingStatus} taxYear={state.taxYear}
      onDataChange={data => { state = updateSectionData(state, "deductions", data); render(); }} />);
    await act(async () => render());

    const equivalentName = `  ${original.organization}  `;
    await change("Donation recipient", equivalentName);
    expect(state.sectionData.deductions?.donationEntries).toEqual([{ ...original, organization: equivalentName }]);
    expect(buildTaxInputFromGuidedData(state)?.donations?.[0]).toMatchObject({ organization: original.organization, amount: "750.01", supportingOrganization: false, donorAdvisedFund: false });

    const newName = "Fictional Different Recipient";
    await change("Donation recipient", newName);
    const storageKey = { storageKey: `guided-donation-edit-${type}` };
    expect(saveGuidedFlowState(window.localStorage, storageKey, state)).toBe(true);
    const saved = loadGuidedFlowState(window.localStorage, storageKey);
    window.localStorage.removeItem(storageKey.storageKey);
    if (!saved) throw new Error("Expected the saved donation edit to reopen.");
    state = saved;
    await act(async () => render());

    expect(state.taxYear).toBe(2026);
    expect(state.sectionData.deductions?.donationEntries).toEqual([{
      ...original, organization: newName, isPrivateFoundation: null, recipientCategory: null,
      qualifiedOrganization: null, supportingOrganization: null, donorAdvisedFund: null, qualifiedAppreciatedStock: null,
      ...(stock ? {} : { cashAmountBasis: null }),
    }]);
    expect(state.sectionData.deductions?.charitableContributions).toBe("750.01");
    expect(control("Recipient qualifies for a charitable contribution deduction").value).toBe("");
    expect(validateSection(state, "deductions").status).toBe("partial");
    expect(buildTaxInputFromGuidedData(state)).toBeNull();

    await change("Recipient tax category", recipientCategory);
    await change("Recipient qualifies for a charitable contribution deduction", "true");
    await change("Recipient is a supporting organization", String(!stock));
    await change("Gift was to a donor-advised fund", "false");
    if (stock) await change("Gift is qualified appreciated stock", "false");
    else await change("Cash amount basis", "net-contribution");
    expect(validateSection(state, "deductions").status).toBe("complete");
    expect(buildTaxInputFromGuidedData(state)?.donations?.[0]).toMatchObject({
      organization: newName, type, amount: "750.01", dateOfDonation: "2026-06-04", recipientCategory,
      qualifiedOrganization: true, supportingOrganization: !stock, donorAdvisedFund: false,
      ...(stock ? { costBasis: "0", isLongTermCapitalGain: true, qualifiedAppreciatedStock: false } : {}),
    });
  });
});
