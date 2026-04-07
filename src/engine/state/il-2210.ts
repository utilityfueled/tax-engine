/**
 * Illinois IL-2210 — Computation of Penalties for Individuals
 * Spec: spec/state/il-2210.yaml
 *
 * Computes the underpayment penalty for individuals who did not pay enough
 * estimated tax or withholding during the tax year. Uses the Regular
 * Installment Method with quarterly computation.
 *
 * No penalty if:
 * - Net tax < $1,000 ($500 MFS)
 * - Withholding covers required annual payment
 *
 * Penalty rate for 2025: 7% (daily rate = 7% / 365).
 * Quarter due dates: April 15, June 15, September 15, January 15.
 */

import Decimal from "decimal.js";
import { zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";
import {
  IL_2210_CONSTANTS as SHARED_IL_2210_CONSTANTS,
  type FilingStatus,
  type Illinois2210Constants,
} from "@/models/constants.js";

export type IL2210Constants = Illinois2210Constants;
export const IL_2210_CONSTANTS = SHARED_IL_2210_CONSTANTS;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface IL2210Input {
  taxYear: number;
  filingStatus: FilingStatus;

  /** IL-1040, Line 24 — total tax */
  totalTax: Decimal;
  /** IL-1040, Line 29 — IL EITC (refundable) */
  ilEITC: Decimal;
  /** IL-1040, Line 30 — IL Child Tax Credit (refundable) */
  ilChildTaxCredit: Decimal;

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

  /** Total IL income tax withheld (IL-1040, Line 25) */
  ilWithholding: Decimal;
  /** Estimated payments by quarter [Q1, Q2, Q3, Q4] */
  estimatedPayments: [Decimal, Decimal, Decimal, Decimal];
  /** Optional Step 6 annualized income installment worksheet inputs */
  annualizedInstallmentMethod?: IL2210AnnualizedInstallmentMethodInput;
}

export interface IL2210AnnualizedInstallmentPeriodInput {
  /** Step 6, Line 38 — Illinois base income for the period */
  baseIncome: Decimal;
  /** Step 6, Line 41 — exemption allowance for the period */
  exemptions: Decimal;
  /** Step 6, Line 44 — IL-1040 Line 22 surcharges for the period */
  surcharges: Decimal;
  /** Step 6, Line 46 — credits effective as of the period end, excluding any 2025 restored IL Child Tax Credit supplied separately below */
  credits: Decimal;
  /**
   * Optional Step 6, Line 46 Illinois Child Tax Credit for the period.
   * For 2025 annualization, Illinois excludes this credit in Columns A and B
   * because the restoring law was not effective as of May 31, 2025. Columns C
   * and D may include it. Other supported years include it in every column.
   */
  ilChildTaxCredit?: Decimal;
}

export interface IL2210AnnualizedInstallmentMethodInput {
  periods: [
    IL2210AnnualizedInstallmentPeriodInput,
    IL2210AnnualizedInstallmentPeriodInput,
    IL2210AnnualizedInstallmentPeriodInput,
    IL2210AnnualizedInstallmentPeriodInput,
  ];
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface QuarterResult {
  quarter: number;
  requiredInstallment: Decimal;
  priorCarryover: Decimal;
  payment: Decimal;
  totalAvailable: Decimal;
  underpayment: Decimal;
  overpaymentCarry: Decimal;
  penaltyDays: number;
  quarterPenalty: Decimal;
}

export interface IL2210Result {
  // Step 1
  totalTax: Decimal;
  refundableCredits: Decimal;
  netTax: Decimal; // Line 3
  currentYearRequired: Decimal; // Line 4
  priorYearTax: Decimal; // Line 5
  requiredAnnualPayment: Decimal; // Line 6
  ilWithholding: Decimal; // Line 7
  estimatedTaxRequired: Decimal; // Line 8

  // Step 2
  penaltyRequired: boolean;
  penaltyExemptReason?: string;

  // Step 3
  requiredInstallment: Decimal; // Line 9
  quarters: QuarterResult[];
  totalPenalty: Decimal;
  annualizedWorksheet?: IL2210AnnualizedWorksheetResult;

  // Audit
  lines: CalculatedLine[];
}

export interface IL2210AnnualizedWorksheetColumnResult {
  column: "A" | "B" | "C" | "D";
  baseIncome: Decimal; // Line 38
  annualizationFactor: Decimal; // Line 39
  annualizedIncome: Decimal; // Line 40
  exemptions: Decimal; // Line 41
  netIncome: Decimal; // Line 42
  incomeTax: Decimal; // Line 43
  surcharges: Decimal; // Line 44
  taxPlusSurcharges: Decimal; // Line 45
  credits: Decimal; // Line 46
  netTaxAfterCredits: Decimal; // Line 47
  applicablePercentage: Decimal; // Line 48
  annualizedInstallment: Decimal; // Line 49
  priorRequiredInstallments: Decimal; // Line 50
  remainingAnnualizedInstallment: Decimal; // Line 51
  regularInstallment: Decimal; // Line 52
  priorExcessRegularInstallments: Decimal; // Line 53
  regularInstallmentCap: Decimal; // Line 54
  excessRegularInstallment: Decimal; // Line 55
  requiredInstallment: Decimal; // Line 56
}

export interface IL2210AnnualizedWorksheetResult {
  columns: [
    IL2210AnnualizedWorksheetColumnResult,
    IL2210AnnualizedWorksheetColumnResult,
    IL2210AnnualizedWorksheetColumnResult,
    IL2210AnnualizedWorksheetColumnResult,
  ];
  requiredInstallments: [Decimal, Decimal, Decimal, Decimal];
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

export function calculateIL2210(input: IL2210Input): IL2210Result {
  const c = IL_2210_CONSTANTS[input.taxYear];
  if (!c) {
    throw new Error(`IL-2210 constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  const FORM = "IL-2210";
  const isMFS = input.filingStatus === "married_filing_separately";
  const thresholdKey = isMFS ? "mfs" : "other";

  // ---- Step 1: Required Annual Payment ----
  const line1 = audit.record(FORM, "1", "Total tax from IL-1040, Line 24",
    input.totalTax, "IL-1040, Line 24", { totalTax: input.totalTax });

  const refundableCredits = input.ilEITC.plus(input.ilChildTaxCredit);
  const line2 = audit.record(FORM, "2", "Refundable credits (IL EITC + IL CTC)",
    refundableCredits, "IL-1040, Line 29 + Line 30",
    { ilEITC: input.ilEITC, ilChildTaxCredit: input.ilChildTaxCredit });

  const line3 = audit.record(FORM, "3", "Net tax liability",
    zeroFloor(line1.minus(line2)), "max(Line 1 - Line 2, 0)", { line1, line2 });

  const line4 = audit.record(FORM, "4", "90% of current year net tax",
    roundDollar(line3.times(c.currentYearSafeHarbor)),
    "Line 3 × 90%", { line3, rate: c.currentYearSafeHarbor });

  // Line 5: Prior year tax (or Line 4 if no prior year return)
  const line5Value = input.priorYearReturnFiled ? input.priorYearTax : line4;
  const line5 = audit.record(FORM, "5", "Prior year tax liability",
    line5Value,
    input.priorYearReturnFiled ? "Prior year IL-1040 net tax" : "Line 4 (no prior year return)",
    { priorYearTax: line5Value, priorYearReturnFiled: String(input.priorYearReturnFiled) });

  const line6 = audit.record(FORM, "6", "Required annual payment",
    Decimal.min(line4, line5), "min(Line 4, Line 5)", { line4, line5 });

  const line7 = audit.record(FORM, "7", "Illinois income tax withheld",
    input.ilWithholding, "IL-1040, Line 25", { ilWithholding: input.ilWithholding });

  const line8 = audit.record(FORM, "8", "Estimated tax required",
    zeroFloor(line6.minus(line7)), "max(Line 6 - Line 7, 0)", { line6, line7 });

  // ---- Step 2: Determine if penalty applies ----
  const threshold = c.penaltyThreshold[thresholdKey];
  let penaltyRequired = true;
  let penaltyExemptReason: string | undefined;

  if (line3.lessThan(threshold)) {
    penaltyRequired = false;
    penaltyExemptReason = `Net tax ($${line3}) below $${threshold} threshold`;
  } else if (line8.isZero()) {
    penaltyRequired = false;
    penaltyExemptReason = "Withholding covers required annual payment";
  } else if (input.qualifiesAsFarmer) {
    penaltyRequired = false;
    penaltyExemptReason = "Taxpayer qualifies as a farmer (IL-1040 Line 34a)";
  } else if (input.is65OrOlderAndPermanentlyInNursingHome) {
    penaltyRequired = false;
    penaltyExemptReason = "Taxpayer or spouse is age 65+ and permanently in a nursing home (IL-1040 Line 34b)";
  } else if (input.notRequiredToFilePriorYearReturn) {
    penaltyRequired = false;
    penaltyExemptReason = "Taxpayer was not required to file the prior-year IL-1040 (IL-1040 Line 34d)";
  }

  audit.record(FORM, "penalty_check", "Penalty required determination",
    new Decimal(penaltyRequired ? 1 : 0),
    penaltyExemptReason ?? "Penalty applies",
    {
      netTax: line3,
      threshold,
      estimatedRequired: line8,
      qualifiesAsFarmer: String(input.qualifiesAsFarmer ?? false),
      nursingHomeExemption: String(input.is65OrOlderAndPermanentlyInNursingHome ?? false),
      notRequiredToFilePriorYearReturn: String(input.notRequiredToFilePriorYearReturn ?? false),
    });

  // ---- Step 3: Regular Installment Method ----
  const requiredInstallment = roundDollar(line6.dividedBy(4));
  audit.record(FORM, "9", "Required installment per quarter",
    requiredInstallment, "Line 6 ÷ 4", { line6 });

  const annualizedWorksheet = input.annualizedInstallmentMethod
    ? calculateAnnualizedInstallmentWorksheet(
        input.taxYear,
        input.annualizedInstallmentMethod,
        requiredInstallment,
        c,
        audit,
        FORM,
      )
    : undefined;
  const requiredInstallments = annualizedWorksheet?.requiredInstallments
    ?? [requiredInstallment, requiredInstallment, requiredInstallment, requiredInstallment];

  // Withholding allocated equally: 25% per quarter
  const quarterlyWithholding = roundDollar(input.ilWithholding.dividedBy(4));
  const dailyRate = c.penaltyRate.dividedBy(365);

  const quarters: QuarterResult[] = [];
  let carryover = new Decimal(0);
  let totalPenalty = new Decimal(0);

  for (let q = 0; q < 4; q++) {
    const qNum = q + 1;
    const quarterRequiredInstallment = requiredInstallments[q];
    const priorCarryover = carryover;
    const payment = quarterlyWithholding.plus(input.estimatedPayments[q]);
    const totalAvailable = priorCarryover.plus(payment);

    let underpayment = new Decimal(0);
    let overpaymentCarry = new Decimal(0);

    if (totalAvailable.greaterThanOrEqualTo(quarterRequiredInstallment)) {
      overpaymentCarry = totalAvailable.minus(quarterRequiredInstallment);
    } else {
      underpayment = quarterRequiredInstallment.minus(totalAvailable);
    }

    // Penalty for this quarter
    let quarterPenalty = new Decimal(0);
    if (penaltyRequired && underpayment.greaterThan(0)) {
      const days = c.penaltyDays[q];
      quarterPenalty = roundDollar(underpayment.times(dailyRate).times(days));
    }

    totalPenalty = totalPenalty.plus(quarterPenalty);
    carryover = overpaymentCarry;

    const qr: QuarterResult = {
      quarter: qNum,
      requiredInstallment: quarterRequiredInstallment,
      priorCarryover,
      payment,
      totalAvailable,
      underpayment,
      overpaymentCarry,
      penaltyDays: c.penaltyDays[q],
      quarterPenalty,
    };
    quarters.push(qr);

    audit.record(FORM, `Q${qNum}`, `Quarter ${qNum} computation`,
      underpayment, `Required: ${requiredInstallment}, Available: ${totalAvailable}`,
      {
        requiredInstallment,
        priorCarryover,
        payment,
        totalAvailable,
        underpayment,
        overpaymentCarry,
        quarterPenalty,
      });
  }

  audit.record(FORM, "penalty", "Total underpayment penalty",
    totalPenalty, "Sum of quarterly penalties", { totalPenalty });

  return {
    totalTax: line1,
    refundableCredits: line2,
    netTax: line3,
    currentYearRequired: line4,
    priorYearTax: line5,
    requiredAnnualPayment: line6,
    ilWithholding: line7,
    estimatedTaxRequired: line8,
    penaltyRequired,
    penaltyExemptReason,
    requiredInstallment,
    quarters,
    totalPenalty,
    annualizedWorksheet,
    lines: audit.getLines(),
  };
}

const ANNUALIZED_COLUMNS = ["A", "B", "C", "D"] as const;

function calculateAnnualizedInstallmentWorksheet(
  taxYear: number,
  input: IL2210AnnualizedInstallmentMethodInput,
  regularInstallment: Decimal,
  constants: Illinois2210Constants,
  audit: AuditTrail,
  form: string,
): IL2210AnnualizedWorksheetResult {
  const columns: IL2210AnnualizedWorksheetColumnResult[] = [];
  let priorLine56Total = new Decimal(0);
  let priorLine55 = new Decimal(0);

  for (let index = 0; index < ANNUALIZED_COLUMNS.length; index++) {
    const column = ANNUALIZED_COLUMNS[index];
    const period = input.periods[index];
    const annualizationFactor = constants.annualizationFactors[index];
    const applicablePercentage = constants.applicablePercentages[index];
    const periodChildTaxCredit = period.ilChildTaxCredit ?? new Decimal(0);
    const includeChildTaxCredit = taxYear !== 2025 || index >= 2;
    const effectiveCredits = includeChildTaxCredit
      ? period.credits.plus(periodChildTaxCredit)
      : period.credits;

    const line38 = audit.record(
      form,
      `38${column}`,
      `Step 6 Column ${column} Illinois base income`,
      period.baseIncome,
      "Input period base income",
      { baseIncome: period.baseIncome },
    );
    const line39 = audit.record(
      form,
      `39${column}`,
      `Step 6 Column ${column} annualization factor`,
      annualizationFactor,
      "Published annualization factor",
      { annualizationFactor },
    );
    const line40 = audit.record(
      form,
      `40${column}`,
      `Step 6 Column ${column} annualized income`,
      roundDollar(line38.times(line39)),
      "Line 38 × Line 39",
      { line38, line39 },
    );
    const line41 = audit.record(
      form,
      `41${column}`,
      `Step 6 Column ${column} exemptions`,
      period.exemptions,
      "Input period exemptions",
      { exemptions: period.exemptions },
    );
    const line42 = audit.record(
      form,
      `42${column}`,
      `Step 6 Column ${column} net income`,
      zeroFloor(line40.minus(line41)),
      "max(Line 40 - Line 41, 0)",
      { line40, line41 },
    );
    const line43 = audit.record(
      form,
      `43${column}`,
      `Step 6 Column ${column} income tax`,
      roundDollar(line42.times(new Decimal("0.0495"))),
      "Line 42 × 4.95%",
      { line42, taxRate: new Decimal("0.0495") },
    );
    const line44 = audit.record(
      form,
      `44${column}`,
      `Step 6 Column ${column} surcharges`,
      period.surcharges,
      "Input period surcharges",
      { surcharges: period.surcharges },
    );
    const line45 = audit.record(
      form,
      `45${column}`,
      `Step 6 Column ${column} tax plus surcharges`,
      line43.plus(line44),
      "Line 43 + Line 44",
      { line43, line44 },
    );
    const line46 = audit.record(
      form,
      `46${column}`,
      `Step 6 Column ${column} credits`,
      effectiveCredits,
      includeChildTaxCredit && periodChildTaxCredit.greaterThan(0)
        ? "Input period credits plus Illinois Child Tax Credit allowed for this column"
        : !includeChildTaxCredit && periodChildTaxCredit.greaterThan(0)
          ? "Input period credits (Illinois Child Tax Credit excluded before June 2025)"
          : "Input period credits",
      {
        credits: period.credits,
        ilChildTaxCredit: periodChildTaxCredit,
        includeChildTaxCredit: String(includeChildTaxCredit),
      },
    );
    const line47 = audit.record(
      form,
      `47${column}`,
      `Step 6 Column ${column} net tax after credits`,
      zeroFloor(line45.minus(line46)),
      "max(Line 45 - Line 46, 0)",
      { line45, line46 },
    );
    const line48 = audit.record(
      form,
      `48${column}`,
      `Step 6 Column ${column} applicable percentage`,
      applicablePercentage,
      "Published applicable percentage",
      { applicablePercentage },
    );
    const line49 = audit.record(
      form,
      `49${column}`,
      `Step 6 Column ${column} annualized installment`,
      roundDollar(line47.times(line48)),
      "Line 47 × Line 48",
      { line47, line48 },
    );
    const line50 = audit.record(
      form,
      `50${column}`,
      `Step 6 Column ${column} prior required installments`,
      priorLine56Total,
      "Sum of prior columns Line 56",
      { priorLine56Total },
    );
    const line51 = audit.record(
      form,
      `51${column}`,
      `Step 6 Column ${column} remaining annualized installment`,
      zeroFloor(line49.minus(line50)),
      "max(Line 49 - Line 50, 0)",
      { line49, line50 },
    );
    const line52 = audit.record(
      form,
      `52${column}`,
      `Step 6 Column ${column} regular-installment comparison amount`,
      regularInstallment,
      "Step 2, Line 9b without annualization",
      { regularInstallment },
    );
    const line53 = audit.record(
      form,
      `53${column}`,
      `Step 6 Column ${column} prior excess regular installments`,
      priorLine55,
      index === 0 ? "0 for Column A" : "Prior column Line 55",
      { priorExcessRegularInstallments: priorLine55 },
    );
    const line54 = audit.record(
      form,
      `54${column}`,
      `Step 6 Column ${column} regular-installment cap`,
      line52.plus(line53),
      "Line 52 + Line 53",
      { line52, line53 },
    );
    const line55 = audit.record(
      form,
      `55${column}`,
      `Step 6 Column ${column} excess regular installments`,
      line54.greaterThan(line51) ? line54.minus(line51) : new Decimal(0),
      "If Line 54 > Line 51, Line 54 - Line 51; otherwise 0",
      { line54, line51 },
    );
    const line56 = audit.record(
      form,
      `56${column}`,
      `Step 6 Column ${column} required installment`,
      Decimal.min(line51, line54),
      "min(Line 51, Line 54)",
      { line51, line54 },
    );

    priorLine56Total = priorLine56Total.plus(line56);
    priorLine55 = line55;

    columns.push({
      column,
      baseIncome: line38,
      annualizationFactor: line39,
      annualizedIncome: line40,
      exemptions: line41,
      netIncome: line42,
      incomeTax: line43,
      surcharges: line44,
      taxPlusSurcharges: line45,
      credits: line46,
      netTaxAfterCredits: line47,
      applicablePercentage: line48,
      annualizedInstallment: line49,
      priorRequiredInstallments: line50,
      remainingAnnualizedInstallment: line51,
      regularInstallment: line52,
      priorExcessRegularInstallments: line53,
      regularInstallmentCap: line54,
      excessRegularInstallment: line55,
      requiredInstallment: line56,
    });
  }

  const annualizedColumns = [
    columns[0]!,
    columns[1]!,
    columns[2]!,
    columns[3]!,
  ] as IL2210AnnualizedWorksheetResult["columns"];

  return {
    columns: annualizedColumns,
    requiredInstallments: [
      annualizedColumns[0].requiredInstallment,
      annualizedColumns[1].requiredInstallment,
      annualizedColumns[2].requiredInstallment,
      annualizedColumns[3].requiredInstallment,
    ],
  };
}
