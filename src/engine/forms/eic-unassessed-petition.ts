/** Finite original-source prerequisite; spec/federal/eic-unassessed-petition.yaml. */
import { EicUnassessedPetitionSchema, type EicUnassessedPetition } from '@/models/eic-unassessed-petition.js';
import type { EicDisallowanceSources } from '@/models/eic-disallowance-sources.js';

type Filer = NonNullable<EicDisallowanceSources['filers']>[number];
type Denial = NonNullable<Filer['denials']>[number];
interface Context {
  source: Denial;
  owner: Filer['owner'];
  originalTaxpayerSsn: string | undefined;
  currentTaxYear: number;
  claimDate: string;
  reviewedThroughDate: string;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('EIC unassessed petition requires each actual original reference and identifier');
  return value.trim();
}
function date(value: unknown): string {
  const actual = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(actual)) throw new Error('EIC unassessed petition needs actual calendar dates');
  const parsed = new Date(`${actual}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== actual) throw new Error('EIC unassessed petition needs actual calendar dates');
  return actual;
}
/** Returns only the validated original docket key for duplicate detection, never credit eligibility. */
export function validateEicUnassessedPetition(proof: EicUnassessedPetition, context: Context): string {
  const original = EicUnassessedPetitionSchema.parse(proof), denial = context.source;
  for (const value of [original.sourceFactsConfirmed, original.noticeDeadlineConfirmed,
    original.actualTaxCourtDeficiencyPetitionConfirmed, original.actualTimelyPetitionConfirmed,
    original.completeCourtAndAccountHistoryConfirmed]) {
    if (value !== true) throw new Error('EIC unassessed petition requires complete confirmed actual notice, court and account sources');
  }
  for (const value of [original.sourceReference, original.docketReference, original.petitionReference,
    original.accountTranscriptReference, original.courtEventHistoryReference]) text(value);
  const taxpayer = text(original.originalTaxpayerSsn).replaceAll('-', '');
  if (!/^\d{9}$/.test(taxpayer) || taxpayer !== text(context.originalTaxpayerSsn).replaceAll('-', '')
    || original.owner !== context.owner || !['primary', 'spouse'].includes(original.owner ?? '')
    || original.sourceTaxYear !== context.currentTaxYear || original.deniedTaxYear !== denial.taxYear
    || original.deniedTaxYear === undefined || original.deniedTaxYear >= context.currentTaxYear
    || text(original.denialSourceId) !== text(denial.sourceId)
    || text(original.denialSourceReference) !== text(denial.sourceReference)
    || text(original.deficiencyNoticeReference) !== text(denial.sourceReference)
    || date(original.originalReturnFiledDate) !== date(denial.originalReturnFiledDate)
    || date(original.noticeDate) !== date(denial.noticeDate)) {
    throw new Error('EIC unassessed petition original owner, year, denial or notice does not match the actual history');
  }
  if (denial.appealPending !== true || denial.procedure !== 'deficiency' || denial.conduct !== 'none'
    || denial.banNotice !== undefined || denial.assessmentDate !== null || denial.finalDeterminationDate !== null) {
    throw new Error('EIC unassessed petition cannot substitute for an assessment, final ban or different appeal method');
  }
  if (date(original.reviewedThroughDate) !== context.reviewedThroughDate || date(original.claimDate) !== context.claimDate) {
    throw new Error('EIC unassessed petition requires original history through the actual claim and review dates');
  }
  const notice = date(original.noticeDate), deadline = date(original.noticeLastPetitionDate), filed = date(original.petitionFiledDate);
  if (deadline < notice || filed < notice || filed > deadline || filed > context.claimDate || context.claimDate > context.reviewedThroughDate) {
    throw new Error('EIC unassessed petition filing conflicts with its actual notice deadline or claim chronology');
  }
  // A pending docket is never a proxy for the actual null assessment/finality/exception record.
  for (const key of ['assessmentDate', 'finalDeterminationDate', 'decisionDate', 'dismissalDate', 'settlementDate',
    'assessmentWaiverDate', 'terminationOrJeopardyAssessmentDate', 'bankruptcyCaseDate', 'paymentAssessmentDate',
    'otherAssessmentExceptionDate'] as const) {
    if (original[key] !== null) throw new Error('EIC unassessed petition needs explicit actual no-assessment, no-finality and no-exception records through review');
  }
  return text(original.docketNumber);
}
