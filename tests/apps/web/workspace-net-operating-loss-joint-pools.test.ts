// Spec: net-operating-loss-joint-pools.yaml actual-workspace
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { guidedJointNolFixture } from '../../fixtures/guided-net-operating-loss-joint-pools';
vi.mock('server-only', () => ({}));

it('exports the actual joint source ledger and physical alternative tax adjustments', async () => {
  const state = guidedJointNolFixture(), before = JSON.stringify(state), workspace = createWorkspaceRecord('fictional-joint-nol');
  workspace.returnSummary.targetTaxYear = 2025;
  const result = await buildWorkspaceFilledReturnDownload(workspace, state), directory = await mkdtemp(join(tmpdir(), 'tax-joint-nol-workspace-'));
  let pages: string[];
  try {
    const file = join(directory, 'actual-workspace.pdf'); await writeFile(file, result.contents);
    pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      "import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", file],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 })) as string[];
  } finally { await rm(directory, { recursive: true, force: true }); }
  const text = pages.join(' ').replace(/\s+/g, ' ');
  for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
  for (const literal of ['Joint loss-year pool', 'incoming component 1', 'opening 35000', 'opening 50000', 'claimed 54800', 'remaining 30200', 'AMTI before ATNOLD 100000', 'Alternative NOL: claimed 20000']) expect(text).toContain(literal);
  for (const privateText of ['111-22-3333', '222-33-4444', 'jane-loss2021', 'alex-loss2021', 'Filed separate', 'Actual same-couple marital-year records']) expect(text).not.toContain(privateText);
  expect(JSON.stringify(state)).toBe(before);
  state.sectionData.adjustments!.netOperatingLossSources!.alternativeTax!.sameCoupleJointHistory!.sourceFactsConfirmed = false;
  await expect(buildWorkspaceFilledReturnDownload(workspace, state)).rejects.toThrow('Complete the required taxpayer facts before exporting.');
});
