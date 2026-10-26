import { requireRiskSource } from '../fixtures/k1-charitable-at-risk.js';
import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument } from 'pdf-lib';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { fillScheduleA, SCHEDULE_A_FIELDS as A } from '@/pdf/fill-schedule-a.js';
import { fillScheduleD, SCHEDULE_D_FIELDS as D } from '@/pdf/fill-schedule-d.js';
import { fillScheduleE } from '@/pdf/fill-schedule-e.js';
import { prepareScheduleEReview, type PreparedScheduleEReview } from '@/pdf/schedule-e-review-context.js';
import { prepareCharitableReview, type PreparedCharitableReview } from '@/pdf/charitable-review-context.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { charitableStatement } from '../fixtures/k1-charitable-return.js';
import { k1CharitablePropertyRiskFixture } from '../fixtures/k1-charitable-at-risk.js';
it('saves separate original basis at-risk and section170 amounts with source binding', async () => {
    const input = k1CharitablePropertyRiskFixture(), before = JSON.stringify(input), result = calculateFederalTax(input), token = prepareCharitableReview(input), scheduleEReview = prepareScheduleEReview(input);
    for (const change of [
        (x: typeof input) => { requireRiskSource(requireRiskSource(charitableStatement(x).atRisk).activityAllocation).sourceReference = 'Equal-money source replacement'; },
        (x: typeof input) => { requireRiskSource(requireRiskSource(charitableStatement(x).atRisk).activityAllocation).charitableSourceIds = ['different-original']; },
        (x: typeof input) => { delete requireRiskSource(charitableStatement(x).atRisk).activityAllocation; },
    ]) {
        const changed = structuredClone(input); change(changed);
        await expect(fillScheduleD(changed, result, 'missing.pdf', token)).rejects.toThrow(/source|stale|conflicting/i);
        await expect(fillScheduleE(changed, result, 'missing.pdf', scheduleEReview)).rejects.toThrow(/source|stale|conflicting/i);
    }
    const without = structuredClone(input); delete without.k1CharitableSources;
    await expect(fillScheduleE(without, result, 'missing.pdf')).rejects.toThrow(/original.*(charitable|activity)/i);
    await expect(fillScheduleE(without, { ...result, allLines: [] }, 'missing.pdf')).rejects.toThrow(/original.*(charitable|activity)/i);
    await expect(fillScheduleE(without, { ...result, carryforwards: { ...result.carryforwards, k1AtRiskByCharacter: undefined } }, 'missing.pdf')).rejects.toThrow(/original.*(charitable|activity)/i);
    await expect(fillScheduleD(without, result, 'missing.pdf')).rejects.toThrow(/original.*charitable|charitable.*original/i);
    await expect(fillReturn(without, result, { blankFormsDir: 'missing', outputDir: 'missing' })).rejects.toThrow(/original.*charitable|charitable.*original/i);
    const changedCarry = { ...result, carryforwards: { ...result.carryforwards, k1AtRiskByCharacter: requireRiskSource(result.carryforwards.k1AtRiskByCharacter).map(row => ({ ...row, longTermCapital: row.longTermCapital.plus('.01') })) } };
    await expect(fillScheduleA(input, changedCarry, 'missing.pdf', token)).rejects.toThrow(/calculation|retained/i);
    await expect(fillScheduleE(input, changedCarry, 'missing.pdf', scheduleEReview)).rejects.toThrow(/calculation|retained/i);
    await expect(fillScheduleE(input, result, 'missing.pdf', {} as PreparedScheduleEReview)).rejects.toThrow(/original.*context/i);
    await expect(fillScheduleA(input, result, 'missing.pdf', {} as PreparedCharitableReview)).rejects.toThrow(/original.*context/i);
    const dir = await mkdtemp(join(tmpdir(), 'k1-charity-risk-review-'));
    try {
        const packet = await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), { charitableReview: token, scheduleEReview, blankFormsDir: 'forms/blank/2025', outputDir: dir, flatten: false });
        const path = (suffix: string) => { const found = packet.filledForms.find(value => value.endsWith(suffix)); if (!found) throw new Error(`Missing ${suffix}`); return found; };
        const a = await PDFDocument.load(await readFile(path('/f1040sa-filled.pdf'))), capital = await PDFDocument.load(await readFile(path('/f1040sd-filled.pdf')));
        expect(a.getForm().getTextField(A.line12).getText()).toBe('77'); expect(capital.getForm().getTextField(D.line15).getText()).toBe('(8)');
        const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', 'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', path('/k1-charitable-reference-filled.pdf')], { encoding: 'utf8', timeout: 10000 }));
        const text = pages.join(' ').replace(/\s+/g, ' ');
        for (const label of ['Available after basis: $154', 'Basis suspended: $36', 'At-risk suspended: $77', 'Available for section170: $77', 'Long-term capital amount after at risk: $-8', 'Long-term capital suspended at risk: $8']) expect(text).toContain(label);
        for (const page of pages) { expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2); for (const secret of ['123456789', '6789', 'gift-1', 'Fictional original receipt', 'Fictional item-by-item']) expect(page).not.toContain(secret); }
        expect(JSON.stringify(input)).toBe(before);
    } finally { await rm(dir, { recursive: true, force: true }); }
});
