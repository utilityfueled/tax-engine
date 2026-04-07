/**
 * California Schedule P (540NR) supported AMT computation and Part III credit ordering.
 * Spec: spec/state/ca-schedule-p-540nr.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";

export interface CAScheduleP540NRAdditionalCarryoverCreditInput {
  code: string;
  name: string;
  amount: Decimal | string | number;
  sourceWorksheetCarryoverAmount?: Decimal | string | number;
  electedRefundableAmount?: Decimal | string | number;
}

export interface CAScheduleP540NRAdditionalCarryoverCreditResult {
  line: 16 | 17 | 18 | 19;
  code: string;
  name: string;
  amount: Decimal;
  sourceWorksheetCarryoverAmount: Decimal;
  electedRefundableAmount: Decimal;
  creditUsedThisYear: Decimal;
  remainingNetTax: Decimal;
  carryover: Decimal;
}

export interface CAScheduleP540NRAmtWorksheetInput {
  filingStatus: FilingStatus;
  itemizedDeductions: boolean;
  standardDeduction?: Decimal | string | number;
  line2MedicalAndDentalAdjustment?: Decimal | string | number;
  line3TaxesAdjustment?: Decimal | string | number;
  line4CertainHomeMortgageInterestAdjustment?: Decimal | string | number;
  line5MiscellaneousItemizedDeductionsAdjustment?: Decimal | string | number;
  line6TaxRefundAdjustment?: Decimal | string | number;
  line7InvestmentInterestExpenseAdjustment?: Decimal | string | number;
  line8Post1986DepreciationAdjustment?: Decimal | string | number;
  line9AdjustedGainOrLossAdjustment?: Decimal | string | number;
  line10IncentiveStockOptionsAdjustment?: Decimal | string | number;
  line11PassiveActivitiesAdjustment?: Decimal | string | number;
  line12BeneficiariesOfEstatesAndTrustsAdjustment?: Decimal | string | number;
  line13OtherAdjustmentsAndPreferences?: Decimal | string | number;
  taxableIncome: Decimal | string | number;
  line16NetOperatingLossDeduction?: Decimal | string | number;
  line17AmtiExclusion?: Decimal | string | number;
  line18ItemizedDeductionsLimitation?: Decimal | string | number;
  line20AlternativeMinimumTaxNolDeduction?: Decimal | string | number;
  californiaAdjustedGrossIncome: Decimal | string | number;
  line26NetOperatingLossAdjustment?: Decimal | string | number;
  line27AmtiExclusion?: Decimal | string | number;
  line29AdjustmentsAndPreferences?: Decimal | string | number;
  line31AlternativeMinimumTaxNolDeduction?: Decimal | string | number;
  line33ItemizedDeductions?: Decimal | string | number;
  regularTax: Decimal | string | number;
}

export interface CAScheduleP540NRSupportedCreditsInput {
  subtotalTaxBeforeCredits: Decimal | string | number;
  tentativeMinimumTax?: Decimal | string | number;
  amtWorksheet?: CAScheduleP540NRAmtWorksheetInput;
  line5ChildAndDependentCareCreditAmount?: Decimal | string | number;
  line12JointCustodyHeadOfHouseholdCreditAmount?: Decimal | string | number;
  line13DependentParentCreditAmount?: Decimal | string | number;
  line14SeniorHeadOfHouseholdCreditAmount?: Decimal | string | number;
  creditPercentage?: Decimal | string | number;
  line15RentersCreditAmount?: Decimal | string | number;
  line16Through19CarryoverCredits?: CAScheduleP540NRAdditionalCarryoverCreditInput[];
  line20OtherStateTaxCreditAmount?: Decimal | string | number;
  line21PassThroughEntityElectiveTaxCreditAmount?: Decimal | string | number;
  alternativeMinimumTax?: Decimal | string | number;
  line23SolarEnergyCreditCarryoverAmount?: Decimal | string | number;
  line24CommercialSolarEnergyCreditCarryoverAmount?: Decimal | string | number;
  taxYear: number;
}

export interface CAScheduleP540NRSupportedCreditsResult {
  subtotalTaxBeforeCredits: Decimal;
  tentativeMinimumTax: Decimal;
  alternativeMinimumTax: Decimal;
  line1PartIStandardDeduction: Decimal;
  line2PartIMedicalAndDentalAdjustment: Decimal;
  line3PartITaxesAdjustment: Decimal;
  line4PartICertainHomeMortgageInterestAdjustment: Decimal;
  line5PartIMiscellaneousItemizedDeductionsAdjustment: Decimal;
  line6PartITaxRefundAdjustment: Decimal;
  line7PartIInvestmentInterestExpenseAdjustment: Decimal;
  line8PartIPost1986DepreciationAdjustment: Decimal;
  line9PartIAdjustedGainOrLossAdjustment: Decimal;
  line10PartIIncentiveStockOptionsAdjustment: Decimal;
  line11PartIPassiveActivitiesAdjustment: Decimal;
  line12PartIBeneficiariesOfEstatesAndTrustsAdjustment: Decimal;
  line13PartIOtherAdjustmentsAndPreferences: Decimal;
  line14TotalAdjustmentsAndPreferences: Decimal;
  line15TaxableIncome: Decimal;
  line16NetOperatingLossDeduction: Decimal;
  line17AmtiExclusion: Decimal;
  line18ItemizedDeductionsLimitation: Decimal;
  line19CombinedIncome: Decimal;
  line20AlternativeMinimumTaxNolDeduction: Decimal;
  line21AlternativeMinimumTaxableIncome: Decimal;
  line22ExemptionAmount: Decimal;
  line23TentativeMinimumTaxBase: Decimal;
  line24TotalTentativeMinimumTax: Decimal;
  line25CaliforniaAdjustedGrossIncome: Decimal;
  line26NetOperatingLossAdjustment: Decimal;
  line27CaliforniaAmtiExclusion: Decimal;
  line28CaliforniaCombinedIncome: Decimal;
  line29CaliforniaAdjustmentsAndPreferences: Decimal;
  line30CaliforniaAdjustedAmtiBeforeNol: Decimal;
  line31CaliforniaAlternativeMinimumTaxNolDeduction: Decimal;
  line32CaliforniaAmtAgi: Decimal;
  line33CaliforniaItemizedDeductions: Decimal;
  line34PartIIncludedItemizedDeductions: Decimal;
  line35TotalAmtItemizedDeductions: Decimal;
  line36TotalAlternativeMinimumTaxableIncome: Decimal;
  line37TotalAlternativeMinimumTaxAgi: Decimal;
  line38AlternativeMinimumTaxItemizedDeductionPercentage: Decimal;
  line39ProratedAmtItemizedDeductions: Decimal;
  line40CaliforniaAlternativeMinimumTaxableIncome: Decimal;
  line41CopiedTentativeMinimumTax: Decimal;
  line42CaliforniaAmtRate: Decimal;
  line43CaliforniaTentativeMinimumTax: Decimal;
  line44RegularTax: Decimal;
  line45AlternativeMinimumTax: Decimal;
  line1SubtotalTaxBeforeCredits: Decimal;
  line2TentativeMinimumTax: Decimal;
  line3ExcessTax: Decimal;
  line5aChildAndDependentCareCreditAmount: Decimal;
  line5bChildAndDependentCareCreditUsed: Decimal;
  line5cRemainingExcessTax: Decimal;
  line11cSectionBStartingTaxBalance: Decimal;
  creditPercentage: Decimal;
  line12aJointCustodyHeadOfHouseholdCreditAmount: Decimal;
  line12bJointCustodyHeadOfHouseholdCreditUsed: Decimal;
  line12cRemainingNetTax: Decimal;
  line13aDependentParentCreditAmount: Decimal;
  line13bDependentParentCreditUsed: Decimal;
  line13cRemainingNetTax: Decimal;
  line14aSeniorHeadOfHouseholdCreditAmount: Decimal;
  line14bSeniorHeadOfHouseholdCreditUsed: Decimal;
  line14cRemainingNetTax: Decimal;
  line15aRentersCreditAmount: Decimal;
  line15bRentersCreditUsed: Decimal;
  line15cRemainingNetTax: Decimal;
  line16Through19CarryoverCredits: CAScheduleP540NRAdditionalCarryoverCreditResult[];
  line20aOtherStateTaxCreditAmount: Decimal;
  line20bStartingNetTax: Decimal;
  line20bOtherStateTaxCreditUsed: Decimal;
  line20cRemainingNetTax: Decimal;
  line21aPassThroughEntityElectiveTaxCreditAmount: Decimal;
  line21bPassThroughEntityElectiveTaxCreditUsed: Decimal;
  line21cRemainingNetTax: Decimal;
  line21dPassThroughEntityElectiveTaxCreditCarryover: Decimal;
  line55TotalProratedCredits: Decimal;
  line60AdditionalSpecialCreditsUsed: Decimal;
  line22AlternativeMinimumTax: Decimal;
  line23aSolarEnergyCreditCarryoverAmount: Decimal;
  line23bSolarEnergyCreditUsed: Decimal;
  line23cRemainingAlternativeMinimumTax: Decimal;
  line23dSolarEnergyCreditCarryover: Decimal;
  line24aCommercialSolarEnergyCreditCarryoverAmount: Decimal;
  line24bCommercialSolarEnergyCreditUsed: Decimal;
  line24cRemainingAlternativeMinimumTax: Decimal;
  line24dCommercialSolarEnergyCreditCarryover: Decimal;
  line25AdjustedAlternativeMinimumTax: Decimal;
  line61RentersCreditUsed: Decimal;
  lines: CalculatedLine[];
}

const CA_SCHEDULE_P_540NR_AMT_EXEMPTION_BASE: Record<FilingStatus, Decimal> = {
  single: new Decimal(92749),
  married_filing_jointly: new Decimal(123667),
  married_filing_separately: new Decimal(61830),
  head_of_household: new Decimal(92749),
  qualifying_surviving_spouse: new Decimal(123667),
};

const CA_SCHEDULE_P_540NR_AMT_EXEMPTION_THRESHOLD: Record<FilingStatus, Decimal> = {
  single: new Decimal(347808),
  married_filing_jointly: new Decimal(463745),
  married_filing_separately: new Decimal(231868),
  head_of_household: new Decimal(347808),
  qualifying_surviving_spouse: new Decimal(463745),
};

const CA_SCHEDULE_P_540NR_MFS_LINE21_THRESHOLD = new Decimal(479188);
const CA_SCHEDULE_P_540NR_MFS_LINE21_MAX_ADDITION = new Decimal(61830);
const CA_SCHEDULE_P_540NR_AMT_RATE = new Decimal(0.07);

function nonNegativeAmount(value: Decimal | string | number | undefined, description: string): Decimal {
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

function calculatePartILine21(
  line19CombinedIncome: Decimal,
  line20AmtNolDeduction: Decimal,
  filingStatus: FilingStatus
): Decimal {
  const unadjusted = line19CombinedIncome.minus(line20AmtNolDeduction);
  if (filingStatus !== "married_filing_separately" || !unadjusted.greaterThan(CA_SCHEDULE_P_540NR_MFS_LINE21_THRESHOLD)) {
    return unadjusted;
  }

  const excess = unadjusted.minus(CA_SCHEDULE_P_540NR_MFS_LINE21_THRESHOLD);
  const additionalAmount = Decimal.min(
    excess.times(0.25),
    CA_SCHEDULE_P_540NR_MFS_LINE21_MAX_ADDITION
  );

  return unadjusted.plus(additionalAmount);
}

function calculateExemptionAmount(line21: Decimal, filingStatus: FilingStatus): Decimal {
  const threshold = CA_SCHEDULE_P_540NR_AMT_EXEMPTION_THRESHOLD[filingStatus];
  const base = CA_SCHEDULE_P_540NR_AMT_EXEMPTION_BASE[filingStatus];
  if (!line21.greaterThan(threshold)) {
    return base;
  }

  return zeroFloor(base.minus(line21.minus(threshold).times(0.25)));
}

function recordAmtWorksheetLines(
  audit: AuditTrail,
  input: CAScheduleP540NRAmtWorksheetInput,
  lines: Pick<
    CAScheduleP540NRSupportedCreditsResult,
    | "line1PartIStandardDeduction"
    | "line2PartIMedicalAndDentalAdjustment"
    | "line3PartITaxesAdjustment"
    | "line4PartICertainHomeMortgageInterestAdjustment"
    | "line5PartIMiscellaneousItemizedDeductionsAdjustment"
    | "line6PartITaxRefundAdjustment"
    | "line7PartIInvestmentInterestExpenseAdjustment"
    | "line8PartIPost1986DepreciationAdjustment"
    | "line9PartIAdjustedGainOrLossAdjustment"
    | "line10PartIIncentiveStockOptionsAdjustment"
    | "line11PartIPassiveActivitiesAdjustment"
    | "line12PartIBeneficiariesOfEstatesAndTrustsAdjustment"
    | "line13PartIOtherAdjustmentsAndPreferences"
    | "line14TotalAdjustmentsAndPreferences"
    | "line15TaxableIncome"
    | "line16NetOperatingLossDeduction"
    | "line17AmtiExclusion"
    | "line18ItemizedDeductionsLimitation"
    | "line19CombinedIncome"
    | "line20AlternativeMinimumTaxNolDeduction"
    | "line21AlternativeMinimumTaxableIncome"
    | "line22ExemptionAmount"
    | "line23TentativeMinimumTaxBase"
    | "line24TotalTentativeMinimumTax"
    | "line25CaliforniaAdjustedGrossIncome"
    | "line26NetOperatingLossAdjustment"
    | "line27CaliforniaAmtiExclusion"
    | "line28CaliforniaCombinedIncome"
    | "line29CaliforniaAdjustmentsAndPreferences"
    | "line30CaliforniaAdjustedAmtiBeforeNol"
    | "line31CaliforniaAlternativeMinimumTaxNolDeduction"
    | "line32CaliforniaAmtAgi"
    | "line33CaliforniaItemizedDeductions"
    | "line34PartIIncludedItemizedDeductions"
    | "line35TotalAmtItemizedDeductions"
    | "line36TotalAlternativeMinimumTaxableIncome"
    | "line37TotalAlternativeMinimumTaxAgi"
    | "line38AlternativeMinimumTaxItemizedDeductionPercentage"
    | "line39ProratedAmtItemizedDeductions"
    | "line40CaliforniaAlternativeMinimumTaxableIncome"
    | "line41CopiedTentativeMinimumTax"
    | "line42CaliforniaAmtRate"
    | "line43CaliforniaTentativeMinimumTax"
    | "line44RegularTax"
    | "line45AlternativeMinimumTax"
  >
): void {
  audit.record("CA-P-540NR", "1", "Part I standard deduction addback", lines.line1PartIStandardDeduction, input.itemizedDeductions ? "0 because the taxpayer itemized deductions" : "Supported Form 540NR line 18 standard deduction");
  audit.record("CA-P-540NR", "2", "Part I medical and dental adjustment", lines.line2PartIMedicalAndDentalAdjustment, "Supported Part I line 2 input");
  audit.record("CA-P-540NR", "3", "Part I taxes adjustment", lines.line3PartITaxesAdjustment, "Supported Part I line 3 input");
  audit.record("CA-P-540NR", "4", "Part I certain home mortgage interest adjustment", lines.line4PartICertainHomeMortgageInterestAdjustment, "Supported Part I line 4 input");
  audit.record("CA-P-540NR", "5", "Part I miscellaneous itemized deductions adjustment", lines.line5PartIMiscellaneousItemizedDeductionsAdjustment, "Supported Part I line 5 input");
  audit.record("CA-P-540NR", "6", "Part I tax refund adjustment", lines.line6PartITaxRefundAdjustment, "Supported Part I line 6 input");
  audit.record("CA-P-540NR", "7", "Part I investment interest expense adjustment", lines.line7PartIInvestmentInterestExpenseAdjustment, "Supported Part I line 7 input");
  audit.record("CA-P-540NR", "8", "Part I post-1986 depreciation adjustment", lines.line8PartIPost1986DepreciationAdjustment, "Supported Part I line 8 input");
  audit.record("CA-P-540NR", "9", "Part I adjusted gain or loss adjustment", lines.line9PartIAdjustedGainOrLossAdjustment, "Supported Part I line 9 input");
  audit.record("CA-P-540NR", "10", "Part I incentive stock options adjustment", lines.line10PartIIncentiveStockOptionsAdjustment, "Supported Part I line 10 input");
  audit.record("CA-P-540NR", "11", "Part I passive activities adjustment", lines.line11PartIPassiveActivitiesAdjustment, "Supported Part I line 11 input");
  audit.record("CA-P-540NR", "12", "Part I beneficiaries of estates and trusts adjustment", lines.line12PartIBeneficiariesOfEstatesAndTrustsAdjustment, "Supported Part I line 12 input");
  audit.record("CA-P-540NR", "13", "Part I other adjustments and preferences", lines.line13PartIOtherAdjustmentsAndPreferences, "Supported Part I line 13 input");
  audit.record("CA-P-540NR", "14", "Part I total adjustments and preferences", lines.line14TotalAdjustmentsAndPreferences, "Combine line 1 through line 13");
  audit.record("CA-P-540NR", "15", "Part I taxable income", lines.line15TaxableIncome, "Supported input from Form 540NR line 19");
  audit.record("CA-P-540NR", "16", "Part I net operating loss deduction", lines.line16NetOperatingLossDeduction, "Supported Part I line 16 input");
  audit.record("CA-P-540NR", "17", "Part I AMTI exclusion", lines.line17AmtiExclusion, "Supported Part I line 17 input");
  audit.record("CA-P-540NR", "18", "Part I itemized deductions limitation", lines.line18ItemizedDeductionsLimitation, "Supported Part I line 18 input");
  audit.record("CA-P-540NR", "19", "Part I combined income", lines.line19CombinedIncome, "Line 14 + Line 15 - Line 16 - Line 17 - Line 18");
  audit.record("CA-P-540NR", "20", "Part I AMT NOL deduction", lines.line20AlternativeMinimumTaxNolDeduction, "Supported line 20 input limited to 90% of line 19");
  audit.record("CA-P-540NR", "21", "Part I alternative minimum taxable income", lines.line21AlternativeMinimumTaxableIncome, "Line 19 - Line 20, plus the published married filing separately adjustment when required");
  audit.record("CA-P-540NR", "22", "Part II exemption amount", lines.line22ExemptionAmount, "Published 2025 exemption table with 25% phaseout");
  audit.record("CA-P-540NR", "23", "Part II tentative minimum tax base", lines.line23TentativeMinimumTaxBase, "max(0, Line 21 - Line 22)");
  audit.record("CA-P-540NR", "24", "Part II total tentative minimum tax", lines.line24TotalTentativeMinimumTax, "Round(Line 23 × 7%)");
  audit.record("CA-P-540NR", "25", "Part II California adjusted gross income", lines.line25CaliforniaAdjustedGrossIncome, "Supported Part II line 25 input");
  audit.record("CA-P-540NR", "26", "Part II net operating loss adjustment", lines.line26NetOperatingLossAdjustment, "Supported Part II line 26 input");
  audit.record("CA-P-540NR", "27", "Part II AMTI exclusion", lines.line27CaliforniaAmtiExclusion, "Supported Part II line 27 input");
  audit.record("CA-P-540NR", "28", "Part II California combined income", lines.line28CaliforniaCombinedIncome, "Line 25 - Line 26 - Line 27");
  audit.record("CA-P-540NR", "29", "Part II adjustments and preferences", lines.line29CaliforniaAdjustmentsAndPreferences, "Supported Part II line 29 input");
  audit.record("CA-P-540NR", "30", "Part II California adjusted AMTI before AMT NOL deduction", lines.line30CaliforniaAdjustedAmtiBeforeNol, "Line 28 + Line 29");
  audit.record("CA-P-540NR", "31", "Part II AMT NOL deduction", lines.line31CaliforniaAlternativeMinimumTaxNolDeduction, "Supported line 31 input limited to 90% of line 30");
  audit.record("CA-P-540NR", "32", "Part II California AMT AGI", lines.line32CaliforniaAmtAgi, "Line 30 - Line 31");
  audit.record("CA-P-540NR", "33", "Part II California itemized deductions", lines.line33CaliforniaItemizedDeductions, input.itemizedDeductions ? "Supported Part II line 33 input" : "0 because the taxpayer did not itemize deductions");
  audit.record("CA-P-540NR", "34", "Part II itemized deductions already included in Part I", lines.line34PartIIncludedItemizedDeductions, "Line 2 + Line 3 + Line 4 + Line 5 + Line 7");
  audit.record("CA-P-540NR", "35", "Part II total AMT itemized deductions", lines.line35TotalAmtItemizedDeductions, input.itemizedDeductions ? "Line 33 + Line 34" : "0 because the taxpayer did not itemize deductions");
  audit.record("CA-P-540NR", "36", "Part II total alternative minimum taxable income", lines.line36TotalAlternativeMinimumTaxableIncome, "Copy Part I line 21");
  audit.record("CA-P-540NR", "37", "Part II total alternative minimum tax AGI", lines.line37TotalAlternativeMinimumTaxAgi, input.itemizedDeductions ? "Line 35 + Line 36" : "0 because the taxpayer did not itemize deductions");
  audit.record("CA-P-540NR", "38", "Part II AMT itemized deduction percentage", lines.line38AlternativeMinimumTaxItemizedDeductionPercentage, input.itemizedDeductions ? "min(1.0000, round(Line 32 / Line 37, 4))" : "0 because the taxpayer did not itemize deductions");
  audit.record("CA-P-540NR", "39", "Part II prorated AMT itemized deductions", lines.line39ProratedAmtItemizedDeductions, input.itemizedDeductions ? "Round(Line 35 × Line 38)" : "0 because the taxpayer did not itemize deductions");
  audit.record("CA-P-540NR", "40", "Part II California AMTI", lines.line40CaliforniaAlternativeMinimumTaxableIncome, input.itemizedDeductions ? "Line 32 - Line 39" : "Copy Line 32 because the taxpayer did not itemize deductions");
  audit.record("CA-P-540NR", "41", "Part II copied tentative minimum tax", lines.line41CopiedTentativeMinimumTax, "Copy Line 24");
  audit.record("CA-P-540NR", "42", "Part II California AMT rate", lines.line42CaliforniaAmtRate, "If Line 21 is greater than 0, round(Line 41 / Line 21, 4), otherwise 0");
  audit.record("CA-P-540NR", "43", "Part II California tentative minimum tax", lines.line43CaliforniaTentativeMinimumTax, "Round(Line 40 × Line 42)");
  audit.record("CA-P-540NR", "44", "Part II regular tax", lines.line44RegularTax, "Supported input from Form 540NR line 37");
  audit.record("CA-P-540NR", "45", "Part II alternative minimum tax", lines.line45AlternativeMinimumTax, "max(0, Line 43 - Line 44)");
}

export function calculateCAScheduleP540NRSupportedCredits(
  input: CAScheduleP540NRSupportedCreditsInput
): CAScheduleP540NRSupportedCreditsResult {
  if (input.taxYear !== 2025) {
    throw new Error(`CA Schedule P (540NR) supported credit ordering not available for ${input.taxYear}`);
  }
  if (input.amtWorksheet !== undefined && input.tentativeMinimumTax !== undefined) {
    throw new Error(
      "CA Schedule P (540NR) direct tentative minimum tax input cannot be combined with supported AMT worksheet inputs"
    );
  }
  if (input.amtWorksheet !== undefined && input.alternativeMinimumTax !== undefined) {
    throw new Error(
      "CA Schedule P (540NR) direct alternative minimum tax input cannot be combined with supported AMT worksheet inputs"
    );
  }

  const line1SubtotalTaxBeforeCredits = nonNegativeAmount(
    input.subtotalTaxBeforeCredits,
    "CA Schedule P (540NR) line 1 subtotal tax before credits"
  );

  let line1PartIStandardDeduction = new Decimal(0);
  let line2PartIMedicalAndDentalAdjustment = new Decimal(0);
  let line3PartITaxesAdjustment = new Decimal(0);
  let line4PartICertainHomeMortgageInterestAdjustment = new Decimal(0);
  let line5PartIMiscellaneousItemizedDeductionsAdjustment = new Decimal(0);
  let line6PartITaxRefundAdjustment = new Decimal(0);
  let line7PartIInvestmentInterestExpenseAdjustment = new Decimal(0);
  let line8PartIPost1986DepreciationAdjustment = new Decimal(0);
  let line9PartIAdjustedGainOrLossAdjustment = new Decimal(0);
  let line10PartIIncentiveStockOptionsAdjustment = new Decimal(0);
  let line11PartIPassiveActivitiesAdjustment = new Decimal(0);
  let line12PartIBeneficiariesOfEstatesAndTrustsAdjustment = new Decimal(0);
  let line13PartIOtherAdjustmentsAndPreferences = new Decimal(0);
  let line14TotalAdjustmentsAndPreferences = new Decimal(0);
  let line15TaxableIncome = new Decimal(0);
  let line16NetOperatingLossDeduction = new Decimal(0);
  let line17AmtiExclusion = new Decimal(0);
  let line18ItemizedDeductionsLimitation = new Decimal(0);
  let line19CombinedIncome = new Decimal(0);
  let line20AlternativeMinimumTaxNolDeduction = new Decimal(0);
  let line21AlternativeMinimumTaxableIncome = new Decimal(0);
  let line22ExemptionAmount = new Decimal(0);
  let line23TentativeMinimumTaxBase = new Decimal(0);
  let line24TotalTentativeMinimumTax = new Decimal(0);
  let line25CaliforniaAdjustedGrossIncome = new Decimal(0);
  let line26NetOperatingLossAdjustment = new Decimal(0);
  let line27CaliforniaAmtiExclusion = new Decimal(0);
  let line28CaliforniaCombinedIncome = new Decimal(0);
  let line29CaliforniaAdjustmentsAndPreferences = new Decimal(0);
  let line30CaliforniaAdjustedAmtiBeforeNol = new Decimal(0);
  let line31CaliforniaAlternativeMinimumTaxNolDeduction = new Decimal(0);
  let line32CaliforniaAmtAgi = new Decimal(0);
  let line33CaliforniaItemizedDeductions = new Decimal(0);
  let line34PartIIncludedItemizedDeductions = new Decimal(0);
  let line35TotalAmtItemizedDeductions = new Decimal(0);
  let line36TotalAlternativeMinimumTaxableIncome = new Decimal(0);
  let line37TotalAlternativeMinimumTaxAgi = new Decimal(0);
  let line38AlternativeMinimumTaxItemizedDeductionPercentage = new Decimal(0);
  let line39ProratedAmtItemizedDeductions = new Decimal(0);
  let line40CaliforniaAlternativeMinimumTaxableIncome = new Decimal(0);
  let line41CopiedTentativeMinimumTax = new Decimal(0);
  let line42CaliforniaAmtRate = new Decimal(0);
  let line43CaliforniaTentativeMinimumTax = new Decimal(0);
  let line44RegularTax = new Decimal(0);
  let line45AlternativeMinimumTax = new Decimal(0);

  if (input.amtWorksheet !== undefined) {
    const amtWorksheet = input.amtWorksheet;
    line1PartIStandardDeduction = amtWorksheet.itemizedDeductions
      ? new Decimal(0)
      : nonNegativeAmount(
          amtWorksheet.standardDeduction,
          "CA Schedule P (540NR) Part I line 1 standard deduction"
        );
    line2PartIMedicalAndDentalAdjustment = signedAmount(amtWorksheet.line2MedicalAndDentalAdjustment);
    line3PartITaxesAdjustment = signedAmount(amtWorksheet.line3TaxesAdjustment);
    line4PartICertainHomeMortgageInterestAdjustment = signedAmount(amtWorksheet.line4CertainHomeMortgageInterestAdjustment);
    line5PartIMiscellaneousItemizedDeductionsAdjustment = signedAmount(amtWorksheet.line5MiscellaneousItemizedDeductionsAdjustment);
    line6PartITaxRefundAdjustment = signedAmount(amtWorksheet.line6TaxRefundAdjustment);
    line7PartIInvestmentInterestExpenseAdjustment = signedAmount(amtWorksheet.line7InvestmentInterestExpenseAdjustment);
    line8PartIPost1986DepreciationAdjustment = signedAmount(amtWorksheet.line8Post1986DepreciationAdjustment);
    line9PartIAdjustedGainOrLossAdjustment = signedAmount(amtWorksheet.line9AdjustedGainOrLossAdjustment);
    line10PartIIncentiveStockOptionsAdjustment = signedAmount(amtWorksheet.line10IncentiveStockOptionsAdjustment);
    line11PartIPassiveActivitiesAdjustment = signedAmount(amtWorksheet.line11PassiveActivitiesAdjustment);
    line12PartIBeneficiariesOfEstatesAndTrustsAdjustment = signedAmount(amtWorksheet.line12BeneficiariesOfEstatesAndTrustsAdjustment);
    line13PartIOtherAdjustmentsAndPreferences = signedAmount(amtWorksheet.line13OtherAdjustmentsAndPreferences);
    line14TotalAdjustmentsAndPreferences = sum(
      line1PartIStandardDeduction,
      line2PartIMedicalAndDentalAdjustment,
      line3PartITaxesAdjustment,
      line4PartICertainHomeMortgageInterestAdjustment,
      line5PartIMiscellaneousItemizedDeductionsAdjustment,
      line6PartITaxRefundAdjustment,
      line7PartIInvestmentInterestExpenseAdjustment,
      line8PartIPost1986DepreciationAdjustment,
      line9PartIAdjustedGainOrLossAdjustment,
      line10PartIIncentiveStockOptionsAdjustment,
      line11PartIPassiveActivitiesAdjustment,
      line12PartIBeneficiariesOfEstatesAndTrustsAdjustment,
      line13PartIOtherAdjustmentsAndPreferences
    );
    line15TaxableIncome = signedAmount(amtWorksheet.taxableIncome);
    line16NetOperatingLossDeduction = nonNegativeAmount(
      amtWorksheet.line16NetOperatingLossDeduction,
      "CA Schedule P (540NR) Part I line 16 net operating loss deduction"
    );
    line17AmtiExclusion = nonNegativeAmount(
      amtWorksheet.line17AmtiExclusion,
      "CA Schedule P (540NR) Part I line 17 AMTI exclusion"
    );
    line18ItemizedDeductionsLimitation = nonNegativeAmount(
      amtWorksheet.line18ItemizedDeductionsLimitation,
      "CA Schedule P (540NR) Part I line 18 itemized deductions limitation"
    );
    line19CombinedIncome = sum(
      line14TotalAdjustmentsAndPreferences,
      line15TaxableIncome,
      line16NetOperatingLossDeduction.negated(),
      line17AmtiExclusion.negated(),
      line18ItemizedDeductionsLimitation.negated()
    );
    const line20Limit = zeroFloor(line19CombinedIncome.times(0.9));
    line20AlternativeMinimumTaxNolDeduction = Decimal.min(
      nonNegativeAmount(
        amtWorksheet.line20AlternativeMinimumTaxNolDeduction,
        "CA Schedule P (540NR) Part I line 20 AMT NOL deduction"
      ),
      line20Limit
    );
    line21AlternativeMinimumTaxableIncome = calculatePartILine21(
      line19CombinedIncome,
      line20AlternativeMinimumTaxNolDeduction,
      amtWorksheet.filingStatus
    );
    line22ExemptionAmount = calculateExemptionAmount(line21AlternativeMinimumTaxableIncome, amtWorksheet.filingStatus);
    line23TentativeMinimumTaxBase = zeroFloor(line21AlternativeMinimumTaxableIncome.minus(line22ExemptionAmount));
    line24TotalTentativeMinimumTax = roundDollar(line23TentativeMinimumTaxBase.times(CA_SCHEDULE_P_540NR_AMT_RATE));
    line25CaliforniaAdjustedGrossIncome = signedAmount(amtWorksheet.californiaAdjustedGrossIncome);
    line26NetOperatingLossAdjustment = nonNegativeAmount(
      amtWorksheet.line26NetOperatingLossAdjustment,
      "CA Schedule P (540NR) Part II line 26 net operating loss adjustment"
    );
    line27CaliforniaAmtiExclusion = nonNegativeAmount(
      amtWorksheet.line27AmtiExclusion,
      "CA Schedule P (540NR) Part II line 27 AMTI exclusion"
    );
    line28CaliforniaCombinedIncome = sum(
      line25CaliforniaAdjustedGrossIncome,
      line26NetOperatingLossAdjustment.negated(),
      line27CaliforniaAmtiExclusion.negated()
    );
    line29CaliforniaAdjustmentsAndPreferences = signedAmount(amtWorksheet.line29AdjustmentsAndPreferences);
    line30CaliforniaAdjustedAmtiBeforeNol = line28CaliforniaCombinedIncome.plus(line29CaliforniaAdjustmentsAndPreferences);
    const line31Limit = zeroFloor(line30CaliforniaAdjustedAmtiBeforeNol.times(0.9));
    line31CaliforniaAlternativeMinimumTaxNolDeduction = Decimal.min(
      nonNegativeAmount(
        amtWorksheet.line31AlternativeMinimumTaxNolDeduction,
        "CA Schedule P (540NR) Part II line 31 AMT NOL deduction"
      ),
      line31Limit
    );
    line32CaliforniaAmtAgi = line30CaliforniaAdjustedAmtiBeforeNol.minus(line31CaliforniaAlternativeMinimumTaxNolDeduction);
    line33CaliforniaItemizedDeductions = amtWorksheet.itemizedDeductions
      ? nonNegativeAmount(
          amtWorksheet.line33ItemizedDeductions,
          "CA Schedule P (540NR) Part II line 33 itemized deductions"
        )
      : new Decimal(0);
    line34PartIIncludedItemizedDeductions = sum(
      line2PartIMedicalAndDentalAdjustment,
      line3PartITaxesAdjustment,
      line4PartICertainHomeMortgageInterestAdjustment,
      line5PartIMiscellaneousItemizedDeductionsAdjustment,
      line7PartIInvestmentInterestExpenseAdjustment
    );
    line35TotalAmtItemizedDeductions = amtWorksheet.itemizedDeductions
      ? line33CaliforniaItemizedDeductions.plus(line34PartIIncludedItemizedDeductions)
      : new Decimal(0);
    line36TotalAlternativeMinimumTaxableIncome = line21AlternativeMinimumTaxableIncome;
    line37TotalAlternativeMinimumTaxAgi = amtWorksheet.itemizedDeductions
      ? line35TotalAmtItemizedDeductions.plus(line36TotalAlternativeMinimumTaxableIncome)
      : new Decimal(0);
    line38AlternativeMinimumTaxItemizedDeductionPercentage =
      amtWorksheet.itemizedDeductions && line37TotalAlternativeMinimumTaxAgi.greaterThan(0)
        ? Decimal.max(
            new Decimal(0),
            Decimal.min(
              new Decimal(1),
              roundRate(line32CaliforniaAmtAgi.dividedBy(line37TotalAlternativeMinimumTaxAgi))
            )
          )
        : new Decimal(0);
    line39ProratedAmtItemizedDeductions = amtWorksheet.itemizedDeductions
      ? roundDollar(line35TotalAmtItemizedDeductions.times(line38AlternativeMinimumTaxItemizedDeductionPercentage))
      : new Decimal(0);
    line40CaliforniaAlternativeMinimumTaxableIncome = amtWorksheet.itemizedDeductions
      ? line32CaliforniaAmtAgi.minus(line39ProratedAmtItemizedDeductions)
      : line32CaliforniaAmtAgi;
    line41CopiedTentativeMinimumTax = line24TotalTentativeMinimumTax;
    line42CaliforniaAmtRate = line21AlternativeMinimumTaxableIncome.greaterThan(0)
      ? roundRate(line41CopiedTentativeMinimumTax.dividedBy(line21AlternativeMinimumTaxableIncome))
      : new Decimal(0);
    line43CaliforniaTentativeMinimumTax = roundDollar(
      line40CaliforniaAlternativeMinimumTaxableIncome.times(line42CaliforniaAmtRate)
    );
    line44RegularTax = nonNegativeAmount(
      amtWorksheet.regularTax,
      "CA Schedule P (540NR) Part II line 44 regular tax"
    );
    line45AlternativeMinimumTax = zeroFloor(line43CaliforniaTentativeMinimumTax.minus(line44RegularTax));
  }

  const line2TentativeMinimumTax = input.amtWorksheet === undefined
    ? nonNegativeAmount(input.tentativeMinimumTax, "CA Schedule P (540NR) line 2 tentative minimum tax")
    : line43CaliforniaTentativeMinimumTax;
  const line3ExcessTax = zeroFloor(line1SubtotalTaxBeforeCredits.minus(line2TentativeMinimumTax));

  const line5aChildAndDependentCareCreditAmount = nonNegativeAmount(
    input.line5ChildAndDependentCareCreditAmount,
    "CA Schedule P (540NR) line 5 child and dependent care credit amount"
  );
  const line5bChildAndDependentCareCreditUsed = min(line5aChildAndDependentCareCreditAmount, line3ExcessTax);
  const line5cRemainingExcessTax = line3ExcessTax.minus(line5bChildAndDependentCareCreditUsed);

  const line11cSectionBStartingTaxBalance = line3ExcessTax.equals(0)
    ? line1SubtotalTaxBeforeCredits
    : line2TentativeMinimumTax.plus(line5cRemainingExcessTax);

  const creditPercentage = Decimal.min(
    new Decimal(1),
    nonNegativeAmount(input.creditPercentage, "CA Schedule P (540NR) line 12 through line 14 credit percentage")
  );
  const line12aJointCustodyHeadOfHouseholdCreditAmount = roundDollar(
    nonNegativeAmount(
      input.line12JointCustodyHeadOfHouseholdCreditAmount,
      "CA Schedule P (540NR) line 12 Joint Custody Head of Household credit amount"
    ).times(creditPercentage)
  );
  const line12bJointCustodyHeadOfHouseholdCreditUsed = min(
    line12aJointCustodyHeadOfHouseholdCreditAmount,
    line11cSectionBStartingTaxBalance
  );
  const line12cRemainingNetTax = line11cSectionBStartingTaxBalance.minus(
    line12bJointCustodyHeadOfHouseholdCreditUsed
  );

  const line13aDependentParentCreditAmount = roundDollar(
    nonNegativeAmount(
      input.line13DependentParentCreditAmount,
      "CA Schedule P (540NR) line 13 Dependent Parent credit amount"
    ).times(creditPercentage)
  );
  const line13bDependentParentCreditUsed = min(line13aDependentParentCreditAmount, line12cRemainingNetTax);
  const line13cRemainingNetTax = line12cRemainingNetTax.minus(line13bDependentParentCreditUsed);

  const line14aSeniorHeadOfHouseholdCreditAmount = roundDollar(
    nonNegativeAmount(
      input.line14SeniorHeadOfHouseholdCreditAmount,
      "CA Schedule P (540NR) line 14 Senior Head of Household credit amount"
    ).times(creditPercentage)
  );
  const line14bSeniorHeadOfHouseholdCreditUsed = min(line14aSeniorHeadOfHouseholdCreditAmount, line13cRemainingNetTax);
  const line14cRemainingNetTax = line13cRemainingNetTax.minus(line14bSeniorHeadOfHouseholdCreditUsed);

  const line55TotalProratedCredits = sum(
    line12bJointCustodyHeadOfHouseholdCreditUsed,
    line13bDependentParentCreditUsed,
    line14bSeniorHeadOfHouseholdCreditUsed
  );

  const line15aRentersCreditAmount = nonNegativeAmount(
    input.line15RentersCreditAmount,
    "CA Schedule P (540NR) line 15 renter's credit amount"
  );
  const line15bRentersCreditUsed = min(line15aRentersCreditAmount, line14cRemainingNetTax);
  const line15cRemainingNetTax = line14cRemainingNetTax.minus(line15bRentersCreditUsed);

  const additionalCarryoverCreditInputs = input.line16Through19CarryoverCredits ?? [];
  if (additionalCarryoverCreditInputs.length > 4) {
    throw new Error("CA Schedule P (540NR) supports at most four additional Section B2 carryover credits on lines 16 through 19");
  }

  const line16Through19CarryoverCredits: CAScheduleP540NRAdditionalCarryoverCreditResult[] = [];
  let currentCarryoverStartingNetTax = line15cRemainingNetTax;

  for (const [index, carryoverCreditInput] of additionalCarryoverCreditInputs.entries()) {
    const line = (16 + index) as CAScheduleP540NRAdditionalCarryoverCreditResult["line"];
    const code = carryoverCreditInput.code.trim();
    const name = carryoverCreditInput.name.trim();
    if (code.length === 0) {
      throw new Error(`CA Schedule P (540NR) line ${line} additional carryover credit code is required`);
    }
    if (name.length === 0) {
      throw new Error(`CA Schedule P (540NR) line ${line} additional carryover credit name is required`);
    }

    const amount = nonNegativeAmount(
      carryoverCreditInput.amount,
      `CA Schedule P (540NR) line ${line} additional carryover credit amount`
    );
    const sourceWorksheetCarryoverAmount = nonNegativeAmount(
      carryoverCreditInput.sourceWorksheetCarryoverAmount,
      `CA Schedule P (540NR) line ${line} source worksheet carryover amount`
    );
    const electedRefundableAmount = nonNegativeAmount(
      carryoverCreditInput.electedRefundableAmount,
      `CA Schedule P (540NR) line ${line} elected refundable credit amount`
    );
    const creditUsedThisYear = min(amount, currentCarryoverStartingNetTax);
    const unusedCredit = amount.minus(creditUsedThisYear);
    if (electedRefundableAmount.greaterThan(unusedCredit)) {
      throw new Error(
        `CA Schedule P (540NR) line ${line} elected refundable amount cannot exceed the unused credit after current-year use`
      );
    }

    const remainingNetTax = currentCarryoverStartingNetTax.minus(creditUsedThisYear);
    const carryover = sourceWorksheetCarryoverAmount.plus(
      zeroFloor(unusedCredit.minus(electedRefundableAmount))
    );
    line16Through19CarryoverCredits.push({
      line,
      code,
      name,
      amount,
      sourceWorksheetCarryoverAmount,
      electedRefundableAmount,
      creditUsedThisYear,
      remainingNetTax,
      carryover,
    });
    currentCarryoverStartingNetTax = remainingNetTax;
  }

  const line20bStartingNetTax = line16Through19CarryoverCredits.length > 0
    ? line16Through19CarryoverCredits[line16Through19CarryoverCredits.length - 1].remainingNetTax
    : line15cRemainingNetTax;
  const line20aOtherStateTaxCreditAmount = nonNegativeAmount(
    input.line20OtherStateTaxCreditAmount,
    "CA Schedule P (540NR) line 20 Other state tax credit amount"
  );
  const line20bOtherStateTaxCreditUsed = min(line20aOtherStateTaxCreditAmount, line20bStartingNetTax);
  const line20cRemainingNetTax = line20bStartingNetTax.minus(line20bOtherStateTaxCreditUsed);

  const line21aPassThroughEntityElectiveTaxCreditAmount = nonNegativeAmount(
    input.line21PassThroughEntityElectiveTaxCreditAmount,
    "CA Schedule P (540NR) line 21 pass-through entity elective tax credit amount"
  );
  const line21bPassThroughEntityElectiveTaxCreditUsed = min(
    line21aPassThroughEntityElectiveTaxCreditAmount,
    line20cRemainingNetTax
  );
  const line21cRemainingNetTax = line20cRemainingNetTax.minus(line21bPassThroughEntityElectiveTaxCreditUsed);
  const line21dPassThroughEntityElectiveTaxCreditCarryover =
    line21aPassThroughEntityElectiveTaxCreditAmount.minus(line21bPassThroughEntityElectiveTaxCreditUsed);

  const line60AdditionalSpecialCreditsUsed = sum(
    ...line16Through19CarryoverCredits.map((credit) => credit.creditUsedThisYear),
    line20bOtherStateTaxCreditUsed,
    line21bPassThroughEntityElectiveTaxCreditUsed
  );

  const line22AlternativeMinimumTax = input.amtWorksheet === undefined
    ? nonNegativeAmount(input.alternativeMinimumTax, "CA Schedule P (540NR) line 22 alternative minimum tax")
    : line45AlternativeMinimumTax;
  const line23aSolarEnergyCreditCarryoverAmount = nonNegativeAmount(
    input.line23SolarEnergyCreditCarryoverAmount,
    "CA Schedule P (540NR) line 23 solar energy credit carryover amount"
  );
  const line23bSolarEnergyCreditUsed = min(line23aSolarEnergyCreditCarryoverAmount, line22AlternativeMinimumTax);
  const line23cRemainingAlternativeMinimumTax = line22AlternativeMinimumTax.minus(line23bSolarEnergyCreditUsed);
  const line23dSolarEnergyCreditCarryover =
    line23aSolarEnergyCreditCarryoverAmount.minus(line23bSolarEnergyCreditUsed);

  const line24StartingAlternativeMinimumTax = input.line23SolarEnergyCreditCarryoverAmount === undefined
    ? line22AlternativeMinimumTax
    : line23cRemainingAlternativeMinimumTax;
  const line24aCommercialSolarEnergyCreditCarryoverAmount = nonNegativeAmount(
    input.line24CommercialSolarEnergyCreditCarryoverAmount,
    "CA Schedule P (540NR) line 24 commercial solar energy credit carryover amount"
  );
  const line24bCommercialSolarEnergyCreditUsed = min(
    line24aCommercialSolarEnergyCreditCarryoverAmount,
    line24StartingAlternativeMinimumTax
  );
  const line24cRemainingAlternativeMinimumTax =
    line24StartingAlternativeMinimumTax.minus(line24bCommercialSolarEnergyCreditUsed);
  const line24dCommercialSolarEnergyCreditCarryover =
    line24aCommercialSolarEnergyCreditCarryoverAmount.minus(line24bCommercialSolarEnergyCreditUsed);
  const line25AdjustedAlternativeMinimumTax = input.line24CommercialSolarEnergyCreditCarryoverAmount === undefined
    ? line24StartingAlternativeMinimumTax
    : line24cRemainingAlternativeMinimumTax;

  const audit = new AuditTrail();
  if (input.amtWorksheet !== undefined) {
    recordAmtWorksheetLines(audit, input.amtWorksheet, {
      line1PartIStandardDeduction,
      line2PartIMedicalAndDentalAdjustment,
      line3PartITaxesAdjustment,
      line4PartICertainHomeMortgageInterestAdjustment,
      line5PartIMiscellaneousItemizedDeductionsAdjustment,
      line6PartITaxRefundAdjustment,
      line7PartIInvestmentInterestExpenseAdjustment,
      line8PartIPost1986DepreciationAdjustment,
      line9PartIAdjustedGainOrLossAdjustment,
      line10PartIIncentiveStockOptionsAdjustment,
      line11PartIPassiveActivitiesAdjustment,
      line12PartIBeneficiariesOfEstatesAndTrustsAdjustment,
      line13PartIOtherAdjustmentsAndPreferences,
      line14TotalAdjustmentsAndPreferences,
      line15TaxableIncome,
      line16NetOperatingLossDeduction,
      line17AmtiExclusion,
      line18ItemizedDeductionsLimitation,
      line19CombinedIncome,
      line20AlternativeMinimumTaxNolDeduction,
      line21AlternativeMinimumTaxableIncome,
      line22ExemptionAmount,
      line23TentativeMinimumTaxBase,
      line24TotalTentativeMinimumTax,
      line25CaliforniaAdjustedGrossIncome,
      line26NetOperatingLossAdjustment,
      line27CaliforniaAmtiExclusion,
      line28CaliforniaCombinedIncome,
      line29CaliforniaAdjustmentsAndPreferences,
      line30CaliforniaAdjustedAmtiBeforeNol,
      line31CaliforniaAlternativeMinimumTaxNolDeduction,
      line32CaliforniaAmtAgi,
      line33CaliforniaItemizedDeductions,
      line34PartIIncludedItemizedDeductions,
      line35TotalAmtItemizedDeductions,
      line36TotalAlternativeMinimumTaxableIncome,
      line37TotalAlternativeMinimumTaxAgi,
      line38AlternativeMinimumTaxItemizedDeductionPercentage,
      line39ProratedAmtItemizedDeductions,
      line40CaliforniaAlternativeMinimumTaxableIncome,
      line41CopiedTentativeMinimumTax,
      line42CaliforniaAmtRate,
      line43CaliforniaTentativeMinimumTax,
      line44RegularTax,
      line45AlternativeMinimumTax,
    });
  }

  audit.record("CA-P-540NR", "1", "Subtotal tax before credits", line1SubtotalTaxBeforeCredits, "Supported input from Form 540NR line 42 subtotal tax before credits");
  audit.record("CA-P-540NR", "2", "California tentative minimum tax", line2TentativeMinimumTax, input.amtWorksheet === undefined ? "Supported upstream input from Schedule P (540NR) Part II line 43" : "Use the supported Schedule P (540NR) Part II line 43 computation");
  audit.record("CA-P-540NR", "3", "Excess tax", line3ExcessTax, "max(0, Line 1 - Line 2)", {
    "Line 1": line1SubtotalTaxBeforeCredits,
    "Line 2": line2TentativeMinimumTax,
  });
  audit.record("CA-P-540NR", "5a", "Child and dependent care expenses credit amount", line5aChildAndDependentCareCreditAmount, "Supported input for Schedule P (540NR) line 5 code 232 credit amount");
  audit.record("CA-P-540NR", "5b", "Child and dependent care expenses credit used this year", line5bChildAndDependentCareCreditUsed, "min(Line 5a, Line 3)", {
    "Line 5a": line5aChildAndDependentCareCreditAmount,
    "Line 3": line3ExcessTax,
  });
  audit.record("CA-P-540NR", "5c", "Excess tax remaining after Schedule P line 5", line5cRemainingExcessTax, "Line 3 - Line 5b", {
    "Line 3": line3ExcessTax,
    "Line 5b": line5bChildAndDependentCareCreditUsed,
  });
  audit.record("CA-P-540NR", "11c", "Section B starting tax balance that may be offset by credits", line11cSectionBStartingTaxBalance, line3ExcessTax.equals(0) ? "Line 1" : "Line 2 + Line 5c", {
    "Line 1": line1SubtotalTaxBeforeCredits,
    "Line 2": line2TentativeMinimumTax,
    "Line 3": line3ExcessTax,
    "Line 5c": line5cRemainingExcessTax,
  });
  audit.record("CA-P-540NR", "12a", "Prorated Joint Custody Head of Household credit amount", line12aJointCustodyHeadOfHouseholdCreditAmount, "Round(Form 540NR line 51 credit amount × Form 540NR line 54 credit percentage)", {
    "Form 540NR line 51 credit amount": nonNegativeAmount(
      input.line12JointCustodyHeadOfHouseholdCreditAmount,
      "CA Schedule P (540NR) line 12 Joint Custody Head of Household credit amount"
    ),
    "Form 540NR line 54 credit percentage": creditPercentage,
  });
  audit.record("CA-P-540NR", "12b", "Joint Custody Head of Household credit used this year", line12bJointCustodyHeadOfHouseholdCreditUsed, "min(Line 12a, Line 11c)", {
    "Line 12a": line12aJointCustodyHeadOfHouseholdCreditAmount,
    "Line 11c": line11cSectionBStartingTaxBalance,
  });
  audit.record("CA-P-540NR", "12c", "Net tax remaining after Schedule P line 12", line12cRemainingNetTax, "Line 11c - Line 12b", {
    "Line 11c": line11cSectionBStartingTaxBalance,
    "Line 12b": line12bJointCustodyHeadOfHouseholdCreditUsed,
  });
  audit.record("CA-P-540NR", "13a", "Prorated Dependent Parent credit amount", line13aDependentParentCreditAmount, "Round(Form 540NR line 52 credit amount × Form 540NR line 54 credit percentage)", {
    "Form 540NR line 52 credit amount": nonNegativeAmount(
      input.line13DependentParentCreditAmount,
      "CA Schedule P (540NR) line 13 Dependent Parent credit amount"
    ),
    "Form 540NR line 54 credit percentage": creditPercentage,
  });
  audit.record("CA-P-540NR", "13b", "Dependent Parent credit used this year", line13bDependentParentCreditUsed, "min(Line 13a, Line 12c)", {
    "Line 13a": line13aDependentParentCreditAmount,
    "Line 12c": line12cRemainingNetTax,
  });
  audit.record("CA-P-540NR", "13c", "Net tax remaining after Schedule P line 13", line13cRemainingNetTax, "Line 12c - Line 13b", {
    "Line 12c": line12cRemainingNetTax,
    "Line 13b": line13bDependentParentCreditUsed,
  });
  audit.record("CA-P-540NR", "14a", "Prorated Senior Head of Household credit amount", line14aSeniorHeadOfHouseholdCreditAmount, "Round(Form 540NR line 53 credit amount × Form 540NR line 54 credit percentage)", {
    "Form 540NR line 53 credit amount": nonNegativeAmount(
      input.line14SeniorHeadOfHouseholdCreditAmount,
      "CA Schedule P (540NR) line 14 Senior Head of Household credit amount"
    ),
    "Form 540NR line 54 credit percentage": creditPercentage,
  });
  audit.record("CA-P-540NR", "14b", "Senior Head of Household credit used this year", line14bSeniorHeadOfHouseholdCreditUsed, "min(Line 14a, Line 13c)", {
    "Line 14a": line14aSeniorHeadOfHouseholdCreditAmount,
    "Line 13c": line13cRemainingNetTax,
  });
  audit.record("CA-P-540NR", "14c", "Net tax remaining after Schedule P line 14", line14cRemainingNetTax, "Line 13c - Line 14b", {
    "Line 13c": line13cRemainingNetTax,
    "Line 14b": line14bSeniorHeadOfHouseholdCreditUsed,
  });
  audit.record("CA-P-540NR", "15a", "Nonrefundable renter's credit amount", line15aRentersCreditAmount, "Supported input for Schedule P (540NR) line 15 renter's credit amount");
  audit.record("CA-P-540NR", "15b", "Nonrefundable renter's credit used this year", line15bRentersCreditUsed, "min(Line 15a, Line 14c)", {
    "Line 15a": line15aRentersCreditAmount,
    "Line 14c": line14cRemainingNetTax,
  });
  audit.record("CA-P-540NR", "15c", "Net tax remaining after Schedule P line 15", line15cRemainingNetTax, "Line 14c - Line 15b", {
    "Line 14c": line14cRemainingNetTax,
    "Line 15b": line15bRentersCreditUsed,
  });

  for (const carryoverCredit of line16Through19CarryoverCredits) {
    const previousLine = carryoverCredit.line === 16 ? "15c" : `${carryoverCredit.line - 1}c`;
    const previousBalance = carryoverCredit.line === 16
      ? line15cRemainingNetTax
      : line16Through19CarryoverCredits[carryoverCredit.line - 17].remainingNetTax;
    audit.record("CA-P-540NR", `${carryoverCredit.line}a`, `${carryoverCredit.name} credit amount`, carryoverCredit.amount, `Supported input for Schedule P (540NR) Section B2 line ${carryoverCredit.line} code ${carryoverCredit.code} credit amount`, {
      "Credit code": carryoverCredit.code,
      "Credit name": carryoverCredit.name,
    });
    audit.record("CA-P-540NR", `${carryoverCredit.line}b`, `${carryoverCredit.name} credit used this year`, carryoverCredit.creditUsedThisYear, `min(Line ${carryoverCredit.line}a, Line ${previousLine})`, {
      [`Line ${carryoverCredit.line}a`]: carryoverCredit.amount,
      [`Line ${previousLine}`]: previousBalance,
      "Credit code": carryoverCredit.code,
    });
    audit.record("CA-P-540NR", `${carryoverCredit.line}c`, `Net tax remaining after Schedule P line ${carryoverCredit.line}`, carryoverCredit.remainingNetTax, `Line ${previousLine} - Line ${carryoverCredit.line}b`, {
      [`Line ${previousLine}`]: previousBalance,
      [`Line ${carryoverCredit.line}b`]: carryoverCredit.creditUsedThisYear,
    });
    audit.record("CA-P-540NR", `${carryoverCredit.line}d`, `${carryoverCredit.name} credit carryover`, carryoverCredit.carryover, `Source worksheet carryover + max(0, Line ${carryoverCredit.line}a - Line ${carryoverCredit.line}b - elected refundable amount)`, {
      [`Line ${carryoverCredit.line}a`]: carryoverCredit.amount,
      [`Line ${carryoverCredit.line}b`]: carryoverCredit.creditUsedThisYear,
      "Source worksheet carryover": carryoverCredit.sourceWorksheetCarryoverAmount,
      "Elected refundable amount": carryoverCredit.electedRefundableAmount,
      "Credit code": carryoverCredit.code,
    });
  }

  audit.record("CA-P-540NR", "20a", "Other state tax credit amount", line20aOtherStateTaxCreditAmount, "Supported input from Schedule S (540) line 12");
  audit.record("CA-P-540NR", "20b", "Other state tax credit used this year", line20bOtherStateTaxCreditUsed, "min(Line 20a, the prior supported Section B2 balance or Line 15c)", {
    "Line 20a": line20aOtherStateTaxCreditAmount,
    "Starting balance": line20bStartingNetTax,
  });
  audit.record("CA-P-540NR", "20c", "Net tax remaining after Schedule P line 20", line20cRemainingNetTax, "Starting balance used for Line 20b - Line 20b", {
    "Starting balance": line20bStartingNetTax,
    "Line 20b": line20bOtherStateTaxCreditUsed,
  });
  audit.record("CA-P-540NR", "21a", "Pass-through entity elective tax credit amount", line21aPassThroughEntityElectiveTaxCreditAmount, "Supported input from FTB 3804-CR available credit amount");
  audit.record("CA-P-540NR", "21b", "Pass-through entity elective tax credit used this year", line21bPassThroughEntityElectiveTaxCreditUsed, "min(Line 21a, Line 20c)", {
    "Line 21a": line21aPassThroughEntityElectiveTaxCreditAmount,
    "Line 20c": line20cRemainingNetTax,
  });
  audit.record("CA-P-540NR", "21c", "Net tax remaining after Schedule P line 21", line21cRemainingNetTax, "Line 20c - Line 21b", {
    "Line 20c": line20cRemainingNetTax,
    "Line 21b": line21bPassThroughEntityElectiveTaxCreditUsed,
  });
  audit.record("CA-P-540NR", "21d", "Pass-through entity elective tax credit carryover", line21dPassThroughEntityElectiveTaxCreditCarryover, "max(0, Line 21a - Line 21b)", {
    "Line 21a": line21aPassThroughEntityElectiveTaxCreditAmount,
    "Line 21b": line21bPassThroughEntityElectiveTaxCreditUsed,
  });
  audit.record("CA-P-540NR", "22", "Alternative minimum tax", line22AlternativeMinimumTax, input.amtWorksheet === undefined ? "Supported upstream input from Schedule P (540NR) Part II line 45" : "Use the supported Schedule P (540NR) Part II line 45 computation");
  audit.record("CA-P-540NR", "23a", "Solar energy credit carryover amount", line23aSolarEnergyCreditCarryoverAmount, "Supported input for Schedule P (540NR) line 23 code 180 carryover amount");
  audit.record("CA-P-540NR", "23b", "Solar energy credit used this year", line23bSolarEnergyCreditUsed, "min(Line 23a, Line 22)", {
    "Line 23a": line23aSolarEnergyCreditCarryoverAmount,
    "Line 22": line22AlternativeMinimumTax,
  });
  audit.record("CA-P-540NR", "23c", "AMT remaining after Schedule P line 23", line23cRemainingAlternativeMinimumTax, "Line 22 - Line 23b", {
    "Line 22": line22AlternativeMinimumTax,
    "Line 23b": line23bSolarEnergyCreditUsed,
  });
  audit.record("CA-P-540NR", "23d", "Solar energy credit carryover", line23dSolarEnergyCreditCarryover, "max(0, Line 23a - Line 23b)", {
    "Line 23a": line23aSolarEnergyCreditCarryoverAmount,
    "Line 23b": line23bSolarEnergyCreditUsed,
  });
  audit.record("CA-P-540NR", "24a", "Commercial solar energy credit carryover amount", line24aCommercialSolarEnergyCreditCarryoverAmount, "Supported input for Schedule P (540NR) line 24 code 181 carryover amount");
  audit.record("CA-P-540NR", "24b", "Commercial solar energy credit used this year", line24bCommercialSolarEnergyCreditUsed, input.line23SolarEnergyCreditCarryoverAmount === undefined ? "min(Line 24a, Line 22)" : "min(Line 24a, Line 23c)", {
    "Line 24a": line24aCommercialSolarEnergyCreditCarryoverAmount,
    "Starting AMT balance": line24StartingAlternativeMinimumTax,
  });
  audit.record("CA-P-540NR", "24c", "AMT remaining after Schedule P line 24", line24cRemainingAlternativeMinimumTax, "Starting AMT balance for Line 24 - Line 24b", {
    "Starting AMT balance": line24StartingAlternativeMinimumTax,
    "Line 24b": line24bCommercialSolarEnergyCreditUsed,
  });
  audit.record("CA-P-540NR", "24d", "Commercial solar energy credit carryover", line24dCommercialSolarEnergyCreditCarryover, "max(0, Line 24a - Line 24b)", {
    "Line 24a": line24aCommercialSolarEnergyCreditCarryoverAmount,
    "Line 24b": line24bCommercialSolarEnergyCreditUsed,
  });
  audit.record("CA-P-540NR", "25", "Adjusted AMT", line25AdjustedAlternativeMinimumTax, "Enter the remaining Section C AMT balance after supported line 23 and line 24 credits");

  return {
    subtotalTaxBeforeCredits: line1SubtotalTaxBeforeCredits,
    tentativeMinimumTax: line2TentativeMinimumTax,
    alternativeMinimumTax: line22AlternativeMinimumTax,
    line1PartIStandardDeduction,
    line2PartIMedicalAndDentalAdjustment,
    line3PartITaxesAdjustment,
    line4PartICertainHomeMortgageInterestAdjustment,
    line5PartIMiscellaneousItemizedDeductionsAdjustment,
    line6PartITaxRefundAdjustment,
    line7PartIInvestmentInterestExpenseAdjustment,
    line8PartIPost1986DepreciationAdjustment,
    line9PartIAdjustedGainOrLossAdjustment,
    line10PartIIncentiveStockOptionsAdjustment,
    line11PartIPassiveActivitiesAdjustment,
    line12PartIBeneficiariesOfEstatesAndTrustsAdjustment,
    line13PartIOtherAdjustmentsAndPreferences,
    line14TotalAdjustmentsAndPreferences,
    line15TaxableIncome,
    line16NetOperatingLossDeduction,
    line17AmtiExclusion,
    line18ItemizedDeductionsLimitation,
    line19CombinedIncome,
    line20AlternativeMinimumTaxNolDeduction,
    line21AlternativeMinimumTaxableIncome,
    line22ExemptionAmount,
    line23TentativeMinimumTaxBase,
    line24TotalTentativeMinimumTax,
    line25CaliforniaAdjustedGrossIncome,
    line26NetOperatingLossAdjustment,
    line27CaliforniaAmtiExclusion,
    line28CaliforniaCombinedIncome,
    line29CaliforniaAdjustmentsAndPreferences,
    line30CaliforniaAdjustedAmtiBeforeNol,
    line31CaliforniaAlternativeMinimumTaxNolDeduction,
    line32CaliforniaAmtAgi,
    line33CaliforniaItemizedDeductions,
    line34PartIIncludedItemizedDeductions,
    line35TotalAmtItemizedDeductions,
    line36TotalAlternativeMinimumTaxableIncome,
    line37TotalAlternativeMinimumTaxAgi,
    line38AlternativeMinimumTaxItemizedDeductionPercentage,
    line39ProratedAmtItemizedDeductions,
    line40CaliforniaAlternativeMinimumTaxableIncome,
    line41CopiedTentativeMinimumTax,
    line42CaliforniaAmtRate,
    line43CaliforniaTentativeMinimumTax,
    line44RegularTax,
    line45AlternativeMinimumTax,
    line1SubtotalTaxBeforeCredits,
    line2TentativeMinimumTax,
    line3ExcessTax,
    line5aChildAndDependentCareCreditAmount,
    line5bChildAndDependentCareCreditUsed,
    line5cRemainingExcessTax,
    line11cSectionBStartingTaxBalance,
    creditPercentage,
    line12aJointCustodyHeadOfHouseholdCreditAmount,
    line12bJointCustodyHeadOfHouseholdCreditUsed,
    line12cRemainingNetTax,
    line13aDependentParentCreditAmount,
    line13bDependentParentCreditUsed,
    line13cRemainingNetTax,
    line14aSeniorHeadOfHouseholdCreditAmount,
    line14bSeniorHeadOfHouseholdCreditUsed,
    line14cRemainingNetTax,
    line15aRentersCreditAmount,
    line15bRentersCreditUsed,
    line15cRemainingNetTax,
    line16Through19CarryoverCredits,
    line20aOtherStateTaxCreditAmount,
    line20bStartingNetTax,
    line20bOtherStateTaxCreditUsed,
    line20cRemainingNetTax,
    line21aPassThroughEntityElectiveTaxCreditAmount,
    line21bPassThroughEntityElectiveTaxCreditUsed,
    line21cRemainingNetTax,
    line21dPassThroughEntityElectiveTaxCreditCarryover,
    line55TotalProratedCredits,
    line60AdditionalSpecialCreditsUsed,
    line22AlternativeMinimumTax,
    line23aSolarEnergyCreditCarryoverAmount,
    line23bSolarEnergyCreditUsed,
    line23cRemainingAlternativeMinimumTax,
    line23dSolarEnergyCreditCarryover,
    line24aCommercialSolarEnergyCreditCarryoverAmount,
    line24bCommercialSolarEnergyCreditUsed,
    line24cRemainingAlternativeMinimumTax,
    line24dCommercialSolarEnergyCreditCarryover,
    line25AdjustedAlternativeMinimumTax,
    line61RentersCreditUsed: line15bRentersCreditUsed,
    lines: audit.getLines(),
  };
}
