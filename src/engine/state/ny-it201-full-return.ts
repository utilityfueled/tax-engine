/**
 * New York IT-201 Full-Year Resident Return Orchestrator.
 * Wires all IT-201 sub-modules into a single end-to-end computation.
 * Spec: spec/state/ny-it201-full-return.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";

import {
  calculateNYIT201AdditionsSubtractions,
  type NYIT201AdditionsSubtractionsInput,
  type NYIT201AdditionsSubtractionsResult,
} from "@/engine/state/ny-it201-additions-subtractions.js";
import {
  calculateNYIT201Deduction,
  type NYIT201DeductionResult,
} from "@/engine/state/ny-it201-standard-deduction.js";
import {
  calculateNYIT201Tax,
  type NYIT201TaxComputationResult,
} from "@/engine/state/ny-it201-tax-computation.js";
import {
  calculateNYIT201Credits,
  computeHouseholdCredit,
  type NYIT201CreditsResult,
} from "@/engine/state/ny-it201-credits.js";
import {
  calculateNYIT201NYCTax,
  type NYIT201NYCTaxResult,
} from "@/engine/state/ny-it201-nyc-tax.js";
import {
  calculateNYIT201YonkersTax,
  type YonkersResidencyStatus,
  type NYIT201YonkersTaxResult,
} from "@/engine/state/ny-it201-yonkers-tax.js";
import {
  calculateNYIT213,
  type NYIT213Result,
} from "@/engine/state/ny-it213-empire-state-child-credit.js";
import {
  calculateNYIT272,
  type NYIT272Result,
} from "@/engine/state/ny-it272-college-tuition-credit.js";
import {
  calculateNYIT214,
  type NYIT214Result,
  type NYIT214RenterInput,
  type NYIT214HomeownerInput,
} from "@/engine/state/ny-it214-real-property-tax-credit.js";
import {
  calculateNYIT216,
  type NYIT216Result,
} from "@/engine/state/ny-it216-child-dependent-care-credit.js";
import {
  calculateNYIT217,
  type NYIT217Input,
  type NYIT217Result,
} from "@/engine/state/ny-it217-farmers-school-tax-credit.js";
import {
  calculateNYIT215,
  type NYIT215Result,
} from "@/engine/state/ny-it215-earned-income-credit.js";
import {
  calculateNYIT209,
  type NYIT209Result,
} from "@/engine/state/ny-it209-noncustodial-parent-earned-income-credit.js";
import {
  calculateNYIT270,
  type NYIT270Result,
} from "@/engine/state/ny-it270-income-tax-elimination-credit.js";
import {
  calculateNYIT196,
  type NYIT196Input,
  type NYIT196Result,
} from "@/engine/state/ny-it196-itemized-deduction.js";
import {
  calculateNYIT112R,
  type NYIT112ROtherJurisdiction,
  type NYIT112RResult,
} from "@/engine/state/ny-it112-r-resident-credit.js";
import {
  calculateNYMCTMT,
  type NYMCTMTResult,
} from "@/engine/state/ny-mctmt.js";
import {
  calculateNYIT225,
  type NYIT225Input,
  type NYIT225Result,
} from "@/engine/state/ny-it225-ny-state-modifications.js";
import {
  calculateNYIT201ATTRefundableCredits,
  type NYIT201ATTRefundableCreditEntry,
  type NYIT201ATTRefundableCreditsResult,
} from "@/engine/state/ny-it201-att-refundables.js";
import {
  calculateNYIT119,
  type NYIT119Result,
} from "@/engine/state/ny-it119-star-credit-advance-payment-reconciliation.js";
import {
  calculateNYIT201ATTNonrefundableCredits,
  type NYIT201ATTNonrefundableCreditEntry,
  type NYIT201ATTNonrefundableCreditsResult,
} from "@/engine/state/ny-it201-att-nonrefundables.js";
import {
  calculateNYIT249,
  type NYIT249Result,
} from "@/engine/state/ny-it249-long-term-care-insurance-credit.js";
import { calculateNYIT201Withholding } from "@/engine/state/ny-it201-withholding.js";
import {
  calculateNYIT227,
  type NYIT227ContributionEntry,
  type NYIT227Result,
} from "@/engine/state/ny-it227-voluntary-contributions.js";
import type { NYPensionExclusionDetail, NYCollegeTuitionStudent } from "@/engine/state/ny-it201-additions-subtractions.js";
import type { Form1099G, Form1099R, FormW2G, W2 } from "@/models/inputs.js";

export type CollegeTuitionPreference = "credit" | "deduction";

/* ---------- Input ---------- */

export interface NYIT201FullReturnInput {
  /** Federal adjusted gross income (Form 1040 line 11) */
  federalAgi: Decimal | string | number;
  filingStatus: FilingStatus;
  taxYear: number;

  /** Whether this taxpayer can be claimed as a dependent on another return */
  canBeClaimedAsDependent?: boolean;
  /** Number of dependents listed on IT-201 item H */
  numberOfDependents?: number;

  /* ----- Additions (lines 20-23) ----- */
  outOfStateMuniBondInterest?: Decimal | string | number;
  publicEmployee414hContributions?: Decimal | string | number;
  nycFlexibleSpendingContributions?: Decimal | string | number;
  nonQualified529Distributions?: Decimal | string | number;
  otherAdditions?: Decimal | string | number;

  /* ----- IT-225 New York State Modifications ----- */
  /** IT-225 inputs — when provided, computed additions/subtractions replace
   *  the otherAdditions and otherSubtractions passthroughs on lines 23 and 31.
   *  If both it225 inputs AND otherAdditions/otherSubtractions are provided,
   *  the IT-225 computed totals are used (the passthroughs are ignored). */
  it225?: Omit<NYIT225Input, "filingStatus" | "taxYear">;

  /* ----- Subtractions (lines 25-31) ----- */
  stateLocalTaxRefunds?: Decimal | string | number;
  governmentPensionIncome?: Decimal | string | number;
  taxableSocialSecurityBenefits?: Decimal | string | number;
  usGovernmentBondInterest?: Decimal | string | number;
  pensionExclusion?: NYPensionExclusionDetail;
  spousePensionExclusion?: NYPensionExclusionDetail;
  collegeTuitionStudents?: NYCollegeTuitionStudent[];
  /** Whether to claim tuition as credit (IT-272) or deduction (IT-201 line 30).
   *  Default: "deduction". When "credit", tuition students are routed to IT-272
   *  instead of the line 30 subtraction. */
  collegeTuitionPreference?: CollegeTuitionPreference;
  otherSubtractions?: Decimal | string | number;

  /* ----- Deduction ----- */
  /** NY itemized deduction from Form IT-196 line 49 (if itemizing).
   *  Provide either this passthrough OR it196 inputs for computed deduction. */
  nyItemizedDeduction?: Decimal | string | number;
  /** For married filing separately, confirm the spouse also itemizes on their New York return. */
  spouseUsesItemizedDeduction?: boolean;
  /** IT-196 inputs — when provided, the itemized deduction is computed
   *  instead of using the nyItemizedDeduction passthrough. */
  it196?: Omit<NYIT196Input, "federalAgi" | "nyAgi" | "filingStatus" | "taxYear">;

  /* ----- Credits (lines 40-42) ----- */
  /** Line 41: Resident credit from IT-112-R — provide either this passthrough OR it112r inputs */
  residentCredit?: Decimal | string | number;
  /** IT-112-R inputs — when provided, resident credit is computed from other-state tax data
   *  instead of using the residentCredit passthrough. */
  it112r?: {
    /** Additional tax from IT-201-ATT line 21 included in the IT-112-R line 31 limitation */
    otherTaxesBeforeCredits?: Decimal | string | number;
    /** Jurisdictions where taxes were paid */
    jurisdictions: NYIT112ROtherJurisdiction[];
    /** Other credits applied before the resident credit (IT-201-ATT line 7 minus IT-112-R) */
    otherCreditsBeforeResident?: Decimal | string | number;
  };
  /** Line 42: Other NY State credits from IT-201-ATT line 7 */
  otherNYStateCredits?: Decimal | string | number;
  /** IT-201-ATT Part 1 Sections A-C inputs — when provided, lines 42 and 53 are computed from the attachment totals. */
  it201attNonrefundableCredits?: {
    accumulationDistributionCredit?: Decimal | string | number;
    otherNoncarryoverCredits?: Decimal | string | number;
    otherNoncarryoverCreditEntries?: NYIT201ATTNonrefundableCreditEntry[];
    longTermCareInsuranceCredit?: Decimal | string | number;
    investmentCredit?: Decimal | string | number;
    solarEnergySystemEquipmentCredit?: Decimal | string | number;
    otherCarryoverCredits?: Decimal | string | number;
    otherCarryoverCreditEntries?: NYIT201ATTNonrefundableCreditEntry[];
    nycResidentUbtCredit?: Decimal | string | number;
    nycAccumulationDistributionCredit?: Decimal | string | number;
    partYearNYCChildAndDependentCareCredit?: Decimal | string | number;
  };
  /** IT-249 inputs — when provided, the computed line 23 amount feeds IT-201-ATT line 3. */
  it249?: {
    premiumsPaid?: Decimal | string | number;
    partnershipCreditShare?: Decimal | string | number;
    sCorporationCreditShare?: Decimal | string | number;
    fiduciaryCreditShare?: Decimal | string | number;
    priorYearCarryover?: Decimal | string | number;
    /** Optional IT-201-ATT line 21 amount added to IT-249 line 20. */
    otherTaxesBeforeCredits?: Decimal | string | number;
  };

