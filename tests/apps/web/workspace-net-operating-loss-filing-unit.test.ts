// Spec: net-operating-loss-filing-unit-history.yaml actual-workspace
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { guidedChangedNolFixture } from '../../fixtures/guided-net-operating-loss-filing-unit';
vi.mock('server-only', () => ({}));

it('exports actual guided NOL owner histories with the original-bound review packet', async () => {
  const state = guidedChangedNolFixture(), before = JSON.stringify(state), workspace = createWorkspaceRecord('fictional-nol-owner-history');
  workspace.returnSummary.targetTaxYear = 2025;
  const result = await buildWorkspaceFilledReturnDownload(workspace, state);
  const directory = await mkdtemp(join(tmpdir(), 'tax-nol-owner-workspace-'));
  let pages: string[];
  try {
    const file = join(directory, 'actual-workspace.pdf'); await writeFile(file, result.contents);
    pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      "import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", file],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 })) as string[];
  } finally { await rm(directory, { recursive: true, force: true }); }
  const text = pages.join(' ').replace(/\s+/g, ' ');
  for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
  for (const literal of ['ACTUAL FILED OWNER HISTORY', 'Original owner allocation: 60000', 'Owner remaining after year: 48000', 'AMTI before ATNOLD 50000', 'deduction 27400', 'remaining 20600']) expect(text).toContain(literal);
  for (const secret of ['111-22-3333', '111223333', 'Alex Rowe', 'Riley Stone', 'Actual owner allocation', 'Actual complete filed membership records']) expect(text).not.toContain(secret);
  expect(text).not.toMatch(/\b(?:3333|4321|9988)\b/);
  expect(JSON.stringify(state)).toBe(before);
  state.sectionData.adjustments!.netOperatingLossSources!.alternativeTax!.filingUnitHistory!.sourceFactsConfirmed = false;
  await expect(buildWorkspaceFilledReturnDownload(workspace, state)).rejects.toThrow('Complete the required taxpayer facts before exporting.');
});
