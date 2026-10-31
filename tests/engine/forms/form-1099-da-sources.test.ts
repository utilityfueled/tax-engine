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

it('treats payments and income-origin assets from their actual records', () => {
  const run = (patch: Record<string, unknown>) => { const source = fixture(); Object.assign(source.transactions[0]!, { dateAcquired: '2024-01-15', holdingPeriod: 'long', ...patch }); return input([source]); };
  expect(calculateForm8949(run({ transactionType: 'payment' })).longTermBoxK.transactions[0]!.gainLoss.toFixed()).toBe('10.25');
  for (const assetOrigin of ['mining', 'staking', 'airdrop']) {
    expect(() => calculateForm8949(run({ assetOrigin }))).toThrow(/special disposition or original acquisition/);
    expect(() => calculateForm8949(run({ assetOrigin, originIncomeIncludedConfirmed: false }))).toThrow(/special disposition or original acquisition/);
    expect(calculateForm8949(run({ assetOrigin, originIncomeIncludedConfirmed: true })).longTermBoxK.transactions[0]!.gainLoss.toFixed()).toBe('10.25');
  }
  expect(() => calculateForm8949(run({ assetOrigin: 'other', originIncomeIncludedConfirmed: true }))).toThrow(/special disposition/);
  expect(() => calculateForm8949(run({ transactionType: 'gift' }))).toThrow(/special disposition/);
});

const lot = (patch: Record<string, unknown>) => { const form = fixture(); Object.assign(form.transactions[0]!, { dateAcquired: '2023-03-01', holdingPeriod: 'long', ...patch }); return input([form]); };
const gift = (sold: string, basis: string, patch: Record<string, unknown> = {}, source: Record<string, unknown> = {}) => lot({ assetOrigin: 'gift', proceeds: sold, costBasis: basis,
  giftSource: { donorBasis: '10000', fairMarketValueAtGift: '8000', giftDate: '2023-03-01', sourceFactsConfirmed: true, donorHoldingDocumented: true, fromSpouse: false, ...source }, ...patch });
const longRow = (source: ReturnType<typeof input>) => calculateForm8949(source).longTermBoxK.transactions[0]!;

it('applies the donor basis and value rule to gifts', () => {
  expect(longRow(gift('12000', '10000', { dateAcquired: '2020-01-15' })).gainLoss.toFixed()).toBe('2000');
  expect(longRow(gift('9000', '9000')).gainLoss.toFixed()).toBe('0');
  expect(longRow(gift('7000', '8000')).gainLoss.toFixed()).toBe('-1000');
  expect(longRow(gift('3000', '5000', { dateAcquired: '2020-01-15' }, { donorBasis: '5000' })).gainLoss.toFixed()).toBe('-2000');
  expect(() => calculateForm8949(gift('9000', '10000'))).toThrow(/donor basis and value rule/);
  expect(() => calculateForm8949(gift('7000', '8000', { dateAcquired: '2020-01-15' }))).toThrow(/acquisition date conflicts/);
  expect(() => calculateForm8949(gift('12000', '10000', { dateAcquired: '2023-04-01' }))).toThrow(/acquisition date conflicts/);
  expect(() => calculateForm8949(gift('12000', '10000', {}, { sourceFactsConfirmed: false }))).toThrow(/confirmed donor basis/);
  expect(() => calculateForm8949(gift('12000', '10000', {}, { donorBasis: '' }))).toThrow(/donor basis/);
  expect(() => calculateForm8949(gift('12000', '10000', { giftSource: undefined }))).toThrow(/confirmed donor basis/);
  expect(() => calculateForm8949(gift('12000', '10000', {}, { fromSpouse: undefined }))).toThrow(/confirmed donor basis/);
  expect(() => calculateForm8949(gift('12000', '10000', {}, { giftDate: '2025-06-02' }))).toThrow(/confirmed donor basis/);
  // Selling costs: the rule reads the amount realized, not Box 1f.
  const costs = { sellingExpenses: '500', sellingCostsNotInProceedsConfirmed: true };
  expect(longRow(gift('9000', '8500', costs)).gainLoss.toFixed()).toBe('0');
  expect(longRow(gift('10300', '9800', costs)).gainLoss.toFixed()).toBe('0');
  expect(longRow(gift('8100', '8000', costs)).gainLoss.toFixed()).toBe('-400');
  expect(() => calculateForm8949(gift('9000', '9000', costs))).toThrow(/donor basis and value rule/);
  // Without documented donor holding, holding starts at the gift.
  expect(() => calculateForm8949(gift('12000', '10000', { dateAcquired: '2020-01-15' }, { donorHoldingDocumented: false }))).toThrow(/acquisition date conflicts/);
  expect(longRow(gift('12000', '10000', {}, { donorHoldingDocumented: false })).gainLoss.toFixed()).toBe('2000');
  const short = calculateForm8949(gift('9000', '0', { dateAcquired: '2025-03-01', holdingPeriod: 'short' }, { donorBasis: '0', fairMarketValueAtGift: '0', giftDate: '2025-03-01', donorHoldingDocumented: false }));
  expect(short.shortTermBoxH.transactions[0]!.gainLoss.toFixed()).toBe('9000');
  // A spouse's transfer keeps the spouse's basis with no value test, and holding tacks.
  expect(longRow(gift('7000', '10000', { dateAcquired: '2020-01-15' }, { fromSpouse: true })).gainLoss.toFixed()).toBe('-3000');
  expect(() => calculateForm8949(gift('7000', '8000', {}, { fromSpouse: true }))).toThrow(/donor basis and value rule/);
});

