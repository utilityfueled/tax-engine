/** Original filing-unit allocation; no current per-owner carry assignment. */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import type { CharitableSourceRatio } from '@/engine/forms/charitable-filing-unit-history.js';
import { validateCharitableCarryoverSources } from '@/engine/forms/charitable-carryover-source-validation.js';
import { charitableReviewOriginalSourceInput, type PreparedCharitableReview } from '@/pdf/charitable-review-context.js';
import { assertPdfExportAllowed, markReviewPdf } from '@/pdf/export-policy.js';
export const CHARITABLE_FILING_UNIT_REFERENCE_FILENAME = 'charitable-filing-unit-reference-filled.pdf';
const ratio = (value: CharitableSourceRatio): string => `${value.numerator} / ${value.denominator}`;
export function buildCharitableFilingUnitReview(input: TaxYearInput, result: TaxReturnResult, token?: PreparedCharitableReview): string[] {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const original = charitableReviewOriginalSourceInput(input, result, token);
  if (!result.scheduleA) throw new Error('Charitable filing-unit review requires the completed Schedule A candidate');
  const packets = [
    { label: 'Regular', source: original.charitableCarryoverSources },
    { label: 'Alternative', source: original.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory?.alternativeCarryoverSources },
  ].filter(value => value.source?.returnMembership === 'changed_filing_unit');
  if (!packets.length) throw new Error('Charitable filing-unit review requires original ownership sources');
  const rows = [
    `Tax year ${result.taxYear}. Original charitable filing-unit history.`,
    'Original contribution years and actual filed use are retained. Ownership allocation does not create another deduction or a new contribution year.',
    `Selected deduction method: ${result.deductionUsed}. Schedule A candidate charity: $${result.scheduleA.charitableTotal.toFixed()}`,
    `Selected charitable carryforward: $${result.carryforwards.charitableContributions.toFixed()}`,
    'Exact ratios below preserve ownership before the ordinary calculation. A current joint remainder is pooled; no current closing balance is assigned to individual owners.',
  ];
  for (const { label, source } of packets) {
    const records = validateCharitableCarryoverSources({ ...original, charitableCarryoverSources: source, priorYear: undefined });
    const timeline = source!.filingUnitHistory!, personIds = timeline.persons!.map(row => row.sourceId!).sort();
    const people = (ids: string[]) => ids.map(id => `Person ${personIds.indexOf(id) + 1}`).join(' and ');
    rows.push(`${label} original filing-unit sources. All relevant filed returns and original carryovers were source-confirmed.`);
    for (const [groupIndex, group] of records.entries()) {
      rows.push(`Current category pool ${groupIndex + 1}: ${group.category}; ${group.medium}; original year ${group.taxYear}; available $${group.amount.toFixed()}`);
      for (const [sourceIndex, calculated] of (group.filingUnitSources ?? []).entries()) {
        const vintage = source!.vintages!.find(row => row.sourceId === calculated.sourceId)!;
        rows.push(`Original source ${sourceIndex + 1}. Original contribution year: ${calculated.contributionYear}`,
          `Original excess: $${vintage.originalExcess}; original NOL reduction: $${vintage.originNolReduction}`);
        for (const computation of vintage.filingUnitOrigin?.separateComputations ?? []) rows.push(
          `${people([computation.personId!])}. Original separate excess: $${computation.originalExcess}; original separate NOL reduction: $${computation.originNolReduction}`);
        rows.push(`Current opening: ${ratio(calculated.openingBalance)}; excluded ownership: ${ratio(calculated.excludedBalance)}`);
        for (const step of calculated.steps) {
          const title = { original: 'Original filed excess', first_split: 'First separate allocation', outside_current_history: 'Outside current ownership', filed_use: 'Actual filed use', current_pool: 'Current opening pool' }[step.action];
          rows.push(`${step.taxYear}: ${title}; ${people(step.personIds)}. Opening ${ratio(step.opening)}; treated as paid $${step.treatedAsPaid}; NOL reduction $${step.nolReduction}; closing ${ratio(step.closing)}`);
        }
      }
    }
  }
  return rows;
}
export async function fillCharitableFilingUnitReview(input: TaxYearInput, result: TaxReturnResult, token?: PreparedCharitableReview): Promise<PDFDocument> {
  const rows = buildCharitableFilingUnitReview(input, result, token), doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([612, 792]), y = 708, number = 1;
  const header = () => {
    page.drawText('Charitable filing-unit history', { x: 42, y: 750, size: 15, font: bold });
    page.drawText(`Review appendix - page ${number}`, { x: 42, y: 732, size: 9, font, color: rgb(.35, .35, .35) }); y = 708;
  };
  const write = (line: string) => {
    if (y < 66) { page = doc.addPage([612, 792]); number++; header(); }
    page.drawText(line, { x: 42, y, size: 9.5, font }); y -= 14;
  };
  header();
  for (const row of rows) {
    let line = '';
    for (const word of row.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, 9.5) <= 528) { line = next; continue; }
      if (line) { write(line); line = ''; }
      // Exact source numerators may exceed a line; split the displayed text,
      // never round or alter the retained ratio to fit the page.
      for (const character of word) {
        if (font.widthOfTextAtSize(line + character, 9.5) > 528) { write(line); line = ''; }
        line += character;
      }
    }
    if (line) write(line); y -= 5;
  }
  await markReviewPdf(doc);
  return doc;
}
