// Spec: spec/federal/guided-k1-passive-distribution.yaml
import { expect, it } from 'vitest';
import { actualGuidedK1PassiveDistribution } from '../fixtures/guided-k1-passive-distribution';
import { actualGuidedK1Sources } from '../fixtures/guided-k1-qbi-sources';
import { completeW2Entry, startCompleteInterview } from './complete-facts';
import { emptyDeductionData, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { buildGuidedK1CharitableSources, updateK1CharitableSources } from '@/lib/guided-k1-charitable-sources';
import { normalizeGuidedK1PassiveDistribution } from '@/lib/guided-k1-passive-distribution';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
function state(prior = '1500', scorp = false) {
  const source = actualGuidedK1PassiveDistribution(prior, scorp);
  const s = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['k1-loss-sources'], stateCode: null });
  s.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000' }] };
  s.sectionData.adjustments = { k1LossSources: source.qualifiedLoss };
  s.sectionData.deductions = { ...emptyDeductionData, method: 'itemized', medicalExpenses: '0', stateLocalTaxes: '0', realEstateTaxes: '0', mortgageInterest: '0', charitableContributions: '0', casualtyLosses: '0', otherItemized: '0', gamblingWinnings: '0', nonW2IncomeTaxesDeductedElsewhere: '0', donationEntries: [], k1CharitableSources: source.charity };
  return s;
}
it('reaches the passive distribution return through actual linked histories', () => {
  for (const scorp of [false, true]) for (const prior of ['1500', '400']) {
    const s = state(prior, scorp), before = JSON.stringify(s);
    expect(() => buildGuidedK1CharitableSources(s)).not.toThrow();
    expect(validateSection(s, 'deductions').status).toBe('complete');
    const input = buildTaxInputFromGuidedData(s);
    expect(input?.scheduleK1).toHaveLength(1);
    const result = calculateFederalTax(TaxYearInputSchema.parse(input));
    expect(result.scheduleD?.netLongTerm.toFixed()).toBe('1000');
    expect(result.agi.toFixed()).toBe(prior === '1500' ? '100000' : '100600');
    expect(result.form8582?.allowedLoss.toFixed()).toBe(prior === '1500' ? '1000' : '400');
    expect(result.scheduleE?.partnerships[0].basisResult?.totalIncomeItems.toFixed()).toBe('0');
    expect(JSON.stringify(s)).toBe(before);
  }
});
it('preserves unsupported classification and incomplete original histories', () => {
  const s = state();
  if (!s.sectionData.adjustments?.k1LossSources) throw new Error('Missing fictional sources');
  s.sectionData.adjustments.k1LossSources.form461Classification = actualGuidedK1Sources().form461Classification;
  const before = JSON.stringify(s);
  expect(buildTaxInputFromGuidedData(s)).toBeNull();
  expect(JSON.stringify(s)).toBe(before);
  const missing = state();
  const row = missing.sectionData.deductions?.k1CharitableSources?.statements?.[0];
  if (!row?.cashDistribution || !missing.sectionData.adjustments?.k1LossSources?.activities?.[0]) throw new Error('Missing fictional sources');
  row.cashDistribution.passiveActivity = undefined;
  expect(buildTaxInputFromGuidedData(missing)).toBeNull();
  const noHistory = state();
  if (!noHistory.sectionData.adjustments?.k1LossSources?.activities?.[0]) throw new Error('Missing fictional history');
  noHistory.sectionData.adjustments.k1LossSources.activities[0].passiveHistory = undefined;
  expect(buildTaxInputFromGuidedData(noHistory)).toBeNull();
  const owner = state('1500', true);
  if (!owner.sectionData['personal-info']?.standardDeductionFacts) throw new Error('Missing fictional owner');
  owner.sectionData['personal-info'].standardDeductionFacts.nonresidentAlien = true;
  expect(() => buildGuidedK1CharitableSources(owner)).toThrow(/owner.*residency|tax treatment/);
});
it('normalizes original valuation facts without inventing amounts or identities', () => {
  const input = { sourceTaxYear: '2025', sourceFactsConfirmed: null, continuingActivityConfirmed: false,
    beginningHolderInterestValue: '9,007,199,254,740,993.01000000000000000001', appreciatedContributionsFmv: '0.00',
    assets: [{ ownerBasisAdjustment: '-1,000.01000000000000000001', sourceId: '', acquiredDate: '', continuousPassiveUseConfirmed: false }],
    activityEvents: [{ beginningActivityValue: '0.00', propertyDisposedValue: '' }] };
  const before = JSON.stringify(input), normalized = normalizeGuidedK1PassiveDistribution(input);
  expect(normalized).toMatchObject({ sourceTaxYear: 2025, sourceFactsConfirmed: undefined, continuingActivityConfirmed: false,
    beginningHolderInterestValue: '9007199254740993.01000000000000000001', appreciatedContributionsFmv: '0.00',
    assets: [{ ownerBasisAdjustment: '-1000.01000000000000000001', sourceId: undefined, acquiredDate: undefined, continuousPassiveUseConfirmed: false }],
    activityEvents: [{ beginningActivityValue: '0.00', propertyDisposedValue: undefined }] });
  expect(JSON.stringify(input)).toBe(before);
  expect(normalizeGuidedK1PassiveDistribution({ assets: [], activityEvents: [] })).toEqual({ assets: [], activityEvents: [] });
  for (const value of [{ gain: '1000' }, { assets: [{ allocationRatio: '.5' }] }, { combinedParticipationHours: '1e3' },
    { beginningHolderInterestValue: '-1' }, { appreciatedContributionsFmv: '1,00' }, { sourceTaxYear: '2025.1' }]) {
    expect(() => normalizeGuidedK1PassiveDistribution(value as never)).toThrow();
  }
});
it('revokes valuation confirmations while retaining complete actual records', () => {
  const s = state(), packet = s.sectionData.deductions?.k1CharitableSources, row = packet?.statements?.[0];
  const valuation = row?.cashDistribution?.passiveActivity;
  if (!packet || !row?.cashDistribution || !valuation?.assets?.[0]) throw new Error('Missing fictional source');
  const changed = updateK1CharitableSources(packet, { statements: [{ ...row, cashDistribution: { ...row.cashDistribution,
    passiveActivity: { ...valuation, assets: [{ ...valuation.assets[0], adjustedBasis: '60000.01' }] } } }] });
  const changedRow = changed.statements?.[0];
  for (const source of [changed, changedRow?.basis, changedRow?.atRisk, changedRow?.cashDistribution, changedRow?.cashDistribution?.passiveActivity]) expect(source?.sourceFactsConfirmed).toBeNull();
  expect(changedRow?.cashDistribution?.passiveActivity?.assets?.[0].adjustedBasis).toBe('60000.01');
  const confirmOuter = updateK1CharitableSources(changed, { sourceFactsConfirmed: true });
  expect(confirmOuter.sourceFactsConfirmed).toBe(true);
  expect(confirmOuter.statements?.[0].cashDistribution?.passiveActivity?.sourceFactsConfirmed).toBeNull();
  if (!s.sectionData['personal-info']) throw new Error('Missing fictional household');
  const household = updateSectionData(s, 'personal-info', { ...s.sectionData['personal-info'], firstName: 'Other' });
  expect(household.sectionData.deductions?.k1CharitableSources?.statements?.[0].cashDistribution?.passiveActivity?.sourceFactsConfirmed).toBeNull();
  expect(valuation.sourceFactsConfirmed).toBe(true);
});
