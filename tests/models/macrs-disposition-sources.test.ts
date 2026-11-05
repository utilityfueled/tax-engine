/** Spec: spec/federal/macrs-ordinary-disposition.yaml. */
import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { MACRS_NONRESIDENTIAL_REAL_MID_MONTH } from '@/models/constants.js';
import { DepreciableAssetSchema } from '@/models/inputs.js';
import { dispositionFixture } from '../utils/macrs-disposition-fixtures.js';
describe('MACRS disposition documentary facts', () => {
    it('requires actual source facts without changing legacy nondisposal data', () => {
        const a = dispositionFixture(), v = DepreciableAssetSchema.safeParse(a);
        expect(v.success).toBe(true);
        if (v.success)
            expect(v.data).toHaveProperty('dispositionSources', a.dispositionSources);
        for (const field of Object.keys(a.dispositionSources)) {
            const bad = {
                ...a, dispositionSources: {
                    ...a.dispositionSources, [field]: undefined
                }
            };
            expect(DepreciableAssetSchema.safeParse(bad).success, field).toBe(false);
        }
        expect(DepreciableAssetSchema.safeParse({
            ...a, dispositionSources: {
                ...a.dispositionSources, history: [...a.dispositionSources.history].reverse()
            }
        }).success).toBe(false);
        for (const date of ['2025-02-29', '2025-01-00', '2025-04-31', '2025-13-01', '2024-12-31', '2025-04', 'unknown'])
            expect(DepreciableAssetSchema.safeParse({
                ...a, dispositionSources: {
                    ...a.dispositionSources, dispositionDate: date
                }
            }).success, date).toBe(false);
        expect(DepreciableAssetSchema.safeParse({
            ...a, costBasis: '10001'
        }).success).toBe(false);
        expect(DepreciableAssetSchema.safeParse({
            ...a, dispositionSources: {
                ...a.dispositionSources, adjustedBasisAtYearStart: '3421'
            }
        }).success).toBe(false);
        const legacy = {
            costBasis: '1000', placedInServiceDate: '2023-06', recoveryPeriod: '5'
        };
        const parsed = DepreciableAssetSchema.parse(legacy);
        expect(parsed.costBasis).toBe('1000');
        expect(parsed.placedInServiceDate).toBe('2023-06');
        expect(parsed).not.toHaveProperty('dispositionSources');
    });
});
describe('Finite documentary denial boundaries', () => {
    it.each(['ownershipPercentage', 'businessUsePercentage'] as const)('rejects partial actual %s', (field) => {
        const a = dispositionFixture();
        expect(DepreciableAssetSchema.safeParse({
            ...a, dispositionSources: {
                ...a.dispositionSources, [field]: '99'
            }
        }).success).toBe(false);
    });
    it.each(['section179Deduction', 'bonusDeduction', 'otherBasisAdjustments'] as const)('requires explicit zero %s', (field) => {
        const a = dispositionFixture();
        expect(DepreciableAssetSchema.safeParse({
            ...a, dispositionSources: {
                ...a.dispositionSources, [field]: '1'
            }
        }).success).toBe(false);
    });
    it.each(['regularAllowedOrAllowable', 'regularClaimed', 'originalMacrsBasis', 'businessUsePercentage', 'section179Deduction', 'bonusDeduction', 'otherBasisAdjustments'] as const)('reconciles actual history %s', (field) => {
        const a = dispositionFixture();
        const history = a.dispositionSources.history.map((r, i) => i === 0 ? {
            ...r, [field]: '999'
        } : r);
        expect(DepreciableAssetSchema.safeParse({
            ...a, dispositionSources: {
                ...a.dispositionSources, history
            }
        }).success).toBe(false);
    });
    it('rejects changed source cohort, snapshot, first and terminal recovery without invented histories', () => {
        const a = dispositionFixture();
        for (const change of [{
                system: 'ADS'
            }, {
                calendarYear: false
            }, {
                dispositionKind: 'partial_sale'
            }, {
                constantUseConfirmed: false
            }, {
                noOtherBasisAdjustmentsConfirmed: false
            }, {
                noConversionOrCarryoverBasisConfirmed: false
            }, {
                noPartialOrGeneralAssetAccountConfirmed: false
            }, {
                bonusTreatment: 'not_applicable'
            }, {
                unreportedFact: true
            }])
            expect(DepreciableAssetSchema.safeParse({
                ...a, dispositionSources: {
                    ...a.dispositionSources, ...change
                }
            }).success).toBe(false);
        for (const change of [{
                method: 'SL'
            }, {
                convention: 'halfYear'
            }, {
                isListedProperty: true
            }, {
                isPassengerAutomobile: true
            }, {
                businessUsePercentage: 50
            }, {
                disposedDuringYear: false
            }, {
                placedInServiceDate: '2022-12'
            }])
            expect(DepreciableAssetSchema.safeParse({
                ...a, ...change
            }).success).toBe(false);
        for (const pis of ['2025-01-01', '2020-01-01']) {
            const changed = {
                ...a, placedInServiceDate: pis, dispositionSources: {
                    ...a.dispositionSources, assetSnapshot: {
                        ...a.dispositionSources.assetSnapshot, placedInServiceDate: pis
                    }
                }
            };
            expect(DepreciableAssetSchema.safeParse(changed).success).toBe(false);
        }
        expect(DepreciableAssetSchema.safeParse({
            ...a, dispositionSources: {
                ...a.dispositionSources, history: [a.dispositionSources.history[0], a.dispositionSources.history[0], a.dispositionSources.history[2]]
            }
        }).success).toBe(false);
        for (const amount of ['', '-1', 'NaN', 'Infinity', '1e5', 'private-money-marker'])
            expect(() => DepreciableAssetSchema.safeParse({
                ...a, dispositionSources: {
                    ...a.dispositionSources, grossCostBasis: amount
                }
            })).not.toThrow();
    });
});

