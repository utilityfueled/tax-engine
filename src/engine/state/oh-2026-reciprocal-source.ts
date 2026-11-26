/** Spec: state/oh-2026-return-draft.yaml, pa-reciprocal-*; no federal-result fabrication. */
import Decimal from 'decimal.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { Ohio2026PaPartYearReciprocalSourcesSchema } from '@/models/ohio-2026-part-year-reciprocal-wage-sources.js';
import { Ohio2026PaReciprocalSourcesSchema } from '@/models/ohio-2026-return-draft.js';
import { OhioResidencyFactsSchema } from '@/models/ohio-residency.js';
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
  readonly methodId: 'oh-2026-pa-reciprocal-wage-originals-v1' | 'oh-2026-pa-part-year-reciprocal-wage-originals-v1';
  readonly sourceCommitment: string;
}
const contexts = new WeakMap<Ohio2026ReciprocalWageContext, { sourceCommitment: string; partYearExclusion?: string }>();
/** This proof supplements, never replaces, the complete current employee source admission. */
export function readOhio2026ReciprocalWageSource(context: Ohio2026ReciprocalWageContext, taxInput: TaxYearInput, raw: unknown): string | undefined {
  const { scheduleBPartThree: _disclosure, ...input } = taxInput;
  const stored = contexts.get(context);
  if (!stored || stored.sourceCommitment !== digest({ input, sources: raw })) fail('current original context is missing stale or forged');
  return stored.partYearExclusion;
}
export function calculateOhio2026ReciprocalWageSource(taxInput: TaxYearInput, raw: unknown): Ohio2026ReciprocalWageContext {
  const { scheduleBPartThree: _disclosure, ...input } = taxInput;
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
  contexts.set(context, { sourceCommitment });
  return context;
}

