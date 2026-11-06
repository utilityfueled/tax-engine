import type { TaxYearInput } from '@/models/inputs.js';
import { parseGuidedCurrency } from './guided-currency';
import { buildGuidedForeignTaxDirectCredit, type ForeignDirectCreditData, type ForeignCreditKnownResidency } from './guided-foreign-tax-direct-credit';
import { buildGuidedForeignTaxAllocation } from './guided-foreign-tax-carryover';

type EngineOrdinary = NonNullable<NonNullable<TaxYearInput['foreignTaxElection']>['creditWithForm1116']>;
type EnginePrior = NonNullable<EngineOrdinary['regularCarryback']>;
export type ForeignOrdinaryPriorData = Omit<EnginePrior, 'taxYear'> & { taxYear?: string };
export type ForeignOrdinaryIncomeData = NonNullable<EngineOrdinary['incomeSources']>[number];
export type ForeignOrdinaryCreditData = Omit<EngineOrdinary, keyof ForeignDirectCreditData | 'sourceTaxYear' | 'amt' | 'regularCarryback' | 'amtCarryback'> & ForeignDirectCreditData & {
  sourceTaxYear?: string;
  amt?: Omit<NonNullable<EngineOrdinary['amt']>, 'firstPost1997CreditClaimTaxYear'> & { firstPost1997CreditClaimTaxYear?: string };
  regularCarryback?: ForeignOrdinaryPriorData;
  amtCarryback?: ForeignOrdinaryPriorData;
};
const yearValue = (value: string | undefined, label: string) => {
  if (!/^\d{4}$/.test(value ?? '')) throw new Error(`Enter the actual four-digit ${label}.`);
  return Number(value);
};
const money = (value: string | undefined, label: string) => {
  if (!value?.trim()) throw new Error(`Enter the actual ${label}, including known zero.`);
  const amount = parseGuidedCurrency(value);
  if (!amount.isFinite() || amount.lt(0)) throw new Error(`The actual ${label} must be finite and nonnegative.`);
  return amount.toFixed();
};
function prior(record: ForeignOrdinaryPriorData | undefined): EnginePrior | undefined {
  if (!record) return undefined;
  return { ...record, taxYear: yearValue(record.taxYear, 'prior return year'),
    ...Object.fromEntries((['limitation', 'currentTaxes', 'priorCarryoversUsed'] as const).filter(key => record[key] !== undefined)
      .map(key => [key, money(record[key], `prior return ${key}`)])) };
}
/** Actual source normalization only. The canonical return supplies both current tax limits. */
export function buildGuidedForeignTaxOrdinaryCredit(data: ForeignOrdinaryCreditData | undefined, year: number, known?: ForeignCreditKnownResidency): EngineOrdinary | undefined {
  if (!data) return undefined;
  const common = buildGuidedForeignTaxDirectCredit(data, known, 'ordinary foreign-credit worksheet');
  if (!common) throw new Error('Complete the actual ordinary foreign-credit source history.');
  if (yearValue(data.sourceTaxYear, 'ordinary credit source year') !== year) throw new Error('Match the actual ordinary foreign-credit source year to this return.');
  const incomeSources = data.incomeSources?.map(row => ({ ...row, reportedIncome: money(row.reportedIncome, 'original statement income'), foreignIncome: money(row.foreignIncome, 'foreign ordinary income') }));
  const amt = data.amt ? { ...data.amt, firstPost1997CreditClaimTaxYear: yearValue(data.amt.firstPost1997CreditClaimTaxYear, 'first AMT credit claim year') } : undefined;
  const regularCarryback = prior(data.regularCarryback), amtCarryback = prior(data.amtCarryback);
  if (amt && amtCarryback?.election === 'form1116_credit' && amtCarryback.currentTaxes !== undefined && amtCarryback.limitation !== undefined && amtCarryback.priorCarryoversUsed !== undefined
    && (parseGuidedCurrency(amtCarryback.currentTaxes).gt(0) && parseGuidedCurrency(amtCarryback.limitation).gt(0) || parseGuidedCurrency(amtCarryback.priorCarryoversUsed).gt(0))
    && amt.firstPost1997CreditClaimTaxYear > (amtCarryback.taxYear ?? year)) throw new Error('The first AMT credit claim year conflicts with actual prior allowed credit.');
  return { ...data, ...common, adjustedThroughTaxYear: common.adjustedThroughTaxYear, carryovers: common.carryovers, amtCarryovers: common.amtCarryovers,
    sourceTaxYear: year, incomeSources, amt, regularCarryback, amtCarryback,
    itemizedAllocation: buildGuidedForeignTaxAllocation(data.itemizedAllocation, incomeSources ?? []), sourceFactsConfirmed: true };
}
