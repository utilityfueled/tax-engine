/**
 * PDF filler for Pennsylvania PA-40 Personal Income Tax Return.
 *
 * Field names are from the official PA DoR fillable PDF (2024 tax year).
 * Field mapping was derived by inspecting field names in the blank PDF.
 *
 * To verify or update mappings, run the debug utility:
 *   fillDebugLabels('forms/blank/pa-40.pdf', 'forms/filled/pa-40-debug.pdf')
 */

import { PDFDocument } from "pdf-lib";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { PAOrchestratorResult } from "@/engine/state/pa-orchestrator.js";
import type { PANonresidentOrchestratorResult } from "@/engine/state/pa-nonresident-orchestrator.js";
import type { PA40Result } from "@/engine/state/pa-40.js";
import {
  loadBlankPdf,
  setTextField,
  setCurrencyField,
  setCheckBox,
} from "./pdf-utils.js";

// ─── PDF Field Names ──────────────────────────────────────────────────────
// Exact field names from the 2024 PA-40 fillable PDF.
// Note: some fields have deliberate typos/spacing per the official PDF.

export const PA_40_FIELDS = {
  // ── Taxpayer Identity / Address ──
  primarySSN: "Enter SSN shown first without dashes or spaces",
  spouseSSN: "Enter SSN of spouse without dashes or spaces",
  primaryFirstName: "Use all caps to enter taxpayer's first name",
  primaryLastName: "Use all caps to enter taxpayer's last name",
  primarySuffix: "Use all caps to enter suffixes such as JR, SR, III",
  primaryMiddleInitial: "Use Cap For Your Middle Initial",
  spouseFirstName: "Use all caps to enter spouse's first name",
  spouseLastName: "Use all caps to enter spouse's last name if different from above",
  spouseSuffix: "Use all caps to enter spouse's suffixes such as JR, SR, III",
  spouseMiddleInitial: "Use Cap For Your Spouse's Middle Initial",
  addressLine1: "Use all caps to enter First Line of Address",
  addressLine2: "Use all caps to enter Second Line of Address",
  city: "Use all caps to enter City or Post Office",
  state: "Use all caps to enter two character State abbreviation",
  zip: "Enter five digit Zip Code",
  countryCode: "Use all caps to enter two character Country Code",
  phone: "Enter Daytime Telephone Number without parenthesis, dashes or spaces",
  page2Names: "Name(s)",

  // ── Filing Info ──
  schoolCode: "Enter five digit School Code from list on pags 42 & 43",
  schoolDistrictName: "Name of School District",
  partYearFrom: "Part Year Resident from",
  partYearTo: "Part year resident to",
  finalReturn: "Final Return",
  yourOccupation: "Your Occupation",
  spouseOccupation: "Spouse's occupation",
  dependents: "Dependents",

  // ── Checkboxes ──
  extension: "Extension",
  amendedReturn: "Amended Return",
  residencyStatus: "Residency Status",
  filingStatus: "Filing Status",
  farmers: "Farmers",
  line4Loss: "4. Loss",
  line5Loss: "5. Loss",
  line6Loss: "6. Loss",
  taxForgiveness: "Tax Forgiveness",
  rev1630: "27. REV-1630",
  eFileOptOut: "E-File Opt Out",
  rev459B: "Form REV-459B",
  deceasedTaxpayer: "Taxpayer",
  deceasedSpouse: "Spouse",
  deceased: "Deceased",

  // ── Income Lines ──
  line1a: "1a. Gross Compensation",
  line1b: "1b. Unreimbursed Employee Business Expenses",
  line1c: "1c. Net Compensation",
  line2: "2. Interest Income",
  // Note: double space in official field name
  line3: "3. Dividend  and Capital Gains Distributions Income",
  line4: "4. Net Income or Loss from the Operation of a Business, etc",
  line5: "5. Net Gain or Loss from Sale, etc. of Property",
  line6: "6. Net Income or Loss from Rents, etc",
  line7: "7. Estate or Trust income",
  line8: "8. Gambling and Lottery Winnings",
  line9: "9. Total PA Taxable Income",
  // Note: double space in official field name
  line10Code: "Code",
  line10: "10.  Other Deductions",
  line11: "11. Adjusted PA Taxable Income",

  // ── Tax / Payments / Credits ──
  line12: "12. PA Tax Liability. Multiply Line 11 by 3.07%",
  line13: "13. Total PA Tax Withheld",
  line14: "14. Credit from your PA Income Tax Return",
  line15: "15. Estimated Installment Payments",
  line16: "16. Extension Payment",
  // Note: typo "Nonredsident" in official field name
  line17: "17. Nonredsident Tax Withheld",
  // Note: no space after period in official field name
  line18: "18.Total Estimated Payments and Credits",
  line20: "20. Total Eligibility Income",
  line21: "21. Tax Forgiveness Credit",
  line22: "22. Resident Credit",
  // Note: no space after period in official field name
  line23: "23.Total Other Credits",
  line24: "24. Total Payments and Credits",
  line25: "25. USE TAX",
  line26: "26. TAX DUE",
  // Note: no space after period in official field name
  line27: "27.Penalties and Interest",
  line27Code: "27. Code",
  line28: "28. TOTAL PAYMENT",
  line29: "29. OVERPAYMENT",
  line30: "30. Refund",
  line31: "31. Credit",

  // ── Donations (lines 32–36) ──
  line32Code: "32. Refund",
  line32: "32. Refund donation line",
  line33Code: "33. Refund",
  line33: "33. Refund donation line",
  line34Code: "34. Refund",
  line34: "34. Refund donation line",
  line35Code: "35. Refund",
  line35: "35. Refund donation line",
  line36Code: "36. Refund",
  line36: "36. Refund donation line",

  // ── Signature / Preparer ──
  date: "Date",
  preparerSSNPTIN: "Preparerês SSN / PTIN",
  preparerName: "Preparer's Name",
  preparerPhone: "Preparer's Telephone Number",
  firmFEIN: "Firm FEIN",
  taxpayerDateOfDeath: "Taxpayer Date of Death",
  spouseDateOfDeath: "Spouse Date of Death",
} as const;

