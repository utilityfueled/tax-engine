// Spec: spec/federal/guided-input.yaml, child-credit-identity
import { describe, expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { personalFactErrors } from "@/lib/guided-taxpayer-facts";
import { type PersonalInfoData } from "@/lib/guided-interview-flow";
import { completeDependent, completePersonalInfo, startCompleteInterview } from "./complete-facts";

function actualFacts(): PersonalInfoData {
  return { ...completePersonalInfo, employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true,
    childTaxCredit: { bonaFidePuertoRicoResident: false, possessionIncomeExclusion: "0", nonTaxableCombatPayElection: "0" },
    dependentCount: "1", dependents: [{ ...completeDependent, ctcSsnEligible: true, odcTinEligible: true }] };
}
function input(facts: PersonalInfoData, year: number, status: "single" | "mfj" = "single") {
  const state = startCompleteInterview({ filingStatus: status, incomeTypes: [], lifeEvents: [], stateCode: "OH" });
  return buildTaxInputFromGuidedData({ ...state, taxYear: year, sectionData: { "personal-info": facts } });
}
describe("guided child credit identity facts", () => {
  it("requires actual identity facts for claimed child credits in either guided year", () => {
    for (const year of [2025, 2026]) {
      const facts = actualFacts();
      expect(input(facts, year)).not.toBeNull();
      for (const incomplete of [
        { ...facts, employmentValidSsnIssuedByDueDate: undefined },
        { ...facts, dependents: [{ ...completeDependent, ctcSsnEligible: undefined }] },
        { ...facts, childTaxCredit: undefined },
        { ...facts, childTaxCredit: { ...facts.childTaxCredit, possessionIncomeExclusion: "" } },
      ]) expect(input(incomplete, year)).toBeNull();
    }
  });
  it("forwards known false and exact possession amounts without converting eligibility", () => {
    const facts = actualFacts();
    facts.employmentValidSsnIssuedByDueDate = false;
    facts.tinIssuedByDueDate = false;
    facts.dependents![0]!.ctcSsnEligible = false;
    facts.childTaxCredit = { bonaFidePuertoRicoResident: false, puertoRicoExcludedIncome: "9007199254740993.00", form4563ExcludedIncome: "0.01", nonTaxableCombatPayElection: "0" };
    const result = input(facts, 2026);
    expect(result?.taxpayer.primary).toMatchObject({ employmentValidSsnIssuedByDueDate: false, tinIssuedByDueDate: false });
    expect(result?.taxpayer.dependents[0]).toMatchObject({ qualifiesForCTC: true, ctcSsnEligible: false, qualifiesForODC: false });
    expect(result?.childTaxCredit).toEqual({ ...facts.childTaxCredit, puertoRicoExcludedIncome: "9007199254740993", possessionIncomeExclusion: "9007199254740993.01" });
    expect(input({ ...facts, childTaxCredit: { ...facts.childTaxCredit, possessionIncomeExclusion: "-1" } }, 2026)).toBeNull();
  });
  it("requires the other joint filer's actual timely TIN and keeps ODC separate", () => {
    const facts = actualFacts();
    facts.spouse = { ...facts.spouse!, employmentValidSsnIssuedByDueDate: false, tinIssuedByDueDate: true };
    expect(input(facts, 2026, "mfj")?.taxpayer.spouse?.tinIssuedByDueDate).toBe(true);
    expect(input({ ...facts, spouse: { ...facts.spouse, tinIssuedByDueDate: undefined } }, 2026, "mfj")).toBeNull();
    facts.dependents = [{ ...completeDependent, qualifiesForCTC: false, qualifiesForODC: true, odcTinEligible: false }];
    facts.childTaxCredit = { possessionIncomeExclusion: "0" };
    expect(input(facts, 2026, "mfj")?.taxpayer.dependents[0]?.odcTinEligible).toBe(false);
    expect(personalFactErrors({ ...facts, tinIssuedByDueDate: false }, "mfj", 2026)).toHaveProperty("primaryIdentity");
  });
});
