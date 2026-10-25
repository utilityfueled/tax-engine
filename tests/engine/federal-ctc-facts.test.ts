// Spec: spec/federal/form-8812.yaml; draft constant injection never opens production 2026.
import { describe,it,expect,vi } from "vitest";
vi.mock("@/models/constants.js",async(importOriginal)=>{
  const original=await importOriginal<typeof import("@/models/constants.js")>();
  const {FEDERAL_2026_CONSTANTS}=await import("@/models/federal-2026-indexed.js");
  return {...original,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:original.getConstants(year)};
});
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
const child={firstName:"Synthetic",lastName:"Child",ssn:"999-88-7777",relationship:"child",dateOfBirth:"2018-03-02",monthsLivedWithYou:12,qualifiesForCTC:true,ctcSsnEligible:true};
const fixture=(overrides:Record<string,unknown>={})=>TaxYearInputSchema.parse({...simpleW2Fixture,childTaxCredit:{bonaFidePuertoRicoResident:false,possessionIncomeExclusion:"0"},taxpayer:{...simpleW2Fixture.taxpayer,taxYear:2026,primary:{...simpleW2Fixture.taxpayer.primary,employmentValidSsnIssuedByDueDate:true,tinIssuedByDueDate:true},dependents:[child],...overrides},w2s:[{...simpleW2Fixture.w2s[0],wages:"50000"}]});
describe("Schedule 8812 actual identity and payroll facts",()=>{
  it("does not infer a timely employment-valid SSN from its printed digits",()=>{
    expect(()=>calculateFederalTax(fixture({primary:{...simpleW2Fixture.taxpayer.primary,tinIssuedByDueDate:true}}))).toThrow(/SSN.*unknown|unknown.*SSN/i);
  });
  it("does not infer the child's SSN eligibility from an asserted qualifying-child flag",()=>{
    const {ctcSsnEligible,...unknownChild}=child;
    expect(()=>calculateFederalTax(fixture({dependents:[unknownChild]}))).toThrow(/child.*SSN|SSN.*child/i);
  });
  it("excludes a known ineligible child's CTC without inventing ODC",()=>{
    expect(calculateFederalTax(fixture({dependents:[{...child,ctcSsnEligible:false}]})).childTaxCredit.toString()).toBe("0");
  });
  it("allows a joint return with one actual valid SSN and both timely TINs",()=>{
    const r=calculateFederalTax(fixture({filingStatus:"married_filing_jointly",primary:{...simpleW2Fixture.taxpayer.primary,employmentValidSsnIssuedByDueDate:false,tinIssuedByDueDate:true},spouse:{firstName:"Synthetic",lastName:"Spouse",ssn:"999-88-6666",dateOfBirth:"1990-01-01",employmentValidSsnIssuedByDueDate:true,tinIssuedByDueDate:true}}));
    expect(r.childTaxCredit.toString()).toBe("1780"); // Draft bracket calculation: ($50,000 - $32,200) × 10%; final-form qualification remains gated.
  });
  it("refuses an unknown timely TIN for the other joint filer",()=>{
    expect(()=>calculateFederalTax(fixture({filingStatus:"married_filing_jointly",spouse:{firstName:"Synthetic",lastName:"Spouse",ssn:"999-88-6666",dateOfBirth:"1990-01-01",employmentValidSsnIssuedByDueDate:false}}))).toThrow(/TIN.*unknown|unknown.*TIN/i);
  });
  it("uses the payroll alternative for a three-child return with a self-employment loss",()=>{
    const input=fixture({dependents:[child,{...child,firstName:"Second",ssn:"999-88-7778"},{...child,firstName:"Third",ssn:"999-88-7779"}]});
    input.taxpayer.primary.dateOfBirth="2004-05-20"; // Age22: ineligible for the childless EIC; no EIC child is claimed.
    input.w2s=[{...input.w2s[0],wages:"10000",socialSecurityWithheld:"620",medicareWages:"10000",medicareWithheld:"145"}];
    input.scheduleC={businessName:"Synthetic loss",businessCode:"541990",grossReceipts:"0",expenses:{otherExpenses:"9000"}} as typeof input.scheduleC;
    const r=calculateFederalTax(input);
    // Earned income $1,000: no 15% method. Payroll $620 + $145; childless EIC is zero at age22.
    expect(r.form8812?.payrollAlternative.toString()).toBe("765");
    expect(r.form8812?.actc.toString()).toBe("765");
  });
  it("does not infer ODC eligibility when the dependent TIN fact is unknown",()=>{
    expect(()=>calculateFederalTax(fixture({dependents:[{...child,qualifiesForCTC:false,qualifiesForODC:true}]}))).toThrow(/dependent TIN/i);
  });
  it("allows ODC for an actual timely dependent TIN",()=>{
    expect(calculateFederalTax(fixture({dependents:[{...child,qualifiesForCTC:false,qualifiesForODC:true,odcTinEligible:true}]})).form8812?.ctcBeforeLimitation.toString()).toBe("500");
  });
  it("does not grant CTC to a known ineligible parent",()=>{
    expect(calculateFederalTax(fixture({primary:{...simpleW2Fixture.taxpayer.primary,employmentValidSsnIssuedByDueDate:false,tinIssuedByDueDate:true}})).childTaxCredit.toString()).toBe("0");
  });
  it("rejects duplicate CTC and ODC claims for the same person",()=>{
    expect(()=>calculateFederalTax(fixture({dependents:[{...child,qualifiesForODC:true,odcTinEligible:true}]}))).toThrow(/both CTC and ODC/i);
  });

  it("preserves unknown possession-income and Puerto Rico facts",()=>{
    const input=fixture();
    input.childTaxCredit=undefined;
    expect(()=>calculateFederalTax(input)).toThrow(/possession-income.*unknown/i);
    input.childTaxCredit={possessionIncomeExclusion:"0"};
    expect(()=>calculateFederalTax(input)).toThrow(/Puerto Rico.*unknown/i);
  });

});
