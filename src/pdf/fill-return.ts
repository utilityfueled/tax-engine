/**
 * Top-level orchestrator for filling a complete tax return as PDFs.
 * Fills all applicable forms and saves them to the output directory.
 */

import { join } from "path";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { fillForm1040 } from "./fill-form-1040.js";
import { fillSchedule1 } from "./fill-schedule-1.js";
import { fillSchedule2 } from "./fill-schedule-2.js";
import { fillSchedule3 } from "./fill-schedule-3.js";
import { fillScheduleA } from "./fill-schedule-a.js";
import { fillScheduleB } from "./fill-schedule-b.js";
import { fillScheduleC } from "./fill-schedule-c.js";
import { fillScheduleD } from "./fill-schedule-d.js";
import { fillScheduleE } from "./fill-schedule-e.js";
import { fillScheduleSE } from "./fill-schedule-se.js";
import { fillForm8949 } from "./fill-form-8949.js";
import { fillForm8959 } from "./fill-form-8959.js";
import { fillForm8960 } from "./fill-form-8960.js";
import { fillForm8582 } from "./fill-form-8582.js";
import { fillForm8995 } from "./fill-form-8995.js";
import { fillForm8812 } from "./fill-form-8812.js";
import { fillForm8889 } from "./fill-form-8889.js";
import { fillForm2441 } from "./fill-form-2441.js";
import { fillForm8863 } from "./fill-form-8863.js";
import { fillForm6251 } from "./fill-form-6251.js";
import { fillForm8880 } from "./fill-form-8880.js";
import { fillForm5329 } from "./fill-form-5329.js";
import { fillForm8606 } from "./fill-form-8606.js";
import { fillForm1098EReference } from "./fill-form-1098-e.js";
import { fillTaxableRefundWorksheetReference } from "./fill-taxable-refund-worksheet.js";
import { fillSocialSecurityBenefitsWorksheetReference } from "./fill-social-security-benefits-worksheet.js";
import { fillSEHealthInsuranceWorksheetReference } from "./fill-se-health-insurance-worksheet.js";
import { fillIraDeductionWorksheetReference } from "./fill-ira-deduction-worksheet.js";
import { fillForm8962Reference } from "./fill-form-8962.js";
import {
  fillForm1116Reference,
  shouldIncludeForm1116ReferenceSummary,
} from "./fill-form-1116.js";
import { fillForm3903Reference } from "./fill-form-3903.js";
import { fillForm1099CReference } from "./fill-form-1099-c.js";
import { fillForm982Reference } from "./fill-form-982.js";
import { fillForm1099KReference } from "./fill-form-1099-k.js";
import { fillForm1099QReference } from "./fill-form-1099-q.js";
import { fillForm2555Reference } from "./fill-form-2555.js";
import {
  fillForm6252Reference,
  shouldIncludeForm6252ReferenceSummary,
} from "./fill-form-6252.js";
import { fillForm8824Reference } from "./fill-form-8824.js";
import { fillForm1099RReference } from "./fill-form-1099-r.js";
import { fillForm1099SAReference } from "./fill-form-1099-sa.js";
import { fillForm8829Reference } from "./fill-form-8829.js";
import {
  fillForm4562Reference,
  hasForm4562ReferenceSummary,
} from "./fill-form-4562.js";
import { fillForm461Reference } from "./fill-form-461.js";
import {
  fillForm6198Reference,
  shouldIncludeForm6198ReferenceSummary,
} from "./fill-form-6198.js";
import {
  fillPartnerBasisScheduleReference,
  shouldIncludePartnerBasisScheduleReferenceSummary,
} from "./fill-partner-basis-schedule.js";
import { fillForm8615Reference } from "./fill-form-8615.js";
import { fillForm8814Reference } from "./fill-form-8814.js";
import { fillForm8815Reference } from "./fill-form-8815.js";
import {
  fillForm6781Reference,
  shouldIncludeForm6781ReferenceSummary,
} from "./fill-form-6781.js";
import { fillForm4137 } from "./fill-form-4137.js";
import { fillForm8919 } from "./fill-form-8919.js";
import { fillScheduleEIC } from "./fill-schedule-eic.js";
import { fillScheduleH } from "./fill-schedule-h.js";
import { fillForm4797 } from "./fill-form-4797.js";
import { fillForm4952 } from "./fill-form-4952.js";
import { fillScheduleR } from "./fill-schedule-r.js";
import { fillForm8936 } from "./fill-form-8936.js";
import { fillScheduleF } from "./fill-schedule-f.js";
import { fillScheduleJ } from "./fill-schedule-j.js";
import { fillForm3800Reference } from "./fill-form-3800.js";
import { fillForm8801Reference } from "./fill-form-8801.js";
import { fillForm8995AReference } from "./fill-form-8995-a.js";
import { fillHomeSaleExclusionReference } from "./fill-home-sale-exclusion.js";
import {
  fillForm8915FReference,
  shouldIncludeForm8915FReferenceSummary,
} from "./fill-form-8915-f.js";
import { fillIL1040 } from "./fill-il-1040.js";
import { fillPALocalEITReference } from "./fill-pa-local-eit.js";
import {
  fillPAScheduleNRHReference,
  shouldIncludePAScheduleNRHReferenceSummary,
} from "./fill-pa-schedule-nrh.js";
import {
  fillPAScheduleJReference,
  shouldIncludePAScheduleJReferenceSummary,
} from "./fill-pa-schedule-j.js";
import {
  fillPAScheduleAReference,
  shouldIncludePAScheduleAReferenceSummary,
} from "./fill-pa-schedule-a.js";
import {
  fillPAScheduleBReference,
  shouldIncludePAScheduleBReferenceSummary,
} from "./fill-pa-schedule-b.js";
import {
  fillPAScheduleUEReference,
  shouldIncludePAScheduleUEReferenceSummary,
} from "./fill-pa-schedule-ue.js";
import {
  fillPAScheduleEReference,
  shouldIncludePAScheduleEReferenceSummary,
} from "./fill-pa-schedule-e.js";
import { fillPAScheduleCReference } from "./fill-pa-schedule-c.js";
import {
  fillPAScheduleSPReference,
  shouldIncludePAScheduleSPReferenceSummary,
} from "./fill-pa-schedule-sp.js";
import {
  fillPAScheduleTReference,
  shouldIncludePAScheduleTReferenceSummary,
} from "./fill-pa-schedule-t.js";
import {
  fillPAScheduleFReference,
  shouldIncludePAScheduleFReferenceSummary,
} from "./fill-pa-schedule-f.js";
import {
  fillPAScheduleDCReference,
  shouldIncludePAScheduleDCReferenceSummary,
} from "./fill-pa-schedule-dc.js";
import { fillPAScheduleDReference } from "./fill-pa-schedule-d.js";
import {
  fillPAScheduleGLReference,
  shouldIncludePAScheduleGLReferenceSummary,
} from "./fill-pa-schedule-g-l.js";
import {
  fillPAScheduleOReference,
  shouldIncludePAScheduleOReferenceSummary,
} from "./fill-pa-schedule-o.js";
import {
  fillPAScheduleSDReference,
  shouldIncludePAScheduleSDReferenceSummary,
} from "./fill-pa-schedule-sd.js";
import { fillPAREV1630Reference } from "./fill-pa-rev-1630.js";
import { fillPA40 } from "./fill-pa-40.js";
import { fillNJ1040 } from "./fill-nj-1040.js";
import { fillNYIT201 } from "./fill-ny-it201.js";
import { fillForm4684 } from "./fill-form-4684.js";
import { fillForm8839 } from "./fill-form-8839.js";
import { fillForm5695 } from "./fill-form-5695.js";
import { savePdf, flattenForm, loadBlankPdf } from "./pdf-utils.js";
import { assertPdfExportAllowed, markReviewPdf, type PdfExportPurpose } from "./export-policy.js";
import { calculatePAScheduleC } from "@/engine/state/pa-schedule-c.js";
import { d } from "@/utils/decimal.js";
import { shouldIncludePAScheduleDReferenceSummary } from "@/utils/pa-schedule-d-packet.js";

