import type { K1CharitableSourcesData } from '@/lib/guided-k1-charitable-data';
import type { CharitableCarryoverData } from '@/lib/guided-charitable-carryover';
import { emptyDeductionData } from '@/lib/guided-interview-flow';
import { startCompleteInterview, completeW2Entry } from '../guided-interview/complete-facts';
import { actualGuidedK1Charity } from './guided-k1-charitable-sources';
import { priorPropertyNonitemizedInput } from './k1-prior-property-nonitemized';
import { releaseFixtureSource as required } from './charitable-k1-basis-release-nol';

/** Only spelling conversion of fictional originals, never computed current allowances. */
export function guidedPriorPropertyState(method: 'basis' | 'risk' | 'both' = 'both') {
  const input = priorPropertyNonitemizedInput({ method });
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  state.currentSectionIndex = 2;
  state.completedSections = ['personal-info', 'income-w2'];
  Object.assign(required(state.sectionData['personal-info']), input.taxpayer.primary);
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: input.w2s[0].wages,
    federalWithheld: input.w2s[0].federalWithheld }] };
  const strings = (value: unknown): unknown => typeof value === 'number' ? String(value)
    : Array.isArray(value) ? value.map(strings) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, strings(item)])) : value;
  const packet = strings(input.k1CharitableSources) as K1CharitableSourcesData;
  const original = strings(input.scheduleK1[0]) as NonNullable<NonNullable<K1CharitableSourcesData['statements']>[number]['original']>;
  const defaults = required(actualGuidedK1Charity().statements)[0];
  Object.assign(required(packet.statements)[0], { link: 'independent', originalSourceReference: 'Fictional original2026 K1',
    allUnlistedAmountsZeroConfirmed: true, domesticContinuingNonPtpConfirmed: true,
    original: { ...defaults.original, ...original } });
  state.sectionData.deductions = { ...emptyDeductionData, method: 'standard', medicalExpenses: '0', stateLocalTaxes: '0',
    realEstateTaxes: '0', mortgageInterest: '0', charitableContributions: '0', casualtyLosses: '0', otherItemized: '0',
    gamblingWinnings: '0', nonW2IncomeTaxesDeductedElsewhere: '0', donationEntries: [], k1CharitableSources: packet,
    charitableCarryoverSources: strings(input.charitableCarryoverSources) as CharitableCarryoverData };
  return state;
}
