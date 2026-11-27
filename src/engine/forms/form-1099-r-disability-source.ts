/** Spec: spec/federal/form-1099-r-disability-source.yaml */
import type { Form1099R, Taxpayer, TaxYearInput } from "@/models/inputs.js";
import { currentLocalCivilDate, isActualDate } from "@/utils/civil-date.js";
import { d } from "@/utils/decimal.js";
import { iraEducationOwnerFingerprint } from "@/utils/ira-education-owner.js";

type DatedDisabilityStatement = Pick<Form1099R,
  "taxYear" | "distributionCode" | "iraSepSimple" | "grossDistribution">;

export function isDatedCode3DisabilityStatement(form: DatedDisabilityStatement): boolean {
  return (form.taxYear === 2025 || form.taxYear === 2026)
    && form.iraSepSimple !== true && form.distributionCode?.trim() === "3"
    && d(form.grossDistribution).gt(0);
}

export function needsCode3DisabilityPensionSource(form: Form1099R): boolean {
  if (form.disabilityPensionSource !== undefined) return true;
  if (!isDatedCode3DisabilityStatement(form)) return false;
  if (form.taxableAmount === undefined) return form.simplifiedMethodCostInPlan !== undefined;
  return form.taxableAmountNotDetermined === true || d(form.taxableAmount).gt(0);
}

function sameAmount(original: string | undefined, amount: string | undefined): boolean {
  if (original === undefined || amount === undefined) return original === amount;
  return d(original).eq(amount);
}

function matchesSimplifiedMethod(form: Form1099R, firstPaymentDate: string): boolean {
  const worksheet = form.disabilityPensionSource?.simplifiedMethod;
  if (!worksheet || (form.taxableAmount !== undefined && form.taxableAmountNotDetermined !== true)) return false;
  const {
    simplifiedMethodCostInPlan: cost,
    simplifiedMethodExpectedPayments: expected,
    simplifiedMethodAnnuityStartingDate: startingDate,
    simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: primaryAge,
    simplifiedMethodPaymentsReceivedThisYear: count,
    simplifiedMethodPriorYearRecovered: prior,
  } = worksheet;
  if (cost === undefined || d(cost).lt(0) || count === undefined || !Number.isInteger(count) || count <= 0
    || (form.taxYear === 2026 && prior === undefined) || d(prior).lt(0)
    || startingDate === undefined || !isActualDate(startingDate) || startingDate < "1986-07-02" || startingDate > firstPaymentDate
    || (expected === undefined ? primaryAge === undefined : !Number.isInteger(expected) || expected <= 0)) {
    return false;
  }
  return sameAmount(cost, form.simplifiedMethodCostInPlan) && sameAmount(prior, form.simplifiedMethodPriorYearRecovered)
    && ([
      "simplifiedMethodPlanIdentifier", "simplifiedMethodExpectedPayments", "simplifiedMethodAnnuityStartingDate",
      "simplifiedMethodPrimaryAnnuitantAgeAtStartingDate", "simplifiedMethodSecondaryAnnuitantAgeAtStartingDate",
      "simplifiedMethodPaymentsReceivedThisYear",
    ] as const).every(field => worksheet[field] === form[field]);
}

