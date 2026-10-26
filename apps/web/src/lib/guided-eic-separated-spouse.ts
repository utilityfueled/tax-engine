import { calculateEicSeparatedSpouseSources, type EicSeparatedSpouseInput } from '../../../../src/engine/forms/eic-separated-spouse-sources';
import type { EicSeparatedSpouseSources } from '../../../../src/models/eic-separated-spouse-sources';
import type { DependentEntryData, FilingStatus, PersonalInfoData } from './guided-interview-flow';
import { buildStandardDeductionFacts } from './guided-standard-deduction-facts';

type Editable<T> = T extends boolean ? boolean | null : T extends number ? string
  : T extends (infer E)[] ? Editable<E>[] : T extends object ? { [K in keyof T]: Editable<T[K]> } : T;
export type EicSeparatedSpouseData = Editable<EicSeparatedSpouseSources>;
export type EicSeparatedChildData = NonNullable<EicSeparatedSpouseData['children']>[number];
const statuses = { single: 'single', mfj: 'married_filing_jointly', mfs: 'married_filing_separately', hoh: 'head_of_household', qss: 'qualifying_surviving_spouse' } as const;
const candidates = new Set(['child', 'stepchild', 'foster-child', 'sibling', 'step-sibling', 'grandchild', 'niece-nephew']);
const bool = (value: boolean | null | undefined) => typeof value === 'boolean' ? value : undefined;
function claimant(personal: PersonalInfoData) {
  const first = personal.firstName.trim();
  const middle = personal.middleName?.trim().replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase();
  return { firstName: middle ? `${first} ${middle}` : first, lastName: personal.lastName,
    ssn: personal.ssn, dateOfBirth: personal.dateOfBirth ?? '' };
}
function originalChild(child: DependentEntryData) {
  return { firstName: child.firstName, lastName: child.lastName, ssn: child.ssn,
    dateOfBirth: child.dateOfBirth, relationship: child.relationship, monthsLivedWithYou: child.monthsLivedWithYou };
}
function months(value: string | undefined): number {
  if (typeof value !== 'string' || !/^(?:[0-9]|1[0-2])$/.test(value)) throw new Error('Enter actual original child residence months from 0 to 12');
  return Number(value);
}

/** Copy only existing original records. Answers, dates, histories and confirmations stay unknown. */
export function copyEicSeparatedHousehold(personal: PersonalInfoData, data: EicSeparatedSpouseData): EicSeparatedSpouseData {
  return { ...data, taxpayer: claimant(personal), sourceFactsConfirmed: null,
    allCandidateChildrenIncluded: null,
    children: (personal.dependents ?? []).flatMap((child, index) => candidates.has(child.relationship) || child.qualifiesForEIC === true
      ? [{ sourceId: `dependent:${index}`, original: originalChild(child) }] : []) };
}

export function updateEicSeparatedSources(data: EicSeparatedSpouseData, patch: Partial<EicSeparatedSpouseData>): EicSeparatedSpouseData {
  return { ...data, ...patch, ...(Object.keys(patch).every(key => key === 'sourceFactsConfirmed') ? {} : { sourceFactsConfirmed: null }) };
}

/** Narrow identification exception; full source validation still runs before calculation. */
export function allowsBlankEicChildIdentifier(data: EicSeparatedSpouseData | undefined, child: DependentEntryData, index: number): boolean {
  if (child.ssn !== '' || child.qualifiesForCTC !== false || child.qualifiesForODC !== false || data?.sourceFactsConfirmed !== true) return false;
  const row = data.children?.find(entry => entry.sourceId === `dependent:${index}`);
  return row?.validSsnIssuedByDueDate === false && row.original !== undefined
    && Object.entries(originalChild(child)).every(([key, value]) => row.original?.[key as keyof typeof row.original] === value);
}

