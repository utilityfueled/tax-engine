import type { K1LossSourcesData } from '@/lib/guided-qbi-loss-data';
import { emptyAdjustmentData } from '@/lib/guided-interview-flow';
import { completeW2Entry, startCompleteInterview } from '../guided-interview/complete-facts';
import { ordinaryPriorQbiFixture } from './prior-qbi-ordinary';

function editable(value: unknown): unknown {
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(editable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, editable(child)]));
  return value;
}
export function guidedOrdinaryPriorQbiFixture(prior = '7000') {
  const state = startCompleteInterview({ filingStatus: 'mfj', incomeTypes: ['w2-wages'], lifeEvents: ['k1-loss-sources'], stateCode: null });
  const original = ordinaryPriorQbiFixture('100000', prior), packet = original.qbiLossSources!, person = state.sectionData['personal-info']!;
  const record = packet.priorQbiCarry!;
  Object.assign(record, { primaryName: `${person.firstName} ${person.lastName}`, primaryTaxpayerIdLast4: person.ssn.replaceAll('-', '').slice(-4),
    spouseName: `${person.spouse!.firstName} ${person.spouse!.lastName}`, spouseTaxpayerIdLast4: person.spouse!.ssn.replaceAll('-', '').slice(-4) });
  const source = packet.activities![0]!; source.recipientName = record.primaryName; source.recipientTaxpayerIdLast4 = record.primaryTaxpayerIdLast4;
  const data = editable(packet) as K1LossSourcesData, activity = data.activities![0]!;
  Object.assign(activity, { allOtherAmountsZeroConfirmed: true, domesticNonPtpConfirmed: true, noScorpDebtBasisOrElectionConfirmed: true,
    passiveHistory: { sourceTaxYear: '2024', sourceReference: 'Actual preceding passive/QBI history with no remaining loss', sourceFactsConfirmed: true, vintages: [] } });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000', federalWithheld: '30000' }] };
  state.sectionData.adjustments = { ...emptyAdjustmentData, k1LossSources: data };
  return state;
}
