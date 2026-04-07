/**
 * Ohio Schedule of Credits — Nonrefundable and refundable credits.
 * Spec: spec/state/oh-schedule-credits.yaml
 *
 * Implements the most common nonrefundable credits for W-2 wage earners:
 * retirement income credit, senior citizen credit, child/dependent care credit,
 * displaced worker training credit, campaign contribution credit, exemption credit,
 * joint filing credit, earned income credit, home school expenses credit,
 * scholarship donation credit, and nonchartered school tuition credit.
 *
 * Less common certificate and carryforward credits are accepted as pass-through
 * inputs with line-specific audit trail entries.
 */

import Decimal from "decimal.js";
import {
  OHIO_TAX_CONSTANTS,
  type FilingStatus,
  type JointFilingCreditTier,
  type OhioScheduleOfCreditsYearConstants,
} from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";
import {
  calculateOhioLumpSumRetirementCredit,
  type OhioLumpSumRetirementCreditRecipientInput,
  type OhioLumpSumRetirementCreditResult,
} from "@/engine/state/oh-lump-sum-retirement-credit.js";
import { calculateOhioLumpSumDistributionCredit } from "@/engine/state/oh-lump-sum-distribution-credit.js";
export const OH_SCHEDULE_OF_CREDITS_CONSTANTS: Record<
  number,
  OhioScheduleOfCreditsYearConstants
> = {
  2024: OHIO_TAX_CONSTANTS[2024].scheduleCredits,
  2025: OHIO_TAX_CONSTANTS[2025].scheduleCredits,
};

