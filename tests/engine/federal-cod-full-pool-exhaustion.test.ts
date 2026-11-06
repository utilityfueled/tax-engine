// Spec: spec/federal/cod-full-pool-exhaustion.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { actualCodNolInput } from '../fixtures/cod-nol.js';
import { calculateCodNolReduction } from '@/engine/forms/cod-nol-reductions.js';
import { charitableCodModifiedInput } from '../fixtures/charitable-cod-modified.js';
import { d } from '@/utils/decimal.js';

/** Independent fictional originals, not a result or eligibility override. */
function originals(amount = '12700') {
  const input = actualCodNolInput(amount), facts = input.netOperatingLoss;
  if (!facts?.vintages?.[0] || !facts.alternativeTax?.vintages?.[0]) throw new Error('Missing original fixture');
  if (!input.priorYear) throw new Error('Missing actual prior-year fixture');
  input.priorYear.shortTermCapitalLoss = '-3000';
  facts.vintages = [{ ...facts.vintages[0], originalLoss: '77700', openingCarryforward: '77700' }];
  facts.alternativeTax.vintages = [{ ...facts.alternativeTax.vintages[0], originalLoss: '100000', openingCarryforward: '100000' }];
  return input;
}

it('exhausts exact independent current-tax pools without reviving modified carry', () => {
  const input = originals(), before = JSON.stringify(input);
  const noCod = calculateFederalTax({ ...input, form1099C: [], codExclusion: undefined, form982NolSources: undefined });
  const result = calculateFederalTax(input), cod = result.codNolReduction;
  expect([result.nolDeduction, result.netOperatingLoss?.alternativeTax.deduction,
    cod?.regular?.beforeReduction, cod?.alternativeTax?.beforeReduction,
    cod?.regular?.modifiedAvailableBeforeReduction, cod?.alternativeTax?.modifiedAvailableBeforeReduction,
    cod?.regular?.reduction, cod?.alternativeTax?.reduction,
    result.carryforwards.nolCarryforward, result.carryforwards.alternativeTaxNolCarryforward,
    cod?.regular?.expiredAfterReduction, cod?.alternativeTax?.expiredAfterReduction].map(value => value?.toFixed()))
    .toEqual(['65000', '87300', '12700', '12700', '10300', '10000', '12700', '12700', '0', '0', '0', '0']);
  expect(result.agi.toFixed()).toBe('32000');
  expect(result.totalTax.toFixed()).toBe(noCod.totalTax.toFixed());
  expect(result.netOperatingLoss).toEqual(noCod.netOperatingLoss);
  expect([cod?.regular?.vintages[0].modifiedAbsorptionOverlap, cod?.alternativeTax?.vintages[0].modifiedAbsorptionOverlap]
    .map(value => value?.toFixed())).toEqual(['2400', '2700']);
  for (const ledger of [cod?.regular, cod?.alternativeTax]) {
    const row = ledger?.vintages[0];
    if (!row?.modifiedAbsorptionOverlap) throw new Error('Missing complete-pool proof');
    expect(row.currentTaxUse.plus(row.beforeReduction).eq(row.originalLoss)).toBe(true);
    expect(row.modifiedAbsorption.plus(row.modifiedAvailableBeforeReduction).eq(row.originalLoss)).toBe(true);
    expect(row.modifiedAvailableBeforeReduction.plus(row.modifiedAbsorptionOverlap).eq(row.attributeReduction)).toBe(true);
  }
  expect(cod?.regular?.vintages[0].section1411RemainingCarryforward?.toFixed()).toBe('0');
  expect(JSON.stringify(input)).toBe(before);
});

it('requires the complete-pool endpoint in the other tax system even when that modified carry is sufficient', () => {
  const input = originals(), row = input.netOperatingLoss?.alternativeTax?.vintages?.[0];
  if (!row) throw new Error('Missing original');
  row.originalLoss = '110000'; row.openingCarryforward = '110000';
  expect(() => calculateFederalTax(input)).toThrow(/COD.*(?:both|independent|complete-pool)/i);
});

