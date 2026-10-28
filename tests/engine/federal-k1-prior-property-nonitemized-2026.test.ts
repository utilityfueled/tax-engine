import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal';
import { calculateK1CharitableReturnSources } from '@/engine/forms/k1-charitable-return-sources';
import { priorPropertyNonitemizedInput, priorPropertySources } from '../fixtures/k1-prior-property-nonitemized';
import { releaseFixtureSource as required } from '../fixtures/charitable-k1-basis-release-nol';
import { charitableNolOriginsInput } from '../fixtures/charitable-nol-origins';
import { readCurrentCharitableSourceForNol, validateCharitableNolContributionLimit } from '@/utils/charitable-nol-source';

it('derives below equal and above capacity prior basis releases without carrying every undeducted dollar', () => {
  // Spec: K1 Prior Property Nonitemized 2026, basis-capacity.
  for (const sCorp of [false, true]) for (const [capacity, suspended, carry] of [
    ['20000', '40000', '0'], ['30000', '30000', '0'], ['40000', '20000', '10000'],
  ]) {
    const input = priorPropertyNonitemizedInput({ capacity, sCorp }), before = JSON.stringify(input);
    const source = required(calculateK1CharitableReturnSources(input));
    const row = required(source.statements[0].basis.charitableSources).records[0];
    expect(row.originTaxYear).toBe(2018); expect(row.availableAfterBasis.toFixed()).toBe(capacity);
    expect(row.basisSuspended.toFixed()).toBe(suspended); expect(row.appreciationExempt.toFixed()).toBe('0');
    if(carry!=='0'){expect(()=>calculateFederalTax(input)).toThrow(/prior.*(carry|floor|contribution.year)/i);expect(JSON.stringify(input)).toBe(before);continue;}
    const result=calculateFederalTax(input);
    expect(result.agi.toFixed()).toBe('100000'); expect(result.deductionUsed).toBe('standard');
    expect(required(result.scheduleA).charitableTotal.toFixed()).toBe('0');
    expect(result.nonitemizerCharitableDeduction?.toFixed() ?? '0').toBe('0');
    expect(result.carryforwards.charitableContributions.toFixed()).toBe(carry);
    expect(result.carryforwards.charitableContributionsByYear.map(v => [v.taxYear, v.category, v.amount.toFixed()]))
      .toEqual(carry === '0' ? [] : [[2026, 'capital_gain_30', '10000']]);
    expect(JSON.stringify(input)).toBe(before);
  }
});

it('preserves prior risk sources and percentage capacity independently of current basis', () => {
  // Spec: K1 Prior Property Nonitemized 2026, risk-capacity.
  for (const sCorp of [false, true]) for (const [capacity, suspended, carry] of [
    ['20000', '40000', '0'], ['30000', '30000', '0'], ['40000', '20000', '10000'],
  ]) {
    const input = priorPropertyNonitemizedInput({ method: 'risk', capacity, sCorp, election: 'nonitemized' });
    const before = JSON.stringify(input), source = required(calculateK1CharitableReturnSources(input));
    const row = required(source.statements[0].atRiskAllocation).prior[0];
    expect(row.taxYear).toBe(2024); expect(row.gift?.basisOriginTaxYear).toBe(2024);
    expect(row.allowed.toFixed()).toBe(capacity); expect(row.suspended.toFixed()).toBe(suspended);
    expect(source.statements[0].basis.charitableSources?.records).toEqual([]);
    if(carry!=='0'){expect(()=>calculateFederalTax(input)).toThrow(/prior.*(carry|floor|contribution.year)/i);expect(JSON.stringify(input)).toBe(before);continue;}
    const result=calculateFederalTax(input);
    expect(result.deductionUsed).toBe('nonitemized'); expect(result.agi.toFixed()).toBe('100000');
    expect(required(result.scheduleA).charitableTotal.toFixed()).toBe('0');
    expect(result.nonitemizerCharitableDeduction?.toFixed() ?? '0').toBe('0');
    expect(result.carryforwards.charitableContributions.toFixed()).toBe(carry);
    expect(result.carryforwards.charitableContributionsByYear.map(v => [v.taxYear, v.amount.toFixed()]))
      .toEqual(carry === '0' ? [] : [[2026, '10000']]);
    expect(JSON.stringify(input)).toBe(before);
  }
});

