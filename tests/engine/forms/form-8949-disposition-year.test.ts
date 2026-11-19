// Spec: spec/federal/form-8949.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax, parseInput } from '@/index.js';
import { calculateForm8949 } from '@/engine/forms/form-8949.js';
import { calculateScheduleD } from '@/engine/schedules/schedule-d.js';
import { getConstants } from '@/models/constants.js';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';
import { actualDigitalAssetSource } from '../../fixtures/digital-asset-sources.js';

const hold = 'Form 1099-B disposition year must match the return year';
const trade = { description: 'Synthetic ordinary stock', dateAcquired: '2023-01-03', dateSold: '2025-06-10',
  proceeds: '10000.10', costBasis: '9000', holdingPeriod: 'long' as const, basisReportedToIRS: true };
function fixture(year = 2025, header: number | undefined = year, dateSold = `${year}-06-10`) {
  const raw = structuredClone(simpleW2Fixture);
  raw.taxpayer.taxYear = year;
  raw.w2s = raw.w2s.map(row => ({ ...row, taxYear: year }));
  raw.form1099B = [{ broker: 'Synthetic broker', transactions: [{ ...trade, dateSold }],
    ...(header === undefined ? {} : { sourceId: 'original-statement', taxYear: header, accountHolder: 'primary' as const, federalWithheld: '0' }) }];
  return parseInput(raw);
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing explicit synthetic original');
  return value;
}

it('holds every explicit original broker disposition outside the return year', () => {
  for (const year of [2025, 2026]) for (const soldYear of [year - 1, year + 1]) for (const datedHeader of [true, false]) {
    for (const sourceDocumentType of [undefined, '1099-b'] as const) for (const zero of [false, true]) {
      const input = fixture(year), original = required(input.form1099B[0]);
      if (!datedHeader) { delete original.taxYear; delete original.sourceId; delete original.accountHolder; delete original.federalWithheld; }
      const good = { ...required(original.transactions[0]), sourceDocumentType };
      const bad = { ...good, dateSold: `${soldYear}-06-10`, ...(zero ? { proceeds: '0', costBasis: '0' } : {}) };
      for (const transactions of [[bad, good], [good, bad]]) {
        const changed = { ...input, form1099B: [{ ...original, transactions }] }, before = JSON.stringify(changed);
        expect(() => calculateForm8949(changed)).toThrow(hold);
        if (year === 2025) {
          expect(() => calculateScheduleD(changed, 'single', getConstants(2025))).toThrow(hold);
          expect(() => calculateFederalTax(changed)).toThrow(hold);
        }
        expect(JSON.stringify(changed)).toBe(before);
      }
    }
  }
  const whitespace = fixture(); required(required(whitespace.form1099B[0]).transactions[0]).dateSold = ' 2024-06-10 ';
  expect(() => calculateForm8949(whitespace)).toThrow(hold);
});

it('preserves matching closings cross-year acquisitions and unknown summary dates', () => {
  for (const year of [2025, 2026]) {
    expect(calculateForm8949(fixture(year)).totalLongTermGainLoss.toFixed()).toBe('1000.1');
  }
  const legacy = parseInput({ ...simpleW2Fixture, form1099B: [{ broker: 'Legacy broker', transactions: [trade] }] });
  expect(calculateFederalTax(legacy).agi.toFixed()).toBe('86000.1');
  const dates = ['2025-06-10', '', 'VARIOUS', 'unknown', 'See attached 2025 summary',
    'See May brokerage summary for 2025', '5 transactions (see attached 2025 summary)'];
  for (const dateAcquired of ['2023-01-03', 'VARIOUS']) for (const dateSold of dates) {
    const input = fixture(), transaction = required(required(input.form1099B[0]).transactions[0]);
    Object.assign(transaction, { dateAcquired, dateSold });
    const before = JSON.stringify(input), result = calculateForm8949(input);
    expect(result.totalLongTermGainLoss.toFixed()).toBe('1000.1');
    expect(result.longTermBoxD.transactions[0]?.dateSold).toBe(dateSold);
    expect(result.longTermBoxD.transactions[0]?.dateAcquired).toBe(dateAcquired);
    expect(calculateFederalTax(input).agi.toFixed()).toBe('86000.1');
    expect(JSON.stringify(input)).toBe(before);
  }
  const closed = fixture();
  Object.assign(required(required(closed.form1099B[0]).transactions[0]), {
    description: 'Synthetic short sale opened2024 closed by delivery in2025', dateAcquired: '2025-01-10', dateSold: '2025-01-13', holdingPeriod: 'short',
  });
  expect(calculateForm8949(closed).totalShortTermGainLoss.toFixed()).toBe('1000.1');
  const wrongHeader = fixture(2025, 2024);
  expect(() => calculateFederalTax(wrongHeader)).toThrow('Broker withholding source year must match the actual return year');
});

