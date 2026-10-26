// Spec: spec/federal/k1-charitable-return-sources.yaml.
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
import { fillForm8582 } from '@/pdf/fill-form-8582.js';
import { fillForm7206, FORM_7206_FIELDS } from '@/pdf/fill-form-7206.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { prepareCharitableReview, type PreparedCharitableReview } from '@/pdf/charitable-review-context.js';
import { prepareQbiLossReview } from '@/pdf/qbi-loss-review-context.js';
import { FORM_8995_FIELDS } from '@/pdf/fill-form-8995.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { d } from '@/utils/decimal.js';
import { k1CharitableReturnFixture, charitableStatement, k1CharitableQbiFixture } from '../fixtures/k1-charitable-return.js';
import { healthFacts } from '../fixtures/form7206.js';
function fixture() {
    const input = k1CharitableReturnFixture(), s = charitableStatement(input), k = input.scheduleK1[0];
    Object.assign(k, { entityType: 's_corporation', beginningBasis: '50', ordinaryIncome: '30', netLongTermCapitalGain: '-25', charitableCapitalGain30: '190',
        beginningDebtBasis: '0', additionalLoansToScorp: '0', priorDebtBasisReduction: '0', isPassiveActivity: true });
    s.basis!.entityType = 's_corporation';
    s.basis!.currentContributions![0].contributionShare = '190';
    s.basis!.currentContributions![0].adjustedBasisShare = '100';
    s.receipts![0].originalBox = '12';
    s.receipts![0].fairMarketValueShare = '190';
    k.form6198!.ordinaryIncome = '30';
    k.form6198!.gainLossFromDispositions = '-16';
    return input;
}
it('rejects changed sources and retained amounts before template access', async () => {
    const input = fixture(), result = calculateFederalTax(input), token = prepareCharitableReview(input);
    const renderers = [fillScheduleA, fillScheduleD, fillForm8582];
    for (const change of [
        (x: typeof input) => { charitableStatement(x).basis!.recipientTaxpayerIdLast4 = '0000'; },
        (x: typeof input) => { charitableStatement(x).receipts![0].sourceReference = 'Equal-money replacement'; },
        (x: typeof input) => { charitableStatement(x).atRisk!.priorYearAmountAtRisk = '20001'; },
        (x: typeof input) => { delete x.k1CharitableSources; },
    ]) {
        const changed = structuredClone(input);
        change(changed);
        for (const render of renderers)
            await expect(render(changed, result, 'missing.pdf', token)).rejects.toThrow(/charitable.*(identity|source|conflicting|stale)/i);
    }
    const redacted = redactReviewIdentifiers(input);
    for (const render of renderers) {
        await expect(render(redacted, result, 'missing.pdf')).rejects.toThrow(/K1 charitable.*identity/);
        await expect(render(redacted, result, 'missing.pdf', {} as PreparedCharitableReview)).rejects.toThrow(/original.*context/i);
        await expect(render(input, { ...result, agi: result.agi.plus('.01') }, 'missing.pdf', token)).rejects.toThrow(/calculation|retained/i);
        const changed = { ...result, allLines: result.allLines.map(row => row.form === 'K1 Charitable Return' ? { ...row, value: row.value.plus('.01') } : row) };
        await expect(render(input, changed, 'missing.pdf', token)).rejects.toThrow(/calculation|retained/i);
    }
    const changed = { ...result, scheduleE: { ...result.scheduleE!, partnerships: result.scheduleE!.partnerships.map(row => ({ ...row, basisResult: { ...row.basisResult!,
                    suspendedLossCarryforward: { ...row.basisResult!.suspendedLossCarryforward, charitable: d(0) } } })) } };
    await expect(fillReturn(redacted, changed, { charitableReview: token, blankFormsDir: 'missing', outputDir: 'missing' })).rejects.toThrow(/calculation|retained/i);
});
it('saves redacted original-source charity and capital amounts with separate basis balances', async () => {
    const input = fixture(), before = JSON.stringify(input), result = calculateFederalTax(input), token = prepareCharitableReview(input), dir = await mkdtemp(join(tmpdir(), 'k1-charity-review-'));
    try {
        const packet = await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), { charitableReview: token, blankFormsDir: 'forms/blank/2025', outputDir: dir, flatten: false });
        const path = (name: string) => { const p = packet.filledForms.find(value => value.endsWith(name)); if (!p)
            throw Error(`Missing ${name}`); return p; };
        const scheduleA = await PDFDocument.load(await readFile(path('/f1040sa-filled.pdf'))), scheduleD = await PDFDocument.load(await readFile(path('/f1040sd-filled.pdf')));
        expect(scheduleA.getForm().getTextField(A.line12).getText()).toBe('154');
        expect(scheduleA.getForm().getTextField(A.ssn).getText()).toBeUndefined();
        expect(scheduleD.getForm().getTextField(D.line15).getText()).toBe('(16)');
        expect(scheduleD.getForm().getTextField(D.ssn).getText()).toBeUndefined();
        const reference = path('/k1-charitable-reference-filled.pdf');
        const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
            'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', reference], { encoding: 'utf8', timeout: 10000 }));
        const text = pages.join(' ');
        expect(text).toContain('Available after basis: $154');
        expect(text).toContain('Basis suspended: $36');
        expect(text).toContain('Long-term capital amount after basis: $-16');
        expect(text).toContain('Schedule A candidate charitable amount: $154');
        expect(text).toContain('Selected deduction method: itemized');
        for (const secret of ['123456789', '6789', 'gift-1', 'Fictional original receipt', 'Fictional Public Charity'])
            expect(text).not.toContain(secret);
        for (const page of pages)
            expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
        expect(JSON.stringify(input)).toBe(before);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
