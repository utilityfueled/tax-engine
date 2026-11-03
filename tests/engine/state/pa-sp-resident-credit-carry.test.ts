/** Spec: spec/state/pa-sp-resident-credit-carry.yaml.
 * Explicitly fictional 2025 legacy arithmetic conditions, not source qualification.
 * Official SP13 carries PA40 line22; raw foreign-state tax is not that line.
 */
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { calculatePANonresidentReturn } from "@/engine/state/pa-nonresident-orchestrator.js";
import type { OtherStateCredit } from "@/engine/state/pa-schedule-g-l.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (value: string) => new Decimal(value);
function makeInput(): TaxYearInput {
  return {
    taxpayer: {
      taxYear: 2025, filingStatus: "married_filing_jointly",
      primary: { firstName: "Synthetic", lastName: "SP", ssn: "000-00-0001", dateOfBirth: "1985-01-01" },
      spouse: { firstName: "Fictional", lastName: "SP", ssn: "000-00-0002", dateOfBirth: "1986-01-01" },
      address: { street: "1 Fictional St", city: "Harrisburg", state: "PA", zip: "17101" },
      dependents: [],
    },
    w2s: [{ employer: "Fictional Employer", wages: "14000", federalWithheld: "500",
      stateWages: "14000", stateTaxWithheld: "430", state: "PA" }],
    form1099Int: [], form1099Div: [], form1099B: [], form1099Nec: [],
    form1099Misc: [], form1099G: [], formW2G: [], form1099K: [], form1099C: [],
    scheduleK1: [], form1098: [], form1095A: [], donations: [], rentalProperties: [],
    savingsBondRedemptions: [], form6252: [], form8814: [], homeSales: [],
  };
}
function nyCredit(paid = "200", shared = "5000"): OtherStateCredit {
  // Supplied final NY tax on the same eligible compensation; not W2 withholding.
  return { stateCode: "NY", incomeClass: "compensation",
    incomeTaxableByBothStates: d(shared), taxPaidToOtherState: d(paid) };
}
function partYear(paid: string) {
  // Synthetic legacy arithmetic: all annual wages are in the PA-resident period;
  // there is no outside-period income. No payroll/residency originals are qualified.
  return calculatePANonresidentReturn(makeInput(), {
    residencyStatus: "part_year", paTaxableCompensation: d("14000"),
    otherStateCredits: [nyCredit(paid)], otherCredits: d("50"),
  });
}

