/** Complete fictional original facts; no calculated charitable or activity allowance. */
import { k1CharitableReturnFixture, charitableStatement } from './k1-charitable-return.js';
import { k1CharitableAtRiskFixture, requireRiskSource } from './k1-charitable-at-risk.js';
import { syntheticPublicCashHistory } from './charitable-carryover.js';

export function ordinaryGiftOnlyInput(entity: 'partnership' | 's_corporation' = 'partnership') {
  const input = k1CharitableReturnFixture(2025, true), source = charitableStatement(input), k1 = input.scheduleK1[0];
  k1.beginningBasis = '5000'; k1.entityType = entity;
  requireRiskSource(source.basis).entityType = entity;
  requireRiskSource(source.atRisk).priorYearAmountAtRisk = '0';
  requireRiskSource(k1.form6198).priorYearAmountAtRisk = '0';
  input.charitableCarryoverSources = syntheticPublicCashHistory([]);
  if (entity === 's_corporation') {
    Object.assign(k1, { beginningDebtBasis: '0', additionalLoansToScorp: '0', priorDebtBasisReduction: '0' });
    requireRiskSource(source.receipts)[0].originalBox = '12';
  }
  return input;
}

export function ordinaryGiftActivityInput() {
  const input = k1CharitableAtRiskFixture(true), source = charitableStatement(input);
  requireRiskSource(input.scheduleK1[0].form6198).otherDeductionsLosses = '0';
  requireRiskSource(requireRiskSource(source.atRisk).activityAllocation).charitableSourceIds = [];
  return input;
}
