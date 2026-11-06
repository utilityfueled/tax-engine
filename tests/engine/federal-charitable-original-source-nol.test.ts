// Spec: spec/federal/charitable-original-source-nol.yaml.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateK1CharitableReturnSources } from '@/engine/forms/k1-charitable-return-sources.js';
import { cryptoCharitableNolInput, k1CharitableNolInput, originalNolFixtureSource as requireSource } from '../fixtures/charitable-original-source-nol.js';
import { charitableStatement } from '../fixtures/k1-charitable-return.js';
import { k1CharitableReturnFixture } from '../fixtures/k1-charitable-return.js';

it('uses original crypto category values without creating a disposition or changing receipts', () => {
  for (const [privateFoundation, category, claim, agi, deduction, tentative, nol, comparison, carry] of [
    [false, 'capital_gain_30', '56000', '44000', '13200', '46800', '44000', '30560', '33360'],
    [true, 'capital_gain_20', '64000', '36000', '7200', '12800', '36000', '25760', '2560'],
  ] as const) {
    const input = cryptoCharitableNolInput(2025, false, privateFoundation), before = JSON.stringify(input);
    const result = calculateFederalTax(input), adjusted = result.netOperatingLoss?.charitableCarryover;
    expect([result.nolDeduction, result.agi, result.deductionAmount, adjusted?.tentativeCarryforward,
      result.carryforwards.nolCarryforward, adjusted?.counterfactualNolCarryforward, result.carryforwards.charitableContributions]
      .map(value => value?.toFixed())).toEqual([claim, agi, deduction, tentative, nol, comparison, carry]);
    expect(result.scheduleD.netCapitalGainLoss.toFixed()).toBe('0');
    expect(result.carryforwards.charitableContributionsByYear.map(row => [row.category, row.medium, row.amount.toFixed()]))
      .toEqual([[category, 'noncash', carry]]);
    expect(JSON.stringify(input)).toBe(before);
  }
});

it('preserves original partnership and S corporation basis before the charitable NOL comparison', () => {
  for (const sCorp of [false, true]) {
    const input = k1CharitableNolInput(2025, false, sCorp), before = JSON.stringify(input);
    const source = calculateK1CharitableReturnSources(input);
    expect(source?.amounts.capitalGainPublic.toFixed()).toBe('60000');
    const result = calculateFederalTax(input);
    expect([result.nolDeduction, result.agi, result.deductionAmount, result.carryforwards.charitableContributions,
      result.carryforwards.nolCarryforward].map(value => value.toFixed())).toEqual(['56000', '44000', '13200', '33360', '44000']);
    expect(calculateK1CharitableReturnSources(input)).toEqual(source);
    expect(source?.statements[0].basis.charitableSources?.records[0].basisSuspended.toFixed()).toBe('20000');
    expect(JSON.stringify(input)).toBe(before);
  }
  const fiscal = k1CharitableNolInput(); const statement = charitableStatement(fiscal);
  Object.assign(requireSource(statement.basis), { statementYearStart: '2024-07-01', statementYearEnd: '2025-06-30' });
  requireSource(requireSource(statement.basis).currentContributions)[0].contributionDate = '2024-12-01';
  requireSource(statement.receipts)[0].contributionDate = '2024-12-01';
  expect(calculateFederalTax(fiscal).carryforwards.charitableContributions.toFixed()).toBe('33360');
  const cash = k1CharitableNolInput(), gift = k1CharitableReturnFixture(2025, true), cashSource = charitableStatement(gift);
  Object.assign(gift.scheduleK1[0], { beginningBasis: '60000', charitableCash: '60000' });
  requireSource(gift.scheduleK1[0].form6198).priorYearAmountAtRisk = '100000'; requireSource(cashSource.atRisk).priorYearAmountAtRisk = '100000';
  Object.assign(requireSource(requireSource(cashSource.basis).currentContributions)[0], { contributionShare: '60000', adjustedBasisShare: '60000' });
  cash.scheduleK1 = gift.scheduleK1; cash.k1CharitableSources = gift.k1CharitableSources;
  const cashResult = calculateFederalTax(cash);
  expect([cashResult.nolDeduction, cashResult.carryforwards.charitableContributions].map(value => value.toFixed())).toEqual(['32000', '3840']);
  gift.scheduleK1[0].charitableCash = '59000';
  Object.assign(requireSource(requireSource(cashSource.basis).currentContributions)[0], { contributionShare: '59000', adjustedBasisShare: '59000' });
  cash.donations = [{ type: 'cash', organization: 'Fictional same-category current recipient', amount: '1000',
    dateOfDonation: '2025-05-01', qualifiedOrganization: true, recipientCategory: 'fifty-percent' }];
  expect(calculateFederalTax(cash).carryforwards.charitableContributions.toFixed()).toBe('3840');
});

