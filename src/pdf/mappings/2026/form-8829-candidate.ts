/** Disabled final 2026 Form 8829 physical candidate. Spec: spec/federal/form-8829-2026-template.yaml. */
import { createHash } from "node:crypto";
import { StandardFonts, rgb, type PDFDocument } from "pdf-lib";
import { calculateForm8829 } from "@/engine/forms/form-8829.js";
import { Form8829Schema, type Form8829Input } from "@/models/inputs.js";
import { REVIEW_PDF_NOTICE } from "../../export-policy.js";
import { loadPdfDocumentQuietly } from "../../pdf-utils.js";
import { removeTrustedTemplateLegacyFormData } from "../../trusted-review-template-cleanup.js";
import { buildForm8829OwnedHomeReviewInput } from "./form-8829-owned-home-sources.js";

export { buildForm8829OwnedHomeReviewInput } from "./form-8829-owned-home-sources.js";

const page = "topmostSubform[0].Page1[0].";
const firstExpenseTable = page + "Table_Lines9-12[0].";
const secondExpenseTable = page + "Table_Lines16-23[0].";

export const FORM_8829_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-pdf/f8829.pdf",
  sourceRevision: "Created 4/15/26",
  retrievedAt: "2026-11-20T11:01:26Z",
  sha256: "b2b1a269a18d254818ed084f1796223b94c4ea731d81dc2cd9bebd03f9e49c24",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  printedReferences: Object.freeze({
    line8From: "Schedule C (Form 1040), line 29, adjusted as printed",
    line35To: "Form 4684",
    line36To: "Schedule C (Form 1040), line 30",
    line42To: "Form 8829, line 30",
    carryoverYear: 2027,
    line43From: "Line 26 minus line 27, floored at zero",
    line44From: "Line 32 minus line 33, floored at zero",
  }),
  fields: Object.freeze({
    proprietorName: page + "f1_01[0]",
    ssn: page + "f1_02[0]",
    line1: page + "f1_03[0]",
    line2: page + "f1_04[0]",
    line3: page + "f1_05[0]",
    line4: page + "f1_06[0]",
    line5: page + "f1_07[0]",
    line6: page + "f1_08[0]",
    line7: page + "f1_09[0]",
    line8: page + "Line8_ReadOrder[0].f1_10[0]",
    line9Direct: firstExpenseTable + "Line9[0].f1_11[0]",
    line9Indirect: firstExpenseTable + "Line9[0].f1_12[0]",
    line10Direct: firstExpenseTable + "Line10[0].f1_13[0]",
    line10Indirect: firstExpenseTable + "Line10[0].f1_14[0]",
    line11Direct: firstExpenseTable + "Line11[0].f1_15[0]",
    line11Indirect: firstExpenseTable + "Line11[0].f1_16[0]",
    line12Direct: firstExpenseTable + "Line12[0].f1_17[0]",
    line12Indirect: firstExpenseTable + "Line12[0].f1_18[0]",
    line13: page + "f1_19[0]",
    line14: page + "f1_20[0]",
    line15: page + "f1_21[0]",
    line16Direct: secondExpenseTable + "Line16[0].f1_22[0]",
    line16Indirect: secondExpenseTable + "Line16[0].f1_23[0]",
    line17Direct: secondExpenseTable + "Line17[0].f1_24[0]",
    line17Indirect: secondExpenseTable + "Line17[0].f1_25[0]",
    line18Direct: secondExpenseTable + "Line18[0].f1_26[0]",
    line18Indirect: secondExpenseTable + "Line18[0].f1_27[0]",
    line19Direct: secondExpenseTable + "Line19[0].f1_28[0]",
    line19Indirect: secondExpenseTable + "Line19[0].f1_29[0]",
    line20Direct: secondExpenseTable + "Line20[0].f1_30[0]",
    line20Indirect: secondExpenseTable + "Line20[0].f1_31[0]",
    line21Direct: secondExpenseTable + "Line21[0].f1_32[0]",
    line21Indirect: secondExpenseTable + "Line21[0].f1_33[0]",
    line22Direct: secondExpenseTable + "Line22[0].f1_34[0]",
    line22Indirect: secondExpenseTable + "Line22[0].f1_35[0]",
    line23Direct: secondExpenseTable + "Line23[0].f1_36[0]",
    line23Indirect: secondExpenseTable + "Line23[0].f1_37[0]",
    line24: page + "f1_38[0]",
    line25: page + "f1_39[0]",
    line26: page + "f1_40[0]",
    line27: page + "f1_41[0]",
    line28: page + "f1_42[0]",
    line29: page + "f1_43[0]",
    line30: page + "f1_44[0]",
    line31: page + "f1_45[0]",
    line32: page + "f1_46[0]",
    line33: page + "f1_47[0]",
    line34: page + "f1_48[0]",
    line35: page + "f1_49[0]",
    line36: page + "f1_50[0]",
    line37: page + "f1_51[0]",
    line38: page + "f1_52[0]",
    line39: page + "f1_53[0]",
    line40: page + "f1_54[0]",
    line41: page + "f1_55[0]",
    line42: page + "f1_56[0]",
    line43: page + "f1_57[0]",
    line44: page + "f1_58[0]",
  }),
});

