import { isActualDate } from "@/utils/civil-date";

export function combineGivenNameWithMiddleInitial(
  firstName: string | undefined,
  middleName: string | undefined,
) {
  const first = firstName?.trim() ?? "";
  const middle = middleName?.trim() ?? "";

  if (!first) {
    return "";
  }

  if (!middle) {
    return first;
  }

  const middleInitial = middle.replace(/[^A-Za-z]/g, "").charAt(0).toUpperCase();
  return middleInitial ? `${first} ${middleInitial}` : first;
}

export function isActualBirthDate(value: string | undefined, taxYear?: number | null): value is string {
  return !!value && isActualDate(value) && value >= "1850-01-01" && (!taxYear || value <= `${taxYear}-12-31`);
}

export function hasTaxId(value: string | undefined): boolean {
  return !!value && /^\d{3}-?\d{2}-?\d{4}$/.test(value) && value.replace(/-/g, "") !== "000000000";
}
