import { healthInsuranceFactErrors } from "./guided-health-insurance-facts";
import Decimal from "decimal.js";
import { householdFutaNoError } from "@/engine/forms/schedule-h";
import { hsaFactErrors } from "./guided-hsa-facts";
import { educatorFactErrors } from "./guided-educator-facts";
import { studentLoanFactErrors, type StudentLoanEducationSources } from "./guided-student-loan-facts";
import type { AdjustmentData, FilingStatus, OtherTaxesData, PersonalInfoData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, guidedAmountChanged, hasEnteredAmount, isActualDate } from "./guided-required-facts";
import { guidedSourceValuesChanged } from "./guided-source-confirmation";

export const alimonyRequirementFields = ["paidInCash", "notDesignatedNondeductible", "notChildSupport", "noJointReturnWithRecipient", "householdRequirementMet", "noPaymentsAfterRecipientDeath"] as const;

const employeeAmountFields = ["cashWages", "federalIncomeTaxWithheld"] as const;
const employeeQualificationFields = ["isSpouse", "isChildUnder21", "isParent", "isUnder18NonPrincipal", "parentCareExceptionApplies"] as const;
const futaAmountFields = ["stateUnemploymentContributions", "stateUnemploymentContributionsPaidLate", "futaCreditReduction"] as const;
const futaAnswerFields = ["futaApplies", "futaSectionA"] as const;
const futaPeriodAmountFields = ["taxableWages", "contributionsPaidTimely", "experienceRatePercent", "futaCreditReductionWages"] as const;
const futaPeriodSourceFields = ["state", "periodStart", "periodEnd", "hasAssignedExperienceRate"] as const;

export function isScheduleH2026CaliforniaPeriod(state: string, taxYear?: number | null): boolean {
  return taxYear === 2026 && state === "CA";
}

export function hasCurrentScheduleH2026CaliforniaPeriod(data: OtherTaxesData, taxYear?: number | null): boolean {
  return (data.futaStatePeriods ?? []).some(period => isScheduleH2026CaliforniaPeriod(period.state, taxYear)
    && period.periodStart?.startsWith("2026-") && period.periodEnd?.startsWith("2026-"));
}

/** Worksheet 2 overlap belongs to the selected year and the reviewed California period. */
export function clearStaleScheduleHCreditReductionWages(
  data: OtherTaxesData, taxYear?: number | null, previous?: OtherTaxesData,
): OtherTaxesData {
  const periods = data.futaStatePeriods;
  if (!periods?.some(period => period.futaCreditReductionWages !== undefined)) return data;
  const previousPeriods = previous?.futaStatePeriods ?? [];
  const updated = periods.map((period, index) => {
    if (period.futaCreditReductionWages === undefined) return period;
    const prior = previousPeriods[index];
    const reusedAfterPeriodEdit = prior?.futaCreditReductionWages !== undefined
      && !guidedAmountChanged(prior.futaCreditReductionWages, period.futaCreditReductionWages)
      && !previousPeriods.some(saved => saved.state === period.state && saved.periodStart === period.periodStart
        && saved.periodEnd === period.periodEnd && !guidedAmountChanged(saved.taxableWages, period.taxableWages));
    if (isScheduleH2026CaliforniaPeriod(period.state, taxYear) && data.futaApplies === true
      && data.futaSectionA === false && !reusedAfterPeriodEdit) return period;
    const { futaCreditReductionWages: _stale, ...originalPeriod } = period;
    return originalPeriod;
  });
  return updated.every((period, index) => period === periods[index]) ? data : { ...data, futaStatePeriods: updated };
}

export function hasAlimonyAmounts(data: AdjustmentData | undefined): boolean {
  return hasEnteredAmount(data?.alimonyPaid);
}

export function hasHouseholdAmounts(data: OtherTaxesData | undefined): boolean {
  return hasEnteredAmount(data?.householdEmploymentWages)
    || (data?.householdEmployees ?? []).some(employee => employeeAmountFields.some(field => hasEnteredAmount(employee[field])));
}

