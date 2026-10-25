import Decimal from "decimal.js";
import type { AdjustmentData, FilingStatus, OtherTaxesData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, hasEnteredAmount, isActualDate } from "./guided-required-facts";

export const alimonyRequirementFields = ["paidInCash", "notDesignatedNondeductible", "notChildSupport", "noJointReturnWithRecipient", "householdRequirementMet", "noPaymentsAfterRecipientDeath"] as const;

export function isDeductibleAlimony(data: AdjustmentData): boolean {
  const facts = data.alimonyQualification;
  return !!facts && facts.instrumentDate >= "1985-01-01" && facts.instrumentDate < "2019-01-01"
    && facts.post2018ModificationAppliesNewRules === false && alimonyRequirementFields.every((field) => facts[field] === true);
}

export function adjustmentFactErrors(data: AdjustmentData | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null): Record<string, string> {
  if (!data) return {};
  const errors: Record<string, string> = {};
  for (const field of ["hsaDeduction", "studentLoanInterest", "selfEmployedHealthInsurance", "educatorExpenses", "iraDeduction", "alimonyPaid"] as const) {
    if (!hasEnteredAmount(data[field])) continue;
    const error = amountError(data[field], field);
    if (error) errors[field] = error;
  }
  if (!errors.iraDeduction && parseGuidedCurrency(data.iraDeduction).gt(0) && !data.iraContributions) errors.iraContributions = "Enter actual IRA contributions and employer-plan coverage; a saved deduction estimate cannot replace these facts.";
  const ira = data.iraContributions;
  if (ira) {
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
    if (data.futaApplies === true && data.futaSectionA === false) {
      for (const field of ["stateUnemploymentContributionsPaidLate", "futaCreditReduction"] as const) {
        const error = amountError(data[field], field);
        if (error) errors[field] = error;
      }
      if (!data.futaStatePeriods?.length) errors.futaStatePeriods = "Enter actual state/rate periods, taxable wages and contribution timing for Schedule H Section B.";
      (data.futaStatePeriods ?? []).forEach((period, index) => {
        if (!/^[A-Z]{2}$/.test(period.state)) errors[`futa-${index}-state`] = "Enter the actual state abbreviation.";
        if (!isActualDate(period.periodStart) || !isActualDate(period.periodEnd) || period.periodStart > period.periodEnd || period.periodStart.slice(0, 4) !== period.periodEnd.slice(0, 4) || (taxYear != null && !period.periodStart.startsWith(`${taxYear}-`))) errors[`futa-${index}-dates`] = "Enter the actual state experience-rate period in the tax year.";
        for (const field of ["taxableWages", "contributionsPaidTimely"] as const) {
          const error = amountError(period[field], field);
          if (error) errors[`futa-${index}-${field}`] = error;
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
  return errors;
}