export interface OhioDisplacedWorkerCreditRecipientInput {
  expenses: Decimal | string | number;
  priorYearCredit?: Decimal | string | number;
}

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface OhioScheduleOfCreditsInput {
  taxYear: number;
  filingStatus: FilingStatus;
  /** Federal AGI from federal Form 1040. */
  federalAgi: Decimal | string | number;
  /** IT 1040 line 8c — total tax before credits. */
  taxBeforeCredits: Decimal | string | number;
  /** MAGI = Ohio AGI + business income deduction. */
  magi: Decimal | string | number;
  /** MAGI less exemptions = MAGI - IT 1040 line 4. */
  magiLessExemptions: Decimal | string | number;
  /** Number of exemptions from IT 1040 line 4. */
  exemptions: number;

  // --- Credit-specific inputs (all optional, default 0/$false) ---

  /** Eligible retirement income included in Ohio AGI. */
  retirementIncome?: Decimal | string | number;
  /** Whether taxpayer (or spouse) is age 65+ at end of tax year. */
  isSenior?: boolean;
  /** Federal Form 2441 line 9c (qualifying child/dependent care expenses). */
  federal2441Line9c?: Decimal | string | number;
  /** Federal Form 2441 line 11 (federal child/dependent care credit). */
  federal2441Line11?: Decimal | string | number;
  /** Qualifying displaced worker training expenses. */
  displacedWorkerExpenses?: Decimal | string | number;
  /** Displaced worker credit claimed on prior year return. */
  priorYearDisplacedWorkerCredit?: Decimal | string | number;
  /** Optional taxpayer/spouse worksheet columns for line 7. */
  displacedWorkerRecipients?: OhioDisplacedWorkerCreditRecipientInput[];
  /** Campaign contributions to qualifying Ohio candidates. */
  campaignContributions?: Decimal | string | number;
  /** Federal earned income credit (federal 1040 line 27a). */
  federalEarnedIncomeCredit?: Decimal | string | number;
  /** Qualifying educational expenses paid for Ohio home-schooled students. */
  homeSchoolExpenses?: Decimal | string | number;
  /** Number of qualifying students for the home school expenses credit. */
  homeSchoolQualifyingStudents?: number;
  /** Total eligible scholarship donations to scholarship granting organizations. */
  scholarshipDonations?: Decimal | string | number;
  /** Total qualifying tuition paid to eligible nonchartered, nonpublic schools. */
  noncharteredSchoolTuition?: Decimal | string | number;
  /** Optional spouse-level qualifying income amount from the Ohio joint filing credit statement. */
  primaryQualifyingIncome?: Decimal | string | number;
  /** Optional spouse-level qualifying income amount from the Ohio joint filing credit statement. */
  spouseQualifyingIncome?: Decimal | string | number;
  /** Whether both spouses have $500+ qualifying income (for joint filing credit). */
  bothSpousesHaveQualifyingIncome?: boolean;
  /** Qualifying recipients for the line 3 lump sum retirement worksheet. */
  lumpSumRetirementRecipients?: OhioLumpSumRetirementCreditRecipientInput[];

  // --- Pass-through credits (less common, default 0) ---

  /** Line 3: lump sum retirement credit. */
  lumpSumRetirementCredit?: Decimal | string | number;
  /** Line 5: lump sum distribution credit. */
  lumpSumDistributionCredit?: Decimal | string | number;
  /** Qualifying lump sum distribution recipient ages for worksheet line 5. */
  lumpSumDistributionRecipientAges?: number[];
  /** Line 17: credit for work-based learning experiences. */
  workBasedLearningExperienceCredit?: Decimal | string | number;
  /** Line 18: Ohio adoption credit carryforward. */
  ohioAdoptionCreditCarryforward?: Decimal | string | number;
  /** Line 19: nonrefundable job retention credit. */
  nonrefundableJobRetentionCredit?: Decimal | string | number;
  /** Line 20: credit for new employees in an enterprise zone. */
  newEmployeesEnterpriseZoneCredit?: Decimal | string | number;
  /** Line 21: credit for the beginning farmers financial management program. */
  beginningFarmersFinancialManagementCredit?: Decimal | string | number;
  /** Line 22: credit for commercial vehicle operator training expenses. */
  commercialVehicleOperatorTrainingCredit?: Decimal | string | number;
  /** Line 23: Welcome Home Ohio credit. */
  welcomeHomeOhioCredit?: Decimal | string | number;
  /** Line 24: credit for transformational mixed-use development. */
  transformationalMixedUseDevelopmentCredit?: Decimal | string | number;
  /** Line 25: credit for sale/rental of agricultural assets to beginning farmers. */
  saleRentalAgriculturalAssetsBeginningFarmersCredit?:
    | Decimal
    | string
    | number;
  /** Line 26: grape production credit. */
  grapeProductionCredit?: Decimal | string | number;
  /** Aggregate qualifying grape-production property cost for direct line 26 computation. */
  grapeProductionQualifyingPropertyCost?: Decimal | string | number;
  /** Line 27: InvestOhio credit. */
  investOhioCredit?: Decimal | string | number;
  /** Line 28: lead abatement credit. */
  leadAbatementCredit?: Decimal | string | number;
  /** Line 29: opportunity zone investment credit. */
  opportunityZoneInvestmentCredit?: Decimal | string | number;
  /** Line 30: technology investment credit carryforward. */
  technologyInvestmentCreditCarryforward?: Decimal | string | number;
  /** Line 31: enterprise zone day care and training credit. */
  enterpriseZoneDayCareAndTrainingCredit?: Decimal | string | number;
  /** Line 32: research and development credit. */
  researchAndDevelopmentCredit?: Decimal | string | number;
  /** Line 33: nonrefundable Ohio historic preservation credit. */
  nonrefundableHistoricPreservationCredit?: Decimal | string | number;
  /** Line 34: Ohio low-income housing credit. */
  ohioLowIncomeHousingCredit?: Decimal | string | number;
  /** Line 35: affordable single-family housing credit. */
  affordableSingleFamilyHousingCredit?: Decimal | string | number;
  /** Deprecated aggregate fallback for lines 17-35. */
  otherSecondBatchCredits?: Decimal | string | number;
  /** Line 38: nonresident credit. */
  nonresidentCredit?: Decimal | string | number;
  /** Line 39: resident credit (credit for taxes paid to another state). */
  residentCredit?: Decimal | string | number;

  // --- Refundable credits (lines 41-46, all pass-through) ---

  /** Line 41: refundable Ohio historic preservation credit. */
  refundableHistoricPreservationCredit?: Decimal | string | number;
  /** Line 42: refundable job creation/job retention credit. */
  refundableJobCreationCredit?: Decimal | string | number;
  /** Line 43: pass-through entity credit. */
  passThroughEntityCredit?: Decimal | string | number;
  /** Line 44: motion picture and Broadway theatrical production credit. */
  refundableMotionPictureCredit?: Decimal | string | number;
  /** Line 45: film and theater capital improvement projects credit. */
  filmTheaterCapitalImprovementCredit?: Decimal | string | number;
  /** Line 46: venture capital credit. */
  ventureCapitalCredit?: Decimal | string | number;
}

