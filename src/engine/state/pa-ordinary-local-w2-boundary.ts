/** Spec: spec/state/pa-ordinary-local-w2-boundary.yaml. Reported originals only. */
import Decimal from 'decimal.js';
import type {TaxYearInput} from '@/models/inputs.js';
import type {W2StateLocalSources} from '@/models/w2-state-local.js';
import type {W2StateLocalSourcesResult} from '@/engine/forms/w2-state-local.js';
import {mapPAMarriedLocalW2Boundary,type PAMarriedReportedLocalW2Row} from './pa-married-local-w2-boundary.js';
export type PAOrdinaryReportedLocalW2Row=Omit<PAMarriedReportedLocalW2Row,'accountHolder'>&{accountHolder:'primary'};
/** Caller first validates current whole originals and all source snapshots. Reuse
 * the unchanged reported-row contract; never derive a local tax rate/liability. */
export function mapPAOrdinaryLocalW2Boundary(input:TaxYearInput,checked:Array<W2StateLocalSourcesResult|undefined>,jurisdictions:Array<{name:string;returnRequired:boolean|null}>):PAOrdinaryReportedLocalW2Row[]{
 const obligations=jurisdictions.map(row=>({name:row.name,separateReturnRequired:row.returnRequired}));
 return input.w2s.flatMap((w,index)=>{
  const source=w.stateLocalSources as W2StateLocalSources|undefined;
  if(source===undefined){
   for(const amount of [w.localWages,w.localTaxWithheld])if(amount!==undefined&&new Decimal(amount).gt(0))throw new Error('PA ordinary local W2 boundary: positive legacy local wages/withholding require complete actual original row sources');
   return [];
  }
  const actual=checked[index];if(!actual||source.owner.accountHolder!=='primary')throw new Error('PA ordinary local W2 boundary: freshly checked actual primary-owner original required');
  return mapPAMarriedLocalW2Boundary(index,'primary',source,actual,obligations).map(row=>({...row,accountHolder:'primary' as const}));
 });
}
