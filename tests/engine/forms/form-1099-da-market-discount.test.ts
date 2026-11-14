// Spec: spec/federal/form-1099-da-market-discount.yaml.
import { expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateForm1099DASources } from '@/engine/forms/form-1099-da-sources.js';
import { calculateScheduleB } from '@/engine/schedules/schedule-b.js';
import { calculateForm8949 } from '@/engine/forms/form-8949.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { marketDiscountInput as source } from '../../fixtures/form-1099-da-market-discount.js';
import { calculateDigitalAssetStateSources } from '@/engine/state/digital-asset-sources.js';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter.js';
import { actualDigitalAssetSource } from '../../fixtures/digital-asset-sources.js';
import { calculateOhioSD100 } from '@/engine/state/oh-sd-100.js';


it('admits actual ordinary-checked market discount without rewriting its original', () => {
  const input = source(), before = JSON.stringify(input);
  const converted = calculateForm1099DASources(input);
  const row = converted.capitalForms[0].transactions[0];
  expect(row.adjustmentCodes).toBe('D');
  expect(row.adjustments).toBe('-50.005');
  expect(new Decimal(row.proceeds).minus(row.costBasis).plus(row.adjustments ?? '0').toFixed()).toBe('150.015');
  expect(JSON.stringify(input)).toBe(before);
  expect(input.form1099DA[0].transactions[0].ordinaryIncome).toBe(true);
});

it('caps ordinary interest at actual gain and retains a disposition loss', () => {
  for (const [proceeds, basis, discount, interest, capital] of [
    ['1005', '1000', '50', '5', '0'],
    ['1000', '1000', '50', '0', '0'],
    ['999.99', '1000', '50', '0', '-0.01'],
  ]) {
    const input = source(proceeds, basis, discount);
    expect(calculateScheduleB(input).taxableInterest.toFixed()).toBe(interest);
    expect(calculateForm8949(input).totalLongTermGainLoss.toFixed()).toBe(capital);
  }
});

it('routes exact market discount once into canonical interest and capital classes', () => {
  const input = source(), originalInt = JSON.stringify(input.form1099Int);
  expect(calculateScheduleB(input).taxableInterest.toFixed()).toBe('50.005');
  const result = calculateFederalTax(input);
  expect(result.totalInterest.toFixed()).toBe('50.005');
  expect(result.capitalGainLoss.toFixed()).toBe('150.015');
  expect(result.totalInterest.plus(result.capitalGainLoss).toFixed()).toBe('200.02');
  expect(JSON.stringify(input.form1099Int)).toBe(originalInt);
});

it('preserves known zero without admitting an unknown or unqualified positive original', () => {
  const knownZero = source('1200', '1000', '0');
  expect(calculateForm1099DASources(knownZero).marketDiscountInterest.toFixed()).toBe('0');
  expect(calculateForm8949(knownZero).totalLongTermGainLoss.toFixed()).toBe('200');
  const ordinary = source(); ordinary.form1099DA = [structuredClone(actualDigitalAssetSource)];
  const legacyZero = TaxYearInputSchema.parse(ordinary);
  expect(calculateForm1099DASources(legacyZero).marketDiscountInterest.toFixed()).toBe('0');
  for (const value of [undefined, '', 'NaN', '-0.01']) {
    const input = source(); Object.assign(input.form1099DA[0].transactions[0], { marketDiscount: value });
    expect(() => calculateForm1099DASources(input)).toThrow();
    expect(() => calculateScheduleB(input)).toThrow();
  }
  const bare = source(); delete bare.form1099DA[0].transactions[0].marketDiscountSource;
  expect(() => calculateForm1099DASources(bare)).toThrow(/source method/i);
  expect(() => calculateScheduleB(bare)).toThrow();
});

