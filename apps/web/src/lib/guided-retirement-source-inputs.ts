import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { isActualDate } from '@/utils/civil-date.js';
import { iraEducationOwnerFingerprint } from '@/utils/ira-education-owner.js';
import type { PersonalInfoData, RetirementEntryData } from './guided-interview-flow';
import { parseGuidedCurrency } from './guided-currency';

export const retirementQcdTextFields = [
  ['transferReference', 'Local reference for the actual IRA trustee transfer'],
  ['recipientName', 'Charity named on the transfer and acknowledgment'],
  ['adjustmentWorksheetReference', 'Local reference for the completed owner QCD adjustment worksheet'],
] as const;

export const retirementQcdAmounts = [
  ['transferAmount', 'Amount sent directly to the charity'],
  ['unusedPriorDeductedContributions', 'Unused prior-year deducted IRA contributions after age 70½'],
  ['currentDeductedContributions', 'Current-year deducted IRA contributions after age 70½'],
] as const;

export const retirementQcdConfirmations = [
  ['ordinaryTraditionalIraConfirmed', 'Was this a distribution from the owner’s ordinary traditional IRA?'],
  ['ageRequirementConfirmed', 'Was the IRA owner at least 70½ on the transfer date?'],
  ['directTrusteeTransferConfirmed', 'Did the IRA trustee pay the charity directly?'],
  ['eligibleRecipientAndAcknowledgmentConfirmed', 'Do the records establish an eligible charity and its acknowledgment?'],
  ['allOwnerTransfersAndContributionsConfirmed', 'Have you reconciled all of this owner’s transfers and deducted contributions on the worksheet?'],
] as const;

export type GuidedRetirementQcdSource =
  Partial<Record<(typeof retirementQcdTextFields)[number][0] | 'distributionDate', string>> &
  Partial<Record<(typeof retirementQcdAmounts)[number][0], string>> &
  Partial<Record<(typeof retirementQcdConfirmations)[number][0], boolean | null>> & {
    reviewedSourceFingerprint?: string;
  };

const qcdStatementFields = [
  'sourceTaxYear', 'payer', 'payerTin', 'accountReference', 'distributionCode', 'isIraSepSimple',
  'grossDistribution', 'taxableAmount', 'taxableAmountNotDetermined', 'employeeContributions',
] as const;

/** Keep worksheet entries, but require renewed review of the source that changed. */
export function invalidateEditedGuidedQcdSource(
  previous: RetirementEntryData,
  next: RetirementEntryData,
  ownerIdentityChanged = false,
): RetirementEntryData {
  const prior = previous.qcdSource;
  const current = next.qcdSource;
  if (!prior || (previous.sourceTaxYear !== '2026' && next.sourceTaxYear !== '2026')) return next;

  const ownerChanged = ownerIdentityChanged || previous.accountHolder !== next.accountHolder;
  const statementChanged = ownerChanged || qcdStatementFields.some(field => previous[field] !== next[field]);
  const basisReview = ownerChanged ? { iraBasisConfirmedZero: null } : {};
  if (!current) return statementChanged ? { ...next, sourceFactsConfirmed: null, ...basisReview } : next;
  const dateChanged = prior.distributionDate !== current.distributionDate;
  const recipientChanged = prior.recipientName !== current.recipientName;
  const transferChanged = dateChanged || recipientChanged || prior.transferReference !== current.transferReference
    || prior.transferAmount !== current.transferAmount;
  const historyChanged = transferChanged || prior.adjustmentWorksheetReference !== current.adjustmentWorksheetReference
    || prior.unusedPriorDeductedContributions !== current.unusedPriorDeductedContributions
    || prior.currentDeductedContributions !== current.currentDeductedContributions;
  if (!statementChanged && !historyChanged) return next;

  return {
    ...next,
    sourceFactsConfirmed: null,
    ...basisReview,
    qcdSource: {
      ...current,
      ...(ownerChanged ? { reviewedSourceFingerprint: undefined } : {}),
      ...(statementChanged ? { ordinaryTraditionalIraConfirmed: null } : {}),
      ...(statementChanged || dateChanged ? { ageRequirementConfirmed: null } : {}),
      ...(statementChanged || transferChanged ? { directTrusteeTransferConfirmed: null } : {}),
      ...(statementChanged || transferChanged ? { eligibleRecipientAndAcknowledgmentConfirmed: null } : {}),
      ...(statementChanged || historyChanged ? { allOwnerTransfersAndContributionsConfirmed: null } : {}),
    },
  };
}

