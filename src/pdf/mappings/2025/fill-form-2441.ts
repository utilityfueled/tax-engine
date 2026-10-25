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
import { calculateForm2441Benefits } from "@/engine/forms/form-2441-benefits.js";
import { calculateDependentCareBenefitSources } from "@/engine/forms/dependent-care-benefit-sources.js";
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
const p2 = (n: string) => `topmostSubform[0].Page2[0].${n}`;
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
  // Part III, verified against final2025 printed page2 and widget rectangles.
  line12: p2("f2_1[0]"), line13: p2("f2_2[0]"), line14: p2("f2_3[0]"), line15: p2("f2_4[0]"),
  line16: p2("Line16_ReadOrder[0].f2_5[0]"), line17: p2("f2_6[0]"), line18: p2("f2_7[0]"), line19: p2("f2_8[0]"),
  line20: p2("f2_9[0]"), line21: p2("f2_10[0]"), line22: p2("f2_11[0]"), line23: p2("f2_12[0]"),
  line24: p2("f2_13[0]"), line25: p2("f2_14[0]"), line26: p2("f2_15[0]"),
  line27: p2("f2_16[0]"), line28: p2("f2_17[0]"), line29: p2("f2_18[0]"), line30: p2("f2_19[0]"), line31: p2("f2_20[0]"),
  line22No: p2("c2_1[0]"), line22Yes: p2("c2_1[1]"),
} as const;

const F = FORM_2441_FIELDS;
const benefitLineNumbers = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31] as const;

