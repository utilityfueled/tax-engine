// Spec: spec/federal/guided-child-election.yaml.
import { expect, it } from 'vitest';
import { buildGuidedChildElections, childElectionFactErrors, updateChildElection } from '@/lib/guided-child-election-facts';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { actualGuidedChild } from '../fixtures/guided-child-election';
import { startCompleteInterview } from './complete-facts';

function fixture() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['investments'], lifeEvents: [], stateCode: null });
  state.sectionData['income-investments'] = { interestEntries: [], dividendEntries: [], brokerageEntries: [], childElections: [structuredClone(actualGuidedChild)] };
  return state;
}
it('passes actual child income and AMT sources to the canonical parent return', () => {
  const state = fixture(), input = buildTaxInputFromGuidedData(state);
  expect(input).not.toBeNull();
  if (!input) throw new Error('Missing actual source input');
  expect(input.form8814[0]?.taxableInterest).toBe('4000.25');
  expect(input.form8814[0]?.electionFacts?.timelyElectionStatus).toBe('planned_timely');
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.form8814?.totalOtherIncome.toFixed()).toBe('1300.25');
  expect(result.taxExemptInterest.toFixed()).toBe('0');
  expect(result.allLines.find(line => line.form === 'Form 6251' && line.line === '2g')?.value.toFixed()).toBe('125.1');
  expect(redactReviewIdentifiers(input).form8814[0]?.electionFacts?.child.ssn).toBe('');
  expect(JSON.stringify(result.allLines)).not.toContain('321-54-6701');
});
it('preserves unknown and special sources rather than inventing eligible facts', () => {
  for (const patch of [{ taxableInterest: '' }, { ordinaryDividends: undefined }, { otherGrossIncome: '' }, { childFilesJointReturn: null },
    { taxYear: '2026' }, { sourceFactsConfirmed: null }, { alaskaDividendPresent: null }, { alaskaDividendPresent: true },
    { specialCapitalDistributionPresent: true }, { foreignAccountOrTrustPresent: true }, { amtFactsConfirmed: null }, { otherwiseAllowableDeduction: '' }]) {
    const record = { ...actualGuidedChild, ...patch };
    expect(Object.keys(childElectionFactErrors([record], 2025)).length).toBeGreaterThan(0);
    const state = fixture(); state.sectionData['income-investments']!.childElections = [record];
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  }
  expect(() => buildGuidedChildElections([actualGuidedChild, actualGuidedChild], 2025)).toThrow(/duplicate/i);
  const source = structuredClone(actualGuidedChild); source.amtStatements!.push({ ...source.amtStatements![0]! });
  expect(() => buildGuidedChildElections([source], 2025)).toThrow(/duplicate/i);
  const knownZero = { ...actualGuidedChild, taxExemptInterest: '0', amtStatements: [], otherwiseAllowableDeduction: '0' };
  expect(buildGuidedChildElections([knownZero], 2025)[0]?.taxExemptInterest).toBe('0');
  expect(buildGuidedChildElections([], null)).toEqual([]);
});
it('invalidates election sources after actual return changes without confirmation cycles', () => {
  const changed = updateChildElection(actualGuidedChild, { taxableInterest: '4000.26' });
  expect(changed.sourceFactsConfirmed).toBeNull(); expect(changed.amtStatements).toEqual(actualGuidedChild.amtStatements);
  const state = fixture();
  const updated = updateSectionData(state, 'personal-info', { ...state.sectionData['personal-info'], lastName: 'Changed' });
  expect(updated.sectionData['income-investments']?.childElections?.[0]?.sourceFactsConfirmed).toBeNull();
  const confirmed = updateSectionData(state, 'income-investments', { ...state.sectionData['income-investments'], childElections: [{ ...actualGuidedChild, sourceFactsConfirmed: true }] });
  expect(confirmed.sectionData['income-investments']?.childElections?.[0]?.sourceFactsConfirmed).toBe(true);
  expect(state.sectionData['income-investments']?.childElections?.[0]?.sourceFactsConfirmed).toBe(true);
});
