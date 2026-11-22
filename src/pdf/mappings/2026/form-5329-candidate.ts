/** Disabled final 2026 Form 5329 physical candidate. Spec: spec/federal/form-5329-2026-template.yaml. */
import { createHash } from "node:crypto";
import type Decimal from "decimal.js";
import type { PDFDocument } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";
import { markReviewPdf } from "../../export-policy.js";
import { loadPdfDocumentQuietly } from "../../pdf-utils.js";
import { removeTrustedTemplateLegacyFormData } from "../../trusted-review-template-cleanup.js";

const page1 = "topmostSubform[0].Page1[0].";
const page2 = "topmostSubform[0].Page2[0].";
const page3 = "topmostSubform[0].Page3[0].";

export const FORM_5329_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-prior/f5329--2026.pdf",
  sourceRevision: "Created 11/12/26",
  retrievedAt: "2026-11-19T05:11:10Z",
  sha256: "ebc438f7a940285815d43980a59c6cd5fed3ac76c4aab0e85ce0895df53fca2e",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  printedReferences: Object.freeze({
    schedule2Line5From: Object.freeze(["4", "8", "63"]),
    schedule2Line18From: Object.freeze(["17", "25", "33", "41", "49", "51", "55", "61"]),
    line55OtherDestination: "Form 1041, Schedule G, line 8",
    line62From: "Form 1099-R, box 7d",
  }),
  fields: Object.freeze({
    // Filer and standalone address
    name: page1 + "f1_1[0]",
    ssn: page1 + "f1_2[0]",
    streetAddress: page1 + "f1_3[0]",
    apartmentNumber: page1 + "f1_4[0]",
    amendedReturn: page1 + "c1_1[0]",
    city: page1 + "f1_5[0]",
    state: page1 + "f1_6[0]",
    zip: page1 + "f1_7[0]",
    foreignCountry: page1 + "f1_8[0]",
    foreignProvince: page1 + "f1_9[0]",
    foreignPostalCode: page1 + "f1_10[0]",

    // Parts I–IV
    line1: page1 + "f1_11[0]",
    line2ExceptionNumber: page1 + "f1_12[0]",
    line2: page1 + "f1_13[0]",
    line3: page1 + "f1_14[0]",
    line4: page1 + "f1_15[0]",
    line5: page1 + "f1_16[0]",
    line6: page1 + "f1_17[0]",
    line7: page1 + "f1_18[0]",
    line8: page1 + "f1_19[0]",
    line9: page1 + "f1_20[0]",
    line10: page1 + "f1_21[0]",
    line11: page1 + "f1_22[0]",
    line12: page1 + "f1_23[0]",
    line13: page1 + "f1_24[0]",
    line14: page1 + "f1_25[0]",
    line15: page1 + "f1_26[0]",
    line16: page1 + "f1_27[0]",
    line17: page1 + "f1_28[0]",
    line18: page1 + "f1_29[0]",
    line19: page1 + "f1_30[0]",
    line20: page1 + "f1_31[0]",
    line21: page1 + "f1_32[0]",
    line22: page1 + "f1_33[0]",
    line23: page1 + "f1_34[0]",
    line24: page1 + "f1_35[0]",
    line25: page1 + "f1_36[0]",

    // Parts V–VIII
    line26: page2 + "f2_1[0]",
    line27: page2 + "f2_2[0]",
    line28: page2 + "f2_3[0]",
    line29: page2 + "f2_4[0]",
    line30: page2 + "f2_5[0]",
    line31: page2 + "f2_6[0]",
    line32: page2 + "f2_7[0]",
    line33: page2 + "f2_8[0]",
    line34: page2 + "f2_9[0]",
    line35: page2 + "f2_10[0]",
    line36: page2 + "f2_11[0]",
    line37: page2 + "f2_12[0]",
    line38: page2 + "f2_13[0]",
    line39: page2 + "f2_14[0]",
    line40: page2 + "f2_15[0]",
    line41: page2 + "f2_16[0]",
    line42: page2 + "f2_17[0]",
    line43: page2 + "f2_18[0]",
    line44: page2 + "f2_19[0]",
    line45: page2 + "f2_20[0]",
    line46: page2 + "f2_21[0]",
    line47: page2 + "f2_22[0]",
    line48: page2 + "f2_23[0]",
    line49: page2 + "f2_24[0]",
    line50: page2 + "f2_25[0]",
    line51: page2 + "f2_26[0]",

    // Parts IX–XI
    line52a: page3 + "f3_1[0]",
    line52b: page3 + "f3_2[0]",
    line53a: page3 + "f3_3[0]",
    line53b: page3 + "f3_4[0]",
    line54a: page3 + "f3_5[0]",
    line54b: page3 + "f3_6[0]",
    line55: page3 + "f3_7[0]",
    line56: page3 + "f3_8[0]",
    line57: page3 + "f3_9[0]",
    line58: page3 + "f3_10[0]",
    line59: page3 + "f3_11[0]",
    line60: page3 + "f3_12[0]",
    line61: page3 + "f3_13[0]",
    line62: page3 + "f3_14[0]",
    line63: page3 + "f3_15[0]",

    // Standalone paid preparer fields
    preparerName: page3 + "f3_16[0]",
    preparerSelfEmployed: page3 + "c3_1[0]",
    preparerPtin: page3 + "f3_17[0]",
    preparerFirmName: page3 + "f3_18[0]",
    preparerFirmAddress: page3 + "f3_19[0]",
    preparerFirmEin: page3 + "f3_20[0]",
    preparerPhone: page3 + "f3_21[0]",
  }),
});

