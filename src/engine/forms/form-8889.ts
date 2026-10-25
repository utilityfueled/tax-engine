/**
 * Form 8889 HSA contribution deduction.
 * Spec: spec/federal/form-8889.yaml
 *
 * This slice implements Part I Lines 1-13 for the current-year HSA deduction,
 * Part II Lines 14a-17b for HSA distribution taxability, and Part III
 * Lines 18-21 for testing-period recapture.
 */

import Decimal from "decimal.js";
import type { FilingStatus, YearConstants } from "@/models/constants.js";
import type {
  Form8889Input,
  Form8889PriorYearRedeterminedLimitWorksheet,
  HsaCoverage,
  Taxpayer,
  W2,
} from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";

export interface Form8889Result {
  coverageType: HsaCoverage;
  line2: Decimal;
  line3: Decimal;
  line4: Decimal;
  line5: Decimal;
  line6: Decimal;
  line7: Decimal;
  line8: Decimal;
  line9: Decimal;
  line10: Decimal;
  line11: Decimal;
  line12: Decimal;
  line13: Decimal;
  line14a: Decimal;
  line14b: Decimal;
  line14c: Decimal;
  line15: Decimal;
  line16: Decimal;
  line17aHasException: boolean;
  line17b: Decimal;
  line18: Decimal;
  line19: Decimal;
  line20: Decimal;
  line21: Decimal;
  supportedReturnedExcessContributions: Decimal;
  supportedReturnedExcessContributionPrincipal: Decimal;
  lines: CalculatedLine[];
}

export function mergeW2Box12CodeWIntoForm8889Input(
  input: Form8889Input | undefined,
  w2s: W2[] = [],
  filingStatus?: FilingStatus
): Form8889Input | undefined {
  if (!input) {
    return undefined;
  }

  const hasOwnerTaggedW2s = w2s.some((w2) => w2.accountHolder !== undefined);
  const untaggedPositiveCodeWW2s = w2s.filter(
    (w2) => w2.accountHolder === undefined && d(w2.box12CodeW).greaterThan(0)
  );
  // On a spouse-owned Form 8889, untagged MFJ W-2 Box 12 code W amounts are
  // ambiguous, so the helper leaves Line 9 manual instead of guessing.
  const isJointReturn = filingStatus === "married_filing_jointly";
  const shouldSuppressAmbiguousSpouseDefault =
    isJointReturn && input.accountOwner === "spouse" && !hasOwnerTaggedW2s;
  const shouldSuppressAmbiguousJointReturnDefault =
    isJointReturn && !hasOwnerTaggedW2s && untaggedPositiveCodeWW2s.length > 1;
  const supportedW2EmployerContributions = sum(
    ...w2s
      .filter((w2) => {
        if (shouldSuppressAmbiguousSpouseDefault || shouldSuppressAmbiguousJointReturnDefault) {
          return false;
        }

        if (hasOwnerTaggedW2s) {
          // Once any owner-aware attribution exists, only explicit matches are
          // safe to auto-default; mixed tagged+untagged sets leave the
          // remaining untagged Box 12 code W amounts manual.
          return w2.accountHolder === input.accountOwner;
        }

        return true;
      })
      .map((w2) => d(w2.box12CodeW))
  );

  return {
    ...input,
    supportedW2EmployerContributions: supportedW2EmployerContributions.toString(),
  };
}

const COVERAGE_PRIORITY: Record<HsaCoverage, number> = {
  none: 0,
  self_only: 1,
  family: 2,
};

const HSA_ADDITIONAL_TAX_RATE = new Decimal(0.20);
const HSA_RECAPTURE_TAX_RATE = new Decimal(0.10);

interface HsaContributionLimitConstants {
  selfOnlyContributionLimit: Decimal;
  familyContributionLimit: Decimal;
  catchUpContribution: Decimal;
}

interface HsaContributionLimitComputation {
  age55OrOlder: boolean;
  coverageType: HsaCoverage;
  eligibleMonthCount: number;
  eligibleFamilyMonths: number;
  marriedUsesLine7CatchUp: boolean;
  eligibleOnDecemberFirst: boolean;
  decemberCoverage: HsaCoverage;
  monthlyWorksheetLimit: Decimal;
  lastMonthRuleAnnualLimit: Decimal;
  line3: Decimal;
  line4: Decimal;
  line5: Decimal;
  spouseAllocationApplies: boolean;
  spouseAllocationOverrideApplies: boolean;
  treatedAsFamilyCoverageForAllMonths: boolean;
  familyCoverageLine3: Decimal;
  familyCoverageLine5: Decimal;
  otherContributionLimit: Decimal;
  line6: Decimal;
  line7EligibleFamilyMonths: number;
  line7: Decimal;
  line8: Decimal;
}

function getAccountOwnerDateOfBirth(taxpayer: Taxpayer, accountOwner: Form8889Input["accountOwner"]): string {
  if (accountOwner === "primary") {
    return taxpayer.primary.dateOfBirth;
  }

  if (!taxpayer.spouse) {
    throw new Error("Form 8889 spouse account owner requires spouse taxpayer information");
  }

  return taxpayer.spouse.dateOfBirth;
}

