import { isActualDate } from "@/utils/civil-date";

export function isActualBirthDate(value: string | undefined, taxYear?: number | null): value is string {
  return !!value && isActualDate(value) && value >= "1850-01-01" && (!taxYear || value <= `${taxYear}-12-31`);
}

export function hasTaxId(value: string | undefined): boolean {
  return !!value && /^\d{3}-?\d{2}-?\d{4}$/.test(value) && value.replace(/-/g, "") !== "000000000";
}
