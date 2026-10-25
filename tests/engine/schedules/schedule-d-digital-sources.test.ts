// Spec: spec/federal/schedule-d-digital-sources.yaml.
import { expect, it } from 'vitest';
import { calculateScheduleD, type ScheduleDExtraInput } from '@/engine/schedules/schedule-d.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { normalizeDigitalAssetCapitalInput } from '@/engine/forms/digital-asset-capital-input.js';
import { calculateForm1099DASources } from '@/engine/forms/form-1099-da-sources.js';
import { TaxYearInputSchema, type TaxYearInput } from '@/models/inputs.js';
import { getConstants } from '@/models/constants.js';
import { syntheticScheduleDSpecialGainInput } from '../../fixtures/schedule-d-special-gains.js';
import { actualDigitalAssetSource } from '../../fixtures/digital-asset-sources.js';

function input(): TaxYearInput {
  const original = syntheticScheduleDSpecialGainInput(2025, '0'); original.form8814 = [];
  const source = structuredClone(actualDigitalAssetSource);
  const digital = { ...source.transactions[0], dateAcquired: '2020-01-15', holdingPeriod: 'long' };
  const broker = { broker: 'Original B broker', sourceId: 'Original B statement', taxYear: 2025, accountHolder: 'primary', federalWithheld: '0', stateWithheld: '0',
    transactions: [{ description: 'Actual gold coin', sourceDocumentType: '1099-b', dateAcquired: '2020-01-01', dateSold: '2025-01-01', proceeds: '200', costBasis: '100', adjustments: '0', washSale: false, washSaleDisallowed: '0', holdingPeriod: 'long', basisReportedToIRS: false, digitalAsset: false }] };
  const result = TaxYearInputSchema.parse({ ...original, form1099B: [broker], form1099DA: [{ ...source, transactions: [digital] }] });
  const forms = calculateForm1099DASources(result).capitalForms;
  if (!result.scheduleDSpecialGainSources) throw new Error('Missing synthetic source worksheet');
  result.scheduleDSpecialGainSources.longTermAssets = [
    { sourceId: 'form1099B:0:transaction:0', sourceTaxYear: 2025, sourceReference: 'Actual original B trade', accountHolder: 'primary', payerName: broker.broker, ...result.form1099B[0].transactions[0], character: 'collectible' },
    { sourceId: 'form1099DA:0:transaction:0', sourceTaxYear: 2025, sourceReference: JSON.stringify([source.sourceId, digital.sourceId]), accountHolder: 'primary', payerName: source.brokerName, ...forms[0].transactions[0], character: 'ordinary' },
  ];
  return result;
}
const run = (source: TaxYearInput, originals?: TaxYearInput['form1099DA']) => calculateScheduleD(source, 'single', getConstants(2025), undefined,
  originals === undefined ? undefined : { originalDigitalAssetSources: originals } as ScheduleDExtraInput);
it('binds original long-term DA sources in direct and canonical capital worksheets', () => {
  const source = input(), before = JSON.stringify(source);
  for (const result of [run(source), run(normalizeDigitalAssetCapitalInput(source), source.form1099DA), calculateFederalTax(source).scheduleD]) {
    expect(result.netLongTerm.toFixed()).toBe('110.25'); expect(result.netCapitalGainLoss.toFixed()).toBe('110.25');
    expect(result.lines.find(line => line.form === 'Sched D' && line.line === '18')?.value.toFixed()).toBe('100');
    expect(result.lines.find(line => line.form === 'Sched D' && line.line === '19')?.value.toFixed()).toBe('0');
  }
  expect(calculateFederalTax(source).totalWithholding.toFixed()).toBe('12750.1');
  expect(JSON.stringify(source)).toBe(before);
});
it('rejects missing duplicated and stale normalized digital source copies', () => {
  const source = input();
  expect(() => run(normalizeDigitalAssetCapitalInput(source))).toThrow(/original|source/i);
  const duplicate = normalizeDigitalAssetCapitalInput(source); duplicate.form1099B.push(structuredClone(duplicate.form1099B[1]));
  expect(() => run(duplicate, source.form1099DA)).toThrow(/duplicate|once|source/i);
  for (const patch of [{ proceeds: '101.49', costBasis: '91.24' }, { sourceDocumentType: '1099-b' }, { dateAcquired: '2019-01-15' }]) {
    const copy = normalizeDigitalAssetCapitalInput(source); Object.assign(copy.form1099B[1].transactions[0], patch);
    expect(() => run(copy, source.form1099DA)).toThrow(/original|reconcile|source|conflict/i);
  }
  const missing = normalizeDigitalAssetCapitalInput(source); missing.form1099B.pop();
  expect(() => run(missing, source.form1099DA)).toThrow(/original|missing|source/i);
  const changed = normalizeDigitalAssetCapitalInput(source); changed.form1099B[1].accountHolder = 'spouse';
  expect(() => run(changed, source.form1099DA)).toThrow(/owner|source|conflict/i);
});
it('retains original digital identity and unsupported source boundaries', () => {
  for (const patch of [{ sourceId: 'form1099B:1:transaction:0' }, { sourceReference: 'Different original statement' }, { sourceTaxYear: 2024 }, { accountHolder: 'spouse' }, { character: 'collectible' }, { character: 'qsbs' }]) {
    const source = input(); if (!source.scheduleDSpecialGainSources) throw new Error('Missing worksheet');
    Object.assign(source.scheduleDSpecialGainSources.longTermAssets[1], patch);
    expect(() => run(source)).toThrow(); expect(() => calculateFederalTax(source)).toThrow();
  }
  for (const patch of [{ sourceId: 'Different original disposition' }, { nftOrCollectible: true }, { costBasis: undefined }, { basisFactsConfirmed: false }]) {
    const source = input(); Object.assign(source.form1099DA[0].transactions[0], patch);
    expect(() => run(source)).toThrow();
  }
  const source = input(); const changedOriginals = structuredClone(source.form1099DA); changedOriginals[0].sourceId = 'Different statement';
  expect(() => run(normalizeDigitalAssetCapitalInput(source), changedOriginals)).toThrow();
});
