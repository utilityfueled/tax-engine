/**
 * Pennsylvania Personal Income Tax Return Orchestrator
 * Spec: spec/state/pa-orchestrator.yaml
 *
 * Maps TaxYearInput documents to PA's 8 income classes, then runs
 * PA-40, Schedule SP, and Schedule G-L to produce a full PA return.
 */

import Decimal from "decimal.js";
import { calculatePARentalIncomeExpenses, type PARentalIncomeExpensesResult } from "@/engine/state/pa-rental-income-expenses.js";
import { calculatePAOIDSources, type PAOIDSourcesResult } from "@/engine/state/pa-oid-sources.js";
import { calculatePARentalClassification, type PARentalClassificationResult } from "@/engine/state/pa-rental-classification.js";
import { d, sum, zeroFloor } from "@/utils/decimal.js";
import type {
  Form1099R,
  PAPassThroughStatement,
  PAScheduleA,
  RentalProperty,
  ScheduleK1,
  TaxYearInput,
} from "@/models/inputs.js";
import { TAX_CONSTANTS } from "@/models/constants.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { resolveForm1099RTaxableAmount } from "@/engine/forms/form-1099-r.js";
import {
  calculatePA40,
  calculatePA40AllowedOtherCredits,
  type PA40Input,
  type PA40Result,
} from "@/engine/state/pa-40.js";
import { calculateHomeSales } from "@/engine/forms/home-sale-exclusion.js";
import {
  calculateScheduleSP,
  type ScheduleSPInput,
  type ScheduleSPResult,
  type PAFilingCategory,
} from "@/engine/state/pa-schedule-sp.js";
import {
  calculateScheduleGL,
  type ScheduleGLInput,
  type OtherStateCredit,
  type ScheduleGLResult,
} from "@/engine/state/pa-schedule-g-l.js";
import {
  calculatePALocalEIT,
  type PALocalEITInput,
  type PALocalEITResult,
  type NonresidentEITCredit,
} from "@/engine/state/pa-local-eit.js";
import {
  calculateScheduleSD,
  type ScheduleSDResult,
  type SchoolDistrictMethod,
} from "@/engine/state/pa-schedule-sd.js";
import {
  calculateScheduleUE,
  type ScheduleUEInput,
  type ScheduleUEResult,
} from "@/engine/state/pa-schedule-ue.js";
import {
  calculateScheduleOC,
  type ScheduleOCInput,
  type ScheduleOCResult,
} from "@/engine/state/pa-schedule-oc.js";
import {
  calculatePAScheduleO,
  type PAScheduleOInput,
  type PAScheduleOResult,
  type PAScheduleOContributionEntry,
} from "@/engine/state/pa-schedule-o.js";
import {
  calculatePAScheduleA,
  type PAScheduleAAdjustmentEntry,
  type PAScheduleAInput,
  type PAScheduleAResult,
} from "@/engine/state/pa-schedule-a.js";
import { calculatePAScheduleC } from "@/engine/state/pa-schedule-c.js";
import {
  calculatePAScheduleF,
  type PAScheduleFResult,
} from "@/engine/state/pa-schedule-f.js";
import {
  calculatePAScheduleB,
  type PAScheduleBAdjustmentEntry,
  type PAScheduleBInput,
  type PAScheduleBResult,
} from "@/engine/state/pa-schedule-b.js";
import {
  calculateScheduleDC,
  type ScheduleDCInput,
  type ScheduleDCResult,
} from "@/engine/state/pa-schedule-dc.js";
import {
  calculatePAScheduleD,
  type PAScheduleDAdditionalTransaction,
  type PAScheduleDInput,
  type PAScheduleDLikeKindExchangeInput,
  type PAScheduleDResult,
} from "@/engine/state/pa-schedule-d.js";
import {
  calculatePAWorkingPennsylvaniansTaxCredit,
  type PAWorkingPennsylvaniansTaxCreditResult,
} from "@/engine/state/pa-working-pennsylvanians-tax-credit.js";
import {
  calculateScheduleJ,
  type ScheduleJResult,
} from "@/engine/state/pa-schedule-j.js";
import {
  calculatePAScheduleRK1,
  type PAScheduleRK1Result,
} from "@/engine/state/pa-schedule-rk1.js";
import {
  calculatePAScheduleT,
  type PAScheduleTAdditionalEntry,
  type PAScheduleTResult,
} from "@/engine/state/pa-schedule-t.js";
import {
  calculatePAScheduleE,
  type PAScheduleEResult,
} from "@/engine/state/pa-schedule-e.js";
import {
  calculateREV1630,
  type REV1630Input,
  type REV1630Result,
} from "@/engine/state/pa-rev-1630.js";
import {
  calculatePAUseTax,
  type PAUseTaxInput,
  type PAUseTaxLocality,
} from "@/engine/state/pa-use-tax.js";

// ---------------------------------------------------------------------------
// Input — optional overrides for PA-specific items not in TaxYearInput
// ---------------------------------------------------------------------------

export interface PAOrchestratorOverrides {
  /** Taxpayer is claimed as a dependent on another person's federal return for Schedule SP purposes */
  isClaimedAsDependentOnAnotherFederalReturn?: boolean;
  /** Spouse is claimed as a dependent on another person's federal return for Schedule SP purposes */
  spouseIsClaimedAsDependentOnAnotherFederalReturn?: boolean;
  /** The household claiming this taxpayer also qualifies for PA Tax Forgiveness */
  claimingHouseholdQualifiesForTaxForgiveness?: boolean;
  /** PA Schedule SP separated status for MFS taxpayers: lived apart for the last six months or under a written separation agreement */
  scheduleSPSeparatedStatusApplies?: boolean;
  /** Detailed Schedule UE input (preferred over raw unreimbursedExpenses) */
  scheduleUE?: ScheduleUEInput;
  /** Detailed Schedule T supplemental entries (used in addition to W-2G documents) */
  scheduleT?: {
    additionalEntries?: PAScheduleTAdditionalEntry[];
  };
  /** Detailed Schedule A adjustments and supplemental lines */
  scheduleA?: Omit<
    PAScheduleAInput,
    | "taxYear"
    | "federalInterestIncome"
    | "taxExemptInterest"
    | "federalScheduleK1Interest"
    | "usGovernmentInterest"
    | "paPassThroughInterest"
  > & { oidSources?: PAScheduleA["oidSources"] };
  /** Detailed Schedule B adjustments and supplemental lines */
  scheduleB?: Omit<
    PAScheduleBInput,
    | "taxYear"
    | "federalDividendIncome"
    | "federalScheduleK1Dividends"
    | "exemptInterestDividends"
    | "capitalGainDistributions"
    | "paPassThroughDividends"
  >;
  /** Detailed Schedule D supplemental transactions and special-gain lines */
  scheduleD?: Omit<
    PAScheduleDInput,
    | "taxYear"
    | "filingStatus"
    | "form1099B"
    | "scheduleK1"
    | "paPassThroughStatements"
    | "homeSales"
    | "form6252"
    | "form6781"
  >;
  /** Unreimbursed employee business expenses (PA Schedule UE) — use scheduleUE for detailed computation */
  unreimbursedExpenses?: Decimal;
  /** Other deductions (IRC §529, MSA contributions) */
  otherDeductions?: Decimal;
  /** Detailed Schedule O input (preferred over raw otherDeductions) */
  scheduleO?: Omit<PAScheduleOInput, "taxYear" | "taxpayerPATaxableIncome" | "spousePATaxableIncome"> & {
    taxpayerPATaxableIncome?: Decimal;
    spousePATaxableIncome?: Decimal;
  };
  /** Credit from prior year PA overpayment */
  creditFromPriorYear?: Decimal;
  /** Extension payment */
  extensionPayment?: Decimal;
  /** Estimated tax payments */
  estimatedPayments?: Decimal;
  /** Reconciled PA source withholding entered separately from the document arrays. */
  additionalStateWithholding?: Decimal;
  /** Nonresident tax withheld from PA Schedule(s) NRK-1 */
  nonresidentTaxWithheld?: Decimal;
  /** Schedule SP-includable nontaxable income, excluding Social Security and similar exempt retirement benefits */
  nontaxableIncome?: Decimal;
  /** Additional Schedule SP eligibility income not otherwise modeled on the return */
  additionalEligibilityIncome?: Decimal;
  /** Spouse-only Schedule SP eligibility income for married separate workflows */
  spouseEligibilityIncome?: Decimal;
  /** Estate or trust income (from PA Schedule J) */
  estateTrustIncome?: Decimal;
  /** Per-state credits for Schedule G-L (fallback when no statement input is provided) */
  otherStateCredits?: OtherStateCredit[];
  /** Detailed Schedule OC input (preferred over raw otherCredits) */
  scheduleOC?: Omit<ScheduleOCInput, "taxYear">;
  /** Other credits flat amount — use scheduleOC for detailed computation */
  otherCredits?: Decimal;
  /** Local EIT: resident municipality name */
  localMunicipality?: string;
  /** Local EIT: resident municipality rate (e.g., 0.01 for 1%) */
  localEITRate?: Decimal;
  /** Local EIT: nonresident credits for work municipality taxes paid */
  localNonresidentCredits?: NonresidentEITCredit[];
  /** Optional school district PIT computation (PA-40 SD) */
  scheduleSD?: {
    method: SchoolDistrictMethod;
    schoolDistrictRate: Decimal;
    schoolDistrictWithholding?: Decimal;
    estimatedPayments?: Decimal;
  };

  /** REV-1630: quarterly estimated payments [Q1, Q2, Q3, Q4] */
  quarterlyEstimatedPayments?: readonly [Decimal, Decimal, Decimal, Decimal];
  /** REV-1630: prior year had 100% Tax Forgiveness (exempt from penalty) */
  priorYear100PercentForgiveness?: boolean;
  /** REV-1630: prior year PA taxable income (for Exception 1 safe harbor) */
  priorYearPATaxableIncome?: Decimal;
  /** REV-1630: prior year Tax Forgiveness credit (for Exception 1) */
  priorYearTaxForgivenessCredit?: Decimal;

  /** PA-40 Line 10: Use tax on out-of-state purchases */
  useTax?: Decimal;
  /** Supported PA Use Tax Worksheet input for computing Line 25 when no raw amount is supplied */
  useTaxWorksheet?: Omit<PAUseTaxInput, "taxYear" | "paTaxableIncome">;
  /** PA-40 Line 27 component: late filing or payment penalty */
  lateFilingOrPaymentPenalty?: Decimal;
  /** PA-40 Line 25b: Interest on late payment */
  latePaymentInterest?: Decimal;
}

