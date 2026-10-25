import { Form1098Schema, MortgageInterestWorksheetSchema } from "@/models/inputs";
import { calculateHomeMortgageInterest } from "@/engine/forms/home-mortgage-interest";
import type { DeductionData, FilingStatus, MortgageEntryData } from "./guided-interview-flow";
import { mortgageFactErrors, mortgagePointFacts } from "./guided-mortgage-facts";
import { amountError, hasEnteredAmount, isActualDate } from "./guided-required-facts";
import { parseGuidedCurrency } from "./guided-currency";

export interface MortgageWorksheetData {
  sourceTaxYear: string;
  sourceReference: string;
  allHomeDebtIncluded: boolean | null;
  priorYearInterestRecoveriesPresent: boolean | null;
  sourceFactsConfirmed: boolean | null;
}
export const emptyMortgageWorksheet: MortgageWorksheetData = { sourceTaxYear: "", sourceReference: "", allHomeDebtIncluded: null, priorYearInterestRecoveriesPresent: null, sourceFactsConfirmed: null };
export type MortgageDeductionData = DeductionData & { mortgageWorksheet?: MortgageWorksheetData };
export const mortgagePaymentAmounts = {
  interestPaidByReturnAmount: "Actual Box 1 interest paid by taxpayers on this return",
  interestPaidByOthers: "Actual Box 1 interest paid by other returns",
  interestDeductedElsewhere: "Interest from this return's share deducted on another schedule",
  sameYearInterestRefund: "Refund of this year's interest paid by this return",
  nonqualifiedInterest: "Other ineligible interest in this return's paid share",
  pointsPaidByReturnAmount: "Box 6 points allocable to this return, including qualifying seller-paid points",
  pointsPaidByOthers: "Box 6 points allocable to another return",
  pointsNotInterest: "Service fees or other noninterest amounts in this return's points share",
} as const;
const statuses = { single: "single", mfj: "married_filing_jointly", mfs: "married_filing_separately", hoh: "head_of_household", qss: "qualifying_surviving_spouse" } as const;
const sourceIdentity = (entry: MortgageEntryData) => `${entry.lender.trim()}:${entry.accountReference?.trim() ?? ""}`;
function money(value: string | undefined, label: string): string {
  const error = amountError(value, label); if (error) throw new Error(error);
  return parseGuidedCurrency(value).toFixed();
}

