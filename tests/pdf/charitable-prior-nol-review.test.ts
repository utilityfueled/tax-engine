// Spec: charitable-prior-net-operating-loss.yaml private-reference.
import { execFileSync } from '../helpers/file-stdin-exec';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { buildNetOperatingLossReview, fillNetOperatingLossReview } from '@/pdf/fill-net-operating-loss.js';
import { fillForm6251 } from '@/pdf/fill-form-6251.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { prepareCharitableReview } from '@/pdf/charitable-review-context.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { d } from '@/utils/decimal.js';
import { priorCharitableNolInput } from '../fixtures/charitable-prior-nol.js';
it('reconciles original prior regular and AMT charity before private review output', async () => {
    const input = priorCharitableNolInput({ alternative: '10000' });
    const result = calculateFederalTax(input), token = prepareCharitableReview(input), redacted = redactReviewIdentifiers(input);
    const rows = buildNetOperatingLossReview(redacted, result, undefined, undefined, token).join(' ');
    expect(rows).toContain('Prior regular charitable carry from 2024');
    expect(rows).toContain('opening 50000; treated as paid 13200; NOL-related reduction 13440; expired 0; remaining 23360');
    expect(rows).toContain('Prior alternative charitable carry from 2024');
    expect(rows).toContain('Current AMT charity adjustment 3200');
    const directory = await mkdtemp(join(tmpdir(), 'prior-charity-review-'));
    try {
        const saved = await fillNetOperatingLossReview(redacted, result, directory, undefined, undefined, token);
        const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
            "import sys,json,io;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"], { input: await readFile(saved), encoding: 'utf8' })) as string[];
        for (const page of pages)
            expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
        const text = pages.join(' ').replace(/\s+/g, ' ');
        for (const value of ['synthetic-regular-2024', 'synthetic-alternative-2024', '6789', input.taxpayer.primary.ssn])
            expect(text).not.toContain(value);
        expect(text).toContain('remaining 23360');
        const amt = await fillForm6251(redacted, result, 'forms/blank/2025/f6251.pdf', undefined, undefined, token);
        expect(amt.getForm().getTextField('topmostSubform[0].Page1[0].f1_25[0]').getText()).toBe('3200');
        expect(amt.getForm().getTextField('topmostSubform[0].Page1[0].f1_26[0]').getText()).toBe('90000');
    }
    finally {
        await rm(directory, { recursive: true, force: true });
    }
    for (const mutate of [
        (source: typeof input) => { required(required(required(required(required(source.netOperatingLoss).alternativeTax).charitableCarryoverHistory).alternativeCarryoverSources).vintages)[0].openingCarryforward = '9999.99'; },
        (source: typeof input) => { required(required(required(required(required(source.netOperatingLoss).alternativeTax).charitableCarryoverHistory).alternativeCarryoverSources).vintages)[0].category = 'capital_gain_20'; },
        (source: typeof input) => { required(required(required(required(required(source.netOperatingLoss).alternativeTax).charitableCarryoverHistory).alternativeCarryoverSources).vintages)[0].medium = 'cash'; },
        (source: typeof input) => { required(required(required(required(source.netOperatingLoss).alternativeTax).charitableCarryoverHistory).alternativeCarryoverSources).primaryTaxpayerIdLast4 = '1111'; },
        (source: typeof input) => { delete source.charitableCarryoverSources; delete required(required(source.netOperatingLoss).alternativeTax).charitableCarryoverHistory; },
    ]) {
        const changed = structuredClone(input);
        mutate(changed);
        expect(() => buildNetOperatingLossReview(changed, result, undefined, undefined, token)).toThrow(/charit|source|reconcile|history/i);
        await expect(fillForm6251(changed, result, '/missing-prior-charity-template.pdf', undefined, undefined, token)).rejects.toThrow(/charit|source|reconcile|history/i);
    }
    const removed = structuredClone(input);
    delete removed.charitableCarryoverSources;
    delete required(required(removed.netOperatingLoss).alternativeTax).charitableCarryoverHistory;
    await expect(fillReturn(removed, result, { blankFormsDir: '/missing-prior-charity-templates', outputDir: directory })).rejects.toThrow(/charit|source|reconcile|history/i);
    await expect(fillForm6251(removed, result, '/missing-prior-charity-template.pdf')).rejects.toThrow(/charit|source|reconcile|history/i);
    expect(() => buildNetOperatingLossReview(redacted, result, undefined, undefined, {} as typeof token)).toThrow(/original|prepared|context/i);
    result.carryforwards.charitableContributionsByYear[0].taxYear = 2025;
    expect(() => buildNetOperatingLossReview(redacted, result, undefined, undefined, token)).toThrow(/charit|source|reconcile/i);
    result.carryforwards.charitableContributionsByYear[0].taxYear = 2024;
    required(required(result.form6251).lines.find(row => row.line === '3')).value = d('3199');
    await expect(fillForm6251(redacted, result, '/missing-prior-charity-template.pdf', undefined, undefined, token)).rejects.toThrow(/charit|source|reconcile/i);
});

function required<T>(value: T): NonNullable<T> {
  if (value === undefined || value === null) throw new Error("Missing fictional source or expected calculation");
  return value;
}
