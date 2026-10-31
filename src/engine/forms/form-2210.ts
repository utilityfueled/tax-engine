/** Form 2210 regular method. Spec: spec/federal/form-2210.yaml. */
import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { FilingStatus } from "@/models/constants.js";
import { zeroFloor, min, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { calculateForm2210ScheduleAi } from "./form-2210-schedule-ai.js";

export interface Form2210Payment {
  /** Actual IRS-effective date; a prior-credit origin date is not inferred. */
  date: string;
  amount: Decimal.Value;
  kind: "estimated" | "prior-year-credit" | "extension" | "return";
}
export interface Form2210Input {
  taxYear?: number;
  /** Form 2210 lines 1+2, including only the taxes enumerated in the instructions. */
  currentYearTax: Decimal;
  /** Actual Form 1040 line 22. Omission is unverified historical compatibility only. */
  incomeTaxAfterCredits?: Decimal;
  withholding: Decimal;
  /** Form1040 standard deduction for Schedule AI line7. */
  standardDeduction?: Decimal;
  /** Estimated payments plus applied prior-year credits, reconciled to payments. */
  estimatedPayments: Decimal;
  refundableCredits: Decimal;
  /** Legacy 2025 aliases, not a verified prior-return source. */
  priorYearTax?: Decimal;
  priorYearAGI?: Decimal;
  filingStatus: FilingStatus;
  payments?: Form2210Payment[];
  facts?: TaxYearInput["form2210"];
}
export interface Form2210InterestPeriod {
  installment: number;
  startDate: string;
  endDate: string;
  days: number;
  principal: Decimal;
  annualRate: Decimal;
  exactPenalty: Decimal;
  rateSource: string;
}
export interface Form2210Installment {
  installment: number;
  dueDate: string;
  timelyPaymentDeadline: string;
  required: Decimal;
  payments: Decimal;
  underpayment: Decimal;
  overpayment: Decimal;
}
export interface Form2210Result {
  taxYear: number;
  sourceFactsVerified: boolean;
  safeHarborMet: boolean;
  safeHarborReason: string;
  requiredAnnualPayment: Decimal;
  totalPayments: Decimal;
  /** Unpaid required installments at April15; earlier late payments may still cause penalty. */
  underpayment: Decimal;
  exactPenalty: Decimal;
  penalty: Decimal;
  /** Known Part II D/E reasons; uncollected physical filing facts are not inferred. */
  requiresForm2210: boolean;
  withholdingMethod: "equal-installments" | "actual-dates";
  installments: Form2210Installment[];
  interestPeriods: Form2210InterestPeriod[];
  lines: CalculatedLine[];
}
interface RatePeriod { start: string; end: string; rate: string; source: string }
const RATE_PERIODS: Readonly<Record<number, readonly RatePeriod[]>> = Object.freeze({
  2025: Object.freeze([
    { start: "2025-04-16", end: "2025-06-30", rate: "0.07", source: "https://www.irs.gov/irb/2025-13_IRB" },
    { start: "2025-07-01", end: "2025-09-30", rate: "0.07", source: "https://www.irs.gov/irb/2025-23_IRB" },
    { start: "2025-10-01", end: "2025-12-31", rate: "0.07", source: "https://www.irs.gov/irb/2025-37_IRB" },
    // IRC6621(b)(2)(B): March's rate also applies to April1-15 of the following year.
    { start: "2026-01-01", end: "2026-04-15", rate: "0.07", source: "https://www.irs.gov/irb/2025-48_IRB" },
  ]),
  2026: Object.freeze([
    { start: "2026-04-16", end: "2026-06-30", rate: "0.06", source: "https://www.irs.gov/irb/2026-8_IRB" },
    { start: "2026-07-01", end: "2026-09-30", rate: "0.07", source: "https://www.irs.gov/irb/2026-22_IRB" },
    { start: "2026-10-01", end: "2026-12-31", rate: "0.07", source: "https://www.irs.gov/irb/2026-36_IRB" },
    // No published2027Q1 rate as of2026-10-25. Positive exposure must fail explicitly.
  ]),
});
const DAY_MS = 86_400_000;
const FORM = "Form 2210";

function amount(value: Decimal.Value | undefined, name: string, signed = false): Decimal {
  if (value === undefined) throw new Error(`Form 2210 requires ${name}`);
  const result = new Decimal(value);
  if (!result.isFinite() || (!signed && result.isNegative())) {
    throw new Error(`Form 2210 ${name} must be finite${signed ? "" : " and nonnegative"}`);
  }
  return result;
}
function dateNumber(value: string, name: string): number {
  const result = Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(result) || new Date(result).toISOString().slice(0, 10) !== value) {
    throw new Error(`Form 2210 ${name} must be an actual ISO calendar date`);
  }
  return result / DAY_MS;
}
function dateString(day: number): string { return new Date(day * DAY_MS).toISOString().slice(0, 10); }
function total(values: readonly Decimal[]): Decimal { return values.reduce((sum, value) => sum.plus(value), new Decimal(0)); }

