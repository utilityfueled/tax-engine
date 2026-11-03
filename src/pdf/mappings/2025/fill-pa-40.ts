import {isPAMarriedOrdinaryReturnResult,assertNoPAMarriedPaperExport} from '@/engine/state/pa-return-result.js';
import { markReviewPdf } from "../../export-policy.js";
import { assertPAWorkingCreditReview, type PreparedPAWorkingCreditReview } from "../../pa-working-credit-review-context.js";
import {assertPAOrdinaryReturnReview,isPAOrdinaryReturnResult,type PreparedPAOrdinaryReturnReview} from "../../pa-ordinary-return-review-context.js";
import type {PAOrdinaryReturnResult} from "@/engine/state/pa-ordinary-return.js";
import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for Pennsylvania PA-40 Personal Income Tax Return.
 *
 * Field names are from the official PA DoR fillable PDF (2025 tax year).
 * Field mapping was derived by inspecting field names in the blank PDF.
 *
 * To verify or update mappings, run the debug utility:
 *   fillDebugLabels('forms/blank/2025/pa-40.pdf', 'forms/filled/pa-40-debug.pdf')
 */

import { PDFDocument, PDFName, PDFDict, StandardFonts } from "pdf-lib";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { PAOrchestratorResult } from "@/engine/state/pa-orchestrator.js";
import type { PANonresidentOrchestratorResult } from "@/engine/state/pa-nonresident-orchestrator.js";
import Decimal from "decimal.js";
import type { PA40Result } from "@/engine/state/pa-40.js";
import {
  loadReviewTemplate,
  setTextField,
  setCurrencyField,
  setCheckBox,
} from "../../pdf-utils.js";

// ─── PDF Field Names ──────────────────────────────────────────────────────
// Exact field names from the 2025 PA-40 fillable PDF.
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

type PAPacketResult = PAOrchestratorResult | PANonresidentOrchestratorResult | PAOrdinaryReturnResult;

/** Render-only original facts. Diagnostic callers do not gain source qualification. */
export interface PA40DiagnosticRenderFacts {
  filingStatus?: "S" | "J" | "M" | "F";
  residency?: { status: "resident" | "part_year" | "nonresident"; schoolCode: string; schoolDistrictName: string; from?: string; through?: string };
  requestedRefund?: string;
  finalReturnReason?:string;
  dependentChildren?:number;
  nextYearCredit?:string;
  donations?:Array<{code:string;amount:string}>;
}

function prepareOfficialWidget(form: ReturnType<PDFDocument["getForm"]>, name: string): void {
  const field = form.getField(name);
  for (const widget of field.acroField.getWidgets()) {
    const normal = widget.dict.lookup(PDFName.of("AP"), PDFDict).lookup(PDFName.of("N"), PDFDict);
    // Keep official on-state streams even when the actual selection is unknown.
    // A blank Off stream prevents default save from regenerating the whole group.
    if (!normal.has(PDFName.of("Off"))) {
      const box = widget.getRectangle();
      normal.set(PDFName.of("Off"), form.doc.context.register(form.doc.context.flateStream("", {
        Type: "XObject", Subtype: "Form", BBox: [0, 0, box.width, box.height],
      })));
    }
  }
  form.markFieldAsClean(field.ref);
}

function selectOfficialWidget(form: ReturnType<PDFDocument["getForm"]>, name: string, value: string): void {
  prepareOfficialWidget(form, name);
  const field = form.getField(name);
  const widgets = field.acroField.getWidgets();
  if (!widgets.some(widget => widget.getOnValue()?.toString() === `/${value}`)) throw new Error(`PA40 official field has no selected appearance: ${name}`);
  // The official group is FT=Btn without the radio flag. check() selects only
  // its first widget. Set the canonical value and exclusive actual appearance.
  field.acroField.dict.set(PDFName.of("V"), PDFName.of(value));
  for (const widget of widgets) widget.setAppearanceState(PDFName.of(widget.getOnValue()?.toString() === `/${value}` ? value : "Off"));
}

function keepReviewNoticeVisible(doc: PDFDocument): void {
  for (const field of doc.getForm().getFields()) {
    if (field.acroField.dict.get(PDFName.of("FT"))?.toString() !== "/Btn" || !(field.acroField.getFlags() & 65536)) continue;
    for (const widget of field.acroField.getWidgets()) {
      const box = widget.getRectangle();
      // Hide decorative navigation/reset/print controls only in the filled review
      // copy. Retain every original field, widget, rectangle and appearance stream.
      if (box.y < 18 && box.y + box.height > 3) widget.setFlags((widget.getFlags() | 2) & ~4);
    }
  }
}