it('conserves simultaneous prior basis and risk sources without repeated appreciation', () => {
  // Spec: K1 Prior Property Nonitemized 2026, combined-limitations.
  const input = priorPropertyNonitemizedInput({ method: 'both' });
  const source = required(calculateK1CharitableReturnSources(input)), statement = source.statements[0];
  const risk = required(statement.atRiskAllocation);
  expect(required(statement.basis.charitableSources).records[0].basisSuspended.toFixed()).toBe('20000');
  expect(risk.charitable[0].allowed.toFixed()).toBe('40000'); expect(risk.charitable[0].suspended.toFixed()).toBe('0');
  expect(risk.prior[0].allowed.toFixed()).toBe('50000'); expect(risk.prior[0].suspended.toFixed()).toBe('10000');
  expect(source.amounts.capitalGainPublic.toFixed()).toBe('90000');
  expect(()=>calculateFederalTax(input)).toThrow(/prior.*(carry|floor|contribution.year)/i);
  const noResidual=structuredClone(input);noResidual.w2s[0].wages='300000';noResidual.w2s[0].federalWithheld='90000';
  expect(calculateFederalTax(noResidual).carryforwards.charitableContributionsByYear).toEqual([]);
  expect(calculateK1CharitableReturnSources(noResidual)).toEqual(source);
});

it('retains the original other recipient twenty percent property capacity', () => {
  // Spec: K1 Prior Property Nonitemized 2026, other-property-capacity.
  for (const method of ['basis', 'risk'] as const) for (const [capacity, carry] of [
    ['10000', '0'], ['20000', '0'], ['30000', '10000'],
  ]) {
    const input = priorPropertyNonitemizedInput({ method, capacity }), source = priorPropertySources(input);
    if (method === 'basis') {
      required(required(source.basis).priorBasisSuspensions)[0].category = 'capital_gain_20';
      Object.assign(required(source.receipts)[0], { originalCode: 'F', recipientCategory: 'private-nonoperating', qualifiedAppreciatedStock: true });
    } else {
      const gift = required(required(required(required(source.atRisk).priorLossHistory).characterSources).records)[0].gift;
      required(gift).category = 'capital_gain_20';
      Object.assign(required(required(gift).receipt), { originalCode: 'F', recipientCategory: 'private-nonoperating', qualifiedAppreciatedStock: true });
    }
    expect(required(calculateK1CharitableReturnSources(input)).amounts.capitalGainPrivate.toFixed()).toBe(capacity);
    if(carry!=='0'){expect(()=>calculateFederalTax(input)).toThrow(/prior.*(carry|floor|contribution.year)/i);continue;}
    const result = calculateFederalTax(input);
    expect(required(result.scheduleA).charitableTotal.toFixed()).toBe('0');
    expect(result.carryforwards.charitableContributions.toFixed()).toBe(carry);
    expect(result.carryforwards.charitableContributionsByYear.map(v => [v.taxYear, v.category, v.amount.toFixed()]))
      .toEqual(carry === '0' ? [] : [[2026, 'capital_gain_20', '10000']]);
  }
});

it('keeps actual current cash separate from prior property release', () => {
  // Spec: K1 Prior Property Nonitemized 2026, separate-current-cash.
  const input = priorPropertyNonitemizedInput({capacity:'20000'});
  input.donations = [{ organization: 'Fictional current cash recipient', type: 'cash', amount: '1000',
    dateOfDonation: '2026-09-01', qualifiedOrganization: true, isPrivateFoundation: false,
    recipientCategory: 'fifty-percent', supportingOrganization: false, donorAdvisedFund: false }];
  const result = calculateFederalTax(input);
  expect(required(result.nonitemizerCharitableDeduction).toFixed()).toBe('1000');
  expect(required(result.scheduleA).charitableTotal.toFixed()).toBe('0');
  expect(result.carryforwards.charitableContributions.toFixed()).toBe('0');
  const residual=priorPropertyNonitemizedInput();residual.donations=structuredClone(input.donations);
  expect(()=>calculateFederalTax(residual)).toThrow(/prior.*(carry|floor|contribution.year)/i);
});

