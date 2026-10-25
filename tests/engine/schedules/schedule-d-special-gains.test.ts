// Spec: spec/federal/schedule-d-special-gains.yaml.
import { describe, expect, it } from 'vitest';
import { calculateScheduleDSpecialGains, type ScheduleDSpecialGainSources } from '@/engine/schedules/schedule-d-special-gains.js';
import { d } from '@/utils/decimal.js';
const source = (): ScheduleDSpecialGainSources => ({
  form8949CollectiblesGainLoss: d('0'), section1202WorksheetComponent: d('0'), otherCollectiblesGainLoss: d('0'), reportedCollectiblesGainLoss: d('0'),
  shortTermNetGainLoss: d('0'), longTermLossCarryover: d('0'), form4797Gain: d('0'), form4797Lookback: d('0'),
  businessProperties: [], businessInstallment1250Gain: d('0'), passThrough1250Gain: d('0'), partnershipSale1250Gain: d('0'), reported1250Gain: d('0'), other1250Gain: d('0'),
});
const line = (result: ReturnType<typeof calculateScheduleDSpecialGains>, form: string, id: string) => result.lines.find(row => row.form === form && row.line === id)?.value.toFixed();
describe('Actual ScheduleD special gain worksheets', () => {
  it('combines actual signed source gains before either loss offset', () => {
    const result = calculateScheduleDSpecialGains({ ...source(), form8949CollectiblesGainLoss: d('-300'), section1202WorksheetComponent: d('250'), otherCollectiblesGainLoss: d('-100'), reportedCollectiblesGainLoss: d('730') });
    expect(result.collectiblesGain.toFixed()).toBe('580');
    expect(line(result, '28% Rate Gain Worksheet', '4')).toBe('730');
    expect(line(result, 'Unrecaptured Section1250 Gain Worksheet', '14')).toBe('580');
  });
  it('uses short and carry losses once against collectible gains first', () => {
    for (const [short, carry, expected] of [['-1000', '0', '0'], ['1000', '-200', '530'], ['-100', '-200', '430']]) {
      const result = calculateScheduleDSpecialGains({ ...source(), reportedCollectiblesGainLoss: d('730'), shortTermNetGainLoss: d(short), longTermLossCarryover: d(carry) });
      expect(result.collectiblesGain.toFixed()).toBe(expected);
      expect(line(result, '28% Rate Gain Worksheet', '5')).toBe(carry);
    }
  });
  it('calculates each property before limiting the business aggregate', () => {
    const result = calculateScheduleDSpecialGains({ ...source(), form4797Gain: d('10000'), businessProperties: [
      { depreciationAllowed: d('3000'), totalGain: d('1000'), ordinaryRecapture: d('200') },
      { depreciationAllowed: d('2000'), totalGain: d('5000'), ordinaryRecapture: d('500') },
    ] });
    expect(result.unrecapturedSection1250Gain.toFixed()).toBe('2300');
    expect(line(result, 'Unrecaptured Section1250 Gain Worksheet', '3')).toBe('2300');
  });
  it('applies actual business gain and lookback limits before other source gains', () => {
    const facts = { ...source(), form4797Gain: d('5000'), form4797Lookback: d('2000'), businessInstallment1250Gain: d('4000'), passThrough1250Gain: d('2000'), reported1250Gain: d('700') };
    expect(calculateScheduleDSpecialGains(facts).unrecapturedSection1250Gain.toFixed()).toBe('3700');
    expect(calculateScheduleDSpecialGains({ ...facts, form4797Lookback: d('5000') }).unrecapturedSection1250Gain.toFixed()).toBe('700');
  });
  it('keeps reported and nonbusiness1250sources when business gain is absent', () => {
    for (const business of ['0', '-1000']) {
      const result = calculateScheduleDSpecialGains({ ...source(), form4797Gain: d(business), passThrough1250Gain: d('9000'), partnershipSale1250Gain: d('100'), reported1250Gain: d('200'), other1250Gain: d('300') });
      expect(result.unrecapturedSection1250Gain.toFixed()).toBe('600');
      expect(line(result, 'Unrecaptured Section1250 Gain Worksheet', '9')).toBe('0');
    }
  });
  it('nets remaining capital losses against1250gain instead of gross source gain', () => {
    const facts = { ...source(), reportedCollectiblesGainLoss: d('730'), reported1250Gain: d('1460'), shortTermNetGainLoss: d('-1000') };
    expect(calculateScheduleDSpecialGains(facts).unrecapturedSection1250Gain.toFixed()).toBe('1190');
    expect(calculateScheduleDSpecialGains({ ...facts, longTermLossCarryover: d('-1190') }).unrecapturedSection1250Gain.toFixed()).toBe('0');
    expect(calculateScheduleDSpecialGains({ ...facts, reportedCollectiblesGainLoss: d('-200') }).unrecapturedSection1250Gain.toFixed()).toBe('260');
  });
  it('rejects impossible source amounts and preserves exact cents and inputs', () => {
    const facts = { ...source(), reportedCollectiblesGainLoss: d('730.50'), reported1250Gain: d('1460.25'), shortTermNetGainLoss: d('-1000.25') };
    const before = JSON.stringify(facts);
    expect(calculateScheduleDSpecialGains(facts).unrecapturedSection1250Gain.toFixed()).toBe('1190.5');
    expect(JSON.stringify(facts)).toBe(before);
    for (const patch of [{ longTermLossCarryover: d('1') }, { reported1250Gain: d('-1') }, { form4797Gain: d('NaN') }, { reportedCollectiblesGainLoss: undefined }]) {
      expect(() => calculateScheduleDSpecialGains({ ...source(), ...patch } as ScheduleDSpecialGainSources)).toThrow(/source/i);
    }
    expect(() => calculateScheduleDSpecialGains({ ...source(), businessProperties: [{ depreciationAllowed: d('100'), totalGain: d('200'), ordinaryRecapture: d('101') }] })).toThrow(/recapture/i);
  });
});
