// Spec: form-172-charitable-carried-composition.yaml actual-workspace.
import { execFileSync } from '../../helpers/file-stdin-exec';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { guidedCarriedCurrentCharitableHistories } from '../../fixtures/guided-form-172-charitable-carried-composition';
vi.mock('server-only', () => ({}));

it('exports the actual old and current charitable loss composition', async () => {
  const state = guidedCarriedCurrentCharitableHistories(), before = structuredClone(state);
  const workspace = createWorkspaceRecord('synthetic-carried-current-charity'); workspace.returnSummary.targetTaxYear = 2025;
  const result = await buildWorkspaceFilledReturnDownload(workspace, state);
  const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
    "import sys,json,io;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
  { input: result.contents, encoding: 'utf8' })) as string[];
  pages.forEach(page => expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2));
  const text = pages.join(' ').replace(/\s+/g, ' ');
  expect(text).toContain('Current regular PartI loss 14000'); expect(text).toContain('114000');
  expect(text).toContain('92350'); expect(text).toContain('7650'); expect(text).toContain('remaining 2000');
  for (const value of ['111-22-3333', '111223333', 'independent-old-amt2021', 'Original filed 2021 NOL worksheet']) expect(text).not.toContain(value);
  expect(state).toEqual(before);
});
