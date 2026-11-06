import { expect, it } from 'vitest';
import { buildGuidedK1CharitableSources } from '@/lib/guided-k1-charitable-sources';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { buildSectionRoute, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateFederalTax } from '@/engine/federal';
import { guidedFirstAdmissionState } from '../fixtures/guided-k1-charitable-first-admission';
import { firstAdmissionInput } from '../fixtures/k1-charitable-first-admission';
import { releaseFixtureSource as required } from '../fixtures/charitable-k1-basis-release-nol';

it('forwards actual annual records and complete earlier charitable histories', () => {
  // Spec: K1 Charitable First Admission, guided-originals.
  for (const options of [{}, { earlierCarry: true }, { oldNol: true }]) {
    const state = guidedFirstAdmissionState(options), before = JSON.stringify(state), original = firstAdmissionInput(options);
    const route = buildSectionRoute(state.segmentation);
    expect(route[state.currentSectionIndex].id).toBe('deductions');
    expect(state.completedSections).toEqual(['personal-info', 'income-w2']);
    if (original.netOperatingLoss) {
      expect(state.segmentation.lifeEvents).toContain('net-operating-loss');
      expect(route.map(section => section.id)).toContain('adjustments');
    }
    const built = required(buildGuidedK1CharitableSources(state));
    expect(built.k1CharitableSources).toEqual(original.k1CharitableSources);
    expect(validateSection(state, 'deductions').status).toBe('complete');
    const input = TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(state)));
    expect(input.k1CharitableSources).toEqual(original.k1CharitableSources);
    expect(input.charitableCarryoverSources).toEqual(original.charitableCarryoverSources);
    expect(() => calculateFederalTax(input)).toThrow(/2026.*incomplete|2026.*unavailable/);
    expect(JSON.stringify(state)).toBe(before);
    expect(buildGuidedK1CharitableSources(JSON.parse(before))).toEqual(built);
  }
});

it('invalidates actual annual edits and preserves unknown history', () => {
  // Spec: K1 Charitable First Admission, guided-invalidation.
  const state = guidedFirstAdmissionState(), deductions = required(state.sectionData.deductions);
  const changed = structuredClone(deductions);
  const annual = required(required(required(changed.k1CharitableSources).statements)[0].basis).priorBasisSuspensions![0].section170AdmissionSources!;
  annual.records![0].charitableWorksheetReference = 'Actual same-money replacement annual original';
  const updated = updateSectionData(state, 'deductions', changed);
  const packet = required(updated.sectionData.deductions?.k1CharitableSources), nested = packet.statements![0].basis!.priorBasisSuspensions![0].section170AdmissionSources!;
  expect(packet.sourceFactsConfirmed).toBeNull(); expect(nested.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(updated)).toBeNull();
  for (const edit of [
    (value: typeof state) => { value.sectionData.deductions!.charitableCarryoverSources = undefined; },
    (value: typeof state) => { value.sectionData.deductions!.k1CharitableSources!.statements![0].basis!.priorBasisSuspensions![0].section170AdmissionSources!.records![0].regularCarryoverSourceIds = undefined; },
    (value: typeof state) => { value.sectionData.deductions!.k1CharitableSources!.statements![0].basis!.priorBasisSuspensions![0].section170AdmissionSources!.records![0].recipientTaxpayerIdLast4 = '1111'; },
  ]) { const value = structuredClone(state); edit(value); expect(buildTaxInputFromGuidedData(value)).toBeNull(); }
  for (const key of ['firstAdmissionYear', 'currentAdmission', 'charitableCarryforward']) expect(annual).not.toHaveProperty(key);
});