it('composes actual property release with the established nonitemized NOL method', () => {
  // Spec: K1 Prior Property Nonitemized 2026, existing-nol-composition.
  for (const method of ['basis', 'risk'] as const) for (const [capacity, carry] of [
    ['5000', '0'], ['9864', '0'], ['20000', '10136'],
  ]) {
    const input = priorPropertyNonitemizedInput({ method, capacity });
    input.netOperatingLoss = charitableNolOriginsInput({ year: 2026 }).netOperatingLoss;
    const before = JSON.stringify(input);
    if(carry!=='0'){expect(()=>calculateFederalTax(input)).toThrow(/prior.*(carry|floor|contribution.year)/i);expect(JSON.stringify(input)).toBe(before);continue;}
    const result = calculateFederalTax(input);
    const zeroRelease=priorPropertyNonitemizedInput({method,capacity:'0'});zeroRelease.netOperatingLoss=structuredClone(input.netOperatingLoss);
    const baseline=calculateFederalTax(zeroRelease);
    expect([result.nolDeduction,result.agi,result.carryforwards.nolCarryforward].map(x=>x.toFixed()))
      .toEqual([baseline.nolDeduction,baseline.agi,baseline.carryforwards.nolCarryforward].map(x=>x.toFixed()));
    expect(result.nolDeduction.toFixed()).toBe('67120'); expect(result.agi.toFixed()).toBe('32880');
    expect(result.nonitemizerCharitableDeduction?.toFixed() ?? '0').toBe('0');
    expect(required(result.scheduleA).charitableTotal.toFixed()).toBe('0');
    expect(result.carryforwards.charitableContributions.toFixed()).toBe(carry);
    expect(result.netOperatingLoss?.determinedCharitableCarryover?.reduction.toFixed()).toBe('0');
    expect(JSON.stringify(input)).toBe(before);
  }
});

it('binds the actual deduction choice in original NOL source proof', () => {
  // Spec: K1 Prior Property Nonitemized 2026, choice-proof.
  const standard = priorPropertyNonitemizedInput({ capacity: '20000' });
  standard.netOperatingLoss = charitableNolOriginsInput({ year: 2026 }).netOperatingLoss;
  const nonitemized = structuredClone(standard); nonitemized.deductionElection = 'nonitemized';
  const first = readCurrentCharitableSourceForNol(standard), second = readCurrentCharitableSourceForNol(nonitemized);
  expect(first.amount.toFixed()).toBe('20000'); expect(second.amount.eq(first.amount)).toBe(true);
  expect(first.sourceDigest).not.toBe(second.sourceDigest);
  expect(() => validateCharitableNolContributionLimit(nonitemized, { ...first, ledger: 'regular' }))
    .toThrow(/original source/);
});

it('requires explicit nonitemization and original property history', () => {
  // Spec: K1 Prior Property Nonitemized 2026, explicit-choice.
  for (const method of ['basis', 'risk'] as const) {
    for (const election of [undefined, 'automatic', 'itemized'] as const) {
      const input = priorPropertyNonitemizedInput({ method }); input.deductionElection = election;
      expect(() => calculateFederalTax(input)).toThrow(/prior.*(floor|contribution-year)/i);
    }
    expect(() => calculateFederalTax(priorPropertyNonitemizedInput({ method, cash: true }))).toThrow(/prior.*(floor|contribution-year)/i);
  }
  const noStandard = priorPropertyNonitemizedInput({ election: 'nonitemized', capacity:'20000' });
  noStandard.taxpayer.filingStatus = 'married_filing_separately';
  required(noStandard.standardDeductionFacts).spouseItemizes = true;
  expect(calculateFederalTax(noStandard).deductionUsed).toBe('nonitemized');
  const missing = priorPropertyNonitemizedInput({ method: 'risk' });
  required(priorPropertySources(missing).atRisk).priorLossHistory = undefined;
  expect(() => calculateFederalTax(missing)).toThrow(/history/);
  const absentPercentageHistory = priorPropertyNonitemizedInput();
  delete absentPercentageHistory.charitableCarryoverSources;
  expect(() => calculateFederalTax(absentPercentageHistory)).toThrow(/section170.*history/);
});
