import type { TaxYearInput } from "@/models/inputs";
import { PAReciprocitySourcesSchema, type PAReciprocitySources } from "@/models/pa-reciprocity";
import { PAResidencySourcesSchema, type PAResidencySources } from "@/models/pa-residency";
import { confirmGuidedPAResidencySources, buildGuidedPAResidencySources } from "./guided-pa-residency-facts";
export function emptyGuidedPAReciprocitySources():PAReciprocitySources {
 return {sourceTaxYear:null,sourceReference:"",sourceFactsConfirmed:null,owner:{accountHolder:""},originals:[],segments:[]};
}
export function updateGuidedPAReciprocitySources(ordinary:PAResidencySources,proof:PAReciprocitySources,patch:Partial<PAReciprocitySources>){
 return {residencySources:{...ordinary,sourceFactsConfirmed:null},reciprocitySources:{...proof,...patch,sourceFactsConfirmed:null}};
}
export function confirmGuidedPAReciprocitySources(input:TaxYearInput,rawOrdinary:unknown,rawProof:unknown){
 const ordinary=PAResidencySourcesSchema.parse(rawOrdinary),proof=PAReciprocitySourcesSchema.parse(rawProof);
 if(proof.owner.accountHolder!==ordinary.owner.accountHolder || proof.owner.accountHolder!=="primary") throw new Error("Actual matching reciprocal and residency owner required");
 const owner=input.taxpayer.primary,originalTaxpayer={firstName:owner.firstName,lastName:owner.lastName,ssn:owner.ssn};
 const reciprocitySources:PAReciprocitySources={...proof,sourceFactsConfirmed:true,owner:{...proof.owner,originalTaxpayer},
 originals:proof.originals.map(o=>({...o,originalW2:o.originalIndex===null?undefined:structuredClone(input.w2s[o.originalIndex]),residentStateReturn:{...o.residentStateReturn,ownerOriginal:o.refundSupportFactsConfirmed===true?structuredClone(originalTaxpayer):o.residentStateReturn.ownerOriginal}})),
 segments:proof.segments.map(s=>({...s,actualPayroll:structuredClone(ordinary.wages.find(w=>w.originalIndex===s.originalIndex)?.payroll[s.payrollIndex??-1])}))};
 const current={...input,paReciprocitySources:reciprocitySources};
 const residencySources=confirmGuidedPAResidencySources(current,ordinary);
 return {residencySources,reciprocitySources};
}
export function buildGuidedPAReciprocitySources(input:TaxYearInput,ordinary:unknown,proof:unknown){
 const reciprocitySources=PAReciprocitySourcesSchema.parse(proof);
 const current={...input,paReciprocitySources:reciprocitySources};
 const residencySources=buildGuidedPAResidencySources(current,ordinary);
 return {residencySources,reciprocitySources};
}
