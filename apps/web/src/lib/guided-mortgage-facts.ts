import Decimal from "decimal.js";
import type { FilingStatus, MortgageEntryData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, isActualDate } from "./guided-required-facts";

export const mortgagePointFacts = {
  pointsOnMainHome: "Were the points for a loan secured by your main home?",
  pointsEstablishedPractice: "Is paying points an established business practice in the area?",
  pointsWithinUsualAmount: "Were the points no more than the amount generally charged in the area?",
  pointsCashMethod: "Do you use the cash method of accounting?",
  pointsNotServiceFees: "Were the points separate from service fees normally stated separately?",
  pointsOwnFundsSufficient: "Did your funds not borrowed from the lender or broker, plus seller-paid points, cover the points?",
  pointsPurchaseMainHome: "Was this loan used to buy or build your main home?",
  pointsPercentageOfPrincipal: "Were the points figured as a percentage of mortgage principal?",
  pointsOnSettlementStatement: "Does the settlement statement clearly identify these points?",
  pointsFullDeductionElected: "Do you elect to deduct these qualifying points in full this year?",
} as const;

export type MortgageSourceData = {
  sourceTaxYear?: string;
  accountReference?: string;
  accountHolder?: "" | "primary" | "spouse" | "joint";
  propertyAddress?: string;
  propertyUse?: "" | "main-home" | "second-home" | "other";
  loanType?: "" | "original" | "refinance" | "heloc" | "reverse" | "other";
  proceedsUse?: "" | "acquisition" | "mixed" | "other";
  securedDebt?: boolean | null;
  ownershipInterest?: boolean | null;
  obligationToRepay?: boolean | null;
  interestPaidByReturn?: boolean | null;
  currentYearInterestOnly?: boolean | null;
  rentalOrBusinessUse?: boolean | null;
  mortgageCreditCertificate?: boolean | null;
  specialCircumstances?: boolean | null;
  maximumBalanceDuringYear?: string;
  balanceMethod?: "" | "highest_balance" | "lender_average";
  lenderAverageBalance?: string;
  balanceSourceReference?: string;
  interestPaidByReturnAmount?: string;
  interestPaidByOthers?: string;
  interestDeductedElsewhere?: string;
  sameYearInterestRefund?: string;
  nonqualifiedInterest?: string;
  pointsPaidByReturnAmount?: string;
  pointsPaidByOthers?: string;
  pointsNotInterest?: string;
  pointsPaidDate?: string;
  pointsUse?: "" | "purchase" | "build";
  bindingContractApplies?: boolean | null;
  bindingContractSignedDate?: string;
  bindingContractRequiredClosingDate?: string;
  bindingContractPurchaseDate?: string;
  refundOfOverpaidInterest?: string;
  mortgageInsurancePremiums?: string;
  pointsPaid?: string;
  propertyTaxPaid?: string;
  propertyTaxDisbursementConfirmed?: boolean | null;
  hasMortgageInsuranceAllocation?: boolean | null;
  insuranceContractIssueDate?: string;
  insuranceAllocationTaxYear?: string;
  insuranceQualifiedProvider?: boolean | null;
  insuranceAcquisitionDebt?: boolean | null;
  insuranceQualifiedResidence?: boolean | null;
  insurancePremiumsAllocableToYear?: string;
  sourceFactsConfirmed?: boolean | null;
} & Partial<Record<keyof typeof mortgagePointFacts, boolean | null>>;