it('reports inherited lots as long-term', () => {
  const row = longRow(lot({ assetOrigin: 'inheritance', inheritedBasisConfirmed: true, dateAcquired: '2025-05-01' }));
  expect([row.dateAcquired, row.gainLoss.toFixed()]).toEqual(['INHERITED', '10.25']);
  expect(calculateFederalTax(lot({ assetOrigin: 'inheritance', inheritedBasisConfirmed: true, dateAcquired: '2025-05-01' })).scheduleD!.netLongTerm.toFixed()).toBe('10.25');
  expect(() => calculateForm8949(lot({ assetOrigin: 'inheritance', dateAcquired: '2025-05-01' }))).toThrow(/special disposition/);
  expect(() => calculateForm8949(lot({ assetOrigin: 'inheritance', inheritedBasisConfirmed: true, dateAcquired: '2025-05-01', holdingPeriod: 'short' }))).toThrow(/holding period/);
});

it('ties a lot received in the return year to income on this return', () => {
  const lotRow = (patch: Record<string, unknown>, income?: Record<string, unknown>) => { const form = fixture(); Object.assign(form.transactions[0]!, { assetOrigin: 'mining', originIncomeIncludedConfirmed: true, ...patch });
    return { ...input([form]), ...(income ? { cryptoIncome: { miningIncome: [], stakingIncome: [], airdropIncome: [], ...income } } : {}) } as ReturnType<typeof input>; };
  const receipt = (patch: Record<string, unknown> = {}) => ({ asset: 'BTC', dateReceived: '2025-01-15', quantity: '0.001', fairMarketValuePerUnit: '90240', ...patch });
  const message = /received in the return year needs that income/, gain = (source: ReturnType<typeof input>) => calculateForm8949(source).shortTermBoxH.transactions[0]!.gainLoss.toFixed();
  expect(() => calculateForm8949(lotRow({}))).toThrow(message);
  expect(gain(lotRow({}, { miningIncome: [receipt()] }))).toBe('10.25');
  expect(gain(lotRow({ assetOrigin: 'staking' }, { stakingIncome: [receipt({ asset: 'btc' })] }))).toBe('10.25');
  expect(gain(lotRow({ assetOrigin: 'airdrop' }, { airdropIncome: [receipt({ source: 'airdrop' })] }))).toBe('10.25');
  expect(gain(lotRow({}, { miningIncome: [receipt({ quantity: '0.002' })] }))).toBe('10.25');
  expect(gain(lotRow({ costBasis: '0' }, { miningIncome: [receipt({ fairMarketValuePerUnit: '0' })] }))).toBe('100.49');
  expect(gain(lotRow({}, { miningIncome: [receipt({ asset: 'ACTUAL-DTIF' })] }))).toBe('10.25');
  expect(gain(lotRow({}, { miningIncome: [receipt({ fairMarketValuePerUnit: '50000' }), receipt()] }))).toBe('10.25');
  for (const income of [{ miningIncome: [receipt({ asset: 'ETH' })] }, { miningIncome: [receipt({ dateReceived: '2024-01-15' })] }, { miningIncome: [receipt({ dateReceived: '2025-01-16' })] }, { stakingIncome: [receipt()] },
    { miningIncome: [receipt({ quantity: '0.0009' })] }, { miningIncome: [receipt({ fairMarketValuePerUnit: '50000' })] }, { miningIncome: [receipt({ fairMarketValuePerUnit: '90251' })] }]) {
    expect(() => calculateForm8949(lotRow({}, income)), JSON.stringify(income)).toThrow(message);
  }
  expect(() => calculateForm8949(lotRow({ costBasis: '50' }, { miningIncome: [receipt()] }))).toThrow(message);
  const twoRows = fixture(); twoRows.transactions[1] = { ...twoRows.transactions[0]!, sourceId: 'second' };
  for (const row of twoRows.transactions) Object.assign(row, { assetOrigin: 'mining', originIncomeIncludedConfirmed: true });
  expect(() => calculateForm8949({ ...input([twoRows]), cryptoIncome: { miningIncome: [receipt()], stakingIncome: [], airdropIncome: [] } } as ReturnType<typeof input>)).toThrow(message);
  expect(calculateForm8949({ ...input([twoRows]), cryptoIncome: { miningIncome: [receipt({ quantity: '0.002' })], stakingIncome: [], airdropIncome: [] } } as ReturnType<typeof input>).shortTermBoxH.transactions).toHaveLength(2);
  expect(calculateForm8949({ ...input([twoRows]), cryptoIncome: { miningIncome: [receipt(), receipt()], stakingIncome: [], airdropIncome: [] } } as ReturnType<typeof input>).shortTermBoxH.transactions).toHaveLength(2);
});

