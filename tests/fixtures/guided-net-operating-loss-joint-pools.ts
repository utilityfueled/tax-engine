import type { NetOperatingLossData } from '@/lib/guided-net-operating-loss';
import { emptyAdjustmentData } from '@/lib/guided-interview-flow';
import { jointNolSourceFixture } from './net-operating-loss-joint-pools';
import { completeW2Entry, startCompleteInterview } from '../guided-interview/complete-facts';

function editable(value: unknown): unknown {
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(editable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, editable(child)]));
  return value;
}
export function guidedJointNolFixture() {
  const state = startCompleteInterview({ filingStatus: 'mfj', incomeTypes: ['w2-wages'], lifeEvents: ['net-operating-loss'], stateCode: null });
  const personal = state.sectionData['personal-info']!, original = jointNolSourceFixture().netOperatingLoss;
  original.primaryName = `${personal.firstName} ${personal.lastName}`; original.primaryTaxpayerIdLast4 = personal.ssn.replaceAll('-', '').slice(-4);
  original.spouseName = `${personal.spouse!.firstName} ${personal.spouse!.lastName}`; original.spouseTaxpayerIdLast4 = personal.spouse!.ssn.replaceAll('-', '').slice(-4);
  for (const timeline of [original.filingUnitHistory, original.alternativeTax.filingUnitHistory]) {
    timeline.persons[0]!.name = original.primaryName; timeline.persons[0]!.taxpayerIdLast4 = original.primaryTaxpayerIdLast4;
    timeline.persons[1]!.name = original.spouseName; timeline.persons[1]!.taxpayerIdLast4 = original.spouseTaxpayerIdLast4;
  }
  // Actual fictional withholding covers the current tax; no prior-payment
  // history is inferred for this source-complete download control.
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000', federalWithheld: '2000' }] };
  state.sectionData.adjustments = { ...emptyAdjustmentData, netOperatingLossSources: editable(original) as NetOperatingLossData };
  return state;
}
