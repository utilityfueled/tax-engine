import { assertPdfExportAllowed, markReviewPdf } from "../../export-policy.js";
/**
 * PDF filler for IRS Form 2441 — Child and Dependent Care Expenses
 *
 * Field names are from the official IRS fillable PDF (2025 tax year).
 * Field mapping was derived by inspecting field names in the blank PDF.
 *
 * To verify or update mappings, run the debug utility:
 *   fillDebugLabels('forms/blank/2025/f2441.pdf', 'forms/filled/f2441-debug.pdf')
 */

import { PDFDocument, StandardFonts } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import {
  loadReviewTemplate,
  setTextField,
  formatCurrency,
  setCheckBox,
} from "../../pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const providerRow = (row: string, n: string) =>
  `topmostSubform[0].Page1[0].PartITable[0].${row}.${n}`;
const qpRow = (row: string, n: string) =>
  `topmostSubform[0].Page1[0].Table_Line2[0].${row}.${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Form 2441 fillable PDF debug labels.

export const FORM_2441_FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),

  // ── Checkbox A (MFS exception) ──
  mfsException: p1("c1_1[0]"),
  // ── Checkbox B (student/disabled deemed income) ──
  studentOrDisabled: p1("c1_2[0]"),

  // ── Part I: Care Providers (up to 3 rows) ──
  // Row 1: (a) name, (b) address, (c) TIN, (d) household employee yes/no, (e) amount
  provider1Name: providerRow("BodyRow1[0]", "f1_3[0]"),
  provider1Address: providerRow("BodyRow1[0]", "ColB[0].f1_4[0]"),
  provider1TIN: providerRow("BodyRow1[0]", "f1_5[0]"),
  provider1HouseholdYes: providerRow("BodyRow1[0]", "ColD[0].c1_4[0]"),
  provider1HouseholdNo: providerRow("BodyRow1[0]", "ColD[0].c1_4[1]"),
  provider1Amount: providerRow("BodyRow1[0]", "f1_6[0]"),

  provider2Name: providerRow("BodyRow2[0]", "f1_7[0]"),
  provider2Address: providerRow("BodyRow2[0]", "ColB[0].f1_8[0]"),
  provider2TIN: providerRow("BodyRow2[0]", "f1_9[0]"),
  provider2HouseholdYes: providerRow("BodyRow2[0]", "ColD[0].c1_5[0]"),
  provider2HouseholdNo: providerRow("BodyRow2[0]", "ColD[0].c1_5[1]"),
  provider2Amount: providerRow("BodyRow2[0]", "f1_10[0]"),

  provider3Name: providerRow("BodyRow3[0]", "f1_11[0]"),
  provider3Address: providerRow("BodyRow3[0]", "ColB[0].f1_12[0]"),
  provider3TIN: providerRow("BodyRow3[0]", "f1_13[0]"),
  provider3HouseholdYes: providerRow("BodyRow3[0]", "ColD[0].c1_6[0]"),
  provider3HouseholdNo: providerRow("BodyRow3[0]", "ColD[0].c1_6[1]"),
  provider3Amount: providerRow("BodyRow3[0]", "f1_14[0]"),

  // These are continuation checkboxes. The benefits yes/no diagram has no widget.
  moreProviders: p1("PartI[0].c1_3[0]"),
  moreQualifyingPersons: p1("c1_7[0]"),

  // ── Part II Line 2: Qualifying Persons (up to 3 rows) ──
  // (a) first name, (a) last name, (b) SSN, (c) disabled checkbox, (d) qualified expenses
  qp1FirstName: qpRow("Row1[0]", "f1_15[0]"),
  qp1LastName: qpRow("Row1[0]", "f1_16[0]"),
  qp1SSN: qpRow("Row1[0]", "f1_17[0]"),
  qp1Disabled: qpRow("Row1[0]", "c1_8[0]"),
  qp1Expenses: qpRow("Row1[0]", "f1_18[0]"),

  qp2FirstName: qpRow("Row2[0]", "f1_19[0]"),
  qp2LastName: qpRow("Row2[0]", "f1_20[0]"),
  qp2SSN: qpRow("Row2[0]", "f1_21[0]"),
  qp2Disabled: qpRow("Row2[0]", "c1_9[0]"),
  qp2Expenses: qpRow("Row2[0]", "f1_22[0]"),

  qp3FirstName: qpRow("Row3[0]", "f1_23[0]"),
  qp3LastName: qpRow("Row3[0]", "f1_24[0]"),
  qp3SSN: qpRow("Row3[0]", "f1_25[0]"),
  qp3Disabled: qpRow("Row3[0]", "c1_10[0]"),
  qp3Expenses: qpRow("Row3[0]", "f1_26[0]"),

  // ── Part II Computation Lines ──
  line3: p1("f1_27[0]"),   // Total qualified expenses (capped at $3K/$6K)
  line4: p1("f1_28[0]"),   // Your earned income
  line5: p1("f1_29[0]"),   // Spouse's earned income (MFJ) or amount from line 4
  line6: p1("f1_30[0]"),   // Smallest of line 3, 4, or 5
  line7: p1("f1_31[0]"),   // AGI from Form 1040, line 11a
  // Line 8: decimal amount — two-part field (X . nn)
  line8decimal: p1("f1_32[0]"),  // The decimal digits after "X ."
  line9a: p1("f1_33[0]"),  // Line 6 × line 8
  line9b: p1("f1_34[0]"),  // Prior year expenses paid in current year (usually 0)
  line9c: p1("f1_35[0]"),  // Line 9a + line 9b
  line10: p1("f1_36[0]"),  // Tax liability limit
  line11: p1("f1_37[0]"),  // Credit (smaller of 9c or 10)
} as const;

const F = FORM_2441_FIELDS;

async function fillSourceRecords(doc: PDFDocument, input: TaxYearInput): Promise<void> {
  const care = input.dependentCare;
  if (!care?.providers?.length && !care?.qualifyingPersons?.length) return;
  if (care.sourceFactsConfirmed !== true || !care.providers?.length || !care.qualifyingPersons?.length
    || typeof care.usesDeemedIncome !== "boolean" || care.qualifyingPersons.length !== care.qualifyingIndividuals) {
    throw new Error("Form 2441 requires confirmed complete provider and qualifying-person source records");
  }
  const amount = (value: string) => {
    const parsed = new Decimal(value);
    if (!parsed.isFinite() || parsed.isNegative()) throw new Error("Form 2441 source amount must be finite and nonnegative");
    return parsed;
  };
  const providers = care.providers.map(provider => {
    if (!provider.name.trim() || !provider.address.trim() || typeof provider.householdEmployee !== "boolean"
      || !["tin", "tax_exempt", "foreign_no_us_tin", "employer_furnished", "withheld"].includes(provider.identifierType)
      || (provider.identifierType === "withheld" && !provider.dueDiligenceStatement?.trim())) throw new Error("Form 2441 provider source is incomplete");
    const paid = amount(provider.amountPaid);
    if (provider.identifierType === "employer_furnished" && (!paid.isZero() || provider.householdEmployee || care.receivedBenefits !== true)) throw new Error("Form 2441 employer-furnished source contradicts its required zero payment entry");
    return { ...provider, paid };
  }).sort((a, b) => b.paid.comparedTo(a.paid));
  const persons = care.qualifyingPersons.map(person => {
    if (!person.firstName.trim() || !person.lastName.trim() || typeof person.over12Disabled !== "boolean"
      || typeof person.qualifyingPersonConfirmed !== "boolean" || !["tax_id", "died"].includes(person.identifierType)) throw new Error("Form 2441 qualifying-person source is incomplete");
    return { ...person, expenses: amount(person.qualifiedExpenses) };
  }).sort((a, b) => b.expenses.comparedTo(a.expenses));
  const total = persons.reduce((sum, person) => sum.plus(person.expenses), new Decimal(0));
  if (care.excludedDependentCareBenefits === undefined || !total.eq(Decimal.max(0, amount(care.expenses).minus(amount(care.excludedDependentCareBenefits))))) throw new Error("Form 2441 person expense sources do not reconcile");
  const providerId = (provider: typeof providers[number]) => ({ tin: provider.taxId ?? "", tax_exempt: "Tax-Exempt", foreign_no_us_tin: "LAFCP", employer_furnished: "", withheld: "See attached" })[provider.identifierType];
  const personId = (person: typeof persons[number]) => person.identifierType === "died" ? "Died" : person.taxId ?? "";
  const money = (value: Decimal) => value.isZero() ? "0" : formatCurrency(value);
  const form = doc.getForm();
  const providerFields = [
    [F.provider1Name, F.provider1Address, F.provider1TIN, F.provider1HouseholdYes, F.provider1HouseholdNo, F.provider1Amount],
    [F.provider2Name, F.provider2Address, F.provider2TIN, F.provider2HouseholdYes, F.provider2HouseholdNo, F.provider2Amount],
    [F.provider3Name, F.provider3Address, F.provider3TIN, F.provider3HouseholdYes, F.provider3HouseholdNo, F.provider3Amount],
  ];
  providers.slice(0, 3).forEach((provider, i) => {
    const fields = providerFields[i];
    setTextField(form, fields[0], provider.name);
    setTextField(form, fields[1], provider.identifierType === "employer_furnished" ? "See W-2" : provider.address);
    setTextField(form, fields[2], providerId(provider));
    setCheckBox(form, fields[3], provider.householdEmployee); setCheckBox(form, fields[4], !provider.householdEmployee);
    setTextField(form, fields[5], money(provider.paid));
  });
  const personFields = [
    [F.qp1FirstName, F.qp1LastName, F.qp1SSN, F.qp1Disabled, F.qp1Expenses],
    [F.qp2FirstName, F.qp2LastName, F.qp2SSN, F.qp2Disabled, F.qp2Expenses],
    [F.qp3FirstName, F.qp3LastName, F.qp3SSN, F.qp3Disabled, F.qp3Expenses],
  ];
  persons.slice(0, 3).forEach((person, i) => {
    const fields = personFields[i];
    setTextField(form, fields[0], person.firstName); setTextField(form, fields[1], person.lastName);
    setTextField(form, fields[2], personId(person)); setCheckBox(form, fields[3], person.over12Disabled);
    setTextField(form, fields[4], money(person.expenses));
  });
  setCheckBox(form, F.studentOrDisabled, care.usesDeemedIncome);
  setCheckBox(form, F.moreProviders, providers.length > 3);
  setCheckBox(form, F.moreQualifyingPersons, persons.length > 3);
  const paragraphs = [
    ...providers.slice(3).map((provider, i) => `Provider ${i + 4}: ${provider.name}; address: ${provider.address}; identifier: ${providerId(provider)}; household employee: ${provider.householdEmployee ? "Yes" : "No"}; amount paid: ${money(provider.paid)}.`),
    ...persons.slice(3).map((person, i) => `Qualifying person ${i + 4}: ${person.firstName} ${person.lastName}; identifier: ${personId(person)}; over age 12 and incapable of self-care: ${person.over12Disabled ? "Yes" : "No"}; qualified expenses: ${money(person.expenses)}.`),
    ...providers.filter(provider => provider.identifierType === "withheld").map(provider => `Provider identification due diligence - ${provider.name}: ${provider.dueDiligenceStatement}`),
  ];
  if (!paragraphs.length) return;
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([612, 792]); let y = 744;
  const header = () => {
    page.drawText("Form 2441 - source continuation (2025 review)", { x: 42, y, size: 13, font }); y -= 23;
    page.drawText(`${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} | SSN: ${input.taxpayer.primary.ssn}`, { x: 42, y, size: 10, font }); y -= 24;
  };
  header();
  for (const paragraph of paragraphs) {
    // Wrap even unusually long unbroken source names without clipping or dropping text.
    let line = "";
    const flush = () => {
      if (y < 50) { page = doc.addPage([612, 792]); y = 744; header(); }
      page.drawText(line, { x: 42, y, size: 10, font }); y -= 14; line = "";
    };
    for (const word of paragraph.split(/\s+/)) {
      if (line && font.widthOfTextAtSize(`${line} ${word}`, 10) > 528) flush();
      if (line) line += " ";
      for (const char of word) {
        if (font.widthOfTextAtSize(line + char, 10) > 528) flush();
        line += char;
      }
    }
    if (line) flush();
    y -= 9;
  }
}

// ─── Fill Logic ────────────────────────────────────────────────────────────

export async function fillForm2441(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const f2441 = result.form2441;
  if (!f2441) throw new Error("Form 2441 review requires its audited calculation");
  const required = ["3", "4", "5", "6", "7", "8", "9a", "10", "11"];
  const printed = new Set([...required, "9b", "9c"]);
  const byLine = new Map<string, Decimal>();
  for (const line of f2441.lines) {
    if (!printed.has(line.line)) continue;
    if (line.form !== "Form 2441" || byLine.has(line.line) || !Decimal.isDecimal(line.value) || !line.value.isFinite()
      || (!["4", "5", "7"].includes(line.line) && line.value.isNegative())) {
      throw new Error(`Form 2441 requires a unique finite audit for printed line ${line.line}`);
    }
    byLine.set(line.line, line.value);
  }
  for (const line of required) if (!byLine.has(line)) throw new Error(`Form 2441 is missing audit line ${line}`);
  if (byLine.has("9b") !== byLine.has("9c")) throw new Error("Form 2441 prior-year audit is incomplete");
  for (const [line, total] of [["3", f2441.qualifyingExpenses], ["6", f2441.earnedIncomeLimit],
    ["7", result.agi], ["8", f2441.creditPercentage], ["11", f2441.credit]] as const) {
    if (!byLine.get(line)?.eq(total)) throw new Error(`Form 2441 audit line ${line} disagrees with its calculated total`);
  }
  if (input.dependentCare) {
    for (const [line, source] of [["4", input.dependentCare.primaryEarnedIncome],
      ["5", input.taxpayer.filingStatus === "married_filing_jointly" ? input.dependentCare.spouseEarnedIncome : input.dependentCare.primaryEarnedIncome]] as const) {
      if (source !== undefined && !byLine.get(line)?.eq(source)) throw new Error(`Form 2441 audit line ${line} contradicts the source income`);
    }
  }

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  // Copy the persisted printed audit. Historical combined-household inputs are
  // not evidence of either spouse's actual earned income.
  for (const [line, field] of [["3", F.line3], ["4", F.line4], ["5", F.line5], ["6", F.line6],
    ["7", F.line7], ["9a", F.line9a], ["9b", F.line9b], ["9c", F.line9c], ["10", F.line10], ["11", F.line11]] as const) {
    if ((line === "4" || line === "5") && !f2441.earnedIncomeFactsVerified) continue;
    const value = byLine.get(line);
    if (value !== undefined) setTextField(form, field, value.isZero() ? "0" : formatCurrency(value));
  }
  setTextField(form, F.line8decimal, f2441.creditPercentage.times(100).toFixed(0));
  await fillSourceRecords(doc, input);
  await markReviewPdf(doc);
  return doc;
}