function isAge55OrOlderAtYearEnd(dateOfBirth: string, taxYear: number): boolean {
  const birthDate = new Date(`${dateOfBirth}T00:00:00Z`);
  const yearEnd = new Date(Date.UTC(taxYear, 11, 31));
  let age = yearEnd.getUTCFullYear() - birthDate.getUTCFullYear();
  const hadBirthdayByYearEnd = (
    yearEnd.getUTCMonth() > birthDate.getUTCMonth()
    || (yearEnd.getUTCMonth() === birthDate.getUTCMonth()
      && yearEnd.getUTCDate() >= birthDate.getUTCDate())
  );
  if (!hadBirthdayByYearEnd) {
    age -= 1;
  }
  return age >= 55;
}

function isAge65OrOlderOnFirstDayOfTaxYear(dateOfBirth: string, taxYear: number): boolean {
  const birthDate = new Date(`${dateOfBirth}T00:00:00Z`);
  const firstDayOfYear = new Date(Date.UTC(taxYear, 0, 1));
  let age = firstDayOfYear.getUTCFullYear() - birthDate.getUTCFullYear();
  const hadBirthdayByFirstDay = (
    firstDayOfYear.getUTCMonth() > birthDate.getUTCMonth()
    || (firstDayOfYear.getUTCMonth() === birthDate.getUTCMonth()
      && firstDayOfYear.getUTCDate() >= birthDate.getUTCDate())
  );
  if (!hadBirthdayByFirstDay) {
    age -= 1;
  }
  return age >= 65;
}

function isMarried(filingStatus: FilingStatus): boolean {
  return filingStatus === "married_filing_jointly" || filingStatus === "married_filing_separately";
}

function annualContributionLimitForCoverage(
  coverage: Exclude<HsaCoverage, "none">,
  hsaLimits: HsaContributionLimitConstants,
  age55OrOlder: boolean,
  marriedUsesLine7CatchUp: boolean
): Decimal {
  let annualLimit = coverage === "family"
    ? hsaLimits.familyContributionLimit
    : hsaLimits.selfOnlyContributionLimit;

  if (age55OrOlder && !marriedUsesLine7CatchUp) {
    annualLimit = annualLimit.plus(hsaLimits.catchUpContribution);
  }

  return annualLimit;
}

function getHsaContributionLimitConstants(constants: YearConstants): HsaContributionLimitConstants {
  return {
    selfOnlyContributionLimit: constants.hsa.selfOnlyContributionLimit,
    familyContributionLimit: constants.hsa.familyContributionLimit,
    catchUpContribution: constants.hsa.catchUpContribution,
  };
}

