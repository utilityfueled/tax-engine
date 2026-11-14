/** Pennsylvania farmer estimated tax timing. Spec: spec/state/pa-2026-farmer-estimated-tax.yaml. */
import type Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d } from "@/utils/decimal.js";

interface FarmerTaxTimingInput {
  taxYear: number;
  calendarYearConfirmed: boolean;
  individualGrossEstimatesConfirmed: boolean;
  estimatedGrossFarmIncome: string;
  estimatedTotalGrossIncome: string;
}

type FarmerDeadline =
  | { action: "declare_and_pay_full_estimate"; dueDate: "2027-01-15" }
  | { action: "file_return_and_pay_full_tax"; dueDate: "2027-03-01" };

interface FarmerTaxTiming {
  meetsFarmerIncomeTest: boolean;
  options: FarmerDeadline[];
  lines: CalculatedLine[];
}

function grossAmount(value: unknown): Decimal {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/u.test(value)) {
    throw new TypeError("Enter a confirmed nonnegative gross income amount in dollars and cents.");
  }
  return d(value);
}

/** Calculate the § 325(e) income test and timing choices for one calendar-year 2026 individual. */
export function estimatePennsylvania2026FarmerTaxTiming(input: FarmerTaxTimingInput): FarmerTaxTiming {
  if (input?.taxYear !== 2026 || input.calendarYearConfirmed !== true ||
    input.individualGrossEstimatesConfirmed !== true) {
    throw new TypeError("Confirm 2026 calendar-year gross income estimates for this individual.");
  }

  const farmGross = grossAmount(input.estimatedGrossFarmIncome);
  const totalGross = grossAmount(input.estimatedTotalGrossIncome);
  if (farmGross.gt(totalGross)) throw new RangeError("Gross farm income cannot exceed total gross income.");

  const threeTimesFarmGross = farmGross.times(3);
  const twiceTotalGross = totalGross.times(2);
  const meetsFarmerIncomeTest = totalGross.gt(0) && threeTimesFarmGross.gte(twiceTotalGross);
  const audit = new AuditTrail();
  audit.record(
    "PA REV-413(I)", "farmer-income-test", "2026 Pennsylvania farmer gross income test",
    d(meetsFarmerIncomeTest ? 1 : 0),
    "Total gross > 0 and farm gross × 3 ≥ total gross × 2",
    {
      "Estimated gross farm income": farmGross,
      "Estimated total gross income": totalGross,
      "Estimated gross farm income × 3": threeTimesFarmGross,
      "Estimated total gross income × 2": twiceTotalGross,
    },
  );

  return {
    meetsFarmerIncomeTest,
    options: meetsFarmerIncomeTest ? [
      { action: "declare_and_pay_full_estimate", dueDate: "2027-01-15" },
      { action: "file_return_and_pay_full_tax", dueDate: "2027-03-01" },
    ] : [],
    lines: audit.getLines(),
  };
}
