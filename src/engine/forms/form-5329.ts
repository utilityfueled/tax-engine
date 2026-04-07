/**
 * Form 5329 additional tax on early distributions and excess contributions.
 * Spec: spec/federal/form-5329.yaml
 *
 * Implements all nine parts of Form 5329:
 * - Part I (Lines 1-4): Early distributions from IRAs and qualified plans
 * - Part II (Lines 5-8): 10% additional tax on Coverdell ESA/QTP/ABLE distributions
 * - Part III (Lines 9-17): 6% excise on excess contributions to traditional IRAs
 * - Part IV (Lines 18-25): 6% excise on excess contributions to Roth IRAs
 * - Part V (Lines 26-33): 6% excise on excess contributions to Coverdell ESAs
 * - Part VI (Lines 34-41): 6% excise on excess contributions to Archer MSAs
 * - Part VII (Lines 42-49): 6% excise on excess contributions to HSAs
 * - Part VIII (Lines 50-53): 6% excise on excess contributions to ABLE accounts
 * - Part IX (Lines 54-57): Additional tax on excess accumulations (RMD penalty)
 */

import Decimal from "decimal.js";
import type { Form5329Input } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d } from "@/utils/decimal.js";

export interface Form5329Result {
  // Part I
  line1: Decimal;
  line2: Decimal;
  line2ExceptionNumber?: string;
  line3: Decimal;
  line4: Decimal;
  simpleIRADistributionsWithinFirstTwoYears: Decimal;
  // Part II
  line5: Decimal;
  line6: Decimal;
  line7: Decimal;
  line8: Decimal;
  // Part III
  line9: Decimal;
  line10: Decimal;
  line11: Decimal;
  line12: Decimal;
  line13: Decimal;
  line14: Decimal;
  line15: Decimal;
  line16: Decimal;
  line17: Decimal;
  // Part IV
  line18: Decimal;
  line19: Decimal;
  line20: Decimal;
  line21: Decimal;
  line22: Decimal;
  line23: Decimal;
  line24: Decimal;
  line25: Decimal;
  // Part V
  line26: Decimal;
  line27: Decimal;
  line28: Decimal;
  line29: Decimal;
  line30: Decimal;
  line31: Decimal;
  line32: Decimal;
  line33: Decimal;
  // Part VI
  line34: Decimal;
  line35: Decimal;
  line36: Decimal;
  line37: Decimal;
  line38: Decimal;
  line39: Decimal;
  line40: Decimal;
  line41: Decimal;
  // Part VII
  line42: Decimal;
  line43: Decimal;
  line44: Decimal;
  line45: Decimal;
  line46: Decimal;
  line47: Decimal;
  line48: Decimal;
  line49: Decimal;
  // Part VIII
  line50: Decimal;
  line51: Decimal;
  line52: Decimal;
  line53: Decimal;
  // Part IX
  line54: Decimal;
  line55: Decimal;
  line56: Decimal;
  line57: Decimal;
  // Combined
  totalAdditionalTax: Decimal;
  lines: CalculatedLine[];
}

const EARLY_DISTRIBUTION_TAX_RATE = new Decimal(0.10);
const SIMPLE_IRA_EXTRA_TAX_RATE = new Decimal(0.15);
const SEPARATION_FROM_SERVICE_AFTER_AGE_55_EXCEPTION_NUMBER = "01";
const SUBSTANTIALLY_EQUAL_PERIODIC_PAYMENTS_EXCEPTION_NUMBER = "02";
const DISABILITY_EXCEPTION_NUMBER = "03";
const DEATH_EXCEPTION_NUMBER = "04";
const QUALIFIED_DOMESTIC_RELATIONS_ORDER_EXCEPTION_NUMBER = "06";
const MEDICAL_EXPENSE_EXCEPTION_NUMBER = "05";
const UNEMPLOYED_HEALTH_INSURANCE_PREMIUM_EXCEPTION_NUMBER = "07";
const HIGHER_EDUCATION_EXCEPTION_NUMBER = "08";
const IRS_LEVY_EXCEPTION_NUMBER = "10";
const QUALIFIED_RESERVIST_EXCEPTION_NUMBER = "11";
const ELIGIBLE_GOVERNMENTAL_457B_EXCEPTION_NUMBER = "13";
const PRE_1986_EMPLOYER_PLAN_EXCEPTION_NUMBER = "14";
const SECTION_404K_DIVIDEND_EXCEPTION_NUMBER = "15";
const SECTION_72Q_ANNUITY_EXCEPTION_NUMBER = "16";
const FEDERAL_PHASED_RETIREMENT_ANNUITY_EXCEPTION_NUMBER = "17";
const PERMISSIBLE_EACA_WITHDRAWAL_EXCEPTION_NUMBER = "18";
const INCORRECTLY_REPORTED_EARLY_DISTRIBUTION_EXCEPTION_NUMBER = "12";
const QUALIFIED_BIRTH_OR_ADOPTION_EXCEPTION_NUMBER = "19";
const TERMINAL_ILLNESS_EXCEPTION_NUMBER = "20";
const FIRST_TIME_HOMEBUYER_EXCEPTION_NUMBER = "09";
const RETURNED_CONTRIBUTION_EXCEPTION_NUMBER = "21";
const DOMESTIC_ABUSE_EXCEPTION_NUMBER = "22";
const EMERGENCY_PERSONAL_EXPENSE_EXCEPTION_NUMBER = "23";
const MULTIPLE_EXCEPTIONS_NUMBER = "99";
const FIRST_TIME_HOMEBUYER_LIFETIME_CAP = new Decimal(10000);
const DOMESTIC_ABUSE_2025_ANNUAL_CAP = new Decimal(10300);
const EMERGENCY_PERSONAL_EXPENSE_ANNUAL_CAP = new Decimal(1000);
const EDUCATION_ACCOUNT_ADDITIONAL_TAX_RATE = new Decimal(0.10);
const EXCESS_CONTRIBUTION_TAX_RATE = new Decimal(0.06);
const RMD_EXCESS_ACCUMULATION_TAX_RATE = new Decimal(0.25);
const RMD_EXCESS_ACCUMULATION_REDUCED_TAX_RATE = new Decimal(0.10);

interface CombinedAnnualExceptionAllocation {
  directAmount: Decimal;
  supportedTraditionalAmount: Decimal;
  supportedRothAmount: Decimal;
}

