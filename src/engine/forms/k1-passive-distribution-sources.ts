/** Internal original-index capital/passive handoff; no taxpayer allocation scalar. */
import type { ScheduleEResult } from '@/engine/schedules/schedule-e.js';
import type { K1QbiLossSourceInput } from './k1-qbi-loss-sources.js';
import { validateK1QbiLossSources } from './k1-qbi-loss-sources.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, roundDollar, sum } from '@/utils/decimal.js';
export function calculateK1PassiveDistributionSources(input:K1QbiLossSourceInput,scheduleE:ScheduleEResult) {
  const audit=new AuditTrail();
  if(!input.k1CharitableSources?.statements?.some(row=>row.cashDistribution?.activityCharacter==='single_passive_business'))
    return {rows:[],gain:d(0),ordinaryTransferExclusion:d(0),lines:audit.getLines()};
  const sources=validateK1QbiLossSources(input);
  if(input.qbiLossSources?.form461Classification) throw new Error('K1 passive distribution business-capital Form461 attribution requires its separate actual source method');
  const rows=sources.filter(source=>input.k1CharitableSources?.statements?.find(row=>row.k1SourceId===source.sourceId)?.cashDistribution?.activityCharacter==='single_passive_business').map(source=>{
    const k=input.scheduleK1[source.k1Index],entry=scheduleE.partnerships[source.k1Index];
    if(!entry||entry.name!==k.partnershipName||entry.ein!==k.partnershipEIN||entry.isPassive!==true
      ||!entry.rawNetAmount.eq(source.ordinaryIncome)||!entry.basisResult||entry.isRentalRealEstate||entry.isPubliclyTradedPartnership
      ||!entry.basisResult.excessDistributionGain.eq(source.passiveCapitalGain))
      throw new Error('K1 passive distribution requires the exact canonical original-index ScheduleE and basis source');
    const passiveIndex=input.scheduleK1.slice(0,source.k1Index).filter(row=>row.isPassiveActivity).length;
    const sourceIncome=entry.passiveIncome.plus(source.passiveCapitalGain);
    // Form8582 rounds the complete activity income. Preserve the ordinary
    // component's existing reported amount when removing capital already on D.
    const ordinaryTransferExclusion=roundDollar(sourceIncome).minus(roundDollar(entry.passiveIncome));
    audit.record('K1 Passive Distribution',`capital-${source.k1Index+1}`,'Owner capital gain supplying passive activity income',source.passiveCapitalGain,
      'Actual complete single passive activity; gain remains on8949/D and never increases entity basis or QBI',
      {'Source activity income':sourceIncome,'Reported Form8582 income':roundDollar(sourceIncome),
        'Reported ordinary income':roundDollar(entry.passiveIncome),'Excluded from ordinary transfer':ordinaryTransferExclusion});
    return {k1Index:source.k1Index,passiveIndex,gain:source.passiveCapitalGain,sourceIncome,ordinaryTransferExclusion};
  });
  return {rows,gain:sum(...rows.map(row=>row.gain)),ordinaryTransferExclusion:sum(...rows.map(row=>row.ordinaryTransferExclusion)),lines:audit.getLines()};
}
