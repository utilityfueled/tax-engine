import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for IRS Form 8995 — Qualified Business Income Deduction
 * Simplified Computation.
 *
 * Field names are from the official IRS fillable PDF (2025 tax year).
 * Field mapping was derived by inspecting field names in the blank PDF.
 *
 * To verify or update mappings, run the debug utility:
 *   fillDebugLabels('forms/blank/2025/f8995.pdf', 'forms/filled/f8995-debug.pdf')
 */

import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { Form8995Result } from "@/engine/forms/form-8995.js";
import { zeroFloor } from "@/utils/decimal.js";
import {
  loadReviewTemplate,
  setTextField,
  setCurrencyField,
} from "../../pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const tbl = (row: string, n: string) =>
  `topmostSubform[0].Page1[0].Table[0].${row}.${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Form 8995 fillable PDF field inspection.

export const FORM_8995_FIELDS = {
  // ── Header ──
  name: p1("f1_01[0]"),
  ssn: p1("f1_02[0]"),

  // ── Line 1: Trade/Business Table (up to 5 rows) ──
  // Each row has: (a) Business name, (b) TIN, (c) QBI amount
  business1Name: tbl("Row1i[0]", "f1_03[0]"),
  business1TIN: tbl("Row1i[0]", "f1_04[0]"),
  business1QBI: tbl("Row1i[0]", "f1_05[0]"),

  business2Name: tbl("Row1ii[0]", "f1_06[0]"),
  business2TIN: tbl("Row1ii[0]", "f1_07[0]"),
  business2QBI: tbl("Row1ii[0]", "f1_08[0]"),

  business3Name: tbl("Row1iii[0]", "f1_09[0]"),
  business3TIN: tbl("Row1iii[0]", "f1_10[0]"),
  business3QBI: tbl("Row1iii[0]", "f1_11[0]"),

  business4Name: tbl("Row1iv[0]", "f1_12[0]"),
  business4TIN: tbl("Row1iv[0]", "f1_13[0]"),
  business4QBI: tbl("Row1iv[0]", "f1_14[0]"),

  business5Name: tbl("Row1v[0]", "f1_15[0]"),
  business5TIN: tbl("Row1v[0]", "f1_16[0]"),
  business5QBI: tbl("Row1v[0]", "f1_17[0]"),

  // ── Computed Lines ──
  line2: `topmostSubform[0].Page1[0].Line2_ReadOrder[0].f1_18[0]`,  // Total QBI
  line3: p1("f1_19[0]"),   // Prior year QBI loss carryforward
  line4: p1("f1_20[0]"),   // Total QBI after prior year loss
  line5: p1("f1_21[0]"),   // QBI component (20% of Line 4, ≥ 0)
  line6: `topmostSubform[0].Page1[0].Line6_ReadOrder[0].f1_22[0]`,  // REIT dividends + PTP income
  line7: p1("f1_23[0]"),   // Prior year REIT/PTP loss carryforward
  line8: p1("f1_24[0]"),   // Total qualified REIT/PTP
  line9: p1("f1_25[0]"),   // REIT/PTP component (20% of Line 8, ≥ 0)
  line10: p1("f1_26[0]"),  // Combined component (Line 5 + Line 9)
  line11: p1("f1_27[0]"),  // Taxable income before QBI deduction
  line12: p1("f1_28[0]"),  // Net capital gain
  line13: p1("f1_29[0]"),  // Line 11 minus Line 12 (≥ 0)
  line14: p1("f1_30[0]"),  // Income limitation (20% of Line 13)
  line15: p1("f1_31[0]"),  // QBI deduction (smaller of Line 10 or Line 14)
  line16: p1("f1_32[0]"),  // Total QBI loss carryforward
  line17: p1("f1_33[0]"),  // Total REIT/PTP loss carryforward
} as const;

const F = FORM_8995_FIELDS;

// ─── QBI Source Name Extraction ────────────────────────────────────────────
// Reconstructs QBI source names/TINs from input in the same order
// the engine builds them (Schedule C → Schedule F → K-1 partnerships →
// K-1 trusts → rental properties).

interface QBIPdfSource {
  name: string;
  tin: string;
}

function extractQBISourceInfo(input: TaxYearInput): QBIPdfSource[] {
  const sources: QBIPdfSource[] = [];

  // Schedule C
  if (input.scheduleC) {
    sources.push({
      name: input.scheduleC.businessName ?? "Schedule C",
      tin: input.scheduleC.ein ?? "",
    });
  }

  // Schedule F
  if (input.scheduleF) {
    sources.push({
      name: input.scheduleF.principalCropOrActivity ?? "Schedule F",
      tin: input.scheduleF.ein ?? "",
    });
  }

  // K-1 partnerships with QBI
  for (const k1 of input.scheduleK1 ?? []) {
    const qbi = k1.section199AQBI;
    if (qbi !== undefined && qbi !== "0") {
      sources.push({
        name: k1.partnershipName,
        tin: k1.partnershipEIN ?? "",
      });
    }
  }

  // K-1 Form 1041 trusts with QBI
  for (const k1 of input.scheduleK1Form1041 ?? []) {
    const qbi = k1.section199AQBI;
    if (qbi !== undefined && qbi !== "0") {
      sources.push({
        name: k1.estateTrustName,
        tin: k1.estateTrustEIN ?? "",
      });
    }
  }

  // Rental properties with QBI
  for (const rental of input.rentalProperties ?? []) {
    if ((rental as Record<string, unknown>).qualifiesForQBI) {
      sources.push({
        name: rental.description,
        tin: "",
      });
    }
  }

  return sources;
}

// ─── Fill Logic ────────────────────────────────────────────────────────────

export async function fillForm8995(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const f8995 = result.form8995!;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  // ── Line 1: Business Table ──
  const businessNameFields = [
    F.business1Name, F.business2Name, F.business3Name, F.business4Name, F.business5Name,
  ];
  const businessTINFields = [
    F.business1TIN, F.business2TIN, F.business3TIN, F.business4TIN, F.business5TIN,
  ];
  const businessQBIFields = [
    F.business1QBI, F.business2QBI, F.business3QBI, F.business4QBI, F.business5QBI,
  ];

  const sourceInfo = extractQBISourceInfo(input);
  const maxBusinesses = Math.min(f8995.qbiAmounts.length, 5);

  for (let i = 0; i < maxBusinesses; i++) {
    if (sourceInfo[i]) {
      setTextField(form, businessNameFields[i], sourceInfo[i].name);
      setTextField(form, businessTINFields[i], sourceInfo[i].tin);
    }
    setCurrencyField(form, businessQBIFields[i], f8995.qbiAmounts[i]);
  }

  // ── Line 2: Total QBI (sum of all business QBIs, before prior year loss) ──
  const grossQBI = f8995.qbiAmounts.reduce(
    (acc, q) => acc.plus(q),
    new Decimal(0),
  );
  setCurrencyField(form, F.line2, grossQBI);

  // ── Line 3: Prior year QBI loss carryforward ──
  // Derive from: totalQBI = grossQBI - priorYearLoss → priorYearLoss = grossQBI - totalQBI
  const priorYearQBILoss = grossQBI.minus(f8995.totalQBI);
  if (priorYearQBILoss.greaterThan(0)) {
    setCurrencyField(form, F.line3, priorYearQBILoss);
  }

  // ── Line 4: Total QBI after prior year loss (Line 2 − Line 3) ──
  setCurrencyField(form, F.line4, f8995.totalQBI);

  // ── Line 5: QBI component (20% of Line 4, floor 0) ──
  setCurrencyField(form, F.line5, f8995.qbiComponent);

  // ── Line 6: Qualified REIT dividends and PTP income ──
  setCurrencyField(form, F.line6, f8995.reitPTPAmount);

  // ── Line 7: Prior year REIT/PTP loss carryforward ──
  // Not separately tracked in engine result — leave blank if not available

  // ── Line 8: Total qualified REIT/PTP (Line 6 + Line 7) ──
  // Same as Line 6 when no prior year carryforward
  setCurrencyField(form, F.line8, f8995.reitPTPAmount);

  // ── Line 9: REIT/PTP component (20% of Line 8, floor 0) ──
  setCurrencyField(form, F.line9, f8995.reitPTPComponent);

  // ── Line 10: Combined component (Line 5 + Line 9) ──
  setCurrencyField(form, F.line10, f8995.combinedComponent);

  // ── Line 11: Taxable income before QBI deduction ──
  setCurrencyField(form, F.line11, f8995.taxableIncomeBeforeQBI);

  // ── Line 12: Net capital gain ──
  setCurrencyField(form, F.line12, f8995.netCapitalGainAmount);

  // ── Line 13: Line 11 minus Line 12 (floor 0) ──
  const line13 = zeroFloor(
    f8995.taxableIncomeBeforeQBI.minus(f8995.netCapitalGainAmount),
  );
  setCurrencyField(form, F.line13, line13);

  // ── Line 14: Income limitation (20% of Line 13) ──
  setCurrencyField(form, F.line14, f8995.incomeLimitation);

  // ── Line 15: QBI deduction (smaller of Line 10 or Line 14) ──
  setCurrencyField(form, F.line15, f8995.qbiDeduction);

  // ── Line 16: Total QBI loss carryforward ──
  if (f8995.qbiLossCarryforward.greaterThan(0)) {
    setCurrencyField(form, F.line16, f8995.qbiLossCarryforward);
  }

  // ── Line 17: Total REIT/PTP loss carryforward ──
  if (f8995.reitPTPAmount.lessThan(0)) {
    setCurrencyField(form, F.line17, f8995.reitPTPAmount.abs());
  }

  return doc;
}
