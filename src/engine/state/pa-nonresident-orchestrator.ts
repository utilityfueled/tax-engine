/**
 * Pennsylvania Nonresident and Part-Year Resident Return Orchestrator
 * Spec: spec/state/pa-nonresident-orchestrator.yaml
 *
 * Supported scope:
 * - explicit PA-taxable class amounts for nonresident or part-year returns
 * - optional PA Schedule NRH apportionment for compensation and business income
 * - Schedule SP Tax Forgiveness using all-source eligibility additions
 * - Schedule G-L resident credit for part-year residents only
 * - PA-40 payment and settlement assembly
 */

import Decimal from "decimal.js";
import { d, sum } from "@/utils/decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { calculatePA40, type PA40Input, type PA40Result } from "@/engine/state/pa-40.js";
import {
  calculatePAScheduleNRH,
  type PAScheduleNRHBusinessApportionmentInput,
  type PAScheduleNRHCompensationInput,
  type PAScheduleNRHInput,
  type PAScheduleNRHResult,
} from "@/engine/state/pa-schedule-nrh.js";
import {
  calculateScheduleGL,
  type OtherStateCredit,
  type ScheduleGLResult,
} from "@/engine/state/pa-schedule-g-l.js";
import {
  calculateScheduleSP,
  type PAFilingCategory,
  type ScheduleSPResult,
} from "@/engine/state/pa-schedule-sp.js";
import { calculatePAScheduleRK1 } from "@/engine/state/pa-schedule-rk1.js";
import { calculateScheduleJ } from "@/engine/state/pa-schedule-j.js";
import {
  calculatePAUseTax,
  type PAUseTaxInput,
  type PAUseTaxLocality,
} from "@/engine/state/pa-use-tax.js";

const ZERO = new Decimal(0);
const PA_RECIPROCAL_COMPENSATION_STATES = new Set(["IN", "MD", "NJ", "OH", "VA", "WV"]);
const PA_SCHEDULE_SP_MARRIED_DEPENDENT_FILING_ERROR =
  "PA Schedule SP requires married taxpayers to file separately when either spouse is claimed as a dependent on another person's federal return";

export type PANonresidentResidencyStatus = "nonresident" | "part_year";

export interface PANonresidentOrchestratorOverrides {
  residencyStatus?: PANonresidentResidencyStatus;
  scheduleNRH?: Omit<PAScheduleNRHInput, "taxYear">;
  paTaxableCompensation?: Decimal;
  unreimbursedExpenses?: Decimal;
  paTaxableInterest?: Decimal;
  paTaxableDividends?: Decimal;
  paTaxableNetBusinessIncome?: Decimal;
  paTaxableNetGainOrLoss?: Decimal;
  paTaxableNetRentalIncome?: Decimal;
  paTaxableEstateTrustIncome?: Decimal;
  paTaxableGamblingIncome?: Decimal;
  otherDeductions?: Decimal;
  creditFromPriorYear?: Decimal;
  extensionPayment?: Decimal;
  estimatedPayments?: Decimal;
  nonresidentTaxWithheld?: Decimal;
  refundableCredits?: Decimal;
  otherCredits?: Decimal;
  otherStateCredits?: OtherStateCredit[];
  nontaxableIncome?: Decimal;
  additionalEligibilityIncome?: Decimal;
  spouseEligibilityIncome?: Decimal;
  isClaimedAsDependentOnAnotherFederalReturn?: boolean;
  spouseIsClaimedAsDependentOnAnotherFederalReturn?: boolean;
  claimingHouseholdQualifiesForTaxForgiveness?: boolean;
  scheduleSPSeparatedStatusApplies?: boolean;
  useTaxWorksheet?: Omit<PAUseTaxInput, "taxYear" | "paTaxableIncome">;
  useTax?: Decimal;
  lateFilingOrPaymentPenalty?: Decimal;
  latePaymentInterest?: Decimal;
}