function calculateContributionLimitComputation(
  ownerDateOfBirth: string,
  taxYear: number,
  filingStatus: FilingStatus,
  input: Pick<
    Form8889Input,
    | "coverageByMonth"
    | "spouseFamilyCoverageMonths"
    | "archerMSAContributions"
    | "bothSpousesHaveHsas"
    | "spouseAllocatedLimit"
    | "medicareMonths"
    | "isDependent"
  >,
  hsaLimits: HsaContributionLimitConstants,
  applyLastMonthRule: boolean
): HsaContributionLimitComputation {
  const medicareMonths = new Set(input.medicareMonths ?? []);
  const spouseFamilyCoverageMonths = new Set(input.spouseFamilyCoverageMonths ?? []);
  const eligibleMonthCount = input.isDependent ? 0 : 12 - medicareMonths.size;
  const age55OrOlder = isAge55OrOlderAtYearEnd(ownerDateOfBirth, taxYear);
  const married = isMarried(filingStatus);
  const effectiveCoverageByMonth = input.coverageByMonth.map((coverage, index) => (
    spouseFamilyCoverageMonths.has(index + 1) ? "family" : coverage
  ));
  const decemberCoverage = effectiveCoverageByMonth[11];
  const eligibleOnDecemberFirst = applyLastMonthRule
    && decemberCoverage !== "none"
    && !input.isDependent
    && !medicareMonths.has(12);

  const eligibleCoverageMonths = effectiveCoverageByMonth.filter((coverage, index) => (
    coverage !== "none"
    && !input.isDependent
    && !medicareMonths.has(index + 1)
  ));
  const eligibleFamilyMonths = effectiveCoverageByMonth.filter((coverage, index) => (
    coverage === "family"
    && !input.isDependent
    && !medicareMonths.has(index + 1)
  )).length;
  const marriedUsesLine7CatchUp = married && eligibleFamilyMonths > 0;
  const coverageType = eligibleCoverageMonths.reduce<HsaCoverage>((current, coverage) => (
    COVERAGE_PRIORITY[coverage] > COVERAGE_PRIORITY[current] ? coverage : current
  ), "none");

  const monthlyWorksheetLimit = effectiveCoverageByMonth.reduce((total, coverage, index) => {
    const month = index + 1;
    if (coverage === "none" || input.isDependent || medicareMonths.has(month)) {
      return total;
    }

    return total.plus(
      annualContributionLimitForCoverage(coverage, hsaLimits, age55OrOlder, marriedUsesLine7CatchUp)
    );
  }, new Decimal(0)).dividedBy(12);
  const lastMonthRuleAnnualLimit = eligibleOnDecemberFirst
    ? annualContributionLimitForCoverage(
      decemberCoverage as Exclude<HsaCoverage, "none">,
      hsaLimits,
      age55OrOlder,
      marriedUsesLine7CatchUp
    )
    : new Decimal(0);
  const line3 = eligibleOnDecemberFirst
    ? Decimal.max(monthlyWorksheetLimit, lastMonthRuleAnnualLimit)
    : monthlyWorksheetLimit;

  const line4 = d(input.archerMSAContributions);
  const line5 = Decimal.max(new Decimal(0), line3.minus(line4));

  const spouseAllocationApplies = married && input.bothSpousesHaveHsas && eligibleFamilyMonths > 0;
  const treatedAsFamilyCoverageForAllMonths = spouseAllocationApplies && (
    (eligibleOnDecemberFirst && decemberCoverage === "family")
    || (eligibleMonthCount === 12 && effectiveCoverageByMonth.every((coverage) => coverage === "family"))
  );
  const familyCoverageLine3 = effectiveCoverageByMonth.reduce((total, coverage, index) => {
    const month = index + 1;
    if (coverage !== "family" || input.isDependent || medicareMonths.has(month)) {
      return total;
    }

    return total.plus(hsaLimits.familyContributionLimit);
  }, new Decimal(0)).dividedBy(12);
  const familyCoverageLine5 = Decimal.max(new Decimal(0), familyCoverageLine3.minus(line4));
  const otherContributionLimit = spouseAllocationApplies && !treatedAsFamilyCoverageForAllMonths
    ? Decimal.max(new Decimal(0), line5.minus(familyCoverageLine5))
    : new Decimal(0);
  const defaultSpouseAllocatedLimit = spouseAllocationApplies
    ? treatedAsFamilyCoverageForAllMonths
      ? line5.dividedBy(2)
      : familyCoverageLine5.dividedBy(2).plus(otherContributionLimit)
    : line5;
  const spouseAllocationOverrideApplies = spouseAllocationApplies && input.spouseAllocatedLimit !== undefined;
  const line6 = !spouseAllocationOverrideApplies
    ? defaultSpouseAllocatedLimit
    : Decimal.min(line5, Decimal.max(new Decimal(0), d(input.spouseAllocatedLimit)));

  const line7EligibleFamilyMonths = eligibleOnDecemberFirst && decemberCoverage === "family"
    ? eligibleMonthCount
    : eligibleFamilyMonths;
  const line7 = age55OrOlder && married
    ? hsaLimits.catchUpContribution.times(line7EligibleFamilyMonths).dividedBy(12)
    : new Decimal(0);

  return {
    age55OrOlder,
    coverageType,
    eligibleMonthCount,
    eligibleFamilyMonths,
    marriedUsesLine7CatchUp,
    eligibleOnDecemberFirst,
    decemberCoverage,
    monthlyWorksheetLimit,
    lastMonthRuleAnnualLimit,
    line3,
    line4,
    line5,
    spouseAllocationApplies,
    spouseAllocationOverrideApplies,
    treatedAsFamilyCoverageForAllMonths,
    familyCoverageLine3,
    familyCoverageLine5,
    otherContributionLimit,
    line6,
    line7EligibleFamilyMonths,
    line7,
    line8: line6.plus(line7),
  };
}

function calculatePriorYearRedeterminedLimit(
  taxpayer: Taxpayer,
  accountOwner: Form8889Input["accountOwner"],
  worksheet: Form8889PriorYearRedeterminedLimitWorksheet | undefined
): Decimal {
  if (!worksheet) {
    return new Decimal(0);
  }

  const ownerDateOfBirth = getAccountOwnerDateOfBirth(taxpayer, accountOwner);
  const priorYearTaxYear = taxpayer.taxYear - 1;
  const filingStatus = (worksheet.filingStatus ?? taxpayer.filingStatus) as FilingStatus;
  const computation = calculateContributionLimitComputation(
    ownerDateOfBirth,
    priorYearTaxYear,
    filingStatus,
    {
      coverageByMonth: worksheet.coverageByMonth,
      spouseFamilyCoverageMonths: worksheet.spouseFamilyCoverageMonths,
      archerMSAContributions: worksheet.archerMSAContributions,
      bothSpousesHaveHsas: worksheet.bothSpousesHaveHsas,
      spouseAllocatedLimit: worksheet.spouseAllocatedLimit,
      medicareMonths: worksheet.medicareMonths,
      isDependent: worksheet.isDependent,
    },
    {
      selfOnlyContributionLimit: d(worksheet.selfOnlyContributionLimit),
      familyContributionLimit: d(worksheet.familyContributionLimit),
      catchUpContribution: d(worksheet.catchUpContribution),
    },
    false
  );

  return computation.line8;
}

