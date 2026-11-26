/** Disabled Form 4137 review candidate. Spec: spec/federal/form-4137-2026-template.yaml. */
import { createHash } from "node:crypto";
import { calculateUnreportedTipPayroll } from "@/engine/forms/unreported-tip-payroll.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
import { d, min, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";
import { markReviewPdf } from "../../export-policy.js";
import { loadPdfDocumentQuietly } from "../../pdf-utils.js";
import { removeTrustedTemplateLegacyFormData } from "../../trusted-review-template-cleanup.js";

const page1 = "topmostSubform[0].Page1[0].";
const employerLimit = 5;
const nativeSize = 9;

export const FORM_4137_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  sourceUrl: "https://www.irs.gov/pub/irs-pdf/f4137.pdf",
  annualSourceUrl: "https://www.irs.gov/pub/irs-prior/f4137--2026.pdf",
  catalogUrl: "https://www.irs.gov/downloads/irs-pdf",
  sourceRevision: "Created 4/30/26",
  postedDate: "2026-11-24",
  retrievedAt: "2026-11-24T21:51:40Z",
  byteLength: 84583,
  sha256: "9bd93a180bb4e438fc7fa6c0f912f696e14f40d3e8fb62e5749b8c925900980a",
  wageBase: "184500",
  reviewStatus: "independent-review-pending",
  exportsEnabled: false,
  filingQualified: false,
  nativeTextFields: Object.freeze(Array.from({ length: 34 }, (_, index) => {
    const employer = index >= 2 && index < 22 ? `Table_Line1[0].BodyRow${1 + Math.floor((index - 2) / 4)}[0].` : "";
    return `${page1}${employer}f1_${index + 1}[0]`;
  })),
});

const isActualZero = (value: string | undefined) => value !== undefined && d(value).isZero();

function federalPayrollKey(w2: TaxYearInput["w2s"][number]) {
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  const ein = normalize(w2.employer.ein).replaceAll("-", "");
  const employer = ein === "applied for" ? [ein, normalize(w2.employer.name)] : [ein];
  return JSON.stringify([...employer, ...[w2.socialSecurityWages, w2.socialSecurityTips, w2.allocatedTips].map(value => d(value).toFixed())]);
}

