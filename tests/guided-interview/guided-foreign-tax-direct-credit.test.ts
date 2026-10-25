// Spec: spec/federal/guided-foreign-tax-direct-credit.yaml.
import { describe, expect, it } from 'vitest';
import { buildGuidedForeignTaxElection, type ForeignTaxElectionData } from '@/lib/guided-foreign-tax-election';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyOtherTaxesData, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { foreignTaxDirectCreditFixture } from '../fixtures/foreign-tax-direct-credit.js';
import { completeInterestEntry, completeW2Entry, startCompleteInterview } from './complete-facts';
import { emptyForeignIncome } from '@/lib/guided-foreign-income';

export function guidedDirectCreditFixture() {
  const input = foreignTaxDirectCreditFixture();
  const annual = input.foreignTaxElection, direct = annual?.creditWithoutForm1116;
  if (!annual || !direct) throw new Error('Missing explicit synthetic election');
  const facts: ForeignTaxElectionData = { ...annual, taxYear: '2025', creditWithoutForm1116: {
    ...direct, adjustedThroughTaxYear: '2024', carryovers: [], amtCarryovers: [],
  } };
  const investment = { interestEntries: [{ ...completeInterestEntry, ...input.form1099Int[0], accountHolder: 'primary' as const }], dividendEntries: [], brokerageEntries: [] };
  return { facts, investment };
}
function stateWithDirectCredit() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages', 'investments'], lifeEvents: [], stateCode: null });
  const fixture = guidedDirectCreditFixture();
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, federalWithheld: '10000' }] };
  state.sectionData['income-investments'] = fixture.investment;
  state.sectionData['other-taxes'] = { ...emptyOtherTaxesData, foreignTaxElection: fixture.facts };
  return state;
}
describe('guided actual direct foreign credit', () => {
  it('preserves actual election and vintage facts with exact money and unknowns', () => {
    const { facts, investment } = guidedDirectCreditFixture();
    const direct = facts.creditWithoutForm1116;
    if (!direct) throw new Error('Missing explicit synthetic election');
    facts.noUnusedCreditCarryoversConfirmed = false;
    direct.carryovers = [{ originTaxYear: '2024', category: 'passive', amount: '9,007,199,254,740,993.03', sourceReference: 'Actual old credit source' }];
    const result = buildGuidedForeignTaxElection(facts, investment, 2025, 'single');
    expect(result?.creditWithoutForm1116?.carryovers?.[0]).toMatchObject({ originTaxYear: 2024, amount: '9007199254740993.03' });
    expect(result?.creditWithoutForm1116?.amtCarryovers).toEqual([]);
    expect(() => buildGuidedForeignTaxElection({ ...facts, creditWithoutForm1116: { ...direct, amtCarryovers: undefined } }, investment, 2025, 'single')).toThrow(/history|ledger|actual|carryover/i);
    for (const value of [undefined, false, null]) {
      expect(() => buildGuidedForeignTaxElection({ ...facts, creditWithoutForm1116: { ...direct, sourceFactsConfirmed: value } }, investment, 2025, 'single')).toThrow(/confirm|actual|election/i);
    }
  });
  it('requires the same actual election and residency facts for completion and bridge', () => {
    const state = stateWithDirectCredit();
    expect(validateSection(state, 'other-taxes').status).toBe('complete');
    expect(buildTaxInputFromGuidedData(state)?.foreignTaxElection?.creditWithoutForm1116?.adjustedThroughTaxYear).toBe(2024);
    const personal = state.sectionData['personal-info'];
    if (!personal) throw new Error('Missing actual synthetic taxpayer');
    state.sectionData['personal-info'] = { ...personal, standardDeductionFacts: { ...personal.standardDeductionFacts, nonresidentAlien: true } };
    expect(validateSection(state, 'other-taxes').status).not.toBe('complete');
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    const earned = stateWithDirectCredit();
    earned.sectionData.adjustments = { ...earned.sectionData.adjustments, foreignIncome: {
      ...structuredClone(emptyForeignIncome), partIV: { ...emptyForeignIncome.partIV, wages: '100' },
    } };
    expect(validateSection(earned, 'other-taxes').status).not.toBe('complete');
  });
  it('revokes both election confirmations after source edits without loops', () => {
    const state = stateWithDirectCredit(), investment = state.sectionData['income-investments'];
    if (!investment) throw new Error('Missing actual synthetic statements');
    const changed = updateSectionData(state, 'income-investments', { ...investment, interestEntries: investment.interestEntries.map(row => ({ ...row, accountReference: 'Replaced account' })) });
    expect(changed.sectionData['other-taxes']?.foreignTaxElection?.sourceFactsConfirmed).toBeNull();
    expect(changed.sectionData['other-taxes']?.foreignTaxElection?.creditWithoutForm1116?.sourceFactsConfirmed).toBeNull();
    const other = state.sectionData['other-taxes'];
    if (!other) throw new Error('Missing actual synthetic election');
    const confirmed = updateSectionData(state, 'other-taxes', { ...other, foreignTaxElection: { ...other.foreignTaxElection, sourceFactsConfirmed: true } });
    expect(confirmed.sectionData['other-taxes']?.foreignTaxElection?.creditWithoutForm1116?.sourceFactsConfirmed).toBe(true);
  });
});