export function calculateForm5329(input: Form5329Input): Form5329Result {
  const audit = new AuditTrail();

  const directEarlyDistributions = Decimal.max(new Decimal(0), d(input.earlyDistributionsIncludedInIncome));
  const supportedSeparationFromServiceAfterAge55Amount = Decimal.max(
    new Decimal(0),
    d(input.supportedSeparationFromServiceAfterAge55Amount)
  );
  const supportedDisabilityDistributionAmount = Decimal.max(new Decimal(0), d(input.supportedDisabilityDistributionAmount));
  const qualifiedDomesticRelationsOrderDistributionAmount = Decimal.max(
    new Decimal(0),
    d(input.qualifiedDomesticRelationsOrderDistributionAmount)
  );
  const supportedQualifiedDomesticRelationsOrderDistributionAmount = Decimal.max(
    new Decimal(0),
    d(input.supportedQualifiedDomesticRelationsOrderDistributionAmount)
  );
  const medicalExpenseExceptionAmount = Decimal.max(
    new Decimal(0),
    d(input.medicalExpenseExceptionAmount)
  );
  const supportedMedicalExpenseExceptionAmount = Decimal.max(
    new Decimal(0),
    d(input.supportedMedicalExpenseExceptionAmount)
  );
  const unemployedHealthInsurancePremiumExceptionAmount = Decimal.max(
    new Decimal(0),
    d(input.unemployedHealthInsurancePremiumExceptionAmount)
  );
  const qualifiedHigherEducationExpenseExceptionAmount = Decimal.max(
    new Decimal(0),
    d(input.qualifiedHigherEducationExpenseExceptionAmount)
  );
  const requestedQualifiedFirstTimeHomebuyerDistributionAmount = Decimal.max(
    new Decimal(0),
    d(input.qualifiedFirstTimeHomebuyerDistributionAmount)
  );
  const priorQualifiedFirstTimeHomebuyerDistributions = Decimal.max(
    new Decimal(0),
    d(input.priorQualifiedFirstTimeHomebuyerDistributions)
  );
  const remainingFirstTimeHomebuyerLifetimeCap = Decimal.max(
    new Decimal(0),
    FIRST_TIME_HOMEBUYER_LIFETIME_CAP.minus(priorQualifiedFirstTimeHomebuyerDistributions)
  );
  const qualifiedFirstTimeHomebuyerDistributionAmount = Decimal.min(
    requestedQualifiedFirstTimeHomebuyerDistributionAmount,
    remainingFirstTimeHomebuyerLifetimeCap
  );
  const irsLevyDistributionExceptionAmount = Decimal.max(
    new Decimal(0),
    d(input.irsLevyDistributionExceptionAmount)
  );
  const qualifiedReservistDistributionExceptionAmount = Decimal.max(
    new Decimal(0),
    d(input.qualifiedReservistDistributionExceptionAmount)
  );
  const eligibleGovernmental457bDistributionExceptionAmount = Decimal.max(
    new Decimal(0),
    d(input.eligibleGovernmental457bDistributionExceptionAmount)
  );
  const pre1986EmployerPlanDistributionExceptionAmount = Decimal.max(
    new Decimal(0),
    d(input.pre1986EmployerPlanDistributionExceptionAmount)
  );
  const section404kDividendDistributionExceptionAmount = Decimal.max(
    new Decimal(0),
    d(input.section404kDividendDistributionExceptionAmount)
  );
  const section72qAnnuityExceptionAmount = Decimal.max(
    new Decimal(0),
    d(input.section72qAnnuityExceptionAmount)
  );
  const federalPhasedRetirementAnnuityExceptionAmount = Decimal.max(
    new Decimal(0),
    d(input.federalPhasedRetirementAnnuityExceptionAmount)
  );
  const permissibleEacaWithdrawalExceptionAmount = Decimal.max(
    new Decimal(0),
    d(input.permissibleEacaWithdrawalExceptionAmount)
  );
  const qualifiedBirthOrAdoptionExceptionAmount = Decimal.max(
    new Decimal(0),
    d(input.qualifiedBirthOrAdoptionExceptionAmount)
  );
  const terminalIllnessExceptionAmount = Decimal.max(
    new Decimal(0),
    d(input.terminalIllnessExceptionAmount)
  );
  const returnedContributionByDueDateTaxableEarningsExceptionAmount = Decimal.max(
    new Decimal(0),
    d(input.returnedContributionByDueDateTaxableEarningsExceptionAmount)
  );
  const supportedDeathDistributionAmount = Decimal.max(new Decimal(0), d(input.supportedDeathDistributionAmount));
  const supportedTerminalIllnessDistributionAmount = Decimal.max(
    new Decimal(0),
    d(input.supportedTerminalIllnessDistributionAmount)
  );
  const effectiveSupportedTerminalIllnessDistributionAmount = terminalIllnessExceptionAmount.greaterThan(0)
    ? new Decimal(0)
    : supportedTerminalIllnessDistributionAmount;
  const requestedDomesticAbuseExceptionAmount = Decimal.max(new Decimal(0), d(input.domesticAbuseExceptionAmount));
  const requestedEmergencyPersonalExpenseExceptionAmount = Decimal.max(
    new Decimal(0),
    d(input.emergencyPersonalExpenseExceptionAmount)
  );
  const supportedQualifiedDisasterRecoveryDistributionsIncludedInIncome = Decimal.max(
    new Decimal(0),
    d(input.supportedQualifiedDisasterRecoveryDistributionsIncludedInIncome)
  );
  const supportedEligibleGovernmental457bDistributionsExcludedFromLine1 = Decimal.max(
    new Decimal(0),
    d(input.supportedEligibleGovernmental457bDistributionsExcludedFromLine1)
  );
  const supportedIncorrectEarlyDistributionAge59AndHalfAmount = Decimal.max(
    new Decimal(0),
    d(input.supportedIncorrectEarlyDistributionAge59AndHalfAmount)
  );
  const rothConversionRecaptureAmount = Decimal.max(new Decimal(0), d(input.rothConversionRecaptureAmount));
  const supportedReturnedContributionByDueDateTaxableEarnings = Decimal.max(
    new Decimal(0),
    d(input.supportedReturnedContributionByDueDateTaxableEarnings)
  );
  const effectiveSupportedReturnedContributionByDueDateTaxableEarnings =
    returnedContributionByDueDateTaxableEarningsExceptionAmount.greaterThan(0)
      ? new Decimal(0)
      : supportedReturnedContributionByDueDateTaxableEarnings;
  const requestedSupportedQualifiedFirstTimeHomebuyerDistribution = Decimal.max(
    new Decimal(0),
    d(input.supportedQualifiedFirstTimeHomebuyerDistribution)
  );
  const supportedQualifiedFirstTimeHomebuyerDistribution = Decimal.min(
    requestedSupportedQualifiedFirstTimeHomebuyerDistribution,
    Decimal.max(new Decimal(0), remainingFirstTimeHomebuyerLifetimeCap.minus(qualifiedFirstTimeHomebuyerDistributionAmount))
  );
  const requestedSupportedRepaymentEligibleTraditionalDistributionTaxableShare = Decimal.max(
    new Decimal(0),
    d(input.supportedRepaymentEligibleTraditionalDistributionTaxableShare)
  );
  const supportedRepaymentEligibleTraditionalDistributionExceptionNumber =
    input.supportedRepaymentEligibleTraditionalDistributionExceptionNumber;
  const requestedSupportedRepaymentEligibleRothDistributionTaxableShare = Decimal.max(
    new Decimal(0),
    d(input.supportedRepaymentEligibleRothDistributionTaxableShare)
  );
  const supportedRepaymentEligibleRothDistributionExceptionNumber =
    input.supportedRepaymentEligibleRothDistributionExceptionNumber;
  const domesticAbuseAllocation = allocateCombinedAnnualExceptionCap(
    DOMESTIC_ABUSE_2025_ANNUAL_CAP,
    requestedDomesticAbuseExceptionAmount,
    supportedRepaymentEligibleTraditionalDistributionExceptionNumber === DOMESTIC_ABUSE_EXCEPTION_NUMBER
      ? requestedSupportedRepaymentEligibleTraditionalDistributionTaxableShare
      : new Decimal(0),
    supportedRepaymentEligibleRothDistributionExceptionNumber === DOMESTIC_ABUSE_EXCEPTION_NUMBER
      ? requestedSupportedRepaymentEligibleRothDistributionTaxableShare
      : new Decimal(0)
  );
  const emergencyPersonalExpenseAllocation = allocateCombinedAnnualExceptionCap(
    EMERGENCY_PERSONAL_EXPENSE_ANNUAL_CAP,
    requestedEmergencyPersonalExpenseExceptionAmount,
    supportedRepaymentEligibleTraditionalDistributionExceptionNumber === EMERGENCY_PERSONAL_EXPENSE_EXCEPTION_NUMBER
      ? requestedSupportedRepaymentEligibleTraditionalDistributionTaxableShare
      : new Decimal(0),
    supportedRepaymentEligibleRothDistributionExceptionNumber === EMERGENCY_PERSONAL_EXPENSE_EXCEPTION_NUMBER
      ? requestedSupportedRepaymentEligibleRothDistributionTaxableShare
      : new Decimal(0)
  );
  const domesticAbuseExceptionAmount = domesticAbuseAllocation.directAmount;
  const emergencyPersonalExpenseExceptionAmount = emergencyPersonalExpenseAllocation.directAmount;
  const cappedSupportedRepaymentEligibleTraditionalDistributionTaxableShare =
    supportedRepaymentEligibleTraditionalDistributionExceptionNumber === DOMESTIC_ABUSE_EXCEPTION_NUMBER
      ? domesticAbuseAllocation.supportedTraditionalAmount
      : supportedRepaymentEligibleTraditionalDistributionExceptionNumber === EMERGENCY_PERSONAL_EXPENSE_EXCEPTION_NUMBER
        ? emergencyPersonalExpenseAllocation.supportedTraditionalAmount
        : requestedSupportedRepaymentEligibleTraditionalDistributionTaxableShare;
  const cappedSupportedRepaymentEligibleRothDistributionTaxableShare =
    supportedRepaymentEligibleRothDistributionExceptionNumber === DOMESTIC_ABUSE_EXCEPTION_NUMBER
      ? domesticAbuseAllocation.supportedRothAmount
      : supportedRepaymentEligibleRothDistributionExceptionNumber === EMERGENCY_PERSONAL_EXPENSE_EXCEPTION_NUMBER
        ? emergencyPersonalExpenseAllocation.supportedRothAmount
        : requestedSupportedRepaymentEligibleRothDistributionTaxableShare;
  const line1 = Decimal.max(
    new Decimal(0),
    directEarlyDistributions
      .minus(supportedQualifiedDisasterRecoveryDistributionsIncludedInIncome)
      .minus(supportedEligibleGovernmental457bDistributionsExcludedFromLine1)
  ).plus(rothConversionRecaptureAmount);
  const requestedExceptionAmount = Decimal.max(new Decimal(0), d(input.distributionsNotSubjectToAdditionalTax));
  const substantiallyEqualPeriodicPaymentsExceptionAmount = Decimal.max(
    new Decimal(0),
    d(input.substantiallyEqualPeriodicPaymentsExceptionAmount)
  );
  const deathDistributionExceptionAmount = Decimal.max(
    new Decimal(0),
    d(input.deathDistributionExceptionAmount)
  );
  const effectiveSupportedDeathDistributionAmount = deathDistributionExceptionAmount.greaterThan(0)
    ? new Decimal(0)
    : supportedDeathDistributionAmount;
  const supportedAutomaticExceptionAmount = supportedSeparationFromServiceAfterAge55Amount
    .plus(substantiallyEqualPeriodicPaymentsExceptionAmount)
    .plus(deathDistributionExceptionAmount)
    .plus(effectiveSupportedDeathDistributionAmount)
    .plus(supportedDisabilityDistributionAmount)
    .plus(qualifiedDomesticRelationsOrderDistributionAmount)
    .plus(supportedQualifiedDomesticRelationsOrderDistributionAmount)
    .plus(medicalExpenseExceptionAmount)
    .plus(supportedMedicalExpenseExceptionAmount)
    .plus(unemployedHealthInsurancePremiumExceptionAmount)
    .plus(qualifiedHigherEducationExpenseExceptionAmount)
    .plus(qualifiedFirstTimeHomebuyerDistributionAmount)
    .plus(irsLevyDistributionExceptionAmount)
    .plus(qualifiedReservistDistributionExceptionAmount)
    .plus(eligibleGovernmental457bDistributionExceptionAmount)
    .plus(pre1986EmployerPlanDistributionExceptionAmount)
    .plus(section404kDividendDistributionExceptionAmount)
    .plus(section72qAnnuityExceptionAmount)
    .plus(federalPhasedRetirementAnnuityExceptionAmount)
    .plus(permissibleEacaWithdrawalExceptionAmount)
    .plus(qualifiedBirthOrAdoptionExceptionAmount)
    .plus(terminalIllnessExceptionAmount)
    .plus(effectiveSupportedTerminalIllnessDistributionAmount)
    .plus(returnedContributionByDueDateTaxableEarningsExceptionAmount)
    .plus(domesticAbuseExceptionAmount)
    .plus(emergencyPersonalExpenseExceptionAmount)
    .plus(supportedIncorrectEarlyDistributionAge59AndHalfAmount)
    .plus(effectiveSupportedReturnedContributionByDueDateTaxableEarnings)
    .plus(supportedQualifiedFirstTimeHomebuyerDistribution)
    .plus(cappedSupportedRepaymentEligibleTraditionalDistributionTaxableShare)
    .plus(cappedSupportedRepaymentEligibleRothDistributionTaxableShare);
  const requestedExceptionIncludesSupportedAmount = requestedExceptionAmount.greaterThanOrEqualTo(
    supportedAutomaticExceptionAmount
  );
  const requestedValidatedManualExceptionAmount = requestedExceptionIncludesSupportedAmount
    ? Decimal.max(new Decimal(0), requestedExceptionAmount.minus(supportedAutomaticExceptionAmount))
    : requestedExceptionAmount;
  const validatedManualExceptionAmount = applyManualExceptionCap(
    input.distributionExceptionNumber,
    requestedValidatedManualExceptionAmount,
    input.distributionExceptionNumber === DOMESTIC_ABUSE_EXCEPTION_NUMBER
      ? domesticAbuseExceptionAmount
        .plus(
          supportedRepaymentEligibleTraditionalDistributionExceptionNumber === DOMESTIC_ABUSE_EXCEPTION_NUMBER
            ? cappedSupportedRepaymentEligibleTraditionalDistributionTaxableShare
            : new Decimal(0)
        )
        .plus(
          supportedRepaymentEligibleRothDistributionExceptionNumber === DOMESTIC_ABUSE_EXCEPTION_NUMBER
            ? cappedSupportedRepaymentEligibleRothDistributionTaxableShare
            : new Decimal(0)
        )
      : input.distributionExceptionNumber === EMERGENCY_PERSONAL_EXPENSE_EXCEPTION_NUMBER
        ? emergencyPersonalExpenseExceptionAmount
          .plus(
            supportedRepaymentEligibleTraditionalDistributionExceptionNumber === EMERGENCY_PERSONAL_EXPENSE_EXCEPTION_NUMBER
              ? cappedSupportedRepaymentEligibleTraditionalDistributionTaxableShare
              : new Decimal(0)
          )
          .plus(
            supportedRepaymentEligibleRothDistributionExceptionNumber === EMERGENCY_PERSONAL_EXPENSE_EXCEPTION_NUMBER
              ? cappedSupportedRepaymentEligibleRothDistributionTaxableShare
              : new Decimal(0)
          )
        : new Decimal(0)
  );
  const totalExceptionAmount = supportedAutomaticExceptionAmount.plus(validatedManualExceptionAmount);
  const line2 = Decimal.min(line1, totalExceptionAmount);
  const line2ExceptionNumber = deriveLine2ExceptionNumber(
    input.distributionExceptionNumber,
    validatedManualExceptionAmount,
    supportedAutomaticExceptionAmount,
    supportedSeparationFromServiceAfterAge55Amount,
    substantiallyEqualPeriodicPaymentsExceptionAmount,
    deathDistributionExceptionAmount,
    effectiveSupportedDeathDistributionAmount,
    supportedDisabilityDistributionAmount,
    qualifiedDomesticRelationsOrderDistributionAmount,
    supportedQualifiedDomesticRelationsOrderDistributionAmount,
    medicalExpenseExceptionAmount,
    supportedMedicalExpenseExceptionAmount,
    unemployedHealthInsurancePremiumExceptionAmount,
    qualifiedHigherEducationExpenseExceptionAmount,
    qualifiedFirstTimeHomebuyerDistributionAmount,
    irsLevyDistributionExceptionAmount,
    qualifiedReservistDistributionExceptionAmount,
    eligibleGovernmental457bDistributionExceptionAmount,
    pre1986EmployerPlanDistributionExceptionAmount,
    section404kDividendDistributionExceptionAmount,
    section72qAnnuityExceptionAmount,
    federalPhasedRetirementAnnuityExceptionAmount,
    permissibleEacaWithdrawalExceptionAmount,
    qualifiedBirthOrAdoptionExceptionAmount,
    terminalIllnessExceptionAmount,
    effectiveSupportedTerminalIllnessDistributionAmount,
    returnedContributionByDueDateTaxableEarningsExceptionAmount,
    domesticAbuseExceptionAmount,
    emergencyPersonalExpenseExceptionAmount,
    supportedIncorrectEarlyDistributionAge59AndHalfAmount,
    supportedQualifiedFirstTimeHomebuyerDistribution,
    effectiveSupportedReturnedContributionByDueDateTaxableEarnings,
    cappedSupportedRepaymentEligibleTraditionalDistributionTaxableShare,
    supportedRepaymentEligibleTraditionalDistributionExceptionNumber,
    cappedSupportedRepaymentEligibleRothDistributionTaxableShare,
    supportedRepaymentEligibleRothDistributionExceptionNumber,
    line2
  );
  const line3 = Decimal.max(new Decimal(0), line1.minus(line2));
  // Line 4 needs the portion of Line 3 still attributable to first-two-year
  // SIMPLE IRA distributions after exceptions; callers can provide that amount
  // explicitly when mixed exceptions make the defaulted split ambiguous.
  const simpleIRADistributionsWithinFirstTwoYears = Decimal.min(
    line3,
    Decimal.max(new Decimal(0), d(input.simpleIRADistributionsWithinFirstTwoYears))
  );
  const line4 = line3
    .times(EARLY_DISTRIBUTION_TAX_RATE)
    .plus(simpleIRADistributionsWithinFirstTwoYears.times(SIMPLE_IRA_EXTRA_TAX_RATE));

  audit.record("Form 5329", "1", "Early distributions included in income", line1,
    rothConversionRecaptureAmount.isZero()
      ? supportedQualifiedDisasterRecoveryDistributionsIncludedInIncome.isZero()
        && supportedEligibleGovernmental457bDistributionsExcludedFromLine1.isZero()
        ? "Taxable early distributions from IRAs and other qualified retirement plans included in income"
        : "Taxable early distributions from IRAs and other qualified retirement plans included in income, excluding supported qualified disaster recovery distributions and eligible governmental section 457(b) amounts that are not entered on Form 5329 Part I"
      : supportedQualifiedDisasterRecoveryDistributionsIncludedInIncome.isZero()
        && supportedEligibleGovernmental457bDistributionsExcludedFromLine1.isZero()
        ? "Taxable early distributions from IRAs and other qualified retirement plans included in income, plus Roth conversion or qualified-plan rollover recapture amounts still subject to the early-distribution tax"
        : "Taxable early distributions from IRAs and other qualified retirement plans included in income, excluding supported qualified disaster recovery distributions and eligible governmental section 457(b) amounts that are not entered on Form 5329 Part I, plus Roth conversion or qualified-plan rollover recapture amounts still subject to the early-distribution tax",
    {
      "Direct early distributions included in income": directEarlyDistributions,
      "Supported qualified disaster recovery distributions excluded from Line 1":
        supportedQualifiedDisasterRecoveryDistributionsIncludedInIncome,
      "Supported eligible governmental section 457(b) distributions excluded from Line 1":
        supportedEligibleGovernmental457bDistributionsExcludedFromLine1,
      "Supported separation-from-service qualified-plan distributions (exception 01)":
        supportedSeparationFromServiceAfterAge55Amount,
      "Validated substantially equal periodic payments exception amount (exception 02)":
        substantiallyEqualPeriodicPaymentsExceptionAmount,
      "Validated death-distribution exception amount (exception 04)":
        deathDistributionExceptionAmount,
      "Supported death distributions (exception 04)": effectiveSupportedDeathDistributionAmount,
      "Supported disability distributions (exception 03)": supportedDisabilityDistributionAmount,
      "Validated QDRO alternate-payee distributions (exception 06)":
        qualifiedDomesticRelationsOrderDistributionAmount,
      "Supported QDRO alternate-payee distributions (exception 06)":
        supportedQualifiedDomesticRelationsOrderDistributionAmount,
      "Validated medical expense exception amount (exception 05)":
        medicalExpenseExceptionAmount,
      "Supported medical expense exception amount (exception 05)":
        supportedMedicalExpenseExceptionAmount,
      "Validated unemployment health insurance premium exception amount (exception 07)":
        unemployedHealthInsurancePremiumExceptionAmount,
      "Validated higher education expense exception amount (exception 08)":
        qualifiedHigherEducationExpenseExceptionAmount,
      "Prior qualified first-time homebuyer distributions":
        priorQualifiedFirstTimeHomebuyerDistributions,
      "Remaining first-time homebuyer lifetime cap":
        remainingFirstTimeHomebuyerLifetimeCap,
      "Validated first-time homebuyer distribution amount (exception 09)":
        qualifiedFirstTimeHomebuyerDistributionAmount,
      "Validated IRS levy distribution exception amount (exception 10)":
        irsLevyDistributionExceptionAmount,
      "Validated qualified reservist distribution exception amount (exception 11)":
        qualifiedReservistDistributionExceptionAmount,
      "Validated eligible governmental section 457(b) distribution exception amount (exception 13)":
        eligibleGovernmental457bDistributionExceptionAmount,
      "Validated pre-March-1-1986 employer-plan pay-status distribution exception amount (exception 14)":
        pre1986EmployerPlanDistributionExceptionAmount,
      "Validated section 404(k) dividend distribution exception amount (exception 15)":
        section404kDividendDistributionExceptionAmount,
      "Validated section 72(q) annuity exception amount (exception 16)":
        section72qAnnuityExceptionAmount,
      "Validated federal phased retirement annuity exception amount (exception 17)":
        federalPhasedRetirementAnnuityExceptionAmount,
      "Validated permissible EACA withdrawal exception amount (exception 18)":
        permissibleEacaWithdrawalExceptionAmount,
      "Validated qualified birth or adoption distribution exception amount (exception 19)":
        qualifiedBirthOrAdoptionExceptionAmount,
      "Validated terminal-illness distribution exception amount (exception 20)":
        terminalIllnessExceptionAmount,
      "Supported terminal-illness qualified-plan distributions (exception 20)":
        effectiveSupportedTerminalIllnessDistributionAmount,
      "Validated due-date return taxable earnings exception amount (exception 21)":
        returnedContributionByDueDateTaxableEarningsExceptionAmount,
      "Validated domestic-abuse victim distribution exception amount (exception 22)":
        domesticAbuseExceptionAmount,
      "Validated emergency personal expense distribution exception amount (exception 23)":
        emergencyPersonalExpenseExceptionAmount,
      "Roth conversion or rollover recapture amount": rothConversionRecaptureAmount,
      "Supported age-59 1/2-or-older misclassified code 1/J/S distributions (exception 12)":
        supportedIncorrectEarlyDistributionAge59AndHalfAmount,
      "Supported returned-contribution taxable earnings (exception 21)":
        effectiveSupportedReturnedContributionByDueDateTaxableEarnings,
      "Supported Roth first-time homebuyer amount (exception 09)": supportedQualifiedFirstTimeHomebuyerDistribution,
      "Supported Form 8606 repayment-category taxable share":
        requestedSupportedRepaymentEligibleTraditionalDistributionTaxableShare,
      "Supported Roth repayment-category taxable share":
        requestedSupportedRepaymentEligibleRothDistributionTaxableShare,
      ...(cappedSupportedRepaymentEligibleTraditionalDistributionTaxableShare.eq(
        requestedSupportedRepaymentEligibleTraditionalDistributionTaxableShare
      )
        ? {}
        : {
          "Capped supported Form 8606 repayment-category taxable share":
            cappedSupportedRepaymentEligibleTraditionalDistributionTaxableShare,
        }),
      ...(cappedSupportedRepaymentEligibleRothDistributionTaxableShare.eq(
        requestedSupportedRepaymentEligibleRothDistributionTaxableShare
      )
        ? {}
        : {
          "Capped supported Roth repayment-category taxable share":
            cappedSupportedRepaymentEligibleRothDistributionTaxableShare,
        }),
      ...(supportedRepaymentEligibleTraditionalDistributionExceptionNumber === undefined
        ? {}
        : {
          "Supported Form 8606 repayment-category exception number":
            supportedRepaymentEligibleTraditionalDistributionExceptionNumber,
        }),
      ...(supportedRepaymentEligibleRothDistributionExceptionNumber === undefined
        ? {}
        : {
          "Supported Roth repayment-category exception number":
            supportedRepaymentEligibleRothDistributionExceptionNumber,
        }),
    });
  audit.record("Form 5329", "2", "Early distributions not subject to the additional tax", line2,
    requestedExceptionIncludesSupportedAmount
      ? totalExceptionAmount.eq(line2)
        ? "Validated exception amount already includes the supported automatic exception subtotals, limited to Line 1"
        : "Validated exception amount already includes the supported automatic exception subtotals and is capped at Line 1"
      : totalExceptionAmount.eq(line2)
        ? "Supported automatic exception subtotals plus any additional validated manual exception amount, limited to Line 1"
        : "Supported automatic exception subtotals plus any additional validated manual exception amount, capped at Line 1",
    {
      "Requested exception amount": requestedExceptionAmount,
      ...(line2ExceptionNumber === undefined ? {} : { "Line 2 exception number": line2ExceptionNumber }),
      "Supported automatic exception subtotal": supportedAutomaticExceptionAmount,
      "Validated manual exception amount": validatedManualExceptionAmount,
      "Supported separation-from-service qualified-plan distributions (exception 01)":
        supportedSeparationFromServiceAfterAge55Amount,
      "Validated substantially equal periodic payments exception amount (exception 02)":
        substantiallyEqualPeriodicPaymentsExceptionAmount,
      "Validated death-distribution exception amount (exception 04)":
        deathDistributionExceptionAmount,
      "Supported death distributions (exception 04)": effectiveSupportedDeathDistributionAmount,
      "Supported disability distributions (exception 03)": supportedDisabilityDistributionAmount,
      "Validated QDRO alternate-payee distributions (exception 06)":
        qualifiedDomesticRelationsOrderDistributionAmount,
      "Supported QDRO alternate-payee distributions (exception 06)":
        supportedQualifiedDomesticRelationsOrderDistributionAmount,
      "Validated medical expense exception amount (exception 05)":
        medicalExpenseExceptionAmount,
      "Supported medical expense exception amount (exception 05)":
        supportedMedicalExpenseExceptionAmount,
      "Validated unemployment health insurance premium exception amount (exception 07)":
        unemployedHealthInsurancePremiumExceptionAmount,
      "Validated higher education expense exception amount (exception 08)":
        qualifiedHigherEducationExpenseExceptionAmount,
      "Prior qualified first-time homebuyer distributions":
        priorQualifiedFirstTimeHomebuyerDistributions,
      "Remaining first-time homebuyer lifetime cap":
        remainingFirstTimeHomebuyerLifetimeCap,
      "Validated first-time homebuyer distribution amount (exception 09)":
        qualifiedFirstTimeHomebuyerDistributionAmount,
      "Validated IRS levy distribution exception amount (exception 10)":
        irsLevyDistributionExceptionAmount,
      "Validated qualified reservist distribution exception amount (exception 11)":
        qualifiedReservistDistributionExceptionAmount,
      "Validated eligible governmental section 457(b) distribution exception amount (exception 13)":
        eligibleGovernmental457bDistributionExceptionAmount,
      "Validated pre-March-1-1986 employer-plan pay-status distribution exception amount (exception 14)":
        pre1986EmployerPlanDistributionExceptionAmount,
      "Validated section 404(k) dividend distribution exception amount (exception 15)":
        section404kDividendDistributionExceptionAmount,
      "Validated section 72(q) annuity exception amount (exception 16)":
        section72qAnnuityExceptionAmount,
      "Validated federal phased retirement annuity exception amount (exception 17)":
        federalPhasedRetirementAnnuityExceptionAmount,
      "Validated permissible EACA withdrawal exception amount (exception 18)":
        permissibleEacaWithdrawalExceptionAmount,
      "Validated qualified birth or adoption distribution exception amount (exception 19)":
        qualifiedBirthOrAdoptionExceptionAmount,
      "Validated terminal-illness distribution exception amount (exception 20)":
        terminalIllnessExceptionAmount,
      "Supported terminal-illness qualified-plan distributions (exception 20)":
        effectiveSupportedTerminalIllnessDistributionAmount,
      "Validated due-date return taxable earnings exception amount (exception 21)":
        returnedContributionByDueDateTaxableEarningsExceptionAmount,
      "Validated domestic-abuse victim distribution exception amount (exception 22)":
        domesticAbuseExceptionAmount,
      "Validated emergency personal expense distribution exception amount (exception 23)":
        emergencyPersonalExpenseExceptionAmount,
      "Supported age-59 1/2-or-older misclassified code 1/J/S distributions (exception 12)":
        supportedIncorrectEarlyDistributionAge59AndHalfAmount,
      "Supported returned-contribution taxable earnings (exception 21)":
        effectiveSupportedReturnedContributionByDueDateTaxableEarnings,
      "Supported Roth first-time homebuyer amount (exception 09)": supportedQualifiedFirstTimeHomebuyerDistribution,
      "Supported Form 8606 repayment-category taxable share":
        requestedSupportedRepaymentEligibleTraditionalDistributionTaxableShare,
      "Supported Roth repayment-category taxable share":
        requestedSupportedRepaymentEligibleRothDistributionTaxableShare,
      ...(cappedSupportedRepaymentEligibleTraditionalDistributionTaxableShare.eq(
        requestedSupportedRepaymentEligibleTraditionalDistributionTaxableShare
      )
        ? {}
        : {
          "Capped supported Form 8606 repayment-category taxable share":
            cappedSupportedRepaymentEligibleTraditionalDistributionTaxableShare,
        }),
      ...(cappedSupportedRepaymentEligibleRothDistributionTaxableShare.eq(
        requestedSupportedRepaymentEligibleRothDistributionTaxableShare
      )
        ? {}
        : {
          "Capped supported Roth repayment-category taxable share":
            cappedSupportedRepaymentEligibleRothDistributionTaxableShare,
        }),
      ...(supportedRepaymentEligibleTraditionalDistributionExceptionNumber === undefined
        ? {}
        : {
          "Supported Form 8606 repayment-category exception number":
            supportedRepaymentEligibleTraditionalDistributionExceptionNumber,
        }),
      ...(supportedRepaymentEligibleRothDistributionExceptionNumber === undefined
        ? {}
        : {
          "Supported Roth repayment-category exception number":
            supportedRepaymentEligibleRothDistributionExceptionNumber,
        }),
    });
  audit.record("Form 5329", "3", "Amount subject to the additional tax", line3,
    "max(0, Line 1 - Line 2)", {
      "Line 1": line1,
      "Line 2": line2,
    });
  audit.record("Form 5329", "4", "Additional tax on early distributions", line4,
    simpleIRADistributionsWithinFirstTwoYears.isZero()
      ? "10% × Line 3"
      : "10% × Line 3 plus an extra 15% on the SIMPLE IRA first-two-year portion included on Line 3",
    {
      "Line 3": line3,
      "SIMPLE IRA amount taxed at 25%": simpleIRADistributionsWithinFirstTwoYears,
    });

  // ── Part II: Additional tax on certain education account and ABLE distributions ──
  const line5 = Decimal.max(new Decimal(0), d(input.educationAccountDistributionsIncludedInIncome));
  const line6 = Decimal.min(line5, Decimal.max(new Decimal(0), d(input.educationAccountDistributionsExcepted)));
  const line7 = Decimal.max(new Decimal(0), line5.minus(line6));
  const line8 = line7.times(EDUCATION_ACCOUNT_ADDITIONAL_TAX_RATE);

  audit.record("Form 5329", "5", "Distributions included in income from Coverdell ESAs, QTPs, and ABLE accounts", line5,
    "Taxable distributions from education accounts and ABLE accounts included in income");
  audit.record("Form 5329", "6", "Distributions excepted from additional tax", line6,
    "Distributions excepted from the 10% additional tax (death, disability, scholarship, military academy, returned excess contributions)",
    { "Line 5": line5 });
  audit.record("Form 5329", "7", "Amount subject to additional tax", line7,
    "max(0, Line 5 - Line 6)", {
      "Line 5": line5,
      "Line 6": line6,
    });
  audit.record("Form 5329", "8", "Additional tax on education account and ABLE distributions", line8,
    "Line 7 × 10%", {
      "Line 7": line7,
      "Tax rate": EDUCATION_ACCOUNT_ADDITIONAL_TAX_RATE,
    });

  // ── Part III: Excess contributions to traditional IRAs ──────────────
  const line9 = Decimal.max(new Decimal(0), d(input.traditionalIRAPriorYearExcessContributions));
  const line10 = Decimal.max(new Decimal(0), d(input.traditionalIRAContributionRoom));
  const line11 = Decimal.max(new Decimal(0), d(input.traditionalIRADistributionsIncludedInIncome));
  const line12 = Decimal.max(new Decimal(0), d(input.traditionalIRAPriorYearExcessReturned));
  const line13 = line10.plus(line11).plus(line12);
  const line14 = Decimal.max(new Decimal(0), line9.minus(line13));
  const line15 = Decimal.max(new Decimal(0), d(input.traditionalIRACurrentYearExcessContributions));
  const line16 = line14.plus(line15);
  const traditionalIRAValueDec31 = Decimal.max(new Decimal(0), d(input.traditionalIRAValueDec31));
  const line17 = EXCESS_CONTRIBUTION_TAX_RATE.times(Decimal.min(line16, traditionalIRAValueDec31));

  audit.record("Form 5329", "9", "Prior year excess contributions carryforward", line9,
    "Excess contributions from prior-year Form 5329 Line 16");
  audit.record("Form 5329", "10", "Available contribution room to absorb prior-year excess", line10,
    "Unused traditional IRA contribution room for 2025");
  audit.record("Form 5329", "11", "Traditional IRA distributions included in income", line11,
    "2025 traditional IRA distributions included in income");
  audit.record("Form 5329", "12", "Distributions of prior-year excess contributions", line12,
    "Prior-year excess contributions returned in 2025");
  audit.record("Form 5329", "13", "Total reductions to prior-year excess", line13,
    "Line 10 + Line 11 + Line 12", {
      "Line 10": line10,
      "Line 11": line11,
      "Line 12": line12,
    });
  audit.record("Form 5329", "14", "Remaining prior-year excess contributions", line14,
    "max(0, Line 9 - Line 13)", {
      "Line 9": line9,
      "Line 13": line13,
    });
  audit.record("Form 5329", "15", "Current-year excess contributions", line15,
    "Excess traditional IRA contributions for 2025");
  audit.record("Form 5329", "16", "Total excess contributions", line16,
    "Line 14 + Line 15", {
      "Line 14": line14,
      "Line 15": line15,
    });
  audit.record("Form 5329", "17",
    "Additional tax on excess contributions to traditional IRAs", line17,
    "6% × min(Line 16, value of traditional IRAs on December 31, 2025)", {
      "Line 16": line16,
      "Traditional IRA value December 31": traditionalIRAValueDec31,
    });

  // ── Part IV: Excess contributions to Roth IRAs ─────────────────────
  const line18 = Decimal.max(new Decimal(0), d(input.rothIRAPriorYearExcessContributions));
  const line19 = Decimal.max(new Decimal(0), d(input.rothIRAContributionRoom));
  const line20 = Decimal.max(new Decimal(0), d(input.rothIRADistributions));
  const line21 = line19.plus(line20);
  const line22 = Decimal.max(new Decimal(0), line18.minus(line21));
  const line23 = Decimal.max(new Decimal(0), d(input.rothIRACurrentYearExcessContributions));
  const line24 = line22.plus(line23);
  const rothIRAValueDec31 = Decimal.max(new Decimal(0), d(input.rothIRAValueDec31));
  const line25 = EXCESS_CONTRIBUTION_TAX_RATE.times(Decimal.min(line24, rothIRAValueDec31));

  audit.record("Form 5329", "18", "Prior year Roth IRA excess contributions carryforward", line18,
    "Excess contributions from prior-year Form 5329 Line 24");
  audit.record("Form 5329", "19", "Available Roth IRA contribution room to absorb prior-year excess", line19,
    "Unused Roth IRA contribution room for 2025");
  audit.record("Form 5329", "20", "Roth IRA distributions", line20,
    "2025 Roth IRA distributions");
  audit.record("Form 5329", "21", "Total reductions to prior-year Roth excess", line21,
    "Line 19 + Line 20", {
      "Line 19": line19,
      "Line 20": line20,
    });
  audit.record("Form 5329", "22", "Remaining prior-year Roth IRA excess contributions", line22,
    "max(0, Line 18 - Line 21)", {
      "Line 18": line18,
      "Line 21": line21,
    });
  audit.record("Form 5329", "23", "Current-year Roth IRA excess contributions", line23,
    "Excess Roth IRA contributions for 2025");
  audit.record("Form 5329", "24", "Total Roth IRA excess contributions", line24,
    "Line 22 + Line 23", {
      "Line 22": line22,
      "Line 23": line23,
    });
  audit.record("Form 5329", "25",
    "Additional tax on excess contributions to Roth IRAs", line25,
    "6% × min(Line 24, value of Roth IRAs on December 31, 2025)", {
      "Line 24": line24,
      "Roth IRA value December 31": rothIRAValueDec31,
    });

  // ── Part V: Excess contributions to Coverdell ESAs ─────────────────
  const line26 = Decimal.max(new Decimal(0), d(input.coverdellESAPriorYearExcessContributions));
  const line27 = Decimal.max(new Decimal(0), d(input.coverdellESAContributionRoom));
  const line28 = Decimal.max(new Decimal(0), d(input.coverdellESADistributions));
  const line29 = line27.plus(line28);
  const line30 = Decimal.max(new Decimal(0), line26.minus(line29));
  const line31 = Decimal.max(new Decimal(0), d(input.coverdellESACurrentYearExcessContributions));
  const line32 = line30.plus(line31);
  const coverdellESAValueDec31 = Decimal.max(new Decimal(0), d(input.coverdellESAValueDec31));
  const line33 = EXCESS_CONTRIBUTION_TAX_RATE.times(Decimal.min(line32, coverdellESAValueDec31));

  audit.record("Form 5329", "26", "Prior year Coverdell ESA excess contributions carryforward", line26,
    "Excess contributions from prior-year Form 5329 Line 32");
  audit.record("Form 5329", "27", "Available Coverdell ESA contribution room to absorb prior-year excess", line27,
    "Unused Coverdell ESA contribution room for 2025 ($2,000/beneficiary minus actual contributions)");
  audit.record("Form 5329", "28", "Coverdell ESA distributions", line28,
    "2025 Coverdell ESA distributions");
  audit.record("Form 5329", "29", "Total reductions to prior-year Coverdell ESA excess", line29,
    "Line 27 + Line 28", {
      "Line 27": line27,
      "Line 28": line28,
    });
  audit.record("Form 5329", "30", "Remaining prior-year Coverdell ESA excess contributions", line30,
    "max(0, Line 26 - Line 29)", {
      "Line 26": line26,
      "Line 29": line29,
    });
  audit.record("Form 5329", "31", "Current-year Coverdell ESA excess contributions", line31,
    "Excess Coverdell ESA contributions for 2025");
  audit.record("Form 5329", "32", "Total Coverdell ESA excess contributions", line32,
    "Line 30 + Line 31", {
      "Line 30": line30,
      "Line 31": line31,
    });
  audit.record("Form 5329", "33",
    "Additional tax on excess contributions to Coverdell ESAs", line33,
    "6% × min(Line 32, value of Coverdell ESAs on December 31, 2025)", {
      "Line 32": line32,
      "Coverdell ESA value December 31": coverdellESAValueDec31,
    });

  // ── Part VI: Excess contributions to Archer MSAs ──────────────────
  const line34 = Decimal.max(new Decimal(0), d(input.archerMSAPriorYearExcessContributions));
  const line35 = Decimal.max(new Decimal(0), d(input.archerMSAContributionRoom));
  const line36 = Decimal.max(new Decimal(0), d(input.archerMSADistributions));
  const line37 = line35.plus(line36);
  const line38 = Decimal.max(new Decimal(0), line34.minus(line37));
  const line39 = Decimal.max(new Decimal(0), d(input.archerMSACurrentYearExcessContributions));
  const line40 = line38.plus(line39);
  const archerMSAValueDec31 = Decimal.max(new Decimal(0), d(input.archerMSAValueDec31));
  const line41 = EXCESS_CONTRIBUTION_TAX_RATE.times(Decimal.min(line40, archerMSAValueDec31));

  audit.record("Form 5329", "34", "Prior year Archer MSA excess contributions carryforward", line34,
    "Excess contributions from prior-year Form 5329 Line 40");
  audit.record("Form 5329", "35", "Available Archer MSA contribution room to absorb prior-year excess", line35,
    "Unused Archer MSA contribution room for 2025");
  audit.record("Form 5329", "36", "Archer MSA distributions", line36,
    "2025 Archer MSA distributions");
  audit.record("Form 5329", "37", "Total reductions to prior-year Archer MSA excess", line37,
    "Line 35 + Line 36", {
      "Line 35": line35,
      "Line 36": line36,
    });
  audit.record("Form 5329", "38", "Remaining prior-year Archer MSA excess contributions", line38,
    "max(0, Line 34 - Line 37)", {
      "Line 34": line34,
      "Line 37": line37,
    });
  audit.record("Form 5329", "39", "Current-year Archer MSA excess contributions", line39,
    "Excess Archer MSA contributions for 2025");
  audit.record("Form 5329", "40", "Total Archer MSA excess contributions", line40,
    "Line 38 + Line 39", {
      "Line 38": line38,
      "Line 39": line39,
    });
  audit.record("Form 5329", "41",
    "Additional tax on excess contributions to Archer MSAs", line41,
    "6% × min(Line 40, value of Archer MSAs on December 31, 2025)", {
      "Line 40": line40,
      "Archer MSA value December 31": archerMSAValueDec31,
    });

  // ── Part VII: Excess contributions to HSAs ──────────────────────────
  const line42 = Decimal.max(new Decimal(0), d(input.hsaPriorYearExcessContributions));
  const line43 = Decimal.max(new Decimal(0), d(input.hsaContributionRoom));
  const line44 = Decimal.max(new Decimal(0), d(input.hsaDistributions));
  const line45 = line43.plus(line44);
  const line46 = Decimal.max(new Decimal(0), line42.minus(line45));
  const rawLine47 = Decimal.max(new Decimal(0), d(input.hsaCurrentYearExcessContributions));
  const supportedHsaReturnedExcessContributionsByDueDate = Decimal.max(
    new Decimal(0),
    d(input.supportedHsaReturnedExcessContributionsByDueDate)
  );
  const supportedHsaReturnedExcessContributionsUnder9100Relief = Decimal.max(
    new Decimal(0),
    d(input.supportedHsaReturnedExcessContributionsUnder9100Relief)
  );
  const line47 = Decimal.max(
    new Decimal(0),
    rawLine47
      .minus(supportedHsaReturnedExcessContributionsByDueDate)
      .minus(supportedHsaReturnedExcessContributionsUnder9100Relief)
  );
  const line48 = line46.plus(line47);
  const hsaValueDec31 = Decimal.max(new Decimal(0), d(input.hsaValueDec31));
  const line49 = EXCESS_CONTRIBUTION_TAX_RATE.times(Decimal.min(line48, hsaValueDec31));

  audit.record("Form 5329", "42", "Prior year HSA excess contributions carryforward", line42,
    "Excess contributions from prior-year Form 5329 Line 48");
  audit.record("Form 5329", "43", "Available HSA contribution room to absorb prior-year excess", line43,
    "Unused HSA contribution room for 2025 (Form 8889 Line 12 minus Line 2)");
  audit.record("Form 5329", "44", "HSA distributions included in income", line44,
    "2025 taxable HSA distributions (Form 8889 Line 16)");
  audit.record("Form 5329", "45", "Total reductions to prior-year HSA excess", line45,
    "Line 43 + Line 44", {
      "Line 43": line43,
      "Line 44": line44,
    });
  audit.record("Form 5329", "46", "Remaining prior-year HSA excess contributions", line46,
    "max(0, Line 42 - Line 45)", {
      "Line 42": line42,
      "Line 45": line45,
    });
  audit.record("Form 5329", "47", "Current-year HSA excess contributions", line47,
    supportedHsaReturnedExcessContributionsByDueDate.greaterThan(0)
      || supportedHsaReturnedExcessContributionsUnder9100Relief.greaterThan(0)
      ? "max(0, raw current-year HSA excess - supported timely returned excess contributions - supported section 301.9100-2 returned excess contributions)"
      : "Excess HSA contributions for 2025", {
      "Raw current-year HSA excess before returned-excess reduction": rawLine47,
      "Supported timely returned excess contributions": supportedHsaReturnedExcessContributionsByDueDate,
      "Supported section 301.9100-2 returned excess contributions":
        supportedHsaReturnedExcessContributionsUnder9100Relief,
    });
  audit.record("Form 5329", "48", "Total HSA excess contributions", line48,
    "Line 46 + Line 47", {
      "Line 46": line46,
      "Line 47": line47,
    });
  audit.record("Form 5329", "49",
    "Additional tax on excess contributions to HSAs", line49,
    "6% × min(Line 48, value of HSAs on December 31, 2025)", {
      "Line 48": line48,
      "HSA value December 31": hsaValueDec31,
    });

  // ── Part VIII: Excess contributions to ABLE accounts ────────────────
  const line50 = Decimal.max(new Decimal(0), d(input.ablePriorYearExcessContributions));
  const line51 = Decimal.max(new Decimal(0), d(input.ableReductions));
  const ableRemainingPriorYear = Decimal.max(new Decimal(0), line50.minus(line51));
  const line52 = Decimal.max(new Decimal(0), d(input.ableCurrentYearExcessContributions));
  const ableTotalExcess = ableRemainingPriorYear.plus(line52);
  const ableValueDec31 = Decimal.max(new Decimal(0), d(input.ableValueDec31));
  const line53 = EXCESS_CONTRIBUTION_TAX_RATE.times(Decimal.min(ableTotalExcess, ableValueDec31));

  audit.record("Form 5329", "50", "Prior year ABLE account excess contributions carryforward", line50,
    "Excess contributions from prior-year Form 5329 Line 53");
  audit.record("Form 5329", "51", "Reductions to prior-year ABLE excess (contribution room plus distributions)", line51,
    "Available ABLE contribution room for 2025 plus 2025 ABLE distributions");
  audit.record("Form 5329", "52", "Current-year ABLE excess contributions", line52,
    "Excess ABLE contributions for 2025");
  audit.record("Form 5329", "53",
    "Additional tax on excess contributions to ABLE accounts", line53,
    "6% × min(remaining prior-year excess + current-year excess, value of ABLE accounts on December 31, 2025)", {
      "Line 50 (prior year excess)": line50,
      "Line 51 (reductions)": line51,
      "Remaining prior-year excess": ableRemainingPriorYear,
      "Line 52 (current year excess)": line52,
      "Total ABLE excess": ableTotalExcess,
      "ABLE value December 31": ableValueDec31,
    });

  // ── Part IX: Excess accumulations in qualified retirement plans (RMD) ──
  const line54 = Decimal.max(new Decimal(0), d(input.requiredMinimumDistribution));
  const line55 = Decimal.max(new Decimal(0), d(input.actualDistributionsForRMD));
  const line56 = Decimal.max(new Decimal(0), line54.minus(line55));
  const rmdTaxRate = input.rmdShortfallCorrectedWithinWindow
    ? RMD_EXCESS_ACCUMULATION_REDUCED_TAX_RATE
    : RMD_EXCESS_ACCUMULATION_TAX_RATE;
  const line57 = line56.times(rmdTaxRate);

  if (line54.greaterThan(0) || line55.greaterThan(0)) {
    audit.record("Form 5329", "54", "Minimum required distribution for 2025", line54,
      "Aggregate required minimum distribution from qualified retirement plans and IRAs");
    audit.record("Form 5329", "55", "Amount actually distributed for 2025", line55,
      "Total distributions taken to satisfy the RMD requirement");
    audit.record("Form 5329", "56", "Excess accumulation (RMD shortfall)", line56,
      "max(0, Line 54 - Line 55)", {
        "Line 54": line54,
        "Line 55": line55,
      });
    audit.record("Form 5329", "57",
      "Additional tax on excess accumulations", line57,
      input.rmdShortfallCorrectedWithinWindow
        ? "10% × Line 56 (reduced rate — shortfall corrected within correction window)"
        : "25% × Line 56",
      {
        "Line 56": line56,
        "Tax rate": rmdTaxRate,
        "Corrected within correction window": input.rmdShortfallCorrectedWithinWindow ? "Yes" : "No",
      });
  }

  const totalAdditionalTax = line4.plus(line8).plus(line17).plus(line25).plus(line33).plus(line41).plus(line49).plus(line53).plus(line57);

  return {
    line1,
    line2,
    line2ExceptionNumber,
    line3,
    line4,
    simpleIRADistributionsWithinFirstTwoYears,
    line5,
    line6,
    line7,
    line8,
    line9,
    line10,
    line11,
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
    line36,
    line37,
    line38,
    line39,
    line40,
    line41,
    line42,
    line43,
    line44,
    line45,
    line46,
    line47,
    line48,
    line49,
    line50,
    line51,
    line52,
    line53,
    line54,
    line55,
    line56,
    line57,
    totalAdditionalTax,
    lines: audit.getLines(),
  };
}

