/**
 * New York IT-213 — Empire State Child Credit.
 * Computes the refundable credit reported on IT-201 line 63.
 * Spec: spec/state/ny-it213-empire-state-child-credit.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, zeroFloor } from "@/utils/decimal.js";

/* ---------- Types ---------- */

export interface NYIT213Input {
  /** Number of qualifying children under age 4 on December 31 */
  qualifyingChildrenUnder4: number;
  /** Number of qualifying children age 4 through 16 on December 31 */
  qualifyingChildrenAge4To16: number;
  /** Federal adjusted gross income from IT-201 line 19 */
  federalAgi: Decimal | string | number;
  filingStatus: FilingStatus;
  taxYear: number;
}

export interface NYIT213Result {
  /** Line 1: Number of qualifying children under age 4 */
  qualifyingChildrenUnder4: number;
  /** Line 2: Credit for qualifying children under age 4 */
  creditForChildrenUnder4: Decimal;
  /** Line 3: Number of qualifying children age 4 through 16 */
  qualifyingChildrenAge4To16: number;
  /** Line 4: Credit for qualifying children age 4 through 16 */
  creditForChildrenAge4To16: Decimal;
  /** Line 5: Base credit before phaseout */
  baseCredit: Decimal;
  /** Line 6: Federal AGI rounded down to the nearest $1,000 */
  roundedFederalAgi: Decimal;
  /** Filing-status threshold used on line 7 */
  agiThreshold: Decimal;
  /** Line 7: Federal AGI excess over the filing-status threshold */
  agiExcessOverThreshold: Decimal;
  /** Line 8: Phaseout reduction */
  phaseoutReduction: Decimal;
  /** Line 9: Empire State child credit */
  empireStateChildCredit: Decimal;
  lines: CalculatedLine[];
}

/* ---------- Constants ---------- */

const ZERO = new Decimal(0);

interface NYIT213YearConstants {
  under4Credit: Decimal;
  age4To16Credit: Decimal;
  phaseoutRate: Decimal;
  agiThreshold: Record<FilingStatus, Decimal>;
}

const NY_IT213_CONSTANTS: Record<number, NYIT213YearConstants> = {
  2025: {
    under4Credit: new Decimal(1000),
    age4To16Credit: new Decimal(330),
    phaseoutRate: new Decimal("0.0165"),
    agiThreshold: {
      single: new Decimal(75000),
      married_filing_jointly: new Decimal(110000),
      married_filing_separately: new Decimal(55000),
      head_of_household: new Decimal(75000),
      qualifying_surviving_spouse: new Decimal(75000),
    },
  },
};

/* ---------- Main computation ---------- */

export function calculateNYIT213(input: NYIT213Input): NYIT213Result {
  const constants = NY_IT213_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`NY IT-213 Empire State child credit not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  const qualifyingChildrenUnder4 = Math.max(0, Math.floor(input.qualifyingChildrenUnder4));
  const qualifyingChildrenAge4To16 = Math.max(0, Math.floor(input.qualifyingChildrenAge4To16));
  const federalAgi = d(input.federalAgi);
  const roundedFederalAgi = federalAgi.lessThanOrEqualTo(ZERO)
    ? ZERO
    : federalAgi.div(1000).floor().times(1000);
  const agiThreshold = constants.agiThreshold[input.filingStatus];

  // Line 1: Number of qualifying children under age 4
  audit.record("NY-IT213", "1", "Number of qualifying children under age 4",
    new Decimal(qualifyingChildrenUnder4), "Qualifying children under age 4");

  // Line 2: Credit for qualifying children under age 4
  const creditForChildrenUnder4 = constants.under4Credit.times(qualifyingChildrenUnder4);
  audit.record("NY-IT213", "2", "Credit for qualifying children under age 4",
    creditForChildrenUnder4, "Line 1 × $1,000", {
      "Qualifying children under age 4": qualifyingChildrenUnder4.toString(),
    });

  // Line 3: Number of qualifying children age 4 through 16
  audit.record("NY-IT213", "3", "Number of qualifying children age 4 through 16",
    new Decimal(qualifyingChildrenAge4To16), "Qualifying children age 4 through 16");

  // Line 4: Credit for qualifying children age 4 through 16
  const creditForChildrenAge4To16 = constants.age4To16Credit.times(qualifyingChildrenAge4To16);
  audit.record("NY-IT213", "4", "Credit for qualifying children age 4 through 16",
    creditForChildrenAge4To16, "Line 3 × $330", {
      "Qualifying children age 4 through 16": qualifyingChildrenAge4To16.toString(),
    });

  // Line 5: Base credit before phaseout
  const baseCredit = creditForChildrenUnder4.plus(creditForChildrenAge4To16);
  audit.record("NY-IT213", "5", "Base Empire State child credit before phaseout",
    baseCredit, "Line 2 + Line 4", {
      "Line 2": creditForChildrenUnder4.toString(),
      "Line 4": creditForChildrenAge4To16.toString(),
    });

  // Line 6: Federal AGI rounded down to the nearest $1,000
  audit.record("NY-IT213", "6", "Federal AGI rounded down to the nearest $1,000",
    roundedFederalAgi, "max(0, floor(Federal AGI / 1000) × 1000)", {
      "Federal AGI": federalAgi.toString(),
    });

  // Line 7: Federal AGI excess over filing-status threshold
  const agiExcessOverThreshold = Decimal.max(ZERO, roundedFederalAgi.minus(agiThreshold));
  audit.record("NY-IT213", "7", "Federal AGI excess over filing-status threshold",
    agiExcessOverThreshold, "max(0, Line 6 - filing-status threshold)", {
      "Line 6": roundedFederalAgi.toString(),
      "Filing status threshold": agiThreshold.toString(),
    });

  // Line 8: Phaseout reduction
  const phaseoutReduction = roundDollar(agiExcessOverThreshold.times(constants.phaseoutRate));
  audit.record("NY-IT213", "8", "Phaseout reduction",
    phaseoutReduction, "Round(Line 7 × 1.65%)", {
      "Line 7": agiExcessOverThreshold.toString(),
    });

  // Line 9: Empire State child credit
  const empireStateChildCredit = zeroFloor(baseCredit.minus(phaseoutReduction));
  audit.record("NY-IT213", "9", "Empire State child credit",
    empireStateChildCredit, "max(0, Line 5 - Line 8)", {
      "Line 5": baseCredit.toString(),
      "Line 8": phaseoutReduction.toString(),
    });

  return {
    qualifyingChildrenUnder4,
    creditForChildrenUnder4,
    qualifyingChildrenAge4To16,
    creditForChildrenAge4To16,
    baseCredit,
    roundedFederalAgi,
    agiThreshold,
    agiExcessOverThreshold,
    phaseoutReduction,
    empireStateChildCredit,
    lines: audit.getLines(),
  };
}
