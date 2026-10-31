/** Deferred QOF gain included on a complete sale or December 31, 2026.
 * Spec: spec/federal/qof-deferred-gain-inclusion.yaml. */
import Decimal from 'decimal.js';
import type { CapitalTransaction, TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import type { QofInvestmentSource } from '@/models/qof-investment-sources.js';
import { AuditTrail } from '@/utils/audit.js';

export type QofInclusionInput = { taxpayer: { taxYear: number } } & Partial<Pick<TaxYearInput, 'qofDispositionFacts'>>;
export interface QofInclusionRow {
  sourceId: string; qofEin: string; description: string; eventDate: string; event: 'sale_or_exchange' | 'december_31_2026';
  gainCharacter: 'short_term' | 'long_term'; remainingDeferredGain: Decimal; basisIncrease: Decimal; includedGain: Decimal;
}
export interface QofInclusionResult {
  rows: QofInclusionRow[]; transactions: CapitalTransaction[]; totalIncludedGain: Decimal;
  shortTermIncludedGain: Decimal; longTermIncludedGain: Decimal; lines: CalculatedLine[];
}

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, MONEY = /^\d+(\.\d+)?$/, SIGNED = /^-?\d+(\.\d+)?$/;
const YEAR_END = '2026-12-31', LAST_INVESTMENT = '2026-12-31', QOF_SOURCE = 'Qualified Opportunity Fund records';
const fail = (message: string) => new Error(`QOF ${message}`);
const money = (value: string | undefined, label: string) => {
  if (value === undefined || !MONEY.test(value)) throw fail(`requires the actual ${label}`);
  return new Decimal(value);
};
/** Exact anniversary comparison, without tacking any earlier holding period. */
const heldYears = (investmentDate: string, eventDate: string, years: number) =>
  `${Number(investmentDate.slice(0, 4)) + years}${investmentDate.slice(4)}` <= eventDate;

function calculateRow(row: QofInvestmentSource, taxYear: number): { row: QofInclusionRow; transaction: CapitalTransaction } {
  if (row.sourceFactsConfirmed !== true || !row.sourceReference?.trim() || !row.sourceId?.trim()) throw fail('investment requires a confirmed original record');
  if (!/^\d{2}-?\d{7}$/.test(row.qofEin ?? '') || !row.description?.trim()) throw fail('investment requires the actual fund EIN and interest description');
  const investmentDate = row.investmentDate ?? '', eventDate = row.eventDate ?? '';
  if (!DATE.test(investmentDate) || !DATE.test(eventDate) || investmentDate > eventDate) throw fail('investment requires actual investment and event dates');
  if (investmentDate > LAST_INVESTMENT) throw fail('investments after 2026 follow a separate rule that this method does not calculate');
  if (row.entireInvestment !== true) throw fail('partial dispositions need a separate proportional method');
  const { event, gainCharacter, interestType } = row;
  if (event !== 'sale_or_exchange' && event !== 'december_31_2026') throw fail('event must be a sale or December 31, 2026; other inclusion events need a separate method');
  if (gainCharacter !== 'short_term' && gainCharacter !== 'long_term') throw fail('gain must be short-term or long-term; special gain attributes need a separate method');
  if (interestType !== 'corporation' && interestType !== 'partnership_or_s_corporation') throw fail('investment requires the actual interest type');
  if (Number(eventDate.slice(0, 4)) !== taxYear) throw fail('event date must fall in the return year');
  if (event === 'december_31_2026' && eventDate !== YEAR_END) throw fail('year-end inclusion must use December 31, 2026');
  const original = money(row.originalDeferredGain, 'original deferred gain'), remaining = money(row.remainingDeferredGain, 'remaining deferred gain');
  if (remaining.gt(original)) throw fail('remaining deferred gain cannot exceed the original deferred gain');
  const rate = heldYears(investmentDate, eventDate, 7) ? '0.15' : heldYears(investmentDate, eventDate, 5) ? '0.10' : '0';
  const basisIncrease = remaining.times(rate), reduced = remaining.minus(basisIncrease);
  let includedGain: Decimal;
  if (interestType === 'corporation') {
    includedGain = Decimal.max(0, Decimal.min(remaining, money(row.fairMarketValue, 'fair market value')).minus(basisIncrease));
  } else {
    if (row.fullyTaxableDispositionGain === undefined || !SIGNED.test(row.fullyTaxableDispositionGain)) throw fail('partnership or S corporation interest requires the actual gain on a fully taxable disposition');
    includedGain = Decimal.max(0, Decimal.min(reduced, row.fullyTaxableDispositionGain));
  }
  const longTerm = gainCharacter === 'long_term', shared = { description: row.qofEin!, dateAcquired: investmentDate, dateSold: eventDate,
    basisReportedToIRS: false, holdingPeriod: longTerm ? 'long' as const : 'short' as const, washSale: false, washSaleDisallowed: '0', digitalAsset: false,
    sourceDocumentType: 'not-reported' as const, qofInclusion: true };
  let transaction: CapitalTransaction;
  if (event === 'sale_or_exchange') {
    // One row needs one term. Different deferred and QOF terms need two reports.
    const heldMoreThanOneYear = `${Number(investmentDate.slice(0, 4)) + 1}${investmentDate.slice(4)}` < eventDate;
    if (heldMoreThanOneYear !== longTerm) throw fail('sale term must match the deferred gain character on its one reporting row');
    const proceeds = money(row.proceeds, 'sale proceeds'), prior = money(row.basisBeforeInclusion, 'basis before inclusion');
    transaction = { ...shared, proceeds: proceeds.toFixed(), costBasis: prior.plus(basisIncrease).plus(includedGain).toFixed(), adjustments: includedGain.toFixed() };
  } else transaction = { ...shared, proceeds: '0', costBasis: '0', adjustments: includedGain.toFixed() };
  return { transaction, row: { sourceId: row.sourceId, qofEin: row.qofEin!, description: row.description, eventDate, event, gainCharacter,
    remainingDeferredGain: remaining, basisIncrease, includedGain } };
}

export function calculateQofInclusion(input: QofInclusionInput): QofInclusionResult | undefined {
  const facts = input.qofDispositionFacts, year = input.taxpayer.taxYear;
  if (!facts) return undefined;
  const records = facts.investments ?? [];
  if (year === 2026) {
    const held = records.some(row => row.event === 'december_31_2026');
    if (typeof facts.deferredGainHeldAtYearEnd !== 'boolean' || facts.deferredGainHeldAtYearEnd !== held) {
      throw new Error('QOF 2026 return requires an actual year-end deferred gain answer that matches its records');
    }
  }
  if (records.length === 0) return undefined;
  if (facts.sourceFactsConfirmed !== true || facts.allInvestmentsReviewed !== true || facts.sourceTaxYear !== year) throw fail('investments require confirmed current-year sources');
  if (new Set(records.map(row => row.sourceId)).size !== records.length) throw fail('investment records must be distinct');
  const results = records.map(row => calculateRow(row, year)), audit = new AuditTrail();
  const total = (character?: string) => results.filter(item => !character || item.row.gainCharacter === character)
    .reduce((sum, item) => sum.plus(item.row.includedGain), new Decimal(0));
  for (const { row } of results) {
    audit.record('QOF Inclusion', row.sourceId, 'Previously deferred QOF gain included', row.includedGain,
      'Lesser of remaining deferred gain and value limit, less section1400Z-2(b)(2)(B) basis increase',
      { 'Remaining deferred gain': row.remainingDeferredGain, 'Basis increase': row.basisIncrease });
  }
  return { rows: results.map(item => item.row), transactions: results.map(item => item.transaction), totalIncludedGain: total(),
    shortTermIncludedGain: total('short_term'), longTermIncludedGain: total('long_term'), lines: audit.getLines() };
}

/** Adding the source once keeps repeated capital normalization idempotent. */
export function addQofInclusionRows<T extends QofInclusionInput & { form1099B: TaxYearInput['form1099B'] }>(input: T): T {
  if (input.form1099B.some(form => form.broker === QOF_SOURCE)) return input;
  const result = calculateQofInclusion(input);
  if (!result) return input;
  return { ...input, form1099B: [...input.form1099B, { broker: QOF_SOURCE, stateWithheld: '0', transactions: result.transactions }] };
}

/** State conformity is unresolved, so a state attachment must not guess. */
export function assertQofStateMethod(input: QofInclusionInput, state: string): void {
  if (input.qofDispositionFacts?.investments?.length) throw fail(`inclusion has no implemented ${state} treatment`);
}
