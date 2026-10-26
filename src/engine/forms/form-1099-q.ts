/**
 * Form 1099-Q — Payments From Qualified Education Programs
 * Spec: spec/federal/form-1099-q.yaml
 *
 * Computes the taxable earnings from 529 plan and Coverdell ESA
 * distributions that exceed the beneficiary's adjusted qualified
 * education expenses (AQEE), plus the 10% additional tax
 * (Form 5329 Part II) with penalty exceptions.
 *
 * IRC §529(c)(3)(A): Distributions from QTPs are excluded from
 * gross income to the extent they do not exceed adjusted QEE.
 * IRC §530(d)(2): Same treatment for Coverdell ESA distributions.
 *
 * Pub 970 Chapters6-7 provide the worksheets.
 * Source contract: spec/federal/form-1099-q-source.yaml.
 */

import Decimal from "decimal.js";
import type { Form1099Q, QualifiedEducationExpenseSummary, EducationExpenses, Taxpayer } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, sum, zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { assertDistinctEducationBeneficiaries } from "@/utils/education-beneficiary-identity.js";

const ZERO = new Decimal(0);
const PENALTY_RATE = new Decimal("0.10");

export interface Form1099QResult {
  sourceFactsVerified: boolean;
  taxYear: number;
  perDistribution: EducationDistributionResult[];
  perRecipient: EducationRecipientResult[];
  returnedContributions: ReturnedEducationContribution[];
  coverdellAccounts: Array<{ accountId: string; beneficiaryId: string; auditForm: "Pub970 WS6-3" | "Coverdell rollover worksheet"; distributedBasis: Decimal; earnings: Decimal; endingBasis: Decimal }>;
  /** Opaque beneficiary links only; personal tax identifiers are not calculation output. */
  creditAllocations: Array<{ beneficiaryId: string; amount: Decimal; taxableEarningsCausedByCredit: Decimal }>;
  loanInterestSourceAdjustments: Array<{ expenseId: string; borrowerId: string; owner: "primary" | "spouse" | "other"; interestPaid: Decimal; taxFreeEarningsUsedForInterest: Decimal; interestClaimedElsewhere: Decimal }>;
  loanInterestAdjustments: Array<{ borrowerId: string; owner: "primary" | "spouse" | "other"; interestPaid: Decimal; taxFreeEarningsUsedForInterest: Decimal; interestClaimedElsewhere: Decimal }>;
  /** Total gross distributions (sum of Box 1) */
  grossDistribution: Decimal;
  /** Total earnings portion (sum of Box 2) */
  totalEarnings: Decimal;
  /** Total basis/contributions (sum of Box 3) */
  totalBasis: Decimal;
  /** Distributions excluded as trustee-to-trustee transfers */
  trusteeToTrusteeTransfers: Decimal;
  /** Taxable gross distributions (gross minus trustee-to-trustee) */
  taxableGrossDistribution: Decimal;
  /** Taxable earnings from taxable distributions */
  taxableDistributionEarnings: Decimal;
  /** Adjusted qualified education expenses */
  adjustedQEE: Decimal;
  /** Taxable earnings (income to report) */
  taxableEarnings: Decimal;
  /** Tax-free earnings allocable to QEE */
  taxFreeEarnings: Decimal;
  /** Penalty amount before exceptions */
  grossPenalty: Decimal;
  /** Total penalty exception amount */
  penaltyExceptionAmount: Decimal;
  /** Net 10% additional tax after exceptions */
  netPenalty: Decimal;
  /** Audit trail lines */
  lines: CalculatedLine[];
}

export interface ReturnedEducationContribution {
  sourceId: string; accountId: string; contributionId: string; sourceTaxYear: number; incomeTaxYear: number;
  recipientOwner: "primary" | "spouse" | "other"; recipientId: string;
  returnedPrincipal: Decimal; netIncome: Decimal; taxableEarnings: Decimal;
  previouslyReportedEarnings: Decimal; incomeAdjustment: Decimal;
}
export interface EducationDistributionResult {
  sourceTaxYear: number;
  incomeTaxYear: number;
  treatment: "ordinary" | "returned_contribution" | "account_disqualification";
  sourceId: string;
  accountId: string;
  accountType: "529" | "coverdell_esa";
  distributionMedium?: "cash" | "in_kind_prepaid_tuition";
  beneficiaryId: string;
  recipientOwner: "primary" | "spouse" | "other";
  recipientId: string;
  grossDistribution: Decimal;
  earnings: Decimal;
  basis: Decimal;
  validTransfers: Decimal;
  adjustedQEE: Decimal;
  taxableEarnings: Decimal;
  taxFreeEarnings: Decimal;
  educationExpenseExcludedEarnings: Decimal;
  transferExcludedEarnings: Decimal;
  creditException: Decimal;
  penaltyException: Decimal;
}
export interface EducationRecipientResult {
  owner: "primary" | "spouse" | "other";
  recipientId: string;
  taxableEarnings: Decimal;
  penaltyException: Decimal;
  additionalTax: Decimal;
}
export interface Form1099QOptions {
  taxYear?: number;
  /** Actual return identities are required to reconcile canonical in-kind income ownership. */
  taxpayer?: Taxpayer;
  /** Pass explicit empty education inputs when the return claims no education credit. */
  educationExpenses?: EducationExpenses;
}

export function calculateForm1099Q(
  forms: Form1099Q[],
  qeeSummary?: QualifiedEducationExpenseSummary,
  options: Form1099QOptions = {},
): Form1099QResult {
  const taxYear = options.taxYear ?? 2025;
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error("Form1099Q unsupported tax year");
  const legacyFields = new Set(["payerName", "accountType", "grossDistribution", "earnings", "basis", "isTrusteeToTrustee", "sourceFactsComplete"]);
  const hasActualSourceFields = forms.some(form => Object.entries(form).some(([key, value]) => value !== undefined && !legacyFields.has(key)));
  if (taxYear === 2026 || qeeSummary?.sourceFacts || hasActualSourceFields) return calculateSourceDistributions(forms, qeeSummary, { ...options, taxYear });
  const audit = new AuditTrail();

  // ── Aggregate all 1099-Q forms ───────────────────────────────
  const trusteeToTrusteeTransfers = sum(
    ...forms
      .filter((f) => f.isTrusteeToTrustee)
      .map((f) => zeroFloor(d(f.grossDistribution)))
  );

  const taxableForms = forms.filter((f) => !f.isTrusteeToTrustee);
  const grossDistribution = sum(...forms.map((f) => zeroFloor(d(f.grossDistribution))));
  const taxableGrossDistribution = sum(...taxableForms.map((f) => zeroFloor(d(f.grossDistribution))));
  const totalEarnings = sum(...forms.map((f) => d(f.earnings)));
  const taxableDistributionEarnings = sum(...taxableForms.map((f) => d(f.earnings)));
  const totalBasis = sum(...forms.map((f) => zeroFloor(d(f.basis))));

  audit.record("Form 1099-Q", "gross-distribution",
    "Total gross distributions from all Form 1099-Q documents",
    grossDistribution, `Sum of ${forms.length} Form 1099-Q Box 1 amount(s)`, {
      "Number of 1099-Q forms": new Decimal(forms.length),
      "Trustee-to-trustee transfers excluded": trusteeToTrusteeTransfers,
      "Taxable gross distributions": taxableGrossDistribution,
    });

  audit.record("Form 1099-Q", "total-earnings",
    "Total earnings portion of distributions",
    totalEarnings, "Sum of Box 2 from each Form 1099-Q", {
      "Taxable distribution earnings": taxableDistributionEarnings,
    });

  audit.record("Form 1099-Q", "total-basis",
    "Total basis (contributions) portion of distributions",
    totalBasis, "Sum of Box 3 from each Form 1099-Q");

  // ── Adjusted Qualified Education Expenses ─────────────────────
  const rawQEE = zeroFloor(d(qeeSummary?.totalQualifiedExpenses));
  const taxFreeAssistance = zeroFloor(d(qeeSummary?.taxFreeEducationalAssistance));
  const amountsForCredits = zeroFloor(d(qeeSummary?.amountsUsedForEducationCredits));
  const adjustedQEE = Decimal.max(ZERO, rawQEE.minus(taxFreeAssistance).minus(amountsForCredits));

  audit.record("Form 1099-Q", "adjusted-qee",
    "Adjusted Qualified Education Expenses",
    adjustedQEE,
    "max(0, Total QEE - tax-free educational assistance - amounts used for AOTC/LLC)", {
      "Total qualified education expenses": rawQEE,
      "Tax-free educational assistance": taxFreeAssistance,
      "Amounts used for education credits": amountsForCredits,
    });

  // ── Taxable Earnings ──────────────────────────────────────────
  // Per Pub 970: if taxable distributions ≤ adjusted QEE, all earnings are tax-free.
  // Otherwise: taxable earnings = earnings × (excess / gross distribution)
  let taxableEarnings: Decimal;
  let taxFreeEarnings: Decimal;

  if (taxableGrossDistribution.isZero()) {
    // No taxable distributions at all
    taxableEarnings = ZERO;
    taxFreeEarnings = taxableDistributionEarnings;
  } else if (taxableGrossDistribution.lessThanOrEqualTo(adjustedQEE)) {
    // All distributions covered by QEE
    taxableEarnings = ZERO;
    taxFreeEarnings = taxableDistributionEarnings;
  } else if (taxableDistributionEarnings.lessThanOrEqualTo(ZERO)) {
    // No earnings (or negative earnings/loss) — nothing taxable
    taxableEarnings = ZERO;
    taxFreeEarnings = taxableDistributionEarnings;
  } else {
    // Excess distributions: prorate earnings
    const excess = taxableGrossDistribution.minus(adjustedQEE);
    const earningsRatio = excess.dividedBy(taxableGrossDistribution);
    taxableEarnings = taxableDistributionEarnings
      .times(earningsRatio)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    taxFreeEarnings = taxableDistributionEarnings.minus(taxableEarnings);
  }

  audit.record("Form 1099-Q", "taxable-earnings",
    "Taxable earnings from distributions exceeding adjusted QEE",
    taxableEarnings,
    taxableGrossDistribution.isZero()
      ? "No taxable distributions"
      : taxableGrossDistribution.lessThanOrEqualTo(adjustedQEE)
        ? "All distributions covered by adjusted qualified education expenses"
        : taxableDistributionEarnings.lessThanOrEqualTo(ZERO)
          ? "No positive earnings to tax"
          : "earnings × (excess distribution / gross distribution)", {
      "Taxable gross distribution": taxableGrossDistribution,
      "Adjusted QEE": adjustedQEE,
      "Excess over QEE": Decimal.max(ZERO, taxableGrossDistribution.minus(adjustedQEE)),
      "Taxable distribution earnings": taxableDistributionEarnings,
    });

  audit.record("Form 1099-Q", "tax-free-earnings",
    "Tax-free earnings allocable to qualified education expenses",
    taxFreeEarnings, "Total earnings - taxable earnings");

  // ── 10% Additional Tax (Form 5329 Part II) ─────────────────────
  const grossPenalty = taxableEarnings.times(PENALTY_RATE)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // Penalty exceptions
  const deathOrDisability = qeeSummary?.penaltyExceptionDeath || qeeSummary?.penaltyExceptionDisability;
  const scholarshipException = zeroFloor(d(qeeSummary?.penaltyExceptionScholarshipAmount));
  const militaryException = zeroFloor(d(qeeSummary?.penaltyExceptionMilitaryAcademyAmount));

  let penaltyExceptionAmount: Decimal;
  if (deathOrDisability) {
    // Death or disability exempts ALL taxable earnings from penalty
    penaltyExceptionAmount = taxableEarnings;
  } else {
    // Scholarship and military exceptions reduce the amount subject to penalty
    // but cannot exceed taxable earnings
    penaltyExceptionAmount = Decimal.min(
      scholarshipException.plus(militaryException),
      taxableEarnings
    );
  }

  const earningsSubjectToPenalty = Decimal.max(ZERO, taxableEarnings.minus(penaltyExceptionAmount));
  const netPenalty = earningsSubjectToPenalty.times(PENALTY_RATE)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  audit.record("Form 1099-Q", "penalty-amount",
    "10% additional tax on taxable earnings (before exceptions)",
    grossPenalty, "taxable earnings × 10%", {
      "Taxable earnings": taxableEarnings,
    });

  audit.record("Form 1099-Q", "penalty-exception-amount",
    "Earnings exempt from the 10% additional tax due to exceptions",
    penaltyExceptionAmount,
    deathOrDisability
      ? "Death or disability — all taxable earnings exempt from penalty"
      : "Scholarship + military academy exceptions (capped at taxable earnings)", {
      "Death or disability": deathOrDisability ? "Yes" : "No",
      "Scholarship exception": scholarshipException,
      "Military academy exception": militaryException,
    });

  audit.record("Form 1099-Q", "net-penalty",
    "Net 10% additional tax after exceptions",
    netPenalty,
    "max(0, taxable earnings - penalty exceptions) × 10%", {
      "Earnings subject to penalty": earningsSubjectToPenalty,
    });

  return {
    sourceFactsVerified: false, taxYear, perDistribution: [], perRecipient: [], returnedContributions: [], coverdellAccounts: [], creditAllocations: [], loanInterestSourceAdjustments: [], loanInterestAdjustments: [],
    grossDistribution,
    totalEarnings,
    totalBasis,
    trusteeToTrusteeTransfers,
    taxableGrossDistribution,
    taxableDistributionEarnings,
    adjustedQEE,
    taxableEarnings,
    taxFreeEarnings,
    grossPenalty,
    penaltyExceptionAmount,
    netPenalty,
    lines: audit.getLines(),
  };
}

