import { calculateEicDisallowanceHistory } from '../../../../src/engine/forms/eic-disallowance-history';
import type { EicDisallowanceSources } from '../../../../src/models/eic-disallowance-sources';
import type { FilingStatus, PersonalInfoData } from './guided-interview-flow';
import { buildGuidedEicSeparatedSpouseSources } from './guided-eic-separated-spouse';
import { guidedSourceValuesChanged } from './guided-source-confirmation';

type Editable<T> = T extends boolean ? boolean | null : T extends number ? string
  : T extends (infer E)[] ? Editable<E>[] : T extends object ? { [K in keyof T]: Editable<T[K]> } : T;
export type EicDisallowanceHistoryData = Editable<EicDisallowanceSources>;
export type EicHistoryFilerData = NonNullable<EicDisallowanceHistoryData['filers']>[number];
export type EicHistoryDenialData = NonNullable<EicHistoryFilerData['denials']>[number];
export type EicHistoryAllowanceData = NonNullable<EicHistoryFilerData['laterAllowances']>[number];
const statuses = { single: 'single', mfj: 'married_filing_jointly', mfs: 'married_filing_separately', hoh: 'head_of_household', qss: 'qualifying_surviving_spouse' } as const;
const bool = (value: boolean | null | undefined) => typeof value === 'boolean' ? value : undefined;
function year(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d{4}$/.test(value.trim())) throw new Error('Enter the actual four-digit EIC history source year');
  return Number(value.trim());
}
function primaryIdentity(personal: PersonalInfoData) {
  const middle = personal.middleName?.trim().replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase();
  return { firstName: middle ? `${personal.firstName.trim()} ${middle}` : personal.firstName.trim(), lastName: personal.lastName, ssn: personal.ssn };
}
function sameIdentity(a: EicHistoryFilerData['originalTaxpayer'], b: EicHistoryFilerData['originalTaxpayer']): boolean {
  return a !== undefined && b !== undefined && a.firstName === b.firstName && a.lastName === b.lastName
    && a.ssn?.replaceAll('-', '') === b.ssn?.replaceAll('-', '');
}
export function invalidateEicHistorySources(data: EicDisallowanceHistoryData): EicDisallowanceHistoryData {
  return { ...data, sourceFactsConfirmed: null,
    filers: data.filers?.map(filer => ({ ...filer, sourceFactsConfirmed: null })) };
}
export function updateEicHistorySources(data: EicDisallowanceHistoryData, patch: Partial<EicDisallowanceHistoryData>): EicDisallowanceHistoryData {
  const next = { ...data, ...patch };
  return guidedSourceValuesChanged(data, next) ? invalidateEicHistorySources(next) : next;
}
/** Only actual records consumed by this history resolver revoke its confirmation. */
export function eicHistorySourceValuesChanged(previous: PersonalInfoData | undefined, next: PersonalInfoData | undefined): boolean {
  const context = (personal: PersonalInfoData | undefined) => personal === undefined ? undefined : ({
    primary: primaryIdentity(personal),
    spouse: personal.spouse === undefined ? undefined : { firstName: personal.spouse.firstName, lastName: personal.spouse.lastName, ssn: personal.spouse.ssn },
    history: personal.eicDisallowanceHistory,
    ...(personal.eicRecertificationSources === undefined ? {} : { currentForm: personal.eicRecertificationSources, currentChildren: personal.dependents, currentDependentCount: personal.dependentCount }),
    ...(personal.eicSeparatedSpouseSources === undefined ? {} : {
      separated: personal.eicSeparatedSpouseSources, children: personal.dependents, dependentCount: personal.dependentCount,
      dateOfBirth: personal.dateOfBirth, livedWithSpouseAtAnyTimeDuringYear: personal.livedWithSpouseAtAnyTimeDuringYear,
      standardDeductionFacts: personal.standardDeductionFacts,
    }),
  });
  return guidedSourceValuesChanged(context(previous), context(next));
}
/** Copy existing identities only. A changed filer never inherits someone else's history. */
export function copyEicHistoryHousehold(personal: PersonalInfoData, status: FilingStatus | null, data: EicDisallowanceHistoryData): EicDisallowanceHistoryData {
  const original = (owner: 'primary' | 'spouse', identity: NonNullable<EicHistoryFilerData['originalTaxpayer']>): EicHistoryFilerData => {
    const matches = data.filers?.filter(filer => filer.owner === owner && sameIdentity(filer.originalTaxpayer, identity)) ?? [];
    return { ...(matches.length === 1 ? matches[0] : {}), owner, originalTaxpayer: identity, sourceFactsConfirmed: null };
  };
  return { ...data, sourceFactsConfirmed: null, filers: [original('primary', primaryIdentity(personal)),
    ...(status === 'mfj' && personal.spouse ? [original('spouse', { firstName: personal.spouse.firstName, lastName: personal.spouse.lastName, ssn: personal.spouse.ssn })] : [])] };
}

