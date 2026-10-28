/** Zero or unique original excess under170(d)(1)(B). Spec: charitable-determined-nol.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, roundDollar, sum } from '@/utils/decimal.js';
import { charitableNolOriginRows, charitableNolAmountKinds, createCharitableNolOriginLimit, readCharitableNolOrigins,
  type CharitableNolOrigin, type CharitableNolOriginLimit } from '@/utils/charitable-nol-origins.js';
import { calculateCharitableCarryover, type CharitableCarryoverBalance, type CharitableCarryoverResult } from './charitable-carryover.js';
import { calculateCharitableDeterminedFloor } from './charitable-determined-floor.js';
import { allocateCharitablePrivateMedia } from './charitable-private-media.js';

export interface DeterminedCharitableNolRow extends CharitableNolOrigin {
  normalUse:Decimal; notCarried:Decimal; tentativeExcess:Decimal; reduction:Decimal; expired:Decimal; carryforward:Decimal;
}
export interface DeterminedCharitableNolResult {
  method:'zero_or_unique_original_excess'; returnTaxYear:number; ledger:CharitableNolOriginLimit['ledger']; sourceDigest:string;
  rows:DeterminedCharitableNolRow[]; normalDeduction:Decimal; normalReportedDeduction:Decimal;
  nolCarryforward:Decimal; counterfactualNolCarryforward:Decimal; reduction:Decimal; expired:Decimal; carryforward:Decimal;
  carryforwards:CharitableCarryoverBalance[]; lines:CalculatedLine[];
}

export function calculateDeterminedCharitableNol(params:{
  input:TaxYearInput; ledger:CharitableNolOriginLimit['ledger']; normalContributionBase:Decimal;
  normalDeductionUsed:'standard'|'itemized'|'nonitemized'; nolCarryforward:Decimal;
  computeCarryover:(limit:CharitableNolOriginLimit)=>Decimal;
}):DeterminedCharitableNolResult {
  const {input,ledger}=params,sources=readCharitableNolOrigins(input),zero=d('0'),year=input.taxpayer.taxYear;
  if(!Decimal.isDecimal(params.normalContributionBase) || !params.normalContributionBase.isFinite()
    || !Decimal.isDecimal(params.nolCarryforward) || !params.nolCarryforward.isFinite() || params.nolCarryforward.lt(0) || !params.nolCarryforward.isInteger()
    || !['standard','itemized','nonitemized'].includes(params.normalDeductionUsed)) throw new Error('Determined charitable NOL requires actual income selection and completed succeeding NOL');
  const itemizes=params.normalDeductionUsed==='itemized',nolOriginLimit=createCharitableNolOriginLimit(input,ledger);
  const context={contributionBase:params.normalContributionBase,current:sources.current,nolOriginLimit};
  let normal:CharitableCarryoverResult;
  let currentUsed:typeof sources.current|undefined;
  if(year===2025) normal=calculateCharitableCarryover(input,{...context,itemizes});
  else {
    const floor=calculateCharitableDeterminedFloor(input,context);
    normal=itemizes?floor:{...floor,currentCash:zero,currentNoncash:zero,priorDeduction:zero,priorCashDeduction:zero,
      priorNoncashDeduction:zero,totalDeduction:zero,detail:floor.detail.map(row=>({...row,amountUsed:zero}))};
    const after=Object.fromEntries(Object.entries(floor.currentBeforeFloor).map(([key,value])=>[key,value.minus(floor.currentFloorByCategory[key as keyof typeof floor.currentFloorByCategory])])) as typeof floor.currentBeforeFloor;
    const media=allocateCharitablePrivateMedia(sources.current.cashPrivate,sources.current.noncashPrivate,after.other_30);
    currentUsed={cashPublic:after.cash_60,noncashPublic:after.noncash_50,capitalGainPublic:after.capital_gain_30,
      cashPrivate:media.cash,noncashPrivate:media.noncash,capitalGainPrivate:after.capital_gain_20};
  }
  const rows=charitableNolOriginRows(input,sources,ledger).map<DeterminedCharitableNolRow>(origin=>{
    if(origin.kind==='prior') {
      const detail=normal.detail.find(row=>row.sourceId===origin.sourceId);
      if(!detail || !detail.amountAvailable.eq(origin.amount)) throw new Error('Normal charitable use must reconcile the original prior source');
      const expiredBefore=origin.contributionYear+5<year;
      return {...origin,normalUse:detail.treatedAsPaid,notCarried:zero,tentativeExcess:expiredBefore?zero:origin.amount.minus(detail.treatedAsPaid),
        reduction:zero,expired:expiredBefore?origin.amount:zero,carryforward:zero};
    }
    const tentativeExcess=sum(...normal.carryforwards.filter(row=>row.taxYear===year && row.category===origin.category && row.medium===origin.medium).map(row=>row.amount));
    const amountKey=(Object.keys(charitableNolAmountKinds) as (keyof typeof sources.current)[]).find(key=>charitableNolAmountKinds[key][0]===origin.category && charitableNolAmountKinds[key][1]===origin.medium);
    if(!amountKey) throw new Error('Unknown original charitable current category');
    const retained=origin.amount.minus(tentativeExcess),normalUse=currentUsed?.[amountKey]??retained;
    const notCarried=retained.minus(normalUse);
    if(tentativeExcess.lt(0) || retained.lt(0) || notCarried.lt(0)) throw new Error('Normal charitable excess must conserve original current sources');
    return {...origin,normalUse,notCarried,tentativeExcess,reduction:zero,expired:zero,carryforward:zero};
  });
  const excessRows=rows.filter(row=>row.tentativeExcess.gt(0));
  const retained=new Map(rows.map(row=>[`${row.kind}:${row.sourceId}`,row.amount.minus(row.tentativeExcess)]));
  const comparison=excessRows.length && params.nolCarryforward.gt(0)
    ?params.computeCarryover(createCharitableNolOriginLimit(input,ledger,retained)):params.nolCarryforward;
  if(!Decimal.isDecimal(comparison) || !comparison.isFinite() || !comparison.isInteger() || comparison.lt(0) || comparison.gt(params.nolCarryforward)) {
    throw new Error('Determined charitable comparison must reconcile actual succeeding NOL carry');
  }
  const benefit=params.nolCarryforward.minus(comparison);
  const pooledOrigins = excessRows[0]?.kind === 'prior'
    ? sources[ledger].find(row => row.sourceId === excessRows[0].sourceId)?.filingUnitSources?.filter(row => d(row.openingBalance.numerator).gt(0)).length ?? 1 : 1;
  if(benefit.gt(0) && (excessRows.length!==1 || pooledOrigins > 1)) throw new Error('Positive charitable NOL benefit across multiple original excess sources requires its separate attribution method');
  if(benefit.gt(0)) excessRows[0].reduction=Decimal.min(benefit,excessRows[0].tentativeExcess);
  for(const row of rows) {
    const remainder=row.tentativeExcess.minus(row.reduction);
    if(row.kind==='prior' && row.contributionYear+5<=year) row.expired=row.expired.plus(remainder);
    else row.carryforward=remainder;
    if(!row.amount.eq(sum(row.normalUse,row.notCarried,row.reduction,row.expired,row.carryforward))) throw new Error('Charitable NOL origin must conserve exact use disallowance reduction expiry and carry');
  }
  const carryforwards=rows.filter(row=>row.carryforward.gt(0)).map(row=>({sourceId:row.sourceId,taxYear:row.contributionYear,category:row.category,medium:row.medium,amount:row.carryforward}));
  const audit=new AuditTrail();
  audit.merge(normal.lines.map(line=>({...line,form:`${line.form} ${ledger} NOL normal`})));
  audit.record('Determined Charitable NOL',`${ledger}:benefit`,'Succeeding NOL preserved by original charitable excess',benefit,
    'One simultaneous comparison removes all normal excess; zero benefit needs no attribution and positive benefit requires exactly one excess origin',
    {actualSucceedingNol:params.nolCarryforward,comparisonSucceedingNol:comparison,excessOrigins:String(excessRows.length)});
  rows.forEach((row,index)=>audit.record('Determined Charitable NOL',`${ledger}:origin-${index+1}`,'Original charitable source after NOL coordination',row.carryforward,
    'Original year category and medium; normal use plus noncarryable floor plus reduction plus expiry plus carry equals opening',
    {contributionYear:String(row.contributionYear),category:row.category,medium:row.medium,opening:row.amount,normalUse:row.normalUse,
      notCarried:row.notCarried,reduction:row.reduction,expired:row.expired}));
  return {method:'zero_or_unique_original_excess',returnTaxYear:year,ledger,sourceDigest:sources.sourceDigest,rows,
    normalDeduction:normal.totalDeduction,
    normalReportedDeduction:itemizes?sum(roundDollar(normal.currentCash),roundDollar(normal.currentNoncash),roundDollar(normal.priorDeduction)):zero,
    nolCarryforward:params.nolCarryforward,counterfactualNolCarryforward:comparison,reduction:sum(...rows.map(row=>row.reduction)),
    expired:sum(...rows.map(row=>row.expired)),carryforward:sum(...carryforwards.map(row=>row.amount)),carryforwards,lines:audit.getLines()};
}