describe("PA Schedule SP printed resident-credit carry", () => {
  it("resident SP line13 uses the allowed resident credit rather than raw paid tax", () => {
    const input = makeInput(); const before = JSON.stringify(input);
    const result = calculatePAReturn(input, { otherStateCredits: [nyCredit()], otherCredits: d("50") });
    expect.soft(result.pa40.taxLiability.toFixed()).toBe("430");
    expect.soft(result.scheduleGL.totalCredit.toFixed()).toBe("154");
    expect.soft(result.pa40.residentCredit.toFixed()).toBe("154");
    expect.soft(result.scheduleSP.taxPaidToOtherStates.toFixed()).toBe("154");
    expect.soft(result.scheduleSP.taxLiabilityAfterOtherStateTaxes.toFixed()).toBe("276");
    expect.soft(result.scheduleSP.forgivenessPercentage.toFixed()).toBe("60");
    expect.soft(result.scheduleSP.taxForgivenessCredit.toFixed()).toBe("166");
    expect.soft(result.pa40.totalCredits.toFixed()).toBe("370");
    expect.soft(result.pa40.netTaxLiability.toFixed()).toBe("60");
    expect.soft(JSON.stringify(input)).toBe(before);
  });
  it("statement precedence carries the selected PA40 resident credit into SP", () => {
    const input = makeInput();
    input.paScheduleGLStatements = [{ stateCode: "NY", incomeTaxableByBothStates: "5000", taxPaidToOtherState: "200" }];
    const result = calculatePAReturn(input, { otherStateCredits: [nyCredit("80")] });
    expect(result.scheduleGL.totalCredit.toFixed()).toBe("154");
    expect(result.scheduleSP.taxPaidToOtherStates.toFixed()).toBe("154");
    expect(result.scheduleSP.taxForgivenessCredit.toFixed()).toBe("166");
  });
  it("resident credit below the PA cap carries the actual limited amount", () => {
    const result = calculatePAReturn(makeInput(), { otherStateCredits: [nyCredit("80")], otherCredits: d("50") });
    expect(result.scheduleGL.totalCredit.toFixed()).toBe("80");
    expect(result.scheduleSP.taxPaidToOtherStates.toFixed()).toBe("80");
    expect(result.scheduleSP.taxLiabilityAfterOtherStateTaxes.toFixed()).toBe("350");
    expect(result.scheduleSP.taxForgivenessCredit.toFixed()).toBe("210");
    expect(result.pa40.totalCredits.toFixed()).toBe("340");
    expect(result.pa40.netTaxLiability.toFixed()).toBe("90");
  });
  it("raw tax above the PA cap cannot reduce forgiveness further", () => {
    const result = calculatePAReturn(makeInput(), { otherStateCredits: [nyCredit("800")], otherCredits: d("50") });
    expect(result.scheduleGL.totalCredit.toFixed()).toBe("154");
    expect(result.scheduleSP.taxPaidToOtherStates.toFixed()).toBe("154");
    expect(result.scheduleSP.taxForgivenessCredit.toFixed()).toBe("166");
    expect(result.pa40.totalCredits.toFixed()).toBe("370");
    expect(result.pa40.netTaxLiability.toFixed()).toBe("60");
  });
  it("SP uses the final total resident credit after the whole-return cap", () => {
    const result = calculatePAReturn(makeInput(), { otherStateCredits: [nyCredit("1000", "30000")] });
    expect(result.scheduleGL.totalCreditBeforeCap.toFixed()).toBe("921");
    expect(result.pa40.residentCredit.toFixed()).toBe("430");
    expect(result.scheduleSP.taxPaidToOtherStates.toFixed()).toBe("430");
    expect(result.scheduleSP.taxLiabilityAfterOtherStateTaxes.toFixed()).toBe("0");
    expect(result.scheduleSP.taxForgivenessCredit.toFixed()).toBe("0");
  });
  it("zero resident credit preserves the existing forgiveness calculation", () => {
    const result = calculatePAReturn(makeInput(), { otherCredits: d("50") });
    expect(result.scheduleSP.taxPaidToOtherStates.toFixed()).toBe("0");
    expect(result.scheduleSP.taxForgivenessCredit.toFixed()).toBe("258");
    expect(result.pa40.totalCredits.toFixed()).toBe("308");
    expect(result.pa40.netTaxLiability.toFixed()).toBe("122");
  });
  it("part-year SP line13 uses the resident credit after the PA cap", () => {
    const result = partYear("200");
    expect(result.scheduleGL.totalCredit.toFixed()).toBe("154");
    expect(result.scheduleSP.taxPaidToOtherStates.toFixed()).toBe("154");
    expect(result.scheduleSP.taxLiabilityAfterOtherStateTaxes.toFixed()).toBe("276");
    expect(result.scheduleSP.taxForgivenessCredit.toFixed()).toBe("166");
    expect(result.pa40.totalCredits.toFixed()).toBe("370");
    expect(result.pa40.netTaxLiability.toFixed()).toBe("60");
  });
  it("part-year SP preserves a credit below the PA cap", () => {
    const result = partYear("80");
    expect(result.scheduleSP.taxPaidToOtherStates.toFixed()).toBe("80");
    expect(result.scheduleSP.taxForgivenessCredit.toFixed()).toBe("210");
    expect(result.pa40.totalCredits.toFixed()).toBe("340");
    expect(result.pa40.netTaxLiability.toFixed()).toBe("90");
  });
  it("nonresident entries remain ignored and SP line13 stays zero", () => {
    const result = calculatePANonresidentReturn(makeInput(), {
      residencyStatus: "nonresident", paTaxableCompensation: d("14000"), otherStateCredits: [nyCredit()],
    });
    expect(result.scheduleGL.totalCredit.toFixed()).toBe("0");
    expect(result.scheduleSP.taxPaidToOtherStates.toFixed()).toBe("0");
    expect(result.pa40.residentCredit.toFixed()).toBe("0");
    expect(result.scheduleSP.taxForgivenessCredit.toFixed()).toBe("258");
  });
  it("SP carries the sum of allowed state credits rather than summed raw taxes", () => {
    const result = calculatePAReturn(makeInput(), { otherStateCredits: [
      nyCredit("100", "1000"), { ...nyCredit("100", "2000"), stateCode: "DE" },
    ], otherCredits: d("50") });
    expect(result.scheduleGL.totalCredit.toFixed()).toBe("92");
    expect(result.scheduleSP.taxPaidToOtherStates.toFixed()).toBe("92");
    expect(result.scheduleSP.taxLiabilityAfterOtherStateTaxes.toFixed()).toBe("338");
    expect(result.scheduleSP.taxForgivenessCredit.toFixed()).toBe("203");
    expect(result.pa40.totalCredits.toFixed()).toBe("345");
    expect(result.pa40.netTaxLiability.toFixed()).toBe("85");
  });
  it("reciprocal employee credit rejection remains unchanged", () => {
    expect(() => calculatePAReturn(makeInput(), { otherStateCredits: [{ ...nyCredit(), stateCode: "NJ" }] }))
      .toThrow(/reciprocal employee tax requires refund/);
  });
});
