/** Individual Form 172 Part I. Spec: spec/federal/form-172-origin.yaml. */
import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";

/** Actual canonical amounts and business/nonbusiness classifications, including
 * computational cents. Completed historical whole-dollar amounts remain valid.
 * These values are not an input contract for user-entered income overrides.
 */
export interface Form172OriginInput {
  taxYear: number;
  filingStatus: FilingStatus;
  adjustedGrossIncome: Decimal;
  deductionAmount: Decimal;
  nonbusinessCapitalLosses: Decimal;
  nonbusinessCapitalGains: Decimal;
  nonbusinessDeductions: Decimal;
  nonbusinessOrdinaryIncome: Decimal;
  businessCapitalLosses: Decimal;
  businessCapitalGains: Decimal;
  netCapitalGainOrLoss: Decimal;
  section1202Exclusion: Decimal;
  otherYearNolDeduction: Decimal;
}
export type Form172PartILine = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
  | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24;
export interface Form172OriginResult {
  taxYear: number;
  /** Whole-dollar amounts reported on the form. */
  partI: Record<Form172PartILine, Decimal>;
  /** Exact computed amounts before presentation rounding (IRC 6102(c)). */
  sourcePartI: Record<Form172PartILine, Decimal>;
  capitalLimitationRequired: boolean;
  signedComputation: Decimal;
  sourceSignedComputation: Decimal;
  netOperatingLoss: Decimal;
  lines: CalculatedLine[];
}

