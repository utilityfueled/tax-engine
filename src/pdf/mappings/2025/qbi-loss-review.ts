/** Original-source loss characterization record; spec/qbi-loss-review.yaml. */
import Decimal from 'decimal.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import { calculateK1QbiLossReturn } from '@/engine/forms/k1-qbi-loss-return.js';
import { qbiLossReviewOriginalSourceInput, type PreparedQbiLossReview } from '@/pdf/qbi-loss-review-context.js';
import { assertPdfExportAllowed, markReviewPdf } from '@/pdf/export-policy.js';

export const QBI_LOSS_REFERENCE_FILENAME = 'qbi-loss-reference-filled.pdf';
function amount(value: Decimal | undefined): string {
  if (!Decimal.isDecimal(value) || !value.isFinite()) throw new Error('QBI review requires complete finite calculated amounts');
  return value.toFixed();
}
export function buildQbiLossReview(input: TaxYearInput, result: TaxReturnResult, context?: PreparedQbiLossReview): string[] {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const original = qbiLossReviewOriginalSourceInput(input, result, context);
  const rows = [
    `Tax year ${result.taxYear}. Source-bound loss history for review.`,
    'These are separate balances and limitations. Do not add them as current deductions.',
    `Ordinary QBI loss carryforward: $${amount(result.carryforwards.qbiLossCarryforward)}`,
    original.netOperatingLoss
      ? `Regular NOL carryforward: $${amount(result.carryforwards.nolCarryforward)}`
      : 'Independent regular NOL source history was not supplied.',
    result.carryforwards.alternativeTaxNolCarryforward !== undefined || result.netOperatingLoss
      ? `Independent AMT NOL carryforward: $${amount(result.carryforwards.alternativeTaxNolCarryforward ?? result.netOperatingLoss?.alternativeTax.carryforward)}`
      : 'Independent AMT NOL source history was not supplied.',
  ];
  if (result.form461?.nolCarryforward.gt(0)) rows.push(`Current section461 regular NOL origin: $${amount(result.form461.nolCarryforward)}`);
  if (original.qbiLossSources?.activities?.length) {
    if (!result.scheduleE || !result.form8582 || !result.form461) throw new Error('QBI review requires completed original loss limitation results');
    const completed = calculateK1QbiLossReturn(original, { scheduleE: result.scheduleE, form8582: result.form8582, form461: result.form461 });
    for (const activity of completed.activities) {
      const source = original.scheduleK1[activity.k1Index];
      rows.push(`Activity ${activity.k1Index + 1}, ${activity.accountHolder === 'primary' ? 'primary taxpayer' : 'spouse'}`,
        `Original ordinary income or loss: $${source.ordinaryIncome}`,
        `Original section199A QBI: $${source.section199AQBI}`,
        `Current QBI after loss limits: $${amount(activity.currentQbi)}`,
        `Prior qualified loss allowed after all limits: $${amount(activity.priorQualifiedLoss)}`);
      for (const stage of activity.stages) {
        if (stage.lines.some(line => line.form === 'QBI Successive Limit')) rows.push(
          'The incoming469 pool includes current deductions and released prior465 deductions. Its new suspension year is the current year; original465 character and history remain separate.',
        );
        rows.push(`${stage.limitation}: current source loss $${amount(stage.sourceCurrentLoss)}; qualified source loss $${amount(stage.sourceCurrentQualifiedLoss)}`,
          `${stage.limitation}: current loss allowed $${amount(stage.currentAllowedLoss)}; qualified current loss allowed $${amount(stage.currentQualifiedLossAllowed)}`,
          `${stage.limitation}: prior loss allowed $${amount(stage.priorLossAllowed)}; qualified prior loss allowed $${amount(stage.priorQualifiedLossAllowed)}`);
        for (const vintage of stage.allowedPriorVintages) rows.push(`${stage.limitation}, origin ${vintage.taxYear}: prior loss used $${amount(vintage.lossAllowed)}; qualified used $${amount(vintage.qualifiedLossAllowed)}`);
      }
      for (const carry of result.carryforwards.qbiSuspendedLosses?.filter(row => row.sourceId === activity.sourceId && row.accountHolder === activity.accountHolder) ?? []) {
        for (const vintage of carry.vintages) rows.push(`${carry.limitation}, origin ${vintage.taxYear}: suspended $${amount(vintage.remainingLoss)}; qualified $${amount(vintage.qualifiedRemainingLoss)}`);
      }
      if (activity.excessBusinessLossVintage) rows.push('The new461 suspended character is part of its regular NOL origin; it is not a second ordinary QBI loss carry.');
    }
  }
  for (const [index, vintage] of (result.qbiEblNol?.vintages ?? []).entries()) {
    if (!result.qbiEblNol?.calculationComplete) throw new Error('QBI review requires the completed actual regular EBL deduction');
    rows.push(`Historical EBL ${index + 1}, origin ${vintage.lossTaxYear}, ${vintage.accountHolder === 'primary' ? 'primary taxpayer' : 'spouse'}`,
      `Original regular loss: $${amount(vintage.originalLoss)}; original qualified loss: $${amount(vintage.originalQualifiedLoss)}`,
      `Opening regular carry: $${amount(vintage.openingCarryforward)}; qualified opening carry: $${amount(vintage.qualifiedOpeningCarryforward)}`,
      `Actual regular NOL deduction: $${amount(vintage.deduction)}; qualified current deduction: $${amount(vintage.qualifiedDeduction)}`,
      `Modified absorption: $${amount(vintage.absorbed)}; qualified absorption: $${amount(vintage.qualifiedAbsorbed)}`,
      `COD attribute reduction: $${amount(vintage.attributeReduction)}; qualified reduction: $${amount(vintage.qualifiedAttributeReduction)}`,
      `Expired: $${amount(vintage.expired)}; qualified expired: $${amount(vintage.qualifiedExpired)}`,
      `Remaining regular carry: $${amount(vintage.remainingCarryforward)}; qualified remaining carry: $${amount(vintage.qualifiedRemainingCarryforward)}`);
  }
  return rows;
}
export async function fillQbiLossReview(input: TaxYearInput, result: TaxReturnResult, context?: PreparedQbiLossReview): Promise<PDFDocument> {
  const rows = buildQbiLossReview(input, result, context), doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([612, 792]), y = 720, number = 1;
  const header = () => {
    page.drawText('QBI loss sources and carryforwards', { x: 42, y: 750, size: 15, font: bold });
    page.drawText(`Review appendix - page ${number}`, { x: 42, y: 732, size: 9, font, color: rgb(.35, .35, .35) });
    y = 708;
  };
  header();
  for (const row of rows) {
    // All strings are static labels, enums, validated years or exact decimals.
    // Source references and identifiers are intentionally absent from this API.
    let line = '';
    const write = () => {
      if (y < 66) { page = doc.addPage([612, 792]); number++; header(); }
      page.drawText(line, { x: 42, y, size: 9.5, font }); y -= 14;
    };
    for (const word of row.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, 9.5) > 528 && line) { write(); line = word; } else line = next;
    }
    if (line) write();
    y -= 5;
  }
  await markReviewPdf(doc);
  return doc;
}
