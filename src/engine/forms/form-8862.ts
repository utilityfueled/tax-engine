/** Actual EIC recertification sources; spec/federal/form-8862-eic.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { Form8862Sources } from '@/models/form-8862-sources.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { calculateEicDisallowanceHistory } from './eic-disallowance-history.js';
import { calculateEicClaimantEligibility } from './eic-claimant-eligibility.js';
import { calculateEicQualifyingChildSources } from './eic-qualifying-child-sources.js';
import { calculateEicResidenceDays } from './eic-residence-days.js';
import { EicSeparatedSpouseSourcesSchema } from '@/models/eic-separated-spouse-sources.js';

export type Form8862Input = Pick<TaxYearInput, 'standardDeductionFacts'> & {
  taxpayer: Pick<TaxYearInput['taxpayer'], 'taxYear' | 'filingStatus' | 'primary' | 'spouse' | 'dependents'>;
  eic?: Pick<NonNullable<TaxYearInput['eic']>, 'claimantEligibility' | 'disallowanceSources' | 'separatedSpouseSources'>;
  sources?: Form8862Sources;
};
export interface Form8862Result {
  sourceFactsComplete: true; required: boolean; currentFormRequirementsMet: boolean;
  qualifyingChildPresent?: boolean; qualifyingChildSourceIds?: string[]; ssnCountedChildSourceIds?: string[];
  requiredChildEvidenceSourceIds?: string[];
  physical: {
    line1: number; line2Eic: true; line3IncomeOnly: boolean;
    line4OtherTaxpayerChild?: boolean; line6QualifyingChild?: boolean;
    childRows?: Array<{ sourceId: string; actualResidenceDays: number; line7Days: number; line8Birth?: string; line8Death?: string }>;
    claimantRows?: Array<{ owner: 'primary' | 'spouse'; line9Days: number; line10Age: number; line11Dependent: boolean }>;
  };
  lines: CalculatedLine[];
}
function actualDate(value: string | undefined, label: string): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Form8862 ${label} needs an actual date`);
  const result = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(result.getTime()) || result.toISOString().slice(0, 10) !== value) throw new Error(`Form8862 ${label} needs an actual calendar date`);
  return result;
}
function ageAtEnd(birth: string, year: number): number {
  const born = actualDate(birth, 'claimant birth'); const end = new Date(Date.UTC(year, 11, 31));
  let age = year - born.getUTCFullYear();
  const twentyFive = new Date(Date.UTC(born.getUTCFullYear() + 25, born.getUTCMonth(), born.getUTCDate()));
  twentyFive.setUTCDate(twentyFive.getUTCDate() - 1);
  if (age === 24 && end >= twentyFive) age = 25;
  return age;
}
function sourceValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(sourceValue).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${sourceValue(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}
export function calculateForm8862(input: Form8862Input): Form8862Result | undefined {
  const facts = input.sources; if (facts === undefined) return undefined;
  const { taxpayer } = input; const year = taxpayer.taxYear; const joint = taxpayer.filingStatus === 'married_filing_jointly';
  if (![2025, 2026].includes(year) || facts.sourceTaxYear !== year) throw new Error('Form8862 current source year must match the supported return year');
  if (!facts.sourceReference?.trim() || facts.sourceFactsConfirmed !== true) throw new Error('Form8862 actual current source reference and confirmation are required');
  if (joint && !taxpayer.spouse) throw new Error('Form8862 actual joint spouse is missing');
  const owners = [{ owner: 'primary' as const, person: taxpayer.primary }, ...(joint && taxpayer.spouse ? [{ owner: 'spouse' as const, person: taxpayer.spouse }] : [])];
  if (!facts.filers || facts.filers.length !== owners.length) throw new Error('Form8862 each actual filer needs exactly one original source record');
  const seen = new Set<string>();
  for (const row of facts.filers) {
    const owner = owners.find(who => who.owner === row.owner);
    if (!owner || seen.has(owner.owner)) throw new Error('Form8862 duplicate or inapplicable actual filer source');
    seen.add(owner.owner);
    if (!row.sourceReference?.trim() || !row.originalTaxpayer
      || ['firstName', 'lastName', 'ssn', 'dateOfBirth'].some(key => row.originalTaxpayer?.[key as keyof typeof row.originalTaxpayer] !== owner.person[key as keyof typeof owner.person])) throw new Error('Form8862 original filer identity no longer matches the actual household');
    if (!owner.person.firstName.trim() || !owner.person.lastName.trim() || !owner.person.ssn.trim()) throw new Error('Form8862 original filer identity is incomplete');
    actualDate(owner.person.dateOfBirth, 'filer birth');
    const start = row.applicableYearStart === undefined ? undefined : actualDate(row.applicableYearStart, 'applicable year start');
    const end = row.applicableYearEnd === undefined ? undefined : actualDate(row.applicableYearEnd, 'applicable year end');
    if ((start && start.getUTCFullYear() !== year) || (end && end.getUTCFullYear() !== year) || (start && end && start > end)) throw new Error('Form8862 actual claimant period must belong to the current year');
    if (row.homeDays !== undefined) calculateEicResidenceDays({ taxYear: year, sources: row.homeDays,
      ...(start && end ? { maximumDays: (end.getTime() - start.getTime()) / 86400000 + 1 } : {}) });
  }
  const children = facts.children !== undefined || facts.allCandidateChildrenIncluded !== undefined
    ? calculateEicQualifyingChildSources({ taxpayer, allCandidateChildrenIncluded: facts.allCandidateChildrenIncluded, children: facts.children }) : undefined;
  if (children && input.eic?.separatedSpouseSources !== undefined) {
    const prior = input.eic.separatedSpouseSources;
    const sharedChild = EicSeparatedSpouseSourcesSchema.shape.children.unwrap().element;
    const rows = (values: typeof prior.children) => values?.map(row => sharedChild.parse(row)).sort((a, b) => (a.sourceId ?? '').localeCompare(b.sourceId ?? ''));
    if (prior.allCandidateChildrenIncluded !== facts.allCandidateChildrenIncluded || sourceValue(rows(prior.children)) !== sourceValue(rows(facts.children))) throw new Error('Form8862 current child facts conflict with the independent separated-spouse child sources');
  }
  const history = calculateEicDisallowanceHistory({ taxpayer, sources: input.eic?.disallowanceSources, qualifyingChildPresent: children?.qualifyingChildPresent });
  if (!history.sourceFactsComplete) throw new Error('Form8862 needs actual complete denial history before a current claim');
  const audit = new AuditTrail(); audit.merge(history.lines);
  const physical: Form8862Result['physical'] = { line1: year, line2Eic: true, line3IncomeOnly: history.incomeOnlyRecertification === true };
  const finish = (meets: boolean): Form8862Result => {
    audit.record('8862', 'currentSources', 'Actual current EIC recertification source questions', new Decimal(meets ? 1 : 0),
      history.barred ? 'Actual ban remains independently binding' : !history.form8862Required ? 'Actual history does not require this current EIC attachment'
        : physical.line3IncomeOnly ? 'Actual unresolved denial concerns only earned or investment income; complete lines1–3'
          : 'Original household, actual child records and applicable claimant questions reconciled; no credit override');
    return { sourceFactsComplete: true, required: history.form8862Required === true, currentFormRequirementsMet: meets,
      ...(children ? { qualifyingChildPresent: children.qualifyingChildPresent, qualifyingChildSourceIds: children.qualifyingChildSourceIds,
        ssnCountedChildSourceIds: children.ssnCountedChildSourceIds,
        requiredChildEvidenceSourceIds: children.children.filter(row => row.requiresLiveBirthEvidence).map(row => row.sourceId) } : {}), physical, lines: audit.getLines() };
  };
  if (history.barred) return finish(false);
  if (!history.form8862Required || physical.line3IncomeOnly) return finish(true);
  if (!children) throw new Error('Form8862 actual candidate child records are unknown');
  if (!input.eic?.claimantEligibility) throw new Error('Form8862 needs actual current claimant source answers');
  const claimant = calculateEicClaimantEligibility(input, !children.qualifyingChildPresent); audit.merge(claimant.lines);
  if (!claimant.sourceFactsComplete || claimant.qualifyingChildOfAnotherTaxpayer === undefined) throw new Error('Form8862 current claimant source questions are unknown');
  physical.line4OtherTaxpayerChild = claimant.qualifyingChildOfAnotherTaxpayer;
  if (physical.line4OtherTaxpayerChild) return finish(false);
  if (children.qualifyingChildPresent) {
    physical.line6QualifyingChild = true;
    const selected = children.ssnCountedChildSourceIds.length ? children.ssnCountedChildSourceIds.slice(0, 3) : children.qualifyingChildSourceIds.slice(0, 1);
    physical.childRows = selected.map(sourceId => {
      const row = children.children.find(value => value.sourceId === sourceId);
      if (row?.actualResidenceDays === undefined || row.printedResidenceDays === undefined) throw new Error('Form8862 each claimed actual child needs the original residence day records');
      return { sourceId, actualResidenceDays: row.actualResidenceDays, line7Days: row.printedResidenceDays,
        ...(row.birthInYear ? { line8Birth: row.birthInYear } : {}), ...(row.deathInYear ? { line8Death: row.deathInYear } : {}) };
    });
    return finish(!claimant.disqualificationReason);
  }
  const yearDays = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
  physical.claimantRows = owners.map(({ owner, person }) => {
    const row = facts.filers?.find(value => value.owner === owner);
    const death = owner === 'primary' ? input.standardDeductionFacts?.primaryDeathDate : input.standardDeductionFacts?.spouseDeathDate;
    if (death !== null) throw new Error('Form8862 deceased or unknown claimant period requires actual short-year home-day method sources');
    if (row?.applicableYearStart !== `${year}-01-01` || row.applicableYearEnd !== `${year}-12-31`) throw new Error('Form8862 actual ordinary claimant period must match the full current year');
    const total = calculateEicResidenceDays({ taxYear: year, sources: row.homeDays });
    const claimantFacts = owner === 'primary' ? input.eic?.claimantEligibility?.primaryChildless : input.eic?.claimantEligibility?.spouseChildless;
    if (claimantFacts?.mainHomeInUnitedStatesMoreThanHalfYear !== (total * 2 > yearDays)) throw new Error('Form8862 home days conflict with the actual claimant main-home answer');
    const military = (row.homeDays?.militaryOutsideUnitedStatesDays ?? 0) > 0;
    if (claimantFacts.countedMilitaryDutyOutsideUnitedStates !== military) throw new Error('Form8862 actual military day records conflict with the claimant source answer');
    if (military && (claimantFacts.militaryDutySourceReference !== row.homeDays?.extendedActiveDuty?.sourceReference
      || claimantFacts.extendedActiveDutyOrderOver90DaysOrIndefinite !== true)) throw new Error('Form8862 counted military source order must reconcile with the actual claimant record');
    const dependent = owner === 'primary' ? input.standardDeductionFacts?.primaryCanBeClaimedAsDependent : input.standardDeductionFacts?.spouseCanBeClaimedAsDependent;
    if (typeof dependent !== 'boolean') throw new Error('Form8862 actual claimant dependency answer is unknown');
    const exception = claimantFacts.dependentException;
    const effectiveDependent = dependent && !(exception?.allPotentialClaimantsNotRequiredToFile === true && exception.allPotentialClaimantsDidNotFileOrRefundOnly === true);
    return { owner, line9Days: total, line10Age: ageAtEnd(person.dateOfBirth, year), line11Dependent: effectiveDependent };
  });
  return finish(!claimant.disqualificationReason && claimant.childlessAgeEligible === true);
}