/**
 * Fill a PA-40 PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves to disk).
 */
export async function fillPA40(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
  workingCreditReview?: PreparedPAWorkingCreditReview,
  ordinaryReview?:PreparedPAOrdinaryReturnReview,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const paResult = result.stateReturns?.pennsylvania;
  assertNoPAMarriedPaperExport(input,paResult);
  if(isPAMarriedOrdinaryReturnResult(paResult))throw Error('Actual married PA paper mapping is unavailable.');
  if (!paResult) {
    throw new Error("No Pennsylvania state return result available");
  }

  let actualFacts:PA40DiagnosticRenderFacts|undefined;
  if(isPAOrdinaryReturnResult(paResult)||input.paOrdinaryReturnFacts!==undefined||input.paOrdinaryReturnCompletionSources!==undefined||ordinaryReview!==undefined){
    if(workingCreditReview!==undefined)throw new Error("PA ordinary result requires its own original prepared context");
    actualFacts=assertPAOrdinaryReturnReview(input,result,ordinaryReview);
  }else{
    if(ordinaryReview!==undefined)throw new Error("PA ordinary prepared context cannot qualify a legacy result");
    assertPAWorkingCreditReview(input,result,workingCreditReview);
  }
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  applyPA40FieldMap(doc, input.taxpayer, paResult,actualFacts);
  await appendSourceTextReferences(doc,actualFacts);

  const ordinary=isPAOrdinaryReturnResult(paResult);
  const processing=ordinary?paResult.wptcProcessing: "workingCreditProcessing"in paResult?paResult.workingCreditProcessing:undefined;
  const workingCredit=ordinary?paResult.workingCredit:"workingPennsylvaniansTaxCredit"in paResult?paResult.workingPennsylvaniansTaxCredit:undefined;
  if (processing?.credit.gt(0)) {
    if(!workingCredit)throw new Error("Actual PA working credit source is missing");
    const reference = processing;
    const page = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const rows = [
      `${input.taxpayer.taxYear} PA Working Pennsylvanians Tax Credit - PROCESSING REFERENCE ONLY`,
      "This page is not an official PA-40 field or a filing attachment.",
      "The unchanged 2025 paper PA-40 excludes WPTC from printed payments and credits.",
      "Pennsylvania verifies the attached federal return and applies WPTC during processing.",
      `Actual federal EITC: $${workingCredit.federalEarnedIncomeCredit.toFixed(0)}`,
      `WPTC processing reference: $${reference.credit.toFixed(0)}`,
      `Credit applied to paper tax principal: $${reference.creditAppliedToTaxDue.toFixed(0)}`,
      `Remaining principal before penalties: $${reference.remainingTaxDueBeforePenalties.toFixed(0)}`,
      `Additional overpayment before penalties: $${reference.additionalOverpaymentBeforePenalties.toFixed(0)}`,
      "This reference does not predict DOR offsets, payment timing, interest or final settlement.",
    ];
    rows.forEach((text, index) => page.drawText(text, {x:36,y:736-index*26,size:index===0?10:9,font}));
    await markReviewPdf(doc);
  }
  return doc;
}

/** Internal scalar field projection: it does not validate original taxpayer sources. */
function applyPA40FieldMap(doc: PDFDocument, taxpayer: TaxYearInput["taxpayer"], paResult: PAPacketResult, facts?: PA40DiagnosticRenderFacts): void {
  const form = doc.getForm();
  const F = PA_40_FIELDS;
  const pa40 = paResult.pa40;

  // ── Personal Information ──
  fillPersonalInfo(form, taxpayer);

  // ── Filing Info ──
  fillFilingInfo(form, taxpayer, paResult, facts);

  // ── Part A: Income (Lines 1–11) ──
  fillIncome(form, pa40);

  // ── Part B: Tax, Payments, Credits (Lines 12–29) ──
  fillTaxAndPayments(form, pa40, facts);
  keepReviewNoticeVisible(doc);

  // ── Page 2 header ──
  const tp = taxpayer;
  const page2Name = tp.spouse
    ? `${tp.primary.lastName.toUpperCase()}, ${tp.primary.firstName.toUpperCase()} & ${tp.spouse.firstName.toUpperCase()}`
    : `${tp.primary.lastName.toUpperCase()}, ${tp.primary.firstName.toUpperCase()}`;
  setTextField(form, F.page2Names, page2Name);

}