function currentQcdReviewFingerprint(entry: RetirementEntryData, personal?: PersonalInfoData): string | undefined {
  const source = entry.qcdSource;
  const owner = entry.accountHolder === 'primary' ? personal : entry.accountHolder === 'spouse' ? personal?.spouse : undefined;
  const ownerFingerprint = iraEducationOwnerFingerprint(owner);
  const birthDate = owner?.dateOfBirth?.trim();
  if (!source || !ownerFingerprint || !isActualDate(birthDate)) return undefined;

  const facts = [
    entry.accountHolder, ownerFingerprint, birthDate,
    ...qcdStatementFields.map(field => entry[field]),
    entry.iraBasisConfirmedZero, entry.sourceFactsConfirmed,
    source.distributionDate,
    ...retirementQcdTextFields.map(([field]) => source[field]),
    ...retirementQcdAmounts.map(([field]) => source[field]),
    ...retirementQcdConfirmations.map(([field]) => source[field]),
  ];
  return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(facts))));
}

/** Record explicit QCD review and preserve independent confirmations after ordinary edits. */
function updateGuidedQcdReview(
  previous: RetirementEntryData | undefined,
  next: RetirementEntryData,
  personal?: PersonalInfoData,
): RetirementEntryData {
  const updated = previous ? invalidateEditedGuidedQcdSource(previous, next) : next;
  const current = updated.qcdSource;
  if (updated.sourceTaxYear !== '2026' || !current) return updated;
  const prior = previous?.qcdSource;
  const previousFingerprint = prior?.reviewedSourceFingerprint;
  const previouslyBound = previous && previousFingerprint && previousFingerprint === currentQcdReviewFingerprint(previous, personal);
  if (previous && previousFingerprint && !previouslyBound) return invalidateEditedGuidedQcdSource(previous, updated, true);
  const reviewedAnswerChanged = retirementQcdConfirmations.some(([field]) => typeof current[field] === 'boolean' && current[field] !== prior?.[field]);
  // A matching prior review can carry confirmations that the edit did not revoke.
  const canPreserveReview = previouslyBound && previous.accountHolder === updated.accountHolder;
  const reviewedSourceFingerprint = canPreserveReview || reviewedAnswerChanged ? currentQcdReviewFingerprint(updated, personal) : undefined;
  return current.reviewedSourceFingerprint === reviewedSourceFingerprint ? updated
    : { ...updated, qcdSource: { ...current, reviewedSourceFingerprint } };
}

export function updateGuidedQcdEntries(
  previous: RetirementEntryData[],
  next: RetirementEntryData[],
  personal?: PersonalInfoData,
): RetirementEntryData[] {
  if (!previous.some(entry => entry.qcdSource) && !next.some(entry => entry.qcdSource)) return next;
  const updated = next.map((entry, index) => {
    if (previous.includes(entry)) return entry;
    const original = previous.find(row => row.sourceTaxYear === entry.sourceTaxYear && row.accountHolder === entry.accountHolder
      && row.payerTin === entry.payerTin && row.accountReference === entry.accountReference)
      ?? previous.find(row => entry.qcdSource?.transferReference && row.qcdSource?.transferReference === entry.qcdSource.transferReference)
      ?? (entry.qcdSource ? previous[index] : undefined);
    return updateGuidedQcdReview(original, entry, personal);
  });
  return updated.some((entry, index) => entry !== next[index]) ? updated : next;
}

