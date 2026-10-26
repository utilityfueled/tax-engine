import { calculateForm8862, type Form8862Input } from '../../../../src/engine/forms/form-8862';
import { Form8862SourcesSchema, type Form8862Sources } from '../../../../src/models/form-8862-sources';
import type { DependentEntryData, FilingStatus, PersonalInfoData } from './guided-interview-flow';
import { buildStandardDeductionFacts } from './guided-standard-deduction-facts';
import { guidedSourceValuesChanged } from './guided-source-confirmation';

type Editable<T> = T extends boolean ? boolean | null : T extends number ? string
  : T extends (infer E)[] ? Editable<E>[] : T extends object ? { [K in keyof T]: Editable<T[K]> } : T;
export type Form8862Data = Editable<Form8862Sources>;
export type Form8862FilerData = NonNullable<Form8862Data['filers']>[number];
export type Form8862ChildData = NonNullable<Form8862Data['children']>[number];
export type ResidenceDaysData = NonNullable<Form8862FilerData['homeDays']>;
const statuses = { single: 'single', mfj: 'married_filing_jointly', mfs: 'married_filing_separately', hoh: 'head_of_household', qss: 'qualifying_surviving_spouse' } as const;
const candidates = new Set(['child', 'stepchild', 'foster-child', 'sibling', 'step-sibling', 'grandchild', 'niece-nephew']);
const numeric = new Set(['sourceTaxYear', 'actualUnitedStatesDays', 'militaryOutsideUnitedStatesDays', 'days', 'monthsLivedWithYou']);
const bool = (value: boolean | null | undefined) => typeof value === 'boolean' ? value : undefined;
function originalPrimary(personal: PersonalInfoData) {
  const middle = personal.middleName?.trim().replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase();
  return { firstName: middle ? `${personal.firstName.trim()} ${middle}` : personal.firstName.trim(), lastName: personal.lastName,
    ssn: personal.ssn, dateOfBirth: personal.dateOfBirth };
}
function originalChild(child: DependentEntryData) { return { firstName: child.firstName, lastName: child.lastName, ssn: child.ssn,
  dateOfBirth: child.dateOfBirth, relationship: child.relationship, monthsLivedWithYou: child.monthsLivedWithYou }; }
