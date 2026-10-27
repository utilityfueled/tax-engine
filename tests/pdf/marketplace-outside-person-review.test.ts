// Spec: spec/federal/marketplace-outside-person-health.yaml, review.
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
import { marketplaceOutsidePersonInput } from '../fixtures/marketplace-outside-person';

it('prints original outside cash separately and binds qualification before output', async () => {
  const input = marketplaceOutsidePersonInput(true), result = calculateFederalTax(input), prepared = preparePremiumTaxCreditReview(input);
  const dir = mkdtempSync(join(tmpdir(), 'tax-actual-cash-'));
  try {
    const packet = await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), { blankFormsDir: 'forms/blank/2025', outputDir: dir, flatten: false, premiumTaxCreditReview: prepared });
    const healthPath = packet.filledForms.find(file => /form-7206-/.test(file)), creditPath = packet.filledForms.find(file => file.endsWith('/f8962-filled.pdf'));
    if (!healthPath || !creditPath) throw new Error('Missing actual completed health or credit form');
    const inspect = (path: string): { pages: string[]; fields: Record<string, string> } => JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `
from pypdf import PdfReader
import json,sys
r=PdfReader(sys.argv[1]);print(json.dumps({'pages':[p.extract_text() or '' for p in r.pages],'fields':{k:str(v.get('/V','')) for k,v in (r.get_fields() or {}).items()}}))
`, path], { encoding: 'utf8', timeout: 5000 }));
    const health = inspect(healthPath), credit = inspect(creditPath), text = health.pages.join(' ').replace(/\s+/g, ' ');
    expect([health.fields[H.line1], health.fields[H.line14]]).toEqual(['6600', '6600']);
    expect([credit.fields[P.line24], credit.fields[P.line25], credit.fields[P.line29]]).toEqual(['0', '0', '']);
    expect(text).toContain('ACTUAL CASH WITH ZERO FINAL CREDIT');
    expect(text).toContain('OUTSIDE-TAX-FAMILY CASH');
    expect(text).toContain('Completed other-return Form8962 line24 $0');
    expect(text).toContain('Actual completed outside claimant Form8962');
    expect(text).toContain('outside-person cash $100');
    expect(text).toContain('outside premium pool $625');
    expect(text).toContain('Actual attained age at year end 26');
    expect(text).toContain('actual coverage-family cash $300');
    expect(text).toContain('actual noncoverage-family cash $150');
    expect(text).toContain('original premium $1875');
    expect(text).toContain('owner/business paid $550');
    expect(text).not.toContain('repays all original advances');
    for (const page of [...health.pages, ...credit.pages]) { expect(page).toContain('FOR REVIEW ONLY - NOT FOR FILING'); expect(page).not.toMatch(/123.?45.?6789|987.?65.?4321|234.?56.?7890/); }
    const changed = structuredClone(input); changed.form7206!.plans![0].payments![0].sourceId = 'Changed original receipt';
    await expect(fillForm7206(changed, result, '/missing', 'scheduleC', 'primary', undefined, prepared)).rejects.toThrow(/stale|conflict/);
    const age = structuredClone(input); age.form7206!.persons!.find(row => row.personId === 'outside')!.attainedAgeAtYearEnd = 27;
    await expect(fillForm7206(age, result, '/missing', 'scheduleC', 'primary', undefined, prepared)).rejects.toThrow(/stale|conflict/);
    const otherReturn = structuredClone(input); otherReturn.form7206!.plans![0].coverageFamilySources!.outsidePersonReturns![0].form8962Line24 = '0.01';
    await expect(fillForm7206(redactReviewIdentifiers(otherReturn), redactReviewIdentifiers(result), '/missing', 'scheduleC', 'primary', undefined, prepared)).rejects.toThrow(/stale|conflict/);
    const forged = calculateFederalTax(input); forged.marketplaceActualCashHealth!.months[0].actualSpecifiedCash = d(301);
    await expect(fillForm7206(redactReviewIdentifiers(input), redactReviewIdentifiers(forged), '/missing', 'scheduleC', 'primary', undefined, prepared)).rejects.toThrow(/calculation|reconcile|proof/i);
    const stripped = calculateFederalTax(input); delete stripped.marketplaceActualCashHealth;
    await expect(fillForm7206(redactReviewIdentifiers(input), redactReviewIdentifiers(stripped), '/missing', 'scheduleC', 'primary', undefined, prepared)).rejects.toThrow(/calculation|reconcile|coordination/i);
    const audit = calculateFederalTax(input); audit.allLines.find(row => row.form === 'Marketplace Actual Cash' && row.line === '17')!.value = d(6601);
    await expect(fillForm7206(redactReviewIdentifiers(input), redactReviewIdentifiers(audit), '/missing', 'scheduleC', 'primary', undefined, prepared)).rejects.toThrow(/calculation|reconcile|proof/i);
    const outsideAudit = calculateFederalTax(input);
    for (const rows of [outsideAudit.allLines, outsideAudit.form7206!.lines]) rows.find(row => row.form === 'Pub974 Outside Person')!.value = d(101);
    await expect(fillForm7206(redactReviewIdentifiers(input), redactReviewIdentifiers(outsideAudit), '/missing', 'scheduleC', 'primary', undefined, prepared)).rejects.toThrow(/calculation|reconcile|proof/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it('keeps nonspecified physical values separate from the signed combined transfer', async () => {
  const input = marketplaceOutsidePersonInput(), result = calculateFederalTax(input);
  const prepared = preparePremiumTaxCreditReview(input);
  const doc = await fillForm7206(redactReviewIdentifiers(input), redactReviewIdentifiers(result), 'forms/blank/2025/f7206.pdf', 'scheduleC', 'primary', undefined, prepared);
  expect([doc.getForm().getTextField(H.line1).getText(), doc.getForm().getTextField(H.line14).getText()]).toEqual(['6200', '6200']);
  expect(result.marketplaceHealthInsurance!.specifiedDeduction.toFixed(2)).toBe('-2000.00');
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('4200');
  expect(doc.getForm().getTextField(H.ssn).getText() ?? '').toBe('');
});
