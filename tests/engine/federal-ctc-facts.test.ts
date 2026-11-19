// Spec: spec/federal/form-8812.yaml; draft constant injection never opens production 2026.
import { describe,it,expect,vi } from "vitest";
vi.mock("@/models/constants.js",async(importOriginal)=>{
  const original=await importOriginal<typeof import("@/models/constants.js")>();
  const {FEDERAL_2026_CONSTANTS}=await import("@/models/federal-2026-indexed.js");
  return {...original,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:original.getConstants(year)};
});

import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm8812 } from "@/engine/forms/form-8812.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
const child={firstName:"Synthetic",lastName:"Child",ssn:"999-88-7777",relationship:"child",dateOfBirth:"2018-03-02",monthsLivedWithYou:12,qualifiesForCTC:true,ctcSsnEligible:true};
const fixture=(overrides:Record<string,unknown>={})=>TaxYearInputSchema.parse({...simpleW2Fixture,childTaxCredit:{bonaFidePuertoRicoResident:false,possessionIncomeExclusion:"0"},taxpayer:{...simpleW2Fixture.taxpayer,taxYear:2026,primary:{...simpleW2Fixture.taxpayer.primary,employmentValidSsnIssuedByDueDate:true,tinIssuedByDueDate:true},dependents:[child],...overrides},w2s:[{...simpleW2Fixture.w2s[0],accountHolder:"primary",wages:"50000"}]});
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
    input.w2s=[{...input.w2s[0],wages:"10000",socialSecurityWages:"10000",socialSecurityTips:"0",socialSecurityWithheld:"620",medicareWages:"10000",medicareWithheld:"145"}];
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

  it("audits actual Puerto Rico and Form4563 MAGI sources",()=>{
    const input=TaxYearInputSchema.parse({...fixture(),childTaxCredit:{bonaFidePuertoRicoResident:false,possessionIncomeExclusion:"500",puertoRicoExcludedIncome:"200",form4563ExcludedIncome:"300"}});
    const historical=calculateFederalTax({...input,taxpayer:{...input.taxpayer,taxYear:2025}}).form8812;
    const standalone=calculateForm8812({
      taxYear:2026, qualifyingChildren:1, otherDependents:0, filingStatus:"single", bonaFidePuertoRicoResident:false,
      agi:d("50500"), adjustedGrossIncome:d("50000"), earnedIncome:d("50000"), taxLiability:d("5000"),
      puertoRicoExcludedIncome:d("200"), form4563ExcludedIncome:d("300"), foreignExcludedIncome:d("0"),
    },FEDERAL_2026_CONSTANTS);
    for(const result of [historical,standalone]) {
      for(const [id,amount] of [["1","50000"],["2a","200"],["2b","0"],["2c","300"],["2d","500"],["3","50500"]]) {
        expect(result?.lines.find(line=>line.line===id)?.value.toString()).toBe(amount);
      }
    }
    for(const deductionElection of ["itemized","standard","automatic"] as const) {
      expect(()=>calculateFederalTax({...input,deductionElection})).toThrow(/territory income.*deduction allocation/i);
    }
  });
  it("rejects a positive possession aggregate with unknown source split",()=>{
    const input=fixture();input.childTaxCredit={bonaFidePuertoRicoResident:false,possessionIncomeExclusion:"500"};
    expect(()=>calculateFederalTax(input)).toThrow(/possession.*split.*unknown/i);
  });
  it("rejects contradictory possession totals and records known zero components",()=>{
    const input=TaxYearInputSchema.parse({...fixture(),childTaxCredit:{bonaFidePuertoRicoResident:false,possessionIncomeExclusion:"500",puertoRicoExcludedIncome:"200",form4563ExcludedIncome:"400"}});
    expect(()=>calculateFederalTax(input)).toThrow(/possession.*reconcile/i);
    const zero=calculateFederalTax(fixture());
    expect(zero.form8812?.lines.find(line=>line.line==="2a")?.value.toString()).toBe("0");
    expect(zero.form8812?.lines.find(line=>line.line==="2c")?.value.toString()).toBe("0");
  });

});

