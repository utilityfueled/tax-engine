import type { TaxYearInput } from '@/models/inputs.js';
import type { FilingStatus } from './guided-interview-flow';
import type { InvestmentData } from './guided-investment-facts';
import { isStartedInvestment } from './guided-investment-facts';
import { parseGuidedCurrency } from './guided-currency';

type EngineCarryover = NonNullable<NonNullable<TaxYearInput['foreignTaxElection']>['deductionYearCarryover']>;
export type ForeignCarryoverIncomeData = NonNullable<EngineCarryover['incomeSources']>[number];
export type ForeignCarryoverBalanceData = Omit<NonNullable<EngineCarryover['carryovers']>[number], 'originTaxYear'> & { originTaxYear?: string };
export type ForeignCarryoverData = Omit<EngineCarryover, 'sourceTaxYear' | 'adjustedThroughTaxYear' | 'carryovers'> & {
  sourceTaxYear?: string; adjustedThroughTaxYear?: string; carryovers?: ForeignCarryoverBalanceData[];
};
const text = (value: string | undefined, label: string) => {
  if (!value?.trim()) throw new Error(`Enter the actual ${label}.`);
  return value.trim();
};
const money = (value: string | undefined, label: string) => {
  const result = parseGuidedCurrency(text(value, `${label}, including known zero`));
  if (!result.isFinite() || result.lt(0)) throw new Error(`The actual ${label} must be finite and nonnegative.`);
  return result.toFixed();
};
const yearValue = (value: string | undefined, label: string) => {
  if (!/^\d{4}$/.test(value ?? '')) throw new Error(`Enter the actual four-digit ${label}.`);
  return Number(value);
};
const normalize = (value: string | undefined) => value?.trim().toUpperCase();
const tin = (value: string | undefined) => value?.replace(/-/g, '').trim();

