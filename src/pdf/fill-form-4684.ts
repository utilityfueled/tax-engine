/**
 * PDF filler for IRS Form 4684 — Casualties and Thefts, Section A (Personal Use Property).
 *
 * Field names from the official 2025 IRS fillable PDF.
 * Each event requires a separate Form 4684 through line 12; lines 13–18 aggregate all events.
 * This filler handles the first event's per-property detail and the aggregate summary.
 */

import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { Form4684Event } from "@/models/inputs.js";
import {
  loadBlankPdf,
  setTextField,
  setCurrencyField,
  setCheckBox,
} from "./pdf-utils.js";

const ZERO = new Decimal(0);

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const tblLine1 = (row: string, n: string) =>
  `topmostSubform[0].Page1[0].Table_Line1[0].Row${row}[0].${n}`;
const tblLines29 = (line: number, n: string) =>
  `topmostSubform[0].Page1[0].Table_Lines2-9[0].Line${line}[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Form 4684 fillable PDF field inspection.

export const FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),
  disasterCheckbox: p1("c1_1[0]"),
  drNumber: p1("f1_3[0]"),
  emNumber: p1("f1_4[0]"),

  // ── Line 1: Property descriptions (4 fields per property) ──
  // Type of Property, City/State, ZIP Code, Date Acquired
  properties: [
    {
      type: tblLine1("A", "f1_5[0]"),
      cityState: tblLine1("A", "f1_6[0]"),
      zip: tblLine1("A", "f1_7[0]"),
      dateAcquired: tblLine1("A", "f1_8[0]"),
    },
    {
      type: tblLine1("B", "f1_9[0]"),
      cityState: tblLine1("B", "f1_10[0]"),
      zip: tblLine1("B", "f1_11[0]"),
      dateAcquired: tblLine1("B", "f1_12[0]"),
    },
    {
      type: tblLine1("C", "f1_13[0]"),
      cityState: tblLine1("C", "f1_14[0]"),
      zip: tblLine1("C", "f1_15[0]"),
      dateAcquired: tblLine1("C", "f1_16[0]"),
    },
    {
      type: tblLine1("D", "f1_17[0]"),
      cityState: tblLine1("D", "f1_18[0]"),
      zip: tblLine1("D", "f1_19[0]"),
      dateAcquired: tblLine1("D", "f1_20[0]"),
    },
  ],

  // ── Lines 2–9: Per-property monetary values (columns A, B, C, D) ──
  line2: [tblLines29(2, "f1_21[0]"), tblLines29(2, "f1_22[0]"), tblLines29(2, "f1_23[0]"), tblLines29(2, "f1_24[0]")] as const,
  line3: [tblLines29(3, "f1_25[0]"), tblLines29(3, "f1_26[0]"), tblLines29(3, "f1_27[0]"), tblLines29(3, "f1_28[0]")] as const,
  line4: [tblLines29(4, "f1_29[0]"), tblLines29(4, "f1_30[0]"), tblLines29(4, "f1_31[0]"), tblLines29(4, "f1_32[0]")] as const,
  line5: [tblLines29(5, "f1_33[0]"), tblLines29(5, "f1_34[0]"), tblLines29(5, "f1_35[0]"), tblLines29(5, "f1_36[0]")] as const,
  line6: [tblLines29(6, "f1_37[0]"), tblLines29(6, "f1_38[0]"), tblLines29(6, "f1_39[0]"), tblLines29(6, "f1_40[0]")] as const,
  line7: [tblLines29(7, "f1_41[0]"), tblLines29(7, "f1_42[0]"), tblLines29(7, "f1_43[0]"), tblLines29(7, "f1_44[0]")] as const,
  line8: [tblLines29(8, "f1_45[0]"), tblLines29(8, "f1_46[0]"), tblLines29(8, "f1_47[0]"), tblLines29(8, "f1_48[0]")] as const,
  line9: [tblLines29(9, "f1_49[0]"), tblLines29(9, "f1_50[0]"), tblLines29(9, "f1_51[0]"), tblLines29(9, "f1_52[0]")] as const,

  // ── Summary lines (single values) ──
  line10: p1("f1_53[0]"),  // Total loss (add line 9 columns A–D)
  line11: p1("f1_54[0]"),  // $100 per-event floor ($500 for qualified disaster)
  line12: p1("f1_55[0]"),  // Line 10 minus line 11

  // ── Aggregate lines (across all Forms 4684) ──
  line13: p1("f1_56[0]"),  // Total gains (line 4 of all Forms 4684)
  line14: p1("f1_57[0]"),  // Total losses (line 12 of all Forms 4684)
  line15: p1("f1_58[0]"),  // Net gain if gains > losses → Schedule D
  line16: p1("f1_59[0]"),  // Net loss (line 14 − line 13 − line 15)
  line17: p1("f1_60[0]"),  // 10% of AGI
  line18: p1("f1_61[0]"),  // Deductible loss (line 16 − line 17) → Schedule A line 15
} as const;

// ─── Per-Property Computation ──────────────────────────────────────────────
// Recomputes per-property values from input for the PDF detail columns.

interface PropertyComputed {
  basis: Decimal;
  insurance: Decimal;
  gain: Decimal;
  fmvBefore: Decimal;
  fmvAfter: Decimal;
  fmvDecrease: Decimal;
  smallerOfBasisOrDecrease: Decimal;
  netLoss: Decimal;
}

function d(v: string | undefined): Decimal {
  if (!v || v.trim() === "") return ZERO;
  return new Decimal(v);
}

function zeroFloor(val: Decimal): Decimal {
  return Decimal.max(ZERO, val);
}

function computePropertyForPdf(prop: {
  costOrBasis?: string;
  insuranceReimbursement?: string;
  fairMarketValueBefore?: string;
  fairMarketValueAfter?: string;
}): PropertyComputed {
  const basis = Decimal.max(ZERO, d(prop.costOrBasis));
  const insurance = Decimal.max(ZERO, d(prop.insuranceReimbursement));
  const fmvBefore = Decimal.max(ZERO, d(prop.fairMarketValueBefore));
  const fmvAfter = Decimal.max(ZERO, d(prop.fairMarketValueAfter));

  const fmvDecrease = zeroFloor(fmvBefore.minus(fmvAfter));
  const smallerOfBasisOrDecrease = Decimal.min(basis, fmvDecrease);
  const gain = zeroFloor(insurance.minus(basis));
  const netLoss = zeroFloor(smallerOfBasisOrDecrease.minus(insurance));

  return { basis, insurance, gain, fmvBefore, fmvAfter, fmvDecrease, smallerOfBasisOrDecrease, netLoss };
}

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Form 4684 Section A PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 *
 * Fills per-property detail for the first event (up to 4 properties A–D),
 * per-event totals (lines 10–12), and aggregate summary (lines 13–18).
 */
export async function fillForm4684(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  const doc = await loadBlankPdf(blankPdfPath);
  const form = doc.getForm();
  const F = FIELDS;
  const f4684 = result.form4684;

  // ── Header ──
  const name = `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!f4684 || !input.form4684) return doc;

  const events = input.form4684.events;
  if (events.length === 0) return doc;

  // Use first event for per-property detail (IRS requires separate Form 4684 per event)
  const event = events[0];

  // ── Disaster declaration ──
  if (event.femaDeclarationNumber) {
    setCheckBox(form, F.disasterCheckbox, true);
    const femaNum = event.femaDeclarationNumber.trim();
    if (femaNum.toUpperCase().startsWith("DR-")) {
      setTextField(form, F.drNumber, femaNum.replace(/^DR-/i, ""));
    } else if (femaNum.toUpperCase().startsWith("EM-")) {
      setTextField(form, F.emNumber, femaNum.replace(/^EM-/i, ""));
    } else {
      // Default to DR field
      setTextField(form, F.drNumber, femaNum);
    }
  }

  // ── Per-property detail (up to 4 properties for columns A–D) ──
  fillEventProperties(form, event);

  // ── Per-event summary (lines 10–12) ──
  const eventTotalLoss = computeEventTotalLoss(event);
  const perEventFloor = new Decimal(100);
  const eventLossAfterFloor = zeroFloor(eventTotalLoss.minus(perEventFloor));

  setCurrencyField(form, F.line10, eventTotalLoss);
  setCurrencyField(form, F.line11, perEventFloor);
  setCurrencyField(form, F.line12, eventLossAfterFloor);

  // ── Aggregate summary (lines 13–18 from engine result) ──
  // Note: Form line 13 = total gains (line 4), Form line 14 = total losses (line 12)
  // The engine result uses different naming — map correctly to form lines.
  setCurrencyField(form, F.line13, f4684.totalGains);
  setCurrencyField(form, F.line14, f4684.totalLosses);
  setCurrencyField(form, F.line15, f4684.netCasualtyGain);

  // Line 16: losses − gains (only when losses > gains)
  if (f4684.totalLosses.gt(f4684.totalGains)) {
    setCurrencyField(form, F.line16, f4684.netLossBeforeAgi);
  }

  setCurrencyField(form, F.line17, f4684.tenPercentAgi);
  setCurrencyField(form, F.line18, f4684.deductibleLoss);

  return doc;
}

