import { buildVehicleRefinancingSources, type VehicleRefinancingData } from "./guided-vehicle-refinancing";
import { calculateVehicleRefinancing } from "@/engine/forms/vehicle-refinancing";
import { Schedule1ASchema, type Schedule1AInput } from "@/models/inputs";
import { sumSourceMoney } from "@/utils/sum-source-money";
import { isQualifiedTippedOccupationCode } from "@/utils/tipped-occupation-code.js";
import type { GuidedFlowState } from "./guided-interview-flow";
import { amountError, hasEnteredAmount } from "./guided-required-facts";
import { parseGuidedCurrency } from "./guided-currency";
import { isStartedNec } from "./guided-business-facts";
import { buildGuidedCardTipSource, cardTipStatementId, exactCardTipMoney } from "./guided-card-tip-source";
import { buildTipIncomeInputs, buildTipIncomeSourceOriginals } from "./guided-tip-income-facts";
import { buildStandardDeductionFacts } from "./guided-standard-deduction-facts";
import { guidedSourceValuesChanged } from "./guided-source-confirmation";
import Decimal from "decimal.js";
type Owner = "primary" | "spouse";
type TipQualificationData = { owner: "" | Owner; occupationCode: string; eligibleOccupation: boolean | null; voluntaryCashTips: boolean | null; lawfulActivity: boolean | null; meetsSstbRuleOrTransition: boolean | null };
export interface EmployeeTipDeductionData extends TipQualificationData { employer: string; w2SourceIds: string[]; form4137EmployerSourceId: string; reportingMethod: "" | "w2" | "employer_statement" | "form4070" | "form4137"; reportingSourceReference: string; reportedEmployerTips: string; qualifiedW2Tips: string; qualifiedForm4137Tips: string }
export interface GuidedCardTipProof {
  receiptLedgerReference: string;
  solePaymentCohortConfirmed: boolean | null;
  scheduleCBusinessReceiptsConfirmed: boolean | null;
  qualifiedTipsReconciledConfirmed: boolean | null;
}
export interface BusinessTipDeductionData extends TipQualificationData {
  businessSourceId: string;
  reportedTipSources: { sourceId: string; qualifiedTips: string }[];
  form1099KProof?: GuidedCardTipProof;
}
export interface OvertimeDeductionData { owner: "" | Owner; compensationSourceId: string; compensationExcludedFromWages: string; qualifiedPremium: string; requiredByFlsa: boolean | null; reportingSourceReference: string }
export interface VehicleInterestRefundData {
  method: "" | "cash_refund" | "loan_credit" | "mixed";
  originTaxYear: string;
  receiptTaxYear: string;
  cashRefundReceived: string;
  refundSourceReference: string;
  creditAppliedTaxYear?: string;
  creditCashRefundReceived?: string;
  creditSourceReference?: string;
  currentYearInterestCreditApplied?: string;
  borrowerInterestExcludingCredit?: string;
  currentYearInterestCreditIncludedInBox1Confirmed?: boolean | null;
  priorPaymentSourceReference: string;
  filedReturnSourceReference: string;
  amendedReturnStatus: "" | "none" | "reviewed" | "unreviewed";
  loanSourcesMatchConfirmed: boolean | null;
  borrowerBoreRecoveredPaymentConfirmed: boolean | null;
  filedReturnHistoryCompleteConfirmed: boolean | null;
  sourceFactsConfirmed: boolean | null;
  schedule1ADeductedInterest: string;
  businessDeductedInterest: string;
  otherDeductedInterest: string;
}
export interface VehicleInterestStatementData {
  sourceTaxYear: string;
  sourceReference: string;
  payer: "" | Owner | "other";
  currentUncorrected: boolean | null;
  sourceFactsConfirmed: boolean | null;
  lenderAcquisitionDateBlank: boolean | null;
  lenderAcquisitionDate: string;
  reportedInterest: string;
  directThirdPartyInterest: string;
  reimbursedBorrowerInterest: string;
  priorYearInterestRefund: string;
  priorYearRefundProof?: VehicleInterestRefundData;
  originalUseChecked: boolean | null;
  usAssemblyChecked: boolean | null;
}
export interface VehicleInterestData {
  owner: "" | Owner; lenderName: string; loanAccountReference: string; sourceTaxYear: string; sourceReference: string; borrowerQualificationConfirmed: boolean | null;
  vin: string; acquiredDate: string; loanOriginationDate: string; interestPaid: string; businessInterestDeducted: string; nonqualifyingInterest: string;
  firstLien: boolean | null; originalUse: boolean | null; finalAssemblyUnitedStates: boolean | null; personalUse: boolean | null;
  vehicleType: "" | Schedule1AInput["vehicleLoans"][number]["vehicleType"]; grossVehicleWeightRating: string;
  refinancingSources?: VehicleRefinancingData;
  form1098Vli?: VehicleInterestStatementData;
  relatedParty: boolean | null; lease: boolean | null; fleet: boolean | null; salvageOrScrap: boolean | null; refinanced: boolean | null;
}
export interface Schedule1AData {
  sourceTaxYear: string; sourceReference: string; sourceFactsConfirmed: boolean | null; allSourcesIncluded: boolean | null;
  excludedPuertoRicoIncome: string; form4563Exclusion: string; employeeTips: EmployeeTipDeductionData[]; businessTips: BusinessTipDeductionData[]; overtime: OvertimeDeductionData[]; vehicleLoans: VehicleInterestData[]; seniorOwners: ("" | Owner)[];
}
export const emptySchedule1AData: Schedule1AData = { sourceTaxYear: "", sourceReference: "", sourceFactsConfirmed: null, allSourcesIncluded: null, excludedPuertoRicoIncome: "", form4563Exclusion: "", employeeTips: [], businessTips: [], overtime: [], vehicleLoans: [], seniorOwners: [] };

