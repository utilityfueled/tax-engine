// Spec: spec/federal/shared-owner-marketplace-health.yaml.
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
import { sharedOwnerHealthInput } from '../fixtures/shared-owner-marketplace-health';

it('renders separate shared-plan owners from the original private context', async () => {
  const input = sharedOwnerHealthInput(), result = calculateFederalTax(input), prepared = preparePremiumTaxCreditReview(input);
  const redactedInput = redactReviewIdentifiers(input), redactedResult = redactReviewIdentifiers(result);
  const dir = mkdtempSync(join(tmpdir(), 'tax-shared-owner-health-'));
  try {
    const packet = await fillReturn(redactedInput, redactedResult, { blankFormsDir: 'forms/blank/2025', outputDir: dir, flatten: false, premiumTaxCreditReview: prepared });
    const healthPaths = packet.filledForms.filter(file => /form-7206-/.test(file)), creditPath = packet.filledForms.find(file => file.endsWith('/f8962-filled.pdf'));
    expect(healthPaths).toHaveLength(2); if (!creditPath) throw new Error('Missing actual credit form');
    const inspect = (path: string): { pages: string[]; fields: Record<string, string> } => JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `
from pypdf import PdfReader
import json,sys
r=PdfReader(sys.argv[1]);print(json.dumps({'pages':[p.extract_text() or '' for p in r.pages],'fields':{k:str(v.get('/V','')) for k,v in (r.get_fields() or {}).items()}}))
`, path], { encoding: 'utf8', timeout: 5000 }));
    const health = healthPaths.map(inspect), credit = inspect(creditPath);
    expect([credit.fields[P.line24], credit.fields[P.line25], credit.fields[P.line26], credit.fields[P.line29]]).toEqual(['7116', '180', '6936', '']);
    for (const row of P.allocations.slice(0, 2)) expect(row.slice(4).map(field => credit.fields[field])).toEqual(['0.50', '0.50', '0.50']);
    const combined = health.map(document => document.pages.join(' ')).join(' ').replace(/\s+/g, ' ');
    for (const value of ['original premium $1000', 'original premium $500', 'owner/business paid $490', 'owner/business paid $245', 'other persons paid $490', 'other persons paid $245',
      'Pub974 Owner Allocation primary:deduction: $728', 'Pub974 Owner Allocation spouse:deduction: $364', 'Step 2 credit: $7908', 'Final Form 8962 credit: $7116']) expect(combined).toContain(value);
    for (const document of health) {
      expect(document.pages.join(' ')).toContain('Return-level Schedule 1 line 17 transfer: $1092');
      expect(document.pages.join(' ')).toContain('not a separate deduction for this business');
    }
    for (const page of [...health.flatMap(document => document.pages), ...credit.pages]) { expect(page).toContain('FOR REVIEW ONLY - NOT FOR FILING'); expect(page).not.toMatch(/123.?45.?6789|555.?55.?5555|234.?56.?7890|345.?67.?8901/); }
    const changed = structuredClone(input); changed.form7206!.plans![1]!.sharedMarketplaceSources!.persons![0]!.coveredIndividualSsn = input.taxpayer.primary.ssn;
    await expect(fillForm7206(changed, result, '/missing', 'scheduleF', 'spouse', undefined, prepared)).rejects.toThrow(/stale|conflict|source/);
    for (const token of [undefined, {} as ReturnType<typeof preparePremiumTaxCreditReview>]) await expect(fillForm7206(redactedInput, redactedResult, '/missing', 'scheduleF', 'spouse', undefined, token)).rejects.toThrow(/source|identit|original|context|allocation primary SSN/i);
    const redistributed = calculateFederalTax(input);
    for (const rows of [redistributed.allLines, redistributed.form7206!.lines]) for (const row of rows) if (row.form === 'Pub974 Owner Allocation' && row.line.endsWith(':deduction')) row.value = d(row.line === 'primary:deduction' ? '729' : '363');
    await expect(fillForm7206(input, redistributed, '/missing', 'scheduleF', 'spouse', undefined, prepared)).rejects.toThrow(/reconcile|owner|audit|result|stale/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