type PennsylvaniaReturn = NonNullable<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"]
>;

function shouldIncludeScheduleE(result: TaxReturnResult["scheduleE"] | undefined) {
  if (!result) {
    return false;
  }

  return (
    result.rentalProperties.length > 0
    || result.partnerships.length > 0
    || !result.totalSupplementalIncome.isZero()
    || result.suspendedPassiveLosses.length > 0
    || result.suspendedAtRiskLosses.length > 0
    || result.suspendedBasisLosses.length > 0
    || result.excessDistributionGains.length > 0
    || !result.section280FRecaptureIncome.isZero()
  );
}

function hasPALocalEIT(
  pennsylvaniaReturn: PennsylvaniaReturn | undefined,
): pennsylvaniaReturn is Extract<
  PennsylvaniaReturn,
  { localEIT?: unknown }
> & { localEIT: NonNullable<Extract<
  PennsylvaniaReturn,
  { localEIT?: unknown }
>["localEIT"]> } {
  return !!pennsylvaniaReturn && "localEIT" in pennsylvaniaReturn && pennsylvaniaReturn.localEIT !== undefined;
}

function hasPAREV1630(
  pennsylvaniaReturn: PennsylvaniaReturn | undefined,
): pennsylvaniaReturn is Extract<
  PennsylvaniaReturn,
  { rev1630?: unknown }
> & { rev1630: NonNullable<Extract<
  PennsylvaniaReturn,
  { rev1630?: unknown }
>["rev1630"]> } {
  return !!pennsylvaniaReturn && "rev1630" in pennsylvaniaReturn && pennsylvaniaReturn.rev1630 !== undefined;
}

function hasPAScheduleNRH(
  pennsylvaniaReturn: PennsylvaniaReturn | undefined,
): pennsylvaniaReturn is Extract<
  PennsylvaniaReturn,
  { scheduleNRH?: unknown }
> & { scheduleNRH: NonNullable<Extract<
  PennsylvaniaReturn,
  { scheduleNRH?: unknown }
>["scheduleNRH"]> } {
  return !!pennsylvaniaReturn && "scheduleNRH" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleNRH !== undefined;
}

function hasPAScheduleA(
  pennsylvaniaReturn: PennsylvaniaReturn | undefined,
): pennsylvaniaReturn is Extract<
  PennsylvaniaReturn,
  { scheduleA?: unknown }
> & { scheduleA: NonNullable<Extract<
  PennsylvaniaReturn,
  { scheduleA?: unknown }
>["scheduleA"]> } {
  return !!pennsylvaniaReturn && "scheduleA" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleA !== undefined;
}

function hasPAScheduleB(
  pennsylvaniaReturn: PennsylvaniaReturn | undefined,
): pennsylvaniaReturn is Extract<
  PennsylvaniaReturn,
  { scheduleB?: unknown }
> & { scheduleB: NonNullable<Extract<
  PennsylvaniaReturn,
  { scheduleB?: unknown }
>["scheduleB"]> } {
  return !!pennsylvaniaReturn && "scheduleB" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleB !== undefined;
}

function hasPAScheduleE(
  pennsylvaniaReturn: PennsylvaniaReturn | undefined,
): pennsylvaniaReturn is Extract<
  PennsylvaniaReturn,
  { scheduleE?: unknown }
> & { scheduleE: NonNullable<Extract<
  PennsylvaniaReturn,
  { scheduleE?: unknown }
>["scheduleE"]> } {
  return !!pennsylvaniaReturn && "scheduleE" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleE !== undefined;
}

function hasPAScheduleUE(
  pennsylvaniaReturn: PennsylvaniaReturn | undefined,
): pennsylvaniaReturn is Extract<
  PennsylvaniaReturn,
  { scheduleUE?: unknown }
> & { scheduleUE: NonNullable<Extract<
  PennsylvaniaReturn,
  { scheduleUE?: unknown }
>["scheduleUE"]> } {
  return !!pennsylvaniaReturn && "scheduleUE" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleUE !== undefined;
}

function hasPAScheduleSP(
  pennsylvaniaReturn: PennsylvaniaReturn | undefined,
): pennsylvaniaReturn is Extract<
  PennsylvaniaReturn,
  { scheduleSP?: unknown }
> & { scheduleSP: NonNullable<Extract<
  PennsylvaniaReturn,
  { scheduleSP?: unknown }
>["scheduleSP"]> } {
  return !!pennsylvaniaReturn && "scheduleSP" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleSP !== undefined;
}

function hasPAScheduleT(
  pennsylvaniaReturn: PennsylvaniaReturn | undefined,
): pennsylvaniaReturn is Extract<
  PennsylvaniaReturn,
  { scheduleT?: unknown }
> & { scheduleT: NonNullable<Extract<
  PennsylvaniaReturn,
  { scheduleT?: unknown }
>["scheduleT"]> } {
  return !!pennsylvaniaReturn && "scheduleT" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleT !== undefined;
}

function hasPAScheduleD(
  pennsylvaniaReturn: PennsylvaniaReturn | undefined,
): pennsylvaniaReturn is Extract<
  PennsylvaniaReturn,
  { scheduleD?: unknown }
> & { scheduleD: NonNullable<Extract<
  PennsylvaniaReturn,
  { scheduleD?: unknown }
>["scheduleD"]> } {
  return !!pennsylvaniaReturn && "scheduleD" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleD !== undefined;
}

function hasPAScheduleF(
  pennsylvaniaReturn: PennsylvaniaReturn | undefined,
): pennsylvaniaReturn is Extract<
  PennsylvaniaReturn,
  { scheduleF?: unknown }
> & { scheduleF: NonNullable<Extract<
  PennsylvaniaReturn,
  { scheduleF?: unknown }
>["scheduleF"]> } {
  return !!pennsylvaniaReturn && "scheduleF" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleF !== undefined;
}

function hasPAScheduleJ(
  pennsylvaniaReturn: PennsylvaniaReturn | undefined,
): pennsylvaniaReturn is Extract<
  PennsylvaniaReturn,
  { scheduleJ?: unknown }
> & { scheduleJ: NonNullable<Extract<
  PennsylvaniaReturn,
  { scheduleJ?: unknown }
>["scheduleJ"]> } {
  return !!pennsylvaniaReturn && "scheduleJ" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleJ !== undefined;
}

function hasPAScheduleDC(
  pennsylvaniaReturn: PennsylvaniaReturn | undefined,
): pennsylvaniaReturn is Extract<
  PennsylvaniaReturn,
  { scheduleDC?: unknown }
> & { scheduleDC: NonNullable<Extract<
  PennsylvaniaReturn,
  { scheduleDC?: unknown }
>["scheduleDC"]> } {
  return !!pennsylvaniaReturn && "scheduleDC" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleDC !== undefined;
}

function hasPAScheduleO(
  pennsylvaniaReturn: PennsylvaniaReturn | undefined,
): pennsylvaniaReturn is Extract<
  PennsylvaniaReturn,
  { scheduleO?: unknown }
> & { scheduleO: NonNullable<Extract<
  PennsylvaniaReturn,
  { scheduleO?: unknown }
>["scheduleO"]> } {
  return !!pennsylvaniaReturn && "scheduleO" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleO !== undefined;
}

function hasPAScheduleSD(
  pennsylvaniaReturn: PennsylvaniaReturn | undefined,
): pennsylvaniaReturn is Extract<
  PennsylvaniaReturn,
  { scheduleSD?: unknown }
