/** Disabled final 2026 Form 7206 physical candidate. Spec: spec/federal/form-7206-2026-template.yaml. */
import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { calculateForm7206Return } from "@/engine/forms/form-7206-return.js";
import { calculateScheduleC } from "@/engine/schedules/schedule-c.js";
import { calculateScheduleF } from "@/engine/schedules/schedule-f.js";
import { calculateScheduleSE } from "@/engine/schedules/schedule-se.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";
import { markReviewPdf } from "../../export-policy.js";
import { loadPdfDocumentQuietly } from "../../pdf-utils.js";
import { removeTrustedTemplateLegacyFormData } from "../../trusted-review-template-cleanup.js";

const page1 = "topmostSubform[0].Page1[0].";

export const FORM_7206_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-pdf/f7206.pdf",
  sourceRevision: "Created 4/15/26",
  retrievedAt: "2026-11-20T10:58:54Z",
  sha256: "863c82bd31b674d693653546a6479c34b8fa0b2e8a2a97a7a11d0d4f5030c9bb",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  printedReferences: Object.freeze({
    line4OptionalMethodFrom: "Schedule SE (Form 1040), Part I, line 4b",
    line5From: Object.freeze(["Schedule C (Form 1040), line 31", "Schedule F (Form 1040), line 34", "Schedule K-1 (Form 1065), box 14, code A"]),
    line7From: "Schedule 1 (Form 1040), line 15",
    line9From: "Schedule 1 (Form 1040), line 16",
    line11From: "Form W-2, box 5",
    line12From: "Form 2555, line 45",
    line14To: "Schedule 1 (Form 1040), line 17",
  }),
  fields: Object.freeze({
    name: page1 + "f1_1[0]",
    taxpayerId: page1 + "f1_2[0]",
    line1: page1 + "f1_3[0]",
    line2: page1 + "f1_4[0]",
    line3: page1 + "f1_5[0]",
    line4: page1 + "f1_6[0]",
    line5: page1 + "f1_7[0]",
    line6: page1 + "f1_8[0]",
    line7: page1 + "f1_9[0]",
    line8: page1 + "f1_10[0]",
    line9: page1 + "f1_11[0]",
    line10: page1 + "f1_12[0]",
    line11: page1 + "f1_13[0]",
    line12: page1 + "f1_14[0]",
    line13: page1 + "f1_15[0]",
    line14: page1 + "f1_16[0]",
  }),
});

interface OriginalBusinessProfit {
  taxYear: number;
  accountHolder: "primary" | "spouse";
  netProfit: string;
  reference: string;
}

interface OrdinaryForm7206ReviewSources {
  confirmed: boolean;
  scheduleC: OriginalBusinessProfit;
  scheduleF: OriginalBusinessProfit;
}

const ordinaryLines = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14] as const;
const documentedProfit = /^\d{1,12}(?:\.0{1,2})?$/;
const nativeFontSize = 9;
// A product of the engine's 20-digit percentage and the 13-digit combined profit fits exactly.
const ExactPercentage = Decimal.clone({ precision: 40 });

