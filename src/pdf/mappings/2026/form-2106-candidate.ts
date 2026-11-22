/** Disabled final 2026 Form 2106 physical candidate. Spec: spec/federal/form-2106-2026-template.yaml. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { TaxYearInput } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";
import { markReviewPdf } from "../../export-policy.js";
import { loadPdfDocumentQuietly } from "../../pdf-utils.js";
import { removeTrustedTemplateLegacyFormData } from "../../trusted-review-template-cleanup.js";

const page1 = "topmostSubform[0].Page1[0].";
const unicodeNameFont = new URL("../../../../forms/blank/_fonts/NotoSans-Regular.ttf", import.meta.url);

export const FORM_2106_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  sourceUrl: "https://www.irs.gov/pub/irs-pdf/f2106.pdf",
  annualSourceUrl: "https://www.irs.gov/pub/irs-prior/f2106--2026.pdf",
  sourceRevision: "Created 8/18/26",
  postedDate: "2026-11-20",
  retrievedAt: "2026-11-20T18:56:43Z",
  sha256: "794f7d7f84fd3a878e18751622949403d8499474c807fb05b3ee2e0bd811bc1b",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  fields: Object.freeze({
    name: page1 + "f1_01[0]",
    occupation: page1 + "f1_02[0]",
    lodging: page1 + "Table_Step1[0].Line3[0].f1_10[0]",
    totalExpenses: page1 + "Table_Step1[0].Line6[0].f1_17[0]",
    netExpenses: page1 + "Table_Step3[0].Line8[0].f1_21[0]",
    deductibleExpenses: page1 + "Table_Step3[0].Line9[0].f1_23[0]",
    deduction: page1 + "f1_25[0]", // Line 10
  }),
});

const requiredText = z.string().trim().min(1);
const recordOwner = z.strictObject({ accountHolder: z.literal("primary"), firstName: requiredText, lastName: requiredText });
const originalLodgingCase = z.strictObject({
  duty: z.strictObject({
    taxYear: z.literal(2026),
    owner: recordOwner,
    reserveComponent: z.enum([
      "Army Reserve", "Navy Reserve", "Marine Corps Reserve", "Air Force Reserve", "Coast Guard Reserve",
      "Army National Guard of the United States", "Air National Guard of the United States", "Reserve Corps of the Public Health Service",
    ]),
    orderReference: requiredText,
    performanceReference: requiredText,
    taxHome: z.strictObject({ city: requiredText, state: z.string().regex(/^[A-Z]{2}$/) }),
    taxHomeAndDistanceReference: requiredText,
    distanceFromTaxHomeMiles: z.number().nonnegative(),
    city: requiredText,
    state: requiredText,
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    officialDutyPerformedConfirmed: z.literal(true),
    overnightTravelRequiredConfirmed: z.literal(true),
    noOtherTripsExpensesOrDuplicateClaimsConfirmed: z.literal(true),
    noPaymentOrReimbursementAvailableConfirmed: z.literal(true),
    reimbursementReference: requiredText,
  }),
  lodging: z.strictObject({
    taxYear: z.literal(2026),
    owner: recordOwner,
    provider: requiredText,
    receiptReference: requiredText,
    city: requiredText,
    state: requiredText,
    checkInDate: z.iso.date(),
    checkOutDate: z.iso.date(),
    paidDate: z.iso.date(),
    roomAmountPaid: z.string().regex(/^\d{1,3}(?:\.0{1,2})?$/),
    taxpayerPaidItemizedRoomOnlyConfirmed: z.literal(true),
  }),
});

/** Project an original-backed overnight lodging expense on the internal review copy. */
export async function fillForm2106ReservistReviewCandidate(input: TaxYearInput, sources: unknown, template: Uint8Array) {
  const { taxYear, sha256, fields } = FORM_2106_2026_CANDIDATE;
  const { taxpayer } = input;
  if (taxpayer.taxYear !== taxYear || taxpayer.filingStatus !== "single" || taxpayer.spouse) {
    throw new Error("Form 2106 lodging review requires a 2026 single return for the primary taxpayer.");
  }

  const evidence = originalLodgingCase.safeParse(sources);
  if (!evidence.success) throw new Error("Form 2106 requires complete original 2026 primary reservist duty and paid lodging records.");

  const { duty, lodging } = evidence.data;
  const firstName = taxpayer.primary.firstName.trim();
  const lastName = taxpayer.primary.lastName.trim();
  if ([duty.owner, lodging.owner].some(owner => owner.firstName.toLowerCase() !== firstName.toLowerCase()
    || owner.lastName.toLowerCase() !== lastName.toLowerCase())) {
    throw new Error("Form 2106 duty and paid lodging records must identify the same primary taxpayer as the return.");
  }
  if (duty.distanceFromTaxHomeMiles <= 100 || (duty.taxHome.city.toLowerCase() === "abilene" && duty.taxHome.state === "TX")) {
    throw new Error("Form 2106 official duty travel must be substantiated as more than 100 miles from the tax home.");
  }
  const oneNight = Date.parse(duty.endDate) - Date.parse(duty.startDate) === 86_400_000;
  if (!oneNight || !duty.startDate.startsWith("2026-01-") || !duty.endDate.startsWith("2026-01-")
    || lodging.checkInDate !== duty.startDate || lodging.checkOutDate !== duty.endDate || lodging.paidDate !== lodging.checkOutDate
    || [duty, lodging].some(location => location.city.toLowerCase() !== "abilene" || location.state !== "TX")) {
    throw new Error("Form 2106 lodging review requires one matching January 2026 duty night and paid receipt in Abilene, TX.");
  }

  // GSA FY 2026 Abilene daily lodging rate, excluding taxes. The scoped receipt contains only the room charge.
  const nightlyLodgingCeiling = d("110");
  const lodgingPaid = d(lodging.roomAmountPaid);
  if (!lodgingPaid.gt(0) || lodgingPaid.gt(nightlyLodgingCeiling)) {
    throw new Error("Form 2106 requires a positive whole-dollar lodging cost within the $110 nightly lodging ceiling.");
  }
  // Schedule 1 line 12 reads this manual adjustment directly. The annual calculation gate still applies.
  const schedule1Line12 = d(input.adjustments?.businessExpenseAdjustments);
  if (!schedule1Line12.eq(lodgingPaid)) {
    throw new Error("Form 2106 original lodging must exactly reconcile to the ordinary Schedule 1 line 12 amount.");
  }
  if (createHash("sha256").update(template).digest("hex") !== sha256) {
    throw new Error("Unreviewed Form 2106 template revision.");
  }

  const document = await loadPdfDocumentQuietly(template);
  removeTrustedTemplateLegacyFormData(document);
  const form = document.getForm();
  const nameField = form.getTextField(fields.name);
  const fullName = `${firstName} ${lastName}`;
  const nameCodePoints = Array.from(fullName, character => character.codePointAt(0) ?? 0);
  let nameFont = form.getDefaultFont();
  let availableGlyphs = new Set(nameFont.getCharacterSet());
  if (!nameCodePoints.every(codePoint => availableGlyphs.has(codePoint))) {
    const [{ create }, fontBytes] = await Promise.all([import("fontkit"), readFile(unicodeNameFont)]);
    type EmbeddedFont = ReturnType<Parameters<typeof document.registerFontkit>[0]["create"]>;
    document.registerFontkit({
      // PDF-LIB types describe the older fontkit interfaces. The full-font
      // embedder uses the layout and metrics present in this pinned release.
      create: (bytes, name) => create(Buffer.from(bytes), name) as unknown as EmbeddedFont,
    });
    nameFont = await document.embedFont(fontBytes);
    availableGlyphs = new Set(nameFont.getCharacterSet());
    if (!nameCodePoints.every(codePoint => availableGlyphs.has(codePoint))) {
      throw new Error("Form 2106 taxpayer name contains characters the review PDF cannot render exactly.");
    }
  }
  const [nameWidget] = nameField.acroField.getWidgets();
  const inset = 1 + (nameWidget.getBorderStyle()?.getWidth() ?? 0);
  if (nameFont.widthOfTextAtSize(fullName, 9) + 2 * inset > nameWidget.getRectangle().width) {
    throw new Error("Form 2106 taxpayer name must fit the native field at readable size.");
  }
  nameField.setFontSize(9);
  nameField.setText(fullName);
  nameField.updateAppearances(nameFont);
  form.getTextField(fields.occupation).setText("Armed Forces reservist");
  // The case has neither meals nor other expenses or reimbursements, so each completed amount equals line 3.
  for (const field of [fields.lodging, fields.totalExpenses, fields.netExpenses, fields.deductibleExpenses, fields.deduction]) {
    form.getTextField(field).setText(lodgingPaid.toFixed(0));
  }
  await markReviewPdf(document);
  return { document, schedule1Line12 };
}
