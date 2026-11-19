// Spec: spec/federal/form-1099-c.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax, parseInput } from '@/index.js';
import { calculateSchedule1 } from '@/engine/schedules/schedule-1.js';
import { calculateCodPrincipalResidenceReduction } from '@/engine/forms/cod-principal-residence.js';
import { calculateCodNolReduction } from '@/engine/forms/cod-nol-reductions.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { principalResidenceCodInput } from '../fixtures/cod-principal-residence.js';
import { actualPartialPersonalCodInput } from '../fixtures/cod-partial-personal.js';

const hold = 'Form 1099-C statement year requires actual cancellation-year source reconciliation';
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing explicit synthetic original');
  return value;
}
function ordinary(year = 2025, statementYear: number | undefined = year, amount = '1000.10') {
  const raw = structuredClone(simpleW2Fixture);
  raw.taxpayer.taxYear = year;
  raw.w2s = raw.w2s.map(row => ({ ...row, taxYear: year }));
  raw.form1099C = [{ taxYear: statementYear, creditor: 'Synthetic creditor', amountDischarged: amount,
    interestIncluded: '0', personallyLiable: true, identifiableEventCode: 'H', fmvOfProperty: '0' }];
  return raw;
}

it('holds unreconciled contradictory COD statement headers before ordinary aggregation', () => {
  for (const year of [2025, 2026]) for (const header of [year - 1, year + 1]) for (const amount of ['0', '1000.10']) {
    const raw = ordinary(year, header, amount), before = JSON.stringify(raw), input = parseInput(raw);
    const expected = year === 2025 ? hold : /rule pack.*incomplete/;
    expect(() => calculateSchedule1(input)).toThrow(expected);
    expect(() => calculateFederalTax(input)).toThrow(expected);
    expect(JSON.stringify(raw)).toBe(before);
    for (const reversed of [false, true]) {
      const matching = { ...required(input.form1099C[0]), taxYear: year };
      const rows = reversed ? [required(input.form1099C[0]), matching] : [matching, required(input.form1099C[0])];
      expect(() => calculateSchedule1({ ...input, form1099C: rows })).toThrow(expected);
    }
  }
});

it('preserves validated actual-discharge methods and rejects fabricated source bypasses', () => {
  for (const header of [undefined, 2025, 2024, 2026]) {
    const home = principalResidenceCodInput();
    const input = parseInput({ ...home, form1099C: home.form1099C.map(row => ({ ...row, taxYear: header })) });
    const before = JSON.stringify(input);
    expect(calculateCodPrincipalResidenceReduction(input)?.excluded.toFixed()).toBe('50000');
    expect(calculateSchedule1(input).cancelledDebtIncome.toFixed()).toBe('50000');
    const result = calculateFederalTax(input);
    expect(result.schedule1?.cancelledDebtIncome.toFixed()).toBe('50000');
    expect(result.form982?.reducedAttributes.basisOfPrincipalResidence.toFixed()).toBe('250000');
    expect(JSON.stringify(input)).toBe(before);
    const personal = actualPartialPersonalCodInput();
    const parsed = parseInput({ ...personal, form1099C: personal.form1099C.map(row => ({ ...row, taxYear: header })) });
    expect(calculateCodNolReduction(parsed).sourceFactsVerified).toBe(true);
    expect(calculateSchedule1(parsed).cancelledDebtIncome.toFixed()).toBe('8000');
    expect(calculateFederalTax(parsed).schedule1?.cancelledDebtIncome.toFixed()).toBe('8000');
    for (const mutate of [
      (x: typeof input) => { delete required(x.form982PrincipalResidenceSources).sourceReference; },
      (x: typeof input) => { required(x.form982PrincipalResidenceSources).debt.dischargeDate = '2024-09-15'; },
      (x: typeof input) => { required(x.form982PrincipalResidenceSources).debt.debtorSsnLast4 = '9999'; },
      (x: typeof input) => { required(x.form1099C[0]).amountDischarged = '100001'; },
    ]) {
      const bad = structuredClone(input); mutate(bad);
      expect(() => calculateSchedule1(bad)).toThrow();
    }
    for (const mutate of [
      (x: typeof parsed) => { delete required(x.form982NolSources).sourceReference; },
      (x: typeof parsed) => { required(required(required(x.form982NolSources).debts)[0]).dischargeDate = '2024-09-15'; },
      (x: typeof parsed) => { required(required(required(x.form982NolSources).debts)[0]).debtorSsnLast4 = '9999'; },
      (x: typeof parsed) => { x.form1099C.push({ ...required(x.form1099C[0]) }); },
    ]) {
      const bad = structuredClone(parsed); mutate(bad);
      expect(() => calculateFederalTax(bad)).toThrow();
      if (header !== undefined && header !== 2025) expect(() => calculateSchedule1(bad)).toThrow();
    }
  }
  const unknown = ordinary(2025, 2024);
  expect(() => calculateSchedule1(parseInput({ ...unknown, form982PrincipalResidenceSources: { sourceFactsConfirmed: true } }))).toThrow();
  expect(() => calculateSchedule1(parseInput({ ...unknown, form982NolSources: { sourceFactsConfirmed: true } }))).toThrow();
});

it('preserves matched and undated COD economics and earlier source diagnostics', () => {
  for (const header of [2025, undefined]) {
    const raw = ordinary(); required(raw.form1099C[0]).taxYear = header;
    const input = parseInput(raw), result = calculateFederalTax(input);
    expect(result.schedule1?.cancelledDebtIncome.toFixed()).toBe('1000.1');
    expect(result.agi.toFixed()).toBe('86000.1');
    expect(result.totalWithholding.toFixed()).toBe('12750');
    const badW2 = { ...input, w2s: input.w2s.map(row => ({ ...row, taxYear: 2024 })),
      form1099C: input.form1099C.map(row => ({ ...row, taxYear: 2024 })) };
    expect(() => calculateFederalTax(badW2)).toThrow('Form W-2 source year 2024 must match the 2025 return');
  }
  expect(() => calculateFederalTax(parseInput(ordinary(2026, 2026)))).toThrow(/rule pack.*incomplete/);
});
