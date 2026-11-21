// Spec: spec/federal/form-8949-digital-reporting.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateForm8949 } from '@/engine/forms/form-8949.js';
import { calculateScheduleD } from '@/engine/schedules/schedule-d.js';
import { getConstants } from '@/models/constants.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { reportingCategoriesInput } from '../../fixtures/form-8949-reporting.js';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';

it('holds a wallet-documented swap and a liquidation that could consume the same original lot', () => {
  const wallet = { walletOrAccountReference: 'Fixture Wallet A', sourceFactsConfirmed: true };
  const base = {
    ...simpleW2Fixture,
    cryptoIncome: {
      tokenSwaps: [{
        fromAsset: 'ETH', fromQuantity: '1', toAsset: 'USDC', toQuantity: '1000',
        fairMarketValueAtSwap: '1000', dateSwapped: '2025-06-01', gasFee: '0',
        walletFifoConfirmed: true, walletSource: { ...wallet, originalRecordReference: 'Swap execution' },
      }],
      lots: [{
        asset: 'ETH', dateAcquired: '2023-01-01', quantity: '1', costBasisPerUnit: '100',
        walletSource: { ...wallet, originalRecordReference: 'Acquisition' },
      }],
    },
  };
  expect(calculateFederalTax(TaxYearInputSchema.parse(base)).scheduleD?.netLongTerm.toFixed()).toBe('900');

  const combined = TaxYearInputSchema.parse({
    ...base, cryptoIncome: { ...base.cryptoIncome, liquidations: [{
      platform: 'Fixture lender', collateralAsset: 'ETH', collateralQuantity: '1',
      fairMarketValueAtLiquidation: '600', dateOfLiquidation: '2025-07-01',
    }] },
  });
  expect(() => calculateFederalTax(combined)).toThrow(/wallet.+separate lot method/i);

  const reverted = TaxYearInputSchema.parse({ ...base, cryptoIncome: {
    ...base.cryptoIncome,
    liquidations: combined.cryptoIncome?.liquidations,
    tokenSwaps: base.cryptoIncome.tokenSwaps.map(swap => ({
      ...swap, fromQuantity: '0', toQuantity: '0', fairMarketValueAtSwap: '0',
    })),
  } });
  expect(calculateFederalTax(reverted).scheduleD?.netLongTerm.toFixed()).toBe('500');

  const poolEntry = TaxYearInputSchema.parse({ ...base, cryptoIncome: { ...base.cryptoIncome, lpPositions: [{
    protocol: 'Fixture pool', poolAssets: ['ETH', 'USDC'], lpTokensReceived: '1', dateEntered: '2025-07-01',
    underlyingAssetsDeposited: [{ asset: 'ETH', quantity: '1', costBasisPerUnit: '100' }],
  }] } });
  expect(() => calculateFederalTax(poolEntry)).toThrow(/wallet.+separate lot method/i);

  const legacyBroker = TaxYearInputSchema.parse({ ...base, form1099DA: [{ brokerName: 'Fixture broker', transactions: [{
    digitalAssetName: 'Ether', ticker: 'ETH', quantity: '1', proceeds: '700', costBasis: '0',
    dateAcquired: '2023-01-01', dateSold: '2025-07-01', holdingPeriod: 'long', basisReportedToIRS: false,
  }] }] });
  expect(() => calculateFederalTax(legacyBroker)).toThrow(/wallet.+separate lot method/i);
});

it('routes all twelve original reporting categories without losing cents', () => {
  const input = reportingCategoriesInput();
  const original = structuredClone(input);
  const result = calculateForm8949(input);
  for (const [box, part, expected] of [
    ['A', 'I', '20.05'], ['B', 'I', '-25.05'], ['C', 'I', '200.2'],
    ['G', 'I', '100.2'], ['H', 'I', '-100.1'], ['I', 'I', '100.1'],
    ['D', 'II', '200.05'], ['E', 'II', '-250.05'], ['F', 'II', '2000.2'],
    ['J', 'II', '1000.2'], ['K', 'II', '-1000.1'], ['L', 'II', '1000.1'],
  ]) {
    const line = result.lines.find(row => row.line === `Part ${part} Box ${box}`);
    expect(line?.value.toString(), box).toBe(expected);
    expect(line?.formula, box).toBe('1 transactions');
  }
  expect(result.totalShortTermGainLoss.toString()).toBe('295.4');
  expect(result.totalLongTermGainLoss.toString()).toBe('2950.4');
  const schedule = calculateScheduleD(input, 'single', getConstants(2025));
  expect(schedule.netShortTerm.toString()).toBe('295.4');
  expect(schedule.netLongTerm.toString()).toBe('2950.4');
  expect(schedule.netCapitalGainLoss.toString()).toBe('3245.8');
  expect(input).toEqual(original);
});

it('preserves actual broker reporting and rejects contradictory source categories', () => {
  const input = reportingCategoriesInput();
  const trade = input.form1099B[0].transactions[0];
  const only = (changes: Record<string, unknown>) => ({ ...input, form1099B: [{ broker: 'Original1099-B', transactions: [{ ...trade, ...changes }] }] });
  for (const sourceDocumentType of ['1099-b', undefined]) {
    const result = calculateForm8949(only({ digitalAsset: true, sourceDocumentType }));
    expect(result.shortTermBoxA.totalGainLoss.toString()).toBe('20.05');
  }
  for (const changes of [
    { sourceDocumentType: '1099-da', digitalAsset: false },
    { sourceDocumentType: 'not-reported', basisReportedToIRS: true },
    { sourceDocumentType: 'invented-document' },
  ]) expect(() => calculateForm8949(only(changes))).toThrow(/source|document|reported|digital/i);
});