/** Validate a whole payment period before using it to choose the reporting line. */
export function readCode3DisabilityPensionPlacement(form: Form1099R, asOfDate?: string): boolean {
  const source = form.disabilityPensionSource;
  if (!source) {
    throw new Error("Form 1099-R Code 3 requires the documented employer disability pension payment period.");
  }
  const taxable = d(form.taxableAmount);
  if (!isDatedCode3DisabilityStatement(form) || form.iraSepSimple !== false
    || taxable.lt(0) || taxable.gt(form.grossDistribution)
    || form.eligibleGovernmental457bPlan || form.militaryPensionOrSurvivorBenefit
    || form.trumpAccount === true || form.qualifiedJointSurvivorAnnuity) {
    throw new Error("Form 1099-R Code 3 payment period requires a supported original and non-IRA classification.");
  }

  const { original, planReference, employerDisabilityPensionConfirmed, allPaymentsCoveredConfirmed,
    minimumRetirementDate, firstPaymentDate, lastPaymentDate } = source;
  if (!planReference?.trim() || employerDisabilityPensionConfirmed !== true || allPaymentsCoveredConfirmed !== true) {
    throw new Error("Form 1099-R Code 3 requires the employer plan record and confirmation that the payment period covers the entire original.");
  }
  const payerTin = form.payerTin?.trim().replaceAll("-", "");
  if (!original || !payerTin || !/^\d{9}$/.test(payerTin) || !form.accountReference?.trim()
    || !form.payer.trim() || original.payer !== form.payer.trim()
    || original.payerTin?.replaceAll("-", "") !== payerTin || original.accountReference !== form.accountReference
    || original.taxYear !== form.taxYear || original.accountHolder !== form.accountHolder
    || !d(original.grossDistribution).eq(form.grossDistribution) || !sameAmount(original.taxableAmount, form.taxableAmount)
    || original.taxableAmountNotDetermined !== form.taxableAmountNotDetermined
    || typeof original.federalWithheld !== "string" || d(original.federalWithheld).lt(0)
    || !d(original.federalWithheld).eq(d(form.federalWithheld))) {
    throw new Error("Form 1099-R Code 3 payment evidence does not match the current original statement.");
  }
  if (source.simplifiedMethod !== undefined) {
    if (!matchesSimplifiedMethod(form, firstPaymentDate) || firstPaymentDate <= minimumRetirementDate) {
      throw new Error("Form 1099-R Code 3 requires a matching Simplified Method worksheet for a whole after-retirement payment period.");
    }
  } else if (form.taxableAmount === undefined || form.taxableAmountNotDetermined === true
    || (form.taxYear === 2026 && form.taxableAmountNotDetermined !== false)) {
    throw new Error("Form 1099-R Code 3 requires a determined Box 2a or a documented after-retirement worksheet.");
  }

  if (![original.ownerBirthDate, minimumRetirementDate, firstPaymentDate, lastPaymentDate]
    .every(date => isActualDate(date) && !date.startsWith("0000-"))
    || !firstPaymentDate.startsWith(`${form.taxYear}-`) || !lastPaymentDate.startsWith(`${form.taxYear}-`)
    || minimumRetirementDate <= original.ownerBirthDate || firstPaymentDate < original.ownerBirthDate
    || firstPaymentDate > lastPaymentDate
    || (form.distributionDate !== undefined && (!isActualDate(form.distributionDate)
      || form.distributionDate < firstPaymentDate || form.distributionDate > lastPaymentDate))) {
    throw new Error("Form 1099-R Code 3 requires actual payment dates matching the original and its return year.");
  }
  const today = currentLocalCivilDate();
  const observedThrough = asOfDate ?? today;
  if (!isActualDate(observedThrough) || observedThrough.startsWith("0000-") || observedThrough > today || lastPaymentDate > observedThrough) {
    throw new Error("Form 1099-R Code 3 requires the documented payment period to end on or before the valid calculation observation date.");
  }
  if (lastPaymentDate < minimumRetirementDate) return true;
  if (firstPaymentDate > minimumRetirementDate) return false;
  throw new Error("Form 1099-R Code 3 payment period on or crossing the minimum retirement date requires separate review.");
}

export function assertCode3DisabilityPensionPlacement(form: Form1099R, asOfDate?: string): void {
  if (readCode3DisabilityPensionPlacement(form, asOfDate) !== form.disabilityPensionBeforeMinimumRetirementAge) {
    throw new Error("Form 1099-R Code 3 placement must match the documented employer disability payment period.");
  }
}

export function code3DisabilityPensionOwnerMatches(form: Form1099R, taxpayer: Taxpayer): boolean {
  const original = form.disabilityPensionSource?.original;
  const owner = form.accountHolder === "primary" ? taxpayer.primary
    : taxpayer.filingStatus === "married_filing_jointly" && form.accountHolder === "spouse" ? taxpayer.spouse : undefined;
  const ownerFingerprint = iraEducationOwnerFingerprint(owner);
  return original !== undefined && owner !== undefined && ownerFingerprint !== undefined && original.taxYear === taxpayer.taxYear
    && original.ownerBirthDate === owner.dateOfBirth
    && original.ownerFingerprint === ownerFingerprint;
}

export function assertCode3DisabilityPensionSources(input: Pick<TaxYearInput, "taxpayer" | "form1099R">, asOfDate?: string): void {
  for (const form of input.form1099R ?? []) {
    if (isDatedCode3DisabilityStatement(form) && form.taxableAmount === undefined
      && form.disabilityPensionSource?.simplifiedMethod === undefined) {
      throw new Error("Form 1099-R Code 3 pension requires the actual Box 2a before validating the documented payment period.");
    }
    if (!needsCode3DisabilityPensionSource(form)) continue;
    assertCode3DisabilityPensionPlacement(form, asOfDate);
    if (!code3DisabilityPensionOwnerMatches(form, input.taxpayer)) {
      throw new Error("Form 1099-R Code 3 payment evidence must match the actual owner and return year.");
    }
  }
}
