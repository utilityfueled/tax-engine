/** Actual Publication936 Table1; spec/federal/home-mortgage-interest.yaml. */
import Decimal from "decimal.js";
import type { MortgageInterestWorksheet, TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, sum } from "@/utils/decimal.js";

type Loan = MortgageInterestWorksheet["loans"][number];
const ZERO = new Decimal(0);
export interface HomeMortgageInterestResult {
  taxYear: number;
  sourceFactsVerified: boolean;
  mortgageInterest: Decimal;
  deductiblePoints: Decimal;
  line8a: Decimal;
  line8b: Decimal;
  line8c: Decimal;
  qualifiedLoanLimit: Decimal;
  averageQualifiedDebt: Decimal;
  deductionRatio: Decimal;
  excludedSourceInterest: Decimal;
  disallowedHomeInterest: Decimal;
  taxableInterestRecovery: Decimal;
  additionalTaxableInterestRecovery: Decimal;
  sourceDeductions: Array<{ sourceId: string; interestBeforeLimit: Decimal; pointsBeforeLimit: Decimal }>;
  unreportedLenders: Array<{ name: string; address?: string; taxId?: string }>;
  lines: CalculatedLine[];
}
function amount(value: Decimal.Value | undefined, label: string): Decimal {
  if (value === undefined) throw new Error(`Mortgage ${label} is unknown`);
  const result = new Decimal(value);
  if (!result.isFinite() || result.lt(0)) throw new Error(`Mortgage ${label} must be finite and nonnegative`);
  return result;
}
function date(value: string, label: string): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`Mortgage ${label} must be an actual date`);
  return value;
}
function balance(loan: Loan): { grandfathered: Decimal; old: Decimal; newer: Decimal } {
  const b = loan.balance;
  if (loan.loanType !== "original" && b.method !== "category_worksheet") throw new Error("Refinanced or mixed mortgage requires its actual completed category worksheet");
  if (b.method === "category_worksheet") {
    if (!b.worksheetReference.trim() || b.classificationConfirmed !== true || b.paymentsAppliedInRequiredOrderConfirmed !== true) throw new Error("Mortgage category worksheet classification and payment allocation are unknown");
    amount(b.excludedDebt, "excluded debt");
    return { grandfathered: roundDollar(amount(b.grandfatheredDebt, "grandfathered debt")), old: roundDollar(amount(b.acquisitionDebtBefore2017, "older acquisition debt")), newer: roundDollar(amount(b.acquisitionDebtAfter2017, "new acquisition debt")) };
  }
  let avg: Decimal;
  if (b.method === "highest_balance" || b.method === "lender_average") {
    if (!b.sourceReference.trim()) throw new Error("Mortgage balance source reference is unknown");
    avg = amount(b.amount, "actual balance");
  } else if (b.method === "first_last") {
    if (b.noAdditionalBorrowing !== true || b.noPrepaymentOverOneMonth !== true || b.levelPaymentsAtLeastSemiannually !== true) throw new Error("Mortgage first and last average method qualification is not established");
    avg = amount(b.firstBalance, "first balance").plus(amount(b.lastBalance, "last balance")).div(2);
  } else if (b.method === "monthly") {
    const months = new Set(b.qualifiedHomeMonths);
    if (months.size !== b.qualifiedHomeMonths.length || months.size !== b.balances.length || new Set(b.balances.map(row => row.month)).size !== months.size || b.balances.some(row => !months.has(row.month))) throw new Error("Mortgage monthly balances must cover each actual qualified-home month once");
    avg = sum(...b.balances.map(row => amount(row.amount, "monthly balance"))).div(months.size);
  } else {
    const rate = amount(b.lowestAnnualRate, "lowest annual rate");
    if (b.securedAllYear !== true || b.interestPaidAtLeastMonthly !== true || rate.lte(0) || rate.gt(1)) throw new Error("Mortgage interest/rate average method qualification is not established");
    const otherPaid = amount(loan.interestPaidByOthers, "other-person interest");
    const otherRefund = amount(b.interestRefundedToOthers, "other-person interest refund");
    if (otherRefund.gt(otherPaid)) throw new Error("Mortgage other-person interest refund exceeds actual paid interest");
    const sourceInterest = sum(
      amount(loan.interestPaid, "interest paid"), otherPaid,
      amount(b.currentYearInterestPaidInPriorYears, "prior-paid current-year interest"),
      amount(b.currentYearInterestPaidInPriorYearsByOthers, "other-person prior-paid current-year interest"),
    ).minus(amount(loan.sameYearInterestRefund, "current-year interest refund")).minus(otherRefund);
    const numerator = amount(b.currentYearInterest, "average method current-year interest");
    if (!numerator.eq(sourceInterest)) throw new Error("Mortgage interest-rate numerator must reconcile to actual current-year payer and prepayment sources");
    avg = numerator.div(rate);
  }
  avg = roundDollar(avg);
  const origin = date(loan.originationDate, "origination date");
  if (origin <= "1987-10-13") return { grandfathered: avg, old: ZERO, newer: ZERO };
  if (!loan.acquisitionUse) return { grandfathered: ZERO, old: ZERO, newer: ZERO };
  let old = origin < "2017-12-16";
  if (loan.bindingContract) {
    const c = loan.bindingContract;
    const signed = date(c.signedDate, "binding contract"), closing = date(c.requiredClosingDate, "contract closing"), purchase = date(c.purchaseDate, "purchase");
    old ||= signed < "2017-12-15" && closing < "2018-01-01" && purchase < "2018-04-01" && origin >= "2017-12-16" && origin < "2018-04-01" && signed <= purchase;
  }
  return { grandfathered: ZERO, old: old ? avg : ZERO, newer: old ? ZERO : avg };
}
function points(loan: Loan, year: number): { reported: Decimal; unreported: Decimal } {
  const source = loan.points;
  const paid = amount(loan.pointsPaid, "points paid");
  const fees = amount(loan.pointsNotInterest, "points service fees");
  if (fees.gt(paid)) throw new Error("Mortgage point service fees exceed actual points paid");
  const eligiblePaid = paid.minus(fees);
  let allowed = ZERO;
  let reported = loan.form1098SourceId !== undefined;
  if (source.method === "none") {
    if (eligiblePaid.gt(0)) throw new Error("Mortgage points require actual qualification or amortization sources");
  } else if (source.method === "current_year") {
    const applicable = source.cashMethod && source.establishedPractice && source.withinUsualAmount && source.notServiceFees && source.ownFundsSufficient && source.fullDeductionElected;
    const purchase = source.buyBuildOrImproveMainHome !== "improve";
    if (!applicable || loan.homeUse !== "main" || (purchase && (!source.percentageOfPrincipal || !source.onSettlementStatement)) || !date(source.paidDate, "points payment").startsWith(`${year}-`)) throw new Error("Mortgage points current-year qualification is not established; actual ratable sources are required");
    allowed = eligiblePaid;
  } else if (source.method === "ratable") {
    const original = amount(source.originalPoints, "original points");
    const principal = amount(source.originalPrincipal, "original point principal");
    const previous = amount(source.unamortizedPointsAtStartOfYear, "unamortized prior points");
    const months = source.loanTermMonths;
    if (!source.cashMethod || !source.pointsAreInterest || months > 360 || (months > 120 && !source.comparableLoanTerms) || source.paymentsInYear * source.paymentIntervalMonths > 12 || months % source.paymentIntervalMonths !== 0 || principal.lte(0) || (principal.gt(250000) && original.div(principal).times(100).gt(months <= 180 ? 4 : 6))) throw new Error("Mortgage ratable points qualification is not established");
    const paidYear = Number(date(source.paidDate, "original points payment").slice(0, 4));
    if (paidYear > year || (paidYear === year && (!original.eq(eligiblePaid) || !previous.isZero())) || (paidYear < year && !eligiblePaid.isZero())) throw new Error("Mortgage ratable point source year or current amount does not reconcile");
    const available = paidYear === year ? eligiblePaid : previous;
    if (available.gt(original)) throw new Error("Mortgage remaining points exceed original points");
    allowed = Decimal.min(available, original.div(months).times(source.paymentIntervalMonths).times(source.paymentsInYear));
    reported = reported && paidYear === year;
  } else {
    if (source.sourceTaxYear !== year || source.serviceFeesExcludedConfirmed !== true || !source.worksheetReference.trim()) throw new Error("Mortgage completed point worksheet source is unknown");
    allowed = amount(source.deductibleAmountBeforeLimit, "completed point deduction");
    if (allowed.gt(amount(source.unamortizedPointsAvailable, "available points"))) throw new Error("Mortgage completed point deduction exceeds available points");
    reported = source.reportedOnCurrentForm1098;
    if (reported && (!loan.form1098SourceId || allowed.gt(eligiblePaid))) throw new Error("Mortgage reported point deduction does not reconcile to current Box6");
  }
  return { reported: reported ? allowed : ZERO, unreported: reported ? ZERO : allowed };
}

