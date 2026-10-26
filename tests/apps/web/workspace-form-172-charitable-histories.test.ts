// Spec: form-172-charitable-histories.yaml workspace-review.
import { execFileSync } from 'node:child_process';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { guidedCurrentOriginCharitableHistories } from '../../fixtures/guided-form-172-charitable-histories';
vi.mock('server-only', () => ({}));

it('exports current loss with actual current and prior charitable histories', async () => {
  const state = guidedCurrentOriginCharitableHistories(), before = structuredClone(state);
  const workspace = createWorkspaceRecord('synthetic-current-charity-history'); workspace.returnSummary.targetTaxYear = 2025;
  const result = await buildWorkspaceFilledReturnDownload(workspace, state);
  const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
    "import sys,json,io;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
  { input: result.contents, encoding: 'utf8' })) as string[];
  pages.forEach(page => expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2));
  const text = pages.join(' ').replace(/\s+/g, ' ');
  expect(text).toContain('Current regular PartI loss 14000'); expect(text).toContain('remaining 2000');
  expect(text).toContain('Alternative charitable deduction in nonbusiness group: 1500');
  for (const value of ['111-22-3333', '111223333', 'synthetic-regular-2024', 'Synthetic independent AMT charitable worksheet']) expect(text).not.toContain(value);
  expect(state).toEqual(before);
});
