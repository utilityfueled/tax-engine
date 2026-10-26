// Spec: spec/federal/charitable-single-category-nol.yaml review.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { buildNetOperatingLossReview, fillNetOperatingLossReview } from '@/pdf/fill-net-operating-loss.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { singleCategoryCharitableNolInput } from '../fixtures/charitable-single-category-nol.js';

it('reconciles category and medium on the saved independent NOL charity reference', async () => {
  for (const alternative of [false, true]) {
    const input = singleCategoryCharitableNolInput('C', 2025, alternative); const result = calculateFederalTax(input);
    const redacted = redactReviewIdentifiers(input);
    const text = buildNetOperatingLossReview(redacted, result).join(' ');
    expect(text).toContain('capital_gain_30; medium noncash');
    expect(text).toContain(alternative ? 'remaining 30090' : 'remaining 33360');
    const directory = await mkdtemp(join(tmpdir(), 'single-category-charity-review-'));
    try {
      const saved = await fillNetOperatingLossReview(redacted, result, directory);
      const bytes = await readFile(saved);
      const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        "import sys,json,io;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
      { input: bytes, encoding: 'utf8' })) as string[];
      for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
      const all = pages.join(' ').replace(/\s+/g, ' ');
      expect(all).toContain('capital_gain_30; medium noncash');
      for (const privateText of ['6789', 'loss2021', input.donations[0].organization]) expect(all).not.toContain(privateText);
    } finally { await rm(directory, { recursive: true, force: true }); }
    const carry = alternative ? result.netOperatingLoss?.alternativeCharitableCarryover : result.netOperatingLoss?.charitableCarryover;
    if (!carry) throw new Error('Missing synthetic charity result');
    for (const field of ['category', 'medium', 'sourceDigest'] as const) {
      const old = carry[field]; Object.assign(carry, { [field]: field === 'category' ? 'other_30' : field === 'medium' ? 'cash' : 'stale' });
      expect(() => buildNetOperatingLossReview(redacted, result)).toThrow(/charit|source|reconcile/i);
      Object.assign(carry, { [field]: old });
    }
    const yearRow = (alternative ? result.carryforwards.amtCharitableContributionsByYear : result.carryforwards.charitableContributionsByYear)?.[0];
    if (!yearRow) throw new Error('Missing synthetic carry year');
    for (const field of ['category', 'medium'] as const) {
      const old = yearRow[field]; Object.assign(yearRow, { [field]: field === 'category' ? 'other_30' : 'cash' });
      expect(() => buildNetOperatingLossReview(redacted, result)).toThrow(/charit|source|reconcile/i);
      Object.assign(yearRow, { [field]: old });
    }
    redacted.donations[0].organization = 'Same amount, replacement recipient';
    expect(() => buildNetOperatingLossReview(redacted, result)).toThrow(/charit|source|reconcile/i);
  }
});
