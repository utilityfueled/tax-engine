import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for Illinois IL-1040 Individual Income Tax Return.
 *
 * Field names are from the official IL DoR fillable PDF (2025 tax year).
 * Field mapping was derived by inspecting field names in the blank PDF.
 *
 * To verify or update mappings, run the debug utility:
 *   fillDebugLabels('forms/blank/2025/il-1040.pdf', 'forms/filled/il-1040-debug.pdf')
 */

import { PDFDocument } from "pdf-lib";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput, IllinoisStateReturnInput } from "@/models/inputs.js";
import type { IL1040Result } from "@/engine/state/il-1040.js";
import {
  loadReviewTemplate,
  setTextField,
  setCurrencyField,
  setCheckBox,
} from "../../pdf-utils.js";

// ─── PDF Field Names ──────────────────────────────────────────────────────
// Exact field names from the 2025 IL-1040 fillable PDF.

export const IL_1040_FIELDS = {
  // ── Step 1: Personal Information ──
  firstName: "step1-A-firstnamemi",
  lastName: "step1-A-lastname",
  dob: "Step1-A-dob",
  ssn: "step1-A-ssn",
  spouseFirstName: "step1-A-spousefirstnamemi",
  spouseLastName: "step1-A-spouselastname",
  spouseDob: "step1-A-spousedob",
  spouseSsn: "step1-A-spousessn",
  mailingAddress: "step1-A-mailingaddress",
  aptNo: "step1-A-aptno",
  city: "step1-A-city",
  state: "step1-A-state",
  zip: "step1-A-zip",
  foreignNation: "step1-A-foreignnation",
  county: "step1-A-county",
  email: "step1-A-email",

  // ── Checkboxes ──
  filingStatus: "filing_status",
  dependentYou: "dependent_you",
  dependentStatus: "dependent_status",
  residency: "residency",

  // ── Step 2: Income (Lines 1–4) ──
  line1FederalAGI: "Federally adjusted income",
  line2TaxExemptInterest: "Federally tax-exempt interest",
  line3OtherAdditions: "Other additions",
  line4TotalIncome: "Total income",

  // ── Step 3: Subtractions (Lines 5–9) ──
  line5RetirementIncome: "step3-5",
  line6IlRefundSubtraction: "step3-6",
  line7OtherSubtractions: "step3-7",
  line8TotalSubtractions: "Total of your subtractions",
  line9BaseIncome: "Illinois base income",

  // ── Step 4: Exemptions (Line 10) ──
  line10aPersonalExemption: "Exemption amount",
  over65You: "over_65_you",
  over65Spouse: "over_65_spouse",
  line10b65Exemption: "65 or older exemption amount",
  blindYou: "blind_you",
  blindSpouse: "blind",
  line10cBlindExemption: "Legally blind exemption amount",
  line10dDependentExemption: "Claiming dependents",
  line10TotalExemptions: "Exemption allowance",

  // ── Step 5: Tax (Lines 11–14) ──
  line11NetIncome: "Illinois net income from Schedule NR",
  line12IncomeTax: "Multiply residency rate",
  line13Recapture: "Recapture of investment tax credits",
  line14TotalIncomeTax: "Income tax",

  // ── Step 6: Credits (Lines 15–19) ──
  line15OtherStateCredit: "Income tax paid to another state",
  line16ScheduleICR: "Schedule ICR",
  line17Schedule1299C: "Credit amount from Schedule 1299-C",
  line18TotalCredits: "Total of your credits",
  line19TaxAfterCredits: "Tax after nonrefundable credits",

  // ── Step 7: Other Taxes (Lines 20–24) ──
  line20HouseholdEmployment: "Household employment tax",
  line21UseTax: "Use tax",
  line22Compassionate: "Compassionate Use of Medical Cannabis Program Act",
  line24TotalTax: "Total Tax",

  // ── Page 2: Step 8 ──
  line24TotalTaxPage2: "Total tax from Page 1",
  line25Withholding: "Illinois Income Tax withheld",
  line26Estimated: "Estimated payments",
  line27PassThroughWithholding: "Pass-through withholding",
  line28PassThroughEntityCredit: "Pass-through entity tax credit",
  line29EITC: "Earned Income Tax Credit from Schedule IL-E/EIC",
  line30ChildTaxCredit: "Child Tax credit from Sch.IL-EITC",
  line31TotalPayments: "Total payments and refundable credit",

  // ── Steps 9–11: Result ──
  line32Overpayment: "If Line 31 is greater",
  line33TaxDue: "If Line 24 is greater",
  line34Penalty: "Late-payment penalty for underpayment",
  line34aFarmer: "Check if at least twothirds of your federal gross income is from farming",
  line34bNursingHome: "Check if you or your spouse are 65 or older and permanently living in a nursing home",
  line34cAnnualized: "Check if your income was not received evenly during the year and you annualized your income on Form IL2210",
  line34dNotRequired: "Check if you were not required to file an Illinois Individual Income Tax return in the previous tax year",
  line35Donations: "Voluntary charitable donations",
  line36PenaltyAndDonations: "Total penalty and donations",
  line37OverpaymentAmount: "Overpayment amount",
  line38Refund: "Refunded to you",
  routingNumber: "Routing number",
  accountType: "account_type",
  accountNumber: "Account number",
  refundCheckbox: "refund",
  line40CreditForward: "Amount to be credited forwarded",
  line41AmountOwed: "Amount you owe",

  // ── Line 42: Health Insurance ──
  healthSelf: "Self",
  healthSpouse: "Spouse_3",
  healthDependents: "Dependents",

  // ── Signature ──
  signatureDate: "date_2",
  daytimeAreaCode: "DaytimeAreaCode_1",
  phoneNumber: "phone_number_1",
} as const;

