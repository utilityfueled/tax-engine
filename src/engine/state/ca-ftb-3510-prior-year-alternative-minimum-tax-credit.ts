/**
 * California FTB 3510 Prior Year Alternative Minimum Tax Credit upstream nonresident slice.
 * Spec: spec/state/ca-ftb-3510-prior-year-alternative-minimum-tax-credit.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, roundDollar, zeroFloor } from "@/utils/decimal.js";

export interface CAFTB3510PriorYearAlternativeMinimumTaxCreditInput {
  priorYearFilingStatus: FilingStatus;
  priorYearItemizedDeductions: boolean;
  priorYearLine1ExclusionAlternativeMinimumTaxableIncome: Decimal | string | number;
  priorYearLine2ExclusionAdjustments?: Decimal | string | number;
  priorYearLine3AmtCreditNetOperatingLossDeduction?: Decimal | string | number;
  priorYearLine5ExemptionWorksheetLine1Amount: Decimal | string | number;
  priorYearLine6ExemptionWorksheetLine3Amount: Decimal | string | number;
  priorYearLine15CaliforniaItemizedDeductionsOnExclusions?: Decimal | string | number;
  priorYearLine17CaliforniaAdjustedGrossIncomeOnExclusions?: Decimal | string | number;
  priorYearLine18CaliforniaSourceExclusionAdjustments?: Decimal | string | number;
  priorYearLine26RegularTax?: Decimal | string | number;
  priorYearLine28AlternativeMinimumTax: Decimal | string | number;
  priorYearLine31UnusedAmtCreditCarryover?: Decimal | string | number;
  currentYearLine33RegularTax: Decimal | string | number;
  currentYearLine34ExemptionAndOtherAllowableCredits: Decimal | string | number;
  currentYearLine36TentativeMinimumTax: Decimal | string | number;
  taxYear: number;
}

export interface CAFTB3510PriorYearAlternativeMinimumTaxCreditResult {
  line1ExclusionAlternativeMinimumTaxableIncome: Decimal;
  line2ExclusionAdjustments: Decimal;
  line3AmtCreditNetOperatingLossDeduction: Decimal;
  line4ExclusionAlternativeMinimumTaxableIncome: Decimal;
  line5ExemptionWorksheetLine1Amount: Decimal;
  line6ExemptionWorksheetLine3Amount: Decimal;
  line7ExcessExclusionAlternativeMinimumTaxableIncome: Decimal;
  line8ExemptionPhaseoutReduction: Decimal;
  line9AllowedExemptionAgainstExclusionAmti: Decimal;
  line10TentativeMinimumTaxBaseOnExclusions: Decimal;
  line11TentativeMinimumTaxOnExclusions: Decimal;
  line14ExclusionAlternativeMinimumTaxableIncome: Decimal;
  line15CaliforniaItemizedDeductionsOnExclusions: Decimal;
  line16TotalAmtAdjustedGrossIncomeOnExclusions: Decimal;
  line17CaliforniaAdjustedGrossIncomeOnExclusions: Decimal;
  line18CaliforniaSourceExclusionAdjustments: Decimal;
  line20CaliforniaAmtAdjustedGrossIncomeOnExclusions: Decimal;
  line21AlternativeMinimumTaxRateOnExclusions: Decimal;
  line22ProratedAmtItemizedDeductionsOnExclusions: Decimal;
  line23CaliforniaAlternativeMinimumTaxableIncomeOnExclusions: Decimal;
  line24CaliforniaAlternativeMinimumTaxRateOnExclusions: Decimal;
  line25CaliforniaTentativeMinimumTaxOnExclusions: Decimal;
  line26RegularTax: Decimal;
  line27NetAlternativeMinimumTaxOnExclusions: Decimal;
  line28AlternativeMinimumTax: Decimal;
  line29PriorYearNetAlternativeMinimumTaxOnExclusions: Decimal;
  line30PriorYearNetAlternativeMinimumTaxOnDeferrals: Decimal;
  line31UnusedAmtCreditCarryover: Decimal;
  line32AvailableCreditBeforeLimitation: Decimal;
  line33RegularTax: Decimal;
  line34ExemptionAndOtherAllowableCredits: Decimal;
  line35RegularTaxAfterExemptionAndOtherAllowableCredits: Decimal;
  line36TentativeMinimumTax: Decimal;
  line37CurrentYearLimitation: Decimal;
  line38CreditAllowedThisYear: Decimal;
  line39CarryoverToNextYear: Decimal;
  lines: CalculatedLine[];
}

const SUPPORTED_TAX_YEARS = new Set([2025]);
const MFS_2024_THRESHOLD = new Decimal(465231);
const MFS_2024_MAX_ADDITION = new Decimal(60029);

function nonNegativeAmount(
  value: Decimal | string | number | undefined,
  description: string
): Decimal {
  const amount = d(value);
  if (amount.lessThan(0)) {
    throw new Error(`${description} must be non-negative`);
  }

  return amount;
}

function signedAmount(value: Decimal | string | number | undefined): Decimal {
  return d(value);
}

function roundRate(value: Decimal): Decimal {
  return value.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

export function calculateCAFTB3510PriorYearAlternativeMinimumTaxCredit(
  input: CAFTB3510PriorYearAlternativeMinimumTaxCreditInput
): CAFTB3510PriorYearAlternativeMinimumTaxCreditResult {
  if (!SUPPORTED_TAX_YEARS.has(input.taxYear)) {
    throw new Error(
      `CA FTB 3510 Prior Year Alternative Minimum Tax Credit constants not available for ${input.taxYear}`
    );
  }

  const line1ExclusionAlternativeMinimumTaxableIncome = nonNegativeAmount(
    input.priorYearLine1ExclusionAlternativeMinimumTaxableIncome,
    "CA FTB 3510 line 1 exclusion alternative minimum taxable income"
  );
  const line2ExclusionAdjustments = signedAmount(input.priorYearLine2ExclusionAdjustments);
  const line3AmtCreditNetOperatingLossDeduction = nonNegativeAmount(
    input.priorYearLine3AmtCreditNetOperatingLossDeduction,
    "CA FTB 3510 line 3 AMT credit net operating loss deduction"
  );

  let line4ExclusionAlternativeMinimumTaxableIncome = zeroFloor(
    line1ExclusionAlternativeMinimumTaxableIncome
      .plus(line2ExclusionAdjustments)
      .minus(line3AmtCreditNetOperatingLossDeduction)
  );
  if (
    input.priorYearFilingStatus === "married_filing_separately" &&
    line4ExclusionAlternativeMinimumTaxableIncome.greaterThan(MFS_2024_THRESHOLD)
  ) {
    const excess = line4ExclusionAlternativeMinimumTaxableIncome.minus(MFS_2024_THRESHOLD);
    line4ExclusionAlternativeMinimumTaxableIncome =
      line4ExclusionAlternativeMinimumTaxableIncome.plus(min(excess.times(0.25), MFS_2024_MAX_ADDITION));
  }

  const line5ExemptionWorksheetLine1Amount = nonNegativeAmount(
    input.priorYearLine5ExemptionWorksheetLine1Amount,
    "CA FTB 3510 line 5 exemption worksheet line 1 amount"
  );
  const line6ExemptionWorksheetLine3Amount = nonNegativeAmount(
    input.priorYearLine6ExemptionWorksheetLine3Amount,
    "CA FTB 3510 line 6 exemption worksheet line 3 amount"
  );
  const line7ExcessExclusionAlternativeMinimumTaxableIncome = zeroFloor(
    line4ExclusionAlternativeMinimumTaxableIncome.minus(line6ExemptionWorksheetLine3Amount)
  );
  const line8ExemptionPhaseoutReduction = line7ExcessExclusionAlternativeMinimumTaxableIncome.times(0.25);
  const line9AllowedExemptionAgainstExclusionAmti = zeroFloor(
    line5ExemptionWorksheetLine1Amount.minus(line8ExemptionPhaseoutReduction)
  );
  const line10TentativeMinimumTaxBaseOnExclusions = zeroFloor(
    line4ExclusionAlternativeMinimumTaxableIncome.minus(line9AllowedExemptionAgainstExclusionAmti)
  );
  const line11TentativeMinimumTaxOnExclusions = roundDollar(line10TentativeMinimumTaxBaseOnExclusions.times(0.07));

  const line14ExclusionAlternativeMinimumTaxableIncome = line4ExclusionAlternativeMinimumTaxableIncome;
  const line15CaliforniaItemizedDeductionsOnExclusions = nonNegativeAmount(
    input.priorYearLine15CaliforniaItemizedDeductionsOnExclusions,
    "CA FTB 3510 line 15 California itemized deductions on exclusions"
  );
  const line16TotalAmtAdjustedGrossIncomeOnExclusions =
    line14ExclusionAlternativeMinimumTaxableIncome.plus(line15CaliforniaItemizedDeductionsOnExclusions);
  const line17CaliforniaAdjustedGrossIncomeOnExclusions = nonNegativeAmount(
    input.priorYearLine17CaliforniaAdjustedGrossIncomeOnExclusions,
    "CA FTB 3510 line 17 California adjusted gross income on exclusions"
  );
  const line18CaliforniaSourceExclusionAdjustments = signedAmount(
    input.priorYearLine18CaliforniaSourceExclusionAdjustments
  );
  const line20CaliforniaAmtAdjustedGrossIncomeOnExclusions =
    line17CaliforniaAdjustedGrossIncomeOnExclusions.plus(line18CaliforniaSourceExclusionAdjustments);
  const line21AlternativeMinimumTaxRateOnExclusions =
    input.priorYearItemizedDeductions && line16TotalAmtAdjustedGrossIncomeOnExclusions.greaterThan(0)
      ? Decimal.min(
          new Decimal(1),
          roundRate(
            line20CaliforniaAmtAdjustedGrossIncomeOnExclusions.dividedBy(
              line16TotalAmtAdjustedGrossIncomeOnExclusions
            )
          )
        )
      : new Decimal(0);
  const line22ProratedAmtItemizedDeductionsOnExclusions = input.priorYearItemizedDeductions
    ? roundDollar(line15CaliforniaItemizedDeductionsOnExclusions.times(line21AlternativeMinimumTaxRateOnExclusions))
    : new Decimal(0);
  const line23CaliforniaAlternativeMinimumTaxableIncomeOnExclusions = input.priorYearItemizedDeductions
    ? line20CaliforniaAmtAdjustedGrossIncomeOnExclusions.minus(line22ProratedAmtItemizedDeductionsOnExclusions)
    : line20CaliforniaAmtAdjustedGrossIncomeOnExclusions;
  const line24CaliforniaAlternativeMinimumTaxRateOnExclusions =
    line4ExclusionAlternativeMinimumTaxableIncome.greaterThan(0)
      ? Decimal.min(
          new Decimal(1),
          roundRate(
            line11TentativeMinimumTaxOnExclusions.dividedBy(line4ExclusionAlternativeMinimumTaxableIncome)
          )
        )
      : new Decimal(0);
  const line25CaliforniaTentativeMinimumTaxOnExclusions = roundDollar(
    line23CaliforniaAlternativeMinimumTaxableIncomeOnExclusions.times(
      line24CaliforniaAlternativeMinimumTaxRateOnExclusions
    )
  );
  const line26RegularTax = nonNegativeAmount(
    input.priorYearLine26RegularTax,
    "CA FTB 3510 line 26 regular tax"
  );
  const line27NetAlternativeMinimumTaxOnExclusions = zeroFloor(
    line25CaliforniaTentativeMinimumTaxOnExclusions.minus(line26RegularTax)
  );
  const line28AlternativeMinimumTax = nonNegativeAmount(
    input.priorYearLine28AlternativeMinimumTax,
    "CA FTB 3510 line 28 alternative minimum tax"
  );
  const line29PriorYearNetAlternativeMinimumTaxOnExclusions = line27NetAlternativeMinimumTaxOnExclusions;
  const line30PriorYearNetAlternativeMinimumTaxOnDeferrals = line28AlternativeMinimumTax.minus(
    line29PriorYearNetAlternativeMinimumTaxOnExclusions
  );
  const line31UnusedAmtCreditCarryover = nonNegativeAmount(
    input.priorYearLine31UnusedAmtCreditCarryover,
    "CA FTB 3510 line 31 unused AMT credit carryover"
  );
  const line32AvailableCreditBeforeLimitation =
    line30PriorYearNetAlternativeMinimumTaxOnDeferrals.plus(line31UnusedAmtCreditCarryover);
  const line33RegularTax = nonNegativeAmount(
    input.currentYearLine33RegularTax,
    "CA FTB 3510 line 33 regular tax"
  );
  const line34ExemptionAndOtherAllowableCredits = nonNegativeAmount(
    input.currentYearLine34ExemptionAndOtherAllowableCredits,
    "CA FTB 3510 line 34 exemption and other allowable credits"
  );
  const line35RegularTaxAfterExemptionAndOtherAllowableCredits = line33RegularTax.minus(
    line34ExemptionAndOtherAllowableCredits
  );
  const line36TentativeMinimumTax = nonNegativeAmount(
    input.currentYearLine36TentativeMinimumTax,
    "CA FTB 3510 line 36 tentative minimum tax"
  );
  const line37CurrentYearLimitation = zeroFloor(
    line35RegularTaxAfterExemptionAndOtherAllowableCredits.minus(line36TentativeMinimumTax)
  );
  const line38CreditAllowedThisYear = line32AvailableCreditBeforeLimitation.greaterThan(0)
    ? min(line32AvailableCreditBeforeLimitation, line37CurrentYearLimitation)
    : new Decimal(0);
  const line39CarryoverToNextYear = line32AvailableCreditBeforeLimitation.greaterThan(0)
    ? zeroFloor(line32AvailableCreditBeforeLimitation.minus(line38CreditAllowedThisYear))
    : new Decimal(0);

  const audit = new AuditTrail();
  audit.record(
    "CA-3510",
    "1",
    "Prior-year exclusion alternative minimum taxable income",
    line1ExclusionAlternativeMinimumTaxableIncome,
    "Supported 2024 Schedule P (540NR) Part I line 15 through line 18 combined input"
  );
  audit.record(
    "CA-3510",
    "2",
    "Prior-year exclusion adjustments",
    line2ExclusionAdjustments,
    "Supported signed 2024 exclusion adjustments and tax preference items treated as exclusions"
  );
  audit.record(
    "CA-3510",
    "3",
    "Prior-year AMT credit net operating loss deduction",
    line3AmtCreditNetOperatingLossDeduction,
    "Supported 2024 AMT credit net operating loss deduction input"
  );
  audit.record(
    "CA-3510",
    "4",
    "Prior-year exclusion alternative minimum taxable income after special adjustment",
    line4ExclusionAlternativeMinimumTaxableIncome,
    "Line 1 + Line 2 - Line 3, floored at 0, plus the published married filing separately adjustment when required",
    {
      "Line 1": line1ExclusionAlternativeMinimumTaxableIncome,
      "Line 2": line2ExclusionAdjustments,
      "Line 3": line3AmtCreditNetOperatingLossDeduction,
      "Prior-year filing status": input.priorYearFilingStatus,
    }
  );
  audit.record("CA-3510", "5", "Prior-year exemption worksheet line 1 amount", line5ExemptionWorksheetLine1Amount, "Supported 2024 Schedule P (540NR) line 22 exemption worksheet line 1 amount");
  audit.record("CA-3510", "6", "Prior-year exemption worksheet line 3 amount", line6ExemptionWorksheetLine3Amount, "Supported 2024 Schedule P (540NR) line 22 exemption worksheet line 3 amount");
  audit.record("CA-3510", "7", "Prior-year excess exclusion alternative minimum taxable income", line7ExcessExclusionAlternativeMinimumTaxableIncome, "max(0, Line 4 - Line 6)", {
    "Line 4": line4ExclusionAlternativeMinimumTaxableIncome,
    "Line 6": line6ExemptionWorksheetLine3Amount,
  });
  audit.record("CA-3510", "8", "Exemption phaseout reduction", line8ExemptionPhaseoutReduction, "Line 7 × 25%", {
    "Line 7": line7ExcessExclusionAlternativeMinimumTaxableIncome,
  });
  audit.record("CA-3510", "9", "Allowed exemption against exclusion AMTI", line9AllowedExemptionAgainstExclusionAmti, "max(0, Line 5 - Line 8)", {
    "Line 5": line5ExemptionWorksheetLine1Amount,
    "Line 8": line8ExemptionPhaseoutReduction,
  });
  audit.record("CA-3510", "10", "Tentative minimum tax base on exclusions", line10TentativeMinimumTaxBaseOnExclusions, "max(0, Line 4 - Line 9)", {
    "Line 4": line4ExclusionAlternativeMinimumTaxableIncome,
    "Line 9": line9AllowedExemptionAgainstExclusionAmti,
  });
  audit.record("CA-3510", "11", "Tentative minimum tax on exclusions", line11TentativeMinimumTaxOnExclusions, "Round(Line 10 × 7%)", {
    "Line 10": line10TentativeMinimumTaxBaseOnExclusions,
  });
  audit.record("CA-3510", "14", "Prior-year exclusion alternative minimum taxable income", line14ExclusionAlternativeMinimumTaxableIncome, "Copy line 4");
  audit.record("CA-3510", "15", "California itemized deductions on exclusions", line15CaliforniaItemizedDeductionsOnExclusions, "Supported 2024 Schedule P (540NR) Part II line 35 input");
  audit.record("CA-3510", "16", "Total AMT adjusted gross income on exclusions", line16TotalAmtAdjustedGrossIncomeOnExclusions, "Line 14 + Line 15", {
    "Line 14": line14ExclusionAlternativeMinimumTaxableIncome,
    "Line 15": line15CaliforniaItemizedDeductionsOnExclusions,
  });
  audit.record("CA-3510", "17", "California adjusted gross income on exclusions", line17CaliforniaAdjustedGrossIncomeOnExclusions, "Supported 2024 Schedule P (540NR) Part II line 28 input");
  audit.record("CA-3510", "18", "California-source exclusion adjustments", line18CaliforniaSourceExclusionAdjustments, "Supported signed California-source exclusions input");
  audit.record("CA-3510", "20", "California AMT adjusted gross income on exclusions", line20CaliforniaAmtAdjustedGrossIncomeOnExclusions, "Line 17 + Line 18", {
    "Line 17": line17CaliforniaAdjustedGrossIncomeOnExclusions,
    "Line 18": line18CaliforniaSourceExclusionAdjustments,
  });
  audit.record(
    "CA-3510",
    "21",
    "Alternative minimum tax rate on exclusions",
    line21AlternativeMinimumTaxRateOnExclusions,
    input.priorYearItemizedDeductions && line16TotalAmtAdjustedGrossIncomeOnExclusions.greaterThan(0)
      ? "min(1.0000, round(Line 20 / Line 16, 4 decimal places))"
      : "0.0000 because the taxpayer did not itemize deductions or line 16 is zero",
    {
      "Line 20": line20CaliforniaAmtAdjustedGrossIncomeOnExclusions,
      "Line 16": line16TotalAmtAdjustedGrossIncomeOnExclusions,
    }
  );
  audit.record("CA-3510", "22", "Prorated AMT itemized deductions on exclusions", line22ProratedAmtItemizedDeductionsOnExclusions, input.priorYearItemizedDeductions ? "Round(Line 15 × Line 21)" : "0 because the taxpayer did not itemize deductions", {
    "Line 15": line15CaliforniaItemizedDeductionsOnExclusions,
    "Line 21": line21AlternativeMinimumTaxRateOnExclusions,
  });
  audit.record("CA-3510", "23", "California alternative minimum taxable income on exclusions", line23CaliforniaAlternativeMinimumTaxableIncomeOnExclusions, input.priorYearItemizedDeductions ? "Line 20 - Line 22" : "Copy line 20 because the taxpayer did not itemize deductions", {
    "Line 20": line20CaliforniaAmtAdjustedGrossIncomeOnExclusions,
    "Line 22": line22ProratedAmtItemizedDeductionsOnExclusions,
  });
  audit.record("CA-3510", "24", "California alternative minimum tax rate on exclusions", line24CaliforniaAlternativeMinimumTaxRateOnExclusions, line4ExclusionAlternativeMinimumTaxableIncome.greaterThan(0) ? "min(1.0000, round(Line 11 / Line 4, 4 decimal places))" : "0.0000 because line 4 is zero", {
    "Line 11": line11TentativeMinimumTaxOnExclusions,
    "Line 4": line4ExclusionAlternativeMinimumTaxableIncome,
  });
  audit.record("CA-3510", "25", "California tentative minimum tax on exclusions", line25CaliforniaTentativeMinimumTaxOnExclusions, "Round(Line 23 × Line 24)", {
    "Line 23": line23CaliforniaAlternativeMinimumTaxableIncomeOnExclusions,
    "Line 24": line24CaliforniaAlternativeMinimumTaxRateOnExclusions,
  });
  audit.record("CA-3510", "26", "Prior-year regular tax", line26RegularTax, "Supported 2024 Schedule P (540NR) Part II line 44 input");
  audit.record("CA-3510", "27", "Net alternative minimum tax on exclusions", line27NetAlternativeMinimumTaxOnExclusions, "max(0, Line 25 - Line 26)", {
    "Line 25": line25CaliforniaTentativeMinimumTaxOnExclusions,
    "Line 26": line26RegularTax,
  });
  audit.record("CA-3510", "28", "Prior-year alternative minimum tax", line28AlternativeMinimumTax, "Supported 2024 Schedule P (540NR) Part II line 45 input under the February 2026 revised instructions");
  audit.record("CA-3510", "29", "Prior-year net alternative minimum tax on exclusions", line29PriorYearNetAlternativeMinimumTaxOnExclusions, "Copy line 27");
  audit.record("CA-3510", "30", "Prior-year net alternative minimum tax on deferrals", line30PriorYearNetAlternativeMinimumTaxOnDeferrals, "Line 28 - Line 29", {
    "Line 28": line28AlternativeMinimumTax,
    "Line 29": line29PriorYearNetAlternativeMinimumTaxOnExclusions,
  });
  audit.record("CA-3510", "31", "Unused AMT credit carryover", line31UnusedAmtCreditCarryover, "Supported 2024 Schedule P (540NR) Part III line 10d input");
  audit.record("CA-3510", "32", "Available credit before limitation", line32AvailableCreditBeforeLimitation, "Line 30 + Line 31", {
    "Line 30": line30PriorYearNetAlternativeMinimumTaxOnDeferrals,
    "Line 31": line31UnusedAmtCreditCarryover,
  });
  audit.record("CA-3510", "33", "Current-year regular tax", line33RegularTax, "Supported 2025 Form 540NR line 37 input");
  audit.record("CA-3510", "34", "Current-year exemption and other allowable credits", line34ExemptionAndOtherAllowableCredits, "Supported 2025 Form 540NR line 39 and Schedule P Section A total excluding the current-year code 188 credit");
  audit.record("CA-3510", "35", "Current-year regular tax after exemption and other allowable credits", line35RegularTaxAfterExemptionAndOtherAllowableCredits, "Line 33 - Line 34", {
    "Line 33": line33RegularTax,
    "Line 34": line34ExemptionAndOtherAllowableCredits,
  });
  audit.record("CA-3510", "36", "Current-year tentative minimum tax", line36TentativeMinimumTax, "Supported 2025 Schedule P (540NR) Part II line 43 input");
  audit.record("CA-3510", "37", "Current-year limitation", line37CurrentYearLimitation, "max(0, Line 35 - Line 36)", {
    "Line 35": line35RegularTaxAfterExemptionAndOtherAllowableCredits,
    "Line 36": line36TentativeMinimumTax,
  });
  audit.record("CA-3510", "38", "Prior-year AMT credit allowed this year", line38CreditAllowedThisYear, line32AvailableCreditBeforeLimitation.greaterThan(0) ? "min(Line 32, Line 37)" : "0 because line 32 is zero or less", {
    "Line 32": line32AvailableCreditBeforeLimitation,
    "Line 37": line37CurrentYearLimitation,
  });
  audit.record("CA-3510", "39", "Prior-year AMT credit carryover to next year", line39CarryoverToNextYear, line32AvailableCreditBeforeLimitation.greaterThan(0) ? "Line 32 - Line 38" : "0 because line 32 is zero or less", {
    "Line 32": line32AvailableCreditBeforeLimitation,
    "Line 38": line38CreditAllowedThisYear,
  });

  return {
    line1ExclusionAlternativeMinimumTaxableIncome,
    line2ExclusionAdjustments,
    line3AmtCreditNetOperatingLossDeduction,
    line4ExclusionAlternativeMinimumTaxableIncome,
    line5ExemptionWorksheetLine1Amount,
    line6ExemptionWorksheetLine3Amount,
    line7ExcessExclusionAlternativeMinimumTaxableIncome,
    line8ExemptionPhaseoutReduction,
    line9AllowedExemptionAgainstExclusionAmti,
    line10TentativeMinimumTaxBaseOnExclusions,
    line11TentativeMinimumTaxOnExclusions,
    line14ExclusionAlternativeMinimumTaxableIncome,
    line15CaliforniaItemizedDeductionsOnExclusions,
    line16TotalAmtAdjustedGrossIncomeOnExclusions,
    line17CaliforniaAdjustedGrossIncomeOnExclusions,
    line18CaliforniaSourceExclusionAdjustments,
    line20CaliforniaAmtAdjustedGrossIncomeOnExclusions,
    line21AlternativeMinimumTaxRateOnExclusions,
    line22ProratedAmtItemizedDeductionsOnExclusions,
    line23CaliforniaAlternativeMinimumTaxableIncomeOnExclusions,
    line24CaliforniaAlternativeMinimumTaxRateOnExclusions,
    line25CaliforniaTentativeMinimumTaxOnExclusions,
    line26RegularTax,
    line27NetAlternativeMinimumTaxOnExclusions,
    line28AlternativeMinimumTax,
    line29PriorYearNetAlternativeMinimumTaxOnExclusions,
    line30PriorYearNetAlternativeMinimumTaxOnDeferrals,
    line31UnusedAmtCreditCarryover,
    line32AvailableCreditBeforeLimitation,
    line33RegularTax,
    line34ExemptionAndOtherAllowableCredits,
    line35RegularTaxAfterExemptionAndOtherAllowableCredits,
    line36TentativeMinimumTax,
    line37CurrentYearLimitation,
    line38CreditAllowedThisYear,
    line39CarryoverToNextYear,
    lines: audit.getLines(),
  };
}
