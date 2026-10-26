// Spec: spec/federal/form-8962-overlapping-policies.yaml.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { d } from '@/utils/decimal.js';
import { fillForm8962SharedPolicy, FORM_8962_FIELDS as F, buildForm8962ReferenceSummary, fillForm8962Reference } from '@/pdf/fill-form-8962.js';
import { preparePremiumTaxCreditReview, type PreparedPremiumTaxCreditReview } from '@/pdf/premium-tax-credit-review-context.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { overlappingPolicyFixture } from '../fixtures/overlapping-policy.js';

it('saves household totals and original allocation periods with source binding', async () => {
  const input = overlappingPolicyFixture('same_group'), result = calculateFederalTax(input), prepared = preparePremiumTaxCreditReview(input);
  const hidden = redactReviewIdentifiers(result), redacted = redactReviewIdentifiers(input), context = { input: redacted, prepared };
  const summary = buildForm8962ReferenceSummary(redacted.form1095A, hidden, context);
  expect(summary.allocatedMonths).toHaveLength(3); expect(summary.allocations).toHaveLength(1);
  expect(summary.householdMonths).toEqual([{ month: 1, policyOrdinals: [1, 2, 3], premium: '1450', slcsp: '750', advance: '250', unsharedBenchmarkGroups: [{ policyOrdinals: [2, 3], slcsp: '450' }] }]);
  const dir = mkdtempSync(join(tmpdir(), 'tax-overlap-pdf-'));
  const inspect = (path: string): { pages: string[]; fields: Record<string, string> } => JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', 'from pypdf import PdfReader\nimport json,sys\nr=PdfReader(sys.argv[1]);print(json.dumps({"pages":[p.extract_text() or "" for p in r.pages],"fields":{k:str(v.get("/V","")) for k,v in (r.get_fields() or {}).items()}}))', path], { encoding: 'utf8', timeout: 5000 }));
  try {
    const doc = await fillForm8962SharedPolicy(redacted, hidden, 'forms/blank/2025/f8962.pdf', prepared), physicalPath = join(dir, 'physical.pdf');
    writeFileSync(physicalPath, await doc.save()); const saved = inspect(physicalPath);
    for (const [index, value] of ['1450', '750', '0', '750', '750', '250'].entries()) expect(saved.fields[F.monthly[0][index]]).toBe(value);
    expect([saved.fields[F.line24], saved.fields[F.line25], saved.fields[F.line26]]).toEqual(['750', '250', '500']);
    expect(saved.fields[F.allocations[0][4]]).toBe('0.25'); expect(saved.fields[F.allocations[1][0]]).toBe('');
    const reference = inspect(await fillForm8962Reference(redacted.form1095A, hidden, dir, context)), text = reference.pages.join(' ');
    expect(text).toContain('Combined household month 1'); expect(text).toContain('unshared coverage group: policies 2, 3; benchmark $450');
    for (const secret of ['123-45-6789', '234-56-7890', '345-67-8901', '123456789', 'Actual Marketplace benchmark', 'WA-area-1']) expect(text).not.toContain(secret);
    for (const page of [...saved.pages, ...reference.pages]) expect(page).toContain(REVIEW_PDF_NOTICE);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const stale = structuredClone(input); stale.form8962!.sharedPolicyAllocations!.overlappingCoverage!.months![0].groups![0].ratingArea = 'Different actual area';
  expect(() => buildForm8962ReferenceSummary(stale.form1095A, result, { input: stale, prepared })).toThrow(/stale|conflicting/i);
  const changed = { ...hidden, form8962: { ...hidden.form8962!, sharedPolicyAllocation: { ...hidden.form8962!.sharedPolicyAllocation!, householdMonths: hidden.form8962!.sharedPolicyAllocation!.householdMonths.map(row => ({ ...row, slcsp: d(1200) })) } } };
  expect(() => buildForm8962ReferenceSummary(redacted.form1095A, changed, context)).toThrow(/retained|reconcile/i);
  expect(() => buildForm8962ReferenceSummary(redacted.form1095A, hidden, { input: redacted, prepared: {} as PreparedPremiumTaxCreditReview })).toThrow(/prepared|original/i);
});
