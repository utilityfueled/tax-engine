/** Disabled Schedule B review candidate. Spec: spec/federal/schedule-b-2026-template.yaml. */
import { createHash } from "node:crypto";
import type Decimal from "decimal.js";
import { calculateScheduleB } from "@/engine/schedules/schedule-b.js";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
import { readScheduleBReviewOriginals } from "@/models/schedule-b-review-sources.js";
import { roundDollar, sum } from "@/utils/decimal.js";
import { markReviewPdf } from "../../export-policy.js";
import { loadPdfDocumentQuietly } from "../../pdf-utils.js";
import { removeTrustedTemplateLegacyFormData } from "../../trusted-review-template-cleanup.js";

const page1 = "topmostSubform[0].Page1[0].";
const nativeSize = 9;

export const SCHEDULE_B_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  sourceUrl: "https://www.irs.gov/pub/irs-pdf/f1040sb.pdf",
  annualSourceUrl: "https://www.irs.gov/pub/irs-prior/f1040sb--2026.pdf",
  aboutUrl: "https://www.irs.gov/forms-pubs/about-schedule-b-form-1040",
  catalogUrl: "https://www.irs.gov/forms-instructions-and-publications?find=1040&items_per_page=25&order=posted_date&page=0&sort=desc",
  instructionsUrl: "https://www.irs.gov/pub/irs-pdf/i1040sb.pdf",
  sourceRevision: "Created 6/9/26",
  postedDate: "2026-11-24",
  retrievedAt: "2026-11-24T20:32:40Z",
  byteLength: 72863,
  sha256: "f4b1827b12113dcdc2b5e14181b3c658fa5553a277dea02e5106000b592815af",
  reviewStatus: "independent-review-pending",
  exportsEnabled: false,
  filingQualified: false,
  nativeTextFields: Object.freeze(Array.from({ length: 66 }, (_, index) => {
    const fieldNumber = index + 1;
    const grouping = fieldNumber === 3 ? "Line1_ReadOrder[0]." : fieldNumber === 34 ? "ReadOrderControl[0]." : "";
    return `${page1}${grouping}f1_${String(fieldNumber).padStart(2, "0")}[0]`;
  })),
  nativeCheckboxFields: Object.freeze([
    "TagcorrectingSubform[0].c1_1[0]", "TagcorrectingSubform[0].c1_1[1]",
    "c1_2[0]", "c1_2[1]", "c1_3[0]", "c1_3[1]",
  ].map(name => page1 + name)),
});

function projectDollars(amounts: Decimal[], total: Decimal) {
  if (!sum(...amounts).eq(total)) throw new Error("Schedule B original amounts must reconcile to the exact calculated total.");
  const displayRows = amounts.map(roundDollar);
  const displayTotal = roundDollar(total);
  if (!sum(...displayRows).eq(displayTotal)) throw new Error("Schedule B displayed payer amounts must reconcile to the rounded total.");
  return { rows: displayRows.map(value => value.toFixed()), total: displayTotal.toFixed() };
}

/** Render one privately bound, redacted ordinary Schedule B worksheet for internal review. */
export async function fillScheduleB2026OrdinaryCandidate(rawInput: TaxYearInput, sources: unknown, template: Uint8Array) {
  const bytes = Uint8Array.from(template);
  if (createHash("sha256").update(bytes).digest("hex") !== SCHEDULE_B_2026_CANDIDATE.sha256) {
    throw new Error("Unreviewed Schedule B template revision.");
  }
  const input = TaxYearInputSchema.safeParse(rawInput);
  if (!input.success) throw new Error("Schedule B review requires valid original and foreign account facts on the current input.");
  const { interest, dividends } = readScheduleBReviewOriginals(input.data, sources);
  const result = calculateScheduleB(input.data);
  if (!result.isRequired) throw new Error("Schedule B review requires a Schedule B that is required by the original ordinary income.");
  if (result.interestReportingRows !== undefined || !result.savingsBondExclusion.isZero()
    || !result.previouslyReportedSavingsBondInterest.isZero() || !result.taxableInterest.eq(result.totalInterest)
    || !result.partThreeComplete || result.hasForeignAccounts !== false || result.hasForeignTrust !== false) {
    throw new Error("Schedule B review requires the ordinary domestic original calculation.");
  }
  const shownInterest = projectDollars(interest, result.totalInterest);
  const shownDividends = projectDollars(dividends, result.totalOrdinaryDividends);

  const document = await loadPdfDocumentQuietly(bytes);
  removeTrustedTemplateLegacyFormData(document);
  const form = document.getForm(), font = form.getDefaultFont();
  const { nativeTextFields, nativeCheckboxFields } = SCHEDULE_B_2026_CANDIDATE;
  const setText = (fieldNumber: number, value: string) => {
    const field = form.getTextField(nativeTextFields[fieldNumber - 1]);
    const [widget] = field.acroField.getWidgets();
    const inset = 1 + (widget.getBorderStyle()?.getWidth() ?? 0);
    if (font.widthOfTextAtSize(value, nativeSize) + 2 * inset > widget.getRectangle().width) {
      throw new Error("Schedule B review values must fit at the native text size.");
    }
    field.setFontSize(nativeSize);
    field.setText(value);
  };
  for (const [index, value] of shownInterest.rows.entries()) {
    setText(3 + index * 2, `Interest payer ${index + 1}`);
    setText(4 + index * 2, value);
  }
  if (shownInterest.rows.length) {
    setText(31, shownInterest.total);
    setText(33, shownInterest.total);
  }
  for (const [index, value] of shownDividends.rows.entries()) {
    setText(34 + index * 2, `Dividend payer ${index + 1}`);
    setText(35 + index * 2, value);
  }
  if (shownDividends.rows.length) setText(64, shownDividends.total);
  form.getCheckBox(nativeCheckboxFields[1]).check(); // Line 7a first question, No.
  form.getCheckBox(nativeCheckboxFields[5]).check(); // Line 8, No.
  form.updateFieldAppearances(font);
  await markReviewPdf(document);
  return document;
}
