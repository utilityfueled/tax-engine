import type { RetirementEntryData } from './guided-interview-flow';
import { parseGuidedCurrency } from './guided-currency';

export function isStartedRetirement(entry: RetirementEntryData): boolean {
  return Object.entries(entry).some(([key, value]) => !['requiresCodeConfirmation', 'requiresIraConfirmation'].includes(key) && (typeof value === 'string' ? value.trim() !== '' : value === true));
}
function amount(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  parseGuidedCurrency(value);
  return value.trim().replaceAll(',', '');
}
/** Original source values only. Never replace unknown Box2a with computed tax. */
export function retirementSourceInput(entry: RetirementEntryData) {
  return {
    taxYear: /^\d{4}$/.test(entry.sourceTaxYear ?? '') ? Number(entry.sourceTaxYear) : undefined,
    payer: entry.payer.trim(), payerTin: entry.payerTin?.trim(), accountHolder: entry.accountHolder || undefined,
    accountReference: entry.accountReference?.trim() || undefined,
    grossDistribution: amount(entry.grossDistribution), taxableAmount: amount(entry.taxableAmount), federalWithheld: amount(entry.federalWithheld),
    iraSepSimple: entry.isIraSepSimple ?? undefined, distributionCode: entry.distributionCode.trim().toUpperCase(),
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
