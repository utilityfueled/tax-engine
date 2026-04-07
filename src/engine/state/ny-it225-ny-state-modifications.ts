/**
 * New York IT-225 New York State Modifications.
 * Computes additions (line 9 → IT-201 line 23) and subtractions (line 18 → IT-201 line 31).
 * Spec: spec/state/ny-it225-ny-state-modifications.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum, min, zeroFloor } from "@/utils/decimal.js";

/* ---------- Types ---------- */

export interface NYIT225YearConstants {
  /** Maximum NY 529 plan contribution deduction per account owner */
  ny529MaxPerOwner: Decimal;
  /** LTC insurance premium deduction rate (e.g., 0.20 = 20%) */
  ltcPremiumDeductionRate: Decimal;
}

export interface NYIT225Input {
  filingStatus: FilingStatus;
  taxYear: number;

  /* ----- Additions ----- */

  /** A-101: Federal §168(k) bonus depreciation claimed */
  federalBonusDepreciation?: Decimal | string | number;
  /** A-101: NY-allowable depreciation for assets where bonus was claimed
   *  (if provided, addback = federalBonusDepreciation - nyDepreciationAllowed) */
  nyDepreciationAllowedForBonusAssets?: Decimal | string | number;

  /** A-201: Federal QBI deduction (Form 1040 line 13) */
  federalQbiDeduction?: Decimal | string | number;

  /** Other IT-225 additions not computed by this module (passthrough) */
  otherIT225Additions?: Decimal | string | number;

  /* ----- Subtractions ----- */

  /** S-101: NY depreciation for assets where bonus depreciation was added back.
   *  This is the "other side" — if the addback approach uses the full federal
   *  bonus amount for A-101, this is the NY regular MACRS depreciation.
   *  When nyDepreciationAllowedForBonusAssets is provided in the additions
   *  section (net approach), this field is not needed. */
  nyDepreciationForBonusAssets?: Decimal | string | number;

  /** S-201: Contributions to a NY 529 plan by the primary taxpayer */
  ny529Contributions?: Decimal | string | number;
  /** S-201: Contributions to a NY 529 plan by the spouse (MFJ only).
   *  Each spouse is treated as a separate account owner with their own $5,000 limit. */
  spouseNy529Contributions?: Decimal | string | number;

  /** S-202: Long-term care insurance premiums paid during the tax year */
  ltcPremiumsPaid?: Decimal | string | number;
  /** S-202: LTC premiums already included in federal itemized deductions
   *  (Schedule A medical expenses). Defaults to 0 (standard deduction filer). */
  ltcPremiumsDeductedFederally?: Decimal | string | number;

  /** Other IT-225 subtractions not computed by this module (passthrough) */
  otherIT225Subtractions?: Decimal | string | number;
}

export interface NYIT225Result {
  /* Individual modification amounts */

  /** A-101: Bonus depreciation addback */
  bonusDepreciationAddback: Decimal;
  /** A-201: QBI deduction addback */
  qbiDeductionAddback: Decimal;
  /** Other additions (passthrough) */
  otherAdditions: Decimal;

  /** S-101: NY depreciation subtraction for bonus assets */
  nyDepreciationSubtraction: Decimal;
  /** S-201: NY 529 plan contribution deduction */
  ny529Deduction: Decimal;
  /** S-202: Long-term care insurance premium deduction */
  ltcPremiumDeduction: Decimal;
  /** Other subtractions (passthrough) */
  otherSubtractions: Decimal;

  /* Totals */

  /** Line 9: Total IT-225 additions (flows to IT-201 line 23) */
  totalAdditions: Decimal;
  /** Line 18: Total IT-225 subtractions (flows to IT-201 line 31) */
  totalSubtractions: Decimal;

  lines: CalculatedLine[];
}

/* ---------- Constants ---------- */

const ZERO = new Decimal(0);

export const NY_IT225_CONSTANTS: Record<number, NYIT225YearConstants> = {
  2025: {
    ny529MaxPerOwner: new Decimal(5000),
    ltcPremiumDeductionRate: new Decimal("0.20"),
  },
};

/* ---------- Helpers ---------- */

function compute529Deduction(
  contributions: Decimal,
  spouseContributions: Decimal,
  filingStatus: FilingStatus,
  maxPerOwner: Decimal
): { total: Decimal; primary: Decimal; spouse: Decimal } {
  const primaryDeduction = min(zeroFloor(contributions), maxPerOwner);

  let spouseDeduction = ZERO;
  if (filingStatus === "married_filing_jointly") {
    spouseDeduction = min(zeroFloor(spouseContributions), maxPerOwner);
  }

  return {
    total: primaryDeduction.plus(spouseDeduction),
    primary: primaryDeduction,
    spouse: spouseDeduction,
  };
}

