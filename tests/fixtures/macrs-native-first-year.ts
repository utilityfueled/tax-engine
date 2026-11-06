/** Explicit fictional records. Never interview defaults or tax-law expected-value formulas. */
import {startCompleteInterview,completeBusinessSection} from '../guided-interview/complete-facts';
import type {BusinessSourceData} from '@/lib/guided-business-facts';
import {confirmGuidedMacrsAsset,confirmGuidedMacrsCollection,type GuidedMacrsAssetsDraft,type GuidedMacrsAssetRow} from '@/lib/guided-macrs-assets';
export function macrsRow(overrides:Partial<GuidedMacrsAssetRow>={}):GuidedMacrsAssetRow{return {
 assetReference:'fictional-inventory-machine-1',description:'Fictional ordinary machine',grossCostBasis:'10000',businessUsePercentage:'60',placedInServiceDate:'2025-02-01',recoveryPeriod:'5',method:'200DB',section179BusinessDeduction:'0',bonusBusinessDeduction:'0',
 grossBasisSourceReference:'fictional-invoice-private-marker',businessUseSourceReference:'fictional-use-log',section179SourceReference:'fictional-no179-worksheet',bonusSourceReference:'fictional-zero-bonus-worksheet',bonusZeroTreatment:'elected_out',bonusTreatmentSourceReference:'fictional-election-out-original',
 ordinaryNonlistedConfirmed:true,nonpassengerConfirmed:true,noDispositionConfirmed:true,constantBusinessUseConfirmed:true,noHistoryConfirmed:true,noOtherBasisAdjustmentsConfirmed:true,noConversionOrCarryoverBasisConfirmed:true,section179NotElectedConfirmed:true,...overrides,
};}
export function macrsDraft(rows:GuidedMacrsAssetRow[]=[macrsRow()]):GuidedMacrsAssetsDraft{return {sourceTaxYear:'2025',sourceReference:'fictional-complete-private-inventory',fullCalendarYearConfirmed:true,allAssetsForThisBusinessConfirmed:true,noOtherActivityAssetsConfirmed:true,noOtherDepreciationOrAmortizationConfirmed:true,notDeductedElsewhereConfirmed:true,rows};}
export function macrsFixture(){
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['self-employment'],lifeEvents:[],stateCode:null});
 state.sectionData['income-self-employment']=structuredClone(completeBusinessSection);
 const facts:BusinessSourceData=state.sectionData['income-self-employment']!.businessFacts!;
 facts.depreciationMethod='assets';facts.scheduleCSourceFacts={sourceTaxYear:2025,sourceReference:'fictional-business-original',sourceFactsConfirmed:true,accountHolder:'primary',ownerName:'Jordan Example',businessNameStatus:'blank_original',businessEINStatus:'not_issued',address:{method:'home_at_return_address',homeAtReturnAddressConfirmed:true,homeReturnAddress:{street:'42 Example Road',city:'Columbus',state:'OH',zip:'43215'}}};
 facts.macrsAssets=macrsDraft();facts.macrsAssets.rows=facts.macrsAssets.rows!.map(row=>confirmGuidedMacrsAsset(row,facts.macrsAssets!));facts.macrsAssets=confirmGuidedMacrsCollection(facts.macrsAssets,facts);
 return {state,facts};
}
