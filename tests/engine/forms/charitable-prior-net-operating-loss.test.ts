// Spec: spec/federal/charitable-prior-net-operating-loss.yaml.
import { expect, it } from 'vitest';
import { d } from '@/utils/decimal';
import { calculatePriorCharitableNolCarryover } from '@/engine/forms/charitable-prior-net-operating-loss';
import { readPriorCharitableNolSources, createPriorCharitableNolLimit, validatePriorCharitableNolLimit } from '@/utils/charitable-prior-nol-source';
import { priorCharitableNolInput } from '../../fixtures/charitable-prior-nol';
it('preserves independent complete prior charity histories and rejects source crossover', () => {
    const input = priorCharitableNolInput({ alternative: '10000' }), before = structuredClone(input);
    const pair = readPriorCharitableNolSources(input);
    expect([pair.regular[0].amount.toFixed(), pair.alternative[0].amount.toFixed()]).toEqual(['50000', '10000']);
    expect(input).toEqual(before);
    for (const kind of ['identity', 'opening', 'category', 'medium', 'year', 'history', 'legacy', 'current'] as const) {
        const bad = priorCharitableNolInput(), history = required(required(required(bad.netOperatingLoss).alternativeTax).charitableCarryoverHistory);
        const alternative = required(history.alternativeCarryoverSources), row = required(alternative.vintages)[0];
        if (kind === 'identity')
            alternative.primaryTaxpayerIdLast4 = '0000';
        if (kind === 'opening')
            row.openingCarryforward = '49999.99';
        if (kind === 'category')
            row.category = 'noncash_50';
        if (kind === 'medium')
            row.medium = 'cash';
        if (kind === 'year')
            row.contributionYear = 2023;
        if (kind === 'history')
            row.allHistoryIncluded = undefined;
        if (kind === 'legacy')
            history.priorAlternativeCarryovers = [];
        if (kind === 'current')
            bad.donations = [{ organization: 'Synthetic current public recipient', qualifiedOrganization: true, recipientCategory: 'fifty-percent', type: 'cash', amount: '0.01', dateOfDonation: '2025-01-01' }];
        expect(() => readPriorCharitableNolSources(bad)).toThrow(/prior|charit|history|source|vintage|current/i);
    }
    const missing = priorCharitableNolInput();
    required(required(required(missing.netOperatingLoss).alternativeTax).charitableCarryoverHistory).alternativeCarryoverSources = undefined;
    expect(() => readPriorCharitableNolSources(missing)).toThrow(/independent|alternative|history/i);
    const missingRegular = priorCharitableNolInput({ regular: '0' });
    delete missingRegular.charitableCarryoverSources;
    delete required(required(required(missingRegular.netOperatingLoss).alternativeTax).charitableCarryoverHistory).priorRegularCarryovers;
    expect(() => readPriorCharitableNolSources(missingRegular)).toThrow(/independent|regular|history/i);
});
it('conserves prior category capacity exact cents and original expiration', () => {
    for (const [category, expected] of [['cash_60', '6000'], ['noncash_50', '5000'], ['other_30', '3000'], ['capital_gain_30', '3000'], ['capital_gain_20', '2000']] as const) {
        const result = calculatePriorCharitableNolCarryover({ input: priorCharitableNolInput({ category, regular: '9000.49' }), ledger: 'regular',
            normalContributionBase: d('10000'), normalDeductionUsed: 'itemized', nolCarryforward: d('0'), computeCarryover: () => { throw new Error('No succeeding NOL comparison needed'); } });
        expect(result.normalTreatedAsPaid.toFixed()).toBe(expected);
        expect(result.opening.eq(result.normalTreatedAsPaid.plus(result.reduction).plus(result.expired).plus(result.carryforward))).toBe(true);
        expect(result.carryforward.eq(d('9000.49').minus(expected))).toBe(true);
    }
    const result = calculatePriorCharitableNolCarryover({ input: priorCharitableNolInput({ regular: '50000.49' }), ledger: 'regular',
        normalContributionBase: d('44000'), normalDeductionUsed: 'itemized', nolCarryforward: d('44000'), computeCarryover: limit => {
            expect([limit.contributionYear, limit.category, limit.medium, limit.amount.toFixed()]).toEqual([2024, 'capital_gain_30', 'noncash', '13200']);
            return d('30560');
        } });
    expect([result.reduction.toFixed(), result.carryforward.toFixed()]).toEqual(['13440', '23360.49']);
    for (const year of [2019, 2020]) {
        const old = calculatePriorCharitableNolCarryover({ input: priorCharitableNolInput({ contributionYear: year }), ledger: 'regular',
            normalContributionBase: d('44000'), normalDeductionUsed: 'itemized', nolCarryforward: d('44000'), computeCarryover: () => d('30560') });
        expect([old.normalTreatedAsPaid.toFixed(), old.reduction.toFixed(), old.expired.toFixed(), old.carryforward.toFixed()])
            .toEqual(year === 2019 ? ['0', '0', '50000', '0'] : ['13200', '13440', '23360', '0']);
    }
});
it('rejects stale or cross-ledger prior comparison tags', () => {
    const input = priorCharitableNolInput({ alternative: '10000' }), limit = createPriorCharitableNolLimit(input, 'regular', d('13200'));
    expect(validatePriorCharitableNolLimit(input, limit).regular[0].amount.toFixed()).toBe('50000');
    for (const changed of [{ ...limit, ledger: 'alternative' as const }, { ...limit, contributionYear: 2023 }, { ...limit, sourceId: 'forged' },
        { ...limit, amount: d('50000.01') }, { ...limit, sourceDigest: 'stale' }, { ...limit, method: undefined }]) {
        expect(() => validatePriorCharitableNolLimit(input, changed as typeof limit)).toThrow(/original|prior|comparison|source/);
    }
    const stale = structuredClone(input);
    required(required(stale.charitableCarryoverSources).vintages)[0].sourceReference = 'Changed original source';
    expect(() => validatePriorCharitableNolLimit(stale, limit)).toThrow(/source|original|prior/);
});

function required<T>(value: T): NonNullable<T> {
  if (value === undefined || value === null) throw new Error("Missing fictional source or expected calculation");
  return value;
}