it('requires explicit debt, election, history and once-only source facts', () => {
  for (const patch of [
    { sourceFactsConfirmed: false }, { sourceReference: '' }, { securityIdentifier: '' }, { originalDispositionReference: '' },
    { sourceTaxYear: 2024 }, { accountHolder: 'spouse' }, { accountReference: 'changed account' },
    { statementSourceId: 'other statement' }, { transactionSourceId: 'other sale' },
    { issuerTaxTreatment: 'treasury' }, { tokenizedDebtConfirmed: false }, { heldForInvestmentConfirmed: false },
    { fullDisposition: false }, { usDollarDenominated: false }, { ordinaryIncomeCause: 'currency' },
    { currentInclusionElectionApplies: true }, { currentInclusionElectionApplies: undefined }, { allInterestAsOidElectionApplies: true },
    { previouslyIncludedMarketDiscount: '0.01' }, { priorPartialPrincipalPayments: '0.01' }, { originalIssueDiscount: '1' },
    { acquisitionPremium: '1' }, { bondPremium: '1' }, { strippedDebt: true }, { contingentPaymentDebt: true }, { borrowedToAcquireOrCarry: true },
    { installmentObligation: true }, { transferredBasis: true }, { reorganizationDebt: true },
    { issueDate: '2024-01-15' }, { issueDate: '1984-07-18' }, { maturityDate: '2020-12-31' },
    { maturityDate: '2021-01-01' }, { issueDate: '2023-02-29' }, { maturityDate: '2025-05-31' },
    { unsupportedElection: true },
  ]) {
    const input = source(); Object.assign(input.form1099DA[0].transactions[0].marketDiscountSource!, patch);
    expect(() => calculateForm1099DASources(input), JSON.stringify(patch)).toThrow();
  }
});

it('rejects stale original amounts, identity, boxes and interest reconciliation', () => {
  for (const patch of [
    { proceeds: '1200.04' }, { costBasis: '1000.02' }, { marketDiscount: '50.006' }, { ordinaryIncome: false },
    { securityIdentifier: 'OTHER' }, { dateAcquired: '2024-01-16' }, { dateSold: '2025-06-02' },
    { transactionType: 'exchange' }, { onlyCashProceeds: false }, { assetOrigin: 'gift' },
    { reportedCostBasis: '1000' }, { reportedDateAcquired: null }, { basisReportedToIRS: false },
    { basisSource: 'taxpayer_records' }, { sellingExpenses: '0.01' }, { adjustments: '0.01' }, { washSale: true },
    { noncoveredSecurity: false },
    { noncoveredSecurity: undefined }, { customerProvidedAcquisitionInformation: undefined }, { customerProvidedAcquisitionInformation: true },
  ]) {
    const input = source(); Object.assign(input.form1099DA[0].transactions[0], patch);
    expect(() => calculateForm1099DASources(input), JSON.stringify(patch)).toThrow();
  }
  for (const patch of [{ sameDiscountIncludedElsewhere: true }, { sourceReference: '' },
    { allOriginalInterestStatementsIncludedConfirmed: false }, { originalForm1099Int: [{}] }, { originalForm1099OID: [{}] }]) {
    const input = source(); Object.assign(input.form1099DA[0].transactions[0].marketDiscountSource!.interestReportingReconciliation, patch);
    expect(() => calculateScheduleB(input)).toThrow();
  }
  const changed = source(); changed.form1099Int.push({ payer: 'Actual separate interest', interestIncome: '7', earlyWithdrawalPenalty: '0', usSavingsBondInterest: '0', federalWithheld: '0', foreignTaxPaid: '0', taxExemptInterest: '0', paDirectObligationInterest: '0', stateWithheld: '0' });
  expect(() => calculateScheduleB(changed)).toThrow(/reconciliation/i);
  changed.form1099DA[0].transactions[0].marketDiscountSource!.interestReportingReconciliation.originalForm1099Int = structuredClone(changed.form1099Int);
  expect(calculateScheduleB(changed).taxableInterest.toFixed()).toBe('57.005');
  const replay = TaxYearInputSchema.parse(JSON.parse(JSON.stringify(changed)));
  expect(calculateFederalTax(replay).totalInterest.toFixed()).toBe('57.005');
});

it('preserves actual2026 source boxes without inventing a covered acquisition or annual filing qualification', () => {
  const input = source(); input.taxpayer.taxYear = 2026; const form = input.form1099DA[0], row = form.transactions[0];
  form.taxYear = 2026; row.dateSold = '2026-06-01'; row.marketDiscountSource!.sourceTaxYear = 2026; row.marketDiscountSource!.originalDisposition.dateSold = row.dateSold;
  expect(calculateScheduleB(input).taxableInterest.toFixed()).toBe('50.005');
  expect(calculateForm8949(input).totalLongTermGainLoss.toFixed()).toBe('150.015');
  row.dateAcquired = row.reportedDateAcquired = row.marketDiscountSource!.originalDisposition.dateAcquired = '2026-01-15'; row.holdingPeriod = 'short'; row.noncoveredSecurity = false;
  expect(calculateForm8949(input).totalShortTermGainLoss.toFixed()).toBe('150.015');
});

