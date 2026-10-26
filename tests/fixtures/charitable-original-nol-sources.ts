import { actualGuidedNolSources } from './guided-net-operating-loss';
import { actualGuidedK1Charity } from './guided-k1-charitable-sources';

/** Explicit fictional source records shared by unit and production browser checks. */
export function originalCharitableGuideSources() {
  const loss = structuredClone(actualGuidedNolSources), charity = actualGuidedK1Charity(), row = charity.statements?.[0];
  if (!loss.alternativeTax || !loss.vintages?.[0] || !row?.original?.form6198 || !row.basis?.currentContributions?.[0] || !row.receipts?.[0] || !row.atRisk) throw new Error('Missing fictional original source');
  Object.assign(loss.vintages[0], { originalLoss: '100000', openingCarryforward: '100000', section1411OriginalLoss: '0', history: [] });
  loss.alternativeTax.vintages = [];
  loss.alternativeTax.charitableCarryoverHistory = { sourceTaxYear: '2024', sourceReference: 'Fictional independent known-empty charity histories',
    sourceFactsConfirmed: true, allCarryoversIncluded: true, priorRegularCarryovers: [], priorAlternativeCarryovers: [] };
  row.original.charitableCapitalGain30 = '80000.00'; row.original.beginningBasis = '20000.00';
  row.original.form6198.priorYearAmountAtRisk = '100000'; row.atRisk.priorYearAmountAtRisk = '100000';
  Object.assign(row.basis.currentContributions[0], { contributionShare: '80000.00', adjustedBasisShare: '40000.00' });
  row.receipts[0].fairMarketValueShare = '80000.00';
  return { loss, charity };
}
