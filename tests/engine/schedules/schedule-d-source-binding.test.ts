// Spec: spec/federal/schedule-d-source-binding.yaml.
import { expect, it } from 'vitest';
import { calculateScheduleD } from '@/engine/schedules/schedule-d.js';
import { getConstants } from '@/models/constants.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';

export function sourceFacts() {
  return {
    taxYear: 2025, sourceReference: 'Actual capital source worksheet', sourceFactsConfirmed: true,
    allSourcesIncluded: true, primary: { firstName: 'Jane', lastName: 'Doe', ssnLast4: '6789' },
    priorShortTermCapitalLoss: '0', priorLongTermCapitalLoss: '0', section1231Lookback: '0',
    amtBasisAndCarryoversSameAsRegularConfirmed: true, form2439Present: false, partnershipInterestDispositionPresent: false, other1250DispositionPresent: false,
    longTermAssets: [] as Record<string, unknown>[], reportedGains: [] as Record<string, unknown>[],
  };
}
const calculate = (facts: unknown, changes: Record<string, unknown> = {}) => calculateScheduleD(
  TaxYearInputSchema.parse({ ...simpleW2Fixture, ...changes, scheduleDSpecialGainSources: facts }), 'single', getConstants(2025));
const broker = {
  broker: 'Actual Broker', accountHolder: 'primary', transactions: [
    { description: 'Gold coin', dateAcquired: '2020-02-01', dateSold: '2025-05-01', proceeds: '1500.25', costBasis: '500.10', adjustments: '0', washSale: false, washSaleDisallowed: '0', holdingPeriod: 'long' },
    { description: 'Long stock', dateAcquired: '2020-02-01', dateSold: '2025-05-01', proceeds: '100', costBasis: '300', adjustments: '0', washSale: false, washSaleDisallowed: '0', holdingPeriod: 'long' },
  ],
};
function asset(index: number, character = 'ordinary') {
  return { sourceId: `form1099B:0:transaction:${index}`, sourceTaxYear: 2025, sourceReference: `Trade ${index}`, accountHolder: 'primary', payerName: broker.broker, ...broker.transactions[index], character };
}
it('binds every actual long-term asset and recomputes signed collectibles', () => {
  const facts = { ...sourceFacts(), longTermAssets: [asset(0, 'collectible'), asset(1)] };
  const result = calculate(facts, { form1099B: [broker] });
  expect(result.lines.find(line => line.form === 'Sched D' && line.line === '18')?.value.toFixed()).toBe('1000');
  expect(result.lines.find(line => line.form === '28% Rate Gain Worksheet' && line.line === '1')?.value.toFixed()).toBe('1000.15');
  expect(result.netLongTerm.toFixed()).toBe('800.15');
  expect(() => calculate({ ...facts, longTermAssets: [asset(0)] }, { form1099B: [broker] })).toThrow(/every|missing|complete/i);
  expect(() => calculate({ ...facts, longTermAssets: [asset(0), asset(0)] }, { form1099B: [broker] })).toThrow(/duplicate/i);
  expect(() => calculate({ ...facts, longTermAssets: [{ ...asset(0), proceeds: '1500.26' }, asset(1)] }, { form1099B: [broker] })).toThrow(/reconcile|stale|conflict/i);
  const lossFacts = { ...facts, longTermAssets: [asset(0), asset(1, 'collectible')] };
  expect(calculate(lossFacts, { form1099B: [broker] }).lines.find(line => line.form === '28% Rate Gain Worksheet' && line.line === '1')?.value.toFixed()).toBe('-200');
});
it('rejects unknown stale and conflicting source identities', () => {
  for (const change of [
    { taxYear: 2024 }, { primary: { firstName: 'Other', lastName: 'Doe', ssnLast4: '6789' } },
    { priorShortTermCapitalLoss: '-1' }, { sourceFactsConfirmed: false }, { allSourcesIncluded: false },
  ]) expect(() => calculate({ ...sourceFacts(), ...change })).toThrow();
  const facts = { ...sourceFacts(), longTermAssets: [{ ...asset(0), accountHolder: 'spouse' }, asset(1)] };
  expect(() => calculate(facts, { form1099B: [broker] })).toThrow(/owner|spouse|household/i);
  expect(() => calculate({ ...sourceFacts(), priorShortTermCapitalLoss: undefined })).toThrow();
});
it('routes actual reported gain sources and final estate loss once', () => {
  const div = { payer: 'Fund', accountHolder: 'primary', ordinaryDividends: '0', totalCapitalGainDistributions: '5000', collectiblesGain: '1000', section1250Gain: '2000', section1202Gain: '0' };
  const estate = { estateTrustName: 'Estate', estateTrustEIN: '12-3456789', accountHolder: 'primary', netLongTermCapitalGain: '0', collectiblesGain: '0', unrecapturedSection1250Gain: '0', isFinalK1: true, finalYearLongTermCapitalLoss: '-500' };
  const facts = { ...sourceFacts(), reportedGains: [
    { sourceId: 'form1099Div:0', sourceTaxYear: 2025, sourceReference: 'DIV source', payerName: 'Fund', accountHolder: 'primary', netLongTermCapitalGain: '5000', collectiblesGain: '1000', unrecapturedSection1250Gain: '2000', section1202Gain: '0' },
    { sourceId: 'scheduleK1Form1041:0', sourceTaxYear: 2025, sourceReference: 'Estate source', payerName: 'Estate', accountHolder: 'primary', netLongTermCapitalGain: '0', collectiblesGain: '0', unrecapturedSection1250Gain: '0', section1202Gain: '0', finalYearLongTermCapitalLoss: '-500', isFinalK1: true },
  ] };
  const result = calculate(facts, { form1099Div: [div], scheduleK1Form1041: [estate] });
  expect(result.lines.find(line => line.form === 'Sched D' && line.line === '18')?.value.toFixed()).toBe('500');
  expect(result.lines.find(line => line.form === 'Sched D' && line.line === '19')?.value.toFixed()).toBe('2000');
  expect(result.netLongTerm.toFixed()).toBe('4500');
  expect(() => calculate({ ...facts, reportedGains: [] }, { form1099Div: [div] })).toThrow(/every|missing|complete/i);
});
it('preserves separate source methods instead of assuming their amounts', () => {
  for (const key of ['form2439Present', 'partnershipInterestDispositionPresent', 'other1250DispositionPresent']) {
    expect(() => calculate({ ...sourceFacts(), [key]: true })).toThrow(/source|method|history/i);
  }
  expect(() => calculate(sourceFacts(), { homeSales: [{ description: 'Unbound property' }] })).toThrow();
  const div = { payer: 'Fund', accountHolder: 'primary', ordinaryDividends: '0', totalCapitalGainDistributions: '5000', section1202Gain: '1000' };
  const facts = { ...sourceFacts(), reportedGains: [{ sourceId: 'form1099Div:0', sourceTaxYear: 2025, sourceReference: 'DIV source', payerName: 'Fund', accountHolder: 'primary', netLongTermCapitalGain: '5000', collectiblesGain: '0', unrecapturedSection1250Gain: '0', section1202Gain: '1000' }] };
  expect(() => calculate(facts, { form1099Div: [div] })).toThrow(/1202|QSBS/i);
});

