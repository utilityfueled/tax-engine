import { TAX_CONSTANTS } from "@/models/constants.js";

const SUPPORTED_NJ_TAX_YEARS = new Set(
  Object.entries(TAX_CONSTANTS)
    .filter(([, yearConstants]) => yearConstants.state?.njResident)
    .map(([year]) => Number(year))
);

export function assertSupportedNJTaxYear(taxYear: number, rulesLabel: string): void {
  if (!SUPPORTED_NJ_TAX_YEARS.has(taxYear)) {
    throw new Error(`${rulesLabel} not available for tax year ${taxYear}`);
  }
}
