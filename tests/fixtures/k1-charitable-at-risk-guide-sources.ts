import { actualGuidedLinkedK1Charity } from './guided-k1-charitable-sources';
function required<T>(value: T | null | undefined): T { if (value == null) throw new Error('Missing fictional at-risk source'); return value; }
export function guidedK1CharitableAtRiskSources(separateGain = false) {
    const { charity, qualifiedLoss } = actualGuidedLinkedK1Charity(), source = required(charity.statements)[0], q = required(qualifiedLoss.activities)[0];
    Object.assign(required(q.statement), { ordinaryIncome: '-80000', section199AQBI: '-80000', selfEmploymentEarnings: '-80000' });
    required(q.basis).beginningBasis = separateGain ? '40000' : '50000'; required(q.atRisk).priorYearAmountAtRisk = separateGain ? '15000' : '25000';
    Object.assign(required(source.original), { ordinaryIncome: '-80000', section199AQBI: '-80000', selfEmploymentEarnings: '-80000',
        selfEmploymentNetEarningsAfterAdjustments: '-20000', charitableCash: '20000', beginningBasis: separateGain ? '40000' : '50000', netLongTermCapitalGain: separateGain ? '10000' : '0' });
    Object.assign(required(required(source.original).form6198), { ordinaryIncome: '-40000', gainLossFromDispositions: separateGain ? '10000' : '0', otherDeductionsLosses: '10000', priorYearAmountAtRisk: separateGain ? '15000' : '25000' });
    Object.assign(required(required(source.basis).currentContributions)[0], { contributionShare: '20000', adjustedBasisShare: '20000' });
    Object.assign(required(source.atRisk), { priorYearAmountAtRisk: separateGain ? '15000' : '25000', activityAllocation: {
        sourceTaxYear: '2025', sourceReference: 'Fictional original activity membership attachment', sourceFactsConfirmed: true,
        allOriginalItemsBelongToActivityConfirmed: true, charitableSourceIds: ['original-gift-1'] } });
    if (separateGain) q.allOtherNonCharitableAmountsZeroConfirmed = false;
    return { charity, qualifiedLoss };
}
