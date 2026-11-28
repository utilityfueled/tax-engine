import { isActualDate } from "@/utils/civil-date.js";

export function requireObserved2026QcdTransferDate(distributionDate: string | undefined, today: string, asOfDate = today): string {
  if (!isActualDate(asOfDate) || asOfDate > today) {
    throw new Error("2026 Form 1099-R QCD requires a valid calculation as-of date on or before today.");
  }
  if (!distributionDate?.startsWith("2026-") || !isActualDate(distributionDate)) {
    throw new Error("2026 Form 1099-R QCD requires the actual transfer date in this return year.");
  }
  if (distributionDate > asOfDate) {
    throw new Error("2026 Form 1099-R QCD requires the actual transfer date on or before the calculation as-of date.");
  }
  return distributionDate;
}
