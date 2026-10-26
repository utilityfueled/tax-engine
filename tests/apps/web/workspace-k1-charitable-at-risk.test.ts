import { requireRiskSource } from '../../fixtures/k1-charitable-at-risk.js';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { guidedK1CharitableAtRiskState } from '../../fixtures/guided-k1-charitable-at-risk';
vi.mock('server-only', () => ({}));
it('exports source-confirmed guided activity allocation with distinct suspension records', async () => {
    const state = guidedK1CharitableAtRiskState(), before = JSON.stringify(state), workspace = createWorkspaceRecord('fictional-binding-risk');
    workspace.returnSummary.targetTaxYear = 2025;
    const result = await buildWorkspaceFilledReturnDownload(workspace, state);
    const outputDir = await mkdtemp(join(tmpdir(), 'tax-k1-charitable-risk-workspace-'));
    let pages: string[];
    try {
        const file = join(outputDir, 'actual-workspace.pdf');
        await writeFile(file, result.contents);
        // Read the completed file: waiting for pipe EOF can block the test
        // event loop before Vitest can enforce its existing deadline.
        pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
            "import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", file],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 })) as string[];
    } finally {
        await rm(outputDir, { recursive: true, force: true });
    }
    for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
    const text = pages.join(' ').replace(/\s+/g, ' ');
    for (const value of ['Ordinary amount after basis: $-40000', 'Ordinary amount after at risk: $-20000', 'Ordinary suspended at risk: $20000',
        'Available after basis: $10000', 'Basis suspended: $10000', 'Available for section170: $5000', 'At-risk suspended: $5000']) expect(text).toContain(value);
    for (const secret of ['111-22-3333', '111223333', 'original-gift-1', 'Fictional original activity membership attachment']) expect(text).not.toContain(secret);
    expect(JSON.stringify(state)).toBe(before);
    requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(state.sectionData.deductions).k1CharitableSources).statements)[0].atRisk).activityAllocation).sourceFactsConfirmed = false;
    await expect(buildWorkspaceFilledReturnDownload(workspace, state)).rejects.toThrow('Complete the required taxpayer facts before exporting.');
});
