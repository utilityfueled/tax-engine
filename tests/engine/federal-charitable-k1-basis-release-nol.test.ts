// Spec: spec/federal/charitable-k1-basis-release-nol.yaml. Derived literals, not generated oracles.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { calculateK1CharitableReturnSources } from '@/engine/forms/k1-charitable-return-sources';
import { calculateForm172CharitableSources } from '@/engine/forms/form-172-charitable-sources';
import { readCurrentCharitableSourceForNol } from '@/utils/charitable-nol-source';
import { d } from '@/utils/decimal';
import { charitableStatement } from '../fixtures/k1-charitable-return';
import { releasedCharitableNolInput, releasedMixedCharitableNolInput, releasedCurrentOriginInput, releaseFixtureSource as requireSource } from '../fixtures/charitable-k1-basis-release-nol';

it('uses the actual2025 release without repeating old appreciation or basis carry', () => {
  for (const sCorp of [false, true]) {
    const input = releasedCharitableNolInput({ sCorp }), original = JSON.stringify(input);
    const source = calculateK1CharitableReturnSources(input), result = calculateFederalTax(input);
    expect(readCurrentCharitableSourceForNol(input).amount.toFixed()).toBe('60000');
    expect([result.nolDeduction, result.agi, result.scheduleA?.charitableTotal,
      result.carryforwards.nolCarryforward, result.netOperatingLoss?.charitableCarryover?.counterfactualNolCarryforward,
      result.carryforwards.charitableContributions, result.carryforwards.amtCharitableContributions].map(v => v?.toFixed()))
      .toEqual(['56000','44000','13200','44000','30560','33360','46800']);
    expect(result.carryforwards.charitableContributionsByYear.map(row => [row.taxYear,row.category,row.amount.toFixed()]))
      .toEqual([[2025,'capital_gain_30','33360']]);
    const historical = source?.statements[0].basis.charitableSources?.records[0];
    expect([historical?.originTaxYear,historical?.current,historical?.basisPreviouslyAllowed.toFixed(),
      historical?.basisAllowed.toFixed(),historical?.appreciationExempt.toFixed(),historical?.basisSuspended.toFixed()])
      .toEqual([2018,false,'20000','60000','0','0']);
    expect(calculateK1CharitableReturnSources(input)).toEqual(source);
    expect(JSON.stringify(input)).toBe(original);
  }
});

it('preserves current and prior basis allocation before the unique excess comparison', () => {
  const input = releasedMixedCharitableNolInput(), before = JSON.stringify(input), source = calculateK1CharitableReturnSources(input);
  const result = calculateFederalTax(input), adjustment = result.netOperatingLoss?.determinedCharitableCarryover;
  expect([source?.amounts.cashPublic,source?.amounts.capitalGainPublic,source?.statements[0].basis.charitableSources?.basisSuspended]
    .map(v => v?.toFixed())).toEqual(['10000','30000','40000']);
  expect([result.nolDeduction,result.agi,result.scheduleA?.charitableTotal,result.carryforwards.nolCarryforward,
    result.netOperatingLoss?.charitableCounterfactual?.calculation.carryforward,adjustment?.reduction,
    result.carryforwards.charitableContributions].map(v => v?.toFixed()))
    .toEqual(['48000','52000','25600','52000','40480','11520','2880']);
  expect(result.carryforwards.charitableContributionsByYear.map(row => [row.taxYear,row.category,row.amount.toFixed()]))
    .toEqual([[2025,'capital_gain_30','2880']]);
  expect(calculateK1CharitableReturnSources(input)).toEqual(source); expect(JSON.stringify(input)).toBe(before);
});

