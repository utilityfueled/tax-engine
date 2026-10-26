import type { TaxYearInput } from '@/models/inputs.js';
import type { EicCurrentChildSource } from '@/models/form-8862-sources.js';
import { calculateEicResidenceDays } from './eic-residence-days.js';

export type EicQualifyingChildInput = {
  taxpayer: Pick<TaxYearInput['taxpayer'], 'taxYear' | 'filingStatus' | 'primary' | 'spouse' | 'dependents'>;
  allCandidateChildrenIncluded: boolean | undefined;
  children: EicCurrentChildSource[] | undefined;
};
export interface EicCurrentChildResult {
  sourceId: string; qualifies: boolean; ssnCounted: boolean;
  actualResidenceDays?: number; printedResidenceDays?: number;
  birthInYear?: string; deathInYear?: string;
  requiresLiveBirthEvidence?: boolean;
}
export interface EicQualifyingChildResult {
  qualifyingChildPresent: boolean; qualifyingChildSourceIds: string[]; ssnCountedChildSourceIds: string[];
  children: EicCurrentChildResult[];
}
const relationshipKey = (v: string) => v.trim().toLowerCase().replaceAll('_', ' ').replaceAll('-', ' ');
const childRelationships = new Set(['child', 'son', 'daughter', 'adopted child', 'stepchild', 'foster child', 'grandchild',
  'sibling', 'brother', 'sister', 'half brother', 'half sister', 'stepbrother', 'stepsister', 'step sibling', 'niece', 'nephew', 'niece nephew']);
