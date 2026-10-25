/** Annual foreign income-tax election. Spec: spec/federal/foreign-tax-election.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, sum } from '@/utils/decimal.js';

export interface ForeignTaxElectionResult {
  election: 'credit' | 'deduction' | 'unverified_credit';
  sourceFactsVerified: boolean;
  scheduleAForeignIncomeTaxes: Decimal;
  niitForeignIncomeTaxes: Decimal;
  lines: CalculatedLine[];
}
function amount(value: string | undefined, label: string): Decimal {
  if (value === undefined || !/^\d+(?:\.\d+)?$/.test(value)) throw new Error(`Foreign tax election requires actual nonnegative ${label}`);
  const result = d(value);
  if (!result.isFinite()) throw new Error(`Foreign tax election requires finite ${label}`);
  return result;
}
function paidDate(value: string, year: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !value.startsWith(`${year}-`)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
const normalize = (value: string | undefined) => value?.trim().toUpperCase();
const tin = (value: string | undefined) => value?.replace(/-/g, '').trim();
const territoryNames = new Set(['PR', 'PUERTO RICO', 'VI', 'US VIRGIN ISLANDS', 'U.S. VIRGIN ISLANDS', 'GU', 'GUAM', 'MP', 'NORTHERN MARIANA ISLANDS', 'AS', 'AMERICAN SAMOA']);

export type ForeignTaxElectionInput = Pick<TaxYearInput, 'foreignTaxElection' | 'form1099Int' | 'form1099Div' | 'priorYear' | 'scheduleK1' | 'scheduleK1Form1041'>
  & { taxpayer: Pick<TaxYearInput['taxpayer'], 'taxYear' | 'filingStatus'> };

export function resolveForeignTaxElection(input: ForeignTaxElectionInput): ForeignTaxElectionResult {
  const facts = input.foreignTaxElection;
  const audit = new AuditTrail();
  const empty = (election: ForeignTaxElectionResult['election']): ForeignTaxElectionResult => ({ election, sourceFactsVerified: false,
    scheduleAForeignIncomeTaxes: d('0'), niitForeignIncomeTaxes: d('0'), lines: audit.getLines() });
  if (!facts) return empty('unverified_credit');
  const year = input.taxpayer.taxYear;
  if (![2025, 2026].includes(year) || facts.taxYear !== year || facts.sourceFactsConfirmed !== true || !facts.sourceReference?.trim()
    || (facts.election !== 'credit' && facts.election !== 'deduction')) throw new Error('Foreign tax election requires its actual year, annual choice, source reference and confirmation');
  if (facts.election === 'credit') {
    if ((facts.sources ?? []).some(source => source.investmentAllocableAmount !== undefined && !amount(source.investmentAllocableAmount, 'credit-year allocation').isZero())) {
      throw new Error('A foreign tax credit election cannot also claim a foreign investment tax deduction allocation');
    }
    if ((facts.sources ?? []).some(source => source.taxDeductedElsewhere !== undefined && !amount(source.taxDeductedElsewhere, 'credit-year deduction').isZero())) {
      throw new Error('A foreign tax credit election cannot retain a same-year qualified foreign tax deduction elsewhere');
    }
    if (facts.sources?.length) throw new Error('Foreign tax credit source reconciliation needs its separate actual worksheet; deduction-source records cannot enter the unverified legacy credit estimate');
    audit.record('Foreign Tax Election WS', 'deduction', 'Annual credit choice: no foreign income tax deduction', d('0'), 'IRC275(a)(4); existing credit calculation remains separately subject to its source rules');
    return empty('credit');
  }
  if (facts.accountingMethod !== 'paid' || facts.priorAccruedCreditElection !== false) throw new Error('Foreign tax deduction requires actual paid-tax method; accrued-credit history needs its separate source method');
  if (facts.allQualifiedForeignTaxesIncludedConfirmed !== true || !facts.sources) throw new Error('Foreign tax deduction requires all actual qualified foreign taxes and complete source records');
  if (facts.noRedeterminationsConfirmed !== true) throw new Error('Foreign tax redeterminations require their actual separate historical source method');
  const prior = input.priorYear;
  const carryAmounts = [prior?.foreignTaxCreditCarryforward ?? '0',
    ...(prior?.foreignTaxCreditCarryforwardByYear ?? []).map(row => row.amount),
    ...Object.values(prior?.foreignTaxCreditCarryforwardByCategory ?? {}).flat().map(row => row.amount)];
  if (facts.noUnusedCreditCarryoversConfirmed !== true || carryAmounts.some(value => !amount(value, 'credit carryover').isZero())) {
    throw new Error('Foreign tax deduction-year carryovers require the actual hypothetical credit-limit absorption worksheet');
  }
  if ([...(input.scheduleK1 ?? []).map(source => source.foreignTaxPaid), ...(input.scheduleK1Form1041 ?? []).map(source => source.foreignTaxesPaid)]
    .some(value => !amount(value, 'pass-through foreign tax').isZero())) throw new Error('Foreign tax deduction for pass-through sources requires its separate actual source method');
  const statements = [
    ...input.form1099Int.map((form, index) => ({ form, sourceId: `form1099Int:${index}` })),
    ...input.form1099Div.map((form, index) => ({ form, sourceId: `form1099Div:${index}` })),
  ];
  const expected = statements.filter(({ form }) => amount(form.foreignTaxPaid, 'reported foreign tax').gt(0));
  const used = new Set<string>();
  let deductible = d('0');
  let investment = d('0');
  for (const source of facts.sources) {
    if (!source.sourceId || used.has(source.sourceId)) throw new Error('Foreign tax deduction source ID is missing or duplicate');
    used.add(source.sourceId);
    const actual = statements.find(row => row.sourceId === source.sourceId)?.form;
    if (!actual) throw new Error('Foreign tax deduction source must bind its actual supported recipient statement');
    const owner = actual.accountHolder;
    if (!owner || source.owner !== owner || (owner === 'spouse' && input.taxpayer.filingStatus !== 'married_filing_jointly')) throw new Error('Foreign tax deduction source requires the actual return owner');
    if (!actual.payer.trim() || normalize(source.payerName) !== normalize(actual.payer) || !/^\d{9}$/.test(tin(actual.payerTin) ?? '') || tin(source.payerTin) !== tin(actual.payerTin)) {
      throw new Error('Foreign tax deduction must reconcile the actual payer name and TIN');
    }
    const account = actual.accountReference?.trim();
    if (!account || source.accountReference?.trim() !== account) throw new Error('Foreign tax deduction must bind the actual statement account reference');
    const country = normalize(actual.foreignCountry);
    if (!country || normalize(source.foreignCountry) !== country || source.jurisdictionType !== 'foreign_country' || territoryNames.has(country)) {
      throw new Error('Foreign tax deduction requires actual foreign-country jurisdiction; territory taxes use their separate source routing');
    }
    if (source.qualifiedIncomeTaxConfirmed !== true || !source.sourceReference?.trim()) throw new Error('Foreign tax deduction requires actual qualified income-tax liability and source evidence');
    const reported = amount(source.reportedTaxAmount, 'source-reported foreign tax');
    if (!reported.eq(amount(actual.foreignTaxPaid, 'statement foreign tax'))) throw new Error('Foreign tax deduction amount must reconcile with the actual reported statement tax');
    if (!source.payments || source.payments.some(payment => !paidDate(payment.date, year))) throw new Error('Foreign tax deduction requires actual payment dates in the return year');
    const paid = sum(...source.payments.map(payment => amount(payment.amountUsd, 'actual USD tax payment')));
    if (!paid.eq(reported)) throw new Error('Foreign tax deduction dated payments must reconcile to the actual statement foreign tax');
    const excluded = amount(source.taxOnExcludedIncome, 'tax on excluded income');
    const elsewhere = amount(source.taxDeductedElsewhere, 'foreign tax already deducted elsewhere');
    if (excluded.gt(paid)) throw new Error('Foreign tax on excluded income cannot exceed actual paid tax');
    if (!elsewhere.isZero()) throw new Error('Foreign tax already deducted elsewhere needs its separate no-duplication source allocation');
    const allowed = paid.minus(excluded);
    const allocable = amount(source.investmentAllocableAmount, 'foreign tax investment allocation');
    if (allocable.gt(allowed) || (allocable.gt(0) && !source.allocationMethodDescription?.trim())) throw new Error('Foreign tax investment allocation must fit actual deductible tax and have its completed allocation method');
    deductible = deductible.plus(allowed);
    investment = investment.plus(allocable);
    audit.record('Foreign Tax Election WS', source.sourceId, 'Actual paid foreign income tax eligible for itemizing', allowed,
      'Actual dated USD payments minus actual tax on excluded income; no deduction already taken elsewhere', { 'Actual payments': paid, 'Tax on excluded income': excluded, 'NIIT allocation': allocable });
  }
  if (expected.some(row => !used.has(row.sourceId))) throw new Error('Foreign tax deduction must account for every actual positive foreign-tax statement');
  audit.record('Foreign Tax Election WS', 'deduction', 'Actual annual foreign income tax deduction before reporting rounding', deductible,
    'Sum actual eligible source taxes; ScheduleA6, outside state/local SALT cap; credit choice suppressed');
  audit.record('Foreign Tax Election WS', 'niit', 'Actual foreign income tax allocable to investment income before reporting rounding', investment,
    'Sum completed source allocations; combine with local taxes before NIIT9b rounding and final itemized limit');
  return { election: 'deduction', sourceFactsVerified: true, scheduleAForeignIncomeTaxes: deductible, niitForeignIncomeTaxes: investment, lines: audit.getLines() };
}