export function hasRetainedAlimonyContext(data: AdjustmentData | undefined): boolean {
  const facts = data?.alimonyQualification;
  return hasAlimonyAmounts(data) || (!!facts && (
    !!facts.instrumentDate?.trim() || !!facts.recipientSsn?.trim() || typeof facts.post2018ModificationAppliesNewRules === "boolean"
    || alimonyRequirementFields.some(field => typeof facts[field] === "boolean")
  ));
}

export function hasRetainedHouseholdContext(data: OtherTaxesData | undefined): boolean {
  return hasHouseholdAmounts(data)
    || futaAnswerFields.some(field => typeof data?.[field] === "boolean")
    || futaAmountFields.some(field => hasEnteredAmount(data?.[field]))
    || (data?.householdEmployees ?? []).some(employee => !!employee.name?.trim()
      || employeeQualificationFields.some(field => typeof employee[field] === "boolean"))
    || (data?.futaStatePeriods ?? []).some(period =>
      !!period.state?.trim() || !!period.periodStart?.trim() || !!period.periodEnd?.trim()
      || typeof period.hasAssignedExperienceRate === "boolean"
      || futaPeriodAmountFields.some(field => hasEnteredAmount(period[field])));
}

export function alimonySourceFactsChanged(before: AdjustmentData | undefined, after: AdjustmentData | undefined): boolean {
  return guidedAmountChanged(before?.alimonyPaid, after?.alimonyPaid)
    || guidedSourceValuesChanged(before?.alimonyQualification, after?.alimonyQualification);
}

export function householdSourceFactsChanged(before: OtherTaxesData | undefined, after: OtherTaxesData | undefined): boolean {
  const employees = before?.householdEmployees ?? [];
  const nextEmployees = after?.householdEmployees ?? [];
  const periods = before?.futaStatePeriods ?? [];
  const nextPeriods = after?.futaStatePeriods ?? [];
  return guidedAmountChanged(before?.householdEmploymentWages, after?.householdEmploymentWages)
    || futaAmountFields.some(field => guidedAmountChanged(before?.[field], after?.[field]))
    || futaAnswerFields.some(field => before?.[field] !== after?.[field])
    || employees.length !== nextEmployees.length
    || employees.some((employee, index) => {
      const next = nextEmployees[index];
      return employee.name !== next?.name
        || employeeQualificationFields.some(field => employee[field] !== next?.[field])
        || employeeAmountFields.some(field => guidedAmountChanged(employee[field], next?.[field]));
    })
    || periods.length !== nextPeriods.length
    || periods.some((period, index) => {
      const next = nextPeriods[index];
      return futaPeriodSourceFields.some(field => period[field] !== next?.[field])
        || futaPeriodAmountFields.some(field => guidedAmountChanged(period[field], next?.[field]));
    });
}

export function isDeductibleAlimony(data: AdjustmentData): boolean {
  const facts = data.alimonyQualification;
  return !!facts && facts.instrumentDate >= "1985-01-01" && facts.instrumentDate < "2019-01-01"
    && facts.post2018ModificationAppliesNewRules === false && alimonyRequirementFields.every((field) => facts[field] === true);
}

