import type { Form5329EducationSource } from "@/models/inputs.js";
import type { CreditsData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, currentLocalCivilDate, hasEnteredAmount, isActualDate } from "./guided-required-facts";
import { matchesGuidedCode1IraOriginal, type GuidedCode1IraOriginal } from "./guided-retirement-first-home";

export { iraEducationOwnerFingerprint as guidedIraEducationOwnerFingerprint } from "@/utils/ira-education-owner.js";
export type GuidedIraEducationOriginal = GuidedCode1IraOriginal & { ownerFingerprint: string };

export interface GuidedIraEducationWorksheet {
  original: GuidedCode1IraOriginal & { ownerFingerprint?: string };
  ordinaryTraditionalIraConfirmed?: boolean | null;
  ownEligibleTuitionConfirmed?: boolean | null;
  refundedOrReimbursed?: boolean | null;
  coveredByEducationAccount?: boolean | null;
  allocatedToEducationCredit?: boolean | null;
  institutionName?: string;
  billAccountReference?: string;
  receiptAccountReference?: string;
  paymentDate?: string;
  billedTuition?: string;
  paidTuition?: string;
  taxFreeAssistance?: string;
}

export const guidedIraEducationOriginalError = "Reconcile the saved college tuition IRA worksheet with the actual primary taxpayer, original statement and receipt date, or remove it.";

export function matchesGuidedIraEducationOriginal(
  worksheet: GuidedIraEducationWorksheet | undefined, original: GuidedIraEducationOriginal | undefined,
): boolean {
  return original !== undefined && worksheet?.original?.ownerFingerprint === original.ownerFingerprint
    && matchesGuidedCode1IraOriginal(worksheet.original, original);
}

export function buildGuidedIraEducationSource(
  worksheet: GuidedIraEducationWorksheet, original: GuidedIraEducationOriginal | undefined, credits?: CreditsData,
): Omit<Form5329EducationSource, "ownerFingerprint"> {
  if (!original || !matchesGuidedIraEducationOriginal(worksheet, original)) throw new Error(guidedIraEducationOriginalError);
  if (worksheet.ordinaryTraditionalIraConfirmed !== true || worksheet.ownEligibleTuitionConfirmed !== true) {
    throw new Error("Confirm the ordinary traditional IRA withdrawal with no rollover and required tuition for your own enrollment at an eligible college.");
  }
  const institutionName = worksheet.institutionName?.trim();
  const billAccountReference = worksheet.billAccountReference?.trim();
  const receiptAccountReference = worksheet.receiptAccountReference?.trim();
  if (!institutionName || !billAccountReference || !receiptAccountReference
    || billAccountReference.toLowerCase() !== receiptAccountReference.toLowerCase()) {
    throw new Error("Enter the eligible college and match the student account references from its bill and posted payment receipt.");
  }
  const { paymentDate, billedTuition, paidTuition, taxFreeAssistance } = worksheet;
  if (!paymentDate || !isActualDate(paymentDate) || !paymentDate.startsWith("2026-") || paymentDate > currentLocalCivilDate()) {
    throw new Error("Enter the actual tuition payment date in 2026, on or before today.");
  }
  const amountIssue = amountError(billedTuition, "tuition charged on the college bill")
    ?? amountError(paidTuition, "tuition paid on the matching receipt")
    ?? amountError(taxFreeAssistance, "tax-free assistance applied to this tuition, including zero");
  if (amountIssue) throw new Error(amountIssue);
  const billed = parseGuidedCurrency(billedTuition);
  const paid = parseGuidedCurrency(paidTuition);
  const taxable = parseGuidedCurrency(original.grossDistribution);
  if (paid.decimalPlaces() > 2 || taxable.decimalPlaces() > 2 || !paid.gt(0) || !paid.eq(billed)) {
    throw new Error("Match the positive tuition billed and paid, and enter tuition and IRA amounts in dollars and cents.");
  }
  if (worksheet.refundedOrReimbursed !== false || worksheet.coveredByEducationAccount !== false
    || worksheet.allocatedToEducationCredit !== false || !parseGuidedCurrency(taxFreeAssistance).isZero()
    || credits?.educationDistributions || credits?.savingsBondEducation || credits?.education?.aocStudents?.length
    || credits?.education?.llcStudents?.length || hasEnteredAmount(credits?.education?.llcExpenses)) {
    throw new Error("This worksheet requires zero assistance and no tuition refunds, education-account payments, or other education-benefit allocations. Reconcile any education sources saved in Credits.");
  }
  return {
    sourceTaxYear: 2026, owner: "primary",
    distribution: {
      payerName: original.payer, payerTin: original.payerTin, accountReference: original.accountReference,
      receiptDate: original.distributionDate, amount: taxable.toFixed(), employeeContributions: "0",
    },
    tuition: {
      institutionName, billAccountReference, receiptAccountReference, paymentDate,
      billedAmount: billed.toFixed(), paidAmount: paid.toFixed(), taxFreeAssistance: "0",
    },
    ordinaryTraditionalIraConfirmed: true, ownEligibleTuitionConfirmed: true,
    refundedOrReimbursed: false, coveredByEducationAccount: false, allocatedToEducationCredit: false,
  };
}
