/** Spec: spec/federal/schedule-1-return.yaml */
import Decimal from "decimal.js";
import type { Schedule1Result } from "../schedules/schedule-1.js";
import { AuditTrail } from "@/utils/audit.js";
import { sum } from "@/utils/decimal.js";

export interface Schedule1ReturnSources {
  supplementalIncome: Decimal;
  nolDeduction: Decimal;
  excessBusinessLoss: Decimal;
  digitalAssetIncome: Decimal;
  otherIncomeItems: ReadonlyArray<{ source: string; amount: Decimal }>;
  estateTerminationDeduction: Decimal;
}

/** Finalize physical lines after NOL and passive/source worksheets are complete.
 * This does not rerun or infer their eligibility calculations. */
export function finalizeSchedule1(schedule: Schedule1Result, sources: Schedule1ReturnSources): Schedule1Result {
  const amounts = [sources.supplementalIncome, sources.nolDeduction,
    sources.excessBusinessLoss, sources.digitalAssetIncome, sources.estateTerminationDeduction,
    ...sources.otherIncomeItems.map(item => item.amount)];
  if (amounts.some(amount => !amount.isFinite()) || sources.nolDeduction.lt(0)
    || sources.estateTerminationDeduction.lt(0) || sources.excessBusinessLoss.lt(0)) {
    throw new Error("Schedule1 requires finite completed source amounts and nonnegative deductions");
  }
  if (new Set(sources.otherIncomeItems.map(item => item.source)).size !== sources.otherIncomeItems.length) {
    throw new Error("Schedule1 other income sources must have unique identities");
  }
  const audit = new AuditTrail();
  const replaced = new Set(["5", "8a", "8p", "8v", "8z", "9", "10", "24k", "25", "26"]);
  audit.merge(schedule.lines.filter(line => line.form !== "Sched 1" || !replaced.has(line.line)));
  const otherIncome = sum(...sources.otherIncomeItems.map(item => item.amount));
  const totalOtherIncome = sum(schedule.gamblingIncome, schedule.cancelledDebtIncome,
    schedule.hsaTaxableDistributions, sources.excessBusinessLoss, sources.digitalAssetIncome, otherIncome)
    .minus(sources.nolDeduction).minus(schedule.foreignIncomeExclusion);
  const totalAdditionalIncome = sum(schedule.taxableRefunds, schedule.alimonyReceived,
    schedule.businessIncome, schedule.otherGainsOrLosses, sources.supplementalIncome,
    schedule.farmIncome, schedule.unemploymentCompensation, totalOtherIncome);
  const otherAdjustmentsTotal = schedule.otherAdjustmentsTotal.plus(sources.estateTerminationDeduction);
  const totalAdjustments = schedule.totalAdjustments.plus(sources.estateTerminationDeduction);
  audit.record("Sched 1", "5", "Allowed supplemental income", sources.supplementalIncome,
    "Schedule E income after actual partner-interest and passive-loss worksheets");
  audit.record("Sched 1", "8a", "Net operating loss deduction", sources.nolDeduction.negated(),
    "Negative completed NOL deduction; included once in Line9");
  audit.record("Sched 1", "8p", "Excess business loss", sources.excessBusinessLoss, "Form461 disallowed loss");
  audit.record("Sched 1", "8v", "Ordinary digital asset income", sources.digitalAssetIncome,
    "Actual ordinary digital receipts outside Schedule C");
  audit.record("Sched 1", "8z", "Other income", otherIncome,
    "Sum separately identified other-income sources, including taxable QTP/Coverdell earnings",
    Object.fromEntries(sources.otherIncomeItems.map(item => [item.source, item.amount])));
  audit.record("Sched 1", "9", "Total other income", totalOtherIncome, "Sum Lines8a through8z");
  audit.record("Sched 1", "10", "Total additional income", totalAdditionalIncome, "Sum Lines1 through7 plus9 →1040line8");
  audit.record("Sched 1", "24k", "Estate termination excess deductions", sources.estateTerminationDeduction,
    "Positive final K1(Form1041) Box11CodeA section67(e) deduction");
  audit.record("Sched 1", "25", "Total other adjustments", otherAdjustmentsTotal,
    "Actual other Line24 amounts plus housing24j and estate24k");
  audit.record("Sched 1", "26", "Total adjustments", totalAdjustments, "Sum Lines11 through23 plus25 →1040line10");
  return { ...schedule, supplementalIncome: sources.supplementalIncome,
    nolDeduction: sources.nolDeduction, totalOtherIncome, totalAdditionalIncome,
    otherAdjustmentsTotal, totalAdjustments, lines: audit.getLines() };
}