export function calculateForm8889(
  taxpayer: Taxpayer,
  input: Form8889Input,
  constants: YearConstants
): Form8889Result {
  const audit = new AuditTrail();
  const ownerDateOfBirth = getAccountOwnerDateOfBirth(taxpayer, input.accountOwner);
  const age65OrOlderOnFirstDayOfYear = isAge65OrOlderOnFirstDayOfTaxYear(ownerDateOfBirth, taxpayer.taxYear);
  const filingStatus = taxpayer.filingStatus as FilingStatus;
  const married = isMarried(filingStatus);
  const contributionLimitComputation = calculateContributionLimitComputation(
    ownerDateOfBirth,
    taxpayer.taxYear,
    filingStatus,
    input,
    getHsaContributionLimitConstants(constants),
    input.useLastMonthRule !== false
  );
  if (taxpayer.taxYear >= 2026 && input.useLastMonthRule === undefined) {
    const monthlyMethod = calculateContributionLimitComputation(
      ownerDateOfBirth, taxpayer.taxYear, filingStatus, input,
      getHsaContributionLimitConstants(constants), false
    );
    if (!monthlyMethod.line8.eq(contributionLimitComputation.line8)) {
      throw new Error("Form 8889 requires an actual last-month-rule choice when it changes the contribution limit");
    }
  }
  const {
    coverageType,
    age55OrOlder,
    marriedUsesLine7CatchUp,
    eligibleOnDecemberFirst,
    decemberCoverage,
    monthlyWorksheetLimit,
    lastMonthRuleAnnualLimit,
    line3,
    line4,
    line5,
    spouseAllocationApplies,
    spouseAllocationOverrideApplies,
    treatedAsFamilyCoverageForAllMonths,
    familyCoverageLine3,
    familyCoverageLine5,
    otherContributionLimit,
    line6,
    line7EligibleFamilyMonths,
    line7,
    line8,
  } = contributionLimitComputation;
  const line1Code = new Decimal(COVERAGE_PRIORITY[coverageType]);

  const line2 = d(input.contributionsMade);
  const supportedW2EmployerContributions = Decimal.max(new Decimal(0), d(input.supportedW2EmployerContributions));
  const line9 = input.employerContributions === undefined
    ? supportedW2EmployerContributions
    : d(input.employerContributions);
  const line10 = d(input.qualifiedFundingDistribution);
  const line11 = line9.plus(line10);
  const line12 = Decimal.max(new Decimal(0), line8.minus(line11));
  const line13 = Decimal.min(line2, line12);
  const supported1099SAGrossDistributions = Decimal.max(new Decimal(0), d(input.supported1099SAGrossDistributions));
  const line14a = input.distributionsReceived === undefined
    ? supported1099SAGrossDistributions
    : Decimal.max(new Decimal(0), d(input.distributionsReceived));
  const supported1099SAReturnedExcessContributions = Decimal.max(
    new Decimal(0),
    d(input.supported1099SAReturnedExcessContributions)
  );
  const returnedExcessEarnings = d(input.supported1099SAReturnedExcessContributionEarnings);
  if (!returnedExcessEarnings.isFinite() || returnedExcessEarnings.lt(0)
    || returnedExcessEarnings.gt(supported1099SAReturnedExcessContributions)) {
    throw new Error("Form1099-SA returned-excess Box2 earnings must be included within gross Box1");
  }
  const supportedReturnedExcessContributionPrincipal = supported1099SAReturnedExcessContributions.minus(returnedExcessEarnings);
  const rolloverDistributions = Decimal.max(new Decimal(0), d(input.rolloverDistributions));
  const line14bDefaultAmount = rolloverDistributions.plus(supported1099SAReturnedExcessContributions);
  const line14b = input.excludedDistributions === undefined
    ? Decimal.min(line14a, line14bDefaultAmount)
    : Decimal.min(line14a, Decimal.max(new Decimal(0), d(input.excludedDistributions)));
  const line14c = Decimal.max(new Decimal(0), line14a.minus(line14b));
  const supported1099SADeathDistributionDateOfDeathValue = Decimal.max(
    new Decimal(0),
    d(input.supported1099SADeathDistributionDateOfDeathValue)
  );
  const supported1099SAOtherBeneficiaryDeathDistributionDateOfDeathValue = Decimal.max(
    new Decimal(0),
    d(input.supported1099SAOtherBeneficiaryDeathDistributionDateOfDeathValue)
  );
  const supported1099SAEstateDeathDistributionDateOfDeathValue = Decimal.max(
    new Decimal(0),
    d(input.supported1099SAEstateDeathDistributionDateOfDeathValue)
  );
  const supported1099SADisabilityExceptionDistributions = Decimal.max(
    new Decimal(0),
    d(input.supported1099SADisabilityExceptionDistributions)
  );
  const supported1099SAAutomaticExceptionDistributions = Decimal.max(
    supported1099SADeathDistributionDateOfDeathValue.plus(supported1099SADisabilityExceptionDistributions),
    new Decimal(0),
    d(input.supported1099SAAutomaticExceptionDistributions)
  );
  const supported1099SAProhibitedTransactionDistributions = Decimal.max(
    new Decimal(0),
    d(input.supported1099SAProhibitedTransactionDistributions)
  );
  const deemedDistributionInput = input.prohibitedTransactionDistributions === undefined
    ? supported1099SAProhibitedTransactionDistributions
    : Decimal.max(new Decimal(0), d(input.prohibitedTransactionDistributions));
  const prohibitedTransactionDistributions = Decimal.min(
    line14c,
    deemedDistributionInput
  );
  const medicalExpenseEligibleDistributions = Decimal.max(new Decimal(0), line14c.minus(prohibitedTransactionDistributions));
  const estateDeathDistributionMedicalExpenseDisallowedAmount = Decimal.min(
    medicalExpenseEligibleDistributions,
    supported1099SAEstateDeathDistributionDateOfDeathValue
  );
  const supportedUnknownBeneficiaryDeathDistributionDateOfDeathValue = Decimal.max(
    new Decimal(0),
    supported1099SADeathDistributionDateOfDeathValue
      .minus(supported1099SAEstateDeathDistributionDateOfDeathValue)
      .minus(supported1099SAOtherBeneficiaryDeathDistributionDateOfDeathValue)
  );
  const medicalExpenseEligibleDistributionsAfterEstateDeath = Decimal.max(
    new Decimal(0),
    medicalExpenseEligibleDistributions.minus(estateDeathDistributionMedicalExpenseDisallowedAmount)
  );
  const otherBeneficiaryDeathDistributionEligibleAmount = Decimal.min(
    medicalExpenseEligibleDistributionsAfterEstateDeath,
    supported1099SAOtherBeneficiaryDeathDistributionDateOfDeathValue
  );
  const ordinaryMedicalExpenseEligibleDistributions = Decimal.max(
    new Decimal(0),
    medicalExpenseEligibleDistributionsAfterEstateDeath.minus(otherBeneficiaryDeathDistributionEligibleAmount)
  );
  const qualifiedMedicalExpenses = Decimal.max(new Decimal(0), d(input.qualifiedMedicalExpenses));
  const decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath = Decimal.max(
    new Decimal(0),
    d(input.decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath)
  );
  const ordinaryQualifiedMedicalExpenseOffset = Decimal.min(
    ordinaryMedicalExpenseEligibleDistributions,
    qualifiedMedicalExpenses
  );
  const beneficiaryPostDeathMedicalExpenseOffset = Decimal.min(
    otherBeneficiaryDeathDistributionEligibleAmount,
    decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath
  );
  const line15 = ordinaryQualifiedMedicalExpenseOffset.plus(beneficiaryPostDeathMedicalExpenseOffset);
  const line16 = Decimal.max(new Decimal(0), line14c.minus(line15));
  const supportedPostAge65Distributions = age65OrOlderOnFirstDayOfYear
    ? new Decimal(0)
    : Decimal.max(new Decimal(0), d(input.distributionsAfterAge65));
  const line17aInputAmount = Decimal.max(new Decimal(0), d(input.distributionsNotSubjectToAdditionalTax));
  const line17aSupportedExceptionAmount = supported1099SAAutomaticExceptionDistributions.plus(
    supportedPostAge65Distributions
  );
  const line17aInputIncludesSupportedAmount = line17aInputAmount.greaterThanOrEqualTo(
    line17aSupportedExceptionAmount
  );
  const validatedManualExceptionAmount = line17aInputIncludesSupportedAmount
    ? Decimal.max(
      new Decimal(0),
      line17aInputAmount.minus(line17aSupportedExceptionAmount)
    )
    : line17aInputAmount;
  const line17aTotalExceptionAmount = line17aInputIncludesSupportedAmount
    ? line17aInputAmount
    : line17aSupportedExceptionAmount.plus(validatedManualExceptionAmount);
  const line17aExemptAmount = age65OrOlderOnFirstDayOfYear
    ? line16
    : Decimal.min(
      line16,
      line17aTotalExceptionAmount
    );
  const line17aHasException = line17aExemptAmount.greaterThan(0);
  const line17b = Decimal.max(new Decimal(0), line16.minus(line17aExemptAmount)).times(HSA_ADDITIONAL_TAX_RATE);
  const supportedPriorYearRedeterminedLimit = calculatePriorYearRedeterminedLimit(
    taxpayer,
    input.accountOwner,
    input.priorYearRedeterminedLimitWorksheet
  );
  const testingPeriodFailureDueToDeathOrDisability = input.testingPeriodFailureDueToDeathOrDisability ?? false;
  const hasManualRedeterminedLimit = input.lastMonthRuleRedeterminedLimit !== undefined;
  const hasSupportedRedeterminedLimitWorksheet = input.priorYearRedeterminedLimitWorksheet !== undefined;
  const hasRedeterminedLimitSupport = hasManualRedeterminedLimit || hasSupportedRedeterminedLimitWorksheet;
  if (taxpayer.taxYear >= 2026 && d(input.lastMonthRuleContributions).gt(0)
    && !testingPeriodFailureDueToDeathOrDisability && !hasRedeterminedLimitSupport) {
    throw new Error("Form 8889 testing-period recapture requires the actual prior-year redetermined limit or worksheet");
  }
  const line18RedeterminedLimit = input.lastMonthRuleRedeterminedLimit === undefined
    ? supportedPriorYearRedeterminedLimit
    : Decimal.max(new Decimal(0), d(input.lastMonthRuleRedeterminedLimit));
  const line18RedeterminedLimitSource = testingPeriodFailureDueToDeathOrDisability
    ? "death_or_disability_exception"
    : !hasRedeterminedLimitSupport
      ? "missing_support"
      : hasManualRedeterminedLimit
        ? "validated_manual_override"
        : "supported_prior_year_worksheet";
  const line18 = testingPeriodFailureDueToDeathOrDisability
    ? new Decimal(0)
    : !hasRedeterminedLimitSupport
      ? new Decimal(0)
    : Decimal.max(
      new Decimal(0),
      d(input.lastMonthRuleContributions).minus(line18RedeterminedLimit)
    );
  const line19 = testingPeriodFailureDueToDeathOrDisability
    ? new Decimal(0)
    : Decimal.max(new Decimal(0), d(input.recaptureQualifiedFundingDistribution));
  const line20 = line18.plus(line19);
  const line21 = line20.times(HSA_RECAPTURE_TAX_RATE);
  const ownerAwareInputs = (inputs: Record<string, Decimal | string> = {}): Record<string, Decimal | string> => ({
    "Account owner": input.accountOwner,
    ...inputs,
  });

  audit.record(
    "Form 8889",
    "1",
    "Coverage type indicator (0 none, 1 self-only, 2 family)",
    line1Code,
    "Highest eligible HDHP coverage type for the year",
    ownerAwareInputs({
      coverageType,
    })
  );
  audit.record(
    "Form 8889",
    "2",
    "HSA contributions made by the filer outside payroll withholding",
    line2,
    "Current-year after-tax HSA contributions",
    ownerAwareInputs()
  );
  audit.record("Form 8889", "3", "Annual HSA contribution limit before Archer MSA and spouse allocation adjustments", line3,
    eligibleOnDecemberFirst
      ? "Greater of the monthly eligible HSA worksheet total or the full-year limit for the December 1 coverage type under the last-month rule"
      : "Monthly eligible HSA contribution limits divided by 12",
    ownerAwareInputs({
    age55OrOlder: age55OrOlder ? "true" : "false",
    filingStatus: taxpayer.filingStatus,
    marriedUsesLine7CatchUp: marriedUsesLine7CatchUp ? "true" : "false",
    useLastMonthRule: input.useLastMonthRule === undefined ? "unknown_legacy_choice" : String(input.useLastMonthRule),
    eligibleOnDecemberFirst: eligibleOnDecemberFirst ? "true" : "false",
    decemberCoverage,
    spouseFamilyCoverageMonths: input.spouseFamilyCoverageMonths?.join(",") || "none",
    monthlyWorksheetLimit,
    lastMonthRuleAnnualLimit,
  }));
  audit.record(
    "Form 8889",
    "4",
    "Archer MSA contributions",
    line4,
    "Current-year Archer MSA contributions",
    ownerAwareInputs()
  );
  audit.record("Form 8889", "5", "Contribution limit after Archer MSA reduction", line5, "max(0, Line 3 - Line 4)", ownerAwareInputs({
    "Line 3": line3,
    "Line 4": line4,
  }));
  audit.record("Form 8889", "6", "Allocated contribution limit after spouse family-coverage split", line6,
    spouseAllocationOverrideApplies
      ? "Direct spouse allocation override"
      : spouseAllocationApplies
        ? treatedAsFamilyCoverageForAllMonths
          ? "Line 5 / 2 because both spouses have separate HSAs and family coverage applies for each month"
          : "Refigured family-coverage Line 5 amount / 2 plus the remaining non-family contribution limit because both spouses have separate HSAs"
        : input.spouseAllocatedLimit !== undefined
          ? "Line 5 because the spouse allocation override is ignored unless both spouses have separate HSAs and family coverage applies"
          : "Line 5",
    ownerAwareInputs({
      "Line 5": line5,
      bothSpousesHaveHsas: input.bothSpousesHaveHsas ? "true" : "false",
      treatedAsFamilyCoverageForAllMonths: treatedAsFamilyCoverageForAllMonths ? "true" : "false",
      spouseFamilyCoverageMonths: input.spouseFamilyCoverageMonths?.join(",") || "none",
      familyCoverageLine3,
      familyCoverageLine5,
      otherContributionLimit,
      spouseAllocatedLimit: input.spouseAllocatedLimit ?? "none",
    }));
  audit.record("Form 8889", "7", "Additional contribution amount for married account beneficiaries age 55 or older", line7,
    age55OrOlder && married
      ? eligibleOnDecemberFirst && decemberCoverage === "family"
        ? "$1,000 × full eligible year under the family-coverage last-month rule"
        : "$1,000 × eligible family-coverage months / 12"
      : "$0 because catch-up does not apply on Line 7",
    ownerAwareInputs({
      eligibleFamilyMonths: line7EligibleFamilyMonths.toString(),
      marriedUsesLine7CatchUp: marriedUsesLine7CatchUp ? "true" : "false",
      useLastMonthRule: input.useLastMonthRule === undefined ? "unknown_legacy_choice" : String(input.useLastMonthRule),
      eligibleOnDecemberFirst: eligibleOnDecemberFirst ? "true" : "false",
      decemberCoverage,
      spouseFamilyCoverageMonths: input.spouseFamilyCoverageMonths?.join(",") || "none",
    }));
  audit.record("Form 8889", "8", "Contribution ceiling before employer contributions", line8, "Line 6 + Line 7", ownerAwareInputs({
    "Line 6": line6,
    "Line 7": line7,
  }));
  audit.record("Form 8889", "9", "Employer contributions made to the HSA", line9,
    input.employerContributions === undefined
      ? "Supported W-2 Box 12 code W employer HSA contributions including salary-reduction amounts made through a cafeteria plan"
      : "Validated Form 8889 Line 9 employer HSA contributions, including W-2 Box 12 code W amounts when manually summarized",
    ownerAwareInputs({
      "Validated Form 8889 Line 9 input": input.employerContributions ?? "0",
      "Supported W-2 Box 12 code W employer contributions": supportedW2EmployerContributions,
    }));
  audit.record(
    "Form 8889",
    "10",
    "Qualified HSA funding distributions from an IRA",
    line10,
    "Qualified HSA funding distributions",
    ownerAwareInputs({
      "Qualified funding distribution source": input.qualifiedFundingDistributionSource ?? "none",
    })
  );
  audit.record("Form 8889", "11", "Total nontaxable HSA contributions", line11, "Line 9 + Line 10", ownerAwareInputs({
    "Line 9": line9,
    "Line 10": line10,
  }));
  audit.record("Form 8889", "12", "Remaining deductible room after employer and funding contributions", line12, "max(0, Line 8 - Line 11)", ownerAwareInputs({
    "Line 8": line8,
    "Line 11": line11,
  }));
  audit.record("Form 8889", "13", "HSA deduction carried to Schedule 1 Line 13", line13, "min(Line 2, Line 12)", ownerAwareInputs({
    "Line 2": line2,
    "Line 12": line12,
  }));
  audit.record("Form 8889", "14a", "Total HSA distributions received during the year", line14a,
    "Validated Form 8889 Line 14a input or supported Form 1099-SA gross-distribution amount, including death-distribution Box 4 fair market value and prohibited-transaction deemed distributions when present",
    ownerAwareInputs({
      "Validated Form 8889 Line 14a input": input.distributionsReceived ?? "0",
      "Supported Form 1099-SA gross distributions": supported1099SAGrossDistributions,
      "Supported Form 1099-SA death-distribution amount": supported1099SADeathDistributionDateOfDeathValue,
      "Supported Form 1099-SA prohibited-transaction distributions": supported1099SAProhibitedTransactionDistributions,
    }));
  audit.record("Form 8889", "14b", "Excluded HSA distributions", line14b,
    "Validated Form 8889 Line 14b input or validated HSA rollover distributions plus supported Form 1099-SA returned excess contributions, limited to Line 14a",
    ownerAwareInputs({
      "Line 14a": line14a,
      "Validated Form 8889 Line 14b input": input.excludedDistributions ?? "0",
      "Validated HSA rollover distributions": input.rolloverDistributions ?? "0",
      "Supported Form 1099-SA returned excess contributions": supported1099SAReturnedExcessContributions,
    }));
  audit.record("Form 8889", "14c", "Net HSA distributions after exclusions", line14c, "Line 14a - Line 14b", ownerAwareInputs({
    "Line 14a": line14a,
    "Line 14b": line14b,
  }));
  audit.record("Form 8889", "15", "Qualified medical expenses paid from the HSA", line15,
    "Ordinary qualified medical expenses limited to non-death distributions plus decedent qualified medical expenses paid within 1 year after death limited to supported non-estate death distributions, after removing prohibited-transaction deemed distributions and supported estate death-distribution amounts",
    ownerAwareInputs({
      "Line 14c": line14c,
      prohibitedTransactionDistributions,
      medicalExpenseEligibleDistributions,
      medicalExpenseEligibleDistributionsAfterEstateDeath,
      supportedOtherBeneficiaryDeathDistributionDateOfDeathValue:
        supported1099SAOtherBeneficiaryDeathDistributionDateOfDeathValue,
      supportedUnknownBeneficiaryDeathDistributionDateOfDeathValue,
      otherBeneficiaryDeathDistributionEligibleAmount,
      ordinaryMedicalExpenseEligibleDistributions,
      estateDeathDistributionMedicalExpenseDisallowedAmount,
      qualifiedMedicalExpenses: input.qualifiedMedicalExpenses ?? "0",
      decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath:
        input.decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath ?? "0",
      ordinaryQualifiedMedicalExpenseOffset,
      beneficiaryPostDeathMedicalExpenseOffset,
    }));
  audit.record("Form 8889", "16", "Taxable HSA distributions", line16, "max(0, Line 14c - Line 15)", ownerAwareInputs({
    "Line 14c": line14c,
    "Line 15": line15,
  }));
  audit.record("Form 8889", "17a", "Exception applies to part of the taxable HSA distribution",
    new Decimal(line17aHasException ? 1 : 0),
    age65OrOlderOnFirstDayOfYear
      ? "1 because the beneficiary was already age 65 on January 1, so all Line 16 distributions are treated as post-age-65"
      : line17aHasException
        ? "1 because part of Line 16 is covered by a supported post-age-65, disability, death, or validated manual exception amount"
        : "0 because no supported exception applies",
    ownerAwareInputs({
      "Line 16": line16,
      exemptAmount: line17aExemptAmount,
      "Total supported and manual exception amount before Line 16 cap": line17aTotalExceptionAmount,
      "Line 17a input amount before Line 16 cap": line17aInputAmount,
      "Validated post-age-65 distributions": supportedPostAge65Distributions,
      "Supported Form 1099-SA disability exception distributions": supported1099SADisabilityExceptionDistributions,
      "Supported Form 1099-SA death-distribution exception amount":
        supported1099SADeathDistributionDateOfDeathValue,
      "Supported Form 1099-SA automatic exception distributions": supported1099SAAutomaticExceptionDistributions,
      "Validated manual exception amount": validatedManualExceptionAmount,
      age65OrOlderOnFirstDayOfYear: age65OrOlderOnFirstDayOfYear ? "true" : "false",
    }));
  audit.record("Form 8889", "17b", "Additional tax on taxable HSA distributions", line17b,
    age65OrOlderOnFirstDayOfYear
      ? "$0 because the beneficiary was already age 65 on January 1"
      : "20% × taxable HSA distributions not covered by supported post-age-65, disability, death, or validated manual exceptions",
    ownerAwareInputs({
      "Line 16": line16,
      exemptAmount: line17aExemptAmount,
      "Total supported and manual exception amount before Line 16 cap": line17aTotalExceptionAmount,
      "Line 17a input amount before Line 16 cap": line17aInputAmount,
      "Validated post-age-65 distributions": supportedPostAge65Distributions,
      "Supported Form 1099-SA disability exception distributions": supported1099SADisabilityExceptionDistributions,
      "Supported Form 1099-SA death-distribution exception amount":
        supported1099SADeathDistributionDateOfDeathValue,
      "Supported Form 1099-SA automatic exception distributions": supported1099SAAutomaticExceptionDistributions,
      "Validated manual exception amount": validatedManualExceptionAmount,
      age65OrOlderOnFirstDayOfYear: age65OrOlderOnFirstDayOfYear ? "true" : "false",
    }));
  audit.record("Form 8889", "18", "Income recapture from failing the last-month-rule testing period", line18,
    testingPeriodFailureDueToDeathOrDisability
      ? "$0 because the testing-period failure was caused by death or disability"
      : !hasRedeterminedLimitSupport
        ? "$0 because neither a manual redetermined limit nor supported prior-year worksheet inputs were provided for the required Line 18 recomputation"
      : input.lastMonthRuleRedeterminedLimit === undefined
        ? "max(0, prior-year last-month-rule contributions - supported recomputed prior-year redetermined contribution limit)"
        : "max(0, prior-year last-month-rule contributions - validated prior-year redetermined contribution limit)",
    ownerAwareInputs({
      lastMonthRuleContributions: input.lastMonthRuleContributions ?? "0",
      "Validated prior-year redetermined contribution limit": input.lastMonthRuleRedeterminedLimit ?? "none",
      "Supported recomputed prior-year redetermined contribution limit": supportedPriorYearRedeterminedLimit,
      "Redetermined limit source": line18RedeterminedLimitSource,
      "Missing redetermined-limit support": !hasRedeterminedLimitSupport ? "true" : "false",
      "Current return filing status": taxpayer.filingStatus,
      "Supported prior-year worksheet filing status":
        input.priorYearRedeterminedLimitWorksheet?.filingStatus ?? "none",
      "Unsupported prior-year worksheet context": "none",
      testingPeriodFailureDueToDeathOrDisability: testingPeriodFailureDueToDeathOrDisability ? "true" : "false",
    }));
  audit.record("Form 8889", "19", "Qualified HSA funding distribution recapture", line19,
    testingPeriodFailureDueToDeathOrDisability
      ? "$0 because the testing-period failure was caused by death or disability"
      : "Qualified HSA funding distribution amount subject to testing-period recapture",
    ownerAwareInputs({
      recaptureQualifiedFundingDistribution: input.recaptureQualifiedFundingDistribution ?? "0",
      testingPeriodFailureDueToDeathOrDisability: testingPeriodFailureDueToDeathOrDisability ? "true" : "false",
    }));
  audit.record("Form 8889", "20", "Total HSA recapture income", line20, "Line 18 + Line 19", ownerAwareInputs({
    "Line 18": line18,
    "Line 19": line19,
    testingPeriodFailureDueToDeathOrDisability: testingPeriodFailureDueToDeathOrDisability ? "true" : "false",
  }));
  audit.record("Form 8889", "21", "Additional tax on HSA recapture income", line21, "10% × Line 20", ownerAwareInputs({
    "Line 20": line20,
    testingPeriodFailureDueToDeathOrDisability: testingPeriodFailureDueToDeathOrDisability ? "true" : "false",
  }));

  return {
    coverageType,
    line2,
    line3,
    line4,
    line5,
    line6,
    line7,
    line8,
    line9,
    line10,
    line11,
    line12,
    line13,
    line14a,
    line14b,
    line14c,
    line15,
    line16,
    line17aHasException,
    line17b,
    line18,
    line19,
    line20,
    line21,
    supportedReturnedExcessContributions: supported1099SAReturnedExcessContributions,
    supportedReturnedExcessContributionPrincipal,
    lines: audit.getLines(),
  };
}
