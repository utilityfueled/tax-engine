import { carriedCurrentCharitableCodInput } from './form-172-charitable-carried-composition';

/** Fictional original income, debt and independent loss/gift histories only. */
export function charitableCodModifiedInput(capitalLoss = false) {
  const input = carriedCurrentCharitableCodInput({ positiveBenefit: true });
  if (capitalLoss) {
    input.priorYear = { ...input.priorYear, shortTermCapitalLoss: '-3000', longTermCapitalLoss: '0' };
    if (!input.form172) throw new Error('Missing fictional current loss source');
    input.form172.capitalSources = {
      sourceTaxYear: 2025, sourceReference: 'Fictional complete investment capital records', sourceFactsConfirmed: true,
      allCapitalSourcesIncluded: true, transactions: [], distributions: [],
      priorCapitalLosses: { sourceTaxYear: 2024, sourceReference: 'Fictional filed capital loss worksheet',
        sourceFactsConfirmed: true, allCarryoversIncluded: true, sameReturnMembershipConfirmed: true,
        nonbusinessInvestmentConfirmed: true, shortTermCapitalLoss: '-3000', longTermCapitalLoss: '0' },
      alternativeTax: { sourceReference: 'Fictional independent AMT capital worksheet', sourceFactsConfirmed: true,
        currentBasisAndAdjustmentsSameConfirmed: true, priorCapitalLossesSameConfirmed: true },
    };
  }
  return input;
}
