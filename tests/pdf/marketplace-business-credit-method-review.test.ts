// Spec: spec/federal/marketplace-business-credit-method.yaml.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { fillForm7206 } from '@/pdf/fill-form-7206';
import { fillReturn } from '@/pdf/fill-return';
import { preparePremiumTaxCreditReview } from '@/pdf/premium-tax-credit-review-context';
import { hasPremiumTaxCreditReviewSources } from '@/pdf/premium-tax-credit-review-context';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { marketplaceBusinessCreditMethodInput } from '../fixtures/marketplace-business-credit-method';
import { twoOwnerMarketplaceHealthInput } from '../fixtures/marketplace-health-owners';

it('binds the chosen method and signed business rows before redacted PDF output', async () => {
  const input = marketplaceBusinessCreditMethodInput(), result = calculateFederalTax(input), prepared = preparePremiumTaxCreditReview(input);
  const dir = mkdtempSync(join(tmpdir(), 'tax-business-credit-method-'));
  try {
    const packet = await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), { blankFormsDir: 'forms/blank/2025', outputDir: dir, flatten: false, premiumTaxCreditReview: prepared });
    const paths = packet.filledForms.filter(path => /form-7206-/.test(path)); expect(paths).toHaveLength(2);
    const pages: string[] = paths.flatMap(path => JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', "from pypdf import PdfReader;import json,sys;print(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", path], { encoding: 'utf8', timeout: 5000 })) as string[]);
    const text = pages.join(' ');
    for (const value of ['Actual taxpayer recorded allocation method','monthly_eligible_plan_enrollment','Schedule 1 line 17 transfer: $3000','Allocated Step2 credit $7200','Allocated Step2 credit $4800','Specified deduction $-3000']) expect(text).toContain(value);
    for (const page of pages) { expect(page).toContain('FOR REVIEW ONLY - NOT FOR FILING'); expect(page).not.toMatch(/123.?45.?6789|987.?65.?4321/); }
    for (const edit of ['removed','reference','method']) {
      const changed = structuredClone(input);
      if (edit === 'removed') delete changed.form7206!.marketplaceCreditAllocation;
      else if (edit === 'reference') changed.form7206!.marketplaceCreditAllocation!.sourceReference = 'Changed actual choice';
      else changed.form7206!.marketplaceCreditAllocation!.sameMethodForAllCalculationsConfirmed = false;
      await expect(fillForm7206(changed, result, '/missing', 'scheduleC', 'primary', undefined, prepared)).rejects.toThrow(/source|stale|conflict|method/i);
    }
    const forged = calculateFederalTax(input);
    forged.marketplaceHealthInsurance!.businesses[0].allocatedCredit = forged.marketplaceHealthInsurance!.businesses[0].allocatedCredit.plus(1);
    forged.marketplaceHealthInsurance!.businesses[1].allocatedCredit = forged.marketplaceHealthInsurance!.businesses[1].allocatedCredit.minus(1);
    await expect(fillForm7206(redactReviewIdentifiers(input), redactReviewIdentifiers(forged), '/missing', 'scheduleC', 'primary', undefined, prepared)).rejects.toThrow(/source|allocation|calculation|reconcile/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it('rejects balanced allocation rewrites and prepares ordinary selected-method sources', async () => {
  const input = marketplaceBusinessCreditMethodInput(), prepared = preparePremiumTaxCreditReview(input), forged = calculateFederalTax(input);
  for (const [index, delta] of [[0,1],[1,-1]]) {
    const row = forged.marketplaceHealthInsurance!.businesses[index]; row.allocatedCredit = row.allocatedCredit.plus(delta); row.netPremiumsAfterCredit = row.netPremiumsAfterCredit.minus(delta);
    const rewrite = (lines: typeof forged.allLines) => lines.map(line => line.form !== `Pub974 Simplified ${row.businessSourceId}` ? { ...line }
      : { ...line, value: line.line === '6' ? line.value.plus(delta) : line.line === '7' ? line.value.minus(delta) : line.value });
    forged.marketplaceHealthInsurance!.lines = rewrite(forged.marketplaceHealthInsurance!.lines);
    forged.allLines = rewrite(forged.allLines);
  }
  await expect(fillForm7206(redactReviewIdentifiers(input), redactReviewIdentifiers(forged), '/missing', 'scheduleC', 'primary', undefined, prepared)).rejects.toThrow(/retained calculation|allocation|reconcile/i);
  const ordinary = twoOwnerMarketplaceHealthInput(); ordinary.form7206!.marketplaceCreditAllocation = structuredClone(input.form7206!.marketplaceCreditAllocation);
  expect(hasPremiumTaxCreditReviewSources(ordinary)).toBe(true);
  expect(() => preparePremiumTaxCreditReview(ordinary)).not.toThrow();
});