> & { scheduleSD: NonNullable<Extract<
  PennsylvaniaReturn,
  { scheduleSD?: unknown }
>["scheduleSD"]> } {
  return !!pennsylvaniaReturn && "scheduleSD" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleSD !== undefined;
}

export interface FillReturnOptions {
  /** Review is the only enabled purpose until independent filing qualification. */
  purpose?: PdfExportPurpose;
  /** Directory containing blank IRS PDF forms. */
  blankFormsDir: string;
  /** Directory to write filled PDF forms. */
  outputDir: string;
  /** Whether to flatten form fields (makes PDF non-editable but renders consistently). */
  flatten?: boolean;
}

export interface FillReturnResult {
  /** List of filled PDF file paths. */
  filledForms: string[];
}

/**
 * Fill all applicable IRS PDF forms from engine results.
 * Currently fills: Form 1040, Schedule 1, 2, 3, A, B, C, D, E, F, J, H, R, SE, EIC, Form 4137, 4684, 4797, 4952, 8839, 8919, 8936, 8949, 8959, 8960, 8582, 8995, 8812, 8889, 2441, 8863, 6251, 8880, 5329, 8606, 2210, plus supported Form 1098-E, the Social Security Benefits Worksheet, 8962, 1099-C, 1099-K, 1099-Q, 1099-R, 1099-SA, 2555, 3800, 3903, 461, 6781, 8615, 8815, 8801, 8824, 8829, 8915-F, 8995-A, and home sale exclusion reference summaries.
 * State forms: IL-1040, PA-40, NJ-1040, NY IT-201, plus supported Pennsylvania Schedule A, Schedule B, Schedule C, Schedule D, Schedule E, Schedule F, Schedule J, Schedule NRH, Schedule O, Schedule SD, Schedule SP, Schedule T, Schedule UE, Schedule DC, Schedule G-L, local EIT, and REV-1630 reference summaries when their supported packet slices are present.
 */
