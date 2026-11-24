/** Internal final 2026 candidate. Spec: spec/federal/form-6781-2026-template.yaml. */
import { createHash } from "node:crypto";
import type Decimal from "decimal.js";
import { calculateForm6781 } from "@/engine/forms/form-6781.js";
import { readForm6781ReviewOriginals } from "@/models/form-6781-review-sources.js";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
import { markReviewPdf } from "../../export-policy.js";
import { loadPdfDocumentQuietly } from "../../pdf-utils.js";
import { removeTrustedTemplateLegacyFormData } from "../../trusted-review-template-cleanup.js";

const page = "topmostSubform[0].Page1[0].";
const nativeSize = 9;

export const FORM_6781_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-pdf/f6781.pdf",
  annualSourceUrl: "https://www.irs.gov/pub/irs-prior/f6781--2026.pdf",
  sourceRevision: "Created 9/14/26",
  postedDate: "2026-11-24",
  retrievedAt: "2026-11-24T17:14Z",
  sha256: "40cf032ef46535e8695ffe22d6c76e0524f5be0eb9bc97ddd5a72207010c73c4",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
});

function signedAmount(amount: Decimal): string {
  return amount.lt(0) ? `(${amount.abs().toFixed(2)})` : amount.toFixed(2);
}

/** Create one marked review document and report only the 6781 amounts contributing to Schedule D. */
export async function fillForm67812026OrdinaryCandidate(rawInput: TaxYearInput, sources: unknown, template: Uint8Array) {
  const bytes = Uint8Array.from(template);
  const sourceHash = createHash("sha256").update(bytes).digest("hex");
  if (sourceHash !== FORM_6781_2026_CANDIDATE.sha256) throw new Error("Unreviewed Form 6781 template revision.");
  const input = TaxYearInputSchema.safeParse(rawInput);
  if (!input.success) throw new Error("Form 6781 review requires a valid current federal input.");
  const { rows, gains, losses, calculationInput } = readForm6781ReviewOriginals(input.data, sources);
  const result = calculateForm6781(calculationInput);

  const document = await loadPdfDocumentQuietly(bytes);
  removeTrustedTemplateLegacyFormData(document);
  const form = document.getForm();
  const font = form.getDefaultFont();
  const setText = (suffix: string, value: string) => {
    const field = form.getTextField(page + suffix);
    const [widget] = field.acroField.getWidgets();
    const inset = 1 + (widget.getBorderStyle()?.getWidth() ?? 0);
    let width: number;
    try { width = font.widthOfTextAtSize(value, nativeSize); }
    catch { throw new Error("Form 6781 review contains text that cannot render in a native field."); }
    if (width + 2 * inset > widget.getRectangle().width) {
      throw new Error("Form 6781 review values must fit at the native text size.");
    }
    field.setFontSize(nativeSize);
    field.setText(value);
  };
  const { firstName, lastName } = input.data.taxpayer.primary;
  setText("f1_1[0]", `${firstName} ${lastName}`);
  for (const [index, row] of rows.entries()) {
    const prefix = `Table_Line1[0].Row${index + 1}[0].f1_`;
    const rowFirstField = 3 + index * 3;
    setText(`${prefix}${rowFirstField}[0]`, `Form 1099-B ${row.broker}`);
    const column = row.amount.lt(0) ? 1 : 2;
    setText(`${prefix}${rowFirstField + column}[0]`, row.amount.abs().toFixed(2));
  }
  const summary = [
    [12, losses.toFixed(2)], [13, gains.toFixed(2)], [14, signedAmount(result.line3)],
    [16, signedAmount(result.line5)], [18, signedAmount(result.line7)],
    [19, signedAmount(result.line8)], [20, signedAmount(result.line9)],
  ] as const;
  for (const [number, value] of summary) setText(`f1_${number}[0]`, value);
  if (result.line5.lte(0)) setText("f1_17[0]", "-0-");
  form.updateFieldAppearances(font);
  await markReviewPdf(document);

  return { document, scheduleDLine4: result.scheduleDShortTerm, scheduleDLine11: result.scheduleDLongTerm };
}
