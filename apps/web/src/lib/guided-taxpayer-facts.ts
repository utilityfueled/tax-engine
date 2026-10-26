import { standardDeductionFactErrors } from "./guided-standard-deduction-facts";
import { eicClaimantFactErrors } from "./guided-eic-eligibility";
import { allowsBlankEicChildIdentifier } from "./guided-eic-separated-spouse";
import type { DependentEntryData, FilingStatus, PersonalInfoData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";

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

const stateCodes = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR VI GU AS MP AA AE AP".split(" "));

export function childCreditExclusionValues(data: PersonalInfoData["childTaxCredit"]) {
  const puertoRico = data?.puertoRicoExcludedIncome?.trim();
  const form4563 = data?.form4563ExcludedIncome?.trim();
  const combined = data?.possessionIncomeExclusion?.trim();
  if (puertoRico && form4563) {
    const total = parseGuidedCurrency(puertoRico).plus(parseGuidedCurrency(form4563));
    if (combined && !parseGuidedCurrency(combined).eq(total)) throw new Error("The separate possession exclusions must reconcile to the saved total");
    return { puertoRicoExcludedIncome: parseGuidedCurrency(puertoRico).toFixed(), form4563ExcludedIncome: parseGuidedCurrency(form4563).toFixed(), possessionIncomeExclusion: total.toFixed() };
  }
  if (!puertoRico && !form4563 && combined && parseGuidedCurrency(combined).isZero()) return { puertoRicoExcludedIncome: "0", form4563ExcludedIncome: "0", possessionIncomeExclusion: "0" };
  throw new Error("Enter the separate Puerto Rico and Form 4563 income exclusions, including zero");
}

export function dependentFactErrors(entry: DependentEntryData, index: number, taxYear?: number | null, actualBlankEicIdentifier = false): Record<string, string> {
  const errors: Record<string, string> = {};
  const key = `dependent-${index}`;
  if (!entry.firstName?.trim() || !entry.lastName?.trim()) errors[`${key}-name`] = `Dependent ${index + 1} needs a first and last name`;
  if (!hasTaxId(entry.ssn) && !(actualBlankEicIdentifier && entry.ssn === '' && entry.qualifiesForCTC === false && entry.qualifiesForODC === false)) errors[`${key}-ssn`] = `Dependent ${index + 1} needs their actual taxpayer ID or a confirmed original blank in the EIC self-only source records`;
  if (!isActualBirthDate(entry.dateOfBirth, taxYear)) errors[`${key}-dateOfBirth`] = `Dependent ${index + 1} needs a valid birth date`;
  if (!entry.relationship) errors[`${key}-relationship`] = `Choose the relationship for dependent ${index + 1}`;
  if (!isResidencyMonths(entry.monthsLivedWithYou)) errors[`${key}-monthsLivedWithYou`] = `Enter 0–12 residency months for dependent ${index + 1}`;
  for (const field of ["qualifiesForCTC", "qualifiesForODC", "qualifiesForEIC"] as const) {
    if (typeof entry[field] !== "boolean") errors[`${key}-${field}`] = `Confirm ${field.slice(12)} eligibility for dependent ${index + 1}`;
  }
  if (entry.qualifiesForCTC && entry.qualifiesForODC) errors[`${key}-credits`] = "A dependent cannot receive both CTC and ODC";
  if (entry.qualifiesForCTC && typeof entry.ctcSsnEligible !== "boolean") errors[`${key}-ctcSsn`] = `Confirm the timely employment-valid SSN requirement for dependent ${index + 1}`;
  if (entry.qualifiesForODC && typeof entry.odcTinEligible !== "boolean") errors[`${key}-odcTin`] = `Confirm the timely taxpayer ID requirement for dependent ${index + 1}`;
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
  if (!stateCodes.has(data?.state?.trim().toUpperCase() ?? "")) errors.state = "Enter a valid state or territory abbreviation";
  if (!/^\d{5}(?:-\d{4})?$/.test(data?.zip ?? "")) errors.zip = "Enter a valid ZIP code";
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
  data?.dependents?.forEach((entry, index) => Object.assign(errors, dependentFactErrors(entry, index, taxYear, allowsBlankEicChildIdentifier(data.eicSeparatedSpouseSources, entry, index))));
  const claimsCtc = data?.dependents?.some((entry) => entry.qualifiesForCTC);
  const claimsOdc = data?.dependents?.some((entry) => entry.qualifiesForODC);
  if (claimsCtc || claimsOdc) {
    const filers = status === "mfj" ? [["primary", data], ["spouse", data?.spouse]] as const : [["primary", data]] as const;
    for (const [label, filer] of filers) {
      if (filer?.employmentValidSsnIssuedByDueDate === true && filer.tinIssuedByDueDate === false) errors[`${label}Identity`] = "A timely employment-valid SSN and an untimely taxpayer ID are conflicting answers";
      if (filer?.employmentValidSsnIssuedByDueDate !== true && typeof filer?.tinIssuedByDueDate !== "boolean") errors[`${label}Tin`] = `Confirm ${label === "primary" ? "your" : "your spouse's"} timely taxpayer ID requirement`;
    }
    if (claimsCtc && !filers.some(([, filer]) => filer?.employmentValidSsnIssuedByDueDate === true)
      && filers.some(([, filer]) => typeof filer?.employmentValidSsnIssuedByDueDate !== "boolean")) errors.ctcFilerSsn = "Confirm the filer employment-valid SSN requirement for the child credit";
    if (claimsCtc && typeof data?.childTaxCredit?.bonaFidePuertoRicoResident !== "boolean") errors.ctcPuertoRico = "Confirm bona fide Puerto Rico residency for the child credit";
  }
  if (claimsCtc || claimsOdc || [data?.childTaxCredit?.possessionIncomeExclusion, data?.childTaxCredit?.puertoRicoExcludedIncome, data?.childTaxCredit?.form4563ExcludedIncome].some((value) => value?.trim())) {
    try { childCreditExclusionValues(data?.childTaxCredit); } catch (error) { errors.ctcPossessionIncome = error instanceof Error ? error.message : "Enter actual possession exclusions"; }
  }
  for (const [field, value] of Object.entries(data?.childTaxCredit ?? {})) {
    if (field === "bonaFidePuertoRicoResident" || typeof value !== "string" || !value.trim()) continue;
    try { if (parseGuidedCurrency(value).lt(0)) errors[field] = "Enter a nonnegative actual amount"; }
    catch { errors[field] = "Enter a valid decimal amount"; }
  }
  const taxIds = [data?.ssn, ...(status === "mfj" || status === "mfs" ? [data?.spouse?.ssn] : []), ...(data?.dependents ?? []).map((entry) => entry.ssn)]
    .filter((value): value is string => !!value).map((value) => value.replace(/-/g, ""));
  if (new Set(taxIds).size !== taxIds.length) errors.taxIds = "Each taxpayer, spouse and dependent must have a different taxpayer ID";
  Object.assign(errors, standardDeductionFactErrors(data?.standardDeductionFacts, status, taxYear, data));
  Object.assign(errors, eicClaimantFactErrors(data, status, taxYear));
  return errors;
}
