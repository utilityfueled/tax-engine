// Spec: spec/federal/charitable-filing-unit-history.yaml workspace-appendix.
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { guidedCharitableFilingUnitWorkspace } from '../../fixtures/guided-charitable-filing-unit';
vi.mock('server-only', () => ({}));
it('exports actual guided charitable filing history with the review packet', async () => {
  const state = guidedCharitableFilingUnitWorkspace(), before = JSON.stringify(state), workspace = createWorkspaceRecord('fictional-charitable-timeline');
  workspace.returnSummary.targetTaxYear = 2025;
  const result = await buildWorkspaceFilledReturnDownload(workspace, state);
  const directory = await mkdtemp(join(tmpdir(), 'tax-charitable-timeline-workspace-'));
  let pages: string[];
  try {
    const file = join(directory, 'actual-workspace.pdf'); await writeFile(file, result.contents);
    pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      "import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", file],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 })) as string[];
  } finally { await rm(directory, { recursive: true, force: true }); }
  const text = pages.join(' ').replace(/\s+/g, ' ');
  for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
  for (const value of ['Charitable filing-unit history', 'Original excess: $20000', 'Original separate excess: $12000', 'Current opening: 6000 / 1', 'Schedule A candidate charity: $6000']) expect(text).toContain(value);
  for (const secret of ['111-22-3333', '111223333', 'original-joint-property', 'Synthetic2023', 'Alex Roe']) expect(text).not.toContain(secret);
  expect(text).not.toMatch(/\b4321\b/);
  expect(JSON.stringify(state)).toBe(before);
  state.sectionData.deductions!.charitableCarryoverSources!.filingUnitHistory!.sourceFactsConfirmed = false;
  await expect(buildWorkspaceFilledReturnDownload(workspace, state)).rejects.toThrow('Complete the required taxpayer facts before exporting.');
});