  /* ----- Other taxes (lines 45-46 and 59) ----- */
  /** Line 45: Net other NY State taxes from IT-201-ATT line 31 */
  otherStateTaxes?: Decimal | string | number;
  /** Line 59: Sales or use tax */
  salesUseTax?: Decimal | string | number;
  /** Optional 2025 IT-201-I chart lookup for sales/use tax when no exact amount is provided */
  salesUseTaxChart?: {
    /** Months maintaining a permanent place of abode in NY for sales/use tax purposes */
    monthsOfPermanentPlaceOfAbode?: number;
  };

  /* ----- MCTMT (Metropolitan Commuter Transportation Mobility Tax) ----- */
  /** MCTMT inputs — when provided, MCTMT is computed on lines 54a-54e and added to line 58.
   *  Applies to self-employed individuals in the MCTD. */
  mctmt?: {
    /** Net SE earnings allocated to Zone 1 (NYC — 5 boroughs) */
    zone1Earnings?: Decimal | string | number;
    /** Net SE earnings allocated to Zone 2 (suburban MCTD counties) */
    zone2Earnings?: Decimal | string | number;
    /** Spouse Zone 1 earnings (MFJ — each spouse evaluated separately) */
    spouseZone1Earnings?: Decimal | string | number;
    /** Spouse Zone 2 earnings (MFJ) */
    spouseZone2Earnings?: Decimal | string | number;
  };

  /* ----- NYC ----- */
  /** Full-year NYC resident path (IT-201 lines 47/47a/48) */
  isNYCResident?: boolean;
  /** Part-year NYC resident path (IT-201 line 50 from Form IT-360.1) */
  isPartYearNYCResident?: boolean;
  /** Optional line 47 charitable-gifts-trust addback for full-year NYC residents who claimed the contribution on IT-196 */
  nycCharitableGiftsTrustContributionAddback?: Decimal | string | number;
  /** Optional adjusted or combined federal AGI override used solely for the NYC household credit table */
  nycHouseholdCreditFederalAgiOverride?: Decimal | string | number;
  /** Optional official household-size override used solely for the NYC household credit table */
  nycHouseholdCreditHouseholdMembers?: number;
  /** IT-201 line 50 amount from Form IT-360.1 for part-year NYC residents */
  partYearNYCTax?: Decimal | string | number;
  /** Form IT-360.1 line 47 city taxable income used for the part-year line 69a school-tax rate reduction */
  partYearNYCTaxableIncome?: Decimal | string | number;
  /** Official resident-period months used in the part-year line 69 school-tax proration table */
  partYearNYCSchoolCreditMonths?: number;
  /** Line 51: Other NYC taxes from IT-201-ATT Part 3 line 34 or the mixed-residency worksheet path */
  otherNYCTaxes?: Decimal | string | number;
  /** Line 53: Other NYC nonrefundable credits */
  otherNYCCredits?: Decimal | string | number;
  /** Taxable IRA distributions included in federal AGI for NYC school credit income test */
  taxableIraDistributionsForSchoolCredit?: Decimal | string | number;
  /** Line 70: NYC earned income credit passthrough */
  nycEarnedIncomeCredit?: Decimal | string | number;
  /** IT-215 inputs — when provided, line 70 is computed from NY AGI and federal EIC. */
  it215?: {
    /** Optional override for IT-215 line 10; defaults to top-level federalEic when omitted */
    federalEic?: Decimal | string | number;
    /** Joint federal / New York MFS allocation branch for IT-215 line 17 and Worksheet C line 4 */
    jointFederalReturnForMfsAllocation?: boolean;
    /** IT-215 line 17 claimed NYS EIC share when the joint-federal / NY-MFS branch applies */
    line17AllocatedNYSEic?: Decimal | string | number;
    /** Worksheet C line 4 claimed NYC EIC share when the joint-federal / NY-MFS NYC branch applies */
    worksheetCLine4AllocatedNYCEic?: Decimal | string | number;
  };
  /** Line 70a: NYC income tax elimination credit passthrough */
  nycIncomeTaxEliminationCredit?: Decimal | string | number;
  /** IT-270 inputs — when provided, line 70a is computed from NYC tax, credits, and income thresholds. */
  it270?: {
    /** Investment income under IRC §32(i) / Pub. 596 Worksheet 1 */
    investmentIncome: Decimal | string | number;
    /** Whether NYC or NYS PTET credit is claimed */
    claimsPassThroughEntityTaxCredit?: boolean;
  };

  /* ----- Yonkers ----- */
  yonkersResidencyStatus?: YonkersResidencyStatus;
  yonkersWages?: Decimal | string | number;
  /** Form IT-360.1 line 73 income percentage used for the part-year Yonkers resident surcharge */
  yonkersResidentIncomePercentage?: Decimal | string | number;

  /* ----- Empire State Child Credit (IT-213) ----- */
  /** Number of qualifying children under age 4 for 2025 IT-213 */
  qualifyingChildrenUnder4?: number;
  /** Number of qualifying children age 4 through 16 for 2025 IT-213 */
  qualifyingChildrenAge4To16?: number;
  /** Legacy fallback: when age-band counts are omitted, treat these children as age 4 through 16 */
  qualifyingChildren?: number;
  /** Legacy compatibility field retained for older callers; unused by 2025 IT-213 */
  federalChildTaxCredit?: Decimal | string | number;

  /* ----- Child and Dependent Care Credit (IT-216) ----- */
  /** IT-216 inputs — when provided, credit is computed from qualified expenses */
  it216?: {
    qualifiedExpenses: Decimal | string | number;
    numberOfQualifyingPersons: number;
    taxpayerEarnedIncome: Decimal | string | number;
    spouseEarnedIncome?: Decimal | string | number;
    /** Qualified expenses for children under age 4 (for NYC credit) */
    qualifiedExpensesForChildrenUnder4?: Decimal | string | number;
  };
  /** Direct IT-216 credit amount (alternative to providing it216 inputs) */
  childDependentCareCredit?: Decimal | string | number;

  /* ----- Earned Income Credit ----- */
  federalEic?: Decimal | string | number;
  isNoncustodialParentEic?: boolean;
  it209?: {
    ageAtYearEnd: number;
    hasQualifyingNoncustodialChild: boolean;
    supportOrderInEffectHalfYear: boolean;
    paidRequiredChildSupport: boolean;
    hasValidSocialSecurityNumber: boolean;
    mfsMeetsConsideredUnmarriedRequirement?: boolean;
    filesFederalForm2555?: boolean;
    investmentIncome: Decimal | string | number;
    wagesSalariesTips: Decimal | string | number;
    earnedIncomeAdjustment?: Decimal | string | number;
    businessIncomeOrLoss?: Decimal | string | number;
    claimedFederalEic?: boolean;
    accumulationDistributionCredit?: Decimal | string | number;
  };

  /* ----- Real Property Tax Credit (IT-214) ----- */
  /** Line 67: Real property tax credit. Provide IT-214 inputs OR a direct amount. */
  realPropertyTaxCredit?: Decimal | string | number;
  /** IT-214 inputs — when provided, credit is computed instead of using the passthrough */
  it214?: {
    /** Whether anyone in household is 65+ */
    hasPersonAge65OrOlder: boolean;
    /** Market value of all owned real property (must be ≤ $85,000) */
    realPropertyMarketValue?: Decimal | string | number;
    /** Whether residence is completely exempt from property taxes */
    residenceExemptFromTaxes?: boolean;
    /** Renter details (omit if not a renter) */
    renter?: NYIT214RenterInput;
    /** Homeowner details (omit if not a homeowner) */
    homeowner?: NYIT214HomeownerInput;
  };
  /** IT-217 inputs — when provided, the computed line 19 amount feeds IT-201-ATT line 11. */
  it217?: Omit<NYIT217Input, "taxYear" | "nyAdjustedGrossIncome">;

  /* ----- Legacy passthroughs retained for compatibility; excluded from 2025 IT-201 totals ----- */
  /** STAR is not claimed on the 2025 IT-201; retained only as an external compatibility input */
  starCredit?: Decimal | string | number;
  /** No direct refundable local aggregate line exists on the 2025 IT-201; retained only for compatibility */
  nycYonkersRefundableCredits?: Decimal | string | number;
  /** Line 71: Other refundable credits from IT-201-ATT line 18 */
  otherRefundableCredits?: Decimal | string | number;
  /** IT-119 inputs — when provided, line 71 and the Yonkers worksheet include Form IT-119 line 3. */
  it119?: {
    receivedUnderpaymentNotice: boolean;
    properties: Array<{
      underpaymentAmount: Decimal | string | number;
    }>;
  };
  /** IT-201-ATT Part 1 Section D inputs — when provided, line 71 is computed from the attachment lines. */
  it201attRefundableCredits?: {
    farmersSchoolTaxCredit?: Decimal | string | number;
    otherRefundableCredits?: Decimal | string | number;
    otherRefundableCreditEntries?: NYIT201ATTRefundableCreditEntry[];
    nysClaimOfRightCredit?: Decimal | string | number;
    nycClaimOfRightCredit?: Decimal | string | number;
    yonkersClaimOfRightCredit?: Decimal | string | number;
    mctmtClaimOfRightCredit?: Decimal | string | number;
  };
  /** IT-227 inputs — when provided, line 60 is computed instead of using the passthrough amount. */
  it227?: {
    contributions: NYIT227ContributionEntry[];
  };
  /** Line 60: Voluntary contributions from Form IT-227 */
  voluntaryContributions?: Decimal | string | number;

