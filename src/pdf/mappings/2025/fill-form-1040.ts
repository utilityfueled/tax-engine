/**
 * PDF filler for IRS Form 1040 (U.S. Individual Income Tax Return).
 *
 * Field names are from the official IRS fillable PDF (2025 tax year).
 * Field mapping was derived by inspecting field positions in the blank PDF.
 *
 * To verify or update mappings, run the debug utility:
 *   fillDebugLabels('forms/blank/2025/f1040.pdf', 'forms/filled/f1040-debug.pdf')
 */

import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { calculateEicClaimantEligibility } from "@/engine/forms/eic-claimant-eligibility.js";
import { assertPdfExportAllowed } from "../../export-policy.js";
import {
  loadReviewTemplate,
  setTextField,
  setCurrencyField,
  setCheckBox,
} from "../../pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

/** Page 1 text field full path */
const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
/** Page 1 text field in Address group */
const p1Addr = (n: string) => `topmostSubform[0].Page1[0].Address_ReadOrder[0].${n}`;
/** Page 1 dependents table field */
const p1Dep = (row: string, n: string) =>
  `topmostSubform[0].Page1[0].Table_Dependents[0].${row}.${n}`;
/** Page 2 text field full path */
const p2 = (n: string) => `topmostSubform[0].Page2[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Mapping derived from PDF field position analysis.
// Page 1 fields are f1_XX, Page 2 fields are f2_XX.
// Checkboxes are c1_X / c2_X.

const FIELDS = {
  // ── Header: Name & SSN ──
  primaryFirstName: p1("f1_14[0]"),
  primaryLastName: p1("f1_15[0]"),
  primarySSN: p1("f1_16[0]"), // max=9, no dashes
  spouseFirstName: p1("f1_17[0]"),
  spouseLastName: p1("f1_18[0]"),
  spouseSSN: p1("f1_19[0]"), // max=9, no dashes

  // ── Address ──
  street: p1Addr("f1_20[0]"),
  apt: p1Addr("f1_21[0]"),
  city: p1Addr("f1_22[0]"),
  state: p1Addr("f1_23[0]"),
  zip: p1Addr("f1_24[0]"),

  // ── Filing Status ──
  single: p1("Checkbox_ReadOrder[0].c1_8[0]"),
  mfj: p1("Checkbox_ReadOrder[0].c1_8[1]"),
  mfs: p1("Checkbox_ReadOrder[0].c1_8[2]"),
  hoh: p1("c1_8[0]"),
  qss: p1("c1_8[1]"),

  // Each dependent occupies a column; rows hold name, SSN and relationship.
  dep1FirstName: p1Dep("Row1[0]", "f1_31[0]"),
  dep1LastName: p1Dep("Row2[0]", "f1_35[0]"),
  dep1SSN: p1Dep("Row3[0]", "f1_39[0]"),
  dep1Relationship: p1Dep("Row4[0]", "f1_43[0]"),
  dep2FirstName: p1Dep("Row1[0]", "f1_32[0]"),
  dep2LastName: p1Dep("Row2[0]", "f1_36[0]"),
  dep2SSN: p1Dep("Row3[0]", "f1_40[0]"),
  dep2Relationship: p1Dep("Row4[0]", "f1_44[0]"),
  dep3FirstName: p1Dep("Row1[0]", "f1_33[0]"),
  dep3LastName: p1Dep("Row2[0]", "f1_37[0]"),
  dep3SSN: p1Dep("Row3[0]", "f1_41[0]"),
  dep3Relationship: p1Dep("Row4[0]", "f1_45[0]"),
  dep4FirstName: p1Dep("Row1[0]", "f1_34[0]"),
  dep4LastName: p1Dep("Row2[0]", "f1_38[0]"),
  dep4SSN: p1Dep("Row3[0]", "f1_42[0]"),
  dep4Relationship: p1Dep("Row4[0]", "f1_46[0]"),
  // Row 7 contains credit eligibility, separate from residency and student status.
  dep1CTC: p1Dep("Row7[0]", "Dependent1[0].c1_28[0]"),
  dep1ODC: p1Dep("Row7[0]", "Dependent1[0].c1_28[1]"),
  dep2CTC: p1Dep("Row7[0]", "Dependent2[0].c1_29[0]"),
  dep2ODC: p1Dep("Row7[0]", "Dependent2[0].c1_29[1]"),
  dep3CTC: p1Dep("Row7[0]", "Dependent3[0].c1_30[0]"),
  dep3ODC: p1Dep("Row7[0]", "Dependent3[0].c1_30[1]"),
  dep4CTC: p1Dep("Row7[0]", "Dependent4[0].c1_31[0]"),
  dep4ODC: p1Dep("Row7[0]", "Dependent4[0].c1_31[1]"),
  // Printed 2025 income-line locations.
  line1a: p1("f1_47[0]"), // Wages, salaries, tips
  line1b: p1("f1_48[0]"), // Household employee income
  line1c: p1("f1_49[0]"), // Tip income not on line 1a
  line1d: p1("f1_50[0]"), // Medicaid waiver payments
  line1e: p1("f1_51[0]"), // Taxable dependent care benefits
  line1f: p1("f1_52[0]"), // Employer-provided adoption benefits
  line1g: p1("f1_53[0]"), // Wages from Form 8919
  line1h: p1("f1_55[0]"),
  line1z: p1("f1_57[0]"),
  line2a: p1("f1_58[0]"),
  line2b: p1("f1_59[0]"),
  line3a: p1("f1_60[0]"),
  line3b: p1("f1_61[0]"),
  line4a: p1("f1_62[0]"),
  line4b: p1("f1_63[0]"),
  line5a: p1("f1_65[0]"),
  line5b: p1("f1_66[0]"),
  line6a: p1("f1_68[0]"),
  line6b: p1("f1_69[0]"),
  line7: p1("f1_70[0]"),
  line8: p1("f1_72[0]"),
  line9: p1("f1_73[0]"),
  line10: p1("f1_74[0]"),
  line11: p1("f1_75[0]"),
  line11b: p2("f2_01[0]"),
  line13b: p2("f2_04[0]"),
  line12: p2("f2_02[0]"),
  line13: p2("f2_03[0]"),
  line14: p2("f2_05[0]"),
  line15: p2("f2_06[0]"),

  // ── Page 2 Tax Computation ──
  line16: p2("f2_08[0]"),
  line17: p2("f2_09[0]"),
  line18: p2("f2_10[0]"),
  line19: p2("f2_11[0]"),
  line20: p2("f2_12[0]"),
  line21: p2("f2_13[0]"),
  line22: p2("f2_14[0]"),
  line23: p2("f2_15[0]"),
  line24: p2("f2_16[0]"),

  // ── Page 2 Payments ──
  line25a: p2("f2_17[0]"),
  line25b: p2("f2_18[0]"),
  line25c: p2("f2_19[0]"),
  line25d: p2("f2_20[0]"),
  line26: p2("f2_21[0]"),
  line27a: p2("f2_23[0]"),
  line27c: p2("c2_13[0]"),

  // ── Page 2 Refundable Credits ──
  line28: p2("f2_24[0]"),
  line29: p2("f2_25[0]"),
  line30: p2("f2_26[0]"),
  line31: p2("f2_27[0]"),

  // ── Page 2 Totals ──
  line32: p2("f2_28[0]"),
  line33: p2("f2_29[0]"),
  line34: p2("f2_30[0]"),
  line35a: p2("f2_31[0]"),
  line35aRouting: p2("RoutingNo[0].f2_32[0]"), // Routing number
  line35cAccount: p2("AccountNo[0].f2_33[0]"), // Account number
  line36: p2("f2_34[0]"), // Applied to estimated tax
  line37: p2("f2_35[0]"), // Amount you owe
  line38: p2("f2_36[0]"), // Estimated tax penalty
} as const;

// ─── Fill Logic ────────────────────────────────────────────────────────────

/** Remove dashes from SSN for PDF field (123-45-6789 → 123456789). */
function stripSSN(ssn: string): string {
  return ssn.replace(/-/g, "");
}

/**
 * Fill IRS Form 1040 PDF from engine calculation results and input data.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillForm1040(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  if (input.deductionElection === "nonitemized" || result.deductionUsed === "nonitemized") throw new Error("Nonitemized election is available only for 2026 and has no supported review PDF mapping");
  if (input.taxpayer.dependents.length > 4) {
    throw new Error("Form 1040 dependent attachment mapping is required for more than four dependents.");
  }
  // Rule10/13's completed claimant answer applies regardless of child count.
  // Resolve only that applicable source route; no childless home/age or amount
  // is recomputed here. Zero credit alone never establishes this checkbox.
  const otherTaxpayerChild = input.eic?.claimantEligibility === undefined ? undefined
    : calculateEicClaimantEligibility(input, false).qualifyingChildOfAnotherTaxpayer;
  if (otherTaxpayerChild === true && (!result.earnedIncomeCredit.isZero()
    || (getLineValue(result, "1040", "27a")?.isZero() === false))) {
    throw new Error("Rule10 qualifying-child source conflicts with a positive EIC credit result");
  }
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();

  const F = FIELDS;
  const { taxpayer } = input;

  // ── Header ──
  setTextField(form, F.primaryFirstName, taxpayer.primary.firstName);
  setTextField(form, F.primaryLastName, taxpayer.primary.lastName);
  setTextField(form, F.primarySSN, stripSSN(taxpayer.primary.ssn));

  if (taxpayer.spouse) {
    setTextField(form, F.spouseFirstName, taxpayer.spouse.firstName);
    setTextField(form, F.spouseLastName, taxpayer.spouse.lastName);
    setTextField(form, F.spouseSSN, stripSSN(taxpayer.spouse.ssn));
  }

  // ── Address ──
  setTextField(form, F.street, taxpayer.address.street);
  setTextField(form, F.apt, taxpayer.address.apt ?? "");
  setTextField(form, F.city, taxpayer.address.city);
  setTextField(form, F.state, taxpayer.address.state);
  setTextField(form, F.zip, taxpayer.address.zip);

  // ── Filing Status ──
  const status = taxpayer.filingStatus;
  setCheckBox(form, F.single, status === "single");
  setCheckBox(form, F.mfj, status === "married_filing_jointly");
  setCheckBox(form, F.mfs, status === "married_filing_separately");
  setCheckBox(form, F.hoh, status === "head_of_household");
  setCheckBox(form, F.qss, status === "qualifying_surviving_spouse");

  // ── Dependents (up to 4) ──
  const depFields = [
    { first: F.dep1FirstName, last: F.dep1LastName, ssn: F.dep1SSN, rel: F.dep1Relationship, ctc: F.dep1CTC, odc: F.dep1ODC },
    { first: F.dep2FirstName, last: F.dep2LastName, ssn: F.dep2SSN, rel: F.dep2Relationship, ctc: F.dep2CTC, odc: F.dep2ODC },
    { first: F.dep3FirstName, last: F.dep3LastName, ssn: F.dep3SSN, rel: F.dep3Relationship, ctc: F.dep3CTC, odc: F.dep3ODC },
    { first: F.dep4FirstName, last: F.dep4LastName, ssn: F.dep4SSN, rel: F.dep4Relationship, ctc: F.dep4CTC, odc: F.dep4ODC },
  ];
  for (let i = 0; i < Math.min(taxpayer.dependents.length, 4); i++) {
    const dep = taxpayer.dependents[i];
    const df = depFields[i];
    setTextField(form, df.first, dep.firstName);
    setTextField(form, df.last, dep.lastName);
    setTextField(form, df.ssn, stripSSN(dep.ssn));
    setTextField(form, df.rel, dep.relationship);
    setCheckBox(form, df.ctc, dep.qualifiesForCTC);
    setCheckBox(form, df.odc, dep.qualifiesForODC ?? false);
  }

  // ── Page 1 Income Lines ──
  for (const line of ["1a", "1c", "1g", "1h"] as const) {
    const value = getLineValue(result, "1040", line);
    if (value === undefined) throw new Error(`Missing audited Form 1040 line ${line}.`);
    setCurrencyField(form, F[`line${line}`], value);
  }
  for (const line of ["1b", "1d", "1e", "1f"] as const) {
    setCurrencyField(form, F[`line${line}`], getLineValue(result, "1040", line) ?? new Decimal(0));
  }
  setCurrencyField(form, F.line1z, getLineValue(result, "1040", "1z") ?? result.totalWages);
  setCurrencyField(form, F.line2a, result.taxExemptInterest);
  setCurrencyField(form, F.line2b, result.totalInterest);
  setCurrencyField(form, F.line3a, result.qualifiedDividends);
  setCurrencyField(form, F.line3b, result.totalDividends);
  setCurrencyField(form, F.line4a, result.iraDistributionsGross);
  setCurrencyField(form, F.line4b, result.iraDistributionsTaxable);
  setCurrencyField(form, F.line5a, result.pensionDistributionsGross);
  setCurrencyField(form, F.line5b, result.pensionDistributionsTaxable);
  setCurrencyField(form, F.line6a, result.socialSecurityBenefitsGross);
  setCurrencyField(form, F.line6b, result.socialSecurityBenefitsTaxable);
  setCurrencyField(form, F.line7, result.capitalGainLoss);
  setCurrencyField(form, F.line8, result.otherIncome);
  setCurrencyField(form, F.line9, result.totalIncome);
  setCurrencyField(form, F.line10, result.adjustmentsToIncome);
  setCurrencyField(form, F.line11, result.agi);
  setCurrencyField(form, F.line11b, result.agi);
  setCurrencyField(form, F.line12, result.deductionAmount);
  // Line 13: QBI deduction — pull from form8995/8995A if present
  const qbiDeduction = getLineValue(result, "1040", "13");
  if (qbiDeduction) setCurrencyField(form, F.line13, qbiDeduction);
  const schedule1ADeduction = getLineValue(result, "1040", "13b") ?? new Decimal(0);
  setCurrencyField(form, F.line13b, schedule1ADeduction);
  const totalDeductions = getLineValue(result, "1040", "14")
    ?? result.deductionAmount.plus(qbiDeduction ?? new Decimal(0)).plus(schedule1ADeduction);
  setCurrencyField(form, F.line14, totalDeductions);
  setCurrencyField(form, F.line15, result.taxableIncome);

  // The engine owns these amounts. Preserve its final audited values without
  // recalculating credits or adding AMT twice in the form layer.
  for (const line of ["16", "17", "18", "19", "20", "21", "22", "23", "24"] as const) {
    const value = getLineValue(result, "1040", line);
    if (value === undefined) throw new Error(`Missing audited Form 1040 line ${line}.`);
    setCurrencyField(form, F[`line${line}`], value);
  }

  // ── Page 2 Payments ──
  for (const line of ["25a", "25b", "25c"] as const) {
    const value = getLineValue(result, "1040", line);
    if (value === undefined) throw new Error(`Missing audited Form 1040 line ${line}.`);
    setCurrencyField(form, F[`line${line}`], value);
  }
  setCurrencyField(form, F.line25d, result.totalWithholding);
  setCurrencyField(form, F.line26, result.estimatedTaxPayments);
  setCurrencyField(form, F.line27a, result.earnedIncomeCredit);
  // Pub596 Rule10 expressly directs this mark, despite the physical form's
  // broader voluntary-opt-out label. No voluntary election is inferred.
  setCheckBox(form, F.line27c, otherTaxpayerChild === true);

  // ── Page 2 Totals ──
  for (const line of ["28", "29", "30", "31"] as const) {
    setCurrencyField(form, F[`line${line}`], getLineValue(result, "1040", line) ?? new Decimal(0));
  }
  const otherPayments = result.totalPayments.minus(result.totalWithholding).minus(result.estimatedTaxPayments);
  setCurrencyField(form, F.line32, otherPayments);
  setCurrencyField(form, F.line33, result.totalPayments);
  for (const line of ["34", "35a", "37", "38"] as const) {
    const value = getLineValue(result, "1040", line);
    if (value === undefined) throw new Error(`Missing audited Form 1040 line ${line}.`);
    setCurrencyField(form, F[`line${line}`], value);
  }

  return doc;
}

/** Look up a calculated line value from the audit trail. */
function getLineValue(result: TaxReturnResult, form: string, line: string): Decimal | undefined {
  for (let index = result.allLines.length - 1; index >= 0; index -= 1) {
    const candidate = result.allLines[index];
    if (candidate.form === form && candidate.line === line) return candidate.value;
  }
  return undefined;
}

/** Exported field map for testing and inspection. */
export { FIELDS as FORM_1040_FIELDS };