function applyManualExceptionCap(
  exceptionNumber: string | undefined,
  amount: Decimal,
  alreadyUsedAnnualRoom: Decimal = new Decimal(0)
): Decimal {
  if (exceptionNumber === DOMESTIC_ABUSE_EXCEPTION_NUMBER) {
    return Decimal.min(
      Decimal.max(new Decimal(0), DOMESTIC_ABUSE_2025_ANNUAL_CAP.minus(alreadyUsedAnnualRoom)),
      amount
    );
  }

  if (exceptionNumber === EMERGENCY_PERSONAL_EXPENSE_EXCEPTION_NUMBER) {
    return Decimal.min(
      Decimal.max(new Decimal(0), EMERGENCY_PERSONAL_EXPENSE_ANNUAL_CAP.minus(alreadyUsedAnnualRoom)),
      amount
    );
  }

  return amount;
}

function allocateCombinedAnnualExceptionCap(
  annualCap: Decimal,
  directAmount: Decimal,
  supportedTraditionalAmount: Decimal,
  supportedRothAmount: Decimal
): CombinedAnnualExceptionAllocation {
  const cappedDirectAmount = Decimal.min(annualCap, directAmount);
  const remainingAfterDirect = Decimal.max(new Decimal(0), annualCap.minus(cappedDirectAmount));
  const cappedSupportedTraditionalAmount = Decimal.min(remainingAfterDirect, supportedTraditionalAmount);
  const remainingAfterTraditional = Decimal.max(
    new Decimal(0),
    remainingAfterDirect.minus(cappedSupportedTraditionalAmount)
  );
  const cappedSupportedRothAmount = Decimal.min(remainingAfterTraditional, supportedRothAmount);

  return {
    directAmount: cappedDirectAmount,
    supportedTraditionalAmount: cappedSupportedTraditionalAmount,
    supportedRothAmount: cappedSupportedRothAmount,
  };
}

