// Spec: spec/federal/guided-foreign-tax-ordinary-credit.yaml.
import { expect, it } from 'vitest';
import { buildGuidedForeignTaxElection } from '@/lib/guided-foreign-tax-election';
import type { ForeignOrdinaryCreditData } from '@/lib/guided-foreign-tax-ordinary-credit';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyOtherTaxesData, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { guidedOrdinaryCreditFixture } from '../fixtures/guided-foreign-tax-ordinary.js';
import { completeDividendEntry, completeW2Entry, startCompleteInterview } from './complete-facts';

function completeState() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages', 'investments'], lifeEvents: [], stateCode: null });
  const { facts, investment } = guidedOrdinaryCreditFixture();
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '80000', federalWithheld: '15000' }] };
  state.sectionData['income-investments'] = investment;
  state.sectionData['other-taxes'] = { ...emptyOtherTaxesData, foreignTaxElection: facts };
  return state;
}
it('preserves actual ordinary source amounts and separate regular and AMT histories', () => {
  const { facts, investment } = guidedOrdinaryCreditFixture();
  const ordinary = facts.creditWithForm1116;
  if (!ordinary) throw new Error('Missing explicit synthetic ordinary worksheet');
  facts.noUnusedCreditCarryoversConfirmed = false;
  ordinary.carryovers = [{ originTaxYear: '2024', category: 'passive', amount: '9,007,199,254,740,993.03', sourceReference: 'Actual prior regular source' }];
  ordinary.incomeSources = ordinary.incomeSources?.map(row => ({ ...row, reportedIncome: '20,000', foreignIncome: '10,000.01' }));
  const parsed = buildGuidedForeignTaxElection(facts, investment, 2025, 'single')?.creditWithForm1116;
  expect(parsed?.carryovers?.[0].amount).toBe('9007199254740993.03'); expect(parsed?.amtCarryovers).toEqual([]);
  expect(parsed?.incomeSources?.[0].foreignIncome).toBe('10000.01'); expect(parsed?.amt?.simplifiedElectionMadeInFirstClaimYear).toBe(false);
  expect(parsed?.amt?.firstPost1997CreditClaimTaxYear).toBe(2025); expect(parsed?.regularCarryback).toBeUndefined();
  for (const patch of [{ sourceFactsConfirmed: null }, { amtCarryovers: undefined }, { amt: { ...ordinary.amt, simplifiedElectionMadeInFirstClaimYear: undefined } }] satisfies Partial<ForeignOrdinaryCreditData>[]) {
    expect(() => buildGuidedForeignTaxElection({ ...facts, creditWithForm1116: { ...ordinary, ...patch } }, investment, 2025, 'single')).toThrow();
  }
});
it('uses the same original source checks for completion and the canonical bridge', () => {
  const state = completeState(); expect(validateSection(state, 'other-taxes').status).toBe('complete');
  expect(buildTaxInputFromGuidedData(state)?.foreignTaxElection?.creditWithForm1116?.incomeSources?.[0].foreignIncome).toBe('10000');
  const investment = state.sectionData['income-investments']; if (!investment) throw new Error('Missing actual synthetic investment');
  state.sectionData['income-investments'] = { ...investment, interestEntries: investment.interestEntries.map(row => ({ ...row, accountReference: 'Replaced actual account' })) };
  expect(validateSection(state, 'other-taxes').status).not.toBe('complete'); expect(buildTaxInputFromGuidedData(state)).toBeNull();
  const { facts } = guidedOrdinaryCreditFixture(); const ordinary = facts.creditWithForm1116;
  if (!ordinary?.incomeSources?.[0] || !facts.sources?.[0]) throw new Error('Missing explicit synthetic source');
  const div = { ...completeDividendEntry, payer: 'Actual dividend payer', payerTin: '112233445', accountReference: 'Actual dividend account', accountHolder: 'primary' as const,
    ordinaryDividends: '20000', qualifiedDividends: '100', foreignTaxPaid: '900', foreignCountry: 'Canada' };
  facts.sources = [{ ...facts.sources[0], sourceId: 'form1099Div:0', payerName: div.payer, accountReference: div.accountReference }];
  ordinary.incomeSources = [{ ...ordinary.incomeSources[0], sourceId: 'form1099Div:0', payerName: div.payer, accountReference: div.accountReference }];
  expect(() => buildGuidedForeignTaxElection(facts, { interestEntries: [], dividendEntries: [div], brokerageEntries: [] }, 2025, 'single')).toThrow(/qualified|preferential/i);
  expect(() => buildGuidedForeignTaxElection(guidedOrdinaryCreditFixture().facts, guidedOrdinaryCreditFixture().investment, 2025, 'single', { nonresidentAlien: true })).toThrow(/resident|status/i);
});
it('revokes ordinary confirmation on source edits without confirmation loops', () => {
  const state = completeState(), investment = state.sectionData['income-investments']; if (!investment) throw new Error('Missing actual synthetic investment');
  const changed = updateSectionData(state, 'income-investments', { ...investment, interestEntries: investment.interestEntries.map(row => ({ ...row, interestIncome: '20001' })) });
  expect(changed.sectionData['other-taxes']?.foreignTaxElection?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData['other-taxes']?.foreignTaxElection?.creditWithForm1116?.sourceFactsConfirmed).toBeNull();
  const other = state.sectionData['other-taxes']; if (!other) throw new Error('Missing explicit annual election');
  const confirmed = updateSectionData(state, 'other-taxes', { ...other, foreignTaxElection: { ...other.foreignTaxElection, sourceFactsConfirmed: true } });
  expect(confirmed.sectionData['other-taxes']?.foreignTaxElection?.creditWithForm1116?.sourceFactsConfirmed).toBe(true);
});
