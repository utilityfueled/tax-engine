/**
 * Final 2026 schedule-r physical field candidate.
 * Spec: spec/federal/schedule-r-2026-template.yaml.
 * This immutable source map is absent from all public exports and registries.
 * The isolated worksheet proof does not grant public review or filing readiness.
 */
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { calculateScheduleR } from "@/engine/forms/schedule-r.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { d } from "@/utils/decimal.js";
import { markReviewPdf } from "../../export-policy.js";

export const SCHEDULE_R_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-pdf/f1040sr.pdf",
  sourceRevision: "Created 4/21/26",
  retrievedAt: "2026-11-01",
  sha256: "945275e6be3cc7353a3faf165ddd7ccb79e3c8a43abe6678d4c47f8207594cb5",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  line14Source: "Form 1040 line 11b",
  fields: Object.freeze({
    name: "topmostSubform[0].Page1[0].f1_1[0]",
    ssn: "topmostSubform[0].Page1[0].f1_2[0]",
    box1: "topmostSubform[0].Page1[0].c1_1[0]",
    box2: "topmostSubform[0].Page1[0].c1_1[1]",
    box3: "topmostSubform[0].Page1[0].Married[0].c1_1[0]",
    box4: "topmostSubform[0].Page1[0].Married[0].c1_1[1]",
    box5: "topmostSubform[0].Page1[0].Married[0].c1_1[2]",
    box6: "topmostSubform[0].Page1[0].Married[0].c1_1[3]",
    box7: "topmostSubform[0].Page1[0].Married[0].c1_1[4]",
    box8: "topmostSubform[0].Page1[0].MarriedSeparate[0].c1_1[0]",
    box9: "topmostSubform[0].Page1[0].MarriedSeparate[0].c1_1[1]",
    priorPhysicianStatement: "topmostSubform[0].Page1[0].c1_2[0]",
    line10: "topmostSubform[0].Page2[0].f2_1[0]",
    line11: "topmostSubform[0].Page2[0].f2_2[0]",
    line12: "topmostSubform[0].Page2[0].f2_3[0]",
    line13a: "topmostSubform[0].Page2[0].f2_4[0]",
    line13b: "topmostSubform[0].Page2[0].f2_5[0]",
    line13c: "topmostSubform[0].Page2[0].f2_6[0]",
    line14Agi: "topmostSubform[0].Page2[0].f2_7[0]",
    line15: "topmostSubform[0].Page2[0].f2_8[0]",
    line16: "topmostSubform[0].Page2[0].f2_9[0]",
    line17: "topmostSubform[0].Page2[0].f2_10[0]",
    line18: "topmostSubform[0].Page2[0].f2_11[0]",
    line19: "topmostSubform[0].Page2[0].f2_12[0]",
    line20: "topmostSubform[0].Page2[0].f2_13[0]",
    line21: "topmostSubform[0].Page2[0].f2_14[0]",
    line22: "topmostSubform[0].Page2[0].f2_15[0]",
  }),
});

const wholeDollars = z.string().regex(/^(?:0|[1-9]\d{0,11})$/u);
const sourceReference = z.string().trim().min(1);

const reviewSourcesSchema = z.strictObject({
  taxYear: z.literal(2026),
  filingStatus: z.literal("single"),
  dateOfBirth: z.iso.date(),
  retirementDate: z.iso.date(),
  citizenshipOrResidentAlienStatusConfirmed: z.literal(true),
  retiredPermanentlyAndTotallyDisabledConfirmed: z.literal(true),
  notReachedMandatoryRetirementAgeOnJanuary1Confirmed: z.literal(true),
  actualEmployerDisabilityPayInLieuOfWagesBeforeMandatoryRetirementAgeConfirmed: z.literal(true),
  permanentlyAndTotallyDisabledDuring2026Confirmed: z.literal(true),
  unableToEngageInSubstantialGainfulActivityDuring2026Confirmed: z.literal(true),
  priorPhysicianStatement: z.strictObject({
    sourceYear: z.number().int().min(1984).max(2025),
    signedDate: z.iso.date(),
    signedLineBConfirmed: z.literal(true),
    obtainedAndRetainedConfirmed: z.literal(true),
    sameClaimantConfirmed: z.literal(true),
    sourceReference,
  }),
  incomeWorksheet: z.strictObject({
    sourceReference,
    taxableDisabilityIncome: wholeDollars,
  }),
  returnWorksheet: z.strictObject({
    sourceReference,
    sameReturnAndIncomeOwnerConfirmed: z.literal(true),
    allApplicableNontaxableBenefitsConfirmed: z.literal(true),
    actualCreditLimitWorksheetConfirmed: z.literal(true),
    scheduleRLine13aBenefits: wholeDollars,
    scheduleRLine13bBenefits: wholeDollars,
    form1040Line11b: wholeDollars,
    form1040Line18: wholeDollars,
    schedule3Line1: wholeDollars,
    schedule3Line2: wholeDollars,
    schedule3Line6l: wholeDollars,
  }),
});