const PA_SCHEDULE_SP_MARRIED_DEPENDENT_FILING_ERROR =
  "PA Schedule SP requires married taxpayers to file separately when either spouse is claimed as a dependent on another person's federal return";

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface PAOrchestratorResult {
  pa40: PA40Result;
  scheduleSP: ScheduleSPResult;
  scheduleGL: ScheduleGLResult;
  /** PA-20S/PA-65 Schedule RK-1 / NRK-1 statement result when provided */
  scheduleRK1?: PAScheduleRK1Result;
  /** Schedule J result (only present when PA Schedule J statements are provided) */
  scheduleJ?: ScheduleJResult;
  /** Schedule T result (only present when W-2Gs or Schedule T entries are provided) */
  scheduleT?: PAScheduleTResult;
  /** Schedule A result for PA interest income */
  scheduleA?: PAScheduleAResult;
  /** Source-linked PA OID adjustments and withholding. */
  oidSources?: PAOIDSourcesResult;
  rentalClassifications: PARentalClassificationResult[];
  rentalIncomeWorksheets: PARentalIncomeExpensesResult[];
  /** Schedule B result for PA dividend income */
  scheduleB?: PAScheduleBResult;
  /** Schedule F result for PA farm income */
  scheduleF?: PAScheduleFResult;
  /** Schedule D result for PA net gains/losses */
  scheduleD?: PAScheduleDResult;
  /** Schedule E result for PA rental and royalty income */
  scheduleE?: PAScheduleEResult;
  /** Schedule UE result (only present when scheduleUE input is provided) */
  scheduleUE?: ScheduleUEResult;
  /** Schedule O result (only present when scheduleO input is provided) */
  scheduleO?: PAScheduleOResult;
  /** Schedule DC result (only present when dependentCare input is provided) */
  scheduleDC?: ScheduleDCResult;
  /** Working Pennsylvanians Tax Credit result (only present for tax year 2025+) */
  workingPennsylvaniansTaxCredit?: PAWorkingPennsylvaniansTaxCreditResult;
  /** Schedule OC result (only present when scheduleOC input is provided) */
  scheduleOC?: ScheduleOCResult;
  /** Schedule SD result (only present when scheduleSD input is provided) */
  scheduleSD?: ScheduleSDResult;
  /** Local EIT result (only present when localEITRate is provided) */
  localEIT?: PALocalEITResult;
  /** REV-1630 underpayment penalty result (only present when quarterlyEstimatedPayments provided) */
  rev1630?: REV1630Result;

  /** Mapped income classes (after PA-specific exclusions, before PA-40 computation) */
  mappedIncome: {
    compensation: Decimal;
    interest: Decimal;
    dividends: Decimal;
    netBusinessIncome: Decimal;
    netGainOrLoss: Decimal;
    netRentalIncome: Decimal;
    estateTrustIncome: Decimal;
    gamblingIncome: Decimal;
  };

  /** PA-specific income exclusions applied */
  exclusions: {
    /** US government interest excluded from Class 2 (1099-INT Box 3) */
    usGovInterest: Decimal;
    /** Noncash PA Lottery winnings excluded from Class 8 */
    paLotteryWinnings: Decimal;
  };

  /** Total PA state withholding extracted from input documents */
  stateWithholding: Decimal;
  /** Total local withholding extracted from W-2 Box 19 */
  localWithholding: Decimal;
}

function toOptionalDecimal(value: string | undefined): Decimal | undefined {
  return value === undefined ? undefined : d(value);
}

function toPAAdjustmentEntries<T extends PAScheduleAAdjustmentEntry | PAScheduleBAdjustmentEntry>(
  entries?: Array<{ description: string; amount: string }>,
): T[] | undefined {
  return entries?.map((entry) => ({
    description: entry.description,
    amount: d(entry.amount),
  })) as T[] | undefined;
}

function toPAScheduleDTransactions(
  entries?: Array<{
    accountHolder?: "primary" | "spouse";
    description: string;
    dateAcquired: string;
    dateSold: string;
    proceeds: string;
    costBasis: string;
    adjustments?: string;
    basisReportedToIRS?: boolean;
    holdingPeriod: "short" | "long";
    washSale?: boolean;
    washSaleDisallowed?: string;
    digitalAsset?: boolean;
  }>,
): PAScheduleDAdditionalTransaction[] | undefined {
  return entries?.map((entry) => ({
    accountHolder: entry.accountHolder,
    description: entry.description,
    dateAcquired: entry.dateAcquired,
    dateSold: entry.dateSold,
    proceeds: d(entry.proceeds),
    costBasis: d(entry.costBasis),
    adjustments: d(entry.adjustments),
    basisReportedToIRS: entry.basisReportedToIRS ?? true,
    holdingPeriod: entry.holdingPeriod,
    washSale: entry.washSale ?? false,
    washSaleDisallowed: d(entry.washSaleDisallowed),
    digitalAsset: entry.digitalAsset ?? false,
  }));
}

function toPAScheduleDLikeKindExchanges(
  entries?: Array<{
    accountHolder?: "primary" | "spouse";
    propertyOwned: string;
    propertyReceived: string;
    recognizedGainOrLoss?: string;
  }>,
): PAScheduleDLikeKindExchangeInput[] | undefined {
  return entries?.map((entry) => ({
    accountHolder: entry.accountHolder,
    propertyOwned: entry.propertyOwned,
    propertyReceived: entry.propertyReceived,
    recognizedGainOrLoss: d(entry.recognizedGainOrLoss),
  }));
}

