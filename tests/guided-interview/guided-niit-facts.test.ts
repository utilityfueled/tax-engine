// Spec: spec/federal/guided-niit-ordinary-sources.yaml.
import { describe, expect, it } from 'vitest';
import { buildGuidedNiitSources, guidedNiitFactErrors, snapshotGuidedNiitAnnuity, type NiitSourceData } from '@/lib/guided-niit-facts';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { buildSectionRoute, emptyOtherTaxesData, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { completeRetirementSource, completeW2Entry, startCompleteInterview } from './complete-facts';

const retirement = { ...completeRetirementSource, grossDistribution: '30,000.25', taxableAmount: '10,000.25', distributionCode: '7D' };
const sources = (): NiitSourceData => ({ sourceTaxYear: '2025', sourceReference: 'Actual contract and source tax worksheet', sourceFactsConfirmed: true,
  annuities: [{ ...snapshotGuidedNiitAnnuity(retirement, 0), classification: 'nonqualified_annuity', sourceReference: 'Actual insurer contract' }] });
const taxes = () => ({ allocationMethodDescription: 'Actual documented reasonable allocation', noDuplicateDeductionConfirmed: true,
  incomeOrSalesTaxes: { sourceAmount: '15,000', regularDeductibleAmount: '15,000', investmentAllocableAmount: '2,000.25' },
  realPropertyTaxes: { sourceAmount: '6,000', regularDeductibleAmount: '6,000', investmentAllocableAmount: '500.25' },
  personalPropertyTaxes: { sourceAmount: '1,000', regularDeductibleAmount: '1,000', investmentAllocableAmount: '0' } });
function stateWithSources() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages', 'retirement'], lifeEvents: [], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '250000', federalWithheld: '100000' }] };
  state.sectionData['income-retirement'] = { entries: [retirement] };
  state.sectionData['other-taxes'] = { ...emptyOtherTaxesData, niitSources: sources() };
  return state;
}
describe('guided ordinary NIIT sources', () => {
  it('routes retirement investment and rental sources to the NIIT worksheet', () => {
    for (const incomeType of ['retirement', 'investments', 'rental', 'self-employment'] as const) {
      const route = buildSectionRoute({ filingStatus: 'single', incomeTypes: [incomeType], lifeEvents: [], stateCode: null }).map(section => section.id);
      expect(route, incomeType).toContain('other-taxes');
      expect(route.indexOf('other-taxes'), incomeType).toBeGreaterThan(route.indexOf('credits'));
      expect(route.indexOf('other-taxes'), incomeType).toBeLessThan(route.indexOf('payments'));
    }
    expect(buildSectionRoute({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null }).map(section => section.id)).not.toContain('other-taxes');
  });
  it('preserves unknown facts and exact entered NIIT source amounts', () => {
    expect(buildGuidedNiitSources(undefined, [retirement], 2025, 'single')).toBeUndefined();
    expect(guidedNiitFactErrors({}, [retirement], 2025, 'single')).toHaveProperty('niitSources');
    const data = { ...sources(), ordinaryTaxAllocation: taxes() };
    const result = buildGuidedNiitSources(data, [retirement], 2025, 'single');
    expect(result?.annuities?.[0]).toMatchObject({ payerTin: '12-3456789', grossDistribution: '30000.25', taxableAmount: '10000.25' });
    expect(result?.ordinaryTaxAllocation?.incomeOrSalesTaxes?.investmentAllocableAmount).toBe('2000.25');
    expect(result?.itemizedAllocation).toBeUndefined();
    data.ordinaryTaxAllocation.personalPropertyTaxes.investmentAllocableAmount = '';
    expect(() => buildGuidedNiitSources(data, [retirement], 2025, 'single')).toThrow(/actual|amount/i);
  });
  it('rejects stale or contradictory annuity and tax worksheets', () => {
    const data = sources();
    expect(() => buildGuidedNiitSources(data, [{ ...retirement, payerTin: '99-9999999' }], 2025, 'single')).toThrow(/payer|statement/i);
    expect(() => buildGuidedNiitSources(data, [{ ...retirement, accountReference: 'Replacement same-payer account' }], 2025, 'single')).toThrow(/account|statement/i);
    expect(() => buildGuidedNiitSources(data, [{ ...retirement, grossDistribution: '30001' }], 2025, 'single')).toThrow(/reconcile|statement/i);
    expect(() => buildGuidedNiitSources(data, [retirement], 2026, 'single')).toThrow(/year/i);
    const wrong = sources(); if (!wrong.annuities?.[0]) throw new Error('Missing fixture');
    wrong.annuities[0].classification = 'excluded_retirement_plan'; wrong.annuities[0].excludedPlanSection = '401';
    expect(() => buildGuidedNiitSources(wrong, [retirement], 2025, 'single')).toThrow(/codeD|nonqualified/i);
    const actualTaxes = { ...sources(), ordinaryTaxAllocation: taxes() };
    actualTaxes.ordinaryTaxAllocation.realPropertyTaxes.investmentAllocableAmount = '6000.01';
    expect(() => buildGuidedNiitSources(actualTaxes, [retirement], 2025, 'single')).toThrow(/allocation|deduction/i);
  });
  it('forwards actual NIIT sources and requires the same facts for completion', () => {
    const state = stateWithSources();
    expect(validateSection(state, 'other-taxes').status).toBe('complete');
    const actual = buildTaxInputFromGuidedData(state);
    expect(actual?.form8960Sources?.annuities?.[0].sourceId).toBe('form1099R:0');
    expect(actual?.form1099R?.[0].accountReference).toBe(retirement.accountReference);
    expect(actual?.form8960Sources?.annuities?.[0].accountReference).toBe(retirement.accountReference);
    if (!actual) throw new Error('Complete synthetic sources must build');
    const result = calculateFederalTax(TaxYearInputSchema.parse(actual));
    expect(result.agi.toFixed()).toBe('260000.25');
    expect(result.form8960.lines.find(line => line.line === '3')?.value.toFixed()).toBe('10000.25');
    expect(result.niitTax.toFixed()).toBe('380');
    const saved = state.sectionData['other-taxes']?.niitSources;
    if (!saved) throw new Error('Missing synthetic NIIT sources');
    saved.sourceFactsConfirmed = null;
    expect(validateSection(state, 'other-taxes').status).not.toBe('complete');
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  });
  it('invalidates NIIT confirmation after source edits without confirmation loops', () => {
    const state = stateWithSources();
    const changed = updateSectionData(state, 'income-retirement', { entries: [{ ...retirement, taxableAmount: '10001' }] });
    expect(changed.sectionData['other-taxes']?.niitSources?.sourceFactsConfirmed).toBeNull();
    const confirmationOnly = updateSectionData(state, 'income-retirement', { entries: [{ ...retirement, sourceFactsConfirmed: false }] });
    expect(confirmationOnly.sectionData['other-taxes']?.niitSources?.sourceFactsConfirmed).toBe(true);
    const acknowledged = updateSectionData(state, 'other-taxes', { ...state.sectionData['other-taxes'], acknowledgedNIIT: true });
    expect(acknowledged.sectionData['other-taxes']?.niitSources?.sourceFactsConfirmed).toBe(true);
  });
});