describe('Historical convention completeness',()=>{
 it.each(['historyRounding','constantOwnershipConfirmed','noSystemOrMethodChangeConfirmed'])('requires explicit original %s facts',(field)=>{
  const a=dispositionFixture();const source:Record<string,unknown>={...a.dispositionSources};delete source[field];expect(DepreciableAssetSchema.safeParse({...a,dispositionSources:source}).success).toBe(false);
 });
});

// Spec: nonresidential-transition-facts. These are fictional complete records,
// not a claim that any taxpayer's historical return used the correct period.
function nonresidentialFixture(placedInServiceDate: string) {
    const asset = dispositionFixture('residential');
    const year = Number(placedInServiceDate.slice(0, 4));
    const month = Number(placedInServiceDate.slice(5, 7));
    const table = MACRS_NONRESIDENTIAL_REAL_MID_MONTH[month];
    const history = Array.from({ length: 2025 - year }, (_, index) => {
        const allowed = new Decimal(100000).times(table[index]).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed();
        return { ...asset.dispositionSources.history[0], taxYear: year + index,
            sourceReference: `fictional-original-${year + index}`, regularAllowedOrAllowable: allowed, regularClaimed: allowed };
    });
    const prior = history.reduce((sum, row) => sum.plus(row.regularClaimed), new Decimal(0));
    Object.assign(asset, { placedInServiceDate, recoveryPeriod: '39', cumulativePriorMacrsDeductions: prior.toFixed() });
    asset.dispositionSources.assetSnapshot = { ...asset.dispositionSources.assetSnapshot,
        placedInServiceDate, recoveryPeriod: '39', cumulativePriorMacrsDeductions: prior.toFixed() };
    asset.dispositionSources.history = history;
    asset.dispositionSources.adjustedBasisAtYearStart = new Decimal(100000).minus(prior).toFixed();
    return asset;
}

it('requires separate transition facts for every pre1994 39-year building', () => {
    for (const date of ['1990-07-02', '1993-05-12', '1993-05-13', '1993-12-31']) {
        const actual = nonresidentialFixture(date), before = JSON.stringify(actual);
        expect(DepreciableAssetSchema.safeParse(actual).success, date).toBe(false);
        expect(JSON.stringify(actual)).toBe(before);
    }
    for (const date of ['1994-01-01', '1994-07-02']) {
        const actual = nonresidentialFixture(date), before = JSON.stringify(actual);
        expect(DepreciableAssetSchema.safeParse(actual).success, date).toBe(true);
        expect(JSON.stringify(actual)).toBe(before);
    }
});
