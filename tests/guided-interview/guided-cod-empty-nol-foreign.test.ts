// Spec: spec/federal/cod-empty-nol-foreign.yaml guided-amt-history.
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildGuidedForeignTaxElection, guidedForeignTaxFactErrors } from '@/lib/guided-foreign-tax-election';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedCodEmptyNolForeignState } from '../fixtures/guided-cod-empty-nol-foreign';

it('binds independent AMT deduction history through the actual guided return', () => {
  const state = guidedCodEmptyNolForeignState(), original = JSON.stringify(state);
  expect(JSON.parse(readFileSync(new URL('../fixtures/cod-empty-nol-foreign-browser.json', import.meta.url), 'utf8'))).toEqual(state);
  // The actual synthetic section keeps its unrelated UI state complete; unknown wages are not defaulted to zero.
  expect(state.sectionData['other-taxes']!.householdEmploymentWages).toBe('');
  expect(state.sectionData['other-taxes']!.householdEmployees).toEqual([]);
  const election = state.sectionData['other-taxes']!.foreignTaxElection!;
  const investment = state.sectionData['income-investments']!;
  const built = buildGuidedForeignTaxElection(election, investment, 2025, 'single');
  expect(built?.deductionYearCarryover?.amt?.carryovers?.[0]).toMatchObject({ originTaxYear: 2024, amount: '300' });
  expect(built?.deductionYearCarryover?.amt?.firstPost1997CreditClaimTaxYear).toBe(2023);
  const raw = buildTaxInputFromGuidedData(state); expect(raw).not.toBeNull();
  const result = calculateFederalTax(TaxYearInputSchema.parse(raw));
  expect(result.carryforwards.foreignTaxCreditCarryforward.toFixed()).toBe('327');
  expect(result.carryforwards.amtForeignTaxCreditCarryforwardByCategory?.passive?.[0]?.amount.toFixed()).toBe('145');
  expect(JSON.stringify(state)).toBe(original);
  for (const patch of [{ sourceTaxYear: '' }, { sourceFactsConfirmed: undefined }, { carryovers: undefined },
    { adjustedThroughTaxYear: '2023' }, { firstPost1997CreditClaimTaxYear: '' }]) {
    const changed = structuredClone(election);
    Object.assign(changed.deductionYearCarryover!.amt!, patch);
    expect(guidedForeignTaxFactErrors(changed, investment, 2025, 'single')).toHaveProperty('foreignTaxElection');
  }
  const empty = structuredClone(election);
  empty.deductionYearCarryover!.amt = { sourceTaxYear: '2025', adjustedThroughTaxYear: '2024',
    sourceReference: 'Actual separate empty AMT history', sourceFactsConfirmed: true, carryoverHistoryConfirmed: true, carryovers: [] };
  expect(buildGuidedForeignTaxElection(empty, investment, 2025, 'single')?.deductionYearCarryover?.amt?.carryovers).toEqual([]);
});