function computeLtcDeduction(
  premiumsPaid: Decimal,
  premiumsDeductedFederally: Decimal,
  rate: Decimal
): Decimal {
  const nonDeductedPortion = zeroFloor(premiumsPaid.minus(premiumsDeductedFederally));
  return nonDeductedPortion.times(rate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

/* ---------- Main computation ---------- */

export function calculateNYIT225(input: NYIT225Input): NYIT225Result {
  const constants = NY_IT225_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`NY IT-225 constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();

  /* ========== Additions ========== */

  // A-101: Bonus depreciation addback
  const federalBonus = d(input.federalBonusDepreciation);
  const nyAllowed = d(input.nyDepreciationAllowedForBonusAssets);
  const bonusDepreciationAddback = zeroFloor(federalBonus.minus(nyAllowed));
  audit.record("NY-IT225", "A-101", "IRC §168(k) bonus depreciation addback",
    bonusDepreciationAddback,
    "Federal §168(k) depreciation - NY allowable depreciation (floor 0)", {
      "Federal bonus depreciation": federalBonus.toString(),
      "NY depreciation allowed": nyAllowed.toString(),
    });

  // A-201: QBI deduction addback
  const qbiDeductionAddback = zeroFloor(d(input.federalQbiDeduction));
  audit.record("NY-IT225", "A-201", "IRC §199A QBI deduction addback",
    qbiDeductionAddback,
    "Federal Form 1040 line 13 — NY does not allow QBI deduction", {
      "Federal QBI deduction": qbiDeductionAddback.toString(),
    });

  // Other additions (passthrough)
  const otherAdditions = d(input.otherIT225Additions);
  audit.record("NY-IT225", "other-add", "Other IT-225 additions",
    otherAdditions, "Other IT-225 addition modifications (passthrough)");

  // Line 9: Total additions
  const totalAdditions = sum(bonusDepreciationAddback, qbiDeductionAddback, otherAdditions);
  audit.record("NY-IT225", "9", "Total IT-225 additions (to IT-201 line 23)",
    totalAdditions,
    "A-101 + A-201 + other additions", {
      "Bonus depreciation addback (A-101)": bonusDepreciationAddback.toString(),
      "QBI deduction addback (A-201)": qbiDeductionAddback.toString(),
      "Other additions": otherAdditions.toString(),
    });

  /* ========== Subtractions ========== */

  // S-101: NY depreciation for bonus depreciation assets
  const nyDepreciationSubtraction = zeroFloor(d(input.nyDepreciationForBonusAssets));
  audit.record("NY-IT225", "S-101", "NY depreciation for bonus depreciation assets",
    nyDepreciationSubtraction,
    "NY-allowable MACRS depreciation for assets where §168(k) was added back");

  // S-201: NY 529 plan contribution deduction
  const ny529Result = compute529Deduction(
    d(input.ny529Contributions),
    d(input.spouseNy529Contributions),
    input.filingStatus,
    constants.ny529MaxPerOwner
  );
  audit.record("NY-IT225", "S-201", "NY 529 plan contribution deduction",
    ny529Result.total,
    `Up to $${constants.ny529MaxPerOwner} per account owner`, {
      "Primary owner contributions": d(input.ny529Contributions).toString(),
      "Primary owner deduction": ny529Result.primary.toString(),
      "Spouse contributions": d(input.spouseNy529Contributions).toString(),
      "Spouse deduction": ny529Result.spouse.toString(),
      "Filing status": input.filingStatus,
    });

  // S-202: Long-term care insurance premium deduction
  const ltcPremiumsPaid = d(input.ltcPremiumsPaid);
  const ltcPremiumsDeductedFederally = d(input.ltcPremiumsDeductedFederally);
  const ltcPremiumDeduction = computeLtcDeduction(
    ltcPremiumsPaid,
    ltcPremiumsDeductedFederally,
    constants.ltcPremiumDeductionRate
  );
  audit.record("NY-IT225", "S-202", "Long-term care insurance premium deduction",
    ltcPremiumDeduction,
    `${constants.ltcPremiumDeductionRate.times(100)}% of premiums not deducted federally`, {
      "LTC premiums paid": ltcPremiumsPaid.toString(),
      "Premiums deducted federally": ltcPremiumsDeductedFederally.toString(),
      "Non-deducted portion": zeroFloor(ltcPremiumsPaid.minus(ltcPremiumsDeductedFederally)).toString(),
      "Deduction rate": constants.ltcPremiumDeductionRate.toString(),
    });

  // Other subtractions (passthrough)
  const otherSubtractions = d(input.otherIT225Subtractions);
  audit.record("NY-IT225", "other-sub", "Other IT-225 subtractions",
    otherSubtractions, "Other IT-225 subtraction modifications (passthrough)");

  // Line 18: Total subtractions
  const totalSubtractions = sum(
    nyDepreciationSubtraction,
    ny529Result.total,
    ltcPremiumDeduction,
    otherSubtractions
  );
  audit.record("NY-IT225", "18", "Total IT-225 subtractions (to IT-201 line 31)",
    totalSubtractions,
    "S-101 + S-201 + S-202 + other subtractions", {
      "NY depreciation (S-101)": nyDepreciationSubtraction.toString(),
      "529 deduction (S-201)": ny529Result.total.toString(),
      "LTC premium deduction (S-202)": ltcPremiumDeduction.toString(),
      "Other subtractions": otherSubtractions.toString(),
    });

  return {
    bonusDepreciationAddback,
    qbiDeductionAddback,
    otherAdditions,
    nyDepreciationSubtraction,
    ny529Deduction: ny529Result.total,
    ltcPremiumDeduction,
    otherSubtractions,
    totalAdditions,
    totalSubtractions,
    lines: audit.getLines(),
  };
}
