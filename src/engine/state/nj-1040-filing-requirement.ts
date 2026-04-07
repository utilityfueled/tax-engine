/**
 * New Jersey NJ-1040 filing requirement determination.
 * Spec: spec/state/nj-1040-filing-requirement.yaml
 *
 * Determines whether a NJ resident must file an NJ-1040 return based on
 * gross income threshold, withholding, credits eligibility, and other triggers.
 */

import Decimal from "decimal.js";
import { getNJResidentConstants, type FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { calculateNJ1040ExcessPayroll } from "@/engine/state/nj-1040-excess-payroll.js";
import { calculateNJ1040HW } from "@/engine/state/nj-1040-hw.js";
import { assertSupportedNJTaxYear } from "@/engine/state/nj-tax-year.js";
import { AuditTrail } from "@/utils/audit.js";
import { d } from "@/utils/decimal.js";

export interface NJFilingRequirementInput {
  filingStatus: FilingStatus;
  taxYear: number;

  /** NJ gross income (Line 29 of NJ-1040) */
  njGrossIncome?: Decimal | string | number;

  /** NJ income tax withheld across all sources */
  njWithholding?: Decimal | string | number;
  /** NJ estimated tax payments made for the year */
  estimatedPayments?: Decimal | string | number;

  /** Federal EITC amount (NJ EITC = 40% of federal) */
  federalEITC?: Decimal | string | number;
  /** Special 2025 childless age-18 NJEITC eligibility path */
  qualifiesForChildlessAge18Exception?: boolean;

  /** Number of qualifying children age 5 or under (for NJ CTC) */
  qualifyingChildrenAge5OrUnder?: number;
  /** Federal child and dependent care credit used to determine refundable NJ line 64 eligibility */
  federalDependentCareCredit?: Decimal | string | number;

  /** Use tax amount owed */
  useTaxOwed?: Decimal | string | number;

  /** Months without minimum essential health coverage (for SRP) */
  healthCoverageUncoveredMonths?: number;
  /** True when every uncovered month is exempt from the shared responsibility payment */
  healthCoverageExemptAllUncoveredMonths?: boolean;

  /** Total UI/WF/SWF withheld (for excess payroll check) */
  totalUIWFSWFWithheld?: Decimal | string | number;
  /** Total DI withheld (for excess payroll check) */
  totalDIWithheld?: Decimal | string | number;
  /** Total FLI withheld (for excess payroll check) */
  totalFLIWithheld?: Decimal | string | number;
  /** Private-plan DI maximum override used by Form NJ-2450 when applicable */
  privatePlanMaxDI?: Decimal | string | number;

  /** Pass-Through Business Alternative Income Tax credit claimed on line 63 */
  passThroughBusinessAlternativeIncomeTaxCredit?: Decimal | string | number;

  // --- NJ-1040-HW alternate-form inputs ---
  isHomeowner?: boolean;
  isTenant?: boolean;
  propertyTaxesPaid?: Decimal | string | number;
  rentPaid?: Decimal | string | number;
  taxpayerAge65OrOlder?: boolean;
  spouseAge65OrOlder?: boolean;
  taxpayerBlindOrDisabled?: boolean;
  spouseBlindOrDisabled?: boolean;
  monthsOfResidency?: number;
  sharedMainHomeWithSpouse?: boolean;
  providedCareToQualifyingServiceMember?: boolean;
  serviceMemberFederalDisabilityCompensation?: Decimal | string | number;
  onlyCaregiver?: boolean;
  careExpensesSharePercent?: Decimal | string | number;
}

export type NJRecommendedForm = "NJ-1040" | "NJ-1040-HW" | "none";

export interface NJFilingRequirementResult {
  /** Overall: must file NJ-1040? */
  filingRequired: boolean;

  /** What form the taxpayer should file, if any */
  recommendedForm: NJRecommendedForm;

  /** Standalone refundable credits available on NJ-1040-HW when that form is recommended */
  nj1040hwTotalCredits: Decimal;

  /** The gross income filing threshold for this filing status */
  filingThreshold: Decimal;

  // --- Individual reason flags ---
  requiredByIncome: boolean;
  requiredForRefund: boolean;
  requiredForEITC: boolean;
  requiredForCTC: boolean;
  requiredForDependentCareCredit: boolean;
  requiredForUseTax: boolean;
  requiredForSRP: boolean;
  requiredForExcessPayroll: boolean;
  requiredForPTBAITCredit: boolean;

  /** Human-readable list of reasons filing is required */
  reasons: string[];

  lines: CalculatedLine[];
}

export function determineNJFilingRequirement(
  input: NJFilingRequirementInput
): NJFilingRequirementResult {
  assertSupportedNJTaxYear(input.taxYear, "NJ-1040 filing requirement rules");
  const audit = new AuditTrail();

  const filingThreshold = getNJResidentConstants(input.taxYear).filingThresholds[
    input.filingStatus
  ];

  audit.record(
    "NJ-1040",
    "filing-threshold",
    "Gross income filing threshold",
    filingThreshold,
    "NJ filing threshold for filing status",
    { "Filing status": input.filingStatus }
  );

  const njGrossIncome = d(input.njGrossIncome);
  const reasons: string[] = [];

  // 1. Income exceeds threshold (NJ uses "exceeds" = strictly greater than)
  const requiredByIncome = njGrossIncome.greaterThan(filingThreshold);
  if (requiredByIncome) {
    reasons.push(
      `NJ gross income ($${njGrossIncome.toFixed(0)}) exceeds filing threshold ($${filingThreshold.toFixed(0)})`
    );
  }

  audit.record(
    "NJ-1040",
    "required-by-income",
    "Filing required by gross income",
    new Decimal(requiredByIncome ? 1 : 0),
    "NJ gross income > filing threshold",
    {
      "NJ gross income": njGrossIncome,
      "Filing threshold": filingThreshold,
      "Required": String(requiredByIncome),
    }
  );

  // 2. NJ withholding or estimated payments → file to claim refund
  const njWithholding = d(input.njWithholding);
  const estimatedPayments = d(input.estimatedPayments);
  const requiredForRefund =
    njWithholding.greaterThan(0) || estimatedPayments.greaterThan(0);
  if (requiredForRefund) {
    if (njWithholding.greaterThan(0) && estimatedPayments.greaterThan(0)) {
      reasons.push(
        `NJ withholding ($${njWithholding.toFixed(0)}) and estimated payments ($${estimatedPayments.toFixed(0)}) — must file to claim refund`
      );
    } else if (estimatedPayments.greaterThan(0)) {
      reasons.push(
        `NJ estimated payments ($${estimatedPayments.toFixed(0)}) — must file to claim refund`
      );
    } else {
      reasons.push(
        `NJ income tax withheld ($${njWithholding.toFixed(0)}) — must file to claim refund`
      );
    }
  }

  audit.record(
    "NJ-1040",
    "required-for-refund",
    "Filing required to claim withholding or estimated tax refund",
    new Decimal(requiredForRefund ? 1 : 0),
    "NJ withholding > 0 or NJ estimated payments > 0",
    {
      "NJ withholding": njWithholding,
      "Estimated payments": estimatedPayments,
    }
  );

  // 3. EITC eligibility
  const federalEITC = d(input.federalEITC);
  const requiredForEITC =
    federalEITC.greaterThan(0) ||
    input.qualifiesForChildlessAge18Exception === true;
  if (requiredForEITC) {
    reasons.push("Eligible for NJ Earned Income Tax Credit");
  }

  audit.record(
    "NJ-1040",
    "required-for-eitc",
    "Filing required to claim NJ EITC",
    new Decimal(requiredForEITC ? 1 : 0),
    "Federal EITC > 0 or childless age-18 NJEITC exception applies",
    {
      "Federal EITC": federalEITC,
      "Childless age-18 exception": String(
        input.qualifiesForChildlessAge18Exception === true
      ),
    }
  );

  // 4. Child Tax Credit eligibility
  const qualifyingChildren = input.qualifyingChildrenAge5OrUnder ?? 0;
  const ctcEligibleFilingStatus =
    input.filingStatus !== "married_filing_separately";
  const requiredForCTC = ctcEligibleFilingStatus && qualifyingChildren > 0;
  if (requiredForCTC) {
    reasons.push(
      `Eligible for NJ Child Tax Credit (${qualifyingChildren} qualifying children)`
    );
  }

  audit.record(
    "NJ-1040",
    "required-for-ctc",
    "Filing required to claim NJ Child Tax Credit",
    new Decimal(requiredForCTC ? 1 : 0),
    "Qualifying children age 5 or under > 0 and filing status is not married filing separately",
    {
      "Qualifying children": qualifyingChildren.toString(),
      "Filing status eligible for CTC": String(ctcEligibleFilingStatus),
    }
  );

  // 5. Dependent care credit eligibility
  const federalDependentCareCredit = d(input.federalDependentCareCredit);
  const requiredForDependentCareCredit =
    federalDependentCareCredit.greaterThan(0);
  if (requiredForDependentCareCredit) {
    reasons.push("Eligible for NJ Child and Dependent Care Credit");
  }

  audit.record(
    "NJ-1040",
    "required-for-dependent-care-credit",
    "Filing required to claim NJ Child and Dependent Care Credit",
    new Decimal(requiredForDependentCareCredit ? 1 : 0),
    "Federal Form 2441 child and dependent care credit > 0",
    {
      "Federal dependent care credit": federalDependentCareCredit,
    }
  );

  // 6. Use tax owed
  const useTaxOwed = d(input.useTaxOwed);
  const requiredForUseTax = useTaxOwed.greaterThan(0);
  if (requiredForUseTax) {
    reasons.push(
      `Use tax owed ($${useTaxOwed.toFixed(0)}) on out-of-state purchases`
    );
  }

  audit.record(
    "NJ-1040",
    "required-for-use-tax",
    "Filing required because use tax owed",
    new Decimal(requiredForUseTax ? 1 : 0),
    "Use tax > 0",
    { "Use tax": useTaxOwed }
  );

  // 7. Shared responsibility payment (health coverage mandate)
  const uncoveredMonths = input.healthCoverageUncoveredMonths ?? 0;
  const healthCoverageExemptAllUncoveredMonths =
    input.healthCoverageExemptAllUncoveredMonths === true ||
    (uncoveredMonths > 0 && uncoveredMonths <= 2);
  const requiredForSRP =
    uncoveredMonths > 0 && !healthCoverageExemptAllUncoveredMonths;
  if (requiredForSRP) {
    reasons.push(
      `Shared responsibility payment owed (${uncoveredMonths} months without coverage)`
    );
  }

  audit.record(
    "NJ-1040",
    "required-for-srp",
    "Filing required because SRP applies",
    new Decimal(requiredForSRP ? 1 : 0),
    "Uncovered months > 0 and all uncovered months are not exempt",
    {
      "Uncovered months": uncoveredMonths.toString(),
      "All uncovered months exempt": String(healthCoverageExemptAllUncoveredMonths),
    }
  );

  // 8. Excess payroll contributions
  const totalUI = d(input.totalUIWFSWFWithheld);
  const totalDI = d(input.totalDIWithheld);
  const totalFLI = d(input.totalFLIWithheld);
  const excessPayrollResult = calculateNJ1040ExcessPayroll({
    taxYear: input.taxYear,
    totalUIWFSWFWithheld: totalUI,
    totalDIWithheld: totalDI,
    totalFLIWithheld: totalFLI,
    privatePlanMaxDI: input.privatePlanMaxDI,
  });
  const requiredForExcessPayroll =
    excessPayrollResult.totalExcessPayroll.greaterThan(0);
  if (requiredForExcessPayroll) {
    reasons.push(
      "NJ payroll contributions withheld — file to claim any excess"
    );
  }

  audit.record(
    "NJ-1040",
    "required-for-excess-payroll",
    "Filing required to claim excess payroll credit",
    new Decimal(requiredForExcessPayroll ? 1 : 0),
    "Calculated excess payroll credit > 0 using NJ-2450 annual maximums",
    {
      "Total UI/WF/SWF": totalUI,
      "Total DI": totalDI,
      "Total FLI": totalFLI,
      "Private-plan DI maximum override": d(input.privatePlanMaxDI),
      "Total excess payroll credit": excessPayrollResult.totalExcessPayroll,
    }
  );

  // 9. PTBAIT credit
  const passThroughBusinessAlternativeIncomeTaxCredit = d(
    input.passThroughBusinessAlternativeIncomeTaxCredit
  );
  const requiredForPTBAITCredit =
    passThroughBusinessAlternativeIncomeTaxCredit.greaterThan(0);
  if (requiredForPTBAITCredit) {
    reasons.push(
      `Pass-Through Business Alternative Income Tax credit claimed ($${passThroughBusinessAlternativeIncomeTaxCredit.toFixed(0)})`
    );
  }

  audit.record(
    "NJ-1040",
    "required-for-ptbait-credit",
    "Filing required to claim PTBAIT credit",
    new Decimal(requiredForPTBAITCredit ? 1 : 0),
    "Line 63 PTBAIT credit > 0",
    {
      "PTBAIT credit": passThroughBusinessAlternativeIncomeTaxCredit,
    }
  );

  // Overall determination
  const filingRequired =
    requiredByIncome ||
    requiredForRefund ||
    requiredForEITC ||
    requiredForCTC ||
    requiredForDependentCareCredit ||
    requiredForUseTax ||
    requiredForSRP ||
    requiredForExcessPayroll ||
    requiredForPTBAITCredit;

  let recommendedForm: NJRecommendedForm = filingRequired ? "NJ-1040" : "none";
  let nj1040hwTotalCredits = new Decimal(0);

  if (!filingRequired) {
    const hwResult = calculateNJ1040HW({
      filingStatus: input.filingStatus,
      taxYear: input.taxYear,
      njGrossIncome,
      isFilingNJ1040: false,
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

    nj1040hwTotalCredits = hwResult.totalCredits;

    if (hwResult.totalCredits.greaterThan(0)) {
      recommendedForm = "NJ-1040-HW";

      if (hwResult.propertyTaxCredit.greaterThan(0)) {
        reasons.push(
          `Eligible to use NJ-1040-HW to claim Property Tax Credit ($${hwResult.propertyTaxCredit.toFixed(0)})`
        );
      }

      if (hwResult.woundedWarriorCredit.greaterThan(0)) {
        reasons.push(
          `Eligible to use NJ-1040-HW to claim Wounded Warrior Caregivers Credit ($${hwResult.woundedWarriorCredit.toFixed(0)})`
        );
      }
    }

    audit.merge(hwResult.lines);
  }

  audit.record(
    "NJ-1040",
    "hw-recommendation",
    "Recommend NJ-1040-HW instead of NJ-1040 when only the standalone application has a refundable claim",
    new Decimal(recommendedForm === "NJ-1040-HW" ? 1 : 0),
    "When NJ-1040 is not required, compute NJ-1040-HW and recommend it if the standalone claim is positive",
    {
      "Recommended form": recommendedForm,
      "NJ-1040-HW total credits": nj1040hwTotalCredits,
    }
  );

  audit.record(
    "NJ-1040",
    "filing-determination",
    "Overall NJ filing requirement determination",
    new Decimal(filingRequired ? 1 : 0),
    "Any filing trigger is true",
    {
      "Filing required": String(filingRequired),
      "Recommended form": recommendedForm,
      "Reason count": reasons.length.toString(),
    }
  );

  return {
    filingRequired,
    recommendedForm,
    nj1040hwTotalCredits,
    filingThreshold,
    requiredByIncome,
    requiredForRefund,
    requiredForEITC,
    requiredForCTC,
    requiredForDependentCareCredit,
    requiredForUseTax,
    requiredForSRP,
    requiredForExcessPayroll,
    requiredForPTBAITCredit,
    reasons,
    lines: audit.getLines(),
  };
}