export function adjustmentFactErrors(data: AdjustmentData | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, education: StudentLoanEducationSources = [], personal?: PersonalInfoData): Record<string, string> {
  if (!data) return {};
  const errors: Record<string, string> = { ...healthInsuranceFactErrors(data, filingStatus, taxYear), ...hsaFactErrors(data.hsaAccounts, filingStatus, taxYear, undefined, personal), ...educatorFactErrors(data, filingStatus, taxYear), ...studentLoanFactErrors(data, filingStatus, taxYear, education) };
  for (const field of ["hsaDeduction", "studentLoanInterest", "selfEmployedHealthInsurance", "educatorExpenses", "iraDeduction", "alimonyPaid"] as const) {
    if (!hasEnteredAmount(data[field])) continue;
    const error = amountError(data[field], field);
    if (error) errors[field] = error;
  }
  if (!errors.hsaDeduction && parseGuidedCurrency(data.hsaDeduction).gt(0) && !data.hsaAccounts?.length) errors.hsaAccounts = "Enter actual HSA coverage and contributions; a saved deduction estimate cannot replace these facts.";
  if (!errors.iraDeduction && parseGuidedCurrency(data.iraDeduction).gt(0) && !data.iraContributions) errors.iraContributions = "Enter actual IRA contributions and employer-plan coverage; a saved deduction estimate cannot replace these facts.";
  const ira = data.iraContributions;
  if (ira) {
    if (!["2025", "2026"].includes(ira.contributionTaxYear ?? "") || (taxYear != null && ira.contributionTaxYear !== String(taxYear))) errors.iraContributionYear = "Confirm the actual tax year designated for these contributions.";
    if (ira.contributionTimingConfirmed !== true) errors.iraContributionTiming = "Confirm the contributions were timely made for the designated tax year; do not include a future planned contribution as paid.";
    if (ira.specialContributionRulesRequired !== false) errors.iraSpecialRules = "Rollover, recharacterization, returned or excess contributions need their actual source worksheets before these totals can be used.";
    if (ira.sourceFactsConfirmed !== true) errors.iraConfirmation = "Check the IRA compensation and contribution facts after their last edit.";
    for (const field of ["primaryCompensation", "primaryRothContributions", "primarySection501c18Contributions"] as const) {
      const error = amountError(ira[field], field); if (error) errors[field] = error;
    }
    for (const field of ["spouseCompensation", "spouseRothContributions", "spouseSection501c18Contributions"] as const) {
      if (filingStatus !== "mfj" && !hasEnteredAmount(ira[field])) continue;
      const error = amountError(ira[field], field); if (error) errors[field] = error;
      else if (filingStatus && filingStatus !== "mfj" && parseGuidedCurrency(ira[field]).gt(0)) errors[field] = "Reconcile saved spouse IRA source facts when this is not a joint return.";
    }
    const primaryError = amountError(ira.primaryContributions, "taxpayer IRA contributions");
    if (primaryError) errors.primaryContributions = primaryError;
    if (typeof ira.primaryIsActiveParticipant !== "boolean") errors.primaryIsActiveParticipant = "Confirm the taxpayer's employer-plan coverage during the tax year.";
    const married = filingStatus === "mfj" || filingStatus === "mfs";
    if (married && typeof ira.spouseIsActiveParticipant !== "boolean") errors.spouseIsActiveParticipant = "Confirm the spouse's employer-plan coverage even if the spouse did not contribute.";
    if (filingStatus === "mfj" || hasEnteredAmount(ira.spouseContributions)) {
      const error = amountError(ira.spouseContributions, "spouse IRA contributions");
      if (error) errors.spouseContributions = error;
      else if (filingStatus && filingStatus !== "mfj" && parseGuidedCurrency(ira.spouseContributions).gt(0)) errors.spouseContributions = "Spouse contributions require a joint return in this worksheet.";
    }
  }
  if (!errors.alimonyPaid && parseGuidedCurrency(data.alimonyPaid).gt(0)) {
    const facts = data.alimonyQualification;
    if (!facts || !isActualDate(facts.instrumentDate) || (taxYear != null && facts.instrumentDate > `${taxYear}-12-31`)) errors.alimonyInstrument = "Enter the actual divorce or separation instrument date, no later than the tax year, and eligibility facts.";
    else if (facts.instrumentDate < "1985-01-01") errors.alimonyInstrument = "Pre-1985 alimony instruments need a separately qualified worksheet and cannot be calculated here.";
    else if (facts.instrumentDate < "2019-01-01") {
      if (typeof facts.post2018ModificationAppliesNewRules !== "boolean") errors.alimonyModification = "Confirm whether a later modification explicitly applied the post-2018 alimony rules.";
      if (facts.post2018ModificationAppliesNewRules === false) {
        for (const field of alimonyRequirementFields) if (typeof facts[field] !== "boolean") errors[field] = "Confirm every alimony requirement from the instrument and payment records.";
        if (isDeductibleAlimony(data) && !/^\d{3}-?\d{2}-?\d{4}$/.test(facts.recipientSsn)) errors.alimonyRecipient = "Enter the recipient's actual SSN or ITIN.";
      }
    }
  }
  if (hasAlimonyAmounts(data) && data.alimonyAmountsTaxYear !== undefined
    && (taxYear == null || data.alimonyAmountsTaxYear !== taxYear)) {
    errors.alimonyAmountsTaxYear = "Review and confirm the alimony payments and payment eligibility for the selected tax year.";
  }
  return errors;
}