function fillEventProperties(
  form: import("pdf-lib").PDFForm,
  event: Form4684Event,
): void {
  const F = FIELDS;
  const properties = event.properties.slice(0, 4);

  for (let i = 0; i < properties.length; i++) {
    const prop = properties[i];
    const propFields = F.properties[i];
    const computed = computePropertyForPdf(prop);

    // Line 1: Description
    setTextField(form, propFields.type, prop.description || "");

    // Lines 2–9: Monetary values per column
    setCurrencyField(form, F.line2[i], computed.basis);
    setCurrencyField(form, F.line3[i], computed.insurance);
    setCurrencyField(form, F.line4[i], computed.gain);
    setCurrencyField(form, F.line5[i], computed.fmvBefore);
    setCurrencyField(form, F.line6[i], computed.fmvAfter);
    setCurrencyField(form, F.line7[i], computed.fmvDecrease);
    setCurrencyField(form, F.line8[i], computed.smallerOfBasisOrDecrease);
    setCurrencyField(form, F.line9[i], computed.netLoss);
  }
}

function computeEventTotalLoss(event: Form4684Event): Decimal {
  let total = ZERO;
  for (const prop of event.properties) {
    const computed = computePropertyForPdf(prop);
    total = total.plus(computed.netLoss);
  }
  return total;
}

/** Exported field map for testing and inspection. */
export { FIELDS as FORM_4684_FIELDS };