export interface PANonresidentOrchestratorResult {
  residencyStatus: PANonresidentResidencyStatus;
  pa40: PA40Result;
  scheduleSP: ScheduleSPResult;
  scheduleGL: ScheduleGLResult;
  scheduleNRH?: PAScheduleNRHResult;
  taxableIncome: {
    compensation: Decimal;
    unreimbursedExpenses: Decimal;
    interest: Decimal;
    dividends: Decimal;
    netBusinessIncome: Decimal;
    netGainOrLoss: Decimal;
    netRentalIncome: Decimal;
    estateTrustIncome: Decimal;
    gamblingIncome: Decimal;
  };
  stateWithholding: Decimal;
}

function toOptionalDecimal(value: string | undefined): Decimal | undefined {
  return value === undefined ? undefined : d(value);
}

function assignResolvedDecimal(
  currentValue: Decimal | undefined,
  inputValue: string | undefined,
): Decimal | undefined {
  return currentValue ?? toOptionalDecimal(inputValue);
}

function mapOtherStateCredits(
  entries?: Array<{
    stateCode: string;
    incomeTaxableByBothStates: string;
    taxPaidToOtherState: string;
  }>,
): OtherStateCredit[] | undefined {
  return entries?.map((entry) => ({
    stateCode: entry.stateCode,
    incomeTaxableByBothStates: d(entry.incomeTaxableByBothStates),
    taxPaidToOtherState: d(entry.taxPaidToOtherState),
  }));
}

function resolveScheduleNRH(
  scheduleNRH?: {
    compensation?: {
      method: "working_days" | "business_volume";
      employerReportedPAGrossCompensation?: string;
      grossCompensation?: string;
      totalDaysForEmployer?: number;
      nonworkingDays?: number;
      daysWorkedInPennsylvania?: number;
      totalBusinessVolume?: string;
      pennsylvaniaBusinessVolume?: string;
      unreimbursedEmployeeBusinessExpenses?: string;
      employerReimbursementsNotInW2?: string;
    };
    businessApportionment?: {
      propertyEverywhere?: string;
      propertyPennsylvania?: string;
      payrollEverywhere?: string;
      payrollPennsylvania?: string;
      salesEverywhere?: string;
      salesPennsylvania?: string;
      totalNetProfits: string;
    };
  },
): Omit<PAScheduleNRHInput, "taxYear"> | undefined {
  if (!scheduleNRH) {
    return undefined;
  }

  let compensation: PAScheduleNRHCompensationInput | undefined;
  if (scheduleNRH.compensation) {
    compensation = {
      method: scheduleNRH.compensation.method,
      employerReportedPAGrossCompensation: toOptionalDecimal(
        scheduleNRH.compensation.employerReportedPAGrossCompensation,
      ),
      grossCompensation: toOptionalDecimal(scheduleNRH.compensation.grossCompensation),
      totalDaysForEmployer: scheduleNRH.compensation.totalDaysForEmployer,
      nonworkingDays: scheduleNRH.compensation.nonworkingDays,
      daysWorkedInPennsylvania: scheduleNRH.compensation.daysWorkedInPennsylvania,
      totalBusinessVolume: toOptionalDecimal(scheduleNRH.compensation.totalBusinessVolume),
      pennsylvaniaBusinessVolume: toOptionalDecimal(scheduleNRH.compensation.pennsylvaniaBusinessVolume),
      unreimbursedEmployeeBusinessExpenses: toOptionalDecimal(
        scheduleNRH.compensation.unreimbursedEmployeeBusinessExpenses,
      ),
      employerReimbursementsNotInW2: toOptionalDecimal(
        scheduleNRH.compensation.employerReimbursementsNotInW2,
      ),
    };
  }

  let businessApportionment: PAScheduleNRHBusinessApportionmentInput | undefined;
  if (scheduleNRH.businessApportionment) {
    businessApportionment = {
      propertyEverywhere: toOptionalDecimal(scheduleNRH.businessApportionment.propertyEverywhere),
      propertyPennsylvania: toOptionalDecimal(scheduleNRH.businessApportionment.propertyPennsylvania),
      payrollEverywhere: toOptionalDecimal(scheduleNRH.businessApportionment.payrollEverywhere),
      payrollPennsylvania: toOptionalDecimal(scheduleNRH.businessApportionment.payrollPennsylvania),
      salesEverywhere: toOptionalDecimal(scheduleNRH.businessApportionment.salesEverywhere),
      salesPennsylvania: toOptionalDecimal(scheduleNRH.businessApportionment.salesPennsylvania),
      totalNetProfits: d(scheduleNRH.businessApportionment.totalNetProfits),
    };
  }

  if (!compensation && !businessApportionment) {
    return undefined;
  }

  return {
    compensation,
    businessApportionment,
  };
}

