import { amountError, hasEnteredAmount } from "./guided-required-facts";

export interface CompensationReportingData {
  sourceTaxYear?: string;
  box12CodeTP?: string;
  box12CodeTT?: string;
  cashTips?: string;
  qualifiedOvertimeCompensation?: string;
  treasuryTippedOccupationCodes?: string[];
}
export function compensationReportingErrors(data: CompensationReportingData, returnYear?: number | null): Record<string, string> {
  const errors: Record<string, string> = {};
  if (data.sourceTaxYear?.trim() && (!/^\d{4}$/.test(data.sourceTaxYear.trim()) || (returnYear != null && Number(data.sourceTaxYear) !== returnYear))) errors.sourceTaxYear = "Enter the original document tax year and reconcile it with the selected return year.";
  for (const field of ["box12CodeTP", "box12CodeTT", "cashTips", "qualifiedOvertimeCompensation"] as const) {
    if (!hasEnteredAmount(data[field])) continue;
    const error = amountError(data[field], `original reported ${field}`); if (error) errors[field] = error;
  }
  const codes = data.treasuryTippedOccupationCodes;
  if (codes !== undefined && (codes.length > 2 || codes.some(code => !/^\d{3}$/.test(code)) || new Set(codes).size !== codes.length)) errors.treasuryTippedOccupationCodes = "Enter up to two distinct three-digit tipped occupation codes exactly as reported.";
  return errors;
}
export function actualCompensationSourceYear(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  if (!/^\d{4}$/.test(value.trim())) throw new Error("Original compensation source year is invalid.");
  return Number(value);
}
