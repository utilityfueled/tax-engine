/**
 * Ohio SD 100 — School District Income Tax Return.
 * Spec: spec/state/oh-sd-100.yaml
 *
 * Implements both traditional and earned income tax base types for Ohio's
 * ~210 taxing school districts. Each district has a 4-digit code, a tax type,
 * and a rate (0.25%–2.00%). A single SD 100 covers all districts the taxpayer
 * resided in during the tax year.
 *
 * Key concepts:
 *   - Traditional: tax base = MAGI less exemptions, prorated by residency
 *   - Earned income: tax base = wages + net SE income, capped at prorated MAGI
 *   - Only credit: $50 senior citizen credit per district (age 65+)
 *   - MAGI = Ohio AGI + business income deduction (same as IT 1040)
 *
 * R.C. 5748.01–5748.06.
 */

import Decimal from "decimal.js";
import {
  lookupOhioSchoolDistrictMetadata,
  lookupOhioSchoolDistrictMetadataByDistrictName,
} from "@/engine/state/oh-school-district-lookup.js";
import { OHIO_TAX_CONSTANTS } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, roundDollar, zeroFloor } from "@/utils/decimal.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SD_SENIOR_CITIZEN_CREDIT = OHIO_TAX_CONSTANTS[2025].sd100.seniorCitizenCredit;

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export type SchoolDistrictTaxType = "traditional" | "earned_income";

export interface SchoolDistrictEntry {
  /** 4-digit school district number. Optional when districtName can be uniquely resolved. */
  districtNumber?: string;
  /** Tax type for this district. Optional when official lookup is available. */
  taxType?: SchoolDistrictTaxType;
  /** District tax rate as a decimal (e.g., 0.0125 for 1.25%). Optional when official lookup is available. */
  rate?: Decimal | string | number;
  /** Compatibility alias for taxType used by some callers. */
  taxBase?: SchoolDistrictTaxType;
  /** Optional human-readable district name for caller context only. */
  districtName?: string;
  /**
   * Residency factor (days as resident / 365). Default 1.0 for full-year.
   * Use for part-year residents.
   */
  residencyFactor?: Decimal | string | number;

  // --- Earned income fields (only for earned_income districts) ---

  /** Wages/salaries/tips received while resident of this district. */
  wages?: Decimal | string | number;
  /** Net self-employment earnings while resident of this district. Can be negative. */
  netSelfEmployment?: Decimal | string | number;
}

export interface OhioSD100Input {
  taxYear: number;

  /** Ohio AGI from IT 1040 line 3. */
  ohioAgi: Decimal | string | number;
  /** Business income deduction from Schedule of Adjustments line 15. */
  businessIncomeDeduction: Decimal | string | number;
  /** Exemption amount from IT 1040 line 4. */
  exemptionAmount: Decimal | string | number;

  /** Whether taxpayer (or spouse) is 65+ at end of tax year. */
  isSenior?: boolean;

  /** School districts the taxpayer resided in during the tax year. */
  districts: SchoolDistrictEntry[];

  // --- Payments (lines 9–14) ---

  /** Line 9: Underpayment penalty from IT/SD 2210. Default 0. */
  underpaymentPenalty?: Decimal | string | number;
  /** Line 11: School district income tax withheld (W-2 box 19). Default 0. */
  sdWithholding?: Decimal | string | number;
  /** Line 12: Estimated/extension payments + prior year carryforward. Default 0. */
  estimatedPayments?: Decimal | string | number;
  /** Line 14: Amended return prior overpayment. Default 0. */
  amendedPriorOverpayment?: Decimal | string | number;
  /** Line 17: Interest due on late payment. Default 0. */
  latePaymentInterest?: Decimal | string | number;
  /** Line 20: Elected credit carryforward to next year. Default 0. */
  creditCarryforward?: Decimal | string | number;
}

/** Per-district detail for the result. */
export interface SchoolDistrictDetail {
  districtNumber: string;
  taxType: SchoolDistrictTaxType;
  rate: Decimal;
  residencyFactor: Decimal;
  taxBase: Decimal;
  grossTax: Decimal;
  seniorCredit: Decimal;
  taxAfterCredits: Decimal;
}