function resolvePAResidentOverrides(
  input: TaxYearInput,
  overrides: PAOrchestratorOverrides,
): PAOrchestratorOverrides {
  const residentReturn = input.paResidentReturn;
  if (!residentReturn) {
    return overrides;
  }

  const resolved: PAOrchestratorOverrides = { ...overrides };

  if (resolved.scheduleUE === undefined && residentReturn.scheduleUE) {
    resolved.scheduleUE = {
      taxYear: input.taxpayer.taxYear,
      vehicle: residentReturn.scheduleUE.vehicle
        ? {
            method: residentReturn.scheduleUE.vehicle.method,
            totalMiles: residentReturn.scheduleUE.vehicle.totalMiles,
            businessMiles: residentReturn.scheduleUE.vehicle.businessMiles,
            actualExpenses: d(residentReturn.scheduleUE.vehicle.actualExpenses),
            parkingAndTolls: d(residentReturn.scheduleUE.vehicle.parkingAndTolls),
          }
        : undefined,
      travel: residentReturn.scheduleUE.travel
        ? {
            lodging: d(residentReturn.scheduleUE.travel.lodging),
            meals: d(residentReturn.scheduleUE.travel.meals),
            otherTravel: d(residentReturn.scheduleUE.travel.otherTravel),
          }
        : undefined,
      otherExpenses: residentReturn.scheduleUE.otherExpenses
        ? {
            unionDues: d(residentReturn.scheduleUE.otherExpenses.unionDues),
            toolsAndSupplies: d(residentReturn.scheduleUE.otherExpenses.toolsAndSupplies),
            workClothing: d(residentReturn.scheduleUE.otherExpenses.workClothing),
            education: d(residentReturn.scheduleUE.otherExpenses.education),
            licenseFees: d(residentReturn.scheduleUE.otherExpenses.licenseFees),
            subscriptions: d(residentReturn.scheduleUE.otherExpenses.subscriptions),
            homeOffice: d(residentReturn.scheduleUE.otherExpenses.homeOffice),
            otherExpenses: d(residentReturn.scheduleUE.otherExpenses.otherExpenses),
          }
        : undefined,
      employerReimbursements: d(residentReturn.scheduleUE.employerReimbursements),
    };
  }

  if (resolved.scheduleA === undefined && residentReturn.scheduleA) {
    resolved.scheduleA = {
      oidSources: residentReturn.scheduleA.oidSources,
      additionAdjustments: toPAAdjustmentEntries<PAScheduleAAdjustmentEntry>(
        residentReturn.scheduleA.additionAdjustments,
      ),
      paObligationInterest: toOptionalDecimal(residentReturn.scheduleA.paObligationInterest),
      reductionAdjustments: toPAAdjustmentEntries<PAScheduleAAdjustmentEntry>(
        residentReturn.scheduleA.reductionAdjustments,
      ),
      forfeitedInterestPenalty: toOptionalDecimal(residentReturn.scheduleA.forfeitedInterestPenalty),
      annuityAndEndowmentDistributions: toOptionalDecimal(
        residentReturn.scheduleA.annuityAndEndowmentDistributions,
      ),
      charitableGiftAnnuityIncome: toOptionalDecimal(residentReturn.scheduleA.charitableGiftAnnuityIncome),
      nonEducational529Distributions: toOptionalDecimal(
        residentReturn.scheduleA.nonEducational529Distributions,
      ),
      taxableHealthMedicalSavingsDistributions: toOptionalDecimal(
        residentReturn.scheduleA.taxableHealthMedicalSavingsDistributions,
      ),
    };
  }

  if (resolved.scheduleB === undefined && residentReturn.scheduleB) {
    resolved.scheduleB = {
      paExemptInterestDividends: toOptionalDecimal(residentReturn.scheduleB.paExemptInterestDividends),
      reductionAdjustments: toPAAdjustmentEntries<PAScheduleBAdjustmentEntry>(
        residentReturn.scheduleB.reductionAdjustments,
      ),
      additionAdjustments: toPAAdjustmentEntries<PAScheduleBAdjustmentEntry>(
        residentReturn.scheduleB.additionAdjustments,
      ),
      repatriationTransitionTaxBase: toOptionalDecimal(
        residentReturn.scheduleB.repatriationTransitionTaxBase,
      ),
      repatriationPriorYearPayments: toOptionalDecimal(
        residentReturn.scheduleB.repatriationPriorYearPayments,
      ),
      repatriationCurrentYearPayments: toOptionalDecimal(
        residentReturn.scheduleB.repatriationCurrentYearPayments,
      ),
    };
  }

  if (resolved.scheduleD === undefined && residentReturn.scheduleD) {
    resolved.scheduleD = {
      additionalTransactions: toPAScheduleDTransactions(residentReturn.scheduleD.additionalTransactions),
      likeKindExchanges: toPAScheduleDLikeKindExchanges(residentReturn.scheduleD.likeKindExchanges),
      receivedDigitalAssetAsCompensationOrServices:
        residentReturn.scheduleD.receivedDigitalAssetAsCompensationOrServices,
      otherLine3GainOrLoss: toOptionalDecimal(residentReturn.scheduleD.otherLine3GainOrLoss),
      cCorporationDistributionGain: toOptionalDecimal(residentReturn.scheduleD.cCorporationDistributionGain),
      scheduleD71GainOrLoss: toOptionalDecimal(residentReturn.scheduleD.scheduleD71GainOrLoss),
      partnershipDistributionGain: toOptionalDecimal(residentReturn.scheduleD.partnershipDistributionGain),
      sCorporationDistributionGain: toOptionalDecimal(residentReturn.scheduleD.sCorporationDistributionGain),
      insuranceContractGain: toOptionalDecimal(residentReturn.scheduleD.insuranceContractGain),
    };
  }

  if (resolved.unreimbursedExpenses === undefined && residentReturn.unreimbursedExpenses !== undefined) {
    resolved.unreimbursedExpenses = d(residentReturn.unreimbursedExpenses);
  }
  if (resolved.scheduleO === undefined && residentReturn.scheduleO) {
    const mapScheduleOEntries = (
      entries?: Array<{
        beneficiaryName: string;
        beneficiarySSN: string;
        taxpayerContribution?: string;
        spouseContribution?: string;
      }>,
    ): PAScheduleOContributionEntry[] | undefined => entries?.map((entry) => ({
      beneficiaryName: entry.beneficiaryName,
      beneficiarySSN: entry.beneficiarySSN,
      taxpayerContribution: d(entry.taxpayerContribution),
      spouseContribution: d(entry.spouseContribution),
    }));

    resolved.scheduleO = {
      qualifiedTuitionContributions: mapScheduleOEntries(residentReturn.scheduleO.qualifiedTuitionContributions),
      ableContributions: mapScheduleOEntries(residentReturn.scheduleO.ableContributions),
      medicalSavingsAccountDeduction: toOptionalDecimal(residentReturn.scheduleO.medicalSavingsAccountDeduction),
      spouseMedicalSavingsAccountDeduction: toOptionalDecimal(residentReturn.scheduleO.spouseMedicalSavingsAccountDeduction),
      healthSavingsAccountDeduction: toOptionalDecimal(residentReturn.scheduleO.healthSavingsAccountDeduction),
      spouseHealthSavingsAccountDeduction: toOptionalDecimal(residentReturn.scheduleO.spouseHealthSavingsAccountDeduction),
      studentLoanInterestDeduction: toOptionalDecimal(residentReturn.scheduleO.studentLoanInterestDeduction),
      spouseStudentLoanInterestDeduction: toOptionalDecimal(residentReturn.scheduleO.spouseStudentLoanInterestDeduction),
      taxpayerPATaxableIncome: toOptionalDecimal(residentReturn.scheduleO.taxpayerPATaxableIncome),
      spousePATaxableIncome: toOptionalDecimal(residentReturn.scheduleO.spousePATaxableIncome),
    };
  }
  if (resolved.otherDeductions === undefined && residentReturn.otherDeductions !== undefined) {
    resolved.otherDeductions = d(residentReturn.otherDeductions);
  }
  if (resolved.creditFromPriorYear === undefined && residentReturn.creditFromPriorYear !== undefined) {
    resolved.creditFromPriorYear = d(residentReturn.creditFromPriorYear);
  }
  if (resolved.extensionPayment === undefined && residentReturn.extensionPayment !== undefined) {
    resolved.extensionPayment = d(residentReturn.extensionPayment);
  }
  if (resolved.estimatedPayments === undefined && residentReturn.estimatedPayments !== undefined) {
    resolved.estimatedPayments = d(residentReturn.estimatedPayments);
  }
  if (resolved.nonresidentTaxWithheld === undefined && residentReturn.nonresidentTaxWithheld !== undefined) {
    resolved.nonresidentTaxWithheld = d(residentReturn.nonresidentTaxWithheld);
  }
  if (resolved.nontaxableIncome === undefined && residentReturn.nontaxableIncome !== undefined) {
    resolved.nontaxableIncome = d(residentReturn.nontaxableIncome);
  }
  if (
    resolved.additionalEligibilityIncome === undefined
    && residentReturn.additionalEligibilityIncome !== undefined
  ) {
    resolved.additionalEligibilityIncome = d(residentReturn.additionalEligibilityIncome);
  }
  if (resolved.spouseEligibilityIncome === undefined && residentReturn.spouseEligibilityIncome !== undefined) {
    resolved.spouseEligibilityIncome = d(residentReturn.spouseEligibilityIncome);
  }
  if (
    resolved.isClaimedAsDependentOnAnotherFederalReturn === undefined
    && residentReturn.isClaimedAsDependentOnAnotherFederalReturn !== undefined
  ) {
    resolved.isClaimedAsDependentOnAnotherFederalReturn = residentReturn.isClaimedAsDependentOnAnotherFederalReturn;
  }
  if (
    resolved.spouseIsClaimedAsDependentOnAnotherFederalReturn === undefined
    && residentReturn.spouseIsClaimedAsDependentOnAnotherFederalReturn !== undefined
  ) {
    resolved.spouseIsClaimedAsDependentOnAnotherFederalReturn =
      residentReturn.spouseIsClaimedAsDependentOnAnotherFederalReturn;
  }
  if (
    resolved.claimingHouseholdQualifiesForTaxForgiveness === undefined
    && residentReturn.claimingHouseholdQualifiesForTaxForgiveness !== undefined
  ) {
    resolved.claimingHouseholdQualifiesForTaxForgiveness = residentReturn.claimingHouseholdQualifiesForTaxForgiveness;
  }
  if (
    resolved.scheduleSPSeparatedStatusApplies === undefined &&
    residentReturn.scheduleSPSeparatedStatusApplies !== undefined
  ) {
    resolved.scheduleSPSeparatedStatusApplies = residentReturn.scheduleSPSeparatedStatusApplies;
  }
  if (resolved.estateTrustIncome === undefined && residentReturn.estateTrustIncome !== undefined) {
    resolved.estateTrustIncome = d(residentReturn.estateTrustIncome);
  }
  if (resolved.otherStateCredits === undefined && residentReturn.otherStateCredits) {
    resolved.otherStateCredits = residentReturn.otherStateCredits.map((credit) => ({
      stateCode: credit.stateCode,
      incomeTaxableByBothStates: d(credit.incomeTaxableByBothStates),
      taxPaidToOtherState: d(credit.taxPaidToOtherState),
    }));
  }
  if (resolved.scheduleT === undefined && residentReturn.scheduleT) {
    resolved.scheduleT = {
      additionalEntries: residentReturn.scheduleT.additionalEntries?.map((entry) => ({
        description: entry.description,
        accountHolder: entry.accountHolder,
        winnings: d(entry.winnings),
        wageringCosts: d(entry.wageringCosts),
        isLottery: entry.isLottery,
        lotteryState: entry.lotteryState,
        prizeType: entry.prizeType,
      })),
    };
  }
  if (resolved.otherCredits === undefined && residentReturn.otherCredits !== undefined) {
    resolved.otherCredits = d(residentReturn.otherCredits);
  }
  if (resolved.useTaxWorksheet === undefined && residentReturn.useTaxWorksheet) {
    resolved.useTaxWorksheet = {
      locality: residentReturn.useTaxWorksheet.locality as PAUseTaxLocality,
      taxableItemPurchases: d(residentReturn.useTaxWorksheet.taxableItemPurchases),
      taxableServicePurchases: d(residentReturn.useTaxWorksheet.taxableServicePurchases),
      electEstimatedTable: residentReturn.useTaxWorksheet.electEstimatedTable,
      salesTaxAlreadyPaid: d(residentReturn.useTaxWorksheet.salesTaxAlreadyPaid),
      salesTaxAlreadyPaidEntries: residentReturn.useTaxWorksheet.salesTaxAlreadyPaidEntries?.map((entry) => ({
        taxablePurchaseAmount: d(entry.taxablePurchaseAmount),
        salesTaxPaid: d(entry.salesTaxPaid),
      })),
    };
  }
  if (resolved.useTax === undefined && residentReturn.useTax !== undefined) {
    resolved.useTax = d(residentReturn.useTax);
  }
  if (
    resolved.lateFilingOrPaymentPenalty === undefined
    && residentReturn.lateFilingOrPaymentPenalty !== undefined
  ) {
    resolved.lateFilingOrPaymentPenalty = d(residentReturn.lateFilingOrPaymentPenalty);
  }
  if (resolved.latePaymentInterest === undefined && residentReturn.latePaymentInterest !== undefined) {
    resolved.latePaymentInterest = d(residentReturn.latePaymentInterest);
  }

  if (resolved.scheduleOC === undefined && residentReturn.scheduleOC) {
    resolved.scheduleOC = {
      pteCredits: residentReturn.scheduleOC.pteCredits?.map((entry) => ({
        entityName: entry.entityName,
        entityEIN: entry.entityEIN,
        allocablePAIncome: d(entry.allocablePAIncome),
        pteTaxPaid: d(entry.pteTaxPaid),
      })),
      otherCredits: residentReturn.scheduleOC.otherCredits?.map((entry) => ({
        creditType: entry.creditType,
        description: entry.description,
        amount: d(entry.amount),
      })),
    };
  }

  if (resolved.localMunicipality === undefined && residentReturn.localMunicipality !== undefined) {
    resolved.localMunicipality = residentReturn.localMunicipality;
  }
  if (resolved.localEITRate === undefined && residentReturn.localEITRate !== undefined) {
    resolved.localEITRate = d(residentReturn.localEITRate);
  }
  if (resolved.localNonresidentCredits === undefined && residentReturn.localNonresidentCredits) {
    resolved.localNonresidentCredits = residentReturn.localNonresidentCredits.map((credit) => ({
      municipality: credit.municipality,
      incomeInWorkMunicipality: d(credit.incomeInWorkMunicipality),
      taxPaidToWorkMunicipality: d(credit.taxPaidToWorkMunicipality),
    }));
  }

  if (resolved.scheduleSD === undefined && residentReturn.scheduleSD) {
    resolved.scheduleSD = {
      method: residentReturn.scheduleSD.method,
      schoolDistrictRate: d(residentReturn.scheduleSD.schoolDistrictRate),
      schoolDistrictWithholding: d(residentReturn.scheduleSD.schoolDistrictWithholding),
      estimatedPayments: d(residentReturn.scheduleSD.estimatedPayments),
    };
  }

  if (resolved.quarterlyEstimatedPayments === undefined && residentReturn.quarterlyEstimatedPayments) {
    const [q1, q2, q3, q4] = residentReturn.quarterlyEstimatedPayments;
    resolved.quarterlyEstimatedPayments = [d(q1), d(q2), d(q3), d(q4)];
  }
  if (
    resolved.priorYear100PercentForgiveness === undefined &&
    residentReturn.priorYear100PercentForgiveness !== undefined
  ) {
    resolved.priorYear100PercentForgiveness = residentReturn.priorYear100PercentForgiveness;
  }
  if (resolved.priorYearPATaxableIncome === undefined && residentReturn.priorYearPATaxableIncome !== undefined) {
    resolved.priorYearPATaxableIncome = d(residentReturn.priorYearPATaxableIncome);
  }
  if (
    resolved.priorYearTaxForgivenessCredit === undefined &&
    residentReturn.priorYearTaxForgivenessCredit !== undefined
  ) {
    resolved.priorYearTaxForgivenessCredit = d(residentReturn.priorYearTaxForgivenessCredit);
  }

  return resolved;
}

function assertValidScheduleSPDependencyFilingStatus(
  taxpayer: TaxYearInput["taxpayer"],
  overrides: PAOrchestratorOverrides,
): void {
  if (taxpayer.filingStatus !== "married_filing_jointly") {
    return;
  }

  if (
    overrides.isClaimedAsDependentOnAnotherFederalReturn === true
    || overrides.spouseIsClaimedAsDependentOnAnotherFederalReturn === true
  ) {
    throw new Error(PA_SCHEDULE_SP_MARRIED_DEPENDENT_FILING_ERROR);
  }
}

// ---------------------------------------------------------------------------
// Filing category mapping
// ---------------------------------------------------------------------------

function mapFilingCategory(
  taxpayer: TaxYearInput["taxpayer"],
  overrides: PAOrchestratorOverrides,
): PAFilingCategory {
  switch (taxpayer.filingStatus) {
    case "married_filing_jointly":
      return "married";
    case "married_filing_separately":
      // Schedule SP uses the unmarried table when the taxpayer qualifies as
      // separated for PA purposes, even if the spouses lived together earlier
      // in the year. Living apart for the entire year also necessarily meets
      // the PA separated test.
      return overrides.scheduleSPSeparatedStatusApplies === true
        || taxpayer.livedWithSpouseAtAnyTimeDuringYear === false
        ? "unmarried"
        : "married";
    default:
      return "unmarried";
  }
}

function isPAScheduleSPDependentChild(
  dependent: TaxYearInput["taxpayer"]["dependents"][number],
): boolean {
  const relationship = dependent.relationship.trim().toLowerCase();

  if (relationship.length === 0) {
    return false;
  }

  if (/\b(child|son|daughter)\s+in\s+law\b/.test(relationship)) {
    return false;
  }

  return /\b(child|son|daughter)\b/.test(relationship)
    || /\b(step|grand|foster)[ -]?(child|son|daughter)\b/.test(relationship)
    || /\badopt(?:ed|ive)?[ -]?(child|son|daughter)\b/.test(relationship);
}

function countPAScheduleSPDependentChildren(
  taxpayer: TaxYearInput["taxpayer"],
): number {
  return taxpayer.dependents.reduce(
    (count, dependent) => count + (isPAScheduleSPDependentChild(dependent) ? 1 : 0),
    0,
  );
}

// ---------------------------------------------------------------------------
// Income class mappers
// ---------------------------------------------------------------------------

function isExemptActiveDutyMilitaryCompensation(
  w2: TaxYearInput["w2s"][number],
): boolean {
  if (w2.militaryService?.activeDuty !== true) {
    return false;
  }

  const dutyState = w2.militaryService.dutyState?.toUpperCase();
  return dutyState !== undefined && dutyState !== "PA";
}

function isCombatOrHazardousDutyMilitaryPay(
  w2: TaxYearInput["w2s"][number],
): boolean {
  return w2.militaryService?.combatOrHazardousDutyPay === true;
}