type SourceFacts = NonNullable<QualifiedEducationExpenseSummary["sourceFacts"]>;
type SourceExpense = NonNullable<SourceFacts["expenses"]>[number];
type SourceForm = Form1099Q & { sourceId: string; accountId: string; beneficiaryId: string; recipientOwner: "primary" | "spouse" | "other" };
type SourceAllocation = { expense: SourceExpense; form: SourceForm; amount: Decimal; credit: Decimal; allowed: Decimal; loanInterest: Decimal };

function actualAmount(value: string | undefined, label: string, signed = false): Decimal {
  if (value === undefined) throw new Error(`Form1099Q actual ${label} is required`);
  const amount = new Decimal(value);
  if (!amount.isFinite() || (!signed && amount.lt(0))) throw new Error(`Form1099Q ${label} must be finite${signed ? "" : " and nonnegative"}`);
  return amount;
}
function actualBoolean(value: boolean | undefined, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Form1099Q actual ${label} is required`);
  return value;
}
function actualDate(value: string | undefined, label: string): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Form1099Q actual ${label} date is required`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`Form1099Q invalid ${label} date`);
  return date;
}
function uniqueBy<T>(values: T[], key: (value: T) => string, label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const id = key(value);
    if (!id || result.has(id)) throw new Error(`Form1099Q missing or duplicate ${label}`);
    result.set(id, value);
  }
  return result;
}
function requireList<T>(value: T[] | undefined, label: string): T[] {
  if (!Array.isArray(value)) throw new Error(`Form1099Q actual ${label} list is required; use an explicit empty list when none`);
  return value;
}

/** Allocate a computed whole-dollar amount without losing a rounding dollar. */
function proportionalDollars(total: Decimal, weights: Decimal[]): Decimal[] {
  const denominator = sum(...weights);
  if (denominator.isZero()) return weights.map(() => ZERO);
  const exact = weights.map(weight => total.mul(weight).div(denominator));
  const values = exact.map(value => value.floor());
  let remaining = total.minus(sum(...values));
  const order = exact.map((value, index) => ({ index, fraction: value.minus(values[index] ?? ZERO) }))
    .sort((left, right) => right.fraction.comparedTo(left.fraction) || left.index - right.index);
  for (const entry of order) {
    if (remaining.lte(0)) break;
    values[entry.index] = (values[entry.index] ?? ZERO).plus(1);
    remaining = remaining.minus(1);
  }
  return values;
}

function eligibleExpenseAmount(expense: SourceExpense, year: number, accountType: SourceForm["accountType"]): Decimal {
  const amount = actualAmount(expense.amount, `expense ${expense.id} amount`);
  const refunded = actualAmount(expense.refundedAmount, `expense ${expense.id} refunds`);
  const assistance = actualAmount(expense.taxFreeAssistance, `expense ${expense.id} assistance`);
  const credit = actualAmount(expense.educationCreditAmount, `expense ${expense.id} education credit allocation`);
  const other = actualAmount(expense.otherTaxBenefitAmount, `expense ${expense.id} other-benefit allocation`);
  if (sum(refunded, assistance, credit, other).gt(amount)) throw new Error(`Form1099Q expense ${expense.id} reductions exceed actual expense`);
  const paid = actualDate(expense.paidDate, `expense ${expense.id} paid`);
  if (paid.getUTCFullYear() !== year) throw new Error(`Form1099Q expense ${expense.id} paid year does not match distribution year`);
  if (!actualBoolean(expense.qualificationConfirmed, `expense ${expense.id} qualification`)) return ZERO;
  let qualified = amount.minus(refunded);
  if (expense.category === "postsecondary_room_board") {
    const halfTime = actualBoolean(expense.halfTimeStudent, "half-time enrollment for room and board");
    const allowance = actualAmount(expense.roomBoardAllowance, "actual school room-and-board allowance");
    const housing = actualAmount(expense.schoolOwnedHousingCharge, "actual institution-owned housing charge (zero if none)");
    qualified = halfTime ? Decimal.min(qualified, Decimal.max(allowance, housing)) : ZERO;
  }
  if (expense.category === "k12_tutoring" && accountType === "529") {
    const unrelated = actualBoolean(expense.tutorUnrelated, "tutor unrelated to student");
    const outside = actualBoolean(expense.tutoringOutsideHome, "tutoring outside home");
    const qualifiedTutor = actualBoolean(expense.tutorQualified, "tutor statutory credentials");
    if (!(unrelated && outside && qualifiedTutor)) qualified = ZERO;
  }
  if (expense.category === "k12_disability_therapy" && accountType === "529") {
    const disability = actualBoolean(expense.studentHasDisability, "student disability");
    const provider = actualBoolean(expense.providerLicensedOrAccredited, "licensed or accredited therapy provider");
    if (!(disability && provider)) qualified = ZERO;
  }
  if (expense.category.startsWith("credential_")) {
    const recognized = actualBoolean(expense.credentialRecognized, "recognized postsecondary credential");
    const required = actualBoolean(expense.requiredForCredential, "expense required for credential");
    if (!(recognized && required)) qualified = ZERO;
  }
  if (["coverdell_k12_other", "qtp_contribution"].includes(expense.category) && accountType !== "coverdell_esa") qualified = ZERO;
  if (expense.category === "apprenticeship" && accountType === "coverdell_esa") qualified = ZERO;
  if (expense.category === "student_loan") {
    const related = actualBoolean(expense.beneficiaryOrSibling, "student-loan borrower beneficiary or sibling relationship");
    const interest = actualAmount(expense.studentLoanInterestAmount, "student-loan interest paid");
    const deducted = actualAmount(expense.studentLoanInterestDeducted, "student-loan interest claimed as a deduction");
    if (interest.gt(amount) || deducted.gt(interest)) throw new Error("Form1099Q student-loan interest deduction must reconcile to actual interest");
    if (!related || accountType !== "529") qualified = ZERO;
  }
  return zeroFloor(qualified.minus(assistance).minus(credit).minus(other));
}

function expandedExpenseAllowed(form: SourceForm, expense: SourceExpense, year: number): boolean {
  if (year !== 2025) return true;
  const expanded = (form.accountType === "529" && expense.category.startsWith("k12_") && expense.category !== "k12_tuition") || expense.category.startsWith("credential_");
  if (!expanded) return true;
  if (form.distributionDate !== undefined) return actualDate(form.distributionDate, "distribution").getTime() > Date.UTC(2025, 6, 4);
  return actualBoolean(form.allDistributionsAfterJuly42025, "all statement distributions after July4,2025, or actual distribution date");
}

