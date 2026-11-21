/** Final annual Form 8880 source. See spec/federal/form-8880-2026-template.yaml. */
import { createHash } from "node:crypto";
import type Decimal from "decimal.js";
import type { PDFDocument } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
import { d, sum } from "@/utils/decimal.js";
import { markReviewPdf } from "../../export-policy.js";
import { loadPdfDocumentQuietly } from "../../pdf-utils.js";

export const FORM_8880_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-prior/f8880--2026.pdf",
  sourceRevision: "Created 3/16/26",
  retrievedAt: "2026-11-19T05:12:45.163526+00:00",
  sha256: "a85be44f0743eb3c4df9cb7523b452553275fc6725e6cf9ad28b63c7354a4802",
  instructionsStatus: "final-2026-integrated-page-2",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  // Printed facts are provenance metadata, not a rate/calculation implementation.
  printed: Object.freeze({
    line8: "Form 1040, 1040-SR, or 1040-NR line 11a",
    line12: "Schedule 3 (Form 1040) line 4",
    worksheet1: "Form 1040, 1040-SR, or 1040-NR line 18",
    worksheet2: "Schedule 3 lines 1 through 3, 6d, and 6l",
    line6Cap: "2000",
    line9Prefix: "x 0 .",
    line9Digits: Object.freeze(["5", "2", "1", "0"]),
    rateTable: Object.freeze([
      Object.freeze(["---", "24250", "0.5", "0.5", "0.5"]),
      Object.freeze(["24250", "26250", "0.5", "0.5", "0.2"]),
      Object.freeze(["26250", "36375", "0.5", "0.5", "0.1"]),
      Object.freeze(["36375", "39375", "0.5", "0.2", "0.1"]),
      Object.freeze(["39375", "40250", "0.5", "0.1", "0.1"]),
      Object.freeze(["40250", "48500", "0.5", "0.1", "0.0"]),
      Object.freeze(["48500", "52500", "0.2", "0.1", "0.0"]),
      Object.freeze(["52500", "60375", "0.1", "0.1", "0.0"]),
      Object.freeze(["60375", "80500", "0.1", "0.0", "0.0"]),
      Object.freeze(["80500", "---", "0.0", "0.0", "0.0"]),
    ]),
  }),
  // Line 9 is a fractional digit after the preprinted x 0.; retain native MaxLen 1.
  fields: Object.freeze({
    name: "topmostSubform[0].Page1[0].f1_1[0]",
    ssn: "topmostSubform[0].Page1[0].f1_2[0]",
    line1a: "topmostSubform[0].Page1[0].Table_Ln1-6[0].BodyRow1[0].f1_3[0]",
    line1b: "topmostSubform[0].Page1[0].Table_Ln1-6[0].BodyRow1[0].f1_4[0]",
    line2a: "topmostSubform[0].Page1[0].Table_Ln1-6[0].BodyRow2[0].f1_5[0]",
    line2b: "topmostSubform[0].Page1[0].Table_Ln1-6[0].BodyRow2[0].f1_6[0]",
    line3a: "topmostSubform[0].Page1[0].Table_Ln1-6[0].BodyRow3[0].f1_7[0]",
    line3b: "topmostSubform[0].Page1[0].Table_Ln1-6[0].BodyRow3[0].f1_8[0]",
    line4a: "topmostSubform[0].Page1[0].Table_Ln1-6[0].BodyRow4[0].f1_9[0]",
    line4b: "topmostSubform[0].Page1[0].Table_Ln1-6[0].BodyRow4[0].f1_10[0]",
    line5a: "topmostSubform[0].Page1[0].Table_Ln1-6[0].BodyRow5[0].f1_11[0]",
    line5b: "topmostSubform[0].Page1[0].Table_Ln1-6[0].BodyRow5[0].f1_12[0]",
    line6a: "topmostSubform[0].Page1[0].Table_Ln1-6[0].BodyRow6[0].f1_13[0]",
    line6b: "topmostSubform[0].Page1[0].Table_Ln1-6[0].BodyRow6[0].f1_14[0]",
    line7: "topmostSubform[0].Page1[0].f1_15[0]",
    line8: "topmostSubform[0].Page1[0].f1_16[0]",
    line9: "topmostSubform[0].Page1[0].f1_17[0]",
    line10: "topmostSubform[0].Page1[0].f1_18[0]",
    line11: "topmostSubform[0].Page1[0].f1_19[0]",
    line12: "topmostSubform[0].Page1[0].f1_20[0]",
    worksheet1: "topmostSubform[0].Page2[0].Col2[0].Pg2Worksheet[0].f2_1[0]",
    worksheet2: "topmostSubform[0].Page2[0].Col2[0].Pg2Worksheet[0].f2_2[0]",
    worksheet3: "topmostSubform[0].Page2[0].Col2[0].Pg2Worksheet[0].f2_3[0]",
  }),
});

