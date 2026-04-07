/**
 * NJ-1040 Input Adapter — bridges TaxYearInput + TaxReturnResult to NJ1040Input.
 * Spec: spec/state/nj-1040-adapter.yaml
 *
 * Automates mapping of W-2s, 1099s, K-1s, and federal results into the
 * NJ-1040 engine's input interface. NJ-specific interview data that cannot
 * be derived from documents is supplied via NJStateConfig.
 */

import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { NJ1040Input } from "@/engine/state/nj-1040.js";
import type { OtherJurisdictionEntry } from "@/engine/state/nj-1040-other-jurisdiction-credit.js";
import type { NJ1040OtherDesignatedContributionInput } from "@/engine/state/nj-1040-overpayment-allocation.js";
import type { NJ1040OrganDonorLeaveEventInput } from "@/engine/state/nj-1040-supplemental-credits.js";
import { d } from "@/utils/decimal.js";

/**
 * NJ-specific interview data not derivable from federal input documents.
 */
export interface NJStateConfig {
  /** Months of NJ residency (default 12 for full-year resident) */
  monthsOfResidency?: number;

  // --- Property tax ---
  isHomeowner?: boolean;
  isTenant?: boolean;
  propertyTaxesPaid?: Decimal | string | number;
  rentPaid?: Decimal | string | number;
  electPropertyTaxCredit?: boolean;
  sharedMainHomeWithSpouse?: boolean;
  hasDisabledVeteranPropertyTaxExemption?: boolean;
  madePilotPayments?: boolean;
  rentedTaxExemptProperty?: boolean;

  // --- Medical expenses ---
  totalMedicalExpenses?: Decimal | string | number;
  insuranceReimbursements?: Decimal | string | number;
  organDonationDeductionExpenses?: Decimal | string | number;

  // --- College affordability deductions ---
  njbestContributions?: Decimal | string | number;
  njclassLoanPayments?: Decimal | string | number;
  tuitionPaidToNjInstitution?: Decimal | string | number;
  qualifiedConservationContribution?: Decimal | string | number;
  healthEnterpriseZoneDeduction?: Decimal | string | number;
  alternativeBusinessCalculationAdjustment?: Decimal | string | number;

  // --- Health coverage mandate ---
  healthCoverageAdults?: number;
  healthCoverageChildren?: number;
  healthCoverageUncoveredMonths?: number;
  healthCoverageDependentIncome?: Decimal | string | number;

  // --- Use tax ---
  useSafeHarbor?: boolean;
  actualUseTax?: Decimal | string | number;

  // --- Excess payroll contributions ---
  totalUIWFSWFWithheld?: Decimal | string | number;
  totalDIWithheld?: Decimal | string | number;
  totalFLIWithheld?: Decimal | string | number;
  privatePlanMaxDI?: Decimal | string | number;

  // --- Underpayment penalty ---
  priorYearTax?: Decimal | string | number;
  priorYearReturnFiled?: boolean;

  // --- Overpayment allocation / charitable contributions ---
  creditOverpaymentToNextYear?: Decimal | string | number;
  endangeredWildlifeFundContribution?: Decimal | string | number;
  childrensTrustFundContribution?: Decimal | string | number;
  vietnamVeteransMemorialFundContribution?: Decimal | string | number;
  breastCancerResearchFundContribution?: Decimal | string | number;
  ussNewJerseyEducationalMuseumFundContribution?: Decimal | string | number;
  otherDesignatedContributions?: NJ1040OtherDesignatedContributionInput[];

  // --- Pass-Through Business Alternative Income Tax credit ---
  /** Additional PTBAIT credit, e.g. from estate/trust NJK-1 statements */
  passThroughBusinessAlternativeIncomeTaxCredit?: Decimal | string | number;

  // --- Other jurisdiction credit ---
  otherJurisdictions?: OtherJurisdictionEntry[];

  // --- Personal exemption flags ---
  isVeteran?: boolean;
  spouseIsVeteran?: boolean;
  taxpayerBlindOrDisabled?: boolean;
  spouseBlindOrDisabled?: boolean;

  // --- Dependent interview data ---
  collegeDependentCount?: number;