interface TransferState {
  capacities: Map<string, Decimal>;
  baselines: Map<string, string>;
  rolloverDates: Map<string, Date>;
}
function reconcileTransferBaseline(state: TransferState, key: string, values: Array<string | number | Decimal>): void {
  const value = values.map(item => item.toString()).join("|");
  const prior = state.baselines.get(key);
  if (prior !== undefined && prior !== value) throw new Error("Form1099Q inconsistent transfer capacity source facts");
  state.baselines.set(key, value);
}
function validTransfer(form: SourceForm, gross: Decimal, year: number, audit: AuditTrail, state: TransferState): Decimal {
  const { capacities } = state;
  const transfer = form.transfer;
  if (!transfer) throw new Error(`Form1099Q actual transfer facts required for ${form.sourceId}`);
  if (transfer.kind === "none") {
    if (form.isTrusteeToTrustee || form.isQtpToRoth) throw new Error("Form1099Q transfer facts contradict Box4");
    return ZERO;
  }
  const amount = actualAmount(transfer.amount, "transfer amount");
  if (amount.gt(gross)) throw new Error("Form1099Q transfer exceeds gross distribution");
  const paid = actualDate(form.distributionDate, "distribution");
  const received = actualDate(transfer.receivedDate, "transfer received");
  if (paid.getUTCFullYear() !== year || received < paid) throw new Error("Form1099Q invalid transfer/distribution year or date order");
  const days = (received.getTime() - paid.getTime()) / 86_400_000;
  const same = actualBoolean(transfer.sameBeneficiary, "transfer same beneficiary");
  const family = actualBoolean(transfer.eligibleFamilyMember, "transfer family relationship");
  let eligible = same || family;
  let allowed = amount;
  if (transfer.kind === "qtp" || transfer.kind === "coverdell") {
    eligible &&= days <= 60;
    if (transfer.kind === "qtp" && form.accountType === "coverdell_esa") {
      //Section530(b)(2)(B) treats this as an education expense, not an
      //ESA rollover. The actual destination contribution is validated below.
      if (!transfer.destinationAccountId) throw new Error("Form1099Q actual QTP contribution destination account is required");
      audit.record("Form1099-Q", `${form.sourceId}:qtp-contribution`, "Coverdell contribution to QTP requiring actual expense allocation", amount, "Same-beneficiary contribution is tested through the education expense ledger");
      return ZERO;
    }
    if (transfer.kind === "coverdell" && form.accountType !== "coverdell_esa") eligible = false;
    //Direct Coverdell trustee transfers are not rollovers under Pub970.
    const rolloverLimited = (transfer.kind === "qtp" && same) || (transfer.kind === "coverdell" && !form.isTrusteeToTrustee);
    let rolloverKey: string | undefined;
    if (rolloverLimited) {
      const key = `${transfer.kind}:${form.beneficiaryId}`;
      const previous = state.rolloverDates.get(key);
      const twelveMonthsEarlier = new Date(paid);
      twelveMonthsEarlier.setUTCFullYear(twelveMonthsEarlier.getUTCFullYear() - 1);
      eligible &&= !actualBoolean(transfer.priorRolloverWithin12Months, "prior rollover within12months") && (!previous || previous <= twelveMonthsEarlier);
      rolloverKey = key;
    }
    if (transfer.kind === "coverdell") {
      if (transfer.destinationBeneficiaryAge === undefined) throw new Error("Form1099Q actual destination Coverdell beneficiary age is required");
      const specialNeeds = actualBoolean(transfer.destinationSpecialNeeds, "destination Coverdell special needs");
      eligible &&= transfer.destinationBeneficiaryAge < 30 || specialNeeds;
    }
    if (eligible && rolloverKey && amount.gt(0)) state.rolloverDates.set(rolloverKey, paid);
  } else if (transfer.kind === "able") {
    eligible &&= form.accountType === "529" && days <= 60 && actualBoolean(transfer.destinationAccountEligible, "destination ABLE account eligibility");
    const limit = d(year === 2026 ? "20000" : "19000");
    if (transfer.ableAnnualContributionLimit !== undefined && !actualAmount(transfer.ableAnnualContributionLimit, "ABLE annual rollover contribution limit").eq(limit)) throw new Error("Form1099Q ABLE rollover annual limit must match the year-specific statutory limit (2026:20000;2025:19000)");
    const other = actualAmount(transfer.otherAbleContributions, "other contributions to destination ABLE account");
    if (!transfer.destinationAccountId) throw new Error("Form1099Q actual destination ABLE account identity is required");
    const key = `able:${transfer.destinationAccountId}`;
    reconcileTransferBaseline(state, key, [limit, other]);
    const remaining = capacities.get(key) ?? zeroFloor(limit.minus(other));
    allowed = Decimal.min(amount, remaining);
    if (eligible) capacities.set(key, remaining.minus(allowed));
  } else if (transfer.kind === "roth") {
    eligible = form.accountType === "529" && same && form.isQtpToRoth === true;
    const opened = actualDate(transfer.accountOpenedDate, "QTP account opened");
    const anniversary = new Date(opened);
    anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 15);
    eligible &&= paid >= anniversary;
    const oldFunds = actualAmount(transfer.contributionsAndEarningsBeforeFiveYears, "contributions and earnings before five-year period");
    const compensation = actualAmount(transfer.beneficiaryTaxableCompensation, "beneficiary taxable compensation");
    const other = actualAmount(transfer.otherIraContributions, "other IRA contributions");
    const previous = actualAmount(transfer.previousRothRollovers, "previous QTP-to-Roth rollovers");
    if (transfer.beneficiaryAgeAtYearEnd === undefined) throw new Error("Form1099Q actual Roth beneficiary age is required");
    const limit = d(year === 2026 ? "7500" : "7000").plus(transfer.beneficiaryAgeAtYearEnd >= 50 ? (year === 2026 ? "1100" : "1000") : "0");
    if (received.getUTCFullYear() !== year) throw new Error("Form1099Q direct Roth transfer must reconcile to its actual contribution tax year");
    const key = `roth:${form.beneficiaryId}`;
    reconcileTransferBaseline(state, key, [limit, compensation, other, previous]);
    const accountKey = `roth-funds:${form.accountId}`;
    reconcileTransferBaseline(state, accountKey, [transfer.accountOpenedDate ?? "", oldFunds]);
    const eligibleFunds = capacities.get(accountKey) ?? oldFunds;
    const remaining = capacities.get(key) ?? Decimal.min(zeroFloor(Decimal.min(limit, compensation).minus(other)), zeroFloor(d(35000).minus(previous)));
    allowed = Decimal.min(amount, eligibleFunds, remaining);
    if (eligible) {
      capacities.set(key, remaining.minus(allowed));
      capacities.set(accountKey, eligibleFunds.minus(allowed));
    }
  } else {
    eligible = form.accountType === "529" && same;
    const refunded = actualDate(transfer.refundDate, "education expense refund");
    const refundAmount = actualAmount(transfer.refundedExpenseAmount, "refunded education expense amount");
    const refundDays = (received.getTime() - refunded.getTime()) / 86_400_000;
    eligible &&= refundDays >= 0 && refundDays <= 60;
    if (!transfer.refundSourceId) throw new Error("Form1099Q actual refund source identity is required");
    const key = `refund:${transfer.refundSourceId}`;
    reconcileTransferBaseline(state, key, [form.beneficiaryId, transfer.refundDate ?? "", refundAmount]);
    const remaining = capacities.get(key) ?? refundAmount;
    allowed = Decimal.min(amount, remaining);
    if (eligible) capacities.set(key, remaining.minus(allowed));
  }
  const result = eligible ? allowed : ZERO;
  audit.record("Form1099-Q", `${form.sourceId}:valid-transfer`, "Verified tax-free transfer or refund recontribution", result,
    "Actual source eligibility, dates, relationship and applicable capacity", { "Requested transfer": amount, "Eligible": eligible ? "Yes" : "No", "Kind": transfer.kind });
  return result;
}

function isReturnedContribution(form: Form1099Q): boolean {
  return form.distributionCode === "2" || form.distributionCode === "3";
}
function actualReturnedContribution(form: SourceForm, audit: AuditTrail): ReturnedEducationContribution {
  if (form.accountType !== "coverdell_esa" || form.recipientNotBeneficiary || form.isTrusteeToTrustee || form.isQtpToRoth || form.transfer?.kind !== "none") throw new Error("Form1099Q returned contribution requires an actual Coverdell beneficiary and no transfer");
  if (!form.returnedContributionId || form.returnedContributionNetIncomeConfirmed !== true || form.returnedContributionBasisReconciled !== true) throw new Error("Form1099Q actual returned contribution net-income and corrected-basis reconciliation is required");
  const incomeTaxYear = form.returnedContributionTaxYear;
  if (!Number.isInteger(incomeTaxYear) || incomeTaxYear === undefined || form.taxYear === undefined || incomeTaxYear !== form.taxYear - (form.distributionCode === "3" ? 1 : 0)) throw new Error("Form1099Q returned contribution code and actual income year must reconcile");
  const contributed = actualDate(form.returnedContributionDate, "returned contribution made");
  const returned = actualDate(form.distributionDate, "returned contribution distribution");
  const contributionStart = new Date(Date.UTC(incomeTaxYear, 0, 1));
  const contributionDeadline = new Date(Date.UTC(incomeTaxYear + 1, 3, 15));
  if (contributed < contributionStart || contributed > contributionDeadline || contributed > returned) throw new Error("Form1099Q actual contribution date does not support its designated tax year");
  if (returned >= new Date(Date.UTC(incomeTaxYear + 1, 5, 1))) throw new Error("Form1099Q correction must be completed before the June1 statutory deadline");
  const original = actualAmount(form.returnedContributionOriginalAmount, "original returned contribution source amount");
  const returnedPrincipal = actualAmount(form.returnedContributionPrincipal, "returned contribution principal");
  const netIncome = actualAmount(form.returnedContributionNetIncome, "actual returned contribution net income", true);
  const gross = actualAmount(form.grossDistribution, "returned contribution Box1");
  if (returnedPrincipal.isZero() || returnedPrincipal.gt(original) || !returnedPrincipal.plus(netIncome).eq(gross)) throw new Error("Form1099Q returned principal and attributable net income must reconcile to the source contribution and Box1");
  if ((form.earnings === undefined) !== (form.basis === undefined)) throw new Error("Form1099Q returned contribution Boxes2/3 must be jointly reconciled");
  if (form.earnings !== undefined && form.basis !== undefined) {
    const box2 = actualAmount(form.earnings, "returned contribution Box2", true), box3 = actualAmount(form.basis, "returned contribution Box3");
    const reportedEarnings = netIncome.lt(0) && form.finalDistribution !== true ? ZERO : netIncome;
    if (!box2.eq(reportedEarnings) || !box3.plus(box2).eq(gross)) throw new Error("Form1099Q returned contribution reported boxes do not reconcile to the actual net-income worksheet");
  }
  const taxableEarnings = roundDollar(zeroFloor(netIncome));
  const previouslyReportedEarnings = actualAmount(form.returnedContributionIncomePreviouslyReported, "returned contribution income previously reported");
  const incomeAdjustment = taxableEarnings.minus(previouslyReportedEarnings);
  for (const [line, description, value] of [["returned-principal", "Actual returned contribution principal", returnedPrincipal], ["returned-net-income", "Actual returned contribution net income", netIncome], ["income-year-earnings", `Returned contribution earnings taxable in ${incomeTaxYear}`, taxableEarnings], ["previously-reported-earnings", `Actual earnings previously reported for ${incomeTaxYear}`, previouslyReportedEarnings], ["income-adjustment", `Income reconciliation difference for ${incomeTaxYear}`, incomeAdjustment]] as const) audit.record("Form1099-Q", `${form.sourceId}:${line}`, description, value, "IRC530(b)(4) and(d)(4)(C); actual contribution year and custodian net-income calculation");
  return { sourceId: form.sourceId, accountId: form.accountId, contributionId: form.returnedContributionId, sourceTaxYear: form.taxYear, incomeTaxYear,
    recipientOwner: form.recipientOwner, recipientId: form.recipientOwner === "other" ? (form.recipientId ?? "") : form.recipientOwner,
    returnedPrincipal, netIncome, taxableEarnings, previouslyReportedEarnings, incomeAdjustment };
}
function recordSourceDistribution(row: EducationDistributionResult, audit: AuditTrail): EducationDistributionResult {
  const formula = row.treatment === "account_disqualification" ? "Actual January1 whole-account value and basis under IRC530(e),408(e)(2); verified zero qualified expenses and no later income/gain/loss"
    : row.treatment === "returned_contribution" ? "Actual returned contribution and attributable net income under IRC530(b)(4) and(d)(4)(C)"
    : "Actual linked source allocation, income year and Pub970 distribution calculation";
  for (const [line, description, amount] of [["gross", "Actual gross education distribution", row.grossDistribution], ["earnings", "Distributed earnings", row.earnings], ["basis", "Distributed basis", row.basis], ["adjusted-qee", "Allocated adjusted qualified expenses", row.adjustedQEE], ["taxable-earnings", "Distribution earnings taxable in the return year", row.taxableEarnings], ["education-excluded-earnings", "Earnings excluded for actual education expenses", row.educationExpenseExcludedEarnings], ["transfer-excluded-earnings", "Earnings excluded for actual valid transfers", row.transferExcludedEarnings], ["credit-exception", "Earnings taxable solely because expenses were allocated to education credit", row.creditException], ["exception", "Return-year taxable earnings exempt from additional tax", row.penaltyException]] as const) audit.record("Form1099-Q", `${row.sourceId}:${line}`, description, amount, formula);
  return row;
}