function getPAResidentW2CompensationBeforeMilitaryExclusion(
  w2: TaxYearInput["w2s"][number],
): Decimal {
  const state = w2.state?.toUpperCase();

  // When the W-2 reports PA wages (or omits the state), Box 16 is the best
  // signal for resident PA compensation. Other states' Box 16 amounts reflect
  // their own wage bases, so resident returns reconstruct PA compensation
  // from federal Box 1 plus PA-taxable pre-tax deferrals.
  if ((!state || state === "PA") && !d(w2.stateWages).isZero()) {
    return d(w2.stateWages);
  }

  return d(w2.wages)
    .plus(d(w2.box12CodeD))
    .plus(d(w2.box12CodeE))
    .plus(d(w2.box12CodeF))
    .plus(d(w2.box12CodeG))
    .plus(d(w2.box12CodeH))
    .plus(d(w2.box12CodeS));
}

function getPAResidentW2Compensation(w2: TaxYearInput["w2s"][number]): Decimal {
  if (isExemptActiveDutyMilitaryCompensation(w2)) {
    return new Decimal(0);
  }

  return getPAResidentW2CompensationBeforeMilitaryExclusion(w2);
}

function getPALocalEITW2Compensation(w2: TaxYearInput["w2s"][number]): Decimal {
  const localWages = d(w2.localWages);
  if (!localWages.isZero()) {
    return localWages;
  }

  return getPAResidentW2Compensation(w2);
}

function mapNonqualifiedDeferredCompensation(input: TaxYearInput): Decimal {
  return input.form1099Misc.reduce(
    (total, form) => total.plus(d(form.nonqualifiedDeferredComp)),
    new Decimal(0),
  );
}

/** Class 1: Compensation — resident wages and other PA-taxable compensation */
function mapCompensation(input: TaxYearInput): Decimal {
  let total = new Decimal(0);
  for (const w2 of input.w2s) {
    total = total.plus(getPAResidentW2Compensation(w2));
  }

  return total.plus(mapNonqualifiedDeferredCompensation(input));
}

function mapLocalEITCompensation(input: TaxYearInput): Decimal {
  let total = new Decimal(0);
  for (const w2 of input.w2s) {
    total = total.plus(getPALocalEITW2Compensation(w2));
  }

  return total.plus(mapNonqualifiedDeferredCompensation(input));
}

/** Class 6 addition: 1099-K rental income */
function map1099KRental(input: TaxYearInput): Decimal {
  return input.form1099K.reduce((acc, k) => {
    if (k.incomeType === "rental") {
      return acc.plus(d(k.grossAmount));
    }
    return acc;
  }, new Decimal(0));
}

/** Federal interest baseline for PA Schedule A Line 1 */
function mapFederalInterestIncome(input: TaxYearInput): Decimal {
  return input.form1099Int.reduce(
    (acc, f) => acc.plus(d(f.interestIncome)).plus(d(f.usSavingsBondInterest)),
    new Decimal(0),
  );
}

/** Federal Schedule K-1 interest included in the federal interest baseline */
function mapFederalScheduleK1Interest(input: TaxYearInput): Decimal {
  return input.scheduleK1.reduce(
    (acc, k) => acc.plus(d(k.interestIncome)),
    new Decimal(0),
  );
}

/** Tax-exempt interest included on the federal return, excluding exempt-interest dividends */
function mapTaxExemptInterestIncludedInFederalReturn(input: TaxYearInput): Decimal {
  return input.form1099Int.reduce(
    (acc, form) => acc.plus(d(form.taxExemptInterest)),
    new Decimal(0),
  );
}

/** Pennsylvania direct-obligation interest reported on normalized 1099-INT input */
function mapPADirectObligationInterest(input: TaxYearInput): Decimal {
  return input.form1099Int.reduce(
    (acc, form) => acc.plus(d(form.paDirectObligationInterest)),
    new Decimal(0),
  );
}

/** Supported PA Schedule A forfeited-interest penalty default from Form 1099-INT Box 2 */
function mapSupportedPAForfeitedInterestPenalty(input: TaxYearInput): Decimal {
  return input.form1099Int.reduce(
    (acc, form) => acc.plus(Decimal.min(d(form.interestIncome), d(form.earlyWithdrawalPenalty))),
    new Decimal(0),
  );
}

/** Federal dividend baseline for PA Schedule B Line 1 */
function mapFederalDividendIncome(input: TaxYearInput): Decimal {
  const div1099 = input.form1099Div.reduce(
    (acc, form) => acc.plus(d(form.ordinaryDividends)),
    new Decimal(0),
  );
  const k1Dividends = input.scheduleK1.reduce(
    (acc, k) => acc.plus(d(k.ordinaryDividends)),
    new Decimal(0),
  );
  return div1099.plus(k1Dividends);
}

/** Federal Schedule K-1 dividends included in the federal dividend baseline */
function mapFederalScheduleK1Dividends(input: TaxYearInput): Decimal {
  return input.scheduleK1.reduce(
    (acc, k) => acc.plus(d(k.ordinaryDividends)),
    new Decimal(0),
  );
}

/** Exempt-interest dividends reported on federal Form 1099-DIV Box 12 */
function mapExemptInterestDividends(input: TaxYearInput): Decimal {
  return input.form1099Div.reduce(
    (acc, form) => acc.plus(d(form.exemptInterestDividends)),
    new Decimal(0),
  );
}

/** Pennsylvania/U.S.-government exempt share of Form 1099-DIV Box 12 dividends */
function mapPAExemptInterestDividendAllocation(input: TaxYearInput): Decimal {
  return input.form1099Div.reduce(
    (acc, form) => acc.plus(d(form.paExemptInterestDividendAllocation)),
    new Decimal(0),
  );
}

/** Capital gains distributions reported on federal Form 1099-DIV Box 2a */
function mapCapitalGainDistributions(input: TaxYearInput): Decimal {
  return input.form1099Div.reduce(
    (acc, form) => acc.plus(d(form.totalCapitalGainDistributions)),
    new Decimal(0),
  );
}

type PAClass4Owner = "primary" | "spouse";

interface PAClass4IncomeByOwner {
  primary: Decimal;
  spouse: Decimal;
  reportable: Decimal;
}

function getPAClass4Owner(accountHolder?: PAClass4Owner): PAClass4Owner {
  return accountHolder === "spouse" ? "spouse" : "primary";
}

function calculatePAScheduleCNetIncome(input: TaxYearInput): Decimal {
  if (!input.scheduleC) {
    return new Decimal(0);
  }

  return calculatePAScheduleC({
    taxYear: input.taxpayer.taxYear,
    grossReceipts: d(input.scheduleC.grossReceipts),
    returnsAndAllowances: d(input.scheduleC.returnsAndAllowances),
    costOfGoodsSold: d(input.scheduleC.costOfGoodsSold),
    otherIncome: d(input.scheduleC.otherIncome),
    expenses: input.scheduleC.expenses
      ? {
        advertising: d(input.scheduleC.expenses.advertising),
        amortization: d(input.scheduleC.expenses.amortization),
        badDebts: d(input.scheduleC.expenses.badDebts),
        bankCharges: d(input.scheduleC.expenses.bankCharges),
        carAndTruck: d(input.scheduleC.expenses.carAndTruck),
        commissionsAndFees: d(input.scheduleC.expenses.commissionsAndFees),
        contractLabor: d(input.scheduleC.expenses.contractLabor),
        depletion: d(input.scheduleC.expenses.depletion),
        depreciation: d(input.scheduleC.expenses.depreciation),
        duesAndPublications: d(input.scheduleC.expenses.duesAndPublications),
        employeeBenefitPrograms: d(input.scheduleC.expenses.employeeBenefitPrograms),
        businessInterest: d(input.scheduleC.expenses.businessInterest),
        freight: d(input.scheduleC.expenses.freight),
        idcsAmortization: d(input.scheduleC.expenses.idcsAmortization),
        idcsCurrentExpensing: d(input.scheduleC.expenses.idcsCurrentExpensing),
        section179Expense: d(input.scheduleC.expenses.section179Expense),
        insurance: d(input.scheduleC.expenses.insurance),
        laundryAndCleaning: d(input.scheduleC.expenses.laundryAndCleaning),
        legalAndProfessional: d(input.scheduleC.expenses.legalAndProfessional),
        managementFees: d(input.scheduleC.expenses.managementFees),
        officeExpense: d(input.scheduleC.expenses.officeExpense),
        pensionAndProfitSharing: d(input.scheduleC.expenses.pensionAndProfitSharing),
        postage: d(input.scheduleC.expenses.postage),
        rentOnBusinessProperty: d(input.scheduleC.expenses.rentOnBusinessProperty),
        repairsAndMaintenance: d(input.scheduleC.expenses.repairsAndMaintenance),
        startupCostsDirectExpense: d(input.scheduleC.expenses.startupCostsDirectExpense),
        supplies: d(input.scheduleC.expenses.supplies),
        taxes: d(input.scheduleC.expenses.taxes),
        telephone: d(input.scheduleC.expenses.telephone),
        travel: d(input.scheduleC.expenses.travel),
        meals: d(input.scheduleC.expenses.meals),
        utilities: d(input.scheduleC.expenses.utilities),
        wages: d(input.scheduleC.expenses.wages),
        otherExpenses: d(input.scheduleC.expenses.otherExpenses),
      }
      : undefined,
    homeOffice: input.scheduleC.homeOffice
      ? {
        method: input.scheduleC.homeOffice.method,
        squareFeet: input.scheduleC.homeOffice.squareFeet,
        actualAmount: input.scheduleC.homeOffice.actualAmount
          ? d(input.scheduleC.homeOffice.actualAmount)
          : undefined,
        form8829: input.scheduleC.homeOffice.form8829,
      }
      : undefined,
  }).line39;
}

/** Class 4: Net business income bucketed by spouse for PA joint-return loss limitation */
function mapBusinessIncomeByOwner(
  input: TaxYearInput,
  heuristicK1Input: TaxYearInput,
  options: {
    scheduleF?: PAScheduleFResult;
    scheduleRK1?: PAScheduleRK1Result;
    businessRentals?: ReadonlySet<RentalProperty>;
  } = {},
): PAClass4IncomeByOwner {
  let primary = new Decimal(0);
  let spouse = new Decimal(0);

  const addAmount = (amount: Decimal, accountHolder?: PAClass4Owner) => {
    if (getPAClass4Owner(accountHolder) === "spouse") {
      spouse = spouse.plus(amount);
      return;
    }

    primary = primary.plus(amount);
  };

  if (input.scheduleC) {
    addAmount(calculatePAScheduleCNetIncome(input), input.scheduleC.accountHolder);
  }

  if (options.scheduleF && input.scheduleF) {
    addAmount(options.scheduleF.line39, input.scheduleF.accountHolder);
  }

  // 1099-NEC flows to Schedule C as self-employment income.
  // When no Schedule C exists, the supported slice defaults any ownerless
  // standalone 1099-NEC income to the primary-filer bucket.
  if (!input.scheduleC) {
    for (const nec of input.form1099Nec) {
      addAmount(d(nec.nonemployeeCompensation));
    }
  }

  // K-1 Box 1 (ordinary income) + Box 4 (guaranteed payments)
  for (const k1 of heuristicK1Input.scheduleK1) {
    addAmount(d(k1.ordinaryIncome).plus(d(k1.guaranteedPayments)), k1.accountHolder);
  }

  // When Schedule C is present, 1099-K business income is assumed included in
  // grossReceipts. Otherwise the supported slice defaults ownerless receipts to
  // the primary-filer bucket.
  if (!input.scheduleC) {
    for (const form of input.form1099K) {
      const type = form.incomeType ?? "business";
      if (type === "business" || type === "farm" || type === "other") {
        addAmount(d(form.grossAmount));
      }
    }
  }

  // Apply the actual ownership share and owner before separate Class4 limits.
  // Legacy unconfirmed ownerless previews retain their historical bucket.
  for (const property of input.rentalProperties) {
    if (options.businessRentals?.has(property)) {
      addAmount(calculatePARentalIncomeExpenses(property, input.taxpayer.taxYear).netIncome, property.accountHolder === "spouse" ? "spouse" : "primary");
    }
  }

  for (const statement of options.scheduleRK1?.statements ?? []) {
    addAmount(statement.businessIncome, statement.accountHolder);
  }

  const reportable = input.taxpayer.filingStatus === "married_filing_jointly"
    ? zeroFloor(primary).plus(zeroFloor(spouse))
    : primary.plus(spouse);

  return {
    primary,
    spouse,
    reportable,
  };
}

