import { it, expect } from 'vitest';
import { calculateForm8582 } from '@/engine/forms/form-8582.js';
import { d } from '@/utils/decimal.js';

it('retains exact ordinary nonrental source values without changing the default reporting path', () => {
    // Spec: K1 Passive Capital Sources, original-precision.
    const input = { scope: 'ordinary_nonrental_part_i' as const, filingStatus: 'single' as const,
        activities: [
            { name: 'Actual loss activity', income: d(0), loss: d('-4000.20'), isRentalRealEstate: false, isActiveParticipant: false },
            { name: 'Actual income activity', income: d('1000.10'), loss: d(0), isRentalRealEstate: false, isActiveParticipant: false },
        ] };
    const exact = calculateForm8582({ ...input, preserveSourcePrecision: true });
    expect(exact.allowedLoss.toString()).toBe('1000.1'); expect(exact.suspendedLoss.toString()).toBe('3000.1');
    expect(exact.activityAllocations[0].suspendedLoss.toString()).toBe('3000.1');
    expect(calculateForm8582(input).suspendedLoss.toString()).toBe('3000');
    for (const changes of [
        { activities: [{ ...input.activities[0], isRentalRealEstate: true }] },
        { activities: [{ ...input.activities[0], isPubliclyTradedPartnership: true }] },
        { scope: undefined, agi: d(100000) },
    ]) expect(() => calculateForm8582({ ...input, preserveSourcePrecision: true, ...changes })).toThrow(/source|precision|nonrental/i);
});