function actualDisqualification(form: Form1099Q, taxYear: number): { earnings: Decimal; basis: Decimal } {
  if (form.accountType !== "coverdell_esa") throw new Error("Form1099Q code6 requires an actual Coverdell source");
  const kind = form.prohibitedTransactionKind;
  if (kind !== "account_disqualification" && kind !== "pledged_portion") throw new Error("Form1099Q code6 source reconciliation requires the actual prohibited transaction type");
  if (form.prohibitedTransactionSourceConfirmed !== true) throw new Error("Form1099Q prohibited transaction source must be confirmed");
  if (!form.prohibitedTransactionSourceReference?.trim()) throw new Error("Form1099Q prohibited transaction source reference is required");
  const date = actualDate(form.prohibitedTransactionDate, "prohibited transaction");
  if (date.getUTCFullYear() !== taxYear) throw new Error("Form1099Q prohibited transaction event year must match the statement and return");
  const basis = actualAmount(form.prohibitedTransactionBasis, "prohibited transaction basis");
  const label = kind === "account_disqualification" ? "January1 account value" : "pledged portion";
  const deemedAmount = actualAmount(kind === "account_disqualification" ? form.prohibitedTransactionJanuary1Value : form.prohibitedTransactionPledgedAmount, label);
  if (!actualAmount(form.grossDistribution, "Box1").eq(deemedAmount)) throw new Error(`Form1099Q Box1 must reconcile to the actual ${label}`);
  if (form.transfer?.kind !== "none" || form.isTrusteeToTrustee || form.isQtpToRoth) throw new Error("Form1099Q code6 cannot use ordinary transfer treatment");
  if (kind === "pledged_portion") throw new Error("Form1099Q pledged portion has unresolved retained basis and education-expense treatment; this source cannot use the ordinary worksheet");
  if (basis.gt(deemedAmount)) throw new Error("Form1099Q disqualification basis exceeds January1 value; loss treatment remains unresolved");
  const qualifiedExpenses = actualAmount(form.prohibitedTransactionQualifiedEducationExpenses, "beneficiary total qualified education expenses including QTP contributions");
  if (!qualifiedExpenses.isZero()) throw new Error("Form1099Q disqualification requires actual zero qualified education expenses including QTP contributions; education-exclusion treatment remains unresolved");
  if (form.prohibitedTransactionNoPostDisqualificationActivityConfirmed !== true) throw new Error("Form1099Q disqualification requires verified absence of subsequent income, gain and loss; later activity requires separate source routing");
  if (!form.prohibitedTransactionPostDisqualificationSourceReference?.trim()) throw new Error("Form1099Q disqualification subsequent-activity source reference is required");
  const earnings = deemedAmount.minus(basis);
  if ((form.earnings === undefined) !== (form.basis === undefined)) throw new Error("Form1099Q disqualification reported basis and earnings must be jointly reconciled");
  if (form.earnings !== undefined && form.basis !== undefined && (!actualAmount(form.earnings, "reported deemed-distribution earnings").eq(earnings) || !actualAmount(form.basis, "reported deemed-distribution basis").eq(basis))) throw new Error("Form1099Q disqualification reported basis and earnings do not reconcile to the actual January1 source");
  return { earnings, basis };
}