/** Class 6: Net rental/royalty income — rental properties + 1099-MISC + K-1 */
function calculateResidentPAScheduleE(
  input: TaxYearInput,
  additionalScheduleK1: readonly ScheduleK1[] = [],
  businessRentals: ReadonlySet<RentalProperty> = new Set(),
) {
  return calculatePAScheduleE({
    taxYear: input.taxpayer.taxYear,
    filingStatus: input.taxpayer.filingStatus,
    rentalProperties: input.rentalProperties.filter(
      (property) => !businessRentals.has(property),
    ),
    form1099Misc: input.form1099Misc,
    scheduleK1: [...input.scheduleK1, ...additionalScheduleK1],
  });
}

// ---------------------------------------------------------------------------
// Additional income class mappers (Form 4137, 8919, home sales, 6252, 6781)
// ---------------------------------------------------------------------------

/** Class 1 addition: Form 4137 unreported tip income → compensation */
function mapUnreportedTips(input: TaxYearInput): Decimal {
  if (!input.form4137) return new Decimal(0);
  return d(input.form4137.unreportedTipIncome);
}

/** Class 1 addition: Form 8919 wages not reported on W-2 → compensation */
function mapUncollectedWages(input: TaxYearInput): Decimal {
  if (!input.form8919) return new Decimal(0);
  return d(input.form8919.wagesNotReportedOnW2);
}

/**
 * Supported home-sale exclusions for Schedule SP eligibility income.
 * PA Schedule SP Line 8 includes gain excluded from the sale of a residence.
 */
function mapExcludedHomeSaleGainForScheduleSP(input: TaxYearInput): Decimal {
  if (input.homeSales.length === 0) return new Decimal(0);
  const taxYear = input.taxpayer.taxYear;
  const constants = TAX_CONSTANTS[taxYear];
  if (!constants) throw new Error(`Home-sale exclusion rules are unavailable for tax year ${taxYear}.`);

  const result = calculateHomeSales(
    input.homeSales,
    input.taxpayer.filingStatus,
    constants.homeSaleExclusion,
  );

  return sum(...result.sales.map((sale) => sale.excludableGain));
}

// ---------------------------------------------------------------------------
// PA-specific income exclusions
// ---------------------------------------------------------------------------

/**
 * US government obligation interest exempt from PA tax.
 * 1099-INT Box 3 is separate from Box 1 and exempt from PA income tax.
 * Reference: 72 Pa.C.S. § 7303(a)(2)
 */
function mapUSGovExemptInterest(input: TaxYearInput): Decimal {
  return input.form1099Int.reduce(
    (acc, f) => acc.plus(d(f.usSavingsBondInterest)),
    new Decimal(0),
  );
}

/** PA-40 line13: actual source state is required for every nonzero withholding. */
function mapStateWithholding(input: TaxYearInput): Decimal {
  const sourceRows = [
    ...input.w2s.map(source => ({ state: source.state, amount: source.stateTaxWithheld })),
    ...[...input.formW2G, ...input.form1099G, ...input.form1099K, ...(input.form1099R ?? []),
      ...input.form1099Int, ...input.form1099Div, ...input.form1099Misc,
      ...input.form1099Nec, ...(input.form1099B ?? [])].map(source => ({ state: source.state, amount: source.stateWithheld })),
  ];
  return sourceRows.reduce((total, row) => {
    const amount = d(row.amount);
    const actualState = row.state?.trim().toUpperCase();
    if (!actualState && !amount.isZero()) throw new Error("PA withholding needs the actual source state for every nonzero statement amount.");
    return actualState === "PA" ? total.plus(amount) : total;
  }, new Decimal(0));
}

/** Local EIT withholding from W-2 Box 19 */
function mapLocalWithholding(input: TaxYearInput): Decimal {
  let total = new Decimal(0);
  for (const w2 of input.w2s) {
    total = total.plus(d(w2.localTaxWithheld));
  }
  return total;
}

// ---------------------------------------------------------------------------
// 1099-R Retirement distribution PA mapping
// ---------------------------------------------------------------------------

/** Distribution codes for direct rollovers — not income at all */
const ROLLOVER_CODES = new Set(["G", "H"]);

/** Distribution codes exempt from PA tax (normal retirement, disability, death) */
const PA_EXEMPT_CODES = new Set(["7", "3", "4"]);

/** Distribution codes the 2025 PA PIT Guide treats as non-taxable informational records */
const PA_INFORMATIONAL_EXEMPT_CODES = new Set(["E", "N", "R"]);

/** Distribution codes that are taxable for PA (early/premature distributions) */
const PA_TAXABLE_CODES = new Set(["1", "2", "J", "S"]);

interface PARetirementResult {
  /** Taxable amount to add to Class 1 (compensation) — from employer plans */
  taxableAsCompensation: Decimal;
  /** Taxable amount to add to Class 2 (interest) — from IRA/SEP/SIMPLE */
  taxableAsInterest: Decimal;
  /** Schedule A Line 11 subset: Box 7 code D paired with another code */
  codeDPairedInterest: Decimal;
  /** Supported 1099-R amounts that the Schedule SP instructions require in eligibility income */
  scheduleSPNontaxableAmount: Decimal;
}

function getPrimaryDistributionCode(form: Form1099R): string {
  return (form.distributionCode ?? "").toUpperCase().charAt(0);
}

function getDistributionCodes(form: Form1099R): Set<string> {
  return new Set(
    (form.distributionCode ?? "")
      .toUpperCase()
      .replace(/\s+/g, "")
      .split("")
      .filter(Boolean),
  );
}

const PA_ALWAYS_EXEMPT_PUBLIC_RETIREMENT_PAYER_ALIASES = [
  "STATE EMPLOYEES RETIREMENT SYSTEM",
  "PENNSYLVANIA SCHOOL EMPLOYEES RETIREMENT SYSTEM",
  "PUBLIC SCHOOL EMPLOYEES RETIREMENT SYSTEM",
  "PENNSYLVANIA PUBLIC SCHOOL EMPLOYEES RETIREMENT SYSTEM",
  "PENNSYLVANIA MUNICIPAL EMPLOYEES RETIREMENT SYSTEM",
  "U S CIVIL SERVICE COMMISSION RETIREMENT DISABILITY PLAN",
  "CIVIL SERVICE RETIREMENT DISABILITY PLAN",
] as const;

function isAlwaysExemptPAPublicRetirementDistribution(form: Form1099R): boolean {
  const normalizedPayer = (form.payer ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalizedPayer.length === 0) {
    return false;
  }

  return (
    PA_ALWAYS_EXEMPT_PUBLIC_RETIREMENT_PAYER_ALIASES.some((alias) => normalizedPayer.includes(alias))
    || /\bPSERS\b/.test(normalizedPayer)
    || /\bSERS\b/.test(normalizedPayer)
    || /\bPMRS\b/.test(normalizedPayer)
  );
}

function isQualifiedRothDistribution(form: Form1099R): boolean {
  if (form.qualifiedRothDistribution) return true;
  const code = getPrimaryDistributionCode(form);
  return code === "Q";
}

function isQualifiedJointSurvivorAnnuityDistribution(form: Form1099R): boolean {
  return getPrimaryDistributionCode(form) === "7" && form.qualifiedJointSurvivorAnnuity;
}

/**
 * Map 1099-R retirement distributions with PA-specific exemption rules.
 *
 * PA exempts most retirement income:
 *  - Normal (code 7), disability (3), death (4): EXEMPT
 *  - Qualified Roth (Q, or T/B with qualifiedRothDistribution): EXEMPT
 *  - Rollovers (G, H): NOT INCOME — excluded entirely
 *  - EPCRS and IRA recharacterization records (E, N, R): EXEMPT
 *  - Early distributions (1, 2, J, S): TAXABLE
 *    - IRA/SEP/SIMPLE → Class 2 (interest)
 *    - Employer plans → Class 1 (compensation)
 *
 * For Schedule SP eligibility income, the 2025 instructions exclude Social
 * Security, Railroad Retirement, and ordinary retirement benefits, but still
 * require qualified joint survivor annuity benefits reported with Box 7 code 7
 * to be included. The supported automatic 1099-R carry therefore includes
 * Box 7 code 4 death benefits plus code 7 distributions explicitly marked as
 * qualified joint survivor annuities on the normalized input.
 */
function mapRetirementDistributions(input: TaxYearInput): PARetirementResult {
  let taxableAsCompensation = new Decimal(0);
  let taxableAsInterest = new Decimal(0);
  let codeDPairedInterest = new Decimal(0);
  let scheduleSPNontaxableAmount = new Decimal(0);

  const forms = input.form1099R ?? [];

  for (const form of forms) {
    const gross = d(form.grossDistribution);
    const primaryCode = getPrimaryDistributionCode(form);
    const distributionCodes = getDistributionCodes(form);
    const taxable = resolveForm1099RTaxableAmount(form);

    // Rollovers (G, H): not income — exclude from everything
    if (ROLLOVER_CODES.has(primaryCode)) {
      continue;
    }

    const qualifiedJointSurvivorAnnuity = isQualifiedJointSurvivorAnnuityDistribution(form);

    // Certain public retirement systems stay exempt regardless of Box 7 code.
    if (isAlwaysExemptPAPublicRetirementDistribution(form)) {
      if (primaryCode === "4" || qualifiedJointSurvivorAnnuity) {
        scheduleSPNontaxableAmount = scheduleSPNontaxableAmount.plus(gross);
      }
      continue;
    }

    // PA Schedule A Line 11 treats any Box 7 code D paired with another code
    // as PA-taxable interest to the extent it is federally taxable, unless
    // the distribution is from one of PA's always-exempt public retirement systems.
    if (distributionCodes.has("D") && distributionCodes.size > 1) {
      taxableAsInterest = taxableAsInterest.plus(taxable);
      codeDPairedInterest = codeDPairedInterest.plus(taxable);
      continue;
    }

    if (PA_INFORMATIONAL_EXEMPT_CODES.has(primaryCode)) {
      continue;
    }

    // Qualified Roth distributions: EXEMPT from PA tax
    if (isQualifiedRothDistribution(form)) {
      continue;
    }

    // PA taxes pre-retirement disability pensions as compensation.
    if (primaryCode === "3" && form.disabilityPensionBeforeMinimumRetirementAge) {
      taxableAsCompensation = taxableAsCompensation.plus(taxable);
      continue;
    }

    // Schedule SP includes code 4 death benefits and flagged code 7 survivor annuities.
    if (primaryCode === "4" || qualifiedJointSurvivorAnnuity) {
      scheduleSPNontaxableAmount = scheduleSPNontaxableAmount.plus(gross);
    }

    // Normal/disability/death distributions: EXEMPT from PA tax
    if (PA_EXEMPT_CODES.has(primaryCode)) {
      continue;
    }

    if (PA_TAXABLE_CODES.has(primaryCode)) {
      if (form.iraSepSimple) {
        // IRA/SEP/SIMPLE → Class 2 (interest)
        taxableAsInterest = taxableAsInterest.plus(taxable);
      } else {
        // Employer plan → Class 1 (compensation)
        taxableAsCompensation = taxableAsCompensation.plus(taxable);
      }
      continue;
    }

    // Unknown/other codes: default to taxable treatment
    if (form.iraSepSimple) {
      taxableAsInterest = taxableAsInterest.plus(taxable);
    } else {
      taxableAsCompensation = taxableAsCompensation.plus(taxable);
    }
  }

  return { taxableAsCompensation, taxableAsInterest, codeDPairedInterest, scheduleSPNontaxableAmount };
}