/** Reopen only confirmations that still match the reviewed taxpayer and source facts. */
export function replayGuidedQcdOwnerReview(entry: RetirementEntryData, personal?: PersonalInfoData): RetirementEntryData {
  if (entry.sourceTaxYear !== '2026' || !entry.qcdSource) return entry;
  const fingerprint = currentQcdReviewFingerprint(entry, personal);
  return fingerprint && entry.qcdSource.reviewedSourceFingerprint === fingerprint
    ? entry : invalidateEditedGuidedQcdSource(entry, entry, true);
}

export interface GuidedRetirementSimplifiedMethod {
  planReference?: string;
  qualifiedPlanConfirmed?: boolean | null;
  singleLifeAnnuitantConfirmed?: boolean | null;
  statementCoversContractConfirmed?: boolean | null;
  costInPlan?: string;
  startingDate?: string;
  ageAtStart?: string;
  monthsPaid?: string;
  priorRecovered?: string;
}

/** The saved source keeps any printed space between the two code characters. */
export function normalizeGuidedRetirementCode(value: string): string {
  return value.trim().toUpperCase().replace(/^([A-Z0-9]) ([A-Z0-9])$/, '$1$2');
}

export function needsGuidedSimplifiedMethod(entry: RetirementEntryData): boolean {
  if (entry.isIraSepSimple !== false || entry.taxableAmountNotDetermined !== true) return false;
  const code = entry.distributionCode.trim();
  return (entry.sourceTaxYear === '2025' && (code === '1' || code === '7'))
    || (entry.sourceTaxYear === '2026' && code === '7');
}

export function guidedSimplifiedMethodPlanReference(entry: RetirementEntryData): string | undefined {
  return entry.simplifiedMethod?.planReference?.trim().toLowerCase();
}

export function simplifiedMethodPlanIdentifier(entry: RetirementEntryData): string {
  return JSON.stringify([entry.accountHolder, entry.payerTin?.replaceAll('-', ''), guidedSimplifiedMethodPlanReference(entry)]);
}

export function isGuidedQualifiedLumpSum(entry: RetirementEntryData): boolean {
  return entry.sourceTaxYear === '2026' && /^(?:[47]A|A[47])$/.test(normalizeGuidedRetirementCode(entry.distributionCode));
}

export function isGuidedQcdStatement(entry: RetirementEntryData): boolean {
  const code = normalizeGuidedRetirementCode(entry.distributionCode);
  return entry.sourceTaxYear === '2026' && (code === 'Y7' || (code === '7' && entry.qcdSource !== undefined));
}

export function isStartedRetirement(entry: RetirementEntryData): boolean {
  // Older drafts prefilled an unchecked IRA box and need the taxpayer to answer it again.
  const answeredNoToIra = entry.isIraSepSimple === false && entry.requiresIraConfirmation === false;
  const answeredNoToAnotherSourceFact = [
    entry.taxableAmountNotDetermined,
    entry.taxableAmountConfirmed,
    entry.eligibleGovernmental457bPlan,
    entry.militaryPensionOrSurvivorBenefit,
    entry.qualifiedJointSurvivorAnnuity,
    entry.additionalWorksheetRequired,
    entry.sourceFactsConfirmed,
  ].includes(false);
  return answeredNoToIra || answeredNoToAnotherSourceFact
    || entry.qcdSource !== undefined || entry.simplifiedMethod !== undefined || entry.code1IraEducationSource !== undefined || entry.code3DisabilitySource !== undefined
    || Object.entries(entry).some(([key, value]) => !['requiresCodeConfirmation', 'requiresIraConfirmation'].includes(key) && (typeof value === 'string' ? value.trim() !== '' : value === true));
}
function amount(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  parseGuidedCurrency(value);
  return value.trim().replaceAll(',', '');
}