function calculateSourceDistributions(forms: Form1099Q[], summary: QualifiedEducationExpenseSummary | undefined, options: Form1099QOptions & { taxYear: number }): Form1099QResult {
  const facts = summary?.sourceFacts;
  if (!facts || facts.sourceFactsConfirmed !== true || facts.allDistributionsReconciled !== true) throw new Error("Form1099Q actual reconciled education distribution source facts are required");
  if (facts.taxYear !== options.taxYear) throw new Error("Form1099Q source year does not match return year");
  const audit = new AuditTrail();
  if (summary && Object.entries(summary).some(([key, value]) => key !== "sourceFacts" && value !== undefined)) throw new Error("Form1099Q legacy aggregate fields require explicit source reconciliation and removal before using the source ledger");
  const beneficiaries = uniqueBy(requireList(facts.beneficiaries, "beneficiaries"), item => item.id, "beneficiary");
  const expenses = uniqueBy(requireList(facts.expenses, "expenses"), item => item.id, "expense");
  const rawAllocations = requireList(facts.allocations, "expense allocations");
  const borrowers = uniqueBy(requireList(facts.loanBorrowers, "loan borrowers"), item => item.id, "loan borrower");
  const coverdellFacts = uniqueBy(requireList(facts.coverdellAccounts, "Coverdell account history"), item => item.accountId, "Coverdell account");
  const exceptions = requireList(facts.penaltyExceptions, "additional-tax exceptions");
  uniqueBy(exceptions, item => item.id, "exception source");
  const sources = uniqueBy(forms, item => item.sourceId ?? "", "distribution source");
  const verifiedForms = forms.map((item): SourceForm => {
    if (!item.transfer) throw new Error("Form1099Q actual transfer facts are required, including an explicit none");
    if (item.sourceFactsComplete === false || item.sourceFactsConfirmed !== true || !item.sourceId || !item.accountId || !item.beneficiaryId || !item.recipientOwner) throw new Error(item.distributionCode === "6" ? "Form1099Q code6 actual source reconciliation is incomplete" : "Form1099Q actual statement source facts are incomplete");
    const nextYearCorrection = isReturnedContribution(item) && item.distributionCode === "3" && item.taxYear === options.taxYear + 1 && item.returnedContributionTaxYear === options.taxYear;
    if (item.taxYear !== options.taxYear && !nextYearCorrection) throw new Error("Form1099Q statement year does not match return year or an actual following-year correction");
    actualBoolean(item.isTrusteeToTrustee, "Box4a"); actualBoolean(item.isQtpToRoth, "Box4b"); actualBoolean(item.recipientNotBeneficiary, "Box6");
    if (item.isTrusteeToTrustee && item.isQtpToRoth) throw new Error("Form1099Q Box4a and Box4b cannot both be checked");
    if (item.distributionDate !== undefined && actualDate(item.distributionDate, "distribution").getUTCFullYear() !== item.taxYear) throw new Error("Form1099Q distribution date year does not match statement year");
    if (item.isQtpToRoth && item.recipientNotBeneficiary) throw new Error("Form1099Q Roth transfer recipient must be the designated beneficiary");
    if (item.isQtpToRoth !== (item.transfer.kind === "roth")) throw new Error("Form1099Q transfer kind does not reconcile with Box4b");
    if (item.recipientOwner === "other" && !item.recipientId) throw new Error("Form1099Q actual other-recipient identity is required");
    if (!beneficiaries.has(item.beneficiaryId)) throw new Error("Form1099Q statement beneficiary source is missing");
    if (item.accountType === "coverdell_esa" && item.recipientNotBeneficiary && item.distributionCode !== "5") throw new Error("Form1099Q Coverdell recipient must be the designated beneficiary unless an actual death distribution is reported");
    if (item.distributionCode !== "6" && Object.entries(item).some(([key, value]) => key.startsWith("prohibitedTransaction") && value !== undefined)) throw new Error("Form1099Q prohibited transaction source facts require actual code6 reconciliation");
    return { ...item, sourceId: item.sourceId, accountId: item.accountId, beneficiaryId: item.beneficiaryId, recipientOwner: item.recipientOwner };
  });
  const verifiedById = new Map(verifiedForms.map(item => [item.sourceId, item]));
  const inKindSources = verifiedForms.filter(item => item.distributionMedium === "in_kind_prepaid_tuition");
  for (const form of inKindSources) {
    if (form.accountType !== "529" || form.recipientNotBeneficiary || form.isTrusteeToTrustee || form.isQtpToRoth
      || form.transfer?.kind !== "none" || isReturnedContribution(form) || form.distributionCode === "6") throw new Error("Form1099Q in-kind benefits require an ordinary QTP benefit to its designated beneficiary without a transfer or correction");
    if (options.taxpayer) {
      const taxpayer = options.taxpayer;
      const identity = (value: string | undefined) => value && /^\d{3}-?\d{2}-?\d{4}$/.test(value) ? value.replaceAll("-", "") : undefined;
      const beneficiaryIdentity = identity(beneficiaries.get(form.beneficiaryId)?.studentTaxId);
      const primaryIdentity = identity(taxpayer.primary.ssn);
      const jointReturn = taxpayer.filingStatus === "married_filing_jointly";
      const spouseIdentity = jointReturn ? identity(taxpayer.spouse?.ssn) : undefined;
      if (taxpayer.taxYear !== options.taxYear || !beneficiaryIdentity || !primaryIdentity
        || (jointReturn && (!spouseIdentity || spouseIdentity === primaryIdentity))) {
        throw new Error("Form1099Q in-kind recipient requires actual reconciled beneficiary and return identities");
      }
      const owner = beneficiaryIdentity === primaryIdentity ? "primary" : beneficiaryIdentity === spouseIdentity ? "spouse" : "other";
      if (form.recipientOwner !== owner) throw new Error("Form1099Q in-kind recipient owner conflicts with the actual designated beneficiary identity");
    }
  }
  if (inKindSources.length && facts.inKindBenefits === undefined) throw new Error("Form1099Q actual in-kind benefit source records are required");
  const rawBenefits = facts.inKindBenefits ?? [];
  uniqueBy(rawBenefits, item => item.id, "in-kind benefit");
  const inKindBenefits = rawBenefits.map(item => {
    const form = verifiedById.get(item.sourceId), expense = expenses.get(item.expenseId);
    if (!form || !expense) throw new Error("Form1099Q in-kind benefit references a missing source or expense");
    if (form.distributionMedium !== "in_kind_prepaid_tuition") throw new Error("Form1099Q in-kind benefits must link to an actual in-kind statement");
    if (expense.beneficiaryId !== form.beneficiaryId) throw new Error("Form1099Q in-kind benefit beneficiary does not match its expense");
    if (!item.sourceReference?.trim()) throw new Error("Form1099Q actual in-kind benefit source reference is required");
    const providedDate = actualDate(item.providedDate, "in-kind benefit provided");
    if (providedDate.getUTCFullYear() !== options.taxYear) throw new Error("Form1099Q in-kind benefit year must match the return year");
    const qualified = actualBoolean(item.qualificationConfirmed, "in-kind benefit qualification");
    if (qualified !== actualBoolean(expense.qualificationConfirmed, "in-kind expense qualification")) throw new Error("Form1099Q in-kind benefit and expense qualification facts conflict");
    const amount = actualAmount(item.amount, "in-kind benefit amount");
    audit.record("Form1099-Q", `${form.sourceId}:in-kind-benefit:${item.id}`, "Actual provided benefit cost", amount, "Actual source benefit, separate from the tax allocation", {
      "Expense source": expense.id, "Provided date": providedDate.toISOString().slice(0, 10), "Qualification": qualified ? "yes" : "no", "Source reference": item.sourceReference.trim(),
    });
    return { form, expense, amount };
  });
  for (const form of inKindSources) {
    const provided = sum(...inKindBenefits.filter(item => item.form.sourceId === form.sourceId).map(item => item.amount));
    if (!provided.eq(actualAmount(form.grossDistribution, "in-kind Box1"))) throw new Error("Form1099Q actual in-kind benefit amounts must reconcile exactly to Box1");
    audit.record("Form1099-Q", `${form.sourceId}:in-kind-provided`, "Actual in-kind QTP benefit costs", provided, "Sum actual linked benefits provided to the designated beneficiary; reconcile to source Box1");
  }
  const disqualifiedBySource = new Map<string, { earnings: Decimal; basis: Decimal }>();
  for (const form of verifiedForms.filter(item => item.distributionCode === "6")) {
    const amounts = actualDisqualification(form, options.taxYear);
    if (verifiedForms.some(item => item.accountId === form.accountId && item.sourceId !== form.sourceId)) throw new Error("Form1099Q terminated account has another statement; subsequent source reconciliation is required");
    if (coverdellFacts.has(form.accountId)) throw new Error("Form1099Q disqualification cannot use conflicting ordinary year-end account history");
    const beneficiary = beneficiaries.get(form.beneficiaryId);
    const outsideQualified = actualAmount(beneficiary?.outsideK12QualifiedDistributions, "beneficiary outside qualified K12 distributions");
    if (!outsideQualified.isZero() || [...expenses.values()].some(item => item.beneficiaryId === form.beneficiaryId) || rawAllocations.some(item => item.sourceId === form.sourceId)) throw new Error("Form1099Q disqualification education/QTP allocation treatment remains unresolved; reconcile conflicting beneficiary source facts");
    const creditStudents = [...(options.educationExpenses?.aocStudents ?? []), ...(options.educationExpenses?.llcStudents ?? [])];
    const normalizedIdentity = (value: string | undefined) => value && /^\d{3}-?\d{2}-?\d{4}$/.test(value) ? value.replaceAll("-", "") : undefined;
    const identity = normalizedIdentity(beneficiary?.studentTaxId);
    const unassignedLlc = options.educationExpenses?.llcExpenses !== undefined && actualAmount(options.educationExpenses.llcExpenses, "LLC expense total").gt(0) && !options.educationExpenses.llcStudents?.length;
    if (unassignedLlc || creditStudents.some(item => {
      const studentIdentity = normalizedIdentity(item.studentTaxId);
      return (!identity || !studentIdentity || studentIdentity === identity) && actualAmount(item.qualifiedExpenses, "education-credit student expenses").gt(0);
    })) throw new Error("Form1099Q disqualification education-credit facts conflict with actual zero qualified expenses; treatment remains unresolved");
    if (exceptions.some(item => item.sourceId === form.sourceId)) throw new Error("Form1099Q disqualification additional-tax exception treatment remains unresolved");
    disqualifiedBySource.set(form.sourceId, amounts);
  }
  const returnedContributions = verifiedForms.filter(isReturnedContribution).map(form => actualReturnedContribution(form, audit));
  const returnedBySource = new Map(returnedContributions.map(item => [item.sourceId, item]));
  for (const contributionId of new Set(returnedContributions.map(item => item.contributionId))) {
    const group = returnedContributions.filter(item => item.contributionId === contributionId);
    const first = group[0];
    const originals = verifiedForms.filter(item => item.returnedContributionId === contributionId && isReturnedContribution(item));
    const original = actualAmount(originals[0]?.returnedContributionOriginalAmount, "original contribution amount");
    if (!first || group.some(item => item.accountId !== first.accountId || item.incomeTaxYear !== first.incomeTaxYear || item.recipientOwner !== first.recipientOwner || item.recipientId !== first.recipientId)
      || originals.some(item => !actualAmount(item.returnedContributionOriginalAmount, "original contribution amount").eq(original) || item.returnedContributionDate !== originals[0]?.returnedContributionDate)
      || sum(...group.map(item => item.returnedPrincipal)).gt(original)) throw new Error("Form1099Q returned contribution identity or total exceeds the reconciled original contribution");
  }
  const allocationKeys = new Set<string>();
  const allocations: SourceAllocation[] = rawAllocations.map(item => {
    const expense = expenses.get(item.expenseId), form = verifiedById.get(item.sourceId);
    if (!expense || !form) throw new Error("Form1099Q allocation references a missing expense or distribution source");
    if (isReturnedContribution(form)) throw new Error("Form1099Q returned contribution correction cannot receive an ordinary education expense allocation");
    if (expense.beneficiaryId !== form.beneficiaryId) throw new Error("Form1099Q allocation beneficiary does not match distribution beneficiary");
    const key = `${item.expenseId}\u0000${item.sourceId}`;
    if (allocationKeys.has(key)) throw new Error("Form1099Q duplicate expense/distribution allocation");
    allocationKeys.add(key);
    const amount = actualAmount(item.amount, "expense allocation");
    const loanInterest = expense.category === "student_loan" ? actualAmount(item.loanInterestAmount, "allocated loan interest") : ZERO;
    if (loanInterest.gt(amount)) throw new Error("Form1099Q allocated loan interest exceeds the payment allocation");
    return { expense, form, amount, credit: actualAmount(item.creditAmount, "credit expense allocation"), allowed: ZERO, loanInterest };
  });
  const inKindPairs = new Set(inKindBenefits.map(item => `${item.form.sourceId}\u0000${item.expense.id}`));
  for (const item of allocations.filter(item => item.form.distributionMedium === "in_kind_prepaid_tuition")) inKindPairs.add(`${item.form.sourceId}\u0000${item.expense.id}`);
  for (const key of inKindPairs) {
    const benefits = inKindBenefits.filter(item => `${item.form.sourceId}\u0000${item.expense.id}` === key);
    const allocation = allocations.find(item => `${item.form.sourceId}\u0000${item.expense.id}` === key);
    if (!benefits.length || !allocation) throw new Error("Form1099Q actual in-kind benefit and allocation sources must be linked");
    const provided = sum(...benefits.map(item => item.amount));
    const expense = allocation.expense;
    const assistance = actualAmount(expense.taxFreeAssistance, "in-kind expense assistance");
    if (assistance.gt(0)) {
      // Spec: form-1099-q-in-kind-assistance.yaml. The assistance belongs to
      // one complete actual tuition benefit; no shared-source split is inferred.
      assertDistinctEducationBeneficiaries(verifiedForms, facts);
      if (expense.category !== "postsecondary_tuition" || expense.qualificationConfirmed !== true || benefits.length !== 1
        || !actualAmount(expense.amount, "in-kind tuition expense").eq(provided)
        || verifiedForms.filter(form => form.beneficiaryId === allocation.form.beneficiaryId).length !== 1
        || [...expenses.values()].filter(source => source.beneficiaryId === expense.beneficiaryId).length !== 1
        || allocations.filter(source => source.form.beneficiaryId === expense.beneficiaryId).length !== 1
        || !allocation.credit.isZero()
        || [expense.refundedAmount, expense.educationCreditAmount, expense.otherTaxBenefitAmount]
          .some(value => !actualAmount(value, "in-kind assistance other reduction").isZero())) {
        throw new Error("Form1099Q in-kind assistance requires one actual tuition benefit and expense with known zero other reductions");
      }
      audit.record("Form1099-Q", `${allocation.form.sourceId}:in-kind-assistance:${expense.id}`, "Actual tax-free assistance against the in-kind tuition benefit", assistance,
        "IRC529(c)(3)(B)(v)(I) and25A(g)(2); actual source reduction, not an additional-tax exception", {
          "Actual expense": actualAmount(expense.amount, "in-kind tuition expense"), "Provided benefit": provided,
          "Refund": actualAmount(expense.refundedAmount, "refund"), "Tax-free assistance": assistance,
          "Education credit expense": actualAmount(expense.educationCreditAmount, "credit expense"),
          "Other tax benefit": actualAmount(expense.otherTaxBenefitAmount, "other benefit"), "Original allocation": allocation.amount,
        });
    }
    if (!allocation.amount.plus(allocation.credit).plus(assistance).eq(provided)) throw new Error("Form1099Q in-kind allocation, actual credit expense and supported assistance must conserve its benefit cost; unexplained partial allocation is unsupported");
    if (allocation.credit.gt(0) && (allocation.expense.category !== "postsecondary_tuition" || allocation.expense.qualificationConfirmed !== true)) throw new Error("Form1099Q in-kind credit allocation requires actual qualifying postsecondary tuition");
    audit.record("Form1099-Q", `${allocation.form.sourceId}:in-kind-allocation:${allocation.expense.id}`, "Actual in-kind QTP expense allocation", allocation.amount,
      assistance.gt(0) ? "Actual provided benefit cost less its actual tax-free assistance" : "Actual provided benefit cost less the explicitly allocated education-credit expense",
      { "Education credit expense": allocation.credit });
  }
  for (const expense of expenses.values()) {
    if (!beneficiaries.has(expense.beneficiaryId)) throw new Error("Form1099Q expense beneficiary source is missing");
    const amount = actualAmount(expense.amount, "expense amount");
    const refunds = actualAmount(expense.refundedAmount, "expense refunds");
    const assistance = actualAmount(expense.taxFreeAssistance, "expense assistance");
    const credit = actualAmount(expense.educationCreditAmount, "expense credit allocation");
    const other = actualAmount(expense.otherTaxBenefitAmount, "expense other-benefit allocation");
    const available = amount.minus(sum(refunds, assistance, credit, other));
    if (available.lt(0)) throw new Error("Form1099Q expense reductions exceed actual expense");
    const linked = allocations.filter(item => item.expense.id === expense.id);
    const requested = sum(...linked.map(item => item.amount));
    if (requested.gt(available) || sum(...linked.map(item => item.credit)).gt(credit)) throw new Error("Form1099Q allocations exceed available expense or credit reduction");
    const benefits = inKindBenefits.filter(item => item.expense.id === expense.id);
    if (benefits.length) {
      const inKindAllocations = linked.filter(item => item.form.distributionMedium === "in_kind_prepaid_tuition");
      const creditReduced = inKindAllocations.some(item => item.credit.gt(0));
      audit.record("Form1099-Q", `${expense.id}:after-in-kind`, creditReduced ? "Expense remaining after actual in-kind benefit allocation" : "Expense remaining after actual in-kind benefit costs", available.minus(sum(...inKindAllocations.map(item => item.amount))), "Paid expense less actual reductions and the in-kind QTP expense allocation; other allocations must fit the remainder");
    }
    if (expense.category === "student_loan" && sum(...linked.map(item => item.loanInterest)).gt(actualAmount(expense.studentLoanInterestAmount, "actual paid loan interest"))) throw new Error("Form1099Q allocations exceed actual paid loan interest");
    const paid = actualDate(expense.paidDate, "expense paid");
    if (paid.getUTCFullYear() !== options.taxYear) throw new Error("Form1099Q expense year must match distribution year");
    actualBoolean(expense.qualificationConfirmed, "expense qualification");
    for (const item of linked) {
      const eligible = eligibleExpenseAmount(expense, options.taxYear, item.form.accountType);
      if (expense.category === "qtp_contribution") {
        const transfer = item.form.transfer;
        if (item.form.accountType !== "coverdell_esa" || transfer?.kind !== "qtp" || !expense.destinationAccountId || transfer.destinationAccountId !== expense.destinationAccountId || transfer.receivedDate !== expense.paidDate || !actualAmount(transfer.amount, "QTP contribution source amount").eq(amount)) throw new Error("Form1099Q QTP contribution expense must match its actual transfer source");
        if (transfer.sameBeneficiary !== true) { item.allowed = ZERO; continue; }
      }
      // The actual allocation group shares the qualified category capacity.
      // Other paid spending not assigned to a distribution cannot dilute it.
      item.allowed = requested.isZero() ? ZERO : item.amount.mul(Decimal.min(1, eligible.div(requested)));
      if (!expandedExpenseAllowed(item.form, expense, options.taxYear)) item.allowed = ZERO;
    }
  }
  for (const beneficiary of beneficiaries.values()) {
    const outside = actualAmount(beneficiary.outsideK12QualifiedDistributions, "outside-plan qualified K12 distributions");
    const group = allocations.filter(item => item.form.beneficiaryId === beneficiary.id && item.form.accountType === "529" && item.expense.category.startsWith("k12_"));
    const requested = sum(...group.map(item => item.allowed));
    const remaining = zeroFloor(d(options.taxYear === 2026 ? "20000" : "10000").minus(outside));
    if (requested.gt(remaining)) for (const item of group) item.allowed = item.allowed.mul(remaining).div(requested);
    audit.record("Form1099-Q", `${beneficiary.id}:k12-qualified`, "Qualified K12 distributions after annual beneficiary limit", sum(...group.map(item => item.allowed)), "Apply annual cap across all beneficiary QTPs to elected allocations", { "Outside-plan qualified distributions": outside, "Remaining annual cap": remaining });
  }
  for (const item of allocations.filter(entry => entry.expense.category === "student_loan")) if (!item.expense.borrowerId || !borrowers.has(item.expense.borrowerId)) throw new Error("Form1099Q actual student-loan borrower history required");
  for (const borrower of borrowers.values()) {
    const remaining = zeroFloor(d(10000).minus(actualAmount(borrower.priorQualifiedDistributions, "prior borrower qualified distributions")).minus(actualAmount(borrower.otherCurrentQualifiedDistributions, "other current borrower qualified distributions")));
    const group = allocations.filter(item => item.expense.category === "student_loan" && item.expense.borrowerId === borrower.id);
    const requested = sum(...group.map(item => item.allowed));
    if (requested.gt(remaining)) for (const item of group) item.allowed = item.allowed.mul(remaining).div(requested);
    audit.record("Form1099-Q", `${borrower.id}:loan-qualified`, "Qualified loan repayments after lifetime borrower limit", sum(...group.map(item => item.allowed)), "10000 lifetime limit less actual prior and other current qualified distributions", { "Remaining limit": remaining });
  }
  for (const item of allocations.filter(item => item.form.distributionMedium === "in_kind_prepaid_tuition")) {
    const expense = item.expense;
    if (expense.qualificationConfirmed && !item.allowed.eq(item.amount)) {
      assertDistinctEducationBeneficiaries(verifiedForms, facts);
      // Spec: form-1099-q-in-kind-room-board.yaml. No shared-cap election is
      // inferred for other distributions, expenses, credits or assistance.
      const singleRoomBoardSource = expense.category === "postsecondary_room_board"
        && verifiedForms.filter(form => form.beneficiaryId === item.form.beneficiaryId).length === 1
        && [...expenses.values()].filter(source => source.beneficiaryId === expense.beneficiaryId).length === 1
        && allocations.filter(source => source.form.beneficiaryId === expense.beneficiaryId).length === 1
        && [expense.refundedAmount, expense.taxFreeAssistance, expense.educationCreditAmount, expense.otherTaxBenefitAmount]
          .every(value => actualAmount(value, "room-and-board source reduction").isZero());
      if (!singleRoomBoardSource) throw new Error("Form1099Q partial in-kind exclusion after category limits requires a separate supported allocation method");
    }
    if (expense.qualificationConfirmed && expense.category === "postsecondary_room_board") {
      audit.record("Form1099-Q", `${item.form.sourceId}:in-kind-room-board:${expense.id}`, "Qualified in-kind room-and-board expense after school limit", item.allowed,
        "Actual half-time enrollment and greater of school allowance or school-owned housing charge; preserve original benefit cost", {
          "Actual expense": actualAmount(expense.amount, "room-and-board expense"),
          "Half-time enrollment": actualBoolean(expense.halfTimeStudent, "half-time enrollment") ? "yes" : "no",
          "School allowance": actualAmount(expense.roomBoardAllowance, "school allowance"),
          "School-owned housing charge": actualAmount(expense.schoolOwnedHousingCharge, "school-owned housing charge"),
          "Refund": actualAmount(expense.refundedAmount, "refund"),
          "Tax-free assistance": actualAmount(expense.taxFreeAssistance, "assistance"),
          "Education credit expense": actualAmount(expense.educationCreditAmount, "credit expense"),
          "Other tax benefit": actualAmount(expense.otherTaxBenefitAmount, "other benefit"),
          "Original allocation": item.amount,
        });
    }
  }
  const transferState: TransferState = { capacities: new Map(), baselines: new Map(), rolloverDates: new Map() };
  const transfers = new Map<string, Decimal>();
  for (const form of [...verifiedForms].sort((a, b) => (a.distributionDate ?? "").localeCompare(b.distributionDate ?? ""))) transfers.set(form.sourceId, isReturnedContribution(form) || disqualifiedBySource.has(form.sourceId) ? ZERO : validTransfer(form, actualAmount(form.grossDistribution, "Box1"), options.taxYear, audit, transferState));
  const derived = new Map<string, { earnings: Decimal; basis: Decimal; taxFree: Decimal; transferTaxFree: Decimal; creditException: Decimal; creditGross: Decimal; allocated: Decimal }>();
  const accountResults: Form1099QResult["coverdellAccounts"] = [];
  const ordinaryForms = verifiedForms.filter(item => !isReturnedContribution(item) && !disqualifiedBySource.has(item.sourceId));
  const esaAccounts = new Set(ordinaryForms.filter(item => item.accountType === "coverdell_esa").map(item => item.accountId));
  for (const accountId of esaAccounts) {
    const group = ordinaryForms.filter(item => item.accountType === "coverdell_esa" && item.accountId === accountId);
    const first = group[0];
    if (!first) continue;
    if (group.some(item => item.beneficiaryId !== first.beneficiaryId)) throw new Error("Form1099Q Coverdell account beneficiary must reconcile");
    const history = coverdellFacts.get(accountId);
    if (!history) throw new Error("Form1099Q actual Coverdell account basis and year-end history required");
    const sourcePreviousBasis = actualAmount(history.priorYearBasis, "Coverdell prior basis");
    const sourceContributions = actualAmount(history.currentYearContributions, "Coverdell current contributions");
    const sourceIncomingBasis = actualAmount(history.rolloverBasisReceived, "Coverdell incoming rollover basis");
    const rolloverBases = group.map(item => {
      const transferred = transfers.get(item.sourceId) ?? ZERO;
      if (transferred.isZero()) return ZERO;
      const basis = actualAmount(item.transfer?.coverdellTransferredBasis, "Coverdell actual transferred basis");
      if (basis.gt(transferred)) throw new Error("Form1099Q Coverdell transferred basis exceeds rollover amount");
      return basis;
    });
    const sourceOutgoingBasis = sum(...rolloverBases);
    if (sourcePreviousBasis.plus(sourceContributions).plus(sourceIncomingBasis).lt(sourceOutgoingBasis)) throw new Error("Form1099Q Coverdell outgoing rollover basis exceeds actual available basis");
    const previousBasis = roundDollar(sourcePreviousBasis), contributions = roundDollar(sourceContributions);
    const incomingBasis = roundDollar(sourceIncomingBasis), outgoingBasis = roundDollar(sourceOutgoingBasis);
    const basis = previousBasis.plus(contributions).plus(incomingBasis).minus(outgoingBasis);
    if (basis.lt(0)) throw new Error("Form1099Q Coverdell rounded source basis does not reconcile; retain actual amounts for separate source reconciliation");
    const grossAmounts = group.map(item => actualAmount(item.grossDistribution, "Coverdell Box1").minus(transfers.get(item.sourceId) ?? ZERO));
    const sourceGross = sum(...grossAmounts);
    const sourceYearEndValue = actualAmount(history.yearEndValue, "Coverdell year-end value");
    const sourceOutstandingRollovers = actualAmount(history.outstandingRollovers, "Coverdell outstanding rollovers");
    const gross = roundDollar(sourceGross);
    const value = roundDollar(sourceYearEndValue.plus(sourceOutstandingRollovers));
    const allBeneficiaryForms = ordinaryForms.filter(item => item.accountType === "coverdell_esa" && item.beneficiaryId === first.beneficiaryId);
    const allGross = roundDollar(sum(...allBeneficiaryForms.map(item => actualAmount(item.grossDistribution, "Coverdell distribution").minus(transfers.get(item.sourceId) ?? ZERO))));
    const allAllocations = allocations.filter(item => item.form.accountType === "coverdell_esa" && item.form.beneficiaryId === first.beneficiaryId);
    const allAQEE = roundDollar(sum(...allAllocations.map(item => item.allowed)));
    const allCredit = roundDollar(sum(...allAllocations.map(item => item.credit)));
    const ratio = allGross.isZero() ? ZERO : Decimal.min(1, allAQEE.div(allGross));
    const beforeCreditRatio = allGross.isZero() ? ZERO : Decimal.min(1, allAQEE.plus(allCredit).div(allGross));
    const accountAQEE = roundDollar(gross.mul(ratio));
    const accountBeforeCredit = roundDollar(gross.mul(beforeCreditRatio));
    const denominator = gross.plus(value);
    const basisRatio = denominator.isZero() ? ZERO : Decimal.min(1, basis.div(denominator));
    const distributedBasis = roundDollar(gross.mul(basisRatio));
    const earnings = gross.minus(distributedBasis);
    const exemptRatio = gross.isZero() ? ZERO : Decimal.min(1, accountAQEE.div(gross));
    const taxFree = roundDollar(earnings.mul(exemptRatio));
    const taxFreeBeforeCredit = roundDollar(gross.isZero() ? ZERO : earnings.mul(Decimal.min(1, accountBeforeCredit.div(gross))));
    const creditException = taxFreeBeforeCredit.minus(taxFree);
    const basisParts = proportionalDollars(distributedBasis, grossAmounts);
    const earningsParts = proportionalDollars(earnings, grossAmounts);
    const taxFreeParts = proportionalDollars(taxFree, earningsParts);
    const creditParts = proportionalDollars(creditException, earningsParts.map((amount, index) => amount.minus(taxFreeParts[index] ?? ZERO)));
    const allocatedParts = proportionalDollars(accountAQEE, grossAmounts);
    const creditGrossParts = proportionalDollars(accountBeforeCredit.minus(accountAQEE), grossAmounts);
    const transferredBasisParts = proportionalDollars(outgoingBasis, rolloverBases);
    const transferredAmounts = group.map(item => transfers.get(item.sourceId) ?? ZERO);
    const transferredEarningsParts = proportionalDollars(roundDollar(sum(...transferredAmounts)).minus(outgoingBasis), transferredAmounts.map((amount, index) => amount.minus(rolloverBases[index] ?? ZERO)));
    group.forEach((item, index) => {
      const transferredBasis = transferredBasisParts[index] ?? ZERO;
      const transferredEarnings = transferredEarningsParts[index] ?? ZERO;
      derived.set(item.sourceId, { basis: (basisParts[index] ?? ZERO).plus(transferredBasis), earnings: (earningsParts[index] ?? ZERO).plus(transferredEarnings),
        taxFree: (taxFreeParts[index] ?? ZERO).plus(transferredEarnings), transferTaxFree: transferredEarnings,
        creditException: creditParts[index] ?? ZERO, allocated: allocatedParts[index] ?? ZERO, creditGross: creditGrossParts[index] ?? ZERO });
    });
    const auditForm = sourceIncomingBasis.gt(0) || sourceOutgoingBasis.gt(0) ? "Coverdell rollover worksheet" : "Pub970 WS6-3";
    accountResults.push({ accountId, beneficiaryId: first.beneficiaryId, auditForm, distributedBasis, earnings, endingBasis: basis.minus(distributedBasis) });
    for (const [line, description, amount] of [["prior-basis", "Exact prior-year basis source", sourcePreviousBasis], ["current-contributions", "Exact current contributions source", sourceContributions], ["rollover-basis-in", "Exact incoming rollover basis source", sourceIncomingBasis], ["rollover-basis-out", "Exact outgoing rollover basis source", sourceOutgoingBasis], ["gross-distributions", "Exact nonrollover distribution sources", sourceGross], ["year-end-value", "Exact year-end account value source", sourceYearEndValue], ["outstanding-rollovers", "Exact outstanding rollover source", sourceOutstandingRollovers]] as const) audit.record("Coverdell source", `${accountId}:${line}`, description, amount, "Actual source amount before consistent whole-dollar worksheet rounding");
    for (const [line, description, amount] of [["rollover-basis-in", "Rounded rollover basis received", incomingBasis], ["rollover-basis-out", "Rounded rollover basis transferred", outgoingBasis], ["F", "Beneficiary Coverdell AQEE after actual QTP coordination", allAQEE], ["G", "Beneficiary Coverdell distributions excluding rollovers", allGross], ["H", "Beneficiary qualified expense ratio", ratio],
      ["1", "Coverdell current contributions", contributions], ["2", "Coverdell actual previous year basis", previousBasis], ["3", auditForm === "Pub970 WS6-3" ? "Coverdell basis plus contributions" : "Available basis after current contributions and actual rollover adjustments", basis], ["4", "Coverdell account distributions", gross],
      ["5", "Account allocated qualified expenses", accountAQEE], ["6", "Account distributions exceeding qualified expenses", zeroFloor(gross.minus(accountAQEE))], ["7", "Coverdell year-end value and outstanding rollovers", value],
      ["8", "Account distributions plus year-end value", denominator], ["9", "Account basis ratio", basisRatio], ["10", "Coverdell distributed basis", distributedBasis], ["11", "Coverdell distributed earnings", earnings],
      ["12", "Account qualified expense ratio", exemptRatio], ["13", "Account tax-free earnings", taxFree], ["14", "Account taxable earnings", earnings.minus(taxFree)], ["15", "Coverdell ending basis", basis.minus(distributedBasis)]] as const) audit.record(auditForm, `${accountId}:${line}`, description, amount, auditForm === "Pub970 WS6-3" ? "Actual account history and beneficiary Worksheet6-3 expense ratio; computed once per account" : "Separate rollover reconciliation: line3=line1+line2+incoming basis-outgoing basis; other account ratios follow Worksheet6-3");
  }
  if (accountResults.length) audit.record(accountResults.some(row => row.auditForm === "Coverdell rollover worksheet") ? "Coverdell rollover worksheet" : "Pub970 WS6-3", "16", "Total taxable Coverdell earnings", sum(...[...derived.values()].map(item => item.earnings.minus(item.taxFree))), "Sum each account line14 once; preserve statement split totals");
  const perDistribution: EducationDistributionResult[] = verifiedForms.map(form => {
    const gross = actualAmount(form.grossDistribution, "Box1");
    const disqualified = disqualifiedBySource.get(form.sourceId);
    if (disqualified) {
      const taxable = roundDollar(disqualified.earnings);
      audit.record("Coverdell disqualification", `${form.sourceId}:deemed-distribution`, "Actual January1 whole-account deemed distribution", gross,
        "IRC530(e),408(e)(2) and Reg1.408-4(d)(1): January1 account value", { "Deemed distribution date": `${options.taxYear}-01-01`, "Actual transaction date": form.prohibitedTransactionDate ?? "" });
      for (const [line, description, value] of [["basis", "Actual January1 investment recovered", disqualified.basis], ["earnings", "Exact deemed-distribution earnings", disqualified.earnings], ["taxable-earnings", "Whole-dollar earnings included in income", taxable], ["qualified-expenses", "Actual total qualified education expenses including QTP contributions", ZERO]] as const) audit.record("Coverdell disqualification", `${form.sourceId}:${line}`, description, value, "Actual whole-account value less basis; zero qualified expenses and no subsequent income/gain/loss source facts verified");
      return recordSourceDistribution({ sourceId: form.sourceId, accountId: form.accountId, accountType: form.accountType, distributionMedium: form.distributionMedium, beneficiaryId: form.beneficiaryId,
        recipientOwner: form.recipientOwner, recipientId: form.recipientOwner === "other" ? (form.recipientId ?? "") : form.recipientOwner, sourceTaxYear: options.taxYear, incomeTaxYear: options.taxYear, treatment: "account_disqualification",
        grossDistribution: gross, earnings: disqualified.earnings, basis: disqualified.basis, validTransfers: ZERO, adjustedQEE: ZERO,
        taxableEarnings: taxable, taxFreeEarnings: ZERO, educationExpenseExcludedEarnings: ZERO, transferExcludedEarnings: ZERO, creditException: ZERO, penaltyException: ZERO }, audit);
    }
    const correction = returnedBySource.get(form.sourceId);
    if (correction) {
      if (exceptions.some(item => item.sourceId === form.sourceId)) throw new Error("Form1099Q returned contribution already has its statutory exception and cannot reuse another exception source");
      const taxable = correction.incomeTaxYear === options.taxYear ? correction.taxableEarnings : ZERO;
      return recordSourceDistribution({ sourceId: form.sourceId, accountId: form.accountId, accountType: form.accountType, distributionMedium: form.distributionMedium, beneficiaryId: form.beneficiaryId,
        recipientOwner: form.recipientOwner, recipientId: correction.recipientId, sourceTaxYear: correction.sourceTaxYear, incomeTaxYear: correction.incomeTaxYear, treatment: "returned_contribution",
        grossDistribution: gross, earnings: correction.netIncome, basis: correction.returnedPrincipal, validTransfers: ZERO, adjustedQEE: ZERO,
        taxableEarnings: taxable, taxFreeEarnings: ZERO, educationExpenseExcludedEarnings: ZERO, transferExcludedEarnings: ZERO, creditException: ZERO, penaltyException: taxable }, audit);
    }
    const derivedAmounts = derived.get(form.sourceId);
    const earnings = derivedAmounts?.earnings ?? actualAmount(form.earnings, "Box2 earnings", true);
    const basis = derivedAmounts?.basis ?? actualAmount(form.basis, "Box3 basis");
    if ((form.earnings === undefined) !== (form.basis === undefined)) throw new Error("Form1099Q reported earnings and basis must be jointly reconciled");
    if (form.earnings !== undefined && form.basis !== undefined && !gross.eq(actualAmount(form.earnings, "Box2", true).plus(actualAmount(form.basis, "Box3")))) throw new Error("Form1099Q Box1 must equal Box2 plus Box3");
    if (derivedAmounts && form.earnings !== undefined && (!roundDollar(d(form.earnings)).eq(earnings) || !roundDollar(d(form.basis)).eq(basis))) throw new Error("Form1099Q reported Coverdell earnings/basis do not reconcile to actual account worksheet");
    if (earnings.lt(0) && form.finalDistribution !== true) throw new Error("Form1099Q negative Box2 requires actual final-distribution confirmation");
    const transfer = transfers.get(form.sourceId) ?? ZERO;
    const allocated = derivedAmounts?.allocated ?? sum(...allocations.filter(item => item.form.sourceId === form.sourceId).map(item => item.allowed));
    const positiveEarnings = roundDollar(zeroFloor(earnings));
    const exemptGross = Decimal.min(gross, transfer.plus(allocated));
    const taxFree = derivedAmounts?.taxFree ?? (gross.isZero() ? ZERO : roundDollar(positiveEarnings.mul(exemptGross).div(gross)));
    const taxable = positiveEarnings.minus(taxFree);
    const creditAmount = derivedAmounts?.creditGross ?? sum(...allocations.filter(item => item.form.sourceId === form.sourceId).map(item => item.credit));
    const taxFreeBeforeCredit = gross.isZero() ? ZERO : roundDollar(positiveEarnings.mul(Decimal.min(gross, exemptGross.plus(creditAmount))).div(gross));
    const creditException = derivedAmounts?.creditException ?? taxFreeBeforeCredit.minus(taxFree);
    const transferExcludedEarnings = derivedAmounts?.transferTaxFree ?? (gross.isZero() ? ZERO : Decimal.min(taxFree, roundDollar(positiveEarnings.mul(transfer).div(gross))));
    const educationExpenseExcludedEarnings = taxFree.minus(transferExcludedEarnings);
    let exceptionGross = ZERO;
    for (const exception of exceptions.filter(item => item.sourceId === form.sourceId)) {
      const requested = actualAmount(exception.distributionAmount, "exception distribution amount");
      const qualifying = actualAmount(exception.qualifyingAmount, "exception qualifying amount");
      if (requested.gt(qualifying)) throw new Error("Form1099Q exception distribution exceeds its actual qualifying source amount");
      if (!actualBoolean(exception.eligibilityConfirmed, "additional-tax exception eligibility")) continue;
      if (exception.kind === "death") {
        const event = actualDate(exception.eventDate, "beneficiary death");
        const recipientEligible = actualBoolean(exception.paidToBeneficiaryOrEstate, "death distribution paid to beneficiary or estate");
        if (!recipientEligible || event > actualDate(form.distributionDate, "death-exception distribution")) continue;
      }
      exceptionGross = exceptionGross.plus(requested);
    }
    const nonqualifiedGross = zeroFloor(gross.minus(exemptGross));
    if (exceptionGross.gt(nonqualifiedGross)) throw new Error("Form1099Q exception allocations exceed nonqualified gross distribution");
    if (exceptionGross.gt(0) && creditException.gt(0)) {
      if (facts.exceptionsDistinctFromCreditConfirmed !== true || exceptionGross.plus(Decimal.min(nonqualifiedGross, creditAmount)).gt(nonqualifiedGross)) throw new Error("Form1099Q actual exception distributions must be distinct from the credit-only allocation");
    }
    const ordinaryGross = gross.minus(transfer);
    const exceptionEarnings = ordinaryGross.isZero() ? ZERO : roundDollar(positiveEarnings.minus(transferExcludedEarnings).mul(exceptionGross).div(ordinaryGross));
    const penaltyException = Decimal.min(taxable, creditException.plus(exceptionEarnings));
    return recordSourceDistribution({ sourceId: form.sourceId, accountId: form.accountId, accountType: form.accountType, distributionMedium: form.distributionMedium, beneficiaryId: form.beneficiaryId, recipientOwner: form.recipientOwner, recipientId: form.recipientOwner === "other" ? (form.recipientId ?? "") : form.recipientOwner, sourceTaxYear: options.taxYear, incomeTaxYear: options.taxYear, treatment: "ordinary", grossDistribution: gross, earnings, basis, validTransfers: transfer, adjustedQEE: allocated, taxableEarnings: taxable, taxFreeEarnings: taxFree, educationExpenseExcludedEarnings, transferExcludedEarnings, creditException, penaltyException }, audit);
  });
  for (const exception of exceptions) if (!sources.has(exception.sourceId)) throw new Error("Form1099Q exception references missing distribution source");
  const loanInterestSourceAdjustments: Form1099QResult["loanInterestSourceAdjustments"] = [...expenses.values()].filter(item => item.category === "student_loan").map(expense => {
    const borrower = borrowers.get(expense.borrowerId ?? "");
    if (!borrower?.owner) throw new Error("Form1099Q actual student-loan borrower ownership is required");
    const interestPaid = actualAmount(expense.studentLoanInterestAmount, "expense interest paid");
    const interestClaimedElsewhere = actualAmount(expense.studentLoanInterestDeducted, "expense interest claimed for deduction before phase-out");
    const taxFreeEarningsUsedForInterest = sum(...allocations.filter(item => item.expense.id === expense.id && item.loanInterest.gt(0)).map(item => {
      const distribution = perDistribution.find(row => row.sourceId === item.form.sourceId);
      if (!distribution || item.amount.isZero() || distribution.grossDistribution.isZero() || distribution.adjustedQEE.isZero()) return ZERO;
      const sourceShare = item.loanInterest.mul(item.allowed).div(item.amount);
      const fundingShare = Decimal.min(1, zeroFloor(distribution.grossDistribution.minus(distribution.validTransfers)).div(distribution.adjustedQEE));
      return zeroFloor(distribution.earnings).mul(sourceShare).mul(fundingShare).div(distribution.grossDistribution);
    }));
    if (interestClaimedElsewhere.plus(taxFreeEarningsUsedForInterest).gt(interestPaid)) throw new Error("Form1099Q loan interest claimed for deduction includes tax-free QTP earnings");
    audit.record("Form1099-Q", `loan-expense:${expense.id}:loan-interest-reduction`, "Tax-free QTP earnings used for this loan expense's interest", taxFreeEarningsUsedForInterest, "Actual interest allocation times source earnings ratio, after loan and distribution limits", { "Actual interest paid": interestPaid, "Interest claimed before deduction phase-out": interestClaimedElsewhere });
    return { expenseId: expense.id, borrowerId: borrower.id, owner: borrower.owner, interestPaid, taxFreeEarningsUsedForInterest, interestClaimedElsewhere };
  });
  const loanInterestAdjustments: Form1099QResult["loanInterestAdjustments"] = [...borrowers.values()].map(borrower => {
    if (!borrower.owner) throw new Error("Form1099Q actual student-loan borrower ownership is required");
    const rows = loanInterestSourceAdjustments.filter(item => item.borrowerId === borrower.id);
    const interestPaid = sum(...rows.map(item => item.interestPaid));
    const interestClaimedElsewhere = sum(...rows.map(item => item.interestClaimedElsewhere));
    const taxFreeEarningsUsedForInterest = sum(...rows.map(item => item.taxFreeEarningsUsedForInterest));
    audit.record("Form1099-Q", `${borrower.id}:loan-interest-reduction`, "Tax-free QTP earnings used for borrower loan interest", taxFreeEarningsUsedForInterest, "Sum actual linked expense amounts", { "Actual interest paid": interestPaid, "Interest claimed before deduction phase-out": interestClaimedElsewhere });
    return { borrowerId: borrower.id, owner: borrower.owner, interestPaid, taxFreeEarningsUsedForInterest, interestClaimedElsewhere };
  });
  const recipientKeys = [...new Set(perDistribution.map(item => `${item.recipientOwner}:${item.recipientId}`))];
  const perRecipient: EducationRecipientResult[] = recipientKeys.map(key => {
    const rows = perDistribution.filter(item => `${item.recipientOwner}:${item.recipientId}` === key);
    const first = rows[0];
    if (!first) throw new Error("Form1099Q recipient source could not be resolved");
    const owner = first.recipientOwner, recipientId = first.recipientId;
    const taxableEarnings = sum(...rows.map(item => item.taxableEarnings));
    const penaltyException = sum(...rows.map(item => item.penaltyException));
    const additionalTax = roundDollar(zeroFloor(taxableEarnings.minus(penaltyException)).mul(PENALTY_RATE));
    for (const [line, description, amount] of [["5", "Education distributions included in recipient income", taxableEarnings], ["6", "Education distribution exceptions", penaltyException], ["7", "Education distributions subject to additional tax", zeroFloor(taxableEarnings.minus(penaltyException))], ["8", "Additional tax on education distributions", additionalTax]] as const) audit.record("Form5329 education", `${key}:${line}`, description, amount, "Actual recipient's Form5329 PartII");
    return { owner, recipientId, taxableEarnings, penaltyException, additionalTax };
  });
  const creditAllocations = [...beneficiaries.values()].map(beneficiary => ({ beneficiaryId: beneficiary.id,
    amount: sum(...[...expenses.values()].filter(item => item.beneficiaryId === beneficiary.id).map(item => d(item.educationCreditAmount))),
    taxableEarningsCausedByCredit: sum(...perDistribution.filter(item => item.beneficiaryId === beneficiary.id).map(item => item.creditException)),
  })).filter(item => item.amount.gt(0));
  if (options.educationExpenses) {
    for (const allocation of creditAllocations) {
      const identity = beneficiaries.get(allocation.beneficiaryId)?.studentTaxId?.replaceAll("-", "");
      const aoc = options.educationExpenses.aocStudents.filter(item => identity && item.studentTaxId?.replaceAll("-", "") === identity);
      const llc = (options.educationExpenses.llcStudents ?? []).filter(item => identity && item.studentTaxId?.replaceAll("-", "") === identity);
      if (aoc.length + llc.length !== 1) throw new Error("Form1099Q credit allocation must link to one actual education-credit student");
      const limit = aoc[0] ? Decimal.min(4000, actualAmount(aoc[0].qualifiedExpenses, "linked AOC student expenses")) : Decimal.min(10000, actualAmount(llc[0]?.qualifiedExpenses, "linked LLC student expenses"));
      if (allocation.amount.gt(limit)) throw new Error("Form1099Q credit allocation exceeds actual linked student credit expenses");
    }
    const llcIds = new Set((options.educationExpenses.llcStudents ?? []).map(item => item.studentTaxId?.replaceAll("-", "")));
    const llcAllocated = sum(...creditAllocations.filter(item => llcIds.has(beneficiaries.get(item.beneficiaryId)?.studentTaxId?.replaceAll("-", ""))).map(item => item.amount));
    if (llcAllocated.gt(10000)) throw new Error("Form1099Q linked LLC allocations exceed the return's10000 expense limit");
  }
  const own = perRecipient.filter(item => item.owner !== "other");
  const grossDistribution = sum(...perDistribution.map(item => item.grossDistribution));
  const totalEarnings = sum(...perDistribution.map(item => item.earnings));
  const totalBasis = sum(...perDistribution.map(item => item.basis));
  const trusteeToTrusteeTransfers = sum(...perDistribution.map(item => item.validTransfers));
  const adjustedQEE = sum(...perDistribution.map(item => item.adjustedQEE));
  const taxableEarnings = sum(...own.map(item => item.taxableEarnings));
  const penaltyExceptionAmount = sum(...own.map(item => item.penaltyException));
  const netPenalty = sum(...own.map(item => item.additionalTax));
  const taxFreeEarnings = sum(...perDistribution.map(item => item.taxFreeEarnings));
  const grossPenalty = roundDollar(taxableEarnings.mul(PENALTY_RATE));
  for (const [line, description, amount] of [["gross-distribution", "All source gross distributions", grossDistribution], ["total-earnings", "All source earnings", totalEarnings], ["total-basis", "All source basis", totalBasis], ["adjusted-qee", "Actual allocated adjusted expenses", adjustedQEE], ["taxable-earnings", "Education earnings taxable on this return", taxableEarnings], ["tax-free-earnings", "Qualified distribution earnings", taxFreeEarnings], ["penalty-amount", "Gross additional tax before exceptions", grossPenalty], ["penalty-exception-amount", "Own-return taxable earnings excepted from additional tax", penaltyExceptionAmount], ["net-penalty", "Own-return additional tax after exceptions", netPenalty]] as const) audit.record("Form1099-Q", line, description, amount, "Sum separately calculated source/recipient results; other recipients excluded from return income and tax");
  return { sourceFactsVerified: true, taxYear: options.taxYear, perDistribution, perRecipient, returnedContributions, coverdellAccounts: accountResults, creditAllocations, loanInterestSourceAdjustments, loanInterestAdjustments,
    grossDistribution, totalEarnings, totalBasis, trusteeToTrusteeTransfers, taxableGrossDistribution: grossDistribution.minus(trusteeToTrusteeTransfers),
    taxableDistributionEarnings: sum(...perDistribution.map(item => item.earnings.minus(item.transferExcludedEarnings))), adjustedQEE, taxableEarnings, taxFreeEarnings, grossPenalty, penaltyExceptionAmount, netPenalty, lines: audit.getLines() };
}
