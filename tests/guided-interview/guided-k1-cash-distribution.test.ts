// Spec: spec/federal/guided-k1-cash-distribution.yaml
import { expect, it } from 'vitest';
import { actualGuidedK1CashDistribution } from '../fixtures/guided-k1-cash-distribution';
import { startCompleteInterview, completeW2Entry } from './complete-facts';
import { emptyDeductionData, validateSection } from '@/lib/guided-interview-flow';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { buildGuidedK1CharitableSources, updateK1CharitableSources } from '@/lib/guided-k1-charitable-sources';
import { normalizeGuidedK1CashDistribution } from '@/lib/guided-k1-cash-distribution';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
function state(scorp = false) {
  const s = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  s.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000' }] };
  s.sectionData.deductions = { ...emptyDeductionData, method: 'itemized', medicalExpenses: '0', stateLocalTaxes: '0', realEstateTaxes: '0', mortgageInterest: '0', charitableContributions: '0', casualtyLosses: '0', otherItemized: '0', gamblingWinnings: '0', nonW2IncomeTaxesDeductedElsewhere: '0', donationEntries: [], k1CharitableSources: actualGuidedK1CashDistribution(scorp) };
  return s;
}
const original = (s: ReturnType<typeof state>) => {
  const row = s.sectionData.deductions?.k1CharitableSources?.statements?.[0];
  if (!row?.cashDistribution || !row.original?.form6198 || !row.atRisk) throw new Error('Missing fictional source'); return row;
};
it('passes actual distribution sources once through the guided return', () => {
  for (const scorp of [false, true]) {
    const s = state(scorp), before = JSON.stringify(s), input = buildTaxInputFromGuidedData(s);
    expect(validateSection(s, 'deductions').status).toBe('complete');
    expect(input?.scheduleK1).toHaveLength(1);
    expect(input?.k1CharitableSources?.statements?.[0].cashDistribution?.cashAmount).toBe('31.00');
    const result = calculateFederalTax(TaxYearInputSchema.parse(input));
    expect(result.agi.toFixed()).toBe('100001'); expect(result.scheduleD?.netLongTerm.toFixed()).toBe('1');
    expect(result.scheduleE?.partnerships[0].basisResult?.totalIncomeItems.toFixed()).toBe('0');
    expect(original(s).cashDistribution).not.toHaveProperty('gain'); expect(JSON.stringify(s)).toBe(before);
  }
});
it('preserves source uncertainty and rejects conflicting original attachments', () => {
  expect(normalizeGuidedK1CashDistribution({ cashAmount: '0.00', cashOnlyConfirmed: false, sourceFactsConfirmed: null })).toMatchObject({ cashAmount: '0.00', cashOnlyConfirmed: false, sourceFactsConfirmed: undefined });
  expect(normalizeGuidedK1CashDistribution({ cashAmount: '1,030.25', sourceTaxYear: '2025' })).toMatchObject({ cashAmount: '1030.25', sourceTaxYear: 2025 });
  expect(normalizeGuidedK1CashDistribution({ cashAmount: '' })?.cashAmount).toBeUndefined();
  expect(() => normalizeGuidedK1CashDistribution({ gain: '1' } as never)).toThrow();
  const changes: Array<(r: ReturnType<typeof original>) => void> = [
    r => { r.cashDistribution!.cashAmount = ''; }, r => { r.cashDistribution!.cashAmount = '31.01'; },
    r => { r.cashDistribution!.cashOnlyConfirmed = false; }, r => { r.cashDistribution!.sourceTaxYear = '2024'; },
    r => { r.cashDistribution!.atRiskSourceReference = 'A different original'; }, r => { r.cashDistribution!.activityCharacter = 'single_passive_business'; },
    r => { r.cashDistribution!.sameSingleAtRiskActivityConfirmed = null; }, r => { r.cashDistribution = undefined; },
  ];
  for (const change of changes) {
    const s = state(); change(original(s)); const before = JSON.stringify(s);
    expect(buildTaxInputFromGuidedData(s)).toBeNull(); expect(validateSection(s, 'deductions').status).not.toBe('complete');
    expect(JSON.stringify(s)).toBe(before);
  }
});
it('revokes dependent distribution confirmations and reconciles known owner status', () => {
  const s = state(true), packet = s.sectionData.deductions!.k1CharitableSources!, row = original(s);
  const changed = updateK1CharitableSources(packet, { statements: [{ ...row, cashDistribution: { ...row.cashDistribution, acquisitionDate: '2024-12-31' } }] });
  expect(changed.sourceFactsConfirmed).toBeNull();
  for (const value of [changed.statements?.[0].basis, changed.statements?.[0].atRisk, changed.statements?.[0].atRisk?.priorLossHistory, changed.statements?.[0].cashDistribution]) expect(value?.sourceFactsConfirmed).toBeNull();
  const confirmed = updateK1CharitableSources(changed, { sourceFactsConfirmed: true });
  expect(confirmed.sourceFactsConfirmed).toBe(true); expect(confirmed.statements?.[0].cashDistribution?.sourceFactsConfirmed).toBeNull();
  s.sectionData['personal-info']!.standardDeductionFacts!.nonresidentAlien = true;
  expect(() => buildGuidedK1CharitableSources(s)).toThrow(/owner.*residency|tax treatment/);
  s.sectionData['personal-info']!.standardDeductionFacts!.nonresidentAlien = false;
  s.sectionData['personal-info']!.eicClaimantEligibility = { sourceTaxYear: '2025', sourceReference: 'Fictional owner history', sourceFactsConfirmed: true, primaryNonresidentAlienDuringYear: true, residentJointElection: false };
  expect(() => buildGuidedK1CharitableSources(s)).toThrow(/owner.*residency/);
});
