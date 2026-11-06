/** Fictional actual originals only; no production defaults or calculated-source generation. */
import {TaxYearInputSchema} from '@/models/inputs';
import type {OhioResidencyDraft} from '@/lib/guided-ohio-residency-facts';
import type {OhioPaymentDraft} from '@/lib/guided-ohio-payment-facts';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {canonicalOhioBusinessFixture} from './oh-canonical-business-sources';
import {startCompleteInterview,completeBusinessSection} from '../guided-interview/complete-facts';

function rawDraft(value:unknown,key=''):unknown{
 if(Array.isArray(value))return value.map(v=>rawDraft(v));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rawDraft(v,k)]));
 return (key==='taxYear'||key==='sourceTaxYear')&&typeof value==='number'?String(value):value;
}
/** Explicit structural source metadata only; preserves authored undefined keys through JSON. */
function undefinedSourcePaths(value:unknown,path:Array<string|number>=[]):Array<Array<string|number>>{
 if(!value||typeof value!=='object')return[];
 return Object.keys(value).flatMap(key=>{const part=Array.isArray(value)?Number(key):key;const child=Reflect.get(value,key);const current=[...path,part];return child===undefined?[current]:undefinedSourcePaths(child,current);});
}
export function guidedOhioBusinessFixture(status:'nonresident'|'part_year_resident'='nonresident',profit:'100000'|'400000'|'1000000'='400000'){
 const original=canonicalOhioBusinessFixture(2025,profit,status);
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['self-employment'],lifeEvents:[],stateCode:'OH'});
 const personal=state.sectionData['personal-info'];if(!personal)throw Error('Explicit fictional personal originals required');
 Object.assign(personal,{firstName:'Fictional',lastName:'OhioConsultant',ssn:'900-70-0411',dateOfBirth:'1990-01-15',addressLine1:'100 Fictional Source Street',city:'Richmond',state:'VA',zip:'23219',stateResidency:status==='nonresident'?'nonresident':'part-year'});
 state.sectionData['income-self-employment']={...structuredClone(completeBusinessSection),manualGrossReceipts:profit,businessFacts:{...structuredClone(completeBusinessSection.businessFacts),activityDescription:'Fictional Current Ordinary Services',businessCode:'541990'}};
 const raw=buildTaxInputFromGuidedData(state);if(!raw)throw Error('Actual fictional current C original must exist before any Ohio snapshot');
 const input=TaxYearInputSchema.parse(raw);if(!input.scheduleC)throw Error('Actual current C original required');
 const {ohioResidency:_r,ohioPayments:_p,ohioSchoolDistrict:_s,...federalOriginals}=input;
 const source=structuredClone(original.facts.businessSources);
 const business=source.facts.businesses[0];if(!business)throw Error('Actual ordinary C original row required');
 business.originalBusiness=structuredClone(input.scheduleC) as typeof business.originalBusiness;
 const drafted=rawDraft(source) as Record<string,unknown>;
 // Explicit fixture-supplied records precede reads; the UI must obtain these only by action.
 const businessDraft:Record<string,unknown>&{originalFederalSources?:Record<string,unknown>}={...drafted,originalFederalSources:structuredClone(federalOriginals),originalBusinessSourcePacket:structuredClone(source),originalBusinessUndefinedPaths:undefinedSourcePaths(input.scheduleC).map(path=>({businessIndex:0,path}))};
 const residency={...structuredClone(original.facts),taxYear:'2025',originalFederalSources:structuredClone(federalOriginals),businessSources:businessDraft} as unknown as OhioResidencyDraft & {businessSources:typeof businessDraft};
 const payments:OhioPaymentDraft={taxYear:'2025',sourceReference:'Fictional actual complete ordinary C account through April1',sourceFactsConfirmed:true,originalFederalSources:structuredClone(federalOriginals),calendarYearConfirmed:true,allPaymentsIncludedConfirmed:true,paymentRows:[],priorReturn:{status:'no_return',sourceReference:'Fictional actual prior full account no Ohio return'},priorCreditCarryforward:{status:'none',sourceReference:'Fictional actual no applied prior credit'},remainingTaxPayment:profit==='1000000'?{status:'expected_payment',sourceReference:'Fictional actual planned April15 payment of1877 principal',sourceFactsConfirmed:true,date:'2026-04-15',amountAppliedToTax:'1877'}:{status:'no_remaining_tax',sourceReference:'Fictional independently stated zero Ohio principal after NRC',sourceFactsConfirmed:true},currentTiming:{kind:'expected',expectedDate:'2026-04-15',asOfDate:'2026-04-01'},filingExtension:{kind:'none'},paymentExtension:{kind:'none'},returnKind:'original',specialFacts:{farmingFishingIncome:'known_none',militaryDisasterRelief:'known_none'},balanceFacts:{sourceReference:'Fictional actual no use purchases/outgoing elections/donations',useTax:'0',outgoingCarryforward:'0',donations:'0'}};
 state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',ohioResidency:residency,ohioPayments:payments};
 return{state,input,residency,business:businessDraft,payments,expected:original.expected};
}
