import type { EducationDistributionData, EducationSourceRecord } from '@/lib/guided-education-distributions';
import { actualGuidedRoomBoardPeriod } from './guided-room-board-periods';
import { roomBoardPriorUseFixture } from './education-room-board-prior-use';

export function actualGuidedRoomBoardPriorUse() {
  const { state } = actualGuidedRoomBoardPeriod();
  const fixture = roomBoardPriorUseFixture(), original = fixture.input;
  const collections = Object.fromEntries(Object.entries(fixture.facts).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key,
    (value as Array<Record<string, unknown>>).map(row => Object.fromEntries(Object.entries(row).map(([field, item]) =>
      [field, typeof item === 'number' ? String(item) : item])) as EducationSourceRecord),
  ]));
  const data: EducationDistributionData = { ...collections, taxYear: '2025', sourceFactsConfirmed: true,
    allDistributionsReconciled: true, exceptionsDistinctFromCreditConfirmed: true,
    forms: (original.form1099Q ?? []).map(({ taxYear, transfer, ...fields }) => ({ fields: { ...fields, taxYear: String(taxYear) }, transfer: { kind: transfer?.kind } })) };
  if (!state.sectionData.credits) throw new Error('Missing fictional credits section');
  state.sectionData.credits.educationDistributions = data;
  return { state, data, original };
}