it('limits partnership1250 by actual section1231 gain and lookback before reported distributions', () => {
  const partnership = { partnershipName: 'Actual partnership', partnershipEIN: '12-3456789', accountHolder: 'primary', ordinaryIncome: '0', netLongTermCapitalGain: '0', collectiblesGain: '0', unrecapturedSection1250Gain: '500', section1231Gain: '1000' };
  const facts = { ...sourceFacts(), section1231Lookback: '100', reportedGains: [{ sourceId: 'scheduleK1:0', sourceTaxYear: 2025, sourceReference: 'K1 statement', accountHolder: 'primary', payerName: 'Actual partnership', netLongTermCapitalGain: '0', collectiblesGain: '0', unrecapturedSection1250Gain: '500', section1202Gain: '0', section1231Gain: '1000' }] };
  const result = calculate(facts, { scheduleK1: [partnership], form4797: { nonrecapturedNetSection1231Losses: '100' } });
  expect(result.netLongTerm.toFixed()).toBe('900');
  expect(result.lines.find(line => line.form === 'Sched D' && line.line === '19')?.value.toFixed()).toBe('400');
  expect(() => calculate({ ...facts, amtBasisAndCarryoversSameAsRegularConfirmed: false }, { scheduleK1: [partnership], form4797: { nonrecapturedNetSection1231Losses: '100' } })).toThrow(/AMT.*source/i);
  expect(() => calculate(facts, { scheduleK1: [{ ...partnership, amtAdjustedGainOrLoss: '1' }], form4797: { nonrecapturedNetSection1231Losses: '100' } })).toThrow(/AMT.*adjustment|same.basis/i);
});
it('requires real original trade dates and actual spouse identity', () => {
  const changed = { ...broker, transactions: [{ ...broker.transactions[0], dateSold: '2025-02-30' }, broker.transactions[1]] };
  const facts = { ...sourceFacts(), longTermAssets: [{ ...asset(0), dateSold: '2025-02-30' }, asset(1)] };
  expect(() => calculate(facts, { form1099B: [changed] })).toThrow(/date/i);
  const joint = { ...simpleW2Fixture.taxpayer, filingStatus: 'married_filing_jointly', spouse: { firstName: 'Alex', lastName: 'Doe', ssn: '987-65-4321', dateOfBirth: '1991-01-01' } };
  expect(() => calculate(sourceFacts(), { taxpayer: joint })).toThrow(/household|spouse/i);
  const complete = { ...sourceFacts(), spouse: { firstName: 'Alex', lastName: 'Doe', ssnLast4: '4321' } };
  expect(() => calculate(complete, { taxpayer: joint })).not.toThrow();
});