it.each(['31DEC2024', '2024 06 10'])('holds the noncanonical original broker date %s', dateSold => {
  const input = fixture(2025, 2025, dateSold);
  const calendarHold = 'Form 1099-B disposition date requires an actual canonical calendar date';
  expect(() => calculateForm8949(input)).toThrow(calendarHold);
  expect(() => calculateFederalTax(input)).toThrow(calendarHold);
});

it('holds noncanonical and impossible date-like original broker dispositions', () => {
  const calendarHold = 'Form 1099-B disposition date requires an actual canonical calendar date';
  for (const dateSold of ['12/31/2024', '12/31/2025', '2024-12-31T00:00:00.000Z', '2025-12-31T00:00:00.000Z',
    '2024-2-29', '2025-2-28', '2025-02-30', '2025-02-29', '2025-13-01', '2025-00-01', '2025-01-00', '2025-01-32',
    'Dec 31, 2025', 'Sept 31, 2025', 'December2025', '2025', '20241231', '241231', '2024/12/31', '12.31.2024']) for (const datedHeader of [true, false]) {
    const input = fixture(), original = required(input.form1099B[0]);
    if (!datedHeader) { delete original.taxYear; delete original.sourceId; delete original.accountHolder; delete original.federalWithheld; }
    const good = required(original.transactions[0]);
    for (const transactions of [[{ ...good, dateSold }, good], [good, { ...good, dateSold }]]) {
      const changed = { ...input, form1099B: [{ ...original, transactions }] }, before = JSON.stringify(changed);
      expect(() => calculateForm8949(changed)).toThrow(calendarHold);
      expect(() => calculateFederalTax(changed)).toThrow(calendarHold);
      expect(JSON.stringify(changed)).toBe(before);
    }
  }
  const zero = fixture(); Object.assign(required(required(zero.form1099B[0]).transactions[0]), { dateSold: '2025-02-30', proceeds: '0', costBasis: '0' });
  expect(() => calculateForm8949(zero)).toThrow(calendarHold);
  const leap = fixture(2024, 2024, '2024-02-29');
  expect(calculateForm8949(leap).totalLongTermGainLoss.toFixed()).toBe('1000.1');
  const invalidPrior = fixture(2025, 2025, '2024-02-30');
  expect(() => calculateForm8949(invalidPrior)).toThrow(hold);
});

it('preserves separate digital nonstatement and section1256 methods', () => {
  for (const sourceDocumentType of ['1099-da', 'not-reported'] as const) {
    const input = fixture(), transaction = required(required(input.form1099B[0]).transactions[0]);
    Object.assign(transaction, { sourceDocumentType, dateSold: '2024-06-10', digitalAsset: true, basisReportedToIRS: false });
    const result = calculateForm8949(input);
    expect((sourceDocumentType === '1099-da' ? result.longTermBoxK : result.longTermBoxL).totalGainLoss.toFixed()).toBe('1000.1');
  }
  const digital = parseInput({ ...simpleW2Fixture, form1099DA: [structuredClone(actualDigitalAssetSource)] });
  expect(calculateForm8949(digital).totalShortTermGainLoss.toFixed()).toBe('10.25');
  const badDigital = structuredClone(actualDigitalAssetSource);
  required(badDigital.transactions[0]).dateSold = '2024-06-01';
  expect(() => calculateForm8949(parseInput({ ...simpleW2Fixture, form1099DA: [badDigital] }))).toThrow();
  const contracts = parseInput({ ...simpleW2Fixture, form1099B: [], form6781: { section1256Gains: '1000' } });
  const schedule = calculateScheduleD(contracts, 'single', getConstants(2025));
  expect(schedule.netShortTerm.toFixed()).toBe('400');
  expect(schedule.netLongTerm.toFixed()).toBe('600');
});
