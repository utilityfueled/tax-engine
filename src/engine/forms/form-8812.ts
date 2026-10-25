/** Schedule 8812 — spec/federal/form-8812.yaml; source-backed 2025/2026 worksheets. */
import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { FilingStatus, YearConstants } from "@/models/constants.js";
import { zeroFloor, min, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface Form8812Input {
  taxYear?: number;
  /** Counts already verified for age, dependency, citizenship and timely tax identifiers. */
  qualifyingChildren: number;
  otherDependents: number;
  /** Schedule 8812 line 3 MAGI, including section 911/931/933 addbacks. */
  agi: Decimal;
  earnedIncome: Decimal;
  /** Credit Limit Worksheet A line 5, after the Worksheet B interaction if applicable. */
  taxLiability: Decimal;
  filingStatus: FilingStatus;
  filesForm2555?: boolean;
  bonaFidePuertoRicoResident?: boolean;
  /** Line 21 after the Additional Medicare/RRTA worksheet, if required. */
  payrollTaxes?: Decimal;
  /** Schedule 1 line 15 and Schedule 2 lines 5, 6 and 13. */
  additionalPayrollTaxes?: Decimal;
  earnedIncomeCredit?: Decimal;
  excessSocialSecurityWithholding?: Decimal;
}

export interface Form8812Result {
  ctcBeforeLimitation: Decimal;
  nonrefundableCTC: Decimal;
  unusedCTC: Decimal;
  earnedIncomeExcess: Decimal;
  fifteenPercent: Decimal;
  payrollAlternative: Decimal;
  /** ACTC available before the actual nonrefundable-credit allocation. */
  potentialActc: Decimal;
  /** Credit Limit Worksheet B line 14, used in adoption/clean-energy credit limits. */
  creditLimitWorksheetBReservation: Decimal;
  actc: Decimal;
  lines: CalculatedLine[];
}

export function calculateForm8812(input: Form8812Input, constants: YearConstants): Form8812Result {
  const audit = new AuditTrail();
  const year = input.taxYear ?? 2025;
  if (year !== 2025 && year !== 2026) throw new Error("Unsupported Schedule 8812 tax year");
  for (const count of [input.qualifyingChildren, input.otherDependents]) {
    if (!Number.isInteger(count) || count < 0) throw new Error("Invalid dependent count for Schedule 8812");
  }
  for (const amount of [input.agi, input.earnedIncome, input.taxLiability]) {
    if (!amount.isFinite()) throw new Error("Schedule 8812 amount must be finite");
  }
  const ctc = constants.childTaxCredit;
  const maxCTC = ctc.perChild.times(input.qualifyingChildren);
  const maxODC = ctc.otherDependentCredit.times(input.otherDependents);
  const threshold = ctc.phaseOutThreshold[input.filingStatus];
  const thousandsOver = zeroFloor(input.agi.minus(threshold)).div(1000).ceil();
  const reduction = thousandsOver.times(ctc.phaseOutRate);
  const ctcBeforeLimitation = zeroFloor(maxCTC.plus(maxODC).minus(reduction));
  const nonrefundableCTC = min(ctcBeforeLimitation, zeroFloor(roundDollar(input.taxLiability)));
  const unusedCTC = ctcBeforeLimitation.minus(nonrefundableCTC);
  const maxRefundable = (ctc.refundablePerChild ?? new Decimal("1700")).times(input.qualifyingChildren);
  const earnedIncomeExcess = zeroFloor(input.earnedIncome.minus("2500"));
  const fifteenPercent = roundDollar(earnedIncomeExcess.times("0.15"));
  const alternateApplies = input.qualifyingChildren >= 3 || (input.qualifyingChildren > 0 && input.bonaFidePuertoRicoResident === true);
  const payrollAmounts = [input.payrollTaxes, input.additionalPayrollTaxes, input.earnedIncomeCredit, input.excessSocialSecurityWithholding];
  if (alternateApplies && year === 2026 && !input.filesForm2555 && fifteenPercent.lt(Decimal.min(ctcBeforeLimitation, maxRefundable)) && payrollAmounts.some(value => value === undefined)) {
    throw new Error("2026 Schedule 8812 payroll alternative requires known payroll, EIC and excess withholding facts");
  }
  for (const amount of payrollAmounts) {
    if (amount !== undefined && (!amount.isFinite() || amount.lt(0))) throw new Error("Invalid Schedule 8812 payroll/refund amount");
  }
  const payroll = roundDollar(input.payrollTaxes ?? new Decimal(0));
  const additionalPayroll = roundDollar(input.additionalPayrollTaxes ?? new Decimal(0));
  const payrollOffsets = roundDollar((input.earnedIncomeCredit ?? new Decimal(0)).plus(input.excessSocialSecurityWithholding ?? new Decimal(0)));
  const payrollAlternative = alternateApplies ? zeroFloor(payroll.plus(additionalPayroll).minus(payrollOffsets)) : new Decimal(0);
  const incomeLimit = Decimal.max(fifteenPercent, payrollAlternative);
  const potentialActc = input.filesForm2555 ? new Decimal(0) : Decimal.min(ctcBeforeLimitation, maxRefundable, incomeLimit);
  const actc = Decimal.min(unusedCTC, potentialActc);
  const creditLimitWorksheetBReservation = zeroFloor(ctcBeforeLimitation.minus(potentialActc));
  for (const [line, description, value, formula] of [
    ["3", "Modified adjusted gross income", input.agi, "AGI plus section 911/931/933 addbacks"],
    ["4", "Qualifying children", new Decimal(input.qualifyingChildren), "Verified CTC children"],
    ["5", "Child tax credit before phaseout", maxCTC, "Line 4 × indexed child amount"],
    ["6", "Other dependents", new Decimal(input.otherDependents), "Verified ODC dependents"],
    ["7", "Other dependent credit", maxODC, "Line 6 × $500"],
    ["8", "Combined credit before phaseout", maxCTC.plus(maxODC), "Lines 5 + 7"],
    ["9", "MAGI threshold", threshold, "Filing-status threshold"],
    ["10", "MAGI excess rounded up to $1,000", thousandsOver.times(1000), "ceil(max(0, line 3 - line 9)/1000) × 1000"],
    ["11", "Credit phaseout", reduction, "Line 10 × 5%"],
    ["12", "CTC/ODC before limitation", ctcBeforeLimitation, "max(0, line 8 - line 11)"],
    ["13", "Credit Limit Worksheet A", zeroFloor(roundDollar(input.taxLiability)), "Worksheet A line 5"],
    ["14", "Nonrefundable CTC/ODC", nonrefundableCTC, "min(line 12, line 13)"],
    ["16a", "Unused CTC/ODC", unusedCTC, "Line 12 - line 14"],
    ["16b", "Refundable cap for qualifying children", maxRefundable, "Qualifying children × indexed refundable amount"],
    ["17", "Credit available for ACTC", Decimal.min(unusedCTC,maxRefundable), "min(lines 16a,16b)"],
    ["18a", "Earned income for ACTC", input.earnedIncome, "Earned income worksheet"],
    ["19", "Earned income above $2,500", earnedIncomeExcess, "max(0, line 18a - 2500)"],
    ["20", "Earned-income ACTC limit", fifteenPercent, "round(line 19 × 0.15)"],
    ["21", "Payroll taxes", alternateApplies ? payroll : new Decimal(0), "Additional Medicare/RRTA worksheet if applicable"],
    ["22", "SE and unreported payroll taxes", alternateApplies ? additionalPayroll : new Decimal(0), "Schedule 1 line 15 + Schedule 2 lines 5,6,13"],
    ["23", "Combined payroll taxes", alternateApplies ? payroll.plus(additionalPayroll) : new Decimal(0), "Lines 21 + 22"],
    ["24", "Payroll alternative offsets", alternateApplies ? payrollOffsets : new Decimal(0), "EIC + excess social security withholding"],
    ["25", "Payroll alternative", payrollAlternative, "max(0, line 23 - line 24), when eligible"],
    ["26", "Larger ACTC income limit", incomeLimit, "max(lines 20,25)"],
    ["27", "Additional Child Tax Credit", actc, input.filesForm2555 ? "Form 2555 disallows ACTC" : "min(lines 17,26)"],
  ] as const) audit.record("Form 8812", line, description, value, formula);
  return {ctcBeforeLimitation, nonrefundableCTC, unusedCTC, earnedIncomeExcess, fifteenPercent, payrollAlternative, potentialActc, creditLimitWorksheetBReservation, actc, lines:audit.getLines()};
}
