// Spec: spec/federal/guided-ira-basis.yaml
import { expect, it } from 'vitest';
import { buildGuidedIraBasisSources, captureIraBasisDistributions } from '@/lib/guided-ira-basis';
import { buildGuidedFactAnswers, buildTaxInputFromGuidedData, buildGuidedSyntheticDocuments } from '@/lib/guided-interview-bridge';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { emptyRetirementEntry, updateSectionData, validateSection, saveGuidedFlowState, loadGuidedFlowState } from '@/lib/guided-interview-flow';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateFederalTax } from '@/engine/federal';
import { guidedIraBasisFixture } from './ira-basis-fixture';

it('builds actual original source links and preserves unknown printed amounts', () => {
  const state = guidedIraBasisFixture(); const data = state.sectionData['income-retirement']!;
  const rows = captureIraBasisDistributions([emptyRetirementEntry, ...data.entries]);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ sourceId: 'form1099R:0', grossDistribution: '1001.49', taxableAmount: '', sourceTaxYear: '2025', accountHolder: 'primary' });
  expect(rows[0]?.accountId).toBeUndefined(); expect(rows[0]?.sourceReference).toBeUndefined();
  const packet = buildGuidedIraBasisSources(data.basisSources, data.entries, 2025, 'mfj', state.sectionData['personal-info']);
  expect(packet?.distributions[0]?.taxableAmount).toBeNull();
  expect(packet?.owners[0]?.accounts[0]?.yearEndValue).toBe('2002.49');
  const unknown = structuredClone(data); unknown.basisSources!.owners![0]!.accounts![0]!.yearEndValue = '';
  expect(() => buildGuidedIraBasisSources(unknown.basisSources, unknown.entries, 2025, 'mfj', state.sectionData['personal-info'])).toThrow();
  expect(unknown.basisSources!.owners![0]!.accounts![0]!.yearEndValue).toBe('');
});
it('routes separate-owner basis through validation preview and the canonical return', () => {
  const state = guidedIraBasisFixture();
  expect(validateSection(state, 'income-retirement').status).toBe('complete');
  const input = buildTaxInputFromGuidedData(state); expect(input).not.toBeNull();
  expect(input?.form1099R[0]).toMatchObject({ taxYear: 2025, trumpAccount: false, excessContributionEarnings: '0' });
  expect(input?.form1099R[0]?.taxableAmount).toBeUndefined();
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.iraDistributionsTaxable.toFixed()).toBe('2268');
  expect(result.form8606ByOwner?.primary?.line14.toFixed()).toBe('667');
  expect(result.form8606ByOwner?.spouse?.line14.toFixed()).toBe('1600');
  expect(computeGuidedPreview(state)?.agi).toBe('87268');
  expect(JSON.stringify(buildGuidedFactAnswers(state))).toContain('basis');
  expect(buildGuidedSyntheticDocuments(state).find(document => document.kind === '1099-r' || document.label?.includes('1099-R'))?.coverage).toBe('supported');
  const unknownOther = structuredClone(state); unknownOther.sectionData['income-retirement']!.entries[0]!.otherRetirementWorksheetRequired = null;
  expect(buildTaxInputFromGuidedData(unknownOther)).toBeNull();
  const noPacket = structuredClone(state); delete noPacket.sectionData['income-retirement']!.basisSources;
  expect(buildTaxInputFromGuidedData(noPacket)).toBeNull();
});
it('revokes stale packet confirmation and preserves history through reload', () => {
  const state = guidedIraBasisFixture(); const data = structuredClone(state.sectionData['income-retirement']!);
  data.entries[0]!.grossDistribution = '1002.49';
  const changed = updateSectionData(state, 'income-retirement', data);
  expect(changed.sectionData['income-retirement']?.basisSources?.sourceFactsConfirmed).toBeNull();
  changed.sectionData['income-retirement']!.basisSources!.sourceFactsConfirmed = true;
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  const confirmed = updateSectionData(state, 'income-retirement', structuredClone(state.sectionData['income-retirement']));
  expect(confirmed.sectionData['income-retirement']?.basisSources?.sourceFactsConfirmed).toBe(true);
  const personal = updateSectionData(state, 'personal-info', { ...state.sectionData['personal-info'], dateOfBirth: '1960-01-16' });
  expect(personal.sectionData['income-retirement']?.basisSources?.sourceFactsConfirmed).toBeNull();
  const adjustment = updateSectionData(state, 'adjustments', { iraContributions: { primaryContributions: '100' } });
  expect(adjustment.sectionData['income-retirement']?.basisSources?.sourceFactsConfirmed).toBeNull();
  const storage = new Map<string, string>(); const mock = { setItem: (key: string, value: string) => storage.set(key, value), getItem: (key: string) => storage.get(key) ?? null } as Storage;
  saveGuidedFlowState(mock, 'actual-ira', changed);
  expect(loadGuidedFlowState(mock, 'actual-ira')?.sectionData['income-retirement']?.basisSources).toEqual(changed.sectionData['income-retirement']?.basisSources);
});
it('rejects unknown identity history amounts and contradictory current contributions', () => {
  const state = guidedIraBasisFixture(); const data = state.sectionData['income-retirement']!;
  for (const patch of [{ allDistributionsIncluded: null }, { sourceTaxYear: '2026' }, { owners: [] }, { distributions: [] }]) {
    expect(() => buildGuidedIraBasisSources({ ...data.basisSources, ...patch }, data.entries, 2025, 'mfj', state.sectionData['personal-info'])).toThrow();
  }
  expect(() => buildGuidedIraBasisSources(data.basisSources, data.entries, 2025, 'mfj', state.sectionData['personal-info'], { iraDeduction: '1' } as never)).toThrow();
  expect(() => buildGuidedIraBasisSources(data.basisSources, data.entries, 2025, 'mfj', state.sectionData['personal-info'], { hsaAccounts: [{ qualifiedFundingDistribution: '1' }] } as never)).toThrow();
  const changedMethod = structuredClone(data.basisSources!);
  changedMethod.owners![0]!.basisHistory!.method = 'confirmed_zero';
  expect(() => buildGuidedIraBasisSources(changedMethod, data.entries, 2025, 'mfj', state.sectionData['personal-info'])).toThrow(/saved prior/);
});
it('retains actual 2026 source boxes and rejects missing special-source answers', () => {
  const state = guidedIraBasisFixture(); const data = state.sectionData['income-retirement']!; const packet = data.basisSources!;
  packet.sourceTaxYear = '2026';
  for (const owner of packet.owners!) for (const account of owner.accounts!) account.sourceTaxYear = '2026';
  for (const distribution of packet.distributions!) distribution.sourceTaxYear = '2026';
  for (const entry of data.entries) entry.sourceTaxYear = '2026';
  expect(buildGuidedIraBasisSources(packet, data.entries, 2026, 'mfj', state.sectionData['personal-info'])?.taxYear).toBe(2026);
  for (const patch of [{ trumpAccount: null }, { trumpAccount: true }, { excessContributionEarnings: '' }, { excessContributionEarnings: '0.01' }]) {
    expect(() => buildGuidedIraBasisSources(packet, [{ ...data.entries[0]!, ...patch }, data.entries[1]!], 2026, 'mfj', state.sectionData['personal-info'])).toThrow(/2026|Trump|earnings/);
  }
});
