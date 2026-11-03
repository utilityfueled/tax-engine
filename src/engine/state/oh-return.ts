import type { OhioSchoolDistrictSourceProjection } from './oh-sd-100-sources.js';
/**
 * Ohio Resident Return — Full orchestrator.
 *
 * Wires together the Schedule of Adjustments, IT 1040, Schedule of Credits,
 * IT/SD 2210 (underpayment penalty), and optionally the SD 100 (School
 * District Income Tax) into a single entry point.
 *
 * Flow:
 *  1. Schedule of Adjustments → additions, deductions, taxable business income
 *  2. IT 1040 (first pass, zero credits) → tax before credits + MAGI
 *  3. Schedule of Credits → nonrefundable credits
 *  3b. IT/SD 2210 (if auto-compute) → underpayment penalty
 *  4. IT 1040 (final pass, with credits + penalty) → complete return
 *  5. SD 100 (if districts provided) → school district income tax
 */

import Decimal from "decimal.js";
import { readOhioReciprocalWageSource, type OhioReciprocalWageContext } from "./oh-reciprocal-wage-source.js";
import { calculateOhioDatedPaymentInterest } from "./oh-payment-dated-source.js";
import type { OhioPaymentSourceProjection } from "./oh-payment-source.js";
import type { OhioDatedPartIIResult } from "./oh-it-sd-2210-dated.js";
import type { OhioCanonicalBusinessContext } from "./oh-business-source.js";
import type {OhioResidencyFacts} from "@/models/ohio-residency.js";
import {calculateOhioITNRC} from "./oh-it-nrc.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, roundDollar, zeroFloor } from "@/utils/decimal.js";
import {
  type OhioCollegeGrantRoomAndBoardEntry,
  type OhioEducatorExpense,
  type OhioHomebuyerPlusAccountEntry,
  type OhioPregnancyResourceCenterContribution,
  type OhioQualifiedOrganDonorExpense,
  calculateOhioScheduleOfAdjustments,
  type Ohio529Contribution,
  type Ohio529Carryforward,
  type OhioStableContribution,
  type OhioStableCarryforward,
  type OhioScheduleOfAdjustmentsResult,
} from "@/engine/state/oh-schedule-adjustments.js";
import {
  calculateOhioIT1040,
  type OhioIT1040Result,
} from "@/engine/state/oh-it-1040.js";
import {
  calculateOhioScheduleOfCredits,
  type OhioDisplacedWorkerCreditRecipientInput,
  type OhioScheduleOfCreditsResult,
} from "@/engine/state/oh-schedule-credits.js";
import type { OhioLumpSumRetirementCreditRecipientInput } from "@/engine/state/oh-lump-sum-retirement-credit.js";
import {
  calculateOhioSD100,
  type OhioSD100Result,
  type SchoolDistrictEntry,
} from "@/engine/state/oh-sd-100.js";
import {
  calculateOhioResidentCredit,
  type OhioResidentCreditResult,
  type OtherStateTaxEntry,
} from "@/engine/state/oh-resident-credit.js";
import {
  calculateOhioITSD2210,
  type EstimatedPaymentEntry,
  type OhioITSD2210Result,
} from "@/engine/state/oh-it-sd-2210.js";

// ---------------------------------------------------------------------------
// Input type — unified entry point for a full Ohio resident return
// ---------------------------------------------------------------------------

export interface OhioResidentReturnInput {
  schoolDistrictSource?:OhioSchoolDistrictSourceProjection;
  sdEstimatedPaymentSchedule?:EstimatedPaymentEntry[];
  residency?:OhioResidencyFacts;
  residencyBusinessSource?:OhioCanonicalBusinessContext;
  residencyReciprocalWageSource?:OhioReciprocalWageContext;
  residencySourceDigest?:string;
  paymentSourceDigest?:string;
  paymentDatedSource?:OhioPaymentSourceProjection;
  paymentMethodVersion?:string;
  paymentTaxCoverage?:{status:'no_remaining_tax'|'expected_payment'|'actual_payment';date?:string;amountAppliedToTax?:Decimal|string|number};
  paymentTiming?:{kind:'filed'|'expected';valuationDate:string;asOfDate:string};
  taxYear: number;
  filingStatus: FilingStatus;
  federalAgi: Decimal | string | number;

  // --- Personal information ---

  /** Number of personal + dependent exemptions (taxpayer, spouse, dependents). */
  exemptions: number;

  // --- Schedule of Adjustments: Additions ---

  nonOhioStateLocalInterest?: Decimal | string | number;
  employeeBenefitPlanDistributions?: Decimal | string | number;
  lumpSumCreditsFromPriorYear?: Decimal | string | number;
  depreciationAddBack?: Decimal | string | number;
  pteAddBack?: Decimal | string | number;
  medicalSavingsAccountTaxpayerContributions?: Decimal | string | number;
  medicalSavingsAccountSpouseContributions?: Decimal | string | number;
  medicalSavingsAccountEarnings?: Decimal | string | number;
  medicalSavingsAccountNonmedicalWithdrawals?: Decimal | string | number;
  otherAdditions?: Decimal | string | number;