/** Strict source facts are required for2026 or whenever the caller supplies the new contract. */
function validateScope(facts: NonNullable<Form2210Input["facts"]>): void {
  const booleans = [
    ["calendarYearTaxpayer", true], ["residentReturn", true], ["farmerOrFisher", false],
    ["disasterReliefClaimed", false], ["waiverRequested", false],
  ] as const;
  for (const [key, supported] of booleans) {
    if (facts[key] === undefined) throw new Error(`Form 2210 requires ${key}`);
    if (facts[key] !== supported) throw new Error(`Form 2210 ${key} scenario is unsupported; requires a separate calculation or relief determination`);
  }
  if (facts.calculationMethod === undefined) throw new Error("Form 2210 requires calculationMethod");
  if (facts.calculationMethod !== "regular" && !facts.annualizedIncomePeriods) throw new Error("Form 2210 annualized-income method requires actual Schedule AI period facts");
  if (facts.withholdingMethod === undefined) throw new Error("Form 2210 requires withholdingMethod");
}

export function calculateForm2210(input: Form2210Input): Form2210Result {
  const taxYear = input.taxYear ?? 2025;
  const rates = RATE_PERIODS[taxYear];
  if (!rates) throw new Error(`Form 2210 tax year ${taxYear} is not implemented`);
  const audit = new AuditTrail();
  const currentTax = amount(input.currentYearTax, "currentYearTax");
  const withholding = amount(input.withholding, "withholding");
  const estimates = amount(input.estimatedPayments, "estimatedPayments");
  const credits = amount(input.refundableCredits, "refundableCredits");
  const facts = input.facts;
  const strict = taxYear === 2026 || facts !== undefined;
  const withholdingMethod = facts?.withholdingMethod ?? "equal-installments";
  if (input.incomeTaxAfterCredits !== undefined) {
    const line1 = amount(input.incomeTaxAfterCredits, "incomeTaxAfterCredits");
    if (line1.gt(currentTax)) throw new Error("Form 2210 incomeTaxAfterCredits exceeds included currentYearTax");
    audit.record(FORM, "1", "Income tax after credits", line1, "Actual Form 1040 line22");
    audit.record(FORM, "2", "Included other taxes", currentTax.minus(line1), "Included currentYearTax minus Form1040line22");
  }
  const taxShown = zeroFloor(currentTax.minus(credits));
  const ninetyPercent = roundDollar(taxShown.times("0.9"));
  const taxAfterWithholding = zeroFloor(taxShown.minus(withholding));
  audit.record(FORM, "3", "Refundable credits", credits, "Actual included refundable credits");
  audit.record(FORM, "4", "Current-year tax after refundable credits", taxShown, "max(0,line1+line2-line3)");
  audit.record(FORM, "5", "Ninety percent of current-year tax", ninetyPercent, "roundDollar(line4*0.90)");
  audit.record(FORM, "6", "Withholding and included excess Social Security credit", withholding, "Actual included withholding credit");
  audit.record(FORM, "7", "Tax after withholding", taxAfterWithholding, "max(0,line4-line6)");

  let sourceFactsVerified = false;
  let required = ninetyPercent;
  let requiredReason = "90% current year tax";
  let noPriorTaxException = false;
  const installments: Form2210Installment[] = [];
  const interestPeriods: Form2210InterestPeriod[] = [];
  const basePayments = withholding.plus(estimates);
  const finish = (safe: boolean, reason: string, balance: Decimal, exactPenalty: Decimal, payments = basePayments): Form2210Result => {
    const penalty = roundDollar(exactPenalty);
    audit.record(FORM, "9", "Required annual payment", required, "min(line5, applicable line8)");
    audit.record(FORM, "19", "Regular-method estimated-tax penalty", penalty, "roundDollar(sum(exact dated penalty periods))");
    audit.record(FORM, "safe_harbor", "No installment penalty", new Decimal(safe ? 1 : 0), reason);
    audit.record(FORM, "source_facts_verified", "Complete supported source facts", new Decimal(sourceFactsVerified ? 1 : 0), "Actual year, tax components, method and prior-return facts validated");
    const priorRequired = audit.getLine(FORM, "8")?.value;
    const changedJointStatus = facts?.priorYearJointReturn !== undefined
      && facts.priorYearJointReturn !== (input.filingStatus === "married_filing_jointly");
    const jointFilingReason = changedJointStatus && priorRequired !== undefined && priorRequired.lt(ninetyPercent);
    return {
      taxYear, sourceFactsVerified, safeHarborMet: safe, safeHarborReason: reason,
      requiredAnnualPayment: required, totalPayments: payments, underpayment: balance,
      exactPenalty, penalty, requiresForm2210: withholdingMethod === "actual-dates" || jointFilingReason, withholdingMethod, installments, interestPeriods,
      lines: audit.getLines(),
    };
  };

  // These exceptions are provable without inventing missing prior-return or installment facts.
  if (taxAfterWithholding.lt(1000)) return finish(true, "Tax shown minus withholding < $1,000", new Decimal(0), new Decimal(0));
  if (withholdingMethod === "equal-installments" && withholding.gte(ninetyPercent)) {
    return finish(true, "Statutory withholding installments meet 90% current year tax", new Decimal(0), new Decimal(0));
  }
  if (strict) {
    if (!facts) throw new Error("Form 2210 requires actual taxpayer and payment facts for this tax year");
    validateScope(facts);
    amount(input.incomeTaxAfterCredits, "incomeTaxAfterCredits");
    if (facts.priorYearTaxStatus === undefined) throw new Error("Form 2210 requires priorYearTaxStatus");
    if (facts.priorYearTaxStatus !== "no-return") {
      if (facts.priorYearFullYear === undefined) throw new Error("Form 2210 requires priorYearFullYear");
      if (facts.priorYearFullYear) {
        if (facts.priorYearTaxComputationConfirmed !== true) throw new Error("Form 2210 requires priorYearTaxComputationConfirmed");
        const priorTax = amount(facts.priorYearTaxForForm2210, "priorYearTaxForForm2210");
        if (facts.priorYearTaxStatus === "no-tax-liability") {
          if (!priorTax.isZero()) throw new Error("Form 2210 no-tax-liability status conflicts with priorYearTaxForForm2210");
          if (facts.priorYearResidentAllYear === undefined) throw new Error("Form 2210 requires priorYearResidentAllYear");
          noPriorTaxException = facts.priorYearResidentAllYear;
        } else {
          const agi = amount(facts.priorYearAgiForForm2210, "priorYearAgiForForm2210", true);
          const multiplier = agi.gt(input.filingStatus === "married_filing_separately" ? "75000" : "150000") ? "1.1" : "1";
          const priorRequired = roundDollar(priorTax.times(multiplier));
          audit.record(FORM, "8", "Prior-year required tax", priorRequired, "Actual eligible prior-year tax times100%/110%");
          if (priorRequired.lt(required)) { required = priorRequired; requiredReason = `${multiplier === "1.1" ? "110%" : "100%"} prior year tax`; }
        }
      }
    }
    sourceFactsVerified = true;
  } else if (input.priorYearTax !== undefined) {
    const priorTax = amount(input.priorYearTax, "priorYearTax");
    const agi = amount(input.priorYearAGI, "priorYearAGI", true);
    const multiplier = agi.gt(input.filingStatus === "married_filing_separately" ? "75000" : "150000") ? "1.1" : "1";
    const priorRequired = roundDollar(priorTax.times(multiplier));
    // Never publish legacy prior-tax aliases as a verified physical line8.
    audit.record(FORM, "legacy_prior_tax", "Unverified historical prior-tax comparison", priorRequired, "Legacy prior-tax alias times100%/110%");
    if (priorRequired.lt(required)) { required = priorRequired; requiredReason = `${multiplier === "1.1" ? "110%" : "100%"} prior year tax`; }
  }
  if (noPriorTaxException) {
    required = new Decimal(0);
    return finish(true, "No prior-year tax liability for a full year of US citizenship or residence", new Decimal(0), new Decimal(0));
  }
  if (required.isZero()) return finish(true, `Eligible ${requiredReason} is zero`, new Decimal(0), new Decimal(0));

  const dueDates = [`${taxYear}-04-15`, `${taxYear}-06-15`, `${taxYear}-09-15`, `${taxYear + 1}-01-15`];
  const schedule = dueDates.map((dueDate, index) => ({
    dueDate,
    day: dateNumber(dueDate, "installment due date"),
    deadline: taxYear === 2025 && index === 1 ? dateNumber("2025-06-16", "timely payment deadline") : dateNumber(dueDate, "timely payment deadline"),
  }));
  const endDay = dateNumber(`${taxYear + 1}-04-15`, "penalty end date");
  const firstDay = dateNumber(`${taxYear}-01-01`, "tax year start");
  const lastDay = dateNumber(`${taxYear + 1}-12-31`, "payment history end");
  const normalizedDate = (date: string, name: string): number => {
    const value = dateNumber(date, name);
    if (value < firstDay || value > lastDay) throw new Error(`Form 2210 ${name} is outside the tax-year payment history`);
    const weekend = schedule.find((installment) => installment.deadline !== installment.day && value > installment.day && value <= installment.deadline);
    return weekend?.day ?? value;
  };
  const payments = (input.payments ?? []).map((payment, index) => ({
    day: normalizedDate(payment.date, `payment ${index + 1} date`),
    actualDay: dateNumber(payment.date, "payment date"),
    amount: amount(payment.amount, `payment ${index + 1} amount`), kind: payment.kind,
  }));
  if (!total(payments.filter((p) => p.kind === "estimated" || p.kind === "prior-year-credit").map((p) => p.amount)).eq(estimates)) {
    throw new Error("Form 2210 dated estimated and prior-credit payments must reconcile to estimatedPayments");
  }
  const cashPayments: Array<{ day: number; actualDay: number; amount: Decimal; kind: Form2210Payment["kind"] | "withholding" }> = [...payments];
  if (withholdingMethod === "actual-dates") {
    if (!facts?.withholdingPayments) throw new Error("Form 2210 actual withholding dates are required");
    const datedWithholding = facts.withholdingPayments.map((payment, index) => {
      const day = dateNumber(payment.date, `withholding ${index + 1} date`);
      if (day < firstDay || day >= dateNumber(`${taxYear + 1}-01-01`, "year end")) throw new Error("Form 2210 withholding date must be within the tax year");
      return { day: normalizedDate(payment.date, "withholding date"), actualDay: day, amount: amount(payment.amount, "withholding amount"), kind: "withholding" as const };
    });
    if (!total(datedWithholding.map((p) => p.amount)).eq(withholding)) throw new Error("Form 2210 actual withholding payments must reconcile to withholding");
    cashPayments.push(...datedWithholding);
  } else {
    for (const { day } of schedule) cashPayments.push({ day, actualDay: day, amount: withholding.div(4), kind: "withholding" as const });
  }
  cashPayments.sort((left, right) => left.day - right.day);
  let earlyReturn = false;
  let earlyPaidDay: number | undefined;
  if (facts?.returnFiledDate !== undefined || facts?.returnPaidInFullDate !== undefined) {
    if (!facts.returnFiledDate || !facts.returnPaidInFullDate) throw new Error("Form 2210 requires both returnFiledDate and returnPaidInFullDate");
    const filed = dateNumber(facts.returnFiledDate, "returnFiledDate");
    const paid = dateNumber(facts.returnPaidInFullDate, "returnPaidInFullDate");
    if (filed <= dateNumber(`${taxYear}-12-31`, "tax year end") || paid <= dateNumber(`${taxYear}-12-31`, "tax year end")) {
      throw new Error("Form 2210 return filing/full payment dates must follow the tax year");
    }
    const paidByDate = withholding.plus(total(payments.filter((p) => p.actualDay <= paid).map((p) => p.amount)));
    if (paidByDate.lt(taxShown)) throw new Error("Form 2210 claimed full return payment does not reconcile to actual payments");
    const earlyDeadline = dateNumber(taxYear === 2025 ? "2026-02-02" : "2027-02-01", "early return deadline");
    earlyReturn = filed <= earlyDeadline && paid <= earlyDeadline;
    if (earlyReturn) earlyPaidDay = paid;
  }

  const quarter = required.div(4);
  let requiredInstallments = schedule.map(() => quarter);
  if (facts?.calculationMethod === "annualized") {
    const scheduleAi = calculateForm2210ScheduleAi({ taxYear, filingStatus: input.filingStatus, requiredAnnualPayment: required, facts,
      standardDeduction: amount(input.standardDeduction, "standardDeduction") });
    requiredInstallments = scheduleAi.installments;
    audit.merge(scheduleAi.lines);
  }
  let previousOverpayment = new Decimal(0);
  let previousUnpaid = new Decimal(0);
  let allTimely = true;
  for (const [index, due] of schedule.entries()) {
    const suffix = String.fromCharCode(97 + index);
    const previousDue = schedule[index - 1]?.day;
    const intervalPayments = total(cashPayments.filter((payment) => {
      if (index === 3 && earlyPaidDay !== undefined && payment.kind === "return" && payment.actualDay <= earlyPaidDay) return previousDue !== undefined && payment.day > previousDue;
      return payment.day <= due.day && (previousDue === undefined || payment.day > previousDue);
    }).map((p) => p.amount));
    const available = intervalPayments.plus(previousOverpayment);
    const applied = zeroFloor(available.minus(previousUnpaid));
    const remainingPrior = zeroFloor(previousUnpaid.minus(available));
    const installmentRequired = requiredInstallments[index]!;
    const shortfall = zeroFloor(installmentRequired.minus(applied));
    const overpayment = zeroFloor(applied.minus(installmentRequired));
    const rowValues: Array<[number, Decimal, string]> = [
      [10, installmentRequired, facts?.calculationMethod === "annualized" ? "Schedule AI line27" : "line9/4"],
      [11, intervalPayments, "Dated payments in interval plus statutory/actual withholding"],
      [12, previousOverpayment, "Previous column line18"],
      [13, available, "line11+line12"],
      [14, previousUnpaid, "Previous column line16+line17"],
      [15, applied, "max(0,line13-line14)"],
      [16, remainingPrior, "max(0,line14-line13)"],
      [17, shortfall, "max(0,line10-line15)"],
      [18, overpayment, "max(0,line15-line10)"],
    ];
    for (const [line, value, formula] of rowValues) audit.record(FORM, `${line}${suffix}`, `Installment ${index + 1} line ${line}`, value, formula);
    installments.push({ installment: index + 1, dueDate: due.dueDate, timelyPaymentDeadline: dateString(due.deadline), required: installmentRequired, payments: intervalPayments, underpayment: shortfall, overpayment });
    allTimely &&= shortfall.isZero() || (index === 3 && earlyReturn);
    previousOverpayment = overpayment;
    previousUnpaid = remainingPrior.plus(shortfall);
  }

  const allocations = cashPayments.map((payment) => ({ ...payment, remaining: payment.amount }));
  let remainingTotal = new Decimal(0);
  const accrue = (installment: number, principal: Decimal, due: number, paid: number): void => {
    const until = Math.min(paid, endDay);
    if (principal.isZero() || until <= due || (installment === 4 && earlyReturn)) return;
    let start = due + 1; // Days after due date through payment date, inclusive.
    for (const period of rates) {
      const from = Math.max(start, dateNumber(period.start, "rate start"));
      const through = Math.min(until, dateNumber(period.end, "rate end"));
      if (through < from) continue;
      if (from !== start) throw new Error(`Form 2210 ${dateString(start)} rate is unpublished; final penalty unavailable`);
      const days = through - from + 1;
      const annualRate = new Decimal(period.rate);
      const exactPenalty = principal.times(annualRate).times(days).div(365);
      interestPeriods.push({ installment, startDate: dateString(from), endDate: dateString(through), days, principal, annualRate, exactPenalty, rateSource: period.source });
      audit.record("Form 2210 Penalty Worksheet", `${installment}:${interestPeriods.length}`, "Dated installment penalty", exactPenalty, "principal*annualRate*days/365", { principal, annualRate, days: String(days), start: dateString(from), end: dateString(through), rateSource: period.source });
      start = through + 1;
      if (start > until) return;
    }
    if (start <= until) throw new Error(`Form 2210 ${dateString(start)} rate is unpublished; final penalty unavailable`);
  };
  for (const [index, due] of schedule.entries()) {
    let outstanding = requiredInstallments[index]!;
    for (const payment of allocations) {
      if (outstanding.isZero()) break;
      if (payment.remaining.isZero() || payment.day > endDay) continue;
      const applied = min(outstanding, payment.remaining);
      accrue(index + 1, applied, due.day, payment.day);
      outstanding = outstanding.minus(applied);
      payment.remaining = payment.remaining.minus(applied);
    }
    accrue(index + 1, outstanding, due.day, endDay);
    remainingTotal = remainingTotal.plus(outstanding);
  }
  const exactPenalty = total(interestPeriods.map((period) => period.exactPenalty));
  const totalPaid = withholding.plus(total(payments.filter((p) => p.day <= endDay).map((p) => p.amount)));
  return finish(allTimely, allTimely ? `Timely installments meet ${requiredReason}` : "No safe harbor met", remainingTotal, exactPenalty, totalPaid);
}
