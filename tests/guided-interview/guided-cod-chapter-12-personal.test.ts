// Spec: spec/federal/cod-title-11-chapter-12-personal.yaml guided-originals.
import { expect, it } from 'vitest';
import { buildGuidedCodNol, buildGuidedCodNolForNavigation, updateGuidedCodNol } from '@/lib/guided-cod-nol';
import { guidedCodPartialPersonalState } from '../fixtures/guided-cod-partial-personal';

it('carries actual chapter12 case history and rejects unknown or converted histories', () => {
  const state = guidedCodPartialPersonalState(), data = state.sectionData.adjustments!.codNolSources!;
  data.title11Case = true; data.title11Chapter = '12';
  data.title11Source = { sourceReference: 'Fictional original chapter12 petition through discharge, never7 or11',
    sourceFactsConfirmed: true, debtorUnderCourtJurisdictionConfirmed: true,
    dischargeByCourtOrApprovedPlanConfirmed: true, caseNeverChapter7Or11Confirmed: true };
  for (const debt of data.debts!) debt.identifiableEventCode = 'A';
  for (const ledger of [data.attributeSources!.regular, data.attributeSources!.alternativeTax]) {
    for (const row of ledger!.property!.followingYear!.properties!) Object.assign(row, { exemptUnderSection522: false });
  }
  for (const build of [buildGuidedCodNol, buildGuidedCodNolForNavigation]) {
    const built = build(data, state)!;
    expect(built.form982NolSources.title11Source).toMatchObject({ caseNeverChapter7Or11Confirmed: true });
    expect(built.form982NolSources.title11Chapter).toBe('12');
    expect(built.codExclusion.bankruptcy).toBe(true);
    for (const history of [undefined, null, false]) {
      const missing = { ...data, title11Source: { ...data.title11Source, caseNeverChapter7Or11Confirmed: history } };
      expect(() => build(missing, state), String(history)).toThrow(/case history/);
    }
  }
  const edited = updateGuidedCodNol(data, { title11Source: { ...data.title11Source, caseNeverChapter7Or11Confirmed: false } });
  expect(edited.title11Source?.sourceFactsConfirmed).toBeNull();
  expect(edited.title11Source?.caseNeverChapter7Or11Confirmed).toBe(false);
  expect(data.title11Source.sourceFactsConfirmed).toBe(true);
});