  // --- Schedule of Adjustments: Deductions ---

  qualifyingBusinessIncome?: Decimal | string | number;
  federalInterestExemptFromOhio?: Decimal | string | number;
  taxableSocialSecurity?: Decimal | string | number;
  stateMunicipalTaxRefunds?: Decimal | string | number;
  militaryPayOutsideOhio?: Decimal | string | number;
  uniformedServicesRetirement?: Decimal | string | number;
  disabilitySurvivorshipBenefits?: Decimal | string | number;
  stableContributions?: OhioStableContribution[];
  stableCarryforwards?: OhioStableCarryforward[];
  ohio529Contributions?: Ohio529Contribution[];
  ohio529Carryforwards?: Ohio529Carryforward[];
  homebuyerPlusAccounts?: OhioHomebuyerPlusAccountEntry[];
  pregnancyResourceCenterContributions?: OhioPregnancyResourceCenterContribution[];
  collegeGrantRoomAndBoardEntries?: OhioCollegeGrantRoomAndBoardEntry[];
  ohioEducatorExpenses?: OhioEducatorExpense[];
  ruralPracticeIncentiveRepayments?: Decimal | string | number;
  adoptedStudentGrantPayments?: Decimal | string | number;
  qualifiedOrganDonorExpenses?: OhioQualifiedOrganDonorExpense[];
  medicalInsurancePremiumsBeforeMedicareOrEmployerEligibility?:
    | Decimal
    | string
    | number;
  medicalLongTermCareInsurancePremiums?: Decimal | string | number;
  medicalInsurancePremiumsDuringMedicareOrEmployerEligibility?:
    | Decimal
    | string
    | number;
  medicalCareExpenses?: Decimal | string | number;
  otherDeductions?: Decimal | string | number;

  // --- Schedule of Credits inputs ---

  retirementIncome?: Decimal | string | number;
  isSenior?: boolean;
  federal2441Line9c?: Decimal | string | number;
  federal2441Line11?: Decimal | string | number;
  displacedWorkerExpenses?: Decimal | string | number;
  priorYearDisplacedWorkerCredit?: Decimal | string | number;
  displacedWorkerRecipients?: OhioDisplacedWorkerCreditRecipientInput[];
  campaignContributions?: Decimal | string | number;
  federalEarnedIncomeCredit?: Decimal | string | number;
  homeSchoolExpenses?: Decimal | string | number;
  homeSchoolQualifyingStudents?: number;
  scholarshipDonations?: Decimal | string | number;
  noncharteredSchoolTuition?: Decimal | string | number;
  primaryQualifyingIncome?: Decimal | string | number;
  spouseQualifyingIncome?: Decimal | string | number;
  bothSpousesHaveQualifyingIncome?: boolean;
  lumpSumRetirementRecipients?: OhioLumpSumRetirementCreditRecipientInput[];
  lumpSumRetirementCredit?: Decimal | string | number;
  lumpSumDistributionCredit?: Decimal | string | number;
  lumpSumDistributionRecipientAges?: number[];
  workBasedLearningExperienceCredit?: Decimal | string | number;
  ohioAdoptionCreditCarryforward?: Decimal | string | number;
  nonrefundableJobRetentionCredit?: Decimal | string | number;
  newEmployeesEnterpriseZoneCredit?: Decimal | string | number;
  beginningFarmersFinancialManagementCredit?: Decimal | string | number;
  commercialVehicleOperatorTrainingCredit?: Decimal | string | number;
  welcomeHomeOhioCredit?: Decimal | string | number;
  transformationalMixedUseDevelopmentCredit?: Decimal | string | number;
  saleRentalAgriculturalAssetsBeginningFarmersCredit?:
    | Decimal
    | string
    | number;
  grapeProductionCredit?: Decimal | string | number;
  grapeProductionQualifyingPropertyCost?: Decimal | string | number;
  investOhioCredit?: Decimal | string | number;
  leadAbatementCredit?: Decimal | string | number;
  opportunityZoneInvestmentCredit?: Decimal | string | number;
  technologyInvestmentCreditCarryforward?: Decimal | string | number;
  enterpriseZoneDayCareAndTrainingCredit?: Decimal | string | number;
  researchAndDevelopmentCredit?: Decimal | string | number;
  nonrefundableHistoricPreservationCredit?: Decimal | string | number;
  ohioLowIncomeHousingCredit?: Decimal | string | number;
  affordableSingleFamilyHousingCredit?: Decimal | string | number;
  otherSecondBatchCredits?: Decimal | string | number;
  nonresidentCredit?: Decimal | string | number;
  /** Pass-through resident credit (overrides computed value if provided). */
  residentCredit?: Decimal | string | number;
  refundableHistoricPreservationCredit?: Decimal | string | number;
  refundableJobCreationCredit?: Decimal | string | number;
  passThroughEntityCredit?: Decimal | string | number;
  refundableMotionPictureCredit?: Decimal | string | number;
  filmTheaterCapitalImprovementCredit?: Decimal | string | number;
  ventureCapitalCredit?: Decimal | string | number;

