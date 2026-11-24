/** Schedule A line 5a source worksheet; spec/federal/schedule-a.yaml. */
import Decimal from "decimal.js";
import { calculateW2StateLocalSources } from "./w2-state-local.js";
import { calculateForm1099G } from "./form-1099-g.js";
import {calculateTaxableStateRefundRecoveries} from "./taxable-state-refund-recoveries.js";
import { calculateForm1099OID } from "./form-1099-oid.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { W2StateLocalSourcesSchema } from "@/models/w2-state-local.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";
import { calculateStateTaxPaymentsInYear } from "./state-tax-payment-year.js";
import { readOhioSchoolScheduleAPayments } from "../federal.js";

const stateJurisdiction = W2StateLocalSourcesSchema.shape.stateRows.element.shape.state;
const US_TERRITORY_CODES = new Set(["AS", "GU", "MP", "PR", "VI"]);

interface StateLocalIncomeTaxDeductionResult {
  w2StateWithholding: Decimal;
  w2LocalWithholding: Decimal;
  nonW2Withholding: Decimal;
  deductedElsewhere: Decimal;
  statePaymentsInYear: Decimal;
  additionalPayments: Decimal;
  currentYearRefunds: Decimal;
  total: Decimal;
  lines: CalculatedLine[];
}

function actualAmount(value: string | undefined, label: string): Decimal {
  const amount = d(value);
  if (!amount.isFinite() || amount.isNegative()) throw new Error(`${label} must be finite and nonnegative`);
  return amount;
}

