// Spec: spec/federal/cod-ordinary-attribute-sources.yaml workspace.
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { guidedCodOrdinaryAttributesState } from '../../fixtures/guided-cod-ordinary-attributes';
vi.mock('server-only', () => ({}));
it('reopens the actual guided later attribute packet with independent source amounts', async () => {
  const state = guidedCodOrdinaryAttributesState(), before = structuredClone(state);
  const workspace = createWorkspaceRecord('synthetic-later-attributes'); workspace.returnSummary.targetTaxYear = 2025;
  const result = await buildWorkspaceFilledReturnDownload(workspace, state);
  const directory = await mkdtemp(join(tmpdir(), 'cod-attributes-workspace-'));
  try {
    const path = join(directory, 'actual-review.pdf'); await writeFile(path, result.contents);
    const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      "import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", path],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }));
    pages.forEach(page => expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2));
    const text = pages.join(' ').replace(/\s+/g, ' ');
    for (const literal of ['Regular immediately-after basis cap: 100', 'Regular unreduced excluded debt: 1400', '5400']) expect(text).toContain(literal);
    for (const secret of ['123-45-6789', '123456789', 'Original account-A', 'Original statement-A', 'Fictional furniture']) expect(text).not.toContain(secret);
    expect(text).toContain('Packet completeness status: partial.'); expect(state).toEqual(before);
    state.sectionData.adjustments!.codNolSources!.attributeSources!.sourceFactsConfirmed = null;
    await expect(buildWorkspaceFilledReturnDownload(workspace, state)).rejects.toThrow();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
