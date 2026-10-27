// Spec: spec/federal/marketplace-shared-marriage-health.yaml.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { fillForm7206 } from '@/pdf/fill-form-7206';
import { fillForm8962Marriage, buildForm8962ReferenceSummary, FORM_8962_FIELDS as F } from '@/pdf/fill-form-8962';
import { fillReturn } from '@/pdf/fill-return';
import { preparePremiumTaxCreditReview, type PreparedPremiumTaxCreditReview } from '@/pdf/premium-tax-credit-review-context';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { d } from '@/utils/decimal';
import { noAdvanceSharedMarriageHealthInput, sharedMarriageHealthInput } from '../fixtures/marketplace-shared-marriage-health';

function inspect(path: string): { pages: string[]; fields: Record<string, string>; appearances: boolean[] } {
  return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `
from pypdf import PdfReader
import json,sys
r=PdfReader(sys.argv[1]);aps=[]
for p in r.pages:
 for ref in p.get('/Annots',[]):
  w=ref.get_object()
  if w.get('/Subtype')=='/Widget':
   ap=w.get('/AP',{}).get('/N');aps.append(bool(ap and (ap.get_object().get_data() if hasattr(ap.get_object(),'get_data') else ap)))
print(json.dumps({'pages':[p.extract_text() or '' for p in r.pages],'fields':{k:str(v.get('/V','')) for k,v in (r.get_fields() or {}).items()},'appearances':aps}))
`, path], { encoding: 'utf8', timeout: 5000 }));
}

it('prints both actual allocation and marriage parts with the independent health sources', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shared-marriage-health-'));
  try {
    for (const noAdvance of [false, true]) {
      const original = noAdvance ? noAdvanceSharedMarriageHealthInput() : sharedMarriageHealthInput(2025, 'default', true);
      const before = structuredClone(original), result = calculateFederalTax(original), prepared = preparePremiumTaxCreditReview(original);
      const input = redactReviewIdentifiers(original), hidden = redactReviewIdentifiers(result);
      const summary = buildForm8962ReferenceSummary(input.form1095A, hidden, { input, prepared });
      expect(summary.policies.map(policy => policy.annualEnrollmentPremium)).toEqual(noAdvance ? ['18000.18', '6000'] : ['24000']);
      expect(summary.policies.map(policy => policy.annualAdvancePTC)).toEqual(noAdvance ? ['0', '6000'] : ['16800']);
      const doc = await fillForm8962Marriage(input, hidden, 'forms/blank/2025/f8962.pdf', prepared), path = join(dir, `credit-${noAdvance}.pdf`);
      writeFileSync(path, await doc.save()); const saved = inspect(path);
      expect([saved.fields[F.line3], saved.fields[F.line24], saved.fields[F.line25], saved.fields[F.line29]]).toEqual(noAdvance ? ['86597', '5149', '6000', '851'] : ['86597', '5149', '8400', '3251']);
      expect(F.allocations[0].slice(1).map(key => saved.fields[key])).toEqual(noAdvance ? ['', '01', '06', '0.33', '', ''] : ['', '01', '12', '0.50', '0.50', '0.50']);
      expect(F.marriage.slice(0, 4).map(key => saved.fields[key])).toEqual(['1', '198', '01', '07']);
      const health = await fillForm7206(input, hidden, 'forms/blank/2025/f7206.pdf', 'scheduleC', 'primary', undefined, prepared), healthPath = join(dir, `health-${noAdvance}.pdf`);
      writeFileSync(healthPath, await health.save()); const savedHealth = inspect(healthPath), text = savedHealth.pages.join(' ').replace(/\s+/g, ' ');
      expect(text).toContain('Final Form 8962 credit: $5149');
      expect(text).toContain('Return-level Schedule 1 line 17 transfer: $6338');
      for (const page of [...saved.pages, ...savedHealth.pages]) {
        expect(page.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
        expect(page).not.toMatch(/111.?22.?3333|444.?55.?6666|234.?56.?7890/);
      }
      expect([...saved.appearances, ...savedHealth.appearances].every(Boolean)).toBe(true);
      expect(original).toEqual(before);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it('rejects changed shared marriage sources before output', async () => {
  const input = sharedMarriageHealthInput(), result = calculateFederalTax(input), prepared = preparePremiumTaxCreditReview(input), dir = mkdtempSync(join(tmpdir(), 'shared-marriage-stale-'));
  try {
    for (const mutate of [
      (source: typeof input) => { source.form8962!.sharedPolicyAllocations!.policies![0].otherTaxpayerRelationshipSourceReference = 'Different original relationship evidence'; },
      (source: typeof input) => { source.form8962!.sharedPolicyAllocations!.policies![0].agreementReference = 'Different same-money agreement'; },
      (source: typeof input) => { source.form7206!.plans![0].payments![0].sourceId = 'Different same-money receipt'; },
    ]) {
      const changed = structuredClone(input); mutate(changed);
      await expect(fillReturn(changed, result, { blankFormsDir: '/missing', outputDir: dir, premiumTaxCreditReview: prepared })).rejects.toThrow(/stale|source|conflict/i);
    }
    for (const token of [undefined, {} as PreparedPremiumTaxCreditReview]) {
      await expect(fillForm8962Marriage(redactReviewIdentifiers(input), redactReviewIdentifiers(result), '/missing', token)).rejects.toThrow(/source|identit|original|prepared|SSN/i);
    }
    const changed = calculateFederalTax(input); changed.form8962!.marriageCalculation!.families[0].months[0].credit = d(1);
    await expect(fillForm8962Marriage(input, changed, '/missing', prepared)).rejects.toThrow(/calculation|reconcile/i);
    expect(readdirSync(dir)).toEqual([]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
