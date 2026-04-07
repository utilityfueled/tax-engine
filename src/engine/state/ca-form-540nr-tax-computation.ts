/**
 * California Form 540NR tax computation and total-tax assembly through line 74.
 * Spec: spec/state/ca-form-540nr-tax-computation.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { calculateCABehavioralHealthServicesTax } from "@/engine/state/ca-behavioral-health-services-tax.js";
import {
  calculateCAFTB3503NaturalHeritagePreservationCredit,
  type CAFTB3503NaturalHeritagePreservationCreditInput,
} from "@/engine/state/ca-ftb-3503-natural-heritage-preservation-credit.js";
import {
  calculateCAFTB3510PriorYearAlternativeMinimumTaxCredit,
  type CAFTB3510PriorYearAlternativeMinimumTaxCreditInput,
} from "@/engine/state/ca-ftb-3510-prior-year-alternative-minimum-tax-credit.js";
import {
  calculateCAFTB3521LowIncomeHousingCredit,
  type CAFTB3521LowIncomeHousingCreditInput,
} from "@/engine/state/ca-ftb-3521-low-income-housing-credit.js";
import {
  calculateCAFTB3523ResearchCredit,
  type CAFTB3523ResearchCreditInput,
} from "@/engine/state/ca-ftb-3523-research-credit.js";
import {
  calculateCAFTB3531CaliforniaCompetesTaxCredit,
  type CAFTB3531CaliforniaCompetesTaxCreditInput,
} from "@/engine/state/ca-ftb-3531-california-competes-tax-credit.js";
import {
  calculateCAFTB3592CollegeAccessTaxCredit,
  type CAFTB3592CollegeAccessTaxCreditInput,
} from "@/engine/state/ca-ftb-3592-college-access-tax-credit.js";
import {
  calculateCAForm540ChildAndDependentCareCredit,
  type CAForm540ChildAndDependentCareCreditInput,
} from "@/engine/state/ca-form-540-child-and-dependent-care-credit.js";
import {
  calculateCAForm540ChildAdoptionCostsCredit,
  type CAForm540ChildAdoptionCostsCreditInput,
} from "@/engine/state/ca-form-540-child-adoption-costs-credit.js";
import {
  calculateCAForm540DependentParentCredit,
  type CAForm540DependentParentCreditInput,
} from "@/engine/state/ca-form-540-dependent-parent-credit.js";
import { calculateCAForm540ExemptionCredits } from "@/engine/state/ca-form-540-exemption-credits.js";
import {
  calculateCAForm540JointCustodyHeadOfHouseholdCredit,
  type CAForm540JointCustodyHeadOfHouseholdCreditInput,
} from "@/engine/state/ca-form-540-joint-custody-head-of-household-credit.js";
import {
  calculateCAForm540SeniorHeadOfHouseholdCredit,
  type CAForm540SeniorHeadOfHouseholdCreditInput,
} from "@/engine/state/ca-form-540-senior-head-of-household-credit.js";
import {
  calculateCAScheduleP540NRSupportedCredits,
  type CAScheduleP540NRAdditionalCarryoverCreditInput,
  type CAScheduleP540NRAmtWorksheetInput,
  type CAScheduleP540NRAdditionalCarryoverCreditResult,
} from "@/engine/state/ca-schedule-p-540nr.js";
import { calculateCAForm540TaxRateSchedules } from "@/engine/state/ca-form-540-tax-rate-schedules.js";
import { calculateCAForm540TaxTable } from "@/engine/state/ca-form-540-tax-table.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";

export type CAForm540NRTaxComputationLine31Source = "tax_table" | "tax_rate_schedule";
export type CAForm540NRLine50ChildAndDependentCareCreditInput = Omit<
  CAForm540ChildAndDependentCareCreditInput,
  "filingStatus" | "federalAgi" | "taxYear"
>;
export type CAForm540NRLine51JointCustodyHeadOfHouseholdCreditInput = Omit<
  CAForm540JointCustodyHeadOfHouseholdCreditInput,
  "taxBeforeCredits" | "filingStatus" | "taxYear"
>;
export type CAForm540NRLine52DependentParentCreditInput = Omit<
  CAForm540DependentParentCreditInput,
  "taxBeforeCredits" | "filingStatus" | "taxYear"
>;
export type CAForm540NRLine53SeniorHeadOfHouseholdCreditInput = Omit<
  CAForm540SeniorHeadOfHouseholdCreditInput,
  "taxableIncome" | "taxYear"
>;
export type CAForm540NRLine60ChildAdoptionCostsCreditInput = Omit<
  CAForm540ChildAdoptionCostsCreditInput,
  "taxYear"
>;
export type CAForm540NRLine60NaturalHeritagePreservationCreditInput = Omit<
  CAFTB3503NaturalHeritagePreservationCreditInput,
  "creditClaimedThisYear" | "taxYear"
>;
export type CAForm540NRLine60ResearchCreditInput = Omit<
  CAFTB3523ResearchCreditInput,
  "creditClaimedThisYear" | "taxYear"
>;
export type CAForm540NRLine60LowIncomeHousingCreditInput = Omit<
  CAFTB3521LowIncomeHousingCreditInput,
  "creditClaimedThisYear" | "taxYear"
>;
export type CAForm540NRLine60CaliforniaCompetesCreditInput = Omit<
  CAFTB3531CaliforniaCompetesTaxCreditInput,
  "taxYear"
>;
export type CAForm540NRLine58PriorYearAlternativeMinimumTaxCreditInput = Omit<
  CAFTB3510PriorYearAlternativeMinimumTaxCreditInput,
  "currentYearLine33RegularTax" | "taxYear"
>;
export type CAForm540NRLine59PriorYearAlternativeMinimumTaxCreditInput =
  CAForm540NRLine58PriorYearAlternativeMinimumTaxCreditInput;
export type CAForm540NRLine60CollegeAccessTaxCreditInput = Omit<
  CAFTB3592CollegeAccessTaxCreditInput,
  "creditClaimedThisYear" | "taxYear"
>;
export type CAForm540NRLine60SchedulePAdditionalCarryoverCreditInput =
  CAScheduleP540NRAdditionalCarryoverCreditInput;

export interface CAForm540NRTaxComputationInput {
  totalTaxableIncome: Decimal | string | number;
  californiaTaxableIncome: Decimal | string | number;
  filingStatus: FilingStatus;
  federalAgi: Decimal | string | number;
  personalExemptionCount: number;
  blindExemptionCount: number;
  seniorExemptionCount: number;
  dependentExemptionCount: number;
  line41Tax?: Decimal | string | number;
  line50Credit?: Decimal | string | number;
  line50ChildAndDependentCareCreditInput?: CAForm540NRLine50ChildAndDependentCareCreditInput;
  line51Credit?: Decimal | string | number;
  line51JointCustodyHeadOfHouseholdCreditInput?: CAForm540NRLine51JointCustodyHeadOfHouseholdCreditInput;
  line52Credit?: Decimal | string | number;
  line52DependentParentCreditInput?: CAForm540NRLine52DependentParentCreditInput;
  line53Credit?: Decimal | string | number;
  line53SeniorHeadOfHouseholdCreditInput?: CAForm540NRLine53SeniorHeadOfHouseholdCreditInput;
  schedulePTentativeMinimumTax?: Decimal | string | number;
  schedulePAlternativeMinimumTax?: Decimal | string | number;
  line55Credit?: Decimal | string | number;
  line58Credit?: Decimal | string | number;
  line58PriorYearAlternativeMinimumTaxCreditInput?: CAForm540NRLine58PriorYearAlternativeMinimumTaxCreditInput;
  line59Credit?: Decimal | string | number;
  line59PriorYearAlternativeMinimumTaxCreditInput?: CAForm540NRLine59PriorYearAlternativeMinimumTaxCreditInput;
  line60Credit?: Decimal | string | number;
  line60ChildAdoptionCostsCreditInput?: CAForm540NRLine60ChildAdoptionCostsCreditInput;
  line60NaturalHeritagePreservationCreditInput?: CAForm540NRLine60NaturalHeritagePreservationCreditInput;
  line60ResearchCreditInput?: CAForm540NRLine60ResearchCreditInput;
  line60LowIncomeHousingCreditInput?: CAForm540NRLine60LowIncomeHousingCreditInput;
  line60CaliforniaCompetesCreditInput?: CAForm540NRLine60CaliforniaCompetesCreditInput;
  line60CollegeAccessTaxCreditInput?: CAForm540NRLine60CollegeAccessTaxCreditInput;
  line60SchedulePAdditionalCarryoverCredits?: CAForm540NRLine60SchedulePAdditionalCarryoverCreditInput[];
  line60OtherStateTaxCreditAmount?: Decimal | string | number;
  line60PassThroughEntityElectiveTaxCreditAmount?: Decimal | string | number;
  line61Credit?: Decimal | string | number;
  line71AlternativeMinimumTax?: Decimal | string | number;
  schedulePAmtWorksheetInput?: Omit<CAScheduleP540NRAmtWorksheetInput, "filingStatus" | "regularTax">;
  line71SolarEnergyCreditCarryoverAmount?: Decimal | string | number;
  line71CommercialSolarEnergyCreditCarryoverAmount?: Decimal | string | number;
  line73OtherTaxes?: Decimal | string | number;
  taxYear: number;
}

export interface CAForm540NRTaxComputationResult {
  totalTaxableIncome: Decimal;
  californiaTaxableIncome: Decimal;
  filingStatus: FilingStatus;
  federalAgi: Decimal;
  line31Source: CAForm540NRTaxComputationLine31Source;
  line31: Decimal;
  line35: Decimal;
  line36: Decimal;
  line37: Decimal;
  line38: Decimal;
  supportedResidentExemptionCredits: Decimal;
  line39: Decimal;
  line40: Decimal;
  line41Tax: Decimal;
  line42TaxBeforeCredits: Decimal;
  line50Credit: Decimal;
  line51Credit: Decimal;
  line52Credit: Decimal;
  line53Credit: Decimal;
  line54CreditPercentage: Decimal;
  line55Credit: Decimal;
  line58Credit: Decimal;
  line59Credit: Decimal;
  line60Credit: Decimal;
  line60AdditionalCarryoverCredits: CAScheduleP540NRAdditionalCarryoverCreditResult[];
  line60PassThroughEntityElectiveTaxCreditCarryover: Decimal;
  line61Credit: Decimal;
  line62TotalCredits: Decimal;
  line63TaxAfterCredits: Decimal;
  line71AlternativeMinimumTax: Decimal;
  line71SolarEnergyCreditCarryover: Decimal;
  line71CommercialSolarEnergyCreditCarryover: Decimal;
  line72BehavioralHealthServicesTax: Decimal;
  line73OtherTaxes: Decimal;
  line74TotalTax: Decimal;
  lines: CalculatedLine[];
}

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

export function calculateCAForm540NRTaxComputation(
  input: CAForm540NRTaxComputationInput
): CAForm540NRTaxComputationResult {
  const totalTaxableIncome = zeroFloor(d(input.totalTaxableIncome));
  const californiaTaxableIncome = zeroFloor(d(input.californiaTaxableIncome));
  const federalAgi = d(input.federalAgi);

  if (input.line50Credit !== undefined && input.line50ChildAndDependentCareCreditInput !== undefined) {
    throw new Error(
      "CA Form 540NR line 50 cannot accept both a child and dependent care worksheet input and a direct credit amount"
    );
  }
  if (input.line51Credit !== undefined && input.line51JointCustodyHeadOfHouseholdCreditInput !== undefined) {
    throw new Error(
      "CA Form 540NR line 51 cannot accept both a Joint Custody Head of Household worksheet input and a direct credit amount"
    );
  }
  if (input.line52Credit !== undefined && input.line52DependentParentCreditInput !== undefined) {
    throw new Error(
      "CA Form 540NR line 52 cannot accept both a Dependent Parent worksheet input and a direct credit amount"
    );
  }
  if (input.line53Credit !== undefined && input.line53SeniorHeadOfHouseholdCreditInput !== undefined) {
    throw new Error(
      "CA Form 540NR line 53 cannot accept both a Senior Head of Household worksheet input and a direct credit amount"
    );
  }
  if (
    input.schedulePAmtWorksheetInput !== undefined &&
    (input.schedulePTentativeMinimumTax !== undefined || input.schedulePAlternativeMinimumTax !== undefined)
  ) {
    throw new Error(
      "CA Form 540NR Schedule P AMT worksheet input cannot be combined with direct Schedule P tentative minimum tax or alternative minimum tax inputs"
    );
  }
  if (
    input.line55Credit !== undefined &&
    (
      input.line51Credit !== undefined ||
      input.line51JointCustodyHeadOfHouseholdCreditInput !== undefined ||
      input.line52Credit !== undefined ||
      input.line52DependentParentCreditInput !== undefined ||
      input.line53Credit !== undefined ||
      input.line53SeniorHeadOfHouseholdCreditInput !== undefined
    )
  ) {
    throw new Error(
      "CA Form 540NR line 55 direct input cannot be combined with supported line 51 through line 53 amounts"
    );
  }
  if (input.line58Credit !== undefined && input.line58PriorYearAlternativeMinimumTaxCreditInput !== undefined) {
    throw new Error(
      "CA Form 540NR line 58 cannot accept both a Prior Year Alternative Minimum Tax worksheet input and a direct credit amount"
    );
  }
  if (input.line59Credit !== undefined && input.line59PriorYearAlternativeMinimumTaxCreditInput !== undefined) {
    throw new Error(
      "CA Form 540NR line 59 cannot accept both a Prior Year Alternative Minimum Tax worksheet input and a direct credit amount"
    );
  }
  if (
    input.line58PriorYearAlternativeMinimumTaxCreditInput !== undefined &&
    input.line59PriorYearAlternativeMinimumTaxCreditInput !== undefined
  ) {
    throw new Error(
      "CA Form 540NR cannot accept supported Prior Year Alternative Minimum Tax worksheet inputs for both line 58 and line 59 on the same return"
    );
  }
  const hasDuplicateLine60Code197 =
    input.line60SchedulePAdditionalCarryoverCredits?.some((credit) => credit.code.trim() === "197") ?? false;
  if (input.line60ChildAdoptionCostsCreditInput !== undefined && hasDuplicateLine60Code197) {
    throw new Error(
      "CA Form 540NR line 60 cannot accept both a Child Adoption Costs worksheet input and a duplicate manual Schedule P code 197 carryover credit"
    );
  }
  const hasDuplicateLine60Code213 =
    input.line60SchedulePAdditionalCarryoverCredits?.some((credit) => credit.code.trim() === "213") ?? false;
  if (input.line60NaturalHeritagePreservationCreditInput !== undefined && hasDuplicateLine60Code213) {
    throw new Error(
      "CA Form 540NR line 60 cannot accept both a Natural Heritage Preservation FTB 3503 input and a duplicate manual Schedule P code 213 carryover credit"
    );
  }
  const hasDuplicateLine60Code183 =
    input.line60SchedulePAdditionalCarryoverCredits?.some((credit) => credit.code.trim() === "183") ?? false;
  if (input.line60ResearchCreditInput !== undefined && hasDuplicateLine60Code183) {
    throw new Error(
      "CA Form 540NR line 60 cannot accept both a Research Credit FTB 3523 input and a duplicate manual Schedule P code 183 carryover credit"
    );
  }
  const hasDuplicateLine60Code172 =
    input.line60SchedulePAdditionalCarryoverCredits?.some((credit) => credit.code.trim() === "172") ?? false;
  if (input.line60LowIncomeHousingCreditInput !== undefined && hasDuplicateLine60Code172) {
    throw new Error(
      "CA Form 540NR line 60 cannot accept both a Low-Income Housing Credit FTB 3521 input and a duplicate manual Schedule P code 172 carryover credit"
    );
  }
  const hasDuplicateLine60Code233 =
    input.line60SchedulePAdditionalCarryoverCredits?.some((credit) => credit.code.trim() === "233") ?? false;
  if (input.line60CaliforniaCompetesCreditInput !== undefined && hasDuplicateLine60Code233) {
    throw new Error(
      "CA Form 540NR line 60 cannot accept both a California Competes FTB 3531 input and a duplicate manual Schedule P code 233 carryover credit"
    );
  }
  const hasDuplicateLine60Code235 =
    input.line60SchedulePAdditionalCarryoverCredits?.some((credit) => credit.code.trim() === "235") ?? false;
  if (input.line60CollegeAccessTaxCreditInput !== undefined && hasDuplicateLine60Code235) {
    throw new Error(
      "CA Form 540NR line 60 cannot accept both a College Access FTB 3592 input and a duplicate manual Schedule P code 235 carryover credit"
    );
  }
  if (
    input.line60Credit !== undefined &&
    (
      input.line60ChildAdoptionCostsCreditInput !== undefined ||
      input.line60NaturalHeritagePreservationCreditInput !== undefined ||
      input.line60ResearchCreditInput !== undefined ||
      input.line60LowIncomeHousingCreditInput !== undefined ||
      input.line60CaliforniaCompetesCreditInput !== undefined ||
      input.line60CollegeAccessTaxCreditInput !== undefined ||
      (input.line60SchedulePAdditionalCarryoverCredits?.length ?? 0) > 0 ||
      input.line60OtherStateTaxCreditAmount !== undefined ||
      input.line60PassThroughEntityElectiveTaxCreditAmount !== undefined
    )
  ) {
    throw new Error(
      "CA Form 540NR line 60 direct input cannot be combined with supported Schedule P (540NR) additional special-credit inputs"
    );
  }
  if (
    input.line71AlternativeMinimumTax !== undefined &&
    (
      input.schedulePAlternativeMinimumTax !== undefined ||
      input.schedulePAmtWorksheetInput !== undefined ||
      input.line71SolarEnergyCreditCarryoverAmount !== undefined ||
      input.line71CommercialSolarEnergyCreditCarryoverAmount !== undefined
    )
  ) {
    throw new Error(
      "CA Form 540NR line 71 direct input cannot be combined with supported Schedule P (540NR) Section C inputs"
    );
  }

  const usesSchedulePSectionB =
    input.schedulePAmtWorksheetInput !== undefined ||
    input.schedulePTentativeMinimumTax !== undefined ||
    input.line60ChildAdoptionCostsCreditInput !== undefined ||
    input.line60NaturalHeritagePreservationCreditInput !== undefined ||
    input.line60ResearchCreditInput !== undefined ||
    input.line60LowIncomeHousingCreditInput !== undefined ||
    input.line60CaliforniaCompetesCreditInput !== undefined ||
    input.line60CollegeAccessTaxCreditInput !== undefined ||
    (input.line60SchedulePAdditionalCarryoverCredits?.length ?? 0) > 0 ||
    input.line60OtherStateTaxCreditAmount !== undefined ||
    input.line60PassThroughEntityElectiveTaxCreditAmount !== undefined;
  const usesSchedulePSectionC =
    input.schedulePAlternativeMinimumTax !== undefined ||
    input.schedulePAmtWorksheetInput !== undefined ||
    input.line71SolarEnergyCreditCarryoverAmount !== undefined ||
    input.line71CommercialSolarEnergyCreditCarryoverAmount !== undefined;
  const usesSchedulePSupportedCredits = usesSchedulePSectionB || usesSchedulePSectionC;

  const line31Source: CAForm540NRTaxComputationLine31Source = totalTaxableIncome.lessThanOrEqualTo(100000)
    ? "tax_table"
    : "tax_rate_schedule";
  const line31Calculation = line31Source === "tax_table"
    ? calculateCAForm540TaxTable({
        taxableIncome: totalTaxableIncome,
        filingStatus: input.filingStatus,
        taxYear: input.taxYear,
      })
    : calculateCAForm540TaxRateSchedules({
        taxableIncome: totalTaxableIncome,
        filingStatus: input.filingStatus,
        taxYear: input.taxYear,
      });
  const line31 = line31Calculation.tax;
  const line35 = californiaTaxableIncome;
  const line36 = totalTaxableIncome.greaterThan(0)
    ? line31.dividedBy(totalTaxableIncome).toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
    : new Decimal(0);
  const line37 = roundDollar(line35.times(line36));
  const line38 = totalTaxableIncome.greaterThan(0)
    ? Decimal.min(
        new Decimal(1),
        line35.dividedBy(totalTaxableIncome).toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
      )
    : new Decimal(0);

  const exemptionCredits = calculateCAForm540ExemptionCredits({
    filingStatus: input.filingStatus,
    federalAgi,
    personalExemptionCount: input.personalExemptionCount,
    blindExemptionCount: input.blindExemptionCount,
    seniorExemptionCount: input.seniorExemptionCount,
    dependentExemptionCount: input.dependentExemptionCount,
    taxYear: input.taxYear,
  });
  const supportedResidentExemptionCredits = exemptionCredits.line32ExemptionCredits;
  const line39 = roundDollar(supportedResidentExemptionCredits.times(line38));
  const line40 = zeroFloor(line37.minus(line39));
  const line41Tax = nonNegativeAmount(input.line41Tax, "CA Form 540NR line 41 tax");
  const line42TaxBeforeCredits = line40.plus(line41Tax);

  let line50Credit = nonNegativeAmount(input.line50Credit, "CA Form 540NR line 50 credit");
  let line50Formula = "Supported upstream input for Form 540NR line 50";
  let line50AuditInputs: Record<string, Decimal | string> = {
    "Computation path": "upstream_input",
  };
  let line50SupportingLines: CalculatedLine[] = [];

  if (input.line50ChildAndDependentCareCreditInput !== undefined) {
    const line50Calculation = calculateCAForm540ChildAndDependentCareCredit({
      ...input.line50ChildAndDependentCareCreditInput,
      filingStatus: input.filingStatus,
      federalAgi,
      taxYear: input.taxYear,
    });

    line50Credit = line50Calculation.line12Line40Credit;
    line50Formula = "Use the supported FTB 3506 child and dependent care credit calculation";
    line50AuditInputs = {
      "Computation path": "ca_form_540_child_and_dependent_care_credit",
      "Qualification status": line50Calculation.qualifies
        ? "qualified"
        : `disqualified:${line50Calculation.disqualificationReason}`,
    };
    line50SupportingLines = line50Calculation.lines.filter((line) => line.form === "CA-3506");
  }

  const nonresidentSpecialCreditTaxBase = zeroFloor(line31.minus(supportedResidentExemptionCredits)).plus(line41Tax);

  let line51Credit = nonNegativeAmount(input.line51Credit, "CA Form 540NR line 51 credit");
  let line51Formula = "Supported upstream input for Form 540NR line 51";
  let line51AuditInputs: Record<string, Decimal | string> = {
    "Computation path": "upstream_input",
  };
  let line51SupportingLines: CalculatedLine[] = [];

  if (input.line51JointCustodyHeadOfHouseholdCreditInput !== undefined) {
    const line51Calculation = calculateCAForm540JointCustodyHeadOfHouseholdCredit({
      ...input.line51JointCustodyHeadOfHouseholdCreditInput,
      taxBeforeCredits: nonresidentSpecialCreditTaxBase,
      filingStatus: input.filingStatus,
      taxYear: input.taxYear,
    });

    line51Credit = line51Calculation.line3Credit;
    line51Formula = "Use the supported nonresident Joint Custody Head of Household credit worksheet";
    line51AuditInputs = {
      "Computation path": "ca_form_540nr_joint_custody_head_of_household_credit",
      "Credit code": "170",
      "Qualification status": line51Calculation.qualifies
        ? "qualified"
        : `disqualified:${line51Calculation.disqualificationReason}`,
      "Nonresident worksheet base": nonresidentSpecialCreditTaxBase,
    };
    line51SupportingLines = line51Calculation.lines.filter((line) => line.form === "CA-JCHH");
  }

  let line52Credit = nonNegativeAmount(input.line52Credit, "CA Form 540NR line 52 credit");
  let line52Formula = "Supported upstream input for Form 540NR line 52";
  let line52AuditInputs: Record<string, Decimal | string> = {
    "Computation path": "upstream_input",
  };
  let line52SupportingLines: CalculatedLine[] = [];

  if (input.line52DependentParentCreditInput !== undefined) {
    const line52Calculation = calculateCAForm540DependentParentCredit({
      ...input.line52DependentParentCreditInput,
      taxBeforeCredits: nonresidentSpecialCreditTaxBase,
      filingStatus: input.filingStatus,
      taxYear: input.taxYear,
    });

    line52Credit = line52Calculation.line3Credit;
    line52Formula = "Use the supported nonresident Dependent Parent credit worksheet";
    line52AuditInputs = {
      "Computation path": "ca_form_540nr_dependent_parent_credit",
      "Credit code": "173",
      "Qualification status": line52Calculation.qualifies
        ? "qualified"
        : `disqualified:${line52Calculation.disqualificationReason}`,
      "Nonresident worksheet base": nonresidentSpecialCreditTaxBase,
    };
    line52SupportingLines = line52Calculation.lines.filter((line) => line.form === "CA-DPC");
  }

  let line53Credit = nonNegativeAmount(input.line53Credit, "CA Form 540NR line 53 credit");
  let line53Formula = "Supported upstream input for Form 540NR line 53";
  let line53AuditInputs: Record<string, Decimal | string> = {
    "Computation path": "upstream_input",
  };
  let line53SupportingLines: CalculatedLine[] = [];

  if (input.line53SeniorHeadOfHouseholdCreditInput !== undefined) {
    const line53Calculation = calculateCAForm540SeniorHeadOfHouseholdCredit({
      ...input.line53SeniorHeadOfHouseholdCreditInput,
      taxableIncome: totalTaxableIncome,
      taxYear: input.taxYear,
    });

    line53Credit = line53Calculation.line3Credit;
    line53Formula = "Use the supported Senior Head of Household credit worksheet";
    line53AuditInputs = {
      "Computation path": "ca_form_540_senior_head_of_household_credit",
      "Credit code": "163",
      "Qualification status": line53Calculation.qualifies
        ? "qualified"
        : `disqualified:${line53Calculation.disqualificationReason}`,
    };
    line53SupportingLines = line53Calculation.lines.filter((line) => line.form === "CA-SHOH");
  }

  const line54CreditPercentage = line38;
  let line55Credit = input.line55Credit === undefined
    ? sum(
        roundDollar(line51Credit.times(line54CreditPercentage)),
        roundDollar(line52Credit.times(line54CreditPercentage)),
        roundDollar(line53Credit.times(line54CreditPercentage))
      )
    : nonNegativeAmount(input.line55Credit, "CA Form 540NR line 55 credit");
  let line55Formula = input.line55Credit === undefined
    ? "Round(Line 51 × Line 54) + Round(Line 52 × Line 54) + Round(Line 53 × Line 54)"
    : "Supported upstream input for Form 540NR line 55";
  let line55AuditInputs: Record<string, Decimal | string> = input.line55Credit === undefined
    ? {
        "Line 51": line51Credit,
        "Line 52": line52Credit,
        "Line 53": line53Credit,
        "Line 54": line54CreditPercentage,
      }
    : {
        "Computation path": "upstream_input",
      };

  let line58Credit = nonNegativeAmount(input.line58Credit, "CA Form 540NR line 58 credit");
  let line58Formula = "Supported upstream input for Form 540NR line 58";
  let line58AuditInputs: Record<string, Decimal | string> = {
    "Computation path": "upstream_input",
  };
  let line58SupportingLines: CalculatedLine[] = [];
  let line59Credit = nonNegativeAmount(input.line59Credit, "CA Form 540NR line 59 credit");
  let line59Formula = "Supported upstream input for Form 540NR line 59";
  let line59AuditInputs: Record<string, Decimal | string> = {
    "Computation path": "upstream_input",
  };
  let line59SupportingLines: CalculatedLine[] = [];
  let line60Credit = nonNegativeAmount(input.line60Credit, "CA Form 540NR line 60 credit");
  let line60Formula = "Supported upstream input for Form 540NR line 60";
  let line60AuditInputs: Record<string, Decimal | string> = {
    "Computation path": "upstream_input",
  };
  let line60SupportingLines: CalculatedLine[] = [];
  let line60SchedulePCarryoverCredits = input.line60SchedulePAdditionalCarryoverCredits ?? [];
  let line60ChildAdoptionQualificationStatus: string | undefined;
  let line60CaliforniaCompetesAvailableCredit = d(0);
  let line60CaliforniaCompetesRecapture = d(0);
  let line60AdditionalCarryoverCredits: CAScheduleP540NRAdditionalCarryoverCreditResult[] = [];
  let line60PassThroughEntityElectiveTaxCreditCarryover = d(0);
  let line61Credit = nonNegativeAmount(input.line61Credit, "CA Form 540NR line 61 credit");
  let line61Formula = "Supported upstream input for Form 540NR line 61";
  let line61AuditInputs: Record<string, Decimal | string> = {
    "Computation path": "upstream_input",
  };
  let line71AlternativeMinimumTax = nonNegativeAmount(
    input.line71AlternativeMinimumTax,
    "CA Form 540NR line 71 alternative minimum tax"
  );
  let line71Formula = "Supported upstream input for Form 540NR line 71";
  let line71AuditInputs: Record<string, Decimal | string> = {
    "Computation path": "upstream_input",
  };
  let line71SolarEnergyCreditCarryover = d(0);
  let line71CommercialSolarEnergyCreditCarryover = d(0);

  if (input.line58PriorYearAlternativeMinimumTaxCreditInput !== undefined) {
    const line58PriorYearAmtCreditCalculation =
      calculateCAFTB3510PriorYearAlternativeMinimumTaxCredit({
        ...input.line58PriorYearAlternativeMinimumTaxCreditInput,
        currentYearLine33RegularTax: line37,
        taxYear: input.taxYear,
      });

    line58Credit = line58PriorYearAmtCreditCalculation.line38CreditAllowedThisYear;
    line58Formula = "Use the supported FTB 3510 line 38 code 188 amount";
    line58AuditInputs = {
      "Computation path": "ca_ftb_3510_supported_input",
      "Credit code": "188",
      "Credit code 188 allowed this year": line58PriorYearAmtCreditCalculation.line38CreditAllowedThisYear,
      "Credit code 188 carryover to next year": line58PriorYearAmtCreditCalculation.line39CarryoverToNextYear,
    };
    line58SupportingLines = line58PriorYearAmtCreditCalculation.lines.filter((line) => line.form === "CA-3510");
  }

  if (input.line59PriorYearAlternativeMinimumTaxCreditInput !== undefined) {
    const line59PriorYearAmtCreditCalculation =
      calculateCAFTB3510PriorYearAlternativeMinimumTaxCredit({
        ...input.line59PriorYearAlternativeMinimumTaxCreditInput,
        currentYearLine33RegularTax: line37,
        taxYear: input.taxYear,
      });

    line59Credit = line59PriorYearAmtCreditCalculation.line38CreditAllowedThisYear;
    line59Formula = "Use the supported FTB 3510 line 38 code 188 amount";
    line59AuditInputs = {
      "Computation path": "ca_ftb_3510_supported_input",
      "Credit code": "188",
      "Credit code 188 allowed this year": line59PriorYearAmtCreditCalculation.line38CreditAllowedThisYear,
      "Credit code 188 carryover to next year": line59PriorYearAmtCreditCalculation.line39CarryoverToNextYear,
    };
    line59SupportingLines = line59PriorYearAmtCreditCalculation.lines.filter((line) => line.form === "CA-3510");
  }

  if (input.line60ChildAdoptionCostsCreditInput !== undefined) {
    const line60ChildAdoptionCalculation = calculateCAForm540ChildAdoptionCostsCredit({
      ...input.line60ChildAdoptionCostsCreditInput,
      taxYear: input.taxYear,
    });

    line60ChildAdoptionQualificationStatus = line60ChildAdoptionCalculation.qualifies
      ? "qualified"
      : `disqualified:${line60ChildAdoptionCalculation.disqualificationReason}`;
    line60SupportingLines = line60ChildAdoptionCalculation.lines.filter((line) => line.form === "CA-197");
    line60SchedulePCarryoverCredits = [
      {
        code: "197",
        name: "Child Adoption Costs",
        amount: line60ChildAdoptionCalculation.line4CurrentYearCredit,
        sourceWorksheetCarryoverAmount: line60ChildAdoptionCalculation.line5CarryoverCredit,
      },
      ...line60SchedulePCarryoverCredits,
    ];
  }

  if (input.line60NaturalHeritagePreservationCreditInput !== undefined) {
    const line60NaturalHeritagePreservationCalculation =
      calculateCAFTB3503NaturalHeritagePreservationCredit({
        ...input.line60NaturalHeritagePreservationCreditInput,
        taxYear: input.taxYear,
      });

    line60SchedulePCarryoverCredits = [
      ...line60SchedulePCarryoverCredits,
      {
        code: "213",
        name: "Natural Heritage Preservation Credit",
        amount: line60NaturalHeritagePreservationCalculation.line6TotalAvailableCredit,
        electedRefundableAmount:
          line60NaturalHeritagePreservationCalculation.line7cElectedRefundableCreditAmount,
      },
    ];
  }

  if (input.line60ResearchCreditInput !== undefined) {
    const line60ResearchCreditCalculation = calculateCAFTB3523ResearchCredit({
      ...input.line60ResearchCreditInput,
      taxYear: input.taxYear,
    });

    line60SchedulePCarryoverCredits = [
      ...line60SchedulePCarryoverCredits,
      {
        code: "183",
        name: "Research Credit",
        amount: line60ResearchCreditCalculation.line38TotalCreditAvailable,
        electedRefundableAmount:
          line60ResearchCreditCalculation.line41ElectedRefundableCreditAmount,
      },
    ];
  }

  if (input.line60LowIncomeHousingCreditInput !== undefined) {
    const line60LowIncomeHousingCalculation = calculateCAFTB3521LowIncomeHousingCredit({
      ...input.line60LowIncomeHousingCreditInput,
      taxYear: input.taxYear,
    });

    line60SchedulePCarryoverCredits = [
      ...line60SchedulePCarryoverCredits,
      {
        code: "172",
        name: "Low-Income Housing Credit",
        amount: line60LowIncomeHousingCalculation.line11TotalAvailableCredit,
      },
    ];
  }

  if (input.line60CaliforniaCompetesCreditInput !== undefined) {
    const line60CaliforniaCompetesCalculation = calculateCAFTB3531CaliforniaCompetesTaxCredit({
      ...input.line60CaliforniaCompetesCreditInput,
      taxYear: input.taxYear,
    });

    line60CaliforniaCompetesAvailableCredit = line60CaliforniaCompetesCalculation.line7TotalAvailableCredit;
    line60CaliforniaCompetesRecapture =
      line60CaliforniaCompetesCalculation.line10bPreviouslyUsedRecapturedCredit;
    line60SupportingLines = line60SupportingLines.concat(
      line60CaliforniaCompetesCalculation.lines.filter((line) => line.form === "CA-3531")
    );
    line60SchedulePCarryoverCredits = [
      ...line60SchedulePCarryoverCredits,
      {
        code: "233",
        name: "California Competes Tax Credit",
        amount: line60CaliforniaCompetesAvailableCredit,
      },
    ];
  }

  if (input.line60CollegeAccessTaxCreditInput !== undefined) {
    const line60CollegeAccessCalculation = calculateCAFTB3592CollegeAccessTaxCredit({
      ...input.line60CollegeAccessTaxCreditInput,
      taxYear: input.taxYear,
    });

    line60SchedulePCarryoverCredits = [
      ...line60SchedulePCarryoverCredits,
      {
        code: "235",
        name: "College Access Tax Credit",
        amount: line60CollegeAccessCalculation.line5TotalAvailableCredit,
        electedRefundableAmount:
          line60CollegeAccessCalculation.line6cElectedRefundableCreditAmount,
      },
    ];
  }

  if (usesSchedulePSupportedCredits) {
    const schedulePResult = calculateCAScheduleP540NRSupportedCredits({
      subtotalTaxBeforeCredits: line42TaxBeforeCredits,
      tentativeMinimumTax: input.schedulePTentativeMinimumTax,
      line5ChildAndDependentCareCreditAmount: line50Credit,
      creditPercentage: line54CreditPercentage,
      line12JointCustodyHeadOfHouseholdCreditAmount: line51Credit,
      line13DependentParentCreditAmount: line52Credit,
      line14SeniorHeadOfHouseholdCreditAmount: line53Credit,
      line15RentersCreditAmount: line61Credit,
      line16Through19CarryoverCredits: line60SchedulePCarryoverCredits,
      line20OtherStateTaxCreditAmount: input.line60OtherStateTaxCreditAmount,
      line21PassThroughEntityElectiveTaxCreditAmount: input.line60PassThroughEntityElectiveTaxCreditAmount,
      alternativeMinimumTax: input.schedulePAlternativeMinimumTax,
      amtWorksheet: input.schedulePAmtWorksheetInput === undefined
        ? undefined
        : {
            ...input.schedulePAmtWorksheetInput,
            filingStatus: input.filingStatus,
            regularTax: line37,
          },
      line23SolarEnergyCreditCarryoverAmount: input.line71SolarEnergyCreditCarryoverAmount,
      line24CommercialSolarEnergyCreditCarryoverAmount: input.line71CommercialSolarEnergyCreditCarryoverAmount,
      taxYear: input.taxYear,
    });

    if (usesSchedulePSectionB) {
      line50Credit = schedulePResult.line5bChildAndDependentCareCreditUsed;
      line50Formula = "Use the supported Schedule P (540NR) Part III line 5 used-this-year amount";
      line50AuditInputs = {
        "Credit usage path": "ca_schedule_p_540nr_supported_credits",
        "Schedule P line": "5",
        "Schedule P available credit": schedulePResult.line5aChildAndDependentCareCreditAmount,
        "Schedule P credit used this year": schedulePResult.line5bChildAndDependentCareCreditUsed,
      };

      line55Credit = schedulePResult.line55TotalProratedCredits;
      line55Formula = "Use the supported Schedule P (540NR) Part III line 12 through line 14 used-this-year total";
      line55AuditInputs = {
        "Credit usage path": "ca_schedule_p_540nr_supported_credits",
        "Schedule P line": "12,13,14",
        "Credit code 170 used this year": schedulePResult.line12bJointCustodyHeadOfHouseholdCreditUsed,
        "Credit code 173 used this year": schedulePResult.line13bDependentParentCreditUsed,
        "Credit code 163 used this year": schedulePResult.line14bSeniorHeadOfHouseholdCreditUsed,
      };

      line60Credit = schedulePResult.line60AdditionalSpecialCreditsUsed;
      line60AdditionalCarryoverCredits = schedulePResult.line16Through19CarryoverCredits;
      line60PassThroughEntityElectiveTaxCreditCarryover =
        schedulePResult.line21dPassThroughEntityElectiveTaxCreditCarryover;
      const line60SchedulePLines: string[] = [];
      for (const carryoverCredit of line60AdditionalCarryoverCredits) {
        line60SchedulePLines.push(carryoverCredit.line.toString());
      }
      if (schedulePResult.line20aOtherStateTaxCreditAmount.greaterThan(0)) {
        line60SchedulePLines.push("20");
      }
      if (schedulePResult.line21aPassThroughEntityElectiveTaxCreditAmount.greaterThan(0)) {
        line60SchedulePLines.push("21");
      }
      line60Formula = "Use the supported Schedule P (540NR) Part III line 16 through line 21 used-this-year total";
      line60AuditInputs = {
        "Computation path": "ca_form_540nr_line_60_supported_credit_sum",
        "Credit usage path": "ca_schedule_p_540nr_supported_credits",
        "Schedule P line": line60SchedulePLines.join(","),
        "Credit code 187 used this year": schedulePResult.line20bOtherStateTaxCreditUsed,
        "Credit code 242 used this year": schedulePResult.line21bPassThroughEntityElectiveTaxCreditUsed,
        "Credit code 242 carryover": schedulePResult.line21dPassThroughEntityElectiveTaxCreditCarryover,
      };
      if (line60AdditionalCarryoverCredits.length > 0) {
        line60AuditInputs["Credit codes"] = line60AdditionalCarryoverCredits
          .map((credit) => credit.code)
          .concat(
            schedulePResult.line20aOtherStateTaxCreditAmount.greaterThan(0) ? ["187"] : [],
            schedulePResult.line21aPassThroughEntityElectiveTaxCreditAmount.greaterThan(0) ? ["242"] : []
          )
          .join(",");
        for (const carryoverCredit of line60AdditionalCarryoverCredits) {
          line60AuditInputs[`Credit code ${carryoverCredit.code} used this year`] = carryoverCredit.creditUsedThisYear;
          line60AuditInputs[`Credit code ${carryoverCredit.code} carryover`] = carryoverCredit.carryover;
        }
      }
      if (input.line60ChildAdoptionCostsCreditInput !== undefined) {
        line60AuditInputs["Credit code 197 qualification status"] =
          line60ChildAdoptionQualificationStatus ?? "unknown";
      }
      if (input.line60NaturalHeritagePreservationCreditInput !== undefined) {
        const line60NaturalHeritageCarryoverCredit = line60AdditionalCarryoverCredits.find(
          (credit) => credit.code === "213"
        );
        const line60NaturalHeritageCalculation = calculateCAFTB3503NaturalHeritagePreservationCredit({
          ...input.line60NaturalHeritagePreservationCreditInput,
          creditClaimedThisYear: line60NaturalHeritageCarryoverCredit?.creditUsedThisYear ?? d(0),
          taxYear: input.taxYear,
        });
        line60SupportingLines = line60SupportingLines.concat(
          line60NaturalHeritageCalculation.lines.filter((line) => line.form === "CA-3503")
        );
        line60AuditInputs["Credit code 213 available credit from FTB 3503 line 6"] =
          line60NaturalHeritageCalculation.line6TotalAvailableCredit;
        line60AuditInputs["Credit code 213 elected refundable amount from FTB 3503 line 7c"] =
          line60NaturalHeritageCalculation.line7cElectedRefundableCreditAmount;
      }
      if (input.line60ResearchCreditInput !== undefined) {
        const line60ResearchCreditCarryoverCredit = line60AdditionalCarryoverCredits.find(
          (credit) => credit.code === "183"
        );
        const line60ResearchCreditCalculation = calculateCAFTB3523ResearchCredit({
          ...input.line60ResearchCreditInput,
          creditClaimedThisYear: line60ResearchCreditCarryoverCredit?.creditUsedThisYear ?? d(0),
          taxYear: input.taxYear,
        });
        line60SupportingLines = line60SupportingLines.concat(
          line60ResearchCreditCalculation.lines.filter((line) => line.form === "CA-3523")
        );
        line60AuditInputs["Credit code 183 available credit from FTB 3523 line 38"] =
          line60ResearchCreditCalculation.line38TotalCreditAvailable;
        line60AuditInputs["Credit code 183 elected refundable amount from FTB 3523 line 41"] =
          line60ResearchCreditCalculation.line41ElectedRefundableCreditAmount;
      }
      if (input.line60LowIncomeHousingCreditInput !== undefined) {
        const line60LowIncomeHousingCarryoverCredit = line60AdditionalCarryoverCredits.find(
          (credit) => credit.code === "172"
        );
        const line60LowIncomeHousingCalculation = calculateCAFTB3521LowIncomeHousingCredit({
          ...input.line60LowIncomeHousingCreditInput,
          creditClaimedThisYear: line60LowIncomeHousingCarryoverCredit?.creditUsedThisYear ?? d(0),
          taxYear: input.taxYear,
        });
        line60SupportingLines = line60SupportingLines.concat(
          line60LowIncomeHousingCalculation.lines.filter((line) => line.form === "CA-3521")
        );
        line60AuditInputs["Credit code 172 available credit from FTB 3521 line 11"] =
          line60LowIncomeHousingCalculation.line11TotalAvailableCredit;
      }
      if (input.line60CaliforniaCompetesCreditInput !== undefined) {
        line60AuditInputs["Credit code 233 available credit from FTB 3531 line 7"] =
          line60CaliforniaCompetesAvailableCredit;
        line60AuditInputs["Credit code 233 recapture from FTB 3531 line 10b"] =
          line60CaliforniaCompetesRecapture;
      }
      if (input.line60CollegeAccessTaxCreditInput !== undefined) {
        const line60CollegeAccessCarryoverCredit = line60AdditionalCarryoverCredits.find(
          (credit) => credit.code === "235"
        );
        const line60CollegeAccessCalculation = calculateCAFTB3592CollegeAccessTaxCredit({
          ...input.line60CollegeAccessTaxCreditInput,
          creditClaimedThisYear: line60CollegeAccessCarryoverCredit?.creditUsedThisYear ?? d(0),
          taxYear: input.taxYear,
        });
        line60SupportingLines = line60SupportingLines.concat(
          line60CollegeAccessCalculation.lines.filter((line) => line.form === "CA-3592")
        );
        line60AuditInputs["Credit code 235 available credit from FTB 3592 line 5"] =
          line60CollegeAccessCalculation.line5TotalAvailableCredit;
        line60AuditInputs["Credit code 235 elected refundable amount from FTB 3592 line 6c"] =
          line60CollegeAccessCalculation.line6cElectedRefundableCreditAmount;
      }

      line61Credit = schedulePResult.line15bRentersCreditUsed;
      line61Formula = "Use the supported Schedule P (540NR) Part III line 15 used-this-year amount";
      line61AuditInputs = {
        "Credit usage path": "ca_schedule_p_540nr_supported_credits",
        "Schedule P line": "15",
        "Schedule P available credit": schedulePResult.line15aRentersCreditAmount,
        "Schedule P credit used this year": schedulePResult.line15bRentersCreditUsed,
      };
    }

    if (usesSchedulePSectionC) {
      line71AlternativeMinimumTax = schedulePResult.line25AdjustedAlternativeMinimumTax;
      line71SolarEnergyCreditCarryover = schedulePResult.line23dSolarEnergyCreditCarryover;
      line71CommercialSolarEnergyCreditCarryover = schedulePResult.line24dCommercialSolarEnergyCreditCarryover;
      line71Formula = "Use the supported Schedule P (540NR) Part III line 25 adjusted AMT";
      line71AuditInputs = {
        "Computation path": "ca_schedule_p_540nr_supported_credits",
        "Schedule P line": "25",
        "Credit code 180 used this year": schedulePResult.line23bSolarEnergyCreditUsed,
        "Credit code 180 carryover": schedulePResult.line23dSolarEnergyCreditCarryover,
        "Credit code 181 used this year": schedulePResult.line24bCommercialSolarEnergyCreditUsed,
        "Credit code 181 carryover": schedulePResult.line24dCommercialSolarEnergyCreditCarryover,
      };
    }

    line50SupportingLines = line50SupportingLines.concat(schedulePResult.lines);
  }
  const line62TotalCredits = sum(line50Credit, line55Credit, line58Credit, line59Credit, line60Credit, line61Credit);
  const line63TaxAfterCredits = zeroFloor(line42TaxBeforeCredits.minus(line62TotalCredits));
  const line72Calculation = calculateCABehavioralHealthServicesTax({
    taxableIncome: californiaTaxableIncome,
    filingStatus: input.filingStatus,
    returnType: "nonresident",
    taxYear: input.taxYear,
  });
  const line72BehavioralHealthServicesTax = line72Calculation.tax;
  const line73UpstreamOtherTaxes = nonNegativeAmount(
    input.line73OtherTaxes,
    "CA Form 540NR line 73 other taxes"
  );
  const line73OtherTaxes = line73UpstreamOtherTaxes.plus(line60CaliforniaCompetesRecapture);
  const line73Formula = line60CaliforniaCompetesRecapture.greaterThan(0)
    ? "Supported upstream Form 540NR line 73 amount plus supported FTB 3531 line 10b previously used recaptured credit"
    : "Supported upstream Form 540NR line 73 amount";
  const line73AuditInputs: Record<string, Decimal | string> = line60CaliforniaCompetesRecapture.greaterThan(0)
    ? {
        "Supported upstream Form 540NR line 73 amount": line73UpstreamOtherTaxes,
        "Credit code 233 recapture from FTB 3531 line 10b": line60CaliforniaCompetesRecapture,
      }
    : {};
  const line74TotalTax = sum(
    line63TaxAfterCredits,
    line71AlternativeMinimumTax,
    line72BehavioralHealthServicesTax,
    line73OtherTaxes
  );

  const audit = new AuditTrail();
  audit.merge(line31Calculation.lines);
  audit.merge(exemptionCredits.lines);
  audit.merge(line50SupportingLines);
  audit.merge(line51SupportingLines);
  audit.merge(line52SupportingLines);
  audit.merge(line53SupportingLines);
  audit.merge(line58SupportingLines);
  audit.merge(line59SupportingLines);
  audit.merge(line60SupportingLines);
  audit.merge(line72Calculation.lines);

  audit.record(
    "CA-540NR-TC",
    "31",
    "Tax on total taxable income",
    line31,
    line31Source === "tax_table"
      ? "Use the supported 2025 Form 540 Tax Table amount because total taxable income is $100,000 or less"
      : "Use the supported 2025 Form 540 Tax Rate Schedules amount because total taxable income exceeds $100,000",
    {
      "Form 540NR line 19 total taxable income": totalTaxableIncome,
      "Computation path": line31Source,
    }
  );
  audit.record(
    "CA-540NR-TC",
    "35",
    "California taxable income",
    line35,
    "Supported Schedule CA (540NR) Part IV line 5 input"
  );
  audit.record(
    "CA-540NR-TC",
    "36",
    "California tax rate",
    line36,
    totalTaxableIncome.greaterThan(0)
      ? "Round(Line 31 / total taxable income, 4 decimal places)"
      : "0.0000 because total taxable income is 0",
    {
      "Line 31": line31,
      "Form 540NR line 19 total taxable income": totalTaxableIncome,
    }
  );
  audit.record(
    "CA-540NR-TC",
    "37",
    "California tax before exemption credits",
    line37,
    "Round(Line 35 × Line 36 to the nearest whole dollar)",
    {
      "Line 35": line35,
      "Line 36": line36,
    }
  );
  audit.record(
    "CA-540NR-TC",
    "38",
    "California exemption credit percentage",
    line38,
    totalTaxableIncome.greaterThan(0)
      ? "min(1.0000, round(Line 35 / total taxable income, 4 decimal places))"
      : "0.0000 because total taxable income is 0",
    {
      "Line 35": line35,
      "Form 540NR line 19 total taxable income": totalTaxableIncome,
    }
  );
  audit.record(
    "CA-540NR-TC",
    "39",
    "California prorated exemption credits",
    line39,
    "Round(supported California exemption-credit amount × Line 38 to the nearest whole dollar)",
    {
      "Supported California exemption-credit amount": supportedResidentExemptionCredits,
      "Line 38": line38,
    }
  );
  audit.record(
    "CA-540NR-TC",
    "40",
    "California regular tax before credits",
    line40,
    "max(0, Line 37 - Line 39)",
    {
      "Line 37": line37,
      "Line 39": line39,
    }
  );
  audit.record(
    "CA-540NR-TC",
    "41",
    "Tax from Schedule G-1 and/or FTB 5870A",
    line41Tax,
    "Supported upstream input for Form 540NR line 41"
  );
  audit.record(
    "CA-540NR-TC",
    "42",
    "Subtotal tax before credits",
    line42TaxBeforeCredits,
    "Line 40 + Line 41",
    {
      "Line 40": line40,
      "Line 41": line41Tax,
    }
  );
  audit.record(
    "CA-540NR-TC",
    "50",
    "Nonrefundable child and dependent care expenses credit",
    line50Credit,
    line50Formula,
    line50AuditInputs
  );
  audit.record(
    "CA-540NR-TC",
    "51",
    "Credit for Joint Custody Head of Household",
    line51Credit,
    line51Formula,
    line51AuditInputs
  );
  audit.record(
    "CA-540NR-TC",
    "52",
    "Credit for Dependent Parent",
    line52Credit,
    line52Formula,
    line52AuditInputs
  );
  audit.record(
    "CA-540NR-TC",
    "53",
    "Credit for Senior Head of Household",
    line53Credit,
    line53Formula,
    line53AuditInputs
  );
  audit.record(
    "CA-540NR-TC",
    "54",
    "Credit percentage",
    line54CreditPercentage,
    "Copy line 38; if more than 1, enter 1.0000",
    {
      "Line 38": line38,
    }
  );
  audit.record(
    "CA-540NR-TC",
    "55",
    "Credit amount",
    line55Credit,
    line55Formula,
    line55AuditInputs
  );
  audit.record("CA-540NR-TC", "58", "Additional special credits", line58Credit, line58Formula, line58AuditInputs);
  audit.record("CA-540NR-TC", "59", "Additional special credits", line59Credit, line59Formula, line59AuditInputs);
  audit.record("CA-540NR-TC", "60", "Additional special credits", line60Credit, line60Formula, line60AuditInputs);
  audit.record("CA-540NR-TC", "61", "Nonrefundable renter's credit", line61Credit, line61Formula, line61AuditInputs);
  audit.record(
    "CA-540NR-TC",
    "62",
    "Total credits",
    line62TotalCredits,
    "Line 50 + Line 55 + Line 58 + Line 59 + Line 60 + Line 61",
    {
      "Line 50": line50Credit,
      "Line 55": line55Credit,
      "Line 58": line58Credit,
      "Line 59": line59Credit,
      "Line 60": line60Credit,
      "Line 61": line61Credit,
    }
  );
  audit.record(
    "CA-540NR-TC",
    "63",
    "Tax after credits",
    line63TaxAfterCredits,
    "max(0, Line 42 - Line 62)",
    {
      "Line 42": line42TaxBeforeCredits,
      "Line 62": line62TotalCredits,
    }
  );
  audit.record(
    "CA-540NR-TC",
    "71",
    "Alternative minimum tax",
    line71AlternativeMinimumTax,
    line71Formula,
    line71AuditInputs
  );
  audit.record(
    "CA-540NR-TC",
    "72",
    "Behavioral Health Services Tax",
    line72BehavioralHealthServicesTax,
    "Use the supported nonresident Behavioral Health Services Tax worksheet amount",
    {
      "California taxable income": californiaTaxableIncome,
      "Computation path": "nonresident_behavioral_health_services_tax",
    }
  );
  audit.record(
    "CA-540NR-TC",
    "73",
    "Other taxes and credit recapture",
    line73OtherTaxes,
    line73Formula,
    line73AuditInputs
  );
  audit.record(
    "CA-540NR-TC",
    "74",
    "Total tax",
    line74TotalTax,
    "Line 63 + Line 71 + Line 72 + Line 73",
    {
      "Line 63": line63TaxAfterCredits,
      "Line 71": line71AlternativeMinimumTax,
      "Line 72": line72BehavioralHealthServicesTax,
      "Line 73": line73OtherTaxes,
    }
  );

  return {
    totalTaxableIncome,
    californiaTaxableIncome,
    filingStatus: input.filingStatus,
    federalAgi,
    line31Source,
    line31,
    line35,
    line36,
    line37,
    line38,
    supportedResidentExemptionCredits,
    line39,
    line40,
    line41Tax,
    line42TaxBeforeCredits,
    line50Credit,
    line51Credit,
    line52Credit,
    line53Credit,
    line54CreditPercentage,
    line55Credit,
    line58Credit,
    line59Credit,
    line60Credit,
    line60AdditionalCarryoverCredits,
    line60PassThroughEntityElectiveTaxCreditCarryover,
    line61Credit,
    line62TotalCredits,
    line63TaxAfterCredits,
    line71AlternativeMinimumTax,
    line71SolarEnergyCreditCarryover,
    line71CommercialSolarEnergyCreditCarryover,
    line72BehavioralHealthServicesTax,
    line73OtherTaxes,
    line74TotalTax,
    lines: audit.getLines(),
  };
}
