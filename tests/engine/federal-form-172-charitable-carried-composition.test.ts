// Spec: form-172-charitable-carried-composition.yaml. Independently derived literals.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { carriedCurrentCharitableHistoriesInput, carriedCurrentCharitableCodInput } from '../fixtures/form-172-charitable-carried-composition';

it('keeps unused old regular carry separate from the new current loss', () => {
  const input = carriedCurrentCharitableHistoriesInput({ alternativeCarry: false }), before = JSON.stringify(input);
  const result = calculateFederalTax(input);
  expect([result.netOperatingLoss?.deduction, result.netOperatingLoss?.absorbed, result.netOperatingLoss?.carryforward,
    result.form172?.regular.netOperatingLoss, result.carryforwards.nolCarryforward, result.form172?.alternativeTax.netOperatingLoss,
    result.form6251?.amti, result.carryforwards.charitableContributions, result.carryforwards.amtCharitableContributions,
    result.netOperatingLoss?.determinedCharitableCarryover?.reduction, result.netOperatingLoss?.determinedAlternativeCharitableCarryover?.reduction]
    .map(value => value?.toFixed())).toEqual(['0', '0', '100000', '14000', '114000', '0', '8500', '2000', '0', '0', '0']);
  expect(result.carryforwards.charitableContributionsByYear.map(row => [row.taxYear, row.category, row.amount.toFixed()]))
    .toEqual([[2024, 'capital_gain_30', '2000']]);
  expect(JSON.stringify(input)).toBe(before);
});

it('preserves actual positive ATNOLD without creating another alternative loss', () => {
  const result = calculateFederalTax(carriedCurrentCharitableHistoriesInput());
  expect([result.netOperatingLoss?.alternativeTax.deduction, result.netOperatingLoss?.alternativeTax.absorbed,
    result.netOperatingLoss?.alternativeTax.carryforward, result.form6251?.amti, result.form172?.alternativeTax.netOperatingLoss,
    result.carryforwards.alternativeTaxNolCarryforward, result.form172?.regular.netOperatingLoss, result.carryforwards.nolCarryforward,
    result.carryforwards.charitableContributions, result.carryforwards.amtCharitableContributions].map(value => value?.toFixed()))
    .toEqual(['7650', '7650', '92350', '850', '0', '92350', '14000', '114000', '2000', '0']);
});

it('uses only the old succeeding carry in the unique charitable comparison', () => {
  const input = carriedCurrentCharitableHistoriesInput({ positiveBenefit: true });
  // Established carried-loss method independently computes the same old ledgers.
  const oldOnly = calculateFederalTax({ ...input, form172: undefined });
  expect([oldOnly.netOperatingLoss?.deduction, oldOnly.agi, oldOnly.scheduleA?.charitableTotal,
    oldOnly.netOperatingLoss?.carryforward, oldOnly.netOperatingLoss?.charitableCounterfactual?.calculation.carryforward,
    oldOnly.netOperatingLoss?.determinedCharitableCarryover?.reduction, oldOnly.carryforwards.charitableContributions,
    oldOnly.netOperatingLoss?.alternativeTax.deduction, oldOnly.netOperatingLoss?.alternativeTax.carryforward,
    oldOnly.form6251?.amti].map(value => value?.toFixed()))
    .toEqual(['39200', '60800', '19240', '60800', '51392', '9408', '22352', '84600', '15400', '9400']);
  const result = calculateFederalTax(input);
  expect(result.netOperatingLoss).toEqual(oldOnly.netOperatingLoss);
  expect([result.form172?.regular.netOperatingLoss, result.form172?.alternativeTax.netOperatingLoss,
    result.carryforwards.nolCarryforward, result.carryforwards.alternativeTaxNolCarryforward].map(value => value?.toFixed()))
    .toEqual(['0', '0', '60800', '15400']);
});

it('keeps actual standard selection and both old carries', () => {
  const input = carriedCurrentCharitableHistoriesInput(); input.deductionElection = 'standard';
  const result = calculateFederalTax(input);
  expect([result.deductionAmount, result.netOperatingLoss?.deduction, result.netOperatingLoss?.carryforward,
    result.form172?.regular.netOperatingLoss, result.carryforwards.nolCarryforward,
    result.netOperatingLoss?.alternativeTax.deduction, result.netOperatingLoss?.alternativeTax.carryforward,
    result.form6251?.amti, result.form172?.alternativeTax.netOperatingLoss,
    result.carryforwards.charitableContributions, result.carryforwards.amtCharitableContributions].map(value => value?.toFixed()))
    .toEqual(['15750', '0', '100000', '5750', '105750', '9000', '91000', '1000', '0', '2000', '0']);
  expect(result.form172?.charitableSources?.regularCurrentDeduction.toFixed()).toBe('0');
});

it('preserves original old loss expiry and separate current origin', () => {
  const input = carriedCurrentCharitableHistoriesInput({ alternativeCarry: false });
  const source = input.netOperatingLoss?.vintages?.[0];
  if (!source) throw new Error('Missing fictional original old loss');
  Object.assign(source, { lossTaxYear: 2005, carrybackTreatment: 'waived', carrybackSourceReference: 'Fictional filed original waiver' });
  const result = calculateFederalTax(input);
  expect([result.netOperatingLoss?.deduction, result.netOperatingLoss?.absorbed, result.netOperatingLoss?.expired,
    result.netOperatingLoss?.carryforward, result.form172?.regular.netOperatingLoss, result.carryforwards.nolCarryforward,
    result.carryforwards.charitableContributions, result.netOperatingLoss?.determinedCharitableCarryover?.reduction]
    .map(value => value?.toFixed())).toEqual(['100000', '0', '100000', '0', '10000', '10000', '6000', '0']);
  expect(result.form172?.regular.partI[23].toFixed()).toBe('100000');
});

