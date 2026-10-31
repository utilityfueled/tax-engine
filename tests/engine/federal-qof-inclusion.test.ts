// Spec: spec/federal/qof-deferred-gain-inclusion.yaml character/state.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateForm8949 } from '@/engine/forms/form-8949.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { assertQofStateMethod } from '@/engine/forms/qof-inclusion.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { qofFacts, qofInvestment } from '../fixtures/qof-inclusion.js';

const sale = (gainCharacter: 'short_term' | 'long_term', dates: { investmentDate: string; eventDate: string }) => TaxYearInputSchema.parse({ ...simpleW2Fixture,
  qofDispositionFacts: qofFacts(2025, [qofInvestment({ event: 'sale_or_exchange', gainCharacter, ...dates, originalDeferredGain: '10000', remainingDeferredGain: '10000', fairMarketValue: '12000', proceeds: '12000', basisBeforeInclusion: '0' })]) });

it('keeps original character through Form8949 and ScheduleD', () => {
  const long = sale('long_term', { investmentDate: '2022-02-01', eventDate: '2025-06-30' }), base = calculateFederalTax(simpleW2Fixture);
  const before = JSON.stringify(long), result = calculateFederalTax(long);
  expect(result.qofInclusion!.rows[0]!.includedGain.toFixed()).toBe('10000');
  expect(result.scheduleD!.netLongTerm.toFixed()).toBe('12000');
  expect(result.agi.minus(base.agi).toFixed()).toBe('12000');
  const box = calculateForm8949(long).longTermBoxF;
  expect(box.transactions).toHaveLength(1);
  expect(box.transactions[0]).toMatchObject({ adjustmentCode: 'Y', description: '98-7654321' });
  expect(box.totalGainLoss.toFixed()).toBe('12000');
  expect(JSON.stringify(long)).toBe(before);
  const short = sale('short_term', { investmentDate: '2025-02-01', eventDate: '2025-06-30' }), shortResult = calculateFederalTax(short);
  expect(shortResult.scheduleD!.netShortTerm.toFixed()).toBe('12000');
  expect(calculateForm8949(short).shortTermBoxC.transactions[0]).toMatchObject({ adjustmentCode: 'Y' });
  expect(calculateForm8949(long).totalLongTermGainLoss.toFixed()).toBe('12000');
});

it('rejects a Pennsylvania attachment until state treatment exists', () => {
  expect(() => assertQofStateMethod(sale('long_term', { investmentDate: '2022-02-01', eventDate: '2025-06-30' }), 'Pennsylvania')).toThrow(/QOF.*Pennsylvania/);
  expect(() => assertQofStateMethod(simpleW2Fixture, 'Pennsylvania')).not.toThrow();
});
