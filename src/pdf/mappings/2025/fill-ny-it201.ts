import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for New York IT-201 Full-Year Resident Income Tax Return.
 *
 * Field names are from the official NY DTF fillable PDF (2025 tax year).
 * Field mapping was derived by inspecting field names in the blank PDF.
 *
 * To verify or update mappings, run the debug utility:
 *   fillDebugLabels('forms/blank/2025/ny-it201.pdf', 'forms/filled/ny-it201-debug.pdf')
 */

import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { NYIT201FullReturnResult } from "@/engine/state/ny-it201-full-return.js";
import {
  loadReviewTemplate,
  setTextField,
  setCurrencyField,
  setCheckBox,
} from "../../pdf-utils.js";

// ─── PDF Field Names ──────────────────────────────────────────────────────
// Exact field names from the 2025 NY IT-201 fillable PDF.

export const NY_IT201_FIELDS = {
  // ── Personal Information ──
  tpFirstName: "TP_first_name",
  tpMiddleInitial: "TP_MI",
  tpLastName: "TP_last_name",
  tpSSN: "TP_SSN",
  tpDOB: "TP_DOB",
  tpOccupation: "TP_occupation",
  spouseFirstName: "Spouse_first_name",
  spouseMiddleInitial: "Spouse_MI",
  spouseLastName: "Spouse_last_name",
  spouseSSN: "Spouse_SSN",
  spouseDOB: "Spouse_DOB",
  spouseOccupation: "Spouse_occupation",

  // ── Mailing Address ──
  mailAddress: "TP_mail_address",
  mailApt: "TP_mail_apt",
  mailCity: "TP_mail_city",
  mailState: "TP_mail_state",
  mailZip: "TP_mail_zip",
  mailCountry: "TP_mail_country",

  // ── Checkboxes ──
  filingStatus: "Filing_status",
  dependent: "Dependent",
  itemized: "Itemized",
  foreignAccount: "Foreign_account",

  // ── School District ──
  sdCode: "SD_code",
  sdName: "SD_name",
  nysCountyResidence: "NYS_county_residence",

  // ── Dependents (Section H, up to 7) ──
  dependentFirst: ["H_first1", "H_first2", "H_first3", "H_first4", "H_first5", "H_first6", "H_first7"],
  dependentMiddle: ["H_middle1", "H_middle2", "H_middle3", "H_middle4", "H_middle5", "H_middle6", "H_middle7"],
  dependentLast: ["H_last1", "H_last2", "H_last3", "H_last4", "H_last5", "H_last6", "H_last7"],
  dependentRelationship: ["H_relationship1", "H_relationship2", "H_relationship3", "H_relationship4", "H_relationship5", "H_relationship6", "H_relationship7"],
  dependentSSN: ["H_dependent_ssn1", "H_dependent_ssn2", "H_dependent_ssn3", "H_dependent_ssn4", "H_dependent_ssn5", "H_dependent_ssn6", "H_dependent_ssn7"],
  dependentDOB: ["H_dependent_dob1", "H_dependent_dob2", "H_dependent_dob3", "H_dependent_dob4", "H_dependent_dob5", "H_dependent_dob6", "H_dependent_dob7"],
  additionalDependents: "H_additional_dependents",

  // ── Federal Income (Lines 1–19) ──
  line1: "Line1",
  line2: "Line2",
  line3: "Line3",
  line4: "Line4",
  line5: "Line5",
  line6: "Line6",
  line7: "Line7",
  line8: "Line8",
  line9: "Line9",
  line9Box: "Line 9_box",
  line10: "Line10",
  line10Box: "Line 10_box",
  line11: "Line11",
  line12: "Line12",
  line13: "Line13",
  line14: "Line14",
  line15: "Line15",
  line15Identify: "15_identify",
  line16: "Line16",
  line17: "Line17",
  line18: "Line18",
  line18Identify: "18_identify",
  line19: "Line19",

  // ── NY Additions (Lines 20–24) ──
  line20: "Line20",
  line21: "Line21",
  line22: "Line22",
  line23: "Line23",
  line24: "Line24",

  // ── NY Subtractions (Lines 25–33) ──
  line25: "Line25",
  line26: "Line26",
  line27: "Line27",
  line28: "Line28",
  line29: "Line29",
  line30: "Line30",
  line31: "Line31",
  line32: "Line32",
  line33: "Line33",

  // ── Deduction & Taxable Income (Lines 34–38) ──
  line34: "Line34",
  line34Deduction: "34Deduction",
  line35: "Line35",
  line36: "Line36",
  line37: "Line37",
  line38: "Line38",

  // ── Page 2: Name ──
  nameAsPage1: "Name_as_page1",

  // ── Tax & Credits (Lines 39–46) ──
  line39: "Line39",
  line40: "Line40",
  line41: "Line41",
  line42: "Line42",
  line43: "Line43",
  line44: "Line44",
  line45: "Line45",
  line46: "Line46",

  // ── NYC Tax (Lines 47–54) ──
  line47: "Line47",
  line47a: "Line47a",
  line48: "Line48",
  line49: "Line49",
  line50: "Line50",
  line51: "Line51",
  line52: "Line52",
  line53: "Line53",
  line54: "Line54",
  line54a: "Line54a",
  line54b: "Line54b",
  line54c: "Line54c",
  line54d: "Line54d",
  line54e: "Line54e",
  f1NYC: "F1_NYC",
  f2NYC: "F2_NYC",

  // ── Yonkers (Lines 55–57) ──
  line55: "Line55",
  line56: "Line56",
  line57: "Line57",
  d1Yonkers: "D1_Yonkers",
  d3Yonkers: "D3_Yonkers",
  d4: "D4",

  // ── Other Taxes & Totals (Lines 58–62) ──
  line58: "Line58",
  line59: "Line59",
  line60: "Line60",
  line61: "Line61",
  line62: "Line62",

  // ── Refundable Credits (Lines 63–71) ──
  line63: "Line63",
  line64: "Line64",
  line65: "Line65",
  line65EIC: "65_EIC",
  line66: "Line66",
  line67: "Line67",
  line68: "Line68",
  line69: "Line69",
  line69a: "Line69a",
  line70: "Line70",
  line70EIC: "70_EIC",
  line70a: "Line70a",
  line71: "Line71",

  // ── Payments (Lines 72–76) ──
  line72: "Line72",
  line73: "Line73",
  line74: "Line74",
  line75: "Line75",
  line76: "Line76",

  // ── Refund / Balance Due (Lines 77–82) ──
  line77: "Line77",
  line78: "Line78",
  line78a: "Line78a",
  line78b: "Line78b",
  line78Refund: "Line78_refund",
  line79: "Line79",
  line80: "Line80",
  line80Box: "Line80_box",
  line81: "Line81",
  line82: "Line82",

  // ── Direct Deposit (Line 83) ──
  line83Box: "Line83_box",
  line83aAccount: "Line83a_account",
  line83bRouting: "Line83b_routing",
  line83cAccountNum: "Line83c_account_num",

  // ── Electronic Withdrawal (Line 84) ──
  line84WithdrawalDate: "Line84_withdrawal_Date",
  line84WithdrawalAmount: "Line84_withdrawal_amount",

  // ── Signature ──
  signedDate: "signed_date",
  dayAreaCode: "day_ac",
  dayPhone: "day_phone",
  signEmail: "sign_email",
} as const;

