import { actualCodNolInput } from './cod-nol';
import { currentOriginCharitableHistoriesInput } from './form-172-charitable-histories';
import { priorCharitableNolInput } from './charitable-prior-nol';

/** Fictional original old losses, income and gifts; no calculated allowance. */
export function carriedCurrentCharitableHistoriesInput(options: {
  alternativeCarry?: boolean; positiveBenefit?: boolean; year?: number;
} = {}) {
  const year = options.year ?? 2025;
  const input = currentOriginCharitableHistoriesInput(year);
  const old = priorCharitableNolInput({ regular: '50000', alternative: '5000' });
  const vintage = old.netOperatingLoss?.vintages?.[0];
  if (!input.netOperatingLoss?.alternativeTax || !vintage) throw new Error('Missing fictional actual old losses');
  input.netOperatingLoss.vintages = [{ ...vintage, adjustedThroughTaxYear: year - 1 }];
  input.netOperatingLoss.alternativeTax.vintages = options.alternativeCarry === false ? [] : [{
    ...vintage, sourceId: 'independent-old-amt2021', adjustedThroughTaxYear: year - 1, section1411OriginalLoss: undefined,
  }];
  if (options.positiveBenefit) {
    input.w2s[0].wages = '110000';
    input.charitableCarryoverSources = old.charitableCarryoverSources;
    input.netOperatingLoss.alternativeTax.charitableCarryoverHistory = old.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory;
  }
  if (year === 2026) {
    const history = input.netOperatingLoss.alternativeTax.charitableCarryoverHistory;
    const regular = input.charitableCarryoverSources?.vintages?.[0];
    const alternative = history?.alternativeCarryoverSources?.vintages?.[0];
    if (!history || !regular || !alternative) throw new Error('Missing fictional independent charity sources');
    regular.category = 'capital_gain_30'; regular.medium = 'noncash';
    regular.originalExcess = '5000'; regular.openingCarryforward = '5000';
    alternative.category = 'capital_gain_30'; alternative.medium = 'noncash';
    history.priorRegularCarryovers = [{ taxYear: 2024, category: 'capital_gain_30', amount: '5000', sourceReference: 'Fictional original regular summary' }];
    history.priorAlternativeCarryovers = [{ taxYear: 2024, category: 'capital_gain_30', amount: '500', sourceReference: 'Fictional original AMT summary' }];
    Object.assign(input.donations[0], { type: 'cash', amount: '2000', costBasis: undefined, isLongTermCapitalGain: false });
  }
  return input;
}

/** Actual original excluded-debt facts; computed reduction is never supplied. */
export function carriedCurrentCharitableCodInput(options: Parameters<typeof carriedCurrentCharitableHistoriesInput>[0] = {}) {
  const input = carriedCurrentCharitableHistoriesInput(options), actual = actualCodNolInput('5000');
  input.form1099C = actual.form1099C; input.codExclusion = actual.codExclusion; input.form982NolSources = actual.form982NolSources;
  if (!input.form172) throw new Error('Missing fictional current source');
  input.form172.cancelledDebtIncluded = true;
  return input;
}
