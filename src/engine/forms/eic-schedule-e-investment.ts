/** Publication596 Worksheet1, represented ScheduleE royalty and passive components. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { ScheduleEResult } from '@/engine/schedules/schedule-e.js';
import type { Form8582Result } from './form-8582.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, roundDollar, sum, zeroFloor } from '@/utils/decimal.js';

interface EicScheduleEInvestmentInput {
  input: TaxYearInput;
  scheduleE: ScheduleEResult;
  passive: Form8582Result;
  /** Final or Pub974 ordered allowance actually transferred into this income pass. */
  allowedPassiveLoss: Decimal;
  section163jDeduction: Decimal;
}

export function calculateEicScheduleEInvestment({ input, scheduleE, passive, allowedPassiveLoss, section163jDeduction }: EicScheduleEInvestmentInput) {
  const audit = new AuditTrail();
  const royaltyIncome = zeroFloor(scheduleE.totalRoyaltyIncome);
  audit.record('EIC Investment Income Worksheet','8','Represented gross portfolio royalty income',scheduleE.grossRoyaltyIncome,
    'ScheduleE portfolio royalties, separate from rental and ordinary business income');
  audit.record('EIC Investment Income Worksheet','9','Actual direct royalty property expenses',scheduleE.totalRoyaltyExpenses,
    'Completed direct-property expense ledger; no unrelated passive or business loss');
  audit.record('EIC Investment Income Worksheet','10','Represented net royalty investment income',royaltyIncome,
    'Gross portfolio royalties less actual direct-property expenses, floored at zero. Unrepresented property expense and personal-property rental methods remain separate.');
  let passiveIncome = passive.rentalIncome.plus(passive.passiveIncome);
  let passiveLoss = allowedPassiveLoss.negated();
  const unresolved: string[] = [];
  if (section163jDeduction.gt(0) && scheduleE.partnerships.some(row => row.isPassive)) {
    unresolved.push('Passive partnership EBIE requires its source-bound loss ordering method');
  }
  let passiveIndex = -1;
  for (const [index, original] of input.scheduleK1.entries()) {
    const entry = scheduleE.partnerships[index];
    if (!entry || entry.name !== original.partnershipName || entry.ein !== original.partnershipEIN) {
      throw new Error('EIC passive investment requires matching original ScheduleE source indexes');
    }
    if (!entry.isPassive) continue;
    passiveIndex += 1;
    // Overall ordinary PTP gain is nonpassive. Its offsetting ordinary income
    // and allowed loss net to zero, independently of the regular passive pool.
    if (entry.isPubliclyTradedPartnership || original.entityType === 's_corporation') continue;
    const verified = original.selfEmploymentFactsConfirmed === true && original.selfEmploymentEarnings !== undefined
      && original.selfEmploymentNetEarningsAfterAdjustments !== undefined && original.selfEmploymentIncomeType !== undefined;
    const earnings = d(verified ? original.selfEmploymentNetEarningsAfterAdjustments : original.selfEmploymentEarnings);
    if (earnings.isZero()) continue;
    const row = passive.activityRows.find(value => value.sourceIndex === passiveIndex);
    const allocation = passive.activityAllocations.find(value => value.sourceIndex === passiveIndex);
    const currentAllowedLoss = allocation?.allowedLoss ?? d(0);
    // A guaranteed payment can be the entire SE source while this activity
    // contributes no regular passive amount at all. There is then no overlap.
    if (row?.currentIncome.isZero() && currentAllowedLoss.isZero()) continue;
    const ordinaryOnly = ['netRentalIncome','otherNetRentalIncome','guaranteedPayments','otherIncome','section179Deduction','otherDeductions'] as const;
    const canonicalCurrent = row ? row.currentIncome.minus(currentAllowedLoss) : undefined;
    if (!verified || !row || row.sourcePriorYearSuspendedLoss.gt(0)
      || ordinaryOnly.some(field => !d(original[field]).isZero())
      || !d(original.selfEmploymentEarnings).eq(d(original.ordinaryIncome))
      || !entry.rawNetAmount.eq(d(original.ordinaryIncome))
      || !canonicalCurrent?.eq(roundDollar(earnings))
      || (earnings.gt(0) && !earnings.eq(entry.passiveIncome))
      || (earnings.lt(0) && !earnings.negated().eq(currentAllowedLoss))) {
      unresolved.push(`scheduleK1:${index} needs its separate earned/passive overlap source method`);
      continue;
    }
    passiveIncome = passiveIncome.minus(row.currentIncome);
    passiveLoss = passiveLoss.plus(currentAllowedLoss);
    audit.record('EIC Investment Income Worksheet',`earned-overlap:${index}`,'Ordinary source already included in earned income',canonicalCurrent,
      'Actual confirmed entire ordinary Box14 source and adjusted current allowance; no other ordinary categories or prior passive loss',
      {'Original Box14':d(original.selfEmploymentEarnings),'Actual adjusted SE amount':earnings,'Passive current income':row.currentIncome,'Current allowed loss':currentAllowedLoss});
  }
  if (unresolved.length) return { royaltyIncome, passiveIncome: undefined, unresolved, lines:audit.getLines() };
  const netPassive = zeroFloor(sum(passiveIncome,passiveLoss));
  audit.record('EIC Investment Income Worksheet','11','Regular passive income excluding earned overlap',passiveIncome,
    'Completed Form8582 current rental and ordinary passive income, excluding amounts already included in earned income');
  audit.record('EIC Investment Income Worksheet','12','Allowed regular passive losses excluding earned overlap',passiveLoss,
    'Negative final current and prior Form8582 allowance actually transferred into income, excluding losses already included in earned income');
  audit.record('EIC Investment Income Worksheet','13','Net regular passive investment income',netPassive,
    'Lines11 plus12, floored at zero; royalties and nonpassive ordinary/PTP income remain separate');
  return { royaltyIncome, passiveIncome:netPassive, unresolved, lines:audit.getLines() };
}
