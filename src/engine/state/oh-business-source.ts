/** Spec: state/oh-canonical-business-sources.yaml. Original-bound ordinary C method. */
import Decimal from 'decimal.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import { OhioResidencyFactsSchema, type OhioResidencyFacts } from '@/models/ohio-residency.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { OhioCanonicalBusinessSourcesSchema } from '@/models/ohio-canonical-business-sources.js';
import type { OhioBusinessApportionmentInput } from '@/models/ohio-business-apportionment.js';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed.js';
import { calculateScheduleC } from '@/engine/schedules/schedule-c.js';
import { calculateScheduleSE } from '@/engine/schedules/schedule-se.js';
import { calculateOhioBusinessApportionment } from './oh-it-nrc-business.js';
function stable(value: unknown): unknown {
  if (Decimal.isDecimal(value)) return value.toString();
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  return value;
}
const digest = (v: unknown) => bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(stable(v)))));
const identity = (v: string) => v.replace(/\s+/g, '').toLowerCase();
function fail(message: string): never { throw new Error(`Ohio actual canonical business sources: ${message}`); }
function actualDate(value: string, year: number): string {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value || value.slice(0, 4) !== String(year)) fail('actual original date must be valid and in its current year');
  return value;
}
/** Opaque local context: financial projections cannot be supplied or serialized as proof. */
export interface OhioCanonicalBusinessContext { readonly methodId: 'ohio-canonical-ordinary-c-v1'; readonly taxYear: number; readonly sourceCommitment: string }
interface Stored { factsDigest: string; projection: OhioBusinessApportionmentInput; half: string; residentHalf: string; draft2026: boolean }
const contexts = new WeakMap<OhioCanonicalBusinessContext, Stored>();
/** Read/recalculate only a locally prepared context matching the full current packet. */
export function readOhioCanonicalBusinessSource(context: OhioCanonicalBusinessContext, facts: unknown, federalAgi: Decimal | string | number) {
  const stored = contexts.get(context);
  if (!stored || stored.factsDigest !== digest(facts) || !new Decimal(stored.projection.federalAgi).eq(federalAgi)) fail('current original context is missing stale or mismatched');
  const worksheet = calculateOhioBusinessApportionment(stored.projection);
  return { worksheet, deductibleHalf: new Decimal(stored.half), residentFederalDeductions: new Decimal(stored.residentHalf), federalAgi: new Decimal(stored.projection.federalAgi),
    ohioAgi: new Decimal(stored.projection.federalAgi).minus(worksheet.businessIncomeDeduction), draft2026: stored.draft2026 };
}
/** Derive projections from originals and current federal computation; draft mode is explicit. */
export function calculateOhioCanonicalBusinessSource(args: { taxInput: TaxYearInput; residencyFacts: OhioResidencyFacts | unknown; federalResult?: TaxReturnResult; draft2026?: boolean }): OhioCanonicalBusinessContext {
  const input = args.taxInput;
  const facts = OhioResidencyFactsSchema.parse(args.residencyFacts);
  const { ohioResidency: _residency, ohioPayments: _payments, ...actualFederalOriginals } = input;
  if (!facts.originalFederalSources || digest(facts.originalFederalSources) !== digest(actualFederalOriginals)) fail('current private federal original source snapshot is missing or changed');
  const source = OhioCanonicalBusinessSourcesSchema.parse(facts.businessSources);
  const year = input.taxpayer.taxYear;
  if (input.taxpayer.filingStatus !== 'single' || input.taxpayer.spouse || facts.owners.length !== 1) fail('only actual single primary owner is admitted');
  const owner = facts.owners[0];
  if (!owner || owner.accountHolder !== 'primary' || !['nonresident', 'part_year_resident'].includes(owner.status)) fail('actual primary NR or PY owner is required');
  if (source.taxYear !== year || source.facts.taxYear !== year || facts.taxYear !== year) fail('current actual source year differs');
  if (facts.allFederalSourcesIncludedConfirmed !== true || facts.noBusinessIncomeConfirmed !== false) fail('business and complete federal source classification must be explicit');
  if (!input.scheduleC || input.scheduleC.accountHolder !== 'primary' || input.scheduleC.accountingMethod === undefined || input.scheduleC.grossReceipts === undefined) fail('actual current primary C and accounting records are required');
  // This finite cohort does not manufacture classification for other business/income families.
  if ((input.form1099Nec?.length ?? 0) || input.scheduleF || (input.scheduleK1?.length ?? 0) || (input.scheduleK1Form1041?.length ?? 0) || (input.rentalProperties?.length ?? 0)
    || input.w2s.length || input.form1099Int.length || input.form1099Div.length || input.form1099B.length || input.form1099Misc.length || (input.form1099R?.length ?? 0)
    || (input.form1099OID?.length ?? 0) || (input.form1099G?.length ?? 0) || input.netOperatingLoss || input.form172 || input.cryptoIncome || (input.form1099DA?.length ?? 0) || (input.formW2G?.length ?? 0)
    || (input.formSSA1099?.length ?? 0) || (input.formRRB1099?.length ?? 0) || (input.form1099SA?.length ?? 0) || (input.form1099C?.length ?? 0) || (input.form1099Q?.length ?? 0)
    || input.form4797 || (input.homeSales?.length ?? 0) || (input.form6252?.length ?? 0) || input.form6781 || (input.form8814?.length ?? 0) || (input.form8824?.length ?? 0) || (input.savingsBondRedemptions?.length ?? 0)) fail('other actual income or business originals require their separate source composition');
  const c = input.scheduleC;
  for (const value of [c.returnsAndAllowances, c.costOfGoodsSold, c.otherIncome, c.expenses?.depreciation, c.expenses?.wages, c.expenses?.rentOnBusinessProperty]) {
    if (value === undefined || !new Decimal(value).isZero()) fail('initial actual C method requires explicitly known zero returns inventory other income depreciation payroll and rental');
  }
  if (c.homeOffice) fail('actual home office requires its separate current source method');
  let cResult; let seResult; let federalAgi: Decimal;
  if (args.draft2026 === true) {
    if (year !== 2026 || args.federalResult !== undefined) fail('draft2026 uses explicit partial constants and no fabricated full federal result');
    cResult = calculateScheduleC(input, c);
    seResult = calculateScheduleSE(input, FEDERAL_2026_CONSTANTS, cResult.netProfit);
    federalAgi = cResult.netProfit.minus(seResult.deductibleHalf);
    if (input.adjustments && Object.values(input.adjustments).some(v => v !== undefined && (typeof v !== 'string' || !new Decimal(v).isZero()))) fail('other actual draft federal adjustments require separate composition');
  } else {
    const result = args.federalResult;
    if (year !== 2025 || !result || result.taxYear !== year || result.filingStatus !== 'single' || !result.scheduleC || !result.scheduleSE) fail('actual current2025 federal C and SE computation required');
    const fresh = calculateFederalTax(input);
    if (digest(fresh) !== digest(result)) fail('current federal computation differs from source result');
    cResult = result.scheduleC; seResult = result.scheduleSE; federalAgi = result.agi;
    if (!result.otherIncome.eq(cResult.netProfit) || !result.totalIncome.eq(cResult.netProfit) || !result.adjustmentsToIncome.eq(seResult.deductibleHalf)
      || !federalAgi.eq(cResult.netProfit.minus(seResult.deductibleHalf))) fail('actual C and halfSE must reconcile every current federal income and adjustment');
  }
  const actualSE = seResult.perTaxpayer;
  if (!seResult.sourceFactsVerified || actualSE.length !== 1 || actualSE[0]?.accountHolder !== 'primary' || !actualSE[0].deductibleHalf.eq(seResult.deductibleHalf)) fail('current complete primary SE ownership required');
  if (cResult.netProfit.isNegative()) fail('signed loss federal limitation and deduction timing need their separate canonical method');
  if (source.facts.businesses.length !== 1) fail('complete unique current C coverage required');
  const b = source.facts.businesses[0];
  if (!b || b.accountHolder !== 'primary' || b.ownerResidencyStatus !== owner.status || digest(b.originalBusiness) !== digest(c)) fail('current actual C original owner or residency does not reconcile');
  const seenReceipts = new Set<string>(); const seenDocuments = new Set<string>();
  if (source.receiptOriginals.length !== b.sales.rows.length) fail('every actual invoice original must be covered once');
  for (const row of source.receiptOriginals) {
    const id = identity(row.receiptId), document = identity(row.originalDocumentId);
    if (seenReceipts.has(id) || seenDocuments.has(document) || row.sourceTaxYear !== year) fail('actual receipt source identity or year is duplicated or inconsistent');
    seenReceipts.add(id); seenDocuments.add(document); actualDate(row.date, year);
    const linked = b.sales.rows.filter(v => identity(v.receiptId) === id);
    if (linked.length !== 1 || !new Decimal(row.grossReceipt).eq(linked[0]?.grossReceipt ?? '-1') || !new Decimal(row.ohioBenefitReceipt).eq(linked[0]?.ohioBenefitReceipt ?? '-1') || row.sourceReference !== linked[0]?.sourceReference) fail('current invoice and actual purchaser-benefit source do not reconcile');
  }
  let half = new Decimal(0), residentHalf = new Decimal(0);
  const deductions = new Set<string>(), documents = new Set<string>();
  for (const row of source.federalDeductionSources) {
    const original = row.original, id = identity(row.deductionId), document = identity(original.documentId);
    if (row.sourceTaxYear !== year || original.sourceTaxYear !== year || deductions.has(id) || documents.has(document) || row.sourceReference !== original.sourceReference) fail('actual personal deduction source identity or year is duplicated or inconsistent');
    deductions.add(id); documents.add(document);
    const date = actualDate(original.date, year);
    const periods = owner.periods.filter(p => p.from <= date && date <= p.to);
    if (periods.length !== 1) fail('actual personal deduction date needs unique current domicile coverage');
    const amount = new Decimal(original.amount); half = half.plus(amount);
    if (periods[0]?.domicileState === 'OH') residentHalf = residentHalf.plus(amount);
  }
  if (!half.eq(seResult.deductibleHalf)) fail('complete actual deduction originals must reconcile current owner halfSE');
  // Resident attribution is sourced independently; no distribution is inferred from C or factor.
  const adjustment = owner.amounts?.federalAdjustments;
  if (!adjustment || !new Decimal(adjustment.federalAmount).eq(half) || !new Decimal(adjustment.residentAmount).eq(residentHalf) || !new Decimal(adjustment.nonresidentOhioAmount).isZero()) fail('actual resident federal deduction amount contradicts current dated originals');
  const projection: OhioBusinessApportionmentInput = {
    taxYear: year as 2025 | 2026, filingStatus: 'single', federalAgi: federalAgi.toFixed(), facts: source.facts,
    originalBusinesses: [{ businessSourceId: b.businessSourceId, accountHolder: 'primary', ownerResidencyStatus: owner.status as 'nonresident' | 'part_year_resident',
      original: structuredClone(c), netProfit: cResult.netProfit.toFixed(), grossReceipts: cResult.grossReceipts.toFixed(), employeeCompensation: '0', netAnnualRent: '0' }],
  };
  calculateOhioBusinessApportionment(projection);
  const context: OhioCanonicalBusinessContext = Object.freeze({ methodId: 'ohio-canonical-ordinary-c-v1', taxYear: year, sourceCommitment: digest({ input, facts, projection, draft2026: args.draft2026 === true }) });
  contexts.set(context, { factsDigest: digest(facts), projection: structuredClone(projection), half: half.toFixed(), residentHalf: residentHalf.toFixed(), draft2026: args.draft2026 === true });
  return context;
}
