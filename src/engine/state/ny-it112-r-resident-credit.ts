/**
 * New York IT-112-R: Resident Credit for Taxes Paid to Another State.
 * Computes the credit against NY State tax for income taxes paid to other
 * jurisdictions on income also taxed by NY. Prevents double taxation.
 *
 * Spec: spec/state/ny-it112-r-resident-credit.yaml
 * Authority: NY Tax Law Section 620
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, zeroFloor, roundDollar } from "@/utils/decimal.js";

/* ---------- Types ---------- */

/** Tax paid to a single other jurisdiction */
export interface NYIT112ROtherJurisdiction {
  /** Two-letter state abbreviation (e.g., "NJ", "CT", "DC") */
  stateCode: string;
  /** Income sourced to and taxed by the other jurisdiction (Column B, AGI basis) */
  sourcedIncome: Decimal | string | number;
  /** Income tax paid by taxpayer to other jurisdiction (line 24a) */
  taxPaidByTaxpayer: Decimal | string | number;
  /** PTET paid by entity on taxpayer's behalf (line 24b, optional) */
  ptetPaidByEntity?: Decimal | string | number;
}

export interface NYIT112RInput {
  /** Total NY income — Column A line 22 (typically NY AGI from IT-201 line 33) */
  totalNYIncome: Decimal | string | number;
  /** NY State tax from IT-201 line 39 */
  nyStateTax: Decimal | string | number;
  /** Additional tax from IT-201-ATT line 21 included on line 31 */
  otherTaxesBeforeCredits?: Decimal | string | number;
  /** NY State household credit from IT-201 line 40 */
  nyHouseholdCredit: Decimal | string | number;
  /** Other credits applied before the resident credit (for line 32 limitation) */
  otherCreditsBeforeResident?: Decimal | string | number;
  /** Jurisdictions where taxes were paid */
  jurisdictions: NYIT112ROtherJurisdiction[];
}

/** Per-jurisdiction credit detail */
export interface NYIT112RJurisdictionResult {
  stateCode: string;
  /** Line 22B: Income sourced to other jurisdiction */
  sourcedIncome: Decimal;
  /** Line 24: Total tax imposed by other jurisdiction */
  taxImposed: Decimal;
  /** Line 25: NY State tax payable (same for all jurisdictions) */
  nyStateTaxPayable: Decimal;
  /** Line 26: Income ratio (Col B / Col A, 4 decimal places) */
  incomeRatio: Decimal;
  /** Line 27: Proportionate NY tax (line 25 × line 26) */
  proportionateNYTax: Decimal;
  /** Line 28: Allowable credit (min of line 24, line 27), floored at 0 */
  allowableCredit: Decimal;
}

export interface NYIT112RResult {
  totalNYIncome: Decimal;
  nyStateTax: Decimal;
  otherTaxesBeforeCredits: Decimal;
  nyHouseholdCredit: Decimal;
  /** Line 25: NY State tax payable (line 39 - line 40) */
  nyStateTaxPayable: Decimal;
  /** Per-jurisdiction results */
  jurisdictionResults: NYIT112RJurisdictionResult[];
  /** Line 30: Total credit from all jurisdictions */
  totalCredit: Decimal;
  /** Line 31: Tax due before credits */
  taxDueBeforeCredits: Decimal;
  /** Line 32: Other credits applied before resident credit */
  otherCreditsBeforeResident: Decimal;
  /** Line 33: Remaining tax liability */
  remainingTaxLiability: Decimal;
  /** Line 34: Final credit claimed (entered on IT-201 line 41) */
  finalCredit: Decimal;
  lines: CalculatedLine[];
}

/* ---------- Constants ---------- */

const ZERO = new Decimal(0);

/* ---------- Main computation ---------- */

