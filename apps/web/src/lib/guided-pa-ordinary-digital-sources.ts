import type {TaxYearInput} from '@/models/inputs';
import {PAOrdinaryDigitalSourcesSchema,type PAOrdinaryDigitalSources} from '@/models/pa-ordinary-digital-sources';
import type {PAResidencyStatus} from '@/models/pa-residency';
import {calculatePAOrdinaryDigitalSources} from '@/engine/state/pa-ordinary-digital-sources';
/** Explicit start creates only unknown answers and actual source-index choices. */
export function startGuidedPAOrdinaryDigitalSources(input:TaxYearInput|null):PAOrdinaryDigitalSources{
 return {sourceTaxYear:null,sourceReference:'',sourceFactsConfirmed:null,allOriginalDigitalStatementsIncludedConfirmed:null,noOtherCapitalAdjustmentsConfirmed:null,
 statements:(input?.form1099DA??[]).map((_,originalIndex)=>({originalIndex,sourceReference:'',sourceFactsConfirmed:null,actualPaymentToPAConfirmed:null,notRefundedByPayerConfirmed:null}))};
}
export function updateGuidedPAOrdinaryDigitalSources(data:PAOrdinaryDigitalSources,patch:Partial<PAOrdinaryDigitalSources>):PAOrdinaryDigitalSources{return {...data,...patch,sourceFactsConfirmed:null};}
/** Only explicit confirmation copies current private originals. Residency is still
 * independently replayed by the containing canonical source method afterwards. */
export function confirmGuidedPAOrdinaryDigitalSources(input:TaxYearInput,draft:unknown,status:PAResidencyStatus):PAOrdinaryDigitalSources{
 const data=PAOrdinaryDigitalSourcesSchema.parse(draft),candidate:PAOrdinaryDigitalSources={...data,sourceFactsConfirmed:true,
 statements:data.statements.map(row=>({...row,original:row.originalIndex===null?undefined:structuredClone(input.form1099DA[row.originalIndex])}))};
 calculatePAOrdinaryDigitalSources(input,candidate,{status});return candidate;
}
