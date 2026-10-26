/** Completed ordinary K-1 passive source calculation without an income assumption. */
import type { ScheduleEResult } from '@/engine/schedules/schedule-e.js';
import { calculateForm8582 } from '@/engine/forms/form-8582.js';
import { validateK1QbiLossSources, type K1QbiLossSourceInput } from '@/engine/forms/k1-qbi-loss-sources.js';
import { calculateK1PassiveDistributionSources } from './k1-passive-distribution-sources.js';
import { d, sum } from '@/utils/decimal.js';

export function calculateK1OrdinaryPassiveSources(input: K1QbiLossSourceInput, scheduleE: ScheduleEResult) {
  const sources=validateK1QbiLossSources(input);
  if(sources.length===0||scheduleE.partnerships.length!==sources.length||scheduleE.rentalProperties.length>0) {
    throw new Error('K1 ordinary classification requires every actual original business and calculated ScheduleE source');
  }
  for(const source of sources) {
    const original=input.scheduleK1[source.k1Index],entry=scheduleE.partnerships[source.k1Index];
    if(!entry||entry.name!==original.partnershipName||entry.ein!==original.partnershipEIN
      ||!entry.rawNetAmount.eq(source.ordinaryIncome)||entry.isPassive!==original.isPassiveActivity
      ||entry.isRentalRealEstate||entry.isPubliclyTradedPartnership||entry.ptpFullyDisposedInTaxableTransaction
      ||!entry.ptpDispositionGainOrLoss.isZero()||!entry.basisResult
      ||!d(original.form6198?.ordinaryIncome).eq(entry.basisAdjustedNetAmount)) {
      throw new Error('K1 ordinary classification requires matching canonical ordinary basis and at-risk sources');
    }
  }
  const distribution=calculateK1PassiveDistributionSources(input,scheduleE);
  const passiveEntries=scheduleE.partnerships.filter(row=>row.isPassive);
  const passiveNames=new Set(passiveEntries.map(row=>row.name));
  const knownNames=new Set(scheduleE.partnerships.map(row=>row.name));
  if((input.priorYear?.suspendedPassiveLosses??[]).some(row=>!knownNames.has(row.partnershipName))) {
    throw new Error('K1 ordinary classification requires every actual prior passive source identity');
  }
  const passive=calculateForm8582({scope:'ordinary_nonrental_part_i',filingStatus:input.taxpayer.filingStatus,
    activities:passiveEntries.map((row,passiveIndex)=>({name:row.name,reportingFormAndLine:'Schedule E, line 28',
      income:row.passiveIncome.plus(distribution.rows.find(item=>item.passiveIndex===passiveIndex)?.gain??0),loss:row.passiveLoss,isRentalRealEstate:false,isActiveParticipant:false})),
    priorYearSuspendedLosses:input.priorYear?.suspendedPassiveLosses?.filter(row=>passiveNames.has(row.partnershipName))
      .map(row=>({name:row.partnershipName,amount:d(row.amount)})),
  });
  const scheduleESupplementalIncome=sum(scheduleE.totalNonpassiveIncome,scheduleE.totalNonpassiveLoss,
    passive.passiveIncome).minus(passive.allowedLoss).minus(distribution.ordinaryTransferExclusion);
  return {sources,passive,scheduleESupplementalIncome};
}
