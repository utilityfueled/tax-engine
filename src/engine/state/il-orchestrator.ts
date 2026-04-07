/**
 * Illinois State Return Orchestrator — Federal-to-State Bridge
 * Spec: spec/state/il-orchestrator.yaml
 *
 * Maps the federal TaxReturnResult to IL-1040 inputs so the caller only needs
 * to supply IL-specific information (property tax, 529 contributions,
 * withholding, estimated payments, etc.).
 *
 * Automatic mappings from federal:
 * - federalAGI ← agi
 * - federalEIC ← earnedIncomeCredit
 * - taxExemptInterest ← taxExemptInterest (Line 2a)
 * - retirementIncomeSubtraction ← SS taxable + IRA taxable + pension taxable
 * - taxable savings bond interest from Form 8815 → Schedule M Line 22 fallback
 */

import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { FilingStatus } from "@/models/constants.js";
import {
  calculateIL1040,
  type IL1040Input,
  type IL1040Result,
  type ILDirectDepositInput,
  type ILHealthInsuranceCheckboxInput,
  type ILRefundMethod,
} from "./il-1040.js";
import type { ScheduleMInput } from "./il-schedule-m.js";
import type { ScheduleICRInput } from "./il-schedule-icr.js";
import type { ScheduleCRInput } from "./il-schedule-cr.js";
import type { ScheduleNRInput } from "./il-schedule-nr.js";
import type { ScheduleEEICInput } from "./il-schedule-e-eic.js";
import type { UseTaxWorksheetInput } from "./il-use-tax.js";
import type { ILScheduleWITRecord } from "./il-schedule-il-wit.js";
import type { ScheduleGInput } from "./il-schedule-g.js";
import type { Schedule1299CAttachmentInput } from "./il-schedule-1299-c.js";

// ---------------------------------------------------------------------------
// IL-Specific Input
// ---------------------------------------------------------------------------

/**
 * IL-specific inputs that cannot be derived from the federal return.
 * The orchestrator combines these with auto-mapped federal values.
 */
export interface ILStateInput {
  // Filing details
  /** Whether taxpayer is claimed as a dependent on another return */
  claimedAsDependent: boolean;
  /** For MFJ: whether spouse is also claimed as dependent */
  spouseClaimedAsDependent?: boolean;
  /** Number of persons age 65+ (0, 1, or 2 for MFJ) */
  age65OrOlderCount: number;
  /** Number of legally blind persons (0, 1, or 2 for MFJ) */
  blindCount: number;
  /** Number of dependents */
  dependentCount: number;
  /** Whether taxpayer has at least one dependent child under age 12 */
  hasChildUnder12: boolean;

  // IL-1040 Step 3 — Additional subtractions not auto-computed
  /** Prior-year IL refund included in federal AGI (IL-1040 Line 6) */
  ilRefundSubtraction?: Decimal;
  /** Additional retirement income not captured by federal SS/IRA/pension
   *  (e.g., government retirement, self-employed plan distributions).
   *  Do not use this for 2025+ K-1 retirement-payment subtractions that belong
   *  on Schedule M Line 14. */
  additionalRetirementIncome?: Decimal;
  /** 2025+ Schedule M Line 14 shortcut for certain K-1-P / K-1-T retirement
   *  payments that Illinois excludes from IL-1040 Line 5. */
  k1RetirementPaymentsSubtraction?: Decimal;
  /** Illinois-exempt municipal bond interest that should flow to Schedule M,
   *  Line 34 after the federal tax-exempt amount is added back on IL-1040 Line 2. */
  illinoisExemptTaxExemptInterest?: Decimal;

  // Step 5 — Recapture
  /** Recapture of investment tax credits (Line 13, rare) */
  investmentCreditRecapture?: Decimal;

  // Step 6 — Credits
  /** Credit from Schedule 1299-C */
  schedule1299CCredit?: Decimal;
  /** Attached Schedule 1299-C Step 3 credit grid */
  schedule1299C?: Schedule1299CAttachmentInput;

