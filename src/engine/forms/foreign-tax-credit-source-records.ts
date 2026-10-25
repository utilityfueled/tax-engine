/** Shared actual paid-tax credit records. Spec: spec/federal/foreign-tax-ordinary-sources.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, sum } from '@/utils/decimal.js';

export type ForeignTaxCreditSourceInput = Pick<TaxYearInput, 'foreignTaxElection' | 'form1099Int' | 'form1099Div' | 'priorYear'
  | 'scheduleK1' | 'scheduleK1Form1041' | 'standardDeductionFacts' | 'educationExpenses' | 'form2555'>
  & { taxpayer: Pick<TaxYearInput['taxpayer'], 'taxYear' | 'filingStatus'> };
export interface ForeignTaxCreditCarrySource { originTaxYear: number; category: 'passive' | 'general'; amount: Decimal }
export interface ForeignTaxCreditSourceRecords {
  taxYear: number;
  currentTaxExact: Decimal;
  carryovers: ForeignTaxCreditCarrySource[];
  amtCarryovers: ForeignTaxCreditCarrySource[];
  lines: CalculatedLine[];
}
type Worksheet = NonNullable<NonNullable<TaxYearInput['foreignTaxElection']>['creditWithoutForm1116']>;
function amount(value: string | undefined, label: string): Decimal {
  if (value === undefined || !/^\d+(?:\.\d+)?$/.test(value)) throw new Error(`Foreign credit requires actual nonnegative ${label}`);
  const result = d(value);
  if (!result.isFinite()) throw new Error(`Foreign credit requires finite ${label}`);
  return result;
}
const normalized = (value: string | undefined) => value?.trim().toUpperCase();
const tin = (value: string | undefined) => value?.trim().replace(/-/g, '');
const notForeignCountries = new Set(['US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA', 'PR', 'PUERTO RICO', 'VI', 'US VIRGIN ISLANDS', 'U.S. VIRGIN ISLANDS', 'GU', 'GUAM', 'MP', 'NORTHERN MARIANA ISLANDS', 'AS', 'AMERICAN SAMOA']);
function actualDate(value: string, year: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !value.startsWith(`${year}-`)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function carrySources(rows: Worksheet['carryovers'], year: number): ForeignTaxCreditCarrySource[] {
  if (!rows) throw new Error('Foreign credit requires actual regular and AMT carryover ledgers, including confirmed empty ledgers');
  const used = new Set<string>();
  return rows.map(row => {
    const origin = row.originTaxYear; const category = row.category;
    if (origin === undefined || !Number.isInteger(origin) || origin < year - 10 || origin >= year || !category || !row.sourceReference?.trim()) {
      throw new Error('Foreign credit carryover requires actual prior origin year, category and reference');
    }
    const key = `${category}:${origin}`;
    if (used.has(key)) throw new Error('Foreign credit has a duplicate carryover origin and category');
    used.add(key);
    return { originTaxYear: origin, category, amount: amount(row.amount, 'adjusted carryover balance') };
  }).sort((a, b) => a.originTaxYear - b.originTaxYear || a.category.localeCompare(b.category));
}

export function resolveForeignTaxCreditSourceRecords(input: ForeignTaxCreditSourceInput, method: 'direct' | 'ordinary'): ForeignTaxCreditSourceRecords {
  const annual = input.foreignTaxElection; const facts = method === 'direct' ? annual?.creditWithoutForm1116 : annual?.creditWithForm1116; const year = input.taxpayer.taxYear;
  if (annual?.creditWithoutForm1116 && annual.creditWithForm1116) throw new Error('Foreign credit methods must be reconciled before calculation');
  if (!annual || !facts || ![2025, 2026].includes(year) || annual.taxYear !== year || annual.election !== 'credit'
    || annual.sourceFactsConfirmed !== true || !annual.sourceReference?.trim() || facts.electionConfirmed !== true
    || facts.sourceFactsConfirmed !== true || !facts.sourceReference?.trim()) throw new Error('Foreign credit requires its actual confirmed year and annual election');
  if (facts.filingContext !== 'original_return') throw new Error('Foreign credit amended or unknown filing context requires the actual separate election history method');
  if (annual.accountingMethod !== 'paid' || annual.priorAccruedCreditElection !== false || annual.noRedeterminationsConfirmed !== true) {
    throw new Error('Foreign credit requires actual paid-tax history without accrued elections or redeterminations');
  }
  if (facts.allForeignGrossIncomePassiveConfirmed !== true || facts.allForeignIncomeOnQualifiedPayeeStatementsConfirmed !== true
    || facts.noRequiredTaxReductionsConfirmed !== true || annual.allQualifiedForeignTaxesIncludedConfirmed !== true || !annual.sources) {
    throw new Error('Foreign credit requires actual confirmed passive/payee completeness and no unresolved tax reductions');
  }
  if (annual.deductionYearCarryover) throw new Error('Foreign credit cannot use a deduction-year carryover worksheet');
  if (input.standardDeductionFacts?.nonresidentAlien === true || input.standardDeductionFacts?.dualStatusAlien === true
    || input.educationExpenses?.nonresidentAlien === true) throw new Error('Foreign credit requires separate actual nonresident or part-year residency coordination');
  const expectedOwners = input.taxpayer.filingStatus === 'married_filing_jointly' ? ['primary', 'spouse'] : ['primary'];
  const owners = new Set<string>();
  for (const taxpayer of facts.taxpayers ?? []) {
    if (!taxpayer.owner || owners.has(taxpayer.owner) || !expectedOwners.includes(taxpayer.owner)
      || !['us_citizen', 'full_year_resident_alien'].includes(taxpayer.status ?? '') || !taxpayer.sourceReference?.trim()) {
      throw new Error('Foreign credit requires each actual taxpayer status and source reference');
    }
    owners.add(taxpayer.owner);
  }
  if (owners.size !== expectedOwners.length) throw new Error('Foreign credit requires actual status for every return taxpayer');
  if (input.form2555 && amount(input.form2555.foreignEarnedIncome, 'foreign earned income').gt(0)) throw new Error('Foreign credit cannot ignore actual nonpassive foreign earned income');
  if ((input.scheduleK1 ?? []).some(row => amount(row.foreignTaxPaid, 'pass-through tax').gt(0) || !d(row.foreignSourceIncome).isZero())
    || (input.scheduleK1Form1041 ?? []).some(row => amount(row.foreignTaxesPaid, 'trust foreign tax').gt(0))) {
    throw new Error('Foreign credit pass-through foreign sources require their separate qualified-statement method');
  }
  const statements = [
    ...input.form1099Int.map((form, index) => ({ sourceId: `form1099Int:${index}`, form })),
    ...input.form1099Div.map((form, index) => ({ sourceId: `form1099Div:${index}`, form })),
  ];
  const audit = new AuditTrail(); const used = new Set<string>(); let currentTaxExact = d('0');
  for (const source of annual.sources) {
    if (!source.sourceId || used.has(source.sourceId)) throw new Error('Foreign credit source ID is missing or duplicate');
    used.add(source.sourceId);
    const actual = statements.find(row => row.sourceId === source.sourceId)?.form;
    if (!actual || !actual.accountHolder || source.owner !== actual.accountHolder || !owners.has(source.owner)) throw new Error('Foreign credit requires the actual supported statement and return owner');
    if (!actual.payer.trim() || normalized(source.payerName) !== normalized(actual.payer)
      || !/^\d{9}$/.test(tin(actual.payerTin) ?? '') || tin(source.payerTin) !== tin(actual.payerTin)) throw new Error('Foreign credit must reconcile actual payer identity');
    if (!actual.accountReference?.trim() || actual.accountReference.trim() !== source.accountReference?.trim()) throw new Error('Foreign credit must reconcile actual account identity');
    const country = normalized(actual.foreignCountry);
    if (!country || country !== normalized(source.foreignCountry) || source.jurisdictionType !== 'foreign_country' || notForeignCountries.has(country)) throw new Error('Foreign credit requires actual foreign-country jurisdiction; territories need their separate method');
    const eligibility = source.creditEligibility;
    if (source.qualifiedIncomeTaxConfirmed !== true || !source.sourceReference?.trim() || !eligibility
      || eligibility.passiveIncomeConfirmed !== true || eligibility.legalTaxLiabilityConfirmed !== true || eligibility.noRefundOrSubsidyConfirmed !== true
      || eligibility.holdingPeriodRequirementMetConfirmed !== true || eligibility.noRelatedPaymentsConfirmed !== true || eligibility.noDisallowedCountryOrBoycottConfirmed !== true) {
      throw new Error('Foreign credit requires actual fully creditable tax, holding-period and legal-liability source facts');
    }
    if (![source.taxOnExcludedIncome, source.taxDeductedElsewhere, source.investmentAllocableAmount].every(value => amount(value, 'excluded tax or deduction allocation').isZero())) {
      throw new Error('Foreign credit reductions or same-year deductions require their separate actual source method');
    }
    const reported = amount(source.reportedTaxAmount, 'statement tax');
    if (!reported.eq(amount(actual.foreignTaxPaid, 'actual reported foreign tax'))) throw new Error('Foreign credit tax disagrees with the actual statement');
    if (!source.payments || source.payments.some(row => !actualDate(row.date, year))) throw new Error('Foreign credit requires actual payment dates in the return year');
    const paid = sum(...source.payments.map(row => amount(row.amountUsd, 'actual USD payment')));
    if (!paid.eq(reported)) throw new Error('Foreign credit actual payments must equal reported tax');
    currentTaxExact = currentTaxExact.plus(paid);
    audit.record(method === 'direct' ? 'Foreign Direct Credit WS' : 'Foreign Ordinary Credit Sources', source.sourceId, 'Actual eligible paid statement tax', paid,
      'Reconciled qualified passive payee tax with actual creditability facts; no reduction or deduction');
  }
  if (statements.some(row => amount(row.form.foreignTaxPaid, 'reported foreign tax').gt(0) && !used.has(row.sourceId))) throw new Error('Foreign credit requires every actual positive foreign-tax statement');
  const threshold = d(input.taxpayer.filingStatus === 'married_filing_jointly' ? '600' : '300');
  if (method === 'direct' && currentTaxExact.gt(threshold)) throw new Error(`Foreign credit exceeds its exact ${threshold.toFixed()} threshold`);
  if (facts.carryoverHistoryConfirmed !== true || facts.adjustedThroughTaxYear !== year - 1) throw new Error('Foreign credit requires actual carryover history adjusted through the prior year');
  const carryovers = carrySources(facts.carryovers, year); const amtCarryovers = carrySources(facts.amtCarryovers, year);
  const total = sum(...carryovers.map(row => row.amount)); const amtTotal = sum(...amtCarryovers.map(row => row.amount));
  if (annual.noUnusedCreditCarryoversConfirmed !== total.plus(amtTotal).isZero()) throw new Error('Foreign credit carryover confirmation conflicts with actual regular or AMT balances');
  if (total.plus(amtTotal).gt(0) && facts.filingHistory !== (expectedOwners.length === 2 ? 'continuous_joint_same_spouse' : 'continuous_individual')) {
    throw new Error('Foreign credit changed taxpayer carryover ownership requires its separate actual history method');
  }
  const prior = input.priorYear;
  if (d(prior?.foreignTaxCreditCarryforward).gt(0) && !d(prior?.foreignTaxCreditCarryforward).eq(total)) throw new Error('Foreign credit ledger disagrees with saved aggregate carryover');
  const reconcile = (rows: Array<{ taxYear: number; amount: string }> | undefined, declaredRows: ForeignTaxCreditCarrySource[]) => {
    if (rows === undefined) return;
    const saved = new Map<number, Decimal>(); const declared = new Map<number, Decimal>();
    for (const row of rows) saved.set(row.taxYear, (saved.get(row.taxYear) ?? d('0')).plus(amount(row.amount, 'saved carryover')));
    for (const row of declaredRows) declared.set(row.originTaxYear, (declared.get(row.originTaxYear) ?? d('0')).plus(row.amount));
    if ([...new Set([...saved.keys(), ...declared.keys()])].some(key => !(saved.get(key) ?? d('0')).eq(declared.get(key) ?? d('0')))) throw new Error('Foreign credit ledger disagrees with saved origin/category carryover');
  };
  // The historical by-year schema defaults to[], so that empty alias cannot
  // establish actual zero. Optional category ledgers retain explicit empty rows.
  if (prior?.foreignTaxCreditCarryforwardByYear.length) reconcile(prior.foreignTaxCreditCarryforwardByYear, carryovers);
  for (const category of ['passive', 'general'] as const) {
    reconcile(prior?.foreignTaxCreditCarryforwardByCategory?.[category], carryovers.filter(row => row.category === category));
    reconcile(prior?.amtForeignTaxCreditCarryforwardByCategory?.[category], amtCarryovers.filter(row => row.category === category));
  }
  return { taxYear: year, currentTaxExact, carryovers, amtCarryovers, lines: audit.getLines() };
}
