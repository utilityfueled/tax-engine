import type { DependentEntryData, FilingStatus, PersonalInfoData } from "./guided-interview-flow";

export function isActualBirthDate(value: string | undefined, taxYear?: number | null): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    && value >= "1850-01-01" && (!taxYear || value <= `${taxYear}-12-31`);
}

export function isResidencyMonths(value: string | undefined): boolean {
  return typeof value === "string" && /^(?:[0-9]|1[0-2])$/.test(value);
}

function hasTaxId(value: string | undefined): boolean {
  return !!value && /^\d{3}-?\d{2}-?\d{4}$/.test(value) && value.replace(/-/g, "") !== "000000000";
}

export function dependentFactErrors(entry: DependentEntryData, index: number, taxYear?: number | null): Record<string, string> {
  const errors: Record<string, string> = {};
  const key = `dependent-${index}`;
  if (!entry.firstName?.trim() || !entry.lastName?.trim()) errors[`${key}-name`] = `Dependent ${index + 1} needs a first and last name`;
  if (!hasTaxId(entry.ssn)) errors[`${key}-ssn`] = `Dependent ${index + 1} needs their actual taxpayer ID`;
  if (!isActualBirthDate(entry.dateOfBirth, taxYear)) errors[`${key}-dateOfBirth`] = `Dependent ${index + 1} needs a valid birth date`;
  if (!entry.relationship) errors[`${key}-relationship`] = `Choose the relationship for dependent ${index + 1}`;
  if (!isResidencyMonths(entry.monthsLivedWithYou)) errors[`${key}-monthsLivedWithYou`] = `Enter 0–12 residency months for dependent ${index + 1}`;
  for (const field of ["qualifiesForCTC", "qualifiesForODC", "qualifiesForEIC"] as const) {
    if (typeof entry[field] !== "boolean") errors[`${key}-${field}`] = `Confirm ${field.slice(12)} eligibility for dependent ${index + 1}`;
  }
  if (entry.qualifiesForCTC && entry.qualifiesForODC) errors[`${key}-credits`] = "A dependent cannot receive both CTC and ODC";
  if (entry.qualifiesForCTC && taxYear && isActualBirthDate(entry.dateOfBirth, taxYear) && entry.dateOfBirth <= `${taxYear - 17}-12-31`) {
    errors[`${key}-credits`] = "CTC requires a child under age 17 at year end";
  }
  return errors;
}

export function personalFactErrors(data: PersonalInfoData | undefined, status: FilingStatus | null, taxYear?: number | null): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [field, label] of [["firstName", "First name"], ["lastName", "Last name"], ["addressLine1", "Address"], ["city", "City"], ["state", "State"], ["zip", "ZIP code"]] as const) {
    if (!data?.[field]?.trim()) errors[field] = `${label} is required`;
  }
  if (!isActualBirthDate(data?.dateOfBirth, taxYear)) errors.dateOfBirth = "Enter your actual birth date";
  if (!hasTaxId(data?.ssn)) errors.ssn = "Enter your actual taxpayer ID";
  if (!isResidencyMonths(data?.usResidencyMonths)) errors.usResidencyMonths = "Enter 0–12 months of U.S. residency";
  if (!data?.stateResidency) errors.stateResidency = "Confirm your state residency status";
  if (status === "mfj" || status === "mfs") {
    if (!data?.spouse?.firstName?.trim() || !data.spouse.lastName?.trim()) errors.spouseName = "Enter your spouse's first and last name";
    if (!hasTaxId(data?.spouse?.ssn)) errors.spouseSsn = "Enter your spouse's actual taxpayer ID";
    if (!isActualBirthDate(data?.spouse?.dateOfBirth, taxYear)) errors.spouseDateOfBirth = "Enter your spouse's actual birth date";
    if (!isResidencyMonths(data?.spouse?.usResidencyMonths)) errors.spouseResidency = "Enter 0–12 months of U.S. residency for your spouse";
    if (typeof data?.livedWithSpouseAtAnyTimeDuringYear !== "boolean") errors.livedWithSpouse = "Confirm whether you lived with your spouse during the year";
  }
  const count = data?.dependentCount;
  if (!count || !/^\d+$/.test(count) || Number(count) > 20 || Number(count) !== (data?.dependents?.length ?? 0)) {
    errors.dependentCount = "Enter complete details for every dependent";
  }
  data?.dependents?.forEach((entry, index) => Object.assign(errors, dependentFactErrors(entry, index, taxYear)));
  return errors;
}
