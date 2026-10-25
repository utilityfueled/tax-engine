// Spec: spec/federal/form-8801.yaml return-integration. Production2026 remains gated.
import {describe,it,expect,vi} from "vitest";
vi.mock("@/models/constants.js",async(importOriginal)=>{
  const original=await importOriginal<typeof import("@/models/constants.js")>();
  const {FEDERAL_2026_CONSTANTS}=await import("@/models/federal-2026-indexed.js");
  return {...original,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:original.getConstants(year)};
});
import {calculateFederalTax} from "@/engine/federal.js";
import {TaxYearInputSchema} from "@/models/inputs.js";
import {simpleW2Fixture} from "../fixtures/simple-w2.js";
const source={priorYear:2025,sourceFactsConfirmed:true,priorYearFilingStatus:"single",priorYearTaxableIncome:"999999",priorYearRegularTax:"999999",priorYearAMT:"5000",priorYearExclusionItemAdjustments:"10000",unusedMinimumTaxCreditCarryforward:"2000",priorYearForm6251Line1And2e:"100000",priorYearMinimumTaxCreditNOLDeduction:"0",priorYearMinimumTaxForeignTaxCredit:"0",priorYearForm6251Line10:"1000",priorYearUnallowedQualifiedElectricVehicleCredit:"0",priorYearFiledForm2555:false,priorYearFiledForm1040NR:false,priorYearCapitalGainsRequired:false};
const input=(extra:Record<string,unknown>={})=>TaxYearInputSchema.parse({...simpleW2Fixture,taxpayer:{...simpleW2Fixture.taxpayer,taxYear:2026},form8801:source,...extra});
describe("Minimum tax credit return integration",()=>{
  it("uses actual prior-year worksheet inputs and final current-year credit limitation",()=>{
    const r=calculateFederalTax(input());
    expect(r.form8801?.taxYear).toBe(2026);
    expect(r.form8801?.priorYear).toBe(2025);
    expect(r.form8801?.sourceFactsVerified).toBe(true);
    // (100000+10000-88100)*26%=5694; exclusion-only net=4694;
    // priorAMT5000-4694+carry2000=2306 available.
    expect(r.form8801?.minTaxCreditFromPriorYear.toString()).toBe("306");
    expect(r.form8801?.creditAllowed.toString()).toBe("2306");
    expect(r.schedule3?.priorYearMinimumTaxCredit.toString()).toBe("2306");
    const energy=calculateFederalTax(input({energyCredits:{priorYearCarryforward:"10000",carryforwardSourceTaxYear:2025,carryforwardConfirmed:true}}));
    expect(energy.form8801?.lines.find(l=>l.line==="22")?.value.toString()).toBe("0");
    expect(energy.form8801?.creditAllowed.toString()).toBe("0");
    expect(energy.form8801?.carryforwardToNextYear.toString()).toBe("2306");
    expect(()=>calculateFederalTax(input({form8801:{...source,priorYearMinimumTaxForeignTaxCredit:undefined}}))).toThrow(/minimum tax foreign credit/i);
    expect(()=>calculateFederalTax(input({form8801:{...source,priorYear:2024}}))).toThrow(/prior year/i);
    const missing=input();
    Reflect.deleteProperty(missing.form8801!,"priorYearAMT");
    expect(()=>calculateFederalTax(missing)).toThrow(/original.*source.*unknown/i);
  });
});
