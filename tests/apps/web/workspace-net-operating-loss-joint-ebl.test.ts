// Spec: net-operating-loss-joint-ebl.yaml actual-workspace
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { guidedJointEblNolFixture } from '../../fixtures/guided-net-operating-loss-joint-ebl';
vi.mock('server-only', () => ({}));

it('exports separate original component and qualified carry results from actual guide data', async () => {
  const state = guidedJointEblNolFixture();
  Object.assign(state.sectionData.adjustments!.k1LossSources!.priorQbiCarry!, {
    lossCarryforward: '7000', sourceReference: 'Actual filed2024 Form8995 ordinary carry7000',
  });
  const before = JSON.stringify(state), workspace = createWorkspaceRecord('fictional-joint-ebl');
  workspace.returnSummary.targetTaxYear = 2025;
  const result = await buildWorkspaceFilledReturnDownload(workspace, state), directory = await mkdtemp(join(tmpdir(), 'tax-joint-ebl-workspace-'));
  let pages: string[];
  try {
    const file = join(directory, 'actual-workspace.pdf'); await writeFile(file, result.contents);
    pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      "import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", file],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 })) as string[];
  } finally { await rm(directory, { recursive: true, force: true }); }
  const text = pages.join(' ').replace(/\s+/g, ' ');
  for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
  for (const literal of ['Section 461 EBL', 'Ordinary NOL', 'claimed 50000', 'claimed 35000', 'Regular NOL: claimed 85000',
    'AMTI before ATNOLD 200000', 'Alternative NOL: claimed 20000', 'Ordinary QBI loss carryforward: $32000',
    'Actual opening ordinary QBI loss carry: $7000',
    'qualified current deduction: $25000', 'qualified remaining carry: $0']) expect(text).toContain(literal);
  for (const privateText of ['111-22-3333', '222-33-4444', 'jane-loss2021', 'alex-loss2021', 'Filed separate', 'Actual same-couple marital-year records']) expect(text).not.toContain(privateText);
  expect(JSON.stringify(state)).toBe(before);
  state.sectionData.adjustments!.k1LossSources!.excessBusinessLossHistories![0]!.sourceFactsConfirmed = false;
  await expect(buildWorkspaceFilledReturnDownload(workspace, state)).rejects.toThrow('Complete the required taxpayer facts before exporting.');
});