export interface OhioSD100Result {
  line1_ohioAgi: Decimal;
  line2_businessIncomeDeduction: Decimal;
  line3_magi: Decimal;
  line4_exemptions: Decimal;
  line5_magiLessExemptions: Decimal;
  line6_traditionalTax: Decimal;
  line7_earnedIncomeTax: Decimal;
  line8_totalTaxAfterCredits: Decimal;
  line9_underpaymentPenalty: Decimal;
  line10_totalLiability: Decimal;
  line11_sdWithholding: Decimal;
  line12_estimatedPayments: Decimal;
  line13_totalPayments: Decimal;
  line14_amendedPriorOverpayment: Decimal;
  line15_netPayments: Decimal;
  line16_taxDue: Decimal;
  line17_latePaymentInterest: Decimal;
  line18_totalAmountDue: Decimal;
  line19_overpayment: Decimal;
  line20_creditCarryforward: Decimal;
  line21_refund: Decimal;

  /** Per-district breakdown. */
  districtDetails: SchoolDistrictDetail[];

  lines: CalculatedLine[];
}

interface ResolvedSchoolDistrictEntry
  extends Omit<SchoolDistrictEntry, "taxType" | "rate" | "districtNumber"> {
  districtNumber: string;
  taxType: SchoolDistrictTaxType;
  rate: Decimal | string | number;
}

function normalizeSchoolDistrictNumber(districtNumber: string): string {
  const trimmed = districtNumber.trim();
  return /^\d{1,4}$/.test(trimmed) ? trimmed.padStart(4, "0") : trimmed;
}

function validateResidencyFactor(
  districtNumber: string,
  residencyFactor: Decimal,
): Decimal {
  if (residencyFactor.lessThan(0) || residencyFactor.greaterThan(1)) {
    throw new Error(
      `Ohio SD 100 district ${districtNumber} residency factor must be between 0 and 1 inclusive; received ${residencyFactor.toString()}.`,
    );
  }

  return residencyFactor;
}

// ---------------------------------------------------------------------------
// Per-district schedule calculations
// ---------------------------------------------------------------------------

function computeTraditionalDistrict(
  entry: ResolvedSchoolDistrictEntry,
  magiLessExemptions: Decimal,
  isSenior: boolean,
  seniorCitizenCredit: Decimal,
  audit: AuditTrail,
): SchoolDistrictDetail {
  const rate = d(entry.rate);
  const residencyFactor = d(entry.residencyFactor ?? 1);
  const prefix = `SD-${entry.districtNumber}`;

  // Line 22 — Prorated MAGI less exemptions
  const line22 = roundDollar(magiLessExemptions.times(residencyFactor));
  audit.record(
    "OH-SD-100", `${prefix}/22`,
    `Traditional tax base (district ${entry.districtNumber})`,
    line22,
    "Line 5 × residency factor",
    { "Line 5": magiLessExemptions, "Residency factor": residencyFactor },
  );

  // Line 23 — min(line 5, line 22)
  const line23 = min(magiLessExemptions, line22);
  audit.record(
    "OH-SD-100", `${prefix}/23`,
    `Taxable amount (district ${entry.districtNumber})`,
    line23,
    "min(Line 5, Line 22)",
    { "Line 5": magiLessExemptions, "Line 22": line22 },
  );

  // Line 25 — Tax
  const line25 = roundDollar(line23.times(rate));
  audit.record(
    "OH-SD-100", `${prefix}/25`,
    `District tax (district ${entry.districtNumber})`,
    line25,
    "Line 23 × rate",
    { "Line 23": line23, Rate: rate },
  );

  // Line 26 — Senior citizen credit
  const line26 = isSenior ? min(seniorCitizenCredit, line25) : new Decimal(0);
  audit.record(
    "OH-SD-100", `${prefix}/26`,
    `Senior citizen credit (district ${entry.districtNumber})`,
    line26,
    isSenior ? "min($50, tax)" : "$0 (not senior)",
  );

  // Line 27 — Tax after credits
  const line27 = zeroFloor(line25.minus(line26));
  audit.record(
    "OH-SD-100", `${prefix}/27`,
    `Tax after credits (district ${entry.districtNumber})`,
    line27,
    "max(0, Line 25 - Line 26)",
    { "Line 25": line25, "Line 26": line26 },
  );

  return {
    districtNumber: entry.districtNumber,
    taxType: "traditional",
    rate,
    residencyFactor,
    taxBase: line23,
    grossTax: line25,
    seniorCredit: line26,
    taxAfterCredits: line27,
  };
}

