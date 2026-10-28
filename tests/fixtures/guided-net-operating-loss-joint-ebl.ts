import type { NetOperatingLossData } from '@/lib/guided-net-operating-loss';
import type { K1LossSourcesData } from '@/lib/guided-qbi-loss-data';
import { emptyAdjustmentData } from '@/lib/guided-interview-flow';
import { completeW2Entry, startCompleteInterview } from '../guided-interview/complete-facts';
import { jointEblNolSourceFixture } from './net-operating-loss-joint-ebl';

function editable(value: unknown): unknown {
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(editable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, editable(child)]));
  return value;
}

export function guidedJointEblNolFixture() {
  const state = startCompleteInterview({ filingStatus: 'mfj', incomeTypes: ['w2-wages'],
    lifeEvents: ['net-operating-loss', 'k1-loss-sources'], stateCode: null });
  const personal = state.sectionData['personal-info']!, original = jointEblNolSourceFixture(), nol = original.netOperatingLoss!;
  nol.primaryName = `${personal.firstName} ${personal.lastName}`; nol.primaryTaxpayerIdLast4 = personal.ssn.replaceAll('-', '').slice(-4);
  nol.spouseName = `${personal.spouse!.firstName} ${personal.spouse!.lastName}`; nol.spouseTaxpayerIdLast4 = personal.spouse!.ssn.replaceAll('-', '').slice(-4);
  for (const timeline of [nol.filingUnitHistory!, nol.alternativeTax!.filingUnitHistory!]) {
    timeline.persons![0]!.name = nol.primaryName; timeline.persons![0]!.taxpayerIdLast4 = nol.primaryTaxpayerIdLast4;
    timeline.persons![1]!.name = nol.spouseName; timeline.persons![1]!.taxpayerIdLast4 = nol.spouseTaxpayerIdLast4;
  }
  const qbi = original.qbiLossSources!, history = qbi.excessBusinessLossHistories![0]!;
  Object.assign(qbi.priorQbiCarry!, { primaryName: nol.primaryName, primaryTaxpayerIdLast4: nol.primaryTaxpayerIdLast4,
    spouseName: nol.spouseName, spouseTaxpayerIdLast4: nol.spouseTaxpayerIdLast4 });
  history.recipientName = nol.primaryName; history.recipientTaxpayerIdLast4 = nol.primaryTaxpayerIdLast4;
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '200000', federalWithheld: '20000' }] };
  state.sectionData.adjustments = { ...emptyAdjustmentData,
    netOperatingLossSources: editable(nol) as NetOperatingLossData,
    k1LossSources: editable(qbi) as K1LossSourcesData };
  return state;
}