function resolvePANonresidentOverrides(
  input: TaxYearInput,
  overrides: PANonresidentOrchestratorOverrides,
): PANonresidentOrchestratorOverrides {
  const nonresidentReturn = input.paNonresidentReturn;
  if (!nonresidentReturn) {
    return overrides;
  }

  const resolved: PANonresidentOrchestratorOverrides = { ...overrides };

  if (resolved.residencyStatus === undefined) {
    resolved.residencyStatus = nonresidentReturn.residencyStatus;
  }
  if (resolved.scheduleNRH === undefined) {
    resolved.scheduleNRH = resolveScheduleNRH(nonresidentReturn.scheduleNRH);
  }
  if (resolved.paTaxableCompensation === undefined) {
    resolved.paTaxableCompensation = assignResolvedDecimal(
      resolved.paTaxableCompensation,
      nonresidentReturn.paTaxableCompensation,
    );
  }
  if (resolved.unreimbursedExpenses === undefined) {
    resolved.unreimbursedExpenses = assignResolvedDecimal(
      resolved.unreimbursedExpenses,
      nonresidentReturn.unreimbursedExpenses,
    );
  }
  if (resolved.paTaxableInterest === undefined) {
    resolved.paTaxableInterest = assignResolvedDecimal(
      resolved.paTaxableInterest,
      nonresidentReturn.paTaxableInterest,
    );
  }
  if (resolved.paTaxableDividends === undefined) {
    resolved.paTaxableDividends = assignResolvedDecimal(
      resolved.paTaxableDividends,
      nonresidentReturn.paTaxableDividends,
    );
  }
  if (resolved.paTaxableNetBusinessIncome === undefined) {
    resolved.paTaxableNetBusinessIncome = assignResolvedDecimal(
      resolved.paTaxableNetBusinessIncome,
      nonresidentReturn.paTaxableNetBusinessIncome,
    );
  }
  if (resolved.paTaxableNetGainOrLoss === undefined) {
    resolved.paTaxableNetGainOrLoss = assignResolvedDecimal(
      resolved.paTaxableNetGainOrLoss,
      nonresidentReturn.paTaxableNetGainOrLoss,
    );
  }
  if (resolved.paTaxableNetRentalIncome === undefined) {
    resolved.paTaxableNetRentalIncome = assignResolvedDecimal(
      resolved.paTaxableNetRentalIncome,
      nonresidentReturn.paTaxableNetRentalIncome,
    );
  }
  if (resolved.paTaxableEstateTrustIncome === undefined) {
    resolved.paTaxableEstateTrustIncome = assignResolvedDecimal(
      resolved.paTaxableEstateTrustIncome,
      nonresidentReturn.paTaxableEstateTrustIncome,
    );
  }
  if (resolved.paTaxableGamblingIncome === undefined) {
    resolved.paTaxableGamblingIncome = assignResolvedDecimal(
      resolved.paTaxableGamblingIncome,
      nonresidentReturn.paTaxableGamblingIncome,
    );
  }
  if (resolved.otherDeductions === undefined) {
    resolved.otherDeductions = assignResolvedDecimal(
      resolved.otherDeductions,
      nonresidentReturn.otherDeductions,
    );
  }
  if (resolved.creditFromPriorYear === undefined) {
    resolved.creditFromPriorYear = assignResolvedDecimal(
      resolved.creditFromPriorYear,
      nonresidentReturn.creditFromPriorYear,
    );
  }
  if (resolved.extensionPayment === undefined) {
    resolved.extensionPayment = assignResolvedDecimal(
      resolved.extensionPayment,
      nonresidentReturn.extensionPayment,
    );
  }
  if (resolved.estimatedPayments === undefined) {
    resolved.estimatedPayments = assignResolvedDecimal(
      resolved.estimatedPayments,
      nonresidentReturn.estimatedPayments,
    );
  }
  if (resolved.nonresidentTaxWithheld === undefined && nonresidentReturn.nonresidentTaxWithheld !== undefined) {
    resolved.nonresidentTaxWithheld = assignResolvedDecimal(
      resolved.nonresidentTaxWithheld,
      nonresidentReturn.nonresidentTaxWithheld,
    );
  }
  if (resolved.refundableCredits === undefined) {
    resolved.refundableCredits = assignResolvedDecimal(
      resolved.refundableCredits,
      nonresidentReturn.refundableCredits,
    );
  }
  if (resolved.otherCredits === undefined) {
    resolved.otherCredits = assignResolvedDecimal(
      resolved.otherCredits,
      nonresidentReturn.otherCredits,
    );
  }
  if (resolved.otherStateCredits === undefined) {
    resolved.otherStateCredits = mapOtherStateCredits(nonresidentReturn.otherStateCredits);
  }
  if (resolved.nontaxableIncome === undefined) {
    resolved.nontaxableIncome = assignResolvedDecimal(
      resolved.nontaxableIncome,
      nonresidentReturn.nontaxableIncome,
    );
  }
  if (resolved.additionalEligibilityIncome === undefined) {
    resolved.additionalEligibilityIncome = assignResolvedDecimal(
      resolved.additionalEligibilityIncome,
      nonresidentReturn.additionalEligibilityIncome,
    );
  }
  if (resolved.spouseEligibilityIncome === undefined) {
    resolved.spouseEligibilityIncome = assignResolvedDecimal(
      resolved.spouseEligibilityIncome,
      nonresidentReturn.spouseEligibilityIncome,
    );
  }
  if (
    resolved.isClaimedAsDependentOnAnotherFederalReturn === undefined
    && nonresidentReturn.isClaimedAsDependentOnAnotherFederalReturn !== undefined
  ) {
    resolved.isClaimedAsDependentOnAnotherFederalReturn =
      nonresidentReturn.isClaimedAsDependentOnAnotherFederalReturn;
  }
  if (
    resolved.spouseIsClaimedAsDependentOnAnotherFederalReturn === undefined
    && nonresidentReturn.spouseIsClaimedAsDependentOnAnotherFederalReturn !== undefined
  ) {
    resolved.spouseIsClaimedAsDependentOnAnotherFederalReturn =
      nonresidentReturn.spouseIsClaimedAsDependentOnAnotherFederalReturn;
  }
  if (
    resolved.claimingHouseholdQualifiesForTaxForgiveness === undefined
    && nonresidentReturn.claimingHouseholdQualifiesForTaxForgiveness !== undefined
  ) {
    resolved.claimingHouseholdQualifiesForTaxForgiveness =
      nonresidentReturn.claimingHouseholdQualifiesForTaxForgiveness;
  }
  if (
    resolved.scheduleSPSeparatedStatusApplies === undefined
    && nonresidentReturn.scheduleSPSeparatedStatusApplies !== undefined
  ) {
    resolved.scheduleSPSeparatedStatusApplies = nonresidentReturn.scheduleSPSeparatedStatusApplies;
  }
  if (resolved.useTaxWorksheet === undefined && nonresidentReturn.useTaxWorksheet) {
    resolved.useTaxWorksheet = {
      locality: nonresidentReturn.useTaxWorksheet.locality as PAUseTaxLocality,
      taxableItemPurchases: d(nonresidentReturn.useTaxWorksheet.taxableItemPurchases),
      taxableServicePurchases: d(nonresidentReturn.useTaxWorksheet.taxableServicePurchases),
      electEstimatedTable: nonresidentReturn.useTaxWorksheet.electEstimatedTable,
      salesTaxAlreadyPaid: d(nonresidentReturn.useTaxWorksheet.salesTaxAlreadyPaid),
      salesTaxAlreadyPaidEntries: nonresidentReturn.useTaxWorksheet.salesTaxAlreadyPaidEntries?.map((entry) => ({
        taxablePurchaseAmount: d(entry.taxablePurchaseAmount),
        salesTaxPaid: d(entry.salesTaxPaid),
      })),
    };
  }
  if (resolved.useTax === undefined) {
    resolved.useTax = assignResolvedDecimal(
      resolved.useTax,
      nonresidentReturn.useTax,
    );
  }
  if (resolved.lateFilingOrPaymentPenalty === undefined) {
    resolved.lateFilingOrPaymentPenalty = assignResolvedDecimal(
      resolved.lateFilingOrPaymentPenalty,
      nonresidentReturn.lateFilingOrPaymentPenalty,
    );
  }
  if (resolved.latePaymentInterest === undefined) {
    resolved.latePaymentInterest = assignResolvedDecimal(
      resolved.latePaymentInterest,
      nonresidentReturn.latePaymentInterest,
    );
  }

  return resolved;
}

