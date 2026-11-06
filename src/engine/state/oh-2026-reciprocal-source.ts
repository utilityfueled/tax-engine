/** Spec: state/oh-2026-return-draft.yaml, pa-reciprocal-*; no federal-result fabrication. */
import Decimal from 'decimal.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { Ohio2026PaReciprocalSourcesSchema } from '@/models/ohio-2026-return-draft.js';
import { calculateW2StateLocalSources } from '@/engine/forms/w2-state-local.js';

function stable(value: unknown): unknown {
  if (Decimal.isDecimal(value)) return value.toString();
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
}
const digest = (value: unknown) => bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(stable(value)))));
const identity = (value: string) => value.replace(/\s+/g, '').toUpperCase();
const tin = (value: string) => value.replace(/\D/g, '');
function fail(message: string): never { throw new Error(`Ohio2026 PA reciprocal actual sources: ${message}`); }
function day(value: string): number {
  const n = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== value) fail('actual valid documentary date required');
  return n;
}
function cash(value: string): Decimal {
  if (!/^\d{1,15}(?:\.\d{1,2})?$/.test(value)) fail('actual bounded nonnegative cash original required');
  return new Decimal(value);
}
export interface Ohio2026ReciprocalWageContext {
  readonly methodId: 'oh-2026-pa-reciprocal-wage-originals-v1';
  readonly sourceCommitment: string;
}
const contexts = new WeakMap<Ohio2026ReciprocalWageContext, string>();
/** This proof supplements, never replaces, the complete current employee source admission. */
export function readOhio2026ReciprocalWageSource(context: Ohio2026ReciprocalWageContext, input: TaxYearInput, raw: unknown): void {
  if (contexts.get(context) !== digest({ input, sources: raw })) fail('current original context is missing stale or forged');
}
export function calculateOhio2026ReciprocalWageSource(input: TaxYearInput, raw: unknown): Ohio2026ReciprocalWageContext {
  const parsed = Ohio2026PaReciprocalSourcesSchema.safeParse(raw);
  if (!parsed.success) fail('complete confirmed current reciprocal originals required');
  const source = parsed.data.reciprocalWageSources;
  const facts = input.ohioResidency, person = input.taxpayer.primary, owner = facts?.owners[0], w2 = input.w2s[0];
  if (input.taxpayer.taxYear !== 2026 || input.taxpayer.filingStatus !== 'single' || input.taxpayer.spouse || facts?.taxYear !== 2026
    || facts.owners.length !== 1 || owner?.accountHolder !== 'primary' || owner.status !== 'nonresident' || input.w2s.length !== 1 || !w2
    || w2.taxYear !== 2026 || w2.accountHolder !== 'primary' || source.accountHolder !== 'primary') fail('only current2026 single primary PA employee cohort available');
  if (digest(source) !== digest(facts.reciprocalWageSources) || digest(source.originalW2) !== digest(w2)
    || digest(source.originalTaxpayer) !== digest({ firstName: person.firstName, lastName: person.lastName, ssn: person.ssn })) fail('current original source packets or taxpayer/W2 identity differ');
  const domicile = source.domicileOriginal, entity = source.employerEntityOriginal, services = source.serviceOriginal;
  if (owner.periods.length !== 1 || owner.periods[0]?.from !== '2026-01-01' || owner.periods[0]?.to !== '2026-12-31' || owner.periods[0]?.domicileState !== 'PA'
    || domicile.domicileState !== 'PA' || domicile.accountHolder !== 'primary' || services.accountHolder !== 'primary'
    || identity(domicile.name) !== identity(`${person.firstName} ${person.lastName}`) || tin(domicile.ssn) !== tin(person.ssn)
    || entity.entityType !== 'c_corporation' || identity(entity.employerName) !== identity(w2.employer.name)) fail('actual full-year PA domicile and ordinary corporate employer required');
  const asOf = input.ohioPayments?.currentTiming.asOfDate;
  if (!asOf) fail('actual current as-of required');
  for (const original of [domicile, entity, services]) {
    if (original.sourceTaxYear !== 2026 || original.from !== '2026-01-01' || original.to !== '2026-12-31'
      || day(original.documentDate) < day('2026-01-01') || day(original.documentDate) > day(asOf)) fail('actual documentary year calendar or chronology differs');
  }
  for (const original of [entity, services]) if (tin(original.employerTin) !== tin(w2.employer.ein)) fail('actual employer TIN differs');
  const actual = calculateW2StateLocalSources(input, 0, w2.stateLocalSources);
  const ohio = actual.stateRows[0];
  if (actual.stateRows.length !== 1 || ohio?.state !== 'OH' || actual.localRows.length || !ohio.wages.eq(w2.wages)) fail('finite actual OH wage row and no local reporting required');
  const employment = parsed.data.employmentOriginals[0];
  if (parsed.data.employmentOriginals.length !== 1 || !employment || employment.serviceRows.length !== source.payrollRows.length) fail('complete matching ordinary and reciprocal payroll inventories required');
  const payroll = [...source.payrollRows].sort((a, b) => a.servicePeriodFrom.localeCompare(b.servicePeriodFrom));
  const ordinary = [...employment.serviceRows].sort((a, b) => a.from.localeCompare(b.from));
  let wages = new Decimal(0), withheld = new Decimal(0), next = day('2026-01-01');
  const ids = new Set<string>(), references = new Set<string>();
  for (const [index, row] of payroll.entries()) {
    const id = identity(row.sourceId), reference = identity(row.sourceReference), corresponding = ordinary[index];
    if (ids.has(id) || references.has(reference)) fail('duplicate actual reciprocal payroll original');
    ids.add(id); references.add(reference);
    const from = day(row.servicePeriodFrom), through = day(row.servicePeriodTo), paid = day(row.paymentDate);
    if (row.sourceTaxYear !== 2026 || row.accountHolder !== 'primary' || row.serviceState !== 'OH' || tin(row.employerTin) !== tin(w2.employer.ein)
      || from !== next || through < from || row.servicePeriodTo > '2026-12-31' || paid < through || row.paymentDate > '2026-12-31') fail('actual complete employee payroll dates owner employer and Ohio services required');
    const amount = cash(row.wages);
    if (!corresponding || corresponding.from !== row.servicePeriodFrom || corresponding.to !== row.servicePeriodTo || corresponding.paymentDate !== row.paymentDate
      || corresponding.serviceState !== 'OH' || !cash(corresponding.wages).eq(amount)) fail('current ordinary service originals differ from reciprocal payroll');
    wages = wages.plus(amount); withheld = withheld.plus(cash(row.ohioWithheld)); next = through + 86400000;
  }
  if (next !== day('2027-01-01') || !wages.eq(cash(w2.wages)) || !wages.eq(cash(services.totalCompensation)) || !withheld.eq(ohio.withheld)) fail('actual complete payroll wages or withholding do not reconcile');
  const sourceCommitment = digest({ input, sources: raw });
  const context: Ohio2026ReciprocalWageContext = Object.freeze({ methodId: 'oh-2026-pa-reciprocal-wage-originals-v1', sourceCommitment });
  contexts.set(context, sourceCommitment);
  return context;
}