export function convertGuidedEicDisallowanceHistory(personal: PersonalInfoData | undefined, status: FilingStatus | null, taxYear: number | null | undefined) {
  const data = personal?.eicDisallowanceHistory;
  if (data === undefined) return undefined;
  if (!personal || !status || !taxYear) throw new Error('EIC history needs the actual household, return year and filing status');
  const source: EicDisallowanceSources = {
    sourceTaxYear: year(data.sourceTaxYear), sourceReference: data.sourceReference, sourceFactsConfirmed: bool(data.sourceFactsConfirmed),
    reviewedThroughDate: data.reviewedThroughDate, claimStatus: data.claimStatus,
    preparationAsOfDate: data.preparationAsOfDate, claimFilingDate: data.claimFilingDate,
    filers: data.filers?.map(filer => ({
      owner: filer.owner, originalTaxpayer: filer.originalTaxpayer, sourceReference: filer.sourceReference,
      sourceFactsConfirmed: bool(filer.sourceFactsConfirmed), allHistoryIncluded: bool(filer.allHistoryIncluded),
      denials: filer.denials?.map(row => ({
        sourceId: row.sourceId, sourceReference: row.sourceReference, taxYear: year(row.taxYear),
        originalReturnFiledDate: row.originalReturnFiledDate, noticeDate: row.noticeDate,
        assessmentDate: row.assessmentDate, finalDeterminationDate: row.finalDeterminationDate,
        reason: row.reason, procedure: row.procedure, conduct: row.conduct, appealPending: bool(row.appealPending),
        underlyingDenialSourceId: row.underlyingDenialSourceId,
        interveningReturnHistoryCompleteConfirmed: bool(row.interveningReturnHistoryCompleteConfirmed),
        interveningOriginalReturns: row.interveningOriginalReturns?.map(filing => ({ taxYear: year(filing.taxYear), filedDate: filing.filedDate, sourceReference: filing.sourceReference })),
        banNotice: row.banNotice === undefined ? undefined : { ...row.banNotice, firstEligibleTaxYear: year(row.banNotice.firstEligibleTaxYear) },
      })),
      laterAllowances: filer.laterAllowances?.map(row => ({ ...row, taxYear: year(row.taxYear) })),
    })),
  };
  return source;
}
export function buildGuidedEicDisallowanceHistory(personal: PersonalInfoData | undefined, status: FilingStatus | null, taxYear: number | null | undefined) {
  const source = convertGuidedEicDisallowanceHistory(personal, status, taxYear);
  if (source === undefined) return undefined;
  if (!personal || !status || !taxYear) throw new Error('EIC history needs the actual household, return year and filing status');
  const separated = buildGuidedEicSeparatedSpouseSources(personal, status, taxYear);
  const result = calculateEicDisallowanceHistory({ taxpayer: { taxYear, filingStatus: statuses[status], primary: primaryIdentity(personal),
    spouse: status === 'mfj' && personal.spouse ? { firstName: personal.spouse.firstName, lastName: personal.spouse.lastName, ssn: personal.spouse.ssn } : undefined },
    sources: source, qualifyingChildPresent: separated?.result.sourceFactsComplete ? separated.result.qualifyingChildPresent : undefined });
  return { source, result };
}