  // --- Wounded Warrior Caregivers Credit ---
  providedCareToQualifyingServiceMember?: boolean;
  serviceMemberFederalDisabilityCompensation?: Decimal | string | number;
  onlyCaregiver?: boolean;
  careExpensesSharePercent?: Decimal | string | number;

  // --- Supplemental nonrefundable credits (NJ-1040 lines 46-49) ---
  shelteredWorkshopCurrentYearCredit?: Decimal | string | number;
  goldStarCounselingHours?: Decimal | string | number;
  goldStarTricareRate?: Decimal | string | number;
  organDonorLeaveEvents?: NJ1040OrganDonorLeaveEventInput[];

  // --- Override: pension exclusion eligibility ---
  /** Exact NJ line 19 taxable pension/IRA amount from a New Jersey worksheet or interview carry-in */
  pensionIncomeOverride?: Decimal | string | number;
  /** Override pension exclusion eligibility (normally derived from age 62+) */
  qualifiesForPensionExclusionOverride?: boolean;
  /** Override other retirement income exclusion eligibility (normally derived from age 62+) */
  qualifiesForOtherRetirementExclusionOverride?: boolean;
  /** Special exclusion for filers who will never be eligible for Social Security or Railroad Retirement */
  qualifiesForSpecialRetirementExclusion?: boolean;
  /** Mixed-age joint-return cap for the other retirement income exclusion */
  otherRetirementIncomeExclusionCap?: Decimal | string | number;
  /** Mixed-age joint-return override for pension income owned by the eligible spouse(s) */
  pensionIncomeEligibleForExclusion?: Decimal | string | number;

  /** Additional NJ line 26 other income not derivable from the supported federal documents. */
  otherIncome?: Decimal | string | number;

  // --- Other state tax-exempt interest (Line 15b) ---
  /** Tax-exempt interest from other states' obligations (NJ-taxable, federally exempt) */
  otherStateTaxExemptInterest?: Decimal | string | number;

  /** 2025 NJ-only childless EITC path when federal EITC is zero solely because of age */
  qualifiesForChildlessAge18Exception?: boolean;

  // --- Other adjustments ---
  /** Additional NJ-only line 28 adjustments not already derived from supported inputs */
  otherAdjustments?: Decimal | string | number;
}

/**
 * Compute age as of a reference date from a YYYY-MM-DD date of birth.
 */
export function ageAsOf(dateOfBirth: string, referenceDate: Date): number {
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  let age = referenceDate.getFullYear() - year;
  const refMonth = referenceDate.getMonth() + 1; // 1-based
  const refDay = referenceDate.getDate();
  if (refMonth < month || (refMonth === month && refDay < day)) {
    age--;
  }
  return age;
}

function hasDirectRolloverDistributionCode(distributionCode?: string): boolean {
  if (!distributionCode) return false;
  const normalizedCodes = distributionCode.toUpperCase().replace(/\s+/g, "");
  return normalizedCodes.includes("G") || normalizedCodes.includes("H");
}

function isExcludedNJLotteryPrize(
  winningsCategory: string | undefined,
  reportableWinnings: Decimal
): boolean {
  if (
    winningsCategory !== "new_jersey_lottery"
    && winningsCategory !== "multistate_nj_lottery"
  ) {
    return false;
  }

  return reportableWinnings.lessThanOrEqualTo(10000);
}

function getTaxpayerAgeFor1099RAccountHolder(
  taxInput: TaxYearInput,
  endOfYear: Date,
  accountHolder?: "primary" | "spouse"
): number | undefined {
  if (accountHolder === "spouse") {
    return taxInput.taxpayer.spouse?.dateOfBirth
      ? ageAsOf(taxInput.taxpayer.spouse.dateOfBirth, endOfYear)
      : undefined;
  }

  return taxInput.taxpayer.primary.dateOfBirth
    ? ageAsOf(taxInput.taxpayer.primary.dateOfBirth, endOfYear)
    : undefined;
}

