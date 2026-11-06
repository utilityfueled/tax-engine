// Spec: spec/federal/form-8962-separate-return.yaml.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { buildForm8962ReferenceSummary, FORM_8962_FIELDS as F } from '@/pdf/fill-form-8962.js';
import { preparePremiumTaxCreditReview } from '@/pdf/premium-tax-credit-review-context.js';
import { separateReturnFixture } from '../fixtures/separate-return-policy.js';

function fields(path: string): Record<string, string> {
  return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `
from pypdf import PdfReader
import json,sys
print(json.dumps({k:str(v.get('/V','')) for k,v in (PdfReader(sys.argv[1]).get_fields() or {}).items()}))
`, path], { encoding: 'utf8', timeout: 5000 }));
}
it('prints only the allocated columns', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tax-separate-return-'));
  try {
    for (const [exception, columnE] of [[true, '0.50'], [false, '']] as const) {
      const input = separateReturnFixture(exception), result = calculateFederalTax(input);
      const packet = await fillReturn(input, result, { blankFormsDir: 'forms/blank/2025', outputDir: join(dir, String(exception)), flatten: false, premiumTaxCreditReview: preparePremiumTaxCreditReview(input) });
      const saved = fields(packet.filledForms.find(file => file.endsWith('/f8962-filled.pdf'))!), row = F.allocations[0]!;
      expect(saved[row[4]!]).toBe(columnE); expect(saved[row[5]!]).toBe(''); expect(saved[row[6]!]).toBe('0.50');
      expect(saved[F.marriedSeparate]).toBe(exception ? '/1' : '/Off');
      expect(buildForm8962ReferenceSummary(input.form1095A, result, { input, prepared: preparePremiumTaxCreditReview(input) }).allocations?.[0]?.method).toBe(exception ? 'separate_return_exception' : 'separate_return_advance_only');
      expect(saved[F.line25]).toBe('3000');
      if (!exception) { expect(saved[F.line24]).toBe('0'); expect(saved[F.line27]).toBe('3000'); expect(saved[F.line29]).toBe('750'); }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30000);
it('leaves line A clear for Exception 1', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tax-separate-return-'));
  try {
    // A stale separate-return answer must not tick line A on a head of household return.
    const input = separateReturnFixture(true); input.taxpayer.filingStatus = 'head_of_household'; input.form8962!.marriedFilingSeparatelyExceptionConfirmed = true;
    input.form8962!.sharedPolicyAllocations!.policies![0]!.separateReturn!.livingApartExceptionConfirmed = true;
    const packet = await fillReturn(input, calculateFederalTax(input), { blankFormsDir: 'forms/blank/2025', outputDir: dir, flatten: false, premiumTaxCreditReview: preparePremiumTaxCreditReview(input) });
    const saved = fields(packet.filledForms.find(file => file.endsWith('/f8962-filled.pdf'))!), row = F.allocations[0]!;
    expect(saved[F.marriedSeparate]).toBe('/Off'); expect(saved[row[4]!]).toBe('0.50'); expect(saved[row[6]!]).toBe('0.50');
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30000);