const ZERO = new Decimal(0);

/** Format a YYYY-MM-DD date string as MMDDYYYY for the NY IT-201 PDF (8-char max). */
function formatDateForPdf(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr.slice(0, 8);
  return `${parts[1]}${parts[2]}${parts[0]}`;
}

/**
 * Fill a NY IT-201 PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves to disk).
 */
export async function fillNYIT201(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const nyResult = result.stateReturns?.newYork;
  if (!nyResult) {
    throw new Error("No New York state return result available");
  }

  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const F = NY_IT201_FIELDS;

  // ── Personal Information ──
  const tp = input.taxpayer;
  setTextField(form, F.tpFirstName, tp.primary.firstName);
  setTextField(form, F.tpLastName, tp.primary.lastName);
  setTextField(form, F.tpSSN, tp.primary.ssn.replace(/-/g, ""));
  setTextField(form, F.tpDOB, formatDateForPdf(tp.primary.dateOfBirth));
  setTextField(form, F.tpOccupation, tp.primary.occupation ?? "");

  if (tp.spouse) {
    setTextField(form, F.spouseFirstName, tp.spouse.firstName);
    setTextField(form, F.spouseLastName, tp.spouse.lastName);
    setTextField(form, F.spouseSSN, tp.spouse.ssn.replace(/-/g, ""));
    setTextField(form, F.spouseDOB, formatDateForPdf(tp.spouse.dateOfBirth));
    setTextField(form, F.spouseOccupation, tp.spouse.occupation ?? "");
  }

  // ── Address ──
  setTextField(form, F.mailAddress, tp.address.street);
  setTextField(form, F.mailApt, tp.address.apt ?? "");
  setTextField(form, F.mailCity, tp.address.city);
  setTextField(form, F.mailState, tp.address.state);
  setTextField(form, F.mailZip, tp.address.zip);

  // ── Filing Status ──
  const isMFJ = tp.filingStatus === "married_filing_jointly";
  setCheckBox(form, F.filingStatus, isMFJ);

  // ── Itemized deduction checkbox ──
  setCheckBox(form, F.itemized, nyResult.deduction.deductionUsed === "itemized");

  // ── Dependents (Section H) ──
  fillDependents(form, input);

  // ── Federal Income Summary (Lines 1–19) ──
  fillFederalIncomeSummary(form, result);

  // ── NY Additions (Lines 20–24) ──
  const addSub = nyResult.additionsSubtractions;
  setCurrencyField(form, F.line20, addSub.line20);
  setCurrencyField(form, F.line21, addSub.line21);
  setCurrencyField(form, F.line22, addSub.line22);
  setCurrencyField(form, F.line23, addSub.line23);
  setCurrencyField(form, F.line24, addSub.totalAdditions);

  // ── NY Subtractions (Lines 25–32) ──
  setCurrencyField(form, F.line25, addSub.line25);
  setCurrencyField(form, F.line26, addSub.line26);
  setCurrencyField(form, F.line27, addSub.line27);
  setCurrencyField(form, F.line28, addSub.line28);
  setCurrencyField(form, F.line29, addSub.line29);
  setCurrencyField(form, F.line30, addSub.line30);
  setCurrencyField(form, F.line31, addSub.line31);
  setCurrencyField(form, F.line32, addSub.totalSubtractions);

  // ── NY AGI (Line 33) ──
  setCurrencyField(form, F.line33, addSub.nyAgi);

  // ── Deduction & Taxable Income (Lines 34–38) ──
  const ded = nyResult.deduction;
  setCurrencyField(form, F.line34, ded.deductionAmount);
  setCheckBox(form, F.line34Deduction, ded.deductionUsed === "standard");
  setCurrencyField(form, F.line35, ded.agiMinusDeduction);
  setCurrencyField(form, F.line36, ded.dependentExemption);
  setCurrencyField(form, F.line37, ded.taxableIncome);

  // ── Page 2 Name Line ──
  const fullName = tp.spouse
    ? `${tp.primary.firstName} ${tp.primary.lastName} & ${tp.spouse.firstName} ${tp.spouse.lastName}`
    : `${tp.primary.firstName} ${tp.primary.lastName}`;
  setTextField(form, F.nameAsPage1, fullName);

  // ── Tax Computation (Line 38–39) ──
  setCurrencyField(form, F.line38, nyResult.taxComputation.tax);
  setCurrencyField(form, F.line39, nyResult.taxComputation.tax);

  // ── Credits (Lines 40–46) ──
  const creds = nyResult.credits;
  setCurrencyField(form, F.line40, creds.householdCredit);
  setCurrencyField(form, F.line41, creds.residentCredit);
  setCurrencyField(form, F.line42, creds.otherNYStateCredits);
  setCurrencyField(form, F.line43, creds.totalNYStateCredits);
  setCurrencyField(form, F.line44, creds.netNYStateTax);
  setCurrencyField(form, F.line45, creds.otherStateTaxes);
  setCurrencyField(form, F.line46, nyResult.totalNYStateTaxes);

  // ── NYC Tax (Lines 47–54) ──
  fillNYCTax(form, nyResult);

  // ── MCTMT (Lines 54a–54e) ──
  fillMCTMT(form, nyResult);

  // ── Yonkers Tax (Lines 55–57) ──
  fillYonkersTax(form, nyResult);

  // ── Other Taxes & Totals (Lines 58–62) ──
  setCurrencyField(form, F.line58, nyResult.totalLocalTaxes);
  setCurrencyField(form, F.line59, creds.salesUseTax);
  setCurrencyField(form, F.line60, nyResult.voluntaryContributions);
  setCurrencyField(form, F.line61, nyResult.totalTaxBeforeCreditsAndPayments);
  setCurrencyField(form, F.line62, nyResult.totalTaxBeforeCreditsAndPayments);

  // ── Refundable Credits (Lines 63–71) ──
  setCurrencyField(form, F.line63, nyResult.empireStateChildCreditAmount);
  setCurrencyField(form, F.line64, nyResult.childDependentCareCreditAmount);
  setCurrencyField(form, F.line65, nyResult.nyEarnedIncomeCredit);
  setCurrencyField(form, F.line66, nyResult.nyNoncustodialParentEarnedIncomeCredit);
  setCurrencyField(form, F.line67, nyResult.realPropertyTaxCredit);
  setCurrencyField(form, F.line68, nyResult.collegeTuitionCreditAmount);
  setCurrencyField(form, F.line69, nyResult.nycSchoolTaxCreditFixedAmount);
  setCurrencyField(form, F.line69a, nyResult.nycSchoolTaxCreditRateReductionAmount);
  setCurrencyField(form, F.line70, nyResult.nycEarnedIncomeCreditAmount);
  setCurrencyField(form, F.line70a, nyResult.nycIncomeTaxEliminationCreditAmount);
  setCurrencyField(form, F.line71, nyResult.otherRefundableCredits);

  // ── Payments (Lines 72–76) ──
  setCurrencyField(form, F.line72, nyResult.nyStateTaxWithheld);
  setCurrencyField(form, F.line73, nyResult.nycTaxWithheld);
  setCurrencyField(form, F.line74, nyResult.yonkersTaxWithheld);
  setCurrencyField(form, F.line75, nyResult.totalEstimatedAndExtensionPayments);
  setCurrencyField(form, F.line76, nyResult.totalCreditsAndPayments);

  // ── Refund / Balance Due (Lines 77–82) ──
  setCurrencyField(form, F.line77, nyResult.overpayment);
  setCurrencyField(form, F.line78, nyResult.amountAvailableForRefund);
  setCurrencyField(form, F.line78a, nyResult.nys529AccountDeposit);
  setCurrencyField(form, F.line78b, nyResult.cashRefundAfterNys529AccountDeposit);
  setCurrencyField(form, F.line79, nyResult.appliedToNextYearEstimatedTax);
  setCurrencyField(form, F.line80, nyResult.amountOwed);
  setCurrencyField(form, F.line81, nyResult.estimatedTaxPenalty);
  setCurrencyField(form, F.line82, nyResult.otherPenaltiesAndInterest);

  // ── Refund checkbox (line 78) — check if there's a refund ──
  setCheckBox(form, F.line78Refund, nyResult.overpayment.gt(ZERO));
  // ── Balance due checkbox (line 80) — check if there's a balance due ──
  setCheckBox(form, F.line80Box, nyResult.amountOwed.gt(ZERO));

  return doc;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function fillFederalIncomeSummary(
  form: ReturnType<PDFDocument["getForm"]>,
  result: TaxReturnResult,
): void {
  const F = NY_IT201_FIELDS;
  setCurrencyField(form, F.line1, result.totalWages);
  setCurrencyField(form, F.line2, result.totalInterest);
  setCurrencyField(form, F.line3, result.totalDividends);

  // Line 4: Taxable refunds from taxable refund worksheet
  if (result.taxableRefundWorksheet) {
    setCurrencyField(form, F.line4, result.taxableRefundWorksheet.taxableRefund);
  }

  // Line 6: Business income from Schedule C
  if (result.scheduleC) {
    setCurrencyField(form, F.line6, result.scheduleC.netProfit);
  }

  // Line 7: Capital gain or loss
  setCurrencyField(form, F.line7, result.capitalGainLoss);

  // Line 8: Other gains from Form 4797
  if (result.form4797) {
    setCurrencyField(form, F.line8, result.form4797.ordinaryGainOrLoss);
  }

  // Line 9: Taxable IRA distributions
  setCurrencyField(form, F.line9, result.iraDistributionsTaxable);
  setCheckBox(form, F.line9Box, result.iraDistributionsGross.gt(result.iraDistributionsTaxable));

  // Line 10: Taxable pensions
  setCurrencyField(form, F.line10, result.pensionDistributionsTaxable);
  setCheckBox(form, F.line10Box, result.pensionDistributionsGross.gt(result.pensionDistributionsTaxable));

  // Line 14: Taxable Social Security benefits
  setCurrencyField(form, F.line14, result.socialSecurityBenefitsTaxable);

  // Line 17: Total federal income
  setCurrencyField(form, F.line17, result.totalIncome);

  // Line 18: Federal adjustments to income
  setCurrencyField(form, F.line18, result.adjustmentsToIncome);

  // Line 19: Federal AGI
  setCurrencyField(form, F.line19, result.agi);
}

function fillDependents(
  form: ReturnType<PDFDocument["getForm"]>,
  input: TaxYearInput,
): void {
  const deps = input.taxpayer.dependents;
  const maxDeps = Math.min(deps.length, 7);
  const F = NY_IT201_FIELDS;

  for (let i = 0; i < maxDeps; i++) {
    const dep = deps[i];
    setTextField(form, F.dependentFirst[i], dep.firstName);
    setTextField(form, F.dependentLast[i], dep.lastName);
    setTextField(form, F.dependentRelationship[i], dep.relationship ?? "");
    setTextField(form, F.dependentSSN[i], dep.ssn.replace(/-/g, ""));
    setTextField(form, F.dependentDOB[i], formatDateForPdf(dep.dateOfBirth));
  }

  if (deps.length > 7) {
    setCheckBox(form, F.additionalDependents, true);
  }
}

function fillNYCTax(
  form: ReturnType<PDFDocument["getForm"]>,
  nyResult: NYIT201FullReturnResult,
): void {
  const F = NY_IT201_FIELDS;
  const nyc = nyResult.nycTax;

  setCurrencyField(form, F.line47, nyc.nycTaxableIncome);
  setCurrencyField(form, F.line47a, nyc.nycResidentTax);
  setCurrencyField(form, F.line48, nyc.nycHouseholdCredit);
  // Line 49: net NYC tax on resident income (47a - 48)
  const line49 = nyc.nycResidentTax.minus(nyc.nycHouseholdCredit);
  setCurrencyField(form, F.line49, line49.isNeg() ? ZERO : line49);
  setCurrencyField(form, F.line50, nyc.partYearNYCTax);
  setCurrencyField(form, F.line51, nyc.otherNYCTaxes);
  // Line 52: sum of applicable NYC tax lines
  const line52 = (line49.isNeg() ? ZERO : line49).plus(nyc.partYearNYCTax).plus(nyc.otherNYCTaxes);
  setCurrencyField(form, F.line52, line52);
  setCurrencyField(form, F.line53, nyc.otherNYCCredits);
  setCurrencyField(form, F.line54, nyc.totalNYCTax);
}

function fillMCTMT(
  form: ReturnType<PDFDocument["getForm"]>,
  nyResult: NYIT201FullReturnResult,
): void {
  const F = NY_IT201_FIELDS;
  const mctmt = nyResult.mctmtResult;
  if (!mctmt) return;

  setCurrencyField(form, F.line54a, mctmt.zone1.tax);
  setCurrencyField(form, F.line54b, mctmt.zone2.tax);
  if (mctmt.spouseZone1) {
    setCurrencyField(form, F.line54c, mctmt.spouseZone1.tax);
  }
  if (mctmt.spouseZone2) {
    setCurrencyField(form, F.line54d, mctmt.spouseZone2.tax);
  }
  setCurrencyField(form, F.line54e, mctmt.totalMCTMT);
}

function fillYonkersTax(
  form: ReturnType<PDFDocument["getForm"]>,
  nyResult: NYIT201FullReturnResult,
): void {
  const F = NY_IT201_FIELDS;
  const yonkers = nyResult.yonkersTax;

  setCurrencyField(form, F.line55, yonkers.yonkersResidentSurcharge);
  setCurrencyField(form, F.line56, yonkers.yonkersNonresidentEarningsTax);
  setCurrencyField(form, F.line57, yonkers.partYearYonkersSurcharge);
}