async function fillSourceRecords(doc: PDFDocument, input: TaxYearInput, result: TaxReturnResult): Promise<void> {
  const care = result.form2441 ? input.dependentCare : undefined;
  const benefitFacts = input.dependentCareBenefits;
  if (benefitFacts && (benefitFacts.sourceFactsConfirmed !== true || !Array.isArray(benefitFacts.providers)
    || typeof benefitFacts.usesDeemedIncome !== "boolean" || (new Decimal(benefitFacts.qualifiedExpensesIncurred ?? "NaN").gt(0) && !benefitFacts.providers.length))) {
    throw new Error("Form 2441 benefit provider and deemed-income source facts are incomplete");
  }
  if (!benefitFacts && !care?.providers?.length && !care?.qualifyingPersons?.length) return;
  if (care && (care.sourceFactsConfirmed !== true || !care.providers?.length || !care.qualifyingPersons?.length
    || typeof care.usesDeemedIncome !== "boolean" || care.qualifyingPersons.length !== care.qualifyingIndividuals)) {
    throw new Error("Form 2441 requires confirmed complete provider and qualifying-person source records");
  }
  const amount = (value: string) => {
    const parsed = new Decimal(value);
    if (!parsed.isFinite() || parsed.isNegative()) throw new Error("Form 2441 source amount must be finite and nonnegative");
    return parsed;
  };
  if (care && benefitFacts && (care.qualifyingIndividuals !== benefitFacts.qualifyingIndividuals || (result.form2441Benefits?.requiresForm2441 && care.receivedBenefits !== true)
    || (care.excludedDependentCareBenefits !== undefined && !amount(care.excludedDependentCareBenefits).eq(result.form2441Benefits?.totalBenefitsApplied ?? "NaN")))) throw new Error("Form 2441 credit and benefit source facts do not reconcile");
  if (care?.providers && benefitFacts?.providers) {
    const key = (provider: NonNullable<typeof care.providers>[number]) => JSON.stringify({ name: provider.name.trim(), address: provider.address.trim(), identifierType: provider.identifierType, taxId: provider.taxId?.replace(/-/g, "") ?? "", dueDiligenceStatement: provider.dueDiligenceStatement?.trim() ?? "", householdEmployee: provider.householdEmployee, amountPaid: amount(provider.amountPaid).toFixed() });
    if (JSON.stringify(care.providers.map(key).sort()) !== JSON.stringify(benefitFacts.providers.map(key).sort())) throw new Error("Form 2441 benefit and credit provider source records do not reconcile");
  }
  const providers = (benefitFacts?.providers ?? care?.providers ?? []).map(provider => {
    if (!provider.name.trim() || !provider.address.trim() || typeof provider.householdEmployee !== "boolean"
      || !["tin", "tax_exempt", "foreign_no_us_tin", "employer_furnished", "withheld"].includes(provider.identifierType)
      || (provider.identifierType === "withheld" && !provider.dueDiligenceStatement?.trim())) throw new Error("Form 2441 provider source is incomplete");
    const paid = amount(provider.amountPaid);
    if (provider.identifierType === "employer_furnished" && (!paid.isZero() || provider.householdEmployee || (!result.form2441Benefits?.requiresForm2441 && care?.receivedBenefits !== true))) throw new Error("Form 2441 employer-furnished source contradicts its required zero payment entry");
    return { ...provider, paid };
  }).sort((a, b) => b.paid.comparedTo(a.paid));
  const persons = (care?.qualifyingPersons ?? []).map(person => {
    if (!person.firstName.trim() || !person.lastName.trim() || typeof person.over12Disabled !== "boolean"
      || typeof person.qualifyingPersonConfirmed !== "boolean" || !["tax_id", "died"].includes(person.identifierType)) throw new Error("Form 2441 qualifying-person source is incomplete");
    return { ...person, expenses: amount(person.qualifiedExpenses) };
  }).sort((a, b) => b.expenses.comparedTo(a.expenses));
  const total = persons.reduce((sum, person) => sum.plus(person.expenses), new Decimal(0));
  if (care) {
    const actualNet = benefitFacts ? benefitFacts.qualifiedExpensesPaidForCredit : undefined;
    if (benefitFacts ? actualNet === undefined || !total.eq(amount(actualNet))
      : care.excludedDependentCareBenefits === undefined || !total.eq(Decimal.max(0, amount(care.expenses).minus(amount(care.excludedDependentCareBenefits))))) throw new Error("Form 2441 person expense sources do not reconcile");
  }
  const providerId = (provider: typeof providers[number]) => ({ tin: provider.taxId ?? "", tax_exempt: "Tax-Exempt", foreign_no_us_tin: "LAFCP", employer_furnished: "", withheld: "See Attached Statement" })[provider.identifierType];
  const personId = (person: typeof persons[number]) => person.identifierType === "died" ? "Died" : person.taxId ?? "";
  const money = (value: Decimal) => value.isZero() ? "0" : formatCurrency(value);
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const providerFields = [
    [F.provider1Name, F.provider1Address, F.provider1TIN, F.provider1HouseholdYes, F.provider1HouseholdNo, F.provider1Amount],
    [F.provider2Name, F.provider2Address, F.provider2TIN, F.provider2HouseholdYes, F.provider2HouseholdNo, F.provider2Amount],
    [F.provider3Name, F.provider3Address, F.provider3TIN, F.provider3HouseholdYes, F.provider3HouseholdNo, F.provider3Amount],
  ];
  providers.slice(0, 3).forEach((provider, i) => {
    const fields = providerFields[i];
    setTextField(form, fields[0], provider.name);
    setTextField(form, fields[1], provider.identifierType === "employer_furnished" ? "See W-2" : provider.address);
    // IRS instructions require this text when a provider withholds its ID;
    // the template's numeric-ID length cap is too short for the required notice.
    if (provider.identifierType === "withheld") {
      const idField = form.getTextField(fields[2]);
      idField.removeMaxLength();
      const width = idField.acroField.getWidgets()[0].getRectangle().width;
      idField.setFontSize(Math.min(9, (width - 6) / font.widthOfTextAtSize(providerId(provider), 1)));
    }
    setTextField(form, fields[2], providerId(provider));
    if (provider.identifierType === "withheld") form.getTextField(fields[2]).updateAppearances(font);
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
  setCheckBox(form, F.studentOrDisabled, care?.usesDeemedIncome === true || benefitFacts?.usesDeemedIncome === true);
  setCheckBox(form, F.moreProviders, providers.length > 3);
  setCheckBox(form, F.moreQualifyingPersons, persons.length > 3);
  const paragraphs = [
    ...providers.slice(3).map((provider, i) => `Provider ${i + 4}: ${provider.name}; address: ${provider.address}; identifier: ${providerId(provider)}; household employee: ${provider.householdEmployee ? "Yes" : "No"}; amount paid: ${money(provider.paid)}.`),
    ...persons.slice(3).map((person, i) => `Qualifying person ${i + 4}: ${person.firstName} ${person.lastName}; identifier: ${personId(person)}; over age 12 and incapable of self-care: ${person.over12Disabled ? "Yes" : "No"}; qualified expenses: ${money(person.expenses)}.`),
    ...providers.filter(provider => provider.identifierType === "withheld").map(provider => `Provider identification due diligence - ${provider.name}: ${provider.dueDiligenceStatement}`),
  ];
  if (!paragraphs.length) return;
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

/** Validate persisted audits against actual sources; never fill missing lines from a recomputation. */
function benefitAudits(input: TaxYearInput, result: TaxReturnResult): Map<string, Decimal> | undefined {
  const benefits = result.form2441Benefits;
  if (!benefits) {
    if (input.dependentCareBenefits || input.dependentCare?.receivedBenefits === true) throw new Error("Form 2441 Part III requires its actual source-backed audit");
    return undefined;
  }
  if (benefits.taxYear !== input.taxpayer.taxYear || benefits.sourceFactsVerified !== true || !input.dependentCareBenefits) throw new Error("Form 2441 Part III source audit and year must match");
  const expected = calculateForm2441Benefits({ taxYear: input.taxpayer.taxYear, filingStatus: input.taxpayer.filingStatus, facts: input.dependentCareBenefits });
  calculateDependentCareBenefitSources(input, expected);
  const byLine = new Map<string, Decimal>();
  const printed = new Set(benefitLineNumbers.map(String));
  for (const line of benefits.lines) {
    if (!printed.has(line.line)) continue;
    if (line.form !== "Form 2441" || byLine.has(line.line) || !Decimal.isDecimal(line.value) || !line.value.isFinite()
      || (!["18", "19", "23", "29"].includes(line.line) && line.value.isNegative())) throw new Error(`Form 2441 Part III requires a unique finite audit for line ${line.line}`);
    byLine.set(line.line, line.value);
  }
  for (const line of expected.lines.filter(line => line.form === "Form 2441")) {
    if (!byLine.get(line.line)?.eq(line.value)) throw new Error(`Form 2441 Part III audit ${line.line} is missing or contradicts its actual source`);
  }
  for (const key of ["alreadyIncludedInWages", "deductibleBenefits", "excludedBenefits", "taxableBenefits", "totalBenefitsApplied", "qualifyingCreditExpenses"] as const) {
    if (!Decimal.isDecimal(benefits[key]) || !benefits[key].eq(expected[key])) throw new Error(`Form 2441 Part III audit disagrees with ${key}`);
  }
  if (benefits.requiresForm2441 !== expected.requiresForm2441 || benefits.treatedAsUnmarried !== expected.treatedAsUnmarried) throw new Error("Form 2441 Part III source eligibility flags disagree");
  return byLine;
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
  const partIII = benefitAudits(input, result);
  if (!f2441 && !partIII) throw new Error("Form 2441 review requires its audited calculation");
  const required = ["3", "4", "5", "6", "7", "8", "9a", "10", "11"];
  const printed = new Set([...required, "9b", "9c"]);
  const byLine = new Map<string, Decimal>();
  for (const line of f2441?.lines ?? []) {
    if (!printed.has(line.line)) continue;
    if (line.form !== "Form 2441" || byLine.has(line.line) || !Decimal.isDecimal(line.value) || !line.value.isFinite()
      || (!["4", "5", "7"].includes(line.line) && line.value.isNegative())) {
      throw new Error(`Form 2441 requires a unique finite audit for printed line ${line.line}`);
    }
    byLine.set(line.line, line.value);
  }
  if (f2441) for (const line of required) if (!byLine.has(line)) throw new Error(`Form 2441 is missing audit line ${line}`);
  if (byLine.has("9b") !== byLine.has("9c")) throw new Error("Form 2441 prior-year audit is incomplete");
  if (f2441) for (const [line, total] of [["3", f2441.qualifyingExpenses], ["6", f2441.earnedIncomeLimit],
    ["7", result.agi], ["8", f2441.creditPercentage], ["11", f2441.credit]] as const) {
    if (!byLine.get(line)?.eq(total)) throw new Error(`Form 2441 audit line ${line} disagrees with its calculated total`);
  }
  if (input.dependentCare && f2441) {
    for (const [line, source] of [["4", input.dependentCare.primaryEarnedIncome],
      ["5", input.taxpayer.filingStatus === "married_filing_jointly" ? input.dependentCare.spouseEarnedIncome : input.dependentCare.primaryEarnedIncome]] as const) {
      if (source !== undefined && !byLine.get(line)?.eq(source)) throw new Error(`Form 2441 audit line ${line} contradicts the source income`);
    }
  }

  if (f2441 && partIII) {
    const eligible = input.dependentCare?.eligibilityConfirmed !== false
      && (input.taxpayer.filingStatus !== "married_filing_separately" || result.form2441Benefits?.treatedAsUnmarried === true);
    const expectedExpenses = eligible ? partIII.get("31") : new Decimal(0);
    if (!byLine.get("3")?.eq(expectedExpenses ?? "NaN")) throw new Error("Form 2441 Part II audit does not reconcile to the actual Part III handoff");
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
    if ((line === "4" || line === "5") && !f2441?.earnedIncomeFactsVerified) continue;
    const value = byLine.get(line);
    if (value !== undefined) setTextField(form, field, value.isZero() ? "0" : formatCurrency(value));
  }
  if (f2441) setTextField(form, F.line8decimal, f2441.creditPercentage.times(100).toFixed(0));
  if (partIII) {
    for (const line of benefitLineNumbers) {
      if (line >= 27 && !f2441) continue;
      if (line >= 30 && partIII.get("29")?.lte(0)) continue;
      const value = partIII.get(String(line));
      if (!value) throw new Error(`Form 2441 Part III is missing audit ${line}`);
      setTextField(form, F[`line${line}`], value.isZero() ? "0" : formatCurrency(value));
    }
    const hasBusinessAmount = input.dependentCareBenefits?.selfEmployedBenefits?.some(source => new Decimal(source.benefitsReceived ?? "NaN").plus(source.priorYearCarryoverUsed ?? "NaN").gt(0)) === true;
    setCheckBox(form, F.line22Yes, hasBusinessAmount); setCheckBox(form, F.line22No, !hasBusinessAmount);
    setCheckBox(form, F.mfsException, input.taxpayer.filingStatus === "married_filing_separately" && result.form2441Benefits?.treatedAsUnmarried === true);
  }
  await fillSourceRecords(doc, input, result);
  await markReviewPdf(doc);
  return doc;
}