// ---------------------------------------------------------------------------
// Schedule F farm income mapping
// ---------------------------------------------------------------------------

/** Schedule F result when farm input is provided */
function calculatePAFarmSchedule(input: TaxYearInput): PAScheduleFResult | undefined {
  if (!input.scheduleF) return undefined;
  return calculatePAScheduleF({
    taxYear: input.taxpayer.taxYear,
    ...input.scheduleF,
  });
}

/** Automatic nontaxable income additions for Schedule SP eligibility other than 1099-R and home sale logic */
function mapNontaxableIncome(
  input: TaxYearInput,
  paExemptInterestDividends: Decimal = new Decimal(0),
): Decimal {
  let total = new Decimal(0);

  for (const w2 of input.w2s) {
    if (!isExemptActiveDutyMilitaryCompensation(w2) || isCombatOrHazardousDutyMilitaryPay(w2)) {
      continue;
    }
    total = total.plus(getPAResidentW2CompensationBeforeMilitaryExclusion(w2));
  }

  total = total.plus(paExemptInterestDividends);

  return total;
}

function mapScheduleGLStatements(input: TaxYearInput): OtherStateCredit[] {
  return (input.paScheduleGLStatements ?? []).map((statement) => ({
    stateCode: statement.stateCode.toUpperCase(),
    incomeTaxableByBothStates: d(statement.incomeTaxableByBothStates),
    taxPaidToOtherState: d(statement.taxPaidToOtherState),
  }));
}

function getPAPassThroughStatementKey(entityName: string, entityEIN: string): string {
  return `${entityEIN.trim().toUpperCase()}::${entityName.trim().toUpperCase()}`;
}

function getPAPassThroughStatementEntityKeys(
  statements: readonly PAPassThroughStatement[] | undefined,
): Set<string> {
  return new Set((statements ?? []).map((statement) => (
    getPAPassThroughStatementKey(statement.entityName, statement.entityEIN)
  )));
}

function getHeuristicScheduleK1Input(input: TaxYearInput): TaxYearInput {
  const statementEntityKeys = getPAPassThroughStatementEntityKeys(input.paPassThroughStatements);
  if (statementEntityKeys.size === 0) {
    return input;
  }

  const filteredScheduleK1 = input.scheduleK1.filter((k1) => !statementEntityKeys.has(
    getPAPassThroughStatementKey(k1.partnershipName, k1.partnershipEIN),
  ));

  return filteredScheduleK1.length === input.scheduleK1.length
    ? input
    : { ...input, scheduleK1: filteredScheduleK1 };
}

function buildScheduleEK1FromPAPassThroughStatement(statement: PAPassThroughStatement): ScheduleK1 {
  return {
    partnershipName: statement.entityName,
    partnershipEIN: statement.entityEIN,
    accountHolder: statement.accountHolder,
    ordinaryIncome: "0",
    netRentalIncome: statement.netRentalIncome ?? "0",
    entityType: "partnership",
    foreignTaxCategory: "general",
    section199AIsSST: false,
    section199APTPIsSST: false,
    isPassiveActivity: false,
    isPubliclyTradedPartnership: false,
    ptpFullyDisposedInTaxableTransaction: false,
    isForeignPartnership: false,
  } as ScheduleK1;
}