/** Render a redacted internal worksheet from one verified recipient's payroll originals. */
export async function fillForm4137_2026OrdinaryCandidate(rawInput: TaxYearInput, allCurrentPayrollIncluded: boolean, template: Uint8Array) {
  const candidate = FORM_4137_2026_CANDIDATE;
  const bytes = Uint8Array.from(template);
  if (createHash("sha256").update(bytes).digest("hex") !== candidate.sha256) {
    throw new Error("Unreviewed Form 4137 template revision.");
  }
  const parsed = TaxYearInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error("Form 4137 review requires valid original facts.");
  if (allCurrentPayrollIncluded !== true) throw new Error("Form 4137 review requires a complete payroll inventory.");
  const input = parsed.data;
  const record = input.form4137;
  const facts = record?.sourceFacts;
  const employers = facts?.employers;
  if (input.taxpayer.taxYear !== candidate.taxYear || input.taxpayer.filingStatus !== "single" || input.taxpayer.spouse
    || input.standardDeductionFacts?.shortTaxYear !== false || input.standardDeductionFacts?.nonresidentAlien !== false
    || input.standardDeductionFacts?.dualStatusAlien !== false || input.form4137ByOwner || input.form8919 || input.rrtaPayrollSources
    || record?.accountHolder !== "primary" || !facts || !employers?.length || employers.length > employerLimit
    || !isActualZero(facts.railroadRetirementCompensation) || facts.noncashTipsNotIncludedInWages === undefined
    || employers.some(row => !row.w2SourceIds?.length || !isActualZero(row.medicareOnlyGovernmentUnreportedTips))) {
    throw new Error("Form 4137 review requires ordinary single-recipient 2026 tip and payroll originals.");
  }
  if (input.w2s.some(w2 => w2.taxYear !== candidate.taxYear || w2.accountHolder !== "primary"
    || w2.socialSecurityWages === undefined || w2.socialSecurityTips === undefined || w2.allocatedTips === undefined)) {
    throw new Error("Form 4137 review requires current same-owner W-2s with known Boxes 3, 7 and 8.");
  }
  if (new Set(input.w2s.map(federalPayrollKey)).size !== input.w2s.length) {
    throw new Error("Form 4137 review holds duplicate federal payroll records until the originals are resolved.");
  }
  if (input.w2s.some(w2 => d(w2.socialSecurityWages).plus(d(w2.socialSecurityTips)).gt(candidate.wageBase))) {
    throw new Error("Form 4137 review requires each W-2's Boxes 3 and 7 to stay within the 2026 wage base.");
  }
  const linkedW2s = new Set(employers.flatMap(row => row.w2SourceIds ?? []));
  if (input.w2s.some((w2, index) => d(w2.allocatedTips).gt(0) && !linkedW2s.has(`formW2:${index}`))) {
    throw new Error("Form 4137 review requires an employer row for all W-2 allocated tips.");
  }

  const constants = FEDERAL_2026_CONSTANTS;
  const { singular: result } = calculateUnreportedTipPayroll(input, constants);
  if (!result?.sourceFactsVerified || !result.employers || result.line2 === undefined || result.line3 === undefined
    || result.line4 === undefined || result.line5 === undefined || !result.line7?.eq(candidate.wageBase)
    || !result.line6.gt(0)) {
    throw new Error("Form 4137 review requires positive Medicare-taxable tips from reconciled 2026 originals.");
  }
  const payrollRecords = new Map(input.w2s.map((w2, index) => [`formW2:${index}`, w2]));
  for (const employer of result.employers) {
    const knownCashTips = employer.w2SourceIds.flatMap(id => {
      const amount = payrollRecords.get(id)?.box12CodeTP;
      return amount === undefined ? [] : [d(amount)];
    });
    const observed = sum(...knownCashTips);
    if (observed.gt(employer.tipsReportedToEmployer)
      || (knownCashTips.length === employer.w2SourceIds.length && !observed.eq(employer.tipsReportedToEmployer))) {
      throw new Error("Form 4137 review requires employer reports that reconcile to current W-2 code TP.");
    }
  }
  const rows = result.employers.map(row => ({
    received: roundDollar(row.cashAndChargeTipsReceived),
    reported: roundDollar(row.tipsReportedToEmployer),
  }));
  const [line2, line3, line4, line5, line6, line8, line9, line10, line11, line12, line13] = [
    result.line2, result.line3, result.line4, result.line5, result.line6, result.line8,
    result.line9, result.line10, result.line11, result.line12, result.line13,
  ].map(roundDollar);
  if (!sum(...rows.map(row => row.received)).eq(line2) || !sum(...rows.map(row => row.reported)).eq(line3)
    || !line2.minus(line3).eq(line4) || !line4.minus(line5).eq(line6)
    || !zeroFloor(result.line7.minus(line8)).eq(line9) || !min(line6, line9).eq(line10)
    || !roundDollar(line10.times(constants.selfEmploymentTax.socialSecurityRate.div(2))).eq(line11)
    || !roundDollar(line6.times(constants.selfEmploymentTax.medicareRate.div(2))).eq(line12)
    || !line11.plus(line12).eq(line13)) {
    throw new Error("Form 4137 displayed amounts must reconcile to their rounded totals.");
  }

  const document = await loadPdfDocumentQuietly(bytes);
  removeTrustedTemplateLegacyFormData(document);
  const form = document.getForm();
  const font = form.getDefaultFont();
  const setText = (index: number, value: string) => {
    const field = form.getTextField(candidate.nativeTextFields[index - 1]);
    const [widget] = field.acroField.getWidgets();
    const inset = 1 + (widget.getBorderStyle()?.getWidth() ?? 0);
    if (font.widthOfTextAtSize(value, nativeSize) + 2 * inset > widget.getRectangle().width) {
      throw new Error("Form 4137 review values must fit at the native text size.");
    }
    field.setFontSize(nativeSize);
    field.setText(value);
  };
  for (const [index, row] of rows.entries()) {
    setText(3 + index * 4, `Employer ${index + 1}`);
    setText(5 + index * 4, row.received.toFixed());
    setText(6 + index * 4, row.reported.toFixed());
  }
  for (const [field, value] of [
    [23, line2], [24, line3], [25, line4], [26, line5], [27, line6], [29, line8],
    [30, line9], [31, line10], [32, line11], [33, line12], [34, line13],
  ] as const) {
    setText(field, value.toFixed());
  }
  form.updateFieldAppearances(font);
  await markReviewPdf(document);
  return document;
}
