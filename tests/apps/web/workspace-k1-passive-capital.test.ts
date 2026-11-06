import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { guidedK1PassiveCapitalState } from '../../fixtures/guided-k1-passive-capital';
import { requireRiskSource } from '../../fixtures/k1-charitable-at-risk';
vi.mock('server-only', () => ({}));
it('exports actual guided capital records with separate ordinary and capital amounts', async () => {
    // Spec: K1 Passive Capital Sources, workspace-review.
    const state = guidedK1PassiveCapitalState('8000'), before = JSON.stringify(state), workspace = createWorkspaceRecord('fictional-passive-capital');
    workspace.returnSummary.targetTaxYear = 2025;
    const result = await buildWorkspaceFilledReturnDownload(workspace, state), dir = await mkdtemp(join(tmpdir(), 'passive-capital-workspace-'));
    try {
        const file = join(dir, 'completed.pdf'); await writeFile(file, result.contents);
        const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
            'import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', file],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }));
        for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
        const text = pages.join(' ').replace(/\s+/g, ' ');
        for (const value of ['Form 8582 Part IX', 'Opening passive short-term loss: $8000; long-term loss: $0',
            'Original current short-term character: passive_activity', 'Allowed deduction $8000',
            'Ordinary passive loss allowed: $1333.333333333333333']) expect(text).toContain(value);
        for (const secret of ['123456789', '123-45-6789', 'Actual original short-term statement', 'Actual filed prior capital worksheet']) expect(text).not.toContain(secret);
        expect(JSON.stringify(state)).toBe(before);
    } finally { await rm(dir, { recursive: true, force: true }); }
    requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(state.sectionData.deductions).k1CharitableSources).statements)[0].capitalCharacter).sourceFactsConfirmed = false;
    await expect(buildWorkspaceFilledReturnDownload(workspace, state)).rejects.toThrow('Complete the required taxpayer facts before exporting.');
});
