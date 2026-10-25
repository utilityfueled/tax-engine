import type { MortgageInterestWorksheet } from '@/models/inputs';
import type { MortgageEntryData } from './guided-interview-flow';
import { mortgagePointFacts } from './guided-mortgage-facts';
import { amountError, isActualDate } from './guided-required-facts';
import { parseGuidedCurrency } from './guided-currency';

export interface MortgagePointsHistoryData {
  sourceTaxYear?: string; sourceReference?: string; originalLender?: string; originalAccountReference?: string; paidDate?: string;
  originalPoints?: string; originalPrincipal?: string; priorPointsDeducted?: string; unamortizedPointsAtStartOfYear?: string;
  loanTermMonths?: string; paymentsInYear?: string; paymentIntervalMonths?: string;
  cashMethod?: boolean | null; comparableLoanTerms?: boolean | null; pointsAreInterest?: boolean | null; historyConfirmed?: boolean | null;
  completedMethod?: '' | 'ongoing_amortization' | 'early_termination' | 'same_lender_refinancing' | 'qualified_improvement_allocation';
  deductibleAmountBeforeLimit?: string; unamortizedPointsAvailable?: string; serviceFeesExcludedConfirmed?: boolean | null; reportedOnCurrentForm1098?: boolean | null;
  completedMethodConfirmed?: boolean | null; endingDate?: string; sameLenderRefinance?: boolean | null;
  newLoanReference?: string; newLoanTermMonths?: string; sameLenderBalanceSpreadConfirmed?: boolean | null;
}
type Points = MortgageInterestWorksheet['loans'][number]['points'];
function money(value: string | undefined, label: string): string {
  const error = amountError(value, label); if (error) throw new Error(error);
  return parseGuidedCurrency(value).toFixed();
}
function integer(value: string | undefined, label: string, minimum: number, maximum: number): number {
  if (!/^\d+$/.test(value ?? '') || !Number.isSafeInteger(Number(value)) || Number(value) < minimum || Number(value) > maximum) throw new Error(`Enter the actual ${label} within the supported source range.`);
  return Number(value);
}
function confirmed(value: boolean | null | undefined, label: string): true {
  if (value !== true) throw new Error(`Confirm the actual mortgage points ${label} from the original records.`);
  return true;
}
/** Original history is reconciled before the existing points calculator runs. */
export function buildGuidedMortgagePoints(entry: MortgageEntryData, taxYear: number): Points {
  const paid = parseGuidedCurrency(money(entry.pointsPaidByReturnAmount, 'actual points share'));
  const fees = parseGuidedCurrency(money(entry.pointsNotInterest, 'actual points service fees'));
  if (fees.gt(paid)) throw new Error('Points service fees exceed this return’s actual paid share.');
  const eligible = paid.minus(fees), source = entry.pointsHistory;
  const method = entry.pointsMethod;
  if (!method) throw new Error('Choose the actual mortgage points method; saved history cannot be treated as no claim.');
  if (method === 'none') {
    if (eligible.gt(0) || source) throw new Error('Reconcile the original positive points or saved points history before selecting no points claim.');
    return { method: 'none' };
  }
  if (method === 'current_year') {
    if (source) throw new Error('Reconcile saved amortization history before using only the current-year points method.');
    if (entry.loanType !== 'original' || entry.propertyUse !== 'main-home' || !entry.originationDate.startsWith(`${taxYear}-`)) throw new Error('Full current-year purchase points require the actual original main-home loan in this year. Refinancing needs its source worksheet.');
    if (!isActualDate(entry.pointsPaidDate) || !entry.pointsPaidDate?.startsWith(`${taxYear}-`) || !['purchase', 'build'].includes(entry.pointsUse ?? '')) throw new Error('Enter the actual current-year points payment date and main-home purchase or construction use.');
    for (const key of Object.keys(mortgagePointFacts) as (keyof typeof mortgagePointFacts)[]) confirmed(entry[key], 'full-deduction qualification');
    return { method: 'current_year', cashMethod: true, establishedPractice: true, withinUsualAmount: true, notServiceFees: true, ownFundsSufficient: true,
      buyBuildOrImproveMainHome: entry.pointsUse === 'purchase' ? 'purchase' : 'build', percentageOfPrincipal: true, onSettlementStatement: true, fullDeductionElected: true, paidDate: entry.pointsPaidDate };
  }
  if (!source || source.sourceTaxYear !== String(taxYear) || !source.sourceReference?.trim() || !source.originalLender?.trim() || !source.originalAccountReference?.trim()) throw new Error('Enter the actual points worksheet year/reference and original loan identity.');
  if (!isActualDate(source.paidDate) || typeof source.paidDate !== 'string' || source.paidDate > `${taxYear}-12-31`) throw new Error('Enter the actual original points payment date, no later than this source year.');
  if (entry.loanType === 'original' && source.paidDate < entry.originationDate) throw new Error('Points paid before the represented original loan date require their actual prior-loan or refinancing history.');
  const originalPoints = money(source.originalPoints, 'actual original points excluding service fees');
  const originalPrincipal = money(source.originalPrincipal, 'actual original points loan principal');
  if (parseGuidedCurrency(originalPrincipal).lte(0)) throw new Error('Actual original points principal must be positive.');
  const prior = parseGuidedCurrency(money(source.priorPointsDeducted, 'actual points deducted before this year'));
  const beginning = parseGuidedCurrency(money(source.unamortizedPointsAtStartOfYear, 'actual beginning unamortized points'));
  const original = parseGuidedCurrency(originalPoints), current = source.paidDate.startsWith(`${taxYear}-`);
  if (current ? !prior.isZero() || !beginning.isZero() || !original.eq(eligible) : prior.gt(original) || !original.minus(prior).eq(beginning)) throw new Error('Original points, prior deductions and actual beginning history do not reconcile to the current source.');
  const cashMethod = confirmed(source.cashMethod, 'cash accounting method');
  const pointsAreInterest = confirmed(source.pointsAreInterest, 'interest qualification excluding service charges');
  confirmed(source.historyConfirmed, 'original loan, statement, ownership/payment share and prior deduction history');
  if (method === 'ratable') {
    if (!current && !eligible.isZero()) throw new Error('Mixed prior and current points cohorts need separate reported/unreported allocation records.');
    const loanTermMonths = integer(source.loanTermMonths, 'original loan term in months', 1, 360);
    const paymentsInYear = integer(source.paymentsInYear, 'number of payments this year', 0, 12);
    const paymentIntervalMonths = integer(source.paymentIntervalMonths, 'months between payments', 1, 12);
    if (typeof source.comparableLoanTerms !== 'boolean') throw new Error('Confirm actual comparable-loan terms; unknown is not false.');
    return { method: 'ratable', originalPoints, originalPrincipal, loanTermMonths, paymentsInYear, paymentIntervalMonths, unamortizedPointsAtStartOfYear: beginning.toFixed(), cashMethod, comparableLoanTerms: source.comparableLoanTerms, pointsAreInterest, paidDate: source.paidDate };
  }
  if (method !== 'completed_amortization') throw new Error('The entered mortgage points method is unsupported.');
  if (!['ongoing_amortization', 'early_termination', 'same_lender_refinancing', 'qualified_improvement_allocation'].includes(source.completedMethod ?? '')) throw new Error('Choose the actual completed points worksheet method.');
  confirmed(source.completedMethodConfirmed, 'completed amortization method and deduction before the home-debt limitation');
  const serviceFeesExcludedConfirmed = confirmed(source.serviceFeesExcludedConfirmed, 'completed worksheet service-fee exclusion');
  if (typeof source.reportedOnCurrentForm1098 !== 'boolean') throw new Error('Confirm whether the completed points amount is actually reported on the current Form1098.');
  if (beginning.gt(0) && eligible.gt(0)) throw new Error('Mixed prior unreported and current reported points cohorts require their separate allocation method.');
  const available = money(source.unamortizedPointsAvailable, 'actual points available in the completed worksheet');
  if (!parseGuidedCurrency(available).eq(beginning.plus(eligible))) throw new Error('Completed points available do not reconcile to actual beginning history and current paid points.');
  const deduction = money(source.deductibleAmountBeforeLimit, 'completed points deduction before the home-debt limit');
  if (source.reportedOnCurrentForm1098 ? !current || beginning.gt(0) : eligible.gt(0)) throw new Error('The completed reported/unreported points claim conflicts with the original current statement and prior history.');
  if (source.completedMethod === 'qualified_improvement_allocation' && (!current || entry.propertyUse !== 'main-home' || entry.proceedsUse === 'other')) throw new Error('An immediate improvement allocation requires current-year qualified main-home improvement sources.');
  if (source.completedMethod === 'early_termination' || source.completedMethod === 'same_lender_refinancing') {
    if (!isActualDate(source.endingDate) || !source.endingDate?.startsWith(`${taxYear}-`) || source.endingDate < source.paidDate) throw new Error('Enter the actual current-year mortgage ending or refinancing date.');
    if (typeof source.sameLenderRefinance !== 'boolean') throw new Error('Confirm whether the mortgage was refinanced with the same lender.');
    if (source.completedMethod === 'early_termination') {
      if (source.sameLenderRefinance) throw new Error('A same-lender refinance cannot accelerate remaining points; its actual spreading worksheet is required.');
      if (!parseGuidedCurrency(deduction).eq(available)) throw new Error('The early-termination worksheet must reconcile the actual remaining points before the debt limit.');
    } else {
      if (!source.sameLenderRefinance || !source.newLoanReference?.trim()) throw new Error('Enter the actual same-lender refinancing and new loan source reference.');
      integer(source.newLoanTermMonths, 'new loan term in months', 1, 1200);
      confirmed(source.sameLenderBalanceSpreadConfirmed, 'remaining balance spread over the new loan term without early acceleration');
    }
  }
  return { method: 'completed_amortization', deductibleAmountBeforeLimit: deduction, unamortizedPointsAvailable: available, sourceTaxYear: taxYear,
    worksheetReference: source.sourceReference.trim(), serviceFeesExcludedConfirmed, reportedOnCurrentForm1098: source.reportedOnCurrentForm1098 };
}