it('keeps original source AMT carry and current claim independent of regular carry', () => {
  for (const make of [cryptoCharitableNolInput, k1CharitableNolInput]) {
    const input = make(2025, true), before = JSON.stringify(input); const result = calculateFederalTax(input);
    expect([result.agi, result.deductionAmount, result.carryforwards.charitableContributions,
      result.carryforwards.amtCharitableContributions, result.netOperatingLoss?.alternativeTax.deduction,
      result.netOperatingLoss?.alternativeCharitableCounterfactual?.calculation.deduction].map(value => value?.toFixed()))
      .toEqual(['97000', '29100', '30900', '30090', '61110', '61110']);
    expect(JSON.stringify(input)).toBe(before);
    expect(calculateFederalTax(make()).carryforwards.amtCharitableContributions?.toFixed()).toBe('46800');
  }
});

it('reapplies the isolated current year floor to qualified original values', () => {
  for (const make of [cryptoCharitableNolInput, k1CharitableNolInput]) {
    const input = make(2026), original = JSON.stringify(input), result = calculateFederalTax(input);
    expect([result.nolDeduction, result.agi, result.deductionAmount, result.netOperatingLoss?.charitableCarryover?.tentativeCarryforward,
      result.carryforwards.charitableContributions].map(value => value?.toFixed())).toEqual(['56400', '43600', '12862', '47138', '33428']);
    expect(JSON.stringify(input)).toBe(original);
  }
});

it('validates original facts before a small or ineligible gift could bypass the replay', () => {
  const small = cryptoCharitableNolInput(); requireSource(small.cryptoIncome).donations[0].fairMarketValueAtDonation = '100';
  requireSource(small.cryptoIncome).donations[0].costBasis = '50';
  for (const change of [
    (input: typeof small) => { requireSource(input.cryptoIncome).donations[0].sourceFactsConfirmed = undefined; },
    (input: typeof small) => { requireSource(requireSource(input.netOperatingLoss).alternativeTax).charitableCarryoverHistory = undefined; },
    (input: typeof small) => { requireSource(input.cryptoIncome).donations[0].charityName = ''; },
    (input: typeof small) => { requireSource(input.cryptoIncome).donations[0].dateDonated = '2024-06-01'; },
  ]) {
    const missing = structuredClone(small); change(missing);
    expect(() => calculateFederalTax(missing)).toThrow(/source|histor|recipient|year/i);
  }
  const missingK1 = k1CharitableNolInput(); missingK1.k1CharitableSources = undefined;
  expect(() => calculateFederalTax(missingK1)).toThrow(/original.*K1|K1.*source/i);
  const ineligible = cryptoCharitableNolInput(); requireSource(ineligible.cryptoIncome).donations[0].isQualifiedOrganization = false;
  const before = JSON.stringify(ineligible), zero = calculateFederalTax(ineligible);
  expect(zero.carryforwards.charitableContributions.toFixed()).toBe('0');
  expect(JSON.stringify(ineligible)).toBe(before);
  const mixed = cryptoCharitableNolInput(); mixed.donations = [{ type: 'cash', organization: 'Fictional other current receipt',
    amount: '1', dateOfDonation: '2025-05-01', qualifiedOrganization: true, recipientCategory: 'fifty-percent' }];
  expect(() => calculateFederalTax(mixed)).toThrow(/mixed.*categor/i);
  // Actual2025 released basis now has its separate sourced NOL handoff; the
  // positive2026 release/floor-year boundary remains closed.
  const prior = k1CharitableNolInput(2026), source = charitableStatement(prior), k = prior.scheduleK1[0];
  k.charitableCapitalGain30 = '0'; requireSource(k.priorSuspendedLosses).charitable = '20';
  requireSource(source.basis).currentContributions = [];
  requireSource(source.basis).priorBasisSuspensions = [{ sourceId: 'prior-property', originTaxYear: 2024, category: 'capital_gain_30', contributionShare: '150', adjustedBasisShare: '50',
    appreciationPreviouslyTakenIntoAccount: '100', sourceReference: 'Fictional original basis history',
    basisUseHistory: [{ taxYear: 2024, basisAllowed: '30' }, { taxYear: 2025, basisAllowed: '0' }] }];
  source.receipts = [{ ...requireSource(source.receipts)[0], basisSourceId: 'prior-property', contributionDate: '2024-06-01', acquisitionDate: '2022-01-01', fairMarketValueShare: '150' }];
  expect(() => calculateK1CharitableReturnSources(prior)).toThrow(/prior-basis release in2026.*timing.*floor/i);
  expect(() => calculateFederalTax(prior)).toThrow(/prior-basis release in2026.*timing.*floor/i);
});