it('rejects duplicate original debt confirmations but permits genuinely distinct same-date full sales', () => {
  const input = source('1100', '1000', '0.10'), second = source('1100', '1000', '0.20').form1099DA[0];
  second.sourceId = 'Distinct synthetic statement'; second.transactions[0].sourceId = 'Distinct transaction';
  second.transactions[0].marketDiscountSource!.statementSourceId = second.sourceId;
  second.transactions[0].marketDiscountSource!.transactionSourceId = second.transactions[0].sourceId;
  input.form1099DA.push(second);
  expect(() => calculateScheduleB(input)).toThrow(/duplicate/i);
  second.transactions[0].marketDiscountSource!.originalDispositionReference = 'Distinct original full sale confirmation B';
  expect(calculateScheduleB(input).taxableInterest.toFixed()).toBe('0.3');
  expect(calculateForm8949(input).totalLongTermGainLoss.toFixed()).toBe('199.7');
  input.form1099DA.reverse();
  expect(calculateScheduleB(input).taxableInterest.toFixed()).toBe('0.3');
  expect(calculateFederalTax(input).totalInterest.toFixed()).toBe('0.3');
});

it('carries actual corporate interest and capital once into Ohio federal AGI without a government exemption', () => {
  const input = source(), federal = calculateFederalTax(input), ohio = buildOhioResidentReturnInput(input, federal);
  const baseline = source(); baseline.form1099DA = []; const base = calculateFederalTax(baseline);
  expect(federal.agi.minus(base.agi).toFixed()).toBe('200.02');
  expect(ohio.federalAgi.eq(federal.agi)).toBe(true);
  expect(new Decimal(ohio.federalInterestExemptFromOhio ?? 0).toFixed()).toBe('0');
  expect(new Decimal(ohio.qualifyingBusinessIncome ?? 0).toFixed()).toBe('0');
  const capital = calculateDigitalAssetStateSources(input, 'OH').form1099B[0].transactions[0];
  expect(new Decimal(capital.proceeds).minus(capital.costBasis).plus(capital.adjustments ?? 0).toFixed()).toBe('150.015');
  // Actual2025 district methods remain unchanged: portfolio amounts affect the
  // traditional AGI base, not wages or self-employment in the earned base.
  const school = (agi: Decimal, earned: boolean) => calculateOhioSD100({ taxYear: 2025, ohioAgi: agi,
    businessIncomeDeduction: '0', exemptionAmount: '0', districts: earned
      ? [{ districtNumber: '0404', wages: '85000', netSelfEmployment: '0' }]
      : [{ districtNumber: '2501' }] });
  expect(school(federal.agi, false).line3_magi.minus(school(base.agi, false).line3_magi).toFixed()).toBe('200.02');
  expect(school(federal.agi, true).line7_earnedIncomeTax.eq(school(base.agi, true).line7_earnedIncomeTax)).toBe(true);
});

it('retains the complete strict source proof through canonical replay and rejects hidden new adjustments', () => {
  const input = source(), replay = TaxYearInputSchema.parse(JSON.parse(JSON.stringify(input)));
  expect(replay.form1099DA[0].transactions[0].marketDiscountSource).toEqual(input.form1099DA[0].transactions[0].marketDiscountSource);
  for (const patch of [{ unsupportedElection: true }, { partialPrincipalTreatment: 'infer' }]) {
    const changed = source(); Object.assign(changed.form1099DA[0].transactions[0].marketDiscountSource!, patch);
    expect(TaxYearInputSchema.safeParse(changed).success).toBe(false);
  }
  const stale = source(); stale.form1099DA[0].transactions[0].marketDiscountSource!.originalDisposition.proceeds = '1200.04';
  expect(() => calculateFederalTax(TaxYearInputSchema.parse(JSON.parse(JSON.stringify(stale))))).toThrow(/changed/i);
});

it('retains the precise Pennsylvania positive market-discount classification guard', () => {
  const input = source(); const row = input.form1099DA[0].transactions[0];
  Object.assign(row, { paCostBasis: row.costBasis, paBasisSourceReference: 'Synthetic PA basis ledger', paBasisFactsConfirmed: true, paTransactionForProfitConfirmed: true });
  expect(() => calculateDigitalAssetStateSources(input, 'PA')).toThrow(/Pennsylvania.*secondary-market discount classification/i);
});
