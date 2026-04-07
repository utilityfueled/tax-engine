/**
 * PDF filler for IRS Form 4797 — Sales of Business Property.
 *
 * Field names from the official 2025 IRS fillable PDF.
 * Page 1 = Part I (Section 1231 Gains/Losses) + Part II (Ordinary Gains/Losses).
 * Page 2 = Part III (Depreciation Recapture) + Part IV (Recapture Amounts).
 *
 * Part III per-property recapture flows to:
 *   - Part I (section 1231 gain for long-term properties)
 *   - Part II (ordinary recapture + short-term ordinary)
 */

import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import {
  loadBlankPdf,
  setTextField,
  setCurrencyField,
  formatCurrency,
} from "./pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const p1t2 = (row: string, n: string) =>
  `topmostSubform[0].Page1[0].TableLine2[0].${row}.${n}`;
const p1t10 = (row: string, n: string) =>
  `topmostSubform[0].Page1[0].TableLine10[0].${row}.${n}`;
const p2 = (n: string) => `topmostSubform[0].Page2[0].${n}`;
const p2t1 = (row: string, n: string) =>
  `topmostSubform[0].Page2[0].PartIIITable1[0].${row}.${n}`;
const p2t2 = (row: string, n: string) =>
  `topmostSubform[0].Page2[0].PartIIITable2[0].${row}.${n}`;

// ─── Part I Line 2 Table ──────────────────────────────────────────────────
// 4 rows × 7 columns: (a) description, (b) date acquired, (c) date sold,
// (d) gross sales price, (e) depreciation, (f) cost/basis, (g) gain/(loss)

interface PropertyRow {
  description: string;
  dateAcquired: string;
  dateSold: string;
  grossSalesPrice: string;
  depreciation: string;
  costBasis: string;
  gainLoss: string;
}

function makePartIRows(): PropertyRow[] {
  const rows: PropertyRow[] = [];
  for (let row = 0; row < 4; row++) {
    const r = `Row${row + 1}[0]`;
    const base = 6 + row * 7;
    const f = (offset: number) =>
      p1t2(r, `f1_${(base + offset).toString().toString()}[0]`);
    rows.push({
      description: f(0),
      dateAcquired: f(1),
      dateSold: f(2),
      grossSalesPrice: f(3),
      depreciation: f(4),
      costBasis: f(5),
      gainLoss: f(6),
    });
  }
  return rows;
}

// ─── Part II Line 10 Table ────────────────────────────────────────────────
// Same 4 rows × 7 columns structure as Part I

function makePartIIRows(): PropertyRow[] {
  const rows: PropertyRow[] = [];
  for (let row = 0; row < 4; row++) {
    const r = `Row${row + 1}[0]`;
    const base = 41 + row * 7;
    const f = (offset: number) =>
      p1t10(r, `f1_${(base + offset).toString().toString()}[0]`);
    rows.push({
      description: f(0),
      dateAcquired: f(1),
      dateSold: f(2),
      grossSalesPrice: f(3),
      depreciation: f(4),
      costBasis: f(5),
      gainLoss: f(6),
    });
  }
  return rows;
}

const PART_I_ROWS = makePartIRows();
const PART_II_ROWS = makePartIIRows();

// ─── Part III Per-Property Columns ────────────────────────────────────────
// Up to 4 property columns: (a), (b), (c), (d)

interface PartIIIColumn {
  // Table 1 header (Line 19)
  description: string;
  dateAcquired: string;
  dateSold: string;
  // Table 2 detail (Lines 20–29b)
  line20: string;
  line21: string;
  line22: string;
  line23: string;
  line24: string;
  line25a: string;
  line25b: string;
  line26a: string;
  line26b: string;
  line26c: string;
  line26d: string;
  line26e: string;
  line26f: string;
  line26g: string;
  line27a: string;
  line27b: string;
  line27c: string;
  line28a: string;
  line28b: string;
  line29a: string;
  line29b: string;
}