it('does not infer an endpoint from rounded source cents or multiple original vintages', () => {
  for (const amount of ['12700.49', '12700.50']) expect(() => calculateFederalTax(originals(amount))).toThrow(/COD.*(?:exhaust|insufficient|conserv)/i);
  const input = originals(), facts = input.netOperatingLoss;
  if (!facts?.vintages?.[0]) throw new Error('Missing original');
  const first = facts.vintages[0];
  facts.vintages = [{ ...first, originalLoss: '1', openingCarryforward: '1' },
    { ...first, sourceId: 'loss2022', lossTaxYear: 2022, originalLoss: '77699', openingCarryforward: '77699', sourceReference: 'Second actual original' }];
  expect(() => calculateFederalTax(input)).toThrow(/COD.*modified.*exhaust/i);
});

it('retains charitable exhaustion and original source and current-year gates', () => {
  const charity = charitableCodModifiedInput(), debt = charity.form982NolSources?.debts?.[0];
  const alternative = charity.netOperatingLoss?.alternativeTax?.vintages?.[0];
  if (!debt || !alternative) throw new Error('Missing original charity fixture');
  debt.amountDischarged = '51393'; charity.form1099C[0].amountDischarged = '51393';
  alternative.originalLoss = '1000000'; alternative.openingCarryforward = '1000000';
  expect(() => calculateFederalTax(charity)).toThrow(/COD.*comparison.*exhaust/i);
  const stale = originals();
  if (!stale.form982NolSources?.debts?.[0]) throw new Error('Missing original');
  stale.form982NolSources.debts[0].amountDischarged = '12701';
  expect(() => calculateFederalTax(stale)).toThrow(/COD.*(?:reconcile|statement)/i);
  const future = originals(); future.taxpayer.taxYear = 2026;
  const futureCod = future.form982NolSources, futureNol = future.netOperatingLoss;
  if (!futureCod?.insolvency || !futureNol?.alternativeTax) throw new Error('Missing complete future original fixture');
  futureCod.sourceTaxYear = 2026;
  futureCod.sourceReference = 'Synthetic complete2026 discharge and insolvency originals';
  for (const debt of futureCod.debts ?? []) { debt.sourceTaxYear = 2026; debt.dischargeDate = '2026-10-01'; }
  futureCod.insolvency.asOfDate = '2026-10-01';
  futureNol.sourceTaxYear = 2026;
  futureNol.sourceReference = 'Synthetic actual2025 closing loss carry records for2026';
  for (const row of [...(futureNol.vintages ?? []), ...(futureNol.alternativeTax.vintages ?? [])]) {
    row.adjustedThroughTaxYear = 2025;
    row.historySourceReference = 'Synthetic complete filed2025 carry worksheet';
  }
  expect(() => calculateFederalTax(future)).toThrow(/readiness|incomplete|not.*ready|not.*implemented/i);
});

it('validates original-source facts without inventing a completed endpoint or accepting forged absorption', () => {
  const input = originals(), sourceOnly = calculateCodNolReduction(input);
  expect(sourceOnly.calculationComplete).toBe(false); expect(sourceOnly.regular).toBeUndefined();
  const original = calculateFederalTax({ ...input, form1099C: [], codExclusion: undefined, form982NolSources: undefined });
  const priorLoss = original.netOperatingLoss;
  if (!priorLoss?.vintages[0]) throw new Error('Missing original calculation');
  priorLoss.vintages[0].absorbed = d('65000');
  expect(() => calculateCodNolReduction(input, { priorLoss })).toThrow(/COD.*(?:conserve|reconcile)/i);
});

it('retains partial overshoot and incomplete independent-pool refusals', () => {
  for (const amount of ['12699', '12701']) expect(() => calculateFederalTax(originals(amount))).toThrow(/COD.*(?:exhaust|insufficient|conserv)/i);
  const independent = originals();
  if (!independent.netOperatingLoss?.alternativeTax?.vintages?.[0]) throw new Error('Missing independent source');
  independent.netOperatingLoss.alternativeTax.vintages[0].originalLoss = '100001';
  independent.netOperatingLoss.alternativeTax.vintages[0].openingCarryforward = '100001';
  expect(() => calculateFederalTax(independent)).toThrow(/COD.*(?:exhaust|pool|composition)/i);
  const unknown = originals();
  if (!unknown.form982NolSources) throw new Error('Missing source');
  unknown.form982NolSources.sourceFactsConfirmed = false;
  expect(() => calculateFederalTax(unknown)).toThrow(/COD.*(?:source|confirm)/i);
});
