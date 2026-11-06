import { buildSectionRoute } from '@/lib/guided-interview-flow';
import type { K1CharitableSourcesData } from '@/lib/guided-k1-charitable-data';
import type { CharitableCarryoverData } from '@/lib/guided-charitable-carryover';
import type { NetOperatingLossData } from '@/lib/guided-net-operating-loss';
import { firstAdmissionInput } from './k1-charitable-first-admission';
import { guidedPriorPropertyState } from './guided-k1-prior-property-nonitemized';
import { releaseFixtureSource as required } from './charitable-k1-basis-release-nol';

const strings = (value: unknown): unknown => typeof value === 'number' ? String(value)
  : Array.isArray(value) ? value.map(strings) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, strings(item)])) : value;
/** Only spelling conversion of fictional originals, never current calculated values. */
export function guidedFirstAdmissionState(options: Parameters<typeof firstAdmissionInput>[0] = {}) {
  const input = firstAdmissionInput(options), state = guidedPriorPropertyState('basis');
  const deductions = required(state.sectionData.deductions), existing = required(required(deductions.k1CharitableSources).statements)[0];
  const packet = strings(input.k1CharitableSources) as K1CharitableSourcesData;
  Object.assign(required(packet.statements)[0], { link: 'independent', originalSourceReference: 'Fictional original2026 pure basis release statement',
    allUnlistedAmountsZeroConfirmed: true, domesticContinuingNonPtpConfirmed: true,
    original: { ...existing.original, ...strings(input.scheduleK1[0]) as NonNullable<typeof existing.original> } });
  deductions.k1CharitableSources = packet;
  deductions.charitableCarryoverSources = strings(input.charitableCarryoverSources) as CharitableCarryoverData;
  deductions.method = input.deductionElection;
  state.sectionData['income-w2']!.entries[0].wages = input.w2s[0].wages;
  state.sectionData['income-w2']!.entries[0].federalWithheld = input.w2s[0].federalWithheld;
  if (input.netOperatingLoss) {
    state.segmentation.lifeEvents = [...state.segmentation.lifeEvents, 'net-operating-loss'];
    state.sectionData.adjustments = { ...state.sectionData.adjustments,
      netOperatingLossSources: strings(input.netOperatingLoss) as NetOperatingLossData };
    state.currentSectionIndex = buildSectionRoute(state.segmentation).findIndex(section => section.id === 'deductions');
  }
  return state;
}
