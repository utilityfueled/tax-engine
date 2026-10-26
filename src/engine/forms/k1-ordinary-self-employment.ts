/** Derive the ordinary current Box14 deduction from completed source limits. */
import type { ScheduleK1 } from '@/models/inputs.js';
import type { ScheduleEResult } from '@/engine/schedules/schedule-e.js';
import type { K1QbiLossSourceInput } from '@/engine/forms/k1-qbi-loss-sources.js';
import { calculateK1OrdinaryPassiveSources } from '@/engine/forms/k1-ordinary-passive-sources.js';
import { AuditTrail } from '@/utils/audit.js';
import { d } from '@/utils/decimal.js';

export function calculateK1OrdinarySelfEmployment(input: K1QbiLossSourceInput, scheduleE: ScheduleEResult) {
  const selected=input.qbiLossSources?.activities?.filter(row=>row.selfEmploymentTreatment!==undefined)??[];
  const audit=new AuditTrail();
  if(!selected.length) return {scheduleK1:input.scheduleK1,lines:audit.getLines(),passive:undefined};
  const {sources,passive}=calculateK1OrdinaryPassiveSources(input,scheduleE);
  const scheduleK1:ScheduleK1[]=input.scheduleK1.map((original,index)=>{
    const facts=selected.find(row=>row.k1SourceId===`scheduleK1:${index}`);
    if(!facts) return original;
    if(original.entityType!=='partnership') throw new Error('Ordinary partner self-employment treatment requires a partnership original');
    const source=sources.find(row=>row.k1Index===index),entry=scheduleE.partnerships[index];
    if(!source) throw new Error('Ordinary partner self-employment requires the original source identity');
    const raw=d(original.selfEmploymentEarnings);
    let calculated=raw;
    if(raw.lt(0)) {
      if(!raw.eq(source.ordinaryIncome)||source.priorPassiveLoss.gt(0)) {
        throw new Error('Negative Box14 with different ordinary character or prior passive loss requires its separate SE source method');
      }
      if(original.isPassiveActivity) {
        const passiveIndex=input.scheduleK1.slice(0,index).filter(row=>row.isPassiveActivity).length;
        calculated=(passive.activityAllocations.find(row=>row.sourceIndex===passiveIndex)?.allowedLoss??d(0)).negated();
      } else calculated=entry.netAmount;
    }
    for(const supplied of [original.selfEmploymentNetEarningsAfterAdjustments,facts.statement?.selfEmploymentNetEarningsAfterAdjustments]) {
      if(supplied!==undefined&&(!d(supplied).isFinite()||!d(supplied).eq(calculated))) {
        throw new Error('Supplied adjusted partner earnings must match the source-calculated ordinary current SE amount');
      }
    }
    audit.record('K1 SE Sources',`scheduleK1:${index}`,'Calculated ordinary current partner SE earnings',calculated,
      raw.lt(0)?'Matching original ordinary/Box14 current loss after actual basis, at-risk and nonrental passive limits; no prior SE loss'
        :'Original Box14 with actual no-other-partner-adjustment and independent zero prior SE facts',
      {'Original Box14':raw,'Original ordinary income/loss':source.ordinaryIncome,
        'After basis':entry.basisAdjustedNetAmount,'After at risk':entry.netAmount,'Calculated SE transfer':calculated});
    return {...original,selfEmploymentNetEarningsAfterAdjustments:calculated.toFixed()};
  });
  return {scheduleK1,lines:audit.getLines(),passive};
}
