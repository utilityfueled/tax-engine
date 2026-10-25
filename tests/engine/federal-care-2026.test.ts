// Spec: spec/federal/form-2441.yaml
// Draft constants injected solely for law integration; production 2026 remains unavailable.
import { describe, it, expect, vi } from "vitest";
vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return {...original,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:original.getConstants(year)};
});
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
const make = (care:Record<string,unknown>, taxYear=2026) => TaxYearInputSchema.parse({...simpleW2Fixture,taxpayer:{...simpleW2Fixture.taxpayer,taxYear,filingStatus:"married_filing_jointly",spouse:{firstName:"Synthetic",lastName:"Spouse",ssn:"999-88-7777",dateOfBirth:"1990-01-01"}},w2s:[{...simpleW2Fixture.w2s[0],accountHolder:"primary",wages:"50000"}],dependentCare:{expenses:"6000",qualifyingIndividuals:2,...care}});
const known = {primaryEarnedIncome:"49000",spouseEarnedIncome:"1000",excludedDependentCareBenefits:"0",priorYearExpenseCredit:"0",eligibilityConfirmed:true};
describe("2026 dependent-care facts integration",()=>{
  it("uses actual spouse income and the 2026 rate",()=>{
    const r=calculateFederalTax(make(known));
    expect(r.form2441?.earnedIncomeLimit.toString()).toBe("1000");
    expect(r.form2441?.credit.toString()).toBe("350");
  });
  it("preserves an explicitly zero spouse income",()=>{
    expect(calculateFederalTax(make({...known,spouseEarnedIncome:"0"})).form2441?.credit.toString()).toBe("0");
  });
  it("requires actual taxpayer income rather than a combined wage inference",()=>{
    const {primaryEarnedIncome,...rest}=known;
    expect(()=>calculateFederalTax(make(rest))).toThrow(/primary.*earned income/i);
  });
  it("does not turn unknown excluded benefits into zero",()=>{
    const {excludedDependentCareBenefits,...rest}=known;
    expect(()=>calculateFederalTax(make(rest))).toThrow(/excluded benefits/i);
  });
  it("preserves legacy 2025 calculation when new fields are absent",()=>{
    expect(calculateFederalTax(make({},2025)).form2441?.credit.toString()).toBe("1200");
  });
});
