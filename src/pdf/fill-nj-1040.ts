/**
 * PDF filler for New Jersey NJ-1040 Individual Income Tax Return.
 *
 * Field names are from the official NJ Division of Taxation fillable PDF.
 * The NJ-1040 uses individual digit boxes (maxLength=1) instead of single
 * text fields per line, requiring the setDigitFields utility.
 *
 * To verify or update mappings, run the debug utility:
 *   fillDebugLabels('forms/blank/nj-1040.pdf', 'forms/filled/nj-1040-debug.pdf')
 */

import { PDFDocument } from "pdf-lib";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { NJ1040Result } from "@/engine/state/nj-1040.js";
import {
  loadBlankPdf,
  setTextField,
  setDigitFields,
  setCheckBox,
} from "./pdf-utils.js";

// ─── PDF Field Names ──────────────────────────────────────────────────────
// NJ-1040 uses digit-per-box fields. Each line's amount is an ordered array
// of field names, one per digit, from most-significant to least-significant.
// Column C (Totals) fields are used for the engine's computed totals.

export const NJ_1040_FIELDS = {
  // ── Page 1: Personal Information ──
  primarySSN: [
    "undefined", "undefined_2", "Your Social Security Number required",
    "Text3", "Text4", "Text5", "Text6", "Text7", "Text8",
  ] as const,
  primaryName: "Last Name First Name Initial Joint Filers enter first name and middle initial of each Enter spousesCU partners last name ONLY if different",
  spouseSSN: [
    "undefined_3", "undefined_4", "undefined_5",
    "Text9", "Text10", "Text11", "Text12", "Text13", "Text14",
  ] as const,
  spouseName: "SpousesCU Partners SSN if filing jointly",
  countyCode: "CountyMunicipality Code See Table page 50",
  state: "State",
  zip: "ZIP Code",
  filingStatus: "Group1", // Radio group
  domesticPartner: "Group1qualwi5ab", // Radio group

  // ── Page 1: Exemptions ──
  exemptionSelfCheck: "Check Box18",
  exemptionSpouseCheck: "Check Box19",
  exemptionSelf65Check: "Check Box39",
  exemptionSpouse65Check: "Check Box40",
  exemptionSelfBlindCheck: "Check Box41",
  exemptionSelfDisabledCheck: "Check Box42",
  exemptionSpouseBlindCheck: "Check Box43",
  exemptionSpouseDisabledCheck: "Check Box44",
  exemptionVeteranSelfCheck: "Check Box45",
  exemptionVeteranSpouseCheck: "Check Box46",

  // Page 1 exemption amount digit fields
  exemptionRegular: ["Domestic", "undefined_9", "undefined_10"] as const,
  exemption65: ["undefined_12", "undefined_13", "undefined_14"] as const,
  exemptionTotal: ["undefined_15", "undefined_16", "undefined_17", "Text50", "Text51", "Text52", "Text53"] as const,

  // ── Page 2: Income Lines (Column C = Totals) ──
  // Line 15: Wages — Column C digit fields
  line15Wages: ["Text100", "Text101", "Text103", "Text104", "Text105", "Text106"] as const,
  // Line 16a: Taxable Interest — Column C
  line16aInterest: ["113", "114", "115", "116", "117"] as const,
  // Line 17: Business Income — Column C
  line17Business: ["118", "119", "120", "121", "122", "123"] as const,
  // Line 18: Capital Gains — Column C
  line18CapitalGains: ["124", "125", "126", "127", "128", "129"] as const,
  // Line 19: Pensions/Annuities — Column C
  line19Pensions: ["130", "131", "132", "133", "134", "135"] as const,
  // Line 20a: Partnership Income — Column C
  line20aPartnership: ["136", "137", "138", "139", "140", "141"] as const,
  // Line 20b: S-Corp Income — Column C
  line20bSCorp: ["142", "143", "144", "145", "146"] as const,
  // Line 21: Rent/Royalties — Column C (numbered fields from interleaved row)
  line21Rental: ["147", "148", "149", "150", "151", "152"] as const,
  // Line 22: Gambling — Column C
  line22Gambling: ["153", "154", "155", "156", "157", "158"] as const,
  // Line 23: Alimony — Column C
  line23Alimony: ["159", "160", "161", "162", "163", "164"] as const,
  // Line 24: Other Income — Column C
  line24Other: ["165", "166", "167", "168", "169", "170"] as const,
  // Line 25: IRA Deduction — Column C
  line25IRA: ["171", "172", "173", "174", "175", "176"] as const,
  // Line 26: Other Income — Column C
  line26Other: ["177", "178", "179", "180", "181", "182"] as const,
  // Line 27: NJ Gross Income — Column C
  line27GrossIncome: ["183", "184", "185", "186", "187", "188"] as const,

  // ── Page 2: Deductions & Adjustments (Lines 28-36) ──
  line28aPensionExclusion: ["189", "190", "191", "192", "193"] as const,
  line28bOtherRetirement: ["194", "195", "196", "197", "198"] as const,
  line28cHealthInsurance: ["199", "200", "201", "202", "203"] as const,
  line29TaxableIncome: ["204", "205", "206", "207", "208", "209"] as const,
  line30PropertyTaxDeduction: ["210", "211", "212", "213", "214"] as const,
  line31MedicalDeduction: ["215", "216", "217", "218", "219"] as const,
  line32CollegeAffordability: ["220", "221", "222", "223", "224"] as const,
  line33QualifiedConservation: ["225", "226", "227", "228", "229"] as const,
  line34HealthEnterprise: ["230", "231", "232", "233", "234"] as const,
  line35AltBusiness: ["235", "236", "237", "238", "239"] as const,
  line36OrganDonation: ["240", "241", "242", "243", "244"] as const,

  // ── Page 2: Tax Computation (Lines 37-41) ──
  line37NJTax: ["37", "245", "24539a#2", "undefined_116", "41"] as const,
  line39PropertyTaxCredit: ["39", "280", "undefined_112", "281", "282", "undefined_113", "283"] as const,
  line41TotalLine: ["undefined_117", "undefined_118", "Text1", "Text2", "Text18"] as const,

  // ── Page 3: Credits (Lines 40-53) ──
  // SSN and name header fields on page 3
  page3SSN: "Your Social Security Number_2",
  page3Name: "Names as shown on Form NJ1040_2",

  line40UseTax: ["40", "undefined_114", "Text19", "Text37", "Text38", "Text39", "Text40", "Text41"] as const,
  line42SRP: ["42", "undefined_119", "undefined_120", "Text43", "Text44", "Text45", "Text46", "Text63"] as const,
  line43TotalTax: ["43", "undefined_121", "undefined_122", "Text64", "Text74", "Text84", "Text94", "Text95"] as const,
  line44OtherJurisdiction: ["44", "undefined_123", "undefined_124", "Text96", "Text97", "Text98"] as const,
  line45SupplementalCredits: ["45", "undefined_125", "undefined_126", "Text99", "Text102", "Text108", "Text109", "Text110"] as const,
  line46PropertyTaxCreditLine: ["46", "undefined_127", "undefined_128", "Text111", "Text112", "Text113", "Text114", "Text115"] as const,
  line47TaxAfterCredits: ["47", "undefined_129", "undefined_130", "Text116", "Text117", "Text118", "Text119", "Text120"] as const,
  line48EITC: ["48", "undefined_131", "undefined_132", "Text121", "Text122", "Text123", "Text124", "Text125"] as const,
  line49ChildTaxCredit: ["49", "undefined_133", "undefined_134", "Text126", "Text127", "Text128", "Text129", "Text130"] as const,
  line50DependentCare: ["50", "50_2", "50_3", "Text131", "Text132", "Text133", "Text134", "50_7"] as const,
  line51WoundedWarrior: ["51", "undefined_137", "undefined_138", "Text136", "Text137", "Text138", "Text139", "Text140"] as const,
  line52UnderpaymentInterest: ["52", "undefined_139", "undefined_140", "Text141", "Text142", "Text143", "Text144", "Text145"] as const,
  line53TotalTaxRefCredits: ["53", "undefined_141", "undefined_142", "Text148", "Text149", "Text150", "Text151", "Text152"] as const,

  // ── Page 3: Payments (Lines 55-66) ──
  line55Withholding: ["55", "undefined_146", "Text158", "Text159"] as const,
  line56EstimatedPayments: ["56", "undefined_147", "undefined_148", "undefined_149", "Text160"] as const,
  line58ExcessUI: ["58", "undefined_152", "undefined_153", "Text170", "Text171", "Text172"] as const,
  line59ExcessDI: ["59", "undefined_154", "undefined_155", "Text173", "Text174", "Text175"] as const,
  line60ExcessFLI: ["60", "undefined_156", "undefined_157"] as const,
  line61ExcessPayroll: ["61", "undefined_158", "undefined_159", "Text179", "Text180", "Text181"] as const,
  line62PTBAIT: ["62", "undefined_160", "undefined_161"] as const,
  line63TotalRefundableCredits: ["63", "undefined_163", "undefined_164", "Text187", "Text188", "Text189", "Text190", "Text191"] as const,
  line64TotalPayments: ["64", "Text182", "Text183", "Text184", "Text185", "Text186"] as const,
  line66AmountOwedOrOverpayment: ["66", "undefined_172", "Text202", "Text203", "Text204"] as const,

  // ── Page 4: Contributions & Balance (Lines 68-76) ──
  page4SSN: "Your Social Security Number_3",
  page4Name: "Names as shown on Form NJ1040_3",

  line68Overpayment: ["68", "undefined_17268", "Text20268", "Text20368", "Text20468"] as const,
  line74Contributions: ["74", "undefined_181", "undefined_182", "undefined_183", "Text229", "Text230", "Text231", "Text232", "Text233"] as const,
  line75TotalAdjustments: ["75", "undefined_184", "undefined_185", "undefined_186", "Text234", "Text235", "Text236", "Text237", "Text238"] as const,
  line76BalanceDueOrRefund: ["76", "undefined_187", "undefined_188", "undefined_189", "Text240", "Text241", "Text242", "Text243", "Text244"] as const,
} as const;