/** The calendar-year PA employee method retains its own source contract. */
export function calculateOhio2026PartYearPaReciprocalWageSource(taxInput: TaxYearInput, raw: unknown): Ohio2026ReciprocalWageContext {
  const { scheduleBPartThree: _disclosure, ...input } = taxInput;
  const parsed = Ohio2026PaPartYearReciprocalSourcesSchema.safeParse(raw);
  const residency = OhioResidencyFactsSchema.safeParse(input.ohioResidency);
  if (!parsed.success || !residency.success) fail('complete confirmed part-year reciprocal originals required');
  const { partYearReciprocalWageSources: source, employmentOriginals } = parsed.data;
  const facts = residency.data, person = input.taxpayer.primary, [owner] = facts.owners, [w2] = input.w2s;
  if (input.taxpayer.taxYear !== 2026 || input.taxpayer.filingStatus !== 'single' || input.taxpayer.spouse || facts.taxYear !== 2026
    || facts.owners.length !== 1 || owner?.accountHolder !== 'primary' || owner.status !== 'part_year_resident' || input.w2s.length !== 1
    || !w2 || w2.taxYear !== 2026 || w2.accountHolder !== 'primary' || source.accountHolder !== 'primary')
    fail('current single primary part-year OH and PA employee cohort required');
  if (facts.reciprocalWageSources || facts.unemploymentPaymentSource || facts.unemploymentPaymentSchedule)
    fail('retained alternate wage or income originals require their separate method');
  if (digest(source.originalW2) !== digest(w2)
    || digest(source.originalTaxpayer) !== digest({ firstName: person.firstName, lastName: person.lastName, ssn: person.ssn }))
    fail('current taxpayer or W-2 identity differs from part-year reciprocal originals');

  const asOf = input.ohioPayments?.currentTiming.asOfDate;
  if (!asOf) fail('actual current as-of required');
  const periods = [...owner.periods].sort((a, b) => a.from.localeCompare(b.from));
  const originals = [...source.domicileOriginals].sort((a, b) => a.from.localeCompare(b.from));
  const [first, second] = periods;
  if (periods.length !== 2 || !first || !second || first.from !== '2026-01-01' || second.to !== '2026-12-31'
    || day(first.to) + 86400000 !== day(second.from) || first.to < first.from || second.to < second.from
    || ![first.domicileState, second.domicileState].includes('PA') || ![first.domicileState, second.domicileState].includes('OH'))
    fail('confirmed Ohio and Pennsylvania domicile periods must uniquely cover the calendar year');
  if (new Set(originals.map(original => identity(original.sourceId))).size !== originals.length)
    fail('distinct current domicile originals required');
  for (const [index, original] of originals.entries()) {
    const period = periods[index];
    if (!period || original.accountHolder !== 'primary' || tin(original.ssn) !== tin(person.ssn)
      || identity(original.name) !== identity(`${person.firstName} ${person.lastName}`)
      || original.domicileState !== period.domicileState || original.from !== period.from || original.to !== period.to
      || day(original.documentDate) < day(period.from) || day(original.documentDate) > day(asOf))
      fail('actual domicile originals differ from confirmed taxpayer, dates or residence periods');
  }

  const { employerEntityOriginal: entity, serviceOriginal: services } = source;
  if (entity.entityType !== 'c_corporation' || identity(entity.employerName) !== identity(w2.employer.name) || services.accountHolder !== 'primary')
    fail('ordinary current corporate employer and employee services required');
  for (const original of [entity, services]) {
    if (original.sourceTaxYear !== 2026 || original.from !== '2026-01-01' || original.to !== '2026-12-31'
      || day(original.documentDate) < day('2026-01-01') || day(original.documentDate) > day(asOf)
      || tin(original.employerTin) !== tin(w2.employer.ein))
      fail('actual payroll documentary year, calendar, employer or chronology differs');
  }
  const actual = calculateW2StateLocalSources(input, 0, w2.stateLocalSources);
  const ohio = actual.stateRows.find(row => row.state === 'OH');
  const pennsylvania = actual.stateRows.find(row => row.state === 'PA');
  if (!ohio || actual.stateRows.some(row => row.state !== 'OH' && row.state !== 'PA') || actual.localRows.length)
    fail('ordinary Ohio and optional Pennsylvania printed state rows with no local reporting required');
  const [employment] = employmentOriginals;
  if (employmentOriginals.length !== 1 || !employment || employment.serviceRows.length !== source.payrollRows.length)
    fail('complete matching ordinary and part-year reciprocal payroll inventories required');
  const payroll = [...source.payrollRows].sort((a, b) => a.servicePeriodFrom.localeCompare(b.servicePeriodFrom));
  const ordinary = [...employment.serviceRows].sort((a, b) => a.from.localeCompare(b.from));
  const ids = new Set<string>(), references = new Set<string>();
  let wages = new Decimal(0), ohioWithheld = new Decimal(0), pennsylvaniaWithheld = new Decimal(0);
  let exclusion = new Decimal(0), next = day('2026-01-01');
  for (const [index, row] of payroll.entries()) {
    const id = identity(row.sourceId), reference = identity(row.sourceReference), corresponding = ordinary[index];
    if (ids.has(id) || references.has(reference)) fail('duplicate actual reciprocal payroll original');
    ids.add(id); references.add(reference);
    const from = day(row.servicePeriodFrom), through = day(row.servicePeriodTo), paid = day(row.paymentDate);
    if (row.sourceTaxYear !== 2026 || row.accountHolder !== 'primary' || row.serviceState !== 'OH' || tin(row.employerTin) !== tin(w2.employer.ein)
      || from !== next || through < from || row.servicePeriodTo > '2026-12-31' || paid < through || row.paymentDate > '2026-12-31')
      fail('actual complete dated payroll with Ohio services, owner and employer required');
    const period = periods.find(p => row.servicePeriodFrom >= p.from && row.servicePeriodTo <= p.to && row.paymentDate <= p.to);
    if (!period) fail('actual reciprocal service or payment crosses confirmed domicile periods');
    const amount = cash(row.wages), paTax = cash(row.pennsylvaniaWithheld);
    if (!corresponding || corresponding.from !== row.servicePeriodFrom || corresponding.to !== row.servicePeriodTo
      || corresponding.paymentDate !== row.paymentDate || corresponding.serviceState !== 'OH' || !cash(corresponding.wages).eq(amount))
      fail('current ordinary service originals differ from reciprocal payroll');
    if (period.domicileState === 'PA') exclusion = exclusion.plus(amount);
    else if (!paTax.isZero()) fail('Pennsylvania withholding on Ohio-resident compensation requires its separate method');
    wages = wages.plus(amount);
    ohioWithheld = ohioWithheld.plus(cash(row.ohioWithheld));
    pennsylvaniaWithheld = pennsylvaniaWithheld.plus(paTax);
    next = through + 86400000;
  }
  if (next !== day('2027-01-01') || !wages.eq(cash(w2.wages)) || !wages.eq(cash(services.totalCompensation)))
    fail('actual complete payroll wages do not reconcile to federal and service originals');
  const ohioResidentWages = wages.minus(exclusion);
  // This same-pay method admits full Ohio-service or already resident-allocated printing.
  if (!ohio.wages.eq(wages) && !ohio.wages.eq(ohioResidentWages))
    fail('printed Ohio Box 16 wages do not reconcile to complete Ohio services or Ohio-resident payroll');
  if (pennsylvania && !pennsylvania.wages.eq(exclusion))
    fail('printed Pennsylvania Box 16 wages do not reconcile to Pennsylvania-resident payroll');
  if (!ohioWithheld.eq(ohio.withheld) || !pennsylvaniaWithheld.eq(pennsylvania?.withheld ?? 0))
    fail('actual payroll state withholding does not reconcile to printed state withholding');
  const sourceCommitment = digest({ input, sources: raw });
  const context: Ohio2026ReciprocalWageContext = Object.freeze({ methodId: 'oh-2026-pa-part-year-reciprocal-wage-originals-v1', sourceCommitment });
  contexts.set(context, { sourceCommitment, partYearExclusion: exclusion.toFixed() });
  return context;
}
