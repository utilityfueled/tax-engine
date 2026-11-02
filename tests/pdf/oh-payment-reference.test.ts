/** Spec: state/ohio-payments.yaml#pre-io */
import { it, expect } from 'vitest';
import { mkdtemp, access, rm, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { calculateFederalTax } from '@/engine/federal.js';
import { prepareOhioResidencyReview } from '@/engine/state/oh-residency-source.js';
import { fillOhioReferenceForms } from '@/pdf/mappings/2025/fill-oh-reference-forms.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { ohioPaymentFixture } from '../fixtures/oh-payments.js';
it('rejects stale payment originals before reference PDF I/O', async () => { const input = ohioPaymentFixture(), federal = calculateFederalTax(input), token = prepareOhioResidencyReview(input); input.ohioPayments.balanceFacts.sourceReference = 'Changed same-dollar actual receipt'; const dir = await mkdtemp(join(tmpdir(), 'oh-payments-pre-io-')); const output = join(dir, 'never-created'); try {
    await expect(fillOhioReferenceForms(redactReviewIdentifiers(input), federal, output, {}, token)).rejects.toThrow();
    await expect(access(output)).rejects.toThrow();
}
finally {
    await rm(dir, { recursive: true, force: true });
} });
it.each([['full_year_resident', '2323', '105', '2428'], ['part_year_resident', '929', '41', '970'], ['nonresident', '465', '0', '465']] as const)('saves current original-bound redacted payment reference %s', async (status, tax, penalty, due) => {
    const input = ohioPaymentFixture(status), federal = calculateFederalTax(input), token = prepareOhioResidencyReview(input);
    const dir = await mkdtemp(join(tmpdir(), 'oh-payments-current-'));
    try {
        const saved = await fillOhioReferenceForms(redactReviewIdentifiers(input), federal, dir, {}, token);
        const texts = saved.filledForms.map(file => execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `from pypdf import PdfReader
import sys,json
r=PdfReader(sys.argv[1],strict=True)
assert not r.get_fields()
for p in r.pages:
 for a in p.get('/Annots',[]):
  obj=a.get_object()
  assert obj is not None and obj.get('/Subtype')!='/Widget'
print(json.dumps({'pages':len(r.pages),'text':'\\n'.join(p.extract_text() or '' for p in r.pages)}))`, file], { encoding: 'utf8' }));
        for (let i = 0; i < texts.length; i++) {
            const reopened = JSON.parse(texts[i]!) as {
                pages: number;
                text: string;
            };
            expect(reopened.pages).toBeGreaterThan(0);
            expect(reopened.text).toContain('REFERENCE SUMMARY ONLY');
            expect(reopened.text).toContain('not an official filled Ohio filing form');
            expect(reopened.text).not.toContain(input.taxpayer.primary.ssn);
            expect(reopened.text).not.toContain(input.taxpayer.primary.ssn.replaceAll('-', ''));
            expect(reopened.text).not.toContain(input.ohioPayments.sourceReference);
            expect(reopened.text).not.toContain(input.ohioPayments.balanceFacts.sourceReference);
            expect((await readFile(saved.filledForms[i]!)).length).toBeGreaterThan(1000);
        }
        const payment = JSON.parse(texts[saved.filledForms.findIndex(file => file.endsWith('/oh-it-sd-2210-reference.pdf'))]!) as {
            text: string;
        };
        expect(payment.text).toContain('Expected remaining-tax payment');
        expect(payment.text).toContain('2026-04-15');
        expect(payment.text).toContain('calendar-endpoint');
        const summary = JSON.parse(texts[saved.filledForms.findIndex(file => file.endsWith('/oh-it-1040-reference.pdf'))]!) as {
            text: string;
        };
        expect(summary.text).toMatch(new RegExp('Line 10:[\\s\\S]*?Value: ' + tax + '(?:\\s|$)'));
        expect(summary.text).toMatch(new RegExp('Line 11:[\\s\\S]*?Value: ' + penalty + '(?:\\s|$)'));
        expect(summary.text).toMatch(new RegExp('Line 22:[\\s\\S]*?Value: ' + due + '(?:\\s|$)'));
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