/**
 * Fill an NJ-1040 PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves to disk).
 */
export async function fillNJ1040(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  const njResult = result.stateReturns?.newJersey;
  if (!njResult) {
    throw new Error("No New Jersey state return result available");
  }

  const doc = await loadBlankPdf(blankPdfPath);
  const form = doc.getForm();
  const F = NJ_1040_FIELDS;

  // ── Page 1: Personal Information ──
  const tp = input.taxpayer;
  fillSSN(form, F.primarySSN, tp.primary.ssn);
  setTextField(form, F.primaryName,
    `${tp.primary.lastName}  ${tp.primary.firstName}`);

  if (tp.spouse) {
    fillSSN(form, F.spouseSSN, tp.spouse.ssn);
    const spouseLastDiff = tp.spouse.lastName !== tp.primary.lastName ? tp.spouse.lastName : "";
    setTextField(form, F.spouseName,
      `${spouseLastDiff}  ${tp.spouse.firstName}`);
  }

  setTextField(form, F.state, tp.address.state);
  setTextField(form, F.zip, tp.address.zip);

  // ── Page 1: Exemption amount total ──
  setDigitFields(form, F.exemptionTotal, njResult.totalExemptions);

  // ── Page 2: Income (Column C Totals) ──
  fillIncome(form, njResult);

  // ── Page 2: Deductions (Lines 28-36) ──
  fillDeductions(form, njResult);

  // ── Page 2: Tax Computation ──
  setDigitFields(form, F.line29TaxableIncome, njResult.njTaxableIncome);
  setDigitFields(form, F.line37NJTax, njResult.njTax);

  // ── Page 3: Credits & Payments ──
  fillCreditsAndPayments(form, njResult);

  // ── Page 4: Balance ──
  fillBalance(form, njResult);

  return doc;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function fillSSN(form: ReturnType<PDFDocument["getForm"]>, fields: readonly string[], ssn: string): void {
  const digits = ssn.replace(/\D/g, "");
  for (let i = 0; i < Math.min(digits.length, fields.length); i++) {
    setTextField(form, fields[i], digits[i]);
  }
}

function fillIncome(form: ReturnType<PDFDocument["getForm"]>, nj: NJ1040Result): void {
  const F = NJ_1040_FIELDS;
  setDigitFields(form, F.line15Wages, nj.njGrossIncome); // Wages is part of gross income
  setDigitFields(form, F.line27GrossIncome, nj.njGrossIncome);
}

function fillDeductions(form: ReturnType<PDFDocument["getForm"]>, nj: NJ1040Result): void {
  const F = NJ_1040_FIELDS;
  setDigitFields(form, F.line30PropertyTaxDeduction, nj.propertyTaxDeduction);
  setDigitFields(form, F.line31MedicalDeduction, nj.medicalDeduction);
  setDigitFields(form, F.line32CollegeAffordability, nj.collegeAffordabilityDeduction);
  setDigitFields(form, F.line33QualifiedConservation, nj.qualifiedConservationContribution);
  setDigitFields(form, F.line34HealthEnterprise, nj.healthEnterpriseZoneDeduction);
  setDigitFields(form, F.line35AltBusiness, nj.alternativeBusinessCalculationAdjustment);
  setDigitFields(form, F.line36OrganDonation, nj.organDonationDeduction);
}

function fillCreditsAndPayments(form: ReturnType<PDFDocument["getForm"]>, nj: NJ1040Result): void {
  const F = NJ_1040_FIELDS;

  // Tax lines
  setDigitFields(form, F.line40UseTax, nj.useTax);
  setDigitFields(form, F.line42SRP, nj.sharedResponsibilityPayment);
  setDigitFields(form, F.line43TotalTax, nj.totalTax);

  // Nonrefundable credits
  setDigitFields(form, F.line44OtherJurisdiction, nj.otherJurisdictionCredit);
  setDigitFields(form, F.line45SupplementalCredits, nj.supplementalNonrefundableCredits);
  setDigitFields(form, F.line46PropertyTaxCreditLine, nj.propertyTaxCredit);
  setDigitFields(form, F.line47TaxAfterCredits, nj.taxAfterNonrefundableCredits);

  // Refundable credits
  setDigitFields(form, F.line48EITC, nj.njEITC);
  setDigitFields(form, F.line49ChildTaxCredit, nj.njChildTaxCredit);
  setDigitFields(form, F.line50DependentCare, nj.njDependentCareCredit);
  setDigitFields(form, F.line51WoundedWarrior, nj.woundedWarriorCredit);

  // Underpayment interest
  setDigitFields(form, F.line52UnderpaymentInterest, nj.line52UnderpaymentInterest);
  setDigitFields(form, F.line53TotalTaxRefCredits, nj.totalRefundableCredits);

  // Payments
  setDigitFields(form, F.line58ExcessUI, nj.excessUIWFSWFCredit);
  setDigitFields(form, F.line59ExcessDI, nj.excessDICredit);
  setDigitFields(form, F.line60ExcessFLI, nj.excessFLICredit);
  setDigitFields(form, F.line61ExcessPayroll, nj.excessPayrollCredit);
  setDigitFields(form, F.line62PTBAIT, nj.passThroughBusinessAlternativeIncomeTaxCredit);
  setDigitFields(form, F.line63TotalRefundableCredits, nj.totalRefundableCredits);
  setDigitFields(form, F.line64TotalPayments, nj.totalPayments);
}

function fillBalance(form: ReturnType<PDFDocument["getForm"]>, nj: NJ1040Result): void {
  const F = NJ_1040_FIELDS;

  setDigitFields(form, F.line68Overpayment, nj.line68Overpayment);
  setDigitFields(form, F.line74Contributions, nj.totalCharitableContributions);
  setDigitFields(form, F.line75TotalAdjustments, nj.line78TotalAdjustments);

  // Line 76: Balance due or refund
  if (nj.balanceDue.gt(0)) {
    setDigitFields(form, F.line76BalanceDueOrRefund, nj.balanceDue);
  } else if (nj.refund.gt(0)) {
    setDigitFields(form, F.line76BalanceDueOrRefund, nj.refund);
  }
}