/**
 * Fill an IL-1040 PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves to disk).
 */
export async function fillIL1040(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const ilResult = result.stateReturns?.illinois;
  if (!ilResult) {
    throw new Error("No Illinois state return result available");
  }

  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const F = IL_1040_FIELDS;

  // ── Step 1: Personal Information ──
  const tp = input.taxpayer;
  setTextField(form, F.firstName, tp.primary.firstName);
  setTextField(form, F.lastName, tp.primary.lastName);
  setTextField(form, F.ssn, tp.primary.ssn.replace(/-/g, ""));
  setTextField(form, F.dob, tp.primary.dateOfBirth);

  if (tp.spouse) {
    setTextField(form, F.spouseFirstName, tp.spouse.firstName);
    setTextField(form, F.spouseLastName, tp.spouse.lastName);
    setTextField(form, F.spouseSsn, tp.spouse.ssn.replace(/-/g, ""));
    setTextField(form, F.spouseDob, tp.spouse.dateOfBirth);
  }

  setTextField(form, F.mailingAddress, tp.address.street);
  setTextField(form, F.aptNo, tp.address.apt ?? "");
  setTextField(form, F.city, tp.address.city);
  setTextField(form, F.state, tp.address.state);
  setTextField(form, F.zip, tp.address.zip);

  // ── Filing status & dependency checkboxes ──
  fillFilingStatusAndCheckboxes(form, input, ilResult);

  // ── Step 2: Income (Lines 1–4) ──
  setCurrencyField(form, F.line1FederalAGI, ilResult.federalAGI);
  setCurrencyField(form, F.line2TaxExemptInterest, ilResult.taxExemptInterest);
  setCurrencyField(form, F.line3OtherAdditions, ilResult.otherAdditions);
  setCurrencyField(form, F.line4TotalIncome, ilResult.totalIncome);

  // ── Step 3: Subtractions (Lines 5–9) ──
  setCurrencyField(form, F.line5RetirementIncome, ilResult.retirementIncomeSubtraction);
  setCurrencyField(form, F.line6IlRefundSubtraction, ilResult.ilRefundSubtraction);
  setCurrencyField(form, F.line7OtherSubtractions, ilResult.otherSubtractions);
  setCurrencyField(form, F.line8TotalSubtractions, ilResult.totalSubtractions);
  setCurrencyField(form, F.line9BaseIncome, ilResult.baseIncome);

  // ── Step 4: Exemptions (Line 10) ──
  setCurrencyField(form, F.line10aPersonalExemption, ilResult.personalExemption);
  fillExemptionCheckboxes(form, ilResult);
  setCurrencyField(form, F.line10b65Exemption, ilResult.age65Exemption);
  setCurrencyField(form, F.line10cBlindExemption, ilResult.blindExemption);
  setCurrencyField(form, F.line10dDependentExemption, ilResult.dependentExemption);
  setCurrencyField(form, F.line10TotalExemptions, ilResult.totalExemptions);

  // ── Step 5: Tax (Lines 11–14) ──
  setCurrencyField(form, F.line11NetIncome, ilResult.netIncome);
  setCurrencyField(form, F.line12IncomeTax, ilResult.incomeTax);
  setCurrencyField(form, F.line13Recapture, ilResult.investmentCreditRecapture);
  setCurrencyField(form, F.line14TotalIncomeTax, ilResult.totalIncomeTax);

  // ── Step 6: Credits (Lines 15–19) ──
  setCurrencyField(form, F.line15OtherStateCredit, ilResult.otherStateCredit);
  setCurrencyField(form, F.line16ScheduleICR, ilResult.scheduleICRCredit);
  setCurrencyField(form, F.line17Schedule1299C, ilResult.schedule1299CCredit);
  setCurrencyField(form, F.line18TotalCredits, ilResult.totalNonrefundableCredits);
  setCurrencyField(form, F.line19TaxAfterCredits, ilResult.taxAfterCredits);

  // ── Step 7: Other Taxes (Lines 20–24) ──
  setCurrencyField(form, F.line20HouseholdEmployment, ilResult.householdEmploymentTax);
  setCurrencyField(form, F.line21UseTax, ilResult.useTax);
  setCurrencyField(form, F.line22Compassionate, ilResult.compassionateUseSurcharge);
  setCurrencyField(form, F.line24TotalTax, ilResult.totalTax);

  // ── Page 2: Payments & Refundable Credits (Lines 24–31) ──
  setCurrencyField(form, F.line24TotalTaxPage2, ilResult.totalTax);
  setCurrencyField(form, F.line25Withholding, ilResult.ilWithholding);
  setCurrencyField(form, F.line26Estimated, ilResult.estimatedPayments);
  setCurrencyField(form, F.line27PassThroughWithholding, ilResult.passThroughWithholding);
  setCurrencyField(form, F.line28PassThroughEntityCredit, ilResult.passThroughEntityTaxCredit);
  setCurrencyField(form, F.line29EITC, ilResult.ilEITC);
  setCurrencyField(form, F.line30ChildTaxCredit, ilResult.ilChildTaxCredit);
  setCurrencyField(form, F.line31TotalPayments, ilResult.totalPayments);

  // ── Steps 9–11: Overpayment / Tax Due ──
  setCurrencyField(form, F.line32Overpayment, ilResult.preliminaryOverpayment);
  setCurrencyField(form, F.line33TaxDue, ilResult.preliminaryTaxDue);
  setCurrencyField(form, F.line34Penalty, ilResult.underpaymentPenalty);
  fillPenaltyCheckboxes(form, ilResult, input.stateReturns?.illinois?.il2210);
  setCurrencyField(form, F.line35Donations, ilResult.voluntaryCharitableDonations);
  setCurrencyField(form, F.line36PenaltyAndDonations, ilResult.totalPenaltyAndDonations);
  setCurrencyField(form, F.line37OverpaymentAmount, ilResult.overpayment);
  setCurrencyField(form, F.line38Refund, ilResult.refund);

  // ── Direct Deposit (Line 39) ──
  if (ilResult.directDeposit) {
    setTextField(form, F.routingNumber, ilResult.directDeposit.routingNumber);
    setTextField(form, F.accountNumber, ilResult.directDeposit.accountNumber);
    // account_type checkbox: checking vs savings
    setCheckBox(form, F.accountType, ilResult.directDeposit.accountType === "checking");
  }

  setCurrencyField(form, F.line40CreditForward, ilResult.creditCarryforward);
  setCurrencyField(form, F.line41AmountOwed, ilResult.taxDue);

  // ── Line 42: Health Insurance Checkbox ──
  if (ilResult.healthInsuranceCheckbox) {
    setCheckBox(form, F.healthSelf, ilResult.healthInsuranceCheckbox.selfUninsured);
    setCheckBox(form, F.healthSpouse, ilResult.healthInsuranceCheckbox.spouseUninsured);
    setCheckBox(form, F.healthDependents, ilResult.healthInsuranceCheckbox.dependentsUninsured);
  }

  return doc;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function fillFilingStatusAndCheckboxes(
  form: ReturnType<PDFDocument["getForm"]>,
  input: TaxYearInput,
  ilResult: IL1040Result,
): void {
  const ilInput = input.stateReturns?.illinois;
  // The IL-1040 has a single "filing_status" checkbox (corresponds to MFJ/single etc.)
  // For the IL PDF, filing status is indicated by checking the box
  const isMFJ = input.taxpayer.filingStatus === "married_filing_jointly";
  setCheckBox(form, IL_1040_FIELDS.filingStatus, isMFJ);

  // "dependent_you" checkbox — whether the primary taxpayer is claimed as a dependent
  if (ilInput) {
    setCheckBox(form, IL_1040_FIELDS.dependentYou, ilInput.claimedAsDependent);
    setCheckBox(form, IL_1040_FIELDS.dependentStatus, ilInput.spouseClaimedAsDependent ?? false);
  }
}

function fillExemptionCheckboxes(
  form: ReturnType<PDFDocument["getForm"]>,
  ilResult: IL1040Result,
): void {
  // Age 65+ checkboxes
  if (ilResult.age65Exemption.gt(0)) {
    setCheckBox(form, IL_1040_FIELDS.over65You, true);
    // If exemption is for 2 persons (MFJ), check spouse box too
    // IL 2025 additional exemption is $1,000 per person
    if (ilResult.age65Exemption.gte(2000)) {
      setCheckBox(form, IL_1040_FIELDS.over65Spouse, true);
    }
  }

  // Blind checkboxes
  if (ilResult.blindExemption.gt(0)) {
    setCheckBox(form, IL_1040_FIELDS.blindYou, true);
    if (ilResult.blindExemption.gte(2000)) {
      setCheckBox(form, IL_1040_FIELDS.blindSpouse, true);
    }
  }
}

function fillPenaltyCheckboxes(
  form: ReturnType<PDFDocument["getForm"]>,
  ilResult: IL1040Result,
  il2210Input?: IllinoisStateReturnInput["il2210"],
): void {
  if (!il2210Input) return;
  setCheckBox(form, IL_1040_FIELDS.line34aFarmer, il2210Input.qualifiesAsFarmer ?? false);
  setCheckBox(form, IL_1040_FIELDS.line34bNursingHome, il2210Input.is65OrOlderAndPermanentlyInNursingHome ?? false);
  setCheckBox(form, IL_1040_FIELDS.line34cAnnualized, ilResult.il2210?.annualizedWorksheet !== undefined);
  setCheckBox(form, IL_1040_FIELDS.line34dNotRequired, il2210Input.notRequiredToFilePriorYearReturn ?? false);
}