interface OriginalRenterAmount {
  taxYear: number;
  amount: string;
  reference: string;
}

interface Form8829RenterReviewSources {
  taxYear: number;
  completedActualExpenseCaseConfirmed: boolean;
  rentedOneHomeAllYearConfirmed: boolean;
  regularExclusiveBusinessUseAllYearUnchangedConfirmed: boolean;
  noOtherExpensesAdjustmentsOrCarryoversConfirmed: boolean;
  sameBusinessPercentageForIndirectRentAndUtilitiesConfirmed: boolean;
  floorArea: {
    businessSquareFeet: number;
    totalSquareFeet: number;
    reference: string;
  };
  scheduleCLine29: OriginalRenterAmount & {
    singleScheduleCBusinessUsingHomeConfirmed: boolean;
    allGrossIncomeFromBusinessUseOfHomeConfirmed: boolean;
    incomeSourceNote: string;
  };
  rent: OriginalRenterAmount;
  utilities: OriginalRenterAmount;
}

const commonMoneyLines = [
  "line8", "line13", "line14", "line15", "line23Indirect",
  "line24", "line25", "line26", "line27", "line28", "line31", "line32", "line33", "line34",
  "line36", "line43", "line44",
] as const;
const renterMoneyLines = [...commonMoneyLines, "line19Indirect", "line21Indirect"] as const;
const ownedHomeMoneyLines = [
  ...commonMoneyLines, "line16Indirect", "line17Indirect", "line30", "line37", "line38", "line39", "line40", "line42",
] as const;
const wholeDollarAmount = /^\d{1,12}(?:\.0{1,2})?$/;
const percentageFontSize = 9;

/** Project the confirmed ordinary renter case for internal review. */
export async function fillForm8829RenterReviewCandidate(
  sources: Form8829RenterReviewSources,
  template: Uint8Array,
): Promise<PDFDocument> {
  const { taxYear } = FORM_8829_2026_CANDIDATE;
  const { floorArea, scheduleCLine29, rent, utilities } = sources;
  const { businessSquareFeet, totalSquareFeet } = floorArea;
  if (sources.taxYear !== taxYear || sources.completedActualExpenseCaseConfirmed !== true
    || sources.rentedOneHomeAllYearConfirmed !== true || sources.regularExclusiveBusinessUseAllYearUnchangedConfirmed !== true
    || sources.sameBusinessPercentageForIndirectRentAndUtilitiesConfirmed !== true
    || sources.noOtherExpensesAdjustmentsOrCarryoversConfirmed !== true || !floorArea.reference.trim()
    || !Number.isSafeInteger(businessSquareFeet) || !Number.isSafeInteger(totalSquareFeet)
    || businessSquareFeet <= 0 || businessSquareFeet > totalSquareFeet
    || [scheduleCLine29, rent, utilities].some(original =>
      original.taxYear !== taxYear || !original.reference.trim() || !wholeDollarAmount.test(original.amount))) {
    throw new Error("Form 8829 requires confirmed 2026 renter originals with whole dollar amounts and no other expenses, adjustments or carryovers.");
  }
  if (scheduleCLine29.singleScheduleCBusinessUsingHomeConfirmed !== true
    || scheduleCLine29.allGrossIncomeFromBusinessUseOfHomeConfirmed !== true || !scheduleCLine29.incomeSourceNote?.trim()) {
    throw new Error("Form 8829 line 8 requires a source note confirming one Schedule C business uses the home and all its gross income is from that use.");
  }
  const input = Form8829Schema.parse({
    areaUsedForBusiness: businessSquareFeet,
    totalAreaOfHome: totalSquareFeet,
    grossIncomeLimit: scheduleCLine29.amount,
    indirectExpenses: { rent: rent.amount, utilities: utilities.amount },
  });
  return renderForm8829ReviewCandidate(input, template, "renter");
}