function answer(value: boolean | undefined, label: string): boolean { if (typeof value !== 'boolean') throw new Error(`EIC ${label} is unknown`); return value; }
function date(value: string | undefined, label: string): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`EIC ${label} needs an actual date`);
  const result = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(result.getTime()) || result.toISOString().slice(0, 10) !== value) throw new Error(`EIC ${label} needs an actual calendar date`);
  return result;
}
export function calculateEicQualifyingChildSources(input: EicQualifyingChildInput): EicQualifyingChildResult {
  const { taxpayer } = input; const year = taxpayer.taxYear; const joint = taxpayer.filingStatus === 'married_filing_jointly';
  if (joint && !taxpayer.spouse) throw new Error('EIC actual joint child sources require the actual spouse');
  if (input.allCandidateChildrenIncluded !== true || input.children === undefined) throw new Error('EIC actual candidate child records are unknown or incomplete');
  const yearStart = date(`${year}-01-01`, 'year start'); const yearEnd = date(`${year}-12-31`, 'year end');
  const yearDays = (yearEnd.getTime() - yearStart.getTime()) / 86400000 + 1;
  const seen = new Set<string>(); const identifiers = new Set<string>();
  const owners = [taxpayer.primary, ...(joint && taxpayer.spouse ? [taxpayer.spouse] : [])];
  const results: EicCurrentChildResult[] = [];
  for (const row of input.children) {
    const match = /^dependent:(0|[1-9]\d*)$/.exec(row.sourceId ?? '');
    const child = match ? taxpayer.dependents[Number(match[1])] : undefined;
    if (!child || !row.sourceId || !row.sourceReference?.trim()) throw new Error('EIC current child source must identify an actual original dependent');
    if (!row.original || ['firstName', 'lastName', 'ssn', 'dateOfBirth', 'relationship', 'monthsLivedWithYou'].some(key =>
      row.original?.[key as keyof typeof row.original] !== child[key as keyof typeof child])) throw new Error('EIC child original source identity or residence changed');
    if (!child.firstName.trim() || !child.lastName.trim()) throw new Error('EIC original child identity is incomplete');
    const id = child.ssn.replace(/[-\s]/g, '');
    if (id && owners.some(owner => id === owner.ssn.replace(/[-\s]/g, ''))) throw new Error('EIC original child identifier duplicates a claimant identifier');
    const identity = id || `${child.firstName.trim().toLowerCase()}|${child.lastName.trim().toLowerCase()}|${child.dateOfBirth}`;
    if (seen.has(row.sourceId) || identifiers.has(identity)) throw new Error('EIC duplicate original child source identity');
    seen.add(row.sourceId); identifiers.add(identity);
    const birth = date(child.dateOfBirth, 'child birth'); if (birth > yearEnd) throw new Error('EIC child birth is after the return year');
    const death = row.deathDate == null ? undefined : date(row.deathDate, 'child death');
    if (death && (death < birth || death.getUTCFullYear() !== year)) throw new Error('EIC child death must be within the actual return year and after birth');
    const home = answer(row.livedWithTaxpayerInUnitedStatesMoreThanHalfYear, 'child shared-home answer');
    const special = answer(row.specialResidencePeriodClaimed, 'child special residence-period answer');
    let actualDays: number | undefined; let printedDays: number | undefined;
    const birthInYear = birth.getUTCFullYear() === year;
    if (row.homeDays !== undefined) {
      if (row.deathDate === undefined) throw new Error('EIC child death status is unknown in the actual residence record');
      const aliveStart = birth > yearStart ? birth : yearStart; const aliveEnd = death ?? yearEnd;
      const aliveDays = (aliveEnd.getTime() - aliveStart.getTime()) / 86400000 + 1;
      actualDays = calculateEicResidenceDays({ taxYear: year, sources: row.homeDays, maximumDays: aliveDays });
      if (special && !birthInYear && !death) throw new Error('EIC other special child residence-period method requires actual allocation sources');
      const qualifiesHome = actualDays * 2 > (birthInYear || death ? aliveDays : yearDays);
      if (home !== qualifiesHome) throw new Error('EIC child shared-home answer conflicts with the actual day records');
      printedDays = (birthInYear || death) && qualifiesHome ? yearDays : actualDays;
    } else if (special) throw new Error('EIC special child residence-period method requires actual day sources');
    if (home && child.monthsLivedWithYou < 6 && !(special && (birthInYear || death))) throw new Error('EIC actual child shared-home answer conflicts with original residence months below six');
    if (answer(row.marriedAtYearEnd, 'child marital status')) throw new Error('EIC married-child dependency method needs separate actual sources');
    const filedJoint = answer(row.jointReturnFiled, 'child joint-return answer');
    const refundOnly = filedJoint ? answer(row.jointReturnRefundOnly, 'child refund-only answer') : false;
    const ssn = answer(row.validSsnIssuedByDueDate, 'child timely valid SSN answer');
    if (ssn && !/^\d{9}$/.test(id)) throw new Error('EIC child valid SSN answer needs the actual original nine-digit SSN');
    const relation = relationshipKey(child.relationship);
    if (!childRelationships.has(relation)) throw new Error('EIC child relationship needs a supported original category');
    if (relation === 'foster child' && row.authorizedFosterPlacement !== true) throw new Error('EIC foster child needs actual authorized placement');
    if (row.allOtherEligibleClaimantsIncluded !== true || row.otherEligibleClaimants === undefined) throw new Error('EIC competing-claim records are unknown or incomplete');
    if (row.otherEligibleClaimants.length && !['child', 'son', 'daughter', 'adopted child'].includes(relation)) throw new Error('EIC competing nonparent priority needs separate actual sources');
    const otherNames = new Set<string>();
    for (const other of row.otherEligibleClaimants) {
      if (!other.name?.trim() || !other.sourceReference?.trim()) throw new Error('EIC other claimant original source is missing');
      const name = other.name.trim().toLowerCase(); if (otherNames.has(name)) throw new Error('EIC duplicate competing claimant source'); otherNames.add(name);
      if (answer(other.claimsAnyChildTaxBenefit, 'competing child-benefit answer')) throw new Error('EIC contested competing-claim method requires actual priority sources');
    }
    const younger = owners.some(owner => birth > date(owner.dateOfBirth, 'claimant birth'));
    const reaches = (age: number) => { const value = new Date(birth); value.setUTCFullYear(value.getUTCFullYear() + age); value.setUTCDate(value.getUTCDate() - 1); return value; };
    let ageEligible = yearEnd < reaches(19) && younger;
    if (!ageEligible && yearEnd < reaches(24) && younger) ageEligible = answer(row.fullTimeStudentForFiveMonths, 'child full-time student answer');
    if (!ageEligible) ageEligible = answer(row.permanentlyAndTotallyDisabled, 'child permanent disability answer');
    const qualifies = home && (!filedJoint || refundOnly) && ageEligible;
    const evidence = row.bornAndDeceasedRecord;
    const bornAndDeceased = birthInYear && death !== undefined;
    if (evidence !== undefined) {
      if (!bornAndDeceased) throw new Error('EIC born-and-deceased evidence requires both actual dates in the claim year');
      if (!evidence.sourceReference?.trim() || !['birth_certificate', 'death_certificate', 'hospital_record'].includes(evidence.recordType ?? '')
        || evidence.showsLiveBirth !== true) throw new Error('EIC actual live-birth record evidence is incomplete');
      if (evidence.copyAvailableForReturnAttachment !== true) throw new Error('EIC actual live-birth record copy is required for the return attachment');
    }
    if (qualifies && !ssn && bornAndDeceased && !evidence) throw new Error('EIC born-and-deceased child needs actual live-birth record evidence before applying the SSN exception');
    const recordException = qualifies && !ssn && bornAndDeceased && evidence !== undefined;
    results.push({ sourceId: row.sourceId, qualifies, ssnCounted: qualifies && (ssn || recordException),
      ...(recordException ? { requiresLiveBirthEvidence: true } : {}),
      ...(actualDays === undefined ? {} : { actualResidenceDays: actualDays, printedResidenceDays: printedDays }),
      ...(birthInYear ? { birthInYear: child.dateOfBirth.slice(5).replace('-', '/') } : {}),
      ...(row.deathDate ? { deathInYear: row.deathDate.slice(5).replace('-', '/') } : {}) });
  }
  for (const [i, child] of taxpayer.dependents.entries()) if ((child.qualifiesForEIC || childRelationships.has(relationshipKey(child.relationship))) && !seen.has(`dependent:${i}`)) throw new Error('EIC actual represented candidate child is missing');
  const qualified = results.filter(row => row.qualifies).map(row => row.sourceId);
  return { qualifyingChildPresent: qualified.length > 0, qualifyingChildSourceIds: qualified,
    ssnCountedChildSourceIds: results.filter(row => row.ssnCounted).map(row => row.sourceId), children: results };
}