export function calculateStateLocalIncomeTaxDeduction(input: TaxYearInput): StateLocalIncomeTaxDeductionResult {
  const audit = new AuditTrail();
  const actualW2Rows = input.w2s.map((form, index) => {
    const packet = (form as typeof form & { stateLocalSources?: unknown }).stateLocalSources;
    return packet === undefined ? undefined : calculateW2StateLocalSources(input, index, packet);
  });
  const w2StateWithholding = sum(...input.w2s.map((form, index) => actualW2Rows[index]?.totalStateWithheld ?? actualAmount(form.stateTaxWithheld, "W2 state withholding")));
  const w2LocalWithholding = sum(...input.w2s.map((form, index) => actualW2Rows[index]?.totalLocalWithheld ?? actualAmount(form.localTaxWithheld, "W2 local withholding")));
  const sourceGroups: Array<[string, ReadonlyArray<{ stateWithheld?: string }>]> = [
    ["1099-INT", input.form1099Int ?? []], ["1099-DIV", input.form1099Div ?? []],
    ["1099-B", input.form1099B ?? []], ["1099-DA", input.form1099DA ?? []],
    ["1099-NEC", input.form1099Nec ?? []], ["1099-MISC", input.form1099Misc ?? []],
    ["1099-G", input.form1099G ?? []], ["1099-K", input.form1099K ?? []],
    ["W2G", input.formW2G ?? []],
  ];
  let nonW2Withholding = d(0);
  for (const [form, sources] of sourceGroups) {
    if (sources.length === 0) continue;
    const amount = sum(...sources.map(source => actualAmount(source.stateWithheld, `${form} state withholding`)));
    nonW2Withholding = nonW2Withholding.plus(amount);
    audit.record("SALT Income Tax WS", form, `${form} state withholding`, amount, "Actual modeled source withholding counted once");
  }
  for (const [index, form] of (input.form1099R ?? []).entries()) {
    const state = actualAmount(form.stateWithheld, "1099R state withholding");
    const alias = actualAmount(form.stateTaxWithheld, "1099R state withholding alias");
    if (state.gt(0) && alias.gt(0) && !state.eq(alias)) throw new Error("1099R state withholding aliases conflict");
    // Legacy aliases default to zero; equal positive aliases represent one Box 14.
    const amount = (state.gt(0) ? state : alias).plus(actualAmount(form.localTaxWithheld, "1099R local withholding"));
    nonW2Withholding = nonW2Withholding.plus(amount);
    audit.record("SALT Income Tax WS", `1099-R-${index + 1}`, "1099R state and local withholding", amount, "One reconciled state Box14 plus local withholding");
  }
  const oidStateWithholding = calculateForm1099OID(input.form1099OID ?? [], input.taxpayer.taxYear).stateWithheld;
  nonW2Withholding = nonW2Withholding.plus(oidStateWithholding);
  if ((input.form1099OID ?? []).length) audit.record("SALT Income Tax WS", "1099-OID", "Actual OID state withholding", oidStateWithholding, "Sum actual source Box14 state rows once");
  const allocation = input.scheduleA?.nonW2IncomeTaxesDeductedElsewhere;
  if (input.taxpayer.taxYear === 2026 && nonW2Withholding.gt(0) && allocation === undefined) {
    throw new Error("Actual non-W2 income taxes deducted on other schedules are unknown");
  }
  const deductedElsewhere = actualAmount(allocation, "Non-W2 income taxes deducted elsewhere");
  if (deductedElsewhere.gt(nonW2Withholding)) throw new Error("Another-schedule tax deduction exceeds actual non-W2 withholding");
  let statePaymentsInYear = calculateStateTaxPaymentsInYear(input);
  const additionalPayments = actualAmount(input.scheduleA?.additionalStateLocalIncomeTaxes, "Additional income-tax payments");
  const ohioSchool = readOhioSchoolScheduleAPayments(input);
  if (ohioSchool) {
    const estimated = d(ohioSchool.estimatedPrincipal);
    const priorCredit = d(ohioSchool.appliedPriorCredit);
    const { estimatedTaxPayments = [], extensionPayments = [], priorYearAppliedCredits = [] } = input.adjustments ?? {};
    const jurisdiction = (state: string | undefined) => {
      const code = state?.trim().toUpperCase();
      return code && (stateJurisdiction.safeParse(code).success || US_TERRITORY_CODES.has(code)) ? code : undefined;
    };
    const inCashYear = (payment: { type: string; date: string; amount: string }) => payment.type === "state"
      && payment.date.startsWith("2025-") && d(payment.amount).gt(0);
    if (additionalPayments.gt(0)
      || [...estimatedTaxPayments, ...extensionPayments].some(payment => inCashYear(payment) && !jurisdiction(payment.state))
      || extensionPayments.some(payment => inCashYear(payment) && jurisdiction(payment.state) === "OH")
      || priorYearAppliedCredits.some(credit => credit.type === "state" && d(credit.amount).gt(0) && !jurisdiction(credit.state))) {
      throw new Error("Identify the state jurisdiction and reconcile additional taxes with the Ohio school district receipts and applied credit.");
    }
    const schoolPayments = estimated.plus(priorCredit);
    statePaymentsInYear = statePaymentsInYear.plus(schoolPayments);
    audit.record("SALT Income Tax WS", "OH-SD-100", "Verified Ohio school district income taxes", schoolPayments,
      "2025 estimated principal paid plus the verified prior-year district refund applied to 2025", {
        "Estimated principal paid during 2025": estimated, "Prior district refund applied to 2025": priorCredit,
      });
  }
  if ((input.form1099G ?? []).some(source => source.refundPaymentBasis !== undefined) && !input.taxableStateRefundRecoveries) throw new Error("Refund original allocation requires a complete source recovery collection");
  const recoveries = input.taxableStateRefundRecoveries ? calculateTaxableStateRefundRecoveries(input) : undefined;
  const currentRefundSources = (input.form1099G ?? []).filter(source => source.refundExpenseTaxYear === input.taxpayer.taxYear
    && Decimal.max(d(source.stateOrLocalTaxRefund), d(source.stateLocalIncomeTaxRefund)).gt(0));
  const government = calculateForm1099G(currentRefundSources, input.taxpayer.taxYear, input.taxpayer.filingStatus);
  const currentYearRefunds = recoveries?.currentYearRefund ?? sum(...government.refundSources.filter(source => source.refundExpenseTaxYear === input.taxpayer.taxYear).map(source => source.amount));
  const payments = sum(w2StateWithholding, w2LocalWithholding, nonW2Withholding, statePaymentsInYear, additionalPayments).minus(deductedElsewhere);
  if (currentYearRefunds.gt(payments)) throw new Error("Actual same-year income-tax refunds exceed known current-year payments");
  const total = payments.minus(currentYearRefunds);
  audit.record("SALT Income Tax WS", "same-year-refunds", "Actual same-year income-tax refunds", currentYearRefunds,
    "Reduce the same-year deduction once; prior-year refunds require separate historical tax benefit");
  audit.record("SALT Income Tax WS", "total", "Qualified state and local income taxes", total,
    "W2 state/local + non-W2 state/local + in-year payments/applied credits + separate additional payments − non-W2 withholding deducted elsewhere − actual same-year refunds", {
      "W2 state": w2StateWithholding, "W2 local": w2LocalWithholding, "Non-W2": nonW2Withholding,
      "Deducted elsewhere": deductedElsewhere, "In-year payments/applied credits": statePaymentsInYear, "Additional payments": additionalPayments, "Same-year refunds": currentYearRefunds,
    });
  return { w2StateWithholding, w2LocalWithholding, nonW2Withholding, deductedElsewhere, statePaymentsInYear, additionalPayments, currentYearRefunds, total, lines: audit.getLines() };
}