function deriveLine2ExceptionNumber(
  manualExceptionNumber: string | undefined,
  validatedManualExceptionAmount: Decimal,
  supportedAutomaticExceptionAmount: Decimal,
  supportedSeparationFromServiceAfterAge55Amount: Decimal,
  substantiallyEqualPeriodicPaymentsExceptionAmount: Decimal,
  deathDistributionExceptionAmount: Decimal,
  supportedDeathDistributionAmount: Decimal,
  supportedDisabilityDistributionAmount: Decimal,
  qualifiedDomesticRelationsOrderDistributionAmount: Decimal,
  supportedQualifiedDomesticRelationsOrderDistributionAmount: Decimal,
  medicalExpenseExceptionAmount: Decimal,
  supportedMedicalExpenseExceptionAmount: Decimal,
  unemployedHealthInsurancePremiumExceptionAmount: Decimal,
  qualifiedHigherEducationExpenseExceptionAmount: Decimal,
  qualifiedFirstTimeHomebuyerDistributionAmount: Decimal,
  irsLevyDistributionExceptionAmount: Decimal,
  qualifiedReservistDistributionExceptionAmount: Decimal,
  eligibleGovernmental457bDistributionExceptionAmount: Decimal,
  pre1986EmployerPlanDistributionExceptionAmount: Decimal,
  section404kDividendDistributionExceptionAmount: Decimal,
  section72qAnnuityExceptionAmount: Decimal,
  federalPhasedRetirementAnnuityExceptionAmount: Decimal,
  permissibleEacaWithdrawalExceptionAmount: Decimal,
  qualifiedBirthOrAdoptionExceptionAmount: Decimal,
  terminalIllnessExceptionAmount: Decimal,
  supportedTerminalIllnessDistributionAmount: Decimal,
  returnedContributionByDueDateTaxableEarningsExceptionAmount: Decimal,
  domesticAbuseExceptionAmount: Decimal,
  emergencyPersonalExpenseExceptionAmount: Decimal,
  supportedIncorrectEarlyDistributionAge59AndHalfAmount: Decimal,
  supportedQualifiedFirstTimeHomebuyerDistribution: Decimal,
  supportedReturnedContributionByDueDateTaxableEarnings: Decimal,
  supportedRepaymentEligibleTraditionalDistributionTaxableShare: Decimal,
  supportedRepaymentEligibleTraditionalDistributionExceptionNumber: string | undefined,
  supportedRepaymentEligibleRothDistributionTaxableShare: Decimal,
  supportedRepaymentEligibleRothDistributionExceptionNumber: string | undefined,
  line2: Decimal
): string | undefined {
  if (line2.isZero()) {
    return undefined;
  }

  const exceptionNumbers = new Set<string>();
  const effectiveSupportedAutomaticExceptionAmount = Decimal.min(line2, supportedAutomaticExceptionAmount);
  const effectiveValidatedManualExceptionAmount = Decimal.min(
    validatedManualExceptionAmount,
    Decimal.max(new Decimal(0), line2.minus(effectiveSupportedAutomaticExceptionAmount))
  );
  let remainingSupportedAutomaticExceptionAmount = effectiveSupportedAutomaticExceptionAmount;

  if (manualExceptionNumber !== undefined && effectiveValidatedManualExceptionAmount.greaterThan(0)) {
    exceptionNumbers.add(manualExceptionNumber);
  }

  const recordSupportedException = (amount: Decimal, exceptionNumber?: string) => {
    if (remainingSupportedAutomaticExceptionAmount.lte(0) || amount.lte(0)) {
      return;
    }

    const effectiveAmount = Decimal.min(amount, remainingSupportedAutomaticExceptionAmount);
    remainingSupportedAutomaticExceptionAmount = Decimal.max(
      new Decimal(0),
      remainingSupportedAutomaticExceptionAmount.minus(effectiveAmount)
    );

    if (exceptionNumber !== undefined && effectiveAmount.greaterThan(0)) {
      exceptionNumbers.add(exceptionNumber);
    }
  };

  recordSupportedException(
    supportedSeparationFromServiceAfterAge55Amount,
    SEPARATION_FROM_SERVICE_AFTER_AGE_55_EXCEPTION_NUMBER
  );
  recordSupportedException(
    substantiallyEqualPeriodicPaymentsExceptionAmount,
    SUBSTANTIALLY_EQUAL_PERIODIC_PAYMENTS_EXCEPTION_NUMBER
  );
  recordSupportedException(deathDistributionExceptionAmount, DEATH_EXCEPTION_NUMBER);
  recordSupportedException(supportedDeathDistributionAmount, DEATH_EXCEPTION_NUMBER);
  recordSupportedException(supportedDisabilityDistributionAmount, DISABILITY_EXCEPTION_NUMBER);
  recordSupportedException(
    qualifiedDomesticRelationsOrderDistributionAmount,
    QUALIFIED_DOMESTIC_RELATIONS_ORDER_EXCEPTION_NUMBER
  );
  recordSupportedException(
    supportedQualifiedDomesticRelationsOrderDistributionAmount,
    QUALIFIED_DOMESTIC_RELATIONS_ORDER_EXCEPTION_NUMBER
  );
  recordSupportedException(medicalExpenseExceptionAmount, MEDICAL_EXPENSE_EXCEPTION_NUMBER);
  recordSupportedException(supportedMedicalExpenseExceptionAmount, MEDICAL_EXPENSE_EXCEPTION_NUMBER);
  recordSupportedException(
    unemployedHealthInsurancePremiumExceptionAmount,
    UNEMPLOYED_HEALTH_INSURANCE_PREMIUM_EXCEPTION_NUMBER
  );
  recordSupportedException(qualifiedHigherEducationExpenseExceptionAmount, HIGHER_EDUCATION_EXCEPTION_NUMBER);
  recordSupportedException(qualifiedFirstTimeHomebuyerDistributionAmount, FIRST_TIME_HOMEBUYER_EXCEPTION_NUMBER);
  recordSupportedException(irsLevyDistributionExceptionAmount, IRS_LEVY_EXCEPTION_NUMBER);
  recordSupportedException(qualifiedReservistDistributionExceptionAmount, QUALIFIED_RESERVIST_EXCEPTION_NUMBER);
  recordSupportedException(
    eligibleGovernmental457bDistributionExceptionAmount,
    ELIGIBLE_GOVERNMENTAL_457B_EXCEPTION_NUMBER
  );
  recordSupportedException(pre1986EmployerPlanDistributionExceptionAmount, PRE_1986_EMPLOYER_PLAN_EXCEPTION_NUMBER);
  recordSupportedException(section404kDividendDistributionExceptionAmount, SECTION_404K_DIVIDEND_EXCEPTION_NUMBER);
  recordSupportedException(section72qAnnuityExceptionAmount, SECTION_72Q_ANNUITY_EXCEPTION_NUMBER);
  recordSupportedException(
    federalPhasedRetirementAnnuityExceptionAmount,
    FEDERAL_PHASED_RETIREMENT_ANNUITY_EXCEPTION_NUMBER
  );
  recordSupportedException(permissibleEacaWithdrawalExceptionAmount, PERMISSIBLE_EACA_WITHDRAWAL_EXCEPTION_NUMBER);
  recordSupportedException(qualifiedBirthOrAdoptionExceptionAmount, QUALIFIED_BIRTH_OR_ADOPTION_EXCEPTION_NUMBER);
  recordSupportedException(terminalIllnessExceptionAmount, TERMINAL_ILLNESS_EXCEPTION_NUMBER);
  recordSupportedException(supportedTerminalIllnessDistributionAmount, TERMINAL_ILLNESS_EXCEPTION_NUMBER);
  recordSupportedException(
    returnedContributionByDueDateTaxableEarningsExceptionAmount,
    RETURNED_CONTRIBUTION_EXCEPTION_NUMBER
  );
  recordSupportedException(domesticAbuseExceptionAmount, DOMESTIC_ABUSE_EXCEPTION_NUMBER);
  recordSupportedException(emergencyPersonalExpenseExceptionAmount, EMERGENCY_PERSONAL_EXPENSE_EXCEPTION_NUMBER);
  recordSupportedException(
    supportedIncorrectEarlyDistributionAge59AndHalfAmount,
    INCORRECTLY_REPORTED_EARLY_DISTRIBUTION_EXCEPTION_NUMBER
  );
  recordSupportedException(supportedQualifiedFirstTimeHomebuyerDistribution, FIRST_TIME_HOMEBUYER_EXCEPTION_NUMBER);
  recordSupportedException(
    supportedReturnedContributionByDueDateTaxableEarnings,
    RETURNED_CONTRIBUTION_EXCEPTION_NUMBER
  );
  recordSupportedException(
    supportedRepaymentEligibleTraditionalDistributionTaxableShare,
    supportedRepaymentEligibleTraditionalDistributionExceptionNumber
  );
  recordSupportedException(
    supportedRepaymentEligibleRothDistributionTaxableShare,
    supportedRepaymentEligibleRothDistributionExceptionNumber
  );

  if (exceptionNumbers.size === 0) {
    return undefined;
  }

  return exceptionNumbers.size === 1
    ? [...exceptionNumbers][0]
    : MULTIPLE_EXCEPTIONS_NUMBER;
}
