// Spec: spec/federal/form-172-charitable-origin.yaml review-source-binding/review-record.
import { execFileSync } from '../helpers/file-stdin-exec';
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
import { currentCharitableOriginInput } from '../fixtures/form-172-charitable-origin.js';

function actual<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing fictional current-origin source');
  return value;
}

it('binds actual current charity and selected carries before review I/O', async () => {
  const input = currentCharitableOriginInput('A'), result = calculateFederalTax(input), before = JSON.stringify(input);
  const changed = structuredClone(input); changed.donations[0].organization = 'Different fictional qualified recipient';
  expect(calculateFederalTax(changed).form172?.regular.netOperatingLoss.toFixed()).toBe('14000');
  expect(() => buildNetOperatingLossReview(changed, result)).toThrow(/source|reconcile|stale/i);
  const token = prepareCharitableReview(input), redacted = redactReviewIdentifiers(input);
  expect(buildNetOperatingLossReview(redacted, result, undefined, undefined, token).join(' ')).toContain('Current regular PartI loss 14000');
  for (const mutate of [
    (value: typeof input) => { value.donations[0].amount = '20001'; },
    (value: typeof input) => { value.donations = []; },
    (value: typeof input) => { value.form172 = undefined; },
    (value: typeof input) => { value.w2s[0].wages = '20001'; },
    (value: typeof input) => { actual(value.netOperatingLoss?.alternativeTax).charitableCarryoverHistory = undefined; },
  ]) {
    const edited = structuredClone(redacted); mutate(edited);
    await expect(fillReturn(edited, result, { blankFormsDir: '/not-current-charity-templates', outputDir: '/not-current-charity-output', charitableReview: token }))
      .rejects.toThrow(/source|charit|reconcile|stale/i);
  }
  const lost = structuredClone(input); lost.donations = [];
  await expect(fillReturn(lost, result, { blankFormsDir: '/not-current-charity-templates', outputDir: '/not-current-charity-output' }))
    .rejects.toThrow(/source|charit|reconcile|stale/i);
  const source = actual(result.form172?.charitableSources), original = source.percentageCarryforward;
  source.percentageCarryforward = original.plus('0.01');
  expect(() => buildNetOperatingLossReview(redacted, result, undefined, undefined, token)).toThrow(/source|reconcile/i);
  source.percentageCarryforward = original;
  expect(JSON.stringify(input)).toBe(before);
});

it('saves separate current charity and loss-origin review amounts', async () => {
  const input = currentCharitableOriginInput(), result = calculateFederalTax(input), token = prepareCharitableReview(input);
  const redacted = redactReviewIdentifiers(input);
  const text = buildNetOperatingLossReview(redacted, result, undefined, undefined, token).join(' ');
  for (const literal of ['Original qualified current charitable value: 20000', 'Selected regular charitable deduction in nonbusiness group: 6000',
    'Alternative charitable deduction in nonbusiness group: 6000', 'Current percentage charitable excess before any prior NOL coordination: 14000']) expect(text).toContain(literal);
  const row = actual(result.carryforwards.amtCharitableContributionsByYear?.[0]), medium = row.medium;
  row.medium = 'noncash';
  expect(() => buildNetOperatingLossReview(redacted, result, undefined, undefined, token)).toThrow(/source|reconcile/i);
  row.medium = medium;
  const directory = await mkdtemp(join(tmpdir(), 'current-charitable-origin-'));
  try {
    const file = await fillNetOperatingLossReview(redacted, result, directory, undefined, undefined, token);
    const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      "import sys,json,io;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
    { input: await readFile(file), encoding: 'utf8' })) as string[];
    for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
    const all = pages.join(' ').replace(/\s+/g, ' ');
    for (const literal of ['20000', '6000', '14000', '16000', 'Current alternative PartI loss 0']) expect(all).toContain(literal);
    for (const privateText of [input.taxpayer.primary.ssn, input.form172?.sourceReference, input.donations[0].organization]) {
      if (privateText) expect(all).not.toContain(privateText);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
