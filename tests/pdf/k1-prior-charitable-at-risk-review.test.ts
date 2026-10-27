import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument } from 'pdf-lib';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { fillScheduleA, SCHEDULE_A_FIELDS as A } from '@/pdf/fill-schedule-a.js';
import { SCHEDULE_D_FIELDS as D } from '@/pdf/fill-schedule-d.js';
import { fillScheduleE } from '@/pdf/fill-schedule-e.js';
import { FORM_8995_FIELDS as Q } from '@/pdf/fill-form-8995.js';
import { prepareScheduleEReview } from '@/pdf/schedule-e-review-context.js';
import { prepareCharitableReview } from '@/pdf/charitable-review-context.js';
import { prepareQbiLossReview } from '@/pdf/qbi-loss-review-context.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { charitableSourceDigest } from '@/utils/charitable-source-digest.js';
import { charitableStatement } from '../fixtures/k1-charitable-return.js';
import { k1PriorCharitableRiskFixture } from '../fixtures/k1-prior-charitable-at-risk.js';
import { requireRiskSource } from '../fixtures/k1-charitable-at-risk.js';

it('rejects stale historical sources and retained prior balances before template access', async () => {
    // Spec: K1 Prior Charitable At Risk, review-binding.
    const input = k1PriorCharitableRiskFixture(), result = calculateFederalTax(input);
    const token = prepareCharitableReview(input), scheduleE = prepareScheduleEReview(input);
    for (const change of [
        (x: typeof input) => { requireRiskSource(requireRiskSource(requireRiskSource(charitableStatement(x).atRisk).priorLossHistory).characterSources).recipientTaxpayerIdLast4 = '0000'; },
        (x: typeof input) => { requireRiskSource(requireRiskSource(requireRiskSource(charitableStatement(x).atRisk).priorLossHistory).characterSources).sourceReference = 'Equal-money replacement'; },
        (x: typeof input) => { requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(charitableStatement(x).atRisk).priorLossHistory).characterSources).records)[1].gift).receipt).contributionDate = '2024-11-29'; },
        (x: typeof input) => { requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(charitableStatement(x).atRisk).priorLossHistory).characterSources).records)[0].useHistory)[0].amountAllowed = '9999.99'; },
        (x: typeof input) => { delete x.k1CharitableSources; },
    ]) {
        const changed = structuredClone(input); change(changed);
        await expect(fillScheduleA(changed, result, 'missing.pdf', token)).rejects.toThrow(/source|stale|conflicting|original/i);
        await expect(fillScheduleE(changed, result, 'missing.pdf', scheduleE)).rejects.toThrow(/source|stale|conflicting|original/i);
    }
    const carries = requireRiskSource(result.carryforwards.k1AtRiskByCharacter).map(row => ({ ...row, priorRecords: row.priorRecords?.map(record => ({ ...record, suspended: record.suspended.plus('.01') })) }));
    const stale = { ...result, carryforwards: { ...result.carryforwards, k1AtRiskByCharacter: carries } };
    await expect(fillScheduleA(input, stale, 'missing.pdf', token)).rejects.toThrow(/calculation|retained/i);
    await expect(fillScheduleE(input, stale, 'missing.pdf', scheduleE)).rejects.toThrow(/calculation|retained/i);
    await expect(fillReturn(input, stale, { charitableReview: token, scheduleEReview: scheduleE, blankFormsDir: 'missing', outputDir: 'missing' })).rejects.toThrow(/calculation|retained/i);
});
it('saves original historical use separately from current basis and charitable deductions', async () => {
    // Spec: K1 Prior Charitable At Risk, original-review.
    const input = k1PriorCharitableRiskFixture(), before = JSON.stringify(input), result = calculateFederalTax(input);
    const dir = await mkdtemp(join(tmpdir(), 'k1-prior-risk-review-'));
    try {
        expect(charitableSourceDigest(redactReviewIdentifiers(input))).toBe(charitableSourceDigest(input));
        const packet = await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), {
            charitableReview: prepareCharitableReview(input), qbiLossReview: prepareQbiLossReview(input), scheduleEReview: prepareScheduleEReview(input),
            blankFormsDir: 'forms/blank/2025', outputDir: dir, flatten: false,
        });
        const file = (suffix: string) => requireRiskSource(packet.filledForms.find(value => value.endsWith(suffix)));
        for (const [suffix, field, value] of [['/f1040sa-filled.pdf', A.line11, '10,000'], ['/f1040sd-filled.pdf', D.line15, '20,000'], ['/f8995-filled.pdf', Q.line16, '10,000']]) {
            const doc = await PDFDocument.load(await readFile(file(suffix)));
            expect(doc.getForm().getTextField(field).getText()?.replaceAll(',', '')).toBe(value.replaceAll(',', ''));
        }
        const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
            'import json,sys;from pypdf import PdfReader;print(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', file('/k1-charitable-reference-filled.pdf')],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }));
        const text = pages.join(' ').replace(/\s+/g, ' ');
        for (const value of ['Prior at-risk deduction 1: ordinary; suspension year 2022',
            'Original deduction after basis: $60000; original at-risk disallowance: $40000',
            'Earlier at-risk use: $20000; opening suspension: $20000', 'Allowed this year: $10000; closing at-risk suspension: $10000',
            'Prior at-risk deduction 2: charitable; suspension year 2024', 'Allowed this year: $5000; closing at-risk suspension: $5000',
            'Original gift basis year: 2024', 'Basis previously allowed: $0; basis allowed this year: $10000']) expect(text).toContain(value);
        for (const secret of ['123456789', '6789', 'old-cash', 'prior-ordinary', 'Fictional original']) expect(text).not.toContain(secret);
        for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
        expect(JSON.stringify(input)).toBe(before);
    } finally { await rm(dir, { recursive: true, force: true }); }
});
