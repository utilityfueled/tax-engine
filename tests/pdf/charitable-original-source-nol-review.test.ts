// Spec: spec/federal/charitable-original-source-nol.yaml review.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { prepareCharitableReview } from '@/pdf/charitable-review-context.js';
import { buildNetOperatingLossReview, fillNetOperatingLossReview } from '@/pdf/fill-net-operating-loss.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { cryptoCharitableNolInput, k1CharitableNolInput, originalNolFixtureSource as requireSource } from '../fixtures/charitable-original-source-nol.js';

it('binds original sources and both charitable carries before saved redacted review output', async () => {
  for (const make of [cryptoCharitableNolInput, k1CharitableNolInput]) {
    const input = make(), result = calculateFederalTax(input), original = JSON.stringify(input);
    const token = prepareCharitableReview(input), redacted = redactReviewIdentifiers(input);
    expect(buildNetOperatingLossReview(redacted, result, undefined, undefined, token).join(' ')).toContain('remaining 33360');
    const changedWages = structuredClone(redacted); changedWages.w2s[0].wages = '100001';
    expect(() => buildNetOperatingLossReview(changedWages, result, undefined, undefined, token)).toThrow(/source|stale|reconcile/i);
    const removed = structuredClone(redacted); removed.k1CharitableSources = undefined; removed.scheduleK1 = []; removed.cryptoIncome = undefined;
    await expect(fillReturn(removed, result, { blankFormsDir: '/not-an-original-charity-template', outputDir: '/not-an-original-charity-output', charitableReview: token }))
      .rejects.toThrow(/source|stale|reconcile/i);
    const saved = result.carryforwards.amtCharitableContributions;
    result.carryforwards.amtCharitableContributions = saved?.plus(1);
    expect(() => buildNetOperatingLossReview(redacted, result, undefined, undefined, token)).toThrow(/source|reconcile/i);
    result.carryforwards.amtCharitableContributions = saved;
    const directory = await mkdtemp(join(tmpdir(), 'original-charity-nol-review-'));
    try {
      const path = await fillNetOperatingLossReview(redacted, result, directory, undefined, undefined, token);
      const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        "import sys,json,io;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
      { input: await readFile(path), encoding: 'utf8' })) as string[];
      for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
      const all = pages.join(' ').replace(/\s+/g, ' ');
      for (const amount of ['33360', '46800', '60000', 'capital_gain_30']) expect(all).toContain(amount);
      for (const privateText of ['6789', '12-3456789', 'gift-1', 'loss2021', 'Fictional']) expect(all).not.toContain(privateText);
    } finally { await rm(directory, { recursive: true, force: true }); }
    expect(JSON.stringify(input)).toBe(original);
  }
  const zero = cryptoCharitableNolInput(); requireSource(zero.cryptoIncome).donations[0].isQualifiedOrganization = false;
  const result = calculateFederalTax(zero);
  expect(result.carryforwards.charitableContributions.toFixed()).toBe('0');
  const removed = structuredClone(zero); removed.cryptoIncome = undefined;
  expect(() => buildNetOperatingLossReview(removed, result)).toThrow(/source|reconcile/i);
  await expect(fillReturn(removed, result, { blankFormsDir: '/not-an-original-charity-template', outputDir: '/not-an-original-charity-output' }))
    .rejects.toThrow(/source|reconcile/i);
});