function getNJTaxable1099RDistributionAmount(
  taxInput: TaxYearInput,
  endOfYear: Date,
  form: NonNullable<TaxYearInput["form1099R"]>[number]
): Decimal | null {
  if (form.militaryPensionOrSurvivorBenefit) return null;
  if (form.qualifiedRothDistribution) return null;
  if (hasDirectRolloverDistributionCode(form.distributionCode)) return null;

  if (form.disabilityPensionBeforeMinimumRetirementAge) {
    const ageAtYearEnd = getTaxpayerAgeFor1099RAccountHolder(
      taxInput,
      endOfYear,
      form.accountHolder
    );
    if (ageAtYearEnd !== undefined && ageAtYearEnd < 65) return null;
  }

  return form.taxableAmountNotDetermined
    ? d(form.grossDistribution)
    : d(form.taxableAmount ?? form.grossDistribution);
}

/**
 * Build an NJ1040Input from unified TaxYearInput, federal TaxReturnResult,
 * and NJ-specific interview data.
 */
export function buildNJ1040Input(
  taxInput: TaxYearInput,
  federalResult: TaxReturnResult,
  njConfig: NJStateConfig = {}
): NJ1040Input {
  const taxYear = taxInput.taxpayer.taxYear;
  const filingStatus = taxInput.taxpayer.filingStatus;
  const endOfYear = new Date(taxYear, 11, 31); // Dec 31 of tax year

  // === Wages (NJ Line 14) ===
  // Residents report wages from everywhere. Use Box 16 only for NJ W-2s;
  // another state's Box 16 reflects that state's rules, not NJ gross income.
  const wages = taxInput.w2s.reduce(
    (acc, w2) => {
      const isNJW2 = w2.state?.toUpperCase() === "NJ";
      return acc.plus(d(isNJW2 ? (w2.stateWages ?? w2.wages) : w2.wages));
    },
    new Decimal(0)
  );
  const njW2s = taxInput.w2s.filter((w2) => w2.state?.toUpperCase() === "NJ");
  const hasNJW2s = njW2s.length > 0;

  // === Interest (NJ Line 15a) ===
  const taxableInterest = taxInput.form1099Int.reduce(
    (acc, f) => acc.plus(d(f.interestIncome)),
    new Decimal(0)
  );

  // === Tax-exempt interest (NJ Line 16b / Worksheet L) ===
  const taxExemptInterest = taxInput.form1099Int.reduce(
    (acc, f) => acc.plus(d(f.usSavingsBondInterest)).plus(d(f.taxExemptInterest)),
    new Decimal(0)
  ).plus(
    taxInput.form1099Div.reduce(
      (acc, f) => acc.plus(d(f.exemptInterestDividends)),
      new Decimal(0)
    )
  );

  // === Dividends (NJ Line 16) — all dividends as ordinary ===
  const dividends = taxInput.form1099Div.reduce(
    (acc, f) => acc.plus(d(f.ordinaryDividends)),
    new Decimal(0)
  );

  // === Business income (NJ Line 17) ===
  const businessIncome = federalResult.scheduleC?.netProfit ?? new Decimal(0);

  // === Net gains from property (NJ Line 18) ===
  const netGainsFromProperty = federalResult.capitalGainLoss;

  // === Pension income (NJ Line 19) ===
  const form1099Rs = taxInput.form1099R ?? [];
  const derivedPensionIncome = form1099Rs.reduce((acc, f) => {
    const taxable = getNJTaxable1099RDistributionAmount(taxInput, endOfYear, f);
    return taxable === null ? acc : acc.plus(taxable);
  }, new Decimal(0));
  const pensionIncome = d(njConfig.pensionIncomeOverride ?? derivedPensionIncome);

  // === Partnership income (NJ Line 20a) ===
  const partnershipIncome = taxInput.scheduleK1
    .filter((k1) => (k1.entityType ?? "partnership") === "partnership")
    .reduce((acc, k1) => acc.plus(d(k1.ordinaryIncome)), new Decimal(0));

  // === S-corp income (NJ Line 20b) ===
  const sCorpIncome = taxInput.scheduleK1
    .filter((k1) => k1.entityType === "s_corporation")
    .reduce((acc, k1) => acc.plus(d(k1.ordinaryIncome)), new Decimal(0));

  // === Rental income (NJ Line 21) ===
  const rentalIncome = federalResult.scheduleE?.totalRentalIncome ?? new Decimal(0);

  // === Gambling winnings and losses (NJ Line 22) ===
  const gamblingWinnings = taxInput.formW2G.reduce(
    (acc, f) => {
      const reportableWinnings = d(f.reportableWinnings);
      if (isExcludedNJLotteryPrize(f.winningsCategory, reportableWinnings)) {
        return acc;
      }
      return acc.plus(reportableWinnings);
    },
    new Decimal(0)
  );
  const gamblingLosses = d(taxInput.scheduleA?.gamblingLosses);

  // === Alimony (NJ lines 23 and 32) ===
  const alimonyReceived = federalResult.schedule1?.alimonyReceived ?? new Decimal(0);
  const alimonyPaid = d(taxInput.adjustments?.alimonyPaid);

  // === Other income (NJ Line 24) ===
  // Support 1099-MISC Box 3 amounts that fit NJ's "other taxable income"
  // bucket. NJ unemployment compensation stays excluded and is not added here.
  // The config carry-in covers other supported line-26 items such as estate/
  // trust income, income in respect of a decedent, and jury duty fees.
  const otherIncome = taxInput.form1099Misc.reduce(
    (acc, form) => acc.plus(d(form.otherIncome)),
    new Decimal(0)
  ).plus(d(njConfig.otherIncome));

  // === NJ withholding ===
  const njWithholding = hasNJW2s
    ? njW2s.reduce((acc, w2) => acc.plus(d(w2.stateTaxWithheld)), new Decimal(0))
    : taxInput.w2s.reduce((acc, w2) => acc.plus(d(w2.stateTaxWithheld)), new Decimal(0));

  // Add W-2G NJ state withholding
  const njW2GWithholding = taxInput.formW2G
    .filter((f) => !f.state || f.state.toUpperCase() === "NJ")
    .reduce((acc, f) => acc.plus(d(f.stateWithheld)), new Decimal(0));

  // Add 1099-G NJ state withholding
  const nj1099GWithholding = taxInput.form1099G
    .filter((f) => !f.state || f.state.toUpperCase() === "NJ")
    .reduce((acc, f) => acc.plus(d(f.stateWithheld)), new Decimal(0));

  // Add 1099-K NJ state withholding
  const nj1099KWithholding = taxInput.form1099K
    .filter((f) => !f.state || f.state.toUpperCase() === "NJ")
    .reduce((acc, f) => acc.plus(d(f.stateWithheld)), new Decimal(0));

  // Add 1099-R NJ state withholding (Box 14)
  const nj1099RWithholding = form1099Rs
    .filter((f) => !f.state || f.state.toUpperCase() === "NJ")
    .reduce((acc, f) => acc.plus(d(f.stateWithheld)), new Decimal(0));

  // Add 1099-INT NJ state withholding (Box 17)
  const nj1099IntWithholding = taxInput.form1099Int
    .filter((f) => !f.state || f.state.toUpperCase() === "NJ")
    .reduce((acc, f) => acc.plus(d(f.stateWithheld)), new Decimal(0));

  // Add 1099-DIV NJ state withholding (Box 16)
  const nj1099DivWithholding = taxInput.form1099Div
    .filter((f) => !f.state || f.state.toUpperCase() === "NJ")
    .reduce((acc, f) => acc.plus(d(f.stateWithheld)), new Decimal(0));

  // Add 1099-NEC NJ state withholding (Box 5)
  const nj1099NecWithholding = taxInput.form1099Nec
    .filter((f) => !f.state || f.state.toUpperCase() === "NJ")
    .reduce((acc, f) => acc.plus(d(f.stateWithheld)), new Decimal(0));

  // Add 1099-MISC NJ state withholding (Box 16)
  const nj1099MiscWithholding = taxInput.form1099Misc
    .filter((f) => !f.state || f.state.toUpperCase() === "NJ")
    .reduce((acc, f) => acc.plus(d(f.stateWithheld)), new Decimal(0));

  const totalNJWithholding = njWithholding
    .plus(njW2GWithholding)
    .plus(nj1099GWithholding)
    .plus(nj1099KWithholding)
    .plus(nj1099RWithholding)
    .plus(nj1099IntWithholding)
    .plus(nj1099DivWithholding)
    .plus(nj1099NecWithholding)
    .plus(nj1099MiscWithholding);

  // === Estimated payments / extension payments / prior-year credit (NJ-1040 line 57) ===
  const estimatedPayments = (taxInput.adjustments?.estimatedTaxPayments ?? [])
    .filter(
      (p) => p.type === "state" && (!p.state || p.state.toUpperCase() === "NJ")
    )
    .reduce((acc, p) => acc.plus(d(p.amount)), new Decimal(0));
  const extensionPayments = (taxInput.adjustments?.extensionPayments ?? [])
    .filter(
      (p) => p.type === "state" && (!p.state || p.state.toUpperCase() === "NJ")
    )
    .reduce((acc, p) => acc.plus(d(p.amount)), new Decimal(0));
  const priorYearAppliedCredits =
    (taxInput.adjustments?.priorYearAppliedCredits ?? [])
      .filter(
        (credit) =>
          credit.sourceTaxYear === taxYear - 1
          && credit.type === "state"
          && (!credit.state || credit.state.toUpperCase() === "NJ")
      )
      .reduce((acc, credit) => acc.plus(d(credit.amount)), new Decimal(0));
  const totalLine57Payments = estimatedPayments
    .plus(extensionPayments)
    .plus(priorYearAppliedCredits);

  // === PTBAIT credit (NJ-1040 line 63) ===
  const partnershipPTBAITCredit = taxInput.scheduleK1
    .filter((k1) => (k1.entityType ?? "partnership") === "partnership")
    .reduce(
      (acc, k1) => acc.plus(d(k1.njPassThroughBusinessAlternativeIncomeTaxCredit)),
      new Decimal(0)
    );
  const sCorporationPTBAITCredit = taxInput.scheduleK1
    .filter((k1) => k1.entityType === "s_corporation")
    .reduce(
      (acc, k1) => acc.plus(d(k1.njPassThroughBusinessAlternativeIncomeTaxCredit)),
      new Decimal(0)
    );
  const totalPTBAITCredit = partnershipPTBAITCredit
    .plus(sCorporationPTBAITCredit)
    .plus(d(njConfig.passThroughBusinessAlternativeIncomeTaxCredit));

  // === Federal credits ===
  const federalEITC = federalResult.earnedIncomeCredit;
  const federalDependentCareCredit =
    federalResult.schedule3?.childDependentCareCredit ?? new Decimal(0);
  const supportedArcherMSADeduction =
    federalResult.schedule1?.archerMSADeduction
    ?? d(taxInput.adjustments?.archerMSADeduction);
  const supportedSelfEmployedHealthInsuranceDeduction =
    federalResult.schedule1?.seHealthInsurance
    ?? d(taxInput.adjustments?.selfEmployedHealthInsurance);
  const otherAdjustments = d(njConfig.otherAdjustments);

  // === Age-based derivations ===
  const primaryAge = ageAsOf(taxInput.taxpayer.primary.dateOfBirth, endOfYear);
  const taxpayerAge65OrOlder = primaryAge >= 65;
  const spouseAge65OrOlder = taxInput.taxpayer.spouse
    ? ageAsOf(taxInput.taxpayer.spouse.dateOfBirth, endOfYear) >= 65
    : false;
  const spouseAge62OrOlder = taxInput.taxpayer.spouse
    ? ageAsOf(taxInput.taxpayer.spouse.dateOfBirth, endOfYear) >= 62
    : false;
  const primaryAge62OrOlder = primaryAge >= 62;
  const primaryBlindOrDisabled = njConfig.taxpayerBlindOrDisabled ?? false;
  const spouseBlindOrDisabled = njConfig.spouseBlindOrDisabled ?? false;
  const primaryEligibleForPensionExclusion =
    primaryAge62OrOlder || primaryBlindOrDisabled;
  const spouseEligibleForPensionExclusion =
    spouseAge62OrOlder || spouseBlindOrDisabled;

  // NJ line 28a allows age 62+ or blind/disabled; line 28b stays age-62-only.
  const qualifiesForPensionExclusion =
    njConfig.qualifiesForPensionExclusionOverride
    ?? (primaryEligibleForPensionExclusion || spouseEligibleForPensionExclusion);
  const qualifiesForOtherRetirementExclusion =
    njConfig.qualifiesForOtherRetirementExclusionOverride
    ?? (primaryAge62OrOlder || spouseAge62OrOlder);

  const eligiblePensionIncomeFromOwnershipTags = deriveEligiblePensionIncomeFromOwnershipTags(
    taxInput,
    endOfYear,
    form1099Rs,
    primaryEligibleForPensionExclusion,
    spouseEligibleForPensionExclusion
  );
  const defaultEligiblePensionIncomeForExclusion =
    eligiblePensionIncomeFromOwnershipTags === undefined
      ? undefined
      : Decimal.min(pensionIncome, eligiblePensionIncomeFromOwnershipTags);
  const pensionIncomeEligibleForExclusion =
    njConfig.pensionIncomeEligibleForExclusion ?? defaultEligiblePensionIncomeForExclusion;

  // === Dependent counts ===
  const dependentCount = taxInput.taxpayer.dependents.length;

  // Qualifying children age 5 or under for NJ CTC
  const qualifyingChildrenAge5OrUnder = taxInput.taxpayer.dependents.filter(
    (dep) => {
      const depAge = ageAsOf(dep.dateOfBirth, endOfYear);
      return depAge <= 5 && dep.qualifiesForCTC;
    }
  ).length;
  const qualifyingEICChildrenCount = taxInput.taxpayer.dependents.filter(
    (dep) => dep.qualifiesForEIC
  ).length;
  const hasAdult18OrOlderTaxpayer = primaryAge >= 18 || spouseAge62OrOlder || spouseAge65OrOlder
    || (taxInput.taxpayer.spouse
      ? ageAsOf(taxInput.taxpayer.spouse.dateOfBirth, endOfYear) >= 18
      : false);

  return {
    filingStatus,
    taxYear,
    monthsOfResidency: njConfig.monthsOfResidency ?? 12,

    // Income
    wages,
    taxableInterest,
    taxExemptInterest,
    otherStateTaxExemptInterest: njConfig.otherStateTaxExemptInterest,
    dividends,
    businessIncome,
    netGainsFromProperty,
    pensionIncome,
    partnershipIncome,
    sCorpIncome,
    rentalIncome,
    gamblingWinnings,
    gamblingLosses,
    alimonyReceived,
    otherIncome,

    // Adjustments
    alimonyPaid,
    qualifiesForPensionExclusion,
    pensionIncomeEligibleForExclusion,
    qualifiesForOtherRetirementExclusion,
    qualifiesForSpecialRetirementExclusion: njConfig.qualifiesForSpecialRetirementExclusion,
    otherRetirementIncomeExclusionCap: njConfig.otherRetirementIncomeExclusionCap,
    otherAdjustments,

    // Exemptions
    taxpayerAge65OrOlder,
    spouseAge65OrOlder,
    taxpayerBlindOrDisabled: njConfig.taxpayerBlindOrDisabled,
    spouseBlindOrDisabled: njConfig.spouseBlindOrDisabled,
    isVeteran: njConfig.isVeteran,
    spouseIsVeteran: njConfig.spouseIsVeteran,
    dependentCount,
    collegeDependentCount: njConfig.collegeDependentCount,
    njbestContributions: njConfig.njbestContributions,
    njclassLoanPayments: njConfig.njclassLoanPayments,
    tuitionPaidToNjInstitution: njConfig.tuitionPaidToNjInstitution,
    qualifiedConservationContribution:
      njConfig.qualifiedConservationContribution,
    healthEnterpriseZoneDeduction: njConfig.healthEnterpriseZoneDeduction,
    alternativeBusinessCalculationAdjustment:
      njConfig.alternativeBusinessCalculationAdjustment,

    // Property tax
    isHomeowner: njConfig.isHomeowner,
    isTenant: njConfig.isTenant,
    propertyTaxesPaid: njConfig.propertyTaxesPaid,
    rentPaid: njConfig.rentPaid,
    electPropertyTaxCredit: njConfig.electPropertyTaxCredit,
    sharedMainHomeWithSpouse: njConfig.sharedMainHomeWithSpouse,
    hasDisabledVeteranPropertyTaxExemption: njConfig.hasDisabledVeteranPropertyTaxExemption,
    madePilotPayments: njConfig.madePilotPayments,
    rentedTaxExemptProperty: njConfig.rentedTaxExemptProperty,

    // Medical expenses
    totalMedicalExpenses: njConfig.totalMedicalExpenses,
    insuranceReimbursements: njConfig.insuranceReimbursements,
    archerMSADeduction: supportedArcherMSADeduction,
    selfEmployedHealthInsuranceDeduction:
      supportedSelfEmployedHealthInsuranceDeduction,
    organDonationDeductionExpenses: njConfig.organDonationDeductionExpenses,

    // Credits
    federalEITC,
    qualifiesForChildlessAge18Exception: njConfig.qualifiesForChildlessAge18Exception,
    qualifyingEICChildrenCount,
    hasAdult18OrOlderTaxpayer,
    federalDependentCareCredit,
    qualifyingChildrenAge5OrUnder,
    providedCareToQualifyingServiceMember:
      njConfig.providedCareToQualifyingServiceMember,
    serviceMemberFederalDisabilityCompensation:
      njConfig.serviceMemberFederalDisabilityCompensation,
    onlyCaregiver: njConfig.onlyCaregiver,
    careExpensesSharePercent: njConfig.careExpensesSharePercent,
    shelteredWorkshopCurrentYearCredit:
      njConfig.shelteredWorkshopCurrentYearCredit,
    goldStarCounselingHours: njConfig.goldStarCounselingHours,
    goldStarTricareRate: njConfig.goldStarTricareRate,
    organDonorLeaveEvents: njConfig.organDonorLeaveEvents,

    // Other jurisdiction credit
    otherJurisdictions: njConfig.otherJurisdictions,

    // Health coverage mandate
    healthCoverageAdults: njConfig.healthCoverageAdults,
    healthCoverageChildren: njConfig.healthCoverageChildren,
    healthCoverageUncoveredMonths: njConfig.healthCoverageUncoveredMonths,
    healthCoverageDependentIncome: njConfig.healthCoverageDependentIncome,

    // Use tax
    useSafeHarbor: njConfig.useSafeHarbor,
    actualUseTax: njConfig.actualUseTax,

    // Excess payroll
    totalUIWFSWFWithheld: njConfig.totalUIWFSWFWithheld,
    totalDIWithheld: njConfig.totalDIWithheld,
    totalFLIWithheld: njConfig.totalFLIWithheld,
    privatePlanMaxDI: njConfig.privatePlanMaxDI,

    // Payments
    njWithholding: totalNJWithholding,
    estimatedPayments: totalLine57Payments,
    creditOverpaymentToNextYear: njConfig.creditOverpaymentToNextYear,
    endangeredWildlifeFundContribution:
      njConfig.endangeredWildlifeFundContribution,
    childrensTrustFundContribution: njConfig.childrensTrustFundContribution,
    vietnamVeteransMemorialFundContribution:
      njConfig.vietnamVeteransMemorialFundContribution,
    breastCancerResearchFundContribution:
      njConfig.breastCancerResearchFundContribution,
    ussNewJerseyEducationalMuseumFundContribution:
      njConfig.ussNewJerseyEducationalMuseumFundContribution,
    otherDesignatedContributions: njConfig.otherDesignatedContributions,
    passThroughBusinessAlternativeIncomeTaxCredit: totalPTBAITCredit,

    // Underpayment penalty
    priorYearTax: njConfig.priorYearTax,
    priorYearReturnFiled: njConfig.priorYearReturnFiled,
  };
}

function deriveEligiblePensionIncomeFromOwnershipTags(
  taxInput: TaxYearInput,
  endOfYear: Date,
  form1099Rs: NonNullable<TaxYearInput["form1099R"]>,
  primaryEligibleForPensionExclusion: boolean,
  spouseEligibleForPensionExclusion: boolean
): Decimal | undefined {
  if (primaryEligibleForPensionExclusion === spouseEligibleForPensionExclusion) {
    return undefined;
  }

  const eligibleAccountHolder = primaryEligibleForPensionExclusion
    ? "primary"
    : "spouse";
  const taggedEligibleForms = form1099Rs.filter(
    (form) => form.accountHolder === eligibleAccountHolder && !form.qualifiedRothDistribution
  );

  if (taggedEligibleForms.length === 0) {
    return undefined;
  }

  return taggedEligibleForms.reduce((acc, form) => {
    const taxable = getNJTaxable1099RDistributionAmount(taxInput, endOfYear, form);
    return taxable === null ? acc : acc.plus(taxable);
  }, new Decimal(0));
}
