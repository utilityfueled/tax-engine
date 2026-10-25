/** Actual ordinary passive source binding. Spec: spec/federal/foreign-tax-ordinary-sources.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, sum } from '@/utils/decimal.js';
import { resolveForeignTaxCreditSourceRecords, type ForeignTaxCreditSourceInput } from './foreign-tax-credit-source-records.js';
import type { ForeignTaxOrdinaryCreditInput, ForeignTaxPriorReturnCapacity } from './foreign-tax-ordinary-credit.js';

type Facts = NonNullable<NonNullable<TaxYearInput['foreignTaxElection']>['creditWithForm1116']>;
type PassiveGroup = NonNullable<ForeignTaxOrdinaryCreditInput['passiveGroup']>;
function amount(value: string | undefined, label: string): Decimal {
  if (value === undefined || !/^\d+(?:\.\d+)?$/.test(value)) throw new Error(`Ordinary foreign credit requires actual nonnegative ${label}`);
  const result = d(value);
  if (!result.isFinite()) throw new Error(`Ordinary foreign credit requires finite ${label}`);
  return result;
}
const normalize = (value: string | undefined) => value?.trim().toUpperCase();
const tin = (value: string | undefined) => value?.trim().replace(/-/g, '');
const notForeign = new Set(['US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA', 'PR', 'PUERTO RICO', 'VI', 'US VIRGIN ISLANDS', 'U.S. VIRGIN ISLANDS', 'GU', 'GUAM', 'MP', 'NORTHERN MARIANA ISLANDS', 'AS', 'AMERICAN SAMOA']);
function priorCapacity(record: Facts['regularCarryback'], year: number): ForeignTaxPriorReturnCapacity | undefined {
  if (record === undefined) return undefined;
  if (record.taxYear !== year - 1 || !record.election || record.sourceFactsConfirmed !== true || !record.sourceReference?.trim()
    || record.allPriorUseIncludedConfirmed !== true) throw new Error('Ordinary foreign credit requires complete actual prior-return capacity records');
  const limit = record.limitation === undefined ? undefined : amount(record.limitation, 'prior limitation');
  const current = record.currentTaxes === undefined ? undefined : amount(record.currentTaxes, 'prior current tax');
  const used = record.priorCarryoversUsed === undefined ? undefined : amount(record.priorCarryoversUsed, 'prior carry use');
  if (record.election === 'form1116_credit' && (!limit || !current || !used)) throw new Error('Ordinary foreign credit prior completed Form1116 lines are unknown');
  return { taxYear: record.taxYear, election: record.election, sourceFactsConfirmed: true, sourceReference: record.sourceReference,
    allPriorUseIncludedConfirmed: true, limitation: limit, currentTaxes: current, priorCarryoversUsed: used };
}

export function resolveForeignTaxOrdinarySources(input: ForeignTaxCreditSourceInput) {
  const facts = input.foreignTaxElection?.creditWithForm1116, year = input.taxpayer.taxYear;
  if (!facts || facts.sourceTaxYear !== year || facts.method !== 'ordinary_passive'
    || facts.allForeignIncomeSourcesIncludedConfirmed !== true || facts.noForeignOrDomesticLossAccountsConfirmed !== true
    || facts.noCfcOrQbuIncomeConfirmed !== true || !facts.incomeSources) {
    throw new Error('Ordinary foreign credit requires actual year, complete ordinary passive sources and separate loss-account classification');
  }
  const records = resolveForeignTaxCreditSourceRecords(input, 'ordinary');
  const audit = new AuditTrail(); audit.merge(records.lines);
  const seen = new Set<string>(), countries = new Map<string, { country: string; gross: Decimal; tax: Decimal }>();
  const groups = new Set<PassiveGroup>();
  for (const source of facts.incomeSources) {
    const id = source.sourceId, match = /^(form1099Int|form1099Div):(0|[1-9]\d*)$/.exec(id ?? '');
    if (!id || !match || seen.has(id) || !Number.isSafeInteger(Number(match[2]))) throw new Error('Ordinary foreign credit actual income source is missing or duplicate');
    seen.add(id);
    const actual = match[1] === 'form1099Int' ? input.form1099Int[Number(match[2])] : input.form1099Div[Number(match[2])];
    if (!actual || !actual.accountHolder || source.owner !== actual.accountHolder || (source.owner === 'spouse' && input.taxpayer.filingStatus !== 'married_filing_jointly')
      || !actual.payer.trim() || normalize(source.payerName) !== normalize(actual.payer) || !/^\d{9}$/.test(tin(actual.payerTin) ?? '') || tin(source.payerTin) !== tin(actual.payerTin)
      || !actual.accountReference?.trim() || source.accountReference?.trim() !== actual.accountReference.trim() || !source.sourceReference?.trim()) {
      throw new Error('Ordinary foreign credit income must bind the actual owner payer account and source identity');
    }
    const country = normalize(source.foreignCountry);
    if (!country || country !== normalize(actual.foreignCountry) || notForeign.has(country)) throw new Error('Ordinary foreign credit requires actual foreign-country income; territory methods remain separate');
    const reported = 'interestIncome' in actual ? amount(actual.interestIncome, 'statement Box1 interest') : amount(actual.ordinaryDividends, 'statement Box1a dividends');
    if (!reported.eq(amount(source.reportedIncome, 'original reported income'))) throw new Error('Ordinary foreign credit income must reconcile to the actual statement');
    const gross = amount(source.foreignIncome, 'foreign ordinary income');
    if (gross.gt(reported)) throw new Error('Ordinary foreign credit foreign income exceeds its actual source');
    if ('qualifiedDividends' in actual && !amount(actual.qualifiedDividends, 'qualified dividends').isZero()) throw new Error('Ordinary foreign credit qualified dividends require their actual preferential-income method');
    if (!source.passiveGroup) throw new Error('Ordinary foreign credit requires actual prescribed passive group classification');
    groups.add(source.passiveGroup);
    const taxRecord = input.foreignTaxElection?.sources?.find(row => row.sourceId === id);
    const tax = taxRecord ? amount(taxRecord.reportedTaxAmount, 'actual eligible paid tax') : d('0');
    if (source.passiveGroup === 'no_foreign_tax' && !tax.isZero()) throw new Error('Ordinary foreign credit untaxed group conflicts with its actual paid tax');
    const aggregate = countries.get(country) ?? { country, gross: d('0'), tax: d('0') };
    aggregate.gross = aggregate.gross.plus(gross); aggregate.tax = aggregate.tax.plus(tax); countries.set(country, aggregate);
    audit.record('Foreign Ordinary Credit Sources', `${id}:foreign-income`, 'Actual foreign ordinary income', gross,
      'Confirmed statement foreign part; original reported income retained separately', { reported });
  }
  if (groups.size !== 1) throw new Error('Ordinary foreign credit mixed or missing passive grouping requires its separate allocation method');
  const passiveGroup = [...groups][0];
  if ((input.foreignTaxElection?.sources ?? []).some(row => !row.sourceId || !seen.has(row.sourceId))) throw new Error('Ordinary foreign credit requires actual income for every paid-tax source');
  const statements = [
    ...input.form1099Int.map((row, index) => ({ id: `form1099Int:${index}`, country: row.foreignCountry, income: row.interestIncome })),
    ...input.form1099Div.map((row, index) => ({ id: `form1099Div:${index}`, country: row.foreignCountry, income: row.ordinaryDividends })),
  ];
  if (statements.some(row => row.country?.trim() && !notForeign.has(normalize(row.country) ?? '') && amount(row.income, 'reported income').gt(0) && !seen.has(row.id))) {
    throw new Error('Ordinary foreign credit complete income sources omit a known foreign-country statement');
  }
  if (!sum(...[...countries.values()].map(row => row.tax)).eq(records.currentTaxExact)) throw new Error('Ordinary foreign credit country taxes do not reconcile to actual payments');
  const amt = facts.amt;
  if (!amt || amt.sourceFactsConfirmed !== true || !amt.sourceReference?.trim() || amt.foreignAmountsSameAsRegularConfirmed !== true
    || amt.noRevocationConfirmed !== true || typeof amt.simplifiedElectionMadeInFirstClaimYear !== 'boolean'
    || amt.firstPost1997CreditClaimTaxYear === undefined || amt.firstPost1997CreditClaimTaxYear < 1998 || amt.firstPost1997CreditClaimTaxYear > year) {
    throw new Error('Ordinary foreign credit requires actual separate AMT source and first-election history');
  }
  return { ...records, countries: [...countries.values()], passiveGroup, itemizedAllocation: facts.itemizedAllocation,
    regularCarryback: priorCapacity(facts.regularCarryback, year), amtCarryback: priorCapacity(facts.amtCarryback, year),
    amt: { foreignAmountsSameAsRegularConfirmed: true, firstPost1997CreditClaimTaxYear: amt.firstPost1997CreditClaimTaxYear,
      simplifiedElectionMadeInFirstClaimYear: amt.simplifiedElectionMadeInFirstClaimYear, noRevocationConfirmed: true },
    lines: audit.getLines() };
}
export type ForeignTaxOrdinarySources = ReturnType<typeof resolveForeignTaxOrdinarySources>;