/** Bounded ordinary acquisition debt only; never reinterpret Box 2 as an average. */
export function mortgageFactErrors(entries: MortgageEntryData[], taxYear?: number | null, filingStatus?: FilingStatus | null, sourceWorksheet = false): Record<string, string> {
  const errors: Record<string, string> = {};
  const loans = new Set<string>();
  const homes = { "main-home": new Set<string>(), "second-home": new Set<string>() };
  let maximumDebt = new Decimal(0);
  let balancesKnown = true;
  for (const [index, entry] of entries.entries()) {
    const error = (key: string, message: string) => { errors[`mortgage-${index}-${key}`] = message; };
    for (const [field, label] of [["lender", "mortgage lender"], ["accountReference", "loan account reference"], ["propertyAddress", "property securing this mortgage"]] as const) {
      if (!entry[field]?.trim()) error(field, `Enter the actual ${label}.`);
    }
    const loanKey = `${entry.lender?.trim().toLowerCase()}|${entry.accountReference?.trim().toLowerCase()}`;
    if (entry.accountReference?.trim() && loans.has(loanKey)) error("duplicate", "Reconcile duplicate mortgage statements for the same loan before calculating.");
    loans.add(loanKey);
    const year = /^20\d{2}$/.test(entry.sourceTaxYear ?? "") ? Number(entry.sourceTaxYear) : undefined;
    if (!year || ![2025, 2026].includes(year) || (taxYear != null && year !== taxYear)) error("year", "Confirm the actual mortgage statement year matches this return.");
    if (!["primary", "spouse", "joint"].includes(entry.accountHolder ?? "")) error("owner", "Confirm the actual borrowers whose payment is claimed on this return.");
    if (filingStatus && filingStatus !== "mfj" && entry.accountHolder !== "primary") error("owner", "A spouse or joint borrower allocation needs its actual separate payment worksheet; this ordinary path supports this taxpayer's payments only.");
    if (!["main-home", "second-home"].includes(entry.propertyUse ?? "")) error("property-use", "Confirm an actual qualified main or second home; other property uses need their supporting worksheet.");
    else homes[entry.propertyUse as keyof typeof homes].add(entry.propertyAddress?.trim().toLowerCase().replace(/\s+/g, " ") ?? "");
    if (entry.loanType !== "original") error("loan-type", "Refinanced, home-equity, reverse and other loans need their original debt and use worksheets; this ordinary mortgage path cannot calculate them yet.");
    if (entry.proceedsUse !== "acquisition") error("proceeds", "Confirm all proceeds bought, built or substantially improved the home securing this loan. Mixed or other uses need a separate allocation worksheet.");
    for (const [field, label] of [
      ["securedDebt", "legally secured debt on this home"], ["ownershipInterest", "an ownership interest in this home"],
      ["obligationToRepay", "a genuine obligation and intention to repay the debt"],
      ["interestPaidByReturn", "the claimed payment share was paid by taxpayers on this return"],
      ["currentYearInterestOnly", "the source interest is deductible payment for this year, with no prepaid interest for a later year"],
    ] as const) if (entry[field] !== true) error(field, `This ordinary route requires actual confirmation of ${label}.`);
    for (const [field, label] of [["rentalOrBusinessUse", "rental or business use"], ["mortgageCreditCertificate", "a mortgage credit certificate"], ["specialCircumstances", "cooperative, construction, ground-rent or other special mortgage rules"]] as const) {
      if (entry[field] !== false) error(field, `Confirm whether ${label} applies. An applicable or unknown special rule requires its source worksheet before this ordinary path can calculate.`);
    }
    for (const [field, label] of [
      ["mortgageInterest", "mortgage interest, Box 1"], ["outstandingPrincipal", "mortgage principal, Box 2"],
      ["maximumBalanceDuringYear", "maximum loan balance at any time during the tax year"],
      ["refundOfOverpaidInterest", "prior-year interest refund, Box 4"], ["mortgageInsurancePremiums", "mortgage insurance premiums, Box 5"],
      ["pointsPaid", "purchase points, Box 6"], ["propertyTaxPaid", "qualified real estate taxes actually paid from this mortgage account"],
    ] as const) {
      if (sourceWorksheet && field === "maximumBalanceDuringYear" && entry.balanceMethod === "lender_average") continue;
      const message = amountError(entry[field], label);
      if (message) error(field, message);
    }
    if (!isActualDate(entry.originationDate) || (year && entry.originationDate > `${year}-12-31`)) error("date", "Enter the actual mortgage origination date, no later than the statement year.");
    if (entry.originationDate <= "1987-10-13") error("grandfathered", "Grandfathered debt needs its original balance and use worksheet before this path can calculate.");
    const validAmount = (field: "maximumBalanceDuringYear" | "outstandingPrincipal" | "refundOfOverpaidInterest" | "pointsPaid" | "propertyTaxPaid" | "mortgageInsurancePremiums") => !amountError(entry[field], field);
    if (validAmount("maximumBalanceDuringYear")) {
      maximumDebt = maximumDebt.plus(parseGuidedCurrency(entry.maximumBalanceDuringYear));
      if (validAmount("outstandingPrincipal") && parseGuidedCurrency(entry.maximumBalanceDuringYear).lt(parseGuidedCurrency(entry.outstandingPrincipal))) error("maximum", "The maximum balance cannot be less than the actual Box 2 balance.");
    } else balancesKnown = false;
    if (validAmount("refundOfOverpaidInterest") && parseGuidedCurrency(entry.refundOfOverpaidInterest).gt(0)) error("refund", "A prior-year interest refund needs its tax-benefit recovery worksheet; retain the actual refund until that route is supported.");
    if (validAmount("propertyTaxPaid") && parseGuidedCurrency(entry.propertyTaxPaid).gt(0) && entry.propertyTaxDisbursementConfirmed !== true) error("property-tax", "Confirm actual qualified real estate tax disbursements, excluding escrow deposits, fees, assessments and amounts entered elsewhere.");
    const ownPoints = sourceWorksheet && !amountError(entry.pointsPaidByReturnAmount, "points") && !amountError(entry.pointsNotInterest, "point fees")
      ? parseGuidedCurrency(entry.pointsPaidByReturnAmount).minus(parseGuidedCurrency(entry.pointsNotInterest)) : parseGuidedCurrency(validAmount("pointsPaid") ? entry.pointsPaid : "0");
    if (validAmount("pointsPaid") && ownPoints.gt(0)) {
      if (entry.propertyUse !== "main-home") error("points-home", "Purchase points on a second home need their actual amortization worksheet; they cannot use the main-home full-deduction route.");
      if (!year || !entry.originationDate.startsWith(`${year}-`)) error("points-year", "Prior-loan points need their actual amortization history; only qualifying current-year purchase points are supported here.");
      for (const field of Object.keys(mortgagePointFacts) as (keyof typeof mortgagePointFacts)[]) if (entry[field] !== true) error(field, "Confirm every full-deduction purchase-points condition. Other points require an amortization or allocation worksheet.");
    }
    if (year === 2026) {
      if (typeof entry.hasMortgageInsuranceAllocation !== "boolean") error("insurance-review", "Confirm whether current or prepaid mortgage insurance premiums need evaluation for this year.");
      if (entry.hasMortgageInsuranceAllocation === false && validAmount("mortgageInsurancePremiums") && parseGuidedCurrency(entry.mortgageInsurancePremiums).gt(0)) error("insurance-review", "Positive Box 5 premiums require the actual contract and annual allocation facts.");
      if (entry.hasMortgageInsuranceAllocation === false && !amountError(entry.insurancePremiumsAllocableToYear, "insurance allocation") && parseGuidedCurrency(entry.insurancePremiumsAllocableToYear).gt(0)) error("insurance-review", "Reconcile the saved positive annual insurance allocation before saying no premiums need evaluation.");
      if (entry.hasMortgageInsuranceAllocation === true) {
        if (entry.insuranceAllocationTaxYear !== entry.sourceTaxYear) error("insurance-year", "Enter the actual insurance allocation year matching this return.");
        if (!isActualDate(entry.insuranceContractIssueDate) || entry.insuranceContractIssueDate! > `${year}-12-31`) error("insurance-contract", "Enter the actual mortgage-insurance contract issue date.");
        for (const field of ["insuranceQualifiedProvider", "insuranceAcquisitionDebt", "insuranceQualifiedResidence"] as const) if (typeof entry[field] !== "boolean") error(field, "Confirm the actual insurance provider, acquisition-debt and qualified-residence facts.");
        const message = amountError(entry.insurancePremiumsAllocableToYear, "insurance premiums allocable to this tax year after any prepaid-premium allocation");
        if (message) error("insurance-allocation", message);
      }
    }
    if (entry.sourceFactsConfirmed !== true) error("confirmation", "Confirm the complete mortgage statement and qualification facts after the last edit.");
  }
  if (homes["main-home"].size > 1 || homes["second-home"].size > 1) errors.mortgageHomes = "More than one main or second home needs the actual qualified-home timing and election worksheet.";
  // This conservative bound supports the fully deductible path without inventing
  // an average balance or assuming the old debt category survives refinancing.
  const bound = filingStatus === "mfs" ? "375000" : "750000";
  if (!sourceWorksheet && balancesKnown && maximumDebt.gt(bound)) errors.mortgageDebtLimit = "The combined actual maximum balances exceed this ordinary route's debt bound. The Pub. 936 debt-limit worksheet is required; Box 2 cannot substitute for it.";
  return errors;
}
