/**
 * New York IT-201 withholding totals for lines 72 through 74.
 * Spec: spec/state/ny-it201-withholding.yaml
 */

import Decimal from "decimal.js";
import type { Form1099G, Form1099R, FormW2G, W2 } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";

export interface NYIT201WithholdingInput {
  taxYear: number;
  w2s?: W2[];
  form1099R?: Form1099R[];
  form1099G?: Form1099G[];
  formW2G?: FormW2G[];
  additionalNYStateTaxWithheld?: Decimal | string | number;
  additionalNYCTaxWithheld?: Decimal | string | number;
  additionalYonkersTaxWithheld?: Decimal | string | number;
}

export interface NYIT201WithholdingResult {
  nyStateTaxWithheld: Decimal;
  nycTaxWithheld: Decimal;
  yonkersTaxWithheld: Decimal;
  lines: CalculatedLine[];
}

const SUPPORTED_TAX_YEARS = new Set([2025]);

function requireSupportedTaxYear(taxYear: number): void {
  if (!SUPPORTED_TAX_YEARS.has(taxYear)) {
    throw new Error(`NY IT-201 withholding not available for tax year ${taxYear}`);
  }
}

function normalizeKey(value: string | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z]/g, "");
}

function isNewYorkState(value: string | undefined): boolean {
  const key = normalizeKey(value);
  return key === "NY" || key === "NEWYORK";
}

function classifyLocality(value: string | undefined): "nyc" | "yonkers" | null {
  const key = normalizeKey(value);
  switch (key) {
    case "NYC":
    case "NEWYORKCITY":
    case "NEWYORKCITYRESIDENTTAX":
      return "nyc";
    case "YONKERS":
    case "YONKERSRESIDENTTAX":
    case "CITYOFYONKERS":
      return "yonkers";
    default:
      return null;
  }
}

function nonNegativeAmount(
  value: Decimal | string | number | undefined,
  description: string
): Decimal {
  const amount = d(value);
  if (amount.lessThan(0)) {
    throw new Error(`${description} must be non-negative`);
  }
  return amount;
}

function sumW2StateWithholding(w2s: W2[]): Decimal {
  return w2s.reduce((total, form) => {
    const withholding = nonNegativeAmount(form.stateTaxWithheld, "NY IT-201 W-2 state withholding");
    return isNewYorkState(form.state) ? total.plus(withholding) : total;
  }, d(0));
}

function sum1099RStateWithholding(forms: Form1099R[]): Decimal {
  return forms.reduce((total, form) => {
    const withholding = nonNegativeAmount(form.stateTaxWithheld, "NY IT-201 Form 1099-R state withholding");
    return isNewYorkState(form.state) ? total.plus(withholding) : total;
  }, d(0));
}

function sum1099GStateWithholding(forms: Form1099G[]): Decimal {
  return forms.reduce((total, form) => {
    const withholding = nonNegativeAmount(form.stateWithheld, "NY IT-201 Form 1099-G state withholding");
    return isNewYorkState(form.state) ? total.plus(withholding) : total;
  }, d(0));
}

function sumW2GStateWithholding(forms: FormW2G[]): Decimal {
  return forms.reduce((total, form) => {
    const withholding = nonNegativeAmount(form.stateWithheld, "NY IT-201 Form W-2G state withholding");
    return isNewYorkState(form.state) ? total.plus(withholding) : total;
  }, d(0));
}

function sumW2LocalWithholding(w2s: W2[], jurisdiction: "nyc" | "yonkers"): Decimal {
  return w2s.reduce((total, form) => {
    const withholding = nonNegativeAmount(form.localTaxWithheld, "NY IT-201 W-2 local withholding");
    return classifyLocality(form.locality) === jurisdiction ? total.plus(withholding) : total;
  }, d(0));
}

