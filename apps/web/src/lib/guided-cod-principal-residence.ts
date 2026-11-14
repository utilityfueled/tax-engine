import { TaxYearInputSchema } from '@/models/inputs';
import { Form982PrincipalResidenceSourcesSchema } from '@/models/cod-principal-residence-sources';
import { calculateCodPrincipalResidenceReduction } from '@/engine/forms/cod-principal-residence';
import type { GuidedFlowState } from './guided-interview-flow';
import type { CodPrincipalResidenceData } from './guided-cod-principal-residence-types';
import { parseGuidedCurrency } from './guided-currency';
import { guidedSourceValuesChanged } from './guided-source-confirmation';
export type { CodPrincipalResidenceData, CodPrincipalResidenceDebtData } from './guided-cod-principal-residence-types';

const statuses={single:'single',mfj:'married_filing_jointly',mfs:'married_filing_separately',hoh:'head_of_household',qss:'qualifying_surviving_spouse'} as const;
function year(value:string|undefined):number {
  if(!value || !/^\d{4}$/.test(value)) throw Error('Enter the actual original mortgage source tax year.');
  return Number(value);
}
function amount(value:string|undefined,label:string):string {
  if(!value?.trim()) throw Error(`Enter the actual ${label}, including zero when known from the original records.`);
  const actual=parseGuidedCurrency(value);
  if(!actual.isFinite() || actual.isNegative()) throw Error(`Enter the actual nonnegative ${label}.`);
  return actual.toFixed();
}
/** Null confirmation is unknown, never a false eligibility answer. */
function original(value:unknown):unknown {
  if(value===null)return undefined;
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,original(child)]));
  return value;
}
/** Collect facts only; the shared canonical validator derives exclusion and basis. */
export function buildGuidedCodPrincipalResidence(data:CodPrincipalResidenceData|undefined,state:GuidedFlowState) {
  if(!data)return undefined;
  if(state.sectionData.adjustments?.codNolSources) throw Error('Choose one actual cancellation method; remove the other mortgage or personal-debt packet.');
  if(state.sectionData.adjustments?.currentLossOrigin) throw Error('Current Form 172 loss origin with retained-home cancellation needs its separate source method. Prior loss carry records may still be entered independently.');
  const personal=state.sectionData['personal-info'],status=state.segmentation.filingStatus;
  if(!personal || !status || (state.taxYear!==2025&&state.taxYear!==2026)) throw Error('Confirm the actual year, filing status and household before entering original mortgage records.');
  const debt=data.debt,acquisition=data.acquisition,basis=data.basis;
  if(!debt || !acquisition || !basis) throw Error('Enter the actual mortgage statement, original acquisition loan and residence basis records.');
  if(!debt.statementId?.trim())throw Error('Enter the actual original mortgage statement identity.');
  const facts=Form982PrincipalResidenceSourcesSchema.parse({...original(data) as object,sourceTaxYear:year(data.sourceTaxYear),
    debt:{...original(debt) as object,sourceId:'form1099C:0',sourceTaxYear:year(debt.sourceTaxYear),
      amountDischarged:amount(debt.amountDischarged,'Box2 canceled amount'),interestIncluded:amount(debt.interestIncluded,'Box3 interest'),
      fmvOfProperty:amount(debt.fmvOfProperty,'Box7 property value'),actualDischargedPrincipal:amount(debt.actualDischargedPrincipal,'actual canceled principal'),
      actualDischargedInterest:amount(debt.actualDischargedInterest,'actual discharged interest')},
    acquisition:{...original(acquisition) as object,outstandingPrincipal:amount(acquisition.outstandingPrincipal,'immediately-before mortgage principal'),
      originalAcquisitionPrincipal:amount(acquisition.originalAcquisitionPrincipal,'original acquisition borrowing')},
    basis:{...original(basis) as object,purchaseCost:amount(basis.purchaseCost,'purchase cost'),acquisitionCosts:amount(basis.acquisitionCosts,'basis acquisition costs'),
      capitalImprovements:amount(basis.capitalImprovements,'capital improvements'),previousBasisReductions:amount(basis.previousBasisReductions,'previous basis reductions')},
  });
  const middleInitial=personal.middleName?.replace(/[^A-Za-z]/g,'').charAt(0).toUpperCase();
  const parsed=TaxYearInputSchema.parse({taxpayer:{taxYear:state.taxYear,filingStatus:statuses[status],primary:{
    firstName:`${personal.firstName.trim()}${middleInitial?` ${middleInitial}`:''}`,lastName:personal.lastName,ssn:personal.ssn,dateOfBirth:personal.dateOfBirth},
    address:{street:personal.addressLine1,apt:personal.addressLine2||undefined,city:personal.city,state:personal.state,zip:personal.zip}},
    form1099C:[{creditor:debt.creditor,amountDischarged:facts.debt?.amountDischarged,interestIncluded:facts.debt?.interestIncluded,
      fmvOfProperty:facts.debt?.fmvOfProperty,personallyLiable:debt.personallyLiable??undefined,identifiableEventCode:debt.identifiableEventCode,debtDescription:debt.debtDescription}],
    form982PrincipalResidenceSources:facts});
  const result=calculateCodPrincipalResidenceReduction(parsed);
  if(!result)throw Error('Complete the actual original mortgage records.');
  return {form1099C:parsed.form1099C,form982PrincipalResidenceSources:facts,codExclusion:result.codExclusion};
}
export function codPrincipalResidenceFactErrors(state:GuidedFlowState):Record<string,string> {
  try {buildGuidedCodPrincipalResidence(state.sectionData.adjustments?.codPrincipalResidenceSources,state);return {};
  }catch(error){return {codPrincipalResidenceSources:error instanceof Error?error.message:'Reconcile the original retained-home cancellation records.'};}
}
export const codPrincipalResidenceNavigationFactErrors=codPrincipalResidenceFactErrors;
export function invalidateGuidedCodPrincipalResidence(data:CodPrincipalResidenceData):CodPrincipalResidenceData {
  return {...data,sourceFactsConfirmed:null,
    ...(data.debt?{debt:{...data.debt,sourceFactsConfirmed:null}}:{}),
    ...(data.acquisition?{acquisition:{...data.acquisition,sourceFactsConfirmed:null}}:{}),
    ...(data.reason?{reason:{...data.reason,sourceFactsConfirmed:null}}:{}),
    ...(data.basis?{basis:{...data.basis,sourceFactsConfirmed:null}}:{}),
    ...(data.arrangement?{arrangement:{...data.arrangement,sourceFactsConfirmed:null}}:{})};
}
export function updateGuidedCodPrincipalResidence(previous:CodPrincipalResidenceData,patch:Partial<CodPrincipalResidenceData>):CodPrincipalResidenceData {
  const next={...previous,...patch};
  return guidedSourceValuesChanged(previous,next)?invalidateGuidedCodPrincipalResidence(next):next;
}