it('retains actual history and unresolved allocation guards', () => {
  const unknown = carriedCurrentCharitableHistoriesInput();
  if (!unknown.netOperatingLoss?.alternativeTax) throw new Error('Missing fictional actual old source');
  unknown.netOperatingLoss.alternativeTax.vintages = undefined;
  expect(() => calculateFederalTax(unknown)).toThrow(/actual|histor|source|alternative|AMT/i);
  const revoked = carriedCurrentCharitableHistoriesInput();
  if (!revoked.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory) throw new Error('Missing fictional history');
  revoked.netOperatingLoss.alternativeTax.charitableCarryoverHistory.sourceFactsConfirmed = false;
  expect(() => calculateFederalTax(revoked)).toThrow(/histor|source|confirm/i);
  const wrongYear = carriedCurrentCharitableHistoriesInput();
  const original = wrongYear.netOperatingLoss?.vintages?.[0];
  if (!original) throw new Error('Missing fictional actual old loss');
  original.lossTaxYear = 2025;
  expect(() => calculateFederalTax(wrongYear)).toThrow(/year|original|vintage|source/i);
  const multiple = carriedCurrentCharitableHistoriesInput({ positiveBenefit: true });
  multiple.donations[0].amount = '60000'; multiple.donations[0].costBasis = '60000';
  expect(() => calculateFederalTax(multiple)).toThrow(/multiple|origin|attribution|allocation/i);
  const exhausted = carriedCurrentCharitableCodInput({ positiveBenefit: true });
  if (!exhausted.form982NolSources?.debts?.[0] || !exhausted.netOperatingLoss?.alternativeTax?.vintages?.[0]) throw new Error('Missing fictional original COD records');
  exhausted.form1099C[0].amountDischarged = '52000'; exhausted.form982NolSources.debts[0].amountDischarged = '52000';
  Object.assign(exhausted.netOperatingLoss.alternativeTax.vintages[0], { originalLoss: '1000000', openingCarryforward: '1000000' });
  expect(() => calculateFederalTax(exhausted)).toThrow(/COD.*charitable comparison.*exhaustion/i);
  expect(() => calculateFederalTax(carriedCurrentCharitableHistoriesInput({ year: 2026 }))).toThrow(/2026|qualified|enabled|support/i);
});

it('composes zero-benefit charitable histories with current-loss-first COD', () => {
  const input = carriedCurrentCharitableCodInput(), before = JSON.stringify(input), result = calculateFederalTax(input);
  expect([result.netOperatingLoss?.deduction, result.netOperatingLoss?.carryforward, result.form172?.regular.netOperatingLoss,
    result.netOperatingLoss?.alternativeTax.deduction, result.netOperatingLoss?.alternativeTax.carryforward,
    result.form172?.alternativeTax.netOperatingLoss, result.carryforwards.nolCarryforward,
    result.carryforwards.alternativeTaxNolCarryforward, result.carryforwards.charitableContributions,
    result.carryforwards.amtCharitableContributions].map(value => value?.toFixed()))
    .toEqual(['0','100000','14000','7650','92350','0','109000','87350','2000','0']);
  expect(result.codNolReduction?.regular?.vintages.map(row => [row.lossTaxYear,row.beforeReduction.toFixed(),row.attributeReduction.toFixed(),row.remainingCarryforward.toFixed()]))
    .toEqual([[2025,'14000','5000','9000'],[2021,'100000','0','100000']]);
  expect(result.codNolReduction?.alternativeTax?.vintages.map(row => [row.lossTaxYear,row.beforeReduction.toFixed(),row.attributeReduction.toFixed(),row.remainingCarryforward.toFixed()]))
    .toEqual([[2025,'0','0','0'],[2021,'92350','5000','87350']]);
  expect(result.netOperatingLoss?.determinedCharitableCarryover?.reduction.toFixed()).toBe('0');
  expect(result.netOperatingLoss?.determinedAlternativeCharitableCarryover?.reduction.toFixed()).toBe('0');
  expect(JSON.stringify(input)).toBe(before);
});

it('closes current-only and prior-only actual charitable source choices', () => {
  const current = carriedCurrentCharitableHistoriesInput();
  const history = current.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory;
  if (!current.charitableCarryoverSources || !history?.alternativeCarryoverSources) throw new Error('Missing fictional actual histories');
  current.charitableCarryoverSources.vintages = []; history.alternativeCarryoverSources.vintages = [];
  history.priorRegularCarryovers = []; history.priorAlternativeCarryovers = [];
  const prior = carriedCurrentCharitableHistoriesInput(); prior.donations = [];
  for (const [input, regular, alternativeUse, alternativeClosing] of [[current,'11000','8100','91900'],[prior,'13000','8550','91450']] as const) {
    const result = calculateFederalTax(input);
    expect([result.form172?.regular.netOperatingLoss,result.netOperatingLoss?.carryforward,result.netOperatingLoss?.alternativeTax.deduction,
      result.carryforwards.alternativeTaxNolCarryforward].map(value => value?.toFixed()))
      .toEqual([regular,'100000',alternativeUse,alternativeClosing]);
  }
});
