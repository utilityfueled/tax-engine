/** Actual activity items after basis; spec/federal/k1-charitable-at-risk.yaml. */
import Decimal from 'decimal.js';
import type { Form6198Input } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import type { CharitableCategory } from './charitable-contribution-worksheet.js';
import { calculateForm6198, type Form6198Result } from './form-6198.js';
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
}): K1CharitableAtRiskResult {
    const worksheet = calculateForm6198(input.form), audit = new AuditTrail();
    if (worksheet.amountAtRisk.lt(0)) throw new Error('K1 charitable at-risk recapture requires its separate source history');
    const negative = (value: Decimal) => Decimal.max(0, value.negated());
    const ordinary = negative(input.ordinaryAmount), shortTerm = negative(input.shortTermAmount), longTerm = negative(input.longTermAmount);
    const totalDeductions = sum(ordinary, shortTerm, longTerm, ...input.charitable.map(row => row.amountAfterBasis));
    const totalIncome = sum(Decimal.max(0, input.ordinaryAmount), Decimal.max(0, input.shortTermAmount), Decimal.max(0, input.longTermAmount), input.distributionGain, d(input.form.otherIncomeGains));
    if (!totalIncome.minus(totalDeductions).eq(worksheet.line5)) throw new Error('K1 charitable at-risk original activity totals do not reconcile');
    const disallowedLoss = worksheet.suspendedLoss;
    // Allocate the disallowed amount over deductions, not over net loss. Income
    // remains reportable. There is no cash/property or source-order preference.
    const suspended = (item: Decimal) => totalDeductions.isZero() ? d(0) : item.times(disallowedLoss).div(totalDeductions);
    const ordinarySuspended = suspended(ordinary), shortTermSuspended = suspended(shortTerm), longTermSuspended = suspended(longTerm);
    const charitable = input.charitable.map(row => {
        const removed = suspended(row.amountAfterBasis);
        return { ...row, allowed: row.amountAfterBasis.minus(removed), suspended: removed };
    });
    audit.record('K1 Charitable At Risk', 'allocation', 'Original activity deductions allocated after basis', disallowedLoss,
        'Reg1.469-2T(d)(6)(iii)-(iv): each remaining deduction times disallowed section465 loss divided by all remaining activity deductions',
        { 'Activity deductions after basis': totalDeductions, 'Retained activity income': totalIncome, 'Actual at-risk amount': worksheet.amountAtRisk,
            'Disallowed activity loss': disallowedLoss, 'Ordinary suspended at risk': ordinarySuspended,
            'Short-term suspended at risk': shortTermSuspended, 'Long-term suspended at risk': longTermSuspended,
            'Charitable suspended at risk': sum(...charitable.map(row => row.suspended)), 'Charity available for section170': sum(...charitable.map(row => row.allowed)) });
    return { totalDeductions, totalIncome, disallowedLoss, ordinaryAmount: input.ordinaryAmount.plus(ordinarySuspended),
        shortTermAmount: input.shortTermAmount.plus(shortTermSuspended), longTermAmount: input.longTermAmount.plus(longTermSuspended),
        ordinarySuspended, shortTermSuspended, longTermSuspended, charitable, worksheet, lines: audit.getLines() };
}
