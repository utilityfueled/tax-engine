import type { TaxYearInput } from '@/models/inputs.js';

/** Explicit synthetic completed worksheet. Values are hand-derived at each call site. */
export function niitDispositionSources(capital: string, ordinary: string, excludedAdjustment: string): NonNullable<TaxYearInput['form8960Sources']> {
  return {
sourceTaxYear: 2025, sourceReference: 'Synthetic completed Form8960 disposition worksheet', sourceFactsConfirmed: true,
    dispositions: { regularCapitalGainOrLoss: capital, regularOrdinaryGainOrLoss: ordinary, excludedGainOrLossAdjustment: excludedAdjustment, passthroughAdjustment: '0' }
};
}
