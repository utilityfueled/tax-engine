// Spec: spec/federal/shared-unshared-marketplace-health.yaml.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { fillForm7206 } from '@/pdf/fill-form-7206';
import { FORM_8962_FIELDS as P } from '@/pdf/fill-form-8962';
import { fillReturn } from '@/pdf/fill-return';
import { preparePremiumTaxCreditReview } from '@/pdf/premium-tax-credit-review-context';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { sharedUnsharedHealthInput } from '../fixtures/shared-unshared-marketplace-health';

it('prints combined source amounts with original private context', async () => {
  const input = sharedUnsharedHealthInput(), result = calculateFederalTax(input), prepared = preparePremiumTaxCreditReview(input);
  const dir = mkdtempSync(join(tmpdir(), 'tax-shared-unshared-health-'));
  try {
    const packet = await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), { blankFormsDir: 'forms/blank/2025', outputDir: dir, flatten: false, premiumTaxCreditReview: prepared });
    const healthPath = packet.filledForms.find(file => /form-7206-/.test(file)), creditPath = packet.filledForms.find(file => file.endsWith('/f8962-filled.pdf'));
    if (!healthPath || !creditPath) throw new Error('Missing actual health/credit forms');
    const inspect = (path: string): { pages: string[]; fields: Record<string, string> } => JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `
from pypdf import PdfReader
import json,sys
r=PdfReader(sys.argv[1]);print(json.dumps({'pages':[p.extract_text() or '' for p in r.pages],'fields':{k:str(v.get('/V','')) for k,v in (r.get_fields() or {}).items()}}))
`, path], { encoding: 'utf8', timeout: 5000 }));
    const health = inspect(healthPath), credit = inspect(creditPath), text = health.pages.join(' ');
    expect([credit.fields[P.line24], credit.fields[P.line25], credit.fields[P.line26], credit.fields[P.line29]]).toEqual(['5844', '4200', '1644', '']);
    expect(P.allocations[0].slice(4).map(field => credit.fields[field])).toEqual(['0.50', '0.50', '0.50']);
    expect(P.allocations[1].map(field => credit.fields[field])).toEqual(Array(P.allocations[1].length).fill(''));
    for (const value of ['original premium $1200', 'owner/business paid $350', 'other persons paid $200', 'actual advance credit $650', 'original policy 1, month 1: premium $500; advances $300', 'original policy 2, month 1: premium $200; advances $50', 'Step 2 credit: $6348', 'Final Form 8962 credit: $5844', 'Schedule 1 line 17 transfer: $2052']) expect(text).toContain(value);
    for (const page of [...health.pages, ...credit.pages]) { expect(page).toContain('FOR REVIEW ONLY - NOT FOR FILING'); expect(page).not.toMatch(/123.?45.?6789|234.?56.?7890/); }
    const changed = structuredClone(input); changed.form1095A[1].monthlyPremiums[0].enrolleePremium = '200.01';
    await expect(fillForm7206(changed, result, '/missing', 'scheduleC', 'primary', undefined, prepared)).rejects.toThrow(/stale|conflict/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