  /* ----- Payments (lines 72-75) ----- */
  /** Structured W-2 / IT-2 equivalents used to compute withholding lines 72-74 */
  w2s?: W2[];
  /** Structured IT-1099-R equivalents used to compute withholding lines 72-74 */
  form1099R?: Form1099R[];
  /** Structured 1099-G entries used to compute withholding line 72 */
  form1099G?: Form1099G[];
  /** Structured W-2G entries used to compute withholding line 72 */
  formW2G?: FormW2G[];
  /** Additional direct line 72 amount not represented in structured withholding documents */
  nyStateTaxWithheld?: Decimal | string | number;
  /** Additional direct line 73 amount not represented in structured withholding documents */
  nycTaxWithheld?: Decimal | string | number;
  /** Additional direct line 74 amount not represented in structured withholding documents */
  yonkersTaxWithheld?: Decimal | string | number;
  /** Line 75 component: Estimated tax payments */
  estimatedTaxPayments?: Decimal | string | number;
  /** Line 75: 2024 overpayment applied to 2025 estimated tax */
  priorYearOverpaymentApplied?: Decimal | string | number;
  /** Line 75 component: Extension payment (Form IT-370) */
  extensionPayment?: Decimal | string | number;
  /** Line 79: Amount of line 77 applied to 2026 estimated tax */
  appliedToNextYearEstimatedTax?: Decimal | string | number;
  /** Line 78a: Amount from Form IT-195 line 4 deposited to NYS 529 accounts */
  nys529AccountDeposit?: Decimal | string | number;
  /** Line 81: Estimated tax penalty from Form IT-2105.9 */
  estimatedTaxPenalty?: Decimal | string | number;
  /** Line 82: Other penalties and interest */
  otherPenaltiesAndInterest?: Decimal | string | number;
}

/* ---------- Result ---------- */

export interface NYIT201FullReturnResult {
  /* Sub-module results */
  additionsSubtractions: NYIT201AdditionsSubtractionsResult;
  deduction: NYIT201DeductionResult;
  taxComputation: NYIT201TaxComputationResult;
  credits: NYIT201CreditsResult;
  nycTax: NYIT201NYCTaxResult;
  yonkersTax: NYIT201YonkersTaxResult;
  empireStateChildCredit: NYIT213Result | null;
  collegeTuitionCredit: NYIT272Result | null;
  realPropertyTaxCreditResult: NYIT214Result | null;
  it217Result: NYIT217Result | null;
  childDependentCareCredit: NYIT216Result | null;
  it209Result: NYIT209Result | null;
  nycEarnedIncomeCreditResult: NYIT215Result | null;
  nycIncomeTaxEliminationCreditResult: NYIT270Result | null;
  itemizedDeductionResult: NYIT196Result | null;
  residentCreditResult: NYIT112RResult | null;
  mctmtResult: NYMCTMTResult | null;
  it225Result: NYIT225Result | null;
  it201attNonrefundableCredits: NYIT201ATTNonrefundableCreditsResult | null;
  it249Result: NYIT249Result | null;
  it201attRefundableCredits: NYIT201ATTRefundableCreditsResult | null;
  it119Result: NYIT119Result | null;
  it227Result: NYIT227Result | null;

  /* Assembled lines */
  /** Line 46: Total NY State taxes */
  totalNYStateTaxes: Decimal;
  /** Line 54: Total NYC tax before refundable school-tax credits */
  totalNYCTax: Decimal;
  /** Total Yonkers tax */
  totalYonkersTax: Decimal;
  /** Line 58: Total NYC + Yonkers taxes / surcharges and MCTMT */
  totalLocalTaxes: Decimal;
  /** Line 62: Total taxes carried to the refundable-credit section */
  totalTaxBeforeCreditsAndPayments: Decimal;
  /** Line 60: Voluntary contributions */
  voluntaryContributions: Decimal;

  /* Refundable credits */
  /** Legacy compatibility only; excluded from 2025 IT-201 totals */
  starCredit: Decimal;
  /** Legacy compatibility only; excluded from 2025 IT-201 totals */
  nycYonkersRefundableCredits: Decimal;
  /** Line 63: Empire State child credit */
  empireStateChildCreditAmount: Decimal;
  /** Line 64: Combined NYS + NYC child and dependent care credit */
  childDependentCareCreditAmount: Decimal;
  /** Line 65: NY earned income credit */
  nyEarnedIncomeCredit: Decimal;
  /** Line 66: NY noncustodial parent earned income credit */
  nyNoncustodialParentEarnedIncomeCredit: Decimal;
  /** Line 67: Real property tax credit */
  realPropertyTaxCredit: Decimal;
  /** Line 68: College tuition credit from IT-272 */
  collegeTuitionCreditAmount: Decimal;
  /** Line 69: NYC school tax credit fixed amount */
  nycSchoolTaxCreditFixedAmount: Decimal;
  /** Line 69a: NYC school tax credit rate reduction amount */
  nycSchoolTaxCreditRateReductionAmount: Decimal;
  /** Line 70: NYC earned income credit */
  nycEarnedIncomeCreditAmount: Decimal;
  /** Line 70a: NYC income tax elimination credit */
  nycIncomeTaxEliminationCreditAmount: Decimal;
  /** Line 71: Other refundable credits */
  otherRefundableCredits: Decimal;
  /** Internal subtotal: lines 63-71 */
  totalRefundableCredits: Decimal;

  /* Payments */
  /** Line 72: NY State tax withheld */
  nyStateTaxWithheld: Decimal;
  /** Line 73: NYC tax withheld */
  nycTaxWithheld: Decimal;
  /** Line 74: Yonkers tax withheld */
  yonkersTaxWithheld: Decimal;
  /** Estimated tax payments included in line 75 */
  estimatedTaxPayments: Decimal;
  /** 2024 overpayment applied to 2025 estimated tax, included in line 75 */
  priorYearOverpaymentApplied: Decimal;
  /** Extension payment included in line 75 */
  extensionPayment: Decimal;
  /** Line 75: Total estimated tax payments, prior-year overpayment applied, and extension payment */
  totalEstimatedAndExtensionPayments: Decimal;
  /** Internal subtotal: lines 72-75 */
  totalPayments: Decimal;
  /** Line 76: Total refundable credits and payments */
  totalCreditsAndPayments: Decimal;

  /* Final result */
  /** Positive = net refund position after lines 77-82, negative = net amount owed */
  overpaymentOrBalanceDue: Decimal;
  /** Line 77: Net overpayment after line 81, before line 79 allocation */
  overpayment: Decimal;
  /** Line 78: Amount of line 77 available for refund before any line 78a NYS 529 deposit */
  amountAvailableForRefund: Decimal;
  /** Line 78a: NYS 529 account deposit from Form IT-195 line 4 */
  nys529AccountDeposit: Decimal;
  /** Line 78b: Cash refund remaining after the line 78a NYS 529 deposit */
  cashRefundAfterNys529AccountDeposit: Decimal;
  /** Line 79: Amount of overpayment applied to next year estimated tax */
  appliedToNextYearEstimatedTax: Decimal;
  /** Line 80: Amount owed after line 81 and line 82 additions */
  amountOwed: Decimal;
  /** Line 81: Estimated tax penalty from Form IT-2105.9 */
  estimatedTaxPenalty: Decimal;
  /** Line 82: Other penalties and interest */
  otherPenaltiesAndInterest: Decimal;

  lines: CalculatedLine[];
}

/* ---------- Constants ---------- */

const ZERO = new Decimal(0);

function nonNegativeAmount(
  value: Decimal | string | number | undefined,
  description: string
): Decimal {
  const amount = d(value);
  if (amount.lessThan(ZERO)) {
    throw new Error(`${description} must be non-negative`);
  }

  return amount;
}

function validateLocalResidencyCombination(input: NYIT201FullReturnInput): void {
  const legacyYonkersDayCountInput = input as NYIT201FullReturnInput & {
    daysOfYonkersResidency?: number;
    daysInTaxYear?: number;
  };

  if ((input.isNYCResident ?? false) && (input.isPartYearNYCResident ?? false)) {
    throw new Error("NY IT-201 full return cannot mark both full-year and part-year NYC residency");
  }

  if ((input.isNYCResident ?? false) && (input.yonkersResidencyStatus ?? "none") !== "none") {
    throw new Error(
      "NY IT-201 full return does not support combining full-year NYC resident tax with Yonkers local tax inputs; use IT-360.1 for city residency changes"
    );
  }

  if ((input.isPartYearNYCResident ?? false) && input.partYearNYCTax === undefined) {
    throw new Error("NY IT-201 part-year NYC resident input requires partYearNYCTax from Form IT-360.1");
  }

  if ((input.isPartYearNYCResident ?? false) && input.partYearNYCTaxableIncome === undefined) {
    throw new Error(
      "NY IT-201 part-year NYC resident input requires partYearNYCTaxableIncome from Form IT-360.1 line 47 for line 69a"
    );
  }

  if ((input.isPartYearNYCResident ?? false) && input.partYearNYCSchoolCreditMonths === undefined) {
    throw new Error(
      "NY IT-201 part-year NYC resident input requires partYearNYCSchoolCreditMonths for the line 69 school-credit proration table"
    );
  }

  if (
    input.yonkersResidencyStatus === "part_year" &&
    input.yonkersResidentIncomePercentage !== undefined &&
    d(input.yonkersResidentIncomePercentage).lessThan(ZERO)
  ) {
    throw new Error("NY IT-201 part-year Yonkers input requires a non-negative income percentage");
  }

  if (
    legacyYonkersDayCountInput.daysOfYonkersResidency !== undefined
    || legacyYonkersDayCountInput.daysInTaxYear !== undefined
  ) {
    throw new Error(
      "NY IT-201 resident Yonkers part-year inputs use Form IT-360.1 line 73 income percentage; do not provide legacy day-count proration fields"
    );
  }

  if (input.starCredit !== undefined) {
    throw new Error(
      "NY IT-201 2025 resident returns do not accept legacy standalone STAR credit passthroughs; use IT-119 for STAR reconciliation"
    );
  }

  if (input.nycYonkersRefundableCredits !== undefined) {
    throw new Error(
      "NY IT-201 2025 resident returns do not accept legacy standalone NYC/Yonkers refundable-credit passthroughs; use the supported 2025 line 64 and line 71 inputs instead"
    );
  }
}

