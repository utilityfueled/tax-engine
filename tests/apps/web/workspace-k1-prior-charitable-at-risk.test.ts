import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { guidedK1PriorRiskState } from '../../fixtures/guided-k1-prior-charitable-at-risk';
import { requireRiskSource } from '../../fixtures/k1-charitable-at-risk';
vi.mock('server-only', () => ({}));
it('exports actual guided prior histories with separate use and closing balances', async () => {
    // Spec: K1 Prior Charitable At Risk, workspace-review.
    const state = guidedK1PriorRiskState(), before = JSON.stringify(state), workspace = createWorkspaceRecord('fictional-prior-risk');
    workspace.returnSummary.targetTaxYear = 2025;
    const result = await buildWorkspaceFilledReturnDownload(workspace, state), dir = await mkdtemp(join(tmpdir(), 'prior-risk-workspace-'));
    try {
        const file = join(dir, 'completed.pdf'); await writeFile(file, result.contents);
        const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
            'import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', file],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }));
        for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
        const text = pages.join(' ').replace(/\s+/g, ' ');
        for (const value of ['Prior at-risk deduction 1: ordinary; suspension year 2022', 'Earlier at-risk use: $20000; opening suspension: $20000',
            'Allowed this year: $10000; closing at-risk suspension: $10000', 'Allowed this year: $5000; closing at-risk suspension: $5000',
            '465, origin 2022: suspended $10000; qualified $10000']) expect(text).toContain(value);
        for (const secret of ['123456789', '123-45-6789', 'prior-ordinary', 'old-cash']) expect(text).not.toContain(secret);
        expect(JSON.stringify(state)).toBe(before);
    } finally { await rm(dir, { recursive: true, force: true }); }
    requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(state.sectionData.deductions).k1CharitableSources).statements)[0].atRisk).priorLossHistory).characterSources).sourceFactsConfirmed = false;
    await expect(buildWorkspaceFilledReturnDownload(workspace, state)).rejects.toThrow('Complete the required taxpayer facts before exporting.');
});