  // Schedule M inputs (optional)
  scheduleM?: ScheduleMInput;

  // Schedule ICR inputs (optional)
  scheduleICR?: ScheduleICRInput;

  // Schedule G inputs (optional)
  scheduleG?: ScheduleGInput;

  // Schedule CR inputs (optional — for residents with other-state income)
  scheduleCR?: ScheduleCRInput;

  // Schedule IL-E/EIC inputs (optional — for EITC/CTC/dependent computation)
  scheduleEEIC?: ScheduleEEICInput;

  // Schedule NR inputs (optional — for nonresidents/part-year residents)
  scheduleNR?: ScheduleNRInput;

  // Use Tax Worksheet (optional — auto-computes Line 21 from purchases)
  useTaxWorksheet?: UseTaxWorksheetInput;

  // Step 7 — Other taxes
  householdEmploymentTax?: Decimal;
  useTax?: Decimal;
  compassionateUseSurcharge?: Decimal;

  // Step 8 — Payments
  ilWithholding?: Decimal;
  scheduleILWIT?: {
    records: ILScheduleWITRecord[];
  };
  estimatedPayments?: Decimal;
  passThroughWithholding?: Decimal;
  passThroughEntityTaxCredit?: Decimal;

  // Step 10 / Step 11
  voluntaryCharitableDonations?: Decimal;
  refundAmountRequested?: Decimal;
  refundMethod?: ILRefundMethod;
  directDeposit?: ILDirectDepositInput;
  creditForwardAmount?: Decimal;
  firstYearIllinoisReturn?: boolean;
  healthInsuranceCheckbox?: ILHealthInsuranceCheckboxInput;

  // IL-2210 underpayment penalty (optional)
  il2210?: {
    priorYearTax: Decimal;
    priorYearReturnFiled: boolean;
    qualifiesAsFarmer?: boolean;
    is65OrOlderAndPermanentlyInNursingHome?: boolean;
    notRequiredToFilePriorYearReturn?: boolean;
    estimatedPaymentsByQuarter: [Decimal, Decimal, Decimal, Decimal];
    annualizedInstallmentMethod?: {
      periods: [
        {
          baseIncome: Decimal;
          exemptions: Decimal;
          surcharges: Decimal;
          credits: Decimal;
          ilChildTaxCredit?: Decimal;
        },
        {
          baseIncome: Decimal;
          exemptions: Decimal;
          surcharges: Decimal;
          credits: Decimal;
          ilChildTaxCredit?: Decimal;
        },
        {
          baseIncome: Decimal;
          exemptions: Decimal;
          surcharges: Decimal;
          credits: Decimal;
          ilChildTaxCredit?: Decimal;
        },
        {
          baseIncome: Decimal;
          exemptions: Decimal;
          surcharges: Decimal;
          credits: Decimal;
          ilChildTaxCredit?: Decimal;
        },
      ];
    };
  };
}

// ---------------------------------------------------------------------------
// Result (re-export)
// ---------------------------------------------------------------------------

export type { IL1040Result } from "./il-1040.js";

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Bridge federal TaxReturnResult + IL-specific inputs → IL-1040 calculation.
 *
 * Auto-maps:
 * - federalAGI from federal agi
 * - federalEIC from federal earnedIncomeCredit
 * - taxExemptInterest from federal taxExemptInterest (Line 2a)
 * - retirementIncomeSubtraction from SS + IRA + pension taxable amounts
 */
