import type { TaxYearInput } from '@/models/inputs';
import { d } from '@/utils/decimal';
import { k1CharitableReturnFixture, charitableStatement } from './k1-charitable-return';
import { singleCategoryCharitableNolInput } from './charitable-single-category-nol';
import { priorCharitableNolInput } from './charitable-prior-nol';
import { carriedCurrentCharitableHistoriesInput } from './form-172-charitable-carried-composition';

export function releaseFixtureSource<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Missing required fictional release source');
  return value;
}

/** Fictional original history and actual2025 basis; no computed release input. */
export function attachReleasedCharitableBasis(input: TaxYearInput, options: {
  sCorp?: boolean; cash?: boolean; amount?: string; ownerBasis?: string; currentCash?: string;
} = {}) {
  const gift = k1CharitableReturnFixture(2025, true), source = charitableStatement(gift), original = gift.scheduleK1[0];
  const basis = releaseFixtureSource(source.basis), amount = options.amount ?? '60000', currentCash = options.currentCash ?? '0';
  const originalBasis = options.cash ? amount : d(amount).plus('20000').toFixed();
  const originalValue = options.cash ? amount : d(originalBasis).plus('100000').toFixed();
  Object.assign(original, { beginningBasis: options.ownerBasis ?? amount, charitableCash: currentCash,
    charitableCapitalGain30: '0', charitableCapitalGain20: '0' });
  releaseFixtureSource(original.priorSuspendedLosses).charitable = amount;
  releaseFixtureSource(original.form6198).priorYearAmountAtRisk = '200000'; releaseFixtureSource(source.atRisk).priorYearAmountAtRisk = '200000';
  const current = releaseFixtureSource(basis.currentContributions)[0], receipt = releaseFixtureSource(source.receipts)[0];
  Object.assign(current, { contributionShare: currentCash, adjustedBasisShare: currentCash });
  basis.currentContributions = d(currentCash).isZero() ? [] : [current];
  source.receipts = d(currentCash).isZero() ? [] : [receipt];
  basis.priorBasisSuspensions = [{ sourceId: 'actual-prior-basis-2018', originTaxYear: 2018,
    category: options.cash ? 'cash_60' : 'capital_gain_30', contributionShare: originalValue,
    adjustedBasisShare: originalBasis, appreciationPreviouslyTakenIntoAccount: options.cash ? '0' : '100000',
    sourceReference: 'Fictional original2018 attached basis evidence',
    basisUseHistory: Array.from({ length: 7 }, (_, index) => ({ taxYear: 2018 + index,
      basisAllowed: index === 0 && !options.cash ? '20000' : '0' })) }];
  source.receipts.push({ basisSourceId: 'actual-prior-basis-2018', originalBox: '13', originalCode: options.cash ? 'A' : 'E',
    recipientName: 'Fictional original2018 qualified recipient', recipientCategory: 'fifty-percent', qualifiedOrganization: true,
    donorAdvisedFund: false, supportingOrganization: false, sourceReference: 'Fictional original2018 receipt', contributionDate: '2018-06-01',
    ...(options.cash ? {} : { propertyType: 'appreciated_stock' as const, acquisitionDate: '2016-01-01', fairMarketValueShare: originalValue }) });
  if (options.sCorp) {
    original.entityType = 's_corporation'; basis.entityType = 's_corporation';
    Object.assign(original, { beginningDebtBasis: '0', additionalLoansToScorp: '0', priorDebtBasisReduction: '0' });
    for (const row of source.receipts) row.originalBox = '12';
  }
  input.scheduleK1 = gift.scheduleK1; input.k1CharitableSources = gift.k1CharitableSources;
  return input;
}

export function releasedCharitableNolInput(options: Parameters<typeof attachReleasedCharitableBasis>[1] & { alternativeOnly?: boolean } = {}) {
  const input = singleCategoryCharitableNolInput('C', 2025, options.alternativeOnly); input.donations = [];
  return attachReleasedCharitableBasis(input, options);
}

export function releasedMixedCharitableNolInput() {
  const input = releasedCharitableNolInput({ ownerBasis: '40000', currentCash: '20000' });
  const empty = priorCharitableNolInput({ regular: '0', alternative: '0' });
  input.charitableCarryoverSources = empty.charitableCarryoverSources;
  releaseFixtureSource(releaseFixtureSource(input.netOperatingLoss).alternativeTax).charitableCarryoverHistory = releaseFixtureSource(releaseFixtureSource(empty.netOperatingLoss).alternativeTax).charitableCarryoverHistory;
  return input;
}

export function releasedCurrentOriginInput(oldLoss = true) {
  const input = carriedCurrentCharitableHistoriesInput(); input.donations = [];
  if (!oldLoss) { releaseFixtureSource(input.netOperatingLoss).vintages = []; releaseFixtureSource(releaseFixtureSource(input.netOperatingLoss).alternativeTax).vintages = []; }
  return attachReleasedCharitableBasis(input, { cash: true, amount: '1000' });
}