export async function fillReturn(
  input: TaxYearInput,
  result: TaxReturnResult,
  options: FillReturnOptions,
): Promise<FillReturnResult> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear, options.purpose);
  const filledForms: string[] = [];
  const { blankFormsDir, outputDir, flatten = false } = options;

  // ── Form 1040 (always filled) ──
  const f1040Path = join(blankFormsDir, "f1040.pdf");
  const doc1040 = await fillForm1040(input, result, f1040Path);
  if (flatten) await flattenForm(doc1040.getForm());
  const outputPath1040 = join(outputDir, "f1040-filled.pdf");
  await savePdf(doc1040, outputPath1040);
  filledForms.push(outputPath1040);

  // ── Schedule 1 (if applicable) ──
  if (result.schedule1) {
    const s1Path = join(blankFormsDir, "f1040s1.pdf");
    const docS1 = await fillSchedule1(input, result, s1Path);
    if (flatten) await flattenForm(docS1.getForm());
    const outputPathS1 = join(outputDir, "f1040s1-filled.pdf");
    await savePdf(docS1, outputPathS1);
    filledForms.push(outputPathS1);
  }

  // ── Schedule 2 (if applicable) ──
  if (result.schedule2) {
    const s2Path = join(blankFormsDir, "f1040s2.pdf");
    const docS2 = await fillSchedule2(input, result, s2Path);
    if (flatten) await flattenForm(docS2.getForm());
    const outputPathS2 = join(outputDir, "f1040s2-filled.pdf");
    await savePdf(docS2, outputPathS2);
    filledForms.push(outputPathS2);
  }

  // ── Schedule 3 (if applicable) ──
  if (result.schedule3) {
    const s3Path = join(blankFormsDir, "f1040s3.pdf");
    const docS3 = await fillSchedule3(input, result, s3Path);
    if (flatten) await flattenForm(docS3.getForm());
    const outputPathS3 = join(outputDir, "f1040s3-filled.pdf");
    await savePdf(docS3, outputPathS3);
    filledForms.push(outputPathS3);

    if (input.energyCredits) {
      const f5695Path = join(blankFormsDir, "f5695.pdf");
      const doc5695 = await fillForm5695(input, result, f5695Path);
      if (flatten) await flattenForm(doc5695.getForm());
      const outputPath5695 = join(outputDir, "f5695-filled.pdf");
      await savePdf(doc5695, outputPath5695);
      filledForms.push(outputPath5695);
    }
  }

  // ── Schedule A (if applicable — only when itemizing) ──
  if (result.scheduleA && result.deductionUsed === "itemized") {
    const saPath = join(blankFormsDir, "f1040sa.pdf");
    const docSA = await fillScheduleA(input, result, saPath);
    if (flatten) await flattenForm(docSA.getForm());
    const outputPathSA = join(outputDir, "f1040sa-filled.pdf");
    await savePdf(docSA, outputPathSA);
    filledForms.push(outputPathSA);
  }

  // ── Schedule B (if applicable) ──
  if (result.scheduleB?.isRequired) {
    const sbPath = join(blankFormsDir, "f1040sb.pdf");
    const docSB = await fillScheduleB(input, result, sbPath);
    if (flatten) await flattenForm(docSB.getForm());
    const outputPathSB = join(outputDir, "f1040sb-filled.pdf");
    await savePdf(docSB, outputPathSB);
    filledForms.push(outputPathSB);
  }

  // ── Schedule C (if applicable — only when there's a net profit or loss) ──
  if (result.scheduleC) {
    const scPath = join(blankFormsDir, "f1040sc.pdf");
    const docSC = await fillScheduleC(input, result, scPath);
    if (flatten) await flattenForm(docSC.getForm());
    const outputPathSC = join(outputDir, "f1040sc-filled.pdf");
    await savePdf(docSC, outputPathSC);
    filledForms.push(outputPathSC);
  }

  // ── Schedule D (if applicable) ──
  if (result.scheduleD) {
    const sdPath = join(blankFormsDir, "f1040sd.pdf");
    const docSD = await fillScheduleD(input, result, sdPath);
    if (flatten) await flattenForm(docSD.getForm());
    const outputPathSD = join(outputDir, "f1040sd-filled.pdf");
    await savePdf(docSD, outputPathSD);
    filledForms.push(outputPathSD);
  }

  // ── Schedule E (if applicable — rental properties or K-1 partnerships) ──
  if (shouldIncludeScheduleE(result.scheduleE)) {
    const sePath = join(blankFormsDir, "f1040se.pdf");
    const docSE = await fillScheduleE(input, result, sePath);
    if (flatten) await flattenForm(docSE.getForm());
    const outputPathSE = join(outputDir, "f1040se-filled.pdf");
    await savePdf(docSE, outputPathSE);
    filledForms.push(outputPathSE);
  }

  // ── Schedule F (if applicable — farm profit or loss) ──
  if (result.scheduleF && !result.scheduleF.grossFarmIncome.isZero()) {
    const sfPath = join(blankFormsDir, "f1040sf.pdf");
    const docSF = await fillScheduleF(input, result, sfPath);
    if (flatten) await flattenForm(docSF.getForm());
    const outputPathSF = join(outputDir, "f1040sf-filled.pdf");
    await savePdf(docSF, outputPathSF);
    filledForms.push(outputPathSF);
  }

  // ── Schedule J (if applicable — farm income averaging) ──
  if (result.scheduleJ && result.scheduleJ.isbeneficial) {
    const sjPath = join(blankFormsDir, "f1040sj.pdf");
    const docSJ = await fillScheduleJ(input, result, sjPath);
    if (flatten) await flattenForm(docSJ.getForm());
    const outputPathSJ = join(outputDir, "f1040sj-filled.pdf");
    await savePdf(docSJ, outputPathSJ);
    filledForms.push(outputPathSJ);
  }

  // ── Schedule SE (if applicable — only when there's actual SE tax) ──
  if (result.scheduleSE?.totalSETax.gt(0)) {
    const ssePath = join(blankFormsDir, "f1040sse.pdf");
    const docSSE = await fillScheduleSE(input, result, ssePath);
    if (flatten) await flattenForm(docSSE.getForm());
    const outputPathSSE = join(outputDir, "f1040sse-filled.pdf");
    await savePdf(docSSE, outputPathSSE);
    filledForms.push(outputPathSSE);
  }

  // ── Form 8949 (if applicable — capital transactions on 1099-B) ──
  if (input.form1099B && input.form1099B.length > 0) {
    const hasTransactions = input.form1099B.some((f) => f.transactions.length > 0);
    if (hasTransactions) {
      const f8949Path = join(blankFormsDir, "f8949.pdf");
      const doc8949 = await fillForm8949(input, f8949Path);
      if (flatten) await flattenForm(doc8949.getForm());
      const outputPath8949 = join(outputDir, "f8949-filled.pdf");
      await savePdf(doc8949, outputPath8949);
      filledForms.push(outputPath8949);
    }
  }

  // ── Form 8959 (if applicable — Additional Medicare Tax) ──
  if (result.form8959 && result.form8959.additionalMedicareTax.gt(0)) {
    const f8959Path = join(blankFormsDir, "f8959.pdf");
    const doc8959 = await fillForm8959(input, result, f8959Path);
    if (flatten) await flattenForm(doc8959.getForm());
    const outputPath8959 = join(outputDir, "f8959-filled.pdf");
    await savePdf(doc8959, outputPath8959);
    filledForms.push(outputPath8959);
  }

  // ── Form 8960 (if applicable — Net Investment Income Tax) ──
  if (result.form8960 && result.form8960.niitTax.gt(0)) {
    const f8960Path = join(blankFormsDir, "f8960.pdf");
    const doc8960 = await fillForm8960(input, result, f8960Path);
    if (flatten) await flattenForm(doc8960.getForm());
    const outputPath8960 = join(outputDir, "f8960-filled.pdf");
    await savePdf(doc8960, outputPath8960);
    filledForms.push(outputPath8960);
  }

  // ── Form 4137 (if applicable — Social Security and Medicare Tax on Unreported Tips) ──
  if (result.form4137 && result.form4137.line13.gt(0)) {
    const f4137Path = join(blankFormsDir, "f4137.pdf");
    const doc4137 = await fillForm4137(input, result, f4137Path);
    if (flatten) await flattenForm(doc4137.getForm());
    const outputPath4137 = join(outputDir, "f4137-filled.pdf");
    await savePdf(doc4137, outputPath4137);
    filledForms.push(outputPath4137);
  }

  // ── Form 8919 (if applicable — Uncollected Social Security and Medicare Tax on Wages) ──
  if (result.form8919 && result.form8919.line13.gt(0)) {
    const f8919Path = join(blankFormsDir, "f8919.pdf");
    const doc8919 = await fillForm8919(input, result, f8919Path);
    if (flatten) await flattenForm(doc8919.getForm());
    const outputPath8919 = join(outputDir, "f8919-filled.pdf");
    await savePdf(doc8919, outputPath8919);
    filledForms.push(outputPath8919);
  }

  // ── Form 8582 (if applicable — Passive Activity Loss Limitations) ──
  if (result.form8582 && result.form8582.suspendedLoss.gt(0)) {
    const f8582Path = join(blankFormsDir, "f8582.pdf");
    const doc8582 = await fillForm8582(input, result, f8582Path);
    if (flatten) await flattenForm(doc8582.getForm());
    const outputPath8582 = join(outputDir, "f8582-filled.pdf");
    await savePdf(doc8582, outputPath8582);
    filledForms.push(outputPath8582);
  }

  // ── Form 4684 (if applicable — Casualties and Thefts) ──
  if (result.form4684 && (result.form4684.deductibleLoss.gt(0) || result.form4684.netCasualtyGain.gt(0))) {
    const f4684Path = join(blankFormsDir, "f4684.pdf");
    const doc4684 = await fillForm4684(input, result, f4684Path);
    if (flatten) await flattenForm(doc4684.getForm());
    const outputPath4684 = join(outputDir, "f4684-filled.pdf");
    await savePdf(doc4684, outputPath4684);
    filledForms.push(outputPath4684);
  }

  // ── Form 4797 (if applicable — Sales of Business Property) ──
  if (result.form4797 && (!result.form4797.ordinaryGainOrLoss.isZero() || !result.form4797.longTermCapitalGain.isZero() || result.form4797.propertyResults.length > 0)) {
    const f4797Path = join(blankFormsDir, "f4797.pdf");
    const doc4797 = await fillForm4797(input, result, f4797Path);
    if (flatten) await flattenForm(doc4797.getForm());
    const outputPath4797 = join(outputDir, "f4797-filled.pdf");
    await savePdf(doc4797, outputPath4797);
    filledForms.push(outputPath4797);
  }

  // ── Form 8995 (if applicable — QBI Deduction Simplified Computation) ──
  if (result.form8995 && result.form8995.qbiDeduction.gt(0)) {
    const f8995Path = join(blankFormsDir, "f8995.pdf");
    const doc8995 = await fillForm8995(input, result, f8995Path);
    if (flatten) await flattenForm(doc8995.getForm());
    const outputPath8995 = join(outputDir, "f8995-filled.pdf");
    await savePdf(doc8995, outputPath8995);
    filledForms.push(outputPath8995);
  }

  // ── Schedule 8812 (if applicable — Child Tax Credit / ACTC) ──
  if (result.form8812 && (result.form8812.nonrefundableCTC.gt(0) || result.form8812.actc.gt(0))) {
    const f8812Path = join(blankFormsDir, "f1040s8.pdf");
    const doc8812 = await fillForm8812(input, result, f8812Path);
    if (flatten) await flattenForm(doc8812.getForm());
    const outputPath8812 = join(outputDir, "f1040s8-filled.pdf");
    await savePdf(doc8812, outputPath8812);
    filledForms.push(outputPath8812);
  }

  // ── Form 8889 (if applicable — HSA) ──
  // For MFJ with two HSAs, fill one form per owner; otherwise fill primary only.
  const hsaOwners = Object.keys(result.form8889ByOwner ?? {}) as Array<"primary" | "spouse">;
  if (hsaOwners.length > 0) {
    for (const ownerKey of hsaOwners) {
      const ownerResult = result.form8889ByOwner?.[ownerKey];
      if (ownerResult) {
        const f8889Path = join(blankFormsDir, "f8889.pdf");
        const doc8889 = await fillForm8889(input, result, f8889Path, ownerKey);
        if (flatten) await flattenForm(doc8889.getForm());
        const suffix = hsaOwners.length > 1 ? `-${ownerKey}` : "";
        const outputPath8889 = join(outputDir, `f8889${suffix}-filled.pdf`);
        await savePdf(doc8889, outputPath8889);
        filledForms.push(outputPath8889);
      }
    }
  } else if (result.form8889) {
    const f8889Path = join(blankFormsDir, "f8889.pdf");
    const doc8889 = await fillForm8889(input, result, f8889Path, "primary");
    if (flatten) await flattenForm(doc8889.getForm());
    const outputPath8889 = join(outputDir, "f8889-filled.pdf");
    await savePdf(doc8889, outputPath8889);
    filledForms.push(outputPath8889);
  }

  // ── Form 2441 (if applicable — Child and Dependent Care Credit) ──
  if (result.form2441 && result.form2441.credit.gt(0)) {
    const f2441Path = join(blankFormsDir, "f2441.pdf");
    const doc2441 = await fillForm2441(input, result, f2441Path);
    if (flatten) await flattenForm(doc2441.getForm());
    const outputPath2441 = join(outputDir, "f2441-filled.pdf");
    await savePdf(doc2441, outputPath2441);
    filledForms.push(outputPath2441);
  }

  // ── Form 8863 (if applicable — Education Credits) ──
  if (input.educationExpenses &&
      (input.educationExpenses.aocStudents.length > 0 ||
       (input.educationExpenses.llcExpenses && new Decimal(input.educationExpenses.llcExpenses).gt(0)))) {
    const f8863Path = join(blankFormsDir, "f8863.pdf");
    const doc8863 = await fillForm8863(input, result, f8863Path);
    if (flatten) await flattenForm(doc8863.getForm());
    const outputPath8863 = join(outputDir, "f8863-filled.pdf");
    await savePdf(doc8863, outputPath8863);
    filledForms.push(outputPath8863);
  }

  // ── Form 6251 (if applicable — Alternative Minimum Tax) ──
  if (result.form6251 && result.form6251.amt.gt(0)) {
    const f6251Path = join(blankFormsDir, "f6251.pdf");
    const doc6251 = await fillForm6251(input, result, f6251Path);
    if (flatten) await flattenForm(doc6251.getForm());
    const outputPath6251 = join(outputDir, "f6251-filled.pdf");
    await savePdf(doc6251, outputPath6251);
    filledForms.push(outputPath6251);
  }

  // ── Form 8880 (if applicable — Saver's Credit) ──
  if (result.form8880 && result.form8880.line12.gt(0)) {
    const f8880Path = join(blankFormsDir, "f8880.pdf");
    const doc8880 = await fillForm8880(input, result, f8880Path);
    if (flatten) await flattenForm(doc8880.getForm());
    const outputPath8880 = join(outputDir, "f8880-filled.pdf");
    await savePdf(doc8880, outputPath8880);
    filledForms.push(outputPath8880);
  }

  // ── Form 5329 (if applicable — Additional Taxes on Qualified Plans) ──
  if (result.form5329 && result.form5329.totalAdditionalTax.gt(0)) {
    const f5329Path = join(blankFormsDir, "f5329.pdf");
    const doc5329 = await fillForm5329(input, result, f5329Path);
    if (flatten) await flattenForm(doc5329.getForm());
    const outputPath5329 = join(outputDir, "f5329-filled.pdf");
    await savePdf(doc5329, outputPath5329);
    filledForms.push(outputPath5329);
  }

  // ── Form 8606 (if applicable — Nondeductible IRAs) ──
  // For MFJ with two Form 8606s, fill one per owner; otherwise fill primary only.
  const f8606Owners = Object.keys(result.form8606ByOwner ?? {}) as Array<"primary" | "spouse">;
  if (f8606Owners.length > 0) {
    for (const ownerKey of f8606Owners) {
      const ownerResult = result.form8606ByOwner?.[ownerKey];
      if (ownerResult) {
        const f8606Path = join(blankFormsDir, "f8606.pdf");
        const doc8606 = await fillForm8606(input, result, f8606Path, ownerKey);
        if (flatten) await flattenForm(doc8606.getForm());
        const suffix = f8606Owners.length > 1 ? `-${ownerKey}` : "";
        const outputPath8606 = join(outputDir, `f8606${suffix}-filled.pdf`);
        await savePdf(doc8606, outputPath8606);
        filledForms.push(outputPath8606);
      }
    }
  } else if (result.form8606) {
    const f8606Path = join(blankFormsDir, "f8606.pdf");
    const doc8606 = await fillForm8606(input, result, f8606Path, "primary");
    if (flatten) await flattenForm(doc8606.getForm());
    const outputPath8606 = join(outputDir, "f8606-filled.pdf");
    await savePdf(doc8606, outputPath8606);
    filledForms.push(outputPath8606);
  }

  // ── Form 1099-R reference summary (if applicable — supported retirement statements) ──
  if (input.form1099R && input.form1099R.length > 0 && result.form1099R) {
    const outputPath1099RReference = await fillForm1099RReference(input.form1099R, result.form1099R, outputDir);
    filledForms.push(outputPath1099RReference);
  }

  // ── Form 1116 reference summary (if applicable — supported foreign tax credit activity that requires filing Form 1116) ──
  if (shouldIncludeForm1116ReferenceSummary(result)) {
    const outputPath1116Reference = await fillForm1116Reference(result, outputDir);
    filledForms.push(outputPath1116Reference);
  }

  // ── Form 1098-E reference summary (if applicable — supported student loan interest statements) ──
  if (input.form1098E && input.form1098E.length > 0 && result.form1098ESummary) {
    const outputPath1098EReference = await fillForm1098EReference(input.form1098E, result, outputDir);
    filledForms.push(outputPath1098EReference);
  }

  // ── Taxable Refund Worksheet reference summary (if applicable — supported Schedule 1 Line 1 prior-year refund analysis) ──
  if (input.taxableRefundWorksheet && result.taxableRefundWorksheet) {
    const outputPathTaxableRefundWorksheetReference = await fillTaxableRefundWorksheetReference(
      input.form1099G ?? [],
      input.taxableRefundWorksheet,
      result.taxableRefundWorksheet,
      outputDir,
    );
    filledForms.push(outputPathTaxableRefundWorksheetReference);
  }

  // ── Social Security Benefits Worksheet reference summary (if applicable — supported SSA-1099 and RRB-1099 benefit inputs) ──
  if (result.socialSecurityBenefitsWorksheet && result.socialSecurityBenefitsGross.gt(0)) {
    const outputPathSocialSecurityBenefitsWorksheetReference =
      await fillSocialSecurityBenefitsWorksheetReference(input, result, outputDir);
    filledForms.push(outputPathSocialSecurityBenefitsWorksheetReference);
  }

  // ── Self-Employed Health Insurance Worksheet reference summary (if applicable — supported Pub. 535 worksheet inputs) ──
  if (result.seHealthInsuranceWorksheet) {
    const outputPathSEHealthInsuranceWorksheetReference =
      await fillSEHealthInsuranceWorksheetReference(result, outputDir);
    filledForms.push(outputPathSEHealthInsuranceWorksheetReference);
  }

  // ── IRA Deduction Worksheet reference summary (if applicable — supported Pub. 590-A deduction worksheet inputs) ──
  if (result.iraDeductionWorksheet) {
    const outputPathIraDeductionWorksheetReference = await fillIraDeductionWorksheetReference(
      result.iraDeductionWorksheet,
      outputDir,
    );
    filledForms.push(outputPathIraDeductionWorksheetReference);
  }

  // ── Form 8962 reference summary (if applicable — supported marketplace reconciliation data) ──
  if (input.form1095A.length > 0 && result.form8962) {
    const outputPath8962Reference = await fillForm8962Reference(input.form1095A, result, outputDir);
    filledForms.push(outputPath8962Reference);
  }

  // ── Form 1099-C reference summary (if applicable — supported cancellation-of-debt statements) ──
  if (input.form1099C && input.form1099C.length > 0) {
    const outputPath1099CReference = await fillForm1099CReference(
      input.form1099C,
      input.codExclusion,
      input.taxpayer.filingStatus,
      input.taxpayer.taxYear,
      outputDir,
    );
    filledForms.push(outputPath1099CReference);
  }

  // ── Form 982 reference summary (if applicable — supported COD exclusions that trigger attribute reductions) ──
  if (result.form982) {
    const outputPath982Reference = await fillForm982Reference(result, outputDir);
    filledForms.push(outputPath982Reference);
  }

  // ── Form 1099-K reference summary (if applicable — supported payment platform statements) ──
  if (input.form1099K && input.form1099K.length > 0 && result.form1099K) {
    const outputPath1099KReference = await fillForm1099KReference(input.form1099K, result.form1099K, outputDir);
    filledForms.push(outputPath1099KReference);
  }

  // ── Form 1099-Q reference summary (if applicable — supported education distribution statements) ──
  if (input.form1099Q && input.form1099Q.length > 0 && result.form1099Q) {
    const outputPath1099QReference = await fillForm1099QReference(
      input.form1099Q,
      result.form1099Q,
      input.qualifiedEducationExpenses,
      outputDir,
    );
    filledForms.push(outputPath1099QReference);
  }

  // ── Form 2555 reference summary (if applicable — supported foreign earned income exclusion inputs) ──
  if (input.form2555 && result.form2555) {
    const outputPath2555Reference = await fillForm2555Reference(result.form2555, outputDir);
    filledForms.push(outputPath2555Reference);
  }

  // ── Form 6252 reference summary (if applicable — supported installment-sale filings that affect the current year) ──
  if (shouldIncludeForm6252ReferenceSummary(input.form6252)) {
    const outputPath6252Reference = await fillForm6252Reference(input.form6252, outputDir);
    filledForms.push(outputPath6252Reference);
  }

  // ── Form 8824 reference summary (if applicable — supported like-kind exchange activity) ──
  if ((input.form8824?.length ?? 0) > 0 && result.form8824 && result.form8824.exchanges.length > 0) {
    const outputPath8824Reference = await fillForm8824Reference(result.form8824, outputDir);
    filledForms.push(outputPath8824Reference);
  }

  // ── Form 1099-SA reference summary (if applicable — supported HSA statements) ──
  if (
    input.form1099SA?.some((form) => form.accountType === "hsa" && form.trusteeToTrusteeTransfer !== true)
    && result.form1099SA
  ) {
    const outputPath1099SAReference = await fillForm1099SAReference(input.form1099SA, result.form1099SA, outputDir);
    filledForms.push(outputPath1099SAReference);
  }

  // ── Form 3903 reference summary (if applicable — supported military moving-expense inputs) ──
  if (input.form3903) {
    const outputPath3903Reference = await fillForm3903Reference(input.form3903, outputDir);
    filledForms.push(outputPath3903Reference);
  }

  // ── Form 8829 reference summary (if applicable — supported actual-expense home-office inputs) ──
  if (
    input.scheduleC?.homeOffice?.method === "actual"
    && input.scheduleC.homeOffice.form8829
    && result.scheduleC
  ) {
    const outputPath8829Reference = await fillForm8829Reference(
      {
        ...input.scheduleC.homeOffice.form8829,
        grossIncomeLimit: input.scheduleC.homeOffice.form8829.grossIncomeLimit
          ?? result.scheduleC.tentativeProfit.toString(),
      },
      outputDir,
    );
    filledForms.push(outputPath8829Reference);
  }

  // ── Form 4562 reference summary (if applicable — supported Schedule C or rental-property depreciation activity) ──
  if (hasForm4562ReferenceSummary(input)) {
    const outputPath4562Reference = await fillForm4562Reference(input, outputDir);
    filledForms.push(outputPath4562Reference);
  }

  // ── Form 461 reference summary (if applicable — supported excess business loss limitation outputs) ──
  if (result.form461?.applies) {
    const outputPath461Reference = await fillForm461Reference(result.form461, outputDir);
    filledForms.push(outputPath461Reference);
  }

  // ── Partner/shareholder basis schedule reference summary (if applicable — supported Schedule K-1 basis limitation activity) ──
  if (shouldIncludePartnerBasisScheduleReferenceSummary(result)) {
    const outputPathPartnerBasisReference = await fillPartnerBasisScheduleReference(result, outputDir);
    filledForms.push(outputPathPartnerBasisReference);
  }

  // ── Form 6198 reference summary (if applicable — supported at-risk limitation activity from Schedule K-1 inputs) ──
  if (shouldIncludeForm6198ReferenceSummary(input)) {
    const outputPath6198Reference = await fillForm6198Reference(input, outputDir);
    filledForms.push(outputPath6198Reference);
  }

  // ── Form 6781 reference summary (if applicable — supported section 1256 and straddle activity) ──
  if (shouldIncludeForm6781ReferenceSummary(input)) {
    const outputPath6781Reference = await fillForm6781Reference(input.form6781!, outputDir);
    filledForms.push(outputPath6781Reference);
  }

  // ── Form 8615 reference summary (if applicable — supported kiddie-tax outputs) ──
  if (input.form8615 && result.form8615?.applies) {
    const outputPath8615Reference = await fillForm8615Reference(input.form8615, result.form8615, outputDir);
    filledForms.push(outputPath8615Reference);
  }

  // ── Form 8814 reference summary (if applicable — supported parent election for child interest/dividends) ──
  if (result.form8814 && result.form8814.children.some((child) => child.applies)) {
    const outputPath8814Reference = await fillForm8814Reference(result.form8814, outputDir);
    filledForms.push(outputPath8814Reference);
  }

  // ── Form 8815 reference summary (if applicable — supported savings-bond exclusions that are actually claimed) ──
  if (
    (input.savingsBondRedemptions?.length ?? 0) > 0
    && result.form8815
    && result.form8815.excludableSavingsBondInterest.gt(0)
  ) {
    const outputPath8815Reference = await fillForm8815Reference(
      input.savingsBondRedemptions ?? [],
      result.form8815,
      outputDir,
    );
    filledForms.push(outputPath8815Reference);
  }

  // ── Form 3800 reference summary (if applicable — supported general business credit outputs) ──
  if (result.form3800 && result.form3800.totalCredit.gt(0)) {
    const outputPath3800Reference = await fillForm3800Reference(result.form3800, outputDir);
    filledForms.push(outputPath3800Reference);
  }

  // ── Form 8995-A reference summary (if applicable — supported detailed QBI computations above the simplified threshold) ──
  if (result.form8995A) {
    const outputPath8995AReference = await fillForm8995AReference(result.form8995A, outputDir);
    filledForms.push(outputPath8995AReference);
  }

  // ── Home sale exclusion reference summary (if applicable — supported principal-residence sale activity) ──
  if ((input.homeSales?.length ?? 0) > 0 && result.scheduleD?.homeSales) {
    const outputPathHomeSaleReference = await fillHomeSaleExclusionReference(input, result, outputDir);
    filledForms.push(outputPathHomeSaleReference);
  }

  // ── Form 8801 reference summary (if applicable — supported prior-year minimum tax credit outputs) ──
  if (input.form8801 && result.form8801) {
    const outputPath8801Reference = await fillForm8801Reference(result.form8801, outputDir);
    filledForms.push(outputPath8801Reference);
  }

  // ── Form 8915-F reference summary (if applicable — supported qualified disaster distribution activity) ──
  if (shouldIncludeForm8915FReferenceSummary(input.form8915F) && result.form8915F) {
    const outputPath8915FReference = await fillForm8915FReference(
      input.form8915F!,
      input.taxpayer.taxYear,
      result.form8915F,
      outputDir,
    );
    filledForms.push(outputPath8915FReference);
  }

  // ── Form 2210 (if applicable — Underpayment of Estimated Tax) ──
  // We do not auto-attach Form 2210 to the packet by default.
  // The main return can reflect an estimated tax penalty without requiring
  // this supporting worksheet to be filed, and attaching it automatically
  // makes draft packets look more filing-ready than they are.

  // ── Schedule EIC (if applicable — qualifying children for EIC) ──
  const eicChildren = input.taxpayer.dependents.filter((dep) => dep.qualifiesForEIC);
  if (result.scheduleEIC && !result.scheduleEIC.disqualified && eicChildren.length > 0) {
    const seiPath = join(blankFormsDir, "f1040sei.pdf");
    const docSEI = await fillScheduleEIC(input, result, seiPath);
    if (flatten) await flattenForm(docSEI.getForm());
    const outputPathSEI = join(outputDir, "f1040sei-filled.pdf");
    await savePdf(docSEI, outputPathSEI);
    filledForms.push(outputPathSEI);
  }

  // ── Schedule H (if applicable — Household Employment Taxes) ──
  if (result.scheduleH && result.scheduleH.totalTax.gt(0)) {
    const shPath = join(blankFormsDir, "f1040sh.pdf");
    const docSH = await fillScheduleH(input, result, shPath);
    if (flatten) await flattenForm(docSH.getForm());
    const outputPathSH = join(outputDir, "f1040sh-filled.pdf");
    await savePdf(docSH, outputPathSH);
    filledForms.push(outputPathSH);
  }

  // ── Form 4952 (if applicable — Investment Interest Expense Deduction) ──
  if (result.form4952 && result.form4952.deductibleAmount.gt(0)) {
    const f4952Path = join(blankFormsDir, "f4952.pdf");
    const doc4952 = await fillForm4952(input, result, f4952Path);
    if (flatten) await flattenForm(doc4952.getForm());
    const outputPath4952 = join(outputDir, "f4952-filled.pdf");
    await savePdf(doc4952, outputPath4952);
    filledForms.push(outputPath4952);
  }

  // ── Schedule R (if applicable — Credit for the Elderly or the Disabled) ──
  if (result.scheduleR && result.scheduleR.eligible && result.scheduleR.credit.gt(0)) {
    const srPath = join(blankFormsDir, "f1040sr.pdf");
    const docSR = await fillScheduleR(input, result, srPath);
    if (flatten) await flattenForm(docSR.getForm());
    const outputPathSR = join(outputDir, "f1040sr-filled.pdf");
    await savePdf(docSR, outputPathSR);
    filledForms.push(outputPathSR);
  }

  // ── Form 8936 (if applicable — Clean Vehicle Credits) ──
  if (result.form8936 && (result.form8936.totalNewVehicleCredit.gt(0) || result.form8936.totalPreviouslyOwnedCredit.gt(0))) {
    const f8936Path = join(blankFormsDir, "f8936.pdf");
    const doc8936 = await fillForm8936(input, result, f8936Path);
    if (flatten) await flattenForm(doc8936.getForm());
    const outputPath8936 = join(outputDir, "f8936-filled.pdf");
    await savePdf(doc8936, outputPath8936);
    filledForms.push(outputPath8936);
  }

  // ── Form 8839 (if applicable — Qualified Adoption Expenses) ──
  if (result.form8839 && result.form8839.eligible && result.form8839.adoptionCredit.gt(0)) {
    const f8839Path = join(blankFormsDir, "f8839.pdf");
    const doc8839 = await fillForm8839(input, result, f8839Path);
    if (flatten) await flattenForm(doc8839.getForm());
    const outputPath8839 = join(outputDir, "f8839-filled.pdf");
    await savePdf(doc8839, outputPath8839);
    filledForms.push(outputPath8839);
  }

  // ═══ State Forms ═══════════════════════════════════════════════════════════

  // ── IL-1040 (if applicable — Illinois state return) ──
  if (result.stateReturns?.illinois) {
    const il1040Path = join(blankFormsDir, "il-1040.pdf");
    const docIL1040 = await fillIL1040(input, result, il1040Path);
    if (flatten) await flattenForm(docIL1040.getForm());
    const outputPathIL1040 = join(outputDir, "il-1040-filled.pdf");
    await savePdf(docIL1040, outputPathIL1040);
    filledForms.push(outputPathIL1040);
  }

  // ── PA-40 (if applicable — Pennsylvania state return) ──
  if (result.stateReturns?.pennsylvania) {
    const pa40Path = join(blankFormsDir, "pa-40.pdf");
    const docPA40 = await fillPA40(input, result, pa40Path);
    if (flatten) await flattenForm(docPA40.getForm());
    const outputPathPA40 = join(outputDir, "pa-40-filled.pdf");
    await savePdf(docPA40, outputPathPA40);
    filledForms.push(outputPathPA40);

    if (
      hasPAScheduleSP(result.stateReturns.pennsylvania)
      && shouldIncludePAScheduleSPReferenceSummary(result.stateReturns.pennsylvania.scheduleSP)
    ) {
      const outputPathPAScheduleSP = await fillPAScheduleSPReference(
        result.stateReturns.pennsylvania.scheduleSP,
        outputDir,
      );
      filledForms.push(outputPathPAScheduleSP);
    }

    if (
      hasPAScheduleT(result.stateReturns.pennsylvania)
      && shouldIncludePAScheduleTReferenceSummary(result.stateReturns.pennsylvania.scheduleT)
    ) {
      const outputPathPAScheduleT = await fillPAScheduleTReference(
        result.stateReturns.pennsylvania.scheduleT,
        outputDir,
      );
      filledForms.push(outputPathPAScheduleT);
    }

    if (
      hasPAScheduleA(result.stateReturns.pennsylvania)
      && shouldIncludePAScheduleAReferenceSummary(result.stateReturns.pennsylvania.scheduleA)
    ) {
      const outputPathPAScheduleA = await fillPAScheduleAReference(
        result.stateReturns.pennsylvania.scheduleA,
        outputDir,
      );
      filledForms.push(outputPathPAScheduleA);
    }

    if (
      hasPAScheduleB(result.stateReturns.pennsylvania)
      && shouldIncludePAScheduleBReferenceSummary(result.stateReturns.pennsylvania.scheduleB)
    ) {
      const outputPathPAScheduleB = await fillPAScheduleBReference(
        result.stateReturns.pennsylvania.scheduleB,
        outputDir,
      );
      filledForms.push(outputPathPAScheduleB);
    }

    if (
      hasPAScheduleUE(result.stateReturns.pennsylvania)
      && shouldIncludePAScheduleUEReferenceSummary(result.stateReturns.pennsylvania.scheduleUE)
    ) {
      const outputPathPAScheduleUE = await fillPAScheduleUEReference(
        result.stateReturns.pennsylvania.scheduleUE,
        outputDir,
      );
      filledForms.push(outputPathPAScheduleUE);
    }

    if (
      hasPAScheduleE(result.stateReturns.pennsylvania)
      && shouldIncludePAScheduleEReferenceSummary(result.stateReturns.pennsylvania.scheduleE)
    ) {
      const outputPathPAScheduleE = await fillPAScheduleEReference(
        result.stateReturns.pennsylvania.scheduleE,
        outputDir,
      );
      filledForms.push(outputPathPAScheduleE);
    }

    if (input.taxpayer.address.state.toUpperCase() === "PA" && input.scheduleC) {
      const outputPathPAScheduleC = await fillPAScheduleCReference(
        calculatePAScheduleC({
          taxYear: input.taxpayer.taxYear,
          grossReceipts: d(input.scheduleC.grossReceipts),
          returnsAndAllowances: d(input.scheduleC.returnsAndAllowances),
          costOfGoodsSold: d(input.scheduleC.costOfGoodsSold),
          otherIncome: d(input.scheduleC.otherIncome),
          expenses: input.scheduleC.expenses
            ? {
              advertising: d(input.scheduleC.expenses.advertising),
              amortization: d(input.scheduleC.expenses.amortization),
              badDebts: d(input.scheduleC.expenses.badDebts),
              bankCharges: d(input.scheduleC.expenses.bankCharges),
              carAndTruck: d(input.scheduleC.expenses.carAndTruck),
              commissionsAndFees: d(input.scheduleC.expenses.commissionsAndFees),
              contractLabor: d(input.scheduleC.expenses.contractLabor),
              depletion: d(input.scheduleC.expenses.depletion),
              depreciation: d(input.scheduleC.expenses.depreciation),
              duesAndPublications: d(input.scheduleC.expenses.duesAndPublications),
              employeeBenefitPrograms: d(input.scheduleC.expenses.employeeBenefitPrograms),
              businessInterest: d(input.scheduleC.expenses.businessInterest),
              freight: d(input.scheduleC.expenses.freight),
              idcsAmortization: d(input.scheduleC.expenses.idcsAmortization),
              idcsCurrentExpensing: d(input.scheduleC.expenses.idcsCurrentExpensing),
              section179Expense: d(input.scheduleC.expenses.section179Expense),
              insurance: d(input.scheduleC.expenses.insurance),
              laundryAndCleaning: d(input.scheduleC.expenses.laundryAndCleaning),
              legalAndProfessional: d(input.scheduleC.expenses.legalAndProfessional),
              managementFees: d(input.scheduleC.expenses.managementFees),
              officeExpense: d(input.scheduleC.expenses.officeExpense),
              pensionAndProfitSharing: d(input.scheduleC.expenses.pensionAndProfitSharing),
              postage: d(input.scheduleC.expenses.postage),
              rentOnBusinessProperty: d(input.scheduleC.expenses.rentOnBusinessProperty),
              repairsAndMaintenance: d(input.scheduleC.expenses.repairsAndMaintenance),
              startupCostsDirectExpense: d(input.scheduleC.expenses.startupCostsDirectExpense),
              supplies: d(input.scheduleC.expenses.supplies),
              taxes: d(input.scheduleC.expenses.taxes),
              telephone: d(input.scheduleC.expenses.telephone),
              travel: d(input.scheduleC.expenses.travel),
              meals: d(input.scheduleC.expenses.meals),
              utilities: d(input.scheduleC.expenses.utilities),
              wages: d(input.scheduleC.expenses.wages),
              otherExpenses: d(input.scheduleC.expenses.otherExpenses),
            }
            : undefined,
          homeOffice: input.scheduleC.homeOffice
            ? {
              method: input.scheduleC.homeOffice.method,
              squareFeet: input.scheduleC.homeOffice.squareFeet,
              actualAmount: d(input.scheduleC.homeOffice.actualAmount),
              form8829: input.scheduleC.homeOffice.form8829,
            }
            : undefined,
        }),
        outputDir,
      );
      filledForms.push(outputPathPAScheduleC);
    }

    if (
      hasPAScheduleF(result.stateReturns.pennsylvania)
      && shouldIncludePAScheduleFReferenceSummary(result.stateReturns.pennsylvania.scheduleF)
    ) {
      const outputPathPAScheduleF = await fillPAScheduleFReference(
        result.stateReturns.pennsylvania.scheduleF,
        outputDir,
      );
      filledForms.push(outputPathPAScheduleF);
    }

    if (
      hasPAScheduleD(result.stateReturns.pennsylvania)
      && shouldIncludePAScheduleDReferenceSummary(input, result.stateReturns.pennsylvania.scheduleD)
    ) {
      const outputPathPAScheduleD = await fillPAScheduleDReference(
        result.stateReturns.pennsylvania.scheduleD,
        outputDir,
      );
      filledForms.push(outputPathPAScheduleD);
    }

    if (
      input.paNonresidentReturn
      && hasPAScheduleNRH(result.stateReturns.pennsylvania)
      && shouldIncludePAScheduleNRHReferenceSummary(input)
    ) {
      const outputPathPAScheduleNRH = await fillPAScheduleNRHReference(
        input,
        result.stateReturns.pennsylvania.scheduleNRH,
        outputDir,
      );
      filledForms.push(outputPathPAScheduleNRH);
    }

    if (
      hasPAScheduleJ(result.stateReturns.pennsylvania)
      && shouldIncludePAScheduleJReferenceSummary(result.stateReturns.pennsylvania.scheduleJ)
    ) {
      const outputPathPAScheduleJ = await fillPAScheduleJReference(
        result.stateReturns.pennsylvania.scheduleJ,
        outputDir,
      );
      filledForms.push(outputPathPAScheduleJ);
    }

    if (
      hasPAScheduleO(result.stateReturns.pennsylvania)
      && shouldIncludePAScheduleOReferenceSummary(result.stateReturns.pennsylvania.scheduleO)
    ) {
      const outputPathPAScheduleO = await fillPAScheduleOReference(
        result.stateReturns.pennsylvania.scheduleO,
        outputDir,
      );
      filledForms.push(outputPathPAScheduleO);
    }

    if (
      !input.paNonresidentReturn
      && hasPAScheduleDC(result.stateReturns.pennsylvania)
      && shouldIncludePAScheduleDCReferenceSummary(result.stateReturns.pennsylvania.scheduleDC)
    ) {
      const outputPathPAScheduleDC = await fillPAScheduleDCReference(
        result.stateReturns.pennsylvania.scheduleDC,
        outputDir,
      );
      filledForms.push(outputPathPAScheduleDC);
    }

    if (
      !input.paNonresidentReturn
      && shouldIncludePAScheduleGLReferenceSummary(result.stateReturns.pennsylvania.scheduleGL)
    ) {
      const outputPathPAScheduleGL = await fillPAScheduleGLReference(
        result.stateReturns.pennsylvania.scheduleGL,
        outputDir,
      );
      filledForms.push(outputPathPAScheduleGL);
    }

    if (
      hasPAScheduleSD(result.stateReturns.pennsylvania)
      && shouldIncludePAScheduleSDReferenceSummary(result.stateReturns.pennsylvania.scheduleSD)
    ) {
      const outputPathPAScheduleSD = await fillPAScheduleSDReference(
        result.stateReturns.pennsylvania.scheduleSD,
        outputDir,
      );
      filledForms.push(outputPathPAScheduleSD);
    }

    if (hasPALocalEIT(result.stateReturns.pennsylvania)) {
      const outputPathPALocalEIT = await fillPALocalEITReference(
        result.stateReturns.pennsylvania.localEIT,
        outputDir,
      );
      filledForms.push(outputPathPALocalEIT);
    }

    if (
      hasPAREV1630(result.stateReturns.pennsylvania)
      && result.stateReturns.pennsylvania.rev1630.penaltyRequired
      && result.stateReturns.pennsylvania.rev1630.totalInterest.gt(0)
    ) {
      const outputPathPAREV1630 = await fillPAREV1630Reference(
        result.stateReturns.pennsylvania.rev1630,
        outputDir,
      );
      filledForms.push(outputPathPAREV1630);
    }
  }

  // ── NY IT-201 (if applicable — New York state return) ──
  if (result.stateReturns?.newYork) {
    const nyIT201Path = join(blankFormsDir, "ny-it201.pdf");
    const docNYIT201 = await fillNYIT201(input, result, nyIT201Path);
    if (flatten) await flattenForm(docNYIT201.getForm());
    const outputPathNYIT201 = join(outputDir, "ny-it201-filled.pdf");
    await savePdf(docNYIT201, outputPathNYIT201);
    filledForms.push(outputPathNYIT201);
  }

  // ── NJ-1040 (if applicable — New Jersey state return) ──
  if (result.stateReturns?.newJersey) {
    const nj1040Path = join(blankFormsDir, "nj-1040.pdf");
    const docNJ1040 = await fillNJ1040(input, result, nj1040Path);
    if (flatten) await flattenForm(docNJ1040.getForm());
    const outputPathNJ1040 = join(outputDir, "nj-1040-filled.pdf");
    await savePdf(docNJ1040, outputPathNJ1040);
    filledForms.push(outputPathNJ1040);
  }

  for (const path of filledForms) {
    const doc = await loadBlankPdf(path);
    await markReviewPdf(doc);
    await savePdf(doc, path);
  }
  return { filledForms };
}