/** Source-only context: never creates a taxpayer identity to validate a worksheet. */
export function buildGuidedMortgageInputs(data: MortgageDeductionData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, spouse?: unknown) {
  if (data?.mortgageWorksheet?.priorYearInterestRecoveriesPresent === true || data?.mortgageEntries?.some(entry => !amountError(entry.refundOfOverpaidInterest, "earlier-year refund") && parseGuidedCurrency(entry.refundOfOverpaidInterest).gt(0))) throw new Error("The actual prior-year mortgage interest refund or recovery requires its tax-benefit worksheet, regardless of this year's deduction election.");
  if (data?.method === "standard" && data.mortgageEntries?.some(entry => amountError(entry.refundOfOverpaidInterest, "actual earlier-year interest refund"))) throw new Error("The earlier-year interest refund on a saved mortgage source is unknown; confirm the actual source before excluding possible recovery income.");
  if (data?.method === "itemized" && !data.mortgageEntries?.length && hasEnteredAmount(data.mortgageInterest) && parseGuidedCurrency(money(data.mortgageInterest, "saved mortgage interest")).gt(0)) throw new Error("Enter actual mortgage source records to reconcile the saved interest total.");
  if (!data || data.method !== "itemized" || !(data.mortgageEntries?.length)) return { form1098: [] };
  if ((taxYear !== 2025 && taxYear !== 2026) || !filingStatus) throw new Error("Confirm the actual return year and filing status for the mortgage worksheet.");
  const errors = mortgageFactErrors(data.mortgageEntries, taxYear, filingStatus, true);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const root = data.mortgageWorksheet;
  if (!root || root.sourceTaxYear !== String(taxYear) || !root.sourceReference.trim() || root.allHomeDebtIncluded !== true || root.sourceFactsConfirmed !== true) throw new Error("Complete and confirm the actual mortgage worksheet year, source reference and all-home-debt records.");
  if (root.priorYearInterestRecoveriesPresent !== false) throw new Error("Confirm actual prior-year interest recoveries. A positive or unknown recovery requires its tax-benefit worksheet before this ordinary route can calculate.");
  const form1098 = data.mortgageEntries.map(entry => Form1098Schema.parse({
    sourceId: sourceIdentity(entry), taxYear: Number(entry.sourceTaxYear), lender: entry.lender.trim(), mortgageInterestReceived: money(entry.mortgageInterest, "Form 1098 Box 1"),
    outstandingMortgagePrincipal: money(entry.outstandingPrincipal, "Form 1098 Box 2"), mortgageOriginationDate: entry.originationDate,
    refundOfOverpaidInterest: money(entry.refundOfOverpaidInterest, "Form 1098 Box 4"), mortgageInsurancePremiums: money(entry.mortgageInsurancePremiums, "Form 1098 Box 5"),
    pointsPaid: money(entry.pointsPaid, "Form 1098 Box 6"), propertyTax: money(entry.propertyTaxPaid, "actual qualified real estate tax disbursements"),
    ...(taxYear === 2026 && entry.hasMortgageInsuranceAllocation === true ? { mortgageInsuranceQualification: {
      allocationTaxYear: Number(entry.insuranceAllocationTaxYear), contractIssueDate: entry.insuranceContractIssueDate,
      qualifiedProvider: entry.insuranceQualifiedProvider, acquisitionDebt: entry.insuranceAcquisitionDebt, qualifiedResidence: entry.insuranceQualifiedResidence,
      premiumsAllocableToYear: money(entry.insurancePremiumsAllocableToYear, "annual mortgage insurance allocation"),
    } } : {}),
  }));
  if (hasEnteredAmount(data.mortgageInterest) && !form1098.reduce((sum, form) => sum.plus(form.mortgageInterestReceived), parseGuidedCurrency("0")).eq(money(data.mortgageInterest, "saved mortgage interest"))) throw new Error("Reconcile the saved mortgage interest total with the original statement amounts.");
  const loans = data.mortgageEntries.map(entry => {
    const amounts = Object.fromEntries(Object.entries(mortgagePaymentAmounts).map(([field, label]) => [field, money(entry[field as keyof typeof mortgagePaymentAmounts], label)])) as Record<keyof typeof mortgagePaymentAmounts, string>;
    if (entry.balanceMethod !== "highest_balance" && entry.balanceMethod !== "lender_average") throw new Error("Select the actual mortgage balance method; Box 2 cannot establish it.");
    if (!entry.balanceSourceReference?.trim()) throw new Error("Enter the actual annual balance source reference.");
    const balance = { method: entry.balanceMethod, amount: money(entry.balanceMethod === "highest_balance" ? entry.maximumBalanceDuringYear : entry.lenderAverageBalance, "actual mortgage balance for the selected method"), sourceReference: entry.balanceSourceReference.trim() };
    if (entry.balanceMethod === "lender_average" && entry.maximumBalanceDuringYear?.trim() && !amountError(entry.maximumBalanceDuringYear, "maximum balance") && parseGuidedCurrency(balance.amount).gt(parseGuidedCurrency(entry.maximumBalanceDuringYear))) throw new Error("The actual lender average exceeds the saved maximum balance; reconcile these sources.");
    const positivePoints = parseGuidedCurrency(amounts.pointsPaidByReturnAmount).minus(amounts.pointsNotInterest).gt(0);
    if (positivePoints && (!isActualDate(entry.pointsPaidDate) || !entry.pointsPaidDate!.startsWith(`${taxYear}-`) || !["purchase", "build"].includes(entry.pointsUse ?? ""))) throw new Error("Enter the actual points payment date in this tax year and whether the loan purchased or built the main home.");
    if (positivePoints && Object.keys(mortgagePointFacts).some(field => entry[field as keyof typeof mortgagePointFacts] !== true)) throw new Error("Confirm every current-year points qualification condition.");
    const transition = entry.originationDate >= "2017-12-16" && entry.originationDate < "2018-04-01";
    if (transition && typeof entry.bindingContractApplies !== "boolean") throw new Error("Confirm whether the actual 2017 binding-contract transition applies to this loan.");
    if (!transition && entry.bindingContractApplies === true) throw new Error("The saved binding-contract transition conflicts with this loan's origination date; reconcile the actual dates.");
    const bindingContract = entry.bindingContractApplies === true ? { signedDate: entry.bindingContractSignedDate, requiredClosingDate: entry.bindingContractRequiredClosingDate, purchaseDate: entry.bindingContractPurchaseDate } : undefined;
    if (bindingContract && Object.values(bindingContract).some(value => !isActualDate(value))) throw new Error("Enter all actual binding-contract, required-closing and purchase dates.");
    return { sourceId: sourceIdentity(entry), form1098SourceId: sourceIdentity(entry), lenderName: entry.lender.trim(), accountHolder: entry.accountHolder,
      homeId: entry.propertyAddress!.trim().toLowerCase().replace(/\s+/g, " "), homeUse: entry.propertyUse === "main-home" ? "main" : "second", qualifiedResidence: true,
      securedDebt: entry.securedDebt, ownershipInterest: entry.ownershipInterest, obligationToRepay: entry.obligationToRepay,
      originationDate: entry.originationDate, loanType: "original", acquisitionUse: entry.proceedsUse === "acquisition", currentYearInterestOnly: entry.currentYearInterestOnly,
      interestPaid: amounts.interestPaidByReturnAmount, interestPaidByOthers: amounts.interestPaidByOthers, interestDeductedElsewhere: amounts.interestDeductedElsewhere,
      sameYearInterestRefund: amounts.sameYearInterestRefund, nonqualifiedInterest: amounts.nonqualifiedInterest, pointsPaid: amounts.pointsPaidByReturnAmount,
      pointsPaidByOthers: amounts.pointsPaidByOthers, pointsNotInterest: amounts.pointsNotInterest,
      points: positivePoints ? { method: "current_year", cashMethod: entry.pointsCashMethod, establishedPractice: entry.pointsEstablishedPractice, withinUsualAmount: entry.pointsWithinUsualAmount,
        notServiceFees: entry.pointsNotServiceFees, ownFundsSufficient: entry.pointsOwnFundsSufficient, buyBuildOrImproveMainHome: entry.pointsUse, percentageOfPrincipal: entry.pointsPercentageOfPrincipal,
        onSettlementStatement: entry.pointsOnSettlementStatement, fullDeductionElected: entry.pointsFullDeductionElected, paidDate: entry.pointsPaidDate } : { method: "none" }, balance,
      ...(bindingContract ? { bindingContract } : {}),
    };
  });
  const mortgageInterestWorksheet = MortgageInterestWorksheetSchema.parse({ sourceTaxYear: Number(root.sourceTaxYear), sourceReference: root.sourceReference.trim(), sourceFactsConfirmed: root.sourceFactsConfirmed, allHomeDebtIncluded: root.allHomeDebtIncluded, loans, priorYearInterestRecoveries: [] });
  calculateHomeMortgageInterest({ taxpayer: { taxYear, filingStatus: statuses[filingStatus], spouse }, form1098, mortgageInterestWorksheet, form1099Misc: [] });
  return { form1098, mortgageInterestWorksheet };
}

export function mortgageWorksheetFactErrors(data: MortgageDeductionData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, spouse?: unknown): Record<string, string> {
  try { buildGuidedMortgageInputs(data, taxYear, filingStatus, spouse); return {}; }
  catch (error) { return { mortgageWorksheet: error instanceof Error ? error.message : "Complete the actual mortgage source worksheet." }; }
}