export function clearSchedule1ACardTipConfirmations(data: Schedule1AData): Schedule1AData {
  return { ...data, sourceFactsConfirmed: null, businessTips: data.businessTips.map(row => row.form1099KProof ? {
    ...row, form1099KProof: { ...row.form1099KProof, solePaymentCohortConfirmed: null,
      scheduleCBusinessReceiptsConfirmed: null, qualifiedTipsReconciledConfirmed: null },
  } : row) };
}
const emptyTipQualification: TipQualificationData = { owner: "", occupationCode: "", eligibleOccupation: null, voluntaryCashTips: null, lawfulActivity: null, meetsSstbRuleOrTransition: null };
export const emptyEmployeeTipDeduction: EmployeeTipDeductionData = { ...emptyTipQualification, employer: "", w2SourceIds: [], form4137EmployerSourceId: "", reportingMethod: "", reportingSourceReference: "", reportedEmployerTips: "", qualifiedW2Tips: "", qualifiedForm4137Tips: "" };
export const emptyBusinessTipDeduction: BusinessTipDeductionData = { ...emptyTipQualification, businessSourceId: "", reportedTipSources: [] };
export const emptyOvertimeDeduction: OvertimeDeductionData = { owner: "", compensationSourceId: "", compensationExcludedFromWages: "", qualifiedPremium: "", requiredByFlsa: null, reportingSourceReference: "" };
export const emptyVehicleInterestRefund: VehicleInterestRefundData = {
  method: "", originTaxYear: "", receiptTaxYear: "", cashRefundReceived: "", refundSourceReference: "",
  priorPaymentSourceReference: "", filedReturnSourceReference: "", amendedReturnStatus: "", loanSourcesMatchConfirmed: null,
  borrowerBoreRecoveredPaymentConfirmed: null, filedReturnHistoryCompleteConfirmed: null, sourceFactsConfirmed: null, schedule1ADeductedInterest: "",
  businessDeductedInterest: "", otherDeductedInterest: "",
};
export const emptyVehicleInterestStatement: VehicleInterestStatementData = {
  sourceTaxYear: "", sourceReference: "", payer: "", currentUncorrected: null, sourceFactsConfirmed: null,
  lenderAcquisitionDateBlank: null, lenderAcquisitionDate: "", reportedInterest: "", directThirdPartyInterest: "",
  reimbursedBorrowerInterest: "", priorYearInterestRefund: "", originalUseChecked: null, usAssemblyChecked: null,
};
export const emptyVehicleInterest: VehicleInterestData = { owner: "", lenderName: "", loanAccountReference: "", sourceTaxYear: "", sourceReference: "", borrowerQualificationConfirmed: null, vin: "", acquiredDate: "", loanOriginationDate: "", interestPaid: "", businessInterestDeducted: "", nonqualifyingInterest: "", firstLien: null, originalUse: null, finalAssemblyUnitedStates: null, personalUse: null, vehicleType: "", grossVehicleWeightRating: "", relatedParty: null, lease: null, fleet: null, salvageOrScrap: null, refinanced: null };
function money(value: string | undefined, label: string) { const error = amountError(value, label); if (error) throw new Error(error); return parseGuidedCurrency(value); }
function flag(value: boolean | null | undefined, label: string): boolean { if (typeof value !== "boolean") throw new Error(`Confirm actual ${label}; unknown is not false.`); return value; }
function text(value: string | undefined, label: string) { if (!value?.trim()) throw new Error(`Enter the actual ${label}.`); return value.trim(); }
function sourceYear(value: string | undefined, year: number) { if (!/^\d{4}$/.test(value ?? "") || Number(value) !== year) throw new Error("Actual source year must match the return year."); return year; }

function statementMoney(value: string | undefined, label: string) {
  const amount = money(value, `Form 1098-VLI ${label}`);
  if (amount.decimalPlaces() > 2) throw new Error(`Enter Form 1098-VLI ${label} in exact dollars and cents.`);
  return amount;
}