/** Project one confirmed prior-use owned home for internal review. */
export async function fillForm8829OwnedHomeReviewCandidate(sources: unknown, template: Uint8Array): Promise<PDFDocument> {
  return renderForm8829ReviewCandidate(buildForm8829OwnedHomeReviewInput(sources), template, "owned-home");
}

async function renderForm8829ReviewCandidate(
  input: Form8829Input,
  template: Uint8Array,
  mode: "renter" | "owned-home",
): Promise<PDFDocument> {
  const { sha256, fields } = FORM_8829_2026_CANDIDATE;
  if (createHash("sha256").update(template).digest("hex") !== sha256) {
    throw new Error("Unreviewed Form 8829 template revision.");
  }
  const result = calculateForm8829(input);
  const percentage = result.line7.times(100).toFixed();
  const [whole, fractional = ""] = percentage.split(".");
  const displayedNumerator = BigInt(whole + fractional);
  const displayScale = 10n ** BigInt(fractional.length);
  if (displayedNumerator * BigInt(input.totalAreaOfHome) !== 100n * BigInt(input.areaUsedForBusiness) * displayScale) {
    throw new Error("Form 8829 requires an exact decimal business percentage on lines 3 and 7.");
  }

  const pdf = await loadPdfDocumentQuietly(template);
  removeTrustedTemplateLegacyFormData(pdf);
  const form = pdf.getForm();
  const percentageFields = [form.getTextField(fields.line3), form.getTextField(fields.line7)];
  const textWidth = form.getDefaultFont().widthOfTextAtSize(percentage, percentageFontSize);
  for (const field of percentageFields) {
    const [widget] = field.acroField.getWidgets();
    // The text appearance adds one point of padding inside each border.
    const inset = 1 + (widget.getBorderStyle()?.getWidth() ?? 0);
    if (textWidth + 2 * inset > widget.getRectangle().width) {
      throw new Error("Form 8829 requires the exact business percentage to fit lines 3 and 7 at the native text size.");
    }
    field.setFontSize(percentageFontSize);
    field.setText(percentage);
  }
  const moneyLines = mode === "owned-home" ? ownedHomeMoneyLines : renterMoneyLines;
  for (const line of ["line1", "line2", ...moneyLines] as const) {
    form.getTextField(fields[line]).setText(result[line].toFixed());
  }
  if (mode === "owned-home") {
    const depreciationPercentage = form.getTextField(fields.line41);
    depreciationPercentage.setFontSize(percentageFontSize);
    depreciationPercentage.setText(result.line41.times(100).toFixed());
  }
  // The IRS footer uses the bottom margin. Put the notice above the title.
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.getPage(0).drawText(REVIEW_PDF_NOTICE, {
    x: 36, y: 773, size: 10, font, color: rgb(0.65, 0.05, 0.05),
  });
  pdf.setSubject(REVIEW_PDF_NOTICE);
  return pdf;
}