function assertValidScheduleSPDependencyFilingStatus(
  taxpayer: TaxYearInput["taxpayer"],
  overrides: PANonresidentOrchestratorOverrides,
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

function mapFilingCategory(
  taxpayer: TaxYearInput["taxpayer"],
  overrides: PANonresidentOrchestratorOverrides,
): PAFilingCategory {
  switch (taxpayer.filingStatus) {
    case "married_filing_jointly":
      return "married";
    case "married_filing_separately":
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

function mapStateWithholding(input: TaxYearInput): Decimal {
  let total = ZERO;

  for (const w2 of input.w2s) {
    const paState = w2.state?.toUpperCase();
    if (paState && paState !== "PA") continue;
    total = total.plus(d(w2.stateTaxWithheld));
  }

  for (const w2g of input.formW2G) {
    const paState = w2g.state?.toUpperCase();
    if (paState && paState !== "PA") continue;
    total = total.plus(d(w2g.stateWithheld));
  }

  for (const g of input.form1099G) {
    const paState = g.state?.toUpperCase();
    if (paState && paState !== "PA") continue;
    total = total.plus(d(g.stateWithheld));
  }

  for (const k of input.form1099K) {
    const paState = k.state?.toUpperCase();
    if (paState && paState !== "PA") continue;
    total = total.plus(d(k.stateWithheld));
  }

  for (const r of input.form1099R ?? []) {
    const paState = r.state?.toUpperCase();
    if (paState && paState !== "PA") continue;
    total = total.plus(d(r.stateWithheld));
  }

  for (const int1099 of input.form1099Int) {
    const paState = int1099.state?.toUpperCase();
    if (paState && paState !== "PA") continue;
    total = total.plus(d(int1099.stateWithheld));
  }

  for (const div of input.form1099Div) {
    const paState = div.state?.toUpperCase();
    if (paState && paState !== "PA") continue;
    total = total.plus(d(div.stateWithheld));
  }

  for (const misc of input.form1099Misc) {
    const paState = misc.state?.toUpperCase();
    if (paState && paState !== "PA") continue;
    total = total.plus(d(misc.stateWithheld));
  }

  for (const nec of input.form1099Nec) {
    const paState = nec.state?.toUpperCase();
    if (paState && paState !== "PA") continue;
    total = total.plus(d(nec.stateWithheld));
  }

  return total;
}

function getPAReportedW2Compensation(
  w2: TaxYearInput["w2s"][number],
): Decimal {
  const state = w2.state?.toUpperCase();
  if (state !== "PA") {
    return ZERO;
  }

  if (!d(w2.stateWages).isZero()) {
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

function deriveReciprocalStateNontaxableIncome(
  input: TaxYearInput,
  resolved: PANonresidentOrchestratorOverrides,
): Decimal {
  if (resolved.nontaxableIncome !== undefined) {
    return resolved.nontaxableIncome;
  }

  if (resolved.residencyStatus !== "nonresident") {
    return ZERO;
  }

  const residentState = input.taxpayer.address.state?.toUpperCase();
  if (!residentState || !PA_RECIPROCAL_COMPENSATION_STATES.has(residentState)) {
    return ZERO;
  }

  return input.w2s.reduce(
    (total, w2) => total.plus(getPAReportedW2Compensation(w2)),
    ZERO,
  );
}

function deriveDefaultNonresidentPAW2Compensation(
  input: TaxYearInput,
  resolved: PANonresidentOrchestratorOverrides,
): Decimal {
  if (resolved.residencyStatus !== "nonresident") {
    return ZERO;
  }

  if (resolved.paTaxableCompensation !== undefined || resolved.scheduleNRH?.compensation) {
    return ZERO;
  }

  const residentState = input.taxpayer.address.state?.toUpperCase();
  if (residentState && PA_RECIPROCAL_COMPENSATION_STATES.has(residentState)) {
    return ZERO;
  }

  return input.w2s.reduce(
    (total, w2) => total.plus(getPAReportedW2Compensation(w2)),
    ZERO,
  );
}

export function calculatePANonresidentReturn(
  input: TaxYearInput,
  overrides: PANonresidentOrchestratorOverrides = {},
): PANonresidentOrchestratorResult {
  const taxYear = input.taxpayer.taxYear;
  const resolved = resolvePANonresidentOverrides(input, overrides);

  if (!resolved.residencyStatus) {
    throw new Error("PA nonresident return requires residencyStatus");
  }
  assertValidScheduleSPDependencyFilingStatus(input.taxpayer, resolved);

  const scheduleNRH = resolved.scheduleNRH
    ? calculatePAScheduleNRH({
        taxYear,
        ...resolved.scheduleNRH,
      })
    : undefined;

  const scheduleRK1 = input.paPassThroughStatements?.length
    ? calculatePAScheduleRK1({
        taxYear,
        statements: input.paPassThroughStatements,
      })
    : undefined;
  const scheduleJ = input.paScheduleJStatements?.length
    ? calculateScheduleJ({
        taxYear,
        statements: input.paScheduleJStatements,
      })
    : undefined;

  const compensation = (resolved.paTaxableCompensation ?? deriveDefaultNonresidentPAW2Compensation(input, resolved))
    .plus(scheduleNRH?.totalPAGrossCompensation ?? ZERO);
  const unreimbursedExpenses = (resolved.unreimbursedExpenses ?? ZERO)
    .plus(scheduleNRH?.apportionedEmployeeBusinessExpenses ?? ZERO);
  const interest = (resolved.paTaxableInterest ?? ZERO)
    .plus(scheduleRK1?.totalInterestIncome ?? ZERO);
  const dividends = (resolved.paTaxableDividends ?? ZERO)
    .plus(scheduleRK1?.totalDividendIncome ?? ZERO);
  const netBusinessIncome = (resolved.paTaxableNetBusinessIncome ?? ZERO)
    .plus(scheduleNRH?.paNetProfits ?? ZERO)
    .plus(scheduleRK1?.totalBusinessIncome ?? ZERO);
  const netGainOrLoss = (resolved.paTaxableNetGainOrLoss ?? ZERO)
    .plus(scheduleRK1?.totalNetGainOrLoss ?? ZERO);
  const netRentalIncome = (resolved.paTaxableNetRentalIncome ?? ZERO)
    .plus(scheduleRK1?.totalNetRentalIncome ?? ZERO);
  const scheduleRK1EstateTrustIncome = scheduleRK1?.totalEstateTrustIncome ?? ZERO;
  const estateTrustIncome = scheduleJ
    ? scheduleJ.totalEstateTrustIncome.plus(scheduleRK1EstateTrustIncome)
    : (resolved.paTaxableEstateTrustIncome ?? ZERO).plus(scheduleRK1EstateTrustIncome);
  const gamblingIncome = (resolved.paTaxableGamblingIncome ?? ZERO)
    .plus(scheduleRK1?.totalGamblingIncome ?? ZERO);

  const stateWithholding = mapStateWithholding(input);
  const statementNonresidentWithholding = sum(
    scheduleRK1?.totalNonresidentTaxWithheld ?? ZERO,
    scheduleJ?.totalNonresidentTaxWithheld ?? ZERO,
  );
  const nonresidentTaxWithheld = resolved.nonresidentTaxWithheld ?? statementNonresidentWithholding;

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
    otherDeductions: resolved.otherDeductions ?? ZERO,
    taxForgivenessEligibilityIncome: ZERO,
    useTax: resolved.useTax ?? ZERO,
    stateWithholding,
    creditFromPriorYear: resolved.creditFromPriorYear ?? ZERO,
    estimatedPayments: resolved.estimatedPayments ?? ZERO,
    extensionPayment: resolved.extensionPayment ?? ZERO,
    nonresidentTaxWithheld,
    refundableCredits: resolved.refundableCredits ?? ZERO,
    taxForgivenessCredit: ZERO,
    residentCredit: ZERO,
    otherCredits: resolved.otherCredits ?? ZERO,
    underpaymentPenalty: ZERO,
    lateFilingOrPaymentPenalty: resolved.lateFilingOrPaymentPenalty ?? ZERO,
    latePaymentInterest: resolved.latePaymentInterest ?? ZERO,
  };
  const firstPass = calculatePA40(provisionalPA40Input);
  const useTaxAmount = resolved.useTax ?? (
    resolved.useTaxWorksheet
      ? calculatePAUseTax({
          taxYear,
          paTaxableIncome: firstPass.totalPATaxableIncome,
          ...resolved.useTaxWorksheet,
        }).totalUseTaxLiability
      : ZERO
  );

  const effectiveOtherStateCredits = resolved.residencyStatus === "part_year"
    ? (resolved.otherStateCredits ?? [])
    : [];
  const scheduleGL = calculateScheduleGL({
    taxYear,
    paTaxLiability: firstPass.taxLiability,
    otherStateCredits: effectiveOtherStateCredits,
  });

  const filingCategory = mapFilingCategory(input.taxpayer, resolved);
  const additionalEligibilityIncome = (resolved.additionalEligibilityIncome ?? ZERO).plus(
    filingCategory === "married" ? (resolved.spouseEligibilityIncome ?? ZERO) : ZERO,
  );
  const nontaxableIncome = deriveReciprocalStateNontaxableIncome(input, resolved);
  const taxPaidToOtherStates = sum(
    ...effectiveOtherStateCredits.map((entry) => entry.taxPaidToOtherState),
  );
  const scheduleSP = calculateScheduleSP({
    taxYear,
    filingCategory,
    dependents: countPAScheduleSPDependentChildren(input.taxpayer),
    paTaxableIncome: firstPass.totalPATaxableIncome,
    nontaxableIncome,
    additionalEligibilityIncome,
    taxLiability: firstPass.taxLiability,
    taxPaidToOtherStates,
    isClaimedAsDependentOnAnotherFederalReturn:
      resolved.isClaimedAsDependentOnAnotherFederalReturn,
    claimingHouseholdQualifiesForTaxForgiveness:
      resolved.claimingHouseholdQualifiesForTaxForgiveness,
  });

  const pa40 = calculatePA40({
    ...provisionalPA40Input,
    useTax: useTaxAmount,
    taxForgivenessEligibilityIncome: scheduleSP.eligibilityIncome,
    taxForgivenessCredit: scheduleSP.taxForgivenessCredit,
    residentCredit: scheduleGL.totalCredit,
  });

  return {
    residencyStatus: resolved.residencyStatus,
    pa40,
    scheduleSP,
    scheduleGL,
    scheduleNRH,
    taxableIncome: {
      compensation,
      unreimbursedExpenses,
      interest,
      dividends,
      netBusinessIncome,
      netGainOrLoss,
      netRentalIncome,
      estateTrustIncome,
      gamblingIncome,
    },
    stateWithholding,
  };
}
