// Source: spec/federal/form-4952-child-sources.yaml, review.
import { execFileSync } from 'node:child_process';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillForm4952, FORM_4952_FIELDS as F } from '@/pdf/fill-form-4952.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { syntheticChildInvestmentInput } from '../fixtures/child-investment-interest.js';

describe('Child investment sources in the review form', () => {
  it('reopens the verified child investment deduction with identifiers redacted', async () => {
    const input = syntheticChildInvestmentInput();
    const result = calculateFederalTax(input);
    const document = await fillForm4952(redactReviewIdentifiers(input), redactReviewIdentifiers(result), 'forms/blank/2025/f4952.pdf');
    const bytes = await document.save();
    const reopened = await PDFDocument.load(bytes);
    const expected = { line1: '5000', line2: '0', line3: '5000', line4a: '2200', line4b: '0', line4c: '2200',
      line4d: '0', line4e: '0', line4f: '0', line4g: '0', line4h: '2200', line5: '0', line6: '2200', line7: '2800', line8: '2200' } as const;
    for (const [key, value] of Object.entries(expected)) {
      expect(reopened.getForm().getTextField(F[key as keyof typeof expected]).getText(), key).toBe(value);
    }
    expect(reopened.getForm().getTextField(F.ssn).getText() ?? '').toBe('');
    expect(reopened.getSubject()).toBe(REVIEW_PDF_NOTICE);
    const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      "import sys,json,io; from pypdf import PdfReader; print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
    { input: Buffer.from(bytes), encoding: 'utf8' })) as string[];
    for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
    const text = pages.join(' ');
    expect(text).toContain('filing qualification pending');
    expect(text).not.toContain(input.taxpayer.primary.ssn.replace(/\D/g, ''));
    expect(text).not.toContain(input.form4952.childIncomeSources.sourceReference);
    expect(text).not.toContain(input.form4952.childIncomeSources.children[0].sourceReference);
  });
});