it('rejects a confirmed row beside a lot-consuming source for the same asset', () => {
  const form = fixture(), lot = (asset: string) => ({ asset, dateAcquired: '2024-01-15', quantity: '1', costBasisPerUnit: '100', source: 'purchase' });
  const swap = (fromAsset: string, toAsset = 'USDC') => ({ fromAsset, fromQuantity: '0.1', toAsset, toQuantity: '30', fairMarketValueAtSwap: '30', dateSwapped: '2025-07-01' });
  const run = (cryptoIncome: unknown, source = form, extra: unknown[] = []) => calculateFederalTax(TaxYearInputSchema.parse({ ...input([source, ...extra as never[]]), cryptoIncome }));
  const message = /separate lot method/;
  expect(() => run({ lots: [lot('BTC')], tokenSwaps: [swap('BTC')] })).toThrow(message);
  expect(() => run({ lots: [lot('btc')], tokenSwaps: [swap('btc')] })).toThrow(message);
  expect(() => run({ lots: [lot('ACTUAL-DTIF')], tokenSwaps: [swap('ACTUAL-DTIF')] })).toThrow(message);
  expect(() => run({ lots: [lot('BTC')], liquidations: [{ platform: 'Fictional', collateralAsset: 'BTC', collateralQuantity: '0.1', fairMarketValueAtLiquidation: '30', dateOfLiquidation: '2025-07-01' }] })).toThrow(message);
  expect(() => run({ lots: [lot('BTC')], lpPositions: [{ protocol: 'Fictional', poolAssets: ['BTC', 'USDC'], lpTokensReceived: '1', underlyingAssetsDeposited: [{ asset: 'BTC', quantity: '0.1', costBasisPerUnit: '100' }], dateEntered: '2025-07-01' }] })).toThrow(message);
  // Lots that are not at risk still calculate.
  expect(() => run({ lots: [lot('BTC')] })).not.toThrow();
  expect(() => run({ lots: [lot('BTC'), lot('ETH')], tokenSwaps: [swap('ETH')] })).not.toThrow();
  expect(() => run({ lots: [lot('BTC'), lot('ETH')], tokenSwaps: [swap('ETH', 'BTC')] })).not.toThrow();
  expect(() => run({ lots: [lot('ETH')], tokenSwaps: [swap('ETH')] })).not.toThrow();
  // A row with no ticker could be any lot, so it rejects once a lot is consumed.
  const unnamed = fixture(); delete unnamed.transactions[0]!.ticker;
  expect(() => run({ lots: [lot('BTC')], tokenSwaps: [swap('BTC')] }, unnamed)).toThrow(message);
  expect(() => run({ lots: [lot('BTC')] }, unnamed)).not.toThrow();
  // An unconfirmed statement consumes lots only when it needs them.
  const legacy = (transaction: Record<string, unknown>) => ({ brokerName: 'Legacy broker', transactions: [{ digitalAssetName: 'Bitcoin', ticker: 'BTC', dateAcquired: '2024-01-15', dateSold: '2025-06-01', proceeds: '50', costBasis: '0', basisReportedToIRS: false, holdingPeriod: 'long', ...transaction }] });
  expect(() => run({ lots: [lot('BTC')] }, form, [legacy({})])).toThrow(message);
  expect(() => run({ lots: [lot('BTC')] }, form, [legacy({ basisReportedToIRS: true, costBasis: '40' })])).not.toThrow();
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
