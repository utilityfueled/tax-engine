import Decimal from "decimal.js";
import { FilingStatusSchema, type FilingStatus } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum, zeroFloor } from "@/utils/decimal.js";

type Eligibility = "yes" | "no" | "unknown";
type Amount = string | Decimal;

export interface DraftSchedule3AInput {
  taxYear: 2026;
  returnForm: "1040" | "1040-SR";
  filingStatus: FilingStatus;
  earnedIncomeCredit: Amount;
  additionalChildTaxCredit: Amount;
  refundableAmericanOpportunityCredit: Amount;
  refundableAdoptionCredit: Amount;
  schedule3Payments: Amount;
  totalTaxBeforeForm1062: Amount;
  schedule2Line20: Amount;
  benefitElection?: "receive" | "decline";
  taxpayerEligibility?: Eligibility;
  spouseEligibility?: Eligibility;
}

interface DraftSchedule3AResult {
  status: "not-required" | "no-benefit" | "needs-election" | "declined" | "needs-eligibility" | "eligible" | "ineligible";
  form1040Line32b?: Decimal;
  form1040Line32c?: Decimal;
  lines: CalculatedLine[];
}

function sourceAmount(value: Amount, line: string): Decimal {
  if (typeof value === "string" && /^\d{1,12}(?:\.\d{1,2})?$/u.test(value)) {
    return d(value);
  }
  if (Decimal.isDecimal(value) && value.isFinite() && value.gte(0) && value.lt("1000000000000") && value.decimalPlaces() <= 2) {
    return value;
  }
  throw new Error(`Draft Schedule 3-A requires a confirmed nonnegative dollar and cent amount for ${line}`);
}

/** Isolated 2026 draft worksheet for Form 1040/1040-SR. See spec/federal/schedule-3-a-draft.yaml. */
export function calculateDraftSchedule3A(input: DraftSchedule3AInput): DraftSchedule3AResult {
  if (input.taxYear !== 2026 || (input.returnForm !== "1040" && input.returnForm !== "1040-SR")
    || !FilingStatusSchema.safeParse(input.filingStatus).success) {
    throw new Error("Draft Schedule 3-A requires a supported 2026 Form 1040 or 1040-SR source");
  }
  const joint = input.filingStatus === "married_filing_jointly";
  if (!joint && input.spouseEligibility !== undefined) {
    throw new Error("Draft Schedule 3-A accepts a spouse's answer only on a joint return");
  }
  if (![undefined, "receive", "decline"].includes(input.benefitElection)
    || [input.taxpayerEligibility, input.spouseEligibility].some(answer => ![undefined, "yes", "no", "unknown"].includes(answer))) {
    throw new Error("Draft Schedule 3-A requires explicit election and eligibility answers");
  }

  const coveredCredits = sum(
    sourceAmount(input.earnedIncomeCredit, "Form 1040 line 27a"),
    sourceAmount(input.additionalChildTaxCredit, "Form 1040 line 28"),
    sourceAmount(input.refundableAmericanOpportunityCredit, "Form 1040 line 29"),
    sourceAmount(input.refundableAdoptionCredit, "Form 1040 line 30"),
  );
  const otherPayments = sourceAmount(input.schedule3Payments, "Form 1040 line 31");
  const totalTax = sourceAmount(input.totalTaxBeforeForm1062, "Form 1040 line 24a");
  const excludedTax = sourceAmount(input.schedule2Line20, "Schedule 2 line 20");
  if (excludedTax.gt(totalTax)) {
    throw new Error("Draft Schedule 3-A requires Schedule 2 line 20 to be no greater than Form 1040 line 24a");
  }
  if (coveredCredits.isZero()) {
    return { status: "not-required", form1040Line32c: otherPayments, lines: [] };
  }

  const audit = new AuditTrail();
  const record = (line: string, description: string, value: Decimal, formula: string) =>
    audit.record("Schedule 3-A (draft)", line, description, value, formula);
  const line1a = record("1a", "Total credits and other payments", coveredCredits.plus(otherPayments), "Form 1040 line 32a");
  record("1b", "Schedule 3 payments", otherPayments, "Form 1040 line 31");
  const line2 = record("2", "Covered refundable credits", line1a.minus(otherPayments), "Line 1a minus line 1b");
  record("3", "Total tax before the Form 1062 transfer", totalTax, "Form 1040 line 24a");
  record("4", "Excluded tax", excludedTax, "Schedule 2 line 20");
  const line5 = record("5", "Tax for comparison", totalTax.minus(excludedTax), "Line 3 minus line 4");
  const line6 = record("6", "Federal public benefit", zeroFloor(line2.minus(line5)), "Greater of zero or line 2 minus line 5");
  const resolve = (status: DraftSchedule3AResult["status"], adjustment: Decimal): DraftSchedule3AResult => ({
    status, form1040Line32b: adjustment, form1040Line32c: line1a.minus(adjustment), lines: audit.getLines(),
  });

  if (line6.isZero()) return resolve("no-benefit", line6);
  if (input.benefitElection === undefined) return { status: "needs-election", lines: audit.getLines() };
  if (input.benefitElection === "decline") return resolve("declined", line6);

  const answers = joint ? [input.taxpayerEligibility, input.spouseEligibility] : [input.taxpayerEligibility];
  const eligible = answers.includes("yes");
  if (!eligible && !answers.every(answer => answer === "no")) {
    return { status: "needs-eligibility", lines: audit.getLines() };
  }
  const line8 = record("8", "Benefit adjustment", eligible ? d(0) : line6, "Zero or the amount from line 6");
  return resolve(eligible ? "eligible" : "ineligible", line8);
}
