import { isActualDate } from "@/utils/civil-date";
import type { FilingStatus, PersonalInfoData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { guidedSourceValuesChanged } from "./guided-source-confirmation";
import { hasTaxId, isActualBirthDate } from "./guided-taxpayer-identity";

export { assertSupportedWholeReturnAccountingPeriod } from "@/engine/federal-return-admission";

export interface ShortAccountingPeriodData {
  startsOn: string;
  endsOn: string;
  sourceReference: string;
  sourceFactsConfirmed: boolean | null;
}

export interface StandardDeductionData {
  primaryBlind?: boolean | null; spouseBlind?: boolean | null;
  primaryCanBeClaimedAsDependent?: boolean | null; spouseCanBeClaimedAsDependent?: boolean | null;
  spouseItemizes?: boolean | null; dualStatusAlien?: boolean | null; nonresidentAlien?: boolean | null;
  residentJointElection?: boolean | null; shortTaxYear?: boolean | null;
  shortAccountingPeriod?: ShortAccountingPeriodData;
  dependentEarnedIncome?: string;
  primaryDeceased?: boolean | null; primaryDeathDate?: string;
  spouseDeceased?: boolean | null; spouseDeathDate?: string;
  claimSpouseAdditionalDeduction?: boolean | null; spouseHasGrossIncome?: boolean | null; spouseFilesReturn?: boolean | null;
}

function shortPeriodOwner(personal: PersonalInfoData | undefined) {
  return {
    firstName: personal?.firstName?.trim(),
    middleName: personal?.middleName?.trim() || undefined,
    lastName: personal?.lastName?.trim(),
    ssn: personal?.ssn?.replace(/-/g, "") ?? "",
    dateOfBirth: personal?.dateOfBirth,
  };
}

export function readGuidedShortAccountingPeriod(
  data: StandardDeductionData | undefined,
  status: FilingStatus | null,
  taxYear: number | null | undefined,
  personal: PersonalInfoData | undefined,
) {
  const period = data?.shortAccountingPeriod;
  if (status !== "single" || data?.shortTaxYear !== true || data.primaryDeceased !== false || data.primaryDeathDate?.trim() ||
      period?.sourceFactsConfirmed !== true || typeof period.sourceReference !== "string" || !period.sourceReference.trim() ||
      !isActualDate(period.startsOn) || !isActualDate(period.endsOn)) return null;

  const owner = shortPeriodOwner(personal);
  if (!owner.firstName || !owner.lastName || !hasTaxId(personal?.ssn) || !isActualBirthDate(owner.dateOfBirth, taxYear)) return null;

  const formerClose = new Date(`${period.startsOn}T00:00:00Z`);
  if (formerClose.getUTCFullYear() !== taxYear || formerClose.getUTCDate() !== 1) return null;

  const newStart = new Date(`${period.endsOn}T00:00:00Z`);
  newStart.setUTCDate(newStart.getUTCDate() + 1);
  const months = 12 * (newStart.getUTCFullYear() - formerClose.getUTCFullYear()) + newStart.getUTCMonth() - formerClose.getUTCMonth();
  if (newStart.getUTCDate() !== 1 || months < 1 || months > 11) return null;

  formerClose.setUTCDate(0);
  const formerYearEndsOn = formerClose.toISOString().slice(0, 10);
  if (owner.dateOfBirth > formerYearEndsOn) return null;
  return { formerYearEndsOn, newYearStartsOn: newStart.toISOString().slice(0, 10), months };
}

export function withoutPrivateShortAccountingPeriod(personal: PersonalInfoData | undefined): PersonalInfoData | undefined {
  const facts = personal?.standardDeductionFacts;
  if (!personal || !facts || typeof facts !== "object" || !("shortAccountingPeriod" in facts)) return personal;

  const standardDeductionFacts = { ...facts };
  delete standardDeductionFacts.shortAccountingPeriod;
  return { ...personal, standardDeductionFacts };
}

export function invalidateEditedShortAccountingPeriod(
  previous: PersonalInfoData | undefined,
  next: PersonalInfoData,
  status: FilingStatus | null,
  taxYear: number | null | undefined,
): PersonalInfoData {
  const facts = next.standardDeductionFacts;
  const period = facts?.shortAccountingPeriod;
  if (period?.sourceFactsConfirmed !== true) return next;

  if (!guidedSourceValuesChanged(previous?.standardDeductionFacts?.shortAccountingPeriod, period) &&
      !guidedSourceValuesChanged(shortPeriodOwner(previous), shortPeriodOwner(next)) &&
      readGuidedShortAccountingPeriod(facts, status, taxYear, next)) return next;

  return { ...next, standardDeductionFacts: { ...facts, shortAccountingPeriod: { ...period, sourceFactsConfirmed: null } } };
}

const boolFields = ["primaryBlind", "spouseBlind", "primaryCanBeClaimedAsDependent", "spouseCanBeClaimedAsDependent", "spouseItemizes", "dualStatusAlien", "nonresidentAlien", "residentJointElection", "shortTaxYear", "claimSpouseAdditionalDeduction", "spouseHasGrossIncome", "spouseFilesReturn"] as const;
function actualDate(value: string | undefined, year?: number | null, birth?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && (!year || value.startsWith(`${year}-`)) && (!birth || value >= birth);
}
export function standardDeductionFactErrors(data: StandardDeductionData | undefined, status?: FilingStatus | null, taxYear?: number | null, personal?: PersonalInfoData): Record<string, string> {
  const errors: Record<string, string> = {};
  const required: (keyof StandardDeductionData)[] = ["primaryBlind", "primaryCanBeClaimedAsDependent", "primaryDeceased", "dualStatusAlien", "nonresidentAlien", "shortTaxYear"];
  if (status === "mfj") required.push("spouseBlind", "spouseCanBeClaimedAsDependent", "spouseDeceased");
  if (status === "mfs") required.push("spouseItemizes", "claimSpouseAdditionalDeduction");
  if (status === "mfj" && (data?.dualStatusAlien || data?.nonresidentAlien)) required.push("residentJointElection");
  if (status === "mfs" && data?.claimSpouseAdditionalDeduction) {
    required.push("spouseBlind", "spouseCanBeClaimedAsDependent", "spouseDeceased", "spouseHasGrossIncome", "spouseFilesReturn");
    if (data.spouseCanBeClaimedAsDependent || data.spouseHasGrossIncome || data.spouseFilesReturn) errors.spouseAdditional = "The separate-return spouse extra deduction conflicts with the actual spouse dependency, gross-income or filing facts.";
  }
  for (const key of required) if (typeof data?.[key] !== "boolean") errors[`standard-${key}`] = "Confirm each actual standard-deduction eligibility, blindness, dependency and death-status fact.";
  for (const who of ["primary", ...(status === "mfj" || (status === "mfs" && data?.claimSpouseAdditionalDeduction) ? ["spouse"] : [])] as const) {
    const deceased = who === "primary" ? data?.primaryDeceased : data?.spouseDeceased;
    const death = who === "primary" ? data?.primaryDeathDate : data?.spouseDeathDate;
    const birth = who === "primary" ? personal?.dateOfBirth : personal?.spouse?.dateOfBirth;
    if (deceased === true && !actualDate(death, taxYear, birth)) errors[`standard-${who}-death`] = "Enter the actual death date within this return year and on or after birth.";
    if (deceased === false && death?.trim()) errors[`standard-${who}-death`] = "Clear the death date or correct the answer that this filer was alive at year end.";
  }
  if (data?.primaryCanBeClaimedAsDependent || (status === "mfj" && data?.spouseCanBeClaimedAsDependent) || data?.dependentEarnedIncome?.trim()) {
    try { if (!data?.dependentEarnedIncome?.trim()) throw new Error("missing"); parseGuidedCurrency(data.dependentEarnedIncome); }
    catch { errors.standardDependentIncome = "Enter the actual signed dependent earned-income worksheet amount, including zero."; }
  }
  return errors;
}
export function buildStandardDeductionFacts(data: StandardDeductionData | undefined, status?: FilingStatus | null, taxYear?: number | null, personal?: PersonalInfoData) {
  const errors = standardDeductionFactErrors(data, status, taxYear, personal);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const facts: Partial<Record<typeof boolFields[number], boolean>> = {};
  for (const key of boolFields) if (typeof data?.[key] === "boolean") facts[key] = data[key] as boolean;
  return { ...facts,
    primaryDeathDate: data?.primaryDeceased ? data.primaryDeathDate : null,
    ...(status === "mfj" || (status === "mfs" && data?.claimSpouseAdditionalDeduction) ? { spouseDeathDate: data?.spouseDeceased ? data.spouseDeathDate : null } : {}),
    ...(data?.dependentEarnedIncome?.trim() ? { dependentEarnedIncome: data.dependentEarnedIncome.trim().replace(/,/g, "") } : {}),
  };
}
