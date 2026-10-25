/** Schedule A line 5a source worksheet; spec/federal/schedule-a.yaml. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";
import { calculateStateTaxPaymentsInYear } from "./state-tax-payment-year.js";

interface StateLocalIncomeTaxDeductionResult {
  w2StateWithholding: Decimal;
  w2LocalWithholding: Decimal;
  nonW2Withholding: Decimal;
  deductedElsewhere: Decimal;
  statePaymentsInYear: Decimal;
  additionalPayments: Decimal;
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
  const w2StateWithholding = sum(...input.w2s.map(form => actualAmount(form.stateTaxWithheld, "W2 state withholding")));
  const w2LocalWithholding = sum(...input.w2s.map(form => actualAmount(form.localTaxWithheld, "W2 local withholding")));
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
  const allocation = input.scheduleA?.nonW2IncomeTaxesDeductedElsewhere;
  if (input.taxpayer.taxYear === 2026 && nonW2Withholding.gt(0) && allocation === undefined) {
    throw new Error("Actual non-W2 income taxes deducted on other schedules are unknown");
  }
  const deductedElsewhere = actualAmount(allocation, "Non-W2 income taxes deducted elsewhere");
  if (deductedElsewhere.gt(nonW2Withholding)) throw new Error("Another-schedule tax deduction exceeds actual non-W2 withholding");
  const statePaymentsInYear = calculateStateTaxPaymentsInYear(input);
  const additionalPayments = actualAmount(input.scheduleA?.additionalStateLocalIncomeTaxes, "Additional income-tax payments");
  const total = sum(w2StateWithholding, w2LocalWithholding, nonW2Withholding, statePaymentsInYear, additionalPayments).minus(deductedElsewhere);
  audit.record("SALT Income Tax WS", "total", "Qualified state and local income taxes", total,
    "W2 state/local + non-W2 state/local + in-year payments/applied credits + separate additional payments − non-W2 withholding deducted elsewhere", {
      "W2 state": w2StateWithholding, "W2 local": w2LocalWithholding, "Non-W2": nonW2Withholding,
      "Deducted elsewhere": deductedElsewhere, "In-year payments/applied credits": statePaymentsInYear, "Additional payments": additionalPayments,
    });
  return { w2StateWithholding, w2LocalWithholding, nonW2Withholding, deductedElsewhere, statePaymentsInYear, additionalPayments, total, lines: audit.getLines() };
}
