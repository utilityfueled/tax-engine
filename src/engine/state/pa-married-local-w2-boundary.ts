/** Spec: state/pa-married-local-w2-boundary.yaml. Actual source handoff, no local tax calculation. */
import type Decimal from 'decimal.js';
import type {W2StateLocalSources} from '@/models/w2-state-local.js';
import type {calculateW2StateLocalSources} from '@/engine/forms/w2-state-local.js';
import {publicOrdinaryMoney} from './pa-ordinary-source-precision.js';
export interface PAMarriedReportedLocalW2Row{
 originalIndex:number;accountHolder:'primary'|'spouse';printedRow:number;
 jurisdictionIndex:number|null;localityNameStatus:'reported'|'blank_original';wages:Decimal;withheld:Decimal;
}
const normalized=(value:string)=>value.trim().replace(/\s+/gu,' ').toUpperCase();
/** The caller must first admit the complete original through the W2 row validator.
 * Exact jurisdiction links are explicitly reviewed source facts, not inferred tax
 * residence, rates, liability, payments settled or local return qualification. */
export function mapPAMarriedLocalW2Boundary(originalIndex:number,accountHolder:'primary'|'spouse',source:W2StateLocalSources,checked:ReturnType<typeof calculateW2StateLocalSources>,jurisdictions:Array<{name:string;separateReturnRequired:boolean|null}>):PAMarriedReportedLocalW2Row[]{
 return checked.localRows.map((row,index)=>{
  const original=source.localRows[index];
  if(!original||original.printedRow!==row.printedRow)throw Error('PA married local W2 boundary: complete actual printed row identity required');
  const jurisdictionIndex=original.localityNameStatus==='reported'?jurisdictions.findIndex(j=>normalized(j.name)===normalized(original.localityName)):-1;
  if(original.localityNameStatus==='reported'&&(jurisdictionIndex<0||jurisdictions[jurisdictionIndex].separateReturnRequired!==true))throw Error('PA married local W2 boundary: actual reported locality needs its explicitly reviewed separate-return jurisdiction; no alias or obligation is inferred');
  if(original.localityNameStatus==='blank_original'&&(!row.wages.isZero()||!row.withheld.isZero()))throw Error('PA married local W2 boundary: positive original blank-locality amounts require their actual jurisdiction source successor');
  return{originalIndex,accountHolder,printedRow:row.printedRow,jurisdictionIndex:jurisdictionIndex<0?null:jurisdictionIndex,localityNameStatus:row.localityNameStatus,wages:publicOrdinaryMoney(row.wages),withheld:publicOrdinaryMoney(row.withheld)};
 });
}