export type HomeMortgageInterestInput = Pick<TaxYearInput, "form1098" | "mortgageInterestWorksheet" | "form1099Misc"> & {
  taxpayer: Pick<TaxYearInput["taxpayer"], "taxYear" | "filingStatus"> & { spouse?: unknown };
};
export function calculateHomeMortgageInterest(input: HomeMortgageInterestInput): HomeMortgageInterestResult {
  const year = input.taxpayer.taxYear;
  const facts = input.mortgageInterestWorksheet;
  const audit = new AuditTrail();
  const forms = input.form1098 ?? [];
  let grandfathered = ZERO, old = ZERO, newer = ZERO, reportedInterest = ZERO, unreportedInterest = ZERO, reportedPoints = ZERO, unreportedPoints = ZERO, excludedSourceInterest = ZERO;
  let taxableInterestRecovery = ZERO, additionalTaxableInterestRecovery = ZERO;
  const sourceDeductions: HomeMortgageInterestResult["sourceDeductions"] = [];
  const unreportedLenders: HomeMortgageInterestResult["unreportedLenders"] = [];
  if (!facts) {
    if (year >= 2026 && forms.some(form => d(form.mortgageInterestReceived).gt(0) || d(form.pointsPaid).gt(0) || d(form.refundOfOverpaidInterest).gt(0))) throw new Error("Mortgage deduction requires actual source worksheet facts for the return year");
    for (const form of forms) {
      const principal = amount(form.outstandingMortgagePrincipal, "historical outstanding principal");
      const origin = form.mortgageOriginationDate;
      if (origin !== undefined) date(origin, "historical origination date");
      if (origin !== undefined && origin <= "1987-10-13") grandfathered = grandfathered.plus(principal);
      else if (origin !== undefined && origin < "2017-12-16") old = old.plus(principal);
      else newer = newer.plus(principal);
      reportedInterest = reportedInterest.plus(amount(form.mortgageInterestReceived, "historical interest"));
      reportedPoints = reportedPoints.plus(amount(form.pointsPaid ?? "0", "historical points"));
    }
  } else {
    if (facts.sourceTaxYear !== year || facts.sourceFactsConfirmed !== true || facts.allHomeDebtIncluded !== true || !facts.sourceReference.trim()) throw new Error("Mortgage source year, complete debt and confirmation are required");
    const ids = new Set<string>(), linked = new Set<string>(), homes = new Map<string, string>();
    const formIds = forms.map(form => form.sourceId).filter(id => id !== undefined);
    if (new Set(formIds).size !== formIds.length) throw new Error("Mortgage Form1098 source identity is duplicated");
    for (const loan of facts.loans) {
      if (ids.has(loan.sourceId)) throw new Error("Mortgage loan source identity is duplicated");
      ids.add(loan.sourceId);
      if (loan.accountHolder === "spouse" && (input.taxpayer.filingStatus !== "married_filing_jointly" || !input.taxpayer.spouse)) throw new Error("Mortgage spouse source requires an actual joint-return spouse");
      if (loan.accountHolder === "joint" && input.taxpayer.filingStatus !== "married_filing_jointly") throw new Error("Mortgage joint source requires actual separate-return payment allocation");
      const origin = date(loan.originationDate, "origination date");
      if (origin > `${year}-12-31`) throw new Error("Mortgage origination date is after the return year");
      const paid = amount(loan.interestPaid, "interest paid");
      const others = amount(loan.interestPaidByOthers, "other-person interest");
      const pointPaid = amount(loan.pointsPaid, "points paid");
      const pointOthers = amount(loan.pointsPaidByOthers, "other-person points");
      if (loan.form1098SourceId !== undefined) {
        if (linked.has(loan.form1098SourceId)) throw new Error("Mortgage source statement is counted more than once");
        linked.add(loan.form1098SourceId);
        const form = forms.find(item => item.sourceId === loan.form1098SourceId);
        if (!form || form.sourceFactsComplete !== true || form.taxYear !== year || form.lender !== loan.lenderName || form.mortgageOriginationDate !== origin) throw new Error("Mortgage actual Form1098 source is incomplete or mismatched");
        if (!paid.plus(others).eq(amount(form.mortgageInterestReceived, "Box1"))) throw new Error("Mortgage paid shares must reconcile to actual Box1");
        if (!pointPaid.plus(pointOthers).eq(amount(form.pointsPaid, "Box6"))) throw new Error("Mortgage paid points must reconcile to actual Box6");
      } else unreportedLenders.push({ name: loan.lenderName, address: loan.lenderAddress, taxId: loan.lenderTaxId });
      if (loan.currentYearInterestOnly !== true) throw new Error("Mortgage prepaid or special-year interest requires an actual completed source allocation");
      const excluded = sum(amount(loan.interestDeductedElsewhere, "interest deducted elsewhere"), amount(loan.sameYearInterestRefund, "current-year interest refund"), amount(loan.nonqualifiedInterest, "nonqualified source interest"));
      const currentYearInterest = paid.plus(loan.balance.method === "interest_rate"
        ? amount(loan.balance.currentYearInterestPaidInPriorYears, "prior-paid current-year interest") : ZERO);
      if (excluded.gt(currentYearInterest)) throw new Error("Mortgage interest reductions exceed actual current-year interest");
      let interest = currentYearInterest.minus(excluded);
      let point = points(loan, year);
      const eligible = loan.qualifiedResidence && loan.homeUse !== "other" && loan.securedDebt && loan.ownershipInterest && loan.obligationToRepay;
      const category = balance(loan);
      const qualifiedBalance = sum(category.grandfathered, category.old, category.newer);
      if (!eligible || qualifiedBalance.isZero()) { excludedSourceInterest = excludedSourceInterest.plus(currentYearInterest); interest = ZERO; point = { reported: ZERO, unreported: ZERO }; }
      else {
        const previousUse = homes.get(loan.homeId);
        if (previousUse !== undefined && previousUse !== loan.homeUse) throw new Error("Mortgage home classification is inconsistent");
        homes.set(loan.homeId, loan.homeUse);
        grandfathered = grandfathered.plus(category.grandfathered); old = old.plus(category.old); newer = newer.plus(category.newer);
        excludedSourceInterest = excludedSourceInterest.plus(excluded);
      }
      if (loan.form1098SourceId) reportedInterest = reportedInterest.plus(interest); else unreportedInterest = unreportedInterest.plus(interest);
      reportedPoints = reportedPoints.plus(point.reported); unreportedPoints = unreportedPoints.plus(point.unreported);
      sourceDeductions.push({ sourceId: loan.sourceId, interestBeforeLimit: interest,
        pointsBeforeLimit: point.reported.plus(point.unreported) });
      audit.record("Mortgage Sources", loan.sourceId, "Actual qualified interest before debt limit", interest, "Actual paid share plus its prior-paid current-year interest, less current refund, amounts deducted elsewhere and source-ineligible interest");
    }
    if (homes.size > 2 || [...homes.values()].filter(use => use === "main").length > 1 || [...homes.values()].filter(use => use === "second").length > 1) throw new Error("Mortgage source worksheet requires the actual one main and one selected second qualified home");
    if (forms.some(form => (d(form.mortgageInterestReceived).gt(0) || d(form.pointsPaid).gt(0)) && !linked.has(form.sourceId ?? ""))) throw new Error("Mortgage actual source worksheet omits a Form1098 interest or points source");
    const recoveryIds = new Set<string>(), refunds = new Map<string, Decimal>(), includedSources = new Map<number, Decimal>();
    for (const recovery of facts.priorYearInterestRecoveries) {
      if (recoveryIds.has(recovery.sourceId) || recovery.originTaxYear >= year || recovery.originTaxYear < 1913 || recovery.taxBenefitWorksheetConfirmed !== true || !recovery.taxBenefitWorksheetReference.trim()) throw new Error("Mortgage prior-year recovery needs actual origin and tax-benefit worksheet");
      recoveryIds.add(recovery.sourceId);
      const refund = amount(recovery.refundReceived, "prior-year refund");
      const taxable = amount(recovery.taxableRecovery, "taxable recovery");
      const included = amount(recovery.alreadyIncludedInOtherIncome, "recovery already included in other income");
      if (taxable.gt(refund) || included.gt(taxable)) throw new Error("Mortgage taxable recovery exceeds actual source or already-included amount");
      if (included.gt(0)) {
        const index = recovery.otherIncomeSource?.form1099MiscIndex;
        const source = index === undefined ? undefined : input.form1099Misc[index];
        if (index === undefined || !source) throw new Error("Mortgage already-included recovery requires its actual other-income source");
        const assigned = (includedSources.get(index) ?? ZERO).plus(included);
        if (assigned.gt(amount(source.otherIncome, "other-income source Box3"))) throw new Error("Mortgage recovery exceeds its actual other-income source");
        includedSources.set(index, assigned);
      }
      taxableInterestRecovery = taxableInterestRecovery.plus(taxable); additionalTaxableInterestRecovery = additionalTaxableInterestRecovery.plus(taxable.minus(included));
      if (recovery.form1098SourceId !== undefined) {
        if (!forms.some(form => form.sourceId === recovery.form1098SourceId && form.taxYear === year && form.sourceFactsComplete)) throw new Error("Mortgage recovery source statement is unknown");
        refunds.set(recovery.form1098SourceId, (refunds.get(recovery.form1098SourceId) ?? ZERO).plus(refund));
      }
    }
    for (const form of forms) if (!d(form.refundOfOverpaidInterest).eq(refunds.get(form.sourceId ?? "") ?? ZERO)) throw new Error("Mortgage Box4 must reconcile to actual prior-year recovery sources");
    audit.record("Mortgage Sources", "taxable-recovery", "Actual prior-year interest recovery", additionalTaxableInterestRecovery, "Completed prior-year tax-benefit amount less actual amount already included in other income");
  }
  const mfs = input.taxpayer.filingStatus === "married_filing_separately";
  const line3 = d(mfs ? 500000 : 1000000), line4 = Decimal.max(grandfathered, line3), line5 = grandfathered.plus(old), line6 = Decimal.min(line4, line5), line8 = d(mfs ? 375000 : 750000);
  const skipNew = newer.isZero() || line6.gte(line8);
  const line9 = Decimal.max(line6, line8), line10 = line6.plus(newer), limit = skipNew ? line6 : Decimal.min(line9, line10);
  const totalDebt = sum(grandfathered, old, newer);
  const totalInterest = reportedInterest.plus(unreportedInterest);
  const ratio = totalDebt.isZero() ? d(1) : Decimal.min(1, limit.div(totalDebt)).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  const limited = ratio.lt(1);
  const round = facts !== undefined || limited;
  const printedInterest = round ? roundDollar(totalInterest) : totalInterest;
  const apply = (value: Decimal) => round ? roundDollar(roundDollar(value).times(ratio)) : value.times(ratio);
  const mortgageInterest = apply(printedInterest), deductiblePoints = apply(reportedPoints.plus(unreportedPoints));
  const line8b = apply(unreportedInterest), line8c = apply(unreportedPoints), line8a = mortgageInterest.minus(line8b).plus(deductiblePoints.minus(line8c));
  const values: Array<[string, Decimal, string]> = [["1", grandfathered, "Actual grandfathered average debt"], ["2", old, "Actual older acquisition average debt"], ["3", line3, "Older acquisition statutory limit"], ["4", line4, "max(1,3)"], ["5", line5, "1+2"], ["6", line6, "min(4,5)"]];
  if (!skipNew) values.push(["7", newer, "Actual newer acquisition average debt"], ["8", line8, "New acquisition statutory limit"], ["9", line9, "max(6,8)"], ["10", line10, "6+7"]);
  values.push(["11", limit, skipNew ? "Line6; skip7-10" : "min(9,10)"], ["12", totalDebt, "All qualified debt categories"], ["13", printedInterest, "Actual interest on qualified debt, excluding points and insurance"], ["14", ratio, "min(1,11/12), rounded to3decimals"], ["15", mortgageInterest, "13*14"], ["16", printedInterest.minus(mortgageInterest), "13-15"]);
  for (const [line, value, formula] of values) audit.record("Pub936 Table1", line, formula, value, `${facts ? "Actual source worksheet" : "Unverified historical outstanding-balance preview"}: ${formula}`);
  return { taxYear: year, sourceFactsVerified: facts !== undefined, mortgageInterest, deductiblePoints, line8a, line8b, line8c, qualifiedLoanLimit: limit, averageQualifiedDebt: totalDebt, deductionRatio: ratio, excludedSourceInterest, disallowedHomeInterest: printedInterest.minus(mortgageInterest), taxableInterestRecovery, additionalTaxableInterestRecovery, sourceDeductions, unreportedLenders, lines: audit.getLines() };
}
