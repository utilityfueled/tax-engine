/** Complete empty original histories, not an entered zero deduction.
 * Spec: cod-empty-nol-foreign.yaml. */
import type { TaxYearInput } from '@/models/inputs.js';
import { d } from '@/utils/decimal.js';
import { calculateNetOperatingLoss } from './net-operating-loss.js';

export function hasCompleteEmptyForeignNolSources(input: TaxYearInput): boolean {
  const facts = input.netOperatingLoss;
  if (!facts) return false;
  const params = { taxYear: input.taxpayer.taxYear, filingStatus: input.taxpayer.filingStatus,
    taxpayer: input.taxpayer, standardDeductionFacts: input.standardDeductionFacts, facts };
  const regular = calculateNetOperatingLoss(params), alternative = facts.alternativeTax;
  if (alternative?.sourceFactsConfirmed !== true || !alternative.sourceReference?.trim()
    || alternative.allCarryoversIncluded !== true || alternative.specialDisasterCarryIncluded !== false
    || alternative.currentYearAdjustmentsCompleteConfirmed !== true
    || alternative.regularBasisAndLossLimitsSameAsAlternativeConfirmed !== true || !Array.isArray(alternative.vintages)) {
    throw new Error('Foreign composition requires complete independently confirmed AMT NOL history');
  }
  const amt = calculateNetOperatingLoss({ ...params, facts: { ...facts, ...alternative,
    filingUnitHistory: alternative.filingUnitHistory, sameCoupleJointHistory: alternative.sameCoupleJointHistory } });
  if (facts.vintages?.length !== 0 || alternative.vintages.length !== 0
    || !regular.availableCarryforward.isZero() || !amt.availableCarryforward.isZero()) return false;
  if (![input.priorYear?.nolCarryforward, input.priorYear?.excessBusinessLossNOL,
    ...(input.scheduleK1Form1041 ?? []).map(row => row.finalYearNOLCarryover)].every(value => d(value).isZero())) {
    throw new Error('Foreign empty NOL histories conflict with the actual saved loss sources');
  }
  return true;
}
