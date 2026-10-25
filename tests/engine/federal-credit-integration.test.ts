// Spec: spec/federal/form-1040.yaml, credit-return-integration.
import {describe,it,expect,vi} from "vitest";
vi.mock("@/models/constants.js",async(importOriginal)=>{
  const original=await importOriginal<typeof import("@/models/constants.js")>();
  const {FEDERAL_2026_CONSTANTS}=await import("@/models/federal-2026-indexed.js");
  return {...original,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:original.getConstants(year)};
});
import {calculateFederalTax} from "@/engine/federal.js";
import {TaxYearInputSchema} from "@/models/inputs.js";
import {simpleW2Fixture} from "../fixtures/simple-w2.js";
const fixture=(year:number,overrides:Record<string,unknown>={})=>TaxYearInputSchema.parse({...simpleW2Fixture,taxpayer:{...simpleW2Fixture.taxpayer,taxYear:year,dependents:[]},w2s:[],...overrides});
const adoptionChild={childName:"Synthetic",isSpecialNeeds:false,isForeignAdoption:false,adoptionBecameFinal:true,qualifiedExpenses:"10000",employerBenefits:"0",priorYearCreditsClaimed:"0",priorYearExclusionsClaimed:"0"};
const line=(result:ReturnType<typeof calculateFederalTax>,id:string)=>result.allLines.filter(l=>l.form==="1040"&&l.line===id).at(-1)?.value.toString();
describe("Personal credit return integration",()=>{
  it("routes 2025 refundable adoption to line30 while carrying unused nonrefundable credit",()=>{
    const r=calculateFederalTax(fixture(2025,{form8839:{children:[adoptionChild]}}));
    expect(line(r,"30")).toBe("5000");
    expect(r.form8839?.nonrefundableAdoptionCredit.toString()).toBe("0");
    expect(r.form8839?.carryforwardRemaining.toString()).toBe("5000");
    expect(r.totalPayments.toString()).toBe("5000");
  });
  it("uses indexed 2026 refundable adoption and actual expense years",()=>{
    const r=calculateFederalTax(fixture(2026,{form8839:{eligibilityConfirmed:true,possessionIncomeExclusion:"0",children:[{...adoptionChild,adoptionFinalizedYear:2026,expensesByYear:[{year:2026,amount:"10000"}]}]}}));
    expect(line(r,"30")).toBe("5120");
    expect(r.form8839?.carryforwardRemaining.toString()).toBe("4880");
  });
  it("includes excess employer adoption benefits in wages using the actual exclusion worksheet",()=>{
    const r=calculateFederalTax(fixture(2026,{w2s:[{...simpleW2Fixture.w2s[0],wages:"100000"}],form8839:{eligibilityConfirmed:true,possessionIncomeExclusion:"0",exclusionMagi:"120000",children:[{...adoptionChild,qualifiedExpenses:"0",employerBenefits:"20000",employerPlanQualified:true,adoptionFinalizedYear:2026,expensesByYear:[]}]}}));
    expect(line(r,"1f")).toBe("2330");
    expect(r.totalWages.toString()).toBe("102330");
    expect(r.agi.toString()).toBe("102330");
  });
  it("preserves a signed special-needs employer-plan exclusion",()=>{
    const r=calculateFederalTax(fixture(2026,{w2s:[{...simpleW2Fixture.w2s[0],wages:"100000"}],form8839:{eligibilityConfirmed:true,possessionIncomeExclusion:"0",exclusionMagi:"100000",children:[{...adoptionChild,isSpecialNeeds:true,qualifiedExpenses:"0",employerPlanQualified:true,adoptionFinalizedYear:2026,expensesByYear:[]}]}}));
    expect(line(r,"1f")).toBe("-17670");
    expect(r.totalWages.toString()).toBe("82330");
  });
  it("does not fabricate an adoption exclusion worksheet from final AGI",()=>{
    expect(()=>calculateFederalTax(fixture(2025,{form8839:{children:[{...adoptionChild,employerBenefits:"1000"}]}}))).toThrow(/exclusion MAGI.*unknown/i);
  });
  it("passes both actual 2025 energy-credit limits and preserves unused clean-energy credit",()=>{
    const r=calculateFederalTax(fixture(2025,{energyCredits:{residenceEligibilityConfirmed:true,cleanEnergyProperties:[{category:"solar_electric",qualifiedCost:"10000",installationCompletedDate:"2025-08-01",qualificationConfirmed:true}]}}));
    expect(r.form5695?.residentialCleanEnergyCredit.toString()).toBe("0");
    expect(r.form5695?.residentialCleanEnergyCarryforward.toString()).toBe("3000");
  });
  it("permits only the confirmed prior-year energy carryforward in 2026",()=>{
    const r=calculateFederalTax(fixture(2026,{energyCredits:{priorYearCarryforward:"3000",carryforwardSourceTaxYear:2025,carryforwardConfirmed:true,solarElectricCost:"10000"}}));
    expect(r.form5695?.residentialCleanEnergyCarryforward.toString()).toBe("3000");
    expect(r.form5695?.disallowedNewEnergyCosts.toString()).toBe("10000");
  });
  it("repays actual vehicle transfers in Schedule2 PartI",()=>{
    const evidence={dateAcquired:"2025-09-30",owner:"primary",datePlacedInService:"2026-01-02",bindingContractDate:"2025-09-30",paymentDate:"2025-09-30",bindingContractConfirmed:true,sellerReportReceived:true,eligibilityConfirmed:true,resoldWithin30Days:true,returnedToSellerWithin30Days:false,personalUsePercentage:"100",creditTransferredToDealer:true};
    const r=calculateFederalTax(fixture(2026,{form8936:{agiAdjustmentsConfirmed:true,newCleanVehicles:[{...evidence,vin:"1ABCDEFGH23456789",powertrain:"battery",criticalMineralsRequirementMet:true,batteryComponentsRequirementMet:true,msrp:"45000",vehicleType:"other",sellerReportCreditAmount:"7500",creditTransferredAmount:"7500"}],previouslyOwnedCleanVehicles:[{...evidence,vin:"2ABCDEFGH23456789",salePrice:"15000",sellerReportCreditAmount:"4000",creditTransferredAmount:"4000"}]}}));
    expect(r.schedule2?.partITotal.toString()).toBe("11500");
    expect(r.schedule2?.partIITotal.toString()).toBe("0");
    expect(line(r,"17")).toBe("11500");
    expect(r.totalTax.toString()).toBe("11500");
    expect(r.schedule2?.lines.find(l=>l.line==="1b")?.value.toString()).toBe("7500");
    expect(r.schedule2?.lines.find(l=>l.line==="1c")?.value.toString()).toBe("4000");
  });
  it("rejects verified vehicles whose original price or transfer fields were omitted",()=>{
    expect(()=>calculateFederalTax(fixture(2026,{form8936:{agiAdjustmentsConfirmed:true,newCleanVehicles:[{dateAcquired:"2025-09-30",criticalMineralsRequirementMet:true,batteryComponentsRequirementMet:true}]}}))).toThrow(/original.*facts.*unknown/i);
  });

  it("does not infer prior adoption lifetime usage from missing history",()=>{
    expect(()=>calculateFederalTax(fixture(2026,{form8839:{eligibilityConfirmed:true,possessionIncomeExclusion:"0",children:[{childName:"Synthetic",adoptionFinalizedYear:2026,expensesByYear:[{year:2026,amount:"10000"}]}]}}))).toThrow(/adoption.*history.*unknown/i);
  });
  it("reserves the nonrefundable child amount before adoption and preserves ACTC",()=>{
    const input=fixture(2026,{w2s:[{...simpleW2Fixture.w2s[0],wages:"30000"}],childTaxCredit:{bonaFidePuertoRicoResident:false,possessionIncomeExclusion:"0"},form8839:{eligibilityConfirmed:true,possessionIncomeExclusion:"0",children:[{...adoptionChild,adoptionFinalizedYear:2026,expensesByYear:[{year:2026,amount:"10000"}]}]}});
    input.taxpayer.primary.employmentValidSsnIssuedByDueDate=true;
    input.taxpayer.dependents=[{firstName:"Synthetic",lastName:"Child",ssn:"999-88-7777",dateOfBirth:"2018-02-01",relationship:"child",monthsLivedWithYou:12,qualifiesForCTC:true,ctcSsnEligible:true,qualifiesForODC:false,qualifiesForEIC:false}];
    const r=calculateFederalTax(input);
    expect(r.childTaxCredit.toString()).toBe("500");
    expect(r.form8812?.actc.toString()).toBe("1700");
    expect(r.form8839?.nonrefundableAdoptionCredit.eq(r.totalTaxBeforeCredits.minus("500"))).toBe(true);
    expect(r.form8839?.carryforwardRemaining.plus(r.form8839.nonrefundableAdoptionCredit).toString()).toBe("4880");
  });

  it("forwards education claim history, actual MAGI addbacks and final tax limit",()=>{
    const makeEducation=(history:number)=>fixture(2025,{w2s:[{...simpleW2Fixture.w2s[0],wages:"80000"}],educationExpenses:{possessionIncomeExclusion:"5000",aocStudents:[{name:"Student",qualifiedExpenses:"4000",priorYearsClaimed:history}],llcExpenses:"0"}});
    const exhausted=calculateFederalTax(makeEducation(4));
    expect(exhausted.form8863?.aocTotalTentative.toString()).toBe("0");
    const allowed=calculateFederalTax(makeEducation(0));
    expect(allowed.form8863?.lines.find(l=>l.line==="3")?.value.toString()).toBe("85000");
    expect(allowed.form8863?.aocRefundable.toString()).toBe("500");
    expect(allowed.form8863?.totalNonrefundable.toString()).toBe("750");
    const low=calculateFederalTax(fixture(2025,{educationExpenses:{aocStudents:[{name:"Student",qualifiedExpenses:"4000"}]}}));
    expect(low.form8863?.totalNonrefundable.toString()).toBe("0");
    expect(low.form8863?.lines.find(l=>l.line==="19")?.value.toString()).toBe("0");
  });

});