export interface OhioScheduleOfCreditsResult {
  line1_taxBeforeCredits: Decimal;
  line2_retirementIncomeCredit: Decimal;
  line3_lumpSumRetirementCredit: Decimal;
  lumpSumRetirementWorksheet: OhioLumpSumRetirementCreditResult | null;
  line4_seniorCitizenCredit: Decimal;
  line5_lumpSumDistributionCredit: Decimal;
  line6_childDependentCareCredit: Decimal;
  line7_displacedWorkerCredit: Decimal;
  line8_campaignContributionCredit: Decimal;
  line9_exemptionCredit: Decimal;
  line10_totalFirstBatch: Decimal;
  line11_taxLessFirstBatch: Decimal;
  line12_jointFilingCredit: Decimal;
  line13_earnedIncomeCredit: Decimal;
  line14_homeSchoolExpensesCredit: Decimal;
  line15_scholarshipDonationCredit: Decimal;
  line16_noncharteredSchoolTuitionCredit: Decimal;
  line17_workBasedLearningExperienceCredit: Decimal;
  line18_ohioAdoptionCreditCarryforward: Decimal;
  line19_nonrefundableJobRetentionCredit: Decimal;
  line20_newEmployeesEnterpriseZoneCredit: Decimal;
  line21_beginningFarmersFinancialManagementCredit: Decimal;
  line22_commercialVehicleOperatorTrainingCredit: Decimal;
  line23_welcomeHomeOhioCredit: Decimal;
  line24_transformationalMixedUseDevelopmentCredit: Decimal;
  line25_saleRentalAgriculturalAssetsBeginningFarmersCredit: Decimal;
  line26_grapeProductionCredit: Decimal;
  line27_investOhioCredit: Decimal;
  line28_leadAbatementCredit: Decimal;
  line29_opportunityZoneInvestmentCredit: Decimal;
  line30_technologyInvestmentCreditCarryforward: Decimal;
  line31_enterpriseZoneDayCareAndTrainingCredit: Decimal;
  line32_researchAndDevelopmentCredit: Decimal;
  line33_nonrefundableHistoricPreservationCredit: Decimal;
  line34_ohioLowIncomeHousingCredit: Decimal;
  line35_affordableSingleFamilyHousingCredit: Decimal;
  line36_totalSecondBatch: Decimal;
  line37_taxLessAllCredits: Decimal;
  line38_nonresidentCredit: Decimal;
  line39_residentCredit: Decimal;
  line40_totalNonrefundableCredits: Decimal;
  line41_refundableHistoricPreservationCredit: Decimal;
  line42_refundableJobCreationCredit: Decimal;
  line43_passThroughEntityCredit: Decimal;
  line44_refundableMotionPictureCredit: Decimal;
  line45_filmTheaterCapitalImprovementCredit: Decimal;
  line46_ventureCapitalCredit: Decimal;
  line47_totalRefundableCredits: Decimal;
  lines: CalculatedLine[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRetirementIncomeCredit(
  retirementIncome: Decimal,
  magiLessExemptions: Decimal,
  constants: OhioScheduleOfCreditsYearConstants
): Decimal {
  if (
    magiLessExemptions.greaterThanOrEqualTo(
      constants.retirementCreditMagiLessExemptionsLimit
    )
  ) {
    return new Decimal(0);
  }
  if (retirementIncome.lessThanOrEqualTo(0)) {
    return new Decimal(0);
  }
  for (const tier of constants.retirementIncomeCreditTiers) {
    if (
      tier.maxIncome === null ||
      retirementIncome.lessThanOrEqualTo(tier.maxIncome)
    ) {
      return tier.credit;
    }
  }
  return new Decimal(0);
}

function getChildDependentCareCredit(
  magi: Decimal,
  federal2441Line9c: Decimal,
  federal2441Line11: Decimal,
  constants: OhioScheduleOfCreditsYearConstants
): Decimal {
  if (magi.greaterThanOrEqualTo(constants.childCareMagiThresholdPartial)) {
    return new Decimal(0);
  }
  if (magi.lessThan(constants.childCareMagiThresholdFull)) {
    return federal2441Line9c;
  }
  // MAGI $20,000–$39,999: 25% of federal 2441 line 11
  return roundDollar(federal2441Line11.times(constants.childCarePartialRate));
}

function getJointFilingCreditRate(
  magiLessExemptions: Decimal,
  tiers: JointFilingCreditTier[]
): Decimal {
  for (const tier of tiers) {
    if (
      tier.maxMagiLessExemptions === null ||
      magiLessExemptions.lessThanOrEqualTo(tier.maxMagiLessExemptions)
    ) {
      return tier.rate;
    }
  }
  return new Decimal(0);
}

function getHomeSchoolExpensesCredit(
  expenses: Decimal,
  qualifyingStudents: number | undefined,
  constants: OhioScheduleOfCreditsYearConstants
): Decimal {
  if (expenses.lessThanOrEqualTo(0)) {
    return new Decimal(0);
  }

  const students = qualifyingStudents ?? 0;
  if (constants.homeSchoolExpensesCreditUsesPerStudentCap && students <= 0) {
    return new Decimal(0);
  }

  const cap = constants.homeSchoolExpensesCreditUsesPerStudentCap
    ? constants.homeSchoolExpensesCreditMaxPerStudent.times(students)
    : constants.homeSchoolExpensesCreditMaxPerReturn;

  return min(expenses, cap);
}

function getScholarshipDonationCredit(
  filingStatus: FilingStatus,
  scholarshipDonations: Decimal,
  constants: OhioScheduleOfCreditsYearConstants
): Decimal {
  const maxCredit =
    filingStatus === "married_filing_jointly"
      ? constants.scholarshipDonationCreditMaxMfj
      : constants.scholarshipDonationCreditMaxSingle;

  return min(scholarshipDonations, maxCredit);
}

function getNoncharteredSchoolTuitionCredit(
  federalAgi: Decimal,
  tuitionPaid: Decimal,
  constants: OhioScheduleOfCreditsYearConstants
): Decimal {
  const maxCredit = federalAgi.lessThan(
    constants.noncharteredSchoolTuitionCreditAgiThreshold
  )
    ? constants.noncharteredSchoolTuitionCreditMaxBelowThreshold
    : constants.noncharteredSchoolTuitionCreditMaxAtOrAboveThreshold;

  return min(tuitionPaid, maxCredit);
}

function getDisplacedWorkerRecipientCredit(
  recipient: OhioDisplacedWorkerCreditRecipientInput,
  constants: OhioScheduleOfCreditsYearConstants
): Decimal {
  const halfExpenses = d(recipient.expenses).times(constants.displacedWorkerRate);
  const capped = min(halfExpenses, constants.displacedWorkerMaxCredit);
  return zeroFloor(capped.minus(d(recipient.priorYearCredit)));
}

function getGrapeProductionCredit(
  explicitCredit: Decimal | string | number | undefined,
  qualifyingPropertyCost: Decimal | string | number | undefined,
  constants: OhioScheduleOfCreditsYearConstants
): Decimal {
  if (explicitCredit !== undefined) {
    return d(explicitCredit);
  }

  const qualifyingCost = zeroFloor(d(qualifyingPropertyCost));
  if (qualifyingCost.isZero()) {
    return new Decimal(0);
  }

  return roundDollar(qualifyingCost.times(constants.grapeProductionCreditRate));
}

function hasExplicitSpouseQualifyingIncome(
  input: OhioScheduleOfCreditsInput
): boolean {
  return (
    input.primaryQualifyingIncome !== undefined ||
    input.spouseQualifyingIncome !== undefined
  );
}

function spousesMeetQualifyingIncomeThreshold(
  input: OhioScheduleOfCreditsInput
): boolean {
  if (input.filingStatus !== "married_filing_jointly") {
    return false;
  }

  if (hasExplicitSpouseQualifyingIncome(input)) {
    return (
      d(input.primaryQualifyingIncome).greaterThanOrEqualTo(500) &&
      d(input.spouseQualifyingIncome).greaterThanOrEqualTo(500)
    );
  }

  return Boolean(input.bothSpousesHaveQualifyingIncome);
}

// ---------------------------------------------------------------------------
// Main calculation
// ---------------------------------------------------------------------------

export function calculateOhioScheduleOfCredits(
  input: OhioScheduleOfCreditsInput
): OhioScheduleOfCreditsResult {
  const constants = OH_SCHEDULE_OF_CREDITS_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(
      `Ohio Schedule of Credits constants not available for tax year ${input.taxYear}`
    );
  }

  const audit = new AuditTrail();

  const federalAgiVal = d(input.federalAgi);
  const magiVal = d(input.magi);
  const magiLessExemptionsVal = d(input.magiLessExemptions);

  // Line 1 — Tax liability before credits
  const line1 = d(input.taxBeforeCredits);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "1",
    "Tax liability before credits",
    line1,
    "IT 1040, line 8c"
  );