describe("Schedule 8812 2026 claimed child's age", () => {
  it.each(["", "2010-02-29", "2027-01-01"])("rejects the missing or invalid birth date %j", dateOfBirth => {
    const input = fixture({ dependents: [{ ...child, dateOfBirth }] });
    expect(() => calculateFederalTax(input)).toThrow(/valid birth date/i);
  });

  it("rejects CTC for a child who turns 17 on December 31 without inferring ODC", () => {
    const olderChild = { ...child, dateOfBirth: "2009-12-31" };
    expect(() => calculateFederalTax(fixture({ dependents: [olderChild] }))).toThrow(/under age 17/i);
    const confirmedOdc = { ...olderChild, qualifiesForCTC: false, qualifiesForODC: true, odcTinEligible: true };
    expect(calculateFederalTax(fixture({ dependents: [confirmedOdc] })).childTaxCredit.toString()).toBe("500");
  });

  it.each(["2010-01-01", "2026-12-31"])("counts a qualifying child born on %s", dateOfBirth => {
    const input = fixture({ dependents: [{ ...child, dateOfBirth }] });
    expect(calculateFederalTax(input).childTaxCredit.toString()).toBe("2200");
  });
});

describe("Schedule 8812 original W-2 combat pay", () => {
  function combatReturn(year: 2025 | 2026, codeQ?: string, legacyAmount?: string) {
    const original = fixture();
    return {
      ...original,
      taxpayer: { ...original.taxpayer, taxYear: year, primary: { ...original.taxpayer.primary, dateOfBirth: "2004-05-20" } },
      childTaxCredit: { ...original.childTaxCredit, nonTaxableCombatPayElection: legacyAmount },
      w2s: [{ ...original.w2s[0], taxYear: year, wages: "2000", box12CodeQ: codeQ }],
    };
  }

  it.each([2025, 2026] as const)("includes every dollar once and records exact line 18b in %i", year => {
    const input = combatReturn(year, "2250.50", "0");
    const result = calculateFederalTax(TaxYearInputSchema.parse(input));
    const amount = (line: string) => result.form8812?.lines.find(entry => entry.line === line)?.value.toFixed();
    expect(result.agi.toFixed()).toBe("2000");
    expect(amount("18a")).toBe("4250.5");
    expect(amount("18b")).toBe("2250.5");
    expect(amount("19")).toBe("1750.5");
    expect(amount("27")).toBe("263");
    expect(result.earnedIncomeCredit.isZero()).toBe(true);
  });

  it("sums actual joint code Q sources and reconciles the matching legacy total without doubling", () => {
    const original = combatReturn(2026, "1200.10", "2250.50");
    const input = TaxYearInputSchema.parse({
      ...original,
      taxpayer: { ...original.taxpayer, filingStatus: "married_filing_jointly", spouse: { ...original.taxpayer.primary, ssn: "999-88-6666" } },
      w2s: [...original.w2s, { ...original.w2s[0], accountHolder: "spouse", wages: "0", box12CodeQ: "1050.40" }],
    });
    const result = calculateFederalTax(input);
    expect(result.form8812?.lines.find(entry => entry.line === "18b")?.value.toFixed(2)).toBe("2250.50");
    expect(result.form8812?.actc.toFixed()).toBe("263");
  });

  it.each([
    [undefined, "2250.50"],
    ["0", "2250.50"],
    ["2250.49", "2250.50"],
  ])("rejects the missing or conflicting original %j for saved amount %j", (codeQ, legacyAmount) => {
    const input = TaxYearInputSchema.parse(combatReturn(2026, codeQ, legacyAmount));
    expect(() => calculateFederalTax(input)).toThrow(/combat pay|code Q/i);
  });

  it("rejects a reported amount with unknown original year, missing owner or incomplete remaining W-2s", () => {
    const original = combatReturn(2026, "2250.50");
    for (const w2s of [
      [{ ...original.w2s[0], taxYear: undefined }],
      [{ ...original.w2s[0], accountHolder: undefined }],
      [...original.w2s, { ...original.w2s[0], box12CodeQ: undefined }],
    ]) {
      const input = TaxYearInputSchema.parse({ ...original, w2s });
      expect(() => calculateFederalTax(input)).toThrow(/combat pay|code Q/i);
    }
  });

  it("requires an amount or confirmed zero for a W-2 flagged with combat or hazardous duty pay", () => {
    const original = combatReturn(2026);
    const w2 = { ...original.w2s[0], militaryService: { activeDuty: true, combatOrHazardousDutyPay: true } };
    expect(() => calculateFederalTax(TaxYearInputSchema.parse({ ...original, w2s: [w2] }))).toThrow(/combat pay|code Q/i);
    const zero = calculateFederalTax(TaxYearInputSchema.parse({ ...original, w2s: [{ ...w2, box12CodeQ: "0" }] }));
    expect(zero.form8812?.lines.find(entry => entry.line === "18b")?.value.toFixed()).toBe("0");
  });
});