export function invalidateVehicleRefundPaymentEvidence(proof: VehicleInterestRefundData, borrowerChanged: boolean): VehicleInterestRefundData {
  return {
    ...proof, loanSourcesMatchConfirmed: null, borrowerBoreRecoveredPaymentConfirmed: null, sourceFactsConfirmed: null,
    ...(proof.method === "loan_credit" || proof.currentYearInterestCreditIncludedInBox1Confirmed !== undefined
      ? { currentYearInterestCreditIncludedInBox1Confirmed: null } : {}),
    ...(borrowerChanged ? { filedReturnHistoryCompleteConfirmed: null } : {}),
  };
}

export function vehicleRefundLoanIdentityChanged(previous: VehicleInterestData, next: VehicleInterestData): boolean {
  const fields = ["owner", "lenderName", "loanAccountReference", "vin", "acquiredDate", "loanOriginationDate"] as const;
  return fields.some(field => previous[field] !== next[field]) || previous.form1098Vli?.payer !== next.form1098Vli?.payer;
}

export function invalidateEditedVehicleRefundProof(previous: VehicleInterestRefundData | undefined, next: VehicleInterestRefundData): VehicleInterestRefundData {
  const paymentFields = ["method", "originTaxYear", "receiptTaxYear", "cashRefundReceived", "refundSourceReference", "priorPaymentSourceReference",
    "creditAppliedTaxYear", "creditCashRefundReceived", "creditSourceReference", "currentYearInterestCreditApplied", "borrowerInterestExcludingCredit"] as const;
  const historyFields = ["method", "originTaxYear", "amendedReturnStatus", "filedReturnSourceReference", "schedule1ADeductedInterest",
    "businessDeductedInterest", "otherDeductedInterest"] as const;
  const paymentChanged = paymentFields.some(field => previous?.[field] !== next[field]);
  const historyChanged = historyFields.some(field => previous?.[field] !== next[field]);
  const reviewed = paymentChanged ? invalidateVehicleRefundPaymentEvidence(next, false) : next;
  return historyChanged ? { ...reviewed, filedReturnHistoryCompleteConfirmed: null, sourceFactsConfirmed: null } : reviewed;
}

export function invalidateEditedVehicleLoanCredit(previous: VehicleInterestData, next: VehicleInterestData): VehicleInterestData {
  const statement = next.form1098Vli;
  const proof = statement?.priorYearRefundProof;
  const oldProof = previous.form1098Vli?.priorYearRefundProof;
  if (proof?.method !== "loan_credit" && oldProof?.method !== "loan_credit") return next;
  const reviewedBorrower = previous.owner === next.owner ? next : { ...next, borrowerQualificationConfirmed: null };
  if (!statement) return reviewedBorrower;
  if (!proof) return { ...reviewedBorrower, form1098Vli: { ...statement, sourceFactsConfirmed: null } };
  const paymentFacts = (loan: VehicleInterestData) => ({ ...loan, borrowerQualificationConfirmed: undefined,
    form1098Vli: { ...loan.form1098Vli, priorYearRefundProof: undefined } });
  const paymentChanged = guidedSourceValuesChanged(paymentFacts(previous), paymentFacts(next));
  let reviewed = invalidateEditedVehicleRefundProof(oldProof, proof);
  if (paymentChanged) reviewed = invalidateVehicleRefundPaymentEvidence(reviewed, vehicleRefundLoanIdentityChanged(previous, next));
  if (reviewed === proof) return reviewedBorrower;
  return { ...reviewedBorrower,
    form1098Vli: { ...statement, sourceFactsConfirmed: null, priorYearRefundProof: reviewed } };
}

