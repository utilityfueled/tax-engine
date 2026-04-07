/**
 * New York IT-201 tax computation (Line 39).
 * Implements the NY State tax rate schedule and high-income recapture worksheets.
 * Spec: spec/state/ny-it201-tax-computation.yaml
 */

import Decimal from "decimal.js";
import {
  NY_IT201_RESIDENT_CONSTANTS,
  type FilingStatus,
  type NYIT201BracketGroup,
  type NYIT201RecaptureWorksheet,
  type NYIT201ResidentYearConstants,
  type NYIT201TaxBracket,
} from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, min } from "@/utils/decimal.js";

/* ---------- Types ---------- */

export type NYTaxBracket = NYIT201TaxBracket;

/** Parameters for one recapture worksheet */
export type NYRecaptureWorksheet = NYIT201RecaptureWorksheet;
export type NYBracketGroup = NYIT201BracketGroup;

export type NYTaxRateScheduleYear = Pick<
  NYIT201ResidentYearConstants,
  "taxTableMaxIncome" | "recaptureAgiThreshold" | "recaptureWorksheets"
> & {
  brackets: Record<NYBracketGroup, NYTaxBracket[]>;
};

export interface NYIT201TaxComputationInput {
  /** New York adjusted gross income (IT-201 line 33) */
  nyAgi: Decimal | string | number;
  /** New York taxable income (IT-201 line 38) */
  taxableIncome: Decimal | string | number;
  filingStatus: FilingStatus;
  taxYear: number;
}

export interface NYIT201TaxComputationResult {
  nyAgi: Decimal;
  taxableIncome: Decimal;
  bracketGroup: NYBracketGroup;
  computationMethod: "tax_table" | "rate_schedule" | "recapture_worksheet" | "flat_rate";
  rateScheduleTax: Decimal;
  recaptureAmount: Decimal;
  worksheetNumber: number | null;
  tax: Decimal;
  lines: CalculatedLine[];
}

/* ---------- Constants ---------- */

const ZERO = new Decimal(0);

export const NY_TAX_RATE_SCHEDULES: Record<number, NYTaxRateScheduleYear> =
  Object.fromEntries(
    Object.entries(NY_IT201_RESIDENT_CONSTANTS).map(([year, constants]) => [
      Number(year),
      {
        taxTableMaxIncome: constants.taxTableMaxIncome,
        recaptureAgiThreshold: constants.recaptureAgiThreshold,
        brackets: constants.taxBrackets,
        recaptureWorksheets: constants.recaptureWorksheets,
      },
    ])
  ) as Record<number, NYTaxRateScheduleYear>;

/* ---------- Helpers ---------- */

export function getBracketGroup(filingStatus: FilingStatus): NYBracketGroup {
  switch (filingStatus) {
    case "married_filing_jointly":
    case "qualifying_surviving_spouse":
      return "mfj_qss";
    case "single":
    case "married_filing_separately":
      return "single_mfs";
    case "head_of_household":
      return "hoh";
  }
}

/**
 * Compute tax from the NY State tax rate schedule brackets.
 * Works for any taxable income amount (including below the tax table threshold).
 */
export function computeRateScheduleTax(
  taxableIncome: Decimal,
  brackets: NYTaxBracket[]
): Decimal {
  if (taxableIncome.lessThanOrEqualTo(ZERO)) return ZERO;

  const selected = brackets.find((b) => {
    const aboveLower = taxableIncome.greaterThan(b.lowerBound);
    const withinUpper = b.upperBound === null || taxableIncome.lessThanOrEqualTo(b.upperBound);
    return aboveLower && withinUpper;
  });

  // Exact zero or at lower bound of first bracket
  if (!selected) {
    if (taxableIncome.equals(ZERO)) return ZERO;
    // At exactly a lower bound — use that bracket at 0 excess
    const atBoundary = brackets.find((b) => taxableIncome.equals(b.lowerBound));
    if (atBoundary) return atBoundary.baseTax;
    throw new Error(`No NY tax bracket matched taxable income ${taxableIncome.toString()}`);
  }

  const excess = taxableIncome.minus(selected.lowerBound);
  return selected.baseTax.plus(excess.times(selected.rate));
}

interface NYTaxTableBand {
  lowerBound: Decimal;
  upperBound: Decimal;
  midpoint: Decimal;
}

function getTaxTableBand(taxableIncome: Decimal): NYTaxTableBand {
  if (taxableIncome.lessThan(new Decimal(13))) {
    return {
      lowerBound: ZERO,
      upperBound: new Decimal(13),
      midpoint: new Decimal("6.5"),
    };
  }

  if (taxableIncome.lessThan(new Decimal(25))) {
    return {
      lowerBound: new Decimal(13),
      upperBound: new Decimal(25),
      midpoint: new Decimal(19),
    };
  }

  if (taxableIncome.lessThan(new Decimal(50))) {
    return {
      lowerBound: new Decimal(25),
      upperBound: new Decimal(50),
      midpoint: new Decimal("37.5"),
    };
  }

  if (taxableIncome.lessThan(new Decimal(100))) {
    return {
      lowerBound: new Decimal(50),
      upperBound: new Decimal(100),
      midpoint: new Decimal(75),
    };
  }

  const lowerBound = taxableIncome.divToInt(new Decimal(50)).times(50);
  return {
    lowerBound,
    upperBound: lowerBound.plus(50),
    midpoint: lowerBound.plus(25),
  };
}