  const lumpSumRetirementWorksheet =
    input.lumpSumRetirementCredit !== undefined
      ? null
      : input.lumpSumRetirementRecipients &&
          input.lumpSumRetirementRecipients.length > 0
        ? calculateOhioLumpSumRetirementCredit({
            taxYear: input.taxYear,
            recipients: input.lumpSumRetirementRecipients,
            scheduleOfCreditsLine1TaxLiability: line1,
            scheduleOfCreditsLine2RetirementIncomeCredit: 0,
          })
        : null;

  // Line 3 — Lump sum retirement credit (pass-through or worksheet)
  const line3 = input.lumpSumRetirementCredit !== undefined
    ? d(input.lumpSumRetirementCredit)
    : lumpSumRetirementWorksheet?.line6_totalCredit ?? new Decimal(0);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "3",
    "Lump sum retirement credit",
    line3,
    input.lumpSumRetirementCredit !== undefined
      ? "Pass-through input"
      : input.lumpSumRetirementRecipients &&
          input.lumpSumRetirementRecipients.length > 0
        ? "Ohio lump sum retirement credit worksheet total"
        : "Default $0",
  );

  // Line 2 — Retirement income credit
  const line2 = line3.greaterThan(0)
    ? new Decimal(0)
    : getRetirementIncomeCredit(
        d(input.retirementIncome),
        magiLessExemptionsVal,
        constants
      );
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "2",
    "Retirement income credit",
    line2,
    line3.greaterThan(0)
      ? "$0 because line 3 lump sum retirement credit is claimed"
      : "Table 2 lookup based on retirement income in Ohio AGI",
    {
      "Retirement income": d(input.retirementIncome),
      "MAGI less exemptions": magiLessExemptionsVal,
      "Line 3": line3,
    }
  );

  // Line 5 — Lump sum distribution credit
  const line5 = input.lumpSumDistributionCredit !== undefined
    ? d(input.lumpSumDistributionCredit)
    : input.lumpSumDistributionRecipientAges &&
        input.lumpSumDistributionRecipientAges.length > 0
      ? calculateOhioLumpSumDistributionCredit({
          taxYear: input.taxYear,
          recipientAges: input.lumpSumDistributionRecipientAges,
        }).line3_totalCredit
      : new Decimal(0);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "5",
    "Lump sum distribution credit",
    line5,
    input.lumpSumDistributionCredit !== undefined
      ? "Pass-through input"
      : input.lumpSumDistributionRecipientAges &&
          input.lumpSumDistributionRecipientAges.length > 0
        ? "Ohio lump sum distribution credit worksheet total"
        : "Default $0"
  );

  // Line 4 — Senior citizen credit
  const line4 = line5.greaterThan(0)
    ? new Decimal(0)
    : input.isSenior &&
      magiLessExemptionsVal.lessThan(constants.seniorCreditMagiLessExemptionsLimit)
      ? constants.seniorCitizenCreditAmount
      : new Decimal(0);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "4",
    "Senior citizen credit",
    line4,
    line5.greaterThan(0)
      ? "$0 because line 5 lump sum distribution credit is claimed"
      : "If age 65+ and MAGI less exemptions < $100,000: $50",
    {
      "Is senior": input.isSenior ? "true" : "false",
      "MAGI less exemptions": magiLessExemptionsVal,
      "Line 5": line5,
    }
  );

  // Line 6 — Child and dependent care credit
  const line6 = getChildDependentCareCredit(
    magiVal,
    d(input.federal2441Line9c),
    d(input.federal2441Line11),
    constants
  );
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "6",
    "Child and dependent care credit",
    line6,
    "Based on MAGI and federal Form 2441",
    {
      MAGI: magiVal,
      "Federal 2441 line 9c": d(input.federal2441Line9c),
      "Federal 2441 line 11": d(input.federal2441Line11),
    }
  );

  // Line 7 — Displaced worker training credit
  let line7 = new Decimal(0);
  const displacedExpenses = d(input.displacedWorkerExpenses);
  const displacedRecipients = input.displacedWorkerRecipients ?? [];
  if (displacedRecipients.length > 0) {
    if (displacedRecipients.length > 2) {
      throw new Error(
        "Ohio displaced worker training credit supports at most two recipient columns (taxpayer and spouse)"
      );
    }
    if (
      input.filingStatus !== "married_filing_jointly" &&
      displacedRecipients.length > 1
    ) {
      throw new Error(
        "Ohio displaced worker training credit only supports two recipient columns on married filing jointly returns"
      );
    }
    line7 = sum(
      ...displacedRecipients.map((recipient) =>
        getDisplacedWorkerRecipientCredit(recipient, constants)
      )
    );
  } else if (displacedExpenses.greaterThan(0)) {
    const halfExpenses = displacedExpenses.times(constants.displacedWorkerRate);
    const capped = min(halfExpenses, constants.displacedWorkerMaxCredit);
    const priorYear = d(input.priorYearDisplacedWorkerCredit);
    line7 = zeroFloor(capped.minus(priorYear));
  }
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "7",
    "Displaced worker training credit",
    line7,
    displacedRecipients.length > 0
      ? "Sum of taxpayer/spouse worksheet columns: max(0, min($500, 50% of expenses) - prior year credit)"
      : "max(0, min($500, 50% of expenses) - prior year credit)",
    {
      "Training expenses": displacedExpenses,
      "Recipient columns": displacedRecipients.length.toString(),
    }
  );

  // Line 8 — Campaign contribution credit
  const campaignMax =
    input.filingStatus === "married_filing_jointly"
      ? constants.campaignContributionMaxMfj
      : constants.campaignContributionMaxSingle;
  const line8 = min(d(input.campaignContributions), campaignMax);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "8",
    "Campaign contribution credit",
    line8,
    `Contributions up to $${campaignMax}`,
    { Contributions: d(input.campaignContributions) }
  );

  // Line 9 — Exemption credit
  const line9 = magiLessExemptionsVal.lessThan(
    constants.exemptionCreditMagiLessExemptionsLimit
  )
    ? constants.exemptionCreditPerExemption.times(input.exemptions)
    : new Decimal(0);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "9",
    "Exemption credit",
    line9,
    "$20 × exemptions if MAGI less exemptions < $30,000",
    {
      "MAGI less exemptions": magiLessExemptionsVal,
      Exemptions: input.exemptions.toString(),
    }
  );

  // Line 10 — Total first-batch credits (lines 2-9)
  const line10 = sum(line2, line3, line4, line5, line6, line7, line8, line9);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "10",
    "Total first-batch credits",
    line10,
    "Sum of lines 2-9"
  );

  // Line 11 — Tax less first-batch credits
  const line11 = zeroFloor(line1.minus(line10));
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "11",
    "Tax less first-batch credits",
    line11,
    "max(0, Line 1 - Line 10)",
    { "Line 1": line1, "Line 10": line10 }
  );

  // Line 12 — Joint filing credit
  let line12 = new Decimal(0);
  if (
    input.filingStatus === "married_filing_jointly" &&
    spousesMeetQualifyingIncomeThreshold(input) &&
    magiLessExemptionsVal.lessThan(
      constants.jointFilingCreditMagiLessExemptionsLimit
    )
  ) {
    const rate = getJointFilingCreditRate(
      magiLessExemptionsVal,
      constants.jointFilingCreditTiers
    );
    const rawCredit = roundDollar(line11.times(rate));
    line12 = min(rawCredit, constants.jointFilingCreditMax);
  }
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "12",
    "Joint filing credit",
    line12,
    "Percentage of line 11 based on MAGI less exemptions, max $650",
    {
      "Filing status": input.filingStatus,
      "MAGI less exemptions": magiLessExemptionsVal,
      "Line 11": line11,
      "Primary qualifying income": d(input.primaryQualifyingIncome),
      "Spouse qualifying income": d(input.spouseQualifyingIncome),
      "Boolean proxy": input.bothSpousesHaveQualifyingIncome ? "true" : "false",
    }
  );

  // Line 13 — Earned income credit
  const line13 = roundDollar(
    d(input.federalEarnedIncomeCredit).times(constants.earnedIncomeCreditRate)
  );
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "13",
    "Earned income credit",
    line13,
    "30% of federal earned income credit",
    { "Federal EIC": d(input.federalEarnedIncomeCredit) }
  );

  // Line 14 — Home school expenses credit
  const line14 = getHomeSchoolExpensesCredit(
    d(input.homeSchoolExpenses),
    input.homeSchoolQualifyingStudents,
    constants
  );
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "14",
    "Home school expenses credit",
    line14,
    constants.homeSchoolExpensesCreditUsesPerStudentCap
      ? "min(expenses paid, $250 × qualifying students)"
      : "min(expenses paid, $250 per return)",
    {
      "Educational expenses": d(input.homeSchoolExpenses),
      "Qualifying students": (input.homeSchoolQualifyingStudents ?? 0).toString(),
    }
  );

  // Line 15 — Scholarship donation credit
  const line15 = getScholarshipDonationCredit(
    input.filingStatus,
    d(input.scholarshipDonations),
    constants
  );
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "15",
    "Scholarship donation credit",
    line15,
    "Eligible scholarship donations capped at $750 single / $1,500 MFJ",
    {
      "Filing status": input.filingStatus,
      "Eligible donations": d(input.scholarshipDonations),
    }
  );

  // Line 16 — Nonchartered, nonpublic school tuition credit
  const line16 = getNoncharteredSchoolTuitionCredit(
    federalAgiVal,
    d(input.noncharteredSchoolTuition),
    constants
  );
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "16",
    "Nonchartered, nonpublic school tuition credit",
    line16,
    "Qualifying tuition capped at $1,000 below $50,000 federal AGI or $1,500 otherwise",
    {
      "Federal AGI": federalAgiVal,
      "Qualifying tuition": d(input.noncharteredSchoolTuition),
    }
  );

  // Lines 17-35 — Explicit pass-through certificate and carryforward credits
  const line17 = d(input.workBasedLearningExperienceCredit);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "17",
    "Credit for work-based learning experiences",
    line17,
    "Pass-through input"
  );

  const line18 = d(input.ohioAdoptionCreditCarryforward);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "18",
    "Ohio adoption credit carryforward",
    line18,
    "Pass-through input"
  );

  const line19 = d(input.nonrefundableJobRetentionCredit);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "19",
    "Nonrefundable job retention credit",
    line19,
    "Pass-through input"
  );

  const line20 = d(input.newEmployeesEnterpriseZoneCredit);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "20",
    "Credit for new employees in an enterprise zone",
    line20,
    "Pass-through input"
  );

  const line21 = d(input.beginningFarmersFinancialManagementCredit);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "21",
    "Credit for the beginning farmers financial management program",
    line21,
    "Pass-through input"
  );

  const line22 = d(input.commercialVehicleOperatorTrainingCredit);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "22",
    "Credit for commercial vehicle operator training expenses",
    line22,
    "Pass-through input"
  );

  const line23 = d(input.welcomeHomeOhioCredit);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "23",
    "Welcome Home Ohio credit",
    line23,
    "Pass-through input"
  );

  const line24 = d(input.transformationalMixedUseDevelopmentCredit);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "24",
    "Credit for transformational mixed-use development",
    line24,
    "Pass-through input"
  );

  const line25 = d(input.saleRentalAgriculturalAssetsBeginningFarmersCredit);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "25",
    "Credit for sale/rental of agricultural assets to beginning farmers",
    line25,
    "Pass-through input"
  );

  const line26 = getGrapeProductionCredit(
    input.grapeProductionCredit,
    input.grapeProductionQualifyingPropertyCost,
    constants
  );
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "26",
    "Grape production credit",
    line26,
    input.grapeProductionCredit !== undefined
      ? "Pass-through input"
      : d(input.grapeProductionQualifyingPropertyCost).greaterThan(0)
        ? "10% of qualifying grape-production property cost, rounded to the nearest dollar"
        : "Default $0",
    {
      "Explicit line 26 input": d(input.grapeProductionCredit),
      "Qualifying property cost": d(input.grapeProductionQualifyingPropertyCost),
    }
  );

  const line27 = d(input.investOhioCredit);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "27",
    "InvestOhio credit",
    line27,
    "Pass-through input"
  );

  const line28 = d(input.leadAbatementCredit);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "28",
    "Lead abatement credit",
    line28,
    "Pass-through input"
  );

  const line29 = d(input.opportunityZoneInvestmentCredit);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "29",
    "Opportunity zone investment credit",
    line29,
    "Pass-through input"
  );

  const line30 = d(input.technologyInvestmentCreditCarryforward);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "30",
    "Technology investment credit carryforward",
    line30,
    "Pass-through input"
  );

  const line31 = d(input.enterpriseZoneDayCareAndTrainingCredit);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "31",
    "Enterprise zone day care and training credit",
    line31,
    "Pass-through input"
  );

  const line32 = d(input.researchAndDevelopmentCredit);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "32",
    "Research and development credit",
    line32,
    "Pass-through input"
  );

  const line33 = d(input.nonrefundableHistoricPreservationCredit);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "33",
    "Nonrefundable Ohio historic preservation credit",
    line33,
    "Pass-through input"
  );

  const line34 = d(input.ohioLowIncomeHousingCredit);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "34",
    "Ohio low-income housing credit",
    line34,
    "Pass-through input"
  );

  const line35 = d(input.affordableSingleFamilyHousingCredit);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "35",
    "Affordable single-family housing credit",
    line35,
    "Pass-through input"
  );

  const otherSecondBatch = d(input.otherSecondBatchCredits);

  // Line 36 — Total second-batch credits (lines 12-35)
  const line36 = sum(
    line12,
    line13,
    line14,
    line15,
    line16,
    line17,
    line18,
    line19,
    line20,
    line21,
    line22,
    line23,
    line24,
    line25,
    line26,
    line27,
    line28,
    line29,
    line30,
    line31,
    line32,
    line33,
    line34,
    line35,
    otherSecondBatch
  );
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "36",
    "Total second-batch credits",
    line36,
    "Sum of lines 12-35",
    {
      "Line 12": line12,
      "Line 13": line13,
      "Line 14": line14,
      "Line 15": line15,
      "Line 16": line16,
      "Line 17": line17,
      "Line 18": line18,
      "Line 19": line19,
      "Line 20": line20,
      "Line 21": line21,
      "Line 22": line22,
      "Line 23": line23,
      "Line 24": line24,
      "Line 25": line25,
      "Line 26": line26,
      "Line 27": line27,
      "Line 28": line28,
      "Line 29": line29,
      "Line 30": line30,
      "Line 31": line31,
      "Line 32": line32,
      "Line 33": line33,
      "Line 34": line34,
      "Line 35": line35,
      "Legacy other (17-35)": otherSecondBatch,
    }
  );

  // Line 37 — Tax less all credits (before resident/nonresident)
  const line37 = zeroFloor(line11.minus(line36));
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "37",
    "Tax less all nonrefundable credits",
    line37,
    "max(0, Line 11 - Line 36)",
    { "Line 11": line11, "Line 36": line36 }
  );

  // Lines 38-39 — Nonresident/resident credits (capped by remaining tax in statutory order)
  const rawLine38 = d(input.nonresidentCredit);
  const line38 = min(rawLine38, line37);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "38",
    "Nonresident credit",
    line38,
    "min(input nonresident credit, Line 37)",
    {
      "Input nonresident credit": rawLine38,
      "Line 37": line37,
    }
  );

  const residentCreditAvailableTax = zeroFloor(line37.minus(line38));
  const rawLine39 = d(input.residentCredit);
  const line39 = min(rawLine39, residentCreditAvailableTax);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "39",
    "Resident credit",
    line39,
    "min(input resident credit, max(0, Line 37 - Line 38))",
    {
      "Input resident credit": rawLine39,
      "Line 37": line37,
      "Line 38": line38,
    }
  );

  // Line 40 — Total nonrefundable credits
  // Cannot exceed line 1 (cannot create negative tax)
  const rawLine40 = sum(line10, line36, line38, line39);
  const line40 = min(rawLine40, line1);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "40",
    "Total nonrefundable credits",
    line40,
    "min(Line 1, Line 10 + Line 36 + Line 38 + Line 39)",
    {
      "Line 10": line10,
      "Line 36": line36,
      "Line 38 (nonresident)": line38,
      "Line 39 (resident)": line39,
      "Line 1 (cap)": line1,
    }
  );

  // Lines 41-46 — Refundable credits (pass-through)
  const line41 = d(input.refundableHistoricPreservationCredit);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "41",
    "Refundable Ohio historic preservation credit",
    line41,
    "Pass-through input"
  );

  const line42 = d(input.refundableJobCreationCredit);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "42",
    "Refundable job creation and job retention credit",
    line42,
    "Pass-through input"
  );

  const line43 = d(input.passThroughEntityCredit);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "43",
    "Pass-through entity credit",
    line43,
    "Pass-through input"
  );

  const line44 = d(input.refundableMotionPictureCredit);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "44",
    "Motion picture and Broadway theatrical production credit",
    line44,
    "Pass-through input"
  );

  const line45 = d(input.filmTheaterCapitalImprovementCredit);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "45",
    "Credit for film and theater capital improvement projects",
    line45,
    "Pass-through input"
  );

  const line46 = d(input.ventureCapitalCredit);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "46",
    "Venture capital credit",
    line46,
    "Pass-through input"
  );

  const line47 = sum(line41, line42, line43, line44, line45, line46);
  audit.record(
    "OH-SCHEDULE-CREDITS",
    "47",
    "Total refundable credits",
    line47,
    "Sum of lines 41-46",
    {
      "Line 41": line41,
      "Line 42": line42,
      "Line 43": line43,
      "Line 44": line44,
      "Line 45": line45,
      "Line 46": line46,
    }
  );

  return {
    line1_taxBeforeCredits: line1,
    line2_retirementIncomeCredit: line2,
    line3_lumpSumRetirementCredit: line3,
    lumpSumRetirementWorksheet,
    line4_seniorCitizenCredit: line4,
    line5_lumpSumDistributionCredit: line5,
    line6_childDependentCareCredit: line6,
    line7_displacedWorkerCredit: line7,
    line8_campaignContributionCredit: line8,
    line9_exemptionCredit: line9,
    line10_totalFirstBatch: line10,
    line11_taxLessFirstBatch: line11,
    line12_jointFilingCredit: line12,
    line13_earnedIncomeCredit: line13,
    line14_homeSchoolExpensesCredit: line14,
    line15_scholarshipDonationCredit: line15,
    line16_noncharteredSchoolTuitionCredit: line16,
    line17_workBasedLearningExperienceCredit: line17,
    line18_ohioAdoptionCreditCarryforward: line18,
    line19_nonrefundableJobRetentionCredit: line19,
    line20_newEmployeesEnterpriseZoneCredit: line20,
    line21_beginningFarmersFinancialManagementCredit: line21,
    line22_commercialVehicleOperatorTrainingCredit: line22,
    line23_welcomeHomeOhioCredit: line23,
    line24_transformationalMixedUseDevelopmentCredit: line24,
    line25_saleRentalAgriculturalAssetsBeginningFarmersCredit: line25,
    line26_grapeProductionCredit: line26,
    line27_investOhioCredit: line27,
    line28_leadAbatementCredit: line28,
    line29_opportunityZoneInvestmentCredit: line29,
    line30_technologyInvestmentCreditCarryforward: line30,
    line31_enterpriseZoneDayCareAndTrainingCredit: line31,
    line32_researchAndDevelopmentCredit: line32,
    line33_nonrefundableHistoricPreservationCredit: line33,
    line34_ohioLowIncomeHousingCredit: line34,
    line35_affordableSingleFamilyHousingCredit: line35,
    line36_totalSecondBatch: line36,
    line37_taxLessAllCredits: line37,
    line38_nonresidentCredit: line38,
    line39_residentCredit: line39,
    line40_totalNonrefundableCredits: line40,
    line41_refundableHistoricPreservationCredit: line41,
    line42_refundableJobCreationCredit: line42,
    line43_passThroughEntityCredit: line43,
    line44_refundableMotionPictureCredit: line44,
    line45_filmTheaterCapitalImprovementCredit: line45,
    line46_ventureCapitalCredit: line46,
    line47_totalRefundableCredits: line47,
    lines: audit.getLines(),
  };
}