type Form1098VliInput = NonNullable<Schedule1AInput["vehicleLoans"][number]["form1098Vli"]>;
function buildBox5RefundProof(loan: VehicleInterestData, proof: VehicleInterestRefundData | undefined, amounts: {
  refund: Decimal; interestPaid: Decimal; directThirdPartyInterest: Decimal; reimbursedBorrowerInterest: Decimal;
}): Form1098VliInput["priorYearRefundProof"] {
  const { refund, interestPaid, directThirdPartyInterest, reimbursedBorrowerInterest } = amounts;
  if (refund.isZero()) {
    if (proof !== undefined) throw new Error("Reconcile or remove saved Form 1098-VLI refund details when Box 5 is zero.");
    return undefined;
  }
  if (proof?.method !== "cash_refund" && proof?.method !== "loan_credit") {
    throw new Error("Form 1098-VLI Box 5 requires a documented cash refund or an interest credit applied to the same loan. Mixed refunds require separate review.");
  }
  const recoveryYear = proof.method === "cash_refund" ? proof.receiptTaxYear : proof.creditAppliedTaxYear;
  if (proof.originTaxYear.trim() !== "2025" || recoveryYear?.trim() !== "2026"
    || !loan.acquiredDate.startsWith("2025-") || !loan.loanOriginationDate.startsWith("2025-")) {
    throw new Error("Form 1098-VLI Box 5 requires a 2026 recovery of interest overpaid in 2025 on a vehicle purchased and loan originated in 2025.");
  }
  if (proof.loanSourcesMatchConfirmed !== true || proof.filedReturnHistoryCompleteConfirmed !== true || proof.sourceFactsConfirmed !== true
    || (proof.amendedReturnStatus !== "none" && proof.amendedReturnStatus !== "reviewed")) {
    throw new Error("Confirm the matching Form 1098-VLI Box 5 records and complete filed 2025 return history, including any amendments, after the last edit.");
  }
  if (proof.borrowerBoreRecoveredPaymentConfirmed !== true) {
    throw new Error("Confirm that the borrower paid and bore the recovered 2025 interest and received the Form 1098-VLI Box 5 refund or credit.");
  }
  const schedule1A = statementMoney(proof.schedule1ADeductedInterest, "Box 5 prior Schedule 1-A deduction");
  const business = statementMoney(proof.businessDeductedInterest, "Box 5 prior business deduction");
  const other = statementMoney(proof.otherDeductedInterest, "Box 5 other prior deduction or carryforward");
  if (!schedule1A.isZero() || !business.isZero() || !other.isZero()) throw new Error("Form 1098-VLI Box 5 requires separate recovery review when the refunded interest was previously deducted or carried forward.");

  const common = {
    originTaxYear: 2025, receiptTaxYear: 2026,
    priorPaymentSourceReference: text(proof.priorPaymentSourceReference, "Form 1098-VLI Box 5 prior payment source reference"),
    filedReturnSourceReference: text(proof.filedReturnSourceReference, "Form 1098-VLI Box 5 filed return source reference"),
    amendedReturnStatus: proof.amendedReturnStatus,
    loanSourcesMatchConfirmed: true, borrowerBoreRecoveredPaymentConfirmed: true, filedReturnHistoryCompleteConfirmed: true, factsConfirmed: true,
    schedule1ADeductedInterest: schedule1A.toFixed(), businessDeductedInterest: business.toFixed(), otherDeductedInterest: other.toFixed(),
  } as const;
  if (proof.method === "cash_refund") {
    const cash = statementMoney(proof.cashRefundReceived, "Box 5 cash refund received");
    if (!cash.eq(refund)) throw new Error("Form 1098-VLI Box 5 must equal the cash refund actually received, excluding separate interest on the refund.");
    return { ...common, method: proof.method, cashRefundReceived: cash.toFixed(),
      refundSourceReference: text(proof.refundSourceReference, "Form 1098-VLI Box 5 cash refund source reference") };
  }

  const cash = statementMoney(proof.creditCashRefundReceived, "Box 5 cash received alongside the loan credit");
  if (!cash.isZero() || !directThirdPartyInterest.isZero() || !reimbursedBorrowerInterest.isZero()) {
    throw new Error("Form 1098-VLI Box 5 same-loan credit requires actual zero cash received, direct third-party payments and borrower reimbursements.");
  }
  const credit = statementMoney(proof.currentYearInterestCreditApplied, "Box 5 credit applied to 2026 interest on the same loan");
  const otherInterest = statementMoney(proof.borrowerInterestExcludingCredit, "Box 5 borrower 2026 interest excluding the credit");
  if (!credit.eq(refund) || !sumSourceMoney(otherInterest, credit).eq(interestPaid) || proof.currentYearInterestCreditIncludedInBox1Confirmed !== true) {
    throw new Error("Reconcile Form 1098-VLI Box 5 to the actual credit used to pay accrued 2026 interest on the same loan. The borrower interest excluding the credit plus the credit must equal the borrower interest included in Box 1.");
  }
  return { ...common, method: proof.method, cashRefundReceived: cash.toFixed(),
    refundSourceReference: text(proof.creditSourceReference, "Form 1098-VLI Box 5 loan credit source reference"),
    currentYearInterestCreditApplied: credit.toFixed(), borrowerInterestExcludingCredit: otherInterest.toFixed(),
    currentYearInterestCreditIncludedInBox1Confirmed: true };
}

