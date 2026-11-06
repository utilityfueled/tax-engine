import type { NetOperatingLossData } from '@/lib/guided-net-operating-loss';
import { emptyAdjustmentData } from '@/lib/guided-interview-flow';
import { changedNolReturnFixture } from './net-operating-loss-filing-unit';
import { completeW2Entry, startCompleteInterview } from '../guided-interview/complete-facts';

function editable(value: unknown): unknown {
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(editable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, editable(child)]));
  return value;
}
export function guidedChangedNolFixture() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['net-operating-loss'], stateCode: null });
  const personal = state.sectionData['personal-info']!;
  const original = changedNolReturnFixture().netOperatingLoss;
  original.primaryName = `${personal.firstName} ${personal.lastName}`;
  original.primaryTaxpayerIdLast4 = personal.ssn.replaceAll('-', '').slice(-4);
  for (const timeline of [original.filingUnitHistory, original.alternativeTax.filingUnitHistory]) {
    timeline.persons[0]!.name = original.primaryName; timeline.persons[0]!.taxpayerIdLast4 = original.primaryTaxpayerIdLast4;
  }
  const sources = editable(original) as NetOperatingLossData;
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '50000' }] };
  state.sectionData.adjustments = { ...emptyAdjustmentData, netOperatingLossSources: sources };
  return state;
}
