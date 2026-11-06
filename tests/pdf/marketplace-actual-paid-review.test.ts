// Spec: spec/federal/marketplace-actual-paid-repayment.yaml, review.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { fillForm7206, FORM_7206_FIELDS as H } from '@/pdf/fill-form-7206';
import { FORM_8962_FIELDS as P } from '@/pdf/fill-form-8962';
import { fillReturn } from '@/pdf/fill-return';
import { preparePremiumTaxCreditReview } from '@/pdf/premium-tax-credit-review-context';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { d } from '@/utils/decimal';
import { actualPaidRepaymentInput } from '../fixtures/marketplace-actual-paid-repayment';

it('prints actual payer repayment with private source and result binding', async () => {
  const input = actualPaidRepaymentInput(true, '1000.49'), result = calculateFederalTax(input), prepared = preparePremiumTaxCreditReview(input);
  const dir = mkdtempSync(join(tmpdir(), 'tax-actual-paid-review-'));
  try {
    const packet = await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), { blankFormsDir: 'forms/blank/2025', outputDir: dir, flatten: false, premiumTaxCreditReview: prepared });
    const healthPath = packet.filledForms.find(file => /form-7206-/.test(file)), creditPath = packet.filledForms.find(file => file.endsWith('/f8962-filled.pdf'));
    if (!healthPath || !creditPath) throw new Error('Missing actual health or credit form');
    const inspect = (path: string): { pages: string[]; fields: Record<string, string> } => JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `
from pypdf import PdfReader
import json,sys
r=PdfReader(sys.argv[1]);print(json.dumps({'pages':[p.extract_text() or '' for p in r.pages],'fields':{k:str(v.get('/V','')) for k,v in (r.get_fields() or {}).items()}}))
`, path], { encoding: 'utf8', timeout: 5000 }));
    const health = inspect(healthPath), credit = inspect(creditPath), text = health.pages.join(' ').replace(/\s+/g, ' ');
    expect([health.fields[H.line1], health.fields[H.line14]]).toEqual(['15600', '15600']);
    expect([credit.fields[P.line24], credit.fields[P.line25], credit.fields[P.line29]]).toEqual(['0', '12000', '12000']);
    expect(text).toContain('ACTUAL PAYER CASH AND OWN-RETURN REPAYMENT');
    expect(text).toContain('All original policy advances $24011.76');
    expect(text).toContain('Exact own-return advances $12005.88');
    expect(text).toContain('unpaid source remainder $5.88');
    expect(text).toContain('actual paid cost $15600');
    expect(text).toContain('actual specified cash $250');
    expect(text).toContain('nonspecified advance $400');
    for (const page of [...health.pages, ...credit.pages]) { expect(page).toContain('FOR REVIEW ONLY - NOT FOR FILING'); expect(page).not.toMatch(/123.?45.?6789|987.?65.?4321|234.?56.?7890/); }
    const changed = structuredClone(input); changed.form7206!.plans![0].payments![0].sourceId = 'Changed original payer receipt';
    await expect(fillForm7206(changed, result, '/missing', 'scheduleC', 'primary', undefined, prepared)).rejects.toThrow(/stale|conflict/);
    const forged = calculateFederalTax(input); forged.marketplaceActualPaidRepaymentHealth!.reportedPayment!.eligiblePremiums = d(18000);
    await expect(fillForm7206(redactReviewIdentifiers(input), redactReviewIdentifiers(forged), '/missing', 'scheduleC', 'primary', undefined, prepared)).rejects.toThrow(/calculation|reconcile|proof/i);
    const stripped = calculateFederalTax(input); delete stripped.marketplaceActualPaidRepaymentHealth;
    await expect(fillForm7206(redactReviewIdentifiers(input), redactReviewIdentifiers(stripped), '/missing', 'scheduleC', 'primary', undefined, prepared)).rejects.toThrow(/calculation|reconcile|coordination/i);
    const audit = calculateFederalTax(input); audit.allLines.find(row => row.form === 'Marketplace Actual Paid Repayment' && row.line === 'own')!.value = d(0);
    await expect(fillForm7206(redactReviewIdentifiers(input), redactReviewIdentifiers(audit), '/missing', 'scheduleC', 'primary', undefined, prepared)).rejects.toThrow(/calculation|reconcile|proof/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