function buildForm1098Vli(
  loan: VehicleInterestData, owner: Owner, year: number, interestPaid: Decimal, nonqualifyingInterest: Decimal,
): Schedule1AInput["vehicleLoans"][number]["form1098Vli"] {
  const statement = loan.form1098Vli;
  if (statement === undefined) return undefined;
  if (year !== 2026 || statement.sourceTaxYear?.trim() !== "2026") throw new Error("Confirm the actual Form 1098-VLI calendar year for this 2026 return.");
  if (statement.currentUncorrected !== true || statement.sourceFactsConfirmed !== true) {
    throw new Error("Check the current uncorrected Form 1098-VLI Copy B and confirm its facts after the last edit.");
  }
  if (statement.payer !== owner) throw new Error("The Form 1098-VLI payer of record must match the borrower on the payment records.");
  if (statement.lenderAcquisitionDateBlank !== true || statement.lenderAcquisitionDate?.trim()) {
    throw new Error("Confirm that Form 1098-VLI Box 3b is blank. A lender acquisition date requires separate reconciliation.");
  }
  if (loan.refinanced !== false || loan.refinancingSources !== undefined) throw new Error("A refinanced loan requires separate Form 1098-VLI reconciliation.");
  if (statement.originalUseChecked !== true || statement.usAssemblyChecked !== true || loan.originalUse !== true || loan.finalAssemblyUnitedStates !== true) {
    throw new Error("Confirm that Form 1098-VLI Boxes 6 and 7 are checked and match the original-use and U.S. assembly facts in the loan records.");
  }
  const priorYearInterestRefund = statementMoney(statement.priorYearInterestRefund, "Box 5 refund or credit");
  if (!nonqualifyingInterest.isZero()) throw new Error("Interest on nonqualifying indebtedness requires separate reconciliation outside Form 1098-VLI Box 1.");
  const reportedInterest = statementMoney(statement.reportedInterest, "Box 1 interest");
  const directThirdPartyInterest = statementMoney(statement.directThirdPartyInterest, "direct interest payments by others");
  const reimbursedBorrowerInterest = statementMoney(statement.reimbursedBorrowerInterest, "borrower-paid interest reimbursed by others");
  const priorYearRefundProof = buildBox5RefundProof(loan, statement.priorYearRefundProof, {
    refund: priorYearInterestRefund, interestPaid, directThirdPartyInterest, reimbursedBorrowerInterest,
  });
  const net = sumSourceMoney(reportedInterest, directThirdPartyInterest.negated(), reimbursedBorrowerInterest.negated());
  if (!net.eq(interestPaid)) throw new Error("Reconcile Form 1098-VLI Box 1 less direct payments by others and borrower reimbursements to interest actually paid by the borrower.");

  return {
    taxYear: 2026,
    sourceReference: text(statement.sourceReference, "Form 1098-VLI source reference"),
    factsConfirmed: true,
    corrected: false,
    payer: statement.payer,
    lenderName: loan.lenderName.trim(),
    loanAccountReference: loan.loanAccountReference.trim(),
    vin: loan.vin,
    originationDate: loan.loanOriginationDate,
    lenderAcquisitionDate: null,
    reportedInterest: reportedInterest.toFixed(),
    directThirdPartyInterest: directThirdPartyInterest.toFixed(),
    reimbursedBorrowerInterest: reimbursedBorrowerInterest.toFixed(),
    priorYearInterestRefund: priorYearInterestRefund.toFixed(),
    ...(priorYearRefundProof ? { priorYearRefundProof } : {}),
    originalUseChecked: statement.originalUseChecked,
    usAssemblyChecked: statement.usAssemblyChecked,
  };
}

