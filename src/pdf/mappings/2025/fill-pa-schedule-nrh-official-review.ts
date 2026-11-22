import { readFile } from 'node:fs/promises';
import { PDFDocument, PDFName, StandardFonts, TextAlignment } from 'pdf-lib';
import { markReviewPdf } from '@/pdf/export-policy.js';
import type { PAScheduleNRHReviewFacts } from '@/pdf/pa-schedule-nrh-review-facts.js';
import { assertReviewTemplateBytes } from '@/pdf/template-registry.js';

export const PA_SCHEDULE_NRH_TEMPLATE = 'pa-schedule-nrh.pdf';

/** Reproduce only the official standing form's first page as a static review. */
export async function fillPAScheduleNRHOfficialReview(
  facts: PAScheduleNRHReviewFacts,
  templatePath: string,
): Promise<PDFDocument> {
  const bytes = await readFile(templatePath);
  assertReviewTemplateBytes(PA_SCHEDULE_NRH_TEMPLATE, bytes, 2025);
  const source = await PDFDocument.load(bytes);
  const form = source.getForm();
  // The seven-digit combs have a preprinted decimal after the first digit.
  const fraction = facts.fraction.replace('.', '');
  const values: Record<string, string> = {
    YEAR: '25',
    'A-1. Total number of days in the tax year': String(facts.calendarDays),
    'A-2a. Saturdays, Sundays and holidays': String(facts.weekendsAndHolidays),
    'A-2b. Sick, illness or disability days': String(facts.illnessAndDisability),
    'A-2c. Vacation or leave days': String(facts.vacationAndLeave),
    'A-2. Total number of nonworking days': String(facts.nonworkingDays),
    'A-3. Total number of days worked in the tax year': String(facts.workingDays),
    'A-4. Total number of days worked within Pennsylvania during the tax year': String(facts.paWorkingDays),
    'A-5. Working days apportionment fraction': fraction,
    'C-9. Gross taxable compensation from Form W-2 or pay stubs': facts.grossCompensation,
    'C-10. Working days apportionment percentage from Line 5 in Section A above': fraction,
    'C-12. Apportioned PA gross taxable compensation': facts.apportionedCompensation,
    'E-18. Apportioned PA gross taxable compensation from Section C, Line 12 above': facts.apportionedCompensation,
    'E-20. Total PA gross taxable compensation': facts.apportionedCompensation,
    'E-22. Net taxable/apportioned PA gross taxable compensation': facts.apportionedCompensation,
  };
  const pageOne = source.getPage(0);
  pageOne.node.delete(PDFName.of('Annots'));
  pageOne.node.delete(PDFName.of('AA'));
  const doc = await PDFDocument.create();
  const [page] = await doc.copyPages(source, [0]);
  doc.addPage(page);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const [name, value] of Object.entries(values)) {
    const field = form.getTextField(name);
    const [widget] = field.acroField.getWidgets();
    const maxLength = field.getMaxLength();
    if (!widget || maxLength === undefined || value.length > maxLength) {
      throw new Error('PA Schedule NRH actual value does not fit its official field: ' + name);
    }
    const { x, y, width, height } = widget.getRectangle();
    const size = 10, baseline = y + (height - font.heightAtSize(size, { descender: false })) / 2;
    if (field.isCombed()) {
      const cellWidth = width / maxLength;
      [...value].forEach((digit, index) => {
        const digitWidth = font.widthOfTextAtSize(digit, size);
        if (digitWidth >= cellWidth) throw new Error('PA Schedule NRH digit does not fit its official comb: ' + name);
        page.drawText(digit, { x: x + cellWidth * (index + 0.5) - digitWidth / 2, y: baseline, size, font });
      });
    } else {
      const textWidth = font.widthOfTextAtSize(value, size);
      if (textWidth > width - 4) throw new Error('PA Schedule NRH actual value does not fit its official field: ' + name);
      const left = field.getAlignment() === TextAlignment.Right ? x + width - textWidth - 2 : x + 2;
      page.drawText(value, { x: left, y: baseline, size, font });
    }
  }
  doc.setTitle('Pennsylvania 2025 Schedule NRH review');
  await markReviewPdf(doc);
  return doc;
}
