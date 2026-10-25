/**
 * Ohio Input Adapter — bridges federal tax documents and results to Ohio engine input.
 * Spec: spec/state/oh-input-adapter.yaml
 *
 * Extracts Ohio-relevant data from the standard TaxYearInput (W-2s, 1099-Rs)
 * and the federal TaxReturnResult to produce a ready-to-use OhioResidentReturnInput.
 *
 * Auto-extracted: Ohio withholding, SD withholding, Social Security, federal EIC,
 * retirement income, senior status, exemption count, qualifying income flag,
 * qualifying business income (from Schedule C, F, and K-1s via IT BUS).
 *
 * User-provided Ohio-specific fields (529 contributions, school districts, campaign
 * contributions, medical savings account worksheet inputs, etc.) are passed through
 * from an overlay input.
 */

import Decimal from "decimal.js";
import { calculateForm1099G } from "@/engine/forms/form-1099-g.js";
import type {
  TaxYearInput,
  W2,
  Form1099R,
  Form1099Int,
  Form1099Div,
  Form1099B,
  Form1099OID,
  Form1099G,
  Form1099K,
  Form1099Misc,
  Form1099Nec,
  FormW2G,
  ScheduleK1,
} from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import { OHIO_TAX_CONSTANTS, type FilingStatus } from "@/models/constants.js";
import type { OhioResidentReturnInput } from "@/engine/state/oh-return.js";
import type {
  OhioCollegeGrantRoomAndBoardEntry,
  OhioEducatorExpense,
  Ohio529Contribution,
  Ohio529Carryforward,
  OhioHomebuyerPlusAccountEntry,
  OhioPregnancyResourceCenterContribution,
  OhioQualifiedOrganDonorExpense,
  OhioStableContribution,
  OhioStableCarryforward,
} from "@/engine/state/oh-schedule-adjustments.js";
import type { SchoolDistrictEntry } from "@/engine/state/oh-sd-100.js";
import type { OtherStateTaxEntry } from "@/engine/state/oh-resident-credit.js";
import type { OhioLumpSumRetirementCreditRecipientInput } from "@/engine/state/oh-lump-sum-retirement-credit.js";
import type { OhioDisplacedWorkerCreditRecipientInput } from "@/engine/state/oh-schedule-credits.js";
import type { EstimatedPaymentEntry } from "@/engine/state/oh-it-sd-2210.js";
import {
  calculateOhioITBus,
  type OhioITBusResult,
} from "@/engine/state/oh-it-bus.js";
import {
  lookupOhioSchoolDistrictMetadata,
  lookupOhioSchoolDistrictMetadataByDistrictName,
  lookupOhioSchoolDistrictNumberFromLocalityLabel,
} from "@/engine/state/oh-school-district-lookup.js";
import { calculateOhioScheduleOfWithholding } from "@/engine/state/oh-schedule-of-withholding.js";
import { calculateForm1099OID } from "@/engine/forms/form-1099-oid.js";
import { d } from "@/utils/decimal.js";

// ---------------------------------------------------------------------------
// Ohio-specific overlay (fields that cannot be derived from federal data)
// ---------------------------------------------------------------------------

export interface OhioOverlayInput {
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
  /** Override auto-extracted qualifying business income (from IT BUS). */
  qualifyingBusinessIncome?: Decimal | string | number;
  /** Other qualifying business income not captured by auto-extraction (flows to IT BUS line 5). */
  otherBusinessIncome?: Decimal | string | number;
  /** Override auto-extracted federal interest exempt from Ohio (from 1099-INT box 3). */
  federalInterestExemptFromOhio?: Decimal | string | number;
  /** Override auto-extracted state/municipal tax refunds (from 1099-G box 2). */
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

  // --- Schedule of Credits ---
  federal2441Line9c?: Decimal | string | number;
  federal2441Line11?: Decimal | string | number;
  displacedWorkerExpenses?: Decimal | string | number;
  priorYearDisplacedWorkerCredit?: Decimal | string | number;
  displacedWorkerRecipients?: OhioDisplacedWorkerCreditRecipientInput[];
  campaignContributions?: Decimal | string | number;
  homeSchoolExpenses?: Decimal | string | number;
  homeSchoolQualifyingStudents?: number;
  scholarshipDonations?: Decimal | string | number;
  noncharteredSchoolTuition?: Decimal | string | number;
  /** Optional spouse-level qualifying income from the Ohio joint filing credit statement. */
  primaryQualifyingIncome?: Decimal | string | number;
  /** Optional spouse-level qualifying income from the Ohio joint filing credit statement. */
  spouseQualifyingIncome?: Decimal | string | number;
  /** Worksheet inputs for Ohio Schedule of Credits line 3. */
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
  /** Pass-through resident credit (overrides computed value). */
  residentCredit?: Decimal | string | number;
  refundableHistoricPreservationCredit?: Decimal | string | number;
  refundableJobCreationCredit?: Decimal | string | number;
  passThroughEntityCredit?: Decimal | string | number;
  refundableMotionPictureCredit?: Decimal | string | number;
  filmTheaterCapitalImprovementCredit?: Decimal | string | number;
  ventureCapitalCredit?: Decimal | string | number;

