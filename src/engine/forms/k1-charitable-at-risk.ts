/** Actual activity items after basis; ordinary gifts remain separate. Specs: k1-charitable-at-risk.yaml, k1-ordinary-gift-at-risk.yaml. */
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
    // The source-bound ordinary section170 gifts are separately stated personal
    // deductions, not deductions of the identified section465 activity. A gift
    // source ID or an all-items confirmation cannot establish activity nexus.
    // Recorded prior activity deductions retain their original history here;
    // this current classification does not reconstruct or re-age past claims.
    const totalDeductions = sum(ordinary, shortTerm, longTerm, input.prior?.total ?? d(0));
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
    const charitable = input.charitable.map(row => ({ ...row, allowed: row.amountAfterBasis, suspended: d(0) }));
    audit.record('K1 Charitable At Risk', 'allocation', 'Original activity deductions allocated after basis', disallowedLoss,
        'IRC465(c),(d): only actual activity deductions participate; ordinary section170 gifts are separate. Allocate actual disallowed activity loss over activity deductions, retaining original prior history.',
        { 'Activity deductions after basis': totalDeductions, 'Retained activity income': totalIncome, 'Actual at-risk amount': worksheet.amountAtRisk,
            'Disallowed activity loss': disallowedLoss, 'Ordinary suspended at risk': ordinarySuspended,
            'Short-term suspended at risk': shortTermSuspended, 'Long-term suspended at risk': longTermSuspended,
            'Charitable suspended at risk': sum(...charitable.map(row => row.suspended), priorSum('charitable', 'suspended')),
            'Charity available for section170': sum(...charitable.map(row => row.allowed), priorSum('charitable', 'allowed')) });
    audit.record('K1 Charitable At Risk', 'ordinary-gifts', 'Ordinary gifts outside the current activity loss', sum(...charitable.map(row => row.allowed)),
        'Final Reg1.702-1(a)(4),1.703-1(a)(2)(iv) and1.1366-1(a)(2)(iii): basis-admitted ordinary gifts retain their original section170 character, with no current activity suspension');
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
