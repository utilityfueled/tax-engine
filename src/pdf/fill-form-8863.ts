/**
 * PDF filler for IRS Form 8863 — Education Credits
 * (American Opportunity and Lifetime Learning Credits)
 *
 * Field names verified against 2025 Form 8863 fillable PDF debug labels.
 *
 * This filler recomputes Form 8863 from inputs and AGI (same pattern as
 * Form 8949), since the engine result is not persisted on TaxReturnResult.
 */

import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { FilingStatus } from "@/models/constants.js";
import { calculateForm8863 } from "@/engine/forms/form-8863.js";
import {
  loadBlankPdf,
  setTextField,
  setCurrencyField,
  setCheckBox,
} from "./pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const p1ssn = (n: string) => `topmostSubform[0].Page1[0].SocialSecurity[0].${n}`;
const p2 = (n: string) => `topmostSubform[0].Page2[0].${n}`;
const p2ssn = (n: string) => `topmostSubform[0].Page2[0].SSN[0].${n}`;
const p2studentSsn = (n: string) => `topmostSubform[0].Page2[0].StudentSSN[0].${n}`;
const p2line22a = (n: string) => `topmostSubform[0].Page2[0].Line22a[0].${n}`;
const p2line22b = (n: string) => `topmostSubform[0].Page2[0].Line22b[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────

export const FORM_8863_FIELDS = {
  // ── Page 1 Header ──
  name: p1("f1_1[0]"),
  ssn1: p1ssn("f1_2[0]"),
  ssn2: p1ssn("f1_3[0]"),
  ssn3: p1ssn("f1_4[0]"),

  // ── Part I: Refundable American Opportunity Credit ──
  line1: p1("f1_5[0]"),      // Total tentative AOC from all Parts III, line 30
  line2: p1("f1_6[0]"),      // $180,000 (MFJ) or $90,000 (others)
  line3: p1("f1_7[0]"),      // MAGI from Form 1040, line 11b
  line4: p1("f1_8[0]"),      // Line 2 minus Line 3
  line5: p1("f1_9[0]"),      // $20,000 (MFJ) or $10,000 (others)
  line6int: p1("f1_10[0]"),  // Line 6 integer part (before decimal point)
  line6dec: p1("f1_11[0]"),  // Line 6 decimal part (after decimal point)
  line7: p1("f1_12[0]"),     // Line 1 × Line 6 (AOC after phase-out)
  underAge24: p1("c1_1[0]"), // Under age 24 checkbox
  line8: p1("f1_13[0]"),     // Refundable AOC = Line 7 × 0.40

  // ── Part II: Nonrefundable Education Credits ──
  line9: p1("f1_14[0]"),     // Line 7 minus Line 8 (nonrefundable AOC)
  line10: p1("f1_15[0]"),    // LLC expenses from all Parts III, line 31
  line11: p1("f1_16[0]"),    // Smaller of line 10 or $10,000
  line12: p1("f1_17[0]"),    // Line 11 × 20%
  line13: p1("f1_18[0]"),    // $180,000 (MFJ) or $90,000 (others)
  line14: p1("f1_19[0]"),    // MAGI
  line15: p1("f1_20[0]"),    // Line 13 minus Line 14
  line16: p1("f1_21[0]"),    // $20,000 (MFJ) or $10,000 (others)
  line17int: p1("f1_22[0]"), // Line 17 integer part
  line17dec: p1("f1_23[0]"), // Line 17 decimal part
  line18: p1("f1_24[0]"),    // Line 12 × Line 17 (LLC after phase-out)
  line19: p1("f1_25[0]"),    // Total nonrefundable → Schedule 3, line 3

  // ── Page 2 Header ──
  p2Name: p2("f2_1[0]"),
  p2Ssn1: p2ssn("f2_2[0]"),
  p2Ssn2: p2ssn("f2_3[0]"),
  p2Ssn3: p2ssn("f2_4[0]"),

  // ── Part III: Student and Education Information ──
  studentName: p2("f2-5[0]"),              // Line 20 (note: hyphen, not underscore)
  studentSsn1: p2studentSsn("f2_6[0]"),   // Line 21 SSN part 1
  studentSsn2: p2studentSsn("f2_7[0]"),   // Line 21 SSN part 2
  studentSsn3: p2studentSsn("f2_8[0]"),   // Line 21 SSN part 3

  // Line 22a: First educational institution
  inst1Name: p2line22a("f2_9[0]"),
  inst1Address: p2line22a("f2_10[0]"),
  inst1_1098tYes: p2line22a("c2_1[0]"),
  inst1_1098tNo: p2line22a("c2_1[1]"),
  inst1_1098tPriorYes: p2line22a("c2_2[0]"),
  inst1_1098tPriorNo: p2line22a("c2_2[1]"),

  // Line 22b: Second educational institution
  inst2Name: p2line22b("f2_20[0]"),
  inst2Address: p2line22b("f2_21[0]"),
  inst2_1098tYes: p2line22b("c2_3[0]"),
  inst2_1098tNo: p2line22b("c2_3[1]"),
  inst2_1098tPriorYes: p2line22b("c2_4[0]"),
  inst2_1098tPriorNo: p2line22b("c2_4[1]"),

  // Questions 23–26
  q23Yes: p2("c2_5[0]"),    // AOC claimed for 4+ prior years? Yes → stop
  q23No: p2("c2_5[1]"),
  q24Yes: p2("c2_6[0]"),    // Enrolled at least half-time?
  q24No: p2("c2_6[1]"),
  q25Yes: p2("c2_7[0]"),    // Completed first 4 years before 2025?
  q25No: p2("c2_7[1]"),
  q26Yes: p2("c2_8[0]"),    // Felony conviction?
  q26No: p2("c2_8[1]"),

  // Lines 27–31: AOC and LLC computation
  line27: p2("f2_31[0]"),   // Adjusted qualified expenses (max $4,000)
  line28: p2("f2_32[0]"),   // Line 27 minus $2,000 (zero floor)
  line29: p2("f2_33[0]"),   // Line 28 × 25%
  line30: p2("f2_34[0]"),   // Tentative AOC per student
  line31: p2("f2_35[0]"),   // LLC adjusted qualified expenses
} as const;

const F = FORM_8863_FIELDS;

// ─── Helpers ───────────────────────────────────────────────────────────────

function d(v: string | number | Decimal): Decimal {
  return v instanceof Decimal ? v : new Decimal(v);
}

function getThreshold(filingStatus: string): Decimal {
  return filingStatus === "married_filing_jointly"
    ? new Decimal(180000)
    : new Decimal(90000);
}

function getPhaseOutRange(filingStatus: string): Decimal {
  return filingStatus === "married_filing_jointly"
    ? new Decimal(20000)
    : new Decimal(10000);
}

function computePhaseOutRatio(magi: Decimal, filingStatus: string): Decimal {
  if (filingStatus === "married_filing_separately") return new Decimal(0);
  const threshold = getThreshold(filingStatus);
  const range = getPhaseOutRange(filingStatus);
  const excess = Decimal.max(threshold.minus(magi), new Decimal(0));
  if (excess.gte(range)) return new Decimal(1);
  if (excess.lte(0)) return new Decimal(0);
  return excess.dividedBy(range);
}

/** Format a phase-out ratio as integer + 3-digit decimal parts (e.g. 1.000 or 0.850). */
function formatDecimalRatio(ratio: Decimal): { intPart: string; decPart: string } {
  const clamped = Decimal.min(Decimal.max(ratio, new Decimal(0)), new Decimal(1));
  const intPart = clamped.floor().toFixed(0);
  const decPart = clamped
    .minus(clamped.floor())
    .times(1000)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toFixed(0)
    .padStart(3, "0");
  return { intPart, decPart };
}

// ─── Fill Logic ────────────────────────────────────────────────────────────

export async function fillForm8863(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  const doc = await loadBlankPdf(blankPdfPath);
  const form = doc.getForm();

  const edu = input.educationExpenses;
  if (!edu) return doc;

  // Recompute Form 8863 from inputs (engine result isn't on TaxReturnResult)
  const form8863 = calculateForm8863({
    aocStudents: edu.aocStudents.map((s) => ({
      name: s.name,
      qualifiedExpenses: d(s.qualifiedExpenses),
      priorYearsClaimed: s.priorYearsClaimed,
    })),
    llcExpenses: d(edu.llcExpenses ?? 0),
    magi: result.agi,
    filingStatus: result.filingStatus as FilingStatus,
  });

  const filingStatus = result.filingStatus;
  const magi = result.agi;

  // ── Page 1 Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);

  const ssn = input.taxpayer.primary.ssn.replace(/-/g, "");
  setTextField(form, F.ssn1, ssn.slice(0, 3));
  setTextField(form, F.ssn2, ssn.slice(3, 5));
  setTextField(form, F.ssn3, ssn.slice(5, 9));

  // ── Part I: Refundable American Opportunity Credit ──
  const threshold = getThreshold(filingStatus);
  const phaseOutRange = getPhaseOutRange(filingStatus);
  const excessOverThreshold = Decimal.max(threshold.minus(magi), new Decimal(0));
  const phaseOutRatio = computePhaseOutRatio(magi, filingStatus);

  setCurrencyField(form, F.line1, form8863.aocTotalTentative);
  setCurrencyField(form, F.line2, threshold);
  setCurrencyField(form, F.line3, magi);
  setCurrencyField(form, F.line4, excessOverThreshold);
  setCurrencyField(form, F.line5, phaseOutRange);

  const { intPart: l6int, decPart: l6dec } = formatDecimalRatio(phaseOutRatio);
  setTextField(form, F.line6int, l6int);
  setTextField(form, F.line6dec, l6dec);

  setCurrencyField(form, F.line7, form8863.aocAfterPhaseOut);
  setCurrencyField(form, F.line8, form8863.aocRefundable);

  // ── Part II: Nonrefundable Education Credits ──
  setCurrencyField(form, F.line9, form8863.aocNonrefundable);

  const llcExpenses = d(edu.llcExpenses ?? 0);
  const llcQualifying = Decimal.min(llcExpenses, new Decimal(10000));
  const llcTentative = llcQualifying
    .times(new Decimal(0.20))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  setCurrencyField(form, F.line10, llcExpenses);
  setCurrencyField(form, F.line11, llcQualifying);
  setCurrencyField(form, F.line12, llcTentative);
  setCurrencyField(form, F.line13, threshold);
  setCurrencyField(form, F.line14, magi);
  setCurrencyField(form, F.line15, excessOverThreshold);
  setCurrencyField(form, F.line16, phaseOutRange);

  const { intPart: l17int, decPart: l17dec } = formatDecimalRatio(phaseOutRatio);
  setTextField(form, F.line17int, l17int);
  setTextField(form, F.line17dec, l17dec);

  setCurrencyField(form, F.line18, form8863.llcAfterPhaseOut);
  setCurrencyField(form, F.line19, form8863.totalNonrefundable);

  // ── Page 2 Header ──
  setTextField(form, F.p2Name, name);
  setTextField(form, F.p2Ssn1, ssn.slice(0, 3));
  setTextField(form, F.p2Ssn2, ssn.slice(3, 5));
  setTextField(form, F.p2Ssn3, ssn.slice(5, 9));

  // ── Part III: First AOC student ──
  if (edu.aocStudents.length > 0) {
    const student = edu.aocStudents[0];
    const studentResult = form8863.aocPerStudent[0];

    setTextField(form, F.studentName, student.name);

    // Q23: Has AOC been claimed for 4+ prior tax years?
    const priorYears = student.priorYearsClaimed ?? 0;
    if (priorYears >= 4) {
      setCheckBox(form, F.q23Yes, true);
    } else {
      setCheckBox(form, F.q23No, true);
      // Q26: Felony conviction — assume No (input doesn't track this)
      setCheckBox(form, F.q26No, true);
    }

    // Lines 27–30: AOC computation
    const qualifiedExpenses = Decimal.min(d(student.qualifiedExpenses), new Decimal(4000));
    setCurrencyField(form, F.line27, qualifiedExpenses);

    const line28 = Decimal.max(qualifiedExpenses.minus(new Decimal(2000)), new Decimal(0));
    setCurrencyField(form, F.line28, line28);

    if (line28.gt(0)) {
      const line29 = line28
        .times(new Decimal(0.25))
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      setCurrencyField(form, F.line29, line29);
    }

    setCurrencyField(form, F.line30, studentResult.tentativeCredit);
  }

  // Line 31: LLC expenses
  if (llcExpenses.gt(0)) {
    setCurrencyField(form, F.line31, llcExpenses);
  }

  return doc;
}
