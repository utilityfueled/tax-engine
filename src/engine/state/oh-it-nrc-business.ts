/** Finite ordinary C source worksheet. See spec/state/oh-it-nrc-business.yaml. */
import Decimal from 'decimal.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { OhioBusinessApportionmentInputSchema } from '@/models/ohio-business-apportionment.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';

const Exact = Decimal.clone({ precision: 80 });
const zero = () => new Exact(0);
const dollar = (value: Decimal) => value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

// Tagged values preserve exact source distinctions without exposing originals.
function tagged(value: unknown): unknown {
  if (value === undefined) return ['undefined'];
  if (value === null) return ['null'];
  if (typeof value === 'string') return ['string', value];
  if (typeof value === 'boolean') return ['boolean', value];
  if (typeof value === 'number' && Number.isFinite(value)) return ['number', Object.is(value, -0) ? '-0' : String(value)];
  if (Array.isArray(value)) return ['array', value.map(tagged)];
  if (typeof value === 'object') return ['object', Object.keys(value).sort().map(key => [key, tagged((value as Record<string, unknown>)[key])])];
  throw new Error('Ohio business original contains a non-serializable source value');
}
const serialized = (value: unknown) => JSON.stringify(tagged(value));
const commitment = (value: unknown) => bytesToHex(sha256(new TextEncoder().encode(serialized(value))));

function pair(ohio: string, everywhere: string) {
  const a = new Exact(ohio); const b = new Exact(everywhere);
  if (a.isNegative() || b.isNegative() || a.gt(b)) throw new Error('Actual Ohio factor amounts must be nonnegative and no greater than everywhere');
  return { ohio: a, everywhere: b };
}
function exactRatio(numerator: Decimal, denominator: Decimal) {
  if (denominator.isZero()) return zero();
  const result = numerator.div(denominator);
  if (result.decimalPlaces() > 6 || !result.times(denominator).eq(numerator)) {
    throw new Error('This source requires the unresolved general six-decimal apportionment precision method');
  }
  return result;
}
function exactSix(value: Decimal) {
  if (value.decimalPlaces() > 6) throw new Error('This source requires the unresolved general six-decimal weighted-factor method');
  return value;
}

export interface OhioBusinessWorksheet {
  accountHolder: 'primary' | 'spouse';
  businessCommitment: string;
  propertyRatio: Decimal;
  propertyWeight: Decimal;
  payrollWeight: Decimal;
  salesRatio: Decimal;
  salesWeight: Decimal;
  apportionmentRatio: Decimal;
  worksheetLines: Record<string, Decimal>;
}
export interface OhioBusinessApportionmentResult {
  methodId: string;
  taxYear: number;
  qualifiedYearPack: false;
  sourceCommitment: string;
  businesses: OhioBusinessWorksheet[];
  columnA: Decimal;
  columnB: Decimal;
  columnC: Decimal;
  businessIncomeBeforeDeductionCap: Decimal;
  businessIncomeDeduction: Decimal;
  ohioBusinessAfterDeduction: Decimal;
  lines: CalculatedLine[];
}

