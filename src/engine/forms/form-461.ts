/**
 * Form 461 — Limitation on Business Losses
 * Spec: spec/federal/form-461.yaml
 *
 * IRC §461(l) limits aggregate business losses that non-corporate
 * taxpayers can use to offset nonbusiness income. Losses above the
 * threshold ($313,000 / $626,000 MFJ for 2025) are disallowed and
 * treated as an NOL carryforward. The disallowed excess is added
 * back as income on Schedule 1 Line 8p.
 */

import Decimal from "decimal.js";
import type { FilingStatus, YearConstants } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { sum, zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface Form461Input {
  /** W-2 wages (Line 1) */
  totalWages: Decimal;
  /** Schedule C net profit or loss (Line 2) */
  scheduleCNetProfit: Decimal;
  /** Schedule F net farm profit or loss (Line 3) */
  scheduleFNetProfit: Decimal;
  /** Form 4797 ordinary gain or loss (Line 4) */
  form4797OrdinaryGainOrLoss: Decimal;
  /** Nonpassive K-1 income (positive amounts only) */
  nonpassiveK1Income: Decimal;
  /** Nonpassive K-1 loss (negative amounts — entered as negative) */
  nonpassiveK1Loss: Decimal;
  /** Other business income (1099-MISC rents, etc.) */
  otherBusinessIncome: Decimal;
  /** Deductible half of SE tax (Schedule SE Line 13) */
  deductibleSETax: Decimal;
  /** SE health insurance deduction (Schedule 1 Line 17) */
  seHealthInsurance: Decimal;
  /** SE retirement contributions (Schedule 1 Line 16) */
  seRetirementContributions: Decimal;
  /** Prior-year NOL carryforward from excess business losses */
  priorYearEBLNol: Decimal;
}

export interface Form461Result {
  /** Line 1: W-2 wages */
  line1Wages: Decimal;
  /** Line 2: Schedule C net profit or loss */
  line2ScheduleC: Decimal;
  /** Line 3: Schedule F net farm profit or loss */
  line3ScheduleF: Decimal;
  /** Line 4: Form 4797 ordinary gain or loss */
  line4Form4797: Decimal;
  /** Line 5: Nonpassive K-1 income or loss */
  line5NonpassiveK1: Decimal;
  /** Line 7: Other business income */
  line7OtherBusiness: Decimal;
  /** Line 8: Total business income (sum of positive amounts from lines 1-7) */
  line8TotalBusinessIncome: Decimal;
  /** Line 9: Total business deductions from lines above (sum of |negative| from lines 1-7) */
  line9BusinessDeductionsFromLines: Decimal;
  /** Line 10: Deductible SE tax */
  line10DeductibleSETax: Decimal;
  /** Line 11: SE health insurance */
  line11SEHealthInsurance: Decimal;
  /** Line 12: SE retirement contributions */
  line12SERetirement: Decimal;
  /** Line 13: Total business deductions (Line 9 + 10 + 11 + 12) */
  line13TotalBusinessDeductions: Decimal;
  /** Line 14: Net business income or loss (Line 8 - Line 13) */
  line14NetBusinessAmount: Decimal;
  /** Line 15: Threshold amount */
  line15Threshold: Decimal;
  /** Line 16: Excess business loss (disallowed amount) */
  line16ExcessBusinessLoss: Decimal;
  /** NOL carryforward to next year (current excess + prior carryforward) */
  nolCarryforward: Decimal;
  /** Whether Form 461 applies (business loss exceeds threshold) */
  applies: boolean;
  lines: CalculatedLine[];
}

export function calculateForm461(
  input: Form461Input,
  filingStatus: FilingStatus,
  constants: YearConstants
): Form461Result {
  const audit = new AuditTrail();

  // ── Part I: Aggregate business income and deductions ────────

  // Line 1: W-2 wages
  const line1 = roundDollar(input.totalWages);
  audit.record("Form 461", "1", "Taxable wages", line1, "Sum W-2 Box 1");

  // Line 2: Schedule C net profit or loss
  const line2 = roundDollar(input.scheduleCNetProfit);
  audit.record("Form 461", "2", "Schedule C net profit or loss", line2, "Schedule C Line 31");

  // Line 3: Schedule F net farm profit or loss
  const line3 = roundDollar(input.scheduleFNetProfit);
  audit.record("Form 461", "3", "Schedule F net profit or loss", line3, "Schedule F Line 34");

  // Line 4: Form 4797 ordinary gain or loss
  const line4 = roundDollar(input.form4797OrdinaryGainOrLoss);
  audit.record("Form 461", "4", "Form 4797 ordinary gain or loss", line4, "Form 4797");

  // Line 5: Nonpassive K-1 income or loss
  const line5 = roundDollar(input.nonpassiveK1Income.plus(input.nonpassiveK1Loss));
  audit.record("Form 461", "5", "Nonpassive K-1 income or loss", line5,
    `Income ${input.nonpassiveK1Income} + loss ${input.nonpassiveK1Loss}`);

  // Line 7: Other business income
  const line7 = roundDollar(input.otherBusinessIncome);
  audit.record("Form 461", "7", "Other business income", line7, "1099-MISC rents, etc.");

  // Lines 8-9: Separate positive (income) from negative (deduction) amounts
  const lineAmounts = [line1, line2, line3, line4, line5, line7];

  const line8 = lineAmounts
    .filter((amt) => amt.greaterThan(0))
    .reduce((acc, amt) => acc.plus(amt), new Decimal(0));
  audit.record("Form 461", "8", "Total business income", line8,
    "Sum of positive amounts from Lines 1-7");

  const line9 = lineAmounts
    .filter((amt) => amt.lessThan(0))
    .reduce((acc, amt) => acc.plus(amt.abs()), new Decimal(0));
  audit.record("Form 461", "9", "Business deductions from lines above", line9,
    "Sum of |negative| amounts from Lines 1-7");

  // Lines 10-12: Above-the-line business deductions
  const line10 = roundDollar(input.deductibleSETax);
  audit.record("Form 461", "10", "Deductible SE tax", line10, "Schedule SE Line 13");

  const line11 = roundDollar(input.seHealthInsurance);
  audit.record("Form 461", "11", "SE health insurance", line11, "Schedule 1 Line 17");

  const line12 = roundDollar(input.seRetirementContributions);
  audit.record("Form 461", "12", "SE retirement contributions", line12, "Schedule 1 Line 16");

  // Line 13: Total business deductions
  const line13 = sum(line9, line10, line11, line12);
  audit.record("Form 461", "13", "Total business deductions", line13,
    `Line 9 ${line9} + Line 10 ${line10} + Line 11 ${line11} + Line 12 ${line12}`);

  // ── Part II: Excess Business Loss ──────────────────────────

  // Line 14: Net business income or loss
  const line14 = line8.minus(line13);
  audit.record("Form 461", "14", "Net business income or loss", line14,
    `Line 8 ${line8} - Line 13 ${line13}`);

  // Line 15: Threshold
  const line15 = constants.excessBusinessLoss.threshold[filingStatus];
  audit.record("Form 461", "15", "Threshold amount", line15,
    `IRC §461(l)(3)(A)(ii) for ${filingStatus}`);

  // Line 16: Excess business loss
  // Only applies when net business amount is a loss (negative)
  let line16 = new Decimal(0);
  if (line14.isNegative()) {
    line16 = zeroFloor(line14.abs().minus(line15));
  }
  audit.record("Form 461", "16", "Excess business loss", line16,
    line14.isNegative()
      ? `max(0, |${line14}| - ${line15}) = max(0, ${line14.abs()} - ${line15})`
      : "No excess — net business amount is not a loss");

  // NOL carryforward: current excess + prior year carryforward
  const nolCarryforward = line16.plus(input.priorYearEBLNol);
  if (nolCarryforward.greaterThan(0)) {
    audit.record("Form 461", "NOL", "NOL carryforward from EBL", nolCarryforward,
      `Current excess ${line16} + prior year ${input.priorYearEBLNol}`);
  }

  return {
    line1Wages: line1,
    line2ScheduleC: line2,
    line3ScheduleF: line3,
    line4Form4797: line4,
    line5NonpassiveK1: line5,
    line7OtherBusiness: line7,
    line8TotalBusinessIncome: line8,
    line9BusinessDeductionsFromLines: line9,
    line10DeductibleSETax: line10,
    line11SEHealthInsurance: line11,
    line12SERetirement: line12,
    line13TotalBusinessDeductions: line13,
    line14NetBusinessAmount: line14,
    line15Threshold: line15,
    line16ExcessBusinessLoss: line16,
    nolCarryforward,
    applies: line16.greaterThan(0),
    lines: audit.getLines(),
  };
}
