// Spec: spec/federal/form-1099-da-sources.yaml.
import { expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { Form1099DASchema, TaxYearInputSchema } from '@/models/inputs.js';
import { calculateForm1099DASources } from '@/engine/forms/form-1099-da-sources.js';
import { normalizeDigitalAssetCapitalInput, assertOrdinaryDigitalAssetReview } from '@/engine/forms/digital-asset-capital-input.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateForm8949 } from '@/engine/forms/form-8949.js';
import { calculatePAReturn } from '@/engine/state/pa-orchestrator.js';
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
    { assetOrigin: 'staking' }, { optionalReportingMethod: 'stablecoins' }, { transactionType: 'gift' }, { sellingExpenses: '1', proceedsType: 'net' },
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

const corrected = (patch: Record<string, unknown>) => {
  const form = fixture();
  Object.assign(form.transactions[0]!, { dateAcquired: '2024-01-15', reportedDateAcquired: '2024-01-15', holdingPeriod: 'long', proceeds: '10000', costBasis: '6000', reportedCostBasis: '9000',
    basisReportedToIRS: true, noncoveredSecurity: false, basisCorrectionConfirmed: true, ...patch });
  return input([form]);
};
const row = (source: ReturnType<typeof input>) => calculateForm8949(source).longTermBoxJ.transactions[0];

it('corrects differing broker basis with code B', () => {
  expect(row(corrected({}))).toMatchObject({ adjustmentCode: 'B' });
  expect(row(corrected({}))!.costBasis.toFixed()).toBe('9000');
  expect(row(corrected({}))!.adjustment.toFixed()).toBe('3000');
  expect(row(corrected({}))!.gainLoss.toFixed()).toBe('4000');
  expect(row(corrected({ costBasis: '9500' }))!.adjustment.toFixed()).toBe('-500');
  expect(row(corrected({ costBasis: '9500' }))!.gainLoss.toFixed()).toBe('500');
  const unreported = calculateForm8949(corrected({ basisReportedToIRS: false, noncoveredSecurity: true })).longTermBoxK.transactions[0]!;
  expect([unreported.costBasis.toFixed(), unreported.adjustment.toFixed(), unreported.adjustmentCode, unreported.gainLoss.toFixed()]).toEqual(['6000', '0', 'B', '4000']);
  expect(() => calculateForm8949(corrected({ basisCorrectionConfirmed: undefined }))).toThrow(/basis correction/);
  expect(() => calculateForm8949(corrected({ basisCorrectionConfirmed: false }))).toThrow(/basis correction/);
  expect(() => calculateForm8949(corrected({ basisSource: 'broker_statement' }))).toThrow(/basis correction/);
  const same = row(corrected({ costBasis: '9000' }))!;
  expect([same.adjustmentCode, same.adjustment.toFixed()]).toEqual(['', '0']);
  expect(calculateFederalTax(corrected({})).capitalGainLoss.toFixed()).toBe('4000');
  expect(calculateForm8949(corrected({ gainOrLoss: '1000' })).totalLongTermGainLoss.toFixed()).toBe('4000');
  expect(() => calculateForm8949(corrected({ gainOrLoss: '4000' }))).toThrow(/statement gain/);
});

it('reduces gain for costs not on the form with code E', () => {
  const both = row(corrected({ sellingExpenses: '25', sellingCostsNotInProceedsConfirmed: true }))!;
  expect([both.adjustmentCode, both.adjustment.toFixed(), both.gainLoss.toFixed()]).toEqual(['BE', '2975', '3975']);
  const expense = row(corrected({ reportedCostBasis: '6000', sellingExpenses: '25', sellingCostsNotInProceedsConfirmed: true, basisCorrectionConfirmed: undefined }))!;
  expect([expense.adjustmentCode, expense.adjustment.toFixed(), expense.gainLoss.toFixed()]).toEqual(['E', '-25', '3975']);
  for (const proceedsType of ['gross', 'net']) {
    expect(() => calculateForm8949(corrected({ reportedCostBasis: '6000', sellingExpenses: '25', proceedsType }))).toThrow(/Box 1f/);
    expect(row(corrected({ reportedCostBasis: '6000', sellingExpenses: '25', proceedsType, sellingCostsNotInProceedsConfirmed: true }))!.gainLoss.toFixed()).toBe('3975');
  }
  expect(() => calculateForm8949(corrected({ reportedCostBasis: '6000', marketDiscount: '1' }))).toThrow(/market discount/);
});

it('keeps corrected rows out of methods that cannot read them', () => {
  const pa = { paCostBasis: '6000', paBasisSourceReference: 'Fictional PA basis', paBasisFactsConfirmed: true, paTransactionForProfitConfirmed: true };
  expect(() => calculatePAReturn(corrected(pa))).toThrow(/Pennsylvania digital wash-sale or special adjustments/);
  expect(() => calculatePAReturn(corrected({ ...pa, reportedCostBasis: '6000', sellingExpenses: '25', sellingCostsNotInProceedsConfirmed: true }))).toThrow(/Pennsylvania digital wash-sale or special adjustments/);
  const wash = row(corrected({ proceeds: '5000', costBasis: '6000', reportedCostBasis: '9000', washSale: true, washSaleDisallowed: '200' }))!;
  expect([wash.adjustmentCode, wash.adjustment.toFixed(), wash.gainLoss.toFixed()]).toEqual(['BW', '3200', '-800']);
  const legacy = fixture().transactions[0]!;
  const fieldsOnly = { ...input(), form1099DA: [{ brokerName: 'Legacy broker', transactions: [{ digitalAssetName: 'BTC', dateAcquired: legacy.dateAcquired, dateSold: legacy.dateSold, proceeds: legacy.proceeds, costBasis: legacy.costBasis,
    basisReportedToIRS: false, holdingPeriod: 'short', transactionType: 'sale', washSale: false, washSaleDisallowed: '0', adjustments: '0', sellingCostsNotInProceedsConfirmed: true }] }] };
  expect(() => calculateForm1099DASources(TaxYearInputSchema.parse(fieldsOnly))).toThrow(/actual|complete|unknown/i);
  const audited = calculateFederalTax(corrected({})).allLines.find(line => line.form === 'Form1099DA' && line.line.startsWith('capital:'));
  expect(audited!.value.toFixed()).toBe('4000');
  expect(() => TaxYearInputSchema.parse({ ...simpleW2Fixture, form1099B: [{ broker: 'Actual', stateWithheld: '0', transactions: [{ description: 'X', dateAcquired: '2024-01-01', dateSold: '2025-06-30',
    proceeds: '1', costBasis: '0', basisReportedToIRS: true, holdingPeriod: 'long', adjustmentCodes: 'ZZ' }] }] })).toThrow();
});