export function foreignCarryoverStatements(investment?: InvestmentData) {
  return [
    ...(investment?.interestEntries ?? []).filter(isStartedInvestment).map((entry, index) => ({ entry, sourceId: `form1099Int:${index}`, reportedIncome: entry.interestIncome })),
    ...(investment?.dividendEntries ?? []).filter(isStartedInvestment).map((entry, index) => ({ entry, sourceId: `form1099Div:${index}`, reportedIncome: entry.ordinaryDividends })),
  ];
}
export function snapshotForeignCarryoverIncome(row: ReturnType<typeof foreignCarryoverStatements>[number]): ForeignCarryoverIncomeData {
  return { sourceId: row.sourceId, payerName: row.entry.payer, payerTin: row.entry.payerTin,
    accountReference: row.entry.accountReference, owner: row.entry.accountHolder === 'primary' || row.entry.accountHolder === 'spouse' ? row.entry.accountHolder : undefined,
    foreignCountry: row.entry.foreignCountry, reportedIncome: row.reportedIncome };
}
/** Completeness and source identity only; never accept a caller-supplied tax limitation. */
export function buildGuidedForeignTaxCarryover(data: ForeignCarryoverData | undefined, investment: InvestmentData | undefined, year: number, status: FilingStatus): EngineCarryover | undefined {
  if (!data) return undefined;
  if (yearValue(data.sourceTaxYear, 'carryover worksheet year') !== year
    || yearValue(data.adjustedThroughTaxYear, 'last adjusted year') !== year - 1) throw new Error('Match actual carryover source years to this return and its preceding year.');
  text(data.sourceReference, 'carryover worksheet reference');
  if (data.method !== 'ordinary_passive') throw new Error('Select the actual supported ordinary passive source method.');
  if (data.filingHistory !== (status === 'mfj' ? 'continuous_joint_same_spouse' : 'continuous_individual')) throw new Error('Mixed joint and separate carryover history requires its actual separate allocation method.');
  for (const key of ['sourceFactsConfirmed', 'filingHistoryConfirmed', 'noCarrybackOrRedeterminationAdjustmentsConfirmed',
    'noForeignOrDomesticLossAccountsConfirmed', 'noOtherForeignIncomeConfirmed', 'allCurrentTaxesCreditEligibleConfirmed', 'passiveCategoryConfirmed'] as const) {
    if (data[key] !== true) throw new Error('Complete and confirm the actual carryover history, source classification and worksheet facts.');
  }
  if (!data.incomeSources || !data.carryovers) throw new Error('Enter the actual income and prior-balance records.');
  const statements = foreignCarryoverStatements(investment), sourceIds = new Set<string>(), balanceIds = new Set<string>();
  const incomeSources = data.incomeSources.map(source => {
    const actual = statements.find(row => row.sourceId === source.sourceId), id = text(source.sourceId, 'carryover income source');
    if (!actual || sourceIds.has(id)) throw new Error('Select distinct actual carryover income statements.');
    sourceIds.add(id);
    if (!source.owner || source.owner !== actual.entry.accountHolder || (source.owner === 'spouse' && status !== 'mfj')
      || normalize(source.payerName) !== normalize(actual.entry.payer) || !/^\d{9}$/.test(tin(source.payerTin) ?? '') || tin(source.payerTin) !== tin(actual.entry.payerTin)
      || !source.accountReference?.trim() || source.accountReference.trim() !== actual.entry.accountReference?.trim()
      || !normalize(source.foreignCountry) || normalize(source.foreignCountry) !== normalize(actual.entry.foreignCountry)
      || money(source.reportedIncome, 'source reported income') !== money(actual.reportedIncome, 'statement income')) throw new Error('Carryover income must match the actual owner, payer, account, country and statement.');
    const foreignIncome = money(source.foreignIncome, 'foreign ordinary income');
    if (parseGuidedCurrency(foreignIncome).gt(parseGuidedCurrency(actual.reportedIncome))) throw new Error('Foreign ordinary income cannot exceed its actual statement.');
    return { ...source, reportedIncome: money(source.reportedIncome, 'reported income'), foreignIncome, sourceReference: text(source.sourceReference, 'foreign income source reference') };
  });
  if (statements.some(row => parseGuidedCurrency(row.entry.foreignTaxPaid).gt(0) && !sourceIds.has(row.sourceId))) throw new Error('Enter actual foreign income for every paid-tax statement.');
  const carryovers = data.carryovers.map(source => {
    const originTaxYear = yearValue(source.originTaxYear, 'carryover origin year');
    if (originTaxYear >= year || originTaxYear < year - 10 || !['passive', 'general'].includes(source.category ?? '')) throw new Error('Enter the actual unexpired prior origin year and income category.');
    const id = `${source.category}:${originTaxYear}`;
    if (balanceIds.has(id)) throw new Error('Duplicate carryover origin year and category.');
    balanceIds.add(id);
    return { ...source, originTaxYear, amount: money(source.amount, 'adjusted prior balance'), sourceReference: text(source.sourceReference, 'prior balance source reference') };
  });
  const allocation = data.itemizedAllocation;
  const itemizedAllocation = allocation ? {
    ...allocation, sourceReference: text(allocation.sourceReference, 'allowed itemized source worksheet'),
    incomeOrSalesTaxes: money(allocation.incomeOrSalesTaxes, 'allowed income or sales taxes'),
    homeRealPropertyTaxes: money(allocation.homeRealPropertyTaxes, 'allowed personal-home real estate taxes'),
    personalPropertyTaxes: money(allocation.personalPropertyTaxes, 'allowed personal property taxes'),
    stateIncomeTaxes: allocation.stateIncomeTaxes?.map(source => ({ ...source,
      stateCode: text(source.stateCode, 'state code').toUpperCase(), deductibleAmount: money(source.deductibleAmount, 'allowed state tax'),
      stateTaxableIncome: money(source.stateTaxableIncome, 'actual state taxable income'), sourceReference: text(source.sourceReference, 'state allocation reference'),
    })),
  } : undefined;
  if (itemizedAllocation && itemizedAllocation.sourceFactsConfirmed !== true) throw new Error('Confirm the actual itemized allocation sources.');
  if (itemizedAllocation?.stateIncomeTaxes?.some(source => source.foreignIncomeSpecificallyExempt === undefined)) throw new Error('Confirm actual state foreign-income treatment.');
  return { ...data, sourceTaxYear: year, adjustedThroughTaxYear: year - 1, incomeSources, carryovers, itemizedAllocation };
}
