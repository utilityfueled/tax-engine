// Spec: spec/federal/charitable-k1-basis-release-nol.yaml review.
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { prepareCharitableReview } from '@/pdf/charitable-review-context';
import { buildNetOperatingLossReview } from '@/pdf/fill-net-operating-loss';
import { buildK1CharitableReview, fillK1CharitableReview } from '@/pdf/mappings/2025/k1-charitable-review';
import { fillReturn } from '@/pdf/fill-return';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { charitableStatement } from '../fixtures/k1-charitable-return';
import { releasedCharitableNolInput, releaseFixtureSource as requireSource } from '../fixtures/charitable-k1-basis-release-nol';

it('binds historical basis and released-year charity before redacted output', async () => {
  const input = releasedCharitableNolInput(), before = JSON.stringify(input), result = calculateFederalTax(input);
  const token = prepareCharitableReview(input), redacted = redactReviewIdentifiers(input);
  const rows = buildK1CharitableReview(redacted, result, token).join(' ');
  for (const text of ['original year 2018; prior basis source', 'Basis previously allowed: $20000; basis allowed this year: $60000',
    'Current appreciation outside the basis limit: $0', 'Basis suspended: $0', 'Selected section170 charitable carryforward: $33360']) expect(rows).toContain(text);
  expect(buildNetOperatingLossReview(redacted, result, undefined, undefined, token).join(' ')).toContain('remaining 33360');
  expect(result.carryforwards.charitableContributionsByYear[0].taxYear).toBe(2025);
  for (const change of [
    (changed: typeof input) => { const source = charitableStatement(changed), row = requireSource(requireSource(source.basis).priorBasisSuspensions)[0];
      row.contributionShare = '180001'; row.adjustedBasisShare = '80001'; requireSource(row.basisUseHistory)[0].basisAllowed = '20001'; requireSource(source.receipts)[0].fairMarketValueShare = '180001'; },
    (changed: typeof input) => { requireSource(charitableStatement(changed).receipts)[0].recipientName = 'Changed equal-money recipient'; },
    (changed: typeof input) => { requireSource(requireSource(requireSource(charitableStatement(changed).basis).priorBasisSuspensions)[0].basisUseHistory).pop(); },
  ]) {
    const changed = structuredClone(redacted); change(changed);
    await expect(fillReturn(changed, result, { blankFormsDir: '/not-a-release-template', outputDir: '/not-a-release-output', charitableReview: token }))
      .rejects.toThrow(/source|stale|reconcile/i);
  }
  const carry = result.carryforwards.charitableContributionsByYear[0]; carry.taxYear = 2018;
  expect(() => buildK1CharitableReview(redacted, result, token)).toThrow(/source|stale|reconcile/i); carry.taxYear = 2025;
  const bytes = await (await fillK1CharitableReview(redacted, result, token)).save();
  const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
    "import sys,json,io;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
    { input: bytes, encoding: 'utf8' })) as string[];
  for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
  const text = pages.join(' ').replace(/\s+/g, ' ');
  for (const value of ['original year 2018', '$60000', '$33360', 'basis allowed this year']) expect(text).toContain(value);
  for (const value of ['123-45-6789','123456789','actual-prior-basis-2018','Fictional original2018']) expect(text).not.toContain(value);
  expect(JSON.stringify(input)).toBe(before);
});