/** Render an internal Part I review. The returned amount is only the printed transfer from line 4. */
export async function fillForm53292026FirstHomeCandidate(
  rawInput: TaxYearInput,
  blank: Uint8Array,
): Promise<{ document: PDFDocument; schedule2Line5Transfer: Decimal }> {
  const candidate = FORM_5329_2026_CANDIDATE;
  if (rawInput.taxpayer.taxYear !== candidate.taxYear || rawInput.form5329FirstHomeSource?.sourceTaxYear !== candidate.taxYear) {
    throw new Error("Form 5329 candidate requires a 2026 return and documented first-home source.");
  }
  const rawOriginal = rawInput.form1099R?.[0];
  if (rawInput.taxpayer.filingStatus !== "single" || rawInput.taxpayer.spouse
    || rawInput.form1099R?.length !== 1 || rawOriginal?.accountHolder !== "primary") {
    throw new Error("Form 5329 first-home candidate requires one distribution for a single primary filer.");
  }
  const input = TaxYearInputSchema.parse(rawInput);
  const source = input.form5329FirstHomeSource!;
  const original = input.form1099R![0]!;
  if (source.maritalStatusAtAcquisition !== "unmarried" || source.qualifiedPayment.kind !== "purchase_price"
    || !/^\d{9}$/.test(original.payerTin?.replaceAll("-", "") ?? "")) {
    throw new Error("Form 5329 first-home candidate requires the actual payer and ordinary completed purchase.");
  }
  if (rawOriginal.employeeContributions === undefined || !d(original.employeeContributions).isZero()) {
    throw new Error("Form 5329 first-home candidate requires confirmed zero Box 5.");
  }
  if (original.trumpAccount !== false || original.excessContributionEarnings === undefined
    || !d(original.excessContributionEarnings).isZero()) {
    throw new Error("Form 5329 first-home candidate requires an unchecked Trump account and zero Box 7d.");
  }
  if (input.form5329) {
    throw new Error("Form 5329 first-home candidate holds manual Form 5329 inputs.");
  }
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const reviewDate = `${today.getFullYear()}-${month}-${day}`;
  if ([source.distributionReceivedDate, source.bindingContractDate, source.qualifiedPayment.date]
    .some(date => date > reviewDate)) {
    throw new Error("The IRA receipt, contract and purchase payment must have occurred on or before the review date.");
  }
  if (createHash("sha256").update(blank).digest("hex") !== candidate.sha256) {
    throw new Error("Unreviewed Form 5329 candidate template revision.");
  }

  const result = calculateFederalTax(input);
  const part = result.form5329;
  const retirementTax = result.schedule2?.lines.find(row => row.line === "8")?.value;
  if (!part || part.line2ExceptionNumber !== "09" || !part.line2.gt(0)
    || !result.iraDistributionsTaxable.eq(part.line1) || !retirementTax?.eq(part.line4)
    || result.form5329HsaByOwner !== undefined
    || part.lines.some(row => !["1", "2", "3", "4"].includes(row.line) && !row.value.isZero())) {
    throw new Error("Form 5329 first-home candidate requires a reconciled Part I and no other Form 5329 parts or transfers.");
  }
  const amounts = { line1: part.line1, line2: part.line2, line3: part.line3, line4: part.line4 } as const;
  if (Object.values(amounts).some(amount => !amount.isInteger() || amount.isNegative())) {
    throw new Error("Form 5329 first-home candidate requires exact whole dollar Part I amounts.");
  }

  const document = await loadPdfDocumentQuietly(blank);
  removeTrustedTemplateLegacyFormData(document);
  const form = document.getForm();
  const { fields } = candidate;
  const { firstName, lastName } = input.taxpayer.primary;
  form.getTextField(fields.name).setText(`${firstName} ${lastName}`);
  form.getTextField(fields.line2ExceptionNumber).setText(part.line2ExceptionNumber);
  for (const key of Object.keys(amounts) as Array<keyof typeof amounts>) {
    form.getTextField(fields[key]).setText(amounts[key].toFixed(0));
  }
  form.updateFieldAppearances();
  await markReviewPdf(document);
  return { document, schedule2Line5Transfer: part.line4 };
}