export function calculateIllinoisReturn(
  federal: TaxReturnResult,
  ilInputs: ILStateInput,
): IL1040Result {
  const ZERO = new Decimal(0);

  // Auto-compute retirement income subtraction from federal breakdown
  // IL subtracts all retirement income included in federal AGI:
  // Social Security (Line 6b) + IRA distributions (Line 4b) + pension (Line 5b)
  const autoRetirement = federal.socialSecurityBenefitsTaxable
    .plus(federal.iraDistributionsTaxable)
    .plus(federal.pensionDistributionsTaxable);

  // Add any additional retirement income the user specifies
  const totalRetirementSubtraction = autoRetirement.plus(
    ilInputs.additionalRetirementIncome ?? ZERO
  );
  const taxableSavingsBondInterest = federal.form8815
    ? Decimal.max(
        federal.form8815.totalInterest.minus(federal.form8815.excludableSavingsBondInterest),
        ZERO,
      )
    : ZERO;

  // Map filing status from federal result (string) to typed FilingStatus
  const filingStatus = federal.filingStatus as FilingStatus;
  const effectiveScheduleM = mergeScheduleMInput(
    federal.taxYear,
    filingStatus,
    ilInputs.scheduleM,
    ilInputs.k1RetirementPaymentsSubtraction ?? ZERO,
    ilInputs.illinoisExemptTaxExemptInterest ?? ZERO,
    taxableSavingsBondInterest,
  );

  // When Schedule IL-E/EIC is provided, derive dependent-related values from Step 2.
  // Step 3 qualifying children do not affect Line 10d or Illinois child tax credit eligibility.
  const effectiveDependentCount = ilInputs.scheduleEEIC
    ? ilInputs.scheduleEEIC.dependents.length
    : ilInputs.dependentCount;
  const effectiveHasChildUnder12 = ilInputs.scheduleEEIC
    ? ilInputs.scheduleEEIC.dependents.some((dep) => dep.isUnder12)
    : ilInputs.hasChildUnder12;

  // Build IL-1040 input from federal result + IL-specific inputs
  const il1040Input: IL1040Input = {
    taxYear: federal.taxYear,
    filingStatus,

    // Federal results (auto-mapped)
    federalAGI: federal.agi,
    federalEIC: federal.earnedIncomeCredit,

    // Step 2 — Additions
    taxExemptInterest: federal.taxExemptInterest,
    otherAdditions: ZERO, // Overridden by scheduleM if provided

    // Step 3 — Subtractions
    retirementIncomeSubtraction: totalRetirementSubtraction,
    ilRefundSubtraction: ilInputs.ilRefundSubtraction ?? ZERO,
    otherSubtractions: ZERO, // Overridden by scheduleM if provided

    // Step 4 — Exemptions
    claimedAsDependent: ilInputs.claimedAsDependent,
    spouseClaimedAsDependent: ilInputs.spouseClaimedAsDependent,
    age65OrOlderCount: ilInputs.age65OrOlderCount,
    blindCount: ilInputs.blindCount,
    dependentCount: effectiveDependentCount,

    // Step 5 — Recapture
    investmentCreditRecapture: ilInputs.investmentCreditRecapture ?? ZERO,

    // Step 6 — Credits
    otherStateCredit: ZERO, // Overridden by scheduleCR if provided
    schedule1299CCredit: ilInputs.schedule1299CCredit ?? ZERO,
    schedule1299C: ilInputs.schedule1299C,

    // Optional schedule inputs
    scheduleM: effectiveScheduleM,
    scheduleICR: ilInputs.scheduleICR,
    scheduleG: ilInputs.scheduleG,
    scheduleCR: ilInputs.scheduleCR,
    scheduleEEIC: ilInputs.scheduleEEIC,
    scheduleNR: ilInputs.scheduleNR,
    useTaxWorksheet: ilInputs.useTaxWorksheet,

    // Step 7 — Other taxes
    householdEmploymentTax: ilInputs.householdEmploymentTax ?? ZERO,
    useTax: ilInputs.useTax ?? ZERO,
    compassionateUseSurcharge: ilInputs.compassionateUseSurcharge ?? ZERO,

    // Step 8 — Payments
    ilWithholding: ilInputs.ilWithholding ?? ZERO,
    scheduleILWIT: ilInputs.scheduleILWIT,
    estimatedPayments: ilInputs.estimatedPayments ?? ZERO,
    passThroughWithholding: ilInputs.passThroughWithholding ?? ZERO,
    passThroughEntityTaxCredit: ilInputs.passThroughEntityTaxCredit ?? ZERO,
    voluntaryCharitableDonations: ilInputs.voluntaryCharitableDonations ?? ZERO,
    refundAmountRequested: ilInputs.refundAmountRequested,
    refundMethod: ilInputs.refundMethod,
    directDeposit: ilInputs.directDeposit,
    creditForwardAmount: ilInputs.creditForwardAmount,
    firstYearIllinoisReturn: ilInputs.firstYearIllinoisReturn,
    healthInsuranceCheckbox: ilInputs.healthInsuranceCheckbox,

    // Refundable credits
    hasChildUnder12: effectiveHasChildUnder12,

    // IL-2210
    il2210: ilInputs.il2210,
  };

  return calculateIL1040(il1040Input);
}

