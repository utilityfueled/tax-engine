/** Guided source entry only; canonical ScheduleAI/Form4952 calculators remain authoritative. */
import Decimal from 'decimal.js';
import { AMTCapitalGainsSchema, Form4952InputSchema, type TaxYearInput } from '@/models/inputs';
import { calculateForm4952 } from '@/engine/forms/form-4952';
import { parseGuidedCurrency } from './guided-currency';
import {buildEstimatedInvestmentHousehold,type EstimatedInvestmentHouseholdData} from './guided-estimated-investment-household';
import type { AnnualizedPeriodData } from './guided-estimated-tax-facts';

export const ESTIMATED_INVESTMENT_AMOUNTS = [
  ['investmentInterestExpense', 'Current investment interest expense'], ['priorYearDisallowed', 'Prior disallowed investment interest'],
  ['grossInvestmentIncome', 'Gross investment income'], ['qualifiedDividendsIncluded', 'Qualified dividends included in gross income'],
  ['netGainFromInvestmentProperty', 'Net investment-property gain'], ['netCapitalGainFromInvestmentProperty', 'Net capital gain'],
  ['electedPreferentialIncome', 'Actual elected preferential income'], ['electedNetCapitalGain', 'Actual elected net capital gain'],
  ['investmentExpenses', 'Deductible investment expenses'],
] as const;
type AmountKey = typeof ESTIMATED_INVESTMENT_AMOUNTS[number][0];
export interface EstimatedInvestmentWorksheetData extends Partial<Record<AmountKey | 'sourceTaxYear' | 'sourceReference', string>> { sourceFactsConfirmed?: boolean | null }
export interface EstimatedInvestmentAmtData extends Partial<Record<'sourceTaxYear' | 'sourceReference' | 'qualifiedDividends' | 'netCapitalGain' | 'section1250Gain' | 'collectiblesGain', string>> { sourceFactsConfirmed?: boolean | null }
export interface EstimatedInvestmentElectionData {
  household?: EstimatedInvestmentHouseholdData;
  annualAmtCapitalGains?: EstimatedInvestmentAmtData;
  sourceTaxYear?: string; sourceReference?: string; sourceFactsConfirmed?: boolean | null;
  allPeriodsCompleteConfirmed?: boolean | null; electionValidConfirmed?: boolean | null; otherInvestmentIncomePresent?: boolean | null;
  accountHolder?: '' | 'primary' | 'spouse'; taxpayerFirstName?: string; taxpayerLastName?: string; taxpayerSsnLast4?: string;
  annualForm4952SourceReference?: string;
  periods?: { periodEnd?: string; form4952?: EstimatedInvestmentWorksheetData; otherItemizedDeductions?: string }[];
}
const fail = (): never => { throw new Error('Complete and reconfirm the actual four ordinary Schedule AI investment-election originals and itemized deductions.'); };
const nonblank = (raw: string | undefined): string => typeof raw === 'string' && raw.trim() ? raw.trim() : fail();
const amount = (raw: string | undefined): string => {
  const parsed = parseGuidedCurrency(nonblank(raw));
  if (!parsed.isFinite() || parsed.isNegative() || !parsed.isInteger()) return fail();
  return parsed.toFixed();
};
export const emptyEstimatedInvestmentElection = (): EstimatedInvestmentElectionData => ({ periods: Array.from({ length: 4 }, () => ({ form4952: {} })) });
export function buildEstimatedInvestmentElection(data: EstimatedInvestmentElectionData | undefined, year: number, method: string, periods: AnnualizedPeriodData[] | undefined, special: boolean | null | undefined): NonNullable<TaxYearInput['form2210']>['investmentElectionSources'] {
  if (data === undefined) return undefined;
  if (year !== 2025 || method !== 'annualized' || special === true || data.sourceTaxYear !== String(year) || data.accountHolder !== 'primary'
    || data.sourceFactsConfirmed !== true || data.allPeriodsCompleteConfirmed !== true || data.electionValidConfirmed !== true || data.otherInvestmentIncomePresent !== false
    || !/^\d{4}$/.test(data.taxpayerSsnLast4 ?? '') || data.periods?.length !== 4 || periods?.length !== 4) return fail();
  buildEstimatedInvestmentAmtCapitalGains(data, year);
  const allowedWorksheetKeys = new Set<string>([...ESTIMATED_INVESTMENT_AMOUNTS.map(([key])=>key),'sourceTaxYear','sourceReference','sourceFactsConfirmed']);
  const references = new Set<string>();
  const annualRef = nonblank(data.annualForm4952SourceReference);
  let priorInterest = new Decimal(0);
  const built = data.periods.map((row, index) => {
    const original = row.form4952;
    if (row.periodEnd !== `${year}-${['03-31','05-31','08-31','12-31'][index]}` || !original || original.sourceTaxYear !== String(year) || original.sourceFactsConfirmed !== true) return fail();
    if(Object.keys(original).some(key=>!allowedWorksheetKeys.has(key))) return fail();
    const reference = nonblank(original.sourceReference);
    if (references.has(reference) || reference === annualRef) return fail();
    references.add(reference);
    const values = Object.fromEntries(ESTIMATED_INVESTMENT_AMOUNTS.map(([key]) => [key, amount(original[key])])) as Record<AmountKey,string>;
    const form4952 = Form4952InputSchema.parse({ ...values, sourceTaxYear: year, sourceReference: reference, sourceFactsConfirmed: true });
    if (!new Decimal(values.priorYearDisallowed).isZero() || !new Decimal(values.investmentExpenses).isZero()) return fail();
    const interest = new Decimal(values.investmentInterestExpense);
    if (interest.lt(priorInterest)) return fail();
    priorInterest = interest;
    const result = calculateForm4952(form4952, year);
    const actualPeriod = periods[index]; if (!actualPeriod) return fail();
    const otherItemizedDeductions = amount(row.otherItemizedDeductions);
    if (!new Decimal(values.qualifiedDividendsIncluded).eq(amount(actualPeriod.qualifiedDividends))
      || !new Decimal(values.netCapitalGainFromInvestmentProperty).eq(amount(actualPeriod.netCapitalGain))
      || !result.line8.plus(otherItemizedDeductions).eq(amount(actualPeriod.itemizedDeductions))) return fail();
    return { periodEnd: row.periodEnd, form4952, otherItemizedDeductions };
  });
  return { sourceTaxYear: year, sourceReference: nonblank(data.sourceReference), sourceFactsConfirmed: true,
    allPeriodsCompleteConfirmed: true, electionValidConfirmed: true, otherInvestmentIncomePresent: false, accountHolder: 'primary',
    taxpayerFirstName: nonblank(data.taxpayerFirstName), taxpayerLastName: nonblank(data.taxpayerLastName), taxpayerSsnLast4: data.taxpayerSsnLast4,
    annualForm4952SourceReference: annualRef, periods: built, ...(data.household !== undefined ? {household:buildEstimatedInvestmentHousehold(data.household)} : {}) };
}

/** Independent annual AMT original; never inferred from regular or period amounts. */
export function buildEstimatedInvestmentAmtCapitalGains(data: EstimatedInvestmentElectionData | undefined, year?: number | null): TaxYearInput['amtCapitalGains'] {
  if (data === undefined) return undefined;
  const source=data.annualAmtCapitalGains;
  if(year!==2025 || data.sourceTaxYear!==String(year) || !source || source.sourceTaxYear!==String(year) || source.sourceFactsConfirmed!==true) return fail();
  const amounts=Object.fromEntries((['qualifiedDividends','netCapitalGain','section1250Gain','collectiblesGain'] as const).map(key=>[key,amount(source[key])])) as Record<'qualifiedDividends'|'netCapitalGain'|'section1250Gain'|'collectiblesGain',string>;
  if(!new Decimal(amounts.section1250Gain).isZero() || !new Decimal(amounts.collectiblesGain).isZero()) return fail();
  return AMTCapitalGainsSchema.parse({...amounts,sourceTaxYear:year,sourceReference:nonblank(source.sourceReference),sourceFactsConfirmed:true});
}