function computeEarnedIncomeDistrict(
  entry: ResolvedSchoolDistrictEntry,
  magi: Decimal,
  isSenior: boolean,
  seniorCitizenCredit: Decimal,
  audit: AuditTrail,
): SchoolDistrictDetail {
  const rate = d(entry.rate);
  const residencyFactor = d(entry.residencyFactor ?? 1);
  const prefix = `SD-${entry.districtNumber}`;

  // Line 29 — Wages
  const line29 = d(entry.wages);
  audit.record(
    "OH-SD-100", `${prefix}/29`,
    `Wages (district ${entry.districtNumber})`,
    line29,
    "W-2 wages for district residency period",
  );

  // Line 30 — Net SE income (can be negative)
  const line30 = d(entry.netSelfEmployment);
  audit.record(
    "OH-SD-100", `${prefix}/30`,
    `Net self-employment (district ${entry.districtNumber})`,
    line30,
    "Net SE income for district residency period",
  );

  // Line 31 — Total earned income (floor at zero)
  const line31 = zeroFloor(line29.plus(line30));
  audit.record(
    "OH-SD-100", `${prefix}/31`,
    `Total earned income (district ${entry.districtNumber})`,
    line31,
    "max(0, Line 29 + Line 30)",
    { "Line 29": line29, "Line 30": line30 },
  );

  // Line 32 — Prorated MAGI
  const line32 = zeroFloor(roundDollar(magi.times(residencyFactor)));
  audit.record(
    "OH-SD-100", `${prefix}/32`,
    `MAGI portion (district ${entry.districtNumber})`,
    line32,
    "max(0, Line 3 × residency factor)",
    { "Line 3": magi, "Residency factor": residencyFactor },
  );

  // Line 33 — Taxable earned income (capped at MAGI)
  const line33 = min(line31, line32);
  audit.record(
    "OH-SD-100", `${prefix}/33`,
    `Taxable earned income (district ${entry.districtNumber})`,
    line33,
    "min(Line 31, Line 32)",
    { "Line 31": line31, "Line 32": line32 },
  );

  // Line 35 — Tax
  const line35 = roundDollar(line33.times(rate));
  audit.record(
    "OH-SD-100", `${prefix}/35`,
    `District tax (district ${entry.districtNumber})`,
    line35,
    "Line 33 × rate",
    { "Line 33": line33, Rate: rate },
  );

  // Line 36 — Senior citizen credit
  const line36 = isSenior ? min(seniorCitizenCredit, line35) : new Decimal(0);
  audit.record(
    "OH-SD-100", `${prefix}/36`,
    `Senior citizen credit (district ${entry.districtNumber})`,
    line36,
    isSenior ? "min($50, tax)" : "$0 (not senior)",
  );

  // Line 37 — Tax after credits
  const line37 = zeroFloor(line35.minus(line36));
  audit.record(
    "OH-SD-100", `${prefix}/37`,
    `Tax after credits (district ${entry.districtNumber})`,
    line37,
    "max(0, Line 35 - Line 36)",
    { "Line 35": line35, "Line 36": line36 },
  );

  return {
    districtNumber: entry.districtNumber,
    taxType: "earned_income",
    rate,
    residencyFactor,
    taxBase: line33,
    grossTax: line35,
    seniorCredit: line36,
    taxAfterCredits: line37,
  };
}

function resolveSchoolDistrictEntry(
  taxYear: number,
  entry: SchoolDistrictEntry,
): ResolvedSchoolDistrictEntry {
  const providedDistrictNumber = entry.districtNumber?.trim()
    ? normalizeSchoolDistrictNumber(entry.districtNumber)
    : null;
  const officialMetadataByNumber = providedDistrictNumber
    ? lookupOhioSchoolDistrictMetadata(taxYear, providedDistrictNumber)
    : null;
  const officialMetadata =
    officialMetadataByNumber ??
    (entry.districtName
      ? lookupOhioSchoolDistrictMetadataByDistrictName(taxYear, entry.districtName)
      : null);
  const districtNumber = officialMetadata?.districtNumber ?? providedDistrictNumber;

  if (!districtNumber) {
    throw new Error(
      `Ohio SD 100 school district entry must provide districtNumber or a uniquely matching official districtName for tax year ${taxYear}.`,
    );
  }

  const residencyFactor = validateResidencyFactor(
    districtNumber,
    d(entry.residencyFactor ?? 1),
  );

  const taxType = entry.taxType ?? entry.taxBase ?? officialMetadata?.taxType;
  const rate = entry.rate ?? officialMetadata?.rate;

  if (!taxType || rate === undefined) {
    throw new Error(
      `Ohio SD 100 district ${districtNumber} is missing tax metadata. Provide taxType/rate or use an official taxable district number or districtName for tax year ${taxYear}.`,
    );
  }

  return {
    ...entry,
    districtNumber: officialMetadata?.districtNumber ?? districtNumber,
    residencyFactor,
    taxType,
    rate,
  };
}

