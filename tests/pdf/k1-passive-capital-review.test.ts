import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument } from 'pdf-lib';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { fillScheduleE, SCHEDULE_E_FIELDS as E } from '@/pdf/fill-schedule-e.js';
import { SCHEDULE_D_FIELDS as D } from '@/pdf/fill-schedule-d.js';
import { fillForm8582, FORM_8582_FIELDS as P } from '@/pdf/fill-form-8582.js';
import { prepareScheduleEReview } from '@/pdf/schedule-e-review-context.js';
import { prepareCharitableReview } from '@/pdf/charitable-review-context.js';
import { prepareQbiLossReview } from '@/pdf/qbi-loss-review-context.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { charitableStatement } from '../fixtures/k1-charitable-return.js';
import { requireRiskSource } from '../fixtures/k1-charitable-at-risk.js';
import { k1PassiveCapitalFixture } from '../fixtures/k1-passive-capital.js';

function readPages(file: string): string[] {
    return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        'import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', file],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }));
}

it('prints ordinary and capital destinations with exact separate PartIX records', async () => {
    // Spec: K1 Passive Capital Sources, review-physical.
    const input = k1PassiveCapitalFixture('passive_activity', '0'), before = JSON.stringify(input), result = calculateFederalTax(input);
    const charitableReview = prepareCharitableReview(input), scheduleEReview = prepareScheduleEReview(input), qbiLossReview = prepareQbiLossReview(input);
    const redacted = redactReviewIdentifiers(input), dir = await mkdtemp(join(tmpdir(), 'capital-character-review-'));
    try {
        const directE = await fillScheduleE(redacted, result, 'forms/blank/2025/f1040se.pdf', scheduleEReview);
        expect(directE.getForm().getTextField(E.partCol_A_f).getText()).toBe('6667');
        await writeFile(join(dir, 'direct-e.pdf'), await directE.save());
        await fillReturn(redacted, result, { blankFormsDir: 'forms/blank/2025', outputDir: dir, charitableReview, scheduleEReview, qbiLossReview });
        const formD = (await PDFDocument.load(await readFile(join(dir, 'f1040sd-filled.pdf')))).getForm();
        expect(formD.getTextField(D.line16).getText()).toBe('6667');
        const formP = (await PDFDocument.load(await readFile(join(dir, 'f8582-filled.pdf')))).getForm();
        expect(formP.getTextField(P.line11).getText()).toBe('0');
        expect(formP.getTextField(P.part5.rows[0].b).getText()).toBe('50000');
        expect(formP.getTextField(P.part8.rows[0].name).getText() ?? '').toBe('');
        const pages = readPages(join(dir, 'f8582-filled.pdf'));
        const text = pages.join(' ').replace(/\s+/g, ' ');
        for (const value of ['Form 8582 Part IX', 'Ordinary: Schedule E', 'Short-term capital: Schedule D Part I',
            'Long-term capital: Schedule D Part II', 'Current deduction $40000', 'Current income $10000',
            'Allowed deduction $6666.666666666666667', 'Allowed deduction $3333.333333333333333']) expect(text).toContain(value);
        const appendix = readPages(join(dir, 'k1-charitable-reference-filled.pdf')).join(' ').replace(/\s+/g, ' ');
        for (const value of ['Original current short-term character: passive_activity', 'Original current long-term character: passive_activity',
            'Opening passive short-term loss: $0; long-term loss: $0', 'Ordinary passive loss allowed: $6666.666666666666667']) expect(appendix).toContain(value);
        for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
        for (const secret of ['123456789', '123-45-6789', 'Actual original short-term statement', 'Actual filed prior capital worksheet']) expect(text + appendix).not.toContain(secret);
        expect(JSON.stringify(input)).toBe(before);
    } finally { await rm(dir, { recursive: true, force: true }); }
});

it('rejects stale source character carry and worksheet audits before template access', async () => {
    // Spec: K1 Passive Capital Sources, review-binding.
    const input = k1PassiveCapitalFixture('passive_activity', '0'), result = calculateFederalTax(input);
    const scheduleE = prepareScheduleEReview(input), charitable = prepareCharitableReview(input);
    for (const change of [
        (x: typeof input) => { requireRiskSource(requireRiskSource(charitableStatement(x).capitalCharacter).currentShortTerm).character = 'portfolio'; },
        (x: typeof input) => { requireRiskSource(requireRiskSource(charitableStatement(x).capitalCharacter).priorPassiveCapital).sourceReference = 'Equal-money different original'; },
        (x: typeof input) => { delete x.k1CharitableSources; },
    ]) {
        const changed = structuredClone(input); change(changed);
        await expect(fillScheduleE(changed, result, 'missing.pdf', scheduleE)).rejects.toThrow(/source|stale|conflicting|original/i);
        await expect(fillForm8582(changed, result, 'missing.pdf', charitable)).rejects.toThrow(/source|stale|conflicting|original/i);
    }
    const carries = requireRiskSource(result.carryforwards.k1PassiveByCharacter).map(row => ({ ...row, ordinary: row.ordinary.plus('.01') }));
    const stale = { ...result, carryforwards: { ...result.carryforwards, k1PassiveByCharacter: carries } };
    await expect(fillScheduleE(input, stale, 'missing.pdf', scheduleE)).rejects.toThrow(/source|reconcile|calculation/i);
    const audit = { ...result, allLines: result.allLines.map(row => row.form === 'Form 8582 Part IX' ? { ...row, value: row.value.plus('.01') } : row) };
    await expect(fillScheduleE(input, audit, 'missing.pdf', scheduleE)).rejects.toThrow(/source|reconcile|calculation/i);
    await expect(fillScheduleE(input, result, 'missing.pdf', {} as typeof scheduleE)).rejects.toThrow(/context/i);
    const removed = structuredClone(input); delete removed.k1CharitableSources;
    await expect(fillScheduleE(removed, result, 'missing.pdf')).rejects.toThrow(/source|original/i);
});