it('reconciles health income from original K1 facts while rendering redacted identifiers', async () => {
    const original = k1CharitableReturnFixture();
    const input = TaxYearInputSchema.parse({ ...original, w2s: original.w2s.map(w2 => ({ ...w2, accountHolder: 'primary', socialSecurityTips: '0' })),
        scheduleC: { accountHolder: 'primary', businessName: 'Fictional design business', grossReceipts: '50000', qbiMateriallyParticipated: true }, form7206: healthFacts() });
    const r = calculateFederalTax(input), token = prepareCharitableReview(input), redacted = redactReviewIdentifiers(input);
    expect(r.form7206?.deductionToSchedule1.toFixed()).toBe('600');
    const doc = await fillForm7206(redacted, r, 'forms/blank/2025/f7206.pdf', 'scheduleC', 'primary', token);
    const reopened = await PDFDocument.load(await doc.save());
    expect(reopened.getForm().getTextField(FORM_7206_FIELDS.line14).getText()).toBe('600');
    expect(reopened.getForm().getTextField(FORM_7206_FIELDS.ssn).getText()).toBeUndefined();
    await expect(fillForm7206(redacted, r, 'missing.pdf', 'scheduleC', 'primary')).rejects.toThrow(/K1 charitable.*identity/);
    const stale = structuredClone(redacted);
    charitableStatement(stale).basis!.sourceReference = 'Replaced source';
    await expect(fillForm7206(stale, r, 'missing.pdf', 'scheduleC', 'primary', token)).rejects.toThrow(/source.*identity|stale|conflicting/);
});
it('preserves the closed future calculation and export gates', async () => {
    const future = k1CharitableReturnFixture(2026, true);
    expect(() => calculateFederalTax(future)).toThrow(/Tax year 2026 rule pack .* is incomplete; calculation is unavailable/);
    const r = calculateFederalTax(fixture());
    await expect(fillScheduleA(future, { ...r, taxYear: 2026 }, 'missing.pdf')).rejects.toThrow('No qualified review PDF mapping is available for tax year 2026.');
});
it('keeps separate charitable and QBI contexts in the saved packet', async () => {
    const input = k1CharitableQbiFixture(), before = JSON.stringify(input), r = calculateFederalTax(input), dir = await mkdtemp(join(tmpdir(), 'k1-charity-qbi-review-'));
    try {
        const packet = await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(r), { charitableReview: prepareCharitableReview(input), qbiLossReview: prepareQbiLossReview(input), blankFormsDir: 'forms/blank/2025', outputDir: dir, flatten: false });
        const aPath = packet.filledForms.find(path => path.endsWith('/f1040sa-filled.pdf')), qPath = packet.filledForms.find(path => path.endsWith('/f8995-filled.pdf'));
        if (!aPath || !qPath)
            throw Error('Missing original charitable or QBI physical form');
        const a = await PDFDocument.load(await readFile(aPath)), q = await PDFDocument.load(await readFile(qPath));
        expect(a.getForm().getTextField(A.line11).getText()).toBe('5000');
        expect(q.getForm().getTextField(FORM_8995_FIELDS.line16).getText()).toBe('5000');
        expect(a.getForm().getTextField(A.ssn).getText()).toBeUndefined();
        expect(q.getForm().getTextField(FORM_8995_FIELDS.ssn).getText()).toBeUndefined();
        for (const suffix of ['/k1-charitable-reference-filled.pdf', '/qbi-loss-reference-filled.pdf']) {
            const path = packet.filledForms.find(p => p.endsWith(suffix));
            if (!path)
                throw Error(`Missing ${suffix}`);
            const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', 'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', path], { encoding: 'utf8', timeout: 10000 }));
            for (const page of pages) {
                expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
                for (const secret of ['123456789', '6789', 'gift-1', 'Fictional original receipt'])
                    expect(page).not.toContain(secret);
            }
        }
        expect(r.carryforwards.charitableContributions.toFixed()).toBe('0');
        expect(JSON.stringify(input)).toBe(before);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
