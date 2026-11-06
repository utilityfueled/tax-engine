import { guidedCurrentCharitableOriginals } from './guided-form-172-charitable-origin-sources';
import { actualGuidedLinkedK1Charity } from './guided-k1-charitable-sources';
function required<T>(value: T | null | undefined): T { if (value == null) throw new Error('Missing fictional operating source'); return value; }
/** Shared fictional originals for browser and unit checks; no calculated results. */
export function operatingK1GuideSources() {
  const sources = guidedCurrentCharitableOriginals(), { charity, qualifiedLoss } = actualGuidedLinkedK1Charity();
  const q = required(qualifiedLoss.activities)[0], source = required(charity.statements)[0];
  Object.assign(required(q.statement), { ordinaryIncome: '-80000', section199AQBI: '-80000', selfEmploymentEarnings: '-80000' });
  required(q.basis).beginningBasis = '50000'; required(q.atRisk).priorYearAmountAtRisk = '1000000';
  Object.assign(required(source.original), { ordinaryIncome: '-80000', section199AQBI: '-80000', selfEmploymentEarnings: '-80000',
    selfEmploymentNetEarningsAfterAdjustments: '-40000', beginningBasis: '50000', charitableCash: '20000' });
  Object.assign(required(required(source.original).form6198), { ordinaryIncome: '-40000', priorYearAmountAtRisk: '1000000' });
  required(source.atRisk).priorYearAmountAtRisk = '1000000';
  Object.assign(required(required(source.basis).currentContributions)[0], { contributionShare: '20000', adjustedBasisShare: '20000' });
  sources.current.businessSources = [{ sourceId: 'scheduleK1:0', businessName: q.entityName, accountHolder: 'primary',
    sourceReference: 'Fictional actual operating business participation', sourceFactsConfirmed: true,
    materiallyParticipated: true, allInvestmentAtRisk: true, financialTradingBusiness: false }];
  return { ...sources, charity, qualifiedLoss };
}