export function calculatePAReturn(
  input: TaxYearInput,
  overrides: PAOrchestratorOverrides = {},
): PAOrchestratorResult {
  const taxYear = input.taxpayer.taxYear;
  const ZERO = new Decimal(0);
  const hasFederalConstantsForYear = TAX_CONSTANTS[taxYear] !== undefined;
  const resolvedOverrides = resolvePAResidentOverrides(input, overrides);
  assertValidScheduleSPDependencyFilingStatus(input.taxpayer, resolvedOverrides);
  let federalResult: ReturnType<typeof calculateFederalTax> | undefined;

  const getFederalResult = () => {
    federalResult ??= calculateFederalTax(input);
    return federalResult;
  };

  const getFederalLineValue = (form: string, line: string): Decimal => (
    getFederalResult().allLines.find((entry) => entry.form === form && entry.line === line)?.value ?? ZERO
  );

  const getFederalLineValueFromCandidates = (form: string, lines: readonly string[]): Decimal => {
    for (const line of lines) {
      const value = getFederalLineValue(form, line);
      if (!value.isZero()) {
        return value;
      }
    }
    return ZERO;
  };

  const isNonJointReturn = input.taxpayer.filingStatus !== "married_filing_jointly";

  const getScheduleOFederalDefaults = () => {
    if (!isNonJointReturn) {
      return undefined;
    }

    const adjustments = input.adjustments;
    const hasRawSupportedScheduleODeductions = adjustments?.archerMSADeduction !== undefined
      || adjustments?.hsaDeduction !== undefined
      || adjustments?.studentLoanInterest !== undefined;

    if (!hasFederalConstantsForYear) {
      if (!resolvedOverrides.scheduleO && !hasRawSupportedScheduleODeductions) {
        return undefined;
      }

      return {
        medicalSavingsAccountDeduction: d(adjustments?.archerMSADeduction),
        healthSavingsAccountDeduction: d(adjustments?.hsaDeduction),
        studentLoanInterestDeduction: d(adjustments?.studentLoanInterest),
      };
    }

    const schedule1 = getFederalResult().schedule1;

    return {
      medicalSavingsAccountDeduction: schedule1?.archerMSADeduction ?? d(adjustments?.archerMSADeduction),
      healthSavingsAccountDeduction: schedule1?.hsaDeduction ?? d(adjustments?.hsaDeduction),
      studentLoanInterestDeduction: schedule1?.studentLoanInterest ?? d(adjustments?.studentLoanInterest),
    };
  };

  const getScheduleAFederalDefaults = () => {
    const needsNonEducational529Default =
      resolvedOverrides.scheduleA?.nonEducational529Distributions === undefined
      && (input.form1099Q ?? []).length > 0;
    const needsTaxableHealthMedicalSavingsDefault =
      resolvedOverrides.scheduleA?.taxableHealthMedicalSavingsDistributions === undefined
      && (input.form8889 !== undefined || input.form8889ByOwner !== undefined);
    const needsCoverdellInterestDefault = (input.form1099Q ?? []).some(
      (form) => form.accountType === "coverdell_esa",
    );

    if (
      !needsNonEducational529Default
      && !needsTaxableHealthMedicalSavingsDefault
      && !needsCoverdellInterestDefault
    ) {
      return {
        nonEducational529Distributions: ZERO,
        taxableHealthMedicalSavingsDistributions: ZERO,
        coverdellTaxableInterest: ZERO,
      };
    }

    const federal = getFederalResult();
    const ownerSpecificForm8889Results = Object.values(federal.form8889ByOwner ?? {}).filter(
      (result): result is NonNullable<typeof result> => result !== undefined,
    );
    const form1099QForms = input.form1099Q ?? [];
    const taxable1099QForms = form1099QForms.filter((form) => !form.isTrusteeToTrustee);
    const has529Distributions = taxable1099QForms.some((form) => form.accountType === "529");
    const hasCoverdellDistributions = taxable1099QForms.some(
      (form) => form.accountType === "coverdell_esa",
    );
    let nonEducational529Distributions = ZERO;
    let coverdellTaxableInterest = ZERO;

    if (federal.form1099Q?.taxableEarnings?.greaterThan(0)) {
      if (has529Distributions && !hasCoverdellDistributions) {
        nonEducational529Distributions = federal.form1099Q.taxableEarnings;
      } else if (!has529Distributions && hasCoverdellDistributions) {
        coverdellTaxableInterest = federal.form1099Q.taxableEarnings;
      } else if (has529Distributions && hasCoverdellDistributions) {
        // PIT Bulletin 2006-04 says remaining qualified education expenses are
        // allocated pro rata between mixed Coverdell ESA and QTP distributions.
        const total529Earnings = sum(
          ...taxable1099QForms
            .filter((form) => form.accountType === "529")
            .map((form) => d(form.earnings)),
        );
        const excessRatio = federal.form1099Q.taxableGrossDistribution.greaterThan(0)
          ? federal.form1099Q.taxableGrossDistribution
            .minus(federal.form1099Q.adjustedQEE)
            .div(federal.form1099Q.taxableGrossDistribution)
          : ZERO;
        const raw529TaxableEarnings = total529Earnings.greaterThan(0)
          ? total529Earnings
            .times(Decimal.max(ZERO, excessRatio))
            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
          : ZERO;

        nonEducational529Distributions = Decimal.min(
          federal.form1099Q.taxableEarnings,
          zeroFloor(raw529TaxableEarnings),
        );
        coverdellTaxableInterest = zeroFloor(
          federal.form1099Q.taxableEarnings.minus(nonEducational529Distributions),
        );
      }
    }

    return {
      nonEducational529Distributions: needsNonEducational529Default
        ? nonEducational529Distributions
        : ZERO,
      taxableHealthMedicalSavingsDistributions: needsTaxableHealthMedicalSavingsDefault
        ? (
          ownerSpecificForm8889Results.length > 0
        ? sum(...ownerSpecificForm8889Results.map((result) => result.line16))
        : (federal.form8889?.line16 ?? ZERO)
        )
        : ZERO,
      coverdellTaxableInterest,
    };
  };

  // -------------------------------------------------------------------------
  // Step 1: Map income classes from input documents
  // -------------------------------------------------------------------------

  // 1099-R retirement distributions (PA-specific exemption rules)
  const retirement = mapRetirementDistributions(input);
  const heuristicK1Input = getHeuristicScheduleK1Input(input);
  const paPassThroughStatements = input.paPassThroughStatements;
  const scheduleRK1 = paPassThroughStatements?.length
    ? calculatePAScheduleRK1({
        taxYear,
        statements: paPassThroughStatements,
      })
    : undefined;
  const scheduleERK1Statements = paPassThroughStatements?.map(buildScheduleEK1FromPAPassThroughStatement) ?? [];

  const scheduleAFederalDefaults = getScheduleAFederalDefaults();
  const compensation = mapCompensation(input)
    .plus(retirement.taxableAsCompensation)
    .plus(mapUnreportedTips(input))
    .plus(mapUncollectedWages(input));

  const oidSources = calculatePAOIDSources(input.form1099OID ?? [], resolvedOverrides.scheduleA?.oidSources, taxYear);
  const usGovExemptInterest = mapUSGovExemptInterest(input).plus(oidSources.usGovernmentInterest);
  const federalSavingsBondExclusion = input.savingsBondRedemptions.length > 0
    ? getFederalResult().form8815?.excludableSavingsBondInterest ?? ZERO
    : ZERO;
  const previouslyReportedBondInterest = input.savingsBondRedemptions.length > 0
    ? getFederalResult().scheduleB?.previouslyReportedSavingsBondInterest ?? ZERO
    : ZERO;
  const fullFederalScheduleK1Interest = mapFederalScheduleK1Interest(input);
  const paPassThroughInterestForScheduleA = mapFederalScheduleK1Interest(heuristicK1Input)
    .plus(scheduleRK1?.totalInterestIncome ?? ZERO);
  const scheduleAInput: PAScheduleAInput = {
    taxYear,
    federalInterestIncome: mapFederalInterestIncome(input).plus(fullFederalScheduleK1Interest)
      .minus(previouslyReportedBondInterest).minus(federalSavingsBondExclusion).plus(oidSources.federalTaxableInterest),
    taxExemptInterest: mapTaxExemptInterestIncludedInFederalReturn(input).plus(oidSources.federalTaxExemptInterest),
    additionAdjustments: [...resolvedOverrides.scheduleA?.additionAdjustments ?? [],
      ...(oidSources.federalPremiumAddback.isZero() ? [] : [{ description: "OID federal bond premium amortization", amount: oidSources.federalPremiumAddback }])],
    federalScheduleK1Interest: fullFederalScheduleK1Interest,
    paObligationInterest: resolvedOverrides.scheduleA?.paObligationInterest
      ?? mapPADirectObligationInterest(input).plus(oidSources.paDirectObligationInterest),
    usGovernmentInterest: zeroFloor(usGovExemptInterest.minus(previouslyReportedBondInterest)
      .minus(federalSavingsBondExclusion)),
    reductionAdjustments: [...resolvedOverrides.scheduleA?.reductionAdjustments ?? [],
      ...(oidSources.paPremiumReduction.isZero() ? [] : [{ description: "OID PA bond premium amortization", amount: oidSources.paPremiumReduction }])],
    forfeitedInterestPenalty: resolvedOverrides.scheduleA?.forfeitedInterestPenalty
      ?? mapSupportedPAForfeitedInterestPenalty(input).plus(oidSources.forfeitedInterestPenalty),
    annuityAndEndowmentDistributions: (resolvedOverrides.scheduleA?.annuityAndEndowmentDistributions ?? ZERO)
      .plus(retirement.codeDPairedInterest),
    charitableGiftAnnuityIncome: resolvedOverrides.scheduleA?.charitableGiftAnnuityIncome,
    nonEducational529Distributions:
      resolvedOverrides.scheduleA?.nonEducational529Distributions
      ?? scheduleAFederalDefaults.nonEducational529Distributions,
    taxableHealthMedicalSavingsDistributions:
      resolvedOverrides.scheduleA?.taxableHealthMedicalSavingsDistributions
      ?? scheduleAFederalDefaults.taxableHealthMedicalSavingsDistributions,
    paPassThroughInterest: paPassThroughInterestForScheduleA,
  };
  const scheduleA = calculatePAScheduleA(scheduleAInput);
  const interest = scheduleA.line16.plus(
    retirement.taxableAsInterest.minus(retirement.codeDPairedInterest),
  ).plus(scheduleAFederalDefaults.coverdellTaxableInterest);

  const fullFederalScheduleK1Dividends = mapFederalScheduleK1Dividends(input);
  const paPassThroughDividendsForScheduleB = mapFederalScheduleK1Dividends(heuristicK1Input)
    .plus(scheduleRK1?.totalDividendIncome ?? ZERO);
  const scheduleBInput: PAScheduleBInput = {
    taxYear,
    federalDividendIncome: mapFederalDividendIncome(input),
    federalScheduleK1Dividends: fullFederalScheduleK1Dividends,
    paExemptInterestDividends: resolvedOverrides.scheduleB?.paExemptInterestDividends
      ?? mapPAExemptInterestDividendAllocation(input),
    reductionAdjustments: resolvedOverrides.scheduleB?.reductionAdjustments,
    exemptInterestDividends: mapExemptInterestDividends(input),
    additionAdjustments: resolvedOverrides.scheduleB?.additionAdjustments,
    repatriationTransitionTaxBase: resolvedOverrides.scheduleB?.repatriationTransitionTaxBase,
    repatriationPriorYearPayments: resolvedOverrides.scheduleB?.repatriationPriorYearPayments,
    repatriationCurrentYearPayments: resolvedOverrides.scheduleB?.repatriationCurrentYearPayments,
    capitalGainDistributions: mapCapitalGainDistributions(input),
    paPassThroughDividends: paPassThroughDividendsForScheduleB,
  };
  const scheduleB = calculatePAScheduleB(scheduleBInput);
  const dividends = scheduleB.line12;
  const scheduleF = calculatePAFarmSchedule(input);
  const rentalClassifications = input.rentalProperties.map(property => calculatePARentalClassification(property, taxYear));
  const rentalIncomeWorksheets = input.rentalProperties.map(property => calculatePARentalIncomeExpenses(property, taxYear));
  const businessRentals = new Set(input.rentalProperties.filter((_, index) => rentalClassifications[index].isBusiness));
  const class4BusinessIncome = mapBusinessIncomeByOwner(input, heuristicK1Input, {
    scheduleF,
    scheduleRK1,
    businessRentals,
  });
  const netBusinessIncome = class4BusinessIncome.reportable;
  const scheduleD = calculatePAScheduleD({
    taxYear,
    filingStatus: input.taxpayer.filingStatus,
    form1099B: input.form1099B,
    scheduleK1: heuristicK1Input.scheduleK1,
    paPassThroughStatements,
    homeSales: input.homeSales,
    form6252: input.form6252,
    form6781: input.form6781,
    ...resolvedOverrides.scheduleD,
  });
  const netGainOrLoss = scheduleD.reportableNetGainOrLoss;
  const scheduleE = calculateResidentPAScheduleE(heuristicK1Input, scheduleERK1Statements, businessRentals);
  const netRentalIncome = scheduleE.reportableNetRentalRoyaltyIncome.plus(map1099KRental(input));
  let scheduleJ: ScheduleJResult | undefined;
  const scheduleRK1EstateTrustIncome = scheduleRK1?.totalEstateTrustIncome ?? ZERO;
  let estateTrustIncome = (resolvedOverrides.estateTrustIncome ?? ZERO).plus(scheduleRK1EstateTrustIncome);
  const scheduleRK1NonresidentTaxWithheld = scheduleRK1?.totalNonresidentTaxWithheld ?? ZERO;
  let nonresidentTaxWithheld = resolvedOverrides.nonresidentTaxWithheld ?? scheduleRK1NonresidentTaxWithheld;
  if (input.paScheduleJStatements?.length) {
    scheduleJ = calculateScheduleJ({
      taxYear,
      statements: input.paScheduleJStatements,
    });
    estateTrustIncome = scheduleJ.totalEstateTrustIncome.plus(scheduleRK1EstateTrustIncome);
    if (resolvedOverrides.nonresidentTaxWithheld === undefined) {
      nonresidentTaxWithheld = scheduleRK1NonresidentTaxWithheld.plus(scheduleJ.totalNonresidentTaxWithheld);
    }
  }

  let scheduleT: PAScheduleTResult | undefined;
  if (input.formW2G.length > 0 || resolvedOverrides.scheduleT?.additionalEntries?.length) {
    scheduleT = calculatePAScheduleT({
      taxYear,
      w2gForms: input.formW2G.map((form) => ({
        payer: form.payer,
        accountHolder: form.accountHolder,
        reportableWinnings: d(form.reportableWinnings),
        typeOfWager: form.typeOfWager,
        prizeType: form.prizeType,
        stateWithheld: d(form.stateWithheld),
        state: form.state,
      })),
      additionalEntries: resolvedOverrides.scheduleT?.additionalEntries,
    });
  }

  const gamblingIncome = (scheduleT?.totalTaxableWinnings ?? ZERO)
    .plus(scheduleRK1?.totalGamblingIncome ?? ZERO);
  const paLotteryExempt = scheduleT?.exemptPALotteryNoncashWinnings ?? ZERO;
  const excludedHomeSaleGainForScheduleSP = mapExcludedHomeSaleGainForScheduleSP(input);

  const additionalStateWithholding = resolvedOverrides.additionalStateWithholding ?? ZERO;
  if (!additionalStateWithholding.isFinite() || additionalStateWithholding.isNegative()) {
    throw new Error("Additional PA withholding must be a finite nonnegative actual source amount.");
  }
  const stateWithholding = mapStateWithholding(input).plus(oidSources.stateWithholding).plus(additionalStateWithholding);

  // -------------------------------------------------------------------------
  // Step 1b: Schedule UE — Unreimbursed Employee Business Expenses
  // -------------------------------------------------------------------------

  let scheduleUEResult: ScheduleUEResult | undefined;
  let unreimbursedExpenses: Decimal;

  if (resolvedOverrides.scheduleUE) {
    scheduleUEResult = calculateScheduleUE(resolvedOverrides.scheduleUE);
    unreimbursedExpenses = scheduleUEResult.netUnreimbursedExpenses;
  } else {
    unreimbursedExpenses = resolvedOverrides.unreimbursedExpenses ?? ZERO;
  }

  // -------------------------------------------------------------------------
  // Step 2: Provisional PA-40 to derive Schedule O Line 9 when needed
  // -------------------------------------------------------------------------

  const provisionalPA40Input: PA40Input = {
    taxYear,
    compensation,
    unreimbursedExpenses,
    interest,
    dividends,
    netBusinessIncome,
    netGainOrLoss,
    netRentalIncome,
    estateTrustIncome,
    gamblingIncome,
    otherDeductions: ZERO,
    taxForgivenessEligibilityIncome: ZERO,
    useTax: resolvedOverrides.useTax ?? ZERO,
    stateWithholding,
    creditFromPriorYear: resolvedOverrides.creditFromPriorYear ?? ZERO,
    extensionPayment: resolvedOverrides.extensionPayment ?? ZERO,
    estimatedPayments: resolvedOverrides.estimatedPayments ?? ZERO,
    nonresidentTaxWithheld,
    refundableCredits: ZERO,
    // Credits are derived in later steps after dependent schedules are computed.
    taxForgivenessCredit: ZERO,
    residentCredit: ZERO,
    otherCredits: ZERO,
    underpaymentPenalty: ZERO,
    lateFilingOrPaymentPenalty: resolvedOverrides.lateFilingOrPaymentPenalty ?? ZERO,
    latePaymentInterest: resolvedOverrides.latePaymentInterest ?? ZERO,
  };

  const provisionalPA40 = calculatePA40(provisionalPA40Input);

  // -------------------------------------------------------------------------
  // Step 2b: Schedule O — Other Deductions
  // -------------------------------------------------------------------------

  let scheduleO: PAScheduleOResult | undefined;
  let otherDeductionsAmount = resolvedOverrides.otherDeductions ?? ZERO;
  const scheduleOFederalDefaults = getScheduleOFederalDefaults();
  const shouldAutoCreateScheduleO = !resolvedOverrides.scheduleO
    && !!scheduleOFederalDefaults
    && (
      scheduleOFederalDefaults.medicalSavingsAccountDeduction.greaterThan(0)
      || scheduleOFederalDefaults.healthSavingsAccountDeduction.greaterThan(0)
      || scheduleOFederalDefaults.studentLoanInterestDeduction.greaterThan(0)
    );

  if (resolvedOverrides.scheduleO || shouldAutoCreateScheduleO) {
    const scheduleOOverrides = resolvedOverrides.scheduleO;
    const scheduleOInput: PAScheduleOInput = {
      taxYear,
      qualifiedTuitionContributions: scheduleOOverrides?.qualifiedTuitionContributions,
      ableContributions: scheduleOOverrides?.ableContributions,
      medicalSavingsAccountDeduction:
        scheduleOOverrides?.medicalSavingsAccountDeduction
        ?? scheduleOFederalDefaults?.medicalSavingsAccountDeduction
        ?? ZERO,
      spouseMedicalSavingsAccountDeduction: scheduleOOverrides?.spouseMedicalSavingsAccountDeduction ?? ZERO,
      healthSavingsAccountDeduction:
        scheduleOOverrides?.healthSavingsAccountDeduction
        ?? scheduleOFederalDefaults?.healthSavingsAccountDeduction
        ?? ZERO,
      spouseHealthSavingsAccountDeduction: scheduleOOverrides?.spouseHealthSavingsAccountDeduction ?? ZERO,
      studentLoanInterestDeduction:
        scheduleOOverrides?.studentLoanInterestDeduction
        ?? scheduleOFederalDefaults?.studentLoanInterestDeduction
        ?? ZERO,
      spouseStudentLoanInterestDeduction: scheduleOOverrides?.spouseStudentLoanInterestDeduction ?? ZERO,
      taxpayerPATaxableIncome: scheduleOOverrides?.taxpayerPATaxableIncome ?? provisionalPA40.totalPATaxableIncome,
      spousePATaxableIncome: scheduleOOverrides?.spousePATaxableIncome ?? ZERO,
    };
    scheduleO = calculatePAScheduleO(scheduleOInput);
    otherDeductionsAmount = scheduleO.totalOtherDeductions;
  }

  // -------------------------------------------------------------------------
  // Step 2c: First-pass PA-40 to get gross tax liability
  // -------------------------------------------------------------------------

  const pa40Input: PA40Input = {
    ...provisionalPA40Input,
    otherDeductions: otherDeductionsAmount,
  };

  const firstPass = calculatePA40(pa40Input);
  const useTaxAmount = resolvedOverrides.useTax ?? (
    resolvedOverrides.useTaxWorksheet
      ? calculatePAUseTax({
          taxYear,
          paTaxableIncome: provisionalPA40.totalPATaxableIncome,
          ...resolvedOverrides.useTaxWorksheet,
        }).totalUseTaxLiability
      : ZERO
  );

  // -------------------------------------------------------------------------
  // Step 3: Schedule G-L — Resident Credit
  // -------------------------------------------------------------------------

  const effectiveOtherStateCredits = input.paScheduleGLStatements?.length
    ? mapScheduleGLStatements(input)
    : (resolvedOverrides.otherStateCredits ?? []);

  const scheduleGLInput: ScheduleGLInput = {
    taxYear,
    paTaxLiability: firstPass.taxLiability,
    otherStateCredits: effectiveOtherStateCredits,
  };

  const scheduleGL = calculateScheduleGL(scheduleGLInput);

  // -------------------------------------------------------------------------
  // Step 4: Schedule SP — Tax Forgiveness
  // -------------------------------------------------------------------------

  const autoNontaxable = mapNontaxableIncome(input, scheduleB.line3);
  const nontaxableIncome = (resolvedOverrides.nontaxableIncome ?? ZERO)
    .plus(autoNontaxable)
    .plus(scheduleA.line6)
    .plus(retirement.scheduleSPNontaxableAmount)
    .plus(usGovExemptInterest)
    .plus(excludedHomeSaleGainForScheduleSP)
    .plus(paLotteryExempt);
  const taxPaidToOtherStates = sum(
    ...effectiveOtherStateCredits.map((credit) => credit.taxPaidToOtherState),
  );
  const filingCategory = mapFilingCategory(input.taxpayer, resolvedOverrides);
  const additionalEligibilityIncome = (resolvedOverrides.additionalEligibilityIncome ?? ZERO).plus(
    filingCategory === "married"
      ? (resolvedOverrides.spouseEligibilityIncome ?? ZERO)
      : ZERO,
  );

  const scheduleSPInput: ScheduleSPInput = {
    taxYear,
    filingCategory,
    dependents: countPAScheduleSPDependentChildren(input.taxpayer),
    paTaxableIncome: firstPass.totalPATaxableIncome,
    nontaxableIncome,
    additionalEligibilityIncome,
    taxLiability: firstPass.taxLiability,
    taxPaidToOtherStates,
    isClaimedAsDependentOnAnotherFederalReturn: resolvedOverrides.isClaimedAsDependentOnAnotherFederalReturn,
    claimingHouseholdQualifiesForTaxForgiveness: resolvedOverrides.claimingHouseholdQualifiesForTaxForgiveness,
  };

  const scheduleSP = calculateScheduleSP(scheduleSPInput);

  // -------------------------------------------------------------------------
  // Step 4b: Schedule OC — Other Credits
  // -------------------------------------------------------------------------

  let scheduleOCResult: ScheduleOCResult | undefined;
  let otherCreditsAmount: Decimal;

  if (resolvedOverrides.scheduleOC) {
    const scheduleOCInput: ScheduleOCInput = {
      taxYear,
      ...resolvedOverrides.scheduleOC,
    };
    scheduleOCResult = calculateScheduleOC(scheduleOCInput);
    otherCreditsAmount = scheduleOCResult.totalOtherCredits;
  } else {
    otherCreditsAmount = resolvedOverrides.otherCredits ?? ZERO;
  }

  // -------------------------------------------------------------------------
  // Step 4c: Schedule DC — Child and Dependent Care Enhancement Credit
  // -------------------------------------------------------------------------

  let scheduleDC: ScheduleDCResult | undefined;
  let workingPennsylvaniansTaxCredit: PAWorkingPennsylvaniansTaxCreditResult | undefined;
  let refundableCreditsAmount = ZERO;
  let scheduleDCCreditAmount = ZERO;

  if (input.dependentCare) {
    const scheduleDCInput: ScheduleDCInput = {
      taxYear,
      qualifyingPersons: input.dependentCare.qualifyingIndividuals,
      paTaxableIncome: firstPass.totalPATaxableIncome,
      federalCredit: getFederalLineValueFromCandidates("Form 2441", ["9a", "9"]),
    };
    scheduleDC = calculateScheduleDC(scheduleDCInput);
    scheduleDCCreditAmount = scheduleDC.credit;
  }

  if (taxYear >= 2025) {
    workingPennsylvaniansTaxCredit = calculatePAWorkingPennsylvaniansTaxCredit({
      taxYear,
      paEarnedIncome: zeroFloor(compensation).plus(zeroFloor(netBusinessIncome)),
      federalEarnedIncomeCredit: getFederalLineValue("1040", "27a"),
      isClaimedAsDependentOnAnotherFederalReturn:
        resolvedOverrides.isClaimedAsDependentOnAnotherFederalReturn,
    });
    refundableCreditsAmount = refundableCreditsAmount.plus(workingPennsylvaniansTaxCredit.credit);
  }

  const allowedOtherCreditsAmount = calculatePA40AllowedOtherCredits({
    taxLiability: firstPass.taxLiability,
    taxForgivenessCredit: scheduleSP.taxForgivenessCredit,
    residentCredit: scheduleGL.totalCredit,
    otherCredits: otherCreditsAmount,
  });
  const finalOtherCreditsAmount = allowedOtherCreditsAmount.plus(scheduleDCCreditAmount);

  // -------------------------------------------------------------------------
  // Step 5: REV-1630 Underpayment Penalty (before final PA-40 so penalty flows in)
  // Tax liability (Line 12) is the same in first and final pass — only credits differ.
  // -------------------------------------------------------------------------

  let rev1630: REV1630Result | undefined;
  let underpaymentPenalty = ZERO;

  if (resolvedOverrides.quarterlyEstimatedPayments) {
    const normalizedQuarterlyEstimatedPayments: [Decimal, Decimal, Decimal, Decimal] = [
      resolvedOverrides.quarterlyEstimatedPayments[0].plus(resolvedOverrides.creditFromPriorYear ?? ZERO),
      resolvedOverrides.quarterlyEstimatedPayments[1],
      resolvedOverrides.quarterlyEstimatedPayments[2],
      resolvedOverrides.quarterlyEstimatedPayments[3].plus(resolvedOverrides.extensionPayment ?? ZERO),
    ];

    const rev1630Input: REV1630Input = {
      taxYear,
      taxLiability: firstPass.taxLiability,
      withholdingAndCredits: stateWithholding
        .plus(scheduleSP.taxForgivenessCredit)
        .plus(scheduleGL.totalCredit)
        .plus(allowedOtherCreditsAmount),
      quarterlyEstimatedPayments: normalizedQuarterlyEstimatedPayments,
      priorYear100PercentForgiveness: resolvedOverrides.priorYear100PercentForgiveness,
      priorYearPATaxableIncome: resolvedOverrides.priorYearPATaxableIncome,
      priorYearTaxForgivenessCredit: resolvedOverrides.priorYearTaxForgivenessCredit,
    };
    rev1630 = calculateREV1630(rev1630Input);
    underpaymentPenalty = rev1630.totalInterest;
  }

  // -------------------------------------------------------------------------
  // Step 6: Final PA-40 with all credits + penalty
  // -------------------------------------------------------------------------

  const finalPA40Input: PA40Input = {
    ...pa40Input,
    useTax: useTaxAmount,
    taxForgivenessEligibilityIncome: scheduleSP.eligibilityIncome,
    refundableCredits: refundableCreditsAmount,
    taxForgivenessCredit: scheduleSP.taxForgivenessCredit,
    residentCredit: scheduleGL.totalCredit,
    otherCredits: finalOtherCreditsAmount,
    underpaymentPenalty,
    lateFilingOrPaymentPenalty: resolvedOverrides.lateFilingOrPaymentPenalty ?? ZERO,
  };

  const pa40 = calculatePA40(finalPA40Input);

  // -------------------------------------------------------------------------
  // Step 7: Schedule SD (if school district inputs are provided)
  // -------------------------------------------------------------------------

  let scheduleSD: ScheduleSDResult | undefined;

  if (resolvedOverrides.scheduleSD) {
    scheduleSD = calculateScheduleSD({
      taxYear,
      method: resolvedOverrides.scheduleSD.method,
      schoolDistrictRate: resolvedOverrides.scheduleSD.schoolDistrictRate,
      paTotalTaxableIncome: pa40.totalPATaxableIncome,
      netCompensation: pa40.netCompensation,
      netBusinessIncome: pa40.netBusinessIncome,
      otherDeductions: pa40.otherDeductions,
      forgivenessPercentage: scheduleSP.forgivenessPercentage,
      schoolDistrictWithholding: resolvedOverrides.scheduleSD.schoolDistrictWithholding ?? ZERO,
      estimatedPayments: resolvedOverrides.scheduleSD.estimatedPayments ?? ZERO,
    });
  }

  // -------------------------------------------------------------------------
  // Step 8: Local EIT (if municipality rate is provided)
  // -------------------------------------------------------------------------

  const localWithholding = mapLocalWithholding(input);
  let localEIT: PALocalEITResult | undefined;

  if (resolvedOverrides.localEITRate && resolvedOverrides.localMunicipality) {
    const localEITCompensation = mapLocalEITCompensation(input)
      .plus(retirement.taxableAsCompensation)
      .plus(mapUnreportedTips(input))
      .plus(mapUncollectedWages(input));
    const localEITInput: PALocalEITInput = {
      taxYear,
      municipality: resolvedOverrides.localMunicipality,
      localEITRate: resolvedOverrides.localEITRate,
      compensation: localEITCompensation,
      netSelfEmploymentIncome: netBusinessIncome,
      nonresidentCredits: resolvedOverrides.localNonresidentCredits ?? [],
      localWithholding,
    };
    localEIT = calculatePALocalEIT(localEITInput);
  }

  return {
    pa40,
    scheduleSP,
    scheduleGL,
    scheduleRK1,
    scheduleJ,
    scheduleT,
    scheduleA,
    oidSources: input.form1099OID?.length ? oidSources : undefined,
    rentalClassifications,
    rentalIncomeWorksheets,
    scheduleB,
    scheduleF,
    scheduleD,
    scheduleE,
    scheduleUE: scheduleUEResult,
    scheduleO,
    scheduleDC,
    workingPennsylvaniansTaxCredit,
    scheduleOC: scheduleOCResult,
    scheduleSD,
    localEIT,
    rev1630,
    mappedIncome: {
      compensation,
      interest,
      dividends,
      netBusinessIncome,
      netGainOrLoss,
      netRentalIncome,
      estateTrustIncome,
      gamblingIncome,
    },
    exclusions: {
      usGovInterest: usGovExemptInterest,
      paLotteryWinnings: paLotteryExempt,
    },
    stateWithholding,
    localWithholding,
  };
}
