import { originalCharitableGuideSources } from './charitable-original-nol-sources';

/** Fictional original records shared by source and production-browser tests. */
export function releasedCharitableGuideSources() {
  const { loss, charity } = originalCharitableGuideSources(), row = charity.statements?.[0];
  if (!row?.original?.priorSuspendedLosses || !row.original.form6198 || !row.basis || !row.atRisk) throw new Error('Missing fictional original K1');
  Object.assign(row.original, { charitableCash: '0', charitableCapitalGain30: '0', beginningBasis: '60000' });
  row.original.priorSuspendedLosses.charitable = '60000';
  row.original.form6198.priorYearAmountAtRisk = '200000'; row.atRisk.priorYearAmountAtRisk = '200000';
  row.basis.currentContributions = [];
  row.basis.priorBasisSuspensions = [{ sourceId: 'actual-prior-basis-2018', originTaxYear: '2018', category: 'capital_gain_30',
    contributionShare: '180000', adjustedBasisShare: '80000', appreciationPreviouslyTakenIntoAccount: '100000',
    sourceReference: 'Fictional original2018 attached basis evidence',
    basisUseHistory: Array.from({ length: 7 }, (_, i) => ({ taxYear: String(2018 + i), basisAllowed: i === 0 ? '20000' : '0' })) }];
  row.receipts = [{ basisSourceId: 'actual-prior-basis-2018', originalBox: '13', originalCode: 'E',
    recipientName: 'Fictional original2018 qualified recipient', recipientCategory: 'fifty-percent', qualifiedOrganization: true,
    donorAdvisedFund: false, supportingOrganization: false, sourceReference: 'Fictional original2018 receipt',
    contributionDate: '2018-06-01', propertyType: 'appreciated_stock', acquisitionDate: '2016-01-01', fairMarketValueShare: '180000' }];
  return { loss, charity };
}
