import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { buildPartnerBasisScheduleReferenceSummary, fillPartnerBasisScheduleReference } from '@/pdf/fill-partner-basis-schedule.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
it('retains nondeductible debt reductions and actual carry status in the review record', async () => {
    const out = await mkdtemp(join(tmpdir(), 'tax-scorp-debt-review-'));
    try {
        for (const elected of [false, true]) {
            const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, scheduleK1: [{
                        partnershipName: 'Fictional Expense Corporation', partnershipEIN: '12-3456789', entityType: 's_corporation', accountHolder: 'primary',
                        ordinaryIncome: '-80', beginningBasis: '0', beginningDebtBasis: '100', additionalLoansToScorp: '0', priorDebtBasisReduction: '0',
                        nondeductibleExpenses: '50', election1367: elected,
                    }] });
            const original = JSON.stringify(input), result = calculateFederalTax(input);
            expect(result.scheduleE?.partnerships[0]?.basisAdjustedNetAmount.toString()).toBe(elected ? '-80' : '-50');
            const summary = buildPartnerBasisScheduleReferenceSummary(result);
            const lines = Object.fromEntries(summary.sections[0].lines.map(row => [row.line, row.value]));
            expect(lines['debt-nondeductible']).toBe(elected ? '20' : '50');
            expect(lines['nondeductible-unabsorbed']).toBe(elected ? '30' : '0');
            expect(lines['nondeductible-carry']).toBe(elected ? '30' : '0');
            expect(lines['total-allowed']).toBe(elected ? '80' : '50');
            expect(lines['debt-21']).toBe('0');
            const path = await fillPartnerBasisScheduleReference(result, join(out, elected ? 'elected' : 'default'));
            const reopened = await PDFDocument.load(await readFile(path));
            expect(reopened.getPageCount()).toBeGreaterThan(0);
            const text = execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
                'from pypdf import PdfReader; import sys; print("\\n".join(p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages))', path], { encoding: 'utf8' });
            expect(text).toContain('REFERENCE SUMMARY ONLY');
            expect(text).toContain('Nondeductible expenses applied to S-Corp debt basis');
            expect(text).toContain('S-Corp nondeductible carry under the actual election');
            expect(text).toContain(elected ? 'Reg. 1.1367-1(g) election carries the unabsorbed amount' : 'No election: unabsorbed nondeductible costs do not carry');
            expect(JSON.stringify(input)).toBe(original);
        }
    }
    finally {
        await rm(out, { recursive: true, force: true });
    }
});
