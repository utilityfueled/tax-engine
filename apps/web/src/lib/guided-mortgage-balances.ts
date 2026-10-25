import type { MortgageInterestWorksheet } from '@/models/inputs';
import type { MortgageEntryData } from './guided-interview-flow';
import { amountError, hasEnteredAmount } from './guided-required-facts';
import { parseGuidedCurrency } from './guided-currency';
import { buildGuidedMortgageDebtCategories } from './guided-mortgage-debt-categories';

export interface MortgageFirstLastData {
  firstBalance?: string; lastBalance?: string; noAdditionalBorrowing?: boolean | null;
  noPrepaymentOverOneMonth?: boolean | null; levelPaymentsAtLeastSemiannually?: boolean | null;
}
export interface MortgageMonthlyData {
  statementBasis?: '' | 'closing' | 'average'; qualifiedHomeMonths?: string[]; allMonthsIncluded?: boolean | null;
  balances?: Array<{ month?: string; amount?: string }>;
}
export interface MortgageInterestRateData {
  currentYearInterest?: string; currentYearInterestPaidInPriorYears?: string; currentYearInterestPaidInPriorYearsByOthers?: string;
  interestRefundedToOthers?: string; lowestAnnualRate?: string; securedAllYear?: boolean | null; interestPaidAtLeastMonthly?: boolean | null;
}
function money(value: string | undefined, label: string): string {
  const error = amountError(value, label); if (error) throw new Error(error);
  return parseGuidedCurrency(value).toFixed();
}
function actualTrue(value: boolean | null | undefined, label: string): true {
  if (value !== true) throw new Error(`The selected mortgage balance method requires actual confirmation of ${label}.`);
  return true;
}
function month(value: string | undefined): number {
  if (!value || !/^(?:[1-9]|1[0-2])$/.test(value)) throw new Error('Select an actual mortgage source month from January through December.');
  return Number(value);
}
export function buildGuidedMortgageBalance(entry: MortgageEntryData): MortgageInterestWorksheet['loans'][number]['balance'] {
  if (entry.balanceMethod === 'category_worksheet') return buildGuidedMortgageDebtCategories(entry);
  if (!entry.balanceSourceReference?.trim()) throw new Error('Enter the actual annual balance source reference.');
  const maximum = hasEnteredAmount(entry.maximumBalanceDuringYear) ? money(entry.maximumBalanceDuringYear, 'known maximum mortgage balance') : undefined;
  const sourceBalance = (value: string | undefined, label: string) => {
    const amount = money(value, label);
    if (maximum !== undefined && parseGuidedCurrency(amount).gt(maximum)) throw new Error('The actual balance exceeds the saved maximum balance; reconcile the original sources.');
    return amount;
  };
  switch (entry.balanceMethod) {
    case 'highest_balance':
      return { method: 'highest_balance', amount: money(entry.maximumBalanceDuringYear, 'maximum actual mortgage balance'), sourceReference: entry.balanceSourceReference.trim() };
    case 'lender_average':
      return { method: 'lender_average', amount: sourceBalance(entry.lenderAverageBalance, 'actual lender annual average'), sourceReference: entry.balanceSourceReference.trim() };
    case 'first_last': {
      const data = entry.balanceFirstLast;
      return { method: 'first_last', firstBalance: sourceBalance(data?.firstBalance, 'first secured-day balance'), lastBalance: sourceBalance(data?.lastBalance, 'last secured-day balance'),
        noAdditionalBorrowing: actualTrue(data?.noAdditionalBorrowing, 'no additional borrowing other than the original loan'),
        noPrepaymentOverOneMonth: actualTrue(data?.noPrepaymentOverOneMonth, 'no prepayment of more than one month of principal'),
        levelPaymentsAtLeastSemiannually: actualTrue(data?.levelPaymentsAtLeastSemiannually, 'level payments at fixed intervals at least semiannually') };
    }
    case 'monthly': {
      const data = entry.balanceMonthly;
      if (data?.statementBasis !== 'closing' && data?.statementBasis !== 'average') throw new Error('Identify the actual closing or average balances on the monthly lender statements.');
      actualTrue(data.allMonthsIncluded, 'all actual qualified-home months included');
      if (!data.qualifiedHomeMonths?.length || !data.balances?.length) throw new Error('Enter every actual qualified-home month and its original lender balance.');
      const months = data.qualifiedHomeMonths.map(month);
      const balances = data.balances.map(row => ({ month: month(row.month), amount: sourceBalance(row.amount, 'monthly source balance') }));
      if (new Set(months).size !== months.length || balances.length !== months.length || new Set(balances.map(row => row.month)).size !== months.length || balances.some(row => !months.includes(row.month))) throw new Error('Reconcile exactly one original balance for every actual qualified-home month.');
      return { method: 'monthly', qualifiedHomeMonths: months, balances };
    }
    case 'interest_rate': {
      const data = entry.balanceInterestRate;
      return { method: 'interest_rate', currentYearInterest: money(data?.currentYearInterest, 'actual current-year interest for the balance method'),
        currentYearInterestPaidInPriorYears: money(data?.currentYearInterestPaidInPriorYears, 'this return current-year interest paid in prior years'),
        currentYearInterestPaidInPriorYearsByOthers: money(data?.currentYearInterestPaidInPriorYearsByOthers, 'other returns current-year interest paid in prior years'),
        interestRefundedToOthers: money(data?.interestRefundedToOthers, 'current-year interest refunded to other returns'),
        lowestAnnualRate: money(data?.lowestAnnualRate, 'actual lowest annual decimal interest rate'),
        securedAllYear: actualTrue(data?.securedAllYear, 'mortgage secured by the qualified home throughout the year'),
        interestPaidAtLeastMonthly: actualTrue(data?.interestPaidAtLeastMonthly, 'interest paid at least monthly') };
    }
    default: throw new Error('Select the actual mortgage balance method; Box 2 cannot establish it.');
  }
}