export function simplifiedMethodWholeNumber(value: string | undefined): number | undefined {
  return value && /^\d{1,2}$/.test(value.trim()) ? Number(value) : undefined;
}
/** Original source values only. Never replace unknown Box2a with computed tax. */
export function retirementSourceInput(entry: RetirementEntryData) {
  const qcd = entry.qcdSource;
  const simplifiedMethod = needsGuidedSimplifiedMethod(entry) ? entry.simplifiedMethod : undefined;
  return {
    taxYear: /^\d{4}$/.test(entry.sourceTaxYear ?? '') ? Number(entry.sourceTaxYear) : undefined,
    payer: entry.payer.trim(), payerTin: entry.payerTin?.trim(), accountHolder: entry.accountHolder || undefined,
    accountReference: entry.accountReference?.trim() || undefined,
    grossDistribution: amount(entry.grossDistribution), taxableAmount: amount(entry.taxableAmount), federalWithheld: amount(entry.federalWithheld),
    iraSepSimple: entry.isIraSepSimple ?? undefined, distributionCode: normalizeGuidedRetirementCode(entry.distributionCode),
    qualifiedLumpSumReporting: isGuidedQualifiedLumpSum(entry) ? entry.qualifiedLumpSumReporting ?? undefined : undefined,
    ...(qcd && { qcdSource: {
      transferReference: qcd.transferReference?.trim(),
      distributionDate: qcd.distributionDate,
      recipientName: qcd.recipientName?.trim(),
      ordinaryTraditionalIraConfirmed: qcd.ordinaryTraditionalIraConfirmed ?? undefined,
      ageRequirementConfirmed: qcd.ageRequirementConfirmed ?? undefined,
      directTrusteeTransferConfirmed: qcd.directTrusteeTransferConfirmed ?? undefined,
      eligibleRecipientAndAcknowledgmentConfirmed: qcd.eligibleRecipientAndAcknowledgmentConfirmed ?? undefined,
      transferAmount: amount(qcd.transferAmount),
      adjustmentWorksheetReference: qcd.adjustmentWorksheetReference?.trim(),
      allOwnerTransfersAndContributionsConfirmed: qcd.allOwnerTransfersAndContributionsConfirmed ?? undefined,
      unusedPriorDeductedContributions: amount(qcd.unusedPriorDeductedContributions),
      currentDeductedContributions: amount(qcd.currentDeductedContributions),
    } }),
    capitalGainIncluded: isGuidedQualifiedLumpSum(entry) ? amount(entry.capitalGainIncluded) : undefined,
    ...(simplifiedMethod && {
      simplifiedMethodPlanIdentifier: simplifiedMethodPlanIdentifier(entry),
      simplifiedMethodCostInPlan: amount(simplifiedMethod.costInPlan),
      simplifiedMethodAnnuityStartingDate: simplifiedMethod.startingDate,
      simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: simplifiedMethodWholeNumber(simplifiedMethod.ageAtStart),
      simplifiedMethodPaymentsReceivedThisYear: simplifiedMethodWholeNumber(simplifiedMethod.monthsPaid),
      simplifiedMethodPriorYearRecovered: amount(simplifiedMethod.priorRecovered),
    }),
    iraBasisConfirmedZero: entry.isIraSepSimple === true ? entry.iraBasisConfirmedZero ?? undefined : undefined,
    taxableAmountNotDetermined: entry.taxableAmountNotDetermined ?? undefined, employeeContributions: amount(entry.employeeContributions),
    eligibleGovernmental457bPlan: entry.eligibleGovernmental457bPlan ?? undefined,
    eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount: entry.eligibleGovernmental457bPlan === true ? amount(entry.governmental457bTransferredTaxableAmount) : undefined,
    militaryPensionOrSurvivorBenefit: entry.militaryPensionOrSurvivorBenefit ?? undefined,
    qualifiedJointSurvivorAnnuity: entry.qualifiedJointSurvivorAnnuity ?? undefined,
    trumpAccount: entry.trumpAccount ?? undefined, excessContributionEarnings: amount(entry.excessContributionEarnings),
    ...(entry.stateTaxReporting === 'single' ? { state: entry.state?.trim().toUpperCase(), stateWithheld: amount(entry.stateWithheld), stateDistribution: amount(entry.stateDistribution) } : {}),
    ...(entry.localTaxReporting === 'single' ? { locality: entry.locality?.trim(), localTaxWithheld: amount(entry.localTaxWithheld) } : {}),
  };
}
