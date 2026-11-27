import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { SECTION45W_OPERATING_EXPENSES } from "@/models/schedule-c-section45w-first-year";
import { isStartedNec } from "./guided-compensation-reporting";
import { parseGuidedCurrency } from "./guided-currency";
import type { GuidedFlowState } from "./guided-interview-flow";
import type { CommercialVehicleOriginal } from "./guided-vehicle-facts";

export interface GuidedCommercialScheduleCLink {
  taxpayerReference?: string;
  ownerRecordReference?: string;
  activityReference?: string;
  ledgerRecordReference?: string;
  sameOwnerAndVehicleConfirmed?: boolean | null;
  scopeAndAmountsConfirmed?: boolean | null;
  reviewedFingerprint?: string;
}

export function guidedCommercialScheduleCContext(state: GuidedFlowState) {
  return {
    taxYear: state.taxYear,
    filingStatus: state.segmentation.filingStatus,
    personal: state.sectionData["personal-info"],
    business: state.segmentation.incomeTypes.includes("self-employment") ? state.sectionData["income-self-employment"] : undefined,
  };
}

export type GuidedCommercialScheduleCContext = ReturnType<typeof guidedCommercialScheduleCContext>;

const trim = (value: string | undefined) => typeof value === "string" ? value.trim() : "";
const allowedExpenses = new Set<string>(SECTION45W_OPERATING_EXPENSES);

function actualAmount(value: string | undefined): string | undefined {
  if (!trim(value)) return undefined;
  try {
    const exact = parseGuidedCurrency(value);
    const normalized = exact.toFixed();
    return /^\d{1,12}(?:\.\d{1,2})?$/u.test(normalized) ? normalized : undefined;
  } catch { return undefined; }
}

export function reviewCommercialScheduleCLink(original: CommercialVehicleOriginal, context: GuidedCommercialScheduleCContext) {
  const { personal, business } = context;
  const facts = business?.businessFacts;
  const header = facts?.scheduleCSourceFacts;
  if (context.taxYear !== 2026 || context.filingStatus !== "single" || !personal || personal.spouse
    || !business || !facts || !header || facts.accountHolder !== "primary" || facts.accountingMethod !== "cash"
    || facts.singleBusinessConfirmed !== true || facts.allInvestmentAtRisk !== true
    || facts.incomeReconciled !== true || facts.expensesReconciled !== true
    || header.sourceTaxYear !== 2026 || header.accountHolder !== "primary" || header.sourceFactsConfirmed !== true) {
    return { message: "Complete and confirm your original 2026 primary cash Schedule C records before linking the commercial vehicle." };
  }
  const ownerName = `${trim(personal.firstName)} ${trim(personal.lastName)}`;
  const businessName = trim(facts.businessName);
  const ein = trim(facts.ein);
  const activity = trim(facts.activityDescription);
  const sourceReference = trim(header.sourceReference);
  if (!trim(personal.firstName) || !trim(personal.lastName) || !/^(?:\d{9}|\d{3}-\d{2}-\d{4})$/u.test(trim(personal.ssn))
    || header.ownerName !== ownerName || !activity || !/^\d{6}$/u.test(facts.businessCode ?? "") || !sourceReference
    || (businessName ? header.businessNameStatus !== "reported" || header.businessName !== businessName : header.businessNameStatus !== "blank_original" || trim(header.businessName))
    || (ein ? !/^\d{2}-?\d{7}$/u.test(ein) || header.businessEINStatus !== "reported" || header.businessEIN !== ein : header.businessEINStatus !== "not_issued" || trim(header.businessEIN))) {
    return { message: "Reconcile the actual primary owner, business identity and original Schedule C reference before linking the vehicle." };
  }

  const outsideExpenses = Object.entries(business.expenses ?? {}).filter(([key]) => !allowedExpenses.has(key)).map(([, value]) => value);
  if (business.necEntries?.some(isStartedNec) || business.cardTipSource || facts.standardMileage || facts.professionalWagering
    || facts.homeOfficeRenter || facts.goodwillAmortization || facts.macrsAssets || facts.passengerSources
    || (facts.depreciationMethod && facts.depreciationMethod !== "manual")
    || header.passengerFirstYear || header.depreciation || header.amortization || header.interest || header.ordinaryExpenses
    || [...outsideExpenses, facts.returnsAndAllowances, facts.costOfGoodsSold, facts.otherIncome, facts.contractLabor, facts.depreciation,
      facts.legalAndProfessional, facts.businessInterest, facts.w2WagesPaid].some(value => trim(value) && actualAmount(value) !== "0")) {
    return { message: "The commercial vehicle link requires a cash receipts and operating ledger without separate compensation records, vehicle deductions or other expense sources." };
  }
  const grossReceipts = actualAmount(business.manualGrossReceipts);
  const advertising = actualAmount(business.expenses?.advertising);
  const officeExpense = actualAmount(business.expenses?.officeExpense);
  const supplies = actualAmount(business.expenses?.supplies);
  if (grossReceipts === undefined || advertising === undefined || officeExpense === undefined || supplies === undefined) {
    return { message: "Enter the actual cash receipts, advertising, office and supply amounts, including any confirmed zero amounts." };
  }
  const summary = { ownerName, activity, sourceReference, grossReceipts, advertising, officeExpense, supplies };
  const link = original.scheduleCLink;
  const references = [link?.taxpayerReference, link?.ownerRecordReference, link?.activityReference, link?.ledgerRecordReference].map(trim);
  if (references.some(reference => !reference) || link?.sameOwnerAndVehicleConfirmed !== true || link.scopeAndAmountsConfirmed !== true) {
    return { summary, message: "Confirm the original owner and Schedule C cash ledger against the saved commercial vehicle records." };
  }

  // Persist only the binding of these originals, without copying the taxpayer's identification number.
  const binding = ["guided-45w-schedule-c-v1", trim(personal.ssn).replaceAll("-", ""), facts.businessCode, businessName, ein, summary,
    trim(original.vin).toUpperCase(), original.bindingContractDate, trim(original.bindingContractReference), original.paymentDate,
    trim(original.paymentReference), original.datePlacedInService, trim(original.placedInServiceReference), references];
  const fingerprint = bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(binding))));
  return {
    summary,
    fingerprint,
    message: link.reviewedFingerprint === fingerprint
      ? "Schedule C owner and cash ledger linked. Commercial vehicle calculation remains on hold until vehicle eligibility, original basis, depreciation, AMT and current credit records are linked."
      : "Confirm the current Schedule C owner and cash ledger before linking these commercial vehicle originals.",
  };
}
