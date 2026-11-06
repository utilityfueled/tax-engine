// Spec: spec/federal/rrta-tip-payroll.yaml.
import { it, expect, vi } from 'vitest';
vi.mock('@/models/constants.js', async (original) => {
    const real = await original<typeof import('@/models/constants.js')>();
    const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
    return {
        ...real, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : real.getConstants(year)
    };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { getRulePack } from '@/models/rule-pack-metadata.js';
import { rrtaTipInput } from '../fixtures/rrta-tip-payroll.js';
it('transfers separate RRTA Additional Medicare tax and credit once', () => {
    const input = rrtaTipInput(2025, '230000', '0', '270'), before = structuredClone(input), result = calculateFederalTax(input);
    expect(need(result.form8959).additionalMedicareTax.toFixed()).toBe('270');
    expect(need(result.form8959).withholdingCredit.toFixed()).toBe('270');
    expect(result.form4137?.line13.toFixed()).toBe('15');
    expect(result.allLines.find(x => x.form === 'Sched 2' && x.line === '11')?.value.toFixed()).toBe('270');
    expect(result.totalWithholding.toFixed()).toBe('60270');
    expect(result.totalWages.toFixed()).toBe('231000');
    expect(input).toEqual(before);
});
it('deducts source-qualified nonrailroad tips without changing payroll liability', () => {
    for (const year of [2025, 2026]) {
        const input = rrtaTipInput(year), without = structuredClone(input);
        delete without.schedule1A;
        const baseline = calculateFederalTax(without), result = calculateFederalTax(input);
        expect(result.agi.toFixed()).toBe('121000');
        expect(result.schedule1A?.tipsDeduction.toFixed()).toBe('1000');
        expect(result.form4137?.line13.toFixed()).toBe('77');
        expect(result.agi.eq(baseline.agi)).toBe(true);
        expect(result.totalWages.eq(baseline.totalWages)).toBe(true);
        expect(baseline.taxableIncome.minus(result.taxableIncome).toFixed()).toBe('1000');
    }
});
it('retains actual public2026 refusal and year currentness', async () => {
    const actual = await vi.importActual<typeof import('@/models/constants.js')>('@/models/constants.js');
    expect(() => actual.getConstants(2026)).toThrow();
    expect(getRulePack(2026).limitations.join(' ')).toContain('complete 2026 federal calculation is not implemented');
    const input = rrtaTipInput(2026);
    need(input.rrtaPayrollSources).sourceTaxYear = 2025;
    expect(() => calculateFederalTax(input)).toThrow();
});
it('credits only actual RRTA additional withholding without creating ordinary payroll tax', () => {
    const input = rrtaTipInput(2025, '230000', '0', '0'), r = calculateFederalTax(input);
    expect(need(r.form8959).additionalMedicareTax.toFixed()).toBe('270');
    expect(need(r.form8959).withholdingCredit.toFixed()).toBe('0');
    expect(r.totalWithholding.toFixed()).toBe('60000');
});
function need<T>(value: T | undefined): T {
    if (value === undefined)
        throw Error("Expected computed form");
    return value;
}
