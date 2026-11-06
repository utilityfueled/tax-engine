import { operatingK1CharitableOriginInput } from './form-172-operating-k1.js';
import { k1CharitableQbiFixture, k1CharitableReturnFixture, charitableStatement } from './k1-charitable-return.js';

export function requireRiskSource<T>(value: T | null | undefined): T {
    if (value === undefined || value === null) throw new Error('Missing explicit fictional at-risk source');
    return value;
}

/** Fictional original Form6198 activity statement; never a calculated allowance. */
export function attachCharitableActivity(input: ReturnType<typeof k1CharitableReturnFixture>) {
    const source = charitableStatement(input);
    Object.assign(requireRiskSource(source.atRisk), { activityAllocation: {
        sourceTaxYear: input.taxpayer.taxYear,
        sourceReference: 'Fictional item-by-item original activity assignment',
        sourceFactsConfirmed: true,
        allOriginalItemsBelongToActivityConfirmed: true,
        charitableSourceIds: [],
    } });
    return input;
}

export function k1CharitableAtRiskFixture(basisBinding = false, separateGain = false) {
    const input = k1CharitableQbiFixture(), source = charitableStatement(input), k = input.scheduleK1[0], q = requireRiskSource(requireRiskSource(input.qbiLossSources).activities)[0];
    const ordinary = basisBinding ? '-80000' : '-40000', gift = basisBinding ? '20000' : '10000';
    const basis = separateGain ? '40000' : '50000', risk = separateGain ? '15000' : '25000';
    Object.assign(k, { ordinaryIncome: ordinary, section199AQBI: ordinary, charitableCash: gift,
        beginningBasis: basis, netLongTermCapitalGain: separateGain ? '10000' : '0' });
    Object.assign(requireRiskSource(q.statement), { ordinaryIncome: ordinary, section199AQBI: ordinary });
    requireRiskSource(q.basis).beginningBasis = basis;
    requireRiskSource(q.atRisk).priorYearAmountAtRisk = risk;
    Object.assign(requireRiskSource(k.form6198), { ordinaryIncome: '-40000', gainLossFromDispositions: separateGain ? '10000' : '0', otherDeductionsLosses: '0', priorYearAmountAtRisk: risk });
    requireRiskSource(source.atRisk).priorYearAmountAtRisk = risk;
    Object.assign(requireRiskSource(requireRiskSource(source.basis).currentContributions)[0], { contributionShare: gift, adjustedBasisShare: gift });
    return attachCharitableActivity(input);
}

export function k1CharitablePropertyRiskFixture() {
    const input = k1CharitableReturnFixture(), source = charitableStatement(input), k = input.scheduleK1[0];
    Object.assign(k, { entityType: 's_corporation', beginningBasis: '80', ordinaryIncome: '0', netLongTermCapitalGain: '-25', charitableCapitalGain30: '190', beginningDebtBasis: '0', additionalLoansToScorp: '0', priorDebtBasisReduction: '0' });
    requireRiskSource(source.basis).entityType = 's_corporation';
    Object.assign(requireRiskSource(requireRiskSource(source.basis).currentContributions)[0], { contributionShare: '190', adjustedBasisShare: '100' });
    Object.assign(requireRiskSource(source.receipts)[0], { originalBox: '12', fairMarketValueShare: '190' });
    Object.assign(requireRiskSource(k.form6198), { gainLossFromDispositions: '-16', otherDeductionsLosses: '0', priorYearAmountAtRisk: '85' });
    requireRiskSource(source.atRisk).priorYearAmountAtRisk = '85';
    return attachCharitableActivity(input);
}

export function k1CharitableRiskOriginFixture(year = 2025) {
    const input = operatingK1CharitableOriginInput(false, year), source = charitableStatement(input);
    Object.assign(requireRiskSource(input.scheduleK1[0].form6198), { otherDeductionsLosses: '0', priorYearAmountAtRisk: '25000' });
    requireRiskSource(source.atRisk).priorYearAmountAtRisk = '25000'; requireRiskSource(requireRiskSource(requireRiskSource(input.qbiLossSources).activities)[0].atRisk).priorYearAmountAtRisk = '25000';
    requireRiskSource(requireRiskSource(input.form172).businessSources)[0].allInvestmentAtRisk = false;
    return attachCharitableActivity(input);
}