export function calculateNYIT112R(input: NYIT112RInput): NYIT112RResult {
  const totalNYIncome = d(input.totalNYIncome);
  const nyStateTax = d(input.nyStateTax);
  const otherTaxesBeforeCredits = d(input.otherTaxesBeforeCredits);
  const nyHouseholdCredit = d(input.nyHouseholdCredit);
  const otherCreditsBeforeResident = d(input.otherCreditsBeforeResident);
  const audit = new AuditTrail();

  // Line 22A: Total NY income
  audit.record("NY-IT112R", "22A", "Total NY income (Column A)", totalNYIncome,
    "NY AGI from IT-201 line 33");

  // Line 25: NY State tax payable = line 39 - line 40
  const nyStateTaxPayable = zeroFloor(nyStateTax.minus(nyHouseholdCredit));
  audit.record("NY-IT112R", "25", "NY State tax payable", nyStateTaxPayable,
    "IT-201 line 39 - IT-201 line 40 (household credit)", {
      "NY State tax (line 39)": nyStateTax.toString(),
      "Household credit (line 40)": nyHouseholdCredit.toString(),
    });

  // Per-jurisdiction computations
  const jurisdictionResults: NYIT112RJurisdictionResult[] = [];

  for (const jurisdiction of input.jurisdictions) {
    const sourcedIncome = d(jurisdiction.sourcedIncome);
    const taxPaidByTaxpayer = d(jurisdiction.taxPaidByTaxpayer);
    const ptetPaidByEntity = d(jurisdiction.ptetPaidByEntity);

    // Line 22B: Income sourced to other jurisdiction
    audit.record("NY-IT112R", "22B", `Income sourced to ${jurisdiction.stateCode}`,
      sourcedIncome, "Income taxed by other jurisdiction (AGI basis)");

    // Line 24: Total tax imposed
    const taxImposed = taxPaidByTaxpayer.plus(ptetPaidByEntity);
    audit.record("NY-IT112R", "24", `Tax imposed by ${jurisdiction.stateCode}`,
      taxImposed, "Line 24a (taxpayer) + Line 24b (PTET)", {
        "Tax paid by taxpayer": taxPaidByTaxpayer.toString(),
        "PTET paid by entity": ptetPaidByEntity.toString(),
      });

    // Line 26: Income ratio = Col B / Col A (4 decimal places, truncated)
    let incomeRatio: Decimal;
    if (totalNYIncome.lessThanOrEqualTo(ZERO)) {
      incomeRatio = ZERO;
    } else if (sourcedIncome.lessThanOrEqualTo(ZERO)) {
      incomeRatio = ZERO;
    } else {
      incomeRatio = sourcedIncome.div(totalNYIncome)
        .toDecimalPlaces(4, Decimal.ROUND_DOWN);
    }

    audit.record("NY-IT112R", "26", `Income ratio for ${jurisdiction.stateCode}`,
      incomeRatio, "Line 22 Col B / Line 22 Col A (4 decimal places)", {
        "Sourced income (Col B)": sourcedIncome.toString(),
        "Total NY income (Col A)": totalNYIncome.toString(),
      });

    // Line 27: Proportionate NY tax
    const proportionateNYTax = nyStateTaxPayable.times(incomeRatio);
    audit.record("NY-IT112R", "27", `Proportionate NY tax for ${jurisdiction.stateCode}`,
      proportionateNYTax, "Line 25 × Line 26", {
        "NY State tax payable (line 25)": nyStateTaxPayable.toString(),
        "Income ratio (line 26)": incomeRatio.toString(),
      });

    // Line 28: Allowable credit = min(line 24, line 27), floored at 0
    const allowableCredit = zeroFloor(
      Decimal.min(taxImposed, proportionateNYTax)
    );
    audit.record("NY-IT112R", "28", `Allowable credit for ${jurisdiction.stateCode}`,
      allowableCredit, "min(Line 24, Line 27), minimum 0", {
        "Tax imposed (line 24)": taxImposed.toString(),
        "Proportionate NY tax (line 27)": proportionateNYTax.toString(),
      });

    jurisdictionResults.push({
      stateCode: jurisdiction.stateCode,
      sourcedIncome,
      taxImposed,
      nyStateTaxPayable,
      incomeRatio,
      proportionateNYTax,
      allowableCredit,
    });
  }

  // Line 30: Total credit from all jurisdictions
  const totalCredit = jurisdictionResults.reduce(
    (acc, jr) => acc.plus(jr.allowableCredit),
    ZERO
  );
  audit.record("NY-IT112R", "30", "Total resident credit (all jurisdictions)",
    totalCredit, "Sum of line 28 from all IT-112-R forms", {
      "Number of jurisdictions": jurisdictionResults.length.toString(),
    });

  // Lines 31-34: Application of credit (limited to remaining tax)
  const taxDueBeforeCredits = nyStateTax.plus(otherTaxesBeforeCredits);
  audit.record("NY-IT112R", "31", "Tax due before credits", taxDueBeforeCredits,
    "IT-201 line 39 + IT-201-ATT line 21", {
      "NY State tax (IT-201 line 39)": nyStateTax.toString(),
      "IT-201-ATT line 21": otherTaxesBeforeCredits.toString(),
    });

  // Line 32: Household credit + other credits applied before resident credit
  const totalOtherCredits = nyHouseholdCredit.plus(otherCreditsBeforeResident);
  audit.record("NY-IT112R", "32", "Credits applied before resident credit",
    totalOtherCredits, "Household credit + other prior credits", {
      "Household credit": nyHouseholdCredit.toString(),
      "Other credits": otherCreditsBeforeResident.toString(),
    });

  // Line 33: Remaining tax liability
  const remainingTaxLiability = zeroFloor(taxDueBeforeCredits.minus(totalOtherCredits));
  audit.record("NY-IT112R", "33", "Remaining tax liability", remainingTaxLiability,
    "max(0, Line 31 - Line 32)", {
      "Tax due (line 31)": taxDueBeforeCredits.toString(),
      "Other credits (line 32)": totalOtherCredits.toString(),
    });

  // Line 34: Final credit = min(total credit, remaining tax)
  const finalCredit = roundDollar(Decimal.min(totalCredit, remainingTaxLiability));
  audit.record("NY-IT112R", "34", "Final resident credit claimed", finalCredit,
    "min(Line 30, Line 33) — entered on IT-201 line 41", {
      "Total credit (line 30)": totalCredit.toString(),
      "Remaining tax (line 33)": remainingTaxLiability.toString(),
    });

  return {
    totalNYIncome,
    nyStateTax,
    otherTaxesBeforeCredits,
    nyHouseholdCredit,
    nyStateTaxPayable,
    jurisdictionResults,
    totalCredit,
    taxDueBeforeCredits,
    otherCreditsBeforeResident,
    remainingTaxLiability,
    finalCredit,
    lines: audit.getLines(),
  };
}