/** Project the confirmed Schedule C medical plan on its separate internal review copy. */
export async function fillForm7206OrdinaryReviewCandidate(
  input: TaxYearInput,
  sources: OrdinaryForm7206ReviewSources,
  template: Uint8Array,
) {
  const { taxYear, sha256, fields } = FORM_7206_2026_CANDIDATE;
  const { form7206: facts, scheduleC, scheduleF, taxpayer } = input;
  if (taxpayer.taxYear !== taxYear || sources.scheduleC.taxYear !== taxYear || sources.scheduleF.taxYear !== taxYear) {
    throw new Error("Form 7206 review requires 2026 calculation and original business records.");
  }
  if (sources.confirmed !== true || [sources.scheduleC, sources.scheduleF].some(source => !source.reference.trim())) {
    throw new Error("Form 7206 review requires confirmed original Schedule C and F business references.");
  }
  const owner = scheduleC?.accountHolder;
  const joint = taxpayer.filingStatus === "married_filing_jointly" && Boolean(taxpayer.spouse);
  if (!owner || scheduleF?.accountHolder !== owner || sources.scheduleC.accountHolder !== owner
    || sources.scheduleF.accountHolder !== owner || (owner === "spouse" && !joint)) {
    throw new Error("Form 7206 review requires one verified owner for the Schedule C and F businesses.");
  }
  if (input.w2s.some(w2 => w2.taxYear !== taxYear || !w2.accountHolder || (w2.accountHolder === "spouse" && !joint))) {
    throw new Error("Form 7206 review requires verified 2026 W-2 owners and years.");
  }
  const plan = facts?.plans?.[0];
  if (facts?.sourceTaxYear !== taxYear || facts.plans?.length !== 1 || plan?.businessSourceId !== "scheduleC"
    || plan.accountHolder !== owner || plan.businessKind !== "self_employed" || plan.kind !== "medical"
    || plan.establishedUnderBusiness !== true || plan.insuranceQualificationConfirmed !== true
    || plan.marketplaceCoverage !== false || plan.premiumTaxCreditInvolved !== false) {
    throw new Error("Form 7206 review requires one confirmed 2026 non-Marketplace Schedule C medical plan for its owner.");
  }
  if (scheduleF.accountingMethod !== "cash" || scheduleC.professionalWagering || input.form2555
    || input.form4137 || input.form4137ByOwner || input.form8919 || input.rrtaPayrollSources
    || input.scheduleK1.length || input.cryptoIncome || input.dependentCareBenefits
    || facts.incomeDeductions || !d(input.adjustments?.seRetirementContributions).isZero()) {
    throw new Error("Form 7206 with other earnings or adjustments requires a separate review method.");
  }
  if (createHash("sha256").update(template).digest("hex") !== sha256) {
    throw new Error("Unreviewed Form 7206 template revision.");
  }

  const scheduleCResult = calculateScheduleC(input, scheduleC);
  const scheduleFResult = calculateScheduleF(scheduleF);
  const scheduledProfits = [scheduleCResult.netProfit, scheduleFResult.netFarmProfit];
  if ([sources.scheduleC, sources.scheduleF].some(({ netProfit }, index) =>
    !documentedProfit.test(netProfit) || !scheduledProfits[index].gt(0) || !scheduledProfits[index].eq(netProfit))) {
    throw new Error("Form 7206 original positive whole-dollar business profits must match actual Schedule C and F calculations.");
  }
  const [scheduleCProfit, scheduleFProfit] = scheduledProfits;
  const se = calculateScheduleSE(input, FEDERAL_2026_CONSTANTS, scheduleCProfit, scheduleFProfit);
  if (se.excludedCashFarmCrp?.gt(0)) throw new Error("Form 7206 with exempt farm payments requires separate review.");
  const { form7206 } = calculateForm7206Return({
    input, scheduleCProfit, scheduleFProfit, cryptoBusinessProfit: d(0), foreignIncomeExclusion: d(0),
    selfEmploymentDeductions: se.perTaxpayer.map(row => ({ accountHolder: row.accountHolder, amount: row.deductibleHalf })),
    selfEmploymentSourcesVerified: se.sourceFactsVerified,
  });
  const lines = new Map(form7206.lines.filter(row => row.form === "Form 7206"
    && row.inputs?.Owner === owner && row.inputs?.Business === "scheduleC").map(row => [row.line, row.value]));
  if (!lines.get("14")?.eq(form7206.deductionToSchedule1)) {
    throw new Error("Form 7206 line 14 must reconcile to Schedule 1 line 17.");
  }

  const percentage = lines.get("6")?.times(100).toFixed();
  if (percentage === undefined || !new ExactPercentage(percentage).times(scheduleCProfit.plus(scheduleFProfit))
    .eq(new ExactPercentage(scheduleCProfit).times(100))) {
    throw new Error("Form 7206 requires an exact decimal business percentage on line 6.");
  }

  const document = await loadPdfDocumentQuietly(template);
  removeTrustedTemplateLegacyFormData(document);
  const form = document.getForm();
  const fieldFont = form.getDefaultFont();
  for (const line of ordinaryLines) {
    const value = lines.get(String(line));
    if (!value) throw new Error(`Form 7206 completed line ${line} is missing.`);
    if (line !== 6 && !value.isInteger()) throw new Error(`Form 7206 requires whole dollars on line ${line}.`);
    const field = form.getTextField(fields[`line${line}`]);
    const text = line === 6 ? `${percentage}%` : value.toFixed(0);
    const [widget] = field.acroField.getWidgets();
    // The text appearance adds one point of padding inside each border.
    const inset = 1 + (widget.getBorderStyle()?.getWidth() ?? 0);
    if (fieldFont.widthOfTextAtSize(text, nativeFontSize) + 2 * inset > widget.getRectangle().width) {
      const label = line === 6 ? "line 6 percentage" : `line ${line}`;
      throw new Error(`Form 7206 requires the ${label} to fit at the native text size.`);
    }
    field.setFontSize(nativeFontSize);
    field.setText(text);
  }
  await markReviewPdf(document);
  return { document, schedule1Line17: form7206.deductionToSchedule1 };
}
