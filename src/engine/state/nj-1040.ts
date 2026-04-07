/**
 * New Jersey NJ-1040 resident income tax return orchestrator.
 * Spec: spec/state/nj-1040.yaml
 *
 * Assembles all NJ-1040 sub-modules into a complete return flow:
 * gross income → exemptions → deductions → taxable income → tax →
 * credits → payments → balance due / refund.
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { calculateNJ1040GrossIncome } from "@/engine/state/nj-1040-gross-income.js";
import { calculateNJ1040Exemptions } from "@/engine/state/nj-1040-exemptions.js";
import { calculateNJ1040CollegeAffordabilityDeduction } from "@/engine/state/nj-1040-college-affordability.js";
import { calculateNJ1040PropertyTax } from "@/engine/state/nj-1040-property-tax.js";
import { calculateNJ1040MedicalExpenses } from "@/engine/state/nj-1040-medical-expenses.js";
import { calculateNJ1040OrganDonationDeduction } from "@/engine/state/nj-1040-organ-donation-deduction.js";
import { calculateNJ1040TaxRate } from "@/engine/state/nj-1040-tax-rate.js";
import { calculateNJ1040EITC } from "@/engine/state/nj-1040-eitc.js";
import { calculateNJ1040ChildTaxCredit } from "@/engine/state/nj-1040-child-tax-credit.js";
import { calculateNJ1040DependentCareCredit } from "@/engine/state/nj-1040-dependent-care-credit.js";
import { calculateNJ1040WoundedWarriorCredit } from "@/engine/state/nj-1040-wounded-warrior-credit.js";
import { calculateNJ1040PTBAITCredit } from "@/engine/state/nj-1040-ptbait-credit.js";
import {
  calculateNJ1040OverpaymentAllocation,
  type NJ1040OtherDesignatedContributionInput,
} from "@/engine/state/nj-1040-overpayment-allocation.js";
import {
  calculateNJ1040OtherJurisdictionCredit,
  type OtherJurisdictionEntry,
} from "@/engine/state/nj-1040-other-jurisdiction-credit.js";
import { calculateNJ1040HealthCoverage } from "@/engine/state/nj-1040-health-coverage.js";
import { calculateNJ1040UseTax } from "@/engine/state/nj-1040-use-tax.js";
import { calculateNJ1040ExcessPayroll } from "@/engine/state/nj-1040-excess-payroll.js";
import { calculateNJ2210 } from "@/engine/state/nj-2210.js";
import {
  calculateNJ1040SupplementalCredits,
  type NJ1040OrganDonorLeaveEventInput,
} from "@/engine/state/nj-1040-supplemental-credits.js";
import {
  determineNJFilingRequirement,
  type NJFilingRequirementResult,
} from "@/engine/state/nj-1040-filing-requirement.js";
import { assertSupportedNJTaxYear } from "@/engine/state/nj-tax-year.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum, zeroFloor } from "@/utils/decimal.js";

export interface NJ1040Input {
  filingStatus: FilingStatus;
  taxYear: number;
  /** Number of months the taxpayer was a NJ resident (15+ days = full month) */
  monthsOfResidency: number;

  // --- Income (Lines 14-24) ---
  wages?: Decimal | string | number;
  taxableInterest?: Decimal | string | number;
  /** Line 16b: Tax-exempt interest used for Schedule NJ-HCC household income */
  taxExemptInterest?: Decimal | string | number;
  /** Line 15b: Tax-exempt interest from other states (NJ-taxable, federally exempt) */
  otherStateTaxExemptInterest?: Decimal | string | number;
  dividends?: Decimal | string | number;
  businessIncome?: Decimal | string | number;
  netGainsFromProperty?: Decimal | string | number;
  pensionIncome?: Decimal | string | number;
  partnershipIncome?: Decimal | string | number;
  sCorpIncome?: Decimal | string | number;
  rentalIncome?: Decimal | string | number;
  gamblingWinnings?: Decimal | string | number;
  gamblingLosses?: Decimal | string | number;
  alimonyReceived?: Decimal | string | number;
  otherIncome?: Decimal | string | number;

  // --- Adjustments ---
  /** Line 32: Alimony and separate maintenance payments paid (pre-2019 agreements) */
  alimonyPaid?: Decimal | string | number;
  qualifiesForPensionExclusion?: boolean;
  pensionIncomeEligibleForExclusion?: Decimal | string | number;
  qualifiesForOtherRetirementExclusion?: boolean;
  qualifiesForSpecialRetirementExclusion?: boolean;
  otherRetirementIncomeExclusionCap?: Decimal | string | number;
  otherAdjustments?: Decimal | string | number;

  // --- Exemptions ---
  taxpayerAge65OrOlder?: boolean;
  spouseAge65OrOlder?: boolean;
  taxpayerBlindOrDisabled?: boolean;
  spouseBlindOrDisabled?: boolean;
  isVeteran?: boolean;
  spouseIsVeteran?: boolean;
  dependentCount?: number;
  collegeDependentCount?: number;

  // --- College affordability deductions (Lines 37a-37c) ---
  njbestContributions?: Decimal | string | number;
  njclassLoanPayments?: Decimal | string | number;
  tuitionPaidToNjInstitution?: Decimal | string | number;
  qualifiedConservationContribution?: Decimal | string | number;
  healthEnterpriseZoneDeduction?: Decimal | string | number;
  alternativeBusinessCalculationAdjustment?: Decimal | string | number;

  // --- Property tax ---
  isHomeowner?: boolean;
  isTenant?: boolean;
  propertyTaxesPaid?: Decimal | string | number;
  rentPaid?: Decimal | string | number;
  electPropertyTaxCredit?: boolean;
  sharedMainHomeWithSpouse?: boolean;
  /** Homeowner with a 100% disabled-veteran property tax exemption — ineligible for deduction and credit */
  hasDisabledVeteranPropertyTaxExemption?: boolean;
  /** Homeowner who made PILOT (Payment In Lieu Of Taxes) payments — ineligible for deduction and credit */
  madePilotPayments?: boolean;
  /** Tenant who rented a tax-exempt property — ineligible for deduction and credit */
  rentedTaxExemptProperty?: boolean;

  // --- Medical expenses ---
  totalMedicalExpenses?: Decimal | string | number;
  insuranceReimbursements?: Decimal | string | number;
  archerMSADeduction?: Decimal | string | number;
  selfEmployedHealthInsuranceDeduction?: Decimal | string | number;
  organDonationDeductionExpenses?: Decimal | string | number;

  // --- Credits ---
  federalEITC?: Decimal | string | number;
  qualifiesForChildlessAge18Exception?: boolean;
  qualifyingEICChildrenCount?: number;
  hasAdult18OrOlderTaxpayer?: boolean;
  federalDependentCareCredit?: Decimal | string | number;
  qualifyingChildrenAge5OrUnder?: number;
  providedCareToQualifyingServiceMember?: boolean;
  serviceMemberFederalDisabilityCompensation?: Decimal | string | number;
  onlyCaregiver?: boolean;
  careExpensesSharePercent?: Decimal | string | number;
  shelteredWorkshopCurrentYearCredit?: Decimal | string | number;
  goldStarCounselingHours?: Decimal | string | number;
  goldStarTricareRate?: Decimal | string | number;
  organDonorLeaveEvents?: NJ1040OrganDonorLeaveEventInput[];
  passThroughBusinessAlternativeIncomeTaxCredit?: Decimal | string | number;

  // --- Other jurisdiction credit (Schedule A) ---
  otherJurisdictions?: OtherJurisdictionEntry[];

  // --- Health Insurance Mandate (Schedule NJ-HCC) ---
  /** Number of adults (18+) in household without coverage */
  healthCoverageAdults?: number;
  /** Number of children (under 18) in household without coverage */
  healthCoverageChildren?: number;
  /** Number of months household lacked minimum essential coverage (0-12) */
  healthCoverageUncoveredMonths?: number;
  /** Dependents' total income and tax-exempt interest for Schedule NJ-HCC Worksheet L */
  healthCoverageDependentIncome?: Decimal | string | number;

  // --- Use Tax (Line 38b) ---
  /** Whether to use the safe harbor lookup table for use tax */
  useSafeHarbor?: boolean;
  /** Actual use tax amount (if not using safe harbor) */
  actualUseTax?: Decimal | string | number;

  // --- Excess Payroll Contributions ---
  /** Total UI/WF/SWF withheld across all W-2s */
  totalUIWFSWFWithheld?: Decimal | string | number;
  /** Total DI withheld across all W-2s */
  totalDIWithheld?: Decimal | string | number;
  /** Total FLI withheld across all W-2s */
  totalFLIWithheld?: Decimal | string | number;
  /** Override max DI for private plan participants */
  privatePlanMaxDI?: Decimal | string | number;

  // --- Payments ---
  njWithholding?: Decimal | string | number;
  /** NJ-1040 line 57 total: estimates + extension payment + prior-year credit carryforward */
  estimatedPayments?: Decimal | string | number;
  creditOverpaymentToNextYear?: Decimal | string | number;
  endangeredWildlifeFundContribution?: Decimal | string | number;
  childrensTrustFundContribution?: Decimal | string | number;
  vietnamVeteransMemorialFundContribution?: Decimal | string | number;
  breastCancerResearchFundContribution?: Decimal | string | number;
  ussNewJerseyEducationalMuseumFundContribution?: Decimal | string | number;
  otherDesignatedContributions?: NJ1040OtherDesignatedContributionInput[];

  // --- Underpayment Penalty (NJ-2210) ---
  /** Prior year NJ tax after credits (for safe harbor exception) */
  priorYearTax?: Decimal | string | number;
  /** Whether a prior year NJ return was filed for a full 12-month period */
  priorYearReturnFiled?: boolean;
}