function getSchoolTaxIncome(
  federalAgi: Decimal,
  taxableIraDistributionsForSchoolCredit: Decimal
): Decimal {
  return zeroFloor(federalAgi.minus(taxableIraDistributionsForSchoolCredit));
}

type NYCSchoolCreditResidencyStatus = "none" | "full_year" | "part_year";

function getNYCSchoolCreditResidencyStatus(input: NYIT201FullReturnInput): NYCSchoolCreditResidencyStatus {
  if (input.isNYCResident ?? false) return "full_year";
  if (input.isPartYearNYCResident ?? false) return "part_year";
  return "none";
}

function computeNYCSchoolTaxCreditFixedAmount(params: {
  schoolTaxIncome: Decimal;
  filingStatus: FilingStatus;
  residencyStatus: NYCSchoolCreditResidencyStatus;
  canBeClaimedAsDependent: boolean;
  partYearResidentMonths?: number;
}): Decimal {
  if (params.residencyStatus === "none" || params.canBeClaimedAsDependent) return ZERO;
  if (params.schoolTaxIncome.greaterThan(new Decimal(250000))) return ZERO;

  if (params.residencyStatus === "part_year") {
    const residentMonths = Math.max(1, Math.min(12, Math.floor(params.partYearResidentMonths ?? 0)));

    switch (params.filingStatus) {
      case "married_filing_jointly":
      case "qualifying_surviving_spouse":
        return new Decimal([10, 21, 31, 42, 52, 63, 73, 83, 94, 104, 115, 125][residentMonths - 1]);
      case "single":
      case "married_filing_separately":
      case "head_of_household":
        return new Decimal([5, 10, 16, 21, 26, 31, 36, 42, 47, 52, 57, 63][residentMonths - 1]);
    }
  }

  switch (params.filingStatus) {
    case "married_filing_jointly":
    case "qualifying_surviving_spouse":
      return new Decimal(125);
    case "single":
    case "married_filing_separately":
    case "head_of_household":
      return new Decimal(63);
  }
}

function computeNYCSchoolTaxCreditRateReductionAmount(params: {
  schoolTaxIncome: Decimal;
  nycTaxableIncome: Decimal;
  filingStatus: FilingStatus;
  residencyStatus: NYCSchoolCreditResidencyStatus;
  canBeClaimedAsDependent: boolean;
}): Decimal {
  if (params.residencyStatus === "none" || params.canBeClaimedAsDependent) return ZERO;
  if (params.schoolTaxIncome.greaterThan(new Decimal(500000))) return ZERO;

  const taxableIncome = zeroFloor(params.nycTaxableIncome);
  if (taxableIncome.equals(ZERO)) return ZERO;

  switch (params.filingStatus) {
    case "married_filing_jointly":
    case "qualifying_surviving_spouse":
      if (taxableIncome.lessThanOrEqualTo(new Decimal(21600))) {
        return roundDollar(taxableIncome.times(new Decimal("0.00171")));
      }
      return roundDollar(
        new Decimal(37).plus(
          taxableIncome.minus(new Decimal(21600)).times(new Decimal("0.00228"))
        )
      );
    case "single":
    case "married_filing_separately":
      if (taxableIncome.lessThanOrEqualTo(new Decimal(12000))) {
        return roundDollar(taxableIncome.times(new Decimal("0.00171")));
      }
      return roundDollar(
        new Decimal(21).plus(
          taxableIncome.minus(new Decimal(12000)).times(new Decimal("0.00228"))
        )
      );
    case "head_of_household":
      if (taxableIncome.lessThanOrEqualTo(new Decimal(14400))) {
        return roundDollar(taxableIncome.times(new Decimal("0.00171")));
      }
      return roundDollar(
        new Decimal(25).plus(
          taxableIncome.minus(new Decimal(14400)).times(new Decimal("0.00228"))
        )
      );
  }
}

function computeFullYearNYCTaxableIncome(params: {
  nyAgi: Decimal;
  deductionUsed: "standard" | "itemized";
  deductionAmount: Decimal;
  dependentExemption: Decimal;
  defaultTaxableIncome: Decimal;
  isNYCResident: boolean;
  nycCharitableGiftsTrustContributionAddback?: Decimal | string | number;
}): {
  nycTaxableIncome: Decimal;
  charitableGiftsTrustContributionAddback: Decimal;
  usedCharitableGiftsTrustWorksheet: boolean;
} {
  const charitableGiftsTrustContributionAddback = nonNegativeAmount(
    params.nycCharitableGiftsTrustContributionAddback,
    "NY IT-201 line 47 charitable gifts trust addback"
  );

  if (!params.isNYCResident || charitableGiftsTrustContributionAddback.equals(ZERO)) {
    return {
      nycTaxableIncome: params.defaultTaxableIncome,
      charitableGiftsTrustContributionAddback,
      usedCharitableGiftsTrustWorksheet: false,
    };
  }

  if (params.deductionUsed !== "itemized") {
    throw new Error(
      "NY IT-201 line 47 charitable gifts trust addback requires the NY itemized deduction path on line 34"
    );
  }

  return {
    nycTaxableIncome: zeroFloor(
      params.nyAgi
        .plus(charitableGiftsTrustContributionAddback)
        .minus(params.deductionAmount)
        .minus(params.dependentExemption)
    ),
    charitableGiftsTrustContributionAddback,
    usedCharitableGiftsTrustWorksheet: true,
  };
}

/* ---------- Main computation ---------- */

