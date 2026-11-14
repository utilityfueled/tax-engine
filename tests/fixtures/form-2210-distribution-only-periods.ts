import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { parseInput } from '../../src/index.js';
import { actualSpecialRatePeriodAmounts, guidedEstimatedTaxSpecialGainsState } from './guided-estimated-tax-special-gains.js';

/** Fictional complete originals; allocations are explicitly supplied, never inferred. */
export function distributionOnlyPeriodInput() {
  const state = guidedEstimatedTaxSpecialGainsState();
  const facts = state.sectionData.payments?.estimatedTaxFacts;
  if (!facts?.annualizedIncomePeriods) throw new Error('Complete fictional cumulative periods required');
  facts.specialRatePeriodsConfirmed = true;
  for (const [index, [rate28GainLoss, unrecaptured1250BeforeLosses]] of actualSpecialRatePeriodAmounts.entries()) {
    const period = facts.annualizedIncomePeriods[index];
    if (!period) throw new Error('All four actual period rows required');
    Object.assign(period, { rate28GainLoss, unrecaptured1250BeforeLosses });
  }
  const built = buildTaxInputFromGuidedData(state);
  if (!built) throw new Error('Complete fictional distribution-only source fixture must bridge');
  return parseInput(built);
}