export function computeTaxTableTax(
  taxableIncome: Decimal,
  brackets: NYTaxBracket[]
): Decimal {
  if (taxableIncome.lessThanOrEqualTo(ZERO)) return ZERO;

  const roundedTaxableIncome = roundDollar(taxableIncome);
  const band = getTaxTableBand(roundedTaxableIncome);
  return roundDollar(computeRateScheduleTax(band.midpoint, brackets));
}

/**
 * Find the appropriate recapture worksheet for the given AGI and taxable income.
 */
function findRecaptureWorksheet(
  nyAgi: Decimal,
  taxableIncome: Decimal,
  worksheets: NYRecaptureWorksheet[]
): NYRecaptureWorksheet | null {
  // Process worksheets from highest to lowest to find the right one.
  // The worksheet must match BOTH the AGI range and the taxable income range.
  // Start with the flat-rate worksheet (highest AGI).
  for (let i = worksheets.length - 1; i >= 0; i--) {
    const ws = worksheets[i];
    const agiAboveFloor = nyAgi.greaterThan(ws.agiFloor);
    const agiBelowCeiling = ws.agiCeiling === null || nyAgi.lessThanOrEqualTo(ws.agiCeiling);
    const tiAboveMin = taxableIncome.greaterThan(ws.minTaxableIncome) || ws.minTaxableIncome.equals(ZERO);
    const tiBelowMax = ws.maxTaxableIncome === null || taxableIncome.lessThanOrEqualTo(ws.maxTaxableIncome);

    if (agiAboveFloor && agiBelowCeiling && tiAboveMin && tiBelowMax) {
      return ws;
    }
  }
  return null;
}

/**
 * Compute recapture amount from a worksheet.
 */
function computeRecapture(
  nyAgi: Decimal,
  taxableIncome: Decimal,
  rateScheduleTax: Decimal,
  worksheet: NYRecaptureWorksheet
): { recaptureAmount: Decimal; finalTax: Decimal } {
  // Flat-rate worksheets (AGI > $25M): tax = TI × 10.9%
  if (worksheet.isFlatRate) {
    const flatTax = taxableIncome.times(new Decimal("0.109"));
    return { recaptureAmount: flatTax.minus(rateScheduleTax), finalTax: flatTax };
  }

  // First-tier simple-rate worksheets (WS 1, 7, 12):
  // Compute line 3 as the simple-rate tax. Phase in the difference between line 3
  // and line 4 (rate schedule tax). If AGI ≥ stop threshold, line 9 equals line 3.
  if (worksheet.simpleRate !== null) {
    const simpleRateTax = taxableIncome.times(worksheet.simpleRate);
    const recaptureBenefit = simpleRateTax.minus(rateScheduleTax);

    if (worksheet.simpleRateStopAgi !== null && nyAgi.greaterThanOrEqualTo(worksheet.simpleRateStopAgi)) {
      // AGI at or above stop threshold: enter the line 3 amount on line 9.
      return { recaptureAmount: recaptureBenefit, finalTax: simpleRateTax };
    }

    // Phase in line 5 over the $50,000 AGI band.
    const excessAgi = nyAgi.minus(worksheet.agiFloor);
    const ratio = min(excessAgi.div(new Decimal(50000)), new Decimal(1))
      .toDecimalPlaces(4, Decimal.ROUND_DOWN);
    const recaptureAmount = recaptureBenefit.times(ratio);
    return { recaptureAmount, finalTax: rateScheduleTax.plus(recaptureAmount) };
  }

  // Standard recapture worksheets (WS 2-5, 8-10, 13-15):
  // Line 4: Recapture base
  // Line 5: Incremental benefit
  // Line 6: Excess of AGI over threshold
  // Line 7: Lesser of line 6 or $50,000
  // Line 8: Line 7 / $50,000 rounded to 4th decimal
  // Line 9: Line 5 × Line 8
  // Line 10: Lines 3 + 4 + 9 = final tax
  const recaptureBase = worksheet.recaptureBase;
  const incrementalBenefit = worksheet.incrementalBenefit;
  const excessAgi = nyAgi.minus(worksheet.excessAgiThreshold);
  const lesserOf = min(excessAgi, new Decimal(50000));
  const ratio = lesserOf.div(new Decimal(50000))
    .toDecimalPlaces(4, Decimal.ROUND_DOWN);
  const phasedBenefit = incrementalBenefit.times(ratio);
  const recaptureAmount = recaptureBase.plus(phasedBenefit);
  return { recaptureAmount, finalTax: rateScheduleTax.plus(recaptureAmount) };
}

