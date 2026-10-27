/** Pub970 chapter4 and Schedule1 line21. Spec: student-loan-interest-sources.yaml. */
import Decimal from "decimal.js";
import type { Form1098E, StudentLoanInterestFacts, TaxYearInput } from "@/models/inputs.js";
import type { Form1099QResult } from "./form-1099-q.js";
import { getConstants } from "@/models/constants.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { AuditTrail } from "@/utils/audit.js";
import { roundEducationSourceAmounts } from "@/utils/annual-cash-qtp.js";

export interface StudentLoanInterestOptions {
  taxYear: number;
  filingStatus: TaxYearInput["taxpayer"]["filingStatus"];
  /** Complete return MAGI before this deduction, including actual foreign/possession addbacks. */
  modifiedAgi?: Decimal;
  facts: StudentLoanInterestFacts;
  forms?: Form1098E[];
  educationLoanInterest?: Form1099QResult["loanInterestSourceAdjustments"];
  /** Historical additional interest not on a Form1098E; positive values must reconcile. */
  legacyAdditionalInterest?: string;
}

function actualBoolean(value: boolean | undefined, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Student loan source requires actual ${name}.`);
  return value;
}
function text(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`Student loan source requires actual ${name}.`);
  return value.trim();
}
function actualDate(value: string | undefined): string {
  const date = text(value, "loan origination date");
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("Student loan source requires an actual loan origination date.");
  return date;
}

export function calculateStudentLoanInterestDeduction(options: StudentLoanInterestOptions) {
  const { facts, taxYear, filingStatus, modifiedAgi } = options;
  // Source-dependent local precision preserves every original digit. Exact
  // ratios below carry repeating annual exclusions through final rounding.
  const numbers: Decimal[] = [];
  const scan = (value: unknown): void => {
    if (Decimal.isDecimal(value)) numbers.push(value);
    else if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) numbers.push(new Decimal(value));
    else if (value && typeof value === "object") Object.values(value).forEach(scan);
  };
  scan(options);
  const D = Decimal.clone({ precision: Math.max(80, numbers.filter(value => value.isFinite()).reduce((total, value) => total + value.precision(true) + value.decimalPlaces(), 0) * 4 + 32) });
  const amount = (value: string | undefined, name: string): Decimal => {
    if (value === undefined || !/^-?\d+(\.\d+)?$/.test(value) || !new D(value).isFinite() || new D(value).lt(0)) throw new Error(`Student loan source requires actual nonnegative ${name}; unknown is not zero.`);
    return new D(value);
  };
  type Ratio = { numerator: Decimal; denominator: Decimal };
  const addRatio = (left: Ratio, right: Ratio): Ratio => ({
    numerator: new D(left.numerator).times(right.denominator).plus(new D(right.numerator).times(left.denominator)),
    denominator: new D(left.denominator).times(right.denominator),
  });
  const ratio = (numerator: Decimal, denominator: Decimal = new D(1)): Ratio => ({ numerator: new D(numerator), denominator: new D(denominator) });
  const educationRatio = (entry: NonNullable<StudentLoanInterestOptions["educationLoanInterest"]>[number]): Ratio => {
    const exact = entry.annualInterestOnlyReporting;
    if (!exact) return ratio(entry.taxFreeEarningsUsedForInterest);
    if (!exact.numerator.isFinite() || exact.numerator.lt(0) || !exact.denominator.isFinite() || exact.denominator.lte(0)
      || !new D(exact.numerator).div(exact.denominator).toSignificantDigits(entry.taxFreeEarningsUsedForInterest.precision()).eq(entry.taxFreeEarningsUsedForInterest))
      throw new Error("Invalid calculated annual interest-only ratio.");
    return ratio(exact.numerator, exact.denominator);
  };
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error("Student loan source worksheet supports tax years2025 and2026.");
  if (modifiedAgi !== undefined && !modifiedAgi.isFinite()) throw new Error("Actual complete student-loan modified AGI is required.");
  if (facts.sourceTaxYear !== taxYear) throw new Error("Student loan source year must match the return.");
  if (facts.sourceFactsConfirmed !== true) throw new Error("Student loan source facts need confirmation after the last edit.");
  if (!facts.loans) throw new Error("Student loan source requires actual loan records, including an empty list for none.");
  const primaryClaimed = actualBoolean(facts.primaryClaimedAsDependent, "primary claimed dependency");
  const spouseClaimed = filingStatus === "married_filing_jointly" ? actualBoolean(facts.spouseClaimedAsDependent, "spouse claimed dependency") : false;
  const possessionIncomeAddback = amount(facts.puertoRicoIncomeExclusion, "Puerto Rico excluded income").plus(amount(facts.americanSamoaIncomeExclusion, "American Samoa excluded income"));
  const returnEligible = filingStatus !== "married_filing_separately" && !primaryClaimed && !spouseClaimed;
  const forms = new Map<string, Form1098E>();
  for (const form of options.forms ?? []) {
    const id = text(form.sourceId, "Form1098E source ID");
    if (forms.has(id)) throw new Error("Duplicate Form1098E source ID.");
    if (form.taxYear !== taxYear || !form.accountHolder || !form.borrowerId?.trim()) throw new Error("Actual Form1098E year and borrower owner are required.");
    actualBoolean(form.box2ExcludesOriginationFeesOrCapitalizedInterest, "Form1098E Box2 status");
    amount(form.studentLoanInterestReceived, "Form1098E Box1");
    forms.set(id, form);
  }
  const education = new Map<string, Form1099QResult["loanInterestSourceAdjustments"][number]>();
  for (const entry of options.educationLoanInterest ?? []) {
    if (education.has(entry.expenseId)) throw new Error("Duplicate education interest expense source.");
    for (const value of [entry.interestPaid, entry.taxFreeEarningsUsedForInterest, entry.interestClaimedElsewhere]) if (!value.isFinite() || value.lt(0)) throw new Error("Invalid calculated education interest source amount.");
    const exact = educationRatio(entry);
    if (exact.numerator.plus(exact.denominator.times(entry.interestClaimedElsewhere)).gt(exact.denominator.times(entry.interestPaid))) throw new Error("Education interest claim includes tax-free earnings.");
    education.set(entry.expenseId, entry);
  }
  const sourceIds = new Set<string>();
  const linkedEducation = new Set<string>();
  const borrowerOwners = new Map<string, string>();
  const formAmounts = new Map<string, Decimal>();
  const audit = new AuditTrail();
  let additionalInterestTotal = new D(0);
  const sources = facts.loans.map(loan => {
    const sourceId = text(loan.sourceId, "loan source ID");
    if (sourceIds.has(sourceId)) throw new Error("Duplicate student loan source ID.");
    sourceIds.add(sourceId);
    const borrowerId = text(loan.borrowerId, "borrower ID");
    const owner = loan.accountHolder;
    if (!owner) throw new Error("Actual student loan account owner is required.");
    if (owner === "spouse" && filingStatus !== "married_filing_jointly") throw new Error("Spouse student loan sources require a joint return.");
    if (borrowerOwners.has(borrowerId) && borrowerOwners.get(borrowerId) !== owner) throw new Error("Student loan borrower has contradictory owners.");
    borrowerOwners.set(borrowerId, owner);
    const lender = text(loan.lender, "lender");
    if (!loan.sourceKind) throw new Error("Actual student loan source kind is required.");
    const originated = actualDate(loan.loanOriginationDate);
    if (originated > `${taxYear}-12-31`) throw new Error("Student loan origination is after the actual payment tax year.");
    if (loan.paymentsInTaxYearConfirmed !== true) throw new Error("Confirm interest was actually paid in the selected tax year.");
    const paid = amount(loan.interestPaid, "paid interest");
    const additional = amount(loan.additionalInterestPaid, "additional interest");
    if (additional.gt(0) && (!loan.additionalInterestSourceReference?.trim() || loan.additionalInterestQualificationConfirmed !== true)) throw new Error("Additional student loan interest requires separate qualifying records excluding already reported amounts.");
    if (loan.sourceKind === "form1098e") {
      const id = text(loan.form1098ESourceId, "linked Form1098E source");
      const form = forms.get(id);
      if (!form || form.accountHolder !== owner || form.borrowerId?.trim() !== borrowerId || form.lender.trim() !== lender) throw new Error("Reconcile actual Form1098E lender, borrower and owner links.");
      if (additional.gt(0) && (form.box2ExcludesOriginationFeesOrCapitalizedInterest !== true || originated >= "2004-09-01")) throw new Error("Additional Form1098E interest requires actual checked Box2 and pre-September1,2004 loan records.");
      formAmounts.set(id, (formAmounts.get(id) ?? new D(0)).plus(paid));
    } else {
      if (loan.form1098ESourceId?.trim()) throw new Error("Reconcile the Form1098E link with the actual source kind.");
      additionalInterestTotal = additionalInterestTotal.plus(paid);
    }
    additionalInterestTotal = additionalInterestTotal.plus(additional);
    const grossInterest = paid.plus(additional);
    const qualifications = ["legallyObligated", "solelyQualifiedEducationExpenses", "eligibleInstitutionAtOrigination", "enrolledAtLeastHalfTime", "pursuingCredential", "expensesWithinReasonablePeriod"] as const;
    const qualifiedAnswers = qualifications.map(field => actualBoolean(loan[field], field));
    const related = actualBoolean(loan.relatedLender, "related lender status");
    const employerPlan = actualBoolean(loan.employerPlanLoan, "employer-plan loan status");
    if (!loan.studentRelationshipAtOrigination) throw new Error("Actual student's relationship at loan origination is required.");
    const loanEligible = qualifiedAnswers.every(Boolean) && !related && !employerPlan && loan.studentRelationshipAtOrigination !== "other";
    if (!loan.educationExpenseIds) throw new Error("Actual linked education expense IDs are required, including an empty list for none.");
    let linkedPaid = new D(0);
    let linkedExcluded = ratio(new D(0));
    let allLinkedAnnual = loan.educationExpenseIds.length > 0;
    let linkedClaim = new D(0);
    for (const rawId of loan.educationExpenseIds) {
      const id = text(rawId, "education expense ID");
      if (linkedEducation.has(id)) throw new Error("Duplicate linked education expense across student loans.");
      linkedEducation.add(id);
      const entry = education.get(id);
      if (!entry) throw new Error("Student loan has an unlinked calculated education expense source.");
      if (entry.owner !== owner || entry.borrowerId !== borrowerId) throw new Error("Student loan education source borrower and owner must agree.");
      linkedPaid = linkedPaid.plus(entry.interestPaid);
      linkedExcluded = addRatio(linkedExcluded, educationRatio(entry));
      allLinkedAnnual &&= entry.annualInterestOnlyReporting !== undefined;
      linkedClaim = linkedClaim.plus(entry.interestClaimedElsewhere);
    }
    if (linkedPaid.gt(grossInterest)) throw new Error("Linked education interest exceeds this loan's actual paid interest.");
    const suppliedQtp = loan.qtpTaxFreeEarningsUsedForInterest === undefined && allLinkedAnnual ? undefined
      : amount(loan.qtpTaxFreeEarningsUsedForInterest, "QTP tax-free earnings used for interest");
    if (suppliedQtp !== undefined && !suppliedQtp.times(linkedExcluded.denominator).eq(linkedExcluded.numerator))
      throw new Error("Reconcile actual QTP tax-free earnings with linked student loan expense sources.");
    const qtp = linkedExcluded.numerator.div(linkedExcluded.denominator);
    const otherReductions = amount(loan.employerAssistanceExcluded, "excluded employer assistance").plus(amount(loan.otherTaxFreeAssistance, "other tax-free loan assistance")).plus(amount(loan.interestDeductibleElsewhere, "interest deductible elsewhere"));
    if (loan.reductionsDistinctConfirmed !== true) throw new Error("Confirm student loan benefit reductions do not overlap.");
    const reductions = otherReductions.plus(qtp);
    const netRatio = ratio(grossInterest.minus(otherReductions).times(linkedExcluded.denominator).minus(linkedExcluded.numerator), linkedExcluded.denominator);
    if (netRatio.numerator.lt(0)) throw new Error("Student loan reductions exceed actual paid interest.");
    const netInterest = netRatio.numerator.div(netRatio.denominator);
    if (linkedClaim.times(netRatio.denominator).gt(netRatio.numerator)) throw new Error("Education source interest claim exceeds this loan's net interest after other benefits.");
    const eligibleRatio = returnEligible && loanEligible ? netRatio : ratio(new D(0));
    const eligibleInterest = eligibleRatio.numerator.div(eligibleRatio.denominator);
    if (linkedClaim.times(eligibleRatio.denominator).gt(eligibleRatio.numerator)) throw new Error("Reconcile the education source's student-loan claim with actual borrower eligibility.");
    audit.record("Schedule 1", `${sourceId}:student-loan-source`, "Actual eligible student loan interest before return limits", eligibleInterest, "Paid source interest less nonoverlapping benefits, subject to actual borrower and loan-origin eligibility", { "Paid interest": grossInterest, "Benefit reductions": reductions, "Source": sourceId, "Owner": owner });
    return { sourceId, borrowerId, accountHolder: owner, grossInterest, reductions, netInterest, eligibleInterest, eligibleInterestReporting: eligibleRatio };
  });
  for (const [id, form] of forms) if (!formAmounts.has(id) || !formAmounts.get(id)?.eq(form.studentLoanInterestReceived)) throw new Error("Unlinked or unreconciled Form1098E Box1 amount.");
  for (const entry of education.values()) if (entry.owner !== "other" && !linkedEducation.has(entry.expenseId)) throw new Error("Actual student loan education expense remains unlinked.");
  if (options.legacyAdditionalInterest !== undefined) {
    const legacy = amount(options.legacyAdditionalInterest, "legacy additional student loan interest");
    if (legacy.gt(0) && !additionalInterestTotal.eq(legacy)) throw new Error("Reconcile legacy additional student loan interest with actual sources.");
  }
  const qualifiedRatio = sources.reduce((total, source) => addRatio(total, source.eligibleInterestReporting), ratio(new D(0)));
  const qualifiedInterest = qualifiedRatio.numerator.div(qualifiedRatio.denominator);
  const cappedRatio = qualifiedRatio.numerator.gt(qualifiedRatio.denominator.times(2500)) ? ratio(new D(2500)) : qualifiedRatio;
  const cappedInterest = cappedRatio.numerator.div(cappedRatio.denominator);
  const constants = taxYear === 2026 ? FEDERAL_2026_CONSTANTS : getConstants(taxYear);
  const phaseOutStart = constants.studentLoanInterestDeduction.phaseOutStart[filingStatus];
  const phaseOutEnd = constants.studentLoanInterestDeduction.phaseOutEnd[filingStatus];
  const sourceResult = { qualifiedInterest, cappedInterest, phaseOutStart, phaseOutEnd, possessionIncomeAddback, additionalInterestTotal, sources, sourceFactsVerified: true as const };
  // The interview can validate actual sources before the complete return MAGI
  // exists. Absence never becomes a zero MAGI or a proposed deduction.
  if (modifiedAgi === undefined) return { ...sourceResult, calculationComplete: false as const, deduction: undefined, phaseOutRatio: undefined, lines: audit.getLines() };
  const remaining = !returnEligible || modifiedAgi.gte(phaseOutEnd) ? ratio(new D(0))
    : modifiedAgi.lte(phaseOutStart) ? ratio(new D(1)) : ratio(new D(phaseOutEnd).minus(modifiedAgi), new D(phaseOutEnd).minus(phaseOutStart));
  const phaseOutRatio = new D(1).minus(remaining.numerator.div(remaining.denominator));
  const deduction = roundEducationSourceAmounts([{ amount: cappedInterest,
    numerator: cappedRatio.numerator.times(remaining.numerator), denominator: cappedRatio.denominator.times(remaining.denominator) }]);
  audit.record("Schedule 1", "21", "Student loan interest deduction", deduction, "min(actual eligible net interest,2500) times remaining year/status phaseout fraction", { "Eligible net interest": qualifiedInterest, "Canonical MAGI": modifiedAgi, "Phaseout ratio": phaseOutRatio });
  return { ...sourceResult, calculationComplete: true as const, deduction, phaseOutRatio, lines: audit.getLines() };
}