function sum1099RLocalWithholding(forms: Form1099R[], jurisdiction: "nyc" | "yonkers"): Decimal {
  return forms.reduce((total, form) => {
    const withholding = nonNegativeAmount(form.localTaxWithheld, "NY IT-201 Form 1099-R local withholding");
    return classifyLocality(form.locality) === jurisdiction ? total.plus(withholding) : total;
  }, d(0));
}

export function calculateNYIT201Withholding(
  input: NYIT201WithholdingInput
): NYIT201WithholdingResult {
  requireSupportedTaxYear(input.taxYear);

  const w2s = input.w2s ?? [];
  const form1099R = input.form1099R ?? [];
  const form1099G = input.form1099G ?? [];
  const formW2G = input.formW2G ?? [];

  const w2NYStateWithholding = sumW2StateWithholding(w2s);
  const form1099RNYStateWithholding = sum1099RStateWithholding(form1099R);
  const form1099GNYStateWithholding = sum1099GStateWithholding(form1099G);
  const formW2GNYStateWithholding = sumW2GStateWithholding(formW2G);
  const directLine72Additions = nonNegativeAmount(
    input.additionalNYStateTaxWithheld,
    "NY IT-201 line 72 additional withholding"
  );
  const nyStateTaxWithheld = sum(
    w2NYStateWithholding,
    form1099RNYStateWithholding,
    form1099GNYStateWithholding,
    formW2GNYStateWithholding,
    directLine72Additions
  );

  const w2NYCWithholding = sumW2LocalWithholding(w2s, "nyc");
  const form1099RNYCWithholding = sum1099RLocalWithholding(form1099R, "nyc");
  const directLine73Additions = nonNegativeAmount(
    input.additionalNYCTaxWithheld,
    "NY IT-201 line 73 additional withholding"
  );
  const nycTaxWithheld = sum(
    w2NYCWithholding,
    form1099RNYCWithholding,
    directLine73Additions
  );

  const w2YonkersWithholding = sumW2LocalWithholding(w2s, "yonkers");
  const form1099RYonkersWithholding = sum1099RLocalWithholding(form1099R, "yonkers");
  const directLine74Additions = nonNegativeAmount(
    input.additionalYonkersTaxWithheld,
    "NY IT-201 line 74 additional withholding"
  );
  const yonkersTaxWithheld = sum(
    w2YonkersWithholding,
    form1099RYonkersWithholding,
    directLine74Additions
  );

  const audit = new AuditTrail();
  audit.record(
    "NY-IT201",
    "72",
    "NY State tax withheld",
    nyStateTaxWithheld,
    "W-2 NY withholding + 1099-R NY withholding + 1099-G NY withholding + W-2G NY withholding + direct line 72 additions",
    {
      "W-2 NY withholding": w2NYStateWithholding,
      "1099-R NY withholding": form1099RNYStateWithholding,
      "1099-G NY withholding": form1099GNYStateWithholding,
      "W-2G NY withholding": formW2GNYStateWithholding,
      "Direct line 72 additions": directLine72Additions,
    }
  );
  audit.record(
    "NY-IT201",
    "73",
    "NYC tax withheld",
    nycTaxWithheld,
    "W-2 NYC withholding + 1099-R NYC withholding + direct line 73 additions",
    {
      "W-2 NYC withholding": w2NYCWithholding,
      "1099-R NYC withholding": form1099RNYCWithholding,
      "Direct line 73 additions": directLine73Additions,
    }
  );
  audit.record(
    "NY-IT201",
    "74",
    "Yonkers tax withheld",
    yonkersTaxWithheld,
    "W-2 Yonkers withholding + 1099-R Yonkers withholding + direct line 74 additions",
    {
      "W-2 Yonkers withholding": w2YonkersWithholding,
      "1099-R Yonkers withholding": form1099RYonkersWithholding,
      "Direct line 74 additions": directLine74Additions,
    }
  );

  return {
    nyStateTaxWithheld,
    nycTaxWithheld,
    yonkersTaxWithheld,
    lines: audit.getLines(),
  };
}
