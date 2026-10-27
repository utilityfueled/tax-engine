/** Actual activity items after basis; spec/federal/k1-charitable-at-risk.yaml. */
import Decimal from 'decimal.js';
import type { Form6198Input } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import type { CharitableCategory } from './charitable-contribution-worksheet.js';
import { calculateForm6198, type Form6198Result } from './form-6198.js';
import type { K1PriorAtRiskRecord, K1PriorAtRiskSourcesResult } from './k1-prior-charitable-at-risk.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, sum } from '@/utils/decimal.js';

export interface K1CharitableRiskItem {
    sourceId: string;
    basisOriginTaxYear: number;
    contributionDate: string;
    category: CharitableCategory;
    amountAfterBasis: Decimal;
}
export interface K1CharitableRiskRecord extends K1CharitableRiskItem {
    allowed: Decimal;
    suspended: Decimal;
}
export interface K1CharitableAtRiskResult {
    totalDeductions: Decimal;
    totalIncome: Decimal;
    disallowedLoss: Decimal;
    ordinaryAmount: Decimal;
    shortTermAmount: Decimal;
    longTermAmount: Decimal;
    ordinarySuspended: Decimal;
    shortTermSuspended: Decimal;
    longTermSuspended: Decimal;
    currentOrdinarySuspended: Decimal;
    currentShortTermSuspended: Decimal;
    currentLongTermSuspended: Decimal;
    /** Gross allowed ordinary deductions; positive current income remains separate. */
    ordinaryDeductionAllowed: Decimal;
    prior: Array<K1PriorAtRiskRecord & { allowed: Decimal; suspended: Decimal }>;
    charitable: K1CharitableRiskRecord[];
    worksheet: Form6198Result;
    lines: CalculatedLine[];
}

/** Internal handoff only: caller validates original identities, membership and histories. */
export function calculateK1CharitableAtRisk(input: {
    form: Form6198Input;
    ordinaryAmount: Decimal;
    shortTermAmount: Decimal;
    longTermAmount: Decimal;
    distributionGain: Decimal;
    charitable: K1CharitableRiskItem[];
    prior?: K1PriorAtRiskSourcesResult;
}): K1CharitableAtRiskResult {
    const worksheet = calculateForm6198(input.form), audit = new AuditTrail();
    if (worksheet.amountAtRisk.lt(0)) throw new Error('K1 charitable at-risk recapture requires its separate source history');
    const negative = (value: Decimal) => Decimal.max(0, value.negated());
    const ordinary = negative(input.ordinaryAmount), shortTerm = negative(input.shortTermAmount), longTerm = negative(input.longTermAmount);
    const totalDeductions = sum(ordinary, shortTerm, longTerm, ...input.charitable.map(row => row.amountAfterBasis), input.prior?.total ?? d(0));
    const totalIncome = sum(Decimal.max(0, input.ordinaryAmount), Decimal.max(0, input.shortTermAmount), Decimal.max(0, input.longTermAmount), input.distributionGain, d(input.form.otherIncomeGains));
    if (!totalIncome.minus(totalDeductions).eq(worksheet.line5)) throw new Error('K1 charitable at-risk original activity totals do not reconcile');
    const disallowedLoss = worksheet.suspendedLoss;
    // Allocate the disallowed amount over deductions, not over net loss. Income
    // remains reportable. There is no cash/property or source-order preference.
    const suspended = (item: Decimal) => totalDeductions.isZero() ? d(0) : item.times(disallowedLoss).div(totalDeductions);
    const currentOrdinarySuspended = suspended(ordinary), currentShortTermSuspended = suspended(shortTerm), currentLongTermSuspended = suspended(longTerm);
    const prior = (input.prior?.records ?? []).map(row => {
        const removed = suspended(row.remaining);
        return { ...row, allowed: row.remaining.minus(removed), suspended: removed };
    });
    const priorSum = (character: K1PriorAtRiskRecord['character'], key: 'allowed' | 'suspended') =>
        sum(...prior.filter(row => row.character === character).map(row => row[key]));
    const ordinarySuspended = currentOrdinarySuspended.plus(priorSum('ordinary', 'suspended'));
    const shortTermSuspended = currentShortTermSuspended.plus(priorSum('short_term_capital', 'suspended'));
    const longTermSuspended = currentLongTermSuspended.plus(priorSum('long_term_capital', 'suspended'));
    const ordinaryDeductionAllowed = ordinary.minus(currentOrdinarySuspended).plus(priorSum('ordinary', 'allowed'));
    const charitable = input.charitable.map(row => {
        const removed = suspended(row.amountAfterBasis);
        return { ...row, allowed: row.amountAfterBasis.minus(removed), suspended: removed };
    });
    audit.record('K1 Charitable At Risk', 'allocation', 'Original activity deductions allocated after basis', disallowedLoss,
        'Reg1.469-2T(d)(6)(iii)-(iv): each remaining deduction times disallowed section465 loss divided by all remaining activity deductions',
        { 'Activity deductions after basis': totalDeductions, 'Retained activity income': totalIncome, 'Actual at-risk amount': worksheet.amountAtRisk,
            'Disallowed activity loss': disallowedLoss, 'Ordinary suspended at risk': ordinarySuspended,
            'Short-term suspended at risk': shortTermSuspended, 'Long-term suspended at risk': longTermSuspended,
            'Charitable suspended at risk': sum(...charitable.map(row => row.suspended), priorSum('charitable', 'suspended')),
            'Charity available for section170': sum(...charitable.map(row => row.allowed), priorSum('charitable', 'allowed')) });
    for (const [index, row] of prior.entries()) audit.record('K1 Prior At Risk', `use-${index + 1}`, 'Prior activity deduction allowed after current risk limit', row.allowed,
        'Original remaining deduction times the common current allowance fraction; retain original character and risk year', {
            'Original risk year': String(row.taxYear), Character: row.character, 'Opening prior deduction': row.remaining,
            'Current allowed deduction': row.allowed, 'Closing prior suspension': row.suspended,
        });
    return { totalDeductions, totalIncome, disallowedLoss, ordinaryAmount: input.ordinaryAmount.plus(currentOrdinarySuspended).minus(priorSum('ordinary', 'allowed')),
        shortTermAmount: input.shortTermAmount.plus(currentShortTermSuspended).minus(priorSum('short_term_capital', 'allowed')),
        longTermAmount: input.longTermAmount.plus(currentLongTermSuspended).minus(priorSum('long_term_capital', 'allowed')),
        ordinarySuspended, shortTermSuspended, longTermSuspended, currentOrdinarySuspended, currentShortTermSuspended, currentLongTermSuspended,
        ordinaryDeductionAllowed, prior, charitable, worksheet, lines: audit.getLines() };
}
