// Spec: spec/federal/cod-principal-residence-independent.yaml adjacent-cap.
import { expect, it } from 'vitest';
import { calculateFederalTax, parseInput } from '../../../src/index.js';
import { principalResidenceCodInput } from '../../fixtures/cod-principal-residence.js';

it('preserves adjacent cap allocations through the public return', () => {
  for (const [loan, excluded, taxable, closingBasis] of [
    ['750001', '49.01', '1', '299950.99'],
    ['750000', '50.01', '0', '299949.99'],
  ]) {
    const raw = principalResidenceCodInput();
    raw.form1099C[0].amountDischarged = '50.01';
    raw.form982PrincipalResidenceSources.debt.amountDischarged = '50.01';
    raw.form982PrincipalResidenceSources.debt.actualDischargedPrincipal = '50.01';
    raw.form982PrincipalResidenceSources.acquisition.outstandingPrincipal = loan;
    const input = parseInput(raw), original = JSON.stringify(input);
    const result = calculateFederalTax(input);
    expect(result.schedule1?.cancelledDebtIncome.toFixed()).toBe(taxable);
    expect(result.form982?.totalReduction.toFixed()).toBe(excluded);
    expect(result.form982?.unreducedExclusion.toFixed()).toBe('0');
    expect(result.form982?.reducedAttributes.basisOfPrincipalResidence.toFixed()).toBe(closingBasis);
    expect(result.codNolReduction).toBeUndefined();
    expect(JSON.stringify(input)).toBe(original);
  }
});
