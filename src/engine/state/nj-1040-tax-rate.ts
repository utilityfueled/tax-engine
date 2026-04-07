/**
 * New Jersey NJ-1040 tax rate computation.
 * Spec: spec/state/nj-1040-tax-rate.yaml
 *
 * Computes NJ income tax from NJ taxable income using progressive rate tables.
 * Table A: Single / Married Filing Separately
 * Table B: Married Filing Jointly / Head of Household / Qualifying Surviving Spouse
 */

import Decimal from "decimal.js";
import {
  getNJResidentConstants,
  type FilingStatus,
  type TaxBracket,
} from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { assertSupportedNJTaxYear } from "@/engine/state/nj-tax-year.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, zeroFloor } from "@/utils/decimal.js";

export type NJTaxRateTable = "A" | "B";

export interface NJTaxRateInput {
  taxableIncome: Decimal | string | number;
  filingStatus: FilingStatus;
  taxYear: number;
}

export interface NJTaxRateResult {
  taxableIncome: Decimal;
  tableCode: NJTaxRateTable;
  tax: Decimal;
  effectiveRate: Decimal;
  lines: CalculatedLine[];
}

function getTableCode(filingStatus: FilingStatus): NJTaxRateTable {
  switch (filingStatus) {
    case "single":
    case "married_filing_separately":
      return "A";
    case "married_filing_jointly":
    case "head_of_household":
    case "qualifying_surviving_spouse":
      return "B";
  }
}

function computeProgressiveTax(taxableIncome: Decimal, brackets: TaxBracket[]): Decimal {
  let totalTax = new Decimal(0);

  for (const row of brackets) {
    if (taxableIncome.lessThanOrEqualTo(row.min)) break;

    const taxableInBracket = row.max === null
      ? taxableIncome.minus(row.min)
      : Decimal.min(taxableIncome, row.max).minus(row.min);

    totalTax = totalTax.plus(taxableInBracket.times(row.rate));
  }

  return totalTax;
}

function getTaxTableMidpoint(taxableIncome: Decimal): Decimal {
  return taxableIncome.dividedToIntegerBy(50).times(50).plus(25);
}

export function calculateNJ1040TaxRate(input: NJTaxRateInput): NJTaxRateResult {
  assertSupportedNJTaxYear(input.taxYear, "NJ-1040 tax rate rules");
  const taxRateTables = getNJResidentConstants(input.taxYear).taxRateTables;

  const taxableIncome = zeroFloor(d(input.taxableIncome));
  const tableCode = getTableCode(input.filingStatus);
  const brackets = tableCode === "A" ? taxRateTables.tableA : taxRateTables.tableB;
  const usesTaxTable = taxableIncome.lessThan(100000);
  const taxComputationIncome = usesTaxTable
    ? getTaxTableMidpoint(taxableIncome)
    : taxableIncome;

  const audit = new AuditTrail();

  audit.record(
    "NJ-1040",
    "42",
    "New Jersey taxable income",
    taxableIncome,
    "NJ-1040 line 42 taxable income after the property tax deduction"
  );

  audit.record(
    "NJ-1040",
    "43-table",
    "Selected NJ tax rate table",
    new Decimal(tableCode === "A" ? 1 : 2),
    "Table A for single/MFS; Table B for MFJ/HOH/QSS",
    {
      "Filing status": input.filingStatus,
      "Table code": tableCode,
    }
  );

  const taxBeforeRounding = computeProgressiveTax(taxComputationIncome, brackets);
  const tax = roundDollar(taxBeforeRounding);

  audit.record(
    "NJ-1040",
    "43",
    "Tax on amount on line 42",
    tax,
    usesTaxTable
      ? "Published NJ tax table path for taxable income under $100,000, rounded to nearest dollar"
      : "NJ tax rate schedule applied to Line 42, rounded to nearest dollar",
    {
      "Line 42": taxableIncome,
      "Table": tableCode,
      "Tax method": usesTaxTable ? "Tax table" : "Rate schedule",
      "Tax computation income": taxComputationIncome.toString(),
      "Tax before rounding": taxBeforeRounding.toString(),
    }
  );

  const effectiveRate = taxableIncome.isZero()
    ? new Decimal(0)
    : tax.dividedBy(taxableIncome);

  return {
    taxableIncome,
    tableCode,
    tax,
    effectiveRate,
    lines: audit.getLines(),
  };
}
