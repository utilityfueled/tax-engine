// Spec: spec/federal/form-172-charitable-closure.yaml original-review.
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
import { originalCharitableOriginInput, priorCharitableOriginInput } from '../fixtures/form-172-charitable-closure.js';

it('binds original charitable source kinds and independent values in loss review', async () => {
  for (const kind of ['crypto', 'partnership', 'prior'] as const) {
    const input = kind === 'prior' ? priorCharitableOriginInput() : originalCharitableOriginInput(kind);
    const result = calculateFederalTax(input), token = prepareCharitableReview(input), redacted = redactReviewIdentifiers(input);
    const text = buildNetOperatingLossReview(redacted, result, undefined, undefined, token).join(' ');
    expect(text).toContain('Current regular PartI loss 13000');
    expect(text).toContain(`Alternative charitable deduction in nonbusiness group: ${kind === 'prior' ? '1000' : '3000'}`);
    const lost = structuredClone(redacted);
    if (kind === 'crypto') lost.cryptoIncome = undefined;
    else if (kind === 'partnership') { lost.scheduleK1 = []; lost.k1CharitableSources = undefined; }
    else lost.charitableCarryoverSources = undefined;
    await expect(fillReturn(lost, result, { blankFormsDir: '/missing-original-charity-templates', outputDir: '/missing-original-charity-output', charitableReview: token }))
      .rejects.toThrow(/source|charit|reconcile|stale/i);
    await expect(fillReturn(lost, result, { blankFormsDir: '/missing-original-charity-templates', outputDir: '/missing-original-charity-output' }))
      .rejects.toThrow(/source|charit|reconcile|stale/i);
    const source = result.form172?.charitableSources;
    if (!source) throw Error('Missing actual computed charity source');
    const value = source.alternativeQualifiedValue;
    source.alternativeQualifiedValue = value.plus('0.01');
    expect(() => buildNetOperatingLossReview(redacted, result, undefined, undefined, token)).toThrow(/source|reconcile/i);
    source.alternativeQualifiedValue = value;
    const sourceKind = source.sourceKind; source.sourceKind = sourceKind === 'current' ? 'prior' : 'current';
    expect(() => buildNetOperatingLossReview(redacted, result, undefined, undefined, token)).toThrow(/source|reconcile/i);
    source.sourceKind = sourceKind;
    if (kind !== 'prior') continue;
    const directory = await mkdtemp(join(tmpdir(), 'charitable-origin-originals-'));
    try {
      const file = await fillNetOperatingLossReview(redacted, result, directory, undefined, undefined, token);
      const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        "import sys,json,io;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
      { input: await readFile(file), encoding: 'utf8' })) as string[];
      for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
      for (const literal of ['50000', '47000', '1000', '13000']) expect(pages.join(' ')).toContain(literal);
      for (const secret of [input.taxpayer.primary.ssn, input.form172?.sourceReference, input.charitableCarryoverSources?.sourceReference]) if (secret) expect(pages.join(' ')).not.toContain(secret);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});