type PAPacketResult = PAOrchestratorResult | PANonresidentOrchestratorResult;

function hasREV1630(
  paResult: PAPacketResult,
): paResult is PAOrchestratorResult & { rev1630: NonNullable<PAOrchestratorResult["rev1630"]> } {
  return "rev1630" in paResult && paResult.rev1630 !== undefined;
}

/**
 * Fill a PA-40 PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves to disk).
 */
export async function fillPA40(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  const paResult = result.stateReturns?.pennsylvania;
  if (!paResult) {
    throw new Error("No Pennsylvania state return result available");
  }

  const doc = await loadBlankPdf(blankPdfPath);
  const form = doc.getForm();
  const F = PA_40_FIELDS;
  const pa40 = paResult.pa40;

  // ── Personal Information ──
  fillPersonalInfo(form, input);

  // ── Filing Info ──
  fillFilingInfo(form, input, paResult);

  // ── Part A: Income (Lines 1–11) ──
  fillIncome(form, pa40);

  // ── Part B: Tax, Payments, Credits (Lines 12–29) ──
  fillTaxAndPayments(form, pa40, paResult);

  // ── Page 2 header ──
  const tp = input.taxpayer;
  const page2Name = tp.spouse
    ? `${tp.primary.lastName.toUpperCase()}, ${tp.primary.firstName.toUpperCase()} & ${tp.spouse.firstName.toUpperCase()}`
    : `${tp.primary.lastName.toUpperCase()}, ${tp.primary.firstName.toUpperCase()}`;
  setTextField(form, F.page2Names, page2Name);

  return doc;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function fillPersonalInfo(
  form: ReturnType<PDFDocument["getForm"]>,
  input: TaxYearInput,
): void {
  const F = PA_40_FIELDS;
  const tp = input.taxpayer;

  setTextField(form, F.primarySSN, tp.primary.ssn.replace(/-/g, ""));
  setTextField(form, F.primaryFirstName, tp.primary.firstName.toUpperCase());
  setTextField(form, F.primaryLastName, tp.primary.lastName.toUpperCase());

  if (tp.spouse) {
    setTextField(form, F.spouseSSN, tp.spouse.ssn.replace(/-/g, ""));
    setTextField(form, F.spouseFirstName, tp.spouse.firstName.toUpperCase());
    if (tp.spouse.lastName !== tp.primary.lastName) {
      setTextField(form, F.spouseLastName, tp.spouse.lastName.toUpperCase());
    }
  }

  setTextField(form, F.addressLine1, tp.address.street.toUpperCase());
  if (tp.address.apt) {
    setTextField(form, F.addressLine2, tp.address.apt.toUpperCase());
  }
  setTextField(form, F.city, tp.address.city.toUpperCase());
  setTextField(form, F.state, tp.address.state.toUpperCase());
  setTextField(form, F.zip, tp.address.zip);

  setTextField(form, F.yourOccupation, tp.primary.occupation ?? "");
  if (tp.spouse) {
    setTextField(form, F.spouseOccupation, tp.spouse.occupation ?? "");
  }
}

function fillFilingInfo(
  form: ReturnType<PDFDocument["getForm"]>,
  input: TaxYearInput,
  paResult: PAPacketResult,
): void {
  const F = PA_40_FIELDS;
  const tp = input.taxpayer;

  // Filing status checkbox — PA uses single checkbox (checked = MFJ)
  const isMFJ = tp.filingStatus === "married_filing_jointly";
  setCheckBox(form, F.filingStatus, isMFJ);

  // Dependents count
  const depCount = tp.dependents?.length ?? 0;
  if (depCount > 0) {
    setTextField(form, F.dependents, String(depCount));
  }

  // Tax Forgiveness checkbox (if Schedule SP credit > 0)
  setCheckBox(form, F.taxForgiveness, paResult.scheduleSP.taxForgivenessCredit.gt(0));

  // REV-1630 checkbox (underpayment penalty)
  if (hasREV1630(paResult) && paResult.rev1630.totalInterest.gt(0)) {
    setCheckBox(form, F.rev1630, true);
  }
}

function fillIncome(
  form: ReturnType<PDFDocument["getForm"]>,
  pa40: PA40Result,
): void {
  const F = PA_40_FIELDS;

  // Line 1a: Gross compensation
  setCurrencyField(form, F.line1a, pa40.compensation);

  // Line 1b: Unreimbursed expenses
  setCurrencyField(form, F.line1b, pa40.unreimbursedExpenses);

  // Line 1c: Net compensation (1a - 1b)
  setCurrencyField(form, F.line1c, pa40.netCompensation);

  // Line 2: Interest income
  setCurrencyField(form, F.line2, pa40.interest);

  // Line 3: Dividends
  setCurrencyField(form, F.line3, pa40.dividends);

  // Line 4: Net business income (check loss box if negative)
  setCurrencyField(form, F.line4, pa40.netBusinessIncome.abs());
  setCheckBox(form, F.line4Loss, pa40.netBusinessIncome.isNeg());

  // Line 5: Net gain/loss (check loss box if negative)
  setCurrencyField(form, F.line5, pa40.netGainOrLoss.abs());
  setCheckBox(form, F.line5Loss, pa40.netGainOrLoss.isNeg());

  // Line 6: Net rental income (check loss box if negative)
  setCurrencyField(form, F.line6, pa40.netRentalIncome.abs());
  setCheckBox(form, F.line6Loss, pa40.netRentalIncome.isNeg());

  // Line 7: Estate/trust income
  setCurrencyField(form, F.line7, pa40.estateTrustIncome);

  // Line 8: Gambling/lottery winnings
  setCurrencyField(form, F.line8, pa40.gamblingIncome);

  // Line 9: Total PA taxable income
  setCurrencyField(form, F.line9, pa40.totalPATaxableIncome);

  // Line 10: Other deductions
  setCurrencyField(form, F.line10, pa40.otherDeductions);

  // Line 11: Adjusted PA taxable income
  setCurrencyField(form, F.line11, pa40.adjustedPATaxableIncome);
}

function fillTaxAndPayments(
  form: ReturnType<PDFDocument["getForm"]>,
  pa40: PA40Result,
  paResult: PAPacketResult,
): void {
  const F = PA_40_FIELDS;

  // Line 12: PA tax liability (3.07%)
  setCurrencyField(form, F.line12, pa40.taxLiability);

  // Line 13: State withholding
  setCurrencyField(form, F.line13, pa40.stateWithholding);

  // Line 14: Credit from prior year
  setCurrencyField(form, F.line14, pa40.creditFromPriorYear);

  // Line 15: Estimated payments
  setCurrencyField(form, F.line15, pa40.estimatedPayments);

  // Line 16: Extension payment
  setCurrencyField(form, F.line16, pa40.extensionPayment);

  // Line 17: Nonresident tax withheld
  setCurrencyField(form, F.line17, pa40.nonresidentTaxWithheld);

  // Line 18: Total estimated payments and credits
  setCurrencyField(form, F.line18, pa40.totalEstimatedPaymentsAndCredits);

  // Line 20: Total eligibility income (from Schedule SP)
  setCurrencyField(form, F.line20, pa40.taxForgivenessEligibilityIncome);

  // Line 21: Tax forgiveness credit (from Schedule SP)
  setCurrencyField(form, F.line21, pa40.taxForgivenessCredit);

  // Line 22: Resident credit (from Schedule G-L)
  setCurrencyField(form, F.line22, pa40.residentCredit);

  // Line 23: Total other credits (from Schedule OC, DC, etc.)
  setCurrencyField(form, F.line23, pa40.otherCredits);

  // Line 24: Total payments and credits
  setCurrencyField(form, F.line24, pa40.totalPaymentsAndCredits);

  // Line 25: Use tax
  setCurrencyField(form, F.line25, pa40.useTax);

  // Line 26: Tax due
  setCurrencyField(form, F.line26, pa40.taxDue);

  // Line 27: Penalties and interest
  setCurrencyField(form, F.line27, pa40.penaltiesAndInterest);
  // Line 27 code: "a" for REV-1630 underpayment penalty
  if (hasREV1630(paResult) && paResult.rev1630.totalInterest.gt(0)) {
    setTextField(form, F.line27Code, "a");
  }

  // Line 28: Total payment due
  setCurrencyField(form, F.line28, pa40.totalAmountDue);

  // Line 29: Overpayment
  setCurrencyField(form, F.line29, pa40.netOverpayment);

  // Line 30: Refund — for now, assume full overpayment goes to refund
  setCurrencyField(form, F.line30, pa40.netOverpayment);
}