function mergeScheduleMInput(
  taxYear: number,
  filingStatus: FilingStatus,
  scheduleM: ScheduleMInput | undefined,
  k1RetirementPaymentsSubtraction: Decimal,
  illinoisExemptTaxExemptInterest: Decimal,
  taxableSavingsBondInterest: Decimal,
): ScheduleMInput | undefined {
  if (
    !scheduleM
    && k1RetirementPaymentsSubtraction.isZero()
    && illinoisExemptTaxExemptInterest.isZero()
    && taxableSavingsBondInterest.isZero()
  ) {
    return undefined;
  }

  const baseScheduleM = scheduleM ?? createEmptyScheduleMInput(taxYear, filingStatus);
  const shouldApplySavingsBondFallback = baseScheduleM.usGovernmentInterest.isZero()
    && taxableSavingsBondInterest.greaterThan(0);

  const mergedScheduleM: ScheduleMInput = {
    ...baseScheduleM,
    distributiveShareSubtractions: baseScheduleM.distributiveShareSubtractions.plus(
      k1RetirementPaymentsSubtraction,
    ),
    usGovernmentInterest: shouldApplySavingsBondFallback
      ? taxableSavingsBondInterest
      : baseScheduleM.usGovernmentInterest,
    ilBondInterest: baseScheduleM.ilBondInterest.plus(illinoisExemptTaxExemptInterest),
  };

  return mergedScheduleM;
}

function createEmptyScheduleMInput(
  taxYear: number,
  filingStatus: FilingStatus,
): ScheduleMInput {
  const ZERO = new Decimal(0);

  return {
    taxYear,
    filingStatus,
    childTaxExemptInterest: ZERO,
    distributiveShareAdditions: ZERO,
    lloydsLoss: ZERO,
    nonIL529Earnings: ZERO,
    ilDepreciationAddition: ZERO,
    recapture529OutOfState: ZERO,
    recapture529Nonqualified: ZERO,
    studentAssistanceCreditRecapture: ZERO,
    otherAdditions: ZERO,
    il529Contributions: ZERO,
    distributiveShareSubtractions: ZERO,
    restorationClaimOfRight: ZERO,
    jobTrainingContributions: ZERO,
    federalCreditRelatedExpenses: ZERO,
    medicalDebtRelief: ZERO,
    ilDepreciationSubtraction: ZERO,
    ableContributions: ZERO,
    militaryPay: ZERO,
    usGovernmentInterest: ZERO,
    recoveryOfItemsDeducted: ZERO,
    ridesharing: ZERO,
    lifeInsurancePayment: ZERO,
    lloydsIncome: ZERO,
    funeralTrustIncome: ZERO,
    healthCareProviderLoanRepayment: ZERO,
    naziPersecutionReparations: ZERO,
    ilBondInterest: ZERO,
    nonUSGovernmentBondInterest: ZERO,
    childUSGovernmentInterest: ZERO,
    railroadIncome: ZERO,
    unjustImprisonmentCompensation: ZERO,
    plan529DistributionsForCredits: ZERO,
    cannabisDisallowedDeductions: ZERO,
    fertilityFraudAward: ZERO,
  };
}
