import type { RetirementEntryData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { normalizeGuidedRetirementCode } from "./guided-retirement-source-inputs";
import { amountError, currentLocalCivilDate, isActualDate } from "./guided-required-facts";
import { guidedSourceValuesChanged } from "./guided-source-confirmation";

interface GuidedDisabilityPensionOriginal {
  sourceTaxYear: "2026";
  payer: string;
  payerTin: string;
  accountReference: string;
  ownerFingerprint: string;
  ownerBirthDate: string;
  grossDistribution: string;
  taxableAmount: string;
  federalWithheld: string;
}

export interface GuidedDisabilityPensionWorksheet {
  original: GuidedDisabilityPensionOriginal;
  planReference?: string;
  employerDisabilityPensionConfirmed?: boolean | null;
  singlePaymentConfirmed?: boolean | null;
  minimumRetirementDate?: string;
  paymentDate?: string;
  publicSafetyOfficerExclusionElected?: boolean | null;
}

export const guidedDisabilityPensionOriginalError = "Reconcile the saved disability pension worksheet with the current taxpayer and actual 2026 Code 3 statement, or remove it.";
export const guidedDisabilityPensionPublicSafetyOfficerReview = "Have a tax professional review the employer plan and paid premium records for the retired public safety officer exclusion.";

export function guidedDisabilityPensionOriginal(
  entry: RetirementEntryData, ownerBirthDate?: string, ownerFingerprint?: string,
): GuidedDisabilityPensionOriginal | undefined {
  if (!ownerBirthDate || !ownerFingerprint || entry.sourceTaxYear !== "2026" || entry.accountHolder !== "primary"
    || normalizeGuidedRetirementCode(entry.distributionCode) !== "3" || entry.isIraSepSimple !== false
    || entry.requiresCodeConfirmation || entry.requiresIraConfirmation || entry.taxableAmountNotDetermined !== false
    || entry.taxableAmountConfirmed !== true || entry.eligibleGovernmental457bPlan !== false
    || entry.militaryPensionOrSurvivorBenefit !== false || entry.qualifiedJointSurvivorAnnuity !== false
    || entry.trumpAccount !== false || entry.directRolloverConfirmed === true || entry.qualifiedLumpSumReporting
    || entry.simplifiedMethod || entry.qcdSource || entry.code1IraAgeSource || entry.code1IraFirstHomeSource || entry.code1IraEducationSource
    || amountError(entry.grossDistribution, "Box 1") || amountError(entry.taxableAmount, "Box 2a")
    || amountError(entry.federalWithheld, "Box 4")) return undefined;

  const payer = entry.payer.trim();
  const payerTin = entry.payerTin?.trim().replaceAll("-", "") ?? "";
  const accountReference = entry.accountReference?.trim();
  const grossDistribution = parseGuidedCurrency(entry.grossDistribution);
  const taxableAmount = parseGuidedCurrency(entry.taxableAmount);
  if (!payer || !/^\d{9}$/.test(payerTin) || !accountReference || !taxableAmount.gt(0) || taxableAmount.gt(grossDistribution)) return undefined;

  return {
    sourceTaxYear: "2026", payer, payerTin, accountReference, ownerFingerprint, ownerBirthDate,
    grossDistribution: grossDistribution.toFixed(), taxableAmount: taxableAmount.toFixed(),
    federalWithheld: parseGuidedCurrency(entry.federalWithheld).toFixed(),
  };
}

export function matchesGuidedDisabilityPensionOriginal(
  worksheet: GuidedDisabilityPensionWorksheet, original: GuidedDisabilityPensionOriginal | undefined,
): boolean {
  return original !== undefined && !guidedSourceValuesChanged(worksheet?.original, original);
}

export function buildGuidedDisabilityPensionSource(
  worksheet: GuidedDisabilityPensionWorksheet | undefined, original: GuidedDisabilityPensionOriginal | undefined,
) {
  if (!original) {
    throw new Error(worksheet ? guidedDisabilityPensionOriginalError : "This worksheet covers one primary taxpayer’s 2026 employer disability pension on a nonjoint return. Complete the statement facts or use separate retirement review.");
  }
  if (!worksheet) throw new Error("Enter the actual employer disability pension worksheet for this 2026 Code 3 statement.");
  if (!matchesGuidedDisabilityPensionOriginal(worksheet, original)) throw new Error(guidedDisabilityPensionOriginalError);
  if (!worksheet.planReference?.trim() || worksheet.employerDisabilityPensionConfirmed !== true || worksheet.singlePaymentConfirmed !== true) {
    throw new Error("Confirm the employer's disability pension record and that Box 1 covers only the single documented payment.");
  }
  const { minimumRetirementDate, paymentDate } = worksheet;
  if (!minimumRetirementDate || !isActualDate(minimumRetirementDate) || minimumRetirementDate <= original.ownerBirthDate) {
    throw new Error("Enter the recipient's actual minimum retirement date documented by the employer plan.");
  }
  if (!paymentDate || !isActualDate(paymentDate) || !paymentDate.startsWith("2026-")
    || paymentDate < original.ownerBirthDate || paymentDate > currentLocalCivilDate() || paymentDate >= minimumRetirementDate) {
    throw new Error("Enter the actual 2026 payment date on or before today and before the documented minimum retirement date.");
  }
  if (worksheet.publicSafetyOfficerExclusionElected === true) throw new Error(guidedDisabilityPensionPublicSafetyOfficerReview);
  if (worksheet.publicSafetyOfficerExclusionElected !== false) {
    throw new Error("Confirm whether you are electing the retired public safety officer insurance premium exclusion for this pension.");
  }
  return { distributionDate: paymentDate, disabilityPensionBeforeMinimumRetirementAge: true as const };
}
