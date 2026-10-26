import { assertPreparedEducationReturn, hasInKindEducationReviewSources, prepareEducationReview, type PreparedEducationReview } from "../../education-review-context.js";
import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for IRS Form 5329 — Additional Taxes on Qualified Plans
 * (Including IRAs) and Other Tax-Favored Accounts.
 *
 * Field names verified against 2025 Form 5329 fillable PDF field inspection.
 *
 * Covers all nine parts:
 * - Part I: Early distributions from IRAs/qualified plans
 * - Part II: Additional tax on education/ABLE account distributions
 * - Part III: Excess contributions to traditional IRAs
 * - Part IV: Excess contributions to Roth IRAs
 * - Part V: Excess contributions to Coverdell ESAs
 * - Part VI: Excess contributions to Archer MSAs
 * - Part VII: Excess contributions to HSAs
 * - Part VIII: Excess contributions to ABLE accounts
 * - Part IX: Excess accumulations (RMD penalty)
 */

import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { calculateForm5329Hsa } from "@/engine/forms/form-5329-hsa.js";
import { buildForm1099QReferenceSummary } from "./fill-form-1099-q.js";
import { roundDollar } from "@/utils/decimal.js";
import {
  loadReviewTemplate,
  setTextField,
  setCurrencyField,
} from "../../pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const p2 = (n: string) => `topmostSubform[0].Page2[0].${n}`;
const p3 = (n: string) => `topmostSubform[0].Page3[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Form 5329 fillable PDF debug labels.

export const FORM_5329_FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),
  address: p1("f1_3[0]"),
  aptNo: p1("f1_4[0]"),
  cityStateZip: p1("f1_5[0]"),
  foreignCountry: p1("f1_6[0]"),
  foreignProvince: p1("f1_7[0]"),
  foreignPostalCode: p1("f1_8[0]"),

  // ── Part I: Early Distributions (Lines 1–4) ──
  line1: p1("f1_9[0]"),
  line2ExceptionNumber: p1("f1_10[0]"),
  line2: p1("f1_11[0]"),
  line3: p1("f1_12[0]"),
  line4: p1("f1_13[0]"),

  // ── Part II: Education/ABLE Distributions (Lines 5–8) ──
  line5: p1("f1_14[0]"),
  line6: p1("f1_15[0]"),
  line7: p1("f1_16[0]"),
  line8: p1("f1_17[0]"),

  // ── Part III: Excess Traditional IRA Contributions (Lines 9–17) ──
  line9: p1("f1_18[0]"),
  line10: p1("f1_19[0]"),
  line11: p1("f1_20[0]"),
  line12: p1("f1_21[0]"),
  line13: p1("f1_22[0]"),
  line14: p1("f1_23[0]"),
  line15: p1("f1_24[0]"),
  line16: p1("f1_25[0]"),
  line17: p1("f1_26[0]"),

  // ── Part IV: Excess Roth IRA Contributions (Lines 18–25) ──
  line18: p1("f1_27[0]"),
  line19: p1("f1_28[0]"),
  line20: p1("f1_29[0]"),
  line21: p1("f1_30[0]"),
  line22: p1("f1_31[0]"),
  line23: p1("f1_32[0]"),
  line24: p1("f1_33[0]"),
  line25: p1("f1_34[0]"),

  // ── Part V: Excess Coverdell ESA Contributions (Lines 26–33) ──
  line26: p2("f2_1[0]"),
  line27: p2("f2_2[0]"),
  line28: p2("f2_3[0]"),
  line29: p2("f2_4[0]"),
  line30: p2("f2_5[0]"),
  line31: p2("f2_6[0]"),
  line32: p2("f2_7[0]"),
  line33: p2("f2_8[0]"),

  // ── Part VI: Excess Archer MSA Contributions (Lines 34–41) ──
  line34: p2("f2_9[0]"),
  line35: p2("f2_10[0]"),
  line36: p2("f2_11[0]"),
  line37: p2("f2_12[0]"),
  line38: p2("f2_13[0]"),
  line39: p2("f2_14[0]"),
  line40: p2("f2_15[0]"),
  line41: p2("f2_16[0]"),

  // ── Part VII: Excess HSA Contributions (Lines 42–49) ──
  line42: p2("f2_17[0]"),
  line43: p2("f2_18[0]"),
  line44: p2("f2_19[0]"),
  line45: p2("f2_20[0]"),
  line46: p2("f2_21[0]"),
  line47: p2("f2_22[0]"),
  line48: p2("f2_23[0]"),
  line49: p2("f2_24[0]"),

  // ── Part VIII: Excess ABLE Contributions (Lines 50–51, 2025 version) ──
  // 2025 form simplified Part VIII to 2 lines:
  //   Line 50 = total excess contributions (net prior-year + current-year)
  //   Line 51 = additional tax (6%)
  line50: p2("f2_25[0]"),
  line51: p2("f2_26[0]"),

  // ── Part IX: Excess Accumulations / RMD (Lines 52–55, 2025 version) ──
  // 2025 form splits RMD into correction-window (a) vs other (b):
  //   52a/52b = minimum required distribution
  //   53a/53b = amount actually distributed
  //   54a = 10% tax (correction window), 54b = 25% tax (other)
  //   55 = total
  line52a: p3("f3_1[0]"),
  line52b: p3("f3_2[0]"),
  line53a: p3("f3_3[0]"),
  line53b: p3("f3_4[0]"),
  line54a: p3("f3_5[0]"),
  line54b: p3("f3_6[0]"),
  line55: p3("f3_7[0]"),
} as const;

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Form 5329 PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillForm5329(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
  owner?: "primary" | "spouse",
  educationReview?: PreparedEducationReview,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const individual = owner === "spouse" ? input.taxpayer.spouse : input.taxpayer.primary;
  if (owner && (!individual || !individual.firstName.trim() || !individual.lastName.trim())) throw new Error("Form5329 review requires the actual individual identity");
  const sourceEducation = result.form1099Q?.sourceFactsVerified ? result.form1099Q : undefined;
  const education = sourceEducation?.perRecipient.filter(row => row.owner === owner);
  if (!owner && sourceEducation?.perRecipient.some(row => row.owner !== "other" && row.taxableEarnings.gt(0))) throw new Error("Form5329 education review requires an actual individual owner");
  if (owner === "spouse" && input.taxpayer.filingStatus !== "married_filing_jointly") throw new Error("Form5329 spouse ownership requires an actual joint return");
  const legacy = result.form5329;
  const unassignedLegacyPart = legacy && [legacy.line1, legacy.line5, legacy.line9, legacy.line15, legacy.line18, legacy.line23,
    legacy.line26, legacy.line31, legacy.line34, legacy.line39, legacy.line42, legacy.line47, legacy.line50, legacy.line52,
    legacy.line56, legacy.totalAdditionalTax].some(value => value.gt(0));
  if (owner && input.taxpayer.filingStatus === "married_filing_jointly" && unassignedLegacyPart) throw new Error("Form5329 joint review cannot assign unassigned legacy parts without actual ownership");
  if (education?.length && result.form5329 && (result.form5329.line5.gt(0) || result.form5329.line6.gt(0))) throw new Error("Form5329 education source conflicts with unassigned legacy PartII amounts");
  const educationLines: Array<{ line: "5" | "6" | "7" | "8"; value: Decimal }> = [];
  const preparedEducation = hasInKindEducationReviewSources(input) || educationReview
    ? educationReview ?? prepareEducationReview(input) : undefined;
  if (preparedEducation) {
    if (!sourceEducation) throw new Error("Education review requires the original distribution calculation");
    assertPreparedEducationReturn(input, sourceEducation, preparedEducation);
  }
  if (sourceEducation) buildForm1099QReferenceSummary(input.form1099Q, sourceEducation, input.qualifiedEducationExpenses, preparedEducation);
  if (sourceEducation && education?.length) {
    if (education.length !== 1 || education[0].recipientId !== owner) throw new Error("Form5329 education requires unique actual owner identity");
    const row = education[0];
    for (const [line, value] of [["5", row.taxableEarnings], ["6", row.penaltyException], ["7", row.taxableEarnings.minus(row.penaltyException)], ["8", row.additionalTax]] as const) {
      const merged = result.allLines.filter(entry => entry.form === "Form5329 education" && entry.line === `${owner}:${owner}:${line}`);
      if (merged.length !== 1 || !Decimal.isDecimal(merged[0].value) || !merged[0].value.isFinite() || !merged[0].value.eq(value)) throw new Error("Form5329 education canonical audit does not reconcile");
      educationLines.push({ line, value });
    }
  }
  const hsa = owner ? result.form5329HsaByOwner?.[owner] : undefined;
  const hsaFacts = owner ? input.form5329HsaByOwner?.[owner] : undefined;
  if (owner && (hsa || hsaFacts)) {
    const facts = input.form5329HsaByOwner?.[owner];
    if (!facts || !hsa || hsa.owner !== owner || hsa.taxYear !== result.taxYear) throw new Error("Form5329 HSA review requires the actual owner's source and result");
    const actual8889 = result.form8889ByOwner?.[owner]
      ?? (input.form8889?.accountOwner === owner ? result.form8889 : undefined);
    if (!actual8889) throw new Error("Form5329 HSA review requires the actual owner's Form8889");
    const baseDeduction = Decimal.min(actual8889.line2, actual8889.line12);
    const source = calculateForm5329Hsa({ taxYear: result.taxYear, owner, facts,
      form8889: { ...actual8889, line13: baseDeduction,
        lines: actual8889.lines.map(line => line.line === "13" ? { ...line, value: baseDeduction } : line) } });
    if (hsa.sourceFactsVerified !== true || hsa.requiresForm5329 !== source.requiresForm5329 || hsa.lines.length !== source.lines.length) {
      throw new Error("Form5329 HSA source status and audit set must reconcile");
    }
    for (const key of ["line42", "line43", "line44", "line45", "line46", "line47", "line48", "line49", "valueDec31", "absorbedExcessDeduction", "reliefEarnings", "taxableExcessEmployerContributions"] as const) {
      if (!hsa[key].isFinite() || !hsa[key].eq(source[key])) throw new Error(`Form5329 HSA source reconciliation failed for ${key}`);
    }
    if (!actual8889.line13.eq(source.correctedForm8889.line13)) throw new Error("Form5329 HSA absorbed deduction does not reconcile with Form8889");
    for (const line of source.lines) {
      const retained = hsa.lines.filter(value => value.form === line.form && value.line === line.line);
      const merged = result.allLines.filter(value => value.form === line.form && value.line === line.line);
      if (retained.length !== 1 || merged.length !== 1 || !retained[0].value.eq(line.value) || !merged[0].value.eq(line.value)) {
        throw new Error("Form5329 HSA review audit reconciliation failed");
      }
    }
  }
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const F = FORM_5329_FIELDS;
  const f5329 = owner && input.taxpayer.filingStatus === "married_filing_jointly" ? undefined : result.form5329;

  // ── Header ──
  const name = owner && individual ? `${individual.firstName} ${individual.lastName}` : input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, (owner && individual ? individual.ssn : input.taxpayer.primary.ssn).replace(/-/g, ""));

  if (hsa) for (const line of hsa.lines) {
    const key = `line${line.line}` as keyof typeof F;
    setCurrencyField(form, F[key], roundDollar(line.value));
  }

  for (const line of educationLines) setCurrencyField(form, F[`line${line.line}`], roundDollar(line.value));
  if (!f5329) return doc;

  // ── Part I: Early Distributions (Lines 1–4) ──
  setCurrencyField(form, F.line1, f5329.line1);
  if (f5329.line2ExceptionNumber) {
    setTextField(form, F.line2ExceptionNumber, f5329.line2ExceptionNumber);
  }
  setCurrencyField(form, F.line2, f5329.line2);
  setCurrencyField(form, F.line3, f5329.line3);
  setCurrencyField(form, F.line4, f5329.line4);

  // ── Part II: Education/ABLE Distributions (Lines 5–8) ──
  if (educationLines.length === 0) {
    setCurrencyField(form, F.line5, f5329.line5);
    setCurrencyField(form, F.line6, f5329.line6);
    setCurrencyField(form, F.line7, f5329.line7);
    setCurrencyField(form, F.line8, f5329.line8);
  }

  // ── Part III: Excess Traditional IRA Contributions (Lines 9–17) ──
  setCurrencyField(form, F.line9, f5329.line9);
  setCurrencyField(form, F.line10, f5329.line10);
  setCurrencyField(form, F.line11, f5329.line11);
  setCurrencyField(form, F.line12, f5329.line12);
  setCurrencyField(form, F.line13, f5329.line13);
  setCurrencyField(form, F.line14, f5329.line14);
  setCurrencyField(form, F.line15, f5329.line15);
  setCurrencyField(form, F.line16, f5329.line16);
  setCurrencyField(form, F.line17, f5329.line17);

  // ── Part IV: Excess Roth IRA Contributions (Lines 18–25) ──
  setCurrencyField(form, F.line18, f5329.line18);
  setCurrencyField(form, F.line19, f5329.line19);
  setCurrencyField(form, F.line20, f5329.line20);
  setCurrencyField(form, F.line21, f5329.line21);
  setCurrencyField(form, F.line22, f5329.line22);
  setCurrencyField(form, F.line23, f5329.line23);
  setCurrencyField(form, F.line24, f5329.line24);
  setCurrencyField(form, F.line25, f5329.line25);

  // ── Part V: Excess Coverdell ESA Contributions (Lines 26–33) ──
  setCurrencyField(form, F.line26, f5329.line26);
  setCurrencyField(form, F.line27, f5329.line27);
  setCurrencyField(form, F.line28, f5329.line28);
  setCurrencyField(form, F.line29, f5329.line29);
  setCurrencyField(form, F.line30, f5329.line30);
  setCurrencyField(form, F.line31, f5329.line31);
  setCurrencyField(form, F.line32, f5329.line32);
  setCurrencyField(form, F.line33, f5329.line33);

  // ── Part VI: Excess Archer MSA Contributions (Lines 34–41) ──
  setCurrencyField(form, F.line34, f5329.line34);
  setCurrencyField(form, F.line35, f5329.line35);
  setCurrencyField(form, F.line36, f5329.line36);
  setCurrencyField(form, F.line37, f5329.line37);
  setCurrencyField(form, F.line38, f5329.line38);
  setCurrencyField(form, F.line39, f5329.line39);
  setCurrencyField(form, F.line40, f5329.line40);
  setCurrencyField(form, F.line41, f5329.line41);

  // ── Part VII: Excess HSA Contributions (Lines 42–49) ──
  if (!hsa) {
    setCurrencyField(form, F.line42, f5329.line42);
    setCurrencyField(form, F.line43, f5329.line43);
    setCurrencyField(form, F.line44, f5329.line44);
    setCurrencyField(form, F.line45, f5329.line45);
    setCurrencyField(form, F.line46, f5329.line46);
    setCurrencyField(form, F.line47, f5329.line47);
    setCurrencyField(form, F.line48, f5329.line48);
    setCurrencyField(form, F.line49, f5329.line49);
  }

  // ── Part VIII: Excess ABLE Contributions (Lines 50–51) ──
  // 2025 form simplified Part VIII. Engine lines 50-52 map to a single
  // total excess line; engine line 53 maps to the tax line.
  // PDF line 50 = total excess = max(0, engine.line50 - engine.line51) + engine.line52
  const ableTotalExcess = Decimal.max(
    new Decimal(0),
    f5329.line50.minus(f5329.line51),
  ).plus(f5329.line52);
  setCurrencyField(form, F.line50, ableTotalExcess);
  setCurrencyField(form, F.line51, f5329.line53);

  // ── Part IX: Excess Accumulations / RMD (Lines 52–55) ──
  // Engine lines 54-57 use old numbering. The 2025 form splits into
  // correction-window (a) and other-plans (b) sub-lines.
  // Route based on whether the shortfall was corrected within the window.
  const rmdCorrectedWithinWindow = input.form5329?.rmdShortfallCorrectedWithinWindow ?? false;
  if (rmdCorrectedWithinWindow) {
    // Corrected within window → 10% rate → fill (a) sub-lines
    setCurrencyField(form, F.line52a, f5329.line54);
    setCurrencyField(form, F.line53a, f5329.line55);
    setCurrencyField(form, F.line54a, f5329.line57);
  } else {
    // Not corrected within window → 25% rate → fill (b) sub-lines
    setCurrencyField(form, F.line52b, f5329.line54);
    setCurrencyField(form, F.line53b, f5329.line55);
    setCurrencyField(form, F.line54b, f5329.line57);
  }
  setCurrencyField(form, F.line55, f5329.line57);

  return doc;
}