export function buildGuidedEicSeparatedSpouseSources(personal: PersonalInfoData | undefined, status: FilingStatus | null, taxYear: number | null | undefined) {
  const data = personal?.eicSeparatedSpouseSources;
  if (data === undefined) return undefined;
  if (!personal || !status || !taxYear || !/^\d{4}$/.test(data.sourceTaxYear ?? '')) throw new Error('Enter the actual EIC separation source year and household context');
  const count = personal.dependentCount;
  const children = personal.dependents ?? [];
  if (!/^\d+$/.test(count) || Number(count) !== children.length || Number(count) > 20) throw new Error('Record every actual household child before binding EIC sources');
  const source: EicSeparatedSpouseSources = {
    sourceTaxYear: Number(data.sourceTaxYear), sourceReference: data.sourceReference,
    sourceFactsConfirmed: bool(data.sourceFactsConfirmed), taxpayer: data.taxpayer,
    applicableYearStart: data.applicableYearStart, applicableYearEnd: data.applicableYearEnd,
    marriedAtYearEnd: bool(data.marriedAtYearEnd), principalHomesApartLastSixMonths: bool(data.principalHomesApartLastSixMonths),
    legallySeparatedUnderStateLaw: bool(data.legallySeparatedUnderStateLaw), differentHouseholdsAtYearEnd: bool(data.differentHouseholdsAtYearEnd),
    separationInstrument: data.separationInstrument,
    allCandidateChildrenIncluded: bool(data.allCandidateChildrenIncluded),
    children: data.children?.map(row => ({
      sourceId: row.sourceId, sourceReference: row.sourceReference,
      original: row.original === undefined ? undefined : { ...row.original, monthsLivedWithYou: months(row.original.monthsLivedWithYou) },
      livedWithTaxpayerInUnitedStatesMoreThanHalfYear: bool(row.livedWithTaxpayerInUnitedStatesMoreThanHalfYear),
      specialResidencePeriodClaimed: bool(row.specialResidencePeriodClaimed), marriedAtYearEnd: bool(row.marriedAtYearEnd),
      jointReturnFiled: bool(row.jointReturnFiled), jointReturnRefundOnly: bool(row.jointReturnRefundOnly),
      fullTimeStudentForFiveMonths: bool(row.fullTimeStudentForFiveMonths), permanentlyAndTotallyDisabled: bool(row.permanentlyAndTotallyDisabled),
      authorizedFosterPlacement: bool(row.authorizedFosterPlacement), validSsnIssuedByDueDate: bool(row.validSsnIssuedByDueDate),
      allOtherEligibleClaimantsIncluded: bool(row.allOtherEligibleClaimantsIncluded),
      otherEligibleClaimants: row.otherEligibleClaimants?.map(other => ({ name: other.name, sourceReference: other.sourceReference, claimsAnyChildTaxBenefit: bool(other.claimsAnyChildTaxBenefit) })),
    })),
  };
  const input: EicSeparatedSpouseInput = {
    taxpayer: { taxYear, filingStatus: statuses[status], primary: claimant(personal),
      livedWithSpouseAtAnyTimeDuringYear: bool(personal.livedWithSpouseAtAnyTimeDuringYear),
      dependents: children.map(child => {
        for (const field of ['qualifiesForCTC', 'qualifiesForODC', 'qualifiesForEIC'] as const) if (typeof child[field] !== 'boolean') throw new Error('Confirm the actual household credit answers without inferring EIC source eligibility');
        return { ...originalChild(child), monthsLivedWithYou: months(child.monthsLivedWithYou),
          qualifiesForCTC: child.qualifiesForCTC as boolean, qualifiesForODC: child.qualifiesForODC as boolean, qualifiesForEIC: child.qualifiesForEIC as boolean };
      }) },
    standardDeductionFacts: buildStandardDeductionFacts(personal.standardDeductionFacts, status, taxYear, personal),
    eic: { separatedSpouseSources: source },
  };
  return { source, result: calculateEicSeparatedSpouseSources(input) };
}

/** Presentation only; incomplete source records never establish childless eligibility. */
export function hasRecordedEicChild(personal: PersonalInfoData, status: FilingStatus | null): boolean {
  const data = personal.eicSeparatedSpouseSources;
  try {
    if (data) return buildGuidedEicSeparatedSpouseSources(personal, status, Number(data.sourceTaxYear))?.result.qualifyingChildPresent ?? false;
  } catch { /* Incomplete records establish no additional presentation claim. */ }
  return !!personal.dependents?.some(child => child.qualifiesForEIC === true);
}