  // --- Resident Credit: Taxes paid to other states ---

  /** Other states where income was also taxed. If provided, the resident credit is computed
   *  automatically and flows to Schedule of Credits line 39 (unless residentCredit is also set,
   *  in which case the pass-through value takes precedence). */
  otherStateTaxes?: OtherStateTaxEntry[];

  // --- IT 1040: Payments and final lines ---

  /** IT 1040 line 11: Pass-through underpayment penalty. Ignored if computeUnderpaymentPenalty is true. */
  underpaymentPenalty?: Decimal | string | number;
  useTax?: Decimal | string | number;
  ohioWithholding?: Decimal | string | number;
  estimatedPayments?: Decimal | string | number;
  refundableCredits?: Decimal | string | number;
  amendedPriorOverpayment?: Decimal | string | number;
  latePaymentInterest?: Decimal | string | number;
  creditCarryforward?: Decimal | string | number;
  donations?: Decimal | string | number;

  // --- IT/SD 2210: Underpayment penalty auto-computation ---

  /** If true, compute IT/SD 2210 underpayment penalty automatically. Default false. */
  computeUnderpaymentPenalty?: boolean;
  /** Prior year Ohio tax liability (IT 1040 line 10 from prior year). For safe harbor B. */
  priorYearTaxLiability?: Decimal | string | number;
  /** Whether the prior year return was timely filed. Default true if priorYearTaxLiability > 0. */
  priorYearTimelyFiled?: boolean;
  /** Individual estimated payments with dates for quarterly allocation. */
  estimatedPaymentSchedule?: EstimatedPaymentEntry[];

  // --- SD 100: School District Income Tax (optional) ---

  /** School districts the taxpayer resided in during the tax year. If omitted, no SD 100 is computed. */
  schoolDistricts?: SchoolDistrictEntry[];
  /** SD 100 Line 9: Underpayment penalty for school district tax. Default 0. */
  sdUnderpaymentPenalty?: Decimal | string | number;
  /** Prior year SD 100 line 8 liability. For school district safe harbor B. */
  sdPriorYearTaxLiability?: Decimal | string | number;
  /** Whether the prior year SD 100 was timely filed. */
  sdPriorYearTimelyFiled?: boolean;
  /** SD 100 Line 11: School district income tax withheld (W-2 box 19). Default 0. */
  sdWithholding?: Decimal | string | number;
  /** SD 100 Line 12: SD estimated/extension payments + prior year carryforward. Default 0. */
  sdEstimatedPayments?: Decimal | string | number;
  /** SD 100 Line 14: Amended return prior SD overpayment. Default 0. */
  sdAmendedPriorOverpayment?: Decimal | string | number;
  /** SD 100 Line 17: Interest due on late SD payment. Default 0. */
  sdLatePaymentInterest?: Decimal | string | number;
  /** SD 100 Line 20: Elected SD credit carryforward to next year. Default 0. */
  sdCreditCarryforward?: Decimal | string | number;
}

// ---------------------------------------------------------------------------
// Result type — all three sub-results plus combined audit trail
// ---------------------------------------------------------------------------