  // --- Resident credit ---
  otherStateTaxes?: OtherStateTaxEntry[];

  // --- IT 1040: overrides ---
  /** Override extracted Ohio withholding (e.g., if W-2 state field is missing). */
  ohioWithholdingOverride?: Decimal | string | number;
  /** Override extracted retirement income. */
  retirementIncomeOverride?: Decimal | string | number;
  /** Override senior status determination. */
  isSeniorOverride?: boolean;
  /** Override exemption count. */
  exemptionsOverride?: number;

  underpaymentPenalty?: Decimal | string | number;
  useTax?: Decimal | string | number;
  estimatedPayments?: Decimal | string | number;
  refundableCredits?: Decimal | string | number;
  amendedPriorOverpayment?: Decimal | string | number;
  latePaymentInterest?: Decimal | string | number;
  creditCarryforward?: Decimal | string | number;
  donations?: Decimal | string | number;
  computeUnderpaymentPenalty?: boolean;
  priorYearTaxLiability?: Decimal | string | number;
  priorYearTimelyFiled?: boolean;
  estimatedPaymentSchedule?: EstimatedPaymentEntry[];

  // --- SD 100 ---
  schoolDistricts?: SchoolDistrictEntry[];
  /** Override extracted SD withholding. */
  sdWithholdingOverride?: Decimal | string | number;
  sdUnderpaymentPenalty?: Decimal | string | number;
  sdPriorYearTaxLiability?: Decimal | string | number;
  sdPriorYearTimelyFiled?: boolean;
  sdEstimatedPayments?: Decimal | string | number;
  sdAmendedPriorOverpayment?: Decimal | string | number;
  sdLatePaymentInterest?: Decimal | string | number;
  sdCreditCarryforward?: Decimal | string | number;
}

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

/**
 * Sum Ohio income tax withholding reported on W-2, W-2G, and supported 1099 statements.
 *
 * Ohio IT 1040 line 14 flows from the Schedule of Ohio Withholding, which
 * includes Ohio amounts from W-2, W-2G, and 1099 income statements. This
 * adapter supports the modeled 1099 variants that can carry state withholding:
 * 1099-G, 1099-K, 1099-R, 1099-NEC, 1099-MISC, 1099-INT, 1099-DIV, and 1099-B.
 */
export function extractOhioWithholding(
  w2s: W2[],
  formW2Gs: FormW2G[] = [],
  form1099Gs: Form1099G[] = [],
  form1099Ks: Form1099K[] = [],
  form1099Rs: Form1099R[] = [],
  form1099Necs: Form1099Nec[] = [],
  form1099Miscs: Form1099Misc[] = [],
  form1099Ints: Form1099Int[] = [],
  form1099Divs: Form1099Div[] = [],
  form1099Bs: Form1099B[] = [],
  form1099OIDs: Form1099OID[] = [],
): Decimal {
  return calculateOhioScheduleOfWithholding({
    w2s,
    formW2Gs,
    form1099Gs,
    form1099Ks,
    form1099Rs,
    form1099Necs,
    form1099Miscs,
    form1099Ints,
    form1099Divs,
    form1099Bs,
    form1099OIDs,
  }).line6_totalOhioWithholding;
}

/**
 * Sum school district withholding from Ohio W-2s and supported 1099-R statements.
 *
 * The Ohio SD 100 booklet's Schedule of School District Withholding allows
 * withholding from income statements including W-2 and 1099 statements. The
 * modeled engine currently supports Ohio W-2 box 19 and an explicit Ohio
 * Form 1099-R local withholding field.
 */
export function extractSchoolDistrictWithholding(
  w2s: W2[],
  form1099Rs: Form1099R[] = [],
): Decimal {
  let total = new Decimal(0);
  for (const w2 of w2s) {
    if (
      w2.state?.toUpperCase() === "OH"
      && w2.localTaxWithheld
      && extractSchoolDistrictNumber(w2.localityName) !== null
    ) {
      total = total.plus(d(w2.localTaxWithheld));
    }
  }
  for (const form1099R of form1099Rs) {
    if (form1099R.state?.toUpperCase() === "OH" && form1099R.localTaxWithheld) {
      total = total.plus(d(form1099R.localTaxWithheld));
    }
  }
  return total;
}