export interface NJ1040Result {
  filingStatus: FilingStatus;
  taxYear: number;

  // Gross income
  njGrossIncome: Decimal;

  // Exemptions
  totalExemptions: Decimal;

  // Deductions
  collegeAffordabilityDeduction: Decimal;
  propertyTaxDeduction: Decimal;
  medicalDeduction: Decimal;
  qualifiedConservationContribution: Decimal;
  healthEnterpriseZoneDeduction: Decimal;
  alternativeBusinessCalculationAdjustment: Decimal;
  organDonationDeduction: Decimal;

  // Taxable income and tax
  njTaxableIncome: Decimal;
  njTax: Decimal;
  useTax: Decimal;
  sharedResponsibilityPayment: Decimal;
  /** NJ page-2 tax after nonrefundable credits and before NJ-2210 interest */
  totalTax: Decimal;
  /** NJ-1040 line 52 */
  line52UnderpaymentInterest: Decimal;
  /** NJ-1040 line 54 */
  line54TotalTaxDue: Decimal;

  // Credits
  otherJurisdictionCredit: Decimal;
  shelteredWorkshopTaxCredit: Decimal;
  goldStarFamilyCounselingCredit: Decimal;
  organDonorEmployerCredit: Decimal;
  supplementalNonrefundableCredits: Decimal;
  propertyTaxCredit: Decimal;
  taxAfterNonrefundableCredits: Decimal;
  njEITC: Decimal;
  njChildTaxCredit: Decimal;
  njDependentCareCredit: Decimal;
  woundedWarriorCredit: Decimal;
  totalRefundableCredits: Decimal;
  passThroughBusinessAlternativeIncomeTaxCredit: Decimal;

