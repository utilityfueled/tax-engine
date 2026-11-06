// Spec: spec/federal/guided-adoption-shared-limit.yaml.
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { adoptionFactErrors, buildAdoptionInput, type AdoptionCreditData } from "@/lib/guided-adoption-facts";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyCreditsData } from "@/lib/guided-interview-flow";
import { calculateForm8839 } from "@/engine/forms/form-8839";
import { calculateFederalTax } from "@/engine/federal";
import { Form8839Schema, TaxYearInputSchema } from "@/models/inputs";
import { getConstants } from "@/models/constants";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed";
import { actualGuidedAdoptionHistory } from "../fixtures/guided-adoption-prior-benefits";
import { completePersonalInfo, completeW2Entry, startCompleteInterview } from "./complete-facts";
function required<T>(value:T|null|undefined):T { if(value==null)throw Error("Missing fictional original");return value; }
function actual(year:2025|2026, shared=true):AdoptionCreditData {
 const data=actualGuidedAdoptionHistory(),child=data.children[0],history=required(child.priorYearForeignBenefitHistory);
 child.adoptionFinalizedYear=String(year);history.sourceTaxYear=String(year);required(history.records)[0].taxYear=String(year-1);
 if(shared){history.otherAdopterReceivedBenefits=true;history.otherAdopterAgreement={
  sourceTaxYear:year,sourceReference:"Fictional guided shared agreement",sourceFactsConfirmed:true,bothAdoptersAgreed:true,allAdoptersIncluded:true,
  taxpayerNameOnAgreement:"Jordan Example",taxpayerIdentifyingNumberLast4:"3333",otherAdopterName:"Casey Example",otherAdopterIdentifyingNumber:"456-78-9012",
  childNameOnAgreement:"Sam Example",childIdentifyingNumberLast4:"8901",taxpayerExclusionLimit:"6000",otherAdopterExclusionLimit:year===2026?"11670":"11280",
  creditExpenseHistoryConfirmed:true,taxpayerQualifiedCreditExpenses:"0",otherAdopterQualifiedCreditExpenses:"0",taxpayerPriorCreditsClaimed:"0",otherAdopterPriorCreditsClaimed:"0",
  otherAdopterPriorExclusionLimitUsed:"0",otherAdopterCurrentBenefits:"0",allOtherAdopterBenefitsIncluded:true,
  records:[{sourceId:"Fictional outside guided original",taxYear:year-1,employerName:"Outside Employer",employerEin:"23-4567890",recipientName:"Casey Example",recipientTaxpayerIdLast4:"9012",originalEmployerBenefits:"12000",benefitsAllocatedToChild:"12000",allocatedBenefitsIncludedInPriorIncome:true,employerPlanQualified:true}]
 };}return data;
}
describe("Guided actual agreed adoption limit caller",()=>{
 it("preserves complete ordinary and agreed original histories with the actual year limit",()=>{
  for(const year of [2025,2026]as const)for(const shared of [false,true]){
   const data=actual(year,shared),before=JSON.stringify(data),precision=Decimal.precision;
   expect(adoptionFactErrors(data,year,"single",completePersonalInfo)).toEqual({});
   const mapped=Form8839Schema.parse(buildAdoptionInput(data,year,"single",completePersonalInfo));
   expect(mapped.children[0].priorYearForeignBenefits).toBe("8000.10");
   expect(mapped.children[0].priorYearForeignBenefitHistory?.otherAdopterAgreement).toEqual(data.children[0].priorYearForeignBenefitHistory?.otherAdopterAgreement);
   expect(JSON.stringify(data)).toBe(before);expect(Decimal.precision).toBe(precision);
  }
 });
 it("rejects unsupported years and stale or incomplete agreed limits without guessing facts",()=>{
  for(const year of [undefined,null,0,2024,2027,NaN,2025.5]){
   const originalZero=actual(2025,false);delete originalZero.children[0].priorYearForeignBenefitHistory;originalZero.children[0].priorYearForeignBenefits="0";
   expect(Object.keys(adoptionFactErrors(originalZero,year,"single",completePersonalInfo)).length).toBeGreaterThan(0);
   expect(()=>buildAdoptionInput(originalZero,year,"single",completePersonalInfo)).toThrow();
  }
  for(const year of [2025,2026]as const){
   const wrong=actual(year);required(required(wrong.children[0].priorYearForeignBenefitHistory).otherAdopterAgreement).otherAdopterExclusionLimit=year===2026?"11280":"11670";
   expect(()=>buildAdoptionInput(wrong,year,"single",completePersonalInfo)).toThrow();
   const missing=actual(year);delete required(missing.children[0].priorYearForeignBenefitHistory).otherAdopterAgreement;
   expect(()=>buildAdoptionInput(missing,year,"single",completePersonalInfo)).toThrow();
   const unknown=actual(year);required(required(unknown.children[0].priorYearForeignBenefitHistory).otherAdopterAgreement).otherAdopterCurrentBenefits=undefined;
   expect(()=>buildAdoptionInput(unknown,year,"single",completePersonalInfo)).toThrow();
   const cents=actual(year);required(required(cents.children[0].priorYearForeignBenefitHistory).otherAdopterAgreement).taxpayerQualifiedCreditExpenses="0.01";
   expect(()=>buildAdoptionInput(cents,year,"single",completePersonalInfo)).toThrow();
  }
  expect(buildAdoptionInput(undefined,undefined)).toBeUndefined();
 });
 it("carries the actual shared packet through the guided bridge and existing calculator once",()=>{
  for(const year of [2025,2026]as const){
   const data=actual(year),mapped=Form8839Schema.parse(buildAdoptionInput(data,year,"single",completePersonalInfo));
   const r=calculateForm8839({taxYear:year,filingStatus:"single",sourceTaxpayer:{primary:completePersonalInfo},eligibilityConfirmed:true,agi:new Decimal("102000"),children:mapped.children,
    exclusionMagi:new Decimal("102000"),foreignEarnedIncomeExclusion:new Decimal("0"),foreignHousingExclusion:new Decimal("0"),possessionIncomeExclusion:new Decimal("0"),taxLiabilityLimit:new Decimal("50000"),constants:(year===2026?FEDERAL_2026_CONSTANTS:getConstants(year)).adoptionCredit});
   expect(r.allowableExclusion.toFixed()).toBe("6000");expect(r.adoptionIncomeAdjustment.toFixed()).toBe("-4000");
   const state=startCompleteInterview({filingStatus:"single",incomeTypes:["w2-wages"],lifeEvents:[],stateCode:null});state.taxYear=year;
   state.sectionData["income-w2"]={entries:[{...completeW2Entry,wages:"100000",socialSecurityWages:"102000",medicareWages:"102000",socialSecurityWithheld:"6324",medicareWithheld:"1479",box12CodeT:"2000"}]};
   state.sectionData.credits={...emptyCreditsData,adoption:data};const input=TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(state)));
   expect(input.form8839?.children[0].priorYearForeignBenefitHistory?.otherAdopterAgreement).toEqual(mapped.children[0].priorYearForeignBenefitHistory?.otherAdopterAgreement);
   if(year===2025){const output=calculateFederalTax(input);expect(output.agi.toFixed()).toBe("96000");expect(output.form8839?.adoptionIncomeAdjustment.toFixed()).toBe("-4000");}
   else expect(()=>calculateFederalTax(input)).toThrow(/incomplete|unavailable|unsupported/i);
  }
  expect(()=>getConstants(2026)).toThrow(/incomplete/i);
 });
});
