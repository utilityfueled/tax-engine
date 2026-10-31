// Spec: spec/federal/cod-title-11-chapter-13.yaml guide.
import { expect, it } from 'vitest';
import { buildGuidedCodNol, invalidateGuidedCodNol } from '@/lib/guided-cod-nol';
import { guidedCodPartialPersonalState } from '../fixtures/guided-cod-partial-personal';

const court = { sourceReference: 'Fictional discharge order', sourceFactsConfirmed: true, debtorUnderCourtJurisdictionConfirmed: true, dischargeByCourtOrApprovedPlanConfirmed: true };
function setup(patch = {}) {
  const state = guidedCodPartialPersonalState(), data = state.sectionData.adjustments!.codNolSources!;
  const edited = { ...data, title11Case: true, title11Chapter: '13' as const, title11Source: court, debts: data.debts!.map(row => ({ ...row, identifiableEventCode: 'A' })), ...patch };
  return { state, data: edited };
}

it('carries chapter 13 answers from the guide', () => {
  const { state, data } = setup(), built = buildGuidedCodNol(data, state)!;
  expect(built.codExclusion.bankruptcy).toBe(true);
  expect(built.form982NolSources).toMatchObject({ title11Case: true, title11Chapter: '13', title11Source: court });
  expect(built.form1099C[0]?.identifiableEventCode).toBe('A');
  const chapter7 = setup({ title11Chapter: '7' });
  expect(() => buildGuidedCodNol(chapter7.data, chapter7.state)).toThrow(/separate bankruptcy estate method/);
  const unknown = setup({ title11Chapter: '' });
  expect(() => buildGuidedCodNol(unknown.data, unknown.state)).toThrow(/separate bankruptcy estate method/);
  for (const key of ['sourceFactsConfirmed', 'debtorUnderCourtJurisdictionConfirmed', 'dischargeByCourtOrApprovedPlanConfirmed']) {
    const missing = setup({ title11Source: { ...court, [key]: null } });
    expect(() => buildGuidedCodNol(missing.data, missing.state), key).toThrow();
  }
  expect(invalidateGuidedCodNol(data).title11Source?.sourceFactsConfirmed).toBeNull();
  const none = setup({ title11Case: null });
  expect(() => buildGuidedCodNol(none.data, none.state)).toThrow(/bankruptcy, basis-first/);
  const no = setup({ title11Case: false, title11Chapter: '13' });
  expect(() => buildGuidedCodNol(no.data, no.state)).toThrow(/event code/);
});
