/** Spec: qof-deferred-gain-inclusion.yaml review. Reference only, not Form 8997. */
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { calculateQofInclusion } from '@/engine/forms/qof-inclusion.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import { markReviewPdf } from '../../export-policy.js';
import { savePdf } from '../../pdf-utils.js';

const PAGE_WIDTH = 612, PAGE_HEIGHT = 792, MARGIN = 40, LINE = 15;
export const FORM_8997_REFERENCE_FILENAME = 'f8997-reference-filled.pdf';

export function buildForm8997ReferenceSummary(input: TaxYearInput, result: TaxReturnResult) {
  const source = calculateQofInclusion(input), retained = result.qofInclusion;
  if (!source || !retained || source.rows.length !== retained.rows.length) throw new Error('Form8997 reference requires the actual QOF inclusion calculation');
  const rows = source.rows.map((row, index) => {
    const saved = retained.rows[index]!;
    if (saved.sourceId !== row.sourceId || saved.qofEin !== row.qofEin || saved.description !== row.description || saved.eventDate !== row.eventDate
      || saved.gainCharacter !== row.gainCharacter || !saved.includedGain.eq(row.includedGain) || !saved.basisIncrease.eq(row.basisIncrease)
      || !saved.remainingDeferredGain.eq(row.remainingDeferredGain)) {
      throw new Error('Form8997 reference amounts do not reconcile with the original QOF records');
    }
    return { label: `QOF EIN ${row.qofEin}; ${row.eventDate}; ${row.description}`,
      value: row.gainCharacter === 'short_term' ? `Short-term included ${row.includedGain.toFixed()}` : `Long-term included ${row.includedGain.toFixed()}`,
      basisIncrease: row.basisIncrease.toFixed(), remaining: row.remainingDeferredGain.toFixed() };
  });
  if (!retained.shortTermIncludedGain.eq(source.shortTermIncludedGain) || !retained.longTermIncludedGain.eq(source.longTermIncludedGain)) {
    throw new Error('Form8997 reference amounts do not reconcile with the original QOF records');
  }
  return { rows, shortTerm: source.shortTermIncludedGain.toFixed(), longTerm: source.longTermIncludedGain.toFixed() };
}

export async function fillForm8997Reference(input: TaxYearInput, result: TaxReturnResult, outputDir: string): Promise<string> {
  const summary = buildForm8997ReferenceSummary(input, result), doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold), regular = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), y = PAGE_HEIGHT - MARGIN;
  const write = (text: string, font = regular, size = 10) => {
    if (y < MARGIN + 30) { page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]); y = PAGE_HEIGHT - MARGIN; }
    page.drawText(text, { x: MARGIN, y, size, font }); y -= LINE;
  };
  write('Form 8997 Part III Inclusion Reference', bold, 16); y -= 6;
  write('Reference only. This is not Form 8997, which must still be completed for a filed return.');
  y -= 6;
  for (const row of summary.rows) {
    write(row.label, bold);
    write(`Remaining deferred gain before inclusion: ${row.remaining}`);
    write(`Section 1400Z-2(b)(2)(B) basis increase: ${row.basisIncrease}`);
    write(row.value); y -= 6;
  }
  write(`Total short-term previously deferred gain included: ${summary.shortTerm}`, bold);
  write(`Total long-term previously deferred gain included: ${summary.longTerm}`, bold);
  await markReviewPdf(doc);
  const path = join(outputDir, FORM_8997_REFERENCE_FILENAME);
  await savePdf(doc, path);
  return path;
}