const normal = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
export function schedule1ACompensationSources(state: GuidedFlowState) {
  const w2 = (state.sectionData["income-w2"]?.entries ?? []).filter(entry => hasEnteredAmount(entry.wages) || hasEnteredAmount(entry.federalWithheld)).map((entry, index) => ({ sourceId: `formW2:${index}`, kind: "w2" as const, accountHolder: entry.accountHolder, name: entry.employerName, amount: entry.wages, entry }));
  const nec = (state.sectionData["income-self-employment"]?.necEntries ?? []).filter(isStartedNec).map((entry, index) => ({ sourceId: `form1099Nec:${index}`, kind: "nec" as const, accountHolder: entry.accountHolder, name: entry.payerName, amount: entry.nonemployeeCompensation, entry }));
  return [...w2, ...nec];
}
export function buildSchedule1AInput(data: Schedule1AData | undefined, state: GuidedFlowState): Schedule1AInput | undefined {
  if (!data) return undefined;
  const year = state.taxYear; if ((year !== 2025 && year !== 2026) || !state.segmentation.filingStatus) throw new Error("Choose the actual return year and filing status.");
  sourceYear(data.sourceTaxYear, year); text(data.sourceReference, "deduction source reference");
  if (data.sourceFactsConfirmed !== true || data.allSourcesIncluded !== true) throw new Error("Confirm all actual additional deduction sources after the last edit.");
  const household = state.sectionData["personal-info"];
  const primarySsnEligible = flag(household?.employmentValidSsnIssuedByDueDate, "primary SSN eligibility in About You");
  const requireOwner = (owner: string): Owner => { if (owner !== "primary" && owner !== "spouse") throw new Error("Choose the actual source owner."); if (owner === "spouse" && (state.segmentation.filingStatus !== "mfj" || !household?.spouse)) throw new Error("Spouse sources require the actual joint household."); return owner; };
  const sources = schedule1ACompensationSources(state); const usedReportedTips = new Map<string, Decimal>(); const usedOvertime = new Map<string, Decimal>();
  const findSource = (id: string, owner: Owner) => { const source = sources.find(row => row.sourceId === id); if (!source || source.accountHolder !== owner) throw new Error("Deduction compensation source is missing or belongs to another owner."); sourceYear(source.entry.sourceTaxYear, year); if (source.kind === "w2" && Object.values(source.entry.aiSuggestedFields ?? {}).some(field => field?.status === "pending-confirmation")) throw new Error("Confirm the original W2 source before claiming its deduction."); return source; };
  const qualify = (entry: TipQualificationData) => ({ owner: requireOwner(entry.owner), occupationCode: text(entry.occupationCode, "tipped occupation code"), eligibleOccupation: flag(entry.eligibleOccupation, "listed tipped occupation"), voluntaryCashTips: flag(entry.voluntaryCashTips, "voluntary cash or charge tips"), lawfulActivity: flag(entry.lawfulActivity, "lawful activity"), meetsSstbRuleOrTransition: flag(entry.meetsSstbRuleOrTransition, "applicable service-business rule or current-year transition") });
  // Documentary input only; the ordinary bridge still requires full canonical RRTA proof.
  const tipInputs = data.employeeTips.some(entry => entry.form4137EmployerSourceId.trim() || money(entry.qualifiedForm4137Tips, "qualified total Form4137 tips").gt(0)) ? (state.sectionData['additional-deductions']?.rrtaPayrollSources ? buildTipIncomeSourceOriginals : buildTipIncomeInputs)(state.sectionData["additional-deductions"]?.tipIncomeAccounts, state.segmentation.filingStatus, year, state.sectionData["income-w2"]?.entries) : undefined;
  const employeeTips = data.employeeTips.map(entry => {
    const qualification = qualify(entry); const w2Tips = money(entry.qualifiedW2Tips, "qualified employer-reported tips"); const formTips = money(entry.qualifiedForm4137Tips, "qualified total Form4137 tips");
    const linked = entry.w2SourceIds.map(id => { const source = findSource(id, qualification.owner); if (source.kind !== "w2" || normal(source.name) !== normal(entry.employer)) throw new Error("Actual employee tips must link to the same employer's W2 source."); return source; });
    if (new Set(entry.w2SourceIds).size !== entry.w2SourceIds.length) throw new Error("Duplicate employee W2 source.");
    if (w2Tips.gt(0) && !linked.length) throw new Error("Positive employer-reported tips require their actual W2 source.");
    if (w2Tips.gt(0) || entry.reportingMethod) { text(entry.reportingMethod, "tip reporting method"); text(entry.reportingSourceReference, "tip reporting reference"); }
    let reportLimit: Decimal;
    if (entry.reportingMethod === "form4137") {
      if (!w2Tips.isZero() || !entry.form4137EmployerSourceId.trim()) throw new Error("Direct Form4137 source requires actual zero employer-reported qualified tips and the actual employer ledger.");
      reportLimit = new Decimal(0);
    } else if (year === 2026) {
      if (entry.reportingMethod !== "w2") throw new Error("2026 tips require the actual W2 reporting source; the2025 transition method is not a substitute.");
      reportLimit = linked.reduce((total, source) => { if (!source.entry.treasuryTippedOccupationCodes?.length) throw new Error("Enter the actual2026 reported tipped occupation codes; an independent actual occupation claim may be a third occupation not listed in the two-code report."); return total.plus(money(source.entry.box12CodeTP, "actual2026 reported W2TP tips")); }, new Decimal(0));
    } else if (entry.reportingMethod === "w2") reportLimit = linked.reduce((total, source) => total.plus(money(source.entry.socialSecurityTips, "actual W2Box7 tips")), new Decimal(0));
    else reportLimit = money(entry.reportedEmployerTips, "actual employer-reported tip statement total");
    if (w2Tips.gt(reportLimit)) throw new Error("Qualified employer-reported tips exceed the actual reported source.");
    const ledger = entry.form4137EmployerSourceId.trim() ? tipInputs?.[qualification.owner]?.sourceFacts?.employers?.find(row => row.sourceId === entry.form4137EmployerSourceId) : undefined;
    if (formTips.gt(0) || entry.form4137EmployerSourceId.trim()) {
      if (!ledger || normal(ledger.employerName ?? "") !== normal(entry.employer)) throw new Error("Actual Form4137 employer source does not match the claimed tips.");
      if (w2Tips.gt(money(ledger.cashAndChargeTipsReceived, "actual column1(c) tips")) || (year === 2025 && ["form4070", "employer_statement"].includes(entry.reportingMethod) && !reportLimit.eq(money(ledger.tipsReportedToEmployer, "actual annual employer reports")))) throw new Error("Reconcile conflicting employer and Form4137 tip reports for this reporting year.");
      if (formTips.gt(money(ledger.cashAndChargeTipsReceived, "actual column1(c) tips"))) throw new Error("Qualified Form4137 tips exceed that employer's actual column1(c) source.");
    }
    return { ...qualification, employer: text(entry.employer, "employer name"), w2SourceIds: [...entry.w2SourceIds], form4137EmployerSourceId: entry.form4137EmployerSourceId.trim() || undefined, reportingMethod: entry.reportingMethod || undefined, reportingSourceReference: entry.reportingSourceReference.trim() || undefined, reportedEmployerTips: year === 2025 && ["form4070", "employer_statement"].includes(entry.reportingMethod) ? reportLimit.toFixed() : undefined, qualifiedW2Tips: w2Tips.toFixed(), qualifiedForm4137Tips: formTips.toFixed() };
  });
  const businessTips = data.businessTips.map(entry => {
    const qualification = qualify(entry);
    const businessData = state.sectionData["income-self-employment"];
    const business = businessData?.businessFacts;
    if (entry.businessSourceId !== "scheduleC" || !business || business.accountHolder !== qualification.owner) throw new Error("Select the actual supported business and source owner; another business requires its source worksheet.");
    const businessName = text(business.businessName || business.activityDescription, "business name or activity");
    if (entry.form1099KProof || entry.reportedTipSources.some(source => source.sourceId.startsWith("form1099K:"))) {
      const original = buildGuidedCardTipSource(businessData, year, state.segmentation.filingStatus);
      const evidence = original?.cardTipStatementEvidence;
      const report = entry.reportedTipSources[0];
      const proof = entry.form1099KProof;
      if (!original || original.accountHolder !== qualification.owner || !evidence
        || data.businessTips.length !== 1 || entry.reportedTipSources.length !== 1 || report?.sourceId !== cardTipStatementId) {
        throw new Error("Link the one actual Form 1099-K to the same Schedule C and owner.");
      }
      if (!proof || proof.solePaymentCohortConfirmed !== true || proof.scheduleCBusinessReceiptsConfirmed !== true || proof.qualifiedTipsReconciledConfirmed !== true) {
        throw new Error("Confirm the actual Form 1099-K, business receipts and qualified tip reconciliation.");
      }
      const amount = exactCardTipMoney(report.qualifiedTips, "actual qualified tips reported on Form 1099-K");
      if (amount.gt(exactCardTipMoney(original.cashTips, "original Form 1099-K Box 1c"))
        || original.treasuryTippedOccupationCodes?.[0] !== qualification.occupationCode
        || (amount.gt(0) && !isQualifiedTippedOccupationCode(qualification.occupationCode))) {
        throw new Error("Reconcile the claimed occupation and qualified tips to the actual Form 1099-K.");
      }
      return {
        ...qualification, businessSourceId: entry.businessSourceId, businessName,
        reportedTipSources: [{ sourceId: cardTipStatementId, qualifiedTips: amount.toFixed() }], qualifiedReportedTips: amount.toFixed(),
        form1099KProof: {
          statementReference: evidence.statementReference,
          receiptLedgerReference: text(proof.receiptLedgerReference, "actual business receipt ledger reference"),
          solePaymentCohortConfirmed: true, scheduleCBusinessReceiptsConfirmed: true, qualifiedTipsReconciledConfirmed: true,
        },
      };
    }
    const reportedTipSources = entry.reportedTipSources.map(row => {
      const source = findSource(row.sourceId, qualification.owner); if (source.kind !== "nec") throw new Error("This guided business tip must link to the actual business NEC source.");
      const amount = money(row.qualifiedTips, "actual qualified tips in this source"); let limit = money(source.amount, "actual reported business compensation");
      if (year === 2026) { if (!source.entry.treasuryTippedOccupationCodes?.length) throw new Error("Enter the actual2026 business reported occupation codes."); limit = money(source.entry.cashTips, "actual2026 reported NEC cash tips"); }
      const total = (usedReportedTips.get(row.sourceId) ?? new Decimal(0)).plus(amount); if (total.gt(limit)) throw new Error("Qualified business tips exceed the actual reported source."); usedReportedTips.set(row.sourceId, total);
      return { sourceId: row.sourceId, qualifiedTips: amount.toFixed() };
    });
    if (!reportedTipSources.length) throw new Error("Add the actual information-return source for business tips.");
    return { ...qualification, businessSourceId: entry.businessSourceId, businessName, reportedTipSources, qualifiedReportedTips: reportedTipSources.reduce((total, row) => total.plus(row.qualifiedTips), new Decimal(0)).toFixed() };
  });
  const overtime = data.overtime.map(entry => {
    const owner = requireOwner(entry.owner); const source = findSource(entry.compensationSourceId, owner); const premium = money(entry.qualifiedPremium, "actual FLSA overtime premium"); const excluded = source.kind === "w2" ? money(entry.compensationExcludedFromWages, "actual payroll compensation excluded from wages") : new Decimal(0); const reported = money(source.amount, "actual reported compensation").plus(excluded);
    let limit = reported; if (year === 2026) limit = money(source.kind === "w2" ? source.entry.box12CodeTT : source.entry.qualifiedOvertimeCompensation, "actual2026 reported overtime source");
    const total = (usedOvertime.get(source.sourceId) ?? new Decimal(0)).plus(premium); if (total.gt(limit) || total.gt(reported)) throw new Error("Qualified overtime exceeds the actual reported source."); usedOvertime.set(source.sourceId, total);
    return { owner, compensationSourceId: source.sourceId, qualifiedPremium: premium.toFixed(), reportedCompensation: reported.toFixed(), compensationExcludedFromWages: source.kind === "w2" ? excluded.toFixed() : undefined, requiredByFlsa: flag(entry.requiredByFlsa, "FLSA premium requirement"), reportingSourceReference: text(entry.reportingSourceReference, "overtime reporting reference") };
  });
  const vehicleLoans = data.vehicleLoans.map(loan => {
    const owner = requireOwner(loan.owner); sourceYear(loan.sourceTaxYear, year);
    const interestPaid = money(loan.interestPaid, "original loan interest");
    const nonqualifyingInterest = money(loan.nonqualifyingInterest, "nonqualifying loan interest");
    const form1098Vli = buildForm1098Vli(loan, owner, year, interestPaid, nonqualifyingInterest);
    if (loan.refinanced !== true && loan.refinancingSources !== undefined) throw new Error("Saved refinancing records conflict with the actual refinanced-loan answer.");
    const flags = Object.fromEntries((["borrowerQualificationConfirmed", "firstLien", "originalUse", "finalAssemblyUnitedStates", "personalUse", "relatedParty", "lease", "fleet", "salvageOrScrap", "refinanced"] as const).map(key => [key, flag(loan[key], key)]));
    return { ...loan, ...flags, form1098Vli, refinancingSources: loan.refinanced === true ? buildVehicleRefinancingSources(loan.refinancingSources) : undefined, owner, sourceTaxYear: year, lenderName: text(loan.lenderName, "lender"), loanAccountReference: text(loan.loanAccountReference, "loan account reference"), sourceReference: text(loan.sourceReference, "loan source reference"), grossVehicleWeightRating: /^\d+$/.test(loan.grossVehicleWeightRating) ? Number(loan.grossVehicleWeightRating) : undefined, interestPaid: interestPaid.toFixed(), businessInterestDeducted: money(loan.businessInterestDeducted, "interest already deducted elsewhere").toFixed(), nonqualifyingInterest: nonqualifyingInterest.toFixed() };
  });
  const seniorOwners = data.seniorOwners.map(requireOwner); if (seniorOwners.length) buildStandardDeductionFacts(household?.standardDeductionFacts, state.segmentation.filingStatus, year, household);
  const excludedPuertoRicoIncome = money(data.excludedPuertoRicoIncome, "actual excluded PuertoRico income"); const form4563Exclusion = money(data.form4563Exclusion, "actual Form4563 exclusion");
  for (const [actual, other] of [[excludedPuertoRicoIncome, household?.childTaxCredit?.puertoRicoExcludedIncome], [form4563Exclusion, household?.childTaxCredit?.form4563ExcludedIncome], [excludedPuertoRicoIncome, state.sectionData["income-social-security"]?.puertoRicoIncomeExclusion], [form4563Exclusion, state.sectionData["income-social-security"]?.americanSamoaIncomeExclusion]] as const) if (hasEnteredAmount(other) && !actual.eq(money(other, "other supplied exclusion source"))) throw new Error("Reconcile the conflicting actual income exclusions across household worksheets.");
  const needsSpouse = [...employeeTips, ...businessTips, ...overtime, ...vehicleLoans].some(entry => entry.owner === "spouse") || seniorOwners.includes("spouse");
  const result = Schedule1ASchema.parse({ sourceTaxYear: year, sourceReference: data.sourceReference, sourceFactsConfirmed: true, allSourcesIncluded: true, primarySsnEligible, spouseSsnEligible: needsSpouse ? flag(household?.spouse?.employmentValidSsnIssuedByDueDate, "spouse SSN eligibility in About You") : undefined, excludedPuertoRicoIncome: excludedPuertoRicoIncome.toFixed(), form4563Exclusion: form4563Exclusion.toFixed(), employeeTips, businessTips, overtime, vehicleLoans, seniorOwners });
  for (const loan of result.vehicleLoans) if (loan.refinanced) calculateVehicleRefinancing(loan, year);
  return result;
}
export function schedule1AFactErrors(state: GuidedFlowState): Record<string, string> {
  try { buildSchedule1AInput(state.sectionData["additional-deductions"]?.schedule1A, state); return {}; }
  catch (error) { return { additionalDeductionSources: error instanceof Error ? error.message : "Complete actual additional deduction sources." }; }
}
