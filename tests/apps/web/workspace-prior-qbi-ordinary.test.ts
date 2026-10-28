import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { guidedOrdinaryPriorQbiFixture } from '../../fixtures/guided-prior-qbi-ordinary';
vi.mock('server-only', () => ({}));

// Spec: qbi-prior-carry-sources.yaml actual-workspace
it('exports actual ordinary carry from the standalone guided source', async () => {
  const state = guidedOrdinaryPriorQbiFixture(), before = JSON.stringify(state), workspace = createWorkspaceRecord('fictional-ordinary-prior-qbi');
  workspace.returnSummary.targetTaxYear = 2025;
  const download = await buildWorkspaceFilledReturnDownload(workspace, state), directory = await mkdtemp(join(tmpdir(), 'tax-ordinary-prior-qbi-workspace-'));
  let pages: string[];
  try {
    const file = join(directory, 'actual-workspace.pdf'); await writeFile(file, download.contents);
    pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      "import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", file],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 })) as string[];
  } finally { await rm(directory, { recursive: true, force: true }); }
  const text = pages.join(' ').replace(/\s+/g, ' ');
  for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
  for (const value of ['Actual opening ordinary QBI loss carry: $7000', 'Ordinary QBI loss carryforward: $0',
    'Independent regular NOL source history was not supplied.', 'Active-character portion of the ordinary prior carry: unknown']) expect(text).toContain(value);
  expect(text).toContain('18600');
  for (const secret of ['111-22-3333', '222-33-4444', 'ordinary-filed-prior-return', state.sectionData.adjustments!.k1LossSources!.priorQbiCarry!.sourceReference!]) expect(text).not.toContain(secret);
  expect(JSON.stringify(state)).toBe(before); expect(state.sectionData.adjustments!.netOperatingLossSources).toBeUndefined();
  delete state.sectionData.adjustments!.k1LossSources!.priorQbiCarry;
  await expect(buildWorkspaceFilledReturnDownload(workspace, state)).rejects.toThrow('Complete the required taxpayer facts before exporting.');
});
