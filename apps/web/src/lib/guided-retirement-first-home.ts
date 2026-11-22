import { Form5329FirstHomeSourceSchema } from "@/models/inputs";
import type { RetirementEntryData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, currentLocalCivilDate, isActualDate } from "./guided-required-facts";

export interface GuidedFirstHomeOriginal {
  payer: string;
  payerTin: string;
  accountReference: string;
  grossDistribution: string;
  ownerBirthDate: string;
  distributionDate: string;
}

export interface GuidedFirstHomeWorksheet {
  original: GuidedFirstHomeOriginal;
  ownHomePurchaseCompleted?: boolean | null;
  unmarriedWithoutMainHomeInterest?: boolean | null;
  noFormerSection1034Suspension?: boolean | null;
  distributionWasNotRolledOver?: boolean | null;
  paidPurchasePriceFromDistribution?: boolean | null;
  bindingContractDate?: string;
  paymentDate?: string;
  paymentAmount?: string;
  priorQualifiedDistributions?: string;
}

export function guidedFirstHomeOriginal(
  entry: RetirementEntryData, ownerBirthDate: string | undefined, earlyReceiptDate: string | undefined,
): GuidedFirstHomeOriginal | undefined {
  if (!ownerBirthDate || !earlyReceiptDate || entry.trumpAccount === true
    || entry.directRolloverConfirmed === true || entry.qualifiedLumpSumReporting != null) {
    return undefined;
  }
  if (entry.excessContributionEarnings?.trim()
    && (amountError(entry.excessContributionEarnings, "excess contribution earnings")
      || !parseGuidedCurrency(entry.excessContributionEarnings).isZero())) {
    return undefined;
  }
  const payer = entry.payer.trim();
  const payerTin = entry.payerTin?.replaceAll("-", "");
  const accountReference = entry.accountReference?.trim();
  if (!payer || !payerTin || !/^\d{9}$/.test(payerTin) || !accountReference) {
    return undefined;
  }
  return {
    payer,
    payerTin,
    accountReference,
    grossDistribution: parseGuidedCurrency(entry.grossDistribution).toFixed(),
    ownerBirthDate,
    distributionDate: earlyReceiptDate,
  };
}

export const guidedFirstHomeOriginalError = "Reconcile the saved first-home IRA worksheet with its original statement, actual receipt date and return, or remove it.";

export function matchesGuidedFirstHomeOriginal(
  worksheet: GuidedFirstHomeWorksheet | undefined, original: GuidedFirstHomeOriginal | undefined,
): boolean {
  const saved = worksheet?.original;
  return !!saved && !!original && saved.payer === original.payer && saved.payerTin === original.payerTin
    && saved.accountReference === original.accountReference && saved.grossDistribution === original.grossDistribution
    && saved.ownerBirthDate === original.ownerBirthDate && saved.distributionDate === original.distributionDate;
}

export function buildGuidedFirstHomeSource(
  worksheet: GuidedFirstHomeWorksheet, original: GuidedFirstHomeOriginal | undefined,
) {
  if (!original || !matchesGuidedFirstHomeOriginal(worksheet, original)) throw new Error(guidedFirstHomeOriginalError);
  if (worksheet.ownHomePurchaseCompleted !== true || worksheet.unmarriedWithoutMainHomeInterest !== true
    || worksheet.noFormerSection1034Suspension !== true || worksheet.distributionWasNotRolledOver !== true
    || worksheet.paidPurchasePriceFromDistribution !== true) {
    throw new Error("Confirm the completed first-home purchase, ownership history and actual payment from the matched IRA proceeds.");
  }
  const { bindingContractDate, paymentDate, paymentAmount, priorQualifiedDistributions } = worksheet;
  if (!isActualDate(original.distributionDate) || !bindingContractDate || !isActualDate(bindingContractDate)
    || !paymentDate || !isActualDate(paymentDate)) {
    throw new Error("Enter the actual binding contract and purchase-price payment dates.");
  }
  const reviewDate = currentLocalCivilDate();
  if (original.distributionDate > reviewDate || bindingContractDate > reviewDate || paymentDate > reviewDate) {
    throw new Error("The IRA receipt, binding contract and purchase payment must have occurred on or before today.");
  }
  const deadline = new Date(`${original.distributionDate}T00:00:00Z`);
  deadline.setUTCDate(deadline.getUTCDate() + 120);
  if (paymentDate < original.distributionDate || paymentDate < bindingContractDate || paymentDate > deadline.toISOString().slice(0, 10)) {
    throw new Error("The first-home payment must be on or after the IRA receipt and binding contract dates and within 120 days after receipt.");
  }
  const missingAmount = amountError(paymentAmount, "purchase price paid from the IRA distribution")
    ?? amountError(priorQualifiedDistributions, "prior lifetime qualifying first-home IRA distributions");
  if (missingAmount) throw new Error(missingAmount);
  const purchasePrice = parseGuidedCurrency(paymentAmount);
  const priorDistributions = parseGuidedCurrency(priorQualifiedDistributions);
  if (purchasePrice.decimalPlaces() > 2 || priorDistributions.decimalPlaces() > 2) {
    throw new Error("Enter first-home payment and prior distribution amounts in dollars and cents.");
  }
  if (!purchasePrice.gt(0) || purchasePrice.gt(original.grossDistribution)) {
    throw new Error("Enter the positive purchase-price amount paid from the matched IRA distribution, up to the total received.");
  }
  return Form5329FirstHomeSourceSchema.parse({
    sourceTaxYear: Number(original.distributionDate.slice(0, 4)),
    owner: "primary",
    accountReference: original.accountReference,
    sourceFactsConfirmed: true,
    distributionReceivedDate: original.distributionDate,
    singleDistributionReceiptConfirmed: true,
    distributionRolledOver: false,
    boughtOwnPrincipalResidence: true,
    purchaseCompleted: true,
    bindingContractDate,
    maritalStatusAtAcquisition: "unmarried",
    buyerHadNoPrincipalResidenceInterest: true,
    noFormerSection1034Suspension: true,
    qualifiedPayment: {
      date: paymentDate, amount: purchasePrice.toFixed(), kind: "purchase_price", paidFromMatchedDistribution: true,
    },
    priorQualifiedFirstTimeHomebuyerDistributions: priorDistributions.toFixed(),
  });
}
