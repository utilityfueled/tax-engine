// Spec: spec/federal/form-172-charitable-closure.yaml workspace-originals.
import { execFileSync } from '../../helpers/file-stdin-exec';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { guidedCharitableClosureState } from '../../fixtures/guided-form-172-charitable-closure';
vi.mock('server-only', () => ({}));
it('exports actual original charitable current loss sources through the workspace', async () => {
  const state = guidedCharitableClosureState(), before = JSON.stringify(state), workspace = createWorkspaceRecord('fictional-closure');
  workspace.returnSummary.targetTaxYear = 2025;
  const packet = await buildWorkspaceFilledReturnDownload(workspace, state);
  const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
    "import sys,json,io;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
  { input: packet.contents, encoding: 'utf8' })) as string[];
  for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
  for (const literal of ['60000', '57000', 'Current regular PartI loss 13000']) expect(pages.join(' ')).toContain(literal);
  for (const secret of ['111-22-3333', '111223333', 'Fictional independent current-origin charity histories']) expect(pages.join(' ')).not.toContain(secret);
  expect(JSON.stringify(state)).toBe(before);
  const alternative = state.sectionData.adjustments?.netOperatingLossSources?.alternativeTax;
  if (!alternative) throw Error('Missing fictional independent history');
  alternative.charitableCarryoverHistory = undefined;
  await expect(buildWorkspaceFilledReturnDownload(workspace, state)).rejects.toThrow('Complete the required taxpayer facts before exporting.');
});