  // Payments
  excessUIWFSWFCredit: Decimal;
  excessDICredit: Decimal;
  excessFLICredit: Decimal;
  excessPayrollCredit: Decimal;
  totalPayments: Decimal;
  line67AmountOwed: Decimal;
  line68Overpayment: Decimal;
  creditToNextYear: Decimal;
  totalCharitableContributions: Decimal;
  line78TotalAdjustments: Decimal;

  // Penalty
  underpaymentPenalty: Decimal;

  // Balance
  balanceDue: Decimal;
  refund: Decimal;

  // Filing requirement
  filingRequirement: NJFilingRequirementResult;

  // Audit trail
  lines: CalculatedLine[];
}

function calculateNJ1040WithResolvedPropertyTaxElection(
  input: NJ1040Input,
  resolvedElectPropertyTaxCredit: boolean
): NJ1040Result {
  assertSupportedNJTaxYear(input.taxYear, "NJ-1040 resident return");

  const audit = new AuditTrail();

  // === Step 1: Compute NJ Gross Income (Lines 14-29) ===
  const grossIncomeResult = calculateNJ1040GrossIncome({
    filingStatus: input.filingStatus,
    taxYear: input.taxYear,
    wages: input.wages,
    taxableInterest: input.taxableInterest,
    otherStateTaxExemptInterest: input.otherStateTaxExemptInterest,
    dividends: input.dividends,
    businessIncome: input.businessIncome,
    netGainsFromProperty: input.netGainsFromProperty,
    pensionIncome: input.pensionIncome,
    partnershipIncome: input.partnershipIncome,
    sCorpIncome: input.sCorpIncome,
    rentalIncome: input.rentalIncome,
    gamblingWinnings: input.gamblingWinnings,
    gamblingLosses: input.gamblingLosses,
    alimonyReceived: input.alimonyReceived,
    otherIncome: input.otherIncome,
    qualifiesForPensionExclusion: input.qualifiesForPensionExclusion,
    pensionIncomeEligibleForExclusion: input.pensionIncomeEligibleForExclusion,
    qualifiesForOtherRetirementExclusion: input.qualifiesForOtherRetirementExclusion,
    qualifiesForSpecialRetirementExclusion: input.qualifiesForSpecialRetirementExclusion,
    otherRetirementIncomeExclusionCap: input.otherRetirementIncomeExclusionCap,
    otherAdjustments: input.otherAdjustments,
  });
  const njGrossIncome = grossIncomeResult.njGrossIncome;
  audit.merge(grossIncomeResult.lines);

  // === Step 2: Compute Personal Exemptions (Lines 30-37) ===
  const exemptionsResult = calculateNJ1040Exemptions({
    filingStatus: input.filingStatus,
    taxYear: input.taxYear,
    taxpayerAge65OrOlder: input.taxpayerAge65OrOlder,
    spouseAge65OrOlder: input.spouseAge65OrOlder,
    taxpayerBlindOrDisabled: input.taxpayerBlindOrDisabled,
    spouseBlindOrDisabled: input.spouseBlindOrDisabled,
    isVeteran: input.isVeteran,
    spouseIsVeteran: input.spouseIsVeteran,
    dependentCount: input.dependentCount,
    collegeDependentCount: input.collegeDependentCount,
  });
  const totalExemptions = exemptionsResult.totalExemptions;
  audit.merge(exemptionsResult.lines);

  // === Step 3: Compute College Affordability Deductions ===
  const collegeAffordabilityResult = calculateNJ1040CollegeAffordabilityDeduction({
    taxYear: input.taxYear,
    njGrossIncome,
    monthsOfResidency: input.monthsOfResidency,
    njbestContributions: input.njbestContributions,
    njclassLoanPayments: input.njclassLoanPayments,
    tuitionPaidToNjInstitution: input.tuitionPaidToNjInstitution,
  });
  const collegeAffordabilityDeduction = collegeAffordabilityResult.totalDeduction;
  audit.merge(collegeAffordabilityResult.lines);

  // === Step 4: Compute Property Tax Benefit ===
  const propertyTaxResult = calculateNJ1040PropertyTax({
    taxYear: input.taxYear,
    filingStatus: input.filingStatus,
    isHomeowner: input.isHomeowner,
    isTenant: input.isTenant,
    propertyTaxesPaid: input.propertyTaxesPaid,
    rentPaid: input.rentPaid,
    njGrossIncome: njGrossIncome,
    taxpayerAge65OrOlder: input.taxpayerAge65OrOlder,
    spouseAge65OrOlder: input.spouseAge65OrOlder,
    taxpayerBlindOrDisabled: input.taxpayerBlindOrDisabled,
    spouseBlindOrDisabled: input.spouseBlindOrDisabled,
    electCredit: resolvedElectPropertyTaxCredit,
    monthsOfResidency: input.monthsOfResidency,
    sharedMainHomeWithSpouse: input.sharedMainHomeWithSpouse,
    hasDisabledVeteranPropertyTaxExemption: input.hasDisabledVeteranPropertyTaxExemption,
    madePilotPayments: input.madePilotPayments,
    rentedTaxExemptProperty: input.rentedTaxExemptProperty,
  });
  const propertyTaxDeduction = propertyTaxResult.deductionAmount;
  audit.merge(propertyTaxResult.lines);

  // === Step 5: Compute Medical Expense Deduction ===
  const medicalResult = calculateNJ1040MedicalExpenses({
    taxYear: input.taxYear,
    njGrossIncome: njGrossIncome,
    totalMedicalExpenses: input.totalMedicalExpenses,
    insuranceReimbursements: input.insuranceReimbursements,
    archerMSADeduction: input.archerMSADeduction,
    selfEmployedHealthInsuranceDeduction: input.selfEmployedHealthInsuranceDeduction,
  });
  const medicalDeduction = medicalResult.deduction;
  audit.merge(medicalResult.lines);

  const alimonyDeduction = zeroFloor(d(input.alimonyPaid));
  audit.record(
    "NJ-1040",
    "32",
    "Alimony and separate maintenance payments paid",
    alimonyDeduction,
    alimonyDeduction.greaterThan(0)
      ? "Supported direct-input NJ-1040 line 32 deduction amount"
      : "0 when no deductible line-32 alimony amount is supplied"
  );

  const qualifiedConservationContribution = zeroFloor(
    d(input.qualifiedConservationContribution)
  );
  audit.record(
    "NJ-1040",
    "33",
    "Qualified conservation contribution",
    qualifiedConservationContribution,
    qualifiedConservationContribution.greaterThan(0)
      ? "Supported direct-input NJ-1040 line 33 deduction amount"
      : "0 when no supported qualified conservation contribution is supplied"
  );

  const healthEnterpriseZoneDeduction = zeroFloor(
    d(input.healthEnterpriseZoneDeduction)
  );
  audit.record(
    "NJ-1040",
    "34",
    "Health enterprise zone deduction",
    healthEnterpriseZoneDeduction,
    healthEnterpriseZoneDeduction.greaterThan(0)
      ? "Supported direct-input NJ-1040 line 34 deduction amount"
      : "0 when no supported HEZ deduction is supplied"
  );

  const alternativeBusinessCalculationAdjustment = zeroFloor(
    d(input.alternativeBusinessCalculationAdjustment)
  );
  audit.record(
    "NJ-1040",
    "35",
    "Alternative business calculation adjustment",
    alternativeBusinessCalculationAdjustment,
    alternativeBusinessCalculationAdjustment.greaterThan(0)
      ? "Supported direct-input Schedule NJ-BUS-2 line 11 amount"
      : "0 when no supported line-35 adjustment is supplied"
  );

  const organDonationDeductionResult = calculateNJ1040OrganDonationDeduction({
    organDonationDeductionExpenses: input.organDonationDeductionExpenses,
  });
  const organDonationDeduction = organDonationDeductionResult.deduction;
  audit.merge(organDonationDeductionResult.lines);

  const totalExemptionsAndDeductionsBeforePropertyTax = zeroFloor(
    totalExemptions
      .plus(medicalDeduction)
      .plus(alimonyDeduction)
      .plus(qualifiedConservationContribution)
      .plus(healthEnterpriseZoneDeduction)
      .plus(alternativeBusinessCalculationAdjustment)
      .plus(organDonationDeduction)
      .plus(collegeAffordabilityDeduction)
  );

  audit.record(
    "NJ-1040",
    "38",
    "Total exemptions and deductions",
    totalExemptionsAndDeductionsBeforePropertyTax,
    "Add lines 30 through 37c",
    {
      "Line 30 (Exemption Amount)": totalExemptions,
      "Line 31 (Medical Expenses)": medicalDeduction,
      "Line 32 (Alimony Paid)": alimonyDeduction,
      "Line 33 (Qualified Conservation Contribution)":
        qualifiedConservationContribution,
      "Line 34 (Health Enterprise Zone Deduction)":
        healthEnterpriseZoneDeduction,
      "Line 35 (Alternative Business Calculation Adjustment)":
        alternativeBusinessCalculationAdjustment,
      "Line 36 (Organ/Bone Marrow Donation Deduction)": organDonationDeduction,
      "Lines 37a-37c (College Affordability Deductions)":
        collegeAffordabilityDeduction,
    }
  );

  // === Step 6: Compute line 39 taxable income before the property tax deduction ===
  const taxableIncomeBeforePropertyTaxDeduction = zeroFloor(
    njGrossIncome.minus(totalExemptionsAndDeductionsBeforePropertyTax)
  );

  audit.record(
    "NJ-1040",
    "39",
    "Taxable income before the property tax deduction",
    taxableIncomeBeforePropertyTaxDeduction,
    "max(0, Line 29 - Line 38)",
    {
      "Line 29 (NJ Gross Income)": njGrossIncome,
      "Line 38 (Total Exemptions and Deductions)":
        totalExemptionsAndDeductionsBeforePropertyTax,
    }
  );

  const njTaxableIncome = zeroFloor(
    taxableIncomeBeforePropertyTaxDeduction.minus(propertyTaxDeduction)
  );

  audit.record(
    "NJ-1040",
    "42",
    "New Jersey taxable income",
    njTaxableIncome,
    "max(0, Line 39 - Line 41 property tax deduction)",
    {
      "Line 39": taxableIncomeBeforePropertyTaxDeduction,
      "Line 41 (Property Tax Deduction)": propertyTaxDeduction,
    }
  );

  // === Step 7: Compute NJ Income Tax (Line 43) ===
  const taxRateResult = calculateNJ1040TaxRate({
    taxableIncome: njTaxableIncome,
    filingStatus: input.filingStatus,
    taxYear: input.taxYear,
  });
  const njTax = taxRateResult.tax;
  audit.merge(taxRateResult.lines);

  // === Step 6b: Use Tax (Line 38b) ===
  const useTaxResult = calculateNJ1040UseTax({
    taxYear: input.taxYear,
    njGrossIncome,
    useSafeHarbor: input.useSafeHarbor,
    actualUseTax: input.actualUseTax,
  });
  const useTax = useTaxResult.useTax;
  audit.merge(useTaxResult.lines);

  // === Step 6c: Health Insurance Mandate (Schedule NJ-HCC) ===
  const uncoveredMonths = input.healthCoverageUncoveredMonths ?? 0;
  let sharedResponsibilityPayment = new Decimal(0);
  let healthCoverageExemptAllUncoveredMonths = false;
  if (uncoveredMonths > 0) {
    const hcResult = calculateNJ1040HealthCoverage({
      taxYear: input.taxYear,
      filingStatus: input.filingStatus,
      totalIncome: grossIncomeResult.totalNJIncome,
      taxExemptInterest: input.taxExemptInterest,
      dependentIncome: input.healthCoverageDependentIncome,
      adults: input.healthCoverageAdults ?? 0,
      children: input.healthCoverageChildren ?? 0,
      uncoveredMonths,
    });
    sharedResponsibilityPayment = hcResult.sharedResponsibilityPayment;
    healthCoverageExemptAllUncoveredMonths =
      hcResult.effectiveUncoveredMonths === 0;
    audit.merge(hcResult.lines);
  }

  // === Step 7: Apply Nonrefundable Credits (against income tax only) ===
  // Per the NJ-1040 form, nonrefundable credits (Lines 44-49) reduce only
  // the income tax (Line 43). Use tax and SRP are added after credits.

  // Line 44: Credit for taxes paid to other jurisdictions (Schedule NJ-COJ)
  let otherJurisdictionCredit = new Decimal(0);
  if (input.otherJurisdictions && input.otherJurisdictions.length > 0) {
    const ojcResult = calculateNJ1040OtherJurisdictionCredit({
      taxYear: input.taxYear,
      njGrossIncome,
      njTax,
      jurisdictions: input.otherJurisdictions,
    });
    otherJurisdictionCredit = ojcResult.totalCredit;
    audit.merge(ojcResult.lines);
  }

  audit.record(
    "NJ-1040",
    "44",
    "Credit for income taxes paid to other jurisdictions",
    otherJurisdictionCredit,
    "Schedule NJ-COJ total credit, capped at line 43 tax",
    {
      "Line 43 tax": njTax,
    }
  );

  // Line 45: Balance of tax after OJC credit
  const incomeTaxAfterOJC = zeroFloor(njTax.minus(otherJurisdictionCredit));

  audit.record(
    "NJ-1040",
    "45",
    "Balance of tax",
    incomeTaxAfterOJC,
    "max(0, Line 43 income tax - Line 44 credit)",
    {
      "Line 43 income tax": njTax,
      "Line 44 credit": otherJurisdictionCredit,
    }
  );

  const supplementalCreditsResult = calculateNJ1040SupplementalCredits({
    taxYear: input.taxYear,
    monthsOfResidency: input.monthsOfResidency,
    shelteredWorkshopCurrentYearCredit:
      input.shelteredWorkshopCurrentYearCredit,
    goldStarCounselingHours: input.goldStarCounselingHours,
    goldStarTricareRate: input.goldStarTricareRate,
    organDonorLeaveEvents: input.organDonorLeaveEvents,
  });
  audit.merge(supplementalCreditsResult.lines);

  const shelteredWorkshopTaxCredit =
    supplementalCreditsResult.line46ShelteredWorkshopCredit;
  const goldStarFamilyCounselingCredit =
    supplementalCreditsResult.line47GoldStarFamilyCounselingCredit;
  const organDonorEmployerCredit =
    supplementalCreditsResult.line48OrganDonorEmployerCredit;
  const supplementalNonrefundableCredits =
    supplementalCreditsResult.line49TotalCredits;

  const incomeTaxAfterSupplementalCredits = zeroFloor(
    incomeTaxAfterOJC.minus(supplementalNonrefundableCredits)
  );

  audit.record(
    "NJ-1040",
    "50",
    "Balance of tax after supplemental nonrefundable credits",
    incomeTaxAfterSupplementalCredits,
    "max(0, Line 45 - Line 49)",
    {
      "Line 45 balance of tax": incomeTaxAfterOJC,
      "Line 49 supplemental nonrefundable credits": supplementalNonrefundableCredits,
    }
  );

  // Property tax credit is refundable and paid in the credits/payments section (line 56)
  const propertyTaxCredit = propertyTaxResult.creditAmount;

  audit.record(
    "NJ-1040",
    "property-tax-credit",
    "Property tax credit (refundable, line 56)",
    propertyTaxCredit,
    "Refundable property tax credit from the NJ-1040 payments section",
    {
      "Elected credit": propertyTaxResult.creditAmount,
    }
  );

  // Income tax after all nonrefundable credits
  const incomeTaxAfterCredits = incomeTaxAfterSupplementalCredits;

  // Tax after nonrefundable credits = income tax after credits + use tax + SRP
  const taxAfterNonrefundableCredits = sum(incomeTaxAfterCredits, useTax, sharedResponsibilityPayment);

  audit.record(
    "NJ-1040",
    "tax-after-nonrefundable",
    "Tax after all nonrefundable credits (income tax after credits + use tax + SRP)",
    taxAfterNonrefundableCredits,
    "Line 50 + Line 51 use tax + Line 53c shared responsibility payment",
    {
      "Income tax after credits": incomeTaxAfterCredits,
      "Use tax": useTax,
      "Shared responsibility payment": sharedResponsibilityPayment,
    }
  );

  const totalTax = taxAfterNonrefundableCredits;

  audit.record(
    "NJ-1040",
    "total-tax",
    "Engine totalTax result before NJ-2210 interest",
    totalTax,
    "Line 50 + Line 51 use tax + Line 53c shared responsibility payment",
    {
      "Line 50 balance of tax after credits": incomeTaxAfterCredits,
      "Line 51 use tax": useTax,
      "Line 53c shared responsibility payment": sharedResponsibilityPayment,
    }
  );

  // === Step 8: Compute Refundable Credits ===
  // NJ EITC
  const eitcResult = calculateNJ1040EITC({
    taxYear: input.taxYear,
    federalEITC: input.federalEITC ?? 0,
    monthsOfResidency: input.monthsOfResidency,
    qualifiesForChildlessAge18Exception:
      input.qualifiesForChildlessAge18Exception,
    qualifyingEICChildrenCount: input.qualifyingEICChildrenCount,
    hasAdult18OrOlderTaxpayer: input.hasAdult18OrOlderTaxpayer,
  });
  const njEITC = eitcResult.njEITC;
  audit.merge(eitcResult.lines);

  // NJ Child Tax Credit
  const qualifyingChildren = input.qualifyingChildrenAge5OrUnder ?? 0;
  let njChildTaxCredit = new Decimal(0);
  if (qualifyingChildren > 0) {
    const ctcResult = calculateNJ1040ChildTaxCredit({
      taxYear: input.taxYear,
      filingStatus: input.filingStatus,
      njTaxableIncome: njTaxableIncome,
      qualifyingChildrenAge5OrUnder: qualifyingChildren,
      monthsOfResidency: input.monthsOfResidency,
    });
    njChildTaxCredit = ctcResult.totalCredit;
    audit.merge(ctcResult.lines);
  }

  // NJ Child and Dependent Care Credit
  const federalDependentCareCredit = d(input.federalDependentCareCredit);
  let njDependentCareCredit = new Decimal(0);
  if (federalDependentCareCredit.greaterThan(0)) {
    const dccResult = calculateNJ1040DependentCareCredit({
      taxYear: input.taxYear,
      federalDependentCareCredit: federalDependentCareCredit,
      njTaxableIncome: njTaxableIncome,
      monthsOfResidency: input.monthsOfResidency,
    });
    njDependentCareCredit = dccResult.njCredit;
    audit.merge(dccResult.lines);
  }

  let woundedWarriorCredit = new Decimal(0);
  if (input.providedCareToQualifyingServiceMember) {
    const woundedWarriorResult = calculateNJ1040WoundedWarriorCredit({
      filingStatus: input.filingStatus,
      taxYear: input.taxYear,
      njGrossIncome,
      providedCareToQualifyingServiceMember:
        input.providedCareToQualifyingServiceMember,
      serviceMemberFederalDisabilityCompensation:
        input.serviceMemberFederalDisabilityCompensation,
      onlyCaregiver: input.onlyCaregiver,
      careExpensesSharePercent: input.careExpensesSharePercent,
    });
    woundedWarriorCredit = woundedWarriorResult.credit;
    audit.merge(woundedWarriorResult.lines);
  }

  const totalRefundableCredits = sum(
    njEITC,
    njChildTaxCredit,
    njDependentCareCredit,
    woundedWarriorCredit
  );

  audit.record(
    "NJ-1040",
    "total-refundable-credits",
    "Total refundable credits",
    totalRefundableCredits,
    "NJ EITC + NJ Child Tax Credit + NJ Dependent Care Credit + Wounded Warrior Caregivers Credit",
    {
      "NJ EITC": njEITC,
      "NJ Child Tax Credit": njChildTaxCredit,
      "NJ Dependent Care Credit": njDependentCareCredit,
      "Wounded Warrior Caregivers Credit": woundedWarriorCredit,
    }
  );

  // === Step 9: Compute Payments ===
  const njWithholding = d(input.njWithholding);
  const estimatedPayments = d(input.estimatedPayments);
  const ptbaitResult = calculateNJ1040PTBAITCredit({
    taxYear: input.taxYear,
    totalCredit: input.passThroughBusinessAlternativeIncomeTaxCredit,
  });
  const passThroughBusinessAlternativeIncomeTaxCredit = ptbaitResult.line63Credit;
  audit.merge(ptbaitResult.lines);

  // Excess payroll contributions credit (refundable)
  let excessUIWFSWFCredit = new Decimal(0);
  let excessDICredit = new Decimal(0);
  let excessFLICredit = new Decimal(0);
  let excessPayrollCredit = new Decimal(0);
  const hasPayrollInput =
    d(input.totalUIWFSWFWithheld).greaterThan(0) ||
    d(input.totalDIWithheld).greaterThan(0) ||
    d(input.totalFLIWithheld).greaterThan(0);

  if (hasPayrollInput) {
    const payrollResult = calculateNJ1040ExcessPayroll({
      taxYear: input.taxYear,
      totalUIWFSWFWithheld: input.totalUIWFSWFWithheld,
      totalDIWithheld: input.totalDIWithheld,
      totalFLIWithheld: input.totalFLIWithheld,
      privatePlanMaxDI: input.privatePlanMaxDI,
    });
    excessUIWFSWFCredit = payrollResult.excessUIWFSWF;
    excessDICredit = payrollResult.excessDI;
    excessFLICredit = payrollResult.excessFLI;
    excessPayrollCredit = payrollResult.totalExcessPayroll;
    audit.merge(payrollResult.lines);
  }

  const totalPayments = sum(
    njWithholding,
    propertyTaxCredit,
    estimatedPayments,
    totalRefundableCredits,
    excessPayrollCredit,
    passThroughBusinessAlternativeIncomeTaxCredit
  );

  audit.record(
    "NJ-1040",
    "66",
    "Total payments and refundable credits",
    totalPayments,
    "NJ withholding + property tax credit + estimated payments + refundable credits + excess payroll credit + PTBAIT credit",
    {
      "NJ withholding": njWithholding,
      "Property tax credit": propertyTaxCredit,
      "Estimated payments": estimatedPayments,
      "Total refundable credits": totalRefundableCredits,
      "Excess payroll credit": excessPayrollCredit,
      "PTBAIT credit": passThroughBusinessAlternativeIncomeTaxCredit,
    }
  );

  // === Step 10: Underpayment Penalty (NJ-2210) ===
  const penaltyResult = calculateNJ2210({
    taxYear: input.taxYear,
    currentYearTax: taxAfterNonrefundableCredits,
    totalWithholding: njWithholding,
    withholdingEquivalentCredits: sum(
      propertyTaxCredit,
      totalRefundableCredits,
      excessPayrollCredit,
      passThroughBusinessAlternativeIncomeTaxCredit
    ),
    estimatedPayments,
    priorYearTax: input.priorYearTax,
    priorYearReturnFiled: input.priorYearReturnFiled,
  });
  const underpaymentPenalty = penaltyResult.penalty;
  const line52UnderpaymentInterest = underpaymentPenalty;
  audit.merge(penaltyResult.lines);

  audit.record(
    "NJ-1040",
    "underpayment-penalty",
    "Underpayment of estimated tax penalty (NJ-2210)",
    underpaymentPenalty,
    "NJ-2210 short method penalty",
    {
      "Penalty applies": String(penaltyResult.penaltyApplies),
      "Underpayment amount": penaltyResult.underpaymentAmount,
    }
  );

  audit.record(
    "NJ-1040",
    "52",
    "Interest on underpayment of estimated tax",
    line52UnderpaymentInterest,
    "NJ-2210 short method penalty carried to NJ-1040 line 52",
    {
      "Tax after nonrefundable credits": taxAfterNonrefundableCredits,
      "NJ withholding": njWithholding,
      "Estimated payments": estimatedPayments,
    }
  );

  const line54TotalTaxDue = taxAfterNonrefundableCredits.plus(
    line52UnderpaymentInterest
  );

  audit.record(
    "NJ-1040",
    "54",
    "Total tax due",
    line54TotalTaxDue,
    "Line 50 + line 51 + line 52 + line 53c",
    {
      "Tax after nonrefundable credits": taxAfterNonrefundableCredits,
      "Line 52 underpayment interest": line52UnderpaymentInterest,
    }
  );

  // === Step 11: Overpayment Allocation / Final Balance Due or Refund ===
  const overpaymentAllocationResult = calculateNJ1040OverpaymentAllocation({
    taxYear: input.taxYear,
    totalTaxDue: line54TotalTaxDue,
    totalPayments,
    creditToNextYear: input.creditOverpaymentToNextYear,
    endangeredWildlifeFundContribution: input.endangeredWildlifeFundContribution,
    childrensTrustFundContribution: input.childrensTrustFundContribution,
    vietnamVeteransMemorialFundContribution:
      input.vietnamVeteransMemorialFundContribution,
    breastCancerResearchFundContribution:
      input.breastCancerResearchFundContribution,
    ussNewJerseyEducationalMuseumFundContribution:
      input.ussNewJerseyEducationalMuseumFundContribution,
    otherDesignatedContributions: input.otherDesignatedContributions,
  });
  audit.merge(overpaymentAllocationResult.lines);

  const line67AmountOwed = overpaymentAllocationResult.line67AmountOwed;
  const line68Overpayment = overpaymentAllocationResult.line68Overpayment;
  const creditToNextYear = overpaymentAllocationResult.creditToNextYear;
  const totalCharitableContributions =
    overpaymentAllocationResult.totalCharitableContributions;
  const line78TotalAdjustments =
    overpaymentAllocationResult.line78TotalAdjustments;
  const balanceDue = overpaymentAllocationResult.balanceDue;
  const refund = overpaymentAllocationResult.refund;

  audit.record(
    "NJ-1040",
    "balance-due",
    "Balance due",
    balanceDue,
    "max(0, tax after nonrefundable credits + penalty - total payments)",
    {
      "Tax after nonrefundable credits": taxAfterNonrefundableCredits,
      "Underpayment penalty": underpaymentPenalty,
      "Total payments": totalPayments,
    }
  );

  audit.record(
    "NJ-1040",
    "refund",
    "Refund",
    refund,
    "max(0, total payments - tax after nonrefundable credits - penalty)",
    {
      "Total payments": totalPayments,
      "Tax after nonrefundable credits": taxAfterNonrefundableCredits,
      "Underpayment penalty": underpaymentPenalty,
    }
  );

  // === Step 12: Filing Requirement Determination ===
  const filingRequirement = determineNJFilingRequirement({
    filingStatus: input.filingStatus,
    taxYear: input.taxYear,
    njGrossIncome,
    njWithholding,
    estimatedPayments,
    federalEITC: input.federalEITC,
    qualifiesForChildlessAge18Exception:
      input.qualifiesForChildlessAge18Exception,
    qualifyingChildrenAge5OrUnder: input.qualifyingChildrenAge5OrUnder,
    federalDependentCareCredit: input.federalDependentCareCredit,
    useTaxOwed: useTax,
    healthCoverageUncoveredMonths: input.healthCoverageUncoveredMonths,
    healthCoverageExemptAllUncoveredMonths,
    totalUIWFSWFWithheld: input.totalUIWFSWFWithheld,
    totalDIWithheld: input.totalDIWithheld,
    totalFLIWithheld: input.totalFLIWithheld,
    privatePlanMaxDI: input.privatePlanMaxDI,
    passThroughBusinessAlternativeIncomeTaxCredit,
    isHomeowner: input.isHomeowner,
    isTenant: input.isTenant,
    propertyTaxesPaid: input.propertyTaxesPaid,
    rentPaid: input.rentPaid,
    taxpayerAge65OrOlder: input.taxpayerAge65OrOlder,
    spouseAge65OrOlder: input.spouseAge65OrOlder,
    taxpayerBlindOrDisabled: input.taxpayerBlindOrDisabled,
    spouseBlindOrDisabled: input.spouseBlindOrDisabled,
    monthsOfResidency: input.monthsOfResidency,
    sharedMainHomeWithSpouse: input.sharedMainHomeWithSpouse,
    providedCareToQualifyingServiceMember:
      input.providedCareToQualifyingServiceMember,
    serviceMemberFederalDisabilityCompensation:
      input.serviceMemberFederalDisabilityCompensation,
    onlyCaregiver: input.onlyCaregiver,
    careExpensesSharePercent: input.careExpensesSharePercent,
  });
  audit.merge(filingRequirement.lines);

  return {
    filingStatus: input.filingStatus,
    taxYear: input.taxYear,
    njGrossIncome,
    collegeAffordabilityDeduction,
    totalExemptions,
    propertyTaxDeduction,
    medicalDeduction,
    qualifiedConservationContribution,
    healthEnterpriseZoneDeduction,
    alternativeBusinessCalculationAdjustment,
    organDonationDeduction,
    njTaxableIncome,
    njTax,
    useTax,
    sharedResponsibilityPayment,
    totalTax,
    line52UnderpaymentInterest,
    line54TotalTaxDue,
    otherJurisdictionCredit,
    shelteredWorkshopTaxCredit,
    goldStarFamilyCounselingCredit,
    organDonorEmployerCredit,
    supplementalNonrefundableCredits,
    propertyTaxCredit,
    taxAfterNonrefundableCredits,
    njEITC,
    njChildTaxCredit,
    njDependentCareCredit,
    woundedWarriorCredit,
    totalRefundableCredits,
    passThroughBusinessAlternativeIncomeTaxCredit,
    excessUIWFSWFCredit,
    excessDICredit,
    excessFLICredit,
    excessPayrollCredit,
    totalPayments,
    line67AmountOwed,
    line68Overpayment,
    creditToNextYear,
    totalCharitableContributions,
    line78TotalAdjustments,
    underpaymentPenalty,
    balanceDue,
    refund,
    filingRequirement,
    lines: audit.getLines(),
  };
}

