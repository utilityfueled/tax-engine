// Spec: spec/federal/marketplace-health-business-gross-sources.yaml.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillForm7206, FORM_7206_FIELDS as F } from '@/pdf/fill-form-7206.js';
import { hasPremiumTaxCreditReviewSources, preparePremiumTaxCreditReview } from '@/pdf/premium-tax-credit-review-context.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { partnershipHealthNegativeLimitInput } from '../fixtures/marketplace-health-negative-limit.js';

it('retains actual gross attachments in private context and printed source review', async () => {
  const input = partnershipHealthNegativeLimitInput(), original = JSON.stringify(input), result = calculateFederalTax(input);
  expect(hasPremiumTaxCreditReviewSources(input)).toBe(true);
  const context = preparePremiumTaxCreditReview(input), redacted = redactReviewIdentifiers(input);
  const dir = mkdtempSync(join(tmpdir(), 'health-gross-review-'));
  try {
    const doc = await fillForm7206(redacted, result, 'forms/blank/2025/f7206.pdf', 'scheduleK1:0', 'primary', undefined, context);
    const bytes = await doc.save(), reopened = await PDFDocument.load(bytes);
    expect(reopened.getForm().getTextField(F.line14).getText()).toBe('0');
    expect(reopened.getForm().getTextField(F.ssn).getText() ?? '').toBe('');
    const path = join(dir, 'partnership.pdf'); writeFileSync(path, bytes);
    const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', "from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", path], { encoding: 'utf8', timeout: 5000 }));
    const text = pages.join(' ').replace(/\s+/g, ' ');
    for (const value of ['Original partnership gross-income statement', 'scheduleK1:0', '$10000', 'scheduleK1:1', '$40000', '929.32', '3717.28', '$-1353.4', 'transfer: $4647']) expect(text).toContain(value);
    for (const page of pages) {
      expect(page.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      expect(page).not.toMatch(/123.?45.?6789|6789/);
    }
    const altered = structuredClone(input);
    for (const row of altered.form7206!.partnershipGrossIncomeSources!.statements!) row.grossIncome = row.businessSourceId === 'scheduleK1:0' ? '20000' : '80000';
    const changed = calculateFederalTax(altered);
    expect(changed.agi.toFixed()).toBe(result.agi.toFixed());
    await expect(fillForm7206(redactReviewIdentifiers(altered), changed, '/does-not-exist.pdf', 'scheduleK1:0', 'primary', undefined, context)).rejects.toThrow(/stale|conflict|original/i);
    await expect(fillForm7206(redacted, result, '/does-not-exist.pdf', 'scheduleK1:0', 'primary', undefined, {} as typeof context)).rejects.toThrow(/context/i);
    expect(JSON.stringify(input)).toBe(original);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