export function calculateForm172Origin(input: Form172OriginInput): Form172OriginResult {
  if (!Number.isInteger(input.taxYear) || input.taxYear < 2023 || input.taxYear > 2026) {
    throw new Error("Form 172 origin calculation requires an actual supported source year");
  }
  if (!["single", "married_filing_jointly", "married_filing_separately", "head_of_household", "qualifying_surviving_spouse"].includes(input.filingStatus)) {
    throw new Error("Form 172 origin calculation requires the actual filing status");
  }
  for (const [key, value] of Object.entries(input)) {
    if (key === "taxYear" || key === "filingStatus") continue;
    if (!Decimal.isDecimal(value) || !value.isFinite()) throw new Error(`Form 172 requires a finite actual canonical ${key}`);
    if (key !== "adjustedGrossIncome" && key !== "netCapitalGainOrLoss" && value.lt(0)) {
      throw new Error(`Form 172 requires nonnegative canonical ${key}`);
    }
  }
  const required = [input.adjustedGrossIncome, input.deductionAmount, input.nonbusinessCapitalLosses,
    input.nonbusinessCapitalGains, input.nonbusinessDeductions, input.nonbusinessOrdinaryIncome,
    input.businessCapitalLosses, input.businessCapitalGains, input.netCapitalGainOrLoss,
    input.section1202Exclusion, input.otherYearNolDeduction];
  if (required.some(value => !Decimal.isDecimal(value))) throw new Error("Form 172 requires every actual canonical amount, including known zero");
  const capitalNet = input.nonbusinessCapitalGains.plus(input.businessCapitalGains)
    .minus(input.nonbusinessCapitalLosses).minus(input.businessCapitalLosses).minus(input.section1202Exclusion);
  if (!capitalNet.eq(input.netCapitalGainOrLoss)) throw new Error("Form 172 capital classifications must reconcile with the actual Schedule D net amount");
  if (input.section1202Exclusion.gt(0) && capitalNet.lt(0)) {
    throw new Error("Form 172 positive section1202 with a negative capital net requires its resolved lines16-21 source convention");
  }

  const l1 = input.adjustedGrossIncome.minus(input.deductionAmount);
  const l4 = zeroFloor(input.nonbusinessCapitalLosses.minus(input.nonbusinessCapitalGains));
  const l5 = zeroFloor(input.nonbusinessCapitalGains.minus(input.nonbusinessCapitalLosses));
  const l8 = l5.plus(input.nonbusinessOrdinaryIncome);
  const l9 = zeroFloor(input.nonbusinessDeductions.minus(l8));
  const l10 = Decimal.min(l5, zeroFloor(l8.minus(input.nonbusinessDeductions)));
  const l13 = l10.plus(input.businessCapitalGains);
  const l14 = zeroFloor(input.businessCapitalLosses.minus(l13));
  const l15 = l4.plus(l14);
  const l16 = zeroFloor(input.netCapitalGainOrLoss.negated());
  const l18 = zeroFloor(l16.minus(input.section1202Exclusion));
  const l19 = Decimal.min(l16, d(input.filingStatus === "married_filing_separately" ? "1500" : "3000"));
  const l20 = zeroFloor(l18.minus(l19));
  const l21 = zeroFloor(l19.minus(l18));
  const l22 = zeroFloor(l15.minus(l20));
  const sourceSignedComputation = sum(l1, l9, input.section1202Exclusion, l21, l22, input.otherYearNolDeduction);
  const l24 = Decimal.min(d("0"), sourceSignedComputation);
  const sourcePartI: Form172OriginResult["sourcePartI"] = {
    1: l1, 2: input.nonbusinessCapitalLosses, 3: input.nonbusinessCapitalGains, 4: l4, 5: l5,
    6: input.nonbusinessDeductions, 7: input.nonbusinessOrdinaryIncome, 8: l8, 9: l9, 10: l10,
    11: input.businessCapitalLosses, 12: input.businessCapitalGains, 13: l13, 14: l14, 15: l15,
    16: l16, 17: input.section1202Exclusion, 18: l18, 19: l19, 20: l20, 21: l21, 22: l22,
    23: input.otherYearNolDeduction, 24: l24,
  };
  // Section 6102(c) and Reg. 301.6102-1(c) distinguish exact computational
  // items from reported totals. Do not derive a line from independently
  // rounded displays or assign their difference to a capital source.
  const partI = { ...sourcePartI };
  for (const line of Object.keys(sourcePartI)) {
    const number = Number(line) as Form172PartILine;
    partI[number] = roundDollar(sourcePartI[number]);
  }
  const signedComputation = roundDollar(sourceSignedComputation);
  const capitalLimitationRequired = l16.gt(0) || input.section1202Exclusion.gt(0);
  const labels: Array<[Form172PartILine, string, string]> = [
    [1, "Income less standard or itemized deduction", "Actual AGI minus the standard or itemized deduction; retain the signed result"],
    [2, "Nonbusiness capital losses", "Actual classified capital losses before limitation, excluding section 1202"],
    [3, "Nonbusiness capital gains", "Actual classified gains before any section 1202 exclusion"],
    [4, "Excess nonbusiness capital losses", "max(0, line 2 - line 3)"],
    [5, "Excess nonbusiness capital gains", "max(0, line 3 - line 2)"],
    [6, "Nonbusiness deductions", "Actual allowed deductions not attributable to a trade or business"],
    [7, "Nonbusiness ordinary income", "Actual nonbusiness income other than capital gains"],
    [8, "Income available for nonbusiness deductions", "Line 5 + line 7"],
    [9, "Disallowed nonbusiness deductions", "max(0, line 6 - line 8)"],
    [10, "Remaining nonbusiness capital gain", "min(line 5, max(0, line 8 - line 6))"],
    [11, "Business capital losses", "Actual classified capital losses before limitation"],
    [12, "Business capital gains", "Actual classified capital gains before section 1202"],
    [13, "Gain available for business capital losses", "Line 10 + line 12"],
    [14, "Excess business capital losses", "max(0, line 11 - line 13)"],
    [15, "Total excess capital losses", "Line 4 + line 14"],
    [16, "Net Schedule D capital loss", "Positive magnitude of the actual combined net loss"],
    [17, "Section 1202 exclusion", "Restore the actual exclusion once; positive exclusion with a negative capital net requires its separate source convention"],
    [18, "Net loss less exclusion", "max(0, line 16 - line 17)"],
    [19, "Capital loss deduction", "min(line 16, 1500 for MFS or 3000 otherwise)"],
    [20, "Capital loss already excluded from income", "max(0, line 18 - line 19)"],
    [21, "Exclusion-related capital adjustment", "max(0, line 19 - line 18)"],
    [22, "Additional disallowed capital loss", "max(0, line 15 - line 20)"],
    [23, "Other-year NOL deduction", "Restore the actual other-year NOL deduction once"],
    [24, "Current-year net operating loss", "Combine lines 1, 9, 17 and 21 through 23; a nonnegative result establishes no new NOL"],
  ];
  const audit = new AuditTrail();
  for (const [line, label, formula] of labels) {
    if (!capitalLimitationRequired && line >= 16 && line <= 21) continue;
    audit.record("172 Part I", String(line), label, partI[line], formula, {
      "Exact amount before reporting": sourcePartI[line],
      ...(line === 24 ? { "Signed computation": signedComputation,
        "Exact signed computation": sourceSignedComputation } : {}),
    });
  }
  return { taxYear: input.taxYear, partI, sourcePartI, capitalLimitationRequired,
    signedComputation, sourceSignedComputation,
    netOperatingLoss: zeroFloor(partI[24].negated()), lines: audit.getLines() };
}
