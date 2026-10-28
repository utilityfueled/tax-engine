import { TaxYearInputSchema, type TaxYearInput } from '@/models/inputs';
import { currentCharitableOriginInput } from './form-172-charitable-origin';
import { currentOriginInput } from './form-172-origin';
import { k1CharitableQbiFixture, charitableStatement } from './k1-charitable-return';
import { k1QbiLossSourceInput } from './k1-qbi-loss-sources';

export function requireOperatingSource<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Missing fictional original operating source');
  return value;
}
function attachOperatingSources(input: TaxYearInput, original: TaxYearInput) {
  input.scheduleC = undefined;
  input.scheduleK1 = original.scheduleK1;
  input.qbiLossSources = original.qbiLossSources;
  input.k1CharitableSources = original.k1CharitableSources;
  requireOperatingSource(input.priorYear).suspendedPassiveLosses = requireOperatingSource(original.priorYear).suspendedPassiveLosses;
  const qbi = requireOperatingSource(input.qbiLossSources);
  Object.assign(requireOperatingSource(qbi.priorQbiCarry), { sourceTaxYear: input.taxpayer.taxYear - 1,
    primaryName: 'Jane Doe', returnSourceId: `fictional-jane-doe-${input.taxpayer.taxYear - 1}` });
  requireOperatingSource(input.priorYear).qbiLossCarryforward = '0';
  qbi.form461Classification = { method: 'ordinary_k1_only', sourceTaxYear: input.taxpayer.taxYear,
    sourceReference: 'Fictional original complete ordinary business classification', sourceFactsConfirmed: true,
    allNonEmployeeBusinessSourcesIncluded: true, capitalIncomeIsNonbusiness: true, otherBusinessIncome: '0', otherBusinessDeductions: '0' };
  for (const source of requireOperatingSource(qbi.activities)) source.recipientName = 'Jane Doe';
  if (input.k1CharitableSources) requireOperatingSource(charitableStatement(input).basis).recipientName = 'Jane Doe';
  requireOperatingSource(input.form172).businessSources = input.scheduleK1.map((row, index) => ({ sourceId: `scheduleK1:${index}`,
    accountHolder: row.accountHolder, businessName: row.partnershipName, sourceReference: 'Fictional current operating participation records',
    sourceFactsConfirmed: true, materiallyParticipated: true, allInvestmentAtRisk: true, financialTradingBusiness: false }));
  return TaxYearInputSchema.parse(input);
}
export function operatingK1CharitableOriginInput(ebl = false, year = 2025) {
  const input = currentCharitableOriginInput('G', year); input.donations = [];
  const original = k1CharitableQbiFixture(), row = original.scheduleK1[0], q = requireOperatingSource(original.qbiLossSources?.activities)[0];
  const source = charitableStatement(original), gift = requireOperatingSource(source.basis?.currentContributions)[0];
  const loss = ebl ? '500000' : '80000', cash = ebl ? '10000' : '20000', basis = ebl ? '510000' : '50000';
  Object.assign(row, { ordinaryIncome: `-${loss}`, section199AQBI: `-${loss}`, beginningBasis: basis, charitableCash: cash });
  Object.assign(requireOperatingSource(q.statement), { ordinaryIncome: `-${loss}`, section199AQBI: `-${loss}` });
  requireOperatingSource(q.basis).beginningBasis = basis;
  requireOperatingSource(q.atRisk).priorYearAmountAtRisk = '1000000';
  requireOperatingSource(row.form6198).ordinaryIncome = ebl ? '-500000' : '-40000';
  requireOperatingSource(row.form6198).priorYearAmountAtRisk = '1000000';
  requireOperatingSource(source.atRisk).priorYearAmountAtRisk = '1000000';
  Object.assign(gift, { contributionShare: cash, adjustedBasisShare: cash });
  if (year === 2026) {
    original.taxpayer.taxYear = year; row.taxYear = year;
    requireOperatingSource(original.qbiLossSources).sourceTaxYear = year; q.sourceTaxYear = year;
    requireOperatingSource(q.basis).sourceTaxYear = year - 1; requireOperatingSource(q.atRisk).sourceTaxYear = year;
    requireOperatingSource(requireOperatingSource(q.atRisk).priorLossHistory).sourceTaxYear = year - 1;
    requireOperatingSource(requireOperatingSource(original.priorYear).suspendedPassiveLosses[0].qbiLossTracking).sourceTaxYear = year - 1;
    requireOperatingSource(original.k1CharitableSources).sourceTaxYear = year;
    Object.assign(requireOperatingSource(source.basis), { sourceTaxYear: year, statementYearStart: `${year}-01-01`, statementYearEnd: `${year}-12-31` });
    gift.contributionDate = `${year}-06-01`; requireOperatingSource(source.receipts)[0].contributionDate = `${year}-06-01`;
    requireOperatingSource(source.atRisk).sourceTaxYear = year;
    requireOperatingSource(requireOperatingSource(source.atRisk).priorLossHistory).sourceTaxYear = year - 1;
  }
  if (ebl) { input.deductionElection = 'standard'; input.scheduleA = undefined; input.form1099Int[0].interestIncome = '5000'; }
  return attachOperatingSources(input, original);
}
export function operatingK1OriginInput() {
  const input = attachOperatingSources(currentOriginInput(), k1QbiLossSourceInput());
  requireOperatingSource(requireOperatingSource(input.form172).businessSources)[0].allInvestmentAtRisk = false;
  return input;
}