/* ---------- Main computation ---------- */

export function calculateNYIT201Tax(
  input: NYIT201TaxComputationInput
): NYIT201TaxComputationResult {
  const constants = NY_TAX_RATE_SCHEDULES[input.taxYear];
  if (!constants) {
    throw new Error(`NY IT-201 tax computation not available for tax year ${input.taxYear}`);
  }

  const rawNyAgi = d(input.nyAgi);
  const rawTaxableIncome = d(input.taxableIncome);
  const nyAgi = roundDollar(rawNyAgi);
  const taxableIncome = roundDollar(rawTaxableIncome);
  const bracketGroup = getBracketGroup(input.filingStatus);
  const brackets = constants.brackets[bracketGroup];

  const audit = new AuditTrail();

  audit.record("NY-IT201", "33", "New York adjusted gross income", nyAgi,
    "Federal AGI + NY additions - NY subtractions, rounded to whole dollars for IT-201 line 33", {
      "Raw input": rawNyAgi.toString(),
    });

  audit.record("NY-IT201", "38", "New York taxable income", taxableIncome,
    "NY AGI - standard/itemized deduction - dependent exemptions, rounded to whole dollars for IT-201 line 38", {
      "Raw input": rawTaxableIncome.toString(),
    });

  const usesTaxTable = nyAgi.lessThanOrEqualTo(constants.recaptureAgiThreshold)
    && taxableIncome.greaterThanOrEqualTo(ZERO)
    && taxableIncome.lessThan(constants.taxTableMaxIncome);

  if (usesTaxTable) {
    const taxTableBand = getTaxTableBand(taxableIncome);
    const taxTableTax = computeTaxTableTax(taxableIncome, brackets);

    audit.record("NY-IT201", "39-TT", "Tax table tax on taxable income", taxTableTax,
      "Lookup official 2025 NY tax table by taxable income range and filing status", {
        "Bracket group": bracketGroup,
        "Filing status": input.filingStatus,
        "Table range lower bound": taxTableBand.lowerBound.toString(),
        "Table range upper bound": taxTableBand.upperBound.toString(),
        "Table midpoint": taxTableBand.midpoint.toString(),
      });

    audit.record("NY-IT201", "39", "New York State tax", taxTableTax,
      "Rounded tax table amount", {
        "Computation method": "tax_table",
      });

    return {
      nyAgi,
      taxableIncome,
      bracketGroup,
      computationMethod: "tax_table",
      rateScheduleTax: taxTableTax,
      recaptureAmount: ZERO,
      worksheetNumber: null,
      tax: taxTableTax,
      lines: audit.getLines(),
    };
  }

  // Step 1: Compute rate schedule tax
  const rateScheduleTax = computeRateScheduleTax(taxableIncome, brackets);
  audit.record("NY-IT201", "39-RS", "Rate schedule tax on taxable income", rateScheduleTax,
    "Apply NY State tax rate schedule brackets to taxable income", {
      "Bracket group": bracketGroup,
      "Filing status": input.filingStatus,
    });

  // Step 2: Determine if recapture applies
  let computationMethod: "tax_table" | "rate_schedule" | "recapture_worksheet" | "flat_rate" = "rate_schedule";
  let recaptureAmount = ZERO;
  let worksheetNumber: number | null = null;
  let finalTax = rateScheduleTax;

  if (nyAgi.greaterThan(constants.recaptureAgiThreshold)) {
    const worksheets = constants.recaptureWorksheets[bracketGroup];
    const worksheet = findRecaptureWorksheet(nyAgi, taxableIncome, worksheets);

    if (worksheet) {
      worksheetNumber = worksheet.worksheetNumber;

      if (worksheet.isFlatRate) {
        computationMethod = "flat_rate";
        const flatTax = taxableIncome.times(new Decimal("0.109"));
        recaptureAmount = flatTax.minus(rateScheduleTax);
        finalTax = flatTax;
      } else {
        computationMethod = "recapture_worksheet";
        const result = computeRecapture(nyAgi, taxableIncome, rateScheduleTax, worksheet);
        recaptureAmount = result.recaptureAmount;
        finalTax = result.finalTax;
      }

      audit.record("NY-IT201", "39-RC", "Recapture amount", recaptureAmount,
        `Tax computation worksheet ${worksheetNumber}`, {
          "Worksheet number": worksheetNumber.toString(),
          "Computation method": computationMethod,
          "NY AGI": nyAgi.toString(),
        });
    }
  }

  const tax = roundDollar(finalTax);
  audit.record("NY-IT201", "39", "New York State tax", tax,
    "Rounded to nearest dollar", {
      "Rate schedule tax": rateScheduleTax.toString(),
      "Recapture amount": recaptureAmount.toString(),
      "Computation method": computationMethod,
    });

  return {
    nyAgi,
    taxableIncome,
    bracketGroup,
    computationMethod,
    rateScheduleTax,
    recaptureAmount,
    worksheetNumber,
    tax,
    lines: audit.getLines(),
  };
}
