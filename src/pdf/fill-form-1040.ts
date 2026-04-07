/**
 * PDF filler for IRS Form 1040 (U.S. Individual Income Tax Return).
 *
 * Field names are from the official IRS fillable PDF (2025 tax year).
 * Field mapping was derived by inspecting field positions in the blank PDF.
 *
 * To verify or update mappings, run the debug utility:
 *   fillDebugLabels('forms/blank/f1040.pdf', 'forms/filled/f1040-debug.pdf')
 */

import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import {
  loadBlankPdf,
  setTextField,
  setCurrencyField,
  setCheckBox,
  formatCurrency,
} from "./pdf-utils.js";

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
  single: p1("c1_1[0]"),
  mfj: p1("c1_2[0]"),
  mfs: p1("c1_3[0]"),
  hoh: p1("c1_4[0]"),

  // ── Dependents (4 rows: firstName, lastName, SSN, relationship) ──
  dep1FirstName: p1Dep("Row1[0]", "f1_31[0]"),
  dep1LastName: p1Dep("Row1[0]", "f1_32[0]"),
  dep1SSN: p1Dep("Row1[0]", "f1_33[0]"),
  dep1Relationship: p1Dep("Row1[0]", "f1_34[0]"),
  dep2FirstName: p1Dep("Row2[0]", "f1_35[0]"),
  dep2LastName: p1Dep("Row2[0]", "f1_36[0]"),
  dep2SSN: p1Dep("Row2[0]", "f1_37[0]"),
  dep2Relationship: p1Dep("Row2[0]", "f1_38[0]"),
  dep3FirstName: p1Dep("Row3[0]", "f1_39[0]"),
  dep3LastName: p1Dep("Row3[0]", "f1_40[0]"),
  dep3SSN: p1Dep("Row3[0]", "f1_41[0]"),
  dep3Relationship: p1Dep("Row3[0]", "f1_42[0]"),
  dep4FirstName: p1Dep("Row4[0]", "f1_43[0]"),
  dep4LastName: p1Dep("Row4[0]", "f1_44[0]"),
  dep4SSN: p1Dep("Row4[0]", "f1_45[0]"),
  dep4Relationship: p1Dep("Row4[0]", "f1_46[0]"),

  // Dependent CTC/ODC checkboxes (Row5 = CTC, Row6 = ODC)
  dep1CTC: p1Dep("Row5[0]", "Dependent1[0].c1_12[0]"),
  dep1ODC: p1Dep("Row5[0]", "Dependent1[0].c1_13[0]"),
  dep2CTC: p1Dep("Row5[0]", "Dependent2[0].c1_14[0]"),
  dep2ODC: p1Dep("Row5[0]", "Dependent2[0].c1_15[0]"),
  dep3CTC: p1Dep("Row5[0]", "Dependent3[0].c1_16[0]"),
  dep3ODC: p1Dep("Row5[0]", "Dependent3[0].c1_17[0]"),
  dep4CTC: p1Dep("Row5[0]", "Dependent4[0].c1_18[0]"),
  dep4ODC: p1Dep("Row5[0]", "Dependent4[0].c1_19[0]"),

  // ── Page 1 Income Lines ──
  line1a: p1("f1_47[0]"), // Wages, salaries, tips
  line1b: p1("f1_48[0]"), // Household employee income
  line1c: p1("f1_49[0]"), // Tip income not on line 1a
  line1d: p1("f1_50[0]"), // Medicaid waiver payments
  line1e: p1("f1_51[0]"), // Taxable dependent care benefits
  line1f: p1("f1_52[0]"), // Employer-provided adoption benefits
  line1g: p1("f1_53[0]"), // Wages from Form 8919
  line1h: p1("f1_54[0]"), // Strike benefits (2025+)
  line1z: p1("f1_55[0]"), // Total of lines 1a through 1h
  line2a: p1("f1_56[0]"), // Tax-exempt interest
  line2b: p1("f1_57[0]"), // Taxable interest
  line3a: p1("f1_58[0]"), // Qualified dividends
  line3b: p1("f1_59[0]"), // Ordinary dividends
  line4a: p1("f1_60[0]"), // IRA distributions
  line4b: p1("f1_61[0]"), // IRA distributions taxable
  line5a: p1("f1_62[0]"), // Pensions and annuities
  line5b: p1("f1_63[0]"), // Pensions taxable amount
  line6a: p1("f1_65[0]"), // Social Security benefits
  line6b: p1("f1_66[0]"), // SS taxable amount
  line7: p1("f1_67[0]"),  // Capital gain or (loss)
  line8: p1("f1_68[0]"),  // Other income from Schedule 1
  line9: p1("f1_69[0]"),  // Total income
  line10: p1("f1_70[0]"), // Adjustments from Schedule 1
  line11: p1("f1_71[0]"), // Adjusted gross income
  line12: p1("f1_72[0]"), // Standard or itemized deduction
  line13: p1("f1_73[0]"), // QBI deduction
  line14: p1("f1_74[0]"), // Total deductions (12 + 13)
  line15: p1("f1_75[0]"), // Taxable income

  // ── Page 2 Tax Computation ──
  line16: p2("f2_02[0]"), // Tax
  line17: p2("f2_03[0]"), // Schedule 2, Part I, line 4
  line18: p2("f2_04[0]"), // Add 16 + 17
  line19: p2("f2_05[0]"), // Child tax credit
  line20: p2("f2_06[0]"), // Schedule 3, line 8
  line22: p2("f2_08[0]"), // Subtract 21 from 18 (net tax after credits)
  line23: p2("f2_09[0]"), // Other taxes from Schedule 2, Part II
  line24: p2("f2_10[0]"), // Total tax

  // ── Page 2 Payments ──
  line25a: p2("f2_11[0]"), // W-2 withholding
  line25b: p2("f2_12[0]"), // 1099 withholding
  line25c: p2("f2_13[0]"), // Other withholding
  line25d: p2("f2_14[0]"), // Total withholding
  line26: p2("f2_15[0]"),  // Estimated tax payments
  line27a: p2("f2_16[0]"), // Earned income credit

  // ── Page 2 Refundable Credits ──
  line28: p2("f2_17[0]"),  // Additional child tax credit
  line29: p2("f2_18[0]"),  // American opportunity credit
  line31: p2("f2_19[0]"),  // Schedule 3, line 15

  // ── Page 2 Totals ──
  line32: p2("f2_29[0]"), // Total payments
  line33: p2("f2_30[0]"), // Overpaid
  line34: p2("f2_31[0]"), // Refund
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
  const doc = await loadBlankPdf(blankPdfPath);
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
  setCheckBox(form, F.mfj, status === "married_filing_jointly" || status === "qualifying_surviving_spouse");
  setCheckBox(form, F.mfs, status === "married_filing_separately");
  setCheckBox(form, F.hoh, status === "head_of_household");

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
  setCurrencyField(form, F.line1a, result.totalWages);
  // Lines 1b-1g: sub-items (not directly on TaxReturnResult, set via allLines)
  setCurrencyField(form, F.line1z, result.totalWages); // Line 1z = total of 1a-1h
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
  setCurrencyField(form, F.line12, result.deductionAmount);
  // Line 13: QBI deduction — pull from form8995/8995A if present
  const qbiDeduction = getLineValue(result, "1040", "13");
  if (qbiDeduction) setCurrencyField(form, F.line13, qbiDeduction);
  // Line 14: total deductions = line 12 + line 13
  const totalDeductions = result.deductionAmount.plus(qbiDeduction ?? new Decimal(0));
  setCurrencyField(form, F.line14, totalDeductions);
  setCurrencyField(form, F.line15, result.taxableIncome);

  // ── Page 2 Tax Computation ──
  setCurrencyField(form, F.line16, result.totalTaxBeforeCredits);
  // Line 17: Schedule 2, Part I (AMT + excess premium tax credit)
  const schedule2Part1 = getLineValue(result, "Schedule 2", "3") ?? new Decimal(0);
  setCurrencyField(form, F.line17, schedule2Part1);
  // Line 18: 16 + 17
  setCurrencyField(form, F.line18, result.totalTaxBeforeCredits.plus(schedule2Part1));
  setCurrencyField(form, F.line19, result.childTaxCredit);
  // Line 20: Schedule 3, line 8
  const schedule3Line8 = getLineValue(result, "Schedule 3", "8") ?? new Decimal(0);
  setCurrencyField(form, F.line20, schedule3Line8);
  // Line 22: Net tax after credits
  const totalNonrefCredits = result.childTaxCredit.plus(schedule3Line8);
  const line18 = result.totalTaxBeforeCredits.plus(schedule2Part1);
  const line22 = Decimal.max(line18.minus(totalNonrefCredits), new Decimal(0));
  setCurrencyField(form, F.line22, line22);
  // Line 23: Other taxes from Schedule 2, Part II
  setCurrencyField(form, F.line23, result.totalAdditionalTaxes);
  setCurrencyField(form, F.line24, result.totalTax);

  // ── Page 2 Payments ──
  setCurrencyField(form, F.line25d, result.totalWithholding);
  setCurrencyField(form, F.line26, result.estimatedTaxPayments);
  setCurrencyField(form, F.line27a, result.earnedIncomeCredit);

  // ── Page 2 Totals ──
  setCurrencyField(form, F.line32, result.totalPayments);
  if (result.refund.gt(0)) {
    setCurrencyField(form, F.line33, result.refund);
    setCurrencyField(form, F.line34, result.refund);
  }
  if (result.amountOwed.gt(0)) {
    setCurrencyField(form, F.line37, result.amountOwed);
  }
  if (result.estimatedTaxPenalty.gt(0)) {
    setCurrencyField(form, F.line38, result.estimatedTaxPenalty);
  }

  return doc;
}

/** Look up a calculated line value from the audit trail. */
function getLineValue(result: TaxReturnResult, form: string, line: string): Decimal | undefined {
  const found = result.allLines.find((l) => l.form === form && l.line === line);
  return found?.value;
}

/** Exported field map for testing and inspection. */
export { FIELDS as FORM_1040_FIELDS };