function equal(a: unknown, b: unknown): boolean { return !guidedSourceValuesChanged(a, b); }
function parseValues(value: unknown, key = ''): unknown {
  if (value === null) return key === 'deathDate' ? null : undefined;
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(item => parseValues(item));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, parseValues(item, name)]));
  if (numeric.has(key)) {
    if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) throw new Error('Enter actual whole-number Form8862 years and residence days; blank is unknown');
    const count = Number(value.trim()); if (!Number.isSafeInteger(count)) throw new Error('Form8862 day counts and source years must be exact integers');
    return count;
  }
  return value;
}
export function updateForm8862Sources(data: Form8862Data, patch: Partial<Form8862Data>): Form8862Data {
  const next = { ...data, ...patch };
  return guidedSourceValuesChanged(data, next) ? { ...next, sourceFactsConfirmed: null } : next;
}
/** Copy recorded originals/answers only; a replaced person cannot inherit records. */
export function copyForm8862Household(personal: PersonalInfoData, status: FilingStatus | null, data: Form8862Data): Form8862Data {
  const owners = [{ owner: 'primary' as const, originalTaxpayer: originalPrimary(personal) },
    ...(status === 'mfj' && personal.spouse ? [{ owner: 'spouse' as const, originalTaxpayer: { firstName: personal.spouse.firstName, lastName: personal.spouse.lastName, ssn: personal.spouse.ssn, dateOfBirth: personal.spouse.dateOfBirth } }] : [])];
  const actualCount = /^\d+$/.test(personal.dependentCount) && Number(personal.dependentCount) === (personal.dependents ?? []).length;
  return { ...data, sourceFactsConfirmed: null, allCandidateChildrenIncluded: null,
    filers: owners.map(owner => {
      const matches = data.filers?.filter(row => row.owner === owner.owner && equal(row.originalTaxpayer, owner.originalTaxpayer)) ?? [];
      return { ...(matches.length === 1 ? matches[0] : {}), ...owner };
    }),
    children: actualCount ? (personal.dependents ?? []).flatMap((child, i) => {
      if (!candidates.has(child.relationship) && child.qualifiesForEIC !== true) return [];
      const original = originalChild(child); const sourceId = `dependent:${i}`;
      const own = data.children?.filter(row => row.sourceId === sourceId && equal(row.original, original)) ?? [];
      const separated = personal.eicSeparatedSpouseSources?.children?.filter(row => row.sourceId === sourceId && equal(row.original, original)) ?? [];
      return [{ ...(own.length === 1 ? own[0] : separated.length === 1 ? separated[0] : {}), sourceId, original }];
    }) : undefined,
  };
}
export function allowsBlankForm8862ChildIdentifier(data: Form8862Data | undefined, child: DependentEntryData, index: number): boolean {
  if (child.ssn !== '' || child.qualifiesForCTC !== false || child.qualifiesForODC !== false || data?.sourceFactsConfirmed !== true) return false;
  const row = data.children?.find(value => value.sourceId === `dependent:${index}`);
  return row?.validSsnIssuedByDueDate === false && equal(row.original, originalChild(child));
}
export function buildGuidedForm8862Sources(personal: PersonalInfoData | undefined, status: FilingStatus | null, year: number | null | undefined,
  eic: Form8862Input['eic']) {
  const data = personal?.eicRecertificationSources;
  if (data === undefined) return undefined;
  if (!personal || !status || !year || !personal.dateOfBirth) throw new Error('Form8862 needs the actual current household, return year and filing status');
  const count = personal.dependentCount; const dependents = personal.dependents ?? [];
  if (!/^\d+$/.test(count) || Number(count) !== dependents.length || dependents.length > 20) throw new Error('Record every actual dependent before binding Form8862');
  const source = Form8862SourcesSchema.parse(parseValues(data));
  const identity = originalPrimary(personal);
  const input: Form8862Input = { taxpayer: { taxYear: year, filingStatus: statuses[status],
    primary: { ...identity, dateOfBirth: personal.dateOfBirth, employmentValidSsnIssuedByDueDate: bool(personal.employmentValidSsnIssuedByDueDate), tinIssuedByDueDate: bool(personal.tinIssuedByDueDate) },
    spouse: status === 'mfj' && personal.spouse ? { firstName: personal.spouse.firstName, lastName: personal.spouse.lastName, ssn: personal.spouse.ssn, dateOfBirth: personal.spouse.dateOfBirth,
      employmentValidSsnIssuedByDueDate: bool(personal.spouse.employmentValidSsnIssuedByDueDate), tinIssuedByDueDate: bool(personal.spouse.tinIssuedByDueDate) } : undefined,
    dependents: dependents.map(child => {
      for (const field of ['qualifiesForCTC', 'qualifiesForODC', 'qualifiesForEIC'] as const) if (typeof child[field] !== 'boolean') throw new Error('Confirm actual dependent credit answers without inferring Form8862 eligibility');
      if (!/^(?:[0-9]|1[0-2])$/.test(child.monthsLivedWithYou)) throw new Error('Form8862 needs actual original dependent residence months');
      return { ...originalChild(child), monthsLivedWithYou: Number(child.monthsLivedWithYou), qualifiesForCTC: child.qualifiesForCTC as boolean,
        qualifiesForODC: child.qualifiesForODC as boolean, qualifiesForEIC: child.qualifiesForEIC as boolean };
    }) }, standardDeductionFacts: buildStandardDeductionFacts(personal.standardDeductionFacts, status, year, personal), eic, sources: source };
  return { source, result: calculateForm8862(input) };
}