// ---------------------------------------------------------------------------
// Main calculation
// ---------------------------------------------------------------------------

export function calculateOhioSD100(input: OhioSD100Input): OhioSD100Result {
  const yearConstants = OHIO_TAX_CONSTANTS[input.taxYear];
  if (!yearConstants) {
    throw new Error(`Ohio SD 100 constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();

  // =========================================================================
  // Lines 1–5: Common income base
  // =========================================================================

  // Line 1 — Ohio AGI
  const line1 = d(input.ohioAgi);
  audit.record("OH-SD-100", "1", "Ohio adjusted gross income", line1, "IT 1040, line 3");

  // Line 2 — Business income deduction add-back
  const line2 = d(input.businessIncomeDeduction);
  audit.record(
    "OH-SD-100", "2",
    "Business income deduction add-back",
    line2,
    "Schedule of Adjustments, line 15",
  );

  // Line 3 — MAGI (floor at zero)
  const line3 = zeroFloor(line1.plus(line2));
  audit.record(
    "OH-SD-100", "3",
    "Modified adjusted gross income (MAGI)",
    line3,
    "max(0, Line 1 + Line 2)",
    { "Line 1": line1, "Line 2": line2 },
  );

  // Line 4 — Exemptions
  const line4 = d(input.exemptionAmount);
  audit.record("OH-SD-100", "4", "Personal and dependent exemptions", line4, "IT 1040, line 4");

  // Line 5 — MAGI less exemptions
  const line5 = zeroFloor(line3.minus(line4));
  audit.record(
    "OH-SD-100", "5",
    "MAGI less exemptions",
    line5,
    "max(0, Line 3 - Line 4)",
    { "Line 3": line3, "Line 4": line4 },
  );

  // =========================================================================
  // Per-district schedules
  // =========================================================================

  const isSenior = input.isSenior ?? false;
  const seniorCitizenCredit = yearConstants.sd100.seniorCitizenCredit;
  const districtDetails: SchoolDistrictDetail[] = [];

  for (const entry of input.districts) {
    const resolvedEntry = resolveSchoolDistrictEntry(input.taxYear, entry);

    if (resolvedEntry.taxType === "traditional") {
      districtDetails.push(
        computeTraditionalDistrict(
          resolvedEntry,
          line5,
          isSenior,
          seniorCitizenCredit,
          audit,
        ),
      );
    } else {
      districtDetails.push(
        computeEarnedIncomeDistrict(
          resolvedEntry,
          line3,
          isSenior,
          seniorCitizenCredit,
          audit,
        ),
      );
    }
  }

  // Line 6 — Total traditional district tax (line 28 → line 6)
  const line6 = districtDetails
    .filter((dd) => dd.taxType === "traditional")
    .reduce((acc, dd) => acc.plus(dd.taxAfterCredits), new Decimal(0));
  audit.record(
    "OH-SD-100", "6",
    "Total tax from traditional districts",
    line6,
    "Sum of line 27 across traditional districts",
  );

  // Line 7 — Total earned income district tax (line 38 → line 7)
  const line7 = districtDetails
    .filter((dd) => dd.taxType === "earned_income")
    .reduce((acc, dd) => acc.plus(dd.taxAfterCredits), new Decimal(0));
  audit.record(
    "OH-SD-100", "7",
    "Total tax from earned income districts",
    line7,
    "Sum of line 37 across earned income districts",
  );

  // Line 8 — Total SD tax after credits
  const line8 = line6.plus(line7);
  audit.record(
    "OH-SD-100", "8",
    "School district income tax liability after credits",
    line8,
    "Line 6 + Line 7",
    { "Line 6": line6, "Line 7": line7 },
  );

  // =========================================================================
  // Lines 9–21: Liability, payments, refund / balance due
  // =========================================================================

  // Line 9 — Underpayment penalty
  const line9 = d(input.underpaymentPenalty);
  audit.record("OH-SD-100", "9", "Interest penalty on underpayment", line9, "IT/SD 2210");

  // Line 10 — Total liability
  const line10 = line8.plus(line9);
  audit.record(
    "OH-SD-100", "10",
    "Total SD tax liability before payments",
    line10,
    "Line 8 + Line 9",
    { "Line 8": line8, "Line 9": line9 },
  );

  // Line 11 — SD withholding
  const line11 = d(input.sdWithholding);
  audit.record("OH-SD-100", "11", "School district income tax withheld", line11, "SD WH, Part A");

  // Line 12 — Estimated payments
  const line12 = d(input.estimatedPayments);
  audit.record("OH-SD-100", "12", "Estimated and extension payments", line12, "Sum of SD estimated + extension + carryforward");

  // Line 13 — Total payments
  const line13 = line11.plus(line12);
  audit.record(
    "OH-SD-100", "13",
    "Total SD tax payments",
    line13,
    "Line 11 + Line 12",
    { "Line 11": line11, "Line 12": line12 },
  );

  // Line 14 — Amended prior overpayment
  const line14 = d(input.amendedPriorOverpayment);
  audit.record("OH-SD-100", "14", "Amended return prior overpayment", line14, "Prior SD 100 line 19");

  // Line 15 — Net payments
  const line15 = line13.minus(line14);
  audit.record(
    "OH-SD-100", "15",
    "Net payment position",
    line15,
    "Line 13 - Line 14",
    { "Line 13": line13, "Line 14": line14 },
  );

  // Branching: overpayment vs tax due
  const hasOverpayment = line15.greaterThan(line10);

  // Line 16 — Tax due
  const line16 = hasOverpayment ? new Decimal(0) : line10.minus(line15);
  audit.record(
    "OH-SD-100", "16",
    "Tax due",
    line16,
    hasOverpayment ? "$0 (overpayment)" : "Line 10 - Line 15",
    { "Line 10": line10, "Line 15": line15 },
  );

  // Line 17 — Late payment interest
  const line17 = d(input.latePaymentInterest);
  audit.record("OH-SD-100", "17", "Interest due on late payment", line17, "Pass-through input");

  // Line 18 — Total amount due ($1 or less = $0, per SD 100 instructions)
  const rawLine18 = line16.plus(line17);
  const line18 = rawLine18.lessThanOrEqualTo(1) ? new Decimal(0) : rawLine18;
  audit.record(
    "OH-SD-100", "18",
    "Total amount due",
    line18,
    rawLine18.lessThanOrEqualTo(1)
      ? "$0 ($1 or less threshold — no payment necessary)"
      : "Line 16 + Line 17",
    { "Line 16": line16, "Line 17": line17 },
  );

  // Line 19 — Overpayment
  const line19 = hasOverpayment ? line15.minus(line10) : new Decimal(0);
  audit.record(
    "OH-SD-100", "19",
    "Overpayment",
    line19,
    hasOverpayment ? "Line 15 - Line 10" : "$0 (tax due)",
    { "Line 15": line15, "Line 10": line10 },
  );

  // Line 20 — Credit carryforward (capped at overpayment)
  const line20 = min(d(input.creditCarryforward), line19);
  audit.record(
    "OH-SD-100", "20",
    "Credit carryforward to next year",
    line20,
    "min(elected amount, Line 19)",
    { Elected: d(input.creditCarryforward), "Line 19": line19 },
  );

  // Line 21 — Refund ($1 or less = $0, per SD 100 instructions)
  const rawLine21 = line19.minus(line20);
  const line21 = rawLine21.lessThanOrEqualTo(1) ? new Decimal(0) : rawLine21;
  audit.record(
    "OH-SD-100", "21",
    "Refund",
    line21,
    rawLine21.lessThanOrEqualTo(1)
      ? "$0 ($1 or less threshold — no refund issued)"
      : "Line 19 - Line 20",
    { "Line 19": line19, "Line 20": line20 },
  );

  return {
    line1_ohioAgi: line1,
    line2_businessIncomeDeduction: line2,
    line3_magi: line3,
    line4_exemptions: line4,
    line5_magiLessExemptions: line5,
    line6_traditionalTax: line6,
    line7_earnedIncomeTax: line7,
    line8_totalTaxAfterCredits: line8,
    line9_underpaymentPenalty: line9,
    line10_totalLiability: line10,
    line11_sdWithholding: line11,
    line12_estimatedPayments: line12,
    line13_totalPayments: line13,
    line14_amendedPriorOverpayment: line14,
    line15_netPayments: line15,
    line16_taxDue: line16,
    line17_latePaymentInterest: line17,
    line18_totalAmountDue: line18,
    line19_overpayment: line19,
    line20_creditCarryforward: line20,
    line21_refund: line21,
    districtDetails,
    lines: audit.getLines(),
  };
}
