/** Spec: spec/federal/mortgage-insurance-prepaid.yaml; 26CFR1.163-11. */
import type { TaxYearInput } from '@/models/inputs.js';
import { MortgageInsurancePrepaidSourcesSchema } from '@/models/mortgage-insurance-prepaid-sources.js';
import { calculateHomeMortgageInterest } from './home-mortgage-interest.js';
import { AuditTrail } from '@/utils/audit.js';
import { d } from '@/utils/decimal.js';

function actualDate(value: string, label: string): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Prepaid mortgage insurance requires an actual ${label} date`);
  }
  return value;
}
/** No side effects; validates the actual complete parent rather than a caller-supplied verification flag. */
export function calculateMortgageInsurancePrepaid(input: TaxYearInput, form1098SourceId: string) {
  if (input.taxpayer.taxYear !== 2026) throw new Error('Original prepaid mortgage insurance supports the finite current2026 method only');
  const forms = input.form1098.filter(form => form.sourceId === form1098SourceId);
  if (!form1098SourceId.trim() || forms.length !== 1) throw new Error('Prepaid mortgage insurance requires one unique actual Form1098 source');
  const form = forms[0]; const qualification = form.mortgageInsuranceQualification;
  const source = MortgageInsurancePrepaidSourcesSchema.parse(qualification?.prepaidSources);
  if (!qualification || qualification.allocationTaxYear !== 2026 || form.taxYear !== 2026 || form.sourceFactsComplete !== true
    || source.form1098SourceId !== form.sourceId || source.lenderName !== form.lender
    || source.loanAccountReference !== form.loanAccountReference || !form.loanAccountReference?.trim()) {
    throw new Error('Prepaid mortgage insurance Form1098 source year, lender and account must reconcile');
  }
  const worksheet = input.mortgageInterestWorksheet;
  if (!worksheet || !calculateHomeMortgageInterest(input).sourceFactsVerified) throw new Error('Prepaid mortgage insurance requires the actual complete canonical mortgage source worksheet');
  const loans = worksheet.loans.filter(loan => loan.sourceId === source.mortgageLoanSourceId);
  if (loans.length !== 1) throw new Error('Prepaid mortgage insurance requires one unique actual mortgage loan');
  const loan = loans[0];
  const lenderIdentity = source.lenderName.trim().replace(/\s+/g, ' ').toLowerCase();
  const accountIdentity = source.loanAccountReference.trim().toLowerCase();
  const sameAccount = (lender: string, account: string | undefined) =>
    lender.trim().replace(/\s+/g, ' ').toLowerCase() === lenderIdentity && account?.trim().toLowerCase() === accountIdentity;
  if (input.form1098.filter(item => sameAccount(item.lender, item.loanAccountReference)).length !== 1
    || worksheet.loans.filter(item => sameAccount(item.lenderName, item.loanAccountReference)).length !== 1) {
    throw new Error('Prepaid mortgage insurance requires a unique physical lender account across Form1098 and mortgage loan sources');
  }
  if (loan.form1098SourceId !== source.form1098SourceId || loan.lenderName !== source.lenderName
    || loan.loanAccountReference !== source.loanAccountReference || !loan.loanAccountReference?.trim()
    || loan.accountHolder !== source.payer || loan.loanType !== 'original' || !loan.acquisitionUse
    || loan.balance.method === 'category_worksheet' || !d(loan.interestPaidByOthers).isZero() || !d(loan.pointsPaidByOthers).isZero()
    || !d(loan.interestDeductedElsewhere).isZero() || !d(loan.nonqualifiedInterest).isZero()
    || !loan.qualifiedResidence || !loan.securedDebt || !loan.ownershipInterest || !loan.obligationToRepay
    || !['main', 'second'].includes(loan.homeUse)
    || !qualification.qualifiedProvider || !qualification.acquisitionDebt || !qualification.qualifiedResidence) {
    throw new Error('Prepaid mortgage insurance ownership, account, acquisition and residence source facts must reconcile');
  }
  const closing = actualDate(loan.originationDate, 'original mortgage closing');
  const obtained = actualDate(source.insuranceObtainedDate, 'insurance obtained');
  const paid = actualDate(source.paidDate, 'premium paid');
  const issued = actualDate(qualification.contractIssueDate, 'contract issued');
  if (!closing.startsWith('2026-') || obtained !== closing || paid !== closing || issued !== closing || form.mortgageOriginationDate !== closing) {
    throw new Error('Prepaid mortgage insurance requires reconciled actual current2026 original closing, insurance, contract and payment dates');
  }
  const actualBalance = loan.balance;
  if (actualBalance.method === 'first_last' && d(actualBalance.lastBalance).isZero()) {
    throw new Error('The actual last mortgage balance contradicts the outstanding original mortgage source');
  }
  // Current-year original Box2 is origination or lender-acquisition principal; neither can exceed the actual annual maximum.
  if (actualBalance.method === 'highest_balance' && d(actualBalance.amount).lt(d(form.outstandingMortgagePrincipal))) {
    throw new Error('The actual highest mortgage balance cannot be below the original Form1098 principal');
  }
  const firstMonth = Number(obtained.slice(5, 7));
  const monthsInYear = 13 - firstMonth;
  if (source.statedTermMonths < monthsInYear) throw new Error('A stated term ending before year end is outside the outstanding original mortgage method');
  const allocationPeriodMonths = Math.min(source.statedTermMonths, 84);
  const allocationMonths = Math.min(allocationPeriodMonths, monthsInYear);
  // Multiply before dividing. Never round a monthly quotient or individual allocation.
  const allocatedPremium = d(source.prepaidPremiumPaid).times(allocationMonths).div(allocationPeriodMonths);
  if (qualification.premiumsAllocableToYear !== undefined) {
    const entered = d(qualification.premiumsAllocableToYear);
    if (!entered.isFinite() || entered.lt(0) || !entered.eq(allocatedPremium)) throw new Error('Entered annual mortgage insurance allocation must reconcile exactly to original sources');
  }
  const audit = new AuditTrail();
  audit.record('Prepaid Mortgage Insurance', 'annual-allocation', 'Actual original prepaid premium allocated to this year', allocatedPremium,
    'Actual premium × actual calendar months / min(stated mortgage term months,84); no monthly rounding',
    { premium: d(source.prepaidPremiumPaid), allocationMonths: d(allocationMonths), allocationPeriodMonths: d(allocationPeriodMonths) });
  return { taxYear: 2026, sourceFactsVerified: true, allocatedPremium, allocationMonths, allocationPeriodMonths, lines: audit.getLines() };
}
