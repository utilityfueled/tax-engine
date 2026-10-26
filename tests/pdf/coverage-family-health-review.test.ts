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
import { d } from '@/utils/decimal';
import { coverageFamilyHealthInput } from '../fixtures/coverage-family-health';

// Spec: spec/federal/marketplace-coverage-family-health.yaml, review.
it('prints signed family coordination with original private sources and rejects stale ledgers', async () => {
  const { input } = coverageFamilyHealthInput(); input.scheduleC!.grossReceipts = '40000';
  const result = calculateFederalTax(input), prepared = preparePremiumTaxCreditReview(input);
  const dir = mkdtempSync(join(tmpdir(), 'tax-coverage-family-health-'));
  try {
    const packet = await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), { blankFormsDir: 'forms/blank/2025', outputDir: dir, flatten: false, premiumTaxCreditReview: prepared });
    const healthPath = packet.filledForms.find(file => /form-7206-/.test(file)), creditPath = packet.filledForms.find(file => file.endsWith('/f8962-filled.pdf'));
    if (!healthPath || !creditPath) throw new Error(`Missing actual family health/credit forms: ${JSON.stringify(packet)}`);
    const inspect = (path: string): { pages: string[]; fields: Record<string, string> } => JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `
from pypdf import PdfReader
import json,sys
r=PdfReader(sys.argv[1]);print(json.dumps({'pages':[p.extract_text() or '' for p in r.pages],'fields':{k:str(v.get('/V','')) for k,v in (r.get_fields() or {}).items()}}))
`, path], { encoding: 'utf8', timeout: 5000 }));
    const health = inspect(healthPath), credit = inspect(creditPath), text = health.pages.join(' ');
    // Final AGI34174 / FPL20440 ->167%; 0.0068 contribution rounds232.
    // Step2 credit remains12000; final credit is12000-232=11768.
    expect([credit.fields[P.line24], credit.fields[P.line25], credit.fields[P.line26]]).toEqual(['11768', '6000', '5768']);
    for (const value of ['original premium $1250', 'owner/business paid $750', 'actual advance credit $500', 'coverage-family SLCSP $1000', 'noncoverage-family SLCSP $500', 'Specified deduction $-2000', 'nonspecified deduction $5000', 'Schedule 1 line 17 transfer: $3000']) expect(text).toContain(value);
    for (const page of [...health.pages, ...credit.pages]) { expect(page).toContain('FOR REVIEW ONLY - NOT FOR FILING'); expect(page).not.toMatch(/123.?45.?6789|987.?65.?4321/); }
    const changed = structuredClone(input); changed.form7206!.plans![0].coverageFamilySources!.months![0].nonCoverageFamilySlcsp = '500.01';
    await expect(fillForm7206(changed, result, '/missing', 'scheduleC', 'primary', undefined, prepared)).rejects.toThrow(/stale|conflict/);
    const removed = structuredClone(input); delete removed.form7206!.plans![0].coverageFamilySources;
    await expect(fillForm7206(removed, result, '/missing', 'scheduleC', 'primary', undefined, prepared)).rejects.toThrow(/source|coverage|stale|conflict/i);
    const forged = calculateFederalTax(input);
    forged.form7206!.coverageFamilyAllocations![0].specifiedPremium = forged.form7206!.coverageFamilyAllocations![0].specifiedPremium.plus(d('.01'));
    forged.form7206!.coverageFamilyAllocations![0].nonspecifiedPremium = forged.form7206!.coverageFamilyAllocations![0].nonspecifiedPremium.minus(d('.01'));
    await expect(fillForm7206(redactReviewIdentifiers(input), redactReviewIdentifiers(forged), '/missing', 'scheduleC', 'primary', undefined, prepared)).rejects.toThrow(/source|allocation|calculation|reconcile/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
