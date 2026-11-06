// Spec: spec/federal/form-172-operating-k1.yaml workspace-operating-review.
import { execFileSync } from '../../helpers/file-stdin-exec';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { guidedOperatingK1OriginState } from '../../fixtures/guided-form-172-operating-k1';
import { requireOperatingSource as required } from '../../fixtures/form-172-operating-k1';
vi.mock('server-only', () => ({}));
it('exports actual guided operating K1 origins and independent carry histories', async () => {
  const state = guidedOperatingK1OriginState(), before = JSON.stringify(state), workspace = createWorkspaceRecord('fictional-operating-k1');
  workspace.returnSummary.targetTaxYear = 2025;
  const result = await buildWorkspaceFilledReturnDownload(workspace, state);
  const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
    "import sys,json,io;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
    { input: result.contents, encoding: 'utf8' })) as string[];
  for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
  const text = pages.join(' ').replace(/\s+/g, ' ');
  for (const value of ['Current regular PartI loss 16000', 'Current alternative PartI loss 0', 'Operating K1 1 allowed ordinary business income: -40000',
    'Selected regular charitable deduction in nonbusiness group: 6000']) expect(text).toContain(value);
  for (const secret of ['111-22-3333', '111223333', 'Fictional actual operating business participation']) expect(text).not.toContain(secret);
  expect(JSON.stringify(state)).toBe(before);
  required(required(state.sectionData.adjustments).currentLossOrigin).sourceFactsConfirmed = false;
  await expect(buildWorkspaceFilledReturnDownload(workspace, state)).rejects.toThrow('Complete the required taxpayer facts before exporting.');
});