function makePartIIIColumns(): PartIIIColumn[] {
  const cols: PartIIIColumn[] = [];
  for (let col = 0; col < 4; col++) {
    const t1Base = 1 + col * 3;
    const t1f = (offset: number) =>
      p2t1(
        `Row${col + 1}[0]`,
        `f2_${(t1Base + offset).toString().toString()}[0]`,
      );
    // Detail table: row fields are sequential, 4 per row (one per property column)
    const t2f = (rowName: string, baseField: number) =>
      p2t2(
        `${rowName}[0]`,
        `f2_${(baseField + col).toString().toString()}[0]`,
      );
    cols.push({
      description: t1f(0),
      dateAcquired: t1f(1),
      dateSold: t1f(2),
      line20: t2f("Row20", 13),
      line21: t2f("Row21", 17),
      line22: t2f("Row22", 21),
      line23: t2f("Row23", 25),
      line24: t2f("Row24", 29),
      line25a: t2f("Row25a", 33),
      line25b: t2f("Row25b", 37),
      line26a: t2f("Row26a", 41),
      line26b: t2f("Row26b", 45),
      line26c: t2f("Row26c", 49),
      line26d: t2f("Row26d", 53),
      line26e: t2f("Row26e", 57),
      line26f: t2f("Row26f", 61),
      line26g: t2f("Row26g", 65),
      line27a: t2f("Row27a", 69),
      line27b: t2f("Row27b", 73),
      line27c: t2f("Row27c", 77),
      line28a: t2f("Row28a", 81),
      line28b: t2f("Row28b", 85),
      line29a: t2f("Row29a", 89),
      line29b: t2f("Row29b", 93),
    });
  }
  return cols;
}

const PART_III_COLS = makePartIIIColumns();

// ─── Field Mapping ─────────────────────────────────────────────────────────