it('keeps released cents and alternative NOL treatment independent', () => {
  const alternative = calculateFederalTax(releasedCharitableNolInput({ alternativeOnly: true }));
  expect([alternative.agi,alternative.scheduleA?.charitableTotal,alternative.carryforwards.charitableContributions,
    alternative.carryforwards.amtCharitableContributions,alternative.netOperatingLoss?.alternativeTax.deduction,
    alternative.netOperatingLoss?.alternativeCharitableCounterfactual?.calculation.deduction].map(v => v?.toFixed()))
    .toEqual(['97000','29100','30900','30090','61110','61110']);
  for (const [amount, tentative, regularCarry, alternativeCarry] of [
    ['60000.49','46800.49','33360','46800'], ['60000.50','46800.5','33361','46801'],
  ]) {
    const input = releasedCharitableNolInput({ amount }), before = JSON.stringify(input), result = calculateFederalTax(input);
    expect(calculateK1CharitableReturnSources(input)?.amounts.capitalGainPublic.toFixed()).toBe(d(amount).toFixed());
    expect(result.netOperatingLoss?.charitableCarryover?.sourceContributions.toFixed()).toBe(d(amount).toFixed());
    expect(result.scheduleA?.charitableCarryforwardByYear[0].amount.toFixed()).toBe(tentative);
    expect([result.scheduleA?.charitableTotal,result.carryforwards.charitableContributions,
      result.carryforwards.amtCharitableContributions].map(v => v?.toFixed())).toEqual(['13200',regularCarry,alternativeCarry]);
    expect(JSON.stringify(input)).toBe(before);
  }
});

it('composes released charity with complete old histories and current Form172 once', () => {
  for (const oldLoss of [false,true]) {
    const input = releasedCurrentOriginInput(oldLoss), before = JSON.stringify(input);
    expect(calculateForm172CharitableSources(input)?.sourceKind).toBe('complete_histories');
    const result = calculateFederalTax(input);
    expect([result.scheduleA?.charitableTotal,result.form172?.regular.netOperatingLoss,
      result.netOperatingLoss?.carryforward,result.carryforwards.nolCarryforward,
      result.netOperatingLoss?.alternativeTax.deduction,result.carryforwards.alternativeTaxNolCarryforward,
      result.form6251?.amti,result.form172?.alternativeTax.netOperatingLoss,result.carryforwards.charitableContributions,
      result.carryforwards.amtCharitableContributions].map(v => v?.toFixed()))
      .toEqual(['4000','14000',oldLoss?'100000':'0',oldLoss?'114000':'14000',oldLoss?'7650':'0',oldLoss?'92350':'0',
        oldLoss?'850':'8500','0','2000','0']);
    expect(result.scheduleE?.partnerships[0].basisResult?.charitableSources?.records[0].originTaxYear).toBe(2018);
    expect(JSON.stringify(input)).toBe(before);
  }
});

it('rejects unknown release evidence and retains the2026 timing boundary', () => {
  for (const change of [
    (input: ReturnType<typeof releasedCharitableNolInput>) => { requireSource(requireSource(requireSource(charitableStatement(input).basis).priorBasisSuspensions)[0].basisUseHistory).pop(); },
    (input: ReturnType<typeof releasedCharitableNolInput>) => { requireSource(requireSource(charitableStatement(input).basis).priorBasisSuspensions)[0].appreciationPreviouslyTakenIntoAccount = '99999'; },
    (input: ReturnType<typeof releasedCharitableNolInput>) => { requireSource(charitableStatement(input).receipts)[0].contributionDate = '2019-06-01'; },
    (input: ReturnType<typeof releasedCharitableNolInput>) => { requireSource(requireSource(input.netOperatingLoss).alternativeTax).charitableCarryoverHistory = undefined; },
  ]) {
    const input = releasedCharitableNolInput(); change(input); const before = JSON.stringify(input);
    expect(() => calculateFederalTax(input)).toThrow(/histor|basis|source|year|appreciation/i);
    expect(JSON.stringify(input)).toBe(before);
  }
  const later = releasedCharitableNolInput(), statement = charitableStatement(later);
  later.taxpayer.taxYear = 2026; later.scheduleK1[0].taxYear = 2026; requireSource(later.k1CharitableSources).sourceTaxYear = 2026;
  Object.assign(requireSource(statement.basis),{sourceTaxYear:2026,statementYearStart:'2026-01-01',statementYearEnd:'2026-12-31'});
  requireSource(requireSource(requireSource(statement.basis).priorBasisSuspensions)[0].basisUseHistory).push({ taxYear:2025,basisAllowed:'0' });
  requireSource(statement.atRisk).sourceTaxYear = 2026; requireSource(requireSource(statement.atRisk).priorLossHistory).sourceTaxYear = 2025;
  expect(() => calculateK1CharitableReturnSources(later)).toThrow(/prior-basis release in2026.*timing.*floor/i);
});
