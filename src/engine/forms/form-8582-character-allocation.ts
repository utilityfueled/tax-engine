/** Form8582 PartIX; spec/federal/k1-passive-capital-sources.yaml. */
import Decimal from 'decimal.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, sum, zeroFloor } from '@/utils/decimal.js';

export type PassiveDeductionCharacter = 'ordinary' | 'short_term_capital' | 'long_term_capital' | 'long_term_collectible';
export interface PassiveCharacterGroup {
    character: PassiveDeductionCharacter;
    /** Net current income or deduction on this reporting part, after basis/465. */
    currentIncome: Decimal;
    currentDeduction: Decimal;
    /** Actual prior section469 balance of the same activity and reporting part. */
    priorDeduction: Decimal;
}

/** Derived worksheet handoff only; never accepts an allowance from TaxYearInput. */
export function calculateForm8582CharacterAllocation(input: {
    activityName: string;
    groups: PassiveCharacterGroup[];
    unallowedLoss: Decimal;
}) {
    const fail = () => { throw new Error('Form8582 character allocation requires complete matching original groups and a valid derived unallowed loss'); };
    const nonnegative = (value: unknown): value is Decimal => Decimal.isDecimal(value) && value.isFinite() && value.gte(0);
    const characters = new Set<PassiveDeductionCharacter>(['ordinary', 'short_term_capital', 'long_term_capital', 'long_term_collectible']);
    if (typeof input.activityName !== 'string' || !input.activityName.trim() || !Array.isArray(input.groups)
        || input.groups.length === 0 || !nonnegative(input.unallowedLoss)) fail();
    const seen = new Set<PassiveDeductionCharacter>();
    for (const row of input.groups) {
        if (!row || !characters.has(row.character) || seen.has(row.character)
            || !nonnegative(row.currentIncome) || !nonnegative(row.currentDeduction) || !nonnegative(row.priorDeduction)
            || (row.currentIncome.gt(0) && row.currentDeduction.gt(0))) fail();
        seen.add(row.character);
    }
    const totalDeduction = sum(...input.groups.map(row => row.currentDeduction.plus(row.priorDeduction)));
    const retainedIncome = sum(...input.groups.map(row => row.currentIncome));
    if (input.unallowedLoss.gt(zeroFloor(totalDeduction.minus(retainedIncome)))) fail();
    const losses = input.groups.map(row => zeroFloor(row.currentDeduction.plus(row.priorDeduction).minus(row.currentIncome)));
    const denominator = sum(...losses), audit = new AuditTrail();
    const groups = input.groups.map((row, index) => {
        const total = row.currentDeduction.plus(row.priorDeduction), netLoss = losses[index];
        const ratio = denominator.isZero() ? d(0) : netLoss.div(denominator);
        // Multiply before dividing so an exactly representable product is not
        // changed by rounding the intermediate repeating ratio.
        const suspendedDeduction = denominator.isZero() ? d(0) : input.unallowedLoss.times(netLoss).div(denominator);
        const allowedDeduction = total.minus(suspendedDeduction);
        audit.record('Form 8582 Part IX', row.character, 'Loss allocation retaining original reporting character', allowedDeduction,
            'Column(a) current plus prior deduction; column(b) less same-part income, at least zero; column(d) activity unallowed loss times column(b) divided by total column(b); column(e) deduction less column(d)', {
                'Current deduction after prior limitations': row.currentDeduction, 'Original prior section469 deduction': row.priorDeduction,
                'Retained same-part income': row.currentIncome, 'Net loss allocation weight': netLoss,
                'Unallowed deduction': suspendedDeduction, 'Allowed deduction': allowedDeduction,
            });
        return { ...row, totalDeduction: total, netLoss, ratio, suspendedDeduction, allowedDeduction };
    });
    return { activityName: input.activityName, groups, totalDeduction, retainedIncome,
        allowedDeduction: sum(...groups.map(row => row.allowedDeduction)),
        suspendedDeduction: sum(...groups.map(row => row.suspendedDeduction)), lines: audit.getLines() };
}
