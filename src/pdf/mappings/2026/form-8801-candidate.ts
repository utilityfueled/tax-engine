/** Disabled Form 8801 review candidate. Spec: spec/federal/form-8801-2026-template.yaml. */
import { createHash } from "node:crypto";
import { calculateForm8801 } from "@/engine/forms/form-8801.js";
import { readForm8801NoCreditReviewSources } from "@/models/form-8801-review-sources.js";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";
import { markReviewPdf } from "../../export-policy.js";
import { loadPdfDocumentQuietly } from "../../pdf-utils.js";
import { removeTrustedTemplateLegacyFormData } from "../../trusted-review-template-cleanup.js";

const page1 = "topmostSubform[0].Page1[0].";
const page2 = "topmostSubform[0].Page2[0].";
const nativeSize = 9;
const printedZeroLines = new Set([4, 7, 8, 9, 10, 15]);

export const FORM_8801_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  sourceUrl: "https://www.irs.gov/pub/irs-pdf/f8801.pdf",
  annualSourceUrl: "https://www.irs.gov/pub/irs-prior/f8801--2026.pdf",
  sourceRevision: "Created 5/27/26",
  postedDate: "2026-11-23",
  retrievedAt: "2026-11-24T14:38:25Z",
  sha256: "782d879f1d6e3ca636c129a61092f957f86e028e056e5261e5feb3895410d8f1",
  reviewStatus: "independent-review-pending",
  exportsEnabled: false,
  filingQualified: false,
  partIIFields: Object.freeze({
    "16": page2 + "f2_1[0]",
    "17": page2 + "f2_2[0]",
    "18": page2 + "f2_3[0]",
    "19": page2 + "f2_4[0]",
    "20": page2 + "f2_5[0]",
    "21": page2 + "f2_6[0]",
    "22": page2 + "f2_7[0]",
    "23": page2 + "f2_8[0]",
    "24": page2 + "f2_9[0]",
    "25": page2 + "f2_10[0]",
    "26": page2 + "f2_11[0]",
  }),
});

/** Fill the official stop-at-21 branch from confirmed prior originals without current-year tax calculations. */
export async function fillForm88012026NoCreditCandidate(rawInput: TaxYearInput, sources: unknown, template: Uint8Array) {
  const bytes = Uint8Array.from(template);
  if (createHash("sha256").update(bytes).digest("hex") !== FORM_8801_2026_CANDIDATE.sha256) {
    throw new Error("Unreviewed Form 8801 template revision.");
  }
  const input = TaxYearInputSchema.safeParse(rawInput);
  if (!input.success) throw new Error("Form 8801 review requires valid original source facts on the current return.");
  const { priorIncome, exclusions, priorRegularTax, priorAmt, carry } = readForm8801NoCreditReviewSources(input.data, sources);
  const result = calculateForm8801({
    sourceYear: 2025, sourceFactsConfirmed: true, sourceFactsComplete: true,
    priorYearFilingStatus: "single", priorYearForm6251Line1And2e: priorIncome,
    priorYearExclusionItemAdjustments: exclusions, priorYearForm6251Line10: priorRegularTax, priorYearAMT: priorAmt,
    priorYearMinimumTaxCreditNOLDeduction: d(0), priorYearMinimumTaxForeignTaxCredit: d(0),
    priorYearFiledForm2555: false, priorYearFiledForm1040NR: false, priorYearCapitalGainsRequired: false,
  }, { sourceYearOnly: true });
  const pool = result.minTaxCreditFromSourceYear.plus(carry);
  if (pool.gt(0)) throw new Error("A positive Form 8801 line 21 requires final 2026 current-year forms including Form 6251.");

  const document = await loadPdfDocumentQuietly(bytes);
  removeTrustedTemplateLegacyFormData(document);
  const form = document.getForm();
  const font = form.getDefaultFont();
  const setText = (name: string, value: string) => {
    const field = form.getTextField(name);
    const [widget] = field.acroField.getWidgets();
    const inset = 1 + (widget.getBorderStyle()?.getWidth() ?? 0);
    let width: number;
    try { width = font.widthOfTextAtSize(value, nativeSize); }
    catch { throw new Error("Form 8801 review contains text that cannot render in a native field."); }
    if (width + 2 * inset > widget.getRectangle().width) throw new Error("Form 8801 review values must fit at the native text size.");
    field.setFontSize(nativeSize);
    field.setText(value);
  };
  const { firstName, lastName } = input.data.taxpayer.primary;
  setText(page1 + "f1_1[0]", `${firstName} ${lastName}`);
  const lastPartILine = result.exclusionOnlyAMTI.isZero() ? 4 : result.amtBaseOnExclusions.isZero() ? 10 : 15;
  for (const { line, value } of result.lines) {
    const number = Number(line);
    if (number <= lastPartILine || number === 15) {
      const text = value.isZero() && printedZeroLines.has(number) ? "-0-" : value.toFixed();
      setText(page1 + `f1_${number + 2}[0]`, text);
    }
  }
  const fields = FORM_8801_2026_CANDIDATE.partIIFields;
  const partII = {
    16: priorAmt, 17: result.netMinTaxOnExclusionItems, 18: result.minTaxCreditFromSourceYear,
    19: carry, 20: d(0), 21: pool,
  } as const;
  for (const line of [16, 17, 18, 19, 20, 21] as const) setText(fields[line], partII[line].toFixed());
  form.updateFieldAppearances(font);
  await markReviewPdf(document);
  return document;
}