/** Current-source projections must be derived from originals by the integrating adapter. */
export function calculateOhioBusinessApportionment(raw: unknown): OhioBusinessApportionmentResult {
  const input = OhioBusinessApportionmentInputSchema.parse(raw);
  if (input.taxYear !== input.facts.taxYear) throw new Error('Actual business source year differs from current return');
  const originals = new Map(input.originalBusinesses.map(b => [b.businessSourceId, b]));
  const sourceIds = new Set(input.facts.businesses.map(b => b.businessSourceId));
  if (originals.size !== input.originalBusinesses.length || sourceIds.size !== input.facts.businesses.length || originals.size !== sourceIds.size) {
    throw new Error('Actual original business coverage must be complete and unique');
  }
  const audit = new AuditTrail();
  const businesses: OhioBusinessWorksheet[] = [];
  let columnA = zero(); let columnB = zero(); let columnC = zero();
  for (const [index, b] of input.facts.businesses.entries()) {
    const original = originals.get(b.businessSourceId);
    if (!original || b.accountHolder !== original.accountHolder || b.ownerResidencyStatus !== original.ownerResidencyStatus || b.sourceTaxYear !== input.taxYear || serialized(b.originalBusiness) !== serialized(original.original)) {
      throw new Error('Ohio business owner, residency, year or original identity does not match current source');
    }
    if (original.original.accountHolder !== original.accountHolder || typeof original.original.grossReceipts !== 'string' || !new Exact(original.original.grossReceipts).eq(original.grossReceipts)) {
      throw new Error('Actual raw original C owner or gross receipts contradict its current projection');
    }
    if (input.filingStatus !== 'married_filing_jointly' && b.accountHolder === 'spouse') throw new Error('Actual spouse business requires a joint return');
    const beginning = pair(b.property.ownedBeginning.ohio, b.property.ownedBeginning.everywhere);
    const end = pair(b.property.ownedEnd.ohio, b.property.ownedEnd.everywhere);
    const rent = pair(b.property.annualRent.ohio, b.property.annualRent.everywhere);
    const subrent = pair(b.property.annualSubrent.ohio, b.property.annualSubrent.everywhere);
    if (subrent.ohio.gt(rent.ohio) || subrent.everywhere.gt(rent.everywhere)) throw new Error('Net annual rental source requires a separate negative-rental method');
    const netRentOhio = rent.ohio.minus(subrent.ohio);
    const netRentEverywhere = rent.everywhere.minus(subrent.everywhere);
    if (netRentOhio.gt(netRentEverywhere) || !netRentEverywhere.eq(original.netAnnualRent)) throw new Error('Actual net rental sources do not reconcile');
    const ownedOhio = beginning.ohio.plus(end.ohio).div(2);
    const ownedEverywhere = beginning.everywhere.plus(end.everywhere).div(2);
    const rentedOhio = netRentOhio.times(8); const rentedEverywhere = netRentEverywhere.times(8);
    const propertyOhio = ownedOhio.plus(rentedOhio); const propertyEverywhere = ownedEverywhere.plus(rentedEverywhere);
    const payroll = pair(b.payroll.ohio, b.payroll.everywhere);
    if (!payroll.everywhere.eq(original.employeeCompensation)) throw new Error('Actual employee payroll does not reconcile with current business sources');
    const receipts = new Set<string>(); let salesOhio = zero(); let salesEverywhere = zero();
    for (const row of b.sales.rows) {
      if (receipts.has(row.receiptId)) throw new Error('Duplicate actual receipt source');
      receipts.add(row.receiptId);
      const amounts = pair(row.ohioBenefitReceipt, row.grossReceipt);
      salesOhio = salesOhio.plus(amounts.ohio); salesEverywhere = salesEverywhere.plus(amounts.everywhere);
    }
    if (new Exact(original.grossReceipts).isNegative() || !salesEverywhere.eq(original.grossReceipts)) throw new Error('Complete actual business receipts do not reconcile');
    const propertyRatio = exactRatio(propertyOhio, propertyEverywhere);
    const payrollRatio = exactRatio(payroll.ohio, payroll.everywhere);
    const salesRatio = exactRatio(salesOhio, salesEverywhere);
    const totalWeight = (propertyEverywhere.isZero() ? zero() : new Exact('.2'))
      .plus(payroll.everywhere.isZero() ? zero() : new Exact('.2'))
      .plus(salesEverywhere.isZero() ? zero() : new Exact('.6'));
    const profit = new Exact(original.netProfit);
    if (totalWeight.isZero() && !profit.isZero()) throw new Error('Nonzero business income with no actual apportionment factors requires a separate method');
    const propertyWeight = propertyEverywhere.isZero() ? zero() : exactRatio(new Exact('.2'), totalWeight);
    const payrollWeight = payroll.everywhere.isZero() ? zero() : exactRatio(new Exact('.2'), totalWeight);
    const salesWeight = salesEverywhere.isZero() ? zero() : exactRatio(new Exact('.6'), totalWeight);
    const weightedProperty = exactSix(propertyRatio.times(propertyWeight));
    const weightedPayroll = exactSix(payrollRatio.times(payrollWeight));
    const weightedSales = exactSix(salesRatio.times(salesWeight));
    const apportionmentRatio = exactSix(weightedProperty.plus(weightedPayroll).plus(weightedSales));
    const worksheetLines: Record<string, Decimal> = {
      '1aOhio': ownedOhio, '1aEverywhere': ownedEverywhere,
      '1bOhio': rentedOhio, '1bEverywhere': rentedEverywhere,
      '1c': weightedProperty, '2': weightedPayroll, '3': weightedSales, '4': apportionmentRatio,
    };
    for (let line = 5; line <= 22; line++) worksheetLines[String(line)] = zero();
    worksheetLines['6'] = profit; worksheetLines['14'] = profit;
    const ohioIncome = dollar(profit.times(apportionmentRatio));
    worksheetLines['15'] = ohioIncome; worksheetLines['18'] = ohioIncome;
    columnA = columnA.plus(profit); columnC = columnC.plus(ohioIncome);
    // Actual no-adjustment proof is mandatory; zeros are not missing defaults.
    columnB = columnB.plus(worksheetLines['22'] ?? zero());
    const businessCommitment = commitment(b);
    for (const [line, value] of Object.entries(worksheetLines)) audit.record('OH-IT-NRC-III', `${index + 1}:${line}`, `Actual ordinary business ${index + 1} worksheet ${line}`, value, 'Actual original source method; see spec/state/oh-it-nrc-business.yaml', { 'Owner': b.accountHolder, 'Business source commitment': businessCommitment });
    businesses.push({ accountHolder: b.accountHolder, businessCommitment, propertyRatio, propertyWeight, payrollWeight, salesRatio, salesWeight, apportionmentRatio, worksheetLines });
  }
  const federalAgi = new Exact(input.federalAgi);
  const businessIncomeBeforeDeductionCap = Exact.max(0, Exact.min(columnA, federalAgi));
  const cap = new Exact(input.filingStatus === 'married_filing_separately' ? '125000' : '250000');
  const businessIncomeDeduction = Exact.min(businessIncomeBeforeDeductionCap, cap);
  const ohioBusinessAfterDeduction = columnC.gt(0) ? Exact.max(0, columnC.minus(businessIncomeDeduction)) : columnC;
  const sourceCommitment = commitment({ methodId: 'ohio-itnrc-ordinary-c-exact-factors-v1', input });
  for (const [line, value] of [['22A', columnA], ['22B', columnB], ['22C', columnC], ['23', businessIncomeDeduction], ['24', ohioBusinessAfterDeduction]] as const) {
    audit.record('OH-IT-NRC-II', line, `Actual source business total ${line}`, value, 'Source-bound actual business totals and AGI-capped Ohio deduction', { 'State method': 'ohio-itnrc-ordinary-c-exact-factors-v1', 'Tax year': String(input.taxYear), 'Source commitment': sourceCommitment });
  }
  return { methodId: 'ohio-itnrc-ordinary-c-exact-factors-v1', taxYear: input.taxYear, qualifiedYearPack: false, sourceCommitment, businesses, columnA, columnB, columnC, businessIncomeBeforeDeductionCap, businessIncomeDeduction, ohioBusinessAfterDeduction, lines: audit.getLines() };
}