function extractSchoolDistrictNumber(localityName: string | undefined): string | null {
  const trimmed = localityName?.trim();
  if (!trimmed) {
    return null;
  }

  if (/^R\d{3,4}$/i.test(trimmed)) {
    return null;
  }

  const numericMatch = trimmed.match(/^\d{1,4}$/);
  if (numericMatch) {
    return numericMatch[0]!.padStart(4, "0");
  }

  const schoolDistrictMatch = trimmed.match(/^SD\s*#?\s*(\d{1,4})(?:\b.*)?$/i);
  if (schoolDistrictMatch) {
    return schoolDistrictMatch[1]!.padStart(4, "0");
  }

  return lookupOhioSchoolDistrictNumberFromLocalityLabel(trimmed);
}

function lookupSchoolDistrictMetadataFromLocalityName(
  taxYear: number,
  localityName: string | undefined,
) {
  const districtNumber = extractSchoolDistrictNumber(localityName);
  return districtNumber
    ? lookupOhioSchoolDistrictMetadata(taxYear, districtNumber)
    : null;
}

function getSchoolDistrictWages(w2: W2): Decimal {
  const stateWages = d(w2.stateWages);
  return stateWages.greaterThan(0) ? stateWages : d(w2.wages);
}

function deriveSchoolDistrictsFromW2s(
  taxYear: number,
  w2s: W2[],
): SchoolDistrictEntry[] {
  const districts = new Map<string, SchoolDistrictEntry>();

  for (const w2 of w2s) {
    if (w2.state?.toUpperCase() !== "OH") {
      continue;
    }

    const metadata = lookupSchoolDistrictMetadataFromLocalityName(
      taxYear,
      w2.localityName,
    );
    if (!metadata) {
      continue;
    }

    const existing = districts.get(metadata.districtNumber);
    if (existing) {
      if (metadata.taxType === "earned_income") {
        existing.wages = d(existing.wages).plus(getSchoolDistrictWages(w2));
      }
      continue;
    }

    districts.set(metadata.districtNumber, {
      districtNumber: metadata.districtNumber,
      taxType: metadata.taxType,
      rate: metadata.rate,
      ...(metadata.taxType === "earned_income"
        ? { wages: getSchoolDistrictWages(w2) }
        : {}),
    });
  }

  return Array.from(districts.values());
}

function resolveOverlaySchoolDistricts(
  taxYear: number,
  schoolDistricts: SchoolDistrictEntry[] | undefined,
): SchoolDistrictEntry[] | undefined {
  if (!schoolDistricts) {
    return undefined;
  }

  return schoolDistricts.map((entry) => {
    const officialMetadata =
      entry.districtNumber?.trim()
        ? lookupOhioSchoolDistrictMetadata(taxYear, entry.districtNumber)
        : entry.districtName
          ? lookupOhioSchoolDistrictMetadataByDistrictName(taxYear, entry.districtName)
          : null;

    if (!officialMetadata) {
      return entry;
    }

    return {
      ...entry,
      districtNumber: officialMetadata.districtNumber,
      taxType: entry.taxType ?? entry.taxBase ?? officialMetadata.taxType,
      rate: entry.rate ?? officialMetadata.rate,
    };
  });
}

/**
 * Sum qualifying retirement income from 1099-Rs for the Ohio retirement credit.
 *
 * Includes taxable amounts from pension, 401(k), IRA distributions.
 * Excludes Roth conversions and returned contributions (not "retirement income").
 * When taxableAmountNotDetermined is true, uses grossDistribution.
 */
export function extractRetirementIncome(form1099Rs: Form1099R[]): Decimal {
  let total = new Decimal(0);
  for (const f of form1099Rs) {
    // Skip Roth conversions — these are plan changes, not retirement income
    if (d(f.rothConversionAmount).greaterThan(0)) continue;
    // Skip returned contributions — these are just earnings on returned amounts
    if (f.returnedContributionByDueDate) continue;
    // Skip excess contributions returned without earnings
    if (f.excessContributionReturnedWithoutEarnings) continue;

    // Determine taxable amount
    let taxable: Decimal;
    if (f.taxableAmountNotDetermined || f.taxableAmount === undefined) {
      // When box 2b is checked or 2a is blank, use gross distribution
      taxable = d(f.grossDistribution);
    } else {
      taxable = d(f.taxableAmount);
    }

    // Subtract QCD exclusion (not included in AGI)
    const qcd = d(f.qualifiedCharitableDistribution);
    taxable = taxable.minus(qcd);

    if (taxable.greaterThan(0)) {
      total = total.plus(taxable);
    }
  }
  return total;
}

/**
 * Determine if taxpayer (or spouse for MFJ) is age 65+ as of Dec 31 of the tax year.
 */
export function determineSeniorStatus(
  taxpayerDob: string,
  spouseDob: string | undefined,
  taxYear: number,
): boolean {
  const cutoffDate = new Date(taxYear - 65, 11, 31); // Dec 31 of (taxYear - 65)
  const taxpayerDate = new Date(taxpayerDob);
  if (taxpayerDate <= cutoffDate) return true;
  if (spouseDob) {
    const spouseDate = new Date(spouseDob);
    if (spouseDate <= cutoffDate) return true;
  }
  return false;
}

/**
 * Count Ohio exemptions: 1 (taxpayer) + 1 (spouse if MFJ) + dependents.
 */
export function countExemptions(
  filingStatus: FilingStatus,
  dependentsCount: number,
): number {
  let count = 1; // taxpayer
  if (filingStatus === "married_filing_jointly") {
    count += 1; // spouse
  }
  count += dependentsCount;
  return count;
}

interface DerivedJointFilingQualifyingIncome {
  primary: Decimal;
  spouse: Decimal;
  hasAttribution: boolean;
}

function getTaxable1099RAmount(form: Form1099R): Decimal {
  if (form.taxableAmountNotDetermined || form.taxableAmount === undefined) {
    return Decimal.max(
      d(form.grossDistribution).minus(d(form.qualifiedCharitableDistribution)),
      new Decimal(0),
    );
  }

  return Decimal.max(
    d(form.taxableAmount).minus(d(form.qualifiedCharitableDistribution)),
    new Decimal(0),
  );
}

function deriveJointFilingQualifyingIncome(
  filingStatus: FilingStatus,
  w2s: W2[],
  formW2Gs: FormW2G[] = [],
  form1099Gs: Form1099G[] = [],
  form1099Necs: Form1099Nec[] = [],
  form1099Miscs: Form1099Misc[] = [],
  form1099Rs: Form1099R[] = [],
  qualifyingBusinessIncome?: Decimal | string | number,
  businessIncomeDeductionCap?: Decimal | string | number,
  taxYear = 2025,
): DerivedJointFilingQualifyingIncome {
  if (filingStatus !== "married_filing_jointly") {
    return {
      primary: new Decimal(0),
      spouse: new Decimal(0),
      hasAttribution: false,
    };
  }

  let primary = new Decimal(0);
  let spouse = new Decimal(0);
  let hasAttribution = false;

  const addAttributedAmount = (
    accountHolder: "primary" | "spouse" | undefined,
    amount: Decimal | string | number,
  ): void => {
    if (accountHolder === "primary") {
      primary = primary.plus(d(amount));
      hasAttribution = true;
    } else if (accountHolder === "spouse") {
      spouse = spouse.plus(d(amount));
      hasAttribution = true;
    }
  };

  for (const w2 of w2s) {
    addAttributedAmount(w2.accountHolder, w2.wages);
  }

  for (const form of formW2Gs) {
    addAttributedAmount(form.accountHolder, form.reportableWinnings);
  }

  if (form1099Gs.length) {
    const government = calculateForm1099G(form1099Gs, taxYear, filingStatus);
    for (const program of government.programs) {
      addAttributedAmount(program.accountHolder, program.taxableUnemployment);
    }
    for (const source of government.sources) {
      addAttributedAmount(source.accountHolder, source.taxableRtaa.plus(source.taxableGrants).plus(source.taxableFamilyLeave));
    }
  }

  for (const form of form1099Miscs) {
    addAttributedAmount(form.accountHolder, form.otherIncome);
  }

  for (const form of form1099Rs) {
    if (!form.disabilityPensionBeforeMinimumRetirementAge) {
      continue;
    }
    addAttributedAmount(form.accountHolder, getTaxable1099RAmount(form));
  }

  const primaryBusinessIncome = form1099Necs.reduce((total, form) => (
    form.accountHolder === "primary"
      ? total.plus(Decimal.max(d(form.nonemployeeCompensation), new Decimal(0)))
      : total
  ), new Decimal(0));
  const spouseBusinessIncome = form1099Necs.reduce((total, form) => (
    form.accountHolder === "spouse"
      ? total.plus(Decimal.max(d(form.nonemployeeCompensation), new Decimal(0)))
      : total
  ), new Decimal(0));
  const totalAttributedBusinessIncome = primaryBusinessIncome.plus(spouseBusinessIncome);
  const residualBusinessIncome = Decimal.min(
    Decimal.max(
      d(qualifyingBusinessIncome).minus(d(businessIncomeDeductionCap)),
      new Decimal(0),
    ),
    totalAttributedBusinessIncome,
  );

  if (
    totalAttributedBusinessIncome.greaterThan(0) &&
    residualBusinessIncome.greaterThan(0)
  ) {
    // Ohio excludes deducted business income from joint-filing-credit qualifying
    // income, so only the residual business income left in Ohio AGI is counted.
    const primaryResidualBusinessIncome = residualBusinessIncome
      .mul(primaryBusinessIncome)
      .div(totalAttributedBusinessIncome);
    const spouseResidualBusinessIncome = residualBusinessIncome.minus(
      primaryResidualBusinessIncome,
    );

    primary = primary.plus(primaryResidualBusinessIncome);
    spouse = spouse.plus(spouseResidualBusinessIncome);
    hasAttribution = true;
  }

  return {
    primary: Decimal.max(primary, new Decimal(0)),
    spouse: Decimal.max(spouse, new Decimal(0)),
    hasAttribution,
  };
}

/**
 * Determine if both spouses have $500+ qualifying income (for joint filing credit).
 * Uses supported accountHolder-tagged federal income documents as a proxy
 * for spouse-level qualifying income when explicit Ohio overlay amounts are
 * not supplied. Business-income documents that flow to the Ohio business
 * income deduction, such as 1099-NEC nonemployee compensation, are excluded.
 */
export function determineBothSpousesQualifyingIncome(
  filingStatus: FilingStatus,
  w2s: W2[],
  primaryQualifyingIncome?: Decimal | string | number,
  spouseQualifyingIncome?: Decimal | string | number,
  formW2Gs: FormW2G[] = [],
  form1099Gs: Form1099G[] = [],
  form1099Necs: Form1099Nec[] = [],
  form1099Miscs: Form1099Misc[] = [],
  form1099Rs: Form1099R[] = [],
  qualifyingBusinessIncome?: Decimal | string | number,
  businessIncomeDeductionCap?: Decimal | string | number,
  taxYear = 2025,
): boolean {
  if (filingStatus !== "married_filing_jointly") return false;

  if (
    primaryQualifyingIncome !== undefined ||
    spouseQualifyingIncome !== undefined
  ) {
    const threshold = new Decimal(500);
    return (
      d(primaryQualifyingIncome).greaterThanOrEqualTo(threshold) &&
      d(spouseQualifyingIncome).greaterThanOrEqualTo(threshold)
    );
  }

  const derived = deriveJointFilingQualifyingIncome(
    filingStatus,
    w2s,
    formW2Gs,
    form1099Gs,
    form1099Necs,
    form1099Miscs,
    form1099Rs,
    qualifyingBusinessIncome,
    businessIncomeDeductionCap,
    taxYear,
  );
  if (!derived.hasAttribution) return false;

  const threshold = new Decimal(500);
  return (
    derived.primary.greaterThanOrEqualTo(threshold) &&
    derived.spouse.greaterThanOrEqualTo(threshold)
  );
}

/**
 * Extract qualifying business income from federal schedule results and K-1s.
 *
 * Uses the Ohio IT BUS module to break down business income by source:
 *   - Schedule C net profit (self-employment)
 *   - Schedule F net farm profit
 *   - K-1 guaranteed payments (always qualifying)
 *   - K-1 ordinary income from active (non-passive) entities
 *   - Other qualifying business income (pass-through from overlay)
 */
export function extractQualifyingBusinessIncome(
  federalResult: TaxReturnResult,
  k1s: ScheduleK1[],
  otherBusinessIncome?: Decimal | string | number,
): OhioITBusResult {
  return calculateOhioITBus({
    scheduleCNetProfit: federalResult.scheduleC?.netProfit,
    scheduleFNetFarmProfit: federalResult.scheduleF?.netFarmProfit,
    k1Entries: k1s.map((k1) => ({
      entityName: k1.partnershipName,
      ordinaryIncome: k1.ordinaryIncome,
      guaranteedPayments: k1.guaranteedPayments,
      isPassiveActivity: k1.isPassiveActivity,
    })),
    otherBusinessIncome,
  });
}

/**
 * Sum U.S. government obligation interest from 1099-INTs (box 3).
 *
 * This interest (Treasury bills, notes, bonds, Series I/EE savings bonds)
 * is exempt from Ohio tax by federal law (31 U.S.C. 3124). Ohio Schedule
 * of Adjustments line 16 deducts this from Ohio AGI.
 */
export function extractFederalInterestExemptFromOhio(
  form1099Ints: Form1099Int[],
): Decimal {
  let total = new Decimal(0);
  for (const f of form1099Ints) {
    if (f.usSavingsBondInterest) {
      total = total.plus(d(f.usSavingsBondInterest));
    }
  }
  return total;
}

/**
 * Sum state/local tax refunds from 1099-Gs (box 2) that are included in federal AGI.
 *
 * Ohio Schedule of Adjustments line 18 deducts prior-year state/local tax refunds
 * that flow into federal AGI (because the taxpayer itemized in the prior year).
 * All 1099-G box 2 amounts are included regardless of the issuing state.
 */
export function extractStateMunicipalTaxRefunds(
  form1099Gs: Form1099G[],
): Decimal {
  let total = new Decimal(0);
  for (const f of form1099Gs) {
    if (f.stateOrLocalTaxRefund) {
      total = total.plus(d(f.stateOrLocalTaxRefund));
    }
  }
  return total;
}

/**
 * Map federal filing status string to the engine FilingStatus type.
 */
export function mapFilingStatus(federalStatus: string): FilingStatus {
  switch (federalStatus) {
    case "single":
    case "married_filing_jointly":
    case "married_filing_separately":
    case "head_of_household":
    case "qualifying_surviving_spouse":
      return federalStatus;
    default:
      throw new Error(
        `Ohio input adapter does not support federal filing status: ${federalStatus}`,
      );
  }
}

// ---------------------------------------------------------------------------
// Main adapter
// ---------------------------------------------------------------------------

export function buildOhioResidentReturnInput(
  taxInput: TaxYearInput,
  federalResult: TaxReturnResult,
  overlay: OhioOverlayInput = {},
): OhioResidentReturnInput {
  const filingStatus = mapFilingStatus(federalResult.filingStatus);
  const w2s = taxInput.w2s ?? [];
  const formW2Gs = taxInput.formW2G ?? [];
  const form1099Gs = taxInput.form1099G ?? [];
  const form1099Ks = taxInput.form1099K ?? [];
  const form1099Miscs = taxInput.form1099Misc ?? [];
  const form1099Necs = taxInput.form1099Nec ?? [];
  const form1099Rs = taxInput.form1099R ?? [];
  const form1099Ints = taxInput.form1099Int ?? [];
  const form1099OIDs = taxInput.form1099OID ?? [];
  const oid = form1099OIDs.length ? calculateForm1099OID(form1099OIDs, federalResult.taxYear) : undefined;
  if (oid && !oid.sourceFactsVerified) throw new Error("Ohio OID adaptation requires verified source classifications and recipient amounts.");
  if (oid?.taxExemptInterest.gt(0) && overlay.nonOhioStateLocalInterest === undefined) {
    throw new Error("Ohio OID municipal interest requires an actual non-Ohio issuer allocation, including confirmed zero.");
  }
  if (federalResult.taxExemptInterest?.gt(0) && overlay.nonOhioStateLocalInterest === undefined) {
    throw new Error("Ohio tax-exempt interest requires an actual issuer allocation, including confirmed zero for non-Ohio state and local interest.");
  }

  // Auto-extract values
  const ohioWithholding =
    overlay.ohioWithholdingOverride !== undefined
      ? overlay.ohioWithholdingOverride
      : extractOhioWithholding(
          w2s,
          formW2Gs,
          form1099Gs,
          form1099Ks,
          form1099Rs,
          form1099Necs,
          form1099Miscs,
          form1099Ints,
          taxInput.form1099Div,
          taxInput.form1099B,
          form1099OIDs,
        );

  const sdWithholding =
    overlay.sdWithholdingOverride !== undefined
      ? overlay.sdWithholdingOverride
      : extractSchoolDistrictWithholding(w2s, form1099Rs);

  const retirementIncome =
    overlay.retirementIncomeOverride !== undefined
      ? overlay.retirementIncomeOverride
      : Decimal.max(
          extractRetirementIncome(form1099Rs).minus(
            d(overlay.uniformedServicesRetirement),
          ),
          new Decimal(0),
        );

  const isSenior =
    overlay.isSeniorOverride !== undefined
      ? overlay.isSeniorOverride
      : determineSeniorStatus(
          taxInput.taxpayer.primary.dateOfBirth,
          taxInput.taxpayer.spouse?.dateOfBirth,
          federalResult.taxYear,
        );

  const exemptions =
    overlay.exemptionsOverride !== undefined
      ? overlay.exemptionsOverride
      : countExemptions(filingStatus, taxInput.taxpayer.dependents.length);

  // Auto-extract qualifying business income via IT BUS (unless overridden)
  const k1s = taxInput.scheduleK1 ?? [];
  let qualifyingBusinessIncome: Decimal | string | number | undefined =
    overlay.qualifyingBusinessIncome;
  if (qualifyingBusinessIncome === undefined) {
    const itBus = extractQualifyingBusinessIncome(
      federalResult,
      k1s,
      overlay.otherBusinessIncome,
    );
    qualifyingBusinessIncome = itBus.line6_totalQualifyingBusinessIncome;
  }

  const businessIncomeDeductionCap =
    filingStatus === "married_filing_jointly"
      ? OHIO_TAX_CONSTANTS[federalResult.taxYear]?.scheduleAdjustments
          .businessIncomeDeductionCap.default
      : undefined;

  const derivedQualifyingIncome = deriveJointFilingQualifyingIncome(
    filingStatus,
    w2s,
    formW2Gs,
    form1099Gs,
    form1099Necs,
    form1099Miscs,
    form1099Rs,
    qualifyingBusinessIncome,
    businessIncomeDeductionCap,
    federalResult.taxYear,
  );
  const primaryQualifyingIncome =
    overlay.primaryQualifyingIncome !== undefined
      ? overlay.primaryQualifyingIncome
      : derivedQualifyingIncome.hasAttribution
        ? derivedQualifyingIncome.primary
        : undefined;
  const spouseQualifyingIncome =
    overlay.spouseQualifyingIncome !== undefined
      ? overlay.spouseQualifyingIncome
      : derivedQualifyingIncome.hasAttribution
        ? derivedQualifyingIncome.spouse
        : undefined;
  const bothSpousesHaveQualifyingIncome = determineBothSpousesQualifyingIncome(
    filingStatus,
    w2s,
    overlay.primaryQualifyingIncome,
    overlay.spouseQualifyingIncome,
    formW2Gs,
    form1099Gs,
    form1099Necs,
    form1099Miscs,
    form1099Rs,
    qualifyingBusinessIncome,
    businessIncomeDeductionCap,
    federalResult.taxYear,
  );

  // Auto-extract federal interest exempt from Ohio (1099-INT box 3) unless overridden
  const federalInterestExemptFromOhio =
    overlay.federalInterestExemptFromOhio !== undefined
      ? overlay.federalInterestExemptFromOhio
      : Decimal.max(0, extractFederalInterestExemptFromOhio(form1099Ints)
          .minus(federalResult.scheduleB?.previouslyReportedSavingsBondInterest ?? d(0))
          .minus(federalResult.form8815?.excludableSavingsBondInterest ?? d(0)))
          .plus(oid?.treasuryInterest ?? d(0));

  // Auto-extract state/municipal tax refunds (1099-G box 2) unless overridden
  const stateMunicipalTaxRefunds =
    overlay.stateMunicipalTaxRefunds !== undefined
      ? overlay.stateMunicipalTaxRefunds
      : federalResult.schedule1?.taxableRefunds ?? d(0);

  const careLine9c = federalResult.form2441?.lines.filter(line => line.form === "Form 2441" && line.line === "9c");
  if (overlay.federal2441Line9c === undefined && federalResult.form2441 &&
    (careLine9c?.length !== 1 || !careLine9c[0].value.isFinite() || careLine9c[0].value.isNegative())) {
    throw new Error("Ohio requires the actual Form 2441 line9c audit or an explicit reconciled amount.");
  }

  const federal2441Line9c =
    overlay.federal2441Line9c !== undefined
      ? overlay.federal2441Line9c
      : careLine9c?.[0]?.value;

  const federal2441Line11 =
    overlay.federal2441Line11 !== undefined
      ? overlay.federal2441Line11
      : federalResult.form2441?.credit;

  const schoolDistricts =
    overlay.schoolDistricts !== undefined
      ? resolveOverlaySchoolDistricts(federalResult.taxYear, overlay.schoolDistricts)
      : deriveSchoolDistrictsFromW2s(federalResult.taxYear, w2s);

  return {
    taxYear: federalResult.taxYear,
    filingStatus,
    federalAgi: federalResult.agi,
    exemptions,

    // Schedule of Adjustments: Additions
    nonOhioStateLocalInterest: overlay.nonOhioStateLocalInterest,
    employeeBenefitPlanDistributions: overlay.employeeBenefitPlanDistributions,
    lumpSumCreditsFromPriorYear: overlay.lumpSumCreditsFromPriorYear,
    depreciationAddBack: overlay.depreciationAddBack,
    pteAddBack: overlay.pteAddBack,
    medicalSavingsAccountTaxpayerContributions:
      overlay.medicalSavingsAccountTaxpayerContributions,
    medicalSavingsAccountSpouseContributions:
      overlay.medicalSavingsAccountSpouseContributions,
    medicalSavingsAccountEarnings: overlay.medicalSavingsAccountEarnings,
    medicalSavingsAccountNonmedicalWithdrawals:
      overlay.medicalSavingsAccountNonmedicalWithdrawals,
    otherAdditions: overlay.otherAdditions,

    // Schedule of Adjustments: Deductions
    qualifyingBusinessIncome,
    federalInterestExemptFromOhio,
    taxableSocialSecurity: federalResult.socialSecurityBenefitsTaxable,
    stateMunicipalTaxRefunds,
    militaryPayOutsideOhio: overlay.militaryPayOutsideOhio,
    uniformedServicesRetirement: overlay.uniformedServicesRetirement,
    disabilitySurvivorshipBenefits: overlay.disabilitySurvivorshipBenefits,
    stableContributions: overlay.stableContributions,
    stableCarryforwards: overlay.stableCarryforwards,
    ohio529Contributions: overlay.ohio529Contributions,
    ohio529Carryforwards: overlay.ohio529Carryforwards,
    homebuyerPlusAccounts: overlay.homebuyerPlusAccounts,
    pregnancyResourceCenterContributions: overlay.pregnancyResourceCenterContributions,
    collegeGrantRoomAndBoardEntries: overlay.collegeGrantRoomAndBoardEntries,
    ohioEducatorExpenses: overlay.ohioEducatorExpenses,
    ruralPracticeIncentiveRepayments: overlay.ruralPracticeIncentiveRepayments,
    adoptedStudentGrantPayments: overlay.adoptedStudentGrantPayments,
    qualifiedOrganDonorExpenses: overlay.qualifiedOrganDonorExpenses,
    medicalInsurancePremiumsBeforeMedicareOrEmployerEligibility:
      overlay.medicalInsurancePremiumsBeforeMedicareOrEmployerEligibility,
    medicalLongTermCareInsurancePremiums:
      overlay.medicalLongTermCareInsurancePremiums,
    medicalInsurancePremiumsDuringMedicareOrEmployerEligibility:
      overlay.medicalInsurancePremiumsDuringMedicareOrEmployerEligibility,
    medicalCareExpenses: overlay.medicalCareExpenses,
    otherDeductions: overlay.otherDeductions,

    // Schedule of Credits
    retirementIncome,
    isSenior,
    federal2441Line9c,
    federal2441Line11,
    displacedWorkerExpenses: overlay.displacedWorkerExpenses,
    priorYearDisplacedWorkerCredit: overlay.priorYearDisplacedWorkerCredit,
    displacedWorkerRecipients: overlay.displacedWorkerRecipients,
    campaignContributions: overlay.campaignContributions,
    federalEarnedIncomeCredit: federalResult.earnedIncomeCredit,
    homeSchoolExpenses: overlay.homeSchoolExpenses,
    homeSchoolQualifyingStudents: overlay.homeSchoolQualifyingStudents,
    scholarshipDonations: overlay.scholarshipDonations,
    noncharteredSchoolTuition: overlay.noncharteredSchoolTuition,
    primaryQualifyingIncome,
    spouseQualifyingIncome,
    bothSpousesHaveQualifyingIncome,
    lumpSumRetirementRecipients: overlay.lumpSumRetirementRecipients,
    lumpSumRetirementCredit: overlay.lumpSumRetirementCredit,
    lumpSumDistributionCredit: overlay.lumpSumDistributionCredit,
    lumpSumDistributionRecipientAges: overlay.lumpSumDistributionRecipientAges,
    workBasedLearningExperienceCredit:
      overlay.workBasedLearningExperienceCredit,
    ohioAdoptionCreditCarryforward: overlay.ohioAdoptionCreditCarryforward,
    nonrefundableJobRetentionCredit:
      overlay.nonrefundableJobRetentionCredit,
    newEmployeesEnterpriseZoneCredit:
      overlay.newEmployeesEnterpriseZoneCredit,
    beginningFarmersFinancialManagementCredit:
      overlay.beginningFarmersFinancialManagementCredit,
    commercialVehicleOperatorTrainingCredit:
      overlay.commercialVehicleOperatorTrainingCredit,
    welcomeHomeOhioCredit: overlay.welcomeHomeOhioCredit,
    transformationalMixedUseDevelopmentCredit:
      overlay.transformationalMixedUseDevelopmentCredit,
    saleRentalAgriculturalAssetsBeginningFarmersCredit:
      overlay.saleRentalAgriculturalAssetsBeginningFarmersCredit,
    grapeProductionCredit: overlay.grapeProductionCredit,
    grapeProductionQualifyingPropertyCost: overlay.grapeProductionQualifyingPropertyCost,
    investOhioCredit: overlay.investOhioCredit,
    leadAbatementCredit: overlay.leadAbatementCredit,
    opportunityZoneInvestmentCredit: overlay.opportunityZoneInvestmentCredit,
    technologyInvestmentCreditCarryforward:
      overlay.technologyInvestmentCreditCarryforward,
    enterpriseZoneDayCareAndTrainingCredit:
      overlay.enterpriseZoneDayCareAndTrainingCredit,
    researchAndDevelopmentCredit: overlay.researchAndDevelopmentCredit,
    nonrefundableHistoricPreservationCredit:
      overlay.nonrefundableHistoricPreservationCredit,
    ohioLowIncomeHousingCredit: overlay.ohioLowIncomeHousingCredit,
    affordableSingleFamilyHousingCredit:
      overlay.affordableSingleFamilyHousingCredit,
    otherSecondBatchCredits: overlay.otherSecondBatchCredits,
    nonresidentCredit: overlay.nonresidentCredit,
    residentCredit: overlay.residentCredit,
    refundableHistoricPreservationCredit: overlay.refundableHistoricPreservationCredit,
    refundableJobCreationCredit: overlay.refundableJobCreationCredit,
    passThroughEntityCredit: overlay.passThroughEntityCredit,
    refundableMotionPictureCredit: overlay.refundableMotionPictureCredit,
    filmTheaterCapitalImprovementCredit: overlay.filmTheaterCapitalImprovementCredit,
    ventureCapitalCredit: overlay.ventureCapitalCredit,

    // Resident credit
    otherStateTaxes: overlay.otherStateTaxes,

    // IT 1040: Payments
    underpaymentPenalty: overlay.underpaymentPenalty,
    useTax: overlay.useTax,
    ohioWithholding,
    estimatedPayments: overlay.estimatedPayments,
    refundableCredits: overlay.refundableCredits,
    amendedPriorOverpayment: overlay.amendedPriorOverpayment,
    latePaymentInterest: overlay.latePaymentInterest,
    creditCarryforward: overlay.creditCarryforward,
    donations: overlay.donations,
    computeUnderpaymentPenalty: overlay.computeUnderpaymentPenalty,
    priorYearTaxLiability: overlay.priorYearTaxLiability,
    priorYearTimelyFiled: overlay.priorYearTimelyFiled,
    estimatedPaymentSchedule: overlay.estimatedPaymentSchedule,

    // SD 100
    schoolDistricts,
    sdUnderpaymentPenalty: overlay.sdUnderpaymentPenalty,
    sdPriorYearTaxLiability: overlay.sdPriorYearTaxLiability,
    sdPriorYearTimelyFiled: overlay.sdPriorYearTimelyFiled,
    sdWithholding,
    sdEstimatedPayments: overlay.sdEstimatedPayments,
    sdAmendedPriorOverpayment: overlay.sdAmendedPriorOverpayment,
    sdLatePaymentInterest: overlay.sdLatePaymentInterest,
    sdCreditCarryforward: overlay.sdCreditCarryforward,
  };
}