/** Explicit field-map diagnostic for pre-created documents, never source admission.
 * It accepts render fields only, performs no template I/O, and cannot approve WPTC.
 * Production packets use fillPA40 and its unconditional original-source guard.
 */
export async function projectPA40DiagnosticFields(
  doc: PDFDocument,
  taxpayer: TaxYearInput["taxpayer"],
  projection: PAPacketResult,
  facts?: PA40DiagnosticRenderFacts,
): Promise<PDFDocument> {
  assertPdfExportAllowed(taxpayer.taxYear, taxpayer.taxYear);
  if (!projection.pa40.refundableCredits.eq(0)) throw new Error("PA40 diagnostic projection requires zero unprinted credits");
  applyPA40FieldMap(doc, taxpayer, projection, facts);
  await appendSourceTextReferences(doc,facts);
  await markReviewPdf(doc);
  doc.setTitle("PA-40 diagnostic field projection - source qualification unavailable");
  return doc;
}

/** Preserve complete privacy-safe source text beyond original physical field limits. */
async function appendSourceTextReferences(doc:PDFDocument,facts?:PA40DiagnosticRenderFacts):Promise<void>{
  const sources=[
    {field:PA_40_FIELDS.finalReturn,text:facts?.filingStatus==="F"?facts.finalReturnReason:undefined,label:"Final Return reason"},
    {field:PA_40_FIELDS.schoolDistrictName,text:facts?.residency?.schoolCode!=="99999"?facts?.residency?.schoolDistrictName:undefined,label:"School District name"},
  ];
  for(const source of sources){
    if(!source.text||doc.getForm().getTextField(source.field).getText()!=="SEE REFERENCE")continue;
    const font=await doc.embedFont(StandardFonts.Helvetica);let page=doc.addPage([612,792]),y=680;
    const heading=()=>{page.drawText("PA-40 "+source.label+" - REVIEW REFERENCE ONLY",{x:36,y:744,size:11,font});page.drawText("Full privacy-safe source text; this page is not an official filing attachment.",{x:36,y:720,size:9,font});};heading();
    let line="";
    const write=(value:string)=>{if(y<48){page=doc.addPage([612,792]);y=680;heading();}page.drawText(value,{x:36,y,size:10,font});y-=15;};
    for(const word of source.text.split(/\s+/)){
      if(line&&font.widthOfTextAtSize(line+" "+word,10)>540){write(line);line="";}
      for(const char of word){if(font.widthOfTextAtSize(line+char,10)>540){write(line);line="";}line+=char;}
      line+=" ";
    }
    if(line.trim())write(line.trim());
  }
  await markReviewPdf(doc);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function fillPersonalInfo(
  form: ReturnType<PDFDocument["getForm"]>,
  tp: TaxYearInput["taxpayer"],
): void {
  const F = PA_40_FIELDS;

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
  form.getTextField(F.yourOccupation).setFontSize(0);
  if (tp.spouse) {
    setTextField(form, F.spouseOccupation, tp.spouse.occupation ?? "");
    form.getTextField(F.spouseOccupation).setFontSize(0);
  }
}

function fillFilingInfo(
  form: ReturnType<PDFDocument["getForm"]>,
  tp: TaxYearInput["taxpayer"],
  paResult: PAPacketResult,
  facts?: PA40DiagnosticRenderFacts,
): void {
  const F = PA_40_FIELDS;

  const filing = facts?.filingStatus ?? (tp.filingStatus === "married_filing_jointly" ? "J" : tp.filingStatus === "married_filing_separately" ? "M" : "S");
  if (!["S", "J", "M", "F"].includes(filing)) throw new Error("PA40 actual filing choice is invalid");
  selectOfficialWidget(form, F.filingStatus, String(["S", "J", "M", "F"].indexOf(filing) + 1));
  prepareOfficialWidget(form, F.residencyStatus);
  if (facts?.residency) {
    const residency = facts.residency;
    const value = {resident:"1",nonresident:"2",part_year:"3"}[residency.status];
    if (!value || !/^\d{5}$/.test(residency.schoolCode) || !residency.schoolDistrictName.trim()) throw new Error("PA40 actual residency and school source is invalid");
    selectOfficialWidget(form, F.residencyStatus, value);
    setTextField(form, F.schoolCode, residency.schoolCode);
    // Actual outside-PA December31 residence uses instructed code99999, not a
    // fabricated/truncated PA school-district name. Keep the raw original intact.
    if (residency.schoolCode !== "99999") {
      const name=residency.schoolDistrictName.toUpperCase(),max=form.getTextField(F.schoolDistrictName).getMaxLength();
      setTextField(form,F.schoolDistrictName,max!==undefined&&name.length>max?"SEE REFERENCE":name);
      form.getTextField(F.schoolDistrictName).setFontSize(0);
    }
    if (residency.status === "part_year") {
      const date = (raw: string | undefined) => {
        if (!raw || !/^2025-\d{2}-\d{2}$/.test(raw) || new Date(raw+"T00:00:00Z").toISOString().slice(0,10) !== raw) throw new Error("PA40 actual part-year dates are required");
        return raw.slice(5,7)+"/"+raw.slice(8,10);
      };
      if (!residency.from || !residency.through || residency.from > residency.through) throw new Error("PA40 actual part-year date interval is invalid");
      setTextField(form,F.partYearFrom,date(residency.from));setTextField(form,F.partYearTo,date(residency.through));
    }
  }

  // Dependents count
  const depCount = facts?.dependentChildren ?? tp.dependents?.length ?? 0;
  if(!Number.isInteger(depCount)||depCount<0)throw new Error("PA40 actual dependent child count is invalid");
  if (depCount > 0 || facts?.dependentChildren!==undefined) {
    setTextField(form, F.dependents, String(depCount));
  }

  if(filing==="F"&&facts?.finalReturnReason!==undefined){
    if(!facts.finalReturnReason.trim())throw new Error("PA40 actual final-return reason is required");
    const max=form.getTextField(F.finalReturn).getMaxLength();
    setTextField(form,F.finalReturn,max!==undefined&&facts.finalReturnReason.length>max?"SEE REFERENCE":facts.finalReturnReason);
  }
  // Tax Forgiveness checkbox (if Schedule SP credit > 0)
  setCheckBox(form, F.taxForgiveness, paResult.scheduleSP.taxForgivenessCredit.gt(0));

  // REV-1630 checkbox (underpayment penalty)
  if ("rev1630"in paResult && paResult.rev1630?.totalInterest.gt(0)) {
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
  facts?: PA40DiagnosticRenderFacts,
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
  setTextField(form, F.line25, pa40.useTax.toFixed(0));

  // Line 26: Tax due
  setCurrencyField(form, F.line26, pa40.taxDue);

  // Line 27: Penalties and interest
  setCurrencyField(form, F.line27, pa40.penaltiesAndInterest);
  const estimated = pa40.underpaymentPenalty.gt(0);
  const late = pa40.lateFilingOrPaymentPenalty.gt(0) || pa40.latePaymentInterest.gt(0);
  if (pa40.penaltiesAndInterest.gt(0)) {
    if (!estimated && !late) throw new Error("PA40 positive line27 requires actual penalty components");
    setTextField(form,F.line27Code,estimated ? late ? "B" : "E" : "L");
  }

  // Line 28: Total payment due
  setCurrencyField(form, F.line28, pa40.totalAmountDue);

  // Line 29: Overpayment
  setCurrencyField(form, F.line29, pa40.netOverpayment);

  // An overpayment does not establish the taxpayer's actual refund election.
  if (facts?.requestedRefund !== undefined) {
    if (!/^\d+(?:\.\d{1,2})?$/.test(facts.requestedRefund)) throw new Error("PA40 actual requested refund is invalid");
    const refund = new Decimal(facts.requestedRefund).toDecimalPlaces(0,Decimal.ROUND_HALF_UP);
    if (refund.gt(pa40.netOverpayment)) throw new Error("PA40 requested refund exceeds reported overpayment");
    setCurrencyField(form,F.line30,refund);
  }
  if(facts?.nextYearCredit!==undefined){
    if(!/^\d+$/.test(facts.nextYearCredit))throw new Error("PA40 actual next-year credit election is invalid");
    setCurrencyField(form,F.line31,new Decimal(facts.nextYearCredit));
  }
  if(facts?.donations!==undefined){
    if(facts.donations.length>5)throw new Error("PA40 donation continuation method is required");
    const fields=[[F.line32Code,F.line32],[F.line33Code,F.line33],[F.line34Code,F.line34],[F.line35Code,F.line35],[F.line36Code,F.line36]] as const;
    for(const [index,row]of facts.donations.entries()){
      if(!/^[A-GIJ]$/.test(row.code)||!/^\d+$/.test(row.amount)||!new Decimal(row.amount).gt(0))throw new Error("PA40 actual donation election is invalid");
      setTextField(form,fields[index][0],row.code);setCurrencyField(form,fields[index][1],new Decimal(row.amount));
    }
  }
}