export interface OhioResidentReturnResult {
  schoolDistrictSource?:OhioSchoolDistrictSourceProjection;
  nonresidentCreditResult:ReturnType<typeof calculateOhioITNRC>|null;
  scheduleOfAdjustments: OhioScheduleOfAdjustmentsResult;
  it1040: OhioIT1040Result;
  scheduleOfCredits: OhioScheduleOfCreditsResult;
  /** Resident credit result, or null if no other-state taxes were provided. */
  residentCredit: OhioResidentCreditResult | null;
  /** IT/SD 2210 result, or null if underpayment penalty was not auto-computed. */
  itsd2210: OhioITSD2210Result | null;
  itsd2210Dated: OhioDatedPartIIResult | null;
  /** SD 100 IT/SD 2210 result, or null if school district underpayment penalty was not auto-computed. */
  sdItsd2210: OhioITSD2210Result | null;
  /** SD 100 result, or null if no school districts were provided. */
  sd100: OhioSD100Result | null;
  lines: CalculatedLine[];
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function calculateOhioResidentReturn(
  input: OhioResidentReturnInput,
): OhioResidentReturnResult {
  // Step 1: Schedule of Adjustments
  if (input.residency?.reciprocalWageSources && !input.residencyReciprocalWageSource) {
    throw new Error('Ohio actual reciprocal wages require their current unforgeable original context');
  }
  const reciprocal = input.residencyReciprocalWageSource && input.residency
    ? readOhioReciprocalWageSource(input.residencyReciprocalWageSource, input.residency, input.federalAgi, input) : undefined;
  if (input.residencyReciprocalWageSource && !reciprocal) throw new Error('Ohio actual reciprocal wage owner originals required');
  const adjustments = calculateOhioScheduleOfAdjustments({
    reciprocityWages: reciprocal?.deduction,
    taxYear: input.taxYear,
    filingStatus: input.filingStatus,
    federalAgi: input.federalAgi,
    nonOhioStateLocalInterest: input.nonOhioStateLocalInterest,
    employeeBenefitPlanDistributions: input.employeeBenefitPlanDistributions,
    lumpSumCreditsFromPriorYear: input.lumpSumCreditsFromPriorYear,
    depreciationAddBack: input.depreciationAddBack,
    pteAddBack: input.pteAddBack,
    medicalSavingsAccountTaxpayerContributions: input.medicalSavingsAccountTaxpayerContributions,
    medicalSavingsAccountSpouseContributions: input.medicalSavingsAccountSpouseContributions,
    medicalSavingsAccountEarnings: input.medicalSavingsAccountEarnings,
    medicalSavingsAccountNonmedicalWithdrawals: input.medicalSavingsAccountNonmedicalWithdrawals,
    otherAdditions: input.otherAdditions,
    qualifyingBusinessIncome: input.qualifyingBusinessIncome,
    federalInterestExemptFromOhio: input.federalInterestExemptFromOhio,
    taxableSocialSecurity: input.taxableSocialSecurity,
    stateMunicipalTaxRefunds: input.stateMunicipalTaxRefunds,
    militaryPayOutsideOhio: input.militaryPayOutsideOhio,
    uniformedServicesRetirement: input.uniformedServicesRetirement,
    disabilitySurvivorshipBenefits: input.disabilitySurvivorshipBenefits,
    stableContributions: input.stableContributions,
    stableCarryforwards: input.stableCarryforwards,
    ohio529Contributions: input.ohio529Contributions,
    ohio529Carryforwards: input.ohio529Carryforwards,
    homebuyerPlusAccounts: input.homebuyerPlusAccounts,
    pregnancyResourceCenterContributions: input.pregnancyResourceCenterContributions,
    collegeGrantRoomAndBoardEntries: input.collegeGrantRoomAndBoardEntries,
    ohioEducatorExpenses: input.ohioEducatorExpenses,
    ruralPracticeIncentiveRepayments: input.ruralPracticeIncentiveRepayments,
    adoptedStudentGrantPayments: input.adoptedStudentGrantPayments,
    qualifiedOrganDonorExpenses: input.qualifiedOrganDonorExpenses,
    medicalInsurancePremiumsBeforeMedicareOrEmployerEligibility:
      input.medicalInsurancePremiumsBeforeMedicareOrEmployerEligibility,
    medicalLongTermCareInsurancePremiums:
      input.medicalLongTermCareInsurancePremiums,
    medicalInsurancePremiumsDuringMedicareOrEmployerEligibility:
      input.medicalInsurancePremiumsDuringMedicareOrEmployerEligibility,
    medicalCareExpenses: input.medicalCareExpenses,
    otherDeductions: input.otherDeductions,
  });

  if (reciprocal && (!adjustments.line14_totalAdditions.isZero() || !adjustments.line47_totalDeductions.eq(reciprocal.deduction)
    || !d(input.ohioWithholding).eq(reciprocal.withholding) || !d(input.estimatedPayments).isZero()
    || !input.paymentSourceDigest || !input.residencySourceDigest || !input.paymentTiming
    || input.residentCredit !== undefined || input.nonresidentCredit !== undefined || (input.otherStateTaxes?.length??0))) {
    throw new Error('Ohio actual reciprocal wage return projections contradict current source context');
  }

  // Step 2: IT 1040 first pass — compute tax before credits to feed the Schedule of Credits
  const firstPass = calculateOhioIT1040({
    taxYear: input.taxYear,
    filingStatus: input.filingStatus,
    federalAgi: input.federalAgi,
    additions: adjustments.line14_totalAdditions,
    deductions: adjustments.line47_totalDeductions,
    exemptions: input.exemptions,
    businessIncomeDeduction: adjustments.line15_businessIncomeDeduction,
    taxableBusinessIncome: adjustments.taxableBusinessIncome,
    // Zero credits in first pass — we need line 8c to compute them
  });

  const magiLessExemptions = firstPass.magi.minus(firstPass.line4_exemptions);

  // Step 3a: Preview Schedule of Credits through line 38 so resident credit uses the tax remaining after earlier credits
  const creditsPreview = calculateOhioScheduleOfCredits({
    taxYear: input.taxYear,
    filingStatus: input.filingStatus,
    federalAgi: input.federalAgi,
    taxBeforeCredits: firstPass.line8c_totalTax,
    magi: firstPass.magi,
    magiLessExemptions,
    exemptions: input.exemptions,
    retirementIncome: input.retirementIncome,
    isSenior: input.isSenior,
    federal2441Line9c: input.federal2441Line9c,
    federal2441Line11: input.federal2441Line11,
    displacedWorkerExpenses: input.displacedWorkerExpenses,
    priorYearDisplacedWorkerCredit: input.priorYearDisplacedWorkerCredit,
    displacedWorkerRecipients: input.displacedWorkerRecipients,
    campaignContributions: input.campaignContributions,
    federalEarnedIncomeCredit: input.federalEarnedIncomeCredit,
    homeSchoolExpenses: input.homeSchoolExpenses,
    homeSchoolQualifyingStudents: input.homeSchoolQualifyingStudents,
    scholarshipDonations: input.scholarshipDonations,
    noncharteredSchoolTuition: input.noncharteredSchoolTuition,
    primaryQualifyingIncome: input.primaryQualifyingIncome,
    spouseQualifyingIncome: input.spouseQualifyingIncome,
    bothSpousesHaveQualifyingIncome: input.bothSpousesHaveQualifyingIncome,
    lumpSumRetirementRecipients: input.lumpSumRetirementRecipients,
    lumpSumRetirementCredit: input.lumpSumRetirementCredit,
    lumpSumDistributionCredit: input.lumpSumDistributionCredit,
    lumpSumDistributionRecipientAges: input.lumpSumDistributionRecipientAges,
    workBasedLearningExperienceCredit: input.workBasedLearningExperienceCredit,
    ohioAdoptionCreditCarryforward: input.ohioAdoptionCreditCarryforward,
    nonrefundableJobRetentionCredit: input.nonrefundableJobRetentionCredit,
    newEmployeesEnterpriseZoneCredit: input.newEmployeesEnterpriseZoneCredit,
    beginningFarmersFinancialManagementCredit:
      input.beginningFarmersFinancialManagementCredit,
    commercialVehicleOperatorTrainingCredit:
      input.commercialVehicleOperatorTrainingCredit,
    welcomeHomeOhioCredit: input.welcomeHomeOhioCredit,
    transformationalMixedUseDevelopmentCredit:
      input.transformationalMixedUseDevelopmentCredit,
    saleRentalAgriculturalAssetsBeginningFarmersCredit:
      input.saleRentalAgriculturalAssetsBeginningFarmersCredit,
    grapeProductionCredit: input.grapeProductionCredit,
    grapeProductionQualifyingPropertyCost: input.grapeProductionQualifyingPropertyCost,
    investOhioCredit: input.investOhioCredit,
    leadAbatementCredit: input.leadAbatementCredit,
    opportunityZoneInvestmentCredit: input.opportunityZoneInvestmentCredit,
    technologyInvestmentCreditCarryforward:
      input.technologyInvestmentCreditCarryforward,
    enterpriseZoneDayCareAndTrainingCredit:
      input.enterpriseZoneDayCareAndTrainingCredit,
    researchAndDevelopmentCredit: input.researchAndDevelopmentCredit,
    nonrefundableHistoricPreservationCredit:
      input.nonrefundableHistoricPreservationCredit,
    ohioLowIncomeHousingCredit: input.ohioLowIncomeHousingCredit,
    affordableSingleFamilyHousingCredit:
      input.affordableSingleFamilyHousingCredit,
    otherSecondBatchCredits: input.otherSecondBatchCredits,
    nonresidentCredit: input.residency ? new Decimal(0) : input.nonresidentCredit,
    residentCredit: new Decimal(0),
    refundableHistoricPreservationCredit: input.refundableHistoricPreservationCredit,
    refundableJobCreationCredit: input.refundableJobCreationCredit,
    passThroughEntityCredit: input.passThroughEntityCredit,
    refundableMotionPictureCredit: input.refundableMotionPictureCredit,
    filmTheaterCapitalImprovementCredit: input.filmTheaterCapitalImprovementCredit,
    ventureCapitalCredit: input.ventureCapitalCredit,
  });

  const nonresidentCreditResult=input.residency?calculateOhioITNRC({taxYear:input.taxYear,filingStatus:input.filingStatus,federalAgi:input.federalAgi,ohioAgi:firstPass.line3_ohioAgi,taxRemainingBeforeResidencyCredits:creditsPreview.line37_taxLessAllCredits,residencyFacts:reciprocal?.nrcFacts??input.residency,businessSource:input.residencyBusinessSource}):null;
  const nonresidentCreditAmount=nonresidentCreditResult?.line20??input.nonresidentCredit;
  // Step 3b: Compute resident credit (if other-state taxes provided and no pass-through override)
  let residentCreditResult: OhioResidentCreditResult | null = null;
  let residentCreditAmount = input.residentCredit;

  if (
    !input.residentCredit &&
    input.otherStateTaxes &&
    input.otherStateTaxes.length > 0
  ) {
    residentCreditResult = calculateOhioResidentCredit({
      ohioAgi: firstPass.line3_ohioAgi,
      ohioTaxBeforeCredits: zeroFloor(
        creditsPreview.line37_taxLessAllCredits.minus(d(nonresidentCreditAmount))
      ),
      otherStates: input.otherStateTaxes,
    });
    residentCreditAmount = residentCreditResult.totalResidentCredit;
  }

  // Step 3c: Schedule of Credits
  const credits = calculateOhioScheduleOfCredits({
    taxYear: input.taxYear,
    filingStatus: input.filingStatus,
    federalAgi: input.federalAgi,
    taxBeforeCredits: firstPass.line8c_totalTax,
    magi: firstPass.magi,
    magiLessExemptions,
    exemptions: input.exemptions,
    retirementIncome: input.retirementIncome,
    isSenior: input.isSenior,
    federal2441Line9c: input.federal2441Line9c,
    federal2441Line11: input.federal2441Line11,
    displacedWorkerExpenses: input.displacedWorkerExpenses,
    priorYearDisplacedWorkerCredit: input.priorYearDisplacedWorkerCredit,
    displacedWorkerRecipients: input.displacedWorkerRecipients,
    campaignContributions: input.campaignContributions,
    federalEarnedIncomeCredit: input.federalEarnedIncomeCredit,
    homeSchoolExpenses: input.homeSchoolExpenses,
    homeSchoolQualifyingStudents: input.homeSchoolQualifyingStudents,
    scholarshipDonations: input.scholarshipDonations,
    noncharteredSchoolTuition: input.noncharteredSchoolTuition,
    primaryQualifyingIncome: input.primaryQualifyingIncome,
    spouseQualifyingIncome: input.spouseQualifyingIncome,
    bothSpousesHaveQualifyingIncome: input.bothSpousesHaveQualifyingIncome,
    lumpSumRetirementRecipients: input.lumpSumRetirementRecipients,
    lumpSumRetirementCredit: input.lumpSumRetirementCredit,
    lumpSumDistributionCredit: input.lumpSumDistributionCredit,
    lumpSumDistributionRecipientAges: input.lumpSumDistributionRecipientAges,
    workBasedLearningExperienceCredit: input.workBasedLearningExperienceCredit,
    ohioAdoptionCreditCarryforward: input.ohioAdoptionCreditCarryforward,
    nonrefundableJobRetentionCredit: input.nonrefundableJobRetentionCredit,
    newEmployeesEnterpriseZoneCredit: input.newEmployeesEnterpriseZoneCredit,
    beginningFarmersFinancialManagementCredit:
      input.beginningFarmersFinancialManagementCredit,
    commercialVehicleOperatorTrainingCredit:
      input.commercialVehicleOperatorTrainingCredit,
    welcomeHomeOhioCredit: input.welcomeHomeOhioCredit,
    transformationalMixedUseDevelopmentCredit:
      input.transformationalMixedUseDevelopmentCredit,
    saleRentalAgriculturalAssetsBeginningFarmersCredit:
      input.saleRentalAgriculturalAssetsBeginningFarmersCredit,
    grapeProductionCredit: input.grapeProductionCredit,
    grapeProductionQualifyingPropertyCost: input.grapeProductionQualifyingPropertyCost,
    investOhioCredit: input.investOhioCredit,
    leadAbatementCredit: input.leadAbatementCredit,
    opportunityZoneInvestmentCredit: input.opportunityZoneInvestmentCredit,
    technologyInvestmentCreditCarryforward:
      input.technologyInvestmentCreditCarryforward,
    enterpriseZoneDayCareAndTrainingCredit:
      input.enterpriseZoneDayCareAndTrainingCredit,
    researchAndDevelopmentCredit: input.researchAndDevelopmentCredit,
    nonrefundableHistoricPreservationCredit:
      input.nonrefundableHistoricPreservationCredit,
    ohioLowIncomeHousingCredit: input.ohioLowIncomeHousingCredit,
    affordableSingleFamilyHousingCredit:
      input.affordableSingleFamilyHousingCredit,
    otherSecondBatchCredits: input.otherSecondBatchCredits,
    nonresidentCredit: nonresidentCreditAmount,
    residentCredit: residentCreditAmount,
    refundableHistoricPreservationCredit: input.refundableHistoricPreservationCredit,
    refundableJobCreationCredit: input.refundableJobCreationCredit,
    passThroughEntityCredit: input.passThroughEntityCredit,
    refundableMotionPictureCredit: input.refundableMotionPictureCredit,
    filmTheaterCapitalImprovementCredit: input.filmTheaterCapitalImprovementCredit,
    ventureCapitalCredit: input.ventureCapitalCredit,
  });

  // Step 3d: IT/SD 2210 — Compute underpayment penalty if requested
  let itsd2210: OhioITSD2210Result | null = null;
  let itsd2210Dated: OhioDatedPartIIResult | null = null;
  let underpaymentPenalty = input.underpaymentPenalty;

  if (input.computeUnderpaymentPenalty && underpaymentPenalty === undefined) {
    // Preview line 10 (tax after nonrefundable credits) without running a full IT 1040 pass
    const line10Preview = zeroFloor(
      firstPass.line8c_totalTax.minus(credits.line40_totalNonrefundableCredits)
    );

    if(input.paymentSourceDigest && !input.paymentDatedSource){
      const liability=roundDollar(line10Preview.minus(input.refundableCredits??credits.line47_totalRefundableCredits));
      const withheld=roundDollar(d(input.ohioWithholding));
      const schedule=input.estimatedPaymentSchedule??[];
      const endpoints=[['2025-04-15','0.25'],['2025-06-16','0.50'],['2025-09-15','0.75'],['2026-01-15','1.00']] as const;
      const estimatesThrough=(date:string)=>roundDollar(schedule.filter(row=>row.date<=date).reduce((sum,row)=>sum.plus(row.amount),new Decimal(0)));
      const annualPaid=withheld.plus(estimatesThrough('2026-01-15'));
      const covered=(required:Decimal)=>endpoints.every(([date,percentage])=>roundDollar(withheld.times(percentage)).plus(estimatesThrough(date)).gte(roundDollar(required.times(percentage))));
      const currentRequired=roundDollar(liability.times('0.90'));
      const priorRequired=roundDollar(d(input.priorYearTaxLiability));
      if((annualPaid.gte(currentRequired)&&!covered(currentRequired))||(input.priorYearTimelyFiled&&annualPaid.gte(priorRequired)&&!covered(priorRequired))){
        throw new Error('Ohio actual payment sources: actual timely installment coverage requires its separate dated payment method');
      }
    }

    if (input.paymentDatedSource) {
      const dated = calculateOhioDatedPaymentInterest(input.paymentDatedSource,
        line10Preview.minus(input.refundableCredits ?? credits.line47_totalRefundableCredits), d(input.ohioWithholding));
      itsd2210 = dated.worksheet;
      itsd2210Dated = dated.partII;
    } else {
    itsd2210 = calculateOhioITSD2210({
      taxYear: input.taxYear,
      currentYearTaxLiability: line10Preview.minus(input.refundableCredits ?? credits.line47_totalRefundableCredits),
      ohioWithholding: d(input.ohioWithholding),
      estimatedPayments: d(input.estimatedPayments),
      priorYearTaxLiability: input.priorYearTaxLiability,
      priorYearTimelyFiled: input.priorYearTimelyFiled,
      estimatedPaymentSchedule: input.estimatedPaymentSchedule,
    });
    }

    underpaymentPenalty = itsd2210.line17_totalPenalty;
  }

  // Step 4: IT 1040 final pass — with real nonrefundable credits + penalty
  const it1040 = calculateOhioIT1040({
    taxYear: input.taxYear,
    filingStatus: input.filingStatus,
    federalAgi: input.federalAgi,
    additions: adjustments.line14_totalAdditions,
    deductions: adjustments.line47_totalDeductions,
    exemptions: input.exemptions,
    businessIncomeDeduction: adjustments.line15_businessIncomeDeduction,
    taxableBusinessIncome: adjustments.taxableBusinessIncome,
    nonrefundableCredits: credits.line40_totalNonrefundableCredits,
    underpaymentPenalty,
    useTax: input.useTax,
    ohioWithholding: input.ohioWithholding,
    estimatedPayments: input.estimatedPayments,
    refundableCredits:
      input.refundableCredits ?? credits.line47_totalRefundableCredits,
    amendedPriorOverpayment: input.amendedPriorOverpayment,
    latePaymentInterest: input.latePaymentInterest,
    creditCarryforward: input.creditCarryforward,
    donations: input.donations,
  });

  if(input.paymentSourceDigest){
    const coverage=input.paymentTaxCoverage;
    const remaining=it1040.line10_taxAfterCredits.minus(it1040.line16_refundableCredits).minus(it1040.line14_ohioWithholding).minus(it1040.line15_estimatedPayments);
    if(!coverage||(coverage.status==='no_remaining_tax'?remaining.gt(0):d(coverage.amountAppliedToTax).lt(Decimal.max(remaining,0))))throw new Error('Ohio actual payment sources: remaining-tax payment source does not cover actual remaining tax');
  }
  if(input.paymentSourceDigest&&d(input.creditCarryforward).plus(d(input.donations)).gt(it1040.line23_overpayment)){
    throw new Error('Ohio actual payment sources: refund elections exceed actual overpayment');
  }

  // Step 5: SD 100 — School District Income Tax (if districts provided)
  let sdItsd2210: OhioITSD2210Result | null = null;
  let sd100: OhioSD100Result | null = null;
  if (input.schoolDistricts && input.schoolDistricts.length > 0) {
    let sdUnderpaymentPenalty = input.sdUnderpaymentPenalty;

    if (input.computeUnderpaymentPenalty && sdUnderpaymentPenalty === undefined) {
      const sdPreview = calculateOhioSD100({
        taxYear: input.taxYear,
        ohioAgi: it1040.line3_ohioAgi,
        businessIncomeDeduction: adjustments.line15_businessIncomeDeduction,
        exemptionAmount: it1040.line4_exemptions,
        isSenior: input.isSenior,
        districts: input.schoolDistricts,
        sdWithholding: input.sdWithholding,
        estimatedPayments: input.sdEstimatedPayments,
        amendedPriorOverpayment: input.sdAmendedPriorOverpayment,
        latePaymentInterest: input.sdLatePaymentInterest,
        creditCarryforward: input.sdCreditCarryforward,
      });

      sdItsd2210 = calculateOhioITSD2210({
        taxYear: input.taxYear,
        formType: "sd100",
        currentYearTaxLiability: sdPreview.line8_totalTaxAfterCredits,
        ohioWithholding: d(input.sdWithholding),
        estimatedPayments: d(input.sdEstimatedPayments),
        priorYearTaxLiability: input.sdPriorYearTaxLiability,
        priorYearTimelyFiled: input.sdPriorYearTimelyFiled,
        estimatedPaymentSchedule: input.sdEstimatedPaymentSchedule,
      });

      sdUnderpaymentPenalty = sdItsd2210.line17_totalPenalty;
    }

    sd100 = calculateOhioSD100({
      taxYear: input.taxYear,
      ohioAgi: it1040.line3_ohioAgi,
      businessIncomeDeduction: adjustments.line15_businessIncomeDeduction,
      exemptionAmount: it1040.line4_exemptions,
      isSenior: input.isSenior,
      districts: input.schoolDistricts,
      underpaymentPenalty: sdUnderpaymentPenalty,
      sdWithholding: input.sdWithholding,
      estimatedPayments: input.sdEstimatedPayments,
      amendedPriorOverpayment: input.sdAmendedPriorOverpayment,
      latePaymentInterest: input.sdLatePaymentInterest,
      creditCarryforward: input.sdCreditCarryforward,
    });
  }

  if(input.schoolDistrictSource){
    if(!itsd2210?.line17_totalPenalty.isZero()||!sdItsd2210?.line17_totalPenalty.isZero())throw new Error('Ohio actual school district sources: separate positive/combined2210 penalty method required');
    if(!sd100||!sd100.line16_taxDue.isZero()||d(input.sdCreditCarryforward).gt(sd100.line19_overpayment))throw new Error('Ohio actual school district sources: remaining-tax coverage or outgoing election contradicts actual return');
  }
  // Combine audit trails: Adjustments → Resident Credit → Credits → IT/SD 2210 → IT 1040 → SD 100
  const lines = [
    ...adjustments.lines,
    ...(residentCreditResult ? residentCreditResult.lines : []),
    ...(nonresidentCreditResult?.lines??[]),
    ...(input.residencySourceDigest?[{form:"OH-IT-NRC",line:"actual-source-commitment",description:"Actual Ohio owner residency original sources",value:new Decimal(0),formula:"Complete source commitment; no private source references printed",inputs:{"Original source commitment":input.residencySourceDigest}}]:[]),
    ...(input.paymentSourceDigest?[{form:'OH-IT/SD-2210',line:'actual-payment-source-commitment',description:'Actual Ohio current account payment sources',value:new Decimal(0),formula:'Current actual private originals; digest only',inputs:{'Original source commitment':input.paymentSourceDigest,'State method version':input.paymentMethodVersion??'','Tax year':String(input.taxYear),'Timing kind':input.paymentTiming?.kind??'','Return filed/expected date':input.paymentTiming?.valuationDate??'','As of date':input.paymentTiming?.asOfDate??'','Remaining-tax payment kind':input.paymentTaxCoverage?.status??'','Remaining-tax payment date':input.paymentTaxCoverage?.date??''}}]:[]),
    ...credits.lines,
    ...(itsd2210 ? itsd2210.lines : []),
    ...it1040.lines,
    ...(sdItsd2210 ? sdItsd2210.lines : []),
    ...(sd100 ? sd100.lines : []),
    ...(input.schoolDistrictSource?.residentIncome.lines??[]),
    ...(input.schoolDistrictSource?.lines??[]),
  ];

  return {
    ...(input.schoolDistrictSource?{schoolDistrictSource:input.schoolDistrictSource}:{}),
    scheduleOfAdjustments: adjustments,
    it1040,
    scheduleOfCredits: credits,
    residentCredit: residentCreditResult,
    nonresidentCreditResult,
    itsd2210,
    itsd2210Dated,
    sdItsd2210,
    sd100,
    lines,
  };
}
