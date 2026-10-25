// Spec: spec/federal/form-1099-da-sources.yaml.
import { expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { Form1099DASchema, TaxYearInputSchema } from '@/models/inputs.js';
import { calculateForm1099DASources } from '@/engine/forms/form-1099-da-sources.js';
import { normalizeDigitalAssetCapitalInput, assertOrdinaryDigitalAssetReview } from '@/engine/forms/digital-asset-capital-input.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { FEDERAL_RULE_PACKS } from '@/models/rule-pack-metadata.js';
import { actualDigitalAssetSource } from '../../fixtures/digital-asset-sources.js';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';

const fixture = () => structuredClone(actualDigitalAssetSource);
const input = (forms: unknown[] = [fixture()]) => TaxYearInputSchema.parse({ ...simpleW2Fixture, form1099DA: forms });
it('preserves original missing basis separately from actual taxpayer records', () => {
  const source = Form1099DASchema.parse(fixture());
  expect(source.sourceFactsComplete).toBe(true);
  expect(source.transactions[0]?.reportedCostBasis).toBeNull();
  expect(source.transactions[0]?.reportedDateAcquired).toBeNull();
  const result = calculateForm1099DASources(input());
  expect(result.capitalForms[0]?.transactions[0]).toMatchObject({ costBasis: '90.24', dateAcquired: '2025-01-15', sourceDocumentType: '1099-da', digitalAsset: true });
  const missing = fixture() as unknown as Record<string, unknown>; delete missing.federalWithheld;
  expect(Form1099DASchema.parse({ ...missing, sourceFactsComplete: true }).sourceFactsComplete).toBe(false);
  expect(() => calculateForm1099DASources(input([missing]))).toThrow(/actual|unknown|complete|Box4/i);
  const zero = fixture(); zero.transactions[0].costBasis = '0.00';
  expect(calculateForm1099DASources(input([zero])).capitalForms[0]?.transactions[0]?.costBasis).toBe('0.00');
  const actualZero = TaxYearInputSchema.parse({ ...input([zero]), cryptoIncome: { miningIncome: [], stakingIncome: [], airdropIncome: [], lots: [{ asset: 'BTC', dateAcquired: '2025-01-15', quantity: '0.001', costBasisPerUnit: '100000', source: 'purchase' }] } });
  expect(calculateFederalTax(actualZero).capitalGainLoss.toFixed()).toBe('100.49');
  expect(actualZero.form1099DA[0].transactions[0].costBasis).toBe('0.00');
});
it('rejects unknown conflicting and unsupported actual digital sources', () => {
  for (const patch of [{ basisFactsConfirmed: undefined }, { reportedCostBasis: undefined }, { quantity: undefined }, { basisReportedToIRS: undefined },
    { basisSource: 'broker_statement' }, { basisReportedToIRS: true }, { reportedCostBasis: '90.25', basisSource: 'broker_statement' },
    { ordinaryIncome: true }, { qof: true }, { lossNotAllowed: true }, { marketDiscount: '0.01' }, { nftOrCollectible: true },
    { assetOrigin: 'staking' }, { optionalReportingMethod: 'stablecoins' }, { transactionType: 'gift' }, { sellingExpenses: '1' },
    { adjustments: '0.01' }, { washSale: false, washSaleDisallowed: '1' }, { dateSold: '2025-02-30' }, { dateSold: '2024-06-01' },
    { holdingPeriod: 'long' }, { costBasis: '-1' }, { quantity: 'NaN' }]) {
    const source = fixture(); Object.assign(source.transactions[0], patch); const original = JSON.stringify(source);
    expect(() => calculateForm1099DASources(input([source]))).toThrow(); expect(JSON.stringify(source)).toBe(original);
  }
  const value = fixture(); value.transactions[0].costBasis = '9007199254740993.03'; value.transactions[0].proceeds = '9007199254740994.04';
  expect(calculateForm1099DASources(input([value])).capitalForms[0]?.transactions[0]?.costBasis).toBe('9007199254740993.03');
});
it('binds unique original digital statements to actual owners and years', () => {
  for (const patch of [{ sourceId: undefined }, { sourceId: ' ' }, { taxYear: undefined }, { taxYear: 2024 }, { accountHolder: undefined },
    { accountHolder: 'spouse' }, { sourceFactsConfirmed: false }, { allTransactionsIncluded: undefined }, { federalWithheld: '-1' },
    { stateTaxReporting: undefined }, { stateTaxReporting: 'none', stateWithheld: '1' }, { stateTaxReporting: 'multiple' }]) {
    expect(() => calculateForm1099DASources(input([{ ...fixture(), ...patch }]))).toThrow();
  }
  expect(() => calculateForm1099DASources(input([fixture(), fixture()]))).toThrow(/duplicate|once/i);
  const duplicated = fixture(); duplicated.transactions.push(structuredClone(duplicated.transactions[0]));
  expect(() => calculateForm1099DASources(input([duplicated]))).toThrow(/duplicate|once/i);
  const collision = input(); collision.form1099B.push({ broker: 'Actual digital broker', sourceId: actualDigitalAssetSource.sourceId, stateWithheld: '0', transactions: [] });
  expect(() => calculateForm1099DASources(collision)).toThrow(/duplicate|already|collision/i);
});
it('normalizes actual digital capital sources once without changing original evidence', () => {
  const original = input(), serialized = JSON.stringify(original);
  const normalized = normalizeDigitalAssetCapitalInput(original, { resolvedLegacyBasis: new Map([['Bitcoin (BTC) via Actual digital broker|2025-06-01', { costBasis: new Decimal(999), dateAcquired: '2020-01-01' }]]) });
  expect(normalized.form1099DA).toEqual([]); expect(normalized.form1099B).toHaveLength(1);
  expect(normalized.form1099B[0]?.transactions[0]?.costBasis).toBe('90.24');
  expect(normalizeDigitalAssetCapitalInput(normalized)).toEqual(normalized);
  expect(JSON.stringify(original)).toBe(serialized);
});
it('routes actual digital withholding once through the canonical return', () => {
  const second = fixture(); second.sourceId = 'Actual DA statement B'; second.accountReference = 'Actual account B'; second.federalWithheld = '0.20';
  second.transactions[0].sourceId = 'Original disposition2'; second.transactions[0].costBasis = second.transactions[0].proceeds;
  const result = calculateFederalTax(input([fixture(), second]));
  expect(result.capitalGainLoss.toFixed()).toBe('10.25');
  expect(result.totalWithholding.toFixed()).toBe('12750.3');
  expect(result.allLines.find(line => line.form === '1040' && line.line === '25b')?.value.toFixed()).toBe('0.3');
});
it('keeps legacy sources unverified and rejects incomplete derived review contexts', () => {
  const legacy = input([{ brokerName: 'Legacy digital broker', transactions: [{ digitalAssetName: 'Bitcoin', dateAcquired: '2024-01-01', dateSold: '2025-02-01', proceeds: '100', costBasis: '0', holdingPeriod: 'long', basisReportedToIRS: false }] }]);
  expect(calculateForm1099DASources(legacy).sourceFactsComplete).toBe(false);
  expect(() => assertOrdinaryDigitalAssetReview(legacy)).toThrow(/actual|complete|source/i);
  expect(() => assertOrdinaryDigitalAssetReview(input())).not.toThrow();
  const source = input(); source.cryptoIncome = { miningIncome: [], stakingIncome: [], airdropIncome: [], isMiningBusiness: false, isStakingBusiness: false, cryptoCostBasisMethod: 'fifo', lots: [], tokenSwaps: [{ date: '2025-06-01' }] } as never;
  expect(() => assertOrdinaryDigitalAssetReview(source)).toThrow(/derived|crypto|separate/i);
});
it('never discards known new special facts through historical compatibility', () => {
  const legacy = { brokerName: 'Legacy digital broker', transactions: [{ digitalAssetName: 'Bitcoin', dateAcquired: '2024-01-01', dateSold: '2025-02-01', proceeds: '100', costBasis: '0', holdingPeriod: 'long', basisReportedToIRS: false }] };
  for (const known of [{ ordinaryIncome: true }, { marketDiscount: '25' }, { qof: true }, { lossNotAllowed: true }, { nftOrCollectible: true }, { sellingExpenses: '10' }, { noncoveredSecurity: false }]) {
    const source = structuredClone(legacy); Object.assign(source.transactions[0], known);
    expect(() => calculateForm1099DASources(input([source]))).toThrow(/actual|complete|source/i);
    expect(() => calculateFederalTax(input([source]))).toThrow(/actual|complete|source/i);
  }
});
it('requires actual2026 source boxes without inferring noncovered basis', () => {
  const source = fixture(); source.taxYear = 2026; source.transactions[0].dateSold = '2026-01-01';
  const actual = TaxYearInputSchema.parse({ ...input([source]), taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 } });
  expect(calculateForm1099DASources(actual).capitalForms[0].transactions[0].costBasis).toBe('90.24');
  actual.form1099DA[0].transactions[0].noncoveredSecurity = false;
  expect(() => calculateForm1099DASources(actual)).toThrow(/covered.*basis/i);
  actual.form1099DA[0].transactions[0].noncoveredSecurity = true;
  const missing = structuredClone(source) as unknown as Record<string, unknown>; delete missing.federalWithheld;
  const incomplete = TaxYearInputSchema.parse({ ...actual, form1099DA: [missing] });
  expect(() => calculateForm1099DASources(incomplete)).toThrow(/complete/i);
  expect(FEDERAL_RULE_PACKS[2026].calculationStatus).toBe('incomplete');
  expect(FEDERAL_RULE_PACKS[2026].filingQualified).toBe(false);
});
