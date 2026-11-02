// Spec: net-operating-loss-new-marriage.yaml private-review-binding.
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { guidedNewMarriageNolFixture } from '../../fixtures/guided-net-operating-loss-new-marriage';
vi.mock('server-only', () => ({}));
it('exports the source-complete new-marriage owner review without private records', async () => {
  const state = guidedNewMarriageNolFixture(), before = JSON.stringify(state), workspace = createWorkspaceRecord('fictional-new-marriage-nol');
  workspace.returnSummary.targetTaxYear = 2025;
  const result = await buildWorkspaceFilledReturnDownload(workspace, state), directory = await mkdtemp(join(tmpdir(), 'tax-new-marriage-nol-workspace-'));
  let pages: string[];
  try {
    const file = join(directory, 'actual-workspace.pdf'); await writeFile(file, result.contents);
    pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      "import sys,json;from pypdf import PdfReader;r=PdfReader(sys.argv[1],strict=True);print(json.dumps([p.extract_text() or '' for p in r.pages]))", file],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 })) as string[];
  } finally { await rm(directory, { recursive: true, force: true }); }
  const text = pages.join(' ').replace(/\s+/g, ' ');
  for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
  for (const literal of ['NEW MARRIAGE', 'claimed 24250', 'remaining 25750', 'AMTI before ATNOLD 100000', 'Alternative NOL: claimed 20000']) expect(text).toContain(literal);
  for (const secret of ['111-22-3333', '222-33-4444', 'premarital-regular2021', 'premarital-amt2021', 'Actual complete current owner income']) expect(text).not.toContain(secret);
  expect(JSON.stringify(state)).toBe(before);
  state.sectionData.adjustments!.netOperatingLossSources!.currentOwnerSources!.sourceFactsConfirmed = false;
  await expect(buildWorkspaceFilledReturnDownload(workspace, state)).rejects.toThrow('Complete the required taxpayer facts before exporting.');
});