const printedAmountLines = ["10", "11", "12", "13a", "13b", "13c", "14", "15", "16", "17", "18", "19", "20", "21", "22"] as const;

/** Render the supported source-confirmed worksheet for private review only. */
export async function renderPrivateScheduleR2026Review(rawSources: unknown, blank: Uint8Array): Promise<Uint8Array> {
  const source = reviewSourcesSchema.safeParse(rawSources);
  if (!source.success) throw new Error("Schedule R requires confirmed 2026 Box 2 and Part II sources");
  const { dateOfBirth, retirementDate, incomeWorksheet, returnWorksheet, priorPhysicianStatement } = source.data;
  if (dateOfBirth <= "1962-01-01" || retirementDate <= dateOfBirth || retirementDate > "2026-12-31" ||
    !d(incomeWorksheet.taxableDisabilityIncome).gt(0)) {
    throw new Error("Schedule R requires an under-65 disability retirement and positive qualifying income");
  }
  const { signedDate, sourceYear } = priorPhysicianStatement;
  if (signedDate < retirementDate || signedDate > "2025-12-31" || signedDate.slice(0, 4) !== String(sourceYear)) {
    throw new Error("Schedule R requires a prior Line B signature dated in its stated year and on or after disability retirement");
  }
  if (createHash("sha256").update(blank).digest("hex") !== SCHEDULE_R_2026_CANDIDATE.sha256) {
    throw new Error("Unreviewed Schedule R 2026 template revision");
  }

  const result = calculateScheduleR({
    taxYear: source.data.taxYear,
    filingStatus: source.data.filingStatus,
    constants: FEDERAL_2026_CONSTANTS.elderlyOrDisabledCredit,
    agi: d(returnWorksheet.form1040Line11b),
    nontaxableSocialSecurity: d(returnWorksheet.scheduleRLine13aBenefits),
    scheduleRInput: {
      primaryQualifies: true,
      primaryAge65OrOlder: false,
      primaryDisabilityIncome: incomeWorksheet.taxableDisabilityIncome,
      spouseDisabilityIncome: "0",
      nontaxablePensionsAnnuities: returnWorksheet.scheduleRLine13bBenefits,
    },
    creditLimitWorksheet: {
      taxBeforeCredits: d(returnWorksheet.form1040Line18),
      foreignTaxCredit: d(returnWorksheet.schedule3Line1),
      dependentCareCredit: d(returnWorksheet.schedule3Line2),
      schedule3Line6l: d(returnWorksheet.schedule3Line6l),
    },
  });
  if (result.box !== 2 || !result.allowedCredit?.gt(0)) {
    throw new Error("Schedule R review requires a positive allowed Box 2 credit");
  }

  const pdf = await PDFDocument.load(blank);
  const form = pdf.getForm();
  const fields = SCHEDULE_R_2026_CANDIDATE.fields;
  form.getCheckBox(fields.box2).check();
  form.getCheckBox(fields.priorPhysicianStatement).check();
  for (const line of printedAmountLines) {
    const amount = result.lines.find(row => row.form === "Sched R" && row.line === line)?.value;
    if (!amount?.isInteger()) throw new Error(`Schedule R line ${line} requires a whole-dollar calculated value`);
    const field: keyof typeof fields = line === "14" ? "line14Agi" : `line${line}`;
    form.getTextField(fields[field]).setText(amount.toFixed(0));
  }
  await markReviewPdf(pdf);
  return pdf.save();
}