export function householdFactErrors(data: OtherTaxesData | undefined, taxYear?: number | null): Record<string, string> {
  if (!data) return {};
  const errors: Record<string, string> = {};
  const employees = data.householdEmployees ?? [];
  if (hasEnteredAmount(data.householdEmploymentWages)) {
    const error = amountError(data.householdEmploymentWages, "saved household wages");
    if (error) errors.householdEmploymentWages = error;
    else if (parseGuidedCurrency(data.householdEmploymentWages).gt(0) && !employees.length) errors.householdEmployees = "Enter each actual household employee; a wage total does not establish each employee's tax treatment.";
  }
  employees.forEach((employee, index) => {
    if (!employee.name.trim()) errors[`employee-${index}-name`] = "Enter the actual household employee name.";
    for (const field of ["cashWages", "federalIncomeTaxWithheld"] as const) {
      const error = amountError(employee[field], field === "cashWages" ? "employee cash wages" : "employee federal withholding");
      if (error) errors[`employee-${index}-${field}`] = error;
    }
    if (!errors[`employee-${index}-cashWages`] && !errors[`employee-${index}-federalIncomeTaxWithheld`] && parseGuidedCurrency(employee.federalIncomeTaxWithheld).gt(parseGuidedCurrency(employee.cashWages))) errors[`employee-${index}-federalIncomeTaxWithheld`] = "Employee income tax withholding cannot exceed cash wages; check the payroll records.";
    for (const field of ["isSpouse", "isChildUnder21", "isParent", "isUnder18NonPrincipal"] as const) if (typeof employee[field] !== "boolean") errors[`employee-${index}-${field}`] = "Confirm the employee's relationship and age/occupation exclusions.";
    if (employee.isParent && typeof employee.parentCareExceptionApplies !== "boolean") errors[`employee-${index}-parentCare`] = "Confirm both qualifying childcare and marital-status conditions for the parent exception.";
  });
  if (employees.length) {
    if (typeof data.futaApplies !== "boolean") errors.futaApplies = "Confirm whether qualifying household wages reached $1,000 in any calendar quarter of this or the preceding year.";
    if (data.futaApplies === true && typeof data.futaSectionA !== "boolean") errors.futaSectionA = "Confirm state unemployment tax and credit-reduction facts for Schedule H.";
    if (data.futaApplies === true && data.futaSectionA === true && hasCurrentScheduleH2026CaliforniaPeriod(data, taxYear)) {
      errors.futaSectionA = "Use Section B for the retained 2026 California unemployment period, or correct the original payroll records.";
    }
    if (data.futaApplies === true && data.futaSectionA === false) {
      const periods = data.futaStatePeriods ?? [];
      const californiaPeriods = periods.some(period => isScheduleH2026CaliforniaPeriod(period.state, taxYear));
      const lateError = amountError(data.stateUnemploymentContributionsPaidLate, "stateUnemploymentContributionsPaidLate");
      if (lateError) errors.stateUnemploymentContributionsPaidLate = lateError;
      if (!californiaPeriods || hasEnteredAmount(data.futaCreditReduction)) {
        const error = amountError(data.futaCreditReduction, "futaCreditReduction");
        if (error) errors.futaCreditReduction = error;
        else if (taxYear === 2026 && !californiaPeriods && periods.length
          && !parseGuidedCurrency(data.futaCreditReduction).isZero()) {
          errors.futaCreditReduction = "Confirm the state payroll records. Only California has a 2026 FUTA credit reduction; enter 0 if no period was in California.";
        }
      }
      if (!periods.length) errors.futaStatePeriods = "Enter actual state/rate periods, taxable wages and contribution timing for Schedule H Section B.";
      if (californiaPeriods) {
        const futaEmployees = employees.filter(employee =>
          employee.isSpouse === false && employee.isChildUnder21 === false && employee.isParent === false);
        if (periods.some(period => period.state !== "CA") || futaEmployees.length !== 1) {
          errors.futaStatePeriods = "The 2026 California Worksheet 2 uses California-only periods for one employee subject to FUTA. Other payroll arrangements need a separate source review.";
        }
      }
      periods.forEach((period, index) => {
        if (!/^[A-Z]{2}$/.test(period.state)) errors[`futa-${index}-state`] = "Enter the actual state abbreviation.";
        if (!isActualDate(period.periodStart) || !isActualDate(period.periodEnd) || period.periodStart > period.periodEnd || period.periodStart.slice(0, 4) !== period.periodEnd.slice(0, 4) || (taxYear != null && !period.periodStart.startsWith(`${taxYear}-`))) errors[`futa-${index}-dates`] = "Enter the actual state experience-rate period in the tax year.";
        for (const field of ["taxableWages", "contributionsPaidTimely"] as const) {
          const error = amountError(period[field], field);
          if (error) errors[`futa-${index}-${field}`] = error;
        }
        if (isScheduleH2026CaliforniaPeriod(period.state, taxYear)) {
          const error = amountError(period.futaCreditReductionWages, "FUTA-taxable wages also subject to California unemployment tax for this period");
          if (error) errors[`futa-${index}-futaCreditReductionWages`] = error;
        }
        if (typeof period.hasAssignedExperienceRate !== "boolean") errors[`futa-${index}-assigned`] = "Confirm whether the state assigned an experience rate.";
        if (period.hasAssignedExperienceRate === true) {
          const error = amountError(period.experienceRatePercent, "experience rate percentage");
          if (error) errors[`futa-${index}-rate`] = error;
          else if (parseGuidedCurrency(period.experienceRatePercent).gt(100)) errors[`futa-${index}-rate`] = "Experience rate cannot exceed 100%.";
        }
      });
      if (hasEnteredAmount(data.stateUnemploymentContributions)) {
        const error = amountError(data.stateUnemploymentContributions, "saved state contributions");
        if (error) errors.stateUnemploymentContributions = error;
        else if (!Object.keys(errors).length) {
          const actual = (data.futaStatePeriods ?? []).reduce((sum, period) => sum.plus(parseGuidedCurrency(period.contributionsPaidTimely)), parseGuidedCurrency(data.stateUnemploymentContributionsPaidLate));
          if (!actual.eq(parseGuidedCurrency(data.stateUnemploymentContributions))) errors.stateUnemploymentContributions = "Reconcile saved state contributions with actual timely and late amounts.";
        }
      }
    }
    if (!Object.keys(errors).length && hasEnteredAmount(data.householdEmploymentWages)) {
      const total = employees.reduce((sum, employee) => sum.plus(parseGuidedCurrency(employee.cashWages)), new Decimal(0));
      if (!total.eq(parseGuidedCurrency(data.householdEmploymentWages))) errors.householdEmploymentWages = "Reconcile the saved wage total with individual employee wages.";
    }
  }
  if (hasHouseholdAmounts(data) && data.householdAmountsTaxYear !== undefined
    && (taxYear == null || data.householdAmountsTaxYear !== taxYear)) {
    errors.householdAmountsTaxYear = "Review and confirm household payroll and FUTA facts for the selected tax year.";
  }
  if (data.futaApplies === false && !Object.keys(errors).length) {
    const error = householdFutaNoError(employees.map(employee => ({ ...employee, cashWages: parseGuidedCurrency(employee.cashWages) })));
    if (error) errors.futaApplies = error;
  }
  return errors;
}