const FIELDS = {
  // ── Page 1 Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),

  // Part I Line 2 table
  partIRows: PART_I_ROWS,

  // Part I Lines 3–9
  line3: p1("f1_34[0]"),
  line4: p1("f1_35[0]"),
  line5: p1("f1_36[0]"),
  line6: p1("f1_37[0]"),
  line7: p1("f1_38[0]"),
  line8: p1("f1_39[0]"),
  line9: p1("f1_40[0]"),

  // Part II Line 10 table
  partIIRows: PART_II_ROWS,

  // Part II Lines 11–18b
  line11: p1("f1_69[0]"),
  line12: p1("f1_70[0]"),
  line13: p1("f1_71[0]"),
  line14: p1("f1_72[0]"),
  line15: p1("f1_73[0]"),
  line16: p1("f1_74[0]"),
  line17: p1("f1_75[0]"),
  line18a: p1("f1_76[0]"),
  line18b: p1("f1_77[0]"),

  // Part III columns
  partIIICols: PART_III_COLS,

  // Part III summary (Lines 30–32)
  line30: p2("f2_97[0]"),
  line31: p2("f2_98[0]"),
  line32: p2("f2_99[0]"),
} as const;

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Form 4797 PDF from engine results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillForm4797(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  const doc = await loadBlankPdf(blankPdfPath);
  const form = doc.getForm();
  const F = FIELDS;
  const f4797 = result.form4797;
  if (!f4797) return doc;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  // ── Part I: Section 1231 Gains and Losses ──

  // Line 2 table: K-1 section 1231 entries
  let partIRowIdx = 0;
  for (const k1 of input.scheduleK1) {
    const section1231 = new Decimal(k1.section1231Gain ?? 0);
    if (section1231.isZero() || partIRowIdx >= PART_I_ROWS.length) continue;
    const row = F.partIRows[partIRowIdx];
    setTextField(form, row.description, `K-1: ${k1.partnershipName}`);
    setTextField(form, row.dateAcquired, "Various");
    setTextField(form, row.gainLoss, formatCurrency(section1231));
    partIRowIdx++;
  }

  // Line 5: Section 1231 gain from like-kind exchanges (Form 8824)
  if (f4797.supportedForm8824Section1231GainOrLoss.gt(0)) {
    setCurrencyField(form, F.line5, f4797.supportedForm8824Section1231GainOrLoss);
  }

  // Line 6: Section 1231 gain from Part III long-term properties
  const line6 = f4797.propertyResults
    .filter((pr) => pr.heldMoreThanOneYear)
    .reduce((acc, pr) => acc.plus(pr.section1231Gain), new Decimal(0));
  if (!line6.isZero()) {
    setCurrencyField(form, F.line6, line6);
  }

  // Lines 7–9
  setCurrencyField(form, F.line7, f4797.line7);
  setCurrencyField(form, F.line8, f4797.line8);
  setCurrencyField(form, F.line9, f4797.line9);

  // ── Part II: Ordinary Gains and Losses ──

  // Lines 11–12 (from Part I)
  setCurrencyField(form, F.line11, f4797.line11);
  setCurrencyField(form, F.line12, f4797.line12);

  // Line 13: Gain from Part III recapture
  if (f4797.partIIRecapture.gt(0)) {
    setCurrencyField(form, F.line13, f4797.partIIRecapture);
  }

  // Line 16: Ordinary gain from like-kind exchanges (Form 8824)
  if (f4797.supportedForm8824OrdinaryIncome.gt(0)) {
    setCurrencyField(form, F.line16, f4797.supportedForm8824OrdinaryIncome);
  }

  // Line 17: Combine lines 10–16
  setCurrencyField(form, F.line17, f4797.ordinaryGainOrLoss);

  // Line 18b: For individual returns (same as line 17)
  setCurrencyField(form, F.line18b, f4797.ordinaryGainOrLoss);

  // ── Part III: Depreciation Recapture ──

  const propertySales = input.form4797?.propertySales ?? [];
  const limit = Math.min(f4797.propertyResults.length, PART_III_COLS.length);

  for (let i = 0; i < limit; i++) {
    const pr = f4797.propertyResults[i];
    const sale = propertySales[i];
    const col = F.partIIICols[i];

    // Line 19 header: description, dates
    setTextField(form, col.description, pr.description);
    if (sale?.dateAcquired) setTextField(form, col.dateAcquired, sale.dateAcquired);
    if (sale?.dateSold) setTextField(form, col.dateSold, sale.dateSold);

    // Lines 20–24: basis and gain
    setCurrencyField(form, col.line20, pr.costOrBasis);
    setCurrencyField(form, col.line21, pr.depreciationAllowed);
    setCurrencyField(form, col.line22, pr.adjustedBasis);
    setCurrencyField(form, col.line23, pr.grossSalesPrice);
    setCurrencyField(form, col.line24, pr.totalGain);

    if (pr.propertyType === "section1245") {
      // Section 1245: all depreciation recaptured as ordinary
      setCurrencyField(form, col.line25a, pr.depreciationAllowed);
      setTextField(form, col.line25b, "100%");
      setCurrencyField(form, col.line27a, pr.section1245Recapture);
      setCurrencyField(form, col.line27c, pr.totalRecapture);
      setCurrencyField(form, col.line28a, pr.nonRecaptureGain);
      if (pr.heldMoreThanOneYear && pr.section1231Gain.gt(0)) {
        setCurrencyField(form, col.line29a, pr.section1231Gain);
      } else if (pr.nonRecaptureGain.gt(0)) {
        setCurrencyField(form, col.line29b, pr.nonRecaptureGain);
      }
    } else {
      // Section 1250: excess depreciation over straight-line recaptured
      setCurrencyField(form, col.line26g, pr.section1250Recapture);
      setCurrencyField(form, col.line27b, pr.section1250Recapture);
      setCurrencyField(form, col.line27c, pr.totalRecapture);
      setCurrencyField(form, col.line28b, pr.nonRecaptureGain);
      if (pr.heldMoreThanOneYear && pr.section1231Gain.gt(0)) {
        setCurrencyField(form, col.line29a, pr.section1231Gain);
      } else if (pr.nonRecaptureGain.gt(0)) {
        setCurrencyField(form, col.line29b, pr.nonRecaptureGain);
      }
    }
  }

  // Part III summary lines
  // Line 30: Total recapture from Part III → Part II Line 13
  if (f4797.partIIRecapture.gt(0)) {
    setCurrencyField(form, F.line30, f4797.partIIRecapture);
  }

  // Line 32: Section 1231 gain from Part III → Part I Line 6
  if (line6.gt(0)) {
    setCurrencyField(form, F.line32, line6);
  }

  return doc;
}

/** Exported field map for testing and inspection. */
export { FIELDS as FORM_4797_FIELDS };
