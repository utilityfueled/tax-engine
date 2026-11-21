import type { RetirementEntryData } from './guided-interview-flow';
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
  Partial<Record<(typeof retirementQcdConfirmations)[number][0], boolean | null>>;

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

export function simplifiedMethodPlanIdentifier(entry: RetirementEntryData): string {
  return JSON.stringify([entry.accountHolder, entry.payerTin?.replaceAll('-', ''), entry.simplifiedMethod?.planReference?.trim().toLowerCase()]);
}

export function isGuidedQualifiedLumpSum(entry: RetirementEntryData): boolean {
  return entry.sourceTaxYear === '2026' && /^(?:[47]A|A[47])$/.test(normalizeGuidedRetirementCode(entry.distributionCode));
}

export function isGuidedQcdStatement(entry: RetirementEntryData): boolean {
  const code = normalizeGuidedRetirementCode(entry.distributionCode);
  return entry.sourceTaxYear === '2026' && (code === 'Y7' || (code === '7' && entry.qcdSource !== undefined));
}

export function isStartedRetirement(entry: RetirementEntryData): boolean {
  return entry.qcdSource !== undefined || entry.simplifiedMethod !== undefined
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
