import { describe, expect, it } from 'vitest';
import { calculateForm8582CharacterAllocation } from '@/engine/forms/form-8582-character-allocation.js';
import { d } from '@/utils/decimal.js';

type Group = Parameters<typeof calculateForm8582CharacterAllocation>[0]['groups'][number];
const group = (character: Group['character'], loss: string, prior = '0', income = '0'): Group => ({
    character, currentIncome: d(income), currentDeduction: d(loss), priorDeduction: d(prior),
});
const run = (groups: Group[], unallowed: string) => calculateForm8582CharacterAllocation({ activityName: 'Fictional original activity', groups, unallowedLoss: d(unallowed) });
const rows = (result: ReturnType<typeof run>) => Object.fromEntries(result.groups.map(row => [row.character, {
    income: row.currentIncome.toString(), deductions: row.totalDeduction.toString(), weight: row.netLoss.toString(),
    allowed: row.allowedDeduction.toString(), suspended: row.suspendedDeduction.toString(),
}]));

describe('Form8582 original character allocation (spec/federal/k1-passive-capital-sources.yaml)', () => {
    it('reproduces the published separate capital character example', () => {
        const result = run([group('long_term_collectible', '0', '1000'), group('long_term_capital', '3000')], '3130');
        expect(rows(result)).toEqual({
            long_term_collectible: { income: '0', deductions: '1000', weight: '1000', allowed: '217.5', suspended: '782.5' },
            long_term_capital: { income: '0', deductions: '3000', weight: '3000', allowed: '652.5', suspended: '2347.5' },
        });
        expect(result.allowedDeduction.toString()).toBe('870');
        expect(result.suspendedDeduction.toString()).toBe('3130');
    });
    it('keeps separate short term long term and ordinary groups', () => {
        const result = run([group('ordinary', '40000'), group('short_term_capital', '0', '0', '10000'), group('long_term_capital', '20000')], '30000');
        expect(rows(result)).toEqual({
            ordinary: { income: '0', deductions: '40000', weight: '40000', allowed: '20000', suspended: '20000' },
            short_term_capital: { income: '10000', deductions: '0', weight: '0', allowed: '0', suspended: '0' },
            long_term_capital: { income: '0', deductions: '20000', weight: '20000', allowed: '10000', suspended: '10000' },
        });
        expect(result.retainedIncome.toString()).toBe('10000');
    });
    it('offsets income only in its own reporting group before allocating the unallowed loss', () => {
        const result = run([group('ordinary', '20000'), group('short_term_capital', '0', '10000', '6000')], '12000');
        expect(rows(result)).toEqual({
            ordinary: { income: '0', deductions: '20000', weight: '20000', allowed: '10000', suspended: '10000' },
            short_term_capital: { income: '6000', deductions: '10000', weight: '4000', allowed: '8000', suspended: '2000' },
        });
    });
    it('conserves zero full and zero weight cases without changing retained income', () => {
        const inputs = [group('ordinary', '4000'), group('short_term_capital', '1000'), group('long_term_capital', '0')];
        for (const amount of ['0', '5000']) {
            const result = run(inputs, amount);
            expect(result.retainedIncome.toString()).toBe('0');
            expect(result.allowedDeduction.plus(result.suspendedDeduction).toString()).toBe('5000');
            expect(result.suspendedDeduction.toString()).toBe(amount);
            expect(rows(result).long_term_capital.suspended).toBe('0');
        }
        const withIncome = run([...inputs.slice(0, 2), group('long_term_capital', '0', '0', '1000')], '4000');
        expect(withIncome.retainedIncome.toString()).toBe('1000');
        expect(withIncome.allowedDeduction.toString()).toBe('1000');
        expect(rows(withIncome).long_term_capital.suspended).toBe('0');
    });
    it('preserves exact cents and keyed results when source groups are reordered', () => {
        const inputs = [group('ordinary', '40.04'), group('short_term_capital', '10.01'), group('long_term_capital', '50.05')];
        const result = run(inputs, '50.05'), reversed = run([...inputs].reverse(), '50.05');
        expect(rows(result)).toEqual(rows(reversed));
        expect(result.allowedDeduction.toString()).toBe('50.05');
        expect(rows(result).ordinary.allowed).toBe('20.02');
        expect(rows(result).short_term_capital.allowed).toBe('5.005');
        expect(rows(result).long_term_capital.allowed).toBe('25.025');
    });
    it('rejects missing duplicate contradictory and overallocated worksheet sources', () => {
        const original = { activityName: 'Fictional activity', groups: [group('ordinary', '10')], unallowedLoss: d('1') };
        const rejects = [
            { ...original, activityName: '' }, { ...original, groups: [] },
            { ...original, groups: [group('ordinary', '10'), group('ordinary', '1')] },
            { ...original, groups: [group('ordinary', '-1')] },
            { ...original, groups: [group('ordinary', '1', '0', '1')] },
            { ...original, groups: [{ ...original.groups[0], currentIncome: undefined }] },
            { ...original, groups: [{ ...original.groups[0], character: 'invented' }] },
            { ...original, unallowedLoss: d('10.01') }, { ...original, unallowedLoss: d('-1') },
            { ...original, groups: [group('ordinary', '10'), group('short_term_capital', '0', '0', '10')] },
            { ...original, unallowedLoss: d('Infinity') },
        ];
        for (const input of rejects) expect(() => calculateForm8582CharacterAllocation(input as typeof original)).toThrow(/Form8582 character/);
    });
});
