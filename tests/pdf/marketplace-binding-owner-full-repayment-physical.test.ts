// Spec: spec/federal/marketplace-binding-owner-full-repayment.yaml, physical-review.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { FORM_7206_FIELDS as H } from '@/pdf/fill-form-7206.js';
import { FORM_8962_FIELDS as P } from '@/pdf/fill-form-8962.js';
import { preparePremiumTaxCreditReview } from '@/pdf/premium-tax-credit-review-context.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { bindingOwnerFullRepaymentInput } from '../fixtures/marketplace-binding-owner-full-repayment.js';

it('saves both actual owner7206 forms and the full-repayment8962 review form', async () => {
  const retained = process.env.TAX_ENGINE_HEALTH_BINDING_ARTIFACT_DIR;
  const dir = retained ? join(retained, 'primary-binding') : mkdtempSync(join(tmpdir(), 'tax-binding-full-repayment-'));
  if (retained) mkdirSync(dir, { recursive: false, mode: 0o700 });
  try {
    const input = bindingOwnerFullRepaymentInput();
    // Original facts are written before the first calculation, including in RED.
    writeFileSync(join(dir, 'originals.json'), JSON.stringify(input, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    const result = calculateFederalTax(input), prepared = preparePremiumTaxCreditReview(input);
    writeFileSync(join(dir, 'canonical-result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    const packet = await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), {
      blankFormsDir: 'forms/blank/2025', outputDir: dir, flatten: false, premiumTaxCreditReview: prepared,
    });
    writeFileSync(join(dir, 'packet.json'), JSON.stringify(packet, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    const healthPaths = packet.filledForms.filter(path => /form-7206-/.test(path));
    expect(healthPaths).toHaveLength(2);
    for (const path of healthPaths) {
      const form = (await PDFDocument.load(readFileSync(path))).getForm();
      const actual = [H.line1, H.line13, H.line14].map(field => form.getTextField(field).getText());
      expect(actual).toEqual(basename(path).startsWith('form-7206-primary-') ? ['6000', '929', '929'] : ['3000', '148696', '3000']);
      expect(form.getTextField(H.ssn).getText() ?? '').toBe('');
    }
    const credit = packet.filledForms.find(path => path.endsWith('/f8962-filled.pdf'));
    expect(credit, 'actual completed full-repayment Form8962 must be in the saved packet').toBeDefined();
    if (!credit) throw new Error('Missing physical actual Form8962');
    const form = (await PDFDocument.load(readFileSync(credit))).getForm();
    expect([P.line24, P.line25, P.line29].map(field => form.getTextField(field).getText())).toEqual(['0', '9000', '9000']);
    expect(form.getTextField(P.ssn).getText() ?? '').toBe('');
  } finally { if (!retained) rmSync(dir, { recursive: true, force: true }); }
});