export function calculateNYIT201FullReturn(
  input: NYIT201FullReturnInput
): NYIT201FullReturnResult {
  const audit = new AuditTrail();
  validateLocalResidencyCombination(input);

  /* ========== Step 0: IT-225 New York State Modifications ========== */

  let it225Result: NYIT225Result | null = null;
  let otherAdditionsForLine23 = input.otherAdditions;
  let otherSubtractionsForLine31 = input.otherSubtractions;

  if (input.it225) {
    it225Result = calculateNYIT225({
      ...input.it225,
      filingStatus: input.filingStatus,
      taxYear: input.taxYear,
    });
    otherAdditionsForLine23 = it225Result.totalAdditions;
    otherSubtractionsForLine31 = it225Result.totalSubtractions;
    audit.merge(it225Result.lines);
  }

  /* ========== Step 1: Additions & Subtractions (lines 19-33) ========== */

  const tuitionPreference = input.collegeTuitionPreference ?? "deduction";

  const addSubInput: NYIT201AdditionsSubtractionsInput = {
    federalAgi: input.federalAgi,
    filingStatus: input.filingStatus,
    taxYear: input.taxYear,
    outOfStateMuniBondInterest: input.outOfStateMuniBondInterest,
    publicEmployee414hContributions: input.publicEmployee414hContributions,
    nycFlexibleSpendingContributions: input.nycFlexibleSpendingContributions,
    nonQualified529Distributions: input.nonQualified529Distributions,
    otherAdditions: otherAdditionsForLine23,
    stateLocalTaxRefunds: input.stateLocalTaxRefunds,
    governmentPensionIncome: input.governmentPensionIncome,
    taxableSocialSecurityBenefits: input.taxableSocialSecurityBenefits,
    usGovernmentBondInterest: input.usGovernmentBondInterest,
    pensionExclusion: input.pensionExclusion,
    spousePensionExclusion: input.spousePensionExclusion,
    // Only pass tuition students to deduction if preference is "deduction"
    collegeTuitionStudents: tuitionPreference === "deduction"
      ? input.collegeTuitionStudents
      : undefined,
    otherSubtractions: otherSubtractionsForLine31,
  };
  const additionsSubtractions = calculateNYIT201AdditionsSubtractions(addSubInput);
  audit.merge(additionsSubtractions.lines);

  /* ========== Step 2: IT-196 Itemized Deduction (if inputs provided) ========== */

  let it196Result: NYIT196Result | null = null;
  let nyItemizedDeduction = input.nyItemizedDeduction;

  if (input.it196) {
    it196Result = calculateNYIT196({
      ...input.it196,
      federalAgi: input.federalAgi,
      nyAgi: additionsSubtractions.nyAgi,
      filingStatus: input.filingStatus,
      taxYear: input.taxYear,
    });
    nyItemizedDeduction = it196Result.nyItemizedDeduction;
    audit.merge(it196Result.lines);
  }

  /* ========== Step 2b: Deduction & Taxable Income (lines 34-38) ========== */

  const deduction = calculateNYIT201Deduction({
    nyAgi: additionsSubtractions.nyAgi,
    filingStatus: input.filingStatus,
    canBeClaimedAsDependent: input.canBeClaimedAsDependent,
    spouseUsesItemizedDeduction: input.spouseUsesItemizedDeduction,
    numberOfDependents: input.numberOfDependents,
    nyItemizedDeduction,
    taxYear: input.taxYear,
  });
  audit.merge(deduction.lines);

  /* ========== Step 3: Tax Computation (line 39) ========== */

  const taxComputation = calculateNYIT201Tax({
    nyAgi: additionsSubtractions.nyAgi,
    taxableIncome: deduction.taxableIncome,
    filingStatus: input.filingStatus,
    taxYear: input.taxYear,
  });
  audit.merge(taxComputation.lines);

  /* ========== Step 3b: College Tuition Credit (IT-272) ========== */

  let collegeTuitionCreditResult: NYIT272Result | null = null;
  let collegeTuitionCreditAmount = ZERO;
  if (
    tuitionPreference === "credit" &&
    input.collegeTuitionStudents &&
    input.collegeTuitionStudents.length > 0
  ) {
    collegeTuitionCreditResult = calculateNYIT272({
      students: input.collegeTuitionStudents,
      nyStateTax: taxComputation.tax,
      taxYear: input.taxYear,
    });
    collegeTuitionCreditAmount = collegeTuitionCreditResult.credit;
    audit.merge(collegeTuitionCreditResult.lines);
  }

  /* ========== Step 4: Empire State Child Credit (IT-213) ========== */

  const qualifyingChildrenUnder4 = input.qualifyingChildrenUnder4 ?? 0;
  const qualifyingChildrenAge4To16 = input.qualifyingChildrenAge4To16 ?? input.qualifyingChildren ?? 0;
  const totalQualifyingChildren = qualifyingChildrenUnder4 + qualifyingChildrenAge4To16;
  let esccResult: NYIT213Result | null = null;
  let esccAmount = ZERO;
  if (totalQualifyingChildren > 0) {
    esccResult = calculateNYIT213({
      qualifyingChildrenUnder4,
      qualifyingChildrenAge4To16,
      federalAgi: input.federalAgi,
      filingStatus: input.filingStatus,
      taxYear: input.taxYear,
    });
    esccAmount = esccResult.empireStateChildCredit;
    audit.merge(esccResult.lines);
  }

  /* ========== Step 4b: IT-112-R Resident Credit (if computed) ========== */

  let it112rResult: NYIT112RResult | null = null;
  let residentCreditAmount: Decimal;

  if (input.it112r && input.it112r.jurisdictions.length > 0) {
    // Compute household credit first — IT-112-R needs it for the limitation calc
    const householdCredit = computeHouseholdCredit({
      federalAgi: d(input.federalAgi),
      filingStatus: input.filingStatus,
      numberOfDependents: input.numberOfDependents ?? 0,
      nyStateTax: taxComputation.tax,
      taxYear: input.taxYear,
    });

    it112rResult = calculateNYIT112R({
      totalNYIncome: additionsSubtractions.nyAgi,
      nyStateTax: taxComputation.tax,
      otherTaxesBeforeCredits: input.it112r.otherTaxesBeforeCredits,
      nyHouseholdCredit: householdCredit,
      otherCreditsBeforeResident: input.it112r.otherCreditsBeforeResident,
      jurisdictions: input.it112r.jurisdictions,
    });
    residentCreditAmount = it112rResult.finalCredit;
    audit.merge(it112rResult.lines);
  } else {
    residentCreditAmount = d(input.residentCredit);
  }

  /* ========== Step 4c: Nonrefundable credits / IT-249 normalization ========== */

  const preliminaryATTNonrefundableCredits = input.it201attNonrefundableCredits
    ? calculateNYIT201ATTNonrefundableCredits({
        taxYear: input.taxYear,
        ...input.it201attNonrefundableCredits,
      })
    : null;

  let it249Result: NYIT249Result | null = null;
  if (input.it249) {
    const householdCreditForIT249 = computeHouseholdCredit({
      federalAgi: d(input.federalAgi),
      filingStatus: input.filingStatus,
      numberOfDependents: input.numberOfDependents ?? 0,
      nyStateTax: taxComputation.tax,
      taxYear: input.taxYear,
    });

    const creditsAppliedBeforeIT249 = sum(
      householdCreditForIT249,
      preliminaryATTNonrefundableCredits?.accumulationDistributionCredit
        ?? d(input.it201attNonrefundableCredits?.accumulationDistributionCredit),
      preliminaryATTNonrefundableCredits?.otherNoncarryoverCredits
        ?? d(input.it201attNonrefundableCredits?.otherNoncarryoverCredits),
      preliminaryATTNonrefundableCredits?.investmentCredit
        ?? d(input.it201attNonrefundableCredits?.investmentCredit),
      preliminaryATTNonrefundableCredits?.solarEnergySystemEquipmentCredit
        ?? d(input.it201attNonrefundableCredits?.solarEnergySystemEquipmentCredit),
    );

    it249Result = calculateNYIT249({
      taxYear: input.taxYear,
      nyAgi: additionsSubtractions.nyAgi,
      premiumsPaid: input.it249.premiumsPaid,
      partnershipCreditShare: input.it249.partnershipCreditShare,
      sCorporationCreditShare: input.it249.sCorporationCreditShare,
      fiduciaryCreditShare: input.it249.fiduciaryCreditShare,
      priorYearCarryover: input.it249.priorYearCarryover,
      taxBeforeCredits: taxComputation.tax.plus(d(input.it249.otherTaxesBeforeCredits)),
      creditsAppliedBeforeThisCredit: creditsAppliedBeforeIT249,
    });
    audit.merge(it249Result.lines);
  }

  let it201attNonrefundableCreditsResult: NYIT201ATTNonrefundableCreditsResult | null = null;
  let otherNYStateCreditsForLine42 = input.otherNYStateCredits;
  let otherNYCCreditsForLine53 = input.otherNYCCredits;

  if (input.it201attNonrefundableCredits) {
    it201attNonrefundableCreditsResult = calculateNYIT201ATTNonrefundableCredits({
      taxYear: input.taxYear,
      ...input.it201attNonrefundableCredits,
      longTermCareInsuranceCredit:
        it249Result?.creditUsedThisYear
        ?? input.it201attNonrefundableCredits.longTermCareInsuranceCredit,
    });
    otherNYStateCreditsForLine42 =
      it201attNonrefundableCreditsResult.totalNYStateNonrefundableCredits;
    otherNYCCreditsForLine53 =
      it201attNonrefundableCreditsResult.totalNYCNonrefundableCredits;
    audit.merge(it201attNonrefundableCreditsResult.lines);
  } else if (it249Result) {
    otherNYStateCreditsForLine42 = d(input.otherNYStateCredits).plus(it249Result.creditUsedThisYear);
  }

  /* ========== Step 4d: MCTMT (if inputs provided) ========== */

  let mctmtResult: NYMCTMTResult | null = null;
  let mctmtAmount = ZERO;

  if (input.mctmt) {
    mctmtResult = calculateNYMCTMT({
      taxYear: input.taxYear,
      zone1Earnings: input.mctmt.zone1Earnings,
      zone2Earnings: input.mctmt.zone2Earnings,
      spouseZone1Earnings: input.mctmt.spouseZone1Earnings,
      spouseZone2Earnings: input.mctmt.spouseZone2Earnings,
    });
    mctmtAmount = mctmtResult.totalMCTMT;
    audit.merge(mctmtResult.lines);
  }

  /* ========== Step 5: Credits (lines 40-46, 59, 63, 65) ========== */

  const credits = calculateNYIT201Credits({
    nyAgi: additionsSubtractions.nyAgi,
    federalAgi: input.federalAgi,
    nyStateTax: taxComputation.tax,
    filingStatus: input.filingStatus,
    numberOfDependents: input.numberOfDependents,
    taxYear: input.taxYear,
    residentCredit: residentCreditAmount,
    otherNYStateCredits: otherNYStateCreditsForLine42,
    accumulationDistributionCredit:
      it201attNonrefundableCreditsResult?.accumulationDistributionCredit
      ?? input.it201attNonrefundableCredits?.accumulationDistributionCredit,
    otherStateTaxes: input.otherStateTaxes,
    salesUseTax: input.salesUseTax,
    salesUseTaxChart: input.salesUseTaxChart
      ? {
          federalAgi: input.federalAgi,
          monthsOfPermanentPlaceOfAbode: input.salesUseTaxChart.monthsOfPermanentPlaceOfAbode,
        }
      : undefined,
    empireStateChildCredit: esccAmount,
    federalEic: input.federalEic,
    isNoncustodialParentEic: input.it209 ? false : input.isNoncustodialParentEic,
    jointFederalReturnForMfsAllocation: input.it215?.jointFederalReturnForMfsAllocation,
    line17AllocatedNYSEic: input.it215?.line17AllocatedNYSEic,
  });
  audit.merge(credits.lines);

  const fullYearNYCTaxableIncome = computeFullYearNYCTaxableIncome({
    nyAgi: additionsSubtractions.nyAgi,
    deductionUsed: deduction.deductionUsed,
    deductionAmount: deduction.deductionAmount,
    dependentExemption: deduction.dependentExemption,
    defaultTaxableIncome: deduction.taxableIncome,
    isNYCResident: input.isNYCResident ?? false,
    nycCharitableGiftsTrustContributionAddback: input.nycCharitableGiftsTrustContributionAddback,
  });
  if (fullYearNYCTaxableIncome.usedCharitableGiftsTrustWorksheet) {
    audit.record("NY-IT201", "47-WS", "NYC taxable income charitable-gifts-trust worksheet",
      fullYearNYCTaxableIncome.nycTaxableIncome,
      "max(0, (Line 33 + charitable gifts trust contribution addback) - Line 34 - Line 36)", {
        "Line 33": additionsSubtractions.nyAgi.toString(),
        "Charitable gifts trust contribution addback":
          fullYearNYCTaxableIncome.charitableGiftsTrustContributionAddback.toString(),
        "Line 34": deduction.deductionAmount.toString(),
        "Line 36": deduction.dependentExemption.toString(),
      });
  }

  /* ========== Step 6: NYC Tax (lines 48-53) ========== */

  const nycTax = calculateNYIT201NYCTax({
    nycTaxableIncome: fullYearNYCTaxableIncome.nycTaxableIncome,
    federalAgi: input.federalAgi,
    filingStatus: input.filingStatus,
    numberOfDependents: input.numberOfDependents,
    isNYCResident: input.isNYCResident ?? false,
    isPartYearNYCResident: input.isPartYearNYCResident ?? false,
    canBeClaimedAsDependent: input.canBeClaimedAsDependent,
    nycHouseholdCreditFederalAgiOverride: input.nycHouseholdCreditFederalAgiOverride,
    nycHouseholdCreditHouseholdMembers: input.nycHouseholdCreditHouseholdMembers,
    taxYear: input.taxYear,
    partYearNYCTax: input.partYearNYCTax,
    otherNYCTaxes: input.otherNYCTaxes,
    otherNYCCredits: otherNYCCreditsForLine53,
  });
  audit.merge(nycTax.lines);
  const totalNYCTax = nycTax.totalNYCTax;

  /* ========== Step 9: Real Property Tax Credit (IT-214) ========== */

  let it214Result: NYIT214Result | null = null;
  let realPropertyTaxCredit: Decimal;

  if (input.it214) {
    it214Result = calculateNYIT214({
      federalAgi: input.federalAgi,
      hasPersonAge65OrOlder: input.it214.hasPersonAge65OrOlder,
      realPropertyMarketValue: input.it214.realPropertyMarketValue,
      canBeClaimedAsDependent: input.canBeClaimedAsDependent,
      meetsResidencyRequirement: true, // full-year resident return
      residenceExemptFromTaxes: input.it214.residenceExemptFromTaxes,
      taxYear: input.taxYear,
      renter: input.it214.renter,
      homeowner: input.it214.homeowner,
    });
    realPropertyTaxCredit = it214Result.credit;
    audit.merge(it214Result.lines);
  } else {
    realPropertyTaxCredit = d(input.realPropertyTaxCredit);
  }

  let it217Result: NYIT217Result | null = null;
  if (input.it217) {
    it217Result = calculateNYIT217({
      taxYear: input.taxYear,
      nyAdjustedGrossIncome: additionsSubtractions.nyAgi,
      ...input.it217,
    });
    audit.merge(it217Result.lines);
  }

  /* ========== Step 9b: Child and Dependent Care Credit (IT-216) ========== */

  let it216Result: NYIT216Result | null = null;
  let nysChildDependentCareCreditAmount = ZERO;
  let nycChildCareCreditAmount = ZERO;
  let it209Result: NYIT209Result | null = null;

  if (input.it216) {
    it216Result = calculateNYIT216({
      qualifiedExpenses: input.it216.qualifiedExpenses,
      numberOfQualifyingPersons: input.it216.numberOfQualifyingPersons,
      taxpayerEarnedIncome: input.it216.taxpayerEarnedIncome,
      spouseEarnedIncome: input.it216.spouseEarnedIncome,
      federalAgi: input.federalAgi,
      nyAgi: additionsSubtractions.nyAgi,
      filingStatus: input.filingStatus,
      taxYear: input.taxYear,
      isNYCResident: input.isNYCResident,
      qualifiedExpensesForChildrenUnder4: input.it216.qualifiedExpensesForChildrenUnder4,
    });
    nysChildDependentCareCreditAmount = it216Result.nysCredit;
    nycChildCareCreditAmount = it216Result.nycCredit;
    audit.merge(it216Result.lines);
  } else {
    nysChildDependentCareCreditAmount = d(input.childDependentCareCredit);
  }

  /* ========== Step 10: Refundable credits (lines 63-71) ========== */

  const starCredit = d(input.starCredit);
  const nycYonkersRefundableCredits = d(input.nycYonkersRefundableCredits);

  const empireStateChildCreditAmount = credits.empireStateChildCredit;
  audit.record("NY-IT201", "63", "Empire State child credit",
    empireStateChildCreditAmount, "From Form IT-213");

  const childDependentCareCreditAmount = nysChildDependentCareCreditAmount.plus(nycChildCareCreditAmount);
  audit.record("NY-IT201", "64", "NYS/NYC child and dependent care credit",
    childDependentCareCreditAmount, "Combined NYS and NYC credits from Form IT-216", {
      "NYS child care credit": nysChildDependentCareCreditAmount.toString(),
      "NYC child care credit": nycChildCareCreditAmount.toString(),
    });

  if (input.it209) {
    it209Result = calculateNYIT209({
      filingStatus: input.filingStatus,
      taxYear: input.taxYear,
      federalAgi: input.federalAgi,
      wagesSalariesTips: input.it209.wagesSalariesTips,
      earnedIncomeAdjustment: input.it209.earnedIncomeAdjustment,
      businessIncomeOrLoss: input.it209.businessIncomeOrLoss,
      fullYearResident: true,
      ageAtYearEnd: input.it209.ageAtYearEnd,
      hasQualifyingNoncustodialChild: input.it209.hasQualifyingNoncustodialChild,
      supportOrderInEffectHalfYear: input.it209.supportOrderInEffectHalfYear,
      paidRequiredChildSupport: input.it209.paidRequiredChildSupport,
      hasValidSocialSecurityNumber: input.it209.hasValidSocialSecurityNumber,
      mfsMeetsConsideredUnmarriedRequirement: input.it209.mfsMeetsConsideredUnmarriedRequirement,
      filesFederalForm2555: input.it209.filesFederalForm2555,
      investmentIncome: input.it209.investmentIncome,
      claimedFederalEic: input.it209.claimedFederalEic,
      federalEicClaimedAmount: input.federalEic,
      nyStateTax: taxComputation.tax,
      householdCredit: credits.householdCredit,
      residentCredit: residentCreditAmount,
      accumulationDistributionCredit:
        input.it209.accumulationDistributionCredit
        ?? input.it201attNonrefundableCredits?.accumulationDistributionCredit,
    });
    audit.merge(it209Result.lines);
  }

  const schoolTaxIncome = getSchoolTaxIncome(
    d(input.federalAgi),
    d(input.taxableIraDistributionsForSchoolCredit)
  );
  const schoolCreditResidencyStatus = getNYCSchoolCreditResidencyStatus(input);
  const nycSchoolTaxCreditFixedAmount = computeNYCSchoolTaxCreditFixedAmount({
    schoolTaxIncome,
    filingStatus: input.filingStatus,
    residencyStatus: schoolCreditResidencyStatus,
    canBeClaimedAsDependent: input.canBeClaimedAsDependent ?? false,
    partYearResidentMonths: input.partYearNYCSchoolCreditMonths,
  });
  audit.record("NY-IT201", "69", "NYC school tax credit (fixed amount)",
    nycSchoolTaxCreditFixedAmount, "2025 NYC school tax fixed credit table", {
      "School credit income": schoolTaxIncome.toString(),
      "Filing status": input.filingStatus,
      "NYC residency status": schoolCreditResidencyStatus,
      "Part-year NYC resident months": input.partYearNYCSchoolCreditMonths?.toString() ?? "n/a",
    });

  const nycSchoolTaxCreditRateReductionAmount = computeNYCSchoolTaxCreditRateReductionAmount({
    schoolTaxIncome,
    nycTaxableIncome:
      schoolCreditResidencyStatus === "part_year"
        ? d(input.partYearNYCTaxableIncome)
        : fullYearNYCTaxableIncome.nycTaxableIncome,
    filingStatus: input.filingStatus,
    residencyStatus: schoolCreditResidencyStatus,
    canBeClaimedAsDependent: input.canBeClaimedAsDependent ?? false,
  });
  audit.record("NY-IT201", "69a", "NYC school tax credit (rate reduction amount)",
    nycSchoolTaxCreditRateReductionAmount, "2025 NYC school tax rate reduction schedule", {
      "School credit income": schoolTaxIncome.toString(),
      "NYC taxable income":
        (schoolCreditResidencyStatus === "part_year"
          ? d(input.partYearNYCTaxableIncome)
          : fullYearNYCTaxableIncome.nycTaxableIncome).toString(),
      "Filing status": input.filingStatus,
      "NYC residency status": schoolCreditResidencyStatus,
    });

  let it215Result: NYIT215Result | null = null;
  let nycEarnedIncomeCreditAmount: Decimal;
  if (input.it215) {
    it215Result = calculateNYIT215({
      federalEic: input.it215.federalEic ?? input.federalEic ?? ZERO,
      nyAgi: additionsSubtractions.nyAgi,
      filingStatus: input.filingStatus,
      nyStateTax: taxComputation.tax,
      householdCredit: credits.householdCredit,
      residentCredit: residentCreditAmount,
      accumulationDistributionCredit:
        it201attNonrefundableCreditsResult?.accumulationDistributionCredit
        ?? input.it201attNonrefundableCredits?.accumulationDistributionCredit,
      isNYCResident: input.isNYCResident ?? false,
      jointFederalReturnForMfsAllocation: input.it215.jointFederalReturnForMfsAllocation,
      line17AllocatedNYSEic: input.it215.line17AllocatedNYSEic,
      worksheetCLine4AllocatedNYCEic: input.it215.worksheetCLine4AllocatedNYCEic,
      taxYear: input.taxYear,
    });
    nycEarnedIncomeCreditAmount = it215Result.allowableNYCEarnedIncomeCredit;
    audit.merge(it215Result.lines);
  } else {
    nycEarnedIncomeCreditAmount = d(input.nycEarnedIncomeCredit);
  }

  const nyEarnedIncomeCredit = input.it209
    ? it209Result!.selectedNysEarnedIncomeCredit
    : input.it215
      ? it215Result!.allowableNYSEarnedIncomeCredit
      : input.isNoncustodialParentEic
        ? ZERO
        : credits.nyEarnedIncomeCredit;
  audit.record("NY-IT201", "65", "NY earned income credit",
    nyEarnedIncomeCredit, "Regular NYS EIC amount");

  const nyNoncustodialParentEarnedIncomeCredit = input.it209
    ? it209Result!.selectedNoncustodialParentEic
    : input.isNoncustodialParentEic
      ? credits.nyEarnedIncomeCredit
      : ZERO;
  audit.record("NY-IT201", "66", "NY noncustodial parent earned income credit",
    nyNoncustodialParentEarnedIncomeCredit,
    "NYS noncustodial parent EIC amount");

  audit.record("NY-IT201", "67", "Real property tax credit (IT-214)",
    realPropertyTaxCredit, input.it214 ? "Computed from Form IT-214" : "From Form IT-214 (passthrough)");

  audit.record("NY-IT201", "68", "College tuition credit (IT-272)",
    collegeTuitionCreditAmount,
    input.collegeTuitionPreference === "credit"
      ? "Refundable credit from Form IT-272"
      : "No IT-272 credit claimed");

  audit.record("NY-IT201", "70", "NYC earned income credit",
    nycEarnedIncomeCreditAmount,
    input.it215
      ? "Computed from Form IT-215 Worksheet C"
      : "Passthrough from Form IT-215 or IT-209");

  let it270Result: NYIT270Result | null = null;
  let nycIncomeTaxEliminationCreditAmount: Decimal;
  if (input.it270) {
    it270Result = calculateNYIT270({
      federalAgi: input.federalAgi,
      filingStatus: input.filingStatus,
      numberOfDependents: input.numberOfDependents ?? 0,
      isNYCResident: input.isNYCResident ?? false,
      nycTax: totalNYCTax,
      nycChildDependentCareCredit: nycChildCareCreditAmount,
      nycEarnedIncomeCredit: nycEarnedIncomeCreditAmount,
      investmentIncome: input.it270.investmentIncome,
      claimsPassThroughEntityTaxCredit: input.it270.claimsPassThroughEntityTaxCredit,
      taxYear: input.taxYear,
    });
    nycIncomeTaxEliminationCreditAmount = it270Result.credit;
    audit.merge(it270Result.lines);
  } else {
    nycIncomeTaxEliminationCreditAmount = d(input.nycIncomeTaxEliminationCredit);
  }
  audit.record("NY-IT201", "70a", "NYC income tax elimination credit",
    nycIncomeTaxEliminationCreditAmount,
    input.it270
      ? "Computed from Form IT-270"
      : "Passthrough from Form IT-270");

  let it201attRefundableCreditsResult: NYIT201ATTRefundableCreditsResult | null = null;
  let it119Result: NYIT119Result | null = null;
  let starCreditAdvancePaymentReconciliation = ZERO;

  if (
    input.it119
    && input.it201attRefundableCredits?.otherRefundableCreditEntries?.some(
      (entry) => entry.code.trim() === "119"
    )
  ) {
    throw new Error(
      "Do not include IT-201-ATT line 12 code 119 manually when structured IT-119 input is provided"
    );
  }

  if (input.it119) {
    it119Result = calculateNYIT119({
      taxYear: input.taxYear,
      receivedUnderpaymentNotice: input.it119.receivedUnderpaymentNotice,
      properties: input.it119.properties,
    });
    starCreditAdvancePaymentReconciliation = it119Result.totalReconciliationCredit;
    audit.merge(it119Result.lines);
  }

  let otherRefundableCredits: Decimal;
  if (input.it201attRefundableCredits || input.it217) {
    it201attRefundableCreditsResult = calculateNYIT201ATTRefundableCredits({
      taxYear: input.taxYear,
      ...input.it201attRefundableCredits,
      farmersSchoolTaxCredit:
        it217Result?.line19FarmersSchoolTaxCredit
        ?? input.it201attRefundableCredits?.farmersSchoolTaxCredit,
    });
    otherRefundableCredits =
      it201attRefundableCreditsResult.totalOtherRefundableCredits;
    audit.merge(it201attRefundableCreditsResult.lines);
  } else {
    otherRefundableCredits = d(input.otherRefundableCredits);
  }
  otherRefundableCredits = otherRefundableCredits.plus(starCreditAdvancePaymentReconciliation);
  audit.record("NY-IT201", "71", "Other refundable credits",
    otherRefundableCredits,
    input.it201attRefundableCredits || input.it217 || input.it119
      ? "Computed from Form IT-201-ATT Part 1 Section D line 18 plus any Form IT-119 line 3 STAR reconciliation"
      : "From Form IT-201-ATT line 18", {
        "IT-201-ATT line 18 refundable credits": (
          input.it201attRefundableCredits || input.it217
            ? it201attRefundableCreditsResult?.totalOtherRefundableCredits
            : d(input.otherRefundableCredits)
        )?.toString() ?? ZERO.toString(),
        "IT-217 line 19 farmers' school tax credit":
          it217Result?.line19FarmersSchoolTaxCredit.toString() ?? ZERO.toString(),
        "IT-119 line 3 STAR reconciliation": starCreditAdvancePaymentReconciliation.toString(),
      });

  /* ========== Step 11: Yonkers, MCTMT, and page-3 tax totals (lines 55-62) ========== */

  const totalNYStateTaxes = credits.totalNYStateTaxes;

  const yonkersTax = calculateNYIT201YonkersTax({
    totalNewYorkStateTaxes: totalNYStateTaxes,
    yonkersResidencyStatus: input.yonkersResidencyStatus ?? "none",
    yonkersWages: input.yonkersWages,
    yonkersResidentIncomePercentage: input.yonkersResidentIncomePercentage,
    empireStateChildCredit: empireStateChildCreditAmount,
    realPropertyTaxCredit,
    nysChildDependentCareCredit: nysChildDependentCareCreditAmount,
    nyEarnedIncomeCredit,
    nyNoncustodialParentEarnedIncomeCredit,
    collegeTuitionCreditAmount,
    nycSchoolTaxCreditFixedAmount,
    nycSchoolTaxCreditRateReductionAmount,
    it201attLine13RefundableCredits: it201attRefundableCreditsResult?.frontPageSubtotal,
    starReconciliationAmount: starCreditAdvancePaymentReconciliation,
    taxYear: input.taxYear,
  });
  audit.merge(yonkersTax.lines);

  const totalYonkersTax = yonkersTax.totalYonkersTax;
  const totalLocalTaxes = totalNYCTax.plus(mctmtAmount).plus(totalYonkersTax);
  audit.record(
    "NY-IT201",
    "58",
    "Total New York City and Yonkers taxes / surcharges and MCTMT",
    totalLocalTaxes,
    "Line 54 + Line 54e + Line 55 + Line 56 + Line 57",
    {
      "Total NYC tax (line 54)": totalNYCTax.toString(),
      "Total MCTMT (line 54e)": mctmtAmount.toString(),
      "Total Yonkers tax (lines 55-57)": totalYonkersTax.toString(),
    }
  );

  let it227Result: NYIT227Result | null = null;
  let voluntaryContributions: Decimal;
  if (input.it227 && input.it227.contributions.length > 0) {
    it227Result = calculateNYIT227({
      taxYear: input.taxYear,
      filingStatus: input.filingStatus,
      contributions: input.it227.contributions,
    });
    voluntaryContributions = it227Result.totalVoluntaryContributions;
    audit.merge(it227Result.lines);
  } else {
    voluntaryContributions = d(input.voluntaryContributions);
  }
  audit.record("NY-IT201", "60", "Voluntary contributions", voluntaryContributions,
    input.it227
      ? "Computed from Form IT-227 Part 2 line 1"
      : "From Form IT-227 Part 2 line 1");

  const totalTaxBeforeCreditsAndPayments = totalNYStateTaxes
    .plus(totalLocalTaxes)
    .plus(credits.salesUseTax)
    .plus(voluntaryContributions);
  audit.record(
    "NY-IT201",
    "61",
    "Total taxes before refundable credits and payments",
    totalTaxBeforeCreditsAndPayments,
    "Line 46 + Line 58 + Line 59 + Line 60",
    {
      "Total NY State taxes (line 46)": totalNYStateTaxes.toString(),
      "Total NYC + Yonkers taxes and MCTMT (line 58)": totalLocalTaxes.toString(),
      "Sales or use tax (line 59)": credits.salesUseTax.toString(),
      "Voluntary contributions (line 60)": voluntaryContributions.toString(),
    }
  );
  audit.record("NY-IT201", "62", "Carryforward total taxes", totalTaxBeforeCreditsAndPayments,
    "Enter amount from line 61");

  const totalRefundableCredits = sum(
    empireStateChildCreditAmount,
    childDependentCareCreditAmount,
    nyEarnedIncomeCredit,
    nyNoncustodialParentEarnedIncomeCredit,
    realPropertyTaxCredit,
    collegeTuitionCreditAmount,
    nycSchoolTaxCreditFixedAmount,
    nycSchoolTaxCreditRateReductionAmount,
    nycEarnedIncomeCreditAmount,
    nycIncomeTaxEliminationCreditAmount,
    otherRefundableCredits
  );
  audit.record("NY-IT201", "76-RC", "Refundable credit subtotal", totalRefundableCredits,
    "Lines 63 through 71", {
      "Empire State child credit (line 63)": empireStateChildCreditAmount.toString(),
      "Child and dependent care credit (line 64)": childDependentCareCreditAmount.toString(),
      "NY EIC (line 65)": nyEarnedIncomeCredit.toString(),
      "NY noncustodial parent EIC (line 66)": nyNoncustodialParentEarnedIncomeCredit.toString(),
      "Real property tax credit (line 67)": realPropertyTaxCredit.toString(),
      "College tuition credit (line 68)": collegeTuitionCreditAmount.toString(),
      "NYC school fixed credit (line 69)": nycSchoolTaxCreditFixedAmount.toString(),
      "NYC school rate reduction (line 69a)": nycSchoolTaxCreditRateReductionAmount.toString(),
      "NYC earned income credit (line 70)": nycEarnedIncomeCreditAmount.toString(),
      "NYC elimination credit (line 70a)": nycIncomeTaxEliminationCreditAmount.toString(),
      "Other refundable credits (line 71)": otherRefundableCredits.toString(),
    });

  /* ========== Step 11: Payments (lines 72-75) ========== */

  const withholding = calculateNYIT201Withholding({
    taxYear: input.taxYear,
    w2s: input.w2s,
    form1099R: input.form1099R,
    form1099G: input.form1099G,
    formW2G: input.formW2G,
    additionalNYStateTaxWithheld: input.nyStateTaxWithheld,
    additionalNYCTaxWithheld: input.nycTaxWithheld,
    additionalYonkersTaxWithheld: input.yonkersTaxWithheld,
  });
  audit.merge(withholding.lines);

  const nyStateTaxWithheld = withholding.nyStateTaxWithheld;
  const nycTaxWithheld = withholding.nycTaxWithheld;
  const yonkersTaxWithheld = withholding.yonkersTaxWithheld;

  const estimatedTaxPayments = d(input.estimatedTaxPayments);
  const priorYearOverpaymentApplied = d(input.priorYearOverpaymentApplied);
  const extensionPayment = d(input.extensionPayment);
  const totalEstimatedAndExtensionPayments = sum(
    estimatedTaxPayments,
    priorYearOverpaymentApplied,
    extensionPayment
  );
  audit.record("NY-IT201", "75", "Estimated tax payments, prior-year overpayment applied, and extension payment",
    totalEstimatedAndExtensionPayments, "Estimated payments + prior-year overpayment applied + payment with Form IT-370", {
      "Estimated tax payments": estimatedTaxPayments.toString(),
      "2024 overpayment applied to 2025 estimated tax": priorYearOverpaymentApplied.toString(),
      "Extension payment": extensionPayment.toString(),
    });

  const totalPayments = sum(
    nyStateTaxWithheld,
    nycTaxWithheld,
    yonkersTaxWithheld,
    totalEstimatedAndExtensionPayments
  );
  audit.record("NY-IT201", "76-P", "Payment subtotal", totalPayments,
    "Lines 72 + 73 + 74 + 75", {
      "NY State withheld (line 72)": nyStateTaxWithheld.toString(),
      "NYC withheld (line 73)": nycTaxWithheld.toString(),
      "Yonkers withheld (line 74)": yonkersTaxWithheld.toString(),
      "Estimated tax + prior-year overpayment applied + extension payment (line 75)": totalEstimatedAndExtensionPayments.toString(),
    });

  const totalCreditsAndPayments = totalRefundableCredits.plus(totalPayments);
  audit.record("NY-IT201", "76", "Total payments and refundable credits", totalCreditsAndPayments,
    "Add lines 63 through 75", {
      "Refundable credit subtotal": totalRefundableCredits.toString(),
      "Payment subtotal": totalPayments.toString(),
    });

  /* ========== Step 12: Refund or Balance Due (lines 77-82) ========== */

  const netBeforePenaltyLines = totalCreditsAndPayments.minus(totalTaxBeforeCreditsAndPayments);
  const overpaymentBeforeEstimatedTaxPenalty = netBeforePenaltyLines.greaterThan(ZERO)
    ? netBeforePenaltyLines
    : ZERO;
  const taxDueBeforePenaltyLines = netBeforePenaltyLines.lessThan(ZERO)
    ? netBeforePenaltyLines.abs()
    : ZERO;

  const estimatedTaxPenalty = nonNegativeAmount(
    input.estimatedTaxPenalty,
    "NY IT-201 line 81 estimated tax penalty"
  );
  const otherPenaltiesAndInterest = nonNegativeAmount(
    input.otherPenaltiesAndInterest,
    "NY IT-201 line 82 other penalties and interest"
  );

  const overpayment = zeroFloor(
    overpaymentBeforeEstimatedTaxPenalty.minus(estimatedTaxPenalty)
  );
  const requestedAppliedToNextYearEstimatedTax = nonNegativeAmount(
    input.appliedToNextYearEstimatedTax,
    "NY IT-201 line 79 applied estimated tax"
  );
  if (requestedAppliedToNextYearEstimatedTax.greaterThan(overpayment)) {
    throw new Error("NY IT-201 line 79 applied estimated tax cannot exceed line 77 overpayment");
  }

  const appliedToNextYearEstimatedTax = requestedAppliedToNextYearEstimatedTax;
  const amountAvailableForRefund = overpayment.minus(appliedToNextYearEstimatedTax);
  const requestedNys529AccountDeposit = nonNegativeAmount(
    input.nys529AccountDeposit,
    "NY IT-201 line 78a NYS 529 account deposit"
  );
  if (requestedNys529AccountDeposit.greaterThan(amountAvailableForRefund)) {
    throw new Error("NY IT-201 line 78a NYS 529 account deposit cannot exceed line 78 amount available for refund");
  }
  const nys529AccountDeposit = requestedNys529AccountDeposit;
  const cashRefundAfterNys529AccountDeposit = amountAvailableForRefund.minus(nys529AccountDeposit);
  const estimatedTaxPenaltyStillOwed = zeroFloor(
    estimatedTaxPenalty.minus(overpaymentBeforeEstimatedTaxPenalty)
  );
  const amountOwed = taxDueBeforePenaltyLines
    .plus(estimatedTaxPenaltyStillOwed)
    .plus(otherPenaltiesAndInterest);
  const overpaymentOrBalanceDue = overpayment.minus(amountOwed);

  audit.record("NY-IT201", "77", "Overpayment", overpayment,
    "max(0, (Line 76 - Line 62) - Line 81)", {
      "Total credits and payments (line 76)": totalCreditsAndPayments.toString(),
      "Total taxes (line 62)": totalTaxBeforeCreditsAndPayments.toString(),
      "Overpayment before estimated tax penalty": overpaymentBeforeEstimatedTaxPenalty.toString(),
      "Estimated tax penalty (line 81)": estimatedTaxPenalty.toString(),
    });

  audit.record("NY-IT201", "78", "Amount of line 77 available for refund",
    amountAvailableForRefund,
    "Line 77 - Line 79", {
      "Overpayment (line 77)": overpayment.toString(),
      "Applied to next year estimated tax (line 79)": appliedToNextYearEstimatedTax.toString(),
    });

  audit.record("NY-IT201", "78a", "NYS 529 account deposit",
    nys529AccountDeposit,
    "Requested Form IT-195 line 4 amount, limited to line 78", {
      "Requested NYS 529 deposit": requestedNys529AccountDeposit.toString(),
      "Amount available for refund (line 78)": amountAvailableForRefund.toString(),
    });

  audit.record("NY-IT201", "78b", "Total refund after NYS 529 account deposit",
    cashRefundAfterNys529AccountDeposit,
    "Line 78 - Line 78a", {
      "Amount available for refund (line 78)": amountAvailableForRefund.toString(),
      "NYS 529 account deposit (line 78a)": nys529AccountDeposit.toString(),
    });

  audit.record("NY-IT201", "79", "Applied to next year estimated tax",
    appliedToNextYearEstimatedTax,
    "Requested amount of line 77 applied to 2026 estimated tax", {
      "Requested applied amount": requestedAppliedToNextYearEstimatedTax.toString(),
      "Overpayment (line 77)": overpayment.toString(),
    });

  audit.record("NY-IT201", "81", "Estimated tax penalty", estimatedTaxPenalty,
    "From Form IT-2105.9", {
      "Estimated tax penalty input": estimatedTaxPenalty.toString(),
    });

  audit.record("NY-IT201", "82", "Other penalties and interest", otherPenaltiesAndInterest,
    "Late filing penalty, late payment penalty, and interest", {
      "Other penalties and interest input": otherPenaltiesAndInterest.toString(),
    });

  audit.record("NY-IT201", "80", "Amount owed", amountOwed,
    "max(0, Line 62 - Line 76 + Line 81) + Line 82", {
      "Total taxes (line 62)": totalTaxBeforeCreditsAndPayments.toString(),
      "Total credits and payments (line 76)": totalCreditsAndPayments.toString(),
      "Tax due before penalty lines": taxDueBeforePenaltyLines.toString(),
      "Estimated tax penalty remaining after line 77 offset": estimatedTaxPenaltyStillOwed.toString(),
      "Other penalties and interest (line 82)": otherPenaltiesAndInterest.toString(),
    });

  return {
    additionsSubtractions,
    deduction,
    taxComputation,
    credits,
    nycTax,
    yonkersTax,
    empireStateChildCredit: esccResult,
    collegeTuitionCredit: collegeTuitionCreditResult,
    realPropertyTaxCreditResult: it214Result,
    it217Result,
    childDependentCareCredit: it216Result,
    it209Result,
    nycEarnedIncomeCreditResult: it215Result,
    nycIncomeTaxEliminationCreditResult: it270Result,
    itemizedDeductionResult: it196Result,
    residentCreditResult: it112rResult,
    mctmtResult,
    it225Result,
    it201attNonrefundableCredits: it201attNonrefundableCreditsResult,
    it249Result,
    it201attRefundableCredits: it201attRefundableCreditsResult,
    it119Result,
    it227Result,
    totalNYStateTaxes,
    totalNYCTax,
    totalYonkersTax,
    totalLocalTaxes,
    totalTaxBeforeCreditsAndPayments,
    voluntaryContributions,
    starCredit,
    nycYonkersRefundableCredits,
    empireStateChildCreditAmount,
    childDependentCareCreditAmount,
    nyEarnedIncomeCredit,
    nyNoncustodialParentEarnedIncomeCredit,
    realPropertyTaxCredit,
    collegeTuitionCreditAmount,
    nycSchoolTaxCreditFixedAmount,
    nycSchoolTaxCreditRateReductionAmount,
    nycEarnedIncomeCreditAmount,
    nycIncomeTaxEliminationCreditAmount,
    otherRefundableCredits,
    totalRefundableCredits,
    nyStateTaxWithheld,
    nycTaxWithheld,
    yonkersTaxWithheld,
    estimatedTaxPayments,
    priorYearOverpaymentApplied,
    extensionPayment,
    totalEstimatedAndExtensionPayments,
    totalPayments,
    totalCreditsAndPayments,
    overpaymentOrBalanceDue,
    overpayment,
    amountAvailableForRefund,
    nys529AccountDeposit,
    cashRefundAfterNys529AccountDeposit,
    appliedToNextYearEstimatedTax,
    amountOwed,
    estimatedTaxPenalty,
    otherPenaltiesAndInterest,
    lines: audit.getLines(),
  };
}
