/**
 * Illinois IL-1040 Individual Income Tax Return
 * Spec: spec/state/il-1040.yaml
 *
 * Illinois imposes a flat 4.95% tax on net income. Starts from federal AGI,
 * applies IL additions/subtractions to get base income, deducts exemptions,
 * and applies the flat rate. Credits include property tax, K-12 education,
 * IL EITC (20% of federal), and IL Child Tax Credit (40% of IL EITC).
 */

import Decimal from "decimal.js";
import { zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";
import {
  IL_1040_CONSTANTS,
  type FilingStatus,
  type Illinois1040Constants,
} from "@/models/constants.js";
import { calculateScheduleICR, type ScheduleICRInput, type ScheduleICRResult } from "./il-schedule-icr.js";
import { calculateScheduleM, type ScheduleMInput, type ScheduleMResult } from "./il-schedule-m.js";
import { calculateScheduleCR, type ScheduleCRInput, type ScheduleCRResult } from "./il-schedule-cr.js";
import {
  calculateIL2210,
  type IL2210AnnualizedInstallmentMethodInput,
  type IL2210Result,
} from "./il-2210.js";
import { calculateScheduleNR, type ScheduleNRInput, type ScheduleNRResult } from "./il-schedule-nr.js";
import { calculateScheduleEEIC, type ScheduleEEICInput, type ScheduleEEICResult } from "./il-schedule-e-eic.js";
import { calculateUseTaxWorksheet, type UseTaxWorksheetInput, type UseTaxWorksheetResult } from "./il-use-tax.js";
import {
  calculateILScheduleWIT,
  type ILScheduleWITRecord,
  type ILScheduleWITResult,
} from "./il-schedule-il-wit.js";
import { calculateScheduleG, type ScheduleGInput, type ScheduleGResult } from "./il-schedule-g.js";
import {
  calculateSchedule1299C,
  type Schedule1299CAttachmentInput,
  type Schedule1299CResult,
} from "./il-schedule-1299-c.js";

export type ILConstants = Illinois1040Constants;
export const IL_CONSTANTS = IL_1040_CONSTANTS;

export type ILRefundMethod = "direct_deposit" | "paper_check";
export type ILDirectDepositAccountType = "checking" | "savings";
export type ILDirectDepositDestination =
  | "checking_or_savings"
  | "bright_start"
  | "bright_directions";

export interface ILHealthInsuranceCheckboxInput {
  selfUninsured: boolean;
  spouseUninsured: boolean;
  dependentsUninsured: boolean;
}

export interface ILHealthInsuranceCheckboxResult extends ILHealthInsuranceCheckboxInput {
  authorized: boolean;
}

export interface ILDirectDepositInput {
  routingNumber: string;
  accountType: ILDirectDepositAccountType;
  accountNumber: string;
}

export interface ILDirectDepositDetails extends ILDirectDepositInput {
  destination: ILDirectDepositDestination;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface IL1040Input {
  taxYear: number;
  filingStatus: FilingStatus;

  // Federal results
  federalAGI: Decimal;
  federalEIC: Decimal;

  // Step 2 — Additions
  /** Federal Form 1040, Line 2a — tax-exempt interest */
  taxExemptInterest: Decimal;
  /** Schedule M additions (other additions to AGI) */
  otherAdditions: Decimal;

  // Step 3 — Subtractions
  /** Retirement/SS income included in federal AGI (IL-1040 Line 5) */
  retirementIncomeSubtraction: Decimal;
  /** Prior-year IL refund included in federal AGI (IL-1040 Line 6) */
  ilRefundSubtraction: Decimal;
  /** Schedule M subtractions (other subtractions) */
  otherSubtractions: Decimal;

  // Step 4 — Exemptions
  /** Whether taxpayer is claimed as a dependent on another return */
  claimedAsDependent: boolean;
  /** For MFJ: whether only one or both spouses are claimed as dependents */
  spouseClaimedAsDependent?: boolean;
  /** Number of persons age 65+ (0, 1, or 2 for MFJ) */
  age65OrOlderCount: number;
  /** Number of legally blind persons (0, 1, or 2 for MFJ) */
  blindCount: number;
  /** Number of dependents */
  dependentCount: number;

  // Step 5 — Line 13 recapture (rare)
  investmentCreditRecapture: Decimal;

  // Step 6 — Nonrefundable credits
  /** Credit for tax paid to other states (Schedule CR) — use raw amount or scheduleCR */
  otherStateCredit: Decimal;
  /** Schedule 1299-C credit */
  schedule1299CCredit: Decimal;
  /** Attached Schedule 1299-C Step 3 credit grid */
  schedule1299C?: Schedule1299CAttachmentInput;

  // Schedule CR inputs (optional — if provided, computes Line 15 from schedule)
  scheduleCR?: ScheduleCRInput;

  // Schedule M inputs (optional — if provided, computes Lines 3 and 7)
  scheduleM?: ScheduleMInput;

  // Schedule ICR inputs
  scheduleICR?: ScheduleICRInput;

  // Schedule G inputs (optional — if provided, computes Line 35)
  scheduleG?: ScheduleGInput;

  // Schedule IL-E/EIC inputs (optional — if provided, computes EITC/CTC/dependent count)
  scheduleEEIC?: ScheduleEEICInput;

  // Schedule NR inputs (nonresident / part-year resident)
  scheduleNR?: ScheduleNRInput;

  // Use Tax Worksheet (optional — if provided, computes Line 21 from worksheet)
  useTaxWorksheet?: UseTaxWorksheetInput;

  // Step 7 — Other taxes
  householdEmploymentTax: Decimal;
  useTax: Decimal;
  compassionateUseSurcharge: Decimal;

  // Step 8 — Payments
  ilWithholding: Decimal;
  scheduleILWIT?: {
    records: ILScheduleWITRecord[];
  };
  estimatedPayments: Decimal;
  passThroughWithholding: Decimal;
  passThroughEntityTaxCredit: Decimal;
  voluntaryCharitableDonations?: Decimal;
  refundAmountRequested?: Decimal;
  refundMethod?: ILRefundMethod;
  directDeposit?: ILDirectDepositInput;
  creditForwardAmount?: Decimal;
  firstYearIllinoisReturn?: boolean;
  healthInsuranceCheckbox?: ILHealthInsuranceCheckboxInput;

  // IL Child Tax Credit eligibility
  /** Whether taxpayer has at least one dependent child under age 12 */
  hasChildUnder12: boolean;

  // IL-2210 underpayment penalty (optional)
  il2210?: {
    /** Prior year IL tax liability (net of refundable credits) */
    priorYearTax: Decimal;
    /** Whether a prior year IL return was filed for a full 12-month period */
    priorYearReturnFiled: boolean;
    /** IL-1040 Line 34a checkbox */
    qualifiesAsFarmer?: boolean;
    /** IL-1040 Line 34b checkbox */
    is65OrOlderAndPermanentlyInNursingHome?: boolean;
    /** IL-1040 Line 34d checkbox */
    notRequiredToFilePriorYearReturn?: boolean;
    /** Estimated payments by quarter [Q1, Q2, Q3, Q4] */
    estimatedPaymentsByQuarter: [Decimal, Decimal, Decimal, Decimal];
    /** Optional Step 6 annualized income installment worksheet inputs */
    annualizedInstallmentMethod?: IL2210AnnualizedInstallmentMethodInput;
  };
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface IL1040Result {
  // Income
  federalAGI: Decimal;
  taxExemptInterest: Decimal;
  otherAdditions: Decimal;
  totalIncome: Decimal; // Line 4

  // Base income
  retirementIncomeSubtraction: Decimal;
  ilRefundSubtraction: Decimal;
  otherSubtractions: Decimal;
  totalSubtractions: Decimal; // Line 8
  baseIncome: Decimal; // Line 9

  // Exemptions
  personalExemption: Decimal; // Line 10a
  age65Exemption: Decimal; // Line 10b
  blindExemption: Decimal; // Line 10c
  dependentExemption: Decimal; // Line 10d
  totalExemptions: Decimal; // Line 10

  // Tax
  netIncome: Decimal; // Line 11
  incomeTax: Decimal; // Line 12
  investmentCreditRecapture: Decimal; // Line 13
  totalIncomeTax: Decimal; // Line 14

  // Credits
  otherStateCredit: Decimal; // Line 15
  scheduleICRCredit: Decimal; // Line 16
  schedule1299CCredit: Decimal; // Line 17
  totalNonrefundableCredits: Decimal; // Line 18
  taxAfterCredits: Decimal; // Line 19

  // Other taxes
  householdEmploymentTax: Decimal;
  useTax: Decimal;
  compassionateUseSurcharge: Decimal;
  underpaymentPenalty: Decimal; // Line 34
  totalTax: Decimal; // Line 24

  // Payments and refundable credits
  ilWithholding: Decimal; // Line 25
  estimatedPayments: Decimal; // Line 26
  passThroughWithholding: Decimal; // Line 27
  passThroughEntityTaxCredit: Decimal; // Line 28
  ilEITC: Decimal; // Line 29
  ilChildTaxCredit: Decimal; // Line 30
  totalPayments: Decimal; // Line 31

  // Result
  preliminaryOverpayment: Decimal; // Line 32
  preliminaryTaxDue: Decimal; // Line 33
  voluntaryCharitableDonations: Decimal; // Line 35
  totalPenaltyAndDonations: Decimal; // Line 36
  overpayment: Decimal; // Line 37
  refund: Decimal; // Line 38
  refundMethod?: ILRefundMethod; // Line 39
  directDeposit?: ILDirectDepositDetails;
  creditCarryforward: Decimal; // Line 40
  taxDue: Decimal; // Line 41
  healthInsuranceCheckbox?: ILHealthInsuranceCheckboxResult; // Line 42

  // Sub-results
  scheduleM?: ScheduleMResult;
  scheduleICR?: ScheduleICRResult;
  scheduleG?: ScheduleGResult;
  scheduleCR?: ScheduleCRResult;
  schedule1299C?: Schedule1299CResult;
  scheduleEEIC?: ScheduleEEICResult;
  scheduleNR?: ScheduleNRResult;
  scheduleILWIT?: ILScheduleWITResult;
  il2210?: IL2210Result;
  useTaxWorksheet?: UseTaxWorksheetResult;

  /** Schedule NR allocation decimal (for EITC/CTC allocation) */
  allocationDecimal?: Decimal;

  // Audit
  lines: CalculatedLine[];
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

export function calculateIL1040(input: IL1040Input): IL1040Result {
  const c = IL_CONSTANTS[input.taxYear];
  if (!c) {
    throw new Error(`IL constants not available for tax year ${input.taxYear}`);
  }

  const voluntaryCharitableDonations = input.voluntaryCharitableDonations ?? new Decimal(0);
  const audit = new AuditTrail();
  const FORM = "IL-1040";
  validateHealthInsuranceCheckbox(input.filingStatus, input.healthInsuranceCheckbox);

  // ---- Schedule M (if provided) ----
  let scheduleMResult: ScheduleMResult | undefined;
  if (input.scheduleM) {
    scheduleMResult = calculateScheduleM(input.scheduleM);
    audit.merge(scheduleMResult.lines);
  }

  // Schedule IL-WIT determines the same withholding amount used for Line 25
  // and any downstream penalty computation.
  let scheduleILWITResult: ILScheduleWITResult | undefined;
  let line25Value = input.ilWithholding;
  if (input.scheduleILWIT) {
    scheduleILWITResult = calculateILScheduleWIT({
      filingStatus: input.filingStatus,
      records: input.scheduleILWIT.records,
    });
    line25Value = scheduleILWITResult.totalWithholding;
    audit.merge(scheduleILWITResult.lines);
  }

  // ---- Step 2: Income ----
  const line1 = audit.record(FORM, "1", "Federal adjusted gross income", input.federalAGI, "Federal Form 1040, Line 11", { federalAGI: input.federalAGI });

  const line2 = audit.record(FORM, "2", "Federally tax-exempt interest and dividend income", input.taxExemptInterest, "Federal Form 1040, Line 2a", { taxExemptInterest: input.taxExemptInterest });

  // Line 3: use Schedule M total additions if available, else raw input
  const line3Value = scheduleMResult ? scheduleMResult.totalAdditions : input.otherAdditions;
  const line3 = audit.record(FORM, "3", "Other additions", line3Value, scheduleMResult ? "Schedule M, Line 12" : "Input", { otherAdditions: line3Value });

  const line4 = audit.record(FORM, "4", "Total income", line1.plus(line2).plus(line3), "Line 1 + Line 2 + Line 3", { line1, line2, line3 });

  // ---- Step 3: Base Income ----
  const line5 = audit.record(FORM, "5", "Social Security and retirement plan income subtraction", input.retirementIncomeSubtraction, "Qualifying retirement income in federal AGI", { retirementIncomeSubtraction: input.retirementIncomeSubtraction });

  const line6 = audit.record(FORM, "6", "Illinois Income Tax overpayment", input.ilRefundSubtraction, "Prior-year IL refund in federal AGI", { ilRefundSubtraction: input.ilRefundSubtraction });

  // Line 7: use Schedule M total subtractions if available, else raw input
  const line7Value = scheduleMResult ? scheduleMResult.totalSubtractions : input.otherSubtractions;
  const line7 = audit.record(FORM, "7", "Other subtractions", line7Value, scheduleMResult ? "Schedule M, Line 42" : "Input", { otherSubtractions: line7Value });

  const line8 = audit.record(FORM, "8", "Total subtractions", line5.plus(line6).plus(line7), "Line 5 + Line 6 + Line 7", { line5, line6, line7 });

  const line9 = audit.record(FORM, "9", "Illinois base income", zeroFloor(line4.minus(line8)), "max(Line 4 - Line 8, 0)", { line4, line8 });

  // ---- Step 4: Exemptions ----
  const isMFJ = input.filingStatus === "married_filing_jointly";
  const agiThresholdKey = isMFJ ? "mfj" : "other";
  const maxAdditionalExemptionCount = isMFJ ? 2 : 1;

  validateAdditionalExemptionCount(
    input.age65OrOlderCount,
    maxAdditionalExemptionCount,
    "10b",
    "age 65",
    isMFJ,
  );
  validateAdditionalExemptionCount(
    input.blindCount,
    maxAdditionalExemptionCount,
    "10c",
    "blind",
    isMFJ,
  );

  // Check AGI exemption threshold
  const exemptionsDenied = input.federalAGI.greaterThan(c.exemptionAGIThreshold[agiThresholdKey]);

  const line10a = exemptionsDenied
    ? new Decimal(0)
    : computePersonalExemption(
        input.filingStatus,
        input.claimedAsDependent,
        input.spouseClaimedAsDependent ?? false,
        line9,
        c
      );
  audit.record(FORM, "10a", "Personal exemption allowance", line10a, "Based on filing status and dependent status", { filingStatus: input.filingStatus, claimedAsDependent: String(input.claimedAsDependent) });

  const line10b = exemptionsDenied
    ? new Decimal(0)
    : c.additionalExemption65OrBlind.times(input.age65OrOlderCount);
  audit.record(FORM, "10b", "Additional exemption for age 65+", line10b, "$1,000 × count age 65+", { count: new Decimal(input.age65OrOlderCount) });

  const line10c = exemptionsDenied
    ? new Decimal(0)
    : c.additionalExemption65OrBlind.times(input.blindCount);
  audit.record(FORM, "10c", "Additional exemption for legally blind", line10c, "$1,000 × count blind", { count: new Decimal(input.blindCount) });

  if (!input.scheduleEEIC && input.dependentCount > 0) {
    throw new Error("IL-1040 Schedule IL-E/EIC is required when claiming dependent exemptions on Line 10d");
  }

  const preliminaryScheduleEEICResult = input.scheduleEEIC
    ? calculateScheduleEEIC(input.scheduleEEIC)
    : undefined;

  // Line 10d: Illinois requires the dependent count from Schedule IL-E/EIC Step 2, Line 1.
  const effectiveDependentCount = input.scheduleEEIC
    ? input.scheduleEEIC.dependents.length
    : 0;

  const line10d = exemptionsDenied
    ? new Decimal(0)
    : preliminaryScheduleEEICResult?.dependentExemptionAllowance ?? new Decimal(0);
  audit.record(
    FORM,
    "10d",
    "Dependent exemption allowance",
    line10d,
    input.scheduleEEIC ? "Schedule IL-E/EIC, Step 2, Line 1" : "$0",
    {
      dependentCount: new Decimal(effectiveDependentCount),
      scheduleEEICLine1: preliminaryScheduleEEICResult?.dependentExemptionAllowance ?? new Decimal(0),
    },
  );

  const line10 = audit.record(FORM, "10", "Total exemptions", line10a.plus(line10b).plus(line10c).plus(line10d), "Line 10a + 10b + 10c + 10d", { line10a, line10b, line10c, line10d });

  // ---- Schedule NR (if nonresident / part-year) ----
  let scheduleNRResult: ScheduleNRResult | undefined;
  let nrAllocationDecimal: Decimal | undefined;
  if (input.scheduleNR) {
    scheduleNRResult = calculateScheduleNR({
      ...input.scheduleNR,
      fullBaseIncome: line9,
      totalExemptions: line10,
    });
    nrAllocationDecimal = scheduleNRResult.allocationDecimal;
    audit.merge(scheduleNRResult.lines);
  }

  // ---- Step 5: Net Income and Tax ----
  // If Schedule NR is attached, use NR-computed values for Lines 11 and 12
  const line11 = scheduleNRResult
    ? audit.record(FORM, "11", "Net income", scheduleNRResult.ilNetIncome, "Schedule NR, Line 51", { scheduleNR: scheduleNRResult.ilNetIncome })
    : audit.record(FORM, "11", "Net income", zeroFloor(line9.minus(line10)), "max(Line 9 - Line 10, 0)", { line9, line10 });

  const line12 = scheduleNRResult
    ? audit.record(FORM, "12", "Illinois income tax", scheduleNRResult.ilTax, "Schedule NR, Line 52", { scheduleNR: scheduleNRResult.ilTax })
    : audit.record(FORM, "12", "Illinois income tax", roundDollar(line11.times(c.taxRate)), "Line 11 × 4.95%", { line11, rate: c.taxRate });

  const line13 = audit.record(FORM, "13", "Recapture of investment tax credits", input.investmentCreditRecapture, "Schedule 4255", { recapture: input.investmentCreditRecapture });

  const line14 = audit.record(FORM, "14", "Income tax", line12.plus(line13), "Line 12 + Line 13", { line12, line13 });

  // ---- Step 6: Nonrefundable Credits ----
  let scheduleCRResult: ScheduleCRResult | undefined;
  let line15Value = input.otherStateCredit;
  if (input.scheduleCR) {
    scheduleCRResult = calculateScheduleCR({
      ...input.scheduleCR,
      totalBaseIncome: line9,
      ilIncomeTax: line14,
    });
    line15Value = scheduleCRResult.credit;
    audit.merge(scheduleCRResult.lines);
  }
  const line15 = audit.record(FORM, "15", "Credit for income tax paid to other states", line15Value, input.scheduleCR ? "Schedule CR, Line 55" : "Input", { otherStateCredit: line15Value });

  // Schedule ICR computation
  let scheduleICRResult: ScheduleICRResult | undefined;
  let line16 = new Decimal(0);
  if (input.scheduleICR) {
    scheduleICRResult = calculateScheduleICR({
      ...input.scheduleICR,
      incomeTax: line14,
      otherStateCredit: line15,
      federalAGI: input.federalAGI,
      filingStatus: input.filingStatus,
      residencyType: input.scheduleNR?.residencyType ?? input.scheduleICR.residencyType ?? "resident",
    });
    line16 = scheduleICRResult.totalCredit;
    audit.merge(scheduleICRResult.lines);
  }
  audit.record(FORM, "16", "Property tax + K-12 education + volunteer credits", line16, "Schedule ICR, Line 13", { scheduleICRCredit: line16 });

  let scheduleGResult: ScheduleGResult | undefined;
  if (input.scheduleG) {
    scheduleGResult = calculateScheduleG(input.scheduleG);
    audit.merge(scheduleGResult.lines);
  }

  let schedule1299CResult: Schedule1299CResult | undefined;
  let line17Value = input.schedule1299CCredit;
  if (input.schedule1299C) {
    schedule1299CResult = calculateSchedule1299C({
      ...input.schedule1299C,
      incomeTax: line14,
      otherStateAndScheduleICRCredits: line15.plus(line16),
    });
    line17Value = schedule1299CResult.credit;
    audit.merge(schedule1299CResult.lines);
  }
  const line17 = audit.record(
    FORM,
    "17",
    "Credit from Schedule 1299-C",
    line17Value,
    input.schedule1299C ? "Schedule 1299-C, Line 43" : "Input",
    { schedule1299CCredit: line17Value },
  );

  // Total nonrefundable credits cannot exceed income tax (Line 14)
  const rawCredits = line15.plus(line16).plus(line17);
  const line18 = audit.record(FORM, "18", "Total nonrefundable credits", Decimal.min(rawCredits, line14), "min(Line 15 + Line 16 + Line 17, Line 14)", { rawCredits, line14 });

  // ---- Schedule IL-E/EIC (if provided) ----
  let scheduleEEICResult: ScheduleEEICResult | undefined = preliminaryScheduleEEICResult;
  if (input.scheduleEEIC) {
    scheduleEEICResult = input.scheduleNR
      ? calculateScheduleEEIC({
          ...input.scheduleEEIC,
          allocationDecimal: nrAllocationDecimal,
        })
      : preliminaryScheduleEEICResult;
    if (scheduleEEICResult) {
      audit.merge(scheduleEEICResult.lines);
    }
  }

  // ---- Pre-compute refundable credits (needed by IL-2210 before Step 8) ----
  let ilEITC = new Decimal(0);
  let ilCTC = new Decimal(0);
  if (scheduleEEICResult) {
    ilEITC = scheduleEEICResult.ilEITC;
    ilCTC = scheduleEEICResult.ilChildTaxCredit;
  } else if (input.federalEIC.greaterThan(0) && (nrAllocationDecimal ?? new Decimal(1)).greaterThan(0)) {
    throw new Error("IL-1040 Schedule IL-E/EIC is required when claiming Illinois EITC or Child Tax Credit on Lines 29 or 30");
  }

  // ---- Step 7: Tax After Credits and Other Taxes ----
  const line19 = audit.record(FORM, "19", "Tax after nonrefundable credits", line14.minus(line18), "Line 14 - Line 18", { line14, line18 });

  const line20 = audit.record(FORM, "20", "Household employment tax", input.householdEmploymentTax, "Input", { householdEmploymentTax: input.householdEmploymentTax });

  // Line 21: Use Tax — from worksheet if provided, else raw input
  let useTaxWorksheetResult: UseTaxWorksheetResult | undefined;
  let line21Value = input.useTax;
  if (input.useTaxWorksheet) {
    useTaxWorksheetResult = calculateUseTaxWorksheet(input.useTaxWorksheet);
    line21Value = useTaxWorksheetResult.reportableUseTax;
    audit.merge(useTaxWorksheetResult.lines);
  }
  const line21 = audit.record(
    FORM,
    "21",
    "Use tax",
    line21Value,
    input.useTaxWorksheet
      ? useTaxWorksheetResult?.requiresST44
        ? "UT Worksheet exceeded the ST-44 threshold, so Line 21 is 0"
        : "UT Worksheet, reportable Line 21 amount"
      : "Input",
    { useTax: line21Value },
  );

  const line22 = audit.record(FORM, "22", "Compassionate Use / gaming surcharge", input.compassionateUseSurcharge, "Input", { surcharge: input.compassionateUseSurcharge });

  // ---- Line 23: Underpayment penalty (IL-2210) ----
  let il2210Result: IL2210Result | undefined;
  let line34 = new Decimal(0);
  if (input.il2210) {
    il2210Result = calculateIL2210({
      taxYear: input.taxYear,
      filingStatus: input.filingStatus,
      totalTax: line19.plus(line20).plus(line21).plus(line22),
      ilEITC: ilEITC,
      ilChildTaxCredit: ilCTC,
      priorYearTax: input.il2210.priorYearTax,
      priorYearReturnFiled: input.il2210.priorYearReturnFiled,
      qualifiesAsFarmer: input.il2210.qualifiesAsFarmer,
      is65OrOlderAndPermanentlyInNursingHome: input.il2210.is65OrOlderAndPermanentlyInNursingHome,
      notRequiredToFilePriorYearReturn: input.il2210.notRequiredToFilePriorYearReturn,
      ilWithholding: line25Value,
      estimatedPayments: input.il2210.estimatedPaymentsByQuarter,
      annualizedInstallmentMethod: input.il2210.annualizedInstallmentMethod,
    });
    line34 = il2210Result.totalPenalty;
    audit.merge(il2210Result.lines);
  }
  const line23 = audit.record(FORM, "23", "Total tax", line19.plus(line20).plus(line21).plus(line22), "Line 19 + Line 20 + Line 21 + Line 22", { line19, line20, line21, line22 });
  const line24 = audit.record(FORM, "24", "Total tax from page 1, Line 23", line23, "Copy Line 23", { line23 });

  // ---- Step 8: Payments and Refundable Credits ----
  const line25 = audit.record(
    FORM,
    "25",
    "Illinois income tax withheld",
    line25Value,
    input.scheduleILWIT ? "Schedule IL-WIT, Line 11" : "W-2/1099 withholding",
    { ilWithholding: line25Value },
  );

  const line26 = audit.record(FORM, "26", "Estimated income tax payments", input.estimatedPayments, "IL-1040-ES / prior-year overpayment", { estimatedPayments: input.estimatedPayments });

  const line27 = audit.record(FORM, "27", "Pass-through withholding", input.passThroughWithholding, "K-1-P or K-1-T", { passThroughWithholding: input.passThroughWithholding });

  const line28 = audit.record(FORM, "28", "Pass-through entity tax credit", input.passThroughEntityTaxCredit, "K-1-P or K-1-T", { passThroughEntityTaxCredit: input.passThroughEntityTaxCredit });

  const line29 = audit.record(
    FORM,
    "29",
    "Illinois Earned Income Credit",
    ilEITC,
    scheduleEEICResult
      ? "Schedule IL-E/EITC, Line 9"
      : "Federal EIC × 20%",
    {
      federalEIC: input.federalEIC,
      eitcBaseCredit: scheduleEEICResult?.eitcBaseCredit ?? input.federalEIC,
      eitcRate: c.eitcRate,
    },
  );

  const line30 = audit.record(
    FORM,
    "30",
    "Illinois Child Tax Credit",
    ilCTC,
    "IL EITC × 40% (if child under 12)",
    {
      ilEITC,
      childTaxCreditRate: c.childTaxCreditRate,
      hasChildUnder12: String(scheduleEEICResult?.hasChildUnder12 ?? input.hasChildUnder12),
    },
  );

  const line31 = audit.record(FORM, "31", "Total payments and refundable credits", line25.plus(line26).plus(line27).plus(line28).plus(line29).plus(line30), "Lines 25-30", { line25, line26, line27, line28, line29, line30 });

  // ---- Step 9: Refund or Amount Owed ----
  let line32 = new Decimal(0);
  let line33 = new Decimal(0);
  if (line31.greaterThan(line24)) {
    line32 = line31.minus(line24);
  } else {
    line33 = line24.minus(line31);
  }
  audit.record(FORM, "32", "Overpayment", line32, "If Line 31 > Line 24: Line 31 - Line 24", { line31, line24 });
  audit.record(FORM, "33", "Tax due", line33, "If Line 24 > Line 31: Line 24 - Line 31", { line31, line24 });

  audit.record(
    FORM,
    "34",
    "Late-payment penalty for underpayment of estimated tax",
    line34,
    input.il2210 ? "IL-2210" : "No IL-2210 computation",
    { underpaymentPenalty: line34 },
  );

  const line35 = audit.record(
    FORM,
    "35",
    "Voluntary charitable donations",
    scheduleGResult ? scheduleGResult.totalDonations : voluntaryCharitableDonations,
    scheduleGResult ? "Schedule G, Line 2" : "Supported direct Schedule G total",
    scheduleGResult
      ? { scheduleGTotalDonations: scheduleGResult.totalDonations }
      : { voluntaryCharitableDonations },
  );

  const line36 = audit.record(
    FORM,
    "36",
    "Total penalty and donations",
    line34.plus(line35),
    "Line 34 + Line 35",
    { line34, line35 },
  );

  const line37 = audit.record(
    FORM,
    "37",
    "Overpayment after penalty and donations",
    line32.greaterThan(line36) ? line32.minus(line36) : new Decimal(0),
    "If Line 32 > Line 36: Line 32 - Line 36; else 0",
    { line32, line36 },
  );

  let line38 = new Decimal(0);
  let line40 = new Decimal(0);
  let refundMethod: ILRefundMethod | undefined;
  let directDeposit: ILDirectDepositDetails | undefined;
  if (line37.greaterThan(0)) {
    const refundRequested = input.refundAmountRequested;
    const creditForwardRequested = input.creditForwardAmount;

    if (refundRequested !== undefined && creditForwardRequested !== undefined) {
      if (!refundRequested.plus(creditForwardRequested).equals(line37)) {
        throw new Error("IL-1040 Lines 38 and 40 must add to Line 37");
      }
      line38 = refundRequested;
      line40 = creditForwardRequested;
    } else if (refundRequested !== undefined) {
      if (refundRequested.lessThan(0) || refundRequested.greaterThan(line37)) {
        throw new Error("IL-1040 Line 38 refund request must be between 0 and Line 37");
      }
      line38 = refundRequested;
      line40 = line37.minus(line38);
    } else if (creditForwardRequested !== undefined) {
      if (creditForwardRequested.lessThan(0) || creditForwardRequested.greaterThan(line37)) {
        throw new Error("IL-1040 Line 40 credit carryforward must be between 0 and Line 37");
      }
      line40 = creditForwardRequested;
      line38 = line37.minus(line40);
    } else {
      line38 = line37;
      line40 = new Decimal(0);
    }

    // Illinois does not issue refunds below $1, so any sub-dollar refund is
    // carried to next year's estimate to keep Lines 38 and 40 equal to Line 37.
    if (line38.greaterThan(0) && line38.lessThan(1)) {
      line40 = line40.plus(line38);
      line38 = new Decimal(0);
    }

    if (line38.greaterThan(0)) {
      refundMethod = input.refundMethod ?? "paper_check";
      if (refundMethod === "direct_deposit" && input.firstYearIllinoisReturn) {
        throw new Error("IL-1040 first-year filers must receive refunds by paper check");
      }
      if (refundMethod === "direct_deposit") {
        directDeposit = validateILDirectDeposit(input.directDeposit);
      } else if (input.directDeposit) {
        throw new Error("IL-1040 Line 39 direct deposit details may only be provided when direct deposit is elected");
      }
    }
  } else if (input.directDeposit) {
    throw new Error("IL-1040 Line 39 direct deposit details may only be provided when Line 38 refund is greater than zero");
  }

  audit.record(
    FORM,
    "38",
    "Refund requested",
    line38,
    line37.greaterThan(0)
      ? line38.isZero() && line40.equals(line37) && line37.lessThan(1)
        ? "Illinois does not refund amounts below $1; carried to Line 40"
        : "Supported elected refund amount from Line 37"
      : "No refund because Line 37 is zero",
    { line37 },
  );

  audit.record(
    FORM,
    "39",
    "Refund method",
    new Decimal(0),
    refundMethod ? "Supported elected refund method for Line 38" : "No refund method because Line 38 is zero",
    {
      refundMethod: refundMethod ?? "none",
      directDepositDestination: directDeposit?.destination ?? "none",
      directDepositAccountType: directDeposit?.accountType ?? "none",
      directDepositRoutingNumber: directDeposit ? maskRoutingNumber(directDeposit.routingNumber) : "none",
      directDepositAccountNumber: directDeposit ? maskAccountNumber(directDeposit.accountNumber) : "none",
    },
  );

  audit.record(
    FORM,
    "40",
    "Amount of overpayment to be credited forward",
    line40,
    "Line 37 - Line 38",
    { line37, line38 },
  );

  const line41Value = line33.greaterThan(0)
    ? line33.plus(line36)
    : line32.greaterThan(0) && line32.lessThan(line36)
      ? line36.minus(line32)
      : line32.isZero() && line33.isZero()
        ? line36
        : new Decimal(0);
  const line41 = audit.record(
    FORM,
    "41",
    "Amount you owe",
    line41Value,
    "If Line 33 > 0: Line 33 + Line 36; else if Line 32 > 0 and Line 32 < Line 36: Line 36 - Line 32; else if Line 32 = 0 and Line 33 = 0: Line 36; else 0",
    { line32, line33, line36 },
  );

  const healthInsuranceCheckbox = input.healthInsuranceCheckbox
    ? {
        ...input.healthInsuranceCheckbox,
        authorized:
          input.healthInsuranceCheckbox.selfUninsured
          || input.healthInsuranceCheckbox.spouseUninsured
          || input.healthInsuranceCheckbox.dependentsUninsured,
      }
    : undefined;
  audit.record(
    FORM,
    "42",
    "Health insurance checkbox authorization",
    healthInsuranceCheckbox?.authorized ? new Decimal(1) : new Decimal(0),
    healthInsuranceCheckbox
      ? "Supported Step 12 checkbox selections for uninsured self / spouse / dependents"
      : "No Step 12 health insurance checkbox selections provided",
    {
      selfUninsured: String(healthInsuranceCheckbox?.selfUninsured ?? false),
      spouseUninsured: String(healthInsuranceCheckbox?.spouseUninsured ?? false),
      dependentsUninsured: String(healthInsuranceCheckbox?.dependentsUninsured ?? false),
      authorized: String(healthInsuranceCheckbox?.authorized ?? false),
    },
  );

  return {
    federalAGI: line1,
    taxExemptInterest: line2,
    otherAdditions: line3,
    totalIncome: line4,
    retirementIncomeSubtraction: line5,
    ilRefundSubtraction: line6,
    otherSubtractions: line7,
    totalSubtractions: line8,
    baseIncome: line9,
    personalExemption: line10a,
    age65Exemption: line10b,
    blindExemption: line10c,
    dependentExemption: line10d,
    totalExemptions: line10,
    netIncome: line11,
    incomeTax: line12,
    investmentCreditRecapture: line13,
    totalIncomeTax: line14,
    otherStateCredit: line15,
    scheduleICRCredit: line16,
    schedule1299CCredit: line17,
    totalNonrefundableCredits: line18,
    taxAfterCredits: line19,
    householdEmploymentTax: line20,
    useTax: line21,
    compassionateUseSurcharge: line22,
    underpaymentPenalty: line34,
    totalTax: line24,
    ilWithholding: line25,
    estimatedPayments: line26,
    passThroughWithholding: line27,
    passThroughEntityTaxCredit: line28,
    ilEITC: line29,
    ilChildTaxCredit: line30,
    totalPayments: line31,
    preliminaryOverpayment: line32,
    preliminaryTaxDue: line33,
    voluntaryCharitableDonations: line35,
    totalPenaltyAndDonations: line36,
    overpayment: line37,
    refund: line38,
    refundMethod,
    directDeposit,
    creditCarryforward: line40,
    taxDue: line41,
    healthInsuranceCheckbox,
    scheduleM: scheduleMResult,
    scheduleICR: scheduleICRResult,
    scheduleG: scheduleGResult,
    scheduleCR: scheduleCRResult,
    schedule1299C: schedule1299CResult,
    scheduleEEIC: scheduleEEICResult,
    scheduleNR: scheduleNRResult,
    scheduleILWIT: scheduleILWITResult,
    il2210: il2210Result,
    useTaxWorksheet: useTaxWorksheetResult,
    allocationDecimal: nrAllocationDecimal,
    lines: audit.getLines(),
  };
}

// ---------------------------------------------------------------------------
// Helpers — Health Insurance
// ---------------------------------------------------------------------------

function validateHealthInsuranceCheckbox(
  filingStatus: FilingStatus,
  checkbox: ILHealthInsuranceCheckboxInput | undefined,
): void {
  if (!checkbox) {
    return;
  }

  if (checkbox.spouseUninsured && filingStatus !== "married_filing_jointly") {
    throw new Error("IL-1040 Line 42 spouse checkbox is only allowed for married filing jointly");
  }
}

// ---------------------------------------------------------------------------
// Helpers — Personal Exemption
// ---------------------------------------------------------------------------

/** Compute personal exemption (Line 10a) considering filing status, dependent status, and base income */
export function computePersonalExemption(
  filingStatus: FilingStatus,
  claimedAsDependent: boolean,
  spouseClaimedAsDependent: boolean,
  baseIncome: Decimal,
  c: ILConstants
): Decimal {
  const isMFJ = filingStatus === "married_filing_jointly";
  const exemptionAmount = c.personalExemption;
  const doubleExemption = exemptionAmount.times(2);

  if (isMFJ) {
    const bothClaimed = claimedAsDependent && spouseClaimedAsDependent;
    const oneClaimed = (claimedAsDependent && !spouseClaimedAsDependent) || (!claimedAsDependent && spouseClaimedAsDependent);

    if (!claimedAsDependent && !spouseClaimedAsDependent) {
      return doubleExemption;
    }
    if (oneClaimed) {
      if (baseIncome.lessThanOrEqualTo(exemptionAmount)) {
        return doubleExemption;
      }
      return exemptionAmount;
    }
    if (bothClaimed) {
      if (baseIncome.lessThanOrEqualTo(doubleExemption)) {
        return doubleExemption;
      }
      return new Decimal(0);
    }
  }

  // Single, HoH, MFS, QSS
  if (!claimedAsDependent) {
    return exemptionAmount;
  }
  // Claimed as dependent
  if (baseIncome.lessThanOrEqualTo(exemptionAmount)) {
    return exemptionAmount;
  }
  return new Decimal(0);
}

function validateAdditionalExemptionCount(
  count: number,
  maxCount: number,
  line: "10b" | "10c",
  label: "age 65" | "blind",
  isMFJ: boolean,
): void {
  if (count <= maxCount) {
    return;
  }

  if (!isMFJ) {
    throw new Error(`IL-1040 Line ${line} ${label} count cannot exceed 1 unless filing jointly`);
  }

  throw new Error(`IL-1040 Line ${line} ${label} count cannot exceed ${maxCount}`);
}

const DIRECT_DEPOSIT_ALLOWED_CHARACTERS = /^[0-9-]+$/;

function validateILDirectDeposit(input?: ILDirectDepositInput): ILDirectDepositDetails {
  if (!input) {
    throw new Error("IL-1040 Line 39 direct deposit requires routing number, account type, and account number");
  }

  const routingNumber = normalizeDirectDepositField(input.routingNumber, "routing number");
  const accountNumber = normalizeDirectDepositField(input.accountNumber, "account number");

  if (routingNumber.length !== 9) {
    throw new Error("IL-1040 Line 39 routing number must contain exactly 9 digits");
  }

  if (routingNumber === "011001234") {
    if (input.accountType !== "checking") {
      throw new Error("IL-1040 Line 39 Bright Start refunds must use the checking account box");
    }
    if (!/^822\d{11}$/.test(accountNumber)) {
      throw new Error("IL-1040 Line 39 Bright Start account numbers must equal 822 plus 11 digits");
    }
    return {
      routingNumber,
      accountType: input.accountType,
      accountNumber,
      destination: "bright_start",
    };
  }

  if (routingNumber === "104910795") {
    if (input.accountType !== "savings") {
      throw new Error("IL-1040 Line 39 Bright Directions refunds must use the savings account box");
    }
    if (!/^529\d{9}$/.test(accountNumber)) {
      throw new Error("IL-1040 Line 39 Bright Directions account numbers must equal 529 plus 9 digits");
    }
    return {
      routingNumber,
      accountType: input.accountType,
      accountNumber,
      destination: "bright_directions",
    };
  }

  if (accountNumber.length > 17) {
    throw new Error("IL-1040 Line 39 standard direct deposit account numbers cannot exceed 17 digits");
  }

  if (input.accountType === "checking") {
    const prefix = Number(routingNumber.slice(0, 2));
    const validCheckingPrefix = (prefix >= 1 && prefix <= 12) || (prefix >= 21 && prefix <= 32);
    if (!validCheckingPrefix) {
      throw new Error("IL-1040 Line 39 checking routing numbers must begin with 01 through 12 or 21 through 32");
    }
  }

  return {
    routingNumber,
    accountType: input.accountType,
    accountNumber,
    destination: "checking_or_savings",
  };
}

function normalizeDirectDepositField(value: string, label: string): string {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0 || !DIRECT_DEPOSIT_ALLOWED_CHARACTERS.test(trimmedValue)) {
    throw new Error(`IL-1040 Line 39 ${label} may only contain digits and hyphens`);
  }

  const normalizedValue = trimmedValue.replace(/-/g, "");
  if (normalizedValue.length === 0) {
    throw new Error(`IL-1040 Line 39 ${label} must include at least one digit`);
  }

  return normalizedValue;
}

function maskRoutingNumber(routingNumber: string): string {
  return routingNumber.length <= 4
    ? routingNumber
    : `${"*".repeat(routingNumber.length - 4)}${routingNumber.slice(-4)}`;
}

function maskAccountNumber(accountNumber: string): string {
  return accountNumber.length <= 4
    ? accountNumber
    : `${"*".repeat(accountNumber.length - 4)}${accountNumber.slice(-4)}`;
}