export function calculateNJ1040(input: NJ1040Input): NJ1040Result {
  if (input.electPropertyTaxCredit !== undefined) {
    return calculateNJ1040WithResolvedPropertyTaxElection(
      input,
      input.electPropertyTaxCredit
    );
  }

  const deductionResult = calculateNJ1040WithResolvedPropertyTaxElection(
    input,
    false
  );
  const creditResult = calculateNJ1040WithResolvedPropertyTaxElection(input, true);
  const deductionNetBenefit = deductionResult.refund.minus(
    deductionResult.balanceDue
  );
  const creditNetBenefit = creditResult.refund.minus(creditResult.balanceDue);
  const creditIsBetter = creditNetBenefit.greaterThan(deductionNetBenefit);
  const selectedResult = creditIsBetter ? creditResult : deductionResult;

  const audit = new AuditTrail();
  audit.merge(selectedResult.lines);
  audit.record(
    "NJ-1040",
    "property-tax-benefit-selection",
    "Automatic property tax deduction versus credit selection",
    new Decimal(creditIsBetter ? 1 : 0),
    "When no explicit election is supplied, compare the completed return using the deduction and credit branches and keep the more beneficial result",
    {
      "Deduction branch refund": deductionResult.refund,
      "Deduction branch balance due": deductionResult.balanceDue,
      "Credit branch refund": creditResult.refund,
      "Credit branch balance due": creditResult.balanceDue,
      "Selected branch": creditIsBetter ? "credit" : "deduction",
    }
  );

  return {
    ...selectedResult,
    lines: audit.getLines(),
  };
}