interface OrdinarySaverCreditSource {
  taxYear: number;
  accountHolder: "primary" | "spouse";
  sourceReference: string;
  employerEin: string;
  box1Wages: string;
  box12CodeD: string;
  /** Original sole wage source and a regular current-year 401(k) deferral with no catch-up, make-up or excess. */
  ordinaryWageOnlyReturnAndCodeDConfirmed: boolean;
}

const wholeDollarAmount = /^\d+(?:\.0{1,2})?$/;
const regularDeferralLimit = d("24500");
const precedingSchedule3Lines = new Set(["1", "2", "3", "6d", "6l"]);

/** Render the internal candidate from the annual federal calculation and its original payroll source. */
export async function fillForm88802026OrdinaryCandidate(
  rawInput: TaxYearInput,
  source: OrdinarySaverCreditSource,
  blank: Uint8Array,
): Promise<{ document: PDFDocument; schedule3Line4: Decimal }> {
  const candidate = FORM_8880_2026_CANDIDATE;
  if (rawInput.taxpayer.taxYear !== candidate.taxYear || source?.taxYear !== candidate.taxYear) {
    throw new Error("Form 8880 candidate requires 2026 return and source years.");
  }
  if (source.ordinaryWageOnlyReturnAndCodeDConfirmed !== true || !source.sourceReference?.trim()) {
    throw new Error("Form 8880 candidate requires confirmation of the original ordinary W-2 and Code D source.");
  }
  const input = TaxYearInputSchema.parse(rawInput);
  if (input.taxpayer.filingStatus !== "single" || input.taxpayer.spouse || input.taxpayer.dependents.length) {
    throw new Error("Form 8880 candidate requires one single filer with no dependents.");
  }
  const [w2] = input.w2s;
  if (input.w2s.length !== 1 || w2?.taxYear !== candidate.taxYear) {
    throw new Error("Form 8880 candidate requires one original 2026 W-2.");
  }
  if (w2.accountHolder !== "primary" || source.accountHolder !== "primary") {
    throw new Error("Form 8880 candidate requires a confirmed primary owner on the W-2.");
  }
  const { box12CodeD, wages, employer } = w2;
  if (!box12CodeD || ![box12CodeD, wages, source.box1Wages, source.box12CodeD].every(value => wholeDollarAmount.test(value))) {
    throw new Error("Form 8880 candidate requires actual whole dollar Box 1 and Code D amounts.");
  }
  if (!employer.name.trim() || !employer.ein.trim() || source.employerEin !== employer.ein
    || !d(wages).eq(source.box1Wages) || !d(box12CodeD).eq(source.box12CodeD)) {
    throw new Error("Form 8880 evidence must match the original W-2 employer, Box 1 and Code D.");
  }
  const competingDeferrals = [w2.box12CodeE, w2.box12CodeF, w2.box12CodeG, w2.box12CodeH,
    w2.box12CodeS, w2.box12CodeAA, w2.box12CodeBB, w2.box12CodeEE];
  if (d(wages).lte(0) || d(box12CodeD).lte(0) || d(box12CodeD).gt(regularDeferralLimit)
    || competingDeferrals.some(amount => !d(amount).isZero())) {
    throw new Error("Form 8880 candidate requires a positive ordinary Code D amount within the regular deferral limit.");
  }

  const formInput = input.form8880;
  const annual = formInput?.sourceFacts2026;
  if (!annual || !formInput) throw new Error("Form 8880 candidate requires complete confirmed Form 8880 annual facts.");
  if ([formInput.primaryElectiveDeferrals, formInput.supportedW2PrimaryElectiveDeferrals,
    formInput.spouseElectiveDeferrals, formInput.supportedW2SpouseElectiveDeferrals].some(amount => amount !== undefined)
    || [formInput.primaryIraContributions, formInput.primaryAbleContributions, formInput.spouseIraContributions,
      formInput.spouseAbleContributions].some(amount => !d(amount).isZero())) {
    throw new Error("Form 8880 candidate holds contribution overrides and sources other than the original Code D amount.");
  }
  if (!d(annual.primary.testingPeriodDistributionReduction).isZero() || input.form1099R?.length
    || !d(annual.americanSamoaAgiRestoration).isZero() || !d(annual.puertoRicoAgiRestoration).isZero()) {
    throw new Error("Form 8880 candidate requires confirmed zero retirement distributions and AGI restorations.");
  }
  if (createHash("sha256").update(blank).digest("hex") !== candidate.sha256) {
    throw new Error("Unreviewed Form 8880 candidate template revision.");
  }

  const federal = calculateFederalTax(input);
  const credit = federal.form8880;
  if (!credit?.line12.gt(0)) throw new Error("Form 8880 candidate requires a positive saver's credit.");
  const taxLimit = federal.allLines.find(row => row.form === "1040" && row.line === "18")?.value;
  const schedule3Line4 = federal.allLines.find(row => row.form === "Sched 3" && row.line === "4")?.value;
  const earlierCredits = sum(...federal.allLines.filter(row => row.form === "Sched 3" && precedingSchedule3Lines.has(row.line))
    .map(row => row.value));
  if (!taxLimit?.gt(0) || !earlierCredits.isZero() || !credit.line11.eq(taxLimit) || !schedule3Line4?.eq(credit.line12)) {
    throw new Error("Form 8880 candidate requires a reconciled tax limit, no preceding credits and matching Schedule 3 line 4.");
  }
  const otherIncome = [federal.totalInterest, federal.taxExemptInterest, federal.totalDividends,
    federal.iraDistributionsGross, federal.pensionDistributionsGross, federal.socialSecurityBenefitsGross,
    federal.capitalGainLoss, federal.otherIncome, federal.nolDeduction];
  if (federal.deductionUsed !== "standard" || !federal.taxableIncome.eq(federal.agi.minus(federal.standardDeduction))
    || !taxLimit.eq(federal.ordinaryTax) || otherIncome.some(amount => !amount.isZero())
    || !federal.totalWages.eq(wages) || !federal.totalIncome.eq(wages) || !federal.agi.eq(wages)
    || !credit.line8.eq(wages) || !credit.line2a.eq(box12CodeD)) {
    throw new Error("Form 8880 candidate requires a reconciled ordinary wage-only return and Code D contribution.");
  }

  const amounts = {
    line1a: credit.line1a, line2a: credit.line2a, line3a: credit.line3a, line4a: credit.line4a,
    line5a: credit.line5a, line6a: credit.line6a, line7: credit.line7, line8: credit.line8,
    line10: credit.line10, line11: credit.line11, line12: credit.line12,
    worksheet1: taxLimit, worksheet2: earlierCredits, worksheet3: taxLimit.minus(earlierCredits),
  } as const;
  const digit = credit.line9.times(10).toFixed();
  if (!candidate.printed.line9Digits.some(printed => printed === digit) || digit === "0"
    || Object.values(amounts).some(value => !value.isInteger() || value.isNegative())) {
    throw new Error("Form 8880 candidate requires exact whole dollars and a positive printed credit rate.");
  }

  const document = await loadPdfDocumentQuietly(blank);
  const form = document.getForm();
  const { fields } = candidate;
  const { firstName, lastName } = input.taxpayer.primary;
  form.getTextField(fields.name).setText(`${firstName} ${lastName}`);
  form.getTextField(fields.ssn).setText("REDACTED");
  form.getTextField(fields.line9).setText(digit);
  for (const key of Object.keys(amounts) as Array<keyof typeof amounts>) {
    form.getTextField(fields[key]).setText(amounts[key].toFixed(0));
  }
  await markReviewPdf(document);
  return { document, schedule3Line4 };
}
